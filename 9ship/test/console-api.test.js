// Kết nối 9app Console: xác thực HMAC, tuân thủ giao thức v1 (kiểm bằng chính bộ kiểm tra của cổng), ánh xạ sổ cái -> dòng tiền, hành động.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, tx } from '../src/db.js';
import { config } from '../src/config.js';
import * as ledger from '../src/ledger.js';
import * as orders from '../src/orders.js';
import * as worker from '../src/worker.js';
import * as lifecycle from '../src/lifecycle.js';
import * as withdrawals from '../src/withdrawals.js';
import * as claims from '../src/claims.js';
import { mockControl } from '../src/carriers/mock.js';
import { resetBreakers } from '../src/rating.js';
import { syncPickupPoints } from '../src/places.js';
import { createApp } from '../src/http.js';
import { consoleApiRoutes } from '../src/console-api.js';
import { sign } from '../src/console-api.js';
import * as C from '../../9admin/src/contract.js';
import { setup, close, newUser, fund, makeCreated, getOffer, key, SENDER, RECEIVER } from './helpers.js';

const KEY = 'console-test'; const SECRET = 'bi-mat-kiem-thu-rat-dai-0123456789';
let app; let base;
before(async () => {
  await setup(); await syncPickupPoints();
  Object.assign(config, { consoleApiKeyId: KEY, consoleApiSecret: SECRET });
  app = createApp();
  consoleApiRoutes(app);
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); await close(); });
beforeEach(() => { mockControl.reset(); resetBreakers(); });

