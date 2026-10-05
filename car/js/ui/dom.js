// Tiện ích dựng giao diện. Không dùng innerHTML với dữ liệu người dùng.
const NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'string') { // CSP chặt: gán qua CSSOM, không dùng thuộc tính style
      for (const decl of v.split(';')) { const i = decl.indexOf(':'); if (i > 0) el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim()); }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'readOnly') el[k] = !!v;
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

// ---- Biểu tượng (đường nét 24x24)
const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  car: 'M5 16l1.5-5.2A2 2 0 0 1 8.4 9.4h7.2a2 2 0 0 1 1.9 1.4L19 16M3.5 16h17v3h-17zM7 19v1.5M17 19v1.5M7.5 13h.01M16.5 13h.01',
  bike: 'M5.5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18.5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 17l-3-5h5l2-4h2M9 12L5.5 15',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
  chart: 'M4 20V9M10 20V4M16 20v-8M22 20H2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 8H4c0-1 2-2 2-8zM10 20a2 2 0 0 0 4 0',
  fuel: 'M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M3 20h12M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 0 3 0V8l-3-3M6 7h6',
  bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  down: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  up: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  map: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chev: 'M9 6l6 6-6 6',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  speed: 'M12 20a8 8 0 1 1 8-8M12 12l4-4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
};
export function icon(ten, cls = '') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', `icon ${cls}`.trim()); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', P[ten] || P.more);
  s.append(p);
  return s;
}

let dem = 0;
export const idMoi = (p = 'f') => `${p}${++dem}`;

/** Nhóm nhãn + control + gợi ý + lỗi (gắn aria-describedby). */
export function truong(nhan, control, goiY, id) {
  const cid = control.id || (control.id = id || idMoi());
  const hid = goiY ? `${cid}-g` : null;
  if (hid) control.setAttribute('aria-describedby', hid);
  return h('div', { class: 'field' },
    h('label', { for: cid }, nhan),
    control,
    goiY ? h('div', { class: 'hint', id: hid }, goiY) : null);
}
export function baoLoi(fieldEl, msg) {
  const c = fieldEl.querySelector('input,select,textarea');
  fieldEl.querySelector('.err')?.remove();
  if (c) c.removeAttribute('aria-invalid');
  if (!msg) return;
  const e = h('div', { class: 'err', role: 'alert' }, msg);
  fieldEl.append(e);
  if (c) c.setAttribute('aria-invalid', 'true');
}

// ---- Thông báo (có Hoàn tác)
export function toast(msg, { hoanTac, ms = 6000 } = {}) {
  const vung = document.getElementById('toast-vung');
  if (!vung) return;
  vung.replaceChildren(); // chỉ giữ một thông báo để Hoàn tác không bị nhầm
  const el = h('div', { class: 'toast' }, h('span', {}, msg));
  let xong = false;
  const dong = () => { if (!xong) { xong = true; el.remove(); } };
  if (hoanTac) el.append(h('button', { type: 'button', onclick: async () => { dong(); await hoanTac(); } }, 'Hoàn tác'));
  vung.append(el);
  setTimeout(dong, ms);
}

// ---- Hộp thoại xác nhận (không dùng confirm của trình duyệt)
export function hoi({ tieuDe, noiDung, ok = 'Đồng ý', huy = 'Hủy', nguyHiem = false }) {
  return new Promise((res) => {
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-t' });
    const xong = (v) => { dlg.close(); dlg.remove(); res(v); };
    dlg.append(
      h('h2', { id: 'dlg-t' }, tieuDe),
      h('p', {}, noiDung),
      h('div', { class: 'row' },
        h('button', { class: 'btn line', type: 'button', onclick: () => xong(false) }, huy),
        h('button', { class: `btn ${nguyHiem ? 'bad' : ''}`, type: 'button', onclick: () => xong(true) }, ok)));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); xong(false); });
    document.body.append(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    dlg.querySelector('.btn.line')?.focus();
  });
}

// ---- Trạng thái xanh/vàng/đỏ: luôn kèm hình và chữ
const HINH = { do: 'alert', vang: 'clock', xanh: 'check', xam: 'cal' };
export function the(mau, nhan) {
  return h('span', { class: `tag ${mau}` }, icon(HINH[mau]), nhan);
}

export function trong(bieuTuong, tieuDe, noiDung, ...nut) {
  return h('div', { class: 'empty' },
    h('div', { class: 'big' }, icon(bieuTuong)),
    h('h2', {}, tieuDe), h('p', {}, noiDung),
    nut.length ? h('div', { class: 'row', style: 'justify-content:center;margin-top:14px;flex-wrap:wrap' }, nut) : null);
}

export function taiTep(ten, noiDung, mime) {
  const blob = new Blob([noiDung], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: ten });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Nén ảnh người dùng chọn xuống tối đa 480 px, JPEG, trả về data URL. */
export async function nenAnh(file, canh = 480, chatLuong = 0.72) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Tệp không phải ảnh.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Không đọc được ảnh.')); i.src = url; });
    const tl = Math.min(1, canh / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * tl)); c.height = Math.max(1, Math.round(img.naturalHeight * tl));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', chatLuong);
  } finally { URL.revokeObjectURL(url); }
}
