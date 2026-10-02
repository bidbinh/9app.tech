import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ApiError } from './errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const MAX_BODY = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function compilePath(p) {
  const keys = [];
  const re = p.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp('^' + re + '$'), keys };
}

export function createApp() {
  const routes = [];
  const hits = new Map(); // ip -> { n, reset }
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
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return h.n > limit;
  }

  function clientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
    return req.socket.remoteAddress || '';
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(new ApiError(413, 'too_large', 'Nội dung quá lớn')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function send(res, status, body, headers = {}) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      'content-type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      ...headers,
    });
    res.end(payload);
  }

  function serveStatic(urlPath, res) {
    let rel = urlPath === '/' || urlPath === '' ? '/index.html' : urlPath;
    rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return false;
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'cache-control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400',
    };
    if (ext === '.html') {
      headers['content-security-policy'] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'";
    }
    res.writeHead(200, headers);
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
      if (rateLimited('g:' + ip, config.rateLimitPerMin)) throw new ApiError(429, 'rate_limited', 'Quá nhiều yêu cầu, thử lại sau');

      const method = req.method;
      if (method === 'GET' && !pathname.startsWith('/v1/') && serveStatic(pathname, res)) return;

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
        if (req.headers['x-requested-with'] !== '9ship') throw new ApiError(403, 'csrf', 'Thiếu header xác thực yêu cầu');
        const origin = req.headers.origin;
        if (origin) {
          let oh = '';
          try { oh = new URL(origin).host; } catch { /* sai định dạng */ }
          if (oh !== req.headers.host) throw new ApiError(403, 'csrf', 'Origin không hợp lệ');
        }
      }
      if (r.opts.limit && rateLimited(r.opts.limitKey ? r.opts.limitKey + ':' + ip : r.re.source + ':' + ip, r.opts.limit * config.routeLimitFactor)) {
        throw new ApiError(429, 'rate_limited', 'Quá nhiều yêu cầu, thử lại sau');
      }

      let raw = '';
      let body = null;
      if (mutating) {
        raw = await readBody(req);
        if (!r.opts.raw && raw) {
          try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'bad_json', 'JSON không hợp lệ'); }
        }
      }

      const ctx = {
        req, res, params, raw, body, cookies, ip, rid,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        session: null, user: null,
        setCookies: [],
        setCookie(name, value, { maxAge, clear } = {}) {
          const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${bp || '/'}/`, 'HttpOnly', 'SameSite=Lax'];
          if (config.production) parts.push('Secure');
          if (clear) parts.push('Max-Age=0');
          else if (maxAge) parts.push(`Max-Age=${maxAge}`);
          this.setCookies.push(parts.join('; '));
        },
      };
      const sess = await authResolver(ctx);
      if (sess) { ctx.session = sess; ctx.user = sess.user; }
      if (r.opts.auth === 'user' && !ctx.user) throw new ApiError(401, 'unauthorized', 'Cần đăng nhập');
      if (r.opts.auth === 'admin' && !(sess && sess.role === 'admin')) throw new ApiError(401, 'unauthorized', 'Cần quyền quản trị');

      const out = await r.handler(ctx);
      if (res.writableEnded) return;
      const headers = { 'x-request-id': rid, 'cache-control': 'no-store' };
      if (ctx.setCookies.length) headers['set-cookie'] = ctx.setCookies;
      if (out && out.__html) {
        res.writeHead(out.status || 200, {
          'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'",
          'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...headers,
        });
        res.end(out.html);
        return;
      }
      send(res, out && out.__status ? out.__status : 200, out && out.__status ? out.body : (out ?? { ok: true }), headers);
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof ApiError) {
        send(res, e.status, { error: { code: e.code, message: e.message, ...(e.extra ? { details: e.extra } : {}) } }, { 'x-request-id': rid });
      } else {
        console.error(`[${rid}] lỗi không mong đợi:`, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
        send(res, 500, { error: { code: 'internal', message: 'Lỗi hệ thống', requestId: rid } }, { 'x-request-id': rid });
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

export const html = (htmlText, status = 200) => ({ __html: true, html: htmlText, status });
export const status = (code, body) => ({ __status: code, body });
