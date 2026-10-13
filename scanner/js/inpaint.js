// Xóa ngón tay / vật cản đè lên mép giấy: dò vùng da (màu da so với màu giấy, mọi tông da), giữ các mảng lớn chạm mép trang
// (ngón tay giữ giấy), rồi lấp bằng màu giấy nội suy từ vùng lân cận (push-pull). Không động tới chữ ngoài vùng da.
// Chữ bị ngón tay che thì KHÔNG khôi phục được: hàm trả về cờ `overlapsText` để giao diện báo người dùng chụp lại.
// Thuần JS trên {data: RGBA, width, height}; kiểm thử được trong Node.

const WORK_EDGE = 420;

function downscale(img, edge = WORK_EDGE) {
  const { width: W, height: H, data } = img;
  const f = Math.max(1, Math.round(Math.max(W, H) / edge));
  const w = Math.floor(W / f), h = Math.floor(H / f);
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let yy = 0; yy < f; yy++) { let i = ((y * f + yy) * W + x * f) * 4; for (let xx = 0; xx < f; xx++, i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; } }
    const a = f * f, o = (y * w + x) * 3;
    rgb[o] = r / a; rgb[o + 1] = g / a; rgb[o + 2] = b / a;
  }
  return { rgb, w, h, f };
}

const cbOf = (r, g, b) => 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
const crOf = (r, g, b) => 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d > 0) {
    if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  return { h: hh, s: mx ? d / mx : 0, v: mx / 255 };
}

/** Màu giấy tham chiếu: trung vị chroma (Cb, Cr) và độ sáng của 30% điểm sáng nhất. */
function paperRef(rgb, n) {
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  const sorted = Float32Array.from(lum).sort();
  const thr = sorted[Math.floor(n * 0.7)];
  const cbs = [], crs = [];
  for (let i = 0; i < n; i += 2) if (lum[i] >= thr) { cbs.push(cbOf(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])); crs.push(crOf(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])); }
  cbs.sort((a, b) => a - b); crs.sort((a, b) => a - b);
  return { cb: cbs[cbs.length >> 1] ?? 128, cr: crs[crs.length >> 1] ?? 128, lum: thr };
}

/** Điểm ảnh có phải da người (mọi tông) so với màu giấy? */
export function isSkin(r, g, b, ref) {
  if (!(r > g && g >= b * 0.82 && r > b)) return false; // da: đỏ > lục >= lam (cho phép lệch nhẹ)
  const cr = crOf(r, g, b), cb = cbOf(r, g, b);
  if (cr > 182) return false; // đỏ rực (con dấu)
  if (cr - ref.cr < 8 || cr < 139) return false;
  if (cb - ref.cb > 6) return false;
  const { h, s, v } = hsv(r, g, b);
  if (h > 48 && h < 345) return false;
  if (s < 0.15 || s > 0.78 || v < 0.16) return false;
  return true;
}

function integral(m, w, h) {
  const W1 = w + 1, I = new Int32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < w; x++) { r += m[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + r; } }
  return { I, W1 };
}
function boxSum(S, w, h, x, y, r) {
  const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
  return (S.I[y1 * S.W1 + x1] - S.I[y0 * S.W1 + x1] - S.I[y1 * S.W1 + x0] + S.I[y0 * S.W1 + x0]) / ((x1 - x0) * (y1 - y0));
}
function erode(m, w, h, r, frac = 0.93) { const S = integral(m, w, h), o = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = m[y * w + x] && boxSum(S, w, h, x, y, r) >= frac ? 1 : 0; return o; }
function dilate(m, w, h, r) { const S = integral(m, w, h), o = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = boxSum(S, w, h, x, y, r) > 0 ? 1 : 0; return o; }

function components(m, w, h) {
  const label = new Int32Array(w * h), list = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || label[s]) continue;
    const id = list.length + 1;
    const c = { id, area: 0, x0: w, y0: h, x1: 0, y1: 0, px: [] };
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      c.px.push(i); c.area++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && m[i - 1] && !label[i - 1]) { label[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && m[i + 1] && !label[i + 1]) { label[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && m[i - w] && !label[i - w]) { label[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && m[i + w] && !label[i + w]) { label[i + w] = id; stack.push(i + w); }
    }
    list.push(c);
  }
  return list;
}

/**
 * Dò vật cản da. opts: { interior (cho phép cả mảng không chạm mép), minArea (tỉ lệ diện tích trang) }.
 * Trả về { found, area (tỉ lệ), blobs, mask (Uint8Array w*h), w, h, overlapsText, touching } ; mask ở độ phân giải làm việc.
 */
