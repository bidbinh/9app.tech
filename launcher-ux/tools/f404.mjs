import { boot, PREFS_OLD } from './lib.mjs';
const { browser, base, server } = await boot();
const page = await browser.newPage();
page.on('response', (r) => { if (r.status() >= 400) console.log(r.status(), r.url()); });
await page.goto(base + '/index.html', { waitUntil: 'networkidle0' });
await page.type('#search', 'bang lai'); await new Promise(r => setTimeout(r, 1500));
await browser.close(); server.close();
