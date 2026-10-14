import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as, Api } from './helper-http.js';

before(boot);
after(shutdown);
let srv, w, mgr;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  srv = await startServer();
  mgr = as(srv, w, 'quanly');
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; });

const mk = async (path, body) => { const r = await mgr.post(path, body); assert.equal(r.status, 200, path + ' ' + r.text); return r.json; };

async function baseSetup() {
  const b = await mk('/api/setup/buildings', { name: 'Vinhomes Ocean Park', address: 'Gia Lâm, Hà Nội', legalType: 'can_ho_du_lich' });
  const rt = await mk('/api/setup/room-types', { name: 'Studio', capacityStd: 2, capacityMax: 3 });
  const ow = await mk('/api/setup/owners', { name: 'Chị Hoa', kind: 'ca_nhan' });
  return { b: b.id, rt: rt.id, ow: ow.id };
}

test('chỉ quản lý được xem/ghi dữ liệu nền', async () => {
  for (const k of ['letan', 'buongphong', 'ctv1', 'chu1']) {
    const a = as(srv, w, k);
    assert.equal((await a.get('/api/setup')).status, 403, k);
    assert.equal((await a.post('/api/setup/buildings', { name: 'X' })).status, 403, k);
    assert.equal((await a.post('/api/setup/open-nights', { unitIds: [w.unitId], from: '2026-12-01', to: '2026-12-02' })).status, 403, k);
  }
  assert.equal((await new Api(srv).get('/api/setup')).status, 401);
});

test('luồng đầy đủ: tòa → loại phòng → chủ → căn hàng loạt → hợp đồng → mở bán → thấy trong danh mục', async () => {
  const { b, rt, ow } = await baseSetup();
  const u = await mk('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: ['OP-101', 'OP-102', 'OP-103'], floor: 1 });
  assert.equal(u.ids.length, 3);
  const k = await mk('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-01-01', ownerSharePct: 65, cleaningPayer: 'anstay' });
  assert.equal(k.ids.length, 3);
  const o = await mk('/api/setup/open-nights', { unitIds: u.ids, from: '2026-12-01', to: '2026-12-11' });
  assert.deepEqual({ units: o.units, nightsPerUnit: o.nightsPerUnit, total: o.total }, { units: 3, nightsPerUnit: 10, total: 30 });
  const s = (await mgr.get('/api/setup')).json;
  assert.ok(s.buildings.some((x) => x.name === 'Vinhomes Ocean Park'));
  const mine = s.units.filter((x) => x.code.startsWith('OP-'));
  assert.equal(mine.length, 3);
  assert.equal(mine[0].capacityMax, 3, 'căn lấy sức chứa của loại phòng');
  assert.equal(s.contracts.filter((c) => u.ids.includes(c.unitId)).every((c) => c.ownerSharePct === 65 && c.cleaningPayer === 'anstay' && c.ownerId === ow), true);
  const log = await db.query("SELECT action FROM audit_log WHERE action LIKE 'setup.%'");
  assert.ok(log.length >= 6);
});

test('căn mới dùng được ngay: giá + mở bán thì khách tìm thấy và đặt được', async () => {
  const { b, rt, ow } = await baseSetup();
  const u = await mk('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: ['OP-201'] });
  await mk('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-01-01' });
  await mk('/api/setup/open-nights', { unitIds: u.ids, from: '2026-12-01', to: '2026-12-11' });
  assert.equal((await mgr.put('/api/rates', { roomTypeId: rt, plan: 'public', from: '2026-12-01', to: '2026-12-11', price: 500000 })).status, 200);
  const av = await mgr.get('/api/availability?checkin=2026-12-02&checkout=2026-12-04&adults=2');
  const t = av.json.roomTypes.find((x) => x.roomTypeId === rt);
  assert.equal(t.free, 1);
  const q = await mgr.post('/api/quotes', { roomTypeId: rt, checkin: '2026-12-02', checkout: '2026-12-04', adults: 2 });
  assert.equal(q.json.ok, true);
  const bk = await mgr.post('/api/bookings', { roomTypeId: rt, checkin: '2026-12-02', checkout: '2026-12-04', guestName: 'Khách', adults: 2, quoteId: q.json.id });
  assert.equal(bk.status, 200);
});

