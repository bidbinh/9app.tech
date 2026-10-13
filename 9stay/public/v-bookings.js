import { h, api, field, select, run, toast, money, dmy, dm, chip, STATUS, todayVN, addDays, uuid, ints } from './lib.js';

const isAgent = (role) => role === 'ctv' || role === 'sale';

// ---- Danh sách đơn ----
export async function bookingsView(ctx, main) {
  const own = isAgent(ctx.role);
  const status = select([['', 'Mọi trạng thái'], ...Object.entries(STATUS)], '');
  const from = h('input', { type: 'date', value: addDays(todayVN(), -7) });
  const to = h('input', { type: 'date', value: addDays(todayVN(), 60) });
  const listBox = h('div', { class: 'card' });
  const msg = h('div');

  async function load() {
    const qs = new URLSearchParams();
    if (status.value) qs.set('status', status.value);
    if (from.value) qs.set('from', from.value);
    if (to.value) qs.set('to', to.value);
    try {
      const { bookings } = await api('GET', 'api/bookings?' + qs);
      msg.replaceChildren();
      if (!bookings.length) { listBox.replaceChildren(h('p', { class: 'note', text: 'Chưa có đơn nào trong khoảng này.' })); return; }
      listBox.replaceChildren(h('ul', { class: 'list' }, bookings.map((b) => h('li', null,
        h('a', { class: 'item', href: '#/don/' + b.id },
          h('div', { class: 'm' }, h('b', { text: `${b.code} · ${b.guestName}` }), h('small', { text: `${dm(b.checkin)} → ${dm(b.checkout)}${b.unitCode ? ' · ' + b.unitCode : ' · ' + (b.roomTypeName || '')}` })),
          h('div', { class: 'row tight' }, b.due > 0 ? h('span', { class: 'chip warn', text: 'Nợ ' + money(b.due) }) : null, chip(b.status)))))));
    } catch (e) { msg.replaceChildren(h('div', { class: 'err', role: 'alert', text: e.message })); }
  }
  [status, from, to].forEach((e) => e.addEventListener('change', load));
  main.replaceChildren(
    h('div', { class: 'card' }, h('h2', { text: own ? 'Đơn của tôi' : 'Đặt phòng' }),
      h('div', { class: 'row' }, field('Trạng thái', status), field('Từ ngày', from), field('Đến ngày', to))),
    msg, listBox);
  await load();
}

// ---- Chi tiết một đơn ----
export async function bookingDetailView(ctx, main, id) {
  const staff = ctx.role === 'quanly' || ctx.role === 'letan';
  const agent = isAgent(ctx.role);
  const data = await api('GET', 'api/bookings/' + id);
  const b = data.booking;
  const reload = () => bookingDetailView(ctx, main, id);

  const info = h('div', { class: 'card' },
    h('div', { class: 'row' }, h('h2', { text: `${b.code} · ${b.guestName}` }), h('div', null, chip(b.status))),
    h('div', { class: 'kv' }, h('span', { text: 'Ở' }), h('span', { text: `${dmy(b.checkin)} → ${dmy(b.checkout)}` })),
    h('div', { class: 'kv' }, h('span', { text: staff ? 'Căn' : 'Loại phòng' }), h('span', { text: staff ? `${b.unitCode || ''} · ${b.buildingName || ''}` : b.roomTypeName })),
    h('div', { class: 'kv' }, h('span', { text: 'Khách' }), h('span', { text: `${b.adults} người lớn${b.children ? `, ${b.children} trẻ em` : ''}` })),
    b.guestPhone ? h('div', { class: 'kv' }, h('span', { text: 'Điện thoại' }), h('a', { href: 'tel:' + b.guestPhone, text: b.guestPhone })) : null,
    b.status === 'giu' && b.holdUntil ? h('p', { class: 'warnbox', text: `Giữ chỗ đến ${new Date(b.holdUntil).toLocaleString('vi-VN')}. Chưa đủ cọc thì phòng sẽ tự nhả.` }) : null,
    b.cancelReason ? h('p', { class: 'note', text: 'Lý do hủy: ' + b.cancelReason }) : null);

  const money1 = h('div', { class: 'card' }, h('h3', { text: 'Tiền' }),
    h('div', { class: 'kv' }, h('span', { text: 'Tổng (đã gồm VAT)' }), h('span', { text: money(b.total) })),
    h('div', { class: 'kv' }, h('span', { text: 'Đã thu' }), h('span', { text: money(b.paid) })),
    h('div', { class: 'kv tot' }, h('span', { text: 'Còn phải thu' }), h('span', { text: money(b.due) })),
    b.depositRequired ? h('div', { class: 'kv' }, h('span', { text: 'Cọc yêu cầu' }), h('span', { text: money(b.depositRequired) })) : null);

  const parts = [info, money1];
  if (staff && data.lines && data.lines.length) {
    parts.push(h('div', { class: 'card' }, h('h3', { text: 'Dòng giá' }), h('div', { class: 'scroll-x' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { text: 'Nội dung' }), h('th', { class: 'n', text: 'Số tiền' }))),
      h('tbody', null, data.lines.map((l) => h('tr', null, h('td', { text: l.label }), h('td', { class: 'n', text: money(l.amount) }))))))));
  }
  if (staff && data.payments && data.payments.length) {
    const KIND = { deposit: 'Cọc', payment: 'Thu', refund: 'Hoàn' };
    parts.push(h('div', { class: 'card' }, h('h3', { text: 'Thu / hoàn tiền' }), h('div', { class: 'scroll-x' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { text: 'Loại' }), h('th', { text: 'Ngày' }), h('th', { class: 'n', text: 'Số tiền' }))),
      h('tbody', null, data.payments.map((p) => h('tr', null, h('td', { text: KIND[p.kind] || p.kind }), h('td', { text: dmy(p.received_on) }), h('td', { class: 'n', text: money(p.amount) }))))))));
  }
  if (staff) parts.push(await staffActions(ctx, b, reload));
  if (agent) parts.push(agentActions(ctx, b, reload));
  parts.push(h('a', { href: '#/don', class: 'back', text: '‹ Danh sách đơn' }));
  main.replaceChildren(...parts);
}

