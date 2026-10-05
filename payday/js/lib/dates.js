// Ngày tháng thuần hàm. Ngày là chuỗi 'YYYY-MM-DD' theo giờ địa phương; mọi hàm nhận "hôm nay" làm tham số để dễ kiểm thử.
const pad = (n) => String(n).padStart(2, '0');

export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function tach(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
export function homNay(now = new Date()) { return iso(now.getFullYear(), now.getMonth() + 1, now.getDate()); }
const utc = (s) => { const t = tach(s); return Date.UTC(t.y, t.m - 1, t.d); };
export const soNgayGiua = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export function congNgay(s, n) {
  const d = new Date(utc(s) + n * 86400000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
export const ngayCuaThang = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Ngày d của tháng m (d lớn hơn số ngày trong tháng thì lấy ngày cuối tháng; d = 'cuoi' là ngày cuối). */
export function ngayTrongThang(y, m, d) {
  const n = ngayCuaThang(y, m);
  return iso(y, m, d === 'cuoi' ? n : Math.min(Math.max(1, d), n));
}
export function themThang(y, m, n) {
  const t = (y * 12 + (m - 1)) + n;
  return { y: Math.floor(t / 12), m: (t % 12 + 12) % 12 + 1 };
}
export const thangCua = (s) => s.slice(0, 7);
export function dinhDangNgay(s) { const t = tach(s); return t ? `${pad(t.d)}/${pad(t.m)}/${t.y}` : ''; }
export function dinhDangNgayNgan(s) { const t = tach(s); return t ? `${t.d}/${t.m}` : ''; }
const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
export function thuCua(s) { return THU[new Date(utc(s)).getUTCDay()]; }

/**
 * Kỳ lương chứa ngày homNay: từ ngày lương gần nhất đến trước ngày lương kế tiếp.
 * ngayLuong = 1 thì trùng tháng dương lịch. Trả: tu, den (ngày cuối kỳ), soNgay, ngayDaQua (kể cả hôm nay), ngayCon (sau hôm nay), luongKe.
 */
export function chuKy(hom, ngayLuong = 1) {
  const t = tach(hom);
  const nl = ngayLuong === 'cuoi' ? 'cuoi' : Math.min(31, Math.max(1, Math.floor(+ngayLuong) || 1));
  let tu = ngayTrongThang(t.y, t.m, nl);
  if (hom < tu) { const p = themThang(t.y, t.m, -1); tu = ngayTrongThang(p.y, p.m, nl); }
  const ts = tach(tu);
  const k = themThang(ts.y, ts.m, 1);
  const ke = ngayTrongThang(k.y, k.m, nl);
  const soNgay = soNgayGiua(tu, ke);
  const ngayDaQua = soNgayGiua(tu, hom) + 1;
  return { tu, den: congNgay(ke, -1), luongKe: ke, soNgay, ngayDaQua, ngayCon: soNgay - ngayDaQua };
}

/** Lần xảy ra kế tiếp (>= hom) của sự kiện lặp hằng tháng vào ngày d. */
export function lanKeTiep(hom, d) {
  const t = tach(hom);
  const a = ngayTrongThang(t.y, t.m, d);
  if (a >= hom) return a;
  const k = themThang(t.y, t.m, 1);
  return ngayTrongThang(k.y, k.m, d);
}

/** Số tháng (làm tròn lên) từ ngày a đến ngày b; tối thiểu 0. */
export function soThangDen(a, b) {
  const x = tach(a), y = tach(b);
  let n = (y.y - x.y) * 12 + (y.m - x.m);
  if (y.d > x.d) n += 1;
  return Math.max(0, n);
}
