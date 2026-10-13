// Liên kết "Báo cáo cho phụ huynh" (công khai, chỉ xem, thu hồi được) và trang giới thiệu gia sư (tùy chọn)
import { ApiError } from '../errors.js';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { requireTutor, forbidden } from '../auth.js';
import { cleanText, optInt, oneOf, bool, newToken, TOKEN_RE, randomCode, todayVN, addDays, monthRange, addMonths, monthOf, escHtml } from '../util.js';
import { balances, BILLED } from '../ledger.js';
import { materialize } from '../schedule.js';
import { vietQrPayload, transferContent, qrSvg } from '../transfer.js';
import { bankName } from '../banks.js';
import { raw } from '../http.js';
import { ownStudent } from './students.js';

const PUBLIC_HEADERS = {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
};
const json = (body) => raw(JSON.stringify(body), PUBLIC_HEADERS);
const gone = () => new ApiError(404, 'not_found', 'Liên kết này không còn hiệu lực hoặc không tồn tại');

const linkJson = (l) => ({ token: l.token, showComments: l.show_comments, showFee: l.show_fee, createdAt: l.created_at, lastViewedAt: l.last_viewed_at, views: l.views });

async function activeLink(token) {
  if (!TOKEN_RE.test(String(token))) throw gone();
  const r = (await query(
    `SELECT l.id, l.show_comments, l.show_fee, l.student_id, l.tutor_id,
            s.name AS student_name, s.grade, s.subject, s.fee_model, s.fee_amount, s.code, s.active,
            t.name AS tutor_name, t.bank_bin, t.bank_account, t.bank_holder
       FROM share_links l JOIN students s ON s.id = l.student_id JOIN tutors t ON t.id = l.tutor_id
      WHERE l.token = $1 AND l.revoked_at IS NULL`, [token]))[0];
  if (!r || !r.active) throw gone();
  return r;
}

