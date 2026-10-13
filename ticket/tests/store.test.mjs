import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEY, MAX_TRIPS } from '../js/store.js';

function fake(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
}
const fresh = () => { const f = fake(); return createStore(() => f); };
const trip = (id, extra = {}) => ({
  id, mode: 'tau', code: 'se1', from: { name: 'Hà Nội' }, to: { name: 'Sài Gòn' },
  departAt: '2026-11-20T19:20:00+07:00', arriveAt: '2026-11-22T04:10:00+07:00', ...extra,
});

test('upsert + load + get + remove', () => {
  const s = fresh();
  assert.deepEqual(s.load(), []);
  assert.deepEqual(s.upsert(trip('a1')).errors, []);
  s.upsert(trip('a2'));
  s.upsert(trip('a1', { note: 'sửa' }));
  assert.equal(s.load().length, 2);
  assert.equal(s.get('a1').note, 'sửa');
  s.remove('a1');
  assert.equal(s.get('a1'), null);
  assert.equal(s.isPersistent(), true);
});

test('upsert không lưu dữ liệu sai và trả lỗi', () => {
  const s = fresh();
  const r = s.upsert({ id: 'x', mode: 'bay' });
  assert.equal(r.trip, null);
  assert.ok(r.errors.length);
  assert.deepEqual(s.load(), []);
});

test('dữ liệu hỏng trong localStorage: bỏ qua, không ném lỗi', () => {
  for (const bad of ['{bad json', '{"a":1}', 'null', '[1,"x",{"id":"../x"}]']) {
    const s = createStore(() => fake({ [KEY]: bad }));
    assert.deepEqual(s.load(), []);
  }
  const s = createStore(() => fake({ [KEY]: JSON.stringify([trip('ok1'), { id: 'bad' }]) }));
  assert.deepEqual(s.load().map((t) => t.id), ['ok1']);
});

test('localStorage bị chặn hoặc đầy: rơi về bộ nhớ tạm, báo không bền', () => {
  const blocked = createStore(() => { throw new Error('SecurityError'); });
  assert.deepEqual(blocked.load(), []);
  assert.ok(blocked.upsert(trip('m1')).trip);
  assert.equal(blocked.get('m1').id, 'm1');
  assert.equal(blocked.isPersistent(), false);

  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const s = createStore(() => full);
  assert.ok(s.upsert(trip('q1')).trip);
  assert.equal(s.isPersistent(), false);
  assert.equal(s.load().length, 1);
});

test('xuất/nhập JSON: gộp theo id, bỏ chuyến sai, giới hạn kích thước', () => {
  const a = fresh();
  a.upsert(trip('e1')); a.upsert(trip('e2'));
  const json = a.exportJson();
  assert.equal(JSON.parse(json).app, '9ticket');
  const b = fresh();
  b.upsert(trip('e1', { note: 'cũ' }));
  const r = b.importJson(json);
  assert.deepEqual(r, { added: 1, updated: 1, skipped: 0 });
  assert.equal(b.get('e1').note, '');
  const mixed = JSON.stringify({ app: '9ticket', version: 1, trips: [trip('n1'), { id: 'sai' }] });
  assert.deepEqual(b.importJson(mixed), { added: 1, updated: 0, skipped: 1 });
  assert.ok(b.importJson('không phải json').error);
  assert.ok(b.importJson('x'.repeat(2_000_001)).error);
  assert.ok(b.importJson(JSON.stringify({ trips: 5 })).error);
});

test('trần số chuyến', () => {
  const s = fresh();
  for (let i = 0; i < MAX_TRIPS; i++) s.upsert(trip('t' + i));
  const r = s.upsert(trip('tover'));
  assert.equal(r.trip, null);
  assert.ok(r.errors[0].includes('500'));
  assert.equal(s.load().length, MAX_TRIPS);
});
