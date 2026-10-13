// Sinh ảnh "chụp tài liệu" giả lập (có nghiêng, phối cảnh, bóng, nền khác nhau) kèm đáp án 4 góc, để đo độ chính xác nhận cạnh.
import { homography, applyH } from '../../js/geom.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trang giấy phẳng: nền gần trắng, các dòng chữ giả (khối xám đậm), tiêu đề, bảng.
export function makePage(pw, ph, rand, paper = [248, 246, 240]) {
  const d = new Uint8ClampedArray(pw * ph * 4);
  for (let i = 0; i < pw * ph; i++) { d[i * 4] = paper[0]; d[i * 4 + 1] = paper[1]; d[i * 4 + 2] = paper[2]; d[i * 4 + 3] = 255; }
  const rect = (x0, y0, x1, y1, v) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(ph, y1 | 0); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(pw, x1 | 0); x++) {
      const o = (y * pw + x) * 4; d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2];
    }
  };
  const m = pw * 0.1;
  rect(m, ph * 0.07, pw * 0.7, ph * 0.07 + ph * 0.025, [30, 30, 40]);
  let y = ph * 0.14;
  while (y < ph - m) {
    let x = m;
    const end = pw - m - rand() * pw * 0.25;
    while (x < end) {
      const wlen = pw * (0.03 + rand() * 0.08);
      rect(x, y, Math.min(end, x + wlen), y + ph * 0.012, [40 + rand() * 30, 40 + rand() * 30, 50 + rand() * 30]);
      x += wlen + pw * 0.012;
    }
    y += ph * 0.028;
  }
  return { data: d, width: pw, height: ph };
}

/**
 * opts: { W,H, seed, bg: 'wood'|'dark'|'light'|'gray'|'green', rot (độ), persp (0..1), scale (0.4..0.85), shadow (bool) }
 * Trả về { img:{data,width,height}, truth:[TL,TR,BR,BL] } (TL... là góc của TỜ GIẤY, theo thứ tự đã quay).
 */
export function makeScene(opts) {
  const { W = 800, H = 600, seed = 1, bg = 'wood', rot = 0, persp = 0.2, scale = 0.7, shadow = false } = opts;
  const rand = rng(seed);
  const pw = 420, ph = 594; // A4 tỉ lệ
  const page = makePage(pw, ph, rand);
  // 4 góc đích: hình chữ nhật xoay quanh tâm rồi bóp phối cảnh
  const cx = W / 2 + (rand() - 0.5) * W * 0.06, cy = H / 2 + (rand() - 0.5) * H * 0.06;
  const hh = (H * scale) / 2, hw = hh * (pw / ph);
  const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const base = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const dst = base.map(([x, y], i) => {
    const sx = 1 - persp * (i < 2 ? 0.25 : 0) * (0.6 + 0.4 * rand());
    const sy = 1 + (i === 1 || i === 2 ? persp * 0.06 * (rand() - 0.2) : 0);
    const px = x * sx, py = y * sy;
    return { x: cx + px * ca - py * sa, y: cy + px * sa + py * ca };
  });
  const src = [{ x: 0, y: 0 }, { x: pw, y: 0 }, { x: pw, y: ph }, { x: 0, y: ph }];
  const Hinv = homography(dst, src); // ảnh -> trang
  const data = new Uint8ClampedArray(W * H * 4);
  const bgColor = { wood: [150, 105, 60], dark: [38, 40, 46], light: [214, 212, 206], gray: [120, 124, 128], green: [60, 110, 80] }[bg];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const p = applyH(Hinv, x + 0.5, y + 0.5);
      let r, g, b;
      if (p.x >= 0 && p.x < pw && p.y >= 0 && p.y < ph) {
        const i = ((p.y | 0) * pw + (p.x | 0)) * 4;
        r = page.data[i]; g = page.data[i + 1]; b = page.data[i + 2];
        if (shadow === 'strong') { const k = 1 - 0.42 * Math.max(0, (p.x / pw - 0.4) * 1.7); r *= k; g *= k; b *= k; } else if (shadow) { const k = 1 - 0.38 * Math.max(0, (p.x / pw - 0.45) * 1.8) * (0.6 + p.y / ph * 0.4); r *= k; g *= k; b *= k; }
      } else {
        const tex = bg === 'wood' ? 1 + 0.12 * Math.sin(y * 0.35 + Math.sin(x * 0.02) * 4) : 1;
        const grad = 1 + 0.18 * ((x / W) - 0.5) - 0.1 * (y / H - 0.5);
        const k = tex * grad;
        r = bgColor[0] * k; g = bgColor[1] * k; b = bgColor[2] * k;
      }
      const nz = (rand() - 0.5) * 10;
      data[o] = r + nz; data[o + 1] = g + nz; data[o + 2] = b + nz; data[o + 3] = 255;
    }
  }
  return { img: { data, width: W, height: H }, truth: dst };
}

/** Sai số trung bình của 4 góc so với đáp án, tính theo % đường chéo ảnh. */
export function cornerError(found, truth, W, H) {
  const diag = Math.hypot(W, H);
  let s = 0, mx = 0;
  for (let i = 0; i < 4; i++) {
    const e = Math.hypot(found[i].x - truth[i].x, found[i].y - truth[i].y) / diag;
    s += e; mx = Math.max(mx, e);
  }
  return { mean: s / 4, max: mx };
}
