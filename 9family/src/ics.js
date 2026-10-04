// Xuất lịch iCalendar (RFC 5545). Giờ ghi theo UTC (không cần VTIMEZONE), xuống dòng CRLF, gập dòng 75 octet.
import { atMs, addDays } from './vn.js';

export function escapeText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

// Gập dòng theo octet UTF-8, không cắt giữa ký tự
export function fold(line) {
  const out = [];
  let cur = ''; let bytes = 0; let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (bytes + n > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const p2 = (n) => String(n).padStart(2, '0');
export function utcStamp(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}
const dateOnly = (day) => day.replace(/-/g, '');

// items: [{ uid, day, allDay, start, end, title, location, description }]
export function buildIcs({ name, items, nowMs }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app//9family//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`, 'X-WR-TIMEZONE:Asia/Ho_Chi_Minh', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${it.uid}@9family`, `DTSTAMP:${utcStamp(nowMs)}`);
    if (it.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(it.day)}`, `DTEND;VALUE=DATE:${dateOnly(addDays(it.day, 1))}`);
    } else {
      const s = atMs(it.day, it.start);
      lines.push(`DTSTART:${utcStamp(s)}`);
      if (it.end) lines.push(`DTEND:${utcStamp(atMs(it.day, it.end))}`);
    }
    lines.push(`SUMMARY:${escapeText(it.title)}`);
    if (it.location) lines.push(`LOCATION:${escapeText(it.location)}`);
    if (it.description) lines.push(`DESCRIPTION:${escapeText(it.description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
