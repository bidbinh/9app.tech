import { useEffect, useState } from 'react';
import { airportByCode, cityOf } from '../data/catalog';
import { flightApi } from '../services/api';
import { routeLabel, STATUS_LABEL } from '../services/board';
import { ictClock } from '../services/format';
import type { BoardFlight, BoardResult, BoardSource } from '../types';
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
  const [source, setSource] = useState<BoardSource>('sample');
  const [fallback, setFallback] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [observedAt, setObservedAt] = useState<string | undefined>();

  function applyBoard(board: BoardResult) {
    setArrivals(board.arrivals);
    setDepartures(board.departures);
    setSource(board.source);
    setFallback(Boolean(board.fallback));
    setReason(board.reason);
    setObservedAt(board.observedAt);
    setClock(ictClock());
  }

  async function reload(code: string) {
    const [board, pinIds, pinnedRows] = await Promise.all([
      flightApi.board(code),
      flightApi.pins(),
      flightApi.pinned(),
    ]);
    applyBoard(board);
    setPins(pinIds);
    setPinned(pinnedRows);
  }

  useEffect(() => {
    let alive = true;
    void flightApi.board(airport).then((board) => {
      if (!alive) return;
      applyBoard(board);
    });
    void flightApi.pins().then((ids) => alive && setPins(ids));
    void flightApi.pinned().then((rows) => alive && setPinned(rows));
    const timer = window.setInterval(() => {
      void reload(airport);
    }, 120000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [airport]);

  async function onToggle(flight: BoardFlight) {
    const next = await flightApi.togglePin(flight.id, flight);
    setPins(next);
    setPinned(await flightApi.pinned());
  }

  const place = airportByCode(airport);
  const rows = tab === 'arrival' ? arrivals : departures;
  const live = new Map([...arrivals, ...departures].map((flight) => [flight.id, flight]));
  const pinnedRows = pinned.map((flight) => live.get(flight.id) ?? flight);

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
      <BoardNotice source={source} fallback={fallback} reason={reason} observedAt={observedAt} />

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
            {pinnedRows.map((flight) => (
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

function observedLabel(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function BoardNotice({
  source,
  fallback,
  reason,
  observedAt,
}: {
  source: BoardSource;
  fallback: boolean;
  reason?: string;
  observedAt?: string;
}) {
  if (source === 'acv') {
    const seen = observedLabel(observedAt);
    return (
      <p className="attrib experimental">
        Nguồn thử nghiệm từ trang ACV (acv.vn). Endpoint này không được công bố tài liệu và không được cấp phép cho sản phẩm.
        Giờ đi và giờ đến là giờ ACV công bố, không phải giờ dự kiến hay giờ thực tế.
        {seen ? ` Quan sát lúc ${seen} (giờ Việt Nam).` : ''}
      </p>
    );
  }
  if (source === 'aerodatabox') {
    return (
      <p className="attrib">
        Lịch bay:{' '}
        <a href="https://aerodatabox.com/" target="_blank" rel="noreferrer">
          AeroDataBox
        </a>
        . Giờ theo lịch, chưa có trạng thái thực.
      </p>
    );
  }
  const failed = fallback
    ? reason === 'aerodatabox_unavailable'
      ? 'Không lấy được AeroDataBox. '
      : 'Không lấy được bảng ACV. '
    : '';
  return (
    <p className="attrib sample-note">
      {failed}Đang hiển thị lịch mẫu, không phải chuyến bay thực.
    </p>
  );
}

function FlightCard({
  flight,
  pinned,
  onToggle,
}: {
  flight: BoardFlight;
  pinned: boolean;
  onToggle: (flight: BoardFlight) => void;
}) {
  const published = flight.departPublished !== undefined || flight.arrivePublished !== undefined;
  const statusLabel = flight.statusText || STATUS_LABEL[flight.status];
  return (
    <article className={`card flight ${flight.status}`}>
      <div className="flight-top">
        <div>
          <div className="airline">{flight.airlineName}</div>
          <div className="fn">{flight.flightNumber}</div>
        </div>
        <span className={`status ${flight.statusText ? 'published' : flight.status}`}>{statusLabel}</span>
      </div>
      <div className="route">
        <strong>{flight.origin}</strong>
        <span className="route-line" aria-hidden="true" />
        <strong>{flight.destination}</strong>
      </div>
      <p className="route-caption">
        {flight.routeText ?? `${routeLabel(flight)} · ${cityOf(flight.origin)} → ${cityOf(flight.destination)}`}
      </p>
      <div className="times">
        {published ? (
          <>
            <div>
              <span>Giờ đi</span>
              <strong>{flight.departPublished || '—'}</strong>
            </div>
            <div>
              <span>Giờ đến</span>
              <strong>{flight.arrivePublished || '—'}</strong>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>Kế hoạch</span>
              <strong>{flight.scheduledTime}</strong>
            </div>
            <div>
              <span>Dự kiến</span>
              <strong>{flight.estimatedTime}</strong>
            </div>
          </>
        )}
        {flight.terminal && (
          <div>
            <span>Nhà ga</span>
            <strong>{flight.terminal}</strong>
          </div>
        )}
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
        onClick={() => onToggle(flight)}
      >
        {pinned ? 'Bỏ ghim' : 'Ghim chuyến'}
      </button>
    </article>
  );
}
