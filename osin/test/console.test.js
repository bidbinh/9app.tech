// API Console (hợp đồng 9admin/src/contract.js), chỉ mục tìm kiếm cho launcher, giới hạn tần suất theo IP (XFF phần tử cuối), kiểm tra sống.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, shutdown, Client, ok, createMockProvider, config, db, base } from './helper.js';
import { sign } from '../src/console-api.js';

const llm = createMockProvider([]);
const SECRET = 'console-secret-0123456789abcdef0123456789';
let contract = null;
before(async () => {
  const p = new URL('../../9admin/src/contract.js', import.meta.url);
  if (fs.existsSync(p)) contract = await import(p.href);
  config.consoleApiKeyId = 'hub'; config.consoleApiSecret = SECRET;
  await boot({ llm, apps: [] });
});
after(shutdown);

let n = 0;
async function consoleGet(path, { secret = SECRET, ts = Math.floor(Date.now() / 1000), key = 'hub', repeatSig } = {}) {
  const full = config.basePath + path;
  const sig = repeatSig || sign(secret, String(ts), 'GET', full, '');
  void n++;
  const r = await fetch(base.replace(config.basePath, '') + full, { headers: { 'x-console-key': key, 'x-console-ts': String(ts), 'x-console-sig': sig } });
  return { status: r.status, json: await r.json().catch(() => null), sig, ts };
}

test('Console: manifest, health, summary đúng hợp đồng 9admin và KHÔNG lộ nội dung hội thoại', async () => {
  const c = new Client('cs'); await c.consent();
  llm.reset(() => ({ text: 'Trả lời bí mật XYZ-TRALOI', tokens: 321 }));
  await ok(c.chat('Nội dung hội thoại bí mật ABC-HOITHOAI của Lan'));
  const m = await consoleGet('/admin-api/v1/manifest');
  assert.equal(m.status, 200); assert.equal(m.json.app.id, 'osin'); assert.deepEqual(m.json.capabilities, []);
  const h = await consoleGet('/admin-api/v1/health');
  assert.equal(h.json.ok, true);
  const s = await consoleGet('/admin-api/v1/summary');
  assert.equal(s.status, 200);
  const kpi = Object.fromEntries(s.json.kpis.map((k) => [k.id, k.value]));
  assert.equal(kpi.users_today, 1); assert.equal(kpi.msgs_today, 1); assert.equal(kpi.tokens_today, 321); assert.equal(kpi.errors_today, 0);
  const all = JSON.stringify([m.json, h.json, s.json]);
  for (const leak of ['ABC-HOITHOAI', 'XYZ-TRALOI', 'Lan', c.userId]) assert.ok(!all.includes(leak), 'lộ ' + leak);
  assert.equal((await consoleGet('/admin-api/v1/users')).status, 404, 'không khai capability users nên không có danh sách người dùng');
  if (contract) {
    assert.doesNotThrow(() => contract.manifest(m.json)); assert.doesNotThrow(() => contract.health(h.json)); assert.doesNotThrow(() => contract.summary(s.json));
    const ts = Math.floor(Date.now() / 1000);
    assert.equal(sign('k'.repeat(32), String(ts), 'GET', '/x', ''), contract.sign('k'.repeat(32), String(ts), 'GET', '/x', ''), 'cùng thuật toán ký với hợp đồng');
  }
});

