import { AppError } from './errors.js';

const RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 366;

export function isDate(s) {
  if (typeof s !== 'string' || !RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Các đêm của khoảng nửa mở [checkin, checkout): 12→14 gồm đêm 12 và 13.
export function nightsBetween(checkin, checkout) {
  if (!isDate(checkin) || !isDate(checkout)) throw new AppError('bad_dates', 'Ngày không hợp lệ');
  if (checkout <= checkin) throw new AppError('bad_dates', 'Ngày đi phải sau ngày đến');
  const out = [];
  for (let d = checkin; d < checkout; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > MAX_NIGHTS) throw new AppError('bad_dates', 'Khoảng ngày quá dài');
  }
  return out;
}

// "Hôm nay" theo giờ Việt Nam, dạng YYYY-MM-DD (en-CA cho đúng định dạng này).
export function todayVN(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
