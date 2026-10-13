import { normKey } from './util.js';

const vnd = (n) => Math.round(n).toLocaleString('vi-VN') + 'đ';
export const fmtDay = (day) => { const [y, m, d] = String(day).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

// items: [{ name, price, qty, note }] -> phiếu đặt gộp theo (tên món, giá)
// kind khác 'trua' (cà phê, đồ uống...): hai món cùng tên nhưng khác ghi chú (đường, đá, cỡ ly) là hai dòng riêng
export function buildSlip(items, { venue = '', day = '', kind = 'trua' } = {}) {
  const map = new Map();
  for (const it of items) {
    const key = normKey(it.name) + '|' + it.price + (kind === 'trua' ? '' : '|' + normKey(it.note));
    let l = map.get(key);
    if (!l) { l = { name: it.name, price: it.price, qty: 0, notes: new Map() }; map.set(key, l); }
    l.qty += it.qty;
    const note = String(it.note || '').trim();
    if (note) l.notes.set(note, (l.notes.get(note) || 0) + it.qty);
  }
  const lines = [...map.values()].sort((a, b) => (normKey(a.name) < normKey(b.name) ? -1 : 1)).map((l) => ({
    name: l.name, price: l.price, qty: l.qty,
    notes: [...l.notes].map(([note, qty]) => ({ note, qty })),
  }));
  const dishes = lines.reduce((s, l) => s + l.qty, 0);
  const sum = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const head = ['Phiếu đặt món', venue && `Quán: ${venue}`, day && `Ngày: ${fmtDay(day)}`].filter(Boolean).join(' - ');
  const body = lines.map((l) => {
    const notes = l.notes.length ? ` (${l.notes.map((n) => (l.notes.length === 1 && n.qty === l.qty ? n.note : `${n.qty} ${n.note}`)).join(', ')})` : '';
    return `- ${l.qty} x ${l.name}${notes}${l.price ? ` - ${vnd(l.price)}` : ''}`;
  });
  const text = [head, ...body, `Tổng: ${dishes} phần, ${vnd(sum)}`].join('\n');
  return { lines, dishes, sum, text };
}

export function reminderText({ name, amount, payerName, venue = '', day = '' }) {
  const where = venue ? `bữa ${venue}` : 'bữa trưa';
  return `Chào ${name}, nhắc nhẹ nhé: ${where}${day ? ` ngày ${fmtDay(day)}` : ''} bạn còn ${vnd(amount)} gửi ${payerName}. Bạn chuyển giúp khi tiện, cảm ơn bạn nhiều!`;
}
