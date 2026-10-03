const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8199),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/console',
  basePath: env.BASE_PATH || '/admin',
  // khóa mã hóa bí mật của app (AES-256-GCM); production bắt buộc đặt
  consoleKey: env.CONSOLE_KEY || '',
  // chỉ gọi tới các máy chủ này (chống SSRF); phân tách bằng dấu phẩy
  allowedHosts: (env.CONSOLE_ALLOWED_HOSTS || '9ship,k77htk,9fin,9quy,localhost,127.0.0.1').split(',').map((x) => x.trim()).filter(Boolean),
  connectorTimeoutMs: int(env.CONNECTOR_TIMEOUT_MS, 10000),
  connectorMaxBytes: int(env.CONNECTOR_MAX_BYTES, 5 * 1024 * 1024),
  syncEveryMin: int(env.SYNC_EVERY_MIN, 5),
  staleAfterMin: int(env.STALE_AFTER_MIN, 20),
  sessionHours: int(env.SESSION_HOURS, 8),
  loginMaxFails: int(env.LOGIN_MAX_FAILS, 5),
  loginLockMin: int(env.LOGIN_LOCK_MIN, 15),
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 300),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
};

export function productionProblems(c = config) {
  const p = [];
  if (!c.production) return p;
  if (!c.consoleKey || c.consoleKey.length < 32) p.push('CONSOLE_KEY chưa đặt hoặc quá ngắn (cần ít nhất 32 ký tự ngẫu nhiên)');
  return p;
}
