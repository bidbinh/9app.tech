import { h, clear, api, ApiError, field, select, run, toast, money, dmy, todayVN, addDays } from './lib.js';

// Trang chợ phòng công khai của khách (không cần tài khoản): tìm phòng → xem chi tiết → xác thực số điện thoại → giữ phòng → chuyển khoản QR.
const T = {
  vi: {
    title: 'Đặt phòng', checkin: 'Ngày đến', checkout: 'Ngày đi (không gồm)', adults: 'Người lớn', kids: 'Tuổi trẻ em (nếu có)', kidsPh: 'ví dụ 4, 8',
    search: 'Tìm phòng', none: 'Không có phòng phù hợp. Hãy thử ngày hoặc khu vực khác.', vatNote: 'Giá đã gồm VAT', nights: 'đêm', scarce: 'Sắp hết', deposit: 'Cọc',
    notReady: 'Cơ sở chưa nhận thanh toán trực tuyến, vui lòng liên hệ trực tiếp.', yourInfo: 'Thông tin của bạn', name: 'Họ tên', phone: 'Số điện thoại', sendCode: 'Gửi mã xác thực',
    code: 'Mã xác thực (6 số)', codeSent: 'Đã gửi mã tới số điện thoại của bạn.', confirm: 'Xác nhận và giữ phòng', holdNote: (m) => `Phòng được giữ ${m} phút kể từ khi bạn bấm xác nhận để bạn chuyển khoản.`,
    pay: 'Thanh toán', amount: 'Số tiền', content: 'Nội dung chuyển khoản (bắt buộc đúng)', account: 'Tài khoản nhận', copy: 'Chép', copied: 'Đã chép', copyFail: 'Không chép được',
    timeLeft: 'Còn lại để thanh toán', waiting: 'Đang chờ tiền về…', autoNote: 'Hệ thống tự ghi nhận khi ngân hàng báo về, bạn không cần làm gì thêm.',
    okTitle: 'Đã nhận cọc, đặt phòng thành công', okNote: 'Cơ sở sẽ liên hệ bạn trước ngày đến. Hãy lưu lại mã đơn.', expired: 'Đã hết thời gian giữ phòng. Nếu bạn đã chuyển tiền, hãy liên hệ cơ sở với mã đơn.',
    again: 'Đặt lại', cancelled: 'Đơn đã hủy.', cancel: 'Hủy đơn', confirmCancel: 'Hủy đơn này?', code2: 'Mã đơn', stay: 'Thời gian ở', room: 'Phòng', total: 'Tổng', paid: 'Đã thanh toán', due: 'Còn lại',
    back: 'Quay lại', lang: 'English', needWait: 'Số tiền còn thiếu so với cọc, vui lòng chuyển bù đúng nội dung.',
    area: 'Khu vực', allAreas: 'Tất cả khu vực', maxPrice: 'Giá tối đa/đêm', sort: 'Sắp xếp', sortRec: 'Đề xuất', sortAsc: 'Giá thấp đến cao', sortDesc: 'Giá cao đến thấp', sortNew: 'Mới nhất',
    results: (n) => `${n} phòng`, from: 'Từ', perNight: '/đêm', totalFor: (n) => `Tổng ${n} đêm`, bedrooms: 'phòng ngủ', beds: 'giường', baths: 'phòng tắm', guests: 'khách', amenities: 'Tiện nghi', rules: 'Nội quy',
    cancelPolicy: 'Chính sách hủy', about: 'Giới thiệu', availability: 'Lịch trống (90 ngày tới)', freeDay: 'Còn trống', viewPrice: 'Xem giá', bookNow: 'Đặt phòng', pickDates: 'Chọn ngày để xem giá và đặt',
    unavailable: 'Không còn phòng cho các ngày này.', backToResults: '‹ Kết quả tìm kiếm', weekend: 'Thứ Sáu, thứ Bảy', weekday: 'Ngày thường', loadMore: 'Xem thêm', quoteTitle: 'Chi tiết giá', vat: 'VAT', roomsOnly: 'Tiền phòng',
    badName: 'Vui lòng nhập họ tên', night: 'Đêm', photos: 'ảnh', addressTitle: 'Địa chỉ nhận phòng',
  },
  en: {
    title: 'Book a room', checkin: 'Check-in', checkout: 'Check-out (not included)', adults: 'Adults', kids: 'Children ages (if any)', kidsPh: 'e.g. 4, 8',
    search: 'Search', none: 'No matching rooms. Try other dates or area.', vatNote: 'VAT included', nights: 'nights', scarce: 'Almost gone', deposit: 'Deposit',
    notReady: 'Online payment is not available yet, please contact us directly.', yourInfo: 'Your details', name: 'Full name', phone: 'Phone number', sendCode: 'Send verification code',
    code: 'Verification code (6 digits)', codeSent: 'We sent a code to your phone.', confirm: 'Confirm and hold the room', holdNote: (m) => `The room is held for ${m} minutes after you confirm so you can pay by bank transfer.`,
    pay: 'Payment', amount: 'Amount', content: 'Transfer message (must match exactly)', account: 'Pay to', copy: 'Copy', copied: 'Copied', copyFail: 'Could not copy',
    timeLeft: 'Time left to pay', waiting: 'Waiting for your transfer…', autoNote: 'We record the payment automatically once the bank reports it. Nothing more to do.',
    okTitle: 'Deposit received, booking confirmed', okNote: 'We will contact you before arrival. Please keep your booking code.', expired: 'The hold has expired. If you already paid, contact us with your booking code.',
    again: 'Book again', cancelled: 'Booking cancelled.', cancel: 'Cancel booking', confirmCancel: 'Cancel this booking?', code2: 'Booking code', stay: 'Stay', room: 'Room', total: 'Total', paid: 'Paid', due: 'Balance',
    back: 'Back', lang: 'Tiếng Việt', needWait: 'The deposit is not complete yet, please transfer the rest with the same message.',
    area: 'Area', allAreas: 'All areas', maxPrice: 'Max price/night', sort: 'Sort', sortRec: 'Recommended', sortAsc: 'Price: low to high', sortDesc: 'Price: high to low', sortNew: 'Newest',
    results: (n) => `${n} rooms`, from: 'From', perNight: '/night', totalFor: (n) => `Total ${n} nights`, bedrooms: 'bedrooms', beds: 'beds', baths: 'bathrooms', guests: 'guests', amenities: 'Amenities', rules: 'House rules',
    cancelPolicy: 'Cancellation policy', about: 'About', availability: 'Availability (next 90 days)', freeDay: 'Available', viewPrice: 'See price', bookNow: 'Book now', pickDates: 'Pick dates to see the price and book',
    unavailable: 'No availability for these dates.', backToResults: '‹ Search results', weekend: 'Fri, Sat', weekday: 'Weekdays', loadMore: 'Show more', quoteTitle: 'Price details', vat: 'VAT', roomsOnly: 'Room',
    badName: 'Please enter your full name', night: 'Night', photos: 'photos', addressTitle: 'Check-in address',
  },
};
let lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'vi';
document.documentElement.lang = lang;
const t = (k, ...a) => (typeof T[lang][k] === 'function' ? T[lang][k](...a) : T[lang][k]);

