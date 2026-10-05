// Tài khoản ẩn danh, phiên, khôi phục bằng mã, ghép thiết bị, CSRF, xóa tài khoản
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, newTutor, addStudent, config, db, resetHourly, base } from './helper.js';
import { sha256hex } from '../src/util.js';

before(async () => { await boot(); });
after(shutdown);

test('tạo tài khoản: cần tên và tình trạng; cookie HttpOnly; mã khôi phục chỉ hiện một lần và CSDL chỉ lưu băm', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/start', { name: '', status: 'sinh_vien' })).status, 400);
  assert.equal((await c.post('/api/start', { name: 'Lan' })).status, 400, 'bắt buộc tự khai tình trạng');
  assert.equal((await c.post('/api/start', { name: 'Lan', status: 'chua_khai' })).status, 400);
  assert.equal((await c.post('/api/start', { name: 'Lan', status: 'tuy_y' })).status, 400);
  const r = await c.post('/api/start', { name: 'Cô Lan', status: 'sinh_vien' });
  assert.equal(r.status, 200);
  assert.match(r.json.recoveryCode, /^([A-HJ-NP-Z2-9]{5}-){4}[A-HJ-NP-Z2-9]{5}$/);
  const sc = r.setCookie.join(';');
  assert.match(sc, /tsid=/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Path=\/tutor\//); assert.match(sc, /Max-Age=7776000/);
  const me = await ok(c.get('/api/me'));
  assert.equal(me.me.name, 'Cô Lan'); assert.equal(me.me.status, 'sinh_vien'); assert.equal(me.me.hasRecovery, true);
  assert.ok(!JSON.stringify(me).includes(r.json.recoveryCode));
  // CSDL: không có token thô, không có mã khôi phục thô
  const token = c.cookie.split('=')[1];
  const dump = JSON.stringify(await db.query('SELECT * FROM sessions')) + JSON.stringify(await db.query('SELECT * FROM tutors'));
  assert.ok(!dump.includes(token)); assert.ok(!dump.includes(r.json.recoveryCode.replace(/-/g, '')));
  assert.ok(dump.includes(sha256hex(token)));
});

test('chưa đăng nhập: mọi API riêng trả 401; cookie rác không có tác dụng', async () => {
  const c = new Client();
  for (const p of ['/api/me', '/api/students', '/api/today', '/api/week', '/api/devices', '/api/profile', '/api/export', '/api/reports/month']) assert.equal((await c.get(p)).status, 401, p);
  assert.equal((await c.post('/api/students', { name: 'A' })).status, 401);
  assert.equal((await c.get('/api/me', { cookie: 'tsid=' + 'A'.repeat(43) })).status, 401);
  assert.equal((await c.get('/api/me', { cookie: 'tsid=abc' })).status, 401);
  assert.equal((await c.get('/api/me', { cookie: "tsid=' OR 1=1 --" })).status, 401);
});

