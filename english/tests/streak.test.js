const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/streak.js');
const G = 600;

test('chuỗi tính các ngày liên tiếp đạt mục tiêu', () => {
  assert.deepEqual(S.streak({ 10: 700, 11: 600, 12: 900 }, G, 12), { current: 3, best: 3, todayDone: true });
});
test('hôm nay chưa đạt thì chuỗi vẫn giữ nếu hôm qua đạt', () => {
  const r = S.streak({ 10: 700, 11: 650, 12: 100 }, G, 12);
  assert.equal(r.current, 2); assert.equal(r.todayDone, false);
});
test('bỏ lỡ một ngày thì chuỗi về 0, kỷ lục vẫn nhớ', () => {
  const r = S.streak({ 5: 700, 6: 700, 7: 700, 8: 700, 10: 700 }, G, 12);
  assert.equal(r.current, 0); assert.equal(r.best, 4);
});
test('không có dữ liệu', () => { assert.deepEqual(S.streak({}, G, 100), { current: 0, best: 0, todayDone: false }); });
test('ngày chưa đủ 10 phút không tính', () => { assert.equal(S.streak({ 12: 599 }, G, 12).current, 0); });

test('ICS hợp lệ: CRLF, RRULE hằng ngày, báo thức, có giờ nhắc', () => {
  const ics = S.buildIcs({ time: '19:30', startDate: new Date(2026, 9, 5), now: new Date(Date.UTC(2026, 9, 4, 1, 2, 3)) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261005T193000\r\n'));
  assert.ok(ics.includes('RRULE:FREQ=DAILY'));
  assert.ok(ics.includes('DTSTAMP:20261004T010203Z'));
  assert.ok(ics.includes('BEGIN:VALARM') && ics.includes('END:VALARM'));
  assert.ok(ics.includes('DURATION:PT10M'));
  assert.ok(!/[^\r]\n/.test(ics), 'mọi xuống dòng phải là CRLF');
});
test('ICS: dòng không quá 75 byte và tiếng Việt không bị cắt giữa ký tự', () => {
  const ics = S.buildIcs({ time: '07:05', desc: 'Mỗi ngày mười phút: ôn thẻ từ, luyện nói và nghe một bài ngắn để giữ chuỗi ngày học của bạn thật dài.' });
  ics.split('\r\n').forEach((l) => assert.ok(Buffer.byteLength(l) <= 75, l));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DESCRIPTION:Mỗi ngày mười phút: ôn thẻ từ\\, luyện nói'));
});
test('ICS: giờ sai bị từ chối', () => {
  assert.throws(() => S.buildIcs({ time: '25:00' })); assert.throws(() => S.buildIcs({ time: 'abc' }));
});
