// Máy chủ 9interview: phát tệp tĩnh + hai API gọi AI. Không lưu nội dung người dùng; nhật ký không chứa nội dung.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { ApiError } from './errors.js';
import { RateLimiter, VN_OFFSET_MS } from './ratelimit.js';
import { validateFeedbackInput, validateRewriteInput, runFeedback, runRewrite } from './ai.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const SESSION_RE = /^[A-Za-z0-9_-]{16,64}$/;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export function createServer(cfg = loadConfig(), { fetchImpl = fetch, now = () => Date.now(), log = (line) => console.log(line) } = {}) {
  const limiter = new RateLimiter(now);
  const MIN = 60_000, DAY = 86_400_000;

  const sendJson = (res, status, obj, extraHeaders = {}) => {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extraHeaders });
    res.end(body);
  };

  const clientIp = (req) => {
    if (cfg.trustProxy) {
      // nginx PHẢI đặt X-Forwarded-For = $remote_addr (ghi đè, không nối thêm). Vẫn lấy phần tử CUỐI: phần đầu do client tự thêm nên giả mạo được.
      const xf = req.headers['x-forwarded-for'];
      if (typeof xf === 'string' && xf) { const last = xf.split(',').pop().trim(); if (last) return last.slice(0, 64); }
    }
    return req.socket.remoteAddress || 'unknown';
  };

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const ct = String(req.headers['content-type'] || '');
      if (!/^application\/json\b/i.test(ct)) return reject(new ApiError(415, 'unsupported_type', 'Cần gửi dữ liệu dạng JSON'));
      const declared = parseInt(req.headers['content-length'] || '0', 10);
      if (declared > cfg.maxBodyBytes) { req.resume(); return reject(new ApiError(413, 'too_large', 'Nội dung gửi lên quá lớn')); }
      let size = 0; const chunks = [];
      let dead = false;
      req.on('data', (c) => {
        if (dead) return;
        size += c.length;
        if (size > cfg.maxBodyBytes) { dead = true; req.resume(); reject(new ApiError(413, 'too_large', 'Nội dung gửi lên quá lớn')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (dead) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new ApiError(400, 'invalid_json', 'Dữ liệu gửi lên không phải JSON hợp lệ')); }
      });
      req.on('error', () => { if (!dead) reject(new ApiError(400, 'aborted', 'Kết nối bị ngắt')); });
    });
  }

  // Kiểm tra nguồn gốc cho POST (chống gọi chéo trang)
  function checkOrigin(req) {
    const o = req.headers.origin;
    if (!o) return;
    let host;
    try { host = new URL(o).host; } catch { throw new ApiError(403, 'bad_origin', 'Nguồn yêu cầu không hợp lệ'); }
    const allowed = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean);
    if (!allowed.includes(host)) throw new ApiError(403, 'bad_origin', 'Nguồn yêu cầu không hợp lệ');
  }

  // Bước 1 (rẻ): AI bật, có mã phiên, chưa vượt trần yêu cầu hỏng. Chưa trừ hạn mức AI.
  function precheck(req) {
    if (!cfg.aiKey) throw new ApiError(503, 'ai_disabled', 'Tính năng AI chưa được bật trên máy chủ này. Các phần còn lại vẫn dùng bình thường.');
    const sid = req.headers['x-session'];
    if (typeof sid !== 'string' || !SESSION_RE.test(sid)) throw new ApiError(400, 'no_session', 'Thiếu mã phiên ẩn danh');
    const ip = clientIp(req);
    if (limiter.blocked(`bad:${ip}`, cfg.badPerMin, MIN)) throw new ApiError(429, 'rate_limited', 'Có quá nhiều yêu cầu không hợp lệ, đợi một chút rồi thử lại.', { retryAfterSec: 30 });
    return { sid, ip };
  }

  // Bước 3: chỉ yêu cầu HỢP LỆ mới trừ hạn mức AI. Hạn mức ngày đổi lúc 0 giờ giờ Việt Nam. Mỗi yêu cầu tính 1 lượt, kể cả khi máy chủ thử lại Gemini tối đa 3 lần.
  function charge({ sid, ip }) {
    const r = limiter.check([
      { name: 'ip_min', key: `ip:${ip}:m`, limit: cfg.ipPerMin, windowMs: MIN },
      { name: 'sess_min', key: `s:${sid}:m`, limit: cfg.sessionPerMin, windowMs: MIN },
      { name: 'ip_day', key: `ip:${ip}:d`, limit: cfg.ipPerDay, windowMs: DAY, offsetMs: VN_OFFSET_MS },
      { name: 'global_day', key: 'g:d', limit: cfg.globalPerDay, windowMs: DAY, offsetMs: VN_OFFSET_MS },
    ]);
    if (!r.ok) throw new ApiError(429, 'rate_limited', r.rule === 'ip_day' || r.rule === 'global_day' ? 'Hôm nay (tính theo giờ Việt Nam) đã dùng hết lượt AI. Lượt mới có từ 0 giờ sáng mai.' : 'Bạn thao tác hơi nhanh, đợi một chút rồi thử lại.', { retryAfterSec: r.retryAfterSec });
  }

  async function api(req, res, route) {
    if (route === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, { ai: !!cfg.aiKey, limits: { answerMaxChars: 4000, experienceMaxChars: 3000, jobMaxChars: 5000 } });
    }
    if ((route === '/api/feedback' || route === '/api/rewrite') && req.method === 'POST') {
      checkOrigin(req);
      const who = precheck(req);
      let input;
      try {
        const body = await readJson(req);
        input = route === '/api/feedback' ? validateFeedbackInput(body) : validateRewriteInput(body);
      } catch (e) {
        if (e instanceof ApiError && e.status < 500) limiter.hit(`bad:${who.ip}`, cfg.badPerMin, MIN);
        throw e;
      }
      charge(who);
      if (route === '/api/feedback') return sendJson(res, 200, { feedback: await runFeedback(cfg, input, fetchImpl) });
      return sendJson(res, 200, { rewrite: await runRewrite(cfg, input, fetchImpl) });
    }
    if (route === '/api/feedback' || route === '/api/rewrite' || route === '/api/config') throw new ApiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ');
    throw new ApiError(404, 'not_found', 'Không tìm thấy');
  }

  function serveStatic(req, res, rel) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ');
    let p;
    try { p = decodeURIComponent(rel); } catch { throw new ApiError(400, 'bad_path', 'Đường dẫn không hợp lệ'); }
    if (p.includes('\0') || p.includes('\\')) throw new ApiError(400, 'bad_path', 'Đường dẫn không hợp lệ');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    const full = path.normalize(path.join(PUBLIC_DIR, p));
    if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    let st;
    try { st = fs.statSync(full); } catch { throw new ApiError(404, 'not_found', 'Không tìm thấy'); }
    if (!st.isFile()) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext];
    if (!type) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const headers = {
      'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
      'cache-control': ext === '.png' || ext === '.svg' ? 'public, max-age=86400' : 'no-cache',
    };
    if (ext === '.html') headers['content-security-policy'] = CSP;
    if (path.basename(full) === 'sw.js') headers['service-worker-allowed'] = (cfg.basePath || '') + '/';
    let data = fs.readFileSync(full);
    if (ext === '.html') data = Buffer.from(data.toString('utf8').replaceAll('__BASE__', (cfg.basePath || '') + '/'));
    headers['content-length'] = data.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  const server = http.createServer(async (req, res) => {
    const t0 = now();
    let status = 500;
    const origEnd = res.end.bind(res);
    res.end = (...a) => { status = res.statusCode; return origEnd(...a); };
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://x').pathname;
      if (pathname === '/healthz' || pathname === `${cfg.basePath}/healthz`) return sendJson(res, 200, { ok: true, ai: !!cfg.aiKey });
      const base = cfg.basePath;
      if (base && pathname === base) { res.writeHead(301, { location: base + '/' }); return res.end(); }
      if (base && !pathname.startsWith(base + '/')) throw new ApiError(404, 'not_found', 'Không tìm thấy');
      const rel = pathname.slice(base.length); // bắt đầu bằng '/'
      if (rel.startsWith('/api/')) return await api(req, res, rel);
      serveStatic(req, res, rel.slice(1));
    } catch (e) {
      if (e instanceof ApiError) {
        const headers = e.extra?.retryAfterSec ? { 'retry-after': String(e.extra.retryAfterSec) } : {};
        if (!res.headersSent) sendJson(res, e.status, { error: e.code, message: e.message, ...(e.extra?.retryAfterSec ? { retryAfterSec: e.extra.retryAfterSec } : {}) }, headers);
      } else {
        log(`[loi] ${req.method} ${pathname} ${e && e.name}`);
        if (!res.headersSent) sendJson(res, 500, { error: 'internal', message: 'Có lỗi ở máy chủ. Bạn thử lại sau nhé.' });
      }
    } finally {
      // Chỉ ghi phương thức, đường dẫn (không chuỗi truy vấn), mã trạng thái, thời gian. Không bao giờ ghi nội dung hay IP.
      if (pathname.startsWith(cfg.basePath + '/api/') || status >= 500) log(`${req.method} ${pathname} ${status} ${now() - t0}ms`);
    }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;

  return {
    server, limiter,
    listen: (port = cfg.port, host) => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }),
  };
}

export async function start(cfg = loadConfig()) {
  const app = createServer(cfg);
  const port = await app.listen(cfg.port);
  console.log(`9interview chạy tại http://localhost:${port}${cfg.basePath}/ (AI: ${cfg.aiKey ? 'bật' : 'tắt'})`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
