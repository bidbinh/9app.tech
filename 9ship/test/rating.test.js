import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db.js';
import { validateQuoteRequest, applyMargin, validateRule, ceilTo } from '../src/pricing.js';
import { quoteAll, resetBreakers, health } from '../src/rating.js';
import { mockControl } from '../src/carriers/mock.js';
import { setup, close } from './helpers.js';

after(close);
before(setup);
beforeEach(() => { mockControl.reset(); resetBreakers(); });

const REQ = () => validateQuoteRequest({
  from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' }, weightG: 1200,
});

test('đầu vào xấu bị 400, không NaN', () => {
  const bad = [
    { ...{ from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' } }, weightG: 0 },
    { from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' }, weightG: -5 },
    { from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' }, weightG: 1.5 },
    { from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' }, weightG: NaN },
    { from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' }, weightG: 999999 },
    { from: { province: 'TP Hồ Chí Minh' }, to: { province: 'Hà Nội' }, weightG: '500' },
    { from: { province: 'Không có' }, to: { province: 'Hà Nội' }, weightG: 500 },
    { from: { province: 'Hà Nội' }, weightG: 500 },
    { from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500, dims: { l: 0, w: 1, h: 1 } },
    { from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500, goodsType: 'ma-tuy' },
    { from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500, declaredValue: -1 },
    null,
  ];
  for (const b of bad) assert.throws(() => validateQuoteRequest(b), (e) => e.status === 400, JSON.stringify(b));
});

test('mã tỉnh nhận cả tên có dấu lẫn slug', () => {
  const r = validateQuoteRequest({ from: { province: 'ho-chi-minh' }, to: { province: 'TP Hồ Chí Minh' }, weightG: 300 });
  assert.equal(r.from.province, r.to.province);
});

test('báo giá trả nhiều hãng, rẻ nhất đứng đầu, giá bán không vượt niêm yết', async () => {
  const q = await quoteAll(REQ());
  assert.ok(q.offers.length >= 2);
  const prices = q.offers.map((o) => o.sellPrice);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  assert.ok(q.offers[0].tags.includes('cheapest'));
  for (const o of q.offers) {
    assert.ok(o.capVerified);
    assert.ok(o.sellPrice < o.listPrice, `${o.carrier}: bán ${o.sellPrice} phải thấp hơn niêm yết ${o.listPrice}`);
    assert.equal(o.saved, o.listPrice - o.sellPrice);
  }
});

test('trọng lượng quy đổi lớn hơn thực tế thì dùng quy đổi', async () => {
  const light = await quoteAll(validateQuoteRequest({ from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500 }));
  const big = await quoteAll(validateQuoteRequest({ from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500, dims: { l: 60, w: 50, h: 40 } }));
  const a = light.offers.find((o) => o.carrier === 'mock-nhanh');
  const b = big.offers.find((o) => o.carrier === 'mock-nhanh');
  assert.equal(b.chargeableWeightG, 24000); // 60*50*40/5000 kg
  assert.ok(b.sellPrice > a.sellPrice);
});

test('một hãng lỗi thì bị bỏ nhưng báo giá vẫn trả', async () => {
  mockControl.set('mock-nhanh', 'quote', 'fail');
  const q = await quoteAll(REQ());
  assert.ok(!q.offers.some((o) => o.carrier === 'mock-nhanh'));
  assert.ok(q.offers.length >= 1);
  assert.ok(q.skipped.some((s) => s.carrier === 'mock-nhanh' && s.reason === 'error'));
});

test('hãng chậm quá timeout bị bỏ, tổng thời gian vẫn nhanh', async () => {
  mockControl.set('mock-chuan', 'quote', 'slow');
  const t0 = Date.now();
  const q = await quoteAll(REQ());
  const dt = Date.now() - t0;
  assert.ok(dt < 6000, 'mất ' + dt + 'ms');
  assert.ok(q.skipped.some((s) => s.carrier === 'mock-chuan' && s.reason === 'timeout'));
  assert.ok(q.offers.length >= 1);
});

test('circuit breaker mở sau nhiều lần lỗi liên tiếp', async () => {
  for (let i = 0; i < 5; i++) {
    mockControl.set('mock-nhanh', 'quote', 'fail');
    await quoteAll(REQ());
  }
  const h = health().find((x) => x.id === 'mock-nhanh');
  assert.equal(h.open, true);
  const q = await quoteAll(REQ());
  assert.ok(q.skipped.some((s) => s.carrier === 'mock-nhanh' && s.reason === 'circuit_open'));
});

test('lọc theo phương thức bàn giao: lấy tận nơi loại hãng chỉ nhận tại bưu cục', async () => {
  const req = validateQuoteRequest({ from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500, handover: 'pickup' });
  const q = await quoteAll(req);
  assert.ok(q.offers.length > 0);
  assert.ok(!q.offers.some((o) => o.carrier === 'mock-tietkiem'));
});

test('hãng từ chối loại hàng thì không có offer của hãng đó', async () => {
  const req = validateQuoteRequest({ from: { province: 'Hà Nội' }, to: { province: 'Huế' }, weightG: 500, goodsType: 'electronics' });
  const q = await quoteAll(req);
  assert.ok(!q.offers.some((o) => o.carrier === 'mock-tietkiem'));
});

test('điểm nhận gần nhất theo tọa độ người gửi', async () => {
  const { syncPickupPoints } = await import('../src/places.js');
  assert.ok(await syncPickupPoints() > 0);
  const req = validateQuoteRequest({ from: { province: 'TP Hồ Chí Minh', lat: 10.7769, lng: 106.7009 }, to: { province: 'Hà Nội' }, weightG: 800 });
  const q = await quoteAll(req);
  const o = q.offers[0];
  assert.ok(o.pickupPoints.length > 0);
  assert.ok(o.pickupPoints[0].distanceKm <= o.pickupPoints[o.pickupPoints.length - 1].distanceKm);
  assert.ok(q.offers.some((x) => x.tags.includes('nearest')));
});

// ---- applyMargin ----
const RULE = { id: 1, margin_pct: 8, margin_min: 1000, surcharge: 0, rounding: 500, allow_loss: false, require_cap: true, active: true };
const FRESH = new Date().toISOString();

test('applyMargin: cộng biên và làm tròn lên', () => {
  const m = applyMargin({ cost: 20000, rule: RULE, listPrice: 30000, listVerifiedAt: FRESH });
  assert.equal(m.sellPrice, 21600 % 500 === 0 ? 21600 : ceilTo(21600, 500));
  assert.equal(m.hidden, false);
  assert.equal(m.capped, false);
});

test('applyMargin: chặn trần bằng niêm yết trừ một bậc làm tròn', () => {
  const m = applyMargin({ cost: 27000, rule: RULE, listPrice: 29000, listVerifiedAt: FRESH });
  assert.equal(m.sellPrice, 28500);
  assert.equal(m.capped, true);
  assert.equal(m.hidden, false);
});

test('applyMargin: biên sau chặn trần thấp hơn tối thiểu thì ẩn', () => {
  const m = applyMargin({ cost: 28500, rule: RULE, listPrice: 29000, listVerifiedAt: FRESH });
  assert.equal(m.hidden, true);
  assert.equal(m.reason, 'margin_below_min');
});

test('applyMargin: cho phép bán lỗ khi allow_loss', () => {
  const m = applyMargin({ cost: 29000, rule: { ...RULE, allow_loss: true }, listPrice: 29000, listVerifiedAt: FRESH });
  assert.equal(m.hidden, false);
  assert.ok(m.sellPrice < 29000);
});

test('applyMargin: thiếu trần đáng tin + require_cap thì ẩn; tắt cờ thì hiện', () => {
  const none = applyMargin({ cost: 20000, rule: RULE, listPrice: null, listVerifiedAt: null });
  assert.equal(none.hidden, true);
  assert.equal(none.reason, 'no_verified_cap');
  const old = applyMargin({ cost: 20000, rule: RULE, listPrice: 30000, listVerifiedAt: new Date(Date.now() - 100 * 3600 * 1000).toISOString() });
  assert.equal(old.hidden, true);
  const off = applyMargin({ cost: 20000, rule: { ...RULE, require_cap: false }, listPrice: null, listVerifiedAt: null });
  assert.equal(off.hidden, false);
  assert.equal(off.capVerified, false);
});

test('validateRule: bậc làm tròn không vượt biên tối thiểu', () => {
  assert.throws(() => validateRule({ margin_pct: 8, margin_min: 300, rounding: 500 }), (e) => e.status === 400);
  assert.doesNotThrow(() => validateRule({ margin_pct: 8, margin_min: 1000, rounding: 500 }));
});

test('require_cap bật: adapter không trả niêm yết và bảng list_prices rỗng thì không có offer', async () => {
  const registry = await import('../src/carriers/index.js');
  const base = registry.get('mock-nhanh');
  registry.register({ ...base, id: 'mock-nocap', name: 'Không trần', quote: async (r) => (await base.quote(r)).map((o) => ({ ...o, listPrice: null })) });
  try {
    const q = await quoteAll(REQ());
    assert.ok(!q.offers.some((o) => o.carrier === 'mock-nocap'));
    assert.ok(q.skipped.some((s) => s.carrier === 'mock-nocap' && s.reason === 'no_verified_cap'));
    // bổ sung trần vào bảng list_prices thì offer xuất hiện
    await query(`INSERT INTO list_prices(carrier, service, route, max_weight_g, price, source, owner)
                 VALUES('mock-nocap','express','*',5000, 99000, 'test','qa')`);
    const q2 = await quoteAll(REQ());
    assert.ok(q2.offers.some((o) => o.carrier === 'mock-nocap'));
  } finally {
    registry.unregister('mock-nocap');
    await query("DELETE FROM list_prices WHERE carrier='mock-nocap'");
  }
});
