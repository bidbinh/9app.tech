// Học phí: khoản thu, đã thu, nhắc phụ huynh, QR VietQR, báo cáo thu nhập tháng
import { ApiError } from '../errors.js';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { requireTutor, notFound } from '../auth.js';
import { cleanText, intIn, optInt, oneOf, cleanDay, cleanMonth, uuidParam, todayVN, monthOf, monthRange, addMonths, intlPhone, dmy, vnd } from '../util.js';
import { balances, BILLED } from '../ledger.js';
import { withIdem } from '../idem.js';
import { vietQrPayload, transferContent, qrSvg, qrPng } from '../transfer.js';
import { raw } from '../http.js';
import { ownStudent } from './students.js';
import { bankName } from '../banks.js';

async function ledgerFull(q, tutorId) {
  const n = (await q('SELECT (SELECT count(*) FROM charges WHERE tutor_id=$1)::int + (SELECT count(*) FROM payments WHERE tutor_id=$1)::int AS n', [tutorId]))[0].n;
  if (n >= config.maxLedger) throw new ApiError(429, 'limit', 'Đã đạt giới hạn số khoản thu và khoản đã thu.');
}

export function reminderMessage(st, tutor, bal, content) {
  const who = st.parent_name ? `anh/chị ${st.parent_name}` : 'anh/chị';
  const lines = [`Chào ${who}. Mình xin gửi thông tin học phí của bé ${st.name}${st.subject ? ' (' + st.subject + ')' : ''}:`];
  lines.push(`- Tổng học phí đến nay: ${vnd(bal.total)}`);
  lines.push(`- Đã thu: ${vnd(bal.paid)}`);
  if (bal.balance > 0) lines.push(`- Còn lại: ${vnd(bal.balance)}`);
  else if (bal.balance < 0) lines.push(`- Anh/chị đang đóng trước: ${vnd(-bal.balance)}`);
  else lines.push('- Đã thanh toán đủ');
  if (bal.balance > 0 && tutor.bank_bin) {
    lines.push(`Anh/chị chuyển khoản giúp mình theo: ${bankName(tutor.bank_bin)}, STK ${tutor.bank_account}, chủ tài khoản ${tutor.bank_holder}, nội dung ${content}.`);
  }
  if (bal.balance > 0) lines.push('Cảm ơn anh/chị nhiều ạ!');
  else lines.push('Cảm ơn anh/chị đã đồng hành cùng bé ạ!');
  return lines.join('\n');
}

