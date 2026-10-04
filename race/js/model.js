// Mô hình lọc, tìm, sắp xếp và đọc/ghi bộ lọc trong URL hash.
import { fold, isISODate, daysBetween } from './util.js';

export const TYPES = [
  { id: 'road', label: 'Đường nhựa' },
  { id: 'trail', label: 'Trail' },
  { id: 'tri', label: 'Triathlon / Ironman' },
];

// Dải cự ly gần đúng theo từng cự ly của giải; trail 25K nằm ở dải 21K.
export const DISTANCES = [
  { id: '5K', label: '5K', hint: '3 - 7 km' },
  { id: '10K', label: '10K', hint: '8 - 15 km' },
  { id: '21K', label: '21K', hint: '16 - 30 km' },
  { id: '42K', label: '42K', hint: '31 - 49 km' },
  { id: 'ultra', label: 'Ultra', hint: '50 km trở lên' },
  { id: '70.3', label: '70.3', hint: 'Half Ironman' },
  { id: 'full', label: 'Ironman', hint: 'Full Ironman' },
];

export const REGIONS = [
  { id: 'vn', label: 'Việt Nam' },
  { id: 'vn-bac', label: 'Miền Bắc' },
  { id: 'vn-trung', label: 'Miền Trung - Tây Nguyên' },
  { id: 'vn-nam', label: 'Miền Nam' },
  { id: 'sea', label: 'Đông Nam Á' },
  { id: 'asia', label: 'Châu Á' },
  { id: 'world', label: 'Thế giới' },
];

export const REG_STATES = [
  { id: 'soon', label: 'Sắp mở' },
  { id: 'open', label: 'Đang mở' },
  { id: 'closed', label: 'Đã đóng' },
  { id: 'unknown', label: 'Chưa rõ' },
];

export const REG_LABEL = {
  soon: 'Sắp mở đăng ký',
  open: 'Đang mở đăng ký',
  closed: 'Đã đóng đăng ký',
  soldout: 'Hết vé',
  unknown: 'Chưa rõ đăng ký',
};

const ID_SET = (arr) => new Set(arr.map((x) => x.id));
const TYPE_IDS = ID_SET(TYPES);
const DIST_IDS = ID_SET(DISTANCES);
const REGION_IDS = ID_SET(REGIONS);
const REG_IDS = ID_SET(REG_STATES);

/** Dải cự ly của một giải. */
export function distanceBands(race) {
  const out = new Set();
  for (const km of race.distances || []) {
    if (km < 3) continue;
    if (km <= 7) out.add('5K');
    else if (km <= 15) out.add('10K');
    else if (km <= 30) out.add('21K');
    else if (km < 50) out.add('42K');
    else out.add('ultra');
  }
  if (race.format === '70.3') out.add('70.3');
  if (race.format === 'full') out.add('full');
  return out;
}

export function endOf(race) {
  return race.endDate || race.startDate;
}

export function isPast(race, today) {
  return endOf(race) < today;
}

/** Trạng thái đăng ký tại thời điểm `today` (ưu tiên mốc ngày nếu có). */
export function regStatusOf(race, today) {
  if (isPast(race, today)) return 'closed';
  if (race.regStatus === 'soldout') return 'soldout';
  if (race.regCloses && today > race.regCloses) return 'closed';
  if (race.regOpens && today < race.regOpens) return 'soon';
  return race.regStatus || 'unknown';
}

/** Nhóm dùng cho bộ lọc: hết vé gộp vào đã đóng. */
export function regGroup(status) {
  return status === 'soldout' ? 'closed' : status;
}

export function searchText(race) {
  return fold([race.name, race.city, race.venue, race.organizer, race.country, ...(race.tags || [])].filter(Boolean).join(' '));
}

export function defaultFilters() {
  return { types: [], dists: [], regions: [], regs: [], q: '', past: false, view: 'list', month: '', day: '' };
}

