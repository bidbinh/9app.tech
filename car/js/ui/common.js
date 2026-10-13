// Phần dùng chung giữa các màn hình.
import { h, icon, the } from './dom.js';
import { kho, xeCua, nhatKyCua, tenXe } from '../lib/data.js';
import { homNay } from '../lib/dates.js';
import { trangThai } from '../lib/schedule.js';
import { uocKmNgay } from '../lib/fuel.js';

export const app = { render: () => {}, di: (hash) => { location.hash = hash; } };
export const hom = () => homNay();

export function thamSo(chuoi) {
  const m = {};
  for (const [k, v] of new URLSearchParams(chuoi || '')) m[k] = v;
  return m;
}
export function lienKet(hash, ...kids) { return h('a', { href: hash }, ...kids); }

/** Danh sách mọi mục nhắc kèm xe và trạng thái, gấp nhất trước. */
export function tatCaHen(ngay = hom()) {
  const cacheKm = new Map();
  const kmNgayCua = (xe) => {
    if (!xe) return null;
    if (!cacheKm.has(xe.id)) cacheKm.set(xe.id, uocKmNgay(nhatKyCua(xe.id), xe));
    return cacheKm.get(xe.id);
  };
  return kho.hen.map((hen) => {
    const xe = hen.xeId ? xeCua(hen.xeId) : null;
    return { hen, xe, tt: trangThai(hen, xe, ngay, kmNgayCua(xe)) };
  }).sort((a, b) => a.tt.uuTien - b.tt.uuTien);
}

export function bieuTuongXe(x) { return icon(x && x.loai === 'xemay' ? 'bike' : 'car'); }
export function anhXe(x) {
  return h('span', { class: 'photo' }, x && x.anh ? h('img', { src: x.anh, alt: '' }) : bieuTuongXe(x));
}
export function chonXe(id, { them = '', onDoi } = {}) {
  const sel = h('select', { id: 'chon-xe' }, them ? h('option', { value: '' }, them) : null,
    kho.xe.map((x) => h('option', { value: x.id, selected: x.id === id }, tenXe(x))));
  if (onDoi) sel.addEventListener('change', () => onDoi(sel.value));
  return sel;
}
export function laXeDien(x) { return !!x && (x.nhienLieu === 'dien' || x.nhienLieu === 'hybrid'); }
export function donViNhienLieu(x, loai) { return loai === 'sac' ? 'kWh' : 'lít'; }
export function soKm(n) { return n === null || n === undefined ? '' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

const ICON_HEN = { 'dang-kiem': 'check', tnds: 'shield', 'vat-chat': 'shield', 'phi-duong': 'map', gplx: 'doc', 'tra-gop': 'cal', 'bao-duong': 'wrench', dau: 'fuel', lop: 'car', 'ac-quy': 'bolt', khac: 'bell' };
export const iconHen = (kind) => icon(ICON_HEN[kind] || 'bell');

/** Một dòng mục nhắc (thẻ bấm được). */
export function dongHen({ hen, xe, tt }, { hienXe = true } = {}) {
  return h('a', { class: 'item', href: `#/hen/${hen.id}` },
    h('span', { class: 'ic' }, iconHen(hen.kind)),
    h('span', { class: 'grow' },
      h('div', { class: 't' }, hen.ten),
      h('div', { class: 'd' }, hienXe && xe ? tenXe(xe) : (tt.han ? `Hạn ${tt.han.slice(8, 10)}/${tt.han.slice(5, 7)}/${tt.han.slice(0, 4)}` : '')),
      h('div', { class: 'tagline' }, the(tt.mau, tt.nhan))));
}
