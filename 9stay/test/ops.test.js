import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createContract } from '../src/inventory.js';
import { ensureRatePlans, setRates, createQuote } from '../src/pricing.js';
import { createBooking } from '../src/bookings.js';
import { recordPayment } from '../src/payments.js';
import { checkIn, checkOut } from '../src/stay.js';
import { listTasks, setTaskStatus, createManualTask } from '../src/housekeeping.js';
import { parseIcsNights, isPrivateIp, validateFeedUrl, addFeed, applyFeed, ensureExportToken, exportIcs, setFeedStatus } from '../src/ical.js';
import { openNights } from '../src/inventory.js';
import { occupancyReport } from '../src/reports.js';
import { cleanup } from '../src/maintenance.js';

before(boot);
after(shutdown);
let w, plans;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed({ from: '2026-10-14', to: '2026-12-01' });
  plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-10-14', to: '2026-12-01', price: 650000 }));
  for (const unitId of [w.unitId, w.unit2Id]) await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId, validFrom: '2026-01-01' }));
});

async function stayFull(unitId, checkin, checkout) {
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin, checkout, adults: 2 }, { now: NOW }));
  const b = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId, checkin, checkout, guestName: 'Khách Bí Mật', guestPhone: '0912345678', adults: 2, quoteId: q.id }, { now: NOW }));
  await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: b.id, kind: 'payment', amount: q.total, receivedOn: '2026-10-14', ref: 'p' + b.code }));
  return b;
}

// ---- Buồng phòng ----
test('trả phòng sinh đúng một việc dọn; gọi lại không sinh thêm', async () => {
  const b = await stayFull(w.unitId, '2026-10-14', '2026-10-16');
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: b.id }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: b.id }, { now: NOW }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: b.id }, { now: NOW }));
  const rows = await db.query('SELECT unit_id, status, due_date FROM housekeeping_tasks');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unit_id, w.unitId);
  assert.equal(rows[0].status, 'todo');
  assert.equal(rows[0].due_date, '2026-10-14');
});

test('danh sách việc dọn không có tên khách, SĐT hay tiền; căn có khách đến sớm lên đầu', async () => {
  await db.tx((c) => createManualTask(c, { orgId: w.orgId, unitId: w.unitId, dueDate: '2026-10-14', note: 'thay ga' }));
  await db.tx((c) => createManualTask(c, { orgId: w.orgId, unitId: w.unit2Id, dueDate: '2026-10-14' }));
  await stayFull(w.unit2Id, '2026-10-15', '2026-10-17'); // khách đến căn 2 trước
  const tasks = await db.tx((c) => listTasks(c, { orgId: w.orgId, now: NOW }));
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].unitCode, 'A1206');
  assert.equal(tasks[0].nextArrival, '2026-10-15');
  const json = JSON.stringify(tasks);
  assert.ok(!/Bí Mật|0912345678|650000|total|amount/.test(json));
});

test('đổi trạng thái việc: done ghi giờ; mở lại xóa giờ; id lạ 404; trạng thái sai 400', async () => {
  const t = await db.tx((c) => createManualTask(c, { orgId: w.orgId, unitId: w.unitId, dueDate: '2026-10-14' }));
  await db.tx((c) => setTaskStatus(c, { orgId: w.orgId, taskId: t.id, status: 'doing', by: null }, { now: NOW }));
  await db.tx((c) => setTaskStatus(c, { orgId: w.orgId, taskId: t.id, status: 'done', by: null }, { now: NOW }));
  assert.notEqual((await db.query('SELECT done_at FROM housekeeping_tasks'))[0].done_at, null);
  assert.equal((await db.tx((c) => listTasks(c, { orgId: w.orgId, now: NOW }))).length, 1, 'xong hôm nay vẫn hiện');
  await db.tx((c) => setTaskStatus(c, { orgId: w.orgId, taskId: t.id, status: 'todo', by: null }, { now: NOW }));
  assert.equal((await db.query('SELECT done_at FROM housekeeping_tasks'))[0].done_at, null);
  await assert.rejects(db.tx((c) => setTaskStatus(c, { orgId: w.orgId, taskId: crypto.randomUUID(), status: 'done' })), (e) => e.code === 'not_found');
  await assert.rejects(db.tx((c) => setTaskStatus(c, { orgId: w.orgId, taskId: t.id, status: 'xong' })), (e) => e.code === 'bad_status');
  const other = await db.tx(async (c) => (await c.query("INSERT INTO orgs(name) VALUES('X') RETURNING id"))[0].id);
  await assert.rejects(db.tx((c) => setTaskStatus(c, { orgId: other, taskId: t.id, status: 'done' })), (e) => e.code === 'not_found');
});

