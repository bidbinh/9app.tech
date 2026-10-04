const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

const DEFAULT_DB = 'postgres://postgres:ship@localhost:5440/swap';

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
