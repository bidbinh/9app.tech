// Tiện ích DOM nhỏ. Mọi nội dung người dùng/dữ liệu chèn bằng textContent, không dùng innerHTML cho dữ liệu.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
export function mount(el, ...kids) { clear(el); append(el, kids); }

// Biểu tượng: chuỗi SVG tĩnh do app tự viết (không chứa dữ liệu ngoài).
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  book: '<path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4z"/><path d="M8 4v12"/>',
  test: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  redo: '<path d="M4 12a8 8 0 0114-5l2 2"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 01-14 5l-2-2"/><path d="M4 20v-5h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.5v.01"/>',
  sign: '<path d="M12 2l10 10-10 10L2 12z"/><path d="M8 12h8M13 9l3 3-3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};
export function icon(name, size) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="width:${size || 22}px;height:${size || 22}px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">${ICONS[name] || ''}</svg>`;
  return span;
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

// Hộp thoại dạng sheet. Trả về hàm đóng.
let lastFocus = null;
export function openSheet(content, { zoom = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  lastFocus = document.activeElement;
  const overlay = h('div', { class: 'overlay' + (zoom ? ' zoom' : ''), role: 'dialog', 'aria-modal': 'true' });
  const sheet = zoom ? content : h('div', { class: 'sheet' }, content);
  overlay.append(sheet);
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch { /* bỏ qua */ }
    if (onClose) onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  root.append(overlay);
  const f = overlay.querySelector('button, [href], input, select, textarea');
  if (f) f.focus();
  return close;
}

export function confirmSheet({ title, text, ok = 'Đồng ý', cancel = 'Hủy', danger = false }) {
  return new Promise((resolve) => {
    let close;
    const done = (v) => { resolve(v); close(); };
    close = openSheet([
      h('h2', { text: title }),
      h('p', { class: 'muted', text }),
      h('div', { class: 'btns mt' },
        h('button', { class: 'btn sec', type: 'button', onclick: () => done(false) }, cancel),
        h('button', { class: 'btn' + (danger ? ' danger' : ''), type: 'button', onclick: () => done(true) }, ok)),
    ], { onClose: () => resolve(false) });
  });
}

export function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
export function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
