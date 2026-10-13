import fs from 'node:fs';

const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

const DEV_SECRET = 'dev-secret-chi-dung-khi-phat-trien-0000000';
const SAMPLE = /MAT_KHAU|CHANGE_?ME|DOI_CHUOI|<mật khẩu|dev-secret|^x+$/i;
const APP_ID_RE = /^[a-z0-9]{2,20}$/;

// "id:SECRET,x:SECRET" -> Map
export function parseKeys(s) {
  const m = new Map();
  for (const part of String(s || '').split(',')) {
    const t = part.trim();
    const i = t.indexOf(':');
    if (i <= 0) continue;
    const kid = t.slice(0, i).trim(); const secret = t.slice(i + 1).trim();
    if (/^[a-z0-9_-]{1,30}$/.test(kid) && secret) m.set(kid, secret);
  }
  return m;
}

// Danh sách app: OSIN_APPS (JSON) hoặc tệp OSIN_APPS_FILE. Phần tử: { id, name, baseUrl, keyId, secret, linkPrefix? }
export function loadApps(e = env) {
  let raw = e.OSIN_APPS || '';
  if (!raw && e.OSIN_APPS_FILE) {
    try { raw = fs.readFileSync(e.OSIN_APPS_FILE, 'utf8'); } catch (err) { console.error('[config] không đọc được OSIN_APPS_FILE:', err.code || err.message); }
  }
  if (!raw.trim()) return { apps: [], error: '' };
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return { apps: [], error: 'apps phải là mảng JSON' };
    return { apps: list, error: '' };
  } catch { return { apps: [], error: 'apps không phải JSON hợp lệ' }; }
}

const apps = loadApps();

const NODE_ENVS = ['production', 'development', 'test'];

