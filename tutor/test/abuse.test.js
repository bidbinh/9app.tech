// Nhập xấu, XSS, giới hạn kích thước/tần suất, cấu hình production, migration đồng thời
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, newTutor, addStudent, day, config, db, base } from './helper.js';
import { productionProblems } from '../src/config.js';

before(async () => { await boot(); });
after(shutdown);

test('XSS và ký tự lạ trong tên, ghi chú: được lưu như văn bản, ký tự điều khiển bị bỏ', async () => {
  const c = await newTutor('<img src=x onerror=alert(1)>');
  const s = await addStudent(c, { name: '<script>alert(1)</script>‮\u0000Minh', note: 'a\u0007b\r\n\r\n\r\n\r\nc' });
  assert.equal(s.name, '<script>alert(1)</script> Minh');
  const d = (await ok(c.get('/api/students/' + s.id))).student;
  assert.equal(d.note, 'a b\n\nc');
  const me = (await ok(c.get('/api/me'))).me;
  assert.equal(me.name, '<img src=x onerror=alert(1)>');
  // API luôn trả JSON, không bao giờ HTML
  const r = await c.get('/api/students');
  assert.match(r.headers.get('content-type'), /application\/json/); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('JSON hỏng, sai kiểu, quá lớn: 400/413 gọn, máy chủ không sập', async () => {
  const c = await newTutor();
  const h = { 'content-type': 'application/json', 'x-requested-with': '9tutor', cookie: c.cookie };
  assert.equal((await fetch(base + '/api/students', { method: 'POST', headers: h, body: '{hỏng' })).status, 400);
  assert.equal((await fetch(base + '/api/students', { method: 'POST', headers: h, body: '[1,2]' })).status, 400);
  assert.equal((await fetch(base + '/api/students', { method: 'POST', headers: h, body: 'null' })).status, 400);
  assert.equal((await fetch(base + '/api/students', { method: 'POST', headers: h, body: JSON.stringify({ name: 'x'.repeat(100_000) }) })).status, 413);
  for (const bad of [{ name: 123 }, { name: ['a'] }, { name: { a: 1 } }, { name: null }, { name: 'A', feeAmount: {} }, { name: 'A', feeModel: [] }, { name: 'A', grade: 5 }]) {
    assert.equal((await c.post('/api/students', bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await c.get('/api/me')).status, 200);
});

test('phương thức lạ và đường dẫn lạ: 404/405, không 500', async () => {
  const c = await newTutor();
  assert.equal((await c.req('PUT', '/api/students', {})).status, 405);
  assert.equal((await c.req('PATCH', '/api/me', {})).status, 405);
  assert.equal((await c.get('/api/khong-co')).status, 404);
  assert.equal((await c.get('/%E0%A4%A')).status, 400);
  assert.equal((await fetch(base + '/../../etc/passwd')).status, 404);
  assert.equal((await fetch(base + '/..%2f..%2fpackage.json')).status, 404);
  assert.equal((await fetch(base + '/src/server.js')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
});

test('giới hạn số học sinh đang dạy (theo cấu hình) và số lịch lặp', async () => {
  const c = await newTutor();
  const old = config.maxActiveStudents; config.maxActiveStudents = 3;
  try {
    for (let i = 0; i < 3; i++) await addStudent(c, { name: 'HS' + i });
    assert.equal((await c.post('/api/students', { name: 'Quá' })).status, 429);
    const list = (await ok(c.get('/api/students'))).students;
    await ok(c.post(`/api/students/${list[0].id}/archive`, { active: false }));
    assert.equal((await c.post('/api/students', { name: 'Vừa đủ' })).status, 200);
    assert.equal((await c.post(`/api/students/${list[0].id}/archive`, { active: true })).status, 429, 'khôi phục cũng bị chặn khi đầy');
  } finally { config.maxActiveStudents = old; }
  const oldS = config.maxSlots; config.maxSlots = 2;
  try {
    const s = (await ok(c.get('/api/students'))).students.find((x) => x.active);
    const wd = (await import('./helper.js')).wd;
    await ok(c.post(`/api/students/${s.id}/slots`, { weekday: 1, startMin: 480, durationMin: 60 }));
    await ok(c.post(`/api/students/${s.id}/slots`, { weekday: 2, startMin: 480, durationMin: 60 }));
    assert.equal((await c.post(`/api/students/${s.id}/slots`, { weekday: 3, startMin: 480, durationMin: 60 })).status, 429);
    assert.ok(wd);
  } finally { config.maxSlots = oldS; }
});

test('giới hạn số buổi và khoản thu lưu trữ', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const oldL = config.maxLessons; const oldG = config.maxLedger;
  config.maxLessons = 2; config.maxLedger = 2;
  try {
    await ok(c.post('/api/lessons', { studentId: s.id, day: day(1), startMin: 480, durationMin: 60 }));
    await ok(c.post('/api/lessons', { studentId: s.id, day: day(2), startMin: 480, durationMin: 60 }));
    assert.equal((await c.post('/api/lessons', { studentId: s.id, day: day(3), startMin: 480, durationMin: 60 })).status, 429);
    await ok(c.post(`/api/students/${s.id}/payments`, { amount: 1000 }));
    await ok(c.post(`/api/students/${s.id}/charges`, { kind: 'khac', amount: 1000, note: 'a' }));
    assert.equal((await c.post(`/api/students/${s.id}/payments`, { amount: 1000 })).status, 429);
  } finally { config.maxLessons = oldL; config.maxLedger = oldG; }
});

test('giới hạn tần suất: theo IP, theo tuyến, theo phiên', async () => {
  const c = await newTutor();
  const s = await addStudent(c);
  const f0 = config.routeLimitFactor; const g0 = config.rateLimitPerMin; const s0 = config.sessionLimitPerMin;
  try {
    // theo tuyến: /api/recover tối đa 30 lần mỗi phút mỗi IP
    config.routeLimitFactor = 1;
    const statuses = [];
    for (let i = 0; i < 34; i++) statuses.push((await new Client().post('/api/recover', { code: 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' })).status);
    assert.ok(statuses.slice(0, 5).every((x) => x === 404)); assert.ok(statuses.includes(429), 'có 429: ' + statuses.join());
    // báo cáo công khai: 90 lần mỗi phút mỗi IP
    let pub429 = 0;
    for (let i = 0; i < 100; i++) if ((await new Client().get('/api/r/' + 'A'.repeat(22))).status === 429) pub429++;
    assert.ok(pub429 >= 8, 'public bị giới hạn: ' + pub429);
    // theo phiên: ghi quá nhiều
    config.sessionLimitPerMin = 5;
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await c.post(`/api/students/${s.id}`, { note: 'n' + i })).status);
    assert.ok(codes.slice(0, 4).every((x) => x === 200) && codes.includes(429), codes.join());
    config.sessionLimitPerMin = s0;
    // theo IP chung
    config.rateLimitPerMin = 3;
    const g = []; for (let i = 0; i < 6; i++) g.push((await c.get('/healthz')).status);
    assert.ok(g.includes(429), g.join());
  } finally { config.routeLimitFactor = f0; config.rateLimitPerMin = g0; config.sessionLimitPerMin = s0; }
});

test('production thiếu DATABASE_URL hoặc dùng chuỗi mặc định thì báo lỗi', () => {
  assert.equal(productionProblems({ production: false, databaseUrlFromEnv: false }).length, 0);
  assert.equal(productionProblems({ production: true, databaseUrlFromEnv: false, databaseUrl: 'postgres://postgres:ship@localhost:5440/tutor' }).length, 1);
  assert.equal(productionProblems({ production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://postgres:ship@localhost:5440/tutor' }).length, 1);
  assert.equal(productionProblems({ production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://tutor:x@9ship-db:5432/tutor' }).length, 0);
});

test('hai bản khởi động đồng thời cùng chạy migration không đụng nhau', async () => {
  await Promise.all([db.migrate(), db.migrate(), db.migrate()]);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM schema_migrations`))[0].n, 1);
});

test('lỗi ở kết nối nhàn rỗi của pool chỉ ghi log, không sập tiến trình', () => {
  const pool = db.getPool();
  assert.ok(pool.listenerCount('error') >= 1);
});

test('cookie: Secure khi chạy production', async () => {
  config.production = true;
  try {
    const r = await new Client().post('/api/start', { name: 'Prod', status: 'khac' });
    assert.match(r.setCookie.join(), /Secure/);
  } finally { config.production = false; }
});

test('tệp tĩnh: chỉ phục vụ thư mục public, có CSP chặt, trang chủ chứa khung', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/); assert.match(csp, /frame-ancestors 'none'/); assert.ok(!/unsafe-inline/.test(csp));
  const html = await r.text();
  assert.match(html, /<base href="\/tutor\/">/); assert.ok(!html.includes('__BASE__') && !html.includes('<!--META-->'));
  assert.equal((await fetch(base + '/style.css')).status, 200);
  assert.equal((await fetch(base + '/manifest.webmanifest')).status, 200);
  assert.equal((await fetch(base + '/icon.svg')).status, 200);
});
