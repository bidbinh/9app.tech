import test from 'node:test';
import assert from 'node:assert/strict';
import { roundTo } from '../src/money.js';

test('roundTo làm tròn half-up tới bội của step', () => {
  assert.equal(roundTo(645500, 1000), 646000);
  assert.equal(roundTo(202500, 1000), 203000);
  assert.equal(roundTo(645499, 1000), 645000);
  assert.equal(roundTo(0, 1000), 0);
  assert.equal(roundTo(499, 1000), 0);
  assert.equal(roundTo(500, 1000), 1000);
  assert.equal(roundTo(1234, 1), 1234);
  assert.equal(roundTo(1234, 100), 1200);
});

test('roundTo từ chối số âm, số lẻ, step không hợp lệ', () => {
  for (const n of [-1, 1.5, NaN, Infinity, '100', null]) assert.throws(() => roundTo(n, 1000), (e) => e.code === 'bad_money', String(n));
  for (const s of [0, -1, 1.5, '1000']) assert.throws(() => roundTo(100, s), (e) => e.code === 'bad_money', String(s));
});
