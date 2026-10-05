// Buổi học: lịch tuần, thêm buổi lẻ / buổi bù, dời, điểm danh, nhật ký
import { ApiError } from '../errors.js';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { requireTutor, notFound } from '../auth.js';
import { cleanText, intIn, optInt, oneOf, bool, cleanDay, cleanMinute, uuidParam, todayVN, addDays, daysBetween, monthOf, monthRange } from '../util.js';
import { balances, feeFor, BILLED } from '../ledger.js';
import { materialize, lessonConflicts, conflictError, LESSON_SELECT, lessonJson, flagOverlaps } from '../schedule.js';
import { ownStudent } from './students.js';

const STATUSES = ['du_kien', 'da_day', 'hs_nghi', 'gs_huy'];

async function ownLesson(q, tutorId, id, { lock = false } = {}) {
  const rows = await q(`SELECT l.* FROM lessons l WHERE l.id=$1 AND l.tutor_id=$2${lock ? ' FOR UPDATE' : ''}`, [uuidParam(id), tutorId]);
  if (!rows.length) throw notFound('Không tìm thấy buổi học này');
  return rows[0];
}
async function lessonView(q, tutorId, id) {
  const r = (await q(`SELECT ${LESSON_SELECT} FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.id=$1 AND l.tutor_id=$2`, [id, tutorId]))[0];
  return lessonJson(r);
}
function timeInput(b) {
  const startMin = cleanMinute(b.startMin);
  const durationMin = intIn(b.durationMin, { min: 15, max: 480, field: 'Thời lượng (phút)' });
  if (startMin + durationMin > 1440) throw new ApiError(400, 'invalid_input', 'Buổi học không được kéo qua nửa đêm', { field: 'Thời lượng (phút)' });
  return { startMin, durationMin };
}

