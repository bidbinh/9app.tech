// "Phép màu" của 9draw: nhìn bản vẽ rồi tự vẽ thêm hình ngộ nghĩnh. Chạy ngay trên máy, không gửi hình đi đâu.
// - Hình khép kín (tròn, trứng, bầu dục...) được vẽ mắt, miệng, má hồng, tay chân.
// - Các chỗ giấy còn trống được thêm nhân vật nhỏ: sao, tim, mặt trời, mây, mèo, ma, thỏ, hoa...
// Kết quả là danh sách nét vector (cùng định dạng engine.js), không đụng DOM nên kiểm thử được.

const CELL = 180;
const PAL = ['#ef4444', '#f97316', '#f5b400', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const PINK = '#ff7aa8';

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v) => Math.round(v * 10) / 10;
const pen = (pts, c, w) => ({ t: 'pen', c, w: r1(Math.max(2, w)), p: pts.flatMap(([x, y]) => [r1(x), r1(y)]) });
const dot = (x, y, c, w, t = 'pen') => ({ t, c, w: r1(Math.max(2, w)), p: [r1(x), r1(y)] });
const arc = (cx, cy, rx, ry, a0, a1, n = 18) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const ring = (cx, cy, rx, ry = rx, n = 26) => arc(cx, cy, rx, ry, 0, Math.PI * 2, n);

// ---------- Phân tích bản vẽ ----------
function liveStrokes(strokes) {
  let from = 0;
  for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].t === 'clear') { from = i + 1; break; }
  return strokes.slice(from);
}
function allSubs(list) {
  const out = [];
  for (const s of list) { if (s.t === 'magic') out.push(...s.s); else if (s.t !== 'clear') out.push(s); }
  return out;
}
function bbox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function pathLen(p) {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}
// Hình khép kín đủ to để vẽ mặt.
export function closedShapes(strokes, W, H) {
  const out = [];
  for (const s of liveStrokes(strokes)) {
    if (s.t !== 'pen' || s.p.length < 12) continue;
    const b = bbox(s.p), D = Math.hypot(b.w, b.h), n = s.p.length;
    if (Math.min(b.w, b.h) < 90 || b.w > W * 0.95 || b.h > H * 0.95) continue;
    if (Math.hypot(s.p[0] - s.p[n - 2], s.p[1] - s.p[n - 1]) > 0.3 * D) continue;
    if (pathLen(s.p) < 1.8 * D) continue;
    out.push({ ...b, c: s.c, w0: s.w });
  }
  return out;
}
function hasFace(shape, subsOfMagic) {
  const cx0 = shape.x + shape.w * 0.2, cx1 = shape.x + shape.w * 0.8;
  const cy0 = shape.y + shape.h * 0.2, cy1 = shape.y + shape.h * 0.8;
  for (const s of subsOfMagic) for (let i = 0; i < s.p.length; i += 2) if (s.p[i] > cx0 && s.p[i] < cx1 && s.p[i + 1] > cy0 && s.p[i + 1] < cy1) return true;
  return false;
}
function occupancy(subs, shapes, cols, rows) {
  const used = new Set();
  const mark = (x, y) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let dy = -0; dy <= 0; dy++) for (let dx = 0; dx <= 0; dx++) used.add((cy + dy) * cols + (cx + dx));
  };
  for (const s of subs) {
    if (s.t === 'er') continue;
    const p = s.p;
    if (p.length === 2) mark(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) {
      const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]), k = Math.max(1, Math.ceil(L / 40));
      for (let j = 0; j <= k; j++) mark(p[i - 2] + ((p[i] - p[i - 2]) * j) / k, p[i - 1] + ((p[i + 1] - p[i - 1]) * j) / k);
    }
  }
  for (const b of shapes) {
    for (let y = b.y; y <= b.y + b.h; y += CELL / 2) for (let x = b.x; x <= b.x + b.w; x += CELL / 2) mark(x, y);
    mark(b.x + b.w, b.y + b.h);
  }
  return used;
}

