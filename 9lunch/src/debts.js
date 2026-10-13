// Sổ nợ nhóm. rows: [{ from, to, amount }]  nghĩa là `from` nợ `to` `amount` đồng.

const byAmountThenId = (a, b) => (b.amount - a.amount) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Cộng dồn theo cặp, bù hai chiều: A nợ B 50 và B nợ A 30 thì còn A nợ B 20.
export function pairDebts(rows) {
  const net = new Map(); // khóa "a|b" với a < b: dương = a nợ b
  for (const r of rows) {
    if (!(r.amount > 0) || r.from === r.to) continue;
    const swap = r.from > r.to;
    const key = swap ? `${r.to}|${r.from}` : `${r.from}|${r.to}`;
    net.set(key, (net.get(key) || 0) + (swap ? -r.amount : r.amount));
  }
  const out = [];
  for (const [key, v] of [...net].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (v === 0) continue;
    const [a, b] = key.split('|');
    out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v });
  }
  return out;
}

// Số dư ròng: dương = đang được nợ, âm = đang nợ. Tổng luôn bằng 0.
export function netBalances(rows) {
  const bal = new Map();
  for (const r of rows) {
    if (!(r.amount > 0) || r.from === r.to) continue;
    bal.set(r.from, (bal.get(r.from) || 0) - r.amount);
    bal.set(r.to, (bal.get(r.to) || 0) + r.amount);
  }
  return bal;
}

// Gợi ý bù trừ: ghép người nợ nhiều nhất với người được nợ nhiều nhất cho đến hết.
// Tối đa (số người có số dư khác 0) - 1 lần chuyển.
export function settle(rows) {
  const bal = netBalances(rows);
  const debtors = []; const creditors = [];
  for (const [id, v] of bal) { if (v < 0) debtors.push({ id, amount: -v }); else if (v > 0) creditors.push({ id, amount: v }); }
  const out = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byAmountThenId); creditors.sort(byAmountThenId);
    const d = debtors[0]; const c = creditors[0];
    const x = Math.min(d.amount, c.amount);
    out.push({ from: d.id, to: c.id, amount: x });
    d.amount -= x; c.amount -= x;
    if (d.amount === 0) debtors.shift();
    if (c.amount === 0) creditors.shift();
  }
  return out;
}
