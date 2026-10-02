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
  unknownCreateHours: int(env.UNKNOWN_CREATE_HOURS, 2),
  // OTP
  otpProvider: env.OTP_PROVIDER || 'console',
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
  bankAccountName: env.BANK_ACCOUNT_NAME || '9SHIP',
  topupTtlMin: int(env.TOPUP_TTL_MIN, 60),
  requireCapDefault: bool(env.REQUIRE_CAP_DEFAULT, true),
  mockCarriers: bool(env.MOCK_CARRIERS, true),
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 120),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
};
