// 9scanner — điều phối giao diện. Mọi xử lý ảnh chạy trên máy; không có yêu cầu mạng nào ngoài tải tệp của chính ứng dụng.
import { Store, newId, quotaLevel } from './store.js';
import { Camera, cameraErrorMessage } from './camera.js';
import { Cropper } from './cropper.js';
import { importImage, renderPage, autoDetect, sourceCanvas, thumbOf, pickFiles, dropSourceCache, canvasToBlob, makeCanvas, blobToBitmap } from './render.js';
import { FILTERS } from './filters.js';
import { defaultCorners, orderCorners, rotateSigns, quadSize, toPixels } from './geom.js';
import { setJfifDpi } from './jpeg.js';
import { avgConfidence } from './textutil.js';
import { SignPad } from './sign.js';
import { exportPdf, exportJpgs, ocrAll, safeName, shareFiles, downloadBlob, clearExportCache } from './export.js';
import { parseSize, formatSize, MIN_LIMIT_BYTES } from './compress.js';
import { ID_SIZES, SHEETS, mmToPx, cropRect, layoutSheet } from './idlayout.js';
import { buildPdf, pageBox, MM } from './pdf.js';
import { disposeOcr } from './ocr.js';

const $ = (s, r = document) => r.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';

/* ---------------- tiện ích DOM ---------------- */
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function icon(id) {
  const s = document.createElementNS(SVGNS, 'svg');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', '#i-' + id);
  s.append(u);
  return s;
}
let toastTimer;
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const pref = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('9scanner.' + k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('9scanner.' + k, JSON.stringify(v)); } catch (e) { /* bị chặn: bỏ qua */ } },
};

function openModal(build, { center = false } = {}) {
  const m = h('div', { class: 'modal' + (center ? ' center' : '') });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const api = { close() { m.remove(); if (api.onclose) api.onclose(); }, el: sheet };
  m.addEventListener('pointerdown', (e) => { if (e.target === m) api.close(); });
  build(sheet, api);
  m.append(sheet);
  $('#overlay-root').append(m);
  return api;
}
function askText(title, value = '', okLabel = 'Lưu') {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal((sheet, api) => {
      const inp = h('input', { type: 'text', value, maxlength: '60', 'aria-label': title });
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(inp.value.trim() || null); });
      sheet.append(h('h2', { text: title }), inp,
        h('div', { class: 'actions' },
          h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(null) }),
          h('button', { class: 'btn primary', text: okLabel, onclick: () => finish(inp.value.trim() || null) })));
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    }, { center: true });
    m.onclose = () => { if (!done) { done = true; resolve(null); } };
  });
}
function confirmDlg(title, msg, okLabel = 'Đồng ý', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal((sheet, api) => {
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      sheet.append(h('h2', { text: title }), h('p', { text: msg }),
        h('div', { class: 'actions' },
          h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(false) }),
          h('button', { class: 'btn primary', text: okLabel, onclick: () => finish(true) })));
    }, { center: true });
    m.onclose = () => { if (!done) { done = true; resolve(false); } };
    void danger;
  });
}
function actionSheet(title, items) {
  openModal((sheet, api) => {
    sheet.append(h('h2', { text: title }));
    for (const it of items) {
      sheet.append(h('button', { class: 'list-btn' + (it.danger ? ' danger' : ''), onclick: () => { api.close(); it.fn(); } }, icon(it.icon || 'file'), it.label));
    }
  });
}

/* ---------------- trạng thái & điều hướng ---------------- */
const S = {
  store: null, doc: null, dirty: new Set(), cur: -1, folder: null, cam: null, shots: 0, multi: false,
  sigs: [], sigImages: new Map(), stack: ['home'], pos: 0, ignorePop: false, token: 0, lastFilter: 'deshadow', signForPage: false,
};
const VIEWS = ['home', 'camera', 'crop', 'filter', 'doc', 'sign', 'id', 'ocr'];
const enter = {};

function show(v) {
  if (S.cam && v !== 'camera') stopCamera();
  for (const n of VIEWS) $('#v-' + n).hidden = n !== v;
  S.view = v;
  if (enter[v]) enter[v]();
}
// Lịch sử: mỗi mục lịch sử của trình duyệt mang {v: tên màn hình, i: vị trí}. S.stack[i] = tên màn hình ở vị trí i, S.pos = vị trí hiện tại.
// Nút Back/Forward của trình duyệt và nút Back của Android đều đi qua popstate.
function navTo(v) {
  if (S.stack[S.pos] === v) { show(v); return; }
  S.stack.length = S.pos + 1; // bỏ các mục "tiến" cũ
  S.stack.push(v); S.pos++;
  history.pushState({ v, i: S.pos }, '');
  show(v);
}
// Quay về màn hình ngay trước đó (nếu đúng là v) thay vì chồng thêm; nếu không thì đẩy mới.
function navPrev(v) {
  if (S.pos > 0 && S.stack[S.pos - 1] === v) {
    S.ignorePop = true; S.pos--;
    history.back();
    show(v);
  } else navTo(v);
}
function goHome() {
  const n = S.pos;
  S.stack = ['home']; S.pos = 0;
  if (n > 0) { S.ignorePop = true; history.go(-n); }
  show('home');
}
function back() { history.back(); }
window.addEventListener('popstate', (e) => {
  if (S.ignorePop) { S.ignorePop = false; return; }
  const st = e.state;
  if (st && typeof st.i === 'number' && VIEWS.includes(st.v)) { S.pos = st.i; S.stack[S.pos] = st.v; show(st.v); } else { S.pos = 0; S.stack = ['home']; show('home'); }
});

