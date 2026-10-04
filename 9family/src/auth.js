import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { sha256hex, UUID_RE } from './util.js';

export const COOKIE = 'fsid';
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

// Nhãn thiết bị thô từ User-Agent (không lưu nguyên chuỗi UA)
export function deviceLabel(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/i.test(s)) return 'iPhone/iPad';
  if (/Android/i.test(s)) return 'Điện thoại Android';
  if (/Windows/i.test(s)) return 'Máy tính Windows';
  if (/Macintosh|Mac OS/i.test(s)) return 'Máy Mac';
  if (/Linux/i.test(s)) return 'Máy Linux';
  return 'Thiết bị';
}

// Thành viên đăng nhập được (còn trong gia đình, không phải người đón hộ) của phiên này ở gia đình `fid`, hoặc null
export async function memberFor(q, sid, fid) {
  if (!sid || !UUID_RE.test(String(fid))) return null;
  const rows = await q(
    `SELECT m.* FROM members m JOIN sessions s ON s.member_id = m.id
      WHERE s.token_hash = $1 AND m.family_id = $2 AND m.left_at IS NULL AND m.external = false LIMIT 1`, [sid, fid]);
  return rows[0] || null;
}

// Người ngoài gia đình và gia đình không tồn tại đều nhận 404 như nhau
export async function requireMember(q, ctx, fid) {
  const me = await memberFor(q, ctx.sid, fid);
  if (!me) throw new ApiError(404, 'not_found', 'Không tìm thấy gia đình này, hoặc bạn không ở trong gia đình');
  return me;
}

export const isManager = (m) => m.role === 'chu' || m.role === 'quan_ly';
export const forbidden = (msg = 'Bạn không có quyền làm việc này') => new ApiError(403, 'forbidden', msg);
export function requireManager(me, msg = 'Chỉ chủ gia đình hoặc người quản lý mới làm được việc này') {
  if (!isManager(me)) throw forbidden(msg);
}
export function requireOwner(me, msg = 'Chỉ chủ gia đình mới làm được việc này') {
  if (me.role !== 'chu') throw forbidden(msg);
}

export async function touch(ctx) {
  if (!ctx.sid) return;
  await query(
    `UPDATE members SET last_seen_at = now() WHERE last_seen_at < now() - interval '1 minute'
      AND id IN (SELECT member_id FROM sessions WHERE token_hash = $1)`, [ctx.sid]);
  await query(`UPDATE sessions SET last_used_at = now() WHERE token_hash = $1 AND last_used_at < now() - interval '10 minutes'`, [ctx.sid]);
}
