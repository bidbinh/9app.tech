// Phiên của Osin: cookie riêng (host-only, __Host- khi chạy HTTPS ở gốc), chỉ lưu băm token; kiểm lại phiên 9id định kỳ (<= 5 phút)
// để đăng xuất ở 9id có hiệu lực. Cookie sai/hết hạn chỉ tốn một truy vấn CSDL của Osin (không gọi 9id), có thêm giới hạn theo IP.
import crypto from 'node:crypto';
import { ApiError } from './errors.js';
import { config } from './config.js';
import { query } from './db.js';
import { sha256hex, logEvent } from './util.js';
import { userKey } from './usage.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const sessionCookieName = () => (config.cookieSecure && config.basePath === '' ? '__Host-osin_sid' : 'osin_sid');
export const stateCookieName = () => (config.cookieSecure && config.basePath === '' ? '__Host-osin_st' : 'osin_st');

/** Tạo phiên Osin mới cho người dùng đã xác thực qua 9id. Trả token thô (chỉ đặt vào cookie, không lưu). */
export async function createSession({ userId, displayName, sessionId9id }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query('INSERT INTO osin_sessions(token_hash, user_id, display_name, session9id) VALUES($1,$2,$3,$4)', [sha256hex(token), userId, displayName, sessionId9id]);
  // tối đa 10 phiên mỗi người
  await query('DELETE FROM osin_sessions WHERE user_id=$1 AND id NOT IN (SELECT id FROM osin_sessions WHERE user_id=$1 ORDER BY id DESC LIMIT 10)', [userId]);
  return token;
}
/** Xóa phiên Osin; trả sessionId9id của phiên đó (để báo 9id session-end) hoặc null. */
export async function destroySession(token) { const r = await query('DELETE FROM osin_sessions WHERE token_hash=$1 RETURNING session9id', [sha256hex(token)]); return r[0] ? r[0].session9id : null; }
export async function destroyUserSessions(userId) { await query('DELETE FROM osin_sessions WHERE user_id=$1', [userId]); }

const bad = new Map(); // ip -> { n, reset }
function badLimited(ip, add) {
  const now = Date.now();
  let h = bad.get(ip);
  if (!h || h.reset < now) { h = { n: 0, reset: now + 60_000 }; bad.set(ip, h); }
  if (add) h.n += 1;
  if (bad.size > 20000) for (const [k, v] of bad) if (v.reset < now) bad.delete(k);
  return h.n > config.badCookiePerMin;
}
export const resetBadCookies = () => bad.clear();

const checking = new Map(); // phiên đang kiểm với 9id: gộp các yêu cầu đồng thời

export function makeAuth(identity) {
  return async function resolveUser(ctx) {
    const t = ctx.cookies[sessionCookieName()];
    if (!t) return;
    if (!TOKEN_RE.test(t)) { if (badLimited(ctx.ip, true)) throw new ApiError(429, 'rate_limited', 'Quá nhiều yêu cầu không hợp lệ, đợi một phút rồi thử lại'); return; }
    if (badLimited(ctx.ip, false)) throw new ApiError(429, 'rate_limited', 'Quá nhiều yêu cầu không hợp lệ, đợi một phút rồi thử lại');
    const hash = sha256hex(t);
    const row = (await query('SELECT id, user_id, display_name, session9id, last_used_at, last_checked_at FROM osin_sessions WHERE token_hash=$1 AND last_used_at > now() - make_interval(days => $2)', [hash, config.sessionDays]))[0];
    if (!row) { badLimited(ctx.ip, true); return; }
    // đăng xuất ở 9id phải có hiệu lực trong <= sessionCheckMs
    if (Date.now() - new Date(row.last_checked_at).getTime() > config.sessionCheckMs) {
      let p = checking.get(row.id);
      if (!p) {
        p = (async () => {
          try {
            const valid = await identity.sessionValid(row.session9id);
            if (!valid) { await query('DELETE FROM osin_sessions WHERE id=$1', [row.id]); return false; }
            await query('UPDATE osin_sessions SET last_checked_at = now() WHERE id=$1', [row.id]);
            return true;
          } catch (e) {
            // 9id bận/sập: giữ phiên đã có (không đuổi người đang dùng), thử lại ở yêu cầu sau
            logEvent('session_check_failed', { code: e && e.code });
            return Date.now() - new Date(row.last_checked_at).getTime() < config.sessionStaleMs; // quá lâu không kiểm được thì thôi tin
          } finally { checking.delete(row.id); }
        })();
        checking.set(row.id, p);
      }
      if (!(await p)) return;
    }
    if (Date.now() - new Date(row.last_used_at).getTime() > 3600_000) query('UPDATE osin_sessions SET last_used_at = now() WHERE id=$1', [row.id]).catch(() => {});
    ctx.user = { userId: row.user_id, displayName: row.display_name, sessionRowId: row.id };
    ctx.sid = userKey(row.user_id); // khóa giới hạn tần suất theo người dùng
  };
}

export function requireUser(ctx) {
  if (!ctx.user) throw new ApiError(401, 'unauthorized', 'Bạn chưa đăng nhập tài khoản 9app.', { loginUrl: config.basePath + '/auth/login' });
  return ctx.user;
}
