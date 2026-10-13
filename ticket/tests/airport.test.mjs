import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEAD, isInternational, leadMinutes, leaveByIso, placeWord } from '../js/airport.js';

const stations = JSON.parse(fs.readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const trip = (o) => ({ mode: 'bay', from: { code: 'HAN', name: 'Hà Nội' }, to: { code: 'SGN', name: 'HCM' }, departAt: '2026-11-15T06:30:00+07:00', leadMin: null, ...o });

test('stations.json: đủ trường, mã IATA 3 chữ hoa, tz hợp lệ, không trùng mã', () => {
  const codes = new Set();
  for (const s of stations) {
    assert.ok(Array.isArray(s.kinds) && s.kinds.length, s.name);
    assert.match(s.tz, /^[+-]\d\d:\d\d$/);
    assert.ok(typeof s.country === 'string' && s.country.length === 2);
    if (s.kinds.includes('bay')) assert.match(s.code, /^[A-Z]{3}$/);
    else assert.equal(s.code, '');
    if (s.code) { assert.ok(!codes.has(s.code), 'trùng ' + s.code); codes.add(s.code); }
    for (const a of s.aliases) assert.equal(a, a.toLowerCase());
  }
});

test('isInternational chỉ với chuyến bay có đầu mút ngoài VN', () => {
  assert.equal(isInternational(trip(), stations), false);
  assert.equal(isInternational(trip({ to: { code: 'ICN', name: 'Seoul' } }), stations), true);
  assert.equal(isInternational(trip({ to: { code: 'ZZZ', name: 'Lạ' } }), stations), false);
  assert.equal(isInternational(trip({ mode: 'tau', to: { code: 'ICN' } }), stations), false);
});

test('leadMinutes: mặc định theo loại, leadMin của chuyến thắng', () => {
  assert.equal(leadMinutes(trip(), false), 120);
  assert.equal(leadMinutes(trip(), true), 180);
  assert.equal(leadMinutes(trip({ mode: 'tau' }), false), 45);
  assert.equal(leadMinutes(trip({ mode: 'xe' }), false), 30);
  assert.equal(leadMinutes(trip({ leadMin: 75 }), false), 75);
  assert.equal(leadMinutes(trip({ leadMin: 0 }), false), 0);
  assert.deepEqual(LEAD, { bayNoiDia: 120, bayQuocTe: 180, tau: 45, xe: 30 });
});

test('leaveByIso: qua nửa đêm và giữ offset', () => {
  assert.equal(leaveByIso(trip(), false), '2026-11-15T04:30:00+07:00');
  assert.equal(leaveByIso(trip({ departAt: '2026-11-15T01:00:00+07:00' }), false), '2026-11-14T23:00:00+07:00');
  assert.equal(leaveByIso(trip({ departAt: '2026-11-15T00:30:00+09:00', to: { code: 'ICN' } }), true), '2026-11-14T21:30:00+09:00');
  assert.equal(leaveByIso(trip({ departAt: 'rác' }), false), null);
});

test('placeWord', () => {
  assert.deepEqual([placeWord('bay'), placeWord('tau'), placeWord('xe')], ['sân bay', 'ga', 'bến']);
});
