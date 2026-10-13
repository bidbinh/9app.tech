// Bộ lọc ảnh tài liệu. Làm việc trực tiếp trên {data: RGBA, width, height}, thuần JS (kiểm thử được trong Node).
// Ý chính: ước lượng "màu nền giấy" thay đổi chậm trên ảnh (lưới ô, lấy phân vị 85 của từng ô),
// rồi chia ảnh cho nền đó để bỏ bóng đổ và đưa nền về trắng.

export const FILTERS = [
  { id: 'auto', label: 'Màu tự động', hint: 'Tự chọn: văn bản thì nền trắng, nét rõ; có ảnh/con dấu thì giữ màu. Nên dùng mặc định.' },
  { id: 'sharp', label: 'Ảnh rõ nét', hint: 'Nền trắng, chữ đậm và sắc nét, vẫn giữ màu mực và con dấu.' },
  { id: 'docbw', label: 'Trắng đen tài liệu', hint: 'Như bản photo: chữ đen trên nền trắng tinh, nhẹ khi in hoặc gửi. Mất ảnh và màu.' },
  { id: 'deshadow', label: 'Khử bóng', hint: 'Bỏ bóng đổ, cân bằng màu giấy, giữ ảnh. Hợp giấy tờ có ảnh.' },
  { id: 'original', label: 'Gốc', hint: 'Giữ nguyên màu. Hợp giấy tờ có ảnh, con dấu.' },
  { id: 'gray', label: 'Xám', hint: 'Bỏ màu: con dấu đỏ và ảnh sẽ thành xám.' },
  { id: 'magic', label: 'Nền trắng', hint: 'Làm trắng nền, hợp văn bản thuần. Có thể làm nhạt ảnh và con dấu.' },
  { id: 'bw', label: 'Đen trắng', hint: 'Chỉ nên dùng cho văn bản thuần: mất ảnh, con dấu và màu.' },
];

const BINS = 64;

function boxBlurGrid(a, gw, gh) {
  const out = new Float32Array(a.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let s = 0, c = 0;
      for (let yy = -1; yy <= 1; yy++) {
        const Y = y + yy; if (Y < 0 || Y >= gh) continue;
        for (let xx = -1; xx <= 1; xx++) { const X = x + xx; if (X < 0 || X >= gw) continue; s += a[Y * gw + X]; c++; }
      }
      out[y * gw + x] = s / c;
    }
  }
  return out;
}

function dilateGrid(a, gw, gh) {
  const out = new Float32Array(a.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let m = 0;
      for (let yy = -1; yy <= 1; yy++) {
        const Y = y + yy; if (Y < 0 || Y >= gh) continue;
        for (let xx = -1; xx <= 1; xx++) { const X = x + xx; if (X < 0 || X >= gw) continue; if (a[Y * gw + X] > m) m = a[Y * gw + X]; }
      }
      // ô chỉ kém hẳn lân cận (do dính mực) mới được thay bằng giá trị lớn nhất; bóng đổ thoải thì giữ nguyên giá trị ô
      const g0 = a[y * gw + x];
      out[y * gw + x] = g0 >= m * 0.8 ? g0 : m;
    }
  }
  return out;
}

/**
 * Ước lượng ảnh nền (màu giấy) theo từng kênh. Trả về {cell, gw, gh, r, g, b} là lưới giá trị nền (0..255).
 */
