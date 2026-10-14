import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown } from './helper.js';
import { bookedWorld } from './fixtures.js';
import { checkIn, checkOut } from '../src/stay.js';

before(boot);
after(shutdown);
beforeEach(async () => { await db.resetForTests(); });

const NOV15 = new Date('2026-11-15T05:00:00Z'); // 12:00 ngày 15/11 giờ Việt Nam
const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);
const statusOf = async (id) => (await db.query('SELECT status FROM bookings WHERE id=$1', [id]))[0].status;

test('nhận phòng chỉ từ da_coc: đơn mới giữ chỗ (giu) bị từ chối', async () => {
  const w = await bookedWorld({ pay: 'none' });
  await fail(db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id })), 'cannot_check_in', 409);
  assert.equal(await statusOf(w.booking.id), 'giu');
});

test('đơn đã cọc nhận phòng được; gọi lại là idempotent', async () => {
  const w = await bookedWorld({ pay: 'full' });
  const a = await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  assert.deepEqual({ status: a.status, changed: a.changed }, { status: 'da_nhan', changed: true });
  const v1 = (await db.query('SELECT version FROM bookings WHERE id=$1', [w.booking.id]))[0].version;
  const b = await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  assert.equal(b.changed, false);
  assert.equal((await db.query('SELECT version FROM bookings WHERE id=$1', [w.booking.id]))[0].version, v1);
  const ev = await db.query("SELECT count(*)::int AS n FROM booking_events WHERE booking_id=$1 AND kind='checked_in'", [w.booking.id]);
  assert.equal(ev[0].n, 1);
});

test('trả phòng khi chưa nhận phòng bị từ chối; khi còn nợ bị balance_due kèm số nợ', async () => {
  const w = await bookedWorld({ pay: 'deposit' });
  await fail(db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: NOV15 })), 'cannot_check_out', 409);
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await assert.rejects(
    db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: NOV15 })),
    (e) => e.code === 'balance_due' && e.status === 409 && e.detail.due === 1501000,
  );
  assert.equal(await statusOf(w.booking.id), 'da_nhan');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM settlements'))[0].n, 0);
});

test('id sai định dạng và đơn lạ', async () => {
  const w = await bookedWorld({ pay: 'full' });
  await fail(db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: 'xxx' })), 'bad_id');
  await fail(db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: '00000000-0000-0000-0000-000000000000' }, { now: NOV15 })), 'booking_not_found', 404);
});
