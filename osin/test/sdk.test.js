// SDK: chữ ký HMAC, chống phát lại, requestId chạy một lần, kiểm tham số, chuẩn hóa lỗi. Không cần CSDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createOsinApi, signRequest, verifyRequest, createNonceStore, createResultStore, validateArgs, renderTemplate, defineTool, OsinError } from '../sdk/osin-sdk.js';

const SECRET = 'sdk-test-secret-0123456789abcdef0123456789';
const PREFIX = '/x/osin-api/v1';
let runs = 0;
const mk = (extra = {}) => createOsinApi({
  appId: 'demo', prefix: PREFIX, keys: { osin: SECRET, other: 'other-secret-0123456789abcdef0123456789' }, receipt: false,
  tools: [
    { name: 'doc', description: 'Đọc dữ liệu thử nghiệm của người dùng.', readOnly: true, parameters: { type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 5 } } }, run: async (a, c) => ({ who: c.userId, fam: c.familyId, n: a.n ?? 0 }) },
    { name: 'ghi', description: 'Ghi dữ liệu thử nghiệm cho người dùng.', readOnly: false, parameters: { type: 'object', properties: { ten: { type: 'string', maxLength: 20 } }, required: ['ten'] }, summaryTemplate: 'Ghi "{ten}"', run: async (a) => { runs++; await new Promise((r) => setTimeout(r, 20)); return { ok: a.ten, lan: runs }; } },
    { name: 'loi_nghiep_vu', description: 'Luôn báo lỗi nghiệp vụ có chủ đích.', readOnly: true, run: async () => { throw Object.assign(new Error('Bạn không có quyền'), { osinCode: 'forbidden' }); } },
    { name: 'loi_bat_ngo', description: 'Luôn ném lỗi bất ngờ để thử che lỗi.', readOnly: true, run: async () => { throw new Error('bí mật nội bộ: mật khẩu db'); } },
    { name: 'to', description: 'Trả kết quả quá lớn để thử giới hạn.', readOnly: true, run: async () => ({ x: 'a'.repeat(200 * 1024) }) },
  ],
  ...extra,
});
const callBody = (o = {}, ts, nonce) => ({ tool: 'doc', args: {}, mode: 'execute', actingUserId: 'u1', requestId: 'req-' + crypto.randomBytes(6).toString('hex'), ts: String(ts), nonce, ...o });
function signed(api, { path = PREFIX + '/call', method = 'POST', body, ts = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(16).toString('base64url'), secret = SECRET, keyId = 'osin', mutate } = {}) {
  const b = body === undefined ? (method === 'POST' ? JSON.stringify(callBody({}, ts, nonce)) : '') : (typeof body === 'string' ? body : JSON.stringify(body));
  const headers = signRequest({ keyId, secret, method, pathWithQuery: path, body: b, ts, nonce });
  if (mutate) mutate(headers);
  return api.handleRequest({ method, url: path, headers, body: b });
}

test('manifest: GET /tools ký đúng trả danh sách, không lộ hàm run', async () => {
  const api = mk();
  const r = await signed(api, { method: 'GET', path: PREFIX + '/tools', body: '' });
  assert.equal(r.status, 200);
  assert.equal(r.body.protocol, 1);
  assert.deepEqual(r.body.tools.map((t) => t.name), ['doc', 'ghi', 'loi_nghiep_vu', 'loi_bat_ngo', 'to']);
  assert.ok(r.body.tools.every((t) => !('run' in t) && typeof t.readOnly === 'boolean' && typeof t.confirm === 'boolean'));
  assert.equal(r.body.tools.find((t) => t.name === 'ghi').confirm, true, 'công cụ ghi mặc định confirm=true');
});

test('chữ ký: thiếu header, sai chữ ký, sai khóa, sai thân, sai đường dẫn đều bị 401', async () => {
  const api = mk();
  assert.equal((await api.handleRequest({ method: 'POST', url: PREFIX + '/call', headers: {}, body: '{}' })).status, 401);
  assert.equal((await signed(api, { secret: 'sai-bi-mat-0123456789abcdef0123456789abcd' })).status, 401);
  assert.equal((await signed(api, { keyId: 'khong-co' })).status, 401);
  // đổi thân sau khi ký
  const ts = Math.floor(Date.now() / 1000); const nonce = crypto.randomBytes(16).toString('base64url');
  const body = JSON.stringify(callBody({}, ts, nonce));
  const headers = signRequest({ keyId: 'osin', secret: SECRET, method: 'POST', pathWithQuery: PREFIX + '/call', body, ts, nonce });
  assert.equal((await api.handleRequest({ method: 'POST', url: PREFIX + '/call', headers, body: body.replace('u1', 'u2') })).status, 401);
  // chữ ký của /tools không dùng được cho /call
  const h2 = signRequest({ keyId: 'osin', secret: SECRET, method: 'GET', pathWithQuery: PREFIX + '/tools', body: '' });
  assert.equal((await api.handleRequest({ method: 'POST', url: PREFIX + '/call', headers: h2, body })).status, 401);
  const r = await signed(api, { mutate: (h) => { h['x-osin-sig'] = h['x-osin-sig'].slice(0, -1) + (h['x-osin-sig'].endsWith('0') ? '1' : '0'); } });
  assert.equal(r.status, 401); assert.equal(r.body.error.code, 'bad_signature');
});

