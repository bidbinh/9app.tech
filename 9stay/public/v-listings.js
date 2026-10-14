import { h, api, field, select, run, toast, money, dmy } from './lib.js';

const ST = { draft: ['Nháp', 'warn'], pending: ['Chờ duyệt', 'warn'], approved: ['Đang hiển thị', 'ok'], rejected: ['Bị từ chối', 'huy'], suspended: ['Tạm ngưng', 'huy'] };
const stChip = (s) => h('span', { class: 'chip ' + (ST[s] ? ST[s][1] : ''), text: ST[s] ? ST[s][0] : s });
const photoUrl = (id) => 'api/photos/' + id;

// Thu nhỏ ảnh ở trình duyệt (cạnh dài tối đa 1600px, JPEG): máy chủ không giải mã ảnh nên ảnh phải gọn từ phía người dùng.
export async function shrinkImage(file, { maxSide = 1600, maxBytes = 1_400_000 } = {}) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Chỉ chọn ảnh JPEG, PNG hoặc WebP');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error('Ảnh quá lớn, hãy chọn ảnh nhỏ hơn');
}

async function uploadPhoto(listingId, blob) {
  const res = await fetch(new URL(`api/listings/${listingId}/photos`, document.baseURI), { method: 'POST', headers: { 'content-type': blob.type, 'x-requested-with': '9stay' }, body: blob, credentials: 'same-origin' });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error((j && j.error && j.error.message) || `Lỗi ${res.status}`);
  return j;
}

// ---- Chủ phòng: danh sách tin ----
export async function myListingsView(ctx, main) {
  const { listings } = await api('GET', 'api/listings');
  const newBtn = h('a', { class: 'btn', href: '#/phong/moi', text: '+ Đăng phòng mới' });
  main.replaceChildren(
    h('div', { class: 'card row' }, h('div', null, h('h2', { text: 'Phòng của tôi' }), h('p', { class: 'note', text: 'Đăng phòng, gửi duyệt, theo dõi trạng thái. Sau khi được duyệt, bạn tự mở đêm cho thuê ở tab Lịch.' })), h('div', { class: 'row tight' }, newBtn)),
    listings.length ? h('div', { class: 'cards' }, listings.map((l) => h('a', { class: 'lcard', href: '#/phong/' + l.id },
      l.cover ? h('img', { src: photoUrl(l.cover), alt: '', loading: 'lazy' }) : h('div', { class: 'noimg', text: 'Chưa có ảnh' }),
      h('div', { class: 'lbody' }, h('b', { text: l.title || '(chưa đặt tên)' }), h('small', { text: `${l.buildingName} · ${l.units} căn · ${l.photos} ảnh` }),
        h('div', { class: 'row tight' }, stChip(l.status), l.livePrice ? h('span', { class: 'note', text: money(l.livePrice) + '/đêm' }) : null, l.pendingPrice ? h('span', { class: 'chip warn', text: 'Chờ duyệt giá ' + money(l.pendingPrice) }) : null),
        l.status === 'rejected' && l.rejectReason ? h('small', { class: 'err', text: 'Lý do: ' + l.rejectReason }) : null)))) : h('div', { class: 'card' }, h('p', { class: 'note', text: 'Bạn chưa có tin nào. Bấm "Đăng phòng mới" để bắt đầu.' })));
}

