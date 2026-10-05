import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireManager, forbidden, isManager } from '../auth.js';
import { familyContext } from '../id.js';
import { clock } from '../clock.js';
import { cleanText, cleanNote, cleanTime, cleanDay, intIn, uuidParam, normKey } from '../util.js';
import { dayOfMs, addDays, atMs, weekdayISO, daysBetween } from '../vn.js';
import * as R from '../rides.js';
import { famRoutes, childOut } from './common.js';

export const COLORS = ['xanh', 'cam', 'tim', 'hong', 'luc', 'vang', 'do', 'nau'];

const SEL = `SELECT rd.*, c.name AS child_name, c.color AS child_color, c.note AS child_note,
  m0.name AS p0_name, m0.external AS p0_ext, m1.name AS p1_name, m2.name AS p2_name,
  mc.name AS claimed_name, md.name AS done_name, ms.name AS skip_name, mo.name AS override_name, m0.phone AS p0_phone, m0.note AS p0_note
  FROM ride_days rd JOIN children c ON c.id = rd.child_id
  LEFT JOIN members m0 ON m0.id = rd.p0 LEFT JOIN members m1 ON m1.id = rd.p1 LEFT JOIN members m2 ON m2.id = rd.p2
  LEFT JOIN members mc ON mc.id = rd.claimed_by LEFT JOIN members md ON md.id = rd.done_by
  LEFT JOIN members ms ON ms.id = rd.skip_by LEFT JOIN members mo ON mo.id = rd.override_by`;

export const rideDayOut = (r) => ({
  id: r.id, rideId: r.ride_id, childId: r.child_id, childName: r.child_name, childColor: r.child_color,
  dir: r.dir, day: r.day, time: r.at_time, atTs: new Date(r.at_ts).getTime(), place: r.place, state: r.state,
  p0: r.p0, p0Name: r.p0_name || '', p0External: !!r.p0_ext, p0Phone: r.p0_ext ? r.p0_phone : undefined, p0Note: r.p0_ext ? r.p0_note : undefined,
  p1: r.p1, p1Name: r.p1_name || '', p2: r.p2, p2Name: r.p2_name || '',
  claimedBy: r.claimed_by, claimedName: r.claimed_name || '', claimedAt: r.claimed_at ? new Date(r.claimed_at).getTime() : null,
  doneBy: r.done_by, doneName: r.done_name || '', doneAt: r.done_at ? new Date(r.done_at).getTime() : null,
  skipName: r.skip_name || '', skipReason: r.skip_reason, overrideName: r.override_name || '', overrideReason: r.override_reason,
});

// Tài khoản của con chỉ thấy ca của chính mình, và không thấy số điện thoại/nhận dạng của người đón hộ
export const forViewer = (me) => (list) => (me && me.role === 'con'
  ? list.filter((r) => me.childIds.includes(r.childId)).map((r) => ({ ...r, p0Phone: undefined, p0Note: undefined }))
  : list);

export async function ridesOfDay(q, fid, day, me) {
  return forViewer(me)((await q(`${SEL} WHERE rd.family_id = $1 AND rd.day = $2 AND c.archived_at IS NULL ORDER BY rd.at_ts, rd.dir, c.created_at`, [fid, day])).map(rideDayOut));
}

async function checkPeople(c, fid, ids) {
  const set = ids.filter(Boolean);
  if (new Set(set).size !== set.length) throw new ApiError(400, 'invalid_input', 'Mỗi người chỉ nên giữ một vị trí trong ca (phụ trách, dự phòng 1, dự phòng 2)', { field: 'Người phụ trách' });
  if (!set.length) return;
  const rows = await c.query('SELECT id FROM members WHERE family_id=$1 AND left_at IS NULL AND (joined_at IS NOT NULL OR external) AND role <> $3 AND id = ANY($2::uuid[])', [fid, set, 'con']);
  if (rows.length !== set.length) throw new ApiError(400, 'invalid_input', 'Có người không còn trong gia đình hoặc chưa vào gia đình', { field: 'Người phụ trách' });
}
const personOf = (v) => (v === null || v === undefined || v === '' ? null : uuidParam(v));

