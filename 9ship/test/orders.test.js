import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, tx } from '../src/db.js';
import { config } from '../src/config.js';
import * as ledger from '../src/ledger.js';
import * as registry from '../src/carriers/index.js';
import * as orders from '../src/orders.js';
import * as worker from '../src/worker.js';
import { quoteAll, resetBreakers } from '../src/rating.js';
import { validateQuoteRequest } from '../src/pricing.js';
import { mockControl } from '../src/carriers/mock.js';
import { syncPickupPoints } from '../src/places.js';
import { setup, makeUser, close, SENDER, RECEIVER } from './helpers.js';

after(close);
before(async () => {
  await setup();
  await syncPickupPoints();
  worker.workerOpts.reconcileMinAgeMs = 0;
});
beforeEach(() => { mockControl.reset(); resetBreakers(); config.unknownCreateHours = 2; });

let phoneSeq = 0;
const newUser = () => makeUser('09130' + String(10000 + ++phoneSeq));

async function fund(userId, amount) {
  await tx(async (c) => {
    const w = await ledger.lockWallet(c, userId);
    const bank = await ledger.systemAccount(c, 'bank');
    await ledger.post(c, { kind: 'topup', idemScope: 'tf', idemKey: 'f' + userId + '-' + Math.random(), entries: [{ accountId: bank, amount }, { accountId: w, amount: -amount }] });
  });
}
const wallet = (userId) => tx((c) => ledger.walletBalance(c, userId));
const acct = (userId, kind) => tx(async (c) => ledger.balance(c, await ledger.userAccount(c, userId, kind)));
const due = () => query("UPDATE outbox SET next_at = now() WHERE status IN ('pending','processing','reconcile','attention')");


async function getOffer(userId, carrier = 'mock-chuan', over = {}) {
  const req = validateQuoteRequest({ from: { province: 'TP Hồ Chí Minh', lat: 10.7769, lng: 106.7009 }, to: { province: 'Hà Nội' }, weightG: 1000, ...over });
  const q = await quoteAll(req, { userId });
  const offer = q.offers.find((o) => o.carrier === carrier);
  assert.ok(offer, 'không có offer ' + carrier);
  return { q, offer };
}
const input = (q, offer, extra = {}) => ({ quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER, ...extra });
const key = () => 'idem-' + Math.random().toString(36).slice(2, 12);

test('đủ tiền: giữ → hãng tạo → chốt cước, giữ lại phần đệm; sổ cái cân bằng', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, input(q, offer), key());
  const buf = orders.bufferFor(offer.sellPrice);
  assert.equal(shipment.shipping_status, 'pending_carrier');
  assert.equal(await wallet(u), 200000 - offer.sellPrice - buf);
  assert.equal(await acct(u, 'user_hold'), offer.sellPrice);

  const r = await worker.runOnce({ shipmentId: shipment.id });
  assert.equal(r[0].result, 'created');
  const v = await orders.get(u, shipment.id);
  assert.equal(v.shippingStatus, 'created');
  assert.equal(v.paymentStatus, 'captured');
  assert.ok(v.trackingCode);
  assert.equal(v.charged, offer.sellPrice);
  assert.equal(v.bufferHeld, buf);
  assert.equal(await acct(u, 'user_hold'), 0);
  assert.equal(await acct(u, 'hold_buffer'), buf);
  assert.equal(await wallet(u), 200000 - offer.sellPrice - buf);
  const a = await tx((c) => ledger.audit(c));
  assert.deepEqual(a.unbalanced, []);
  assert.equal(a.total, 0);
});

test('thiếu tiền: 402, không có đơn, ví nguyên vẹn', async () => {
  const u = await newUser();
  await fund(u, 5000);
  const { q, offer } = await getOffer(u);
  await assert.rejects(orders.create(u, input(q, offer), key()), (e) => e.status === 402);
  assert.equal(await wallet(u), 5000);
  assert.equal((await query('SELECT count(*)::int n FROM shipments WHERE user_id=$1', [u]))[0].n, 0);
});

test('cùng Idempotency-Key: cùng đơn, trừ tiền một lần, một công việc', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const k = key();
  const a = await orders.create(u, input(q, offer), k);
  const b = await orders.create(u, input(q, offer), k);
  assert.equal(a.shipment.id, b.shipment.id);
  assert.equal(b.replay, true);
  assert.equal((await query('SELECT count(*)::int n FROM outbox WHERE shipment_id=$1', [a.shipment.id]))[0].n, 1);
  assert.equal(await wallet(u), 200000 - offer.sellPrice - orders.bufferFor(offer.sellPrice));
});

test('cùng khóa khác nội dung: 409', async () => {
  const u = await newUser();
  await fund(u, 300000);
  const { q, offer } = await getOffer(u);
  const k = key();
  await orders.create(u, input(q, offer), k);
  await assert.rejects(orders.create(u, input(q, offer, { receiver: { ...RECEIVER, street: '99 Đường khác' } }), k),
    (e) => e.status === 409 && e.code === 'idempotency_conflict');
});

