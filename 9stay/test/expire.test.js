import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createOrg } from '../src/inventory.js';
import { createBooking, moveBooking, expireHolds, unitAvailability } from '../src/bookings.js';
import { blockNights } from '../src/inventory.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const HOUR = 3600 * 1000;
const book = (over = {}, now = NOW) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1, ...over }, { now }));
const later = new Date(NOW.getTime() + 25 * HOUR); // quá hạn giữ chỗ mặc định 24 giờ
const statusOf = async (id) => (await db.query('SELECT status FROM bookings WHERE id=$1', [id]))[0].status;
const activeCount = async () => (await db.query('SELECT count(*)::int AS n FROM room_nights WHERE active'))[0].n;

test('expireHolds chỉ nhả đơn giu quá hạn; da_coc và giu còn hạn giữ nguyên; trả lại các đêm', async () => {
  const held = await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  const paid = await book({ checkin: '2026-11-20', checkout: '2026-11-22', status: 'da_coc' });
  const fresh = await book({ checkin: '2026-11-25', checkout: '2026-11-26' }, new Date(later.getTime() - HOUR)); // hạn còn 23 giờ tính từ later
  const ids = await db.tx((c) => expireHolds(c, { orgId: w.orgId, now: later }));
  assert.deepEqual(ids, [held.id]);
  assert.equal(await statusOf(held.id), 'het_han');
  assert.equal(await statusOf(paid.id), 'da_coc');
  assert.equal(await statusOf(fresh.id), 'giu');
  assert.equal(await activeCount(), 3); // 0 của held, 2 của paid, 1 của fresh
  const ev = await db.query("SELECT data FROM booking_events WHERE booking_id=$1 AND kind='expired'", [held.id]);
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].data, {});
  const [v] = await db.query('SELECT version FROM bookings WHERE id=$1', [held.id]);
  assert.equal(v.version, 2);
});

test('expireHolds chạy lại không làm gì thêm; không đụng org khác', async () => {
  const held = await book();
  const other = await db.tx((c) => createOrg(c, { name: 'Khác' }));
  assert.deepEqual(await db.tx((c) => expireHolds(c, { orgId: other.id, now: later })), []);
  assert.equal(await statusOf(held.id), 'giu');
  assert.equal((await db.tx((c) => expireHolds(c, { orgId: w.orgId, now: later }))).length, 1);
  assert.deepEqual(await db.tx((c) => expireHolds(c, { orgId: w.orgId, now: later })), []);
});

test('đặt mới đè lên đêm của đơn giu quá hạn được, đơn cũ thành het_han', async () => {
  const old = await book();
  const fresh = await book({ guestName: 'Mới' }, later);
  assert.equal(fresh.status, 'giu');
  assert.equal(await statusOf(old.id), 'het_han');
});

test('đơn giu CÒN hạn vẫn chặn đặt mới (unit_taken)', async () => {
  await book();
  await assert.rejects(book({ guestName: 'Mới' }, new Date(NOW.getTime() + 2 * HOUR)), (e) => e.code === 'unit_taken');
});

test('chủ chặn được đêm của đơn giu quá hạn nhưng không chặn được đêm của đơn còn hạn', async () => {
  const old = await book();
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-12'], kind: 'owner_use', now: later }));
  assert.equal(await statusOf(old.id), 'het_han');
  const [rel] = await db.query("SELECT kind FROM owner_releases WHERE unit_id=$1 AND night='2026-11-12'", [w.unitId]);
  assert.equal(rel.kind, 'owner_use');

  await book({ checkin: '2026-11-20', checkout: '2026-11-21' });
  await assert.rejects(
    db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-20'], kind: 'owner_use', now: new Date(NOW.getTime() + HOUR) })),
    (e) => e.code === 'night_booked',
  );
});

test('dời đơn giu đã quá hạn bị hold_expired; còn hạn thì dời được', async () => {
  const b = await book();
  await assert.rejects(
    db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-15', checkout: '2026-11-16' }, { now: later })),
    (e) => e.code === 'hold_expired' && e.status === 409,
  );
  const r = await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-15', checkout: '2026-11-16' }, { now: new Date(NOW.getTime() + HOUR) }));
  assert.equal(r.version, 2);
});

test('dời đơn đè lên đơn giu quá hạn của người khác được', async () => {
  const stale = await book({ checkin: '2026-11-15', checkout: '2026-11-17', guestName: 'Cũ' });
  const mover = await book({ checkin: '2026-11-05', checkout: '2026-11-07', guestName: 'Dời' }, new Date(NOW.getTime() + 20 * HOUR));
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: mover.id, unitId: w.unitId, checkin: '2026-11-15', checkout: '2026-11-16' }, { now: later }));
  assert.equal(await statusOf(stale.id), 'het_han');
});

test('unitAvailability: đơn giu là held kèm holdUntil, đơn da_coc là booked', async () => {
  const held = await book({ checkin: '2026-11-12', checkout: '2026-11-13' });
  const paid = await book({ checkin: '2026-11-13', checkout: '2026-11-14', status: 'da_coc' });
  const av = await db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-12', to: '2026-11-14' }));
  assert.equal(av[0].state, 'held');
  assert.equal(av[0].bookingId, held.id);
  assert.equal(new Date(av[0].holdUntil).getTime(), new Date(held.holdUntil).getTime());
  assert.equal(av[1].state, 'booked');
  assert.equal(av[1].bookingId, paid.id);
  assert.equal(av[1].holdUntil, undefined);
});
