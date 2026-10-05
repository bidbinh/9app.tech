import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NS, buildEngine, loadApps, HERE } from './helpers.mjs';

const { eng, APPS, total } = buildEngine();
const top = (q, n = 1) => eng.search(q).items.slice(0, n).map((x) => x.doc.href.replace('https://9app.tech', ''));

test('fold: bỏ dấu, đ thành d, chữ thường', () => {
  assert.equal(NS.fold('Văn khấn'), 'van khan');
  assert.equal(NS.fold('ĐỔI ĐƠN VỊ'), 'doi don vi');
  assert.equal(NS.fold('đ Đ'), 'd d');
  assert.equal(NS.fold(null), '');
  assert.equal(NS.fold('Rằm tháng 7'), 'ram thang 7');
});

test('tokens và norm bỏ dấu câu, giữ số', () => {
  assert.deepEqual(NS.tokens('Văn khấn: Cúng giỗ (7/2)'), ['van', 'khan', 'cung', 'gio', '7', '2']);
  assert.equal(NS.norm('  Hộp   thư '), 'hop thu');
});

test('osa: sửa, chèn, xóa, đảo chữ', () => {
  assert.equal(NS.osa('khan', 'khan', 2), 0);
  assert.equal(NS.osa('khan', 'kahn', 2), 1);
  assert.equal(NS.osa('khan', 'khann', 2), 1);
  assert.equal(NS.osa('khan', 'khn', 2), 1);
  assert.ok(NS.osa('abcdef', 'uvwxyz', 2) > 2);
});

test('normalizeFeature: nhận hợp lệ, loại hỏng', () => {
  assert.deepEqual(NS.normalizeFeature({ name: ' A  b ', keywords: ['x', 5, ''], path: '#/a', blurb: 'm' }), { name: 'A b', keywords: ['x'], path: '#/a', blurb: 'm' });
  assert.equal(NS.normalizeFeature(null), null);
  assert.equal(NS.normalizeFeature({ name: '', path: '#/a' }), null);
  assert.equal(NS.normalizeFeature({ path: '#/a' }), null);
  assert.equal(NS.normalizeFeature({ name: 'A', keywords: 'sai', path: 5 }).path, '');
});

test('resolveHref: ghép vào app, chặn javascript: và nguồn lạ', () => {
  const b = 'https://9app.tech/';
  assert.equal(NS.resolveHref('vannien/', '#/van-khan', b), 'https://9app.tech/vannien/#/van-khan');
  assert.equal(NS.resolveHref('race/', '#/?type=trail', b), 'https://9app.tech/race/#/?type=trail');
  assert.equal(NS.resolveHref('scanner/', '', b), 'https://9app.tech/scanner/');
  assert.equal(NS.resolveHref('https://x.com/?from=9app', '#/a', b), 'https://x.com/?from=9app#/a');
  assert.equal(NS.resolveHref('unit/', 'javascript:alert(1)', b), null);
  assert.equal(NS.resolveHref('unit/', 'https://evil.example/', b), null);
  assert.equal(NS.resolveHref('unit/', '//evil.example/x', b), null);
});

test('chỉ mục dựng được: đủ app có index, không trùng khóa', () => {
  assert.ok(total > 150, 'tổng mục ' + total);
  assert.equal(eng.size(), total);
});

test('kết quả mục tiêu: gõ không dấu và có dấu cùng một đích', () => {
  assert.equal(top('van khan')[0], '/vannien/#/van-khan');
  assert.deepEqual(top('văn khấn'), top('van khan'));
  assert.deepEqual(top('VĂN KHẤN '), top('van khan'));
  assert.equal(top('doi don vi')[0], '/unit/#/doi-don-vi');
  assert.equal(top('đổi đơn vị')[0], '/unit/#/doi-don-vi');
  assert.equal(top('quet tai lieu')[0], '/scanner/');
  assert.equal(top('mau cv')[0], '/interview/#/cv');
  assert.equal(top('giai chay')[0], '/race/');
  assert.ok(top('bang lai', 2).includes('/license/'));
  assert.ok(top('chi vang', 2).includes('/unit/#/doi-don-vi/khoiluong'));
  assert.ok(top('ram thang 7', 3).includes('/vannien/#/van-khan/co-hon'));
});

test('xếp hạng: mục gốc trước mục con; tên trước từ khóa trước mô tả', () => {
  assert.equal(eng.search('van khan').items[0].doc.name, 'Văn khấn');
  const e = new NS.Engine();
  const app = { id: 'a', name: 'App', icon: '' };
  const mk = (name, kw, blurb, path) => NS.makeDoc(app, { name, keywords: kw, path, blurb }, 'https://x/' + path, '');
  e.setDocs('a', [mk('Khác', [], 'có chữ trăng trong mô tả', '#/mota'), mk('Nhắc', ['trăng'], '', '#/tukhoa'), mk('Trăng rằm', [], '', '#/ten')]);
  assert.deepEqual(e.search('trang').items.map((x) => x.doc.href.split('#/')[1]), ['ten', 'tukhoa', 'mota']);
});

