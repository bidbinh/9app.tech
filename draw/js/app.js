// 9draw: vẽ tay, lưu ảnh, chia sẻ. Mọi thứ chạy trên máy; bản vẽ tự lưu trong trình duyệt.
import { makeMagic } from './lib/magic.js';
import { W, FORMATS, BGS, drawBackground, drawStroke, drawSeg, drawTail, replay, parseDoc, serializeDoc, round1 } from './lib/engine.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), page = $('page');
const bgC = $('c-bg'), ink = $('c-ink'), live = $('c-live');
const inkX = ink.getContext('2d'), liveX = live.getContext('2d'), bgX = bgC.getContext('2d');

const COLORS = ['#1f2937', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e', '#ffffff'];
const COLOR_NAMES = { '#1f2937': 'Đen', '#ef4444': 'Đỏ', '#f97316': 'Cam', '#facc15': 'Vàng', '#22c55e': 'Xanh lá', '#06b6d4': 'Lơ', '#3b82f6': 'Xanh dương', '#8b5cf6': 'Tím', '#ec4899': 'Hồng', '#92400e': 'Nâu', '#ffffff': 'Trắng' };
const TOOL_NAMES = { pen: 'Bút', hl: 'Bút dạ', er: 'Tẩy' };
const KEY_DOC = '9draw:doc:v1', KEY_PREF = '9draw:pref:v1';

// ---------- Lưu trữ (có thể bị chặn: luôn bọc try/catch) ----------
function ls(op, k, v) { try { return op === 'get' ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } }

let doc = parseDoc(ls('get', KEY_DOC));
let redo = [];
const pref = Object.assign({ auto: false, tool: 'pen', color: COLORS[0], sizes: { pen: 8, hl: 36, er: 40 } }, (() => { try { return JSON.parse(ls('get', KEY_PREF)) || {}; } catch { return {}; } })());
pref.auto = pref.auto === true;
if (!TOOL_NAMES[pref.tool]) pref.tool = 'pen';
if (!/^#[0-9a-f]{6}$/i.test(pref.color)) pref.color = COLORS[0];
for (const k of ['pen', 'hl', 'er']) if (!(pref.sizes[k] >= 2 && pref.sizes[k] <= 80)) pref.sizes[k] = { pen: 8, hl: 36, er: 40 }[k];

let saveTimer = 0;
function saveNow() { clearTimeout(saveTimer); saveTimer = 0; ls('set', KEY_DOC, serializeDoc(doc)); ls('set', KEY_PREF, JSON.stringify(pref)); }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); }
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

// ---------- Thông báo nhỏ ----------
let toastT = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- Giấy vẽ và khung nhìn ----------
const view = { s: 1, tx: 0, ty: 0 };
let H = FORMATS[doc.fmt].h, baseX = 0, baseY = 0, fitK = 1;

function applyView() {
  page.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
  $('b-fit').hidden = Math.abs(view.s - 1) < 0.01 && Math.abs(view.tx) < 1 && Math.abs(view.ty) < 1;
  updateSizeDot();
}
function layout() {
  const sw = stage.clientWidth, sh = stage.clientHeight, pad = 12;
  if (sw < 10 || sh < 10) return;
  fitK = Math.min((sw - 2 * pad) / W, (sh - 2 * pad) / H);
  const pw = W * fitK, ph = H * fitK;
  baseX = (sw - pw) / 2; baseY = (sh - ph) / 2;
  page.style.width = pw + 'px'; page.style.height = ph + 'px';
  page.style.left = baseX + 'px'; page.style.top = baseY + 'px';
  applyView();
}
function resetView() { view.s = 1; view.tx = 0; view.ty = 0; applyView(); }

function paintBg() { drawBackground(bgX, doc.bg, W, H); }
function redrawInk() { replay(inkX, doc.strokes, W, H); }
function setPaper(fmt, bg) {
  if (FORMATS[fmt] && fmt !== doc.fmt) {
    doc.fmt = fmt; H = FORMATS[fmt].h;
    for (const c of [bgC, ink, live]) { c.width = W; c.height = H; }
    resetView(); layout(); redrawInk();
  }
  if (BGS[bg]) doc.bg = bg;
  paintBg(); saveSoon();
}

