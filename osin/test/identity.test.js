// Danh tính 9id (luồng authorize/exchange/session-valid): ký HMAC đúng spec 9id mục 7, 429 khác sập, giới hạn đồng thời, mã dùng một lần. Không cần CSDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createIdIdentity, createMockIdentity } from '../src/identity.js';
import { ApiError } from '../src/errors.js';

const SECRET = 'id-internal-secret-0123456789abcdef0123456789';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const CB = 'https://osin.9app.tech/auth/callback';

async function fakeId({ codes = {}, sessions = {}, families = {}, status = null } = {}) {
  const seenNonces = new Set(); const log = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const h = req.headers;
      const want = crypto.createHmac('sha256', SECRET).update(`${h['x-9id-ts']}\n${h['x-9id-nonce']}\n${req.method}\n${req.url}\n${sha256(body)}`).digest('hex');
      const send = (st, j) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (h['x-9id-key'] !== 'osin' || h['x-9id-sig'] !== want) return send(401, { error: { code: 'unauthorized' } });
      if (Math.abs(Date.now() / 1000 - Number(h['x-9id-ts'])) > 120 || seenNonces.has(h['x-9id-nonce']) || !/^[A-Za-z0-9_-]{16,64}$/.test(h['x-9id-nonce'])) return send(401, { error: { code: 'unauthorized' } });
      seenNonces.add(h['x-9id-nonce']);
      log.push(`${req.method} ${req.url}`);
      if (status) return send(status.code, status.body || {});
      if (req.url === '/id/internal/v1/exchange' && req.method === 'POST') {
        const b = JSON.parse(body);
        const u = codes[b.code]; delete codes[b.code]; // mã dùng một lần
        return u && b.client === 'osin' && b.redirect_uri === CB ? send(200, u) : send(400, { error: { code: 'invalid_code' } });
      }
      if (req.url === '/id/internal/v1/session-valid' && req.method === 'POST') return send(200, { valid: sessions[JSON.parse(body).sessionId9id] === true });
      const m = req.url.match(/^\/id\/internal\/v1\/users\/([^/]+)\/families$/);
      if (m) return send(200, { families: families[decodeURIComponent(m[1])] || [], pendingInvitations: 0 });
      send(404, {});
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/id`, log, server, close: () => { server.closeAllConnections?.(); server.close(); } };
}
const U = { userId: 'b3c1d2e4-1111-4222-8333-444455556666', displayName: 'Lan‮ <b>', sessionId9id: 'sess-abc123' };

test('exchange: ký đúng chuẩn 9id, đổi mã lấy danh tính đã làm sạch; mã dùng một lần; mã sai/redirect sai trả null', async () => {
  const id = await fakeId({ codes: { 'ma-dung-0123456789': U, 'ma-redirect-sai-12': U } });
  try {
    const v = createIdIdentity({ url: id.url, keyId: 'osin', secret: SECRET });
    assert.equal(await v.exchange('ma-sai-0123456789', CB), null);
    assert.equal(await v.exchange('ma-redirect-sai-12', 'https://evil.example/cb'), null, 'redirect_uri khác thì 9id từ chối');
    const u = await v.exchange('ma-dung-0123456789', CB);
    assert.equal(u.userId, U.userId); assert.equal(u.sessionId9id, 'sess-abc123'); assert.ok(!u.displayName.includes('‮'));
    assert.equal(await v.exchange('ma-dung-0123456789', CB), null, 'dùng lại mã');
    assert.equal(await v.exchange('../x', CB), null, 'mã sai định dạng không gọi 9id');
    const bad = createIdIdentity({ url: id.url, keyId: 'osin', secret: 'sai-bi-mat-0123456789abcdef0123456789abcd' });
    assert.equal(await bad.exchange('ma-dung-0123456789', CB), null);
  } finally { id.close(); }
});

test('sessionValid: phiên còn/hết hạn; phản hồi lạ không được coi là hợp lệ', async () => {
  const id = await fakeId({ sessions: { 'sess-ok': true, 'sess-het': false } });
  try {
    const v = createIdIdentity({ url: id.url, keyId: 'osin', secret: SECRET });
    assert.equal(await v.sessionValid('sess-ok'), true);
    assert.equal(await v.sessionValid('sess-het'), false);
    assert.equal(await v.sessionValid('sess-khong-co'), false);
  } finally { id.close(); }
});

test('9id trả 429: báo "bận" (429 identity_busy), KHÔNG báo sập 503; sập/5xx/timeout mới là 503', async () => {
  const busy = await fakeId({ status: { code: 429 } });
  try {
    const v = createIdIdentity({ url: busy.url, keyId: 'osin', secret: SECRET });
    await assert.rejects(v.sessionValid('sess-ok'), (e) => e instanceof ApiError && e.status === 429 && e.code === 'identity_busy');
    await assert.rejects(v.exchange('ma-dung-0123456789', CB), (e) => e.status === 429);
  } finally { busy.close(); }
  const dead = createIdIdentity({ url: 'http://127.0.0.1:9/id', keyId: 'osin', secret: SECRET, timeoutMs: 300 });
  await assert.rejects(dead.sessionValid('sess-ok'), (e) => e.status === 503 && e.code === 'identity_unavailable');
  const slow = http.createServer(() => { /* treo */ });
  await new Promise((r) => slow.listen(0, '127.0.0.1', r));
  try {
    const v = createIdIdentity({ url: `http://127.0.0.1:${slow.address().port}/id`, keyId: 'osin', secret: SECRET, timeoutMs: 200 });
    const t0 = Date.now();
    await assert.rejects(v.sessionValid('sess-ok'), (e) => e.status === 503);
    assert.ok(Date.now() - t0 < 1500);
  } finally { slow.closeAllConnections?.(); slow.close(); }
  const five = await fakeId({ status: { code: 500 } });
  try { await assert.rejects(createIdIdentity({ url: five.url, keyId: 'osin', secret: SECRET }).sessionValid('s'), (e) => e.status === 503); } finally { five.close(); }
});

