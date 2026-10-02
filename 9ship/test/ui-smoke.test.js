import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/server.js';
import { syncPickupPoints } from '../src/places.js';
import { setup, close } from './helpers.js';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
let app; let base;
before(async () => {
  await setup();
  await syncPickupPoints();
  app = buildApp();
  base = 'http://127.0.0.1:' + await app.listen(0);
});
after(async () => { await app.close(); await close(); });

test('trang chủ phục vụ được ở / và /9ship/, có CSP, không dùng module', async () => {
  for (const p of ['/', '/9ship/', '/9ship/index.html']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    const html = await r.text();
    assert.ok(html.includes('9Ship'));
    assert.ok(!/type=["']module["']/.test(html), 'không dùng ES module');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('trang quản trị có noindex và các tệp tĩnh có đúng kiểu', async () => {
  const html = await (await fetch(base + '/9ship/admin.html')).text();
  assert.ok(html.includes('noindex'));
  const css = await fetch(base + '/9ship/style.css');
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await fetch(base + '/9ship/app.js');
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(base + '/9ship/../package.json')).status === 200, false);
  assert.equal((await fetch(base + '/9ship/%2e%2e/package.json')).status === 200, false);
});

test('JS giao diện đúng cú pháp, kiểu ES5 (không mũi tên, let/const, template) và gọi API bằng đường dẫn tương đối', () => {
  for (const f of ['app.js', 'admin.js', 'label.js']) {
    const src = fs.readFileSync(path.join(PUB, f), 'utf8');
    assert.doesNotThrow(() => new vm.Script(src, { filename: f }), f);
    assert.ok(!/=>/.test(src), f + ' có hàm mũi tên');
    assert.ok(!/\b(let|const)\s/.test(src), f + ' có let/const');
    assert.ok(!/`/.test(src), f + ' có template literal');
    assert.ok(!/^\s*(import|export)\s/m.test(src), f + ' có import/export');
    assert.ok(!/['"]\/v1\//.test(src), f + ' gọi API bằng đường dẫn tuyệt đối');
    assert.ok(!/\beval\(|new Function\(/.test(src), f + ' dùng eval');
  }
});

test('HTML không có script nội tuyến (để CSP script-src self hoạt động)', () => {
  for (const f of ['index.html', 'admin.html']) {
    const src = fs.readFileSync(path.join(PUB, f), 'utf8');
    for (const m of src.matchAll(/<script\b([^>]*)>/g)) assert.ok(/\bsrc=/.test(m[1]), f + ' có script nội tuyến');
  }
});

test('innerHTML chỉ dùng cho SVG mã QR do máy chủ sinh', () => {
  const src = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  const uses = src.match(/innerHTML/g) || [];
  assert.equal(uses.length, 1);
  assert.ok(src.includes('qrbox').valueOf());
  assert.ok(!fs.readFileSync(path.join(PUB, 'admin.js'), 'utf8').includes('innerHTML'));
});

test('/healthz hoạt động; meta cho giao diện đủ trường', async () => {
  assert.equal((await (await fetch(base + '/healthz')).json()).ok, true);
  const m = await (await fetch(base + '/9ship/v1/meta')).json();
  assert.ok(m.bufferPct > 0 && m.bufferMin > 0);
  assert.equal(typeof m.demo, 'boolean');
});
