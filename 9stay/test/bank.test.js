import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { ensureRatePlans, setRates, createQuote } from '../src/pricing.js';
import { createBooking, cancelBooking } from '../src/bookings.js';
import { bookingBalance } from '../src/payments.js';
import { accountBalance } from '../src/ledger.js';
import { ingestBankTx, codeCandidates, setBankAccount, matchManually, dismissInbox, paymentInfo, listInbox } from '../src/bank.js';
import { crc16, vietQrPayload } from '../src/vietqr.js';

before(boot);
after(shutdown);
let w, plans, booking;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed();
  plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-12-01', price: 650000 }));
  booking = await newBooking('2026-11-12', '2026-11-15', w.unitId);
});

async function newBooking(checkin, checkout, unitId) {
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin, checkout, adults: 2 }, { now: NOW }));
  return db.tx((c) => createBooking(c, { orgId: w.orgId, unitId, checkin, checkout, guestName: 'Lan', adults: 2, quoteId: q.id }, { now: NOW }));
}
// tổng 2.145.000, cọc 644.000
const ingest = (over = {}) => db.tx((c) => ingestBankTx(c, { orgId: w.orgId, provider: 'webhook', bankTxId: 't1', amount: 644000, content: `LAN CHUYEN TIEN ${booking.code}`, ...over }, { now: NOW }));
const balance = (id = booking.id) => db.tx((c) => bookingBalance(c, { orgId: w.orgId, bookingId: id }));
const statusOf = async (id = booking.id) => (await db.query('SELECT status FROM bookings WHERE id=$1', [id]))[0].status;

test('mã đơn tách được từ nội dung chuyển khoản lộn xộn', () => {
  assert.deepEqual(codeCandidates('NGUYEN VAN A CK AN1001'), ['AN1001']);
  assert.deepEqual(codeCandidates('ck an 1001 tien coc'), ['AN1001']);
  assert.deepEqual(codeCandidates('AN-1001'), ['AN1001']);
  assert.deepEqual(codeCandidates('chuyen tien'), []);
  assert.deepEqual(codeCandidates(null), []);
});

test('VietQR: CRC16 chuẩn và payload kết thúc bằng 6304 + CRC', () => {
  assert.equal(crc16('123456789'), '29B1');
  const p = vietQrPayload({ bin: '970436', account: '0123456789', amount: 644000, content: 'AN1001' });
  assert.match(p, /6304[0-9A-F]{4}$/);
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  assert.ok(p.includes('5406644000'));
});

test('đủ cọc, mã khớp: tự ghép, đơn thành da_coc, sổ ghi bank', async () => {
  const r = await ingest();
  assert.equal(r.status, 'matched');
  assert.equal(await statusOf(), 'da_coc');
  assert.equal((await balance()).paid, 644000);
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'bank' })), 644000);
  const [p] = await db.query('SELECT method FROM payments WHERE booking_id = $1', [booking.id]);
  assert.equal(p.method, 'vietqr_webhook');
});

test('gửi lại cùng giao dịch: không ghi thêm tiền', async () => {
  await ingest();
  const again = await ingest();
  assert.equal(again.duplicate, true);
  assert.equal((await balance()).paid, 644000);
  assert.equal((await db.query('SELECT 1 FROM bank_inbox')).length, 1);
});

test('hai lần gửi đồng thời cùng một giao dịch: chỉ một khoản thu', async () => {
  const rs = await Promise.all([ingest(), ingest(), ingest()]);
  assert.equal(rs.filter((r) => !r.duplicate).length, 1);
  assert.equal((await balance()).paid, 644000);
  assert.equal((await db.query('SELECT 1 FROM payments')).length, 1);
});

test('chuyển thiếu cọc: không tự ghép (không giữ chỗ vô hạn bằng khoản lẻ); quản lý ghép tay được', async () => {
  const r = await ingest({ bankTxId: 'a', amount: 1000 });
  assert.equal(r.status, 'needs_review');
  assert.equal(await statusOf(), 'giu');
  assert.equal((await balance()).paid, 0);
  await db.tx((c) => matchManually(c, { orgId: w.orgId, inboxId: r.inboxId, bookingId: booking.id, by: null }, { now: NOW }));
  assert.equal((await balance()).paid, 1000);
});

