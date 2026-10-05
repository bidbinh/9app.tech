import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { SESSION_COOKIE } from './http.js';
import { sha256hex, newToken, TOKEN_RE, deviceLabel } from './util.js';

export const COOKIE = SESSION_COOKIE;

// Tra phiên theo token (từ cookie hoặc từ app khác gửi sang). Chỉ chấp nhận token đúng định dạng VÀ khớp một hàng do máy chủ cấp.
// Hết hạn kiểm ở máy chủ: không dùng quá 90 ngày thì vô hiệu. Dùng thì gia hạn (tối đa mỗi giờ một lần ghi).
export async function lookupSession(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const hash = sha256hex(token);
  const rows = await query(
    `SELECT s.id AS session_id, s.last_used_at < now() - interval '1 hour' AS stale,
            u.id, u.phone, u.display_name, u.password_weak, u.source, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.last_used_at > now() - make_interval(days => $2)`, [hash, config.sessionDays]);
  const r = rows[0];
  if (!r) return null;
  if (r.stale) {
    await query('UPDATE sessions SET last_used_at = now() WHERE id = $1', [r.session_id]);
    await query('UPDATE users SET last_seen_at = now() WHERE id = $1', [r.id]);
  }
  return {
    hash, sessionId: r.session_id, refreshed: r.stale,
    user: { id: r.id, phone: r.phone, displayName: r.display_name, passwordWeak: r.password_weak, source: r.source, createdAt: r.created_at },
  };
}

// Đọc cookie phiên; ctx.user là người dùng của phiên (hoặc null)
export async function resolveSession(ctx) {
  const token = ctx.cookies[COOKIE];
  const s = await lookupSession(token);
  if (!s) return;
  ctx.sid = s.hash;
  ctx.sessionId = s.sessionId;
  ctx.user = s.user;
  // trượt: cấp lại cookie cùng token (đã được máy chủ xác nhận) với hạn mới
  if (s.refreshed) ctx.setCookie(COOKIE, token, { maxAge: config.sessionDays * 86400 });
}

export function requireUser(ctx) {
  if (!ctx.user) throw new ApiError(401, 'unauthorized', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.');
  return ctx.user;
}

// Tạo phiên mới và đặt cookie. c: ngữ cảnh giao dịch hoặc { query }. Giữ tối đa maxSessions phiên (cũ nhất bị loại).
export async function createSession(c, ctx, userId) {
  const token = newToken();
  const hash = sha256hex(token);
  await c.query('INSERT INTO sessions(token_hash, user_id, ua) VALUES($1,$2,$3)', [hash, userId, deviceLabel(ctx.headers['user-agent'])]);
  await c.query(
    `DELETE FROM sessions WHERE user_id = $1 AND id NOT IN (SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [userId, config.maxSessions]);
  ctx.setCookie(COOKIE, token, { maxAge: config.sessionDays * 86400 });
  return hash;
}

// Nhật ký sự kiện bảo mật: không chứa số điện thoại, mã, mật khẩu
export async function audit(c, userId, kind, detail = '') {
  const q = c && c.query ? c.query : query;
  await q('INSERT INTO audit(user_id, kind, detail) VALUES($1,$2,$3)', [userId, kind, String(detail).slice(0, 200)]);
}
