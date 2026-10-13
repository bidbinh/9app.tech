import { shiftIso } from './time.js';

export const LEAD = { bayNoiDia: 120, bayQuocTe: 180, tau: 45, xe: 30 };

export function isInternational(trip, stations) {
  if (trip.mode !== 'bay') return false;
  const country = (p) => {
    const s = p && p.code ? stations.find((x) => x.code === p.code) : null;
    return s ? s.country : null;
  };
  const a = country(trip.from), b = country(trip.to);
  return Boolean((a && a !== 'VN') || (b && b !== 'VN'));
}

export function leadMinutes(trip, international) {
  if (Number.isInteger(trip.leadMin)) return trip.leadMin;
  if (trip.mode === 'bay') return international ? LEAD.bayQuocTe : LEAD.bayNoiDia;
  return trip.mode === 'tau' ? LEAD.tau : LEAD.xe;
}

export const leaveByIso = (trip, international) => shiftIso(trip.departAt, -leadMinutes(trip, international));

export const placeWord = (mode) => ({ bay: 'sân bay', tau: 'ga', xe: 'bến' }[mode] || 'điểm đi');
