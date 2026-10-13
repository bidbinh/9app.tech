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

// Dòng nói về người/tổng đài thì không dùng để tìm nơi đi/đến, số hiệu chuyến, ngày giờ.
const PERSON_LINE = /^\s*(?:hành khách|hanh khach|passenger|họ tên|ho ten|tên khách|ten khach)\s*[:\-]/i;
const HOTLINE_LINE = /tổng đài|tong dai|hotline|hỗ trợ|ho tro|liên hệ|lien he|điện thoại|dien thoai|\btel\b|\bsđt\b|\bsdt\b/i;
// Ngày giờ đặt/xuất/thanh toán vé: không phải giờ khởi hành.
const BOOKING_SPAN = /(?:ngay dat|dat ve|booking date|issued?|xuat ve|ngay xuat|thanh toan|payment)[^0-9\n]{0,15}\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{4})?(?:\s*(?:luc|-|,)?\s*\d{1,2}:\d\d(?:\s?[ap]\.?m\.?)?)?/g;

function inSpans(spans, idx) { return spans.some(([a, b]) => idx >= a && idx < b); }

function readDates(low, nowMs, spans) {
  const out = [];
  const nowDay = Math.floor((nowMs + 7 * 3600000) / 86400000);
  const nowYear = new Date(nowMs + 7 * 3600000).getUTCFullYear();
  for (const m of low.matchAll(/(?<!\d)(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?(?!\d)/g)) {
    if (inSpans(spans, m.index)) continue;
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : nowYear;
    if (wallMs(y, mo, d, 0, 0) == null) continue;
    if (!m[3] && Math.floor(wallMs(y, mo, d, 0, 0) / 86400000) < nowDay) y += 1;
    if (wallMs(y, mo, d, 0, 0) == null) continue;
    out.push({ y, mo, d, idx: m.index });
  }
  return out;
}

function readTimes(low, spans) {
  const out = [];
  for (const m of low.matchAll(/(?<!\d)(\d{1,2}):([0-5]\d)(?:\s?([ap])\.?m\.?)?(?!\d)/g)) {
    if (inSpans(spans, m.index)) continue;
    let h = +m[1];
    if (m[3]) { if (h < 1 || h > 12) continue; h = h % 12 + (m[3] === 'p' ? 12 : 0); }
    else if (h > 23) continue;
    out.push({ h, mi: +m[2], idx: m.index });
  }
  return out;
}

export function parseTicketText(input, { stations, now = Date.now() } = {}) {
  const full = String(input == null ? '' : input).slice(0, MAX_TEXT);
  if (!full.trim()) return { ok: false, trip: null, issues: ['Chưa có nội dung để đọc.'] };
  const text = full.split(/\r?\n/).filter((l) => !PERSON_LINE.test(l) && !HOTLINE_LINE.test(l)).join('\n');
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
  const low = keep.toLowerCase();
  const pnrM = /(?:ma (?:dat|giu) cho|booking(?: code| reference| ref)?|pnr)\b\s*[:#-]?\s*([A-Za-z0-9]{5,8})(?![A-Za-z0-9])/i.exec(keep);
  const pnr = pnrM && (/\d/.test(pnrM[1]) || pnrM[1] === pnrM[1].toUpperCase()) ? pnrM[1].toUpperCase() : '';
  const gateM = /(?:cong|gate)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?)(?![A-Za-z0-9])/i.exec(keep);
  const termM = /(?:nha ga|terminal)\s*[:\-]?\s*(T?\d)(?![A-Za-z0-9])/i.exec(keep);

  const passengers = [];
  for (const line of full.split(/\r?\n/)) {
    const m = /^\s*(?:hành khách|hanh khach|passenger)\s*[:\-]\s*(.+)$/i.exec(line);
    if (!m || passengers.length >= 20) continue;
    const seat = /(?:ghế|ghe|seat)\s*[:\-]?\s*(\d{1,2}[A-Za-z]?)/i.exec(m[1]);
    const name = m[1].split(/\s{2,}|\s+(?:ghế|ghe|seat)\b/i)[0].trim();
    if (name) passengers.push({ name, seat: seat ? seat[1].toUpperCase() : '' });
  }

  const hits = findStations(stations, text, mode);
  const fromS = hits[0] || null, toS = hits[1] || null;
  if (!fromS || !toS) issues.push('Chưa nhận ra đủ nơi đi và nơi đến.');

  const spans = [...low.matchAll(BOOKING_SPAN)].map((m) => [m.index, m.index + m[0].length]);
  const depLabel = low.search(/khoi hanh|departure|gio di\b|ngay di\b/);
  const after = (x) => depLabel < 0 || x.idx >= depLabel;
  const dates = readDates(low, now, spans).filter(after), times = readTimes(low, spans).filter(after);

  let departAt = '', arriveAt = '';
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
    departAt, arriveAt, pnr,
    passengers, gate: gateM ? gateM[1].toUpperCase() : '', terminal: termM ? termM[1].toUpperCase() : '', note: '', payments: [],
  };
  return { ok: Boolean(fromS && toS && departAt), trip, issues };
}
