import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, shutdown, Client, ok, newPhone, requestOtpRaw, query, config, util, provider } from './helper.js';
import { getProvider } from '../src/otp-provider.js';

before(async () => { await boot(); });
after(shutdown);

const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};

function fakeEsms({ zaloCode = '100', smsCode = '100' } = {}) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const j = JSON.parse(body || '{}');
      calls.push({ path: req.url, body: j });
      const code = req.url.includes('Zalo') ? zaloCode : smsCode;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ CodeResult: code, ErrorMessage: code === '100' ? '' : 'loi' }));
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, calls, url: 'http://127.0.0.1:' + srv.address().port })));
}

const ESMS = { otpProvider: 'esms', esmsApiKey: 'KEY-TEST', esmsSecret: 'SECRET-TEST', esmsBrandname: 'BRAND', esmsZaloOa: 'OA1', esmsZaloTemp: 'TMP1', esmsChannels: ['zalo', 'sms'], esmsTimeoutMs: 3000 };

test('eSMS: thử Zalo trước; mã trong TempData; số gửi dạng 0xxxxxxxxx; OTP nhận được xác minh được', async () => {
  const f = await fakeEsms();
  try {
    await withConfig({ ...ESMS, esmsBase: f.url }, async () => {
      const phone = newPhone(); const c = new Client('e');
      await ok(requestOtpRaw(c, phone));
      assert.equal(f.calls.length, 1); assert.match(f.calls[0].path, /SendZaloMessage/);
      const b = f.calls[0].body;
      assert.equal(b.Phone, phone); assert.equal(b.OAID, 'OA1'); assert.equal(b.TempID, 'TMP1'); assert.equal(b.ApiKey, 'KEY-TEST');
      const code = b.TempData.otp;
      assert.match(code, /^\d{6}$/); assert.equal(b.TempData.time, '5');
      assert.equal((await c.post('/api/otp/verify', { phone, code })).status, 200);
    });
  } finally { f.srv.close(); }
});

test('eSMS: Zalo lỗi thì tự chuyển sang SMS brandname; cả hai lỗi thì 503 và dòng mã bị xóa; nhật ký không có mã/số/khóa', async () => {
  const lines = [];
  const oe = console.error; console.error = (...a) => lines.push(a.join(' '));
  const f = await fakeEsms({ zaloCode: '99' });
  try {
    await withConfig({ ...ESMS, esmsBase: f.url }, async () => {
      const phone = newPhone(); const c = new Client('e');
      await ok(requestOtpRaw(c, phone));
      assert.deepEqual(f.calls.map((x) => x.path.includes('Zalo') ? 'zalo' : 'sms'), ['zalo', 'sms']);
      const sms = f.calls[1].body;
      assert.equal(sms.Brandname, 'BRAND'); assert.equal(sms.Phone, phone); assert.match(sms.Content, /^\d{6} la ma xac thuc 9app/);
      const code = sms.Content.slice(0, 6);
      assert.equal((await c.post('/api/otp/verify', { phone, code })).status, 200);
    });
    const f2 = await fakeEsms({ zaloCode: '99', smsCode: '99' });
    try {
      await withConfig({ ...ESMS, esmsBase: f2.url }, async () => {
        const phone = newPhone(); const c = new Client('e2');
        const r = await requestOtpRaw(c, phone);
        assert.equal(r.status, 503);
        assert.equal((await query('SELECT count(*)::int AS n FROM otps WHERE phone_hash=$1', [util.phoneHash(util.normalizePhone(phone))]))[0].n, 0);
      });
    } finally { f2.srv.close(); }
    // eSMS không tới được
    await withConfig({ ...ESMS, esmsBase: 'http://127.0.0.1:1', esmsTimeoutMs: 800 }, async () => {
      assert.equal((await requestOtpRaw(new Client('e3'), newPhone())).status, 503);
    });
  } finally { f.srv.close(); console.error = oe; }
  const all = lines.join('\n');
  assert.ok(!all.includes('KEY-TEST') && !all.includes('SECRET-TEST') && !/\b\d{6}\b/.test(all.replace(/eSMS mã \d+/g, '')), all);
  assert.ok(!/\b09\d{8}\b/.test(all) && !all.includes('+84'));
});

test('eSMS: chỉ cấu hình SMS (không Zalo) thì chỉ gọi SMS; sandbox gắn cờ Sandbox', async () => {
  const f = await fakeEsms();
  try {
    await withConfig({ ...ESMS, esmsZaloOa: '', esmsZaloTemp: '', esmsBase: f.url, esmsSandbox: true }, async () => {
      await ok(requestOtpRaw(new Client('s'), newPhone()));
      assert.equal(f.calls.length, 1); assert.match(f.calls[0].path, /SendMultipleMessage/); assert.equal(f.calls[0].body.Sandbox, '1');
    });
  } finally { f.srv.close(); }
});

test('provider không hợp lệ hoặc console ở production bị từ chối', async () => {
  await withConfig({ otpProvider: 'khong-co' }, async () => { assert.throws(() => getProvider(), /OTP_PROVIDER/); });
  await withConfig({ otpProvider: 'console', production: true }, async () => {
    await assert.rejects(getProvider()('+84912345678', '123456'), /production/);
  });
});

test('mock/console lưu tin trong bộ nhớ có giới hạn (không phình mãi)', async () => {
  provider.resetSent();
  for (let i = 0; i < 700; i++) await provider.mockSend?.('+84912345678', '000000');
  assert.ok(provider.sent.length <= 500);
});