const slug = location.pathname.replace(/\/+$/, '').split('/').pop();
const app = document.getElementById('app');
const state = { s: { from: '', to: '', adults: 2, childAges: [], area: '', maxPrice: '', sort: 'recommended' }, page: 1, token: null, phoneOk: null, timer: null, tick: null };

const copy = async (text) => { try { await navigator.clipboard.writeText(String(text)); toast(t('copied')); } catch { toast(t('copyFail'), true); } };
const stopTimer = () => { if (state.timer) { clearInterval(state.timer); state.timer = null; } };
const parseAges = (v) => String(v || '').split(/[,\s]+/).filter(Boolean).map(Number);
const photo = (id) => 'photos/' + id;
const WD = lang === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const dateQs = () => {
  const s = state.s;
  const q = new URLSearchParams({ adults: String(s.adults) });
  if (s.childAges.length) q.set('childAges', s.childAges.join(','));
  if (s.from && s.to) { q.set('from', s.from); q.set('to', s.to); }
  return q;
};

function frame(...kids) {
  clear(app).append(
    h('header', { class: 'hdr' }, h('a', { class: 'brand', href: location.pathname, text: t('title') }),
      h('button', { class: 'btn small ghost', type: 'button', text: t('lang'), onclick: () => { lang = lang === 'vi' ? 'en' : 'vi'; start(true); } })),
    h('main', null, ...kids));
}

