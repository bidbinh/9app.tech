// Học sinh và lịch dạy tuần lặp lại
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import { requireTutor, notFound } from '../auth.js';
import { cleanText, cleanPhone, intIn, oneOf, bool, cleanDay, cleanMinute, randomCode, uuidParam, todayVN, addDays } from '../util.js';
import { balances } from '../ledger.js';
import { materialize, slotConflicts, conflictError, LESSON_SELECT, lessonJson, flagOverlaps } from '../schedule.js';
import { withIdem } from '../idem.js';

const FEE_MODELS = ['buoi', 'thang', 'goi'];

export function studentJson(r, bal) {
  return {
    id: r.id, code: r.code, name: r.name, grade: r.grade, subject: r.subject,
    parentName: r.parent_name, parentPhone: r.parent_phone, parentZalo: r.parent_zalo, note: r.note,
    feeModel: r.fee_model, feeAmount: r.fee_amount, packageSessions: r.package_sessions, active: r.active,
    ...(bal ? { total: bal.total, paid: bal.paid, balance: bal.balance, pkgLeft: r.fee_model === 'goi' || bal.pkgBought ? bal.pkgLeft : null, taught: bal.taught } : {}),
  };
}

function readStudent(b, cur) {
  const o = {};
  const has = (k) => b[k] !== undefined;
  if (!cur || has('name')) o.name = cleanText(b.name, { max: 60, min: 1, field: 'Tên học sinh' });
  if (has('grade')) o.grade = cleanText(b.grade, { max: 20, field: 'Lớp' });
  if (has('subject')) o.subject = cleanText(b.subject, { max: 60, field: 'Môn' });
  if (has('parentName')) o.parent_name = cleanText(b.parentName, { max: 60, field: 'Tên phụ huynh' });
  if (has('parentPhone')) o.parent_phone = cleanPhone(b.parentPhone, 'Số điện thoại phụ huynh');
  if (has('parentZalo')) o.parent_zalo = cleanPhone(b.parentZalo, 'Số Zalo');
  if (has('note')) o.note = cleanText(b.note, { max: 500, multiline: true, field: 'Ghi chú' });
  if (has('feeModel')) o.fee_model = oneOf(b.feeModel, FEE_MODELS, 'Cách tính học phí');
  if (has('feeAmount')) o.fee_amount = intIn(b.feeAmount, { min: 0, max: 100_000_000, field: 'Mức học phí' });
  if (has('packageSessions')) o.package_sessions = intIn(b.packageSessions, { min: 0, max: 200, field: 'Số buổi của gói' });
  const model = o.fee_model ?? cur?.fee_model ?? 'buoi';
  const pk = o.package_sessions ?? cur?.package_sessions ?? 0;
  if (model === 'goi' && pk < 1) throw new ApiError(400, 'invalid_input', 'Gói học cần ít nhất 1 buổi', { field: 'Số buổi của gói' });
  if (model !== 'goi' && has('packageSessions') === false && !cur) o.package_sessions = 0;
  return o;
}

async function ownStudent(q, tutorId, id, { lock = false } = {}) {
  const rows = await q(`SELECT * FROM students WHERE id=$1 AND tutor_id=$2${lock ? ' FOR UPDATE' : ''}`, [uuidParam(id), tutorId]);
  if (!rows.length) throw notFound('Không tìm thấy học sinh này');
  return rows[0];
}
export { ownStudent };

// Chấm dứt mọi lịch lặp còn hiệu lực của học sinh, xóa các buổi dự kiến chưa đến chưa ghi gì (dùng khi lưu trữ học sinh hoặc dừng lịch)
async function endSlots(c, tutorId, where, params) {
  const today = todayVN();
  await c.query(
    `DELETE FROM lessons WHERE tutor_id=$1 AND day >= $2 AND status='du_kien' AND slot_id IN (SELECT id FROM slots WHERE tutor_id=$1 AND ${where})
       AND day = slot_day AND topic='' AND homework='' AND comment='' AND private_note=''`, [tutorId, today, ...params]);
  await c.query(`UPDATE slots SET valid_to = LEAST(COALESCE(valid_to, $2::date), $2::date) WHERE tutor_id=$1 AND ${where}`, [tutorId, addDays(today, -1), ...params]);
}

