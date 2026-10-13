// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng).
import * as db from '../src/db.js';
import { createOrg, createBuilding, createOwner, createRoomType, createUnit, openNights } from '../src/inventory.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

export { db };
// 03:00 UTC = 10:00 giờ Việt Nam, ngày 14/10/2026
export const NOW = new Date('2026-10-14T03:00:00Z');

export async function boot() {
  await db.migrate();
  await db.resetForTests();
}
export async function shutdown() {
  await db.close();
}

// Một org, một tòa, một chủ, hai căn (A1205, A1206) đã mở bán [from, to)
export async function seed({ from = '2026-11-01', to = '2026-12-01' } = {}) {
  return db.tx(async (c) => {
    const org = await createOrg(c, { name: 'Anstay' });
    const building = await createBuilding(c, { orgId: org.id, name: 'Sunrise' });
    const owner = await createOwner(c, { orgId: org.id, name: 'Minh' });
    const roomType = await createRoomType(c, { orgId: org.id, name: 'Deluxe' });
    const mk = (code) => createUnit(c, { orgId: org.id, buildingId: building.id, ownerId: owner.id, roomTypeId: roomType.id, code });
    const unit = await mk('A1205');
    const unit2 = await mk('A1206');
    await openNights(c, { unitId: unit.id, from, to });
    await openNights(c, { unitId: unit2.id, from, to });
    return { orgId: org.id, buildingId: building.id, ownerId: owner.id, roomTypeId: roomType.id, unitId: unit.id, unit2Id: unit2.id };
  });
}
