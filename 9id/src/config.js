const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

const DEV_PEPPER = 'dev-pepper-chi-dung-khi-phat-trien-0000';

// "family:SECRET,fin:SECRET" -> Map(kid -> secret)
export function parseKeys(s) {
  const m = new Map();
  for (const part of String(s || '').split(',')) {
    const t = part.trim();
    const i = t.indexOf(':');
    if (i <= 0) continue;
    const kid = t.slice(0, i).trim();
    const secret = t.slice(i + 1).trim();
    if (/^[a-z0-9_-]{1,30}$/.test(kid) && secret) m.set(kid, secret);
  }
  return m;
}

// "osin=https://osin.9app.tech/auth/callback;khac=https://a.example/cb,https://a.example/cb2" -> Map(client -> Set(redirect_uri))
export function parseClients(v) {
  const m = new Map();
  for (const part of String(v || '').split(';')) {
    const t = part.trim(); const i = t.indexOf('=');
    if (i <= 0) continue;
    const id = t.slice(0, i).trim();
    const uris = t.slice(i + 1).split(',').map((x) => x.trim()).filter(Boolean);
    if (/^[a-z0-9_-]{1,30}$/.test(id) && uris.length) m.set(id, new Set(uris));
  }
  return m;
}

// Phiên trượt, không hạn cố định: chỉ hết hiệu lực khi sessionDays ngày liền không dùng (trình duyệt cũng giới hạn cookie ~400 ngày).
export function readSessionPolicy(e) {
  const pos = (v, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
  return { sessionDays: pos(e.SESSION_DAYS, 365), maxSessions: pos(e.MAX_SESSIONS, 30) };
}

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8102),
  databaseUrlFromEnv: !!env.DATABASE_URL,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/id',
  basePath: env.BASE_PATH === undefined ? '/id' : env.BASE_PATH.replace(/\/+$/, ''),
  // bí mật dùng để băm số điện thoại (HMAC) và mã OTP; production bắt buộc đặt riêng
  phonePepper: env.PHONE_PEPPER || DEV_PEPPER,
  phonePepperFromEnv: !!env.PHONE_PEPPER,
  // pepper cũ trong giai đoạn xoay: tra cứu lời mời khớp cả hai, lời mời mới luôn băm bằng pepper mới
  phonePepperOld: env.PHONE_PEPPER_OLD || '',
  // header bí mật do nginx đặt; production chỉ chấp nhận yêu cầu trình duyệt khi header đúng, và chỉ khi đó mới tin X-Forwarded-For
  edgeSecret: env.EDGE_SECRET || '',
  // cổng gửi OTP: esms | console | mock
  otpProvider: env.OTP_PROVIDER || (env.NODE_ENV === 'production' ? 'esms' : 'console'),
  otpTtlSec: int(env.OTP_TTL_SEC, 300),
  otpMaxTries: 5,
  otpResendSec: int(env.OTP_RESEND_SEC, 60),
  otpDailyPerPhone: int(env.OTP_DAILY_PER_PHONE, 5),
  otpDailyPerIp: int(env.OTP_DAILY_PER_IP, 30),
  otpMaxTriesTotal: int(env.OTP_MAX_TRIES_TOTAL, 20),
  otpDailyGuesses: int(env.OTP_DAILY_GUESSES, 25),
  otpDailyReserved: int(env.OTP_DAILY_RESERVED, 400),
  powBits: int(env.POW_BITS, 16),
  powMaxExtraBits: int(env.POW_MAX_EXTRA_BITS, 3),
  powTtlSec: 120,
  otpDailyGlobal: int(env.OTP_DAILY_GLOBAL, 2000),
  verifyPerIpHour: int(env.VERIFY_PER_IP_HOUR, 30),
  ticketTtlSec: 900,
  // eSMS (Zalo ZNS rồi SMS brandname): khóa chỉ đọc từ môi trường
  esmsBase: (env.ESMS_BASE || 'https://rest.esms.vn').replace(/\/+$/, ''),
  esmsApiKey: env.ESMS_API_KEY || '',
  esmsSecret: env.ESMS_SECRET || '',
  esmsBrandname: env.ESMS_BRANDNAME || '',
  esmsSmsTemplate: env.ESMS_SMS_TEMPLATE || '{ma} la ma xac thuc 9app cua ban, hieu luc {phut} phut. Khong chia se ma nay.',
  esmsZaloOa: env.ESMS_ZALO_OA || '',
  esmsZaloTemp: env.ESMS_ZALO_TEMP || '',
  esmsZaloData: env.ESMS_ZALO_DATA || '{"otp": "{ma}", "time": "{phut}"}',
  esmsChannels: (env.ESMS_CHANNELS || 'zalo,sms').split(',').map((x) => x.trim()).filter(Boolean),
  esmsSandbox: env.ESMS_SANDBOX === '1',
  esmsTimeoutMs: int(env.ESMS_TIMEOUT_MS, 12000),
  // nhập tài khoản 9Sport (để trống = tắt)
  sso9sportUrl: env.SSO_9SPORT_URL || '',
  sso9sportTimeoutMs: int(env.SSO_9SPORT_TIMEOUT_MS, 8000),
  // API nội bộ cho các app: "family:SECRET,fin:SECRET"
  internalKeys: parseKeys(env.INTERNAL_KEYS),
  internalLast4Apps: new Set(String(env.INTERNAL_LAST4_APPS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  internalDelegateApps: new Set(String(env.INTERNAL_DELEGATE_APPS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  internalImportApps: new Set(String(env.INTERNAL_IMPORT_APPS || '').split(',').map((x) => x.trim()).filter(Boolean)),
  internalDelegateLimitPerMin: int(env.INTERNAL_DELEGATE_LIMIT_PER_MIN, 1200),
  claimDays: int(env.CLAIM_DAYS, 30),
  // app ở tên miền con riêng đăng nhập bằng mã dùng một lần: client + redirect_uri phải khớp CHÍNH XÁC (không wildcard)
  oauthClients: parseClients(env.OAUTH_CLIENTS),
  oauthRequireConsent: env.OAUTH_REQUIRE_CONSENT !== '0',
  authCodeTtlSec: int(env.AUTH_CODE_TTL_SEC, 60),
  appSessionDays: int(env.APP_SESSION_DAYS, 30),
  internalLimitPerMin: int(env.INTERNAL_LIMIT_PER_MIN, 6000),
  // API quản trị cho 9app Console: chỉ bật khi đặt cả hai biến
  consoleApiKeyId: env.CONSOLE_API_KEY_ID || '',
  consoleApiSecret: env.CONSOLE_API_SECRET || '',
  // giới hạn tần suất (mỗi phút)
  trustedProxyHops: int(env.TRUSTED_PROXY_HOPS, 1),
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 3000),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
  sessionLimitPerMin: int(env.SESSION_LIMIT_PER_MIN, 180),
  // khóa tạm đăng nhập
  loginPairLimit: int(env.LOGIN_PAIR_LIMIT, 5),
  loginPhoneLimit: int(env.LOGIN_PHONE_LIMIT, 30),
  loginIpLimit: int(env.LOGIN_IP_LIMIT, 40),
  // giới hạn nghiệp vụ
  ...readSessionPolicy(env),
  maxFamiliesOwned: 10,
  maxFamiliesJoined: 20,
  maxChildren: 30,
  maxMembers: 40,
  inviteTtlDays: 14,
  invitesPerUserDay: int(env.INVITES_PER_USER_DAY, 20),
  newAccountInvitesPerDay: int(env.NEW_ACCOUNT_INVITES_PER_DAY, 3),
  newAccountHours: 24,
  maxPendingPerPhone: 5,
  maxPendingPerFamily: 30,
};

const DEFAULT_DB = 'postgres://postgres:ship@localhost:5440/id';
const SAMPLE = /MAT_KHAU|CHANGE_?ME|DOI_CHUOI|<mật khẩu|dev-pepper|^x+$/i;

// bí mật yếu: ít ký tự khác nhau hoặc một mẫu ngắn lặp lại
export function weakSecret(s) {
  const str = String(s);
  if (new Set(str).size < 12) return true;
  for (let n = 1; n <= 8; n++) if (str.length >= n * 3 && str === str.slice(0, n).repeat(Math.ceil(str.length / n)).slice(0, str.length)) return true;
  return false;
}

export function esmsConfigured(c = config) {
  const zalo = c.esmsApiKey && c.esmsSecret && c.esmsZaloOa && c.esmsZaloTemp;
  const sms = c.esmsApiKey && c.esmsSecret && c.esmsBrandname;
  return Boolean(zalo || sms);
}

// Cấu hình production không an toàn thì từ chối khởi động
export function productionProblems(c = config) {
  const p = [];
  if (!c.production) return p;
  if (/MAT_KHAU|CHANGE_?ME|<mật khẩu/i.test(c.databaseUrl || '')) p.push('DATABASE_URL còn mật khẩu mẫu (MAT_KHAU), hãy đặt mật khẩu thật');
  if (!c.databaseUrlFromEnv || !c.databaseUrl || c.databaseUrl === DEFAULT_DB) p.push('DATABASE_URL chưa đặt (đang dùng chuỗi mặc định localhost), production phải trỏ tới CSDL thật');
  if (!c.phonePepperFromEnv || String(c.phonePepper).length < 32 || SAMPLE.test(c.phonePepper) || weakSecret(c.phonePepper)) p.push('PHONE_PEPPER chưa đặt, quá ngắn (cần ít nhất 32 ký tự, khuyến nghị 64 ký tự hex), lặp ký tự/ít ký tự khác nhau hoặc còn giá trị mẫu');
  if (c.phonePepperOld && (String(c.phonePepperOld).length < 32 || c.phonePepperOld === c.phonePepper)) p.push('PHONE_PEPPER_OLD phải dài ít nhất 32 ký tự và khác PHONE_PEPPER');
  if (!c.edgeSecret || String(c.edgeSecret).length < 32 || SAMPLE.test(c.edgeSecret) || weakSecret(c.edgeSecret)) p.push('EDGE_SECRET chưa đặt, ngắn (cần ít nhất 32 ký tự), lặp ký tự hoặc còn giá trị mẫu: nginx phải đặt header X-Edge-Secret cùng giá trị');
  if (c.otpProvider !== 'esms') p.push(`OTP_PROVIDER="${c.otpProvider}" không dùng được ở production (chỉ chấp nhận esms)`);
  else if (!esmsConfigured(c)) p.push('OTP_PROVIDER=esms nhưng thiếu cấu hình ESMS_API_KEY/ESMS_SECRET kèm ESMS_BRANDNAME hoặc (ESMS_ZALO_OA và ESMS_ZALO_TEMP)');
  if (esmsConfigured(c) && c.esmsZaloOa && c.esmsZaloTemp) {
    try { const z = JSON.parse(c.esmsZaloData); if (!z || typeof z !== 'object' || Array.isArray(z)) throw new Error('x'); } catch { p.push('ESMS_ZALO_DATA không phải JSON đối tượng hợp lệ'); }
  }
  for (const [cid, uris] of c.oauthClients || []) {
    if (!c.internalKeys.has(cid)) p.push(`OAUTH_CLIENTS: client "${cid}" chưa có khóa trong INTERNAL_KEYS (cần để đổi mã lấy phiên)`);
    for (const u of uris) {
      let ok = false;
      try { const x = new URL(u); ok = x.protocol === 'https:' && !x.hash && !u.includes('*'); } catch { ok = false; }
      if (!ok) p.push(`OAUTH_CLIENTS: redirect_uri "${u}" của "${cid}" phải là https, không có # và không có ký tự đại diện *`);
    }
  }
  for (const [kid, secret] of c.internalKeys) {
    if (secret.length < 32 || SAMPLE.test(secret) || weakSecret(secret)) p.push(`INTERNAL_KEYS: khóa "${kid}" quá ngắn (cần ít nhất 32 ký tự) hoặc còn giá trị mẫu`);
  }
  if (c.consoleApiKeyId || c.consoleApiSecret) {
    if (!c.consoleApiKeyId || !c.consoleApiSecret) p.push('CONSOLE_API_KEY_ID và CONSOLE_API_SECRET phải đặt cùng nhau');
    else if (c.consoleApiSecret.length < 32 || SAMPLE.test(c.consoleApiSecret)) p.push('CONSOLE_API_SECRET quá ngắn (cần ít nhất 32 ký tự) hoặc còn giá trị mẫu');
  }
  if (c.trustedProxyHops < 1) p.push('TRUSTED_PROXY_HOPS phải >= 1 ở production (đứng sau nginx), nếu không mọi người dùng chung một IP');
  return p;
}
