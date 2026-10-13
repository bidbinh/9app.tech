// Tiện ích dựng giao diện (không thư viện). KHÔNG dùng innerHTML với dữ liệu người dùng.
import { dinhDangSo } from '../lib/text.js';
import { docTien } from '../lib/spend.js';

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
  return el;
}
const S = (d, w = 24) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON = {
  home: S('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  salary: S('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>'),
  wallet: S('<path d="M4 7a2 2 0 0 1 2-2h11v4"/><path d="M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>'),
  target: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  more: S('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  mic: S('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 26),
  tax: S('<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M10 13h6M10 17h4"/>', 22),
  calendar: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', 22),
  shield: S('<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="m9 12 2 2 4-4"/>', 22),
  book: S('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>', 22),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>', 22),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 20),
  edit: S('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 20),
};

// ---------- Định dạng tiền ----------
export const so = (n) => dinhDangSo(Math.round(+n || 0), 0);
export const dong = (n) => `${so(n)} đ`;
export const dongDau = (n) => (n < 0 ? `-${so(Math.abs(n))} đ` : `${so(n)} đ`);
/** 12.500.000 -> "12,5 triệu". */
export function trieu(n) {
  const v = Math.abs(+n || 0);
  const dau = n < 0 ? '-' : '';
  if (v >= 1e9) return `${dau}${dinhDangSo(v / 1e9, 2)} tỷ`;
  if (v >= 1e6) return `${dau}${dinhDangSo(v / 1e6, 2)} triệu`;
  if (v >= 1e3) return `${dau}${dinhDangSo(v / 1e3, 0)} nghìn`;
  return `${dau}${so(v)} đ`;
}
export const phanTram = (x, n = 1) => `${dinhDangSo(Math.round(x * 100 * 10 ** n) / 10 ** n, n)}%`;

let dem = 0;
export const idMoi = (p = 'f') => `${p}${++dem}`;

export function truong(nhan, control, ghiChu) {
  const id = control.id || (control.id = idMoi());
  return h('div', { class: 'field' }, h('label', { for: id }, nhan), control, ghiChu ? h('div', { class: 'hint' }, ghiChu) : null);
}

/**
 * Ô nhập tiền. Hiểu "15000000", "15.000.000", "15tr", "12 triệu 5", "45k". Hiện dòng xác nhận bên dưới khi người dùng gõ chữ tắt.
 * macDinh: số trần nhỏ hơn 1000 được nhân (1000: nghìn, 1e6: triệu, 1: giữ nguyên).
 */
export function oTien({ nhan, value = 0, macDinh = 1, onDoi, ghiChu, id, placeholder = '0', toiDa = 1e12 }) {
  const input = h('input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
    id: id || idMoi('t'), placeholder, value: value ? so(value) : '',
  });
  const hint = h('div', { class: 'hint', 'aria-live': 'polite' }, ghiChu || '');
  let giaTri = value || 0;
  const lay = () => giaTri;
  const dat = (v, { im = false } = {}) => { giaTri = Math.max(0, Math.round(+v || 0)); input.value = giaTri ? so(giaTri) : ''; capNhatHint(true); if (!im && onDoi) onDoi(giaTri); };
  function capNhatHint(chuan) {
    input.removeAttribute('aria-invalid');
    hint.className = 'hint';
    const t = input.value.trim();
    if (!t) { hint.textContent = ghiChu || ''; return; }
    if (Number.isNaN(giaTri) || (giaTri > toiDa)) { hint.textContent = giaTri > toiDa ? 'Số này quá lớn.' : 'Chưa hiểu số này. Ví dụ: 15000000 hoặc 15tr.'; hint.className = 'hint err'; input.setAttribute('aria-invalid', 'true'); return; }
    hint.textContent = chuan && !/[a-zA-Z]/.test(t) ? (ghiChu || '') : `= ${dong(giaTri)}${ghiChu ? ' · ' + ghiChu : ''}`;
  }
  input.addEventListener('input', () => {
    const t = input.value;
    if (/^[\d.\s]*$/.test(t) && t.replace(/\D/g, '')) { // chỉ có chữ số: tự thêm dấu chấm nghìn khi gõ
      const d = t.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      input.value = so(+d);
      giaTri = +d;
    } else if (!t.trim()) giaTri = 0;
    else giaTri = docTien(t, macDinh);
    capNhatHint(false);
    if (onDoi && !Number.isNaN(giaTri)) onDoi(giaTri);
  });
  input.addEventListener('blur', () => { if (!Number.isNaN(giaTri) && input.value.trim()) { input.value = giaTri ? so(giaTri) : ''; capNhatHint(true); } });
  capNhatHint(true);
  return { el: h('div', { class: 'field' }, nhan ? h('label', { for: input.id }, nhan) : null, input, hint), input, lay, dat };
}

/** Ô số nguyên có nút trừ/cộng (người phụ thuộc, tháng...). */
export function boDem({ nhan, value = 0, min = 0, max = 20, onDoi, donVi = '' }) {
  let v = value;
  const out = h('output', { 'aria-live': 'polite' }, String(v));
  const tru = h('button', { type: 'button', 'aria-label': `Giảm ${nhan}` }, '−');
  const cong = h('button', { type: 'button', 'aria-label': `Tăng ${nhan}` }, '+');
  const dat = (x, im) => { v = Math.min(max, Math.max(min, x)); out.textContent = String(v); tru.disabled = v <= min; cong.disabled = v >= max; if (!im && onDoi) onDoi(v); };
  tru.addEventListener('click', () => dat(v - 1));
  cong.addEventListener('click', () => dat(v + 1));
  dat(value, true);
  return { el: h('div', { class: 'field' }, h('span', { class: 'lbl' }, nhan), h('div', { class: 'stepper', role: 'group', 'aria-label': nhan }, tru, out, cong, donVi ? h('span', { class: 'muted' }, donVi) : null)), lay: () => v, dat };
}

/** Thanh phân đoạn. opts: [{id, nhan}] */
export function phanDoan(opts, hien, onChon, nhanAria) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': nhanAria || 'Chọn' });
  const nut = {};
  const ve = (id) => { for (const [k, b] of Object.entries(nut)) b.setAttribute('aria-pressed', String(k === id)); };
  for (const o of opts) {
    nut[o.id] = h('button', { type: 'button', onclick: () => { ve(o.id); onChon(o.id); } }, o.nhan);
    wrap.append(nut[o.id]);
  }
  ve(hien);
  return { el: wrap, dat: ve };
}

