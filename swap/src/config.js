const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

const DEFAULT_DB = 'postgres://postgres:ship@localhost:5440/swap';

// Đường dẫn giao diện 9id cùng nguồn gốc: luôn dạng /xxx/ (một dấu / ở đầu, một dấu / ở cuối); giá trị lạ (có lược đồ, //host, gạch ngược) thì dùng /id/
export function normPublicPath(v) {
  let s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.includes(':') || s.startsWith('//') || s.includes('\\')) return '/id/';
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/')) s += '/';
  return s;
}

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8099),
  databaseUrlFromEnv: !!env.DATABASE_URL,
  databaseUrl: env.DATABASE_URL || DEFAULT_DB,
  basePath: env.BASE_PATH === undefined ? '/swap' : env.BASE_PATH.replace(/\/+$/, ''),
  // API quản trị cho 9app Console: chỉ bật khi đặt cả hai biến
  consoleApiKeyId: env.CONSOLE_API_KEY_ID || '',
  consoleApiSecret: env.CONSOLE_API_SECRET || '',
  // giới hạn tần suất (mỗi phút). Đồng nghiệp dùng chung IP công ty và app tự làm mới nên theo IP phải rộng.
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 6000),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
  sessionLimitPerMin: int(env.SESSION_LIMIT_PER_MIN, 120),
  // giới hạn nghiệp vụ
  maxCommunitiesPerDay: 5,
  maxCommunitiesPerIpHour: int(env.COMMUNITIES_PER_IP_HOUR, 3),
  maxMembers: 300,
  maxNameLen: 60,
  maxListingsPerDay: int(env.LISTINGS_PER_DAY, 10),
  maxOpenListingsPerMember: 30,
  maxPostsPerDay: 20,
  maxMessagesPerHour: int(env.MESSAGES_PER_HOUR, 60),
  maxMessagesPerThread: 200,
  maxThreadsPerListing: 40,
  maxRepliesPerPost: 100,
  maxRepliesPerHour: 30,
  maxReportsPerDay: 20,
  maxPhotosPerListing: 4,
  maxPhotoBytes: 380 * 1024,
  maxThumbBytes: 60 * 1024,
  maxPhotoBytesPerCommunity: int(env.COMMUNITY_PHOTO_MB, 120) * 1024 * 1024,
  maxPhotoSide: 4096,
  maxPhotoPixels: 16_000_000,
  listingDays: 30,
  maxRenewals: 3,
  photoKeepDaysAfterClose: 7,
  sessionDays: 90,
  // Tích hợp 9id (tùy chọn): không có NINE_ID_SECRET (>= 32 ký tự) thì tắt hẳn, app chạy ẩn danh như trước
  nineIdUrl: (env.NINE_ID_URL || 'http://9id:8102/id').replace(/\/+$/, ''),
  nineIdKeyId: env.NINE_ID_KEY_ID || 'swap',
  nineIdSecret: env.NINE_ID_SECRET || '',
  nineIdPublicPath: normPublicPath(env.NINE_ID_PUBLIC_PATH),   // đường dẫn giao diện 9id trên cùng nguồn gốc (nginx)
  idCacheMs: int(env.NINE_ID_CACHE_MS, 60_000),
  idTimeoutMs: int(env.NINE_ID_TIMEOUT_MS, 1500),
  idBreakMs: int(env.NINE_ID_BREAK_MS, 10_000),          // 9id vừa lỗi thì trong ngần này ms không gọi lại (>= hạn gọi, để 9id treo chỉ chặn một vài yêu cầu mỗi chu kỳ)
  ownerAbsentDays: int(env.OWNER_ABSENT_DAYS, 60),
  maxPhotoBytesPerMember: int(env.MEMBER_PHOTO_MB, 20) * 1024 * 1024,
  emptyThreadDays: 7,
  grantDaysAfterChoose: 14,
};

// Cấu hình production không an toàn thì từ chối khởi động
export function productionProblems(c = config) {
  const p = [];
  if (!c.production) return p;
  if (!c.databaseUrlFromEnv || !c.databaseUrl || c.databaseUrl === DEFAULT_DB) p.push('DATABASE_URL chưa đặt (đang dùng chuỗi mặc định localhost), production phải trỏ tới CSDL thật');
  return p;
}