test('đã có khoản ghi tay cùng số tiền: webhook vào hàng chờ, không ghi hai lần', async () => {
  const { recordPayment } = await import('../src/payments.js');
  await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: booking.id, kind: 'deposit', amount: 644000, receivedOn: '2026-10-14', ref: 'tay1' }));
  const r = await ingest();
  assert.equal(r.status, 'needs_review');
  assert.equal((await balance()).paid, 644000);
});

test('giờ SePay không kèm múi giờ được hiểu là giờ Việt Nam', async () => {
  await ingest({ occurredAt: '2026-10-13 20:15:00' });
  const [i] = await db.query('SELECT occurred_at FROM bank_inbox');
  assert.equal(new Date(i.occurred_at).toISOString(), '2026-10-13T13:15:00.000Z');
  assert.equal((await db.query('SELECT received_on::text AS d FROM payments'))[0].d, '2026-10-13');
});

test('đơn đã đóng không có thông tin QR', async () => {
  await db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: '0123456789', holder: 'A' }));
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: booking.id, reason: 'h' }, { now: NOW }));
  await assert.rejects(db.tx((c) => paymentInfo(c, { orgId: w.orgId, bookingId: booking.id })), (e) => e.code === 'booking_closed');
});

test('chuyển vượt tổng đơn: vào hàng chờ, không ghi tiền', async () => {
  const r = await ingest({ amount: 3000000 });
  assert.equal(r.status, 'needs_review');
  assert.equal((await balance()).paid, 0);
  assert.equal(await statusOf(), 'giu');
});

test('không có mã đơn: unmatched; mã không tồn tại: unmatched', async () => {
  assert.equal((await ingest({ bankTxId: 'x', content: 'chuyen tien' })).status, 'unmatched');
  assert.equal((await ingest({ bankTxId: 'y', content: 'ZZ9999' })).status, 'unmatched');
  assert.equal((await db.query('SELECT 1 FROM payments')).length, 0);
});

test('nội dung khớp hai đơn: chờ duyệt, không đoán', async () => {
  const b2 = await newBooking('2026-11-20', '2026-11-22', w.unit2Id);
  const r = await ingest({ content: `${booking.code} ${b2.code}` });
  assert.equal(r.status, 'needs_review');
  assert.equal((await db.query('SELECT 1 FROM payments')).length, 0);
});

test('tiền tố mã đơn chữ thường vẫn ghép được; tiền tố có chữ số bị từ chối khi cài đặt', async () => {
  await db.query("UPDATE bookings SET code = lower(code) WHERE id = $1", [booking.id]);
  assert.equal((await ingest({ content: 'CK ' + booking.code.toUpperCase() })).status, 'matched');
  const { setSetting } = await import('../src/settings.js');
  await assert.rejects(db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'org.codePrefix', value: 'A1', effectiveFrom: '2026-01-01' })));
});

test('đơn đã hủy hoặc hết hạn mà tiền vẫn về: chờ duyệt, không tự ghi', async () => {
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: booking.id, reason: 'khách hủy' }, { now: NOW }));
  const r = await ingest();
  assert.equal(r.status, 'needs_review');
  assert.match(r.note, /đã đóng/);
  assert.equal((await db.query('SELECT 1 FROM payments')).length, 0);
});

test('đơn không có giá (chưa báo giá): chờ duyệt', async () => {
  const bare = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-20', checkout: '2026-11-22', guestName: 'K', adults: 1 }, { now: NOW }));
  const r = await ingest({ content: bare.code });
  assert.equal(r.status, 'needs_review');
});

test('quản lý ghép tay: ghi tiền một lần, không ghép lại được', async () => {
  const r = await ingest({ content: 'chuyen tien', amount: 644000 });
  assert.equal(r.status, 'unmatched');
  await db.tx((c) => matchManually(c, { orgId: w.orgId, inboxId: r.inboxId, bookingId: booking.id, by: null }, { now: NOW }));
  assert.equal(await statusOf(), 'da_coc');
  const [row] = await db.query('SELECT status, booking_id FROM bank_inbox WHERE id = $1', [r.inboxId]);
  assert.equal(row.status, 'resolved');
  await assert.rejects(db.tx((c) => matchManually(c, { orgId: w.orgId, inboxId: r.inboxId, bookingId: booking.id, by: null }, { now: NOW })), (e) => e.code === 'already_handled');
  assert.equal((await balance()).paid, 644000);
});