let tick = 0;
async function call(method, path, { body = null, ts = Math.floor(Date.now() / 1000) + (++tick % 50), secret = SECRET, keyId = KEY, mutate } = {}) {
  const payload = body === null ? '' : JSON.stringify(body);
  const full = '/admin-api/v1' + path;
  const headers = { 'x-console-key': keyId, 'x-console-ts': String(ts), 'x-console-sig': sign(secret, String(ts), method, full, payload) };
  if (mutate) mutate(headers);
  if (payload) headers['content-type'] = 'application/json';
  const r = await fetch(base + full, { method, headers, body: payload || undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const get = async (path, v) => { const r = await call('GET', path); assert.equal(r.status, 200, path + ' ' + JSON.stringify(r.json)); return v ? v(r.json) : r.json; };

test('xác thực: thiếu/sai khóa, sai chữ ký, lệch giờ đều bị 401; tắt cấu hình thì 404', async () => {
  assert.equal((await call('GET', '/manifest')).status, 200);
  assert.equal((await call('GET', '/manifest', { keyId: 'khac' })).status, 401);
  assert.equal((await call('GET', '/manifest', { secret: 'sai-bi-mat-sai-bi-mat-sai-bi-mat' })).status, 401);
  assert.equal((await call('GET', '/manifest', { ts: Math.floor(Date.now() / 1000) - 600 })).status, 401);
  assert.equal((await call('GET', '/manifest', { mutate: (h) => { delete h['x-console-sig']; } })).status, 401);
  // chữ ký của đường dẫn khác không dùng lại được
  assert.equal((await call('GET', '/health', { mutate: (h) => { h['x-console-sig'] = sign(SECRET, h['x-console-ts'], 'GET', '/admin-api/v1/manifest'); } })).status, 401);
  const saved = config.consoleApiSecret; config.consoleApiSecret = '';
  try { assert.equal((await call('GET', '/manifest')).status, 404); } finally { config.consoleApiSecret = saved; }
});

test('POST: chữ ký gắn với nội dung (sửa nội dung thì sai) và không phát lại được', async () => {
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ panel: 'withdrawals', rowId: '00000000-0000-4000-8000-000000000001', inputs: {} });
  const sig = sign(SECRET, String(ts), 'POST', '/admin-api/v1/actions/approve', body);
  const send = (b, s) => fetch(base + '/admin-api/v1/actions/approve', { method: 'POST', headers: { 'content-type': 'application/json', 'x-console-key': KEY, 'x-console-ts': String(ts), 'x-console-sig': s }, body: b });
  assert.equal((await send(body.replace('0001', '0002'), sig)).status, 401, 'đổi nội dung thì chữ ký sai');
  assert.equal((await send(body, sig)).status, 200);
  assert.equal((await send(body, sig)).status, 401, 'phát lại bị chặn');
});

test('giao thức v1: mọi phản hồi qua bộ kiểm tra của cổng', async () => {
  const m = await get('/manifest', C.manifest);
  assert.equal(m.app.id, 'ship');
  assert.deepEqual(m.capabilities.sort(), ['money', 'panels', 'users']);
  await get('/health', C.health);
  const s = await get('/summary', C.summary);
  assert.ok(s.kpis.length >= 6);
  await get('/users?limit=10', C.usersPage);
  await get('/cash?limit=10', C.cashPage);
  await get('/balances', C.balances);
  const p = await get('/panels', C.panels);
  assert.deepEqual(p.items.map((x) => x.id).sort(), ['attention', 'bank', 'claims', 'orders', 'pricing', 'withdrawals']);
  for (const x of p.items) await get('/panels/' + x.id, C.panelData);
  assert.equal((await call('GET', '/panels/khong-co')).status, 404);
  assert.equal((await call('GET', '/users/abc')).status, 404);
});

test('người dùng: phân trang theo con trỏ, chi tiết đầy đủ', async () => {
  const ids = []; for (let i = 0; i < 5; i++) ids.push(await newUser());
  const p1 = await get('/users?limit=3', C.usersPage);
  assert.equal(p1.items.length, 3);
  assert.equal(p1.hasMore, true);
  const p2 = await get('/users?limit=3&after=' + p1.next, C.usersPage);
  assert.ok(p2.items.every((u) => Number(u.id) > Number(p1.next)));
  const all = []; let cur = '0';
  for (;;) { const r = await get('/users?limit=2&after=' + cur, C.usersPage); all.push(...r.items); if (!r.hasMore) break; cur = r.next; }
  assert.ok(all.length >= 5);
  assert.equal(new Set(all.map((u) => u.id)).size, all.length, 'không lặp');
  const d = await get('/users/' + ids[0], C.userDetail);
  assert.ok(d.fields.some((f) => f.label === 'Số dư ví'));
  assert.equal((await call('GET', '/users/99999999')).status, 404);
});

test('dòng tiền: nạp ví là tiền vào ngân hàng (không phải doanh thu); đơn thành công có doanh thu và giá vốn; hủy hoàn lại', async () => {
  const before0 = await get('/cash?limit=1000', C.cashPage);
  const cursor = before0.next || '0';
  const u = await newUser();
  await makeCreated(u, { funds: 300000 });
  const page = await get('/cash?limit=1000&after=' + cursor, C.cashPage);
  const kinds = (k) => page.items.filter((i) => i.kind === k);
  assert.ok(kinds('cash_in').some((i) => i.amount === 300000 && i.category === 'Nạp ví'), 'nạp ví = tiền vào ngân hàng');
  assert.equal(kinds('revenue').filter((i) => i.category === 'Cước vận chuyển').length, 1, 'một khoản doanh thu cho đơn');
  assert.equal(kinds('expense').filter((i) => i.category === 'Giá vốn hãng').length, 1, 'một khoản giá vốn');
  assert.ok(page.items.every((i) => i.amount > 0 && Number.isInteger(i.amount)));
  const rev = kinds('revenue')[0];
  const exp = kinds('expense').find((i) => i.category === 'Giá vốn hãng');
  assert.ok(rev.amount > exp.amount, 'doanh thu lớn hơn giá vốn (có biên)');
  assert.ok(page.items.find((i) => i.kind === 'cash_in').phone, 'gắn được số điện thoại');
  // đọc tiếp từ con trỏ cuối không trả lại bản ghi cũ
  const again = await get('/cash?limit=1000&after=' + page.next, C.cashPage);
  assert.equal(again.items.length, 0);
});

test('dòng tiền: hủy đơn có hoàn tiền; rút tiền đã chi là tiền ra ngân hàng; nạp ký quỹ là tiền ra', async () => {
  const u = await newUser();
  const c0 = (await get('/cash?limit=1000', C.cashPage)).next || '0';
  const o = await makeCreated(u, { funds: 300000 });
  await lifecycle.cancel(u, o.id);
  const w = await withdrawals.request(u, { amount: 100000, bankAccount: { bank: 'VCB', number: '0123456789', holder: 'A B' } }, key());
  await query("UPDATE withdrawals SET not_before = now() - interval '1 second'");
  for (const a of ['approve', 'start']) await withdrawals.transition(w.id, a);
  await withdrawals.transition(w.id, 'paid', { bankRef: 'FT1' });
  await (await import('../src/admin.js')).recordAggregatorDeposit('t', 5_000_000, 'DEP-CON-' + Date.now(), 'thử');
  const page = await get('/cash?limit=1000&after=' + c0, C.cashPage);
  const has = (k, cat) => page.items.some((i) => i.kind === k && i.category === cat);
  assert.ok(has('expense', 'Hoàn tiền đơn'), 'hoàn tiền khi hủy ghi giảm doanh thu');
  assert.ok(has('revenue', 'Hãng hoàn cước'), 'hãng hoàn cước');
  assert.ok(has('cash_out', 'Rút tiền của khách'));
  assert.ok(has('cash_out', 'Ký quỹ đơn vị tổng hợp'));
  // doanh thu ròng của đơn đã hủy bằng 0 (không phí hủy): cộng - trừ
  const net = (cat) => page.items.filter((i) => i.phone && i.kind === 'revenue').reduce((a, i) => a + i.amount, 0);
  void net;
  const revenue = page.items.filter((i) => i.kind === 'revenue' && i.category !== 'Hãng hoàn cước').reduce((a, i) => a + i.amount, 0);
  const refunded = page.items.filter((i) => i.kind === 'expense' && i.category === 'Hoàn tiền đơn').reduce((a, i) => a + i.amount, 0);
  assert.equal(revenue - refunded, 0, 'đơn hủy: doanh thu về 0');
});

test('số dư: tiền khách giữ hộ = ví + tạm giữ + đang rút', async () => {
  const u = await newUser();
  await fund(u, 250000);
  const b = await get('/balances', C.balances);
  const funds = b.items.find((i) => i.kind === 'customer_funds').amount;
  const direct = (await query("SELECT COALESCE(-SUM(e.amount),0)::bigint s FROM ledger_entries e JOIN accounts a ON a.id=e.account_id WHERE a.owner_type='user' AND a.kind IN ('user_wallet','user_hold','hold_buffer','withdrawal_pending')"))[0].s;
  assert.equal(funds, Number(direct));
  assert.ok(funds >= 250000);
});

test('bảng và hành động: rút tiền duyệt → chi; không làm được thì trả ok:false chứ không lỗi hệ thống', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const w = await withdrawals.request(u, { amount: 100000, bankAccount: { bank: 'VCB', number: '0123456789', holder: 'A B' } }, key());
  const rows = (await get('/panels/withdrawals', C.panelData)).rows;
  assert.ok(rows.some((r) => r._id === w.id && r.status === 'requested'));
  // chưa đến hạn duyệt (tài khoản mới) -> ok:false kèm lý do
  let r = await call('POST', '/actions/approve', { body: { panel: 'withdrawals', rowId: w.id, inputs: {} } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, false);
  assert.match(r.json.message, /chưa đến thời điểm/);
  await query("UPDATE withdrawals SET not_before = now() - interval '1 second' WHERE id=$1", [w.id]);
  for (const [a, extra] of [['approve', {}], ['start', {}], ['paid', { bankRef: 'FT-CON-1' }]]) {
    r = await call('POST', '/actions/' + a, { body: { panel: 'withdrawals', rowId: w.id, inputs: extra } });
    assert.equal(r.json.ok, true, a + ' ' + JSON.stringify(r.json));
  }
  assert.equal((await query('SELECT status FROM withdrawals WHERE id=$1', [w.id]))[0].status, 'paid');
  const audit = await query("SELECT count(*)::int n FROM admin_audit WHERE admin='console'");
  assert.ok(audit[0].n >= 3, 'thao tác từ cổng được ghi nhật ký');
  assert.equal((await call('POST', '/actions/khong-co', { body: { rowId: 'x' } })).json.ok, false);
  assert.equal((await call('POST', '/actions/approve', { body: { rowId: 'khong-phai-uuid' } })).json.ok, false, 'mã dòng sai không gây lỗi hệ thống');
});

test('hành động: đơn "không rõ" xử lý từ cổng; ghép tiền về; khiếu nại', async () => {
  // đơn không rõ: hãng không tra theo tham chiếu, timeout sau khi tạo
  const u = await newUser();
  await fund(u, 300000);
  const { q, offer } = await getOffer(u, 'mock-tietkiem');
  const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
  mockControl.set('mock-tietkiem', 'createShipment', 'timeout_after');
  await worker.runOnce({ shipmentId: shipment.id });
  config.unknownCreateHours = 0; await query('UPDATE outbox SET next_at = now()');
  await worker.runOnce({ shipmentId: shipment.id });
  config.unknownCreateHours = 2;
  const att = (await get('/panels/attention', C.panelData)).rows.find((r) => r._id === shipment.id);
  assert.ok(att && att.payment === 'held');
  let r = await call('POST', '/actions/resolve_not_created', { body: { panel: 'attention', rowId: shipment.id, inputs: {} } });
  assert.equal(r.json.ok, true);
  assert.equal((await query('SELECT payment_status FROM shipments WHERE id=$1', [shipment.id]))[0].payment_status, 'released');
  // hành động lặp lại: không làm hai lần
  r = await call('POST', '/actions/resolve_not_created', { body: { panel: 'attention', rowId: shipment.id, inputs: {} } });
  assert.equal(r.json.ok, false);
  // ghép tiền về
  const topup = await import('../src/topup.js');
  await topup.ingestBankTx({ bankTxId: 'CON-BT-' + u, amount: 77000, content: 'khong ma' });
  r = await call('POST', '/actions/match_user', { body: { panel: 'bank', rowId: 'CON-BT-' + u, inputs: { userId: String(u) } } });
  assert.equal(r.json.ok, true, r.json.message);
  assert.equal((await query('SELECT status FROM bank_inbox WHERE bank_tx_id=$1', ['CON-BT-' + u]))[0].status, 'matched');
  // khiếu nại
  const o = await makeCreated(await newUser());
  const owner = (await query('SELECT user_id FROM shipments WHERE id=$1', [o.id]))[0].user_id;
  const cl = await claims.create(owner, { shipmentId: o.id, kind: 'lost', description: 'Mất hàng khi giao' });
  r = await call('POST', '/actions/claim_forward', { body: { panel: 'claims', rowId: String(cl.id), inputs: { partnerRef: 'KN-1' } } });
  assert.equal(r.json.ok, true);
  r = await call('POST', '/actions/claim_resolve', { body: { panel: 'claims', rowId: String(cl.id), inputs: { compensation: '30000', note: 'hãng đền' } } });
  assert.equal(r.json.ok, true, r.json.message);
  const a = await tx((c) => ledger.audit(c));
  assert.deepEqual(a.unbalanced, []);
  assert.equal(a.total, 0);
});

test('tóm tắt phản ánh hàng đợi: cảnh báo có liên kết tới đúng bảng', async () => {
  const u = await newUser();
  await fund(u, 100000);
  await withdrawals.request(u, { amount: 60000, bankAccount: { bank: 'VCB', number: '0123456789', holder: 'A B' } }, key());
  const s = await get('/summary', C.summary);
  assert.ok(s.alerts.some((a) => a.panel === 'withdrawals'));
  assert.ok(s.kpis.find((k) => k.id === 'customer_funds').value > 0);
});
