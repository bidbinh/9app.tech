// Dò khung tài liệu theo cạnh (biến đổi Hough): tìm các đường thẳng dài rồi chọn bộ 4 đường tạo tứ giác "giống tờ giấy" nhất.
// Bổ sung cho cách dò theo mặt nạ màu (edges.js): hoạt động tốt khi giấy trắng đặt trên bàn sáng, hoặc có vùng bóng đổ che mép giấy.
// Thuần JS trên các mảng r,g,b (Float32) kích thước w x h.
import { orderCorners, polygonArea, isConvexQuad } from './geom.js';

/** Biên độ và hướng gradient (Sobel) lấy từ kênh có độ biến thiên mạnh nhất tại mỗi điểm. */
function gradient(r, g, b, w, h) {
  const mag = new Float32Array(w * h), ang = new Float32Array(w * h);
  const chans = [r, g, b];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let bm = 0, ba = 0;
      for (let c = 0; c < 3; c++) {
        const a = chans[c];
        const i = y * w + x;
        const gx = (a[i - w + 1] + 2 * a[i + 1] + a[i + w + 1]) - (a[i - w - 1] + 2 * a[i - 1] + a[i + w - 1]);
        const gy = (a[i + w - 1] + 2 * a[i + w] + a[i + w + 1]) - (a[i - w - 1] + 2 * a[i - w] + a[i - w + 1]);
        const m = Math.hypot(gx, gy);
        if (m > bm) { bm = m; ba = Math.atan2(gy, gx); }
      }
      mag[y * w + x] = bm / 4; ang[y * w + x] = ba;
    }
  }
  return { mag, ang };
}

function intersect(l1, l2) {
  // đường: x cosθ + y sinθ = ρ
  const c1 = Math.cos(l1.t), s1 = Math.sin(l1.t), c2 = Math.cos(l2.t), s2 = Math.sin(l2.t);
  const det = c1 * s2 - c2 * s1;
  if (Math.abs(det) < 1e-3) return null;
  return { x: (l1.rho * s2 - l2.rho * s1) / det, y: (c1 * l2.rho - c2 * l1.rho) / det };
}

const angDiff = (a, b) => { let d = Math.abs(a - b) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; return d; };

