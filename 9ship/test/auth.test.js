import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/http.js';
import { authRoutes } from '../src/routes/auth.js';
import { addressRoutes } from '../src/routes/addresses.js';
import { wardsOf } from '../src/geo.js';
import { config } from '../src/config.js';
import * as auth from '../src/auth.js';
import * as pw from '../src/password.js';
import { query } from '../src/db.js';
import { setup, close } from './helpers.js';

// ---- 9Sport giả: POST /dang-nhap (form) -> 303 kèm cookie k77_nd khi đúng, 303 kèm &loi= khi sai ----
const sport = { users: { '0933000001': { pass: 'matkhau-9sport', name: 'Lê Thu Hà' } }, calls: 0, down: false };
const sportServer = http.createServer((req, res) => {
  const c = [];
  req.on('data', (x) => c.push(x));
  req.on('end', () => {
    sport.calls++;
    if (sport.down) { res.destroy(); return; }
    const p = new URLSearchParams(Buffer.concat(c).toString());
    const u = sport.users[p.get('sdt')];
    if (req.url === '/dang-nhap' && u && u.pass === p.get('mat_khau')) {
      res.writeHead(303, { location: '/tai-khoan?tb=' + encodeURIComponent('Xin chào, ' + u.name), 'set-cookie': 'k77_nd=nd7.123.sig; HttpOnly; Path=/' });
    } else {
      res.writeHead(303, { location: '/dang-nhap?ca_nhan=1&tiep=%2F&loi=' + encodeURIComponent('Số điện thoại hoặc mật khẩu không đúng') });
    }
    res.end();
  });
});

let app; let base;
before(async () => {
  await new Promise((r) => sportServer.listen(0, '127.0.0.1', r));
  await setup();
  config.adminToken = 'admin-tok';
  config.adminTotpSecret = 'JBSWY3DPEHPK3PXP';
  config.rateLimitPerMin = 100000;
  config.routeLimitFactor = 1000;
  config.sso9sportUrl = `http://127.0.0.1:${sportServer.address().port}`;
  app = createApp();
  authRoutes(app);
  addressRoutes(app);
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); sportServer.closeAllConnections?.(); await new Promise((r) => sportServer.close(r)); await close(); });
beforeEach(async () => { sport.calls = 0; sport.down = false; await query('DELETE FROM auth_failures'); });

