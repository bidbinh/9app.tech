import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../scripts/serve.mjs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";

test('index.html: CSP đúng, không script/style nội tuyến, có khung cần thiết', () => {
  const html = read('index.html');
  assert.ok(html.includes(`content="${CSP}"`));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'có script nội tuyến');
  assert.ok(!/<style[\s>]/i.test(html), 'có style nội tuyến');
  assert.ok(!/\sstyle=/i.test(html), 'có thuộc tính style');
  assert.ok(html.includes('lang="vi"'));
  assert.ok(html.includes('href="https://9app.tech/"'));
  assert.ok(html.includes('id="main"'));
  assert.ok(html.includes('data-nav="list"') && html.includes('data-nav="about"'));
  assert.ok(html.includes('<script type="module" src="js/app.js">'));
});

test('manifest hợp lệ', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.short_name, '9ticket');
  assert.equal(m.start_url, './index.html');
  assert.ok(m.icons.length >= 3);
});

test('máy chủ tĩnh phục vụ index.html và chặn thư mục tests', async () => {
  const s = await startServer(0);
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const a = await fetch(base + '/index.html');
    assert.equal(a.status, 200);
    const b = await fetch(base + '/tests/shell.test.mjs');
    assert.equal(b.status, 404);
  } finally { s.close(); }
});
