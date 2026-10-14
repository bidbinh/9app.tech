// Dịch vụ đồng bộ: xác thực, phiên bản có điều kiện, cách ly người dùng, giới hạn, danh sách app, xóa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, signup, query, config } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

let ipSeq = 1;
const freshIp = () => `10.20.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const put = (c, app, baseVersion, data) => c.req('PUT', '/api/sync/' + app, { baseVersion, data });

test('chưa đăng nhập: 401; app ngoài danh sách: 404', async () => {
  const anon = new Client('khách', freshIp());
  assert.equal((await anon.get('/api/sync/payday')).status, 401);
  assert.equal((await put(anon, 'payday', 0, {})).status, 401);
  const u = await signup('A', { ip: freshIp() });
  assert.equal((await u.get('/api/sync/gift')).status, 404);
  assert.equal((await put(u, 'interview', 0, {})).status, 404);
  assert.equal((await u.get('/api/sync/x..y')).status, 404);
});

test('chưa có: version 0; ghi lần đầu baseVersion 0 -> version 1; đọc lại đúng nội dung', async () => {
  const u = await signup('B', { ip: freshIp() });
  assert.deepEqual((await u.get('/api/sync/car')).json, { epoch: null, version: 0, data: null, updatedAt: null });
  const r = await put(u, 'car', 0, { xe: [{ id: 'a', ten: 'Xe 1' }] });
  assert.equal(r.status, 200); assert.equal(r.json.version, 1);
  const g = (await u.get('/api/sync/car')).json;
  assert.equal(g.version, 1); assert.deepEqual(g.data, { xe: [{ id: 'a', ten: 'Xe 1' }] }); assert.ok(g.updatedAt);
});

test('ghi có điều kiện: baseVersion lạc hậu -> 409 kèm bản hiện tại; đúng thì tăng version', async () => {
  const u = await signup('C', { ip: freshIp() });
  await put(u, 'payday', 0, { v: 1 });
  const stale = await put(u, 'payday', 0, { v: 'cũ' });
  assert.equal(stale.status, 409); assert.equal(stale.json.error.code, 'conflict');
  assert.equal(stale.json.error.details.version, 1); assert.deepEqual(stale.json.error.details.data, { v: 1 }); assert.ok(stale.json.error.details.epoch);
  assert.equal((await put(u, 'payday', 1, { v: 2 })).json.version, 2);
  assert.equal((await put(u, 'payday', 5, { v: 9 })).status, 409, 'baseVersion tương lai cũng bị từ chối');
  assert.equal((await u.get('/api/sync/payday')).json.data.v, 2);
});

test('hai máy ghi đồng thời lần đầu: một thắng, một nhận 409 (không lỗi 5xx)', async () => {
  const u = await signup('D', { ip: freshIp() });
  const rs = await Promise.all([put(u, 'fit', 0, { m: 1 }), put(u, 'fit', 0, { m: 2 }), put(u, 'fit', 0, { m: 3 })]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal((await u.get('/api/sync/fit')).json.version, 1);
});

test('cách ly: người khác không đọc/ghi/xóa được tài liệu của mình, tài liệu theo từng app', async () => {
  const a = await signup('E1', { ip: freshIp() }), b = await signup('E2', { ip: freshIp() });
  await put(a, 'payday', 0, { bi_mat: 'của A' });
  assert.deepEqual((await b.get('/api/sync/payday')).json, { epoch: null, version: 0, data: null, updatedAt: null });
  assert.equal((await put(b, 'payday', 0, { của: 'B' })).status, 200, 'B ghi tài liệu riêng của B');
  assert.equal((await a.get('/api/sync/payday')).json.data.bi_mat, 'của A');
  await b.del('/api/sync/payday');
  assert.equal((await a.get('/api/sync/payday')).json.version, 1, 'xóa của B không đụng A');
  assert.equal((await a.get('/api/sync/car')).json.version, 0, 'app khác độc lập');
});

test('đầu vào xấu: baseVersion/data sai kiểu 400; quá kích thước 413; thiếu CSRF 403', async () => {
  const u = await signup('F', { ip: freshIp() });
  for (const body of [{ data: {} }, { baseVersion: '0', data: {} }, { baseVersion: -1, data: {} }, { baseVersion: 0.5, data: {} }, { baseVersion: 0 }, { baseVersion: 0, data: [] }, { baseVersion: 0, data: 'x' }, { baseVersion: 0, data: null }]) {
    assert.equal((await u.req('PUT', '/api/sync/car', body)).status, 400, JSON.stringify(body));
  }
  const big = { x: 'a'.repeat(config.syncMaxBytes + 10) };
  assert.equal((await put(u, 'car', 0, big)).status, 413);
  assert.equal((await u.req('PUT', '/api/sync/car', { baseVersion: 0, data: {} }, { csrf: false })).status, 403);
  assert.equal((await u.get('/api/sync/car')).json.version, 0);
});

test('tài liệu gần trần kích thước được chấp nhận (thân yêu cầu vượt trần 64 KB chung)', async () => {
  const u = await signup('G', { ip: freshIp() });
  const data = { x: 'b'.repeat(config.syncMaxBytes - 200) };
  assert.equal((await put(u, 'car', 0, data)).status, 200);
});

test('xóa: DELETE bỏ tài liệu, đọc lại version 0; xóa tài khoản xóa luôn tài liệu', async () => {
  const u = await signup('H', { ip: freshIp() });
  await put(u, 'car', 0, { a: 1 });
  assert.equal((await u.del('/api/sync/car')).status, 200);
  assert.equal((await u.get('/api/sync/car')).json.version, 0);
  await put(u, 'fit', 0, { a: 1 });
  const uid = (await query('SELECT id FROM users WHERE phone=$1', [(await import('./helper.js')).util.normalizePhone(u.phone)]))[0].id;
  await query('DELETE FROM users WHERE id=$1', [uid]);
  assert.equal((await query('SELECT 1 FROM sync_docs WHERE user_id=$1', [uid])).length, 0);
});

test('epoch: đổi khi tài liệu được tạo lại sau khi xóa, giữ nguyên khi cập nhật', async () => {
  const u = await signup('I', { ip: freshIp() });
  const r1 = await put(u, 'fit', 0, { a: 1 });
  const e1 = r1.json.epoch;
  assert.ok(e1);
  const r2 = await put(u, 'fit', 1, { a: 2 });
  assert.equal(r2.json.epoch, e1);
  assert.equal((await u.get('/api/sync/fit')).json.epoch, e1);
  await u.del('/api/sync/fit');
  const r3 = await put(u, 'fit', 0, { a: 3 });
  assert.notEqual(r3.json.epoch, e1);
});

test('ghi đồng thời nhiều máy cùng phiên bản: đúng một bên thắng, các bên còn lại nhận 409 (không ghi đè lặng lẽ)', async () => {
  const u = await signup('J', { ip: freshIp() });
  await put(u, 'payday', 0, { v: 0 });
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => put(u, 'payday', 1, { v: i + 1 })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 7);
  assert.equal((await u.get('/api/sync/payday')).json.version, 2);
});

test('nhiều yêu cầu ghi sai phiên bản cùng lúc không làm cạn kết nối CSDL (9id vẫn trả lời)', async () => {
  const u = await signup('K', { ip: freshIp() });
  await put(u, 'car', 0, { v: 0 });
  const rs = await Promise.all(Array.from({ length: 30 }, () => put(u, 'car', 9, { v: 'sai' })));
  assert.ok(rs.every((r) => r.status === 409));
  assert.equal((await u.get('/api/sync/car')).status, 200);
});

test('ký tự NUL trong chuỗi bị từ chối 400 (không phải 500)', async () => {
  const u = await signup('L', { ip: freshIp() });
  const r = await u.req('PUT', '/api/sync/car', { baseVersion: 0, data: { x: 'a\u0000b' } });
  assert.equal(r.status, 400);
});
