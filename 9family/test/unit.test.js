// Kiểm thử đơn vị (không cần CSDL): thời gian UTC+7, âm lịch, sự kiện lặp, ICS, AI, mốc leo thang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.FAMILY_AI_KEY = 'khoa-thu'; process.env.FAMILY_AI_RETRY_MS = '1'; process.env.FAMILY_AI_BASE = 'http://ai.invalid';
const vn = await import('../src/vn.js');
const { solarToLunar, lunarToSolar, canChiYear, lunarMonthLength } = await import('../src/lunar.js');
const { expand, matchesDay, makeLunarCache } = await import('../src/recur.js');
const { buildIcs, escapeText, fold } = await import('../src/ics.js');
const ai = await import('../src/ai.js');
const { dueSteps, stepOffsets, normEsc } = await import('../src/rides.js');
const { buildTimetableEvents, parseEvent } = await import('../src/routes/events.js');
const { checkEndpoint } = await import('../src/push.js');
const { KNOWN, VN_ONLY } = await import('./lunar-table.js');

const ev = (o) => ({ id: 'e1', title: 'X', kind: 'khac', location: '', note: '', all_day: false, start_time: '07:30', end_time: '08:15', start_date: '2026-01-01', until_date: null, rec_type: 'none', rec_days: [], lunar_month: null, lunar_day: null, ...o });
const days = (list) => list.map((o) => o.day);