export const config = {
  nodeEnv: env.NODE_ENV || '',
  envInvalid: !!env.NODE_ENV && !NODE_ENVS.includes(env.NODE_ENV), // NODE_ENV gõ sai (ví dụ "prod") không được âm thầm chạy như môi trường phát triển
  production: env.NODE_ENV === 'production',
  port: int(env.PORT, 8103),
  databaseUrlFromEnv: !!env.DATABASE_URL,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:ship@localhost:5440/osin',
  // Mặc định chạy ở GỐC của tên miền riêng (osin.9app.tech). Đặt BASE_PATH=/osin để chạy dưới đường dẫn (chế độ cũ, cùng nguồn gốc với 9app.tech).
  basePath: env.BASE_PATH === undefined ? '' : env.BASE_PATH.replace(/\/+$/, ''),
  publicOrigin: (env.OSIN_PUBLIC_ORIGIN || '').replace(/\/+$/, ''), // https://osin.9app.tech (production bắt buộc; phát triển suy ra từ Host)
  appsOrigin: (env.OSIN_APPS_ORIGIN || '').replace(/\/+$/, ''),     // https://9app.tech: liên kết sâu tới app ở origin khác phải là URL tuyệt đối
  cookieSecure: env.NODE_ENV === 'production' || env.OSIN_COOKIE_SECURE === '1',
  idAuthorizeUrl: env.OSIN_ID_AUTHORIZE_URL || 'https://9app.tech/id/authorize',
  sessionDays: 7,
  sessionCheckMs: int(env.OSIN_SESSION_CHECK_MS, 5 * 60_000),
  sessionStaleMs: 30 * 60_000,
  // bí mật máy chủ: chống sửa hành động chờ (HMAC) và băm khóa dùng cho bộ đếm
  secret: env.OSIN_SECRET || DEV_SECRET,
  secretFromEnv: !!env.OSIN_SECRET,
  // danh tính
  identity: env.OSIN_IDENTITY || (env.NODE_ENV === 'production' ? '9id' : 'mock'),
  idUrl: (env.OSIN_ID_URL || '').replace(/\/+$/, ''), // ví dụ http://9id:8102/id
  idKeyId: env.OSIN_ID_KEY_ID || 'osin',
  idSecret: env.OSIN_ID_SECRET || '',
  idTimeoutMs: int(env.OSIN_ID_TIMEOUT_MS, 4000),
  devLogin: env.OSIN_DEV_LOGIN === '1', // chỉ để phát triển: bật /dev-login với danh tính giả
  // mô hình ngôn ngữ: gemini | offline | mock (tự chọn theo khóa nếu để trống)
  aiKey: env.OSIN_AI_KEY || '',
  aiProvider: env.OSIN_AI_PROVIDER || '',
  aiModel: env.OSIN_AI_MODEL || 'gemini-flash-latest',
  aiBase: (env.OSIN_AI_BASE || 'https://generativelanguage.googleapis.com').replace(/\/+$/, ''),
  aiTimeoutMs: int(env.OSIN_AI_TIMEOUT_MS, 25000),
  aiRetryDelayMs: int(env.OSIN_AI_RETRY_DELAY_MS, 800),
  aiMaxOutputTokens: int(env.OSIN_AI_MAX_OUTPUT_TOKENS, 1500),
  // app
  apps: apps.apps,
  appsError: apps.error,
  appManifestTimeoutMs: int(env.OSIN_MANIFEST_TIMEOUT_MS, 3000),
  appToolTimeoutMs: int(env.OSIN_TOOL_TIMEOUT_MS, 8000),
  appConfirmTimeoutMs: int(env.OSIN_CONFIRM_TIMEOUT_MS, 20000),
  manifestTtlMs: int(env.OSIN_MANIFEST_TTL_MS, 60000),
  manifestStaleMs: 10 * 60_000,
  breakerFailures: 3,
  breakerOpenMs: int(env.OSIN_BREAKER_OPEN_MS, 15000),
  // tìm chức năng: thư mục chứa *.json (mặc định data/search kèm theo)
  searchDir: env.OSIN_SEARCH_DIR || '',
  // chi phí và giới hạn
  maxMsgChars: int(env.OSIN_MAX_MSG_CHARS, 2000),
  maxToolRounds: int(env.OSIN_MAX_TOOL_ROUNDS, 6),
  maxCallsPerRound: 4,
  turnTimeoutMs: int(env.OSIN_TURN_TIMEOUT_MS, 60000),
  userTokensPerDay: int(env.OSIN_USER_TOKENS_PER_DAY, 120000),
  globalTokensPerDay: int(env.OSIN_GLOBAL_TOKENS_PER_DAY, 3000000),
  userMsgsPerDay: int(env.OSIN_USER_MSGS_PER_DAY, 150),
  turnReserveTokens: int(env.OSIN_TURN_RESERVE_TOKENS, 8000),
  chatPerMin: int(env.OSIN_CHAT_PER_MIN, 12),
  toolResultChars: 8000,
  historyContextMsgs: 20,
  historyDays: int(env.OSIN_HISTORY_DAYS, 30),
  historyMax: int(env.OSIN_HISTORY_MAX, 200),
  pendingTtlMin: 10,
  confirmPerHour: int(env.OSIN_CONFIRM_PER_HOUR, 20), // ngân sách ghi: số hành động xác nhận tối đa mỗi người mỗi giờ
  userMaxShare: 0.04, // mỗi người tối đa 4% trần token toàn hệ
  newUserFactor: Number.parseFloat(env.OSIN_NEW_USER_FACTOR || '0.25'), // người mới (< 24 giờ kể từ lần đầu Osin thấy) dùng hạn mức thấp hơn
  consentVersion: 2, // tăng khi đổi nội dung đồng ý: người dùng được hỏi lại
  noTrainConfirmed: env.OSIN_AI_NO_TRAIN_CONFIRMED === '1', // chỉ khi vận hành xác nhận gói API không dùng dữ liệu để huấn luyện mới được nói điều đó trong giao diện
  host: env.OSIN_HOST || '',
  badCookiePerMin: int(env.OSIN_BAD_COOKIE_PER_MIN, 30),
  idMaxInflight: int(env.OSIN_ID_MAX_INFLIGHT, 20),
  maxPendingOpen: 5,
  maxPendingPerTurn: 3,
  // Console và xóa dữ liệu từ 9id
  consoleApiKeyId: env.CONSOLE_API_KEY_ID || '',
  consoleApiSecret: env.CONSOLE_API_SECRET || '',
  eraseKeys: parseKeys(env.OSIN_ERASE_KEYS),
  // giới hạn tần suất (mỗi phút)
  trustedProxyHops: int(env.TRUSTED_PROXY_HOPS, 1),
  rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 3000),
  routeLimitFactor: int(env.ROUTE_LIMIT_FACTOR, 1),
  sessionLimitPerMin: int(env.SESSION_LIMIT_PER_MIN, 120),
};

const DEFAULT_DB = 'postgres://postgres:ship@localhost:5440/osin';
export function effectiveProvider(c = config) {
  return c.aiProvider || (c.aiKey ? 'gemini' : 'offline');
}

