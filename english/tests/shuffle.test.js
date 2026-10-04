const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/shuffle.js');
const sm2 = require('../js/sm2.js');

test('shuffle giữ nguyên tập phần tử, không sửa mảng gốc, lặp lại được theo hạt giống', () => {
  const a = Array.from({ length: 50 }, (_, i) => i);
  const s1 = S.shuffle(a, S.mulberry32(7)), s2 = S.shuffle(a, S.mulberry32(7)), s3 = S.shuffle(a, S.mulberry32(8));
  assert.deepEqual([...s1].sort((x, y) => x - y), a);
  assert.deepEqual(s1, s2); assert.notDeepEqual(s1, s3); assert.notDeepEqual(s1, a);
  assert.deepEqual(a, Array.from({ length: 50 }, (_, i) => i));
});

test('shuffle phân bố tương đối đều (mỗi vị trí đầu khoảng 25%)', () => {
  const rnd = S.mulberry32(1), cnt = [0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) cnt[S.shuffle([0, 1, 2, 3], rnd)[0]]++;
  cnt.forEach((c) => assert.ok(c > 850 && c < 1150, cnt.join()));
});

test('shuffle mảng rỗng và một phần tử', () => {
  assert.deepEqual(S.shuffle([]), []); assert.deepEqual(S.shuffle([1]), [1]);
});

const words = [];
['A2', 'B1', 'B2', 'C1'].forEach((l) => { for (let i = 0; i < 10; i++) words.push({ id: l + i, level: l, topic: i < 5 ? 'x' : 'y' }); });
const T = 20000;

test('hàng đợi: thẻ đến hạn trước, thẻ mới có giới hạn và dễ trước khó', () => {
  const cards = { A20: sm2.newCard(T - 3), B10: sm2.newCard(T), C13: sm2.newCard(T + 5) };
  const q = S.buildQueue(words, cards, { today: T, newLimit: 6, rnd: S.mulberry32(3) });
  assert.deepEqual(q.due.map((w) => w.id).sort(), ['A20', 'B10']);
  assert.equal(q.fresh.length, 6);
  assert.ok(!q.queue.some((w) => w.id === 'C13'), 'thẻ chưa đến hạn không được xuất hiện');
  assert.ok(q.fresh.every((w) => w.level === 'A2' || w.level === 'B1'), 'từ mới: chọn mức dễ trước');
  assert.equal(q.queue.length, 8);
  assert.deepEqual(q.queue.slice(0, 2).map((w) => w.id).sort(), ['A20', 'B10']);
});

test('lọc theo chủ đề và mức', () => {
  const q = S.buildQueue(words, {}, { today: T, topic: 'x', levels: ['B2'], newLimit: 100 });
  assert.equal(q.fresh.length, 5); assert.ok(q.fresh.every((w) => w.level === 'B2' && w.topic === 'x'));
});

test('newLimit = 0 không lấy từ mới', () => {
  assert.equal(S.buildQueue(words, {}, { today: T, newLimit: 0 }).queue.length, 0);
});
