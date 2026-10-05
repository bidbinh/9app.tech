import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const idx = JSON.parse(fs.readFileSync(new URL('../search-index.json', import.meta.url), 'utf8'));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
test('chỉ mục tìm kiếm đúng định dạng SEARCH-INDEX', () => {
  assert.ok(Array.isArray(idx) && idx.length >= 15);
  const paths = new Set();
  for (const e of idx) {
    assert.deepEqual(Object.keys(e).sort(), ['blurb', 'keywords', 'name', 'path']);
    assert.match(e.path, /^#\//); assert.ok(!e.path.includes('?'), e.path);
    assert.ok(!paths.has(e.path)); paths.add(e.path);
    assert.equal(new Set(e.keywords).size, e.keywords.length);
    for (const k of e.keywords) { assert.equal(k, k.toLowerCase()); assert.ok(e.keywords.includes(fold(k)), `thiếu bản không dấu của "${k}"`); }
    assert.ok(e.blurb.length > 10);
  }
});
test('mọi tệp trong vỏ service worker đều tồn tại', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const f of files) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), f);
  // và mọi tệp js đều nằm trong vỏ
  const walk = (d) => fs.readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(d + '/' + x.name) : [d + '/' + x.name]));
  for (const f of walk('js')) assert.ok(files.includes(f), `thiếu trong sw.js: ${f}`);
});
