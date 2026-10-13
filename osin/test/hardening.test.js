// Phản biện lần 2 + tên miền riêng (cần CSDL): đăng nhập qua 9id, phiên Osin, Sec-Fetch/token giao diện, hạn mức xác nhận, biên nhận, readOnly được duyệt,
// chi tiết thẻ, thử lại không trùng thẻ, xóa lúc đang chạy, đồng ý có phiên bản, trần khai báo/token, nhật ký, tiêu đề bảo mật.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, onShutdown, Client, ok, identity, createMockProvider, createFakeApp, ApiError, config, db, base as _base, resetChatRate, resetBadCookies, sessionCookieName } from './helper.js';
import * as H from './helper.js';
import { signRequest } from '../sdk/osin-sdk.js';
import { userKey, resetBudgetWarnings } from '../src/usage.js';

let fam;
const llm = createMockProvider([]);
const saved = {};
const KEYS = ['sessionCheckMs', 'sessionStaleMs', 'confirmPerHour', 'userTokensPerDay', 'globalTokensPerDay', 'turnReserveTokens', 'newUserFactor', 'appsOrigin', 'cookieSecure', 'noTrainConfirmed', 'userMaxShare'];
before(async () => {
  for (const k of KEYS) saved[k] = config[k];
  fam = await createFakeApp();
  onShutdown(() => fam.close());
  await boot({ llm, apps: [fam.appConfig], extra: { appToolTimeoutMs: 500, appConfirmTimeoutMs: 1500, appManifestTimeoutMs: 500 } });
});
after(async () => { Object.assign(config, saved); await shutdown(); });
const reset = () => { Object.assign(config, saved); resetChatRate(); resetBadCookies(); identity.faults.sessionValid = null; };
const fresh = async (name, opts) => { const c = new Client(name, opts); await c.consent(); return c; };
const propose = async (c, args = { muc: 'sữa' }, tool = 'them_vao_danh_sach', cid) => {
  llm.reset([{ calls: [{ name: 'family__' + tool, args }] }, { text: 'Mình đã chuẩn bị, bạn bấm Xác nhận nhé.' }]);
  const r = await ok(c.chat('thêm giúp mình', cid));
  return { card: r.message.cards.find((x) => x.type === 'action'), message: r.message };
};
const sc = (r) => r.headers.getSetCookie();
const cbUrl = () => H.base + '/auth/callback';