test('khớp đầu từ hơn khớp giữa từ', () => {
  const e = new NS.Engine();
  const app = { id: 'a', name: 'App', icon: '' };
  const mk = (name, p) => NS.makeDoc(app, { name, keywords: [], path: p, blurb: '' }, 'https://x/' + p, '');
  e.setDocs('a', [mk('Bản đồ', '#/giua'), mk('Đồ chơi', '#/dau')]);
  assert.ok(e.search('do').items[0].doc.href.endsWith('#/dau'));
});

test('mọi từ gõ vào đều phải khớp (AND)', () => {
  const r = eng.search('van khan gio');
  assert.ok(r.items.length > 0);
  for (const x of r.items) assert.ok(NS.fold(x.doc.name + ' ' + x.doc.kw.join(' ') + ' ' + x.doc.blurb + ' ' + x.doc.appBlurbT.join(' ') + ' ' + x.doc.appName).includes('gio'));
});

test('chịu gõ sai nhẹ', () => {
  assert.equal(top('vna khan')[0], '/vannien/#/van-khan'); // đảo chữ
  assert.equal(top('vanb khan')[0], '/vannien/#/van-khan'); // thừa chữ
  assert.ok(top('giai chai', 3).some((h) => h.startsWith('/race/')));
  assert.ok(top('scaner', 1)[0].startsWith('/scanner/')); // thiếu chữ
  assert.equal(top('doi don vj')[0], '/unit/#/doi-don-vi');
});

test('không ra kết quả thì gợi ý gần giống', () => {
  assert.equal(eng.search('zzzzqq').items.length, 0);
  const s = eng.suggest('vanx khan');
  assert.ok(s.length >= 1 && s[0].query === 'van khan', JSON.stringify(s));
  assert.deepEqual(eng.suggest('zzzzqq'), []);
  assert.deepEqual(eng.suggest(''), []);
});

test('chỉ khớp một phần thì đánh dấu near', () => {
  const r = eng.search('van khan banhmi');
  assert.equal(r.near, true);
  assert.ok(r.items.length <= 6);
});

test('truy vấn rỗng, chỉ dấu câu, rất dài không làm hỏng', () => {
  assert.equal(eng.search('').items.length, 0);
  assert.equal(eng.search('   ').items.length, 0);
  assert.equal(eng.search('!!! ???').items.length, 0);
  const t0 = Date.now();
  eng.search('a '.repeat(200));
  eng.search('x'.repeat(5000));
  assert.ok(Date.now() - t0 < 1500);
});

test('một ký tự hoặc số chỉ khớp đầu từ', () => {
  for (const x of eng.search('7').items) {
    const hay = [x.doc.nameT, ...x.doc.kwT, x.doc.blurbT, x.doc.appNameT].flat();
    assert.ok(hay.some((t) => t.startsWith('7')), x.doc.name);
  }
});

test('tên app gõ liền hay cách đều khớp app', () => {
  assert.ok(top('vannien')[0].startsWith('/vannien/'));
  assert.ok(top('van nien')[0].startsWith('/vannien/'));
  assert.ok(top('9unit')[0].startsWith('/unit/'));
});

test('lượt mở cũ đẩy chức năng lên', () => {
  const name = 'Đếm ngược ngày';
  const at = (opts) => eng.search('ngay', opts).items.findIndex((x) => x.doc.name === name);
  const base = at({});
  const boosted = at({ boost: (key) => (key.startsWith('unit|#/dem-nguoc') ? 99 : 0) });
  assert.ok(boosted <= base, `${base} -> ${boosted}`);
});

test('apps.js: mọi index trỏ tới tệp có thật và đúng định dạng', () => {
  for (const app of APPS) {
    if (!app.index) continue;
    const file = app.index.startsWith('vannien/') ? join(HERE, '..', app.index) : join(HERE, app.index);
    assert.ok(existsSync(file), app.id + ': ' + file);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(Array.isArray(data) && data.length > 0, app.id);
    const paths = new Set();
    for (const e of data) {
      assert.ok(NS.normalizeFeature(e), app.id + ' mục hỏng ' + JSON.stringify(e).slice(0, 60));
      assert.ok(e.path === '' || /^#\/\S*$/.test(e.path), app.id + ' path ' + e.path);
      assert.ok(e.path === '' || !paths.has(e.path), app.id + ' trùng path ' + e.path);
      paths.add(e.path);
      assert.ok(NS.resolveHref(app.href, e.path, 'https://9app.tech/'), app.id + ' ' + e.path);
    }
  }
});

test('search/*.json khớp bộ sinh (node tools/build-search-index.mjs)', async () => {
  const { INDEXES, render } = await import('../tools/build-search-index.mjs');
  const ids = Object.keys(INDEXES);
  for (const id of ids) assert.equal(readFileSync(join(HERE, 'search', id + '.json'), 'utf8'), render(id), id);
  const apps = loadApps().APPS.map((a) => a.id);
  for (const id of ids) assert.ok(apps.includes(id), 'app lạ ' + id);
  assert.equal(readdirSync(join(HERE, 'search')).length, ids.length);
});
