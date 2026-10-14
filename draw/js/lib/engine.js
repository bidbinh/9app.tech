// Lõi vẽ của 9draw: nét vẽ lưu dạng vector (tọa độ trang 1080 px), dựng lại được để hoàn tác/làm lại.
// Không đụng DOM: nhận ctx 2D từ bên ngoài nên kiểm thử được bằng ctx giả.

export const W = 1080;
export const FORMATS = {
  '4:5': { ten: 'Dọc 4:5', h: 1350 },
  '1:1': { ten: 'Vuông 1:1', h: 1080 },
  '9:16': { ten: 'Story 9:16', h: 1920 },
  '16:9': { ten: 'Ngang 16:9', h: 608 },
};
export const BGS = {
  white: { ten: 'Trắng', fill: '#ffffff' },
  paper: { ten: 'Giấy ngà', fill: '#fbf6ea' },
  grid: { ten: 'Ô vuông', fill: '#ffffff', line: '#d6dbea', step: 54 },
  lines: { ten: 'Dòng kẻ', fill: '#ffffff', line: '#cbd5f0', step: 72, rows: true },
  board: { ten: 'Bảng đen', fill: '#1b1e2b' },
};
export const HL_ALPHA = 0.35;
const TOOLS = new Set(['pen', 'hl', 'er']);
const COLOR = /^#[0-9a-f]{6}$/i;

export function drawBackground(ctx, bgKey, w, h) {
  const b = BGS[bgKey] || BGS.white;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = b.fill;
  ctx.fillRect(0, 0, w, h);
  if (b.line) {
    ctx.strokeStyle = b.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = b.step; y < h; y += b.step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    if (!b.rows) for (let x = b.step; x < w; x += b.step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    ctx.stroke();
  }
}

function style(ctx, s, alpha) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.w;
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.globalCompositeOperation = s.t === 'er' ? 'destination-out' : 'source-over';
  ctx.globalAlpha = alpha ?? (s.t === 'hl' ? HL_ALPHA : 1);
}

function dot(ctx, s) {
  ctx.beginPath();
  ctx.arc(s.p[0], s.p[1], s.w / 2, 0, Math.PI * 2);
  ctx.fill();
}

// Vẽ cả nét. alpha: ghi đè độ mờ (lớp xem trước của bút dạ dùng 1, độ mờ do CSS lo).
export function drawStroke(ctx, s, alpha) {
  if (s.t === 'magic') { for (const q of s.s) drawStroke(ctx, q, alpha); return; }   // nhóm nét "phép màu": hoàn tác một lần
  const p = s.p, n = p.length / 2;
  if (n < 1) return;
  style(ctx, s, alpha);
  if (n === 1) { dot(ctx, s); return; }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let k = 1; k < n - 1; k++) {
    ctx.quadraticCurveTo(p[2 * k], p[2 * k + 1], (p[2 * k] + p[2 * k + 2]) / 2, (p[2 * k + 1] + p[2 * k + 3]) / 2);
  }
  ctx.lineTo(p[2 * n - 2], p[2 * n - 1]);
  ctx.stroke();
}

// Vẽ từng đoạn khi đang kéo (bút, tẩy): drawSeg(k) khi đã có điểm k+1 (k >= 1), drawTail khi nhấc tay.
// Cùng đường cong với drawStroke nên dựng lại không lệch.
function startOf(p, k) { return k === 1 ? [p[0], p[1]] : [(p[2 * k - 2] + p[2 * k]) / 2, (p[2 * k - 1] + p[2 * k + 1]) / 2]; }
export function drawSeg(ctx, s, k) {
  const p = s.p;
  if (k < 1 || 2 * k + 3 >= p.length) return;
  style(ctx, s);
  const [x0, y0] = startOf(p, k);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(p[2 * k], p[2 * k + 1], (p[2 * k] + p[2 * k + 2]) / 2, (p[2 * k + 1] + p[2 * k + 3]) / 2);
  ctx.stroke();
}
export function drawTail(ctx, s) {
  const p = s.p, n = p.length / 2;
  if (n < 1) return;
  style(ctx, s);
  if (n === 1) { dot(ctx, s); return; }
  const [x0, y0] = n === 2 ? [p[0], p[1]] : [(p[2 * n - 4] + p[2 * n - 2]) / 2, (p[2 * n - 3] + p[2 * n - 1]) / 2];
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(p[2 * n - 2], p[2 * n - 1]);
  ctx.stroke();
}

// Dựng lại lớp mực từ danh sách nét; "clear" xóa sạch những gì trước nó.
export function replay(ctx, strokes, w, h) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  let from = 0;
  for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].t === 'clear') { from = i + 1; break; }
  for (let i = from; i < strokes.length; i++) drawStroke(ctx, strokes[i]);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Kiểm tra và làm sạch một nét; trả về nét sạch hoặc null.
function cleanStroke(s, depth = 0) {
  if (!s || typeof s !== 'object') return null;
  if (s.t === 'clear') return { t: 'clear' };
  if (s.t === 'magic') {
    if (depth || !Array.isArray(s.s) || !s.s.length || s.s.length > 600) return null;
    const subs = s.s.map((q) => (q && q.t !== 'clear' && q.t !== 'magic' ? cleanStroke(q, 1) : null)).filter(Boolean);
    return subs.length ? { t: 'magic', s: subs } : null;
  }
  if (!TOOLS.has(s.t) || !COLOR.test(s.c) || !Number.isFinite(s.w) || !Array.isArray(s.p)) return null;
  if (s.p.length < 2 || s.p.length % 2 || s.p.length > 40000 || !s.p.every(Number.isFinite)) return null;
  return { t: s.t, c: s.c.toLowerCase(), w: Math.min(200, Math.max(1, s.w)), p: s.p };
}

export function parseDoc(raw) {
  const doc = { fmt: '4:5', bg: 'white', strokes: [] };
  let o;
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return doc; }
  if (!o || typeof o !== 'object') return doc;
  if (FORMATS[o.fmt]) doc.fmt = o.fmt;
  if (BGS[o.bg]) doc.bg = o.bg;
  if (Array.isArray(o.strokes)) {
    for (const s of o.strokes.slice(-5000)) {
      const c = cleanStroke(s);
      if (c) doc.strokes.push(c);
    }
  }
  return doc;
}

export function serializeDoc(doc) {
  return JSON.stringify({ v: 1, fmt: doc.fmt, bg: doc.bg, strokes: doc.strokes });
}

export const round1 = (v) => Math.round(v * 10) / 10;
