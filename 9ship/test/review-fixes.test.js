// Các lỗi do review độc lập phát hiện: mỗi test tái hiện kịch bản gây lỗi.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, tx } from '../src/db.js';
import { config, productionProblems } from '../src/config.js';
import * as ledger from '../src/ledger.js';
import * as orders from '../src/orders.js';
import * as worker from '../src/worker.js';
import * as lifecycle from '../src/lifecycle.js';
import * as topup from '../src/topup.js';
import * as registry from '../src/carriers/index.js';
import { resetBreakers } from '../src/rating.js';
import { mockControl } from '../src/carriers/mock.js';
import { syncPickupPoints } from '../src/places.js';
import { setup, close, newUser, fund, wallet, acct, due, makeCreated, getOffer, key, SENDER, RECEIVER } from './helpers.js';

before(async () => { await setup(); await syncPickupPoints(); worker.workerOpts.reconcileMinAgeMs = 0; });
after(close);
beforeEach(() => { mockControl.reset(); resetBreakers(); config.unknownCreateHours = 2; config.bufferTtlHours = 336; worker.workerOpts.confirmations = 2; });

const auditOk = async () => { const a = await tx((c) => ledger.audit(c)); assert.deepEqual(a.unbalanced, []); assert.equal(a.total, 0); };
const row = async (id) => (await query('SELECT * FROM shipments WHERE id=$1', [id]))[0];
const codeOf = async (id) => (await row(id)).carrier_code;

test('[1] cước tăng vượt hạn mức ví: sự kiện vẫn được ghi nhận và áp dụng, 9Ship chịu phần không thu được, đơn gắn cờ', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { funds: 100000 });
  const code = await codeOf(o.id);
  const w0 = await wallet(u);
  const cost0 = (await row(o.id)).cost_price;
  // cước tăng lớn hơn đệm + số dư + hạn mức âm
  const bump = o.buffer + w0 + config.walletOverdraftCap + 40000;
  const n = await lifecycle.ingest('mock-chuan', [{ eventId: 'big1', code, status: 'delivered', feeTotal: cost0 + bump }]);
  assert.equal(n, 1);
  const sh = await row(o.id);
  assert.equal(sh.shipping_status, 'delivered', 'trạng thái vẫn được cập nhật');
  assert.equal(sh.needs_attention, 'fee_unpaid');
  assert.equal(sh.absorbed, 40000);
  assert.equal(await wallet(u), -config.walletOverdraftCap, 'ví xuống đúng hạn mức, không hơn');
  assert.equal(sh.fee_confirmed, cost0 + bump, 'cước hãng đã tính được ghi nhận đủ');
  // gửi lại cùng sự kiện: không áp dụng thêm
  assert.equal(await lifecycle.ingest('mock-chuan', [{ eventId: 'big1', code, status: 'delivered', feeTotal: cost0 + bump }]), 0);
  assert.equal(await wallet(u), -config.walletOverdraftCap);
  await auditOk();
});

test('[1b] feeTotal không hợp lệ không làm mất sự kiện hay trạng thái, chỉ gắn cờ', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const code = await codeOf(o.id);
  await lifecycle.ingest('mock-chuan', [{ eventId: 'bad1', code, status: 'picked_up', feeTotal: 12.5 }]);
  const sh = await row(o.id);
  assert.equal(sh.shipping_status, 'picked_up');
  assert.equal(sh.needs_attention, 'fee_invalid');
  await auditOk();
});

test('[2] sau khi hủy có phí giữ lại, sự kiện cập nhật cước không hoàn tiền lần hai', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const code = await codeOf(o.id);
  await lifecycle.ingest('mock-chuan', [{ eventId: 'c1', code, status: 'cancelled', feeTotal: 5000 }]);
  const sh = await row(o.id);
  assert.equal(sh.payment_status, 'partially_refunded');
  const after1 = await wallet(u);
  assert.equal(after1, o.funds - 5000, 'khách chỉ mất phí hủy 5.000');
  await lifecycle.ingest('mock-chuan', [{ eventId: 'c2', code, status: 'fee_update', feeTotal: 1000 }]);
  assert.equal(await wallet(u), after1, 'không hoàn thêm');
  const r = await lifecycle.applyFee(o.id, 500, { source: 'statement', sourceEventId: 'x9' });
  assert.equal(r.reason, 'closed');
  await auditOk();
});

