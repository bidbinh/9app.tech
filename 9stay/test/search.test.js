import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createRoomType, createUnit, openNights, blockNights, createOrg } from '../src/inventory.js';
import { createBooking, cancelBooking } from '../src/bookings.js';
import { freeUnits, roomTypeAvailability, createBookingForType } from '../src/search.js';
import { ensureRatePlans, setRates, createQuote } from '../src/pricing.js';
import { recordPayment } from '../src/payments.js';

before(boot);
after(shutdown);
let w, family;
const HOUR = 3600 * 1000;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed();
  // thêm loại Family (tối đa 6 người) với một căn C1
  family = await db.tx(async (c) => {
    const rt = await createRoomType(c, { orgId: w.orgId, name: 'Family', capacityStd: 3, capacityMax: 6 });
    const u = await createUnit(c, { orgId: w.orgId, buildingId: w.buildingId, ownerId: w.ownerId, roomTypeId: rt.id, code: 'C1', capacityStd: 3, capacityMax: 6 });
    await openNights(c, { orgId: w.orgId, unitId: u.id, from: '2026-11-01', to: '2026-12-01' });
    return { roomTypeId: rt.id, unitId: u.id };
  });
});

const free = (over = {}, now = NOW) => db.tx((c) => freeUnits(c, { orgId: w.orgId, checkin: '2026-11-12', checkout: '2026-11-14', ...over }, { now }));
const codes = (rows) => rows.map((r) => r.code);
const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);
const mk = (over = {}, now = NOW) => db.tx((c) => createBookingForType(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 2, ...over }, { now }));

test('ban đầu cả 3 căn đều trống; thống kê theo loại phòng gồm cả loại hết phòng (0)', async () => {
  assert.deepEqual(codes(await free()), ['A1205', 'A1206', 'C1']);
  const t = await db.tx((c) => roomTypeAvailability(c, { orgId: w.orgId, checkin: '2026-11-12', checkout: '2026-11-14' }, { now: NOW }));
  assert.deepEqual(t.map((x) => [x.name, x.free]), [['Deluxe', 2], ['Family', 1]]);
});

test('đêm có khách thì căn không trống; khoảng liền kề (trả phòng rồi đặt lại cùng ngày) thì trống', async () => {
  await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1 }, { now: NOW }));
  assert.deepEqual(codes(await free()), ['A1206', 'C1']);
  assert.deepEqual(codes(await free({ checkin: '2026-11-13', checkout: '2026-11-15' })), ['A1206', 'C1']);
  assert.deepEqual(codes(await free({ checkin: '2026-11-14', checkout: '2026-11-16' })), ['A1205', 'A1206', 'C1']);
  assert.deepEqual(codes(await free({ checkin: '2026-11-10', checkout: '2026-11-12' })), ['A1205', 'A1206', 'C1']);
});

test('đêm chưa mở bán, chủ tự dùng hoặc bị chặn: không trống', async () => {
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unit2Id, nights: ['2026-11-13'], kind: 'owner_use' }));
  assert.deepEqual(codes(await free()), ['A1205', 'C1']);
  assert.deepEqual(codes(await free({ checkin: '2026-11-30', checkout: '2026-12-02' })), []); // 12/01 chưa mở bán
});

test('sức chứa: 5 người chỉ còn Family; 7 người không còn căn nào; lọc theo loại phòng', async () => {
  assert.deepEqual(codes(await free({ adults: 4, children: 1 })), ['C1']);
  assert.deepEqual(codes(await free({ adults: 6, children: 1 })), []);
  assert.deepEqual(codes(await free({ roomTypeId: w.roomTypeId })), ['A1205', 'A1206']);
  await fail(free({ adults: 0 }), 'bad_guest');
  await fail(free({ roomTypeId: 'xxx' }), 'bad_id');
  await fail(free({ checkin: '2026-11-14', checkout: '2026-11-12' }), 'bad_dates');
});

