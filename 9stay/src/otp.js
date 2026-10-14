import crypto from 'node:crypto';
import { AppError } from './errors.js';

// OTP xác minh số điện thoại của khách dùng CHUNG với 9id (cùng cổng Zalo ZNS rồi SMS như 9Ship/9Sport, cùng hạn mức theo số/IP/toàn hệ).
// 9stay không tự gửi tin và không giữ mã: nó chỉ nhờ 9id gửi/kiểm (idClient.otpSend / otpVerify, app phải nằm trong INTERNAL_OTP_APPS của 9id),
// rồi cấp phiên riêng của trang đặt phòng. Các giới hạn cục bộ dưới đây chỉ là lớp chặn rẻ trước khi gọi 9id.
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SENDS_PER_10_MIN = 3;
const MAX_SENDS_PER_DAY = 6;
const MAX_SENDS_PER_HOUR_ORG = 200;

// Số di động Việt Nam về dạng 0xxxxxxxxx (chấp nhận +84…, 84…, có dấu cách/chấm/gạch).
export function canonicalPhone(p) {
  let s = String(p ?? '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = '0' + s.slice(2);
  if (!/^0[35789]\d{8}$/.test(s)) throw new AppError('bad_phone', 'Số điện thoại không hợp lệ');
  return s;
}

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
export const hashToken = sha;

export const otpAvailable = (idClient) => !!idClient && typeof idClient.otpSend === 'function' && typeof idClient.otpVerify === 'function';

// Lỗi từ 9id -> lỗi cho khách (không lộ chi tiết nội bộ)
function mapRemote(e) {
  const status = e && e.status;
  if (status === 429) return new AppError('otp_rate', (e.message && String(e.message).slice(0, 200)) || 'Bạn yêu cầu mã quá nhiều lần, hãy thử lại sau', 429);
  if (status === 400 && e.code === 'otp_invalid') return new AppError('otp_invalid', 'Mã không đúng hoặc đã hết hạn', 400);
  if (status === 400 && (e.code === 'invalid_phone' || e.code === 'invalid_input')) return new AppError('bad_phone', 'Số điện thoại không hợp lệ');
  console.error('[otp] 9id:', status, e && e.code);
  return new AppError('otp_unavailable', 'Không gửi/kiểm được mã xác thực lúc này, hãy thử lại sau', 503);
}

// Bước 1 (trong giao dịch): kiểm giới hạn cục bộ và ghi dấu lần xin. Gọi sendOtp SAU khi commit (không giữ kết nối CSDL khi chờ 9id).
export async function reserveSend(c, { orgId, phone }, { now = new Date() } = {}) {
  const p = canonicalPhone(phone);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['otp:' + orgId + p]);
  const [n] = await c.query("SELECT count(*)::int AS n FROM otp_codes WHERE org_id = $1 AND phone = $2 AND created_at > $3::timestamptz - interval '10 minutes'", [orgId, p, now]);
  if (n.n >= MAX_SENDS_PER_10_MIN) throw new AppError('otp_rate', 'Bạn đã yêu cầu mã quá nhiều lần, hãy thử lại sau ít phút', 429);
  const [day] = await c.query("SELECT count(*)::int AS n FROM otp_codes WHERE org_id = $1 AND phone = $2 AND created_at > $3::timestamptz - interval '24 hours'", [orgId, p, now]);
  if (day.n >= MAX_SENDS_PER_DAY) throw new AppError('otp_rate', 'Số này đã yêu cầu mã quá nhiều lần hôm nay, hãy liên hệ cơ sở', 429);
  const [hr] = await c.query("SELECT count(*)::int AS n FROM otp_codes WHERE org_id = $1 AND created_at > $2::timestamptz - interval '1 hour'", [orgId, now]);
  if (hr.n >= MAX_SENDS_PER_HOUR_ORG) throw new AppError('otp_rate', 'Hệ thống đang bận, hãy thử lại sau', 429);
  // code_hash = 'remote': mã nằm ở 9id, bảng này chỉ để đếm lần xin
  await c.query("INSERT INTO otp_codes(org_id, phone, code_hash, expires_at, created_at) VALUES($1, $2, 'remote', $3, $4)", [orgId, p, new Date(now.getTime() + 5 * 60 * 1000), now]);
  return { phone: p };
}

// Bước 2 (ngoài giao dịch): nhờ 9id gửi mã.
export async function sendOtp(idClient, { phone, ip }) {
  if (!otpAvailable(idClient)) throw new AppError('otp_unavailable', 'Chưa bật xác thực số điện thoại, vui lòng liên hệ cơ sở', 503);
  try { await idClient.otpSend(phone, ip); } catch (e) { throw mapRemote(e); }
}

// Kiểm mã qua 9id (ngoài giao dịch). Trả void nếu đúng, ném lỗi nếu sai.
export async function checkOtp(idClient, { phone, code, ip }) {
  if (!otpAvailable(idClient)) throw new AppError('otp_unavailable', 'Chưa bật xác thực số điện thoại, vui lòng liên hệ cơ sở', 503);
  const p = canonicalPhone(phone);
  let r;
  try { r = await idClient.otpVerify(p, typeof code === 'string' ? code : '', ip); } catch (e) { throw mapRemote(e); }
  if (!r || r.verified !== true) throw new AppError('otp_invalid', 'Mã không đúng hoặc đã hết hạn', 400);
  return p;
}

// Cấp phiên đặt phòng cho số đã xác minh (trong giao dịch).
export async function createSession(c, { orgId, phone }, { now = new Date() } = {}) {
  const token = crypto.randomBytes(24).toString('base64url');
  await c.query('INSERT INTO otp_sessions(token_hash, org_id, phone, expires_at, created_at) VALUES($1, $2, $3, $4, $5)', [sha(token), orgId, phone, new Date(now.getTime() + SESSION_TTL_MS), now]);
  return token;
}

export async function sessionPhone(c, { orgId, token }, { now = new Date() } = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const [s] = await c.query('SELECT phone FROM otp_sessions WHERE token_hash = $1 AND org_id = $2 AND expires_at > $3::timestamptz', [sha(token), orgId, now]);
  return s ? s.phone : null;
}
