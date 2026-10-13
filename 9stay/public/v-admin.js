import { h, api, field, select, run, toast, money, dmy, todayVN, addDays, ROLE } from './lib.js';

const SETTING_LABELS = [
  ['pricing.vatPct', 'VAT (%)'], ['pricing.depositPct', 'Cọc mặc định (%)'], ['pricing.extraAdultFee', 'Phụ thu người lớn thêm (đ/đêm)'],
  ['pricing.childFee', 'Phụ thu trẻ em 6–11 tuổi (đ/đêm)'], ['pricing.quoteHours', 'Hạn báo giá (giờ)'], ['booking.holdMinutesStaff', 'Hạn giữ chỗ của nhân viên (phút)'],
  ['booking.holdMinutesAgent', 'Hạn giữ chỗ của sale/CTV (phút)'], ['booking.maxHeldPerAgent', 'Số đơn giữ chỗ tối đa mỗi sale/CTV'], ['ops.cleaningFee', 'Phí dọn mỗi lần (đ)'],
  ['booking.maxNights', 'Số đêm tối đa một đơn'], ['org.codePrefix', 'Tiền tố mã đơn'],
];

// ---- Giá, ưu đãi, cài đặt (quản lý) ----
export async function ratesView(ctx, main) {
  const cat = await ctx.catalog();
  const types = (cat.roomTypes || []).map((t) => [t.id, t.name]);

  const rt = select(types, types[0] && types[0][0]);
  const plan = select([['public', 'Giá công khai'], ['ctv', 'Giá CTV']], 'public');
  const from = h('input', { type: 'date', value: todayVN() });
  const to = h('input', { type: 'date', value: addDays(todayVN(), 30) });
  const price = h('input', { type: 'number', min: '0', step: '1000', inputmode: 'numeric', placeholder: 'Giá trước VAT mỗi đêm' });
  const minStay = h('input', { type: 'number', min: '1', value: '1', inputmode: 'numeric' });
  const closed = h('input', { type: 'checkbox' });
  const rbox = h('div');
  const rbtn = h('button', { class: 'btn', type: 'button', text: 'Lưu giá' });
  rbtn.addEventListener('click', () => run(rbtn, rbox, async () => {
    const r = await api('PUT', 'api/rates', { roomTypeId: rt.value, plan: plan.value, from: from.value, to: to.value, price: Number(price.value), minStay: Number(minStay.value), closed: closed.checked });
    toast(`Đã lưu giá cho ${r.nights} đêm (${r.changed} đêm thay đổi)`);
  }));

  const pname = h('input', { placeholder: 'Tên ưu đãi' });
  const pkind = select([['pct', 'Giảm %'], ['amount_per_night', 'Giảm tiền mỗi đêm']], 'pct');
  const pvalue = h('input', { type: 'number', min: '1', inputmode: 'numeric' });
  const pmin = h('input', { type: 'number', min: '1', value: '1', inputmode: 'numeric' });
  const pfrom = h('input', { type: 'date', value: todayVN() });
  const pto = h('input', { type: 'date', value: addDays(todayVN(), 60) });
  const pplan = select([['', 'Mọi gói'], ['public', 'Giá công khai'], ['ctv', 'Giá CTV']], '');
  const pbox = h('div');
  const pbtn = h('button', { class: 'btn', type: 'button', text: 'Tạo ưu đãi' });
  pbtn.addEventListener('click', () => run(pbtn, pbox, async () => {
    await api('POST', 'api/promotions', { name: pname.value, kind: pkind.value, value: Number(pvalue.value), minNights: Number(pmin.value), stayFrom: pfrom.value, stayTo: pto.value, plan: pplan.value || undefined });
    toast('Đã tạo ưu đãi (mỗi đơn chỉ áp một ưu đãi tốt nhất)');
  }));

  const skey = select(SETTING_LABELS, SETTING_LABELS[0][0]);
  const sval = h('input', { placeholder: 'Giá trị' });
  const sfrom = h('input', { type: 'date', value: todayVN() });
  const sbox = h('div');
  const sbtn = h('button', { class: 'btn', type: 'button', text: 'Lưu cài đặt' });
  sbtn.addEventListener('click', () => run(sbtn, sbox, async () => {
    const raw = sval.value.trim();
    const value = skey.value === 'org.codePrefix' ? raw : Number(raw);
    await api('PUT', 'api/settings', { scopeType: 'org', key: skey.value, value, effectiveFrom: sfrom.value });
    toast('Đã lưu. Chỉ áp cho đơn mới từ ngày hiệu lực.');
  }));

  main.replaceChildren(
    h('div', { class: 'card stack' }, h('h2', { text: 'Giá theo đêm' }),
      h('p', { class: 'note', text: 'Giá nhập là giá TRƯỚC VAT. Khách thấy tổng đã gồm VAT. Đổi giá không ảnh hưởng đơn đã đặt.' }),
      h('div', { class: 'row' }, field('Loại phòng', rt), field('Gói giá', plan)),
      h('div', { class: 'row' }, field('Từ ngày', from), field('Đến ngày (không gồm)', to)),
      h('div', { class: 'row' }, field('Giá (đ)', price), field('Số đêm tối thiểu', minStay), h('div', null, h('label', { text: 'Đóng bán' }), closed)), rbtn, rbox),
    h('div', { class: 'card stack' }, h('h2', { text: 'Ưu đãi' }),
      h('div', { class: 'row' }, field('Tên', pname), field('Loại', pkind), field('Giá trị', pvalue), field('Tối thiểu (đêm)', pmin)),
      h('div', { class: 'row' }, field('Áp dụng từ', pfrom), field('đến (không gồm)', pto), field('Gói giá', pplan)), pbtn, pbox),
    h('div', { class: 'card stack' }, h('h2', { text: 'Cài đặt chung' }), h('div', { class: 'row' }, field('Mục', skey), field('Giá trị', sval), field('Hiệu lực từ', sfrom)), sbtn, sbox));
}