test('kiểm tra đầu vào: tên rỗng, loại sai, sức chứa ngược, tỉ lệ ngoài 0..100, ngày sai', async () => {
  const { b, rt, ow } = await baseSetup();
  const bad = async (path, body, why) => { const r = await mgr.post(path, body); assert.equal(r.status, 400, why + ' -> ' + r.status + ' ' + r.text); };
  await bad('/api/setup/buildings', { name: '   ' }, 'tên tòa rỗng');
  await bad('/api/setup/buildings', { name: 'X', legalType: 'khac-la' }, 'loại hình sai');
  await bad('/api/setup/buildings', { name: 'x'.repeat(200) }, 'tên quá dài');
  await bad('/api/setup/room-types', { name: 'R', capacityStd: 4, capacityMax: 2 }, 'sức chứa ngược');
  await bad('/api/setup/room-types', { name: 'R', capacityStd: 0 }, 'sức chứa 0');
  await bad('/api/setup/owners', { name: 'O', kind: 'cong-ty' }, 'loại chủ sai');
  await bad('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: [] }, 'không có mã');
  await bad('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: ['A1', 'a1'] }, 'mã lặp trong danh sách');
  await bad('/api/setup/units', { buildingId: 'khong-phai-uuid', ownerId: ow, roomTypeId: rt, codes: ['A1'] }, 'id sai');
  const u = await mk('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: ['Z1'] });
  await bad('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-01-01', ownerSharePct: 101 }, 'tỉ lệ 101');
  await bad('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-13-45' }, 'ngày sai');
  await bad('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-02-01', validTo: '2026-01-01' }, 'kết thúc trước bắt đầu');
  await bad('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-01-01', kind: 'bat-ky' }, 'loại hợp đồng sai');
  await bad('/api/setup/open-nights', { unitIds: u.ids, from: '2026-12-10', to: '2026-12-01' }, 'ngày đảo');
  await bad('/api/setup/open-nights', { unitIds: u.ids, from: '2026-01-01', to: '2027-12-01' }, 'quá 366 đêm');
  await bad('/api/setup/open-nights', { unitIds: [], from: '2026-12-01', to: '2026-12-02' }, 'không chọn căn');
});

test('mã căn trùng trong cùng tòa: 409 và không tạo căn nào (hoàn tác cả lô)', async () => {
  const { b, rt, ow } = await baseSetup();
  await mk('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: ['DUP1'] });
  const r = await mgr.post('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: ['NEW1', 'DUP1'] });
  assert.equal(r.status, 409);
  assert.equal((await db.query("SELECT 1 FROM units WHERE code = 'NEW1'")).length, 0);
});

test('hợp đồng trùng khoảng ngày trên cùng căn: 409; khoảng nối tiếp thì được', async () => {
  const { b, rt, ow } = await baseSetup();
  const u = await mk('/api/setup/units', { buildingId: b, ownerId: ow, roomTypeId: rt, codes: ['C1'] });
  await mk('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-01-01', validTo: '2026-07-01' });
  const dup = await mgr.post('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-06-01' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error.code, 'contract_overlap');
  assert.equal((await mgr.post('/api/setup/contracts', { unitIds: u.ids, validFrom: '2026-07-01' })).status, 200);
});

test('không dùng được dữ liệu của org khác (tòa, chủ, loại phòng, căn)', async () => {
  const { b, rt, ow } = await baseSetup();
  const other = await db.tx(async (c) => {
    const o = (await c.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0].id;
    const bb = (await c.query("INSERT INTO buildings(org_id, name) VALUES($1, 'B') RETURNING id", [o]))[0].id;
    const oo = (await c.query("INSERT INTO owners(org_id, kind, name) VALUES($1, 'ca_nhan', 'O') RETURNING id", [o]))[0].id;
    const rr = (await c.query("INSERT INTO room_types(org_id, name) VALUES($1, 'R') RETURNING id", [o]))[0].id;
    const uu = (await c.query("INSERT INTO units(org_id, building_id, owner_id, room_type_id, code, capacity_std, capacity_max) VALUES($1, $2, $3, $4, 'U', 2, 4) RETURNING id", [o, bb, oo, rr]))[0].id;
    return { bb, oo, rr, uu };
  });
  for (const body of [{ buildingId: other.bb, ownerId: ow, roomTypeId: rt }, { buildingId: b, ownerId: other.oo, roomTypeId: rt }, { buildingId: b, ownerId: ow, roomTypeId: other.rr }]) {
    assert.equal((await mgr.post('/api/setup/units', { ...body, codes: ['X1'] })).status, 404);
  }
  assert.equal((await mgr.post('/api/setup/contracts', { unitIds: [other.uu], validFrom: '2026-01-01' })).status, 404);
  assert.equal((await mgr.post('/api/setup/open-nights', { unitIds: [other.uu], from: '2026-12-01', to: '2026-12-02' })).status, 404);
  assert.equal((await mgr.post(`/api/setup/units/${other.uu}/status`, { status: 'inactive' })).status, 404);
  const s = (await mgr.get('/api/setup')).json;
  assert.ok(!JSON.stringify(s).includes(other.uu));
});

test('ngừng bán một căn: không còn trong tìm phòng trống; bật lại thì có', async () => {
  const before = (await mgr.get('/api/availability?checkin=2026-11-12&checkout=2026-11-14&adults=2')).json.roomTypes.find((x) => x.roomTypeId === w.roomTypeId).free;
  assert.equal((await mgr.post(`/api/setup/units/${w.unitId}/status`, { status: 'inactive' })).status, 200);
  const mid = (await mgr.get('/api/availability?checkin=2026-11-12&checkout=2026-11-14&adults=2')).json.roomTypes.find((x) => x.roomTypeId === w.roomTypeId).free;
  assert.equal(mid, before - 1);
  assert.equal((await mgr.post(`/api/setup/units/${w.unitId}/status`, { status: 'active' })).status, 200);
  assert.equal((await mgr.post(`/api/setup/units/${w.unitId}/status`, { status: 'xoa' })).status, 400);
});
