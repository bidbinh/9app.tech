// E2E tích hợp 9id: 9swap thật + 9id GIẢ (máy chủ HTTP nhỏ trả lời verify) + Chrome thật, nhiều ngữ cảnh trình duyệt độc lập.
// Chạy: node scripts/e2e-account.js   (cần PUPPETEER_CORE, CHROME_PATH nếu khác mặc định). Ảnh vào shots/account/.
// Kiểm: thẻ mời đăng nhập; liên kết đăng nhập cùng nguồn gốc; nhận nhóm ẩn danh vào tài khoản; máy mới chỉ cần cookie nine_sid;
// người dùng khác không thấy; tên hiển thị chứa HTML không chạy; 9id lỗi thì app vẫn dùng được và thẻ ẩn.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots', 'account');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

// ---- 9id giả: POST /id/internal/v1/verify {token} ----
const TOKENS = {
  ['L'.repeat(43)]: { userId: '10000000-0000-4000-8000-000000000001', displayName: 'Lan Anh' },
  ['B'.repeat(43)]: { userId: '10000000-0000-4000-8000-000000000002', displayName: 'Bình' },
  ['X'.repeat(43)]: { userId: '10000000-0000-4000-8000-000000000003', displayName: '<img src=x onerror=window.__xss=1>' },
};
let idMode = 'ok';   // 'ok' | 'down'
const fakeId = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (st, obj) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (idMode === 'down') { res.writeHead(500); res.end('boom'); return; }
    if (req.method === 'POST' && req.url === '/id/internal/v1/verify') {
      let t = ''; try { t = JSON.parse(body).token; } catch { /* */ }
      const u = TOKENS[t];
      return u ? send(200, u) : send(401, { error: { code: 'invalid_session', message: 'x' } });
    }
    send(200, { ok: true });
  });
});
await new Promise((r) => fakeId.listen(0, '127.0.0.1', r));
const idPort = fakeId.address().port;

const pg = await startEmbedded({ database: 'swap_e2e_account' });
Object.assign(process.env, {
  DATABASE_URL: pg.url, COMMUNITIES_PER_IP_HOUR: '1000000', RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000', SESSION_LIMIT_PER_MIN: '1000000',
  NINE_ID_URL: `http://127.0.0.1:${idPort}/id`, NINE_ID_KEY_ID: 'swap', NINE_ID_SECRET: 'e2e-secret-swap-0123456789abcdef-xyz', NINE_ID_CACHE_MS: '400', NINE_ID_BREAK_MS: '200',
});
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
config.port = 0;
const app = await start();
const ORIGIN = `http://127.0.0.1:${app.server.address().port}`;
const URL0 = `${ORIGIN}${config.basePath}/`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9swap-acc-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });
const results = []; const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); if (!cond) problems.push(`KIỂM TRA SAI: ${name} ${extra}`); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
const VIEWS = { m: { width: 390, height: 844 }, s: { width: 360, height: 740 }, d: { width: 1280, height: 800 } };
let shotNo = 0;