test('đơn giữ chỗ quá hạn chưa thanh toán coi như trống; còn hạn thì không; quá hạn nhưng đã thu tiền thì không', async () => {
  const b = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1 }, { now: NOW }));
  const later = new Date(NOW.getTime() + 25 * HOUR);
  assert.deepEqual(codes(await free({}, new Date(NOW.getTime() + HOUR))), ['A1206', 'C1']); // còn hạn
  assert.deepEqual(codes(await free({}, later)), ['A1205', 'A1206', 'C1']); // quá hạn, chưa có tiền
  // đơn khác: quá hạn nhưng đã nhận tiền một phần
  const plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-12-01', price: 650000 }));
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin: '2026-11-20', checkout: '2026-11-22', adults: 2 }, { now: NOW }));
  const paid = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-20', checkout: '2026-11-22', guestName: 'T', adults: 2, quoteId: q.id }, { now: NOW }));
  await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: paid.id, kind: 'deposit', amount: 100000, receivedOn: '2026-10-14', ref: 'p' }));
  assert.deepEqual(codes(await free({ checkin: '2026-11-20', checkout: '2026-11-22' }, later)), ['A1205', 'C1']); // A1206 còn bị giữ vì đã thu tiền
  assert.ok(b.id);
});

test('đơn đã hủy không chiếm căn', async () => {
  const b = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1 }, { now: NOW }));
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id }));
  assert.deepEqual(codes(await free()), ['A1205', 'A1206', 'C1']);
});

test('không lẫn org khác', async () => {
  const other = await db.tx((c) => createOrg(c, { name: 'Khác' }));
  assert.deepEqual(await db.tx((c) => freeUnits(c, { orgId: other.id, checkin: '2026-11-12', checkout: '2026-11-14' }, { now: NOW })), []);
});

test('đặt theo loại phòng tự gán căn trống đầu tiên theo mã; đầy thì no_availability (409)', async () => {
  const a = await mk();
  const b = await mk({ guestName: 'K2' });
  assert.deepEqual([a.unitCode, b.unitCode], ['A1205', 'A1206']);
  assert.equal(a.unitId, w.unitId);
  await fail(mk({ guestName: 'K3' }), 'no_availability', 409);
  // ngày khác vẫn đặt được
  assert.equal((await mk({ checkin: '2026-11-14', checkout: '2026-11-15' })).unitCode, 'A1205');
});

test('đặt theo loại: kiểm đầu vào vẫn áp dụng (sức chứa, ngày quá khứ, khách), không nuốt lỗi nghiệp vụ khác', async () => {
  await fail(mk({ adults: 5 }), 'no_availability'); // Deluxe tối đa 4 người
  await fail(mk({ checkin: '2026-10-01', checkout: '2026-10-03' }), 'past_date');
  await fail(mk({ guestName: '' }), 'bad_guest');
  await fail(mk({ roomTypeId: 'xxx' }), 'bad_id');
  const f = await mk({ roomTypeId: family.roomTypeId, adults: 5 });
  assert.equal(f.unitCode, 'C1');
});

test('đặt theo loại đồng thời: 6 khách cho 2 căn Deluxe: đúng 2 thành công ở 2 căn khác nhau, 4 còn lại no_availability', async () => {
  const rs = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => mk({ guestName: 'K' + i })));
  const ok = rs.filter((r) => r.status === 'fulfilled');
  assert.equal(ok.length, 2);
  assert.deepEqual(new Set(ok.map((r) => r.value.unitCode)), new Set(['A1205', 'A1206']));
  for (const r of rs.filter((x) => x.status === 'rejected')) assert.equal(r.reason.code, 'no_availability');
  const dup = await db.query('SELECT unit_id, night FROM room_nights WHERE active GROUP BY unit_id, night HAVING count(*) > 1');
  assert.equal(dup.length, 0);
  // thất bại không để lại đơn nửa vời
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings'))[0].n, 2);
});
