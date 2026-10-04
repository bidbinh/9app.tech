// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): nhiều phiên cùng lúc, điện thoại 390x844 và máy tính, sáng và tối.
// Chạy: node scripts/e2e.js   (tự dựng PostgreSQL nhúng + server ở cổng ngẫu nhiên >= 9800). Ảnh chụp lưu ở shots/.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const { PNG } = await import('pngjs');

const pg = await startEmbedded({ database: 'swap_e2e' });
process.env.DATABASE_URL = pg.url;
process.env.COMMUNITIES_PER_IP_HOUR = '1000000'; process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000';
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
async function freePortFrom(min) {
  const net = await import('node:net');
  for (let i = 0; i < 50; i++) {
    const p = min + Math.floor(Math.random() * 190);
    const ok = await new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(p, '0.0.0.0', () => s.close(() => resolve(true))); });
    if (ok) return p;
  }
  throw new Error('không tìm được cổng trống >= 9800');
}
config.port = await freePortFrom(9800);
const app = await start();
const port = app.server.address().port;
const ORIGIN = `http://127.0.0.1:${port}`;
const URL0 = `${ORIGIN}${config.basePath}/`;
console.log('9swap e2e tại', URL0);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '9swap-e2e-'));
function makePng(file, w, h, [r, g, b]) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (w * y + x) << 2;
    png.data[i] = Math.min(255, r + (x * 60) / w); png.data[i + 1] = Math.min(255, g + (y * 60) / h); png.data[i + 2] = b;
    // vài hình để ảnh có nội dung
    const dx = x - w / 2, dy = y - h / 2;
    if (dx * dx + dy * dy < (h / 4) ** 2) { png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255; }
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
  return file;
}
const IMG1 = makePng(path.join(tmp, 'noi-chien-1.png'), 1600, 1200, [20, 140, 120]);
const IMG2 = makePng(path.join(tmp, 'noi-chien-2.png'), 1200, 1600, [200, 120, 40]);
const IMG3 = makePng(path.join(tmp, 'ghe-xep.png'), 900, 900, [90, 90, 200]);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9swap-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const problems = [];
const checks = [];
let VIEW = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotN = 0;
let SUFFIX = 'mobile';
const check = (name, cond, extra = '') => { checks.push([name, !!cond]); if (!cond) problems.push(`KIỂM TRA SAI: ${name} ${extra}`); };

async function newUser(name, { dark = false, view = VIEW } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const mobile = view.width < 700;
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.__name = name; page.__ctx = ctx;
  page.__allow400 = 0;
  page.on('console', (m) => { if (m.type() === 'error' && page.__allow400 > 0 && /status of (400|409)/.test(m.text())) { page.__allow400--; return; } if (['error', 'warning'].includes(m.type())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText?.includes('ERR_ABORTED')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  page.on('dialog', (d) => { problems.push(`[${name}] hộp thoại bất ngờ: ${d.message()}`); d.dismiss(); });
  return page;
}

async function shot(page, label, full = false) {
  shotN++;
  const file = path.join(SHOTS, `${String(shotN).padStart(2, '0')}-${label}-${SUFFIX}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return file;
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, t, timeout = 8000) {
  try { await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, t); }
  catch { throw new Error(`[${page.__name}] không thấy chữ "${t}". Màn hình hiện: ${(await text(page)).replace(/\s+/g, ' ').slice(0, 300)}`); }
}
async function waitGone(page, t, timeout = 8000) {
  await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, t);
}
async function find(page, label, scope = 'button, a, [role=button], .pill') {
  for (let tries = 0; tries < 24; tries++) {
    const h = await page.evaluateHandle((label, scope) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const sheet = document.querySelector('.sheet');
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      const cta = els.filter((e) => e.closest('#cta'));
      const all = [...pool, ...cta.filter((e) => !pool.includes(e))];
      return all.find((e) => norm(e.textContent) === label) || all.find((e) => (norm(e.textContent) + ' ' + (e.getAttribute('aria-label') || '')).includes(label)) || null;
    }, label, scope);
    if (h.asElement()) return h.asElement();
    await sleep(250);
  }
  throw new Error(`[${page.__name}] không thấy nút/liên kết "${label}". Màn hình hiện: ${(await text(page)).replace(/\s+/g, ' ').slice(0, 300)}`);
}
async function tap(page, label, o = {}) {
  await page.bringToFront();
  const el = await find(page, label, o.scope);
  await el.evaluate((e) => { if (!e.closest('#cta, .sheet, .tabs')) e.scrollIntoView({ block: 'center' }); });
  await sleep(80);
  await el.click();
  await sleep(o.wait ?? 350);
}
// ô nhập theo nhãn (label) hoặc placeholder
async function fill(page, labelText, value, o = {}) {
  await page.bringToFront();
  const finder = (labelText) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sheet = document.querySelector('.sheet');
    const root = sheet || document;
    for (const l of root.querySelectorAll('label')) {
      if (norm(l.textContent).includes(labelText) && l.htmlFor) { const el = document.getElementById(l.htmlFor); if (el) return el; }
    }
    for (const el of root.querySelectorAll('input, textarea')) if ((el.getAttribute('placeholder') || '').includes(labelText) || (el.getAttribute('aria-label') || '').includes(labelText)) return el;
    return null;
  };
  const h = await page.evaluateHandle(finder, labelText);
  let el = h.asElement();
  for (let i = 0; i < 24 && !el; i++) {
    await sleep(250);
    el = (await page.evaluateHandle(finder, labelText)).asElement();
  }
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${labelText}"`);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: o.delay ?? 2 });
}
async function select(page, labelText, value) {
  const finder = (labelText) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    for (const l of document.querySelectorAll('label')) if (norm(l.textContent).includes(labelText) && l.htmlFor) return document.getElementById(l.htmlFor);
    return null;
  };
  let el = null;
  for (let i = 0; i < 24 && !el; i++) { el = (await page.evaluateHandle(finder, labelText)).asElement(); if (!el) await sleep(250); }
  if (!el) throw new Error(`[${page.__name}] không thấy ô chọn "${labelText}"`);
  await el.select(value);
}
async function blur(page) { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(250); }
const hash = (page) => page.evaluate(() => location.hash);
async function noHorizontalScroll(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`không tràn ngang (${label}, ${SUFFIX})`, o.sw <= o.cw + 1, JSON.stringify(o));
}

