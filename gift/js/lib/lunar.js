// Sao chép từ unit/js/lib/lunar.js (9unit), thuật toán gốc không đổi. Đã áp bản sửa vòng lùi từ vannien/mod/lunar.js
// (ngày "0" ở 07/05/2054 và 09/04/2062). Test quét 1950-2150 không còn ngày ngoài 1..30.
// Lịch âm Việt Nam (múi giờ UTC+7). Thuật toán thiên văn của Hồ Ngọc Đức:
// tính ngày sóc (trăng mới) và kinh độ Mặt Trời để xác định tháng nhuận.
// Hợp lệ khoảng năm 1900 đến 2100. Thuần hàm.

const PI = Math.PI;
const INT = Math.floor;
export const MUI_GIO = 7;

export function jdTuNgay(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

export function ngayTuJd(jd) {
  let a; let b; let c;
  if (jd > 2299160) {
    a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  const day = e - INT((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * INT(m / 10);
  const year = b * 100 + d - 4800 + INT(m / 10);
  return [day, month, year];
}

function trangMoi(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 += -0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat;
  if (T < -11) deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
  else deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Jd1 + C1 - deltat;
}

function kinhDoMatTroi(jdn) {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * INT(L / (PI * 2));
  return L;
}

const sunLong = (dayNumber, tz) => INT((kinhDoMatTroi(dayNumber - 0.5 - tz / 24) / PI) * 6);
const ngaySoc = (k, tz) => INT(trangMoi(k) + 0.5 + tz / 24);

function thang11(yy, tz) {
  const off = jdTuNgay(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = ngaySoc(k, tz);
  if (sunLong(nm, tz) >= 9) nm = ngaySoc(k - 1, tz);
  return nm;
}

function viTriThangNhuan(a11, tz) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = sunLong(ngaySoc(k + i, tz), tz);
  do {
    last = arc;
    i++;
    arc = sunLong(ngaySoc(k + i, tz), tz);
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Dương -> âm. Trả {ngay, thang, nam, nhuan:boolean}. */
export function duongSangAm(dd, mm, yy, tz = MUI_GIO) {
  const dayNumber = jdTuNgay(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = ngaySoc(k + 1, tz);
  // lùi tiếp cho tới khi tháng bắt đầu không vượt quá ngày đang xét (sửa ngày "0", theo vannien/mod/lunar.js)
  let kk = k + 1;
  while (monthStart > dayNumber) { kk -= 1; monthStart = ngaySoc(kk, tz); }
  let a11 = thang11(yy, tz);
  let b11 = a11;
  let lunarYear;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = thang11(yy - 1, tz);
  } else {
    lunarYear = yy + 1;
    b11 = thang11(yy + 1, tz);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = viTriThangNhuan(a11, tz);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) lunarLeap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { ngay: lunarDay, thang: lunarMonth, nam: lunarYear, nhuan: lunarLeap };
}

/** Âm -> dương. Trả {ngay, thang, nam} hoặc null nếu ngày âm không tồn tại. */
export function amSangDuong(lunarDay, lunarMonth, lunarYear, nhuan = false, tz = MUI_GIO) {
  let a11; let b11;
  if (lunarMonth < 11) {
    a11 = thang11(lunarYear - 1, tz);
    b11 = thang11(lunarYear, tz);
  } else {
    a11 = thang11(lunarYear, tz);
    b11 = thang11(lunarYear + 1, tz);
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = viTriThangNhuan(a11, tz);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (nhuan && lunarMonth !== leapMonth) return null;
    if (nhuan || off >= leapOff) off += 1;
  } else if (nhuan) return null;
  const monthStart = ngaySoc(k + off, tz);
  const [d, m, y] = ngayTuJd(monthStart + lunarDay - 1);
  // Kiểm tra vòng: ngày 30 không có trong tháng thiếu
  const kt = duongSangAm(d, m, y, tz);
  if (kt.ngay !== lunarDay || kt.thang !== lunarMonth || kt.nam !== lunarYear || kt.nhuan !== !!nhuan) return null;
  return { ngay: d, thang: m, nam: y };
}

/** Số ngày của tháng âm (29 hoặc 30). */
export function soNgayThangAm(thang, nam, nhuan = false, tz = MUI_GIO) {
  if (!amSangDuong(1, thang, nam, nhuan, tz)) return 0;
  return amSangDuong(30, thang, nam, nhuan, tz) ? 30 : 29;
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
export const canChiNam = (namAm) => `${CAN[(((namAm + 6) % 10) + 10) % 10]} ${CHI[(((namAm + 8) % 12) + 12) % 12]}`;
export const conGiap = (namAm) => CHI[(((namAm + 8) % 12) + 12) % 12];
/** Can chi của ngày (theo số ngày Julian). */
export function canChiNgay(dd, mm, yy) {
  const jd = jdTuNgay(dd, mm, yy);
  return `${CAN[(jd + 9) % 10]} ${CHI[(jd + 1) % 12]}`;
}
