// Mở rộng sự kiện lặp thành các lần diễn ra trong một khoảng ngày. Không lưu từng lần.
// Ngày là chuỗi 'YYYY-MM-DD' theo giờ Việt Nam; giờ là 'HH:MM' giờ địa phương.
import { solarToLunar } from './lunar.js';
import { addDays, weekdayISO, isLeapYear, atMs, ALLDAY_ANCHOR } from './vn.js';

export function makeLunarCache() {
  const m = new Map();
  return (day) => { let v = m.get(day); if (!v) { v = solarToLunar(day); m.set(day, v); } return v; };
}

// Ngày âm lịch d tháng m có rơi vào `day` không (ngày 30 của tháng thiếu thì tính vào ngày 29)
function lunarHit(ev, day, lunar, { anyMonth, allowLeap }) {
  const l = lunar(day);
  if (!anyMonth && (l.month !== ev.lunar_month || l.leap)) return false;
  if (anyMonth && !allowLeap && l.leap) return false;
  if (l.day === ev.lunar_day) return true;
  return ev.lunar_day === 30 && l.day === 29 && lunar(addDays(day, 1)).day === 1;
}

export function matchesDay(ev, day, lunar) {
  if (day < ev.start_date) return false;
  if (ev.until_date && day > ev.until_date) return false;
  switch (ev.rec_type) {
    case 'none': return day === ev.start_date;
    case 'daily': return true;
    case 'weekly': return ev.rec_days.includes(weekdayISO(day));
    case 'yearly': {
      const [, sm, sd] = ev.start_date.split('-').map(Number);
      const [y, m, d] = day.split('-').map(Number);
      if (sm === 2 && sd === 29 && !isLeapYear(y)) return m === 2 && d === 28; // 29/02: năm thường tính 28/02
      return m === sm && d === sd;
    }
    case 'yearly_lunar': return lunarHit(ev, day, lunar, { anyMonth: false });
    case 'monthly_lunar': return lunarHit(ev, day, lunar, { anyMonth: true, allowLeap: true });
    default: return false;
  }
}

// exceptions: Map ngày -> { action: 'skip'|'edit', title, location, note, start_time, end_time }
export function expand(ev, from, to, exceptions = new Map(), lunar = makeLunarCache()) {
  const out = [];
  let a = from > ev.start_date ? from : ev.start_date;
  let b = ev.until_date && ev.until_date < to ? ev.until_date : to;
  if (ev.rec_type === 'none') { if (ev.start_date >= from && ev.start_date <= to) { a = b = ev.start_date; } else return out; }
  for (let day = a; day <= b; day = addDays(day, 1)) {
    if (!matchesDay(ev, day, lunar)) continue;
    const ex = exceptions.get(day);
    if (ex && ex.action === 'skip') continue;
    const o = {
      eventId: ev.id, day, kind: ev.kind, allDay: ev.all_day,
      title: ev.title, location: ev.location, note: ev.note,
      start: ev.all_day ? null : ev.start_time, end: ev.all_day ? null : ev.end_time,
      edited: false,
    };
    if (ex && ex.action === 'edit') {
      o.edited = true;
      if (ex.title != null) o.title = ex.title;
      if (ex.location != null) o.location = ex.location;
      if (ex.note != null) o.note = ex.note;
      if (!ev.all_day) { if (ex.start_time != null) o.start = ex.start_time; if (ex.end_time != null) o.end = ex.end_time; else if (ex.start_time != null && o.end && o.end <= o.start) o.end = null; }
    }
    out.push(o);
  }
  return out;
}

export const occStartMs = (o) => atMs(o.day, o.allDay ? ALLDAY_ANCHOR : (o.start || ALLDAY_ANCHOR));
