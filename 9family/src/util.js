import crypto from 'node:crypto';
import { ApiError } from './errors.js';
import { isValidDay, TIME_RE, minutesOf } from './vn.js';

export function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
export const normKey = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
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
// Nhiều dòng (ghi chú): giữ xuống dòng
export function cleanNote(v, { max = 500, field = 'Ghi chú' } = {}) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw bad(field);
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if ([...s].length > max) throw bad(field, `${field} tối đa ${max} ký tự`);
  return s;
}

export function intIn(v, { min, max, field = 'Số' }) {
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number(v);
  if (!Number.isSafeInteger(v) || v < min || v > max) throw bad(field, `${field} phải là số nguyên từ ${min} đến ${max}`);
  return v;
}
export function cleanDay(v, field = 'Ngày', { optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  if (!isValidDay(v)) throw bad(field, `${field} không hợp lệ (cần dạng năm-tháng-ngày)`);
  return v;
}
export function cleanTime(v, field = 'Giờ', { optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  if (typeof v !== 'string' || !TIME_RE.test(v)) throw bad(field, `${field} không hợp lệ (cần dạng 07:30)`);
  return v;
}
export function cleanPhone(v) {
  const s = cleanText(v ?? '', { max: 20, field: 'Số điện thoại' });
  if (s && !/^[0-9 +().-]{6,20}$/.test(s)) throw bad('Số điện thoại', 'Số điện thoại chỉ gồm chữ số, dấu cách, +, -, ( )');
  return s;
}
export { minutesOf };

export const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const newCode = () => crypto.randomBytes(18).toString('base64url'); // 24 ký tự
export const CODE_RE = /^[A-Za-z0-9_-]{24}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(v) {
  if (!UUID_RE.test(String(v))) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  return String(v).toLowerCase();
}
export function uuidList(v, { max = 20, field = 'Danh sách' } = {}) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) throw bad(field);
  const out = [];
  for (const x of v) { if (!UUID_RE.test(String(x))) throw bad(field); const id = String(x).toLowerCase(); if (!out.includes(id)) out.push(id); }
  return out;
}
export const iso = (d) => (d ? new Date(d).toISOString() : null);
