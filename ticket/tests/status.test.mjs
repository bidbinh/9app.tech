import test from 'node:test';
import assert from 'node:assert/strict';
import { getStatus, setSource, STATE_LABEL } from '../js/status.js';
import { makeSamples } from '../js/sample.js';
import { validateTrip } from '../js/model.js';

const NOW = Date.parse('2026-10-12T10:00:00+07:00');

test('makeSamples: hợp lệ, tính theo ngày hiện tại, gồm sắp tới và đã đi', () => {
  const s = makeSamples(NOW);
  assert.ok(s.length >= 4);
  for (const t of s) { assert.ok(t.id.startsWith('mau-')); assert.ok(validateTrip(t).trip); }
  assert.ok(s.some((t) => Date.parse(t.departAt) > NOW));
  assert.ok(s.some((t) => Date.parse(t.departAt) < NOW));
  assert.deepEqual(makeSamples(NOW), makeSamples(NOW));
  assert.ok(s.some((t) => t.mode === 'bay') && s.some((t) => t.mode === 'tau') && s.some((t) => t.mode === 'xe'));
});

test('getStatus: chuyến thật chưa có nguồn thì "unknown", không bịa', async () => {
  const s = await getStatus({ id: 'tabc', mode: 'bay' }, NOW);
  assert.equal(s.state, 'unknown');
  assert.equal(s.source, 'none');
  assert.ok(STATE_LABEL.unknown);
});

test('getStatus: chuyến mẫu có trạng thái mẫu, ghi rõ nguồn "mau"', async () => {
  const states = new Set();
  for (const t of makeSamples(NOW)) {
    const s = await getStatus(t, NOW);
    assert.equal(s.source, 'mau');
    states.add(s.state);
  }
  assert.ok(states.has('ontime') && states.has('delayed'));
});

test('setSource thay được nguồn; lỗi nguồn thì quay về unknown', async () => {
  setSource(async () => ({ state: 'delayed', delayMin: 25, gate: 'B3', terminal: 'T1', updatedAt: '2026-10-12T10:00:00+07:00', source: 'datacom' }));
  assert.equal((await getStatus({ id: 'tx' }, NOW)).state, 'delayed');
  setSource(async () => { throw new Error('mạng lỗi'); });
  const s = await getStatus({ id: 'tx' }, NOW);
  assert.equal(s.state, 'unknown');
  setSource(async () => ({ state: 'bậy' }));
  assert.equal((await getStatus({ id: 'tx' }, NOW)).state, 'unknown');
  setSource(null);
});
