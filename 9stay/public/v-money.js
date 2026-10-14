import { h, api, field, select, run, toast, money, dmy, todayVN, monthStart, nextMonthStart, uuid } from './lib.js';

function linesTable(lines, cols) {
  return h('div', { class: 'scroll-x' }, h('table', null,
    h('thead', null, h('tr', null, cols.map(([, t, n]) => h('th', { class: n ? 'n' : null, text: t })))),
    h('tbody', null, lines.map((l) => h('tr', null, cols.map(([k, , n, fmt]) => h('td', { class: n ? 'n' : null, text: fmt ? fmt(l[k]) : l[k] })))))));
}
const OWNER_COLS = [['booking_code', 'Mã đơn'], ['checkout_date', 'Trả phòng', false, dmy], ['room_revenue', 'Doanh thu phòng', true, money], ['owner_amount', 'Phần chủ', true, money], ['cleaning_fee', 'Phí dọn', true, money], ['amount', 'Thực nhận', true, money]];
const AGENT_COLS = [['booking_code', 'Mã đơn'], ['checkout_date', 'Trả phòng', false, dmy], ['room_revenue', 'Doanh thu phòng', true, money], ['amount', 'Hoa hồng', true, money]];

function monthRange(monthInput) {
  const from = monthStart(monthInput.value + '-01');
  return { from, to: nextMonthStart(from) };
}

// ---- Bản kê chủ phòng (quản lý chốt/chi; chủ xem của mình) ----
export async function statementsView(ctx, main) {
  const quanly = ctx.role === 'quanly';
  const cat = await ctx.catalog();
  const owner = quanly ? select((cat.owners || []).map((o) => [o.id, o.name]), (cat.owners || [])[0] && cat.owners[0].id) : null;
  const month = h('input', { type: 'month', value: todayVN().slice(0, 7) });
  const previewBox = h('div');
  const listBox = h('div');
  const msg = h('div');
  const ownerQs = () => (quanly ? `ownerId=${owner.value}&` : '');

  async function loadList() {
    const { statements } = await api('GET', `api/statements/owner/list?${ownerQs()}`);
    if (!statements.length) { listBox.replaceChildren(h('p', { class: 'note', text: 'Chưa có bản kê nào đã chốt.' })); return; }
    listBox.replaceChildren(h('ul', { class: 'list' }, statements.map((s) => {
      const row = h('li', null, h('div', { class: 'item' },
        h('div', { class: 'm' }, h('b', { text: `${dmy(s.period_start)} → ${dmy(s.period_end)}` }), h('small', { text: `${s.line_count} đơn · phải chi ${money(s.payable)}${s.total_carried ? ` (gồm chuyển kỳ trước ${money(s.total_carried)})` : ''}` })),
        h('div', { class: 'row tight' },
          s.paid ? h('span', { class: 'chip ok', text: 'Đã chi' }) : (quanly && s.payable > 0 ? payoutButton(s) : (s.payable <= 0 ? h('span', { class: 'chip warn', text: 'Không chi' }) : null)),
          h('a', { class: 'btn ghost small', href: `api/statements/owner/${s.id}/csv`, download: '', text: 'CSV' }))));
      return row;
    })));
  }
  function payoutButton(s) {
    const btn = h('button', { class: 'btn small', type: 'button', text: 'Ghi chi trả' });
    btn.addEventListener('click', () => run(btn, null, async () => {
      const ref = window.prompt('Mã tham chiếu khoản chi (ví dụ số giao dịch ngân hàng):', 'chi-' + s.id.slice(0, 8));
      if (!ref) return;
      await api('POST', `api/statements/owner/${s.id}/payout`, { paidOn: todayVN(), ref });
      toast('Đã ghi chi trả');
      await loadList();
    }));
    return btn;
  }
  async function preview() {
    const { from, to } = monthRange(month);
    const { lines, totals } = await api('GET', `api/statements/owner?${ownerQs()}from=${from}&to=${to}`);
    const freeze = quanly && lines.length ? h('button', { class: 'btn', type: 'button', text: 'Chốt bản kê' }) : null;
    const box = h('div');
    if (freeze) freeze.addEventListener('click', () => run(freeze, box, async () => {
      await api('POST', 'api/statements/owner/freeze', { ownerId: owner.value, from, to });
      toast('Đã chốt bản kê');
      previewBox.replaceChildren();
      await loadList();
    }));
    previewBox.replaceChildren(h('div', { class: 'card stack' }, h('h3', { text: `Xem trước ${dmy(from)} → ${dmy(to)}` }),
      lines.length ? linesTable(lines, OWNER_COLS) : h('p', { class: 'note', text: 'Không có quyết toán mới trong kỳ này.' }),
      h('div', { class: 'kv' }, h('span', { text: 'Phần chủ' }), h('span', { text: money(totals.owner) })),
      h('div', { class: 'kv' }, h('span', { text: 'Phí dọn trừ' }), h('span', { text: money(totals.cleaning) })),
      totals.carried ? h('div', { class: 'kv' }, h('span', { text: 'Chuyển kỳ trước' }), h('span', { text: money(totals.carried) })) : null,
      h('div', { class: 'kv tot' }, h('span', { text: 'Phải chi' }), h('span', { text: money(totals.payable) })), freeze, box));
  }

  const previewBtn = h('button', { class: 'btn', type: 'button', text: 'Xem trước kỳ' });
  previewBtn.addEventListener('click', () => run(previewBtn, msg, preview));
  if (owner) owner.addEventListener('change', () => loadList().catch((e) => msg.replaceChildren(h('div', { class: 'err', text: e.message }))));
  main.replaceChildren(
    h('div', { class: 'card stack' }, h('h2', { text: quanly ? 'Bản kê chủ phòng' : 'Bản kê của tôi' }),
      h('div', { class: 'row' }, owner ? field('Chủ phòng', owner) : null, field('Tháng', month)), previewBtn),
    msg, previewBox,
    h('div', { class: 'card' }, h('h3', { text: 'Bản kê đã chốt' }), listBox),
    quanly ? await agentSection(cat) : null,
    quanly ? await custodySection() : null);
  await loadList().catch((e) => msg.replaceChildren(h('div', { class: 'err', role: 'alert', text: e.message })));
}