export function lessonRoutes(app) {
  app.route('GET', '/api/week', async (ctx) => {
    const t = requireTutor(ctx);
    const from = ctx.query.from ? cleanDay(ctx.query.from, 'Từ ngày') : todayVN();
    const days = ctx.query.days ? intIn(ctx.query.days, { min: 1, max: 42, field: 'Số ngày' }) : 7;
    const to = addDays(from, days - 1);
    await materialize(query, t.id, from, to);
    const rows = await query(
      `SELECT ${LESSON_SELECT} FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.tutor_id=$1 AND l.day BETWEEN $2 AND $3 ORDER BY l.day, l.start_min`, [t.id, from, to]);
    return { from, to, today: todayVN(), lessons: flagOverlaps(rows.map(lessonJson)) };
  });

  app.route('GET', '/api/today', async (ctx) => {
    const t = requireTutor(ctx);
    const today = todayVN();
    // sinh bù khoảng trống nếu lâu không mở app (tối đa 90 ngày về trước)
    await materialize(query, t.id, addDays(today, -90), addDays(today, 14));
    const todays = await query(
      `SELECT ${LESSON_SELECT} FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.tutor_id=$1 AND l.day=$2 ORDER BY l.start_min`, [t.id, today]);
    const od = ctx.query.od ? intIn(ctx.query.od, { min: 0, max: 100000, field: 'od' }) : 0;
    const overdueTotal = (await query(`SELECT count(*)::int AS n FROM lessons WHERE tutor_id=$1 AND day < $2 AND status='du_kien' AND student_id IN (SELECT id FROM students WHERE tutor_id=$1 AND active)`, [t.id, today]))[0].n;
    const overdue = await query(
      `SELECT ${LESSON_SELECT} FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.tutor_id=$1 AND l.day < $2 AND l.status='du_kien' AND s.active ORDER BY l.day DESC, l.start_min LIMIT 30 OFFSET $3`, [t.id, today, od]);
    const upcoming = await query(
      `SELECT ${LESSON_SELECT} FROM lessons l JOIN students s ON s.id=l.student_id WHERE l.tutor_id=$1 AND l.day > $2 AND l.day <= $3 AND l.status='du_kien' ORDER BY l.day, l.start_min LIMIT 6`, [t.id, today, addDays(today, 14)]);
    const bal = await balances(query, t.id);
    const students = await query('SELECT id, name, fee_model FROM students WHERE tutor_id=$1 AND active', [t.id]);
    let owed = 0; let debtors = 0; const lowPackages = [];
    for (const s of students) {
      const b = bal.get(s.id);
      if (b.balance > 0) { owed += b.balance; debtors += 1; }
      if (s.fee_model === 'goi' && b.pkgLeft <= 1) lowPackages.push({ studentId: s.id, name: s.name, left: b.pkgLeft });
    }
    const { from, to } = monthRange(monthOf(today));
    const m = (await query(
      `SELECT COALESCE((SELECT sum(amount) FROM payments WHERE tutor_id=$1 AND paid_on BETWEEN $2 AND $3),0)::bigint AS collected,
              (SELECT count(*) FROM lessons WHERE tutor_id=$1 AND status='da_day' AND day BETWEEN $2 AND $3)::int AS taught`, [t.id, from, to]))[0];
    return {
      today,
      lessons: flagOverlaps(todays.map(lessonJson)),
      overdue: overdue.map(lessonJson), overdueTotal, overdueOffset: od,
      upcoming: upcoming.map(lessonJson),
      stats: { month: monthOf(today), collected: m.collected, taught: m.taught, owed, debtors, students: students.length },
      lowPackages,
    };
  });

  app.route('GET', '/api/lessons/:id', async (ctx) => {
    const t = requireTutor(ctx);
    const l = await ownLesson(query, t.id, ctx.params.id);
    return { lesson: await lessonView(query, t.id, l.id) };
  });

  // Thêm buổi lẻ hoặc buổi bù (makeupOf = buổi gốc bị hủy hoặc học sinh nghỉ)
  app.route('POST', '/api/lessons', async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const day = cleanDay(b.day, 'Ngày dạy');
    const { startMin, durationMin } = timeInput(b);
    const location = cleanText(b.location, { max: 80, field: 'Nơi dạy' });
    const allow = bool(b.allowOverlap, 'allowOverlap', false);
    return tx(async (c) => {
      await c.query('SELECT id FROM tutors WHERE id=$1 FOR UPDATE', [t.id]);
      const n = (await c.query('SELECT count(*)::int AS n FROM lessons WHERE tutor_id=$1', [t.id]))[0].n;
      if (n >= config.maxLessons) throw new ApiError(429, 'limit', 'Đã đạt giới hạn số buổi học lưu trữ.');
      let studentId; let makeupOf = null; let warning = null;
      if (b.makeupOf) {
        const src = await ownLesson(c.query, t.id, b.makeupOf, { lock: true });
        if (src.status !== 'hs_nghi' && src.status !== 'gs_huy') throw new ApiError(409, 'invalid_state', 'Chỉ xếp buổi bù cho buổi đã hủy hoặc học sinh nghỉ');
        if (src.makeup_of) throw new ApiError(409, 'invalid_state', 'Buổi này đã là buổi bù, không xếp bù tiếp');
        studentId = src.student_id; makeupOf = src.id;
        if (src.status === 'hs_nghi' && src.billable) warning = 'Buổi nghỉ gốc đã tính học phí. Buổi bù cũng sẽ tính học phí khi bạn điểm danh "Đã dạy", nên phụ huynh có thể bị tính hai lần. Nếu không muốn, hãy chuyển buổi gốc sang "không tính".';
      } else {
        studentId = (await ownStudent(c.query, t.id, b.studentId)).id;
        const st = (await c.query('SELECT active FROM students WHERE id=$1', [studentId]))[0];
        if (!st.active) throw new ApiError(409, 'inactive', 'Học sinh này đã lưu trữ.');
      }
      if (!allow) {
        const cf = await lessonConflicts(c.query, t.id, { day, startMin, durationMin });
        if (cf.length) throw conflictError(cf);
      }
      let row;
      try {
        await c.query('SAVEPOINT sp');
        row = (await c.query(
          `INSERT INTO lessons(tutor_id, student_id, day, start_min, duration_min, location, makeup_of) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [t.id, studentId, day, startMin, durationMin, location, makeupOf]))[0];
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT sp');
        if (e.code === '23505') throw new ApiError(409, 'invalid_state', 'Buổi này đã có buổi bù rồi');
        throw e;
      }
      return { lesson: await lessonView(c.query, t.id, row.id), ...(warning ? { warning } : {}) };
    });
  }, { limit: 120 });

  // Điểm danh: da_day | hs_nghi | gs_huy | du_kien (bỏ điểm danh)
  app.route('POST', '/api/lessons/:id/mark', async (ctx) => {
    const t = requireTutor(ctx);
    const status = oneOf(ctx.body.status, STATUSES, 'Trạng thái');
    const feeOverride = optInt(ctx.body.fee, { min: 0, max: 100_000_000, field: 'Học phí buổi này' });
    return tx(async (c) => {
      const l = await ownLesson(c.query, t.id, ctx.params.id, { lock: true });
      const st = (await c.query('SELECT * FROM students WHERE id=$1', [l.student_id]))[0];
      if (status === 'da_day' && l.day > todayVN()) throw new ApiError(409, 'future', 'Chưa đến ngày dạy nên chưa điểm danh "đã dạy" được');
      let billing = ''; let fee = 0; let billable = true;
      if (status === 'da_day') ({ billing, fee } = feeFor(st, feeOverride));
      else if (status === 'hs_nghi') {
        billable = bool(ctx.body.billable, 'billable', false);
        if (billable) ({ billing, fee } = feeFor(st, feeOverride));
      } else if (status === 'gs_huy') billable = false;
      await c.query(
        `UPDATE lessons SET status=$2, billable=$3, billing=$4, fee=$5, marked_at=CASE WHEN $2='du_kien' THEN NULL ELSE now() END, updated_at=now() WHERE id=$1`,
        [l.id, status, billable, billing, fee]);
      const bal = (await balances(c.query, t.id, [l.student_id])).get(l.student_id);
      const feeIgnored = feeOverride !== null && (status === 'da_day' || (status === 'hs_nghi' && ctx.body.billable === true)) && st.fee_model !== 'buoi';
      return { lesson: await lessonView(c.query, t.id, l.id), ...(feeIgnored ? { warning: 'Học sinh tính học phí theo ' + (st.fee_model === 'thang' ? 'tháng' : 'gói') + ' nên học phí riêng cho buổi này không được áp dụng.' } : {}), balance: bal.balance, pkgLeft: st.fee_model === 'goi' || bal.pkgBought ? bal.pkgLeft : null };
    });
  }, { limit: 240 });

  app.route('POST', '/api/lessons/:id/log', async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const l = await ownLesson(query, t.id, ctx.params.id);
    const sets = []; const vals = [l.id];
    const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.topic !== undefined) add('topic', cleanText(b.topic, { max: 300, multiline: true, field: 'Nội dung buổi học' }));
    if (b.homework !== undefined) add('homework', cleanText(b.homework, { max: 300, multiline: true, field: 'Bài tập giao' }));
    if (b.comment !== undefined) add('comment', cleanText(b.comment, { max: 600, multiline: true, field: 'Nhận xét' }));
    if (b.privateNote !== undefined) add('private_note', cleanText(b.privateNote, { max: 600, multiline: true, field: 'Ghi chú riêng' }));
    if (b.rating !== undefined) add('rating', b.rating === null ? null : intIn(b.rating, { min: 1, max: 5, field: 'Mức tiếp thu' }));
    if (b.location !== undefined) add('location', cleanText(b.location, { max: 80, field: 'Nơi dạy' }));
    if (sets.length) await query(`UPDATE lessons SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, vals);
    return { lesson: await lessonView(query, t.id, l.id) };
  }, { limit: 240 });

  // Dời buổi chưa dạy sang ngày/giờ khác
  app.route('POST', '/api/lessons/:id/move', async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const day = cleanDay(b.day, 'Ngày dạy');
    const { startMin, durationMin } = timeInput(b);
    const allow = bool(b.allowOverlap, 'allowOverlap', false);
    return tx(async (c) => {
      await c.query('SELECT id FROM tutors WHERE id=$1 FOR UPDATE', [t.id]);
      const l = await ownLesson(c.query, t.id, ctx.params.id, { lock: true });
      if (l.status !== 'du_kien') throw new ApiError(409, 'invalid_state', 'Chỉ dời được buổi chưa dạy. Hãy bỏ điểm danh trước.');
      if (!allow) {
        const cf = await lessonConflicts(c.query, t.id, { day, startMin, durationMin, exclude: l.id });
        if (cf.length) throw conflictError(cf);
      }
      const loc = b.location === undefined ? l.location : cleanText(b.location, { max: 80, field: 'Nơi dạy' });
      await c.query('UPDATE lessons SET day=$2, start_min=$3, duration_min=$4, location=$5, updated_at=now() WHERE id=$1', [l.id, day, startMin, durationMin, loc]);
      return { lesson: await lessonView(c.query, t.id, l.id) };
    });
  }, { limit: 120 });

  // Xóa buổi lẻ. Buổi sinh từ lịch lặp thì hủy (không xóa) để không bị sinh lại; buổi đã tính phí phải bỏ điểm danh trước.
  app.route('DELETE', '/api/lessons/:id', async (ctx) => {
    const t = requireTutor(ctx);
    return tx(async (c) => {
      const l = await ownLesson(c.query, t.id, ctx.params.id, { lock: true });
      if (l.slot_id) throw new ApiError(409, 'invalid_state', 'Buổi thuộc lịch lặp: hãy chọn "Gia sư hủy" thay vì xóa.');
      if (l.status === 'da_day' || (l.status === 'hs_nghi' && l.billable)) throw new ApiError(409, 'invalid_state', 'Buổi đã tính học phí. Hãy bỏ điểm danh trước khi xóa.');
      await c.query('DELETE FROM lessons WHERE id=$1', [l.id]);
      return { ok: true };
    });
  });
}
