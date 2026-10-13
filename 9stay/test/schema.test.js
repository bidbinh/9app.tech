import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL).');

before(async () => { await db.migrate(); await db.resetForTests(); });
after(async () => { await db.close(); });

// Dựng tối thiểu bằng SQL thô để kiểm tra riêng lớp lược đồ
async function minimal() {
  const [org] = await db.query("INSERT INTO orgs(name) VALUES('Anstay') RETURNING id");
  const [b] = await db.query("INSERT INTO buildings(org_id,name) VALUES($1,'Sunrise') RETURNING id", [org.id]);
  const [o] = await db.query("INSERT INTO owners(org_id,kind,name) VALUES($1,'ca_nhan','Minh') RETURNING id", [org.id]);
  const [rt] = await db.query("INSERT INTO room_types(org_id,name) VALUES($1,'Deluxe') RETURNING id", [org.id]);
  const [u] = await db.query("INSERT INTO units(org_id,building_id,owner_id,room_type_id,code,capacity_std,capacity_max) VALUES($1,$2,$3,$4,'A1',2,4) RETURNING id", [org.id, b.id, o.id, rt.id]);
  const [bk] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'ST1','Lan',2,'giu') RETURNING id", [org.id]);
  return { org, unit: u, booking: bk };
}

test('migrate tạo đủ bảng cốt lõi', async () => {
  const rows = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  const names = rows.map((r) => r.tablename);
  for (const t of ['orgs', 'buildings', 'owners', 'room_types', 'units', 'owner_contracts', 'owner_releases', 'bookings', 'room_nights', 'booking_events', 'settings', 'org_counters']) {
    assert.ok(names.includes(t), 'thiếu bảng ' + t);
  }
});

test('chỉ mục duy nhất từng phần: hai dòng room_nights hoạt động cùng căn cùng đêm bị từ chối', async () => {
  const { unit, booking } = await minimal();
  await db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-05')", [booking.id, unit.id]);
  await assert.rejects(
    db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-05')", [booking.id, unit.id]),
    (e) => e.code === '23505' && e.constraint === 'room_nights_active_unit_night',
  );
});

test('dòng room_nights đã vô hiệu (active=false) không chiếm đêm', async () => {
  await db.resetForTests();
  const { unit, booking } = await minimal();
  await db.query("INSERT INTO room_nights(booking_id,unit_id,night,active) VALUES($1,$2,'2026-11-05',false)", [booking.id, unit.id]);
  await db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-05')", [booking.id, unit.id]);
  const rows = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE active');
  assert.equal(rows[0].n, 1);
});

test('ràng buộc CHECK: sức chứa tối đa nhỏ hơn chuẩn bị từ chối; phần chủ ngoài 0..100 bị từ chối', async () => {
  await db.resetForTests();
  const [org] = await db.query("INSERT INTO orgs(name) VALUES('A') RETURNING id");
  await assert.rejects(db.query("INSERT INTO room_types(org_id,name,capacity_std,capacity_max) VALUES($1,'X',4,2)", [org.id]), (e) => e.code === '23514');
  const { unit } = await minimal();
  const [o] = await db.query('SELECT owner_id FROM units WHERE id=$1', [unit.id]);
  await assert.rejects(
    db.query("INSERT INTO owner_contracts(org_id,owner_id,unit_id,kind,valid_from,owner_share_pct) VALUES((SELECT org_id FROM units WHERE id=$1),$2,$1,'revenue_share','2026-11-01',150)", [unit.id, o.owner_id]),
    (e) => e.code === '23514',
  );
});
