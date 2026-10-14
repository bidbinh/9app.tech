// E2E "đăng nhập chung": 9id THẬT (PostgreSQL nhúng, OTP mock) + launcher thật (launcher-ux2) sau một máy chủ đệm CÙNG NGUỒN GỐC
// (giống nginx: /id/* -> 9id, còn lại -> launcher). Chrome thật. Chạy: node scripts/e2e-shared.mjs  (cần PUPPETEER_CORE, CHROME_PATH)
// Kiểm: đăng ký từ launcher rồi quay về đã đăng nhập; đóng/mở lại trình duyệt vẫn đăng nhập; đăng xuất ở launcher thì 9id cũng
// đăng xuất; đổi số bằng giao diện; hoàn tác đổi số từ "Quên mật khẩu"; thông báo thiết bị mới; ảnh 3 cỡ, sáng/tối.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots', 'shared');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const pg = await startEmbedded({ database: 'id_shared' });
process.env.DATABASE_URL = pg.url;
process.env.OTP_PROVIDER = 'mock';
process.env.POW_BITS = '10';
Object.assign(process.env, {
  RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000', SESSION_LIMIT_PER_MIN: '1000000', OTP_RESEND_SEC: '0',
  OTP_DAILY_PER_PHONE: '1000', OTP_DAILY_PER_IP: '100000', VERIFY_PER_IP_HOUR: '1000000', INVITES_PER_USER_DAY: '100000',
  NEW_ACCOUNT_INVITES_PER_DAY: '100000',
});
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const provider = await import('../src/otp-provider.js');
config.port = 0;
const app = await start();
const idPort = app.server.address().port;

// launcher tĩnh (tệp của launcher-ux2) + máy chủ đệm cùng nguồn gốc
const { startServer } = await import(pathToFileURL(path.join(root, '..', 'launcher-ux2', 'tools', 'serve.mjs')).href);
const staticSrv = await startServer(0);
const staticPort = staticSrv.address().port;
const proxy = http.createServer((req, res) => {
  const target = req.url.startsWith('/id') ? idPort : staticPort;
  // giữ nguyên Host/Origin như nginx (9id kiểm Origin == Host)
  const up = http.request({ host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end('bad gateway'); });
  req.pipe(up);
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${proxy.address().port}`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9id-shared-chrome-'));
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });
let browser = await launch();

const problems = []; const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotNo = 0;
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); if (!cond) problems.push(`KIỂM TRA SAI: ${name} ${extra}`); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
const VIEWS = { m: { width: 390, height: 844 }, s: { width: 360, height: 740 }, d: { width: 1280, height: 800 } };

async function newPage(name, { view = 'm', dark = false, ctx = null } = {}) {
  const page = await (ctx || browser).newPage();
  await page.setViewport({ ...VIEWS[view], deviceScaleFactor: view === 'd' ? 1 : 2, isMobile: view !== 'd', hasTouch: view !== 'd' });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.__name = name;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|429)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('dialog', async (d) => { problems.push(`[${name}] HỘP THOẠI bất ngờ: ${d.message()}`); await d.dismiss(); });
  return page;
}
async function shot(page, name) {
  await sleep(300);
  const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: false });
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`không tràn ngang: ${file}`, o.sw <= o.cw + 1, `${o.sw} > ${o.cw}`);
}
const bodyText = (page) => page.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('noscript,script').forEach((n) => n.remove()); return c.textContent.replace(/\s+/g, ' '); }).catch(() => ''); // đang điều hướng: coi như chưa có chữ, thử lại
async function waitText(page, t, ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { if ((await bodyText(page)).includes(t)) return true; await sleep(150); } throw new Error(`[${page.__name}] chờ chữ "${t}" không thấy; trang: ${(await bodyText(page)).slice(0, 200)}`); }
async function waitVisible(page, sel, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0; }, sel).catch(() => false)) return true; await sleep(150); }
  throw new Error(`[${page.__name}] chờ ${sel} hiện không thấy`);
}
async function find(page, text, scope = 'button, a, [role=button]') {
  let h = null;
  for (let i = 0; i < 40; i++) {
    h = await page.evaluateHandle((text, scope) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const sheet = [...document.querySelectorAll('.sheet')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]')).pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      return pool.find((e) => norm(e.textContent).includes(text) || (e.getAttribute('aria-label') || '').includes(text)) || null;
    }, text, scope);
    if (h.asElement()) break;
    await sleep(200);
  }
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy "${text}"`);
  return el;
}
async function tap(page, text, scope) {
  for (let attempt = 0; ; attempt++) {
    try { const el = await find(page, text, scope); await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await sleep(80); await el.click(); await sleep(200); return; }
    catch (err) { if (attempt >= 3 || !/not clickable|detached|Execution context|not an Element/.test(err.message)) throw err; await sleep(250); }
  }
}
async function fill(page, label, value) {
  let el = null;
  for (let i = 0; i < 30 && !el; i++) {
    const h = await page.evaluateHandle((label) => {
      const sheet = [...document.querySelectorAll('.sheet')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]')).pop();
      const root = sheet || document;
      for (const l of root.querySelectorAll('label')) if (l.textContent.trim().startsWith(label)) return document.getElementById(l.htmlFor);
      return [...root.querySelectorAll('input,textarea')].find((e) => (e.getAttribute('aria-label') || '').startsWith(label)) || null;
    }, label);
    el = h.asElement(); if (!el) await sleep(150);
  }
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 5 });
}
const apiMe = (page) => page.evaluate(() => fetch('/id/api/me', { credentials: 'same-origin' }).then((r) => r.json()));
const otpFor = (phone) => provider.lastOtp('+84' + phone.slice(1));
let phoneSeq = 30_000_000;
const newPhone = () => '09' + String(phoneSeq++).padStart(8, '0');
const PASS = 'MatKhau-Tot-1', PASS2 = 'MatKhau-Moi-22';

