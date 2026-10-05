import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDewarp, applyField, curvatureOf, findTracks } from '../js/dewarp.js';
import { detectObstacles, removeObstacles, isSkin } from '../js/inpaint.js';
import { analyzeQuality, sharpness, frameWarnings } from '../js/quality.js';
import { applyFixes } from '../js/fixes.js';
import { makePage, rng } from './helpers/synth.js';

function warpV(img, f) {
  const { width: W, height: H, data } = img;
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sy = y - f(x / W) * H;
    if (sy < 0 || sy > H - 1) continue;
    const y0 = sy | 0, t = sy - y0, y1 = Math.min(H - 1, y0 + 1);
    for (let c = 0; c < 3; c++) out[(y * W + x) * 4 + c] = data[(y0 * W + x) * 4 + c] * (1 - t) + data[(y1 * W + x) * 4 + c] * t;
  }
  return { data: out, width: W, height: H };
}
const textPage = () => makePage(840, 1188, rng(3));

test('Nắn phẳng: trang sách cong và lượn sóng được dò, nắn và giảm độ cong rõ rệt', () => {
  for (const [name, f] of [['sách', (u) => 0.03 * (2 * u - 1) ** 2], ['sóng', (u) => 0.02 * Math.sin(2 * Math.PI * u)]]) {
    const w = warpV(textPage(), f);
    const e = estimateDewarp(w);
    assert.ok(e.auto, `${name}: phải tự bật (cong ${e.curvature.toFixed(4)}, nhất quán ${e.coherence.toFixed(2)})`);
    assert.ok(e.after.curvature < e.curvature * 0.5, `${name}: ${e.curvature} -> ${e.after.curvature}`);
    const fixed = applyField(w, e.field);
    const w2 = estimateDewarp(fixed);
    assert.ok(w2.curvature < e.curvature * 0.55, `${name}: đo lại sau khi nắn ${w2.curvature}`);
  }
});

test('Nắn phẳng: trang vốn phẳng hoặc cong rất nhẹ không bị tự áp dụng, ép bật cũng gần như không đổi', () => {
  const flat = textPage();
  const e = estimateDewarp(flat);
  assert.equal(e.auto, false);
  const forced = applyField(flat, e.field);
  let diff = 0;
  for (let i = 0; i < flat.data.length; i += 4) diff += Math.abs(flat.data[i] - forced.data[i]);
  assert.ok(diff / (flat.width * flat.height) < 4, 'ép bật trên trang phẳng không được làm méo: ' + diff / (flat.width * flat.height));
  const slight = estimateDewarp(warpV(textPage(), (u) => 0.003 * Math.sin(Math.PI * u)));
  assert.equal(slight.auto, false, 'cong 0,3% chưa đáng nắn');
  const blank = { data: new Uint8ClampedArray(400 * 400 * 4).fill(250), width: 400, height: 400 };
  assert.equal(estimateDewarp(blank).found, false);
});

test('Đường dòng: tìm đủ các dòng chữ và độ cong trung vị khớp độ uốn đã biết', () => {
  const w = warpV(textPage(), (u) => 0.03 * (2 * u - 1) ** 2);
  const est = estimateDewarp(w);
  assert.ok(est.nTracks >= 20);
  assert.ok(est.curvature > 0.008 && est.curvature < 0.02, String(est.curvature));
  void curvatureOf; void findTracks;
});

