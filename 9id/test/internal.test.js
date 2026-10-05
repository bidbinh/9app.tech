import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, shutdown, Client, ok, newPhone, signup, PASS, query, config, util, makeFamily, inviteAndAccept, internal, tokenOf, origin, signInternal } from './helper.js';
import { createNineId, NineIdError } from '../client/nine-id.js';

before(async () => { await boot(); });
after(shutdown);

const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};

async function sample() {
  const O = await signup('Bố', {}); const M = await signup('Mẹ', {}); const K = await signup('Con', {});
  const fid = await makeFamily(O, 'Nhà API');
  await inviteAndAccept(O, fid, M, 'quan_ly');
  const kid = (await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé API', birthYear: 2015, note: 'ghi chú kín', phone: K.phone }))).child.id;
  await ok(O.post(`/api/families/${fid}/children`, { name: 'Bé Hai', birthYear: 2018 }));
  await ok(K.post(`/api/invitations/${(await ok(K.get('/api/invitations'))).invitations[0].id}/accept`));
  return { O, M, K, fid, kid };
}

test('verify: cookie nine_sid -> userId + tên, KHÔNG có số điện thoại; phoneLast4 chỉ khi key được phép và yêu cầu', async () => {
  const a = await signup('Lan Anh', {});
  const r = await internal('family', 'POST', '/internal/v1/verify', { token: tokenOf(a) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { userId: a.user.id, displayName: 'Lan Anh' });
  assert.ok(!r.text.includes(a.phone.slice(1)) && !r.text.includes('+84'));
  const r2 = await internal('family', 'POST', '/internal/v1/verify', { token: tokenOf(a), fields: ['phoneLast4'] });
  assert.equal(r2.json.phoneLast4, a.phone.slice(-4)); assert.ok(!r2.text.includes(a.phone.slice(1, -4)));
  const r3 = await internal('fin', 'POST', '/internal/v1/verify', { token: tokenOf(a), fields: ['phoneLast4'] });
  assert.equal(r3.json.phoneLast4, undefined, 'key không được phép thì không có');
  // phiên không hợp lệ
  for (const token of [undefined, '', 'abc', 'A'.repeat(43), 'A'.repeat(500), 123, null, { a: 1 }]) {
    const x = await internal('family', 'POST', '/internal/v1/verify', { token });
    assert.equal(x.status, 401, JSON.stringify(token)); assert.equal(x.json.error.code, 'invalid_session');
  }
  // đăng xuất thì verify thất bại ngay
  await a.post('/api/logout');
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', { token: tokenOf({ cookie: 'nine_sid=' + 'A'.repeat(43) }) })).status, 401);
});

test('verify gia hạn phiên trượt và bỏ qua phiên quá 90 ngày', async () => {
  const a = await signup('Trượt', {});
  const h = util.sha256hex(tokenOf(a));
  await query("UPDATE sessions SET last_used_at = now() - interval '30 days' WHERE token_hash=$1", [h]);
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', { token: tokenOf(a) })).status, 200);
  assert.equal((await query("SELECT last_used_at > now() - interval '1 minute' AS f FROM sessions WHERE token_hash=$1", [h]))[0].f, true);
  await query("UPDATE sessions SET last_used_at = now() - interval '91 days' WHERE token_hash=$1", [h]);
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', { token: tokenOf(a) })).status, 401);
});

test('HMAC: thiếu header, sai khóa, sai chữ ký, sửa nội dung/đường dẫn/query, đồng hồ lệch đều 401', async () => {
  const a = await signup('HMAC', {});
  const body = { token: tokenOf(a) };
  const noAuth = await fetch(origin + '/id/internal/v1/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(noAuth.status, 401);
  assert.equal((await internal('khong-co', 'POST', '/internal/v1/verify', body, { secret: 'x'.repeat(40) })).status, 401);
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', body, { secret: 'secret-sai-secret-sai-secret-sai-123' })).status, 401);
  // dùng secret của app khác
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', body, { secret: config.internalKeys.get('fin') })).status, 401);
  // đồng hồ lệch
  const old = String(Math.floor(Date.now() / 1000) - 600);
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', body, { ts: old })).status, 401);
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', body, { ts: String(Math.floor(Date.now() / 1000) + 600) })).status, 401);
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', body, { ts: 'abc' })).status, 401);
  assert.equal((await internal('family', 'POST', '/internal/v1/verify', body, { nonce: 'ngan' })).status, 401, 'nonce quá ngắn');
  // chữ ký đúng cho nội dung khác -> 401
  const secret = config.internalKeys.get('family');
  const ts = String(Math.floor(Date.now() / 1000)); const nonce = crypto.randomBytes(12).toString('hex');
  const sigForOther = signInternal(secret, ts, nonce, 'POST', '/id/internal/v1/verify', JSON.stringify({ token: 'khac' }));
  const tamper = await fetch(origin + '/id/internal/v1/verify', { method: 'POST', headers: { 'x-9id-key': 'family', 'x-9id-ts': ts, 'x-9id-nonce': nonce, 'x-9id-sig': sigForOther, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(tamper.status, 401);
  // chữ ký GET cho đường dẫn này nhưng gọi đường dẫn khác / query khác
  const O = await signup('O', {}); const fid = await makeFamily(O, 'X');
  const n2 = crypto.randomBytes(12).toString('hex');
  const sig = signInternal(secret, ts, n2, 'GET', `/id/internal/v1/families/${fid}/members?as=${O.user.id}`, '');
  const other = await signup('Khác', {});
  const forged = await fetch(`${origin}/id/internal/v1/families/${fid}/members?as=${other.user.id}`, { headers: { 'x-9id-key': 'family', 'x-9id-ts': ts, 'x-9id-nonce': n2, 'x-9id-sig': sig } });
  assert.equal(forged.status, 401, 'đổi tham số as sau khi ký');
  const good = await fetch(`${origin}/id/internal/v1/families/${fid}/members?as=${O.user.id}`, { headers: { 'x-9id-key': 'family', 'x-9id-ts': ts, 'x-9id-nonce': n2, 'x-9id-sig': sig } });
  assert.equal(good.status, 200);
  // phương thức khác với lúc ký
  const n3 = crypto.randomBytes(12).toString('hex');
  const sigGet = signInternal(secret, ts, n3, 'GET', '/id/internal/v1/verify', '');
  const wrongMethod = await fetch(`${origin}/id/internal/v1/verify`, { method: 'POST', headers: { 'x-9id-key': 'family', 'x-9id-ts': ts, 'x-9id-nonce': n3, 'x-9id-sig': sigGet, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(wrongMethod.status, 401);
});

test('chống phát lại: cùng nonce dùng lại là 401; nonce lưu trong CSDL; nonce của chữ ký sai không làm đầy bảng', async () => {
  const a = await signup('Replay', {});
  const body = { token: tokenOf(a) };
  const r1 = await internal('family', 'POST', '/internal/v1/verify', body);
  assert.equal(r1.status, 200);
  const r2 = await internal('family', 'POST', '/internal/v1/verify', body, { nonce: r1.nonce, ts: r1.ts });
  assert.equal(r2.status, 401); assert.match(r2.json.error.message, /phát lại/);
  // cùng nonce nhưng khác key là hai nonce khác nhau (không đụng nhau)
  const r3 = await internal('fin', 'POST', '/internal/v1/verify', body, { nonce: r1.nonce });
  assert.equal(r3.status, 200);
  assert.equal((await query('SELECT count(*)::int AS n FROM internal_nonces WHERE kid=$1 AND nonce=$2', ['family', r1.nonce]))[0].n, 1);
  const before = (await query('SELECT count(*)::int AS n FROM internal_nonces'))[0].n;
  for (let i = 0; i < 5; i++) await internal('family', 'POST', '/internal/v1/verify', body, { secret: 'sai-sai-sai-sai-sai-sai-sai-sai-sai' });
  assert.equal((await query('SELECT count(*)::int AS n FROM internal_nonces'))[0].n, before);
  // phát lại đồng thời: đúng một yêu cầu thắng
  const nonce = crypto.randomBytes(12).toString('hex');
  const rs = await Promise.all(Array.from({ length: 6 }, () => internal('family', 'POST', '/internal/v1/verify', body, { nonce })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join());
});

test('API nội bộ tắt khi không có khóa; không phục vụ như tệp tĩnh; không cần cookie/CSRF của trình duyệt', async () => {
  await withConfig({ internalKeys: new Map() }, async () => {
    assert.equal((await internal('family', 'POST', '/internal/v1/verify', { token: 'x' }, { secret: 'y'.repeat(40) })).status, 404);
  });
  assert.equal((await fetch(origin + '/id/internal/v1/verify')).status, 405);
  assert.equal((await fetch(origin + '/id/internal/v1/users/x/families')).status, 401);
  // trình duyệt có cookie nhưng không có chữ ký không dùng được
  const a = await signup('Cookie', {});
  const r = await fetch(origin + '/id/internal/v1/verify', { method: 'POST', headers: { cookie: a.cookie, 'x-requested-with': '9id', 'content-type': 'application/json' }, body: JSON.stringify({ token: tokenOf(a) }) });
  assert.equal(r.status, 401);
});

test('hạn mức theo key', async () => {
  await withConfig({ internalLimitPerMin: 3 }, async () => {
    const a = await signup('Limit', {});
    config.internalKeys.set('limita', 'limit-a-secret-0123456789abcdef-xyz-1'); config.internalKeys.set('limitb', 'limit-b-secret-0123456789abcdef-xyz-2');
    const st = [];
    for (let i = 0; i < 6; i++) st.push((await internal('limita', 'POST', '/internal/v1/verify', { token: tokenOf(a) })).status);
    assert.ok(st.includes(429), st.join());
    assert.equal((await internal('limitb', 'POST', '/internal/v1/verify', { token: tokenOf(a) })).status, 200, 'key khác không bị ảnh hưởng');
    config.internalKeys.delete('limita'); config.internalKeys.delete('limitb');
  });
});

test('families của người dùng, thành viên, hồ sơ con theo vai trò người xem; không có số điện thoại', async () => {
  const { O, M, K, fid, kid } = await sample();
  const fam = (await internal('family', 'GET', `/internal/v1/users/${O.user.id}/families`)).json;
  assert.equal(fam.families.length, 1); assert.deepEqual(fam.families[0], { id: fid, name: 'Nhà API', role: 'chu', memberCount: 3, childCount: 2 });
  assert.equal(fam.pendingInvitations, 0);
  const kf = (await internal('family', 'GET', `/internal/v1/users/${K.user.id}/families`)).json;
  assert.equal(kf.families[0].role, 'con'); assert.equal(kf.families[0].childCount, null);
  const mem = (await internal('family', 'GET', `/internal/v1/families/${fid}/members?as=${O.user.id}`)).json;
  assert.equal(mem.role, 'chu'); assert.deepEqual(mem.members.map((m) => m.role), ['chu', 'quan_ly', 'con']);
  assert.deepEqual(Object.keys(mem.members[0]).sort(), ['displayName', 'joinedAt', 'role', 'userId']);
  const ch = (await internal('family', 'GET', `/internal/v1/families/${fid}/children?as=${O.user.id}`)).json;
  assert.equal(ch.children.length, 2); assert.equal(ch.children.find((c) => c.id === kid).linkedUserId, K.user.id); assert.equal(ch.children.find((c) => c.id === kid).note, 'ghi chú kín');
  // con: chỉ thấy mình
  const ck = (await internal('family', 'GET', `/internal/v1/families/${fid}/children?as=${K.user.id}`)).json;
  assert.equal(ck.role, 'con'); assert.equal(ck.children.length, 1); assert.equal(ck.children[0].note, undefined);
  const mk = (await internal('family', 'GET', `/internal/v1/families/${fid}/members?as=${K.user.id}`)).json;
  assert.ok(mk.members.every((m) => m.role !== 'con' || m.userId === K.user.id));
  // không số điện thoại ở bất kỳ phản hồi nào
  const all = [fam, kf, mem, ch, ck, mk].map((x) => JSON.stringify(x)).join('');
  for (const p of [O.phone, M.phone, K.phone]) assert.ok(!all.includes(p.slice(1)) && !all.includes('+84'));
});

test('quyền theo gia đình: app chỉ đọc gia đình mà người dùng thuộc về (404 cho người ngoài, gia đình không tồn tại, uuid sai)', async () => {
  const { O, fid } = await sample();
  const X = await signup('Người ngoài', {});
  const ghost = '00000000-0000-4000-8000-000000000000';
  for (const kind of ['members', 'children']) {
    const real = await internal('family', 'GET', `/internal/v1/families/${fid}/${kind}?as=${X.user.id}`);
    const fake = await internal('family', 'GET', `/internal/v1/families/${ghost}/${kind}?as=${X.user.id}`);
    const nouser = await internal('family', 'GET', `/internal/v1/families/${fid}/${kind}?as=${ghost}`);
    assert.equal(real.status, 404); assert.equal(fake.status, 404); assert.equal(nouser.status, 404);
    assert.deepEqual(real.json, fake.json);
    assert.equal((await internal('family', 'GET', `/internal/v1/families/${fid}/${kind}`)).status, 404, 'thiếu as');
    assert.equal((await internal('family', 'GET', `/internal/v1/families/${fid}/${kind}?as=abc`)).status, 404);
    assert.equal((await internal('family', 'GET', `/internal/v1/families/xyz/${kind}?as=${O.user.id}`)).status, 404);
  }
  assert.equal((await internal('family', 'GET', `/internal/v1/users/${ghost}/families`)).status, 404);
  assert.equal((await internal('family', 'GET', '/internal/v1/users/abc/families')).status, 404);
  // người đã rời không còn đọc được
  const T = await signup('Rời', {}); await inviteAndAccept(O, fid, T);
  assert.equal((await internal('family', 'GET', `/internal/v1/families/${fid}/members?as=${T.user.id}`)).status, 200);
  await ok(T.post(`/api/families/${fid}/leave`));
  assert.equal((await internal('family', 'GET', `/internal/v1/families/${fid}/members?as=${T.user.id}`)).status, 404);
});

test('pendingInvitations cho app đẩy thông báo', async () => {
  const O = await signup('Mời', {}); const A = await signup('Được mời', {});
  const fid = await makeFamily(O, 'Nhà thông báo');
  await ok(O.post(`/api/families/${fid}/invites`, { phone: A.phone }));
  assert.equal((await internal('family', 'GET', `/internal/v1/users/${A.user.id}/families`)).json.pendingInvitations, 1);
});

test('máy khách client/nine-id.js: verify, gia đình, lỗi 404 và phiên sai trả null', async () => {
  const { O, fid } = await sample();
  const id = createNineId({ baseUrl: origin + '/id', keyId: 'family', secret: config.internalKeys.get('family') });
  const who = await id.verify(tokenOf(O));
  assert.equal(who.userId, O.user.id);
  assert.equal(await id.verify('A'.repeat(43)), null); assert.equal(await id.verify(''), null); assert.equal(await id.verify(undefined), null);
  assert.equal((await id.userFamilies(who.userId)).families[0].id, fid);
  assert.equal((await id.members(fid, who.userId)).role, 'chu');
  assert.equal((await id.children(fid, who.userId)).children.length, 2);
  const X = await signup('X', {});
  await assert.rejects(id.members(fid, X.user.id), (e) => e instanceof NineIdError && e.status === 404);
  const bad = createNineId({ baseUrl: origin + '/id', keyId: 'family', secret: 'sai-sai-sai-sai-sai-sai-sai-sai-sai' });
  await assert.rejects(bad.verify(tokenOf(O)), (e) => e.status === 401 && e.code === 'unauthorized', 'khóa sai không bị hiểu nhầm là phiên hết hạn');
});
