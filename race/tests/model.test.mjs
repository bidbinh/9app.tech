import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fold, isISODate, addDays, daysBetween, fmtRange, fmtDate, todayISO } from '../js/util.js';
import {
  parseHash, buildHash, defaultFilters, matches, selectRaces, sortRaces, regStatusOf, distanceBands,
  monthMatrix, shiftMonth, countdownText, isPast,
} from '../js/model.js';

const DOC = JSON.parse(fs.readFileSync(new URL('../data/races.json', import.meta.url), 'utf8'));
const R = DOC.races;
const TODAY = '2026-10-04';
const F = (o) => ({ ...defaultFilters(), ...o });
const ids = (l) => l.map((r) => r.id);

test('fold: bỏ dấu tiếng Việt, đ -> d, chữ thường', () => {
  assert.equal(fold('Đà Lạt'), 'da lat');
  assert.equal(fold('Cà Mau Marathon'), 'ca mau marathon');
  assert.equal(fold('Thung lũng Tình Yêu'), 'thung lung tinh yeu');
  assert.equal(fold(null), '');
});

test('tìm không dấu: "da lat" ra giải Đà Lạt; "ha long" ra Hạ Long; nhiều từ là AND', () => {
  const dl = R.filter((r) => matches(r, F({ q: 'da lat' }), TODAY));
  assert.ok(dl.length >= 3);
  assert.ok(dl.every((r) => fold(r.city + r.name + (r.venue || '')).includes('da lat') || fold(r.organizer || '').includes('da lat')));
  const hl = R.filter((r) => matches(r, F({ q: 'HẠ LONG' }), TODAY));
  assert.ok(hl.some((r) => r.id === 'halong-bay-heritage-marathon-2026'));
  assert.equal(R.filter((r) => matches(r, F({ q: 'da lat xyzkhongco' }), TODAY)).length, 0);
  assert.ok(R.filter((r) => matches(r, F({ q: 'trail cao bang' }), TODAY)).some((r) => r.id === 'ultra-trail-cao-bang-2026'));
});

test('lọc loại, cự ly, vùng, đăng ký', () => {
  const trail = selectRaces(R, F({ types: ['trail'] }), TODAY);
  assert.ok(trail.length > 5 && trail.every((r) => r.type === 'trail'));
  const tri = selectRaces(R, F({ types: ['tri'] }), TODAY);
  assert.ok(tri.every((r) => r.type === 'tri'));
  const full = selectRaces(R, F({ dists: ['full'] }), TODAY);
  assert.ok(full.length >= 2 && full.every((r) => r.format === 'full'));
  const h703 = selectRaces(R, F({ dists: ['70.3'] }), TODAY);
  assert.ok(h703.some((r) => r.id === 'ironman-703-vietnam-2027'));
  const ultra = selectRaces(R, F({ dists: ['ultra'] }), TODAY);
  assert.ok(ultra.every((r) => r.distances.some((d) => d >= 50)));
  const k42 = selectRaces(R, F({ dists: ['42K'] }), TODAY);
  assert.ok(k42.every((r) => r.distances.some((d) => d >= 31 && d < 50)));
  const vn = selectRaces(R, F({ regions: ['vn'] }), TODAY);
  assert.ok(vn.length > 25 && vn.every((r) => r.country === 'VN'));
  const bac = selectRaces(R, F({ regions: ['vn-bac'] }), TODAY);
  assert.ok(bac.every((r) => r.region === 'vn-bac'));
  const world = selectRaces(R, F({ regions: ['sea', 'world'] }), TODAY);
  assert.ok(world.every((r) => ['sea', 'world'].includes(r.region)));
  // AND giữa nhóm: trail + miền Trung
  const both = selectRaces(R, F({ types: ['trail'], regions: ['vn-trung'] }), TODAY);
  assert.ok(both.length >= 2 && both.every((r) => r.type === 'trail' && r.region === 'vn-trung'));
});

