import crypto from 'node:crypto';
import { ApiError } from './errors.js';

// Bỏ dấu tiếng Việt
export function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
// Khóa so sánh/tìm kiếm: không dấu, chữ thường, chỉ chữ số và chữ cái, cách nhau một dấu cách
export const normKey = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

export const bad = (field, msg) => new ApiError(400, 'invalid_input', msg || `${field} không hợp lệ`, { field });

// Chuỗi một dòng: bỏ ký tự điều khiển, gộp khoảng trắng
export function cleanText(v, { max, min = 0, field = 'Trường này' }) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(field);
  const s = v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if ([...s].length < min) throw bad(field, min === 1 ? `${field} không được để trống` : `${field} cần ít nhất ${min} ký tự`);
  if ([...s].length > max) throw bad(field, `${field} tối đa ${max} ký tự`);
  return s;
}

// Nhiều dòng: giữ xuống dòng (tối đa một dòng trống liên tiếp), bỏ ký tự điều khiển
export function cleanMultiline(v, { max, min = 0, field = 'Trường này' }) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(field);
  const s = v.replace(/\r\n?/g, '\n').replace(CONTROL, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if ([...s].length < min) throw bad(field, min === 1 ? `${field} không được để trống` : `${field} cần ít nhất ${min} ký tự`);
  if ([...s].length > max) throw bad(field, `${field} tối đa ${max} ký tự`);
  return s;
}

export function intIn(v, { min, max, field = 'Số' }) {
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) v = Number(v);
  if (!Number.isSafeInteger(v) || v < min || v > max) throw bad(field, `${field} phải là số nguyên từ ${min} đến ${max}`);
  return v;
}

// Số điện thoại Việt Nam -> dạng 0xxxxxxxxx; sai thì ném lỗi
export function cleanPhone(v, field = 'Số điện thoại') {
  if (typeof v !== 'string') throw bad(field, `${field} không hợp lệ`);
  let d = v.replace(/[\s.\-()]/g, '');
  if (d.startsWith('+84')) d = '0' + d.slice(3);
  else if (/^84\d{9,10}$/.test(d)) d = '0' + d.slice(2);
  if (!/^0[2-9]\d{8,9}$/.test(d)) throw bad(field, `${field} chưa đúng (ví dụ 0912 345 678)`);
  return d;
}

export const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(v) {
  if (!UUID_RE.test(String(v))) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  return String(v).toLowerCase();
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ I O 0 1
export function randomCode(len) {
  const buf = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[buf[i] & 31];
  return s;
}
// Mã khôi phục: 16 ký tự (80 bit), hiển thị XXXX-XXXX-XXXX-XXXX
export function newRecoveryCode() {
  return randomCode(16).match(/.{4}/g).join('-');
}
// Chuẩn hóa mã người dùng gõ (bỏ gạch, khoảng trắng, hạ chữ hoa); sai định dạng thì trả null
export function normRecoveryCode(v) {
  const c = String(v ?? '').toUpperCase().replace(/[\s-]/g, '');
  return /^[A-HJ-NP-Z2-9]{16}$/.test(c) ? c : null;
}

// Ngày và giờ theo giờ Việt Nam (UTC+7)
export function todayVN(now = Date.now()) {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}
export function hourVN(now = Date.now()) {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 13);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Địa chỉ khách -> khóa hạn mức: IPv4 giữ nguyên; IPv6 gom về /64 (một nhà mạng cấp cả dải /64 cho một khách)
export function normIp(ip) {
  let s = String(ip || '').trim().toLowerCase();
  const m4 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m4) return m4[1];
  if (!s.includes(':')) return s.slice(0, 45);
  s = s.replace(/%.*$/, '');
  let [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const full = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return full.slice(0, 4).map((x) => (x || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
