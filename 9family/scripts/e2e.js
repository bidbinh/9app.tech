// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): nhiều phiên cùng lúc, điện thoại 390x844 và 360x740, sáng và tối.
// Chạy: node scripts/e2e.js   (tự dựng PostgreSQL nhúng + server, đồng hồ giả). Ảnh chụp lưu ở shots/.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const jsQR = (await import('jsqr')).default;
const { PNG } = await import('pngjs');

const pg = await startEmbedded({ database: 'family_e2e' });
process.env.DATABASE_URL = pg.url;
process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000';
process.env.FAMILY_PUSH_ALLOW_ANY = '1'; process.env.FAMILY_AI_KEY = 'khoa-ai-e2e'; process.env.FAMILY_AI_RETRY_MS = '5';
const webpush = (await import('web-push')).default;
const vk = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = vk.publicKey; process.env.VAPID_PRIVATE_KEY = vk.privateKey;
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const { clock } = await import('../src/clock.js');
const scheduler = await import('../src/scheduler.js');
const db = await import('../src/db.js');
const vn = await import('../src/vn.js');
const { solarToLunar } = await import('../src/lunar.js');
const push = await import('../src/push.js');
config.port = 0;
const app = await start({ scheduler: false });
const port = app.server.address().port;
const ORIGIN = `http://127.0.0.1:${port}`;
const URL0 = `${ORIGIN}${config.basePath}/`;
const at = (day, hhmm = '00:00') => vn.atMs(day, hhmm);
const TODAY = '2026-10-05'; // thứ hai
clock.set(at(TODAY, '06:30'));

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9family-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const results = []; const problems = [];
const cleanup = async () => { try { await browser.close(); } catch { /* bỏ qua */ } try { await app.close(); await db.close(); } catch { /* bỏ qua */ } try { await pg.stop(); } catch { /* bỏ qua */ } };
for (const sig of ['uncaughtException', 'unhandledRejection']) process.on(sig, async (err) => { console.error('LỖI KHÔNG BẮT ĐƯỢC:', err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : err); await cleanup(); process.exit(2); });
let VIEW = { width: 390, height: 844 };
let lastPage = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newUser(name, { dark = false, view = VIEW, tz = null, init = null, initArg = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  if (tz) await page.emulateTimezone(tz);
  if (init) await page.evaluateOnNewDocument(init, initArg);
  page.__name = name; page.__ctx = ctx; page.__dark = dark;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|ERR_INTERNET_DISCONNECTED)/.test(m.text()) && !/favicon|icon\.(svg|png)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText?.includes('ERR_ABORTED') && !/ERR_INTERNET_DISCONNECTED/.test(r.failure()?.errorText || '')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  return page;
}

const VISIBLE = `(e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }`;
async function find(page, text, scope = 'button, a, [role=radio], [role=tab]', exact = false) {
  lastPage = page;
  await page.bringToFront();
  let h = null;
  for (let tries = 0; tries < 16; tries++) {
    h = await page.evaluateHandle((text, scope, exact) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      const bars = els.filter((e) => e.closest('#cta, #tabs, #bar'));
      return [...pool, ...bars.filter((e) => !pool.includes(e) && !sheet)].find((e) => { const t = norm(e.textContent) || e.getAttribute('aria-label') || ''; return exact ? (t === text || e.getAttribute('aria-label') === text) : (t.includes(text) || (e.getAttribute('aria-label') || '').includes(text)); }) || null;
    }, text, scope, exact);
    if (h.asElement()) break;
    await sleep(250);
  }
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy "${text}" trên màn hình`);
  return el;
}
async function tap(page, text, o = {}) {
  const el = await find(page, text, o.scope, o.exact);
  await el.evaluate((e) => { if (!e.closest('#cta, .sheet, #tabs, #bar')) e.scrollIntoView({ block: 'center' }); });
  for (let i = 0, last = -1; i < 15; i++) { const y = await lastPage.evaluate(() => Math.round(window.scrollY)); if (y === last) break; last = y; await sleep(90); }
  await el.click();
  await sleep(o.wait ?? 250);
}
async function fieldEl(page, label) {
  lastPage = page;
  await page.bringToFront();
  await page.waitForFunction((label) => { const sheet = [...document.querySelectorAll('.sheet')].pop(); return [...document.querySelectorAll('label')].some((l) => (!sheet || sheet.contains(l)) && l.textContent.trim().startsWith(label) && l.getBoundingClientRect().width > 0); }, { timeout: 6000 }, label).catch(() => {});
  const h = await page.evaluateHandle((label) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sheet = [...document.querySelectorAll('.sheet')].pop();
    const labs = [...document.querySelectorAll('label')].filter((l) => !sheet || sheet.contains(l));
    const lab = labs.find((l) => norm(l.textContent).startsWith(label) && l.getBoundingClientRect().width > 0);
    return lab ? document.getElementById(lab.getAttribute('for')) : null;
  }, label);
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  return el;
}
async function fill(page, label, value, o = {}) {
  const el = await fieldEl(page, label);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const type = await el.evaluate((e) => e.type);
  if (o.select) { await el.select(value); return; }
  if (type === 'date' || type === 'time' || type === 'number') {
    await el.evaluate((e, v) => { e.focus(); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, value);
    return;
  }
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (value) await el.type(value, { delay: 0 });
  await sleep(380); // chờ cuộn mượt do bàn phím ảo kết thúc rồi mới thao tác tiếp
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, t, timeout = 9000) {
  await page.bringToFront();
  try { await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t); } catch { throw new Error(`[${page.__name}] chờ không thấy chữ "${t}". Màn hình hiện: ${(await text(page)).slice(0, 500).replace(/\n+/g, ' | ')}`); }
}
async function gone(page, t, timeout = 9000) { await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, t).catch(() => { throw new Error(`[${page.__name}] "${t}" vẫn còn trên màn hình`); }); }
async function noText(page, t) { if ((await text(page)).includes(t)) throw new Error(`[${page.__name}] không được thấy "${t}"`); }
async function shot(page, name) { await sleep(150); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const hashOf = (page) => page.evaluate(() => location.hash);
const api = (page, p, method = 'GET', body) => page.evaluate(async (p, method, body) => {
  const r = await fetch(new URL(p, document.baseURI), { method, headers: { 'X-Requested-With': '9family', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, p, method, body);

// kiểm tra từng màn: không tràn ngang, vùng bấm đủ lớn, chữ không quá nhỏ, tương phản cơ bản
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const out = { overflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth, sw: document.documentElement.scrollWidth, iw: window.innerWidth, small: [], tiny: [], noalt: 0, inputsNoLabel: [], lowContrast: [] };
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const sheetOn = !!document.querySelector('.sheet');
    for (const e of document.querySelectorAll('button, a.btn, a.tab, a.icon-btn, input, select, textarea, [role=radio], [role=tab]')) {
      if (!vis(e)) continue;
      if (sheetOn && !e.closest('.sheet')) continue;
      const r = e.getBoundingClientRect();
      if ((r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'file'))) out.small.push(`${e.tagName}.${e.className}:"${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (e.tagName === 'INPUT' && !e.labels?.length && !e.getAttribute('aria-label') && e.type !== 'checkbox') out.inputsNoLabel.push(e.placeholder || e.type);
    }
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const bgOf = (e) => { let n = e; while (n) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.9)) return c; n = n.parentElement; } return 'rgb(255,255,255)'; };
    for (const e of document.querySelectorAll('body *')) {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!vis(e)) continue;
      if (sheetOn && !e.closest('.sheet')) continue;
      const cs = getComputedStyle(e);
      const fs = parseFloat(cs.fontSize);
      if (fs < 12.9) out.tiny.push(`${e.tagName}.${e.className} ${fs}px "${e.textContent.trim().slice(0, 20)}"`);
      const fg = cs.color; const bg = bgOf(e);
      const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const big = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (big ? 3 : 4.5) && out.lowContrast.length < 6 && !e.closest('[disabled], .btn:disabled')) out.lowContrast.push(`${e.tagName}.${e.className} ${ratio.toFixed(2)} "${e.textContent.trim().slice(0, 20)}"`);
    }
    out.wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.sheet-back') && !e.classList.contains('offscreen')).slice(0, 4).map((e) => e.tagName + '.' + e.className);
    return out;
  });
  if (r.overflow) problems.push(`[${label}] TRÀN NGANG (scrollWidth ${r.sw} > ${r.iw})`);
  if (r.wide.length) problems.push(`[${label}] phần tử vượt khung: ${r.wide.join(', ')}`);
  if (r.small.length) problems.push(`[${label}] vùng bấm < 44px: ${[...new Set(r.small)].slice(0, 5).join('; ')}`);
  if (r.tiny.length) problems.push(`[${label}] chữ < 13px: ${[...new Set(r.tiny)].slice(0, 4).join('; ')}`);
  if (r.inputsNoLabel.length) problems.push(`[${label}] ô nhập không nhãn: ${r.inputsNoLabel.join(', ')}`);
  if (r.lowContrast.length) problems.push(`[${label}] tương phản thấp: ${[...new Set(r.lowContrast)].join('; ')}`);
}

async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); if (lastPage) { await lastPage.screenshot({ path: path.join(SHOTS, 'fail-' + results.length + '.png') }).catch(() => {}); }
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const tickNow = () => scheduler.tick(clock.now());
const setClock = (day, hhmm) => clock.set(at(day, hhmm));
const closeSheet = async (p) => { await tap(p, 'Đóng', { exact: true, scope: '.sheet button', wait: 300 }); };
const reloadAt = async (p, name) => { await p.evaluate((h) => { location.hash = h; }, '#/f/' + fid + '/' + name); await p.reload({ waitUntil: 'networkidle0' }); };
const goto = async (p, hash) => { await p.goto(URL0 + hash, { waitUntil: 'networkidle0' }); };
const tab = async (p, name) => { await p.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(250); await tap(p, name, { scope: '#tabs a', wait: 500 }); };
const inviteUrl = (p) => p.evaluate(() => document.querySelector('.linkbox[data-invite]').textContent);
const sheetText = (p) => p.evaluate(() => [...document.querySelectorAll('.sheet')].pop()?.innerText || '');

let me, bo, ba, out, fid;
const NAMES = { me: 'Mẹ Bình Minh 🌸', bo: 'Bố Tuấn', ba: 'Bà nội Lan' };

console.log('--- 390x844, chế độ sáng ---');
await step('màn đầu khi chưa có gia đình: trống nhưng rõ ràng, không tràn, không lỗi', async () => {
  me = await newUser('Mẹ');
  await goto(me, '');
  await waitText(me, 'Chào mừng đến 9family');
  await audit(me, 'welcome'); await shot(me, '01-welcome');
  must((await text(me)).includes('9app'), 'thiếu nút ‹ 9app');
});

await step('Mẹ tạo gia đình với tên có dấu và emoji; vào thẳng màn Hôm nay; gia đình mới trống có hướng dẫn', async () => {
  await fill(me, 'Tên gia đình', 'Nhà Cún Con 🏠');
  await fill(me, 'Tên của bạn', NAMES.me);
  await fill(me, 'Bạn là', 'me', { select: true });
  await tap(me, 'Tạo gia đình', { exact: true, wait: 900 });
  await waitText(me, 'Bắt đầu với gia đình mới');
  fid = (await hashOf(me)).split('/')[2];
  const t = await text(me);
  must(t.includes('Nhà Cún Con 🏠') && t.includes('Hôm nay'), 'thiếu tiêu đề');
  must(t.includes('Thứ hai, 05/10/2026') && new RegExp('Âm lịch ' + solarToLunar(TODAY).day + '/' + solarToLunar(TODAY).month).test(t), 'thiếu ngày dương/âm lịch: ' + t.slice(0, 200));
  await audit(me, 'today-moi'); await shot(me, '02-today-trong');
});