/* ---------- đăng nhập qua 9id ---------- */
test('đăng nhập: /auth/login chuyển tới authorize của 9id kèm state ngẫu nhiên lưu cookie ngắn hạn; callback kiểm state, đổi mã, tạo phiên host-only', async () => {
  reset();
  const r = await fetch(H.base + '/auth/login', { redirect: 'manual' });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, config.idAuthorizeUrl);
  assert.equal(loc.searchParams.get('client'), 'osin');
  assert.equal(loc.searchParams.get('redirect_uri'), cbUrl());
  const state = loc.searchParams.get('state');
  assert.match(state, /^[A-Za-z0-9_-]{32}$/);
  const st = sc(r).find((x) => x.startsWith('osin_st='));
  assert.ok(st.startsWith('osin_st=' + state) && /HttpOnly/.test(st) && /SameSite=Lax/.test(st) && /Path=\//.test(st) && /Max-Age=600/.test(st) && !/Domain/i.test(st), st);
  const r2 = await fetch(H.base + '/auth/login', { redirect: 'manual' });
  assert.notEqual(new URL(r2.headers.get('location')).searchParams.get('state'), state, 'state ngẫu nhiên mỗi lần');

  const code = identity.register({ userId: 'u-login', displayName: 'Lan Đăng Nhập', redirectUri: cbUrl() });
  const cb = await fetch(`${cbUrl()}?code=${code}&state=${state}`, { redirect: 'manual', headers: { cookie: 'osin_st=' + state } });
  assert.equal(cb.status, 302); assert.equal(cb.headers.get('location'), '/');
  const cookies = sc(cb);
  const sess = cookies.find((x) => x.startsWith('osin_sid='));
  assert.ok(/HttpOnly/.test(sess) && /SameSite=Lax/.test(sess) && /Path=\//.test(sess) && /Max-Age=604800/.test(sess) && !/Domain/i.test(sess), sess);
  assert.ok(cookies.some((x) => x.startsWith('osin_st=;') || /osin_st=; .*Max-Age=0/.test(x)), 'cookie state bị xóa sau khi dùng');
  const token = decodeURIComponent(sess.split(';')[0].split('=')[1]);
  const me = await fetch(H.base + '/api/me', { headers: { cookie: 'osin_sid=' + token } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.displayName, 'Lan Đăng Nhập');
  const row = (await db.query("SELECT token_hash, session9id FROM osin_sessions WHERE user_id='u-login'"))[0];
  assert.ok(row.token_hash !== token && row.token_hash.length === 64, 'chỉ lưu băm');
  assert.match(row.session9id, /^sid-/);
});

test('callback từ chối: state sai/thiếu, mã sai hoặc đã dùng, 9id bận; không tạo phiên', async () => {
  reset();
  const before = (await db.query('SELECT count(*)::int AS n FROM osin_sessions'))[0].n;
  const go = async (query, cookie) => fetch(`${cbUrl()}?${query}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const code = identity.register({ userId: 'u-cb', displayName: 'A', redirectUri: cbUrl() });
  let r = await go(`code=${code}&state=abc`, 'osin_st=khac'); assert.equal(r.headers.get('location'), '/?loi=state');
  r = await go(`code=${code}&state=abc`); assert.equal(r.headers.get('location'), '/?loi=state', 'thiếu cookie state (CSRF đăng nhập)');
  r = await go(`code=${code}`, 'osin_st=abc'); assert.equal(r.headers.get('location'), '/?loi=state');
  r = await go(`state=abc`, 'osin_st=abc'); assert.equal(r.headers.get('location'), '/?loi=state');
  r = await go('code=ma-gia-mao-0123456789&state=abc', 'osin_st=abc'); assert.equal(r.headers.get('location'), '/?loi=ma');
  r = await go(`code=${code}&state=abc`, 'osin_st=abc'); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/');
  r = await go(`code=${code}&state=abc`, 'osin_st=abc'); assert.equal(r.headers.get('location'), '/?loi=ma', 'mã chỉ dùng một lần');
  const orig = identity.exchange; identity.exchange = async () => { throw new ApiError(429, 'identity_busy', 'bận'); };
  try { r = await go('code=ma-bat-ky-0123456789&state=abc', 'osin_st=abc'); assert.equal(r.headers.get('location'), '/?loi=ban'); } finally { identity.exchange = orig; }
  const after = (await db.query('SELECT count(*)::int AS n FROM osin_sessions'))[0].n;
  assert.equal(after, before + 1, 'chỉ đúng một phiên được tạo');
});

test('cookie phiên dùng tiền tố __Host- + Secure khi chạy HTTPS ở gốc; HSTS và các tiêu đề cô lập origin', async () => {
  reset();
  config.cookieSecure = true;
  try {
    const r = await fetch(H.base + '/auth/login', { redirect: 'manual' });
    const st = sc(r)[0];
    assert.ok(st.startsWith('__Host-osin_st=') && /Secure/.test(st) && /Path=\//.test(st) && !/Domain/i.test(st), st);
    const page = await fetch(H.base + '/');
    assert.match(page.headers.get('strict-transport-security'), /max-age=/);
    assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(page.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const c = new Client('hostck');
    await c.ready;
    assert.equal(sessionCookieName(), '__Host-osin_sid');
    assert.equal((await c.get('/api/me')).status, 200);
  } finally { reset(); }
});

test('CORS tắt: không có access-control-* ở bất kỳ phản hồi nào, preflight không được chấp nhận', async () => {
  reset();
  const c = await fresh('cors');
  const r = await c.get('/api/me', { headers: { origin: 'https://evil.example' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(H.base + '/api/chat', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.ok([404, 405].includes(pre.status));
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  assert.equal((await c.post('/api/chat', { text: 'x' }, { origin: 'https://evil.example' })).status, 403);
});

test('đăng xuất: xóa phiên thật và cookie; phiên khác của người đó vẫn còn', async () => {
  reset();
  const a = await fresh('lo1', { userId: 'u-lo' }); const b = new Client('lo2', { userId: 'u-lo' });
  const r = await a.post('/api/logout');
  assert.equal(r.status, 200);
  assert.ok(sc(r).some((x) => /osin_sid=; .*Max-Age=0/.test(x)));
  assert.equal((await a.get('/api/me')).status, 401);
  assert.equal((await b.get('/api/me')).status, 200);
});

test('đăng xuất ở 9id có hiệu lực trong <= chu kỳ kiểm; 9id bận/sập thì giữ phiên, nhưng quá lâu không kiểm được thì thôi tin', async () => {
  reset();
  config.sessionCheckMs = 50;
  const c = await fresh('kiem', { userId: 'u-kiem' });
  assert.equal((await c.get('/api/me')).status, 200);
  await new Promise((r) => setTimeout(r, 80));
  identity.faults.sessionValid = 'busy';
  assert.equal((await c.get('/api/me')).status, 200, '9id trả 429: giữ phiên đã có');
  await new Promise((r) => setTimeout(r, 80));
  identity.faults.sessionValid = 'down';
  assert.equal((await c.get('/api/me')).status, 200, '9id sập: giữ phiên');
  await db.query("UPDATE osin_sessions SET last_checked_at = now() - interval '1 hour' WHERE user_id='u-kiem'");
  assert.equal((await c.get('/api/me')).status, 401, 'quá 30 phút không kiểm được thì không còn tin');
  identity.faults.sessionValid = null;
  const d = await fresh('kiem2', { userId: 'u-kiem2' });
  await new Promise((r) => setTimeout(r, 80));
  identity.revokeSession(d.sessionId9id);
  assert.equal((await d.get('/api/me')).status, 401, 'đã đăng xuất ở 9id');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM osin_sessions WHERE user_id='u-kiem2'"))[0].n, 0, 'phiên Osin bị xóa');
  reset();
});

test('phiên trượt 7 ngày: quá hạn thì hết hiệu lực ở máy chủ; còn hạn thì được gia hạn', async () => {
  reset();
  const c = await fresh('truot', { userId: 'u-truot' });
  await db.query("UPDATE osin_sessions SET last_used_at = now() - interval '6 days' WHERE user_id='u-truot'");
  assert.equal((await c.get('/api/me')).status, 200);
  await new Promise((r) => setTimeout(r, 150));
  assert.ok((await db.query("SELECT last_used_at > now() - interval '1 hour' AS fresh FROM osin_sessions WHERE user_id='u-truot'"))[0].fresh, 'được gia hạn');
  await db.query("UPDATE osin_sessions SET last_used_at = now() - interval '8 days' WHERE user_id='u-truot'");
  assert.equal((await c.get('/api/me')).status, 401);
});

/* ---------- lớp phòng thủ cho việc nhạy cảm ---------- */
test('xác nhận/hủy/xóa/xuất đòi Sec-Fetch-Site=same-origin, chế độ hợp lệ và Referer đúng; thiếu hoặc sai thì 403 và không chạy', async () => {
  reset();
  const c = await fresh('meta', { userId: 'u-meta' });
  fam.state.executed.length = 0;
  const { card } = await propose(c);
  const bad = [
    { meta: { 'sec-fetch-site': 'cross-site' } }, { meta: { 'sec-fetch-site': 'same-site' } }, { meta: { 'sec-fetch-site': 'none' } },
    { http: true, meta: { 'sec-fetch-mode': 'no-cors' } }, { http: true, meta: { 'sec-fetch-mode': 'navigate' } }, { http: true, meta: { 'sec-fetch-mode': 'websocket' } },
    { meta: { referer: 'https://evil.example/' } }, { meta: { referer: 'not a url' } }, { noMeta: true },
  ];
  for (const o of bad) {
    for (const [m, p, body] of [['POST', `/api/actions/${card.id}/confirm`, {}], ['POST', `/api/actions/${card.id}/cancel`, {}], ['DELETE', '/api/history'], ['POST', '/api/account/erase', { confirm: true }]]) {
      const r = await c.req(m, p, body, o);
      assert.equal(r.status, 403, `${m} ${p} ${JSON.stringify(o)} -> ${r.status}`);
      assert.equal(r.json.error.code, 'csrf');
    }
  }
  assert.equal((await c.get('/api/export', { noMeta: true })).status, 403);
  assert.equal((await c.get('/api/export', { meta: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await c.get('/api/export', { http: true, meta: { 'sec-fetch-mode': 'navigate' } })).status, 200, 'tải xuống bằng điều hướng cùng nguồn gốc được phép');
  assert.equal(fam.state.executed.length, 0);
  assert.equal((await db.query("SELECT status FROM pending_actions WHERE id=$1", [card.id]))[0].status, 'pending');
  assert.equal((await c.get('/api/ui-token', { noMeta: true })).status, 403);
  assert.equal((await ok(c.post(`/api/actions/${card.id}/confirm`))).action.status, 'done');
});

test('token giao diện: xác nhận/xóa/xóa hết phải kèm X-Osin-Ui của đúng người dùng; thiếu, bịa hoặc của người khác thì 403', async () => {
  reset();
  const c = await fresh('uitok', { userId: 'u-uitok' }); const other = await fresh('uitok2', { userId: 'u-uitok2' });
  fam.state.executed.length = 0;
  const { card } = await propose(c, { muc: 'trứng' });
  const otherTok = await other.uiToken();
  for (const h of [{}, { 'x-osin-ui': 'bia-dat-token-khong-ton-tai-123456' }, { 'x-osin-ui': otherTok }]) {
    for (const [m, p, body] of [['POST', `/api/actions/${card.id}/confirm`, {}], ['DELETE', '/api/history'], ['POST', '/api/account/erase', { confirm: true }]]) {
      const r = await c.req(m, p, body, { noUi: true, headers: h });
      assert.equal(r.status, 403, `${m} ${p}`); assert.equal(r.json.error.code, 'ui_session');
    }
  }
  assert.equal(fam.state.executed.length, 0);
  assert.equal((await c.post(`/api/actions/${card.id}/cancel`, {}, { noUi: true })).status, 200, 'hủy thì không cần token (vô hại)');
});

test('hạn mức xác nhận: tối đa N hành động mỗi người mỗi giờ (ngân sách ghi)', async () => {
  reset();
  config.confirmPerHour = 2;
  const c = await fresh('capxn', { userId: 'u-capxn' });
  fam.state.executed.length = 0;
  const cards = [];
  for (let i = 0; i < 3; i++) cards.push((await propose(c, { muc: 'món ' + i })).card);
  assert.equal((await c.post(`/api/actions/${cards[0].id}/confirm`)).status, 200);
  assert.equal((await c.post(`/api/actions/${cards[1].id}/confirm`)).status, 200);
  const r = await c.post(`/api/actions/${cards[2].id}/confirm`);
  assert.equal(r.status, 429); assert.equal(r.json.error.code, 'confirm_limit');
  assert.equal(fam.state.executed.length, 2);
  await db.query("UPDATE pending_actions SET decided_at = now() - interval '2 hours' WHERE user_id='u-capxn' AND status='done'");
  assert.equal((await c.post(`/api/actions/${cards[2].id}/confirm`)).status, 200, 'hết giờ thì được tiếp');
  reset();
});

/* ---------- biên nhận, readOnly được duyệt ---------- */
test('biên nhận: Osin chỉ gửi sau khi người dùng xác nhận; kênh HMAC đúng nhưng thiếu biên nhận (Osin bị chiếm) vẫn không ghi được; app có nhật ký kiểm toán', async () => {
  reset();
  const c = await fresh('bnhan', { userId: 'u-bnhan' });
  fam.state.executed.length = 0; fam.state.audit.length = 0;
  const { card } = await propose(c, { muc: 'đường' });
  assert.equal(fam.state.audit.filter((e) => e.write).length, 0, 'xem trước không ghi, không cần biên nhận');
  // kẻ chiếm khóa kênh tự gọi execute không biên nhận
  const body = JSON.stringify({ tool: 'them_vao_danh_sach', args: { muc: 'hàng lậu' }, mode: 'execute', actingUserId: 'u-bnhan', requestId: 'tu-che-0001', ts: String(Math.floor(Date.now() / 1000)), nonce: 'n'.repeat(22) });
  const ts = Math.floor(Date.now() / 1000);
  const b2 = JSON.parse(body); b2.ts = String(ts); const bodyStr = JSON.stringify(b2);
  const url = '/family/osin-api/v1/call';
  const nonce = b2.nonce;
  const rr = await fam.api.handleRequest({ method: 'POST', url, headers: signRequest({ keyId: 'osin', secret: fam.secret, method: 'POST', pathWithQuery: url, body: bodyStr, ts, nonce }), body: bodyStr });
  assert.equal(rr.body.error.code, 'receipt_required');
  assert.equal(fam.state.executed.length, 0);
  assert.equal((await ok(c.post(`/api/actions/${card.id}/confirm`))).action.status, 'done');
  assert.equal(fam.state.executed.length, 1);
  const aud = fam.state.audit.filter((e) => e.write && e.ok);
  assert.equal(aud.length, 1); assert.equal(aud[0].userId, 'u-bnhan'); assert.equal(aud[0].requestId, card.id);
  assert.ok(!JSON.stringify(fam.state.audit).includes('đường'), 'nhật ký kiểm toán không chứa giá trị tham số');
});

test('readOnly phải được vận hành duyệt (readOnlyTools): công cụ tự khai readOnly nhưng chưa duyệt vẫn cần xác nhận; readOnly + confirm được duyệt chạy sau khi xác nhận', async () => {
  reset();
  const c = await fresh('duyet', { userId: 'u-duyet' });
  fam.state.calls.length = 0; fam.state.executed.length = 0;
  const { card } = await propose(c, {}, 'doc_chua_duyet');
  assert.ok(card && card.status === 'pending', 'chưa được duyệt nên phải xác nhận');
  assert.ok(!fam.state.calls.some((x) => x.tool === 'doc_chua_duyet'), 'chưa chạy trước khi xác nhận');
  const { card: c2 } = await propose(c, { ma: 'x1' }, 'xem_can_duyet');
  assert.ok(c2 && c2.status === 'pending');
  assert.equal(fam.state.executed.filter((e) => e.tool === 'xem_can_duyet').length, 0);
  const r = await ok(c.post(`/api/actions/${c2.id}/confirm`));
  assert.equal(r.action.status, 'done', 'readOnly + confirm chạy được sau khi xác nhận (trước đây bị từ chối nhầm)');
  assert.equal(fam.state.executed.filter((e) => e.tool === 'xem_can_duyet').length, 1);
  // công cụ đã duyệt và không confirm vẫn chạy ngay
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }] }, { text: 'ok' }]);
  const rr = await ok(c.chat('lịch'));
  assert.ok(fam.state.calls.some((x) => x.tool === 'lich_hom_nay' && x.mode === 'execute'), 'công cụ đọc đã duyệt chạy ngay');
  assert.ok(!rr.message.cards.some((x) => x.type === 'action'));
});

/* ---------- thẻ xác nhận ---------- */
test('thẻ hiện ĐỦ tham số khác rỗng, tên gia đình; ký tự điều khiển/đảo chiều/vô hình bị làm sạch TRƯỚC khi lưu và thực thi', async () => {
  reset();
  const c = await fresh('the', { userId: 'u-the', families: [{ id: 'f-lan', name: 'Nhà Lan', role: 'chu' }] });
  fam.state.executed.length = 0;
  const { card } = await propose(c, { muc: 'sữa‮ tươi⁠​', so_luong: 99 });
  assert.match(card.summary, /^Thêm "sữa tươi" vào danh sách đi chợ\nKèm: so_luong=99$/, JSON.stringify(card.summary));
  assert.equal(card.title, '9family · Nhà Lan');
  const row = (await db.query("SELECT args FROM pending_actions WHERE id=$1", [card.id]))[0];
  assert.deepEqual(row.args, { muc: 'sữa tươi', so_luong: 99 });
  await ok(c.post(`/api/actions/${card.id}/confirm`));
  assert.equal(fam.state.executed[0].args.muc, 'sữa tươi');
  assert.equal(fam.state.executed[0].args.so_luong, 99);
});

test('thử lại cùng clientId không tạo thẻ trùng; hỏi lại cùng một việc thì thẻ cũ bị đóng, chỉ còn thẻ mới', async () => {
  reset();
  const c = await fresh('lap', { userId: 'u-lap' });
  const cid = 'tin-nhan-0001-abcdef';
  const { card, message } = await propose(c, { muc: 'bột' }, 'them_vao_danh_sach', cid);
  const calls = llm.log.length;
  const again = await ok(c.chat('thêm giúp mình', cid));
  assert.equal(again.message.id, message.id); assert.equal(again.message.duplicate, true);
  assert.equal(llm.log.length, calls, 'không gọi lại mô hình');
  assert.deepEqual(again.message.cards.filter((x) => x.type === 'action').map((x) => x.id), [card.id]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pending_actions WHERE user_id='u-lap'"))[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM messages WHERE user_id='u-lap'"))[0].n, 2);
  // clientId khác (người dùng thực sự hỏi lại) cùng một việc: thẻ cũ chuyển sang đã hủy
  const second = await propose(c, { muc: 'bột' }, 'them_vao_danh_sach', 'tin-nhan-0002-abcdef');
  assert.notEqual(second.card.id, card.id);
  const rows = await db.query("SELECT id, status FROM pending_actions WHERE user_id='u-lap' ORDER BY created_at");
  assert.deepEqual(rows.map((r) => r.status), ['cancelled', 'pending']);
  const hist = (await ok(c.get('/api/history'))).messages.find((m) => m.id === message.id);
  assert.equal(hist.cards.find((x) => x.type === 'action').status, 'cancelled');
  // việc khác (tham số khác) không bị đóng
  const third = await propose(c, { muc: 'muối' });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pending_actions WHERE user_id='u-lap' AND status='pending'"))[0].n, 2);
  void third;
});

test('xóa dữ liệu lúc hành động đang chạy: xác nhận trả kết quả đúng, không lỗi 500', async () => {
  reset();
  const c = await fresh('xoadang', { userId: 'u-xoadang' });
  fam.state.executed.length = 0; fam.state.slowMs = 400;
  try {
    const { card } = await propose(c, { muc: 'kẹo' });
    const p = c.post(`/api/actions/${card.id}/confirm`);
    await new Promise((r) => setTimeout(r, 120));
    const e = await c.post('/api/account/erase', { confirm: true });
    assert.equal(e.status, 200);
    const r = await p;
    assert.equal(r.status, 200, r.buf.toString());
    assert.ok(['done', 'failed'].includes(r.json.action.status));
    assert.equal(fam.state.executed.length, 1, 'app đã chạy xong nên kết quả phải được báo đúng sự thật');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pending_actions WHERE user_id='u-xoadang'"))[0].n, 0);
  } finally { fam.state.slowMs = 0; }
});

/* ---------- đồng ý có phiên bản và nội dung trung thực ---------- */
test('đồng ý có phiên bản: phiên bản cũ phải đồng ý lại; /api/me nói trung thực về huấn luyện chỉ khi vận hành xác nhận', async () => {
  reset();
  const c = await fresh('dy', { userId: 'u-dy' });
  assert.equal((await ok(c.get('/api/me'))).needConsent, false);
  await db.query("UPDATE user_prefs SET consent_version = 1 WHERE user_id='u-dy'");
  const me = await ok(c.get('/api/me'));
  assert.equal(me.needConsent, true); assert.equal(me.consentVersion, config.consentVersion);
  const r = await c.chat('xin chào');
  assert.equal(r.status, 403); assert.equal(r.json.error.code, 'need_consent');
  await ok(c.consent());
  assert.equal((await ok(c.get('/api/me'))).needConsent, false);
  assert.equal((await db.query("SELECT consent_version FROM user_prefs WHERE user_id='u-dy'"))[0].consent_version, config.consentVersion);
  assert.equal(me.ai.noTrainConfirmed, false, 'mặc định KHÔNG khẳng định đã xác nhận không huấn luyện');
  config.noTrainConfirmed = true;
  try { assert.equal((await ok(c.get('/api/me'))).ai.noTrainConfirmed, true); } finally { reset(); }
});

/* ---------- ngân sách ---------- */
test('trần mỗi người không vượt trong một lượt (cắt giữa lượt)', async () => {
  reset();
  config.userTokensPerDay = 1000;
  const c = await fresh('giua', { userId: 'u-giua' });
  llm.reset(() => ({ calls: [{ name: 'osin__may_tinh', args: { bieu_thuc: '1+1' } }], tokens: 900 }));
  await ok(c.chat('tính mãi'));
  assert.equal(llm.log.length, 3, 'sau hai vòng dùng 1800 token (> trần 1000) thì buộc trả lời, không chạy tiếp tới 7 vòng');
  assert.equal(llm.log[2].allowTools, false);
  reset();
});

test('người mới (< 24 giờ) có hạn mức thấp hơn; mỗi người tối đa 4% trần toàn hệ', async () => {
  reset();
  config.newUserFactor = 0.1; config.userTokensPerDay = 1000;
  const n = await fresh('moi', { userId: 'u-moi' });
  llm.reset(() => ({ text: 'ok', tokens: 150 }));
  await ok(n.chat('một'));
  const r = await n.chat('hai');
  assert.equal(r.status, 429); assert.equal(r.json.error.code, 'daily_tokens', 'newcomer: giới hạn 100 token');
  await db.query("UPDATE user_prefs SET first_seen_at = now() - interval '2 days' WHERE user_id='u-moi'");
  assert.equal((await n.chat('ba')).status, 200, 'qua 24 giờ thì dùng hạn mức thường');
  reset();
  config.newUserFactor = 1; config.userTokensPerDay = 120000; config.globalTokensPerDay = 10000; config.turnReserveTokens = 50;
  const big = await fresh('bon', { userId: 'u-bon' });
  llm.reset(() => ({ text: 'ok', tokens: 450 }));
  await ok(big.chat('một'));
  const r2 = await big.chat('hai');
  assert.equal(r2.status, 429, '4% của 10.000 = 400 token');
  reset();
});

test('cảnh báo ở 50% và 80% trần toàn hệ (log một lần mỗi mức mỗi ngày)', async () => {
  reset();
  resetBudgetWarnings();
  config.globalTokensPerDay = 1000; config.turnReserveTokens = 100; config.userMaxShare = 1; config.userTokensPerDay = 1000;
  await db.query('DELETE FROM usage_daily');
  const lines = []; const orig = console.log;
  console.log = (...a) => { lines.push(a.join(' ')); };
  try {
    llm.reset(() => ({ text: 'ok', tokens: 100 }));
    for (let i = 0; i < 8; i++) { const u = await fresh('w' + i, { userId: 'u-w' + i }); assert.equal((await u.chat('x')).status, 200); }
  } finally { console.log = orig; }
  const warns = lines.filter((l) => l.includes('budget_warn'));
  assert.equal(warns.length, 2, warns.join('\n'));
  assert.ok(warns[0].includes('"pct":50') && warns[1].includes('"pct":80'));
  reset();
});

/* ---------- trần khai báo công cụ ---------- */
test('manifest quá lớn bị từ chối khi đăng ký app; nhiều công cụ thì khai báo gửi mô hình bị cắt', async () => {
  reset();
  const mkTool = (i, pad) => ({ name: 't' + String(i).padStart(2, '0') + '_cong_cu', description: 'Công cụ số ' + i + ' ' + 'x'.repeat(pad), readOnly: true, parameters: { type: 'object', properties: {} }, run: async () => ({ i }) });
  const huge = await createFakeApp({ id: 'huge', mount: '/huge', extraTools: Array.from({ length: 30 }, (_, i) => mkTool(i, 0)).map((t) => ({ ...t, parameters: { type: 'object', properties: Object.fromEntries(Array.from({ length: 12 }, (_, k) => ['p' + k, { type: 'string', description: 'y'.repeat(300) }])) } })) });
  const mid = await createFakeApp({ id: 'mid', mount: '/mid', extraTools: Array.from({ length: 30 }, (_, i) => mkTool(i, 440)) });
  onShutdown(() => huge.close()); onShutdown(() => mid.close());
  await boot({ llm, apps: [fam.appConfig, { ...huge.appConfig, name: 'Huge' }, { ...mid.appConfig, name: 'Mid' }], extra: { appManifestTimeoutMs: 800 } });
  const c = await fresh('cat', { userId: 'u-cat' });
  llm.reset([{ text: 'ok' }]);
  await ok(c.chat('xin chào'));
  const status = Object.fromEntries(H.registry.status().map((s) => [s.id, s.ok]));
  assert.equal(status.huge, false, 'manifest > 48 KB bị từ chối');
  assert.equal(status.mid, true);
  const total = (await H.registry.listTools()).tools.filter((t) => !t.internal).length;
  assert.ok(llm.log[0].tools.filter((n) => !n.startsWith('osin__')).length < total, 'khai báo bị cắt bớt để dưới 20 KB');
  await boot({ llm, apps: [fam.appConfig], extra: { appToolTimeoutMs: 500, appConfirmTimeoutMs: 1500, appManifestTimeoutMs: 500 } });
});

/* ---------- liên kết tuyệt đối tới app ở origin khác ---------- */
test('liên kết sâu tới app là URL tuyệt đối (origin khác) đã whitelist theo tiền tố', async () => {
  reset();
  config.appsOrigin = 'https://9app.tech';
  const c = await fresh('lk', { userId: 'u-lk' });
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }] }, { text: 'ok' }]);
  const r = await ok(c.chat('lịch'));
  const links = r.message.cards.find((x) => x.type === 'links').items;
  assert.deepEqual(links.map((l) => l.url), ['https://9app.tech/family/#/lich']);
  llm.reset([{ calls: [{ name: 'osin__tim_chuc_nang', args: { tu_khoa: 'văn khấn' } }] }, { text: 'ok' }]);
  const r2 = await ok(c.chat('văn khấn'));
  assert.ok(r2.message.cards.find((x) => x.type === 'links').items.every((l) => l.url.startsWith('https://9app.tech/vannien/')));
  assert.ok(links.every((l) => !/evil|hire/.test(l.url)), 'liên kết ngoài tiền tố bị bỏ');
  const html = await (await fetch(H.base + '/')).text();
  assert.match(html, /class="back" href="https:\/\/9app\.tech\/"/);
  reset();
});

/* ---------- nhật ký ---------- */
test('lỗi bất ngờ ở router: log qua redact, không in stack thô và không in thông điệp thư viện chứa dữ liệu', async () => {
  reset();
  const c = await fresh('log500', { userId: 'u-log500' });
  const lines = []; const orig = { log: console.log, error: console.error };
  console.log = console.error = (...a) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  const o = identity.families;
  identity.families = async () => { throw new Error('bí mật SieuMat_Khau123 số 0912345678 \n    at Evil (file:///x/y.js:1:1)'); };
  let r;
  try { r = await c.get('/api/me'); } finally { identity.families = o; Object.assign(console, orig); }
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.json).includes('SieuMat'));
  const all = lines.join('\n');
  assert.ok(!/SieuMat_Khau123|0912345678|file:\/\/|\n\s+at /.test(all), all);
  assert.ok(lines.some((l) => l.includes('unexpected')), 'vẫn có dòng log sự kiện');
});