// Cấu hình production không an toàn thì từ chối khởi động
export function productionProblems(c = config) {
  const p = [];
  if (c.appsError) p.push('OSIN_APPS: ' + c.appsError);
  const seen = new Set();
  for (const a of c.apps || []) {
    if (!a || typeof a !== 'object' || !APP_ID_RE.test(a.id || '') || a.id === 'osin') { p.push('OSIN_APPS: id app không hợp lệ (cần [a-z0-9]{2,20}, khác "osin")'); continue; }
    if (seen.has(a.id)) p.push(`OSIN_APPS: trùng id "${a.id}"`);
    seen.add(a.id);
    if (!/^https?:\/\/[^\s]+$/.test(a.baseUrl || '')) p.push(`OSIN_APPS: app "${a.id}" thiếu baseUrl http(s)`);
    if (!/^[a-z0-9_-]{1,30}$/.test(a.keyId || '')) p.push(`OSIN_APPS: app "${a.id}" thiếu keyId`);
    if (a.readOnlyTools !== undefined && !(Array.isArray(a.readOnlyTools) && a.readOnlyTools.every((n) => /^[a-z][a-z0-9_]{1,40}$/.test(n)))) p.push(`OSIN_APPS: app "${a.id}" readOnlyTools phải là mảng tên công cụ`);
    if (a.receiptSecret && (a.receiptSecret === a.secret || a.receiptSecret.length < 32)) p.push(`OSIN_APPS: app "${a.id}" receiptSecret phải >= 32 ký tự và KHÁC secret của kênh`);
    if (c.production && !a.receiptSecret) p.push(`OSIN_APPS: app "${a.id}" thiếu receiptSecret (khóa biên nhận xác nhận, khác secret kênh)`);
    if (c.production && (typeof a.secret !== 'string' || a.secret.length < 32 || SAMPLE.test(a.secret))) p.push(`OSIN_APPS: bí mật của app "${a.id}" quá ngắn (cần ít nhất 32 ký tự) hoặc còn giá trị mẫu`);
  }
  if (!c.production) return p;
  if (/MAT_KHAU|CHANGE_?ME|<mật khẩu/i.test(c.databaseUrl || '')) p.push('DATABASE_URL còn mật khẩu mẫu (MAT_KHAU), hãy đặt mật khẩu thật');
  if (!c.databaseUrlFromEnv || !c.databaseUrl || c.databaseUrl === DEFAULT_DB) p.push('DATABASE_URL chưa đặt (đang dùng chuỗi mặc định localhost), production phải trỏ tới CSDL thật');
  if (!c.secretFromEnv || String(c.secret).length < 32 || SAMPLE.test(c.secret)) p.push('OSIN_SECRET chưa đặt, quá ngắn (cần ít nhất 32 ký tự) hoặc còn giá trị mẫu');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(c.publicOrigin || '')) p.push('OSIN_PUBLIC_ORIGIN chưa đặt hoặc không phải https://tên-miền (ví dụ https://osin.9app.tech)');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(c.appsOrigin || '')) p.push('OSIN_APPS_ORIGIN chưa đặt hoặc không phải https://tên-miền (ví dụ https://9app.tech), cần để liên kết sâu tới app là URL tuyệt đối');
  if (c.identity !== '9id') p.push(`OSIN_IDENTITY="${c.identity}" không dùng được ở production (bắt buộc 9id)`);
  else {
    if (!c.idUrl) p.push('OSIN_ID_URL chưa đặt (ví dụ http://9id:8102/id)');
    if (!c.idSecret || c.idSecret.length < 32 || SAMPLE.test(c.idSecret)) p.push('OSIN_ID_SECRET quá ngắn (cần ít nhất 32 ký tự) hoặc còn giá trị mẫu');
  }
  const prov = effectiveProvider(c);
  if (prov === 'mock') p.push('OSIN_AI_PROVIDER=mock không dùng được ở production');
  if (prov === 'gemini' && !c.aiKey) p.push('OSIN_AI_PROVIDER=gemini nhưng thiếu OSIN_AI_KEY');
  if (c.consoleApiKeyId || c.consoleApiSecret) {
    if (!c.consoleApiKeyId || !c.consoleApiSecret) p.push('CONSOLE_API_KEY_ID và CONSOLE_API_SECRET phải đặt cùng nhau');
    else if (c.consoleApiSecret.length < 32 || SAMPLE.test(c.consoleApiSecret)) p.push('CONSOLE_API_SECRET quá ngắn (cần ít nhất 32 ký tự) hoặc còn giá trị mẫu');
  }
  for (const [kid, secret] of c.eraseKeys) if (secret.length < 32 || SAMPLE.test(secret)) p.push(`OSIN_ERASE_KEYS: khóa "${kid}" quá ngắn hoặc còn giá trị mẫu`);
  if (c.trustedProxyHops < 1) p.push('TRUSTED_PROXY_HOPS phải >= 1 ở production (đứng sau nginx), nếu không mọi người dùng chung một IP');
  return p;
}
