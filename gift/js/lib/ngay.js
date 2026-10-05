// Ngày tháng dạng chuỗi ISO "YYYY-MM-DD" (theo giờ máy), cộng trừ ngày, dương <-> âm. Thuần hàm.
import { duongSangAm, amSangDuong, soNgayThangAm, canChiNam, jdTuNgay } from './lunar.js';

const p2 = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${p2(m)}-${p2(d)}`;

export function tachIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (!hopLe(y, mo, d)) return null;
  return { y, m: mo, d };
}

export function hopLe(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= soNgayDuong(m, y);
}
export const namNhuanDuong = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export function soNgayDuong(m, y) {
  return [31, namNhuanDuong(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function homNayIso(now = new Date()) {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const msNgay = 86400000;
const utc = (s) => { const t = tachIso(s); return Date.UTC(t.y, t.m - 1, t.d); };
export function congNgay(s, n) {
  const d = new Date(utc(s) + n * msNgay);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
/** Số ngày từ a đến b (b - a). */
export const chenhNgay = (a, b) => Math.round((utc(b) - utc(a)) / msNgay);
/** 0 = Chủ nhật ... 6 = thứ bảy */
export const thuTrongTuan = (s) => new Date(utc(s)).getUTCDay();
const TEN_THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const TEN_THU_NGAN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const tenThu = (s) => TEN_THU[thuTrongTuan(s)];
export const tenThuNgan = (s) => TEN_THU_NGAN[thuTrongTuan(s)];

/** "12/10/2026" */
export function ngayVn(s) {
  const t = tachIso(s);
  return t ? `${p2(t.d)}/${p2(t.m)}/${t.y}` : '';
}
/** "12/10" */
export function ngayThangVn(s) {
  const t = tachIso(s);
  return t ? `${p2(t.d)}/${p2(t.m)}` : '';
}
/** Ngày thứ N của tuần thứ k trong tháng (ví dụ Chủ nhật thứ hai của tháng 5). thu: 0=CN. */
export function ngayThuTrongThang(nam, thang, thu, lan) {
  const dau = thuTrongTuan(iso(nam, thang, 1));
  const d = 1 + ((thu - dau + 7) % 7) + (lan - 1) * 7;
  return iso(nam, thang, d);
}

// ---------- Âm lịch ----------
/** ISO dương -> {ngay, thang, nam, nhuan} */
export function amCua(s) {
  const t = tachIso(s);
  return t ? duongSangAm(t.d, t.m, t.y) : null;
}
export function chuoiAm(a, { nam = false } = {}) {
  if (!a) return '';
  const ng = a.ngay <= 10 ? `mùng ${a.ngay}` : `${a.ngay}`;
  return `${ng} tháng ${a.thang}${a.nhuan ? ' nhuận' : ''}${nam ? ` năm ${canChiNam(a.nam)}` : ''}`;
}
/** "12/10 âm" ngắn gọn */
export const amNgan = (a) => (a ? `${a.ngay}/${a.thang}${a.nhuan ? ' nhuận' : ''} âm` : '');

/**
 * Ngày âm (ngay, thang, namAm) -> ISO dương, theo quy ước nhắc hằng năm:
 * - tháng nhuận: dùng tháng thường cùng số;
 * - ngày 30 mà tháng chỉ có 29 ngày: dùng ngày 29 (ngày cuối tháng).
 * Trả null nếu không tính được.
 */
export function amSangIso(ngay, thang, namAm) {
  if (!(ngay >= 1 && ngay <= 30 && thang >= 1 && thang <= 12)) return null;
  const sn = soNgayThangAm(thang, namAm, false);
  if (!sn) return null;
  const r = amSangDuong(Math.min(ngay, sn), thang, namAm, false);
  return r ? iso(r.nam, r.thang, r.ngay) : null;
}
export { soNgayThangAm, canChiNam, jdTuNgay };
