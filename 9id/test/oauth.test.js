// Cấp phiên cho app ở tên miền con riêng (osin.9app.tech) bằng mã dùng một lần
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, shutdown, Client, ok, signup, PASS, query, config, util, base, origin, internal, tokenOf } from './helper.js';
const { createNineId } = await import('../client/nine-id.js');
const { productionProblems, parseClients } = await import('../src/config.js');

before(async () => { await boot(); });
after(shutdown);

const withConfig = async (patch, fn) => {
  const old = {};
  for (const k of Object.keys(patch)) { old[k] = config[k]; config[k] = patch[k]; }
  try { return await fn(); } finally { Object.assign(config, old); }
};
const CB = 'https://osin.9app.tech/auth/callback';
const STATE = 'trang-thai-ngau-nhien-0123456789';
const authz = (client, qs = {}) => {
  const p = new URLSearchParams({ client: 'osin', redirect_uri: CB, state: STATE, ...qs });
  for (const k of Object.keys(qs)) if (qs[k] === undefined) p.delete(k);
  return '/authorize?' + p.toString();
};
const hit = (c, path) => fetch(base + path, { redirect: 'manual', headers: c && c.cookie ? { cookie: c.cookie } : {} });
const codeOf = (loc) => new URL(loc).searchParams.get('code');
async function getCode(c, qs) {
  await ok(c.post('/api/oauth/consent', { client: 'osin' }));
  const r = await hit(c, authz('osin', qs));
  assert.equal(r.status, 302);
  return codeOf(r.headers.get('location'));
}
const exchange = (code, extra = {}, kid = 'osin') => internal(kid, 'POST', '/internal/v1/exchange', { code, client: 'osin', redirect_uri: CB, ...extra });

test('authorize: chỉ nhận client + redirect_uri khớp CHÍNH XÁC; mọi biến thể lạ trả 400 và không bao giờ chuyển hướng', async () => {
  const a = await signup('Người dùng', {});
  const variants = [
    { redirect_uri: CB + '/' }, { redirect_uri: CB + '?x=1' }, { redirect_uri: CB + '#f' }, { redirect_uri: 'http://osin.9app.tech/auth/callback' },
    { redirect_uri: 'https://evil.com/auth/callback' }, { redirect_uri: 'https://osin.9app.tech.evil.com/auth/callback' }, { redirect_uri: 'https://evil.osin.9app.tech/auth/callback' },
    { redirect_uri: 'https://osin.9app.tech@evil.com/auth/callback' }, { redirect_uri: 'https://osin.9app.tech:8443/auth/callback' }, { redirect_uri: 'https://OSIN.9app.tech/auth/callback' },
    { redirect_uri: '//evil.com' }, { redirect_uri: '/auth/callback' }, { redirect_uri: 'javascript:alert(1)' }, { redirect_uri: '' }, { redirect_uri: undefined },
    { redirect_uri: 'https://osin.9app.tech/auth/callback\r\nSet-Cookie: x=1' }, { redirect_uri: 'https://osin.9app.tech/auth/callbackx' },
    { client: 'khac' }, { client: 'OSIN' }, { client: 'osin ' }, { client: '' }, { client: undefined },
    { state: undefined }, { state: '' }, { state: 'ngan' }, { state: 'có dấu và <script>' + 'x'.repeat(10) }, { state: 'a'.repeat(201) }, { state: 'a b c d e f g h' },
  ];
  for (const v of variants) {
    for (const who of [a, null]) { // cả khi đã đăng nhập lẫn chưa đăng nhập
      const r = await hit(who, authz('osin', v));
      assert.equal(r.status, 400, JSON.stringify(v) + ' -> ' + r.status);
      assert.equal(r.headers.get('location'), null, 'không được có Location: ' + JSON.stringify(v));
    }
  }
  const dup = await hit(a, `/authorize?client=osin&redirect_uri=${encodeURIComponent('https://evil.com/x')}&redirect_uri=${encodeURIComponent(CB)}&state=${STATE}`);
  assert.ok(dup.status === 400 || (dup.headers.get('location') || '').startsWith(CB) || dup.status === 302, 'tham số lặp không dẫn tới địa chỉ lạ');
  if (dup.status === 302) assert.ok((dup.headers.get('location') || '').startsWith('https://osin.9app.tech/') || (dup.headers.get('location') || '').startsWith('/id/'));
});

