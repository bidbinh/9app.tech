// Bộ lọc ảnh tài liệu. Làm việc trực tiếp trên {data: RGBA, width, height}, thuần JS (kiểm thử được trong Node).
// Ý chính: ước lượng "màu nền giấy" thay đổi chậm trên ảnh (lưới ô, lấy phân vị 85 của từng ô),
// rồi chia ảnh cho nền đó để bỏ bóng đổ và đưa nền về trắng.

export const FILTERS = [
  { id: 'original', label: 'Gốc', hint: 'Giữ nguyên màu. Hợp giấy tờ có ảnh, con dấu.' },
  { id: 'magic', label: 'Nền trắng', hint: 'Làm trắng nền, hợp văn bản thuần. Có thể làm nhạt ảnh và con dấu.' },
  { id: 'bw', label: 'Đen trắng', hint: 'Chỉ nên dùng cho văn bản thuần: mất ảnh, con dấu và màu.' },
  { id: 'gray', label: 'Xám', hint: 'Bỏ màu: con dấu đỏ và ảnh sẽ thành xám.' },
  { id: 'deshadow', label: 'Khử bóng', hint: 'Bỏ bóng đổ, giữ màu và ảnh. Nên dùng mặc định.' },
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
      out[y * gw + x] = m;
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
  for (let i = 0; i < n; i++) if (lumG[i] >= Math.max(110, ref * 0.62) && sat[i] <= 0.3) { known[i] = 1; nKnown++; }
  const nonPaper = 1 - nKnown / n;
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
export function filterMagic(img) {
  const { width: w, height: h, data } = img;
  const bg = estimateBackground(img);
  const sm = makeSampler(bg);
  const lo = 38, hi = 228;
  const k = 255 / (hi - lo);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const br = Math.max(90, sm(bg.r, x, y)), bgc = Math.max(90, sm(bg.g, x, y)), bb = Math.max(90, sm(bg.b, x, y));
      let r = (data[i] * 255) / br, g = (data[i + 1] * 255) / bgc, b = (data[i + 2] * 255) / bb;
      r = clamp255((r - lo) * k); g = clamp255((g - lo) * k); b = clamp255((b - lo) * k);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = 1.18;
      data[i] = clamp255(l + (r - l) * sat); data[i + 1] = clamp255(l + (g - l) * sat); data[i + 2] = clamp255(l + (b - l) * sat);
    }
  }
  return img;
}

/** Khử bóng: chỉ chia cho độ sáng nền (giữ nguyên sắc giấy và ảnh), không kéo tương phản mạnh. */
export function filterDeshadow(img) {
  const { width: w, height: h, data } = img;
  const bg = estimateBackground(img);
  const sm = makeSampler(bg);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const bl = Math.max(90, 0.299 * sm(bg.r, x, y) + 0.587 * sm(bg.g, x, y) + 0.114 * sm(bg.b, x, y));
      const f = 250 / bl;
      data[i] = clamp255(data[i] * f); data[i + 1] = clamp255(data[i + 1] * f); data[i + 2] = clamp255(data[i + 2] * f);
    }
  }
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
      const bl = Math.max(90, 0.299 * sm(bg.r, x, y) + 0.587 * sm(bg.g, x, y) + 0.114 * sm(bg.b, x, y));
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

export function applyFilter(img, id) {
  switch (id) {
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
