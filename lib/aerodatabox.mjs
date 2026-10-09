// Lịch sân bay AeroDataBox (RapidAPI, gói Basic).
// Khóa chỉ đọc từ môi trường. Không gọi mạng khi thiếu khóa.
// Cửa sổ FIDS tối đa 12 giờ trên Basic: offset -120 phút + duration 720 phút.

const HOST = 'aerodatabox.p.rapidapi.com';
export const SCHEDULE_AIRPORTS = ['SGN', 'HAN', 'DAD', 'CXR', 'PQC'];
const ALLOWED = new Set(SCHEDULE_AIRPORTS);

export function aeroDataBoxKey() {
  return (process.env.AERODATABOX_API_KEY || process.env.RAPIDAPI_KEY || '').trim();
}

function localHHMM(value) {
  const local = value && value.local;
  if (typeof local !== 'string') return '';
  const match = local.match(/T(\d{2}):(\d{2})/) || local.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function isLive(movement) {
  return Array.isArray(movement?.quality) && movement.quality.includes('Live');
}

function mapLiveStatus(status) {
  switch (status) {
    case 'Delayed':
      return 'delayed';
    case 'Boarding':
    case 'CheckIn':
      return 'boarding';
    case 'Departed':
    case 'EnRoute':
    case 'GateClosed':
      return 'departed';
    case 'Approaching':
      return 'arriving';
    case 'Arrived':
      return 'landed';
    case 'Canceled':
    case 'Diverted':
    case 'CanceledUncertain':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

export function mapFlight(raw, direction, airport) {
  const movement = raw?.movement || (direction === 'departure' ? raw?.departure : raw?.arrival);
  if (!movement || !raw?.number) return null;
  const opposite = movement.airport?.iata || movement.airport?.icao || '';
  const scheduled = localHHMM(movement.scheduledTime);
  if (!scheduled) return null;
  const live = isLive(movement);
  const origin = direction === 'departure' ? airport : opposite;
  const destination = direction === 'departure' ? opposite : airport;
  const revised = localHHMM(movement.revisedTime);
  return {
    id: `adb|${direction}|${airport}|${raw.number}|${origin}|${destination}|${scheduled}`,
    direction,
    airport,
    airline: raw.airline?.iata || raw.airline?.icao || '',
    airlineName: raw.airline?.name || raw.airline?.iata || 'Hãng bay',
    flightNumber: String(raw.number),
    origin,
    destination,
    scheduledTime: scheduled,
    estimatedTime: live && revised ? revised : '—',
    status: live ? mapLiveStatus(raw.status) : 'scheduled',
    gate: movement.gate || undefined,
    belt: direction === 'arrival' ? movement.baggageBelt || undefined : undefined,
  };
}

export function mapFids(payload, airport) {
  const list = (rows, direction) =>
    (Array.isArray(rows) ? rows : [])
      .map((row) => mapFlight(row, direction, airport))
      .filter(Boolean)
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  return {
    source: 'aerodatabox',
    attribution: 'AeroDataBox',
    airport,
    arrivals: list(payload?.arrivals, 'arrival'),
    departures: list(payload?.departures, 'departure'),
  };
}

export async function fetchAirportFids(iata) {
  const key = aeroDataBoxKey();
  if (!key) {
    const error = new Error('missing_key');
    error.code = 'missing_key';
    throw error;
  }
  const code = String(iata || '').trim().toUpperCase();
  if (!ALLOWED.has(code)) {
    const error = new Error('unsupported_airport');
    error.code = 'unsupported_airport';
    throw error;
  }
  const url = new URL(`https://${HOST}/flights/airports/iata/${code}`);
  url.searchParams.set('offsetMinutes', '-120');
  url.searchParams.set('durationMinutes', '720');
  url.searchParams.set('withLocation', 'false');
  url.searchParams.set('withCodeshared', 'false');
  url.searchParams.set('withCargo', 'false');
  url.searchParams.set('withPrivate', 'false');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': HOST,
    },
  });
  if (response.status === 204) return mapFids({ arrivals: [], departures: [] }, code);
  if (!response.ok) {
    const error = new Error(`aerodatabox_${response.status}`);
    error.code = 'upstream';
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  return mapFids(payload, code);
}
