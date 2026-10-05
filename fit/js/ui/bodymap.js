// Sơ đồ cơ thể đơn giản tự vẽ (mặt trước và mặt sau), tô nhóm cơ chính và phụ. Không dùng ảnh bên ngoài.
import { svg } from './dom.js';
import { NHOM } from '../data/ex-base.js';

const E = (cx, cy, rx, ry, z) => `<ellipse class="z" data-z="${z}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;

function truoc(cx) {
  return [
    E(cx, 28, 5, 4, 'co'),
    E(cx - 20, 42, 8, 6, 'vai'), E(cx + 20, 42, 8, 6, 'vai'),
    E(cx - 9, 55, 9, 8, 'nguc'), E(cx + 9, 55, 9, 8, 'nguc'),
    E(cx, 79, 10, 13, 'core'),
    E(cx - 17, 79, 4.5, 12, 'xien'), E(cx + 17, 79, 4.5, 12, 'xien'),
    E(cx - 29, 60, 5, 12, 'tay-truoc'), E(cx + 29, 60, 5, 12, 'tay-truoc'),
    E(cx - 32, 88, 4, 11, 'cang-tay'), E(cx + 32, 88, 4, 11, 'cang-tay'),
    E(cx - 13, 100, 6, 6, 'hong'), E(cx + 13, 100, 6, 6, 'hong'),
    E(cx - 11, 125, 8, 20, 'dui-truoc'), E(cx + 11, 125, 8, 20, 'dui-truoc'),
    E(cx - 10, 158, 5, 13, 'bap-chan'), E(cx + 10, 158, 5, 13, 'bap-chan'),
    E(cx - 10, 180, 6, 4, 'co-chan'), E(cx + 10, 180, 6, 4, 'co-chan'),
  ].join('');
}
function sau(cx) {
  return [
    E(cx, 28, 5, 4, 'co'),
    E(cx - 20, 42, 8, 6, 'vai'), E(cx + 20, 42, 8, 6, 'vai'),
    `<path class="z" data-z="lung-tren" d="M${cx - 16} 46 L${cx + 16} 46 L${cx + 11} 68 L${cx - 11} 68 Z"/>`,
    E(cx, 79, 10, 9, 'lung-duoi'),
    E(cx - 29, 60, 5, 12, 'tay-sau'), E(cx + 29, 60, 5, 12, 'tay-sau'),
    E(cx - 32, 88, 4, 11, 'cang-tay'), E(cx + 32, 88, 4, 11, 'cang-tay'),
    E(cx - 9, 100, 9, 8, 'mong'), E(cx + 9, 100, 9, 8, 'mong'),
    E(cx - 11, 127, 8, 18, 'dui-sau'), E(cx + 11, 127, 8, 18, 'dui-sau'),
    E(cx - 10, 158, 5.5, 13, 'bap-chan'), E(cx + 10, 158, 5.5, 13, 'bap-chan'),
    E(cx - 10, 180, 6, 4, 'co-chan'), E(cx + 10, 180, 6, 4, 'co-chan'),
  ].join('');
}
function dang(cx) {
  return `<g class="sil"><circle cx="${cx}" cy="15" r="10"/><rect x="${cx - 5}" y="24" width="10" height="8" rx="3"/>`
    + `<rect x="${cx - 24}" y="32" width="48" height="66" rx="16"/>`
    + `<rect x="${cx - 36}" y="36" width="10" height="56" rx="5"/><rect x="${cx + 26}" y="36" width="10" height="56" rx="5"/>`
    + `<rect x="${cx - 22}" y="94" width="44" height="18" rx="8"/>`
    + `<rect x="${cx - 21}" y="104" width="19" height="78" rx="9"/><rect x="${cx + 2}" y="104" width="19" height="78" rx="9"/></g>`;
}

/** chinh, phu: mảng id nhóm cơ. Trả về phần tử SVG. */
export function bodyMap(chinh = [], phu = [], { nhan = '' } = {}) {
  const all = chinh.includes('toan-than');
  const el = svg(`<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" role="img">${dang(50)}${dang(150)}${truoc(50)}${sau(150)}</svg>`, 'bodymap');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('aria-label', nhan || `Nhóm cơ chính: ${chinh.map((n) => NHOM[n]).join(', ')}${phu.length ? `. Nhóm phụ: ${phu.map((n) => NHOM[n]).join(', ')}` : ''}`);
  for (const z of el.querySelectorAll('.z')) {
    const id = z.getAttribute('data-z');
    if (all || chinh.includes(id)) z.classList.add('zm');
    else if (phu.includes(id)) z.classList.add('zs');
  }
  if (all) el.querySelectorAll('.sil').forEach((s) => s.classList.add('sil-all'));
  return el;
}

/** Biểu tượng loại bài (nhỏ) cho nhãn. */
export const BIEU_TUONG = {
  'suc-manh': '<svg viewBox="0 0 24 24"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  'bat-nhay': '<svg viewBox="0 0 24 24"><path d="M12 3l-5 7h3v6h4v-6h3zM6 21h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'nhanh-nhen': '<svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  'core': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  'linh-hoat': '<svg viewBox="0 0 24 24"><path d="M4 18c6 0 4-12 10-12 3 0 4 3 6 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  'khoi-dong': '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-6 1-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  'phuc-hoi': '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  'thang-bang': '<svg viewBox="0 0 24 24"><path d="M12 4v10M8 20h8M12 14l-4 6M12 14l4 6M5 8h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
