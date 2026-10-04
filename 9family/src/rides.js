// Ca đưa đón: sinh ca theo ngày từ khuôn tuần, vòng đời ca, leo thang theo mốc thời gian.
import { ApiError } from './errors.js';
import { notifyMembers, activeMemberIds } from './notify.js';
import { atMs, hhmmOfMs, addDays, weekdayISO } from './vn.js';
import { DEFAULT_ESC } from './config.js';

export const OPEN_STATES = ['cho', 'da_nhan', 'dang_di', 'khong_ai'];
export const dirWord = (dir) => (dir === 'dua' ? 'đưa' : 'đón');
export const STALE_MIN = 90; // quá 90 phút sau giờ ca thì không nhắc nữa

export function normEsc(s) {
  const e = { ...DEFAULT_ESC, ...(s && s.esc ? s.esc : {}) };
  return { t1: e.t1, t2: e.t2, t3: e.t3, t4: e.t4, after: e.after };
}

// Mốc leo thang: bước 1 đến 4 trước giờ ca, bước 5 sau giờ ca
export function stepOffsets(esc) {
  return [[1, -esc.t1], [2, -esc.t2], [3, -esc.t3], [4, -esc.t4], [5, esc.after]];
}
// Các bước đã đến hạn tại thời điểm nowMs (chưa trừ bước đã phát)
export function dueSteps(atTsMs, nowMs, esc) {
  if (nowMs > atTsMs + STALE_MIN * 60_000) return [];
  return stepOffsets(esc).filter(([, off]) => atTsMs + off * 60_000 <= nowMs).map(([s]) => s);
}

// Sinh ca của ngày `day` cho một gia đình (hoặc mọi gia đình nếu familyId = null) từ khuôn tuần. Idempotent.
export async function ensureRideDays(c, day, familyId = null) {
  return c.query(
    `INSERT INTO ride_days(family_id, ride_id, child_id, dir, day, at_time, at_ts, place, p0, p1, p2)
     SELECT r.family_id, r.id, r.child_id, r.dir, $1::date, r.at_time,
            ((($1::date + r.at_time::time) - interval '7 hours') AT TIME ZONE 'UTC'), r.place, r.p0, r.p1, r.p2
       FROM rides r WHERE r.weekday = $2 AND ($3::uuid IS NULL OR r.family_id = $3)
     ON CONFLICT DO NOTHING RETURNING id`, [day, weekdayISO(day), familyId]);
}

const nameOf = async (c, id) => (id ? (await c.query('SELECT name FROM members WHERE id=$1', [id]))[0]?.name || '' : '');
const childName = async (c, id) => (await c.query('SELECT name FROM children WHERE id=$1', [id]))[0]?.name || 'con';

export const rideLink = (fid) => `#/f/${fid}/rides`;

async function managers(c, familyId) {
  return (await c.query("SELECT id FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL AND role IN ('chu','quan_ly')", [familyId])).map((r) => r.id);
}

// Người nhận thật (đăng nhập được); người đón hộ không dùng app nên chuyển cho chủ/quản lý
async function reachable(c, familyId, ids) {
  const rows = ids.filter(Boolean);
  if (!rows.length) return [];
  const live = (await c.query('SELECT id, external FROM members WHERE id = ANY($1::uuid[]) AND left_at IS NULL', [rows]));
  const ok = live.filter((m) => !m.external).map((m) => m.id);
  if (live.some((m) => m.external)) ok.push(...(await managers(c, familyId)));
  return [...new Set(ok)];
}

