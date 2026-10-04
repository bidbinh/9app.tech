import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { isManager, forbidden } from '../auth.js';
import { clock } from '../clock.js';
import { cleanText, cleanNote, cleanTime, cleanDay, intIn, uuidParam, uuidList, minutesOf } from '../util.js';
import { dayOfMs, addDays, daysBetween, weekdayISO } from '../vn.js';
import { expand, makeLunarCache, matchesDay } from '../recur.js';
import { solarToLunar } from '../lunar.js';
import { ridesOfDay } from './rides.js';
import { ensureRideDays } from '../rides.js';
import { checkImage, scanTimetable } from '../ai.js';
import { famRoutes } from './common.js';

export const EVENT_KINDS = ['hoc', 'hoc_them', 'nang_khieu', 'thi', 'hop_phu_huynh', 'kham', 'gia_dinh', 'ngay_quan_trong', 'khac'];
export const OFFSETS = [0, 10, 30, 60, 120, 1440];
const REC_TYPES = ['none', 'daily', 'weekly', 'yearly', 'yearly_lunar', 'monthly_lunar'];

// Kiểm tra và chuẩn hóa nội dung sự kiện gửi lên
export function parseEvent(b, today) {
  const e = {};
  e.title = cleanText(b.title, { max: 80, min: 1, field: 'Tiêu đề' });
  e.kind = EVENT_KINDS.includes(b.kind) ? b.kind : (b.kind === undefined ? 'khac' : null);
  if (!e.kind) throw new ApiError(400, 'invalid_input', 'Loại sự kiện không hợp lệ', { field: 'Loại' });
  e.location = cleanText(b.location ?? '', { max: 100, field: 'Địa điểm' });
  e.note = cleanNote(b.note, { max: 500 });
  e.all_day = b.allDay === true;
  e.rec_type = b.recType === undefined ? 'none' : b.recType;
  if (!REC_TYPES.includes(e.rec_type)) throw new ApiError(400, 'invalid_input', 'Kiểu lặp không hợp lệ', { field: 'Lặp' });
  e.start_date = cleanDay(b.startDate ?? (e.rec_type === 'none' ? undefined : today), 'Ngày bắt đầu');
  e.until_date = cleanDay(b.untilDate, 'Ngày kết thúc lặp', { optional: true });
  if (e.until_date && e.until_date < e.start_date) throw new ApiError(400, 'invalid_input', 'Ngày kết thúc lặp phải sau ngày bắt đầu', { field: 'Ngày kết thúc lặp' });
  if (e.rec_type === 'none') e.until_date = null;
  if (e.all_day) { e.start_time = null; e.end_time = null; } else {
    e.start_time = cleanTime(b.start, 'Giờ bắt đầu');
    e.end_time = cleanTime(b.end, 'Giờ kết thúc', { optional: true });
    if (e.end_time && minutesOf(e.end_time) <= minutesOf(e.start_time)) throw new ApiError(400, 'invalid_input', 'Giờ kết thúc phải sau giờ bắt đầu', { field: 'Giờ kết thúc' });
  }
  e.rec_days = [];
  if (e.rec_type === 'weekly') {
    if (!Array.isArray(b.recDays) || !b.recDays.length) throw new ApiError(400, 'invalid_input', 'Hãy chọn ít nhất một thứ trong tuần', { field: 'Thứ' });
    e.rec_days = [...new Set(b.recDays.map((x) => intIn(x, { min: 1, max: 7, field: 'Thứ' })))].sort();
  }
  e.lunar_month = null; e.lunar_day = null;
  if (e.rec_type === 'yearly_lunar' || e.rec_type === 'monthly_lunar') {
    e.lunar_day = intIn(b.lunarDay, { min: 1, max: 30, field: 'Ngày âm lịch' });
    if (e.rec_type === 'yearly_lunar') e.lunar_month = intIn(b.lunarMonth, { min: 1, max: 12, field: 'Tháng âm lịch' });
  }
  const off = b.notifyOffsets === undefined ? [] : b.notifyOffsets;
  if (!Array.isArray(off) || off.length > 6) throw new ApiError(400, 'invalid_input', 'Mốc nhắc không hợp lệ', { field: 'Nhắc trước' });
  e.notify_offsets = [...new Set(off.map((x) => intIn(x, { min: 0, max: 1440, field: 'Nhắc trước' })))].sort((x, y) => y - x);
  if (e.notify_offsets.some((x) => !OFFSETS.includes(x))) throw new ApiError(400, 'invalid_input', 'Mốc nhắc không hợp lệ', { field: 'Nhắc trước' });
  const cl = b.checklist === undefined ? [] : b.checklist;
  if (!Array.isArray(cl) || cl.length > 20) throw new ApiError(400, 'invalid_input', 'Danh sách cần mang tối đa 20 mục', { field: 'Cần mang' });
  e.checklist = cl.map((x) => cleanText(x, { max: 60, field: 'Mục cần mang' })).filter(Boolean);
  e.child_ids = uuidList(b.childIds, { max: 8, field: 'Con' });
  e.member_ids = uuidList(b.memberIds, { max: 30, field: 'Thành viên' });
  return e;
}

