/** Lịch âm Việt Nam — thuật toán Hồ Ngọc Đức, múi giờ GMT+7 */

export const TZ = 7
export const PI = Math.PI

const INT = (d) => Math.floor(d)

export function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12)
  const y = yy + 4800 - a
  const m = mm + 12 * a - 3
  let jd =
    dd +
    INT((153 * m + 2) / 5) +
    365 * y +
    INT(y / 4) -
    INT(y / 100) +
    INT(y / 400) -
    32045
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083
  }
  return jd
}

export function jdToDate(jd) {
  let a, b, c
  if (jd > 2299160) {
    a = jd + 32044
    b = INT((4 * a + 3) / 146097)
    c = a - INT((b * 146097) / 4)
  } else {
    b = 0
    c = jd + 32082
  }
  const d = INT((4 * c + 3) / 1461)
  const e = c - INT((1461 * d) / 4)
  const m = INT((5 * e + 2) / 153)
  const day = e - INT((153 * m + 2) / 5) + 1
  const month = m + 3 - 12 * INT(m / 10)
  const year = b * 100 + d - 4800 + INT(m / 10)
  return { day, month, year }
}

function newMoon(k) {
  const T = k / 1236.85
  const T2 = T * T
  const T3 = T2 * T
  const dr = PI / 180
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr)
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M)
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr)
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr)
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr))
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M))
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr))
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M))
  let deltat
  if (T < -11) {
    deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2
  }
  return Jd1 + C1 - deltat
}

export function sunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525
  const T2 = T * T
  const dr = PI / 180
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M)
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M)
  let L = L0 + DL
  L = L * dr
  L = L - PI * 2 * INT(L / (PI * 2))
  return L
}

function getSunLongitudeIndex(dayNumber, timeZone) {
  return INT((sunLongitude(dayNumber - 0.5 - timeZone / 24) / PI) * 6)
}

function getNewMoonDay(k, timeZone) {
  return INT(newMoon(k) + 0.5 + timeZone / 24)
}

function getLunarMonth11(yy, timeZone) {
  const off = jdFromDate(31, 12, yy) - 2415021
  const k = INT(off / 29.530588853)
  let nm = getNewMoonDay(k, timeZone)
  const sunLong = getSunLongitudeIndex(nm, timeZone)
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone)
  }
  return nm
}

function getLeapMonthOffset(a11, timeZone) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5)
  let last = 0
  let i = 1
  let arc = getSunLongitudeIndex(getNewMoonDay(k + i, timeZone), timeZone)
  do {
    last = arc
    i++
    arc = getSunLongitudeIndex(getNewMoonDay(k + i, timeZone), timeZone)
  } while (arc !== last && i < 14)
  return i - 1
}

export function convertSolar2Lunar(dd, mm, yy, timeZone = TZ) {
  const dayNumber = jdFromDate(dd, mm, yy)
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853)
  let monthStart = getNewMoonDay(k + 1, timeZone)
  let kk = k + 1
  // lùi tiếp cho tới khi tháng bắt đầu không vượt quá ngày đang xét (sửa ngày "0" ở 07/05/2054, 09/04/2062)
  while (monthStart > dayNumber) {
    kk -= 1
    monthStart = getNewMoonDay(kk, timeZone)
  }
  let a11 = getLunarMonth11(yy, timeZone)
  let b11 = a11
  let lunarYear
  if (a11 >= monthStart) {
    lunarYear = yy
    a11 = getLunarMonth11(yy - 1, timeZone)
  } else {
    lunarYear = yy + 1
    b11 = getLunarMonth11(yy + 1, timeZone)
  }
  const lunarDay = dayNumber - monthStart + 1
  const diff = INT((monthStart - a11) / 29)
  let lunarLeap = 0
  let lunarMonth = diff + 11
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone)
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10
      if (diff === leapMonthDiff) lunarLeap = 1
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap }
}

export function convertLunar2Solar(lunarDay, lunarMonth, lunarYear, lunarLeap = 0, timeZone = TZ) {
  let a11
  let b11
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1, timeZone)
    b11 = getLunarMonth11(lunarYear, timeZone)
  } else {
    a11 = getLunarMonth11(lunarYear, timeZone)
    b11 = getLunarMonth11(lunarYear + 1, timeZone)
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853)
  let off = lunarMonth - 11
  if (off < 0) off += 12
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11, timeZone)
    let leapMonth = leapOff - 2
    if (leapMonth < 0) leapMonth += 12
    if (lunarLeap !== 0 && lunarMonth !== leapMonth) {
      return { day: 0, month: 0, year: 0 }
    }
    if (lunarLeap !== 0 || off >= leapOff) off += 1
  }
  const monthStart = getNewMoonDay(k + off, timeZone)
  return jdToDate(monthStart + lunarDay - 1)
}

export const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
export const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý']
export const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi']
export const CHI_ANIMAL = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi']
export const CON_GIAP = [
  'Chuột',
  'Trâu',
  'Hổ',
  'Mèo',
  'Rồng',
  'Rắn',
  'Ngựa',
  'Dê',
  'Khỉ',
  'Gà',
  'Chó',
  'Lợn',
]

