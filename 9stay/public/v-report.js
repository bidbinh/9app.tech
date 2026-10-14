import { h, api, field, run, money, todayVN, addDays, monthStart, nextMonthStart } from './lib.js';

const pct = (v) => (v === null ? '–' : `${v.toLocaleString('vi-VN')}%`);
const vnd = (v) => (v === null ? '–' : money(v));

// Báo cáo công suất / ADR / RevPAR (quản lý). Doanh thu là tiền phòng trước VAT, chỉ đơn đã cọc trở lên.
export async function reportView(ctx, main) {
  const from = h('input', { type: 'date', value: monthStart(todayVN()) });
  const to = h('input', { type: 'date', value: nextMonthStart(todayVN()) });
  const out = h('div');
  const msg = h('div');
  const btn = h('button', { class: 'btn', type: 'button', text: 'Xem báo cáo' });

  async function load() {
    const r = await api('GET', `api/reports/occupancy?from=${from.value}&to=${to.value}`);
    const t = r.total;
    const row = (x) => h('tr', null, h('td', { text: x.name }), h('td', { class: 'n', text: x.available }), h('td', { class: 'n', text: x.external ? `${x.sold} (+${x.external} OTA)` : x.sold }),
      h('td', { class: 'n', text: pct(x.occupancyPct) }), h('td', { class: 'n', text: vnd(x.adr) }), h('td', { class: 'n', text: vnd(x.revpar) }), h('td', { class: 'n', text: money(x.revenue) }));
    out.replaceChildren(
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('b', { text: pct(t.occupancyPct) }), h('span', { text: 'Công suất' })),
        h('div', { class: 'kpi' }, h('b', { text: vnd(t.adr) }), h('span', { text: 'ADR (giá TB/đêm)' })),
        h('div', { class: 'kpi' }, h('b', { text: vnd(t.revpar) }), h('span', { text: 'RevPAR' })),
        h('div', { class: 'kpi' }, h('b', { text: money(t.revenue) }), h('span', { text: 'Doanh thu phòng' }))),
      h('div', { class: 'scroll-x' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { text: 'Loại phòng' }), h('th', { class: 'n', text: 'Đêm bán được' }), h('th', { class: 'n', text: 'Đêm đã bán' }), h('th', { class: 'n', text: 'Công suất' }), h('th', { class: 'n', text: 'ADR' }), h('th', { class: 'n', text: 'RevPAR' }), h('th', { class: 'n', text: 'Doanh thu' }))),
        h('tbody', null, r.byType.map(row), row(t)))),
      h('p', { class: 'note', text: 'Đêm bán được = đêm chủ đã mở bán (không tính đêm chủ dùng/chặn). Doanh thu trước VAT, chỉ đơn đã cọc, đang ở hoặc đã trả.' }));
  }
  btn.addEventListener('click', () => run(btn, msg, load));
  main.replaceChildren(h('div', { class: 'card stack' }, h('h2', { text: 'Công suất và doanh thu phòng' }),
    h('div', { class: 'row' }, field('Từ ngày', from), field('Đến ngày (không gồm)', to)),
    h('div', { class: 'row tight' }, h('button', { class: 'btn ghost small', type: 'button', text: 'Tháng này', onclick: () => { from.value = monthStart(todayVN()); to.value = nextMonthStart(todayVN()); load().catch(() => {}); } }),
      h('button', { class: 'btn ghost small', type: 'button', text: '30 ngày tới', onclick: () => { from.value = todayVN(); to.value = addDays(todayVN(), 30); load().catch(() => {}); } })),
    btn, msg), out);
  await load();
}
