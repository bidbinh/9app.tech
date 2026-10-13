// Định dạng số và tiền kiểu Việt (không phụ thuộc ICU của máy chạy).
export function dinhDangSo(n, thapPhan = 0) {
  if (!Number.isFinite(n)) return '';
  const neg = n < 0;
  const [a, b] = Math.abs(n).toFixed(thapPhan).split('.');
  const nguyen = a.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg && Number(Math.abs(n).toFixed(thapPhan)) !== 0 ? '-' : '') + nguyen + (b ? ',' + b : '');
}
export function tien(n) {
  return Number.isFinite(n) ? `${dinhDangSo(Math.round(n))} đ` : '';
}
/** Rút gọn cho biểu đồ: 1,2 tr / 350 k. */
export function tienGon(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${dinhDangSo(n / 1e6, a >= 1e7 ? 0 : 1).replace(',0', '')} tr`;
  if (a >= 1e3) return `${dinhDangSo(Math.round(n / 1e3))} k`;
  return String(Math.round(n));
}
/** Đọc số người dùng gõ: "1.250,5" "1250.5" "300k" thành số; NaN nếu không hiểu. */
export function docSo(s) {
  if (typeof s === 'number') return s;
  let t = String(s ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/đ|vnd|vnđ/g, '');
  if (!t) return NaN;
  let mul = 1;
  if (/(k|nghìn|ngàn)$/.test(t)) { mul = 1e3; t = t.replace(/(k|nghìn|ngàn)$/, ''); }
  else if (/(tr|triệu)$/.test(t)) { mul = 1e6; t = t.replace(/(tr|triệu)$/, ''); }
  if (!/^[\d.,]+$/.test(t)) return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if ((t.match(/\./g) || []).length > 1) return NaN;
  const v = Number(t) * mul;
  return Number.isFinite(v) ? v : NaN;
}

/** Số tiền gọn cho ô thống kê hẹp: từ 100 triệu trở lên ghi theo triệu đồng. */
export function tienOHep(n) {
  if (!Number.isFinite(n)) return '';
  return Math.abs(n) >= 1e8 ? `${dinhDangSo(n / 1e6, 1).replace(',0', '')} triệu đ` : tien(n);
}