export function estimateBackground(img, pct = 0.85) {
  const { width: w, height: h, data } = img;
  const cell = Math.max(8, Math.round(Math.min(w, h) / 26));
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grids = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)];
  const hist = [new Uint32Array(BINS), new Uint32Array(BINS), new Uint32Array(BINS)];
  const step = w * h > 1500000 ? 2 : 1;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      hist[0].fill(0); hist[1].fill(0); hist[2].fill(0);
      let cnt = 0;
      const y1 = Math.min(h, (gy + 1) * cell), x1 = Math.min(w, (gx + 1) * cell);
      for (let y = gy * cell; y < y1; y += step) {
        let i = (y * w + gx * cell) * 4;
        for (let x = gx * cell; x < x1; x += step, i += 4 * step) {
          hist[0][data[i] >> 2]++; hist[1][data[i + 1] >> 2]++; hist[2][data[i + 2] >> 2]++;
          cnt++;
        }
      }
      const target = cnt * pct;
      for (let c = 0; c < 3; c++) {
        let acc = 0, b = 0;
        for (; b < BINS; b++) { acc += hist[c][b]; if (acc >= target) break; }
        grids[c][gy * gw + gx] = Math.min(255, b * 4 + 2);
      }
    }
  }
  // Chỉ những ô "giống giấy" (đủ sáng so với phần sáng của ảnh, ít màu) mới được tin làm nền.
  // Ô nằm trong ảnh chân dung, con dấu đỏ, khối tối... được nội suy từ các ô giấy xung quanh,
  // nên không bị chia cho chính màu của nó (nguyên nhân làm cháy ảnh và mảng tối).
  const n = gw * gh;
  const lumG = new Float32Array(n), sat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = grids[0][i], g = grids[1][i], b = grids[2][i];
    lumG[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = mx > 0 ? (mx - mn) / mx : 0;
  }
  const sortedL = Array.from(lumG).sort((a, b) => a - b);
  const ref = sortedL[Math.floor(n * 0.8)];
  const known = new Uint8Array(n);
  let nKnown = 0;
  for (let i = 0; i < n; i++) if (lumG[i] >= Math.max(24, Math.min(110, ref * 0.8), ref * 0.62) && sat[i] <= 0.3) { known[i] = 1; nKnown++; }
  // Bóng đổ lớn (bàn tay, nếp gấp) sáng dần/tối dần: ô hơi tối hơn ô giấy bên cạnh vẫn là giấy.
  // Ảnh/khối tối thì tụt đột ngột nên không bị coi là giấy.
  for (let guard = 0; guard < gw + gh; guard++) {
    const add = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (known[i] || sat[i] > 0.3 || lumG[i] < Math.max(16, Math.min(55, ref * 0.6), ref * 0.42)) continue;
      let best = 0;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
        const X = x + xx, Y = y + yy;
        if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
        const j = Y * gw + X;
        if (known[j] && lumG[j] > best) best = lumG[j];
      }
      if (best > 0 && lumG[i] >= best * 0.86) add.push(i);
    }
    if (!add.length) break;
    for (const i of add) { known[i] = 1; nKnown++; }
  }
  const nonPaper0 = 1 - nKnown / n;
  const nonPaper = Math.max(nonPaper0, 0);
  if (nKnown > 0 && nKnown < n) {
    for (let guard = 0; guard < gw + gh && nKnown < n; guard++) {
      const add = [];
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (known[i]) continue;
        let sr = 0, sg = 0, sb = 0, c = 0;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
          const X = x + xx, Y = y + yy;
          if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
          const j = Y * gw + X;
          if (known[j]) { sr += grids[0][j]; sg += grids[1][j]; sb += grids[2][j]; c++; }
        }
        if (c) add.push([i, sr / c, sg / c, sb / c]);
      }
      for (const [i, r, g, b] of add) { grids[0][i] = r; grids[1][i] = g; grids[2][i] = b; known[i] = 1; nKnown++; }
      if (!add.length) break;
    }
  } else if (nKnown === 0) {
    // không có ô nào giống giấy: dùng nền trung tính để không khuếch đại gì cả
    for (let i = 0; i < n; i++) { grids[0][i] = grids[1][i] = grids[2][i] = 235; }
  }
  const smooth = grids.map((g) => boxBlurGrid(boxBlurGrid(dilateGrid(g, gw, gh), gw, gh), gw, gh));
  return { cell, gw, gh, r: smooth[0], g: smooth[1], b: smooth[2], nonPaper };
}

// Nội suy song tuyến giá trị nền tại điểm ảnh (x,y)
function makeSampler(bg) {
  const { cell, gw, gh } = bg;
  return function sample(grid, x, y) {
    let fx = x / cell - 0.5, fy = y / cell - 0.5;
    if (fx < 0) fx = 0; if (fy < 0) fy = 0;
    if (fx > gw - 1) fx = gw - 1; if (fy > gh - 1) fy = gh - 1;
    const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx;
    const b = grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx;
    return a * (1 - ty) + b * ty;
  };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Nền trắng (kiểu "Magic Color"): chia theo nền từng kênh, kéo tương phản, tăng nhẹ độ bão hòa. */
export function filterMagic(img, bg) {
  const { width: w, height: h, data } = img;
  bg = bg || estimateBackground(img);
  const sm = makeSampler(bg);
  const lo = 38, hi = 228;
  const k = 255 / (hi - lo);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const br = Math.max(12, sm(bg.r, x, y)), bgc = Math.max(12, sm(bg.g, x, y)), bb = Math.max(12, sm(bg.b, x, y));
      let r = (data[i] * 255) / br, g = (data[i + 1] * 255) / bgc, b = (data[i + 2] * 255) / bb;
      r = clamp255((r - lo) * k); g = clamp255((g - lo) * k); b = clamp255((b - lo) * k);
      let l = 0.299 * r + 0.587 * g + 0.114 * b;
      // tăng đậm nét nhạt (bút chì, mực xanh nhạt, mực phai): kéo các điểm xám trung bình tối đi, giữ nguyên màu mực và nền trắng
      if (l > 1) {
        const ln = l / 255, t = smooth(0.5, 0.97, ln), a = 0.45 * smooth(0.5, 0.66, ln);
        const target = l * (1 - a) + t * 255 * a;
        const gain = target / l;
        r = clamp255(r * gain); g = clamp255(g * gain); b = clamp255(b * gain);
        l = 0.299 * r + 0.587 * g + 0.114 * b;
      }
      const sat = 1.18;
      data[i] = clamp255(l + (r - l) * sat); data[i + 1] = clamp255(l + (g - l) * sat); data[i + 2] = clamp255(l + (b - l) * sat);
    }
  }
  return img;
}

