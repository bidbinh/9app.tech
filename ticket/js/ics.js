import { parseIso, fmtDate } from './time.js';
import { MODE_LABEL } from './model.js';
import { placeWord } from './airport.js';

export function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (len + b > 75) { out.push(cur); cur = ' ' + ch; len = 1 + b; }
    else { cur += ch; len += b; }
  }
  out.push(cur);
  return out.join('\r\n');
}

const p2 = (n) => String(n).padStart(2, '0');
export function utcStamp(d) {
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}

export function buildICS(trip, { now = new Date(), alarmMin = 120 } = {}) {
  const start = parseIso(trip.departAt).ms;
  const end = trip.arriveAt ? parseIso(trip.arriveAt).ms : start + 3600000;
  const label = trip.code || MODE_LABEL[trip.mode];
  const desc = [
    trip.operator && `Hãng/nhà xe: ${trip.operator}`,
    trip.pnr && `Mã đặt chỗ: ${trip.pnr}`,
    trip.passengers.length && 'Hành khách: ' + trip.passengers.map((p) => p.name + (p.seat ? ` (ghế ${p.seat})` : '')).join('; '),
    trip.note,
  ].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app.tech//9ticket//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${trip.id}@ticket.9app.tech`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(new Date(start))}`,
    `DTEND:${utcStamp(new Date(end))}`,
    `SUMMARY:${icsEscape(`${label} ${trip.from.name} → ${trip.to.name}`)}`,
    `LOCATION:${icsEscape(trip.from.name)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Nên ra ${placeWord(trip.mode)} ngay`)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function icsFileName(trip) {
  const day = fmtDate(trip.departAt).split('/').reverse().join('');
  const tag = (trip.code || trip.mode).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `9ticket-${tag}-${day}.ics`;
}
