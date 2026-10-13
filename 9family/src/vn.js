// Mọi tính toán ngày giờ theo giờ Việt Nam (UTC+7, không có giờ mùa hè). Không phụ thuộc múi giờ máy chủ.
export const TZ_MS = 7 * 3600_000;
const p2 = (n) => String(n).padStart(2, '0');
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDay(s) {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export const dayOfMs = (ms) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
export const todayVN = (ms) => dayOfMs(ms);
export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// 1 = thứ hai ... 7 = chủ nhật
export function weekdayISO(day) {
  const w = new Date(day + 'T00:00:00Z').getUTCDay();
  return w === 0 ? 7 : w;
}
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
// 'YYYY-MM-DD' + 'HH:MM' (giờ VN) -> mili giây UTC
export function atMs(day, hhmm) {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = (hhmm || '00:00').split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, mi) - TZ_MS;
}
export const hhmmOfMs = (ms) => { const d = new Date(ms + TZ_MS); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
// Sự kiện "cả ngày" được neo vào 07:00 để tính giờ nhắc
export const ALLDAY_ANCHOR = '07:00';
export const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
