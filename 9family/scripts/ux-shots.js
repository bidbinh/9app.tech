// Chụp ảnh các màn chính với dữ liệu mẫu BỊA. Dùng: node scripts/ux-shots.js shots/ux-before [--extra]
// Đồng thời đo "số màn hình cần cuộn" để so sánh trước/sau (ghi vào <outdir>/metrics.json).
import fs from 'node:fs';
import path from 'node:path';
import { boot, launch, here } from './ux-harness.js';

const outDir = path.resolve(here, '..', process.argv[2] || 'shots/ux-after');
const extra = process.argv.includes('--extra');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const h = await boot({ now: '14:05' });
const browser = await launch();
const metrics = {};
const problems = [];
const SCREENS = [['today', 'today'], ['cal', 'cal'], ['rides', 'rides'], ['tasks', 'tasks'], ['me', 'me'], ['event-new', 'event/new']];
const VIEWS = [['390', { width: 390, height: 844 }, false], ['360', { width: 360, height: 740 }, false], ['390-toi', { width: 390, height: 844 }, true]];
try {
  for (const [vname, view, dark] of VIEWS) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
    page.on('pageerror', (e) => problems.push(`${vname} pageerror ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${vname} console ${m.text()}`); });
    await page.setCookie({ name: 'nine_sid', value: h.sessions.me.jar.token, url: h.origin });
    for (const [name, route] of SCREENS) {
      await page.goto(`${h.base}#/f/${h.fid}/${route}`, { waitUntil: 'networkidle0' });
      await page.reload({ waitUntil: 'networkidle0' });
      await sleep(500);
      const m = await page.evaluate(() => ({ scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight, overflowX: document.documentElement.scrollWidth > window.innerWidth }));
      metrics[`${vname}/${name}`] = { screens: +(m.scrollH / m.innerH).toFixed(2), overflowX: m.overflowX };
      await page.screenshot({ path: path.join(outDir, `${vname}-${name}.png`) });
      if (vname === '390') await page.screenshot({ path: path.join(outDir, `${vname}-${name}-full.png`), fullPage: true });
    }
    await ctx.close();
  }
  if (extra) {
    const click = (page, text, scope = 'button, a') => page.evaluate((text, scope) => {
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      const el = pool.find((e) => (e.textContent || '').trim().includes(text) || (e.getAttribute('aria-label') || '').includes(text));
      if (!el) throw new Error('không thấy ' + text);
      el.click();
    }, text, scope);
    const mk = async (view, dark = false) => {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
      page.on('pageerror', (e) => problems.push('pageerror ' + e.message));
      await page.setCookie({ name: 'nine_sid', value: h.sessions.me.jar.token, url: h.origin });
      return page;
    };
    const go = async (page, route) => { await page.goto(`${h.base}#/f/${h.fid}/${route}`, { waitUntil: 'networkidle0' }); await page.reload({ waitUntil: 'networkidle0' }); await sleep(450); };
    const shot = async (page, name) => { await sleep(350); await page.screenshot({ path: path.join(outDir, name + '.png') }); };
    const p = await mk({ width: 390, height: 844 });
    await go(p, 'cal'); await click(p, 'Xem tháng', 'button'); await sleep(600); await shot(p, 'x-cal-thang');
    await go(p, 'cal'); await click(p, 'Thêm', '.fab'); await sleep(500); await shot(p, 'x-quick-trong');
    await p.type('input[aria-label="Gõ một câu để điền sẵn"]', 'Piano thứ 7 9:30 Mía'); await p.keyboard.press('Enter'); await sleep(500); await shot(p, 'x-quick-dien-san');
    await go(p, 'today'); await click(p, 'Thêm', '.fab'); await sleep(500); await shot(p, 'x-add-menu');
    await go(p, 'today'); await click(p, 'Hỏi Osin'); await sleep(500); await shot(p, 'x-osin');
    await go(p, 'today'); await click(p, 'Đón Mía'); await sleep(500); await shot(p, 'x-ride-sheet');
    await go(p, 'more'); await shot(p, 'x-more');
    await go(p, 'shop'); await shot(p, 'x-shop');
    await go(p, 'tasks'); await shot(p, 'x-tasks');
    await go(p, 'rides'); await click(p, 'Lịch tuần', '[role=tab]'); await sleep(600); await shot(p, 'x-rides-tuan');
    await go(p, 'me'); await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); await sleep(300); await p.evaluate(() => window.scrollTo(0, 1700)); await shot(p, 'x-me-duoi');
    await p.evaluate(() => { localStorage.setItem('9family.big', 'true'); });
    await go(p, 'today'); await shot(p, 'x-big-today'); await go(p, 'cal'); await shot(p, 'x-big-cal');
    await p.evaluate(() => { localStorage.removeItem('9family.big'); });
    const q = await mk({ width: 320, height: 640 });
    await go(q, 'today'); await shot(q, 'x-320-today'); await go(q, 'cal'); await shot(q, 'x-320-cal');
    await q.evaluate(() => { localStorage.setItem('9family.big', 'true'); });
    await go(q, 'today'); await shot(q, 'x-320-big-today'); await go(q, 'rides'); await shot(q, 'x-320-big-rides');
    // trạng thái cảnh báo: gần giờ đón mà chưa ai nhận
    h.clock.set(h.vn.atMs(h.day, '16:15'));
    const w = await mk({ width: 390, height: 844 });
    await go(w, 'today'); await shot(w, 'x-today-canh-bao');
    const d2 = await mk({ width: 390, height: 844 }, true);
    await go(d2, 'today'); await shot(d2, 'x-toi-today'); await go(d2, 'cal'); await shot(d2, 'x-toi-cal'); await go(d2, 'rides'); await shot(d2, 'x-toi-rides'); await click(d2, 'Thêm', '.fab'); await sleep(500); await shot(d2, 'x-toi-sheet');
  }
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify({ problems, metrics }, null, 2));
  console.log(JSON.stringify(metrics, null, 1), problems);
} finally {
  await browser.close().catch(() => {});
  await h.close();
}
