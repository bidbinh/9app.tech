const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8101),
  databaseUrlFromEnv: !!env.DATABASE_URL,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/hire',
  basePath: env.BASE_PATH === undefined ? '/hire' : env.BASE_PATH.replace(/\/+$/, ''),
  // API quản trị cho 9app Console: chỉ bật khi đặt cả hai biến
  consoleApiKeyId: env.CONSOLE_API_KEY_ID || '',
  consoleApiSecret: env.CONSOLE_API_SECRET || '',
  // giới hạn tần suất (mỗi phút), theo IP / theo phiên (ghi) / theo từng đường dẫn
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 1200),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
  sessionLimitPerMin: int(env.SESSION_LIMIT_PER_MIN, 60),
  // giới hạn nghiệp vụ (mỗi ngày tính theo ngày giờ Việt Nam)
  limits: {
    jobsPerSessionDay: int(env.JOBS_PER_SESSION_DAY, 3),
    jobsPerNewSessionDay: int(env.JOBS_PER_NEW_SESSION_DAY, 2), // tài khoản dưới 24 giờ tuổi
    jobsPerIpDay: int(env.JOBS_PER_IP_DAY, 8),
    openJobsPerEmployer: int(env.OPEN_JOBS_PER_EMPLOYER, 10),
    editsPerEmployerDay: 40,
    employersPerIpDay: int(env.EMPLOYERS_PER_IP_DAY, 5),
    applyPerSessionDay: int(env.APPLY_PER_SESSION_DAY, 20),
    applyPerIpDay: int(env.APPLY_PER_IP_DAY, 60),
    pendingAppsPerJob: 200,
    revealPerSessionDay: int(env.REVEAL_PER_SESSION_DAY, 60),
    revealPerIpDay: int(env.REVEAL_PER_IP_DAY, 300),
    reportPerIpDay: 20,
    recoverPerIpHour: int(env.RECOVER_PER_IP_HOUR, 10),
    sessionsPerEmployer: 10,
    reportsToHide: 3,
  },
  maxDays: 30,
  defaultDays: 14,
  retainApplicationsDays: 60,
  sessionDays: 180,
  ipRetainDays: 30,
  // số proxy tin cậy phía trước app (nginx = 1; Cloudflare + nginx = 2); 0 = dùng địa chỉ kết nối trực tiếp
  trustedProxyHops: int(env.TRUSTED_PROXY_HOPS, 1),
};

const DEFAULT_DB = 'postgres://postgres:ship@localhost:5440/hire';
// Cấu hình production không an toàn thì từ chối khởi động
export function productionProblems(c = config) {
  const p = [];
  if (!c.production) return p;
  if (!c.databaseUrlFromEnv || !c.databaseUrl || c.databaseUrl === DEFAULT_DB) p.push('DATABASE_URL chưa đặt (đang dùng chuỗi mặc định localhost), production phải trỏ tới CSDL thật');
  if (/MAT_KHAU|CHANGE_?ME|password@/i.test(c.databaseUrl)) p.push('DATABASE_URL còn mật khẩu mẫu (MAT_KHAU), hãy đặt mật khẩu thật');
  return p;
}
