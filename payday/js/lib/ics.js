// Tạo tệp lịch .ics (RFC 5545) có nhắc (VALARM). Thuần hàm.
import { tach } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');

/** Escape giá trị văn bản theo RFC 5545 mục 3.3.11. */
export function thoatChu(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Gập dòng tối đa 75 octet (UTF-8), phần nối tiếp bắt đầu bằng một dấu cách; không cắt giữa ký tự. */
export function gapDong(dong) {
  const enc = new TextEncoder();
  if (enc.encode(dong).length <= 75) return dong;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of dong) {
    const b = enc.encode(ch).length;
    if (len + b > 75) { out.push(cur); cur = ' '; len = 1; }
    cur += ch; len += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** TRIGGER cho sự kiện cả ngày (bắt đầu 00:00): nhắc lúc 9 giờ sáng, `truoc` ngày trước ngày diễn ra (0 = 9 giờ sáng hôm đó). */
export function triggerNgay(truoc) {
  const d = Math.max(0, Math.floor(truoc || 0));
  return d === 0 ? 'PT9H' : `-P${d - 1}DT15H`;
}

function dauGio(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * @param {{id:string, ten:string, ngay:string, lap?:'thang'|'khong', cuoiThang?:boolean, nhacTruoc?:number[]|number, moTa?:string}[]} su
 * ngay: lần đầu 'YYYY-MM-DD'. lap = 'thang': lặp hằng tháng (cuoiThang hoặc ngày 29-31: ngày cuối mỗi tháng).
 */
export function taoICS(su, { tenLich = '9payday', now = new Date() } = {}) {
  const L = [];
  const them = (s) => L.push(gapDong(s));
  them('BEGIN:VCALENDAR');
  them('VERSION:2.0');
  them('PRODID:-//9app.tech//9payday//VI');
  them('CALSCALE:GREGORIAN');
  them('METHOD:PUBLISH');
  them(`X-WR-CALNAME:${thoatChu(tenLich)}`);
  them('X-WR-TIMEZONE:Asia/Ho_Chi_Minh');
  const stamp = dauGio(now);
  for (const e of su) {
    const t = tach(e.ngay);
    if (!t) continue;
    const mai = new Date(Date.UTC(t.y, t.m - 1, t.d + 1));
    them('BEGIN:VEVENT');
    them(`UID:${String(e.id).replace(/[^A-Za-z0-9-]/g, '')}@payday.9app.tech`);
    them(`DTSTAMP:${stamp}`);
    them(`DTSTART;VALUE=DATE:${e.ngay.replace(/-/g, '')}`);
    them(`DTEND;VALUE=DATE:${mai.getUTCFullYear()}${pad(mai.getUTCMonth() + 1)}${pad(mai.getUTCDate())}`);
    them(`SUMMARY:${thoatChu(e.ten)}`);
    if (e.moTa) them(`DESCRIPTION:${thoatChu(e.moTa)}`);
    if (e.lap === 'thang') them(e.cuoiThang || t.d >= 29 ? 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1' : 'RRULE:FREQ=MONTHLY');
    them('TRANSP:TRANSPARENT');
    const nhac = Array.isArray(e.nhacTruoc) ? e.nhacTruoc : [e.nhacTruoc ?? 1];
    for (const n of [...new Set(nhac)].filter((x) => Number.isFinite(x) && x >= 0)) {
      them('BEGIN:VALARM');
      them('ACTION:DISPLAY');
      them(`DESCRIPTION:${thoatChu(n === 0 ? e.ten : `${e.ten} (còn ${n} ngày)`)}`);
      them(`TRIGGER:${triggerNgay(n)}`);
      them('END:VALARM');
    }
    them('END:VEVENT');
  }
  them('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