// ---- Trang tìm phòng ----
async function home() {
  stopTimer();
  const s = state.s;
  const areaSel = select([['', t('allAreas')]], s.area);
  const cin = h('input', { type: 'date', min: todayVN(), value: s.from });
  const cout = h('input', { type: 'date', min: todayVN(), value: s.to });
  const ad = h('input', { type: 'number', min: '1', max: '20', value: String(s.adults), inputmode: 'numeric' });
  const ages = h('input', { placeholder: t('kidsPh'), value: s.childAges.join(', ') });
  const maxp = h('input', { type: 'number', min: '0', step: '10000', placeholder: '1.000.000', value: s.maxPrice, inputmode: 'numeric' });
  const sortSel = select([['recommended', t('sortRec')], ['price_asc', t('sortAsc')], ['price_desc', t('sortDesc')], ['newest', t('sortNew')]], s.sort);
  const msg = h('div'); const count = h('p', { class: 'note' }); const grid = h('div', { class: 'cards' }); const more = h('div');
  const go = h('button', { class: 'btn', type: 'button', text: t('search') });

  async function load(reset) {
    if (reset) state.page = 1;
    Object.assign(s, { from: cin.value, to: cout.value, adults: Number(ad.value) || 1, childAges: parseAges(ages.value), area: areaSel.value, maxPrice: maxp.value, sort: sortSel.value });
    if ((s.from && !s.to) || (!s.from && s.to)) throw new Error(t('pickDates'));
    const q = dateQs();
    if (s.area) q.set('area', s.area);
    if (s.maxPrice) q.set('maxPrice', String(Math.round(Number(s.maxPrice) / 1.1)));
    q.set('sort', s.sort); q.set('page', String(state.page));
    const r = await api('GET', `api/public/${slug}/listings?${q}`);
    if (reset) grid.replaceChildren();
    count.textContent = t('results', r.total);
    if (!r.total) { grid.replaceChildren(h('p', { class: 'note', text: t('none') })); more.replaceChildren(); return; }
    for (const l of r.listings) grid.append(card(l, r.withDates));
    more.replaceChildren(r.page * r.pageSize < r.total ? h('button', { class: 'btn ghost', type: 'button', text: t('loadMore'), onclick: () => run(null, msg, async () => { state.page += 1; await load(false); }) }) : null);
  }
  go.addEventListener('click', () => run(go, msg, () => load(true)));
  frame(h('div', { class: 'card stack' },
    h('div', { class: 'searchbar' }, field(t('area'), areaSel), field(t('checkin'), cin), field(t('checkout'), cout), field(t('adults'), ad), field(t('kids'), ages)),
    h('div', { class: 'searchbar' }, field(t('maxPrice'), maxp), field(t('sort'), sortSel), h('div', null, go)), msg), count, grid, more);
  try {
    const { areas } = await api('GET', `api/public/${slug}/areas`);
    const seen = new Set();
    for (const a of areas) for (const v of [a.province, a.district].filter(Boolean)) if (!seen.has(v)) { seen.add(v); areaSel.append(h('option', { value: v, text: v, selected: v === s.area })); }
  } catch { /* không bắt buộc */ }
  await run(null, msg, () => load(true));
}

function card(l, withDates) {
  const loc = [l.district, l.province].filter(Boolean).join(', ');
  return h('a', { class: 'lcard', href: location.pathname + '#l=' + l.id },
    l.cover ? h('img', { src: photo(l.cover), alt: l.title, loading: 'lazy' }) : h('div', { class: 'noimg', text: '—' }),
    h('div', { class: 'lbody' }, h('b', { text: l.title }), h('small', { text: loc }),
      h('small', { text: `${l.bedrooms} ${t('bedrooms')} · ${l.beds} ${t('beds')} · ${l.capacityMax} ${t('guests')}` }),
      l.amenities.length ? h('small', { text: l.amenities.map((a) => a.label).join(' · ') }) : null,
      h('div', { class: 'row tight' }, withDates ? h('span', { class: 'price-big', text: money(l.total) }) : h('span', { class: 'price-big', text: `${t('from')} ${money(l.priceNight)}` }),
        h('span', { class: 'note', text: withDates ? t('totalFor', l.nights) : t('perNight') }), l.scarce ? h('span', { class: 'chip warn', text: t('scarce') }) : null),
      h('small', { class: 'note', text: t('vatNote') })));
}