export function detectObstacles(img, opts = {}) {
  const { rgb, w, h } = downscale(img);
  const n = w * h;
  const ref = paperRef(rgb, n);
  const skin = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (isSkin(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], ref)) skin[i] = 1;
  const ro = Math.max(2, Math.round(Math.min(w, h) / 85));
  // đóng lỗ nhỏ (móng tay, ánh sáng) rồi mở để bỏ nét mảnh (chữ, con dấu)
  let m = erode(dilate(skin, w, h, ro), w, h, ro, 0.99);
  m = dilate(erode(m, w, h, ro, 0.92), w, h, ro);
  const comps = components(m, w, h);
  const minArea = (opts.minArea ?? 0.0004) * n;
  const band = Math.max(3, Math.round(Math.min(w, h) * 0.035));
  const keep = new Uint8Array(n);
  const blobs = [];
  let touching = 0;
  for (const c of comps) {
    if (c.area < minArea) continue;
    const touches = c.x0 <= band || c.y0 <= band || c.x1 >= w - 1 - band || c.y1 >= h - 1 - band;
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    const fill = c.area / (bw * bh);
    // ngón tay: mảng dài/tròn liền khối. Ảnh chân dung nằm giữa trang (không chạm mép) bị loại trừ trừ khi người dùng ép bật
    const okInterior = opts.interior && c.area >= 0.006 * n && fill > 0.35;
    if (!touches && !okInterior) continue;
    for (const i of c.px) keep[i] = 1;
    blobs.push({ area: c.area / n, x0: c.x0 / w, y0: c.y0 / h, x1: (c.x1 + 1) / w, y1: (c.y1 + 1) / h, touches, kind: 'skin' });
    if (touches) touching++;
  }
  // nền bàn lọt vào mép trang (trang cong làm mép giấy lượn, hoặc cắt khung hơi rộng): dải màu khác giấy mỏng sát mép
  let leakCount = 0;
  if (opts.leak !== false) {
    const paperLike = new Uint8Array(n);
    let pl = 0;
    for (let i = 0; i < n; i++) {
      const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (Math.abs(cbOf(r, g, b) - ref.cb) < 16 && Math.abs(crOf(r, g, b) - ref.cr) < 16 && l >= ref.lum * 0.5) { paperLike[i] = 1; pl++; }
    }
    if (pl / n > 0.6) {
      const leak = new Uint8Array(n);
      for (let i = 0; i < n; i++) leak[i] = paperLike[i] ? 0 : 1;
      const lk = dilate(erode(leak, w, h, ro, 0.9), w, h, ro);
      for (const c of components(lk, w, h)) {
        if (c.area < 0.0006 * n) continue;
        const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
        const side = (c.x0 <= band && bw <= 0.1 * w) || (c.x1 >= w - 1 - band && bw <= 0.1 * w) || (c.y0 <= band && bh <= 0.1 * h) || (c.y1 >= h - 1 - band && bh <= 0.1 * h);
        if (!side) continue;
        for (const i of c.px) keep[i] = 1;
        blobs.push({ area: c.area / n, x0: c.x0 / w, y0: c.y0 / h, x1: (c.x1 + 1) / w, y1: (c.y1 + 1) / h, touches: true, kind: 'leak' });
        leakCount++;
      }
    }
  }
  const rd = Math.max(3, Math.round(Math.min(w, h) / 60));
  const mask = blobs.length ? dilate(keep, w, h, rd) : keep;
  let cnt = 0; for (let i = 0; i < n; i++) cnt += mask[i];
  // chữ nằm sát vùng da? lấy vành ngoài và đo mật độ mực
  let overlapsText = false;
  if (blobs.length) {
    const ring = dilate(mask, w, h, rd * 2);
    let rc = 0, ink = 0;
    for (let i = 0; i < n; i++) {
      if (!ring[i] || mask[i]) continue;
      rc++;
      const l = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
      if (l < ref.lum * 0.62) ink++;
    }
    overlapsText = rc > 0 && ink / rc > 0.045;
  }
  let sk = 0; for (let i = 0; i < n; i++) sk += skin[i];
  return { found: blobs.length > 0, area: cnt / n, blobs, mask, w, h, touching, overlapsText, ref, debug: { leak: leakCount, skinFrac: sk / n, comps: comps.map((c) => +(c.area / n * 100).toFixed(2)).slice(0, 6) } };
}

