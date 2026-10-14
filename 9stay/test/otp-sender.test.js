import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEsmsSender, makeOtpSender } from '../src/otp.js';
import { productionProblems } from '../src/config.js';

const okFetch = (calls) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ CodeResult: '100' }) }; };

test('eSMS: gửi đúng nội dung, không brandname dùng SmsType 8; có brandname dùng SmsType 2', async () => {
  const calls = [];
  await makeEsmsSender({ apiKey: 'k', secretKey: 's', fetchImpl: okFetch(calls) }).send('0901234567', '123456');
  assert.match(calls[0].url, /^https:\/\/rest\.esms\.vn\//);
  assert.equal(calls[0].body.Phone, '0901234567');
  assert.ok(calls[0].body.Content.startsWith('123456 '));
  assert.equal(calls[0].body.SmsType, '8');
  assert.equal(calls[0].body.Brandname, undefined);
  await makeEsmsSender({ apiKey: 'k', secretKey: 's', brandname: 'ANSTAY', fetchImpl: okFetch(calls) }).send('0901234567', '654321');
  assert.equal(calls[1].body.SmsType, '2');
  assert.equal(calls[1].body.Brandname, 'ANSTAY');
});

test('eSMS: lỗi mạng, mã khác 100, HTTP lỗi, không phải JSON: đều thành 503, không lộ chi tiết', async () => {
  const cases = [
    async () => { throw new Error('ECONNRESET secret-detail'); },
    async () => ({ ok: true, json: async () => ({ CodeResult: '104', ErrorMessage: 'sai khóa' }) }),
    async () => ({ ok: false, json: async () => ({ CodeResult: '100' }) }),
    async () => ({ ok: true, json: async () => { throw new Error('x'); } }),
  ];
  const origErr = console.error; console.error = () => {};
  try {
    for (const fetchImpl of cases) {
      await assert.rejects(makeEsmsSender({ apiKey: 'k', secretKey: 's', fetchImpl }).send('0901234567', '1'), (e) => e.status === 503 && !/secret-detail|sai khóa/.test(e.message));
    }
  } finally { console.error = origErr; }
});

test('chế độ gửi: off không sẵn sàng; log sẵn sàng; esms chọn đúng bộ gửi', async () => {
  assert.equal(makeOtpSender('off').ready, false);
  assert.notEqual(makeOtpSender('log').ready, false);
  assert.equal(typeof makeOtpSender('esms', { apiKey: 'k', secretKey: 's' }).send, 'function');
});

test('production từ chối OTP_MODE=log và esms thiếu khóa', () => {
  const base = { production: true, nineIdSecret: 'x'.repeat(40), nineIdUrl: 'http://9id', edgeSecret: 'y'.repeat(40), trustedProxyHops: 1, otpMode: 'off' };
  const env = { DATABASE_URL: 'postgres://stay:pw@db/stay' };
  assert.deepEqual(productionProblems(base, env), []);
  assert.equal(productionProblems({ ...base, otpMode: 'log' }, env).length, 1);
  assert.equal(productionProblems({ ...base, otpMode: 'esms', esmsApiKey: '', esmsSecretKey: '' }, env).length, 1);
  assert.deepEqual(productionProblems({ ...base, otpMode: 'esms', esmsApiKey: 'a', esmsSecretKey: 'b' }, env), []);
});