// ---- iCal ----
const ICS = (events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

test('phân tích iCal: nhiều dạng ngày, hủy, gập dòng, ngoài khoảng', () => {
  const text = ICS([
    ['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261108'],
    ['DTSTART:20261120T140000Z', 'DTEND:20261122T110000Z'],
    ['DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261203', 'STATUS:CANCELLED'],
    ['DTSTART;VALUE=DATE:20261210'],
    ['SUMMARY:long', ' folded', 'DTSTART;VALUE=DATE:20250101', 'DTEND;VALUE=DATE:20250105'],
  ]);
  assert.deepEqual(parseIcsNights(text, { from: '2026-10-14', to: '2027-01-01' }), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-20', '2026-11-21', '2026-12-10']);
  assert.deepEqual(parseIcsNights('rác không phải ics', { from: '2026-10-14', to: '2027-01-01' }), []);
});

test('chống SSRF: chỉ https công cộng', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '0.0.0.0']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
  for (const u of ['http://example.com/a.ics', 'https://localhost/a.ics', 'https://127.0.0.1/a.ics', 'https://user:pw@example.com/a.ics', 'https://example.com:8443/a.ics', 'ftp://example.com', 'khong-phai-url', 'https://x.internal/a']) {
    assert.throws(() => validateFeedUrl(u), (e) => e.code === 'bad_url', u);
  }
  assert.ok(validateFeedUrl('https://ical.booking.com/v1/export?t=abc'));
});

async function feed(unitId = w.unitId) {
  return (await db.tx((c) => addFeed(c, { orgId: w.orgId, unitId, name: 'Booking.com', url: 'https://ical.booking.com/v1/export?t=1' }))).id;
}
const apply = (feedId, events) => db.tx((c) => applyFeed(c, { orgId: w.orgId, feedId, text: ICS(events) }, { now: NOW }));
const kindOf = async (unitId, night) => (await db.query('SELECT kind, source FROM owner_releases WHERE unit_id = $1 AND night = $2', [unitId, night]))[0];

test('đồng bộ: chặn đêm của OTA, rồi hoàn lại khi OTA bỏ đêm', async () => {
  const id = await feed();
  const r = await apply(id, [['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261107']]);
  assert.equal(r.blocked, 2);
  assert.deepEqual({ ...(await kindOf(w.unitId, '2026-11-05')) }, { kind: 'blocked_by_anstay', source: 'ical' });
  const r2 = await apply(id, [['DTSTART;VALUE=DATE:20261106', 'DTEND;VALUE=DATE:20261107']]);
  assert.equal(r2.released, 1);
  assert.equal((await kindOf(w.unitId, '2026-11-05')).kind, 'open', 'đêm cũ về trạng thái mở như trước khi chặn');
  assert.equal((await kindOf(w.unitId, '2026-11-06')).kind, 'blocked_by_anstay');
  await apply(id, []);
  assert.equal((await kindOf(w.unitId, '2026-11-06')).kind, 'open');
});

test('đồng bộ lại không nhân đôi; đêm đã có khách là xung đột, không ghi đè đơn', async () => {
  const b = await stayFull(w.unitId, '2026-11-10', '2026-11-12');
  const id = await feed();
  const ev = [['DTSTART;VALUE=DATE:20261109', 'DTEND;VALUE=DATE:20261113']];
  const r = await apply(id, ev);
  assert.equal(r.conflicts, 2);
  assert.equal((await db.query('SELECT 1 FROM ical_nights')).length, 2, 'chỉ chặn 2 đêm trống (9 và 12)');
  const r2 = await apply(id, ev);
  assert.equal(r2.conflicts, 2);
  assert.equal((await db.query('SELECT 1 FROM ical_nights')).length, 2);
  assert.equal((await db.query("SELECT status FROM bookings WHERE id = $1", [b.id]))[0].status, 'da_coc');
  assert.equal((await db.query('SELECT last_conflicts FROM ical_feeds'))[0].last_conflicts, 2);
});

