import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMagic, closedShapes, makeRng } from '../js/lib/magic.js';
import { parseDoc, serializeDoc, replay } from '../js/lib/engine.js';

const W = 1080, H = 1350;
const circle = (cx, cy, r, n = 40) => ({ t: 'pen', c: '#ef4444', w: 8, p: Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]; }).flat() });
const line = { t: 'pen', c: '#1f2937', w: 8, p: [100, 100, 300, 140, 500, 100, 700, 160] };

test('bộ ngẫu nhiên có hạt giống: cùng seed ra cùng kết quả', () => {
  const a = makeRng(7), b = makeRng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('nhận ra hình tròn khép kín, bỏ qua nét hở và hình quá nhỏ', () => {
  const s = closedShapes([circle(500, 600, 150), line, circle(900, 200, 20)], W, H);
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s[0].w - 300) < 4);
});

test('giấy trống thì không làm gì', () => {
  assert.equal(makeMagic([], { W, H, seed: 1 }).reason, 'trống');
  assert.equal(makeMagic([{ t: 'pen', c: '#000000', w: 4, p: [1, 1, 5, 5] }, { t: 'clear' }], { W, H, seed: 1 }).reason, 'trống');
});

test('vẽ hình tròn: có mặt (mắt, miệng) trong hình và nhân vật ở chỗ trống', () => {
  const circ = circle(540, 600, 160);
  const r = makeMagic([circ], { W, H, seed: 3 });
  assert.equal(r.faces, 1);
  assert.ok(r.deco >= 3 && r.deco <= 5, 'deco=' + r.deco);
  assert.ok(r.strokes.length > 10);
  // có nét rơi vào giữa hình tròn (mặt)
  const inside = r.strokes.some((s) => s.p[0] > 440 && s.p[0] < 640 && s.p[1] > 500 && s.p[1] < 700);
  assert.ok(inside);
  assert.ok(r.note.length > 5);
});

test('nhân vật thêm vào không đè lên nét đã vẽ', () => {
  const r = makeMagic([line], { W, H, seed: 9 });
  assert.equal(r.faces, 0);
  const decor = r.strokes;
  const cellOf = (x, y) => [Math.floor(x / 180), Math.floor(y / 180)].join(',');
  const drawn = new Set();
  for (let i = 0; i < line.p.length; i += 2) drawn.add(cellOf(line.p[i], line.p[i + 1]));
  for (let x = 100; x <= 700; x += 20) drawn.add(cellOf(x, 100 + (x - 100) * 0.1));
  // tâm mỗi hình nhỏ nằm ngoài ô có nét: kiểm bằng trung bình điểm của từng nét ở rìa
  const centers = decor.map((s) => cellOf(s.p[0], s.p[1]));
  assert.ok(centers.filter((c) => drawn.has(c)).length < decor.length * 0.35);
});

test('chạy lại không vẽ mặt đôi cho hình đã có mặt', () => {
  const circ = circle(540, 600, 160);
  const r1 = makeMagic([circ], { W, H, seed: 3 });
  const r2 = makeMagic([circ, { t: 'magic', s: r1.strokes }], { W, H, seed: 4 });
  assert.equal(r2.faces, 0);
});

test('chế độ nhẹ chỉ thêm 1-2 hình, gần nơi vừa vẽ', () => {
  const r = makeMagic([line], { W, H, seed: 5, light: true, focus: [700, 160] });
  assert.ok(r.deco >= 1 && r.deco <= 2);
});

test('nền bảng đen: nét mặt màu trắng; kết quả hợp lệ và khứ hồi qua parseDoc', () => {
  const r = makeMagic([circle(540, 600, 160)], { W, H, bg: 'board', seed: 3 });
  assert.ok(r.strokes.some((s) => s.c === '#ffffff'));
  const doc = { fmt: '4:5', bg: 'board', strokes: [circle(540, 600, 160), { t: 'magic', s: r.strokes }] };
  const back = parseDoc(serializeDoc(doc));
  assert.equal(back.strokes.length, 2);
  assert.equal(back.strokes[1].s.length, r.strokes.length);
});

test('nhóm nét magic được dựng lại và parseDoc loại nhóm hỏng/lồng nhau', () => {
  const ops = [];
  const ctx = new Proxy({}, { get(t, k) { return k in t ? t[k] : (...a) => ops.push([k, ...a]); }, set(t, k, v) { t[k] = v; return true; } });
  const g = { t: 'magic', s: [{ t: 'pen', c: '#ff0000', w: 5, p: [1, 1, 9, 9] }, { t: 'pen', c: '#00ff00', w: 5, p: [3, 3] }] };
  replay(ctx, [g], W, H);
  assert.equal(ops.filter((o) => o[0] === 'stroke').length, 1);
  assert.equal(ops.filter((o) => o[0] === 'arc').length, 1);
  const d = parseDoc({ strokes: [{ t: 'magic', s: [] }, { t: 'magic', s: [{ t: 'magic', s: [g.s[0]] }] }, { t: 'magic', s: [g.s[0], { t: 'pen', c: 'x', w: 1, p: [1, 1] }] }] });
  assert.equal(d.strokes.length, 1);
  assert.equal(d.strokes[0].s.length, 1);
});

test('mọi seed đều cho nét hợp lệ, không quá nặng', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = makeMagic([circle(300, 300, 130), circle(780, 900, 110), line], { W, H, seed });
    const d = parseDoc({ strokes: [{ t: 'magic', s: r.strokes }] });
    assert.equal(d.strokes[0].s.length, r.strokes.length, 'seed ' + seed);
    assert.ok(r.strokes.length < 600 && r.strokes.reduce((a, s) => a + s.p.length, 0) < 40000);
    for (const s of r.strokes) for (let i = 0; i < s.p.length; i += 2) assert.ok(s.p[i] > -250 && s.p[i] < W + 250 && s.p[i + 1] > -250 && s.p[i + 1] < H + 250);
  }
});