test('authorize: chưa đăng nhập thì chuyển qua đăng nhập (next an toàn) rồi quay lại; lần đầu cần bấm Cho phép', async () => {
  const anon = await hit(null, authz('osin'));
  assert.equal(anon.status, 302);
  const loc = anon.headers.get('location');
  assert.ok(loc.startsWith('/id/?next=') && loc.endsWith('#/dang-nhap'), loc);
  const next = decodeURIComponent(loc.slice('/id/?next='.length, loc.indexOf('#')));
  assert.equal(util.safeNext(next), next, 'next hợp lệ cùng nguồn gốc');
  assert.ok(next.startsWith('/id/authorize?') && next.includes('client=osin') && next.includes('state=' + STATE));
  // đăng nhập xong gọi lại đúng địa chỉ next
  const a = await signup('Lần đầu', {});
  const c1 = await hit(a, next.replace('/id', ''));
  assert.equal(c1.status, 302);
  assert.ok(c1.headers.get('location').endsWith('#/cho-phep'), 'chưa đồng ý thì sang màn Cho phép: ' + c1.headers.get('location'));
  assert.equal((await new Client('x').post('/api/oauth/consent', { client: 'osin' })).status, 401);
  assert.equal((await a.post('/api/oauth/consent', { client: 'khac' })).status, 404);
  const info = await ok(a.get('/api/oauth/client?client=osin'));
  assert.equal(info.name, 'Osin'); assert.deepEqual(info.hosts, ['osin.9app.tech']); assert.equal(info.consented, false);
  await ok(a.post('/api/oauth/consent', { client: 'osin' }));
  const c2 = await hit(a, next.replace('/id', ''));
  assert.equal(c2.status, 302);
  const to = new URL(c2.headers.get('location'));
  assert.equal(to.origin + to.pathname, CB); assert.equal(to.searchParams.get('state'), STATE);
  assert.match(to.searchParams.get('code'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(c2.headers.get('cache-control'), 'no-store'); assert.equal(c2.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await ok(a.get('/api/oauth/grants'))).grants[0].client, 'osin');
  // tắt yêu cầu đồng ý: cấp mã ngay
  await withConfig({ oauthRequireConsent: false }, async () => {
    const b = await signup('Không cần đồng ý', {});
    assert.equal((await hit(b, authz('osin'))).status, 302);
    assert.ok((await hit(b, authz('osin'))).headers.get('location').startsWith(CB));
  });
});

test('mã: 256 bit, chỉ lưu băm, hạn 60 giây, gắn client + redirect_uri + người dùng + state', async () => {
  const a = await signup('Mã', {});
  const code = await getCode(a);
  const rows = await query('SELECT * FROM auth_codes');
  const row = rows.find((r) => r.code_hash === util.sha256hex(code));
  assert.ok(row, 'lưu băm'); assert.ok(!JSON.stringify(rows).includes(code), 'không lưu mã thô');
  assert.equal(row.client, 'osin'); assert.equal(row.redirect_uri, CB); assert.equal(row.user_id, a.user.id); assert.equal(row.state, STATE);
  const ttl = (await query('SELECT extract(epoch FROM (expires_at - created_at))::int AS s FROM auth_codes WHERE code_hash=$1', [row.code_hash]))[0].s;
  assert.equal(ttl, 60);
  assert.equal(Buffer.from(code, 'base64url').length, 32);
  assert.notEqual(await getCode(a), code);
});

test('exchange: đổi mã lấy phiên một lần; dùng lại, hết hạn, sai client/redirect, sai chữ ký đều bị từ chối', async () => {
  const a = await signup('Đổi mã', {});
  const code = await getCode(a);
  // sai redirect / sai client: không đốt mã
  assert.equal((await exchange(code, { redirect_uri: CB + '/' })).status, 400);
  assert.equal((await exchange(code, { redirect_uri: 'https://evil.com/auth/callback' })).status, 400);
  assert.equal((await exchange(code, { client: 'family' })).status, 403, 'client khác với khóa HMAC');
  assert.equal((await exchange(code, {}, 'family')).status, 403, 'khóa của app khác không đổi được mã của osin');
  assert.equal((await exchange(code, { client: 'khac' })).status, 403);
  assert.equal((await internal('osin', 'POST', '/internal/v1/exchange', { code, client: 'osin', redirect_uri: CB }, { secret: 'sai-sai-sai-sai-sai-sai-sai-sai-sai' })).status, 401);
  assert.equal((await fetch(origin + '/id/internal/v1/exchange', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, client: 'osin', redirect_uri: CB }) })).status, 401);
  const r = await exchange(code);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['displayName', 'sessionId9id', 'userId']);
  assert.equal(r.json.userId, a.user.id); assert.equal(r.json.displayName, 'Đổi mã');
  assert.ok(!r.text.includes(a.phone.slice(1)) && !r.text.includes('+84'));
  // dùng lại
  const again = await exchange(code);
  assert.equal(again.status, 400); assert.equal(again.json.error.code, 'invalid_grant');
  // mã bậy
  for (const bad of ['', 'x', 'A'.repeat(43), null, 5, { a: 1 }, ['x']]) assert.equal((await exchange(bad)).status, 400, JSON.stringify(bad));
  // hết hạn
  const c2 = await getCode(a);
  await query("UPDATE auth_codes SET expires_at = now() - interval '1 second' WHERE code_hash=$1", [util.sha256hex(c2)]);
  assert.equal((await exchange(c2)).status, 400);
  // đua song song: chỉ một lần thắng
  const c3 = await getCode(a);
  const rs = await Promise.all(Array.from({ length: 6 }, () => exchange(c3)));
  assert.equal(rs.filter((x) => x.status === 200).length, 1, rs.map((x) => x.status).join());
  assert.equal((await query('SELECT count(*)::int AS n FROM app_sessions WHERE user_id=$1', [a.user.id]))[0].n, 2);
  // replay chữ ký
  const c4 = await getCode(a);
  const first = await exchange(c4);
  const replay = await internal('osin', 'POST', '/internal/v1/exchange', { code: c4, client: 'osin', redirect_uri: CB }, { nonce: first.nonce, ts: first.ts });
  assert.equal(replay.status, 401);
});