test('đêm đã bị Anstay khóa tay không bị nguồn iCal giành quyền; bỏ nguồn cũng không mở lại', async () => {
  await db.query("INSERT INTO owner_releases(unit_id, night, kind, source) VALUES($1, '2026-11-05', 'blocked_by_anstay', 'app') ON CONFLICT (unit_id, night) DO UPDATE SET kind = 'blocked_by_anstay', source = 'app'", [w.unitId]);
  const id = await feed();
  await apply(id, [['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106']]);
  assert.equal((await db.query('SELECT 1 FROM ical_nights')).length, 0);
  await apply(id, []);
  assert.deepEqual({ ...(await kindOf(w.unitId, '2026-11-05')) }, { kind: 'blocked_by_anstay', source: 'app' });
});

test('nguồn của org khác/căn lạ bị từ chối; nguồn tắt không đồng bộ', async () => {
  await assert.rejects(db.tx((c) => addFeed(c, { orgId: w.orgId, unitId: crypto.randomUUID(), name: 'x', url: 'https://a.com/x.ics' })), (e) => e.code === 'unit_not_found');
  const id = await feed();
  await db.query("UPDATE ical_feeds SET status = 'disabled'");
  await assert.rejects(apply(id, []), (e) => e.code === 'not_found');
});

test('xuất iCal: gộp đêm liên tiếp, không có tên khách, có cả đêm nhập từ OTA', async () => {
  await stayFull(w.unitId, '2026-11-10', '2026-11-13');
  const id = await feed();
  await apply(id, [['DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122']]);
  await db.query("INSERT INTO owner_releases(unit_id, night, kind, source) VALUES($1, '2026-11-25', 'owner_use', 'app') ON CONFLICT (unit_id, night) DO UPDATE SET kind = 'owner_use'", [w.unitId]);
  const token = await db.tx((c) => ensureExportToken(c, { orgId: w.orgId, unitId: w.unitId }));
  assert.equal(token, await db.tx((c) => ensureExportToken(c, { orgId: w.orgId, unitId: w.unitId })), 'token ổn định');
  const ics = await db.tx((c) => exportIcs(c, { token }, { now: NOW }));
  assert.match(ics, /DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261113/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261125/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261120/, 'đêm nhập từ OTA cũng xuất để OTA khác không bán trùng');
  assert.ok(!/Bí Mật|0912345678/.test(ics));
  await assert.rejects(db.tx((c) => exportIcs(c, { token: 'a'.repeat(48) })), (e) => e.code === 'not_found');
});

// ---- Dọn dữ liệu ----
test('dọn rác: xóa OTP/phiên/báo giá cũ chưa dùng; giữ báo giá đã dùng và dữ liệu mới', async () => {
  const used = await stayFull(w.unitId, '2026-10-20', '2026-10-21');
  assert.ok(used);
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin: '2026-11-01', checkout: '2026-11-02', adults: 2 }, { now: NOW }));
  await db.query("UPDATE quotes SET expires_at = '2026-09-01'");
  await db.query("INSERT INTO otp_codes(org_id, phone, code_hash, expires_at, created_at) VALUES($1, '0901234567', 'h', '2026-10-01', '2026-10-01'), ($1, '0901234567', 'h', '2026-10-14T04:00:00Z', '2026-10-14T02:00:00Z')", [w.orgId]);
  await db.query("INSERT INTO otp_sessions(token_hash, org_id, phone, expires_at) VALUES('a', $1, '0901234567', '2026-10-01'), ('b', $1, '0901234567', '2026-10-15')", [w.orgId]);
  const r = await db.tx((c) => cleanup(c, { now: NOW }));
  assert.deepEqual(r, { otpCodes: 1, otpSessions: 1, quotes: 1 });
  assert.equal((await db.query('SELECT 1 FROM quotes WHERE id = $1', [q.id])).length, 0);
  assert.equal((await db.query('SELECT 1 FROM quotes')).length, 1, 'báo giá đã gắn đơn được giữ');
});

const twoFeeds = async () => [await feed(), await feed()];

test('hai nguồn cùng căn: A bỏ đêm trước thì đêm vẫn bị chặn (B còn giữ); B bỏ sau thì mới mở lại như ban đầu', async () => {
  const [A, B] = await twoFeeds();
  const ev = [['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106']];
  await apply(A, ev);
  await apply(B, ev);
  await apply(A, []);
  assert.deepEqual({ ...(await kindOf(w.unitId, '2026-11-05')) }, { kind: 'blocked_by_anstay', source: 'ical' }, 'B vẫn bán đêm này');
  await apply(B, []);
  assert.deepEqual({ ...(await kindOf(w.unitId, '2026-11-05')) }, { kind: 'open', source: 'app' });
});