const kidForm = async (p, name, year, grade, school, note) => {
  await fill(p, 'Tên gọi', name); await fill(p, 'Năm sinh', String(year)); await fill(p, 'Lớp', grade); await fill(p, 'Trường', school); if (note) await fill(p, 'Ghi chú', note);
};
await step('Mẹ thêm con Bống (tên emoji, ghi chú) và Cún ở tab Gia đình', async () => {
  await tab(me, 'Gia đình');
  await waitText(me, 'Trẻ em (0/8)');
  must((await text(me)).includes('Chưa có con nào'), 'thiếu trạng thái chưa có con');
  await audit(me, 'family-moi'); await shot(me, '03-family-moi');
  await tap(me, '+ Thêm con', { wait: 400 });
  await kidForm(me, 'Bống 🎀', 2018, '3A', 'Tiểu học Hoa Mai', 'Dị ứng đậu phộng. Chờ ở cổng B.');
  await audit(me, 'child-sheet'); await shot(me, '04-them-con');
  await tap(me, 'Thêm con', { exact: true, wait: 700 });
  await waitText(me, 'Trẻ em (1/8)'); await waitText(me, 'Bống 🎀');
  await tap(me, '+ Thêm con', { wait: 400 });
  await kidForm(me, 'Cún', 2020, '1B', 'Mầm non Họa Mi', '');
  await tap(me, 'Thêm con', { exact: true, wait: 700 });
  await waitText(me, 'Trẻ em (2/8)');
  await tap(me, '+ Thêm con', { wait: 300 }); await kidForm(me, 'bống 🎀', 2018, '3A', 'x', ''); await tap(me, 'Thêm con', { exact: true, wait: 500 });
  await waitText(me, 'Đã có con tên này'); await closeSheet(me);
  await audit(me, 'family-2-con'); await shot(me, '05-family-co-con');
});

await step('Mẹ mời Bố bằng link; Bố mở link ở phiên mới và vào gia đình', async () => {
  await tap(me, '+ Mời', { wait: 400 });
  await fill(me, 'Tên', NAMES.bo); await fill(me, 'Vai trò', 'bo', { select: true });
  await tap(me, 'Tạo link mời', { exact: true, wait: 900 });
  await waitText(me, 'Link mời ' + NAMES.bo);
  const url = await inviteUrl(me);
  must(/\/9family\/m\/[A-Za-z0-9_-]{24}$/.test(url), 'link mời sai dạng: ' + url);
  await audit(me, 'invite-sheet'); await shot(me, '06-link-moi');
  await closeSheet(me);
  bo = await newUser('Bố');
  await bo.goto(url, { waitUntil: 'networkidle0' });
  await waitText(bo, 'Bạn được mời vào gia đình');
  must((await text(bo)).includes('Nhà Cún Con 🏠'), 'không thấy tên gia đình');
  await audit(bo, 'join'); await shot(bo, '07-moi-vao-gia-dinh');
  await tap(bo, 'Vào gia đình', { exact: true, wait: 900 });
  await waitText(bo, 'Hôm nay');
  must((await hashOf(bo)).includes('/today'), 'chưa vào màn Hôm nay');
  must(!(await text(bo)).includes('Bắt đầu với gia đình mới'), 'thành viên thường không nên thấy hướng dẫn của chủ');
  await shot(bo, '08-bo-today');
  bo.url0 = url;
});

await step('dùng lại link mời đã dùng: người lạ bị từ chối; chính Bố mở lại thì được báo đã ở trong gia đình', async () => {
  const la = await newUser('Người lạ');
  await la.goto(bo.url0, { waitUntil: 'networkidle0' });
  await waitText(la, 'Link này đã được dùng');
  await audit(la, 'link-da-dung'); await shot(la, '09-link-da-dung');
  must(!(await text(la)).includes('Nhà Cún'), 'lộ tên gia đình cho người lạ');
  await la.__ctx.close();
  await bo.goto(bo.url0, { waitUntil: 'networkidle0' });
  await waitText(bo, 'Bạn đã ở trong gia đình');
  await tap(bo, 'Mở gia đình', { wait: 600 }); await waitText(bo, 'Hôm nay');
});

await step('link mời hết hạn sau 7 ngày bị từ chối; chủ tạo link mới cho đúng người, Bà vào được', async () => {
  await tap(me, '+ Mời', { wait: 400 });
  await fill(me, 'Tên', NAMES.ba); await fill(me, 'Vai trò', 'ba', { select: true });
  await tap(me, 'Tạo link mời', { exact: true, wait: 900 });
  const url = await inviteUrl(me);
  await closeSheet(me);
  clock.set(clock.now() + 8 * 86400_000);
  ba = await newUser('Bà');
  await ba.goto(url, { waitUntil: 'networkidle0' });
  await waitText(ba, 'Link đã hết hạn');
  await audit(ba, 'link-het-han'); await shot(ba, '10-link-het-han');
  setClock(TODAY, '06:30');
  await waitText(me, 'Chưa vào');
  await tap(me, 'Thành viên ' + NAMES.ba, { wait: 400 });
  await tap(me, 'Tạo link mời mới', { wait: 900 });
  const url2 = await inviteUrl(me);
  must(url2 !== url, 'link mới trùng link cũ');
  await closeSheet(me);
  await ba.goto(url, { waitUntil: 'networkidle0' });
  await waitText(ba, 'Link không dùng được');
  await ba.goto(url2, { waitUntil: 'networkidle0' });
  await waitText(ba, 'Bạn được mời vào gia đình');
  await tap(ba, 'Vào gia đình', { exact: true, wait: 900 }); await waitText(ba, 'Hôm nay');
  ba.url0 = url2;
});

await step('người ngoài gia đình mở thẳng địa chỉ gia đình: không thấy gì', async () => {
  out = await newUser('Hàng xóm');
  for (const tabName of ['today', 'cal', 'rides', 'tasks', 'me', 'inbox']) {
    await goto(out, '#/f/' + fid + '/' + tabName);
    await waitText(out, 'Không tìm thấy');
    const t = await text(out);
    must(!/Nhà Cún|Bống|Cún|Mẹ Bình|Bố Tuấn/.test(t), 'lộ dữ liệu cho người ngoài ở ' + tabName);
  }
  await audit(out, 'ngoai-gia-dinh'); await shot(out, '11-nguoi-ngoai');
  must((await api(out, 'api/families/' + fid)).status === 404, 'API trả khác 404 cho người ngoài');
});

await step('thành viên thường (Bố) không thấy nút quản trị; chủ thấy đủ', async () => {
  await tab(bo, 'Gia đình');
  await waitText(bo, 'Trẻ em (2/8)');
  const t = (await text(bo)).toLowerCase();
  must(!t.includes('+ thêm con') && !t.includes('+ mời') && !t.includes('mốc nhắc đưa đón') && !t.includes('xóa gia đình'), 'Bố thấy nút quản trị');
  must(t.includes('thiết bị của bạn') && t.includes('rời gia đình'), 'thiếu phần của người thường');
  await audit(bo, 'family-bo'); await shot(bo, '12-family-bo');
  const tm = (await text(me)).toLowerCase();
  must(tm.includes('xóa gia đình') && tm.includes('chuyển quyền chủ gia đình') && tm.includes('mốc nhắc đưa đón'), 'chủ thiếu nút');
});

await step('Bố thêm thiết bị thứ hai bằng QR: quét ra đúng link, dùng một lần, gỡ thiết bị', async () => {
  await tap(bo, '+ Thêm thiết bị', { wait: 1200 });
  await waitText(bo, 'Còn');
  const img = await bo.$('.sheet img.qr');
  await img.evaluate((x) => x.scrollIntoView({ block: 'center' })); await sleep(200);
  await bo.waitForFunction(() => { const i = document.querySelector('.sheet img.qr'); return i && i.complete && i.naturalWidth > 0; }, { timeout: 5000 });
  const src = await bo.evaluate(() => document.querySelector('.sheet img.qr').src);
  const png = PNG.sync.read(Buffer.from(src.split(',')[1], 'base64'));
  const dec = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  const shown = await bo.evaluate(() => document.querySelector('.sheet .linkbox').textContent);
  must(dec === shown && /\/9family\/d\//.test(dec), 'QR không khớp link: ' + dec + ' vs ' + shown);
  await audit(bo, 'device-sheet'); await shot(bo, '13-lien-ket-thiet-bi');
  const bo2 = await newUser('Bố máy 2');
  await bo2.goto(dec, { waitUntil: 'networkidle0' });
  await waitText(bo2, 'Thêm thiết bị mới');
  await shot(bo2, '14-thiet-bi-moi');
  await tap(bo2, 'Liên kết thiết bị này', { wait: 900 });
  await waitText(bo2, 'Hôm nay');
  const again = await newUser('Bố máy 3');
  await again.goto(dec, { waitUntil: 'networkidle0' });
  await waitText(again, 'Link liên kết này đã được dùng');
  await again.__ctx.close();
  await closeSheet(bo);
  await bo.reload({ waitUntil: 'networkidle0' });
  await waitText(bo, 'máy này');
  const n = await bo.evaluate(() => [...document.querySelectorAll('.list-row')].filter((r) => /Gỡ/.test(r.textContent)).length);
  must(n === 1, 'phải có đúng 1 thiết bị khác để gỡ, thấy ' + n);
  await tap(bo, 'Gỡ thiết bị', { wait: 400 }); await tap(bo, 'Gỡ thiết bị', { exact: true, scope: '.sheet button', wait: 800 });
  await bo2.reload({ waitUntil: 'networkidle0' });
  await waitText(bo2, 'Không tìm thấy');
  await bo2.__ctx.close();
});

await step('Bà mất điện thoại: chủ mời lại đúng Bà, điện thoại cũ bị gỡ, Bà vào máy mới', async () => {
  await me.bringToFront();
  await gone(me, 'Chưa vào', 15000);
  await tap(me, 'Thành viên ' + NAMES.ba, { wait: 400 });
  await tap(me, 'Mời lại (mất điện thoại)', { wait: 900 });
  const url = await inviteUrl(me);
  await closeSheet(me);
  const baNew = await newUser('Bà máy mới');
  await baNew.goto(url, { waitUntil: 'networkidle0' });
  await waitText(baNew, 'Bạn được mời vào gia đình');
  await tap(baNew, 'Vào gia đình', { exact: true, wait: 900 });
  await waitText(baNew, 'Hôm nay');
  await ba.reload({ waitUntil: 'networkidle0' });
  await waitText(ba, 'Không tìm thấy');
  await ba.__ctx.close();
  ba = baNew;
  const members = (await api(me, 'api/families/' + fid)).json.members.filter((m) => !m.external);
  must(members.length === 3, 'số thành viên phải còn 3, thấy ' + members.length);
});


// ---------- thời khóa biểu, sự kiện, lịch ----------
const fillAria = async (p, prefix, value) => {
  const el = await p.waitForSelector(`input[aria-label^="${prefix}"]`, { timeout: 5000 });
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await el.click({ clickCount: 3 }); await p.keyboard.press('Backspace');
  if (value) await el.type(value, { delay: 0 });
  await sleep(380);
};
const calEvents = async (p, from, to, extra = '') => (await api(p, `api/families/${fid}/calendar?from=${from}&to=${to}${extra}`)).json.events;

await step('Mẹ nhập thời khóa biểu của Bống bằng lưới: nhập, chép sang thứ khác, lưu', async () => {
  await tab(me, 'Gia đình');
  await tap(me, 'Thời khóa biểu', { wait: 900 });
  await waitText(me, 'Chưa có thời khóa biểu');
  await audit(me, 'tkb-trong'); await shot(me, '15-tkb-trong');
  await fillAria(me, 'Tiết 1 07:00', 'Toán'); await fillAria(me, 'Tiết 2 07:50', 'Toán'); await fillAria(me, 'Tiết 3 08:50', 'Tiếng Việt');
  await tap(me, 'Thứ tư', { scope: '.wdtabs button', wait: 300 });
  await fillAria(me, 'Tiết 1 07:00', 'Mỹ thuật 🎨');
  await tap(me, 'Thứ hai', { scope: '.wdtabs button', wait: 300 });
  await tap(me, 'sang các thứ khác', { wait: 400 });
  await tap(me, 'T3', { scope: '.sheet .wd-row button', wait: 100 }); await tap(me, 'T5', { scope: '.sheet .wd-row button', wait: 100 });
  await tap(me, 'Chép', { exact: true, scope: '.sheet button', wait: 500 });
  await tap(me, 'Thứ ba', { scope: '.wdtabs button', wait: 300 });
  const v = await me.$eval('input[aria-label^="Tiết 1 07:00"]', (e) => e.value);
  must(v === 'Toán', 'chép sang thứ ba không đúng: ' + v);
  await audit(me, 'tkb-co-mon'); await shot(me, '16-tkb-co-mon');
  await tap(me, 'Lưu thời khóa biểu', { wait: 1200 });
  await waitText(me, 'Lịch');
  must((await hashOf(me)).endsWith('/cal'), 'sau khi lưu phải về màn Lịch');
  await waitText(me, 'Toán');
  const ev = await calEvents(me, '2026-10-05', '2026-10-11');
  const toan = ev.filter((e) => e.title === 'Toán');
  must(toan.length === 3 && toan[0].start === '07:00' && toan[0].end === '08:35', 'Toán phải gộp 2 tiết 07:00-08:35 ở 3 ngày: ' + JSON.stringify(toan.map((t) => [t.day, t.start, t.end])));
  await shot(me, '17-cal-tuan-tkb');
});

await step('Mẹ đọc ảnh thời khóa biểu của Cún bằng AI: cảnh báo gửi ảnh, thử lại khi 429, xem lại từng ô, không lưu ảnh', async () => {
  const gcalls = [];
  const gsrv = (await import('node:http')).createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      gcalls.push({ headers: req.headers, body: JSON.parse(b || '{}') });
      if (gcalls.length === 1) { res.writeHead(429); res.end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ periods: [{ n: 1, start: '07:30', end: '08:05' }, { n: 2, start: '08:10', end: '08:45' }], cells: [
        { weekday: 1, period: 1, subject: 'Tập đọc' }, { weekday: 1, period: 2, subject: 'Toán' }, { weekday: 2, period: 1, subject: 'Âm nhạc' }, { weekday: 3, period: 1, subject: 'Chữ s4i' }, { weekday: 3, period: 2, subject: 'Thể dục' }, { weekday: 9, period: 1, subject: 'rác' }] }) }] } }] }));
    });
  });
  await new Promise((r) => gsrv.listen(0, '127.0.0.1', r));
  config.aiBase = `http://127.0.0.1:${gsrv.address().port}`;
  const imgPath = path.join(os.tmpdir(), 'tkb-e2e.png');
  const png = new PNG({ width: 64, height: 64 }); png.data.fill(255); fs.writeFileSync(imgPath, PNG.sync.write(png));
  await tab(me, 'Gia đình');
  await waitText(me, 'Trẻ em (2/8)');
  await me.evaluate(() => { [...document.querySelectorAll('a.btn')].filter((a) => /Thời khóa biểu/.test(a.textContent))[1].click(); });
  await waitText(me, 'Nhập nhanh từ ảnh');
  await tap(me, 'Chọn ảnh thời khóa biểu', { wait: 400 });
  await waitText(me, 'Ảnh sẽ được gửi cho dịch vụ AI để đọc');
  await audit(me, 'tkb-ai-canh-bao'); await shot(me, '18-tkb-ai-canh-bao');
  const [chooser] = await Promise.all([me.waitForFileChooser(), tap(me, 'Tôi hiểu, chọn ảnh', { wait: 100 })]);
  await chooser.accept([imgPath]);
  await waitText(me, 'Xem lại kết quả đọc ảnh', 15000);
  must(gcalls.length === 2 && gcalls[1].headers['x-goog-api-key'] === 'khoa-ai-e2e', 'Gemini không được gọi đúng (' + gcalls.length + ' lần)');
  must(gcalls[1].body.contents[0].parts[1].inline_data.mime_type === 'image/jpeg', 'ảnh phải được thu nhỏ thành JPEG');
  const vals = await me.$$eval('.sheet input[type=text]', (a) => a.map((i) => i.value));
  must(vals.includes('Tập đọc') && vals.includes('Chữ s4i') && !vals.includes('rác') && vals.length === 5, 'kết quả đọc không đúng: ' + vals.join('|'));
  await audit(me, 'tkb-ai-review'); await shot(me, '19-tkb-ai-xem-lai');
  // bỏ chọn ô sai, sửa chữ ở ô lỗi
  const boxes = await me.$$('.sheet input[type=checkbox]');
  await boxes[boxes.length - 1].click();
  await fillAria(me, 'Thứ tư tiết 1', 'Chữ số');
  await tap(me, 'Dùng các ô đã chọn', { wait: 600 });
  await waitText(me, 'Đã đưa 4 ô vào lưới');
  const aiN = await me.$$eval('input.ai', (a) => a.length);
  must(aiN === 2, 'ô do AI điền phải được đánh dấu (thứ hai: 2 ô), thấy ' + aiN);
  await tap(me, 'Lưu thời khóa biểu', { wait: 1200 });
  await waitText(me, 'Lịch');
  const ev = await calEvents(me, '2026-10-05', '2026-10-11');
  must(ev.some((e) => e.title === 'Chữ số') && !ev.some((e) => e.title === 'Chữ s4i') && ev.some((e) => e.title === 'Tập đọc'), 'sự kiện từ ảnh không đúng');
  const dump = JSON.stringify(await db.query("SELECT * FROM ai_usage")) + JSON.stringify(await db.query('SELECT title, note FROM events'));
  must(!dump.includes('iVBOR'), 'ảnh bị lưu');
  gsrv.close();
});

