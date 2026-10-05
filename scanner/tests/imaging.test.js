import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter, estimateBackground, sharpen } from '../js/filters.js';
import { removeRuling } from '../js/ocrprep.js';
import { detectOrientation } from '../js/orient.js';
import { StableTracker } from '../js/stable.js';
import { gridTables, layoutPage } from '../js/layout.js';
import { detectDocument } from '../js/edges.js';
import { orderCorners } from '../js/geom.js';
import { makeScene, makePage, cornerError, rng } from './helpers/synth.js';

function gray(w, h, v = 245) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  return { data: d, width: w, height: h };
}
const setPx = (img, x, y, v) => { const o = (y * img.width + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; };
const rect = (img, x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(img, x, y, v); };

test('Trắng đen tài liệu: nền trắng tinh dù có bóng đổ, chữ đen; ảnh tích phân không tràn biên', () => {
  const W = 400, H = 300;
  const img = gray(W, H);
  const inkPts = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) setPx(img, x, y, 245 * (1 - 0.5 * x / W));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 18; c++) { const x0 = 30 + c * 19, y0 = 30 + r * 30; rect(img, x0, y0, x0 + 12, y0 + 5, 40 * (1 - 0.5 * x0 / W)); inkPts.push([x0 + 6, y0 + 2]); }
  applyFilter(img, 'docbw');
  let bgWhite = 0, bgN = 0;
  for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) { if (inkPts.some(([ix, iy]) => Math.abs(ix - x) < 14 && Math.abs(iy - y) < 8)) continue; bgN++; if (img.data[(y * W + x) * 4] > 245) bgWhite++; }
  assert.ok(bgWhite / bgN > 0.97, `nền trắng ${bgWhite}/${bgN}`);
  const ink = inkPts.map(([x, y]) => img.data[(y * W + x) * 4]);
  assert.ok(ink.filter((v) => v < 60).length / ink.length > 0.9, 'chữ phải đen');
});

test('Ảnh rõ nét: viền chữ sắc hơn (độ dốc tại biên tăng) và nền vẫn trắng', () => {
  const mk = () => { const img = gray(300, 200, 240); for (let r = 0; r < 6; r++) rect(img, 20, 20 + r * 28, 280, 28 + r * 28, 60); const b = new Uint8ClampedArray(img.data); for (let pass = 0; pass < 2; pass++) for (let y = 1; y < 199; y++) for (let x = 1; x < 299; x++) { const o = (y * 300 + x) * 4; b[o] = b[o + 1] = b[o + 2] = (img.data[o - 4] + img.data[o] * 2 + img.data[o + 4]) / 4; } img.data.set(b); return img; };
  const a = mk(), b = mk();
  const grad = (im) => { let g = 0; for (let y = 1; y < 199; y++) for (let x = 20; x < 280; x++) g += Math.abs(im.data[((y + 1) * 300 + x) * 4] - im.data[((y - 1) * 300 + x) * 4]); return g; };
  applyFilter(a, 'magic');
  applyFilter(b, 'sharp');
  assert.ok(grad(b) >= grad(a) * 0.98, `sắc nét ${grad(b)} vs ${grad(a)}`);
  assert.ok(b.data[(5 * 300 + 150) * 4] > 245);
  const c = mk(); sharpen(c, 1.5);
  assert.ok(grad(c) > grad(mk()), 'sharpen phải làm tăng độ dốc biên');
});

test('Màu tự động: trang có khối ảnh lớn không bị cháy; trang chữ thuần nền trắng', () => {
  const photo = gray(300, 300, 240);
  rect(photo, 20, 20, 160, 200, 70); // khối tối lớn (ảnh)
  const bg = estimateBackground(photo);
  assert.ok(bg.nonPaper > 0.12);
  applyFilter(photo, 'auto');
  assert.ok(photo.data[(100 * 300 + 80) * 4] < 120, 'khối tối giữ chi tiết, không bị tẩy trắng');
  const text = gray(300, 300, 235);
  for (let r = 0; r < 8; r++) rect(text, 20, 20 + r * 30, 270, 28 + r * 30, 50);
  applyFilter(text, 'auto');
  assert.ok(text.data[(285 * 300 + 150) * 4] > 245);
});

test('Bóng đổ lớn dần (bàn tay) vẫn được coi là giấy: nền sau lọc đều', () => {
  const W = 400, H = 300;
  const img = gray(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x - 250) / 90, dy = (y - 120) / 90; setPx(img, x, y, 245 * (1 - 0.55 * Math.exp(-(dx * dx + dy * dy)))); }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 14; c++) rect(img, 20 + c * 26, 20 + r * 33, 34 + c * 26, 23 + r * 33, 90);
  applyFilter(img, 'deshadow');
  const samples = [[250, 110], [60, 30], [350, 285], [250, 60]].map(([x, y]) => img.data[(y * W + x) * 4]);
  assert.ok(Math.max(...samples) - Math.min(...samples) < 25, samples.join(','));
});

