import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRaces } from '../js/schema.js';
import { weekdayOf } from '../js/util.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const DOC = JSON.parse(read('data/races.json'));

test('data/races.json hợp lệ theo schema', () => {
  const errs = validateRaces(DOC);
  assert.deepEqual(errs, []);
});

test('đủ số lượng: >= 35 giải Việt Nam sắp tới và >= 20 giải khu vực/thế giới', () => {
  const today = '2026-10-04';
  const vn = DOC.races.filter((r) => r.country === 'VN' && (r.endDate || r.startDate) >= today);
  const intl = DOC.races.filter((r) => r.country !== 'VN');
  assert.ok(vn.length >= 35, `VN sắp tới: ${vn.length}`);
  assert.ok(intl.length >= 20, `quốc tế: ${intl.length}`);
});

test('id duy nhất, mọi source/website/registerUrl là https', () => {
  const ids = DOC.races.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of DOC.races) {
    assert.ok(r.source.startsWith('https://'), r.id);
    for (const k of ['website', 'registerUrl']) if (r[k]) assert.ok(r[k].startsWith('https://'), `${r.id}.${k}`);
  }
});

test('giải đã đối chiếu (verified) phải có source; giải verified=false phải có chú thích nguồn thấp', () => {
  for (const r of DOC.races) {
    assert.equal(typeof r.verified, 'boolean');
    if (!r.verified) assert.ok(r.note && r.note.length > 10, `${r.id} verified=false cần note giải thích`);
  }
});

test('ngày chạy chính rơi vào Chủ nhật/Thứ Bảy (kiểm tra chéo lỗi gõ ngày) trừ ngoại lệ đã biết', () => {
  const exceptions = new Set(['boston-marathon-2027']); // Boston chạy thứ Hai (Patriots Day)
  const bad = [];
  for (const r of DOC.races) {
    const d = r.raceDay || (r.endDate ? null : r.startDate);
    if (!d || exceptions.has(r.id)) continue;
    const wd = weekdayOf(d);
    if (wd !== 0 && wd !== 6) bad.push(`${r.id} ${d} thứ ${wd}`);
  }
  assert.deepEqual(bad, []);
});

// ---- chính bộ kiểm tra phải bắt được lỗi ----
const base = () => JSON.parse(JSON.stringify(DOC));
const firstErr = (mut) => { const d = base(); mut(d); return validateRaces(d); };

test('validator bắt id trùng', () => {
  const e = firstErr((d) => { d.races[1].id = d.races[0].id; });
  assert.ok(e.some((x) => x.includes('id trùng')));
});
test('validator bắt ngày sai, endDate < startDate, raceDay ngoài khoảng', () => {
  assert.ok(firstErr((d) => { d.races[0].startDate = '2026-02-30'; }).some((x) => x.includes('startDate')));
  assert.ok(firstErr((d) => { d.races[0].endDate = '2020-01-01'; }).some((x) => x.includes('endDate trước')));
  assert.ok(firstErr((d) => { d.races[0].raceDay = '2030-01-01'; }).some((x) => x.includes('raceDay')));
});
test('validator bắt URL không phải https và source thiếu', () => {
  assert.ok(firstErr((d) => { d.races[0].website = 'http://x.vn'; }).some((x) => x.includes('website')));
  assert.ok(firstErr((d) => { d.races[0].registerUrl = 'javascript:alert(1)'; }).some((x) => x.includes('registerUrl')));
  assert.ok(firstErr((d) => { d.races[0].source = 'abc'; }).some((x) => x.includes('source')));
});
test('validator bắt cự ly sai, type/region sai, giá sai', () => {
  assert.ok(firstErr((d) => { d.races[0].distances = [5, -1]; }).some((x) => x.includes('cự ly')));
  assert.ok(firstErr((d) => { d.races[0].distances = ['5K']; }).some((x) => x.includes('cự ly')));
  assert.ok(firstErr((d) => { d.races[0].type = 'swim'; }).some((x) => x.includes('type')));
  assert.ok(firstErr((d) => { d.races[0].region = 'moon'; }).some((x) => x.includes('region')));
  assert.ok(firstErr((d) => { d.races[0].priceFrom = 9; d.races[0].priceTo = 1; }).some((x) => x.includes('priceFrom')));
  assert.ok(firstErr((d) => { d.races[0].currency = null; d.races[0].priceFrom = 5; }).some((x) => x.includes('currency')));
});
test('validator bắt mốc đăng ký ngược, bibPickup sai, updatedAt tương lai', () => {
  assert.ok(firstErr((d) => { d.races[0].regOpens = '2026-12-01'; d.races[0].regCloses = '2026-11-01'; }).some((x) => x.includes('regCloses trước')));
  assert.ok(firstErr((d) => { d.races[0].bibPickup = { start: '2026-02-30', end: null }; }).some((x) => x.includes('bibPickup')));
  assert.ok(firstErr((d) => { d.races[0].updatedAt = '2099-01-01'; }).some((x) => x.includes('updatedAt')));
  assert.ok(firstErr((d) => { d.races[0].verified = 'yes'; }).some((x) => x.includes('verified')));
});
test('validator bắt gốc sai', () => {
  assert.ok(validateRaces(null).length);
  assert.ok(validateRaces({ schema: 2, updatedAt: 'x', races: [] }).length >= 2);
  assert.ok(validateRaces({ schema: 1, updatedAt: '2026-10-04', races: {} }).some((x) => x.includes('races')));
});

// ---- tệp PWA ----
test('service worker: mọi tệp trong SHELL đều tồn tại', () => {
  const sw = read('sw.js');
  const list = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const files = [...list.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(files.length >= 10);
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `thiếu ${f}`);
});

test('manifest: icon tồn tại, có start_url/scope tương đối', () => {
  const mf = JSON.parse(read('manifest.webmanifest'));
  assert.equal(mf.lang, 'vi');
  assert.equal(mf.scope, './');
  for (const i of mf.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
  assert.ok(mf.icons.some((i) => i.sizes === '192x192') && mf.icons.some((i) => i.sizes === '512x512'));
});

test('index.html: CSP chặt, không script/style inline, không handler inline', () => {
  const html = read('index.html');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(csp.includes("script-src 'self'") && csp.includes("default-src 'none'"));
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'có script inline');
  assert.ok(!/\sstyle=/.test(html) && !/<style/.test(html), 'có style inline');
  assert.ok(!/\son[a-z]+=/.test(html), 'có handler inline');
  assert.ok(html.includes('lang="vi"'));
  assert.ok(html.includes('https://9app.tech/'), 'có link ‹ 9app');
});

test('app.js không dùng innerHTML / eval', () => {
  for (const f of ['app.js', 'model.js', 'ics.js', 'store.js']) {
    const s = read(`js/${f}`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(s), f);
  }
});