test('giới hạn đồng thời khi gọi 9id: vượt ngưỡng thì từ chối nhanh bằng 429, không đẩy 9id tới sập', async () => {
  let inflightMax = 0; let cur = 0;
  const slow = http.createServer((req, res) => { cur++; inflightMax = Math.max(inflightMax, cur); setTimeout(() => { cur--; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"valid":true}'); }, 200); });
  await new Promise((r) => slow.listen(0, '127.0.0.1', r));
  try {
    const v = createIdIdentity({ url: `http://127.0.0.1:${slow.address().port}/id`, keyId: 'osin', secret: SECRET, maxInflight: 3 });
    const rs = await Promise.allSettled(Array.from({ length: 10 }, () => v.sessionValid('sess-ok')));
    assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 3);
    assert.equal(rs.filter((r) => r.status === 'rejected' && r.reason.status === 429).length, 7);
    assert.ok(inflightMax <= 3);
    assert.equal(await v.sessionValid('sess-ok'), true, 'hết tải thì dùng lại được');
  } finally { slow.closeAllConnections?.(); slow.close(); }
});

test('9id trả dữ liệu lạ: userId sai định dạng hoặc thiếu sessionId9id bị bỏ; không theo chuyển hướng', async () => {
  const id = await fakeId({ codes: { 'ma-1-0123456789': { userId: '../../x', displayName: 'Lan', sessionId9id: 's1' }, 'ma-2-0123456789': { userId: 'u1', displayName: 'Lan' } } });
  try {
    const v = createIdIdentity({ url: id.url, keyId: 'osin', secret: SECRET });
    assert.equal(await v.exchange('ma-1-0123456789', CB), null);
    assert.equal(await v.exchange('ma-2-0123456789', CB), null);
  } finally { id.close(); }
  const redir = http.createServer((_q, res) => { res.writeHead(302, { location: 'http://127.0.0.1:1/x' }); res.end(); });
  await new Promise((r) => redir.listen(0, '127.0.0.1', r));
  try {
    const v = createIdIdentity({ url: `http://127.0.0.1:${redir.address().port}/id`, keyId: 'osin', secret: SECRET });
    await assert.rejects(v.sessionValid('s'), (e) => e.status === 503);
  } finally { redir.close(); }
});

test('families: danh sách gia đình lấy qua API nội bộ, đệm 60 giây, lỗi thì rỗng, dữ liệu lạ bị lọc', async () => {
  const id = await fakeId({ families: { u1: [{ id: 'f1', name: 'Nhà Lan', role: 'chu', memberCount: 3 }, { id: '../bad', name: 'x' }, { name: 'thiếu id' }] } });
  try {
    const v = createIdIdentity({ url: id.url, keyId: 'osin', secret: SECRET });
    assert.deepEqual(await v.families('u1'), [{ id: 'f1', name: 'Nhà Lan', role: 'chu' }]);
    await v.families('u1');
    assert.equal(id.log.filter((x) => x.includes('/families')).length, 1);
    assert.deepEqual(await v.families('u-khong-co'), []);
    assert.deepEqual(await v.families('../etc'), []);
  } finally { id.close(); }
  assert.deepEqual(await createIdIdentity({ url: 'http://127.0.0.1:9/id', keyId: 'osin', secret: SECRET, timeoutMs: 200 }).families('u1'), []);
});

test('mock: mã dùng một lần, redirect phải khớp, đăng xuất phía 9id làm sessionValid=false', async () => {
  const m = createMockIdentity();
  const code = m.register({ userId: 'u1', displayName: 'A', families: [{ id: 'f', name: 'N', role: 'chu' }], redirectUri: CB });
  assert.equal(await m.exchange(code, 'https://khac/cb'), null);
  const u = await m.exchange(code, CB);
  assert.equal(u, null, 'mã đã bị đốt sau lần thử redirect sai (an toàn)');
  const code2 = m.register({ userId: 'u1', displayName: 'A', redirectUri: CB });
  const u2 = await m.exchange(code2, CB);
  assert.equal(await m.sessionValid(u2.sessionId9id), true);
  m.revokeSession(u2.sessionId9id);
  assert.equal(await m.sessionValid(u2.sessionId9id), false);
  assert.equal(await m.exchange('code-gia-mao', CB), null);
});

test('9id trả 200 nhưng không phải JSON (trang của proxy): sessionValid/exchange báo 503, KHÔNG coi là phiên hết hạn', async () => {
  const html = http.createServer((_q, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>dang nhap</html>'); });
  await new Promise((r) => html.listen(0, '127.0.0.1', r));
  try {
    const v = createIdIdentity({ url: `http://127.0.0.1:${html.address().port}/id`, keyId: 'osin', secret: SECRET });
    await assert.rejects(v.sessionValid('sess-ok'), (e) => e.status === 503);
    await assert.rejects(v.exchange('ma-dung-0123456789', CB), (e) => e.status === 503);
  } finally { html.closeAllConnections?.(); html.close(); }
});

test('sessionEnd: gọi POST /internal/v1/session-end ký đúng; lỗi 9id bị nuốt', async () => {
  const id = await fakeId({});
  try {
    const v = createIdIdentity({ url: id.url, keyId: 'osin', secret: SECRET });
    await v.sessionEnd('sess-ok');
    assert.ok(id.log.includes('POST /id/internal/v1/session-end'), id.log.join());
  } finally { id.close(); }
  const down = createIdIdentity({ url: 'http://127.0.0.1:1/id', keyId: 'osin', secret: SECRET, timeoutMs: 300 });
  await assert.doesNotReject(down.sessionEnd('sess-ok'));
});