// ---------- Công cụ ----------
function curSize() { return pref.sizes[pref.tool]; }
function updateSizeDot() {
  const d = Math.max(3, Math.min(32, curSize() * fitK * view.s));
  $('size-dot').style.setProperty('--d', d + 'px');
}
function syncTools() {
  for (const b of document.querySelectorAll('.tool')) {
    const on = b.dataset.tool === pref.tool;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  $('size').value = curSize();
  $('size').setAttribute('aria-valuetext', `${TOOL_NAMES[pref.tool]}, cỡ ${curSize()}`);
  syncSwatches();
  updateSizeDot();
}
function syncSwatches() {
  const known = COLORS.includes(pref.color);
  for (const b of $('colors').querySelectorAll('.sw[data-c]')) b.setAttribute('aria-checked', b.dataset.c === pref.color ? 'true' : 'false');
  $('sw-pick').setAttribute('aria-checked', known ? 'false' : 'true');
  $('colors').classList.toggle('dim', pref.tool === 'er');
}
function setTool(t) { pref.tool = t; syncTools(); saveSoon(); }
function setColor(c) {
  pref.color = c.toLowerCase();
  if (pref.tool === 'er') pref.tool = 'pen';
  syncTools(); saveSoon();
}

function buildColors() {
  const box = $('colors');
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw'; b.dataset.c = c; b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', COLOR_NAMES[c]); b.style.background = c;
    b.addEventListener('click', () => setColor(c));
    box.append(b);
  }
  const pick = document.createElement('label');
  pick.className = 'sw sw-pick'; pick.id = 'sw-pick'; pick.setAttribute('role', 'radio'); pick.setAttribute('aria-label', 'Màu tự chọn');
  const inp = document.createElement('input');
  inp.type = 'color'; inp.value = COLORS.includes(pref.color) ? '#ff00aa' : pref.color; inp.setAttribute('aria-label', 'Chọn màu');
  inp.addEventListener('input', () => setColor(inp.value));
  pick.append(inp); box.append(pick);
}

// ---------- Vẽ ----------
const ptrs = new Map();
let mode = null;           // 'draw' | 'nav' | null
let cur = null, curId = -1, nextSeg = 1;
let sawPen = false;        // đã thấy bút cảm ứng: ngón tay chỉ để di chuyển/phóng to (chống tì tay)

function toPage(e) {
  const r = ink.getBoundingClientRect();
  return [round1((e.clientX - r.left) * W / r.width), round1((e.clientY - r.top) * H / r.height)];
}
function pushPoint(e) {
  const [x, y] = toPage(e), p = cur.p, n = p.length;
  if (n >= 2 && Math.hypot(x - p[n - 2], y - p[n - 1]) < 1.5) return;
  p.push(x, y);
  if (cur.t === 'hl') { liveX.clearRect(0, 0, W, H); drawStroke(liveX, cur, 1); return; }
  while (2 * nextSeg + 3 < p.length) { drawSeg(inkX, cur, nextSeg); nextSeg++; }
}
function beginStroke(e) {
  cur = { t: pref.tool, c: pref.color, w: curSize(), p: [] };
  curId = e.pointerId; nextSeg = 1; mode = 'draw';
  live.classList.toggle('hl', cur.t === 'hl');
  const [x, y] = toPage(e);
  cur.p.push(x, y);
  if (cur.t === 'hl') drawStroke(liveX, cur, 1); else drawTail(inkX, cur);   // chấm đầu: thấy ngay khi chạm
}
function endStroke() {
  const s = cur; cur = null; curId = -1;
  liveX.clearRect(0, 0, W, H);
  if (!s) return;
  if (s.t === 'hl') drawStroke(inkX, s);
  else if (s.p.length > 2) drawTail(inkX, s);   // nốt đoạn cuối, khớp với bản dựng lại
  doc.strokes.push(s); redo = [];
  sinceMagic++; lastEnd = s.p.slice(-2);
  syncHistory(); saveSoon();
  if (pref.auto) scheduleAuto();
}
function cancelStroke() {
  if (!cur) return;
  cur = null; curId = -1; liveX.clearRect(0, 0, W, H);
  redrawInk();
}

// Di chuyển / phóng to bằng hai ngón, chuột giữa/phải, con lăn.
let gs = null;
function gestureState() {
  const pts = [...ptrs.values()], r = stage.getBoundingClientRect();
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length - r.left;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length - r.top;
  const d = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  return { cx, cy, d };
}
function zoomAbout(cx, cy, ncx, ncy, k) {
  const ns = Math.min(8, Math.max(0.5, view.s * k));
  const ux = (cx - baseX - view.tx) / view.s, uy = (cy - baseY - view.ty) / view.s;
  view.tx = ncx - baseX - ns * ux; view.ty = ncy - baseY - ns * uy; view.s = ns;
  applyView();
}

stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;   // nút nổi (Vừa khung, Phép màu) không phải nét vẽ
  if (busy) return;                          // đang vẽ hình phép màu
  clearTimeout(autoTimer);
  if (e.pointerType === 'pen') sawPen = true;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { stage.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
  const nav = ptrs.size >= 2 || (e.pointerType === 'touch' && sawPen) || (e.pointerType === 'mouse' && e.button !== 0);
  if (nav) { cancelStroke(); mode = 'nav'; gs = gestureState(); e.preventDefault(); return; }
  if (mode === 'nav') return;
  beginStroke(e);
});
stage.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mode === 'nav') {
    const n = gestureState();
    zoomAbout(gs.cx, gs.cy, n.cx, n.cy, gs.d && n.d ? n.d / gs.d : 1);
    gs = n; return;
  }
  if (mode === 'draw' && e.pointerId === curId && cur) {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const c of (evs && evs.length ? evs : [e])) pushPoint(c);
  }
});
function release(e, cancelled) {
  if (!ptrs.delete(e.pointerId)) return;
  if (mode === 'nav') {
    if (ptrs.size === 0) mode = null; else gs = gestureState();
    return;
  }
  if (mode === 'draw' && e.pointerId === curId) {
    mode = null;
    if (cancelled) cancelStroke(); else endStroke();
  }
}
stage.addEventListener('pointerup', (e) => release(e, false));
stage.addEventListener('pointercancel', (e) => release(e, true));
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  zoomAbout(x, y, x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });
$('b-fit').addEventListener('click', resetView);

// ---------- Lịch sử ----------
function syncHistory() {
  $('b-undo').disabled = doc.strokes.length === 0;
  $('b-redo').disabled = redo.length === 0;
}
function undo() {
  if (cur || busy || !doc.strokes.length) return;
  redo.push(doc.strokes.pop()); redrawInk(); syncHistory(); saveSoon();
}
function redoIt() {
  if (cur || busy || !redo.length) return;
  doc.strokes.push(redo.pop()); redrawInk(); syncHistory(); saveSoon();
}
function clearAll() {
  if (cur || busy) return;
  const last = doc.strokes[doc.strokes.length - 1];
  if (!last || last.t === 'clear') { toast('Giấy đang trống'); return; }
  doc.strokes.push({ t: 'clear' }); redo = [];
  redrawInk(); syncHistory(); saveSoon();
  toast('Đã xóa hết. Bấm Hoàn tác để lấy lại.');
}
$('b-undo').addEventListener('click', undo);
$('b-redo').addEventListener('click', redoIt);
$('b-clear').addEventListener('click', clearAll);

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redoIt() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redoIt(); }
  else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (k === 'b' || k === 'p') setTool('pen');
    else if (k === 'h') setTool('hl');
    else if (k === 'e') setTool('er');
    else if (k === '0') resetView();
  }
});

for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => setTool(b.dataset.tool));
$('size').min = '2'; $('size').max = '80';
$('size').addEventListener('input', (e) => { pref.sizes[pref.tool] = Number(e.target.value); updateSizeDot(); saveSoon(); });

