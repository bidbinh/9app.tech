import { h, clear, api, ApiError, ROLE, field, run, showError, toast } from './lib.js';
import { calendarView } from './v-calendar.js';
import { bookingsView, bookingDetailView } from './v-bookings.js';
import { createView } from './v-create.js';
import { statementsView, commissionView } from './v-money.js';
import { ratesView, membersView } from './v-admin.js';

const app = document.getElementById('app');

// Cổng vào theo vai: mỗi vai có tab và màn mặc định riêng. Quyền thật luôn được kiểm ở máy chủ; ẩn tab chỉ là tiện dụng.
const TABS = {
  quanly: [['lich', 'Lịch'], ['don', 'Đặt phòng'], ['tao', '+ Tạo đơn'], ['ban-ke', 'Bản kê'], ['gia', 'Giá'], ['thanh-vien', 'Thành viên']],
  letan: [['lich', 'Lịch'], ['don', 'Đặt phòng'], ['tao', '+ Tạo đơn']],
  ctv: [['tim', 'Tìm phòng'], ['don', 'Đơn của tôi'], ['hoa-hong', 'Hoa hồng']],
  sale: [['tim', 'Tìm phòng'], ['don', 'Đơn của tôi'], ['hoa-hong', 'Hoa hồng']],
  chu: [['lich', 'Lịch căn'], ['ban-ke', 'Bản kê']],
  buongphong: [],
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
  const ctx = { me, role, catalog: () => (catalogP ||= api('GET', 'api/catalog')), go: (hash) => { location.hash = hash; } };

  const views = {
    lich: calendarView, don: bookingsView, tao: createView, tim: createView, 'ban-ke': statementsView, 'hoa-hong': commissionView, gia: ratesView, 'thanh-vien': membersView,
  };
  async function route() {
    const [name = '', id] = location.hash.replace(/^#\/?/, '').split('/');
    const fallback = tabs.length ? tabs[0][0] : '';
    const key = tabs.some(([k]) => k === name) ? name : fallback;
    if (!tabs.length) { clear(main).append(h('div', { class: 'card' }, h('h2', { text: 'Chưa có chức năng cho vai này' }), h('p', { class: 'note', text: 'Vai buồng phòng sẽ có màn hình riêng ở bản sau.' }))); return; }
    nav.replaceChildren(...tabs.map(([k, label]) => h('a', { href: `#/${k}`, text: label, 'aria-current': k === key ? 'page' : null })));
    clear(main).append(h('p', { class: 'note', text: 'Đang tải…' }));
    try {
      if (key === 'don' && id) await bookingDetailView(ctx, main, id);
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