// ---- Trang chi tiết ----
async function detailView(id) {
  stopTimer();
  const view = h('div', { class: 'stack' });
  frame(view);
  let d;
  const fetchDetail = async () => { d = await api('GET', `api/public/${slug}/listings/${id}?${dateQs()}`); };
  try { await fetchDetail(); } catch (e) { view.replaceChildren(h('div', { class: 'err', role: 'alert', text: e instanceof ApiError ? e.message : 'Error' }), h('a', { class: 'btn', href: location.pathname, text: t('backToResults') })); return; }
  const s = state.s;
  const cin = h('input', { type: 'date', min: todayVN(), value: s.from });
  const cout = h('input', { type: 'date', min: todayVN(), value: s.to });
  const ad = h('input', { type: 'number', min: '1', max: '20', value: String(s.adults), inputmode: 'numeric' });
  const ages = h('input', { placeholder: t('kidsPh'), value: s.childAges.join(', ') });
  const msg = h('div'); const quoteBox = h('div'); const bar = h('div');

  const calendar = () => {
    if (!d.calendar.length) return null;
    const first = new Date(d.calendar[0].night + 'T00:00:00Z');
    const pad = (first.getUTCDay() + 6) % 7;
    return h('div', { class: 'calgrid' }, WD.map((x) => h('b', { text: x })), Array.from({ length: pad }, () => h('i')), d.calendar.map((c) => h('span', { class: c.free ? 'free' : '', title: c.night, text: String(Number(c.night.slice(8))) })));
  };
  const drawQuote = () => {
    if (!s.from || !s.to) { quoteBox.replaceChildren(h('p', { class: 'note', text: t('pickDates') })); bar.replaceChildren(); return; }
    if (!d.quote || d.quote.ok === false || !d.available) { quoteBox.replaceChildren(h('div', { class: 'warnbox', text: t('unavailable') })); bar.replaceChildren(); return; }
    quoteBox.replaceChildren(h('div', { class: 'card stack' }, h('h3', { text: t('quoteTitle') }),
      d.quote.lines.map((l) => h('div', { class: 'kv' }, h('span', { text: `${t('night')} ${l.night.slice(8)}/${l.night.slice(5, 7)}` }), h('span', { text: money(l.amount) }))),
      h('div', { class: 'kv' }, h('span', { text: t('vat') }), h('span', { text: money(d.quote.vat) })),
      h('div', { class: 'kv tot' }, h('span', { text: t('total') }), h('b', { text: money(d.quote.total) })),
      h('div', { class: 'kv' }, h('span', { text: t('deposit') }), h('span', { text: money(d.quote.deposit) }))));
    bar.replaceChildren(h('div', { class: 'stickybar' }, h('div', null, h('b', { class: 'price-big', text: money(d.quote.total) }), h('small', { class: 'note', text: ' ' + t('totalFor', d.quote.nights) })), h('button', { class: 'btn', type: 'button', text: t('bookNow'), onclick: () => guestStep(d) })));
  };
  const see = h('button', { class: 'btn', type: 'button', text: t('viewPrice') });
  see.addEventListener('click', () => run(see, msg, async () => {
    Object.assign(s, { from: cin.value, to: cout.value, adults: Number(ad.value) || 1, childAges: parseAges(ages.value) });
    if (!s.from || !s.to) throw new Error(t('pickDates'));
    await fetchDetail(); drawQuote();
  }));

  view.replaceChildren(
    h('a', { class: 'back', href: location.pathname, text: t('backToResults') }),
    d.photos.length ? h('div', { class: 'gallery' }, d.photos.map((p) => h('img', { src: photo(p), alt: d.title, loading: 'lazy' }))) : null,
    h('div', { class: 'card stack' }, h('h2', { text: d.title }), h('p', { class: 'note', text: [d.district, d.province].filter(Boolean).join(', ') }),
      h('p', { text: `${d.bedrooms} ${t('bedrooms')} · ${d.beds} ${t('beds')} · ${d.baths ?? d.bathrooms} ${t('baths')} · ${d.capacityMax} ${t('guests')}` }),
      h('div', { class: 'row' }, h('div', null, h('span', { class: 'price-big', text: money(d.priceNight) }), h('small', { class: 'note', text: ` ${t('perNight')} (${t('weekday')})` })),
        h('div', null, h('span', { class: 'price-big', text: money(d.weekendPriceNight) }), h('small', { class: 'note', text: ` ${t('perNight')} (${t('weekend')})` }))), h('small', { class: 'note', text: t('vatNote' ) })),
    h('div', { class: 'card stack' }, h('div', { class: 'searchbar' }, field(t('checkin'), cin), field(t('checkout'), cout), field(t('adults'), ad), field(t('kids'), ages), h('div', null, see)), msg), quoteBox,
    h('div', { class: 'card stack' }, h('h3', { text: t('about') }), h('p', { class: 'pre', text: d.description })),
    d.amenities.length ? h('div', { class: 'card stack' }, h('h3', { text: t('amenities') }), h('div', { class: 'amen' }, d.amenities.map((a) => h('span', { class: 'chk', text: '✓ ' + a.label })))) : null,
    h('div', { class: 'card stack' }, h('h3', { text: t('availability') }), calendar()),
    h('div', { class: 'card stack' }, h('h3', { text: t('cancelPolicy') }), h('p', { text: `${d.cancelPolicy.label}. ${d.cancelPolicy.text}` }), d.houseRules ? h('div', null, h('h3', { text: t('rules') }), h('p', { class: 'pre', text: d.houseRules })) : null), bar);
  drawQuote();
}