// Soạn thông báo cho từng bước: trả [{ to: [memberId], title, body }]
async function stepMessages(c, rd, step, esc) {
  const cn = await childName(c, rd.child_id);
  const w = dirWord(rd.dir);
  const hhmm = rd.at_time;
  const where = rd.place ? ` · ${rd.place}` : '';
  const all = await activeMemberIds(c, rd.family_id);
  const n0 = await nameOf(c, rd.p0); const n1 = await nameOf(c, rd.p1);
  if (step === 1) {
    if (!rd.p0) return [{ to: all, title: `Chưa ai phụ trách ${w} ${cn}`, body: `Ca ${w} lúc ${hhmm}${where} chưa có người phụ trách. Ai nhận được thì bấm Tôi nhận.` }];
    return [{ to: await reachable(c, rd.family_id, [rd.p0]), title: `Sắp tới giờ ${w} ${cn}`, body: `${hhmm}${where}. Bạn là người phụ trách, bấm Tôi nhận để cả nhà yên tâm.` }];
  }
  if (step === 2) {
    const msgs = [];
    if (rd.p1) msgs.push({ to: await reachable(c, rd.family_id, [rd.p1]), title: `Nhờ bạn ${w} ${cn} lúc ${hhmm}`, body: `${n0 || 'Người phụ trách'} chưa nhận ca${where}. Bạn nhận được không?` });
    if (rd.p0) msgs.push({ to: await reachable(c, rd.family_id, [rd.p0]), title: `Bạn chưa nhận ca ${w} ${cn} lúc ${hhmm}`, body: rd.p1 ? `Đã nhắc ${n1} làm dự phòng.` : 'Chưa có người dự phòng.' });
    return msgs;
  }
  if (step === 3) {
    const msgs = [];
    if (rd.p2) msgs.push({ to: await reachable(c, rd.family_id, [rd.p2]), title: `Nhờ bạn ${w} ${cn} lúc ${hhmm}`, body: `Chưa ai nhận ca${where}. Bạn là người dự phòng thứ hai.` });
    return msgs;
  }
  if (step === 4) return [{ to: all, title: `Chưa ai nhận ca ${w} ${cn} lúc ${hhmm}`, body: `Còn ${esc.t4} phút nữa là tới giờ${where}. Ai nhận được thì bấm Tôi nhận.` }];
  if (rd.state === 'cho' || rd.state === 'khong_ai') return [{ to: all, title: `Quá giờ ${w} ${cn} ${esc.after} phút, chưa ai nhận`, body: `Ca ${w} lúc ${hhmm}${where} vẫn chưa có người nhận. Hãy gọi hỏi nhau ngay.` }];
  return [{ to: all, title: `Chưa thấy báo xong ca ${w} ${cn}`, body: `Ca ${w} lúc ${hhmm} đã quá ${esc.after} phút. ${rd.state === 'da_nhan' ? (await nameOf(c, rd.claimed_by || rd.p0)) + ' đã nhận nhưng ' : ''}chưa bấm ${rd.dir === 'dua' ? 'Đã đưa' : 'Đã đón'}.` }];
}

// Phát các bước đến hạn của một ca. Chạy trong giao dịch, khóa dòng ca nên hai bản chạy song song không phát trùng.
export async function fireRideDay(c, rdId, nowMs) {
  const rd = (await c.query('SELECT * FROM ride_days WHERE id=$1 FOR UPDATE', [rdId]))[0];
  if (!rd || !OPEN_STATES.includes(rd.state)) return { fired: 0 };
  const fam = (await c.query('SELECT settings FROM families WHERE id=$1', [rd.family_id]))[0];
  if (!fam) return { fired: 0 };
  const esc = normEsc(fam.settings);
  const atMsv = new Date(rd.at_ts).getTime();
  const due = dueSteps(atMsv, nowMs, esc);
  if (!due.length) return { fired: 0 };
  const done = new Set((await c.query('SELECT step FROM ride_steps WHERE ride_day_id=$1', [rdId])).map((r) => r.step));
  // bước 1 đến 4 chỉ có nghĩa khi ca còn "chờ"; bước 5 áp dụng cho mọi ca chưa xong
  const todo = due.filter((s) => !done.has(s) && (s === 5 || rd.state === 'cho'));
  if (!todo.length) return { fired: 0 };
  await c.query('INSERT INTO ride_steps(ride_day_id, step) SELECT $1, unnest($2::smallint[]) ON CONFLICT DO NOTHING', [rdId, todo]);
  // đồng bộ sau thời gian chết: mỗi người chỉ nhận thông báo của bước cao nhất đến hạn
  const perMember = new Map();
  for (const s of todo) for (const m of await stepMessages(c, rd, s, esc)) for (const id of m.to) perMember.set(id, { step: s, title: m.title, body: m.body });
  let sent = 0;
  for (const [id, m] of perMember) {
    sent += await notifyMembers(c, { familyId: rd.family_id, memberIds: [id], type: 'ride', title: m.title, body: m.body, link: rideLink(rd.family_id), dedupe: `ride:${rd.id}:s${m.step}` });
  }
  if (todo.includes(5) && rd.state === 'cho') await c.query("UPDATE ride_days SET state='khong_ai' WHERE id=$1", [rdId]);
  await c.query('UPDATE families SET rev = rev + 1 WHERE id=$1', [rd.family_id]);
  return { fired: todo.length, sent };
}

