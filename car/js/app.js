// 9car - Sổ tay xe. Bộ định tuyến theo hash, thanh dưới 5 mục, đăng ký service worker.
import { h, xoa, icon } from './ui/dom.js';
import { app, thamSo, tatCaHen, hom } from './ui/common.js';
import { khoiDong, kho } from './lib/data.js';
import { ap as apGiaoDien } from './ui/caidat.js';
import home from './screens/home.js';
import { danhSachXe, chiTietXe, bieuMauXe, thietLapNhac } from './screens/xe.js';
import bieuMauHen from './screens/hen.js';
import { danhSachNhatKy, formMoi, formSua } from './screens/nhatky.js';
import chiPhi from './screens/chiphi.js';
import sac from './screens/sac.js';
import { phatNguoi, checklist, taiNan, baoHiem, banXe } from './screens/tienich.js';
import { them, duLieu, nguon } from './screens/them.js';

const TABS = [
  ['hom-nay', '#/', 'home', 'Hôm nay'], ['xe', '#/xe', 'car', 'Xe'], ['nhat-ky', '#/nhat-ky', 'book', 'Nhật ký'],
  ['chi-phi', '#/chi-phi', 'chart', 'Chi phí'], ['them', '#/them', 'more', 'Thêm'],
];
const root = document.getElementById('main');
const tieuDe = document.getElementById('tieu-de');
const quayVe = document.getElementById('quay-ve');
const nutQuay = document.getElementById('nut-quay');
const tabsEl = document.getElementById('tabs');

apGiaoDien();
(function nutVe9app() {
  const host = location.hostname || '';
  const a = document.getElementById('ve-9app');
  if (a && (host === '9app.tech' || host === 'www.9app.tech' || host === 'localhost' || host === '127.0.0.1')) a.setAttribute('href', '/');
})();

function tabCua(seg) {
  if (!seg) return 'hom-nay';
  if (['xe', 'hen', 'nhac'].includes(seg)) return 'xe';
  if (seg === 'nhat-ky') return 'nhat-ky';
  if (seg === 'chi-phi') return 'chi-phi';
  return 'them';
}
function veTabs(dangMo) {
  xoa(tabsEl);
  const dem = kho.xe.length ? tatCaHen().filter((x) => x.tt.mau === 'do').length : 0;
  tabsEl.append(h('div', { class: 'tabs-in' }, TABS.map(([id, href, ic, ten]) =>
    h('a', { class: 'tab', href, 'aria-current': id === dangMo ? 'page' : null, 'data-tab': id },
      icon(ic), ten,
      id === 'hom-nay' && dem ? h('span', { class: 'dem', 'aria-label': `${dem} mục cần làm ngay` }, String(dem)) : null))));
}

function dinhTuyen(hash) {
  const [duongRaw, qs] = (hash || '#/').replace(/^#\/?/, '').split('?');
  const seg = duongRaw.split('/').filter(Boolean).map(decodeURIComponent);
  const tham = thamSo(qs);
  const [a, b, c] = seg;
  switch (a) {
    case undefined: return home();
    case 'xe':
      if (!b) return danhSachXe();
      if (b === 'moi') return bieuMauXe(null);
      if (c === 'sua') return bieuMauXe(b);
      if (c === 'thiet-lap') return thietLapNhac(b);
      return chiTietXe(b);
    case 'hen': return bieuMauHen(b || 'moi', tham);
    case 'nhac': return bieuMauHen('moi', { ...tham, kind: b });
    case 'nhat-ky':
      if (!b) return danhSachNhatKy(tham);
      if (b === 'moi') return formMoi(tham);
      return formSua(b);
    case 'chi-phi': return chiPhi(tham);
    case 'them': return them();
    case 'sac': return sac(tham);
    case 'phat-nguoi': return phatNguoi(tham);
    case 'checklist': return checklist(tham);
    case 'tai-nan': return taiNan(tham);
    case 'bao-hiem': return baoHiem();
    case 'ban-xe': return banXe(tham);
    case 'du-lieu': return duLieu();
    case 'nguon': return nguon();
    default: return { tieuDe: 'Không tìm thấy', quayVe: '#/', el: h('div', { class: 'card' }, h('h1', { class: 'h1' }, 'Không tìm thấy trang này'), h('p', { class: 'sub' }, 'Đường dẫn có thể đã cũ.'), h('a', { class: 'btn', style: 'margin-top:12px', href: '#/' }, 'Về Hôm nay')) };
  }
}

let lanVe = 0;
function ve(giuCuon = false) {
  const y = giuCuon ? window.scrollY : 0;
  let kq;
  try { kq = dinhTuyen(location.hash); } catch (e) {
    console.error(e);
    kq = { tieuDe: 'Lỗi', quayVe: '#/', el: h('div', { class: 'card' }, h('h1', { class: 'h1' }, 'Có lỗi khi mở màn này'), h('p', { class: 'sub' }, 'Dữ liệu của bạn vẫn an toàn. Thử quay lại Hôm nay.'), h('a', { class: 'btn', style: 'margin-top:12px', href: '#/' }, 'Về Hôm nay')) };
  }
  xoa(root); root.append(kq.el);
  tieuDe.textContent = kq.tieuDe || '';
  document.title = `${kq.tieuDe || 'Sổ tay xe'} - 9car`;
  quayVe.hidden = !kq.quayVe; if (kq.quayVe) nutQuay.setAttribute('href', kq.quayVe);
  const seg = (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0]) || '';
  veTabs(tabCua(seg));
  window.scrollTo(0, y);
  if (!giuCuon && lanVe++) root.focus({ preventScroll: true });
}
let homDangVe = hom();
function lamMoiNeuQuaNgay() {
  if (hom() !== homDangVe) { homDangVe = hom(); ve(true); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) lamMoiNeuQuaNgay(); });
window.addEventListener('focus', lamMoiNeuQuaNgay);
setInterval(lamMoiNeuQuaNgay, 60000);
app.render = () => ve(true);
app.di = (hash) => { if (location.hash === hash) ve(); else location.hash = hash; };
window.addEventListener('hashchange', () => ve(false));

(async function khoi() {
  try { await khoiDong(); } catch (e) { console.error(e); }
  ve();
  // đồng bộ tự động (chỉ khi người dùng đã bật): nạp lười để không làm chậm lần mở đầu
  import('./lib/dongbo.js').then(async (m) => { const u = await import('./lib/nine-sync-ui.js'); u.tuDongDongBo(m.dongBo, { lamMoi: () => app.render() }); }).catch((e) => console.debug('[dong-bo] khởi động:', e && e.message));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
