import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { ApiError } from './errors.js';
import * as pw from './password.js';
import * as sso from './sso9sport.js';

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

// ---- xác thực lại cho thao tác tiền nhạy cảm: nhập lại mật khẩu ----
export async function requireStepUp(ctx) {
  const r = await query('SELECT stepup_until > now() AS ok FROM sessions WHERE token_hash=$1', [ctx.session.hash]);
  if (!r.length || !r[0].ok) throw new ApiError(403, 'step_up_required', 'Cần xác thực lại bằng mã OTP');
}


// =====================================================================================
// Tài khoản có mật khẩu. OTP chỉ để đăng ký lần đầu và đặt lại mật khẩu.
// =====================================================================================
const lockWindowMs = () => config.loginLockMin * 60_000;

async function lockedMinutes(keys) {
  const r = await query('SELECT max(locked_until) AS l FROM auth_failures WHERE key = ANY($1::text[]) AND locked_until > now()', [keys]);
  const l = r[0] && r[0].l;
  return l ? Math.max(1, Math.ceil((new Date(l) - Date.now()) / 60_000)) : 0;
}
async function assertNotLocked(keys) {
  const m = await lockedMinutes(keys);
  if (m) throw new ApiError(429, 'locked', `Nhập sai quá nhiều lần. Thử lại sau ${m} phút hoặc dùng "Quên mật khẩu".`);
}
async function noteFail(keys) {
  for (const k of keys) {
    await query(
      `INSERT INTO auth_failures(key, fails, first_at) VALUES($1,1,now())
       ON CONFLICT (key) DO UPDATE SET
         fails = CASE WHEN auth_failures.first_at < now() - ($2 || ' milliseconds')::interval OR auth_failures.locked_until < now() THEN 1 ELSE auth_failures.fails + 1 END,
         first_at = CASE WHEN auth_failures.first_at < now() - ($2 || ' milliseconds')::interval OR auth_failures.locked_until < now() THEN now() ELSE auth_failures.first_at END,
         locked_until = CASE WHEN (CASE WHEN auth_failures.first_at < now() - ($2 || ' milliseconds')::interval OR auth_failures.locked_until < now() THEN 1 ELSE auth_failures.fails + 1 END) >= $3
                             THEN now() + ($2 || ' milliseconds')::interval ELSE NULL END`,
      [k, String(lockWindowMs()), config.loginMaxFails]);
  }
}
const clearFail = (keys) => query('DELETE FROM auth_failures WHERE key = ANY($1::text[])', [keys]);

const publicUser = (u) => ({ id: u.id, phone: u.phone, name: u.name || '' });

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 80) throw new ApiError(400, 'invalid_request', 'Họ tên cần 2-80 ký tự', { field: 'name' });
  return n;
}

async function startSession(user) {
  await query('UPDATE users SET last_login_at = now() WHERE id=$1', [user.id]);
  const token = await newSession({ userId: user.id, role: 'user', ttlMs: config.sessionDays * 86400_000 });
  return { token, user: publicUser(user) };
}

// Bước 1 của màn đăng nhập: số này đã có mật khẩu chưa?
export async function checkPhone(phoneInput) {
  const phone = normalizePhone(phoneInput);
  const u = (await query('SELECT password_hash FROM users WHERE phone=$1', [phone]))[0];
  return { phone, state: u && u.password_hash ? 'login' : 'new', sso: sso.enabled() };
}

// Đăng nhập bằng số điện thoại + mật khẩu. Số chưa có ở 9Ship nhưng có ở 9Sport thì dùng chung tài khoản đó.
export async function loginWithPassword(phoneInput, password, ip) {
  const phone = normalizePhone(phoneInput);
  if (typeof password !== 'string' || !password || password.length > 200) throw new ApiError(400, 'invalid_request', 'Nhập mật khẩu', { field: 'password' });
  const keys = ['p:' + phone, 'ip:' + (ip || '') + '|' + phone];
  await assertNotLocked(keys);
  let u = (await query('SELECT * FROM users WHERE phone=$1', [phone]))[0];
  let user = null;
  if (u && u.password_hash) {
    if (await pw.verify(password, u.password_hash)) user = u;
  } else {
    // chưa có mật khẩu ở 9Ship: thử tài khoản 9Sport
    const r = await sso.verify(phone, password);
    if (r.ok) {
      const hash = await pw.hash(password);
      const rows = await query(
        `INSERT INTO users(phone, name, password_hash, verified_at, source) VALUES($1,$2,$3, now(), '9sport')
         ON CONFLICT (phone) DO UPDATE SET password_hash=EXCLUDED.password_hash, verified_at=COALESCE(users.verified_at, now()),
           name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END
         RETURNING *`, [phone, r.name || '', hash]);
      user = rows[0];
    } else if (u) {
      // tài khoản cũ tạo bằng OTP, chưa có mật khẩu: phải đặt mật khẩu bằng OTP (không tính là nhập sai)
      throw new ApiError(409, 'password_required', 'Tài khoản này chưa có mật khẩu. Hãy đặt mật khẩu bằng mã OTP.');
    }
  }
  if (!user) {
    await noteFail(keys);
    throw new ApiError(401, 'bad_credentials', 'Số điện thoại hoặc mật khẩu không đúng');
  }
  if (user.status !== 'active') throw new ApiError(403, 'account_disabled', 'Tài khoản đã bị khóa');
  await clearFail(keys);
  return startSession(user);
}