async function staffActions(ctx, b, reload) {
  const quanly = ctx.role === 'quanly';
  const box = h('div');
  const done = (m) => async () => { toast(m); await reload(); };
  const wrap = h('div', { class: 'card stack' }, h('h3', { text: 'Thao tác' }));

  if (b.status === 'da_coc') {
    const btn = h('button', { class: 'btn', type: 'button', text: 'Nhận phòng' });
    btn.addEventListener('click', () => run(btn, box, async () => { await api('POST', `api/bookings/${b.id}/checkin`); await done('Đã nhận phòng')(); }));
    wrap.append(btn);
  }
  if (b.status === 'da_nhan') {
    const btn = h('button', { class: 'btn', type: 'button', text: 'Trả phòng & quyết toán' });
    btn.addEventListener('click', () => run(btn, box, async () => { await api('POST', `api/bookings/${b.id}/checkout`); await done('Đã trả phòng')(); }));
    wrap.append(btn, h('p', { class: 'note', text: 'Chỉ trả phòng được khi khách không còn nợ.' }));
  }

  if (['giu', 'da_coc', 'da_nhan'].includes(b.status)) {
    let ref = uuid();
    const kinds = [['deposit', 'Cọc'], ['payment', 'Thu tiền']].concat(quanly ? [['refund', 'Hoàn tiền']] : []);
    const kind = select(kinds, b.status === 'giu' ? 'deposit' : 'payment');
    const amount = h('input', { type: 'number', min: '1', step: '1000', inputmode: 'numeric', value: b.due > 0 ? String(b.due) : '' });
    const date = h('input', { type: 'date', value: todayVN() });
    const note = h('input', { placeholder: 'Ghi chú (không nhập tên, số điện thoại)', maxlength: '200' });
    const pbox = h('div');
    const btn = h('button', { class: 'btn', type: 'button', text: 'Ghi nhận' });
    btn.addEventListener('click', () => run(btn, pbox, async () => {
      await api('POST', `api/bookings/${b.id}/payments`, { kind: kind.value, amount: Number(amount.value), receivedOn: date.value, note: note.value, ref });
      ref = uuid();
      await done('Đã ghi nhận')();
    }));
    wrap.append(h('div', { class: 'card stack' }, h('h3', { text: 'Ghi nhận tiền (chuyển khoản)' }),
      h('div', { class: 'row' }, field('Loại', kind), field('Số tiền (đ)', amount), field('Ngày nhận', date)), field('Ghi chú', note), btn, pbox));
  }

  if (['giu', 'da_coc'].includes(b.status)) wrap.append(await moveForm(ctx, b, reload), cancelForm(ctx, b, reload));
  if (wrap.children.length === 1) wrap.append(h('p', { class: 'note', text: 'Đơn đã đóng, không còn thao tác.' }));
  wrap.append(box);
  return wrap;
}

