import { h, clear, api, ApiError, ROLE, field, run, showError, toast } from './lib.js';
import { calendarView } from './v-calendar.js';
import { bookingsView, bookingDetailView } from './v-bookings.js';
import { createView } from './v-create.js';
import { statementsView, commissionView } from './v-money.js';
import { ratesView, membersView } from './v-admin.js';
import { bankView } from './v-bank.js';
import { reportView } from './v-report.js';
import { housekeepingView, icalView } from './v-ops.js';
import { setupView } from './v-setup.js';
import { myListingsView, listingEditorView, reviewView } from './v-listings.js';

const app = document.getElementById('app');

// Cổng vào theo vai: mỗi vai có tab và màn mặc định riêng. Quyền thật luôn được kiểm ở máy chủ; ẩn tab chỉ là tiện dụng.
const TABS = {
  quanly: [['lich', 'Lịch'], ['duyet', 'Duyệt phòng'], ['phong', 'Tin đăng'], ['danh-muc', 'Danh mục'], ['don', 'Đặt phòng'], ['tao', '+ Tạo đơn'], ['ban-ke', 'Bản kê'], ['bao-cao', 'Báo cáo'], ['buong', 'Buồng phòng'], ['gia', 'Giá'], ['ngan-hang', 'Ngân hàng'], ['ket-noi', 'Kết nối OTA'], ['thanh-vien', 'Thành viên']],
  letan: [['lich', 'Lịch'], ['don', 'Đặt phòng'], ['tao', '+ Tạo đơn'], ['buong', 'Buồng phòng']],
  ctv: [['tim', 'Tìm phòng'], ['don', 'Đơn của tôi'], ['hoa-hong', 'Hoa hồng']],
  sale: [['tim', 'Tìm phòng'], ['don', 'Đơn của tôi'], ['hoa-hong', 'Hoa hồng']],
  chu: [['phong', 'Phòng của tôi'], ['lich', 'Lịch căn'], ['ban-ke', 'Bản kê']],
  buongphong: [['buong', 'Buồng phòng']],
};

function gate(title, ...kids) {
  clear(app).append(h('div', { class: 'gate' }, h('div', { class: 'card stack' }, h('h1', { text: title }), ...kids)));
}

function loginGate() {
  const next = encodeURIComponent(location.pathname);
  gate('9stay', h('p', { text: 'Đăng nhập bằng tài khoản 9app (số điện thoại và mật khẩu) để tiếp tục.' }), h('a', { class: 'btn', href: `/id/?next=${next}`, text: 'Đăng nhập' }));
}

function inviteGate(me) {
  const box = h('div');
  const code = h('input', { autocomplete: 'off', autocapitalize: 'characters', placeholder: 'XXXX-XXXX-XXXX-XXXX', inputmode: 'text' });
  const btn = h('button', { class: 'btn', text: 'Vào tổ chức' });
  btn.addEventListener('click', () => run(btn, box, async () => {
    await api('POST', 'api/invites/redeem', { code: code.value });
    location.reload();
  }));
  gate('Nhập mã mời', h('p', { class: 'note', text: `Xin chào ${me.displayName}. Tài khoản của bạn chưa thuộc tổ chức nào. Hãy nhập mã mời do quản lý gửi.` }), field('Mã mời', code), btn, box);
}

function fatal(e) {
  gate('Không tải được', h('div', { class: 'err', text: e instanceof ApiError ? e.message : 'Có lỗi xảy ra' }), h('button', { class: 'btn', text: 'Thử lại', onclick: () => location.reload() }));
}

function shell(me) {
  const role = me.member.role;
  const tabs = TABS[role] || [];
  const main = h('main');
  const nav = h('nav', { class: 'nav', 'aria-label': 'Chức năng' });
  clear(app).append(
    h('header', { class: 'hdr' }, h('a', { class: 'back', href: '/', text: '‹ 9app' }), h('span', { class: 'brand', text: '9stay' }), h('span', { class: 'who' }, me.displayName, h('br'), h('span', { class: 'note', text: ROLE[role] || role }))),
    tabs.length ? nav : null,
    main,
  );

  let catalogP = null;
  const ctx = { me, role, catalog: () => (catalogP ||= api('GET', 'api/catalog')), resetCatalog: () => { catalogP = null; }, go: (hash) => { location.hash = hash; } };

  const views = {
    lich: calendarView, don: bookingsView, tao: createView, tim: createView, 'ban-ke': statementsView, 'hoa-hong': commissionView, 'danh-muc': setupView, phong: myListingsView, duyet: reviewView, 'bao-cao': reportView, buong: housekeepingView, 'ket-noi': icalView, gia: ratesView, 'ngan-hang': bankView, 'thanh-vien': membersView,
  };
  async function route() {
    const [name = '', id] = location.hash.replace(/^#\/?/, '').split('/');
    const fallback = tabs.length ? tabs[0][0] : '';
    const key = tabs.some(([k]) => k === name) ? name : fallback;
    if (!tabs.length) { clear(main).append(h('div', { class: 'card' }, h('h2', { text: 'Chưa có chức năng cho vai này' }), h('p', { class: 'note', text: '' }))); return; }
    nav.replaceChildren(...tabs.map(([k, label]) => h('a', { href: `#/${k}`, text: label, 'aria-current': k === key ? 'page' : null })));
    clear(main).append(h('p', { class: 'note', text: 'Đang tải…' }));
    try {
      if (key === 'don' && id) await bookingDetailView(ctx, main, id);
      else if (key === 'phong' && id) await listingEditorView(ctx, main, id);
      else if (key === 'duyet') await reviewView(ctx, main, id);
      else await views[key](ctx, main);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { loginGate(); return; }
      clear(main);
      showError(main, e);
    }
  }
  window.addEventListener('hashchange', route);
  route();
}

async function boot() {
  let me;
  try { me = await api('GET', 'api/me'); } catch (e) {
    if (e instanceof ApiError && e.status === 401) { loginGate(); return; }
    fatal(e); return;
  }
  if (!me.member) { inviteGate(me); return; }
  shell(me);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* không bắt buộc */ });
}

boot();
export { toast };