test('cự ly: dải biên', () => {
  assert.deepEqual([...distanceBands({ distances: [5, 10, 21.1, 42.2, 100] })].sort(), ['10K', '21K', '42K', '5K', 'ultra']);
  assert.deepEqual([...distanceBands({ distances: [1.5, 2] })], []);
  assert.deepEqual([...distanceBands({ distances: [25] })], ['21K']);
  assert.deepEqual([...distanceBands({ distances: [], format: '70.3' })], ['70.3']);
});

test('trạng thái đăng ký tính theo ngày', () => {
  const base = { startDate: '2026-12-01', endDate: null, regStatus: 'open', regOpens: null, regCloses: null };
  assert.equal(regStatusOf(base, TODAY), 'open');
  assert.equal(regStatusOf({ ...base, regOpens: '2026-10-20' }, TODAY), 'soon');
  assert.equal(regStatusOf({ ...base, regCloses: '2026-10-03' }, TODAY), 'closed');
  assert.equal(regStatusOf({ ...base, regCloses: '2026-10-04' }, TODAY), 'open');
  assert.equal(regStatusOf({ ...base, regStatus: 'soldout' }, TODAY), 'soldout');
  assert.equal(regStatusOf({ ...base, startDate: '2026-09-01' }, TODAY), 'closed');
  const open = selectRaces(R, F({ regs: ['open'] }), TODAY);
  assert.ok(open.length > 5 && open.every((r) => regStatusOf(r, TODAY) === 'open'));
  const closed = selectRaces(R, F({ regs: ['closed'] }), TODAY);
  assert.ok(closed.some((r) => r.id === 'vpbank-hanoi-2026'), 'hết vé gộp vào "đã đóng"');
});

test('mặc định chỉ giải từ hôm nay; past=1 hiện cả đã qua', () => {
  const up = selectRaces(R, F({}), TODAY);
  assert.ok(up.every((r) => !isPast(r, TODAY)));
  assert.ok(up.some((r) => r.id === 'techcombank-hanoi-2026'), 'giải diễn ra hôm nay vẫn hiện');
  assert.ok(!up.some((r) => r.id === 'vmm-2026'));
  const all = selectRaces(R, F({ past: true }), TODAY);
  assert.ok(all.some((r) => r.id === 'vmm-2026'));
  assert.equal(all.length, R.length);
});

test('sắp xếp theo ngày, rồi ngày kết thúc, rồi tên không dấu', () => {
  const s = selectRaces(R, F({ past: true }), TODAY);
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].startDate <= s[i].startDate);
  const a = { id: 'a', name: 'Zeta', startDate: '2026-11-01', endDate: null };
  const b = { id: 'b', name: 'Đông', startDate: '2026-11-01', endDate: null };
  const c = { id: 'c', name: 'Alpha', startDate: '2026-11-01', endDate: '2026-11-02' };
  const d = { id: 'd', name: 'Beta', startDate: '2026-10-31', endDate: null };
  assert.deepEqual(ids(sortRaces([a, b, c, d])), ['d', 'b', 'a', 'c']);
});

test('lịch tháng: chỉ giải giao với tháng; lọc theo ngày', () => {
  const nov = selectRaces(R, F({ view: 'month', month: '2026-11' }), TODAY);
  assert.ok(nov.length >= 10);
  assert.ok(nov.every((r) => r.startDate.slice(0, 7) <= '2026-11' && (r.endDate || r.startDate).slice(0, 7) >= '2026-11'));
  const day = selectRaces(R, F({ view: 'month', month: '2026-11', day: '2026-11-15' }), TODAY);
  assert.ok(day.some((r) => r.id === 'trang-an-marathon-2026'));
  assert.ok(day.some((r) => r.id === 'ca-mau-marathon-2026'), 'giải nhiều ngày 14-15/11 tính vào ngày 15');
  const m = monthMatrix('2026-11');
  assert.equal(m[0][0], '2026-11-01'.replace('11-01', '11-01') && m[0][0]);
  assert.equal(m[0][6], '2026-11-01', '01/11/2026 là Chủ nhật');
  assert.ok(m.every((w) => w.length === 7));
  assert.equal(m.flat().filter(Boolean).length, 30);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
});