// ---- Thành viên, mã mời, sale/CTV (quản lý) ----
export async function membersView(ctx, main) {
  const cat = await ctx.catalog();
  const owners = cat.owners || [];
  const agents = cat.agents || [];
  const listBox = h('div');
  const invBox = h('div');
  const msg = h('div');

  async function loadMembers() {
    const { members } = await api('GET', 'api/members');
    listBox.replaceChildren(h('ul', { class: 'list' }, members.map((m) => {
      const off = m.status !== 'active';
      const btn = h('button', { class: 'btn small ' + (off ? '' : 'ghost'), type: 'button', text: off ? 'Mở lại' : 'Khóa' });
      btn.addEventListener('click', () => run(btn, msg, async () => {
        await api('POST', `api/members/${m.id}/status`, { status: off ? 'active' : 'disabled' });
        await loadMembers();
      }));
      return h('li', null, h('div', { class: 'item' }, h('div', { class: 'm' }, h('b', { text: m.displayName }), h('small', { text: ROLE[m.role] || m.role })), h('div', { class: 'row tight' }, off ? h('span', { class: 'chip warn', text: 'Đã khóa' }) : null, btn)));
    })));
  }
  async function loadInvites() {
    const { invites } = await api('GET', 'api/invites');
    invBox.replaceChildren(invites.length ? h('ul', { class: 'list' }, invites.map((i) => {
      const btn = h('button', { class: 'btn small ghost', type: 'button', text: 'Thu hồi' });
      btn.addEventListener('click', () => run(btn, msg, async () => { await api('POST', `api/invites/${i.id}/revoke`, {}); await loadInvites(); }));
      return h('li', null, h('div', { class: 'item' }, h('div', { class: 'm' }, h('b', { text: ROLE[i.role] || i.role }), h('small', { text: `Hết hạn ${dmy(i.expiresAt)}` })), btn));
    })) : h('p', { class: 'note', text: 'Không có mã mời nào đang chờ.' }));
  }

  const role = select(Object.entries(ROLE), 'letan');
  const ownerSel = select(owners.map((o) => [o.id, o.name]), owners[0] && owners[0].id);
  const agentSel = select(agents.map((a) => [a.id, a.name]), agents[0] && agents[0].id);
  const ownerField = field('Chủ phòng', ownerSel);
  const agentField = field('Sale/CTV', agentSel);
  const codeBox = h('div');
  const sync = () => { ownerField.hidden = role.value !== 'chu'; agentField.hidden = !['ctv', 'sale'].includes(role.value); };
  role.addEventListener('change', sync);
  const mk = h('button', { class: 'btn', type: 'button', text: 'Tạo mã mời' });
  mk.addEventListener('click', () => run(mk, codeBox, async () => {
    const body = { role: role.value };
    if (role.value === 'chu') body.ownerId = ownerSel.value;
    if (['ctv', 'sale'].includes(role.value)) body.agentId = agentSel.value;
    const r = await api('POST', 'api/invites', body);
    codeBox.replaceChildren(h('div', { class: 'okmsg' }, h('p', { text: 'Mã mời (chỉ hiện một lần, gửi cho người được mời):' }), h('p', { class: 'code', id: 'invite-code', text: r.code }),
      h('p', { class: 'note', text: `Dùng một lần, hết hạn ${dmy(r.expiresAt)}.` })));
    await loadInvites();
  }));

  const an = h('input', { placeholder: 'Tên sale/CTV', maxlength: '120' });
  const ak = select([['ctv', 'Cộng tác viên'], ['sale', 'Sale nội bộ']], 'ctv');
  const ap = h('input', { type: 'number', min: '0', max: '100', value: '10', inputmode: 'numeric' });
  const abox = h('div');
  const ab = h('button', { class: 'btn', type: 'button', text: 'Thêm sale/CTV' });
  ab.addEventListener('click', () => run(ab, abox, async () => {
    await api('POST', 'api/agents', { name: an.value, kind: ak.value, commissionPct: Number(ap.value) });
    toast('Đã thêm. Tạo mã mời để họ đăng nhập.');
    location.reload();
  }));

  main.replaceChildren(msg,
    h('div', { class: 'card' }, h('h2', { text: 'Thành viên' }), listBox),
    h('div', { class: 'grid2' },
      h('div', { class: 'card stack' }, h('h2', { text: 'Mời thành viên' }), field('Vai trò', role), ownerField, agentField, mk, codeBox, h('h3', { text: 'Mã đang chờ dùng' }), invBox),
      h('div', { class: 'card stack' }, h('h2', { text: 'Sale / cộng tác viên' }),
        h('p', { class: 'note', text: agents.length ? agents.map((a) => `${a.name} (${a.commissionPct}%)`).join(', ') : 'Chưa có sale/CTV nào.' }),
        h('div', { class: 'row' }, field('Tên', an), field('Loại', ak), field('Hoa hồng (%)', ap)), ab, abox)));
  sync();
  await Promise.all([loadMembers(), loadInvites()]);
}