test('[3] cước giảm lại: giảm phần 9Ship đã chịu trước, khách không được hoàn quá số đã trả', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const sh0 = await row(o.id);
  const sell0 = sh0.sell_price;
  const cost0 = sh0.cost_price;
  // tăng 5000 nhưng niêm yết cho phép khách trả thêm 3000 -> 9Ship chịu 2000
  await lifecycle.applyFee(o.id, cost0 + 5000, { source: 'webhook', sourceEventId: 'a1', listTotal: sell0 + 3000 });
  let sh = await row(o.id);
  assert.equal(sh.sell_price, sell0 + 3000);
  assert.equal(sh.absorbed, 2000);
  // cước về như cũ: khách chỉ được hoàn 3000, 2000 còn lại là giảm phần 9Ship chịu
  const w = await wallet(u);
  const buf = await acct(u, 'hold_buffer');
  const r = await lifecycle.applyFee(o.id, cost0, { source: 'webhook', sourceEventId: 'a2' });
  assert.equal(r.customerDelta, -3000);
  assert.equal(r.absorbedBack, 2000);
  sh = await row(o.id);
  assert.equal(sh.sell_price, sell0, 'giá khách trả trở lại đúng giá ban đầu');
  assert.equal(sh.absorbed, 0);
  assert.equal(await wallet(u), w + 3000);
  void buf;
  await auditOk();
});

test('[4] hai thông báo tiền về cùng mã nạp đồng thời: một cái cộng ví, cái kia vào hàng đợi, không mất dấu', async () => {
  const u = await newUser();
  const t = await topup.create(u, 150000);
  const rs = await Promise.all([
    topup.ingestBankTx({ bankTxId: 'RACE-A-' + u, amount: 150000, content: t.code }),
    topup.ingestBankTx({ bankTxId: 'RACE-B-' + u, amount: 150000, content: t.code }),
  ]);
  assert.deepEqual(rs.map((r) => r.status).sort(), ['matched', 'needs_review']);
  assert.equal(await wallet(u), 150000);
  const inbox = await query("SELECT bank_tx_id, status FROM bank_inbox WHERE bank_tx_id LIKE $1", ['RACE-%-' + u]);
  assert.deepEqual(inbox.map((x) => x.status).sort(), ['matched', 'needs_review']);
  await auditOk();
});

test('[5] adapter vắng mặt khi đối soát: không nhả tiền, vào hàng đợi quản trị', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
  mockControl.set('mock-chuan', 'createShipment', 'timeout_after');
  await worker.runOnce({ shipmentId: shipment.id });
  const saved = registry.get('mock-chuan');
  registry.unregister('mock-chuan');
  try {
    await due();
    assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'attention');
    const sh = await row(shipment.id);
    assert.equal(sh.payment_status, 'held');
    assert.equal(sh.needs_attention, 'adapter_missing');
  } finally { registry.register(saved); }
});

test('[5b] chỉ nhả tiền khi đối soát hai lần liên tiếp đều "hãng chưa có đơn"', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
  mockControl.set('mock-chuan', 'createShipment', 'timeout_before');
  await worker.runOnce({ shipmentId: shipment.id });
  await due();
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'reconciling', 'lần đầu chưa đủ chắc');
  assert.equal((await row(shipment.id)).payment_status, 'held');
  await due();
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'failed');
  assert.equal((await row(shipment.id)).payment_status, 'released');
});

test('[5c] hãng tạo đơn muộn giữa hai lần đối soát: lần sau tìm thấy, không nhả tiền', async () => {
  const u = await newUser();
  await fund(u, 200000);
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
  mockControl.set('mock-chuan', 'createShipment', 'timeout_before');
  await worker.runOnce({ shipmentId: shipment.id });
  await due();
  await worker.runOnce({ shipmentId: shipment.id }); // lần 1: chưa thấy
  // hãng xử lý chậm rồi tạo đơn
  const ref = (await row(shipment.id)).carrier_ref;
  await registry.get('mock-chuan').createShipment({ ref, expectedFee: (await row(shipment.id)).cost_price });
  await due();
  assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'created');
  assert.equal((await row(shipment.id)).payment_status, 'captured');
});

