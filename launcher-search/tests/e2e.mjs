// e2e bằng Chrome thật, viewport 390x844: gõ, xem kết quả, bấm, kiểm URL đích. Chạy: node tests/e2e.mjs
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';

const puppeteer = (await import('file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).default;
const SHOTS = resolve(fileURLToPath(new URL('../shots', import.meta.url)));
mkdirSync(SHOTS, { recursive: true });

const port = 11100 + Math.floor(Math.random() * 800);
const delay = { '/vannien/search-index.json': 0 };
const srv = await startServer(port, { delay });
const BASE = `http://127.0.0.1:${port}/`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });

let passed = 0;
const failures = [];
async function scenario(name, fn) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  try {
    await fn(page, ctx, errors);
    assert.deepEqual(errors.filter((e) => !/serviceWorker|sw\.js/i.test(e)), [], 'lỗi trang');
    passed++;
    console.log('ok   ' + name);
  } catch (e) {
    failures.push(name);
    console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     '));
    try { await page.screenshot({ path: join(SHOTS, 'FAIL-' + name.replace(/\W+/g, '-') + '.png') }); } catch { /* bỏ */ }
  } finally {
    await ctx.close();
  }
}
const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + '.png') });
const open = async (page) => { await page.goto(BASE, { waitUntil: 'load' }); await page.waitForSelector('#search'); };
const type = async (page, text) => { await page.click('#search'); await page.keyboard.type(text); };
const rows = (page) => page.$$eval('#fn-list a', (as) => as.map((a) => ({ href: a.getAttribute('href'), text: a.querySelector('.fn-title').textContent, blurb: (a.querySelector('.fn-blurb') || {}).textContent || '' })));
const setQuery = async (page, q) => {
  await page.$eval('#search', (el) => { el.value = ''; });
  await page.click('#search');
  await page.keyboard.type(q);
};
const settle = (page, ms = 250) => new Promise((r) => setTimeout(r, ms));
const waitRows = (page) => page.waitForFunction(() => document.querySelectorAll('#fn-list a').length > 0, { timeout: 5000 });
const rel = (u) => u.replace(BASE.replace(/\/$/, ''), '');
const bodyText = (page) => page.evaluate(() => document.body.innerText);

await scenario('trang chủ nạp bình thường, chưa tải chỉ mục khi chưa gõ', async (page) => {
  await open(page);
  await settle(page, 400);
  assert.equal(await page.$eval('#fn-wrap', (e) => e.hidden), true);
  assert.equal(await page.$eval('#search-clear', (e) => e.hidden), true);
  const touched = Object.keys(srv.hits).filter((p) => p.startsWith('/search/') || p === '/vannien/search-index.json');
  assert.deepEqual(touched, [], 'không được tải chỉ mục trước khi gõ');
  assert.ok(await page.$('#list .tile-link'), 'còn lưới ứng dụng');
  assert.ok(await page.$('#soon-wrap'), 'còn Sắp ra mắt');
  await shot(page, '01-trang-chu');
});

await scenario('gõ "van khan" ra Vạn Niên › Văn khấn, bấm mở thẳng /vannien/#/van-khan', async (page) => {
  await open(page);
  await type(page, 'van khan');
  await waitRows(page);
  const r = await rows(page);
  assert.equal(r[0].text.replace(/\s+/g, ' '), 'Vạn Niên›Văn khấn'.replace('›', '›'));
  assert.equal(rel(new URL(r[0].href, BASE).href), '/vannien/#/van-khan');
  assert.ok(r[0].blurb.length > 10);
  assert.equal(await page.$eval('.banner', (e) => getComputedStyle(e).display), 'none', 'ẩn banner khi tìm');
  assert.ok(await page.$('#fn-list img[src*="vannien.svg"]'), 'có icon app');
  await shot(page, '02-van-khan');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#fn-list a')]);
  assert.equal(rel(page.url()), '/vannien/#/van-khan');
  await page.waitForFunction(() => /Văn khấn/.test(document.body.innerText), { timeout: 8000 });
  await shot(page, '03-vannien-van-khan');
});

