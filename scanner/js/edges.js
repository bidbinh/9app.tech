// Tự nhận khung tài liệu trong ảnh chụp. Thuật toán nhẹ, tự viết (không dùng opencv):
//  1) thu nhỏ ảnh về ~400px,
//  2) tạo mặt nạ "tờ giấy" theo ba cách: sáng hơn nền (Otsu), khác màu nền (nền lấy từ viền ảnh), tối hơn nền,
//  3) làm sạch, lấp lỗ, chọn thành phần liên thông tốt nhất,
//  4) bao lồi -> rút về tứ giác bao nhỏ nhất,
//  5) chấm điểm theo độ lấp đầy; điểm thấp nghĩa là không chắc (giao diện sẽ báo cho người dùng chỉnh tay).
import { orderCorners, polygonArea, isConvexQuad } from './geom.js';
import { houghQuad } from './lines.js';

const DETECT_EDGE = 400;

function downscale(img, maxEdge) {
  const { width: W, height: H, data } = img;
  const f = Math.max(1, Math.round(Math.max(W, H) / maxEdge));
  const w = Math.max(1, Math.floor(W / f)), h = Math.max(1, Math.floor(H / f));
  const r = new Float32Array(w * h), g = new Float32Array(w * h), b = new Float32Array(w * h);
  const area = f * f;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let yy = 0; yy < f; yy++) {
        let idx = ((y * f + yy) * W + x * f) * 4;
        for (let xx = 0; xx < f; xx++, idx += 4) { sr += data[idx]; sg += data[idx + 1]; sb += data[idx + 2]; }
      }
      const o = y * w + x;
      r[o] = sr / area; g[o] = sg / area; b[o] = sb / area;
    }
  }
  return { w, h, f, r, g, b };
}

export function boxBlur(src, w, h, rad) {
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

export function otsu(values, bins = 128) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < values.length; i++) { const v = values[i]; if (v < min) min = v; if (v > max) max = v; }
  if (!(max > min)) return min;
  const hist = new Float64Array(bins);
  const k = (bins - 1) / (max - min);
  for (let i = 0; i < values.length; i++) hist[((values[i] - min) * k) | 0]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, bestVar = -1, bestT = 0;
  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; bestT = t; }
  }
  return min + (bestT + 0.5) / k;
}

function median(arr) {
  const a = Array.from(arr).sort((x, y) => x - y);
  return a[a.length >> 1];
}

// Lọc đa số 3x3 (làm mịn mặt nạ nhị phân), lặp iter lần.
function majority(mask, w, h, iter) {
  let cur = mask;
  for (let it = 0; it < iter; it++) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c = 0;
        for (let yy = -1; yy <= 1; yy++) {
          const Y = Math.min(h - 1, Math.max(0, y + yy));
          for (let xx = -1; xx <= 1; xx++) c += cur[Y * w + Math.min(w - 1, Math.max(0, x + xx))];
        }
        out[y * w + x] = c >= 5 ? 1 : 0;
      }
    }
    cur = out;
  }
  return cur;
}

// Lấp lỗ: các vùng 0 không thông với biên ảnh trở thành 1.
function fillHoles(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const i = y * w + x; if (!seen[i] && mask[i] === 0) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || !seen[i] ? 1 : 0;
  return out;
}

// Gán nhãn thành phần liên thông (4 láng giềng). Trả về danh sách {area, pixels}.
function components(mask, w, h, minArea) {
  const label = new Int32Array(w * h);
  const list = [];
  const stack = [];
  let next = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    const id = ++next;
    const px = [];
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      px.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !label[i - w]) { label[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !label[i + w]) { label[i + w] = id; stack.push(i + w); }
    }
    if (px.length >= minArea) list.push({ area: px.length, pixels: px });
  }
  return list;
}

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const uniq = [];
  for (const p of pts) if (!uniq.length || uniq[uniq.length - 1].x !== p.x || uniq[uniq.length - 1].y !== p.y) uniq.push(p);
  if (uniq.length < 3) return uniq;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function lineIntersect(a, b, c, d) {
  const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y, x3 = c.x, y3 = c.y, x4 = d.x, y4 = d.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
  const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  return { x: px, y: py };
}

