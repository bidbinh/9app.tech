import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { ApiError } from './errors.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function normalizePhone(input) {
  let p = String(input || '').replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  else if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
  if (!/^0[35789]\d{8}$/.test(p)) throw new ApiError(400, 'invalid_phone', 'Số điện thoại không hợp lệ');
  return p;
}

// ---- gửi OTP: kênh cắm được ----
const providers = {
  console: async (phone, code) => {
    // Production không in mã ra log: phải cấu hình kênh thật.
    console.log('[otp]', phone, config.production ? '(đã gửi qua console, mã bị ẩn)' : code);
  },
  webhook: async (phone, code) => {
    const url = process.env.OTP_WEBHOOK_URL;
    if (!url) throw new Error('thiếu OTP_WEBHOOK_URL');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (process.env.OTP_WEBHOOK_TOKEN || '') },
      body: JSON.stringify({ phone, message: `9Ship: mã xác thực của bạn là ${code}. Có hiệu lực ${Math.round(config.otpTtlSec / 60)} phút.` }),
    });
    if (!r.ok) throw new Error('kênh OTP trả ' + r.status);
  },
};
// ---- eSMS: Zalo ZNS (mẫu đã duyệt) rồi SMS brandname, giống cách 9Sport gửi OTP ----
const esmsHasZalo = () => Boolean(config.esmsApiKey && config.esmsSecret && config.esmsZaloOa && config.esmsZaloTemp);
const esmsHasSms = () => Boolean(config.esmsApiKey && config.esmsSecret && config.esmsBrandname);
export const esmsConfigured = () => esmsHasZalo() || esmsHasSms();

async function esmsPost(path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.esmsTimeoutMs);
  try {
    const res = await fetch(config.esmsBase + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error('eSMS HTTP ' + res.status);
    const j = await res.json().catch(() => ({}));
    if (String(j.CodeResult) !== '100') throw new Error('eSMS ' + j.CodeResult + ': ' + (j.ErrorMessage || ''));
  } finally { clearTimeout(timer); }
}
const phoneZero = (p) => p; // số đã chuẩn hóa dạng 0xxxxxxxxx
const fillTemplate = (t, code) => String(t).split('{ma}').join(code).split('{phut}').join(String(Math.round(config.otpTtlSec / 60)));

const esmsChannels = {
  async zalo(phone, code) {
    if (!esmsHasZalo()) throw new Error('chưa cấu hình Zalo qua eSMS');
    const data = JSON.parse(config.esmsZaloData);
    const tempData = {};
    for (const [k, v] of Object.entries(data)) tempData[k] = fillTemplate(v, code);
    const body = { ApiKey: config.esmsApiKey, SecretKey: config.esmsSecret, OAID: config.esmsZaloOa, TempID: config.esmsZaloTemp, Phone: phoneZero(phone), TempData: tempData, SendingMode: '1', campaignid: 'OTP 9Ship' };
    if (config.esmsSandbox) body.Sandbox = '1';
    await esmsPost('/MainService.svc/json/SendZaloMessage_V6/', body);
  },
  async sms(phone, code) {
    if (!esmsHasSms()) throw new Error('chưa cấu hình SMS brandname');
    const body = { ApiKey: config.esmsApiKey, SecretKey: config.esmsSecret, Brandname: config.esmsBrandname, Phone: phoneZero(phone), Content: fillTemplate(config.esmsSmsTemplate, code), SmsType: '2', IsUnicode: '0' };
    if (config.esmsSandbox) body.Sandbox = '1';
    await esmsPost('/MainService.svc/json/SendMultipleMessage_V4_post_json/', body);
  },
};
providers.esms = async (phone, code) => {
  let last = null;
  for (const ch of config.esmsChannels) {
    if (!esmsChannels[ch]) continue;
    try { await esmsChannels[ch](phone, code); return; } catch (e) { last = e; console.error('[otp] kênh', ch, 'lỗi:', e.message); }
  }
  throw last || new Error('không có kênh OTP nào được cấu hình');
};

export function registerOtpProvider(name, fn) { providers[name] = fn; }
export const sentForTests = [];

export async function requestOtp(phoneInput, ip) {
  const phone = normalizePhone(phoneInput);
  // Kênh thủ công: không gửi gì; người dùng nhận mã do quản trị cấp (issueOtp) qua kênh riêng như Zalo.
  if (config.otpProvider === 'manual' || (config.otpProvider === 'esms' && !esmsConfigured())) return { ok: true, manual: true };
  const [{ n: perPhone }] = await query(
    "SELECT count(*)::int AS n FROM otps WHERE phone=$1 AND created_at > now() - interval '24 hours'", [phone]);
  const [{ n: perIp }] = await query(
    "SELECT count(*)::int AS n FROM otps WHERE ip=$1 AND created_at > now() - interval '24 hours'", [ip || '']);
  if (perPhone >= config.otpDailyPerPhone || perIp >= config.otpDailyPerIp) {
    throw new ApiError(429, 'otp_limit', 'Đã vượt giới hạn gửi mã trong ngày');
  }
  const last = await query("SELECT 1 FROM otps WHERE phone=$1 AND created_at > now() - interval '30 seconds'", [phone]);
  if (last.length) throw new ApiError(429, 'otp_too_soon', 'Vui lòng đợi 30 giây trước khi xin mã mới');

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await query(
    'INSERT INTO otps(phone, code_hash, expires_at, ip) VALUES($1,$2,$3,$4)',
    [phone, sha(code + ':' + phone + ':' + config.signSecret), new Date(Date.now() + config.otpTtlSec * 1000), ip || ''],
  );
  const send = providers[config.otpProvider];
  if (!send) throw new ApiError(503, 'otp_unavailable', 'Kênh gửi mã chưa được cấu hình');
  try { await send(phone, code); } catch (e) {
    console.error('[otp] gửi lỗi:', e.message);
    throw new ApiError(503, 'otp_unavailable', 'Không gửi được mã, thử lại sau');
  }
  if (!config.production) sentForTests.push({ phone, code });
  return config.otpDev ? { ok: true, devCode: code } : { ok: true };
}

