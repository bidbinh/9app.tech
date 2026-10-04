import test from 'node:test';
import assert from 'node:assert/strict';
import { orderCorners, homography, applyH, warpPerspective, solveLinear, quadSize, isConvexQuad, polygonArea, rotateRGBA, fitEdge } from '../js/geom.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('orderCorners: mọi hoán vị đầu vào cho cùng thứ tự TL,TR,BR,BL', () => {
  const quad = [{ x: 10, y: 12 }, { x: 200, y: 20 }, { x: 190, y: 300 }, { x: 5, y: 280 }];
  const perms = [[0, 1, 2, 3], [2, 0, 3, 1], [3, 2, 1, 0], [1, 3, 0, 2], [3, 0, 1, 2]];
  for (const pm of perms) {
    const out = orderCorners(pm.map((i) => quad[i]));
    assert.deepEqual(out, quad);
  }
});

test('orderCorners: tờ giấy nghiêng 30 độ vẫn ra thứ tự theo chiều kim đồng hồ bắt đầu ở góc trên-trái', () => {
  const a = (30 * Math.PI) / 180;
  const base = [[-100, -140], [100, -140], [100, 140], [-100, 140]];
  const pts = base.map(([x, y]) => ({ x: 300 + x * Math.cos(a) - y * Math.sin(a), y: 300 + x * Math.sin(a) + y * Math.cos(a) }));
  const out = orderCorners([pts[2], pts[0], pts[3], pts[1]]);
  assert.deepEqual(out, pts);
});

test('orderCorners từ chối khác 4 điểm', () => {
  assert.throws(() => orderCorners([{ x: 0, y: 0 }]));
});

test('solveLinear giải đúng hệ 3x3', () => {
  const x = solveLinear([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
  close(x[0], 2); close(x[1], 3); close(x[2], -1);
  assert.throws(() => solveLinear([[1, 2], [2, 4]], [1, 2]));
});

test('homography: 4 điểm nguồn ánh xạ chính xác sang 4 điểm đích, ánh xạ ngược về điểm cũ', () => {
  const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 150 }];
  const dst = [{ x: 20, y: 30 }, { x: 180, y: 10 }, { x: 160, y: 220 }, { x: 5, y: 190 }];
  const H = homography(src, dst);
  for (let i = 0; i < 4; i++) {
    const p = applyH(H, src[i].x, src[i].y);
    close(p.x, dst[i].x, 1e-6); close(p.y, dst[i].y, 1e-6);
  }
  const Hi = homography(dst, src);
  const mid = applyH(H, 50, 75);
  const back = applyH(Hi, mid.x, mid.y);
  close(back.x, 50, 1e-6); close(back.y, 75, 1e-6);
});

test('quadSize, polygonArea, isConvexQuad', () => {
  const q = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  assert.deepEqual(quadSize(q), { w: 100, h: 50 });
  close(polygonArea(q), 5000);
  assert.equal(isConvexQuad(q), true);
  assert.equal(isConvexQuad([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 50 }]), false);
  assert.deepEqual(fitEdge(4000, 2000, 1000), { w: 1000, h: 500 });
  assert.deepEqual(fitEdge(400, 200, 1000), { w: 400, h: 200 });
});

// Ảnh nguồn: bàn cờ để kiểm tra chính xác vị trí điểm ảnh sau khi nắn
function checker(W, H, cell) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = (((x / cell) | 0) + ((y / cell) | 0)) % 2 ? 255 : 0;
    const o = (y * W + x) * 4; d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
  }
  return { data: d, width: W, height: H };
}

test('warpPerspective: quad là hình chữ nhật trục thẳng -> trích đúng vùng cắt', () => {
  const src = checker(200, 200, 20);
  const quad = [{ x: 40, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 120 }, { x: 40, y: 120 }];
  const out = warpPerspective(src, quad, 80, 80);
  // điểm ảnh đích (x,y) tương ứng nguồn (40+x, 40+y); chọn điểm giữa ô để tránh sai số mép
  for (const [x, y] of [[10, 10], [30, 10], [50, 50], [70, 70], [10, 70]]) {
    const sx = 40 + x, sy = 40 + y;
    const expect = (((sx / 20) | 0) + ((sy / 20) | 0)) % 2 ? 255 : 0;
    assert.equal(out[(y * 80 + x) * 4], expect, `(${x},${y})`);
  }
});

test('warpPerspective: nắn phẳng ảnh bị phối cảnh trả lại ảnh gốc (sai số nhỏ)', () => {
  // Tạo "ảnh chụp" bằng cách bóp ảnh bàn cờ vào một tứ giác, rồi nắn ngược
  const flat = checker(300, 400, 25);
  const shot = { data: new Uint8ClampedArray(600 * 600 * 4).fill(128), width: 600, height: 600 };
  const quad = [{ x: 120, y: 60 }, { x: 470, y: 90 }, { x: 520, y: 520 }, { x: 80, y: 470 }];
  const Hs = homography([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }], quad);
  const Hi = homography(quad, [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }]);
  for (let y = 0; y < 600; y++) for (let x = 0; x < 600; x++) {
    const p = applyH(Hi, x + 0.5, y + 0.5);
    if (p.x >= 0 && p.x < 300 && p.y >= 0 && p.y < 400) {
      const v = flat.data[((p.y | 0) * 300 + (p.x | 0)) * 4];
      const o = (y * 600 + x) * 4; shot.data[o] = shot.data[o + 1] = shot.data[o + 2] = v; shot.data[o + 3] = 255;
    }
  }
  void Hs;
  const out = warpPerspective(shot, quad, 300, 400);
  let bad = 0, n = 0;
  for (let y = 0; y < 400; y++) for (let x = 0; x < 300; x++) {
    // bỏ qua điểm sát mép ô bàn cờ vì lệch nửa điểm ảnh gây sai đen/trắng
    const fx = x % 25, fy = y % 25;
    if (fx < 3 || fx > 21 || fy < 3 || fy > 21) continue;
    n++;
    const want = flat.data[(y * 300 + x) * 4];
    if (Math.abs(out[(y * 300 + x) * 4] - want) > 90) bad++;
  }
  assert.ok(bad / n < 0.02, `tỉ lệ điểm sai ${bad}/${n}`);
});

test('rotateRGBA: xoay 90 rồi 270 trở lại ảnh gốc; 180 đảo hai chiều', () => {
  const d = new Uint8ClampedArray(3 * 2 * 4);
  for (let i = 0; i < 6; i++) { d[i * 4] = i * 10; d[i * 4 + 3] = 255; }
  const img = { data: d, width: 3, height: 2 };
  const r90 = rotateRGBA(img, 90);
  assert.equal(r90.width, 2); assert.equal(r90.height, 3);
  // điểm (0,0) gốc (giá trị 0) sang góc trên-phải sau khi xoay 90 cùng chiều kim đồng hồ
  assert.equal(r90.data[(0 * 2 + 1) * 4], 0);
  const back = rotateRGBA(r90, 270);
  assert.deepEqual(Array.from(back.data), Array.from(d));
  const r180 = rotateRGBA(img, 180);
  assert.equal(r180.data[0], 50);
  assert.equal(rotateRGBA(img, 0), img);
});
