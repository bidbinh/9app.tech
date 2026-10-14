// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server thật, nhiều "trình duyệt" độc lập.
process.env.RATE_LIMIT_PER_MIN ??= '1000000';
process.env.ROUTE_LIMIT_FACTOR ??= '1000';
process.env.SESSION_LIMIT_PER_MIN ??= '1000000';
// giới hạn đăng tin rộng cho kiểm thử thường; test/limits.test.js đặt lại giá trị thật để kiểm tra
process.env.JOBS_PER_SESSION_DAY ??= '50';
process.env.JOBS_PER_NEW_SESSION_DAY ??= '50';
process.env.JOBS_PER_IP_DAY ??= '50';
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

export const { config } = await import('../src/config.js');
export const db = await import('../src/db.js');
export const { buildApp, sweep } = await import('../src/server.js');

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

let ipSeq = 10;
export const freshIp = () => `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

// Một "trình duyệt": có cookie và địa chỉ IP riêng
export class Client {
  constructor(name = 'khach', ip = freshIp()) { this.name = name; this.cookie = ''; this.nine = ''; this.ip = ip; }
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin, rawBody } = {}) {
    const h = { 'x-forwarded-for': this.ip, ...headers };
    if (body !== undefined || rawBody !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = '9hire';
    const ck = [this.cookie, this.nine && 'nine_sid=' + this.nine].filter(Boolean).join('; ');
    if (ck) h.cookie = ck;
    if (origin) h.origin = origin;
    const r = await fetch(base + path, { method, headers: h, body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body)) });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('hsid=')) this.cookie = kv.endsWith('=') ? '' : kv; }
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* không phải JSON */ } }
    return { status: r.status, json, buf, headers: r.headers, setCookie: sc, text: buf.toString('utf8') };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}, o) { return this.req('POST', p, b, o); }
  put(p, b = {}, o) { return this.req('PUT', p, b, o); }
  del(p, o) { return this.req('DELETE', p, undefined, o); }
}

export const ok = async (p, label = '') => {
  const r = await p;
  if (r.status >= 300) throw new Error(`${label} -> ${r.status} ${r.buf.toString().slice(0, 300)}`);
  return r.json;
};

let n = 0;
// tin hợp lệ mẫu; mỗi lần gọi khác nội dung để không dính chống trùng
export const jobBody = (over = {}) => ({
  title: 'Phục vụ quán cà phê ' + (++n),
  company: 'Quán Cà Phê Gió',
  kind: 'ban_tg', category: 'phuc_vu',
  description: 'Phục vụ bàn, pha chế đơn giản, dọn dẹp quầy. Được đào tạo tại chỗ, có cơm ca. Mã tin nội bộ ' + n + '.',
  requirements: 'Nhanh nhẹn, trung thực, từ 18 tuổi.',
  payType: 'gio', payMin: 25000, payMax: 30000,
  shifts: ['sang', 'chieu'], shiftNote: 'Ca 7h-12h hoặc 12h-17h',
  city: 'hcm', district: 'Quận 1', address: '12 Lê Lợi, Quận 1',
  contactName: 'Chị Lan', contactPhone: '09' + String(20000000 + n), // mỗi tin một số (số của tin bị gỡ sẽ bị chặn đăng lại)
  startNow: true, slots: 2, days: 14,
  ...over,
});

// nhà tuyển dụng mới (một Client riêng)
export async function makeEmployer(name = 'Quán Cà Phê Gió') {
  const c = new Client('nhatd-' + name);
  const r = await ok(c.post('/api/employer', { name }), 'tạo nhà tuyển dụng');
  c.employerId = r.employer.id; c.recoveryCode = r.recoveryCode;
  return c;
}
// đăng một tin; trả { c, job }
export async function postJob(c, over = {}) {
  const r = await ok(c.post('/api/employer/jobs', jobBody(over)), 'đăng tin');
  return r.job;
}