test('chống phát lại: cùng nonce lần hai bị từ chối; hết lệch giờ cũng bị từ chối', async () => {
  const api = mk();
  const ts = Math.floor(Date.now() / 1000); const nonce = crypto.randomBytes(16).toString('base64url');
  const body = JSON.stringify(callBody({}, ts, nonce));
  const headers = signRequest({ keyId: 'osin', secret: SECRET, method: 'POST', pathWithQuery: PREFIX + '/call', body, ts, nonce });
  const first = await api.handleRequest({ method: 'POST', url: PREFIX + '/call', headers, body });
  assert.equal(first.status, 200);
  const again = await api.handleRequest({ method: 'POST', url: PREFIX + '/call', headers, body });
  assert.equal(again.status, 401); assert.equal(again.body.error.code, 'replay');
  const old = await signed(api, { ts: Math.floor(Date.now() / 1000) - 400 });
  assert.equal(old.status, 401); assert.equal(old.body.error.code, 'expired_ts');
  const future = await signed(api, { ts: Math.floor(Date.now() / 1000) + 400 });
  assert.equal(future.body.error.code, 'expired_ts');
});

test('nonce chỉ ghi nhận SAU khi chữ ký đúng (kẻ lạ không làm đầy kho); kho đầy thì từ chối, không bỏ kiểm', async () => {
  const nonces = createNonceStore({ max: 3 });
  const keys = { osin: SECRET };
  const mkReq = (nonce, secret = SECRET) => ({ keys, method: 'POST', pathWithQuery: '/p', headers: signRequest({ keyId: 'osin', secret, method: 'POST', pathWithQuery: '/p', body: '', nonce }), body: '', nonces });
  for (let i = 0; i < 20; i++) await assert.rejects(verifyRequest(mkReq('nonce-sai-chu-ky-' + i.toString().padStart(4, '0'), 'sai-sai-sai-0123456789abcdef0123456789ab')));
  assert.equal(nonces.size, 0);
  for (let i = 0; i < 3; i++) await verifyRequest(mkReq('nonce-hop-le-so-' + i.toString().padStart(4, '0')));
  await assert.rejects(verifyRequest(mkReq('nonce-hop-le-so-0009')), (e) => e instanceof OsinError && e.status === 503);
});

test('nonce hết hạn theo đồng hồ thì dùng lại được (kho theo TTL)', async () => {
  let t = 1_000_000;
  const s = createNonceStore({ ttlSec: 10, now: () => t });
  assert.equal(await s.claim('a'), true);
  assert.equal(await s.claim('a'), false);
  t += 11_000;
  assert.equal(await s.claim('a'), true);
});

test('thân phải khớp header ts/nonce', async () => {
  const api = mk();
  const ts = Math.floor(Date.now() / 1000); const nonce = crypto.randomBytes(16).toString('base64url');
  const r = await signed(api, { ts, nonce, body: callBody({}, ts, 'nonce-khac-0123456789abcdef') });
  assert.equal(r.status, 401);
});

test('công cụ đọc nhận actingUserId/familyId từ ngữ cảnh; tham số lạ và sai kiểu bị từ chối', async () => {
  const api = mk();
  const ts = Math.floor(Date.now() / 1000);
  const mkc = (o) => { const nonce = crypto.randomBytes(16).toString('base64url'); return signed(api, { ts, nonce, body: callBody(o, ts, nonce) }); };
  const a = await mkc({ args: { n: 3 }, familyId: 'f1' });
  assert.deepEqual(a.body, { ok: true, result: { who: 'u1', fam: 'f1', n: 3 } });
  for (const args of [{ n: 99 }, { n: 'abc' }, { n: 1.5 }, { actingUserId: 'u2' }, { n: 1, userId: 'x' }]) {
    const r = await mkc({ args });
    assert.equal(r.body.ok, false, JSON.stringify(args)); assert.equal(r.body.error.code, 'invalid_args');
  }
  assert.equal((await mkc({ actingUserId: '../etc' })).body.error.code, 'no_user');
  assert.equal((await mkc({ actingUserId: undefined })).body.error.code, 'no_user');
  assert.equal((await mkc({ tool: 'khong_co' })).body.error.code, 'unknown_tool');
  assert.equal((await mkc({ tool: '__proto__' })).body.error.code, 'unknown_tool');
  assert.equal((await mkc({ mode: 'xoa' })).status, 400);
});

