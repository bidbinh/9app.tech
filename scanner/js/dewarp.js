// Nắn phẳng trang cong (sách mở, giấy cuộn, uốn mép) theo đường cong của các dòng chữ.
// Cách làm: tách ảnh thành các dải dọc, trong mỗi dải tìm tâm các dòng chữ, nối thành "đường dòng" xuyên qua các dải,
// với mỗi đường dòng so với đường thẳng khớp nhất để ra độ lệch theo chiều dọc, nội suy thành lưới dịch chuyển rồi remap.
// Chỉ sửa theo chiều dọc (làm thẳng dòng chữ); không sửa co giãn ngang gần gáy sách.
// Thuần JS trên {data: RGBA, width, height}; kiểm thử được trong Node.

const K = 32; // số dải dọc
const WORK_EDGE = 900;

function workImage(img, edge = WORK_EDGE) {
  const { width: W, height: H, data } = img;
  const f = Math.max(1, Math.round(Math.max(W, H) / edge));
  const w = Math.floor(W / f), h = Math.floor(H / f);
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let yy = 0; yy < f; yy++) { let i = ((y * f + yy) * W + x * f) * 4; for (let xx = 0; xx < f; xx++, i += 4) s += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; }
    g[y * w + x] = s / (f * f);
  }
  return { g, w, h, f };
}

function inkMask(g, w, h) {
  const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < w; x++) { r += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + r; } }
  const rad = Math.max(8, Math.round(Math.min(w, h) / 22));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad), y1 = Math.min(h, y + rad + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1);
      const mean = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
      m[y * w + x] = g[y * w + x] < mean * 0.8 && g[y * w + x] < 205 ? 1 : 0;
    }
  }
  return m;
}

/** Tìm các đường dòng trên mặt nạ mực. Trả về { tracks: [{xs:[], ys:[]}] } theo điểm ảnh của ảnh làm việc. */
export function findTracks(m, w, h) {
  const sw = w / K;
  const strips = [];
  for (let k = 0; k < K; k++) {
    const x0 = Math.floor(k * sw), x1 = Math.floor((k + 1) * sw);
    const p = new Float32Array(h);
    for (let y = 0; y < h; y++) { let s = 0; for (let x = x0; x < x1; x++) s += m[y * w + x]; p[y] = s; }
    const sm = new Float32Array(h);
    for (let y = 0; y < h; y++) sm[y] = (p[Math.max(0, y - 1)] + p[y] * 2 + p[Math.min(h - 1, y + 1)]) / 4;
    let tot = 0, cnt = 0;
    for (let y = 0; y < h; y++) if (sm[y] > 0) { tot += sm[y]; cnt++; }
    const mu = cnt ? tot / cnt : 0;
    const peaks = [];
    const sep = Math.max(5, Math.round(h * 0.009));
    for (let y = 2; y < h - 2; y++) {
      const v = sm[y];
      if (v < Math.max(2, mu * 0.9)) continue;
      let ok = true;
      for (let d = -sep; d <= sep && ok; d++) { const yy = y + d; if (yy < 0 || yy >= h || d === 0) continue; if (sm[yy] > v || (sm[yy] === v && d < 0)) ok = false; }
      if (ok) peaks.push({ y, v });
    }
    strips.push({ x: (x0 + x1) / 2, peaks });
  }
  const maxStep = Math.max(6, h * 0.011);
  const tracks = [];
  for (let k = 0; k < K; k++) {
    const used = new Set();
    for (const pk of strips[k].peaks) {
      let best = null, bd = Infinity;
      for (const t of tracks) {
        if (t.lastK < k - 3 || t.lastK === k) continue;
        const gap = k - t.lastK;
        const d = Math.abs(pk.y - t.ys[t.ys.length - 1]);
        if (d <= maxStep * gap && d < bd && !used.has(t)) { bd = d; best = t; }
      }
      if (best) { best.xs.push(strips[k].x); best.ys.push(pk.y); best.ks.push(k); best.lastK = k; used.add(best); } else tracks.push({ xs: [strips[k].x], ys: [pk.y], ks: [k], lastK: k });
    }
  }
  return { tracks: tracks.filter((t) => t.xs.length >= Math.round(K * 0.34)), strips };
}

