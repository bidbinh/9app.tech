// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server 9family thật, nhiều "trình duyệt" độc lập.
// Tài khoản và gia đình nằm ở 9id: ở đây dùng 9id GIẢ trong bộ nhớ (test/fake-id.js). 9id THẬT được kiểm ở test/integration/.
import webpush from 'web-push';
import { createFakeId } from './fake-id.js';
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
export const idmod = await import('../src/id.js');

export let base = '';
export let fake = null;   // 9id giả của lần boot hiện tại
let app;
export async function boot({ cacheMs = 0, keepDb = false, legacy = false } = {}) {
  if (!keepDb) { await db.migrate(); await db.resetForTests(); } // keepDb: kiểm thử migration tự dựng CSDL

  clock.set(null);
  fake = createFakeId();
  config.idCacheMs = cacheMs; // kiểm thử đọc 9id mỗi yêu cầu (đệm 60 giây được kiểm riêng)
  config.legacySessions = !!legacy;
  config.idBreakMs = 0; // kiểm thử bật/tắt 9id giả liên tục; cầu dao được kiểm riêng ở test/id-auth.test.js
  idmod.setIdClient(fake.client);
  app = buildApp();
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}${config.basePath}`;
  return base;
}
export async function shutdown() {
  clock.set(null);
  idmod.setIdClient(null);
  if (app) await app.close();
  await db.close();
}

// Một "trình duyệt": có cookie riêng (nine_sid do 9id cấp)
export class Client {
  constructor(name = 'khach') { this.name = name; this.cookie = ''; this.extraCookie = ''; }
  loginAs(token) { this.cookie = token ? `nine_sid=${token}` : ''; return this; }
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = '9family';
    const ck = [this.cookie, this.extraCookie].filter(Boolean).join('; ');
    if (ck) h.cookie = ck;
    if (origin) h.origin = origin;
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie?.() || [];
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

// Tạo một người dùng 9id giả đã đăng nhập, trả { client, userId, token }
export function newUser(name = 'Khách') {
  const u = fake.signup(name);
  const client = new Client(name).loginAs(u.token);
  return { client, userId: u.userId, token: u.token, name };
}

// Dựng gia đình: names[0] là chủ (mẹ). Các tên sau là thành viên người lớn (opts.roles: { tên: 'quan_ly' | 'con' }).
// Mỗi người có tài khoản 9id giả riêng; gia đình được tạo ở 9id giả rồi mỗi người mở một lần để 9family đồng bộ.
// opts.relations: { tên: 'bo' }. Trả về { fid, clients, ids (memberId), userIds, tokens, by, owner, F, fake, sync, leave, ... }
export async function makeFamily(names = ['Mẹ', 'Bố', 'Bà nội'], opts = {}) {
  const users = names.map((n) => fake.signup(n));
  const clients = names.map((n, i) => new Client(n).loginAs(users[i].token));
  const fid = fake.createFamily(users[0].userId, opts.familyName || 'Nhà Cún');
  for (let i = 1; i < names.length; i++) fake.addMember(fid, users[i].userId, (opts.roles || {})[names[i]] || 'thanh_vien');
  const F = `/api/families/${fid}`;
  const ids = {};
  const userIds = Object.fromEntries(names.map((n, i) => [n, users[i].userId]));
  const tokens = Object.fromEntries(names.map((n, i) => [n, users[i].token]));
  for (let i = 0; i < names.length; i++) ids[names[i]] = (await ok(clients[i].get(F), 'mở gia đình ' + names[i])).me.id;
  const rels = opts.relations || {};
  for (let i = 0; i < names.length; i++) {
    const rel = rels[names[i]] || (i === 0 ? 'me' : 'nguoi_than');
    if (users[i] && (names[i].startsWith('con:') ? false : true)) await ok(clients[i].post(`${F}/members/${ids[names[i]]}`, { relation: rel }), 'quan hệ ' + names[i]).catch(() => {});
  }
  const fam = {
    fid, clients, ids, userIds, tokens, users, by: Object.fromEntries(names.map((n, i) => [n, clients[i]])), owner: clients[0], F, fake,
    // đọc lại 9id ngay (bỏ đệm) rồi làm mới bản sao
    async sync(who = names[0]) { return ok(fam.by[who].get(F), 'sync'); },
    // thành viên rời/bị mời ra ở 9id; chủ mở lại để 9family cập nhật bản sao
    async leave(name) { fake.removeMember(fid, userIds[name]); await fam.sync(); },
  };
  return fam;
}

// Thêm hồ sơ con: tạo ở 9id giả (nguồn đúng), rồi đặt phần mở rộng (trường, lớp, màu, ghi chú đưa đón) ở 9family.
export const addChild = async (fam, name = 'Bống', extra = {}) => {
  const { birthYear, linkedUserId, healthNote, ...ext } = extra;
  const k = fam.fake.addChild(fam.fid, { name, birthYear: birthYear ?? null, linkedUserId: linkedUserId || null, note: healthNote });
  const body = { school: 'Tiểu học Hoa Mai', grade: '3A', ...ext };
  return (await ok(fam.owner.post(`${fam.F}/children/${k.id}`, body), 'thêm con')).child;
};

// Giờ VN -> mili giây UTC. at('2026-10-05', '07:30')
export const at = (day, hhmm = '00:00') => vn.atMs(day, hhmm);