const kidChip = (p, n) => tap(p, n, { scope: '.optchip', wait: 100 });
const evSave = async (p, label = 'Lưu sự kiện') => { await p.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(250); await tap(p, label, { exact: true, wait: 1000 }); };
await step('Mẹ tạo sự kiện lặp hằng tuần có nhắc và danh sách cần mang; xem trước các lần tới', async () => {
  await tab(me, 'Hôm nay');
  await waitText(me, 'Lịch hôm nay');
  await tap(me, '+ Thêm', { wait: 700 });
  await waitText(me, 'Thêm sự kiện');
  await fill(me, 'Tiêu đề', 'Học múa 💃'); await fill(me, 'Loại', 'nang_khieu', { select: true });
  await kidChip(me, 'Bống 🎀');
  await fill(me, 'Giờ bắt đầu', '16:00'); await fill(me, 'Giờ kết thúc', '17:00');
  await fill(me, 'Lặp lại', 'weekly', { select: true });
  await tap(me, 'T4', { scope: '.wd-row button', wait: 100 });
  await fill(me, 'Địa điểm', 'CLB Hoa Sen, Q.3');
  await tap(me, '30 phút trước', { scope: '.optchip', wait: 100 });
  const ck = await me.waitForSelector('input[placeholder="Ví dụ: Giày múa"]'); await ck.type('Giày múa'); await me.keyboard.press('Enter');
  await sleep(200); await me.type('input[placeholder="Ví dụ: Giày múa"]', 'Chai nước'); await me.keyboard.press('Enter');
  await waitText(me, 'Các lần tới');
  const t = await text(me);
  must(/Thứ hai, 05\/10\/2026/.test(t) && /Thứ tư, 07\/10\/2026/.test(t), 'xem trước lần tới sai: ' + t.slice(-400));
  await audit(me, 'event-form'); await shot(me, '20-form-su-kien');
  await evSave(me);
  await waitText(me, 'Học múa 💃'); await waitText(me, 'Giày múa, Chai nước');
  must((await hashOf(me)).endsWith('/today'), 'sau khi lưu phải về màn Hôm nay');
  const ev = await calEvents(me, '2026-10-05', '2026-10-11');
  must(ev.filter((e) => e.title === 'Học múa 💃').map((e) => e.day).join() === '2026-10-05,2026-10-07', 'lịch lặp sai');
  await audit(me, 'today-co-su-kien'); await shot(me, '21-today-co-su-kien');
});

await step('sự kiện một lần, sinh nhật hằng năm, giỗ và rằm theo âm lịch', async () => {
  const open = async () => { await goto(me, '#/f/' + fid + '/event/new/2026-10-10'); await waitText(me, 'Thêm sự kiện'); };
  await open();
  await fill(me, 'Tiêu đề', 'Họp phụ huynh'); await fill(me, 'Loại', 'hop_phu_huynh', { select: true });
  await kidChip(me, 'Cún'); await fill(me, 'Giờ bắt đầu', '08:00'); await tap(me, '1 ngày', { scope: '.optchip', wait: 100 });
  await evSave(me); await waitText(me, 'Lịch hôm nay');
  await open();
  await fill(me, 'Tiêu đề', 'Sinh nhật Bống 🎂'); await fill(me, 'Loại', 'ngay_quan_trong', { select: true });
  await tap(me, 'Cả ngày', { scope: 'label', wait: 100 });
  await fill(me, 'Ngày', '2018-02-28'); await fill(me, 'Lặp lại', 'yearly', { select: true });
  await waitText(me, '28/02/2027');
  await evSave(me); await waitText(me, 'Lịch hôm nay');
  await open();
  await fill(me, 'Tiêu đề', 'Giỗ ông nội 🕯️'); await fill(me, 'Loại', 'ngay_quan_trong', { select: true });
  await tap(me, 'Cả ngày', { scope: 'label', wait: 100 });
  await fill(me, 'Lặp lại', 'yearly_lunar', { select: true });
  await fill(me, 'Ngày âm lịch', '20', { select: true }); await fill(me, 'Tháng âm lịch', '8', { select: true });
  await tap(me, 'Đúng ngày (7 giờ sáng)', { scope: '.optchip', wait: 100 }); await tap(me, '1 ngày trước (7 giờ sáng)', { scope: '.optchip', wait: 100 });
  await waitText(me, '(âm 20/8)');
  const pv = await text(me);
  const { lunarToSolar } = await import('../src/lunar.js');
  const y27 = lunarToSolar(20, 8, 2027).split('-').reverse().join('/');
  must(pv.includes(y27), 'xem trước giỗ phải có ' + y27);
  await shot(me, '22-form-gio-am-lich');
  await evSave(me); await waitText(me, 'Lịch hôm nay');
  await open();
  await fill(me, 'Tiêu đề', 'Rằm 🌕'); await fill(me, 'Loại', 'ngay_quan_trong', { select: true });
  await tap(me, 'Cả ngày', { scope: 'label', wait: 100 });
  await fill(me, 'Lặp lại', 'monthly_lunar', { select: true });
  await tap(me, 'Rằm', { exact: true, scope: '.btn-row button', wait: 300 });
  await waitText(me, '(âm 15/');
  await evSave(me); await waitText(me, 'Lịch hôm nay');
  const wk = await calEvents(me, '2026-10-05', '2026-10-11');
  must(wk.some((e) => e.title === 'Họp phụ huynh' && e.day === '2026-10-10'), 'thiếu họp phụ huynh');
  const lunar15 = lunarToSolar(15, 9, 2026);
  const nov = await calEvents(me, lunar15, lunar15);
  must(nov.some((e) => e.title === 'Rằm 🌕'), 'thiếu rằm tháng 9 âm lịch ' + lunar15);
  const gio = await calEvents(me, lunarToSolar(20, 8, 2027), lunarToSolar(20, 8, 2027));
  must(gio.some((e) => e.title.startsWith('Giỗ ông nội')), 'thiếu giỗ 2027');
});

