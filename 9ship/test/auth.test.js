import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http.js';
import { authRoutes } from '../src/routes/auth.js';
import { addressRoutes } from '../src/routes/addresses.js';
import { wardsOf } from '../src/geo.js';
import { config } from '../src/config.js';
import * as auth from '../src/auth.js';
import { query } from '../src/db.js';
import { setup, close } from './helpers.js';

let app; let base;
before(async () => {
  await setup();
  config.adminToken = 'admin-tok';
  config.adminTotpSecret = 'JBSWY3DPEHPK3PXP';
  config.rateLimitPerMin = 100000;
  config.routeLimitFactor = 1000;
  app = createApp();
  authRoutes(app);
  addressRoutes(app);
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); await close(); });

const H = { 'content-type': 'application/json', 'x-requested-with': '9ship' };
const post = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { ...H, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const lastCode = (phone) => [...auth.sentForTests].reverse().find((x) => x.phone === phone).code;
const cookieOf = (r) => (r.headers.getSetCookie()[0] || '').split(';')[0];

test('chuẩn hóa số điện thoại', () => {
  assert.equal(auth.normalizePhone('+84 912 345 678'), '0912345678');
  assert.equal(auth.normalizePhone('0912.345.678'), '0912345678');
  assert.throws(() => auth.normalizePhone('12345'), (e) => e.status === 400);
  assert.throws(() => auth.normalizePhone('0212345678'), (e) => e.status === 400);
});

test('OTP đúng thì đăng nhập, có cookie HttpOnly, /v1/me trả user', async () => {
  let r = await post('/v1/auth/otp', { phone: '0912000001' });
  assert.equal(r.status, 200);
  r = await post('/v1/auth/verify', { phone: '0912000001', code: lastCode('0912000001') });
  assert.equal(r.status, 200);
  const sc = r.headers.getSetCookie()[0];
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  const me = await (await fetch(base + '/v1/me', { headers: { cookie: cookieOf(r) } })).json();
  assert.equal(me.user.phone, '0912000001');
});

test('mã dùng một lần: dùng lại bị từ chối', async () => {
  await post('/v1/auth/otp', { phone: '0912000002' });
  const code = lastCode('0912000002');
  assert.equal((await post('/v1/auth/verify', { phone: '0912000002', code })).status, 200);
  assert.equal((await post('/v1/auth/verify', { phone: '0912000002', code })).status, 400);
});

test('sai mã quá số lần thì khóa, kể cả khi sau đó nhập đúng', async () => {
  await post('/v1/auth/otp', { phone: '0912000003' });
  const code = lastCode('0912000003');
  for (let i = 0; i < config.otpMaxTries; i++) {
    const r = await post('/v1/auth/verify', { phone: '0912000003', code: '000000' === code ? '111111' : '000000' });
    assert.equal(r.status, 400);
  }
  const r = await post('/v1/auth/verify', { phone: '0912000003', code });
  assert.equal(r.status, 429);
});

test('mã hết hạn bị từ chối', async () => {
  await post('/v1/auth/otp', { phone: '0912000004' });
  const code = lastCode('0912000004');
  await query("UPDATE otps SET expires_at = now() - interval '1 second' WHERE phone='0912000004'");
  assert.equal((await post('/v1/auth/verify', { phone: '0912000004', code })).status, 400);
});

test('xin mã liên tiếp bị chặn 30 giây; vượt hạn mức ngày bị chặn', async () => {
  assert.equal((await post('/v1/auth/otp', { phone: '0912000005' })).status, 200);
  assert.equal((await post('/v1/auth/otp', { phone: '0912000005' })).status, 429);
  await query("UPDATE otps SET created_at = now() - interval '1 minute' WHERE phone='0912000005'");
  for (let i = 0; i < config.otpDailyPerPhone; i++) {
    await query("INSERT INTO otps(phone, code_hash, expires_at, created_at, ip) VALUES('0912000006','x', now(), now() - interval '2 minutes', $1)", ['ip' + i]);
  }
  assert.equal((await post('/v1/auth/otp', { phone: '0912000006' })).status, 429);
});

test('API cần đăng nhập trả 401 khi chưa có phiên', async () => {
  const r = await fetch(base + '/v1/addresses');
  assert.equal(r.status, 401);
});

test('đăng xuất hủy phiên', async () => {
  await post('/v1/auth/otp', { phone: '0912000007' });
  let r = await post('/v1/auth/verify', { phone: '0912000007', code: lastCode('0912000007') });
  const cookie = cookieOf(r);
  await post('/v1/auth/logout', {}, cookie);
  r = await fetch(base + '/v1/addresses', { headers: { cookie } });
  assert.equal(r.status, 401);
});

test('sổ địa chỉ: thêm, liệt kê, xóa; không đọc được của người khác', async () => {
  await post('/v1/auth/otp', { phone: '0912000008' });
  const c1 = cookieOf(await post('/v1/auth/verify', { phone: '0912000008', code: lastCode('0912000008') }));
  await post('/v1/auth/otp', { phone: '0912000009' });
  const c2 = cookieOf(await post('/v1/auth/verify', { phone: '0912000009', code: lastCode('0912000009') }));
  const add = await (await post('/v1/addresses', { contact: 'An', phone: '0987654321', street: '1 Lê Lợi', ward: wardsOf('ha-noi')[0], province: 'Hà Nội' }, c1)).json();
  const mine = await (await fetch(base + '/v1/addresses', { headers: { cookie: c1 } })).json();
  assert.equal(mine.addresses.length, 1);
  const theirs = await (await fetch(base + '/v1/addresses', { headers: { cookie: c2 } })).json();
  assert.equal(theirs.addresses.length, 0);
  await fetch(base + '/v1/addresses/' + add.id, { method: 'DELETE', headers: { ...H, cookie: c2 } });
  assert.equal((await (await fetch(base + '/v1/addresses', { headers: { cookie: c1 } })).json()).addresses.length, 1);
  await fetch(base + '/v1/addresses/' + add.id, { method: 'DELETE', headers: { ...H, cookie: c1 } });
  assert.equal((await (await fetch(base + '/v1/addresses', { headers: { cookie: c1 } })).json()).addresses.length, 0);
});

test('TOTP khớp vectơ chuẩn RFC 6238 (SHA1)', () => {
  // secret "12345678901234567890" = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ ; t=59 -> 94287082 (8 chữ số) => 6 chữ số cuối 287082
  assert.equal(auth.totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082');
});

test('đăng nhập admin cần cả mã quản trị lẫn TOTP', async () => {
  let r = await post('/v1/admin/login', { token: 'admin-tok', otp: '000000' });
  assert.equal(r.status, 401);
  r = await post('/v1/admin/login', { token: 'sai', otp: auth.totp(config.adminTotpSecret) });
  assert.equal(r.status, 401);
  r = await post('/v1/admin/login', { token: 'admin-tok', otp: auth.totp(config.adminTotpSecret) });
  assert.equal(r.status, 200);
  const me = await (await fetch(base + '/v1/me', { headers: { cookie: cookieOf(r) } })).json();
  assert.equal(me.admin, true);
});

test('step-up: chưa xác thực lại thì bị chặn, xác thực rồi thì qua', async () => {
  await post('/v1/auth/otp', { phone: '0912000010' });
  const cookie = cookieOf(await post('/v1/auth/verify', { phone: '0912000010', code: lastCode('0912000010') }));
  await assert.rejects(async () => {
    const ctx = { session: { hash: (await query('SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT 1'))[0].token_hash } };
    await auth.requireStepUp(ctx);
  }, (e) => e.code === 'step_up_required');
  await query("UPDATE otps SET created_at = now() - interval '1 minute' WHERE phone='0912000010'");
  await post('/v1/auth/step-up/request', {}, cookie);
  const r = await post('/v1/auth/step-up/verify', { code: lastCode('0912000010') }, cookie);
  assert.equal(r.status, 200);
  const ctx = { session: { hash: (await query('SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT 1'))[0].token_hash } };
  await auth.requireStepUp(ctx);
});
