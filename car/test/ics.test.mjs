import test from 'node:test';
import assert from 'node:assert/strict';
import { taoICS, thoat, gapDong } from '../js/lib/ics.js';

const NOW = new Date('2026-10-05T01:02:03Z');
test('ICS có khung VCALENDAR, CRLF, và ba VALARM 30/7/1 ngày', () => {
  const s = taoICS([{ id: 'abc', tieuDe: 'Đăng kiểm 51K-123.45', han: '2026-12-31', ghiChu: 'Trạm gần nhà; mang theo giấy tờ' }], { now: NOW });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(s));
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal((s.match(/BEGIN:VALARM/g) || []).length, 3);
  for (const p of ['TRIGGER:-P30D', 'TRIGGER:-P7D', 'TRIGGER:-P1D']) assert.ok(s.includes(p), p);
  assert.ok(s.includes('DTSTART:20261231T080000'));
  assert.ok(s.includes('DTSTAMP:20261005T010203Z'));
  assert.ok(s.includes('UID:9car-abc-20261231@9app.tech'));
  assert.ok(s.includes('Trạm gần nhà\\; mang theo'));
});
test('ICS bỏ qua mục không có hạn hợp lệ', () => {
  const s = taoICS([{ id: '1', tieuDe: 'a', han: '' }, { id: '2', tieuDe: 'b', han: 'abc' }], { now: NOW });
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 0);
});
test('thoát ký tự đặc biệt', () => {
  assert.equal(thoat('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});
test('gập dòng không quá 75 byte và không cắt giữa ký tự', () => {
  const dong = 'SUMMARY:' + 'Đăng kiểm xe ô tô Ấ '.repeat(12);
  const g = gapDong(dong);
  const enc = new TextEncoder();
  for (const d of g.split('\r\n')) assert.ok(enc.encode(d).length <= 75, d);
  assert.equal(g.split('\r\n').map((d, i) => (i ? d.slice(1) : d)).join(''), dong);
});
test('nhiều mục tạo nhiều sự kiện, giờ tùy chọn', () => {
  const s = taoICS([{ id: 'a', tieuDe: 'A', han: '2027-01-01' }, { id: 'b', tieuDe: 'B', han: '2027-02-01' }], { now: NOW, gio: '07:30' });
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(s.includes('DTSTART:20270101T073000'));
  assert.ok(s.includes('DTEND:20270101T080000'));
});

import { loHen, loNhatKy, loXe } from '../js/lib/data.js';
test('id độc hại không chèn được dòng vào .ics', () => {
  const xau = 'a\r\nBEGIN:VEVENT\r\nSUMMARY:EVIL';
  const s = taoICS([{ id: xau, tieuDe: 'Đăng kiểm\r\nBEGIN:VEVENT', han: '2027-01-01', ghiChu: 'x\nEND:VCALENDAR' }], { now: NOW });
  const dong = s.split('\r\n');
  assert.equal(dong.filter((d) => d === 'BEGIN:VEVENT').length, 1);
  assert.ok(!dong.some((d) => d.startsWith('SUMMARY:EVIL')));
  assert.equal(dong.filter((d) => d === 'END:VCALENDAR').length, 1);
  assert.ok(dong.every((d) => !d.startsWith('EVIL')));
});
test('id nhập từ JSON được làm sạch ngay từ đầu', () => {
  const xau = 'a\r\nBEGIN:VEVENT\r\nSUMMARY:EVIL';
  const h = loHen({ id: xau, xeId: xau, kind: 'tnds', ten: 'A', han: '2027-01-01' });
  assert.match(h.id, /^[\w.-]{1,40}$/); assert.match(h.xeId, /^[\w.-]{1,40}$/);
  const e = loNhatKy({ id: xau, xeId: xau, ngay: '2026-01-01', loai: 'xang' });
  assert.match(e.id, /^[\w.-]{1,40}$/);
  assert.match(loXe({ id: '<b>\n' }).id, /^[\w.-]{1,40}$/);
});