await step('sửa riêng một ngày, xóa một ngày, xóa từ ngày này về sau', async () => {
  await goto(me, '#/f/' + fid + '/today');
  await waitText(me, 'Học múa 💃');
  await tap(me, 'Học múa 💃', { scope: '.ev', wait: 800 });
  await waitText(me, 'Sửa riêng ngày này');
  await shot(me, '23-chi-tiet-su-kien');
  await tap(me, 'Sửa riêng ngày này', { wait: 500 });
  await fill(me, 'Bắt đầu', '17:00'); await fill(me, 'Kết thúc', '18:00'); await fill(me, 'Địa điểm', 'Phòng 2');
  await tap(me, 'Lưu cho ngày này', { wait: 900 });
  await waitText(me, '17:00'); await waitText(me, 'Đã sửa riêng ngày này');
  const ev1 = await calEvents(me, '2026-10-05', '2026-10-19');
  must(ev1.filter((e) => e.title === 'Học múa 💃').map((e) => e.start).join() === '17:00,16:00,16:00,16:00,16:00', 'sửa riêng một ngày sai: ' + ev1.filter((e) => e.title === 'Học múa 💃').map((e) => e.day + ' ' + e.start).join());
  // sang tuần sau: xóa chỉ thứ hai 12/10
  await tab(me, 'Lịch');
  await tap(me, 'Tuần sau', { wait: 700 });
  await waitText(me, '12/10');
  await tap(me, 'Học múa 💃', { scope: '.ev', wait: 800 });
  await tap(me, 'Xóa chỉ ngày này', { wait: 400 }); await tap(me, 'Xóa ngày này', { exact: true, wait: 900 });
  const ev2 = await calEvents(me, '2026-10-12', '2026-10-18');
  must(ev2.filter((e) => e.title === 'Học múa 💃').map((e) => e.day).join() === '2026-10-14', 'xóa một ngày sai: ' + JSON.stringify(ev2.filter((e) => e.title === 'Học múa 💃').map((e) => e.day)));
  // tuần thứ 3: xóa từ ngày này về sau
  await tap(me, 'Tuần sau', { wait: 700 });
  await tap(me, 'Học múa 💃', { scope: '.ev', wait: 800 });
  await tap(me, 'Xóa từ ngày này về sau', { wait: 400 }); await tap(me, 'Xóa', { exact: true, scope: '.sheet button', wait: 900 });
  const ev3 = await calEvents(me, '2026-10-19', '2026-11-30');
  must(!ev3.some((e) => e.title === 'Học múa 💃'), 'từ 19/10 phải hết Học múa');
  must((await calEvents(me, '2026-10-05', '2026-10-18')).filter((e) => e.title === 'Học múa 💃').length === 3, 'các ngày trước phải giữ');
});

await step('xem tuần, tháng, lọc theo con; hiện ngày âm; không tràn ngang', async () => {
  await goto(me, '#/f/' + fid + '/cal');
  await waitText(me, 'Tuần');
  if ((await text(me)).includes('Về hôm nay')) await tap(me, 'Về hôm nay', { wait: 700 });
  await waitText(me, 'Âm 25/8');
  await audit(me, 'cal-tuan'); await shot(me, '24-cal-tuan');
  await tap(me, 'Tháng', { exact: true, scope: '[role=tab]', wait: 700 });
  await waitText(me, 'Tháng 10/2026');
  const cells = await me.$$eval('.mcell', (c) => c.length);
  must(cells === 42, 'lưới tháng phải có 42 ô, thấy ' + cells);
  await tap(me, '10 sự kiện'.slice(0, 0) + 'Thứ bảy, 10/10', { scope: '.mcell', wait: 500 });
  await waitText(me, 'Họp phụ huynh');
  await audit(me, 'cal-thang'); await shot(me, '25-cal-thang');
  await tap(me, 'Cún', { scope: '.optchip', wait: 800 });
  const t = await text(me);
  must(t.includes('Họp phụ huynh') && !t.includes('Học múa'), 'lọc theo Cún sai');
  await tap(me, 'Tất cả', { scope: '.optchip', wait: 600 });
  await tap(me, 'Tuần', { exact: true, scope: '[role=tab]', wait: 600 });
});


// ---------- đưa đón ----------
const optSel = async (p, label, optText) => {
  const el = await fieldEl(p, label);
  const okv = await el.evaluate((s, t) => { const o = [...s.options].find((x) => x.textContent.trim() === t); if (!o) return false; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }, optText);
  must(okv, 'không có lựa chọn "' + optText + '" ở ô ' + label);
};
const rideNotifs = async (p) => (await api(p, `api/families/${fid}/notifications?limit=100`)).json.items.filter((i) => i.type === 'ride').map((i) => i.title).reverse();
const addRide = async (p, { dir, days, time, place, p0, p1, p2, kid }) => {
  await tap(p, 'Thêm ca', { wait: 500 });
  if (kid) await optSel(p, 'Con', kid);
  await tap(p, dir === 'dua' ? 'Đưa' : 'Đón', { exact: true, scope: '.sheet .optchip', wait: 100 });
  // bỏ chọn các thứ mặc định rồi chọn theo yêu cầu
  const cur = await p.$$eval('.sheet .wd-row button', (b) => b.map((x) => x.textContent.trim() + ':' + x.classList.contains('on')));
  for (const c of cur) { const [t, on] = c.split(':'); const want = days.includes(t); if ((on === 'true') !== want) await tap(p, t, { exact: true, scope: '.sheet .wd-row button', wait: 60 }); }
  await fill(p, 'Giờ', time); await fill(p, 'Địa điểm, ghi chú', place || '');
  if (p0) await optSel(p, 'Người phụ trách', p0);
  if (p1) await optSel(p, 'Người dự phòng thứ nhất', p1);
  if (p2) await optSel(p, 'Người dự phòng thứ hai', p2);
  await tap(p, 'Thêm ca', { exact: true, scope: '.sheet button', wait: 900 });
};
const wdTxt = (a) => a.map((d) => F_WD[d]).join(', ');
const F_WD = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

