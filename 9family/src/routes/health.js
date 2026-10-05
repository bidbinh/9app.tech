// Sức khỏe gia đình: tăng trưởng của con (đối chiếu WHO), tiêm chủng, thuốc, huyết áp/đường huyết người lớn, hồ sơ khám.
// DỮ LIỆU NHẠY CẢM: quyền xem từng hồ sơ ở src/health/access.js; người không có quyền nhận 404; nội dung không bao giờ vào nhật ký hay thông báo.
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { clock } from '../clock.js';
import { dayOfMs, addDays } from '../vn.js';
import { cleanText, cleanNote, cleanDay, cleanTime, uuidParam, uuidList, bad } from '../util.js';
import { notifyMembers } from '../notify.js';
import { famRoutes } from './common.js';
import { accessLevel, atLeast, sections } from '../health/access.js';
import { analyze, ageMonths } from '../health/who.js';
import { scheduleFor, vaccineView, tcmr } from '../health/vaccines.js';
import { classify, EMERGENCY_TEXT, CONSULT_TEXT, DISCLAIMER } from '../health/thresholds.js';
import { healthRecipients, HEALTH_TITLE, HEALTH_BODY } from '../health/reminders.js';

const GROWTH = ['weight', 'height', 'head'];
const RANGE = { weight: [0.3, 400, 'Cân nặng (kg)'], height: [20, 260, 'Chiều cao (cm)'], head: [20, 70, 'Vòng đầu (cm)'] };
const MAX_MEASURES = 5000;

const num = (v, min, max, field) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw bad(field, `${field} phải từ ${min} đến ${max}`);
  return Math.round(n * 100) / 100;
};

export function ageText(birth, day) {
  if (!birth) return '';
  const m = Math.floor(ageMonths(birth, day));
  if (m < 0) return '';
  if (m < 1) return 'dưới 1 tháng';
  if (m < 24) return `${m} tháng`;
  const y = Math.floor(m / 12); const r = m % 12;
  return r ? `${y} tuổi ${r} tháng` : `${y} tuổi`;
}

