// Nhắc sức khỏe: uống thuốc và lịch tiêm. Chạy trong bộ lập lịch (scheduler.js).
// An toàn khi khởi động lại và khi chạy hai bản: mỗi lần nhắc đi qua khóa chính hm_fires (INSERT ... ON CONFLICT DO NOTHING) nên chỉ phát đúng một lần.
// QUYỀN RIÊNG TƯ: nội dung thông báo (trong app và đẩy) luôn CHUNG CHUNG ("Nhắc sức khỏe"), không bao giờ có tên thuốc, bệnh, vắc xin, tên người.
import { query, tx } from '../db.js';
import { dayOfMs, addDays, atMs } from '../vn.js';
import { notifyMembers } from '../notify.js';

export const HEALTH_TITLE = 'Nhắc sức khỏe';
export const HEALTH_BODY = 'Mở 9family để xem chi tiết.';
const LATE_MS = 30 * 60_000; // nhắc thuốc muộn tối đa 30 phút sau giờ (khởi động lại muộn hơn thì bỏ qua, không dồn nhắc)

const activeIds = async (c, ids) => ids.length
  ? (await c.query('SELECT id FROM members WHERE id = ANY($1::uuid[]) AND left_at IS NULL AND external = false AND joined_at IS NOT NULL', [ids])).map((r) => r.id) : [];

// Ai nhận nhắc cho một hồ sơ: con = chủ/quản lý + người được giao phụ trách; người lớn có tài khoản = chính họ; người lớn chưa có tài khoản = chủ/quản lý.
export async function healthRecipients(c, s) {
  const managers = async () => (await c.query("SELECT id FROM members WHERE family_id=$1 AND role IN ('chu','quan_ly') AND left_at IS NULL AND external=false AND joined_at IS NOT NULL", [s.family_id])).map((r) => r.id);
  if (s.child_id) return [...new Set([...(await managers()), ...(await activeIds(c, s.shared_with || []))])];
  const m = (await c.query('SELECT id, joined_at, user_id FROM members WHERE id=$1 AND left_at IS NULL', [s.member_id]))[0];
  if (m && (m.joined_at || m.user_id)) return [m.id];
  return managers();
}

async function claim(c, key) {
  return (await c.query('INSERT INTO hm_fires(key) VALUES($1) ON CONFLICT DO NOTHING RETURNING 1', [key])).length > 0;
}

export async function medStage(nowMs) {
  const today = dayOfMs(nowMs);
  const meds = await query(
    `SELECT m.id, m.family_id, m.times, m.notify_ids, s.child_id, s.member_id, s.shared_with
       FROM health_meds m JOIN health_subjects s ON s.id = m.subject_id
      WHERE m.remind AND m.stopped_at IS NULL AND m.start_date <= $1 AND (m.end_date IS NULL OR m.end_date >= $1) AND cardinality(m.times) > 0`, [today]);
  let n = 0;
  for (const m of meds) {
    for (const t of m.times) {
      const fireAt = atMs(today, t);
      if (nowMs < fireAt || nowMs > fireAt + LATE_MS) continue;
      try {
        n += await tx(async (c) => {
          if ((await c.query('SELECT 1 FROM health_med_logs WHERE med_id=$1 AND day=$2 AND time=$3', [m.id, today, t])).length) return 0; // đã uống rồi thì khỏi nhắc
          if (!(await claim(c, `med:${m.id}:${today}:${t}`))) return 0;
          const who = m.notify_ids.length ? await activeIds(c, m.notify_ids) : [];
          const to = who.length ? who : await healthRecipients(c, { ...m, family_id: m.family_id });
          return notifyMembers(c, { familyId: m.family_id, memberIds: to, type: 'health', title: HEALTH_TITLE, body: HEALTH_BODY, link: `#/f/${m.family_id}/health`, dedupe: `med:${m.id}:${today}:${t}` });
        });
      } catch (e) { console.error('[scheduler:med]', e && e.code ? `code=${e.code}` : 'lỗi'); }
    }
  }
  return n;
}

export async function vaccineStage(nowMs) {
  const today = dayOfMs(nowMs);
  const rows = await query(
    `SELECT v.id, v.due_date, v.family_id, s.child_id, s.member_id, s.shared_with
       FROM health_vaccines v JOIN health_subjects s ON s.id = v.subject_id
      WHERE v.done_on IS NULL AND v.due_date BETWEEN $1 AND $2`, [today, addDays(today, 7)]);
  let n = 0;
  for (const v of rows) {
    for (const off of [7, 0]) {
      const fireDay = addDays(v.due_date, -off);
      if (today < fireDay || nowMs < atMs(fireDay, '08:00')) continue;
      if (off === 7 && today >= v.due_date) continue; // đã đến ngày thì chỉ nhắc một lần "hôm nay"
      try {
        n += await tx(async (c) => {
          if (!(await claim(c, `vax:${v.id}:${off}`))) return 0;
          return notifyMembers(c, { familyId: v.family_id, memberIds: await healthRecipients(c, v), type: 'health', title: HEALTH_TITLE, body: HEALTH_BODY, link: `#/f/${v.family_id}/health`, dedupe: `vax:${v.id}:${off}` });
        });
      } catch (e) { console.error('[scheduler:vax]', e && e.code ? `code=${e.code}` : 'lỗi'); }
    }
  }
  return n;
}

export const healthStage = async (nowMs) => (await medStage(nowMs)) + (await vaccineStage(nowMs));
