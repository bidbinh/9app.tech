import { validateTrip } from './model.js';
import { toIso } from './time.js';

const HOUR = 3600000, DAY = 24 * HOUR, OFF = 420;
const at = (nowMs, days, hour, minute = 0) => {
  const wall = new Date(nowMs + OFF * 60000 + days * DAY);
  return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), hour, minute) - OFF * 60000;
};

export function makeSamples(nowMs) {
  const mk = (o) => validateTrip(o).trip;
  const bay = at(nowMs, 2, 7, 30), tau = at(nowMs, 9, 19, 20), xe = at(nowMs, 20, 21, 0), cu = at(nowMs, -30, 14, 15);
  return [
    mk({ id: 'mau-bay', mode: 'bay', operator: 'Vietjet Air', code: 'VJ123', pnr: 'MAU123',
      from: { code: 'HAN', name: 'Hà Nội' }, to: { code: 'SGN', name: 'TP. Hồ Chí Minh' },
      departAt: toIso(bay, OFF), arriveAt: toIso(bay + 2 * HOUR + 10 * 60000, OFF),
      passengers: [{ name: 'NGUYEN VAN A', seat: '12A', bag: '20kg' }, { name: 'TRAN THI B', seat: '12B', bag: '20kg' }],
      gate: 'A12', terminal: 'T1', note: 'Dữ liệu mẫu',
      payments: [{ payer: 'NGUYEN VAN A', amount: 300000, label: 'Taxi ra sân bay' }] }),
    mk({ id: 'mau-tau', mode: 'tau', operator: 'Đường sắt Việt Nam', code: 'SE1',
      from: { code: '', name: 'Ga Hà Nội' }, to: { code: '', name: 'Ga Sài Gòn' },
      departAt: toIso(tau, OFF), arriveAt: toIso(tau + 32 * HOUR, OFF),
      passengers: [{ name: 'NGUYEN VAN A', seat: 'T4-G12' }], note: 'Dữ liệu mẫu' }),
    mk({ id: 'mau-xe', mode: 'xe', operator: '', code: '',
      from: { code: '', name: 'Hà Nội' }, to: { code: '', name: 'Sa Pa' },
      departAt: toIso(xe, OFF), arriveAt: toIso(xe + 6 * HOUR, OFF), note: 'Dữ liệu mẫu' }),
    mk({ id: 'mau-bay-cu', mode: 'bay', operator: 'Vietnam Airlines', code: 'VN245',
      from: { code: 'SGN', name: 'TP. Hồ Chí Minh' }, to: { code: 'DAD', name: 'Đà Nẵng' },
      departAt: toIso(cu, OFF), arriveAt: toIso(cu + 80 * 60000, OFF), note: 'Dữ liệu mẫu' }),
  ];
}
