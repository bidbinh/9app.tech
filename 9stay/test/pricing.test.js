import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createOrg, createRoomType } from '../src/inventory.js';
import { ensureRatePlans, setRates, createPromotion, createQuote } from '../src/pricing.js';
import { createBooking } from '../src/bookings.js';
import { setSetting } from '../src/settings.js';

before(boot);
after(shutdown);
let w, plans;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed();
  plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-12-01', price: 650000 }));
});

const quote = (over = {}, now = NOW) => db.tx((c) => createQuote(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, checkin: '2026-11-12', checkout: '2026-11-15', adults: 2, ...over }, { now }));
const bookWith = (quoteId, over = {}, now = NOW) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-15', guestName: 'Lan', adults: 2, quoteId, ...over }, { now }));
const fail = (p, code) => assert.rejects(p, (e) => e.code === code, 'mong đợi lỗi ' + code);

test('ensureRatePlans tạo hai gói và chạy lại không nhân đôi', async () => {
  const again = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  assert.deepEqual(again, plans);
  assert.ok(plans.public && plans.ctv);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rate_plans WHERE org_id=$1', [w.orgId]))[0].n, 2);
});

test('setRates ghi lịch sử khi đổi giá hoặc đóng bán, không ghi khi giữ nguyên', async () => {
  const before = (await db.query('SELECT count(*)::int AS n FROM rate_calendar_history'))[0].n;
  assert.equal(before, 30); // lần ghi đầu của 30 đêm tháng 11
  const same = await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-11-03', price: 650000 }));
  assert.equal(same.changed, 0);
  const diff = await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-11-03', price: 700000, by: '11111111-1111-1111-1111-111111111111' }));
  assert.equal(diff.changed, 2);
  const h = await db.query("SELECT old_price, new_price, changed_by FROM rate_calendar_history WHERE night='2026-11-01' ORDER BY id DESC LIMIT 1");
  assert.deepEqual({ ...h[0] }, { old_price: 650000, new_price: 700000, changed_by: '11111111-1111-1111-1111-111111111111' });
  const [r] = await db.query("SELECT price FROM rate_calendar WHERE night='2026-11-01' AND plan_id=$1", [plans.public]);
  assert.equal(r.price, 700000);
  await assert.rejects(db.query('UPDATE rate_calendar_history SET new_price = 1'), (e) => e.code === '55000');
});

test('setRates từ chối giá sai, loại phòng/gói của org khác', async () => {
  const other = await db.tx(async (c) => {
    const org = await createOrg(c, { name: 'Khác' });
    const rt = await createRoomType(c, { orgId: org.id, name: 'X' });
    return { orgId: org.id, roomTypeId: rt.id };
  });
  const args = { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-11-02', price: 1 };
  await fail(db.tx((c) => setRates(c, { ...args, price: -1 })), 'bad_price');
  await fail(db.tx((c) => setRates(c, { ...args, price: 1.5 })), 'bad_price');
  await fail(db.tx((c) => setRates(c, { ...args, minStay: 0 })), 'bad_price');
  await fail(db.tx((c) => setRates(c, { ...args, roomTypeId: other.roomTypeId })), 'room_type_not_found');
  await fail(db.tx((c) => setRates(c, { ...args, from: '2026-02-30' })), 'bad_dates');
});

test('báo giá lưu đúng số liệu, hạn 24 giờ theo cài đặt', async () => {
  const q = await quote();
  assert.equal(q.ok, true);
  assert.equal(q.subtotal, 1950000);
  assert.equal(q.vat, 195000);
  assert.equal(q.total, 2145000);
  assert.equal(q.deposit, 644000); // 643.500 → 644.000
  assert.equal(q.expiresAt.getTime(), NOW.getTime() + 24 * 3600 * 1000);
  const [row] = await db.query('SELECT total, deposit, jsonb_array_length(lines) AS n FROM quotes WHERE id=$1', [q.id]);
  assert.deepEqual({ ...row }, { total: 2145000, deposit: 644000, n: 3 });

  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'pricing.quoteHours', value: 2, effectiveFrom: '2026-01-01' }));
  assert.equal((await quote()).expiresAt.getTime(), NOW.getTime() + 2 * 3600 * 1000);
});

test('thiếu giá một đêm: ok=false, có cảnh báo, không lưu gì', async () => {
  const q = await quote({ checkin: '2026-11-29', checkout: '2026-12-02' }); // 12/01 chưa có giá
  assert.equal(q.ok, false);
  assert.equal(q.id, null);
  assert.deepEqual(q.warnings, [{ code: 'missing_price', night: '2026-12-01' }]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM quotes'))[0].n, 0);
});

test('đóng bán một đêm và min-stay vào cảnh báo', async () => {
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-20', to: '2026-11-21', price: 650000, closed: true }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-25', to: '2026-11-26', price: 900000, minStay: 3 }));
  assert.deepEqual((await quote({ checkin: '2026-11-19', checkout: '2026-11-22' })).warnings, [{ code: 'closed', night: '2026-11-20' }]);
  assert.deepEqual((await quote({ checkin: '2026-11-25', checkout: '2026-11-27' })).warnings, [{ code: 'min_stay', night: '2026-11-25', minStay: 3 }]);
  assert.equal((await quote({ checkin: '2026-11-25', checkout: '2026-11-28' })).ok, true);
});

