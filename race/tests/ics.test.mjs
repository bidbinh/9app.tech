import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { icsEscape, foldLine, buildICS, eventsForRace, utcStamp, icsFileName } from '../js/ics.js';

const DOC = JSON.parse(fs.readFileSync(new URL('../data/races.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(DOC.races.map((r) => [r.id, r]));
const NOW = new Date(Date.UTC(2026, 9, 4, 12, 30, 5));

test('icsEscape: \\ ; , và xuống dòng', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  assert.equal(icsEscape('x\r\ny'), 'x\\ny');
  assert.equal(icsEscape(null), '');
});

test('foldLine: tối đa 75 octet UTF-8, nối lại thì đủ nguyên văn, không cắt giữa ký tự', () => {
  const long = 'SUMMARY:' + 'Đà Lạt Ưu tú, giải chạy việt dã '.repeat(8);
  const folded = foldLine(long);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75, `dòng quá dài: ${p.length}`);
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), long);
  assert.equal(foldLine('ngắn'), 'ngắn');
});

test('utcStamp: dạng UTC kết thúc bằng Z', () => {
  assert.equal(utcStamp(NOW), '20261004T123005Z');
});

test('sự kiện cho giải: có ngày giải, mở/hạn đăng ký, nhận BIB khi có dữ liệu', () => {
  const evs = eventsForRace(byId['tokyo-marathon-2027']);
  assert.deepEqual(evs.map((e) => e.kind), ['race', 'regOpen', 'regClose', 'bib']);
  const noExtra = eventsForRace(byId['berlin-marathon-2027']);
  assert.deepEqual(noExtra.map((e) => e.kind), ['race']);
  assert.deepEqual(eventsForRace(byId['tokyo-marathon-2027'], { only: ['race'] }).map((e) => e.kind), ['race']);
});

test('buildICS: cấu trúc, CRLF, ngày cả ngày (không cần VTIMEZONE), DTEND không gồm ngày cuối', () => {
  const r = byId['standard-chartered-hanoi-2026']; // 06-08/11/2026
  const ics = buildICS(eventsForRace(r), { now: NOW });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/(^|[^\r])\n/.test(ics), 'chỉ dùng CRLF');
  assert.ok(!ics.includes('VTIMEZONE'), 'dùng DATE nên không cần VTIMEZONE');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261106\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261109\r\n'), 'DTEND loại trừ: ngày 08 + 1');
  assert.ok(ics.includes('DTSTAMP:20261004T123005Z\r\n'));
  assert.ok(ics.includes('PRODID:-//9app.tech//9race//VI'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, (ics.match(/END:VALARM/g) || []).length);
  assert.ok(ics.includes('TRIGGER:-P6DT15H') && ics.includes('TRIGGER:-PT15H'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `dòng dài: ${line}`);
});

test('buildICS: giải một ngày có DTEND = ngày sau; qua ranh giới tháng/năm', () => {
  const ev = { uid: 'x@y', start: '2026-12-31', endExclusive: '2027-01-01', summary: 's', description: 'd', url: null, alarms: [] };
  const ics = buildICS([ev], { now: NOW });
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261231'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270101'));
  const r = byId['hcmc-marathon-2027'];
  const one = eventsForRace(r, { only: ['race'] })[0];
  assert.equal(one.start, '2027-01-17');
  assert.equal(one.endExclusive, '2027-01-18');
});

test('buildICS: escape ký tự đặc biệt trong tên và mô tả; UID duy nhất', () => {
  const r = { ...byId['trang-an-marathon-2026'], id: 'thu-nghiem', name: 'Giải; thử, nghiệm \\ "x"', city: 'A, B', registerUrl: 'https://example.com/a?b=1,2' };
  const evs = eventsForRace(r);
  const ics = buildICS(evs, { now: NOW });
  assert.ok(ics.includes('SUMMARY:Giải\\; thử\\, nghiệm \\\\ "x"'));
  assert.ok(ics.includes('Địa điểm: A\\, B'.replace('Địa điểm', 'Địa điểm')) || ics.includes('A\\, B'));
  const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim());
  assert.equal(new Set(uids).size, uids.length);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DESCRIPTION:'));
  assert.ok(unfolded.includes('Đăng ký: https://example.com/a?b=1\\,2'));
});

test('buildICS: nhắc mở đăng ký / hạn đăng ký / BIB', () => {
  const ics = buildICS(eventsForRace(byId['tokyo-marathon-2027']), { now: NOW }).replace(/\r\n /g, '');
  assert.ok(ics.includes('SUMMARY:Mở đăng ký: Tokyo Marathon 2027'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260624'));
  assert.ok(ics.includes('SUMMARY:Hạn đăng ký: Tokyo Marathon 2027'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260813'));
  assert.ok(ics.includes('SUMMARY:Nhận BIB: Tokyo Marathon 2027'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270304'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270307'), 'nhận BIB 04-06/03, DTEND 07/03');
  assert.ok(ics.includes('Thông tin tham khảo'));
});

test('icsFileName an toàn', () => {
  assert.equal(icsFileName('abc/../x y'), 'abc-x-y.ics');
  assert.ok(icsFileName('a'.repeat(200)).length <= 64);
});

test('mọi giải trong dữ liệu đều sinh được ICS hợp lệ về cấu trúc', () => {
  const all = DOC.races.flatMap((r) => eventsForRace(r));
  const ics = buildICS(all, { now: NOW });
  const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim());
  assert.equal(new Set(uids).size, uids.length, 'UID trùng');
  for (const m of ics.matchAll(/^DTSTART;VALUE=DATE:(\d{8})\r$/gm)) assert.match(m[1], /^20\d{6}$/);
});
