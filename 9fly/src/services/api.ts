/**
 * Lớp dữ liệu mỏng của 9fly.
 * Màn hình chỉ gọi flightApi. Khi có API thật, thay phần thân các hàm này
 * (bảng chuyến, tìm vé, đặt chỗ, làm thủ tục) mà không đổi giao diện.
 */
import { AIRPORTS } from '../data/catalog';
import type { BookInput, SearchQuery } from '../types';
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

export const flightApi = {
  airports: async () => AIRPORTS,
  board: async (code: string) => buildBoard(code),
  search: async (query: SearchQuery) => searchOffers(query),
  book: async (input: BookInput) => createBooking(input),
  bookings: async () => listBookings(),
  lookup: async (pnr: string, name: string) => lookupBooking(pnr, name),
  checkIn: async (pnr: string, passengerId: string, seat: string) => checkIn(pnr, passengerId, seat),
  pins: async () => listPins(),
  togglePin: async (id: string) => togglePin(id),
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
