// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng), server thật, nhiều "trình duyệt" độc lập.
process.env.RATE_LIMIT_PER_MIN ??= '1000000';
process.env.ROUTE_LIMIT_FACTOR ??= '1000';
process.env.SESSION_LIMIT_PER_MIN ??= '1000000';
process.env.TUTORS_PER_IP_HOUR ??= '1000000';
process.env.RECOVER_PER_IP_HOUR ??= '1000000';
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

export const { config } = await import('../src/config.js');
export const db = await import('../src/db.js');
export const { buildApp } = await import('../src/server.js');
export const { resetHourly } = await import('../src/routes/account.js');
export const util = await import('../src/util.js');

export let base = '';
let app;
export async function boot() {
  // PostgreSQL nhúng vừa khởi động đôi khi ngắt kết nối đầu tiên: thử lại vài lần
  for (let i = 0; ; i++) {
    try { await db.migrate(); await db.resetForTests(); break; } catch (e) { if (i >= 4 || !/ECONNRESET|ECONNREFUSED|terminating/.test(String(e.code || e.message))) throw e; await new Promise((r) => setTimeout(r, 400)); await db.close(); }
  }
  resetHourly();
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
  async req(method, path, body, { csrf = true, headers = {}, raw = false, origin, cookie } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = '9tutor';
    const ck = cookie !== undefined ? cookie : this.cookie;
    if (ck) h.cookie = ck;
    if (origin) h.origin = origin;
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('tsid=')) this.cookie = kv.endsWith('=') ? '' : kv; }
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

// Tạo gia sư mới (một Client) và trả về { c, recoveryCode }
export async function newTutor(name = 'Cô Lan', status = 'sinh_vien') {
  const c = new Client(name);
  const r = await ok(c.post('/api/start', { name, status }), 'tạo gia sư');
  c.recovery = r.recoveryCode;
  return c;
}
// Học sinh mới
export async function addStudent(c, o = {}) {
  const r = await ok(c.post('/api/students', { name: 'Minh', grade: 'Lớp 9', subject: 'Toán', parentName: 'Hoa', parentPhone: '0912345678', feeModel: 'buoi', feeAmount: 200000, ...o }), 'thêm học sinh');
  return r.student;
}
// Ngày tương đối so với hôm nay (giờ VN)
export const day = (n = 0) => util.addDays(util.todayVN(), n);
// Thứ ISO của ngày
export const wd = (d) => util.isoWeekday(d);