function lineFit(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  const den = n * sxx - sx * sx;
  const b = den ? (n * sxy - sx * sy) / den : 0;
  return { a: (sy - b * sx) / n, b };
}

/** Độ cong của một tập đường dòng: trung vị của (cao - thấp của phần dư so với đường thẳng) / chiều cao ảnh; và độ nhất quán giữa các dòng. */
export function curvatureOf(tracks, h) {
  if (!tracks.length) return { curvature: 0, coherence: 0, n: 0 };
  const p2p = [];
  const resid = [];
  for (const t of tracks) {
    const f = lineFit(t.xs, t.ys);
    const r = t.xs.map((x, i) => t.ys[i] - (f.a + f.b * x));
    resid.push({ ks: t.ks, r, f });
    p2p.push((Math.max(...r) - Math.min(...r)) / h);
  }
  p2p.sort((a, b) => a - b);
  const curvature = p2p[p2p.length >> 1];
  // độ nhất quán: tại mỗi dải, phần dư của các dòng có giống nhau không (trang cong thì các dòng cong cùng kiểu)
  const byK = new Map();
  for (const t of resid) t.ks.forEach((k, i) => { if (!byK.has(k)) byK.set(k, []); byK.get(k).push(t.r[i]); });
  let num = 0, den = 0;
  for (const arr of byK.values()) {
    if (arr.length < 2) continue;
    const s = arr.slice().sort((a, b) => a - b), med = s[s.length >> 1];
    for (const v of arr) { num += Math.abs(v - med); den += Math.abs(v) + 1e-6; }
  }
  const coherence = den ? Math.max(0, 1 - num / den) : 0;
  return { curvature, coherence, n: tracks.length };
}

/**
 * Ước lượng lưới nắn phẳng. Trả về { found, usable, auto, curvature, coherence, nTracks, field, after } với
 *   field = { K, ys: number[K][] (chuẩn hóa 0..1, đích), ds: number[K][] (độ dịch chuẩn hóa theo chiều cao) } hoặc null.
 *   usable: có thể áp dụng (đủ dòng, giảm độ cong); auto: đủ cong và nhất quán để tự bật.
 */
