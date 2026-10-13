// Dịch vụ gia đình dùng chung cho API cookie, API nội bộ và xóa tài khoản.
import { ApiError } from './errors.js';
import { query } from './db.js';
import { notFound, forbidden } from './util.js';

export const ADULT_ROLES = ['chu', 'quan_ly', 'thanh_vien'];
export const ROLE_LABEL = { chu: 'Chủ gia đình', quan_ly: 'Quản lý', thanh_vien: 'Thành viên', con: 'Con' };

// Ma trận quyền (xem docs/superpowers/specs/2026-10-05-9id-design.md mục 3)
const PERM = {
  rename: ['chu', 'quan_ly'],
  editChildren: ['chu', 'quan_ly'],
  invite: ['chu', 'quan_ly'],
  inviteManager: ['chu'],
  changeRoles: ['chu'],
  viewNotes: ['chu', 'quan_ly', 'thanh_vien'],
  viewAllChildren: ['chu', 'quan_ly', 'thanh_vien'],
  transfer: ['chu'],
  settings: ['chu'],
  approve: ['chu', 'quan_ly'],
  delete: ['chu'],
  leave: ['quan_ly', 'thanh_vien', 'con'],
  removeThanhVien: ['chu', 'quan_ly'],
  removeQuanLy: ['chu'],
};
export const can = (role, action) => (PERM[action] || []).includes(role);
export function canMap(role) {
  const out = {};
  for (const k of Object.keys(PERM)) out[k] = can(role, k);
  return out;
}
export const need = (role, action, msg) => { if (!can(role, action)) throw forbidden(msg); };

// Khóa hàng gia đình (mọi thay đổi thành viên phải khóa trước, và luôn khóa gia đình TRƯỚC các hàng khác để không kẹt khóa)
export async function lockFamily(c, fid) {
  const f = (await c.query('SELECT * FROM families WHERE id=$1 FOR UPDATE', [fid]))[0];
  if (!f) throw notFound();
  return f;
}

// Vai trò hiện tại của user trong gia đình, hoặc null
export async function roleOf(q, fid, uid) {
  const r = (await q('SELECT role FROM memberships WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL', [fid, uid]))[0];
  return r ? r.role : null;
}

// Người ngoài gia đình và gia đình không tồn tại đều nhận 404 như nhau
export async function requireMember(q, fid, uid) {
  const r = (await q(
    `SELECT f.id, f.name, f.created_at, f.require_approval, f.notes_for_new, m.role, m.joined_at FROM memberships m JOIN families f ON f.id = m.family_id
      WHERE m.family_id=$1 AND m.user_id=$2 AND m.left_at IS NULL`, [fid, uid]))[0];
  if (!r) throw notFound();
  return r;
}

// Ghi chú sức khỏe/dị ứng của trẻ: không trả cho thành viên (không phải chủ) vừa vào dưới 24 giờ, trừ khi chủ bật
export function notesHidden(f) {
  if (f.role === 'chu' || f.role === 'con' || f.notes_for_new) return false;
  return Date.now() - new Date(f.joined_at).getTime() < 24 * 3600_000;
}

// Thu hồi mọi lời mời còn hiệu lực do một người gửi (khi họ bị gỡ, rời, hoặc hạ vai không còn quyền mời)
export async function revokeInvitesBy(c, fid, uid) {
  await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE family_id=$1 AND invited_by=$2 AND status IN ('pending','awaiting')", [fid, uid]);
}

// Thành viên nhìn thấy theo vai trò người xem: con chỉ thấy người lớn và chính mình
export async function listMembers(q, fid, viewerRole, viewerId) {
  const rows = await q(
    `SELECT m.user_id, m.role, m.joined_at, u.display_name FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.family_id=$1 AND m.left_at IS NULL ORDER BY CASE m.role WHEN 'chu' THEN 0 WHEN 'quan_ly' THEN 1 WHEN 'thanh_vien' THEN 2 ELSE 3 END, m.joined_at`, [fid]);
  return rows
    .filter((r) => viewerRole !== 'con' || r.role !== 'con' || r.user_id === viewerId)
    .map((r) => ({ userId: r.user_id, displayName: r.display_name, role: r.role, joinedAt: r.joined_at, isMe: r.user_id === viewerId }));
}

// Hồ sơ con theo vai trò người xem: con chỉ thấy hồ sơ của mình, không có ghi chú
export async function listChildren(q, fid, viewerRole, viewerId, { withArchived = true, hideNotes = false } = {}) {
  const rows = await q(
    `SELECT c.id, c.name, c.birth_year, c.note, c.linked_user_id, c.archived_at, c.created_at, u.display_name AS linked_name,
            EXISTS (SELECT 1 FROM invitations i WHERE i.child_id = c.id AND i.status='pending' AND i.expires_at > now()) AS invite_pending
       FROM child_profiles c LEFT JOIN users u ON u.id = c.linked_user_id
      WHERE c.family_id=$1 ${withArchived ? '' : 'AND c.archived_at IS NULL'} ORDER BY c.archived_at IS NOT NULL, c.created_at`, [fid]);
  const isCon = viewerRole === 'con';
  return rows
    .filter((r) => !isCon || r.linked_user_id === viewerId)
    .map((r) => ({
      id: r.id, name: r.name, birthYear: r.birth_year, ...(isCon || hideNotes ? {} : { note: r.note }),
      linkedUserId: r.linked_user_id, linkedName: isCon ? undefined : (r.linked_name || null),
      invitePending: isCon ? undefined : r.invite_pending, archived: !!r.archived_at,
    }));
}

// Chuyển quyền chủ: chủ cũ thành quan_ly TRƯỚC, rồi người nhận thành chu (chỉ mục duy nhất một chủ kiểm từng câu lệnh)
export async function transferOwner(c, fid, fromUid, toUid) {
  const to = (await c.query("SELECT role FROM memberships WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL AND role IN ('quan_ly','thanh_vien')", [fid, toUid]))[0];
  if (!to) throw new ApiError(400, 'invalid_target', 'Chỉ chuyển quyền chủ cho một người lớn đang ở trong gia đình');
  await c.query("UPDATE memberships SET role='quan_ly' WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL AND role='chu'", [fid, fromUid]);
  await c.query("UPDATE memberships SET role='chu' WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL", [fid, toUid]);
}

// Gỡ nối tài khoản khỏi hồ sơ con (và đóng membership con) trong gia đình
export async function unlinkUser(c, fid, uid) {
  await c.query('UPDATE child_profiles SET linked_user_id = NULL WHERE family_id=$1 AND linked_user_id=$2', [fid, uid]);
  await c.query("UPDATE memberships SET left_at = now() WHERE family_id=$1 AND user_id=$2 AND role='con' AND left_at IS NULL", [fid, uid]);
}

export async function countPendingFor(phoneHashValue) {
  return (await query("SELECT count(*)::int AS n FROM invitations WHERE phone_hash=$1 AND status='pending' AND expires_at > now()", [phoneHashValue]))[0].n;
}
