import test from 'node:test';
import assert from 'node:assert/strict';
import { isDate, addDays, nightsBetween, todayVN } from '../src/time.js';

test('nightsBetween: 12→14 là hai đêm 12 và 13', () => {
  assert.deepEqual(nightsBetween('2026-11-12', '2026-11-14'), ['2026-11-12', '2026-11-13']);
});

test('nightsBetween: vắt tháng, vắt năm, năm nhuận', () => {
  assert.deepEqual(nightsBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(nightsBetween('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29']);
});

test('nightsBetween: ngày đi không sau ngày đến thì lỗi bad_dates', () => {
  for (const [a, b] of [['2026-11-12', '2026-11-12'], ['2026-11-14', '2026-11-12']]) {
    assert.throws(() => nightsBetween(a, b), (e) => e.code === 'bad_dates');
  }
});

test('nightsBetween: quá 366 đêm thì lỗi bad_dates', () => {
  assert.throws(() => nightsBetween('2026-01-01', '2028-01-01'), (e) => e.code === 'bad_dates');
});

test('isDate: từ chối ngày không tồn tại và định dạng sai', () => {
  assert.equal(isDate('2026-02-28'), true);
  for (const s of ['2026-02-30', '2026-13-01', '26-01-01', '2026/01/01', '', null, undefined, 20260101]) assert.equal(isDate(s), false, String(s));
});

test('addDays: cộng trừ ngày qua ranh giới tháng', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('todayVN: 20:00 UTC ngày 13/10 đã là 03:00 ngày 14/10 giờ Việt Nam', () => {
  assert.equal(todayVN(new Date('2026-10-13T20:00:00Z')), '2026-10-14');
  assert.equal(todayVN(new Date('2026-10-13T16:59:00Z')), '2026-10-13');
});