const H = { 'content-type': 'application/json', 'x-requested-with': '9ship' };
const post = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { ...H, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const lastCode = (phone) => [...auth.sentForTests].reverse().find((x) => x.phone === phone).code;
const cookieOf = (r) => (r.headers.getSetCookie()[0] || '').split(';')[0];
let seq = 0;
const newPhone = () => '091200' + String(1000 + ++seq);

async function register(phone, { name = 'Nguyễn Văn A', password = 'matkhau1' } = {}) {
  assert.equal((await post('/v1/auth/register/otp', { phone })).status, 200);
  return post('/v1/auth/register', { phone, code: lastCode(phone), name, password });
}

test('chuẩn hóa số điện thoại', () => {
  assert.equal(auth.normalizePhone('+84 912 345 678'), '0912345678');
  assert.equal(auth.normalizePhone('0912.345.678'), '0912345678');
  assert.throws(() => auth.normalizePhone('12345'), (e) => e.status === 400);
  assert.throws(() => auth.normalizePhone('0212345678'), (e) => e.status === 400);
});

test('mật khẩu băm cùng định dạng với 9Sport: nhận hash do Python/9Sport tạo, và hash của ta đúng định dạng', async () => {
  // vectơ do app/auth.py của 9Sport (hashlib.pbkdf2_hmac sha256, 200000 vòng) tạo ra
  const fromSport = 'pbkdf2$200000$abcdef0123456789$137e599f2e12a42b4a90e95f4b559feb90888adbd76c6fa95446a5bd7164623a';
  assert.equal(await pw.verify('matkhau123', fromSport), true);
  assert.equal(await pw.verify('sai-mat-khau', fromSport), false);
  const mine = await pw.hash('mat-khau-moi');
  assert.match(mine, /^pbkdf2\$200000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(await pw.verify('mat-khau-moi', mine), true);
  assert.equal(await pw.verify('x', 'rác'), false);
  assert.equal(await pw.verify('x', ''), false);
});

test('độ mạnh mật khẩu: tối thiểu 6, cấm mật khẩu quá dễ đoán', () => {
  for (const bad of ['12345', '123456', 'password', 'aaaaaaaa', '0912345678']) assert.throws(() => pw.check(bad, '0912345678'), (e) => e.status === 400, bad);
  assert.equal(pw.check('abc123x', '0912345678'), 'abc123x');
});

test('đăng ký lần đầu: OTP một lần + họ tên + mật khẩu → vào luôn; lần sau chỉ mật khẩu, không cần OTP', async () => {
  const phone = newPhone();
  assert.deepEqual(await (await post('/v1/auth/check', { phone })).json(), { phone, state: 'new', sso: true });
  const r = await register(phone, { name: 'Trần Văn Bình', password: 'matkhau1' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.user.name, 'Trần Văn Bình');
  assert.equal(j.needsName, false);
  const sc = r.headers.getSetCookie()[0];
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  assert.equal((await (await fetch(base + '/v1/me', { headers: { cookie: cookieOf(r) } })).json()).user.phone, phone);
  assert.equal((await (await post('/v1/auth/check', { phone })).json()).state, 'login');
  // đăng nhập lại bằng mật khẩu: không có OTP nào được gửi thêm
  const sent = auth.sentForTests.length;
  const l = await post('/v1/auth/login', { phone, password: 'matkhau1' });
  assert.equal(l.status, 200);
  assert.equal(auth.sentForTests.length, sent, 'đăng nhập không gửi OTP');
  const hash = (await query('SELECT password_hash FROM users WHERE phone=$1', [phone]))[0].password_hash;
  assert.ok(hash.startsWith('pbkdf2$200000$'));
  assert.ok(!hash.includes('matkhau1'));
});

test('đăng ký: OTP sai/hết hạn/dùng lại, mật khẩu yếu, họ tên thiếu, số đã có tài khoản đều bị từ chối', async () => {
  const phone = newPhone();
  await post('/v1/auth/register/otp', { phone });
  const code = lastCode(phone);
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await post('/v1/auth/register', { phone, code: wrong, name: 'An Bình', password: 'matkhau1' })).status, 400);
  assert.equal((await post('/v1/auth/register', { phone, code, name: 'A', password: 'matkhau1' })).status, 400, 'tên quá ngắn');
  assert.equal((await post('/v1/auth/register', { phone, code, name: 'An Bình', password: '123456' })).status, 400, 'mật khẩu yếu');
  assert.equal((await post('/v1/auth/register', { phone, code, name: 'An Bình', password: 'matkhau1' })).status, 200, 'mã còn dùng được vì các lần trên bị chặn trước khi tiêu mã');
  assert.equal((await post('/v1/auth/register', { phone, code, name: 'An Bình', password: 'matkhau2' })).status, 409, 'đã có tài khoản');
  assert.equal((await post('/v1/auth/register/otp', { phone })).status, 409);
  const p2 = newPhone();
  await post('/v1/auth/register/otp', { phone: p2 });
  const c2 = lastCode(p2);
  await query("UPDATE otps SET expires_at = now() - interval '1 second' WHERE phone=$1", [p2]);
  assert.equal((await post('/v1/auth/register', { phone: p2, code: c2, name: 'An Bình', password: 'matkhau1' })).status, 400);
});

test('sai mã OTP quá số lần thì khóa mã, kể cả khi sau đó nhập đúng', async () => {
  const phone = newPhone();
  await post('/v1/auth/register/otp', { phone });
  const code = lastCode(phone);
  for (let i = 0; i < config.otpMaxTries; i++) assert.equal((await post('/v1/auth/register', { phone, code: code === '000000' ? '111111' : '000000', name: 'An Bình', password: 'matkhau1' })).status, 400);
  assert.equal((await post('/v1/auth/register', { phone, code, name: 'An Bình', password: 'matkhau1' })).status, 429);
});

test('đăng nhập sai mật khẩu: thông báo chung, khóa tạm sau nhiều lần sai, đăng nhập đúng cũng bị khóa trong thời gian đó', async () => {
  const phone = newPhone();
  await register(phone);
  for (let i = 0; i < config.loginMaxFails - 1; i++) {
    const r = await post('/v1/auth/login', { phone, password: 'sai-' + i });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error.message, 'Số điện thoại hoặc mật khẩu không đúng');
  }
  assert.equal((await post('/v1/auth/login', { phone, password: 'sai-cuoi' })).status, 401);
  const locked = await post('/v1/auth/login', { phone, password: 'matkhau1' });
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).error.code, 'locked');
  // hết thời gian khóa thì vào lại được
  await query("UPDATE auth_failures SET locked_until = now() - interval '1 second', first_at = now() - interval '1 hour'");
  assert.equal((await post('/v1/auth/login', { phone, password: 'matkhau1' })).status, 200);
});

