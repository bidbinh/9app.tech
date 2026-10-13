import test from 'node:test';
import assert from 'node:assert/strict';
import { splitShares, settle } from '../js/split.js';

test('splitShares: tổng đúng, phần dư dồn cho người đầu', () => {
  assert.deepEqual(splitShares(100001, 3), [33334, 33334, 33333]);
  assert.deepEqual(splitShares(9, 3), [3, 3, 3]);
  assert.deepEqual(splitShares(1, 3), [1, 0, 0]);
  assert.deepEqual(splitShares(500, 1), [500]);
});

test('settle: ba người, một người trả hộ', () => {
  const r = settle([{ payer: 'A', amount: 300000, label: 'Taxi' }], ['A', 'B', 'C']);
  assert.equal(r.total, 300000);
  assert.deepEqual(r.balances, { A: 200000, B: -100000, C: -100000 });
  assert.deepEqual(r.transfers, [{ from: 'B', to: 'A', amount: 100000 }, { from: 'C', to: 'A', amount: 100000 }]);
});

test('settle: một người, không có ai để chuyển', () => {
  const r = settle([{ payer: 'A', amount: 100000 }], ['A']);
  assert.deepEqual(r.transfers, []);
  assert.deepEqual(r.balances, { A: 0 });
});

test('settle: người trả không có trong danh sách vẫn được tính; không có khoản thì rỗng', () => {
  const r = settle([{ payer: 'Dũng', amount: 90000 }], ['A', 'B']);
  assert.deepEqual(r.people, ['A', 'B', 'Dũng']);
  assert.deepEqual(r.balances, { A: -30000, B: -30000, Dũng: 60000 });
  assert.deepEqual(settle([], ['A', 'B']).transfers, []);
  assert.deepEqual(settle([{ payer: 'A', amount: 5 }], []).people, ['A']);
});

test('settle: bỏ khoản không hợp lệ, không bao giờ ra NaN', () => {
  const bad = [{ payer: 'A', amount: 0 }, { payer: 'A', amount: -5 }, { payer: 'A', amount: 1.5 }, { payer: 'A', amount: '100' },
    { payer: '', amount: 10 }, { payer: 'A', amount: NaN }, null, undefined, {}];
  const r = settle(bad, ['A', 'B']);
  assert.equal(r.total, 0);
  assert.deepEqual(r.transfers, []);
  for (const v of Object.values(r.balances)) assert.ok(Number.isFinite(v));
});

test('settle: ngẫu nhiên, tổng số dư = 0 và tổng chuyển = tổng nợ', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let k = 0; k < 200; k++) {
    const people = ['A', 'B', 'C', 'D', 'E'].slice(0, 1 + rnd(5));
    const pays = Array.from({ length: 1 + rnd(6) }, () => ({ payer: people[rnd(people.length)], amount: 1 + rnd(2_000_000) }));
    const r = settle(pays, people);
    assert.equal(Object.values(r.balances).reduce((a, b) => a + b, 0), 0);
    const debt = Object.values(r.balances).filter((v) => v < 0).reduce((a, b) => a - b, 0);
    assert.equal(r.transfers.reduce((a, t) => a + t.amount, 0), debt);
    for (const t of r.transfers) assert.ok(t.amount > 0 && t.from !== t.to);
  }
});