export function estimateDewarp(img, opts = {}) {
  const minCurv = opts.minCurvature ?? 0.0065;
  const wk = workImage(img);
  const { g, w, h } = wk;
  const m = inkMask(g, w, h);
  const { tracks } = findTracks(m, w, h);
  const out = { found: false, usable: false, auto: false, curvature: 0, coherence: 0, nTracks: tracks.length, field: null, after: null };
  if (tracks.length < 4) return out;
  const c = curvatureOf(tracks, h);
  out.curvature = c.curvature; out.coherence = c.coherence; out.found = true;
  // dựng lưới: tại mỗi dải k, các cặp (y đích, độ lệch)
  const ys = Array.from({ length: K }, () => []), ds = Array.from({ length: K }, () => []);
  const fits = tracks.map((t) => lineFit(t.xs, t.ys));
  const sw = w / K;
  tracks.forEach((t, ti) => {
    const f = fits[ti];
    // điền các dải thiếu bằng nội suy tuyến tính để có đường dòng liên tục
    const ky = new Map(t.ks.map((k, i) => [k, t.ys[i]]));
    const kmin = Math.min(...t.ks), kmax = Math.max(...t.ks);
    for (let k = kmin; k <= kmax; k++) {
      let y = ky.get(k);
      if (y == null) {
        let a = k - 1, b = k + 1;
        while (a >= kmin && !ky.has(a)) a--;
        while (b <= kmax && !ky.has(b)) b++;
        y = ky.get(a) + ((ky.get(b) - ky.get(a)) * (k - a)) / (b - a);
      }
      const x = (k + 0.5) * sw;
      const target = f.a + f.b * x;
      ys[k].push(target / h); ds[k].push((y - target) / h);
    }
  });
  const field = { K, ys: [], ds: [] };
  for (let k = 0; k < K; k++) {
    const idx = ys[k].map((_, i) => i).sort((a, b) => ys[k][a] - ys[k][b]);
    field.ys.push(idx.map((i) => ys[k][i])); field.ds.push(idx.map((i) => ds[k][i]));
  }
  // làm mượt theo trục x (3 điểm) trên đường nội suy tại các y chuẩn
  const grid = 48;
  const lut = Array.from({ length: K }, () => new Float32Array(grid + 1));
  for (let k = 0; k < K; k++) for (let j = 0; j <= grid; j++) lut[k][j] = interp(field.ys[k], field.ds[k], j / grid);
  const sm = Array.from({ length: K }, () => new Float32Array(grid + 1));
  for (let k = 0; k < K; k++) for (let j = 0; j <= grid; j++) sm[k][j] = (lut[Math.max(0, k - 1)][j] + lut[k][j] * 2 + lut[Math.min(K - 1, k + 1)][j]) / 4;
  out.field = { K, grid, d: sm.map((a) => Array.from(a)) }; // d[k][j]: dịch chuyển (chuẩn hóa theo h) tại y = j/grid
  // giới hạn an toàn
  let maxD = 0; for (const a of out.field.d) for (const v of a) maxD = Math.max(maxD, Math.abs(v));
  out.maxShift = maxD;
  // kiểm: áp dụng thử trên ảnh làm việc và đo lại độ cong
  const test = applyField({ data: grayToRgba(g, w, h), width: w, height: h }, out.field);
  const g2 = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g2[i] = test.data[i * 4];
  const m2 = inkMask(g2, w, h);
  const t2 = findTracks(m2, w, h).tracks;
  const c2 = curvatureOf(t2, h);
  out.after = { curvature: c2.curvature, nTracks: t2.length };
  out.usable = maxD <= 0.07 && (c2.curvature <= c.curvature * 0.7 || c.curvature < 0.002) && t2.length >= Math.max(3, tracks.length * 0.6);
  out.auto = out.usable && c.curvature >= minCurv && c.coherence >= 0.4;
  return out;
}

function grayToRgba(g, w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g[i]; d[i * 4 + 3] = 255; }
  return d;
}

function interp(ys, ds, y) {
  const n = ys.length;
  if (!n) return 0;
  if (y <= ys[0]) return ds[0];
  if (y >= ys[n - 1]) return ds[n - 1];
  let i = 1;
  while (i < n && ys[i] < y) i++;
  const t = (y - ys[i - 1]) / Math.max(1e-9, ys[i] - ys[i - 1]);
  return ds[i - 1] * (1 - t) + ds[i] * t;
}

/** Remap ảnh theo lưới dịch chuyển: ảnh ra tại (x, y) lấy từ ảnh vào tại (x, y + d(x, y)). Trả về ảnh mới {data,width,height}. */
export function applyField(img, field) {
  const { width: W, height: H, data } = img;
  const out = new Uint8ClampedArray(W * H * 4);
  const { K: k, grid, d } = field;
  const sw = W / k;
  for (let y = 0; y < H; y++) {
    const gy = (y / H) * grid, j0 = Math.min(grid - 1, Math.floor(gy)), jt = gy - j0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(k - 1, Math.max(0, x / sw - 0.5)), k0 = Math.min(k - 2, Math.floor(fx)), kt = fx - k0;
      const a = d[k0][j0] * (1 - jt) + d[k0][j0 + 1] * jt;
      const b = d[k0 + 1][j0] * (1 - jt) + d[k0 + 1][j0 + 1] * jt;
      const dy = (a * (1 - kt) + b * kt) * H;
      let sy = y + dy;
      if (sy < 0) sy = 0; else if (sy > H - 1) sy = H - 1;
      const y0 = sy | 0, y1 = Math.min(H - 1, y0 + 1), ty = sy - y0;
      const o = (y * W + x) * 4, i0 = (y0 * W + x) * 4, i1 = (y1 * W + x) * 4;
      out[o] = data[i0] * (1 - ty) + data[i1] * ty;
      out[o + 1] = data[i0 + 1] * (1 - ty) + data[i1 + 1] * ty;
      out[o + 2] = data[i0 + 2] * (1 - ty) + data[i1 + 2] * ty;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}
