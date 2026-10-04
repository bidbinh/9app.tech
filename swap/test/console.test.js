// API quản trị cho 9app Console: ký HMAC, phản hồi qua bộ kiểm tra chung 9admin/src/contract.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeCommunity, makeListing, config, base } from './helper.js';
import * as contract from '../../9admin/src/contract.js';

before(async () => { await boot(); });
after(shutdown);

const KEY = 'k-swap'; const SECRET = 'bi-mat-kiem-thu-9swap-0123456789abcdef';
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
  // chữ ký của đường dẫn khác không dùng lại được cho đường dẫn này
  const ts = String(Math.floor(Date.now() / 1000));
  const r = await fetch(base + '/admin-api/v1/users', { headers: { 'x-console-key': KEY, 'x-console-ts': ts, 'x-console-sig': contract.sign(SECRET, ts, 'GET', '/swap/admin-api/v1/manifest') } });
  assert.equal(r.status, 401);
});

test('manifest, health, summary, users, user detail đều qua bộ kiểm tra contract; không khai money', async () => {
  config.consoleApiKeyId = KEY; config.consoleApiSecret = SECRET;
  const t = await makeCommunity(['Chủ', 'An', 'Bình']);
  await makeListing(t, 'An');
  const m = contract.manifest((await call('/manifest')).json);
  assert.equal(m.app.id, 'swap'); assert.deepEqual(m.capabilities, ['users']); assert.ok(!m.capabilities.includes('money'));
  assert.equal(contract.health((await call('/health')).json).ok, true);
  const s = contract.summary((await call('/summary')).json);
  const kpi = Object.fromEntries(s.kpis.map((k) => [k.id, k.value]));
  assert.ok(kpi.communities >= 1 && kpi.users >= 3 && kpi.open_listings >= 1);
  const page1 = contract.usersPage((await call('/users?limit=2')).json);
  assert.equal(page1.items.length, 2); assert.equal(page1.hasMore, true);
  const page2 = contract.usersPage((await call('/users?limit=100&after=' + page1.next)).json);
  assert.ok(page2.items.length >= 1);
  const all = [...page1.items, ...page2.items];
  assert.equal(new Set(all.map((u) => u.id)).size, all.length, 'phân trang không lặp');
  for (const u of all) { assert.equal(u.phone, ''); assert.ok(u.name); }
  const d = contract.userDetail((await call('/users/' + all[0].id)).json);
  assert.ok(d.fields.length >= 5);
  assert.equal((await call('/users/999999')).status, 404);
  assert.equal((await call('/users/abc')).status, 404);
});
