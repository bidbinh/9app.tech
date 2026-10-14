import { h, api, field, select, run, toast, money, dmy, todayVN, addDays } from './lib.js';

const LEGAL = [['can_ho_du_lich', 'Căn hộ du lịch'], ['nha_o', 'Nhà ở'], ['khac', 'Khác']];
const KIND_OWNER = [['ca_nhan', 'Cá nhân'], ['to_chuc', 'Tổ chức']];

// Danh mục nền (chỉ quản lý): tòa nhà → loại phòng → chủ phòng → căn → hợp đồng chủ → mở bán đêm.
export async function setupView(ctx, main) {
  const msg = h('div');
  const body = h('div');
  main.replaceChildren(msg, body);
  const selected = new Set();

  async function load() {
    const s = await api('GET', 'api/setup');
    if (ctx.resetCatalog) ctx.resetCatalog();
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    const B = byId(s.buildings); const O = byId(s.owners); const R = byId(s.roomTypes);
    const contractOf = new Set(s.contracts.map((k) => k.unitId));
    for (const id of [...selected]) if (!s.units.some((u) => u.id === id)) selected.delete(id);

    const after = async () => { await load(); };
    const form = (title, hint, fields, label, onSave) => {
      const box = h('div');
      const btn = h('button', { class: 'btn', type: 'button', text: label });
      btn.addEventListener('click', () => run(btn, box, async () => { const m = await onSave(); await after(); if (m) toast(m); }));
      return h('div', { class: 'card stack' }, h('h3', { text: title }), hint ? h('p', { class: 'note', text: hint }) : null, ...fields, btn, box);
    };

    // 1. Tòa nhà
    const bn = h('input', { maxlength: '120', placeholder: 'Ví dụ: Vinhomes Ocean Park' });
    const ba = h('input', { maxlength: '200', placeholder: 'Địa chỉ' });
    const bl = select(LEGAL, 'can_ho_du_lich');
    const cardB = form('1. Tòa nhà', `Đã có: ${s.buildings.map((b) => b.name).join(', ') || 'chưa có'}`, [h('div', { class: 'row' }, field('Tên tòa', bn), field('Địa chỉ', ba), field('Loại hình', bl))], 'Thêm tòa nhà',
      async () => { await api('POST', 'api/setup/buildings', { name: bn.value, address: ba.value, legalType: bl.value }); return 'Đã thêm tòa nhà'; });

    // 2. Loại phòng
    const rn = h('input', { maxlength: '80', placeholder: 'Studio, 1 phòng ngủ…' });
    const rs = h('input', { type: 'number', min: '1', max: '30', value: '2', inputmode: 'numeric' });
    const rm = h('input', { type: 'number', min: '1', max: '30', value: '4', inputmode: 'numeric' });
    const cardR = form('2. Loại phòng', `Đã có: ${s.roomTypes.map((r) => `${r.name} (${r.capacityStd}-${r.capacityMax} người)`).join(', ') || 'chưa có'}`,
      [h('div', { class: 'row' }, field('Tên loại', rn), field('Sức chứa chuẩn', rs), field('Sức chứa tối đa', rm))], 'Thêm loại phòng',
      async () => { await api('POST', 'api/setup/room-types', { name: rn.value, capacityStd: Number(rs.value), capacityMax: Number(rm.value) }); return 'Đã thêm loại phòng'; });

    // 3. Chủ phòng
    const on = h('input', { maxlength: '120', placeholder: 'Tên chủ phòng' });
    const ok = select(KIND_OWNER, 'ca_nhan');
    const ot = h('input', { maxlength: '20', placeholder: 'Mã số thuế (nếu có)' });
    const cardO = form('3. Chủ phòng', `Đã có: ${s.owners.map((o) => o.name).join(', ') || 'chưa có'}`, [h('div', { class: 'row' }, field('Tên', on), field('Loại', ok), field('Mã số thuế', ot))], 'Thêm chủ phòng',
      async () => { await api('POST', 'api/setup/owners', { name: on.value, kind: ok.value, taxId: ot.value }); return 'Đã thêm chủ phòng'; });

    // 4. Căn
    const ub = select(s.buildings.map((b) => [b.id, b.name]), s.buildings[0] && s.buildings[0].id);
    const uo = select(s.owners.map((o) => [o.id, o.name]), s.owners[0] && s.owners[0].id);
    const ur = select(s.roomTypes.map((r) => [r.id, r.name]), s.roomTypes[0] && s.roomTypes[0].id);
    const uc = h('textarea', { rows: '4', placeholder: 'Mỗi dòng một mã căn, ví dụ:\nOP-101\nOP-102' });
    const uf = h('input', { type: 'number', inputmode: 'numeric', placeholder: 'Tầng (không bắt buộc)' });
    const ready = s.buildings.length && s.owners.length && s.roomTypes.length;
    const cardU = form('4. Căn', ready ? 'Tạo nhiều căn cùng lúc: cùng tòa, chủ và loại phòng.' : 'Cần có ít nhất một tòa nhà, một loại phòng và một chủ phòng trước.',
      [h('div', { class: 'row' }, field('Tòa', ub), field('Chủ phòng', uo), field('Loại phòng', ur)), field('Mã căn (mỗi dòng một mã)', uc), field('Tầng', uf)], 'Thêm các căn',
      async () => {
        const codes = uc.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        await api('POST', 'api/setup/units', { buildingId: ub.value, ownerId: uo.value, roomTypeId: ur.value, codes, floor: uf.value === '' ? undefined : Number(uf.value) });
        return `Đã thêm ${codes.length} căn`;
      });

    // Danh sách căn (chọn để áp hợp đồng / mở bán)
    const unitRows = s.units.map((u) => {
      const cb = h('input', { type: 'checkbox', checked: selected.has(u.id), 'aria-label': 'Chọn căn ' + u.code });
      cb.addEventListener('change', () => { if (cb.checked) selected.add(u.id); else selected.delete(u.id); count.textContent = String(selected.size); });
      const tog = h('button', { class: 'btn small ghost', type: 'button', text: u.status === 'active' ? 'Ngừng bán' : 'Bán lại' });
      tog.addEventListener('click', () => run(tog, msg, async () => { await api('POST', `api/setup/units/${u.id}/status`, { status: u.status === 'active' ? 'inactive' : 'active' }); await after(); }));
      return h('tr', null, h('td', null, cb), h('td', { text: u.code }), h('td', { text: (B[u.buildingId] || {}).name }), h('td', { text: (O[u.ownerId] || {}).name }), h('td', { text: (R[u.roomTypeId] || {}).name }),
        h('td', { class: 'n', text: String(u.openNights) }), h('td', null, contractOf.has(u.id) ? h('span', { class: 'chip ok', text: 'Có HĐ' }) : h('span', { class: 'chip warn', text: 'Chưa có HĐ' })),
        h('td', null, u.status === 'active' ? null : h('span', { class: 'chip warn', text: 'Ngừng bán' }), ' ', tog));
    });
    const count = h('b', { text: String(selected.size) });
    const all = h('input', { type: 'checkbox', 'aria-label': 'Chọn tất cả' });
    all.addEventListener('change', () => { selected.clear(); if (all.checked) s.units.forEach((u) => selected.add(u.id)); body.querySelectorAll('tbody input[type=checkbox]').forEach((x) => { x.checked = all.checked; }); count.textContent = String(selected.size); });
    const list = h('div', { class: 'card stack' }, h('h3', { text: `Các căn (${s.units.length})` }),
      s.units.length ? h('div', { class: 'scroll-x' }, h('table', null, h('thead', null, h('tr', null, h('th', null, all), h('th', { text: 'Mã' }), h('th', { text: 'Tòa' }), h('th', { text: 'Chủ' }), h('th', { text: 'Loại' }), h('th', { class: 'n', text: 'Đêm mở' }), h('th', { text: 'Hợp đồng' }), h('th', null))), h('tbody', null, unitRows)))
        : h('p', { class: 'note', text: 'Chưa có căn nào.' }),
      h('p', { class: 'note' }, 'Đã chọn ', count, ' căn. Hợp đồng và mở bán bên dưới áp cho các căn đã chọn.'));

    // 5. Hợp đồng chủ
    const ck = select([['revenue_share', 'Chia doanh thu'], ['master_lease', 'Thuê lại trọn gói']], 'revenue_share');
    const cf = h('input', { type: 'date', value: todayVN() });
    const ct = h('input', { type: 'date' });
    const cs = h('input', { type: 'number', min: '0', max: '100', value: '70', inputmode: 'numeric' });
    const cn = h('input', { type: 'number', min: '0', step: '1000', value: '0', inputmode: 'numeric' });
    const cx = h('input', { type: 'number', min: '0', step: '1000', value: '0', inputmode: 'numeric' });
    const cp = select([['owner', 'Chủ phòng'], ['anstay', 'Anstay'], ['guest', 'Khách']], 'owner');
    const cd = h('input', { type: 'number', min: '0', max: '365', value: '3', inputmode: 'numeric' });
    const cardK = form('5. Hợp đồng chủ (áp cho các căn đã chọn)', 'Chủ nhận bao nhiêu % doanh thu phòng, sàn chủ nhận tối thiểu mỗi đêm, ai trả phí dọn, bao lâu sau trả phòng thì chi trả.',
      [h('div', { class: 'row' }, field('Loại hợp đồng', ck), field('Hiệu lực từ', cf), field('Đến (không gồm; để trống = không hạn)', ct)),
        h('div', { class: 'row' }, field('Chủ nhận (%)', cs), field('Sàn chủ nhận mỗi đêm (đ)', cn), field('Tiền thuê cố định (đ)', cx)),
        h('div', { class: 'row' }, field('Phí dọn do', cp), field('Chi trả sau trả phòng (ngày)', cd))], 'Tạo hợp đồng cho các căn đã chọn',
      async () => {
        const r = await api('POST', 'api/setup/contracts', { unitIds: [...selected], validFrom: cf.value, validTo: ct.value || undefined, kind: ck.value, ownerSharePct: Number(cs.value), ownerNetFloor: Number(cn.value), fixedRent: Number(cx.value), cleaningPayer: cp.value, payoutDelayDays: Number(cd.value) });
        return `Đã tạo ${r.ids.length} hợp đồng`;
      });

    // 6. Mở bán
    const nf = h('input', { type: 'date', value: todayVN() });
    const nt = h('input', { type: 'date', value: addDays(todayVN(), 90) });
    const cardN = form('6. Mở bán đêm (áp cho các căn đã chọn)', 'Đêm không mở bán thì khách và CTV không đặt được. Khoảng tối đa 366 đêm.',
      [h('div', { class: 'row' }, field('Từ ngày', nf), field('Đến ngày (không gồm)', nt))], 'Mở bán cho các căn đã chọn',
      async () => { const r = await api('POST', 'api/setup/open-nights', { unitIds: [...selected], from: nf.value, to: nt.value }); return `Đã mở ${r.nightsPerUnit} đêm cho ${r.units} căn`; });

    body.replaceChildren(
      h('div', { class: 'card' }, h('h2', { text: 'Danh mục' }), h('p', { class: 'note', text: 'Làm lần lượt 1 → 6. Sau đó vào tab Giá để đặt giá theo loại phòng, rồi Thành viên để mời lễ tân, CTV, chủ phòng.' })),
      h('div', { class: 'grid2' }, cardB, cardR), h('div', { class: 'grid2' }, cardO, cardU), list, h('div', { class: 'grid2' }, cardK, cardN));
  }

  try { await load(); } catch (e) { msg.replaceChildren(h('div', { class: 'err', role: 'alert', text: e.message })); }
}