// trang giấy có chữ, kèm ngón tay vẽ từ mép
function paperWithFingers(tones, { paper = [246, 244, 238], W = 600, H = 800, interior = false } = {}) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = paper[0]; d[i * 4 + 1] = paper[1]; d[i * 4 + 2] = paper[2]; d[i * 4 + 3] = 255; }
  const ink = [];
  for (let r = 0; r < 20; r++) for (let c = 0; c < 15; c++) for (let y = 70 + r * 32; y < 70 + r * 32 + 4; y++) for (let x = 110 + c * 28; x < 110 + c * 28 + 18; x++) { const o = (y * W + x) * 4; d[o] = d[o + 1] = d[o + 2] = 40; ink.push(o); }
  const finger = [];
  tones.forEach((tone, k) => {
    const cy = 150 + k * 220, wd = 56;
    for (let y = cy - wd; y < cy + wd; y++) for (let x = 0; x < 92; x++) {
      const dd = Math.hypot(Math.max(0, x - 40), y - cy);
      if (Math.abs(y - cy) > wd || dd > wd) continue;
      const sh = 1 + 0.12 * Math.cos(((y - cy) / wd) * 1.4);
      const o = (y * W + x) * 4;
      d[o] = Math.min(255, tone[0] * sh); d[o + 1] = Math.min(255, tone[1] * sh); d[o + 2] = Math.min(255, tone[2] * sh);
      finger.push(o);
    }
  });
  if (interior) { for (let y = 300; y < 400; y++) for (let x = 250; x < 330; x++) { const o = (y * W + x) * 4; d[o] = 214; d[o + 1] = 160; d[o + 2] = 120; finger.push(o); } }
  return { img: { data: d, width: W, height: H }, ink, finger, W, H };
}
const TONES = [[250, 220, 194], [238, 190, 154], [214, 160, 118], [186, 132, 92], [140, 92, 62], [98, 64, 46], [66, 42, 30]];

test('Ngón tay mọi tông da (rất sáng đến rất tối) đè mép được dò, xóa thành màu giấy, chữ giữ nguyên', () => {
  for (const tone of TONES) {
    const s = paperWithFingers([tone]);
    const before = Uint8ClampedArray.from(s.img.data);
    const det = detectObstacles(s.img);
    assert.ok(det.found, `tông ${tone} không dò được`);
    removeObstacles(s.img, det);
    let off = 0;
    for (const o of s.finger) off = Math.max(off, Math.abs(s.img.data[o] - 246));
    const mean = s.finger.reduce((a, o) => a + Math.abs(s.img.data[o] - 246), 0) / s.finger.length;
    assert.ok(mean < 14, `tông ${tone}: còn lệch trung bình ${mean.toFixed(1)} so với màu giấy`);
    let inkChanged = 0;
    for (const o of s.ink) if (Math.abs(s.img.data[o] - before[o]) > 3) inkChanged++;
    assert.equal(inkChanged, 0, `tông ${tone}: chữ bị đổi ${inkChanged} điểm`);
  }
});

test('Nhiều ngón tay nhiều tông cùng lúc; ảnh chân dung giữa trang chỉ bị xóa khi người dùng ép bật; con dấu đỏ và giấy ố vàng không bị nhận nhầm', () => {
  const many = paperWithFingers([TONES[1], TONES[3], TONES[5]]);
  const d = detectObstacles(many.img);
  assert.equal(d.blobs.filter((b) => b.kind === 'skin').length, 3);
  const mid = paperWithFingers([], { interior: true });
  assert.equal(detectObstacles(mid.img).found, false, 'mảng da giữa trang (ảnh chân dung) không tự xóa');
  assert.equal(detectObstacles(mid.img, { interior: true }).found, true, 'ép bật thì xóa');
  // con dấu đỏ: vành mảnh
  const st = paperWithFingers([]);
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) { const r = Math.hypot(x - 300, y - 500); if (r > 60 && r < 68) { const o = (y * st.W + x) * 4; st.img.data[o] = 200; st.img.data[o + 1] = 35; st.img.data[o + 2] = 42; } }
  assert.equal(detectObstacles(st.img).found, false, 'con dấu đỏ không phải da');
  for (const paper of [[236, 220, 170], [250, 238, 205], [196, 224, 208], [214, 214, 212]]) {
    const y = paperWithFingers([], { paper });
    assert.equal(detectObstacles(y.img).found, false, `giấy ${paper} bị nhận nhầm là da`);
  }
  assert.ok(isSkin(214, 160, 118, { cb: 128, cr: 128 }));
  assert.ok(!isSkin(120, 140, 200, { cb: 128, cr: 128 }));
});