test('đăng xuất ở 9id giữa chừng thì mã chưa đổi trở nên vô hiệu', async () => {
  const a = await signup('Thoát giữa chừng', {});
  const code = await getCode(a);
  await ok(a.post('/api/logout'));
  assert.equal((await exchange(code)).status, 400);
});

test('session-valid: phiên con còn hiệu lực cho tới khi mất phiên 9id cha, đổi mật khẩu, đăng xuất tất cả, thu hồi quyền, hết hạn, xóa tài khoản', async () => {
  const valid = async (id, kid = 'osin') => (await internal(kid, 'POST', '/internal/v1/session-valid', { sessionId9id: id })).json;
  const make = async (user) => (await exchange(await getCode(user))).json.sessionId9id;
  const a = await signup('Phiên con', {});
  const s1 = await make(a);
  const v = await valid(s1);
  assert.equal(v.valid, true); assert.equal(v.userId, a.user.id);
  // client khác không kiểm được phiên của osin
  assert.equal((await valid(s1, 'family')).valid, false);
  for (const bad of [undefined, '', 'x', null, 5, {}, '00000000-0000-4000-8000-000000000000']) assert.equal((await valid(bad)).valid, false);
  assert.equal((await internal('osin', 'POST', '/internal/v1/session-valid', {}, { secret: 'sai-sai-sai-sai-sai-sai-sai-sai-sai' })).status, 401);
  // đăng xuất phiên 9id cha
  await ok(a.post('/api/logout'));
  assert.equal((await valid(s1)).valid, false, 'đăng xuất ở 9id thì phiên con mất');
  // đổi mật khẩu (phiên đang dùng vẫn còn, nhưng phiên con bị thu hồi)
  const b = new Client('b', undefined); await ok(b.post('/api/login', { phone: a.phone, password: PASS }));
  const s2 = await make(b);
  assert.equal((await valid(s2)).valid, true);
  await ok(b.post('/api/account/password', { currentPassword: PASS, newPassword: 'MatKhauMoi-1234' }));
  assert.equal((await valid(s2)).valid, false, 'đổi mật khẩu thu hồi phiên con');
  // đăng xuất tất cả
  const s3 = await make(b); assert.equal((await valid(s3)).valid, true);
  await ok(b.post('/api/logout-all'));
  assert.equal((await valid(s3)).valid, false);
  // thu hồi quyền của app, đăng xuất ở app
  const d = new Client('d'); await ok(d.post('/api/login', { phone: a.phone, password: 'MatKhauMoi-1234' }));
  const s4 = await make(d);
  assert.equal((await d.del('/api/oauth/grants/osin')).status, 200);
  assert.equal((await valid(s4)).valid, false, 'thu hồi quyền');
  assert.equal((await d.del('/api/oauth/grants/osin')).status, 404);
  const s5 = await make(d);
  await internal('osin', 'POST', '/internal/v1/session-end', { sessionId9id: s5 });
  assert.equal((await valid(s5)).valid, false);
  // hết hạn riêng của phiên con
  const s6 = await make(d);
  await query("UPDATE app_sessions SET expires_at = now() - interval '1 second' WHERE id=$1", [s6]);
  assert.equal((await valid(s6)).valid, false);
  // xóa tài khoản
  const s7 = await make(d);
  await ok(d.post('/api/account/delete', { password: 'MatKhauMoi-1234' }));
  assert.equal((await valid(s7)).valid, false);
});

