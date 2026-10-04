// Tiện ích thuần (không đụng DOM) dùng chung cho app và test.

/** Bỏ dấu tiếng Việt, về chữ thường: "Đà Lạt" -> "da lat". */
export function fold(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Kiểm tra chuỗi YYYY-MM-DD là ngày có thật. */
export function isISODate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Số ngày kể từ epoch (UTC) của một chuỗi ISO. */
export function dayNumber(iso) {
  const m = ISO_RE.exec(iso);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
}

export function daysBetween(fromISO, toISO) {
  return dayNumber(toISO) - dayNumber(fromISO);
}

export function addDays(iso, n) {
  const m = ISO_RE.exec(iso);
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return dt.toISOString().slice(0, 10);
}

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function weekdayOf(iso) {
  const m = ISO_RE.exec(iso);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
}

export function fmtDate(iso, withWeekday = false) {
  if (!isISODate(iso)) return '';
  const [y, m, d] = iso.split('-');
  const base = `${d}/${m}/${y}`;
  return withWeekday ? `${WEEKDAYS[weekdayOf(iso)]}, ${base}` : base;
}

/** "06/11 - 08/11/2026" hoặc "04/10/2026". */
export function fmtRange(startISO, endISO) {
  if (!endISO || endISO === startISO) return fmtDate(startISO, true);
  const [sy, sm, sd] = startISO.split('-');
  const [ey, em, ed] = endISO.split('-');
  if (sy === ey) return `${sd}/${sm} - ${ed}/${em}/${ey}`;
  return `${sd}/${sm}/${sy} - ${ed}/${em}/${ey}`;
}

export function fmtMoney(n, currency) {
  if (n == null) return '';
  const cur = currency || 'VND';
  const num = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n);
  return cur === 'VND' ? `${num}đ` : `${num} ${cur}`;
}

export function fmtKm(n) {
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${s}K`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `Tháng ${+m}/${y}`;
}

export function isHttpsUrl(u) {
  if (typeof u !== 'string') return false;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !!x.hostname;
  } catch { return false; }
}
