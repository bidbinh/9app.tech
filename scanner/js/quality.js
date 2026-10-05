// Chẩn đoán chất lượng ảnh chụp: mờ/rung, chói lóa, thiếu sáng, chữ nhạt, tờ giấy bị cắt mép/quá nhỏ.
// Không sửa ảnh; trả về danh sách cảnh báo tiếng Việt kèm hướng xử lý để người dùng chụp lại khi không cứu được.
// Thuần JS trên {data: RGBA, width, height}; kiểm thử được trong Node.

function workGray(img, edge = 800) {
  const { width: W, height: H, data } = img;
  const f = Math.max(1, Math.round(Math.max(W, H) / edge));
  const w = Math.floor(W / f), h = Math.floor(H / f);
  const g = new Float32Array(w * h), mx = new Uint8Array(w * h); // mx: có kênh nào >= 252 ở mọi điểm của ô (chói)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, sat = 0;
    for (let yy = 0; yy < f; yy++) { let i = ((y * f + yy) * W + x * f) * 4; for (let xx = 0; xx < f; xx++, i += 4) { s += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; if (data[i] >= 252 && data[i + 1] >= 252 && data[i + 2] >= 252) sat++; } }
    g[y * w + x] = s / (f * f);
    mx[y * w + x] = sat >= f * f * 0.8 ? 1 : 0;
  }
  return { g, mx, w, h, f };
}

function localInk(g, w, h) {
  const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < w; x++) { r += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + r; } }
  const rad = Math.max(8, Math.round(Math.min(w, h) / 22));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad), y1 = Math.min(h, y + rad + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1);
      const mean = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
      m[y * w + x] = g[y * w + x] < mean * 0.82 ? 1 : 0;
    }
  }
  return m;
}

const pct = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

/** Độ nét: độ dốc trung bình của các cạnh mạnh nhất chia cho độ tương phản của trang (cạnh chữ nhòe thì dốc thấp). */
export function sharpness(img) {
  const { g, w, h } = workGray(img, 1000);
  const mags = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = (g[i + 1] - g[i - 1]) / 2, gy = (g[i + w] - g[i - w]) / 2;
    mags[i] = Math.hypot(gx, gy);
  }
  const top = pct(mags, 0.985);
  let s = 0, c = 0;
  for (let i = 0; i < mags.length; i++) if (mags[i] >= top) { s += mags[i]; c++; }
  const lo = pct(g, 0.03), hi = pct(g, 0.9);
  const contrast = Math.max(20, hi - lo);
  return c ? s / c / contrast : 0;
}

/**
 * Phân tích trang đã nắn phẳng (chưa lọc). Trả về { issues: [{id, text}], metrics }.
 * Ngưỡng chọn bằng ảnh thử (scripts/lab3.js); chỉ cảnh báo khi khá chắc để không làm phiền.
 */
export function analyzeQuality(img, opts = {}) {
  const { g, mx, w, h } = workGray(img, 800);
  const n = w * h;
  const issues = [];
  const paper = pct(g, 0.7); // độ sáng giấy ~ phân vị 70
  const ink = pct(g, 0.03);
  const med = pct(g, 0.5);
  const metrics = { paper: Math.round(paper), ink: Math.round(ink), median: Math.round(med) };
  // thiếu sáng / tương phản thấp
  if (paper < 95) issues.push({ id: 'dark', text: 'Ảnh thiếu sáng. Hãy bật đèn hoặc đèn pin rồi chụp lại để chữ rõ hơn.' });
  else if (paper - ink < 55 && !opts.skipContrast) issues.push({ id: 'lowcontrast', text: 'Chữ nhạt, độ tương phản thấp. Thử bộ lọc “Trắng đen tài liệu”, hoặc chụp lại nơi sáng hơn.' });
  // chói lóa: mảng trắng cháy liền khối, gọn, MÀ bên trong không còn nét chữ trong khi cùng các hàng đó ở ngoài vẫn có chữ.
  // (Vùng giấy sáng quá nhưng vẫn thấy chữ, hoặc vùng trắng trống thì không phải chói lóa.)
  {
    const hi = pct(g, 0.9);
    const bright = [];
    for (let i = 0; i < n; i += 3) if (!mx[i] && g[i] > 0.6 * hi) bright.push(g[i]);
    bright.sort((a, b) => a - b);
    const pm = bright.length ? bright[bright.length >> 1] : 255;
    const ink = localInk(g, w, h);
    const seen = new Uint8Array(n), stack = [];
    let biggest = 0, hit = null;
    for (let s0 = 0; s0 < n; s0++) {
      if (!mx[s0] || seen[s0]) continue;
      let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      seen[s0] = 1; stack.push(s0);
      while (stack.length) {
        const i = stack.pop(); area++;
        const x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mx[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < w - 1 && mx[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (y > 0 && mx[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (y < h - 1 && mx[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      biggest = Math.max(biggest, area);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (area < 0.005 * n || bw * bh > 0.3 * n || area < 0.5 * bw * bh || hit) continue;
      let inkIn = 0, cIn = 0, inkOut = 0, cOut = 0;
      for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) {
        const dark = ink[y * w + x];
        if (x >= x0 && x <= x1) { inkIn += dark; cIn++; } else { inkOut += dark; cOut++; }
      }
      const dIn = inkIn / Math.max(1, cIn), dOut = inkOut / Math.max(1, cOut);
      if (dOut >= 0.02 && dIn <= 0.25 * dOut) hit = { area: area / n, dIn, dOut };
    }
    metrics.glare = +(biggest / n * 100).toFixed(2); metrics.paperNoGlare = Math.round(pm);
    if (hit) { metrics.glareBlob = { area: +(hit.area * 100).toFixed(2), inkIn: +hit.dIn.toFixed(3), inkOut: +hit.dOut.toFixed(3) }; issues.push({ id: 'glare', text: 'Có vùng chói lóa (đèn phản chiếu trên giấy bóng/ép plastic) che mất chữ. Hãy nghiêng điện thoại hoặc đổi hướng đèn rồi chụp lại.' }); }
  }
  // mờ/rung
  const sh = sharpness(img);
  metrics.sharp = +sh.toFixed(3);
  if (sh < (opts.blurBelow ?? 0.15)) issues.push({ id: 'blur', text: 'Ảnh bị mờ hoặc rung tay. Hãy giữ chắc máy, chờ lấy nét rồi chụp lại, hoặc chụp gần hơn.' });
  return { issues, metrics };
}

/** Cảnh báo theo vị trí khung: tờ giấy sát/ra ngoài mép ảnh, hoặc quá nhỏ trong ảnh. corners chuẩn hóa 0..1. */
export function frameWarnings(corners, srcW, srcH, found) {
  const out = [];
  if (!found) return out;
  const m = 0.006;
  const nearEdge = corners.filter((p) => p.x <= m || p.y <= m || p.x >= 1 - m || p.y >= 1 - m).length;
  if (nearEdge >= 1) out.push({ id: 'partial', text: 'Tờ giấy chạm hoặc vượt mép ảnh nên có thể thiếu một phần. Hãy lùi ra xa một chút để thấy đủ 4 góc.' });
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = corners[i], q = corners[(i + 1) % 4]; a += p.x * q.y - q.x * p.y; }
  a = Math.abs(a) / 2;
  const longEdge = Math.max(srcW, srcH) * Math.sqrt(a);
  if (a < 0.1 || longEdge < 800) out.push({ id: 'small', text: 'Tờ giấy chiếm phần nhỏ của ảnh nên chữ sẽ mờ. Hãy chụp gần hơn cho tờ giấy đầy khung.' });
  return out;
}
