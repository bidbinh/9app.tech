// Tính ngày tháng. Ngày được biểu diễn là {y,m,d} (không có giờ) hoặc chuỗi "YYYY-MM-DD".
// Mọi phép tính đi qua số ngày UTC nên không dính giờ mùa hè hay múi giờ máy.
import { duongSangAm, amSangDuong, soNgayThangAm, canChiNam, conGiap } from './lunar.js';

const MS_NGAY = 86400000;
export const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/** "2026-10-04" -> {y,m,d}; null nếu không hợp lệ (kể cả 31/02). */
export function docNgay(s) {
  if (s && typeof s === 'object' && 'y' in s) return hopLe(s) ? s : null;
  const mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
  if (!mt) return null;
  const o = { y: +mt[1], m: +mt[2], d: +mt[3] };
  return hopLe(o) ? o : null;
}
export function hopLe({ y, m, d }) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || y < 1 || y > 9999) return false;
  return d <= soNgayTrongThang(y, m);
}
export const laNamNhuan = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export function soNgayTrongThang(y, m) {
  return [31, laNamNhuan(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
export const ngayThanhChuoi = ({ y, m, d }) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const hienThiNgay = ({ y, m, d }) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;

/** Số ngày kể từ 1970-01-01 (có thể âm). */
export function soNgay({ y, m, d }) {
  const t = new Date(Date.UTC(2000, m - 1, d));
  t.setUTCFullYear(y); // tránh năm 0-99 bị hiểu thành 19xx
  return Math.round(t.getTime() / MS_NGAY);
}
export function tuSoNgay(n) {
  const t = new Date(n * MS_NGAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
export const thuTrongTuan = (o) => ((soNgay(o) % 7) + 11) % 7; // 0 = Chủ nhật (1/1/1970 là Thứ năm)
export const tenThu = (o) => THU[thuTrongTuan(o)];

export const congNgay = (o, n) => tuSoNgay(soNgay(o) + n);
export const khoangCachNgay = (a, b) => soNgay(b) - soNgay(a);

/** Cộng tháng: giữ ngày, nếu tháng đích ngắn hơn thì lùi về ngày cuối tháng (31/01 + 1 tháng = 28/02). */
export function congThang(o, n) {
  const tong = o.y * 12 + (o.m - 1) + n;
  const y = Math.floor(tong / 12);
  const m = (((tong % 12) + 12) % 12) + 1;
  return { y, m, d: Math.min(o.d, soNgayTrongThang(y, m)) };
}

/** Cộng/trừ nhiều đơn vị cùng lúc: {nam, thang, tuan, ngay}; thứ tự: năm+tháng trước rồi tới tuần, ngày. */
export function congKhoang(o, { nam = 0, thang = 0, tuan = 0, ngay = 0 } = {}) {
  const t = congThang(o, nam * 12 + thang);
  return congNgay(t, tuan * 7 + ngay);
}

/** Khoảng cách dạng năm-tháng-ngày giữa hai ngày: số tháng tròn lớn nhất rồi tới số ngày lẻ (31/01 + 1 tháng = 28/02). */
export function khoangNamThangNgay(a, b) {
  if (soNgay(a) > soNgay(b)) [a, b] = [b, a];
  let tong = (b.y - a.y) * 12 + (b.m - a.m);
  if (soNgay(congThang(a, tong)) > soNgay(b)) tong -= 1;
  const moc = congThang(a, tong);
  return { nam: Math.floor(tong / 12), thang: tong % 12, ngay: soNgay(b) - soNgay(moc), tongNgay: soNgay(b) - soNgay(a) };
}

// ---------- Ngày làm việc ----------
/**
 * Ngày lễ cố định trong năm y (dạng chuỗi YYYY-MM-DD) -> tên.
 * Gồm: 1/1, 30/4, 1/5, 2/9, Giỗ Tổ 10/3 âm, Tết Âm lịch (1 ngày cuối năm âm + 4 ngày đầu năm, theo Bộ luật Lao động 2019).
 * Không gồm ngày nghỉ bù và ngày liền kề Quốc khánh do Chính phủ công bố từng năm.
 */
export function ngayLeCoDinh(y) {
  const out = new Map();
  const them = (o, ten) => { if (o) out.set(ngayThanhChuoi(o), ten); };
  them({ y, m: 1, d: 1 }, 'Tết Dương lịch');
  them({ y, m: 4, d: 30 }, 'Giải phóng miền Nam');
  them({ y, m: 5, d: 1 }, 'Quốc tế Lao động');
  them({ y, m: 9, d: 2 }, 'Quốc khánh');
  const gio = amSangDuong(10, 3, y, false);
  if (gio) them({ y: gio.nam, m: gio.thang, d: gio.ngay }, 'Giỗ Tổ Hùng Vương');
  // Tết: các ngày thuộc năm dương y
  const t1 = amSangDuong(1, 1, y, false);
  if (t1) {
    const mung1 = { y: t1.nam, m: t1.thang, d: t1.ngay };
    for (let i = 0; i < 4; i++) them(congNgay(mung1, i), i === 0 ? 'Mùng 1 Tết' : `Mùng ${i + 1} Tết`);
    them(congNgay(mung1, -1), '30 (hoặc 29) Tết');
  }
  // Tết của năm sau có thể có ngày cuối năm âm rơi vào năm dương y (hiếm), bỏ qua
  return out;
}

/**
 * Đếm ngày làm việc từ a đến b.
 * @param {{loaiTruThuBay?:boolean, thuBayLaLamViec?:boolean, truLe?:boolean, baoGomNgayDau?:boolean}} opt
 *   mặc định: thứ Bảy, Chủ nhật nghỉ; không trừ lễ; tính cả hai đầu mút (inclusive).
 */
export function demNgayLamViec(a, b, opt = {}) {
  const { thuBayLaLamViec = false, truLe = false, baoGomHaiDau = true } = opt;
  let sa = soNgay(a); let sb = soNgay(b);
  if (sa > sb) [sa, sb] = [sb, sa];
  const le = new Map();
  if (truLe) {
    const y1 = tuSoNgay(sa).y; const y2 = tuSoNgay(sb).y;
    for (let y = y1 - 0; y <= y2; y++) ngayLeCoDinh(y).forEach((v, k) => le.set(k, v));
  }
  let lam = 0; let cuoiTuan = 0; let nghiLe = 0;
  const tong = sb - sa + 1;
  for (let n = sa; n <= sb; n++) {
    if (!baoGomHaiDau && (n === sa || n === sb)) continue;
    const o = tuSoNgay(n);
    const thu = ((n % 7) + 11) % 7;
    const cuoiTuanNgay = thu === 0 || (thu === 6 && !thuBayLaLamViec);
    if (cuoiTuanNgay) { cuoiTuan++; continue; }
    if (truLe && le.has(ngayThanhChuoi(o))) { nghiLe++; continue; }
    lam++;
  }
  return { lam, cuoiTuan, nghiLe, tong };
}

/** Cộng n ngày làm việc (n có thể âm) vào ngày o. */
export function congNgayLamViec(o, n, opt = {}) {
  const { thuBayLaLamViec = false, truLe = false } = opt;
  let cur = soNgay(o);
  const buoc = n >= 0 ? 1 : -1;
  let con = Math.abs(n);
  const le = new Map();
  if (truLe) for (let y = o.y - 1; y <= o.y + Math.ceil(Math.abs(n) / 200) + 2; y++) ngayLeCoDinh(y).forEach((v, k) => le.set(k, v));
  while (con > 0) {
    cur += buoc;
    const thu = ((cur % 7) + 11) % 7;
    if (thu === 0 || (thu === 6 && !thuBayLaLamViec)) continue;
    if (truLe && le.has(ngayThanhChuoi(tuSoNgay(cur)))) continue;
    con--;
  }
  return tuSoNgay(cur);
}

// ---------- Tuổi ----------
/** Tuổi dương lịch tính tới ngày `den`. Trả null nếu sinh sau `den`. */
export function tinhTuoi(sinh, den) {
  if (soNgay(sinh) > soNgay(den)) return null;
  const k = khoangNamThangNgay(sinh, den);
  // ngày sinh nhật kế tiếp
  let sn = { y: den.y, m: sinh.m, d: Math.min(sinh.d, soNgayTrongThang(den.y, sinh.m)) };
  if (soNgay(sn) < soNgay(den)) sn = { y: den.y + 1, m: sinh.m, d: Math.min(sinh.d, soNgayTrongThang(den.y + 1, sinh.m)) };
  const amSinh = duongSangAm(sinh.d, sinh.m, sinh.y);
  const amNay = duongSangAm(den.d, den.m, den.y);
  return {
    nam: k.nam, thang: k.thang, ngay: k.ngay, tongNgay: k.tongNgay,
    sinhNhatKe: sn, conLai: soNgay(sn) - soNgay(den),
    thuSinh: tenThu(sinh),
    namAmSinh: amSinh.nam, canChiSinh: canChiNam(amSinh.nam), conGiapSinh: conGiap(amSinh.nam),
    tuoiMu: amNay.nam - amSinh.nam + 1,
  };
}

// ---------- Thai kỳ ----------
/**
 * Từ ngày đầu kỳ kinh cuối (LMP), quy tắc Naegele: ngày dự sinh = LMP + 280 ngày (40 tuần).
 * Chỉ là ước tính; bác sĩ xác định tuổi thai chính thức bằng siêu âm.
 */
export function tinhThai({ kinhCuoi, duSinh }, homNay) {
  const lmp = kinhCuoi ? kinhCuoi : congNgay(duSinh, -280);
  const ds = duSinh ? duSinh : congNgay(kinhCuoi, 280);
  const n = khoangCachNgay(lmp, homNay);
  const tuan = Math.floor(n / 7);
  const ngay = n % 7;
  return {
    kinhCuoi: lmp, duSinh: ds, tongNgay: n,
    tuan: n >= 0 ? tuan : null, ngayLe: n >= 0 ? ngay : null,
    conLai: khoangCachNgay(homNay, ds),
    thaiKy: n < 0 ? 'chua' : n <= 13 * 7 + 6 ? 1 : n <= 27 * 7 + 6 ? 2 : 3,
    ngayThuThai: congNgay(lmp, 14),
    moc: [
      { ten: 'Hết 3 tháng đầu (tuần 13)', ngay: congNgay(lmp, 13 * 7 + 6) },
      { ten: 'Hết 6 tháng (tuần 27)', ngay: congNgay(lmp, 27 * 7 + 6) },
      { ten: 'Đủ 37 tuần (đủ tháng)', ngay: congNgay(lmp, 37 * 7) },
      { ten: 'Ngày dự sinh (40 tuần)', ngay: ds },
    ],
  };
}

// ---------- Âm dương ----------
export function duongSangAmDayDu(o) {
  const a = duongSangAm(o.d, o.m, o.y);
  return { ...a, canChiNam: canChiNam(a.nam), conGiap: conGiap(a.nam), thu: tenThu(o) };
}
export function amSangDuongObj(d, m, y, nhuan) {
  const r = amSangDuong(d, m, y, nhuan);
  return r ? { y: r.nam, m: r.thang, d: r.ngay } : null;
}
export { soNgayThangAm };

// ---------- Đếm ngược ----------
/**
 * Lần xảy ra kế tiếp (>= homNay) của một mục đếm ngược.
 * muc: {ngay:"YYYY-MM-DD", lap:'none'|'duong'|'am'}; với 'am', ngay là NGÀY DƯƠNG của lần gốc, app đổi sang âm để lặp mỗi năm.
 */
export function lanKeTiep(muc, homNay) {
  const g = docNgay(muc.ngay);
  if (!g) return null;
  const lap = muc.lap || 'none';
  if (lap === 'none') return g;
  if (lap === 'duong') {
    for (let y = Math.max(homNay.y, g.y); y <= Math.max(homNay.y, g.y) + 1; y++) {
      // 29/02 lặp vào 28/02 nếu năm không nhuận
      const o = { y, m: g.m, d: Math.min(g.d, soNgayTrongThang(y, g.m)) };
      if (soNgay(o) >= soNgay(homNay) && soNgay(o) >= soNgay(g)) return o;
    }
    return null;
  }
  // lặp theo âm lịch
  const a = duongSangAm(g.d, g.m, g.y);
  const start = Math.max(homNay.y - 1, g.y);
  for (let y = start; y <= Math.max(homNay.y, g.y) + 2; y++) {
    // ngày 30 âm không có thì dùng 29
    let r = amSangDuongObj(a.ngay, a.thang, y, false);
    if (!r && a.ngay === 30) r = amSangDuongObj(29, a.thang, y, false);
    if (r && soNgay(r) >= soNgay(homNay) && soNgay(r) >= soNgay(g)) return r;
  }
  return null;
}