function pickList(raw, allowed) {
  if (!raw) return [];
  const out = [];
  for (const v of raw.split(',')) {
    const t = v.trim();
    if (allowed.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Đọc location.hash.
 * Dạng: #/?type=trail&dist=42K,ultra&region=vn-bac&reg=open&q=da%20lat&past=1&view=month&m=2026-11&d=2026-11-15
 *       #/g/<id>   #/mine   #/about
 */
export function parseHash(hash) {
  let h = String(hash || '');
  if (h.startsWith('#')) h = h.slice(1);
  if (!h.startsWith('/')) h = '/' + h;
  const qi = h.indexOf('?');
  const path = qi >= 0 ? h.slice(0, qi) : h;
  const query = qi >= 0 ? h.slice(qi + 1) : '';
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'g') {
    let id = '';
    try { id = decodeURIComponent(parts[1] || ''); } catch { id = ''; }
    return { route: 'detail', id: SAFE_ID.test(id) ? id : '', filters: defaultFilters() };
  }
  if (parts[0] === 'mine') return { route: 'mine', id: '', filters: defaultFilters() };
  if (parts[0] === 'about') return { route: 'about', id: '', filters: defaultFilters() };

  const f = defaultFilters();
  const sp = new URLSearchParams(query);
  f.types = pickList(sp.get('type'), TYPE_IDS);
  f.dists = pickList(sp.get('dist'), DIST_IDS);
  f.regions = pickList(sp.get('region'), REGION_IDS);
  f.regs = pickList(sp.get('reg'), REG_IDS);
  f.q = (sp.get('q') || '').slice(0, 80);
  f.past = sp.get('past') === '1';
  f.view = sp.get('view') === 'month' ? 'month' : 'list';
  const m = sp.get('m') || '';
  f.month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : '';
  const d = sp.get('d') || '';
  f.day = isISODate(d) ? d : '';
  return { route: 'list', id: '', filters: f };
}

/** Ngược lại với parseHash; bỏ giá trị mặc định cho URL gọn. */
export function buildHash(route, filters, id) {
  if (route === 'detail') return `#/g/${encodeURIComponent(id)}`;
  if (route === 'mine') return '#/mine';
  if (route === 'about') return '#/about';
  const f = { ...defaultFilters(), ...(filters || {}) };
  const sp = new URLSearchParams();
  if (f.types.length) sp.set('type', f.types.join(','));
  if (f.dists.length) sp.set('dist', f.dists.join(','));
  if (f.regions.length) sp.set('region', f.regions.join(','));
  if (f.regs.length) sp.set('reg', f.regs.join(','));
  if (f.q) sp.set('q', f.q);
  if (f.past) sp.set('past', '1');
  if (f.view === 'month') sp.set('view', 'month');
  if (f.month) sp.set('m', f.month);
  if (f.day) sp.set('d', f.day);
  const s = sp.toString();
  return s ? `#/?${s}` : '#/';
}

export function activeFilterCount(f) {
  return f.types.length + f.dists.length + f.regions.length + f.regs.length + (f.q ? 1 : 0) + (f.past ? 1 : 0);
}

function regionMatches(race, regions) {
  return regions.some((r) => (r === 'vn' ? race.region.startsWith('vn-') : race.region === r));
}

/** Lọc: AND giữa các nhóm, OR trong một nhóm. Không lọc theo ngày (xem selectRaces). */
export function matches(race, f, today) {
  if (f.types.length && !f.types.includes(race.type)) return false;
  if (f.regions.length && !regionMatches(race, f.regions)) return false;
  if (f.dists.length) {
    const b = distanceBands(race);
    if (!f.dists.some((d) => b.has(d))) return false;
  }
  if (f.regs.length && !f.regs.includes(regGroup(regStatusOf(race, today)))) return false;
  if (f.q) {
    const hay = searchText(race);
    const tokens = fold(f.q).split(/\s+/).filter(Boolean);
    if (!tokens.every((t) => hay.includes(t))) return false;
  }
  return true;
}

export function compareRaces(a, b) {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  const ea = endOf(a), eb = endOf(b);
  if (ea !== eb) return ea < eb ? -1 : 1;
  return fold(a.name).localeCompare(fold(b.name));
}

export function sortRaces(list) {
  return [...list].sort(compareRaces);
}

/**
 * Danh sách hiển thị. Chế độ danh sách: mặc định chỉ giải chưa qua (past=1 thì hiện cả đã qua).
 * Chế độ tháng: các giải giao với tháng đó (kể cả đã qua).
 */
export function selectRaces(races, f, today) {
  let out = races.filter((r) => matches(r, f, today));
  if (f.view === 'month') {
    const ym = f.month || today.slice(0, 7);
    out = out.filter((r) => r.startDate.slice(0, 7) <= ym && endOf(r).slice(0, 7) >= ym);
    if (f.day) out = out.filter((r) => r.startDate <= f.day && endOf(r) >= f.day);
  } else if (!f.past) {
    out = out.filter((r) => !isPast(r, today));
  }
  return sortRaces(out);
}

/** Lưới tháng: mảng tuần (T2 đầu tuần), ô là chuỗi ISO hoặc null. */
export function monthMatrix(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Chữ đếm ngược. */
export function countdownText(race, today) {
  const end = endOf(race);
  if (end < today) return 'Đã diễn ra';
  const n = daysBetween(today, race.startDate);
  if (n > 1) return `Còn ${n} ngày`;
  if (n === 1) return 'Ngày mai';
  return n === 0 ? 'Hôm nay' : 'Đang diễn ra';
}
