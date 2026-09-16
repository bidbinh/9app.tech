// Khung giờ biển cấm (OSM opening_hours / restriction:conditional).
// Chỉ hiểu tập con hay gặp ở Việt Nam — không parse đủ spec opening_hours.

const DAY = {
  su: 0, sun: 0, cn: 0,
  mo: 1, mon: 1, t2: 1,
  tu: 2, tue: 2, t3: 2,
  we: 3, wed: 3, t4: 3,
  th: 4, thu: 4, t5: 4,
  fr: 5, fri: 5, t6: 5,
  sa: 6, sat: 6, t7: 6,
};

function dayNum(token) {
  if (!token) return null;
  return DAY[String(token).toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

function toMin(h, m) {
  const hh = Number(h);
  const mm = Number(m || 0);
  if (hh === 24 && mm === 0) return 24 * 60;
  return (hh % 24) * 60 + mm;
}

function collectDays(text) {
  const days = new Set();
  const re = /(Mo|Tu|We|Th|Fr|Sa|Su|T[2-7]|CN)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su|T[2-7]|CN))?/gi;
  let m;
  let found = false;
  while ((m = re.exec(text))) {
    found = true;
    const a = dayNum(m[1]);
    const b = m[2] ? dayNum(m[2]) : a;
    if (a == null) continue;
    let i = a;
    for (let n = 0; n < 7; n++) {
      days.add(i);
      if (i === b) break;
      i = (i + 1) % 7;
    }
  }
  return found ? days : null;
}

function collectSpans(text) {
  const spans = [];
  const re = /(\d{1,2})(?:[:hgiờ\s]+(\d{2}))?\s*(?:h|giờ)?\s*(?:[-–—]|đến|toi)\s*(\d{1,2})(?:[:hgiờ\s]+(\d{2}))?\s*(?:h|giờ)?/gi;
  let m;
  while ((m = re.exec(text))) {
    const a = toMin(m[1], m[2]);
    const b = toMin(m[3], m[4]);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) spans.push([a, b]);
  }
  return spans;
}

function parseRule(part) {
  const spans = collectSpans(part);
  if (!spans.length) return null;
  return { days: collectDays(part), spans };
}

/**
 * @param {string} raw
 * @returns {null | {always:true} | {rules: Array<{days:Set<number>|null, spans:number[][]}>}}
 */
export function parseHours(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!s) return null;
  if (/24\s*\/\s*7/i.test(s)) return { always: true };
  if (/^\s*off\s*$/i.test(s)) return { rules: [] };

  const inner = [];
  const atRe = /@\s*\(([^)]+)\)/g;
  let m;
  while ((m = atRe.exec(s))) inner.push(m[1]);
  if (inner.length) s = inner.join('; ');

  const rules = [];
  for (const part of s.split(';')) {
    const rule = parseRule(part.trim());
    if (rule) rules.push(rule);
  }
  if (rules.length) return { rules };
  // Có chữ khung giờ nhưng không tách được → coi như luôn cấm, đỡ sót phạt.
  if (/@|h\b|giờ|:/.test(s)) return { always: true };
  return null;
}

export function hoursFromTags(tags) {
  const t = tags || {};
  const chunks = [];
  for (const [k, v] of Object.entries(t)) {
    if (!v) continue;
    if (k === 'opening_hours' || k.includes('conditional')) chunks.push(String(v));
  }
  for (const c of chunks) {
    const parsed = parseHours(c);
    if (parsed) return parsed;
  }
  const note = `${t.description || ''} ${t.note || ''} ${t.name || ''}`;
  if (/\d{1,2}\s*(?:h|giờ|:)/i.test(note)) return parseHours(note);
  return null;
}

function inRule(rule, dow, mins) {
  if (rule.days && !rule.days.has(dow)) return false;
  for (const [a, b] of rule.spans) {
    if (a <= b) {
      if (mins >= a && mins < b) return true;
    } else if (mins >= a || mins < b) {
      return true;
    }
  }
  return false;
}

function inHours(spec, date) {
  if (!spec || spec.always) return true;
  if (!spec.rules?.length) return false;
  const dow = date.getDay();
  const mins = date.getHours() * 60 + date.getMinutes();
  return spec.rules.some((rule) => inRule(rule, dow, mins));
}

/** true nếu đang cấm, hoặc sắp vào khung trong `soonMin` phút. */
export function hoursApplies(spec, date = new Date(), soonMin = 10) {
  if (!spec) return true;
  if (spec.always) return true;
  if (inHours(spec, date)) return true;
  if (soonMin > 0) {
    const soon = new Date(date.getTime() + soonMin * 60000);
    if (inHours(spec, soon)) return true;
  }
  return false;
}

export function hoursSpans(spec) {
  if (!spec?.rules?.length) return [];
  const out = [];
  for (const r of spec.rules) for (const s of r.spans) out.push(s);
  return out;
}

/** Nhãn HUD ngắn: "6–9h, 16–19h" */
export function hoursShort(spec) {
  const spans = hoursSpans(spec);
  if (!spans.length) return '';
  return spans.map(([a, b]) => {
    const ah = Math.floor(a / 60);
    const bh = Math.floor((b === 24 * 60 ? 24 * 60 : b) / 60);
    const am = a % 60;
    const bm = b % 60;
    const left = am ? `${ah}h${String(am).padStart(2, '0')}` : `${ah}h`;
    const right = bm ? `${bh}h${String(bm).padStart(2, '0')}` : `${bh}h`;
    return `${left}–${right}`;
  }).join(', ');
}
