import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { normIp } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const MAX_BODY = 64 * 1024;
export const CSRF_HEADER = '9hire';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
export const CSP = "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()' };

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

let indexCache = null;
// Trang gốc; og: thẻ meta xem trước khi chia sẻ (đã escape ở nơi gọi)
export function indexHtml(og = '') {
  if (!indexCache) indexCache = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  return indexCache.replaceAll('__BASE__', () => config.basePath + '/').replace('<!--OG-->', () => og);
}
export const pageHeaders = () => ({ 'content-type': MIME['.html'], ...SEC, 'cache-control': 'no-cache', 'content-security-policy': CSP });

export function createApp() {
  const routes = [];
  const hits = new Map(); // khóa -> { n, reset }
  let authResolver = async () => null;

  function route(method, p, handler, opts = {}) {
    const { re, keys } = compilePath(p);
    routes.push({ method, re, keys, handler, opts });
  }

  function rateLimited(key, limit) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + 60_000 }; hits.set(key, h); }
    h.n += 1;
    if (hits.size > 20000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return h.n > limit;
  }

  // Lấy phần tử CUỐI của X-Forwarded-For: đó là địa chỉ do proxy gần nhất (nginx) ghi, khách không giả được
  // (nếu nginx đặt X-Forwarded-For = $remote_addr thì chỉ có một phần tử).
  function clientIp(req) {
    const hops = config.trustedProxyHops;
    const xf = req.headers['x-forwarded-for'];
    if (hops > 0 && xf) {
      const parts = String(xf).split(',').map((x) => x.trim()).filter(Boolean);
      if (parts.length) return normIp(parts[Math.max(0, parts.length - hops)]);
    }
    return normIp(req.socket.remoteAddress || '');
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0; let tooBig = false;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { tooBig = true; return; }
        chunks.push(c);
      });
      req.on('end', () => (tooBig ? reject(new ApiError(413, 'too_large', 'Nội dung gửi lên quá lớn')) : resolve(Buffer.concat(chunks).toString('utf8'))));
      req.on('error', reject);
    });
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...SEC, 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  function serveStatic(urlPath, res) {
    if (urlPath === '/' || urlPath === '' || urlPath === '/index.html') {
      res.writeHead(200, pageHeaders());
      res.end(indexHtml());
      return true;
    }
    const rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) return false;
    if (path.basename(file) === 'index.html') return false;
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', ...SEC, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  async function handle(req, res) {
    const rid = crypto.randomBytes(6).toString('hex');
    try {
      const url = new URL(req.url, 'http://x');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new ApiError(400, 'bad_path', 'Đường dẫn không hợp lệ'); }
      const bp = config.basePath;
      if (bp && (pathname === bp || pathname.startsWith(bp + '/'))) pathname = pathname.slice(bp.length) || '/';

      const ip = clientIp(req);
      if (rateLimited('g:' + ip, config.rateLimitPerMin)) throw new ApiError(429, 'rate_limited', 'Bạn thao tác quá nhanh, đợi một chút rồi thử lại');

      const method = req.method;
      if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api/') && !pathname.startsWith('/admin-api/') && !pathname.startsWith('/j/') && serveStatic(pathname, res)) return;

      const r = routes.find((x) => x.method === method && x.re.test(pathname));
      if (!r) {
        if (routes.some((x) => x.re.test(pathname))) throw new ApiError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ');
        throw new ApiError(404, 'not_found', 'Không tìm thấy');
      }
      const m = pathname.match(r.re);
      const params = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });

      const cookies = parseCookies(req.headers.cookie);
      const mutating = method !== 'GET' && method !== 'HEAD';
      if (mutating && !r.opts.noCsrf) {
        if (req.headers['x-requested-with'] !== CSRF_HEADER) throw new ApiError(403, 'csrf', 'Yêu cầu bị từ chối (thiếu header xác thực). Tải lại trang rồi thử lại.');
        const origin = req.headers.origin;
        if (origin) {
          let oh = '';
          try { oh = new URL(origin).host; } catch { /* sai định dạng */ }
          if (oh !== req.headers.host && oh !== req.headers['x-forwarded-host']) throw new ApiError(403, 'csrf', 'Yêu cầu từ nguồn không hợp lệ');
        }
      }
      if (r.opts.limit && rateLimited((r.opts.limitKey || r.re.source) + ':' + ip, r.opts.limit * config.routeLimitFactor)) {
        throw new ApiError(429, 'rate_limited', 'Bạn thao tác quá nhanh, đợi một chút rồi thử lại');
      }

      let raw = '';
      let body = null;
      if (mutating) {
        raw = await readBody(req);
        if (!r.opts.raw && raw) {
          try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'bad_json', 'Dữ liệu gửi lên không hợp lệ'); }
          if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'bad_json', 'Dữ liệu gửi lên không hợp lệ');
        }
        if (!r.opts.raw && !body) body = {};
      }

      const ctx = {
        req, res, params, raw, body, cookies, ip, rid,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        sid: null,
        setCookies: [],
        setCookie(name, value, { maxAge, clear } = {}) {
          const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${bp || ''}/`, 'HttpOnly', 'SameSite=Lax'];
          if (config.production) parts.push('Secure');
          if (clear) parts.push('Max-Age=0');
          else if (maxAge) parts.push(`Max-Age=${maxAge}`);
          this.setCookies.push(parts.join('; '));
        },
      };
      await authResolver(ctx);
      if (mutating && ctx.sid && rateLimited('s:' + ctx.sid, config.sessionLimitPerMin * config.routeLimitFactor)) {
        throw new ApiError(429, 'rate_limited', 'Bạn thao tác quá nhanh, đợi một chút rồi thử lại');
      }

      const out = await r.handler(ctx);
      if (res.writableEnded) return;
      const headers = { 'x-request-id': rid, 'cache-control': 'no-store' };
      if (ctx.setCookies.length) headers['set-cookie'] = ctx.setCookies;
      if (out && out.__raw) {
        res.writeHead(out.status || 200, { ...SEC, ...headers, ...out.headers });
        res.end(out.body);
        return;
      }
      send(res, out && out.__status ? out.__status : 200, out && out.__status ? out.body : (out ?? { ok: true }), headers);
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof ApiError) {
        send(res, e.status, { error: { code: e.code, message: e.message, ...(e.extra ? { details: e.extra } : {}) } }, { 'x-request-id': rid });
      } else {
        console.error(`[${rid}] lỗi không mong đợi:`, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
        send(res, 500, { error: { code: 'internal', message: 'Máy chủ gặp lỗi, thử lại sau ít phút', requestId: rid } }, { 'x-request-id': rid });
      }
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  server.requestTimeout = 30_000;

  return {
    route,
    server,
    setAuthResolver(fn) { authResolver = fn; },
    listen(port = 0) {
      return new Promise((resolve) => server.listen(port, () => resolve(server.address().port)));
    },
    close() {
      return new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
    },
  };
}

export const raw = (body, headers = {}, status = 200) => ({ __raw: true, body, headers, status });
export const status = (code, body) => ({ __status: code, body });
