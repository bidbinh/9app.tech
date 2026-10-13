// Tiện ích dựng giao diện. Không dùng innerHTML với dữ liệu người dùng.
import { dinhDangSo } from '../lib/text.js';
import { layCaiDat } from '../lib/kho.js';
import { docOTienNoi, tienBangChu } from '../lib/tien.js';

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
export function xoaCon(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Dựng SVG từ chuỗi tĩnh do app viết (không bao giờ dùng với dữ liệu người dùng). */
export function svg(chuoi, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = chuoi.trim();
  const el = t.content.firstElementChild;
  el.setAttribute('class', `icon ${cls}`.trim());
  el.setAttribute('aria-hidden', 'true');
  return el;
}

let dem = 0;
export const idMoi = (p = 'f') => `${p}${++dem}`;

/** Số tiền hiển thị, tôn trọng chế độ "Ẩn số tiền". */
export function tien(n) {
  if (layCaiDat().anTien) return '••• đ';
  return `${dinhDangSo(Math.round(Number(n) || 0))} đ`;
}

export function truong(nhan, control, ghiChu) {
  if (!control.id) control.id = idMoi();
  return h('div', { class: 'field' }, h('label', { for: control.id }, nhan), control, ghiChu ? h('div', { class: 'hint' }, ghiChu) : null);
}

export function chon(tuyChon, gia, thuocTinh = {}) {
  const sel = h('select', thuocTinh);
  for (const t of tuyChon) {
    if (t.nhom) {
      const g = h('optgroup', { label: t.nhom });
      t.ds.forEach((o) => g.append(h('option', { value: o.v }, o.t)));
      sel.append(g);
    } else sel.append(h('option', { value: t.v }, t.t));
  }
  if (gia !== undefined && gia !== null) sel.value = gia;
  return sel;
}

/** Phân đoạn kiểu nút bấm. muc: [{id, ten}] */
export function phanDoan(muc, hienTai, khiChon, nhan = '') {
  const w = h('div', { class: 'seg', role: 'group', 'aria-label': nhan });
  const nut = muc.map((m) => h('button', {
    type: 'button', 'aria-pressed': m.id === hienTai ? 'true' : 'false', 'data-v': m.id,
    onclick: () => { nut.forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === m.id ? 'true' : 'false')); khiChon(m.id); },
  }, m.ten));
  w.append(...nut);
  return w;
}

/** Tab điều hướng trong màn (dùng role=tablist đơn giản bằng liên kết). */
export function tabLink(muc, hienTai, nhan) {
  const w = h('div', { class: 'seg', role: 'navigation', 'aria-label': nhan });
  muc.forEach((m) => w.append(h('a', { class: 'seg-a', href: m.href, 'aria-current': m.id === hienTai ? 'page' : null, 'data-tab': m.id }, m.ten)));
  return w;
}

/** Hộp thông báo nhỏ có nút hoàn tác. */
export function thongBao(msg, { hoanTac = null, ms = 7000 } = {}) {
  const wrap = document.getElementById('snack');
  if (!wrap) return;
  const el = h('div', { class: 'snack', 'data-t': String(Date.now()) }, h('span', {}, msg));
  const bo = () => { if (el.parentNode) el.remove(); };
  if (hoanTac) el.append(h('button', { type: 'button', onclick: () => { bo(); hoanTac(); } }, 'Hoàn tác'));
  wrap.append(el);
  setTimeout(bo, hoanTac ? Math.max(ms, 8000) : ms);
}

/** Hộp xác nhận. Trả Promise<boolean>. */
export function hoi({ tieuDe, noiDung = '', xacNhan = 'Đồng ý', huy = 'Hủy', nguyHiem = false, phu = '' }) {
  return new Promise((resolve) => {
    const d = h('dialog', { 'aria-labelledby': 'hoi-t' });
    const xong = (v) => { try { d.close(); } catch { /* đã đóng */ } d.remove(); resolve(v); };
    d.append(h('h2', { id: 'hoi-t' }, tieuDe), noiDung ? h('p', {}, noiDung) : null,
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => xong(false) }, huy),
        phu ? h('button', { type: 'button', class: 'btn', 'data-testid': 'hoi-phu', onclick: () => xong('phu') }, phu) : null,
        h('button', { type: 'button', class: `btn ${nguyHiem ? 'danger' : 'primary'}`, 'data-testid': 'hoi-dong-y', onclick: () => xong(true) }, xacNhan)));
    d.addEventListener('cancel', (e) => { e.preventDefault(); xong(false); });
    document.body.append(d);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  });
}

