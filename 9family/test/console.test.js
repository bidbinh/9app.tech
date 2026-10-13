// API quản trị cho 9app Console: ký HMAC, phản hồi qua bộ kiểm tra chung 9admin/src/contract.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeFamily, addChild, config, base, ok, db } from './helper.js';
import * as contract from '../../9admin/src/contract.js';

before(async () => { await boot(); });
after(shutdown);

const KEY = 'k-family'; const SECRET = 'bi-mat-kiem-thu-9family-0123456789abcdef';
async function call(path, { method = 'GET', body = '', key = KEY, secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const url = new URL(base + '/admin-api/v1' + path);
  const pathq = url.pathname + url.search;
  const headers = { 'x-console-key': key, 'x-console-ts': String(ts), 'x-console-sig': contract.sign(secret, String(ts), method, pathq, body) };
  const r = await fetch(url, { method, headers });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: r.status, json, text };
}

test('chưa cấu hình khóa thì API quản trị không tồn tại (404)', async () => {
  config.consoleApiKeyId = ''; config.consoleApiSecret = '';
  assert.equal((await call('/manifest')).status, 404);
});

test('sai khóa, sai chữ ký, lệch giờ bị từ chối', async () => {
  config.consoleApiKeyId = KEY; config.consoleApiSecret = SECRET;
  assert.equal((await call('/manifest', { key: 'khac' })).status, 401);
  assert.equal((await call('/manifest', { secret: 'sai-bi-mat-sai-bi-mat-sai-bi-mat' })).status, 401);
  assert.equal((await call('/manifest', { ts: Math.floor(Date.now() / 1000) - 600 })).status, 401);
  assert.equal((await fetch(base + '/admin-api/v1/manifest')).status, 401);
});

test('manifest, health, summary, users, user detail đều qua bộ kiểm tra contract; không khai money; không lộ tên con', async () => {
  config.consoleApiKeyId = KEY; config.consoleApiSecret = SECRET;
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội']);
  await addChild(fam, 'TênConBíMật');
  await ok(fam.owner.post(`${fam.F}/members`, { name: 'Cô Hoa', external: true, phone: '0912345678' }));
  const m = contract.manifest((await call('/manifest')).json);
  assert.equal(m.app.id, 'family'); assert.deepEqual(m.capabilities, ['users']); assert.ok(!m.capabilities.includes('money'));
  assert.equal(contract.health((await call('/health')).json).ok, true);
  const s = contract.summary((await call('/summary')).json);
  const kpi = Object.fromEntries(s.kpis.map((k) => [k.id, k.value]));
  assert.ok(kpi.families >= 1 && kpi.users >= 3);
  const page1 = contract.usersPage((await call('/users?limit=2')).json);
  assert.equal(page1.items.length, 2); assert.equal(page1.hasMore, true);
  const page2 = contract.usersPage((await call('/users?limit=100&after=' + page1.next)).json);
  assert.ok(page2.items.length >= 1);
  const all = [...page1.items, ...page2.items];
  assert.equal(new Set(all.map((u) => u.id)).size, all.length, 'phân trang không lặp');
  assert.ok(!all.some((u) => u.name === 'Cô Hoa'), 'người đón hộ không phải người dùng');
  for (const u of all) { assert.equal(u.phone, ''); assert.ok(u.name); }
  const dr = await call('/users/' + all[0].id); if (dr.status !== 200) console.log('DETAIL', dr.status, dr.text);
  const d = contract.userDetail(dr.json);
  assert.ok(d.fields.length >= 4);
  assert.ok(all.every((u) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u.id)), 'id người dùng là user_id của 9id');
  assert.equal((await call('/users/00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await call('/users/999999')).status, 404);
  assert.equal((await call('/users/abc')).status, 404);
  const everything = JSON.stringify([(await call('/summary')).json, (await call('/users?limit=100')).json, (await call('/users/' + all[0].id)).json]);
  assert.ok(!everything.includes('TênConBíMật') && !everything.includes('0912345678'));
  assert.ok(!/\+?84\d{8,9}|0\d{9}/.test(everything), 'không có số điện thoại');
});

test('L4: phát lại cùng một yêu cầu đã ký bị từ chối; /users/:id không trả người chưa vào hoặc đã rời', async () => {
  config.consoleApiKeyId = KEY; config.consoleApiSecret = SECRET;
  const ts = Math.floor(Date.now() / 1000) + 40; // dải giờ riêng, không trùng chữ ký của các test khác
  assert.equal((await call('/manifest', { ts })).status, 200);
  assert.equal((await call('/manifest', { ts })).status, 401, 'cùng ts + chữ ký thì là phát lại');
  assert.equal((await call('/manifest', { ts: ts + 1 })).status, 200);
  const fam = await makeFamily(['Mẹ', 'Bố']);
  assert.equal((await call('/users/' + fam.userIds['Bố'], { ts: ts + 3 })).status, 200);
  await fam.leave('Bố');
  assert.equal((await call('/users/' + fam.userIds['Bố'], { ts: ts + 4 })).status, 404, 'đã rời');
  // một người ở hai gia đình chỉ là một dòng
  const fam2 = await makeFamily(['Mẹ']);
  fam.fake.addMember(fam2.fid, fam.userIds['Mẹ'], 'thanh_vien');
  await ok(fam.owner.get(fam2.F));
  const list = (await call('/users?limit=1000', { ts: ts + 5 })).json.items.filter((u) => u.id === fam.userIds['Mẹ']);
  assert.equal(list.length, 1); assert.equal(list[0].extra.so_gia_dinh, 2);
});