await scenario('có dấu và không dấu cho cùng kết quả', async (page) => {
  await open(page);
  await type(page, 'van khan');
  await waitRows(page);
  const a = (await rows(page)).map((x) => x.href);
  await setQuery(page, 'VĂN KHẤN');
  await settle(page);
  const b = (await rows(page)).map((x) => x.href);
  assert.deepEqual(a, b);
});

const TARGETS = [
  ['ram thang 7', '/vannien/#/van-khan/co-hon', null],
  ['chi vang', '/unit/#/doi-don-vi/khoiluong', null],
  ['doi don vi', '/unit/#/doi-don-vi', null],
  ['bang lai', '/license/', null],
  ['mau cv', '/interview/#/cv', null],
  ['quet tai lieu', '/scanner/', null],
  ['giai chay', '/race/', null],
  ['trail', '/race/#/?type=trail', null],
  ['thi thu bang lai', '/license/#/thi', null],
];
for (const [q, want] of TARGETS) {
  await scenario(`"${q}" -> ${want}`, async (page) => {
    await open(page);
    await type(page, q);
    await waitRows(page);
    const r = await rows(page);
    const hrefs = r.slice(0, 3).map((x) => rel(new URL(x.href, BASE).href));
    assert.ok(hrefs[0] === want || hrefs.includes(want), `kết quả ${hrefs.join(' | ')}`);
    const idx = r.findIndex((x) => rel(new URL(x.href, BASE).href) === want);
    await page.evaluate((i) => document.querySelectorAll('#fn-list a')[i].click(), idx);
    await page.waitForFunction((w) => location.pathname + location.hash === w, { timeout: 8000 }, want.replace(/#.*$/, '') + (want.includes('#') ? want.slice(want.indexOf('#')) : ''));
    assert.equal(rel(page.url()), want);
  });
}

await scenario('Enter mở kết quả đầu tiên', async (page) => {
  await open(page);
  await type(page, 'doi don vi');
  await waitRows(page);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.keyboard.press('Enter')]);
  assert.equal(rel(page.url()), '/unit/#/doi-don-vi');
  await page.waitForFunction(() => /Đổi đơn vị/.test(document.title), { timeout: 8000 });
  await shot(page, '04-unit-doi-don-vi');
});

await scenario('bàn phím: mũi tên, Esc, nút xóa, aria', async (page) => {
  await open(page);
  await type(page, 'giai chay');
  await waitRows(page);
  assert.equal(await page.$eval('#search-clear', (e) => e.hidden), false);
  assert.equal(await page.$eval('#search-clear', (e) => e.getAttribute('aria-label')), 'Xóa tìm kiếm');
  assert.equal(await page.$eval('#fn-list', (e) => e.tagName), 'UL');
  assert.ok(await page.$eval('#fn-list a', (a) => /9race/.test(a.getAttribute('aria-label'))), 'aria-label có tên app');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'fn-item');
  const first = await page.evaluate(() => document.activeElement.getAttribute('href'));
  await page.keyboard.press('ArrowDown');
  const second = await page.evaluate(() => document.activeElement.getAttribute('href'));
  assert.notEqual(first, second);
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), first);
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
  await shot(page, '05-giai-chay');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#search', (e) => e.value), '');
  assert.equal(await page.$eval('#fn-wrap', (e) => e.hidden), true);
  await type(page, 'abc');
  await page.click('#search-clear');
  assert.equal(await page.$eval('#search', (e) => e.value), '');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
  assert.equal(await page.$eval('#search-clear', (e) => e.hidden), true);
  assert.ok(await page.$eval('.banner', (e) => getComputedStyle(e).display !== 'none'), 'banner trở lại');
  assert.ok(await page.$eval('#sr-status', (e) => e.getAttribute('role') === 'status'));
});

await scenario('không có kết quả: báo rõ, không vỡ giao diện', async (page) => {
  await open(page);
  await type(page, 'zzzzqq');
  await settle(page, 500);
  const note = await page.$eval('#fn-note', (e) => e.textContent);
  assert.match(note, /Không tìm thấy/);
  assert.equal(await page.$$eval('#fn-list a', (a) => a.length), 0);
  await shot(page, '06-khong-ket-qua');
});

