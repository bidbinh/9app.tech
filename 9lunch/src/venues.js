import { addDays, normKey } from './util.js';

export const RECENT_DAYS = 3;

// history: [{ name, day }] các quán đã chọn ăn. Trả về tập khóa quán đã ăn trong RECENT_DAYS ngày gần nhất (kể cả hôm nay).
export function recentKeys(history, today, days = RECENT_DAYS) {
  const from = addDays(today, -days);
  const set = new Set();
  for (const h of history) if (h.day >= from && h.day <= today) set.add(normKey(h.name));
  return set;
}

// pool: [{ name, ... }] quán của nhóm; trả về một quán ngẫu nhiên không nằm trong `excludeKeys`, hoặc null.
export function pickRandom(pool, { excludeKeys = new Set(), rand = Math.random } = {}) {
  const seen = new Set(); const ok = [];
  for (const v of pool) {
    const k = normKey(v.name);
    if (!k || seen.has(k) || excludeKeys.has(k)) continue;
    seen.add(k); ok.push(v);
  }
  if (!ok.length) return null;
  ok.sort((a, b) => (normKey(a.name) < normKey(b.name) ? -1 : 1)); // thứ tự xác định trước khi bốc
  return ok[Math.min(ok.length - 1, Math.floor(rand() * ok.length))];
}

// Gợi ý người ứng tiền lần tới trong số candidates (người vắng đã được loại trước): ưu tiên người có tài khoản nhận tiền,
// rồi ít lần ứng nhất, ít tiền ứng nhất trong windowDays ngày gần nhất, ứng lâu nhất (chưa từng ứng thì trước), vào nhóm sớm hơn.
// candidates: [{ id, joinedAt, hasBank }]  advances: [{ memberId, day, amount }]  Trả về { id, reason, count, amount } hoặc null.
export function suggestPayer(candidates, advances, today, windowDays = 30) {
  if (!candidates.length) return null;
  const from = addDays(today, -windowDays);
  const info = new Map(candidates.map((m) => [m.id, { id: m.id, hasBank: !!m.hasBank, joinedAt: String(m.joinedAt), count: 0, amount: 0, last: '' }]));
  for (const a of advances) {
    const i = info.get(a.memberId);
    if (!i) continue;
    if (a.day >= from && a.day <= today) { i.count += 1; i.amount += a.amount || 0; }
    if (a.day > i.last) i.last = a.day;
  }
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const best = [...info.values()].sort((a, b) => cmp(b.hasBank, a.hasBank) || cmp(a.count, b.count) || cmp(a.amount, b.amount)
    || cmp(a.last, b.last) || cmp(a.joinedAt, b.joinedAt) || cmp(a.id, b.id))[0];
  const reason = best.count === 0
    ? `Chưa ứng lần nào trong ${windowDays} ngày qua`
    : `Mới ứng ${best.count} lần (${best.amount.toLocaleString('vi-VN')} đ) trong ${windowDays} ngày qua, ít nhất nhóm`;
  return { id: best.id, reason, count: best.count, amount: best.amount };
}