// ---- Chủ phòng / quản lý: tạo và sửa tin ----
export async function listingEditorView(ctx, main, id) {
  const meta = await api('GET', 'api/listing-meta');
  if (id === 'moi') return newListingView(ctx, main);
  const d = await api('GET', 'api/listings/' + id);
  const reload = () => listingEditorView(ctx, main, id);
  const locked = d.status === 'pending';
  const approvedLike = ['approved', 'suspended'].includes(d.status);
  const msg = h('div');

  const title = h('input', { maxlength: '100', value: d.title, disabled: locked });
  const desc = h('textarea', { rows: '6', maxlength: '4000', disabled: locked }); desc.value = d.description;
  const rules = h('textarea', { rows: '3', maxlength: '1500', disabled: locked }); rules.value = d.houseRules;
  const num = (v, min, max) => h('input', { type: 'number', min: String(min), max: String(max), value: String(v), inputmode: 'numeric', disabled: locked });
  const bedrooms = num(d.bedrooms, 0, 20); const beds = num(d.beds, 1, 40); const baths = num(d.bathrooms, 0, 20);
  const cStd = num(d.capacityStd, 1, 30); const cMax = num(d.capacityMax, 1, 30);
  const cancel = select(meta.cancelPolicies.map((p) => [p.code, p.label]), d.cancelPolicy, { disabled: locked });
  const cancelNote = h('p', { class: 'note', text: (meta.cancelPolicies.find((p) => p.code === d.cancelPolicy) || {}).text || '' });
  cancel.addEventListener('change', () => { cancelNote.textContent = (meta.cancelPolicies.find((p) => p.code === cancel.value) || {}).text || ''; });
  const price = h('input', { type: 'number', min: '50000', step: '1000', value: d.proposedPrice || '', inputmode: 'numeric', disabled: locked || approvedLike, placeholder: 'đ/đêm, chưa gồm VAT' });
  const wprice = h('input', { type: 'number', min: '50000', step: '1000', value: d.proposedWeekendPrice || '', inputmode: 'numeric', disabled: locked || approvedLike, placeholder: 'Thứ Sáu, thứ Bảy' });
  const attest = h('input', { type: 'checkbox', id: 'attest', checked: d.attest, disabled: locked || approvedLike });
  const amen = new Set(d.amenities);
  const amenBox = h('div', { class: 'amen' }, meta.amenities.map((a) => {
    const cb = h('input', { type: 'checkbox', id: 'am-' + a.code, checked: amen.has(a.code), disabled: locked });
    cb.addEventListener('change', () => { if (cb.checked) amen.add(a.code); else amen.delete(a.code); });
    return h('label', { class: 'chk', for: 'am-' + a.code }, cb, ' ' + a.label);
  }));

  const save = h('button', { class: 'btn', type: 'button', text: 'Lưu', disabled: locked });
  save.addEventListener('click', () => run(save, msg, async () => {
    const body = { title: title.value, description: desc.value, houseRules: rules.value, amenities: [...amen], cancelPolicy: cancel.value, bedrooms: Number(bedrooms.value), beds: Number(beds.value), bathrooms: Number(baths.value), capacityStd: Number(cStd.value), capacityMax: Number(cMax.value) };
    if (!approvedLike) { body.proposedPrice = Number(price.value) || 0; body.proposedWeekendPrice = Number(wprice.value) || 0; body.attest = attest.checked; }
    await api('PUT', 'api/listings/' + id, body);
    toast('Đã lưu');
    await reload();
  }));
  const submit = h('button', { class: 'btn', type: 'button', text: d.status === 'rejected' ? 'Gửi duyệt lại' : 'Gửi duyệt', hidden: !['draft', 'rejected'].includes(d.status) });
  submit.addEventListener('click', () => run(submit, msg, async () => {
    const body = { title: title.value, description: desc.value, houseRules: rules.value, amenities: [...amen], cancelPolicy: cancel.value, bedrooms: Number(bedrooms.value), beds: Number(beds.value), bathrooms: Number(baths.value), capacityStd: Number(cStd.value), capacityMax: Number(cMax.value), proposedPrice: Number(price.value) || 0, proposedWeekendPrice: Number(wprice.value) || 0, attest: attest.checked };
    await api('PUT', 'api/listings/' + id, body);
    await api('POST', `api/listings/${id}/submit`, {});
    toast('Đã gửi duyệt');
    await reload();
  }));
  const del = h('button', { class: 'btn bad small', type: 'button', text: 'Xóa tin nháp', hidden: d.status !== 'draft' });
  del.addEventListener('click', () => run(del, msg, async () => { if (!window.confirm('Xóa tin nháp này cùng ảnh và căn tạo kèm?')) return; await api('POST', `api/listings/${id}/delete`, {}); ctx.go('#/phong'); }));

  // Căn
  const codes = h('textarea', { rows: '3', placeholder: 'Mỗi dòng một mã căn mới', disabled: !['draft', 'rejected'].includes(d.status) });
  const addUnits = h('button', { class: 'btn small', type: 'button', text: 'Thêm căn', disabled: !['draft', 'rejected'].includes(d.status) });
  addUnits.addEventListener('click', () => run(addUnits, msg, async () => { await api('POST', `api/listings/${id}/units`, { codes: codes.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) }); await reload(); }));
  const unitList = h('ul', { class: 'list' }, d.units.map((u) => {
    const rm = h('button', { class: 'btn small ghost', type: 'button', text: 'Bớt', hidden: !['draft', 'rejected'].includes(d.status) });
    rm.addEventListener('click', () => run(rm, msg, async () => { await api('POST', `api/listings/${id}/units/${u.id}/remove`, {}); await reload(); }));
    return h('li', null, h('div', { class: 'item' }, h('div', { class: 'm' }, h('b', { text: u.code }), h('small', { text: u.status === 'active' ? 'Đang hoạt động' : 'Chưa hoạt động (chờ duyệt)' })), rm));
  }));
  const assigned = h('div');
  if (ctx.role === 'chu' && ['draft', 'rejected'].includes(d.status)) {
    api('GET', 'api/listings/unassigned-units').then(({ units }) => {
      const mine = units.filter((u) => u.buildingId === d.building.id);
      if (!mine.length) return;
      const sel = select(mine.map((u) => [u.id, `${u.code} · ${u.buildingName}`]), mine[0].id);
      const b = h('button', { class: 'btn small ghost', type: 'button', text: 'Gắn căn được gán cho tôi' });
      b.addEventListener('click', () => run(b, msg, async () => { await api('POST', `api/listings/${id}/units`, { unitIds: [sel.value] }); await reload(); }));
      assigned.replaceChildren(h('div', { class: 'row' }, field('Căn Anstay đã gán cho bạn', sel), h('div', null, b)));
    }).catch(() => {});
  }

  // Ảnh
  const grid = h('div', { class: 'photos' }, d.photos.map((p, i) => {
    const del1 = h('button', { class: 'btn small bad', type: 'button', text: 'Xóa', disabled: locked });
    del1.addEventListener('click', () => run(del1, msg, async () => { await api('POST', `api/listings/${id}/photos/${p.id}/delete`, {}); await reload(); }));
    const cover = h('button', { class: 'btn small ghost', type: 'button', text: i === 0 ? 'Ảnh bìa' : 'Đặt làm bìa', disabled: locked || i === 0 });
    cover.addEventListener('click', () => run(cover, msg, async () => { await api('POST', `api/listings/${id}/photos/order`, { ids: [p.id, ...d.photos.filter((x) => x.id !== p.id).map((x) => x.id)] }); await reload(); }));
    return h('div', { class: 'ph' }, h('img', { src: photoUrl(p.id), alt: '' }), h('div', { class: 'row tight' }, cover, del1));
  }));
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, disabled: locked, id: 'photo-input' });
  const upMsg = h('div');
  file.addEventListener('change', async () => {
    upMsg.replaceChildren(h('p', { class: 'note', text: 'Đang tải ảnh…' }));
    try {
      for (const f of file.files) { await uploadPhoto(id, await shrinkImage(f)); }
      await reload();
    } catch (e) { upMsg.replaceChildren(h('div', { class: 'err', role: 'alert', text: e.message })); }
  });

  main.replaceChildren(
    h('a', { href: '#/phong', class: 'back', text: '‹ Phòng của tôi' }), msg,
    h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { text: d.title || 'Tin mới' }), h('div', null, stChip(d.status))),
      h('p', { class: 'note', text: `${d.building.name}${d.building.province ? ' · ' + d.building.province : ''}${d.building.status === 'pending' ? ' (tòa đang chờ duyệt)' : ''}` }),
      d.status === 'rejected' ? h('div', { class: 'err', text: 'Bị từ chối: ' + d.rejectReason }) : null,
      locked ? h('div', { class: 'warnbox', text: 'Tin đang chờ admin duyệt, chưa sửa được.' }) : null,
      d.status === 'approved' ? h('div', { class: 'okmsg', text: 'Tin đang hiển thị cho khách. Mở đêm cho thuê ở tab Lịch.' }) : null),
    h('div', { class: 'card stack' }, h('h3', { text: 'Thông tin phòng' }), field('Tiêu đề (10–100 ký tự)', title), field('Mô tả (tối thiểu 50 ký tự)', desc),
      h('div', { class: 'row' }, field('Phòng ngủ', bedrooms), field('Giường', beds), field('Phòng tắm', baths), field('Khách chuẩn', cStd), field('Khách tối đa', cMax))),
    h('div', { class: 'card stack' }, h('h3', { text: 'Tiện nghi' }), amenBox),
    h('div', { class: 'card stack' }, h('h3', { text: 'Nội quy và chính sách hủy' }), field('Nội quy', rules), field('Chính sách hủy', cancel), cancelNote),
    h('div', { class: 'card stack' }, h('h3', { text: `Căn (${d.units.length})` }), unitList, d.units.length ? null : h('p', { class: 'note', text: 'Thêm ít nhất một căn. Nhiều căn giống hệt nhau (khách sạn mini) có thể gộp chung một tin.' }), field('Thêm căn mới', codes), addUnits, assigned),
    h('div', { class: 'card stack' }, h('h3', { text: `Ảnh (${d.photos.length}/${meta.limits.maxPhotos})` }), h('p', { class: 'note', text: `Cần ít nhất ${meta.limits.minPhotosToSubmit} ảnh. Ảnh đầu tiên là ảnh bìa. Ảnh được tự thu nhỏ trước khi tải.` }), grid, h('label', { class: 'btn ghost', for: 'photo-input', text: 'Chọn ảnh để tải lên' }), file, upMsg),
    h('div', { class: 'card stack' }, h('h3', { text: 'Giá' }), approvedLike ? h('p', { class: 'note', text: `Giá đang chạy: ${money(d.livePrice)} ngày thường, ${money(d.liveWeekendPrice)} cuối tuần (chưa gồm VAT). Muốn đổi, gửi đề xuất để admin duyệt.` }) : h('p', { class: 'note', text: 'Giá bạn đề xuất (chưa gồm VAT). Admin có thể chỉnh khi duyệt.' }),
      h('div', { class: 'row' }, field('Ngày thường (đ/đêm)', price), field('Thứ Sáu, thứ Bảy (đ/đêm)', wprice)),
      approvedLike ? priceChangeBox(d, msg, reload) : null,
      h('div', { class: 'row tight' }, attest, h('label', { for: 'attest', text: 'Tôi xác nhận tòa nhà cho phép cho thuê ngắn ngày và chịu trách nhiệm về thông tin đã đăng.' }))),
    h('div', { class: 'row tight' }, save, submit, del));
}

