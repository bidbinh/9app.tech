import crypto from 'node:crypto';
import { ApiError } from './errors.js';

// Bỏ dấu tiếng Việt, hạ chữ thường: dùng làm khóa so sánh tên quán, tên món
export function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D');
}
export const normKey = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const KINDS = ['trua', 'cafe', 'sang', 'tiec'];
export const KIND_LABEL = { trua: 'Cơm trưa', cafe: 'Cà phê, đồ uống', sang: 'Bữa sáng', tiec: 'Tiệc' };

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

const bad = (field, msg) => new ApiError(400, 'invalid_input', msg || `${field} không hợp lệ`, { field });

// Chuỗi một dòng: bỏ ký tự điều khiển, gộp khoảng trắng
export function cleanText(v, { max, min = 0, field = 'Trường này' }) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(field);
  const s = v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if ([...s].length < min) throw bad(field, min === 1 ? `${field} không được để trống` : `${field} cần ít nhất ${min} ký tự`);
  if ([...s].length > max) throw bad(field, `${field} tối đa ${max} ký tự`);
  return s;
}

export function intIn(v, { min, max, field = 'Số' }) {
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number(v);
  if (!Number.isSafeInteger(v) || v < min || v > max) throw bad(field, `${field} phải là số nguyên từ ${min} đến ${max}`);
  return v;
}

export function cleanUrl(v) {
  const s = cleanText(v, { max: 300, field: 'Liên kết' });
  if (!s) return '';
  if (/\s/.test(s)) throw bad('Liên kết', 'Liên kết không được chứa khoảng trắng');
  let u;
  try { u = new URL(s); } catch { throw bad('Liên kết', 'Liên kết cần bắt đầu bằng http:// hoặc https://'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad('Liên kết', 'Liên kết cần bắt đầu bằng http:// hoặc https://');
  return s;
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

// ISO hoặc null; khác thì lỗi
const ISO_FULL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
// Chỉ nhận ngày giờ đầy đủ (ISO 8601 có múi giờ), không nhận '1', '2026', '12:30'...
export function cleanDate(v, field) {
  if (v === null || v === '' || v === undefined) return null;
  if (typeof v !== 'string' || !ISO_FULL.test(v)) throw bad(field, `${field} không hợp lệ`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(field, `${field} không hợp lệ`);
  return d.toISOString();
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ I O 0 1
export function randomCode(len) {
  const buf = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[buf[i] & 31];
  return s;
}
export const INVITE_RE = /^[A-HJ-NP-Z2-9]{10}$/;

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
