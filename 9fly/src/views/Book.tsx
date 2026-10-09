import { useMemo, useState, type FormEvent } from 'react';
import { cityOf } from '../data/catalog';
import { flightApi } from '../services/api';
import { durationLabel, ictDate, viDate, vnd } from '../services/format';
import type { Booking, Offer } from '../types';
import { AirportSelect, Stepper } from '../ui';

type PaxDraft = { fullName: string; dob: string; docId: string };
type Step = 'search' | 'results' | 'passengers' | 'pay' | 'done';

const TEST_CARD = { number: '4111 1111 1111 1111', name: 'BINH TRAN', exp: '12/28', cvc: '123' };

export function BookView({ onCheckIn }: { onCheckIn: (pnr: string, name: string) => void }) {
  const [step, setStep] = useState<Step>('search');
  const [from, setFrom] = useState('SGN');
  const [to, setTo] = useState('HAN');
  const [date, setDate] = useState(ictDate(1));
  const [paxCount, setPaxCount] = useState(1);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [sort, setSort] = useState<'price' | 'duration'>('price');
  const [picked, setPicked] = useState<Offer | null>(null);
  const [passengers, setPassengers] = useState<PaxDraft[]>([
    { fullName: 'Bình Trần', dob: '1990-01-15', docId: '079090001234' },
  ]);
  const [email, setEmail] = useState('binh.tran@9app.tech');
  const [phone, setPhone] = useState('0901234567');
  const [payMethod, setPayMethod] = useState<'card' | 'transfer'>('card');
  const [card, setCard] = useState({ number: '', name: 'BINH TRAN', exp: '', cvc: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);

  const sorted = useMemo(() => {
    const copy = offers.slice();
    copy.sort((a, b) => (sort === 'price' ? a.priceVnd - b.priceVnd : a.durationMin - b.durationMin));
    return copy;
  }, [offers, sort]);

  function setCount(next: number) {
    setPaxCount(next);
    setPassengers((current) => {
      const copy = current.slice(0, next);
      while (copy.length < next) copy.push({ fullName: '', dob: '', docId: '' });
      return copy;
    });
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (from === to) {
      setError('Chọn sân bay đi và sân bay đến khác nhau.');
      return;
    }
    if (date < ictDate(0)) {
      setError('Chọn hôm nay hoặc một ngày sau.');
      return;
    }
    setBusy(true);
    const rows = await flightApi.search({ from, to, date, passengers: paxCount });
    setOffers(rows);
    setBusy(false);
    setStep('results');
  }

  function choose(offer: Offer) {
    setPicked(offer);
    setError('');
    setStep('passengers');
  }

  function validatePassengers(): string {
    for (let i = 0; i < passengers.length; i++) {
      const pax = passengers[i];
      if (pax.fullName.trim().length < 3) return `Nhập họ tên hành khách ${i + 1}.`;
      if (!pax.dob) return `Nhập ngày sinh hành khách ${i + 1}.`;
      if (pax.docId.trim().length < 6) return `Nhập CCCD hoặc hộ chiếu hành khách ${i + 1}.`;
    }
    if (!email.includes('@')) return 'Nhập email liên hệ.';
    if (phone.replace(/\D/g, '').length < 9) return 'Nhập số điện thoại liên hệ.';
    return '';
  }

  function validateCard(): string {
    const digits = card.number.replace(/\D/g, '');
    if (digits.length !== 16) return 'Nhập số thẻ 16 chữ số. Có thể bấm Điền thẻ thử.';
    if (!/^\d{2}\/\d{2}$/.test(card.exp)) return 'Nhập hạn thẻ theo dạng MM/YY.';
    const month = Number(card.exp.slice(0, 2));
    if (month < 1 || month > 12) return 'Tháng hết hạn không hợp lệ.';
    if (!/^\d{3}$/.test(card.cvc)) return 'Nhập 3 số CVC.';
    if (card.name.trim().length < 2) return 'Nhập tên trên thẻ.';
    return '';
  }

  async function pay(mockSkip: boolean) {
    if (!picked) return;
    setError('');
    if (!mockSkip && payMethod === 'card') {
      const problem = validateCard();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    const created = await flightApi.book({
      offer: picked,
      passengers,
      contactEmail: email,
      contactPhone: phone,
    });
    setBooking(created);
    setBusy(false);
    setStep('done');
  }

  const total = picked ? picked.priceVnd * paxCount : 0;

  return (
    <div className="screen">
      {step === 'search' && (
        <>
          <div className="screen-head">
            <div>
              <h1>Mua vé</h1>
              <p>Tìm chuyến, chọn giá, thanh toán thử trên máy này.</p>
            </div>
          </div>
          <form className="card form" onSubmit={onSearch}>
            <div className="pair">
              <AirportSelect id="origin" label="Đi từ" value={from} onChange={setFrom} />
              <button
                type="button"
                className="swap"
                aria-label="Đổi chiều"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
              >
                ⇄
              </button>
              <AirportSelect id="destination" label="Đến" value={to} onChange={setTo} />
            </div>
            <label className="field" htmlFor="depart-date">
              <span>Ngày bay</span>
              <input id="depart-date" type="date" value={date} min={ictDate(0)} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <div className="field">
              <span>Hành khách</span>
              <Stepper value={paxCount} min={1} max={6} onChange={setCount} />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Đang tìm…' : 'Tìm chuyến'}
            </button>
          </form>
        </>
      )}

      {step === 'results' && (
        <>
          <div className="screen-head">
            <div>
              <h1>
                {from} → {to}
              </h1>
              <p>
                {viDate(date)} · {paxCount} hành khách
              </p>
            </div>
            <button type="button" className="textish" onClick={() => setStep('search')}>
              Sửa tìm kiếm
            </button>
          </div>
          <div className="seg" role="tablist" aria-label="Sắp xếp">
            <button type="button" className={sort === 'price' ? 'on' : ''} onClick={() => setSort('price')}>
              Giá thấp
            </button>
            <button type="button" className={sort === 'duration' ? 'on' : ''} onClick={() => setSort('duration')}>
              Bay nhanh
            </button>
          </div>
          <div className="stack">
            {sorted.map((offer) => (
              <article key={offer.id} className="card offer">
                <div className="flight-top">
                  <div>
                    <div className="airline">{offer.airlineName}</div>
                    <div className="fn">{offer.flightNumber}</div>
                  </div>
                  <div className="price">
                    <strong>{vnd(offer.priceVnd)}</strong>
                    <span>/ khách</span>
                  </div>
                </div>
                <div className="offer-times">
                  <div>
                    <strong>{offer.departTime}</strong>
                    <span>{offer.from}</span>
                  </div>
                  <div className="offer-mid">
                    <span>{durationLabel(offer.durationMin)}</span>
                    <span>{offer.stops === 0 ? 'Bay thẳng' : `1 điểm dừng · ${cityOf(offer.via ?? '')}`}</span>
                  </div>
                  <div>
                    <strong>
                      {offer.arriveTime}
                      {offer.arrivePlus > 0 ? <sup>+{offer.arrivePlus}</sup> : null}
                    </strong>
                    <span>{offer.to}</span>
                  </div>
                </div>
                {paxCount > 1 && <p className="muted">Tổng {vnd(offer.priceVnd * paxCount)}</p>}
                <button type="button" className="primary" onClick={() => choose(offer)}>
                  Chọn chuyến này
                </button>
              </article>
            ))}
          </div>
        </>
      )}

      {step === 'passengers' && picked && (
        <>
          <div className="screen-head">
            <div>
              <h1>Hành khách</h1>
              <p>
                {picked.flightNumber} · {picked.from} → {picked.to} · {viDate(picked.date)}
              </p>
            </div>
            <button type="button" className="textish" onClick={() => setStep('results')}>
              Đổi chuyến
            </button>
          </div>
          <form
            className="card form"
            onSubmit={(event) => {
              event.preventDefault();
              const problem = validatePassengers();
              if (problem) {
                setError(problem);
                return;
              }
              setError('');
              setStep('pay');
            }}
          >
            {passengers.map((pax, index) => (
              <fieldset key={index} className="pax">
                <legend>Hành khách {index + 1}</legend>
                <label className="field">
                  <span>Họ và tên</span>
                  <input
                    id={index === 0 ? 'pax-name' : undefined}
                    value={pax.fullName}
                    autoComplete="name"
                    onChange={(event) => {
                      const next = passengers.slice();
                      next[index] = { ...pax, fullName: event.target.value };
                      setPassengers(next);
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>Ngày sinh</span>
                  <input
                    id={index === 0 ? 'pax-dob' : undefined}
                    type="date"
                    value={pax.dob}
                    onChange={(event) => {
                      const next = passengers.slice();
                      next[index] = { ...pax, dob: event.target.value };
                      setPassengers(next);
                    }}
                    required
                  />
                </label>
                <label className="field">
                  <span>CCCD / hộ chiếu</span>
                  <input
                    id={index === 0 ? 'pax-doc' : undefined}
                    value={pax.docId}
                    onChange={(event) => {
                      const next = passengers.slice();
                      next[index] = { ...pax, docId: event.target.value };
                      setPassengers(next);
                    }}
                    required
                  />
                </label>
              </fieldset>
            ))}
            <label className="field" htmlFor="contact-email">
              <span>Email</span>
              <input id="contact-email" type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="field" htmlFor="contact-phone">
              <span>Số điện thoại</span>
              <input id="contact-phone" type="tel" value={phone} autoComplete="tel" onChange={(event) => setPhone(event.target.value)} required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit">
              Tiếp tục thanh toán
            </button>
          </form>
        </>
      )}

      {step === 'pay' && picked && (
        <>
          <div className="screen-head">
            <div>
              <h1>Thanh toán</h1>
              <p>Thanh toán giả lập, không trừ tiền thật.</p>
            </div>
            <button type="button" className="textish" onClick={() => setStep('passengers')}>
              Quay lại
            </button>
          </div>
          <section className="card summary">
            <div className="row-between">
              <span>
                {picked.from} → {picked.to}
              </span>
              <strong>{picked.flightNumber}</strong>
            </div>
            <p className="muted">
              {viDate(picked.date)} · {picked.departTime}–{picked.arriveTime} · {paxCount} khách
            </p>
            <div className="row-between total">
              <span>Tổng thanh toán</span>
              <strong>{vnd(total)}</strong>
            </div>
          </section>
          <div className="seg">
            <button type="button" className={payMethod === 'card' ? 'on' : ''} onClick={() => setPayMethod('card')}>
              Thẻ
            </button>
            <button type="button" className={payMethod === 'transfer' ? 'on' : ''} onClick={() => setPayMethod('transfer')}>
              Chuyển khoản
            </button>
          </div>
          {payMethod === 'card' ? (
            <form
              className="card form"
              onSubmit={(event) => {
                event.preventDefault();
                void pay(false);
              }}
            >
              <label className="field" htmlFor="card-number">
                <span>Số thẻ</span>
                <input id="card-number" inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(event) => setCard({ ...card, number: event.target.value })} placeholder="4111 1111 1111 1111" />
              </label>
              <label className="field" htmlFor="card-name">
                <span>Tên trên thẻ</span>
                <input id="card-name" autoComplete="cc-name" value={card.name} onChange={(event) => setCard({ ...card, name: event.target.value })} />
              </label>
              <div className="split">
                <label className="field" htmlFor="card-exp">
                  <span>Hạn thẻ</span>
                  <input id="card-exp" autoComplete="cc-exp" value={card.exp} onChange={(event) => setCard({ ...card, exp: event.target.value })} placeholder="MM/YY" />
                </label>
                <label className="field" htmlFor="card-cvc">
                  <span>CVC</span>
                  <input id="card-cvc" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={(event) => setCard({ ...card, cvc: event.target.value })} placeholder="123" />
                </label>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => setCard(TEST_CARD)}
              >
                Điền thẻ thử
              </button>
              {error && <p className="error">{error}</p>}
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Đang xử lý…' : `Thanh toán ${vnd(total)}`}
              </button>
            </form>
          ) : (
            <section className="card form">
              <div className="qr" aria-hidden="true" />
              <p>
                Chuyển khoản thử tới <strong>9fly</strong>
                <br />
                STK 0123 456 789 · Ngân hàng mẫu
              </p>
              <p className="muted">Nội dung: họ tên hành khách. Không có giao dịch thật.</p>
              {error && <p className="error">{error}</p>}
              <button type="button" className="primary" disabled={busy} onClick={() => void pay(false)}>
                {busy ? 'Đang xử lý…' : 'Tôi đã chuyển khoản'}
              </button>
            </section>
          )}
          <button type="button" className="ghost wide" disabled={busy} onClick={() => void pay(true)}>
            Thanh toán thử, không nhập thẻ
          </button>
        </>
      )}

      {step === 'done' && booking && (
        <section className="card done">
          <p className="kicker">Đặt chỗ thành công</p>
          <h1>Mã đặt chỗ</h1>
          <p className="pnr" id="booking-pnr">
            {booking.pnr}
          </p>
          <p>
            {booking.offer.from} → {booking.offer.to} · {booking.offer.flightNumber}
            <br />
            {viDate(booking.offer.date)} · cất cánh {booking.offer.departTime}
          </p>
          <ul className="plain">
            {booking.passengers.map((pax) => (
              <li key={pax.id}>{pax.fullName}</li>
            ))}
          </ul>
          <p className="muted">Đã thanh toán {vnd(booking.totalVnd)} trên máy này. Dùng mã và họ tên để làm thủ tục.</p>
          <button type="button" className="primary" onClick={() => onCheckIn(booking.pnr, booking.passengers[0]?.fullName ?? '')}>
            Làm thủ tục
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setStep('search');
              setBooking(null);
            }}
          >
            Đặt chuyến khác
          </button>
        </section>
      )}
    </div>
  );
}