/** Rút bao lồi về k đỉnh bằng cách bỏ dần cạnh làm tăng ít diện tích nhất (đa giác bao). */
export function reduceHull(hull, k = 4) {
  let P = hull.slice();
  while (P.length > k) {
    const n = P.length;
    let bi = -1, bArea = Infinity, bPt = null;
    for (let i = 0; i < n; i++) {
      const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
      const X = lineIntersect(a, b, d, c);
      if (!X) continue;
      // X phải nằm kéo dài ra khỏi b theo hướng a->b và khỏi c theo hướng d->c
      if ((X.x - b.x) * (b.x - a.x) + (X.y - b.y) * (b.y - a.y) <= 0) continue;
      if ((X.x - c.x) * (c.x - d.x) + (X.y - c.y) * (c.y - d.y) <= 0) continue;
      const area = Math.abs((b.x - X.x) * (c.y - X.y) - (c.x - X.x) * (b.y - X.y)) / 2;
      if (area < bArea) { bArea = area; bi = i; bPt = X; }
    }
    if (bi < 0) {
      // Không còn cạnh nào kéo dài hợp lệ: bỏ đỉnh làm mất ít diện tích nhất
      let bj = 0, bt = Infinity;
      for (let i = 0; i < n; i++) {
        const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
        const t = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
        if (t < bt) { bt = t; bj = i; }
      }
      P.splice(bj, 1);
      continue;
    }
    const j = (bi + 1) % n;
    const next = [];
    for (let i = 0; i < n; i++) {
      if (i === bi) next.push(bPt);
      else if (i === j) continue;
      else next.push(P[i]);
    }
    P = next;
  }
  return P;
}

function anglesOK(q) {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (ang < 45 || ang > 135) return false;
  }
  return true;
}

// Độ tương phản dọc bốn cạnh tứ giác: so màu ngay trong và ngay ngoài cạnh. Cạnh nằm sát mép ảnh được coi là trung tính.
function edgeContrast(quad, feat, w, h) {
  const cx = quad.reduce((a, p) => a + p.x, 0) / 4, cy = quad.reduce((a, p) => a + p.y, 0) / 4;
  let minSide = 1;
  for (let i = 0; i < 4; i++) {
    const p = quad[i], q = quad[(i + 1) % 4];
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
    const diffs = [];
    for (let k = 1; k <= 20; k++) {
      const t = 0.05 + (0.9 * k) / 21;
      const x = p.x + dx * t, y = p.y + dy * t;
      const ax = Math.round(x + nx * 3), ay = Math.round(y + ny * 3), bx = Math.round(x - nx * 3), by = Math.round(y - ny * 3);
      if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= w || bx >= w || ay >= h || by >= h) continue;
      const ia = ay * w + ax, ib = by * w + bx;
      diffs.push(Math.hypot(feat.r[ia] - feat.r[ib], feat.g[ia] - feat.g[ib], feat.b[ia] - feat.b[ib]));
    }
    if (diffs.length < 6) continue;
    diffs.sort((a, b) => a - b);
    minSide = Math.min(minSide, diffs[diffs.length >> 1] / 14);
  }
  return Math.min(1, minSide);
}

function evaluateMask(mask, w, h, feat) {
  const filled = fillHoles(majority(mask, w, h, 2), w, h);
  const comps = components(filled, w, h, Math.round(w * h * 0.06));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : filled[y * w + x]);
  let best = null;
  for (const c of comps) {
    const pts = [];
    const edgeHit = [false, false, false, false];
    for (const i of c.pixels) {
      const x = i % w, y = (i / w) | 0;
      if (x === 0) edgeHit[0] = true;
      if (x === w - 1) edgeHit[1] = true;
      if (y === 0) edgeHit[2] = true;
      if (y === h - 1) edgeHit[3] = true;
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) {
        pts.push({ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
      }
    }
    const touch = edgeHit.filter(Boolean).length;
    const areaFrac = c.area / (w * h);
    if (areaFrac > 0.96) continue; // cả khung hình: gần như chắc chắn là nền
    if (touch >= 4 && areaFrac > 0.85) continue;
    const hull = convexHull(pts);
    if (hull.length < 4) continue;
    const quad = reduceHull(hull, 4);
    if (quad.length !== 4) continue;
    const ordered = orderCorners(quad);
    const qa = polygonArea(ordered);
    if (qa <= 0) continue;
    const fill = Math.min(1, c.area / qa);
    let score = fill * fill * (0.55 + 0.45 * Math.min(1, areaFrac / 0.3));
    if (!isConvexQuad(ordered) || !anglesOK(ordered)) score *= 0.4;
    if (touch >= 3) score *= 0.8;
    // tứ giác ôm gần hết khung hình: nhiều khả năng là cả nền, không phải tờ giấy
    const m2 = Math.min(w, h) * 0.03;
    if (ordered.every((p) => p.x < m2 || p.y < m2 || p.x > w - m2 || p.y > h - m2) && areaFrac > 0.8) score *= 0.5;
    score *= 0.35 + 0.65 * edgeContrast(ordered, feat, w, h);
    if (!best || score > best.score) best = { score, quad: ordered, areaFrac, fill };
  }
  return best;
}