async function newPage(name, { token = null, view = 'm', dark = false, ctx = null } = {}) {
  const context = ctx || await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ ...VIEWS[view], deviceScaleFactor: view === 'd' ? 1 : 2, isMobile: view !== 'd', hasTouch: view !== 'd' });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  if (token) await page.setCookie({ name: 'nine_sid', value: token, url: ORIGIN });
  page.__name = name; page.__ctx = context; page.__navs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410)/.test(m.text()) && !/favicon|icon\.(svg|png)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('dialog', async (d) => { problems.push(`[${name}] HỘP THOẠI bất ngờ (XSS?): ${d.message()}`); await d.dismiss(); });
  // chặn điều hướng sang /id/ (9id thật không chạy ở đây) để ghi lại địa chỉ
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.pathname.startsWith('/id/') && req.isNavigationRequest()) { page.__navs.push(u.pathname + u.search + u.hash); req.respond({ status: 200, contentType: 'text/html', body: '<html>9id</html>' }); return; }
    if (u.pathname === '/id/api/logout') { page.__logout = (page.__logout || 0) + 1; req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); return; }
    req.continue();
  });
  return page;
}
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
async function waitText(page, t, ms = 9000) { const end = Date.now() + ms; while (Date.now() < end) { if ((await text(page)).includes(t)) return true; await sleep(150); } throw new Error(`[${page.__name}] chờ chữ "${t}" không thấy; trang: ${(await text(page)).slice(0, 220)}`); }
async function gone(page, t, ms = 9000) { const end = Date.now() + ms; while (Date.now() < end) { if (!(await text(page)).includes(t)) return true; await sleep(150); } throw new Error(`[${page.__name}] chữ "${t}" vẫn còn`); }
async function tap(page, label) {
  await page.bringToFront();
  const h = await page.waitForFunction((label) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('button, a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).find((e) => norm(e.textContent).includes(label)) || null;
  }, { timeout: 9000 }, label);
  const el = h.asElement();
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await sleep(80);
  await el.click();
  await sleep(250);
}
async function fill(page, label, value) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.bringToFront();
    const h = await page.waitForFunction((label) => { for (const l of document.querySelectorAll('label')) if (l.textContent.trim().startsWith(label) && l.getBoundingClientRect().width > 0) return document.getElementById(l.htmlFor); return null; }, { timeout: 9000 }, label);
    const el = h.asElement();
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await el.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await el.type(value, { delay: 0 });
    if ((await el.evaluate((e) => e.value)) === value) return;   // trang có thể vẽ lại và xóa chữ vừa gõ: thử lại
    await sleep(400);
  }
  throw new Error(`[${page.__name}] không nhập được "${label}"`);
}
async function shot(page, name) {
  await sleep(300);
  const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) });
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`không tràn ngang: ${file}`, o.sw <= o.cw + 1, `${o.sw} > ${o.cw}`);
}

