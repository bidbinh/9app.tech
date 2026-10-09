import type { BoardFlight, BoardingPass, BookInput, Booking, LookupHit, Passenger } from '../types';
import { flightFromId } from './board';
import { addClock, foldName, gateFor, ictDate, ictNowMinutes } from './format';
import { isVietnam } from '../data/catalog';

const PIN_KEY = '9fly.pins';
const BOOK_KEY = '9fly.bookings';

type PinRecord = { id: string; flight?: BoardFlight };

const memory: { pins?: PinRecord[]; bookings?: Booking[] } = {};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Giữ trong bộ nhớ phiên nếu trình duyệt chặn lưu. */
  }
}

function demoBooking(): Booking {
  const date = ictDate(1);
  return {
    pnr: '9FDEMO',
    offer: {
      id: `demo|${date}`,
      airline: 'VN',
      airlineName: 'Vietnam Airlines',
      flightNumber: 'VN210',
      from: 'SGN',
      to: 'HAN',
      date,
      departTime: '06:15',
      arriveTime: '08:20',
      arrivePlus: 0,
      durationMin: 125,
      stops: 0,
      priceVnd: 1480000,
      cabin: 'Phổ thông',
    },
    passengers: [
      { id: 'p1', fullName: 'Bình Trần', dob: '1990-01-15', docId: '079090001234' },
    ],
    contactEmail: 'binh.tran@9app.tech',
    contactPhone: '0901234567',
    totalVnd: 1480000,
    paidAt: new Date().toISOString(),
    status: 'confirmed',
    seats: {},
  };
}

function loadPinRecords(): PinRecord[] {
  if (!memory.pins) memory.pins = normalizePins(readJson<unknown>(PIN_KEY, []));
  return memory.pins;
}

function normalizePins(raw: unknown): PinRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: PinRecord[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item) out.push({ id: item });
    else if (item && typeof item === 'object' && typeof (item as PinRecord).id === 'string') {
      const record = item as PinRecord;
      out.push({ id: record.id, flight: record.flight });
    }
  }
  return out;
}

export function listPins(): string[] {
  return loadPinRecords().map((item) => item.id);
}

export function togglePin(id: string, flight?: BoardFlight): string[] {
  const current = loadPinRecords();
  const next = current.some((item) => item.id === id)
    ? current.filter((item) => item.id !== id)
    : [{ id, flight }, ...current];
  memory.pins = next;
  writeJson(PIN_KEY, next);
  return next.map((item) => item.id);
}

export function pinnedFlights() {
  const now = ictNowMinutes();
  return loadPinRecords()
    .map((item) => flightFromId(item.id, now) ?? item.flight ?? null)
    .filter((flight): flight is BoardFlight => flight !== null);
}

function readStoredBookings(): Booking[] {
  if (!memory.bookings) memory.bookings = readJson<Booking[]>(BOOK_KEY, []);
  return memory.bookings;
}

export function listBookings(): Booking[] {
  const stored = readStoredBookings();
  const savedDemo = stored.find((item) => item.pnr === '9FDEMO');
  const rest = stored.filter((item) => item.pnr !== '9FDEMO');
  return [savedDemo ?? demoBooking(), ...rest];
}

function persistBookings(bookings: Booking[]): void {
  memory.bookings = bookings;
  writeJson(BOOK_KEY, bookings);
}

const PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makePnr(existing: Set<string>): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = '9F';
  for (const byte of bytes) code += PNR_ALPHABET[byte % PNR_ALPHABET.length];
  if (existing.has(code)) return makePnr(existing);
  return code;
}

export function createBooking(input: BookInput): Booking {
  const stored = readStoredBookings();
  const existing = new Set(listBookings().map((item) => item.pnr));
  const passengers: Passenger[] = input.passengers.map((pax, index) => ({
    id: `p${index + 1}`,
    fullName: pax.fullName.trim(),
    dob: pax.dob,
    docId: pax.docId.trim(),
  }));
  const booking: Booking = {
    pnr: makePnr(existing),
    offer: input.offer,
    passengers,
    contactEmail: input.contactEmail.trim(),
    contactPhone: input.contactPhone.trim(),
    totalVnd: input.offer.priceVnd * passengers.length,
    paidAt: new Date().toISOString(),
    status: 'confirmed',
    seats: {},
  };
  persistBookings([booking, ...stored.filter((item) => item.pnr !== booking.pnr)]);
  return booking;
}

export function lookupBooking(pnr: string, name: string): LookupHit | null {
  const code = pnr.trim().toUpperCase();
  const folded = foldName(name);
  if (!code || !folded) return null;
  const booking = listBookings().find((item) => item.pnr.toUpperCase() === code);
  if (!booking) return null;
  const passenger = booking.passengers.find((item) => foldName(item.fullName) === folded);
  if (!passenger) return null;
  return { booking, passenger };
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ROWS = Array.from({ length: 18 }, (_, i) => i + 8);

function rng(seed: number): number {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return next;
}

export function occupiedSeats(booking: Booking, passengerId: string): Set<string> {
  const taken = new Set<string>();
  let state = 0;
  for (let i = 0; i < booking.pnr.length; i++) state = (state + booking.pnr.charCodeAt(i) * (i + 1)) >>> 0;
  for (let i = 0; i < 36; i++) {
    state = rng(state || 1);
    const row = ROWS[state % ROWS.length];
    const letter = LETTERS[(state >>> 8) % LETTERS.length];
    taken.add(`${row}${letter}`);
  }
  for (const [id, seat] of Object.entries(booking.seats)) {
    if (id !== passengerId && seat) taken.add(seat);
    if (id === passengerId && seat) taken.delete(seat);
  }
  return taken;
}

export function seatLayout(): { rows: number[]; letters: string[] } {
  return { rows: ROWS, letters: LETTERS };
}

export function checkIn(pnr: string, passengerId: string, seat: string): BoardingPass {
  const stored = readStoredBookings();
  const all = listBookings();
  const current = all.find((item) => item.pnr.toUpperCase() === pnr.trim().toUpperCase());
  if (!current) throw new Error('Không thấy đặt chỗ.');
  const passenger = current.passengers.find((item) => item.id === passengerId);
  if (!passenger) throw new Error('Không thấy hành khách.');
  const blocked = occupiedSeats(current, passengerId);
  if (blocked.has(seat)) throw new Error('Ghế đã có người.');
  const seats = { ...current.seats, [passengerId]: seat };
  const everyone = current.passengers.every((item) => seats[item.id]);
  const next: Booking = { ...current, seats, status: everyone ? 'checked-in' : 'confirmed' };
  const without = stored.filter((item) => item.pnr !== current.pnr);
  persistBookings([next, ...without]);
  return toPass(next, passenger, seat);
}

export function toPass(booking: Booking, passenger: Passenger, seat: string): BoardingPass {
  const intl = !isVietnam(booking.offer.from) || !isVietnam(booking.offer.to);
  const boarding = addClock(booking.offer.departTime, -40).time;
  return {
    pnr: booking.pnr,
    passengerName: passenger.fullName,
    airlineName: booking.offer.airlineName,
    flightNumber: booking.offer.flightNumber,
    from: booking.offer.from,
    to: booking.offer.to,
    date: booking.offer.date,
    departTime: booking.offer.departTime,
    boardingTime: boarding,
    gate: gateFor(booking.offer.flightNumber.split('/')[0] ?? booking.offer.flightNumber, intl),
    seat,
    cabin: booking.offer.cabin,
  };
}