// ---------- Khuôn mặt ----------
// Vẽ mặt trong khung (cx, cy, fw, fh). R: số ngẫu nhiên; ink: màu nét mặt.
function face(cx, cy, fw, fh, R, ink, o = {}) {
  const m = Math.min(fw, fh), out = [];
  const ex = fw * 0.2, ey = cy - fh * 0.08, ew = Math.max(5, m * 0.075);
  const eyeKind = o.eyes ?? Math.floor(R() * 4);
  const eye = (x, kind) => {
    if (kind === 1) { out.push(pen(ring(x, ey, ew * 1.5, ew * 1.5, 14), ink, Math.max(3, m * 0.025))); out.push(dot(x + ew * 0.5, ey + ew * 0.3, ink, ew * 1.2)); }
    else if (kind === 2) out.push(pen(arc(x, ey + ew * 0.6, ew * 1.4, ew * 1.4, Math.PI * 1.1, Math.PI * 1.9, 8), ink, Math.max(3, m * 0.035)));
    else out.push(dot(x, ey, ink, ew * 1.5));
  };
  eye(cx - ex, eyeKind === 3 ? 0 : eyeKind);
  eye(cx + ex, eyeKind === 3 ? 2 : eyeKind);
  const mouth = o.mouth ?? Math.floor(R() * 4), my = cy + fh * 0.1, mr = m * 0.16, lw = Math.max(3, m * 0.03);
  if (mouth === 1) {
    const a = arc(cx, my - mr * 0.3, mr, mr * 1.1, 0.1 * Math.PI, 0.9 * Math.PI, 10);
    out.push(pen([...a, a[0]], ink, lw));
    out.push(dot(cx, my + mr * 0.65, PINK, mr * 0.9, 'hl'));
  } else if (mouth === 2) out.push(pen(ring(cx, my + mr * 0.3, mr * 0.4, mr * 0.5, 12), ink, lw));
  else if (mouth === 3) {
    out.push(pen(arc(cx - mr * 0.45, my, mr * 0.45, mr * 0.45, 0.05 * Math.PI, 0.95 * Math.PI, 8), ink, lw));
    out.push(pen(arc(cx + mr * 0.45, my, mr * 0.45, mr * 0.45, 0.05 * Math.PI, 0.95 * Math.PI, 8), ink, lw));
  } else out.push(pen(arc(cx, my - mr * 0.5, mr, mr, 0.15 * Math.PI, 0.85 * Math.PI, 12), ink, lw));
  if (!o.noBlush) {
    out.push(dot(cx - fw * 0.34, cy + fh * 0.07, PINK, m * 0.16, 'hl'));
    out.push(dot(cx + fw * 0.34, cy + fh * 0.07, PINK, m * 0.16, 'hl'));
  }
  return out;
}

// Mặt + tay chân cho hình khép kín người dùng vẽ.
function character(b, H, R, ink) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, m = Math.min(b.w, b.h), out = face(cx, cy, b.w, b.h, R, ink), c = b.c;
  const lw = Math.max(4, Math.min(b.w0 || 6, 12));
  if (b.y + b.h + m * 0.3 < H) {
    for (const sx of [-1, 1]) {
      const x = cx + sx * b.w * 0.18, y = b.y + b.h;
      out.push(pen([[x, y], [x + sx * m * 0.02, y + m * 0.16]], c, lw));
      out.push(pen([[x + sx * m * 0.02, y + m * 0.16], [x + sx * m * 0.12, y + m * 0.19]], c, lw));
    }
  }
  for (const sx of [-1, 1]) {   // tay vẫy
    const x = cx + sx * b.w * 0.5, y = cy + b.h * 0.05;
    out.push(pen([[x, y], [x + sx * m * 0.14, y - m * 0.1], [x + sx * m * 0.2, y - m * 0.2]], c, lw));
  }
  if (R() < 0.55) {   // mầm cây trên đầu
    const x = cx, y = b.y;
    out.push(pen([[x, y], [x, y - m * 0.1]], '#22c55e', lw));
    out.push(pen(arc(x - m * 0.07, y - m * 0.12, m * 0.07, m * 0.045, 0, Math.PI * 2, 10), '#22c55e', Math.max(3, lw * 0.7)));
    out.push(pen(arc(x + m * 0.07, y - m * 0.12, m * 0.07, m * 0.045, 0, Math.PI * 2, 10), '#22c55e', Math.max(3, lw * 0.7)));
  }
  return out;
}