export function publicRoutes(app) {
  // ---- quản lý link (gia sư) ----
  app.route('POST', '/api/students/:id/link', async (ctx) => {
    const t = requireTutor(ctx);
    const showComments = bool(ctx.body.showComments, 'showComments', undefined === ctx.body.showComments ? true : undefined);
    const showFeeIn = ctx.body.showFee === undefined ? undefined : bool(ctx.body.showFee, 'showFee');
    const regenerate = bool(ctx.body.regenerate, 'regenerate', false);
    return tx(async (c) => {
      const st = await ownStudent(c.query, t.id, ctx.params.id, { lock: true });
      if (!st.active) throw new ApiError(409, 'inactive', 'Học sinh này đã lưu trữ.');
      const cur = (await c.query('SELECT * FROM share_links WHERE student_id=$1 AND revoked_at IS NULL', [st.id]))[0];
      if (cur && !regenerate) {
        const l = (await c.query('UPDATE share_links SET show_comments=$2, show_fee=$3 WHERE id=$1 RETURNING *', [cur.id, ctx.body.showComments === undefined ? cur.show_comments : showComments, showFeeIn === undefined ? cur.show_fee : showFeeIn]))[0];
        return { link: linkJson(l) };
      }
      if (cur) await c.query('UPDATE share_links SET revoked_at=now() WHERE id=$1', [cur.id]);
      const n = (await c.query('SELECT count(*)::int AS n FROM share_links WHERE tutor_id=$1 AND revoked_at IS NULL', [t.id]))[0].n;
      if (n >= config.maxShareLinks) throw new ApiError(429, 'limit', 'Quá nhiều liên kết đang hiệu lực');
      const l = (await c.query(
        'INSERT INTO share_links(tutor_id, student_id, token, show_comments, show_fee) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [t.id, st.id, newToken(16), ctx.body.showComments === undefined ? (cur ? cur.show_comments : true) : showComments, showFeeIn === undefined ? false : showFeeIn]))[0];
      return { link: linkJson(l) };
    });
  }, { limit: 60 });

  app.route('DELETE', '/api/students/:id/link', async (ctx) => {
    const t = requireTutor(ctx);
    const st = await ownStudent(query, t.id, ctx.params.id);
    await query('UPDATE share_links SET revoked_at=now() WHERE student_id=$1 AND revoked_at IS NULL', [st.id]);
    return { ok: true };
  });

  // ---- báo cáo công khai ----
  app.route('GET', '/api/r/:token', async (ctx) => {
    const l = await activeLink(ctx.params.token);
    const today = todayVN();
    query('UPDATE share_links SET views=views+1, last_viewed_at=now() WHERE id=$1', [l.id]).catch(() => {});
    await materialize(query, l.tutor_id, today, addDays(today, 14));
    const showC = l.show_comments;
    const recent = await query(
      `SELECT day, start_min, duration_min, status, billable, topic, homework, comment, rating, (makeup_of IS NOT NULL) AS is_makeup
         FROM lessons WHERE student_id=$1 AND day BETWEEN $2 AND $3 AND status IN ('da_day','hs_nghi','gs_huy') ORDER BY day DESC, start_min DESC LIMIT 120`, [l.student_id, addDays(today, -90), today]);
    const upcoming = await query(
      `SELECT day, start_min, duration_min, (makeup_of IS NOT NULL) AS is_makeup FROM lessons WHERE student_id=$1 AND status='du_kien' AND day BETWEEN $2 AND $3 ORDER BY day, start_min LIMIT 20`, [l.student_id, today, addDays(today, 14)]);
    const first = addMonths(monthOf(today), -5);
    const months = await query(
      `SELECT to_char(day,'YYYY-MM') AS month, count(*) FILTER (WHERE status='da_day')::int AS taught, count(*) FILTER (WHERE status='hs_nghi')::int AS absent, count(*) FILTER (WHERE status='gs_huy')::int AS cancelled
         FROM lessons WHERE student_id=$1 AND day BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1 DESC`, [l.student_id, monthRange(first).from, today]);
    const body = {
      tutor: { name: l.tutor_name },
      student: { name: l.student_name, grade: l.grade, subject: l.subject },
      today,
      upcoming: upcoming.map((r) => ({ day: r.day, startMin: r.start_min, durationMin: r.duration_min, makeup: r.is_makeup })),
      recent: recent.map((r) => ({
        day: r.day, startMin: r.start_min, durationMin: r.duration_min, status: r.status, makeup: r.is_makeup,
        ...(showC ? { topic: r.topic, homework: r.homework, comment: r.comment, rating: r.rating } : {}),
      })),
      months: months.map((m) => ({ month: m.month, taught: m.taught, absent: m.absent, cancelled: m.cancelled })),
      showComments: showC,
      fee: null,
    };
    if (l.show_fee) {
      const b = (await balances(query, l.tutor_id, [l.student_id])).get(l.student_id);
      body.fee = {
        model: l.fee_model, feeAmount: l.fee_amount, total: b.total, paid: b.paid, balance: b.balance, pkgLeft: l.fee_model === 'goi' ? b.pkgLeft : null,
        bank: l.bank_bin ? { name: bankName(l.bank_bin), account: l.bank_account, holder: l.bank_holder } : null,
        content: transferContent(l.code), qr: !!l.bank_bin && b.balance > 0,
      };
    }
    return json(body);
  }, { limit: 90, limitKey: 'pub-report' });

  app.route('GET', '/api/r/:token/qr.svg', async (ctx) => {
    const l = await activeLink(ctx.params.token);
    if (!l.show_fee || !l.bank_bin) throw gone();
    const b = (await balances(query, l.tutor_id, [l.student_id])).get(l.student_id);
    if (b.balance <= 0) throw gone();
    const svg = await qrSvg(vietQrPayload({ bin: l.bank_bin, account: l.bank_account, amount: b.balance, content: transferContent(l.code) }));
    return raw(svg, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' });
  }, { limit: 90, limitKey: 'pub-report' });

  // ---- trang giới thiệu gia sư ----
  const profileJson = (p) => ({
    enabled: p.enabled, code: p.code, headline: p.headline, bio: p.bio, subjects: p.subjects, levels: p.levels, area: p.area,
    priceFrom: p.price_from, priceTo: p.price_to, mode: p.mode, contact: p.contact,
  });
  app.route('GET', '/api/profile', async (ctx) => {
    const t = requireTutor(ctx);
    const p = (await query('SELECT * FROM profiles WHERE tutor_id=$1', [t.id]))[0];
    return { profile: p ? profileJson(p) : null, allowed: t.status !== 'giao_vien_cong' };
  });
  app.route('POST', '/api/profile', async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const enabled = bool(b.enabled, 'enabled');
    if (enabled && t.status === 'giao_vien_cong') throw forbidden('Giáo viên trường công lập không được tự quảng bá dạy thêm có thu tiền, nên 9tutor không mở trang giới thiệu công khai cho tình trạng này (Thông tư 29/2024/TT-BGDĐT). Nếu bạn khai sai, hãy đổi tình trạng trong Cài đặt.');
    const headline = cleanText(b.headline, { max: 80, field: 'Tiêu đề' });
    const bio = cleanText(b.bio, { max: 800, multiline: true, field: 'Giới thiệu' });
    const subjects = cleanText(b.subjects, { max: 120, field: 'Môn dạy' });
    const levels = cleanText(b.levels, { max: 80, field: 'Cấp lớp' });
    const area = cleanText(b.area, { max: 100, field: 'Khu vực' });
    const priceFrom = optInt(b.priceFrom, { min: 0, max: 100_000_000, field: 'Giá từ' });
    const priceTo = optInt(b.priceTo, { min: 0, max: 100_000_000, field: 'Giá đến' });
    if (priceFrom !== null && priceTo !== null && priceTo < priceFrom) throw new ApiError(400, 'invalid_input', 'Giá đến phải lớn hơn hoặc bằng giá từ', { field: 'Giá đến' });
    const mode = oneOf(b.mode ?? 'ca_hai', ['tai_nha', 'online', 'ca_hai'], 'Hình thức');
    const contact = cleanText(b.contact, { max: 60, field: 'Cách liên hệ' });
    if (enabled && (!headline || !subjects)) throw new ApiError(400, 'invalid_input', 'Hãy điền tiêu đề và môn dạy trước khi bật trang giới thiệu', { field: 'Tiêu đề' });
    const row = await tx(async (c) => {
      for (let i = 0; i < 6; i++) {
        try {
          await c.query('SAVEPOINT sp');
          return (await c.query(
            `INSERT INTO profiles(tutor_id, code, enabled, headline, bio, subjects, levels, area, price_from, price_to, mode, contact)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (tutor_id) DO UPDATE SET enabled=$3, headline=$4, bio=$5, subjects=$6, levels=$7, area=$8, price_from=$9, price_to=$10, mode=$11, contact=$12, updated_at=now()
             RETURNING *`, [t.id, randomCode(10), enabled, headline, bio, subjects, levels, area, priceFrom, priceTo, mode, contact]))[0];
        } catch (e) { await c.query('ROLLBACK TO SAVEPOINT sp'); if (e.code !== '23505') throw e; }
      }
      throw new ApiError(500, 'internal', 'Không tạo được mã trang, thử lại');
    });
    return { profile: profileJson(row) };
  }, { limit: 30 });

  // Tạo lại mã trang giới thiệu (mã cũ ngừng hoạt động ngay), dùng khi lỡ chia sẻ nhầm
  app.route('POST', '/api/profile/regenerate-code', async (ctx) => {
    const t = requireTutor(ctx);
    for (let i = 0; i < 6; i++) {
      try {
        const r = await query('UPDATE profiles SET code=$2, updated_at=now() WHERE tutor_id=$1 RETURNING *', [t.id, randomCode(10)]);
        if (!r.length) throw new ApiError(404, 'not_found', 'Bạn chưa lập trang giới thiệu');
        return { profile: profileJson(r[0]) };
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    throw new ApiError(500, 'internal', 'Không tạo được mã mới, thử lại');
  }, { limit: 10 });

  async function publicProfile(code) {
    if (!/^[A-HJ-NP-Z2-9]{10}$/.test(String(code))) throw gone();
    const p = (await query(
      `SELECT p.*, t.name FROM profiles p JOIN tutors t ON t.id = p.tutor_id WHERE p.code=$1 AND p.enabled AND t.status <> 'giao_vien_cong'`, [code]))[0];
    if (!p) throw gone();
    return p;
  }
  app.route('GET', '/api/g/:code', async (ctx) => {
    const p = await publicProfile(ctx.params.code);
    return json({ name: p.name, headline: p.headline, bio: p.bio, subjects: p.subjects, levels: p.levels, area: p.area, priceFrom: p.price_from, priceTo: p.price_to, mode: p.mode, contact: p.contact });
  }, { limit: 90, limitKey: 'pub-profile' });

  // Trang HTML cho /r/<mã> và /g/<mã>: tiêu đề chia sẻ (chỉ trang giới thiệu) và chống lập chỉ mục / lộ Referer
  app.setPageResolver(async (kind, token) => {
    const headers = { 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
    if (kind === 'r') return { headers, meta: '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">' };
    let meta = '<meta name="robots" content="noindex,nofollow">';
    try {
      const p = await publicProfile(token);
      const title = `${p.name} - gia sư ${p.subjects}`;
      meta += `<meta property="og:type" content="profile"><meta property="og:title" content="${escHtml(title)}"><meta property="og:description" content="${escHtml(p.headline)}"><meta name="description" content="${escHtml(p.headline)}">`;
    } catch { /* trang không tồn tại: giao diện tự báo */ }
    return { headers, meta };
  });
}
