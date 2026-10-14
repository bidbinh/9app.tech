import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, NOW } from './helper.js';
import { bookedWorld, settleNew } from './fixtures.js';
import { checkIn, checkOut } from '../src/stay.js';
import { createBooking, cancelBooking, moveBooking, expireHolds, listOverdueHolds } from '../src/bookings.js';
import { createQuote, setRates, createPromotion } from '../src/pricing.js';
import { recordPayment, bookingBalance } from '../src/payments.js';
import { accountBalance } from '../src/ledger.js';
import { createAgent } from '../src/agents.js';
import { createOrg } from '../src/inventory.js';
import { freezeOwnerStatement, ownerStatement, recordOwnerPayout, statementCsv, toCsv } from '../src/statements.js';
import { setSetting } from '../src/settings.js';

before(boot);
after(shutdown);
beforeEach(async () => { await db.resetForTests(); });

const NOV15 = new Date('2026-11-15T05:00:00Z');
const HOUR = 3600 * 1000;
const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);
const bal = (w, account, partyId) => db.tx((c) => accountBalance(c, { orgId: w.orgId, account, partyId }));
const pay = (w, over = {}) => db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: w.booking.id, kind: 'payment', amount: 1000, receivedOn: '2026-11-12', ref: 'r' + Math.random(), ...over }));
const settlementOf = async (id) => (await db.query('SELECT * FROM settlements WHERE booking_id=$1', [id]))[0];

// ---- 1. Hoàn tiền sau quyết toán không được phá sổ ----
test('sau trả phòng chỉ hoàn được phần trả thừa, không hoàn phần đã quyết toán', async () => {
  const w = await bookedWorld({ pay: 'deposit' });
  await pay(w, { amount: 1501000, ref: 'rest' }); // 644.000 + 1.501.000 = đủ 2.145.000
  await pay(w, { amount: 100000, ref: 'extra' }); // trả thừa 100.000
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: NOV15 }));
  await fail(pay(w, { kind: 'refund', amount: 2245000, ref: 'rf-all' }), 'refund_too_large');
  await fail(pay(w, { kind: 'refund', amount: 100001, ref: 'rf-over' }), 'refund_too_large');
  await pay(w, { kind: 'refund', amount: 100000, ref: 'rf-ok' });
  assert.equal(await bal(w, 'guest_deposit_liability'), 0);
  assert.equal(await bal(w, 'bank'), 2145000);
});

// ---- 2. Dời đơn đã có giá ----
test('dời đơn đã có dòng giá mà không có báo giá mới: quote_required', async () => {
  const w = await bookedWorld({ pay: 'deposit' });
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: w.booking.id, unitId: w.unitId, checkin: '2026-11-20', checkout: '2026-11-23' }, { now: NOW })), 'quote_required', 409);
});

test('dời đơn kèm báo giá mới: đảo dòng giá cũ, ghi dòng mới, quyết toán theo các đêm mới', async () => {
  const w = await bookedWorld({ pay: 'none' });
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: w.plans.public, from: '2026-11-20', to: '2026-11-23', price: 900000 }));
  const q2 = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: w.plans.public, checkin: '2026-11-20', checkout: '2026-11-23', adults: 2 }, { now: NOW }));
  assert.equal(q2.total, 2970000);
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: w.booking.id, unitId: w.unitId, checkin: '2026-11-20', checkout: '2026-11-23', quoteId: q2.id }, { now: NOW }));
  const b = await db.tx((c) => bookingBalance(c, { orgId: w.orgId, bookingId: w.booking.id }));
  assert.equal(b.total, 2970000); // dòng cũ được đảo, chỉ còn giá mới
  assert.equal(b.depositRequired, q2.deposit);
  const [row] = await db.query('SELECT quote_id FROM bookings WHERE id=$1', [w.booking.id]);
  assert.equal(row.quote_id, q2.id);
  await pay(w, { kind: 'deposit', amount: 2970000, ref: 'all' });
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: new Date('2026-11-23T05:00:00Z') }));
  const s = await settlementOf(w.booking.id);
  assert.equal(s.room_revenue, 2700000);
  assert.equal(s.vat, 270000);
  const [t] = await db.query('SELECT COALESCE(SUM(amount),0)::bigint AS t FROM ledger_entries');
  assert.equal(t.t, 0);
});