// ---------- thời gian ----------
test('giờ Việt Nam: nửa đêm và qua năm', () => {
  assert.equal(vn.todayVN(Date.parse('2026-12-31T16:59:59Z')), '2026-12-31');
  assert.equal(vn.todayVN(Date.parse('2026-12-31T17:00:00Z')), '2027-01-01');
  assert.equal(vn.todayVN(Date.parse('2026-10-04T16:59:59.999Z')), '2026-10-04');
  assert.equal(vn.todayVN(Date.parse('2026-10-04T17:00:00Z')), '2026-10-05');
  assert.equal(vn.todayVN(Date.parse('2028-02-28T17:00:00Z')), '2028-02-29');
  assert.equal(vn.atMs('2027-01-01', '00:00'), Date.parse('2026-12-31T17:00:00Z'));
  assert.equal(vn.atMs('2026-10-05', '07:30'), Date.parse('2026-10-05T00:30:00Z'));
  assert.equal(vn.hhmmOfMs(Date.parse('2026-12-31T17:05:00Z')), '00:05');
  assert.equal(vn.weekdayISO('2026-10-05'), 1);
  assert.equal(vn.weekdayISO('2026-10-04'), 7);
  assert.equal(vn.weekdayISO('2027-01-01'), 5);
  assert.equal(vn.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(vn.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(vn.addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(vn.daysBetween('2026-12-31', '2027-01-02'), 2);
});
test('giờ Việt Nam không phụ thuộc múi giờ của máy', () => {
  // todayVN dùng số học UTC thuần nên cùng kết quả dù TZ máy là gì
  const saved = process.env.TZ;
  for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
    process.env.TZ = tz;
    assert.equal(vn.todayVN(Date.parse('2026-12-31T17:00:00Z')), '2027-01-01');
    assert.equal(vn.weekdayISO('2026-10-05'), 1);
  }
  process.env.TZ = saved;
});
test('kiểm tra ngày hợp lệ', () => {
  for (const d of ['2026-02-29', '2026-13-01', '2026-00-10', 'abc', '2026-1-1', '', null, 5]) assert.equal(vn.isValidDay(d), false, String(d));
  for (const d of ['2028-02-29', '2026-12-31', '2026-01-01']) assert.equal(vn.isValidDay(d), true);
});

// ---------- âm lịch ----------
test(`âm lịch: ${KNOWN.length + VN_ONLY.length} mốc đã biết (2020 đến 2035), cả hai chiều`, () => {
  assert.ok(KNOWN.length + VN_ONLY.length >= 100);
  for (const [d, ld, lm, ly, lp] of [...KNOWN, ...VN_ONLY]) {
    const a = solarToLunar(d);
    assert.deepEqual([a.day, a.month, a.year, a.leap], [ld, lm, ly, lp], `dương ${d}`);
    assert.equal(lunarToSolar(ld, lm, ly, lp), d, `âm ${ld}/${lm}/${ly}${lp ? ' nhuận' : ''}`);
  }
});
test('Tết Nguyên đán các năm 2020 đến 2035 (mùng 1 tháng Giêng)', () => {
  const tet = { 2020: '2020-01-25', 2021: '2021-02-12', 2022: '2022-02-01', 2023: '2023-01-22', 2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06',
    2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-02', 2031: '2031-01-23', 2032: '2032-02-11', 2033: '2033-01-31', 2034: '2034-02-19', 2035: '2035-02-08' };
  for (const [y, d] of Object.entries(tet)) assert.equal(lunarToSolar(1, 1, Number(y)), d, `Tết ${y}`);
});
test('âm lịch: tháng nhuận và ngày không tồn tại', () => {
  assert.equal(lunarToSolar(1, 4, 2020, true), '2020-05-23'); // nhuận tháng 4/2020
  assert.equal(lunarToSolar(1, 5, 2020, true), null); // 2020 không nhuận tháng 5
  assert.equal(lunarToSolar(1, 4, 2021, true), null);
  assert.equal(lunarToSolar(31, 1, 2026), null);
  assert.equal(canChiYear(2026), 'Bính Ngọ');
  assert.equal(canChiYear(2024), 'Giáp Thìn');
  assert.equal(lunarMonthLength('2026-02-17') === 29 || lunarMonthLength('2026-02-17') === 30, true);
});
test('âm lịch: mỗi ngày dương đi sang âm rồi về dương đều khớp (2019 đến 2036)', () => {
  let d = '2019-01-01'; let n = 0;
  while (d < '2036-12-31') {
    const l = solarToLunar(d);
    assert.equal(lunarToSolar(l.day, l.month, l.year, l.leap), d, d);
    d = vn.addDays(d, 1); n++;
  }
  assert.ok(n > 6000);
});

// ---------- sự kiện lặp ----------
test('lặp hằng tuần nhiều thứ, có khoảng hiệu lực', () => {
  const e = ev({ rec_type: 'weekly', rec_days: [1, 3, 5], start_date: '2026-09-07', until_date: '2026-09-25' });
  assert.deepEqual(days(expand(e, '2026-09-01', '2026-10-31')), ['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23', '2026-09-25']);
});
test('lặp hằng ngày, qua năm', () => {
  const e = ev({ rec_type: 'daily', start_date: '2026-12-30' });
  assert.deepEqual(days(expand(e, '2026-12-29', '2027-01-02')), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
});
test('lặp hằng năm theo dương lịch; 29/02 rơi vào 28/02 ở năm thường', () => {
  const e = ev({ rec_type: 'yearly', start_date: '2020-02-29', all_day: true });
  assert.deepEqual(days(expand(e, '2020-01-01', '2025-12-31')), ['2020-02-29', '2021-02-28', '2022-02-28', '2023-02-28', '2024-02-29', '2025-02-28']);
  const b = ev({ rec_type: 'yearly', start_date: '2015-10-04' });
  assert.deepEqual(days(expand(b, '2026-10-01', '2027-10-31')), ['2026-10-04', '2027-10-04']);
  assert.deepEqual(days(expand(b, '2014-01-01', '2014-12-31')), []);
});
test('sự kiện một lần', () => {
  const e = ev({ rec_type: 'none', start_date: '2026-10-10' });
  assert.deepEqual(days(expand(e, '2026-10-10', '2026-10-10')), ['2026-10-10']);
  assert.deepEqual(days(expand(e, '2026-10-11', '2026-12-10')), []);
});
test('ngoại lệ: xóa một ngày, sửa riêng một ngày', () => {
  const e = ev({ rec_type: 'weekly', rec_days: [2], start_date: '2026-10-01' });
  const ex = new Map([['2026-10-13', { action: 'skip' }], ['2026-10-20', { action: 'edit', title: 'Đổi', start_time: '09:00', end_time: '10:00', location: 'Phòng 2' }]]);
  const out = expand(e, '2026-10-01', '2026-10-27', ex);
  assert.deepEqual(days(out), ['2026-10-06', '2026-10-20', '2026-10-27']);
  const edited = out.find((o) => o.day === '2026-10-20');
  assert.deepEqual([edited.title, edited.start, edited.end, edited.location, edited.edited], ['Đổi', '09:00', '10:00', 'Phòng 2', true]);
  assert.equal(out[0].title, 'X');
});
test('lặp âm lịch hằng năm (giỗ 15/7) và ngày 30 của tháng thiếu', () => {
  const g = ev({ rec_type: 'yearly_lunar', lunar_month: 7, lunar_day: 15, all_day: true, start_date: '2020-01-01' });
  assert.deepEqual(days(expand(g, '2025-01-01', '2026-12-31')), [lunarToSolar(15, 7, 2025), lunarToSolar(15, 7, 2026)]);
  // 30 tháng Chạp: luôn rơi vào ngày trước Tết (29 nếu tháng Chạp thiếu)
  const c = ev({ rec_type: 'yearly_lunar', lunar_month: 12, lunar_day: 30, all_day: true, start_date: '2020-01-01' });
  for (let y = 2020; y <= 2034; y++) {
    const tet = lunarToSolar(1, 1, y + 1);
    const hit = days(expand(c, `${y}-06-01`, `${y + 1}-03-31`));
    assert.deepEqual(hit, [vn.addDays(tet, -1)], `30 Chạp ${y}`);
  }
});
test('lặp âm lịch hằng tháng (mùng 1, rằm) kể cả tháng nhuận', () => {
  const r = ev({ rec_type: 'monthly_lunar', lunar_day: 15, all_day: true, start_date: '2020-01-01' });
  // năm âm 2025 có tháng 6 nhuận => 13 lần rằm
  const hits = expand(r, '2025-01-29', '2026-02-16');
  assert.equal(hits.length, 13);
  const m1 = ev({ rec_type: 'monthly_lunar', lunar_day: 1, all_day: true, start_date: '2020-01-01' });
  assert.equal(expand(m1, '2026-02-17', '2027-02-05').length, 12);
  assert.ok(hits.every((h) => solarToLunar(h.day).day === 15));
});
test('lặp âm lịch tôn trọng ngày bắt đầu', () => {
  const g = ev({ rec_type: 'yearly_lunar', lunar_month: 1, lunar_day: 1, all_day: true, start_date: '2027-01-01' });
  assert.deepEqual(days(expand(g, '2025-01-01', '2028-12-31')), ['2027-02-06', '2028-01-26']);
});
test('tuần: thứ trong tuần theo ngày VN, gần nửa đêm', () => {
  const e = ev({ rec_type: 'weekly', rec_days: [1], start_date: '2026-01-01' });
  assert.equal(matchesDay(e, vn.todayVN(Date.parse('2026-10-04T17:00:00Z')), makeLunarCache()), true); // 00:00 thứ hai 05/10 giờ VN
  assert.equal(matchesDay(e, vn.todayVN(Date.parse('2026-10-04T16:59:00Z')), makeLunarCache()), false); // vẫn chủ nhật 04/10
});
test('parseEvent kiểm tra đầu vào', () => {
  const ok = parseEvent({ title: ' Học  múa 🎀 ', kind: 'nang_khieu', start: '16:00', end: '17:00', startDate: '2026-10-05', recType: 'weekly', recDays: [2, 4, 2], notifyOffsets: [30, 0, 30] }, '2026-10-04');
  assert.equal(ok.title, 'Học múa 🎀'); assert.deepEqual(ok.rec_days, [2, 4]); assert.deepEqual(ok.notify_offsets, [30, 0]);
  const bad = (b) => assert.throws(() => parseEvent({ title: 'a', start: '07:00', startDate: '2026-10-05', ...b }, '2026-10-04'));
  bad({ title: '' }); bad({ start: '25:00' }); bad({ start: '08:00', end: '07:00' }); bad({ recType: 'weekly' }); bad({ recType: 'weekly', recDays: [8] });
  bad({ recType: 'yearly_lunar', lunarMonth: 13, lunarDay: 1 }); bad({ notifyOffsets: [7] }); bad({ kind: 'la' }); bad({ startDate: '2026-02-30' });
  bad({ recType: 'daily', untilDate: '2026-10-01' }); bad({ title: 'x'.repeat(81) }); bad({ childIds: ['không phải uuid'] });
});

// ---------- thời khóa biểu ----------
test('thời khóa biểu: gộp tiết liền nhau và các thứ cùng giờ', () => {
  const periods = [{ n: 1, start: '07:00', end: '07:45' }, { n: 2, start: '07:50', end: '08:35' }, { n: 3, start: '08:50', end: '09:35' }];
  const cells = [
    { weekday: 1, period: 1, subject: 'Toán' }, { weekday: 1, period: 2, subject: 'Toán' }, { weekday: 1, period: 3, subject: 'Văn' },
    { weekday: 3, period: 1, subject: 'Toán' }, { weekday: 3, period: 2, subject: 'Toán' }, { weekday: 3, period: 3, subject: 'Anh' },
  ];
  const out = buildTimetableEvents(periods, cells);
  const toan = out.find((o) => o.title === 'Toán');
  assert.deepEqual([toan.start, toan.end, toan.days], ['07:00', '08:35', [1, 3]]);
  assert.equal(out.length, 3);
  assert.deepEqual(out.find((o) => o.title === 'Văn').days, [1]);
});

// ---------- leo thang ----------
test('mốc leo thang: bảng thời gian đầy đủ', () => {
  const T = Date.parse('2026-10-05T09:30:00Z'); // 16:30 giờ VN
  const esc = normEsc({});
  assert.deepEqual(stepOffsets(esc), [[1, -30], [2, -20], [3, -10], [4, -5], [5, 10]]);
  const at = (min) => dueSteps(T, T + min * 60_000, esc);
  assert.deepEqual(at(-31), []); assert.deepEqual(at(-30), [1]); assert.deepEqual(at(-25), [1]); assert.deepEqual(at(-20), [1, 2]);
  assert.deepEqual(at(-10), [1, 2, 3]); assert.deepEqual(at(-5), [1, 2, 3, 4]); assert.deepEqual(at(0), [1, 2, 3, 4]); assert.deepEqual(at(9), [1, 2, 3, 4]);
  assert.deepEqual(at(10), [1, 2, 3, 4, 5]); assert.deepEqual(at(90), [1, 2, 3, 4, 5]); assert.deepEqual(at(91), []);
  const custom = normEsc({ esc: { t1: 60, t2: 40, t3: 20, t4: 10, after: 5 } });
  assert.deepEqual(dueSteps(T, T - 45 * 60_000, custom), [1]);
});

// ---------- ICS ----------
test('ICS: thoát ký tự, gập dòng theo octet, CRLF, giờ UTC', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'Học tiếng Anh với cô Hương ở trường quốc tế rất dài dòng ' + 'ơ'.repeat(60);
  const folded = fold('SUMMARY:' + escapeText(long));
  for (const l of folded.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, l);
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), 'SUMMARY:' + escapeText(long)); // gỡ gập ra đúng nguyên bản
  const out = buildIcs({ name: 'Nhà; Cún', nowMs: Date.parse('2026-10-04T00:00:00Z'), items: [
    { uid: 'a-1', day: '2026-10-05', allDay: false, start: '07:30', end: '08:15', title: 'Toán, Văn', location: 'Lớp 3A', description: 'Cần mang: sách\nbút' },
    { uid: 'b-1', day: '2026-10-06', allDay: true, title: 'Rằm 🌕' },
  ] });
  assert.ok(out.endsWith('\r\n')); assert.ok(!/[^\r]\n/.test(out), 'mọi xuống dòng đều là CRLF');
  assert.ok(out.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')); assert.ok(out.includes('END:VCALENDAR'));
  assert.ok(out.includes('DTSTART:20261005T003000Z')); assert.ok(out.includes('DTEND:20261005T011500Z'));
  assert.ok(out.includes('DTSTART;VALUE=DATE:20261006\r\nDTEND;VALUE=DATE:20261007'));
  assert.ok(out.includes('SUMMARY:Toán\\, Văn')); assert.ok(out.includes('DESCRIPTION:Cần mang: sách\\nbút'));
  assert.equal((out.match(/BEGIN:VEVENT/g) || []).length, 2); assert.equal((out.match(/END:VEVENT/g) || []).length, 2);
  assert.ok(out.includes('X-WR-CALNAME:Nhà\\; Cún'));
});

// ---------- AI ----------
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
test('AI: kiểm tra ảnh tải lên', () => {
  assert.equal(ai.checkImage(PNG).mime, 'image/png');
  assert.equal(ai.checkImage('data:image/png;base64,' + PNG).mime, 'image/png');
  assert.throws(() => ai.checkImage(Buffer.from('không phải ảnh'.repeat(20)).toString('base64')), /JPEG, PNG/);
  assert.throws(() => ai.checkImage('abc'), /ảnh/);
  assert.throws(() => ai.checkImage('!!!'.repeat(50)), /không hợp lệ/);
  assert.throws(() => ai.checkImage('A'.repeat(6 * 1024 * 1024)), /quá lớn/);
});
test('AI: kiểm tra nghiêm đầu ra', () => {
  const good = ai.validateTimetable(JSON.stringify({ periods: [{ n: 1, start: '07:00', end: '07:45' }, { n: 2, start: '7:50', end: '08:35' }, { n: 1, start: '09:00', end: '09:45' }], cells: [
    { weekday: 1, period: 1, subject: '  Toán  ' }, { weekday: 1, period: 1, subject: 'Trùng' }, { weekday: 9, period: 1, subject: 'Sai thứ' }, { weekday: 2, period: 0, subject: 'Sai tiết' },
    { weekday: 2, period: 2, subject: 'Văn\u0000<script>' }, { weekday: 3, period: 1, subject: '' }, { weekday: 3, period: 2, subject: 5 }, null, 'x', { weekday: 4, period: 3, subject: 'x'.repeat(100) },
  ] }));
  assert.deepEqual(good.periods, [{ n: 1, start: '07:00', end: '07:45' }]);
  assert.deepEqual(good.cells.map((c) => [c.weekday, c.period]), [[1, 1], [2, 2], [4, 3]]);
  assert.equal(good.cells[0].subject, 'Toán'); assert.ok(!/[<>\u0000]/.test(good.cells[1].subject)); assert.equal([...good.cells[2].subject].length, 40);
  assert.deepEqual(ai.validateTimetable('```json\n{"periods":[],"cells":[{"weekday":1,"period":1,"subject":"Toán"}]}\n```').cells.length, 1);
  for (const bad of ['không phải json', '[]', 'null', '{"cells":[]}', '{"cells":[{"weekday":0,"period":1,"subject":"a"}]}', '{"cells":"x"}']) assert.throws(() => ai.validateTimetable(bad), (e) => e.status === 502 || e.status === 422, bad);
  const many = { cells: Array.from({ length: 500 }, (_, i) => ({ weekday: (i % 7) + 1, period: (i % 14) + 1, subject: 'm' + i })) };
  assert.ok(ai.validateTimetable(JSON.stringify(many)).cells.length <= 98);
});
test('AI: gọi Gemini đúng giao thức, thử lại 3 lần khi 429/503', async () => {
  const mk = (statuses, body) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); const s = statuses[Math.min(calls.length - 1, statuses.length - 1)]; return { status: s, ok: s === 200, json: async () => body }; }; f.calls = calls; return f; };
  const body = { candidates: [{ content: { parts: [{ text: '{"periods":[],"cells":[{"weekday":1,"period":1,"subject":"Toán"}]}' }] } }] };
  const f1 = mk([429, 503, 200], body);
  const r = await ai.scanTimetable({ mime: 'image/png', base64: PNG }, f1);
  assert.equal(f1.calls.length, 3); assert.equal(r.cells[0].subject, 'Toán');
  const c = f1.calls[0];
  assert.equal(c.init.headers['x-goog-api-key'], 'khoa-thu'); assert.ok(c.url.includes('/models/gemini-flash-latest:generateContent')); assert.ok(!c.url.includes('khoa-thu'), 'khóa không nằm trong URL');
  const sent = JSON.parse(c.init.body);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json'); assert.equal(sent.contents[0].parts[1].inline_data.mime_type, 'image/png');
  const f2 = mk([503, 503, 503], body);
  await assert.rejects(ai.scanTimetable({ mime: 'image/png', base64: PNG }, f2), (e) => e.code === 'ai_busy');
  assert.equal(f2.calls.length, 3);
  const f3 = mk([400], body);
  await assert.rejects(ai.scanTimetable({ mime: 'image/png', base64: PNG }, f3), (e) => e.code === 'ai_failed');
  assert.equal(f3.calls.length, 1);
  const f4 = async () => { throw new Error('mạng đứt'); };
  await assert.rejects(ai.scanTimetable({ mime: 'image/png', base64: PNG }, f4), (e) => e.code === 'ai_failed');
});

// ---------- Web Push ----------
test('Web Push: chỉ nhận endpoint của dịch vụ đẩy thật (chống SSRF)', () => {
  assert.ok(checkEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(checkEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'));
  assert.ok(checkEndpoint('https://web.push.apple.com/abc'));
  assert.ok(checkEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc'));
  for (const bad of ['https://evil.googleapis.com/x', 'https://storage.googleapis.com/x', 'https://notify.windows.com.evil.com/x', 'http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'file:///etc/passwd', 'abc', 'https://169.254.169.254/']) {
    assert.throws(() => checkEndpoint(bad), (e) => e.status === 400, bad);
  }
});