test('đặt lại mật khẩu bằng OTP thu hồi phiên con', async () => {
  const { getTicket } = await import('./helper.js');
  const a = await signup('Quên MK', {});
  const sid = (await exchange(await getCode(a))).json.sessionId9id;
  const c = new Client('r');
  const v = await getTicket(c, a.phone, 'reset');
  await ok(c.post('/api/password/reset', { ticket: v.ticket, phone: a.phone, password: 'MoiHoanToan-77' }));
  assert.equal((await internal('osin', 'POST', '/internal/v1/session-valid', { sessionId9id: sid })).json.valid, false);
});

test('máy khách nine-id.js: exchange, sessionValid, sessionEnd', async () => {
  const a = await signup('Client', {});
  const id = createNineId({ baseUrl: origin + '/id', keyId: 'osin', secret: config.internalKeys.get('osin') });
  const s = await id.exchange(await getCode(a), 'osin', CB);
  assert.equal(s.userId, a.user.id);
  assert.equal((await id.sessionValid(s.sessionId9id)).valid, true);
  await id.sessionEnd(s.sessionId9id);
  assert.equal((await id.sessionValid(s.sessionId9id)).valid, false);
  await assert.rejects(id.exchange('A'.repeat(43), 'osin', CB), (e) => e.code === 'invalid_grant');
});

test('cấu hình: client phải có khóa HMAC, redirect_uri phải https, không wildcard, không #; parse danh sách', async () => {
  assert.deepEqual([...parseClients('osin=https://a.example/cb, https://a.example/cb2;x=https://b.example/c;;bad;=zzz').get('osin')], ['https://a.example/cb', 'https://a.example/cb2']);
  assert.equal(parseClients('Osin=https://a/cb').size, 0);
  const good = {
    production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://id:s3cretRealPw@9ship-db:5432/id', phonePepper: 'k8Q2xv7Lw9Zr4Tn1Bm6Yc3Hd5Fs0Ja8Pe2Uo', phonePepperFromEnv: true, phonePepperOld: '',
    otpProvider: 'esms', esmsApiKey: 'k', esmsSecret: 's', esmsBrandname: 'B', esmsZaloOa: '', esmsZaloTemp: '', consoleApiKeyId: '', consoleApiSecret: '', trustedProxyHops: 1, edgeSecret: 'Zq8Lm2Xv5Rt9Bn4Kc7Wd1Hj6Ps3Fy0Ae',
    internalKeys: new Map([['osin', 'abcdefghijklmnopqrstuvwxyz0123456789ABC']]), oauthClients: parseClients('osin=https://osin.9app.tech/auth/callback'),
  };
  assert.deepEqual(productionProblems(good), []);
  const has = (o, re) => productionProblems({ ...good, ...o }).some((x) => re.test(x));
  assert.ok(has({ oauthClients: parseClients('osin=http://osin.9app.tech/cb') }, /https/));
  assert.ok(has({ oauthClients: parseClients('osin=https://*.9app.tech/cb') }, /ký tự đại diện/));
  assert.ok(has({ oauthClients: parseClients('osin=https://osin.9app.tech/cb#x') }, /#/));
  assert.ok(has({ oauthClients: parseClients('khac=https://k.9app.tech/cb') }, /INTERNAL_KEYS/));
});