test('CSRF: thiếu header X-Requested-With hoặc sai Origin thì từ chối', async () => {
  const c = await newTutor();
  assert.equal((await c.post('/api/me', { name: 'X' }, { csrf: false })).status, 403);
  assert.equal((await c.post('/api/me', { name: 'X' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.post('/api/me', { name: 'Y' }, { origin: new URL(base).origin })).status, 200);
  assert.equal((await c.post('/api/me', { name: 'Y' }, { headers: { 'x-requested-with': 'XMLHttpRequest' }, csrf: false })).status, 403);
});

test('khôi phục bằng mã: thiết bị mới vào đúng tài khoản; mã nhập chữ thường, dấu cách đều được; mã sai 404', async () => {
  const a = await newTutor('Thầy Nam', 'giao_vien_khac');
  await addStudent(a, { name: 'Bé An' });
  const b = new Client();
  assert.equal((await b.post('/api/recover', { code: 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' })).status, 404);
  assert.equal((await b.post('/api/recover', { code: 'ngắn' })).status, 404);
  assert.equal((await b.post('/api/recover', {})).status, 404);
  const r = await b.post('/api/recover', { code: a.recovery.toLowerCase().replace(/-/g, ' ') });
  assert.equal(r.status, 200);
  assert.equal((await ok(b.get('/api/students'))).students[0].name, 'Bé An');
  const devices = (await ok(a.get('/api/devices'))).devices;
  assert.equal(devices.length, 2);
  assert.equal(devices.filter((d) => d.current).length, 1);
});

test('đổi mã khôi phục: mã cũ vô hiệu ngay, mã mới dùng được', async () => {
  const a = await newTutor();
  const old = a.recovery;
  const nw = (await ok(a.post('/api/me/recovery'))).recoveryCode;
  assert.notEqual(nw, old);
  assert.equal((await new Client().post('/api/recover', { code: old })).status, 404);
  assert.equal((await new Client().post('/api/recover', { code: nw })).status, 200);
});

test('ghép thiết bị: mã dùng một lần, hết hạn thì vô hiệu, tối đa 3 mã còn hạn', async () => {
  const a = await newTutor('Gia sư A');
  await addStudent(a, { name: 'Bé Bi' });
  const p = await ok(a.post('/api/devices/pair'));
  assert.match(p.code, /^[A-HJ-NP-Z2-9]{12}$/);
  const dump = JSON.stringify(await db.query('SELECT * FROM pair_codes'));
  assert.ok(!dump.includes(p.code), 'chỉ lưu băm');
  const b = new Client();
  assert.equal((await b.post('/api/devices/redeem', { code: 'ZZZZZZZZZZZZ' })).status, 404);
  assert.equal((await b.post('/api/devices/redeem', { code: p.code })).status, 200);
  assert.equal((await ok(b.get('/api/students'))).students[0].name, 'Bé Bi');
  assert.equal((await new Client().post('/api/devices/redeem', { code: p.code })).status, 404, 'đốt sau lần đầu');
  // hết hạn
  const p2 = await ok(a.post('/api/devices/pair'));
  await db.query(`UPDATE pair_codes SET expires_at = now() - interval '1 minute' WHERE code_hash=$1`, [sha256hex(p2.code)]);
  assert.equal((await new Client().post('/api/devices/redeem', { code: p2.code })).status, 404);
  // quá 3 mã
  await ok(a.post('/api/devices/pair')); await ok(a.post('/api/devices/pair')); await ok(a.post('/api/devices/pair'));
  assert.equal((await a.post('/api/devices/pair')).status, 429);
  // người chưa đăng nhập không tạo được mã
  assert.equal((await new Client().post('/api/devices/pair')).status, 401);
});

test('mã ghép/khôi phục bị giới hạn số lần thử theo IP', async () => {
  resetHourly();
  const old = config.recoverPerIpHour; config.recoverPerIpHour = 5;
  try {
    const c = new Client();
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/devices/redeem', { code: 'ZZZZZZZZZZZZ' })).status, 404);
    assert.equal((await c.post('/api/devices/redeem', { code: 'ZZZZZZZZZZZZ' })).status, 429);
    assert.equal((await c.post('/api/recover', { code: 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' })).status, 404, 'bộ đếm khôi phục tách riêng bộ đếm ghép');
    for (let i = 0; i < 4; i++) await c.post('/api/recover', { code: 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' });
    assert.equal((await c.post('/api/recover', { code: 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' })).status, 429);
  } finally { config.recoverPerIpHour = old; resetHourly(); }
});

test('thiết bị: thu hồi từng máy, đăng xuất máy khác, không đụng phiên của gia sư khác', async () => {
  const a = await newTutor('A1');
  const a2 = new Client(); await ok(a2.post('/api/recover', { code: a.recovery }));
  const a3 = new Client(); await ok(a3.post('/api/recover', { code: a.recovery }));
  const x = await newTutor('Người lạ');
  const list = (await ok(a.get('/api/devices'))).devices;
  assert.equal(list.length, 3);
  const other = list.find((d) => !d.current);
  // gia sư khác không thu hồi được phiên của A
  assert.equal((await x.post(`/api/devices/${other.id}/revoke`)).status, 404);
  assert.equal((await a.get('/api/devices')).json.devices.length, 3);
  await ok(a.post(`/api/devices/${other.id}/revoke`));
  const r = await ok(a.post('/api/logout-others'));
  assert.equal(r.removed, 1);
  assert.equal((await a.get('/api/me')).status, 200);
  assert.equal((await a2.get('/api/me')).status, 401);
  assert.equal((await a3.get('/api/me')).status, 401);
});

test('đăng xuất xóa phiên ở máy chủ: cookie cũ không còn dùng được', async () => {
  const a = await newTutor();
  const old = a.cookie;
  await ok(a.post('/api/logout'));
  assert.equal((await a.get('/api/me', { cookie: old })).status, 401);
});

test('mỗi tài khoản giữ tối đa 8 phiên (phiên cũ nhất bị loại)', async () => {
  const a = await newTutor();
  const cs = [];
  for (let i = 0; i < 9; i++) { const c = new Client(); await ok(c.post('/api/recover', { code: a.recovery })); cs.push(c); }
  assert.equal((await ok(cs[8].get('/api/devices'))).devices.length, 8);
  assert.equal((await a.get('/api/me')).status, 401, 'phiên đầu tiên đã bị loại');
});

test('cập nhật hồ sơ: tên, tình trạng, tài khoản ngân hàng; nhập xấu bị từ chối', async () => {
  const a = await newTutor();
  const me = (await ok(a.post('/api/me', { name: 'Cô Mai', bank: { bin: '970436', account: '0011 004 012345', holder: 'NGUYEN THI MAI' } }))).me;
  assert.equal(me.name, 'Cô Mai'); assert.equal(me.bank.account, '0011004012345');
  assert.equal((await a.post('/api/me', { name: 'x'.repeat(41) })).status, 400);
  assert.equal((await a.post('/api/me', { name: '   ' })).status, 400);
  assert.equal((await a.post('/api/me', { status: 'chua_khai' })).status, 400);
  assert.equal((await a.post('/api/me', { bank: { bin: '970436', account: '1', holder: 'A' } })).status, 400);
  assert.equal((await a.post('/api/me', { bank: { bin: '', account: '', holder: '' } })).json.me.bank, null);
  assert.equal((await a.post('/api/me', 'không phải đối tượng', {})).status, 400);
});

test('giới hạn tài khoản mới theo IP mỗi giờ', async () => {
  const old = config.tutorsPerIpHour;
  await db.query(`UPDATE tutors SET created_ip='x' WHERE true`);
  config.tutorsPerIpHour = 2;
  try {
    const c = new Client();
    assert.equal((await c.post('/api/start', { name: 'a', status: 'khac' })).status, 200);
    assert.equal((await c.post('/api/start', { name: 'b', status: 'khac' })).status, 200);
    assert.equal((await c.post('/api/start', { name: 'c', status: 'khac' })).status, 429);
  } finally { config.tutorsPerIpHour = old; }
});

test('xuất dữ liệu: có đủ dữ liệu của mình, không có băm mã khôi phục hay phiên của ai', async () => {
  const a = await newTutor('Xuất');
  const s = await addStudent(a, { name: 'Bé Xuất' });
  await ok(a.post(`/api/students/${s.id}/payments`, { amount: 50000 }));
  const other = await newTutor('Khác'); await addStudent(other, { name: 'Bé Khác' });
  const r = await a.get('/api/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  const j = JSON.parse(r.buf.toString());
  assert.equal(j.students.length, 1); assert.equal(j.payments.length, 1);
  const txt = r.buf.toString();
  assert.ok(!txt.includes('Bé Khác') && !txt.includes('recovery') && !txt.includes('token_hash'));
});

test('xóa tài khoản: cần xác nhận, xóa cứng mọi dữ liệu, cookie hết tác dụng', async () => {
  const a = await newTutor('Sẽ xóa');
  const s = await addStudent(a);
  await ok(a.post(`/api/students/${s.id}/link`, {}));
  assert.equal((await a.post('/api/me/delete', {})).status, 400);
  assert.equal((await a.post('/api/me/delete', { confirm: 'không' })).status, 400);
  const keep = await newTutor('Giữ lại'); await addStudent(keep, { name: 'Bé Giữ' });
  await ok(a.post('/api/me/delete', { confirm: 'xóa' }));
  assert.equal((await a.get('/api/me')).status, 401);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM students WHERE name=$1', ['Minh']))[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM share_links'))[0].n, 0);
  assert.equal((await ok(keep.get('/api/students'))).students.length, 1);
  assert.equal((await new Client().post('/api/recover', { code: a.recovery })).status, 404);
});

test('đổi sang giáo viên công lập: hiện cảnh báo trong me và trang giới thiệu bị khóa', async () => {
  const a = await newTutor('GV', 'giao_vien_khac');
  assert.equal((await ok(a.get('/api/me'))).me.publicProfileAllowed, true);
  const me = (await ok(a.post('/api/me', { status: 'giao_vien_cong' }))).me;
  assert.equal(me.publicProfileAllowed, false);
});
