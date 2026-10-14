import crypto from 'node:crypto';
import { AppError } from './errors.js';
import { assertUuid } from './ids.js';

export const ROLES = ['quanly', 'letan', 'buongphong', 'ctv', 'sale', 'chu'];

// Ma trận quyền (đặc tả mục 11). Mọi route kiểm bằng can(vai, hành động); dữ liệu còn được lọc theo vai ở máy chủ.
const AGENT = ['availability.search', 'quote.create', 'booking.create', 'booking.read.own', 'booking.cancel.own', 'statement.agent.read.own'];
const PERMISSIONS = {
  quanly: new Set([
    'calendar.read.all', 'availability.search', 'quote.create', 'booking.create', 'booking.read.all', 'booking.cancel', 'booking.move',
    'booking.checkin', 'booking.checkout', 'payment.record', 'payment.refund', 'rates.write', 'promotion.write', 'settings.write',
    'release.any', 'release.own', 'statement.owner.read.all', 'statement.owner.read.own', 'statement.agent.read.all', 'statement.freeze',
    'statement.payout', 'report.custody', 'report.occupancy', 'setup.write', 'housekeeping.read', 'housekeeping.update', 'housekeeping.create', 'ical.manage', 'invite.create', 'member.manage', 'agent.manage', 'bank.review', 'bank.configure',
  ]),
  letan: new Set([
    'calendar.read.all', 'availability.search', 'quote.create', 'booking.create', 'booking.read.all', 'booking.cancel', 'booking.move',
    'booking.checkin', 'booking.checkout', 'payment.record', 'housekeeping.read', 'housekeeping.update', 'housekeeping.create',
  ]),
  buongphong: new Set(['housekeeping.read', 'housekeeping.update']),
  ctv: new Set(AGENT),
  sale: new Set(AGENT),
  chu: new Set(['release.own', 'calendar.read.own', 'statement.owner.read.own']),
};

export function can(role, action) {
  const set = PERMISSIONS[role];
  return !!set && set.has(action);
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function newCode() {
  const bytes = crypto.randomBytes(10); // 80 bit -> 16 ký tự base32
  let bits = 0; let acc = 0; let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{4}/g).join('-');
}
const normalize = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
const hashCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
const memberOf = (r) => ({ id: r.id, orgId: r.org_id, userId: r.user_id, displayName: r.display_name, role: r.role, ownerId: r.owner_id, agentId: r.agent_id });
const MEMBER_COLS = 'id, org_id, user_id, display_name, role, owner_id, agent_id';

// Tổ chức đầu tiên và quản lý đầu tiên (chạy bằng script quản trị, không qua HTTP).
export async function bootstrapOrg(c, { name, userId, displayName }) {
  assertUuid(userId, 'người dùng');
  if (typeof name !== 'string' || !name.trim()) throw new AppError('bad_org', 'Tên tổ chức không hợp lệ');
  if ((await c.query('SELECT 1 FROM members WHERE user_id = $1', [userId])).length) throw new AppError('already_member', 'Người dùng này đã thuộc một tổ chức', 409);
  const [org] = await c.query('INSERT INTO orgs(name) VALUES($1) RETURNING id', [name.trim()]);
  const [m] = await c.query(`INSERT INTO members(org_id, user_id, display_name, role) VALUES($1, $2, $3, 'quanly') RETURNING id`, [org.id, userId, String(displayName || 'Quản lý')]);
  return { orgId: org.id, memberId: m.id };
}

// Tạo mã mời. Trả mã (dạng XXXX-XXXX-XXXX-XXXX) đúng một lần; CSDL chỉ giữ băm.
export async function createInvite(c, { orgId, role, ownerId = null, agentId = null, createdBy = null, ttlDays = 7 }, { now = new Date() } = {}) {
  assertUuid(orgId, 'org');
  if (!ROLES.includes(role)) throw new AppError('bad_invite', 'Vai trò không hợp lệ');
  if ((role === 'chu') !== (ownerId !== null) || (['ctv', 'sale'].includes(role)) !== (agentId !== null)) {
    throw new AppError('bad_invite', 'Vai chủ phòng cần chủ phòng, vai sale/CTV cần sale/CTV, các vai khác không được kèm');
  }
  if (ownerId !== null) {
    assertUuid(ownerId, 'chủ phòng');
    if (!(await c.query('SELECT 1 FROM owners WHERE id = $1 AND org_id = $2', [ownerId, orgId])).length) throw new AppError('bad_invite', 'Chủ phòng không thuộc tổ chức');
  }
  if (agentId !== null) {
    assertUuid(agentId, 'sale/CTV');
    if (!(await c.query('SELECT 1 FROM agents WHERE id = $1 AND org_id = $2', [agentId, orgId])).length) throw new AppError('bad_invite', 'Sale/CTV không thuộc tổ chức');
  }
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 60) throw new AppError('bad_invite', 'Hạn mã mời không hợp lệ');
  const code = newCode();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 3600 * 1000);
  const [row] = await c.query(
    'INSERT INTO invites(org_id, code_hash, role, owner_id, agent_id, created_by, expires_at) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [orgId, hashCode(normalize(code)), role, ownerId, agentId, createdBy, expiresAt],
  );
  return { id: row.id, code, expiresAt };
}

// Dùng mã mời: mã sai, đã dùng, hết hạn đều trả cùng một lỗi (không lộ mã nào tồn tại). Người đã có tổ chức không đốt mã.
export async function redeemInvite(c, { code, userId, displayName }, { now = new Date() } = {}) {
  assertUuid(userId, 'người dùng');
  const norm = normalize(code);
  const invalid = () => new AppError('invite_invalid', 'Mã mời không đúng hoặc đã hết hạn');
  if (norm.length !== 16) throw invalid();
  const [inv] = await c.query('SELECT id, org_id, role, owner_id, agent_id, expires_at, used_at FROM invites WHERE code_hash = $1 FOR UPDATE', [hashCode(norm)]);
  if (!inv || inv.used_at || new Date(inv.expires_at) <= now) throw invalid();
  if ((await c.query('SELECT 1 FROM members WHERE user_id = $1', [userId])).length) throw new AppError('already_member', 'Tài khoản này đã thuộc một tổ chức', 409);
  const [m] = await c.query(
    `INSERT INTO members(org_id, user_id, display_name, role, owner_id, agent_id) VALUES($1, $2, $3, $4, $5, $6) RETURNING ${MEMBER_COLS}`,
    [inv.org_id, userId, String(displayName || 'Thành viên').slice(0, 120), inv.role, inv.owner_id, inv.agent_id],
  );
  await c.query('UPDATE invites SET used_by = $2, used_at = $3 WHERE id = $1', [inv.id, m.id, now]);
  return memberOf(m);
}

export async function getMemberByUser(c, userId) {
  assertUuid(userId, 'người dùng');
  const [m] = await c.query(`SELECT ${MEMBER_COLS} FROM members WHERE user_id = $1 AND status = 'active'`, [userId]);
  return m ? memberOf(m) : null;
}

export async function setMemberStatus(c, { orgId, memberId, status }) {
  assertUuid(orgId, 'org');
  assertUuid(memberId, 'thành viên');
  if (!['active', 'disabled'].includes(status)) throw new AppError('bad_status', 'Trạng thái không hợp lệ');
  const rows = await c.query('UPDATE members SET status = $3 WHERE id = $1 AND org_id = $2 RETURNING id', [memberId, orgId, status]);
  if (!rows.length) throw new AppError('member_not_found', 'Không tìm thấy thành viên', 404);
}
