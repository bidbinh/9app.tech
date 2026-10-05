import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { verifyCopies, verifySource, readManifest, SERVER_DIR, BROWSER_DIR, hashFile, defaultSource } from '../scripts/sync-menu-data.js';

test('bản sao menu-data (máy chủ và trình duyệt) khớp MANIFEST và khớp nhau', () => {
  assert.deepEqual(verifyCopies(), []);
  const sm = readManifest(SERVER_DIR); const bm = readManifest(BROWSER_DIR);
  assert.equal(sm.hash, bm.sourceHash);
  assert.ok(sm.dishes >= 277);
  assert.match(sm.hash, /^[0-9a-f]{64}$/);
});

test('bản sao khớp thư mục nguồn menu-data (bỏ qua khi không có nguồn, ví dụ trong Docker)', (t) => {
  const r = verifySource();
  if (!r.present) { t.skip('không có thư mục nguồn ' + defaultSource()); return; }
  assert.deepEqual(r.errs, []);
});

test('sửa một tệp bản sao thì bị phát hiện', () => {
  const f = path.join(SERVER_DIR, 'data', 'seasonal.json');
  const orig = fs.readFileSync(f);
  try {
    fs.writeFileSync(f, Buffer.concat([orig, Buffer.from(' ')]));
    fs.writeFileSync(f, orig.toString('utf8').replace('"version"', '"versionX"'));
    assert.ok(verifyCopies().some((e) => /seasonal/.test(e)));
  } finally { fs.writeFileSync(f, orig); }
  assert.deepEqual(verifyCopies(), []);
});

test('Docker: thư viện nạp được chỉ từ src/menu và public/menu (không đường dẫn ra ngoài 9family)', () => {
  const root = path.join(SERVER_DIR, '..', '..', '..');
  for (const f of ['src/menu/index.js', 'src/menu/lib/src/index.js', 'src/menu/lib/src/load-node.js']) {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/menu-data/.test(txt.replace(/\/\/.*$/gm, '')), f + ' không được tham chiếu menu-data bên ngoài');
  }
  for (const f of ['common.js', 'normalize.js', 'ingredients.json', 'MANIFEST.json']) assert.ok(fs.existsSync(path.join(BROWSER_DIR, f)), 'thiếu public/menu/' + f);
});
