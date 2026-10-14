// Phía người tìm việc: xem, tìm, xem liên hệ (sau cảnh báo), gửi quan tâm, báo cáo.
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { ensureSession, consume, notFound } from '../auth.js';
import { KINDS, CATEGORIES, PAY_TYPES, SHIFTS, CITIES, REPORT_REASONS, APP_STATUS, keys } from '../meta.js';
import { cleanText, cleanMultiline, cleanPhone, uuidParam, todayVN, escapeHtml } from '../util.js';
import { publicJob, summaryJob, filterSql, stateOf, blockJob } from '../jobs.js';
import { raw, indexHtml, pageHeaders } from '../http.js';

const L = config.limits;
const tooMany = (msg) => new ApiError(429, 'too_many', msg);
const GRACE_DAYS = 30; // tin hết hạn/đóng còn xem được thêm 30 ngày (để người đã lưu biết tình trạng)

// Tin xem được công khai: không phải tin bị ẩn, và chưa quá cũ
const VISIBLE = `j.status IN ('dang','dong') AND j.expires_at > now() - interval '${GRACE_DAYS} days' AND (j.status = 'dang' OR j.closed_at > now() - interval '${GRACE_DAYS} days')`;

async function loadVisible(q, id) {
  const r = await q(`SELECT j.*, e.created_at AS employer_since FROM jobs j JOIN employers e ON e.id = j.employer_id WHERE j.id = $1 AND ${VISIBLE}`, [id]);
  return r[0] || null;
}

