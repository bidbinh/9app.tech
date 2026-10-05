// Dựng icon.png (512x512) từ icon.svg bằng Chrome thật. Chạy: node scripts/make-icon.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const svg = fs.readFileSync(path.join(root, 'public', 'icon.svg'), 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
const png = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
fs.writeFileSync(path.join(root, 'public', 'icon.png'), png);
await browser.close();
console.log('Đã ghi public/icon.png', png.length, 'byte');
