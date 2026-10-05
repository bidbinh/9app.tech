// Thao tác thành viên dùng chung (tách khỏi routes/families.js để src/id.js dùng được mà không vòng import).
import { newToken } from './util.js';

// Cắt mọi liên kết của một thành viên khi họ rời đi hoặc bị mời ra (ca đưa đón, nhắc, thiết bị, lịch ICS).
export async function detachMember(c, m, nowMs) {
  const at = new Date(nowMs).toISOString();
  await c.query('DELETE FROM sessions WHERE member_id=$1', [m.id]);
  await c.query('DELETE FROM push_subs WHERE member_id=$1', [m.id]);
  await c.query('DELETE FROM invites WHERE member_id=$1', [m.id]);
  await c.query('UPDATE rides SET p0 = CASE WHEN p0=$1 THEN NULL ELSE p0 END, p1 = CASE WHEN p1=$1 THEN NULL ELSE p1 END, p2 = CASE WHEN p2=$1 THEN NULL ELSE p2 END WHERE family_id=$2', [m.id, m.family_id]);
  await c.query(
    `UPDATE ride_days SET p0 = CASE WHEN p0=$1 THEN NULL ELSE p0 END, p1 = CASE WHEN p1=$1 THEN NULL ELSE p1 END, p2 = CASE WHEN p2=$1 THEN NULL ELSE p2 END,
            state = CASE WHEN state IN ('da_nhan','dang_di') AND claimed_by=$1 THEN 'cho' ELSE state END,
            claimed_by = CASE WHEN state IN ('da_nhan','dang_di') AND claimed_by=$1 THEN NULL ELSE claimed_by END
      WHERE family_id=$2 AND state IN ('cho','da_nhan','dang_di','khong_ai')`, [m.id, m.family_id]);
  await c.query('UPDATE events SET member_ids = array_remove(member_ids, $1) WHERE family_id=$2 AND $1 = ANY(member_ids)', [m.id, m.family_id]);
  await c.query('UPDATE tasks SET assignee_id = NULL WHERE assignee_id=$1', [m.id]);
  await c.query('UPDATE members SET left_at=$2, ics_token=NULL WHERE id=$1', [m.id, at]);
}

// Cấp token ICS mới và gỡ đăng ký đẩy của một thành viên (trừ thiết bị keepSid nếu có). Dùng khi nghi lộ link lịch.
export async function resetMemberDevices(c, memberId, keepSid = null) {
  await c.query('DELETE FROM push_subs WHERE member_id=$1 AND ($2::text IS NULL OR sid <> $2)', [memberId, keepSid]);
  await c.query('UPDATE members SET ics_token = $2 WHERE id=$1 AND left_at IS NULL AND external = false', [memberId, newToken()]);
}

// Gộp thành viên cũ `from` (chưa có tài khoản) vào `to` (đã có tài khoản): mọi tham chiếu tới `from` chuyển sang `to`, rồi xóa `from`.
// Tự dò mọi khóa ngoại trỏ tới members(id) nên các bảng thêm sau này cũng được chuyển.
export async function mergeMembers(c, from, to) {
  await c.query('DELETE FROM sessions WHERE member_id=$1', [from.id]);
  await c.query('DELETE FROM invites WHERE member_id=$1', [from.id]);
  await c.query('DELETE FROM push_subs p WHERE p.member_id=$1 AND EXISTS (SELECT 1 FROM push_subs q WHERE q.member_id=$2 AND q.endpoint = p.endpoint)', [from.id, to.id]);
  await c.query('DELETE FROM notifications n WHERE n.member_id=$1 AND n.dedupe_key IS NOT NULL AND EXISTS (SELECT 1 FROM notifications q WHERE q.member_id=$2 AND q.dedupe_key = n.dedupe_key)', [from.id, to.id]);
  const fks = await c.query(
    `SELECT k.conrelid::regclass::text AS tbl, a.attname AS col FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND k.confrelid = 'members'::regclass AND array_length(k.conkey, 1) = 1 AND k.conrelid <> 'members'::regclass`);
  for (const fk of fks) await c.query(`UPDATE ${fk.tbl} SET ${fk.col} = $2 WHERE ${fk.col} = $1`, [from.id, to.id]);
  await c.query('UPDATE events SET member_ids = array_replace(member_ids, $1::uuid, $2::uuid) WHERE family_id=$3 AND $1::uuid = ANY(member_ids)', [from.id, to.id, from.family_id]);
  if (to.relation === 'khac' && from.relation && from.relation !== 'khac') await c.query('UPDATE members SET relation=$2 WHERE id=$1', [to.id, from.relation]);
  await c.query('DELETE FROM members WHERE id=$1', [from.id]);
}
