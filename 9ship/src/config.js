const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v, d) => (v === undefined || v === '' ? d : v === '1' || v === 'true');

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8099),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/ship',
  basePath: env.BASE_PATH || '/9ship',
  // ví
  walletOverdraftCap: int(env.WALLET_OVERDRAFT_CAP, 50000),
  bufferPct: int(env.BUFFER_PCT, 20), // đệm cước giữ thêm, % của cước
  bufferMin: int(env.BUFFER_MIN, 3000),
  bufferTtlHours: int(env.BUFFER_TTL_HOURS, 24 * 14),
  priceDriftPct: int(env.PRICE_DRIFT_PCT, 5),
  quoteTtlMin: int(env.QUOTE_TTL_MIN, 15),
  carrierTimeoutMs: int(env.CARRIER_TIMEOUT_MS, 4000),
  createTimeoutMs: int(env.CREATE_TIMEOUT_MS, 30000),
  unknownCreateHours: int(env.UNKNOWN_CREATE_HOURS, 2),
  // OTP
  // manual = mã do quản trị cấp (chưa có kênh SMS); console chỉ để phát triển
  otpProvider: env.OTP_PROVIDER || (env.NODE_ENV === 'production' ? 'manual' : 'console'),
  otpDev: bool(env.OTP_DEV, false) && env.NODE_ENV !== 'production',
  otpTtlSec: int(env.OTP_TTL_SEC, 300),
  otpMaxTries: int(env.OTP_MAX_TRIES, 5),
  otpDailyPerPhone: int(env.OTP_DAILY_PER_PHONE, 10),
  otpDailyPerIp: int(env.OTP_DAILY_PER_IP, 30),
  sessionDays: int(env.SESSION_DAYS, 30),
  // admin
  adminToken: env.ADMIN_TOKEN || '',
  adminTotpSecret: env.ADMIN_TOTP_SECRET || '',
  // ký link nhãn, webhook
  signSecret: env.SIGN_SECRET || 'dev-sign-secret-change-me',
  bankWebhookSecret: env.BANK_WEBHOOK_SECRET || '',
  // VietQR
  bankBin: env.BANK_BIN || '970436',
  bankAccount: env.BANK_ACCOUNT || '0000000000',
  // production không được dùng tài khoản giả: chưa cấu hình thì chặn nạp ví
  bankConfigured: Boolean(env.BANK_ACCOUNT) || env.NODE_ENV !== 'production',
  bankAccountName: env.BANK_ACCOUNT_NAME || '9SHIP',
  topupTtlMin: int(env.TOPUP_TTL_MIN, 60),
  requireCapDefault: bool(env.REQUIRE_CAP_DEFAULT, true),
  // Mặc định bật khi không phải production; production phải bật tường minh (và sẽ bị từ chối khi khởi động).
  mockCarriers: bool(env.MOCK_CARRIERS, env.NODE_ENV !== 'production'),
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 120),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
};

const DEFAULT_SIGN = 'dev-sign-secret-change-me';
// Từ chối khởi động production với cấu hình không an toàn.
export function productionProblems(c = config) {
  const p = [];
  if (!c.production) return p;
  if (c.mockCarriers) p.push('MOCK_CARRIERS đang bật: hãng mô phỏng có webhook công khai với bí mật cố định');
  if (!c.signSecret || c.signSecret === DEFAULT_SIGN || c.signSecret.length < 24) p.push('SIGN_SECRET chưa đặt hoặc quá yếu (cần ít nhất 24 ký tự ngẫu nhiên)');
  if (c.otpProvider === 'console') p.push('OTP_PROVIDER=console: production không gửi được mã đăng nhập');
  if (c.otpDev) p.push('OTP_DEV không được bật ở production');
  return p;
}
