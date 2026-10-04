import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDocument, reduceHull, convexHull, otsu } from '../js/edges.js';
import { orderCorners } from '../js/geom.js';
import { makeScene, cornerError } from './helpers/synth.js';

test('otsu tách hai cụm giá trị', () => {
  const v = new Float32Array(1000);
  for (let i = 0; i < 1000; i++) v[i] = i < 500 ? 40 + (i % 10) : 200 + (i % 10);
  const t = otsu(v);
  assert.ok(t >= 48 && t < 200, `ngưỡng ${t}`);
});

test('reduceHull rút bao lồi nhiều đỉnh về hình chữ nhật', () => {
  // hình chữ nhật có các góc bị cắt vát (8 đỉnh)
  const oct = [{ x: 10, y: 0 }, { x: 90, y: 0 }, { x: 100, y: 10 }, { x: 100, y: 140 }, { x: 90, y: 150 }, { x: 10, y: 150 }, { x: 0, y: 140 }, { x: 0, y: 10 }];
  const q = orderCorners(reduceHull(convexHull(oct), 4));
  const want = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 150 }];
  q.forEach((p, i) => { assert.ok(Math.abs(p.x - want[i].x) < 0.01 && Math.abs(p.y - want[i].y) < 0.01, JSON.stringify(q)); });
});

// Đo trên 32 ảnh giả lập: 4 loại nền tương phản tốt, khác nhau về góc xoay, phối cảnh, bóng
test('nhận cạnh: sai số góc dưới 1% đường chéo trên mọi cảnh nền tương phản', () => {
  const bgs = ['wood', 'dark', 'gray', 'green'];
  let n = 0, maxErr = 0, sum = 0;
  for (const bg of bgs) {
    for (let k = 0; k < 8; k++) {
      const s = makeScene({ seed: 100 + n, bg, rot: (k * 13) % 50 - 25, persp: (k % 4) * 0.12, shadow: k % 2 === 1, scale: 0.55 + (k % 3) * 0.12 });
      const r = detectDocument(s.img);
      assert.ok(r.found, `${bg}#${k} không nhận ra (điểm ${r.score})`);
      const e = cornerError(r.corners, orderCorners(s.truth), 800, 600);
      maxErr = Math.max(maxErr, e.max); sum += e.mean; n++;
    }
  }
  console.log(`  nhận cạnh ${n} cảnh: sai số góc trung bình ${(100 * sum / n).toFixed(2)}%, lớn nhất ${(100 * maxErr).toFixed(2)}% đường chéo`);
  assert.ok(maxErr < 0.01, `sai số lớn nhất ${maxErr}`);
});

test('nhận cạnh: ảnh không có tài liệu (nhiễu đều) trả về found=false và khung mặc định', () => {
  const W = 400, H = 300;
  const d = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  for (let i = 0; i < W * H; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const v = 120 + (seed % 20); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  const r = detectDocument({ data: d, width: W, height: H });
  assert.equal(r.found, false);
  assert.equal(r.corners.length, 4);
  assert.ok(r.corners[0].x > 0 && r.corners[2].x < W);
});

test('nhận cạnh: nền sáng gần bằng giấy thì báo không chắc chắn thay vì trả khung sai với điểm cao', () => {
  let wrongButConfident = 0, total = 0;
  for (let k = 0; k < 8; k++) {
    const s = makeScene({ seed: 900 + k, bg: 'light', rot: (k * 13) % 50 - 25, persp: (k % 4) * 0.12, shadow: k % 2 === 1 });
    const r = detectDocument(s.img);
    const e = cornerError(r.corners, orderCorners(s.truth), 800, 600);
    total++;
    if (r.found && e.max > 0.02) wrongButConfident++;
  }
  console.log(`  nền sáng: ${wrongButConfident}/${total} ảnh bị tự tin sai`);
  assert.equal(wrongButConfident, 0);
});
