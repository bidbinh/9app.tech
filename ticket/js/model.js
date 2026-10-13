import { parseIso, toIso } from './time.js';

export const MODES = ['bay', 'tau', 'xe'];
export const MODE_LABEL = { bay: 'Chuyến bay', tau: 'Tàu hỏa', xe: 'Xe khách' };
export const MAX_PASSENGERS = 20;
export const MAX_PAYMENTS = 50;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function newId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

function place(v) {
  if (!v || typeof v !== 'object') return null;
  const name = str(v.name, 80);
  const code = str(v.code, 8).toUpperCase();
  if (!name && !code) return null;
  return { code, name: name || code };
}

export function validateTrip(raw) {
  if (!raw || typeof raw !== 'object') return { trip: null, errors: ['Dữ liệu chuyến không hợp lệ.'] };
  const errors = [];
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : null;
  if (!id) errors.push('Thiếu hoặc sai mã chuyến.');
  const mode = MODES.includes(raw.mode) ? raw.mode : null;
  if (!mode) errors.push('Chọn loại chuyến: bay, tàu hoặc xe.');
  const from = place(raw.from), to = place(raw.to);
  if (!from) errors.push('Thiếu nơi đi.');
  if (!to) errors.push('Thiếu nơi đến.');
  const dp = parseIso(raw.departAt);
  if (!dp) errors.push('Giờ đi không hợp lệ (cần ngày, giờ và múi giờ).');
  let arriveAt = null;
  if (raw.arriveAt) {
    const ap = parseIso(raw.arriveAt);
    if (!ap) errors.push('Giờ đến không hợp lệ.');
    else if (dp && ap.ms < dp.ms) errors.push('Giờ đến phải sau giờ đi.');
    else arriveAt = toIso(ap.ms, ap.offsetMin);
  }
  if (errors.length) return { trip: null, errors };

  const passengers = (Array.isArray(raw.passengers) ? raw.passengers : []).slice(0, MAX_PASSENGERS)
    .map((p) => ({ name: str(p && p.name, 60), seat: str(p && p.seat, 8), bag: str(p && p.bag, 20) }))
    .filter((p) => p.name);
  const payments = (Array.isArray(raw.payments) ? raw.payments : []).slice(0, MAX_PAYMENTS)
    .map((p) => ({ payer: str(p && p.payer, 40), amount: p ? p.amount : NaN, label: str(p && p.label, 60) }))
    .filter((p) => p.payer && Number.isInteger(p.amount) && p.amount > 0 && p.amount <= 1e9);
  const leadMin = Number.isInteger(raw.leadMin) && raw.leadMin >= 0 && raw.leadMin <= 720 ? raw.leadMin : null;

  return {
    trip: {
      id, mode,
      operator: str(raw.operator, 60),
      code: str(raw.code, 12).toUpperCase(),
      from, to,
      departAt: toIso(dp.ms, dp.offsetMin),
      arriveAt,
      pnr: str(raw.pnr, 10).toUpperCase().replace(/[^A-Z0-9]/g, ''),
      passengers,
      gate: str(raw.gate, 10),
      terminal: str(raw.terminal, 10),
      note: str(raw.note, 1000),
      payments,
      leadMin,
    },
    errors: [],
  };
}

export const cleanTrip = (raw) => validateTrip(raw).trip;

const departMs = (t) => parseIso(t.departAt).ms;
export function tripEndMs(t) {
  return t.arriveAt ? parseIso(t.arriveAt).ms : departMs(t) + 6 * 3600000;
}
export const sortTrips = (trips) => trips.slice().sort((a, b) => departMs(a) - departMs(b));

export function splitUpcoming(trips, nowMs) {
  const sorted = sortTrips(trips);
  return {
    upcoming: sorted.filter((t) => tripEndMs(t) >= nowMs),
    past: sorted.filter((t) => tripEndMs(t) < nowMs).reverse(),
  };
}

export function countdown(depMs, nowMs) {
  const d = depMs - nowMs;
  if (d <= 0) return 'đã khởi hành';
  const min = Math.floor(d / 60000);
  if (min < 60) return `còn ${min} phút`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `còn ${h} giờ ${min % 60} phút` : `còn ${h} giờ`;
  return `còn ${Math.floor(h / 24)} ngày ${h % 24} giờ`;
}