try {
  const phone = newPhone(), phone2 = newPhone();

  // ===== 1. Launcher chưa đăng nhập -> Đăng ký bằng giao diện 9id -> quay về launcher đã đăng nhập =====
  let L = await newPage('launcher');
  await L.goto(ORIGIN + '/index.html#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitVisible(L, '#acc-out');
  check('launcher: chưa đăng nhập hiện nút Đăng nhập/Đăng ký', true);
  await shot(L, 'launcher-chua-dang-nhap');
  await tap(L, 'Đăng ký');
  await waitText(L, 'Tạo tài khoản 9app');
  check('bấm Đăng ký ở launcher mở màn đăng ký của 9id', new URL(L.url()).pathname === '/id/');
  await fill(L, 'Số điện thoại', phone);
  await tap(L, 'Gửi mã xác thực');
  await waitText(L, 'Mã gồm 6 số');
  await fill(L, 'Mã xác thực', otpFor(phone));
  await waitText(L, 'Số điện thoại đã được xác minh');
  await fill(L, 'Tên hiển thị', 'Lan Anh');
  await fill(L, 'Mật khẩu', PASS);
  await tap(L, 'Tạo tài khoản');
  await waitVisible(L, '#acc-in', 15000);
  check('đăng ký xong quay về launcher (trang Tài khoản) và đã đăng nhập', new URL(L.url()).pathname === '/' && (await L.evaluate(() => document.getElementById('acc-name').textContent)) === 'Lan Anh');
  check('launcher hiện số điện thoại đã che', (await L.evaluate(() => document.getElementById('acc-phone').textContent)).endsWith(phone.slice(-4)));
  await shot(L, 'launcher-da-dang-nhap');
  const cookie = (await L.cookies()).find((c) => c.name === 'nine_sid');
  check('cookie phiên là HttpOnly, Path=/, hạn ~365 ngày', cookie && cookie.httpOnly && cookie.path === '/' && cookie.expires > Date.now() / 1000 + 360 * 86400);
  await L.close();

  // ===== 2. Đóng trình duyệt rồi mở lại: vẫn đăng nhập =====
  await browser.close();
  browser = await launch();
  L = await newPage('launcher-mo-lai');
  await L.goto(ORIGIN + '/index.html#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitVisible(L, '#acc-in', 15000);
  check('đóng và mở lại trình duyệt vẫn đăng nhập', (await L.evaluate(() => document.getElementById('acc-name').textContent)) === 'Lan Anh');
  // cùng cookie dùng được ở một trang khác cùng nguồn gốc: 9id
  const idp = await newPage('id-cung-phien');
  await idp.goto(ORIGIN + '/id/#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitText(idp, 'Thiết bị đang đăng nhập');
  check('trang 9id nhận cùng phiên (không phải đăng nhập lại)', true);
  await idp.close();

  // ===== 3. Đăng xuất ở launcher thì 9id cũng đăng xuất =====
  await tap(L, 'Đăng xuất');
  await waitVisible(L, '#acc-out');
  check('đăng xuất ở launcher hiện lại nút đăng nhập', true);
  const idp2 = await newPage('id-sau-dang-xuat');
  await idp2.goto(ORIGIN + '/id/#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitText(idp2, 'Đăng nhập 9app');
  check('sau khi đăng xuất ở launcher, 9id đòi đăng nhập', true);
  await idp2.close();
  await L.close();

  // ===== 4. Đăng nhập lại bằng giao diện 9id (nút Đăng nhập ở launcher, next quay về launcher) =====
  L = await newPage('launcher-dang-nhap');
  await L.goto(ORIGIN + '/index.html#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitVisible(L, '#acc-out');
  await tap(L, 'Đăng nhập');
  await waitText(L, 'Đăng nhập 9app');
  await fill(L, 'Số điện thoại', phone);
  await fill(L, 'Mật khẩu', PASS);
  await tap(L, 'Đăng nhập', 'button');
  await waitVisible(L, '#acc-in', 15000);
  check('đăng nhập từ launcher rồi quay về đúng trang Tài khoản', new URL(L.url()).hash === '#/tai-khoan');
  await L.close();

  // ===== 5. Đổi số điện thoại bằng giao diện 9id =====
  const A = await newPage('id-tai-khoan');
  await A.goto(ORIGIN + '/id/#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitText(A, 'Đổi số điện thoại');
  await shot(A, 'id-tai-khoan');
  await tap(A, 'Đổi số điện thoại');
  await fill(A, 'Số điện thoại mới', phone2);
  await shot(A, 'doi-so-buoc-1');
  await tap(A, 'Gửi mã xác thực');
  await waitText(A, 'Mã gồm 6 số');
  await fill(A, 'Mã xác thực', otpFor(phone2));
  await fill(A, 'Mật khẩu hiện tại', 'sai-mat-khau-1');
  await tap(A, 'Đổi số điện thoại', 'button');
  await waitText(A, 'Mật khẩu không đúng');
  check('đổi số: sai mật khẩu bị từ chối, có thể thử lại bằng cùng mã', true);
  await shot(A, 'doi-so-sai-mat-khau');
  await fill(A, 'Mật khẩu hiện tại', PASS);
  await tap(A, 'Đổi số điện thoại', 'button');
  await waitText(A, '••••' + phone2.slice(-4));
  const me2 = await apiMe(A);
  check('đổi số thành công: tài khoản đang dùng số mới', me2.user && me2.user.phoneLast4 === phone2.slice(-4));
  await waitText(A, 'Số điện thoại của tài khoản đã được đổi');
  check('hiện thông báo đã đổi số', true);
  await shot(A, 'doi-so-xong');

  // ===== 6. Người giữ số cũ hoàn tác từ "Quên mật khẩu" =====
  const ctx2 = await browser.createBrowserContext();
  const B = await newPage('chu-so-cu', { ctx: ctx2, view: 's' });
  await B.goto(ORIGIN + '/id/#/quen-mat-khau', { waitUntil: 'networkidle0' });
  await fill(B, 'Số điện thoại', phone);
  await tap(B, 'Gửi mã xác thực');
  await waitText(B, 'Mã gồm 6 số');
  await fill(B, 'Mã xác thực', otpFor(phone));
  await waitText(B, 'Số này vừa được chuyển khỏi một tài khoản');
  check('số cũ trong 7 ngày được đề nghị hoàn tác', true);
  await shot(B, 'hoan-tac-doi-so');
  await fill(B, 'Mật khẩu mới', PASS2);
  await tap(B, 'Hoàn tác và đặt mật khẩu mới');
  await waitText(B, 'Gia đình của tôi');
  const me3 = await apiMe(B);
  check('hoàn tác: tài khoản về số cũ và đã đăng nhập', me3.user && me3.user.phoneLast4 === phone.slice(-4));
  await A.reload({ waitUntil: 'networkidle0' });
  await waitText(A, 'Đăng nhập 9app');
  check('hoàn tác thu hồi phiên của thiết bị đã đổi số', true);
  await B.close(); await ctx2.close(); await A.close();

  // ===== 7. Thông báo thiết bị mới: máy 1 đăng nhập trước, máy 2 đăng nhập sau -> máy 1 thấy, máy 2 không =====
  const dbm = await import('../src/db.js');
  await dbm.query('DELETE FROM sessions'); await dbm.query('DELETE FROM devices'); await dbm.query('DELETE FROM notices');
  const ctx3 = await browser.createBrowserContext();
  const C1 = await newPage('may-1', { ctx: ctx3 });
  await C1.goto(ORIGIN + '/id/', { waitUntil: 'networkidle0' });
  await fill(C1, 'Số điện thoại', phone); await fill(C1, 'Mật khẩu', PASS2); await tap(C1, 'Đăng nhập', 'button');
  await waitText(C1, 'Gia đình của tôi');
  const ctx4 = await browser.createBrowserContext();
  const C2 = await newPage('may-2', { ctx: ctx4 });
  await C2.goto(ORIGIN + '/id/', { waitUntil: 'networkidle0' });
  await fill(C2, 'Số điện thoại', phone); await fill(C2, 'Mật khẩu', PASS2); await tap(C2, 'Đăng nhập', 'button');
  await waitText(C2, 'Gia đình của tôi');
  check('thiết bị vừa đăng nhập không thấy thông báo về chính nó', !(await bodyText(C2)).includes('Có đăng nhập từ một thiết bị mới'));
  await C1.goto(ORIGIN + '/id/#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitText(C1, 'Có đăng nhập từ một thiết bị mới');
  check('thiết bị đang dùng thấy thông báo thiết bị mới ở trang Tài khoản', true);
  await shot(C1, 'thong-bao-thiet-bi-moi');
  await C1.close(); await C2.close(); await ctx3.close(); await ctx4.close();

  // ===== 8. Ảnh launcher đã đăng nhập ở 3 cỡ, sáng và tối =====
  for (const [view, dark] of [['m', false], ['m', true], ['s', false], ['d', false], ['d', true]]) {
    const ctx = await browser.createBrowserContext();
    const P = await newPage('anh-' + view + (dark ? '-toi' : ''), { view, dark, ctx });
    await P.goto(ORIGIN + '/id/', { waitUntil: 'networkidle0' });
    await fill(P, 'Số điện thoại', phone); await fill(P, 'Mật khẩu', PASS2); await tap(P, 'Đăng nhập', 'button');
    await waitText(P, 'Gia đình của tôi');
    await P.goto(ORIGIN + '/index.html#/tai-khoan', { waitUntil: 'networkidle0' });
    await waitVisible(P, '#acc-in');
    await shot(P, `launcher-tai-khoan-${view}${dark ? '-toi' : ''}`);
    await P.close(); await ctx.close();
  }
} catch (e) {
  problems.push('NGOẠI LỆ: ' + e.message);
  console.error(e);
  try { for (const p of await browser.pages()) await p.screenshot({ path: path.join(SHOTS, `loi-${p.__name || 'x'}.png`) }).catch(() => {}); } catch { /* */ }
}

await browser.close();
proxy.close(); staticSrv.close();
await app.close();
await (await import('../src/db.js')).close();
await pg.stop();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} kiểm tra đạt, ${shotNo} ảnh ở ${SHOTS}`);
if (problems.length) { console.log('\nVẤN ĐỀ:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('Không có lỗi console / pageerror / hộp thoại bất ngờ.');
process.exit(0);