test('đăng nhập thành công xóa bộ đếm sai; số lạ cũng bị tính để không dò được tài khoản', async () => {
  const phone = newPhone();
  await register(phone);
  await post('/v1/auth/login', { phone, password: 'sai1' });
  await post('/v1/auth/login', { phone, password: 'matkhau1' });
  assert.equal((await query('SELECT count(*)::int n FROM auth_failures WHERE key=$1', ['p:' + phone]))[0].n, 0);
  const ghost = '0919999999';
  for (let i = 0; i < config.loginMaxFails; i++) await post('/v1/auth/login', { phone: ghost, password: 'x' + i });
  assert.equal((await post('/v1/auth/login', { phone: ghost, password: 'x' })).status, 429);
});

test('dùng chung tài khoản 9Sport: số chưa có ở 9Ship nhưng có ở 9Sport thì đăng nhập bằng mật khẩu 9Sport, không cần OTP', async () => {
  const phone = '0933000001';
  assert.equal((await (await post('/v1/auth/check', { phone })).json()).state, 'new');
  const bad = await post('/v1/auth/login', { phone, password: 'sai-roi' });
  assert.equal(bad.status, 401);
  const sent = auth.sentForTests.length;
  const ok = await post('/v1/auth/login', { phone, password: 'matkhau-9sport' });
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.user.name, 'Lê Thu Hà', 'lấy được tên từ 9Sport');
  assert.equal(auth.sentForTests.length, sent, 'không gửi OTP');
  const u = (await query('SELECT * FROM users WHERE phone=$1', [phone]))[0];
  assert.equal(u.source, '9sport');
  assert.ok(u.verified_at);
  // lần sau đăng nhập thẳng ở 9Ship, không gọi 9Sport nữa
  sport.calls = 0;
  assert.equal((await post('/v1/auth/login', { phone, password: 'matkhau-9sport' })).status, 200);
  assert.equal(sport.calls, 0);
  assert.equal((await (await post('/v1/auth/check', { phone })).json()).state, 'login');
});

test('9Sport ngừng phục vụ hoặc tắt liên kết: đăng nhập báo sai thông tin, không lỗi hệ thống', async () => {
  sport.users['0933000003'] = { pass: 'matkhau-9sport', name: 'Người Chưa Liên Kết' };
  sport.down = true;
  assert.equal((await post('/v1/auth/login', { phone: '0933000003', password: 'matkhau-9sport' })).status, 401);
  sport.down = false;
  const saved = config.sso9sportUrl;
  config.sso9sportUrl = '';
  try {
    sport.calls = 0;
    assert.equal((await post('/v1/auth/login', { phone: '0933000003', password: 'matkhau-9sport' })).status, 401);
    assert.equal(sport.calls, 0, 'không gọi 9Sport khi tắt');
    assert.equal((await (await post('/v1/auth/check', { phone: '0933000003' })).json()).sso, false);
  } finally { config.sso9sportUrl = saved; }
});