function findLines(mag, ang, w, h, maxLines = 40) {
  const sorted = Float32Array.from(mag).sort();
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;
  const thr = Math.max(7, p99 * 0.12);
  const NT = 180, diag = Math.hypot(w, h), NR = Math.ceil(diag * 2) + 3, off = Math.ceil(diag) + 1;
  const acc = new Float32Array(NT * NR);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const m = mag[y * w + x];
      if (m < thr) continue;
      let t = ang[y * w + x];
      if (t < 0) t += Math.PI; if (t >= Math.PI) t -= Math.PI;
      const tb = Math.round((t / Math.PI) * NT) % NT;
      for (let dt = -2; dt <= 2; dt++) {
        const bin = (tb + dt + NT) % NT;
        const th = (bin / NT) * Math.PI;
        const rho = x * Math.cos(th) + y * Math.sin(th);
        acc[bin * NR + Math.round(rho) + off] += m * (dt === 0 ? 1 : 0.6);
      }
    }
  }
  // cực đại cục bộ
  const peaks = [];
  for (let t = 0; t < NT; t++) {
    for (let r = 2; r < NR - 2; r++) {
      const v = acc[t * NR + r];
      if (v < p99 * 4) continue;
      let ok = true;
      for (let dt = -2; dt <= 2 && ok; dt++) for (let dr = -3; dr <= 3; dr++) {
        if (!dt && !dr) continue;
        const tt = (t + dt + NT) % NT;
        // góc quay vòng làm ρ đổi dấu; bỏ qua biên để đơn giản
        if (t + dt < 0 || t + dt >= NT) continue;
        if (acc[tt * NR + r + dr] > v) { ok = false; break; }
      }
      if (ok) peaks.push({ t: (t / NT) * Math.PI, rho: r - off, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const out = [];
  for (const p of peaks) {
    if (out.some((q) => angDiff(q.t, p.t) < (7 * Math.PI) / 180 && Math.abs(q.rho - p.rho) < Math.max(8, diag * 0.025) && Math.sign(Math.cos(q.t - p.t)) > 0)) continue;
    out.push(p);
    if (out.length >= maxLines) break;
  }
  return { lines: out, thr };
}

// Tỉ lệ điểm dọc theo một cạnh có biên cùng hướng pháp tuyến của cạnh
function sideSupport(p, q, mag, ang, w, h, thr) {
  const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
  if (len < 8) return 0;
  const nx = -dy / len, ny = dx / len;
  const N = Math.max(12, Math.min(80, Math.round(len / 4)));
  let hit = 0, tot = 0;
  for (let k = 1; k < N; k++) {
    const t = k / N;
    const x = p.x + dx * t, y = p.y + dy * t;
    if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue; // cạnh ngoài khung hình: không tính
    tot++;
    let found = false;
    for (let oy = -2; oy <= 2 && !found; oy++) for (let ox = -2; ox <= 2; ox++) {
      const i = (Math.round(y) + oy) * w + Math.round(x) + ox;
      if (mag[i] >= thr) {
        const c = Math.cos(ang[i]) * nx + Math.sin(ang[i]) * ny;
        if (Math.abs(c) > 0.8) { found = true; break; }
      }
    }
    if (found) hit++;
  }
  // cạnh nằm gần hết ngoài khung hình: trung tính thấp
  if (tot < N * 0.35) return 0.5;
  return hit / tot;
}

// Độ lệch sáng giữa ngay ngoài và phần giấy ngay trong cạnh (P85 của dải 3..30 điểm bên trong). Gần 0 nghĩa là "ngoài" cũng là giấy: không phải biên.
function sideEdgeContrast(p, q, lum, w, h, cx, cy) {
  const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
  if (len < 8) return 99;
  let nx = -dy / len, ny = dx / len;
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; } // hướng vào trong
  const N = Math.max(10, Math.min(40, Math.round(len / 6)));
  const diffs = [];
  for (let k = 1; k < N; k++) {
    const t = k / N, x = p.x + dx * t, y = p.y + dy * t;
    const outs = [], ins = [];
    let skip = false;
    for (let d = 3; d <= 8; d += 1) { const X = Math.round(x - nx * d), Y = Math.round(y - ny * d); if (X < 0 || Y < 0 || X >= w || Y >= h) { skip = true; break; } outs.push(lum[Y * w + X]); }
    if (skip) continue;
    for (let d = 3; d <= 30; d += 3) { const X = Math.round(x + nx * d), Y = Math.round(y + ny * d); if (X < 0 || Y < 0 || X >= w || Y >= h) continue; ins.push(lum[Y * w + X]); }
    if (!ins.length) continue;
    outs.sort((a, b) => a - b); ins.sort((a, b) => a - b);
    diffs.push(Math.abs(outs[outs.length >> 1] - ins[Math.floor(ins.length * 0.85)]));
  }
  if (diffs.length < 4) return 99; // cạnh nằm ngoài khung hình: không xét
  diffs.sort((a, b) => a - b);
  return diffs[diffs.length >> 1];
}

/**
 * Tìm tứ giác tốt nhất từ các đường thẳng. Trả về { quad:[TL,TR,BR,BL], score 0..1, areaFrac } hoặc null.
 */
export function houghQuad(r, g, b, w, h) {
  const { mag, ang } = gradient(r, g, b, w, h);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
  const { lines, thr } = findLines(mag, ang, w, h);
  if (lines.length < 4) return null;
  const minSide = Math.min(w, h);
  const parallel = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    if (angDiff(lines[i].t, lines[j].t) > (22 * Math.PI) / 180) continue;
    // khoảng cách giữa hai đường song song (theo pháp tuyến trung bình)
    const tm = (lines[i].t + lines[j].t) / 2;
    const ci = Math.cos(lines[i].t), si = Math.sin(lines[i].t);
    const sep = Math.abs(lines[j].rho * (Math.cos(lines[j].t) * ci + Math.sin(lines[j].t) * si) - lines[i].rho);
    void tm;
    if (sep < minSide * 0.18) continue;
    parallel.push([lines[i], lines[j]]);
  }
  const cands = [];
  const areaImg = w * h;
  for (let a = 0; a < parallel.length; a++) {
    for (let c = a + 1; c < parallel.length; c++) {
      const A = parallel[a], B = parallel[c];
      const ta = (A[0].t + A[1].t) / 2, tb = (B[0].t + B[1].t) / 2;
      const dtheta = angDiff(ta, tb);
      if (dtheta < (55 * Math.PI) / 180) continue; // hai họ phải gần vuông góc (cho phép phối cảnh)
      if (A.includes(B[0]) || A.includes(B[1])) continue;
      const pts = [intersect(A[0], B[0]), intersect(A[0], B[1]), intersect(A[1], B[1]), intersect(A[1], B[0])];
      if (pts.some((p) => !p || !Number.isFinite(p.x))) continue;
      const m = Math.max(w, h) * 0.04;
      if (pts.some((p) => p.x < -m || p.y < -m || p.x > w + m || p.y > h + m)) continue;
      const q = orderCorners(pts);
      if (!isConvexQuad(q)) continue;
      const area = polygonArea(q);
      if (area < areaImg * 0.12 || area > areaImg * 1.05) continue;
      const clampPt = (p) => ({ x: Math.min(w - 1, Math.max(0, p.x)), y: Math.min(h - 1, Math.max(0, p.y)) });
      const cq = q.map(clampPt);
      const sup = [];
      for (let i = 0; i < 4; i++) sup.push(sideSupport(q[i], q[(i + 1) % 4], mag, ang, w, h, thr));
      const minS = Math.min(...sup), mean = sup.reduce((s, x) => s + x, 0) / 4;
      // góc gần 90 độ được ưu tiên
      let angPen = 1;
      for (let i = 0; i < 4; i++) {
        const p0 = q[(i + 3) % 4], p1 = q[i], p2 = q[(i + 1) % 4];
        const v1x = p0.x - p1.x, v1y = p0.y - p1.y, v2x = p2.x - p1.x, v2y = p2.y - p1.y;
        const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
        const ang0 = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
        if (ang0 < 55 || ang0 > 125) angPen *= 0.6; else if (ang0 < 70 || ang0 > 110) angPen *= 0.9;
      }
      const score = (0.55 * mean + 0.45 * minS) * angPen * (0.85 + 0.15 * Math.min(1, area / (areaImg * 0.3)));
      // ưu tiên tứ giác lớn hơn: khối chữ bên trong tờ giấy cũng có cạnh rõ nhưng không phải biên giấy
      const qcx = q.reduce((s0, p0) => s0 + p0.x, 0) / 4, qcy = q.reduce((s0, p0) => s0 + p0.y, 0) / 4;
      let minC = 99;
      for (let i = 0; i < 4; i++) minC = Math.min(minC, sideEdgeContrast(q[i], q[(i + 1) % 4], lum, w, h, qcx, qcy));
      if (minC < 9) continue; // một cạnh không phân cách giấy với nền (là khối chữ/nếp trong giấy)
      cands.push({ quad: cq, score, areaFrac: area / areaImg, sup, minC });
    }
  }
  if (!cands.length) return null;
  const top = Math.max(...cands.map((c) => c.score));
  // trong các ứng viên gần điểm cao nhất, chọn tứ giác lớn nhất (biên giấy ôm ngoài khối chữ)
  const good = cands.filter((c) => c.score >= Math.max(0.55, top - 0.2) && Math.min(...c.sup) >= 0.5);
  if (!good.length) return cands.sort((a, b) => b.score - a.score)[0];
  return good.sort((a, b) => b.areaFrac - a.areaFrac)[0];
}
