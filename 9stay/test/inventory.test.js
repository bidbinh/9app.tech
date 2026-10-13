import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed } from './helper.js';
import { createContract, createUnit, openNights, blockNights } from '../src/inventory.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const kindsOf = async (unitId, from, to) =>
  Object.fromEntries((await db.query('SELECT night, kind FROM owner_releases WHERE unit_id=$1 AND night >= $2 AND night < $3 ORDER BY night', [unitId, from, to])).map((r) => [r.night, r.kind]));

test('openNights mở [from, to): 5→8 là ba đêm 5, 6, 7', async () => {
  const n = await db.tx((c) => openNights(c, { orgId: w.orgId, unitId: w.unitId, from: '2027-01-05', to: '2027-01-08' }));
  assert.equal(n, 3);
  assert.deepEqual(await kindsOf(w.unitId, '2027-01-01', '2027-02-01'), { '2027-01-05': 'open', '2027-01-06': 'open', '2027-01-07': 'open' });
});

test('openNights mở lại đêm chủ tự dùng thì thành open (chủ nhả ngày)', async () => {
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-10'], kind: 'owner_use' }));
  assert.equal((await kindsOf(w.unitId, '2026-11-10', '2026-11-11'))['2026-11-10'], 'owner_use');
  await db.tx((c) => openNights(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-10', to: '2026-11-11' }));
  assert.equal((await kindsOf(w.unitId, '2026-11-10', '2026-11-11'))['2026-11-10'], 'open');
});

test('blockNights ghi loại chặn, chấp nhận danh sách đêm trùng lặp', async () => {
  await db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-10', '2026-11-10', '2026-11-11'], kind: 'blocked_by_owner' }));
  assert.deepEqual(await kindsOf(w.unitId, '2026-11-10', '2026-11-12'), { '2026-11-10': 'blocked_by_owner', '2026-11-11': 'blocked_by_owner' });
});

test('blockNights từ chối loại lạ và danh sách đêm sai', async () => {
  await assert.rejects(db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-10'], kind: 'open' })), (e) => e.code === 'bad_kind');
  await assert.rejects(db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: [], kind: 'owner_use' })), (e) => e.code === 'bad_dates');
  await assert.rejects(db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-02-30'], kind: 'owner_use' })), (e) => e.code === 'bad_dates');
});

test('blockNights từ chối đêm đã có khách và hoàn tác toàn bộ giao dịch', async () => {
  const [bk] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'ST1','Lan',2,'giu') RETURNING id", [w.orgId]);
  await db.query("INSERT INTO room_nights(org_id,booking_id,unit_id,night) VALUES($1,$2,$3,'2026-11-11')", [w.orgId, bk.id, w.unitId]);
  await assert.rejects(
    db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-10', '2026-11-11'], kind: 'owner_use' })),
    (e) => e.code === 'night_booked' && e.status === 409 && e.detail.nights.includes('2026-11-11'),
  );
  // đêm 10 không bị chặn vì cả giao dịch đã hoàn tác
  assert.equal((await kindsOf(w.unitId, '2026-11-10', '2026-11-11'))['2026-11-10'], 'open');
});

test('createUnit trùng mã trong cùng tòa bị từ chối; hợp đồng mặc định theo đặc tả', async () => {
  await assert.rejects(
    db.tx((c) => createUnit(c, { orgId: w.orgId, buildingId: w.buildingId, ownerId: w.ownerId, roomTypeId: w.roomTypeId, code: 'A1205' })),
    (e) => e.code === '23505',
  );
  const k = await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unitId, validFrom: '2026-11-01' }));
  const [row] = await db.query('SELECT kind, owner_share_pct, cleaning_payer, payout_delay_days, statement_cycle FROM owner_contracts WHERE id=$1', [k.id]);
  assert.deepEqual({ ...row }, { kind: 'revenue_share', owner_share_pct: 70, cleaning_payer: 'owner', payout_delay_days: 3, statement_cycle: 'month' });
});
