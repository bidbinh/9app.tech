import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, NOW } from './helper.js';
import { bookedWorld } from './fixtures.js';
import { checkIn, checkOut } from '../src/stay.js';
import { accountBalance } from '../src/ledger.js';
import { createContract } from '../src/inventory.js';
import { moveBooking } from '../src/bookings.js';
import { recordPayment } from '../src/payments.js';
import { setSetting } from '../src/settings.js';

before(boot);
after(shutdown);
beforeEach(async () => { await db.resetForTests(); });

const NOV15 = new Date('2026-11-15T05:00:00Z');
const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);
async function stayed(opts) {
  const w = await bookedWorld(opts);
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  return w;
}
const out = (w) => db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: NOV15 }));
const bal = (w, account, partyId) => db.tx((c) => accountBalance(c, { orgId: w.orgId, account, partyId }));
const settlement = async (w) => (await db.query('SELECT * FROM settlements WHERE booking_id=$1', [w.booking.id]))[0];

test('quyết toán chia đúng: chủ 70%, Anstay phần còn lại, hoa hồng 10% trên tiền phòng, phí dọn chủ trả', async () => {
  const w = await stayed();
  const r = await out(w);
  assert.equal(r.created, true);
  const s = await settlement(w);
  assert.deepEqual(
    { room: s.room_revenue, vat: s.vat, owner: s.owner_amount, anstay: s.anstay_amount, commission: s.commission, cleaning: s.cleaning_fee, payer: s.cleaning_payer, date: s.checkout_date },
    { room: 1950000, vat: 195000, owner: 1365000, anstay: 585000, commission: 195000, cleaning: 150000, payer: 'owner', date: '2026-11-15' },
  );
  assert.equal(s.owner_id, w.ownerId);
  assert.equal(s.agent_id, w.agent.id);
  assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1', [w.booking.id]))[0].status, 'da_tra');
});

test('sổ sau quyết toán: từng tài khoản đúng và tổng toàn sổ bằng 0', async () => {
  const w = await stayed();
  await out(w);
  assert.equal(await bal(w, 'bank'), 2145000);
  assert.equal(await bal(w, 'guest_deposit_liability'), 0);
  assert.equal(await bal(w, 'vat_payable'), -195000);
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), -1215000); // 1.365.000 trừ phí dọn 150.000
  assert.equal(await bal(w, 'anstay_revenue'), -585000);
  assert.equal(await bal(w, 'commission_expense'), 195000);
  assert.equal(await bal(w, 'agent_commission_payable', w.agent.id), -195000);
  assert.equal(await bal(w, 'cleaning_payable'), -150000);
  const [total] = await db.query('SELECT COALESCE(SUM(amount),0)::bigint AS t FROM ledger_entries');
  assert.equal(total.t, 0);
});

test('gọi trả phòng lần hai không chia lại; ba lần đồng thời chỉ một quyết toán', async () => {
  const w = await stayed();
  const rs = await Promise.all([out(w), out(w), out(w)]);
  assert.equal(rs.filter((r) => r.created).length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM settlements'))[0].n, 1);
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), -1215000);
  const again = await out(w);
  assert.equal(again.created, false);
  assert.equal(await bal(w, 'anstay_revenue'), -585000);
});

test('đơn không có sale/CTV: không có hoa hồng và không có dòng sổ hoa hồng', async () => {
  const w = await stayed({ agentPct: null });
  await out(w);
  assert.equal((await settlement(w)).commission, 0);
  assert.equal(await bal(w, 'commission_expense'), 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM ledger_entries WHERE account='agent_commission_payable'"))[0].n, 0);
});

test('hoa hồng làm tròn xuống đồng: 7% của 1.950.000 = 136.500', async () => {
  const w = await stayed({ agentPct: 7 });
  await out(w);
  assert.equal((await settlement(w)).commission, 136500);
});

test('owner_net_floor: chủ nhận tối thiểu theo đêm dù phần chia thấp hơn', async () => {
  const w = await stayed({ contract: { ownerNetFloor: 500000 } });
  await out(w);
  const s = await settlement(w);
  assert.equal(s.owner_amount, 1500000); // 3 đêm × 500.000 thay vì 3 × 455.000
  assert.equal(s.anstay_amount, 450000);
});

test('owner_net_floor không vượt tiền đêm', async () => {
  const w = await stayed({ contract: { ownerNetFloor: 900000 } });
  await out(w);
  const s = await settlement(w);
  assert.equal(s.owner_amount, 1950000); // trần là tiền đêm
  assert.equal(s.anstay_amount, 0);
});

test('master_lease: phần chủ 0 theo đơn, toàn bộ về Anstay', async () => {
  const w = await stayed({ contract: { kind: 'master_lease', fixedRent: 30000000 } });
  await out(w);
  const s = await settlement(w);
  assert.equal(s.owner_amount, 0);
  assert.equal(s.anstay_amount, 1950000);
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), 150000); // số dư dương: chủ còn nợ phí dọn Anstay đã ứng
});