function priceChangeBox(d, msg, reload) {
  const p = h('input', { type: 'number', min: '50000', step: '1000', inputmode: 'numeric', value: String(d.livePrice) });
  const w = h('input', { type: 'number', min: '50000', step: '1000', inputmode: 'numeric', value: String(d.liveWeekendPrice) });
  const b = h('button', { class: 'btn small', type: 'button', text: 'Đề xuất đổi giá', disabled: !!d.priceChange });
  b.addEventListener('click', () => run(b, msg, async () => { await api('POST', `api/listings/${d.id}/price-change`, { price: Number(p.value), weekendPrice: Number(w.value) }); toast('Đã gửi đề xuất, chờ admin duyệt'); await reload(); }));
  return h('div', { class: 'stack' }, d.priceChange ? h('div', { class: 'warnbox', text: `Đang chờ duyệt giá ${money(d.priceChange.price)} / ${money(d.priceChange.weekendPrice)}` }) : null,
    h('div', { class: 'row' }, field('Giá mới ngày thường', p), field('Giá mới cuối tuần', w), h('div', null, b)));
}

async function newListingView(ctx, main) {
  const msg = h('div');
  const { buildings } = await api('GET', 'api/my/buildings');
  const isMgr = ctx.role === 'quanly';
  let owners = [];
  if (isMgr) owners = (await ctx.catalog()).owners || [];
  const approved = buildings.filter((b) => b.status === 'approved' || isMgr);
  const bsel = select(approved.map((b) => [b.id, b.name + (b.status === 'pending' ? ' (chờ duyệt)' : '') + (b.province ? ' · ' + b.province : '')]), approved[0] && approved[0].id);
  const osel = isMgr ? select(owners.map((o) => [o.id, o.name]), owners[0] && owners[0].id) : null;
  const title = h('input', { maxlength: '100', placeholder: 'Ví dụ: Studio view biển tầng cao' });
  const go = h('button', { class: 'btn', type: 'button', text: 'Tạo tin và tiếp tục' });
  go.addEventListener('click', () => run(go, msg, async () => {
    const body = { buildingId: bsel.value, title: title.value };
    if (isMgr) body.ownerId = osel.value;
    const r = await api('POST', 'api/listings', body);
    ctx.go('#/phong/' + r.id);
  }));
  // đề xuất tòa mới
  const bn = h('input', { maxlength: '120', placeholder: 'Tên tòa nhà' });
  const ba = h('input', { maxlength: '200', placeholder: 'Địa chỉ đầy đủ' });
  const bp = h('input', { maxlength: '60', placeholder: 'Tỉnh/thành, ví dụ Hà Nội' });
  const bd = h('input', { maxlength: '60', placeholder: 'Quận/huyện' });
  const bl = select([['can_ho_du_lich', 'Căn hộ du lịch'], ['nha_o', 'Nhà ở'], ['khac', 'Khác']], 'can_ho_du_lich');
  const pb = h('button', { class: 'btn ghost', type: 'button', text: 'Đề xuất tòa nhà này' });
  pb.addEventListener('click', () => run(pb, msg, async () => { await api('POST', 'api/buildings/propose', { name: bn.value, address: ba.value, province: bp.value, district: bd.value, legalType: bl.value }); toast('Đã gửi đề xuất tòa nhà (tin vẫn tạo được, admin duyệt tòa trước)'); await newListingView(ctx, main); }));
  main.replaceChildren(h('a', { href: '#/phong', class: 'back', text: '‹ Phòng của tôi' }), msg,
    h('div', { class: 'card stack' }, h('h2', { text: 'Đăng phòng mới' }), isMgr ? field('Chủ phòng', osel) : null, field('Tòa nhà', bsel), field('Tiêu đề', title), go,
      approved.length ? null : h('p', { class: 'note', text: 'Chưa có tòa nhà nào. Hãy đề xuất tòa nhà bên dưới.' })),
    h('div', { class: 'card stack' }, h('h3', { text: 'Tòa nhà chưa có trong danh sách?' }), h('p', { class: 'note', text: 'Đề xuất tòa mới, admin sẽ duyệt. Có thể tạo tin ngay trong lúc chờ.' }),
      field('Tên', bn), field('Địa chỉ', ba), h('div', { class: 'row' }, field('Tỉnh/thành', bp), field('Quận/huyện', bd), field('Loại hình', bl)), pb));
}

