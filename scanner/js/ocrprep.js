// Chuẩn bị ảnh cho OCR: xóa đường kẻ bảng dài (ngang/dọc) để Tesseract không đọc đường kẻ thành rác,
// đồng thời trả về vị trí các đường kẻ để dựng bảng chính xác hơn. Thuần JS, làm việc trên {data: RGBA, width, height}.

function darkMask(img) {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const lum = new Uint8Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { const l = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8; lum[i] = l; sum += l; }
  // ngưỡng: giữa độ sáng nền (phân vị cao) và mực; ảnh đã khử bóng nên nền gần 250
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i += 3) hist[lum[i]]++;
  let acc = 0, p90 = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= (n / 3) * 0.9) { p90 = v; break; } }
  const thr = Math.max(60, Math.min(170, p90 * 0.62));
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = lum[i] < thr ? 1 : 0;
  void sum;
  return m;
}

/** Tìm các đoạn thẳng dài. dir: 'h' | 'v'. Cho phép lệch 1 điểm ảnh (đường hơi nghiêng). */
function findRuns(m, w, h, dir, minLen) {
  const runs = [];
  const A = dir === 'h' ? h : w, B = dir === 'h' ? w : h;
  const at = (a, b) => (dir === 'h' ? m[a * w + b] : m[b * w + a]);
  for (let a = 0; a < A; a++) {
    let start = -1, gap = 0;
    for (let b = 0; b <= B; b++) {
      const on = b < B && (at(a, b) || (a > 0 && at(a - 1, b)) || (a < A - 1 && at(a + 1, b)));
      if (on) { if (start < 0) start = b; gap = 0; } else if (start >= 0) {
        gap++;
        if (gap > 2 || b === B) { const end = b - gap; if (end - start + 1 >= minLen) runs.push({ a, b0: start, b1: end }); start = -1; gap = 0; }
      }
    }
  }
  return runs;
}

/** Gộp các hàng liền nhau của cùng một đường kẻ thành một đường (độ dày > 1). */
function mergeRuns(runs) {
  const lines = [];
  for (const r of runs) {
    const l = lines.find((x) => r.a - x.a1 <= 1 && Math.min(r.b1, x.b1) - Math.max(r.b0, x.b0) > 0.6 * Math.min(r.b1 - r.b0, x.b1 - x.b0));
    if (l) { l.a1 = r.a; l.b0 = Math.min(l.b0, r.b0); l.b1 = Math.max(l.b1, r.b1); } else lines.push({ a0: r.a, a1: r.a, b0: r.b0, b1: r.b1 });
  }
  return lines.filter((l) => l.a1 - l.a0 < 8); // đường kẻ mảnh; khối đặc dày không phải đường kẻ
}

/**
 * Xóa đường kẻ dài khỏi ảnh (tô trắng). Trả về { hLines: [{y, x0, x1}], vLines: [{x, y0, y1}] } theo điểm ảnh.
 * Chữ bị đường kẻ cắt qua vẫn đọc được vì chỉ xóa phần đường kẻ dày ≤ vài điểm ảnh.
 */
export function removeRuling(img) {
  const { width: w, height: h, data } = img;
  const m = darkMask(img);
  const hRuns = findRuns(m, w, h, 'h', Math.max(48, Math.round(w * 0.05)));
  const vRuns = findRuns(m, w, h, 'v', Math.max(40, Math.round(h * 0.022)));
  const hl = mergeRuns(hRuns), vl = mergeRuns(vRuns);
  const paint = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4; data[o] = data[o + 1] = data[o + 2] = 255; };
  for (const l of hl) for (let y = l.a0 - 1; y <= l.a1 + 1; y++) for (let x = l.b0; x <= l.b1; x++) paint(x, y);
  for (const l of vl) for (let x = l.a0 - 1; x <= l.a1 + 1; x++) for (let y = l.b0; y <= l.b1; y++) paint(x, y);
  return {
    hLines: hl.map((l) => ({ y: (l.a0 + l.a1) / 2, x0: l.b0, x1: l.b1 })),
    vLines: vl.map((l) => ({ x: (l.a0 + l.a1) / 2, y0: l.b0, y1: l.b1 })),
  };
}
