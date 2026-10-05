const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  production: env.NODE_ENV === 'production',
  test: env.NODE_ENV === 'test',
  port: int(env.PORT, 8096),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/family',
  basePath: env.BASE_PATH === undefined ? '/9family' : env.BASE_PATH.replace(/\/+$/, ''),
  // Tài khoản 9app dùng chung (dịch vụ 9id). 9family là app thường (không phải delegate): mọi lần đọc gia đình đều kèm token phiên của chính người dùng.
  nineIdUrl: (env.NINE_ID_URL || 'http://9id:8102/id').replace(/\/+$/, ''),
  nineIdKeyId: env.NINE_ID_KEY_ID || 'family',
  nineIdSecret: env.NINE_ID_SECRET || '',
  nineIdPublicPath: (env.NINE_ID_PUBLIC_PATH || '/id/'),   // đường dẫn giao diện 9id trên cùng nguồn gốc (nginx)
  idCacheMs: int(env.NINE_ID_CACHE_MS, 60_000),             // đệm verify / gia đình, tối đa 60 giây theo spec 9id
  idTimeoutMs: int(env.NINE_ID_TIMEOUT_MS, 5000),
  idBreakMs: int(env.NINE_ID_BREAK_MS, 1500),               // 9id vừa lỗi hạ tầng thì trả 503 ngay trong ngần này ms (không để yêu cầu dồn chờ hết thời gian)
  // Chế độ tương thích khi cutover: vẫn cho XEM (chỉ đọc) bằng phiên ẩn danh cũ (cookie fsid) với gia đình chưa được nhận về 9id. Tắt sau khi chuyển xong.
  legacySessions: env.LEGACY_SESSIONS === '1',
  consoleApiKeyId: env.CONSOLE_API_KEY_ID || '',
  consoleApiSecret: env.CONSOLE_API_SECRET || '',
  // Web Push (VAPID). Thiếu khóa thì tắt đẩy, thông báo trong app vẫn chạy.
  vapidPublic: env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: env.VAPID_PRIVATE_KEY || '',
  vapidSubject: env.VAPID_SUBJECT || 'mailto:admin@9app.tech',
  pushAllowAnyHost: env.FAMILY_PUSH_ALLOW_ANY === '1',
  // AI đọc ảnh thời khóa biểu (Gemini). Thiếu khóa thì ẩn tính năng.
  aiKey: env.FAMILY_AI_KEY || '',
  aiModel: env.FAMILY_AI_MODEL || 'gemini-flash-latest',
  aiBase: env.FAMILY_AI_BASE || 'https://generativelanguage.googleapis.com',
  aiRetryDelayMs: int(env.FAMILY_AI_RETRY_MS, 1500),
  aiTimeoutMs: 45_000,
  aiPerFamilyPerDay: 20,
  aiPerIpPerDay: 30,
  aiGlobalPerDay: int(env.FAMILY_AI_GLOBAL_PER_DAY, 300),
  maxFamiliesPerIpPerHour: int(env.MAX_FAMILIES_PER_IP_HOUR, 10),
  // số proxy tin cậy phía trước (nginx = 1): lấy phần tử thứ n tính từ cuối của X-Forwarded-For
  trustedProxyHops: int(env.TRUSTED_PROXY_HOPS, 1),
  // giới hạn tần suất (mỗi phút)
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 6000),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
  sessionLimitPerMin: int(env.SESSION_LIMIT_PER_MIN, 180),
  schedulerEveryMs: int(env.SCHEDULER_EVERY_MS, 20_000),
  // giới hạn nghiệp vụ
  maxFamiliesPerDay: 5,
  maxMembers: 30,
  maxChildren: 8,
  maxEvents: 800,
  maxRides: 200,
  maxTasks: 300,
  maxShopping: 300,
  maxNameLen: 60,
  maxRangeDays: 62,
  inviteDays: 7,
  deviceLinkMinutes: 10,
  sessionDays: 400,
};
export const DEFAULT_ESC = { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 };

// Chạy production mà cấu hình còn mẫu/localhost thì từ chối khởi động (tránh nối nhầm CSDL hoặc dùng mật khẩu mẫu)
export function productionProblems(c = config, e = env) {
  const out = [];
  if (!c.production) return out;
  if (!e.DATABASE_URL) out.push('Thiếu DATABASE_URL.');
  else {
    if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(e.DATABASE_URL)) out.push('DATABASE_URL đang trỏ localhost; trong container phải trỏ tới 9ship-db.');
    if (/MAT_KHAU|CHANGE_?ME|password|:ship@/i.test(e.DATABASE_URL)) out.push('DATABASE_URL còn mật khẩu mẫu.');
  }
  if (!e.NINE_ID_SECRET || e.NINE_ID_SECRET.length < 32 || /CHANGE_?ME|MAT_KHAU/i.test(e.NINE_ID_SECRET)) out.push('Thiếu NINE_ID_SECRET hoặc quá ngắn/còn mẫu (cần ít nhất 32 ký tự, trùng khóa của app "family" trong INTERNAL_KEYS của 9id).');
  if (e.NINE_ID_URL && !/^https?:\/\/[^/]+(\/[^?#]*)?$/.test(e.NINE_ID_URL)) out.push('NINE_ID_URL không hợp lệ (ví dụ http://9id:8102/id).');
  if (c.nineIdKeyId === 'osin') out.push('NINE_ID_KEY_ID không được là khóa của app ủy quyền (osin).');
  if ((e.VAPID_PUBLIC_KEY && !e.VAPID_PRIVATE_KEY) || (!e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY)) out.push('Phải đặt đủ cả VAPID_PUBLIC_KEY và VAPID_PRIVATE_KEY.');
  if (e.CONSOLE_API_KEY_ID && (e.CONSOLE_API_SECRET || '').length < 24) out.push('CONSOLE_API_SECRET quá ngắn (cần ít nhất 24 ký tự).');
  return out;
}