/** Lấp vùng mask bằng màu giấy nội suy (push-pull); mực và vùng da không dùng làm nguồn. Sửa trực tiếp img. */
export function removeObstacles(img, det) {
  if (!det || !det.found) return img;
  const { width: W, height: H, data } = img;
  const { rgb, w, h } = downscale(img);
  const n = w * h;
  const ref = det.ref;
  const wt = new Float32Array(n), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const l = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
    const known = !det.mask[i] && l >= ref.lum * 0.66;
    wt[i] = known ? 1 : 0;
    col[i * 3] = rgb[i * 3] * wt[i]; col[i * 3 + 1] = rgb[i * 3 + 1] * wt[i]; col[i * 3 + 2] = rgb[i * 3 + 2] * wt[i];
  }
  // kim tự tháp: pull
  const levels = [{ w, h, wt, col }];
  while (levels[levels.length - 1].w > 2 && levels[levels.length - 1].h > 2) {
    const p = levels[levels.length - 1];
    const nw = Math.ceil(p.w / 2), nh = Math.ceil(p.h / 2);
    const cw = new Float32Array(nw * nh), cc = new Float32Array(nw * nh * 3);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x, o = (y >> 1) * nw + (x >> 1);
      cw[o] += p.wt[i] / 4; cc[o * 3] += p.col[i * 3] / 4; cc[o * 3 + 1] += p.col[i * 3 + 1] / 4; cc[o * 3 + 2] += p.col[i * 3 + 2] / 4;
    }
    levels.push({ w: nw, h: nh, wt: cw, col: cc });
  }
  // push: từ đỉnh xuống, ô thiếu trọng số lấy màu từ cấp thô hơn
  const mean = (L) => { const o = new Float32Array(L.w * L.h * 3); for (let i = 0; i < L.w * L.h; i++) { const k = L.wt[i]; if (k > 1e-6) { o[i * 3] = L.col[i * 3] / k; o[i * 3 + 1] = L.col[i * 3 + 1] / k; o[i * 3 + 2] = L.col[i * 3 + 2] / k; } } return o; };
  let up = null; // màu đã lấp của cấp trên (w x h tương ứng cấp đó)
  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li];
    const base = mean(L);
    const out = new Float32Array(L.w * L.h * 3);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x;
      const k = Math.min(1, L.wt[i]);
      let uc = [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]];
      if (up) {
        const P = levels[li + 1];
        const fx = Math.min(P.w - 1, Math.max(0, x / 2 - 0.25)), fy = Math.min(P.h - 1, Math.max(0, y / 2 - 0.25));
        const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(P.w - 1, x0 + 1), y1 = Math.min(P.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
        const g = (xx, yy, c) => up[(yy * P.w + xx) * 3 + c];
        const bil = [0, 1, 2].map((c) => (g(x0, y0, c) * (1 - tx) + g(x1, y0, c) * tx) * (1 - ty) + (g(x0, y1, c) * (1 - tx) + g(x1, y1, c) * tx) * ty);
        uc = k > 1e-6 ? [0, 1, 2].map((c) => k * base[i * 3 + c] + (1 - k) * bil[c]) : bil;
      }
      out[i * 3] = uc[0]; out[i * 3 + 1] = uc[1]; out[i * 3 + 2] = uc[2];
    }
    up = out;
  }
  const fill = up; // w x h
  // mask mềm (làm mờ 1 lần) rồi áp dụng lên ảnh gốc độ phân giải đầy đủ
  const soft = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) { const X = x + xx, Y = y + yy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; s += det.mask[Y * w + X]; c++; }
    soft[y * w + x] = s / c;
  }
  const sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, y * sy - 0.5)), y0 = fy | 0, y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, x * sx - 0.5)), x0 = fx | 0, x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = ((soft[y0 * w + x0] * (1 - tx) + soft[y0 * w + x1] * tx) * (1 - ty) + (soft[y1 * w + x0] * (1 - tx) + soft[y1 * w + x1] * tx) * ty);
      if (a <= 0.02) continue;
      const al = Math.min(1, a * 1.5);
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const f = (fill[(y0 * w + x0) * 3 + c] * (1 - tx) + fill[(y0 * w + x1) * 3 + c] * tx) * (1 - ty) + (fill[(y1 * w + x0) * 3 + c] * (1 - tx) + fill[(y1 * w + x1) * 3 + c] * tx) * ty;
        data[o + c] = data[o + c] * (1 - al) + f * al;
      }
    }
  }
  return img;
}
