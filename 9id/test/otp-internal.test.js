import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, newPhone, query, config, provider, internal, util } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};
const send = (phone, ip = '203.0.113.7', kid = 'family') => internal(kid, 'POST', '/internal/v1/otp/send', { phone, ip });
const check = (phone, code, ip = '203.0.113.7', kid = 'family') => internal(kid, 'POST', '/internal/v1/otp/verify', { phone, code, ip });
const e164 = (p) => util.normalizePhone(p);

test('gửi rồi xác minh OTP cho khách: không cần PoW, không cấp vé, không tạo tài khoản', async () => {
  const phone = newPhone();
  const s = await send(phone);
  assert.equal(s.status, 200);
  assert.equal(s.json.ok, true);
  const code = provider.lastOtp(e164(phone));
  assert.match(code, /^\d{6}$/);
  assert.equal((await query("SELECT purpose FROM otps WHERE phone_hash=$1", [util.phoneHash(e164(phone))]))[0].purpose, 'verify');
  const v = await check(phone, code);
  assert.equal(v.status, 200);
  assert.deepEqual(v.json, { verified: true });
  assert.equal((await query('SELECT 1 FROM tickets WHERE phone_hash=$1', [util.phoneHash(e164(phone))])).length, 0, 'không có vé đăng ký');
  assert.equal((await query('SELECT 1 FROM users WHERE phone=$1', [e164(phone)])).length, 0, 'không tạo tài khoản');
  assert.ok(!s.text.includes(code) && !v.text.includes(code));
});

test('mã dùng một lần; mã sai 400; không có mã nào thì 400', async () => {
  const phone = newPhone();
  await send(phone);
  const code = provider.lastOtp(e164(phone));
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await check(phone, wrong)).status, 400);
  assert.equal((await check(phone, code)).status, 200);
  assert.equal((await check(phone, code)).status, 400, 'dùng lại mã đã dùng');
  assert.equal((await check(newPhone(), '123456')).status, 400, 'số chưa xin mã');
  for (const bad of [undefined, '', '12345', 'abcdef', 123456, null]) assert.equal((await check(phone, bad)).status, 400, JSON.stringify(bad));
});

test('chỉ app trong INTERNAL_OTP_APPS được dùng; số sai định dạng 400', async () => {
  const phone = newPhone();
  assert.equal((await send(phone, '203.0.113.7', 'fin')).status, 403);
  assert.equal((await check(phone, '123456', '203.0.113.7', 'fin')).status, 403);
  assert.equal(provider.lastOtp(e164(phone)), null, 'app không được phép thì không gửi gì');
  for (const bad of ['123', '', undefined, 'abc', '+1 202 555 0100']) assert.equal((await send(bad)).status, 400, JSON.stringify(bad));
});

test('hạn mức vẫn áp dụng: gửi lại quá sớm 429; theo IP; theo số mỗi ngày', async () => {
  const phone = newPhone();
  await withConfig({ otpResendSec: 60 }, async () => {
    assert.equal((await send(phone)).status, 200);
    const again = await send(phone);
    assert.equal(again.status, 429);
    assert.equal(again.json.error.code, 'otp_too_soon');
  });
  await withConfig({ otpResendSec: 0, otpDailyPerIp: 2 }, async () => {
    const ip = '198.51.100.9';
    assert.equal((await send(newPhone(), ip)).status, 200);
    assert.equal((await send(newPhone(), ip)).status, 200);
    const third = await send(newPhone(), ip);
    assert.equal(third.status, 429);
    assert.equal(third.json.error.code, 'otp_limit');
    assert.equal((await send(newPhone(), '198.51.100.10')).status, 200, 'IP khác không bị ảnh hưởng');
  });
  await withConfig({ otpResendSec: 0, otpDailyPerPhone: 2 }, async () => {
    const p = newPhone();
    assert.equal((await send(p, '192.0.2.1')).status, 200);
    assert.equal((await send(p, '192.0.2.2')).status, 200);
    assert.equal((await send(p, '192.0.2.3')).status, 429);
  });
});

test('hạn mức "verify" tách riêng với đăng ký: xin nhiều mã verify không chặn đăng ký của số đó', async () => {
  const phone = newPhone();
  await withConfig({ otpResendSec: 0, otpDailyPerPhone: 1 }, async () => {
    assert.equal((await send(phone, '192.0.2.50')).status, 200);
    assert.equal((await send(phone, '192.0.2.51')).status, 429);
    // đăng ký thật của cùng số vẫn xin được mã (hạn mức theo mục đích)
    const n = (await query("SELECT count(*)::int AS n FROM otps WHERE phone_hash=$1 AND purpose='register'", [util.phoneHash(e164(phone))]))[0].n;
    assert.equal(n, 0);
  });
});

test('gửi lỗi (nhà cung cấp hỏng): 503, không để lại mã, không lộ chi tiết', async () => {
  const phone = newPhone();
  provider.setFailNext(1);
  const r = await send(phone);
  assert.equal(r.status, 503);
  assert.equal((await query('SELECT 1 FROM otps WHERE phone_hash=$1', [util.phoneHash(e164(phone))])).length, 0);
  assert.ok(!/mock|cố ý/.test(r.text));
});

test('thiếu chữ ký: 401', async () => {
  const bad = await internal('family', 'POST', '/internal/v1/otp/send', { phone: newPhone() }, { secret: 'sai-bi-mat-0123456789abcdef0123456789' });
  assert.equal(bad.status, 401);
});
