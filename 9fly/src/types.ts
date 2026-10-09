export type Airport = {
  code: string;
  city: string;
  name: string;
  country: string;
};

export type FlightStatus =
  | 'scheduled'
  | 'ontime'
  | 'delayed'
  | 'boarding'
  | 'departed'
  | 'arriving'
  | 'landed'
  | 'cancelled';

export type BoardSource = 'acv' | 'aerodatabox' | 'sample';

export type BoardDirection = 'arrival' | 'departure';

export type BoardFlight = {
  id: string;
  direction: BoardDirection;
  airport: string;
  airline: string;
  airlineName: string;
  flightNumber: string;
  origin: string;
  destination: string;
  scheduledTime: string;
  estimatedTime: string;
  status: FlightStatus;
  /** Text ACV publishes in trangThai. Not mapped onto on-time or departed. */
  statusText?: string;
  /** gioKhoiHanh as published. Absent on sample rows. */
  departPublished?: string;
  /** gioHaCanh as published. Absent on sample rows. */
  arrivePublished?: string;
  routeText?: string;
  terminal?: string;
  gate?: string;
  belt?: string;
};

export type BoardResult = {
  arrivals: BoardFlight[];
  departures: BoardFlight[];
  source: BoardSource;
  fallback?: boolean;
  reason?: string;
  observedAt?: string;
  flightDate?: string;
};

export type Offer = {
  id: string;
  airline: string;
  airlineName: string;
  flightNumber: string;
  from: string;
  to: string;
  date: string;
  departTime: string;
  arriveTime: string;
  arrivePlus: number;
  durationMin: number;
  stops: number;
  via?: string;
  priceVnd: number;
  cabin: 'Phổ thông';
};

export type SearchQuery = {
  from: string;
  to: string;
  date: string;
  passengers: number;
};

export type Passenger = {
  id: string;
  fullName: string;
  dob: string;
  docId: string;
};

export type Booking = {
  pnr: string;
  offer: Offer;
  passengers: Passenger[];
  contactEmail: string;
  contactPhone: string;
  totalVnd: number;
  paidAt: string;
  status: 'confirmed' | 'checked-in';
  seats: Record<string, string>;
};

export type BookInput = {
  offer: Offer;
  passengers: Array<Omit<Passenger, 'id'>>;
  contactEmail: string;
  contactPhone: string;
};

export type LookupHit = {
  booking: Booking;
  passenger: Passenger;
};

export type BoardingPass = {
  pnr: string;
  passengerName: string;
  airlineName: string;
  flightNumber: string;
  from: string;
  to: string;
  date: string;
  departTime: string;
  boardingTime: string;
  gate: string;
  seat: string;
  cabin: string;
};

export type Leg = {
  fn: string;
  al: string;
  from: string;
  to: string;
  dep: string;
};
