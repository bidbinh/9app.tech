import {
  AIRLINES,
  CANCELLED,
  DELAY_MIN,
  LEGS,
  cityOf,
  durationMin,
  isVietnam,
} from '../data/catalog';
import type { BoardFlight, FlightStatus, Leg } from '../types';
import { addClock, beltFor, gateFor, ictNowMinutes, parseHHMM } from './format';

function present(leg: Leg, direction: 'arrival' | 'departure', airport: string, nowMin: number): BoardFlight {
  const international = !isVietnam(leg.from) || !isVietnam(leg.to);
  const delay = DELAY_MIN[leg.fn] ?? 0;
  const cancelled = CANCELLED.has(leg.fn);
  const dur = durationMin(leg.from, leg.to);
  const arr = addClock(leg.dep, dur);
  const scheduledTime = direction === 'departure' ? leg.dep : arr.time;
  const estimated = cancelled ? '—' : addClock(scheduledTime, delay).time;
  const status = flightStatus(direction, parseHHMM(scheduledTime), nowMin, delay, cancelled);
  const gate = gateFor(leg.fn, international);
  const belt = beltFor(leg.fn);
  const showGate = direction === 'departure' || international;
  const showBelt = direction === 'arrival';
  return {
    id: `${direction}|${airport}|${leg.fn}|${leg.from}|${leg.to}|${leg.dep}`,
    direction,
    airport,
    airline: leg.al,
    airlineName: AIRLINES[leg.al] ?? leg.al,
    flightNumber: leg.fn,
    origin: leg.from,
    destination: leg.to,
    scheduledTime,
    estimatedTime: estimated,
    status,
    gate: showGate && status !== 'cancelled' ? gate : undefined,
    belt: showBelt && status !== 'cancelled' ? belt : undefined,
  };
}

function flightStatus(
  direction: 'arrival' | 'departure',
  scheduledMin: number,
  nowMin: number,
  delay: number,
  cancelled: boolean,
): FlightStatus {
  if (cancelled) return 'cancelled';
  const diff = scheduledMin + delay - nowMin;
  if (direction === 'departure') {
    if (diff > 40) return delay > 0 ? 'delayed' : 'ontime';
    if (diff > 5) return 'boarding';
    if (diff > -15) return delay > 0 ? 'delayed' : 'ontime';
    return 'departed';
  }
  if (diff > 25) return delay > 0 ? 'delayed' : 'ontime';
  if (diff > -12) return 'arriving';
  return 'landed';
}

export function buildBoard(airport: string, nowMin = ictNowMinutes()): { arrivals: BoardFlight[]; departures: BoardFlight[] } {
  const arrivals: BoardFlight[] = [];
  const departures: BoardFlight[] = [];
  for (const leg of LEGS) {
    if (leg.to === airport) arrivals.push(present(leg, 'arrival', airport, nowMin));
    if (leg.from === airport) departures.push(present(leg, 'departure', airport, nowMin));
  }
  const byTime = (a: BoardFlight, b: BoardFlight) => parseHHMM(a.scheduledTime) - parseHHMM(b.scheduledTime);
  arrivals.sort(byTime);
  departures.sort(byTime);
  return { arrivals, departures };
}

export function flightFromId(id: string, nowMin = ictNowMinutes()): BoardFlight | null {
  const [direction, airport, fn, from, to, dep] = id.split('|');
  if (direction !== 'arrival' && direction !== 'departure') return null;
  const leg = LEGS.find((item) => item.fn === fn && item.from === from && item.to === to && item.dep === dep);
  if (!leg || !airport) return null;
  return present(leg, direction, airport, nowMin);
}

export function routeLabel(flight: BoardFlight): string {
  if (flight.direction === 'departure') return `Đi ${cityOf(flight.destination)}`;
  return `Từ ${cityOf(flight.origin)}`;
}

export const STATUS_LABEL: Record<BoardFlight['status'], string> = {
  ontime: 'Đúng giờ',
  delayed: 'Chậm',
  boarding: 'Lên máy bay',
  departed: 'Đã cất cánh',
  arriving: 'Sắp đến',
  landed: 'Đã hạ cánh',
  cancelled: 'Hủy',
};