test('Ngón tay sát chữ được báo (chữ bị che không khôi phục được); ngón tay ở lề trống thì không báo', () => {
  const clean = paperWithFingers([TONES[2]]);
  assert.equal(detectObstacles(clean.img).overlapsText, false);
  const over = paperWithFingers([TONES[2]]);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let y = 130 + r * 32; y < 134 + r * 32; y++) for (let x = 96 + c * 28; x < 114 + c * 28; x++) { const o = (y * over.W + x) * 4; over.img.data[o] = over.img.data[o + 1] = over.img.data[o + 2] = 40; }
  assert.equal(detectObstacles(over.img).overlapsText, true);
});

test('applyFixes: tôn trọng chế độ tắt/ép bật theo trang và nhớ kết quả dò', () => {
  const s = paperWithFingers([TONES[2]]);
  const page = { corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], rot: 0 };
  const off = applyFixes({ ...s.img, data: Uint8ClampedArray.from(s.img.data) }, { ...page, clean: 'off', dewarp: 'off' });
  assert.equal(off.info.clean.applied, false);
  const auto = applyFixes({ ...s.img, data: Uint8ClampedArray.from(s.img.data) }, page);
  assert.equal(auto.info.clean.applied, true);
  assert.equal(auto.info.dewarp.applied, false);
  assert.ok(page._fix && page._fix.detAuto, 'kết quả dò được nhớ');
});

test('Chất lượng: ảnh mờ, thiếu sáng, chói lóa che chữ được cảnh báo; ảnh tốt không bị làm phiền', () => {
  const base = () => { const p = makePage(840, 1188, rng(11)); return p; };
  assert.deepEqual(analyzeQuality(base()).issues.map((i) => i.id), []);
  const blur = base();
  for (let pass = 0; pass < 14; pass++) { const src = Uint8ClampedArray.from(blur.data); for (let y = 2; y < blur.height - 2; y++) for (let x = 2; x < blur.width - 2; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let k = -2; k <= 2; k++) s += src[((y + k) * blur.width + x) * 4 + c] + src[(y * blur.width + x + k) * 4 + c]; blur.data[(y * blur.width + x) * 4 + c] = s / 10; } }
  assert.ok(analyzeQuality(blur).issues.some((i) => i.id === 'blur'));
  assert.ok(sharpness(base()) > sharpness(blur) * 2);
  const dark = base();
  for (let i = 0; i < dark.data.length; i += 4) { dark.data[i] *= 0.28; dark.data[i + 1] *= 0.28; dark.data[i + 2] *= 0.28; }
  assert.ok(analyzeQuality(dark).issues.some((i) => i.id === 'dark'));
  const glare = base();
  for (let y = 300; y < 420; y++) for (let x = 250; x < 560; x++) { const o = (y * glare.width + x) * 4; glare.data[o] = glare.data[o + 1] = glare.data[o + 2] = 255; }
  assert.ok(analyzeQuality(glare).issues.some((i) => i.id === 'glare'), 'chói lóa che chữ');
  const white = base();
  for (let y = 1115; y < 1180; y++) for (let x = 250; x < 560; x++) { const o = (y * white.width + x) * 4; white.data[o] = white.data[o + 1] = white.data[o + 2] = 255; }
  assert.ok(!analyzeQuality(white).issues.some((i) => i.id === 'glare'), 'vùng trắng trống không phải chói lóa');
});

test('Cảnh báo khung: tờ giấy chạm mép ảnh hoặc quá nhỏ', () => {
  const full = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.9 }];
  assert.deepEqual(frameWarnings(full, 3000, 2000, true), []);
  assert.ok(frameWarnings([{ x: 0, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 0, y: 0.9 }], 3000, 2000, true).some((w) => w.id === 'partial'));
  assert.ok(frameWarnings([{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }], 3000, 2000, true).some((w) => w.id === 'small'));
  assert.deepEqual(frameWarnings(full, 3000, 2000, false), []);
});
