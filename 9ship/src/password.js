// Mật khẩu: PBKDF2-SHA256, 200.000 vòng, định dạng "pbkdf2$vòng$muối$hash" — GIỐNG HỆT 9Sport (app/auth.py),
// để cùng một mật khẩu dùng được ở các app 9app.tech và hash có thể chuyển qua lại.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './errors.js';

const pbkdf2 = promisify(crypto.pbkdf2);
export const ITERATIONS = 200_000;
export const MIN_LENGTH = 6; // bằng 9Sport và cổng 9app
const BANNED = new Set(['123456', '1234567', '12345678', '123456789', '111111', '000000', 'password', 'matkhau', 'qwerty', 'abcdef', '654321']);

export async function hash(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const dk = await pbkdf2(String(plain), salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2$${ITERATIONS}$${salt}$${dk.toString('hex')}`;
}

export async function verify(plain, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iter) || iter < 1000 || iter > 5_000_000) return false;
  let dk;
  try { dk = await pbkdf2(String(plain), parts[2], iter, parts[3].length / 2, 'sha256'); } catch { return false; }
  const a = Buffer.from(dk.toString('hex'));
  const b = Buffer.from(parts[3]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Kiểm tra độ mạnh tối thiểu; ném 400 nếu quá yếu.
export function check(plain, phone = '') {
  const p = String(plain || '');
  if (p.length < MIN_LENGTH) throw new ApiError(400, 'weak_password', `Mật khẩu cần ít nhất ${MIN_LENGTH} ký tự`, { field: 'password' });
  if (p.length > 100) throw new ApiError(400, 'weak_password', 'Mật khẩu quá dài (tối đa 100 ký tự)', { field: 'password' });
  if (BANNED.has(p.toLowerCase()) || p === phone || /^(.)\1+$/.test(p)) throw new ApiError(400, 'weak_password', 'Mật khẩu quá dễ đoán, hãy chọn mật khẩu khác', { field: 'password' });
  return p;
}