test('báo giá dùng để dời phải khớp ngày đích và không dùng lại cho đơn khác', async () => {
  const w = await bookedWorld({ pay: 'none' });
  const q2 = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: w.plans.public, checkin: '2026-11-20', checkout: '2026-11-23', adults: 2 }, { now: NOW }));
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: w.booking.id, unitId: w.unitId, checkin: '2026-11-21', checkout: '2026-11-24', quoteId: q2.id }, { now: NOW })), 'quote_mismatch');
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: w.booking.id, unitId: w.unitId, checkin: '2026-11-20', checkout: '2026-11-23', quoteId: q2.id }, { now: NOW }));
  await fail(db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-20', checkout: '2026-11-23', guestName: 'K', adults: 2, quoteId: q2.id }, { now: NOW })), 'quote_used');
  // báo giá cũ của đơn (đã thay) cũng không dùng lại được
  await fail(db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-12', checkout: '2026-11-15', guestName: 'K', adults: 2, quoteId: w.quote.id }, { now: NOW })), 'quote_used');
});

// ---- 3. Tiền cọc khi hủy / hết hạn ----
test('đơn giu đã có tiền không bị nhả khi quá hạn; vào danh sách quá hạn còn tiền', async () => {
  const w = await bookedWorld({ pay: 'none' });
  await pay(w, { kind: 'deposit', amount: 300000, ref: 'part' });
  const later = new Date(NOW.getTime() + 30 * HOUR);
  assert.deepEqual(await db.tx((c) => expireHolds(c, { orgId: w.orgId, now: later })), []);
  assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1', [w.booking.id]))[0].status, 'giu');
  const list = await db.tx((c) => listOverdueHolds(c, { orgId: w.orgId, now: later }));
  assert.deepEqual(list.map((x) => ({ id: x.id, paid: x.paid })), [{ id: w.booking.id, paid: 300000 }]);
  // đơn không có tiền thì vẫn nhả
  const w2 = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-12', checkout: '2026-11-13', guestName: 'K', adults: 1 }, { now: NOW }));
  assert.deepEqual(await db.tx((c) => expireHolds(c, { orgId: w.orgId, now: later })), [w2.id]);
});

test('hủy đơn đã thu tiền bắt buộc chọn số giữ lại (payments_exist); không giữ gì thì hoàn đủ', async () => {
  const w = await bookedWorld({ pay: 'deposit' });
  await assert.rejects(
    db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: w.booking.id })),
    (e) => e.code === 'payments_exist' && e.status === 409 && e.detail.paid === 644000,
  );
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: w.booking.id, retainAmount: 644001 })), 'bad_retain');
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: w.booking.id, retainAmount: -1 })), 'bad_retain');
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: w.booking.id, retainAmount: 0 }));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM settlements'))[0].n, 0);
  await pay(w, { kind: 'refund', amount: 644000, ref: 'hoan-het' });
  assert.equal(await bal(w, 'guest_deposit_liability'), 0);
  assert.equal(await bal(w, 'bank'), 0);
});

test('hủy giữ lại một phần cọc: chia chủ/Anstay theo hợp đồng, phần còn lại hoàn tay; nằm trong bản kê chủ', async () => {
  const w = await bookedWorld({ pay: 'deposit' });
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: w.booking.id, retainAmount: 300000, reason: 'khách báo muộn' }, { now: NOV15 }));
  const s = await settlementOf(w.booking.id);
  assert.deepEqual(
    { kind: s.kind, room: s.room_revenue, vat: s.vat, owner: s.owner_amount, anstay: s.anstay_amount, commission: s.commission, cleaning: s.cleaning_fee, date: s.checkout_date },
    { kind: 'cancel', room: 300000, vat: 0, owner: 210000, anstay: 90000, commission: 0, cleaning: 0, date: '2026-11-15' },
  );
  assert.equal(await bal(w, 'guest_deposit_liability'), -344000); // 644.000 đã thu − 300.000 giữ lại
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), -210000);
  assert.equal(await bal(w, 'anstay_revenue'), -90000);
  // chỉ hoàn được 344.000
  await fail(pay(w, { kind: 'refund', amount: 344001, ref: 'qua' }), 'refund_too_large');
  await pay(w, { kind: 'refund', amount: 344000, ref: 'hoan' });
  assert.equal(await bal(w, 'guest_deposit_liability'), 0);
  const st = await db.tx((c) => freezeOwnerStatement(c, { orgId: w.orgId, ownerId: w.ownerId, from: '2026-11-01', to: '2026-12-01' }));
  assert.equal(st.payable, 210000);
  // đêm được trả lại để bán
  assert.equal((await db.query('SELECT count(*)::int AS n FROM room_nights WHERE booking_id=$1 AND active', [w.booking.id]))[0].n, 0);
});

