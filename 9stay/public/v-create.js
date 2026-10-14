import { h, api, field, select, run, toast, money, dm, dmy, todayVN, addDays, ints } from './lib.js';

// Tạo đơn: tìm loại phòng còn trống → báo giá → nhập khách → giữ chỗ. Dùng chung cho nhân viên và sale/CTV;
// sale/CTV không thấy căn (hệ thống tự gán) và luôn phải báo giá trước khi giữ chỗ.
export async function createView(ctx, main) {
  const agent = ctx.role === 'ctv' || ctx.role === 'sale';
  const cat = await ctx.catalog();
  const cin = h('input', { type: 'date', value: addDays(todayVN(), 1) });
  const cout = h('input', { type: 'date', value: addDays(todayVN(), 3) });
  const adults = h('input', { type: 'number', min: '1', max: '20', value: '2', inputmode: 'numeric' });
  const ages = h('input', { placeholder: 'Tuổi trẻ em, ví dụ 4, 8 (bỏ trống nếu không có)' });
  const availBox = h('div');
  const quoteBox = h('div');
  const guestBox = h('div');
  let chosen = null;
  let quote = null;

  const searchBtn = h('button', { class: 'btn', type: 'button', text: 'Tìm phòng trống' });
  searchBtn.addEventListener('click', () => run(searchBtn, availBox, async () => {
    chosen = null; quote = null;
    quoteBox.replaceChildren(); guestBox.replaceChildren();
    const childAges = ints(ages.value);
    if (childAges.some((a) => !Number.isInteger(a) || a < 0 || a > 17)) throw new Error('Tuổi trẻ em phải là số từ 0 đến 17');
    const qs = new URLSearchParams({ checkin: cin.value, checkout: cout.value, adults: adults.value, children: String(childAges.length) });
    const { roomTypes } = await api('GET', 'api/availability?' + qs);
    const nights = Math.round((new Date(cout.value) - new Date(cin.value)) / 86400000);
    availBox.replaceChildren(h('div', { class: 'card stack' }, h('h3', { text: `Còn trống ${dm(cin.value)} → ${dm(cout.value)} (${nights} đêm)` }),
      h('ul', { class: 'list' }, roomTypes.map((t) => {
        const btn = h('button', { class: 'btn' + (t.free ? '' : ' ghost'), type: 'button', text: t.free ? 'Chọn' : 'Hết phòng', disabled: !t.free, 'data-type': t.name });
        btn.addEventListener('click', () => choose(t, childAges));
        return h('li', null, h('div', { class: 'item' }, h('div', { class: 'm' }, h('b', { text: t.name }), h('small', { text: t.free ? `Còn ${t.free} căn` : 'Không còn căn nào' })), btn));
      }))));
  }));

  async function choose(type, childAges) {
    chosen = type;
    guestBox.replaceChildren();
    quoteBox.replaceChildren(h('p', { class: 'note', text: 'Đang tính giá…' }));
    try {
      quote = await api('POST', 'api/quotes', { roomTypeId: type.roomTypeId, checkin: cin.value, checkout: cout.value, adults: Number(adults.value), childAges });
    } catch (e) { quoteBox.replaceChildren(h('div', { class: 'err', role: 'alert', text: e.message })); return; }
    if (!quote.ok) {
      const WHY = { missing_price: 'chưa có giá cho đêm', closed: 'đóng bán đêm', min_stay: 'chưa đủ số đêm tối thiểu', bad_child_age: 'tuổi trẻ em không hợp lệ' };
      quoteBox.replaceChildren(h('div', { class: 'err', role: 'alert' }, 'Chưa báo giá được: ', quote.warnings.map((w) => `${WHY[w.code] || w.code}${w.night ? ' ' + dm(w.night) : ''}`).join('; ')));
      return;
    }
    quoteBox.replaceChildren(h('div', { class: 'card stack', id: 'quote' }, h('h3', { text: `Báo giá · ${type.name}` }),
      quote.lines.map((l) => h('div', { class: 'kv' }, h('span', { text: 'Đêm ' + dm(l.night) }), h('span', { text: money(l.amount) }))),
      h('div', { class: 'kv' }, h('span', { text: 'VAT' }), h('span', { text: money(quote.vat) })),
      h('div', { class: 'kv tot' }, h('span', { text: 'Tổng (đã gồm VAT)' }), h('span', { text: money(quote.total) })),
      h('div', { class: 'kv' }, h('span', { text: 'Cọc yêu cầu' }), h('span', { text: money(quote.deposit) })),
      agent ? h('div', { class: 'kv' }, h('span', { text: 'Hoa hồng dự kiến' }), h('b', { text: money(quote.commission) })) : null,
      h('p', { class: 'note', text: `Báo giá có hiệu lực đến ${new Date(quote.expiresAt).toLocaleString('vi-VN')}.` })));
    renderGuest();
  }

  function renderGuest() {
    const name = h('input', { autocomplete: 'off', maxlength: '120' });
    const phone = h('input', { type: 'tel', inputmode: 'tel', autocomplete: 'off' });
    const agentSel = ctx.role === 'quanly' && cat.agents && cat.agents.length ? select([['', '(không qua sale/CTV)'], ...cat.agents.filter((a) => a.status === 'active').map((a) => [a.id, `${a.name} · ${a.commissionPct}%`])], '') : null;
    const box = h('div');
    const btn = h('button', { class: 'btn', type: 'button', text: agent ? 'Giữ chỗ' : 'Tạo đơn giữ chỗ' });
    btn.addEventListener('click', () => run(btn, box, async () => {
      const body = { roomTypeId: chosen.roomTypeId, checkin: cin.value, checkout: cout.value, guestName: name.value, guestPhone: phone.value || null, adults: Number(adults.value), children: ints(ages.value).length, quoteId: quote.id };
      if (agentSel && agentSel.value) body.agentId = agentSel.value;
      const r = await api('POST', 'api/bookings', body);
      toast(`Đã giữ chỗ ${r.booking.code}`);
      ctx.go('#/don/' + r.booking.id);
    }));
    guestBox.replaceChildren(h('div', { class: 'card stack' }, h('h3', { text: 'Thông tin khách' }),
      h('div', { class: 'row' }, field('Họ tên', name), field('Số điện thoại', phone)), agentSel ? field('Qua sale/CTV', agentSel) : null,
      h('p', { class: 'note', text: agent ? 'Phòng được giữ có thời hạn; khách cọc xong đơn mới chắc chắn.' : 'Hệ thống tự gán căn trống. Thu cọc ở màn chi tiết đơn để chuyển sang "Đã cọc".' }), btn, box));
  }

  main.replaceChildren(
    h('div', { class: 'card stack' }, h('h2', { text: agent ? 'Tìm phòng & giữ chỗ' : 'Tạo đơn' }),
      h('div', { class: 'row' }, field('Ngày đến', cin), field('Ngày đi', cout), field('Người lớn', adults)),
      field('Trẻ em', ages), searchBtn),
    availBox, quoteBox, guestBox);
}
