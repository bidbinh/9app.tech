import { h, api, field, select, run, toast, todayVN, addDays, dm, weekday } from './lib.js';

const LABEL = { open: 'Trống', held: 'Giữ chỗ', booked: 'Có khách', owner_use: 'Chủ dùng', blocked_by_owner: 'Chủ chặn', blocked_by_anstay: 'Anstay khóa', closed: 'Chưa mở bán' };
// Mỗi trạng thái có ký hiệu riêng, không chỉ khác màu (người mù màu vẫn phân biệt được).
const SYMBOL = { open: '·', held: '◔', booked: '●', owner_use: '⌂', blocked_by_owner: '✕', blocked_by_anstay: '✕', closed: '–' };

export async function calendarView(ctx, main) {
  const staff = ctx.role === 'quanly' || ctx.role === 'letan';
  const canRelease = ctx.role === 'quanly' || ctx.role === 'chu';
  const today = todayVN();
  const fromIn = h('input', { type: 'date', value: today });
  const daysSel = select([['7', '7 ngày'], ['14', '14 ngày'], ['30', '30 ngày']], '14');
  const gridBox = h('div', { class: 'scroll-x' });
  const msg = h('div');
  const release = canRelease ? await releaseForm(ctx, () => load()) : null;

  async function load() {
    const from = fromIn.value || today;
    const to = addDays(from, Number(daysSel.value));
    try {
      const data = await api('GET', `api/calendar?from=${from}&to=${to}`);
      gridBox.replaceChildren(grid(data));
      msg.replaceChildren();
    } catch (e) { msg.replaceChildren(h('div', { class: 'err', role: 'alert', text: e.message })); }
  }

  function grid(data) {
    if (!data.units.length) return h('p', { class: 'note', text: 'Chưa có căn nào.' });
    const head = h('tr', null, h('th', { class: 'u', text: 'Căn' }), data.nights.map((n) => h('th', { class: n === today ? 'today' : null, scope: 'col' }, weekday(n), h('br'), dm(n))));
    const rows = data.units.map((u) => h('tr', null,
      h('th', { class: 'u', scope: 'row' }, u.code, h('br'), h('span', { class: 'note', text: u.buildingName })),
      u.cells.map((c) => {
        const label = `${u.code} ${dm(c.night)}: ${LABEL[c.state] || c.state}${c.guest ? ' · ' + c.guest : ''}`;
        const btn = h('button', { class: 'cell s-' + c.state, type: 'button', title: label, 'aria-label': label, 'data-state': c.state, 'data-night': c.night, 'data-unit': u.code }, c.bookingId && c.guest ? String(c.guest).slice(0, 6) : SYMBOL[c.state] || '');
        btn.addEventListener('click', () => {
          if (c.bookingId && staff) ctx.go('#/don/' + c.bookingId);
          else if (release) release.pick(u.unitId, c.night);
        });
        return h('td', null, btn);
      })));
    return h('table', { class: 'cal' }, h('thead', null, head), h('tbody', null, rows));
  }

  const shift = (days) => { fromIn.value = addDays(fromIn.value || today, days); load(); };
  fromIn.addEventListener('change', load);
  daysSel.addEventListener('change', load);
  main.replaceChildren(
    h('div', { class: 'card' }, h('div', { class: 'row' },
      h('div', null, h('label', { text: 'Từ ngày' }), fromIn),
      h('div', null, h('label', { text: 'Số ngày' }), daysSel),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn ghost', type: 'button', text: '‹', 'aria-label': 'Lùi', onclick: () => shift(-Number(daysSel.value)) }),
        h('button', { class: 'btn ghost', type: 'button', text: 'Hôm nay', onclick: () => { fromIn.value = today; load(); } }),
        h('button', { class: 'btn ghost', type: 'button', text: '›', 'aria-label': 'Tới', onclick: () => shift(Number(daysSel.value)) })))),
    msg, gridBox,
    h('div', { class: 'legend' },
      h('span', null, h('i'), 'Trống'), h('span', null, h('i', { class: 's-held' }), 'Giữ chỗ'), h('span', null, h('i', { class: 's-booked' }), 'Có khách'),
      h('span', null, h('i', { class: 's-blocked' }), 'Bị chặn'), h('span', { class: 'note', text: staff ? 'Chạm vào ô có khách để mở đơn.' : 'Chạm vào một ô để chọn căn và ngày.' })),
    release ? release.node : null);
  await load();
}

// Chủ phòng và quản lý chặn hoặc mở bán các đêm của căn. Chủ chỉ thấy căn của mình (máy chủ lọc), quản lý thấy tất cả.
async function releaseForm(ctx, reload) {
  const cat = await ctx.catalog();
  const units = cat.units || [];
  const today = todayVN();
  const unit = select(units.map((u) => [u.id, `${u.code} · ${u.buildingName}`]), units[0] && units[0].id);
  const from = h('input', { type: 'date', value: today });
  const to = h('input', { type: 'date', value: addDays(today, 1) });
  const action = select([['block', 'Chặn các đêm'], ['open', 'Mở bán các đêm']], 'block');
  const kinds = [['owner_use', 'Chủ tự dùng'], ['blocked_by_owner', 'Chủ chặn']].concat(ctx.role === 'quanly' ? [['blocked_by_anstay', 'Anstay khóa']] : []);
  const kind = select(kinds, 'owner_use');
  const box = h('div');
  const btn = h('button', { class: 'btn', type: 'button', text: 'Áp dụng' });
  action.addEventListener('change', () => { kind.hidden = action.value !== 'block'; });
  btn.addEventListener('click', () => run(btn, box, async () => {
    const body = { action: action.value, from: from.value, to: to.value };
    if (action.value === 'block') body.kind = kind.value;
    const r = await api('POST', `api/units/${unit.value}/release`, body);
    toast(`Đã ${action.value === 'block' ? 'chặn' : 'mở bán'} ${r.nights} đêm`);
    await reload();
  }));
  const node = h('div', { class: 'card stack' }, h('h2', { text: 'Chặn / mở bán ngày' }),
    h('p', { class: 'note', text: 'Khoảng ngày tính theo đêm: từ ngày đến ngày (không gồm ngày cuối). Đêm đã có khách không chặn được.' }),
    h('div', { class: 'row' }, field('Căn', unit), field('Từ ngày', from), field('Đến ngày', to)),
    h('div', { class: 'row' }, field('Hành động', action), field('Loại chặn', kind)),
    btn, box);
  return {
    node,
    pick(unitId, night) {
      unit.value = unitId; from.value = night; to.value = addDays(night, 1);
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  };
}
