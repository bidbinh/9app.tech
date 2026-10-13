// Tìm không dấu trong danh bạ và sổ lễ. Thuần hàm.
import { khoaTim } from './text.js';
import { tenQuanHe } from '../data/dip.js';
import { tenSuKien } from './le.js';

/** Mọi từ trong chuỗi tìm phải xuất hiện (đã bỏ dấu, không phân biệt hoa thường) trong kho chữ của người. */
export function timNguoi(people, q) {
  const tu = khoaTim(q).split(' ').filter(Boolean);
  if (!tu.length) return people;
  return people.filter((p) => {
    const kho = khoaTim(`${p.ten} ${p.cachGoi || ''} ${p.nhom || ''} ${tenQuanHe(p.quanHe)} ${p.ghiChu || ''}`);
    return tu.every((t) => kho.includes(t));
  });
}

export function timKhoanLe(entries, people, q) {
  const tu = khoaTim(q).split(' ').filter(Boolean);
  if (!tu.length) return entries;
  const ten = new Map(people.map((p) => [p.id, p.ten]));
  return entries.filter((e) => {
    const kho = khoaTim(`${(e.personId && ten.get(e.personId)) || e.tenNguoi || ''} ${tenSuKien(e.suKien)} ${e.qua || ''} ${e.ghiChu || ''} ${e.ngay}`);
    return tu.every((t) => kho.includes(t));
  });
}

/** Sắp xếp theo tên cuối (tên gọi) trong tiếng Việt. */
export function sapXepTen(people) {
  const cuoi = (p) => (p.ten.trim().split(/\s+/).pop() || '');
  return [...people].sort((a, b) => cuoi(a).localeCompare(cuoi(b), 'vi') || a.ten.localeCompare(b.ten, 'vi'));
}
