// Bộ lập lịch trong tiến trình: sinh ca đưa đón, leo thang, nhắc sự kiện/việc, gửi Web Push.
// An toàn khi khởi động lại và khi chạy hai bản: mọi lần phát đều đi qua khóa chính (ride_steps, event_fires)
// hoặc khóa dòng (FOR UPDATE), nên mỗi mốc chỉ phát đúng một lần.
import { config } from './config.js';
import { query, tx } from './db.js';
import { clock } from './clock.js';
import { dayOfMs, addDays, atMs, hhmmOfMs } from './vn.js';
import { expand, makeLunarCache, occStartMs } from './recur.js';
import { notifyMembers, activeMemberIds, childMemberIds } from './notify.js';
import { ensureRideDays, fireRideDay, OPEN_STATES } from './rides.js';
import { drainOutbox } from './push.js';
import { solarToLunar } from './lunar.js';
import { shopReminderStage } from './routes/menu-shop.js';
import { healthStage } from './health/reminders.js';
import { dueStage } from './money/reminders.js';

const EVENT_LATE_MS = 30 * 60_000;

async function rideStage(nowMs) {
  const today = dayOfMs(nowMs);
  await tx(async (c) => { await ensureRideDays(c, today); await ensureRideDays(c, addDays(today, 1)); });
  const lo = new Date(nowMs - (130 + 5) * 60_000).toISOString();
  const hi = new Date(nowMs + 4 * 3600_000).toISOString();
  const rows = await query(`SELECT id FROM ride_days WHERE state = ANY($1::text[]) AND at_ts BETWEEN $2 AND $3 ORDER BY at_ts`, [OPEN_STATES, lo, hi]);
  let fired = 0;
  for (const r of rows) {
    try { fired += (await tx((c) => fireRideDay(c, r.id, nowMs))).fired; } catch (e) { logErr('ride', e); }
  }
  return fired;
}

const KIND_IMPORTANT = 'ngay_quan_trong';

async function eventStage(nowMs) {
  const from = dayOfMs(nowMs - 86400_000); const to = dayOfMs(nowMs + 2 * 86400_000);
  const events = await query(
    `SELECT * FROM events WHERE cardinality(notify_offsets) > 0 AND start_date <= $2 AND (until_date IS NULL OR until_date >= $1)`, [from, to]);
  if (!events.length) return 0;
  const exRows = await query('SELECT * FROM event_exceptions WHERE event_id = ANY($1::uuid[]) AND day BETWEEN $2 AND $3', [events.map((e) => e.id), from, to]);
  const exBy = new Map();
  for (const x of exRows) { if (!exBy.has(x.event_id)) exBy.set(x.event_id, new Map()); exBy.get(x.event_id).set(x.day, x); }
  const lunar = makeLunarCache();
  let fired = 0;
  for (const ev of events) {
    for (const occ of expand(ev, from, to, exBy.get(ev.id) || new Map(), lunar)) {
      const startMs = occStartMs(occ);
      for (const off of ev.notify_offsets) {
        const fireAt = startMs - off * 60_000;
        // sự kiện cả ngày: cho phép nhắc muộn tới 12:00 (khởi động lại buổi sáng vẫn nhắc); sự kiện có giờ: muộn tối đa 30 phút, không quá 10 phút sau giờ bắt đầu
        const lastOk = occ.allDay ? Math.min(fireAt + 5 * 3600_000, atMs(occ.day, '12:00')) : Math.min(fireAt + EVENT_LATE_MS, startMs + 10 * 60_000);
        if (fireAt > nowMs || nowMs > lastOk) continue;
        try {
          fired += await tx(async (c) => {
            const ins = await c.query('INSERT INTO event_fires(event_id, day, offset_min) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1', [ev.id, occ.day, off]);
            if (!ins.length) return 0;
            const msg = eventMessage(ev, occ, off);
            const who = [...(ev.member_ids.length ? ev.member_ids : await activeMemberIds(c, ev.family_id)), ...(await childMemberIds(c, ev.family_id, ev.child_ids))];
            return notifyMembers(c, { familyId: ev.family_id, memberIds: who, type: ev.kind === KIND_IMPORTANT ? 'important' : 'event', title: msg.title, body: msg.body, link: `#/f/${ev.family_id}/today`, dedupe: `ev:${ev.id}:${occ.day}:${off}:${startMs}` });
          });
        } catch (e) { logErr('event', e); }
      }
    }
  }
  return fired;
}

export function eventMessage(ev, occ, off) {
  const place = occ.location ? ` · ${occ.location}` : '';
  const l = ev.rec_type === 'yearly_lunar' || ev.rec_type === 'monthly_lunar' ? solarToLunar(occ.day) : null;
  const lun = l ? ` (âm lịch ${l.day}/${l.month})` : '';
  if (occ.allDay) {
    const when = off >= 1440 ? 'Ngày mai' : 'Hôm nay';
    return { title: `${when}: ${occ.title}`, body: `Cả ngày${lun}${place}` };
  }
  if (off === 0) return { title: `Đến giờ: ${occ.title}`, body: `${occ.start}${place}` };
  const lead = off >= 1440 ? 'Ngày mai' : off >= 60 ? `${off / 60 === Math.floor(off / 60) ? off / 60 : (off / 60).toFixed(1)} giờ nữa` : `${off} phút nữa`;
  return { title: `${lead}: ${occ.title}`, body: `${occ.start}${place}` };
}

async function taskStage(nowMs) {
  const today = dayOfMs(nowMs);
  const rows = await query(`SELECT id, family_id, title, assignee_id, due_date FROM tasks WHERE done_at IS NULL AND due_fired = false AND assignee_id IS NOT NULL AND due_date IS NOT NULL AND due_date <= $1`, [today]);
  let n = 0;
  for (const t of rows) {
    if (nowMs < atMs(t.due_date, '07:00')) continue;
    try {
      n += await tx(async (c) => {
        const up = await c.query('UPDATE tasks SET due_fired = true WHERE id=$1 AND due_fired = false RETURNING 1', [t.id]);
        if (!up.length) return 0;
        return notifyMembers(c, { familyId: t.family_id, memberIds: [t.assignee_id], type: 'task', title: `Việc đến hạn: ${t.title}`, body: t.due_date < today ? 'Đã quá hạn' : 'Hạn là hôm nay', link: `#/f/${t.family_id}/tasks`, dedupe: `task:${t.id}:due` });
      });
    } catch (e) { logErr('task', e); }
  }
  return n;
}

function logErr(where, e) {
  console.error(`[scheduler:${where}]`, e && e.code ? `code=${e.code}` : String(e && e.message).slice(0, 120));
}

let running = false;
// Một vòng. nowMs để kiểm thử đưa đồng hồ giả vào.
export async function tick(nowMs = clock.now()) {
  const out = { rides: 0, events: 0, tasks: 0, push: null };
  out.rides = await rideStage(nowMs);
  out.events = await eventStage(nowMs);
  out.tasks = await taskStage(nowMs);
  try { out.shop = await shopReminderStage(nowMs); } catch (e) { logErr('shop', e); }
  try { out.health = await healthStage(nowMs); } catch (e) { logErr('health', e); }
  try { out.dues = await dueStage(nowMs); } catch (e) { logErr('dues', e); }
  out.push = await drainOutbox({ nowMs });
  return out;
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { logErr('tick', e); } finally { running = false; }
  };
  timer = setInterval(run, config.schedulerEveryMs);
  timer.unref?.();
  run();
}
export function stopScheduler() { if (timer) { clearInterval(timer); timer = null; } }
