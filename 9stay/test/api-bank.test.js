import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as, Api } from './helper-http.js';
import { config } from '../src/config.js';

before(boot);
after(shutdown);
const SECRET = 'webhook-secret-for-tests-0123456789';
let srv, w, hook, code, bookingId;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  srv = await startServer({ cfg: { ...config, bankWebhookSecret: SECRET } });
  const mgr = as(srv, w, 'quanly');
  const put = await mgr.put('/api/bank/account', { bankBin: '970436', accountNumber: '0123456789', accountHolder: 'CONG TY ANSTAY' });
  hook = put.json.webhookPath;
  const q = await mgr.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', adults: 2 });
  const b = await mgr.post('/api/bookings', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Lan', adults: 2, quoteId: q.json.id });
  code = b.json.booking.code;
  bookingId = b.json.booking.id;
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; });

const anon = () => new Api(srv, null, null);
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');
// Webhook thật không gửi X-Requested-With và không có cookie.
const send = (raw, headers, path = hook) => anon().req('POST', path.replace('/stay', ''), undefined, { csrf: false, raw, headers });
const signed = (obj, path) => { const raw = JSON.stringify(obj); return send(raw, { 'x-signature': sign(raw) }, path); };

test('webhook ký đúng: ghi cọc và đơn thành da_coc', async () => {
  const r = await signed({ id: 'T1', amount: 1000000, content: 'LAN CK ' + code });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'matched');
  const g = await as(srv, w, 'quanly').get(`/api/bookings/${bookingId}`);
  assert.equal(g.json.booking.status, 'da_coc');
});

test('webhook thiếu chữ ký, sai chữ ký hoặc sai mã đường dẫn: 401, không ghi gì', async () => {
  const body = JSON.stringify({ id: 'T2', amount: 1000000, content: code });
  assert.equal((await send(body, {})).status, 401);
  assert.equal((await send(body, { 'x-signature': 'abc' })).status, 401);
  assert.equal((await send(body, { 'x-signature': sign(body + ' ') })).status, 401);
  assert.equal((await send(body, { 'x-signature': sign(body) }, '/stay/api/bank/webhook/' + '0'.repeat(48))).status, 401);
  assert.equal((await send(body, { authorization: 'Apikey wrong' })).status, 401);
  assert.equal((await db.query('SELECT 1 FROM bank_inbox')).length, 0);
});

test('webhook kiểu Apikey (SePay) và tên trường SePay', async () => {
  const body = JSON.stringify({ id: 99, transferType: 'in', transferAmount: 1000000, content: code, accountNumber: '0123456789', transactionDate: '2026-10-14 10:00:00' });
  const r = await send(body, { authorization: 'Apikey ' + SECRET });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'matched');
});

test('tiền ra, hoặc về tài khoản khác: bỏ qua, không ghi', async () => {
  const out = await signed({ id: 'O1', transferType: 'out', transferAmount: 5000, content: code });
  assert.equal(out.json.ignored, 'outgoing');
  const other = await signed({ id: 'O2', transferType: 'in', transferAmount: 5000, content: code, accountNumber: '999999999' });
  assert.equal(other.json.ignored, 'other_account');
  assert.equal((await db.query('SELECT 1 FROM bank_inbox')).length, 0);
});

test('webhook gửi lại: vẫn 200 và không ghi thêm', async () => {
  await signed({ id: 'D1', amount: 1000000, content: code });
  const r = await signed({ id: 'D1', amount: 1000000, content: code });
  assert.equal(r.status, 200);
  assert.equal(r.json.duplicate, true);
  assert.equal((await db.query('SELECT 1 FROM payments')).length, 1);
});

test('webhook thân hỏng: 400 sau khi ký đúng, không 500', async () => {
  const raw = '{khong phai json';
  const r = await send(raw, { 'x-signature': sign(raw) });
  assert.equal(r.status, 400);
  const bad = await signed({ id: 'B1', amount: -5, content: code });
  assert.equal(bad.status, 400);
});

test('chưa đặt bí mật webhook: từ chối mọi yêu cầu', async () => {
  await srv.close();
  srv = await startServer({ cfg: { ...config, bankWebhookSecret: '' } });
  const raw = JSON.stringify({ id: 'N1', amount: 1000000, content: code });
  assert.equal((await send(raw, { 'x-signature': crypto.createHmac('sha256', '').update(raw).digest('hex') })).status, 401);
  assert.equal((await send(raw, { authorization: 'Apikey ' })).status, 401);
});

