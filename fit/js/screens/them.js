// Mục Thêm: tìm chức năng, khởi động, hẹn giờ, sức khỏe, dữ liệu.
import { h, xoa, svg } from '../ui/dom.js';
import { danhSachChucNang } from '../data/functions.js';
import { khoaTim, khop } from '../lib/text.js';
import khoiDong from './them-kd.js';
import sucKhoe from './them-sk.js';
import { duLieu, veUngDung } from './them-dl.js';

const IC = {
  kd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-6 1-9z"/></svg>',
  gio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
  sk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.700 3.600 3 8 3s8-1.300 8-3V6M4 12v6c0 1.700 3.600 3 8 3s8-1.300 8-3v-6"/></svg>',
  ve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};
const tile = (hash, ic, ten, mo, tid) => h('a', { class: 'tile', href: hash, 'data-testid': tid }, h('div', { class: 'ic' }, svg(IC[ic])), h('b', {}, ten), h('span', { class: 'd' }, mo));

let CHI_MUC = null;
function chiMuc() {
  if (!CHI_MUC) CHI_MUC = danhSachChucNang().map((e) => ({ ...e, khoa: khoaTim(`${e.name} ${e.keywords.join(' ')}`) }));
  return CHI_MUC;
}
export function timChucNang(q) {
  const tu = khoaTim(q);
  if (!tu) return [];
  return chiMuc().filter((e) => khop(e.khoa, tu)).sort((a, b) => (khoaTim(a.name).startsWith(tu) ? 0 : 1) - (khoaTim(b.name).startsWith(tu) ? 0 : 1)).slice(0, 12);
}

export default function them(ctx) {
  const [muc, sub] = ctx.parts;
  if (muc === 'khoi-dong' || muc === 'hen-gio') return khoiDong(ctx, muc === 'hen-gio' ? 'hen-gio' : sub || null);
  if (muc === 'suc-khoe') return sucKhoe(ctx, sub || null);
  if (muc === 'du-lieu') return duLieu(ctx);
  if (muc === 've') return veUngDung(ctx);
  ctx.datTieuDe('Thêm');
  const o = h('input', { type: 'search', class: 'search', id: 'tim-cn', 'data-testid': 'tim-cn', 'aria-label': 'Tìm chức năng', placeholder: 'Tìm chức năng: khởi động, tải tập, xuất dữ liệu...', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const kq = h('ul', { class: 'list card tight', 'data-testid': 'tim-ket-qua', hidden: true });
  const luoi = h('div', { class: 'tiles' },
    tile('#/them/khoi-dong', 'kd', 'Khởi động, giãn cơ', 'Chuỗi 5 đến 30 phút có hẹn giờ', 'o-kd'),
    tile('#/them/hen-gio', 'gio', 'Hẹn giờ nghỉ', 'Đếm ngược giữa các hiệp', 'o-gio'),
    tile('#/them/suc-khoe', 'sk', 'Sức khỏe và an toàn', 'Sàng lọc, khi nào dừng tập', 'o-sk'),
    tile('#/them/du-lieu', 'dl', 'Dữ liệu của tôi', 'Xuất, nhập, xóa, cài đặt', 'o-dl'),
    tile('#/them/ve', 've', 'Giới thiệu, nguồn', 'Nguồn kiến thức và giới hạn', 'o-ve'));
  o.addEventListener('input', () => {
    const q = o.value.trim();
    xoa(kq);
    if (!q) { kq.hidden = true; luoi.hidden = false; return; }
    const ds = timChucNang(q);
    kq.hidden = false; luoi.hidden = true;
    if (!ds.length) { kq.append(h('li', { class: 'empty' }, 'Không thấy chức năng nào khớp. Thử gõ "khởi động", "tải" hoặc "squat".')); return; }
    ds.forEach((e) => kq.append(h('li', {}, h('a', { class: 'item', href: e.path }, h('div', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 's' }, e.blurb))))));
  });
  ctx.root.append(
    h('section', { class: 'hero' }, h('h1', {}, 'Thêm'), h('p', {}, 'Hẹn giờ, khởi động, sức khỏe và dữ liệu của bạn.')),
    o, kq, luoi,
    h('div', { class: 'note' }, '9fit không phải tư vấn y tế. Dữ liệu của bạn chỉ nằm trên máy này.'));
}
