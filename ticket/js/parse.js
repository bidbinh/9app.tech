import { newId } from './model.js';
import { toIso } from './time.js';

const MAX_TEXT = 20000;
const AIRLINES = { VN: 'Vietnam Airlines', VJ: 'Vietjet Air', QH: 'Bamboo Airways', BL: 'Pacific Airlines', VU: 'Vietravel Airlines' };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const foldKeep = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const fl = (s) => foldKeep(s).toLowerCase();

export function matchStation(stations, query, mode) {
  const q = String(query || '').trim();
  if (!q) return null;
  const pool = stations.filter((s) => !mode || s.kinds.includes(mode));
  const byCode = pool.find((s) => s.code && s.code === q.toUpperCase());
  if (byCode) return byCode;
  const f = fl(q);
  return pool.find((s) => [s.name, ...(s.aliases || [])].some((a) => fl(a) === f)) || null;
}

export function findStations(stations, text, mode) {
  const keep = foldKeep(text), low = keep.toLowerCase();
  const hits = [];
  for (const s of stations) {
    if (!s.kinds.includes(mode)) continue;
    let pos = -1;
    if (s.code) {
      const m = new RegExp('(^|[^A-Za-z0-9])' + s.code + '(?![A-Za-z0-9])').exec(keep);
      if (m) pos = m.index + m[1].length;
    }
    for (const a of [s.name, ...(s.aliases || [])]) {
      const f = fl(a);
      if (!f) continue;
      const m = new RegExp('(^|[^a-z0-9])' + esc(f) + '(?![a-z0-9])').exec(low);
      if (m) { const p = m.index + m[1].length; if (pos < 0 || p < pos) pos = p; }
    }
    if (pos >= 0) hits.push({ s, pos });
  }
  hits.sort((a, b) => a.pos - b.pos);
  return hits.map((h) => h.s);
}

const wallMs = (y, mo, d, h, mi) => {
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const dt = new Date(ms);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? ms : null;
};
const offMin = (tz) => (tz[0] === '-' ? -1 : 1) * (+tz.slice(1, 3) * 60 + +tz.slice(4, 6));

function readDates(text, nowMs) {
  const out = [];
  const nowDay = Math.floor((nowMs + 7 * 3600000) / 86400000);
  const nowYear = new Date(nowMs + 7 * 3600000).getUTCFullYear();
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?(?!\d)/g)) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : nowYear;
    if (wallMs(y, mo, d, 0, 0) == null) continue;
    if (!m[3] && Math.floor(wallMs(y, mo, d, 0, 0) / 86400000) < nowDay) y += 1;
    if (wallMs(y, mo, d, 0, 0) == null) continue;
    out.push({ y, mo, d });
  }
  return out;
}
const readTimes = (text) => [...text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)].map((m) => ({ h: +m[1], mi: +m[2] }));

export function parseTicketText(input, { stations, now = Date.now() } = {}) {
  const text = String(input == null ? '' : input).slice(0, MAX_TEXT);
  if (!text.trim()) return { ok: false, trip: null, issues: ['Chưa có nội dung để đọc.'] };
  const issues = [];
  const flight = /(?<![A-Za-z0-9])(VN|VJ|QH|BL|VU)\s?(\d{1,4})(?![A-Za-z0-9])/.exec(text);
  const train = /(?<![A-Za-z0-9])(SE|TN|SPT|SNT|SP)\s?(\d{1,2})(?![A-Za-z0-9])/.exec(text);
  let mode = '', code = '', operator = '';
  if (flight) { mode = 'bay'; code = flight[1] + flight[2]; operator = AIRLINES[flight[1]]; }
  else if (train) { mode = 'tau'; code = train[1] + train[2]; operator = 'Đường sắt Việt Nam'; }
  else if (/xe khach|nha xe|limousine|giuong nam|vexere/i.test(foldKeep(text))) mode = 'xe';
  if (!mode) {
    return {
      ok: false,
      trip: { id: newId(), mode: '', operator: '', code: '', from: null, to: null, departAt: '', arriveAt: '', pnr: '', passengers: [], gate: '', terminal: '', note: '', payments: [] },
      issues: ['Không nhận ra số hiệu chuyến bay, tàu hay nhà xe. Hãy nhập tay.'],
    };
  }

  const keep = foldKeep(text);
  const pnrM = /(?:ma (?:dat|giu) cho|booking(?: code| ref(?:erence)?)?|pnr)\s*[:#-]?\s*([A-Za-z0-9]{5,8})(?![A-Za-z0-9])/i.exec(keep);
  const gateM = /(?:cong|gate)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?)(?![A-Za-z0-9])/i.exec(keep);
  const termM = /(?:nha ga|terminal)\s*[:\-]?\s*(T?\d)(?![A-Za-z0-9])/i.exec(keep);

  const passengers = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:hành khách|hanh khach|passenger)\s*[:\-]\s*(.+)$/i.exec(line);
    if (!m || passengers.length >= 20) continue;
    const seat = /(?:ghế|ghe|seat)\s*[:\-]?\s*(\d{1,2}[A-Za-z]?)/i.exec(m[1]);
    const name = m[1].split(/\s{2,}|\s+(?:ghế|ghe|seat)\b/i)[0].trim();
    if (name) passengers.push({ name, seat: seat ? seat[1].toUpperCase() : '' });
  }

  const hits = findStations(stations, text, mode);
  const fromS = hits[0] || null, toS = hits[1] || null;
  if (!fromS || !toS) issues.push('Chưa nhận ra đủ nơi đi và nơi đến.');

  let departAt = '', arriveAt = '';
  const dates = readDates(text, now), times = readTimes(text);
  if (!dates.length || !times.length) issues.push('Chưa nhận ra ngày hoặc giờ đi.');
  else {
    const offD = offMin(fromS ? fromS.tz : '+07:00'), offA = offMin(toS ? toS.tz : '+07:00');
    const d1 = dates[0], t1 = times[0];
    const depMs = wallMs(d1.y, d1.mo, d1.d, t1.h, t1.mi) - offD * 60000;
    departAt = toIso(depMs, offD);
    if (times[1]) {
      const d2 = dates[1] || d1, t2 = times[1];
      let w = wallMs(d2.y, d2.mo, d2.d, t2.h, t2.mi);
      if (!dates[1] && w - offA * 60000 < depMs) w += 86400000;
      const arrMs = w - offA * 60000;
      if (arrMs >= depMs) arriveAt = toIso(arrMs, offA);
      else issues.push('Giờ đến nhận được sớm hơn giờ đi, bỏ qua giờ đến.');
    }
  }

  const trip = {
    id: newId(), mode, operator, code,
    from: fromS ? { code: fromS.code, name: fromS.name } : null,
    to: toS ? { code: toS.code, name: toS.name } : null,
    departAt, arriveAt, pnr: pnrM ? pnrM[1].toUpperCase() : '',
    passengers, gate: gateM ? gateM[1].toUpperCase() : '', terminal: termM ? termM[1].toUpperCase() : '', note: '', payments: [],
  };
  return { ok: Boolean(fromS && toS && departAt), trip, issues };
}
