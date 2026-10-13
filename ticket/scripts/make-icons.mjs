// Dựng icon PNG từ icons/icon.svg bằng Chrome (puppeteer-core). Chạy: node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const buf = await page.screenshot({ omitBackground: true, type: 'png' });
  fs.writeFileSync(path.join(root, `icons/icon-${size}.png`), buf);
  await page.close();
}
await browser.close();
console.log('ok');
