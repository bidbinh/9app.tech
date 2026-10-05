// 9payday: vỏ ứng dụng, định tuyến theo hash, thanh dưới 5 mục.
import { khoiDong, layState, theoDoi, luu, ghiNgay } from './lib/store.js';
import { h, xoa, svg, ICON, xoaThongBao } from './ui/dom.js';
import { apDungTuyChon } from './ui/tuychon.js';
import { sua } from './lib/store.js';
import { homNay } from './lib/dates.js';

const MODULES = {
  '': () => import('./screens/homnay.js'),
  luong: (p) => (p[1] === 'nguon' ? import('./screens/nguon.js') : import('./screens/luong.js')),
  tien: () => import('./screens/tien.js'),
  muctieu: () => import('./screens/muctieu.js'),
  them: (p) => {
    const m = { quyettoan: () => import('./screens/quyettoan.js'), lich: () => import('./screens/lich.js'), 'du-lieu': () => import('./screens/dulieu.js') };
    return (m[p[1]] || (() => import('./screens/them.js')))();
  },
};
const NAV = [
  ['', 'Hôm nay', ICON.home, '#/'],
  ['luong', 'Lương', ICON.salary, '#/luong'],
  ['tien', 'Tiền', ICON.wallet, '#/tien'],
  ['muctieu', 'Mục tiêu', ICON.target, '#/muctieu'],
  ['them', 'Thêm', ICON.more, '#/them'],
];

const view = document.getElementById('view');
const nav = document.getElementById('nav-in');
const tieuDe = document.getElementById('tieu-de');
let hienTai = null; // {khoa, parts}
let dangVe = 0;
let ngayVe = '';

function phanTich() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0];
  const parts = raw.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
  return { parts, goc: parts[0] || '' };
}

function veNav(goc) {
  xoa(nav);
  for (const [id, ten, ic, href] of NAV) {
    nav.append(h('a', { href, 'aria-current': id === goc ? 'page' : undefined, 'data-nav': id || 'hom-nay' }, svg(ic), h('span', {}, ten)));
  }
}

function bangBaoLuu(el) {
  if (luu.ok) return el;
  const b = h('div', { class: 'note bad', role: 'alert', 'data-testid': 'khong-luu-duoc' }, luu.loi, ' ', h('a', { href: '#/them/du-lieu' }, 'Xuất tệp sao lưu'));
  el.prepend(b);
  return el;
}

async function ve({ giuCuon = false } = {}) {
  const id = ++dangVe;
  const { parts, goc } = phanTich();
  const nap = MODULES[goc] || MODULES[''];
  const st = layState();
  const cuon = giuCuon ? window.scrollY : 0;
  let mod;
  try { mod = await nap(parts); } catch (e) {
    xoa(view).append(h('section', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'Không tải được màn hình này'), 'Hãy thử tải lại trang.')));
    return;
  }
  if (id !== dangVe) return; // đã chuyển màn khác trong lúc nạp
  let kq;
  try {
    kq = mod.ve(st, { parts, veLai: () => ve({ giuCuon: true }) });
  } catch (e) {
    console.error(e);
    kq = { el: h('section', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'Có lỗi khi hiển thị'), 'Dữ liệu của bạn vẫn an toàn. Hãy thử tải lại trang.')), tieuDe: 'Lỗi' };
  }
  xoa(view).append(bangBaoLuu(kq.el));
  tieuDe.textContent = kq.tieuDe || '';
  document.title = `${kq.tieuDe ? kq.tieuDe + ' - ' : ''}9payday`;
  veNav(goc);
  const khoa = parts.join('/');
  if (hienTai?.khoa !== khoa) xoaThongBao();
  if (!giuCuon && hienTai?.khoa !== khoa) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); } else if (giuCuon) window.scrollTo(0, cuon);
  hienTai = { khoa, parts };
  ngayVe = homNay();
}

async function khoiChay() {
  await khoiDong();
  const st = layState();
  apDungTuyChon(st);
  document.getElementById('nut-chu-lon').addEventListener('click', () => {
    sua((s) => { s.tuyChon.chuLon = !s.tuyChon.chuLon; }, { im: true });
    apDungTuyChon(layState());
    if (hienTai?.parts[0] === 'them') ve({ giuCuon: true });
  });
  theoDoi(() => { apDungTuyChon(layState()); ve({ giuCuon: true }); });
  window.addEventListener('hashchange', () => ve());
  window.addEventListener('pagehide', () => { ghiNgay(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ghiNgay(); else if (homNay() !== ngayVe) ve({ giuCuon: true }); });
  await ve();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ngoại tuyến là tính năng thêm, không bắt buộc */ });
  }
  window.P9 = { ve, layState }; // dùng cho kiểm thử
}
khoiChay();
