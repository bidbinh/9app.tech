import { AIRLINES, AIRLINE_FACTOR, baseFare, cityOf, durationMin, isVietnam } from '../data/catalog';
import type { Offer, SearchQuery } from '../types';
import { addClock, hash, roundVnd } from './format';

const SLOTS = ['06:20', '08:55', '11:40', '14:15', '17:05', '19:45', '21:30'];

function carriers(from: string, to: string): string[] {
  const abroad = !isVietnam(from) || !isVietnam(to);
  if (!abroad) return ['VJ', 'VN', 'QH'];
  const ends = new Set([from, to]);
  if (ends.has('ICN')) return ['VN', 'KE', 'VJ'];
  if (ends.has('SIN')) return ['VN', 'SQ', 'VJ'];
  if (ends.has('BKK')) return ['VN', 'TG', 'VJ'];
  if (ends.has('NRT')) return ['VN', 'NH', 'QH'];
  if (ends.has('HKG')) return ['VN', 'CX', 'VJ'];
  return ['VN', 'VJ', 'QH'];
}

function viaAirport(from: string, to: string): string | null {
  const candidates = ['SGN', 'HAN', 'DAD'];
  for (const code of candidates) {
    if (code !== from && code !== to) return code;
  }
  return null;
}

function flightNo(al: string, salt: string): string {
  return `${al}${100 + (hash(salt) % 800)}`;
}

export function searchOffers(query: SearchQuery): Offer[] {
  const { from, to, date } = query;
  if (!from || !to || from === to) return [];
  const dur = durationMin(from, to);
  const fare = baseFare(from, to);
  const bump = (hash(date) % 5) * 20000;
  const offers: Offer[] = [];
  const used = new Set<string>();

  carriers(from, to).forEach((al, index) => {
    let dep = SLOTS[(hash(`${from}${to}${al}`) + index * 2) % SLOTS.length];
    if (used.has(dep)) dep = addClock(dep, 35).time;
    used.add(dep);
    const factor = AIRLINE_FACTOR[al] ?? 1;
    const price = roundVnd(fare * factor + bump + index * 40000);
    const arr = addClock(dep, dur);
    const fn = flightNo(al, `${from}${to}${al}${date}`);
    offers.push({
      id: `${date}|${fn}|${from}|${to}|${dep}`,
      airline: al,
      airlineName: AIRLINES[al] ?? al,
      flightNumber: fn,
      from,
      to,
      date,
      departTime: dep,
      arriveTime: arr.time,
      arrivePlus: arr.plus,
      durationMin: dur,
      stops: 0,
      priceVnd: price,
      cabin: 'Phổ thông',
    });
  });

  const via = viaAirport(from, to);
  if (via) {
    const leg1 = durationMin(from, via);
    const leg2 = durationMin(via, to);
    const total = leg1 + leg2 + 75;
    const dep = SLOTS[(hash(`${from}${to}via`) + 3) % SLOTS.length];
    const arr = addClock(dep, total);
    const al = 'VJ';
    const fn = `${flightNo('VJ', `${from}${via}${date}`)}/${flightNo('VN', `${via}${to}${date}`)}`;
    offers.push({
      id: `${date}|${fn}|${from}|${to}|${dep}|via`,
      airline: al,
      airlineName: 'Vietjet + Vietnam Airlines',
      flightNumber: fn,
      from,
      to,
      date,
      departTime: dep,
      arriveTime: arr.time,
      arrivePlus: arr.plus,
      durationMin: total,
      stops: 1,
      via,
      priceVnd: roundVnd(fare * 0.78 + bump),
      cabin: 'Phổ thông',
    });
  }

  return offers.sort((a, b) => a.priceVnd - b.priceVnd || a.durationMin - b.durationMin);
}

export function viaCity(code: string | undefined): string | undefined {
  return code ? cityOf(code) : undefined;
}
