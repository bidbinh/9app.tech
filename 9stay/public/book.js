import { h, clear, api, ApiError, field, run, toast, money, dmy, todayVN, addDays } from './lib.js';

// Trang đặt phòng công khai của khách (không cần tài khoản): tìm phòng → xác thực số điện thoại → giữ phòng → chuyển khoản QR.
const T = {
  vi: {
    title: 'Đặt phòng', checkin: 'Ngày đến', checkout: 'Ngày đi (không gồm)', adults: 'Người lớn', kids: 'Tuổi trẻ em (nếu có)', kidsPh: 'ví dụ 4, 8',
    search: 'Tìm phòng', none: 'Không còn phòng phù hợp. Hãy thử ngày khác.', vatNote: 'Giá đã gồm VAT', nights: 'đêm', scarce: 'Sắp hết', deposit: 'Cọc', choose: 'Chọn',
    notReady: 'Cơ sở chưa nhận thanh toán trực tuyến, vui lòng liên hệ trực tiếp.', yourInfo: 'Thông tin của bạn', name: 'Họ tên', phone: 'Số điện thoại', sendCode: 'Gửi mã xác thực',
    code: 'Mã xác thực (6 số)', codeSent: 'Đã gửi mã tới số điện thoại của bạn.', confirm: 'Xác nhận và giữ phòng', holdNote: (m) => `Phòng được giữ ${m} phút kể từ khi bạn bấm xác nhận để bạn chuyển khoản.`,
    pay: 'Thanh toán', amount: 'Số tiền', content: 'Nội dung chuyển khoản (bắt buộc đúng)', account: 'Tài khoản nhận', copy: 'Chép', copied: 'Đã chép', copyFail: 'Không chép được',
    timeLeft: 'Còn lại để thanh toán', waiting: 'Đang chờ tiền về…', autoNote: 'Hệ thống tự ghi nhận khi ngân hàng báo về, bạn không cần làm gì thêm.',
    okTitle: 'Đã nhận cọc, đặt phòng thành công', okNote: 'Cơ sở sẽ liên hệ bạn trước ngày đến. Hãy lưu lại mã đơn.', expired: 'Đã hết thời gian giữ phòng. Nếu bạn đã chuyển tiền, hãy liên hệ cơ sở với mã đơn.',
    again: 'Đặt lại', cancelled: 'Đơn đã hủy.', cancel: 'Hủy đơn', confirmCancel: 'Hủy đơn này?', code2: 'Mã đơn', stay: 'Thời gian ở', room: 'Loại phòng', total: 'Tổng', paid: 'Đã thanh toán', due: 'Còn lại',
    back: 'Quay lại', lang: 'English', needWait: 'Số tiền còn thiếu so với cọc, vui lòng chuyển bù đúng nội dung.',
  },
  en: {
    title: 'Book a room', checkin: 'Check-in', checkout: 'Check-out (not included)', adults: 'Adults', kids: 'Children ages (if any)', kidsPh: 'e.g. 4, 8',
    search: 'Search rooms', none: 'No matching rooms. Please try other dates.', vatNote: 'VAT included', nights: 'nights', scarce: 'Almost gone', deposit: 'Deposit', choose: 'Select',
    notReady: 'Online payment is not available yet, please contact us directly.', yourInfo: 'Your details', name: 'Full name', phone: 'Phone number', sendCode: 'Send verification code',
    code: 'Verification code (6 digits)', codeSent: 'We sent a code to your phone.', confirm: 'Confirm and hold the room', holdNote: (m) => `The room is held for ${m} minutes after you confirm so you can pay by bank transfer.`,
    pay: 'Payment', amount: 'Amount', content: 'Transfer message (must match exactly)', account: 'Pay to', copy: 'Copy', copied: 'Copied', copyFail: 'Could not copy',
    timeLeft: 'Time left to pay', waiting: 'Waiting for your transfer…', autoNote: 'We record the payment automatically once the bank reports it. Nothing more to do.',
    okTitle: 'Deposit received, booking confirmed', okNote: 'We will contact you before arrival. Please keep your booking code.', expired: 'The hold has expired. If you already paid, contact us with your booking code.',
    again: 'Book again', cancelled: 'Booking cancelled.', cancel: 'Cancel booking', confirmCancel: 'Cancel this booking?', code2: 'Booking code', stay: 'Stay', room: 'Room type', total: 'Total', paid: 'Paid', due: 'Balance',
    back: 'Back', lang: 'Tiếng Việt', needWait: 'The deposit is not complete yet, please transfer the rest with the same message.',
  },
};
let lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'vi';
const t = (k, ...a) => (typeof T[lang][k] === 'function' ? T[lang][k](...a) : T[lang][k]);

const slug = location.pathname.replace(/\/+$/, '').split('/').pop();
const app = document.getElementById('app');
const state = { offers: null, search: null, room: null, token: null, phoneOk: null, timer: null };

