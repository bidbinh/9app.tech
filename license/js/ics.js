// Tạo file lịch .ics (RFC 5545): nhắc ôn hằng ngày đến ngày thi, ngày thi, nhắc đổi bằng.
// Giờ dùng dạng "giờ địa phương trôi" (không TZID) để mở ở lịch nào cũng đúng giờ của người dùng.

const CRLF = '\r\n';

export function escText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Gập dòng tối đa 75 byte UTF-8, dòng tiếp bắt đầu bằng một khoảng trắng.
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = ch;
      bytes = b;
      limit = 74;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const utcStamp = (d) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return x;
}

function event(lines) {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
}

function alarm(trigger, desc) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(desc)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

/**
 * @param {object} o
 * @param {string} o.examDate  YYYY-MM-DD hoặc rỗng
 * @param {string} o.hang      hạng đang ôn
 * @param {string} o.time      HH:MM giờ nhắc ôn hằng ngày
 * @param {Date}   o.now
 * @param {string} [o.gplxExpiry] YYYY-MM-DD ngày hết hạn GPLX hiện có
 */
export function buildICS({ examDate, hang, time = '20:00', now = new Date(), gplxExpiry = '', minutes = 20, critCount = null }) {
  const stamp = utcStamp(now);
  // UID cố định theo hạng (không phụ thuộc ngày tạo file) + SEQUENCE tăng dần: tải lại file thì lịch cập nhật chứ không nhân đôi.
  const seq = Math.floor(now.getTime() / 60000);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app.tech//9license//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:9license - Ôn thi GPLX'];
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  const hh = tm ? Math.min(23, +tm[1]) : 20;
  const mm = tm ? Math.min(59, +tm[2]) : 0;
  const clock = `${p2(hh)}${p2(mm)}00`;
  const endMin = hh * 60 + mm + minutes;
  const endClock = `${p2(Math.floor((endMin / 60) % 24))}${p2(endMin % 60)}00`;
  const exam = parseDate(examDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = addDays(today, 1);

  if (!exam || exam > start) {
    const last = exam ? addDays(exam, -1) : null;
    const ev = [
      `UID:ontap-${hang}@license.9app.tech`,
      `SEQUENCE:${seq}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${ymd(start)}T${clock}`,
      `DTEND:${ymd(start)}T${endClock}`,
      last ? `RRULE:FREQ=DAILY;UNTIL=${ymd(last)}T235959` : 'RRULE:FREQ=DAILY;COUNT=90',
      `SUMMARY:${escText(`Ôn thi GPLX hạng ${hang} (${minutes} phút)`)}`,
      `DESCRIPTION:${escText('Mở 9license: làm câu đến hạn ôn, câu sai và 1 bài thi thử ngắn. Học đều mỗi ngày dễ nhớ hơn học dồn.')}`,
      ...alarm('-PT10M', 'Đến giờ ôn thi GPLX'),
    ];
    L.push(...event(ev));
  }
  if (exam) {
    L.push(...event([
      `UID:ngaythi-${hang}@license.9app.tech`,
      `SEQUENCE:${seq}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(exam)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(exam, 1))}`,
      `SUMMARY:${escText(`Ngày thi sát hạch GPLX hạng ${hang}`)}`,
      `DESCRIPTION:${escText('Mang căn cước/hộ chiếu và giấy tờ theo thông báo của nơi thi. Đối chiếu lịch thi với cơ sở đào tạo.')}`,
      ...alarm('-P1D', 'Ngày mai thi sát hạch GPLX'),
    ]));
    const eve = addDays(exam, -1);
    if (eve > today) {
      L.push(...event([
        `UID:truocthi-${hang}@license.9app.tech`,
        `SEQUENCE:${seq}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${ymd(eve)}T200000`,
        `DTEND:${ymd(eve)}T203000`,
        `SUMMARY:${escText(critCount ? `Ôn nhanh ${critCount} câu điểm liệt trước ngày thi` : 'Ôn nhanh các câu điểm liệt trước ngày thi')}`,
        ...alarm('-PT10M', 'Ôn nhanh câu điểm liệt'),
      ]));
    }
  }
  const exp = parseDate(gplxExpiry);
  if (exp) {
    const warn = addDays(exp, -90);
    if (warn >= today) {
      L.push(...event([
        `UID:hethan90@license.9app.tech`,
        `SEQUENCE:${seq}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(warn)}`,
        `DTEND;VALUE=DATE:${ymd(addDays(warn, 1))}`,
        `SUMMARY:${escText('Còn khoảng 90 ngày GPLX hết hạn: chuẩn bị đổi giấy phép')}`,
        `DESCRIPTION:${escText('Kiểm tra hạn trên giấy phép lái xe và thủ tục đổi, cấp lại theo hướng dẫn chính thức.')}`,
        ...alarm('-PT0M', 'GPLX sắp hết hạn'),
      ]));
    }
    if (exp >= today) {
      L.push(...event([
        `UID:hethan@license.9app.tech`,
        `SEQUENCE:${seq}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(exp)}`,
        `DTEND;VALUE=DATE:${ymd(addDays(exp, 1))}`,
        `SUMMARY:${escText('Hôm nay GPLX hết hạn')}`,
        ...alarm('-P7D', 'Một tuần nữa GPLX hết hạn'),
      ]));
    }
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join(CRLF) + CRLF;
}
