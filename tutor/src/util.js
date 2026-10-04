import crypto from 'node:crypto';
import { ApiError } from './errors.js';

// Bỏ dấu tiếng Việt: dùng làm khóa so sánh, nội dung chuyển khoản
export function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
const bad = (field, msg) => new ApiError(400, 'invalid_input', msg || `${field} không hợp lệ`, { field });

// Chuỗi: bỏ ký tự điều khiển (kể cả ký tự đảo chiều chữ). Một dòng: gộp khoảng trắng. Nhiều dòng: giữ xuống dòng, tối đa 2 dòng trống liền nhau.
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
  if (typeof v === 'string' && /^-?\d{1,15}$/.test(v.trim())) v = Number(v);
  if (!Number.isSafeInteger(v) || v < min || v > max) throw bad(field, `${field} phải là số nguyên từ ${min.toLocaleString('vi-VN')} đến ${max.toLocaleString('vi-VN')}`);
  return v;
}
export const optInt = (v, o) => (v === undefined || v === null || v === '' ? null : intIn(v, o));

export function oneOf(v, list, field) {
  if (typeof v !== 'string' || !list.includes(v)) throw bad(field, `${field} không hợp lệ`);
  return v;
}
export function bool(v, field, def) {
  if (v === undefined || v === null) { if (def !== undefined) return def; throw bad(field); }
  if (typeof v !== 'boolean') throw bad(field);
  return v;
}

// Số điện thoại Việt Nam: giữ chữ số (và dấu + đầu), 8 đến 15 chữ số; để trống được
export function cleanPhone(v, field = 'Số điện thoại') {
  const s0 = cleanText(v, { max: 24, field });
  if (!s0) return '';
  const s = s0.replace(/[\s.()-]/g, '');
  if (!/^\+?\d{8,15}$/.test(s)) throw bad(field, `${field} chưa đúng (chỉ gồm 8 đến 15 chữ số)`);
  return s;
}
// 0912345678 / +84912345678 / 84912345678 -> 84912345678 (dùng cho liên kết zalo.me)
export function intlPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (String(p).startsWith('+')) return d;
  if (d.startsWith('84') && d.length >= 11) return d;
  if (d.startsWith('0')) return '84' + d.slice(1);
  return d;
}

// Tài khoản nhận tiền: hoặc đủ ba phần hoặc để trống hết
export function cleanBank(b) {
  if (b === undefined || b === null) return null;
  if (typeof b !== 'object' || Array.isArray(b)) throw bad('Ngân hàng');
  const bin = String(b.bin ?? '').trim();
  const account = String(b.account ?? '').replace(/[\s.-]/g, '');
  const holder = cleanText(b.holder ?? '', { max: 50, field: 'Tên chủ tài khoản' });
  if (!bin && !account && !holder) return { bin: null, account: null, holder: null };
  if (!/^\d{6}$/.test(bin)) throw bad('Ngân hàng', 'Hãy chọn ngân hàng');
  if (!/^[0-9A-Za-z]{4,19}$/.test(account)) throw bad('Số tài khoản', 'Số tài khoản gồm 4 đến 19 chữ số');
  if (!holder) throw bad('Tên chủ tài khoản', 'Hãy nhập tên chủ tài khoản');
  return { bin, account, holder };
}

// Ngày YYYY-MM-DD hợp lệ thật (không nhận 2026-02-31)
export function cleanDay(v, field = 'Ngày') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(field, `${field} không hợp lệ (cần dạng năm-tháng-ngày)`);
  const d = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw bad(field, `${field} không hợp lệ`);
  const y = +v.slice(0, 4);
  if (y < 2020 || y > 2100) throw bad(field, `${field} nằm ngoài khoảng cho phép`);
  return v;
}
export function cleanMonth(v, field = 'Tháng') {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw bad(field, `${field} không hợp lệ (cần dạng năm-tháng)`);
  const y = +v.slice(0, 4);
  if (y < 2020 || y > 2100) throw bad(field, `${field} nằm ngoài khoảng cho phép`);
  return v;
}
// Giờ phút trong ngày: nhận số phút từ 0h (0..1439)
export const cleanMinute = (v, field = 'Giờ bắt đầu') => intIn(v, { min: 0, max: 1439, field });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ I O 0 1
export function randomCode(len) {
  const buf = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[buf[i] & 31];
  return s;
}
// Mã khôi phục: 25 ký tự (125 bit) chia 5 nhóm
export function newRecoveryCode() { const c = randomCode(25); return c.match(/.{5}/g).join('-'); }
export const normCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const newPairCode = () => randomCode(12);
export const newToken = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url'); // 16 byte = 128 bit, 22 ký tự
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(v) {
  if (!UUID_RE.test(String(v))) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  return String(v).toLowerCase();
}

// Ngày theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD
export function todayVN(now = Date.now()) {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}
export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Thứ ISO: 1 = thứ hai ... 7 = chủ nhật
export function isoWeekday(day) {
  const w = new Date(day + 'T00:00:00Z').getUTCDay();
  return w === 0 ? 7 : w;
}
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
export const monthOf = (day) => String(day).slice(0, 7);
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from, to: addDays(next, -1), nextFrom: next };
}
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// Chồng giờ hai khoảng [a, a+da) và [b, b+db) (phút)
export const overlaps = (a, da, b, db) => a < b + db && b < a + da;
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const dm = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
export const dmy = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
export const vnd = (n) => Math.round(n).toLocaleString('vi-VN') + 'đ';

// escape cho thuộc tính HTML (chỉ dùng khi chèn thẻ meta ở phía máy chủ)
export const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