test('lỗi: nghiệp vụ có mã, lỗi bất ngờ bị che (không lộ nội dung lỗi), kết quả quá lớn bị chặn', async () => {
  const api = mk();
  const ts = Math.floor(Date.now() / 1000);
  const mkc = (o) => { const nonce = crypto.randomBytes(16).toString('base64url'); return signed(api, { ts, nonce, body: callBody(o, ts, nonce) }); };
  const a = await mkc({ tool: 'loi_nghiep_vu' });
  assert.deepEqual(a.body, { ok: false, error: { code: 'forbidden', message: 'Bạn không có quyền' } });
  const b = await mkc({ tool: 'loi_bat_ngo' });
  assert.equal(b.body.error.code, 'internal');
  assert.ok(!JSON.stringify(b.body).includes('mật khẩu'));
  assert.equal((await mkc({ tool: 'to' })).body.error.code, 'result_too_large');
});

test('preview: không chạy công cụ ghi, trả tóm tắt từ summaryTemplate (làm sạch, không bị $& trong giá trị)', async () => {
  const before = runs;
  const api = mk();
  const ts = Math.floor(Date.now() / 1000);
  const mkc = (o) => { const nonce = crypto.randomBytes(16).toString('base64url'); return signed(api, { ts, nonce, body: callBody(o, ts, nonce) }); };
  const r = await mkc({ tool: 'ghi', args: { ten: 'sữa $& $1 ngon' }, mode: 'preview' });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.preview.summary, 'Ghi "sữa $& $1 ngon"');
  assert.equal(runs, before, 'preview không được chạy công cụ');
  assert.equal(renderTemplate('Xóa {ten}', { ten: 'a‮b\nc' }), 'Xóa a b c');
  assert.equal(renderTemplate('{khong_co}x', {}), 'x');
});

test('requestId: công cụ ghi chạy đúng một lần dù gọi lại (kể cả đồng thời); khác nội dung cùng requestId bị từ chối', async () => {
  const api = mk();
  const before = runs;
  const ts = Math.floor(Date.now() / 1000);
  const mkc = (o) => { const nonce = crypto.randomBytes(16).toString('base64url'); return signed(api, { ts, nonce, body: callBody(o, ts, nonce) }); };
  const rid = 'req-xac-nhan-1';
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => mkc({ tool: 'ghi', args: { ten: 'sữa' }, requestId: rid })));
  assert.ok(rs.every((r) => r.body.ok === true));
  assert.equal(runs - before, 1);
  assert.ok(rs.every((r) => r.body.result.lan === rs[0].body.result.lan));
  const diff = await mkc({ tool: 'ghi', args: { ten: 'bia' }, requestId: rid });
  assert.equal(diff.status, 409); assert.equal(diff.body.error.code, 'request_mismatch');
  assert.equal(runs - before, 1);
});

test('kho kết quả: lỗi thì không nhớ (cho phép thử lại); đầy thì từ chối', async () => {
  const s = createResultStore({ max: 2 });
  let n = 0;
  await assert.rejects(s.once('a', 'f', async () => { n++; throw new Error('x'); }));
  assert.equal(await s.once('a', 'f', async () => { n++; return 'ok'; }), 'ok');
  assert.equal(n, 2);
  await s.once('b', 'f', async () => 1);
  await assert.rejects(s.once('c', 'f', async () => 2), (e) => e.status === 503);
});

test('validateArgs: enum, độ dài, mẫu, mảng, lồng nhau', () => {
  const schema = { type: 'object', properties: { a: { type: 'string', enum: ['x', 'y'] }, b: { type: 'string', maxLength: 3 }, c: { type: 'array', items: { type: 'integer' }, maxItems: 2 }, d: { type: 'object', properties: { e: { type: 'boolean' } }, required: ['e'] } }, required: ['a'] };
  assert.deepEqual(validateArgs(schema, { a: 'x' }), []);
  assert.ok(validateArgs(schema, {}).length);
  assert.ok(validateArgs(schema, { a: 'z' }).length);
  assert.ok(validateArgs(schema, { a: 'x', b: 'dài quá' }).length);
  assert.ok(validateArgs(schema, { a: 'x', c: [1, 2, 3] }).length);
  assert.ok(validateArgs(schema, { a: 'x', c: ['1'] }).length);
  assert.ok(validateArgs(schema, { a: 'x', d: {} }).length);
  assert.ok(validateArgs(schema, { a: 'x', zzz: 1 }).length, 'thuộc tính lạ');
  assert.ok(validateArgs(schema, [1]).length);
  assert.ok(validateArgs({ type: 'string', pattern: '^a+$' }, 'abc', 'v').length);
});

