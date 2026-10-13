import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTicketText, matchStation, findStations, foldKeep } from '../js/parse.js';
import { validateTrip } from '../js/model.js';

const stations = JSON.parse(fs.readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-12T00:00:00+07:00');
const run = (t) => parseTicketText(t, { stations, now: NOW });

const FLIGHT = `Vietjet Air - Xác nhận đặt vé
Mã đặt chỗ: ABC12D
Chuyến bay VJ123 Hà Nội (HAN) → TP. Hồ Chí Minh (SGN)
Khởi hành: 15/11/2026 06:30  Đến: 15/11/2026 08:40
Hành khách: NGUYEN VAN A  Ghế 12A
Cổng: 12   Nhà ga: T2`;

test('foldKeep bỏ dấu, giữ hoa/thường', () => {
  assert.equal(foldKeep('Đà Nẵng — Hà Nội'), 'Da Nang — Ha Noi');
});

test('matchStation theo mã, theo tên bỏ dấu, theo loại', () => {
  assert.equal(matchStation(stations, 'han', 'bay').code, 'HAN');
  assert.equal(matchStation(stations, 'ha noi', 'bay').code, 'HAN');
  assert.equal(matchStation(stations, 'Hà Nội', 'tau').name, 'Ga Hà Nội');
  assert.equal(matchStation(stations, 'Hà Nội', 'xe').kinds[0], 'xe');
  assert.equal(matchStation(stations, 'xyz', 'bay'), null);
  assert.equal(matchStation(stations, '', 'bay'), null);
});

test('vé máy bay đầy đủ', () => {
  const r = run(FLIGHT);
  assert.equal(r.ok, true, r.issues.join('|'));
  const t = r.trip;
  assert.equal(t.mode, 'bay');
  assert.equal(t.operator, 'Vietjet Air');
  assert.equal(t.code, 'VJ123');
  assert.equal(t.pnr, 'ABC12D');
  assert.equal(t.from.code, 'HAN');
  assert.equal(t.to.code, 'SGN');
  assert.equal(t.departAt, '2026-11-15T06:30:00+07:00');
  assert.equal(t.arriveAt, '2026-11-15T08:40:00+07:00');
  assert.deepEqual(t.passengers, [{ name: 'NGUYEN VAN A', seat: '12A' }]);
  assert.equal(t.gate, '12');
  assert.equal(t.terminal, 'T2');
  assert.ok(validateTrip(t).trip, 'bản nháp phải qua được kiểm tra');
});

test('vé tàu qua nhiều ngày; năm thiếu thì suy ra năm tới gần nhất', () => {
  const r = run('Vé tàu SE1 Hà Nội - Sài Gòn. Khởi hành 19:20 20/11/2026, đến 04:10 22/11/2026. Mã đặt chỗ: TRN9K2');
  assert.equal(r.ok, true, r.issues.join('|'));
  assert.equal(r.trip.mode, 'tau');
  assert.equal(r.trip.code, 'SE1');
  assert.equal(r.trip.operator, 'Đường sắt Việt Nam');
  assert.equal(r.trip.from.name, 'Ga Hà Nội');
  assert.equal(r.trip.to.name, 'Ga Sài Gòn');
  assert.equal(r.trip.arriveAt, '2026-11-22T04:10:00+07:00');
  const noYear = run('Vé tàu SE3 Hà Nội đến Đà Nẵng 05/01 19:00');
  assert.equal(noYear.trip.departAt, '2027-01-05T19:00:00+07:00');
});

test('giờ đến sớm hơn giờ đi cùng ngày thì sang ngày hôm sau', () => {
  const r = run('Chuyến bay VN245 HAN SGN 15/11/2026 23:30 đến 01:40');
  assert.equal(r.trip.departAt, '2026-11-15T23:30:00+07:00');
  assert.equal(r.trip.arriveAt, '2026-11-16T01:40:00+07:00');
});

test('bay quốc tế dùng múi giờ của nơi đi và nơi đến', () => {
  const r = run('VJ822 SGN ICN 10/12/2026 23:55 đến 07:00 11/12/2026');
  assert.equal(r.trip.departAt, '2026-12-10T23:55:00+07:00');
  assert.equal(r.trip.arriveAt, '2026-12-11T07:00:00+09:00');
});

test('xe khách: nhận loại, để trống nhà xe', () => {
  const r = run('Vexere: vé xe giường nằm Hà Nội - Sa Pa, 12/11/2026 21:00');
  assert.equal(r.trip.mode, 'xe');
  assert.equal(r.trip.operator, '');
  assert.equal(r.trip.from.name, 'Hà Nội');
  assert.equal(r.trip.to.name, 'Sa Pa');
});

test('không phải vé / rỗng / thiếu thông tin: báo rõ, không bịa', () => {
  assert.equal(run('').ok, false);
  assert.equal(run('').trip, null);
  const g = run('Xin chào, hẹn gặp lại vào cuối tuần nhé!');
  assert.equal(g.ok, false);
  assert.ok(g.issues.length >= 1);
  const partial = run('VJ123 HAN SGN');
  assert.equal(partial.ok, false);
  assert.ok(partial.issues.some((s) => s.includes('giờ')));
  assert.equal(partial.trip.code, 'VJ123');
});

test('ngày không tồn tại không được nhận', () => {
  const r = run('VJ123 HAN SGN 31/02/2026 06:30');
  assert.equal(r.ok, false);
});

test('văn bản rất dài không treo và chỉ đọc 20.000 ký tự đầu', () => {
  const big = 'lorem ipsum dolor sit amet '.repeat(10000) + FLIGHT;
  const t0 = Date.now();
  const r = run(big);
  assert.ok(Date.now() - t0 < 2000, 'quá chậm');
  assert.equal(r.ok, false);
});

test('HTML trong nội dung vé được giữ như chữ thường, không diễn giải', () => {
  const r = run(FLIGHT.replace('NGUYEN VAN A', '<img src=x onerror=alert(1)>'));
  const name = r.trip.passengers[0] && r.trip.passengers[0].name;
  assert.ok(!name || name.includes('<img'), 'nếu có thì giữ nguyên văn');
});

test('findStations theo thứ tự xuất hiện', () => {
  const s = findStations(stations, 'đi Sài Gòn rồi về Hà Nội', 'tau');
  assert.deepEqual(s.map((x) => x.name), ['Ga Sài Gòn', 'Ga Hà Nội']);
});