// ---- Hoa hồng sale/CTV (quản lý chốt/chi) ----
async function agentSection(cat) {
  const agents = (cat.agents || []).filter((a) => a.status === 'active');
  if (!agents.length) return null;
  const agent = select(agents.map((a) => [a.id, `${a.name} · ${a.commissionPct}%`]), agents[0].id);
  const month = h('input', { type: 'month', value: todayVN().slice(0, 7) });
  const out = h('div');
  const btn = h('button', { class: 'btn ghost', type: 'button', text: 'Xem hoa hồng kỳ' });
  btn.addEventListener('click', () => run(btn, out, async () => {
    const { from, to } = monthRange(month);
    const { lines, totals } = await api('GET', `api/statements/agent?agentId=${agent.value}&from=${from}&to=${to}`);
    const freeze = lines.length ? h('button', { class: 'btn', type: 'button', text: 'Chốt & chi hoa hồng' }) : null;
    const fbox = h('div');
    if (freeze) freeze.addEventListener('click', () => run(freeze, fbox, async () => {
      const st = await api('POST', 'api/statements/agent/freeze', { agentId: agent.value, from, to });
      const ref = window.prompt('Mã tham chiếu khoản chi hoa hồng:', 'hh-' + st.id.slice(0, 8));
      if (ref) await api('POST', `api/statements/agent/${st.id}/payout`, { paidOn: todayVN(), ref });
      toast(ref ? 'Đã chốt và ghi chi' : 'Đã chốt bản kê');
      out.replaceChildren();
    }));
    out.replaceChildren(lines.length ? linesTable(lines, AGENT_COLS) : h('p', { class: 'note', text: 'Chưa có hoa hồng mới trong kỳ.' }), h('div', { class: 'kv tot' }, h('span', { text: 'Hoa hồng' }), h('span', { text: money(totals.payable) })), freeze, fbox);
  }));
  return h('div', { class: 'card stack' }, h('h3', { text: 'Hoa hồng sale/CTV' }), h('div', { class: 'row' }, field('Sale/CTV', agent), field('Tháng', month)), btn, out);
}

async function custodySection() {
  const out = h('div');
  const btn = h('button', { class: 'btn ghost', type: 'button', text: 'Xem tiền giữ hộ' });
  btn.addEventListener('click', () => run(btn, out, async () => {
    const r = await api('GET', 'api/reports/custody');
    out.replaceChildren(
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('b', { text: money(r.bank) }), h('span', { text: 'Sổ ngân hàng' })),
        h('div', { class: 'kpi' }, h('b', { text: money(r.owedToOwners) }), h('span', { text: 'Còn nợ chủ phòng' })),
        h('div', { class: 'kpi' }, h('b', { text: money(r.vatPayable) }), h('span', { text: 'VAT phải nộp' })),
        h('div', { class: 'kpi' }, h('b', { text: money(r.agentCommissionPayable) }), h('span', { text: 'Hoa hồng phải chi' }))),
      linesTable(r.owners, [['name', 'Chủ phòng'], ['owed', 'Còn nợ', true, money]]),
      h('p', { class: 'note', text: 'Đối chiếu "Sổ ngân hàng" với số dư thật của tài khoản ngân hàng mỗi ngày.' }));
  }));
  return h('div', { class: 'card stack' }, h('h3', { text: 'Tiền giữ hộ' }), btn, out);
}

// ---- Sale/CTV xem hoa hồng của mình ----
export async function commissionView(ctx, main) {
  const month = h('input', { type: 'month', value: todayVN().slice(0, 7) });
  const out = h('div');
  const msg = h('div');
  async function load() {
    const { from, to } = monthRange(month);
    const { lines, totals } = await api('GET', `api/statements/agent?from=${from}&to=${to}`);
    out.replaceChildren(h('div', { class: 'card stack' }, h('h3', { text: `Hoa hồng ${dmy(from)} → ${dmy(to)}` }),
      lines.length ? linesTable(lines, AGENT_COLS) : h('p', { class: 'note', text: 'Chưa có hoa hồng phát sinh trong kỳ (tính khi khách trả phòng).' }),
      h('div', { class: 'kv tot' }, h('span', { text: 'Tổng hoa hồng chưa chốt' }), h('span', { text: money(totals.payable) }))));
  }
  month.addEventListener('change', () => load().catch((e) => msg.replaceChildren(h('div', { class: 'err', text: e.message }))));
  main.replaceChildren(h('div', { class: 'card stack' }, h('h2', { text: 'Hoa hồng của tôi' }), field('Tháng', month), h('p', { class: 'note', text: 'Hoa hồng được tính trên tiền phòng khi khách trả phòng; quản lý chốt và chi theo tháng.' })), msg, out);
  await load();
}