test('hủy giữ tiền mà không có hợp đồng: toàn bộ về Anstay; hủy lại là idempotent', async () => {
  const w = await bookedWorld({ pay: 'deposit', noContract: true });
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: w.booking.id, retainAmount: 100000 }, { now: NOV15 }));
  const s = await settlementOf(w.booking.id);
  assert.deepEqual({ owner: s.owner_amount, anstay: s.anstay_amount }, { owner: 0, anstay: 100000 });
  const again = await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: w.booking.id, retainAmount: 100000 }, { now: NOV15 }));
  assert.equal(again.status, 'huy');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM settlements'))[0].n, 1);
});

// ---- 4. Đơn 0 đồng có phí dọn ----
test('đơn 0 đồng có phí dọn chủ trả: vẫn ghi sổ, bản kê chủ khớp sổ', async () => {
  const w = await bookedWorld({ pay: 'none', quoted: false });
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: w.plans.public, from: '2026-11-12', to: '2026-11-15', price: 650000 }));
  await db.tx((c) => createPromotion(c, { orgId: w.orgId, name: 'Miễn phí', kind: 'pct', value: 100, stayFrom: '2026-11-01', stayTo: '2026-12-01' }));
  const q = await db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: w.plans.public, checkin: '2026-11-13', checkout: '2026-11-14', adults: 2 }, { now: NOW }));
  assert.equal(q.total, 0);
  const b = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-13', checkout: '2026-11-14', guestName: 'Tặng', adults: 2, quoteId: q.id, status: 'da_coc' }, { now: NOW }));
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: b.id }));
  // căn 2 chưa có hợp đồng: thêm
  const { createContract } = await import('../src/inventory.js');
  await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unit2Id, validFrom: '2026-01-01' }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: b.id }, { now: NOV15 }));
  const s = await settlementOf(b.id);
  assert.equal(s.cleaning_fee, 150000);
  assert.notEqual(s.ledger_tx_id, null);
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), 150000);
  const { totals } = await db.tx((c) => ownerStatement(c, { orgId: w.orgId, ownerId: w.ownerId, from: '2026-11-01', to: '2026-12-01' }));
  assert.equal(totals.payable, -150000);
});

// ---- 5. Hoa hồng chụp lúc đặt ----
test('hoa hồng chụp tỉ lệ lúc đặt: đổi tỉ lệ hoặc khóa sale sau đó không ảnh hưởng đơn đã đặt', async () => {
  const w = await bookedWorld({ pay: 'full', agentPct: 10 });
  await db.query("UPDATE agents SET commission_pct = 50, status = 'blocked' WHERE id = $1", [w.agent.id]);
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: NOV15 }));
  assert.equal((await settlementOf(w.booking.id)).commission, 195000);
});

test('đặt với sale không tồn tại / org khác / đã khóa: lỗi rõ ràng, không phải lỗi thô của CSDL', async () => {
  const w = await bookedWorld({ pay: 'none' });
  const other = await db.tx(async (c) => { const o = await createOrg(c, { name: 'Khác' }); return createAgent(c, { orgId: o.id, name: 'X', kind: 'ctv', commissionPct: 5 }); });
  const mk = (agentId) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-20', checkout: '2026-11-21', guestName: 'K', adults: 1, agentId }, { now: NOW }));
  await fail(mk(other.id), 'agent_not_found', 404);
  await fail(mk('00000000-0000-0000-0000-000000000000'), 'agent_not_found', 404);
  await fail(mk('xxx'), 'bad_id');
  await db.query("UPDATE agents SET status='paused' WHERE id=$1", [w.agent.id]);
  await fail(mk(w.agent.id), 'agent_inactive', 409);
});