export async function saoChep(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const t = h('textarea', { 'aria-hidden': 'true', class: 'ngoai-man' }, text);
      document.body.append(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch { return false; }
  }
}

/** Ô nhập tiền: nút chọn nhanh, dòng "bằng chữ" để soát số 0. */
export function oTien({ nhan = 'Số tiền', gia = null, onDoi = null, chonNhanh = [100000, 200000, 300000, 500000, 1000000, 2000000] } = {}) {
  const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', placeholder: 'Ví dụ: 500.000 hoặc 1,2tr', id: idMoi('tien') });
  const chu = h('div', { class: 'hint', 'aria-live': 'polite', 'data-testid': 'tien-bang-chu' });
  const lay = () => { const r = docOTienNoi(input.value); return Number.isFinite(r.v) ? r.v : NaN; };
  const capNhat = () => {
    const r = docOTienNoi(input.value);
    if (!input.value.trim()) { chu.textContent = ''; return; }
    if (!Number.isFinite(r.v)) { chu.textContent = 'Chưa đọc được số tiền. Hãy gõ số, ví dụ 500000 hoặc 1,2tr.'; return; }
    chu.textContent = `${r.ngam ? `Hiểu là ${dinhDangSo(r.v)} đ (số nhỏ được tính là nghìn đồng). ` : ''}Bằng chữ: ${tienBangChu(r.v)}.`;
  };
  input.addEventListener('input', () => { capNhat(); onDoi && onDoi(); });
  input.addEventListener('blur', () => { const v = lay(); if (Number.isFinite(v)) { input.value = dinhDangSo(v); capNhat(); } });
  const dat = (v) => { input.value = Number.isFinite(v) && v > 0 ? dinhDangSo(v) : ''; capNhat(); onDoi && onDoi(); };
  if (gia) { input.value = dinhDangSo(gia); capNhat(); } // không gọi onDoi khi khởi tạo (đối tượng trả về chưa tồn tại)
  const chips = h('div', { class: 'chips', 'aria-label': 'Chọn nhanh số tiền' }, chonNhanh.map((v) => h('button', { type: 'button', class: 'chip', onclick: () => dat(v) }, v >= 1e6 ? `${dinhDangSo(v / 1e6)} triệu` : `${dinhDangSo(v / 1e3)} nghìn`)));
  const el = h('div', { class: 'field' }, h('label', { for: input.id }, nhan), input, chu, chips);
  return { el, input, lay, dat };
}

/** Chữ cái đầu cho ảnh đại diện. */
export function chuDau(ten) {
  const t = String(ten || '?').trim().split(/\s+/).pop() || '?';
  return t.charAt(0).toUpperCase();
}

export function trong(tieuDe, noiDung, nut) {
  return h('div', { class: 'card empty' }, h('h3', {}, tieuDe), h('p', {}, noiDung), nut || null);
}

export function tai(ten, noiDung, kieu) {
  const url = URL.createObjectURL(new Blob([noiDung], { type: kieu }));
  const a = h('a', { href: url, download: ten });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Vẽ lại màn hiện tại, giữ vị trí cuộn. */
export const lamLai = () => window.dispatchEvent(new Event('gift:lamlai'));

/** Khi sang màn mới, bỏ các thông báo cũ (giữ thông báo vừa tạo ngay trước khi chuyển màn, vì nó có nút Hoàn tác). */
export function donThongBaoCu(tuoiToiDaMs = 800) {
  const wrap = document.getElementById('snack');
  if (!wrap) return;
  for (const el of [...wrap.children]) if (Date.now() - Number(el.dataset.t || 0) > tuoiToiDaMs) el.remove();
}