test('defineTool: từ chối khai báo sai ngay lúc khởi động', () => {
  const ok = { name: 'abc', description: 'Mô tả đủ dài cho mô hình.', readOnly: true, run: async () => 1 };
  assert.ok(defineTool(ok));
  assert.throws(() => defineTool({ ...ok, name: 'Abc' }), /tên/);
  assert.throws(() => defineTool({ ...ok, description: 'ngắn' }), /description/);
  assert.throws(() => defineTool({ ...ok, readOnly: undefined }), /readOnly/);
  assert.throws(() => defineTool({ ...ok, readOnly: false }), /summaryTemplate|preview/);
  assert.throws(() => defineTool({ ...ok, readOnly: false, confirm: false, summaryTemplate: 'x' }), /confirm:true/);
  assert.throws(() => defineTool({ ...ok, parameters: { type: 'object', properties: { a: { type: 'khong' } } } }), /type/);
  assert.throws(() => defineTool({ ...ok, parameters: { type: 'object', properties: {}, required: ['x'] } }), /required/);
  assert.throws(() => createOsinApi({ appId: 'ab', keys: { osin: 'ngan' }, tools: [] }), /quá ngắn/);
  assert.throws(() => createOsinApi({ appId: 'AB', keys: { osin: SECRET }, tools: [] }), /appId/);
});

test('node:http thật: handle() đọc thân, giới hạn kích thước, chặn đường dẫn lạ', async () => {
  const api = mk();
  const server = http.createServer((req, res) => (api.matches(req.url) ? api.handle(req, res) : (res.writeHead(404), res.end())));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const ts = Math.floor(Date.now() / 1000); const nonce = crypto.randomBytes(16).toString('base64url');
    const body = JSON.stringify(callBody({ args: { n: 2 } }, ts, nonce));
    const headers = { 'content-type': 'application/json', ...signRequest({ keyId: 'osin', secret: SECRET, method: 'POST', pathWithQuery: PREFIX + '/call', body, ts, nonce }) };
    const r = await fetch(`http://127.0.0.1:${port}${PREFIX}/call`, { method: 'POST', headers, body });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).result.n, 2);
    const big = await fetch(`http://127.0.0.1:${port}${PREFIX}/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(100 * 1024) });
    assert.equal(big.status, 413);
    const nf = await fetch(`http://127.0.0.1:${port}${PREFIX}/khac`, { method: 'POST', body: '{}' });
    assert.equal(nf.status, 404);
    const gm = await fetch(`http://127.0.0.1:${port}${PREFIX}/call`);
    assert.equal(gm.status, 405);
  } finally { server.closeAllConnections?.(); server.close(); }
});

test('authorize: chạy ở cả preview lẫn execute và công cụ đọc; từ chối thì run không bao giờ được gọi', async () => {
  let ran = 0;
  const api = createOsinApi({
    appId: 'demo', prefix: PREFIX, keys: { osin: SECRET }, receipt: false,
    tools: [
      { name: 'ghi_gd', description: 'Ghi dữ liệu của gia đình, chỉ thành viên mới được.', readOnly: false, summaryTemplate: 'Ghi', authorize: (_a, c) => { if (c.familyId !== 'f-dung') throw Object.assign(new Error('Bạn không thuộc gia đình này'), { osinCode: 'forbidden' }); }, run: async () => { ran++; return { message: 'ok' }; } },
      { name: 'doc_gd', description: 'Đọc dữ liệu của gia đình, chỉ thành viên mới được.', readOnly: true, authorize: (_a, c) => { if (c.familyId !== 'f-dung') throw Object.assign(new Error('Bạn không thuộc gia đình này'), { osinCode: 'forbidden' }); }, run: async () => { ran++; return {}; } },
    ],
  });
  const ts = Math.floor(Date.now() / 1000);
  const call = (o) => { const nonce = crypto.randomBytes(16).toString('base64url'); return signed(api, { ts, nonce, body: callBody(o, ts, nonce) }); };
  for (const mode of ['preview', 'execute']) {
    for (const tool of ['ghi_gd', 'doc_gd']) {
      const bad = await call({ tool, mode, familyId: 'f-la' });
      assert.equal(bad.body.error.code, 'forbidden', `${tool} ${mode}`);
      assert.equal((await call({ tool, mode })).body.error.code, 'forbidden', 'thiếu familyId cũng bị từ chối');
    }
  }
  assert.equal(ran, 0);
  assert.equal((await call({ tool: 'ghi_gd', mode: 'preview', familyId: 'f-dung' })).body.ok, true);
  assert.equal((await call({ tool: 'ghi_gd', familyId: 'f-dung' })).body.ok, true);
  assert.equal(ran, 1);
});