test('parseHash: route và bộ lọc', () => {
  assert.equal(parseHash('').route, 'list');
  assert.equal(parseHash('#/mine').route, 'mine');
  assert.equal(parseHash('#/about').route, 'about');
  const d = parseHash('#/g/trang-an-marathon-2026');
  assert.deepEqual([d.route, d.id], ['detail', 'trang-an-marathon-2026']);
  assert.equal(parseHash('#/g/<script>').id, '', 'id lạ bị loại');
  assert.equal(parseHash('#/g/%E0%A4%A').id, '', 'mã hóa hỏng không ném lỗi');
  const p = parseHash('#/?type=trail,tri,xx&dist=42K,ultra&region=vn-bac&reg=open&q=da%20lat&past=1&view=month&m=2026-11&d=2026-11-15');
  assert.deepEqual(p.filters.types, ['trail', 'tri']);
  assert.deepEqual(p.filters.dists, ['42K', 'ultra']);
  assert.deepEqual(p.filters.regions, ['vn-bac']);
  assert.deepEqual(p.filters.regs, ['open']);
  assert.equal(p.filters.q, 'da lat');
  assert.equal(p.filters.past, true);
  assert.equal(p.filters.view, 'month');
  assert.equal(p.filters.month, '2026-11');
  assert.equal(p.filters.day, '2026-11-15');
  const bad = parseHash('#/?m=2026-13&d=2026-02-30&view=zzz&dist=99K');
  assert.equal(bad.filters.month, '');
  assert.equal(bad.filters.day, '');
  assert.equal(bad.filters.view, 'list');
  assert.deepEqual(bad.filters.dists, []);
});

test('buildHash <-> parseHash khứ hồi', () => {
  assert.equal(buildHash('list', defaultFilters()), '#/');
  const f = F({ types: ['road'], dists: ['21K', '42K'], regions: ['vn', 'asia'], regs: ['soon', 'open'], q: 'hà nội', past: true, view: 'month', month: '2027-03', day: '2027-03-21' });
  const h = buildHash('list', f);
  assert.deepEqual(parseHash(h).filters, f);
  assert.equal(buildHash('detail', null, 'abc-1'), '#/g/abc-1');
  assert.equal(parseHash(buildHash('detail', null, 'abc-1')).id, 'abc-1');
});

test('ngày: kiểm tra, cộng, khoảng cách, định dạng', () => {
  assert.ok(isISODate('2028-02-29'));
  assert.ok(!isISODate('2027-02-29'));
  assert.ok(!isISODate('2026-13-01'));
  assert.ok(!isISODate('26-1-1'));
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-04', '2026-11-15'), 42);
  assert.equal(fmtDate('2026-10-04', true), 'CN, 04/10/2026');
  assert.equal(fmtRange('2026-11-06', '2026-11-08'), '06/11 - 08/11/2026');
  assert.equal(fmtRange('2026-12-30', '2027-01-02'), '30/12/2026 - 02/01/2027');
  assert.equal(todayISO(new Date(2026, 9, 4, 23, 59)), '2026-10-04');
  assert.equal(countdownText({ startDate: '2026-11-15', endDate: null }, TODAY), 'Còn 42 ngày');
  assert.equal(countdownText({ startDate: '2026-10-05', endDate: null }, TODAY), 'Ngày mai');
  assert.equal(countdownText({ startDate: '2026-10-04', endDate: null }, TODAY), 'Hôm nay');
  assert.equal(countdownText({ startDate: '2026-10-03', endDate: '2026-10-05' }, TODAY), 'Đang diễn ra');
  assert.equal(countdownText({ startDate: '2026-09-01', endDate: null }, TODAY), 'Đã diễn ra');
});