/** Khử bóng: chia từng kênh cho màu nền (bỏ bóng đổ và ám màu giấy), không kéo tương phản mạnh. */
export function filterDeshadow(img, bg) {
  const { width: w, height: h, data } = img;
  bg = bg || estimateBackground(img);
  const sm = makeSampler(bg);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const br = Math.max(12, sm(bg.r, x, y)), bgc = Math.max(12, sm(bg.g, x, y)), bb = Math.max(12, sm(bg.b, x, y));
      // cân bằng trắng nhẹ: kéo màu nền về gần trung tính nhưng không xóa hẳn sắc giấy
      const lum = 0.299 * br + 0.587 * bgc + 0.114 * bb;
      const kr = 0.8 * (252 / br) + 0.2 * (252 / lum), kg = 0.8 * (252 / bgc) + 0.2 * (252 / lum), kb = 0.8 * (252 / bb) + 0.2 * (252 / lum);
      data[i] = clamp255(data[i] * kr); data[i + 1] = clamp255(data[i + 1] * kg); data[i + 2] = clamp255(data[i + 2] * kb);
    }
  }
  return img;
}

/** Làm nét kiểu "unsharp mask" chỉ trên độ sáng (không viền màu). radius tính theo điểm ảnh, amount ~0.6..1.6. */
export function sharpen(img, amount = 1, radius) {
  const { width: w, height: h, data } = img;
  const r = radius || Math.max(1, Math.round(Math.min(w, h) / 700));
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let cur = lum;
  for (let pass = 0; pass < 3; pass++) cur = boxBlurF(cur, w, h, r); // 3 lần hộp ~ Gauss
  for (let i = 0; i < n; i++) {
    const d = (lum[i] - cur[i]) * amount;
    const o = i * 4;
    data[o] = clamp255(data[o] + d); data[o + 1] = clamp255(data[o + 1] + d); data[o + 2] = clamp255(data[o + 2] + d);
  }
  return img;
}

function boxBlurF(src, w, h, rad) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const win = 2 * rad + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -rad; x <= rad; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / win;
      s += src[y * w + Math.min(w - 1, x + rad + 1)] - src[y * w + Math.max(0, x - rad)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -rad; y <= rad; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / win;
      s += tmp[Math.min(h - 1, y + rad + 1) * w + x] - tmp[Math.max(0, y - rad) * w + x];
    }
  }
  return out;
}

/** Ảnh rõ nét: nền trắng + làm nét + chữ đậm hơn một chút. Giữ màu mực. */
export function filterSharp(img, bg) {
  filterMagic(img, bg);
  sharpen(img, 1.1);
  return img;
}