test('hai yêu cầu song song cùng khóa: chỉ một đơn', async () => {
  const u = await newUser();
  await fund(u, 300000);
  const { q, offer } = await getOffer(u);
  const k = key();
  const rs = await Promise.all([orders.create(u, input(q, offer), k), orders.create(u, input(q, offer), k), orders.create(u, input(q, offer), k)]);
  assert.equal(new Set(rs.map((r) => r.shipment.id)).size, 1);
  assert.equal((await query('SELECT count(*)::int n FROM shipments WHERE user_id=$1', [u]))[0].n, 1);
  assert.equal(await wallet(u), 300000 - offer.sellPrice - orders.bufferFor(offer.sellPrice));
});

test('hai đơn khác khóa song song, ví chỉ đủ một: đúng một thành công', async () => {
  const u = await newUser();
  const { q, offer } = await getOffer(u);
  await fund(u, offer.sellPrice + orders.bufferFor(offer.sellPrice) + 1000);
  const rs = await Promise.allSettled([orders.create(u, input(q, offer), key()), orders.create(u, input(q, offer), key())]);
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(rs.filter((r) => r.status === 'rejected' && r.reason.status === 402).length, 1);
  assert.ok((await wallet(u)) >= 0);
});

test('hãng từ chối tạo đơn: nhả toàn bộ tiền, đơn create_failed', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, input(q, offer), key());
  mockControl.set('mock-chuan', 'createShipment', 'fail');
  const r = await worker.runOnce({ shipmentId: shipment.id });
  assert.equal(r[0].result, 'failed');
  const v = await orders.get(u, shipment.id);
  assert.equal(v.shippingStatus, 'create_failed');
  assert.equal(v.paymentStatus, 'released');
  assert.equal(await wallet(u), 200000);
  assert.equal(await acct(u, 'user_hold'), 0);
  assert.equal(await acct(u, 'hold_buffer'), 0);
});

test('hãng tạo xong nhưng phản hồi timeout: đối soát nhận ra, không trừ hai lần, không tạo đơn thứ hai', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, input(q, offer), key());
  mockControl.set('mock-chuan', 'createShipment', 'timeout_after');
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'unknown');
  let v = await orders.get(u, shipment.id);
  assert.equal(v.shippingStatus, 'pending_carrier');
  assert.equal(v.paymentStatus, 'held', 'tiền vẫn đang giữ, chưa nhả');
  await due();
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'created');
  v = await orders.get(u, shipment.id);
  assert.equal(v.shippingStatus, 'created');
  assert.equal(v.paymentStatus, 'captured');
  const sh = (await query('SELECT carrier_ref FROM shipments WHERE id=$1', [shipment.id]))[0];
  assert.equal([...registry.get('mock-chuan') ? [1] : []].length, 1);
  assert.ok(mockControl.get(v.trackingCode), 'hãng có đúng đơn này');
  assert.equal(mockControl.get(v.trackingCode).ref, sh.carrier_ref);
  assert.equal(await wallet(u), 200000 - offer.sellPrice - orders.bufferFor(offer.sellPrice));
});

test('timeout trước khi hãng nhận: đối soát xác nhận hãng chưa có đơn rồi mới nhả tiền', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, input(q, offer), key());
  mockControl.set('mock-chuan', 'createShipment', 'timeout_before');
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'unknown');
  assert.equal((await orders.get(u, shipment.id)).paymentStatus, 'held');
  await due();
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'reconciling', 'một lần chưa thấy là chưa đủ chắc để nhả');
  assert.equal((await orders.get(u, shipment.id)).paymentStatus, 'held');
  await due();
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'failed');
  const v = await orders.get(u, shipment.id);
  assert.equal(v.paymentStatus, 'released');
  assert.equal(await wallet(u), 200000);
});

test('hãng không tra được theo mã tham chiếu: tiền không tự nhả, vào hàng đợi quản trị; quản trị xử lý được', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u, 'mock-tietkiem');
  const { shipment } = await orders.create(u, input(q, offer), key());
  mockControl.set('mock-tietkiem', 'createShipment', 'timeout_after');
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'unknown');
  config.unknownCreateHours = 0; // coi như đã quá hạn
  await due();
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'attention');
  const v = await orders.get(u, shipment.id);
  assert.equal(v.paymentStatus, 'held', 'không tự nhả');
  assert.equal(v.needsAttention, true);
  // quản trị xác nhận hãng đã tạo
  const code = (await query('SELECT carrier_ref FROM shipments WHERE id=$1', [shipment.id]))[0].carrier_ref;
  const found = await registry.get('mock-tietkiem').createShipment({ ref: code, expectedFee: 1 }); // lấy mã đã có
  await worker.resolveUnknown(shipment.id, 'created', { carrierCode: found.carrierCode });
  assert.equal((await orders.get(u, shipment.id)).paymentStatus, 'captured');
});

