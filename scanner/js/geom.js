// Hình học phẳng: sắp xếp góc, phép biến đổi phối cảnh (homography), nắn phẳng bằng nội suy song tuyến.
// Thuần JS, không phụ thuộc DOM — chạy được cả trong Node để kiểm thử.

/** Sắp xếp 4 điểm theo thứ tự: trên-trái, trên-phải, dưới-phải, dưới-trái (hệ tọa độ màn hình, y hướng xuống). */
export function orderCorners(pts) {
  if (!pts || pts.length !== 4) throw new Error('Cần đúng 4 điểm');
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  // Sắp theo góc quanh tâm: atan2 tăng dần = chiều kim đồng hồ trên màn hình
  const sorted = pts
    .map((p) => ({ x: p.x, y: p.y, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((p, q) => p.a - q.a);
  // Bắt đầu từ điểm có x+y nhỏ nhất (trên-trái)
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = sorted[i].x + sorted[i].y;
    if (s < best) { best = s; start = i; }
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = sorted[(start + i) % 4];
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Giải hệ phương trình tuyến tính n×n bằng khử Gauss có chọn trụ. A là mảng các hàng. */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.slice().concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) throw new Error('Hệ suy biến');
    if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t; }
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Ma trận homography 3×3 (mảng 9 phần tử, hàng trước) ánh xạ 4 điểm src -> 4 điểm dst. */
export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solveLinear(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function polygonArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Tứ giác lồi (mọi tích có hướng cùng dấu) và không suy biến. */
export function isConvexQuad(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-9) return false;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/** Kích thước ảnh sau khi nắn phẳng: lấy cạnh dài hơn của mỗi cặp cạnh đối. */
export function quadSize(q) {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  return { w, h };
}

/** Thu nhỏ kích thước để cạnh dài không vượt maxEdge (không phóng to). */
export function fitEdge(w, h, maxEdge) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * Nắn phẳng: lấy tứ giác quad (4 góc đã sắp TL,TR,BR,BL, tọa độ điểm ảnh của src)
 * thành ảnh chữ nhật outW×outH. src = {data: RGBA, width, height}. Trả về Uint8ClampedArray RGBA.
 */
export function warpPerspective(src, quad, outW, outH) {
  const dstRect = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
  // ánh xạ ngược: điểm ảnh đích -> điểm ảnh nguồn
  const H = homography(dstRect, quad);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const sd = src.data, sw = src.width, sh = src.height;
  const maxX = sw - 1, maxY = sh - 1;
  let o = 0;
  for (let y = 0; y < outH; y++) {
    const py = y + 0.5;
    // phần không phụ thuộc x của tử và mẫu
    const nx0 = H[1] * py + H[2], ny0 = H[4] * py + H[5], w0 = H[7] * py + H[8];
    for (let x = 0; x < outW; x++, o += 4) {
      const px = x + 0.5;
      const w = H[6] * px + w0;
      let sx = (H[0] * px + nx0) / w - 0.5;
      let sy = (H[3] * px + ny0) / w - 0.5;
      if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0, y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      out[o] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      out[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      out[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Xoay RGBA theo bội số 90 độ (cùng chiều kim đồng hồ). Trả về {data,width,height}. */
export function rotateRGBA(img, deg) {
  const d = ((deg % 360) + 360) % 360;
  const { width: w, height: h, data } = img;
  if (d === 0) return img;
  if (d === 180) {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0, n = w * h; i < n; i++) {
      const j = (n - 1 - i) * 4;
      out[j] = data[i * 4]; out[j + 1] = data[i * 4 + 1]; out[j + 2] = data[i * 4 + 2]; out[j + 3] = data[i * 4 + 3];
    }
    return { data: out, width: w, height: h };
  }
  const out = new Uint8ClampedArray(data.length);
  const nw = h, nh = w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = d === 90 ? h - 1 - y : y;
      const ny = d === 90 ? x : w - 1 - x;
      const s = (y * w + x) * 4, t = (ny * nw + nx) * 4;
      out[t] = data[s]; out[t + 1] = data[s + 1]; out[t + 2] = data[s + 2]; out[t + 3] = data[s + 3];
    }
  }
  return { data: out, width: nw, height: nh };
}

/** Chuẩn hóa góc (0..1 theo kích thước ảnh) sang điểm ảnh và ngược lại. */
export function toPixels(corners, w, h) { return corners.map((c) => ({ x: c.x * w, y: c.y * h })); }
export function toNormalized(corners, w, h) { return corners.map((c) => ({ x: c.x / w, y: c.y / h })); }
export function defaultCorners(inset = 0.04) {
  return [{ x: inset, y: inset }, { x: 1 - inset, y: inset }, { x: 1 - inset, y: 1 - inset }, { x: inset, y: 1 - inset }];
}

/**
 * Xoay vị trí các chữ ký theo trang khi xoay kết quả deg (90 = cùng chiều kim đồng hồ, 270 = ngược lại).
 * signs: {cx,cy,w} chuẩn hóa (w theo chiều rộng); aspect = rộng/cao của trang TRƯỚC khi xoay.
 */
export function rotateSigns(signs, deg, aspect) {
  const d = ((deg % 360) + 360) % 360;
  return (signs || []).map((s) => {
    if (d === 90) return { ...s, cx: 1 - s.cy, cy: s.cx, w: Math.min(0.95, s.w * aspect) };
    if (d === 270) return { ...s, cx: s.cy, cy: 1 - s.cx, w: Math.min(0.95, s.w * aspect) };
    if (d === 180) return { ...s, cx: 1 - s.cx, cy: 1 - s.cy };
    return { ...s };
  });
}
