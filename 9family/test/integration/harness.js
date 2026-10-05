// Dựng hệ thống THẬT để kiểm tích hợp 9id <-> 9family trong một tiến trình (không dùng 9id giả):
//   - hai PostgreSQL nhúng (cổng ngẫu nhiên), một cho 9id, một cho 9family
//   - 9id thật (OTP mock, EDGE_SECRET, INTERNAL_KEYS có khóa "family", INTERNAL_IMPORT_APPS=family; 9family KHÔNG phải delegate)
//   - 9family thật gọi 9id qua mạng nội bộ (NINE_ID_URL trực tiếp, như trong docker)
//   - "nginx" mô phỏng ở một cổng >= 17000: /id/ -> 9id (thêm X-Edge-Secret, X-Forwarded-For), /9family/ -> 9family; chặn /id/internal/ và /id/admin-api/
//     Một nguồn gốc chung (http://localhost:<cổng>) nên cookie nine_sid dùng chung như trên 9app.tech.
// Hai dịch vụ có src/config.js riêng nên nạp lần lượt, mỗi lần đặt biến môi trường trước khi import (cách làm của osin/test/integration/harness.js).
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FAM = path.join(here, '..', '..');
export const ID = path.join(FAM, '..', '9id');
const imp = (p) => import(new URL('file:///' + p.replace(/\\/g, '/')).href);

export const ID_SECRET = 'int-secret-family-0123456789abcdef-0123456789ab';
export const EDGE_SECRET = 'int-edge-secret-0123456789abcdef-QwErTy9876';

function tryBind(port) {
  return new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, () => s.close(() => resolve(true))); });
}
export async function pickPort() {
  for (let i = 0; i < 300; i++) {
    const p = 17000 + Math.floor(Math.random() * 40000);
    if (await tryBind(p)) return p;
  }
  throw new Error('không tìm được cổng trống');
}
const listen = (server, port) => new Promise((r) => server.listen(port, () => r()));
const closeServer = (s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); });

function proxy(targetPort, { mutate, intercept } = {}) {
  const log = [];
  const server = http.createServer((req, res) => {
    log.push({ method: req.method, url: req.url });
    if (intercept && intercept(req, res)) return;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const headers = { ...req.headers };
      if (mutate) mutate(req, headers);
      const up = http.request({ host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers }, (ur) => { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); });
      up.on('error', () => { try { res.writeHead(502); res.end('bad gateway'); } catch { /* */ } });
      up.end(Buffer.concat(chunks));
    });
  });
  return { server, log };
}

export async function boot({ legacy = false, cacheMs = 60_000 } = {}) {
  const { startEmbedded } = await imp(path.join(FAM, 'scripts', 'embedded-pg.js'));
  const pgId = await startEmbedded({ database: 'id_int' });
  const pgFam = await startEmbedded({ database: 'family_int' });
  const idPort = await pickPort();
  const famPort = await pickPort();
  const gwPort = await pickPort();
  const ORIGIN = `http://localhost:${gwPort}`;

  // ---------- 9id thật ----------
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: pgId.url, OTP_PROVIDER: 'mock', EDGE_SECRET,
    INTERNAL_KEYS: `family:${ID_SECRET}`, INTERNAL_IMPORT_APPS: 'family', INTERNAL_DELEGATE_APPS: '',
    POW_BITS: '8', OTP_RESEND_SEC: '0', OTP_DAILY_PER_PHONE: '1000', OTP_DAILY_PER_IP: '100000', VERIFY_PER_IP_HOUR: '1000000', INVITES_PER_USER_DAY: '100000', NEW_ACCOUNT_INVITES_PER_DAY: '100000',
    RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000', SESSION_LIMIT_PER_MIN: '1000000', INTERNAL_LIMIT_PER_MIN: '1000000', TRUSTED_PROXY_HOPS: '1',
  });
  delete process.env.BASE_PATH;
  const idDb = await imp(path.join(ID, 'src', 'db.js'));
  const idCfg = (await imp(path.join(ID, 'src', 'config.js'))).config;
  const idSrv = await imp(path.join(ID, 'src', 'server.js'));
  const idProvider = await imp(path.join(ID, 'src', 'otp-provider.js'));
  const idPow = await imp(path.join(ID, 'src', 'pow.js'));
  const idUtil = await imp(path.join(ID, 'src', 'util.js'));
  await idDb.migrate();
  const idApp = idSrv.buildApp();
  await idApp.listen(idPort);

  // ---------- 9family thật ----------
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: pgFam.url, PORT: String(famPort),
    NINE_ID_URL: `http://127.0.0.1:${idPort}/id`, NINE_ID_KEY_ID: 'family', NINE_ID_SECRET: ID_SECRET, NINE_ID_CACHE_MS: String(cacheMs),
    LEGACY_SESSIONS: legacy ? '1' : '0', VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, FAMILY_PUSH_ALLOW_ANY: '1',
    RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000', SESSION_LIMIT_PER_MIN: '1000000', MAX_FAMILIES_PER_IP_HOUR: '100000', FAMILY_AI_KEY: 'khoa-ai-thu',
    CONSOLE_API_KEY_ID: 'hub', CONSOLE_API_SECRET: 'console-secret-0123456789abcdef-test-xx',
  });
  delete process.env.BASE_PATH; // 9family: /9family
  const famCfg = (await imp(path.join(FAM, 'src', 'config.js'))).config;
  const famDb = await imp(path.join(FAM, 'src', 'db.js'));
  const famSrv = await imp(path.join(FAM, 'src', 'server.js'));
  const famId = await imp(path.join(FAM, 'src', 'id.js'));
  const famClock = (await imp(path.join(FAM, 'src', 'clock.js'))).clock;
  const famPush = await imp(path.join(FAM, 'src', 'push.js'));
  const famExport = await imp(path.join(FAM, 'scripts', 'export-to-9id.js'));
  await famDb.migrate();
  const famApp = famSrv.buildApp();
  await famApp.listen(famPort);

  // ---------- "nginx": một nguồn gốc cho cả hai ----------
  const gw = http.createServer((req, res) => {
    const u = req.url;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      gw.log.push({ method: req.method, url: u });
      if (u.startsWith('/id/internal/') || u.startsWith('/id/admin-api/')) { res.writeHead(404); res.end('nginx: not found'); return; }
      const toId = u.startsWith('/id');
      if (!toId && !u.startsWith('/9family')) { res.writeHead(404); res.end('nginx: not found'); return; }
      const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress.replace('::ffff:', '') };
      if (toId) headers['x-edge-secret'] = EDGE_SECRET;
      const up = http.request({ host: '127.0.0.1', port: toId ? idPort : famPort, method: req.method, path: u, headers }, (ur) => { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); });
      up.on('error', () => { try { res.writeHead(502); res.end('bad gateway'); } catch { /* */ } });
      up.end(Buffer.concat(chunks));
    });
  });
  gw.log = [];
  await listen(gw, gwPort);

  const sys = {
    idPort, famPort, gwPort, ORIGIN, ID_DIRECT: `http://127.0.0.1:${idPort}`, FAM_DIRECT: `http://127.0.0.1:${famPort}`,
    idCfg, famCfg, idDb, famDb, idProvider, idPow, idUtil, famId, famClock, famPush, famExport, idApp, famApp, gw,
    async stop() {
      try { await famApp.close(); } catch { /* */ }
      try { await idApp.close(); } catch { /* */ }
      await closeServer(gw);
      try { await famDb.close(); } catch { /* */ }
      try { await idDb.close(); } catch { /* */ }
      await pgFam.stop(); await pgId.stop();
    },
  };
  return sys;
}

