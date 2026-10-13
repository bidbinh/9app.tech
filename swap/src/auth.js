import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { sha256hex, UUID_RE } from './util.js';

export const COOKIE = 'swsid';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Đọc cookie phiên ẩn danh; ctx.sid là băm SHA-256 của token (token thật không bao giờ vào CSDL)
export async function resolveSession(ctx) {
  const t = ctx.cookies[COOKIE];
  if (t && TOKEN_RE.test(t)) ctx.sid = sha256hex(t);
  return null;
}

// Có cookie thì dùng, chưa có thì cấp mới
export function ensureSession(ctx) {
  if (ctx.sid) return ctx.sid;
  const token = crypto.randomBytes(32).toString('base64url');
  ctx.setCookie(COOKIE, token, { maxAge: config.sessionDays * 86400 });
  ctx.sid = sha256hex(token);
  return ctx.sid;
}

export function requireSession(ctx) {
  if (!ctx.sid) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  return ctx.sid;
}

export const forbidden = (msg = 'Bạn không có quyền làm việc này') => new ApiError(403, 'forbidden', msg);
export const notFound = (msg = 'Không tìm thấy') => new ApiError(404, 'not_found', msg);

// Thành viên (còn trong cộng đồng, kể cả đã bị khóa) của phiên này, hoặc null. q: (sql, params) => rows
export async function memberFor(q, sid, communityId) {
  if (!sid || !UUID_RE.test(String(communityId))) return null;
  const rows = await q(
    `SELECT m.* FROM members m JOIN phien p ON p.member_id = m.id
      WHERE p.token_hash = $1 AND m.community_id = $2 AND m.left_at IS NULL LIMIT 1`, [sid, communityId]);
  return rows[0] || null;
}

// Người ngoài và cộng đồng không tồn tại đều nhận 404 như nhau (không lộ cộng đồng có tồn tại hay không).
// Thành viên bị khóa chỉ đọc được thông báo khóa (403), không làm gì khác.
export async function requireMember(q, ctx, communityId, { allowBanned = false } = {}) {
  const me = await memberFor(q, ctx.sid, communityId);
  if (!me) throw notFound('Không tìm thấy cộng đồng này, hoặc bạn không ở trong cộng đồng');
  if (me.banned_at && !allowBanned) throw new ApiError(403, 'banned', 'Bạn đã bị chủ cộng đồng khóa nên không thực hiện được thao tác này');
  return me;
}

export const isOwner = (me) => me.role === 'chu';

export async function touch(ctx) {
  if (!ctx.sid) return;
  await query(
    `UPDATE members SET last_seen_at = now() WHERE last_seen_at < now() - interval '1 minute'
      AND id IN (SELECT member_id FROM phien WHERE token_hash = $1)`, [ctx.sid]);
  // cookie trượt: có hoạt động thì cấp lại hạn 90 ngày (tối đa mỗi ngày một lần)
  const t = ctx.cookies[COOKIE];
  if (t && TOKEN_RE.test(t)) {
    const r = await query("UPDATE phien SET seen_at = now() WHERE token_hash = $1 AND seen_at < now() - interval '1 day' RETURNING 1", [ctx.sid]);
    if (r.length) ctx.setCookie(COOKIE, t, { maxAge: config.sessionDays * 86400 });
  }
}
