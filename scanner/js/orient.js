// Dò hướng chữ của trang đã nắn phẳng (0/90/180/270 độ) không cần OCR: dựa vào dòng chữ nằm ngang hay dọc,
// và với chữ Latin/tiếng Việt thì phần nét nhô lên (b, d, h, k, l, t, dấu) nhiều hơn phần nét thòng xuống (g, p, q, y).
// Thuần JS trên {data: RGBA, width, height}; kiểm thử được trong Node.

function toMask(img, maxEdge) {
  const { width: W, height: H, data } = img;
  const f = Math.max(1, Math.round(Math.max(W, H) / maxEdge));
  const w = Math.floor(W / f), h = Math.floor(H / f);
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let yy = 0; yy < f; yy++) { let i = ((y * f + yy) * W + x * f) * 4; for (let xx = 0; xx < f; xx++, i += 4) s += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; }
    g[y * w + x] = s / (f * f);
  }
  // trung bình cục bộ bằng ảnh tích phân
  const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < w; x++) { r += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + r; } }
  const rad = Math.max(8, Math.round(Math.min(w, h) / 25));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad), y1 = Math.min(h, y + rad + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1);
      const mean = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
      m[y * w + x] = g[y * w + x] < mean * 0.8 && g[y * w + x] < 215 ? 1 : 0;
    }
  }
  // bỏ đường kẻ bảng/viền giấy (đoạn mực liền rất dài) để không át tín hiệu dòng chữ
  const lenH = Math.round(w * 0.1), lenV = Math.round(h * 0.1);
  for (let y = 0; y < h; y++) {
    let s0 = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && m[y * w + x];
      if (on) { if (s0 < 0) s0 = x; } else if (s0 >= 0) { if (x - s0 >= lenH) for (let k = s0; k < x; k++) m[y * w + k] = 0; s0 = -1; }
    }
  }
  for (let x = 0; x < w; x++) {
    let s0 = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && m[y * w + x];
      if (on) { if (s0 < 0) s0 = y; } else if (s0 >= 0) { if (y - s0 >= lenV) for (let k = s0; k < y; k++) m[k * w + x] = 0; s0 = -1; }
    }
  }
  return { m, w, h };
}

function rot90(mk) { // xoay 90 độ theo chiều kim đồng hồ
  const { m, w, h } = mk;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = m[y * w + x];
  return { m: out, w: h, h: w };
}
const rot180 = (mk) => { const out = new Uint8Array(mk.m.length); for (let i = 0; i < out.length; i++) out[i] = mk.m[out.length - 1 - i]; return { m: out, w: mk.w, h: mk.h }; };

function profile(mk) {
  const { m, w, h } = mk;
  const p = new Float32Array(h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += m[y * w + x]; p[y] = s; }
  return p;
}

// Độ "có dòng": hệ số biến thiên của profile mực theo hàng sau khi làm mượt ~ độ cao một dòng chữ.
// Chữ nằm ngang -> các hàng xen kẽ dòng/khe rõ rệt; chữ nằm ngang xét theo cột thì gần đều.
function lineness(p) {
  const h = p.length, r = 2;
  const sm = new Float32Array(h);
  for (let y = 0; y < h; y++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const i = y + k; if (i >= 0 && i < h) { s += p[i]; c++; } } sm[y] = s / c; }
  let mean = 0; for (let y = 0; y < h; y++) mean += sm[y]; mean /= h;
  if (mean <= 0) return 0;
  let v = 0; for (let y = 0; y < h; y++) v += (sm[y] - mean) ** 2;
  return Math.sqrt(v / h) / mean;
}

/** Độ lệch nét nhô/thòng của một mặt nạ đang để theo hướng "chữ nằm ngang": (trên - dưới)/(trên + dưới), cộng cả số dòng đã xét. */
function asymmetry(mk) {
  const p = profile(mk);
  const h = p.length;
  const sm = new Float32Array(h);
  for (let y = 0; y < h; y++) sm[y] = (p[Math.max(0, y - 1)] + p[y] + p[Math.min(h - 1, y + 1)]) / 3;
  let sum = 0, cnt = 0;
  for (let y = 0; y < h; y++) if (sm[y] > 0) { sum += sm[y]; cnt++; }
  if (!cnt) return { a: 0, lines: 0 };
  const mu = sum / cnt;
  let top = 0, bot = 0, lines = 0;
  let y = 0;
  while (y < h) {
    if (sm[y] <= mu * 0.4) { y++; continue; }
    let t = y; while (y < h && sm[y] > mu * 0.25) y++;
    let b = y - 1;
    if (b - t < 4) continue;
    let mx = 0; for (let k = t; k <= b; k++) mx = Math.max(mx, sm[k]);
    let c0 = t, c1 = b;
    while (c0 < b && sm[c0] < mx * 0.6) c0++;
    while (c1 > t && sm[c1] < mx * 0.6) c1--;
    if (c1 - c0 < 2) continue;
    // chỉ tính dòng chữ thật: phần lõi (x-height) phải dày hơn rõ so với phần ngoài
    let tp = 0, bp = 0;
    for (let k = t; k < c0; k++) tp += p[k];
    for (let k = c1 + 1; k <= b; k++) bp += p[k];
    top += tp; bot += bp; lines++;
  }
  return { a: top + bot > 0 ? (top - bot) / (top + bot) : 0, lines };
}

/**
 * Trả về { rot, conf, horizontal }: rot là số độ cần xoay ảnh theo chiều kim đồng hồ để chữ thẳng đứng đúng chiều
 * (0, 90, 180, 270); conf 0..1 (thấp nghĩa là không chắc, nên giữ nguyên).
 */
export function detectOrientation(img, { maxEdge = 1000 } = {}) {
  const base = toMask(img, maxEdge);
  const L0 = lineness(profile(base));
  const m90 = rot90(base);
  const L90 = lineness(profile(m90));
  const horizontal = L0 >= L90;
  const h = horizontal ? base : m90; // h: mặt nạ mà chữ nằm ngang
  const r1 = horizontal ? 0 : 90, r2 = horizontal ? 180 : 270;
  const A1 = asymmetry(h), A2 = asymmetry(rot180(h));
  const lineConf = Math.min(1, Math.abs(L0 - L90) / Math.max(L0, L90, 1e-6) * 1.5 + 0.2);
  const score = A1.a - A2.a; // dương: hướng r1 thẳng
  const lines = Math.max(A1.lines, A2.lines);
  const conf = Math.min(1, Math.abs(score) * 3) * Math.min(1, lines / 6) * lineConf;
  let rot = score >= 0 ? r1 : r2;
  if (conf < 0.12) rot = horizontal ? 0 : r1; // không phân biệt được trên/dưới: chỉ sửa ngang/dọc
  const ratio = Math.max(L0, L90) / Math.max(1e-6, Math.min(L0, L90));
  // axisRot: chỉ sửa chữ nằm ngang/dọc (đáng tin); trên/dưới (0 hay 180) để bước đọc chữ kiểm tra lại
  const axisRot = ratio >= 1.6 ? (horizontal ? 0 : 90) : 0;
  return { rot, axisRot, ratio: +ratio.toFixed(2), conf: +conf.toFixed(2), horizontal, lineness: [+L0.toFixed(3), +L90.toFixed(3)], asym: [+A1.a.toFixed(2), +A2.a.toFixed(2)] };
}
