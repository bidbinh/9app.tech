// Định dạng và đọc số tiền kiểu Việt. Thuần hàm.
import { dinhDangSo, docSo, chuanHoaSoChuoi } from './text.js';

export const dong = (n) => `${dinhDangSo(Math.round(Number(n) || 0))} đ`;

/** 1.250.000 -> "1,25 triệu"; 500.000 -> "500 nghìn". */
export function tienGon(n) {
  n = Math.round(Number(n) || 0);
  const a = Math.abs(n);
  const dau = n < 0 ? '-' : '';
  if (a >= 1e9) return `${dau}${dinhDangSo(a / 1e9, 2)} tỷ`;
  if (a >= 1e6) return `${dau}${dinhDangSo(a / 1e6, 2)} triệu`;
  if (a >= 1e3) return `${dau}${dinhDangSo(a / 1e3, 1)} nghìn`;
  return `${dau}${a} đ`;
}

export function tienBangChu(n) {
  n = Math.round(Number(n) || 0);
  if (n <= 0) return '';
  return `${docSo(n, { donVi: 'đồng' })}`;
}

/** Đọc ô nhập tiền: "1.200.000", "1,2tr", "500k". Trả số hoặc NaN. */
export function docOTien(raw) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/đ|vnd|vnđ|dong$/g, '');
  if (!s) return NaN;
  let m = /^(\d+(?:[.,]\d+)?)(k|nghin|ngan|nghìn|ngàn)$/.exec(s);
  if (m) return Math.round(Number(chuanHoaSoChuoi(m[1].replace(',', '.'))) * 1e3);
  m = /^(\d+(?:[.,]\d+)?)(tr|triệu|trieu|m)$/.exec(s);
  if (m) return Math.round(Number(chuanHoaSoChuoi(m[1].replace(',', '.'))) * 1e6);
  m = /^(\d+)(?:tr|triệu|trieu)(\d{1,3})$/.exec(s);
  if (m) return Math.round(Number(`${m[1]}.${m[2]}`) * 1e6);
  m = /^(\d+(?:[.,]\d+)?)(tỷ|ty)$/.exec(s);
  if (m) return Math.round(Number(chuanHoaSoChuoi(m[1].replace(',', '.'))) * 1e9);
  const c = chuanHoaSoChuoi(s);
  if (c === '' || !/^\d+$/.test(c)) return NaN;
  return Number(c);
}

/** Làm tròn lên bội số của b. */
export const lamTronLen = (n, b = 100000) => Math.ceil(n / b) * b;

/** Như docOTien nhưng số trần dưới 1.000 hiểu là nghìn đồng ("500" = 500.000 đ), vì người Việt nói tắt như vậy. */
export function docOTienNoi(raw) {
  const v = docOTien(raw);
  if (!Number.isFinite(v)) return { v: NaN, ngam: false };
  const trang = /^[\d.,\s]+$/.test(String(raw).trim());
  if (trang && v > 0 && v < 1000) return { v: v * 1000, ngam: true };
  return { v, ngam: false };
}
