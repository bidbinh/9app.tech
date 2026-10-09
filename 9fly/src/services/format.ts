const TZ = 'Asia/Ho_Chi_Minh';

export function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function ictDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (!offsetDays) return today;
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return utc.toISOString().slice(0, 10);
}

export function ictNowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  let h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  if (h === 24) h = 0;
  return h * 60 + m;
}

export function ictClock(): string {
  const mins = ictNowMinutes();
  return minutesLabel(mins);
}

export function minutesLabel(mins: number): string {
  const mod = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(mod / 60);
  const m = mod % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function addClock(hhmm: string, deltaMin: number): { time: string; plus: number } {
  const total = parseHHMM(hhmm) + deltaMin;
  const plus = Math.floor(total / (24 * 60));
  return { time: minutesLabel(total), plus };
}

export function vnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}g ${m}p`;
  if (h) return `${h} giờ`;
  return `${m} phút`;
}

export function viDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export function gateFor(fn: string, international: boolean): string {
  const n = (hash(fn) % (international ? 8 : 22)) + 1;
  return international ? `E${n}` : String(n);
}

export function beltFor(fn: string): string {
  return String((hash(`${fn}:belt`) % 8) + 1);
}

export function roundVnd(n: number): number {
  return Math.round(n / 1000) * 1000;
}
