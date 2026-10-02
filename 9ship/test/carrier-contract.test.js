import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../src/carriers/index.js';
import { mockControl } from '../src/carriers/mock.js';

// Bộ kiểm thử hợp đồng: chạy trên MỌI adapter đã đăng ký. Adapter thật phải qua bộ này với sandbox.
const REQ = {
  from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' },
  weightG: 800, dims: null, declaredValue: 0, goodsType: 'general', handover: 'dropoff',
};

for (const a of registry.list()) {
  test(`[${a.id}] quote trả cấu trúc đúng, tiền là số nguyên`, async () => {
    const offers = await a.quote(REQ);
    assert.ok(Array.isArray(offers) && offers.length > 0);
    for (const o of offers) {
      assert.equal(typeof o.service, 'string');
      assert.ok(Number.isSafeInteger(o.cost.total) && o.cost.total > 0);
      assert.ok(Array.isArray(o.handovers) && o.handovers.length > 0);
      assert.ok(Array.isArray(o.etaDays) && o.etaDays.length === 2);
      assert.ok(o.listPrice === null || Number.isSafeInteger(o.listPrice));
      const parts = Object.values(o.cost.breakdown).reduce((x, y) => x + y, 0);
      assert.equal(parts, o.cost.total, 'breakdown phải cộng đúng tổng');
    }
  });

  test(`[${a.id}] createShipment idempotent theo ref`, async () => {
    const ref = 'ref-' + a.id + '-' + Date.now();
    const x = await a.createShipment({ ref, expectedFee: 20000, sender: {}, receiver: {}, weightG: 800 });
    const y = await a.createShipment({ ref, expectedFee: 20000, sender: {}, receiver: {}, weightG: 800 });
    assert.equal(x.carrierCode, y.carrierCode);
    if (a.capabilities.findByReference) {
      const f = await a.findByReference(ref);
      assert.equal(f.carrierCode, x.carrierCode);
      assert.equal(await a.findByReference('khong-co'), null);
    }
  });

  test(`[${a.id}] track và cancel`, async () => {
    const ref = 'ref2-' + a.id + '-' + Date.now();
    const x = await a.createShipment({ ref, expectedFee: 20000, sender: {}, receiver: {}, weightG: 800 });
    const ev = await a.track(x.carrierCode);
    assert.ok(Array.isArray(ev) && ev.length >= 1);
    assert.ok(ev[0].eventId && ev[0].status && ev[0].at);
    const c = await a.cancel(x.carrierCode);
    assert.ok(['confirmed', 'rejected', 'pending'].includes(c.status));
  });

  test(`[${a.id}] listPickupPoints có tọa độ`, async () => {
    const pts = await a.listPickupPoints({ lat: 10.77, lng: 106.7 });
    assert.ok(pts.length > 0);
    for (const p of pts) {
      assert.equal(typeof p.lat, 'number');
      assert.equal(typeof p.lng, 'number');
      assert.ok(p.id && p.name);
    }
  });
}

test('mock: hủy sau khi đã lấy hàng bị từ chối', async () => {
  const a = registry.get('mock-nhanh');
  const x = await a.createShipment({ ref: 'r-pick-' + Date.now(), expectedFee: 1, sender: {}, receiver: {}, weightG: 1 });
  mockControl.advance(x.carrierCode, 'picked_up');
  const c = await a.cancel(x.carrierCode);
  assert.equal(c.status, 'rejected');
});

test('mock: webhook sai chữ ký bị từ chối, đúng chữ ký được phân tích', () => {
  const a = registry.get('mock-nhanh');
  const raw = JSON.stringify({ events: [{ eventId: 'e1', code: 'X', status: 'picked_up' }] });
  assert.throws(() => a.parseWebhook({ 'x-signature': 'sai' }, raw), /chữ ký/);
  const ok = a.parseWebhook({ 'x-signature': mockControl.sign(raw) }, raw);
  assert.equal(ok[0].eventId, 'e1');
});
