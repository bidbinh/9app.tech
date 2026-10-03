// OTP qua eSMS (Zalo ZNS rồi SMS) với máy chủ eSMS giả dựng theo cách 9Sport đang gọi.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { config } from '../src/config.js';
import * as auth from '../src/auth.js';
import { query } from '../src/db.js';
import { setup, close } from './helpers.js';

const calls = [];
let behavior = {};
const server = http.createServer((req, res) => {
  const c = [];
  req.on('data', (x) => c.push(x));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(c).toString() || '{}');
    calls.push({ path: req.url, body });
    const zalo = req.url.includes('SendZaloMessage');
    const mode = zalo ? behavior.zalo : behavior.sms;
    res.writeHead(mode === 'http500' ? 500 : 200, { 'content-type': 'application/json' });
    if (mode === 'http500') return res.end('{}');
    res.end(JSON.stringify(mode === 'fail' ? { CodeResult: '104', ErrorMessage: 'Brandname không hợp lệ' } : { CodeResult: '100', SMSID: 'x' }));
  });
});

const SAVED = {};
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  await setup();
  Object.assign(SAVED, { p: config.otpProvider, base: config.esmsBase, k: config.esmsApiKey, s: config.esmsSecret, b: config.esmsBrandname, oa: config.esmsZaloOa, t: config.esmsZaloTemp, ch: config.esmsChannels });
  config.otpProvider = 'esms'; config.esmsBase = `http://127.0.0.1:${server.address().port}`;
  config.esmsApiKey = 'KEY'; config.esmsSecret = 'SEC'; config.esmsBrandname = '9app.tech'; config.esmsZaloOa = '4097311281936189049'; config.esmsZaloTemp = '540610';
  config.esmsChannels = ['zalo', 'sms'];
});
after(async () => {
  Object.assign(config, { otpProvider: SAVED.p, esmsBase: SAVED.base, esmsApiKey: SAVED.k, esmsSecret: SAVED.s, esmsBrandname: SAVED.b, esmsZaloOa: SAVED.oa, esmsZaloTemp: SAVED.t, esmsChannels: SAVED.ch });
  server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await close();
});
beforeEach(async () => { calls.length = 0; behavior = {}; await query('DELETE FROM otps'); });

test('Zalo gửi được thì không gọi SMS; đúng khóa, mẫu, số điện thoại và biến mẫu', async () => {
  const r = await auth.requestOtp('0966509898', '1.1.1.1');
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].path, /SendZaloMessage_V6/);
  const b = calls[0].body;
  assert.equal(b.ApiKey, 'KEY'); assert.equal(b.SecretKey, 'SEC');
  assert.equal(b.OAID, '4097311281936189049'); assert.equal(b.TempID, '540610');
  assert.equal(b.Phone, '0966509898');
  assert.match(b.TempData.otp, /^\d{6}$/);
  assert.equal(b.TempData.time, '5');
  assert.equal(b.Sandbox, undefined);
  // mã gửi đi chính là mã đăng nhập được
  const s = await auth.verifyOtp('0966509898', b.TempData.otp);
  assert.equal(s.user.phone, '0966509898');
});

test('Zalo lỗi thì chuyển sang SMS brandname với nội dung theo mẫu', async () => {
  behavior = { zalo: 'fail' };
  await auth.requestOtp('0966509898', '1.1.1.2');
  assert.equal(calls.length, 2);
  assert.match(calls[1].path, /SendMultipleMessage_V4_post_json/);
  const b = calls[1].body;
  assert.equal(b.Brandname, '9app.tech');
  assert.equal(b.SmsType, '2');
  assert.match(b.Content, /^\d{6} la ma xac thuc/);
  assert.match(b.Content, /hieu luc 5 phut/);
});

test('Zalo bị HTTP 500 cũng chuyển sang SMS; cả hai lỗi thì báo kênh OTP không khả dụng (503)', async () => {
  behavior = { zalo: 'http500' };
  await auth.requestOtp('0966509899', '1.1.1.3');
  assert.equal(calls.length, 2);
  calls.length = 0; behavior = { zalo: 'fail', sms: 'fail' };
  await query('DELETE FROM otps');
  await assert.rejects(auth.requestOtp('0966509897', '1.1.1.4'), (e) => e.status === 503 && e.code === 'otp_unavailable');
  assert.equal(calls.length, 2);
});

test('chỉ cấu hình SMS (không Zalo) thì chỉ gọi SMS; thứ tự kênh đổi được; chế độ thử không gửi thật', async () => {
  const saved = { oa: config.esmsZaloOa, ch: config.esmsChannels, sb: config.esmsSandbox };
  config.esmsZaloOa = '';
  await auth.requestOtp('0966509896', '1.1.1.5');
  assert.equal(calls.length, 1);
  assert.match(calls[0].path, /SendMultipleMessage/);
  config.esmsZaloOa = saved.oa; config.esmsChannels = ['sms', 'zalo']; config.esmsSandbox = true;
  calls.length = 0; await query('DELETE FROM otps');
  await auth.requestOtp('0966509895', '1.1.1.6');
  assert.match(calls[0].path, /SendMultipleMessage/, 'SMS trước theo thứ tự cấu hình');
  assert.equal(calls[0].body.Sandbox, '1');
  config.esmsChannels = saved.ch; config.esmsSandbox = saved.sb;
});

test('chưa có khóa eSMS thì quay về kênh quản trị cấp mã, không lỗi', async () => {
  const k = config.esmsApiKey; config.esmsApiKey = '';
  try {
    assert.deepEqual(await auth.requestOtp('0966509894', '1.1.1.7'), { ok: true, manual: true });
    assert.equal(calls.length, 0);
  } finally { config.esmsApiKey = k; }
});

test('mã OTP hết hạn 5 phút và dùng một lần như các kênh khác', async () => {
  await auth.requestOtp('0966509893', '1.1.1.8');
  const code = calls[0].body.TempData.otp;
  await query("UPDATE otps SET expires_at = now() - interval '1 second' WHERE phone='0966509893'");
  await assert.rejects(auth.verifyOtp('0966509893', code), (e) => e.status === 400);
});