// ---------- vòng đời ca ----------
const conflict = (code, msg, extra) => new ApiError(409, code, msg, extra);

export async function lockRideDay(c, familyId, rdId) {
  const rd = (await c.query('SELECT * FROM ride_days WHERE id=$1 AND family_id=$2 FOR UPDATE', [rdId, familyId]))[0];
  if (!rd) throw new ApiError(404, 'not_found', 'Không tìm thấy ca này');
  return rd;
}

async function othersAlerted(c, rd, exceptId) {
  const rows = await c.query("SELECT DISTINCT member_id FROM notifications WHERE dedupe_key LIKE $1", [`ride:${rd.id}:s%`]);
  return rows.map((r) => r.member_id).filter((id) => id !== exceptId);
}

// Người nhận hoặc được giao ca trở thành người phụ trách; nếu họ đang là dự phòng thì người phụ trách cũ đổi chỗ với họ (không ai bị liệt kê hai lần)
export function takeOver(rd, who) {
  let p1 = rd.p1; let p2 = rd.p2;
  if (rd.p1 === who) p1 = rd.p0 === who ? null : rd.p0; else if (rd.p2 === who) p2 = rd.p0 === who ? null : rd.p0;
  return { p0: who, p1, p2 };
}

// "Tôi nhận": người đầu tiên thắng. forId: ghi nhận thay người đón hộ (người đón hộ không có app).
export async function claim(c, rd, actor, nowMs, forId = null) {
  if (rd.state === 'xong') throw conflict('already_done', 'Ca này đã xong rồi');
  if (rd.state === 'bo_qua') throw conflict('skipped', 'Ca này đã được bỏ qua');
  if (rd.state === 'da_nhan' || rd.state === 'dang_di') {
    if (rd.claimed_by === (forId || actor.id)) return { already: true, rd };
    throw conflict('already_claimed', `${await nameOf(c, rd.claimed_by) || 'Người khác'} đã nhận ca này rồi`, { by: rd.claimed_by });
  }
  let who = actor.id;
  if (forId && forId !== actor.id) {
    const ext = (await c.query('SELECT id FROM members WHERE id=$1 AND family_id=$2 AND external=true AND left_at IS NULL', [forId, rd.family_id]))[0];
    if (!ext) throw new ApiError(400, 'invalid_input', 'Người đón hộ không hợp lệ');
    who = forId;
  }
  const slots = takeOver(rd, who);
  const row = (await c.query(
    "UPDATE ride_days SET state='da_nhan', claimed_by=$2, claimed_at=$3, p0=$4, p1=$5, p2=$6 WHERE id=$1 RETURNING *", [rd.id, who, new Date(nowMs).toISOString(), slots.p0, slots.p1, slots.p2]))[0];
  const cn = await childName(c, rd.child_id); const nm = await nameOf(c, who);
  const to = await othersAlerted(c, rd, actor.id);
  await notifyMembers(c, { familyId: rd.family_id, memberIds: to, type: 'ride', title: `${nm} đã nhận ca ${dirWord(rd.dir)} ${cn}`, body: `Lúc ${rd.at_time}${rd.place ? ' · ' + rd.place : ''}. Không cần lo nữa.`, link: rideLink(rd.family_id), dedupe: `ride:${rd.id}:claim` });
  return { rd: row };
}

export async function start(c, rd, actor, nowMs) {
  if (rd.state === 'dang_di') return { already: true, rd };
  if (rd.state !== 'da_nhan') throw conflict('bad_state', 'Chỉ báo "đang đi" được khi đã nhận ca');
  if (rd.claimed_by !== actor.id) throw new ApiError(403, 'forbidden', 'Chỉ người đã nhận ca mới báo đang đi');
  const row = (await c.query("UPDATE ride_days SET state='dang_di' WHERE id=$1 RETURNING *", [rd.id]))[0];
  return { rd: row };
}

