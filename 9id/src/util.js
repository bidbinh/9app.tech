import crypto from 'node:crypto';
import net from 'node:net';
import { ApiError } from './errors.js';
import { config } from './config.js';

export const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(v) {
  if (!UUID_RE.test(String(v))) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  return String(v).toLowerCase();
}
export const notFound = (msg = 'Không tìm thấy') => new ApiError(404, 'not_found', msg);
export const forbidden = (msg = 'Bạn không có quyền làm việc này') => new ApiError(403, 'forbidden', msg);
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// HMAC có khóa riêng theo mục đích (domain separation)
export const hmac = (purpose, data) => crypto.createHmac('sha256', config.phonePepper).update(`${purpose}\n${data}`).digest('hex');
export const phoneHash = (e164) => hmac('phone', e164);
// trong giai đoạn xoay pepper: băm bằng cả pepper mới và pepper cũ để tra cứu lời mời đang chờ
export function phoneHashes(e164) {
  const list = [phoneHash(e164)];
  if (config.phonePepperOld) list.push(crypto.createHmac('sha256', config.phonePepperOld).update('phone' + String.fromCharCode(10) + e164).digest('hex'));
  return list;
}
// uuid lấy từ nội dung gửi lên: sai kiểu/định dạng là 400 (không phải 404, không bao giờ 500)
export function uuidBody(v, field = 'Mã') {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new ApiError(400, 'invalid_input', field + ' không hợp lệ', { field });
  return v.toLowerCase();
}

export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
const bad = (field, msg) => new ApiError(400, 'invalid_input', msg || `${field} không hợp lệ`, { field });

// Chuỗi: NFC, bỏ ký tự điều khiển (kể cả ký tự đảo chiều chữ), gộp khoảng trắng.
export function cleanText(v, { max, min = 0, field = 'Trường này', multiline = false }) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(field);
  let s = v.normalize('NFC').replace(CONTROL, ' ');
  if (multiline) s = s.replace(/\r\n?/g, '\n').replace(/[ \t\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  else s = s.replace(/\s+/g, ' ').trim();
  const n = [...s].length;
  if (n < min) throw bad(field, min === 1 ? `${field} không được để trống` : `${field} cần ít nhất ${min} ký tự`);
  if (n > max) throw bad(field, `${field} tối đa ${max} ký tự`);
  return s;
}
export function intIn(v, { min, max, field = 'Số' }) {
  if (typeof v === 'string' && /^-?\d{1,9}$/.test(v.trim())) v = Number(v);
  if (!Number.isSafeInteger(v) || v < min || v > max) throw bad(field, `${field} phải là số nguyên từ ${min} đến ${max}`);
  return v;
}
export function oneOf(v, list, field) {
  if (typeof v !== 'string' || !list.includes(v)) throw bad(field, `${field} không hợp lệ`);
  return v;
}

// ---------- số điện thoại ----------
// Chấp nhận 0xxxxxxxxx, +84xxxxxxxxx, 84xxxxxxxxx, 0084xxxxxxxxx (có khoảng trắng . - ( )); chỉ số di động Việt Nam. Trả "+84xxxxxxxxx".
export function normalizePhone(input) {
  if (typeof input !== 'string' || input.length > 40) throw new ApiError(400, 'invalid_phone', 'Số điện thoại không hợp lệ', { field: 'phone' });
  let p = input.normalize('NFKC').replace(/[\s.\-()]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  else if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('0')) p = '84' + p.slice(1);
  if (!/^84[35789]\d{8}$/.test(p)) throw new ApiError(400, 'invalid_phone', 'Số điện thoại không hợp lệ. Hãy nhập số di động Việt Nam, ví dụ 0912 345 678', { field: 'phone' });
  return '+' + p;
}
export const phoneLast4 = (e164) => String(e164 || '').slice(-4);

// ký tự điều khiển, đảo chiều chữ, ngắt dòng, độ rộng 0: trình duyệt có thể bỏ chúng và biến đường dẫn thành địa chỉ ngoài
function hasBadChar(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff) return true;
  }
  return false;
}

// ---------- next: chỉ nhận đường dẫn cùng nguồn gốc ----------
export function safeNext(v) {
  if (typeof v !== 'string') return null;
  const s = v;
  if (s.length === 0 || s.length > 500) return null;
  if (s[0] !== '/') return null;
  if (s[1] === '/' || s[1] === '\\') return null;
  // ký tự điều khiển (trình duyệt bỏ tab/xuống dòng nên "/<tab>/evil.com" thành "//evil.com") và dấu gạch ngược
  if (s.includes(String.fromCharCode(92)) || hasBadChar(s)) return null;
  let dec;
  try { dec = decodeURIComponent(s); } catch { return null; }
  if (/^\/[\\/]/.test(dec) || dec.includes(String.fromCharCode(92)) || hasBadChar(dec)) return null;
  let u;
  try { u = new URL(s, 'https://same-origin.invalid'); } catch { return null; }
  if (u.origin !== 'https://same-origin.invalid') return null;
  return s;
}

// IP về dạng khóa: IPv6 gom /64
export function normIp(ip) {
  const s = String(ip || '').trim().replace(/^::ffff:/i, '');
  if (!s.includes(':')) return s;
  if (net.isIPv6(s)) {
    const [head, tail] = s.split('::');
    const h = head ? head.split(':') : []; const t = tail ? tail.split(':') : [];
    const full = s.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
    return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '').toLowerCase()).join(':') + '::/64';
  }
  return s;
}

// nhãn thiết bị từ User-Agent
export function deviceLabel(ua) {
  const s = String(ua || '');
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iOS/i.test(s) ? 'iPhone/iPad' : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'Mac' : /Linux/i.test(s) ? 'Linux' : 'Thiết bị';
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Trình duyệt';
  return `${br} trên ${os}`;
}
