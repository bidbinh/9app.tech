// Dựng icon PNG (180/192/512) từ icons/icon.svg bằng Chrome headless.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.join(HERE, '..', 'icons');
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const svg = fs.readFileSync(path.join(ICONS, 'icon.svg'), 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: path.join(ICONS, `icon-${size}.png`), omitBackground: true });
  await page.close();
}
const mk = fs.readFileSync(path.join(ICONS, 'icon-maskable.svg'), 'utf8');
const pm = await browser.newPage();
await pm.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
await pm.setContent('<html><body style="margin:0">' + mk + '</body></html>');
await pm.screenshot({ path: path.join(ICONS, 'icon-maskable-512.png') });
await browser.close();
console.log('xong');
