import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { sha256hex } from './util.js';
import { resolveUser } from './nine-session.js';

export const COOKIE = 'hsid';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Đọc cookie phiên ẩn danh; ctx.sid là băm SHA-256 của token (token thật không bao giờ vào CSDL)
export async function resolveSession(ctx) {
  const t = ctx.cookies[COOKIE];
  if (t && TOKEN_RE.test(t)) ctx.sid = sha256hex(t);
  await resolveUser(ctx);   // tùy chọn: gắn ctx.userId nếu có cookie 9id hợp lệ
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

export function clearSessionCookie(ctx) {
  ctx.setCookie(COOKIE, '', { clear: true });
}

// Nhà tuyển dụng của người gọi: qua tài khoản 9id (user_id) HOẶC phiên ẩn danh (phien). Có cả hai thì ưu tiên nhà tuyển dụng của tài khoản (xác định).
// who: { sid, userId }. q: (sql, params) => rows
export async function employerFor(q, who) {
  const sid = who && who.sid || null, userId = who && who.userId || null;
  if (!sid && !userId) return null;
  const rows = await q(
    `SELECT e.* FROM employers e
      WHERE ($2::uuid IS NOT NULL AND e.user_id = $2::uuid)
         OR ($1::text IS NOT NULL AND EXISTS (SELECT 1 FROM phien p WHERE p.employer_id = e.id AND p.token_hash = $1))
      ORDER BY (e.user_id IS NOT NULL AND e.user_id = $2::uuid) DESC, e.seq LIMIT 1`, [sid, userId]);
  return rows[0] || null;
}

export const whoOf = (ctx) => ({ sid: ctx.sid, userId: ctx.userId || null });

// Chưa là nhà tuyển dụng: 401 (giao diện chuyển sang màn tạo/khôi phục)
export async function requireEmployer(ctx, q = query) {
  const e = await employerFor(q, whoOf(ctx));
  if (!e) throw new ApiError(401, 'no_employer', 'Bạn chưa có tài khoản nhà tuyển dụng trên thiết bị này');
  return e;
}

export const notFound = (msg = 'Không tìm thấy') => new ApiError(404, 'not_found', msg);

// Hạn mức nguyên tử: tăng bộ đếm của khóa nếu còn dưới giới hạn. Gọi trong giao dịch thì rollback cùng giao dịch.
export async function consume(q, key, limit) {
  const r = await q(
    `INSERT INTO quota(key, n) VALUES($1, 1)
       ON CONFLICT (key) DO UPDATE SET n = quota.n + 1, at = now() WHERE quota.n < $2
       RETURNING n`, [key, limit]);
  return r.length > 0;
}
