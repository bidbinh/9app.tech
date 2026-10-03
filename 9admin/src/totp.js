import crypto from 'node:crypto';

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = '';
  for (const x of buf) bits += x.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += A[Number.parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

export function base32Decode(s) {
  let bits = '';
  for (const ch of String(s).replace(/=+$/, '').toUpperCase()) {
    const v = A.indexOf(ch);
    if (v < 0) throw new Error('base32 không hợp lệ');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));
export const otpauthUri = (secret, user) => `otpauth://totp/9app%20Console:${encodeURIComponent(user)}?secret=${secret}&issuer=9app%20Console`;

export function totp(secretBase32, timeMs = Date.now(), step = 30) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / step)));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// Chấp nhận lệch ±1 bước (30 giây).
export function verifyTotp(secret, code, now = Date.now()) {
  const c = String(code || '').trim();
  if (!/^\d{6}$/.test(c)) return false;
  return [-30000, 0, 30000].some((d) => {
    const a = Buffer.from(totp(secret, now + d));
    const b = Buffer.from(c);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