await scenario('gần giống: gợi ý câu gõ và bấm chip', async (page) => {
  await open(page);
  await type(page, 'van khaxxxn');
  await settle(page, 700);
  const chip = await page.$('#fn-suggest .fn-chip');
  assert.ok(chip, 'có chip gợi ý');
  assert.equal(await page.$eval('#fn-suggest .fn-chip', (e) => e.textContent), 'van khan');
  await shot(page, '07-goi-y-gan-giong');
  await chip.click();
  await waitRows(page);
  assert.equal(await page.$eval('#search', (e) => e.value), 'van khan');
  assert.equal(rel(new URL((await rows(page))[0].href, BASE).href), '/vannien/#/van-khan');
});

await scenario('gõ sai nhẹ vẫn ra Văn khấn', async (page) => {
  await open(page);
  await type(page, 'vna kahn');
  await waitRows(page);
  assert.equal(rel(new URL((await rows(page))[0].href, BASE).href), '/vannien/#/van-khan');
});

await scenario('một chỉ mục lỗi mạng không làm hỏng các chỉ mục khác', async (page) => {
  srv.fail.add('/search/unit.json');
  try {
    await open(page);
    await type(page, 'van khan');
    await waitRows(page);
    assert.equal(rel(new URL((await rows(page))[0].href, BASE).href), '/vannien/#/van-khan');
    await setQuery(page, 'quet tai lieu');
    await waitRows(page);
    assert.equal(rel(new URL((await rows(page))[0].href, BASE).href), '/scanner/');
    await setQuery(page, 'unit');
    await settle(page, 500);
    const unitRows = (await rows(page)).filter((r) => r.href.includes('/unit/'));
    assert.equal(unitRows.length, 0, 'chỉ mục unit lỗi nên không có chức năng 9unit');
    assert.ok(await page.$('#list .tile-link[href="unit/"]'), 'app 9unit vẫn tìm ra như cũ');
    await shot(page, '08-mot-chi-muc-loi');
  } finally { srv.fail.delete('/search/unit.json'); }
});

await scenario('chỉ mục nạp chậm: hiện "Đang nạp", rồi tự cập nhật khi về', async (page) => {
  delay['/vannien/search-index.json'] = 1500;
  try {
    await open(page);
    await type(page, 'van khan');
    await settle(page, 400);
    assert.match(await page.$eval('#fn-note', (e) => e.textContent), /Đang nạp/);
    await page.waitForFunction(() => document.querySelectorAll('#fn-list a').length > 0, { timeout: 6000 });
    assert.equal(rel(new URL((await rows(page))[0].href, BASE).href), '/vannien/#/van-khan');
  } finally { delay['/vannien/search-index.json'] = 0; }
});

await scenario('chỉ mục nạp một lần rồi dùng bộ nhớ đệm', async (page) => {
  await open(page);
  await type(page, 'van khan');
  await waitRows(page);
  const before = srv.hits['/vannien/search-index.json'];
  await page.reload({ waitUntil: 'load' });
  await type(page, 'van khan');
  await waitRows(page);
  await settle(page, 300);
  assert.equal(srv.hits['/vannien/search-index.json'], before, 'không tải lại trong 1 giờ');
  const cache = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('9app.fidx.')));
  assert.ok(cache.includes('9app.fidx.vannien'));
});

await scenario('tên app khớp: app xếp trước chức năng; Enter mở app', async (page) => {
  await open(page);
  await type(page, 'unit');
  await waitRows(page);
  assert.equal(await page.$eval('#view-home', (e) => e.classList.contains('apps-first')), true);
  const yApp = await page.$eval('#list .tile-link[href="unit/"]', (e) => e.getBoundingClientRect().top);
  const yFn = await page.$eval('#fn-wrap', (e) => e.getBoundingClientRect().top);
  assert.ok(yApp < yFn, `app ${yApp} phải trước chức năng ${yFn}`);
  await shot(page, '09-ten-app-khop');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.keyboard.press('Enter')]);
  assert.equal(rel(page.url()), '/unit/');
});

