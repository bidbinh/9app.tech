// Cấu hình đọc từ biến môi trường. loadConfig(env) để test dựng cấu hình riêng.
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

export function normalizeBase(b) {
  let s = String(b ?? '').trim();
  if (!s || s === '/') return '';
  if (!s.startsWith('/')) s = '/' + s;
  return s.replace(/\/+$/, '');
}

export function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 8098),
    basePath: normalizeBase(env.BASE_PATH ?? '/interview'),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    // Thiếu khóa thì phần AI tắt gọn, còn lại vẫn chạy.
    aiKey: (env.INTERVIEW_AI_KEY || '').trim(),
    aiModel: env.INTERVIEW_AI_MODEL || 'gemini-flash-latest',
    aiBase: (env.INTERVIEW_AI_BASE || 'https://generativelanguage.googleapis.com').replace(/\/+$/, ''),
    aiTimeoutMs: int(env.INTERVIEW_AI_TIMEOUT_MS, 45_000),
    aiRetryDelayMs: int(env.INTERVIEW_AI_RETRY_MS, 1500),
    aiTotalMs: int(env.INTERVIEW_AI_TOTAL_MS, 60_000),
    badPerMin: int(env.INTERVIEW_BAD_PER_MIN, 20),
    maxBodyBytes: int(env.INTERVIEW_MAX_BODY, 32 * 1024),
    ipPerMin: int(env.INTERVIEW_IP_PER_MIN, 8),
    ipPerDay: int(env.INTERVIEW_IP_PER_DAY, 60),
    sessionPerMin: int(env.INTERVIEW_SESSION_PER_MIN, 6),
    globalPerDay: int(env.INTERVIEW_GLOBAL_PER_DAY, 3000),
  };
}