function cancelForm(ctx, b, reload) {
  const quanly = ctx.role === 'quanly';
  const paidBlocked = b.paid > 0 && !quanly;
  const reason = h('input', { placeholder: 'Lý do hủy (không bắt buộc)', maxlength: '500' });
  const retain = h('input', { type: 'number', min: '0', max: String(b.paid), step: '1000', value: '0', inputmode: 'numeric' });
  const box = h('div');
  const btn = h('button', { class: 'btn bad', type: 'button', text: 'Hủy đơn', disabled: paidBlocked });
  btn.addEventListener('click', () => run(btn, box, async () => {
    if (!window.confirm(`Hủy đơn ${b.code}?`)) return;
    const body = { reason: reason.value };
    if (b.paid > 0) body.retainAmount = Number(retain.value);
    await api('POST', `api/bookings/${b.id}/cancel`, body);
    toast('Đã hủy đơn');
    await reload();
  }));
  return h('div', { class: 'card stack' }, h('h3', { text: 'Hủy đơn' }),
    paidBlocked ? h('p', { class: 'warnbox', text: 'Đơn đã thu tiền: cần quản lý hủy (chọn giữ lại bao nhiêu, hoàn bao nhiêu).' }) : null,
    b.paid > 0 && quanly ? h('p', { class: 'note', text: `Đã thu ${money(b.paid)}. Nhập số tiền GIỮ LẠI (0 = hoàn hết); phần còn lại hoàn tay ở mục ghi nhận tiền.` }) : null,
    field('Lý do', reason), b.paid > 0 && quanly ? field('Giữ lại (đ)', retain) : null, btn, box);
}

async function moveForm(ctx, b, reload) {
  const cat = await ctx.catalog();
  const units = (cat.units || []).filter((u) => u.status === 'active');
  const unit = select(units.map((u) => [u.id, `${u.code} · ${u.roomTypeName}`]), (units.find((u) => u.code === b.unitCode) || units[0] || {}).id);
  const cin = h('input', { type: 'date', value: b.checkin });
  const cout = h('input', { type: 'date', value: b.checkout });
  const ages = h('input', { placeholder: 'Tuổi trẻ em, ví dụ 4, 8', hidden: !b.children });
  const box = h('div');
  const hasPrice = b.total > 0;
  const btn = h('button', { class: 'btn ghost', type: 'button', text: hasPrice ? 'Báo giá mới & dời đơn' : 'Dời đơn' });
  btn.addEventListener('click', () => run(btn, box, async () => {
    const body = { unitId: unit.value, checkin: cin.value, checkout: cout.value, expectedVersion: b.version };
    if (hasPrice) {
      const u = units.find((x) => x.id === unit.value);
      const q = await api('POST', 'api/quotes', { roomTypeId: u.roomTypeId, checkin: cin.value, checkout: cout.value, adults: b.adults, childAges: ints(ages.value) });
      if (!q.ok) throw new Error('Không báo giá được: ' + q.warnings.map((w) => w.code + (w.night ? ' ' + dm(w.night) : '')).join(', '));
      if (!window.confirm(`Giá mới: ${money(q.total)} (đã gồm VAT). Dời đơn?`)) return;
      body.quoteId = q.id;
    }
    await api('POST', `api/bookings/${b.id}/move`, body);
    toast('Đã dời đơn');
    await reload();
  }));
  return h('div', { class: 'card stack' }, h('h3', { text: 'Dời đơn' }),
    h('div', { class: 'row' }, field('Căn', unit), field('Đến', cin), field('Đi', cout)), b.children ? field('Tuổi trẻ em', ages) : null,
    hasPrice ? h('p', { class: 'note', text: 'Đơn đã có giá: dời sẽ lập báo giá mới cho kỳ ở mới, giá cũ được hoàn tự động.' }) : null, btn, box);
}

function agentActions(ctx, b, reload) {
  const box = h('div');
  if (!['giu', 'da_coc'].includes(b.status)) return h('span');
  const blocked = b.paid > 0;
  const btn = h('button', { class: 'btn bad', type: 'button', text: 'Hủy đơn', disabled: blocked });
  btn.addEventListener('click', () => run(btn, box, async () => {
    if (!window.confirm(`Hủy đơn ${b.code}?`)) return;
    await api('POST', `api/bookings/${b.id}/cancel`, {});
    toast('Đã hủy đơn');
    await reload();
  }));
  return h('div', { class: 'card stack' }, h('h3', { text: 'Thao tác' }),
    blocked ? h('p', { class: 'warnbox', text: 'Đơn đã thu tiền, hãy liên hệ quản lý để hủy.' }) : null, btn, box);
}
