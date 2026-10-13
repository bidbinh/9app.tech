/* Sao chép từ src/lunar.js để bản xem thử tính âm lịch ngay trong trình duyệt. */
window.__lunar = (function () {
// Âm lịch Việt Nam theo thuật toán thiên văn của Hồ Ngọc Đức (công khai), múi giờ UTC+7.
// Ngày dương lịch là chuỗi 'YYYY-MM-DD'. Không phụ thuộc múi giờ máy chạy.
const PI = Math.PI;
const TZ = 7;
const INT = Math.floor;

function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}
function jdToDate(jd) {
  let a, b, c;
  if (jd > 2299160) { a = jd + 32044; b = INT((4 * a + 3) / 146097); c = a - INT((b * 146097) / 4); } else { b = 0; c = jd + 32082; }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  const day = e - INT((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * INT(m / 10);
  const year = b * 100 + d - 4800 + INT(m / 10);
  return [day, month, year];
}
function newMoon(k) {
  const T = k / 1236.85; const T2 = T * T; const T3 = T2 * T; const dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) - 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) - 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) + 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11
    ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Jd1 + C1 - deltat;
}
function sunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525; const T2 = T * T; const dr = PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * INT(L / (PI * 2));
  return L;
}
const newMoonDay = (k) => INT(newMoon(k) + 0.5 + TZ / 24);
const sunLong = (dayNumber) => INT((sunLongitude(dayNumber - 0.5 - TZ / 24) / PI) * 6);
const m11cache = new Map();
function lunarMonth11(yy) {
  if (m11cache.has(yy)) return m11cache.get(yy);
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = newMoonDay(k);
  if (sunLong(nm) >= 9) nm = newMoonDay(k - 1);
  m11cache.set(yy, nm);
  return nm;
}
function leapMonthOffset(a11) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last; let i = 1;
  let arc = sunLong(newMoonDay(k + i));
  do { last = arc; i++; arc = sunLong(newMoonDay(k + i)); } while (arc !== last && i < 14);
  return i - 1;
}

const p2 = (n) => String(n).padStart(2, '0');
function parseDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return [Number(m[3]), Number(m[2]), Number(m[1])];
}

// 'YYYY-MM-DD' -> { day, month, year, leap }
function solarToLunar(day) {
  const [dd, mm, yy] = parseDay(day);
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = newMoonDay(k);
  let a11 = lunarMonth11(yy); let b11 = a11; let lunarYear;
  if (a11 >= monthStart) { lunarYear = yy; a11 = lunarMonth11(yy - 1); } else { lunarYear = yy + 1; b11 = lunarMonth11(yy + 1); }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let leap = false; let lunarMonthNo = diff + 11;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11);
    if (diff >= leapDiff) { lunarMonthNo = diff + 10; if (diff === leapDiff) leap = true; }
  }
  if (lunarMonthNo > 12) lunarMonthNo -= 12;
  if (lunarMonthNo >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonthNo, year: lunarYear, leap };
}

// Âm -> dương; trả null nếu ngày âm không tồn tại (tháng nhuận không có, ngày 30 của tháng thiếu)
function lunarToSolar(lunarDay, lunarMonth, lunarYear, leap = false) {
  let a11; let b11;
  if (lunarMonth < 11) { a11 = lunarMonth11(lunarYear - 1); b11 = lunarMonth11(lunarYear); } else { a11 = lunarMonth11(lunarYear); b11 = lunarMonth11(lunarYear + 1); }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = leapMonthOffset(a11);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (leap && lunarMonth !== leapMonth) return null;
    if (leap || off >= leapOff) off += 1;
  } else if (leap) return null;
  const monthStart = newMoonDay(k + off);
  const [d, m, y] = jdToDate(monthStart + lunarDay - 1);
  const out = `${y}-${p2(m)}-${p2(d)}`;
  const back = solarToLunar(out);
  if (back.day !== lunarDay || back.month !== lunarMonth || back.year !== lunarYear || back.leap !== !!leap) return null;
  return out;
}

const NAMES_CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const NAMES_CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const canChiYear = (y) => `${NAMES_CAN[(y + 6) % 10]} ${NAMES_CHI[(y + 8) % 12]}`;

// Nhãn ngắn cho ô lịch: "1/2" hoặc "1/1 nhuận"
function lunarLabel(l) { return `${l.day}/${l.month}${l.leap ? 'n' : ''}`; }

// Tháng âm chứa ngày này có 30 ngày hay 29 ngày (để xử lý ngày 30 của tháng thiếu)
function lunarMonthLength(day) {
  const l = solarToLunar(day);
  const start = addDaysStr(day, -(l.day - 1));
  const next = solarToLunar(addDaysStr(start, 29));
  return next.day === 1 ? 29 : 30;
}
function addDaysStr(day, n) {
  const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

return { solarToLunar: solarToLunar, lunarToSolar: lunarToSolar, canChiYear: canChiYear };
})();
