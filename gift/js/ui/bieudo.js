// Biểu đồ SVG tự vẽ (không thư viện). Màu lấy từ biến CSS nên đổi theo sáng/tối. Nhãn giá trị ghi trực tiếp cạnh thanh, có bảng số liệu thay thế.
// Dùng thanh ngang để nhãn tiền không chồng nhau và chữ luôn đủ lớn trên điện thoại.
import { tienGon } from '../lib/tien.js';
import { tenSuKien } from '../lib/le.js';
import { layCaiDat } from '../lib/kho.js';

const NS = 'http://www.w3.org/2000/svg';
function e(tag, attrs = {}, text = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== null) el.textContent = text;
  return el;
}
const gon = (n) => (layCaiDat().anTien ? '•••' : tienGon(n));

/** hang: [{nhan, di, den}] -> SVG thanh ngang đôi (đã chi, đã nhận). */
export function bieuDoThanh(hang, moTa) {
  const W = 360; const cao = 70; const H = Math.max(80, hang.length * cao + 8);
  const max = Math.max(1, ...hang.flatMap((x) => [x.di, x.den]));
  const rong = W - 16 - 110; // chừa chỗ cho nhãn giá trị
  const s = e('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${moTa}. ${hang.map((x) => `${x.nhan}: chi ${gon(x.di)}, nhận ${gon(x.den)}`).join('; ')}.` });
  hang.forEach((x, i) => {
    const y0 = 4 + i * cao;
    s.append(e('text', { x: 8, y: y0 + 16, class: 'lab' }, x.nhan));
    [['di', x.di, 'b-di'], ['den', x.den, 'b-den']].forEach(([k, v, cls], j) => {
      const y = y0 + 24 + j * 20;
      const bw = Math.max(v > 0 ? 4 : 0, Math.round((rong * v) / max));
      s.append(e('rect', { x: 8, y, width: bw, height: 14, rx: 4, class: cls, 'data-k': k }));
      s.append(e('text', { x: 8 + bw + 6, y: y + 13, class: 'mut' }, v > 0 ? gon(v) : '0'));
    });
  });
  return s;
}

export const bieuDoNam = (nam) => bieuDoThanh(nam.slice(-6).map((x) => ({ nhan: String(x.nam), di: x.di, den: x.den })), 'Biểu đồ thanh đã chi và đã nhận theo năm');
export const bieuDoSuKien = (ds) => bieuDoThanh(ds.slice(0, 8).map((x) => ({ nhan: tenSuKien(x.suKien), di: x.di, den: x.den })), 'Biểu đồ thanh theo loại sự kiện');