export function moneyRoutes(app) {
  // ---- đã thu ----
  app.route('POST', '/api/students/:id/payments', withIdem(async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const paidOn = b.paidOn === undefined ? todayVN() : cleanDay(b.paidOn, 'Ngày thu');
    const method = b.method === undefined ? 'ck' : oneOf(b.method, ['ck', 'tm'], 'Hình thức');
    const note = cleanText(b.note, { max: 120, field: 'Ghi chú' });
    const amountIn = optInt(b.amount, { min: 1, max: 1_000_000_000, field: 'Số tiền' });
    if (amountIn === null && b.full !== true) throw new ApiError(400, 'invalid_input', 'Hãy nhập số tiền đã thu', { field: 'Số tiền' });
    return tx(async (c) => {
      const st = await ownStudent(c.query, t.id, ctx.params.id, { lock: true });
      await ledgerFull(c.query, t.id);
      let amount = amountIn;
      if (b.full === true) {
        // "Thu đủ": máy chủ tự tính số còn nợ, không tin số từ trình duyệt
        const bal = (await balances(c.query, t.id, [st.id])).get(st.id);
        if (bal.balance <= 0) throw new ApiError(409, 'nothing_owed', 'Học sinh này không còn nợ học phí');
        amount = bal.balance;
      }
      if (amount > 1_000_000_000) throw new ApiError(400, 'invalid_input', 'Số tiền quá lớn', { field: 'Số tiền' });
      const p = (await c.query('INSERT INTO payments(tutor_id, student_id, amount, paid_on, method, note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, amount, paid_on, method, note', [t.id, st.id, amount, paidOn, method, note]))[0];
      const bal = (await balances(c.query, t.id, [st.id])).get(st.id);
      return { payment: { id: p.id, amount: p.amount, paidOn: p.paid_on, method: p.method, note: p.note }, balance: bal.balance };
    });
  }), { limit: 120 });

  app.route('DELETE', '/api/payments/:id', async (ctx) => {
    const t = requireTutor(ctx);
    const r = await query('DELETE FROM payments WHERE id=$1 AND tutor_id=$2 RETURNING student_id', [uuidParam(ctx.params.id), t.id]);
    if (!r.length) throw notFound('Không tìm thấy khoản này');
    return { ok: true };
  });

  // ---- khoản phải thu ----
  app.route('POST', '/api/students/:id/charges', withIdem(async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const kind = oneOf(b.kind, ['thang', 'goi', 'khac'], 'Loại khoản');
    const note = cleanText(b.note, { max: 120, field: 'Ghi chú', min: kind === 'khac' ? 1 : 0 });
    const onDate = b.onDate === undefined ? todayVN() : cleanDay(b.onDate, 'Ngày');
    return tx(async (c) => {
      const st = await ownStudent(c.query, t.id, ctx.params.id, { lock: true });
      await ledgerFull(c.query, t.id);
      let amount; let sessions = 0; let period = null;
      if (kind === 'thang') {
        period = b.period === undefined ? monthOf(todayVN()) : cleanMonth(b.period, 'Kỳ học phí');
        amount = optInt(b.amount, { min: 0, max: 1_000_000_000, field: 'Số tiền' }) ?? st.fee_amount;
      } else if (kind === 'goi') {
        sessions = optInt(b.sessions, { min: 1, max: 200, field: 'Số buổi' }) ?? st.package_sessions;
        if (!sessions) throw new ApiError(400, 'invalid_input', 'Hãy nhập số buổi của gói', { field: 'Số buổi' });
        amount = optInt(b.amount, { min: 0, max: 1_000_000_000, field: 'Số tiền' }) ?? st.fee_amount;
      } else {
        amount = intIn(b.amount, { min: 0, max: 1_000_000_000, field: 'Số tiền' });
      }
      try {
        await c.query('SAVEPOINT sp');
        const r = (await c.query('INSERT INTO charges(tutor_id, student_id, kind, period, amount, sessions, on_date, note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [t.id, st.id, kind, period, amount, sessions, onDate, note]))[0];
        const bal = (await balances(c.query, t.id, [st.id])).get(st.id);
        return { charge: { id: r.id, kind, period, amount, sessions, onDate, note }, balance: bal.balance };
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT sp');
        if (e.code === '23505') throw new ApiError(409, 'duplicate', `Đã có học phí tháng ${period.slice(5)}/${period.slice(0, 4)} của học sinh này rồi`);
        throw e;
      }
    });
  }), { limit: 120 });

  app.route('DELETE', '/api/charges/:id', async (ctx) => {
    const t = requireTutor(ctx);
    const r = await query('DELETE FROM charges WHERE id=$1 AND tutor_id=$2 RETURNING id', [uuidParam(ctx.params.id), t.id]);
    if (!r.length) throw notFound('Không tìm thấy khoản này');
    return { ok: true };
  });

  // Tạo học phí tháng cho mọi học sinh tính theo tháng chưa có khoản của kỳ này
  app.route('POST', '/api/billing/monthly', async (ctx) => {
    const t = requireTutor(ctx);
    const period = ctx.body.period === undefined ? monthOf(todayVN()) : cleanMonth(ctx.body.period, 'Kỳ học phí');
    return tx(async (c) => {
      await c.query('SELECT id FROM tutors WHERE id=$1 FOR UPDATE', [t.id]);
      await ledgerFull(c.query, t.id);
      const r = await c.query(
        `INSERT INTO charges(tutor_id, student_id, kind, period, amount, on_date, note)
         SELECT s.tutor_id, s.id, 'thang', $2, s.fee_amount, $3, '' FROM students s
          WHERE s.tutor_id=$1 AND s.active AND s.fee_model='thang' AND s.fee_amount > 0
         ON CONFLICT (student_id, period) WHERE kind = 'thang' DO NOTHING RETURNING id`, [t.id, period, todayVN()]);
      return { period, created: r.length };
    });
  }, { limit: 20 });

  // ---- nhắc phụ huynh ----
  app.route('GET', '/api/students/:id/reminder', async (ctx) => {
    const t = requireTutor(ctx);
    const st = await ownStudent(query, t.id, ctx.params.id);
    const bal = (await balances(query, t.id, [st.id])).get(st.id);
    const content = transferContent(st.code);
    const link = (await query('SELECT token FROM share_links WHERE student_id=$1 AND revoked_at IS NULL', [st.id]))[0];
    return {
      balance: bal.balance, content, hasBank: !!t.bank_bin,
      message: reminderMessage(st, t, bal, content),
      phone: st.parent_phone, zaloPhone: intlPhone(st.parent_zalo || st.parent_phone),
      reportToken: link ? link.token : null,
    };
  });

  const qrOf = async (ctx) => {
    const t = requireTutor(ctx);
    const st = await ownStudent(query, t.id, ctx.params.id);
    if (!t.bank_bin) throw new ApiError(409, 'no_bank', 'Bạn chưa lưu tài khoản nhận tiền (Cài đặt > Tài khoản nhận học phí)');
    let amount = null;
    if (ctx.query.amount !== undefined) amount = intIn(ctx.query.amount, { min: 1, max: 1_000_000_000, field: 'Số tiền' });
    else { const bal = (await balances(query, t.id, [st.id])).get(st.id); if (bal.balance > 0) amount = bal.balance; }
    return vietQrPayload({ bin: t.bank_bin, account: t.bank_account, amount, content: transferContent(st.code) });
  };
  app.route('GET', '/api/students/:id/qr.svg', async (ctx) => raw(await qrSvg(await qrOf(ctx)), { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' }));
  app.route('GET', '/api/students/:id/qr.png', async (ctx) => raw(await qrPng(await qrOf(ctx)), { 'content-type': 'image/png', 'cache-control': 'no-store', 'content-disposition': 'attachment; filename="qr-hoc-phi.png"' }));

  // ---- báo cáo thu nhập tháng ----
  app.route('GET', '/api/reports/month', async (ctx) => {
    const t = requireTutor(ctx);
    const month = ctx.query.month ? cleanMonth(ctx.query.month) : monthOf(todayVN());
    const { from, to } = monthRange(month);
    const rows = await query(
      `SELECT s.id, s.name, s.grade, s.subject, s.fee_model, s.active,
          COALESCE((SELECT sum(l.fee) FROM lessons l WHERE l.student_id=s.id AND ${BILLED} AND l.day BETWEEN $2 AND $3),0)::bigint AS lesson_fees,
          COALESCE((SELECT sum(c.amount) FROM charges c WHERE c.student_id=s.id AND c.on_date BETWEEN $2 AND $3),0)::bigint AS charged,
          COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.student_id=s.id AND p.paid_on BETWEEN $2 AND $3),0)::bigint AS collected,
          (SELECT count(*) FROM lessons l WHERE l.student_id=s.id AND l.status='da_day' AND l.day BETWEEN $2 AND $3)::int AS taught,
          COALESCE((SELECT sum(l.duration_min) FROM lessons l WHERE l.student_id=s.id AND l.status='da_day' AND l.day BETWEEN $2 AND $3),0)::int AS minutes,
          (SELECT count(*) FROM lessons l WHERE l.student_id=s.id AND l.status='hs_nghi' AND l.day BETWEEN $2 AND $3)::int AS absent,
          (SELECT count(*) FROM lessons l WHERE l.student_id=s.id AND l.status='gs_huy' AND l.day BETWEEN $2 AND $3)::int AS cancelled
         FROM students s WHERE s.tutor_id=$1 ORDER BY lower(s.name)`, [t.id, from, to]);
    const bal = await balances(query, t.id);
    const students = rows
      .filter((r) => r.lesson_fees || r.charged || r.collected || r.taught || r.absent || r.cancelled || (bal.get(r.id).balance > 0 && r.active))
      .map((r) => ({
        id: r.id, name: r.name, grade: r.grade, subject: r.subject, active: r.active,
        accrued: r.lesson_fees + r.charged, collected: r.collected, taught: r.taught, hours: Math.round((r.minutes / 60) * 10) / 10,
        absent: r.absent, cancelled: r.cancelled, balance: bal.get(r.id).balance,
      }));
    const sum = (k) => students.reduce((a, s) => a + s[k], 0);
    let owed = 0; for (const b of bal.values()) if (b.balance > 0) owed += b.balance;
    // xu hướng 6 tháng gần nhất kết thúc ở tháng đang xem
    const first = addMonths(month, -5);
    const fromTrend = monthRange(first).from;
    const acc = await query(
      `SELECT m, sum(v)::bigint AS v FROM (
         SELECT to_char(l.day,'YYYY-MM') AS m, l.fee AS v FROM lessons l WHERE l.tutor_id=$1 AND ${BILLED} AND l.day BETWEEN $2 AND $3
         UNION ALL SELECT to_char(on_date,'YYYY-MM'), amount FROM charges WHERE tutor_id=$1 AND on_date BETWEEN $2 AND $3) x GROUP BY m`, [t.id, fromTrend, to]);
    const col = await query(`SELECT to_char(paid_on,'YYYY-MM') AS m, sum(amount)::bigint AS v FROM payments WHERE tutor_id=$1 AND paid_on BETWEEN $2 AND $3 GROUP BY 1`, [t.id, fromTrend, to]);
    const accM = Object.fromEntries(acc.map((r) => [r.m, r.v])); const colM = Object.fromEntries(col.map((r) => [r.m, r.v]));
    const trend = [];
    for (let i = 0; i < 6; i++) { const m = addMonths(first, i); trend.push({ month: m, accrued: accM[m] || 0, collected: colM[m] || 0 }); }
    return {
      month, from, to, tutor: { name: t.name },
      totals: { accrued: sum('accrued'), collected: sum('collected'), taught: sum('taught'), hours: Math.round(sum('hours') * 10) / 10, absent: sum('absent'), cancelled: sum('cancelled'), owedNow: owed },
      students, trend,
    };
  });
}