test('tài khoản cũ tạo bằng OTP (chưa có mật khẩu): đăng nhập báo cần đặt mật khẩu; đặt lại bằng OTP thì dùng được', async () => {
  const phone = newPhone();
  await query('INSERT INTO users(phone, name) VALUES($1, $2)', [phone, 'Cũ']);
  assert.equal((await (await post('/v1/auth/check', { phone })).json()).state, 'new');
  const r = await post('/v1/auth/login', { phone, password: 'whatever1' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error.code, 'password_required');
  assert.equal((await query('SELECT count(*)::int n FROM auth_failures WHERE key=$1', ['p:' + phone]))[0].n, 0, 'không tính là nhập sai');
  assert.equal((await register(phone, { name: 'Tên Mới', password: 'matkhau-moi' })).status, 200);
  assert.equal((await query('SELECT name FROM users WHERE phone=$1', [phone]))[0].name, 'Cũ', 'giữ tên đã có');
  assert.equal((await post('/v1/auth/login', { phone, password: 'matkhau-moi' })).status, 200);
});

test('quên mật khẩu: cần OTP, đặt mật khẩu mới, mọi phiên cũ bị đăng xuất, mật khẩu cũ hết hiệu lực', async () => {
  const phone = newPhone();
  const r1 = await register(phone, { password: 'matkhau-cu' });
  const oldCookie = cookieOf(r1);
  assert.equal((await post('/v1/auth/reset/otp', { phone: '0919000000' })).status, 404, 'số chưa có tài khoản');
  await query("UPDATE otps SET created_at = now() - interval '1 minute' WHERE phone=$1", [phone]);
  assert.equal((await post('/v1/auth/reset/otp', { phone })).status, 200);
  const code = lastCode(phone);
  assert.equal((await post('/v1/auth/reset', { phone, code, password: '123456' })).status, 400, 'mật khẩu yếu');
  const r2 = await post('/v1/auth/reset', { phone, code, password: 'matkhau-moi' });
  assert.equal(r2.status, 200);
  assert.equal((await (await fetch(base + '/v1/me', { headers: { cookie: oldCookie } })).json()).user, null, 'phiên cũ bị hủy');
  assert.equal((await post('/v1/auth/login', { phone, password: 'matkhau-cu' })).status, 401);
  assert.equal((await post('/v1/auth/login', { phone, password: 'matkhau-moi' })).status, 200);
});

test('đổi mật khẩu: cần mật khẩu hiện tại; thiết bị khác bị đăng xuất, thiết bị này vẫn giữ', async () => {
  const phone = newPhone();
  const a = cookieOf(await register(phone, { password: 'matkhau-cu' }));
  const b = cookieOf(await post('/v1/auth/login', { phone, password: 'matkhau-cu' }));
  assert.equal((await post('/v1/me/password', { current: 'sai', password: 'matkhau-moi' }, a)).status, 400);
  assert.equal((await post('/v1/me/password', { current: 'matkhau-cu', password: '111111' }, a)).status, 400);
  assert.equal((await post('/v1/me/password', { current: 'matkhau-cu', password: 'matkhau-moi' }, a)).status, 200);
  assert.equal((await (await fetch(base + '/v1/me', { headers: { cookie: a } })).json()).user.phone, phone);
  assert.equal((await (await fetch(base + '/v1/me', { headers: { cookie: b } })).json()).user, null);
  assert.equal((await post('/v1/auth/login', { phone, password: 'matkhau-moi' })).status, 200);
});

test('rút tiền cần nhập lại mật khẩu (step-up), sai nhiều lần thì khóa', async () => {
  const phone = newPhone();
  const cookie = cookieOf(await register(phone, { password: 'matkhau1' }));
  const uid = (await query('SELECT id FROM users WHERE phone=$1', [phone]))[0].id;
  const hashOf = async () => (await query('SELECT token_hash FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [uid]))[0].token_hash;
  await assert.rejects(auth.requireStepUp({ session: { hash: await hashOf() } }), (e) => e.code === 'step_up_required');
  assert.equal((await post('/v1/auth/step-up', { password: 'sai' }, cookie)).status, 401);
  assert.equal((await post('/v1/auth/step-up', { password: 'matkhau1' }, cookie)).status, 200);
  await auth.requireStepUp({ session: { hash: await hashOf() } });
  for (let i = 0; i < config.loginMaxFails; i++) await post('/v1/auth/step-up', { password: 'sai' + i }, cookie);
  assert.equal((await post('/v1/auth/step-up', { password: 'matkhau1' }, cookie)).status, 429);
});

test('API cần đăng nhập trả 401 khi chưa có phiên; đăng xuất hủy phiên', async () => {
  assert.equal((await fetch(base + '/v1/addresses')).status, 401);
  const cookie = cookieOf(await register(newPhone()));
  assert.equal((await fetch(base + '/v1/addresses', { headers: { cookie } })).status, 200);
  await post('/v1/auth/logout', {}, cookie);
  assert.equal((await fetch(base + '/v1/addresses', { headers: { cookie } })).status, 401);
});

test('đặt tên hiển thị: PATCH /v1/me; tài khoản 9Sport không có tên thì needsName', async () => {
  sport.users['0933000002'] = { pass: 'matkhau-9sport', name: '' };
  const r = await post('/v1/auth/login', { phone: '0933000002', password: 'matkhau-9sport' });
  assert.equal((await r.json()).needsName, true);
  const cookie = cookieOf(r);
  const upd = await fetch(base + '/v1/me', { method: 'PATCH', headers: { ...H, cookie }, body: JSON.stringify({ name: '  Phạm   Thị Mai ' }) });
  assert.equal((await upd.json()).user.name, 'Phạm Thị Mai');
});

test('sổ địa chỉ: thêm, liệt kê, xóa; không đọc được của người khác', async () => {
  const c1 = cookieOf(await register(newPhone()));
  const c2 = cookieOf(await register(newPhone()));
  const add = await (await post('/v1/addresses', { contact: 'An', phone: '0987654321', street: '1 Lê Lợi', ward: wardsOf('ha-noi')[0], province: 'Hà Nội' }, c1)).json();
  assert.equal((await (await fetch(base + '/v1/addresses', { headers: { cookie: c1 } })).json()).addresses.length, 1);
  assert.equal((await (await fetch(base + '/v1/addresses', { headers: { cookie: c2 } })).json()).addresses.length, 0);
  await fetch(base + '/v1/addresses/' + add.id, { method: 'DELETE', headers: { ...H, cookie: c2 } });
  assert.equal((await (await fetch(base + '/v1/addresses', { headers: { cookie: c1 } })).json()).addresses.length, 1);
});

test('TOTP khớp vectơ chuẩn RFC 6238 (SHA1)', () => {
  assert.equal(auth.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082');
});

test('đăng nhập admin cần cả mã quản trị lẫn TOTP; người dùng thường không vào được admin', async () => {
  let r = await post('/v1/admin/login', { token: 'admin-tok', otp: '000000' });
  assert.equal(r.status, 401);
  r = await post('/v1/admin/login', { token: 'sai', otp: auth.totp(config.adminTotpSecret) });
  assert.equal(r.status, 401);
  r = await post('/v1/admin/login', { token: 'admin-tok', otp: auth.totp(config.adminTotpSecret) });
  assert.equal(r.status, 200);
  assert.equal((await (await fetch(base + '/v1/me', { headers: { cookie: cookieOf(r) } })).json()).admin, true);
});

test('OTP: giới hạn gửi lại 30 giây và hạn mức theo ngày', async () => {
  const phone = newPhone();
  assert.equal((await post('/v1/auth/register/otp', { phone })).status, 200);
  assert.equal((await post('/v1/auth/register/otp', { phone })).status, 429);
  await query("UPDATE otps SET created_at = now() - interval '1 minute' WHERE phone=$1", [phone]);
  const p2 = newPhone();
  for (let i = 0; i < config.otpDailyPerPhone; i++) await query("INSERT INTO otps(phone, code_hash, expires_at, created_at, ip) VALUES($1,'x', now(), now() - interval '2 minutes', $2)", [p2, 'ip' + i]);
  assert.equal((await post('/v1/auth/register/otp', { phone: p2 })).status, 429);
});
