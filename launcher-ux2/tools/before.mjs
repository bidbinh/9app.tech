import { boot, openPage, PREFS_OLD } from './lib.mjs';
const { browser, base, server } = await boot();
const sizes = [[390, 844], [360, 740], [1280, 800]];
const out = {};
for (const [w, h] of sizes) for (const [name, prefs] of [['moi', null], ['cu', PREFS_OLD]]) {
  const { page, errors } = await openPage(browser, base + '/orig/index.html', w, h, prefs);
  await page.screenshot({ path: `shots/before/${name}-${w}x${h}-full.png`, fullPage: true });
  await page.screenshot({ path: `shots/before/${name}-${w}x${h}-view.png` });
  const m = await page.evaluate(() => {
    const top = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
    const names = [...document.querySelectorAll('#view-home .tile-link .tile-name')].filter(e => e.offsetParent && !e.closest('.soon')).map(e => e.textContent);
    const cnt = {}; names.forEach(n => cnt[n] = (cnt[n] || 0) + 1);
    return { docH: document.documentElement.scrollHeight, firstTile: top('#view-home .tile'), mine: top('#library'), dup: Object.keys(cnt).filter(k => cnt[k] > 1), tiles: names.length, header: document.querySelector('.top').offsetHeight };
  });
  out[`${name}-${w}x${h}`] = { ...m, errors };
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
