import { useEffect, useState, type FormEvent } from 'react';
import { cityOf } from '../data/catalog';
import { flightApi } from '../services/api';
import { hash, viDate } from '../services/format';
import type { BoardingPass, Booking, LookupHit } from '../types';

const HANDOFF = '9fly.handoff';

export function CheckInView() {
  const [pnr, setPnr] = useState('');
  const [name, setName] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hit, setHit] = useState<LookupHit | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const [rows, setRows] = useState<number[]>([]);
  const [letters, setLetters] = useState<string[]>([]);
  const [seat, setSeat] = useState('');
  const [pass, setPass] = useState<BoardingPass | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'lookup' | 'seat' | 'pass'>('lookup');

  async function refreshList() {
    setBookings(await flightApi.bookings());
  }

  async function openHit(next: LookupHit) {
    setHit(next);
    setError('');
    const existing = await flightApi.pass(next.booking.pnr, next.passenger.id);
    if (existing) {
      setPass(existing);
      setMode('pass');
      return;
    }
    const map = await flightApi.seatMap(next.booking.pnr, next.passenger.id);
    if (!map) {
      setError('Không mở được sơ đồ ghế.');
      return;
    }
    setRows(map.rows);
    setLetters(map.letters);
    setTaken(map.taken);
    setSeat(map.current);
    setMode('seat');
  }

  useEffect(() => {
    let alive = true;
    void refreshList();
    try {
      const raw = sessionStorage.getItem(HANDOFF);
      if (!raw) return () => { alive = false; };
      const data = JSON.parse(raw) as { pnr?: string; name?: string };
      if (data.pnr) setPnr(data.pnr);
      if (data.name) setName(data.name);
      if (data.pnr && data.name) {
        void flightApi.lookup(data.pnr, data.name).then((found) => {
          if (alive && found) void openHit(found);
        });
      }
    } catch {
      /* Bỏ qua tay cầm hỏng. */
    }
    return () => { alive = false; };
  }, []);

  async function onLookup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const found = await flightApi.lookup(pnr, name);
    setBusy(false);
    if (!found) {
      setError('Không thấy đặt chỗ. Kiểm tra mã và họ tên đúng như lúc mua vé.');
      setHit(null);
      return;
    }
    await openHit(found);
  }

  async function confirmSeat() {
    if (!hit || !seat) {
      setError('Chọn một ghế trống.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const issued = await flightApi.checkIn(hit.booking.pnr, hit.passenger.id, seat);
      setPass(issued);
      setMode('pass');
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa cấp được thẻ lên máy bay.');
    } finally {
      setBusy(false);
    }
  }

  async function changeSeat() {
    if (!hit) return;
    const map = await flightApi.seatMap(hit.booking.pnr, hit.passenger.id);
    if (!map) return;
    setRows(map.rows);
    setLetters(map.letters);
    setTaken(map.taken);
    setSeat(map.current);
    setMode('seat');
  }

  return (
    <div className="screen">
      {mode === 'lookup' && (
        <>
          <div className="screen-head">
            <div>
              <h1>Làm thủ tục</h1>
              <p>Nhập mã đặt chỗ và họ tên để chọn ghế, nhận thẻ lên máy bay.</p>
            </div>
          </div>
          <form className="card form" onSubmit={onLookup}>
            <label className="field" htmlFor="pnr">
              <span>Mã đặt chỗ</span>
              <input id="pnr" value={pnr} autoCapitalize="characters" onChange={(event) => setPnr(event.target.value.toUpperCase())} placeholder="9FDEMO" required />
            </label>
            <label className="field" htmlFor="passenger-name">
              <span>Họ tên hành khách</span>
              <input id="passenger-name" value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} placeholder="Bình Trần" required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Đang tra…' : 'Tra cứu'}
            </button>
          </form>
          <section>
            <h2>Đặt chỗ trên máy này</h2>
            <div className="stack">
              {bookings.map((item) => (
                <button
                  key={item.pnr}
                  type="button"
                  className="card linkish"
                  onClick={() => {
                    const who = item.passengers[0];
                    setPnr(item.pnr);
                    setName(who?.fullName ?? '');
                    if (who) void openHit({ booking: item, passenger: who });
                  }}
                >
                  <strong>{item.pnr}</strong>
                  <span>
                    {item.passengers.map((pax) => pax.fullName).join(', ')} · {item.offer.from} → {item.offer.to}
                  </span>
                  <span className="muted">{item.status === 'checked-in' ? 'Đã làm thủ tục' : 'Chưa làm thủ tục'}</span>
                </button>
              ))}
            </div>
            <p className="muted hint">Mã mẫu 9FDEMO, hành khách Bình Trần, luôn tra được trên máy này.</p>
          </section>
        </>
      )}

      {mode === 'seat' && hit && (
        <>
          <div className="screen-head">
            <div>
              <h1>Chọn ghế</h1>
              <p>
                {hit.passenger.fullName} · {hit.booking.offer.flightNumber} · {hit.booking.offer.from} → {hit.booking.offer.to}
              </p>
            </div>
            <button type="button" className="textish" onClick={() => setMode('lookup')}>
              Tra cứu khác
            </button>
          </div>
          <div className="legend">
            <span><i className="swatch free" /> Trống</span>
            <span><i className="swatch mine" /> Đang chọn</span>
            <span><i className="swatch busy" /> Đã có người</span>
          </div>
          <div className="seatmap" role="group" aria-label="Sơ đồ ghế">
            {rows.map((row) => (
              <div className="seat-row" key={row}>
                <span className="row-no">{row}</span>
                {letters.slice(0, 3).map((letter) => (
                  <SeatButton key={letter} row={row} letter={letter} taken={taken} seat={seat} onPick={setSeat} />
                ))}
                <span className="aisle" />
                {letters.slice(3).map((letter) => (
                  <SeatButton key={letter} row={row} letter={letter} taken={taken} seat={seat} onPick={setSeat} />
                ))}
              </div>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <button type="button" className="primary sticky" disabled={!seat || busy} onClick={() => void confirmSeat()}>
            {busy ? 'Đang cấp thẻ…' : seat ? `Xác nhận ghế ${seat}` : 'Chọn một ghế'}
          </button>
        </>
      )}

      {mode === 'pass' && pass && (
        <>
          <div className="screen-head">
            <div>
              <h1>Thẻ lên máy bay</h1>
              <p>Cho nhân viên soát vé xem màn hình này.</p>
            </div>
          </div>
          <PassCard pass={pass} />
          <button type="button" className="ghost" onClick={() => void changeSeat()}>
            Đổi ghế
          </button>
          <button type="button" className="textish" onClick={() => setMode('lookup')}>
            Tra cứu đặt chỗ khác
          </button>
        </>
      )}
    </div>
  );
}

function SeatButton({
  row,
  letter,
  taken,
  seat,
  onPick,
}: {
  row: number;
  letter: string;
  taken: string[];
  seat: string;
  onPick: (code: string) => void;
}) {
  const code = `${row}${letter}`;
  const blocked = taken.includes(code);
  return (
    <button
      type="button"
      className={blocked ? 'seat taken' : seat === code ? 'seat mine' : 'seat'}
      disabled={blocked}
      aria-label={blocked ? `Ghế ${code} đã có người` : `Ghế ${code}`}
      aria-pressed={seat === code}
      onClick={() => onPick(code)}
    >
      {letter}
    </button>
  );
}

function PassCard({ pass }: { pass: BoardingPass }) {
  const bars = barcode(pass.pnr + pass.seat);
  return (
    <article className="pass" id="boarding-pass">
      <header>
        <div>
          <strong>9fly</strong>
          <span>Thẻ lên máy bay</span>
        </div>
        <span className="pass-pnr">{pass.pnr}</span>
      </header>
      <p className="pass-name">{pass.passengerName}</p>
      <div className="pass-route">
        <div>
          <span>Từ</span>
          <strong>{pass.from}</strong>
          <em>{cityOf(pass.from)}</em>
        </div>
        <span aria-hidden="true">✈</span>
        <div>
          <span>Đến</span>
          <strong>{pass.to}</strong>
          <em>{cityOf(pass.to)}</em>
        </div>
      </div>
      <dl className="pass-grid">
        <div>
          <dt>Chuyến</dt>
          <dd>{pass.flightNumber}</dd>
        </div>
        <div>
          <dt>Ngày</dt>
          <dd>{viDate(pass.date)}</dd>
        </div>
        <div>
          <dt>Cất cánh</dt>
          <dd>{pass.departTime}</dd>
        </div>
        <div>
          <dt>Lên tàu</dt>
          <dd>{pass.boardingTime}</dd>
        </div>
        <div>
          <dt>Cửa</dt>
          <dd>{pass.gate}</dd>
        </div>
        <div>
          <dt>Ghế</dt>
          <dd>{pass.seat}</dd>
        </div>
      </dl>
      <p className="pass-meta">
        {pass.airlineName} · {pass.cabin}
      </p>
      <div className="barcode" aria-hidden="true">
        {bars.map((width, index) => (
          <span key={index} style={{ width }} />
        ))}
      </div>
      <p className="pass-foot">Thẻ mẫu của 9fly. Không dùng cho chuyến bay thật.</p>
    </article>
  );
}

function barcode(seed: string): number[] {
  const widths: number[] = [];
  let state = hash(seed);
  for (let i = 0; i < 56; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    widths.push(state % 4 === 0 ? 3 : 1);
  }
  return widths;
}
