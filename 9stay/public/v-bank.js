import { h, api, field, run, toast, money, dmy } from './lib.js';

const STATUS_TEXT = { needs_review: 'Cần xem', unmatched: 'Không rõ đơn', matched: 'Đã ghép', resolved: 'Đã xử lý tay', dismissed: 'Đã bỏ qua', received: 'Mới nhận' };

async function copy(text, what) {
  try { await navigator.clipboard.writeText(String(text)); toast(`Đã chép ${what}`); } catch { toast('Không chép được, hãy bấm giữ để chọn', true); }
}

// Thẻ mã QR chuyển khoản trong chi tiết đơn: nhân viên và sale/CTV (đơn của mình) dùng để gửi cho khách.
export function qrCard(b) {
  const box = h('div');
  const out = h('div', { class: 'stack' });
  const btn = h('button', { class: 'btn ghost', type: 'button', text: 'Hiện mã QR chuyển khoản' });
  btn.addEventListener('click', () => run(btn, box, async () => {
    const i = await api('GET', `api/bookings/${b.id}/payment-info`);
    if (i.amount <= 0) { out.replaceChildren(h('p', { class: 'okmsg', text: 'Đơn không còn khoản nào phải thu.' })); return; }
    out.replaceChildren(
      h('img', { class: 'qr', alt: 'Mã QR chuyển khoản', width: '240', height: '240', src: 'data:image/svg+xml;utf8,' + encodeURIComponent(i.svg) }),
      h('div', { class: 'kv' }, h('span', { text: 'Số tiền' }), h('b', { text: money(i.amount) })),
      h('div', { class: 'kv' }, h('span', { text: 'Nội dung (bắt buộc đúng)' }), h('b', { class: 'code', text: i.content })),
      h('div', { class: 'kv' }, h('span', { text: 'Số tài khoản' }), h('b', { text: `${i.accountNumber} · ${i.accountHolder}` })),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn small ghost', type: 'button', text: 'Chép nội dung', onclick: () => copy(i.content, 'nội dung') }),
        h('button', { class: 'btn small ghost', type: 'button', text: 'Chép số tài khoản', onclick: () => copy(i.accountNumber, 'số tài khoản') }),
        h('button', { class: 'btn small ghost', type: 'button', text: 'Chép số tiền', onclick: () => copy(i.amount, 'số tiền') })),
      h('p', { class: 'note', text: 'Tiền vào tài khoản của công ty; hệ thống tự ghi nhận khi ngân hàng báo về. Khách phải giữ đúng nội dung chuyển khoản.' }));
  }));
  return h('div', { class: 'card stack' }, h('h3', { text: 'Thanh toán bằng QR' }), btn, box, out);
}

