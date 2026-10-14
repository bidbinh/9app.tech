import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { AppError } from './errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
// Giao diện chỉ dùng tệp cùng nguồn: không script/style nhúng, không tải gì từ ngoài.
const CSP = "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

export const CSRF_HEADER = '9stay';
export const COOKIE_SESSION = 'nine_sid'; // cookie phiên của 9id, cùng gốc 9app.tech

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bỏ cookie hỏng */ }
  }
  return out;
}

function compilePath(p) {
  const keys = [];
  const re = p.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp('^' + re + '$'), keys };
}

// Máy chủ HTTP mỏng, không phụ thuộc: bộ định tuyến, JSON, CSRF bằng header, giới hạn tần suất và kích thước, lỗi thống nhất.
export function createApp({ cfg = config, clock = () => new Date() } = {}) {
  const routes = [];
  const hits = new Map();
  let authResolver = async () => {};

  function route(method, p, handler, opts = {}) {
    const { re, keys } = compilePath(p);
    routes.push({ method, re, keys, handler, opts });
  }

  function rateLimited(key, limit) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + 60_000 }; hits.set(key, h); }
    h.n += 1;
    if (hits.size > 20000) {
      for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      // vẫn quá lớn (nhiều IP/khóa giả trong 60 giây): bỏ khóa cũ nhất, bộ nhớ không phình vô hạn
      for (const k of hits.keys()) { if (hits.size <= 20000) break; hits.delete(k); }
    }
    return h.n > limit;
  }

  // nginx đặt X-Forwarded-For = $remote_addr; lấy phần tử thứ n tính từ CUỐI (n = số proxy tin cậy), không lấy phần tử đầu
  // vì phần tử đầu do khách tự khai.
  function clientIp(req) {
    const hops = cfg.trustedProxyHops;
    if (hops > 0) {
      const xf = req.headers['x-forwarded-for'];
      if (xf) {
        const parts = String(xf).split(',').map((s) => s.trim()).filter(Boolean);
        const ip = parts[parts.length - hops];
        if (ip) return ip;
      }
    }
    return req.socket.remoteAddress || '';
  }

  function edgeOk(req) {
    if (!cfg.edgeSecret) return true;
    const got = Buffer.from(String(req.headers['x-edge-secret'] || ''));
    const want = Buffer.from(cfg.edgeSecret);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0; let tooBig = false;
      req.on('data', (c) => { size += c.length; if (size > cfg.maxBodyBytes) { tooBig = true; return; } chunks.push(c); });
      req.on('end', () => (tooBig ? reject(new AppError('too_large', 'Nội dung gửi lên quá lớn', 413)) : resolve(Buffer.concat(chunks).toString('utf8'))));
      req.on('error', reject);
    });
  }

  const pageCache = new Map();
  function sendIndex(res, head, file = 'index.html') {
    if (!pageCache.has(file)) pageCache.set(file, fs.readFileSync(path.join(PUBLIC, file), 'utf8'));
    const html = pageCache.get(file).replaceAll('__BASE__', cfg.basePath + '/');
    res.writeHead(200, { 'content-type': MIME['.html'], 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'cache-control': 'no-cache', 'content-security-policy': CSP });
    res.end(head ? undefined : html);
  }

  // Tệp tĩnh: chỉ GET/HEAD, chỉ trong thư mục public. Đường không có đuôi tệp là đường của giao diện (SPA) nên trả trang chính.
  function serveStatic(pathname, method, res) {
    if (pathname.includes('\0')) return false;
    const head = method === 'HEAD';
    const ext = path.extname(pathname).toLowerCase();
    // Trang đặt phòng công khai của khách: /book/<slug>
    if (!ext && /^\/book\/[a-z0-9-]+\/?$/.test(pathname)) { sendIndex(res, head, 'book.html'); return true; }
    if (pathname === '/' || pathname === '/index.html' || !ext) { sendIndex(res, head); return true; }
    const file = path.resolve(PUBLIC, '.' + path.sep + pathname.replace(/^[/\\]+/, ''));
    if (!file.startsWith(PUBLIC + path.sep)) return false;
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'cache-control': 'no-cache' });
    if (head) res.end(); else fs.createReadStream(file).pipe(res);
    return true;
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'cache-control': 'no-store', ...headers,
    });
    res.end(JSON.stringify(body));
  }

  async function handle(req, res) {
    const rid = crypto.randomBytes(6).toString('hex');
    try {
      const url = new URL(req.url, 'http://x');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new AppError('bad_path', 'Đường dẫn không hợp lệ', 400); }
      const bp = cfg.basePath;
      if (bp && (pathname === bp || pathname.startsWith(bp + '/'))) pathname = pathname.slice(bp.length) || '/';

      if (pathname !== '/healthz' && !edgeOk(req)) throw new AppError('forbidden', 'Yêu cầu không hợp lệ', 403);
      const ip = clientIp(req);
      if (rateLimited('g:' + ip, cfg.rateLimitPerMin)) throw new AppError('rate_limited', 'Bạn thao tác quá nhanh, đợi một chút rồi thử lại', 429);

      const method = req.method;
      const r = routes.find((x) => x.method === method && x.re.test(pathname));
      if (!r) {
        // Không có route nào khớp: thử tệp tĩnh/giao diện (chỉ GET/HEAD, không đụng /api/).
        if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api/') && serveStatic(pathname, method, res)) return;
        if (routes.some((x) => x.re.test(pathname))) throw new AppError('method_not_allowed', 'Phương thức không được hỗ trợ', 405);
        throw new AppError('not_found', 'Không tìm thấy', 404);
      }
      const m = pathname.match(r.re);
      const params = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });

      const mutating = method !== 'GET' && method !== 'HEAD';
      // Webhook của bên thứ ba không gửi được header CSRF; route đó tự xác thực bằng chữ ký (opts.csrf === false).
      if (mutating && r.opts.csrf !== false) {
        if (req.headers['x-requested-with'] !== CSRF_HEADER) throw new AppError('csrf', 'Yêu cầu bị từ chối (thiếu header xác thực)', 403);
        const origin = req.headers.origin;
        if (origin) {
          let oh = '';
          try { oh = new URL(origin).host; } catch { /* sai định dạng */ }
          if (oh !== req.headers.host && oh !== req.headers['x-forwarded-host']) throw new AppError('csrf', 'Yêu cầu từ nguồn không hợp lệ', 403);
        }
      }
      if (r.opts.limit && rateLimited(r.re.source + ':' + ip, r.opts.limit)) throw new AppError('rate_limited', 'Bạn thao tác quá nhanh, đợi một chút rồi thử lại', 429);

      let body = {};
      let raw = '';
      if (mutating) {
        raw = await readBody(req);
        if (raw) {
          try { body = JSON.parse(raw); } catch { throw new AppError('bad_json', 'Dữ liệu gửi lên không hợp lệ', 400); }
          if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new AppError('bad_json', 'Dữ liệu gửi lên không hợp lệ', 400);
        }
      }

      const ctx = { req, res, params, body, rawBody: raw, ip, rid, now: clock(), query: Object.fromEntries(url.searchParams), cookies: parseCookies(req.headers.cookie), user: null, member: null };
      await authResolver(ctx, r.opts.auth || 'member');

      const out = await r.handler(ctx);
      if (res.writableEnded) return;
      const headers = { 'x-request-id': rid };
      if (out && out.__raw) {
        res.writeHead(out.status || 200, { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', ...headers, ...out.headers });
        res.end(out.body);
        return;
      }
      send(res, 200, out ?? { ok: true }, headers);
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof AppError) {
        send(res, e.status, { error: { code: e.code, message: e.message, ...(e.detail ? { detail: e.detail } : {}) } }, { 'x-request-id': rid });
      } else {
        console.error(`[${rid}]`, e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e);
        send(res, 500, { error: { code: 'internal', message: 'Lỗi hệ thống, hãy thử lại sau' } }, { 'x-request-id': rid });
      }
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  return {
    route,
    setAuthResolver(fn) { authResolver = fn; },
    listen(port) { return new Promise((resolve) => server.listen(port, () => resolve(server.address().port))); },
    close() { return new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }); },
  };
}

// Kết quả dạng văn bản (CSV) cho route.
export const rawResponse = (body, { status = 200, contentType = 'text/plain; charset=utf-8', headers = {} } = {}) => ({ __raw: true, status, body, headers: { 'content-type': contentType, ...headers } });
