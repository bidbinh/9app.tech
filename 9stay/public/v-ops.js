import { h, api, field, select, run, toast, dmy, todayVN } from './lib.js';

const ST = { todo: 'Chưa dọn', doing: 'Đang dọn', done: 'Đã xong' };

// Buồng phòng: danh sách căn cần dọn. Không có tên khách hay tiền (máy chủ không gửi). Căn có khách đến hôm nay/sớm nhất lên đầu.
export async function housekeepingView(ctx, main) {
  const canCreate = ctx.role === 'quanly' || ctx.role === 'letan';
  const listBox = h('div', { class: 'stack' });
  const msg = h('div');

  async function load() {
    const { tasks } = await api('GET', 'api/housekeeping');
    if (!tasks.length) { listBox.replaceChildren(h('p', { class: 'okmsg', text: 'Không còn căn nào cần dọn.' })); return; }
    listBox.replaceChildren(...tasks.map((t) => {
      const next = (status, label, cls = '') => {
        const b = h('button', { class: 'btn small ' + cls, type: 'button', text: label });
        b.addEventListener('click', () => run(b, msg, async () => { await api('POST', `api/housekeeping/${t.id}/status`, { status }); await load(); }));
        return b;
      };
      const actions = t.status === 'todo' ? [next('doing', 'Bắt đầu dọn')] : t.status === 'doing' ? [next('done', 'Xong'), next('todo', 'Hoàn lại', 'ghost')] : [next('todo', 'Mở lại', 'ghost')];
      return h('div', { class: 'card' }, h('div', { class: 'item' },
        h('div', { class: 'm' }, h('b', { text: `${t.unitCode} · ${t.buildingName}` }),
          h('small', { text: t.nextArrival ? `Khách đến: ${dmy(t.nextArrival)}${t.urgent ? ' (gấp)' : ''}` : 'Chưa có khách đến' }),
          t.note ? h('small', { text: t.note }) : null),
        h('span', { class: 'chip ' + (t.status === 'done' ? 'ok' : 'warn'), text: ST[t.status] })),
      h('div', { class: 'row tight' }, ...actions));
    }));
  }

  const parts = [msg];
  if (canCreate) {
    const cat = await ctx.catalog();
    const units = (cat.units || []).filter((u) => u.status === 'active');
    const unit = select(units.map((u) => [u.id, `${u.code} · ${u.buildingName}`]), units[0] && units[0].id);
    const due = h('input', { type: 'date', value: todayVN() });
    const note = h('input', { maxlength: '300', placeholder: 'Ghi chú (ví dụ: thay ga, kiểm tra điều hòa)' });
    const add = h('button', { class: 'btn ghost', type: 'button', text: 'Thêm việc dọn' });
    add.addEventListener('click', () => run(add, msg, async () => { await api('POST', 'api/housekeeping', { unitId: unit.value, dueDate: due.value, note: note.value }); note.value = ''; toast('Đã thêm'); await load(); }));
    parts.push(h('div', { class: 'card stack' }, h('h3', { text: 'Thêm việc' }), h('div', { class: 'row' }, field('Căn', unit), field('Ngày', due)), field('Ghi chú', note), add));
  }
  parts.push(listBox);
  main.replaceChildren(...parts);
  await load();
}

// Kết nối iCal (quản lý): nhập lịch từ OTA vào căn; xuất lịch căn cho OTA đọc.
export async function icalView(ctx, main) {
  const cat = await ctx.catalog();
  const units = (cat.units || []).filter((u) => u.status === 'active');
  const msg = h('div');
  const listBox = h('div');
  const outBox = h('div');

  async function load() {
    const { feeds } = await api('GET', 'api/ical/feeds');
    listBox.replaceChildren(feeds.length ? h('ul', { class: 'list' }, feeds.map((f) => {
      const sync = h('button', { class: 'btn small', type: 'button', text: 'Đồng bộ ngay' });
      sync.addEventListener('click', () => run(sync, msg, async () => {
        const r = await api('POST', `api/ical/feeds/${f.id}/sync`, {});
        toast(`Đã đồng bộ: ${r.blocked} đêm bị chặn${r.conflicts ? `, ${r.conflicts} đêm TRÙNG với đơn` : ''}`);
        await load();
      }));
      const off = h('button', { class: 'btn small ghost', type: 'button', text: f.status === 'active' ? 'Tắt' : 'Bật' });
      off.addEventListener('click', () => run(off, msg, async () => { await api('POST', `api/ical/feeds/${f.id}/status`, { status: f.status === 'active' ? 'disabled' : 'active' }); await load(); }));
      return h('li', null, h('div', { class: 'item' },
        h('div', { class: 'm' }, h('b', { text: `${f.unitCode} · ${f.name}` }),
          h('small', { text: f.lastSyncAt ? `Lần cuối ${new Date(f.lastSyncAt).toLocaleString('vi-VN')} · ${f.blockedNights} đêm đang chặn` : 'Chưa đồng bộ' }),
          f.lastError ? h('small', { class: 'err', text: 'Lỗi: ' + f.lastError }) : null,
          f.lastConflicts ? h('small', { class: 'warnbox', text: `${f.lastConflicts} đêm trùng với đơn đã có: cần xử lý với OTA` }) : null),
        h('div', { class: 'row tight' }, sync, off)));
    })) : h('p', { class: 'note', text: 'Chưa có nguồn nào.' }));
  }

  const unit = select(units.map((u) => [u.id, `${u.code} · ${u.buildingName}`]), units[0] && units[0].id);
  const name = h('input', { maxlength: '80', placeholder: 'Booking.com, Airbnb…' });
  const url = h('input', { type: 'url', placeholder: 'https://… (địa chỉ iCal của OTA)', maxlength: '1000' });
  const add = h('button', { class: 'btn', type: 'button', text: 'Thêm nguồn' });
  add.addEventListener('click', () => run(add, msg, async () => { await api('POST', 'api/ical/feeds', { unitId: unit.value, name: name.value, url: url.value }); name.value = ''; url.value = ''; toast('Đã thêm nguồn'); await load(); }));

  const eunit = select(units.map((u) => [u.id, `${u.code} · ${u.buildingName}`]), units[0] && units[0].id);
  const exp = h('button', { class: 'btn ghost', type: 'button', text: 'Lấy địa chỉ lịch của căn' });
  exp.addEventListener('click', () => run(exp, msg, async () => {
    const r = await api('POST', `api/ical/export/${eunit.value}`, {});
    const full = location.origin + new URL('.' + r.path, document.baseURI).pathname;
    outBox.replaceChildren(h('p', { class: 'code', text: full }), h('p', { class: 'note', text: 'Dán vào mục "nhập lịch" của OTA. Địa chỉ này là bí mật: ai có đường dẫn đều xem được các đêm đã bán/chặn của căn (không có tên khách).' }));
  }));

  main.replaceChildren(msg,
    h('div', { class: 'grid2' },
      h('div', { class: 'card stack' }, h('h2', { text: 'Nhập lịch từ OTA' }),
        h('p', { class: 'note', text: 'Các đêm OTA đã bán sẽ bị chặn ở 9stay để không bán trùng. Tự đồng bộ mỗi 30 phút. Chỉ nhận địa chỉ https công cộng.' }),
        field('Căn', unit), field('Tên nguồn', name), field('Địa chỉ iCal', url), add),
      h('div', { class: 'card stack' }, h('h2', { text: 'Xuất lịch cho OTA' }), field('Căn', eunit), exp, outBox)),
    h('div', { class: 'card' }, h('h2', { text: 'Nguồn đã kết nối' }), listBox));
  await load();
}