// ---------- Phép màu: tự vẽ thêm hình ngộ nghĩnh ----------
let busy = false, sinceMagic = 0, lastMagic = 0, lastEnd = null, autoTimer = 0;
const magicBtn = $('b-magic');
function setBusy(v) { busy = v; magicBtn.disabled = v; magicBtn.classList.toggle('busy', v); }
function runMagic(light) {
  if (cur || busy) return;
  const res = makeMagic(doc.strokes, { W, H, bg: doc.bg, seed: (Math.random() * 4294967296) >>> 0, light, focus: lastEnd });
  if (!res.strokes) { if (!light) toast(res.reason === 'trống' ? 'Hãy vẽ gì đó trước, rồi bấm Phép màu nhé!' : 'Giấy đầy rồi, xóa bớt hoặc đổi sang giấy mới nhé'); return; }
  const group = { t: 'magic', s: res.strokes };
  doc.strokes.push(group); redo = []; sinceMagic = 0; lastMagic = Date.now();
  syncHistory(); saveSoon(); toast(res.note);
  const subs = res.strokes, step = Math.max(12, Math.min(70, 2200 / subs.length));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) { redrawInk(); return; }
  setBusy(true);
  let i = 0;
  const tick = () => {
    for (let k = 0; k < (step < 20 ? 2 : 1) && i < subs.length; k++) drawStroke(inkX, subs[i++]);
    if (i < subs.length) setTimeout(tick, step); else { setBusy(false); redrawInk(); }
  };
  tick();
}
function scheduleAuto() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (cur || busy || mode || sinceMagic < 1 || Date.now() - lastMagic < 6000) return;
    runMagic(true);
  }, 2000);
}
magicBtn.addEventListener('click', () => runMagic(false));
const autoBtn = $('auto');
function syncAuto() {
  autoBtn.setAttribute('aria-checked', pref.auto ? 'true' : 'false');
  $('auto-t').textContent = 'Tự thêm hình vui khi tôi dừng tay: ' + (pref.auto ? 'Bật' : 'Tắt');
}
autoBtn.addEventListener('click', () => { pref.auto = !pref.auto; syncAuto(); saveSoon(); });
syncAuto();

// ---------- Hộp thoại ----------
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
}
function chips(boxId, items, get, set) {
  const box = $(boxId);
  const paint = () => { for (const b of box.children) b.setAttribute('aria-checked', b.dataset.k === get() ? 'true' : 'false'); };
  for (const [k, v] of Object.entries(items)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.setAttribute('role', 'radio'); b.textContent = v.ten;
    b.addEventListener('click', () => { set(k); paint(); });
    box.append(b);
  }
  paint();
  return paint;
}
const paintFmts = chips('fmts', FORMATS, () => doc.fmt, (k) => setPaper(k, doc.bg));
const paintBgs = chips('bgs', BGS, () => doc.bg, (k) => setPaper(doc.fmt, k));
$('b-paper').addEventListener('click', () => { paintFmts(); paintBgs(); $('d-paper').showModal(); });

// ---------- Xuất ảnh ----------
let outBlob = null, outUrl = '';
function compose() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  drawBackground(x, doc.bg, W, H);
  x.drawImage(ink, 0, 0);
  return c;
}
const fileName = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `9draw-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
};
async function openOut() {
  if (cur || busy) return;
  const blob = await new Promise((r) => compose().toBlob(r, 'image/png'));
  if (!blob) { toast('Không tạo được ảnh, thử lại'); return; }
  outBlob = blob;
  if (outUrl) URL.revokeObjectURL(outUrl);
  outUrl = URL.createObjectURL(blob);
  $('prev').src = outUrl;
  $('o-copy').hidden = !(navigator.clipboard && window.ClipboardItem);
  $('d-out').showModal();
}
$('d-out').addEventListener('close', () => { $('prev').removeAttribute('src'); if (outUrl) { URL.revokeObjectURL(outUrl); outUrl = ''; } outBlob = null; });
function download() {
  if (!outBlob) return;
  const a = document.createElement('a');
  a.href = outUrl; a.download = fileName();
  document.body.append(a); a.click(); a.remove();
}
$('b-share').addEventListener('click', openOut);
$('o-save').addEventListener('click', () => { download(); toast('Đã lưu ảnh vào máy'); });
$('o-share').addEventListener('click', async () => {
  if (!outBlob) return;
  const file = new File([outBlob], fileName(), { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Hình vẽ từ 9draw' }); }
    catch (err) { if (err && err.name !== 'AbortError') { download(); toast('Máy không chia sẻ được, đã lưu ảnh để bạn đăng'); } }
  } else {
    download(); toast('Trình duyệt chưa hỗ trợ chia sẻ, đã lưu ảnh để bạn đăng');
  }
});
$('o-copy').addEventListener('click', async () => {
  if (!outBlob) return;
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': outBlob })]); toast('Đã sao chép ảnh'); }
  catch { toast('Không sao chép được, hãy dùng Lưu ảnh'); }
});

// ---------- Khởi động ----------
buildColors();
for (const c of [bgC, ink, live]) { c.width = W; c.height = H; }
paintBg(); redrawInk(); syncHistory(); syncTools(); layout();
new ResizeObserver(layout).observe(stage);

// Cho e2e kiểm tra trạng thái (chỉ đọc).
window.__draw = { get doc() { return doc; }, get view() { return view; } };

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