test('chọn đúng MỘT ưu đãi có lợi nhất; bỏ qua ưu đãi sai gói, ngoài cửa sổ, tắt, thiếu số đêm', async () => {
  const mk = (over) => db.tx((c) => createPromotion(c, { orgId: w.orgId, name: 'KM', stayFrom: '2026-11-01', stayTo: '2026-12-01', ...over }));
  const pct10 = await mk({ kind: 'pct', value: 10, minNights: 3 });
  const flat100 = await mk({ kind: 'amount_per_night', value: 100000 });
  await mk({ kind: 'pct', value: 50, planId: plans.ctv }); // sai gói
  await mk({ kind: 'pct', value: 50, stayFrom: '2026-12-01', stayTo: '2026-12-10' }); // ngoài cửa sổ
  const off = await mk({ kind: 'pct', value: 50 });
  await db.query('UPDATE promotions SET active=false WHERE id=$1', [off.id]);
  await mk({ kind: 'pct', value: 50, minNights: 5 }); // thiếu số đêm

  // 3 đêm × 650k: 10% = 65k/đêm, 100k/đêm lớn hơn → chọn flat100
  const q = await quote();
  assert.equal(q.promotionId, flat100.id);
  assert.equal(q.subtotal, 3 * 550000);
  // 2 đêm: pct10 cần 3 đêm nên chỉ flat100
  assert.equal((await quote({ checkin: '2026-11-12', checkout: '2026-11-14' })).promotionId, flat100.id);
  // bỏ flat100: 3 đêm lấy pct10
  await db.query('UPDATE promotions SET active=false WHERE id=$1', [flat100.id]);
  const q2 = await quote();
  assert.equal(q2.promotionId, pct10.id);
  assert.equal(q2.lines[0].discount, 65000);
  // không có ưu đãi nào đủ điều kiện → promotionId null
  assert.equal((await quote({ checkin: '2026-11-12', checkout: '2026-11-14' })).promotionId, null);
});

test('báo giá: ngày quá khứ, vượt sức chứa, tuổi trẻ sai, loại phòng lạ', async () => {
  await fail(quote({ checkin: '2026-10-10', checkout: '2026-10-12' }), 'past_date');
  await fail(quote({ adults: 4, childAges: [7] }), 'over_capacity');
  await fail(quote({ adults: 0 }), 'bad_guest');
  await fail(quote({ roomTypeId: '00000000-0000-0000-0000-000000000000' }), 'room_type_not_found');
  await fail(quote({ planId: 'khong-phai-uuid' }), 'bad_id');
  const bad = await quote({ childAges: [-3] });
  assert.equal(bad.ok, false);
  assert.equal(bad.warnings[0].code, 'bad_child_age');
});

test('đặt từ báo giá: ghi dòng giá bất biến, tổng khớp báo giá, cọc yêu cầu theo báo giá', async () => {
  const q = await quote();
  const b = await bookWith(q.id);
  assert.equal(b.total, q.total);
  assert.equal(b.depositRequired, q.deposit);
  const lines = await db.query('SELECT kind, night, amount FROM price_lines WHERE booking_id=$1 ORDER BY id', [b.id]);
  assert.deepEqual(lines.map((l) => l.kind), ['night', 'night', 'night', 'vat']);
  assert.equal(lines.reduce((s, l) => s + l.amount, 0), q.total);
  const [bk] = await db.query('SELECT deposit_required, quote_id FROM bookings WHERE id=$1', [b.id]);
  assert.deepEqual({ ...bk }, { deposit_required: q.deposit, quote_id: q.id });
  await assert.rejects(db.query('UPDATE price_lines SET amount = 1 WHERE booking_id=$1', [b.id]), (e) => e.code === '55000');
  await assert.rejects(db.query('DELETE FROM price_lines WHERE booking_id=$1', [b.id]), (e) => e.code === '55000');
});

test('một báo giá chỉ dùng cho một đơn (quote_used); báo giá lạ: quote_not_found', async () => {
  const q = await quote();
  await bookWith(q.id);
  await fail(bookWith(q.id, { unitId: w.unit2Id }), 'quote_used');
  await assert.rejects(bookWith('00000000-0000-0000-0000-000000000000'), (e) => e.code === 'quote_not_found' && e.status === 404);
  await fail(bookWith('khong-phai-uuid'), 'bad_id');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings'))[0].n, 1); // lần thất bại không để lại đơn
});

test('báo giá hết hạn bị từ chối quote_expired', async () => {
  const q = await quote();
  await fail(bookWith(q.id, {}, new Date(NOW.getTime() + 25 * 3600 * 1000)), 'quote_expired');
});

test('báo giá lệch ngày, số khách, trẻ em, hoặc loại phòng của căn: quote_mismatch', async () => {
  const q = await quote({ childAges: [7] });
  await fail(bookWith(q.id, { children: 1, checkout: '2026-11-16' }), 'quote_mismatch');
  await fail(bookWith(q.id, { children: 1, checkin: '2026-11-13' }), 'quote_mismatch');
  await fail(bookWith(q.id, { children: 1, adults: 3 }), 'quote_mismatch');
  await fail(bookWith(q.id, { children: 0 }), 'quote_mismatch');
  // căn thuộc loại phòng khác
  const other = await db.query("INSERT INTO room_types(org_id,name) VALUES($1,'Family') RETURNING id", [w.orgId]);
  await db.query('UPDATE units SET room_type_id=$1 WHERE id=$2', [other[0].id, w.unit2Id]);
  await fail(bookWith(q.id, { children: 1, unitId: w.unit2Id }), 'quote_mismatch');
  const ok = await bookWith(q.id, { children: 1 });
  assert.equal(ok.total, q.total);
});

test('đặt không có báo giá vẫn được, không có dòng giá và cọc yêu cầu 0', async () => {
  const b = await bookWith(undefined);
  assert.equal(b.total, 0);
  assert.equal(b.depositRequired, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM price_lines'))[0].n, 0);
});