test('[6] hãng tự hủy đơn chưa lấy hàng: hoàn tiền; đã lấy hàng mà hủy: gắn cờ, không tự hoàn', async () => {
  const u = await newUser();
  const o1 = await makeCreated(u);
  const c1 = await codeOf(o1.id);
  const before1 = await wallet(u);
  await lifecycle.ingest('mock-chuan', [{ eventId: 'k1', code: c1, status: 'cancelled', note: 'không lấy được hàng' }]);
  const s1 = await row(o1.id);
  assert.equal(s1.cancel_status, 'confirmed');
  assert.equal(s1.payment_status, 'refunded');
  assert.equal(await wallet(u), before1 + o1.offer.sellPrice + o1.buffer);
  const u2 = await newUser();
  const o2 = await makeCreated(u2);
  const c2 = await codeOf(o2.id);
  await lifecycle.ingest('mock-chuan', [{ eventId: 'p1', code: c2, status: 'picked_up' }, { eventId: 'k2', code: c2, status: 'cancelled' }]);
  const s2 = await row(o2.id);
  assert.equal(s2.payment_status, 'captured');
  assert.equal(s2.needs_attention, 'carrier_cancelled');
  await auditOk();
});

test('[7] hãng chỉ báo cân: tra bảng giá niêm yết để áp trần', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const code = await codeOf(o.id);
  const sh0 = await row(o.id);
  await query(`INSERT INTO list_prices(carrier, service, route, max_weight_g, price, source, owner)
               VALUES('mock-chuan','standard','*',5000,$1,'test','qa')`, [sh0.sell_price + 1000]);
  await lifecycle.ingest('mock-chuan', [{ eventId: 'w1', code, status: 'in_transit', feeTotal: sh0.cost_price + 6000, weightG: 3000 }]);
  const sh = await row(o.id);
  assert.equal(sh.sell_price, sh0.sell_price + 1000, 'khách chỉ trả thêm tới niêm yết của cân mới');
  assert.equal(sh.absorbed, 5000);
  await query("DELETE FROM list_prices WHERE carrier='mock-chuan'");
  await auditOk();
});

test('[8] production từ chối cấu hình không an toàn', () => {
  const good = { production: true, mockCarriers: false, signSecret: 'x'.repeat(40), otpProvider: 'webhook', otpDev: false };
  assert.deepEqual(productionProblems(good), []);
  assert.ok(productionProblems({ ...good, mockCarriers: true }).length === 1);
  assert.ok(productionProblems({ ...good, signSecret: 'dev-sign-secret-change-me' }).length === 1);
  assert.ok(productionProblems({ ...good, signSecret: 'ngan' }).length === 1);
  assert.ok(productionProblems({ ...good, otpProvider: 'console' }).length === 1);
  assert.ok(productionProblems({ ...good, otpDev: true }).length === 1);
  assert.deepEqual(productionProblems({ production: false, mockCarriers: true, signSecret: 'x' }), []);
});

test('[9] đệm dùng hết cho điều chỉnh thì đóng cờ buffer_open', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const cost0 = (await row(o.id)).cost_price;
  await lifecycle.applyFee(o.id, cost0 + o.buffer, { source: 'webhook', sourceEventId: 'z1' });
  const sh = await row(o.id);
  assert.equal(sh.buffer_amount, 0);
  assert.equal(sh.buffer_open, false);
});

test('[10] adapter treo khi tạo đơn: hết thời gian chờ, coi là không rõ và đối soát, không chặn các đơn khác', async () => {
  const u = await newUser();
  await fund(u, 300000);
  const a = registry.get('mock-chuan');
  const orig = a.createShipment;
  config.createTimeoutMs = 150;
  const { q, offer } = await getOffer(u);
  const { shipment } = await orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
  a.createShipment = () => new Promise(() => {}); // không bao giờ trả lời
  try {
    const t0 = Date.now();
    assert.equal((await worker.runOnce({ shipmentId: shipment.id }))[0].result, 'unknown');
    assert.ok(Date.now() - t0 < 3000);
    assert.equal((await row(shipment.id)).payment_status, 'held');
  } finally { a.createShipment = orig; config.createTimeoutMs = 30000; }
});
