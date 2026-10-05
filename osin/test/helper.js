// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server thật, LLM giả, app giả qua SDK.
import http from 'node:http';
process.env.RATE_LIMIT_PER_MIN ??= '1000000';
process.env.ROUTE_LIMIT_FACTOR ??= '1000';
process.env.SESSION_LIMIT_PER_MIN ??= '1000000';
process.env.OSIN_CHAT_PER_MIN ??= '1000000';
process.env.OSIN_AI_RETRY_DELAY_MS ??= '5';
process.env.OSIN_NEW_USER_FACTOR ??= '1'; // test không bị hạn mức người mới, trừ test riêng
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

export const { config } = await import('../src/config.js');
export const db = await import('../src/db.js');
export const { buildApp } = await import('../src/server.js');
export const { createMockIdentity } = await import('../src/identity.js');
export const { createMockProvider } = await import('../src/llm/mock.js');
export const { createRegistry } = await import('../src/apps.js');
export const { createFakeApp, FAKE_SECRET } = await import('./fake-app.js');
export const { resetChatRate } = await import('../src/usage.js');
export const { createSession, sessionCookieName, resetBadCookies } = await import('../src/auth.js');
export const { ApiError } = await import('../src/errors.js');
export const { loadSearchIndex } = await import('../src/tools/search.js');

export let base = '';
let app; let closers = [];
export const identity = createMockIdentity();
export let registry = null;

/** Dựng server Osin với LLM giả `llm` và danh sách app `apps` (cấu hình, không phải đối tượng fake). */
export async function boot({ llm, apps = [], extra = {} } = {}) {
  if (app) { await app.close(); app = null; }
  for (let i = 0; ; i++) {
    try { await db.migrate(); await db.resetForTests(); break; } catch (e) { if (i >= 4 || !/ECONNRESET|ECONNREFUSED|terminating/.test(String(e.code || e.message))) throw e; await new Promise((r) => setTimeout(r, 400)); await db.close(); }
  }
  resetChatRate();
  registry = createRegistry({ apps, searchEntries: loadSearchIndex(), config: { ...config, ...extra } });
  app = buildApp({ identity, llm, registry });
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}${config.basePath}`;
  return { base, app, registry };
}
export function onShutdown(fn) { closers.push(fn); }
export async function shutdown() {
  if (app) await app.close();
  for (const f of closers) await f();
  closers = [];
  await db.close();
}

function rawHttp(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); const hd = new Headers(); for (const [k, v] of Object.entries(res.headers)) { if (Array.isArray(v)) v.forEach((x) => hd.append(k, x)); else hd.set(k, v); } resolve({ status: res.statusCode, headers: hd, arrayBuffer: async () => buf }); });
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}

/** Một "trình duyệt" đã đăng nhập (hoặc không): phiên Osin tạo qua luồng exchange của IdentityVerifier giả; gửi kèm header Sec-Fetch/Referer/X-Osin-Ui như trình duyệt thật. */
export class Client {
  constructor(name = 'khach', { userId, families = [], token, login = true, meta = true } = {}) {
    this.name = name; this.userId = userId || 'u-' + name; this.meta = meta; this.ui = null;
    this.ready = (async () => {
      if (token !== undefined) { this.token = token; return; }
      if (!login) { this.token = ''; return; }
      const code = identity.register({ userId: this.userId, displayName: name, families });
      const u = await identity.exchange(code, null);
      this.sessionId9id = u.sessionId9id;
      this.token = await createSession(u);
    })();
  }
  async uiToken() {
    if (this.ui || !this.token) return this.ui;
    const r = await this.req('GET', '/api/ui-token', undefined, { noUi: true });
    if (r.status === 200) this.ui = r.json.token;
    return this.ui;
  }
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin, cookie, noMeta = false, noUi = false, meta = {}, http: opts_http = false } = {}) {
    await this.ready;
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = 'osin';
    const ck = cookie !== undefined ? cookie : (this.token ? `${sessionCookieName()}=${this.token}` : '');
    if (ck) h.cookie = ck;
    if (origin) h.origin = origin;
    if (this.meta && !noMeta) { h['sec-fetch-site'] = 'same-origin'; h['sec-fetch-mode'] = 'cors'; h.referer = base + '/'; Object.assign(h, meta); }
    if (!noUi && cookie === undefined && this.token && path !== '/api/ui-token') { const t = await this.uiToken(); if (t) h['x-osin-ui'] = t; }
    // fetch (undici) tự ghi đè Sec-Fetch-Mode: muốn thử giá trị khác phải đi bằng node:http
    const r = opts_http ? await rawHttp(method, base + path, h, body === undefined ? undefined : JSON.stringify(body)) : await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* không phải JSON */ } }
    return { status: r.status, json, buf, headers: r.headers };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}, o) { return this.req('POST', p, b, o); }
  del(p, o) { return this.req('DELETE', p, undefined, o); }
  async consent() { return this.post('/api/consent'); }
  async chat(text, clientId) { return this.post('/api/chat', clientId ? { text, clientId } : { text }); }
}
export const ok = async (p, label = '') => {
  const r = await p;
  if (r.status >= 300) throw new Error(`${label} -> ${r.status} ${r.buf.toString().slice(0, 300)}`);
  return r.json;
};
export const FAM = 'family__';
export const sessionId9idOf = (c) => c.sessionId9id;
