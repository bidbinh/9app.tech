import crypto from 'node:crypto';
import { ApiError } from './errors.js';

// Bỏ dấu tiếng Việt: dùng làm khóa so sánh tên và tìm kiếm
export function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
export const normKey = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Ký tự điều khiển, ký tự ẩn và ký tự đổi chiều chữ (bidi) bị loại khỏi mọi văn bản người dùng nhập
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
const CONTROL_KEEP_NL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

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

// Nhiều dòng: giữ xuống dòng (tối đa 2 dòng trống liên tiếp), bỏ ký tự điều khiển
export function cleanMultiline(v, { max, min = 0, field = 'Trường này' }) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(field);
  const s = v.replace(/\r\n?/g, '\n').replace(CONTROL_KEEP_NL, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if ([...s].length < min) throw bad(field, min === 1 ? `${field} không được để trống` : `${field} cần ít nhất ${min} ký tự`);
  if ([...s].length > max) throw bad(field, `${field} tối đa ${max} ký tự`);
  return s;
}

export function intIn(v, { min, max, field = 'Số' }) {
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number(v);
  if (!Number.isSafeInteger(v) || v < min || v > max) throw bad(field, `${field} phải là số nguyên từ ${min} đến ${max}`);
  return v;
}

export function oneOf(v, list, field) {
  if (typeof v !== 'string' || !list.includes(v)) throw bad(field, `${field} không hợp lệ`);
  return v;
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

// Liên kết (http, www, tên miền) bị chặn trong mọi nội dung: chống spam và lừa đảo
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|vn|info|biz|xyz|club|site|online|shop|link)\b|\bt\.me\/|\bzalo\.me\/|\bbit\.ly\/)/i;
export function noLinks(s, field = 'Nội dung') {
  if (LINK_RE.test(stripAccents(s))) throw bad(field, `${field} không được chứa liên kết. Hãy trao đổi qua tin nhắn trong app.`);
  return s;
}

// Đồ cấm: lưới an toàn thô theo cụm từ không dấu (chính vẫn là báo cáo và chủ cộng đồng)
export const BANNED_PHRASES = [
  'ma tuy', 'chat gay nghien', 'thuoc ke don', 'thuoc phien', 'cannabis',
  'vu khi', 'sung dan', 'sung hoi', 'sung luc', 'sung tu che', 'sung ban bi', 'dao gam', 'phao no', 'phao hoa',
  'dong vat hoang da', 'nga voi', 'te giac',
  'hang fake', 'hang nhai', 'giay phep gia', 'bang lai gia', 'the can cuoc',
  'thuoc la dien tu', 'vape', 'pod system', 'thuoc kich duc',
];
// Cụm dễ nhầm khi bỏ dấu ("hàng giá rẻ") chỉ khớp khi người đăng gõ có dấu
export const BANNED_ACCENTED = ['hàng giả', 'hàng cấm', 'thuốc nổ', 'chất nổ', 'kiếm nhật'];
export function noBanned(...texts) {
  const joined = texts.join(' ');
  const hay = ' ' + normKey(joined) + ' ';
  const low = joined.normalize('NFC').toLowerCase();
  const hit = BANNED_PHRASES.some((p) => hay.includes(' ' + p + ' ')) || BANNED_ACCENTED.some((p) => low.includes(p));
  if (hit) throw new ApiError(400, 'banned_item', 'Nội dung có vẻ thuộc nhóm đồ không được đăng (thuốc kê đơn, vũ khí, động vật hoang dã, hàng giả...). Xem trang Quy tắc.');
}

// Tìm kiếm: tách từ không dấu, mỗi từ phải xuất hiện
export function searchTokens(q) {
  return normKey(q).split(' ').filter(Boolean).slice(0, 6).map((t) => t.slice(0, 30));
}
export const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&');
