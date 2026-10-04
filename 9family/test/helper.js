// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server thật, nhiều "phiên" độc lập.
import webpush from 'web-push';
process.env.RATE_LIMIT_PER_MIN ??= '1000000';
process.env.ROUTE_LIMIT_FACTOR ??= '1000';
process.env.SESSION_LIMIT_PER_MIN ??= '1000000';
process.env.FAMILY_PUSH_ALLOW_ANY = '1';
process.env.FAMILY_AI_KEY ??= 'khoa-ai-thu';
process.env.FAMILY_AI_RETRY_MS = '5';
if (!process.env.VAPID_PUBLIC_KEY) { const k = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = k.publicKey; process.env.VAPID_PRIVATE_KEY = k.privateKey; }
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

export const { config } = await import('../src/config.js');
export const db = await import('../src/db.js');
export const { buildApp } = await import('../src/server.js');
export const { clock } = await import('../src/clock.js');
export const scheduler = await import('../src/scheduler.js');
export const vn = await import('../src/vn.js');

export let base = '';
let app;
export async function boot() {
  await db.migrate();
  await db.resetForTests();
  clock.set(null);
  app = buildApp();
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}${config.basePath}`;
  return base;
}
export async function shutdown() {
  clock.set(null);
  if (app) await app.close();
  await db.close();
}

// Một "trình duyệt": có cookie riêng
export class Client {
  constructor(name = 'khach') { this.name = name; this.cookie = ''; }
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = '9family';
    if (this.cookie) h.cookie = this.cookie;
    if (origin) h.origin = origin;
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('fsid=')) this.cookie = kv; }
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* không phải JSON */ } }
    return { status: r.status, json, buf, text: buf.toString('utf8'), headers: r.headers, setCookie: sc };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}, o) { return this.req('POST', p, b, o); }
  del(p, o) { return this.req('DELETE', p, undefined, o); }
}

export const ok = async (p, label = '') => {
  const r = await p;
  if (r.status >= 300) throw new Error(`${label} -> ${r.status} ${r.buf.toString().slice(0, 300)}`);
  return r.json;
};

const codeOf = (inv) => inv.code;

// Dựng gia đình: names[0] là chủ (mẹ). Các tên sau được mời bằng link và vào bằng Client riêng.
// opts.roles: { tên: 'quan_ly' }, opts.relations: { tên: 'bo' }
export async function makeFamily(names = ['Mẹ', 'Bố', 'Bà nội'], opts = {}) {
  const clients = names.map((n) => new Client(n));
  const f = await ok(clients[0].post('/api/families', { name: 'Nhà Cún', myName: names[0], relation: (opts.relations || {})[names[0]] || 'me' }), 'tạo gia đình');
  const fid = f.family.id;
  const ids = { [names[0]]: f.memberId };
  for (let i = 1; i < names.length; i++) {
    const n = names[i];
    const r = await ok(clients[0].post(`/api/families/${fid}/members`, { name: n, relation: (opts.relations || {})[n] || 'nguoi_than', role: (opts.roles || {})[n] }), 'mời ' + n);
    const j = await ok(clients[i].post(`/api/invites/${codeOf(r.invite)}/accept`, {}), 'vào ' + n);
    ids[n] = j.memberId;
  }
  return { fid, clients, ids, by: Object.fromEntries(names.map((n, i) => [n, clients[i]])), owner: clients[0], F: `/api/families/${fid}` };
}

export const addChild = async (fam, name = 'Bống', extra = {}) => (await ok(fam.owner.post(`${fam.F}/children`, { name, school: 'Tiểu học Hoa Mai', grade: '3A', ...extra }), 'thêm con')).child;

// Giờ VN -> mili giây UTC. at('2026-10-05', '07:30')
export const at = (day, hhmm = '00:00') => vn.atMs(day, hhmm);