function parsePeople(b, cur = {}) {
  const out = { p0: cur.p0 ?? null, p1: cur.p1 ?? null, p2: cur.p2 ?? null };
  for (const k of ['p0', 'p1', 'p2']) if (b[k] !== undefined) out[k] = personOf(b[k]);
  if (out.p2 && !out.p1) throw new ApiError(400, 'invalid_input', 'Hãy chọn người dự phòng thứ nhất trước', { field: 'Người dự phòng' });
  return out;
}

export function rideRoutes(app) {
  const F = famRoutes(app);

  // ---------- hồ sơ con ----------
  // Tên, năm sinh và việc tạo/lưu trữ hồ sơ con nằm ở 9id (tài khoản 9app). Ở đây chỉ giữ phần mở rộng: trường, lớp, màu, ghi chú đưa đón.
  function parseChild(b) {
    const o = {};
    if (b.school !== undefined) o.school = cleanText(b.school, { max: 80, field: 'Trường' });
    if (b.grade !== undefined) o.grade = cleanText(b.grade, { max: 20, field: 'Lớp' });
    if (b.color !== undefined) { if (!COLORS.includes(b.color)) throw new ApiError(400, 'invalid_input', 'Màu không hợp lệ', { field: 'Màu' }); o.color = b.color; }
    if (b.note !== undefined) o.note = cleanNote(b.note, { max: 300, field: 'Ghi chú về con' });
    return o;
  }

  F.post('/children', async () => {
    throw new ApiError(409, 'child_in_id', 'Thêm con ở tài khoản 9app (mục Gia đình), rồi quay lại đây thêm trường, lớp và màu.', { link: config.nineIdPublicPath });
  });

  F.post('/children/:cid', async (ctx, me, fid) => {
    requireManager(me, 'Chỉ chủ gia đình hoặc người quản lý mới sửa hồ sơ con');
    const cid = uuidParam(ctx.params.cid);
    const b = ctx.body;
    const o = parseChild(b);
    let cur = (await query('SELECT * FROM children WHERE id=$1 AND family_id=$2 AND archived_at IS NULL', [cid, fid]))[0];
    if (!cur) { // hồ sơ vừa tạo ở 9id: đọc lại 9id rồi thử lần nữa
      await familyContext(ctx, fid, { force: true });
      cur = (await query('SELECT * FROM children WHERE id=$1 AND family_id=$2 AND archived_at IS NULL', [cid, fid]))[0];
    }
    if (!cur) throw new ApiError(404, 'not_found', 'Không tìm thấy con');
    if ((b.name !== undefined && b.name !== cur.name) || (b.birthYear !== undefined && (b.birthYear === '' ? null : b.birthYear) !== cur.birth_year)) {
      throw new ApiError(409, 'child_in_id', 'Tên và năm sinh của con đổi ở tài khoản 9app (mục Gia đình).', { link: config.nineIdPublicPath });
    }
    const keys = Object.keys(o);
    if (keys.length) await query(`UPDATE children SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(', ')} WHERE id=$1 AND family_id=$2`, [cid, fid, ...keys.map((k) => o[k])]);
    return { child: childOut((await query('SELECT * FROM children WHERE id=$1', [cid]))[0], me) };
  });

  F.del('/children/:cid', async () => {
    throw new ApiError(409, 'child_in_id', 'Lưu trữ hoặc xóa hồ sơ con ở tài khoản 9app (mục Gia đình).', { link: config.nineIdPublicPath });
  });

  // ---------- khuôn đưa đón theo tuần ----------
  F.get('/rides', async (ctx, me, fid) => {
    const rows = (await query('SELECT r.* FROM rides r JOIN children k ON k.id = r.child_id AND k.archived_at IS NULL WHERE r.family_id=$1 ORDER BY r.child_id, r.dir, r.weekday, r.at_time', [fid])).filter((r) => me.role !== 'con' || me.childIds.includes(r.child_id));
    return { rides: rows.map((r) => ({ id: r.id, childId: r.child_id, dir: r.dir, weekday: r.weekday, time: r.at_time, place: r.place, p0: r.p0, p1: r.p1, p2: r.p2 })) };
  }, { con: true });

  F.post('/rides', async (ctx, me, fid) => {
    requireManager(me, 'Chỉ chủ gia đình hoặc người quản lý mới đặt lịch đưa đón');
    const b = ctx.body;
    const childId = uuidParam(b.childId);
    if (!['dua', 'don'].includes(b.dir)) throw new ApiError(400, 'invalid_input', 'Hãy chọn đưa hoặc đón', { field: 'Loại ca' });
    const time = cleanTime(b.time, 'Giờ');
    const place = cleanText(b.place ?? '', { max: 100, field: 'Địa điểm' });
    const days = Array.isArray(b.weekdays) ? [...new Set(b.weekdays.map((x) => intIn(x, { min: 1, max: 7, field: 'Thứ' })))] : [];
    if (!days.length) throw new ApiError(400, 'invalid_input', 'Hãy chọn ít nhất một thứ trong tuần', { field: 'Thứ' });
    const ppl = parsePeople(b);
    return tx(async (c) => {
      if (!(await c.query('SELECT 1 FROM children WHERE id=$1 AND family_id=$2 AND archived_at IS NULL', [childId, fid])).length) throw new ApiError(404, 'not_found', 'Không tìm thấy con');
      await checkPeople(c, fid, [ppl.p0, ppl.p1, ppl.p2]);
      const n = (await c.query('SELECT count(*)::int n FROM rides WHERE family_id=$1', [fid]))[0].n;
      if (n + days.length > config.maxRides) throw new ApiError(409, 'limit', 'Số ca đưa đón đã đạt giới hạn');
      const dup = await c.query('SELECT 1 FROM rides WHERE child_id=$1 AND dir=$2 AND at_time=$3 AND weekday = ANY($4::smallint[])', [childId, b.dir, time, days]);
      if (dup.length) throw new ApiError(409, 'duplicate', 'Đã có ca cùng giờ ở thứ này. Hãy sửa ca cũ thay vì thêm mới.');
      const ids = [];
      for (const wd of days) {
        ids.push((await c.query('INSERT INTO rides(family_id, child_id, dir, weekday, at_time, place, p0, p1, p2) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
          [fid, childId, b.dir, wd, time, place, ppl.p0, ppl.p1, ppl.p2]))[0].id);
      }
      const today = dayOfMs(clock.now());
      await R.ensureRideDays(c, today, fid); await R.ensureRideDays(c, addDays(today, 1), fid);
      return { ids };
    });
  });

  F.post('/rides/:rid', async (ctx, me, fid) => {
    requireManager(me, 'Chỉ chủ gia đình hoặc người quản lý mới sửa lịch đưa đón');
    const rid = uuidParam(ctx.params.rid);
    const b = ctx.body;
    return tx(async (c) => {
      const cur = (await c.query('SELECT * FROM rides WHERE id=$1 AND family_id=$2 FOR UPDATE', [rid, fid]))[0];
      if (!cur) throw new ApiError(404, 'not_found', 'Không tìm thấy ca');
      const time = b.time !== undefined ? cleanTime(b.time, 'Giờ') : cur.at_time;
      const place = b.place !== undefined ? cleanText(b.place, { max: 100, field: 'Địa điểm' }) : cur.place;
      const ppl = parsePeople(b, cur);
      await checkPeople(c, fid, [ppl.p0, ppl.p1, ppl.p2]);
      if (time !== cur.at_time) {
        const dup = await c.query('SELECT 1 FROM rides WHERE child_id=$1 AND dir=$2 AND at_time=$3 AND weekday=$4 AND id<>$5', [cur.child_id, cur.dir, time, cur.weekday, rid]);
        if (dup.length) throw new ApiError(409, 'duplicate', 'Đã có ca cùng giờ ở thứ này');
      }
      await c.query('UPDATE rides SET at_time=$2, place=$3, p0=$4, p1=$5, p2=$6 WHERE id=$1', [rid, time, place, ppl.p0, ppl.p1, ppl.p2]);
      const today = dayOfMs(clock.now());
      // cập nhật các ca chưa ai đụng tới; ca đã có người nhận chỉ đổi giờ, địa điểm và dự phòng
      await c.query(
        `UPDATE ride_days SET at_time=$2::text, at_ts=(((day + ($2::text)::time) - interval '7 hours') AT TIME ZONE 'UTC'), place=$4, p1=$6, p2=$7,
                p0 = CASE WHEN state='cho' AND override_by IS NULL THEN $5 ELSE p0 END
          WHERE ride_id=$1 AND day >= $3 AND state IN ('cho','da_nhan','dang_di','khong_ai')`, [rid, time, today, place, ppl.p0, ppl.p1, ppl.p2]);
      return { ok: true };
    });
  });

  F.del('/rides/:rid', async (ctx, me, fid) => {
    requireManager(me, 'Chỉ chủ gia đình hoặc người quản lý mới xóa lịch đưa đón');
    const rid = uuidParam(ctx.params.rid);
    await tx(async (c) => {
      const cur = (await c.query('SELECT id FROM rides WHERE id=$1 AND family_id=$2 FOR UPDATE', [rid, fid]))[0];
      if (!cur) throw new ApiError(404, 'not_found', 'Không tìm thấy ca');
      const today = dayOfMs(clock.now());
      await c.query("DELETE FROM ride_days WHERE ride_id=$1 AND day >= $2 AND state='cho' AND override_by IS NULL", [rid, today]);
      await c.query('DELETE FROM rides WHERE id=$1', [rid]);
    });
    return { ok: true };
  });

  // ---------- các ca theo ngày ----------
  F.get('/rides/board', async (ctx, me, fid) => {
    const now = clock.now(); const today = dayOfMs(now);
    const day = ctx.query.day ? cleanDay(ctx.query.day) : today;
    const diff = daysBetween(today, day);
    if (diff < -30 || diff > 30) throw new ApiError(400, 'invalid_input', 'Chỉ xem được các ca trong khoảng 30 ngày quanh hôm nay', { field: 'Ngày' });
    if (diff >= 0) await tx((c) => R.ensureRideDays(c, day, fid));
    return { day, today, now, rides: await ridesOfDay(query, fid, day, me) };
  }, { con: true });

  F.get('/rides/history', async (ctx, me, fid) => {
    const today = dayOfMs(clock.now());
    const rows = await query(`${SEL} WHERE rd.family_id=$1 AND rd.day >= $2 AND (rd.state IN ('xong','bo_qua','khong_ai') OR rd.day < $3) ORDER BY rd.at_ts DESC LIMIT 120`, [fid, addDays(today, -30), today]);
    return { rides: forViewer(me)(rows.map(rideDayOut)) };
  }, { con: true });

  async function act(ctx, fid, rdId, fn) {
    const id = uuidParam(rdId);
    return tx(async (c) => {
      const rd = await R.lockRideDay(c, fid, id);
      const out = await fn(c, rd);
      const row = (await c.query(`${SEL} WHERE rd.id=$1`, [id]))[0];
      return { ride: rideDayOut(row), already: !!out.already };
    });
  }
  const forIdOf = (b) => (b.forId ? uuidParam(b.forId) : null);

  F.post('/ride-days/:id/claim', (ctx, me, fid) => act(ctx, fid, ctx.params.id, (c, rd) => R.claim(c, rd, me, clock.now(), forIdOf(ctx.body))));
  F.post('/ride-days/:id/start', (ctx, me, fid) => act(ctx, fid, ctx.params.id, (c, rd) => R.start(c, rd, me, clock.now())));
  // người ngoài ca chỉ được "Tôi nhận"; muốn báo xong hoặc bỏ qua phải là người trong ca (phụ trách, dự phòng, người đã nhận) hoặc chủ/quản lý
  const mayAct = (me, rd) => isManager(me) || [rd.p0, rd.p1, rd.p2, rd.claimed_by].includes(me.id);
  const needInvolved = (me, rd) => { if (!mayAct(me, rd)) throw forbidden('Chỉ người trong ca này hoặc người quản lý mới báo xong hoặc bỏ qua. Bạn có thể bấm Tôi nhận trước.'); };
  F.post('/ride-days/:id/done', (ctx, me, fid) => act(ctx, fid, ctx.params.id, (c, rd) => { needInvolved(me, rd); return R.finish(c, rd, me, clock.now(), forIdOf(ctx.body)); }));
  F.post('/ride-days/:id/skip', (ctx, me, fid) => act(ctx, fid, ctx.params.id, (c, rd) => { needInvolved(me, rd); return R.skip(c, rd, me, clock.now(), cleanText(ctx.body.reason ?? '', { max: 100, field: 'Lý do' })); }));
  F.post('/ride-days/:id/unskip', (ctx, me, fid) => act(ctx, fid, ctx.params.id, (c, rd) => R.unskip(c, rd)));
  F.post('/ride-days/:id/assign', (ctx, me, fid) => act(ctx, fid, ctx.params.id, async (c, rd) => {
    if (!(isManager(me) || [rd.p0, rd.p1, rd.p2, rd.claimed_by].includes(me.id))) throw forbidden('Chỉ người trong ca này hoặc người quản lý mới đổi người phụ trách');
    return R.assign(c, rd, me, clock.now(), uuidParam(ctx.body.memberId), cleanText(ctx.body.reason ?? '', { max: 100, field: 'Lý do' }));
  }));

  // ghi đè cho một ngày sắp tới của một khuôn (chưa có ca thì sinh ra)
  F.post('/rides/:rid/days/:day/assign', async (ctx, me, fid) => {
    const rid = uuidParam(ctx.params.rid);
    const day = cleanDay(ctx.params.day);
    const now = clock.now(); const today = dayOfMs(now);
    const diff = daysBetween(today, day);
    if (diff < 0 || diff > 30) throw new ApiError(400, 'invalid_input', 'Chỉ đổi người cho các ngày từ hôm nay trở đi trong 30 ngày tới', { field: 'Ngày' });
    return tx(async (c) => {
      const t = (await c.query('SELECT * FROM rides WHERE id=$1 AND family_id=$2', [rid, fid]))[0];
      if (!t) throw new ApiError(404, 'not_found', 'Không tìm thấy ca');
      if (t.weekday !== weekdayISO(day)) throw new ApiError(400, 'invalid_input', 'Ngày này không có ca đó', { field: 'Ngày' });
      await R.ensureRideDays(c, day, fid);
      const rd = (await c.query('SELECT id FROM ride_days WHERE ride_id=$1 AND day=$2', [rid, day]))[0];
      const locked = await R.lockRideDay(c, fid, rd.id);
      if (!(isManager(me) || [t.p0, t.p1, t.p2, locked.claimed_by].includes(me.id))) throw forbidden('Chỉ người trong ca này hoặc người quản lý mới đổi người phụ trách');
      await R.assign(c, locked, me, now, uuidParam(ctx.body.memberId), cleanText(ctx.body.reason ?? '', { max: 100, field: 'Lý do' }));
      const row = (await c.query(`${SEL} WHERE rd.id=$1`, [rd.id]))[0];
      return { ride: rideDayOut(row) };
    });
  });
}
export { atMs };