/* ---------------- lưu trữ ---------------- */
let saveTimer;
function markDirty(page) { if (page) S.dirty.add(page.id); saveSoon(); }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveNow(); }, 600); }
let saving = Promise.resolve();
function saveNow() {
  clearTimeout(saveTimer);
  saving = saving.then(async () => {
    const doc = S.doc;
    if (!doc || !S.store) return;
    try {
      if (!doc.pages.length) { await S.store.deleteDoc(doc.id); return; }
      const dirty = new Set(S.dirty); S.dirty.clear();
      try { await S.store.saveDoc(doc, dirty); } catch (err) { for (const id of dirty) S.dirty.add(id); throw err; }
      if (!S.persistAsked) { S.persistAsked = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* bỏ qua */ } }
    } catch (e) {
      const full = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
      toast(full ? 'Bộ nhớ trên máy đã đầy. Hãy xóa bớt tài liệu cũ hoặc xuất PDF rồi xóa.' : 'Không lưu được tài liệu vào máy. Hãy xuất PDF để giữ lại.', 5000);
    }
  });
  return saving;
}
function defaultDocName() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `Quét ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function ensureDoc() {
  if (!S.doc) S.doc = { id: newId(), name: defaultDocName(), folder: S.folder || '', created: Date.now(), pages: [] };
  return S.doc;
}
const curPage = () => (S.doc && S.doc.pages[S.cur]) || null;

/* ---------------- thêm trang ---------------- */
async function addPage(input) {
  const doc = ensureDoc();
  const imp = await importImage(input);
  const page = { id: newId(), src: imp.blob, srcW: imp.w, srcH: imp.h, corners: defaultCorners(), filter: S.lastFilter, rot: 0, signs: [], ocr: null, found: false };
  const d = await autoDetect(page);
  page.corners = d.corners; page.found = d.found;
  doc.pages.push(page);
  markDirty(page);
  return doc.pages.length - 1;
}
async function addFiles(files) {
  if (!files.length) return;
  let last = -1, ok = 0;
  for (let i = 0; i < files.length; i++) {
    toast(files.length > 1 ? `Đang xử lý ảnh ${i + 1}/${files.length}…` : 'Đang nhận khung tài liệu…', 60000);
    try { last = await addPage(files[i]); ok++; } catch (e) { toast('Không đọc được một ảnh (định dạng không hỗ trợ).', 4000); }
  }
  $('#toast').hidden = true;
  if (!ok) return;
  S.cur = last;
  if (files.length === 1) openCrop(); else { toast(`Đã thêm ${ok} trang`); navTo('doc'); }
}

/* ---------------- kho ---------------- */
const urls = [];
function blobUrl(b) { const u = URL.createObjectURL(b); urls.push(u); return u; }
function revokeUrls() { while (urls.length) URL.revokeObjectURL(urls.pop()); }

async function refreshHome() {
  try { await refreshHomeInner(); } catch (e) { toast('Không đọc được kho tài liệu của trình duyệt. Hãy tải lại trang.', 5000); }
}
async function refreshHomeInner() {
  const docsEl = $('#doc-list');
  revokeUrls();
  const all = await S.store.listDocs();
  const folders = await S.store.listFolders();
  const fe = $('#folders');
  fe.textContent = '';
  const chip = (label, val, ico) => h('button', { class: 'fchip' + (S.folder === val ? ' on' : ''), role: 'tab', 'aria-selected': S.folder === val ? 'true' : 'false', onclick: () => { S.folder = val; refreshHome(); } }, ico ? icon(ico) : null, label);
  fe.append(chip('Tất cả', null));
  for (const f of folders) fe.append(chip(f, f, 'folder'));
  fe.append(h('button', { class: 'fchip', 'aria-label': 'Thêm thư mục', onclick: addFolder }, icon('plus'), 'Thư mục'));
  const docs = all.filter((d) => S.folder == null || d.folder === S.folder);
  docsEl.textContent = '';
  for (const d of docs) {
    const th = h('div', { class: 'th' });
    if (d.thumb) th.style.backgroundImage = `url(${blobUrl(d.thumb)})`;
    const when = new Date(d.updated).toLocaleDateString('vi-VN');
    docsEl.append(h('li', { class: 'doc', onclick: () => openDoc(d.id), dataset: { id: d.id } },
      th,
      h('div', { class: 'info' }, h('div', { class: 'nm', text: d.name }), h('div', { class: 'meta', text: `${d.count} trang · ${formatSize(d.bytes || 0)} · ${when}${d.folder ? ' · ' + d.folder : ''}` })),
      h('button', { class: 'icon-btn more', 'aria-label': 'Tùy chọn tài liệu ' + d.name, onclick: (e) => { e.stopPropagation(); docMenu(d, folders); } }, icon('more'))));
  }
  $('#empty-home').hidden = all.length > 0;
  await refreshUsage();
}
async function refreshUsage() {
  const u = await S.store.usage();
  const line = $('#usage-line'), banner = $('#storage-banner');
  const lvl = quotaLevel(u.usageAll, u.quota);
  line.textContent = `Đã dùng ${formatSize(u.used)} trong kho tài liệu` + (u.quota ? ` (trình duyệt cho phép khoảng ${formatSize(u.quota)})` : '');
  banner.className = 'banner'; banner.hidden = true;
  if (!S.store.persistent) {
    banner.hidden = false;
    banner.textContent = 'Trình duyệt đang chặn lưu trữ, nên tài liệu chỉ giữ trong phiên này. Hãy xuất PDF để không mất.';
  } else if (lvl === 'warn' || lvl === 'full') {
    banner.hidden = false;
    banner.className = 'banner' + (lvl === 'full' ? ' full' : '');
    banner.textContent = lvl === 'full' ? 'Bộ nhớ của trình duyệt gần đầy. Hãy xuất PDF cần giữ rồi xóa bớt tài liệu cũ.' : 'Bộ nhớ của trình duyệt đã dùng trên 70%. Nên dọn bớt tài liệu cũ.';
  }
}
async function addFolder() {
  const n = await askText('Tên thư mục mới', '', 'Tạo');
  if (!n) return;
  await S.store.addFolder(n);
  S.folder = n.slice(0, 40);
  refreshHome();
}
function docMenu(d, folders) {
  actionSheet(d.name, [
    { label: 'Đổi tên', icon: 'pen', fn: async () => { const n = await askText('Tên tài liệu', d.name); if (n) { await S.store.renameDoc(d.id, n); refreshHome(); } } },
    { label: 'Chuyển thư mục', icon: 'folder', fn: () => moveToFolder(d, folders) },
    { label: 'Xóa tài liệu', icon: 'trash', danger: true, fn: async () => { if (await confirmDlg('Xóa tài liệu?', `“${d.name}” (${d.count} trang) sẽ bị xóa khỏi máy này.`, 'Xóa', true)) { await S.store.deleteDoc(d.id); if (S.doc && S.doc.id === d.id) S.doc = null; refreshHome(); toast('Đã xóa'); } } },
  ]);
}
function moveToFolder(d, folders) {
  openModal((sheet, api) => {
    sheet.append(h('h2', { text: 'Chuyển vào thư mục' }));
    const mv = async (f) => { api.close(); await S.store.renameDoc(d.id, undefined, f); refreshHome(); };
    sheet.append(h('button', { class: 'list-btn', onclick: () => mv('') }, icon('file'), 'Không thư mục'));
    for (const f of folders) sheet.append(h('button', { class: 'list-btn', onclick: () => mv(f) }, icon('folder'), f));
    sheet.append(h('button', { class: 'list-btn', onclick: async () => { api.close(); const n = await askText('Tên thư mục mới', '', 'Tạo'); if (n) { await S.store.addFolder(n); await S.store.renameDoc(d.id, undefined, n.slice(0, 40)); refreshHome(); } } }, icon('plus'), 'Thư mục mới…'));
  });
}
async function openDoc(id) {
  await saveNow();
  const d = await S.store.getDoc(id);
  if (!d) { toast('Không tìm thấy tài liệu'); refreshHome(); return; }
  S.doc = d; S.dirty = new Set(); S.cur = -1;
  navTo('doc');
}
enter.home = async () => {
  await saveNow();
  S.doc = null; S.cur = -1; S.dirty.clear(); S.shots = 0;
  refreshHome();
};

/* ---------------- camera ---------------- */
async function startCamera() {
  const video = $('#cam-video'), msg = $('#cam-msg');
  msg.hidden = true;
  $('#cam-shutter').disabled = false;
  if (!Camera.supported) { $('#cam-msg-text').textContent = cameraErrorMessage(null); msg.hidden = false; $('#cam-shutter').disabled = true; return; }
  const cam = new Camera(video);
  S.cam = cam;
  try {
    await cam.start(S.facing || 'environment');
    if (S.cam !== cam) { cam.stop(); return; } // đã rời màn hình camera trong lúc khởi động
    $('#cam-torch').hidden = !cam.hasTorch;
    $('#cam-torch').classList.remove('on');
    cam.onended = () => {
      if (S.cam !== cam || S.view !== 'camera') return;
      // camera bị ngắt (quyền bị thu hồi, ứng dụng khác chiếm): thử mở lại một lần
      stopCamera();
      $('#cam-msg-text').textContent = 'Camera vừa bị ngắt. Đang thử mở lại…'; $('#cam-msg').hidden = false;
      setTimeout(() => { if (S.view === 'camera' && !S.cam) startCamera(); }, 700);
    };
  } catch (e) {
    cam.stop();
    if (S.cam !== cam) return;
    S.cam = null;
    $('#cam-msg-text').textContent = cameraErrorMessage(e); msg.hidden = false;
    $('#cam-shutter').disabled = true;
  }
}
function stopCamera() { if (S.cam) { S.cam.stop(); S.cam = null; } }
function startShoot() { S.shots = 0; navTo('camera'); }
enter.camera = () => {
  S.multi = pref.get('multi', false);
  $('#cam-multi').setAttribute('aria-pressed', String(S.multi));
  updateCamCount();
  startCamera();
};
function updateCamCount() {
  $('#cam-done').hidden = !(S.multi && S.shots > 0);
  $('#cam-count').textContent = String(S.shots);
}
async function shutter() {
  if (!S.cam) return;
  let canvas;
  try { canvas = S.cam.capture(); } catch (e) { toast('Camera chưa sẵn sàng, thử lại sau một giây.'); return; }
  const f = h('div', { class: 'flash' });
  $('#v-camera').append(f); setTimeout(() => f.remove(), 300);
  $('#cam-shutter').disabled = true;
  try {
    const idx = await addPage(canvas);
    S.shots++;
    if (S.multi) { updateCamCount(); toast(`Đã chụp trang ${S.shots}`, 1200); } else { S.cur = idx; openCrop(); }
  } catch (e) { toast('Không xử lý được ảnh vừa chụp.'); }
  $('#cam-shutter').disabled = false;
}

/* ---------------- chỉnh góc ---------------- */
let cropper = null;
function openCrop() { navTo('crop'); }
enter.crop = async () => {
  const page = curPage();
  if (!page) { goHome(); return; }
  if (!cropper) cropper = new Cropper($('#crop-stage'), { onChange: () => updateCropHint() });
  const my = ++S.token;
  $('#crop-next').disabled = true;
  const canvas = await sourceCanvas(page, 1400);
  if (my !== S.token || S.view !== 'crop') return;
  cropper.setImage(canvas, page.corners);
  $('#crop-next').disabled = false;
  $('#crop-ind').textContent = `Trang ${S.cur + 1}/${S.doc.pages.length}`;
  updateCropHint(true);
};
function updateCropHint(initial) {
  const page = curPage(), hint = $('#crop-hint');
  hint.classList.remove('warn');
  if (cropper && !cropper.isValid()) { hint.textContent = 'Bốn góc đang bị chéo nhau, hãy kéo lại cho đúng thứ tự'; hint.classList.add('warn'); return; }
  if (initial && page && !page.found) { hint.textContent = 'Chưa nhận được khung chắc chắn. Hãy kéo 4 chấm tới 4 góc tờ giấy.'; hint.classList.add('warn'); return; }
  hint.textContent = initial && page && page.found ? 'Đã tự nhận khung tài liệu. Kéo chấm nếu cần chỉnh.' : 'Kéo 4 chấm tới 4 góc tờ giấy';
}
function resultAspect(page) {
  const q = quadSize(toPixels(page.corners, page.srcW || 1, page.srcH || 1));
  const a = q.w / (q.h || 1);
  return (page.rot || 0) % 180 === 0 ? a : 1 / a;
}
async function rotateSource(page, deg) {
  const aspect = resultAspect(page);
  const bmp = await blobToBitmap(page.src);
  const w = bmp.width, hh = bmp.height;
  const c = makeCanvas(hh, w);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(bmp, -w / 2, -hh / 2);
  if (bmp.close) bmp.close();
  page.src = await canvasToBlob(c, 'image/jpeg', 0.92);
  page.srcW = c.width; page.srcH = c.height;
  // (x,y) -> (1-y, x) khi xoay 90 độ cùng chiều kim đồng hồ
  const px = page.corners.map((p) => ({ x: (1 - p.y) * c.width, y: p.x * c.height }));
  page.corners = orderCorners(px).map((p) => ({ x: p.x / c.width, y: p.y / c.height }));
  page.thumb = null; page.ocr = null;
  page.signs = rotateSigns(page.signs, deg, aspect); // chữ ký đi theo nội dung trang
  dropSourceCache(page.id);
}
function bindCrop() {
  $('#crop-auto').addEventListener('click', async () => {
    const page = curPage(); if (!page) return;
    toast('Đang nhận khung…', 1500);
    const d = await autoDetect(page);
    page.found = d.found; cropper.setCorners(d.corners); updateCropHint(true);
    if (!d.found) toast('Vẫn chưa chắc chắn, hãy chỉnh tay.');
  });
  $('#crop-full').addEventListener('click', () => { cropper.setCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]); updateCropHint(); });
  $('#crop-rot').addEventListener('click', async () => {
    const page = curPage(); if (!page) return;
    page.corners = cropper.getCorners();
    await rotateSource(page, 90);
    markDirty(page);
    enter.crop();
  });
  $('#crop-next').addEventListener('click', () => {
    const page = curPage(); if (!page) return;
    if (!cropper.isValid()) { toast('Bốn góc chưa tạo thành hình tứ giác. Hãy kéo lại.'); return; }
    page.corners = cropper.getCorners(); page.found = true; page.thumb = null;
    markDirty(page);
    navPrev('filter');
  });
}

/* ---------------- bộ lọc & ký ---------------- */
let renderTok = 0;
function buildChips() {
  const box = $('#filter-chips');
  box.textContent = '';
  for (const f of FILTERS) {
    box.append(h('button', { class: 'chip', role: 'radio', 'aria-checked': 'false', dataset: { f: f.id }, text: f.label, onclick: () => setFilter(f.id) }));
  }
}
function setFilter(id) {
  const page = curPage(); if (!page) return;
  page.filter = id; S.lastFilter = id; page.thumb = null;
  markDirty(page);
  paintChips();
  renderPreview();
}
function paintFilterHint() {
  const page = curPage(), el = $('#filter-hint');
  if (!page || !el) return;
  const f = FILTERS.find((x) => x.id === page.filter);
  el.textContent = f ? f.hint : '';
  el.classList.toggle('warn', false);
  if (page.photoLike && ['magic', 'bw', 'gray'].includes(page.filter)) {
    el.textContent = 'Trang có ảnh hoặc mảng màu lớn: nên dùng “Gốc” hoặc “Khử bóng”. ' + (f ? f.hint : '');
    el.classList.add('warn');
  } else if (['bw', 'gray'].includes(page.filter)) el.classList.add('warn');
}
function paintChips() {
  const page = curPage();
  for (const c of document.querySelectorAll('#filter-chips .chip')) {
    const on = page && c.dataset.f === page.filter;
    c.classList.toggle('on', !!on); c.setAttribute('aria-checked', String(!!on));
  }
}
enter.filter = () => {
  const page = curPage();
  if (!page) { goHome(); return; }
  $('#filter-ind').textContent = `Trang ${S.cur + 1}/${S.doc.pages.length}`;
  paintChips();
  renderPreview();
};
async function renderPreview() {
  const page = curPage(); if (!page) return;
  const my = ++renderTok;
  $('#pv-busy').hidden = false;
  try {
    const canvas = await renderPage(page, { srcEdge: 1400, maxEdge: 1100, noSigns: true, analyze: true });
    if (my !== renderTok || S.view !== 'filter') return;
    page.photoLike = canvas.photoLike;
    paintFilterHint();
    const pv = $('#pv-canvas');
    pv.width = canvas.width; pv.height = canvas.height;
    pv.getContext('2d').drawImage(canvas, 0, 0);
    fitPreview();
    paintSignOverlays();
  } catch (e) { toast('Không dựng được bản xem trước.'); }
  if (my === renderTok) $('#pv-busy').hidden = true;
}
function fitPreview() {
  const pv = $('#pv-canvas'), box = $('#preview'), wrap = $('#pv-wrap');
  const r = box.getBoundingClientRect();
  if (!r.width || !pv.width) return;
  const pad = 16;
  const s = Math.min((r.width - pad * 2) / pv.width, (r.height - pad * 2) / pv.height);
  wrap.style.width = Math.floor(pv.width * s) + 'px';
  wrap.style.height = Math.floor(pv.height * s) + 'px';
}
window.addEventListener('resize', () => { if (S.view === 'filter') { fitPreview(); } });

async function loadSigs() {
  S.sigs = await S.store.listSigs();
  for (const b of S.sigImages.values()) { try { b.close && b.close(); } catch (e) { /* bỏ qua */ } }
  S.sigImages.clear();
  for (const s of S.sigs) {
    try { S.sigImages.set(s.id, await createImageBitmap(s.blob)); } catch (e) { /* bỏ qua chữ ký hỏng */ }
  }
}
const ovUrls = [];
function paintSignOverlays() {
  const page = curPage(), layer = $('#pv-signs');
  layer.textContent = '';
  while (ovUrls.length) URL.revokeObjectURL(ovUrls.pop());
  if (!page) return;
  for (const s of page.signs || []) {
    const sig = S.sigs.find((x) => x.id === s.sigId);
    if (!sig) continue;
    const ou = URL.createObjectURL(sig.blob); ovUrls.push(ou);
    const img = h('img', { alt: 'Chữ ký', src: ou });
    const ov = h('div', { class: 'sign-ov' }, img,
      h('button', { class: 'rm', 'aria-label': 'Xóa chữ ký khỏi trang', onclick: (e) => { e.stopPropagation(); page.signs = page.signs.filter((x) => x !== s); page.thumb = null; markDirty(page); paintSignOverlays(); } }, icon('close')),
      h('button', { class: 'rz', 'aria-label': 'Đổi cỡ chữ ký' }));
    const place = () => {
      const W = layer.clientWidth, H = layer.clientHeight, im = S.sigImages.get(s.sigId);
      const w = s.w * W, hh = im ? w * (im.height / im.width) : w * 0.4;
      Object.assign(ov.style, { width: w + 'px', left: s.cx * W - w / 2 + 'px', top: s.cy * H - hh / 2 + 'px' });
    };
    place();
    let mode = null, sx = 0, sy = 0, o = null;
    ov.addEventListener('pointerdown', (e) => {
      mode = e.target.classList.contains('rz') ? 'rz' : e.target.closest('.rm') ? null : 'mv';
      if (!mode) return;
      ov.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; o = { cx: s.cx, cy: s.cy, w: s.w }; e.preventDefault();
    });
    ov.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const W = layer.clientWidth, H = layer.clientHeight;
      const dx = (e.clientX - sx) / W, dy = (e.clientY - sy) / H;
      if (mode === 'mv') { s.cx = Math.min(1, Math.max(0, o.cx + dx)); s.cy = Math.min(1, Math.max(0, o.cy + dy)); } else { s.w = Math.min(0.9, Math.max(0.06, o.w + dx * 2)); }
      place();
    });
    const end = () => { if (mode) { mode = null; page.thumb = null; markDirty(page); } };
    ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
    layer.append(ov);
  }
}
function insertSignature(sigId) {
  const page = curPage(); if (!page) return;
  page.signs = page.signs || [];
  page.signs.push({ sigId, cx: 0.7, cy: 0.86, w: 0.28 });
  page.thumb = null; markDirty(page);
  paintSignOverlays();
  toast('Kéo chữ ký tới vị trí cần ký, kéo chấm tím để đổi cỡ.', 3600);
}
function openSignPicker() {
  openModal((sheet, api) => {
    sheet.append(h('h2', { text: 'Chèn chữ ký' }));
    if (S.sigs.length) {
      const g = h('div', { class: 'sig-pick' });
      for (const s of S.sigs) g.append(h('button', { 'aria-label': 'Dùng chữ ký này', onclick: () => { api.close(); insertSignature(s.id); } }, h('img', { alt: '', src: blobUrl(s.blob) })));
      sheet.append(g);
    } else sheet.append(h('p', { class: 'hint', text: 'Bạn chưa có chữ ký nào. Hãy vẽ một chữ ký, lần sau dùng lại được.' }));
    sheet.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { api.close(); S.signForPage = true; navTo('sign'); } }, icon('pen'), 'Vẽ chữ ký mới')));
  });
}
async function refreshThumb(page) {
  const canvas = await renderPage(page, { srcEdge: 800, maxEdge: 360, sigImages: S.sigImages });
  page.thumb = await canvasToBlob(canvas, 'image/jpeg', 0.8);
}
function bindFilter() {
  $('#f-rotl').addEventListener('click', () => rotateResult(-90));
  $('#f-rotr').addEventListener('click', () => rotateResult(90));
  $('#f-crop').addEventListener('click', () => navTo('crop'));
  $('#f-sign').addEventListener('click', openSignPicker);
  $('#f-add').addEventListener('click', async () => {
    const page = curPage(); if (page && !page.thumb) { await refreshThumb(page); markDirty(page); }
    startShoot();
  });
  $('#f-done').addEventListener('click', async () => {
    const page = curPage();
    if (page && !page.thumb) { try { await refreshThumb(page); } catch (e) { /* bỏ qua */ } markDirty(page); }
    navPrev('doc');
  });
}
function rotateResult(d) {
  const page = curPage(); if (!page) return;
  page.signs = rotateSigns(page.signs, d, resultAspect(page)); // xoay chữ ký theo trang, không xóa
  page.rot = (((page.rot || 0) + d) % 360 + 360) % 360; page.thumb = null;
  markDirty(page); renderPreview();
}

/* ---------------- màn hình tài liệu ---------------- */
enter.doc = async () => {
  if (!S.doc) { goHome(); return; }
  $('#doc-name-text').textContent = S.doc.name;
  await renderPages();
  saveSoon();
};
async function renderPages() {
  const grid = $('#page-grid');
  revokeUrls();
  grid.textContent = '';
  const doc = S.doc;
  if (!doc) return;
  const n = doc.pages.length;
  doc.pages.forEach((p, i) => {
    const pic = h('button', { class: 'pic', 'aria-label': `Mở trang ${i + 1}`, onclick: () => { S.cur = i; navTo('filter'); } }, h('span', { class: 'no', text: String(i + 1) }));
    if (p.thumb) pic.style.backgroundImage = `url(${blobUrl(p.thumb)})`;
    grid.append(h('li', { class: 'pg', dataset: { id: p.id } }, pic,
      h('div', { class: 'acts' },
        h('button', { 'aria-label': 'Đưa lên trước', disabled: i === 0, onclick: () => movePage(i, -1) }, icon('left')),
        h('button', { class: 'del', 'aria-label': `Xóa trang ${i + 1}`, onclick: () => deletePage(i) }, icon('trash')),
        h('button', { 'aria-label': 'Đưa ra sau', disabled: i === n - 1, onclick: () => movePage(i, 1) }, icon('right')))));
  });
  // sinh ảnh thu nhỏ còn thiếu (lần lượt, không chặn giao diện)
  for (let i = 0; i < doc.pages.length; i++) {
    const p = doc.pages[i];
    if (p.thumb || S.view !== 'doc') continue;
    try { await refreshThumb(p); markDirty(p); } catch (e) { continue; }
    const pic = grid.children[i] && grid.children[i].querySelector('.pic');
    if (pic) pic.style.backgroundImage = `url(${blobUrl(p.thumb)})`;
  }
}
function movePage(i, d) {
  const pages = S.doc.pages, j = i + d;
  if (j < 0 || j >= pages.length) return;
  [pages[i], pages[j]] = [pages[j], pages[i]];
  saveSoon(); renderPages();
}
async function deletePage(i) {
  if (!(await confirmDlg('Xóa trang này?', `Trang ${i + 1} sẽ bị xóa khỏi tài liệu.`, 'Xóa', true))) return;
  const [p] = S.doc.pages.splice(i, 1);
  dropSourceCache(p.id);
  if (!S.doc.pages.length) {
    await saveNow();
    toast('Đã xóa trang cuối, tài liệu trống nên được xóa.');
    goHome();
    return;
  }
  saveSoon(); renderPages();
}

/* ---------------- xuất tệp ---------------- */
function openExportSheet() {
  const doc = S.doc;
  if (!doc || !doc.pages.length) return;
  const P = pref.get('export', {});
  const E = { format: 'pdf', paper: P.paper || 'a4', quality: P.quality || 'normal', limitText: P.limitText || '1 MB', withText: false, result: null, building: false };
  let tok = 0, timer;
  openModal((sheet, api) => {
    const seg = (label, opts, key, after) => {
      const row = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const paint = () => { for (const b of row.children) { const on = b.dataset.v === E[key]; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } };
      for (const [v, t] of opts) row.append(h('button', { role: 'radio', dataset: { v }, text: t, onclick: () => { E[key] = v; paint(); if (after) after(); schedule(); } }));
      paint();
      return row;
    };
    const status = h('div', { class: 'result', 'aria-live': 'polite', text: 'Đang tạo…' });
    const btnShare = h('button', { class: 'btn primary', disabled: true }, icon('share'), 'Chia sẻ');
    const btnDl = h('button', { class: 'btn secondary', disabled: true }, icon('download'), 'Tải về');
    const limitIn = h('input', { type: 'text', value: E.limitText, inputmode: 'text', 'aria-label': 'Giới hạn dung lượng, ví dụ 500 KB hoặc 1 MB' });
    const limitBox = h('div', {},
      h('div', { class: 'limit-row' }, limitIn),
      h('small', { class: 'grp', text: 'KB = 1024 byte, MB = 1024 × 1024 byte. Tệp luôn nhỏ hơn hoặc bằng giới hạn. Dấu chấm ngăn nghìn: 1.500 KB = 1500 KB; số lẻ viết 1,5 MB.' }),
      h('div', { class: 'qchips' }, ...['200 KB', '500 KB', '1 MB', '2 MB', '5 MB'].map((t) => h('button', { class: 'chip', text: t, onclick: () => { limitIn.value = t; E.limitText = t; schedule(); } }))));
    limitIn.addEventListener('input', () => { E.limitText = limitIn.value; schedule(); });
    const ocrCheck = h('input', { type: 'checkbox', id: 'exp-ocr' });
    ocrCheck.addEventListener('change', () => { E.withText = ocrCheck.checked; schedule(); });
    const ocrRow = h('label', { class: 'check', for: 'exp-ocr' }, ocrCheck, h('span', {}, 'PDF tìm và sao chép được chữ', h('small', { text: 'Đọc chữ từng trang bằng OCR tiếng Việt, mất thêm thời gian.' })));
    const paperGrp = h('div', {}, h('div', { class: 'grp', text: 'Khổ giấy' }), seg('Khổ giấy', [['a4', 'A4'], ['fit', 'Giữ tỉ lệ ảnh']], 'paper'));
    const qualGrp = h('div', {}, h('div', { class: 'grp', text: 'Chất lượng' }),
      seg('Chất lượng', [['high', 'Cao'], ['normal', 'Chuẩn'], ['small', 'Nhỏ'], ['limit', 'Giới hạn']], 'quality', () => { limitBox.hidden = E.quality !== 'limit'; }), limitBox);
    limitBox.hidden = E.quality !== 'limit';
    const apply = () => {
      const isText = E.format === 'text';
      paperGrp.hidden = E.format !== 'pdf';
      qualGrp.hidden = isText;
      ocrRow.hidden = E.format !== 'pdf';
      btnShare.lastChild.textContent = isText ? 'Đọc chữ' : 'Chia sẻ';
      btnDl.hidden = isText;
      status.hidden = isText;
      if (isText) { btnShare.disabled = false; }
    };
    sheet.append(h('h2', { text: `Xuất “${doc.name}” (${doc.pages.length} trang)` }),
      h('div', { class: 'grp', text: 'Định dạng' }),
      seg('Định dạng', [['pdf', 'PDF'], ['jpg', 'Ảnh JPG'], ['text', 'Văn bản']], 'format', apply),
      paperGrp, qualGrp, ocrRow, status,
      h('div', { class: 'actions' }, btnDl, btnShare));
    apply();

    let ctl = null;
    async function build() {
      const my = ++tok;
      if (ctl) ctl.abort();
      ctl = new AbortController();
      const signal = ctl.signal;
      E.result = null; btnShare.disabled = true; btnDl.disabled = true;
      if (E.format === 'text') return;
      pref.set('export', { paper: E.paper, quality: E.quality, limitText: E.limitText });
      let limitBytes;
      if (E.quality === 'limit') {
        limitBytes = parseSize(E.limitText);
        if (!limitBytes) { status.className = 'result bad'; status.textContent = 'Hãy nhập giới hạn dung lượng, ví dụ 500 KB hoặc 1,5 MB.'; return; }
        if (limitBytes < MIN_LIMIT_BYTES) { status.className = 'result bad'; status.textContent = 'Giới hạn dưới 5 KB là quá nhỏ cho một trang ảnh. Hãy nhập ít nhất 5 KB.'; return; }
      }
      status.className = 'result'; status.textContent = 'Đang tạo…';
      const progress = (p) => {
        if (my !== tok) return;
        const labels = { render: 'Đang dựng trang', ocr: 'Đang đọc chữ trang', fit: 'Đang thử nén', encode: 'Đang nén trang' };
        status.textContent = p.stage === 'fit' ? `${labels.fit}… (${p.tries})` : `${labels[p.stage] || 'Đang xử lý'} ${Math.min(p.n, p.i + 1)}/${p.n} (${Math.round((Math.min(p.n, p.i + 1) / p.n) * 100)}%)…`;
      };
      try {
        const base = safeName(doc.name);
        let res;
        if (E.format === 'pdf') {
          const r = await exportPdf(doc.pages, { paper: E.paper, quality: E.quality, limitBytes, withText: E.withText, title: doc.name, sigImages: S.sigImages, onProgress: progress, signal });
          res = { files: [{ name: base + '.pdf', blob: r.blob }], size: r.size, info: r.info };
        } else {
          const r = await exportJpgs(doc.pages, { quality: E.quality, limitBytes, baseName: base, sigImages: S.sigImages, onProgress: progress, signal });
          res = { files: r.files, size: r.size, info: r.info };
        }
        if (my !== tok) return;
        if (limitBytes && res.size > limitBytes) {
          status.className = 'result bad';
          status.textContent = `Không nén được xuống dưới ${formatSize(limitBytes)} (nhỏ nhất đạt ${formatSize(res.size)}). Hãy đặt giới hạn lớn hơn hoặc bớt trang.`;
          return;
        }
        E.result = res;
        let msg = `${E.format === 'pdf' ? 'PDF' : doc.pages.length + ' ảnh'}: `;
        status.textContent = '';
        status.append(msg, h('b', { text: formatSize(res.size) }));
        if (limitBytes) {
          const ok = res.size <= limitBytes;
          status.className = 'result ' + (ok ? 'good' : 'bad');
          status.append(ok ? ` (dưới giới hạn ${formatSize(limitBytes)}, chất lượng ${Math.round(res.info.quality * 100)}%)` : ` — chưa xuống được dưới ${formatSize(limitBytes)}. Hãy đặt giới hạn lớn hơn hoặc bớt trang.`);
        } else status.className = 'result good';
        btnShare.disabled = false; btnDl.disabled = false;
      } catch (e) {
        if (my !== tok || (e && e.name === 'AbortError')) return;
        status.className = 'result bad';
        status.textContent = e && /Không tải được bộ đọc chữ/.test(e.message) ? e.message : 'Không tạo được tệp: ' + (e && e.message ? e.message : 'lỗi không rõ');
      }
    }
    function schedule() { clearTimeout(timer); tok++; if (ctl) ctl.abort(); btnShare.disabled = E.format !== 'text'; btnDl.disabled = true; timer = setTimeout(build, 350); }

    btnDl.addEventListener('click', () => {
      if (!E.result) return;
      for (const f of E.result.files) downloadBlob(f.blob, f.name);
      toast('Đã tải về máy');
    });
    btnShare.addEventListener('click', async () => {
      if (E.format === 'text') { api.close(); runOcr(); return; }
      if (!E.result) return;
      const r = await shareFiles(E.result.files, doc.name);
      if (r === 'unsupported') { for (const f of E.result.files) downloadBlob(f.blob, f.name); toast('Thiết bị chưa hỗ trợ chia sẻ trực tiếp, đã tải tệp về máy.', 4200); } else if (r === 'shared') toast('Đã mở chia sẻ');
    });
    api.onclose = () => { clearTimeout(timer); tok++; if (ctl) ctl.abort(); clearExportCache(); };
    if (E.format !== 'text') schedule();
  });
}

/* ---------------- OCR ---------------- */
async function runOcr() {
  if (!S.doc || !S.doc.pages.length) return;
  navTo('ocr');
  if (S.ocrRunning) { toast('Đang đọc chữ, vui lòng chờ.'); return; }
  S.ocrRunning = true;
  const prog = $('#ocr-prog'), bar = $('#ocr-bar'), st = $('#ocr-status'), ta = $('#ocr-text');
  prog.hidden = false; st.textContent = 'Đang chuẩn bị…'; bar.style.width = '0%';
  ta.value = '';
  const n = S.doc.pages.length;
  try {
    const r = await ocrAll(S.doc.pages, (p) => {
      const frac = ((p.page || 0) + (p.raw === 'recognizing text' ? p.progress : 0)) / n;
      bar.style.width = Math.round(frac * 100) + '%';
      st.textContent = `${p.status}${p.raw === 'recognizing text' ? ` — trang ${p.page + 1}/${n}, ${Math.round(p.progress * 100)}%` : '…'}`;
    });
    for (const p of S.doc.pages) markDirty(p);
    ta.value = r.text;
    prog.hidden = true;
    const conf = avgConfidence(S.doc.pages.map((p) => p.ocr));
    const note = $('#ocr-note');
    note.textContent = conf != null && conf < 60 ? `Độ tin cậy thấp (${Math.round(conf)}%). Kiểm tra trang đã xoay đúng chiều (dùng nút Xoay), chụp rõ và đủ sáng rồi đọc lại.` : 'Đọc chữ chạy ngay trên máy. Lần đầu cần tải khoảng 5 MB dữ liệu tiếng Việt, sau đó dùng được khi không có mạng.';
    if (!r.text.trim()) toast('Không đọc được chữ nào. Thử bộ lọc “Đen trắng” hoặc chụp rõ hơn.', 4500);
  } catch (e) {
    st.textContent = e && e.message ? e.message : 'Không đọc được chữ.';
    bar.style.width = '0%';
  } finally { S.ocrRunning = false; }
}
function bindOcr() {
  $('#doc-ocr').addEventListener('click', runOcr);
  $('#ocr-copy').addEventListener('click', async () => {
    const ta = $('#ocr-text');
    try { await navigator.clipboard.writeText(ta.value); toast('Đã sao chép'); } catch (e) { ta.select(); document.execCommand && document.execCommand('copy'); toast('Đã sao chép'); }
  });
  $('#ocr-txt').addEventListener('click', () => downloadBlob(new Blob([$('#ocr-text').value], { type: 'text/plain;charset=utf-8' }), safeName(S.doc ? S.doc.name : 'van-ban') + '.txt'));
  $('#ocr-share').addEventListener('click', async () => {
    const text = $('#ocr-text').value;
    if (!text.trim()) { toast('Chưa có văn bản để chia sẻ'); return; }
    try {
      const f = { name: safeName(S.doc ? S.doc.name : 'van-ban') + '.txt', blob: new Blob([text], { type: 'text/plain' }) };
      const r = await shareFiles([f], 'Văn bản');
      if (r === 'unsupported') {
        if (navigator.share) await navigator.share({ text }); else { downloadBlob(f.blob, f.name); toast('Đã tải tệp văn bản về máy'); }
      }
    } catch (e) { /* người dùng hủy */ }
  });
}

/* ---------------- chữ ký ---------------- */
let pad = null;
enter.sign = async () => {
  if (!pad) {
    pad = new SignPad($('#sign-pad'));
    pad.onChange = () => $('.sign-card').classList.toggle('has', !pad.empty);
  }
  requestAnimationFrame(() => pad.fit());
  await loadSigs();
  paintSigList();
};
function paintSigList() {
  const ul = $('#sig-list'); ul.textContent = '';
  if (!S.sigs.length) { ul.append(h('li', { class: 'hint small', text: 'Chưa có chữ ký nào được lưu.' })); return; }
  for (const s of S.sigs) {
    ul.append(h('li', { class: 'sig-item' }, h('img', { alt: 'Chữ ký đã lưu', src: blobUrl(s.blob) }),
      h('button', { 'aria-label': 'Xóa chữ ký', onclick: async () => { await S.store.deleteSig(s.id); await loadSigs(); paintSigList(); } }, icon('trash'))));
  }
}
function bindSign() {
  $('#sign-undo').addEventListener('click', () => pad && pad.undo());
  $('#sign-clear').addEventListener('click', () => pad && pad.clear());
  for (const b of document.querySelectorAll('#sign-colors .sw')) {
    b.addEventListener('click', () => {
      for (const o of document.querySelectorAll('#sign-colors .sw')) { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', String(o === b)); }
      if (pad) pad.setColor(b.dataset.c);
    });
  }
  $('#sign-save').addEventListener('click', async () => {
    if (!pad || pad.empty) { toast('Hãy vẽ chữ ký trước.'); return; }
    const blob = await pad.toBlob();
    if (!blob) { toast('Hãy vẽ chữ ký trước.'); return; }
    const rec = await S.store.saveSig(blob);
    pad.clear();
    await loadSigs();
    if (S.signForPage && curPage()) {
      S.signForPage = false;
      navPrev('filter');
      insertSignature(rec.id);
    } else { paintSigList(); toast('Đã lưu chữ ký'); }
  });
}

/* ---------------- ảnh thẻ ---------------- */
const ID = { img: null, size: '3x4', sheet: '10x15', zoom: 1, cx: 0, cy: 0, copies: 0 };
function idAspect() { const s = ID_SIZES[ID.size]; return s.w / s.h; }
function buildIdSegs() {
  const mk = (box, map, key, after) => {
    box.textContent = '';
    for (const [k, v] of Object.entries(map)) {
      box.append(h('button', { role: 'radio', dataset: { v: k }, text: v.label, onclick: () => { ID[key] = k; paint(); after(); } }));
    }
    const paint = () => { for (const b of box.children) { const on = b.dataset.v === ID[key]; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } };
    paint();
  };
  mk($('#id-size'), ID_SIZES, 'size', () => { idFrame(); idSheet(); });
  mk($('#id-sheet'), SHEETS, 'sheet', () => { ID.copies = 0; idSheet(); });
}
enter.id = () => { if (!$('#id-size').children.length) buildIdSegs(); };
async function idLoad(file) {
  try {
    const imp = await importImage(file);
    ID.img = imp.canvas; ID.zoom = 1; ID.cx = imp.w / 2; ID.cy = imp.h * 0.45; ID.copies = 0;
    $('#id-zoom').value = '1';
    $('#id-empty').hidden = true; $('#id-work').hidden = false;
    const c = $('#id-img'); c.width = imp.w; c.height = imp.h; c.getContext('2d').drawImage(imp.canvas, 0, 0);
    idFrame(); idSheet();
  } catch (e) { toast('Không đọc được ảnh này.'); }
}
function idRect() { return cropRect(ID.img.width, ID.img.height, idAspect(), ID.zoom, ID.cx, ID.cy); }
function idFrame() {
  if (!ID.img) return;
  const r = idRect(), W = ID.img.width, H = ID.img.height, f = $('#id-frame');
  ID.cx = r.x + r.w / 2; ID.cy = r.y + r.h / 2;
  Object.assign(f.style, { left: (r.x / W) * 100 + '%', top: (r.y / H) * 100 + '%', width: (r.w / W) * 100 + '%', height: (r.h / H) * 100 + '%' });
}
function idPhotoCanvas() {
  const sz = ID_SIZES[ID.size], r = idRect();
  const c = makeCanvas(mmToPx(sz.w), mmToPx(sz.h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(ID.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}
function idSheet() {
  if (!ID.img) return;
  const sz = ID_SIZES[ID.size], sh = SHEETS[ID.sheet];
  const full = layoutSheet(sh, sz, {});
  const slider = $('#id-copies');
  slider.max = String(full.max);
  if (!ID.copies || ID.copies > full.max) ID.copies = full.max;
  slider.value = String(ID.copies);
  const L = layoutSheet(sh, sz, { copies: ID.copies });
  $('#id-copies-label').textContent = `Số ảnh: ${L.count}`;
  const cv = $('#id-sheet-canvas');
  cv.width = mmToPx(sh.w); cv.height = mmToPx(sh.h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  const photo = idPhotoCanvas();
  for (const p of L.positions) {
    const x = mmToPx(p.x), y = mmToPx(p.y), w = mmToPx(L.pw), hh = mmToPx(L.ph);
    ctx.save();
    if (L.rotated) { ctx.translate(x + w, y); ctx.rotate(Math.PI / 2); ctx.drawImage(photo, 0, 0, hh, w); } else ctx.drawImage(photo, x, y, w, hh);
    ctx.restore();
    ctx.strokeStyle = '#c4c4c4'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
  }
}
async function idFiles(kind) {
  const base = `anh-the-${ID.size}`;
  const canvas = $('#id-sheet-canvas');
  const raw = await canvasToBlob(canvas, 'image/jpeg', 0.95);
  // ghi 300 dpi vào JFIF để tiệm in/Word hiểu đúng kích thước vật lý
  const jpg = new Blob([setJfifDpi(new Uint8Array(await raw.arrayBuffer()), 300)], { type: 'image/jpeg' });
  if (kind === 'jpg') return [{ name: base + '.jpg', blob: jpg }];
  const sh = SHEETS[ID.sheet];
  const box = pageBox(canvas.width, canvas.height, { w: sh.w * MM, h: sh.h * MM }, 0);
  const bytes = new Uint8Array(await jpg.arrayBuffer());
  const pdf = buildPdf([{ jpeg: bytes, imgW: canvas.width, imgH: canvas.height, ...box }], { title: 'Ảnh thẻ ' + ID_SIZES[ID.size].label });
  return [{ name: base + '.pdf', blob: new Blob([pdf], { type: 'application/pdf' }) }];
}
function bindId() {
  $('#id-pick').addEventListener('click', async () => { const f = await pickFiles({ multiple: false }); if (f[0]) idLoad(f[0]); });
  $('#id-shoot').addEventListener('click', async () => { const f = await pickFiles({ multiple: false, capture: 'user' }); if (f[0]) idLoad(f[0]); });
  $('#id-other').addEventListener('click', async () => { const f = await pickFiles({ multiple: false }); if (f[0]) idLoad(f[0]); });
  $('#id-zoom').addEventListener('input', (e) => { ID.zoom = parseFloat(e.target.value); idFrame(); idSheet(); });
  $('#id-copies').addEventListener('input', (e) => { ID.copies = parseInt(e.target.value, 10); idSheet(); });
  const stage = $('#id-stage');
  let drag = null;
  stage.addEventListener('pointerdown', (e) => { if (!ID.img) return; stage.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: ID.cx, cy: ID.cy }; });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = ID.img.width / stage.getBoundingClientRect().width;
    ID.cx = drag.cx - (e.clientX - drag.x) * k; ID.cy = drag.cy - (e.clientY - drag.y) * k;
    idFrame();
  });
  const end = () => { if (drag) { drag = null; idSheet(); } };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  $('#id-dl-jpg').addEventListener('click', async () => { for (const f of await idFiles('jpg')) downloadBlob(f.blob, f.name); toast('Đã tải ảnh về máy'); });
  $('#id-dl-pdf').addEventListener('click', async () => { for (const f of await idFiles('pdf')) downloadBlob(f.blob, f.name); toast('Đã tải PDF về máy'); });
  $('#id-share').addEventListener('click', async () => {
    const files = await idFiles('jpg');
    const r = await shareFiles(files, 'Ảnh thẻ');
    if (r === 'unsupported') { downloadBlob(files[0].blob, files[0].name); toast('Thiết bị chưa hỗ trợ chia sẻ trực tiếp, đã tải ảnh về máy.', 4200); }
  });
}

/* ---------------- khởi động ---------------- */
function bindGlobal() {
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => {
    if (S.view === 'doc') { goHome(); return; }
    back();
  });
  $('#btn-shoot').addEventListener('click', () => { S.doc = null; S.cur = -1; startShoot(); });
  $('#btn-pick').addEventListener('click', async () => { S.doc = null; const f = await pickFiles(); addFiles(f); });
  $('#btn-home-sign').addEventListener('click', () => { S.signForPage = false; navTo('sign'); });
  $('#btn-home-id').addEventListener('click', () => navTo('id'));
  $('#cam-close').addEventListener('click', () => { if (S.shots > 0 && S.doc) navPrev('doc'); else back(); });
  $('#cam-shutter').addEventListener('click', shutter);
  $('#cam-done').addEventListener('click', () => { S.cur = S.doc.pages.length - 1; navPrev('doc'); });
  const camPick = async () => { const f = await pickFiles(); if (f.length) { stopCamera(); addFiles(f); } };
  $('#cam-gallery').addEventListener('click', camPick);
  $('#cam-msg-pick').addEventListener('click', camPick);
  $('#cam-multi').addEventListener('click', () => {
    S.multi = !S.multi; pref.set('multi', S.multi);
    $('#cam-multi').setAttribute('aria-pressed', String(S.multi)); updateCamCount();
  });
  $('#cam-flip').addEventListener('click', async () => { S.facing = (S.facing || 'environment') === 'environment' ? 'user' : 'environment'; stopCamera(); startCamera(); });
  $('#cam-torch').addEventListener('click', async () => {
    if (!S.cam) return;
    const ok = await S.cam.setTorch(!S.cam.torchOn);
    $('#cam-torch').classList.toggle('on', ok && S.cam.torchOn);
  });
  $('#doc-add-cam').addEventListener('click', startShoot);
  $('#doc-add-img').addEventListener('click', async () => { const f = await pickFiles(); addFiles(f); });
  $('#doc-export').addEventListener('click', openExportSheet);
  $('#doc-name').addEventListener('click', async () => {
    const n = await askText('Tên tài liệu', S.doc.name);
    if (n) { S.doc.name = n; $('#doc-name-text').textContent = n; saveSoon(); }
  });
  window.addEventListener('pagehide', () => { saveNow(); disposeOcr(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveNow(); if (S.view === 'camera') stopCamera(); } else if (S.view === 'camera' && !S.cam) startCamera();
  });
}

async function init() {
  S.store = await Store.create();
  history.replaceState({ v: 'home', i: 0 }, '');
  bindGlobal(); bindCrop(); bindFilter(); bindOcr(); bindSign(); bindId();
  buildChips();
  try { await loadSigs(); } catch (e) { /* chưa có chữ ký */ }
  show('home');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
window.__scanner = { S, navTo, navPrev, goHome, saveNow }; // phục vụ kiểm thử tự động, không ảnh hưởng người dùng