test('phí dọn do Anstay trả: ghi chi phí dọn, không trừ chủ', async () => {
  const w = await stayed({ contract: { cleaningPayer: 'anstay' } });
  await out(w);
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), -1365000);
  assert.equal(await bal(w, 'cleaning_expense'), 150000);
  assert.equal(await bal(w, 'cleaning_payable'), -150000);
});

test('phí dọn do khách trả: không ghi phí dọn', async () => {
  const w = await stayed({ contract: { cleaningPayer: 'guest' } });
  await out(w);
  assert.equal((await settlement(w)).cleaning_fee, 0);
  assert.equal(await bal(w, 'cleaning_payable'), 0);
});

test('phí dọn lấy từ cài đặt theo căn', async () => {
  const w = await bookedWorld();
  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'unit', scopeId: w.unitId, key: 'ops.cleaningFee', value: 200000, effectiveFrom: '2026-01-01' }));
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await out(w);
  assert.equal((await settlement(w)).cleaning_fee, 200000);
});

test('hợp đồng đổi giữa kỳ: đêm 12, 13 theo 70%, đêm 14 theo 50%', async () => {
  const w = await bookedWorld({ contract: { validTo: '2026-11-14' } });
  await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unitId, validFrom: '2026-11-14', ownerSharePct: 50 }));
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await out(w);
  const s = await settlement(w);
  assert.equal(s.owner_amount, 455000 + 455000 + 325000);
  assert.equal(s.anstay_amount, 1950000 - 1235000);
});

test('không có hợp đồng phủ đêm nào: no_contract (409), không để lại quyết toán hay dòng sổ, đơn vẫn da_nhan', async () => {
  const w = await stayed({ noContract: true });
  await assert.rejects(out(w), (e) => e.code === 'no_contract' && e.status === 409 && e.detail.night === '2026-11-12');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM settlements'))[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM ledger_transactions WHERE kind='settlement'"))[0].n, 0);
  assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1', [w.booking.id]))[0].status, 'da_nhan');
});

test('hợp đồng chỉ phủ một phần số đêm cũng bị từ chối', async () => {
  const w = await stayed({ contract: { validFrom: '2026-11-14' } });
  await assert.rejects(out(w), (e) => e.code === 'no_contract' && e.detail.night === '2026-11-12');
});

test('đơn không có dòng giá (không đặt từ báo giá): no_price', async () => {
  const w = await bookedWorld({ quoted: false, pay: 'none' });
  await db.query("UPDATE bookings SET status='da_nhan' WHERE id=$1", [w.booking.id]);
  await fail(out(w), 'no_price', 409);
});

test('đơn đã dời sau khi có dòng giá: price_mismatch, không quyết toán sai', async () => {
  const w = await stayed();
  // dời cần đơn đang giữ/cọc; mô phỏng bằng cách đổi trạng thái tạm để dời rồi nhận phòng lại
  await db.query("UPDATE bookings SET status='da_coc' WHERE id=$1", [w.booking.id]);
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: w.booking.id, unitId: w.unitId, checkin: '2026-11-20', checkout: '2026-11-23' }, { now: NOW }));
  await db.query("UPDATE bookings SET status='da_nhan' WHERE id=$1", [w.booking.id]);
  await fail(out(w), 'price_mismatch', 409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM settlements'))[0].n, 0);
});

test('khách trả thừa vẫn trả phòng được; phần thừa nằm lại trong cọc khách', async () => {
  const w = await bookedWorld({ pay: 'deposit' });
  await db.tx((c) => recordPayment(c, { orgId: w.orgId, bookingId: w.booking.id, kind: 'payment', amount: 1601000, receivedOn: '2026-11-12', ref: 'extra' }));
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  await out(w);
  assert.equal(await bal(w, 'guest_deposit_liability'), -100000); // đã thu 2.245.000, quyết toán 2.145.000
});

test('quyết toán chỉ thêm: không sửa, không xóa', async () => {
  const w = await stayed();
  await out(w);
  await assert.rejects(db.query('UPDATE settlements SET owner_amount = 1'), (e) => e.code === '55000');
  await assert.rejects(db.query('DELETE FROM settlements'), (e) => e.code === '55000');
});