export function studentRoutes(app) {
  app.route('GET', '/api/students', async (ctx) => {
    const t = requireTutor(ctx);
    const rows = await query('SELECT * FROM students WHERE tutor_id=$1 ORDER BY active DESC, lower(name), created_at', [t.id]);
    const bal = await balances(query, t.id);
    const today = todayVN();
    const next = await query(
      `SELECT DISTINCT ON (student_id) student_id, day, start_min FROM lessons WHERE tutor_id=$1 AND status='du_kien' AND day >= $2 ORDER BY student_id, day, start_min`, [t.id, today]);
    const nextBy = new Map(next.map((n) => [n.student_id, { day: n.day, startMin: n.start_min }]));
    const links = new Set((await query('SELECT student_id FROM share_links WHERE tutor_id=$1 AND revoked_at IS NULL', [t.id])).map((r) => r.student_id));
    return { students: rows.map((r) => ({ ...studentJson(r, bal.get(r.id)), next: nextBy.get(r.id) || null, hasLink: links.has(r.id) })) };
  });

  app.route('POST', '/api/students', withIdem(async (ctx) => {
    const t = requireTutor(ctx);
    const o = readStudent(ctx.body, null);
    return tx(async (c) => {
      await c.query('SELECT id FROM tutors WHERE id=$1 FOR UPDATE', [t.id]);
      const n = (await c.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE active)::int AS active FROM students WHERE tutor_id=$1`, [t.id]))[0];
      if (n.active >= config.maxActiveStudents) throw new ApiError(429, 'limit', `Tối đa ${config.maxActiveStudents} học sinh đang dạy. Hãy lưu trữ bớt học sinh đã nghỉ.`);
      if (n.total >= config.maxStudents) throw new ApiError(429, 'limit', `Đã đủ ${config.maxStudents} học sinh (kể cả đã lưu trữ). Hãy xóa bớt hồ sơ cũ.`);
      const cols = ['tutor_id', 'code']; const vals = [t.id, null];
      for (const [k, v] of Object.entries(o)) { cols.push(k); vals.push(v); }
      for (let attempt = 0; attempt < 6; attempt++) {
        vals[1] = randomCode(6);
        try {
          await c.query('SAVEPOINT sp');
          const row = (await c.query(`INSERT INTO students(${cols.join(',')}) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals))[0];
          return { student: studentJson(row, { total: 0, paid: 0, balance: 0, pkgLeft: 0, pkgBought: 0, taught: 0 }) };
        } catch (e) {
          await c.query('ROLLBACK TO SAVEPOINT sp');
          if (e.code !== '23505') throw e;
        }
      }
      throw new ApiError(500, 'internal', 'Không tạo được mã học sinh, thử lại');
    });
  }), { limit: 60 });

  app.route('GET', '/api/students/:id', async (ctx) => {
    const t = requireTutor(ctx);
    const st = await ownStudent(query, t.id, ctx.params.id);
    const today = todayVN();
    const bal = (await balances(query, t.id, [st.id])).get(st.id);
    const slots = await query(
      `SELECT * FROM slots WHERE student_id=$1 AND tutor_id=$2 AND (valid_to IS NULL OR valid_to >= $3) ORDER BY weekday, start_min`, [st.id, t.id, today]);
    await materialize(query, t.id, today, addDays(today, 28));
    const lessons = await query(
      `SELECT ${LESSON_SELECT} FROM lessons l JOIN students s ON s.id = l.student_id
        WHERE l.student_id=$1 AND l.tutor_id=$2 AND l.day BETWEEN $3 AND $4 ORDER BY l.day DESC, l.start_min DESC LIMIT 60`, [st.id, t.id, addDays(today, -90), addDays(today, 28)]);
    const charges = await query('SELECT id, kind, period, amount, sessions, on_date, note FROM charges WHERE student_id=$1 AND tutor_id=$2 ORDER BY on_date DESC, created_at DESC LIMIT 60', [st.id, t.id]);
    const payments = await query('SELECT id, amount, paid_on, method, note FROM payments WHERE student_id=$1 AND tutor_id=$2 ORDER BY paid_on DESC, created_at DESC LIMIT 60', [st.id, t.id]);
    const link = (await query('SELECT token, show_comments, show_fee, created_at, last_viewed_at, views FROM share_links WHERE student_id=$1 AND tutor_id=$2 AND revoked_at IS NULL', [st.id, t.id]))[0] || null;
    return {
      student: studentJson(st, bal),
      slots: slots.map((s) => ({ id: s.id, weekday: s.weekday, startMin: s.start_min, durationMin: s.duration_min, location: s.location, validFrom: s.valid_from })),
      lessons: flagOverlaps(lessons.map(lessonJson)),
      charges: charges.map((c) => ({ id: c.id, kind: c.kind, period: c.period, amount: c.amount, sessions: c.sessions, onDate: c.on_date, note: c.note })),
      payments: payments.map((p) => ({ id: p.id, amount: p.amount, paidOn: p.paid_on, method: p.method, note: p.note })),
      link: link && { token: link.token, showComments: link.show_comments, showFee: link.show_fee, createdAt: link.created_at, lastViewedAt: link.last_viewed_at, views: link.views },
    };
  });

  app.route('POST', '/api/students/:id', async (ctx) => {
    const t = requireTutor(ctx);
    return tx(async (c) => {
      const cur = await ownStudent(c.query, t.id, ctx.params.id, { lock: true });
      const o = readStudent(ctx.body, cur);
      const keys = Object.keys(o);
      if (keys.length) await c.query(`UPDATE students SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(', ')} WHERE id=$1 AND tutor_id=$2`, [cur.id, t.id, ...keys.map((k) => o[k])]);
      const row = await ownStudent(c.query, t.id, cur.id);
      // đổi tên/lớp/môn không đổi lịch; đổi mức phí chỉ ảnh hưởng buổi điểm danh sau này
      return { student: studentJson(row, (await balances(c.query, t.id, [cur.id])).get(cur.id)) };
    });
  }, { limit: 120 });

  app.route('POST', '/api/students/:id/archive', async (ctx) => {
    const t = requireTutor(ctx);
    const active = bool(ctx.body.active, 'active');
    return tx(async (c) => {
      await c.query('SELECT id FROM tutors WHERE id=$1 FOR UPDATE', [t.id]);
      const st = await ownStudent(c.query, t.id, ctx.params.id, { lock: true });
      if (active && !st.active) {
        const n = (await c.query('SELECT count(*)::int AS n FROM students WHERE tutor_id=$1 AND active', [t.id]))[0].n;
        if (n >= config.maxActiveStudents) throw new ApiError(429, 'limit', `Tối đa ${config.maxActiveStudents} học sinh đang dạy.`);
      }
      await c.query('UPDATE students SET active=$2 WHERE id=$1', [st.id, active]);
      if (!active) {
        // lịch lặp được giữ ở trạng thái tạm dừng (học sinh không còn hoạt động nên không sinh buổi); khôi phục thì chạy lại
        await c.query(`DELETE FROM lessons WHERE tutor_id=$1 AND student_id=$2 AND day >= $3 AND status='du_kien' AND slot_id IS NOT NULL AND day = slot_day AND topic='' AND homework='' AND comment='' AND private_note=''`, [t.id, st.id, todayVN()]);
        // link phụ huynh của học sinh đã nghỉ không còn hiệu lực
        await c.query('UPDATE share_links SET revoked_at=now() WHERE student_id=$1 AND revoked_at IS NULL', [st.id]);
      }
      return { ok: true };
    });
  });

  app.route('DELETE', '/api/students/:id', async (ctx) => {
    const t = requireTutor(ctx);
    const st = await ownStudent(query, t.id, ctx.params.id);
    await query('DELETE FROM students WHERE id=$1 AND tutor_id=$2', [st.id, t.id]);
    return { ok: true };
  });

  // ---- lịch lặp ----
  app.route('POST', '/api/students/:id/slots', async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const weekday = intIn(b.weekday, { min: 1, max: 7, field: 'Thứ' });
    const startMin = cleanMinute(b.startMin);
    const durationMin = intIn(b.durationMin, { min: 15, max: 480, field: 'Thời lượng (phút)' });
    if (startMin + durationMin > 1440) throw new ApiError(400, 'invalid_input', 'Buổi học không được kéo qua nửa đêm', { field: 'Thời lượng (phút)' });
    const location = cleanText(b.location, { max: 80, field: 'Nơi dạy' });
    const today = todayVN();
    const validFrom = b.validFrom === undefined ? today : cleanDay(b.validFrom, 'Bắt đầu từ ngày');
    if (validFrom < addDays(today, -60) || validFrom > addDays(today, 365)) throw new ApiError(400, 'invalid_input', 'Ngày bắt đầu phải trong khoảng 60 ngày trước đến 1 năm sau', { field: 'Bắt đầu từ ngày' });
    const allow = bool(b.allowOverlap, 'allowOverlap', false);
    return tx(async (c) => {
      await c.query('SELECT id FROM tutors WHERE id=$1 FOR UPDATE', [t.id]);
      const st = await ownStudent(c.query, t.id, ctx.params.id);
      if (!st.active) throw new ApiError(409, 'inactive', 'Học sinh này đã lưu trữ. Hãy khôi phục trước khi xếp lịch.');
      const n = (await c.query('SELECT count(*)::int AS n FROM slots WHERE tutor_id=$1 AND (valid_to IS NULL OR valid_to >= $2)', [t.id, today]))[0].n;
      if (n >= config.maxSlots) throw new ApiError(429, 'limit', `Tối đa ${config.maxSlots} lịch lặp.`);
      if (!allow) {
        const cf = await slotConflicts(c.query, t.id, { weekday, startMin, durationMin, validFrom });
        if (cf.length) throw conflictError(cf);
      }
      const slot = (await c.query(
        `INSERT INTO slots(tutor_id, student_id, weekday, start_min, duration_min, location, valid_from) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [t.id, st.id, weekday, startMin, durationMin, location, validFrom]))[0];
      await materialize(c.query, t.id, validFrom > today ? validFrom : today, addDays(validFrom > today ? validFrom : today, 56));
      if (validFrom < today) await materialize(c.query, t.id, validFrom, addDays(today, -1));
      return { slot: { id: slot.id, weekday, startMin, durationMin, location, validFrom } };
    });
  }, { limit: 60 });

  // Dừng một lịch lặp: các buổi từ hôm nay trở đi chưa ghi gì sẽ bị xóa, lịch sử giữ nguyên
  app.route('DELETE', '/api/slots/:id', async (ctx) => {
    const t = requireTutor(ctx);
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      const s = (await c.query('SELECT id FROM slots WHERE id=$1 AND tutor_id=$2 FOR UPDATE', [id, t.id]))[0];
      if (!s) throw notFound('Không tìm thấy lịch này');
      await endSlots(c, t.id, 'id=$3', [id]);
      return { ok: true };
    });
  });
}