test('hai nguồn: B bỏ trước A cũng không để lại khóa tay giả', async () => {
  const [A, B] = await twoFeeds();
  const ev = [['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106']];
  await apply(A, ev);
  await apply(B, ev);
  await apply(B, []);
  assert.equal((await kindOf(w.unitId, '2026-11-05')).source, 'ical');
  await apply(A, []);
  assert.equal((await kindOf(w.unitId, '2026-11-05')).kind, 'open');
});

test('quản lý mở tay đêm đang bị iCal chặn: lần đồng bộ sau chặn lại', async () => {
  const id = await feed();
  const ev = [['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106']];
  await apply(id, ev);
  await db.tx((c) => openNights(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-05', to: '2026-11-06' }));
  assert.equal((await kindOf(w.unitId, '2026-11-05')).kind, 'open');
  await apply(id, ev);
  assert.equal((await kindOf(w.unitId, '2026-11-05')).kind, 'blocked_by_anstay');
});

test('tắt nguồn hoàn lại các đêm đang chặn (không kẹt vĩnh viễn), bật lại thì chặn lại', async () => {
  const id = await feed();
  const ev = [['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261107']];
  await apply(id, ev);
  await db.tx((c) => setFeedStatus(c, { orgId: w.orgId, feedId: id, status: 'disabled' }));
  assert.equal((await kindOf(w.unitId, '2026-11-05')).kind, 'open');
  assert.equal((await db.query('SELECT 1 FROM ical_nights')).length, 0);
  await db.tx((c) => setFeedStatus(c, { orgId: w.orgId, feedId: id, status: 'active' }));
  await apply(id, ev);
  assert.equal((await kindOf(w.unitId, '2026-11-06')).kind, 'blocked_by_anstay');
});

test('phân tích: sự kiện bắt đầu từ lâu vẫn chặn đêm tương lai; nhiều sự kiện dài không tốn thời gian; UTC đổi sang giờ VN', () => {
  const long = ICS([['DTSTART;VALUE=DATE:20230101', 'DTEND;VALUE=DATE:20290101']]);
  const r = parseIcsNights(long, { from: '2026-10-14', to: '2026-10-17' });
  assert.deepEqual(r, ['2026-10-14', '2026-10-15', '2026-10-16']);
  const many = ICS(Array.from({ length: 5000 }, () => ['DTSTART;VALUE=DATE:20240101', 'DTEND;VALUE=DATE:20290101']));
  const t0 = Date.now();
  parseIcsNights(many, { from: '2026-10-14', to: '2027-04-01' });
  assert.ok(Date.now() - t0 < 3000, 'phân tích phải nhanh');
  // 17:00Z ngày 5 = 00:00 ngày 6 giờ VN
  assert.deepEqual(parseIcsNights(ICS([['DTSTART:20261105T170000Z', 'DTEND:20261106T170000Z']]), { from: '2026-10-14', to: '2027-01-01' }), ['2026-11-06']);
});

test('SSRF: IPv6 nhúng IPv4/NAT64/6to4 bị chặn', () => {
  for (const ip of ['::ffff:7f00:1', '::7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::1', 'fec0::1', 'ff02::1', '198.18.0.1', '192.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
});

test('báo cáo: đêm đã bán ở OTA tính vào mẫu số và công suất, không tính doanh thu', async () => {
  const id = await feed();
  await apply(id, [['DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261107']]);
  const r = await db.tx((c) => occupancyReport(c, { orgId: w.orgId, from: '2026-11-01', to: '2026-11-11' }));
  assert.equal(r.total.external, 2);
  assert.equal(r.total.sold, 0);
  assert.equal(r.total.revenue, 0);
  assert.ok(r.total.available >= 2);
  assert.equal(r.total.occupancyPct, Math.round((2 * 1000) / r.total.available) / 10);
});

test('xuất iCal: đêm chủ chưa mở bán xuất là không có phòng; đêm mở và còn trống thì không xuất', async () => {
  const token = await db.tx((c) => ensureExportToken(c, { orgId: w.orgId, unitId: w.unitId }));
  const ics = await db.tx((c) => exportIcs(c, { token }, { now: NOW }));
  assert.ok(!/DTSTART;VALUE=DATE:20261115\r/.test(ics), 'đêm 15/11 đã mở và trống');
  assert.match(ics, /DTSTART;VALUE=DATE:20261201/, 'từ 1/12 chủ chưa mở bán nên không có phòng');
});