// ---------- Nhân vật nhỏ lấp chỗ trống ----------
const lw = (r) => Math.max(4, r * 0.11);
const D = {
  star(cx, cy, r, R, ink) {
    const col = pick(R, ['#f5b400', '#f97316', '#ec4899']);
    const pts = Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? 0.48 : 1; return [cx + r * k * Math.cos(a), cy + r * k * Math.sin(a)]; });
    return [pen(pts, col, lw(r)), ...face(cx, cy + r * 0.08, r * 0.9, r * 0.9, R, ink, { eyes: 0, mouth: 0, noBlush: r < 45 })];
  },
  heart(cx, cy, r, R) {
    const col = pick(R, ['#ef4444', '#ec4899', '#f43f5e']);
    const pts = Array.from({ length: 37 }, (_, i) => {
      const t = (i / 36) * Math.PI * 2;
      return [cx + (r / 17) * 16 * Math.sin(t) ** 3, cy - (r / 17) * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + r * 0.05];
    });
    return [pen(pts, col, lw(r)), dot(cx - r * 0.45, cy - r * 0.35, '#ffffff', r * 0.14, 'pen')];
  },
  sun(cx, cy, r, R, ink) {
    const out = [pen(ring(cx, cy, r * 0.6, r * 0.6, 24), '#f5b400', lw(r))];
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5; out.push(pen([[cx + r * 0.78 * Math.cos(a), cy + r * 0.78 * Math.sin(a)], [cx + r * Math.cos(a), cy + r * Math.sin(a)]], '#f97316', lw(r))); }
    return [...out, ...face(cx, cy, r * 1.1, r * 1.1, R, ink, { eyes: 2, mouth: 0 })];
  },
  cloud(cx, cy, r, R, ink) {
    const c = pick(R, ['#3b82f6', '#06b6d4']);
    const A = (ox, oy, rad, a0, a1) => arc(cx + ox * r, cy + oy * r, rad * r, rad * r, a0 * Math.PI, a1 * Math.PI, 10);
    return [
      pen(A(-0.5, 0.2, 0.35, 0.5, 1.5), c, lw(r)), pen(A(-0.05, -0.15, 0.5, 1.1, 1.95), c, lw(r)), pen(A(0.55, 0.15, 0.4, 1.5, 2.5), c, lw(r)),
      pen([[cx + 0.55 * r, cy + 0.55 * r], [cx - 0.5 * r, cy + 0.55 * r]], c, lw(r)),
      ...face(cx, cy + r * 0.12, r * 1.2, r * 0.9, R, ink, { eyes: 0, mouth: 0 }),
    ];
  },
  cat(cx, cy, r, R, ink) {
    const c = pick(R, ['#f97316', '#8b5cf6', '#64748b']);
    const out = [pen(ring(cx, cy + r * 0.1, r * 0.8, r * 0.7, 26), c, lw(r))];
    for (const s of [-1, 1]) {
      out.push(pen([[cx + s * r * 0.75, cy - r * 0.15], [cx + s * r * 0.7, cy - r * 0.85], [cx + s * r * 0.25, cy - r * 0.5]], c, lw(r)));
      for (const k of [-0.1, 0.12]) out.push(pen([[cx + s * r * 0.95, cy + r * (0.15 + k)], [cx + s * r * 1.35, cy + r * (0.1 + k * 2.2)]], c, Math.max(3, lw(r) * 0.6)));
    }
    return [...out, ...face(cx, cy + r * 0.1, r * 1.5, r * 1.3, R, ink, { eyes: 0, mouth: 3, noBlush: true }), dot(cx, cy + r * 0.12, PINK, r * 0.14)];
  },
  ghost(cx, cy, r, R, ink) {
    const c = pick(R, ['#8b5cf6', '#06b6d4', '#ec4899']);
    const pts = [...arc(cx, cy - r * 0.1, r * 0.75, r * 0.75, Math.PI, Math.PI * 2, 14), [cx + r * 0.75, cy + r * 0.75]];
    for (let i = 1; i <= 12; i++) pts.push([cx + r * 0.75 - (r * 1.5 * i) / 12, cy + r * 0.75 + Math.sin((i / 12) * Math.PI * 3) * r * 0.12]);
    pts.push([cx - r * 0.75, cy - r * 0.1]);
    return [pen(pts, c, lw(r)), ...face(cx, cy - r * 0.05, r * 1.3, r * 1.3, R, ink, { eyes: 0, mouth: 2, noBlush: false })];
  },
  bunny(cx, cy, r, R, ink) {
    const c = pick(R, ['#ec4899', '#8b5cf6', '#3b82f6']);
    const out = [pen(ring(cx, cy + r * 0.25, r * 0.65, r * 0.6, 24), c, lw(r))];
    for (const s of [-1, 1]) out.push(pen(ring(cx + s * r * 0.28, cy - r * 0.55, r * 0.16, r * 0.45, 16), c, lw(r)));
    return [...out, ...face(cx, cy + r * 0.25, r * 1.3, r * 1.2, R, ink, { eyes: 0, mouth: 3 }), dot(cx, cy + r * 0.3, PINK, r * 0.12)];
  },
  flower(cx, cy, r, R) {
    const c = pick(R, ['#ec4899', '#ef4444', '#8b5cf6', '#f97316']);
    const out = [pen([[cx, cy + r * 0.3], [cx, cy + r]], '#22c55e', lw(r)), pen(arc(cx + r * 0.25, cy + r * 0.7, r * 0.25, r * 0.12, 0, Math.PI * 2, 10), '#22c55e', lw(r) * 0.8)];
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; out.push(pen(ring(cx + r * 0.5 * Math.cos(a), cy - r * 0.2 + r * 0.5 * Math.sin(a), r * 0.28, r * 0.28, 12), c, lw(r) * 0.8)); }
    out.push(dot(cx, cy - r * 0.2, '#f5b400', r * 0.45));
    return out;
  },
  sparkle(cx, cy, r, R) {
    const c = pick(R, PAL);
    return [pen([[cx, cy - r], [cx, cy + r]], c, lw(r)), pen([[cx - r, cy], [cx + r, cy]], c, lw(r)),
      pen([[cx - r * 0.5, cy - r * 0.5], [cx + r * 0.5, cy + r * 0.5]], c, lw(r) * 0.7), pen([[cx + r * 0.5, cy - r * 0.5], [cx - r * 0.5, cy + r * 0.5]], c, lw(r) * 0.7)];
  },
};
const MAIN = ['star', 'heart', 'sun', 'cloud', 'cat', 'ghost', 'bunny', 'flower', 'sparkle'];
const pick = (R, a) => a[Math.floor(R() * a.length) % a.length];

