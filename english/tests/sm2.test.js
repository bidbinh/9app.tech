const test = require('node:test');
const assert = require('node:assert/strict');
const sm2 = require('../js/sm2.js');

const T = 20000; // một ngày bất kỳ làm "hôm nay"

test('thẻ mới có giá trị khởi đầu chuẩn', () => {
  const c = sm2.newCard(T);
  assert.deepEqual([c.ef, c.interval, c.reps, c.due], [2.5, 0, 0, T]);
});

test('chuỗi đạt "Tốt": 1 ngày, 6 ngày, rồi nhân hệ số EF', () => {
  let c = sm2.newCard(T);
  c = sm2.review(c, 'good', T);
  assert.equal(c.interval, 1); assert.equal(c.reps, 1); assert.equal(c.due, T + 1);
  c = sm2.review(c, 'good', T + 1);
  assert.equal(c.interval, 6); assert.equal(c.reps, 2);
  c = sm2.review(c, 'good', T + 7);
  assert.equal(c.interval, 15); // round(6 * 2.5)
  assert.equal(c.ef, 2.5);      // q=4 giữ nguyên EF
  c = sm2.review(c, 'good', T + 22);
  assert.equal(c.interval, 38); // round(15 * 2.5) = 37.5 -> 38
});

test('"Quên" đặt lại reps, hẹn 1 ngày, tăng lapses và KHÔNG trừ EF (SM-2 gốc)', () => {
  const c = { ef: 2.5, interval: 15, reps: 3, lapses: 0, due: T, seen: 5 };
  const r = sm2.review(c, 'again', T);
  assert.equal(r.reps, 0); assert.equal(r.interval, 1); assert.equal(r.lapses, 1);
  assert.equal(r.ef, 2.5); // SM-2 gốc: q < 3 không đổi EF
  assert.equal(r.due, T + 1);
});

test('EF không bao giờ thấp hơn 1.3', () => {
  let c = sm2.newCard(T);
  for (let i = 0; i < 30; i++) c = sm2.review(c, 'hard', T);
  assert.equal(c.ef, 1.3);
});

test('"Dễ" tăng EF 0.1; "Khó" giảm EF 0.14', () => {
  const c = sm2.newCard(T);
  assert.equal(sm2.review(c, 'easy', T).ef, 2.6);
  assert.equal(sm2.review(c, 'hard', T).ef, 2.36);
});

test('khoảng hẹn: Khó < Tốt < Dễ khi thẻ đã học, và luôn tăng ít nhất 1 ngày', () => {
  const c = { ef: 2.5, interval: 10, reps: 4, lapses: 0, due: T, seen: 4 };
  const p = sm2.preview(c, T);
  assert.ok(p.hard < p.good && p.good < p.easy, JSON.stringify(p));
  assert.ok(p.hard >= 11);
  assert.equal(p.again, 1);
});

test('review không sửa thẻ gốc (hàm thuần)', () => {
  const c = sm2.newCard(T);
  const snap = JSON.stringify(c);
  sm2.review(c, 'good', T);
  assert.equal(JSON.stringify(c), snap);
});

test('điểm chấm sai bị từ chối', () => {
  assert.throws(() => sm2.review(sm2.newCard(T), 'meh', T));
  assert.throws(() => sm2.review(sm2.newCard(T), 9, T));
});

test('isDue / isMature / dayNumber / labelInterval', () => {
  const c = sm2.newCard(T);
  assert.ok(sm2.isDue(c, T)); assert.ok(!sm2.isDue(sm2.review(c, 'good', T), T));
  assert.ok(sm2.isMature({ interval: 21 })); assert.ok(!sm2.isMature({ interval: 20 }));
  assert.equal(sm2.dayNumber(new Date(2026, 9, 4, 23, 59)), sm2.dayNumber(new Date(2026, 9, 4, 0, 1)));
  assert.equal(sm2.dayNumber(new Date(2026, 9, 5)) - sm2.dayNumber(new Date(2026, 9, 4)), 1);
  assert.equal(sm2.dayToISO(sm2.dayNumber(new Date(2026, 9, 4))), '2026-10-04');
  assert.equal(sm2.labelInterval(1), '1 ngày'); assert.equal(sm2.labelInterval(45), '2 tháng');
});

test('mô phỏng 12 lần ôn "Tốt": khoảng hẹn tăng đơn điệu', () => {
  let c = sm2.newCard(T), day = T, last = 0;
  for (let i = 0; i < 12; i++) { c = sm2.review(c, 'good', day); assert.ok(c.interval >= last); last = c.interval; day = c.due; }
  assert.ok(c.interval > 200);
});

test('thẻ mới chấm "Dễ" hẹn lâu hơn "Tốt" (4 ngày so với 1 ngày), "Khó" 1 ngày', () => {
  const p = sm2.preview(sm2.newCard(T), T);
  assert.deepEqual([p.again, p.hard, p.good, p.easy], [1, 1, 1, 4]);
  const c = sm2.review(sm2.review(sm2.newCard(T), 'easy', T), 'good', T + 4);
  assert.equal(c.interval, 6); // lần ôn thứ hai vẫn theo SM-2: 6 ngày
});
test('quên nhiều lần không làm tụt EF, nhưng thẻ vẫn phải ôn lại từ đầu', () => {
  let c = { ef: 2.2, interval: 30, reps: 5, lapses: 0, due: T, seen: 5 };
  c = sm2.review(c, 'again', T); c = sm2.review(c, 'again', T + 1);
  assert.equal(c.ef, 2.2); assert.equal(c.lapses, 2); assert.equal(c.reps, 0);
});
