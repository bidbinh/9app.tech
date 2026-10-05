// SDK (phản biện lần 2): biên nhận xác nhận, giới hạn theo người dùng, nhật ký kiểm toán, cửa sổ phát lại sau khởi động, kho nonce bền. Không cần CSDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createOsinApi, signRequest, signReceipt, argsHash, verifyReceiptHmac, createNonceStore, verifyRequest } from '../sdk/osin-sdk.js';

const SECRET = 'sdk2-channel-secret-0123456789abcdef0123456789';
const RSECRET = 'sdk2-receipt-secret-fedcba9876543210fedcba98765';
const PREFIX = '/x/osin-api/v1';
let runs = 0;
const tools = [
  { name: 'ghi', description: 'Ghi dữ liệu thử nghiệm cần biên nhận.', readOnly: false, summaryTemplate: 'Ghi', parameters: { type: 'object', properties: { ten: { type: 'string' } } }, run: async (a) => { runs++; return { ok: a.ten }; } },
  { name: 'doc', description: 'Đọc dữ liệu thử nghiệm không cần biên nhận.', readOnly: true, parameters: { type: 'object', properties: {} }, run: async () => ({ x: 1 }) },
];
const mk = (extra = {}) => { const audit = []; const api = createOsinApi({ appId: 'demo', prefix: PREFIX, keys: { osin: SECRET }, receipt: { secret: RSECRET }, tools, audit: (e) => audit.push(e), ...extra }); return { api, audit }; };
function call(api, body, { ts = Math.floor(Date.now() / 1000) } = {}) {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const b = JSON.stringify({ tool: 'ghi', args: { ten: 'a' }, mode: 'execute', actingUserId: 'u1', requestId: 'req-' + crypto.randomBytes(5).toString('hex'), ts: String(ts), nonce, ...body });
  return api.handleRequest({ method: 'POST', url: PREFIX + '/call', headers: signRequest({ keyId: 'osin', secret: SECRET, method: 'POST', pathWithQuery: PREFIX + '/call', body: b, ts, nonce }), body: b });
}
const rcpt = (o = {}) => signReceipt(RSECRET, { userId: 'u1', tool: 'ghi', argsHash: argsHash({ ten: 'a' }), requestId: 'R1', exp: Math.floor(Date.now() / 1000) + 100, ...o });

test('phải quyết định rõ về biên nhận; khóa biên nhận phải khác khóa kênh và đủ dài', () => {
  assert.throws(() => createOsinApi({ appId: 'demo', keys: { osin: SECRET }, tools }), /receipt/);
  assert.throws(() => createOsinApi({ appId: 'demo', keys: { osin: SECRET }, receipt: { secret: SECRET }, tools }), /KHÁC/);
  assert.throws(() => createOsinApi({ appId: 'demo', keys: { osin: SECRET }, receipt: { secret: 'ngan' }, tools }), /quá ngắn/);
  assert.ok(createOsinApi({ appId: 'demo', keys: { osin: SECRET }, receipt: false, tools }));
  assert.ok(createOsinApi({ appId: 'demo', keys: { osin: SECRET }, receipt: { verify: async () => true }, tools }));
});

test('execute của công cụ ghi không có biên nhận hợp lệ thì app từ chối; công cụ đọc được miễn', async () => {
  const { api, audit } = mk();
  const before = runs;
  assert.equal((await call(api, { requestId: 'R1' })).body.error.code, 'receipt_required');
  assert.equal((await call(api, { requestId: 'R1', receipt: 'rac.roi' })).body.error.code, 'receipt_required');
  assert.equal((await call(api, { requestId: 'R1', receipt: rcpt({ userId: 'u2' }) })).body.error.code, 'receipt_required', 'sai người dùng');
  assert.equal((await call(api, { requestId: 'R1', receipt: rcpt({ tool: 'khac' }) })).body.error.code, 'receipt_required', 'sai công cụ');
  assert.equal((await call(api, { requestId: 'R1', receipt: rcpt({ argsHash: argsHash({ ten: 'b' }) }) })).body.error.code, 'receipt_required', 'sai tham số');
  assert.equal((await call(api, { requestId: 'R2', receipt: rcpt() })).body.error.code, 'receipt_required', 'sai requestId');
  assert.equal((await call(api, { requestId: 'R1', receipt: rcpt({ exp: Math.floor(Date.now() / 1000) - 5 }) })).body.error.code, 'receipt_required', 'hết hạn');
  assert.equal((await call(api, { requestId: 'R1', receipt: rcpt({ exp: Math.floor(Date.now() / 1000) + 600 }) })).body.error.code, 'receipt_required', 'hạn quá dài (> 2 phút)');
  const forged = signReceipt('khoa-gia-mao-khoa-gia-mao-khoa-gia-mao-01', { userId: 'u1', tool: 'ghi', argsHash: argsHash({ ten: 'a' }), requestId: 'R1', exp: Math.floor(Date.now() / 1000) + 60 });
  assert.equal((await call(api, { requestId: 'R1', receipt: forged })).body.error.code, 'receipt_required', 'ký bằng khóa khác');
  assert.equal(runs, before);
  assert.equal((await call(api, { requestId: 'R1', receipt: rcpt() })).body.ok, true);
  assert.equal(runs, before + 1);
  assert.equal((await call(api, { tool: 'doc', args: {} })).body.ok, true, 'công cụ đọc không cần biên nhận');
  assert.ok(audit.some((e) => e.code === 'receipt_required' && e.write));
});

