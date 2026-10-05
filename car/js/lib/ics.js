// Sinh tệp lịch .ics (RFC 5545) có nhắc VALARM trước 30, 7 và 1 ngày. Thuần hàm.
const enc = new TextEncoder();

export function thoat(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** Gập dòng tối đa 75 byte UTF-8 (không cắt giữa ký tự). */
export function gapDong(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = ''; let bytes = 0; let gioiHan = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > gioiHan) { out.push(cur); cur = ' '; bytes = 1; gioiHan = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
const ymd = (iso) => iso.replace(/-/g, '');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/**
 * items: [{id, tieuDe, han: 'yyyy-mm-dd', ghiChu}]; opt: {now: Date, gio: '08:00'}
 * Sự kiện đặt lúc 8:00 giờ địa phương (giờ trôi) để báo thức nhắc vào buổi sáng.
 */
export function taoICS(items, opt = {}) {
  const now = opt.now || new Date();
  const [hh, mm] = (opt.gio || '08:00').split(':');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app.tech//9car//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:9car - Nhắc hạn xe'];
  for (const it of items) {
    if (!it.han || !/^\d{4}-\d{2}-\d{2}$/.test(it.han)) continue;
    const start = `${ymd(it.han)}T${hh}${mm}00`;
    const tong = Math.min(23 * 60 + 59, Number(hh) * 60 + Number(mm) + 30);
    const end = `${ymd(it.han)}T${String(Math.floor(tong / 60)).padStart(2, '0')}${String(tong % 60).padStart(2, '0')}00`;
    L.push('BEGIN:VEVENT', `UID:9car-${String(it.id).replace(/[^\w.-]/g, '-')}-${ymd(it.han)}@9app.tech`, `DTSTAMP:${stamp(now)}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${thoat(it.tieuDe)}`);
    if (it.ghiChu) L.push(`DESCRIPTION:${thoat(it.ghiChu)}`);
    for (const [P, nhan] of [['P30D', '30 ngày'], ['P7D', '7 ngày'], ['P1D', '1 ngày']]) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${thoat(`${it.tieuDe} - còn ${nhan}`)}`, `TRIGGER:-${P}`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(gapDong).join('\r\n') + '\r\n';
}
