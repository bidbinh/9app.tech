// 9fit: bộ định tuyến theo hash, thanh dưới 5 mục, áp dụng cài đặt (chữ lớn), đăng ký service worker.
import { h, xoa, svg, toast } from './ui/dom.js';
import * as db from './lib/db.js';
import { apDungCaiDat } from './ui/timer.js';
import homNay from './screens/hom-nay.js';
import tap from './screens/tap.js';
import thuVien from './screens/thu-vien.js';
import tienDo from './screens/tien-do.js';
import them from './screens/them.js';

const ICON = {
  'hom-nay': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  'tap': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>',
  'thu-vien': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/></svg>',
  'tien-do': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  'them': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
};
export const MUC_NAV = [
  { id: 'hom-nay', hash: '#/', ten: 'Hôm nay', man: homNay },
  { id: 'tap', hash: '#/tap', ten: 'Tập', man: tap },
  { id: 'thu-vien', hash: '#/thu-vien', ten: 'Thư viện', man: thuVien },
  { id: 'tien-do', hash: '#/tien-do', ten: 'Tiến độ', man: tienDo },
  { id: 'them', hash: '#/them', ten: 'Thêm', man: them },
];

const root = document.getElementById('view');
const tieuDe = document.getElementById('tieu-de');
const thanhDuoi = document.getElementById('tabbar');
let don = null;

(function datNutVeHome() {
  const host = location.hostname || '';
  const onHub = host === '9app.tech' || host === 'www.9app.tech' || host === 'localhost' || host === '127.0.0.1';
  const a = document.getElementById('ve-9app');
  if (a) a.setAttribute('href', onHub ? '/' : 'https://9app.tech/');
})();

function dungThanhDuoi() {
  for (const m of MUC_NAV) thanhDuoi.append(h('a', { href: m.hash, 'data-nav': m.id, 'aria-label': m.ten }, svg(ICON[m.id]), h('span', {}, m.ten)));
}

function phanTich() {
  const [duong, truyVan = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const p = duong.split('/').filter(Boolean).map(decodeURIComponent);
  return { id: p[0] || 'hom-nay', parts: p.slice(1), query: new URLSearchParams(truyVan) };
}

let lanVe = 0;
function ve(giuCuon = false) {
  if (typeof don === 'function') { try { don(); } catch { /* bỏ qua */ } don = null; }
  const { id, parts, query } = phanTich();
  const m = MUC_NAV.find((x) => x.id === id) || MUC_NAV[0];
  for (const a of thanhDuoi.children) {
    if (a.dataset.nav === m.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  xoa(root);
  const ctx = {
    root, parts, query,
    datTieuDe: (t) => { tieuDe.textContent = t; document.title = `${t} - 9fit`; },
    dieuHuong: (hash) => { location.hash = hash; },
    veLai: () => ve(true),
  };
  ctx.datTieuDe(m.ten);
  const lan = ++lanVe;
  try {
    const r = m.man(ctx);
    if (typeof r === 'function') don = r;
  } catch (e) {
    xoa(root);
    root.append(h('div', { class: 'note bad', role: 'alert' }, 'Có lỗi khi mở màn hình này. Hãy thử quay lại màn Hôm nay.'), h('a', { class: 'btn mt', href: '#/' }, 'Về Hôm nay'));
    console.error(e);
  }
  if (lan === lanVe && !giuCuon) window.scrollTo(0, 0);
}

const canhLuu = h('div', { class: 'note bad', id: 'canh-luu', role: 'alert', hidden: true, 'data-testid': 'canh-luu-toan-cuc' },
  h('b', {}, 'Không lưu được dữ liệu bền. '), 'Trình duyệt đang chặn hoặc lỗi bộ nhớ (có thể do chế độ riêng tư), dữ liệu sẽ mất khi đóng trang. ', h('a', { href: '#/them/du-lieu' }, 'Xuất sao lưu'));
function capNhatCanhLuu() { canhLuu.hidden = db.trangThai.luuBen; }

async function khoiDong() {
  await db.khoiTao();
  root.before(canhLuu);
  capNhatCanhLuu();
  db.datBaoLoi(() => { capNhatCanhLuu(); toast('Không lưu được dữ liệu. Hãy xuất sao lưu ngay.', { ms: 9000 }); });
  apDungCaiDat();
  dungThanhDuoi();
  window.addEventListener('hashchange', () => ve());
  ve();
  // đồng bộ tự động (chỉ khi người dùng đã bật): nạp lười để không làm chậm lần mở đầu
  import('./lib/dongbo.js').then(async (m) => { const u = await import('./lib/nine-sync-ui.js'); u.tuDongDongBo(m.dongBo, { lamMoi: () => ve(true) }); }).catch((e) => console.debug('[dong-bo] khởi động:', e && e.message));
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    if (document.readyState === 'complete') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
khoiDong();