try {
  // ===== 1. Máy ẩn danh: tạo nhóm, thấy thẻ mời đăng nhập, liên kết đăng nhập cùng nguồn gốc =====
  const anon = await newPage('anon');
  await anon.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(anon, 'Cho tặng, trao đổi đồ cũ');
  const made = await anon.evaluate(async (base) => (await fetch(base + 'api/communities', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-requested-with': '9swap' }, body: JSON.stringify({ name: 'Cộng đồng E2E', kind: 'toa_nha', myName: 'Lan', agree: true }) })).status, URL0);
  check('tạo cộng đồng ẩn danh bằng API', made === 200, String(made));
  await anon.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(anon, 'Cộng đồng của bạn');
  await waitText(anon, 'Tài khoản 9app (không bắt buộc)');
  check('máy ẩn danh: thẻ mời đăng nhập, ghi rõ không bắt buộc', true);
  await shot(anon, 'chua-dang-nhap');
  await tap(anon, 'Đăng nhập');
  await sleep(300);
  const nav = anon.__navs[0] || '';
  check('Đăng nhập chuyển tới 9id cùng nguồn gốc kèm next về trang hiện tại', nav.startsWith('/id/?next=') && nav.endsWith('#/dang-nhap') && decodeURIComponent(nav.slice('/id/?next='.length, nav.length - '#/dang-nhap'.length)).startsWith('/swap/'), nav);

  // ===== 2. Đăng nhập (đặt cookie nine_sid): thẻ báo nhóm chưa gắn, bấm gắn =====
  await anon.setCookie({ name: 'nine_sid', value: 'L'.repeat(43), url: ORIGIN });
  await anon.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(anon, 'Đã đăng nhập: Lan Anh');
  await waitText(anon, 'chưa gắn vào tài khoản: Cộng đồng E2E');
  check('đã đăng nhập: thẻ liệt kê nhóm ẩn danh chưa gắn', true);
  await shot(anon, 'co-nhom-chua-gan');
  await tap(anon, 'Gắn vào tài khoản');
  await waitText(anon, 'Đã gắn 1 cộng đồng');
  await gone(anon, 'chưa gắn vào tài khoản');
  check('bấm Gắn vào tài khoản: báo thành công và hết danh sách chờ', true);
  await shot(anon, 'da-gan');

  // ===== 3. Máy mới (ngữ cảnh mới, không có lsid) chỉ cần nine_sid: thấy và mở được nhóm =====
  const fresh = await newPage('may-moi', { token: 'L'.repeat(43), dark: true });
  await fresh.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(fresh, 'Cộng đồng E2E');
  check('máy mới đăng nhập cùng tài khoản thấy cộng đồng', true);
  await shot(fresh, 'may-moi-thay-nhom-toi');
  await tap(fresh, 'Cộng đồng E2E');
  await fresh.waitForFunction(() => /^#\/c\/[0-9a-f-]{36}/.test(location.hash), { timeout: 9000 });
    check('máy mới mở được cộng đồng', (await text(fresh)).includes('Cộng đồng E2E'));

  // ===== 4. Người dùng khác không thấy nhóm =====
  const other = await newPage('nguoi-khac', { token: 'B'.repeat(43) });
  await other.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(other, 'Đã đăng nhập: Bình');
  check('người dùng khác không thấy cộng đồng của Lan', !(await text(other)).includes('Cộng đồng E2E'));
  await shot(other, 'nguoi-khac');
  const teamId = (await fresh.evaluate(() => location.hash.match(/#\/c\/([0-9a-f-]{36})/)?.[1] || ''));
  const r404 = await other.evaluate(async (id) => (await fetch('api/c/' + id, { credentials: 'same-origin' })).status, teamId);
  check('API cộng đồng trả 404 cho người dùng khác', r404 === 404, String(r404));

  // ===== 5. Tên hiển thị chứa HTML không chạy =====
  const xss = await newPage('xss', { token: 'X'.repeat(43) });
  await xss.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(xss, 'Đã đăng nhập: <img src=x onerror=window.__xss=1>');
  check('tên hiển thị chứa HTML hiện nguyên văn và không chạy', (await xss.evaluate(() => window.__xss)) === undefined);

  // ===== 6. Đăng xuất gọi đúng API 9id =====
  await tap(fresh, 'Quay lại').catch(() => {});
  await fresh.goto(URL0, { waitUntil: 'networkidle0' });
  await tap(fresh, 'Đăng xuất');
  await sleep(500);
  check('Đăng xuất gọi POST /id/api/logout một lần', fresh.__logout === 1, String(fresh.__logout));

  // ===== 7. 9id lỗi: app vẫn dùng được, thẻ ẩn =====
  idMode = 'down';
  await sleep(700);   // hết đệm 400 ms
  await anon.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(anon, 'Cộng đồng E2E');
  check('9id lỗi: cộng đồng ẩn danh vẫn hiện bình thường', true);
  check('9id lỗi: thẻ tài khoản ẩn, không báo lỗi', !(await text(anon)).includes('Tài khoản 9app'));
  await shot(anon, '9id-loi');
  idMode = 'ok';

  // ===== 8. Ảnh thêm: 3 cỡ, sáng/tối =====
  for (const [view, dark] of [['s', false], ['d', false], ['d', true]]) {
    const p = await newPage('anh-' + view, { token: 'B'.repeat(43), view, dark });
    await p.goto(URL0, { waitUntil: 'networkidle0' });
    await waitText(p, 'Đã đăng nhập: Bình');
    await shot(p, `dang-nhap-${view}${dark ? '-toi' : ''}`);
    await p.__ctx.close();
  }
  const p2 = await newPage('anh-out-s', { view: 's' });
  await p2.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(p2, 'Tài khoản 9app (không bắt buộc)');
  await shot(p2, 'chua-dang-nhap-s');
} catch (e) {
  problems.push('NGOẠI LỆ: ' + e.message);
  console.error(e);
  try { for (const p of await browser.pages()) await p.screenshot({ path: path.join(SHOTS, `loi-${p.__name || 'x'}.png`) }).catch(() => {}); } catch { /* */ }
}

await browser.close();
fakeId.close();
await app.close();
await (await import('../src/db.js')).close();
await pg.stop();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} kiểm tra đạt, ${shotNo} ảnh ở ${SHOTS}`);
if (problems.length) { console.log('\nVẤN ĐỀ:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('Không có lỗi console / pageerror / hộp thoại bất ngờ.');
process.exit(0);