try {
  // =============== PHẦN 1: điện thoại 390x844 ===============
  SUFFIX = 'mobile';
  const chu = await newUser('Chủ');
  const lan = await newUser('Lan');
  const minh = await newUser('Minh');

  // ---- trang chủ trống, tạo cộng đồng
  await chu.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(chu, 'Cho tặng, trao đổi đồ cũ');
  await shot(chu, 'home-trong');
  await noHorizontalScroll(chu, 'home');
  await tap(chu, 'Tạo cộng đồng');
  await fill(chu, 'Tên cộng đồng', 'Tòa Sunrise');
  await fill(chu, 'Tên của bạn', 'Ban quản lý');
  await shot(chu, 'tao-cong-dong');
  await tap(chu, 'Tạo cộng đồng', { scope: '.sheet button' }); // chưa tick quy tắc
  await waitText(chu, 'Hãy đồng ý với quy tắc');
  await chu.click('#agree'); await sleep(100);
  await tap(chu, 'Tạo cộng đồng', { scope: '.sheet button', wait: 800 });
  await waitText(chu, 'Mời mọi người vào');
  const code = await chu.$eval('#invite-code', (e) => e.textContent.trim());
  check('mã mời 10 ký tự', /^[A-HJ-NP-Z2-9]{10}$/.test(code), code);
  const inviteUrl = await chu.$eval('#invite-url', (e) => e.textContent.trim());
  check('link mời có /swap/c/<mã>', inviteUrl.endsWith(`${config.basePath}/c/${code}`), inviteUrl);
  await shot(chu, 'cai-dat-moi');
  await noHorizontalScroll(chu, 'cài đặt');
  const cid = (await hash(chu)).match(/#\/c\/([0-9a-f-]{36})/)[1];

  // ---- Lan vào bằng link mời
  await lan.goto(`${ORIGIN}${config.basePath}/c/${code}`, { waitUntil: 'networkidle0' });
  await waitText(lan, 'Tòa Sunrise');
  check('link mời mở màn vào cộng đồng', (await hash(lan)).startsWith('#/join/'));
  await shot(lan, 'vao-cong-dong');
  await fill(lan, 'Tên của bạn', 'Lan P1203');
  await tap(lan, 'Vào cộng đồng'); // chưa tick
  await waitText(lan, 'Hãy đồng ý với quy tắc');
  await lan.click('#agree'); await sleep(100);
  await tap(lan, 'Vào cộng đồng', { wait: 900 });
  await waitText(lan, 'Chưa có tin nào');
  await shot(lan, 'feed-trong');

  // ---- Lan đăng tin có ảnh
  await tap(lan, 'Đăng', { scope: '.tab' });
  await waitText(lan, 'Tên món đồ');
  await shot(lan, 'form-dang-tin');
  await fill(lan, 'Tên món đồ', 'Nồi chiên không dầu 5L');
  await select(lan, 'Danh mục', 'gia_dung');
  await select(lan, 'Tình trạng', 'nhu_moi');
  await fill(lan, 'Mô tả', 'Dùng 6 tháng, còn bảo hành. Tặng ai cần, nhà mình chuyển sang bếp từ.');
  await fill(lan, 'Nơi nhận', 'Tòa A, tầng 12, sảnh thang máy');
  await fill(lan, 'Giờ nhận', 'Sau 18h các ngày trong tuần');
  const fileIn = await lan.$('input[type=file]');
  await fileIn.uploadFile(IMG1, IMG2);
  await lan.waitForFunction(() => document.querySelectorAll('.photos .photo img').length >= 2, { timeout: 15000 });
  await sleep(300);
  await shot(lan, 'form-co-anh', true);
  await blur(lan);
  await tap(lan, 'Đăng tin', { wait: 100 });
  await waitText(lan, 'Nồi chiên không dầu 5L', 15000);
  await lan.waitForFunction(() => [...document.querySelectorAll('.gallery img')].length === 2 && [...document.querySelectorAll('.gallery img')].every((i) => i.complete && i.naturalWidth > 0), { timeout: 15000 });
  const dims = await lan.$$eval('.gallery img', (is) => is.map((i) => [i.naturalWidth, i.naturalHeight]));
  check('ảnh được nén còn ≤ 1280px', dims.every(([w, h]) => Math.max(w, h) <= 1280 && Math.max(w, h) > 300), JSON.stringify(dims));
  await shot(lan, 'chi-tiet-nguoi-dang');
  await noHorizontalScroll(lan, 'chi tiết');
  const lid = (await hash(lan)).match(/#\/l\/([0-9a-f-]{36})/)[1];

  // ---- thêm vài tin cho danh sách
  async function quickListing(page, o) {
    await page.goto(`${URL0}#/c/${cid}/new`, { waitUntil: 'networkidle0' });
    await waitText(page, 'Tên món đồ');
    await fill(page, 'Tên món đồ', o.title);
    if (o.cat) await select(page, 'Danh mục', o.cat);
    if (o.kind) await tap(page, o.kind, { scope: '.seg button' });
    if (o.price) await fill(page, 'Giá bán', o.price);
    if (o.wish) await fill(page, 'Muốn đổi lấy', o.wish);
    await fill(page, 'Nơi nhận', o.loc || 'Sảnh tòa B');
    if (o.img) { await (await page.$('input[type=file]')).uploadFile(o.img); await page.waitForFunction(() => document.querySelectorAll('.photos .photo img').length >= 1, { timeout: 15000 }); }
    await blur(page);
    await tap(page, 'Đăng tin', { wait: 100 });
    await waitText(page, o.title, 15000);
  }
  await quickListing(lan, { title: 'Ghế xếp gỗ', cat: 'noi_that', img: IMG3 });
  await quickListing(lan, { title: 'Sách Đắc nhân tâm', cat: 'sach', kind: 'Bán', price: '30k' });
  await quickListing(lan, { title: 'Xe đạp trẻ em 16 inch', cat: 'tre_em', kind: 'Trao đổi', wish: 'xe đạp 20 inch' });
  // đồ ăn: chỉ được tặng
  await lan.goto(`${URL0}#/c/${cid}/new`, { waitUntil: 'networkidle0' });
  await select(lan, 'Danh mục', 'thuc_pham'); await sleep(200);
  const disabled = await lan.$$eval('.seg button', (bs) => bs.map((b) => [b.textContent, b.disabled]));
  check('đồ ăn khóa lựa chọn Bán và Trao đổi', disabled.find((x) => x[0] === 'Bán')[1] && disabled.find((x) => x[0] === 'Trao đổi')[1] && !disabled.find((x) => x[0] === 'Tặng')[1], JSON.stringify(disabled));
  // đồ cấm bị chặn (hai lần 400 có chủ đích)
  lan.__allow400 = 2;
  await select(lan, 'Danh mục', 'khac');
  await fill(lan, 'Tên món đồ', 'Bán thuốc kê đơn');
  await fill(lan, 'Nơi nhận', 'Sảnh');
  await blur(lan);
  await tap(lan, 'Đăng tin', { wait: 100 });
  await waitText(lan, 'không được đăng');
  check('đồ cấm bị từ chối và báo rõ', (await hash(lan)).endsWith('/new'));
  await shot(lan, 'do-cam-bi-chan');
  // liên kết bị chặn
  await fill(lan, 'Tên món đồ', 'Bàn phím cơ');
  await fill(lan, 'Mô tả', 'xem thêm tại http://evil.example');
  await tap(lan, 'Đăng tin', { wait: 100 });
  await waitText(lan, 'không được chứa liên kết');

  // ---- chủ cộng đồng xem danh sách, tìm không dấu, lọc
  await chu.goto(`${URL0}#/c/${cid}`, { waitUntil: 'networkidle0' });
  await waitText(chu, 'Nồi chiên không dầu 5L');
  await chu.waitForFunction(() => [...document.querySelectorAll('.lcard .thumb img')].some((i) => i.complete && i.naturalWidth > 0), { timeout: 10000 });
  await shot(chu, 'feed-co-tin');
  await noHorizontalScroll(chu, 'feed');
  await fill(chu, 'Tìm kiếm', 'noi chien khong dau'); await sleep(900);
  let t = await text(chu);
  check('tìm không dấu ra nồi chiên', t.includes('Nồi chiên không dầu 5L') && !t.includes('Ghế xếp gỗ'));
  await shot(chu, 'tim-khong-dau');
  await fill(chu, 'Tìm kiếm', 'zzzz khong co'); await sleep(900);
  await waitText(chu, 'Không có tin nào khớp');
  await fill(chu, 'Tìm kiếm', ''); await sleep(900);
  await blur(chu);
  await tap(chu, 'Bán', { scope: '.pill' }); await sleep(600);
  t = await text(chu);
  check('lọc Bán chỉ còn sách', t.includes('Sách Đắc nhân tâm') && !t.includes('Ghế xếp gỗ'));
  await tap(chu, 'Tất cả', { scope: '.pill' }); await sleep(600);

  // ---- Minh vào và quan tâm
  await minh.goto(`${ORIGIN}${config.basePath}/c/${code}`, { waitUntil: 'networkidle0' });
  await fill(minh, 'Tên của bạn', 'Minh');
  await minh.click('#agree'); await sleep(100);
  await tap(minh, 'Vào cộng đồng', { wait: 900 });
  await waitText(minh, 'Nồi chiên không dầu 5L');
  await tap(minh, 'Nồi chiên không dầu 5L', { scope: '.lcard' });
  await waitText(minh, 'Quan tâm món này');
  await shot(minh, 'chi-tiet-nguoi-khac');
  await tap(minh, 'Quan tâm món này');
  await waitText(minh, 'chỉ gửi riêng');
  await shot(minh, 'quan-tam-sheet');
  await tap(minh, 'Gửi', { scope: '.sheet button', wait: 900 });
  await waitText(minh, 'Chào bạn, mình quan tâm món này');
  await shot(minh, 'trao-doi-minh');

  // ---- Lan nhận thông báo, trả lời, chọn người nhận
  await lan.goto(`${URL0}#/c/${cid}/notifs`, { waitUntil: 'networkidle0' });
  await waitText(lan, 'Minh quan tâm');
  await shot(lan, 'thong-bao');
  await tap(lan, 'Minh quan tâm', { scope: '.nrow', wait: 900 });
  await waitText(lan, 'Chọn Minh nhận món này');
  await fill(lan, 'Tin nhắn', 'Còn nhé! 6h chiều mai ở sảnh tòa A được không bạn?');
  await tap(lan, 'Gửi', { scope: 'button[aria-label=Gửi]' });
  await waitText(lan, '6h chiều mai');
  await shot(lan, 'trao-doi-lan');
  await blur(lan);
  // Minh thấy tin trả lời mà không cần tải lại (thăm dò 5 giây)
  await waitText(minh, '6h chiều mai', 12000);
  check('Minh nhận tin nhắn của Lan nhờ thăm dò', true);
  await fill(minh, 'Tin nhắn', 'Ok bạn, mình đến đúng giờ nhé.');
  await tap(minh, 'Gửi', { scope: 'button[aria-label=Gửi]' });
  await waitText(minh, 'mình đến đúng giờ');
  await waitText(lan, 'mình đến đúng giờ', 12000);
  await tap(lan, 'Chọn Minh nhận món này');
  await waitText(lan, 'Món này sẽ được giữ cho Minh');
  await shot(lan, 'chon-nguoi-nhan');
  await tap(lan, 'Chọn người này', { scope: '.sheet button', wait: 900 });
  await waitText(lan, 'Bạn đã chọn Minh nhận món này');
  await tap(lan, 'Nồi chiên không dầu 5L', { scope: 'a.card', wait: 900 });
  await waitText(lan, 'Bạn đã giữ cho Minh');
  await shot(lan, 'da-giu');
  await tap(lan, 'Đã tặng xong');
  await waitText(lan, 'Lần này sẽ được tính vào điểm uy tín');
  await shot(lan, 'xac-nhan-tang');
  await tap(lan, 'Đã tặng xong', { scope: '.sheet button', wait: 900 });
  await waitText(lan, 'Đã tặng xong. Cảm ơn');
  await shot(lan, 'da-tang');
  // Minh mở lại tin: thấy đã xong; Lan có điểm uy tín
  await minh.goto(`${URL0}#/l/${lid}`, { waitUntil: 'networkidle0' });
  await waitText(minh, 'Đã tặng xong');
  await minh.goto(`${URL0}#/c/${cid}/settings`, { waitUntil: 'networkidle0' });
  await tap(minh, 'Thành viên', { scope: 'a.trow' });
  await waitText(minh, 'Lan P1203');
  t = await text(minh);
  check('điểm uy tín của Lan hiện "tặng 1"', t.includes('tặng 1'));
  await shot(minh, 'thanh-vien');

  // ---- bảng tin
  await minh.goto(`${URL0}#/c/${cid}/board`, { waitUntil: 'networkidle0' });
  await waitText(minh, 'Bảng tin còn trống');
  await shot(minh, 'bang-tin-trong');
  await tap(minh, 'Đăng bài', { scope: 'a', wait: 600 });
  await fill(minh, 'Tiêu đề', 'Mất chìa khóa xe máy Honda');
  await fill(minh, 'Mô tả', 'Móc khóa hình gấu nâu, mất khoảng 7h tối qua.');
  await fill(minh, 'Nơi', 'Hầm B1');
  await blur(minh);
  await tap(minh, 'Đăng bài', { scope: '#view button', wait: 900 });
  await waitText(minh, 'Mất chìa khóa xe máy Honda');
  await shot(minh, 'bai-bang-tin');
  await lan.goto(`${URL0}#/c/${cid}/board`, { waitUntil: 'networkidle0' });
  await tap(lan, 'Mất chìa khóa xe máy Honda', { scope: '.lcard', wait: 700 });
  await fill(lan, 'Bình luận', 'Mình thấy móc khóa hình gấu ở bảo vệ hầm B1 nhé.');
  await blur(lan);
  await tap(lan, 'Gửi bình luận');
  await waitText(lan, 'bảo vệ hầm B1');
  await shot(lan, 'binh-luan');
  await minh.goto(`${URL0}#/c/${cid}/notifs`, { waitUntil: 'networkidle0' });
  await waitText(minh, 'bình luận về "Mất chìa khóa xe máy Honda"', 8000);

  // ---- báo cáo và kiểm duyệt
  await lan.goto(`${URL0}#/c/${cid}/board`, { waitUntil: 'networkidle0' });
  await tap(lan, 'Mất chìa khóa xe máy Honda', { scope: '.lcard', wait: 700 });
  await tap(lan, 'Báo cáo bài này');
  await waitText(lan, 'Chỉ chủ cộng đồng thấy báo cáo');
  await shot(lan, 'bao-cao-sheet');
  await tap(lan, 'Gửi báo cáo', { scope: '.sheet button', wait: 700 });
  await waitText(lan, 'Đã gửi báo cáo');
  await chu.goto(`${URL0}#/c/${cid}/reports`, { waitUntil: 'networkidle0' });
  await waitText(chu, 'Chờ xử lý');
  await shot(chu, 'hang-cho-bao-cao');
  await tap(chu, 'Gỡ nội dung');
  await tap(chu, 'Gỡ nội dung', { scope: '.sheet button', wait: 900 });
  await waitText(chu, 'Không có báo cáo nào');
  await minh.goto(`${URL0}#/c/${cid}/board`, { waitUntil: 'networkidle0' });
  await waitText(minh, 'Bảng tin còn trống');

  // ---- XSS: tiêu đề chứa thẻ HTML phải hiện nguyên văn
  const xss = '<img src=x onerror="window.__xss=1"><b>đậm</b>';
  await quickListing(lan, { title: xss, loc: '<script>window.__xss=2</script>' });
  const xssOk = await lan.evaluate(() => ({ flag: window.__xss, imgs: document.querySelectorAll('img[src="x"]').length, bold: document.querySelectorAll('#view b').length, h1: document.querySelector('h1.meal-t').textContent }));
  check('XSS: không chạy mã, không sinh thẻ', xssOk.flag === undefined && xssOk.imgs === 0 && xssOk.bold === 0 && xssOk.h1 === xss, JSON.stringify(xssOk));
  await chu.goto(`${URL0}#/c/${cid}`, { waitUntil: 'networkidle0' });
  await waitText(chu, '<img src=x');
  const xss2 = await chu.evaluate(() => ({ flag: window.__xss, imgs: document.querySelectorAll('img[src="x"]').length }));
  check('XSS: danh sách cũng an toàn', xss2.flag === undefined && xss2.imgs === 0);
  await shot(chu, 'xss-an-toan');

  // ---- Cài đặt, quy tắc
  await chu.goto(`${URL0}#/rules`, { waitUntil: 'networkidle0' });
  await waitText(chu, 'Không đăng những thứ này');
  await shot(chu, 'quy-tac', true);
  await chu.goto(`${URL0}#/c/${cid}/settings`, { waitUntil: 'networkidle0' });
  await shot(chu, 'cai-dat-chu', true);

  // ---- tối và cỡ nhỏ 360
  const dark = await newUser('Tối', { dark: true });
  await dark.goto(URL0, { waitUntil: 'networkidle0' });
  await shot(dark, 'home-toi');
  await dark.close();
  const small = await newUser('Nhỏ', { view: { width: 360, height: 740 } });
  await small.goto(`${ORIGIN}${config.basePath}/c/${code}`, { waitUntil: 'networkidle0' });
  await fill(small, 'Tên của bạn', 'Hà'); await small.click('#agree'); await tap(small, 'Vào cộng đồng', { wait: 900 });
  await waitText(small, 'Ghế xếp gỗ');
  await shot(small, 'feed-360');
  await noHorizontalScroll(small, 'feed 360');
  await small.goto(`${URL0}#/c/${cid}/new`, { waitUntil: 'networkidle0' });
  await noHorizontalScroll(small, 'form 360');
  await small.close();

  // =============== PHẦN 2: máy tính ===============
  SUFFIX = 'desktop';
  const dk = await newUser('Máy tính', { view: { width: 1280, height: 820 } });
  await dk.goto(`${ORIGIN}${config.basePath}/c/${code}`, { waitUntil: 'networkidle0' });
  await fill(dk, 'Tên của bạn', 'Quân'); await dk.click('#agree'); await tap(dk, 'Vào cộng đồng', { wait: 900 });
  await waitText(dk, 'Ghế xếp gỗ');
  await dk.waitForFunction(() => [...document.querySelectorAll('.lcard .thumb img')].some((i) => i.complete && i.naturalWidth > 0), { timeout: 10000 });
  await shot(dk, 'feed');
  await noHorizontalScroll(dk, 'feed');
  await tap(dk, 'Ghế xếp gỗ', { scope: '.lcard', wait: 900 });
  await waitText(dk, 'Nhận đồ tại');
  await shot(dk, 'chi-tiet');
  await dk.goto(`${URL0}#/c/${cid}/new`, { waitUntil: 'networkidle0' });
  await shot(dk, 'form');
  await dk.goto(`${URL0}#/c/${cid}/board`, { waitUntil: 'networkidle0' });
  await shot(dk, 'bang-tin');
  await dk.close();
} catch (e) {
  problems.push('NGOẠI LỆ: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
} finally {
  await browser.close().catch(() => {});
  try { app.stopSweep?.(); await app.close(); } catch { /* bỏ qua */ }
  await pg.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* Windows có thể còn khóa */ }
}

console.log(`\nKiểm tra: ${checks.filter((c) => c[1]).length}/${checks.length} đạt`);
for (const c of checks) console.log(`  ${c[1] ? 'OK ' : 'SAI'} ${c[0]}`);
console.log(`Ảnh chụp: ${shotN} tệp trong ${SHOTS}`);
if (problems.length) {
  console.log('\nVẤN ĐỀ:');
  for (const p of problems) console.log(' - ' + p);
  process.exit(1);
}
console.log('\nKhông có lỗi console, không có lỗi trang.');
process.exit(0);
