#!/usr/bin/env node
// Xuất icon PNG từ icon.svg bằng Chrome headless (puppeteer-core có sẵn trong máy dev).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'icon-180.png', 180],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
];
for (const [src, out, size] of jobs) {
  const svg = fs.readFileSync(path.join(root, 'icons', src), 'utf8');
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: path.join(root, 'icons', out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('đã tạo', out);
}
await browser.close();
