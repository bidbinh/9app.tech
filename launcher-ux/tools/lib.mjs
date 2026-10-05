import { startServer } from './serve.mjs';
export const PPT = 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export async function boot() {
  const port = 12000 + Math.floor(Math.random() * 3000);
  const server = await startServer(port);
  const puppeteer = (await import(PPT)).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  return { port, server, browser, base: 'http://127.0.0.1:' + port };
}
const T = Date.now();
export const PREFS_OLD = {
  fav: [], hide: ['giapha', 'interview'], show: ['log'],
  usage: {
    giapha: { count: 9, lastUsed: T - 3600e3 }, license: { count: 6, lastUsed: T - 7200e3 },
    interview: { count: 4, lastUsed: T - 86400e3 }, hire: { count: 3, lastUsed: T - 2 * 86400e3 },
  },
};
export const PREFS_NEW = null;
// scenario: null = người mới; object = prefs đặt trước khi trang chạy
export async function openPage(browser, url, w, h, prefs, extra) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: w < 700 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.evaluateOnNewDocument((p, ex) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        localStorage.clear();
        if (p) localStorage.setItem('9app.prefs', JSON.stringify(p));
        if (ex) for (var k in ex) localStorage.setItem(k, ex[k]);
      }
    } catch (e) {}
  }, prefs, extra || null);
  await page.goto(url, { waitUntil: 'networkidle0' });
  return { page, errors };
}
