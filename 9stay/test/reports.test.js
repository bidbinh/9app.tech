import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { ensureRatePlans, setRates, createQuote } from '../src/pricing.js';
import { createBooking, cancelBooking } from '../src/bookings.js';
import { recordPayment } from '../src/payments.js';
import { occupancyReport } from '../src/reports.js';
import { blockNights } from '../src/inventory.js';

before(boot);
after(shutdown);
let w, plans;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed({ from: '2026-11-01', to: '2026-11-11' }); // 2 căn x 10 đêm = 20 đêm bán được
  plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-11-11', price: 650000 }));
});

async function booked(unitId, checkin, checkout, { pay = true } = {}) {
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin, checkout, adults: 2 }, { now: NOW }));
  const b = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId, checkin, checkout, guestName: 'K', adults: 2, quoteId: q.id }, { now: NOW }));
  if (pay) await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: b.id, kind: 'deposit', amount: q.deposit, receivedOn: '2026-10-14', ref: 'p' + b.code }));
  return b;
}
const report = (from = '2026-11-01', to = '2026-11-11') => db.tx((c) => occupancyReport(c, { orgId: w.orgId, from, to }));

test('chưa có đơn: công suất 0, ADR null, RevPAR 0', async () => {
  const r = await report();
  assert.equal(r.total.available, 20);
  assert.equal(r.total.sold, 0);
  assert.equal(r.total.occupancyPct, 0);
  assert.equal(r.total.adr, null);
  assert.equal(r.total.revpar, 0);
});

test('đơn đã cọc tính; đơn giữ chỗ chưa cọc và đơn hủy không tính', async () => {
  await booked(w.unitId, '2026-11-02', '2026-11-05'); // 3 đêm x 650k = 1.950.000
  await booked(w.unit2Id, '2026-11-02', '2026-11-04', { pay: false }); // chỉ giữ chỗ
  const b3 = await booked(w.unit2Id, '2026-11-06', '2026-11-08');
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b3.id, retainAmount: 0 }, { now: NOW }));
  const r = await report();
  assert.equal(r.total.sold, 3);
  assert.equal(r.total.revenue, 1950000);
  assert.equal(r.total.adr, 650000);
  assert.equal(r.total.occupancyPct, 15);
  assert.equal(r.total.revpar, 97500);
  assert.equal(r.byType.length, 1);
});

test('chỉ tính đêm nằm trong khoảng báo cáo (đơn vắt qua ranh giới)', async () => {
  await booked(w.unitId, '2026-11-03', '2026-11-07');
  const r = await report('2026-11-05', '2026-11-11'); // chỉ đêm 5, 6
  assert.equal(r.total.sold, 2);
  assert.equal(r.total.revenue, 1300000);
  assert.equal(r.total.available, 12);
});

test('đêm chủ chặn không nằm trong mẫu số', async () => {
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unit2Id, nights: ['2026-11-08', '2026-11-09', '2026-11-10'], kind: 'blocked_by_owner', now: NOW }));
  assert.equal((await report()).total.available, 17);
});

test('đầu vào xấu và giới hạn 366 đêm; org khác không lẫn', async () => {
  await assert.rejects(report('abc', '2026-11-11'), (e) => e.code === 'bad_dates');
  await assert.rejects(report('2026-11-11', '2026-11-01'));
  await assert.rejects(report('2026-01-01', '2027-06-01'), (e) => e.code === 'bad_dates');
  const other = await db.tx(async (c) => (await c.query("INSERT INTO orgs(name) VALUES('X') RETURNING id"))[0].id);
  const r = await db.tx((c) => occupancyReport(c, { orgId: other, from: '2026-11-01', to: '2026-11-11' }));
  assert.equal(r.total.available, 0);
  assert.equal(r.byType.length, 0);
});