// Tab "Ngân hàng" (quản lý): tài khoản nhận tiền, địa chỉ webhook, hàng chờ giao dịch lệch.
export async function bankView(ctx, main) {
  const msg = h('div');
  const acct = await api('GET', 'api/bank/account');

  const bin = h('input', { inputmode: 'numeric', maxlength: '6', placeholder: '970436', value: acct.configured ? acct.bankBin : '' });
  const num = h('input', { inputmode: 'numeric', maxlength: '20', placeholder: 'Số tài khoản', value: acct.configured ? acct.accountNumber : '' });
  const holder = h('input', { maxlength: '120', placeholder: 'TEN CONG TY', value: acct.configured ? acct.accountHolder : '' });
  const hook = h('div');
  const showHook = (p) => hook.replaceChildren(h('p', { class: 'note', text: 'Địa chỉ webhook (dán vào cấu hình của nhà cung cấp, kèm bí mật dùng chung do kỹ thuật cài ở máy chủ):' }),
    h('p', { class: 'code', text: location.origin + p }), h('button', { class: 'btn small ghost', type: 'button', text: 'Chép địa chỉ', onclick: () => copy(location.origin + p, 'địa chỉ webhook') }));
  if (acct.configured) showHook(acct.webhookPath);
  const save = h('button', { class: 'btn', type: 'button', text: 'Lưu tài khoản' });
  const rotate = h('input', { type: 'checkbox' });
  save.addEventListener('click', () => run(save, msg, async () => {
    const r = await api('PUT', 'api/bank/account', { bankBin: bin.value.trim(), accountNumber: num.value.trim(), accountHolder: holder.value.trim(), rotateToken: rotate.checked });
    rotate.checked = false;
    showHook(r.webhookPath);
    toast('Đã lưu tài khoản nhận tiền');
  }));

  const listBox = h('div');
  async function loadInbox() {
    const { items } = await api('GET', 'api/bank/inbox?limit=100');
    const open = items.filter((i) => ['needs_review', 'unmatched'].includes(i.status));
    const rest = items.filter((i) => !open.includes(i));
    const row = (i) => {
      const li = h('li', null, h('div', { class: 'item' },
        h('div', { class: 'm' }, h('b', { text: money(i.amount) }), h('small', { text: i.content || '(không có nội dung)' }), h('small', { text: `${dmy(new Date(new Date(i.occurredAt || i.receivedAt).getTime() + 7 * 3600 * 1000).toISOString())}${i.bookingCode ? ' · ' + i.bookingCode : ''}${i.note ? ' · ' + i.note : ''}` })),
        h('span', { class: 'chip ' + (['needs_review', 'unmatched'].includes(i.status) ? 'warn' : 'ok'), text: STATUS_TEXT[i.status] || i.status })));
      if (['needs_review', 'unmatched'].includes(i.status)) {
        const code = h('input', { placeholder: 'Mã đơn, ví dụ AN1001', autocapitalize: 'characters' });
        const note = h('input', { placeholder: 'Lý do bỏ qua (ví dụ: đã hoàn khách)', maxlength: '300' });
        const ebox = h('div');
        const m = h('button', { class: 'btn small', type: 'button', text: 'Ghép vào đơn' });
        m.addEventListener('click', () => run(m, ebox, async () => {
          const c = code.value.trim().toUpperCase();
          const { bookings } = await api('GET', 'api/bookings?limit=1&code=' + encodeURIComponent(c));
          const b = bookings[0];
          if (!b) throw new Error(`Không thấy đơn ${c || '(trống)'}`);
          if (!window.confirm(`Ghi ${money(i.amount)} vào đơn ${b.code} (${b.guestName})?`)) return;
          await api('POST', `api/bank/inbox/${i.id}/match`, { bookingId: b.id });
          toast('Đã ghép');
          await loadInbox();
        }));
        const d = h('button', { class: 'btn small ghost', type: 'button', text: 'Bỏ qua' });
        d.addEventListener('click', () => run(d, ebox, async () => {
          await api('POST', `api/bank/inbox/${i.id}/dismiss`, { note: note.value });
          await loadInbox();
        }));
        li.append(h('div', { class: 'stack' }, h('div', { class: 'row' }, field('Đơn', code), h('div', null, m)), h('div', { class: 'row' }, field('Bỏ qua', note), h('div', null, d)), ebox));
      }
      return li;
    };
    listBox.replaceChildren(
      h('h3', { text: `Lệch thanh toán (${open.length})` }),
      open.length ? h('ul', { class: 'list' }, open.map(row)) : h('p', { class: 'okmsg', text: 'Không có giao dịch nào cần xử lý.' }),
      rest.length ? h('details', null, h('summary', { text: `Đã xử lý gần đây (${rest.length})` }), h('ul', { class: 'list' }, rest.map(row))) : null);
  }

  main.replaceChildren(msg,
    h('div', { class: 'grid2' },
      h('div', { class: 'card stack' }, h('h2', { text: 'Tài khoản nhận tiền' }),
        h('p', { class: 'note', text: 'Khách chuyển thẳng vào tài khoản công ty. 9stay chỉ ghi nhận, không giữ tiền.' }),
        h('div', { class: 'row' }, field('Mã ngân hàng (BIN)', bin), field('Số tài khoản', num)), field('Tên chủ tài khoản', holder),
        acct.configured ? h('div', { class: 'row tight' }, rotate, h('label', { for: 'rot', text: 'Đổi địa chỉ webhook (địa chỉ cũ ngừng dùng)' })) : null,
        save, hook),
      h('div', { class: 'card' }, listBox)));
  if (acct.configured) rotate.id = 'rot';
  await loadInbox();
}
