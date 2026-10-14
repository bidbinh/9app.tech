const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export function normPublicPath(v) {
  let s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.includes(':') || s.startsWith('//') || s.includes('\\')) return '/id/';
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/')) s += '/';
  return s;
}

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8100),
  databaseUrlFromEnv: !!env.DATABASE_URL,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/tutor',
  basePath: env.BASE_PATH === undefined ? '/tutor' : env.BASE_PATH.replace(/\/+$/, ''),
  // API quản trị cho 9app Console: chỉ bật khi đặt cả hai biến
  consoleApiKeyId: env.CONSOLE_API_KEY_ID || '',
  consoleApiSecret: env.CONSOLE_API_SECRET || '',
  // Tích hợp 9id (tùy chọn): không có NINE_ID_SECRET (>= 32 ký tự) thì tắt hẳn, app chạy ẩn danh như trước
  nineIdUrl: (env.NINE_ID_URL || 'http://9id:8102/id').replace(/\/+$/, ''),
  nineIdKeyId: env.NINE_ID_KEY_ID || 'tutor',
  nineIdSecret: env.NINE_ID_SECRET || '',
  nineIdPublicPath: normPublicPath(env.NINE_ID_PUBLIC_PATH),
  idCacheMs: int(env.NINE_ID_CACHE_MS, 60_000),
  idTimeoutMs: int(env.NINE_ID_TIMEOUT_MS, 1500),
  idBreakMs: int(env.NINE_ID_BREAK_MS, 10_000),
  // giới hạn tần suất (mỗi phút)
  trustedProxyHops: int(env.TRUSTED_PROXY_HOPS, 1),
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 3000),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
  sessionLimitPerMin: int(env.SESSION_LIMIT_PER_MIN, 180),
  // giới hạn nghiệp vụ
  tutorsPerIpHour: int(env.TUTORS_PER_IP_HOUR, 5),
  recoverPerIpHour: int(env.RECOVER_PER_IP_HOUR, 30),
  maxSessionsPerTutor: 8,
  maxPairCodes: 3,
  maxActiveStudents: 150,
  maxStudents: 400,
  maxSlots: 300,
  maxLessons: 30000,
  maxLedger: 20000,
  maxShareLinks: 400,
  sessionDays: 90,
};

const DEFAULT_DB = 'postgres://postgres:ship@localhost:5440/tutor';
// Cấu hình production không an toàn thì từ chối khởi động
export function productionProblems(c = config) {
  const p = [];
  if (!c.production) return p;
  if (/MAT_KHAU|CHANGE_?ME|<mật khẩu/i.test(c.databaseUrl || '')) p.push('DATABASE_URL còn mật khẩu mẫu (MAT_KHAU), hãy đặt mật khẩu thật');
  if (!c.databaseUrlFromEnv || !c.databaseUrl || c.databaseUrl === DEFAULT_DB) p.push('DATABASE_URL chưa đặt (đang dùng chuỗi mặc định localhost), production phải trỏ tới CSDL thật');
  return p;
}