// ---- Admin: hàng chờ duyệt + tất cả tin ----
export async function reviewView(ctx, main, id) {
  if (id) return reviewDetail(ctx, main, id);
  const q = await api('GET', 'api/review');
  const msg = h('div');
  const reload = () => reviewView(ctx, main);
  const bRows = q.buildings.map((b) => {
    const ap = h('button', { class: 'btn small', type: 'button', text: 'Duyệt' });
    ap.addEventListener('click', () => run(ap, msg, async () => { await api('POST', `api/buildings/${b.id}/approve`, {}); toast('Đã duyệt tòa nhà'); await reload(); }));
    const reason = h('input', { placeholder: 'Lý do từ chối', maxlength: '300' });
    const rj = h('button', { class: 'btn small bad', type: 'button', text: 'Từ chối' });
    rj.addEventListener('click', () => run(rj, msg, async () => { await api('POST', `api/buildings/${b.id}/reject`, { reason: reason.value }); await reload(); }));
    return h('li', null, h('div', { class: 'item' }, h('div', { class: 'm' }, h('b', { text: b.name }), h('small', { text: `${b.address} · ${b.district ? b.district + ', ' : ''}${b.province} · đề xuất bởi ${b.proposedBy || '—'}` })), h('div', { class: 'row tight' }, ap)), h('div', { class: 'row' }, reason, h('div', null, rj)));
  });
  const lRows = q.listings.map((l) => h('li', null, h('a', { class: 'item', href: '#/duyet/' + l.id },
    h('div', { class: 'm' }, h('b', { text: l.title }), h('small', { text: `${l.ownerName} · ${l.buildingName}${l.buildingApproved ? '' : ' (tòa chưa duyệt)'} · ${l.units} căn · ${l.photos} ảnh · đề xuất ${money(l.proposedPrice)}/${money(l.proposedWeekendPrice)}` })), h('span', { class: 'chip warn', text: 'Xem và duyệt' }))));
  const pRows = q.priceChanges.map((p) => {
    const ap = h('button', { class: 'btn small', type: 'button', text: 'Duyệt giá' });
    ap.addEventListener('click', () => run(ap, msg, async () => { await api('POST', `api/price-changes/${p.id}/approve`, {}); toast('Đã áp giá mới từ ngày mai'); await reload(); }));
    const reason = h('input', { placeholder: 'Lý do từ chối', maxlength: '300' });
    const rj = h('button', { class: 'btn small bad', type: 'button', text: 'Từ chối' });
    rj.addEventListener('click', () => run(rj, msg, async () => { await api('POST', `api/price-changes/${p.id}/reject`, { reason: reason.value }); await reload(); }));
    return h('li', null, h('div', { class: 'item' }, h('div', { class: 'm' }, h('b', { text: p.title }), h('small', { text: `Hiện ${money(p.livePrice)} / ${money(p.liveWeekendPrice)} → đề xuất ${money(p.price)} / ${money(p.weekendPrice)}` })), ap), h('div', { class: 'row' }, reason, h('div', null, rj)));
  });
  const all = h('div', { class: 'card' }, h('p', { class: 'note', text: 'Đang tải…' }));
  const filter = select([['', 'Mọi trạng thái'], ['approved', 'Đang hiển thị'], ['suspended', 'Tạm ngưng'], ['rejected', 'Bị từ chối'], ['draft', 'Nháp']], '');
  async function loadAll() {
    const { listings } = await api('GET', 'api/listings' + (filter.value ? '?status=' + filter.value : ''));
    all.replaceChildren(h('h3', { text: 'Tất cả tin đăng' }), h('div', { class: 'row' }, field('Lọc', filter)), listings.length ? h('ul', { class: 'list' }, listings.map((l) => h('li', null, h('a', { class: 'item', href: '#/duyet/' + l.id },
      h('div', { class: 'm' }, h('b', { text: l.title || '(chưa đặt tên)' }), h('small', { text: `${l.ownerName} · ${l.buildingName} · ${l.units} căn · ${l.photos} ảnh` })), stChip(l.status))))) : h('p', { class: 'note', text: 'Không có tin nào.' }));
  }
  filter.addEventListener('change', loadAll);
  main.replaceChildren(msg,
    h('div', { class: 'card' }, h('h2', { text: 'Duyệt phòng' }), h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('b', { text: String(q.listings.length) }), h('span', { text: 'Tin chờ duyệt' })), h('div', { class: 'kpi' }, h('b', { text: String(q.buildings.length) }), h('span', { text: 'Tòa chờ duyệt' })), h('div', { class: 'kpi' }, h('b', { text: String(q.priceChanges.length) }), h('span', { text: 'Đổi giá chờ duyệt' })))),
    q.buildings.length ? h('div', { class: 'card' }, h('h3', { text: 'Tòa nhà chờ duyệt' }), h('ul', { class: 'list' }, bRows)) : null,
    h('div', { class: 'card' }, h('h3', { text: 'Tin chờ duyệt' }), q.listings.length ? h('ul', { class: 'list' }, lRows) : h('p', { class: 'okmsg', text: 'Không có tin nào chờ duyệt.' })),
    q.priceChanges.length ? h('div', { class: 'card' }, h('h3', { text: 'Đề xuất đổi giá' }), h('ul', { class: 'list' }, pRows)) : null, all);
  await loadAll();
}

