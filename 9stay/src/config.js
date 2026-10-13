const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8110),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:stay@localhost:5441/stay',
  basePath: env.BASE_PATH === undefined ? '/stay' : env.BASE_PATH.replace(/\/+$/, ''),
  // 9id: địa chỉ nội bộ, khóa app và bí mật ký (cùng cặp với INTERNAL_KEYS của 9id)
  nineIdUrl: env.NINE_ID_URL || 'http://9id:8102/id',
  nineIdKey: env.NINE_ID_KEY || 'stay',
  nineIdSecret: env.NINE_ID_SECRET || '',
  // giới hạn tần suất mỗi phút
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 1200),
  redeemLimitPerMin: int(env.REDEEM_LIMIT_PER_MIN, 10),
  maxBodyBytes: 64 * 1024,
};

// Cấu hình production không an toàn thì từ chối khởi động.
export function productionProblems(c = config, e = env) {
  const out = [];
  if (!c.production) return out;
  if (!e.DATABASE_URL || /stay@localhost/.test(e.DATABASE_URL)) out.push('DATABASE_URL thiếu hoặc còn là giá trị mẫu');
  if (!c.nineIdSecret || c.nineIdSecret.length < 32) out.push('NINE_ID_SECRET thiếu hoặc ngắn hơn 32 ký tự');
  if (!/^https?:\/\//.test(c.nineIdUrl)) out.push('NINE_ID_URL không hợp lệ');
  return out;
}
