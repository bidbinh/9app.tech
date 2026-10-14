import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as } from './helper-http.js';

before(boot);
after(shutdown);
let srv, w;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  srv = await startServer();
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; });

test('danh mục theo vai: CTV chỉ thấy loại phòng; lễ tân thêm căn; quản lý thêm chủ và sale/CTV; chủ chỉ căn của mình', async () => {
  const ctv = await as(srv, w, 'ctv1').get('/api/catalog');
  assert.equal(ctv.status, 200);
  assert.deepEqual(Object.keys(ctv.json).sort(), ['roomTypes']);
  assert.equal(ctv.json.roomTypes[0].name, 'Deluxe');
  assert.ok(!ctv.text.includes('A1205') && !ctv.text.includes('Minh') && !ctv.text.includes('Hoa'));

  const letan = await as(srv, w, 'letan').get('/api/catalog');
  assert.deepEqual(Object.keys(letan.json).sort(), ['roomTypes', 'units']);
  assert.deepEqual(letan.json.units.map((u) => u.code), ['A1205', 'A1206', 'B1']);
  assert.ok(!letan.text.includes('commissionPct'));

  const q = await as(srv, w, 'quanly').get('/api/catalog');
  assert.deepEqual(Object.keys(q.json).sort(), ['agents', 'owners', 'roomTypes', 'units']);
  assert.deepEqual(q.json.owners.map((o) => o.name).sort(), ['Lan', 'Minh']);
  assert.deepEqual(q.json.agents.map((a) => [a.name, a.commissionPct]).sort(), [['Hoa', 10], ['Quân', 5]]);
  assert.ok(q.json.units.every((u) => u.ownerId));

  const chu = await as(srv, w, 'chu1').get('/api/catalog');
  assert.deepEqual(Object.keys(chu.json).sort(), ['units']);
  assert.deepEqual(chu.json.units.map((u) => u.code), ['A1205', 'A1206']);

  assert.equal((await as(srv, w, 'buongphong').get('/api/catalog')).status, 403);
  assert.equal((await as(srv, w, 'outsider').get('/api/catalog')).status, 403);
  assert.equal((await as(srv, w, 'chu2').get('/api/catalog')).json.units.length, 1);
});
