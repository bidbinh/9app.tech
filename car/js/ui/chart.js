// Biểu đồ SVG tự vẽ: cột theo tháng và thanh ngang theo hạng mục. Có aria-label và bảng dữ liệu thay thế.
import { h } from './dom.js';
import { tienGon, dinhDangSo, tien } from '../lib/money.js';
import { nhanThang } from '../lib/dates.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, txt) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (txt !== undefined) e.textContent = txt;
  return e;
};

/** thang: [{ym, tong}] */
export function bieuDoCot(thang) {
  const W = 360; const H = 190; const L = 8; const R = 8; const T = 22; const B = 28;
  const max = Math.max(...thang.map((t) => t.tong), 0);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const tong = thang.reduce((a, t) => a + t.tong, 0);
  svg.setAttribute('aria-label', `Biểu đồ cột chi phí ${thang.length} tháng gần nhất, tổng ${tien(tong)}. Chi tiết trong bảng bên dưới.`);
  if (max <= 0) {
    svg.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'msg' }, 'Chưa có khoản chi nào trong khoảng này'));
    return svg;
  }
  const cw = (W - L - R) / thang.length;
  const bw = Math.min(22, cw * 0.62);
  const ich = H - T - B;
  svg.append(s('line', { x1: L, x2: W - R, y1: T + ich, y2: T + ich, class: 'grid' }));
  const iMax = thang.findIndex((t) => t.tong === max);
  thang.forEach((t, i) => {
    const x = L + i * cw + (cw - bw) / 2;
    const hh = Math.max(t.tong > 0 ? 2 : 0, (t.tong / max) * ich);
    svg.append(s('rect', { x, y: T + ich - hh, width: bw, height: hh, rx: 3, class: i === thang.length - 1 || i === iMax ? 'bar' : 'bar dim' }));
    const nh = nhanThang(t.ym);
    if (thang.length <= 7 || i % 2 === (thang.length - 1) % 2) svg.append(s('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, thang.length <= 7 ? nh : nh.split('/')[0]));
  });
  const tm = thang[iMax];
  svg.append(s('text', { x: Math.min(W - 40, Math.max(40, L + iMax * cw + cw / 2)), y: T - 8, 'text-anchor': 'middle', class: 'val' }, tienGon(tm.tong)));
  const last = thang[thang.length - 1];
  if (last !== tm && last.tong > 0) {
    svg.append(s('text', { x: W - R - 20, y: T + ich - (last.tong / max) * ich - 6, 'text-anchor': 'middle', class: 'val' }, tienGon(last.tong)));
  }
  return svg;
}

export function bangThang(thang) {
  return h('details', {}, h('summary', {}, 'Xem bảng số liệu'),
    h('table', { class: 't' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Tháng'), h('th', { class: 'r' }, 'Chi phí'))),
      h('tbody', {}, thang.map((t) => h('tr', {}, h('td', {}, `${t.ym.slice(5)}/${t.ym.slice(0, 4)}`), h('td', { class: 'r' }, tien(t.tong)))))));
}

/** nhom: [{id, ten, tong}] */
export function thanhNgang(nhom) {
  const tong = nhom.reduce((a, g) => a + g.tong, 0) || 1;
  const max = Math.max(...nhom.map((g) => g.tong), 1);
  return h('div', { role: 'list', 'aria-label': 'Chi phí theo hạng mục' }, nhom.map((g) =>
    h('div', { class: 'hbar', role: 'listitem' },
      h('span', {}, g.ten),
      h('span', { class: 'track', 'aria-hidden': 'true' }, h('span', { class: 'fill', style: `display:block;width:${Math.max(3, (g.tong / max) * 100)}%` })),
      h('span', {}, `${tien(g.tong)} · ${dinhDangSo((g.tong / tong) * 100, 0)}%`))));
}