/** "Trình duyệt" nhẹ: giữ cookie, gọi qua nginx giả, tự gắn header CSRF đúng theo đích (/id -> 9id, /9family -> 9family). */
export class Browser {
  constructor(sys, name = 'khach') { this.sys = sys; this.name = name; this.jar = {}; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(method, p, body, { headers = {}, manual = true, raw = false } = {}) {
    const h = { origin: this.sys.ORIGIN, ...headers };
    h['x-requested-with'] = p.startsWith('/id') ? '9id' : '9family';
    if (body !== undefined) h['content-type'] = 'application/json';
    const ck = this.cookieHeader(); if (ck) h.cookie = ck;
    const r = await fetch(this.sys.ORIGIN + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: manual ? 'manual' : 'follow' });
    for (const c of r.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/Max-Age=0/i.test(c) || v === '') delete this.jar[k]; else this.jar[k] = v;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* */ } }
    return { status: r.status, json, text: buf.toString('utf8'), headers: r.headers };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}, o) { return this.req('POST', p, b, o); }
  del(p, o) { return this.req('DELETE', p, undefined, o); }
  // 9id: /id/api/..., 9family: /9family/api/...
  id(method, p, body, o) { return this.req(method, '/id/api' + p, body, o); }
  fam(method, p, body, o) { return this.req(method, '/9family' + p, body, o); }
}

/** Đăng ký tài khoản 9id bằng API thật (OTP mock + proof-of-work) rồi đăng nhập; trả Browser đã có cookie nine_sid. */
export async function signup(sys, { name = 'Mẹ Thử', phone, password = 'MatKhau-Tot-1' } = {}) {
  const b = new Browser(sys, name);
  phone = phone || ('09' + String(Math.floor(30_000_000 + Math.random() * 60_000_000)));
  const ch = (await b.id('GET', '/otp/challenge')).json;
  const rq = await b.id('POST', '/otp/request', { phone, pow: { challenge: ch.challenge, counter: sys.idPow.solve(ch.challenge, ch.bits) } });
  if (rq.status !== 200) throw new Error('otp/request ' + rq.status + ' ' + rq.text);
  const code = sys.idProvider.lastOtp(sys.idUtil.normalizePhone(phone));
  const v = await b.id('POST', '/otp/verify', { phone, code });
  const reg = await b.id('POST', '/register', { ticket: v.json.ticket, phone, name, password });
  if (reg.status !== 200) throw new Error('register ' + reg.status + ' ' + reg.text);
  b.phone = phone; b.password = password; b.userId = reg.json.user.id;
  return b;
}