const NOTES_FACE = ['Hình của bạn biết cười rồi nè!', 'Ôi, nó có mặt rồi, trông yêu quá!', 'Hihi, tớ vẽ mặt cho nó nhé!'];
const NOTES_DECO = ['Tớ thêm vài người bạn vào tranh nhé!', 'Tranh vui hơn rồi đó!', 'Bạn bè của bức tranh kéo đến này!'];

// Tạo các nét thêm vào. Trả về { strokes, note } hoặc { reason } nếu không làm được.
// opts: { W, H, bg, seed, light, focus:[x,y] }
export function makeMagic(strokes, opts) {
  const { W, H, bg = 'white', seed = 1, light = false, focus = null } = opts;
  const R = makeRng(seed);
  const ink = bg === 'board' ? '#ffffff' : '#1f2937';
  const live = liveStrokes(strokes);
  const subs = allSubs(live);
  if (!subs.some((s) => s.t === 'pen' || s.t === 'hl')) return { reason: 'trống' };

  const magicSubs = live.filter((s) => s.t === 'magic').flatMap((s) => s.s);
  const shapes = closedShapes(strokes, W, H).filter((b) => !hasFace(b, magicSubs));
  const out = [];
  let faces = 0;
  for (const b of shapes.slice(0, 4)) { out.push(...character(b, H, R, ink)); faces++; }

  const cols = Math.floor(W / CELL), rows = Math.floor(H / CELL);
  const used = occupancy(subs.concat(out), shapes.concat(closedShapes(strokes, W, H)), cols, rows);
  let free = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) if (!used.has(cy * cols + cx)) free.push([cx, cy]);
  if (light && focus) free.sort((a, b) => Math.hypot((a[0] + 0.5) * CELL - focus[0], (a[1] + 0.5) * CELL - focus[1]) - Math.hypot((b[0] + 0.5) * CELL - focus[0], (b[1] + 0.5) * CELL - focus[1]));
  else for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const want = light ? 1 + Math.floor(R() * 2) : 3 + Math.floor(R() * 3);
  let deco = 0, lastKind = '';
  for (const [cx, cy] of free.slice(0, want)) {
    let kind = pick(R, MAIN);
    if (kind === lastKind) kind = pick(R, MAIN);
    lastKind = kind;
    const r = CELL * (0.35 + R() * 0.1);
    out.push(...D[kind]((cx + 0.5) * CELL + (R() - 0.5) * 20, (cy + 0.5) * CELL + (R() - 0.5) * 20, r, R, ink));
    deco++;
  }
  if (!out.length) return { reason: 'đầy' };
  return { strokes: out, faces, deco, note: pick(R, faces ? NOTES_FACE : NOTES_DECO) };
}
