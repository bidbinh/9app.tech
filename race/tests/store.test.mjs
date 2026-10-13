import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, normalizePb, KEY } from '../js/store.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
let tick = 0;
const clock = () => `2026-10-04T10:00:${String(tick++).padStart(2, '0')}Z`;

test('normalizePb', () => {
  assert.equal(normalizePb('3:45:12'), '3:45:12');
  assert.equal(normalizePb(' 03:45:12 '), '3:45:12');
  assert.equal(normalizePb('24:30'), '24:30');
  assert.equal(normalizePb('4:5:9'), null);
  assert.equal(normalizePb('abc'), null);
  assert.equal(normalizePb('1:75:00'), null);
  assert.equal(normalizePb(''), '');
});

test('đặt trạng thái, lưu lại và đọc lại qua storage', () => {
  const st = fakeStorage();
  const a = createStore(st, clock);
  a.setStatus('trang-an-marathon-2026', 'interested');
  a.setStatus('hcmc-marathon-2027', 'registered');
  assert.equal(a.count(), 2);
  const b = createStore(st, clock);
  assert.equal(b.get('trang-an-marathon-2026').status, 'interested');
  b.setStatus('trang-an-marathon-2026', null);
  assert.equal(createStore(st, clock).count(), 1);
});

test('PB và ghi chú chỉ cho giải đã có trong danh sách; PB sai không lưu', () => {
  const s = createStore(fakeStorage(), clock);
  assert.equal(s.setPb('khong-co', '3:00:00'), false);
  s.setStatus('vmm-2026', 'ran');
  assert.equal(s.setPb('vmm-2026', '12:xx'), false);
  assert.equal(s.setPb('vmm-2026', '9:05:07'), true);
  s.setNote('vmm-2026', 'Mưa to, chân đau; ok');
  assert.equal(s.get('vmm-2026').pb, '9:05:07');
  s.setStatus('vmm-2026', 'registered');
  assert.equal(s.get('vmm-2026').pb, '9:05:07', 'đổi trạng thái giữ PB');
});

test('xuất rồi nhập lại (replace) cho dữ liệu y hệt', () => {
  const a = createStore(fakeStorage(), clock);
  a.setStatus('a-1', 'ran'); a.setPb('a-1', '1:59:59'); a.setNote('a-1', 'Ghi "chú", có\nxuống dòng');
  a.setStatus('b-2', 'interested');
  const json = a.exportJSON();
  const parsed = JSON.parse(json);
  assert.equal(parsed.app, '9race');
  assert.equal(parsed.version, 1);
  const b = createStore(fakeStorage(), clock);
  const res = b.importJSON(json, 'replace');
  assert.deepEqual(res, { ok: true, count: 2 });
  assert.deepEqual(b.all(), a.all());
});

test('nhập gộp: giữ bản mới hơn; thay thế: xóa cái cũ', () => {
  const s = createStore(fakeStorage(), () => '2026-10-04T10:00:00Z');
  s.setStatus('a-1', 'interested');
  const incoming = JSON.stringify({ app: '9race', version: 1, items: {
    'a-1': { status: 'registered', pb: '', note: '', updatedAt: '2026-10-04T09:00:00Z' },
    'c-3': { status: 'ran', pb: '3:30:00', note: 'x', updatedAt: '2026-10-01T00:00:00Z' },
  } });
  s.importJSON(incoming, 'merge');
  assert.equal(s.get('a-1').status, 'interested', 'bản cục bộ mới hơn thì giữ');
  assert.equal(s.get('c-3').pb, '3:30:00');
  s.importJSON(incoming, 'replace');
  assert.equal(s.count(), 2);
  assert.equal(s.get('a-1').status, 'registered');
});

test('nhập từ chối dữ liệu sai và làm sạch dữ liệu bẩn', () => {
  const s = createStore(fakeStorage(), clock);
  assert.equal(s.importJSON('không phải json').ok, false);
  assert.equal(s.importJSON('{"app":"khac","version":1,"items":{}}').ok, false);
  assert.equal(s.importJSON('{"app":"9race","version":2,"items":{}}').ok, false);
  assert.equal(s.importJSON('{"app":"9race","version":1,"items":null}').ok, false);
  const dirty = JSON.stringify({ app: '9race', version: 1, items: {
    'ok-1': { status: 'ran', pb: 'rác', note: 'n'.repeat(5000), updatedAt: 'x' },
    '<bad>': { status: 'ran' },
    'ok-2': { status: 'hacker' },
    'ok-3': 'chuỗi',
  } });
  const res = s.importJSON(dirty, 'replace');
  assert.equal(res.count, 1);
  assert.equal(s.get('ok-1').pb, '');
  assert.equal(s.get('ok-1').note.length, 2000);
});

test('localStorage ném lỗi (chặn lưu trữ): vẫn chạy trong bộ nhớ, persistent=false', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s = createStore(broken, clock);
  s.setStatus('a-1', 'interested');
  assert.equal(s.get('a-1').status, 'interested');
  assert.equal(s.persistent, false);
  const none = createStore(null, clock);
  none.setStatus('a-1', 'ran');
  assert.equal(none.count(), 1);
});

test('dữ liệu lưu hỏng không làm app sập', () => {
  const st = fakeStorage({ [KEY]: '{hỏng' });
  assert.equal(createStore(st, clock).count(), 0);
});
