// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server thật, nhiều "trình duyệt" độc lập.
process.env.RATE_LIMIT_PER_MIN ??= '1000000';
process.env.ROUTE_LIMIT_FACTOR ??= '1000';
process.env.SESSION_LIMIT_PER_MIN ??= '1000000';
process.env.OTP_PROVIDER = 'mock';
process.env.OTP_RESEND_SEC ??= '0';
process.env.OTP_DAILY_PER_PHONE ??= '1000';
process.env.OTP_DAILY_PER_IP ??= '100000';
process.env.VERIFY_PER_IP_HOUR ??= '1000000';
process.env.INVITES_PER_USER_DAY ??= '100000';
process.env.POW_BITS ??= '6';
process.env.NEW_ACCOUNT_INVITES_PER_DAY ??= '100000';
process.env.INTERNAL_KEYS ??= 'family:test-secret-family-0123456789abcdef-xyz,fin:test-secret-fin-0123456789abcdef-xyzxyz,strict:test-secret-strict-0123456789abcdef-xyz,osin:test-secret-osin-0123456789abcdef-xyzxy';
process.env.OAUTH_CLIENTS ??= 'osin=https://osin.9app.tech/auth/callback';
process.env.INTERNAL_DELEGATE_APPS ??= 'family';
process.env.INTERNAL_IMPORT_APPS ??= 'family';
process.env.INTERNAL_LAST4_APPS ??= 'family';
process.env.INTERNAL_OTP_APPS ??= 'family';
process.env.CONSOLE_API_KEY_ID ??= 'hub';
process.env.CONSOLE_API_SECRET ??= 'console-secret-0123456789abcdef-test-xx';
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

import crypto from 'node:crypto';
export const { config } = await import('../src/config.js');
export const db = await import('../src/db.js');
export const { buildApp, maintenance } = await import('../src/server.js');
export const provider = await import('../src/otp-provider.js');
export const { signInternal } = await import('../src/internal.js');
export const { sign: signConsole } = await import('../src/console-api.js');
export const pow = await import('../src/pow.js');
export const util = await import('../src/util.js');
export const { query } = db;

export let base = '';
export let origin = '';
let app;
export async function boot() {
  await db.migrate();
  await db.resetForTests();
  provider.resetSent();
  app = buildApp();
  const port = await app.listen(0);
  origin = `http://127.0.0.1:${port}`;
  base = `${origin}${config.basePath}`;
  return base;
}
export async function shutdown() {
  if (app) await app.close();
  await db.close();
}

let phoneSeq = 10_000_000;
// số di động hợp lệ, duy nhất trong tiến trình
export const newPhone = () => '09' + String(phoneSeq++).padStart(8, '0');

// Một "trình duyệt": có cookie riêng
export class Client {
  constructor(name = 'khach', ip) { this.name = name; this.cookie = ''; this.dev = ''; this.ip = ip; this.user = null; this.phone = null; }
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin: org } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = '9id';
    const ck = [this.cookie, this.dev].filter(Boolean).join('; ');
    if (ck) h.cookie = ck;
    if (this.ip) h['x-forwarded-for'] = this.ip;
    if (org) h.origin = org;
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) {
      const [kv, ...attrs] = c.split(';');
      if (kv.startsWith('nine_sid=')) this.cookie = /Max-Age=0/i.test(attrs.join(';')) ? '' : kv;
      if (kv.startsWith('nine_dev=')) this.dev = /Max-Age=0/i.test(attrs.join(';')) ? '' : kv;
    }
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

export const PASS = 'MatKhau-Tot-1';

// Giải proof-of-work do máy chủ cấp (độ khó thấp khi thử nghiệm)
export async function powFor(client) {
  const ch = await ok(client.get('/api/otp/challenge'), 'thử thách PoW');
  return { challenge: ch.challenge, counter: pow.solve(ch.challenge, ch.bits) };
}
// Xin OTP (kèm PoW). Trả phản hồi thô.
export async function requestOtpRaw(client, phone, extra = {}) {
  const p = await powFor(client);
  return client.post('/api/otp/request', { phone, pow: p, ...extra });
}
// Xác minh số bằng OTP mock, trả { ticket, accountExists, phone }
export async function getTicket(client, phone, purpose = 'register') {
  const e164 = util.normalizePhone(phone);
  await ok(requestOtpRaw(client, phone, { purpose }), 'xin OTP');
  const code = provider.lastOtp(e164);
  const v = await ok(client.post('/api/otp/verify', { phone, code }), 'xác minh OTP');
  return { ...v, phone };
}

// Đăng ký đầy đủ một người dùng mới
export async function signup(name = 'Người Dùng', { phone = newPhone(), password = PASS, ip } = {}) {
  const c = new Client(name, ip);
  const { ticket } = await getTicket(c, phone);
  const r = await ok(c.post('/api/register', { ticket, phone, name, password }), 'đăng ký');
  c.user = r.user; c.phone = phone; c.password = password;
  return c;
}

// Gọi API nội bộ có chữ ký
export async function internal(kid, method, path, body, { ts, nonce, secret, headers = {}, token } = {}) {
  const key = config.internalKeys.get(kid) || secret;
  const t = ts ?? String(Math.floor(Date.now() / 1000));
  const n = nonce ?? crypto.randomBytes(12).toString('hex');
  const pathq = config.basePath + path;
  const raw = body === undefined ? '' : JSON.stringify(body);
  const sig = signInternal(secret ?? key, t, n, method, pathq, raw);
  const h = { 'x-9id-key': kid, 'x-9id-ts': t, 'x-9id-nonce': n, 'x-9id-sig': sig, ...headers };
  if (token) h['x-9id-token'] = token;
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(origin + pathq, { method, headers: h, body: body === undefined ? undefined : raw });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers, nonce: n, ts: t };
}

export const tokenOf = (client) => client.cookie.split('=')[1];

// Dựng gia đình: chủ + (tùy chọn) vài người lớn đã vào bằng lời mời
// Mặc định tắt bước duyệt cho các kịch bản cũ; makeFamilyStrict giữ mặc định (bật duyệt)
export async function makeFamily(owner, name = 'Nhà Cún') {
  const r = await ok(owner.post('/api/families', { name }), 'tạo gia đình');
  await ok(owner.post(`/api/families/${r.family.id}/settings`, { requireApproval: false }), 'tắt duyệt');
  return r.family.id;
}
export async function makeFamilyStrict(owner, name = 'Nhà Cún') {
  const r = await ok(owner.post('/api/families', { name }), 'tạo gia đình');
  return r.family.id;
}
// người được mời bấm chấp nhận, chủ duyệt tất cả lời mời đang chờ duyệt
export async function acceptAndApprove(owner, fid, guest) {
  const inv = (await ok(guest.get('/api/invitations'))).invitations[0];
  await ok(guest.post(`/api/invitations/${inv.id}/accept`));
  const d = await ok(owner.get(`/api/families/${fid}`));
  for (const i of d.invitations.filter((x) => x.awaiting)) await ok(owner.post(`/api/families/${fid}/invites/${i.id}/approve`));
}
export async function inviteAndAccept(owner, fid, guest, role = 'thanh_vien') {
  await ok(owner.post(`/api/families/${fid}/invites`, { phone: guest.phone, role }), 'mời');
  const inv = await ok(guest.get('/api/invitations'), 'lời mời');
  const i = inv.invitations[0];
  await ok(guest.post(`/api/invitations/${i.id}/accept`), 'chấp nhận');
}
