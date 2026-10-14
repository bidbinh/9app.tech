// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server thật, nhiều "phiên" độc lập.
process.env.RATE_LIMIT_PER_MIN ??= '1000000';
process.env.ROUTE_LIMIT_FACTOR ??= '1000';
process.env.SESSION_LIMIT_PER_MIN ??= '1000000';
process.env.COMMUNITIES_PER_IP_HOUR ??= '1000000';
process.env.LISTINGS_PER_DAY ??= '1000';
process.env.MESSAGES_PER_HOUR ??= '1000';
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
  constructor(name = 'khach') { this.name = name; this.cookie = ''; this.nine = ''; }
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin, binary } = {}) {
    const h = { ...headers };
    if (body !== undefined && !binary) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = '9swap';
    const ck = [this.cookie, this.nine && 'nine_sid=' + this.nine].filter(Boolean).join('; ');
    if (ck) h.cookie = ck;
    if (origin) h.origin = origin;
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : (binary ? body : JSON.stringify(body)) });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('swsid=')) this.cookie = kv; }
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* không phải JSON */ } }
    return { status: r.status, json, buf, headers: r.headers, setCookie: sc };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}, o) { return this.req('POST', p, b, o); }
  del(p, o) { return this.req('DELETE', p, undefined, o); }
  // tải ảnh: thumb + main, header X-Thumb-Length
  upload(listingId, thumb, main, o = {}) {
    return this.req('POST', `/api/listings/${listingId}/photos`, Buffer.concat([thumb, main]), { binary: true, ...o, headers: { 'x-thumb-length': String(thumb.length), 'content-type': 'application/octet-stream', ...(o.headers || {}) } });
  }
}

export const ok = async (p, label = '') => {
  const r = await p;
  if (r.status >= 300) throw new Error(`${label} -> ${r.status} ${r.buf.toString().slice(0, 300)}`);
  return r.json;
};

// ---------- ảnh giả hợp lệ về cấu trúc (máy chủ chỉ đọc tiêu đề, không giải mã) ----------
export function fakeJpeg(w = 640, h = 480, padTo = 0) {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0); sof.writeUInt16BE(17, 2); sof[4] = 8; sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); sof[9] = 3;
  const head = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), sof]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0]);
  const tail = Buffer.from([0xff, 0xd9]);
  const body = Buffer.concat([head, sos]);
  const pad = Math.max(0, padTo - body.length - tail.length);
  return Buffer.concat([body, Buffer.alloc(pad, 0x11), tail]);
}
export function fakePng(w = 100, h = 100) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); ihdr.write('IHDR', 4, 'latin1'); ihdr.writeUInt32BE(w, 8); ihdr.writeUInt32BE(h, 12); ihdr[16] = 8; ihdr[17] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])]);
}
export function fakeWebp(w = 100, h = 100) {
  const chunk = Buffer.alloc(18);
  chunk.write('VP8X', 0, 'latin1'); chunk.writeUInt32LE(10, 4);
  chunk.writeUIntLE(w - 1, 12, 3); chunk.writeUIntLE(h - 1, 15, 3);
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunk]);
  const hdr = Buffer.alloc(8); hdr.write('RIFF', 0, 'latin1'); hdr.writeUInt32LE(body.length, 4);
  return Buffer.concat([hdr, body]);
}
export const THUMB = () => fakeJpeg(120, 90);

// Dựng cộng đồng với chủ + n thành viên (mỗi người một Client)
export async function makeCommunity(names = ['Chủ', 'An', 'Bình'], { kind = 'toa_nha' } = {}) {
  const clients = names.map((n) => new Client(n));
  const t = await ok(clients[0].post('/api/communities', { name: 'Tòa Sunrise', kind, myName: names[0], agree: true }), 'tạo cộng đồng');
  const ids = { [names[0]]: t.memberId };
  for (let i = 1; i < names.length; i++) {
    const j = await ok(clients[i].post('/api/join/' + t.community.inviteCode, { name: names[i], agree: true }), 'vào cộng đồng');
    ids[names[i]] = j.memberId;
  }
  return { cid: t.community.id, code: t.community.inviteCode, clients, ids, by: Object.fromEntries(names.map((n, i) => [n, clients[i]])) };
}

export const LISTING = (o = {}) => ({ kind: 'tang', title: 'Nồi chiên không dầu', description: 'Dùng 1 năm, còn tốt.', category: 'gia_dung', condition: 'tot', location: 'Tòa A, tầng 5', pickupTime: 'Sau 18h', ...o });
export async function makeListing(community, who = 'Chủ', o = {}) {
  const r = await ok(community.by[who].post(`/api/c/${community.cid}/listings`, LISTING(o)), 'đăng tin');
  return r.id;
}
// Người `who` quan tâm tin, trả về threadId
export async function interest(community, who, lid, body = 'Còn không bạn?') {
  return (await ok(community.by[who].post(`/api/listings/${lid}/threads`, { body }), 'quan tâm')).threadId;
}