await scenario('kết quả chức năng trước khi chỉ khớp mô tả app; app vẫn hiện bên dưới', async (page) => {
  await open(page);
  await type(page, 'bang lai');
  await waitRows(page);
  assert.equal(await page.$eval('#view-home', (e) => e.classList.contains('apps-first')), false);
  assert.ok(await page.$('#list .tile-link[href="license/"]') || await page.$('#suggest .tile-link[href="license/"]'), 'tile 9license vẫn có');
  await shot(page, '10-bang-lai');
});

await scenario('mở chức năng ghi vào "Gần đây" và nhớ lượt mở', async (page) => {
  await open(page);
  await type(page, 'van khan');
  await waitRows(page);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#fn-list a')]);
  await page.goto(BASE, { waitUntil: 'load' });
  assert.equal(await page.$eval('#recent-wrap', (e) => e.hidden), false);
  assert.ok(await page.$('#recent a[href="vannien/"]'), 'Vạn Niên trong Gần đây');
  const use = await page.evaluate(() => JSON.parse(localStorage.getItem('9app.fnuse')));
  assert.ok(Object.keys(use).some((k) => k.startsWith('vannien|#/van-khan|')), JSON.stringify(use));
  await shot(page, '11-gan-day');
});

await scenario('xóa tìm kiếm trả lại Gần đây, Ứng dụng của tôi, Sắp ra mắt', async (page) => {
  await open(page);
  await type(page, 'van khan');
  await waitRows(page);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#fn-list a')]);
  await page.goto(BASE, { waitUntil: 'load' });
  await type(page, 'race');
  await settle(page, 300);
  assert.equal(await page.$eval('#recent-wrap', (e) => e.hidden), true, 'Gần đây ẩn khi đang tìm (như cũ)');
  await page.click('#search-clear');
  await settle(page, 200);
  assert.equal(await page.$eval('#recent-wrap', (e) => e.hidden), false);
  assert.ok(await page.$('#list .tile-link'));
  assert.ok(await page.$eval('#soon-wrap', (e) => e.getBoundingClientRect().height > 0), 'Sắp ra mắt trở lại');
  assert.equal(await page.$eval('#view-home', (e) => e.className), 'main');
  await shot(page, '12-sau-khi-xoa');
});

await scenario('chuyển Thư viện rồi quay lại không kẹt kết quả', async (page) => {
  await open(page);
  await type(page, 'van khan');
  await waitRows(page);
  await page.click('#tab-lib');
  assert.equal(await page.$eval('#view-home', (e) => e.hidden), true);
  await page.click('#tab-home');
  assert.equal(await page.$eval('#view-home', (e) => e.hidden), false);
  await page.click('#search-clear');
  assert.equal(await page.$eval('#fn-wrap', (e) => e.hidden), true);
});

await scenario('"Xem thêm" mở rộng danh sách dài', async (page) => {
  await open(page);
  await type(page, 'email');
  await waitRows(page);
  const n1 = await page.$$eval('#fn-list a', (a) => a.length);
  assert.equal(n1, 8);
  assert.equal(await page.$eval('#fn-more', (e) => e.hidden), false);
  await shot(page, '13-xem-them-truoc');
  await page.click('#fn-more');
  const n2 = await page.$$eval('#fn-list a', (a) => a.length);
  assert.ok(n2 > 8, 'sau khi mở rộng ' + n2);
  assert.equal(await page.$eval('#fn-more', (e) => e.hidden), true);
});

await scenario('không tràn ngang ở 390px và 320px', async (page) => {
  await open(page);
  await type(page, 'van khan');
  await waitRows(page);
  for (const w of [390, 320]) {
    await page.setViewport({ width: w, height: 700, deviceScaleFactor: 1 });
    await settle(page, 200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `tràn ngang ${over}px ở ${w}`);
    const tap = await page.$$eval('#fn-list a', (as) => as.slice(0, 5).map((a) => a.getBoundingClientRect().height));
    assert.ok(tap.every((h) => h >= 44), 'vùng chạm >= 44px: ' + tap);
  }
});

await browser.close();
srv.server.close();
console.log(`\n${passed} đạt, ${failures.length} lỗi`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