async function checkTargets(c, fid, e) {
  if (e.child_ids.length) {
    const r = await c.query('SELECT id FROM children WHERE family_id=$1 AND id = ANY($2::uuid[])', [fid, e.child_ids]);
    if (r.length !== e.child_ids.length) throw new ApiError(400, 'invalid_input', 'Có con không thuộc gia đình này', { field: 'Con' });
  }
  if (e.member_ids.length) {
    const r = await c.query('SELECT id FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL AND id = ANY($2::uuid[])', [fid, e.member_ids]);
    if (r.length !== e.member_ids.length) throw new ApiError(400, 'invalid_input', 'Có thành viên không còn trong gia đình', { field: 'Thành viên' });
  }
}

const COLS = ['title', 'kind', 'location', 'note', 'all_day', 'start_time', 'end_time', 'start_date', 'until_date', 'rec_type', 'rec_days', 'lunar_month', 'lunar_day', 'notify_offsets', 'checklist', 'child_ids', 'member_ids'];
const colVals = (e) => COLS.map((k) => (k === 'checklist' ? JSON.stringify(e[k]) : e[k]));

export const eventOut = (ev) => ({
  id: ev.id, title: ev.title, kind: ev.kind, location: ev.location, note: ev.note, allDay: ev.all_day, start: ev.start_time, end: ev.end_time,
  startDate: ev.start_date, untilDate: ev.until_date, recType: ev.rec_type, recDays: ev.rec_days, lunarMonth: ev.lunar_month, lunarDay: ev.lunar_day,
  notifyOffsets: ev.notify_offsets, checklist: ev.checklist, childIds: ev.child_ids, memberIds: ev.member_ids, source: ev.source, createdBy: ev.created_by,
});

async function exceptionsFor(q, ids, from, to) {
  const m = new Map();
  if (!ids.length) return m;
  const rows = await q('SELECT * FROM event_exceptions WHERE event_id = ANY($1::uuid[]) AND day BETWEEN $2 AND $3', [ids, from, to]);
  for (const x of rows) { if (!m.has(x.event_id)) m.set(x.event_id, new Map()); m.get(x.event_id).set(x.day, x); }
  return m;
}

// Các lần diễn ra của mọi sự kiện gia đình trong [from, to]
export async function occurrencesIn(q, fid, from, to, { childId = null } = {}) {
  const evs = await q('SELECT * FROM events WHERE family_id=$1 AND start_date <= $3 AND (until_date IS NULL OR until_date >= $2)', [fid, from, to]);
  const ex = await exceptionsFor(q, evs.map((e) => e.id), from, to);
  const lunar = makeLunarCache();
  const out = [];
  for (const ev of evs) {
    if (childId && !ev.child_ids.includes(childId)) continue;
    for (const o of expand(ev, from, to, ex.get(ev.id) || new Map(), lunar)) {
      out.push({ ...o, childIds: ev.child_ids, memberIds: ev.member_ids, checklist: ev.checklist, recurring: ev.rec_type !== 'none', recType: ev.rec_type, notifyOffsets: ev.notify_offsets, source: ev.source });
    }
  }
  out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.allDay ? '' : a.start || '') < (b.allDay ? '' : b.start || '') ? -1 : 1));
  return out;
}

