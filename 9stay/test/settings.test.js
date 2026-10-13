import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';
import { DEFAULTS, setSetting, getSetting } from '../src/settings.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test`.');

before(async () => { await db.migrate(); await db.resetForTests(); });
after(async () => { await db.close(); });

async function world() {
  await db.resetForTests();
  const [org] = await db.query("INSERT INTO orgs(name) VALUES('Anstay') RETURNING id");
  const [b] = await db.query("INSERT INTO buildings(org_id,name) VALUES($1,'S') RETURNING id", [org.id]);
  const [o] = await db.query("INSERT INTO owners(org_id,kind,name) VALUES($1,'ca_nhan','M') RETURNING id", [org.id]);
  const [rt] = await db.query("INSERT INTO room_types(org_id,name) VALUES($1,'D') RETURNING id", [org.id]);
  const [u] = await db.query("INSERT INTO units(org_id,building_id,owner_id,room_type_id,code,capacity_std,capacity_max) VALUES($1,$2,$3,$4,'A1',2,4) RETURNING id", [org.id, b.id, o.id, rt.id]);
  return { orgId: org.id, buildingId: b.id, ownerId: o.id, unitId: u.id };
}

test('không có dòng nào thì trả mặc định', async () => {
  const w = await world();
  const v = await db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'booking.maxNights', unitId: w.unitId, asOf: '2026-11-01' }));
  assert.equal(v, DEFAULTS['booking.maxNights']);
});

test('thứ tự ưu tiên: căn > chủ > tòa > org', async () => {
  const w = await world();
  const set = (scopeType, scopeId, value) => db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType, scopeId, key: 'booking.maxNights', value, effectiveFrom: '2026-01-01' }));
  const get = () => db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'booking.maxNights', unitId: w.unitId, asOf: '2026-11-01' }));
  await set('org', null, 30);
  assert.equal(await get(), 30);
  await set('building', w.buildingId, 20);
  assert.equal(await get(), 20);
  await set('owner', w.ownerId, 10);
  assert.equal(await get(), 10);
  await set('unit', w.unitId, 5);
  assert.equal(await get(), 5);
});

test('hiệu lực theo ngày: đổi cài đặt không áp ngược về trước effectiveFrom', async () => {
  const w = await world();
  await db.tx(async (c) => {
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'booking.maxNights', value: 30, effectiveFrom: '2026-01-01' });
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'booking.maxNights', value: 14, effectiveFrom: '2026-12-01' });
  });
  const at = (asOf) => db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'booking.maxNights', asOf }));
  assert.equal(await at('2026-11-30'), 30);
  assert.equal(await at('2026-12-01'), 14);
  assert.equal(await at('2026-12-31'), 14);
});

test('cùng phạm vi, cùng ngày hiệu lực: dòng ghi sau thắng', async () => {
  const w = await world();
  await db.tx(async (c) => {
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'org.codePrefix', value: 'AA', effectiveFrom: '2026-01-01' });
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'org.codePrefix', value: 'BB', effectiveFrom: '2026-01-01' });
  });
  assert.equal(await db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'org.codePrefix', asOf: '2026-02-01' })), 'BB');
});

test('khóa lạ bị từ chối cả khi ghi lẫn khi đọc; phạm vi không hợp lệ bị từ chối', async () => {
  const w = await world();
  await assert.rejects(db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'khong.co', value: 1, effectiveFrom: '2026-01-01' })), (e) => e.code === 'unknown_setting');
  await assert.rejects(db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'khong.co', asOf: '2026-01-01' })), (e) => e.code === 'unknown_setting');
  await assert.rejects(db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'planet', key: 'booking.maxNights', value: 1, effectiveFrom: '2026-01-01' })), (e) => e.code === 'bad_scope');
  await assert.rejects(db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'building', scopeId: null, key: 'booking.maxNights', value: 1, effectiveFrom: '2026-01-01' })), (e) => e.code === 'bad_scope');
});