// ---- Thông tin khách + OTP + giữ phòng ----
function guestStep(d) {
  const s = state.s;
  const name = h('input', { maxlength: '120', autocomplete: 'name' });
  const phone = h('input', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '09xxxxxxxx' });
  const code = h('input', { inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' });
  const codeRow = h('div', { class: 'stack', hidden: true }, field(t('code'), code));
  const msg = h('div');
  const send = h('button', { class: 'btn ghost', type: 'button', text: t('sendCode') });
  const go = h('button', { class: 'btn', type: 'button', text: t('confirm'), hidden: true });
  send.addEventListener('click', () => run(send, msg, async () => {
    await api('POST', `api/public/${slug}/otp`, { phone: phone.value });
    codeRow.hidden = false; go.hidden = false;
    msg.replaceChildren(h('div', { class: 'okmsg', text: t('codeSent') }));
  }));
  go.addEventListener('click', () => run(go, msg, async () => {
    if (!name.value.trim()) throw new Error(t('badName'));
    // Dùng lại phiên đã xác thực nếu bước đặt lỗi (mã OTP chỉ dùng được một lần).
    if (!state.token || state.phoneOk !== phone.value) {
      const v = await api('POST', `api/public/${slug}/otp/verify`, { phone: phone.value, code: code.value });
      state.token = v.token; state.phoneOk = phone.value;
    }
    const b = await api('POST', `api/public/${slug}/book`, { token: state.token, expectedTotal: d.quote.total, listingId: d.id, checkin: s.from, checkout: s.to, adults: s.adults, childAges: s.childAges, guestName: name.value });
    state.token = null;
    location.hash = '#r=' + b.receipt;
  }));
  frame(h('div', { class: 'card stack' }, h('h2', { text: t('yourInfo') }),
    h('p', { class: 'note', text: `${d.title} · ${dmy(s.from)} → ${dmy(s.to)} · ${money(d.quote.total)} (${t('vatNote')})` }),
    field(t('name'), name), field(t('phone'), phone), send, codeRow, go, msg, h('p', { class: 'note', text: t('holdNote', 5) }),
    h('button', { class: 'btn ghost small', type: 'button', text: t('back'), onclick: () => { location.hash = '#l=' + d.id; start(true); } })));
}

async function payStep(token) {
  stopTimer();
  const view = h('div', { class: 'stack' });
  frame(view);
  let r;
  const load = async () => { r = await api('GET', `api/public/receipt/${token}`); };
  try { await load(); } catch (e) { view.replaceChildren(h('div', { class: 'err', role: 'alert', text: e instanceof ApiError ? e.message : 'Error' }), h('button', { class: 'btn', type: 'button', text: t('again'), onclick: () => { location.hash = ''; home(); } })); return; }

  const draw = () => {
    const sum = h('div', { class: 'card' },
      h('div', { class: 'kv' }, h('span', { text: t('code2') }), h('b', { class: 'code', text: r.code })),
      h('div', { class: 'kv' }, h('span', { text: t('room') }), h('span', { text: r.roomType })),
      h('div', { class: 'kv' }, h('span', { text: t('stay') }), h('span', { text: `${dmy(r.checkin)} → ${dmy(r.checkout)}` })),
      h('div', { class: 'kv' }, h('span', { text: t('total') }), h('span', { text: money(r.total) })),
      h('div', { class: 'kv' }, h('span', { text: t('paid') }), h('span', { text: money(r.paid) })),
      h('div', { class: 'kv tot' }, h('span', { text: t('due') }), h('span', { text: money(r.due) })));
    const parts = [];
    if (r.status === 'da_coc' || r.status === 'da_nhan' || r.status === 'da_tra') {
      parts.push(h('div', { class: 'okmsg' }, h('b', { text: t('okTitle') }), h('p', { text: t('okNote') })), sum);
      if (r.location) parts.push(h('div', { class: 'card' }, h('b', { text: t('addressTitle') }), h('p', { text: `${r.location.name} · ${r.location.address}${r.location.district ? ', ' + r.location.district : ''}${r.location.province ? ', ' + r.location.province : ''}` })));
      if (r.pay) parts.push(payCard());
    } else if (r.status === 'giu') {
      parts.push(payCard(), sum);
      const cancel = h('button', { class: 'btn bad small', type: 'button', text: t('cancel'), disabled: r.paid > 0 });
      cancel.addEventListener('click', () => run(cancel, null, async () => {
        if (!window.confirm(t('confirmCancel'))) return;
        await api('POST', `api/public/receipt/${token}/cancel`, {});
        await load(); draw();
      }));
      if (r.paid === 0) parts.push(cancel);
    } else if (r.status === 'huy') parts.push(h('p', { class: 'note', text: t('cancelled') }), sum);
    else parts.push(h('div', { class: 'warnbox', text: t('expired') }), sum);
    if (!['giu', 'da_coc'].includes(r.status) || r.status === 'da_coc') parts.push(h('button', { class: 'btn ghost', type: 'button', text: t('again'), onclick: () => { location.hash = ''; state.offers = null; home(); } }));
    view.replaceChildren(...parts);
  };

  function payCard() {
    const p = r.pay;
    const left = h('b', { id: 'left' });
    const tick = () => {
      if (r.status !== 'giu' || !r.holdUntil) { left.textContent = ''; return; }
      const sec = Math.max(0, Math.floor((new Date(r.holdUntil).getTime() - Date.now()) / 1000));
      left.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };
    tick();
    state.tick = tick;
    return h('div', { class: 'card stack' }, h('h2', { text: t('pay') }),
      r.status === 'giu' ? h('div', { class: 'kv' }, h('span', { text: t('timeLeft') }), left) : null,
      h('img', { class: 'qr', alt: 'QR', width: '240', height: '240', src: 'data:image/svg+xml;utf8,' + encodeURIComponent(p.svg) }),
      h('div', { class: 'kv' }, h('span', { text: t('amount') }), h('b', { text: money(p.amount) })),
      h('div', { class: 'kv' }, h('span', { text: t('content') }), h('b', { class: 'code', text: p.content })),
      h('div', { class: 'kv' }, h('span', { text: t('account') }), h('b', { text: `${p.accountNumber} · ${p.accountHolder}` })),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn small ghost', type: 'button', text: `${t('copy')} ${t('content').split(' (')[0].toLowerCase()}`, onclick: () => copy(p.content) }),
        h('button', { class: 'btn small ghost', type: 'button', text: `${t('copy')} ${t('account').toLowerCase()}`, onclick: () => copy(p.accountNumber) }),
        h('button', { class: 'btn small ghost', type: 'button', text: `${t('copy')} ${t('amount').toLowerCase()}`, onclick: () => copy(p.amount) })),
      h('p', { class: 'note', text: t('waiting') + ' ' + t('autoNote') }));
  }

  draw();
  // Hỏi lại trạng thái mỗi 4 giây; đếm ngược mỗi giây. Dừng khi đơn không còn chờ tiền.
  let n = 0;
  state.timer = setInterval(async () => {
    n += 1;
    if (state.tick) state.tick();
    if (n % 4 !== 0) return;
    try {
      const before = r.status + r.paid;
      await load();
      if (r.status + r.paid !== before || r.status === 'giu') draw();
      if (!['giu'].includes(r.status) && r.due <= 0) stopTimer();
      if (['huy', 'het_han', 'da_nhan', 'da_tra'].includes(r.status)) stopTimer();
    } catch { /* mất mạng tạm thời: thử lại ở lần sau */ }
  }, 1000);
}

function start() {
  const hash = location.hash;
  const r = hash.match(/^#r=([A-Za-z0-9_-]{20,100})$/);
  const l = hash.match(/^#l=([0-9a-f-]{36})$/);
  if (r) payStep(r[1]); else if (l) detailView(l[1]); else home();
}
window.addEventListener('hashchange', () => start());
start();
