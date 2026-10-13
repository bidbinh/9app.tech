export function splitShares(amount, n) {
  const base = Math.floor(amount / n);
  const rem = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

const valid = (p) => p && typeof p.payer === 'string' && p.payer && Number.isInteger(p.amount) && p.amount > 0;

export function settle(payments, people) {
  const names = [];
  const add = (n) => { if (typeof n === 'string' && n && !names.includes(n)) names.push(n); };
  (people || []).forEach(add);
  const pays = (payments || []).filter(valid);
  pays.forEach((p) => add(p.payer));
  const balances = Object.fromEntries(names.map((n) => [n, 0]));
  let total = 0;
  pays.forEach((p, k) => {
    const sh = splitShares(p.amount, names.length);
    total += p.amount;
    names.forEach((n, i) => { balances[n] -= sh[(i + k) % names.length]; });
    balances[p.payer] += p.amount;
  });
  const cr = names.filter((n) => balances[n] > 0).map((n) => ({ n, v: balances[n] })).sort((a, b) => b.v - a.v);
  const db = names.filter((n) => balances[n] < 0).map((n) => ({ n, v: -balances[n] })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const x = Math.min(db[i].v, cr[j].v);
    transfers.push({ from: db[i].n, to: cr[j].n, amount: x });
    db[i].v -= x; cr[j].v -= x;
    if (db[i].v === 0) i++;
    if (cr[j].v === 0) j++;
  }
  return { people: names, balances, transfers, total };
}
