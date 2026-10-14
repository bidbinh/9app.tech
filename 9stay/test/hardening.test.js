import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createOrg, createBuilding, createOwner, createUnit, createContract, openNights, blockNights } from '../src/inventory.js';
import { createBooking, cancelBooking, moveBooking, unitAvailability } from '../src/bookings.js';

before(boot);
after(shutdown);
let w, other;
beforeEach(async () => {
  await db.resetForTests();
  w = await seed();
  other = await db.tx(async (c) => {
    const org = await createOrg(c, { name: 'Khác' });
    const b = await createBuilding(c, { orgId: org.id, name: 'B' });
    return { orgId: org.id, buildingId: b.id };
  });
});

const code = (c) => (e) => e.code === c;

test('đa tenant: tạo căn với tòa của org khác bị CSDL từ chối (23503)', async () => {
  await assert.rejects(
    db.tx((c) => createUnit(c, { orgId: w.orgId, buildingId: other.buildingId, ownerId: w.ownerId, roomTypeId: w.roomTypeId, code: 'Z1' })),
    code('23503'),
  );
});

test('đa tenant: dòng room_nights lệch org với căn bị từ chối (23503)', async () => {
  const [bk] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'K1','K',1,'giu') RETURNING id", [other.orgId]);
  await assert.rejects(
    db.query("INSERT INTO room_nights(org_id,booking_id,unit_id,night) VALUES($1,$2,$3,'2026-11-05')", [other.orgId, bk.id, w.unitId]),
    code('23503'),
  );
});

test('hợp đồng: chủ không phải chủ của căn bị từ chối (23503)', async () => {
  const o2 = await db.tx((c) => createOwner(c, { orgId: w.orgId, name: 'Lan' }));
  await assert.rejects(db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: o2.id, unitId: w.unitId, validFrom: '2026-11-01' })), code('23503'));
});

test('hợp đồng: chồng ngày bị từ chối (23P01), liền kề được vì valid_to là nửa mở, valid_to <= valid_from bị từ chối', async () => {
  const mk = (validFrom, validTo) => db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unitId, validFrom, validTo }));
  await mk('2026-01-01', '2026-06-01');
  await mk('2026-06-01', '2026-09-01'); // liền kề: không chồng
  await assert.rejects(mk('2026-05-01', '2026-07-01'), code('23P01'));
  await assert.rejects(mk('2026-08-01', null), code('23P01')); // không thời hạn chồng lên hợp đồng sau
  await assert.rejects(mk('2027-01-01', '2027-01-01'), code('23514'));
  await mk('2026-09-01', null); // nối tiếp, không thời hạn
});

test('hợp đồng của căn khác không cản: cùng khoảng ngày nhưng căn khác vẫn tạo được', async () => {
  await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unitId, validFrom: '2026-01-01' }));
  await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unit2Id, validFrom: '2026-01-01' }));
});

test('openNights/blockNights với căn của org khác: unit_not_found (404), không ghi gì', async () => {
  await assert.rejects(db.tx((c) => blockNights(c, { orgId: other.orgId, unitId: w.unitId, nights: ['2026-11-10'], kind: 'owner_use' })), (e) => e.code === 'unit_not_found' && e.status === 404);
  await assert.rejects(db.tx((c) => openNights(c, { orgId: other.orgId, unitId: w.unitId, from: '2027-02-01', to: '2027-02-03' })), code('unit_not_found'));
  const rows = await db.query("SELECT kind FROM owner_releases WHERE unit_id=$1 AND (night='2026-11-10' OR night >= '2027-02-01')", [w.unitId]);
  assert.deepEqual(rows.map((r) => r.kind), ['open']); // đêm 2026-11-10 vẫn là open từ seed, không có đêm 2027-02
});

test('id sai định dạng bị từ chối sớm bằng bad_id, không lọt lỗi thô 22P02 của PostgreSQL', async () => {
  const bad = 'khong-phai-uuid';
  await assert.rejects(db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: bad, nights: ['2026-11-10'], kind: 'owner_use' })), code('bad_id'));
  await assert.rejects(db.tx((c) => openNights(c, { orgId: bad, unitId: w.unitId, from: '2026-11-01', to: '2026-11-02' })), code('bad_id'));
  await assert.rejects(db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: bad, from: '2026-11-01', to: '2026-11-02' })), code('bad_id'));
  await assert.rejects(db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: bad, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1 }, { now: NOW })), code('bad_id'));
  await assert.rejects(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: bad })), code('bad_id'));
  await assert.rejects(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: bad, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14' }, { now: NOW })), code('bad_id'));
});

test('lý do hủy được lưu (đã cắt khoảng trắng), quá 500 ký tự bị từ chối, sự kiện vẫn không chứa lý do', async () => {
  const b = await db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1 }, { now: NOW }));
  await assert.rejects(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id, reason: 'x'.repeat(501) })), code('bad_reason'));
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id, reason: '  khách đổi ý  ' }));
  const [row] = await db.query('SELECT cancel_reason, status FROM bookings WHERE id=$1', [b.id]);
  assert.deepEqual({ ...row }, { cancel_reason: 'khách đổi ý', status: 'huy' });
  const ev = JSON.stringify(await db.query("SELECT data FROM booking_events WHERE booking_id=$1 AND kind='cancelled'", [b.id]));
  assert.ok(!ev.includes('khách đổi ý'));
});

test('lỗi deadlock/serialization của PostgreSQL được dịch thành lỗi busy (409) để lớp trên thử lại', async () => {
  for (const pgCode of ['40P01', '40001']) {
    const e = db.translateError(Object.assign(new Error('pg'), { code: pgCode }));
    assert.equal(e.code, 'busy');
    assert.equal(e.status, 409);
  }
  const other = new Error('khác');
  assert.equal(db.translateError(other), other);
});
