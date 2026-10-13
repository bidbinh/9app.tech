import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, tx } from '../src/db.js';
import { config } from '../src/config.js';
import * as ledger from '../src/ledger.js';
import * as orders from '../src/orders.js';
import * as worker from '../src/worker.js';
import * as lifecycle from '../src/lifecycle.js';
import { resetBreakers } from '../src/rating.js';
import { mockControl } from '../src/carriers/mock.js';
import { createApp } from '../src/http.js';
import { webhookRoutes } from '../src/routes/webhooks.js';
import { syncPickupPoints } from '../src/places.js';
import { setup, close, newUser, fund, wallet, acct, sysAcct, due, makeCreated, getOffer, key, SENDER, RECEIVER } from './helpers.js';

let app; let base;
before(async () => {
  await setup();
  await syncPickupPoints();
  worker.workerOpts.reconcileMinAgeMs = 0;
  app = createApp();
  webhookRoutes(app);
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); await close(); });
beforeEach(() => { mockControl.reset(); resetBreakers(); config.bufferTtlHours = 336; });

const sendHook = (events, sig) => {
  const raw = JSON.stringify({ events });
  return fetch(base + '/v1/webhooks/mock-nhanh', { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig ?? mockControl.sign(raw) }, body: raw });
};
const codeOf = async (id) => (await query('SELECT carrier_code FROM shipments WHERE id=$1', [id]))[0].carrier_code;
const auditOk = async () => { const a = await tx((c) => ledger.audit(c)); assert.deepEqual(a.unbalanced, []); assert.equal(a.total, 0); };

test('webhook đúng chữ ký đẩy trạng thái tiến; sai chữ ký 401; sự kiện trùng không áp dụng lại', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { carrier: 'mock-nhanh' });
  const code = await codeOf(o.id);
  assert.equal((await sendHook([{ eventId: 'e1', code, status: 'picked_up' }], 'sai')).status, 401);
  assert.equal((await orders.get(u, o.id)).shippingStatus, 'created');
  let r = await (await sendHook([{ eventId: 'e1', code, status: 'picked_up' }])).json();
  assert.equal(r.accepted, 1);
  assert.equal((await orders.get(u, o.id)).shippingStatus, 'picked_up');
  r = await (await sendHook([{ eventId: 'e1', code, status: 'picked_up' }])).json();
  assert.equal(r.accepted, 0);
  await sendHook([{ eventId: 'e2', code, status: 'in_transit' }, { eventId: 'e3', code, status: 'delivered' }]);
  const v = await orders.get(u, o.id);
  assert.equal(v.shippingStatus, 'delivered');
  assert.ok(v.events.length >= 4);
});

test('sự kiện đến sai thứ tự không làm lùi trạng thái; đơn đã giao là cuối', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { carrier: 'mock-nhanh' });
  const code = await codeOf(o.id);
  await sendHook([{ eventId: 'a1', code, status: 'delivered' }]);
  await sendHook([{ eventId: 'a2', code, status: 'picked_up' }, { eventId: 'a3', code, status: 'in_transit' }, { eventId: 'a4', code, status: 'returning' }]);
  assert.equal((await orders.get(u, o.id)).shippingStatus, 'delivered');
});

test('webhook lạ: mã không tồn tại bị bỏ qua; hãng không có webhook trả 404', async () => {
  const r = await (await sendHook([{ eventId: 'z1', code: 'KHONGCO', status: 'picked_up' }])).json();
  assert.equal(r.accepted, 0);
  const r2 = await fetch(base + '/v1/webhooks/mock-chuan', { method: 'POST', body: '{}' });
  assert.equal(r2.status, 404);
});

test('cước tăng: trừ vào tiền đệm trước, ví nguyên; sổ cái cân bằng', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const walletBefore = await wallet(u);
  const code = await codeOf(o.id);
  const fee0 = (await orders.get(u, o.id)).sellPrice;
  void fee0;
  const cost0 = (await query('SELECT cost_price FROM shipments WHERE id=$1', [o.id]))[0].cost_price;
  const r = await lifecycle.applyFee(o.id, cost0 + 2500, { source: 'webhook', sourceEventId: 'f1' });
  assert.equal(r.applied, true);
  assert.equal(r.customerDelta, 2500);
  assert.equal(await wallet(u), walletBefore, 'ví không đổi vì đệm đủ trả');
  assert.equal(await acct(u, 'hold_buffer'), o.buffer - 2500);
  assert.equal((await orders.get(u, o.id)).sellPrice, o.offer.sellPrice + 2500);
  void code;
  await auditOk();
});

