/**
 * Lớp dữ liệu mỏng của 9fly.
 * Màn hình chỉ gọi flightApi. Khi có API thật, thay phần thân các hàm này
 * (bảng chuyến, tìm vé, đặt chỗ, làm thủ tục) mà không đổi giao diện.
 */
import { AIRPORTS } from '../data/catalog';
import type { BoardFlight, BoardResult, BookInput, SearchQuery } from '../types';
import { buildBoard } from './board';
import { searchOffers } from './shop';
import {
  checkIn,
  createBooking,
  listBookings,
  listPins,
  lookupBooking,
  occupiedSeats,
  pinnedFlights,
  seatLayout,
  toPass,
  togglePin,
} from './store';

const SCHEDULE_AIRPORTS = new Set(['SGN', 'HAN', 'DAD', 'CXR', 'PQC']);

function asFlights(rows: unknown): BoardFlight[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is BoardFlight => {
    if (!row || typeof row !== 'object') return false;
    const flight = row as BoardFlight;
    return (
      (flight.direction === 'arrival' || flight.direction === 'departure') &&
      typeof flight.id === 'string' &&
      typeof flight.flightNumber === 'string' &&
      typeof flight.scheduledTime === 'string'
    );
  });
}

function sampleBoard(code: string, fallback = false, reason?: string): BoardResult {
  const board = buildBoard(code);
  return {
    arrivals: board.arrivals,
    departures: board.departures,
    source: 'sample',
    fallback,
    reason,
  };
}

async function loadBoard(code: string): Promise<BoardResult> {
  if (!SCHEDULE_AIRPORTS.has(code)) return sampleBoard(code);
  try {
    const response = await fetch(`/9fly/api/board?airport=${encodeURIComponent(code)}`);
    if (!response.ok) return sampleBoard(code, true, 'board_unavailable');
    const data = (await response.json()) as {
      source?: string;
      fallback?: boolean;
      reason?: string;
      observedAt?: string;
      flightDate?: string;
      arrivals?: unknown;
      departures?: unknown;
    };
    if (data.source === 'acv') {
      return {
        arrivals: asFlights(data.arrivals),
        departures: asFlights(data.departures),
        source: 'acv',
        observedAt: typeof data.observedAt === 'string' ? data.observedAt : undefined,
        flightDate: typeof data.flightDate === 'string' ? data.flightDate : undefined,
      };
    }
    if (data.source === 'aerodatabox') {
      return {
        arrivals: asFlights(data.arrivals),
        departures: asFlights(data.departures),
        source: 'aerodatabox',
      };
    }
    return sampleBoard(code, Boolean(data.fallback), typeof data.reason === 'string' ? data.reason : undefined);
  } catch {
    return sampleBoard(code);
  }
}

export const flightApi = {
  airports: async () => AIRPORTS,
  board: async (code: string) => loadBoard(code),
  search: async (query: SearchQuery) => searchOffers(query),
  book: async (input: BookInput) => createBooking(input),
  bookings: async () => listBookings(),
  lookup: async (pnr: string, name: string) => lookupBooking(pnr, name),
  checkIn: async (pnr: string, passengerId: string, seat: string) => checkIn(pnr, passengerId, seat),
  pins: async () => listPins(),
  togglePin: async (id: string, flight?: BoardFlight) => togglePin(id, flight),
  pinned: async () => pinnedFlights(),
  seatMap: async (pnr: string, passengerId: string) => {
    const booking = listBookings().find((item) => item.pnr.toUpperCase() === pnr.trim().toUpperCase());
    if (!booking) return null;
    const layout = seatLayout();
    return {
      rows: layout.rows,
      letters: layout.letters,
      taken: [...occupiedSeats(booking, passengerId)],
      current: booking.seats[passengerId] ?? '',
    };
  },
  pass: async (pnr: string, passengerId: string) => {
    const booking = listBookings().find((item) => item.pnr.toUpperCase() === pnr.trim().toUpperCase());
    const seat = booking?.seats[passengerId];
    const passenger = booking?.passengers.find((item) => item.id === passengerId);
    if (!booking || !seat || !passenger) return null;
    return toPass(booking, passenger, seat);
  },
};
