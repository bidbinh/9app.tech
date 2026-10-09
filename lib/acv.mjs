// Nguồn thử nghiệm: POST https://acv.vn/api/proxy (trang acv.vn).
// Endpoint không được ACV công bố tài liệu hay cấp phép dùng cho sản phẩm.
// Module này không chuyển tiếp URL tùy ý — chỉ gọi đúng một đường dẫn cố định.

export const ACV_AIRPORTS = ['SGN', 'HAN', 'DAD', 'CXR', 'PQC'];

const ALLOWED = new Set(ACV_AIRPORTS);
const ACV_URL = 'https://acv.vn/api/proxy';
const SEARCH_PATH = '/api/flights/search';
const PAGE_SIZE = 20;
const MAX_PAGES = 2;
const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;

const AIRLINES = {
  VN: 'Vietnam Airlines',
  VJ: 'Vietjet',
  QH: 'Bamboo Airways',
  VU: 'Vietravel Airlines',
  BL: 'Pacific Airlines',
  KE: 'Korean Air',
  SQ: 'Singapore Airlines',
  TG: 'Thai Airways',
  NH: 'ANA',
  CX: 'Cathay Pacific',
};

const cache = new Map();
const inflight = new Map();

export function ictDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const date = `${pick('year')}-${pick('month')}-${pick('day')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('bad_date');
    error.code = 'acv_unavailable';
    throw error;
  }
  return date;
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!text || text === '-' || text === '—') return '';
  return text.slice(0, max);
}

function clock(value) {
  const text = clean(value, 8);
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  return match ? `${match[1]}:${match[2]}` : '';
}

function flightNo(value) {
  const text = clean(value, 16).toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9]{2,12}$/.test(text) ? text : '';
}

function counterpartCity(route, direction) {
  const parts = route.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return direction === 'departure' ? parts[parts.length - 1] : parts[0];
  return route;
}

export function normalizeAcvFlight(row, direction, airport, date) {
  if (!row || typeof row !== 'object') return null;
  const number = flightNo(row.soHieuChuyenBay);
  const departPublished = clock(row.gioKhoiHanh);
  const arrivePublished = clock(row.gioHaCanh);
  if (!number || (!departPublished && !arrivePublished)) return null;
  const routeText = clean(row.route, 120);
  const other = routeText ? counterpartCity(routeText, direction) : '';
  const airline = clean(row.hangBay, 8).toUpperCase();
  const gate = clean(row.gate, 16);
  const belt = direction === 'arrival' ? clean(row.belt, 16) : '';
  const terminal = clean(row.nhaGa, 16)
    || (direction === 'departure' ? clean(row.nhaGaDi, 16) : clean(row.nhaGaDen, 16));
  const statusText = clean(row.trangThai, 40);
  const scheduledTime = direction === 'departure'
    ? (departPublished || arrivePublished)
    : (arrivePublished || departPublished);
  return {
    id: `acv|${direction}|${airport}|${number}|${date}`,
    direction,
    airport,
    airline,
    airlineName: AIRLINES[airline] || airline || 'Hãng bay',
    flightNumber: number,
    origin: direction === 'departure' ? airport : (other || '—'),
    destination: direction === 'departure' ? (other || '—') : airport,
    routeText: routeText || undefined,
    scheduledTime,
    departPublished,
    arrivePublished,
    estimatedTime: '—',
    status: 'scheduled',
    statusText: statusText || '—',
    gate: gate || undefined,
    belt: belt || undefined,
    terminal: terminal || undefined,
  };
}

function unavailable(message) {
  const error = new Error(message);
  error.code = 'acv_unavailable';
  return error;
}

async function searchPage(airport, direction, date, pageIndex) {
  const inner = {
    flightDate: date,
    pageIndex,
    pageSize: PAGE_SIZE,
    langCode: 'vi',
    terminal: '',
    flightNo: '',
    type: direction,
  };
  if (direction === 'departure') inner.departureStation = airport;
  else inner.arrivalStation = airport;

  let response;
  try {
    response = await fetch(ACV_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'vi',
        'User-Agent': '9fly-demo/0.1 (experimental; non-production)',
      },
      body: JSON.stringify({
        url: SEARCH_PATH,
        method: 'POST',
        body: inner,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw unavailable('acv_timeout');
  }
  if (!response.ok) throw unavailable(`acv_http_${response.status}`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw unavailable('acv_json');
  }
  if (payload?.success !== true || (payload.statusCode != null && payload.statusCode !== 200)) {
    throw unavailable('acv_rejected');
  }
  if (!Array.isArray(payload.data)) throw unavailable('acv_shape');
  return payload.data.slice(0, PAGE_SIZE);
}

async function loadDirection(airport, direction, date) {
  const raw = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let batch;
    try {
      batch = await searchPage(airport, direction, date, page);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }
    raw.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  const seen = new Set();
  const flights = [];
  for (const row of raw) {
    const flight = normalizeAcvFlight(row, direction, airport, date);
    if (!flight || seen.has(flight.id)) continue;
    seen.add(flight.id);
    flights.push(flight);
  }
  // Keep ACV page order so the current flight stays above after-midnight rows.
  return flights;
}

async function loadBoard(airport, date, now) {
  const [arrivals, departures] = await Promise.all([
    loadDirection(airport, 'arrival', date),
    loadDirection(airport, 'departure', date),
  ]);
  return {
    source: 'acv',
    experimental: true,
    airport,
    flightDate: date,
    observedAt: now.toISOString(),
    arrivals,
    departures,
  };
}

export async function fetchAcvBoard(iata, now = new Date()) {
  const code = String(iata || '').trim().toUpperCase();
  if (!ALLOWED.has(code)) throw Object.assign(new Error('unsupported_airport'), { code: 'unsupported_airport' });
  const date = ictDate(now);
  const key = `${code}|${date}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_MS) {
    if (hit.error) throw hit.error;
    return hit.value;
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = loadBoard(code, date, now).then(
    (value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    },
    (error) => {
      cache.set(key, { at: Date.now(), error });
      throw error;
    },
  );
  inflight.set(key, job);
  job.finally(() => {
    if (inflight.get(key) === job) inflight.delete(key);
  });
  return job;
}
