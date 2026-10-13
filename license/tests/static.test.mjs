import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, questions } from './helpers.mjs';
import { SIGN_GROUPS, signGroup } from '../js/signs.js';
import { sanitize, DEFAULTS } from '../js/store.js';

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('index.html: CSP chặt, có manifest, icon, nút ‹ 9app, homebar', () => {
  const html = read('index.html');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.ok(!/script-src[^;]*unsafe-inline/.test(html), 'không cho phép script inline');
  assert.ok(!/script-src[^;]*unsafe-eval/.test(html));
  assert.match(html, /object-src 'none'/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /‹ 9app/);
  assert.match(html, /\/js\/homebar\.js/);
  assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html), 'có script inline');
  assert.ok(!/ on\w+=/.test(html), 'có thuộc tính sự kiện inline');
});

test('manifest: đủ trường và icon tồn tại', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.lang, 'vi');
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url && m.scope && m.name && m.short_name);
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
});

test('service worker: mọi tệp trong danh sách lưu sẵn đều tồn tại; mọi module JS đều có trong danh sách', () => {
  const sw = read('sw.js');
  const list = [...sw.matchAll(/'\.\/([^']*)'/g)].map((x) => x[1]).filter((x) => x);
  for (const f of list) assert.ok(fs.existsSync(path.join(root, f)), 'SW tham chiếu tệp không có: ' + f);
  const js = [];
  const walk = (d) => { for (const f of fs.readdirSync(path.join(root, d))) { const p = path.join(d, f); if (fs.statSync(path.join(root, p)).isDirectory()) walk(p); else if (f.endsWith('.js')) js.push(p.split(path.sep).join('/')); } };
  walk('js');
  for (const f of js) assert.ok(list.includes(f), 'SW thiếu ' + f);
  assert.match(sw, /VERSION = '/);
});

test('mã nguồn app không dùng innerHTML với dữ liệu, không eval', () => {
  const dir = path.join(root, 'js');
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } };
  walk(dir);
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!/\beval\(|new Function\(/.test(s), 'eval trong ' + f);
    const inner = s.match(/innerHTML/g) || [];
    if (!f.endsWith('ui.js')) assert.equal(inner.length, 0, 'innerHTML trong ' + f);
  }
});

test('phân nhóm biển báo: mọi câu chương V có nhóm hợp lệ, mỗi nhóm có câu', () => {
  const ids = new Set(SIGN_GROUPS.map((g) => g.id));
  const count = {};
  for (const q of questions.filter((x) => x.ch === 5)) {
    const g = signGroup(q);
    assert.ok(ids.has(g), g);
    count[g] = (count[g] || 0) + 1;
  }
  for (const g of SIGN_GROUPS) assert.ok(count[g.id] > 5, `nhóm ${g.id} có ${count[g.id]}`);
});

const goodExam = { t: 1, hang: 'B', profile: 'hien-hanh', score: 2, total: 3, passMark: 2, pass: true, failReason: null, critWrong: [], used: 5, ids: [1, 2, 3], ans: [0, -1, 2] };
const goodCur = { hang: 'B', profile: 'hien-hanh', ids: [1, 2, 3], minutes: 20, passMark: 2, total: 3, critIds: [2], startedAt: 5, answers: { 1: 0 }, flags: {}, i: 0 };

test('store.sanitize: loại dữ liệu hỏng, giữ dữ liệu hợp lệ', () => {
  const d = sanitize({ q: { 1: { b: 2, d: 5, s: 3, c: 2, w: 1, l: 1, t: 1 }, x: { b: 1 }, 2: 'rác' }, exams: [goodExam, null, 'x', { t: 1, score: 3 }], days: { '2026-10-04': 5, bad: 1 }, settings: { hang: 'A1', hack: 'x' }, cur: 'rác' }, null);
  assert.deepEqual(Object.keys(d.q), ['1']);
  assert.equal(d.exams.length, 1);
  assert.deepEqual(d.days, { '2026-10-04': 5 });
  assert.equal(d.settings.hang, 'A1');
  assert.ok(!('hack' in d.settings));
  assert.equal(d.cur, null);
  assert.deepEqual(sanitize(null, null), DEFAULTS());
});

test('store.sanitize: bài thi dở và lịch sử hỏng/thiếu id/id không tồn tại không làm vỡ màn hình', () => {
  const ok = new Set(questions.map((q) => q.id));
  assert.ok(sanitize({ cur: goodCur }, ok).cur);
  assert.equal(sanitize({ cur: { ...goodCur, ids: [1, 2, 99999] } }, ok).cur, null, 'id không tồn tại');
  assert.equal(sanitize({ cur: { ...goodCur, ids: [1, 1, 2] } }, ok).cur, null, 'id trùng');
  assert.equal(sanitize({ cur: { ...goodCur, hang: 'Z' } }, ok).cur, null);
  assert.equal(sanitize({ cur: { ...goodCur, minutes: 'x' } }, ok).cur, null);
  assert.equal(sanitize({ cur: { ...goodCur, ids: [] } }, ok).cur, null);
  const c = sanitize({ cur: { ...goodCur, answers: { 1: 9, 2: 1, 77: 0, 3: 'a' }, i: 50 } }, ok).cur;
  assert.deepEqual(c.answers, { 2: 1 });
  assert.equal(c.i, 0);
  for (const bad of [{ ...goodExam, ids: [1, 2, 99999] }, { ...goodExam, ans: [0, 1] }, { ...goodExam, ans: [0, 1, 7] }, { ...goodExam, score: 9 }, { ...goodExam, total: 5 }, { ...goodExam, hang: 'Q' }, { ...goodExam, ids: 'x' }]) {
    assert.equal(sanitize({ exams: [bad] }, ok).exams.length, 0, JSON.stringify(bad).slice(0, 60));
  }
  const e = sanitize({ exams: [{ ...goodExam, critWrong: [3, 500] }] }, ok).exams[0];
  assert.deepEqual(e.critWrong, [3]);
  assert.equal(sanitize({ q: { 1: { b: 1, d: 1 }, 99999: { b: 1, d: 1 } } }, ok).q[99999], undefined);
  sanitize({}, null);
});

test('store: lỗi ghi (đầy bộ nhớ) báo ngay qua onError; flush ghi nốt dữ liệu chờ', async () => {
  const { store } = await import('../js/store.js');
  const writes = [];
  let full = false;
  globalThis.window = { localStorage: { getItem: () => null, setItem: (k, v) => { if (full) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } writes.push(v); }, removeItem() {} } };
  store._resetMemory();
  const errs = [];
  store.onError = (k) => errs.push(k);
  store.get();
  store.update((d) => { d.settings.hang = 'A1'; });
  assert.equal(writes.length, 1);
  store.get().settings.hang = 'C';
  store.saveSoon();
  store.flush();
  assert.equal(writes.length, 2, 'flush phải ghi ngay');
  assert.match(writes[1], /"hang":"C"/);
  store.flush();
  assert.equal(writes.length, 2, 'không ghi lại khi không có gì mới');
  full = true;
  store.update((d) => { d.settings.hang = 'D'; });
  assert.deepEqual(errs, ['quota']);
  assert.equal(store.persistent, false);
  delete globalThis.window;
  store._resetMemory();
});

test('tips.json: mọi id tham chiếu tồn tại', () => {
  const tips = JSON.parse(read('data/tips.json'));
  const ids = new Set(questions.map((q) => q.id));
  for (const t of tips.chu_de) for (const id of t.ids) assert.ok(ids.has(id), `${t.id}: câu ${id}`);
});
