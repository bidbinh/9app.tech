import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { sha256hex } from './util.js';
import { resolveUser } from './nine-session.js';

export const COOKIE = 'tsid';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Nhãn thiết bị ngắn gọn từ User-Agent (chỉ để gia sư nhận ra máy của mình)
export function deviceLabel(ua) {
  const s = String(ua || '');
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iOS/i.test(s) ? 'iPhone/iPad' : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'Mac' : /Linux/i.test(s) ? 'Linux' : 'Thiết bị';
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Trình duyệt';
  return `${br} trên ${os}`;
}

const TUTOR_COLS = 't.id, t.seq, t.name, t.status, t.bank_bin, t.bank_account, t.bank_holder, t.recovery_at, t.user_id';
const tutorOf = (r) => ({ id: r.id, seq: r.seq, name: r.name, status: r.status, bank_bin: r.bank_bin, bank_account: r.bank_account, bank_holder: r.bank_holder, recovery_at: r.recovery_at, user_id: r.user_id });

// Gia sư của người gọi: qua tài khoản 9id (user_id) HOẶC phiên ẩn danh (cookie tsid). Có cả hai thì ưu tiên gia sư của tài khoản (xác định).
// ctx.tutor: gia sư đó (hoặc null). ctx.sessionId / ctx.sessionTutorId: hàng phiên ẩn danh và gia sư mà phiên đó trỏ tới (có thể khác ctx.tutor).
// ctx.sid: khóa giới hạn tần suất/idempotency (băm phiên, hoặc 'u:<userId>' khi đăng nhập).
export async function resolveSession(ctx) {
  await resolveUser(ctx);   // tùy chọn: gắn ctx.userId nếu có cookie 9id hợp lệ
  const t = ctx.cookies[COOKIE];
  let sess = null;
  if (t && TOKEN_RE.test(t)) {
    const hash = sha256hex(t);
    const rows = await query(
      `SELECT s.id AS session_id, ${TUTOR_COLS}
         FROM sessions s JOIN tutors t ON t.id = s.tutor_id
        WHERE s.token_hash = $1 AND s.last_used_at > now() - make_interval(days => $2)`, [hash, config.sessionDays]);
    if (rows[0]) { sess = rows[0]; ctx.sessHash = hash; ctx.sessionId = sess.session_id; ctx.sessionTutorId = sess.id; }
  }
  let acc = null;
  if (ctx.userId) acc = (await query(`SELECT ${TUTOR_COLS} FROM tutors t WHERE t.user_id = $1`, [ctx.userId]))[0] || null;
  const r = acc || sess;
  ctx.sid = ctx.userId ? 'u:' + ctx.userId : ctx.sessHash || null;
  if (!r) return;
  ctx.tutor = tutorOf(r);
  // làm mới "hoạt động gần nhất" tối đa mỗi phút một lần
  if (sess) query(`UPDATE sessions SET last_used_at = now() WHERE id = $1 AND last_used_at < now() - interval '1 hour'`, [sess.session_id]).catch(() => {});
  query(`UPDATE tutors SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 minute'`, [r.id]).catch(() => {});
}

// Gia sư của phiên này; không có thì 401 (không lộ gì thêm)
export function requireTutor(ctx) {
  if (!ctx.tutor) throw new ApiError(401, 'unauthorized', 'Bạn chưa vào tài khoản. Hãy tạo tài khoản mới hoặc khôi phục bằng mã.');
  return ctx.tutor;
}

// Tạo phiên mới cho gia sư và đặt cookie. c: ngữ cảnh giao dịch (c.query). Giữ tối đa maxSessionsPerTutor phiên.
export async function createSession(c, ctx, tutorId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = sha256hex(token);
  await c.query('INSERT INTO sessions(token_hash, tutor_id, ua) VALUES($1,$2,$3)', [hash, tutorId, deviceLabel(ctx.headers['user-agent'])]);
  await c.query(
    `DELETE FROM sessions WHERE tutor_id = $1 AND id NOT IN (SELECT id FROM sessions WHERE tutor_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [tutorId, config.maxSessionsPerTutor]);
  ctx.setCookie(COOKIE, token, { maxAge: config.sessionDays * 86400 });
  return hash;
}

export const forbidden = (msg = 'Bạn không có quyền làm việc này') => new ApiError(403, 'forbidden', msg);
export const notFound = (msg = 'Không tìm thấy') => new ApiError(404, 'not_found', msg);