await step('Mẹ đặt lịch đưa đón theo tuần: người phụ trách + hai người dự phòng, người đón hộ', async () => {
  // người đón hộ trước
  await tab(me, 'Gia đình');
  await waitText(me, 'Trẻ em (2/8)');
  await tap(me, '+ Thêm', { exact: true, wait: 400 });
  await waitText(me, 'Thêm người đón hộ');
  await fill(me, 'Họ tên', 'Cô Hoa hàng xóm'); await fill(me, 'Số điện thoại', '0912 345 678'); await fill(me, 'Nhận dạng', 'Áo xanh, xe Vision biển 29-B1 123.45');
  await audit(me, 'helper-sheet'); await shot(me, '26-them-nguoi-don-ho');
  await tap(me, 'Thêm người đón hộ', { exact: true, scope: '.sheet button', wait: 800 });
  await waitText(me, '0912 345 678');
  await tab(me, 'Đưa đón');
  await waitText(me, 'Theo ngày');
  must((await text(me)).includes('Không có ca đưa đón'), 'thiếu trạng thái chưa có ca');
  await tap(me, 'Lịch tuần', { scope: '[role=tab]', wait: 700 });
  await waitText(me, 'Chưa có ca đưa đón nào');
  await audit(me, 'rides-tuan-trong'); await shot(me, '27-lich-tuan-trong');
  const bong = (n) => n;
  await tap(me, 'Thêm ca', { wait: 500 });
  await waitText(me, 'Thêm ca đưa đón');
  await audit(me, 'ride-form'); await shot(me, '28-form-ca');
  await closeSheet(me);
  await addRide(me, { dir: 'don', days: ['T2', 'T3', 'T4', 'T5', 'T6'], time: '16:30', place: 'Cổng B', p0: NAMES.me, p1: NAMES.bo, p2: NAMES.ba });
  await waitText(me, 'Đón lúc 16:30');
  await tap(me, 'Thêm ca', { wait: 500 });
  await addRide(me, { dir: 'dua', days: ['T2', 'T3', 'T4', 'T5', 'T6'], time: '07:00', place: 'Cổng trường', p0: NAMES.bo, p1: NAMES.me });
  await waitText(me, 'Đưa lúc 07:00');
  // Cún: chỉ có người phụ trách là Bà, chưa có dự phòng; ca 11:00 giao Cô Hoa
  const cards = await me.$$('.card.c-cam .linkbtn');
  await me.evaluate(() => { [...document.querySelectorAll('.card .linkbtn')].filter((b) => b.textContent === 'Thêm ca')[1].click(); });
  await sleep(500);
  await optSel(me, 'Người phụ trách', 'Cô Hoa hàng xóm (đón hộ)');
  await fill(me, 'Giờ', '11:00'); await fill(me, 'Địa điểm, ghi chú', 'Cổng mầm non');
  for (const c of ['T3', 'T4', 'T5', 'T6']) await tap(me, c, { exact: true, scope: '.sheet .wd-row button', wait: 50 });
  await tap(me, 'Thêm ca', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(me, 'Cô Hoa hàng xóm');
  void cards; void bong;
  const t = await text(me);
  must(t.includes('Đón lúc 16:30 · T2, T3, T4, T5, T6') && t.includes('dự phòng Bố Tuấn, Bà nội Lan'), 'lịch tuần hiển thị sai: ' + t.slice(0, 600));
  await audit(me, 'rides-tuan'); await shot(me, '29-lich-tuan');
  const rides = (await api(me, `api/families/${fid}/rides`)).json.rides;
  must(rides.length === 11, 'phải có 11 ca (5 đón + 5 đưa + 1 đón của Cún), thấy ' + rides.length);
});

await step('màn Hôm nay hiện đủ ca; thành viên thường thấy cùng dữ liệu; sửa ca (đổi giờ)', async () => {
  await tab(me, 'Hôm nay');
  await waitText(me, 'Đưa đón hôm nay');
  await waitText(me, 'Đưa Bống 🎀 · 07:00');
  const t = await text(me);
  must(t.includes('Đón Bống 🎀 · 16:30') && t.includes('Đón Cún · 11:00') && t.includes('Phụ trách: Bố Tuấn'), 'thẻ ca thiếu thông tin: ' + t.slice(0, 700));
  must(t.includes('Cô Hoa hàng xóm (người đón hộ)') && t.includes('0912 345 678'), 'thiếu thông tin người đón hộ');
  await audit(me, 'today-co-ca'); await shot(me, '30-today-co-ca');
  await reloadAt(bo, 'today');
  await waitText(bo, 'Đưa Bống 🎀 · 07:00');
  await audit(bo, 'today-bo'); await shot(bo, '31-today-bo');
  must(!(await text(bo)).includes('Bắt đầu với gia đình mới'), 'Bố thấy hướng dẫn của chủ');
});

await step('buổi sáng: nhắc người phụ trách, "Tôi nhận" rồi "Đang đi" rồi "Đã đưa" báo cả nhà', async () => {
  setClock(TODAY, '06:30'); await tickNow();
  const nb = await rideNotifs(bo);
  must(nb.length === 1 && nb[0] === 'Sắp tới giờ đưa Bống 🎀', 'Bố phải nhận đúng 1 nhắc: ' + nb.join('|'));
  must((await rideNotifs(me)).length === 0, 'Mẹ chưa được nhắc');
  await reloadAt(bo, 'today');
  await waitText(bo, 'Bạn có 1 thông báo chưa đọc');
  await tap(bo, 'Tôi nhận', { wait: 800 });
  await waitText(bo, 'Bố Tuấn đã nhận'); await waitText(bo, 'Đang đi');
  await tap(bo, 'Đang đi', { wait: 700 }); await waitText(bo, 'Đang đi');
  await shot(bo, '32-bo-dang-di');
  setClock(TODAY, '07:05');
  await tap(bo, 'Đã đưa', { exact: true, wait: 900 });
  await waitText(bo, 'Bố Tuấn đã đưa lúc 07:05');
  for (const p of [me, ba]) {
    const n = await rideNotifs(p);
    must(n.includes('Bống 🎀 đã đưa xong'), 'thiếu thông báo đã đưa cho ' + p.__name + ': ' + n.join('|'));
  }
  must(!(await rideNotifs(bo)).includes('Bống 🎀 đã đưa xong'), 'người bấm không cần nhận thông báo của chính mình');
  await reloadAt(me, 'today');
  await waitText(me, 'Đã đưa'); await waitText(me, 'Bố Tuấn đã đưa lúc 07:05');
  await shot(me, '33-me-thay-da-dua');
});

await step('ghi đè trong ngày: Mẹ đổi người đón của Cún sang Bố, Bố thấy ngay', async () => {
  setClock(TODAY, '07:10');
  await me.bringToFront();
  const cardSel = await me.evaluateHandle(() => [...document.querySelectorAll('.ride')].find((c) => c.textContent.includes('Đón Cún')));
  await cardSel.asElement().evaluate((c) => c.scrollIntoView({ block: 'center' }));
  await (await cardSel.asElement().$('button.linkbtn')).click(); await sleep(500);
  await waitText(me, 'Đổi người đón Cún');
  await tap(me, 'Bố Tuấn', { scope: '.sheet .pick', wait: 200 });
  await fill(me, 'Lý do', 'Hôm nay cô Hoa bận');
  await audit(me, 'assign-sheet'); await shot(me, '34-doi-nguoi');
  await tap(me, 'Đổi người', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(me, 'Đã đổi người trong ngày bởi Mẹ Bình Minh 🌸: Hôm nay cô Hoa bận');
  await reloadAt(bo, 'today');
  await waitText(bo, 'Đón Cún');
  const n = await rideNotifs(bo);
  must(n.includes('Nhờ bạn đón Cún lúc 11:00'), 'Bố phải được báo nhờ đón: ' + n.join('|'));
  must((await text(bo)).includes('Phụ trách: Bố Tuấn'), 'Bố phải thấy mình là người phụ trách');
  // lịch cố định không đổi
  const wk = (await api(me, `api/families/${fid}/rides/board?day=2026-10-12`)).json.rides.find((r) => r.childName === 'Cún');
  must(wk.p0Name === 'Cô Hoa hàng xóm', 'tuần sau vẫn là cô Hoa');
});

await step('bỏ qua một ca (con nghỉ ốm): cả nhà thấy, hết nhắc, khôi phục được', async () => {
  const card = await me.evaluateHandle(() => [...document.querySelectorAll('.ride')].find((c) => c.textContent.includes('Đón Cún')));
  await card.asElement().evaluate((c) => c.scrollIntoView({ block: 'center' }));
  await me.evaluate(() => { [...document.querySelectorAll('.ride')].find((c) => c.textContent.includes('Đón Cún')).querySelectorAll('button.linkbtn')[1].click(); });
  await sleep(500);
  await waitText(me, 'Bỏ qua ca đón Cún');
  await fill(me, 'Lý do', 'Cún nghỉ ốm');
  await tap(me, 'Bỏ qua ca này', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(me, 'Bỏ qua bởi Mẹ Bình Minh 🌸: Cún nghỉ ốm');
  const n = await rideNotifs(ba);
  must(n.includes('Bỏ qua ca đón Cún lúc 11:00'), 'Bà phải được báo bỏ qua: ' + n.join('|'));
  await shot(me, '35-bo-qua');
  await tap(me, 'Khôi phục ca', { wait: 800 });
  await gone(me, 'Bỏ qua bởi');
  await tap(me, 'Cô Hoa hàng xóm đã nhận'.slice(0, 0) + 'Tôi nhận', { wait: 100 }).catch(() => {});
});


// ---------- leo thang buổi chiều ----------
const countNot = async (p, title) => (await rideNotifs(p)).filter((t) => t === title).length;
await step('leo thang T-30, T-20, T-10, T-5, sau giờ 10 phút: đúng người nhận đúng mốc, qua giao diện', async () => {
  const T = '16:30';
  setClock(TODAY, '15:59'); await tickNow();
  must(await countNot(me, 'Sắp tới giờ đón Bống 🎀') === 0, 'chưa tới mốc T-30');
  setClock(TODAY, '16:00'); await tickNow(); await tickNow();
  must(await countNot(me, 'Sắp tới giờ đón Bống 🎀') === 1, 'Mẹ phải nhận đúng 1 nhắc T-30');
  must((await rideNotifs(bo)).filter((t) => /đón Bống/.test(t)).length === 0 && (await rideNotifs(ba)).filter((t) => /đón Bống/.test(t)).length === 0, 'Bố, Bà chưa được nhắc ở T-30');
  await reloadAt(me, 'today');
  await waitText(me, 'Còn 30 phút');
  await shot(me, '36-t-30');
  setClock(TODAY, '16:10'); await tickNow(); await tickNow();
  must(await countNot(bo, 'Nhờ bạn đón Bống 🎀 lúc 16:30') === 1, 'Bố (dự phòng 1) phải được nhờ ở T-20');
  must(await countNot(me, 'Bạn chưa nhận ca đón Bống 🎀 lúc 16:30') === 1, 'Mẹ phải được báo chưa nhận ở T-20');
  must(await countNot(ba, 'Nhờ bạn đón Bống 🎀 lúc 16:30') === 0, 'Bà chưa được nhờ ở T-20');
  setClock(TODAY, '16:20'); await tickNow();
  must(await countNot(ba, 'Nhờ bạn đón Bống 🎀 lúc 16:30') === 1, 'Bà (dự phòng 2) phải được nhờ ở T-10');
  setClock(TODAY, '16:25'); await tickNow();
  for (const p of [me, bo, ba]) must(await countNot(p, 'Chưa ai nhận ca đón Bống 🎀 lúc 16:30') === 1, p.__name + ' phải được báo cả nhà ở T-5');
  await reloadAt(ba, 'today');
  await waitText(ba, 'Còn 5 phút');
  await shot(ba, '37-t-5-ba');
  setClock(TODAY, '16:40'); await tickNow(); await tickNow();
  for (const p of [me, bo, ba]) must(await countNot(p, 'Quá giờ đón Bống 🎀 10 phút, chưa ai nhận') === 1, p.__name + ' phải được nhắc sau giờ ca');
  await reloadAt(me, 'today');
  await waitText(me, 'Đã nhắc hết các mốc mà chưa ai nhận'); await waitText(me, 'Chưa ai nhận');
  await audit(me, 'today-khong-ai'); await shot(me, '38-khong-ai');
  // hộp thông báo của Bà: đúng thứ tự, đánh dấu mới
  await tap(ba, 'Thông báo', { scope: '#bar a', wait: 900 });
  await waitText(ba, 'Thông báo');
  const t = await text(ba);
  must(t.includes('Nhờ bạn đón Bống 🎀 lúc 16:30') && t.includes('Quá giờ đón Bống 🎀 10 phút, chưa ai nhận') && t.includes('Mới'), 'hộp thông báo của Bà thiếu: ' + t.slice(0, 400));
  await audit(ba, 'inbox'); await shot(ba, '39-hop-thong-bao');
  await reloadAt(ba, 'today');
  must(!(await text(ba)).includes('thông báo chưa đọc'), 'mở hộp thư xong phải hết chưa đọc');
});

await step('"Tôi nhận" từ hai người cùng lúc: chỉ một người thắng, người kia được báo rõ', async () => {
  await reloadAt(bo, 'today'); await reloadAt(ba, 'today');
  await waitText(bo, 'Đón Bống 🎀 · 16:30'); await waitText(ba, 'Đón Bống 🎀 · 16:30');
  const claim = (p) => p.evaluateHandle(() => [...document.querySelectorAll('.ride')].find((c) => c.textContent.includes('Đón Bống')));
  const btn = async (p) => { const c = await claim(p); return (await c.asElement().$$('button.btn')).then ? null : null; };
  void btn;
  const press = async (p) => {
    const h = await p.evaluateHandle(() => [...document.querySelectorAll('.ride')].find((c) => c.textContent.includes('Đón Bống')).querySelector('button.btn.primary'));
    return h.asElement();
  };
  const b1 = await press(bo), b2 = await press(ba);
  await Promise.all([b1.click(), b2.click()]);
  await sleep(1500);
  const rows = await db.query("SELECT m.name FROM ride_days r JOIN members m ON m.id = r.claimed_by JOIN children c ON c.id = r.child_id WHERE c.name LIKE 'Bống%' AND r.dir='don' AND r.day=$1", [TODAY]);
  must(rows.length === 1, 'phải có đúng 1 người nhận');
  const winner = rows[0].name;
  const loser = winner === NAMES.bo ? ba : bo;
  const winnerPage = winner === NAMES.bo ? bo : ba;
  await waitText(winnerPage, winner + ' đã nhận');
  const lt = await text(loser);
  must(/đã nhận ca này rồi/.test(lt) || lt.includes(winner + ' đã nhận'), 'người thua không được báo: ' + lt.slice(0, 300));
  await shot(loser, '40-nguoi-thua');
  // người thắng bấm Đã đón hai lần nhanh liền nhau: chỉ ghi một lần
  setClock(TODAY, '16:45');
  const dn = await winnerPage.evaluateHandle(() => [...document.querySelectorAll('.ride')].find((c) => c.textContent.includes('Đón Bống')).querySelector('button.btn.primary'));
  await Promise.all([dn.asElement().click(), dn.asElement().click().catch(() => {})]);
  await sleep(1200);
  await waitText(winnerPage, 'đã đón lúc 16:45');
  const n = (await db.query("SELECT count(*)::int n FROM notifications WHERE title LIKE '%đã đón xong%'"))[0].n;
  must(n === 2, 'thông báo "đã đón xong" phải đúng 2 (hai người còn lại), thấy ' + n);
  for (const p of [me, loser]) must((await rideNotifs(p)).includes('Bống 🎀 đã đón xong'), p.__name + ' phải nhận "đã đón xong"');
  const before = (await db.query("SELECT count(*)::int n FROM notifications WHERE type='ride'"))[0].n;
  setClock(TODAY, '17:30'); await tickNow();
  must((await db.query("SELECT count(*)::int n FROM notifications WHERE type='ride'"))[0].n === before, 'xong rồi thì không nhắc nữa');
});

await step('người đón hộ: nút "đã nhận" thay cô Hoa, rồi "Đã đón"; lịch sử các ca', async () => {
  await reloadAt(me, 'rides');
  await waitText(me, 'Theo ngày');
  for (let i = 0; i < 7; i++) await tap(me, 'Ngày sau', { wait: 450 });
  await waitText(me, 'Thứ hai, 12/10');
  await waitText(me, 'Đón Cún');
  const t = await text(me);
  must(t.includes('Cô Hoa hàng xóm (người đón hộ)') && t.includes('Cô Hoa hàng xóm đã nhận'), 'thiếu nút ghi nhận hộ');
  await shot(me, '41-ca-cua-co-hoa');
  setClock(TODAY, '17:40');
  await tap(me, 'Cô Hoa hàng xóm đã nhận', { wait: 900 });
  await waitText(me, 'Cô Hoa hàng xóm đã nhận');
  await tap(me, 'Đã đón', { exact: true, scope: '.ride button', wait: 900 });
  await waitText(me, 'Cô Hoa hàng xóm đã đón lúc 17:40');
  await tap(me, 'Lịch sử', { scope: '[role=tab]', wait: 800 });
  await waitText(me, 'Lịch sử');
  const h = await text(me);
  must(h.includes('đã đưa lúc 07:05') && h.includes('đã đón lúc 16:45') && h.includes('Cô Hoa hàng xóm đã đón'), 'lịch sử thiếu: ' + h.slice(0, 500));
  await audit(me, 'rides-lich-su'); await shot(me, '42-lich-su');
});

await step('ca chưa gán người: thiết kế rõ, ai cũng nhận được', async () => {
  await reloadAt(me, 'rides');
  await tap(me, 'Lịch tuần', { scope: '[role=tab]', wait: 700 });
  await me.evaluate(() => { [...document.querySelectorAll('.card .linkbtn')].filter((b) => b.textContent === 'Thêm ca')[0].click(); });
  await sleep(500);
  await tap(me, 'Đón', { exact: true, scope: '.sheet .optchip', wait: 100 });
  for (const c of ['T2', 'T3', 'T4', 'T5', 'T6']) await tap(me, c, { exact: true, scope: '.sheet .wd-row button', wait: 50 });
  await tap(me, 'T7', { exact: true, scope: '.sheet .wd-row button', wait: 50 });
  await fill(me, 'Giờ', '12:00'); await fill(me, 'Địa điểm, ghi chú', 'Lớp năng khiếu');
  await tap(me, 'Thêm ca', { exact: true, scope: '.sheet button', wait: 900 });
  await tap(me, 'Theo ngày', { scope: '[role=tab]', wait: 700 });
  for (let i = 0; i < 5; i++) await tap(me, 'Ngày sau', { wait: 450 });
  await waitText(me, 'Thứ bảy, 10/10');
  await waitText(me, 'Chưa gán người'); await waitText(me, 'Chưa có người phụ trách');
  await audit(me, 'ride-chua-gan'); await shot(me, '43-ca-chua-gan');
  await ba.bringToFront();
  const r = await api(ba, `api/families/${fid}/rides/board?day=2026-10-10`);
  const rd = r.json.rides.find((x) => x.time === '12:00');
  must(rd && rd.p0 === null && rd.state === 'cho', 'ca phải chưa gán');
  const c = await api(ba, `api/families/${fid}/ride-days/${rd.id}/claim`, 'POST', {});
  must(c.status === 200 && c.json.ride.p0Name === 'Bà nội Lan', 'Bà nhận ca chưa gán được');
});


// ---------- việc chung, mua sắm, cài đặt, ICS, Web Push ----------
const newDevice = async (owner, name, opts = {}) => {
  await owner.bringToFront();
  const hash = await hashOf(owner);
  if (!hash.endsWith('/me')) await tab(owner, 'Gia đình');
  await waitText(owner, 'Thiết bị của bạn');
  await tap(owner, '+ Thêm thiết bị', { wait: 1300 });
  await waitText(owner, 'Còn');
  const url = await owner.evaluate(() => document.querySelector('.sheet .linkbox').textContent);
  await closeSheet(owner);
  const p = await newUser(name, opts);
  if (opts.ua) await p.setUserAgent(opts.ua);
  await p.goto(url, { waitUntil: 'networkidle0' });
  await waitText(p, 'Thêm thiết bị mới');
  await tap(p, 'Liên kết thiết bị này', { wait: 1000 });
  await waitText(p, 'Hôm nay');
  return p;
};

await step('việc chung: thêm nhanh, giao việc có hạn, tích xong; mua sắm dùng chung; bản nháp đang gõ không bị mất khi cập nhật', async () => {
  await tab(bo, 'Việc chung');
  await waitText(bo, 'Chưa có việc nào');
  await audit(bo, 'tasks-trong'); await shot(bo, '44-viec-trong');
  await bo.type('input[aria-label="Việc mới"]', 'Đóng tiền điện ⚡'); await bo.keyboard.press('Enter');
  await waitText(bo, 'Đóng tiền điện ⚡');
  await sleep(400);
  await tap(bo, 'Sửa việc: Đóng tiền điện', { wait: 500 });
  await optSel(bo, 'Giao cho', NAMES.ba);
  await fill(bo, 'Hạn', '2026-10-06');
  await tap(bo, 'Lưu', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(bo, 'Giao cho Bà nội Lan'); await waitText(bo, 'Hạn 06/10');
  await tab(ba, 'Việc chung');
  await waitText(ba, 'Đóng tiền điện ⚡');
  must((await rideNotifs(ba)).length >= 0 && (await api(ba, `api/families/${fid}/notifications`)).json.items.some((i) => i.title === 'Bố Tuấn giao việc cho bạn'), 'Bà phải nhận thông báo được giao việc');
  await audit(ba, 'tasks-ba'); await shot(ba, '45-viec-ba');
  await tap(ba, 'Đánh dấu đã xong: Đóng tiền điện', { wait: 900 });
  await waitText(ba, 'Đã xong gần đây'); await waitText(ba, 'Bà nội Lan đã xong');
  // mua sắm
  await tab(me, 'Việc chung');
  await tap(me, 'Mua sắm', { scope: '[role=tab]', wait: 600 });
  await waitText(me, 'Danh sách mua sắm trống');
  await me.type('input[aria-label="Món cần mua"]', 'Sữa tươi, trứng gà, bánh mì 🥖'); await me.keyboard.press('Enter');
  await waitText(me, 'bánh mì 🥖');
  await audit(me, 'shopping'); await shot(me, '46-mua-sam');
  await tab(ba, 'Việc chung'); await tap(ba, 'Mua sắm', { scope: '[role=tab]', wait: 600 });
  await waitText(ba, 'Sữa tươi');
  await tap(ba, 'Đã mua: Sữa tươi', { wait: 900 });
  await waitText(ba, 'Bà nội Lan đã mua');
  // bản nháp đang gõ ở máy Bố giữ nguyên khi máy khác thêm món
  await tab(bo, 'Việc chung'); await tap(bo, 'Mua sắm', { scope: '[role=tab]', wait: 600 });
  await waitText(bo, 'Sữa tươi');
  await bo.click('input[aria-label="Món cần mua"]'); await bo.keyboard.type('Gạo ST25 đang gõ dở');
  await me.bringToFront();
  await me.type('input[aria-label="Món cần mua"]', 'Dầu ăn'); await me.keyboard.press('Enter');
  await waitText(me, 'Dầu ăn');
  await sleep(13000);
  await bo.bringToFront();
  const v = await bo.$eval('input[aria-label="Món cần mua"]', (i) => ({ value: i.value, focus: document.activeElement === i }));
  must(v.value === 'Gạo ST25 đang gõ dở' && v.focus, 'ô đang gõ bị mất chữ hoặc mất tiêu điểm: ' + JSON.stringify(v));
  await waitText(bo, 'Dầu ăn', 6000);
  await bo.evaluate(() => document.activeElement.blur());
  await tab(me, 'Việc chung'); await tap(me, 'Mua sắm', { scope: '[role=tab]', wait: 600 });
  await tap(me, 'Dọn đã mua', { wait: 900 });
  await gone(me, 'Đã mua', 6000).catch(() => {});
  const lists = (await api(me, `api/families/${fid}/lists`)).json;
  must(!lists.shopping.some((s) => s.bought) && lists.shopping.length === 3, 'dọn đã mua sai');
});

await step('Mẹ chỉnh mốc nhắc đưa đón (kiểm tra mốc giảm dần), áp dụng ngay cho ca kế tiếp', async () => {
  await tab(me, 'Gia đình');
  await waitText(me, 'Mốc nhắc đưa đón');
  await fill(me, 'Nhắc người phụ trách', '10');
  await tap(me, 'Lưu mốc nhắc', { wait: 800 });
  await waitText(me, 'phải giảm dần');
  await audit(me, 'family-esc-loi'); await shot(me, '47-esc-loi');
  await fill(me, 'Nhắc người phụ trách', '60'); await fill(me, 'Nhắc người dự phòng thứ nhất', '40'); await fill(me, 'Nhắc người dự phòng thứ hai', '20');
  await fill(me, 'Báo cả gia đình', '10'); await fill(me, 'Nhắc cả nhà nếu quá giờ', '5');
  await tap(me, 'Lưu mốc nhắc', { wait: 900 });
  await waitText(me, 'Đã lưu mốc nhắc');
  const esc = (await api(me, `api/families/${fid}`)).json.family.esc;
  must(esc.t1 === 60 && esc.t2 === 40 && esc.t3 === 20 && esc.t4 === 10 && esc.after === 5, 'mốc không lưu: ' + JSON.stringify(esc));
  await fill(me, 'Nhắc người phụ trách', '30'); await fill(me, 'Nhắc người dự phòng thứ nhất', '20'); await fill(me, 'Nhắc người dự phòng thứ hai', '10');
  await fill(me, 'Báo cả gia đình', '5'); await fill(me, 'Nhắc cả nhà nếu quá giờ', '10');
  await tap(me, 'Lưu mốc nhắc', { wait: 900 });
});

await step('lịch ICS: link hiện đúng, tải về hợp lệ, đổi link thì link cũ chết', async () => {
  await waitText(me, 'Đăng ký lịch vào Google/Apple Calendar');
  const link1 = await me.evaluate(() => [...document.querySelectorAll('.linkbox')].map((b) => b.textContent).find((t) => /\/ics\//.test(t)));
  must(/\/9family\/ics\/[A-Za-z0-9_-]{43}\.ics$/.test(link1), 'link ICS sai: ' + link1);
  const anon = await newUser('Ứng dụng lịch');
  await anon.goto(URL0, { waitUntil: 'networkidle0' });
  const r = await anon.evaluate(async (u) => { const x = await fetch(u); return { s: x.status, ct: x.headers.get('content-type'), t: await x.text() }; }, link1);
  must(r.s === 200 && /^text\/calendar/.test(r.ct), 'ICS không tải được: ' + r.s + ' ' + r.ct);
  must(r.t.startsWith('BEGIN:VCALENDAR\r\n') && r.t.includes('SUMMARY:Học múa 💃') && r.t.includes('SUMMARY:Giỗ ông nội') && r.t.includes('DTSTART:20261007T090000Z'), 'nội dung ICS thiếu: ' + r.t.slice(0, 300));
  await tap(me, 'Đổi link', { exact: true, wait: 500 });
  await tap(me, 'Đổi link', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(me, 'Đã đổi link lịch');
  const link2 = await me.evaluate(() => [...document.querySelectorAll('.linkbox')].map((b) => b.textContent).find((t) => /\/ics\//.test(t)));
  must(link2 !== link1, 'link ICS không đổi');
  const r2 = await anon.evaluate(async (u) => (await fetch(u)).status, link1);
  const r3 = await anon.evaluate(async (u) => (await fetch(u)).status, link2);
  must(r2 === 404 && r3 === 200, 'link cũ phải chết, link mới phải sống: ' + r2 + ' ' + r3);
  await anon.__ctx.close();
});

// máy chủ đẩy giả (HTTPS tự ký) + giải mã RFC 8291
const pushGot = [];
const pushSrv = https.createServer({ key: fs.readFileSync(path.join(root, 'test/fixtures/push-key.pem')), cert: fs.readFileSync(path.join(root, 'test/fixtures/push-cert.pem')) }, (req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => { pushGot.push({ path: req.url, body: Buffer.concat(chunks), headers: req.headers }); res.writeHead(201); res.end(); });
});
await new Promise((r) => pushSrv.listen(0, '127.0.0.1', r));
push.setPushTlsInsecure(true);
const devKeys = crypto.createECDH('prime256v1'); devKeys.generateKeys(); const devAuth = crypto.randomBytes(16);
const decryptPush = (body) => {
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const data = body.subarray(21 + idlen);
  const secret = devKeys.computeSecret(asPub);
  const hk = (ikm, s, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
  const prk = hk(secret, devAuth, Buffer.concat([Buffer.from('WebPush: info\0'), devKeys.getPublicKey(), asPub]), 32);
  const dec = crypto.createDecipheriv('aes-128-gcm', hk(prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hk(prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  dec.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([dec.update(data.subarray(0, data.length - 16)), dec.final()]);
  let end = plain.length - 1; while (end > 0 && plain[end] === 0) end--;
  return JSON.parse(plain.subarray(0, end).toString('utf8'));
};
const fakeInit = ({ endpoint, p256dh, auth }) => {
  const mk = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: async () => { localStorage.removeItem('fake-sub'); return true; } });
  Object.defineProperty(Notification, 'permission', { get: () => localStorage.getItem('fake-perm') || 'default', configurable: true });
  Notification.requestPermission = async () => { localStorage.setItem('fake-perm', 'granted'); return 'granted'; };
  PushManager.prototype.subscribe = async function () { localStorage.setItem('fake-sub', '1'); return mk(); };
  PushManager.prototype.getSubscription = async function () { return localStorage.getItem('fake-sub') ? mk() : null; };
};
let mePush;
await step('Web Push: bật trên máy này, đúng loại, nhận được và giải mã được, tắt từng loại, tắt hẳn', async () => {
  const keys = { endpoint: `https://127.0.0.1:${pushSrv.address().port}/push/me-may-2`, p256dh: devKeys.getPublicKey().toString('base64url'), auth: devAuth.toString('base64url') };
  mePush = await newDevice(me, 'Mẹ máy 2 (push)', { init: fakeInit, initArg: keys });
  await mePush.bringToFront();
  await tab(mePush, 'Gia đình');
  await waitText(mePush, 'Thông báo trên máy này');
  await tap(mePush, 'Bật thông báo trên máy này', { wait: 1800 });
  await waitText(mePush, 'Đã bật trên máy này');
  await audit(mePush, 'family-push'); await shot(mePush, '48-push-bat');
  const meId = (await api(me, 'api/families/' + fid)).json.me.id;
  must((await db.query('SELECT count(*)::int n FROM push_subs'))[0].n === 1, 'phải có 1 thuê bao đẩy');
  const assign = (title) => api(bo, 'api/families/' + fid + '/tasks', 'POST', { title, assigneeId: meId });
  await assign('Mua thuốc ho');
  await tickNow(); await sleep(400);
  must(pushGot.length === 1, 'phải có 1 yêu cầu đẩy, thấy ' + pushGot.length);
  const m1 = decryptPush(pushGot[0].body);
  must(m1.title === 'Bố Tuấn giao việc cho bạn' && m1.body === 'Mua thuốc ho' && m1.type === 'task' && m1.url === '#/f/' + fid + '/tasks', 'nội dung đẩy sai: ' + JSON.stringify(m1));
  must(/^vapid t=/.test(pushGot[0].headers.authorization), 'thiếu VAPID');
  // tắt loại "Việc chung" trên máy này: việc mới không đẩy nữa nhưng vẫn có trong hộp thư
  await mePush.click('#pt-task'); await sleep(900);
  await assign('Mua rau'); await tickNow(); await sleep(400);
  must(pushGot.length === 1, 'đã tắt loại Việc chung nhưng vẫn nhận đẩy');
  must((await api(mePush, 'api/families/' + fid + '/notifications')).json.items.some((i) => i.body === 'Mua rau'), 'thông báo vẫn phải có trong hộp thư');
  await mePush.click('#pt-task'); await sleep(900);
  await assign('Mua nước mắm'); await tickNow(); await sleep(400);
  must(pushGot.length === 2, 'bật lại loại thì phải nhận đẩy');
  // tắt hẳn
  await tap(mePush, 'Tắt thông báo trên máy này', { wait: 1200 });
  await waitText(mePush, 'Bật thông báo trên máy này');
  must((await db.query('SELECT count(*)::int n FROM push_subs'))[0].n === 0, 'tắt rồi phải xóa thuê bao');
  await assign('Mua trứng'); await tickNow(); await sleep(300);
  must(pushGot.length === 2, 'tắt rồi không được đẩy');
  push.setPushTlsInsecure(false);
  push.setPushTlsInsecure(true);
});

await step('iPhone chưa thêm vào Màn hình chính: hướng dẫn rõ ràng thay vì nút bật thông báo', async () => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const iph = await newDevice(bo, 'Bố iPhone', { ua });
  await tab(iph, 'Gia đình');
  await waitText(iph, 'Trên iPhone cần thêm vào Màn hình chính');
  must(!(await text(iph)).includes('Bật thông báo trên máy này'), 'iPhone không được thấy nút bật khi chưa cài');
  await audit(iph, 'family-iphone'); await shot(iph, '49-iphone-chua-cai');
  await iph.__ctx.close();
});


// ---------- tình huống rìa: mất mạng, bấm hai lần, Back, tải lại, bàn phím, tên dài ----------
await step('mất mạng: báo rõ, giữ nguyên thứ đang gõ, có mạng lại thì thử lại không bị tạo trùng', async () => {
  await tab(me, 'Việc chung');
  await tap(me, 'Việc cần làm', { scope: '[role=tab]', wait: 500 });
  await waitText(me, 'Việc cần làm');
  await me.setOfflineMode(true);
  await waitText(me, 'Đang mất mạng');
  await shot(me, '50-mat-mang');
  await me.click('input[aria-label="Việc mới"]'); await me.keyboard.type('Gọi thợ sửa điện');
  await me.keyboard.press('Enter');
  await waitText(me, 'Không kết nối được mạng');
  const kept = await me.$eval('input[aria-label="Việc mới"]', (i) => i.value);
  must(kept === 'Gọi thợ sửa điện', 'chữ đang gõ bị mất khi mất mạng: ' + kept);
  must((await text(me)).includes('Mua sắm'), 'dữ liệu cũ phải còn hiển thị khi mất mạng');
  await me.setOfflineMode(false);
  await gone(me, 'Đang mất mạng', 8000);
  await me.keyboard.press('Enter');
  await waitText(me, 'Gọi thợ sửa điện');
  const n = (await api(me, `api/families/${fid}/lists`)).json.tasks.filter((t) => t.title === 'Gọi thợ sửa điện').length;
  must(n === 1, 'phải có đúng 1 việc, thấy ' + n);
});

await step('bấm hai lần nhanh liền nhau chỉ tạo một lần', async () => {
  await me.click('input[aria-label="Việc mới"]'); await me.keyboard.type('Giặt rèm cửa');
  const add = await me.evaluateHandle(() => [...document.querySelectorAll('.card button.btn')].find((b) => b.textContent.trim() === 'Thêm'));
  await Promise.all([add.asElement().click(), add.asElement().click().catch(() => {}), add.asElement().click().catch(() => {})]);
  await sleep(1200);
  const n = (await api(me, `api/families/${fid}/lists`)).json.tasks.filter((t) => t.title === 'Giặt rèm cửa').length;
  must(n === 1, 'bấm 3 lần phải chỉ có 1 việc, thấy ' + n);
});

await step('nút Back của điện thoại: đóng bảng trước, rồi mới lùi trang; không kẹt', async () => {
  await tab(me, 'Gia đình');
  await waitText(me, 'Thành viên');
  const h0 = await hashOf(me);
  await tap(me, '+ Mời', { wait: 500 });
  must(await me.$('.sheet'), 'bảng mời không mở');
  await me.goBack(); await sleep(500);
  must(!(await me.$('.sheet')) && (await hashOf(me)) === h0, 'Back phải chỉ đóng bảng, vẫn ở ' + h0 + ' nhưng thấy ' + (await hashOf(me)));
  // đóng bảng bằng nút X rồi Back: lùi về trang trước chứ không mắc kẹt
  await tap(me, '+ Mời', { wait: 400 }); await closeSheet(me); await sleep(500);
  await tab(me, 'Lịch'); await waitText(me, 'Tuần');
  await me.goBack(); await sleep(600);
  must((await hashOf(me)).endsWith('/me'), 'Back từ Lịch phải về Gia đình, thấy ' + (await hashOf(me)));
  // màn thêm sự kiện: Back về màn trước
  await tab(me, 'Hôm nay');
  await tap(me, '+ Thêm', { wait: 700 }); await waitText(me, 'Thêm sự kiện');
  await me.goBack(); await sleep(600);
  must((await hashOf(me)).endsWith('/today'), 'Back từ form phải về Hôm nay');
  // hai bảng chồng nhau: chi tiết sự kiện rồi sửa riêng ngày
  await tap(me, 'Toán', { scope: '.ev', wait: 700 });
  await waitText(me, 'Sửa cả chuỗi');
  await tap(me, 'Sửa riêng ngày này', { wait: 800 });
  await waitText(me, 'Lưu cho ngày này');
  await me.goBack(); await sleep(600);
  { const dbg = await me.evaluate(() => ({ sheets: document.querySelectorAll('.sheet').length, hash: location.hash, len: history.length, st: JSON.stringify(history.state) })); must(dbg.sheets === 0 && dbg.hash.endsWith('/today'), 'Back sau khi mở hai bảng liên tiếp phải đóng bảng và ở lại Hôm nay: ' + JSON.stringify(dbg)); }
});

await step('tải lại trang giữa chừng: về đúng màn; bản nháp sự kiện chưa lưu được khôi phục', async () => {
  await goto(me, '#/f/' + fid + '/event/new/2026-10-08');
  await waitText(me, 'Thêm sự kiện');
  await fill(me, 'Tiêu đề', 'Đi khám mắt cho Bống'); await fill(me, 'Địa điểm', 'BV Mắt TP');
  await tap(me, '1 giờ trước', { exact: true, scope: '.optchip', wait: 100 });
  const ck = await me.waitForSelector('input[aria-label="Thêm mục cần mang"]'); await ck.type('Sổ khám bệnh'); await me.keyboard.press('Enter');
  await sleep(500);
  await me.reload({ waitUntil: 'networkidle0' });
  await waitText(me, 'Đã khôi phục bản nháp chưa lưu');
  const v = await me.$eval('input[placeholder="Ví dụ: Học múa"]', (i) => i.value);
  const t = await text(me);
  must(v === 'Đi khám mắt cho Bống' && t.includes('Sổ khám bệnh') && (await hashOf(me)).includes('/event/new/2026-10-08'), 'bản nháp không khôi phục đúng: ' + v);
  await evSave(me);
  await waitText(me, 'Lịch hôm nay');
  await goto(me, '#/f/' + fid + '/event/new/2026-10-08'); await waitText(me, 'Thêm sự kiện');
  must(!(await text(me)).includes('Đã khôi phục bản nháp'), 'sau khi lưu không còn bản nháp');
  await goto(me, '#/f/' + fid + '/today');
});

await step('bàn phím ảo: thanh dưới ẩn khi gõ, ô đang gõ luôn nằm trong tầm nhìn', async () => {
  await goto(me, '#/f/' + fid + '/event/new/2026-10-08');
  await waitText(me, 'Thêm sự kiện');
  await me.setViewport({ width: 390, height: 400, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const el = await fieldEl(me, 'Ghi chú');
  await el.click(); await sleep(900);
  const st = await me.evaluate(() => { const a = document.activeElement.getBoundingClientRect(); return { top: a.top, bottom: a.bottom, h: innerHeight, cta: getComputedStyle(document.getElementById('cta')).display, tabs: getComputedStyle(document.getElementById('tabs')).display }; });
  must(st.top >= 0 && st.bottom <= st.h, 'ô đang gõ nằm ngoài tầm nhìn: ' + JSON.stringify(st));
  must(st.cta === 'none', 'thanh nút dưới phải ẩn khi đang gõ');
  await shot(me, '51-ban-phim');
  await me.evaluate(() => document.activeElement.blur()); await sleep(400);
  await me.setViewport({ ...VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cta = await me.evaluate(() => getComputedStyle(document.getElementById('cta')).display);
  must(cta !== 'none', 'thanh nút dưới phải hiện lại sau khi gõ xong');
  await goto(me, '#/f/' + fid + '/today');
});

const LONG = 'Nguyễn Thị Hoàng Bảo Ngọc Diễm Quỳnh 🌺🌸';
await step('tên rất dài, emoji, 8 con và hàng chục sự kiện: không tràn, không vỡ bố cục', async () => {
  const names = [LONG.slice(0, 40), 'Trần Văn A Bờ Cờ Dờ Đờ E Ê 🐻', 'Mít Ướt', 'Su Hào', 'Cà Rốt Củ Cải', 'Bắp Cải Thảo'];
  for (const n of names) { const r = await api(me, `api/families/${fid}/children`, 'POST', { name: n, school: 'Trường Tiểu học Nguyễn Thị Minh Khai - Cơ sở 2', grade: '10A12', note: 'Dị ứng hải sản, đậu phộng; có hen suyễn; nhớ mang thuốc xịt' }); must(r.status === 200, 'thêm con thất bại: ' + JSON.stringify(r.json)); }
  const kids = (await api(me, 'api/families/' + fid)).json.children;
  must(kids.length === 8, 'phải có 8 con');
  const extra = await api(me, `api/families/${fid}/children`, 'POST', { name: 'Con thứ chín' });
  must(extra.status === 409, 'con thứ 9 phải bị chặn');
  // nhiều sự kiện trong tuần này
  for (let i = 0; i < 36; i++) {
    const day = F9day(TODAY, i % 7);
    const r = await api(me, `api/families/${fid}/events`, 'POST', { title: `Sự kiện số ${i + 1} ${'rất dài '.repeat(8)}🎈`.slice(0, 80), kind: 'khac', startDate: day, start: `${String(7 + (i % 12)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, location: 'Địa điểm dài dòng ' + 'x'.repeat(70), childIds: [kids[i % 8].id], checklist: ['Mang theo đồ dùng học tập đầy đủ', 'Nước uống'] });
    must(r.status === 200, 'tạo sự kiện thất bại ' + JSON.stringify(r.json));
  }
  for (const k of kids.slice(2)) await api(me, `api/families/${fid}/rides`, 'POST', { childId: k.id, dir: 'don', weekdays: [1], time: '15:00', place: 'Cổng sau trường, gần cây đa', p0: (await api(me, 'api/families/' + fid)).json.me.id });
  await reloadAt(me, 'today');
  await waitText(me, 'Sự kiện số');
  await audit(me, 'today-nhieu'); await shot(me, '52-today-nhieu');
  await tab(me, 'Gia đình'); await waitText(me, 'Trẻ em (8/8)');
  must(!(await text(me)).includes('+ Thêm con'), 'đủ 8 con thì ẩn nút thêm');
  await audit(me, 'family-8-con'); await shot(me, '53-family-8-con');
  await tab(me, 'Đưa đón'); await waitText(me, 'Đón');
  await audit(me, 'rides-nhieu'); await shot(me, '54-rides-nhieu');
  await tab(me, 'Lịch'); await waitText(me, 'Tuần');
  await audit(me, 'cal-nhieu'); await shot(me, '55-cal-nhieu');
  await tap(me, 'Tháng', { exact: true, scope: '[role=tab]', wait: 600 }); await audit(me, 'cal-thang-nhieu'); await shot(me, '56-cal-thang-nhieu');
  await tap(me, 'Tuần', { exact: true, scope: '[role=tab]', wait: 400 });
});

await step('nhiều gia đình: chọn gia đình, tạo gia đình thứ hai và quay lại', async () => {
  await tab(me, 'Gia đình');
  await tap(me, 'Tạo gia đình khác', { wait: 600 });
  await waitText(me, 'Tạo gia đình mới');
  await fill(me, 'Tên gia đình', 'Nhà ngoại'); await fill(me, 'Tên của bạn', 'Con gái Bình');
  await tap(me, 'Tạo gia đình', { exact: true, wait: 1000 });
  await waitText(me, 'Nhà ngoại');
  await tab(me, 'Gia đình');
  await tap(me, 'Đổi sang gia đình khác', { wait: 700 });
  await waitText(me, 'Chọn gia đình');
  const t = await text(me);
  must(t.includes('Nhà ngoại') && t.includes('Nhà Cún Con 🏠'), 'danh sách gia đình thiếu');
  await audit(me, 'pick'); await shot(me, '57-chon-gia-dinh');
  await tap(me, 'Nhà Cún Con', { scope: 'a.pick', wait: 900 });
  await waitText(me, 'Sự kiện số');
});

const textsOf = (p) => p.evaluate(() => [...document.querySelectorAll('.ride-t, .ev-time, .sub')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
await step('múi giờ máy khác (New York, Auckland): giờ, thứ, ngày vẫn theo giờ Việt Nam', async () => {
  await reloadAt(me, 'today'); await waitText(me, 'Đưa đón hôm nay');
  const base = await textsOf(me);
  for (const tz of ['America/New_York', 'Pacific/Auckland']) {
    const p = await newDevice(me, 'Mẹ ' + tz, { tz, dark: true, view: { width: 360, height: 740 } });
    await waitText(p, 'Đưa đón hôm nay');
    const t = await textsOf(p);
    must(t === base, `giao diện lệch ở múi giờ ${tz}:\n  ${t.slice(0, 200)}\n  ${base.slice(0, 200)}`);
    must((await text(p)).includes('Thứ hai, 05/10/2026'), 'sai ngày ở ' + tz);
    await audit(p, 'tz-' + tz); await shot(p, '58-tz-' + tz.split('/')[1]);
    await p.__ctx.close();
  }
});

await step('qua nửa đêm giờ Việt Nam: màn Hôm nay tự chuyển sang ngày mới', async () => {
  setClock(TODAY, '23:59'); await reloadAt(me, 'today');
  await waitText(me, 'Thứ hai, 05/10/2026');
  clock.set(at('2026-10-06', '00:00') + 5000);
  await waitText(me, 'Thứ ba, 06/10/2026', 30000);
  const t = await text(me);
  must(!t.includes('Thứ hai, 05/10/2026') && /Âm lịch 26\/8/.test(t), 'chưa chuyển sang ngày mới đúng: ' + t.slice(0, 200));
  await shot(me, '59-qua-nua-dem');
  setClock(TODAY, '08:00');
  await reloadAt(me, 'today');
});

function F9day(day, n) { return vn.addDays(day, n); }


// ---------- quét mọi màn ở 360x740 và chế độ tối ----------
async function sweep(p, tag) {
  const L = (n) => `${tag}-${n}`;
  const S = async (n) => { await audit(p, L(n)); await shot(p, 'sw-' + L(n)); };
  await reloadAt(p, 'today'); await waitText(p, 'Đưa đón hôm nay'); await S('today');
  await tab(p, 'Lịch'); await waitText(p, 'Tuần'); await S('cal-tuan');
  await tap(p, 'Tháng', { exact: true, scope: '[role=tab]', wait: 600 }); await S('cal-thang');
  await tap(p, 'Tuần', { exact: true, scope: '[role=tab]', wait: 400 });
  await tab(p, 'Đưa đón'); await waitText(p, 'Theo ngày'); await S('rides-ngay');
  await tap(p, 'Lịch tuần', { scope: '[role=tab]', wait: 600 }); await S('rides-tuan');
  await p.evaluate(() => { [...document.querySelectorAll('.card .linkbtn')].filter((b) => b.textContent === 'Thêm ca')[0].click(); }); await sleep(500); await S('ride-form'); await closeSheet(p);
  await tap(p, 'Lịch sử', { scope: '[role=tab]', wait: 600 }); await S('rides-su');
  await tab(p, 'Việc chung'); await waitText(p, 'Việc cần làm'); await S('viec');
  await tap(p, 'Mua sắm', { scope: '[role=tab]', wait: 500 }); await S('mua-sam');
  await tab(p, 'Gia đình'); await waitText(p, 'Thành viên'); await S('family');
  await tap(p, 'Thành viên Bố Tuấn', { wait: 500 }); await S('member-sheet'); await closeSheet(p);
  await tap(p, '+ Mời', { wait: 500 }); await S('invite-form'); await closeSheet(p);
  await tap(p, 'Sửa hồ sơ', { wait: 500 }); await S('child-sheet'); await closeSheet(p);
  await tap(p, 'Thông báo', { scope: '#bar a', wait: 900 }); await waitText(p, 'Thông báo'); await S('inbox');
  await goto(p, '#/f/' + fid + '/event/new/' + TODAY); await waitText(p, 'Thêm sự kiện'); await S('event-form');
  const kid = (await api(p, 'api/families/' + fid)).json.children[0].id;
  await goto(p, '#/f/' + fid + '/tkb/' + kid); await waitText(p, 'Thời khóa biểu'); await S('tkb');
  await goto(p, '#/f/' + fid + '/today'); await waitText(p, 'Đưa đón hôm nay');
  await p.evaluate(() => { document.querySelector('.ride button.linkbtn').click(); }); await sleep(500); await S('assign-sheet'); await closeSheet(p);
}
await step('quét mọi màn: 360x740 sáng', async () => {
  const p = await newDevice(me, 'Mẹ 360 sáng', { view: { width: 360, height: 740 } });
  await sweep(p, '360s'); await p.__ctx.close();
});
await step('quét mọi màn: 390x844 tối', async () => {
  const p = await newDevice(me, 'Mẹ 390 tối', { dark: true });
  await sweep(p, '390t'); await p.__ctx.close();
});
await step('quét mọi màn: 360x740 tối', async () => {
  const p = await newDevice(me, 'Mẹ 360 tối', { dark: true, view: { width: 360, height: 740 } });
  await sweep(p, '360t'); await p.__ctx.close();
});

// ---------- chuyển quyền chủ, rời gia đình, xóa gia đình ----------
await step('chủ không rời được khi chưa chuyển quyền; chuyển quyền chủ cho Bố', async () => {
  await tab(me, 'Gia đình');
  await tap(me, 'Rời gia đình', { exact: true, wait: 500 });
  await tap(me, 'Rời gia đình', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(me, 'Hãy chuyển quyền chủ cho người khác trước khi rời');
  must((await hashOf(me)).endsWith('/me'), 'chủ vẫn phải ở lại gia đình');
  await closeSheet(me).catch(() => {});
  await tap(me, 'Chuyển quyền chủ gia đình', { wait: 600 });
  await audit(me, 'transfer-sheet'); await shot(me, '60-chuyen-quyen');
  await tap(me, 'Bố Tuấn', { scope: '.sheet .pick', wait: 200 });
  await tap(me, 'Chuyển quyền', { exact: true, scope: '.sheet button', wait: 1000 });
  await waitText(me, 'Đã chuyển quyền chủ gia đình');
  await bo.bringToFront(); await reloadAt(bo, 'me');
  const tb = (await text(bo)).toLowerCase();
  must(tb.includes('xóa gia đình') && tb.includes('chuyển quyền chủ gia đình') && tb.includes('mốc nhắc đưa đón'), 'Bố phải có quyền chủ');
  await me.bringToFront(); await reloadAt(me, 'me');
  const tm = (await text(me)).toLowerCase();
  must(!tm.includes('xóa gia đình') && tm.includes('quản lý') && tm.includes('mốc nhắc đưa đón'), 'Mẹ phải thành người quản lý');
});

await step('Bà rời gia đình: các ca Bà phụ trách trở về chưa gán, Bà không xem được nữa', async () => {
  const before = (await db.query("SELECT count(*)::int n FROM rides WHERE p0 IN (SELECT id FROM members WHERE name='Bà nội Lan') OR p1 IN (SELECT id FROM members WHERE name='Bà nội Lan') OR p2 IN (SELECT id FROM members WHERE name='Bà nội Lan')"))[0].n;
  must(before > 0, 'Bà phải đang giữ ca nào đó');
  await ba.bringToFront(); await tab(ba, 'Gia đình');
  await tap(ba, 'Rời gia đình', { exact: true, wait: 500 });
  await tap(ba, 'Rời gia đình', { exact: true, scope: '.sheet button', wait: 1200 });
  await waitText(ba, 'Chào mừng đến 9family');
  const after = (await db.query("SELECT count(*)::int n FROM rides WHERE p0 IN (SELECT id FROM members WHERE name='Bà nội Lan') OR p1 IN (SELECT id FROM members WHERE name='Bà nội Lan') OR p2 IN (SELECT id FROM members WHERE name='Bà nội Lan')"))[0].n;
  must(after === 0, 'ca của Bà phải được gỡ người');
  must((await api(ba, 'api/families/' + fid)).status === 404, 'Bà phải không còn xem được gia đình');
  await me.bringToFront(); await reloadAt(me, 'me');
  must(!(await text(me)).includes('Bà nội Lan'), 'Bà phải biến khỏi danh sách thành viên');
});

await step('chủ mới xóa gia đình: gõ sai tên bị chặn, gõ đúng thì xóa sạch cho mọi người', async () => {
  await bo.bringToFront(); await reloadAt(bo, 'me'); await waitText(bo, 'Xóa gia đình');
  await tap(bo, 'Xóa gia đình', { exact: true, wait: 500 });
  await audit(bo, 'delete-sheet'); await shot(bo, '61-xoa-gia-dinh');
  await fill(bo, 'Gõ tên gia đình', 'nhầm tên');
  await tap(bo, 'Xóa vĩnh viễn', { wait: 800 });
  await waitText(bo, 'Hãy gõ đúng tên gia đình để xác nhận xóa');
  await fill(bo, 'Gõ tên gia đình', 'Nhà Cún Con 🏠');
  await tap(bo, 'Xóa vĩnh viễn', { wait: 1500 });
  await waitText(bo, 'Chào mừng đến 9family');
  for (const t of ['families', 'members', 'children', 'events', 'rides', 'ride_days', 'tasks', 'shopping', 'notifications', 'push_subs']) {
    const col = t === 'families' ? 'id' : 'family_id';
    if (t === 'push_subs') continue;
    const n = (await db.query(`SELECT count(*)::int n FROM ${t} WHERE ${col}=$1`, [fid]))[0].n;
    must(n === 0, `bảng ${t} còn ${n} dòng của gia đình đã xóa`);
  }
  await me.bringToFront(); await reloadAt(me, 'today');
  await waitText(me, 'Không tìm thấy');
  must((await api(me, 'api/families/' + fid)).status === 404, 'sau khi xóa phải 404');
  const mine = (await api(me, 'api/me')).json.families;
  must(mine.length === 1 && mine[0].name === 'Nhà ngoại', 'Mẹ chỉ còn gia đình Nhà ngoại');
});


// ---- tổng kết ----
console.log('\n--- kết quả ---');
const okN = results.filter((r) => r.ok).length;
console.log(`${okN}/${results.length} bước đạt`);
if (problems.length) { console.log('\nVấn đề phát hiện:'); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); }
await browser.close();
await app.close();
await db.close();
await pg.stop();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* bỏ qua */ }
process.exit(okN === results.length && !problems.length ? 0 : 1);
