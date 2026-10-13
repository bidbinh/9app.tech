import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createBooking, unitAvailability } from '../src/bookings.js';
import { blockNights, openNights } from '../src/inventory.js';
import { setSetting } from '../src/settings.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const book = (over = {}) => db.tx((c) => createBooking(c, {
  orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Nguyễn Lan', guestPhone: '0901 234 567', adults: 2, ...over,
}, { now: NOW }));
const fail = (p, code) => assert.rejects(p, (e) => e.code === code, 'mong đợi lỗi ' + code);

test('đặt thành công: mã đơn, hai đêm, hạn giữ theo cài đặt', async () => {
  const b = await book();
  assert.match(b.code, /^ST1000$/);
  assert.equal(b.status, 'giu');
  assert.equal(b.version, 1);
  assert.deepEqual(b.nights, ['2026-11-12', '2026-11-13']);
  assert.equal(new Date(b.holdUntil).getTime(), NOW.getTime() + 1440 * 60 * 1000);
  const rn = await db.query('SELECT night FROM room_nights WHERE booking_id=$1 AND active ORDER BY night', [b.id]);
  assert.deepEqual(rn.map((r) => r.night), ['2026-11-12', '2026-11-13']);
  const ev = await db.query('SELECT kind, data FROM booking_events WHERE booking_id=$1', [b.id]);
  assert.equal(ev[0].kind, 'created');
  assert.ok(!JSON.stringify(ev[0].data).includes('Lan') && !JSON.stringify(ev[0].data).includes('0901'), 'sự kiện không được chứa tên hay SĐT');
});

test('mã đơn tăng dần theo org và theo tiền tố cài đặt', async () => {
  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'org.codePrefix', value: 'AN', effectiveFrom: '2026-01-01' }));
  const a = await book();
  const b = await book({ checkin: '2026-11-20', checkout: '2026-11-21' });
  assert.equal(a.code, 'AN1000');
  assert.equal(b.code, 'AN1001');
});

test('trả phòng rồi đặt lại cùng ngày: 12→14 và 14→16 cùng căn đều thành công', async () => {
  await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  const b2 = await book({ checkin: '2026-11-14', checkout: '2026-11-16', guestName: 'Trần Hà' });
  assert.deepEqual(b2.nights, ['2026-11-14', '2026-11-15']);
});

test('đặt chồng một đêm bị từ chối unit_taken (409), căn khác cùng ngày vẫn đặt được', async () => {
  await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  await fail(book({ checkin: '2026-11-13', checkout: '2026-11-15' }), 'unit_taken');
  const other = await book({ unitId: w.unit2Id, checkin: '2026-11-13', checkout: '2026-11-15' });
  assert.equal(other.status, 'giu');
});

test('đêm chưa mở bán: not_released, nêu đêm nào; đêm chủ tự dùng hoặc chặn: unit_blocked', async () => {
  await assert.rejects(book({ checkin: '2026-12-01', checkout: '2026-12-03' }), (e) => e.code === 'not_released' && e.status === 409 && e.detail.night === '2026-12-01');
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-21'], kind: 'owner_use' }));
  await assert.rejects(book({ checkin: '2026-11-20', checkout: '2026-11-23' }), (e) => e.code === 'unit_blocked' && e.detail.night === '2026-11-21' && e.detail.kind === 'owner_use');
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-25'], kind: 'blocked_by_anstay' }));
  await fail(book({ checkin: '2026-11-25', checkout: '2026-11-26' }), 'unit_blocked');
});

test('chủ nhả ngày rồi thì đặt được', async () => {
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-21'], kind: 'owner_use' }));
  await db.tx((c) => openNights(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-21', to: '2026-11-22' }));
  const b = await book({ checkin: '2026-11-21', checkout: '2026-11-22' });
  assert.equal(b.status, 'giu');
});

test('ngày không hợp lệ: sai định dạng, không tồn tại, đảo ngược, bằng nhau, quá dài', async () => {
  for (const [a, z] of [['2026-02-30', '2026-03-02'], ['12/11/2026', '14/11/2026'], ['2026-11-14', '2026-11-12'], ['2026-11-12', '2026-11-12'], [null, '2026-11-12']]) {
    await fail(book({ checkin: a, checkout: z }), 'bad_dates');
  }
  await fail(book({ checkin: '2026-11-01', checkout: '2027-11-30' }), 'bad_dates');
});

test('too_long theo cài đặt của căn', async () => {
  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'unit', scopeId: w.unitId, key: 'booking.maxNights', value: 3, effectiveFrom: '2026-01-01' }));
  await fail(book({ checkin: '2026-11-01', checkout: '2026-11-05' }), 'too_long');
  const ok = await book({ checkin: '2026-11-01', checkout: '2026-11-04' });
  assert.equal(ok.nights.length, 3);
});

