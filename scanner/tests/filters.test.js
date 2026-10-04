import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter, estimateBackground, FILTERS } from '../js/filters.js';

// Trang giấy 400x500 có bóng đổ dần sang phải và các vạch chữ
function page() {
  const W = 400, H = 500;
  const d = new Uint8ClampedArray(W * H * 4);
  const ink = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const shade = 1 - 0.45 * (x / W);
    let v = 245 * shade;
    const isInk = y % 25 > 10 && y % 25 < 14 && x > 30 && x < 370 && (x % 20) < 14;
    if (isInk) v = 50 * shade;
    const o = (y * W + x) * 4;
    d[o] = v; d[o + 1] = v * 0.98; d[o + 2] = v * 0.93; d[o + 3] = 255;
    if (isInk) ink.push(o);
  }
  return { img: { data: d, width: W, height: H }, ink, W, H };
}

const mean = (img, pts) => pts.reduce((s, o) => s + img.data[o], 0) / pts.length;

test('danh sách bộ lọc đủ 5 loại với nhãn tiếng Việt', () => {
  assert.deepEqual(FILTERS.map((f) => f.id), ['original', 'magic', 'bw', 'gray', 'deshadow']);
  assert.ok(FILTERS.every((f) => /\p{L}/u.test(f.label)));
});

test('estimateBackground bám theo bóng đổ', () => {
  const { img, W, H } = page();
  const bg = estimateBackground(img);
  const left = bg.r[Math.floor(bg.gh / 2) * bg.gw + 1], right = bg.r[Math.floor(bg.gh / 2) * bg.gw + bg.gw - 2];
  assert.ok(left > right + 40, `${left} vs ${right}`);
  void W; void H;
});

test('Nền trắng: nền giấy (kể cả vùng bóng) lên trên 235, chữ vẫn tối', () => {
  const { img, ink, W, H } = page();
  const bgPts = [];
  for (const [x, y] of [[10, 5], [200, 5], [390, 8], [390, 495], [10, 495], [200, 480]]) bgPts.push((y * W + x) * 4);
  applyFilter(img, 'magic');
  for (const o of bgPts) assert.ok(img.data[o] > 235, `nền ${img.data[o]}`);
  assert.ok(mean(img, ink) < 110, `chữ ${mean(img, ink)}`);
  void H;
});

test('Đen trắng: gần như chỉ còn đen và trắng, nền trắng, chữ đen', () => {
  const { img, ink, W } = page();
  applyFilter(img, 'bw');
  let extreme = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) { const v = img.data[i * 4]; if (v < 20 || v > 235) extreme++; assert.equal(img.data[i * 4], img.data[i * 4 + 1]); }
  assert.ok(extreme / n > 0.97, `tỉ lệ cực trị ${extreme / n}`);
  assert.ok(mean(img, ink) < 40);
  assert.ok(img.data[(5 * W + 390) * 4] > 240);
});

test('Xám: mọi kênh bằng nhau; Khử bóng: bóng phía phải sáng gần bằng phía trái', () => {
  const a = page();
  applyFilter(a.img, 'gray');
  for (let i = 0; i < a.W * a.H; i += 997) assert.equal(a.img.data[i * 4], a.img.data[i * 4 + 2]);
  const b = page();
  applyFilter(b.img, 'deshadow');
  const l = b.img.data[(5 * b.W + 10) * 4], r = b.img.data[(5 * b.W + 390) * 4];
  assert.ok(Math.abs(l - r) < 12, `${l} vs ${r}`);
});

test('Gốc không đổi ảnh', () => {
  const { img } = page();
  const before = Uint8ClampedArray.from(img.data);
  applyFilter(img, 'original');
  assert.deepEqual(Array.from(img.data), Array.from(before));
});

// Thẻ có ảnh chân dung, con dấu đỏ lớn, khối xám tối — các vùng này phải giữ chi tiết sau bộ lọc
function card() {
  const W = 600, H = 400;
  const d = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, r, g, b) => { const o = (y * W + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 240, 238, 232);
  // chữ giả
  for (let y = 40; y < 360; y += 22) for (let x = 230; x < 560; x += 18) if ((x / 18 + y) % 3) for (let k = 0; k < 10; k++) for (let j = 0; j < 4; j++) put(x + k, y + j, 40, 40, 50);
  // ảnh chân dung 140x180 ở (30,40): da + tóc + mắt, có chi tiết
  for (let y = 0; y < 180; y++) for (let x = 0; x < 140; x++) {
    let c = [205, 160, 130];
    if (y < 45) c = [35, 25, 20];
    if (y > 70 && y < 85 && ((x > 35 && x < 55) || (x > 85 && x < 105))) c = [30, 30, 30];
    if (y > 130 && y < 140 && x > 50 && x < 90) c = [150, 60, 60];
    put(30 + x, 40 + y, c[0], c[1], c[2]);
  }
  // con dấu đỏ lớn (hình tròn bán kính 70) ở (130,300)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 130) ** 2 + (y - 300) ** 2 < 70 * 70) put(x, y, 205, 35, 40);
  // khối xám tối 48 ở (440,250) 120x100
  for (let y = 250; y < 350; y++) for (let x = 440; x < 560; x++) put(x, y, 48, 48, 48);
  return { data: d, width: W, height: H };
}
const px = (img, x, y) => { const o = (y * img.width + x) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2]]; };
const lumOf = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

for (const f of ['magic', 'deshadow']) {
  test(`Bộ lọc ${f}: không làm cháy ảnh chân dung, con dấu đỏ, khối xám tối`, () => {
    const img = card();
    applyFilter(img, f);
    // khối xám tối vẫn tối
    assert.ok(lumOf(px(img, 500, 300)) < 90, `khối tối ${lumOf(px(img, 500, 300))}`);
    // con dấu vẫn đỏ rõ: đỏ vượt xanh lục nhiều
    const st = px(img, 130, 300);
    assert.ok(st[0] - st[1] > 90 && st[1] < 120, `con dấu ${st}`);
    // ảnh chân dung giữ chi tiết: tóc tối, da sáng hơn tóc nhiều, mắt tối hơn da
    const hair = lumOf(px(img, 100, 50)), skin = lumOf(px(img, 100, 110)), eye = lumOf(px(img, 75, 120));
    assert.ok(skin - hair > 70, `tóc ${hair} da ${skin}`);
    assert.ok(skin - eye > 50, `mắt ${eye} da ${skin}`);
    assert.ok(skin < 235, `da bị cháy ${skin}`);
    // nền giấy vẫn trắng
    assert.ok(lumOf(px(img, 590, 5)) > 225);
  });
}

test('looksLikePhoto: thẻ có ảnh được nhận ra, trang chữ thuần thì không', async () => {
  const { looksLikePhoto } = await import('../js/filters.js');
  assert.equal(looksLikePhoto(card()), true);
  assert.equal(looksLikePhoto(page().img), false);
});
