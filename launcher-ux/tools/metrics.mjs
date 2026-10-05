import { boot, PREFS_OLD } from './lib.mjs';
const { browser, base, server } = await boot();
for (const [nm, prefs] of [['moi', null], ['cu', PREFS_OLD]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((p) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.clear(); if (p) localStorage.setItem('9app.prefs', JSON.stringify(p)); } }, prefs);
  await page.goto(base + '/index.html', { waitUntil: 'networkidle0' });
  console.log(nm, await page.evaluate(() => {
    const top = (s) => Math.round(document.querySelector(s).getBoundingClientRect().top + scrollY);
    const t = [...document.querySelectorAll('#view-home .tile-link')].filter(e => e.offsetParent).length + document.querySelectorAll('#suggest .sug-pill').length;
    return { docH: document.documentElement.scrollHeight, firstTile: top('#quick-wrap .tile, #list .tile'), grid: top('#list'), tiles: t, avail: innerHeight - 60 - 57 };
  }));
  await page.close();
}
await browser.close(); server.close();