export function publicRoutes(app) {
  app.route('GET', '/api/meta', async () => ({
    kinds: KINDS, categories: CATEGORIES, payTypes: PAY_TYPES, shifts: SHIFTS, cities: CITIES, reportReasons: REPORT_REASONS, appStatus: APP_STATUS,
    maxDays: config.maxDays, defaultDays: config.defaultDays, retainDays: config.retainApplicationsDays,
  }));

  // ---------- danh sách ----------
  app.route('GET', '/api/jobs', async (ctx) => {
    const { conds, params, p } = filterSql(ctx.query);
    const before = Number.parseInt(ctx.query.before, 10);
    if (Number.isSafeInteger(before) && before > 0) conds.push(`j.seq < ${p(before)}`);
    const limit = Math.min(30, Math.max(1, Number.parseInt(ctx.query.limit, 10) || 20));
    const rows = await query(
      `SELECT j.*, e.created_at AS employer_since FROM jobs j JOIN employers e ON e.id = j.employer_id
        WHERE ${conds.join(' AND ')} ORDER BY j.seq DESC LIMIT ${limit + 1}`, params);
    const items = rows.slice(0, limit);
    const head = (await query("SELECT COALESCE(max(seq),0) AS m FROM jobs WHERE status = 'dang'"))[0].m;
    return { items: items.map(summaryJob), next: rows.length > limit ? items[items.length - 1].seq : null, head };
  }, { limit: 240, limitKey: 'jobs' });

  // báo tin mới theo bộ lọc: máy khách thăm dò định kỳ với `since` là seq đã xem
  app.route('GET', '/api/jobs/new', async (ctx) => {
    const { conds, params, p } = filterSql(ctx.query);
    const since = Number.parseInt(ctx.query.since, 10);
    conds.push(`j.seq > ${p(Number.isSafeInteger(since) && since >= 0 ? since : 0)}`);
    const r = (await query(`SELECT count(*)::int AS n, COALESCE(max(j.seq),0) AS latest FROM jobs j WHERE ${conds.join(' AND ')}`, params))[0];
    return { count: Math.min(r.n, 99), more: r.n > 99, latest: r.latest };
  }, { limit: 120, limitKey: 'jobsnew' });

  // tình trạng các tin đã lưu trên thiết bị
  app.route('POST', '/api/jobs/lookup', async (ctx) => {
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.slice(0, 50).filter((x) => typeof x === 'string').map((x) => x.toLowerCase()) : [];
    const valid = ids.filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x));
    if (!valid.length) return { items: [] };
    const rows = await query(`SELECT j.*, e.created_at AS employer_since FROM jobs j JOIN employers e ON e.id = j.employer_id WHERE j.id = ANY($1::uuid[]) AND ${VISIBLE}`, [valid]);
    return { items: rows.map(summaryJob) };
  }, { limit: 60, limitKey: 'lookup' });

  // ---------- trang chia sẻ có xem trước (Zalo, Facebook) ----------
  app.route('GET', '/j/:id', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const j = await loadVisible(query, id);
    let og = '';
    if (j && stateOf(j) === 'dang') {
      const title = `${j.title} - ${j.company}`;
      const desc = `${j.district}. ${j.description}`.replace(/\s+/g, ' ').slice(0, 160);
      og = `<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(desc)}"><meta property="og:type" content="website"><meta name="robots" content="noindex">`;
    }
    return raw(indexHtml(og), pageHeaders());
  }, { limit: 120, limitKey: 'share' });

  // ---------- chi tiết ----------
  app.route('GET', '/api/jobs/:id', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const j = await loadVisible(query, id);
    if (!j) throw notFound('Tin này không còn hiển thị (đã bị gỡ hoặc quá cũ)');
    let applied = false;
    if (ctx.sid) applied = (await query('SELECT 1 FROM applications WHERE job_id = $1 AND applicant_hash = $2', [id, ctx.sid])).length > 0;
    return { job: publicJob(j, { applied }) };
  });

  // ---------- xem liên hệ: chỉ sau khi xác nhận đã đọc cảnh báo ----------
  app.route('POST', '/api/jobs/:id/contact', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    if (ctx.body.ack !== true) throw new ApiError(400, 'ack_required', 'Hãy đọc cảnh báo an toàn và xác nhận trước khi xem thông tin liên hệ');
    const sid = ensureSession(ctx);
    const day = todayVN();
    return tx(async (c) => {
      const j = (await c.query('SELECT * FROM jobs WHERE id = $1', [id]))[0];
      if (!j || j.status === 'an') throw notFound('Tin này không còn hiển thị');
      if (stateOf(j) !== 'dang') throw new ApiError(409, 'closed', 'Tin này đã hết hạn hoặc đã đóng');
      if (!(await consume(c.query, `rv:s:${sid}:${day}`, L.revealPerSessionDay)) || !(await consume(c.query, `rv:ip:${ctx.ip}:${day}`, L.revealPerIpDay))) {
        throw tooMany('Bạn đã xem nhiều liên hệ hôm nay, thử lại vào ngày mai nhé');
      }
      await c.query('INSERT INTO reveals(job_id, viewer_hash) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, sid]);
      return { contact: { name: j.contact_name, phone: j.contact_phone, zaloUrl: 'https://zalo.me/' + j.contact_phone, address: j.address } };
    });
  }, { limit: 30, limitKey: 'contact' });

  // ---------- gửi quan tâm ----------
  app.route('POST', '/api/jobs/:id/apply', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const b = ctx.body;
    const name = cleanText(b.name, { max: 50, min: 2, field: 'Tên của bạn' });
    const phone = cleanPhone(b.phone, 'Số điện thoại hoặc Zalo của bạn');
    const message = cleanMultiline(b.message, { max: 300, field: 'Lời nhắn' });
    const startNow = b.startNow === true;
    const sid = ensureSession(ctx);
    const day = todayVN();
    return tx(async (c) => {
      const j = (await c.query('SELECT * FROM jobs WHERE id = $1 FOR UPDATE', [id]))[0];
      if (!j || j.status === 'an') throw notFound('Tin này không còn hiển thị');
      if (stateOf(j) !== 'dang') throw new ApiError(409, 'closed', 'Tin này đã hết hạn hoặc đã đóng, không nhận thêm hồ sơ');
      const own = await c.query('SELECT 1 FROM employers e WHERE e.id = $3 AND (e.user_id = $2::uuid OR EXISTS (SELECT 1 FROM phien p WHERE p.employer_id = e.id AND p.token_hash = $1))', [sid, ctx.userId || null, j.employer_id]);
      if (own.length) throw new ApiError(400, 'own_job', 'Đây là tin của bạn');
      if (!(await consume(c.query, `ap:s:${sid}:${day}`, L.applyPerSessionDay)) || !(await consume(c.query, `ap:ip:${ctx.ip}:${day}`, L.applyPerIpDay))) {
        throw tooMany('Bạn đã gửi nhiều hồ sơ hôm nay, mai gửi tiếp nhé');
      }
      // cùng số điện thoại gửi lại (từ phiên khác hoặc sau khi đổi trình duyệt): cập nhật hồ sơ cũ, không báo lỗi
      const again = await c.query(
        `UPDATE applications SET name = $3, message = $4, start_now = $5, updated_at = now(), seen_at = NULL, status = CASE WHEN status = 'loai' THEN status ELSE 'moi' END
          WHERE job_id = $1 AND phone = $2 AND applicant_hash <> $6 RETURNING id`, [id, phone, name, message, startNow, sid]);
      if (again.length) return { ok: true, updated: true };
      // trần tính hồ sơ chưa được xem
      const pending = (await c.query("SELECT count(*)::int AS n FROM applications WHERE job_id = $1 AND status = 'moi' AND seen_at IS NULL", [id]))[0].n;
      if (pending >= L.pendingAppsPerJob) throw new ApiError(409, 'full', 'Tin này đang nhận quá nhiều hồ sơ, hãy thử lại sau hoặc tìm tin khác');
      try {
        await c.query('INSERT INTO applications(job_id, applicant_hash, name, phone, message, start_now) VALUES($1,$2,$3,$4,$5,$6)', [id, sid, name, phone, message, startNow]);
      } catch (e) {
        if (e && e.code === '23505') throw new ApiError(409, 'already_applied', 'Bạn đã gửi quan tâm cho tin này rồi, nhà tuyển dụng sẽ liên hệ nếu phù hợp');
        throw e;
      }
      return { ok: true };
    });
  }, { limit: 20, limitKey: 'apply' });

  // ---------- rút hồ sơ đã gửi (xóa hẳn dữ liệu của mình) ----------
  app.route('POST', '/api/jobs/:id/withdraw', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    if (!ctx.sid) return { ok: true, removed: 0 };
    const r = await query('DELETE FROM applications WHERE job_id = $1 AND applicant_hash = $2 RETURNING id', [id, ctx.sid]);
    return { ok: true, removed: r.length };
  }, { limit: 20, limitKey: 'withdraw' });

  // ---------- báo cáo ----------
  app.route('POST', '/api/jobs/:id/report', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const reason = ctx.body.reason;
    if (typeof reason !== 'string' || !keys(REPORT_REASONS).includes(reason)) throw new ApiError(400, 'invalid_input', 'Hãy chọn lý do báo cáo', { field: 'Lý do' });
    const note = cleanText(ctx.body.note, { max: 200, field: 'Ghi chú' });
    const sid = ensureSession(ctx);
    const day = todayVN();
    return tx(async (c) => {
      const j = (await c.query('SELECT * FROM jobs WHERE id = $1 FOR UPDATE', [id]))[0];
      if (!j) throw notFound('Tin này không còn hiển thị');
      if (j.status === 'an') return { ok: true };
      if (!(await consume(c.query, `rp:ip:${ctx.ip}:${day}`, L.reportPerIpDay))) throw tooMany('Bạn đã báo cáo nhiều tin hôm nay');
      await c.query('INSERT INTO reports(job_id, reporter_hash, ip, reason, note) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [id, sid, ctx.ip, reason, note]);
      // chỉ tính báo cáo của người ngoài: không phải phiên của chính nhà tuyển dụng, không cùng IP lúc đăng tin; đếm theo IP khác nhau
      const n = (await c.query(
        `SELECT count(DISTINCT r.ip)::int AS n FROM reports r
          WHERE r.job_id = $1 AND r.ip <> COALESCE($2, '')
            AND NOT EXISTS (SELECT 1 FROM phien p WHERE p.token_hash = r.reporter_hash AND p.employer_id = $3)
            AND (EXISTS (SELECT 1 FROM reveals v WHERE v.job_id = r.job_id AND v.viewer_hash = r.reporter_hash)
              OR EXISTS (SELECT 1 FROM applications a WHERE a.job_id = r.job_id AND a.applicant_hash = r.reporter_hash))`, [id, j.created_ip, j.employer_id]))[0].n;
      if (n >= L.reportsToHide && j.status === 'dang') {
        await c.query("UPDATE jobs SET status = 'an', hidden_reason = 'bao_cao', updated_at = now() WHERE id = $1", [id]);
        await blockJob(c.query, j);
      }
      return { ok: true };
    });
  }, { limit: 20, limitKey: 'report' });
}
