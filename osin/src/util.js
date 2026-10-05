import crypto from 'node:crypto';
import { ApiError } from './errors.js';

export const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hmacHex = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(v) {
  if (!UUID_RE.test(String(v))) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  return String(v).toLowerCase();
}

// ký tự điều khiển, đảo chiều chữ, vùng cách rộng bằng 0
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\p{Cf}\p{Co}\u{E0000}-\u{E007F}\uFE00-\uFE0F]/gu;
const bad = (field, msg) => new ApiError(400, 'invalid_input', msg || `${field} không hợp lệ`, { field });

// Chuỗi người dùng: bỏ ký tự điều khiển; nhiều dòng giữ xuống dòng (tối đa 2 dòng trống liền nhau)
export function cleanText(v, { max, min = 0, field = 'Nội dung', multiline = false }) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(field);
  let s = v.normalize('NFC').replace(CONTROL, ' ');
  if (multiline) s = s.replace(/\r\n?/g, '\n').replace(/[ \t\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  else s = s.replace(/\s+/g, ' ').trim();
  const n = [...s].length;
  if (n < min) throw bad(field, min === 1 ? `${field} không được để trống` : `${field} cần ít nhất ${min} ký tự`);
  if (n > max) throw bad(field, `${field} tối đa ${max.toLocaleString('vi-VN')} ký tự`);
  return s;
}
// Chuỗi từ nguồn ngoài (app, mô hình): làm sạch và cắt ngắn, không ném lỗi
export function softText(v, max) {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFC').replace(CONTROL, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const a = [...s];
  return a.length > max ? a.slice(0, max - 1).join('').trimEnd() + '…' : s;
}

// ---------- che bí mật ----------
const PHONE = /(?<![\d])(?:\+?84|0)(?:[\s.\-]?\d){8,10}(?![\d])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD = /(?<![\d])(?:\d[ -]?){13,19}(?![\d])/g;
const KEYISH = /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{43,})\b/g;
// Từ khóa bí mật. Đứng đầu phải là ranh giới từ (không dính "spinning", "passport", "Pinterest").
const KW = '(?:mật\\s*khẩu|mat\\s*khau|password|passwd|mk|pin|otp|mã\\s*(?:otp|xác\\s*nhận|xác\\s*thực|bảo\\s*mật)|ma\\s*(?:otp|xac\\s*nhan|xac\\s*thuc|bao\\s*mat)|cvv|code|token|api\\s*key|secret)';
const SECRET_KW = new RegExp('(?<![\\p{L}\\p{N}_])(' + KW + ')(?![\\p{L}\\p{N}_])((?:\\s+của\\s+(?:tôi|mình|em|anh|chị|bạn))?)(\\s*(?:là|la|is|:|=|-)\\s*|\\s+)([^\\s,;]{3,64})', 'giu');
// mã/otp đứng riêng + 4 đến 8 chữ số
const BARE_CODE = new RegExp('(?<![\\p{L}\\p{N}_])((?:mã|ma|otp|mã\\s*otp)(?![\\p{L}\\p{N}_])\\s*(?:là|la|:|=|-)?\\s*)(\\d{4,8})(?!\\d)', 'giu');
function secretValue(sep, v) {
  const explicit = /[:=\-]|\b(?:là|la|is)\b/i.test(sep);
  const hasDigit = /\d/.test(v);
  const hasSpecial = /[^\p{L}\p{N}]/u.test(v.replace(/[.!?]+$/, ''));
  const letters = /^\p{L}+$/u.test(v);
  if (hasDigit || hasSpecial) return true;
  return explicit && letters && [...v].length >= 6; // sau "là/:/=" thì chuỗi chữ dài cũng coi là mật khẩu; chữ ngắn ("gì", "quên") thì không
}
function maskKeywords(text, onMask) {
  return text
    .replace(SECRET_KW, (m, k, of, sep, v) => (secretValue(sep, v) ? (onMask(), k + of + sep + '[đã che]') : m))
    .replace(BARE_CODE, (m, k) => { onMask(); return k + '[đã che]'; });
}

/** Che số điện thoại, email, OTP/mật khẩu, thẻ, khóa. Dùng cho MỌI chuỗi có thể đi vào nhật ký. */
export function redact(s) {
  return maskKeywords(String(s ?? '').replace(KEYISH, '[khóa]'), () => {})
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[số điện thoại]')
    .replace(CARD, '[số dài]');
}
/** Che mật khẩu/OTP/thẻ trong tin nhắn người dùng (trước khi gửi mô hình và lưu). Giữ số điện thoại và email vì có thể cần cho việc người dùng nhờ. */
export function maskUserSecrets(s) {
  let masked = false;
  const out = maskKeywords(String(s), () => { masked = true; })
    .replace(CARD, (m) => { const d = m.replace(/\D/g, ''); if (d.length >= 13 && d.length <= 19 && luhn(d)) { masked = true; return '[số thẻ đã che]'; } return m; });
  return { text: out, masked };
}
function luhn(d) {
  let sum = 0; let alt = false;
  for (let i = d.length - 1; i >= 0; i--) { let n = d.charCodeAt(i) - 48; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}

/** Ghi nhật ký an toàn: chỉ sự kiện và mã, mọi chuỗi qua redact và cắt ngắn. Không bao giờ truyền nội dung hội thoại. */
export function logEvent(event, fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = typeof v === 'string' ? redact(v).slice(0, 120) : v;
  console.log('[osin]', event, JSON.stringify(out));
}
// Chỉ ghi tên/mã lỗi. Thông điệp lỗi của thư viện (pg, fetch...) có thể chứa dữ liệu người dùng nên KHÔNG ghi; ApiError là chuỗi cố định của Osin nên được ghi.
export function logError(event, e, fields = {}) {
  const own = e && e.constructor && e.constructor.name === 'ApiError';
  logEvent(event, { ...fields, name: e && e.name ? String(e.name) : undefined, code: e && e.code ? String(e.code) : undefined, msg: own ? redact(e.message).slice(0, 160) : undefined });
}

// ---------- ngày giờ Việt Nam (UTC+7) ----------
export const todayVN = (now = Date.now()) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
export function nowVN(now = Date.now()) {
  const d = new Date(now + 7 * 3600_000);
  const iso = d.toISOString();
  return {
    iso: iso.slice(0, 10), gio: iso.slice(11, 16), thu: WEEKDAYS[d.getUTCDay()],
    ngay: d.getUTCDate(), thang: d.getUTCMonth() + 1, nam: d.getUTCFullYear(),
    text: `${WEEKDAYS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}, ${iso.slice(11, 16)} (giờ Việt Nam)`,
  };
}
export const newId = () => crypto.randomUUID();
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\p{Cf}\p{Co}\u{E0000}-\u{E007F}\uFE00-\uFE0F]/gu;
/** Bỏ hẳn ký tự điều khiển/đảo chiều/vô hình (không thay bằng khoảng trắng). */
export const stripInvisible = (s) => String(s ?? '').replace(INVISIBLE, '');
/** Làm sạch đệ quy mọi chuỗi (và khóa) trong tham số công cụ trước khi lưu/thực thi. */
export function cleanDeep(v, depth = 0) {
  if (typeof v === 'string') return stripInvisible(v.normalize('NFC')).replace(/[ \t]+/g, ' ').trim();
  if (depth > 8 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => cleanDeep(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) { if (k === '__proto__') continue; out[stripInvisible(k)] = cleanDeep(x, depth + 1); }
  return out;
}
export const clip = (s, n) => { const a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : String(s); };
