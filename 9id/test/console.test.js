import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boot, shutdown, signup, makeFamily, config, origin, signConsole, ok } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

const here = path.dirname(fileURLToPath(import.meta.url));
const contractFile = path.join(here, '..', '..', '9admin', 'src', 'contract.js');
const contract = fs.existsSync(contractFile) ? await import(pathToFileURL(contractFile).href) : null;

async function call(pathq, { key = config.consoleApiKeyId, secret = config.consoleApiSecret, ts, sig, method = 'GET' } = {}) {
  const t = ts ?? String(Math.floor(Date.now() / 1000));
  const full = '/id/admin-api/v1' + pathq;
  const h = { 'x-console-key': key, 'x-console-ts': t, 'x-console-sig': sig ?? signConsole(secret, t, method, full, '') };
  const r = await fetch(origin + full, { method, headers: h });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json, text };
}

test('Console: xác thực HMAC, từ chối thiếu/sai chữ ký/lệch giờ/khóa lạ', async () => {
  assert.equal((await fetch(origin + '/id/admin-api/v1/manifest')).status, 401);
  assert.equal((await call('/manifest')).status, 200);
  assert.equal((await call('/manifest', { secret: 'sai-secret-sai-secret-sai-secret-xx' })).status, 401);
  assert.equal((await call('/manifest', { key: 'khac' })).status, 401);
  assert.equal((await call('/manifest', { ts: String(Math.floor(Date.now() / 1000) - 1000) })).status, 401);
  assert.equal((await call('/manifest', { sig: 'a'.repeat(64) })).status, 401);
  const old = config.consoleApiSecret; config.consoleApiSecret = '';
  try { assert.equal((await call('/manifest', { secret: old })).status, 404, 'tắt khi chưa đặt khóa'); } finally { config.consoleApiSecret = old; }
  // ký cho đường dẫn khác thì không dùng được cho /users
  const t = String(Math.floor(Date.now() / 1000));
  const sigManifest = signConsole(config.consoleApiSecret, t, 'GET', '/id/admin-api/v1/manifest', '');
  assert.equal((await call('/users', { ts: t, sig: sigManifest })).status, 401);
  // endpoint ghi không tồn tại
  assert.equal((await call('/users', { method: 'POST' })).status, 405);
});

test('Console: manifest, health, summary, users, user theo đúng hợp đồng và không lộ số điện thoại', async () => {
  const a = await signup('Hoàng Console', {}); const b = await signup('Bình Console', {});
  const fid = await makeFamily(a, 'Nhà Console');
  await ok(a.post(`/api/families/${fid}/invites`, { phone: b.phone }));
  const man = (await call('/manifest')).json;
  assert.deepEqual(man.capabilities, ['users']); assert.equal(man.app.id, 'id');
  assert.equal((await call('/health')).json.ok, true);
  const sum = (await call('/summary')).json;
  const kpi = Object.fromEntries(sum.kpis.map((k) => [k.id, k.value]));
  assert.ok(kpi.users >= 2 && kpi.families >= 1 && kpi.pending >= 1);
  const users = await call('/users?limit=1');
  assert.equal(users.json.items.length, 1); assert.equal(users.json.hasMore, true);
  const page2 = (await call('/users?limit=500&after=' + users.json.next)).json;
  assert.ok(page2.items.length >= 1 && page2.items.every((u) => Number(u.id) > Number(users.json.next)));
  const u = (await call('/users?limit=1000')).json.items.find((x) => x.name === 'Hoàng Console');
  assert.equal(u.extra.so_cuoi, a.phone.slice(-4)); assert.equal(u.extra.so_gia_dinh, 1);
  const d = (await call('/users/' + u.id)).json;
  assert.equal(d.title, 'Hoàng Console');
  assert.equal((await call('/users/abc')).status, 404); assert.equal((await call('/users/999999')).status, 404);
  const everything = [man, sum, users.json, page2, d].map((x) => JSON.stringify(x)).join('') + (await call('/users?limit=1000')).text;
  for (const p of [a.phone, b.phone]) assert.ok(!everything.includes(p.slice(1)) && !everything.includes('+84'), 'không lộ số điện thoại đầy đủ');
  if (contract) {
    contract.manifest(man); contract.health((await call('/health')).json); contract.summary(sum);
    contract.usersPage(users.json); contract.usersPage((await call('/users?limit=1000')).json); contract.userDetail(d);
  }
});