test('removeRuling: xóa đường kẻ dài ngang/dọc, giữ nguyên chữ; trả về vị trí đường kẻ', () => {
  const img = gray(500, 300);
  for (const y of [40, 100, 160, 220]) rect(img, 40, y, 460, y + 2, 20);
  for (const x of [40, 200, 330, 460]) rect(img, x, 40, x + 2, 222, 20);
  rect(img, 60, 60, 80, 70, 30); // "chữ" nhỏ trong ô
  rect(img, 220, 120, 250, 132, 30);
  const r = removeRuling(img);
  assert.equal(r.hLines.length, 4);
  assert.equal(r.vLines.length, 4);
  assert.ok(img.data[(41 * 500 + 100) * 4] > 240, 'đường ngang đã xóa');
  assert.ok(img.data[(100 * 500 + 41) * 4] > 240, 'đường dọc đã xóa');
  assert.equal(img.data[(65 * 500 + 70) * 4], 30, 'chữ còn nguyên');
  assert.equal(img.data[(125 * 500 + 235) * 4], 30);
});

test('Bảng có đường kẻ: dựng lưới ô từ đường kẻ, ô nhiều dòng gom lại, từ ngoài bảng giữ nguyên', () => {
  const rules = { hLines: [{ y: 100, x0: 100, x1: 700 }, { y: 160, x0: 100, x1: 700 }, { y: 260, x0: 100, x1: 700 }], vLines: [{ x: 100, y0: 100, y1: 260 }, { x: 300, y0: 100, y1: 260 }, { x: 700, y0: 100, y1: 260 }] };
  const w = (t, x0, y0) => ({ text: t, x0, y0, x1: x0 + t.length * 10, y1: y0 + 20, conf: 90 });
  const words = [w('Tên', 110, 120), w('Ghi chú', 310, 120), w('An', 110, 180), w('dòng', 310, 170), w('một', 360, 170), w('dòng', 310, 200), w('hai', 360, 200), w('Ngoài', 110, 40)];
  const g = gridTables(words, rules, 800);
  assert.equal(g.tables.length, 1);
  assert.deepEqual(g.tables[0].rows, [['Tên', 'Ghi chú'], ['An', 'dòng một dòng hai']]);
  assert.deepEqual(g.rest.map((x) => x.text), ['Ngoài']);
  const lay = layoutPage({ words, width: 800, height: 400 }, { rules });
  assert.deepEqual(lay.blocks.map((b) => b.type), ['para', 'table']);
});

test('Hướng chữ: nhận ra chữ nằm ngang hay dọc trên trang mẫu', () => {
  const rand = rng(5);
  const page = makePage(420, 594, rand);
  const h = detectOrientation(page);
  assert.equal(h.horizontal, true);
  assert.equal(h.axisRot, 0);
  const rot = { width: 594, height: 420, data: new Uint8ClampedArray(594 * 420 * 4) };
  for (let y = 0; y < 594; y++) for (let x = 0; x < 420; x++) { const s = (y * 420 + x) * 4, d = (x * 594 + (593 - y)) * 4; rot.data.set(page.data.subarray(s, s + 4), d); }
  const v = detectOrientation(rot);
  assert.equal(v.horizontal, false);
  assert.equal(v.axisRot, 90);
});

test('StableTracker: chỉ bắn khi khung đứng yên đủ số khung, không chụp lặp cùng tờ, chụp lại khi đổi tờ', () => {
  const quad = (dx = 0) => [{ x: 0.1 + dx, y: 0.1 }, { x: 0.9 + dx, y: 0.1 }, { x: 0.9 + dx, y: 0.9 }, { x: 0.1 + dx, y: 0.9 }];
  const t = new StableTracker({ needFrames: 3 });
  const fires = [];
  for (let i = 0; i < 4; i++) fires.push(t.push(quad(i * 0.001)).fire);
  assert.deepEqual(fires, [false, false, false, true]);
  for (let i = 0; i < 10; i++) assert.equal(t.push(quad()).fire, false, 'không chụp lặp khi vẫn là tờ cũ');
  t.push(null); t.push(null);
  const again = [];
  for (let i = 0; i < 4; i++) again.push(t.push(quad()).fire);
  assert.equal(again.filter(Boolean).length, 1, 'mất khung rồi có lại thì chụp tiếp');
  const m = new StableTracker({ needFrames: 3 });
  const moving = [];
  for (let i = 0; i < 8; i++) moving.push(m.push(quad(i * 0.05)).fire);
  assert.ok(moving.every((x) => !x), 'khung đang chuyển động thì không chụp');
  const small = new StableTracker({ needFrames: 2 });
  const tiny = [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.5 }];
  assert.ok([1, 2, 3, 4].every(() => !small.push(tiny).fire), 'khung quá nhỏ không tính');
});

test('Tinh chỉnh cạnh: mép giấy bị bóng đổ che được dò lại tốt hơn so với không tinh chỉnh', () => {
  let withR = 0, without = 0, n = 0;
  for (const bg of ['wood', 'green', 'dark']) for (let k = 0; k < 6; k++) {
    const s = makeScene({ seed: 300 + k * 7 + bg.length, bg, rot: (k * 11) % 40 - 20, persp: (k % 3) * 0.1, shadow: 'strong', scale: 0.62 + (k % 3) * 0.08 });
    const truth = orderCorners(s.truth);
    const a = detectDocument(s.img), b = detectDocument(s.img, { noRefine: true, noHough: true });
    withR += cornerError(a.corners, truth, 800, 600).mean; without += cornerError(b.corners, truth, 800, 600).mean; n++;
  }
  console.log(`  sai số trung bình: có tinh chỉnh ${(100 * withR / n).toFixed(2)}%, không ${(100 * without / n).toFixed(2)}%`);
  assert.ok(withR <= without + 1e-9, 'tinh chỉnh không được làm tệ hơn');
});
