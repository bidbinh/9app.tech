// Sinh icon PNG (180, 192, 512) từ public/icons/icon.svg bằng Chrome. Chạy: node scripts/make-icons.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const svg = fs.readFileSync(path.join(root, 'public/icons/icon.svg'), 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  fs.writeFileSync(path.join(root, `public/icons/icon-${size}.png`), buf);
}
await browser.close();
console.log('Đã tạo icon PNG');