export async function finish(c, rd, actor, nowMs, forId = null) {
  if (rd.state === 'xong') return { already: true, rd };
  if (rd.state === 'bo_qua') throw conflict('skipped', 'Ca này đã được bỏ qua');
  let who = actor.id;
  if (forId && forId !== actor.id) {
    const ext = (await c.query('SELECT id FROM members WHERE id=$1 AND family_id=$2 AND external=true AND left_at IS NULL', [forId, rd.family_id]))[0];
    if (!ext) throw new ApiError(400, 'invalid_input', 'Người đón hộ không hợp lệ');
    who = forId;
  }
  const at = new Date(nowMs).toISOString();
  const row = (await c.query(
    "UPDATE ride_days SET state='xong', done_by=$2, done_at=$3, claimed_by=COALESCE(claimed_by,$2), claimed_at=COALESCE(claimed_at,$3) WHERE id=$1 RETURNING *", [rd.id, who, at]))[0];
  const cn = await childName(c, rd.child_id); const nm = await nameOf(c, who);
  const all = (await activeMemberIds(c, rd.family_id)).filter((id) => id !== actor.id);
  const verb = rd.dir === 'dua' ? 'đã đưa' : 'đã đón';
  await notifyMembers(c, { familyId: rd.family_id, memberIds: all, type: 'ride', title: `${cn} ${verb} xong`, body: `${nm} ${verb} ${cn} lúc ${hhmmOfMs(nowMs)}.`, link: rideLink(rd.family_id), dedupe: `ride:${rd.id}:done` });
  return { rd: row };
}

export async function skip(c, rd, actor, nowMs, reason) {
  if (rd.state === 'bo_qua') return { already: true, rd };
  if (rd.state === 'xong') throw conflict('already_done', 'Ca này đã xong rồi, không bỏ qua được');
  const row = (await c.query("UPDATE ride_days SET state='bo_qua', skip_by=$2, skip_reason=$3 WHERE id=$1 RETURNING *", [rd.id, actor.id, reason]))[0];
  const cn = await childName(c, rd.child_id);
  const all = (await activeMemberIds(c, rd.family_id)).filter((id) => id !== actor.id);
  await notifyMembers(c, { familyId: rd.family_id, memberIds: all, type: 'ride', title: `Bỏ qua ca ${dirWord(rd.dir)} ${cn} lúc ${rd.at_time}`, body: reason ? `Lý do: ${reason}` : 'Không cần đưa đón ca này.', link: rideLink(rd.family_id), dedupe: `ride:${rd.id}:skip` });
  return { rd: row };
}

export async function unskip(c, rd) {
  if (rd.state !== 'bo_qua') return { already: true, rd };
  const row = (await c.query("UPDATE ride_days SET state='cho', skip_by=NULL, skip_reason='' WHERE id=$1 RETURNING *", [rd.id]))[0];
  return { rd: row };
}

// Ghi đè người phụ trách một ngày. Đặt lại ca về "chờ" để người mới nhận.
export async function assign(c, rd, actor, nowMs, memberId, reason) {
  if (rd.state === 'xong' || rd.state === 'bo_qua') throw conflict('bad_state', 'Ca này đã kết thúc, không đổi người được');
  const m = (await c.query('SELECT id, name, external FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL', [memberId, rd.family_id]))[0];
  if (!m) throw new ApiError(400, 'invalid_input', 'Người này không còn trong gia đình');
  const old = rd.p0;
  const slots = takeOver(rd, memberId);
  const row = (await c.query(
    `UPDATE ride_days SET p0=$2, p1=$6, p2=$7, state='cho', claimed_by=NULL, claimed_at=NULL, override_by=$3, override_reason=$4, override_at=$5 WHERE id=$1 RETURNING *`,
    [rd.id, memberId, actor.id, reason, new Date(nowMs).toISOString(), slots.p1, slots.p2]))[0];
  const cn = await childName(c, rd.child_id); const w = dirWord(rd.dir);
  const by = await nameOf(c, actor.id);
  if (memberId !== actor.id) {
    await notifyMembers(c, { familyId: rd.family_id, memberIds: await reachable(c, rd.family_id, [memberId]), type: 'ride', title: `Nhờ bạn ${w} ${cn} lúc ${rd.at_time}`, body: `${by} nhờ bạn${reason ? ': ' + reason : ''}${rd.place ? ' · ' + rd.place : ''}. Bấm Tôi nhận nhé.`, link: rideLink(rd.family_id), dedupe: `ride:${rd.id}:asg:${memberId}:${nowMs}` });
  }
  if (old && old !== memberId && old !== actor.id) {
    await notifyMembers(c, { familyId: rd.family_id, memberIds: await reachable(c, rd.family_id, [old]), type: 'ride', title: `Ca ${w} ${cn} lúc ${rd.at_time} đã chuyển cho ${m.name}`, body: `${by} đổi người${reason ? ': ' + reason : ''}. Bạn không cần lo ca này.`, link: rideLink(rd.family_id), dedupe: `ride:${rd.id}:out:${old}:${nowMs}` });
  }
  return { rd: row };
}
export { atMs, addDays };
