import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as, Api, makeFakeId } from './helper-http.js';
import { NineIdError } from '../src/nine-id.js';
import { setBankAccount, ingestBankTx } from '../src/bank.js';
import { NOW } from './helper.js';

before(boot);
after(shutdown);
let srv, w, sent, fake;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  fake = makeFakeId();
  sent = fake.sent;
  srv = await startServer({ idClient: fake });
  await db.query("UPDATE orgs SET slug = 'anstay', public_enabled = true WHERE id = $1", [w.orgId]);
  await db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: '0123456789', holder: 'CONG TY ANSTAY' }));
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; });

const anon = () => new Api(srv, null, null);
const P = '/api/public/anstay';
const Q = 'checkin=2026-11-12&checkout=2026-11-14&adults=2';
async function verified(phone = '0901234567') {
  assert.equal((await anon().post(`${P}/otp`, { phone })).status, 200);
  const code = sent.at(-1).code;
  const v = await anon().post(`${P}/otp/verify`, { phone, code });
  assert.equal(v.status, 200);
  return v.json.token;
}
// Phiên OTP đã xác thực cho một số (dùng một lần sau khi đặt thành công nên mỗi lần đặt cần phiên mới).
let seq = 0;
async function session(phone = '0901234567') {
  const { hashToken } = await import('../src/otp.js');
  const tok = 's' + String(++seq).padStart(3, '0') + 'x'.repeat(26);
  await db.query("INSERT INTO otp_sessions(token_hash, org_id, phone, expires_at) VALUES($1, $2, $3, '2026-10-14T04:00:00Z')", [hashToken(tok), w.orgId, phone]);
  return tok;
}
const bookBody = (token, over = {}) => ({ token, roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', adults: 2, childAges: [], guestName: 'Nguyễn Lan', ...over });

test('trang chưa bật hoặc sai địa chỉ: 404, không lộ gì', async () => {
  await db.query("UPDATE orgs SET public_enabled = false WHERE id = $1", [w.orgId]);
  assert.equal((await anon().get(`${P}/offers?${Q}`)).status, 404);
  assert.equal((await anon().get(`/api/public/khong-co/offers?${Q}`)).status, 404);
  assert.equal((await anon().get(`/api/public/BAD_SLUG/offers?${Q}`)).status, 404);
});

test('ưu đãi: giá gồm VAT, không lộ căn/số lượng, không ghi báo giá', async () => {
  const r = await anon().get(`${P}/offers?${Q}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.payReady, true);
  assert.equal(r.json.holdMinutes, 5);
  assert.equal(r.json.rooms.length, 1);
  assert.equal(r.json.rooms[0].total, 1430000);
  assert.equal(r.json.rooms[0].deposit, 429000);
  assert.ok(!/A120|Sunrise|Minh|free/.test(r.text));
  assert.equal((await db.query('SELECT 1 FROM quotes')).length, 0);
});

test('đầu vào xấu cho offers bị từ chối (400), không 500', async () => {
  for (const q of ['checkin=2026-11-14&checkout=2026-11-12&adults=2', 'checkin=abc&checkout=2026-11-14&adults=2', `${Q}&childAges=x`, 'checkin=2026-11-12&checkout=2026-11-14&adults=0', 'checkin=2026-11-12&checkout=2026-11-14&adults=99']) {
    const r = await anon().get(`${P}/offers?${q}`);
    assert.ok(r.status >= 400 && r.status < 500, q + ' -> ' + r.status);
  }
});

test('OTP: số sai định dạng; quá 3 lần/10 phút (cùng số dạng +84 tính chung); sai mã 400', async () => {
  assert.equal((await anon().post(`${P}/otp`, { phone: '123' })).status, 400);
  assert.equal(sent.length, 0, 'số sai định dạng không gọi 9id');
  for (let i = 0; i < 3; i++) assert.equal((await anon().post(`${P}/otp`, { phone: '0901234567' })).status, 200);
  assert.equal((await anon().post(`${P}/otp`, { phone: '+84 901 234 567' })).status, 429);
  assert.equal(sent.length, 3);
  assert.equal(sent[0].phone, '0901234567', 'gửi sang 9id ở dạng chuẩn 0xxxxxxxxx');
  const good = sent.at(-1).code;
  const wrong = good === '000000' ? '111111' : '000000';
  assert.equal((await anon().post(`${P}/otp/verify`, { phone: '0901234567', code: wrong })).status, 400);
  assert.equal((await anon().post(`${P}/otp/verify`, { phone: '0901234567', code: good })).status, 200);
});

test('IP khách được chuyển tiếp sang 9id để hạn mức theo IP của 9id có tác dụng', async () => {
  await anon().post(`${P}/otp`, { phone: '0901234567' });
  assert.ok(sent[0].ip && sent[0].ip.length > 0);
});

test('lỗi từ 9id được dịch cho khách: 429 giữ nguyên, 400 sai mã, lỗi khác thành 503 không lộ chi tiết', async () => {
  const body = { phone: '0901234567', code: '123456' };
  for (const [err, status, code] of [
    [new NineIdError(429, 'otp_too_soon', 'Vui lòng đợi 60 giây trước khi xin mã mới'), 429, 'otp_rate'],
    [new NineIdError(429, 'otp_limit', 'Số này đã nhận quá nhiều mã'), 429, 'otp_rate'],
    [new NineIdError(503, 'otp_unavailable', 'chi-tiet-noi-bo-9id'), 503, 'otp_unavailable'],
    [new Error('ECONNREFUSED 9id:8102'), 503, 'otp_unavailable'],
  ]) {
    await srv.close();
    srv = await startServer({ idClient: makeFakeId({ failSend: err, failVerify: err }) });
    const a = await anon().post(`${P}/otp`, { phone: '0901234567' });
    assert.equal(a.status, status);
    assert.equal(a.json.error.code, code);
    assert.ok(!/chi-tiet-noi-bo|ECONNREFUSED/.test(a.text));
    const v = await anon().post(`${P}/otp/verify`, body);
    assert.ok([400, 429, 503].includes(v.status));
    assert.ok(!/chi-tiet-noi-bo|ECONNREFUSED/.test(v.text));
    await db.query('DELETE FROM otp_codes');
  }
});

test('mã OTP dùng một lần; mã cũ không dùng được sau khi dùng', async () => {
  await anon().post(`${P}/otp`, { phone: '0901234567' });
  const code = sent.at(-1).code;
  assert.equal((await anon().post(`${P}/otp/verify`, { phone: '0901234567', code })).status, 200);
  assert.equal((await anon().post(`${P}/otp/verify`, { phone: '0901234567', code })).status, 400);
});

test('9id lỗi khi gửi: 503, nhưng lần xin vẫn bị tính vào giới hạn cục bộ; 9id không hỗ trợ OTP: offers báo otpReady=false và 503', async () => {
  await srv.close();
  srv = await startServer({ idClient: makeFakeId({ failSend: new NineIdError(503, 'otp_unavailable', 'x') }) });
  assert.equal((await anon().post(`${P}/otp`, { phone: '0901234567' })).status, 503);
  assert.equal((await db.query('SELECT 1 FROM otp_codes')).length, 1);
  await srv.close();
  srv = await startServer({ idClient: { verify: async () => null } });
  const o = await anon().get(`${P}/offers?${Q}`);
  assert.equal(o.json.otpReady, false);
  assert.equal((await anon().post(`${P}/otp`, { phone: '0901234567' })).status, 503);
});

test('đặt phòng cần phiên OTP; token sai/thiếu: 401', async () => {
  assert.equal((await anon().post(`${P}/book`, bookBody('x'.repeat(30)))).status, 401);
  assert.equal((await anon().post(`${P}/book`, bookBody(undefined))).status, 401);
});

test('luồng đầy đủ: OTP → giữ phòng 5 phút → chuyển khoản qua webhook → đã cọc', async () => {
  const token = await verified();
  const b = await anon().post(`${P}/book`, bookBody(token));
  assert.equal(b.status, 200);
  assert.equal(b.json.total, 1430000);
  assert.equal(new Date(b.json.holdUntil).getTime() - NOW.getTime(), 5 * 60 * 1000);
  const rc = await anon().get(`/api/public/receipt/${b.json.receipt}`);
  assert.equal(rc.json.status, 'giu');
  assert.equal(rc.json.pay.amount, 429000);
  assert.equal(rc.json.pay.content, b.json.code);
  assert.equal(rc.json.location, undefined, 'chưa cọc: chưa có địa chỉ');
  assert.ok(!/unit|A120|Minh/.test(rc.text));
  await db.tx((c) => ingestBankTx(c, { orgId: w.orgId, provider: 'webhook', bankTxId: 'pub1', amount: 429000, content: b.json.code }, { now: NOW }));
  const after = await anon().get(`/api/public/receipt/${b.json.receipt}`);
  assert.equal(after.json.status, 'da_coc');
  assert.equal(after.json.paid, 429000);
  assert.equal(after.json.location.name, 'Sunrise', 'đã cọc: có địa chỉ tòa nhà');
  const [row] = await db.query("SELECT source, guest_phone, phone_verified FROM bookings WHERE code = $1", [b.json.code]);
  assert.deepEqual({ ...row }, { source: 'web', guest_phone: '0901234567', phone_verified: true });
});

test('một số điện thoại chỉ giữ tối đa 2 đơn chưa thanh toán', async () => {
  const token = await verified();
  assert.equal((await anon().post(`${P}/book`, bookBody(token))).status, 200);
  assert.equal((await anon().post(`${P}/book`, bookBody(await session(), { checkin: '2026-11-20', checkout: '2026-11-21' }))).status, 200);
  const third = await anon().post(`${P}/book`, bookBody(await session(), { checkin: '2026-11-25', checkout: '2026-11-26' }));
  assert.equal(third.status, 409);
  assert.equal(third.json.error.code, 'too_many_holds');
});

test('hai khách tranh căn cuối cùng: đúng một người giữ được (đua dữ liệu)', async () => {
  // loại phòng có 3 căn (A1205, A1206, B1); 4 người cùng đặt một khoảng ngày
  const tokens = [];
  for (const phone of ['0901111111', '0902222222', '0903333333', '0904444444']) tokens.push(await verified(phone));
  const rs = await Promise.all(tokens.map((t) => anon().post(`${P}/book`, bookBody(t))));
  assert.equal(rs.filter((r) => r.status === 200).length, 3);
  assert.equal(rs.filter((r) => r.status === 409).length, 1);
  assert.equal((await db.query('SELECT 1 FROM room_nights WHERE active')).length, 6);
});

test('hết hạn giữ chỗ: biên nhận báo het_han và căn được nhả', async () => {
  const token = await verified();
  const b = await anon().post(`${P}/book`, bookBody(token));
  await db.query("UPDATE bookings SET hold_until = '2026-10-14T02:00:00Z' WHERE code = $1", [b.json.code]);
  const rc = await anon().get(`/api/public/receipt/${b.json.receipt}`);
  assert.equal(rc.json.status, 'het_han');
  assert.equal(rc.json.pay, undefined);
  assert.equal((await db.query('SELECT 1 FROM room_nights WHERE active')).length, 0);
});

test('khách hủy khi chưa trả tiền được; đã trả tiền thì không', async () => {
  const token = await verified();
  const b1 = await anon().post(`${P}/book`, bookBody(token));
  assert.equal((await anon().post(`/api/public/receipt/${b1.json.receipt}/cancel`, {})).status, 200);
  assert.equal((await anon().get(`/api/public/receipt/${b1.json.receipt}`)).json.status, 'huy');
  const b2 = await anon().post(`${P}/book`, bookBody(await session()));
  await db.tx((c) => ingestBankTx(c, { orgId: w.orgId, provider: 'webhook', bankTxId: 'pub2', amount: 429000, content: b2.json.code }, { now: NOW }));
  assert.equal((await anon().post(`/api/public/receipt/${b2.json.receipt}/cancel`, {})).status, 403);
});

test('biên nhận: token sai hoặc đoán mò: 404', async () => {
  assert.equal((await anon().get('/api/public/receipt/' + 'a'.repeat(32))).status, 404);
  assert.equal((await anon().get('/api/public/receipt/short')).status, 404);
});

test('chưa cài tài khoản nhận tiền: không cho giữ phòng', async () => {
  await db.query('DELETE FROM org_bank_accounts');
  const r = await anon().get(`${P}/offers?${Q}`);
  assert.equal(r.json.payReady, false);
  const token = await verified();
  assert.equal((await anon().post(`${P}/book`, bookBody(token))).status, 409);
});

test('phiên OTP của org này không dùng được ở org khác', async () => {
  const token = await verified();
  const other = await db.tx(async (c) => (await c.query("INSERT INTO orgs(name, slug, public_enabled) VALUES('Khác', 'khac', true) RETURNING id"))[0].id);
  assert.ok(other);
  assert.equal((await anon().post('/api/public/khac/book', bookBody(token))).status, 401);
});

test('trang /book/<slug> trả HTML công khai với CSP chặt', async () => {
  const r = await fetch(srv.base + '/book/anstay');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
});

test('quản lý đặt địa chỉ trang; người khác 403; địa chỉ trùng 409', async () => {
  const mgr = as(srv, w, 'quanly');
  assert.equal((await mgr.put('/api/public-page', { slug: 'anstay-2', enabled: true })).status, 200);
  assert.equal((await mgr.get('/api/public-page')).json.slug, 'anstay-2');
  assert.equal((await mgr.put('/api/public-page', { slug: 'A', enabled: true })).status, 400);
  assert.equal((await as(srv, w, 'letan').put('/api/public-page', { slug: 'abc', enabled: true })).status, 403);
  await db.query("INSERT INTO orgs(name, slug) VALUES('K', 'dung-roi')");
  assert.equal((await mgr.put('/api/public-page', { slug: 'dung-roi', enabled: true })).status, 409);
});

test('đặt trực tuyến giới hạn số đêm; offers cũng vậy', async () => {
  const token = await verified();
  const r = await anon().post(`${P}/book`, bookBody(token, { checkin: '2026-11-01', checkout: '2026-11-20' }));
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'too_long');
  assert.equal((await anon().get(`${P}/offers?checkin=2026-11-01&checkout=2026-11-20&adults=2`)).status, 400);
});

test('giá đổi giữa lúc xem và lúc đặt: 409 price_changed, không giữ phòng', async () => {
  const token = await verified();
  const r = await anon().post(`${P}/book`, bookBody(token, { expectedTotal: 1 }));
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'price_changed');
  assert.equal((await db.query('SELECT 1 FROM bookings')).length, 0);
  assert.equal((await anon().post(`${P}/book`, bookBody(token, { expectedTotal: 1430000 }))).status, 200);
});

test('phiên OTP dùng một lần sau khi đặt thành công; đặt lỗi thì phiên còn dùng được', async () => {
  const token = await verified();
  assert.equal((await anon().post(`${P}/book`, bookBody(token, { guestName: '' }))).status, 400);
  assert.equal((await anon().post(`${P}/book`, bookBody(token))).status, 200);
  assert.equal((await anon().post(`${P}/book`, bookBody(token, { checkin: '2026-11-20', checkout: '2026-11-21' }))).status, 401);
});

test('ân hạn: đơn web quá hạn 7 phút chưa bị nhả (tiền kịp về), quá 11 phút thì nhả', async () => {
  const token = await verified();
  const b = await anon().post(`${P}/book`, bookBody(token));
  await db.query("UPDATE bookings SET hold_until = '2026-10-14T02:53:00Z' WHERE code = $1", [b.json.code]);
  assert.equal((await anon().get(`/api/public/receipt/${b.json.receipt}`)).json.status, 'giu');
  await db.query("UPDATE bookings SET hold_until = '2026-10-14T02:49:00Z' WHERE code = $1", [b.json.code]);
  assert.equal((await anon().get(`/api/public/receipt/${b.json.receipt}`)).json.status, 'het_han');
});

test('OTP: trần 6 mã mỗi ngày cho một số', async () => {
  for (let i = 0; i < 6; i++) {
    await db.query("UPDATE otp_codes SET created_at = created_at - interval '1 hour'");
    assert.equal((await anon().post(`${P}/otp`, { phone: '0907654321' })).status, 200, 'lần ' + i);
  }
  await db.query("UPDATE otp_codes SET created_at = created_at - interval '1 hour'");
  assert.equal((await anon().post(`${P}/otp`, { phone: '0907654321' })).status, 429);
});

test('đủ 6 đơn web chưa trả tiền trong 24 giờ thì khóa tạm (kể cả đơn đã hủy)', async () => {
  for (let i = 0; i < 6; i++) {
    const b = await anon().post(`${P}/book`, bookBody(await session(), { checkin: `2026-11-${String(10 + i).padStart(2, '0')}`, checkout: `2026-11-${String(11 + i).padStart(2, '0')}` }));
    assert.equal(b.status, 200, 'đơn ' + i);
    assert.equal((await anon().post(`/api/public/receipt/${b.json.receipt}/cancel`, {})).status, 200);
  }
  const r = await anon().post(`${P}/book`, bookBody(await session(), { checkin: '2026-11-25', checkout: '2026-11-26' }));
  assert.equal(r.status, 429);
});
