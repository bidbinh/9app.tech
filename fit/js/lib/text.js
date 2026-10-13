// Chữ tiếng Việt: bỏ dấu, khóa tìm kiếm. Thuần hàm.
export function boDau(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
}
export function khoaTim(s) {
  return boDau(s).toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Mọi từ của chuỗi gõ đều xuất hiện trong khóa. */
export function khop(khoa, q) {
  const tu = khoaTim(q).split(' ').filter(Boolean);
  return tu.every((w) => khoa.includes(w));
}
export const soVN = (n, toiDa = 1) => {
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: toiDa }).format(n);
};
