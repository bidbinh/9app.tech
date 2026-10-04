import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { root, questions } from './helpers.mjs';
import { connectionOk, imageUrls, start, stop, cachedSet, IMG_CACHE } from '../js/prefetch.js';

function fakeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        async match(u) { return m.get(typeof u === 'string' ? u : u.url); },
        async put(u, r) { m.set(typeof u === 'string' ? u : u.url, r); },
        async keys() { return [...m.keys()].map((k) => ({ url: 'http://x/license/' + k })); },
      };
    },
  };
}

test('prefetch: connectionOk tôn trọng tiết kiệm dữ liệu, 2G và ngoại tuyến', () => {
  assert.equal(connectionOk({ onLine: true }), true);
  assert.equal(connectionOk({ onLine: false }), false);
  assert.equal(connectionOk({ onLine: true, connection: { saveData: true } }), false);
  assert.equal(connectionOk({ onLine: true, connection: { effectiveType: '2g' } }), false);
  assert.equal(connectionOk({ onLine: true, connection: { effectiveType: '4g' } }), true);
});

test('prefetch: tải đủ 312 hình có tiến độ, lần sau chỉ tải phần thiếu', async () => {
  const urls = imageUrls(questions);
  assert.equal(urls.length, 312);
  const caches = fakeCaches();
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: true }; };
  const r = await start(urls, { fetchFn, cachesApi: caches });
  assert.equal(r.done, 312);
  assert.equal(r.finished, true);
  assert.equal(calls, 312);
  assert.equal((await cachedSet(urls, caches)).size, 312);
  await start(urls, { fetchFn, cachesApi: caches });
  assert.equal(calls, 312, 'không tải lại hình đã có');
});

test('prefetch: ngắt được giữa chừng và tiếp tục được; lỗi mạng được đếm', async () => {
  const urls = imageUrls(questions).slice(0, 40);
  const caches = fakeCaches();
  let n = 0;
  const fetchFn = async () => { n++; if (n === 5) stop(); return { ok: true }; };
  const r = await start(urls, { fetchFn, cachesApi: caches, workers: 1 });
  assert.equal(r.finished, false);
  assert.ok(r.done < 40 && r.done >= 4);
  const have = (await cachedSet(urls, caches)).size;
  assert.ok(have < 40);
  const r2 = await start(urls, { fetchFn: async () => ({ ok: true }), cachesApi: caches });
  assert.equal(r2.finished, true);
  const r3 = await start(urls.slice(0, 3), { fetchFn: async () => { throw new Error('mạng'); }, cachesApi: fakeCaches(), workers: 1 });
  assert.equal(r3.failed, 3);
  assert.equal(r3.finished, false);
});

// ---------- Service worker: mạng trước có hạn chót ----------
function loadSW({ fetchImpl, cacheHit, timeout }) {
  const listeners = {};
  const put = [];
  const self = {
    __SW_TEST: { timeout },
    addEventListener: (t, f) => { listeners[t] = f; },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const ctx = {
    self,
    location: { origin: 'http://x' },
    URL,
    Response: class { static error() { return { error: true }; } },
    caches: { match: async () => cacheHit, open: async () => ({ put: async (r, res) => put.push(res), match: async () => undefined }), keys: async () => [] },
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), ctx);
  const run = (url) => new Promise((resolve) => listeners.fetch({ request: { method: 'GET', url, mode: 'navigate' }, respondWith: (p) => resolve(p) }));
  return { run, put };
}
const netRes = (tag) => ({ ok: true, tag, clone() { return this; } });

test('SW: mạng chậm quá hạn thì dùng bản lưu ngay, không chờ; bản mạng đến muộn vẫn được lưu', async () => {
  const slow = () => new Promise((r) => setTimeout(() => r(netRes('net')), 400));
  const sw = loadSW({ fetchImpl: slow, cacheHit: { tag: 'cache' }, timeout: 60 });
  const t0 = Date.now();
  const res = await sw.run('http://x/license/js/app.js');
  assert.equal(res.tag, 'cache');
  assert.ok(Date.now() - t0 < 300, 'phải trả lời trước khi mạng về');
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(sw.put.length, 1);
});

test('SW: mạng nhanh dùng bản mạng; mạng lỗi dùng bản lưu; quá hạn mà chưa có bản lưu thì chờ mạng', async () => {
  const fast = loadSW({ fetchImpl: async () => netRes('net'), cacheHit: { tag: 'cache' }, timeout: 200 });
  assert.equal((await fast.run('http://x/license/js/app.js')).tag, 'net');
  const down = loadSW({ fetchImpl: async () => { throw new Error('off'); }, cacheHit: { tag: 'cache' }, timeout: 200 });
  assert.equal((await down.run('http://x/license/js/app.js')).tag, 'cache');
  const noCache = loadSW({ fetchImpl: () => new Promise((r) => setTimeout(() => r(netRes('net')), 150)), cacheHit: undefined, timeout: 30 });
  assert.equal((await noCache.run('http://x/license/js/app.js')).tag, 'net');
});

test('SW: đã tăng version và có prefetch.js trong danh sách lưu sẵn', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /VERSION = 'v([2-9]|\d\d+)'/);
  assert.match(sw, /js\/prefetch\.js/);
  assert.equal(IMG_CACHE, '9license-img-v1');
});
