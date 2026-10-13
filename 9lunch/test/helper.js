// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server thật, nhiều "phiên" độc lập.
process.env.RATE_LIMIT_PER_MIN ??= '1000000';
process.env.ROUTE_LIMIT_FACTOR ??= '1000';
process.env.SESSION_LIMIT_PER_MIN ??= '1000000';
process.env.TEAMS_PER_IP_HOUR ??= '1000000';
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

export const { config } = await import('../src/config.js');
export const db = await import('../src/db.js');
export const { buildApp } = await import('../src/server.js');

export let base = '';
let app;
export async function boot() {
  await db.migrate();
  await db.resetForTests();
  app = buildApp();
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}${config.basePath}`;
  return base;
}
export async function shutdown() {
  if (app) await app.close();
  await db.close();
}

// Một "trình duyệt": có cookie riêng
export class Client {
  constructor(name = 'khach') { this.name = name; this.cookie = ''; }
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = '9lunch';
    if (this.cookie) h.cookie = this.cookie;
    if (origin) h.origin = origin;
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('lsid=')) this.cookie = kv; }
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* không phải JSON */ } }
    return { status: r.status, json, buf, headers: r.headers, setCookie: sc };
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

export const BANK = { bin: '970436', account: '0011004012345', holder: 'NGUYEN VAN A' };
export const BANK2 = { bin: '970415', account: '111222333444', holder: 'TRAN THI B' };
// mỗi người trong nhóm thử có tài khoản riêng, nhận diện được qua số tài khoản
export const bankFor = (i) => ({ bin: i % 2 ? '970415' : '970436', account: String(9000000000 + i * 1111), holder: 'NGUOI ' + i });

// Dựng nhóm với chủ nhóm + n thành viên (mỗi người một Client)
export async function makeTeam(names = ['Chủ', 'An', 'Bình'], { bankFor: bankFor_ = ['Chủ'] } = {}) {
  const clients = names.map((n) => new Client(n));
  const t = await ok(clients[0].post('/api/teams', { name: 'Team Trưa', myName: names[0], bank: bankFor_.includes(names[0]) ? bankFor(0) : undefined }), 'tạo nhóm');
  const ids = { [names[0]]: t.memberId };
  for (let i = 1; i < names.length; i++) {
    const j = await ok(clients[i].post('/api/join/' + t.team.inviteCode, { name: names[i] }), 'vào nhóm');
    ids[names[i]] = j.memberId;
    if (bankFor_.includes(names[i])) await ok(clients[i].post(`/api/teams/${t.team.id}/me`, { bank: bankFor(i) }), 'lưu ngân hàng');
  }
  return { teamId: t.team.id, code: t.team.inviteCode, clients, ids, by: Object.fromEntries(names.map((n, i) => [n, clients[i]])) };
}

// Đưa một bữa đến bước thu tiền. orders: { tên: [[tên món, giá, sl], ...] }
export async function mealToPayment(team, { payer = 'Chủ', orders, fees, splitMode, venue = 'Cơm Tấm Ba Ghiền' } = {}) {
  const owner = team.clients[0];
  const m = await ok(owner.post(`/api/teams/${team.teamId}/meals`, {}), 'tạo bữa');
  const mealId = m.mealId;
  await ok(owner.post(`/api/meals/${mealId}/proposals`, { name: venue }), 'đề xuất');
  await ok(owner.post(`/api/meals/${mealId}/status`, { to: 'dat_mon' }), 'chốt quán');
  for (const [name, list] of Object.entries(orders)) {
    for (const [dish, price, qty] of list) await ok(team.by[name].post(`/api/meals/${mealId}/items`, { name: dish, price, qty }), 'gọi món');
  }
  const settings = { payerId: team.ids[payer] };
  if (fees) settings.fees = fees;
  if (splitMode) settings.splitMode = splitMode;
  await ok(owner.post(`/api/meals/${mealId}/settings`, settings), 'cài đặt');
  await ok(owner.post(`/api/meals/${mealId}/status`, { to: 'thanh_toan' }), 'sang thu tiền');
  return mealId;
}