// Tinh chỉnh từng cạnh: mép giấy bị bóng đổ thường tối gần bằng nền nên mặt nạ cắt lẹm vào trong.
// Thử dịch cạnh ra ngoài tới 8% và giữ vị trí có biên màu mạnh nhất (trung vị dọc cạnh, nên chữ và vân bàn không đánh lừa).
const SLOPE_REFINE = false; // thử khớp độ nghiêng từng cạnh: chưa cải thiện ổn định trên ảnh thử, để tắt
function refineQuad(quad, feat, w, h) {
  const cx = quad.reduce((a, p) => a + p.x, 0) / 4, cy = quad.reduce((a, p) => a + p.y, 0) / 4;
  const maxOutNear = Math.min(w, h) * 0.08, maxOutFar = Math.min(w, h) * 0.16;
  const px = (arr, x, y) => arr[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const p = quad[i], r = quad[(i + 1) % 4];
    const dx = r.x - p.x, dy = r.y - p.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (((p.x + r.x) / 2 - cx) * nx + ((p.y + r.y) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
    // độ mạnh biên tại độ lệch d (điểm ảnh, dương = ra ngoài) trên đoạn t0..t1 của cạnh (trung vị nên chữ/vân bàn không đánh lừa)
    const strength = (d, t0 = 0.12, t1 = 0.88, N0 = 0) => {
      const N = N0 || Math.max(12, Math.min(60, Math.round(len * (t1 - t0) / 3.5)));
      const vals = [];
      let skipped = 0;
      for (let k = 0; k < N; k++) {
        const t = t0 + ((t1 - t0) * k) / (N - 1);
        const bx = p.x + dx * t + nx * d, by = p.y + dy * t + ny * d;
        const ix = bx - nx * 2.5, iy = by - ny * 2.5, ox = bx + nx * 2.5, oy = by + ny * 2.5;
        if (ox < 0 || oy < 0 || ox > w - 1 || oy > h - 1 || ix < 0 || iy < 0 || ix > w - 1 || iy > h - 1) { skipped++; continue; }
        vals.push(Math.hypot(px(feat.r, ix, iy) - px(feat.r, ox, oy), px(feat.g, ix, iy) - px(feat.g, ox, oy), px(feat.b, ix, iy) - px(feat.b, ox, oy)));
      }
      if (skipped > N * 0.4 || vals.length < 5) return -1;
      vals.sort((a, b) => a - b);
      return vals[vals.length >> 1];
    };
    const s0 = strength(0);
    let bestD = 0, bestS = s0;
    if (s0 >= 0) {
      const maxOut = s0 < 22 ? maxOutFar : maxOutNear; // đang ở chỗ phẳng: tìm xa hơn
      for (let d = 1; d <= maxOut; d++) {
        const s = strength(d) - 0.1 * d;
        if (s > bestS) { bestS = s; bestD = d; }
      }
    }
    const moved = bestD > 0 && bestS >= Math.max(16, 1.25 * Math.max(s0, 1));
    const d0 = moved ? bestD : 0;
    const edgeS = moved ? bestS : s0;
    // sửa độ nghiêng của cạnh: tìm vị trí biên tốt nhất theo từng đoạn rồi khớp đường thẳng (mặt nạ thường cho cạnh hơi lệch góc)
    let slope = 0, off = d0;
    if (SLOPE_REFINE && moved && edgeS >= 30) {
      const pts = [];
      const SEG = 6;
      for (let sgi = 0; sgi < SEG; sgi++) {
        const t0 = 0.1 + (0.8 * sgi) / SEG, t1 = 0.1 + (0.8 * (sgi + 1)) / SEG;
        let bd = d0, bs = -1;
        for (let d = d0 - 10; d <= d0 + 10; d++) { const s2 = strength(d, t0, t1, 10) - 0.15 * Math.abs(d - d0); if (s2 > bs) { bs = s2; bd = d; } }
        if (bs >= 0.5 * edgeS) pts.push({ t: (t0 + t1) / 2, d: bd });
      }
      if (pts.length >= 4) {
        const n = pts.length; let st = 0, sd = 0, stt = 0, std = 0;
        for (const q of pts) { st += q.t; sd += q.d; stt += q.t * q.t; std += q.t * q.d; }
        const den = n * stt - st * st;
        if (den > 1e-9) { slope = (n * std - st * sd) / den; off = (sd - slope * st) / n; }
        // giới hạn: không dịch quá xa so với kết quả ban đầu
        if (Math.abs(slope) > len * 0.12) { slope = 0; off = d0; }
      }
    }
    // đường mới: tại t, độ lệch = off + slope * (t - 0.5)
    const dA = off + slope * (0 - 0.5), dB = off + slope * (1 - 0.5);
    lines.push({ ax: p.x + nx * dA, ay: p.y + ny * dA, bx: r.x + nx * dB, by: r.y + ny * dB, changed: Math.abs(dA) > 0.01 || Math.abs(dB) > 0.01 });
  }
  if (!lines.some((l) => l.changed)) return quad;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = lines[(i + 3) % 4], b = lines[i];
    const adx = a.bx - a.ax, ady = a.by - a.ay, bdx = b.bx - b.ax, bdy = b.by - b.ay;
    const den = adx * bdy - ady * bdx;
    if (Math.abs(den) < 1e-6) return quad;
    const t = ((b.ax - a.ax) * bdy - (b.ay - a.ay) * bdx) / den;
    out.push({ x: a.ax + adx * t, y: a.ay + ady * t });
  }
  if (!isConvexQuad(out) || out.some((p) => p.x < -w * 0.02 || p.y < -h * 0.02 || p.x > w * 1.02 || p.y > h * 1.02)) return quad;
  return out;
}

// Mở rộng cạnh khi ngay ngoài cạnh vẫn là giấy (cùng sắc độ và còn đủ sáng): bóng đổ làm mặt nạ cắt lẹm vào trong giấy.
// Mỗi cạnh chia 3 đoạn, mỗi đoạn tự đẩy ra ngoài tới khi gặp màu khác giấy rồi khớp đường thẳng (nên cả độ nghiêng cũng được sửa).
// Không chạy trên cạnh có nền bàn cùng màu giấy (bàn trắng): kiểm bằng vùng xa hơn ngoài cạnh.
function growQuad(quad, feat, w, h) {
  const cx = quad.reduce((a, p) => a + p.x, 0) / 4, cy = quad.reduce((a, p) => a + p.y, 0) / 4;
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) { const p = quad[i], q = quad[(i + 1) % 4]; const c = (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x); if (c !== 0) { const sg = c > 0 ? 1 : -1; if (sign && sg !== sign) return false; sign = sg; } }
    return true;
  };
  const cbOf = (r, g, b) => 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, crOf = (r, g, b) => 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  // màu giấy tham chiếu từ phần sáng trong tứ giác
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  const lums = [], cbs = [], crs = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(h, Math.ceil(Math.max(...ys))); y += 2) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(w, Math.ceil(Math.max(...xs))); x += 2) {
    if (!inside(x, y)) continue;
    const i = y * w + x; const l = 0.299 * feat.r[i] + 0.587 * feat.g[i] + 0.114 * feat.b[i];
    lums.push(l); cbs.push(cbOf(feat.r[i], feat.g[i], feat.b[i])); crs.push(crOf(feat.r[i], feat.g[i], feat.b[i]));
  }
  if (lums.length < 200) return quad;
  const sl = Float32Array.from(lums).sort(), lHi = sl[Math.floor(sl.length * 0.85)];
  const sel = []; for (let i = 0; i < lums.length; i++) if (lums[i] >= lHi * 0.8) sel.push(i);
  const med = (a) => { const t = a.slice().sort((x, y) => x - y); return t[t.length >> 1]; };
  const refCb = med(sel.map((i) => cbs[i])), refCr = med(sel.map((i) => crs[i]));
  const paperLike = (x, y) => {
    if (x < 1 || y < 1 || x > w - 2 || y > h - 2) return null; // ngoài khung ảnh
    const i = Math.round(y) * w + Math.round(x);
    const r = feat.r[i], g = feat.g[i], b = feat.b[i], l = 0.299 * r + 0.587 * g + 0.114 * b;
    return Math.abs(cbOf(r, g, b) - refCb) <= 9 && Math.abs(crOf(r, g, b) - refCr) <= 9 && l >= lHi * 0.42;
  };
  const maxGrow = Math.round(Math.min(w, h) * 0.07);
  const lines = [];
  let any = false;
  for (let i = 0; i < 4; i++) {
    const p = quad[i], r = quad[(i + 1) % 4];
    const dx = r.x - p.x, dy = r.y - p.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (((p.x + r.x) / 2 - cx) * nx + ((p.y + r.y) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const lumAt = (x, y) => { const j = Math.round(y) * w + Math.round(x); return 0.299 * feat.r[j] + 0.587 * feat.g[j] + 0.114 * feat.b[j]; };
    const frac = (t0, t1, d) => {
      let hit = 0, tot = 0;
      for (let k = 0; k < 12; k++) {
        const t = t0 + ((t1 - t0) * k) / 11;
        const x = p.x + dx * t + nx * d, y = p.y + dy * t + ny * d;
        const v = paperLike(x, y);
        if (v === null) continue;
        tot++;
        // bóng đổ trên giấy đổi sáng từ từ; mép giấy/bàn thì nhảy bậc: có bậc thì không phải giấy tiếp diễn
        const xb = x - nx * 3, yb = y - ny * 3;
        if (v && xb > 1 && yb > 1 && xb < w - 2 && yb < h - 2 && Math.abs(lumAt(x, y) - lumAt(xb, yb)) <= 0.06 * lHi) hit++;
      }
      return tot >= 6 ? hit / tot : -1;
    };
    // bàn cùng màu giấy? kiểm vùng xa hơn một chút ngoài cạnh
    const far = frac(0.1, 0.9, maxGrow + 6);
    const wins = [[0.06, 0.34], [0.34, 0.66], [0.66, 0.94]];
    const pts = [];
    for (const [t0, t1] of wins) {
      let d = 0;
      while (d < maxGrow && frac(t0, t1, d + 2) >= 0.72) d++;
      pts.push({ t: (t0 + t1) / 2, d });
    }
    const deskLikePaper = far >= 0.5;
    if (deskLikePaper || pts.every((q) => q.d === 0)) { lines.push({ ax: p.x, ay: p.y, bx: r.x, by: r.y, changed: false }); continue; }
    // khớp đường thẳng d = a + b t; không thu vào trong
    const n = pts.length; let st = 0, sd = 0, stt = 0, std = 0;
    for (const q of pts) { st += q.t; sd += q.d; stt += q.t * q.t; std += q.t * q.d; }
    const den = n * stt - st * st;
    const slope = (n * std - st * sd) / den, off = (sd - slope * st) / n;
    const dA = Math.max(0, off), dB = Math.max(0, off + slope);
    lines.push({ ax: p.x + nx * dA, ay: p.y + ny * dA, bx: r.x + nx * dB, by: r.y + ny * dB, changed: dA > 0.5 || dB > 0.5 });
    if (dA > 0.5 || dB > 0.5) any = true;
  }
  if (!any) return quad;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = lines[(i + 3) % 4], b = lines[i];
    const adx = a.bx - a.ax, ady = a.by - a.ay, bdx = b.bx - b.ax, bdy = b.by - b.ay;
    const den = adx * bdy - ady * bdx;
    if (Math.abs(den) < 1e-6) return quad;
    const t = ((b.ax - a.ax) * bdy - (b.ay - a.ay) * bdx) / den;
    out.push({ x: a.ax + adx * t, y: a.ay + ady * t });
  }
  if (!isConvexQuad(out) || out.some((p) => p.x < -w * 0.02 || p.y < -h * 0.02 || p.x > w * 1.02 || p.y > h * 1.02)) return quad;
  return out;
}