async function reviewDetail(ctx, main, id) {
  const d = await api('GET', 'api/listings/' + id);
  const meta = await api('GET', 'api/listing-meta');
  const msg = h('div');
  const reload = () => reviewView(ctx, main, id);
  const price = h('input', { type: 'number', min: '50000', step: '1000', inputmode: 'numeric', value: String(d.proposedPrice) });
  const wprice = h('input', { type: 'number', min: '50000', step: '1000', inputmode: 'numeric', value: String(d.proposedWeekendPrice || d.proposedPrice) });
  const share = h('input', { type: 'number', min: '0', max: '100', inputmode: 'numeric', value: '70' });
  const floor = h('input', { type: 'number', min: '0', step: '1000', inputmode: 'numeric', value: '0' });
  const payer = select([['owner', 'Chủ phòng'], ['anstay', 'Anstay'], ['guest', 'Khách']], 'owner');
  const delay = h('input', { type: 'number', min: '0', max: '365', inputmode: 'numeric', value: '3' });
  const approve = h('button', { class: 'btn', type: 'button', text: 'Duyệt tin' });
  approve.addEventListener('click', () => run(approve, msg, async () => {
    await api('POST', `api/listings/${id}/approve`, { price: Number(price.value), weekendPrice: Number(wprice.value), ownerSharePct: Number(share.value), ownerNetFloor: Number(floor.value), cleaningPayer: payer.value, payoutDelayDays: Number(delay.value) });
    toast('Đã duyệt, tin đang hiển thị'); ctx.go('#/duyet');
  }));
  const reason = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Lý do (bắt buộc, tối thiểu 5 ký tự)' });
  const reject = h('button', { class: 'btn bad', type: 'button', text: 'Từ chối' });
  reject.addEventListener('click', () => run(reject, msg, async () => { await api('POST', `api/listings/${id}/reject`, { reason: reason.value }); ctx.go('#/duyet'); }));
  const susp = h('button', { class: 'btn bad', type: 'button', text: 'Tạm ngưng' });
  susp.addEventListener('click', () => run(susp, msg, async () => { await api('POST', `api/listings/${id}/suspend`, { reason: reason.value }); toast('Đã tạm ngưng'); await reload(); }));
  const unsusp = h('button', { class: 'btn', type: 'button', text: 'Hiển thị lại' });
  unsusp.addEventListener('click', () => run(unsusp, msg, async () => { await api('POST', `api/listings/${id}/unsuspend`, {}); await reload(); }));
  const policy = meta.cancelPolicies.find((p) => p.code === d.cancelPolicy);
  main.replaceChildren(h('a', { href: '#/duyet', class: 'back', text: '‹ Duyệt phòng' }), msg,
    h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h2', { text: d.title }), h('div', null, stChip(d.status))),
      h('p', { class: 'note', text: `Chủ: ${d.owner.name} · Tòa: ${d.building.name}, ${d.building.address}, ${d.building.district} ${d.building.province}${d.building.status === 'approved' ? '' : ' (CHƯA DUYỆT)'}` }),
      h('div', { class: 'photos' }, d.photos.map((p) => h('div', { class: 'ph' }, h('img', { src: photoUrl(p.id), alt: '' })))),
      h('p', { text: d.description, class: 'pre' }), h('p', { class: 'note', text: `${d.bedrooms} phòng ngủ · ${d.beds} giường · ${d.bathrooms} phòng tắm · ${d.capacityStd}–${d.capacityMax} khách · căn: ${d.units.map((u) => u.code).join(', ')}` }),
      h('p', { class: 'note', text: 'Tiện nghi: ' + (d.amenities.map((a) => (meta.amenities.find((x) => x.code === a) || {}).label || a).join(', ') || '—') }), d.houseRules ? h('p', { class: 'pre note', text: 'Nội quy: ' + d.houseRules }) : null,
      h('p', { class: 'note', text: `Chính sách hủy: ${policy ? policy.label + '. ' + policy.text : d.cancelPolicy}` }), h('p', { class: 'note', text: d.attest ? 'Chủ đã cam kết tòa nhà cho phép cho thuê ngắn ngày.' : 'Chủ CHƯA cam kết tòa nhà cho phép.' })),
    d.status === 'pending' ? h('div', { class: 'card stack' }, h('h3', { text: 'Duyệt: giá và điều khoản' }),
      h('div', { class: 'row' }, field('Giá ngày thường (chưa VAT)', price), field('Giá thứ Sáu, thứ Bảy', wprice)),
      h('div', { class: 'row' }, field('Chủ nhận (%)', share), field('Sàn chủ nhận mỗi đêm (đ)', floor), field('Phí dọn do', payer), field('Chi trả sau trả phòng (ngày)', delay)),
      h('div', { class: 'row tight' }, approve), h('hr'), field('Từ chối', reason), h('div', { class: 'row tight' }, reject)) : null,
    d.status === 'approved' ? h('div', { class: 'card stack' }, h('h3', { text: 'Tạm ngưng hiển thị' }), field('Lý do', reason), h('div', { class: 'row tight' }, susp)) : null,
    d.status === 'suspended' ? h('div', { class: 'card stack' }, h('div', { class: 'warnbox', text: 'Đang tạm ngưng: ' + d.rejectReason }), h('div', { class: 'row tight' }, unsusp)) : null);
}