test('Console: sai chữ ký, sai khóa, lệch giờ, phát lại, chưa cấu hình đều bị từ chối', async () => {
  assert.equal((await consoleGet('/admin-api/v1/summary', { secret: 'sai'.repeat(12) })).status, 401);
  assert.equal((await consoleGet('/admin-api/v1/summary', { key: 'khac' })).status, 401);
  assert.equal((await consoleGet('/admin-api/v1/summary', { ts: Math.floor(Date.now() / 1000) - 500 })).status, 401);
  await new Promise((r) => setTimeout(r, 1100)); // Console thật không gửi hai yêu cầu y hệt trong cùng một giây
  const first = await consoleGet('/admin-api/v1/summary');
  assert.equal(first.status, 200);
  assert.equal((await consoleGet('/admin-api/v1/summary', { ts: first.ts, repeatSig: first.sig })).status, 401, 'phát lại');
  const r = await fetch(base.replace(config.basePath, '') + config.basePath + '/admin-api/v1/summary');
  assert.equal(r.status, 401);
  config.consoleApiSecret = '';
  try { assert.equal((await consoleGet('/admin-api/v1/health')).status, 404); } finally { config.consoleApiSecret = SECRET; }
});

test('search-index.json: đúng định dạng SEARCH-INDEX.md (name, keywords có bản không dấu, path hash duy nhất, blurb)', async () => {
  const r = await fetch(base + '/search-index.json');
  assert.equal(r.status, 200);
  const idx = await r.json();
  assert.ok(Array.isArray(idx) && idx.length >= 3);
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const paths = new Set();
  for (const e of idx) {
    assert.deepEqual(Object.keys(e).sort(), ['blurb', 'keywords', 'name', 'path']);
    assert.ok(e.name && e.blurb && e.keywords.length);
    assert.ok(e.path === '' || /^#\//.test(e.path), e.path);
    assert.ok(!paths.has(e.path)); paths.add(e.path);
    assert.equal(new Set(e.keywords).size, e.keywords.length, 'không trùng');
    for (const k of e.keywords) { assert.equal(k, k.toLowerCase()); if (fold(k) !== k) assert.ok(e.keywords.includes(fold(k)), 'thiếu bản không dấu của ' + k); }
  }
  assert.ok(idx.some((e) => e.path === ''));
});

test('healthz và trang chủ; lỗi không lộ dấu vết nội bộ', async () => {
  assert.equal((await fetch(base + '/healthz')).status, 200);
  const nf = await fetch(base + '/api/khong-co');
  assert.equal(nf.status, 404);
  assert.deepEqual(Object.keys((await nf.json()).error).sort(), ['code', 'message']);
  const txt = await (await fetch(base + '/api/me')).text();
  assert.ok(!/at .*\.js|node_modules|stack/i.test(txt));
});

test('giới hạn tần suất theo IP: lấy phần tử CUỐI của X-Forwarded-For (không để khách giả IP), IPv6 gom /64', async () => {
  const saved = config.rateLimitPerMin;
  config.rateLimitPerMin = 5;
  try {
    const hit = (xff) => fetch(base + '/healthz', { headers: { 'x-forwarded-for': xff } }).then((r) => r.status);
    const a = []; for (let i = 0; i < 8; i++) a.push(await hit(`10.9.9.${i}, 203.0.113.50`)); // khách giả phần tử đầu, proxy ghi phần tử cuối
    assert.deepEqual(a, [200, 200, 200, 200, 200, 429, 429, 429], 'đổi phần tử đầu không né được giới hạn');
    assert.equal(await hit('1.1.1.1, 203.0.113.51'), 200, 'IP thật khác thì độc lập');
    const v6 = []; for (let i = 0; i < 7; i++) v6.push(await hit(`2001:db8:abcd:12::${i + 1}`));
    assert.equal(v6.filter((s) => s === 429).length, 2, 'cùng /64 dùng chung một bộ đếm');
    assert.equal(await hit('2001:db8:abcd:13::1'), 200);
  } finally { config.rateLimitPerMin = saved; }
});

test('migration chạy lặp lại không lỗi và có khóa tư vấn (hai bản khởi động đồng thời)', async () => {
  await Promise.all([db.migrate(), db.migrate(), db.migrate()]);
  const t = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1");
  assert.deepEqual(t.map((x) => x.tablename), ['messages', 'osin_sessions', 'pending_actions', 'schema_migrations', 'usage_daily', 'user_prefs']);
});