test('preview không cần biên nhận (không ghi gì)', async () => {
  const { api } = mk();
  assert.equal((await call(api, { mode: 'preview' })).body.ok, true);
});

test('chữ ký kênh không thay được biên nhận: khóa kênh đúng nhưng thiếu biên nhận vẫn bị từ chối (Osin bị chiếm khóa kênh vẫn không tự ghi được)', async () => {
  const { api } = mk();
  const r = await call(api, { requestId: 'R9' });
  assert.equal(r.body.ok, false);
});

test('biên nhận do bên khác ký (verify tùy biến, ví dụ Ed25519 của 9id) được hỗ trợ', async () => {
  const seen = [];
  const { api } = mk({ receipt: { verify: async (rc, exp) => { seen.push(exp); return rc === 'ed25519-hop-le'; } } });
  assert.equal((await call(api, { requestId: 'R1', receipt: 'sai' })).body.error.code, 'receipt_required');
  assert.equal((await call(api, { requestId: 'R1', receipt: 'ed25519-hop-le' })).body.ok, true);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['argsHash', 'requestId', 'tool', 'userId']);
});

test('giới hạn tần suất theo actingUserId cho mọi execute và nhật ký kiểm toán không chứa tham số', async () => {
  const { api, audit } = mk({ userRate: { max: 3, windowSec: 60 } });
  const rs = [];
  for (let i = 0; i < 5; i++) rs.push(await call(api, { tool: 'doc', args: {} }));
  assert.deepEqual(rs.map((r) => r.status), [200, 200, 200, 429, 429]);
  assert.equal(rs[3].body.error.code, 'rate_limited');
  assert.equal((await call(api, { tool: 'doc', args: {}, actingUserId: 'u-khac' })).status, 200, 'người khác không bị ảnh hưởng');
  assert.ok(audit.length >= 5 && audit.every((e) => e.userId && e.tool && e.requestId && 'argsHash' in e));
  assert.ok(!JSON.stringify(audit).includes('"ten"'), 'nhật ký kiểm toán không chứa giá trị tham số');
});

test('sau khởi động, yêu cầu ký TRƯỚC lúc khởi động bị từ chối (đóng cửa sổ phát lại 120 giây khi kho nonce mất)', async () => {
  const { api } = mk();
  const old = await call(api, { tool: 'doc', args: {} }, { ts: Math.floor(Date.now() / 1000) - 30 });
  assert.equal(old.status, 401); assert.equal(old.body.error.code, 'expired_ts');
  const { api: persistent } = mk({ persistent: true });
  assert.equal((await call(persistent, { tool: 'doc', args: {} }, { ts: Math.floor(Date.now() / 1000) - 30 })).status, 200);
});

test('kho nonce bền: initial nạp lại sau khởi động, persist được gọi cho mỗi nonce mới', async () => {
  const saved = [];
  let t = 1_000_000;
  const s1 = createNonceStore({ now: () => t, persist: async (k, exp) => saved.push([k, exp]) });
  assert.equal(await s1.claim('osin:a'), true);
  assert.equal(saved.length, 1);
  const s2 = createNonceStore({ now: () => t, initial: saved });
  assert.equal(await s2.claim('osin:a'), false, 'nonce đã thấy trước khi khởi động lại vẫn bị chặn');
  t += 400_000;
  assert.equal(await createNonceStore({ now: () => t, initial: saved }).claim('osin:a'), true, 'quá hạn thì thôi');
  void verifyRequest;
});

test('verifyReceiptHmac chấp nhận nhiều khóa (xoay khóa)', () => {
  const exp = { userId: 'u1', tool: 'ghi', argsHash: argsHash({ ten: 'a' }), requestId: 'R1' };
  assert.equal(verifyReceiptHmac(['khoa-moi-khoa-moi-khoa-moi-khoa-moi-01', RSECRET], rcpt(), exp), true);
  assert.equal(verifyReceiptHmac(['khoa-moi-khoa-moi-khoa-moi-khoa-moi-01'], rcpt(), exp), false);
});
