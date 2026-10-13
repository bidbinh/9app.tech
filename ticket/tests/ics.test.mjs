import test from 'node:test';
import assert from 'node:assert/strict';
import { icsEscape, foldLine, utcStamp, buildICS, icsFileName } from '../js/ics.js';
import { validateTrip } from '../js/model.js';

const NOW = new Date(Date.UTC(2026, 9, 12, 3, 4, 5));
const T = validateTrip({
  id: 'x1', mode: 'bay', operator: 'Vietjet, Air', code: 'VJ123', pnr: 'abc12d',
  from: { code: 'HAN', name: 'Hà Nội' }, to: { code: 'SGN', name: 'TP. Hồ Chí Minh' },
  departAt: '2026-11-15T06:30:00+07:00', arriveAt: '2026-11-15T08:40:00+07:00',
  passengers: [{ name: 'NGUYEN VAN A', seat: '12A' }], note: 'Dòng 1\nDòng 2; có dấu phẩy, chấm phẩy',
}).trip;

test('icsEscape / utcStamp', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  assert.equal(icsEscape(null), '');
  assert.equal(utcStamp(NOW), '20261012T030405Z');
});

test('foldLine: tối đa 75 octet, nối lại đủ nguyên văn, không cắt giữa ký tự', () => {
  const long = 'SUMMARY:' + 'Hà Nội → Sài Gòn, chuyến sớm '.repeat(8);
  const parts = foldLine(long).split('\r\n');
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75);
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), long);
  assert.equal(foldLine('ngắn'), 'ngắn');
});

test('buildICS: cấu trúc, giờ UTC đúng, báo thức, thoát ký tự', () => {
  const ics = buildICS(T, { now: NOW, alarmMin: 120 });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/(?<!\r)\n/.test(ics), 'chỉ dùng CRLF');
  assert.ok(ics.includes('UID:x1@ticket.9app.tech\r\n'));
  assert.ok(ics.includes('DTSTAMP:20261012T030405Z\r\n'));
  assert.ok(ics.includes('DTSTART:20261114T233000Z\r\n'));
  assert.ok(ics.includes('DTEND:20261115T014000Z\r\n'));
  assert.ok(ics.includes('TRIGGER:-PT120M'));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('Mã đặt chỗ: ABC12D'));
  assert.ok(unfolded.includes('Dòng 1\\nDòng 2\\; có dấu phẩy\\, chấm phẩy'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
});

test('buildICS: chuyến quốc tế offset +09:00 đổi đúng sang UTC; thiếu giờ đến thì dài 1 giờ', () => {
  const t = validateTrip({ ...T, id: 'x2', departAt: '2026-11-16T00:10:00+09:00', arriveAt: '' }).trip;
  const ics = buildICS(t, { now: NOW, alarmMin: 180 });
  assert.ok(ics.includes('DTSTART:20261115T151000Z'));
  assert.ok(ics.includes('DTEND:20261115T161000Z'));
});

test('icsFileName: an toàn, theo ngày giờ địa phương', () => {
  assert.equal(icsFileName(T), '9ticket-vj123-20261115.ics');
  const noCode = validateTrip({ ...T, id: 'x3', code: '' }).trip;
  assert.equal(icsFileName(noCode), '9ticket-bay-20261115.ics');
});
