// ĐIỂM DUY NHẤT nối nguồn trạng thái chuyến. Hiện: dữ liệu mẫu cho chuyến "mau-*", còn lại "chưa có thông tin".
// Sau này nối Datacom (hoặc nguồn khác) bằng setSource(async (trip, nowMs) => ({state, delayMin, gate, terminal, updatedAt, source})).
export const STATE_LABEL = { unknown: 'Chưa có thông tin', ontime: 'Đúng giờ', delayed: 'Trễ', cancelled: 'Đã hủy' };
const STATES = Object.keys(STATE_LABEL);
const SAMPLE = {
  'mau-bay': { state: 'ontime', delayMin: 0, gate: 'A12', terminal: 'T1' },
  'mau-tau': { state: 'delayed', delayMin: 40, gate: '', terminal: '' },
  'mau-xe': { state: 'ontime', delayMin: 0, gate: '', terminal: '' },
  'mau-bay-cu': { state: 'ontime', delayMin: 0, gate: 'C4', terminal: 'T2' },
};
const NONE = () => ({ state: 'unknown', delayMin: 0, gate: '', terminal: '', updatedAt: '', source: 'none' });
let source = null;

export function setSource(fn) { source = typeof fn === 'function' ? fn : null; }

export async function getStatus(trip, nowMs = Date.now()) {
  try {
    if (source) {
      const s = await source(trip, nowMs);
      return s && STATES.includes(s.state) ? { ...NONE(), ...s } : NONE();
    }
    const m = trip && SAMPLE[trip.id];
    if (m) return { ...m, updatedAt: new Date(nowMs).toISOString(), source: 'mau' };
  } catch { /* nguồn lỗi: coi như chưa có thông tin */ }
  return NONE();
}
