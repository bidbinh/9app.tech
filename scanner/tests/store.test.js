import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, quotaLevel, newId } from '../js/store.js';

const blob = (n) => ({ size: n });
const page = (id, n = 100) => ({ id, src: blob(n), thumb: blob(10), corners: [], filter: 'magic', rot: 0 });

test('Store (bộ nhớ tạm): lưu, đọc lại đúng thứ tự trang, tính dung lượng', async () => {
  const s = await Store.create(true);
  assert.equal(s.persistent, false);
  const doc = { id: newId(), name: 'Hợp đồng', folder: '', pages: [page('a'), page('b'), page('c')] };
  await s.saveDoc(doc);
  const got = await s.getDoc(doc.id);
  assert.deepEqual(got.pages.map((p) => p.id), ['a', 'b', 'c']);
  assert.equal(got.count, 3);
  assert.equal(got.bytes, 330);
  // đổi thứ tự + xóa một trang
  doc.pages = [doc.pages[2], doc.pages[0]];
  await s.saveDoc(doc);
  const again = await s.getDoc(doc.id);
  assert.deepEqual(again.pages.map((p) => p.id), ['c', 'a']);
  assert.equal(again.count, 2);
});

test('Store: danh sách theo thời gian sửa, đổi tên, đổi thư mục, xóa', async () => {
  const s = await Store.create(true);
  const a = { id: 'a', name: 'A', pages: [page('a1')] };
  const b = { id: 'b', name: 'B', pages: [page('b1')] };
  await s.saveDoc(a);
  await new Promise((r) => setTimeout(r, 5));
  await s.saveDoc(b);
  assert.deepEqual((await s.listDocs()).map((d) => d.id), ['b', 'a']);
  await s.renameDoc('a', 'Hóa đơn điện', 'Nhà');
  const m = await s.getDoc('a');
  assert.equal(m.name, 'Hóa đơn điện'); assert.equal(m.folder, 'Nhà');
  assert.equal((await s.listDocs())[0].id, 'a');
  await s.deleteDoc('a');
  assert.equal(await s.getDoc('a'), null);
  assert.equal((await s.b.pagesOf('a')).length, 0);
});

test('Store: thư mục đơn giản; xóa thư mục đưa tài liệu về gốc', async () => {
  const s = await Store.create(true);
  await s.addFolder('Nhà'); await s.addFolder('Nhà'); await s.addFolder('  ');
  assert.deepEqual(await s.listFolders(), ['Nhà']);
  await s.saveDoc({ id: 'x', name: 'X', folder: 'Nhà', pages: [page('x1')] });
  await s.removeFolder('Nhà');
  assert.deepEqual(await s.listFolders(), []);
  assert.equal((await s.getDoc('x')).folder, '');
});

test('Store: chữ ký lưu và xóa', async () => {
  const s = await Store.create(true);
  const r = await s.saveSig(blob(500));
  assert.equal((await s.listSigs()).length, 1);
  await s.deleteSig(r.id);
  assert.equal((await s.listSigs()).length, 0);
});

test('quotaLevel', () => {
  assert.equal(quotaLevel(10, 100), 'ok');
  assert.equal(quotaLevel(75, 100), 'warn');
  assert.equal(quotaLevel(95, 100), 'full');
  assert.equal(quotaLevel(null, 100), 'unknown');
  assert.equal(quotaLevel(10, null), 'unknown');
});

test('Store: chỉ ghi lại trang đã đổi (dirty) và giữ đúng thứ tự', async () => {
  const s = await Store.create(true);
  const doc = { id: 'd', name: 'D', pages: [page('p1'), page('p2'), page('p3')] };
  await s.saveDoc(doc);
  let puts = 0;
  const origPut = s.b.put.bind(s.b);
  s.b.put = async (store, v) => { if (store === 'pages') puts++; return origPut(store, v); };
  doc.pages = [doc.pages[2], doc.pages[0], doc.pages[1]];
  await s.saveDoc(doc, new Set());
  assert.equal(puts, 0, 'đổi thứ tự không được ghi lại ảnh');
  await s.saveDoc(doc, new Set(['p2']));
  assert.equal(puts, 1);
  assert.deepEqual((await s.getDoc('d')).pages.map((p) => p.id), ['p3', 'p1', 'p2']);
});