// ---- 6. Bản kê âm mang sang kỳ sau ----
test('bản kê âm được mang sang bản kê kế tiếp và trừ vào số chi', async () => {
  const w = await bookedWorld({ pay: 'none', contract: { kind: 'master_lease' }, quoted: true });
  await pay(w, { kind: 'deposit', amount: 2145000, ref: 'ml' });
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: NOV15 }));
  const k1 = await db.tx((c) => freezeOwnerStatement(c, { orgId: w.orgId, ownerId: w.ownerId, from: '2026-11-01', to: '2026-11-20' }));
  assert.equal(k1.payable, -150000);
  await fail(db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: k1.id, paidOn: '2026-12-01', ref: 'neg' })), 'nothing_to_pay');
  // kỳ sau: chuyển sang chia doanh thu (hợp đồng mới) và có một quyết toán dương 760.000
  await db.query("UPDATE owner_contracts SET valid_to = '2026-11-20'");
  const { createContract } = await import('../src/inventory.js');
  await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unitId, validFrom: '2026-11-20' }));
  await settleNew(w, { checkin: '2026-11-25', checkout: '2026-11-27', outOn: '2026-11-27', ref: 'k2' });
  const k2 = await db.tx((c) => freezeOwnerStatement(c, { orgId: w.orgId, ownerId: w.ownerId, from: '2026-11-20', to: '2026-12-01' }));
  assert.equal(k2.carried, -150000);
  assert.equal(k2.payable, 760000 - 150000);
  await db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: k2.id, paidOn: '2026-12-05', ref: 'ok' }));
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), 0);
  // không mang sang lần thứ hai
  const none = await db.query('SELECT count(*)::int AS n FROM owner_statement_carries');
  assert.equal(none[0].n, 1);
  const csv = await db.tx((c) => statementCsv(c, { orgId: w.orgId, kind: 'owner', statementId: k2.id }));
  assert.match(csv, /CHUYỂN KỲ TRƯỚC/);
});

// ---- 7. Không đưa ghi chú tự do vào sổ bất biến ----
test('memo của sổ không chứa ghi chú thanh toán (có thể có tên khách)', async () => {
  const w = await bookedWorld({ pay: 'none' });
  await pay(w, { kind: 'deposit', amount: 644000, ref: 'n1', note: 'Nguyễn Văn Bí Mật CK từ 0912345678' });
  const memos = (await db.query("SELECT memo FROM ledger_transactions WHERE kind LIKE 'payment_%'")).map((r) => r.memo).join('|');
  assert.ok(!memos.includes('Bí Mật') && !memos.includes('0912345678'));
});

// ---- 8. Trả phòng sớm nhả các đêm chưa ở ----
test('trả phòng sớm: các đêm từ ngày trả thực tế được nhả để bán lại, tiền vẫn tính đủ', async () => {
  const w = await bookedWorld({ pay: 'full' });
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: new Date('2026-11-13T05:00:00Z') })); // đi sớm, ngày 13
  const active = (await db.query('SELECT night FROM room_nights WHERE booking_id=$1 AND active ORDER BY night', [w.booking.id])).map((r) => r.night);
  assert.deepEqual(active, ['2026-11-12']);
  assert.equal((await settlementOf(w.booking.id)).room_revenue, 1950000);
  const again = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-13', checkout: '2026-11-15', guestName: 'Mới', adults: 1 }, { now: NOW }));
  assert.equal(again.status, 'giu');
});

// ---- Phụ ----
test('cài đặt sai kiểu hoặc ngoài khoảng bị từ chối', async () => {
  const w = await bookedWorld({ pay: 'none' });
  const set = (key, value) => db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key, value, effectiveFrom: '2026-01-01' }));
  for (const [k, v] of [['pricing.roundTo', 0], ['pricing.vatPct', '10'], ['pricing.vatPct', 150], ['pricing.depositPct', -1], ['pricing.extraAdultFee', 1.5], ['org.codePrefix', ''], ['org.codePrefix', 'quá dài không hợp lệ'], ['booking.maxNights', 0]]) {
    await fail(set(k, v), 'bad_setting');
  }
  await set('pricing.roundTo', 100);
  await set('org.codePrefix', 'AN');
});

test('CSV chặn công thức sau khoảng trắng và ký tự | ; không đụng số âm dạng số', () => {
  const cols = [{ key: 'a', header: 'a' }];
  const csv = toCsv([{ a: ' =1+1' }, { a: '|cmd' }, { a: '\t=x' }, { a: -5 }, { a: 'bình thường' }], cols);
  assert.equal(csv, "a\r\n' =1+1\r\n'|cmd\r\n'\t=x\r\n-5\r\nbình thường\r\n");
});
