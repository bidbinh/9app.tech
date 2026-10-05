import { boot, PREFS_OLD } from './lib.mjs';
import { withFake, PREFS_MANY } from './shots.mjs';
const { browser, base, server } = await boot();
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
async function open(w, h, prefs, fake, scheme) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme || 'light' }]);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  if (fake) await withFake(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluateOnNewDocument((p) => {
    if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.clear(); if (p) localStorage.setItem('9app.prefs', JSON.stringify(p)); }
  }, prefs);
  await page.goto(base + '/index.html', { waitUntil: 'networkidle0' });
  return { page, errors };
}
const homeNames = (page) => page.evaluate(() => [...document.querySelectorAll('#view-home .tile-link .tile-name, #suggest .sug-pill .tile-name')].filter(e => e.offsetParent).map(e => e.textContent));
const dups = (a) => a.filter((x, i) => a.indexOf(x) !== i);
const small = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a[href], button, input').forEach((e) => {
    if (e.closest('[hidden]') || !e.offsetParent) return;
    const r = e.getBoundingClientRect();
    if (r.width < 1) return;
    if (r.height < 43.5 || r.width < 43.5) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  return out;
});
const txt = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map(e => e.textContent), sel);

for (const w of [320, 360, 390, 430, 1280]) {
  for (const [nm, prefs, fake] of [['moi', null, 0], ['cu', PREFS_OLD, 0], ['40', PREFS_MANY, 1]]) {
    const { page, errors } = await open(w, w < 700 ? 740 : 800, prefs, fake);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(sw[0] <= sw[1], `${nm} ${w}: khong tran ngang (${sw})`);
    ok(errors.length === 0, `${nm} ${w}: khong loi console ${errors.join('|')}`);
    const names = await homeNames(page);
    ok(dups(names).length === 0, `${nm} ${w}: khong app lap (${names.length} o) ${dups(names)}`);
    const sm = await small(page);
    ok(sm.length === 0, `${nm} ${w}: vung cham >=44 ${sm.join(', ')}`);
    await page.close();
  }
}
{
  const { page } = await open(390, 844, PREFS_OLD, 0);
  const q = await txt(page, '#quick .tile-name');
  ok(q.join() === '9license,9hire', 'cu: Dung nhanh = ' + q);
  const g = await homeNames(page);
  ok(g.indexOf('Gia phả') < 0 && g.indexOf('9interview') < 0, 'cu: app da an khong hien o trang chu');
  const before = await page.evaluate(() => localStorage.getItem('9app.prefs'));
  await page.reload({ waitUntil: 'networkidle0' });
  const after = await page.evaluate(() => localStorage.getItem('9app.prefs'));
  ok(before === after, 'cu: prefs khong doi sau tai lai');
  await page.click('#chips [data-k="drive"]');
  const d = await txt(page, '#list .tile-name');
  ok(d.join() === '9speed', 'chip Lai xe = ' + d);
  await page.click('#chips [data-k="all"]');
  await page.evaluate(() => { const a = [...document.querySelectorAll('#list .tile-link')].find(e => e.textContent === '9swap'); a.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  ok(await page.evaluate(() => !document.getElementById('act').hidden), 'menu giu lau mo');
  await page.click('#act-hide');
  const g2 = await homeNames(page);
  ok(g2.indexOf('9swap') < 0, 'an 9swap khoi trang chu');
  await page.click('#tab-lib');
  const lib = await txt(page, '#lib-list .row');
  const row = lib.find(t => t.indexOf('9swap') >= 0);
  ok(row && row.indexOf('Đã ẩn') >= 0 && row.indexOf('Thêm') >= 0, 'Thu vien: 9swap co nhan Da an + nut Them');
  await page.evaluate(() => { const r = [...document.querySelectorAll('#lib-list .row')].find(r => r.textContent.indexOf('9swap') >= 0); r.querySelector('.row-act').click(); });
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('9app.prefs')).show)).indexOf('swap') >= 0, 'Them lai 9swap tu Thu vien');
  await page.evaluate(() => { const r = [...document.querySelectorAll('#lib-list .row')].find(r => r.textContent.indexOf('9unit') >= 0); r.querySelector('.row-act').click(); });
  await page.click('#act-fav');
  await page.click('#lib-chips [data-f="pin"]');
  const pinned = await txt(page, '#lib-list .row-name');
  ok(pinned.join() === '9unit', 'loc Da ghim = ' + pinned);
  await page.click('#tab-home');
  const q2 = await txt(page, '#quick .tile-name');
  ok(q2[0] === '9unit', 'ghim dua 9unit len dau Dung nhanh: ' + q2);
  ok(dups(await homeNames(page)).length === 0, 'van khong lap sau thao tac');
  await page.close();
}
{
  const { page } = await open(390, 844, null, 0);
  await page.click('#tab-lib');
  ok(await page.evaluate(() => !!document.querySelector('#lib-soon .row')), 'Thu vien co Sap ra mat o cuoi');
  await page.type('#lib-q', 'lai xe');
  const r = await txt(page, '#lib-list .row-name');
  ok(r.join() === '9license,9speed', 'loc khong dau "lai xe" = ' + r);
  ok(await page.evaluate(() => document.getElementById('lib-soon').hidden), 'Sap ra mat an khi loc khong khop');
  await page.close();
}
{
  const { page } = await open(390, 844, null, 0);
  ok(await page.evaluate(() => !document.getElementById('welcome').hidden), 'moi: co loi chao');
  ok(await page.evaluate(() => document.getElementById('suggest-wrap').hidden), 'moi: chua goi y khi con loi chao');
  await page.click('#welcome-x');
  ok(await page.evaluate(() => document.getElementById('welcome').hidden && !document.getElementById('suggest-wrap').hidden), 'dong loi chao, hien goi y');
  await page.reload({ waitUntil: 'networkidle0' });
  ok(await page.evaluate(() => document.getElementById('welcome').hidden), 'loi chao khong hien lai sau tai lai');
  const sug = await txt(page, '#suggest .tile-name');
  ok(sug.join() === '9log', 'goi y = ' + sug);
  await page.click('#suggest-x');
  ok(await page.evaluate(() => document.getElementById('suggest-wrap').hidden), 'an goi y');
  await page.close();
}
{
  const { page, errors } = await open(390, 844, PREFS_OLD, 0);
  await page.type('#search', 'bang lai');
  await page.waitForFunction(() => document.querySelectorAll('#fn-list li').length > 0, { timeout: 8000 });
  const n = await page.evaluate(() => document.querySelectorAll('#fn-list li').length);
  ok(n > 0, 'tim chuc nang "bang lai": ' + n + ' ket qua');
  await page.evaluate(() => { var s = document.getElementById('search'); s.value = ''; s.dispatchEvent(new Event('input')); });
  await page.type('#search', 'speed');
  const apps = await txt(page, '#list .tile-name');
  ok(apps.indexOf('9speed') >= 0, 'tim app "speed": ' + apps);
  ok(await page.evaluate(() => document.getElementById('welcome').hidden && document.getElementById('quick-wrap').hidden), 'khi tim: an Dung nhanh');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !document.getElementById('quick-wrap').hidden), 'Esc xoa tim, tro lai trang chu');
  ok(errors.length === 0, 'tim: khong loi console ' + errors);
  await page.close();
}
{
  const { page } = await open(390, 844, PREFS_MANY, 1);
  const c = await page.evaluate(() => ({ quick: document.querySelectorAll('#quick .tile').length, grid: document.querySelectorAll('#list .tile').length, more: document.getElementById('list-more').textContent, h: document.documentElement.scrollHeight }));
  ok(c.quick === 8 && c.grid === 16, `40 app: quick=${c.quick} luoi=${c.grid} "${c.more}" cao ${c.h}`);
  await page.click('#list-more');
  const g = await page.evaluate(() => document.querySelectorAll('#list .tile').length);
  ok(g > 16, 'Hien them mo rong: ' + g);
  await page.close();
}
{
  const { page } = await open(390, 844, PREFS_OLD, 0, 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor + '|' + getComputedStyle(document.querySelector('.top')).backgroundColor);
  ok(/rgb\(6, 11, 22\)/.test(bg), 'dark: nen toi ' + bg);
  await page.close();
}
console.log(fail ? `\n${fail} LOI` : '\nTAT CA DAT');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
