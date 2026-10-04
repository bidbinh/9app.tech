// Sinh file lịch .ics (RFC 5545). Dùng sự kiện cả ngày (VALUE=DATE) nên không cần VTIMEZONE:
// ngày hiển thị đúng ở mọi múi giờ. Nhắc bằng VALARM.
import { addDays, fmtDate, fmtKm, isHttpsUrl } from './util.js';
import { endOf } from './model.js';

/** Escape giá trị TEXT: \ ; , và xuống dòng. */
export function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Gấp dòng tối đa 75 octet UTF-8, không cắt giữa ký tự. */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const compact = (iso) => iso.replace(/-/g, '');

export function utcStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
}

const DISCLAIMER = 'Thông tin tham khảo từ 9race, hãy kiểm tra trang chính thức của giải trước khi đăng ký.';

function describe(race, lead) {
  const parts = [lead];
  if (race.city) parts.push(`Địa điểm: ${race.city}`);
  if (race.distances && race.distances.length) parts.push(`Cự ly: ${race.distances.map(fmtKm).join(', ')}`);
  if (race.format) parts.push(`Thể thức: ${race.format === 'full' ? 'Ironman' : race.format}`);
  if (race.registerUrl && isHttpsUrl(race.registerUrl)) parts.push(`Đăng ký: ${race.registerUrl}`);
  parts.push(DISCLAIMER);
  return parts.join('\n');
}

// Trigger tính từ 00:00 của ngày sự kiện: -PT15H = 9 giờ sáng hôm trước, PT7H = 7 giờ sáng cùng ngày.
const ALARMS = {
  race: [
    { trigger: '-P6DT15H', text: 'Còn 7 ngày tới giải' },
    { trigger: '-PT15H', text: 'Ngày mai là ngày chạy' },
  ],
  regOpen: [
    { trigger: '-PT15H', text: 'Ngày mai mở đăng ký' },
    { trigger: 'PT7H', text: 'Hôm nay mở đăng ký' },
  ],
  regClose: [
    { trigger: '-P1DT15H', text: 'Còn 2 ngày là hết hạn đăng ký' },
    { trigger: '-PT15H', text: 'Ngày mai hết hạn đăng ký' },
  ],
  bib: [{ trigger: '-PT15H', text: 'Ngày mai nhận BIB' }],
};

/** Danh sách sự kiện cho một giải: ngày giải, mở/hạn đăng ký, nhận BIB (chỉ cái có dữ liệu). */
export function eventsForRace(race, opts = {}) {
  const evs = [];
  const only = opts.only || null;
  const want = (k) => !only || only.includes(k);
  const url = race.website && isHttpsUrl(race.website) ? race.website : null;

  if (want('race')) {
    evs.push({
      kind: 'race',
      uid: `${race.id}-race@race.9app.tech`,
      start: race.startDate,
      endExclusive: addDays(endOf(race), 1),
      summary: race.name,
      description: describe(race, `Ngày giải: ${fmtDate(race.startDate)}${race.endDate ? ' - ' + fmtDate(race.endDate) : ''}`),
      url,
      alarms: ALARMS.race,
    });
  }
  if (want('regOpen') && race.regOpens) {
    evs.push({
      kind: 'regOpen', uid: `${race.id}-regopen@race.9app.tech`,
      start: race.regOpens, endExclusive: addDays(race.regOpens, 1),
      summary: `Mở đăng ký: ${race.name}`,
      description: describe(race, `Mở đăng ký ngày ${fmtDate(race.regOpens)}.`),
      url, alarms: ALARMS.regOpen,
    });
  }
  if (want('regClose') && race.regCloses) {
    evs.push({
      kind: 'regClose', uid: `${race.id}-regclose@race.9app.tech`,
      start: race.regCloses, endExclusive: addDays(race.regCloses, 1),
      summary: `Hạn đăng ký: ${race.name}`,
      description: describe(race, `Hạn đăng ký ${fmtDate(race.regCloses)}.`),
      url, alarms: ALARMS.regClose,
    });
  }
  if (want('bib') && race.bibPickup && race.bibPickup.start) {
    const end = race.bibPickup.end || race.bibPickup.start;
    evs.push({
      kind: 'bib', uid: `${race.id}-bib@race.9app.tech`,
      start: race.bibPickup.start, endExclusive: addDays(end, 1),
      summary: `Nhận BIB: ${race.name}`,
      description: describe(race, `Nhận BIB ${fmtDate(race.bibPickup.start)}${end !== race.bibPickup.start ? ' - ' + fmtDate(end) : ''}.`),
      url, alarms: ALARMS.bib,
    });
  }
  return evs;
}

/** Ghép nhiều sự kiện thành nội dung .ics (CRLF). */
export function buildICS(events, opts = {}) {
  const stamp = utcStamp(opts.now || new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//9app.tech//9race//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.name || '9race')}`,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(e.endExclusive)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      `DESCRIPTION:${icsEscape(e.description)}`,
    );
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('TRANSP:TRANSPARENT');
    for (const a of e.alarms || []) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(a.text + ': ' + e.summary)}`, `TRIGGER:${a.trigger}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function icsFileName(base) {
  return `${String(base).replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').slice(0, 60)}.ics`;
}