const copy = async (text) => { try { await navigator.clipboard.writeText(String(text)); toast(t('copied')); } catch { toast(t('copyFail'), true); } };
const stopTimer = () => { if (state.timer) { clearInterval(state.timer); state.timer = null; } };
const parseAges = (v) => String(v || '').split(/[,\s]+/).filter(Boolean).map(Number);

function frame(...kids) {
  clear(app).append(
    h('header', { class: 'hdr' }, h('span', { class: 'brand', text: t('title') }),
      h('button', { class: 'btn small ghost', type: 'button', text: t('lang'), onclick: () => { lang = lang === 'vi' ? 'en' : 'vi'; document.documentElement.lang = lang; start(); } })),
    h('main', null, ...kids));
}

function searchCard(box) {
  const cin = h('input', { type: 'date', min: todayVN(), value: state.search ? state.search.checkin : addDays(todayVN(), 7) });
  const cout = h('input', { type: 'date', min: todayVN(), value: state.search ? state.search.checkout : addDays(todayVN(), 9) });
  const ad = h('input', { type: 'number', min: '1', max: '20', value: state.search ? String(state.search.adults) : '2', inputmode: 'numeric' });
  const ages = h('input', { placeholder: t('kidsPh'), value: state.search ? state.search.childAges.join(', ') : '' });
  const msg = h('div');
  const btn = h('button', { class: 'btn', type: 'button', text: t('search') });
  btn.addEventListener('click', () => run(btn, msg, async () => {
    const s = { checkin: cin.value, checkout: cout.value, adults: Number(ad.value), childAges: parseAges(ages.value) };
    const qs = new URLSearchParams({ checkin: s.checkin, checkout: s.checkout, adults: String(s.adults) });
    if (s.childAges.length) qs.set('childAges', s.childAges.join(','));
    state.offers = await api('GET', `api/public/${slug}/offers?${qs}`);
    state.search = s;
    state.room = null;
    renderResults(box);
  }));
  return h('div', { class: 'card stack' }, h('div', { class: 'row' }, field(t('checkin'), cin), field(t('checkout'), cout)),
    h('div', { class: 'row' }, field(t('adults'), ad), field(t('kids'), ages)), btn, msg);
}

function renderResults(box) {
  const o = state.offers;
  if (!o) { box.replaceChildren(); return; }
  if (!o.payReady || o.otpReady === false) { box.replaceChildren(h('p', { class: 'warnbox', text: t('notReady') })); return; }
  if (!o.rooms.length) { box.replaceChildren(h('p', { class: 'note', text: t('none') })); return; }
  box.replaceChildren(...o.rooms.map((r) => {
    const btn = h('button', { class: 'btn', type: 'button', text: t('choose') });
    btn.addEventListener('click', () => { state.room = r; guestStep(); });
    return h('div', { class: 'card' }, h('div', { class: 'item' },
      h('div', { class: 'm' }, h('b', { text: r.name }), r.scarce ? h('span', { class: 'chip warn', text: t('scarce') }) : null,
        h('small', { text: `${r.nights} ${t('nights')} · ${t('deposit')} ${money(r.deposit)}` })),
      h('div', null, h('b', { text: money(r.total) }), h('small', { class: 'note', text: ' ' + t('vatNote') }))), btn);
  }));
}

function home() {
  stopTimer();
  const results = h('div', { class: 'stack' });
  frame(searchCard(results), results);
  renderResults(results);
}

function guestStep() {
  const s = state.search;
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
    if (!name.value.trim()) throw new Error(t('name'));
    // Dùng lại phiên đã xác thực nếu bước đặt lỗi (mã OTP chỉ dùng được một lần).
    if (!state.token || state.phoneOk !== phone.value) {
      const v = await api('POST', `api/public/${slug}/otp/verify`, { phone: phone.value, code: code.value });
      state.token = v.token; state.phoneOk = phone.value;
    }
    const b = await api('POST', `api/public/${slug}/book`, { token: state.token, expectedTotal: state.room.total, roomTypeId: state.room.roomTypeId, checkin: s.checkin, checkout: s.checkout, adults: s.adults, childAges: s.childAges, guestName: name.value });
    state.token = null;
    location.hash = '#r=' + b.receipt;
    payStep(b.receipt);
  }));
  frame(h('div', { class: 'card stack' }, h('h2', { text: t('yourInfo') }),
    h('p', { class: 'note', text: `${state.room.name} · ${dmy(s.checkin)} → ${dmy(s.checkout)} · ${money(state.room.total)} (${t('vatNote')})` }),
    field(t('name'), name), field(t('phone'), phone), send, codeRow, go, msg, h('p', { class: 'note', text: t('holdNote', state.offers.holdMinutes) }),
    h('button', { class: 'btn ghost small', type: 'button', text: t('back'), onclick: home })));
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
  const m = location.hash.match(/^#r=([A-Za-z0-9_-]{20,100})$/);
  if (m) payStep(m[1]); else if (state.room && state.offers) guestStep(); else home();
}
window.addEventListener('hashchange', () => { if (!location.hash) home(); });
start();
