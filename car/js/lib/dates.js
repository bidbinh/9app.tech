// Ngày tháng dạng chuỗi ISO yyyy-mm-dd (giờ địa phương). Thuần hàm, kiểm thử được trong Node.
const pad = (n) => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function homNay(now = new Date()) { return iso(now); }

/** Chuỗi ISO -> Date lúc 12:00 giờ địa phương (tránh lệch múi giờ/DST). */
export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
export function laIso(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return iso(parse(s)) === s;
}
export function addDays(s, n) {
  const d = parse(s); d.setDate(d.getDate() + n); return iso(d);
}
/** Cộng n tháng, kẹp về ngày cuối tháng nếu cần (31/1 + 1 tháng = 28 hoặc 29/2). */
export function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const tot = (m - 1) + n;
  const ny = y + Math.floor(tot / 12);
  const nm = ((tot % 12) + 12) % 12;
  const last = new Date(ny, nm + 1, 0).getDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}
/** Số ngày từ a đến b (b - a). */
export function diffDays(a, b) {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}
export function nam(s) { return Number(s.slice(0, 4)); }
export function dinhDang(s) {
  if (!s || !laIso(s)) return '';
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}
export function thangCuaNgay(s) { return s.slice(0, 7); }
export function nhanThang(ym) { return `T${Number(ym.slice(5, 7))}/${ym.slice(2, 4)}`; }
/** Danh sách n tháng gần nhất (cũ -> mới) kết thúc ở tháng của `s`. */
export function nThangGan(s, n) {
  const out = [];
  const [y, m] = s.split('-').map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const tot = (y * 12 + (m - 1)) - i;
    out.push(`${Math.floor(tot / 12)}-${pad((tot % 12) + 1)}`);
  }
  return out;
}