export function healthRoutes(app) {
  const F = famRoutes(app);

  const today = () => dayOfMs(clock.now());

  // Hồ sơ + mức truy cập của người gọi. Không có quyền => 404 như không tồn tại.
  async function loadSubject(q, me, fid, sid, need) {
    const s = (await q(
      `SELECT s.*, c.name AS child_name, c.color, c.birth_year, c.linked_user_id, c.archived_at,
              m.name AS member_name, m.relation, m.external, m.left_at, (m.joined_at IS NOT NULL OR m.user_id IS NOT NULL) AS has_account
         FROM health_subjects s LEFT JOIN children c ON c.id = s.child_id LEFT JOIN members m ON m.id = s.member_id
        WHERE s.id=$1 AND s.family_id=$2`, [sid, fid]))[0];
    const level = s && !s.archived_at && !s.external && !s.left_at ? accessLevel(me, s) : null;
    if (!level) throw new ApiError(404, 'not_found', 'Không tìm thấy hồ sơ');
    if (need && !atLeast(level, need)) throw new ApiError(403, 'forbidden', need === 'manage' ? 'Bạn không có quyền thay đổi cài đặt hồ sơ này' : 'Bạn chỉ được xem hồ sơ này');
    return { s, level, sec: sections(level) };
  }

  async function ensureSubjects(fid) {
    await query(
      `INSERT INTO health_subjects(family_id, child_id) SELECT $1, c.id FROM children c WHERE c.family_id=$1 AND c.archived_at IS NULL
       ON CONFLICT (child_id) WHERE child_id IS NOT NULL DO NOTHING`, [fid]);
    await query(
      `INSERT INTO health_subjects(family_id, member_id) SELECT $1, m.id FROM members m WHERE m.family_id=$1 AND m.left_at IS NULL AND m.external=false AND m.role <> 'con'
       ON CONFLICT (member_id) WHERE member_id IS NOT NULL DO NOTHING`, [fid]);
  }

  const subjOut = (s, level, day) => ({
    id: s.id, kind: s.child_id ? 'child' : 'adult', childId: s.child_id, memberId: s.member_id,
    name: s.child_name || s.member_name, color: s.color || null, relation: s.relation || null,
    sex: s.sex, birthDate: s.birth_date, birthYear: s.birth_year || null, age: ageText(s.birth_date, day),
    level, hasAccount: s.child_id ? null : !!s.has_account,
  });

  // ---------- danh sách hồ sơ mình được thấy ----------
  F.get('/health', async (ctx, me, fid) => {
    await ensureSubjects(fid);
    const rows = await query(
      `SELECT s.*, c.name AS child_name, c.color, c.birth_year, c.linked_user_id, c.archived_at,
              m.name AS member_name, m.relation, m.external, m.left_at, (m.joined_at IS NOT NULL OR m.user_id IS NOT NULL) AS has_account
         FROM health_subjects s LEFT JOIN children c ON c.id = s.child_id LEFT JOIN members m ON m.id = s.member_id
        WHERE s.family_id=$1 ORDER BY (s.child_id IS NULL), c.created_at, m.created_at, s.created_at`, [fid]);
    const day = today();
    const vis = rows.map((s) => ({ s, level: !s.archived_at && !s.external && !s.left_at ? accessLevel(me, s) : null })).filter((x) => x.level);
    const ids = vis.map((x) => x.s.id);
    const last = ids.length ? await query(
      `SELECT DISTINCT ON (subject_id, kind) subject_id, kind, v1, v2, day FROM health_measures WHERE subject_id = ANY($1::uuid[]) ORDER BY subject_id, kind, day DESC, created_at DESC`, [ids]) : [];
    const vax = ids.length ? await query(
      `SELECT subject_id, min(due_date) AS due, count(*)::int AS n FROM health_vaccines WHERE subject_id = ANY($1::uuid[]) AND done_on IS NULL AND due_date IS NOT NULL GROUP BY subject_id`, [ids]) : [];
    const meds = ids.length ? await query(
      `SELECT m.subject_id, count(*)::int AS n,
              (SELECT count(*)::int FROM health_med_logs l WHERE l.day=$2 AND l.med_id IN (SELECT id FROM health_meds x WHERE x.subject_id=m.subject_id)) AS taken,
              sum(cardinality(m.times))::int AS slots
         FROM health_meds m WHERE m.subject_id = ANY($1::uuid[]) AND m.stopped_at IS NULL AND m.start_date <= $2 AND (m.end_date IS NULL OR m.end_date >= $2) GROUP BY m.subject_id`, [ids, day]) : [];
    return {
      subjects: vis.map(({ s, level }) => {
        const sec = sections(level);
        const o = subjOut(s, level, day);
        const mine = last.filter((r) => r.subject_id === s.id);
        o.last = {};
        for (const r of mine) if ((GROWTH.includes(r.kind) && sec.growth) || (!GROWTH.includes(r.kind) && sec.vitals) || (r.kind === 'weight' && sec.growth)) o.last[r.kind] = { v1: Number(r.v1), v2: r.v2 === null ? null : Number(r.v2), day: r.day };
        const v = vax.find((r) => r.subject_id === s.id);
        o.nextVaccine = sec.vaccines && v ? { due: v.due, pending: v.n } : null;
        const md = meds.find((r) => r.subject_id === s.id);
        o.meds = sec.meds && md ? { active: md.n, slots: md.slots, taken: md.taken } : null;
        return o;
      }),
      today: day, now: clock.now(),
      notes: { disclaimer: 'Thông tin chỉ để tham khảo, không thay thế tư vấn của bác sĩ.', emergency: EMERGENCY_TEXT },
    };
  }, { con: true });

  // ---------- chi tiết một hồ sơ ----------
  F.get('/health/:sid', async (ctx, me, fid) => {
    const { s, level, sec } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid));
    const day = today();
    const out = { subject: subjOut(s, level, day), sections: sec, today: day };
    const ms = await query('SELECT * FROM health_measures WHERE subject_id=$1 ORDER BY day, created_at LIMIT $2', [s.id, MAX_MEASURES]);
    const visible = ms.filter((m) => (GROWTH.includes(m.kind) ? sec.growth : sec.vitals));
    out.measures = visible.map((m) => {
      const c = classify(m);
      return { id: m.id, kind: m.kind, day: m.day, v1: Number(m.v1), v2: m.v2 === null ? null : Number(m.v2), v3: m.v3 === null ? null : Number(m.v3), ctx: m.ctx, note: sec.notes ? m.note : '', check: c.level === 'ok' && !c.label ? null : c };
    });
    if (s.child_id && sec.growth) {
      out.growth = analyze({ sex: s.sex, birthDate: s.birth_date, measures: ms.filter((m) => GROWTH.includes(m.kind)), today: day });
      if (!s.sex || !s.birth_date) out.growth = { ready: false, reason: 'Cần giới tính và ngày sinh của bé để đối chiếu chuẩn WHO.', needProfile: true };
    }
    if (sec.vaccines && s.child_id) {
      const vs = await query('SELECT * FROM health_vaccines WHERE subject_id=$1', [s.id]);
      out.vaccines = vaccineView(vs, day);
      out.vaccineInfo = { source: tcmr().legal, verification: tcmr().verification, note: tcmr().note, suggestions: tcmr().customSuggestions };
    }
    if (sec.meds) {
      const ms2 = await query('SELECT * FROM health_meds WHERE subject_id=$1 ORDER BY (stopped_at IS NOT NULL), created_at', [s.id]);
      const logs = ms2.length ? await query('SELECT med_id, day, time, taken_by FROM health_med_logs WHERE med_id = ANY($1::uuid[]) AND day >= $2', [ms2.map((m) => m.id), addDays(day, -1)]) : [];
      out.meds = ms2.map((m) => {
        const active = !m.stopped_at && m.start_date <= day && (!m.end_date || m.end_date >= day);
        const perDay = m.times.length || 1;
        return {
          id: m.id, name: m.name, dose: m.dose, times: m.times, startDate: m.start_date, endDate: m.end_date, stock: m.stock, remind: m.remind, note: sec.notes ? m.note : '',
          stopped: !!m.stopped_at, active, lowStock: m.stock !== null && m.stock <= perDay * 2 && active,
          taken: logs.filter((l) => l.med_id === m.id).map((l) => ({ day: l.day, time: l.time })),
        };
      });
    }
    if (sec.visits) {
      const vs = await query('SELECT * FROM health_visits WHERE subject_id=$1 ORDER BY day DESC, created_at DESC', [s.id]);
      out.visits = vs.map((v) => ({ id: v.id, day: v.day, place: v.place, doctor: v.doctor, reason: v.reason, conclusion: v.conclusion, prescription: v.prescription, recheckDate: v.recheck_date, inCalendar: !!v.event_id }));
    }
    if (sec.manage) {
      const mem = await query("SELECT id, name, role FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL AND role <> 'con' AND id <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000') ORDER BY created_at", [fid, s.member_id]);
      out.share = { sharedWith: s.shared_with, candidates: mem.map((m) => ({ id: m.id, name: m.name })), mode: s.child_id ? 'phu_trach' : 'chia_se' };
    }
    out.notes = { disclaimer: 'Thông tin chỉ để tham khảo, không thay thế tư vấn của bác sĩ.', emergency: EMERGENCY_TEXT, consult: CONSULT_TEXT, thresholds: DISCLAIMER, noPhotos: 'Lần này app chưa lưu ảnh (đơn thuốc, kết quả khám). Hãy ghi ngắn gọn vào ô ghi chú.' };
    return out;
  }, { con: true });

  // ---------- hồ sơ: giới tính, ngày sinh, chia sẻ ----------
  F.post('/health/:sid/profile', async (ctx, me, fid) => {
    const b = ctx.body;
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'manage');
    const sets = []; const vals = [s.id];
    const add = (col, v, cast = '') => { vals.push(v); sets.push(`${col}=$${vals.length}${cast}`); };
    if (b.sex !== undefined) { if (b.sex !== null && !['nam', 'nu'].includes(b.sex)) throw bad('Giới tính'); add('sex', b.sex); }
    if (b.birthDate !== undefined) {
      const d = b.birthDate === null || b.birthDate === '' ? null : cleanDay(b.birthDate, 'Ngày sinh');
      if (d && (d > today() || d < '1900-01-01')) throw bad('Ngày sinh', 'Ngày sinh không hợp lệ');
      add('birth_date', d);
    }
    if (b.sharedWith !== undefined) {
      const ids = uuidList(b.sharedWith, { max: 30, field: 'Danh sách chia sẻ' });
      const ok = ids.length ? (await query("SELECT id FROM members WHERE id = ANY($1::uuid[]) AND family_id=$2 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL AND role <> 'con' AND id <> COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')", [ids, fid, s.member_id])).map((r) => r.id) : [];
      if (ok.length !== ids.length) throw bad('Danh sách chia sẻ', 'Có người không thuộc gia đình');
      add('shared_with', ids, '::uuid[]');
    }
    if (sets.length) await query(`UPDATE health_subjects SET ${sets.join(', ')} WHERE id=$1`, vals);
    return { ok: true };
  });

  // ---------- số đo ----------
  F.post('/health/:sid/measures', async (ctx, me, fid) => {
    const b = ctx.body;
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const kind = String(b.kind || '');
    const allowed = s.child_id ? GROWTH : ['weight', 'height', 'bp', 'glucose'];
    if (!allowed.includes(kind)) throw bad('Loại số đo', 'Loại số đo này không dùng cho hồ sơ này');
    const day = cleanDay(b.day ?? today(), 'Ngày đo');
    if (day > today()) throw bad('Ngày đo', 'Ngày đo không được ở tương lai');
    if (s.birth_date && day < s.birth_date) throw bad('Ngày đo', 'Ngày đo không được trước ngày sinh');
    if (day < '1900-01-01') throw bad('Ngày đo');
    let v1; let v2 = null; let v3 = null; let ctxv = '';
    if (kind === 'bp') {
      v1 = num(b.v1, 40, 300, 'Huyết áp tâm thu'); v2 = num(b.v2, 20, 200, 'Huyết áp tâm trương');
      if (v2 >= v1) throw bad('Huyết áp', 'Tâm thu phải lớn hơn tâm trương');
      if (b.v3 !== undefined && b.v3 !== null && b.v3 !== '') v3 = num(b.v3, 20, 250, 'Mạch');
    } else if (kind === 'glucose') {
      v1 = num(b.v1, 0.5, 60, 'Đường huyết (mmol/L)');
      ctxv = ['doi', 'sau_an', 'khac'].includes(b.ctx) ? b.ctx : 'khac';
    } else { const r = RANGE[kind]; v1 = num(b.v1, r[0], r[1], r[2]); }
    const note = cleanNote(b.note, { max: 200 });
    const row = await tx(async (c) => {
      await c.query('SELECT id FROM health_subjects WHERE id=$1 FOR UPDATE', [s.id]);
      const n = (await c.query('SELECT count(*)::int n FROM health_measures WHERE subject_id=$1', [s.id]))[0].n;
      if (n >= MAX_MEASURES) throw new ApiError(409, 'limit', 'Hồ sơ này đã đủ số lần đo tối đa');
      if (GROWTH.includes(kind)) { // mỗi ngày một số đo tăng trưởng mỗi loại: đo lại thì thay số cũ
        const ex = (await c.query('SELECT id FROM health_measures WHERE subject_id=$1 AND kind=$2 AND day=$3', [s.id, kind, day]))[0];
        if (ex) return { ...(await c.query('UPDATE health_measures SET v1=$2, note=$3, created_by=$4 WHERE id=$1 RETURNING *', [ex.id, v1, note, me.id]))[0], replaced: true };
      }
      return (await c.query('INSERT INTO health_measures(family_id, subject_id, day, kind, v1, v2, v3, ctx, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [fid, s.id, day, kind, v1, v2, v3, ctxv, note, me.id]))[0];
    });
    const check = classify(row);
    return { id: row.id, replaced: !!row.replaced, check: check.label ? check : null, emergencyText: check.emergency ? EMERGENCY_TEXT : null, consultText: check.level !== 'ok' ? CONSULT_TEXT : null };
  });

  F.del('/health/:sid/measures/:mid', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const r = await query('DELETE FROM health_measures WHERE id=$1 AND subject_id=$2 RETURNING 1', [uuidParam(ctx.params.mid), s.id]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Không tìm thấy số đo');
    return { ok: true };
  });

  // ---------- tiêm chủng ----------
  F.post('/health/:sid/vaccines/schedule', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    if (!s.child_id) throw bad('Lịch tiêm', 'Lịch tiêm chủng mở rộng chỉ dành cho trẻ em');
    if (!s.birth_date) throw bad('Ngày sinh', 'Hãy nhập ngày sinh của bé trước');
    let added = 0;
    for (const d of scheduleFor(s.birth_date)) {
      const r = await query(
        `INSERT INTO health_vaccines(family_id, subject_id, code, name, dose_no, due_date, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (subject_id, code) WHERE code IS NOT NULL DO NOTHING RETURNING 1`, [fid, s.id, d.code, d.name, d.dose, d.dueDate, d.text, me.id]);
      added += r.length;
    }
    return { added };
  });

  F.post('/health/:sid/vaccines', async (ctx, me, fid) => {
    const b = ctx.body;
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const name = cleanText(b.name, { max: 80, min: 1, field: 'Tên vắc xin' });
    const dueDate = b.dueDate ? cleanDay(b.dueDate, 'Ngày dự kiến') : null;
    const doneOn = b.doneOn ? cleanDay(b.doneOn, 'Ngày đã tiêm') : null;
    if (doneOn && doneOn > today()) throw bad('Ngày đã tiêm', 'Ngày đã tiêm không được ở tương lai');
    if (!dueDate && !doneOn) throw bad('Ngày', 'Nhập ngày dự kiến hoặc ngày đã tiêm');
    const dose = b.doseNo === undefined ? 1 : Math.max(1, Math.min(20, Math.trunc(Number(b.doseNo)) || 1));
    const n = (await query('SELECT count(*)::int n FROM health_vaccines WHERE subject_id=$1', [s.id]))[0].n;
    if (n >= 100) throw new ApiError(409, 'limit', 'Quá nhiều mũi tiêm trong một hồ sơ');
    const r = (await query('INSERT INTO health_vaccines(family_id, subject_id, name, dose_no, due_date, done_on, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [fid, s.id, name, dose, dueDate, doneOn, cleanNote(b.note, { max: 200 }), me.id]))[0];
    return { id: r.id };
  });

  F.post('/health/:sid/vaccines/:vid', async (ctx, me, fid) => {
    const b = ctx.body;
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const sets = []; const vals = [uuidParam(ctx.params.vid), s.id];
    const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.doneOn !== undefined) {
      const d = b.doneOn ? cleanDay(b.doneOn, 'Ngày đã tiêm') : null;
      if (d && d > today()) throw bad('Ngày đã tiêm', 'Ngày đã tiêm không được ở tương lai');
      add('done_on', d);
    }
    if (b.dueDate !== undefined) add('due_date', b.dueDate ? cleanDay(b.dueDate, 'Ngày dự kiến') : null);
    if (b.note !== undefined) add('note', cleanNote(b.note, { max: 200 }));
    if (!sets.length) return { ok: true };
    const r = await query(`UPDATE health_vaccines SET ${sets.join(', ')} WHERE id=$1 AND subject_id=$2 RETURNING 1`, vals);
    if (!r.length) throw new ApiError(404, 'not_found', 'Không tìm thấy mũi tiêm');
    return { ok: true };
  });

  F.del('/health/:sid/vaccines/:vid', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const r = await query('DELETE FROM health_vaccines WHERE id=$1 AND subject_id=$2 AND code IS NULL RETURNING 1', [uuidParam(ctx.params.vid), s.id]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Chỉ xóa được mũi tiêm do bạn tự thêm');
    return { ok: true };
  });

  // ---------- thuốc (không có lời khuyên liều) ----------
  function parseMed(b, partial) {
    const o = {};
    if (!partial || b.name !== undefined) o.name = cleanText(b.name, { max: 60, min: 1, field: 'Tên thuốc' });
    if (!partial || b.dose !== undefined) o.dose = cleanText(b.dose ?? '', { max: 60, field: 'Liều (ghi theo đơn)' });
    if (!partial || b.times !== undefined) {
      if (!Array.isArray(b.times) || b.times.length > 6) throw bad('Giờ uống', 'Tối đa 6 giờ uống mỗi ngày');
      o.times = [...new Set(b.times.map((t) => cleanTime(t, 'Giờ uống')))].sort();
    }
    if (!partial || b.startDate !== undefined) o.start_date = cleanDay(b.startDate ?? today(), 'Ngày bắt đầu');
    if (b.endDate !== undefined) o.end_date = b.endDate ? cleanDay(b.endDate, 'Ngày kết thúc') : null;
    if (o.start_date && o.end_date && o.end_date < o.start_date) throw bad('Ngày kết thúc', 'Ngày kết thúc phải sau ngày bắt đầu');
    if (b.stock !== undefined) o.stock = b.stock === null || b.stock === '' ? null : Math.max(0, Math.min(10000, Math.trunc(Number(b.stock)) || 0));
    if (b.remind !== undefined) o.remind = !!b.remind;
    if (b.note !== undefined) o.note = cleanNote(b.note, { max: 200 });
    return o;
  }

  F.post('/health/:sid/meds', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const o = parseMed(ctx.body, false);
    const notify = ctx.body.notifyIds !== undefined ? uuidList(ctx.body.notifyIds, { max: 30, field: 'Người nhận nhắc' }) : [];
    const n = (await query('SELECT count(*)::int n FROM health_meds WHERE subject_id=$1 AND stopped_at IS NULL', [s.id]))[0].n;
    if (n >= 40) throw new ApiError(409, 'limit', 'Quá nhiều thuốc đang dùng trong một hồ sơ');
    const r = (await query(
      `INSERT INTO health_meds(family_id, subject_id, name, dose, times, start_date, end_date, stock, remind, notify_ids, note, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [fid, s.id, o.name, o.dose, o.times, o.start_date, o.end_date ?? null, o.stock ?? null, o.remind ?? true, notify, o.note ?? '', me.id]))[0];
    return { id: r.id };
  });

  F.post('/health/:sid/meds/:mid', async (ctx, me, fid) => {
    const b = ctx.body;
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const mid = uuidParam(ctx.params.mid);
    const o = parseMed(b, true);
    const sets = []; const vals = [mid, s.id];
    const add = (col, v, cast = '') => { vals.push(v); sets.push(`${col}=$${vals.length}${cast}`); };
    for (const [k, v] of Object.entries(o)) add(k, v, k === 'times' ? '::text[]' : '');
    if (b.stop === true) sets.push('stopped_at = now()'); else if (b.stop === false) sets.push('stopped_at = NULL');
    if (b.notifyIds !== undefined) add('notify_ids', uuidList(b.notifyIds, { max: 30, field: 'Người nhận nhắc' }), '::uuid[]');
    if (!sets.length) return { ok: true };
    const r = await query(`UPDATE health_meds SET ${sets.join(', ')} WHERE id=$1 AND subject_id=$2 RETURNING stock`, vals);
    if (!r.length) throw new ApiError(404, 'not_found', 'Không tìm thấy thuốc');
    if (o.stock !== undefined) await query('DELETE FROM hm_fires WHERE key = $1', [`medlow:${mid}`]); // nạp thêm thuốc thì cho phép báo "sắp hết" lần nữa
    return { ok: true };
  });

  F.del('/health/:sid/meds/:mid', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const mid = uuidParam(ctx.params.mid);
    const r = await query('DELETE FROM health_meds WHERE id=$1 AND subject_id=$2 RETURNING 1', [mid, s.id]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Không tìm thấy thuốc');
    await query("DELETE FROM hm_fires WHERE key LIKE $1 OR key = $2", [`med:${mid}:%`, `medlow:${mid}`]);
    return { ok: true };
  });

  // "Đã uống" một chạm; bấm lại không trừ thuốc hai lần; hết thuốc sắp tới thì báo (chung chung, một lần)
  F.post('/health/:sid/meds/:mid/take', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const mid = uuidParam(ctx.params.mid);
    const day = ctx.body.day ? cleanDay(ctx.body.day, 'Ngày') : today();
    if (day > today() || day < addDays(today(), -2)) throw bad('Ngày', 'Chỉ ghi được cho hôm nay hoặc hai ngày gần đây');
    const time = cleanTime(ctx.body.time, 'Giờ uống');
    return tx(async (c) => {
      const m = (await c.query('SELECT * FROM health_meds WHERE id=$1 AND subject_id=$2 FOR UPDATE', [mid, s.id]))[0];
      if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy thuốc');
      if (!m.times.includes(time)) throw bad('Giờ uống', 'Giờ này không có trong lịch uống');
      const ins = await c.query('INSERT INTO health_med_logs(med_id, day, time, taken_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING 1', [mid, day, time, me.id]);
      if (!ins.length) return { taken: true, already: true, stock: m.stock };
      let stock = m.stock;
      if (stock !== null) {
        stock = Math.max(0, stock - 1);
        await c.query('UPDATE health_meds SET stock=$2 WHERE id=$1', [mid, stock]);
        if (stock <= (m.times.length || 1) * 2 && (await c.query('INSERT INTO hm_fires(key) VALUES($1) ON CONFLICT DO NOTHING RETURNING 1', [`medlow:${mid}`])).length) {
          const to = m.notify_ids.length ? m.notify_ids : await healthRecipients(c, { ...s, family_id: fid });
          await notifyMembers(c, { familyId: fid, memberIds: to, type: 'health', title: HEALTH_TITLE, body: HEALTH_BODY, link: `#/f/${fid}/health`, dedupe: `medlow:${mid}:${stock}` });
        }
      }
      return { taken: true, stock };
    });
  });

  F.post('/health/:sid/meds/:mid/untake', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const mid = uuidParam(ctx.params.mid);
    const day = ctx.body.day ? cleanDay(ctx.body.day, 'Ngày') : today();
    const time = cleanTime(ctx.body.time, 'Giờ uống');
    return tx(async (c) => {
      const m = (await c.query('SELECT * FROM health_meds WHERE id=$1 AND subject_id=$2 FOR UPDATE', [mid, s.id]))[0];
      if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy thuốc');
      const del = await c.query('DELETE FROM health_med_logs WHERE med_id=$1 AND day=$2 AND time=$3 RETURNING 1', [mid, day, time]);
      if (del.length && m.stock !== null) await c.query('UPDATE health_meds SET stock = stock + 1 WHERE id=$1', [mid]);
      return { ok: true };
    });
  });

  // ---------- hồ sơ khám bệnh (chưa lưu ảnh) ----------
  async function syncRecheckEvent(c, s, fid, me, v, wants, oldEvent) {
    if (oldEvent) await c.query('DELETE FROM events WHERE id=$1 AND family_id=$2 AND source=$3', [oldEvent, fid, 'health']);
    if (!wants || !v.recheck_date) return null;
    const r = await c.query(
      `INSERT INTO events(family_id, title, kind, all_day, start_date, rec_type, notify_offsets, child_ids, member_ids, source, created_by)
       VALUES($1,'Tái khám','kham',true,$2,'none','{1440}',$3,$4,'health',$5) RETURNING id`,
      [fid, v.recheck_date, s.child_id ? [s.child_id] : [], s.member_id ? [s.member_id] : [], me.id]);
    return r[0].id;
  }
  function parseVisit(b) {
    const recheck = b.recheckDate ? cleanDay(b.recheckDate, 'Ngày tái khám') : null;
    const day = cleanDay(b.day ?? today(), 'Ngày khám');
    if (day > today()) throw bad('Ngày khám', 'Ngày khám không được ở tương lai');
    if (recheck && recheck < today()) throw bad('Ngày tái khám', 'Ngày tái khám phải từ hôm nay trở đi');
    return {
      day, place: cleanText(b.place ?? '', { max: 100, field: 'Nơi khám' }), doctor: cleanText(b.doctor ?? '', { max: 60, field: 'Bác sĩ' }),
      reason: cleanText(b.reason ?? '', { max: 150, field: 'Lý do khám' }), conclusion: cleanNote(b.conclusion, { max: 400, field: 'Kết luận' }),
      prescription: cleanNote(b.prescription, { max: 400, field: 'Đơn thuốc' }), recheck_date: recheck,
    };
  }

  F.post('/health/:sid/visits', async (ctx, me, fid) => {
    const { s, sec } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    if (!sec.visits) throw new ApiError(403, 'forbidden', 'Bạn không có quyền xem hồ sơ khám');
    const o = parseVisit(ctx.body);
    return tx(async (c) => {
      const n = (await c.query('SELECT count(*)::int n FROM health_visits WHERE subject_id=$1', [s.id]))[0].n;
      if (n >= 500) throw new ApiError(409, 'limit', 'Quá nhiều lần khám trong một hồ sơ');
      const ev = await syncRecheckEvent(c, s, fid, me, o, ctx.body.addToCalendar === true, null);
      const r = (await c.query(
        'INSERT INTO health_visits(family_id, subject_id, day, place, doctor, reason, conclusion, prescription, recheck_date, event_id, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
        [fid, s.id, o.day, o.place, o.doctor, o.reason, o.conclusion, o.prescription, o.recheck_date, ev, me.id]))[0];
      return { id: r.id, eventId: ev };
    });
  });

  F.post('/health/:sid/visits/:vid', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    const o = parseVisit(ctx.body);
    return tx(async (c) => {
      const cur = (await c.query('SELECT * FROM health_visits WHERE id=$1 AND subject_id=$2 FOR UPDATE', [uuidParam(ctx.params.vid), s.id]))[0];
      if (!cur) throw new ApiError(404, 'not_found', 'Không tìm thấy lần khám');
      const ev = await syncRecheckEvent(c, s, fid, me, o, ctx.body.addToCalendar === true, cur.event_id);
      await c.query('UPDATE health_visits SET day=$2, place=$3, doctor=$4, reason=$5, conclusion=$6, prescription=$7, recheck_date=$8, event_id=$9 WHERE id=$1',
        [cur.id, o.day, o.place, o.doctor, o.reason, o.conclusion, o.prescription, o.recheck_date, ev]);
      return { ok: true };
    });
  });

  F.del('/health/:sid/visits/:vid', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'write');
    await tx(async (c) => {
      const cur = (await c.query('DELETE FROM health_visits WHERE id=$1 AND subject_id=$2 RETURNING event_id', [uuidParam(ctx.params.vid), s.id]))[0];
      if (!cur) throw new ApiError(404, 'not_found', 'Không tìm thấy lần khám');
      if (cur.event_id) await c.query("DELETE FROM events WHERE id=$1 AND source='health'", [cur.event_id]);
    });
    return { ok: true };
  });

  // ---------- xóa dữ liệu sức khỏe của một người ----------
  F.post('/health/:sid/erase', async (ctx, me, fid) => {
    const { s } = await loadSubject(query, me, fid, uuidParam(ctx.params.sid), 'manage');
    if (ctx.body.confirm !== true) throw bad('Xác nhận', 'Cần xác nhận xóa');
    return tx(async (c) => {
      await c.query('SELECT id FROM health_subjects WHERE id=$1 FOR UPDATE', [s.id]);
      const evs = (await c.query('SELECT event_id FROM health_visits WHERE subject_id=$1 AND event_id IS NOT NULL', [s.id])).map((r) => r.event_id);
      if (evs.length) await c.query("DELETE FROM events WHERE id = ANY($1::uuid[]) AND source='health'", [evs]);
      const meds = (await c.query('SELECT id FROM health_meds WHERE subject_id=$1', [s.id])).map((r) => r.id);
      const vax = (await c.query('SELECT id FROM health_vaccines WHERE subject_id=$1', [s.id])).map((r) => r.id);
      for (const id of meds) await c.query('DELETE FROM hm_fires WHERE key LIKE $1 OR key = $2', [`med:${id}:%`, `medlow:${id}`]);
      for (const id of vax) await c.query('DELETE FROM hm_fires WHERE key LIKE $1', [`vax:${id}:%`]);
      const n = {
        measures: (await c.query('DELETE FROM health_measures WHERE subject_id=$1 RETURNING 1', [s.id])).length,
        vaccines: (await c.query('DELETE FROM health_vaccines WHERE subject_id=$1 RETURNING 1', [s.id])).length,
        meds: (await c.query('DELETE FROM health_meds WHERE subject_id=$1 RETURNING 1', [s.id])).length,
        visits: (await c.query('DELETE FROM health_visits WHERE subject_id=$1 RETURNING 1', [s.id])).length,
      };
      await c.query("UPDATE health_subjects SET sex=NULL, birth_date=NULL, shared_with='{}' WHERE id=$1", [s.id]);
      return { ok: true, erased: n };
    });
  });
}
