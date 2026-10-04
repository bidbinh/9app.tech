import test from 'node:test';
import assert from 'node:assert/strict';
import { buildICS, fold, escText } from '../js/ics.js';

const now = new Date(2026, 9, 4, 9, 0, 0);
const bytes = (s) => new TextEncoder().encode(s).length;

test('ICS: cấu trúc hợp lệ, CRLF, nhắc ôn hằng ngày đến hết ngày trước ngày thi', () => {
  const s = buildICS({ examDate: '2026-11-20', hang: 'B', time: '20:30', now });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(s), 'có LF không đi kèm CR');
  assert.match(s, /DTSTART:20261005T203000/);
  assert.match(s, /RRULE:FREQ=DAILY;UNTIL=20261119T235959/);
  assert.match(s, /DTSTART;VALUE=DATE:20261120/);
  assert.match(s, /DTEND;VALUE=DATE:20261121/);
  assert.match(s, /BEGIN:VALARM/);
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, (s.match(/END:VEVENT/g) || []).length);
  assert.equal((s.match(/BEGIN:VCALENDAR/g) || []).length, 1);
});

test('ICS: không đặt ngày thi thì nhắc 90 ngày; ngày thi quá gần thì bỏ nhắc hằng ngày', () => {
  const s = buildICS({ examDate: '', hang: 'A1', now });
  assert.match(s, /COUNT=90/);
  assert.ok(!/ngaythi/.test(s));
  const s2 = buildICS({ examDate: '2026-10-05', hang: 'A1', now });
  assert.ok(!/FREQ=DAILY/.test(s2));
  assert.match(s2, /ngaythi/);
});

test('ICS: nhắc đổi bằng trước 90 ngày và đúng ngày hết hạn', () => {
  const s = buildICS({ examDate: '', hang: 'B', now, gplxExpiry: '2027-03-01' });
  assert.match(s, /UID:hethan90@/);
  assert.match(s, /DTSTART;VALUE=DATE:20261201/);
  assert.match(s, /UID:hethan@/);
});

test('ICS: gập dòng tối đa 75 byte, ký tự tiếng Việt không bị cắt giữa chừng', () => {
  const long = 'DESCRIPTION:' + 'Ôn thi giấy phép lái xe hạng B '.repeat(8);
  const f = fold(long);
  for (const l of f.split('\r\n')) assert.ok(bytes(l) <= 75, l);
  assert.equal(f.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), long);
  const s = buildICS({ examDate: '2026-11-20', hang: 'B', now });
  for (const l of s.split('\r\n')) assert.ok(bytes(l) <= 75);
});

test('ICS: thoát ký tự đặc biệt', () => {
  assert.equal(escText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('ICS: UID cố định theo hạng, không đổi theo ngày tạo; SEQUENCE tăng; đủ cho mọi sự kiện', () => {
  const a = buildICS({ examDate: '2026-11-20', hang: 'B', now, gplxExpiry: '2027-03-01' });
  const later = new Date(2026, 9, 9, 10, 0, 0);
  const b = buildICS({ examDate: '2026-11-20', hang: 'B', now: later, gplxExpiry: '2027-03-01' });
  const uids = (s) => [...s.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(uids(a), uids(b));
  assert.equal(new Set(uids(a)).size, uids(a).length);
  assert.ok(uids(a).includes('ngaythi-B@license.9app.tech'));
  const seq = (s) => +s.match(/^SEQUENCE:(\d+)$/m)[1];
  assert.ok(seq(b) > seq(a));
  assert.equal((a.match(/^SEQUENCE:/gm) || []).length, (a.match(/BEGIN:VEVENT/g) || []).length);
});

test('ICS: nhắc ôn câu điểm liệt dùng đúng số câu của hạng; sự kiện cả ngày không có báo thức theo giờ', () => {
  for (const n of [20, 30, 60]) assert.match(buildICS({ examDate: '2026-11-20', hang: 'A1', now, critCount: n }), new RegExp(`Ôn nhanh ${n} câu điểm liệt`));
  const s = buildICS({ examDate: '2026-11-20', hang: 'A1', now, critCount: 20 });
  assert.ok(!/Ôn nhanh 60/.test(s));
  assert.ok(!/TRIGGER:-PT2H/.test(s));
  assert.match(s, /TRIGGER:-P1D/);
});
