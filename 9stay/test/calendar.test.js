import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createOwner, createUnit, openNights, blockNights, createOrg } from '../src/inventory.js';
import { createBooking } from '../src/bookings.js';
import { orgCalendar } from '../src/calendar.js';

before(boot);
after(shutdown);
let w, other;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed();
  // chủ thứ hai với căn B1
  other = await db.tx(async (c) => {
    const o = await createOwner(c, { orgId: w.orgId, name: 'Lan' });
    const u = await createUnit(c, { orgId: w.orgId, buildingId: w.buildingId, ownerId: o.id, roomTypeId: w.roomTypeId, code: 'B1' });
    await openNights(c, { orgId: w.orgId, unitId: u.id, from: '2026-11-01', to: '2026-12-01' });
    return { ownerId: o.id, unitId: u.id };
  });
});

const cal = (over = {}) => db.tx((c) => orgCalendar(c, { orgId: w.orgId, from: '2026-11-11', to: '2026-11-16', ...over }));
const fail = (p, code) => assert.rejects(p, (e) => e.code === code, 'mong đợi lỗi ' + code);
const states = (u) => u.cells.map((x) => x.state);

test('lịch tổng: trạng thái từng đêm của từng căn, sắp theo tòa rồi mã căn', async () => {
  const held = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Nguyễn Văn Lan', adults: 1 }, { now: NOW }));
  await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unit2Id, checkin: '2026-11-13', checkout: '2026-11-14', guestName: 'Trần Hà', adults: 1, status: 'da_coc' }, { now: NOW }));
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: other.unitId, nights: ['2026-11-15'], kind: 'owner_use' }));
  const r = await cal();
  assert.deepEqual(r.nights, ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(r.units.map((u) => u.code), ['A1205', 'A1206', 'B1']);
  assert.deepEqual(states(r.units[0]), ['open', 'held', 'held', 'open', 'open']);
  assert.deepEqual(states(r.units[1]), ['open', 'open', 'booked', 'open', 'open']);
  assert.deepEqual(states(r.units[2]), ['open', 'open', 'open', 'open', 'owner_use']);
  assert.equal(r.units[0].cells[1].bookingId, held.id);
  assert.equal(r.units[0].cells[1].bookingCode, held.code);
  assert.equal(r.units[0].buildingName, 'Sunrise');
  assert.equal(r.units[0].roomTypeName, 'Deluxe');
  assert.equal(r.units[0].cells[0].bookingId, undefined);
});

test('ngày chưa mở bán là closed; khách hiển thị theo chế độ: masked (mặc định), full, none', async () => {
  await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-30', checkout: '2026-12-01', guestName: 'Nguyễn Văn Lan', adults: 1 }, { now: NOW }));
  const r = await cal({ from: '2026-11-30', to: '2026-12-02' });
  assert.deepEqual(states(r.units[0]), ['held', 'closed']);
  assert.equal(r.units[0].cells[0].guest, 'L***');
  assert.equal((await cal({ from: '2026-11-30', to: '2026-12-02', guest: 'full' })).units[0].cells[0].guest, 'Nguyễn Văn Lan');
  assert.equal((await cal({ from: '2026-11-30', to: '2026-12-02', guest: 'none' })).units[0].cells[0].guest, undefined);
  await fail(cal({ guest: 'khac' }), 'bad_guest');
});

test('lọc theo chủ phòng chỉ trả căn của chủ đó', async () => {
  const r = await cal({ ownerId: other.ownerId });
  assert.deepEqual(r.units.map((u) => u.code), ['B1']);
});

test('căn ngừng hoạt động không có trên lịch; org khác không thấy; giới hạn 62 đêm; id sai', async () => {
  await db.query("UPDATE units SET status='inactive' WHERE id=$1", [w.unit2Id]);
  assert.deepEqual((await cal()).units.map((u) => u.code), ['A1205', 'B1']);
  const o = await db.tx((c) => createOrg(c, { name: 'Khác' }));
  assert.deepEqual((await cal({ orgId: o.id })).units, []);
  await fail(cal({ from: '2026-11-01', to: '2027-02-01' }), 'range_too_large');
  await fail(cal({ orgId: 'xxx' }), 'bad_id');
  await fail(cal({ ownerId: 'xxx' }), 'bad_id');
  await fail(cal({ from: '2026-11-16', to: '2026-11-11' }), 'bad_dates');
});
