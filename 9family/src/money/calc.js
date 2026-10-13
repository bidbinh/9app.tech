// Tính toán tiền (thuần, không CSDL): làm tròn VND, tổng hợp theo tháng/danh mục, mức ngân sách.
export const MAX_VND = 100_000_000_000; // 100 tỷ: trần chống nhập nhầm
export const CATEGORIES = [
  ['an_uong', 'Ăn uống'], ['di_cho', 'Đi chợ'], ['dien_nuoc', 'Điện nước'],
  ['hoc_hanh', 'Học hành'], ['y_te', 'Y tế'], ['khac', 'Khác'],
];
export const CAT_LABEL = Object.fromEntries(CATEGORIES);
export const CAT_IDS = CATEGORIES.map((c) => c[0]);

// VND không có đơn vị lẻ: làm tròn về số nguyên đồng. Không hợp lệ thì trả null.
export function roundVnd(x) {
  if (typeof x === 'string') {
    const t = x.trim();
    x = /^\d{1,3}([.,]\d{3})+$/.test(t) ? Number(t.replace(/[.,]/g, '')) : Number(t.replace(',', '.').replace(/[^0-9.\-]/g, ''));
  }
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const r = Math.round(x);
  return r >= 0 && r <= MAX_VND ? r : null;
}

// 1200000 -> "1.200.000 đ"
export function fmtVnd(n) {
  const s = String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + s + ' đ';
}

export const monthOf = (day) => String(day).slice(0, 7);

// Tổng hợp một tháng. rows: [{day, amount, category, who}] (đã bỏ khoản xóa mềm). Trả tổng, theo danh mục, theo người.
export function summarize(rows, month) {
  const byCat = Object.fromEntries(CAT_IDS.map((k) => [k, 0]));
  const byWho = {};
  let total = 0; let count = 0;
  for (const r of rows) {
    if (monthOf(r.day) !== month) continue;
    const a = Number(r.amount);
    total += a; count += 1;
    byCat[CAT_IDS.includes(r.category) ? r.category : 'khac'] += a;
    const w = r.who || 'khong';
    byWho[w] = (byWho[w] || 0) + a;
  }
  return { month, total, count, byCat, byWho };
}

// Mức ngân sách: ok | near (>= 80%) | over (>= 100%) | none. Lời nhắn nhẹ nhàng, không phán xét.
export function budgetStatus(total, budget) {
  if (!budget || budget <= 0) return { level: 'none', pct: 0, left: null, text: '' };
  const pct = Math.floor((total / budget) * 100);
  const left = budget - total;
  if (total >= budget) return { level: 'over', pct, left, text: `Tháng này đã chi vượt ngân sách ${fmtVnd(total - budget)}. Có thể xem lại các khoản lớn cùng nhau.` };
  if (pct >= 80) return { level: 'near', pct, left, text: `Đã dùng ${pct}% ngân sách, còn ${fmtVnd(left)}.` };
  return { level: 'ok', pct, left, text: `Đã dùng ${pct}% ngân sách, còn ${fmtVnd(left)}.` };
}

// Số dư tiêu vặt = tổng sổ (đưa dương, chi âm, điều chỉnh có dấu). Mục tiêu tiết kiệm: phần trăm hoàn thành (0..100).
export function allowanceBalance(log) { return log.reduce((s, r) => s + Number(r.amount), 0); }
export function goalProgress(balance, goal) {
  if (!goal || goal <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((balance / goal) * 100)));
}

// Khóa kỳ đưa tiền tiêu vặt: tuần ISO (theo giờ VN) hoặc tháng
export function periodKey(day, period) {
  if (period === 'thang') return day.slice(0, 7);
  const d = new Date(day + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // 0 = thứ hai
  d.setUTCDate(d.getUTCDate() - dow + 3); // thứ năm của tuần đó
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

// CSV an toàn: bọc ngoặc kép, chống "CSV injection" (ô bắt đầu bằng = + - @ thành văn bản)
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