// Quản trị cấp mã đăng nhập dùng một lần (15 phút) cho một số điện thoại khi chưa có kênh SMS.
export async function issueOtp(phoneInput) {
  const phone = normalizePhone(phoneInput);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await query('UPDATE otps SET used=true WHERE phone=$1 AND used=false', [phone]);
  await query(
    'INSERT INTO otps(phone, code_hash, expires_at, ip) VALUES($1,$2,$3,$4)',
    [phone, sha(code + ':' + phone + ':' + config.signSecret), expiresAt, 'admin']);
  return { phone, code, expiresAt: expiresAt.toISOString() };
}

async function consumeOtp(phone, code) {
  const rows = await query(
    `SELECT id, code_hash, tries FROM otps
      WHERE phone=$1 AND used=false AND expires_at > now()
      ORDER BY id DESC LIMIT 1`, [phone]);
  if (!rows.length) throw new ApiError(400, 'otp_invalid', 'Mã không đúng hoặc đã hết hạn');
  const o = rows[0];
  if (o.tries >= config.otpMaxTries) throw new ApiError(429, 'otp_locked', 'Nhập sai quá nhiều lần, hãy xin mã mới');
  const want = Buffer.from(o.code_hash);
  const got = Buffer.from(sha(String(code || '') + ':' + phone + ':' + config.signSecret));
  const ok = want.length === got.length && crypto.timingSafeEqual(want, got);
  if (!ok) {
    await query('UPDATE otps SET tries = tries + 1 WHERE id=$1', [o.id]);
    throw new ApiError(400, 'otp_invalid', 'Mã không đúng hoặc đã hết hạn');
  }
  // dùng một lần, và chỉ khi chưa ai dùng trước
  const upd = await query('UPDATE otps SET used=true WHERE id=$1 AND used=false RETURNING id', [o.id]);
  if (!upd.length) throw new ApiError(400, 'otp_invalid', 'Mã không đúng hoặc đã hết hạn');
}

async function newSession({ userId, role, ttlMs }) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    'INSERT INTO sessions(token_hash, user_id, role, expires_at) VALUES($1,$2,$3,$4)',
    [sha(token), userId, role, new Date(Date.now() + ttlMs)],
  );
  return token;
}

export async function verifyOtp(phoneInput, code) {
  const phone = normalizePhone(phoneInput);
  await consumeOtp(phone, code);
  const u = await query(
    'INSERT INTO users(phone) VALUES($1) ON CONFLICT (phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING id, phone, name, status',
    [phone]);
  if (u[0].status !== 'active') throw new ApiError(403, 'account_disabled', 'Tài khoản đã bị khóa');
  const token = await newSession({ userId: u[0].id, role: 'user', ttlMs: config.sessionDays * 86400_000 });
  return { token, user: { id: u[0].id, phone: u[0].phone, name: u[0].name } };
}

export async function logout(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [sha(token)]);
}

// Gắn vào http.setAuthResolver
export async function resolveSession(ctx) {
  const token = ctx.cookies.sid;
  if (!token) return null;
  const rows = await query(
    `SELECT s.token_hash, s.role, s.user_id, s.stepup_until, u.phone, u.name, u.status
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`, [sha(token)]);
  if (!rows.length) return null;
  const r = rows[0];
  if (r.role === 'admin') return { role: 'admin', token, user: null, hash: r.token_hash };
  if (r.status !== 'active') return null;
  return { role: 'user', token, hash: r.token_hash, stepupUntil: r.stepup_until, user: { id: r.user_id, phone: r.phone, name: r.name } };
}

// ---- xác thực lại cho thao tác tiền nhạy cảm ----
export async function requestStepUp(user, ip) {
  return requestOtp(user.phone, ip);
}
export async function verifyStepUp(ctx, code) {
  await consumeOtp(ctx.user.phone, code);
  await query("UPDATE sessions SET stepup_until = now() + interval '5 minutes' WHERE token_hash=$1", [ctx.session.hash]);
  return { ok: true };
}
export async function requireStepUp(ctx) {
  const r = await query('SELECT stepup_until > now() AS ok FROM sessions WHERE token_hash=$1', [ctx.session.hash]);
  if (!r.length || !r[0].ok) throw new ApiError(403, 'step_up_required', 'Cần xác thực lại bằng mã OTP');
}

// ---- admin: mã quản trị + TOTP ----
function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error('base32 không hợp lệ');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secretBase32, timeMs = Date.now(), step = 30) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timeMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

function safeEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function adminLogin(token, otp) {
  if (!config.adminToken || !config.adminTotpSecret) {
    throw new ApiError(503, 'admin_disabled', 'Quản trị chưa được cấu hình (ADMIN_TOKEN, ADMIN_TOTP_SECRET)');
  }
  const t = Date.now();
  const okTotp = [-30000, 0, 30000].some((d) => safeEq(totp(config.adminTotpSecret, t + d), String(otp || '')));
  const okTok = safeEq(token || '', config.adminToken);
  if (!(okTok && okTotp)) throw new ApiError(401, 'unauthorized', 'Thông tin quản trị không đúng');
  return newSession({ userId: null, role: 'admin', ttlMs: 8 * 3600_000 });
}
