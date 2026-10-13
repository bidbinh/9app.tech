// Giờ kèm múi giờ: lưu ISO có offset, hiển thị đúng giờ địa phương của offset đó.
const RE = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function parseIso(iso) {
  const m = RE.exec(typeof iso === 'string' ? iso : '');
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  let off = 0;
  if (z !== 'Z') {
    const hh = +z.slice(1, 3), mm = +z.slice(4, 6);
    if (hh > 14 || mm > 59) return null;
    off = (z[0] === '-' ? -1 : 1) * (hh * 60 + mm);
  }
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  const dt = new Date(wall);
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d ||
      dt.getUTCHours() !== +h || dt.getUTCMinutes() !== +mi || +(s || 0) > 59) return null;
  return { ms: wall - off * 60000, offsetMin: off };
}

export function offsetString(min) {
  const a = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function toIso(ms, offsetMin) {
  const w = new Date(ms + offsetMin * 60000);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:00${offsetString(offsetMin)}`;
}

export function shiftIso(iso, deltaMin) {
  const p = parseIso(iso);
  return p ? toIso(p.ms + deltaMin * 60000, p.offsetMin) : null;
}

function wallOf(iso) {
  const p = parseIso(iso);
  return p ? new Date(p.ms + p.offsetMin * 60000) : null;
}
export function fmtDate(iso) {
  const w = wallOf(iso);
  return w ? `${pad(w.getUTCDate())}/${pad(w.getUTCMonth() + 1)}/${w.getUTCFullYear()}` : '';
}
export function fmtTime(iso) {
  const w = wallOf(iso);
  return w ? `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}` : '';
}
export function fmtDayLabel(iso) {
  const w = wallOf(iso);
  return w ? DAYS[w.getUTCDay()] : '';
}

// Ghép ngày/giờ từ form. tz: múi giờ của điểm đã khớp (hoặc null). prevIso: giờ cũ của chuyến, để giữ offset khi điểm không khớp.
export function offsetFor(tz, prevIso) {
  if (tz) return tz;
  const p = parseIso(prevIso);
  return p ? offsetString(p.offsetMin) : '+07:00';
}

export function formIso(date, time, tz, prevIso) {
  return date && time ? `${date}T${time}:00${offsetFor(tz, prevIso)}` : '';
}

// Giờ đến: thiếu ngày đến thì lấy ngày đi (giờ địa phương của nơi đi), sớm hơn giờ đi thì sang hôm sau.
export function formArrivalIso(depIso, arrDate, arrTime, tz, prevIso) {
  if (!arrTime) return '';
  if (arrDate) return formIso(arrDate, arrTime, tz, prevIso);
  const dep = parseIso(depIso);
  if (!dep) return '';
  const date = fmtDate(depIso).split('/').reverse().join('-');
  const iso = `${date}T${arrTime}:00${offsetFor(tz, prevIso)}`;
  const p = parseIso(iso);
  if (!p) return '';
  return p.ms < dep.ms ? shiftIso(iso, 1440) : iso;
}