export function thanhTienDo(tyLe, mucDo = '') {
  const i = h('i');
  i.style.width = `${Math.max(0, Math.min(100, tyLe * 100))}%`;
  return h('div', { class: `bar ${mucDo}`, role: 'presentation' }, i);
}

// ---------- Thông báo nổi có Hoàn tác ----------
let hopToast = null;
export function xoaThongBao() { if (hopToast) hopToast.replaceChildren(); }
export function thongBao(text, { hoanTac, nhan = 'Hoàn tác', ms = 6000 } = {}) {
  if (!hopToast) { hopToast = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(hopToast); }
  hopToast.replaceChildren(); // chỉ giữ một thông báo, không để chồng che nội dung
  const t = h('div', { class: 'toast' }, h('span', {}, text));
  let xong = false;
  const dong_ = () => { if (!xong) { xong = true; t.remove(); } };
  if (hoanTac) t.append(h('button', { type: 'button', onclick: () => { hoanTac(); dong_(); } }, nhan));
  hopToast.append(t);
  setTimeout(dong_, ms);
  return dong_;
}

// ---------- Hộp thoại ----------
/** Mở hộp thoại tự dựng. noiDung(dong) trả về phần tử; nút bấm gọi dong(). */
export function moHopThoai(tieuDe, noiDung, { onDong } = {}) {
  const dlg = h('dialog', { 'aria-labelledby': 'dlg-t' });
  const dong_ = () => { try { dlg.close(); } catch { /* đã đóng */ } };
  dlg.append(h('h2', { id: 'dlg-t' }, tieuDe), noiDung(dong_));
  dlg.addEventListener('close', () => { dlg.remove(); if (onDong) onDong(); });
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  return dong_;
}
export function xacNhan(tieuDe, noiDung, { ok = 'Đồng ý', huy = 'Hủy', nguyHiem = false } = {}) {
  return new Promise((resolve) => {
    let kq = false;
    moHopThoai(tieuDe, (dong_) => h('div', { class: 'stack' },
      h('p', {}, noiDung),
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => dong_() }, huy),
        h('button', { type: 'button', class: `btn ${nguyHiem ? 'danger' : 'primary'}`, onclick: () => { kq = true; dong_(); } }, ok))), { onDong: () => resolve(kq) });
  });
}

/** Tải một chuỗi về máy dưới dạng tệp. */
export function taiVe(tenTep, noiDung, kieu) {
  const blob = new Blob([noiDung], { type: kieu });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: tenTep });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}

export function trong(tieuDe, mo) { return h('div', { class: 'empty' }, h('b', {}, tieuDe), mo); }
