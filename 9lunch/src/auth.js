import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { sha256hex, UUID_RE } from './util.js';
import { resolveUser } from './nine-session.js';

export const COOKIE = 'lsid';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Đọc cookie phiên ẩn danh; ctx.sid là băm SHA-256 của token (token thật không bao giờ vào CSDL)
export async function resolveSession(ctx) {
  const t = ctx.cookies[COOKIE];
  if (t && TOKEN_RE.test(t)) ctx.sid = sha256hex(t);
  await resolveUser(ctx);   // tùy chọn: người dùng 9id (ctx.userId); lỗi 9id thì vẫn chạy ẩn danh
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

// Thành viên (còn trong nhóm) của phiên này ở nhóm `teamId`, hoặc null. q: (sql, params) => rows
export async function memberFor(q, sid, teamId) {
  if (!sid || !UUID_RE.test(String(teamId))) return null;
  const rows = await q(
    `SELECT m.* FROM members m JOIN phien p ON p.member_id = m.id
      WHERE p.token_hash = $1 AND m.team_id = $2 AND m.left_at IS NULL LIMIT 1`, [sid, teamId]);
  return rows[0] || null;
}

// Người ngoài nhóm và nhóm không tồn tại đều nhận 404 như nhau (không lộ nhóm có tồn tại hay không)
export async function requireMember(q, ctx, teamId) {
  const me = await memberFor(q, ctx.sid, teamId);
  if (!me) throw new ApiError(404, 'not_found', 'Không tìm thấy nhóm này, hoặc bạn không ở trong nhóm');
  return me;
}

export const forbidden = (msg = 'Bạn không có quyền làm việc này') => new ApiError(403, 'forbidden', msg);

export async function touch(ctx) {
  if (!ctx.sid) return;
  await query(
    `UPDATE members SET last_seen_at = now() WHERE last_seen_at < now() - interval '1 minute'
      AND id IN (SELECT member_id FROM phien WHERE token_hash = $1)`, [ctx.sid]);
}
