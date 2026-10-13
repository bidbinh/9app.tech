import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { ensureRatePlans, setRates, createQuote } from '../src/pricing.js';
import { createBooking, cancelBooking } from '../src/bookings.js';
import { recordPayment, bookingBalance } from '../src/payments.js';
import { accountBalance } from '../src/ledger.js';

before(boot);
after(shutdown);
let w, plans, booking;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed();
  plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-12-01', price: 650000 }));
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin: '2026-11-12', checkout: '2026-11-15', adults: 2 }, { now: NOW }));
  booking = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-15', guestName: 'Lan', adults: 2, quoteId: q.id }, { now: NOW }));
});

// tổng 2.145.000, cọc yêu cầu 644.000
const pay = (over = {}) => db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: booking.id, kind: 'deposit', amount: 644000, receivedOn: '2026-10-14', ref: 'p1', ...over }, { now: NOW }));
const fail = (p, code) => assert.rejects(p, (e) => e.code === code, 'mong đợi lỗi ' + code);
const balance = () => db.tx((c) => bookingBalance(c, { orgId: w.orgId, bookingId: booking.id }));
const statusOf = async () => (await db.query('SELECT status, hold_until FROM bookings WHERE id=$1', [booking.id]))[0];

test('số dư ban đầu: tổng 2.145.000, chưa thu, còn phải thu đủ', async () => {
  assert.deepEqual(await balance(), { total: 2145000, paid: 0, due: 2145000, depositRequired: 644000 });
});

test('thu đủ cọc: đơn thành da_coc, bỏ hạn giữ, sổ ghi nợ bank có cọc khách', async () => {
  const r = await pay();
  assert.equal(r.bookingStatus, 'da_coc');
  assert.equal(r.paid, 644000);
  assert.equal(r.due, 1501000);
  const s = await statusOf();
  assert.equal(s.status, 'da_coc');
  assert.equal(s.hold_until, null);
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'bank' })), 644000);
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'guest_deposit_liability' })), -644000);
});

test('thu thiếu cọc: vẫn giu; thu bù đủ thì da_coc', async () => {
  const r1 = await pay({ amount: 300000, ref: 'a' });
  assert.equal(r1.bookingStatus, 'giu');
  assert.notEqual((await statusOf()).hold_until, null);
  const r2 = await pay({ amount: 344000, ref: 'b', kind: 'payment' });
  assert.equal(r2.bookingStatus, 'da_coc');
  assert.equal(r2.paid, 644000);
});

test('ghi lại cùng ref (thử lại) không cộng hai lần', async () => {
  const a = await pay();
  const b = await pay();
  assert.equal(b.created, false);
  assert.equal(b.paymentId, a.paymentId);
  assert.equal((await balance()).paid, 644000);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments'))[0].n, 1);
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'bank' })), 644000);
});

test('năm lần ghi đồng thời cùng ref: đúng một lần được cộng', async () => {
  const rs = await Promise.all(Array.from({ length: 5 }, () => pay({ ref: 'dong-thoi' })));
  assert.equal(rs.filter((r) => r.created).length, 1);
  assert.equal((await balance()).paid, 644000);
});

test('hai khoản khác ref ghi đồng thời cho một đơn: cả hai được cộng đúng', async () => {
  await Promise.all([pay({ amount: 100000, ref: 'x', kind: 'payment' }), pay({ amount: 200000, ref: 'y', kind: 'payment' })]);
  assert.equal((await balance()).paid, 300000);
});

test('ref đã dùng cho đơn khác: ref_conflict, không ghi gì', async () => {
  await pay();
  const other = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-20', checkout: '2026-11-21', guestName: 'K', adults: 1 }, { now: NOW }));
  await assert.rejects(
    db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: other.id, kind: 'deposit', amount: 5000, receivedOn: '2026-10-14', ref: 'p1' })),
    (e) => e.code === 'ref_conflict',
  );
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'bank' })), 644000);
});

test('hoàn tiền: không vượt số đã thu; hoàn thử lại cùng ref không lỗi; sổ đảo chiều', async () => {
  await pay();
  await fail(pay({ kind: 'refund', amount: 700000, ref: 'rf0' }), 'refund_too_large');
  const r = await pay({ kind: 'refund', amount: 244000, ref: 'rf1' });
  assert.equal(r.paid, 400000);
  const again = await pay({ kind: 'refund', amount: 244000, ref: 'rf1' });
  assert.equal(again.created, false);
  assert.equal((await balance()).paid, 400000);
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'bank' })), 400000);
  await fail(pay({ kind: 'refund', amount: 400001, ref: 'rf2' }), 'refund_too_large');
});

test('đơn đã hủy: không nhận thu thêm, nhưng vẫn hoàn được số đã thu', async () => {
  await pay();
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: booking.id }));
  await fail(pay({ ref: 'late', kind: 'payment', amount: 1000 }), 'booking_closed');
  const r = await pay({ kind: 'refund', amount: 644000, ref: 'rf' });
  assert.equal(r.paid, 0);
});

test('đầu vào sai: số tiền 0/âm/lẻ, loại lạ, ngày sai, thiếu ref, id sai định dạng', async () => {
  for (const amount of [0, -5, 1.5, '100', NaN]) await fail(pay({ amount, ref: 'z' + amount }), 'bad_payment');
  await fail(pay({ kind: 'tang' }), 'bad_payment');
  await fail(pay({ receivedOn: '2026-02-30' }), 'bad_dates');
  await fail(pay({ ref: '' }), 'bad_payment');
  await fail(pay({ ref: undefined }), 'bad_payment');
  await fail(pay({ method: 'tien_mat' }), 'bad_payment');
  await fail(pay({ bookingId: 'xxx' }), 'bad_id');
  await assert.rejects(pay({ bookingId: '00000000-0000-0000-0000-000000000000' }), (e) => e.code === 'booking_not_found' && e.status === 404);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments'))[0].n, 0);
});

test('bảng payments chỉ thêm; thu dư thì còn phải thu âm (khách trả thừa)', async () => {
  await pay({ amount: 2200000, kind: 'payment' });
  assert.equal((await balance()).due, -55000);
  await assert.rejects(db.query('UPDATE payments SET amount = 1'), (e) => e.code === '55000');
});
