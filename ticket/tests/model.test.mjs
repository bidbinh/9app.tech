import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrip, cleanTrip, newId, sortTrips, splitUpcoming, countdown, tripEndMs, MODES, MAX_PASSENGERS } from '../js/model.js';

const base = () => ({
  id: 'abc1', mode: 'bay', operator: 'Vietjet Air', code: 'vj123',
  from: { code: 'han', name: 'Hà Nội' }, to: { code: 'SGN', name: 'TP. Hồ Chí Minh' },
  departAt: '2026-11-15T06:30:00Z', arriveAt: '2026-11-15T08:40:00+07:00',
});

test('validateTrip: chuẩn hóa mã, viết hoa, ghi lại giờ dạng chuẩn', () => {
  const { trip, errors } = validateTrip(base());
  assert.deepEqual(errors, []);
  assert.equal(trip.code, 'VJ123');
  assert.equal(trip.from.code, 'HAN');
  assert.equal(trip.departAt, '2026-11-15T06:30:00+00:00');
  assert.equal(trip.arriveAt, '2026-11-15T08:40:00+07:00');
  assert.deepEqual(trip.passengers, []);
  assert.equal(trip.leadMin, null);
});

test('validateTrip: báo từng lỗi bằng tiếng Việt', () => {
  const r = validateTrip({ mode: 'ufo', from: {}, to: null, departAt: 'rác' });
  assert.equal(r.trip, null);
  assert.ok(r.errors.length >= 4);
  assert.ok(r.errors.every((e) => typeof e === 'string' && e.length > 5));
});

test('validateTrip: giờ đến phải sau giờ đi; thiếu giờ đến thì cho phép', () => {
  assert.equal(validateTrip({ ...base(), arriveAt: '2026-11-15T05:00:00Z' }).trip, null);
  assert.equal(validateTrip({ ...base(), arriveAt: '' }).trip.arriveAt, null);
});

test('validateTrip: hành khách, chi tiêu, leadMin bị giới hạn và làm sạch', () => {
  const passengers = Array.from({ length: 30 }, (_, i) => ({ name: 'Khách ' + i, seat: '1A' }));
  const t = validateTrip({
    ...base(), passengers,
    payments: [{ payer: 'An', amount: 100000, label: 'Taxi' }, { payer: 'Bình', amount: -5 }, { payer: '', amount: 10 }, { payer: 'C', amount: 1.5 }, { payer: 'D', amount: 2e9 }],
    leadMin: 90,
  }).trip;
  assert.equal(t.passengers.length, MAX_PASSENGERS);
  assert.deepEqual(t.payments, [{ payer: 'An', amount: 100000, label: 'Taxi' }]);
  assert.equal(t.leadMin, 90);
  assert.equal(validateTrip({ ...base(), leadMin: 5000 }).trip.leadMin, null);
});

test('validateTrip: HTML trong tên/ghi chú được giữ nguyên văn (chỉ cắt độ dài), không bị đổi', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const t = validateTrip({ ...base(), passengers: [{ name: evil }], note: evil }).trip;
  assert.equal(t.passengers[0].name, evil);
  assert.equal(t.note, evil);
});

test('validateTrip: id không hợp lệ bị từ chối; newId hợp lệ', () => {
  assert.equal(validateTrip({ ...base(), id: '../x' }).trip, null);
  const id = newId();
  assert.ok(validateTrip({ ...base(), id }).trip);
  assert.notEqual(newId(), newId());
  assert.deepEqual(MODES, ['bay', 'tau', 'xe']);
  assert.equal(cleanTrip(null), null);
});

test('sắp xếp, tách sắp tới/đã đi, chuyến không có giờ đến kết thúc sau 6 giờ', () => {
  const mk = (id, dep, arr) => validateTrip({ ...base(), id, departAt: dep, arriveAt: arr }).trip;
  const a = mk('a', '2026-11-15T06:00:00+07:00', '2026-11-15T08:00:00+07:00');
  const b = mk('b', '2026-11-10T06:00:00+07:00', '2026-11-10T08:00:00+07:00');
  const c = mk('c', '2026-11-12T06:00:00+07:00', '');
  assert.deepEqual(sortTrips([a, b, c]).map((t) => t.id), ['b', 'c', 'a']);
  const now = Date.parse('2026-11-12T10:00:00+07:00');
  const r = splitUpcoming([a, b, c], now);
  assert.deepEqual(r.upcoming.map((t) => t.id), ['c', 'a']);
  assert.deepEqual(r.past.map((t) => t.id), ['b']);
  assert.equal(tripEndMs(c), Date.parse('2026-11-12T12:00:00+07:00'));
  const later = Date.parse('2026-11-12T12:00:01+07:00');
  assert.deepEqual(splitUpcoming([c], later).past.map((t) => t.id), ['c']);
});

test('countdown', () => {
  const now = 1_000_000_000_000, m = 60000;
  assert.equal(countdown(now + 45 * m, now), 'còn 45 phút');
  assert.equal(countdown(now + 90 * m, now), 'còn 1 giờ 30 phút');
  assert.equal(countdown(now + 120 * m, now), 'còn 2 giờ');
  assert.equal(countdown(now + 50 * 60 * m, now), 'còn 2 ngày 2 giờ');
  assert.equal(countdown(now - 1, now), 'đã khởi hành');
});
