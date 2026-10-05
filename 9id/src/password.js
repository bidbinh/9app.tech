// Mật khẩu: PBKDF2-SHA256, 200.000 vòng, "pbkdf2$vòng$muối$hash" — GIỐNG HỆT 9Sport/9Ship để hash chuyển qua lại được.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './errors.js';

const pbkdf2 = promisify(crypto.pbkdf2);
export const ITERATIONS = 200_000;
export const MIN_LENGTH = 8;
const BANNED = new Set(['12345678', '123456789', '1234567890', '11111111', '00000000', 'password', 'matkhau123', 'qwertyui', 'abcdefgh', '87654321', 'iloveyou', 'matkhau12', '123123123', '12341234']);

// Giới hạn số phép băm chạy cùng lúc: băm 200.000 vòng tốn CPU, nhiều IP cùng đoán mật khẩu không được làm nghẽn cả máy chủ.
// Quá hàng đợi thì từ chối nhanh (503) thay vì để mọi yêu cầu khác (cả của người dùng thật) chờ.
export const limits = { max: 4, maxQueue: 64 };
let active = 0;
const queue = [];
function acquire() {
  if (active < limits.max) { active++; return Promise.resolve(); }
  if (queue.length >= limits.maxQueue) throw new ApiError(503, 'busy', 'Hệ thống đang bận, hãy thử lại sau ít giây');
  return new Promise((resolve) => queue.push(resolve));
}
function release() { const next = queue.shift(); if (next) next(); else active--; }
async function derive(plain, salt, iter, len) {
  await acquire();
  try { return await pbkdf2(String(plain), salt, iter, len, 'sha256'); } finally { release(); }
}

export async function hash(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const dk = await derive(plain, salt, ITERATIONS, 32);
  return `pbkdf2$${ITERATIONS}$${salt}$${dk.toString('hex')}`;
}

export async function verify(plain, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iter) || iter < 1000 || iter > 5_000_000) return false;
  let dk;
  try { dk = await derive(plain, parts[2], iter, parts[3].length / 2); } catch (e) { if (e instanceof ApiError) throw e; return false; }
  const a = Buffer.from(dk.toString('hex'));
  const b = Buffer.from(parts[3]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const needsRehash = (stored) => Number.parseInt(String(stored).split('$')[1], 10) < ITERATIONS;

// băm giả: số không tồn tại cũng tốn thời gian như số có tài khoản
let dummy = null;
export async function dummyVerify(plain) {
  dummy ||= await hash('dummy-password-for-timing');
  await verify(plain, dummy);
  return false;
}

// Mật khẩu MỚI: tối thiểu 8 ký tự. Mật khẩu cũ (lúc đăng nhập) không qua hàm này.
export function check(plain, phone = '') {
  if (typeof plain !== 'string') throw new ApiError(400, 'weak_password', 'Mật khẩu không hợp lệ', { field: 'password' });
  const p = plain;
  if ([...p].length < MIN_LENGTH) throw new ApiError(400, 'weak_password', `Mật khẩu cần ít nhất ${MIN_LENGTH} ký tự`, { field: 'password' });
  if (p.length > 100) throw new ApiError(400, 'weak_password', 'Mật khẩu quá dài (tối đa 100 ký tự)', { field: 'password' });
  const digits = String(phone).replace(/\D/g, '');
  if (BANNED.has(p.toLowerCase()) || (digits && (p === digits || p === '0' + digits.slice(2) || p === digits.slice(2))) || /^(.)\1+$/.test(p)) {
    throw new ApiError(400, 'weak_password', 'Mật khẩu quá dễ đoán, hãy chọn mật khẩu khác', { field: 'password' });
  }
  return p;
}
export const isWeakLegacy = (plain) => [...String(plain)].length < MIN_LENGTH;