function lunarMap(from, to) {
  const m = {}; const lc = makeLunarCache();
  for (let d = from; d <= to; d = addDays(d, 1)) { const l = lc(d); m[d] = [l.day, l.month, l.leap ? 1 : 0]; }
  return m;
}

export function eventRoutes(app) {
  const F = famRoutes(app);

  F.get('/today', async (ctx, me, fid) => {
    const now = clock.now(); const today = dayOfMs(now); const tomorrow = addDays(today, 1);
    await tx(async (c) => { await ensureRideDays(c, today, fid); await ensureRideDays(c, tomorrow, fid); });
    const occ = await occurrencesIn(query, fid, today, tomorrow);
    const tasks = await query(
      `SELECT t.id, t.title, t.due_date, t.assignee_id FROM tasks t WHERE t.family_id=$1 AND t.done_at IS NULL AND (t.assignee_id=$2 OR t.assignee_id IS NULL OR (t.due_date IS NOT NULL AND t.due_date <= $3))
        ORDER BY t.due_date NULLS LAST, t.created_at LIMIT 6`, [fid, me.id, tomorrow]);
    const unread = (await query('SELECT count(*)::int n FROM notifications WHERE member_id=$1 AND read_at IS NULL', [me.id]))[0].n;
    const l = solarToLunar(today);
    return {
      now, today, lunar: [l.day, l.month, l.leap ? 1 : 0],
      events: occ.filter((o) => o.day === today), tomorrowEvents: occ.filter((o) => o.day === tomorrow),
      rides: await ridesOfDay(query, fid, today), tomorrowRides: await ridesOfDay(query, fid, tomorrow),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, due: t.due_date, assigneeId: t.assignee_id })), unread,
    };
  });

  F.get('/calendar', async (ctx, me, fid) => {
    const from = cleanDay(ctx.query.from, 'Từ ngày'); const to = cleanDay(ctx.query.to, 'Đến ngày');
    const span = daysBetween(from, to);
    if (span < 0 || span + 1 > config.maxRangeDays) throw new ApiError(400, 'invalid_input', `Chỉ xem được tối đa ${config.maxRangeDays} ngày một lần`, { field: 'Khoảng ngày' });
    const childId = ctx.query.childId ? uuidParam(ctx.query.childId) : null;
    return { from, to, today: dayOfMs(clock.now()), events: await occurrencesIn(query, fid, from, to, { childId }), lunar: lunarMap(from, to) };
  });

  F.get('/events/:id', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const ev = (await query('SELECT * FROM events WHERE id=$1 AND family_id=$2', [id, fid]))[0];
    if (!ev) throw new ApiError(404, 'not_found', 'Không tìm thấy sự kiện');
    const ex = await query('SELECT * FROM event_exceptions WHERE event_id=$1 ORDER BY day', [id]);
    return { event: eventOut(ev), exceptions: ex.map((x) => ({ day: x.day, action: x.action, title: x.title, location: x.location, note: x.note, start: x.start_time, end: x.end_time })), canEdit: isManager(me) || ev.created_by === me.id };
  });

  F.post('/events/preview', async (ctx, me, fid) => {
    ctx.noBump = true;
    const today = dayOfMs(clock.now());
    const e = parseEvent(ctx.body, today);
    const ev = { ...e, id: 'preview' };
    const from = e.start_date > today ? e.start_date : today;
    const found = expand(ev, from, addDays(from, 1500), new Map()).slice(0, 4);
    return { next: found.map((o) => { const l = solarToLunar(o.day); return { day: o.day, weekday: weekdayISO(o.day), lunar: [l.day, l.month, l.leap ? 1 : 0] }; }) };
  });

  F.post('/events', async (ctx, me, fid) => {
    const today = dayOfMs(clock.now());
    const e = parseEvent(ctx.body, today);
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      await checkTargets(c, fid, e);
      const n = (await c.query('SELECT count(*)::int n FROM events WHERE family_id=$1', [fid]))[0].n;
      if (n >= config.maxEvents) throw new ApiError(409, 'limit', `Mỗi gia đình tối đa ${config.maxEvents} sự kiện`);
      const row = (await c.query(
        `INSERT INTO events(family_id, created_by, ${COLS.join(', ')}) VALUES($1,$2,${COLS.map((_, i) => `$${i + 3}`).join(',')}) RETURNING *`, [fid, me.id, ...colVals(e)]))[0];
      return { event: eventOut(row) };
    });
  });

  async function loadForEdit(c, me, fid, id) {
    const ev = (await c.query('SELECT * FROM events WHERE id=$1 AND family_id=$2 FOR UPDATE', [id, fid]))[0];
    if (!ev) throw new ApiError(404, 'not_found', 'Không tìm thấy sự kiện');
    if (!(isManager(me) || ev.created_by === me.id)) throw forbidden('Chỉ người tạo sự kiện hoặc người quản lý mới sửa được');
    return ev;
  }

  F.post('/events/:id', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const today = dayOfMs(clock.now());
    const e = parseEvent(ctx.body, today);
    return tx(async (c) => {
      await loadForEdit(c, me, fid, id);
      await checkTargets(c, fid, e);
      const row = (await c.query(
        `UPDATE events SET ${COLS.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now(), source=NULL, source_child=NULL WHERE id=$1 RETURNING *`, [id, ...colVals(e)]))[0];
      // đổi quy tắc lặp thì các ngoại lệ cũ có thể không còn khớp: giữ những ngày vẫn là một lần diễn ra
      const lunar = makeLunarCache();
      const ex = await c.query('SELECT day FROM event_exceptions WHERE event_id=$1', [id]);
      for (const x of ex) if (!matchesDay(row, x.day, lunar)) await c.query('DELETE FROM event_exceptions WHERE event_id=$1 AND day=$2', [id, x.day]);
      await c.query('DELETE FROM event_fires WHERE event_id=$1 AND day >= $2', [id, today]);
      return { event: eventOut(row) };
    });
  });

  F.del('/events/:id', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    await tx(async (c) => { await loadForEdit(c, me, fid, id); await c.query('DELETE FROM events WHERE id=$1', [id]); });
    return { ok: true };
  });

  // xóa hoặc sửa riêng một ngày
  F.post('/events/:id/exceptions', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const b = ctx.body;
    const day = cleanDay(b.day);
    if (!['skip', 'edit'].includes(b.action)) throw new ApiError(400, 'invalid_input', 'Thao tác không hợp lệ', { field: 'Thao tác' });
    return tx(async (c) => {
      const ev = await loadForEdit(c, me, fid, id);
      if (!matchesDay(ev, day, makeLunarCache())) throw new ApiError(400, 'invalid_input', 'Ngày này không có sự kiện', { field: 'Ngày' });
      if (b.action === 'skip') {
        await c.query("INSERT INTO event_exceptions(event_id, day, action) VALUES($1,$2,'skip') ON CONFLICT (event_id, day) DO UPDATE SET action='skip', title=NULL, location=NULL, note=NULL, start_time=NULL, end_time=NULL", [id, day]);
      } else {
        const title = b.title === undefined ? null : cleanText(b.title, { max: 80, min: 1, field: 'Tiêu đề' });
        const location = b.location === undefined ? null : cleanText(b.location, { max: 100, field: 'Địa điểm' });
        const note = b.note === undefined ? null : cleanNote(b.note, { max: 500 });
        const start = ev.all_day || b.start === undefined ? null : cleanTime(b.start, 'Giờ bắt đầu');
        const end = ev.all_day || b.end === undefined ? null : cleanTime(b.end, 'Giờ kết thúc', { optional: true });
        const s = start || ev.start_time;
        if (end && s && minutesOf(end) <= minutesOf(s)) throw new ApiError(400, 'invalid_input', 'Giờ kết thúc phải sau giờ bắt đầu', { field: 'Giờ kết thúc' });
        await c.query(
          `INSERT INTO event_exceptions(event_id, day, action, title, location, note, start_time, end_time) VALUES($1,$2,'edit',$3,$4,$5,$6,$7)
           ON CONFLICT (event_id, day) DO UPDATE SET action='edit', title=$3, location=$4, note=$5, start_time=$6, end_time=$7`, [id, day, title, location, note, start, end]);
      }
      await c.query('DELETE FROM event_fires WHERE event_id=$1 AND day=$2', [id, day]);
      return { ok: true };
    });
  });

  F.del('/events/:id/exceptions/:day', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id); const day = cleanDay(ctx.params.day);
    await tx(async (c) => { await loadForEdit(c, me, fid, id); await c.query('DELETE FROM event_exceptions WHERE event_id=$1 AND day=$2', [id, day]); });
    return { ok: true };
  });

  // "từ ngày này trở đi thôi không lặp nữa"
  F.post('/events/:id/end-from', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id); const day = cleanDay(ctx.body.day);
    return tx(async (c) => {
      const ev = await loadForEdit(c, me, fid, id);
      if (day <= ev.start_date) { await c.query('DELETE FROM events WHERE id=$1', [id]); return { deleted: true }; }
      await c.query('UPDATE events SET until_date=$2, updated_at=now() WHERE id=$1', [id, addDays(day, -1)]);
      await c.query('DELETE FROM event_exceptions WHERE event_id=$1 AND day >= $2', [id, day]);
      return { deleted: false };
    });
  });

  // ---------- thời khóa biểu: lưới thứ x tiết ----------
  function parseTimetable(b) {
    if (!Array.isArray(b.periods) || b.periods.length < 1 || b.periods.length > 14) throw new ApiError(400, 'invalid_input', 'Hãy nhập giờ của các tiết (1 đến 14 tiết)', { field: 'Tiết' });
    const periods = new Map();
    for (const p of b.periods) {
      const n = intIn(p.n, { min: 1, max: 14, field: 'Tiết' });
      const start = cleanTime(p.start, `Giờ bắt đầu tiết ${n}`); const end = cleanTime(p.end, `Giờ kết thúc tiết ${n}`);
      if (minutesOf(end) <= minutesOf(start)) throw new ApiError(400, 'invalid_input', `Tiết ${n}: giờ kết thúc phải sau giờ bắt đầu`, { field: 'Tiết' });
      if (periods.has(n)) throw new ApiError(400, 'invalid_input', `Tiết ${n} bị trùng`, { field: 'Tiết' });
      periods.set(n, { n, start, end });
    }
    if (!Array.isArray(b.cells) || b.cells.length > 120) throw new ApiError(400, 'invalid_input', 'Thời khóa biểu quá lớn', { field: 'Ô' });
    const cells = new Map();
    for (const c of b.cells) {
      const weekday = intIn(c.weekday, { min: 1, max: 7, field: 'Thứ' }); const period = intIn(c.period, { min: 1, max: 14, field: 'Tiết' });
      const subject = cleanText(c.subject, { max: 40, field: 'Môn học' });
      if (!subject) continue;
      if (!periods.has(period)) throw new ApiError(400, 'invalid_input', `Tiết ${period} chưa có giờ`, { field: 'Tiết' });
      cells.set(`${weekday}-${period}`, { weekday, period, subject });
    }
    if (!cells.size) throw new ApiError(400, 'invalid_input', 'Thời khóa biểu chưa có môn nào', { field: 'Ô' });
    return { periods: [...periods.values()].sort((a, b2) => a.n - b2.n), cells: [...cells.values()] };
  }

  F.get('/timetable/:cid', async (ctx, me, fid) => {
    const cid = uuidParam(ctx.params.cid);
    const t = (await query('SELECT * FROM timetables WHERE child_id=$1 AND family_id=$2', [cid, fid]))[0];
    return { timetable: t ? { childId: t.child_id, periods: t.periods, cells: t.cells, startDate: t.start_date, untilDate: t.until_date } : null };
  });

  F.post('/timetable', async (ctx, me, fid) => {
    if (!isManager(me)) throw forbidden('Chỉ chủ gia đình hoặc người quản lý mới nhập thời khóa biểu');
    const b = ctx.body;
    const childId = uuidParam(b.childId);
    const today = dayOfMs(clock.now());
    const startDate = cleanDay(b.startDate ?? today, 'Ngày bắt đầu');
    const untilDate = cleanDay(b.untilDate, 'Ngày kết thúc', { optional: true });
    if (untilDate && untilDate < startDate) throw new ApiError(400, 'invalid_input', 'Ngày kết thúc phải sau ngày bắt đầu', { field: 'Ngày kết thúc' });
    const { periods, cells } = parseTimetable(b);
    const blocks = buildTimetableEvents(periods, cells);
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      if (!(await c.query('SELECT 1 FROM children WHERE id=$1 AND family_id=$2', [childId, fid])).length) throw new ApiError(404, 'not_found', 'Không tìm thấy con');
      await c.query("DELETE FROM events WHERE family_id=$1 AND source='tkb' AND source_child=$2", [fid, childId]);
      const n = (await c.query('SELECT count(*)::int n FROM events WHERE family_id=$1', [fid]))[0].n;
      if (n + blocks.length > config.maxEvents) throw new ApiError(409, 'limit', 'Số sự kiện trong gia đình đã đạt giới hạn');
      for (const bl of blocks) {
        await c.query(
          `INSERT INTO events(family_id, created_by, title, kind, start_time, end_time, start_date, until_date, rec_type, rec_days, child_ids, source, source_child)
           VALUES($1,$2,$3,'hoc',$4,$5,$6,$7,'weekly',$8,$9,'tkb',$10)`, [fid, me.id, bl.title, bl.start, bl.end, startDate, untilDate, bl.days, [childId], childId]);
      }
      await c.query(
        `INSERT INTO timetables(child_id, family_id, periods, cells, start_date, until_date) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT (child_id) DO UPDATE SET periods=$3, cells=$4, start_date=$5, until_date=$6, updated_at=now()`, [childId, fid, JSON.stringify(periods), JSON.stringify(cells), startDate, untilDate]);
      return { created: blocks.length };
    });
  });

  F.del('/timetable/:cid', async (ctx, me, fid) => {
    if (!isManager(me)) throw forbidden('Chỉ chủ gia đình hoặc người quản lý mới xóa thời khóa biểu');
    const cid = uuidParam(ctx.params.cid);
    await tx(async (c) => {
      await c.query("DELETE FROM events WHERE family_id=$1 AND source='tkb' AND source_child=$2", [fid, cid]);
      await c.query('DELETE FROM timetables WHERE child_id=$1 AND family_id=$2', [cid, fid]);
    });
    return { ok: true };
  });

  // đọc ảnh bằng AI: chỉ trả bản nháp để người dùng xem lại, không lưu gì, không lưu ảnh
  F.post('/timetable/scan', async (ctx, me, fid) => {
    ctx.noBump = true;
    if (!config.aiKey) throw new ApiError(404, 'ai_disabled', 'Tính năng đọc ảnh chưa được bật');
    if (!isManager(me)) throw forbidden('Chỉ chủ gia đình hoặc người quản lý mới nhập thời khóa biểu');
    const img = checkImage(ctx.body.image);
    const today = dayOfMs(clock.now());
    const used = (await query(
      `INSERT INTO ai_usage(family_id, day, n) VALUES($1,$2,1) ON CONFLICT (family_id, day) DO UPDATE SET n = ai_usage.n + 1 RETURNING n`, [fid, today]))[0].n;
    if (used > config.aiPerFamilyPerDay) throw new ApiError(429, 'ai_quota', 'Hôm nay đã đọc ảnh quá nhiều lần. Mai thử lại hoặc nhập tay bằng lưới.');
    return scanTimetable(img);
  }, { maxBody: 6 * 1024 * 1024, limit: 12, limitKey: 'aiscan' });
}

// Dựng danh sách sự kiện lặp tuần từ lưới thời khóa biểu
export function buildTimetableEvents(periods, cells) {
  const pmap = new Map(periods.map((p) => [p.n, p]));
  const byDay = new Map();
  for (const c of cells) { if (!byDay.has(c.weekday)) byDay.set(c.weekday, []); byDay.get(c.weekday).push(c); }
  const blocks = [];
  for (const [weekday, list] of byDay) {
    list.sort((a, b) => a.period - b.period);
    let cur = null;
    for (const c of list) {
      if (cur && cur.title === c.subject && c.period === cur.last + 1) { cur.last = c.period; continue; }
      cur = { weekday, title: c.subject, first: c.period, last: c.period };
      blocks.push(cur);
    }
  }
  const merged = new Map();
  for (const b of blocks) {
    const start = pmap.get(b.first).start; const end = pmap.get(b.last).end;
    const key = `${b.title}|${start}|${end}`;
    if (!merged.has(key)) merged.set(key, { title: b.title, start, end, days: [] });
    merged.get(key).days.push(b.weekday);
  }
  return [...merged.values()].map((m) => ({ ...m, days: [...new Set(m.days)].sort() }));
}
