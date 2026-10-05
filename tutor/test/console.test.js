// API quản trị cho 9app Console: ký HMAC, phản hồi qua bộ kiểm tra chung 9admin/src/contract.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, newTutor, addStudent, ok, config, base, day } from './helper.js';
import * as contract from '../../9admin/src/contract.js';

before(async () => { await boot(); });
after(shutdown);

const KEY = 'k-tutor'; const SECRET = 'bi-mat-kiem-thu-9tutor-0123456789abcdef';
let seq = 0;
async function call(path, { method = 'GET', body = '', key = KEY, secret = SECRET, ts = Math.floor(Date.now() / 1000) - (seq++ % 100) } = {}) {
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

test('manifest, health, summary, users, user detail đều qua bộ kiểm tra contract; không khai money; không lộ học sinh', async () => {
  config.consoleApiKeyId = KEY; config.consoleApiSecret = SECRET;
  const a = await newTutor('Cô Console 1', 'giao_vien_cong'); const b = await newTutor('Cô Console 2'); const c = await newTutor('Cô Console 3');
  const s = await addStudent(a, { name: 'Tên học sinh nhạy cảm', parentPhone: '0911222333' });
  await ok(a.post(`/api/students/${s.id}/link`, {}));
  const l = (await ok(a.post('/api/lessons', { studentId: s.id, day: day(-1), startMin: 600, durationMin: 60 }))).lesson;
  await ok(a.post(`/api/lessons/${l.id}/mark`, { status: 'da_day' }));
  const m = contract.manifest((await call('/manifest')).json);
  assert.equal(m.app.id, 'tutor'); assert.deepEqual(m.capabilities, ['users']);
  assert.equal(contract.health((await call('/health')).json).ok, true);
  const sm = contract.summary((await call('/summary')).json);
  const kpi = Object.fromEntries(sm.kpis.map((k) => [k.id, k.value]));
  assert.ok(kpi.tutors >= 3 && kpi.students >= 1 && kpi.taught_7d >= 1 && kpi.links >= 1);
  assert.ok(sm.alerts.length >= 1);
  const page1 = contract.usersPage((await call('/users?limit=2')).json);
  assert.equal(page1.items.length, 2); assert.equal(page1.hasMore, true);
  const page2 = contract.usersPage((await call('/users?limit=100&after=' + page1.next)).json);
  const all = [...page1.items, ...page2.items];
  assert.equal(new Set(all.map((u) => u.id)).size, all.length, 'phân trang không lặp');
  for (const u of all) { assert.equal(u.phone, ''); assert.ok(u.name); }
  const d = contract.userDetail((await call('/users/' + all[0].id)).json);
  assert.ok(d.fields.length >= 5);
  const everything = JSON.stringify([(await call('/users?limit=100')).json, (await call('/users/' + all[0].id)).json, (await call('/summary')).json]);
  assert.ok(!everything.includes('Tên học sinh nhạy cảm') && !everything.includes('0911222333'), 'không lộ học sinh/SĐT phụ huynh');
  assert.equal((await call('/users/999999')).status, 404);
  assert.equal((await call('/users/abc')).status, 404);
  assert.ok(b && c);
});

test('phát lại đúng yêu cầu đã ký bị từ chối (401), yêu cầu mới thì qua', async () => {
  config.consoleApiKeyId = KEY; config.consoleApiSecret = SECRET;
  const ts = Math.floor(Date.now() / 1000) - 111;
  assert.equal((await call('/health', { ts })).status, 200);
  assert.equal((await call('/health', { ts })).status, 401);
  assert.equal((await call('/health', { ts: ts + 1 })).status, 200);
});