test('hai nguồn cùng báo một điều chỉnh (webhook và bảng kê) chỉ ghi một lần', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const cost0 = (await query('SELECT cost_price FROM shipments WHERE id=$1', [o.id]))[0].cost_price;
  await lifecycle.applyFee(o.id, cost0 + 4000, { source: 'webhook', sourceEventId: 'w1' });
  const dup = await lifecycle.applyFee(o.id, cost0 + 4000, { source: 'statement', sourceEventId: 's1' });
  assert.equal(dup.applied, false);
  const same = await lifecycle.applyFee(o.id, cost0 + 4000, { source: 'webhook', sourceEventId: 'w1' });
  assert.equal(same.applied, false);
  assert.equal(await acct(u, 'hold_buffer'), o.buffer - 4000);
  assert.equal((await query('SELECT count(*)::int n FROM adjustments WHERE shipment_id=$1', [o.id]))[0].n, 1);
  await auditOk();
});

test('cước tăng vượt đệm: phần còn lại trừ ví; ví âm có trần và chặn đơn mới', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { funds: 100000 });
  const cost0 = (await query('SELECT cost_price FROM shipments WHERE id=$1', [o.id]))[0].cost_price;
  const walletBefore = await wallet(u);
  await lifecycle.applyFee(o.id, cost0 + o.buffer + 1000, { source: 'webhook', sourceEventId: 'g1' });
  assert.equal(await acct(u, 'hold_buffer'), 0);
  assert.equal(await wallet(u), walletBefore - 1000);
  // đẩy ví xuống âm
  const big = walletBefore + 20000;
  await lifecycle.applyFee(o.id, cost0 + o.buffer + 1000 + big, { source: 'webhook', sourceEventId: 'g2' });
  assert.ok((await wallet(u)) < 0);
  const { q, offer } = await getOffer(u);
  await assert.rejects(orders.create(u, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key()),
    (e) => e.code === 'wallet_negative');
  // vượt hạn mức âm: không ném lỗi (hãng đã tính cước), ví dừng ở hạn mức, 9Ship chịu phần còn lại và đơn bị gắn cờ
  const w1 = await wallet(u);
  const r = await lifecycle.applyFee(o.id, cost0 + 10_000_000, { source: 'webhook', sourceEventId: 'g3' });
  assert.equal(r.applied, true);
  assert.equal(r.flag, 'fee_unpaid');
  assert.equal(await wallet(u), -config.walletOverdraftCap);
  assert.ok(w1 >= -config.walletOverdraftCap);
  await auditOk();
});

test('trần niêm yết: phần hãng thu vượt niêm yết của cân đã xác nhận do 9Ship chịu', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const sh = (await query('SELECT cost_price, sell_price FROM shipments WHERE id=$1', [o.id]))[0];
  const walletBefore = await wallet(u);
  const r = await lifecycle.applyFee(o.id, sh.cost_price + 9000, { source: 'webhook', sourceEventId: 'h1', listTotal: sh.sell_price + 3000 });
  assert.equal(r.customerDelta, 3000);
  assert.equal(r.absorbed, 6000);
  assert.equal((await orders.get(u, o.id)).sellPrice, sh.sell_price + 3000);
  assert.equal(await wallet(u), walletBefore);
  await auditOk();
});

test('cước giảm: hoàn chênh lệch về ví', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const cost0 = (await query('SELECT cost_price FROM shipments WHERE id=$1', [o.id]))[0].cost_price;
  const walletBefore = await wallet(u);
  const r = await lifecycle.applyFee(o.id, cost0 - 2000, { source: 'webhook', sourceEventId: 'd1' });
  assert.equal(r.customerDelta, -2000);
  assert.equal(await wallet(u), walletBefore + 2000);
  await auditOk();
});

test('cước cuối được xác nhận thì nhả phần đệm còn lại', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const cost0 = (await query('SELECT cost_price FROM shipments WHERE id=$1', [o.id]))[0].cost_price;
  const walletBefore = await wallet(u);
  await lifecycle.applyFee(o.id, cost0 + 1000, { source: 'webhook', sourceEventId: 'fin1', final: true });
  assert.equal(await acct(u, 'hold_buffer'), 0);
  assert.equal(await wallet(u), walletBefore + o.buffer - 1000);
  const v = await orders.get(u, o.id);
  assert.equal(v.bufferHeld, 0);
  await auditOk();
});

test('hết hạn đệm sau khi đơn kết thúc: tự nhả đệm về ví', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { carrier: 'mock-nhanh' });
  const code = await codeOf(o.id);
  await sendHook([{ eventId: 'ttl1', code, status: 'delivered' }]);
  assert.equal(await lifecycle.releaseExpiredBuffers(), 0, 'chưa hết hạn');
  config.bufferTtlHours = 0;
  const walletBefore = await wallet(u);
  assert.ok(await lifecycle.releaseExpiredBuffers() >= 1);
  assert.equal(await wallet(u), walletBefore + o.buffer);
  assert.equal(await lifecycle.releaseExpiredBuffers(), 0, 'không nhả hai lần');
  await auditOk();
});