export function yearCanIndex(lunarYear) {
  return ((lunarYear + 6) % 10 + 10) % 10
}
export function yearChiIndex(lunarYear) {
  return ((lunarYear + 8) % 12 + 12) % 12
}
export function dayCanIndex(jd) {
  return ((jd + 9) % 10 + 10) % 10
}
export function dayChiIndex(jd) {
  return ((jd + 1) % 12 + 12) % 12
}

export function monthChiIndex(lunarMonth) {
  return (lunarMonth + 1) % 12
}

export function monthCanIndex(lunarYear, lunarMonth) {
  const yc = yearCanIndex(lunarYear)
  const start = ((yc % 5) * 2 + 2) % 10
  return (start + lunarMonth - 1) % 10
}

export function hourChiIndex(hour) {
  if (hour === 23 || hour === 0) return 0
  return Math.floor((hour + 1) / 2) % 12
}

export function hourCanIndex(dayCan, hourChi) {
  return ((dayCan % 5) * 2 + hourChi) % 10
}

export const HOURS_CHI = [
  { chi: 0, name: 'Tý', from: 23, to: 1, label: '23–01' },
  { chi: 1, name: 'Sửu', from: 1, to: 3, label: '01–03' },
  { chi: 2, name: 'Dần', from: 3, to: 5, label: '03–05' },
  { chi: 3, name: 'Mão', from: 5, to: 7, label: '05–07' },
  { chi: 4, name: 'Thìn', from: 7, to: 9, label: '07–09' },
  { chi: 5, name: 'Tỵ', from: 9, to: 11, label: '09–11' },
  { chi: 6, name: 'Ngọ', from: 11, to: 13, label: '11–13' },
  { chi: 7, name: 'Mùi', from: 13, to: 15, label: '13–15' },
  { chi: 8, name: 'Thân', from: 15, to: 17, label: '15–17' },
  { chi: 9, name: 'Dậu', from: 17, to: 19, label: '17–19' },
  { chi: 10, name: 'Tuất', from: 19, to: 21, label: '19–21' },
  { chi: 11, name: 'Hợi', from: 21, to: 23, label: '21–23' },
]

export const TIET_KHI = [
  'Lập Xuân',
  'Vũ Thủy',
  'Kinh Trập',
  'Xuân Phân',
  'Thanh Minh',
  'Cốc Vũ',
  'Lập Hạ',
  'Tiểu Mãn',
  'Mang Chủng',
  'Hạ Chí',
  'Tiểu Thử',
  'Đại Thử',
  'Lập Thu',
  'Xử Thử',
  'Bạch Lộ',
  'Thu Phân',
  'Hàn Lộ',
  'Sương Giáng',
  'Lập Đông',
  'Tiểu Tuyết',
  'Đại Tuyết',
  'Đông Chí',
  'Tiểu Hàn',
  'Đại Hàn',
]

export function sunLongitudeDeg(jdn) {
  let deg = (sunLongitude(jdn) * 180) / PI
  deg = ((deg % 360) + 360) % 360
  return deg
}

export function tietKhiIndex(jd) {
  const deg = sunLongitudeDeg(jd - 0.5 - TZ / 24)
  return Math.floor((((deg - 315) % 360) + 360) % 360 / 15)
}

export function vnParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    day: Number(parts.day),
    month: Number(parts.month),
    year: Number(parts.year),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

export function makeDate(y, m, d) {
  return { year: y, month: m, day: d }
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function weekdayIndex(year, month, day) {
  return new Date(year, month - 1, day).getDay()
}

export function addDays(y, m, d, n) {
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }
}

export function lunarYearAge(birthLunarYear, currentLunarYear) {
  return currentLunarYear - birthLunarYear + 1
}

export function getFullDate(y, m, d) {
  const jd = jdFromDate(d, m, y)
  const lunar = convertSolar2Lunar(d, m, y)
  const weekday = weekdayIndex(y, m, d)
  const dayCan = dayCanIndex(jd)
  const dayChi = dayChiIndex(jd)
  const monthCan = monthCanIndex(lunar.year, lunar.month)
  const monthChi = monthChiIndex(lunar.month)
  const yearCan = yearCanIndex(lunar.year)
  const yearChi = yearChiIndex(lunar.year)
  return {
    solar: { year: y, month: m, day: d },
    lunar,
    jd,
    weekday,
    weekdayName: WEEKDAYS[weekday],
    canChi: {
      day: { can: dayCan, chi: dayChi, text: `${CAN[dayCan]} ${CHI[dayChi]}` },
      month: { can: monthCan, chi: monthChi, text: `${CAN[monthCan]} ${CHI[monthChi]}` },
      year: { can: yearCan, chi: yearChi, text: `${CAN[yearCan]} ${CHI[yearChi]}` },
    },
    tietKhi: TIET_KHI[tietKhiIndex(jd)],
    conGiap: CON_GIAP[yearChi],
  }
}

export function getMonthCells(year, month) {
  const firstWeekday = weekdayIndex(year, month, 1)
  const count = daysInMonth(year, month)
  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= count; d++) {
    cells.push(getFullDate(year, month, d))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