/**
 * Nhận khung tài liệu. img = {data: RGBA, width, height}.
 * Trả về { corners: [TL,TR,BR,BL] tọa độ điểm ảnh của img, score 0..1, found: boolean, method }.
 */
export function detectDocument(img, opts = {}) {
  const maxEdge = opts.maxEdge || DETECT_EDGE;
  const s = downscale(img, maxEdge);
  const { w, h } = s;
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * s.r[i] + 0.587 * s.g[i] + 0.114 * s.b[i];
  const blur = boxBlur(lum, w, h, 1);
  const br = boxBlur(s.r, w, h, 1), bg = boxBlur(s.g, w, h, 1), bb = boxBlur(s.b, w, h, 1);

  const candidates = [];
  // A: sáng hơn nền
  const t = otsu(blur);
  const maskA = new Uint8Array(n);
  for (let i = 0; i < n; i++) maskA[i] = blur[i] > t ? 1 : 0;
  candidates.push(['sáng', maskA]);

  // B: khác màu nền (nền ước lượng = trung vị dải viền ảnh)
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const rr = [], gg = [], bl = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < band || y < band || x >= w - band || y >= h - band) { const i = y * w + x; rr.push(br[i]); gg.push(bg[i]); bl.push(bb[i]); }
    }
  }
  const mr = median(rr), mg = median(gg), mb = median(bl);
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = Math.hypot(br[i] - mr, bg[i] - mg, bb[i] - mb);
  const td = otsu(dist);
  const maskB = new Uint8Array(n);
  for (let i = 0; i < n; i++) maskB[i] = dist[i] > td ? 1 : 0;
  candidates.push(['màu', maskB]);

  // A hoặc B: giấy có vùng bóng đổ tối vẫn khác màu nền
  const maskU = new Uint8Array(n);
  for (let i = 0; i < n; i++) maskU[i] = maskA[i] | maskB[i];
  candidates.push(['sáng+màu', maskU]);

  // C: tối hơn nền (giấy sẫm trên nền sáng)
  const maskC = new Uint8Array(n);
  for (let i = 0; i < n; i++) maskC[i] = blur[i] <= t ? 1 : 0;
  candidates.push(['tối', maskC]);

  let best = null;
  const consider = (name, mask) => {
    const r = evaluateMask(mask, w, h, { r: br, g: bg, b: bb });
    if (r && (!best || r.score > best.score)) best = { ...r, method: name };
  };
  for (const [name, mask] of candidates) consider(name, mask);
  // Nền sáng gần bằng giấy (bàn trắng): quét thêm các ngưỡng sáng khác quanh ngưỡng Otsu
  if (!best || best.score < 0.7) {
    for (const dt of [-24, -12, 12, 24, 36, 48]) {
      const m = new Uint8Array(n);
      for (let i = 0; i < n; i++) m[i] = blur[i] > t + dt ? 1 : 0;
      consider('ngưỡng', m);
    }
  }
  // Bổ sung: dò theo cạnh (Hough). Dùng khi cách dò mặt nạ yếu, hoặc khi cạnh dò được ôm trọn hơn (bóng đổ che mép giấy).
  let hq = null;
  if (!opts.noHough) { try { hq = houghQuad(br, bg, bb, w, h); } catch (e) { hq = null; } }
  if (hq && hq.score >= 0.6 && (!best || best.score < 0.7)) {
    best = { score: hq.score, quad: orderCorners(hq.quad), areaFrac: hq.areaFrac, method: 'cạnh', fromHough: true };
  }
  const W = img.width, H = img.height;
  if (!best || best.score < 0.45) {
    const m = 0.05;
    return {
      corners: [{ x: W * m, y: H * m }, { x: W * (1 - m), y: H * m }, { x: W * (1 - m), y: H * (1 - m) }, { x: W * m, y: H * (1 - m) }],
      score: best ? best.score : 0, found: false, method: 'mặc định',
    };
  }
  const k = s.f;
  // Thu vào trong khoảng 1,5 điểm ảnh (ở độ phân giải nhận dạng) để không lẫn viền nền ở mép giấy
  if (!best.fromHough && !opts.noRefine) { const feat = { r: br, g: bg, b: bb }; const q1 = refineQuad(orderCorners(best.quad), feat, w, h); best = { ...best, quad: opts.noGrow ? q1 : growQuad(q1, feat, w, h) }; }
  const cx = best.quad.reduce((a, p) => a + p.x, 0) / 4, cy = best.quad.reduce((a, p) => a + p.y, 0) / 4;
  const inset = 4;
  const corners = best.quad.map((p) => {
    const dx = cx - p.x, dy = cy - p.y, len = Math.hypot(dx, dy) || 1;
    const q = { x: p.x + (dx / len) * inset, y: p.y + (dy / len) * inset };
    return { x: Math.min(W - 1, Math.max(0, q.x * k)), y: Math.min(H - 1, Math.max(0, q.y * k)) };
  });
  // Kết quả theo cạnh kém chắc hơn: vẫn dùng làm khung gợi ý ban đầu nhưng chỉ báo "đã nhận" khi rất chắc
  return { corners, score: best.score, found: best.score >= (best.fromHough ? 0.86 : 0.7), method: best.method };
}
