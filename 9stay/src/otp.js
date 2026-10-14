import crypto from 'node:crypto';
import { AppError } from './errors.js';
import { config } from './config.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
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
// HMAC với bí mật máy chủ: lộ CSDL cũng không dò ngược được 10^6 mã.
const codeHash = (orgId, phone, code) => crypto.createHmac('sha256', config.nineIdSecret || 'dev-otp-secret').update(`${orgId}:${phone}:${code}`).digest('hex');

// Bên gửi tin: { send(phone, code) }. Chế độ 'log' chỉ để phát triển (in ra console); chế độ 'off' từ chối vì chưa nối nhà cung cấp SMS/Zalo.
// Chế độ 'esms': gửi SMS qua eSMS.vn (REST JSON). CHƯA kiểm với tài khoản thật: tên trường/mã phản hồi theo tài liệu công khai của eSMS,
// cần thử một tin thật (SmsType 8 = tin OTP đầu số ngẫu nhiên; Brandname nếu có thì dùng SmsType 2) trước khi bật.
export function makeEsmsSender({ apiKey, secretKey, brandname = '', fetchImpl = fetch, timeoutMs = 8000 }) {
  return {
    async send(phone, code) {
      const body = { ApiKey: apiKey, SecretKey: secretKey, Phone: phone, Content: `${code} la ma xac thuc dat phong cua ban. Co hieu luc 5 phut, khong chia se cho ai.`, SmsType: brandname ? '2' : '8', IsUnicode: '0', Sandbox: '0', RequestId: crypto.randomUUID() };
      if (brandname) body.Brandname = brandname;
      let res;
      try {
        res = await fetchImpl('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
        });
      } catch { throw new AppError('otp_unavailable', 'Không gửi được mã xác thực, hãy thử lại sau', 503); }
      let j = null;
      try { j = await res.json(); } catch { /* không phải JSON */ }
      if (!res.ok || !j || String(j.CodeResult) !== '100') {
        console.error('[otp:esms] gửi thất bại, CodeResult=' + (j && j.CodeResult));
        throw new AppError('otp_unavailable', 'Không gửi được mã xác thực, hãy thử lại sau', 503);
      }
    },
  };
}

export function makeOtpSender(mode, opts = {}) {
  if (mode === 'esms') return makeEsmsSender(opts);
  if (mode === 'log') return { send: async (phone, code) => { console.log(`[otp] ${phone}: ${code}`); } };
  return { ready: false, send: async () => { throw new AppError('otp_unavailable', 'Chưa bật gửi mã xác thực, vui lòng liên hệ cơ sở', 503); } };
}

// Trả mã để route gửi SAU khi commit.
export async function requestOtp(c, { orgId, phone }, { now = new Date() } = {}) {
  const p = canonicalPhone(phone);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['otp:' + orgId + p]);
  const [n] = await c.query("SELECT count(*)::int AS n FROM otp_codes WHERE org_id = $1 AND phone = $2 AND created_at > $3::timestamptz - interval '10 minutes'", [orgId, p, now]);
  if (n.n >= MAX_SENDS_PER_10_MIN) throw new AppError('otp_rate', 'Bạn đã yêu cầu mã quá nhiều lần, hãy thử lại sau ít phút', 429);
  const [day] = await c.query("SELECT count(*)::int AS n FROM otp_codes WHERE org_id = $1 AND phone = $2 AND created_at > $3::timestamptz - interval '24 hours'", [orgId, p, now]);
  if (day.n >= MAX_SENDS_PER_DAY) throw new AppError('otp_rate', 'Số này đã yêu cầu mã quá nhiều lần hôm nay, hãy liên hệ cơ sở', 429);
  const [hr] = await c.query("SELECT count(*)::int AS n FROM otp_codes WHERE org_id = $1 AND created_at > $2::timestamptz - interval '1 hour'", [orgId, now]);
  if (hr.n >= MAX_SENDS_PER_HOUR_ORG) throw new AppError('otp_rate', 'Hệ thống đang bận, hãy thử lại sau', 429);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await c.query('INSERT INTO otp_codes(org_id, phone, code_hash, expires_at, created_at) VALUES($1, $2, $3, $4, $5)', [orgId, p, codeHash(orgId, p, code), new Date(now.getTime() + OTP_TTL_MS), now]);
  return { ok: true, phone: p, code };
}

// Không ném lỗi khi sai mã: việc tăng số lần thử phải được lưu, mà ném lỗi trong giao dịch sẽ hoàn tác nó. Route tự ném sau khi commit.
export async function verifyOtp(c, { orgId, phone, code }, { now = new Date() } = {}) {
  const p = canonicalPhone(phone);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['otp:' + orgId + p]);
  const [row] = await c.query('SELECT id, code_hash, attempts FROM otp_codes WHERE org_id = $1 AND phone = $2 AND used_at IS NULL AND expires_at > $3::timestamptz ORDER BY created_at DESC LIMIT 1', [orgId, p, now]);
  if (!row || row.attempts >= MAX_ATTEMPTS) return { ok: false };
  await c.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
  const want = Buffer.from(row.code_hash);
  const got = Buffer.from(codeHash(orgId, p, String(code ?? '').replace(/\D/g, '')));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { ok: false };
  await c.query('UPDATE otp_codes SET used_at = $2 WHERE id = $1', [row.id, now]);
  const token = crypto.randomBytes(24).toString('base64url');
  await c.query('INSERT INTO otp_sessions(token_hash, org_id, phone, expires_at, created_at) VALUES($1, $2, $3, $4, $5)', [sha(token), orgId, p, new Date(now.getTime() + SESSION_TTL_MS), now]);
  return { ok: true, token, phone: p };
}

export async function sessionPhone(c, { orgId, token }, { now = new Date() } = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const [s] = await c.query('SELECT phone FROM otp_sessions WHERE token_hash = $1 AND org_id = $2 AND expires_at > $3::timestamptz', [sha(token), orgId, now]);
  return s ? s.phone : null;
}

export const hashToken = sha;
