// Proof-of-work nhẹ (hashcash) trước khi gửi SMS: làm kẻ đốt hạn mức OTP tốn CPU, người dùng thật chỉ tốn khoảng nửa giây.
// Thử thách do máy chủ cấp, ký HMAC, hết hạn sau 2 phút, dùng một lần. Độ khó tăng khi lượng xin OTP gần đây tăng bất thường.
// Lời giải: tìm số `counter` sao cho SHA-256(challenge + ":" + counter) có ít nhất `bits` bit 0 ở đầu.
import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query } from './db.js';
import { hmac, sha256hex, safeEqualHex } from './util.js';

const bad = () => new ApiError(400, 'pow_invalid', 'Thử thách xác thực đã hết hạn hoặc không hợp lệ, hãy tải lại trang rồi thử lại');

export function leadingZeroBits(buf) {
  let n = 0;
  for (const b of buf) {
    if (b === 0) { n += 8; continue; }
    n += Math.clz32(b) - 24;
    break;
  }
  return n;
}

// Độ khó hiện tại: nền + thêm theo số lần xin OTP trong 10 phút qua
export async function currentBits() {
  const n = (await query("SELECT count(*)::int AS n FROM otps WHERE created_at > now() - interval '10 minutes'"))[0].n;
  const extra = n > 1000 ? 3 : n > 500 ? 2 : n > 200 ? 1 : 0;
  return config.powBits + Math.min(extra, config.powMaxExtraBits);
}

export async function issueChallenge() {
  const bits = await currentBits();
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + config.powTtlSec * 1000, bits, r: crypto.randomBytes(9).toString('base64url') })).toString('base64url');
  const challenge = `${payload}.${hmac('pow', payload)}`;
  return { challenge, bits, ttlSec: config.powTtlSec };
}

// Kiểm và tiêu thử thách. Lỗi bất kỳ: 400 pow_invalid.
export async function consumePow(pow) {
  if (!pow || typeof pow !== 'object' || typeof pow.challenge !== 'string' || pow.challenge.length > 400) throw bad();
  const counter = pow.counter;
  if (!(typeof counter === 'number' && Number.isSafeInteger(counter) && counter >= 0) && !(typeof counter === 'string' && /^\d{1,15}$/.test(counter))) throw bad();
  const [payload, sig] = pow.challenge.split('.');
  if (!payload || !sig || !safeEqualHex(hmac('pow', payload), sig)) throw bad();
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw bad(); }
  if (!data || typeof data.exp !== 'number' || data.exp < Date.now() || !Number.isInteger(data.bits)) throw bad();
  const digest = crypto.createHash('sha256').update(`${pow.challenge}:${counter}`).digest();
  if (leadingZeroBits(digest) < data.bits) throw bad();
  const fresh = await query('INSERT INTO pow_used(hash) VALUES($1) ON CONFLICT DO NOTHING RETURNING 1', [sha256hex(pow.challenge)]);
  if (!fresh.length) throw bad();
}

// Dùng cho thử nghiệm và cho máy khách Node
export function solve(challenge, bits) {
  for (let c = 0; ; c++) {
    if (leadingZeroBits(crypto.createHash('sha256').update(`${challenge}:${c}`).digest()) >= bits) return c;
  }
}
