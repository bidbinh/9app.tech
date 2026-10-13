// Sinh PNG 180/192/512 và bản maskable từ icon.svg bằng Chrome (puppeteer-core).
const fs = require('fs'); const path = require('path');
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const { default: puppeteer } = await import(PPT);
  const dir = path.join(__dirname, '..', 'icons');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const jobs = [['icon.svg', 'icon-180.png', 180], ['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['icon-maskable.svg', 'icon-maskable-512.png', 512]];
  for (const [src, out, size] of jobs) {
    const svg = fs.readFileSync(path.join(dir, src), 'utf8');
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`);
    await page.screenshot({ path: path.join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
  await browser.close();
  console.log('ok');
})();
