// Tiện ích dựng giao diện (không dùng thư viện). Không dùng innerHTML với dữ liệu người dùng.
import { chuanHoaSoChuoi, dinhDangSo, docSo } from '../lib/text.js';

/** h('div', {class:'a', onclick: fn, 'aria-label': 'x'}, 'text', childEl) */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
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

/** Dựng SVG từ chuỗi tĩnh do app viết (không bao giờ dùng với dữ liệu người dùng). */
export function svg(chuoi, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = chuoi.trim();
  const el = t.content.firstElementChild;
  if (cls) el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

let idDem = 0;
export const idMoi = (p = 'f') => `${p}${++idDem}`;

/** Nhóm nhãn + control. */
export function truong(nhan, control, ghiChu) {
  const id = control.id || (control.id = idMoi());
  return h('div', { class: 'field' },
    h('label', { for: id }, nhan),
    control,
    ghiChu ? h('div', { class: 'hint' }, ghiChu) : null);
}

/**
 * Ô nhập số kiểu Việt. lay() trả số hoặc NaN. tien: hiện dòng "bằng chữ" bên dưới.
 */
export function oSo({ nhan, macDinh = '', donVi, docChu = false, placeholder = '', am = false, onDoi, id }) {
  const input = h('input', {
    type: 'text', inputmode: am ? 'text' : 'decimal', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder, value: macDinh === '' ? '' : String(macDinh).replace('.', ','), id: id || idMoi('n'), enterkeyhint: 'done',
  });
  const chu = docChu ? h('div', { class: 'words', 'aria-live': 'polite' }) : null;
  const lay = () => {
    const c = chuanHoaSoChuoi(input.value);
    return c === '' ? NaN : Number(c);
  };
  const capNhatChu = () => {
    if (!chu) return;
    const v = lay();
    chu.textContent = Number.isFinite(v) && v !== 0 ? docSo(v, { donVi: docChu === true ? '' : docChu }) : '';
  };
  input.addEventListener('input', () => { capNhatChu(); onDoi && onDoi(); });
  input.addEventListener('blur', () => {
    const v = lay();
    if (Number.isFinite(v)) input.value = dinhDangSo(v, 8);
  });
  input.addEventListener('focus', () => { setTimeout(() => { try { input.select(); } catch { /* bỏ qua */ } }, 0); });
  capNhatChu();
  const wrap = h('div', { class: 'field' },
    h('label', { for: input.id }, nhan),
    donVi ? h('div', { class: 'with-unit' }, input, h('span', { class: 'unit' }, donVi)) : input,
    chu);
  return { el: wrap, input, lay, dat(v) { input.value = Number.isFinite(v) ? dinhDangSo(v, 8) : ''; capNhatChu(); } };
}

export function chon({ nhan, tuyChon, gia, onDoi, id }) {
  const sel = h('select', { id: id || idMoi('s') });
  for (const t of tuyChon) {
    if (t.nhom) {
      const g = h('optgroup', { label: t.nhom });
      t.ds.forEach((o) => g.append(h('option', { value: o.v }, o.t)));
      sel.append(g);
    } else sel.append(h('option', { value: t.v }, t.t));
  }
  if (gia !== undefined) sel.value = gia;
  if (onDoi) sel.addEventListener('change', onDoi);
  return { el: nhan ? h('div', { class: 'field' }, h('label', { for: sel.id }, nhan), sel) : sel, sel, lay: () => sel.value };
}

export function oNgay({ nhan, gia, onDoi }) {
  const input = h('input', { type: 'date', id: idMoi('d'), value: gia || '', min: '0001-01-01', max: '9999-12-31' });
  if (onDoi) input.addEventListener('input', onDoi);
  return { el: h('div', { class: 'field' }, h('label', { for: input.id }, nhan), input), input, lay: () => input.value };
}

export function nutBam(text, onclick, cls = 'btn') {
  return h('button', { type: 'button', class: cls, onclick }, text);
}

/** Tab phân đoạn. muc: [{id, ten}]. */
export function tabs(muc, hienTai, khiChon) {
  const wrap = h('div', { class: 'seg', role: 'tablist' });
  for (const m of muc) {
    wrap.append(h('button', {
      type: 'button', role: 'tab', class: 'seg-b' + (m.id === hienTai ? ' on' : ''), 'aria-selected': m.id === hienTai ? 'true' : 'false',
      'data-tab': m.id, onclick: () => khiChon(m.id),
    }, m.ten));
  }
  return wrap;
}

/** Khối kết quả. Mỗi hàng: [nhãn, giá trị]. */
export function bangKetQua(hang) {
  const dl = h('dl', { class: 'kv' });
  for (const [k, v, nhan] of hang) {
    dl.append(h('div', { class: 'kv-row' + (nhan === 'lon' ? ' big' : '') }, h('dt', {}, k), h('dd', {}, v)));
  }
  return dl;
}

export function baoLoi(text) { return h('div', { class: 'msg err', role: 'alert' }, text); }
export function ghiChuBox(text, cls = 'note') { return h('div', { class: cls }, text); }

export async function saoChep(text, nut) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    try {
      const t = h('textarea', { class: 'offscreen', 'aria-hidden': 'true' }, text);
      document.body.append(t); t.select(); ok = document.execCommand('copy'); t.remove();
    } catch { ok = false; }
  }
  if (nut) {
    const cu = nut.textContent;
    nut.textContent = ok ? 'Đã chép' : 'Không chép được';
    setTimeout(() => { nut.textContent = cu; }, 1400);
  }
  return ok;
}

/** Ngày hôm nay (theo giờ máy) dạng YYYY-MM-DD. */
export function homNayChuoi() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Chuyển số tiền thành chuỗi "3.250.000 đ". */
export const dong = (n) => `${dinhDangSo(Math.round(n))} đ`;
