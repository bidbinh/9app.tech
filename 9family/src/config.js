const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  production: env.NODE_ENV === 'production',
  test: env.NODE_ENV === 'test',
  port: int(env.PORT, 8096),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/family',
  basePath: env.BASE_PATH === undefined ? '/9family' : env.BASE_PATH.replace(/\/+$/, ''),
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
