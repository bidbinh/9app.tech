// Shared board resolver for the 9app hub and the hosted function.
// The browser never receives an arbitrary ACV URL. Airport, date, and page
// limits stay inside fetchAcvBoard.

import { fetchAirportFids } from './aerodatabox.mjs';
import { ACV_AIRPORTS, fetchAcvBoard } from './acv.mjs';

const ALLOWED = new Set(ACV_AIRPORTS);

export function boardProvider() {
  const value = String(process.env.NINEFLY_BOARD_PROVIDER || 'acv').trim().toLowerCase();
  if (value === 'sample' || value === 'aerodatabox' || value === 'acv') return value;
  return 'acv';
}

export async function resolveBoard(airport) {
  const code = String(airport || '').trim().toUpperCase();
  if (!ALLOWED.has(code)) {
    return { status: 400, body: { ok: false, reason: 'unsupported_airport' } };
  }
  const provider = boardProvider();
  if (provider === 'sample') {
    return { status: 200, body: { source: 'sample', fallback: false, airport: code } };
  }
  if (provider === 'aerodatabox') {
    try {
      return { status: 200, body: await fetchAirportFids(code) };
    } catch {
      return {
        status: 200,
        body: { source: 'sample', fallback: true, reason: 'aerodatabox_unavailable', airport: code },
      };
    }
  }
  try {
    return { status: 200, body: await fetchAcvBoard(code) };
  } catch {
    console.warn(`9fly board ${code}: acv_unavailable`);
    return {
      status: 200,
      body: { source: 'sample', fallback: true, reason: 'acv_unavailable', airport: code },
    };
  }
}
