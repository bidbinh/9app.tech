import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuote } from '../src/pricing.js';

const SETTINGS = { vatPct: 10, extraAdultFee: 100000, childFee: 50000, childFreeMaxAge: 5, childAdultMinAge: 12, depositPct: 30, roundTo: 1000 };
const rates = (obj) => new Map(Object.entries(obj).map(([n, p]) => [n, typeof p === 'number' ? { price: p, minStay: 1, closed: false } : p]));
const base = (over = {}) => ({ nights: ['2026-11-12'], rates: rates({ '2026-11-12': 650000 }), adults: 2, childAges: [], capacityStd: 2, settings: SETTINGS, promotion: null, ...over });
const amounts = (q) => q.lines.filter((l) => l.kind === 'night').map((l) => l.amount);

test('1 đêm, 2 người lớn trong sức chứa chuẩn: giá nền + VAT 10% + cọc 30% làm tròn nghìn', () => {
  const q = computeQuote(base());
  assert.equal(q.ok, true);
  assert.deepEqual(amounts(q), [650000]);
  assert.equal(q.subtotal, 650000);
  assert.equal(q.vat, 65000);
  assert.equal(q.total, 715000);
  assert.equal(q.deposit, 215000); // 214.500 làm tròn half-up
});

test('3 đêm vắt cuối tuần theo từng đêm', () => {
  const q = computeQuote(base({ nights: ['2026-11-13', '2026-11-14', '2026-11-15'], rates: rates({ '2026-11-13': 800000, '2026-11-14': 800000, '2026-11-15': 650000 }) }));
  assert.deepEqual(amounts(q), [800000, 800000, 650000]);
  assert.equal(q.subtotal, 2250000);
  assert.equal(q.vat, 225000);
  assert.equal(q.total, 2475000);
  assert.equal(q.deposit, 743000); // 742.500 → 743.000
});

test('người lớn thứ 3 trên sức chứa chuẩn 2: phụ thu mỗi đêm', () => {
  const q = computeQuote(base({ adults: 3 }));
  assert.deepEqual(amounts(q), [750000]);
  assert.equal(q.lines[0].surcharge, 100000);
});

test('trẻ em theo tuổi: 3 tuổi miễn, 7 tuổi phụ thu trẻ, 13 tuổi tính người lớn', () => {
  assert.deepEqual(amounts(computeQuote(base({ childAges: [3] }))), [650000]);
  assert.deepEqual(amounts(computeQuote(base({ childAges: [7] }))), [700000]);
  assert.deepEqual(amounts(computeQuote(base({ childAges: [5, 6, 11, 12] }))), [650000 + 50000 + 50000 + 100000]);
  assert.deepEqual(amounts(computeQuote(base({ adults: 1, childAges: [13] }))), [650000]); // 1 + 1 = 2 người, trong chuẩn
});

test('ưu đãi % chỉ áp khi đủ số đêm tối thiểu, tính trên giá đêm đã gồm phụ thu', () => {
  const promo = { id: 'p1', kind: 'pct', value: 10, minNights: 3 };
  const nights = ['2026-11-12', '2026-11-13', '2026-11-14'];
  const r = rates({ '2026-11-12': 650000, '2026-11-13': 650000, '2026-11-14': 650000 });
  const q3 = computeQuote(base({ nights, rates: r, adults: 3, promotion: promo }));
  assert.deepEqual(amounts(q3), [675000, 675000, 675000]);
  assert.equal(q3.subtotal, 2025000);
  assert.equal(q3.vat, 203000); // 202.500 → 203.000
  assert.equal(q3.total, 2228000);
  assert.equal(q3.deposit, 668000); // 668.400 → 668.000
  assert.equal(q3.lines[0].discount, 75000);
  const q2 = computeQuote(base({ nights: nights.slice(0, 2), rates: r, adults: 3, promotion: promo }));
  assert.deepEqual(amounts(q2), [750000, 750000]);
  assert.equal(q2.lines[0].discount, 0);
});

test('ưu đãi tiền mỗi đêm không vượt giá đêm (không âm)', () => {
  const q = computeQuote(base({ promotion: { id: 'p2', kind: 'amount_per_night', value: 800000, minNights: 1 } }));
  assert.deepEqual(amounts(q), [0]);
  assert.equal(q.total, 0);
  assert.equal(q.deposit, 0);
});

test('làm tròn một lần ở dòng đêm: 645.500 → 646.000', () => {
  const q = computeQuote(base({ rates: rates({ '2026-11-12': 645500 }) }));
  assert.deepEqual(amounts(q), [646000]);
});

test('VAT 0% thì không có tiền thuế', () => {
  const q = computeQuote(base({ settings: { ...SETTINGS, vatPct: 0 } }));
  assert.equal(q.vat, 0);
  assert.equal(q.total, 650000);
});

test('thiếu giá, đêm đóng, vi phạm min-stay trả cảnh báo thay vì ném lỗi, ok=false', () => {
  const nights = ['2026-11-12', '2026-11-13', '2026-11-14'];
  const missing = computeQuote(base({ nights, rates: rates({ '2026-11-12': 650000, '2026-11-14': 650000 }) }));
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.warnings, [{ code: 'missing_price', night: '2026-11-13' }]);
  assert.equal(missing.total, 0);

  const closed = computeQuote(base({ rates: rates({ '2026-11-12': { price: 650000, minStay: 1, closed: true } }) }));
  assert.deepEqual(closed.warnings, [{ code: 'closed', night: '2026-11-12' }]);

  const minStay = computeQuote(base({ rates: rates({ '2026-11-12': { price: 650000, minStay: 2, closed: false } }) }));
  assert.equal(minStay.ok, false);
  assert.deepEqual(minStay.warnings, [{ code: 'min_stay', night: '2026-11-12', minStay: 2 }]);
});

test('min-stay chỉ kiểm trên đêm đến', () => {
  const nights = ['2026-11-12', '2026-11-13'];
  const q = computeQuote(base({ nights, rates: rates({ '2026-11-12': { price: 650000, minStay: 2, closed: false }, '2026-11-13': { price: 650000, minStay: 5, closed: false } }) }));
  assert.equal(q.ok, true);
});

test('tuổi trẻ em không hợp lệ bị cảnh báo', () => {
  for (const ages of [[-1], [1.5], [18], ['7'], [null]]) {
    const q = computeQuote(base({ childAges: ages }));
    assert.equal(q.ok, false, JSON.stringify(ages));
    assert.equal(q.warnings[0].code, 'bad_child_age');
  }
});

test('hàm thuần: không sửa đầu vào', () => {
  const input = base({ promotion: { id: 'p', kind: 'pct', value: 10, minNights: 1 }, childAges: [7] });
  const snap = JSON.stringify({ ...input, rates: [...input.rates] });
  computeQuote(input);
  assert.equal(JSON.stringify({ ...input, rates: [...input.rates] }), snap);
});
