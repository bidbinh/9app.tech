import { useEffect, useState } from 'react';
import { airportByCode, cityOf } from '../data/catalog';
import { flightApi } from '../services/api';
import { routeLabel, STATUS_LABEL } from '../services/board';
import { ictClock } from '../services/format';
import type { BoardFlight } from '../types';
import { AirportSelect } from '../ui';

export function TrackView() {
  const [airport, setAirport] = useState('SGN');
  const [tab, setTab] = useState<'arrival' | 'departure'>('departure');
  const [onlyPins, setOnlyPins] = useState(false);
  const [arrivals, setArrivals] = useState<BoardFlight[]>([]);
  const [departures, setDepartures] = useState<BoardFlight[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const [pinned, setPinned] = useState<BoardFlight[]>([]);
  const [clock, setClock] = useState(ictClock());

  async function reload(code: string) {
    const [board, pinIds, pinnedRows] = await Promise.all([
      flightApi.board(code),
      flightApi.pins(),
      flightApi.pinned(),
    ]);
    setArrivals(board.arrivals);
    setDepartures(board.departures);
    setPins(pinIds);
    setPinned(pinnedRows);
    setClock(ictClock());
  }

  useEffect(() => {
    let alive = true;
    void flightApi.board(airport).then((board) => {
      if (!alive) return;
      setArrivals(board.arrivals);
      setDepartures(board.departures);
    });
    void flightApi.pins().then((ids) => alive && setPins(ids));
    void flightApi.pinned().then((rows) => alive && setPinned(rows));
    const timer = window.setInterval(() => {
      void reload(airport);
    }, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [airport]);

  async function onToggle(id: string) {
    const next = await flightApi.togglePin(id);
    setPins(next);
    setPinned(await flightApi.pinned());
  }

  const place = airportByCode(airport);
  const rows = tab === 'arrival' ? arrivals : departures;

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Theo dõi chuyến bay</h1>
          <p>
            {place ? `${place.name} · ${place.city}` : airport} · giờ Việt Nam {clock}
          </p>
        </div>
        <button type="button" className="textish" onClick={() => void reload(airport)}>
          Làm mới
        </button>
      </div>

      <AirportSelect id="airport" label="Sân bay" value={airport} onChange={setAirport} />

      <section className="pin-block" aria-label="Chuyến đã ghim">
        <div className="row-between">
          <h2>Đã ghim {pinned.length ? `(${pinned.length})` : ''}</h2>
          <button
            type="button"
            className={onlyPins ? 'chip on' : 'chip'}
            aria-pressed={onlyPins}
            onClick={() => setOnlyPins((value) => !value)}
          >
            {onlyPins ? 'Xem bảng chuyến' : 'Chỉ chuyến đã ghim'}
          </button>
        </div>
        {pinned.length === 0 ? (
          <p className="muted">Ghim chuyến bạn quan tâm. Danh sách được lưu trên máy này.</p>
        ) : (
          <div className="stack">
            {pinned.map((flight) => (
              <FlightCard key={flight.id} flight={flight} pinned onToggle={onToggle} />
            ))}
          </div>
        )}
      </section>

      {!onlyPins && (
        <>
          <div className="seg" role="tablist" aria-label="Bảng chuyến">
            <button type="button" role="tab" aria-selected={tab === 'arrival'} className={tab === 'arrival' ? 'on' : ''} onClick={() => setTab('arrival')}>
              Chuyến đến ({arrivals.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === 'departure'} className={tab === 'departure' ? 'on' : ''} onClick={() => setTab('departure')}>
              Chuyến đi ({departures.length})
            </button>
          </div>
          <div className="stack">
            {rows.map((flight) => (
              <FlightCard key={flight.id} flight={flight} pinned={pins.includes(flight.id)} onToggle={onToggle} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FlightCard({
  flight,
  pinned,
  onToggle,
}: {
  flight: BoardFlight;
  pinned: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <article className={`card flight ${flight.status}`}>
      <div className="flight-top">
        <div>
          <div className="airline">{flight.airlineName}</div>
          <div className="fn">{flight.flightNumber}</div>
        </div>
        <span className={`status ${flight.status}`}>{STATUS_LABEL[flight.status]}</span>
      </div>
      <div className="route">
        <strong>{flight.origin}</strong>
        <span className="route-line" aria-hidden="true" />
        <strong>{flight.destination}</strong>
      </div>
      <p className="route-caption">
        {routeLabel(flight)} · {cityOf(flight.origin)} → {cityOf(flight.destination)}
      </p>
      <div className="times">
        <div>
          <span>Kế hoạch</span>
          <strong>{flight.scheduledTime}</strong>
        </div>
        <div>
          <span>Dự kiến</span>
          <strong>{flight.estimatedTime}</strong>
        </div>
        {flight.gate && (
          <div>
            <span>Cửa</span>
            <strong>{flight.gate}</strong>
          </div>
        )}
        {flight.belt && (
          <div>
            <span>Băng chuyền</span>
            <strong>{flight.belt}</strong>
          </div>
        )}
      </div>
      <button
        type="button"
        className={pinned ? 'pin on' : 'pin'}
        aria-pressed={pinned}
        onClick={() => onToggle(flight.id)}
      >
        {pinned ? 'Bỏ ghim' : 'Ghim chuyến'}
      </button>
    </article>
  );
}