test('ghép tay vào đơn đã đóng bị từ chối và giao dịch vẫn ở hàng chờ', async () => {
  const r = await ingest({ content: 'x' });
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: booking.id, reason: 'h' }, { now: NOW }));
  await assert.rejects(db.tx((c) => matchManually(c, { orgId: w.orgId, inboxId: r.inboxId, bookingId: booking.id, by: null }, { now: NOW })), (e) => e.code === 'cannot_apply');
  assert.equal((await db.query('SELECT status FROM bank_inbox'))[0].status, 'unmatched');
});

test('bỏ qua cần ghi chú; chỉ bỏ qua được hàng chờ', async () => {
  const r = await ingest({ content: 'x' });
  await assert.rejects(db.tx((c) => dismissInbox(c, { orgId: w.orgId, inboxId: r.inboxId, note: '  ' })), (e) => e.code === 'note_required');
  await db.tx((c) => dismissInbox(c, { orgId: w.orgId, inboxId: r.inboxId, note: 'đã hoàn khách' }));
  await assert.rejects(db.tx((c) => dismissInbox(c, { orgId: w.orgId, inboxId: r.inboxId, note: 'lần nữa' })), (e) => e.code === 'already_handled');
  const ok = await ingest({ bankTxId: 'm' });
  await assert.rejects(db.tx((c) => dismissInbox(c, { orgId: w.orgId, inboxId: ok.inboxId, note: 'x' })), (e) => e.code === 'already_handled');
});

test('đầu vào xấu bị từ chối', async () => {
  for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1.5 }, { amount: 'abc' }, { bankTxId: '' }, { provider: '' }]) {
    await assert.rejects(ingest(bad), (e) => e.code === 'bad_bank_tx', JSON.stringify(bad));
  }
});

test('thông tin chuyển khoản: số tiền còn thiếu của cọc, nội dung là mã đơn', async () => {
  await assert.rejects(db.tx((c) => paymentInfo(c, { orgId: w.orgId, bookingId: booking.id })), (e) => e.code === 'no_bank_account');
  await db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: '0123456789', holder: 'CONG TY ANSTAY' }));
  let info = await db.tx((c) => paymentInfo(c, { orgId: w.orgId, bookingId: booking.id }));
  assert.equal(info.amount, 644000);
  assert.equal(info.content, booking.code);
  assert.match(info.svg, /^<svg/);
  await ingest({ amount: 644000 });
  info = await db.tx((c) => paymentInfo(c, { orgId: w.orgId, bookingId: booking.id }));
  assert.equal(info.amount, 1501000, 'sau khi đủ cọc: còn phải thu');
});

test('tài khoản nhận tiền: kiểm tra đầu vào, token giữ nguyên khi sửa và đổi khi xoay', async () => {
  await assert.rejects(db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '12', account: '0123456789', holder: 'A' })), (e) => e.code === 'bad_bank');
  await assert.rejects(db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: 'abc', holder: 'A' })), (e) => e.code === 'bad_bank');
  const a = await db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: '0123456789', holder: 'A' }));
  const b = await db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: '0123456789', holder: 'B' }));
  const c2 = await db.tx((c) => setBankAccount(c, { orgId: w.orgId, bin: '970436', account: '0123456789', holder: 'B', rotate: true }));
  assert.equal(a.webhookToken, b.webhookToken);
  assert.notEqual(b.webhookToken, c2.webhookToken);
});

test('danh sách hàng chờ lọc theo trạng thái', async () => {
  await ingest({ bankTxId: 'u', content: 'zzz' });
  await ingest({ bankTxId: 'm' });
  const un = await db.tx((c) => listInbox(c, { orgId: w.orgId, status: 'unmatched' }));
  assert.equal(un.length, 1);
  assert.equal((await db.tx((c) => listInbox(c, { orgId: w.orgId }))).length, 2);
  await assert.rejects(db.tx((c) => listInbox(c, { orgId: w.orgId, status: 'bậy' })), (e) => e.code === 'bad_status');
});

test('giao dịch của org khác không ghép được đơn org này', async () => {
  const other = await db.tx(async (c) => (await c.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0].id);
  const r = await db.tx((c) => ingestBankTx(c, { orgId: other, provider: 'webhook', bankTxId: 'o1', amount: 644000, content: booking.code }, { now: NOW }));
  assert.equal(r.status, 'unmatched');
  assert.equal((await balance()).paid, 0);
});
