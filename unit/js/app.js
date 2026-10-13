// 9unit - Tiện ích. Bộ định tuyến theo hash (#/may-tinh, #/doi-don-vi/dientich...), trang chủ có tìm kiếm không dấu.
import { h, xoa, svg } from './ui/dom.js';
import { khoaTim } from './lib/text.js';
import mayTinh from './screens/maytinh.js';
import doiDonVi from './screens/doidonvi.js';
import ngayThang from './screens/ngaythang.js';
import vayLai from './screens/vaylai.js';
import chiaTien from './screens/chiatien.js';
import demNguoc from './screens/demnguoc.js';
import docSo from './screens/docso.js';

export const MODULES = [mayTinh, doiDonVi, ngayThang, vayLai, chiaTien, demNguoc, docSo];
const TEN_APP = 'Tiện ích';

const root = document.getElementById('view');
const tieuDe = document.getElementById('tieu-de');
const quayVe = document.getElementById('quay-ve');
let don = null;

// Nút ‹ 9app: về trang chủ hệ 9app (cùng cách với homebar.js của các app khác)
(function datNutVeHome() {
  const host = location.hostname || '';
  const onHub = host === '9app.tech' || host === 'www.9app.tech' || host === 'localhost' || host === '127.0.0.1';
  const a = document.getElementById('ve-9app');
  if (a) a.setAttribute('href', onHub ? '/' : 'https://9app.tech/');
})();

// ---- Chỉ mục tìm kiếm chức năng (không dấu)
function chiMuc() {
  const out = [];
  for (const m of MODULES) {
    out.push({ ten: m.ten, sub: m.mota, route: `#/${m.id}`, khoa: khoaTim(`${m.ten} ${m.mota} ${m.tuKhoa}`), loai: 'mod' });
    if (m.tabs) {
      for (const t of m.tabs) {
        out.push({ ten: t.ten, sub: m.ten, route: `#/${m.id}/${t.id}`, khoa: khoaTim(`${t.ten} ${m.ten} ${(m.moTaTab && m.moTaTab[t.id]) || ''}`), loai: 'tab' });
      }
    }
  }
  return out;
}
const CHI_MUC = chiMuc();

export function timChucNang(q) {
  const tu = khoaTim(q).split(' ').filter(Boolean);
  if (!tu.length) return [];
  const kq = [];
  for (const e of CHI_MUC) {
    if (!tu.every((w) => e.khoa.includes(w))) continue;
    const diem = (khoaTim(e.ten).startsWith(tu[0]) ? 0 : 1) + (e.loai === 'mod' ? 0 : 0.5);
    kq.push({ e, diem });
  }
  return kq.sort((a, b) => a.diem - b.diem).map((x) => x.e);
}

function veTrangChu() {
  const o = h('input', { type: 'search', id: 'tim', class: 'search', placeholder: 'Tìm chức năng: chỉ vàng, tuổi, trả góp...', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Tìm chức năng', enterkeyhint: 'search' });
  const luoi = h('div', { class: 'grid-mod', 'data-testid': 'luoi' }, MODULES.map((m) => h('a', { class: 'mod', href: `#/${m.id}`, 'data-mod': m.id },
    h('span', { class: 'mod-i' }, svg(m.icon)),
    h('span', { class: 'mod-t' }, m.ten),
    h('span', { class: 'mod-d' }, m.mota))));
  const kq = h('ul', { class: 'found', 'data-testid': 'tim-ket-qua', hidden: true });
  o.addEventListener('input', () => {
    const q = o.value.trim();
    xoa(kq);
    if (!q) { kq.hidden = true; luoi.hidden = false; return; }
    const ds = timChucNang(q);
    kq.hidden = false; luoi.hidden = true;
    if (!ds.length) { kq.append(h('li', { class: 'empty' }, 'Không thấy chức năng nào khớp. Thử gõ "vàng", "ngày", "vay" hoặc "chia".')); return; }
    ds.slice(0, 12).forEach((e) => kq.append(h('li', {}, h('a', { href: e.route }, h('b', {}, e.ten), h('span', {}, e.sub)))));
  });
  root.append(
    h('section', { class: 'hero' },
      h('h1', {}, 'Tiện ích hằng ngày'),
      h('p', {}, 'Máy tính nói tiếng Việt, đổi chỉ vàng và sào đất, ngày âm dương, tính vay, chia tiền. Tất cả chạy ngay trên máy bạn.')),
    h('div', { class: 'search-wrap' }, o), kq, luoi);
}

function dieuHuong(tab) {
  const [, id] = location.hash.split('/');
  location.hash = tab ? `#/${id}/${tab}` : `#/${id}`;
}

function phanTichHash() {
  const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  return { id: p[0] || '', tab: p[1] || '' };
}

function ve() {
  if (typeof don === 'function') { try { don(); } catch { /* bỏ qua */ } don = null; }
  const { id, tab } = phanTichHash();
  const m = MODULES.find((x) => x.id === id);
  xoa(root);
  const cuonLen = !root.dataset.truoc || root.dataset.truoc !== id;
  root.dataset.truoc = id;
  if (!m) {
    document.title = `${TEN_APP} - 9unit`;
    tieuDe.textContent = TEN_APP;
    quayVe.hidden = true;
    document.body.dataset.man = 'home';
    veTrangChu();
  } else {
    document.title = `${m.ten} - 9unit`;
    tieuDe.textContent = m.ten;
    quayVe.hidden = false;
    document.body.dataset.man = m.id;
    const r = m.render(root, tab, dieuHuong);
    if (typeof r === 'function') don = r;
  }
  if (cuonLen) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', ve);
ve();

// Service worker (chỉ trên https hoặc localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