test('đường API thường vẫn đòi CSRF', async () => {
  const r = await as(srv, w, 'quanly').put('/api/bank/account', { bankBin: '970436', accountNumber: '0123456789', accountHolder: 'X' }, { csrf: false });
  assert.equal(r.status, 403);
});

test('chỉ quản lý cấu hình tài khoản và xử lý hàng chờ', async () => {
  for (const k of ['letan', 'ctv1', 'chu1', 'buongphong']) {
    const a = as(srv, w, k);
    assert.equal((await a.get('/api/bank/account')).status, 403, k);
    assert.equal((await a.put('/api/bank/account', { bankBin: '970436', accountNumber: '0123456789', accountHolder: 'X' })).status, 403, k);
    assert.equal((await a.get('/api/bank/inbox')).status, 403, k);
    assert.equal((await a.post('/api/bank/inbox/' + w.orgId + '/match', { bookingId })).status, 403, k);
  }
});

test('hàng chờ: quản lý thấy và ghép tay qua HTTP', async () => {
  await signed({ id: 'U1', amount: 1000000, content: 'khong co ma' });
  const mgr = as(srv, w, 'quanly');
  const list = await mgr.get('/api/bank/inbox?status=unmatched');
  assert.equal(list.json.items.length, 1);
  const id = list.json.items[0].id;
  assert.equal((await mgr.post(`/api/bank/inbox/${id}/match`, { bookingId })).status, 200);
  assert.equal((await mgr.get(`/api/bookings/${bookingId}`)).json.booking.status, 'da_coc');
  assert.equal((await mgr.post(`/api/bank/inbox/${id}/match`, { bookingId })).status, 409);
  assert.equal((await mgr.get('/api/bank/inbox?status=bậy')).status, 400);
  const log = await db.query("SELECT action FROM audit_log WHERE action LIKE 'bank.%' ORDER BY at");
  assert.ok(log.some((l) => l.action === 'bank.match'));
});

test('GET tài khoản trả đường webhook, không trả bí mật chung', async () => {
  const r = await as(srv, w, 'quanly').get('/api/bank/account');
  assert.equal(r.json.configured, true);
  assert.match(r.json.webhookPath, /\/api\/bank\/webhook\/[0-9a-f]{48}$/);
  assert.ok(!r.text.includes(SECRET));
});

test('payment-info: nhân viên mọi đơn; CTV chỉ đơn của mình; chủ phòng không', async () => {
  const ctvQ = await as(srv, w, 'ctv1').post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-11-20', checkout: '2026-11-22', adults: 2 });
  const mine = await as(srv, w, 'ctv1').post('/api/bookings', { roomTypeId: w.roomTypeId, checkin: '2026-11-20', checkout: '2026-11-22', guestName: 'K', adults: 2, quoteId: ctvQ.json.id });
  const own = mine.json.booking.id;
  const r = await as(srv, w, 'ctv1').get(`/api/bookings/${own}/payment-info`);
  assert.equal(r.status, 200);
  assert.equal(r.json.content, mine.json.booking.code);
  assert.match(r.json.svg, /^<svg/);
  assert.equal((await as(srv, w, 'ctv2').get(`/api/bookings/${own}/payment-info`)).status, 404);
  assert.equal((await as(srv, w, 'ctv1').get(`/api/bookings/${bookingId}/payment-info`)).status, 404);
  assert.equal((await as(srv, w, 'letan').get(`/api/bookings/${bookingId}/payment-info`)).status, 200);
  assert.equal((await as(srv, w, 'chu1').get(`/api/bookings/${own}/payment-info`)).status, 403);
  assert.equal((await anon().get(`/api/bookings/${own}/payment-info`)).status, 401);
});

test('ghi tay không được dùng mã tham chiếu bank:', async () => {
  const r = await as(srv, w, 'quanly').post(`/api/bookings/${bookingId}/payments`, { kind: 'deposit', amount: 1000, receivedOn: '2026-10-14', ref: 'bank:abc' });
  assert.equal(r.status, 400);
});
