// Nhập lại mật khẩu cho thao tác nhạy cảm (đổi mật khẩu, chuyển quyền chủ, xóa gia đình/tài khoản). Chịu cùng khóa tạm đăng nhập.
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import * as pw from './password.js';
import { assertNotLocked, recordFailure, clear } from './throttle.js';

export async function reauth(userId, password) {
  const key = 'lu:' + userId;
  await assertNotLocked([key]);
  const row = (await query('SELECT password_hash FROM users WHERE id=$1', [userId]))[0];
  const ok = typeof password === 'string' && password.length > 0 && password.length <= 200 && row && await pw.verify(password, row.password_hash);
  if (!ok) {
    await recordFailure(key, { limit: config.loginPairLimit, base: 30, maxLock: 3600, backoff: true });
    throw new ApiError(403, 'wrong_password', 'Mật khẩu không đúng');
  }
  await clear([key]);
}