test('hủy khi hãng xác nhận: hoàn đủ cước và đệm về ví', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  const r = await lifecycle.cancel(u, o.id);
  assert.equal(r.status, 'confirmed');
  const v = await orders.get(u, o.id);
  assert.equal(v.cancelStatus, 'confirmed');
  assert.equal(v.shippingStatus, 'cancelled');
  assert.equal(v.paymentStatus, 'refunded');
  assert.equal(await wallet(u), o.funds);
  assert.equal(await acct(u, 'hold_buffer'), 0);
  // hủy lại: idempotent, không hoàn lần hai
  assert.equal((await lifecycle.cancel(u, o.id)).status, 'confirmed');
  assert.equal(await wallet(u), o.funds);
  await auditOk();
});

test('hủy khi hãng từ chối: không hoàn tiền, trạng thái rejected', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  mockControl.set('mock-chuan', 'cancel', 'reject_cancel');
  const r = await lifecycle.cancel(u, o.id);
  assert.equal(r.status, 'rejected');
  const v = await orders.get(u, o.id);
  assert.equal(v.paymentStatus, 'captured');
  assert.equal(await wallet(u), o.funds - o.offer.sellPrice - o.buffer);
});

test('hủy bị timeout: giữ nguyên chờ, việc kiểm tra định kỳ xác nhận sau đó', async () => {
  const u = await newUser();
  const o = await makeCreated(u);
  mockControl.set('mock-chuan', 'cancel', 'timeout_before');
  const r = await lifecycle.cancel(u, o.id);
  assert.equal(r.status, 'requested');
  assert.equal((await orders.get(u, o.id)).paymentStatus, 'captured', 'chưa hoàn khi chưa chắc');
  await due();
  await worker.runOnce({ shipmentId: o.id });
  const v = await orders.get(u, o.id);
  assert.equal(v.cancelStatus, 'confirmed');
  assert.equal(await wallet(u), o.funds);
  await auditOk();
});

test('đơn đã lấy hàng không hủy được (409); đơn đang tạo cũng chưa hủy được', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { carrier: 'mock-nhanh' });
  const code = await codeOf(o.id);
  await sendHook([{ eventId: 'c1', code, status: 'picked_up' }]);
  await assert.rejects(lifecycle.cancel(u, o.id), (e) => e.status === 409 && e.code === 'not_cancellable');
  const u2 = await newUser();
  await fund(u2, 300000);
  const { q, offer } = await getOffer(u2);
  const { shipment } = await orders.create(u2, { quoteId: q.quoteId, offerId: offer.offerId, sender: SENDER, receiver: RECEIVER }, key());
  await assert.rejects(lifecycle.cancel(u2, shipment.id), (e) => e.status === 409);
});

test('đang chờ hủy mà hàng bị lấy: hủy chuyển rejected, không hoàn tiền', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { carrier: 'mock-nhanh' });
  const code = await codeOf(o.id);
  mockControl.set('mock-nhanh', 'cancel', 'timeout_before');
  assert.equal((await lifecycle.cancel(u, o.id)).status, 'requested');
  await sendHook([{ eventId: 'r1', code, status: 'picked_up' }]);
  const v = await orders.get(u, o.id);
  assert.equal(v.cancelStatus, 'rejected');
  assert.equal(v.paymentStatus, 'captured');
});

test('người khác không hủy được đơn của mình (404)', async () => {
  const u = await newUser();
  const other = await newUser();
  const o = await makeCreated(u);
  await assert.rejects(lifecycle.cancel(other, o.id), (e) => e.status === 404);
});

test('hãng không có webhook: polling hành trình cập nhật trạng thái', async () => {
  const u = await newUser();
  const o = await makeCreated(u, { carrier: 'mock-chuan' });
  const code = await codeOf(o.id);
  mockControl.advance(code, 'picked_up');
  mockControl.advance(code, 'in_transit');
  assert.ok(await lifecycle.pollTracking({ everySec: 0 }) >= 2);
  assert.equal((await orders.get(u, o.id)).shippingStatus, 'in_transit');
  assert.equal(await lifecycle.pollTracking({ everySec: 0 }), 0, 'sự kiện cũ không áp dụng lại');
});

test('tổng quan sổ cái sau toàn bộ kịch bản vẫn cân bằng', async () => {
  await auditOk();
  assert.ok(typeof (await sysAcct('revenue')) === 'number');
});