test('too_far: ngày đến vượt maxAdvanceDays', async () => {
  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'booking.maxAdvanceDays', value: 30, effectiveFrom: '2026-01-01' }));
  await fail(book({ checkin: '2026-12-01', checkout: '2026-12-02' }), 'too_far');
});

test('ngày đến trong quá khứ bị từ chối; hôm nay theo giờ Việt Nam thì được', async () => {
  await db.tx((c) => openNights(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-10-10', to: '2026-10-20' }));
  await fail(book({ checkin: '2026-10-13', checkout: '2026-10-15' }), 'past_date');
  const b = await book({ checkin: '2026-10-14', checkout: '2026-10-15' });
  assert.equal(b.status, 'giu');
});

test('hôm nay theo giờ Việt Nam khi UTC còn là hôm qua: 20:00 UTC ngày 13 là ngày 14', async () => {
  await db.tx((c) => openNights(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-10-10', to: '2026-10-20' }));
  const late = new Date('2026-10-13T20:00:00Z');
  const mk = (checkin) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin, checkout: '2026-10-16', guestName: 'K', adults: 1 }, { now: late }));
  await assert.rejects(mk('2026-10-13'), (e) => e.code === 'past_date');
  assert.equal((await mk('2026-10-14')).nights[0], '2026-10-14');
});

test('khách: tên rỗng/quá dài, số khách 0 hoặc âm hoặc không nguyên, vượt sức chứa tối đa', async () => {
  await fail(book({ guestName: '   ' }), 'bad_guest');
  await fail(book({ guestName: 'x'.repeat(121) }), 'bad_guest');
  await fail(book({ adults: 0 }), 'bad_guest');
  await fail(book({ adults: 1.5 }), 'bad_guest');
  await fail(book({ children: -1 }), 'bad_guest');
  await fail(book({ adults: 3, children: 2 }), 'over_capacity'); // sức chứa tối đa 4
  const b = await book({ adults: 2, children: 2 });
  assert.equal(b.status, 'giu');
});

test('số điện thoại: chuẩn hóa dấu cách, chấp nhận +84, từ chối có chữ; để trống được', async () => {
  const a = await book({ guestPhone: '+84 901-234.567' });
  const [row] = await db.query('SELECT guest_phone FROM bookings WHERE id=$1', [a.id]);
  assert.equal(row.guest_phone, '+84901234567');
  await fail(book({ guestPhone: '09o1234567', checkin: '2026-11-20', checkout: '2026-11-21' }), 'bad_phone');
  const b = await book({ guestPhone: null, checkin: '2026-11-22', checkout: '2026-11-23' });
  assert.ok(b.id);
});

test('trạng thái đầu: chỉ giu hoặc da_coc; da_coc không có hạn giữ', async () => {
  await fail(book({ status: 'da_nhan' }), 'bad_status');
  const b = await book({ status: 'da_coc' });
  assert.equal(b.holdUntil, null);
});

test('căn không tồn tại, căn của org khác, căn ngừng hoạt động', async () => {
  await fail(book({ unitId: '00000000-0000-0000-0000-000000000000' }), 'unit_not_found');
  const other = await db.tx(async (c) => (await c.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0]);
  await fail(book({ orgId: other.id }), 'unit_not_found');
  await db.query("UPDATE units SET status='inactive' WHERE id=$1", [w.unitId]);
  await fail(book(), 'unit_inactive');
});

test('lỗi giữa chừng không để lại dữ liệu nửa vời: đặt trùng không tạo đơn, không đốt số mã', async () => {
  await book();
  await fail(book({ checkin: '2026-11-13', checkout: '2026-11-15' }), 'unit_taken');
  const n = await db.query('SELECT count(*)::int AS n FROM bookings');
  assert.equal(n[0].n, 1);
  const next = await book({ checkin: '2026-11-20', checkout: '2026-11-21' });
  assert.equal(next.code, 'ST1001');
});

test('unitAvailability: open, booked, chủ tự dùng, chặn, chưa mở bán', async () => {
  const b = await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-14'], kind: 'owner_use' }));
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-15'], kind: 'blocked_by_anstay' }));
  const av = await db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-11', to: '2026-11-17' }));
  assert.deepEqual(av.map((a) => a.state), ['open', 'booked', 'booked', 'owner_use', 'blocked_by_anstay', 'open']);
  assert.equal(av[1].bookingId, b.id);
  const edge = await db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-30', to: '2026-12-02' }));
  assert.deepEqual(edge.map((a) => a.state), ['open', 'closed']);
  await assert.rejects(db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: '00000000-0000-0000-0000-000000000000', from: '2026-11-11', to: '2026-11-12' })), (e) => e.code === 'unit_not_found');
});