/** Trắng đen tài liệu: chuẩn hóa theo nền rồi ngưỡng cục bộ kiểu Sauvola (chữ đen, nền trắng tinh, chịu được bóng và nền loang). */
export function filterDocBW(img, bg) {
  const { width: w, height: h, data } = img;
  bg = bg || estimateBackground(img);
  const sm = makeSampler(bg);
  const n = w * h;
  const L = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    const bl = Math.max(12, 0.299 * sm(bg.r, x, y) + 0.587 * sm(bg.g, x, y) + 0.114 * sm(bg.b, x, y));
    L[i] = Math.min(1.3, (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / bl);
  }
  // ảnh tích phân của L và L^2 để lấy trung bình/độ lệch cục bộ
  const W1 = w + 1;
  const I1 = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let r1 = 0, r2 = 0;
    for (let x = 0; x < w; x++) {
      const v = L[y * w + x];
      r1 += v; r2 += v * v;
      I1[(y + 1) * W1 + x + 1] = I1[y * W1 + x + 1] + r1;
      I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + r2;
    }
  }
  const win = Math.max(12, Math.round(Math.min(w, h) / 28));
  const k = 0.3, R = 0.3;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - win), y1 = Math.min(h, y + win + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - win), x1 = Math.min(w, x + win + 1);
      const cnt = (x1 - x0) * (y1 - y0);
      const s1 = I1[y1 * W1 + x1] - I1[y0 * W1 + x1] - I1[y1 * W1 + x0] + I1[y0 * W1 + x0];
      const s2 = I2[y1 * W1 + x1] - I2[y0 * W1 + x1] - I2[y1 * W1 + x0] + I2[y0 * W1 + x0];
      const m = s1 / cnt, sd = Math.sqrt(Math.max(0, s2 / cnt - m * m));
      // vùng phẳng (không chữ): ngưỡng thấp để nền luôn trắng; vùng có nét: ngưỡng Sauvola
      let T = m * (1 + k * (sd / R - 1));
      T = Math.min(T, 0.82);
      const v = L[y * w + x];
      const t = smooth(T - 0.07, T + 0.03, v);
      const o = (y * w + x) * 4;
      const c = 255 * t;
      data[o] = data[o + 1] = data[o + 2] = c;
    }
  }
  return img;
}

/** Màu tự động: văn bản thuần -> Ảnh rõ nét; có ảnh/con dấu lớn -> Khử bóng + làm nét nhẹ. */
export function filterAuto(img, bg) {
  bg = bg || estimateBackground(img);
  if (bg.nonPaper > 0.12) { filterDeshadow(img, bg); sharpen(img, 0.7); } else filterSharp(img, bg);
  return img;
}

/** Đen trắng cho chữ: độ sáng chuẩn hóa theo nền rồi ngưỡng mềm (giữ viền chữ mượt). */
export function filterBW(img, threshold = 0.76) {
  const { width: w, height: h, data } = img;
  const bg = estimateBackground(img);
  const sm = makeSampler(bg);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const bl = Math.max(12, 0.299 * sm(bg.r, x, y) + 0.587 * sm(bg.g, x, y) + 0.114 * sm(bg.b, x, y));
      const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / bl;
      const v = 255 * smooth(threshold - 0.14, threshold + 0.04, l);
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  }
  return img;
}

/** Xám: bỏ màu, kéo giãn mức sáng theo phân vị 1% và 99%. */
export function filterGray(img) {
  const { width: w, height: h, data } = img;
  const hist = new Uint32Array(256);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const l = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) | 0;
    data[i * 4] = l; hist[l]++;
  }
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  if (hi - lo < 20) { lo = 0; hi = 255; }
  const k = 255 / (hi - lo);
  for (let i = 0; i < n; i++) {
    const v = clamp255((data[i * 4] - lo) * k);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
  }
  return img;
}

/** Ảnh quá tối thường nhiều nhiễu hạt: làm mịn nhẹ 3x3 trước khi lọc để chia cho nền không khuếch đại nhiễu. */
export function denoiseIfDark(img) {
  const { width: w, height: h, data } = img;
  const sample = [];
  for (let i = 0; i < w * h; i += 37) sample.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  sample.sort((a, b) => a - b);
  const p70 = sample[Math.floor(sample.length * 0.7)] || 255;
  if (p70 >= 125) return false;
  const tmp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, a = (y * w + Math.max(0, x - 1)) * 4, b = (y * w + Math.min(w - 1, x + 1)) * 4;
    for (let c = 0; c < 3; c++) tmp[o + c] = (data[a + c] + data[o + c] * 2 + data[b + c]) / 4;
    tmp[o + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, a = (Math.max(0, y - 1) * w + x) * 4, b = (Math.min(h - 1, y + 1) * w + x) * 4;
    for (let c = 0; c < 3; c++) data[o + c] = (tmp[a + c] + tmp[o + c] * 2 + tmp[b + c]) / 4;
  }
  return true;
}

export function applyFilter(img, id) {
  if (id !== 'original' && id !== 'gray') denoiseIfDark(img);
  switch (id) {
    case 'auto': return filterAuto(img);
    case 'sharp': return filterSharp(img);
    case 'docbw': return filterDocBW(img);
    case 'magic': return filterMagic(img);
    case 'bw': return filterBW(img);
    case 'gray': return filterGray(img);
    case 'deshadow': return filterDeshadow(img);
    default: return img;
  }
}

/** Trang có vùng ảnh/màu lớn (chân dung, con dấu, khối tối)? Dùng để gợi ý đừng dùng Nền trắng/Đen trắng. */
export function looksLikePhoto(img, threshold = 0.12) {
  return estimateBackground(img).nonPaper > threshold;
}
