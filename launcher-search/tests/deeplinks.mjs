// Quét mọi deep link trong chỉ mục: mở bằng Chrome thật, xem có vào đúng màn hình không.
// Chạy: node tests/deeplinks.mjs [--only=unit,license]   (kết quả ghi vào shots/deeplinks.json và in bảng)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { NS, loadApps, HERE } from './helpers.mjs';

const puppeteer = (await import('file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).default;
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const PROD = process.argv.includes('--prod'); // chỉ GET trang công khai https://9app.tech, không ghi gì
const port = 11100 + Math.floor(Math.random() * 800);
const srv = PROD ? { server: { close() {} } } : await startServer(port);
const BASE = PROD ? 'https://9app.tech/' : `http://127.0.0.1:${port}/`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const { APPS } = loadApps();
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });

// Các app cần máy chủ riêng (API, đăng nhập): ở đây chỉ chạy phần tĩnh nên chỉ kiểm "không đổi hash, không lỗi script".
const NEEDS_BACKEND = new Set(['hire', 'swap', 'lunch', 'ship', 'interview']);
const jobs = [];
for (const app of APPS) {
  if (!app.index || (only.length && !only.includes(app.id))) continue;
  const file = app.index.startsWith('vannien/') ? join(HERE, '..', app.index) : join(HERE, app.index);
  const list = PROD && app.id === 'vannien' ? await (await fetch(BASE + app.index)).json() : JSON.parse(readFileSync(file, 'utf8'));
  for (const raw of list) {
    const f = NS.normalizeFeature(raw);
    const href = NS.resolveHref(app.href, f.path, BASE);
    jobs.push({ app: app.id, name: f.name, path: f.path, url: href });
  }
}

const ctx = await browser.createBrowserContext();
const results = [];
let next = 0;
async function worker() {
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  while (next < jobs.length) {
    const job = jobs[next++];
    errs.length = 0;
    const r = { ...job, ok: false };
    try {
      await page.goto('about:blank');
      const resp = await page.goto(job.url, { waitUntil: 'load', timeout: 20000 });
      r.status = resp && resp.status();
      await new Promise((x) => setTimeout(x, 900));
      const info = await page.evaluate(() => {
        const q = (s) => (document.querySelector(s) || {}).textContent || '';
        const active = [...document.querySelectorAll('[aria-selected="true"], [aria-current="page"], .on, .tab.on, .seg .on, .chip.on, .active')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 4);
        return { url: location.pathname + location.search + location.hash, title: document.title, h1: (q('h1') || q('#tieu-de') || q('h2')).trim().slice(0, 80), active, text: document.body.innerText.slice(0, 4000) };
      });
      r.final = info.url; r.title = info.title; r.h1 = info.h1; r.active = info.active;
      r.hashKept = info.url.endsWith(new URL(job.url).hash) && info.url.startsWith(new URL(job.url).pathname);
      r.errors = errs.slice();
      const tail = NS.norm(job.name.includes(':') ? job.name.split(':').slice(1).join(' ') : job.name).replace(/\bmien \w+\b/g, '').trim();
      const body = NS.norm(info.text);
      const head = tail.split(' ').slice(0, 2).join(' ');
      r.nameInPage = !!head && body.includes(head);
      r.ok = r.status === 200 && r.hashKept && r.errors.length === 0 && !/khong tim thay trang/.test(body);
    } catch (e) { r.error = String(e.message).slice(0, 120); }
    results.push(r);
  }
  await page.close();
}
await Promise.all([worker(), worker(), worker(), worker()]);
results.sort((a, b) => (a.app + a.path).localeCompare(b.app + b.path));
writeFileSync(join(SHOTS, PROD ? 'deeplinks-prod.json' : 'deeplinks.json'), JSON.stringify(results, null, 1));
const byApp = {};
for (const r of results) {
  const a = (byApp[r.app] ||= { n: 0, ok: 0, name: 0 });
  a.n++; if (r.ok) a.ok++; if (r.nameInPage) a.name++;
}
for (const r of results) if (!r.ok || !r.nameInPage) console.log((r.ok ? 'ten?' : 'LOI ') + ` ${r.app} ${r.path || '(goc)'} -> ${r.final || r.error} | ${r.h1 || r.title} ${r.errors && r.errors.length ? JSON.stringify(r.errors).slice(0, 100) : ''}`);
console.log('\nTổng hợp (mở được và giữ đúng hash/ không lỗi script / chữ tên chức năng có trong trang):');
for (const [k, v] of Object.entries(byApp)) console.log(`  ${k.padEnd(10)} ${v.ok}/${v.n} mở đúng, ${v.name}/${v.n} thấy tên chức năng trên trang${NEEDS_BACKEND.has(k) ? '  (cần máy chủ riêng, chỉ kiểm tĩnh)' : ''}`);
await browser.close();
srv.server.close();