export async function startRegister(phoneInput, ip) {
  const phone = normalizePhone(phoneInput);
  const u = (await query('SELECT password_hash FROM users WHERE phone=$1', [phone]))[0];
  if (u && u.password_hash) throw new ApiError(409, 'account_exists', 'Số này đã có tài khoản. Hãy đăng nhập.');
  return requestOtp(phone, ip);
}

// Đăng ký lần đầu: xác thực OTP một lần, đặt họ tên và mật khẩu.
export async function register(phoneInput, code, name, password) {
  const phone = normalizePhone(phoneInput);
  const cleanedName = cleanName(name);
  pw.check(password, phone);
  const exists = (await query('SELECT password_hash FROM users WHERE phone=$1', [phone]))[0];
  if (exists && exists.password_hash) throw new ApiError(409, 'account_exists', 'Số này đã có tài khoản. Hãy đăng nhập.');
  await consumeOtp(phone, code);
  const hash = await pw.hash(password);
  const rows = await query(
    `INSERT INTO users(phone, name, password_hash, verified_at, source) VALUES($1,$2,$3, now(), 'local')
     ON CONFLICT (phone) DO UPDATE SET password_hash=EXCLUDED.password_hash, verified_at=now(),
       name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END
     RETURNING *`, [phone, cleanedName, hash]);
  if (rows[0].status !== 'active') throw new ApiError(403, 'account_disabled', 'Tài khoản đã bị khóa');
  return startSession(rows[0]);
}

export async function startReset(phoneInput, ip) {
  const phone = normalizePhone(phoneInput);
  const u = (await query('SELECT id FROM users WHERE phone=$1', [phone]))[0];
  if (!u) throw new ApiError(404, 'no_account', 'Số này chưa có tài khoản. Hãy đăng ký.');
  return requestOtp(phone, ip);
}

export async function resetPassword(phoneInput, code, password) {
  const phone = normalizePhone(phoneInput);
  pw.check(password, phone);
  const u = (await query('SELECT * FROM users WHERE phone=$1', [phone]))[0];
  if (!u) throw new ApiError(404, 'no_account', 'Số này chưa có tài khoản. Hãy đăng ký.');
  await consumeOtp(phone, code);
  const hash = await pw.hash(password);
  const rows = await query('UPDATE users SET password_hash=$2, verified_at=COALESCE(verified_at, now()) WHERE id=$1 RETURNING *', [u.id, hash]);
  await query('DELETE FROM sessions WHERE user_id=$1', [u.id]); // mọi thiết bị khác phải đăng nhập lại
  await clearFail(['p:' + phone]);
  return startSession(rows[0]);
}

export async function changePassword(ctx, current, next) {
  const u = (await query('SELECT * FROM users WHERE id=$1', [ctx.user.id]))[0];
  if (!u || !(await pw.verify(String(current || ''), u.password_hash))) throw new ApiError(400, 'bad_credentials', 'Mật khẩu hiện tại không đúng', { field: 'current' });
  pw.check(next, u.phone);
  await query('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, await pw.hash(next)]);
  await query('DELETE FROM sessions WHERE user_id=$1 AND token_hash <> $2', [u.id, ctx.session.hash]);
  return { ok: true };
}

// Thao tác tiền nhạy cảm (rút tiền): nhập lại mật khẩu, có hiệu lực 5 phút.
export async function stepUpWithPassword(ctx, password) {
  const keys = ['su:' + ctx.user.id];
  await assertNotLocked(keys);
  const u = (await query('SELECT password_hash FROM users WHERE id=$1', [ctx.user.id]))[0];
  if (!u || !(await pw.verify(String(password || ''), u.password_hash))) {
    await noteFail(keys);
    throw new ApiError(401, 'bad_credentials', 'Mật khẩu không đúng');
  }
  await clearFail(keys);
  await query("UPDATE sessions SET stepup_until = now() + interval '5 minutes' WHERE token_hash=$1", [ctx.session.hash]);
  return { ok: true };
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
