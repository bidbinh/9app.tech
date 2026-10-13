import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIso, offsetString, toIso, shiftIso, fmtDate, fmtTime, fmtDayLabel } from '../js/time.js';

test('parseIso: hợp lệ, đổi ra ms UTC theo offset', () => {
  const p = parseIso('2026-11-15T06:30:00+07:00');
  assert.equal(p.ms, Date.UTC(2026, 10, 14, 23, 30));
  assert.equal(p.offsetMin, 420);
  assert.equal(parseIso('2026-11-15T06:30Z').offsetMin, 0);
  assert.equal(parseIso('2026-11-15T06:30:00-05:30').offsetMin, -330);
});

test('parseIso: từ chối thiếu offset, ngày/giờ không tồn tại, rác', () => {
  assert.equal(parseIso('2026-11-15T06:30:00'), null);
  assert.equal(parseIso('2026-02-30T06:30:00+07:00'), null);
  assert.equal(parseIso('2026-11-15T25:30:00+07:00'), null);
  assert.equal(parseIso('2026-11-15T24:00:00+07:00'), null);
  assert.equal(parseIso('2026-11-15T06:61:00+07:00'), null);
  assert.equal(parseIso(''), null);
  assert.equal(parseIso(null), null);
  assert.equal(parseIso('<img onerror=x>'), null);
});

test('offsetString và toIso', () => {
  assert.equal(offsetString(420), '+07:00');
  assert.equal(offsetString(0), '+00:00');
  assert.equal(offsetString(-330), '-05:30');
  assert.equal(toIso(Date.UTC(2026, 10, 14, 23, 30), 420), '2026-11-15T06:30:00+07:00');
});

test('shiftIso: qua nửa đêm, giữ offset quốc tế', () => {
  assert.equal(shiftIso('2026-11-15T01:00:00+07:00', -120), '2026-11-14T23:00:00+07:00');
  assert.equal(shiftIso('2026-11-15T06:30:00+09:00', 0), '2026-11-15T06:30:00+09:00');
  assert.equal(shiftIso('2026-12-31T23:30:00+09:00', 60), '2027-01-01T00:30:00+09:00');
  assert.equal(shiftIso('rác', 5), null);
});

test('fmtDate/fmtTime/fmtDayLabel theo giờ địa phương của offset đã lưu', () => {
  const iso = '2026-11-15T06:30:00+07:00';
  assert.equal(fmtDate(iso), '15/11/2026');
  assert.equal(fmtTime(iso), '06:30');
  assert.equal(fmtDayLabel(iso), 'CN');
  assert.equal(fmtTime('2026-11-15T23:55:00+09:00'), '23:55');
  assert.equal(fmtDayLabel('2026-11-16T00:10:00+09:00'), 'T2');
  assert.equal(fmtDate('rác'), '');
});
