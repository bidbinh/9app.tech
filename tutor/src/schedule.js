// Lịch dạy: sinh buổi từ lịch lặp, phát hiện trùng giờ, dạng JSON của buổi học
import { ApiError } from './errors.js';
import { config } from './config.js';
import { overlaps, hhmm, dm, isoWeekday } from './util.js';

export const LESSON_SELECT = `l.id, l.student_id, l.slot_id, l.slot_day, l.day, l.start_min, l.duration_min, l.location, l.status, l.billable, l.billing, l.fee,
  l.makeup_of, l.topic, l.homework, l.comment, l.rating, l.private_note, l.marked_at,
  s.name AS student_name, s.grade AS student_grade, s.subject AS student_subject, s.active AS student_active,
  EXISTS (SELECT 1 FROM lessons m WHERE m.makeup_of = l.id) AS has_makeup`;

export function lessonJson(r) {
  return {
    id: r.id, studentId: r.student_id, studentName: r.student_name, grade: r.student_grade, subject: r.student_subject,
    slotId: r.slot_id, day: r.day, startMin: r.start_min, durationMin: r.duration_min, location: r.location,
    status: r.status, billable: r.billable, billing: r.billing, fee: r.fee, makeupOf: r.makeup_of, hasMakeup: !!r.has_makeup,
    topic: r.topic, homework: r.homework, comment: r.comment, rating: r.rating, privateNote: r.private_note,
    moved: !!(r.slot_id && r.slot_day && r.slot_day !== r.day),
  };
}

// Gắn cờ overlap cho các buổi chưa hủy chồng giờ nhau trong cùng ngày
export function flagOverlaps(list) {
  const live = list.filter((l) => l.status === 'du_kien' || l.status === 'da_day');
  for (const a of live) {
    a.overlap = live.some((b) => b !== a && b.day === a.day && overlaps(a.startMin, a.durationMin, b.startMin, b.durationMin));
  }
  for (const l of list) if (l.overlap === undefined) l.overlap = false;
  return list;
}

// q: (sql, params) => rows. Sinh buổi cho mọi lịch lặp còn hiệu lực trong [from, to]; idempotent nhờ khóa duy nhất (slot_id, slot_day).
export async function materialize(q, tutorId, from, to) {
  const n = (await q('SELECT count(*)::int AS n FROM lessons WHERE tutor_id=$1', [tutorId]))[0].n;
  if (n >= config.maxLessons) return 0;
  const r = await q(
    `INSERT INTO lessons (tutor_id, student_id, slot_id, slot_day, day, start_min, duration_min, location)
     SELECT sl.tutor_id, sl.student_id, sl.id, d::date, d::date, sl.start_min, sl.duration_min, sl.location
       FROM slots sl JOIN students st ON st.id = sl.student_id AND st.active
      CROSS JOIN generate_series($2::date, $3::date, interval '1 day') d
      WHERE sl.tutor_id = $1 AND extract(isodow FROM d) = sl.weekday
        AND d::date >= sl.valid_from AND (sl.valid_to IS NULL OR d::date <= sl.valid_to)
     ON CONFLICT (slot_id, slot_day) WHERE slot_id IS NOT NULL DO NOTHING
     RETURNING id`, [tutorId, from, to]);
  return r.length;
}

const conflictJson = (r) => ({ kind: r.kind, studentName: r.student_name, day: r.day || null, weekday: r.weekday || null, startMin: r.start_min, durationMin: r.duration_min });

// Buổi chưa hủy cùng ngày chồng giờ. exclude: id buổi bỏ qua (khi dời buổi).
export async function lessonConflicts(q, tutorId, { day, startMin, durationMin, exclude = null }) {
  await materialize(q, tutorId, day, day);
  const rows = await q(
    `SELECT 'lesson' AS kind, l.day, l.start_min, l.duration_min, s.name AS student_name
       FROM lessons l JOIN students s ON s.id = l.student_id
      WHERE l.tutor_id = $1 AND l.day = $2 AND l.status IN ('du_kien','da_day')
        AND ($5::uuid IS NULL OR l.id <> $5::uuid)
        AND l.start_min < $3::int + $4::int AND $3::int < l.start_min + l.duration_min
      ORDER BY l.start_min LIMIT 5`, [tutorId, day, startMin, durationMin, exclude]);
  return rows.map(conflictJson);
}

// Lịch lặp mới: trùng với lịch lặp khác (cùng thứ, giờ chồng, hiệu lực chồng) hoặc buổi đã có trong 12 tuần tới
export async function slotConflicts(q, tutorId, { weekday, startMin, durationMin, validFrom, validTo = null, exclude = null }) {
  const a = await q(
    `SELECT 'slot' AS kind, sl.weekday, sl.start_min, sl.duration_min, s.name AS student_name
       FROM slots sl JOIN students s ON s.id = sl.student_id AND s.active
      WHERE sl.tutor_id = $1 AND sl.weekday = $2 AND ($6::uuid IS NULL OR sl.id <> $6::uuid)
        AND sl.start_min < $3::int + $4::int AND $3::int < sl.start_min + sl.duration_min
        AND COALESCE(sl.valid_to, 'infinity'::date) >= $5::date AND sl.valid_from <= COALESCE($7::date, 'infinity'::date)
      ORDER BY sl.start_min LIMIT 5`, [tutorId, weekday, startMin, durationMin, validFrom, exclude, validTo]);
  const b = await q(
    `SELECT 'lesson' AS kind, l.day, l.start_min, l.duration_min, s.name AS student_name
       FROM lessons l JOIN students s ON s.id = l.student_id
      WHERE l.tutor_id = $1 AND l.status IN ('du_kien','da_day') AND l.day >= $5::date AND l.day <= $5::date + 84
        AND extract(isodow FROM l.day) = $2 AND (l.slot_id IS NULL OR l.day <> l.slot_day)
        AND l.start_min < $3::int + $4::int AND $3::int < l.start_min + l.duration_min
      ORDER BY l.day LIMIT 5`, [tutorId, weekday, startMin, durationMin, validFrom]);
  return [...a, ...b].slice(0, 5).map(conflictJson);
}

export function conflictError(conflicts) {
  const first = conflicts[0];
  const when = first.day ? `${dm(first.day)} lúc ${hhmm(first.startMin)}` : `thứ ${first.weekday === 7 ? 'CN' : first.weekday + 1} lúc ${hhmm(first.startMin)}`;
  return new ApiError(409, 'schedule_conflict', `Trùng giờ với buổi của ${first.studentName} (${when}). Nếu dạy nhóm, bạn có thể xếp trùng có chủ ý.`, { conflicts });
}

export { isoWeekday };