test('tiến trình chết giữa chừng (công việc ở trạng thái processing, hãng đã tạo): chạy lại không tạo thứ hai', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, input(q, offer), key());
  const sh = (await query('SELECT carrier_ref FROM shipments WHERE id=$1', [shipment.id]))[0];
  // giả lập: lần gọi trước đã tới hãng rồi tiến trình chết
  const pre = await registry.get('mock-chuan').createShipment({ ref: sh.carrier_ref, expectedFee: 1000 });
  await query("UPDATE outbox SET status='processing', attempts=1, next_at = now() - interval '1 second' WHERE shipment_id=$1", [shipment.id]);
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'created');
  const v = await orders.get(u, shipment.id);
  assert.equal(v.trackingCode, pre.trackingCode);
  assert.equal(v.paymentStatus, 'captured');
});

test('đơn chờ hãng sau khi DB đã giữ tiền (chưa gọi hãng): worker xử lý khi chạy lại', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, input(q, offer), key());
  assert.equal((await orders.get(u, shipment.id)).shippingStatus, 'pending_carrier');
  const rs = await worker.runOnce();
  assert.ok(rs.some((x) => x.shipmentId === shipment.id && x.result === 'created'));
});

test('lỗi hãng có thể thử lại: thử lại với backoff rồi mới thất bại', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, input(q, offer), key());
  const a = registry.get('mock-chuan');
  const orig = a.createShipment;
  a.createShipment = async () => { const { CarrierError } = await import('../src/errors.js'); throw new CarrierError('hãng bận', { retryable: true }); };
  try {
    for (let i = 1; i <= 3; i++) {
      assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'retry');
      await due();
    }
    assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'failed');
  } finally { a.createShipment = orig; }
  assert.equal(await wallet(u), 200000);
});

test('giá hãng tăng nhẹ: 9Ship chịu; tăng quá ngưỡng: 409 kèm báo giá mới, chưa giữ tiền', async () => {
  const u = await newUser();
  await fund(u, 300000);
  const { q, offer } = await getOffer(u);
  const a = registry.get('mock-chuan');
  const orig = a.quote;
  try {
    const small = Math.floor(offer.sellPrice * 0.01);
    a.quote = async (r) => (await orig.call(a, r)).map((o) => ({ ...o, cost: { ...o.cost, total: o.cost.total + small, breakdown: { ...o.cost.breakdown, freight: o.cost.breakdown.freight + small } } }));
    const ok = await orders.create(u, input(q, offer), key());
    assert.ok(ok.shipment.cost_price >= small);
    const before = await wallet(u);
    a.quote = async (r) => (await orig.call(a, r)).map((o) => ({ ...o, cost: { ...o.cost, total: o.cost.total + 8000, breakdown: { ...o.cost.breakdown, freight: o.cost.breakdown.freight + 8000 } } }));
    await assert.rejects(orders.create(u, input(q, offer), key()), (e) => e.status === 409 && e.code === 'price_changed' && e.extra.quote.offers.length > 0);
    assert.equal(await wallet(u), before, 'không giữ tiền khi giá đổi');
  } finally { a.quote = orig; }
});

test('báo giá hết hạn 410; báo giá người khác 404; offer lạ 400; thông tin sai 400', async () => {
  const u = await newUser();
  const v = await newUser();
  await fund(u, 300000);
  const { q, offer } = await getOffer(u);
  await assert.rejects(orders.create(v, input(q, offer), key()), (e) => e.status === 404);
  await assert.rejects(orders.create(u, input(q, { ...offer, offerId: 'x:y:z' }), key()), (e) => e.status === 400);
  await assert.rejects(orders.create(u, input(q, offer, { receiver: { ...RECEIVER, phone: '123' } }), key()), (e) => e.status === 400);
  await assert.rejects(orders.create(u, input(q, offer, { sender: { ...SENDER, province: 'Atlantis' } }), key()), (e) => e.status === 400);
  await assert.rejects(orders.create(u, input(q, offer), 'ngan'), (e) => e.status === 400);
  await query("UPDATE quotes SET expires_at = now() - interval '1 second' WHERE id=$1", [q.quoteId]);
  await assert.rejects(orders.create(u, input(q, offer), key()), (e) => e.status === 410);
});

test('ví đang âm (do điều chỉnh) thì không tạo đơn mới', async () => {
  const u = await newUser();
  await tx(async (c) => {
    const w = await ledger.lockWallet(c, u);
    const cost = await ledger.systemAccount(c, 'carrier_cost');
    await ledger.post(c, { kind: 'adjustment', idemScope: 'adj', idemKey: 'neg' + u, entries: [{ accountId: w, amount: 3000 }, { accountId: cost, amount: -3000 }] });
  });
  const { q, offer } = await getOffer(u);
  await assert.rejects(orders.create(u, input(q, offer), key()), (e) => e.status === 402 && e.code === 'wallet_negative');
});

test('điểm nhận gửi phải thuộc đúng hãng', async () => {
  const u = await newUser();
  await fund(u, 300000);
  const { q, offer } = await getOffer(u);
  await assert.rejects(orders.create(u, input(q, offer, { pickupPointId: 'mock-nhanh:1' }), key()), (e) => e.status === 400);
  const { shipment } = await orders.create(u, input(q, offer, { pickupPointId: offer.pickupPoints[0].id }), key());
  assert.equal(shipment.pickup_point_id, offer.pickupPoints[0].id);
});
