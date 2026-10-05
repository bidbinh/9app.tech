// 9gift - Sổ lễ. Bộ định tuyến theo hash: #/ (Sắp tới), #/le, #/ban, #/qua, #/them.
import { h, svg, xoaCon, donThongBaoCu } from './ui/dom.js';
import { IC } from './ui/icons.js';
import { moKho, onDoi, trangThaiKho } from './lib/kho.js';
import { sapToiHienTai } from './lib/chung.js';
import { homNayIso } from './lib/ngay.js';
import sapToi from './screens/saptoi.js';
import soLe from './screens/sole.js';
import danhBa from './screens/danhba.js';
import quaChuc from './screens/quachuc.js';
import them from './screens/them.js';

const MAN = {
  '': { ve: sapToi, tab: 'sap-toi', ten: 'Sắp tới' },
  'sap-toi': { ve: sapToi, tab: 'sap-toi', ten: 'Sắp tới' },
  le: { ve: soLe, tab: 'le', ten: 'Sổ lễ' },
  ban: { ve: danhBa, tab: 'ban', ten: 'Danh bạ' },
  qua: { ve: quaChuc, tab: 'qua', ten: 'Quà & lời chúc' },
  them: { ve: them, tab: 'them', ten: 'Thêm' },
};
const TABS = [
  { id: 'sap-toi', href: '#/', ten: 'Sắp tới', ic: IC.sapToi },
  { id: 'le', href: '#/le', ten: 'Sổ lễ', ic: IC.le },
  { id: 'ban', href: '#/ban', ten: 'Danh bạ', ic: IC.ban },
  { id: 'qua', href: '#/qua', ten: 'Quà & chúc', ic: IC.qua },
  { id: 'them', href: '#/them', ten: 'Thêm', ic: IC.them },
];

const root = document.getElementById('view');
const tieuDe = document.getElementById('tieu-de');
const tabbar = document.getElementById('tabbar');
const banner = document.getElementById('banner');

(function nutVe9app() {
  const host = location.hostname || '';
  const a = document.getElementById('ve-9app');
  if (a) a.setAttribute('href', host === '9app.tech' || host === 'www.9app.tech' || host === 'localhost' || host === '127.0.0.1' ? '/' : 'https://9app.tech/');
})();

export function phanTichHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [duong, qs = ''] = raw.split('?');
  const seg = duong.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  return { seg, q: new URLSearchParams(qs) };
}

function veTabbar(dangO) {
  xoaCon(tabbar);
  const sapGan = sapToiHienTai(3).filter((e) => e.canChuanBi).length;
  tabbar.append(h('div', { class: 'tabbar-in' }, TABS.map((t) => h('a', { class: 'tab', href: t.href, 'aria-current': t.id === dangO ? 'page' : null, 'data-tab': t.id, 'aria-label': t.id === 'sap-toi' && sapGan ? `${t.ten}, ${sapGan} việc cần làm` : null },
    h('span', { class: 'tab-ico' }, svg(t.ic), t.id === 'sap-toi' && sapGan ? h('span', { class: 'dotc', 'aria-hidden': 'true' }, String(sapGan)) : null),
    h('span', {}, t.ten)))));
  try { if (navigator.setAppBadge) { if (sapGan) navigator.setAppBadge(sapGan).catch(() => {}); else navigator.clearAppBadge().catch(() => {}); } } catch { /* trình duyệt không hỗ trợ */ }
}

function veBanner() {
  xoaCon(banner);
  const t = trangThaiKho();
  if (!t.ben) banner.append(h('div', { class: 'banner' }, h('div', { class: 'note', role: 'alert', 'data-testid': 'khong-ben' }, 'Trình duyệt này không cho lưu dữ liệu lâu dài (có thể đang ở chế độ riêng tư). Dữ liệu sẽ mất khi đóng trang. Hãy xuất bản sao lưu ở mục Thêm, Dữ liệu của tôi.')));
  else if (t.loiGhi) banner.append(h('div', { class: 'banner' }, h('div', { class: 'err', role: 'alert' }, t.loiGhi)));
}

let veLai = 0;
let ngayDaVe = '';
function ve(giuCuon = false) {
  ngayDaVe = homNayIso();
  const y = window.scrollY;
  const { seg, q } = phanTichHash();
  const m = MAN[seg[0] || ''] || null;
  xoaCon(root);
  if (!m) {
    root.append(h('div', { class: 'card empty' }, h('h2', {}, 'Không tìm thấy trang này'), h('p', {}, 'Đường dẫn có thể đã cũ.'), h('a', { class: 'btn primary', href: '#/' }, 'Về màn Sắp tới')));
    tieuDe.textContent = '';
    veTabbar('');
    return;
  }
  tieuDe.textContent = m.ten;
  document.title = `${m.ten} - 9gift`;
  veTabbar(m.tab);
  veBanner();
  try {
    m.ve(root, { seg: seg.slice(1), q, datTieuDe: (t) => { tieuDe.textContent = t; document.title = `${t} - 9gift`; } });
  } catch (err) {
    console.error(err);
    xoaCon(root);
    root.append(h('div', { class: 'card empty', role: 'alert' }, h('h2', {}, 'Có lỗi khi mở màn này'), h('p', {}, 'Dữ liệu của bạn vẫn an toàn. Hãy thử quay về màn Sắp tới.'), h('a', { class: 'btn primary', href: '#/' }, 'Về màn Sắp tới')));
  }
  veLai++;
  if (giuCuon === true) window.scrollTo(0, y);
  else {
    window.scrollTo(0, 0);
    try { root.focus({ preventScroll: true }); } catch { /* bỏ qua */ }
  }
}

async function khoiDong() {
  await moKho();
  onDoi(() => { veBanner(); const { seg } = phanTichHash(); veTabbar((MAN[seg[0] || ''] || {}).tab || ''); });
  window.addEventListener('hashchange', () => { donThongBaoCu(); ve(); });
  window.addEventListener('gift:lamlai', () => ve(true));
  // qua nửa đêm hoặc mở lại app sau nhiều giờ: tính lại "hôm nay", sắp tới và số đỏ trên thanh dưới
  const kiemNgay = () => { if (!document.hidden && homNayIso() !== ngayDaVe && !document.querySelector('dialog[open]')) ve(true); };
  document.addEventListener('visibilitychange', kiemNgay);
  window.addEventListener('focus', kiemNgay);
  setInterval(kiemNgay, 60000);
  ve();
  document.documentElement.dataset.san = '1';
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ngoại tuyến lần đầu hoặc bị chặn */ });
  }
}
khoiDong();
export { veLai };
