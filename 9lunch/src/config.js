const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8097),
  databaseUrlFromEnv: !!env.DATABASE_URL,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/lunch',
  basePath: env.BASE_PATH === undefined ? '/9lunch' : env.BASE_PATH.replace(/\/+$/, ''),
  // API quản trị cho 9app Console: chỉ bật khi đặt cả hai biến
  consoleApiKeyId: env.CONSOLE_API_KEY_ID || '',
  consoleApiSecret: env.CONSOLE_API_SECRET || '',
  // giới hạn tần suất (mỗi phút)
  // nhiều đồng nghiệp dùng chung một IP công ty và app tự làm mới mỗi 5 đến 8 giây nên giới hạn theo IP phải rộng
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 6000),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
  sessionLimitPerMin: int(env.SESSION_LIMIT_PER_MIN, 120),
  // giới hạn nghiệp vụ
  maxTeamsPerDay: 5,
  maxTeamsPerIpHour: int(env.TEAMS_PER_IP_HOUR, 3),
  maxMealsPerDay: 30,
  maxOpenMeals: 200,
  maxMembers: 100,
  maxItemsPerMember: 30,
  maxProposals: 20,
  maxNameLen: 60,
  sessionDays: 90,
  // Tích hợp 9id (tùy chọn): không có NINE_ID_SECRET (>= 32 ký tự) thì tắt hẳn, app chạy ẩn danh như trước
  nineIdUrl: (env.NINE_ID_URL || 'http://9id:8102/id').replace(/\/+$/, ''),
  nineIdKeyId: env.NINE_ID_KEY_ID || 'lunch',
  nineIdSecret: env.NINE_ID_SECRET || '',
  nineIdPublicPath: env.NINE_ID_PUBLIC_PATH || '/id/',   // đường dẫn giao diện 9id trên cùng nguồn gốc (nginx)
  idCacheMs: int(env.NINE_ID_CACHE_MS, 60_000),
  idTimeoutMs: int(env.NINE_ID_TIMEOUT_MS, 3000),
  idBreakMs: int(env.NINE_ID_BREAK_MS, 1500),            // 9id vừa lỗi thì trong ngần này ms không gọi lại
};

const DEFAULT_DB = 'postgres://postgres:ship@localhost:5440/lunch';
// Cấu hình production không an toàn thì từ chối khởi động
export function productionProblems(c = config) {
  const p = [];
  if (!c.production) return p;
  if (!c.databaseUrlFromEnv || !c.databaseUrl || c.databaseUrl === DEFAULT_DB) p.push('DATABASE_URL chưa đặt (đang dùng chuỗi mặc định localhost), production phải trỏ tới CSDL thật');
  return p;
}
