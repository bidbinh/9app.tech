import type { Airport, Leg } from '../types';

export const AIRPORTS: Airport[] = [
  { code: 'SGN', city: 'TP. Hồ Chí Minh', name: 'Tân Sơn Nhất', country: 'Việt Nam' },
  { code: 'HAN', city: 'Hà Nội', name: 'Nội Bài', country: 'Việt Nam' },
  { code: 'DAD', city: 'Đà Nẵng', name: 'Đà Nẵng', country: 'Việt Nam' },
  { code: 'CXR', city: 'Nha Trang', name: 'Cam Ranh', country: 'Việt Nam' },
  { code: 'PQC', city: 'Phú Quốc', name: 'Phú Quốc', country: 'Việt Nam' },
  { code: 'HPH', city: 'Hải Phòng', name: 'Cát Bi', country: 'Việt Nam' },
  { code: 'VCA', city: 'Cần Thơ', name: 'Cần Thơ', country: 'Việt Nam' },
  { code: 'ICN', city: 'Seoul', name: 'Incheon', country: 'Hàn Quốc' },
  { code: 'SIN', city: 'Singapore', name: 'Changi', country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Thái Lan' },
  { code: 'NRT', city: 'Tokyo', name: 'Narita', country: 'Nhật Bản' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hồng Kông', country: 'Hồng Kông' },
];

export const AIRLINES: Record<string, string> = {
  VN: 'Vietnam Airlines',
  VJ: 'Vietjet',
  QH: 'Bamboo Airways',
  VU: 'Vietravel Airlines',
  BL: 'Pacific Airlines',
  KE: 'Korean Air',
  SQ: 'Singapore Airlines',
  TG: 'Thai Airways',
  NH: 'ANA',
  CX: 'Cathay Pacific',
};

const VN = new Set(['SGN', 'HAN', 'DAD', 'CXR', 'PQC', 'HPH', 'VCA']);

export function isVietnam(code: string): boolean {
  return VN.has(code);
}

export function airportByCode(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code);
}

export function cityOf(code: string): string {
  return airportByCode(code)?.city ?? code;
}

/** Minutes, one way. Missing pairs fall back in duration(). */
const DURATION: Record<string, number> = {
  'SGN-HAN': 125,
  'SGN-DAD': 80,
  'SGN-CXR': 65,
  'SGN-PQC': 60,
  'SGN-HPH': 120,
  'SGN-VCA': 55,
  'SGN-ICN': 300,
  'SGN-SIN': 120,
  'SGN-BKK': 90,
  'SGN-NRT': 360,
  'SGN-HKG': 165,
  'HAN-DAD': 80,
  'HAN-CXR': 105,
  'HAN-PQC': 135,
  'HAN-HPH': 45,
  'HAN-VCA': 130,
  'HAN-ICN': 270,
  'HAN-SIN': 195,
  'HAN-BKK': 115,
  'HAN-NRT': 330,
  'HAN-HKG': 125,
  'DAD-CXR': 45,
  'DAD-PQC': 70,
  'DAD-ICN': 280,
  'DAD-SIN': 150,
  'CXR-PQC': 55,
  'PQC-SIN': 105,
};

/** Economy fare, VND, one adult, before airline factor. */
const PRICE: Record<string, number> = {
  'SGN-HAN': 1320000,
  'SGN-DAD': 890000,
  'SGN-CXR': 740000,
  'SGN-PQC': 810000,
  'SGN-HPH': 1180000,
  'SGN-VCA': 640000,
  'SGN-ICN': 4350000,
  'SGN-SIN': 2180000,
  'SGN-BKK': 1680000,
  'SGN-NRT': 6950000,
  'SGN-HKG': 3250000,
  'HAN-DAD': 980000,
  'HAN-CXR': 1120000,
  'HAN-PQC': 1490000,
  'HAN-HPH': 560000,
  'HAN-VCA': 1380000,
  'HAN-ICN': 3980000,
  'HAN-SIN': 2860000,
  'HAN-BKK': 1920000,
  'HAN-NRT': 6520000,
  'HAN-HKG': 2740000,
  'DAD-CXR': 620000,
  'DAD-PQC': 780000,
  'DAD-ICN': 4100000,
  'DAD-SIN': 2450000,
  'PQC-SIN': 1980000,
};

export function durationMin(from: string, to: string): number {
  return DURATION[`${from}-${to}`] ?? DURATION[`${to}-${from}`] ?? 150;
}

export function baseFare(from: string, to: string): number {
  const listed = PRICE[`${from}-${to}`] ?? PRICE[`${to}-${from}`];
  if (listed) return listed;
  return Math.max(480000, Math.round((durationMin(from, to) * 12000) / 1000) * 1000);
}

export const AIRLINE_FACTOR: Record<string, number> = {
  VN: 1.14,
  QH: 1.04,
  VJ: 0.82,
  VU: 0.88,
  BL: 0.9,
  KE: 1.32,
  SQ: 1.48,
  TG: 1.22,
  NH: 1.55,
  CX: 1.4,
};

/** Delay minutes keyed by flight number. Absent means on schedule. */
export const DELAY_MIN: Record<string, number> = {
  VJ165: 25,
  VJ171: 15,
  BL320: 10,
  VU775: 35,
  VJ807: 30,
  KE684: 20,
  TG551: 15,
};

export const CANCELLED = new Set(['QH164']);

function leg(fn: string, al: string, from: string, to: string, dep: string): Leg {
  return { fn, al, from, to, dep };
}

/** Today's published movements. Both directions are listed so every airport has a board. */
export const LEGS: Leg[] = [
  leg('VN210', 'VN', 'SGN', 'HAN', '06:15'),
  leg('VJ165', 'VJ', 'SGN', 'HAN', '08:40'),
  leg('QH202', 'QH', 'SGN', 'HAN', '11:05'),
  leg('VN216', 'VN', 'SGN', 'HAN', '14:20'),
  leg('VJ171', 'VJ', 'SGN', 'HAN', '17:35'),
  leg('VN220', 'VN', 'SGN', 'HAN', '19:50'),
  leg('BL148', 'BL', 'SGN', 'HAN', '21:30'),
  leg('VN211', 'VN', 'HAN', 'SGN', '06:00'),
  leg('VJ166', 'VJ', 'HAN', 'SGN', '07:55'),
  leg('QH203', 'QH', 'HAN', 'SGN', '10:20'),
  leg('VN217', 'VN', 'HAN', 'SGN', '13:40'),
  leg('VJ172', 'VJ', 'HAN', 'SGN', '16:10'),
  leg('VN221', 'VN', 'HAN', 'SGN', '18:45'),
  leg('BL149', 'BL', 'HAN', 'SGN', '20:55'),

  leg('VN230', 'VN', 'SGN', 'DAD', '06:50'),
  leg('VJ621', 'VJ', 'SGN', 'DAD', '09:25'),
  leg('BL320', 'BL', 'SGN', 'DAD', '13:10'),
  leg('VN240', 'VN', 'SGN', 'DAD', '18:15'),
  leg('VN231', 'VN', 'DAD', 'SGN', '08:25'),
  leg('VJ622', 'VJ', 'DAD', 'SGN', '11:00'),
  leg('BL321', 'BL', 'DAD', 'SGN', '15:00'),
  leg('VN241', 'VN', 'DAD', 'SGN', '20:00'),

  leg('VJ851', 'VJ', 'SGN', 'CXR', '07:20'),
  leg('VN142', 'VN', 'SGN', 'CXR', '12:40'),
  leg('QH164', 'QH', 'SGN', 'CXR', '16:05'),
  leg('VJ852', 'VJ', 'CXR', 'SGN', '09:10'),
  leg('VN143', 'VN', 'CXR', 'SGN', '14:30'),
  leg('QH165', 'QH', 'CXR', 'SGN', '18:00'),

  leg('VJ315', 'VJ', 'SGN', 'PQC', '08:05'),
  leg('VN186', 'VN', 'SGN', 'PQC', '13:55'),
  leg('VU775', 'VU', 'SGN', 'PQC', '19:10'),
  leg('VJ316', 'VJ', 'PQC', 'SGN', '09:40'),
  leg('VN187', 'VN', 'PQC', 'SGN', '15:20'),
  leg('VU776', 'VU', 'PQC', 'SGN', '20:40'),

  leg('VN198', 'VN', 'SGN', 'HPH', '10:30'),
  leg('VJ404', 'VJ', 'SGN', 'HPH', '15:45'),
  leg('VN199', 'VN', 'HPH', 'SGN', '12:50'),
  leg('VJ405', 'VJ', 'HPH', 'SGN', '17:55'),

  leg('VN160', 'VN', 'SGN', 'VCA', '09:00'),
  leg('QH318', 'QH', 'SGN', 'VCA', '17:05'),
  leg('VJ450', 'VJ', 'SGN', 'VCA', '20:10'),
  leg('VN161', 'VN', 'VCA', 'SGN', '10:20'),
  leg('QH319', 'QH', 'VCA', 'SGN', '18:30'),
  leg('VJ451', 'VJ', 'VCA', 'SGN', '21:25'),

  leg('VN408', 'VN', 'SGN', 'ICN', '22:50'),
  leg('KE684', 'KE', 'SGN', 'ICN', '23:35'),
  leg('VN409', 'VN', 'ICN', 'SGN', '08:40'),
  leg('KE685', 'KE', 'ICN', 'SGN', '19:15'),

  leg('SQ173', 'SQ', 'SGN', 'SIN', '09:40'),
  leg('VN651', 'VN', 'SGN', 'SIN', '14:55'),
  leg('VJ807', 'VJ', 'SGN', 'SIN', '20:25'),
  leg('SQ174', 'SQ', 'SIN', 'SGN', '08:15'),
  leg('VN652', 'VN', 'SIN', 'SGN', '13:10'),
  leg('VJ808', 'VJ', 'SIN', 'SGN', '19:05'),

  leg('TG552', 'TG', 'SGN', 'BKK', '11:50'),
  leg('VN605', 'VN', 'SGN', 'BKK', '18:40'),
  leg('TG551', 'TG', 'BKK', 'SGN', '10:20'),
  leg('VN606', 'VN', 'BKK', 'SGN', '16:55'),

  leg('NH832', 'NH', 'SGN', 'NRT', '22:40'),
  leg('NH833', 'NH', 'NRT', 'SGN', '09:30'),

  leg('CX767', 'CX', 'SGN', 'HKG', '16:30'),
  leg('VN510', 'VN', 'SGN', 'HKG', '21:05'),
  leg('CX768', 'CX', 'HKG', 'SGN', '12:15'),
  leg('VN511', 'VN', 'HKG', 'SGN', '19:20'),

  leg('VN154', 'VN', 'HAN', 'DAD', '07:30'),
  leg('VJ511', 'VJ', 'HAN', 'DAD', '12:15'),
  leg('VN156', 'VN', 'HAN', 'DAD', '17:45'),
  leg('VN155', 'VN', 'DAD', 'HAN', '09:15'),
  leg('VJ512', 'VJ', 'DAD', 'HAN', '14:00'),
  leg('VN157', 'VN', 'DAD', 'HAN', '19:30'),

  leg('VN183', 'VN', 'HAN', 'CXR', '08:10'),
  leg('VJ641', 'VJ', 'HAN', 'CXR', '15:25'),
  leg('VN184', 'VN', 'CXR', 'HAN', '10:40'),
  leg('VJ642', 'VJ', 'CXR', 'HAN', '17:50'),

  leg('QH152', 'QH', 'HAN', 'PQC', '09:50'),
  leg('VJ321', 'VJ', 'HAN', 'PQC', '16:40'),
  leg('QH153', 'QH', 'PQC', 'HAN', '12:20'),
  leg('VJ322', 'VJ', 'PQC', 'HAN', '19:15'),

  leg('VN150', 'VN', 'HAN', 'HPH', '06:40'),
  leg('VJ201', 'VJ', 'HAN', 'HPH', '09:30'),
  leg('VN152', 'VN', 'HAN', 'HPH', '13:15'),
  leg('VJ203', 'VJ', 'HAN', 'HPH', '18:20'),
  leg('VN151', 'VN', 'HPH', 'HAN', '07:50'),
  leg('VJ202', 'VJ', 'HPH', 'HAN', '11:00'),
  leg('VN153', 'VN', 'HPH', 'HAN', '14:40'),
  leg('VJ204', 'VJ', 'HPH', 'HAN', '19:45'),

  leg('VN170', 'VN', 'HAN', 'VCA', '11:35'),
  leg('VN171', 'VN', 'VCA', 'HAN', '13:50'),

  leg('VN414', 'VN', 'HAN', 'ICN', '23:05'),
  leg('KE481', 'KE', 'HAN', 'ICN', '08:20'),
  leg('VN415', 'VN', 'ICN', 'HAN', '07:10'),
  leg('KE482', 'KE', 'ICN', 'HAN', '18:50'),

  leg('VN661', 'VN', 'HAN', 'SIN', '13:25'),
  leg('VN662', 'VN', 'SIN', 'HAN', '16:40'),

  leg('TG564', 'TG', 'HAN', 'BKK', '10:05'),
  leg('VN611', 'VN', 'HAN', 'BKK', '19:00'),
  leg('TG565', 'TG', 'BKK', 'HAN', '12:30'),
  leg('VN612', 'VN', 'BKK', 'HAN', '21:15'),

  leg('NH856', 'NH', 'HAN', 'NRT', '23:20'),
  leg('NH857', 'NH', 'NRT', 'HAN', '10:45'),

  leg('CX759', 'CX', 'HAN', 'HKG', '15:10'),
  leg('VN520', 'VN', 'HAN', 'HKG', '20:35'),
  leg('CX760', 'CX', 'HKG', 'HAN', '11:25'),
  leg('VN521', 'VN', 'HKG', 'HAN', '18:05'),

  leg('QH180', 'QH', 'DAD', 'CXR', '11:40'),
  leg('QH181', 'QH', 'CXR', 'DAD', '13:05'),
  leg('VU701', 'VU', 'DAD', 'PQC', '14:15'),
  leg('VU702', 'VU', 'PQC', 'DAD', '16:00'),
  leg('VN422', 'VN', 'DAD', 'ICN', '22:10'),
  leg('VN423', 'VN', 'ICN', 'DAD', '06:30'),
  leg('VN671', 'VN', 'DAD', 'SIN', '15:50'),
  leg('VN672', 'VN', 'SIN', 'DAD', '18:25'),
  leg('VJ809', 'VJ', 'PQC', 'SIN', '12:10'),
  leg('VJ810', 'VJ', 'SIN', 'PQC', '14:45'),
];
