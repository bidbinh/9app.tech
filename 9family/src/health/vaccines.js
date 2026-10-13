// Lịch tiêm chủng mở rộng (TCMR) theo tuổi. Dữ liệu và nguồn: data/vn-tcmr.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, daysBetween } from '../vn.js';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'vn-tcmr.json');
let data = null;
export function tcmr() { if (!data) data = JSON.parse(fs.readFileSync(file, 'utf8')); return data; }

// Cộng tháng theo lịch (30/31 -> cuối tháng nếu tháng đích ngắn hơn)
export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = m - 1 + n;
  const yy = y + Math.floor(t / 12); const mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// Các mũi theo ngày sinh. Ngày dự kiến = mốc tuổi; mũi phụ thuộc mũi trước thì không sớm hơn (mũi trước dự kiến + khoảng cách tối thiểu).
export function scheduleFor(birthDate) {
  const out = []; const dueOf = {};
  for (const d of tcmr().doses) {
    let due;
    if (d.rule.after) {
      const base = dueOf[d.rule.after];
      const nominal = d.rule.months !== undefined ? addMonths(birthDate, d.rule.months) : addDays(base, d.rule.days);
      const earliest = addDays(base, d.rule.minDays || 0);
      due = nominal >= earliest ? nominal : earliest;
    } else due = d.rule.months !== undefined ? addMonths(birthDate, d.rule.months) : addDays(birthDate, d.rule.days || 0);
    dueOf[d.code] = due;
    out.push({ code: d.code, name: d.name, dose: d.dose, of: d.of, dueDate: due, text: d.text, windowEnd: d.windowDays ? addDays(due, d.windowDays) : null });
  }
  return out;
}

// Trạng thái hiển thị: done | overdue | soon (trong 14 ngày) | later; kèm ngày sớm nhất được tiêm nếu mũi trước đã tiêm muộn
export function vaccineView(rows, today) {
  const rule = Object.fromEntries(tcmr().doses.map((d) => [d.code, d.rule]));
  const byCode = Object.fromEntries(rows.filter((r) => r.code).map((r) => [r.code, r]));
  return rows.map((r) => {
    let earliest = null;
    const ru = r.code && rule[r.code];
    if (ru && ru.after && byCode[ru.after] && byCode[ru.after].done_on && !r.done_on) earliest = addDays(byCode[ru.after].done_on, ru.minDays || 0);
    let status = 'later';
    if (r.done_on) status = 'done';
    else if (r.due_date && r.due_date < today) status = 'overdue';
    else if (r.due_date && daysBetween(today, r.due_date) <= 14) status = 'soon';
    return { id: r.id, code: r.code, name: r.name, dose: r.dose_no, dueDate: r.due_date, doneOn: r.done_on, note: r.note, status, earliest, custom: !r.code };
  }).sort((a, b) => (a.dueDate || '9') < (b.dueDate || '9') ? -1 : (a.dueDate || '9') > (b.dueDate || '9') ? 1 : a.dose - b.dose);
}
