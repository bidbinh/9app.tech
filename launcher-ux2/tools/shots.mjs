import { boot, PREFS_OLD } from './lib.mjs';
export const FAKE = `
;(function(){var cats=['family','work','life','drive','hobby'];var icons=['log','ship','race','unit','english','license','lunch','swap','hire','interview','scanner','speed','giapha','quy','fin','sport','vannien'];
var names=['9note','9plan','9cook','9kid','9pet','9gym','9map','9taxi','9pay','9bank','9news','9radio','9photo','9doc','9sign','9book','9travel','9hotel','9flight','9trip','9garden','9home','9energy','9health','9water'];
for(var i=0;i<names.length;i++){APPS.push({id:'fake'+i,name:names[i],blurb:'Ứng dụng thử số '+i,href:'fake'+i+'/',icon:'icons/'+icons[i%icons.length]+'.svg',category:cats[i%5],ready:true});}})();`;
export async function withFake(page) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (/\/js\/apps\.js/.test(req.url())) {
      const r = await fetch(req.url()); const t = await r.text();
      req.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: t + FAKE });
    } else req.continue();
  });
}
const T = Date.now();
export const PREFS_MANY = { fav: ['fake3', 'quy'], hide: ['giapha'], show: ['log'], usage: { fake1: { count: 5, lastUsed: T - 1e3 }, license: { count: 4, lastUsed: T - 2e3 }, hire: { count: 3, lastUsed: T - 3e3 }, fake9: { count: 3, lastUsed: T - 4e3 }, fin: { count: 2, lastUsed: T - 5e3 }, ship: { count: 2, lastUsed: T - 6e3 }, fake12: { count: 1, lastUsed: T - 7e3 }, unit: { count: 1, lastUsed: T - 8e3 } } };
if (process.argv[1].endsWith('shots.mjs')) {
  const only = process.env.ONLY || '';
  const { browser, base, server } = await boot();
  const sizes = [[390, 844], [360, 740], [430, 932], [1280, 800]];
  for (const scheme of (process.env.SCHEME ? [process.env.SCHEME] : ['light', 'dark']))
  for (const [w, h] of sizes) for (const [name, prefs, fake] of [['moi', null, 0], ['cu', PREFS_OLD, 0], ['nhieu40', PREFS_MANY, 1]]) {
    if (fake && w > 430) continue;
    if (scheme === 'dark' && !(w === 390 && !fake)) continue;
    if (only && name !== only) continue;
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: w < 700 });
    if (fake) await withFake(page);
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.evaluateOnNewDocument((p) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.clear(); if (p) localStorage.setItem('9app.prefs', JSON.stringify(p)); } }, prefs);
    await page.goto(base + '/index.html', { waitUntil: 'networkidle0' });
    const sfx = scheme === 'dark' ? '-toi' : '';
    await page.screenshot({ path: `shots/after/${name}-${w}x${h}${sfx}-view.png` });
    await page.screenshot({ path: `shots/after/${name}-${w}x${h}${sfx}-full.png`, fullPage: true });
    if (w === 390 && name !== 'nhieu40') {
      for (const [n, id] of [['tatca', 'tab-lib'], ['khampha', 'tab-explore'], ['yeuthich', 'tab-fav'], ['taikhoan', 'tab-user']]) {
        await page.evaluate((i) => document.getElementById(i).click(), id);
        await new Promise(r => setTimeout(r, 100));
        await page.screenshot({ path: `shots/after/${name}-${w}x${h}${sfx}-${n}.png`, fullPage: true });
      }
    }
    if (errs.length) console.log(name, w, errs);
    await page.close();
  }
  await browser.close(); server.close();
}
