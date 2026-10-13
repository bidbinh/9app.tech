// Khóa tạm và hạn mức lưu trong CSDL (sống qua khởi động lại, đúng khi chạy nhiều bản). Mọi cập nhật là một câu SQL nguyên tử.
import { query } from './db.js';
import { ApiError } from './errors.js';

function lockedError(secs) {
  const s = Math.max(1, Math.ceil(secs));
  const wait = s >= 90 ? `${Math.ceil(s / 60)} phút` : `${s} giây`;
  return new ApiError(429, 'login_locked', `Bạn đã thử sai nhiều lần. Hãy đợi ${wait} rồi thử lại, hoặc chọn "Quên mật khẩu".`, { retryAfterSec: s });
}

// Ném 429 nếu một trong các khóa đang bị khóa
export async function assertNotLocked(keys) {
  const rows = await query('SELECT EXTRACT(EPOCH FROM (max(locked_until) - now()))::float AS secs FROM throttle WHERE key = ANY($1) AND locked_until > now()', [keys]);
  const secs = rows[0] && rows[0].secs;
  if (secs && secs > 0) throw lockedError(secs);
}

// Ghi một lần sai. Đủ `limit` lần trong cửa sổ `windowSec` thì khóa base * 2^level giây (tối đa maxLock), level tăng.
export async function recordFailure(key, { limit, windowSec = 3600, base = 30, maxLock = 3600, backoff = true }) {
  const r = (await query(
    `INSERT INTO throttle(key, n, window_start) VALUES($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       level = CASE WHEN throttle.window_start < now() - make_interval(secs => $2) AND (throttle.locked_until IS NULL OR throttle.locked_until < now()) THEN 0 ELSE throttle.level END,
       n = CASE WHEN throttle.window_start < now() - make_interval(secs => $2) THEN 1 ELSE throttle.n + 1 END,
       window_start = CASE WHEN throttle.window_start < now() - make_interval(secs => $2) THEN now() ELSE throttle.window_start END
     RETURNING n, level`, [key, windowSec]))[0];
  if (r.n >= limit) {
    const lock = Math.min(maxLock, backoff ? base * 2 ** Math.min(r.level, 20) : base);
    await query(
      `UPDATE throttle SET locked_until = now() + make_interval(secs => $2), n = 0, level = level + 1, window_start = now() WHERE key = $1 AND n >= $3`,
      [key, lock, limit]);
  }
}

export async function clear(keys) {
  await query('DELETE FROM throttle WHERE key = ANY($1)', [keys]);
}

// Hạn mức đếm mọi lần gọi (không chỉ lần sai): vượt `limit` trong `windowSec` thì 429
export async function consume(key, { limit, windowSec, code = 'rate_limited', message = 'Bạn thao tác quá nhanh, đợi một chút rồi thử lại' }) {
  const r = (await query(
    `INSERT INTO throttle(key, n, window_start) VALUES($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       n = CASE WHEN throttle.window_start < now() - make_interval(secs => $2) THEN 1 ELSE throttle.n + 1 END,
       window_start = CASE WHEN throttle.window_start < now() - make_interval(secs => $2) THEN now() ELSE throttle.window_start END
     RETURNING n`, [key, windowSec]))[0];
  if (r.n > limit) throw new ApiError(429, code, message);
}
