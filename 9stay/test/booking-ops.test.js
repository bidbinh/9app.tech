import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createBooking, cancelBooking, moveBooking, unitAvailability } from '../src/bookings.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const book = (over = {}) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Lan', adults: 2, ...over }, { now: NOW }));
const activeNights = async (bookingId) => (await db.query('SELECT unit_id, night FROM room_nights WHERE booking_id=$1 AND active ORDER BY night', [bookingId])).map((r) => `${r.unit_id === w.unitId ? 'A' : 'B'}:${r.night}`);
const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);

test('hủy đơn: trả đêm về bán lại được, đặt lại cùng đêm thành công', async () => {
  const b = await book();
  const r = await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id, reason: 'khách đổi ý' }));
  assert.deepEqual(r, { id: b.id, status: 'huy' });
  assert.deepEqual(await activeNights(b.id), []);
  const again = await book({ guestName: 'Hà' });
  assert.deepEqual(again.nights, ['2026-11-12', '2026-11-13']);
  const [row] = await db.query('SELECT status, version FROM bookings WHERE id=$1', [b.id]);
  assert.equal(row.status, 'huy');
  assert.equal(row.version, 2);
});

test('hủy hai lần không lỗi và không tăng version lần hai', async () => {
  const b = await book();
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id }));
  const r2 = await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id }));
  assert.equal(r2.status, 'huy');
  const [row] = await db.query('SELECT version FROM bookings WHERE id=$1', [b.id]);
  assert.equal(row.version, 2);
  const ev = await db.query("SELECT count(*)::int AS n FROM booking_events WHERE booking_id=$1 AND kind='cancelled'", [b.id]);
  assert.equal(ev[0].n, 1);
});

test('không hủy được đơn đã nhận phòng hoặc đã trả; đơn lạ/org khác: 404', async () => {
  const b = await book();
  await db.query("UPDATE bookings SET status='da_nhan' WHERE id=$1", [b.id]);
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id })), 'cannot_cancel', 409);
  await db.query("UPDATE bookings SET status='het_han' WHERE id=$1", [b.id]);
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id })), 'booking_closed', 409);
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: '00000000-0000-0000-0000-000000000000' })), 'booking_not_found', 404);
  const other = (await db.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0];
  await fail(db.tx((c) => cancelBooking(c, { orgId: other.id, bookingId: b.id })), 'booking_not_found', 404);
});

test('dời sang ngày khác cùng căn, gồm dời gối lên chính đêm cũ của mình', async () => {
  const b = await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  const r = await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-13', checkout: '2026-11-16', expectedVersion: 1 }, { now: NOW }));
  assert.equal(r.version, 2);
  assert.deepEqual(r.nights, ['2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(await activeNights(b.id), ['A:2026-11-13', 'A:2026-11-14', 'A:2026-11-15']);
  const av = await db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-12', to: '2026-11-13' }));
  assert.equal(av[0].state, 'open'); // đêm 12 đã được trả lại
});

test('dời sang căn khác', async () => {
  const b = await book();
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unit2Id, checkin: '2026-11-12', checkout: '2026-11-14' }, { now: NOW }));
  assert.deepEqual(await activeNights(b.id), ['B:2026-11-12', 'B:2026-11-13']);
  const again = await book({ guestName: 'Hà' }); // căn A trống lại
  assert.equal(again.status, 'giu');
});

test('dời bị trùng thì hoàn tác nguyên trạng: đêm cũ còn, version không đổi', async () => {
  const a = await book({ checkin: '2026-11-05', checkout: '2026-11-07' });
  await book({ checkin: '2026-11-07', checkout: '2026-11-09', guestName: 'Hà' });
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: a.id, unitId: w.unitId, checkin: '2026-11-06', checkout: '2026-11-08' }, { now: NOW })), 'unit_taken', 409);
  assert.deepEqual(await activeNights(a.id), ['A:2026-11-05', 'A:2026-11-06']);
  const [row] = await db.query('SELECT version FROM bookings WHERE id=$1', [a.id]);
  assert.equal(row.version, 1);
});

test('dời với version cũ: stale; đơn đã nhận: cannot_move; đêm chưa mở bán: not_released', async () => {
  const b = await book();
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-15', checkout: '2026-11-16', expectedVersion: 1 }, { now: NOW }));
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-17', checkout: '2026-11-18', expectedVersion: 1 }, { now: NOW })), 'stale', 409);
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-12-01', checkout: '2026-12-02' }, { now: NOW })), 'not_released', 409);
  await db.query("UPDATE bookings SET status='da_nhan' WHERE id=$1", [b.id]);
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-17', checkout: '2026-11-18' }, { now: NOW })), 'cannot_move', 409);
});

test('dời kiểm lại sức chứa và ngày quá khứ như đặt mới', async () => {
  const b = await book({ adults: 4 });
  await db.query('UPDATE units SET capacity_max=3 WHERE id=$1', [w.unit2Id]);
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unit2Id, checkin: '2026-11-12', checkout: '2026-11-14' }, { now: NOW })), 'over_capacity');
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-10-01', checkout: '2026-10-03' }, { now: NOW })), 'past_date');
});

test('sự kiện hủy/dời chỉ chứa id và ngày, không chứa tên hay SĐT', async () => {
  const b = await book({ guestName: 'Nguyễn Văn Bí Mật', guestPhone: '0912345678' });
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-15', checkout: '2026-11-16' }, { now: NOW }));
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id, reason: 'đổi ý' }));
  const all = JSON.stringify(await db.query('SELECT kind, data FROM booking_events WHERE booking_id=$1', [b.id]));
  assert.ok(!all.includes('Bí Mật') && !all.includes('0912345678'), 'sự kiện lộ dữ liệu cá nhân');
});
