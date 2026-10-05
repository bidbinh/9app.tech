// Tiện ích dựng giao diện, không dùng thư viện. Không dùng innerHTML với dữ liệu người dùng.
import * as db from '../lib/db.js';

// Element.append gốc biến null thành chữ "null"; bỏ qua null, undefined, false để viết điều kiện gọn.
const appendGoc = Element.prototype.append;
Element.prototype.append = function append(...kids) {
  return appendGoc.apply(this, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
};

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export function xoa(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Dựng SVG từ chuỗi tĩnh do app viết (không bao giờ dùng với dữ liệu người dùng). */
export function svg(chuoi, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = chuoi.trim();
  const el = t.content.firstElementChild;
  if (cls) el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  return el;
}

let dem = 0;
export const idMoi = (p = 'f') => `${p}${++dem}`;

export function truong(nhan, control, ghiChu) {
  const id = control.id || (control.id = idMoi());
  return h('div', { class: 'field' }, h('label', { for: id }, nhan), control, ghiChu ? h('div', { class: 'hint' }, ghiChu) : null);
}

export function nutBam(text, onclick, cls = 'btn') { return h('button', { type: 'button', class: cls, onclick }, text); }

/** Hàng chip chọn một. muc: [{v, t}]. */
export function chips(muc, hienTai, khiChon, nhan) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': nhan || null });
  const ve = (v) => { for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(v))); };
  for (const m of muc) {
    wrap.append(h('button', { type: 'button', class: 'chip', 'data-v': m.v, 'aria-pressed': String(String(m.v) === String(hienTai)), onclick: () => { ve(m.v); khiChon(m.v); } }, m.t));
  }
  return wrap;
}

export function tabs(muc, hienTai, khiChon) {
  const wrap = h('div', { class: 'seg', role: 'tablist' });
  for (const m of muc) {
    wrap.append(h('button', { type: 'button', role: 'tab', class: 'seg-b', 'aria-selected': String(m.id === hienTai), 'data-tab': m.id, onclick: () => khiChon(m.id) }, m.ten));
  }
  return wrap;
}

// ---------- Thông báo nhỏ có hoàn tác ----------
let toastEl = null; let toastTimer = 0;
export function toast(text, { hoanTac = null, ms = 5000 } = {}) {
  // Không báo "đã lưu" khi ghi IndexedDB đã thất bại
  if (!db.trangThai.luuBen && /^Đã (lưu|ghi|nhập|thêm)/.test(text)) text = 'Không lưu được vào bộ nhớ của trình duyệt. Hãy xuất sao lưu ngay (Thêm, Dữ liệu).';
  if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', hidden: true }); document.body.append(toastEl); }
  xoa(toastEl);
  toastEl.append(h('span', { class: 'toast-t' }, text));
  if (hoanTac) toastEl.append(h('button', { type: 'button', class: 'toast-b', 'data-testid': 'hoan-tac', onclick: () => { toastEl.hidden = true; clearTimeout(toastTimer); hoanTac(); } }, 'Hoàn tác'));
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

// ---------- Hộp thoại (không dùng confirm của trình duyệt) ----------
function mo(noiDung, { nhan = 'Hộp thoại', dong }) {
  const truocFocus = document.activeElement;
  const nen = h('div', { class: 'modal-bg' });
  const hop = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': nhan, tabindex: '-1' }, noiDung);
  nen.append(hop);
  document.body.append(nen);
  document.body.classList.add('co-modal');
  const dongLai = (kq) => {
    document.removeEventListener('keydown', phim, true);
    nen.remove();
    document.body.classList.remove('co-modal');
    try { truocFocus?.focus?.(); } catch { /* bỏ qua */ }
    dong(kq);
  };
  const phim = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); dongLai(undefined); return; }
    if (e.key === 'Tab') {
      const ds = [...hop.querySelectorAll('button, input, select, textarea, a[href]')].filter((x) => !x.disabled && !x.hidden);
      if (!ds.length) return;
      const dau = ds[0]; const cuoi = ds[ds.length - 1];
      if (e.shiftKey && document.activeElement === dau) { e.preventDefault(); cuoi.focus(); } else if (!e.shiftKey && document.activeElement === cuoi) { e.preventDefault(); dau.focus(); }
    }
  };
  document.addEventListener('keydown', phim, true);
  nen.addEventListener('click', (e) => { if (e.target === nen) dongLai(undefined); });
  setTimeout(() => { const f = hop.querySelector('[autofocus]') || hop.querySelector('input, select, textarea') || hop; try { f.focus(); } catch { /* bỏ qua */ } }, 20);
  return dongLai;
}

/** Hỏi xác nhận. Trả về Promise<boolean>. */
export function hoi(tieuDe, noiDung, { ok = 'Đồng ý', huy = 'Hủy', nguy = false } = {}) {
  return new Promise((xong) => {
    let dong;
    const noi = [
      h('h2', { class: 'modal-h' }, tieuDe),
      noiDung ? h('p', { class: 'modal-p' }, noiDung) : null,
      h('div', { class: 'modal-act' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dong(false) }, huy),
        h('button', { type: 'button', class: 'btn' + (nguy ? ' danger' : ''), 'data-testid': 'hoi-ok', onclick: () => dong(true) }, ok)),
    ];
    dong = mo(noi, { nhan: tieuDe, dong: (kq) => xong(kq === true) });
  });
}

/** Hộp thoại tùy ý: dựng(đóng) trả về các phần tử. */
export function hopThoai(tieuDe, dung) {
  return new Promise((xong) => {
    let dong;
    const dongGoi = (kq) => dong(kq);
    dong = mo([h('h2', { class: 'modal-h' }, tieuDe), ...[].concat(dung(dongGoi))], { nhan: tieuDe, dong: xong });
  });
}

export function taiTep(ten, noiDung, loai) {
  const blob = new Blob([noiDung], { type: loai });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: ten, class: 'offscreen' });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}

export const homNay = () => {
  const d = new Date(Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
