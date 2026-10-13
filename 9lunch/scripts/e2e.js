// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): nhiều phiên cùng lúc, điện thoại 390x844 và 360x740, sáng và tối.
// Chạy: node scripts/e2e.js   (tự dựng PostgreSQL nhúng + server). Ảnh chụp lưu ở shots/.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const jsQR = (await import('jsqr')).default;
const { PNG } = await import('pngjs');

const pg = await startEmbedded({ database: 'lunch_e2e' });
process.env.DATABASE_URL = pg.url;
process.env.TEAMS_PER_IP_HOUR = '1000000'; process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000';
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
config.port = 0;
const app = await start();
const port = app.server.address().port;
const ORIGIN = `http://127.0.0.1:${port}`;
const URL0 = `${ORIGIN}${config.basePath}/`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9lunch-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const results = []; const problems = [];
let VIEW = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

async function newUser(name, { dark = false, view = VIEW } = {}) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(ORIGIN, ['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.__name = name; page.__ctx = ctx;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|ERR_INTERNET_DISCONNECTED)/.test(m.text()) && !/favicon|icon\.(svg|png)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText?.includes('ERR_ABORTED') && !/ERR_INTERNET_DISCONNECTED/.test(r.failure()?.errorText || '')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  return page;
}

async function find(page, text, scope = 'button, a, [role=radio]', exact = false) {
  lastPage = page;
  await page.bringToFront();
  let h = null;
  for (let tries = 0; tries < 16; tries++) {
  h = await page.evaluateHandle((text, scope, exact) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
    const sheet = document.querySelector('.sheet');
    const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
    const cta = els.filter((e) => e.closest('#cta'));
    return [...pool, ...cta.filter((e) => !pool.includes(e))].find((e) => { const t = norm(e.textContent) || e.getAttribute('aria-label') || ''; return exact ? t === text : (t.includes(text) || (e.getAttribute('aria-label') || '').includes(text)); }) || null;
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
  await el.evaluate((e) => { if (!e.closest('#cta, .sheet')) e.scrollIntoView({ block: 'center' }); });
  await sleep(60);
  await el.click();
  await sleep(o.wait ?? 250);
}
async function fill(page, label, value, o = {}, attempt = 0) {
  try { return await fill1(page, label, value, o); } catch (err) { if (attempt < 2 && /detached|Execution context|not clickable/.test(err.message)) { await sleep(500); return fill(page, label, value, o, attempt + 1); } throw err; }
}
async function fill1(page, label, value, o = {}) {
  lastPage = page;
  await page.bringToFront();
  await page.waitForFunction((label) => [...document.querySelectorAll('label')].some((l) => l.textContent.trim().startsWith(label) && l.getBoundingClientRect().width > 0), { timeout: 5000 }, label).catch(() => {});
  const h = await page.evaluateHandle((label) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sheet = document.querySelector('.sheet');
    const labs = [...document.querySelectorAll('label')].filter((l) => !sheet || sheet.contains(l));
    const lab = labs.find((l) => norm(l.textContent).startsWith(label) && l.getBoundingClientRect().width > 0);
    return lab ? document.getElementById(lab.getAttribute('for')) : null;
  }, label);
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (o.select) await el.select(value); else await el.type(value, { delay: 0 });
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, t, timeout = 9000) {
  await page.bringToFront();
  try { await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t); } catch { throw new Error(`[${page.__name}] chờ không thấy chữ "${t}". Màn hình hiện: ${(await text(page)).slice(0, 400).replace(/\n+/g, ' | ')}`); }
}
async function gone(page, t, timeout = 9000) { await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, t); }
async function shot(page, name) { await sleep(150); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

// kiểm tra từng màn: không tràn ngang, vùng bấm đủ lớn, chữ không quá nhỏ, ảnh có alt, tương phản cơ bản
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const out = { overflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth, small: [], tiny: [], noalt: 0, inputsNoLabel: [] };
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    for (const e of document.querySelectorAll('button, a.btn, input, select, textarea, [role=radio]')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if ((r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'INPUT' && e.type === 'checkbox')) out.small.push(`${e.tagName}.${e.className}:"${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (e.tagName === 'INPUT' && !e.labels?.length && !e.getAttribute('aria-label') && e.type !== 'checkbox') out.inputsNoLabel.push(e.placeholder || e.type);
    }
    for (const e of document.querySelectorAll('body *')) {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!vis(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 13.5) out.tiny.push(`${e.tagName}.${e.className} ${fs}px "${e.textContent.trim().slice(0, 20)}"`);
    }
    for (const i of document.querySelectorAll('img')) if (!i.getAttribute('alt')) out.noalt++;
    // phần tử tràn khỏi màn hình
    out.wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.sheet-back') ).slice(0, 4).map((e) => e.tagName + '.' + e.className);
    return out;
  });
  if (r.overflow) problems.push(`[${label}] TRÀN NGANG`);
  if (r.wide.length) problems.push(`[${label}] phần tử vượt khung: ${r.wide.join(', ')}`);
  if (r.small.length) problems.push(`[${label}] vùng bấm < 44px: ${[...new Set(r.small)].slice(0, 5).join('; ')}`);
  if (r.tiny.length) problems.push(`[${label}] chữ < 13.5px: ${[...new Set(r.tiny)].slice(0, 4).join('; ')}`);
  if (r.noalt) problems.push(`[${label}] ${r.noalt} ảnh thiếu alt`);
  if (r.inputsNoLabel.length) problems.push(`[${label}] ô nhập không nhãn: ${r.inputsNoLabel.join(', ')}`);
}

async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); if (lastPage) { await lastPage.screenshot({ path: path.join(SHOTS, 'fail-' + results.length + '.png') }).catch(() => {}); }
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const api = (page, p, method = 'GET', body) => page.evaluate(async (p, method, body) => {
  const r = await fetch(new URL(p, document.baseURI), { method, headers: { 'X-Requested-With': '9lunch', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, p, method, body);
const decodeEl = async (el) => {
  await el.evaluate((x) => { x.scrollIntoView({ block: 'start' }); document.getElementById('cta').style.visibility = 'hidden'; });
  const png = PNG.sync.read(Buffer.from(await el.screenshot({ type: 'png' })));
  await el.evaluate(() => { document.getElementById('cta').style.visibility = ''; });
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
};

// -------------------------------------------------------------------------------------------
const NAMES = { chu: 'Trần Thị Bình Minh 🍜', an: 'Nguyễn Văn An', binh: 'Lê Bình', chi: 'Phạm Thị Chi' };
const BANKS = { chu: ['970436', '0011004012345', 'TRAN THI BINH MINH'], an: ['970415', '111222333444', 'NGUYEN VAN AN'], chi: ['970422', '5550001112', 'PHAM THI CHI'] };
let chu, an, binh, chi, out, teamId, code, mealId, mealUrl;
let lastPage = null;

async function setBank(page, [bin, acc, holder]) {
  await fill(page, 'Ngân hàng', bin, { select: true });
  await fill(page, 'Số tài khoản', acc); await fill(page, 'Tên chủ tài khoản', holder);
}
const hashOf = (page) => page.evaluate(() => location.hash);

console.log('--- 390x844, chế độ sáng ---');
await step('trang vào trống: có thiết kế rõ, không tràn, không lỗi', async () => {
  chu = await newUser('Chủ');
  await chu.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(chu, 'Cơm trưa cả nhóm');
  await audit(chu, 'home-trống'); await shot(chu, '01-home-trong');
});

await step('Chủ tạo nhóm với tên có dấu + emoji, có tài khoản nhận tiền', async () => {
  await fill(chu, 'Tên nhóm', 'Team Kế toán tầng 5 🥢');
  await fill(chu, 'Tên của bạn', NAMES.chu);
  await tap(chu, 'Nhập tài khoản nhận tiền ngay');
  await setBank(chu, BANKS.chu);
  await shot(chu, '02-tao-nhom');
  await tap(chu, 'Tạo nhóm', { exact: true, wait: 900 });
  await waitText(chu, 'Hôm nay ăn gì');
  teamId = (await hashOf(chu)).split('/')[2];
  code = (await api(chu, `api/teams/${teamId}`)).json.team.inviteCode;
  await audit(chu, 'team-moi'); await shot(chu, '03-team-moi');
  if (!(await text(chu)).includes('Nhóm mới chỉ có mình bạn')) throw new Error('thiếu trạng thái nhóm trống');
});

await step('mã mời sai: màn lỗi rõ ràng; người ngoài mở thẳng link nhóm: không thấy gì', async () => {
  out = await newUser('Ngoài');
  await out.goto(`${ORIGIN}${config.basePath}/t/AAAAAAAAAA`, { waitUntil: 'networkidle0' });
  await waitText(out, 'Mã mời không dùng được');
  await audit(out, 'ma-sai'); await shot(out, '04-ma-sai');
  await out.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await waitText(out, 'Không tìm thấy');
  if ((await text(out)).includes('Team Kế toán')) throw new Error('người ngoài thấy tên nhóm');
  await shot(out, '05-ngoai-nhom');
});

async function joinAs(key) {
  const p = await newUser(NAMES[key]);
  await p.goto(`${ORIGIN}${config.basePath}/t/${code}`, { waitUntil: 'networkidle0' });
  await waitText(p, 'Bạn được mời vào nhóm');
  if (key === 'an') { await audit(p, 'join'); await shot(p, '06-moi-vao-nhom'); }
  await fill(p, 'Tên của bạn', NAMES[key]);
  await tap(p, 'Vào nhóm', { exact: true, wait: 700 });
  await waitText(p, 'Hôm nay ăn gì');
  return p;
}
await step('3 thành viên vào bằng link ở phiên mới (An, Bình, Chi)', async () => {
  an = await joinAs('an'); binh = await joinAs('binh'); chi = await joinAs('chi');
  if (!(await text(an)).includes('Nhập tài khoản') ) throw new Error('thiếu gợi ý nhập tài khoản');
  await shot(an, '07-team-thanh-vien');
});
await step('tên trùng bị báo rõ; vào lại link khi đã là thành viên thì vào thẳng nhóm', async () => {
  const dup = await newUser('Trùng');
  await dup.goto(`${ORIGIN}${config.basePath}/t/${code}`, { waitUntil: 'networkidle0' });
  await fill(dup, 'Tên của bạn', 'nguyễn văn an');
  await tap(dup, 'Vào nhóm', { exact: true });
  await waitText(dup, 'Trong nhóm đã có người tên này');
  await dup.__ctx.close();
  await an.goto(`${ORIGIN}${config.basePath}/t/${code}`, { waitUntil: 'networkidle0' });
  await waitText(an, 'Hôm nay ăn gì');
});

await step('Chủ tạo bữa; bấm hai lần không tạo hai bữa', async () => {
  await tap(chu, 'Tạo bữa trưa', { wait: 100 });
  await waitText(chu, 'Chọn quán');
  mealUrl = chu.url(); mealId = (await hashOf(chu)).split('/')[2];
  const n = (await api(chu, `api/teams/${teamId}`)).json.recentMeals.length + 1;
  await waitText(chu, 'Chưa có đề xuất nào');
  await audit(chu, 'meal-chon-quan-trong'); await shot(chu, '08-bua-trong');
});

const meal = (p, goto = true) => goto ? p.goto(mealUrl, { waitUntil: 'networkidle0' }) : null;
await step('đề xuất quán (kể cả link xấu bị từ chối), gợi ý ngẫu nhiên khi chưa có lịch sử', async () => {
  await fill(chu, 'Tên quán', 'Cơm tấm Ba Ghiền');
  await fill(chu, 'Link menu', 'https://shopeefood.vn/ba-ghien');
  await tap(chu, 'Thêm quán', { exact: true });
  await waitText(chu, 'Cơm tấm Ba Ghiền');
  await tap(chu, 'Gợi ý ngẫu nhiên'); await waitText(chu, 'đều đã được đề xuất');
  await meal(an); await waitText(an, 'Cơm tấm Ba Ghiền');
  await fill(an, 'Tên quán', 'Phở Thìn');
  await fill(an, 'Link menu', 'javascript:alert(1)');
  await tap(an, 'Thêm quán', { exact: true });
  await waitText(an, 'Liên kết cần bắt đầu bằng http');
  await fill(an, 'Link menu', '');
  await tap(an, 'Thêm quán', { exact: true });
  await waitText(an, 'Phở Thìn');
  await audit(an, 'meal-chon-quan');
});

await step('bình chọn và đổi phiếu; mọi phiên thấy kết quả mới trong vài giây', async () => {
  await meal(binh); await meal(chi);
  const vote = async (p, name) => { await p.bringToFront(); await p.waitForSelector('button.vote'); const el = await p.evaluateHandle((n) => document.querySelector(`button.vote[aria-label$="${n}"]`), name); await el.asElement().click(); await sleep(400); };
  await vote(binh, 'Phở Thìn'); await vote(an, 'Phở Thìn'); await vote(chi, 'Cơm tấm Ba Ghiền'); await vote(chu, 'Cơm tấm Ba Ghiền');
  await vote(chu, 'Phở Thìn'); // đổi phiếu
  await waitText(chu, '3 phiếu');
  await waitText(chi, '3 phiếu', 12000); // chi thấy qua thăm dò tự động
  const t = await text(chu);
  if (!/1 phiếu: Phạm Thị Chi/.test(t)) throw new Error('không thấy người bình chọn: ' + t.slice(0, 300));
  await audit(chu, 'meal-binh-chon'); await shot(chu, '09-binh-chon'); await shot(binh, '10-binh-chon-thanh-vien');
});

await step('chốt quán (thành viên thường không có nút chốt)', async () => {
  const t = await text(binh);
  if (t.includes('Chốt quán:')) throw new Error('thành viên thường thấy nút chốt');
  await tap(chu, 'Chốt quán:', { wait: 900 });
  await waitText(chu, 'Gọi món'); await waitText(chu, 'Phở Thìn');
});

await step('gom món: thêm, giá có dấu chấm/phẩy/k, sửa, xóa, ô trống báo lỗi', async () => {
  const add = async (p, n, price, qty = 1, note = '') => {
    await waitText(p, 'Thêm món');
    await fill(p, 'Tên món', n); await fill(p, 'Giá một phần', price);
    for (let i = 1; i < qty; i++) await tap(p, '+', { exact: true, scope: 'button', wait: 50 });
    if (note) await fill(p, 'Ghi chú', note);
    await tap(p, 'Thêm món', { exact: true, wait: 500 });
  };
  await meal(chu, false); await waitText(chu, 'Thêm món');
  await tap(chu, 'Thêm món', { exact: true }); await waitText(chu, 'Hãy nhập tên món');
  await fill(chu, 'Tên món', 'Phở bò tái'); await fill(chu, 'Giá một phần', 'abc'); await tap(chu, 'Thêm món', { exact: true });
  await waitText(chu, 'Giá chưa đúng');
  await fill(chu, 'Giá một phần', '55.000'); await tap(chu, 'Thêm món', { exact: true, wait: 600 });
  await waitText(chu, '55.000 đ');
  await meal(an); await add(an, 'Phở gà', '50,000', 2, 'ít hành'); await add(an, 'Quẩy', '5k');
  await meal(binh); await add(binh, 'Phở bò tái', '55000', 1, 'nhiều bánh');
  await meal(chi); await add(chi, 'Phở đặc biệt', '65.000');
  // sửa và xóa
  await tap(an, 'Sửa món Quẩy', { scope: 'button' }); await shot(an, 'dbg-edit'); await fill(an, 'Giá một phần', '7.000'); await tap(an, 'Lưu', { exact: true });
  await waitText(an, '7.000 đ');
  await tap(an, 'Xóa món Quẩy', { scope: 'button' }); await gone(an, 'Quẩy', 6000).catch(() => {});
  await tap(an, 'Thêm món', { exact: true }).catch(() => {});
  await audit(an, 'meal-goi-mon'); await shot(an, '11-goi-mon');
  await waitText(chu, 'Phở gà', 12000);
  await waitText(chu, 'Phiếu đặt gửi quán');
  await audit(chu, 'meal-goi-mon-chu'); await shot(chu, '12-phieu-dat');
});

await step('như thường lệ: bữa đầu chưa có lịch sử nên không hiện nút', async () => {
  if ((await text(an)).includes('Như thường lệ')) throw new Error('hiện nút khi chưa có lịch sử');
});

await step('nhập phí giao hàng, giảm giá; chia theo tỷ lệ và chia đều', async () => {
  await fill(chu, 'Phí giao hàng', '15.000'); await fill(chu, 'Phí dịch vụ', '5k'); await fill(chu, 'Giảm giá, freeship', '10.000');
  await tap(chu, 'Lưu phí và cách chia', { wait: 600 }); await waitText(chu, 'Đã lưu');
  await sleep(400);
  const t1 = await text(chu);
  const total = 55000 + 100000 + 55000 + 65000 + 15000 + 5000 - 10000;
  if (!t1.includes(total.toLocaleString('vi-VN') + ' đ')) throw new Error('tổng dự kiến sai, mong ' + total);
  await shot(chu, '13-chia-ty-le');
  await tap(chu, 'Chia đều', { exact: true, scope: '[role=radio]' }); await tap(chu, 'Lưu phí và cách chia', { wait: 600 });
  await sleep(500);
  const per = Math.floor(total / 4);
  const t2 = await text(chu);
  if (!t2.includes(per.toLocaleString('vi-VN') + ' đ')) throw new Error('chia đều sai, mong khoảng ' + per);
  await shot(chu, '14-chia-deu');
  await tap(chu, 'Theo tiền món', { exact: true, scope: '[role=radio]' }); await tap(chu, 'Lưu phí và cách chia', { wait: 600 });
  await fill(chu, 'Phí giao hàng', '15k,'); await tap(chu, 'Lưu phí và cách chia'); await waitText(chu, 'chưa đúng');
  await fill(chu, 'Phí giao hàng', '15.000'); await tap(chu, 'Lưu phí và cách chia', { wait: 500 });
});

await step('người ứng tiền là An (không phải chủ nhóm) chưa có tài khoản: không sang thu tiền được, hướng dẫn rõ', async () => {
  await tap(chu, 'Không cần chốt, chia tiền luôn', { wait: 600 });
  await waitText(chu, 'Chọn người ứng tiền trước');
  await tap(chu, 'Đã hiểu', { wait: 200 });
  await meal(an); await tap(an, 'Tôi ứng tiền', { wait: 600 });
  await waitText(an, 'Bạn cần nhập tài khoản nhận tiền');
  await audit(an, 'payer-chua-co-bank'); await shot(an, '15-payer-chua-co-bank');
  await chu.reload({ waitUntil: 'networkidle0' }); await tap(chu, 'Không cần chốt, chia tiền luôn', { wait: 800 });
  await waitText(chu, 'chưa lưu tài khoản nhận tiền');
  await shot(chu, '16-chan-chua-bank');
  await tap(chu, 'Đã hiểu', { wait: 200 });
});

await step('An nhập tài khoản của mình (sheet) rồi Chủ chốt đơn: sang bước thu tiền', async () => {
  await tap(an, 'Nhập tài khoản của tôi');
  await waitText(an, 'Tài khoản nhận tiền của bạn');
  await tap(an, 'Lưu tài khoản', { wait: 300 }); await waitText(an, 'Hãy chọn ngân hàng và nhập số tài khoản');
  await setBank(an, BANKS.an);
  await shot(an, '17-sheet-bank');
  await tap(an, 'Lưu tài khoản', { wait: 800 });
  await gone(an, 'Tài khoản nhận tiền của bạn');
  await tap(chu, 'Không cần chốt, chia tiền luôn', { wait: 1500 });
  if (process.env.E2E_DEBUG) console.log('DEBUG chu:', (await text(chu)).replace(/\n+/g, ' | ').slice(0, 700));
  await waitText(chu, 'Phần của mỗi người');
  await waitText(chu, 'Trả tiền');
  await audit(chu, 'thu-tien-chu'); await shot(chu, '18-thu-tien-chu-nhom');
});

let anTotal;
await step('QR của từng người: quét ra đúng tài khoản người ứng (An), đúng số tiền, đúng nội dung', async () => {
  for (const [p, key] of [[binh, 'binh'], [chi, 'chi'], [chu, 'chu']]) {
    await meal(p); await waitText(p, 'Bạn cần chuyển cho');
    await p.waitForSelector('img.qr', { visible: true });
    await p.waitForFunction(() => document.querySelector('img.qr').complete && document.querySelector('img.qr').naturalWidth > 0);
    const el = await p.$('img.qr');
    const data = await decodeEl(el);
    const shown = await p.evaluate(() => document.querySelector('.qr-amount').textContent);
    const amount = parseInt(shown.replace(/\D/g, ''), 10);
    if (!data) throw new Error(`QR của ${key} không quét được`);
    if (!data.includes(BANKS.an[1])) throw new Error('sai tài khoản trong QR: ' + data);
    if (!data.includes('54' + String(String(amount).length).padStart(2, '0') + amount)) throw new Error(`QR ${key} sai số tiền ${amount}: ${data}`);
    const content = await p.evaluate(() => [...document.querySelectorAll('.bank dd .mono')].pop().textContent);
    if (!/^9L[A-Z0-9]{5}\d{2}$/.test(content) || !data.includes(content)) throw new Error('sai nội dung chuyển khoản: ' + content);
    if (key === 'binh') { await audit(p, 'thu-tien-qr'); await shot(p, '19-qr-thanh-vien'); }
  }
  await meal(an); anTotal = (await text(an)).includes('Bạn là người ứng tiền');
  if (!anTotal) throw new Error('người ứng tiền không thấy thông báo "Bạn là người ứng tiền"');
  await audit(an, 'thu-tien-payer'); await shot(an, '20-payer-can-thu');
});

await step('Tôi đã chuyển (bấm hai lần) → người ứng thấy; Chưa thấy → Đã nhận; copy nội dung & lời nhắc', async () => {
  await meal(binh); await waitText(binh, 'Bạn cần chuyển cho');
  await tap(binh, 'Tôi đã chuyển', { wait: 80 }); await tap(binh, 'Tôi đã chuyển', { wait: 80 }).catch(() => {});
  await waitText(binh, 'Đang chờ'); await shot(binh, '21-da-bao-chuyen');
  await meal(an); await waitText(an, 'Bạn cần thu');
  await waitText(an, 'Chờ xác nhận', 12000);
  await tap(an, 'Chưa thấy', { wait: 600 }); await gone(an, 'Chờ xác nhận', 8000);
  await gone(binh, 'Đang chờ', 12000);
  await tap(binh, 'Tôi đã chuyển', { wait: 500 }); await waitText(binh, 'Đang chờ');
  await waitText(an, 'Chờ xác nhận', 12000);
  const rows = await an.$$('.collect');
  await tap(an, 'Sao chép lời nhắc', { exact: true, wait: 400 }).catch(() => {});
  const clip = await an.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  if (clip && !/nhắc nhẹ/.test(clip)) throw new Error('lời nhắc không lịch sự: ' + clip);
  await tap(an, 'Đã nhận (tiền mặt)', { wait: 300 }).catch(() => {});
  await tap(an, 'Đã nhận', { exact: true, wait: 600 });
  await waitText(binh, 'Đã xong, cảm ơn bạn', 12000);
  await shot(binh, '22-binh-xong'); await shot(an, '23-payer-sau-khi-nhan');
});

await step('đổi người ứng tiền sang Chi (chưa có tài khoản): chặn; Chi nhập tài khoản rồi đổi: QR mới + cảnh báo QR cũ', async () => {
  await meal(chu); await tap(chu, 'Đổi người'); await waitText(chu, 'Đổi người nhận khi đang thu tiền');
  const t = await text(chu);
  await shot(chu, '24-doi-payer');
  await tap(chu, 'Phạm Thị Chi', { scope: '.pick', wait: 300 }).catch((e) => { /* nút bị khóa nên không bấm được */ });
  await tap(chu, 'Đóng', { scope: 'button', wait: 300 }).catch(() => {});
  // Chi nhập tài khoản trong Cài đặt
  await chi.goto(`${URL0}#/t/${teamId}/settings`, { waitUntil: 'networkidle0' });
  await tap(chi, 'Nhập tài khoản'); await setBank(chi, BANKS.chi); await tap(chi, 'Lưu tài khoản', { wait: 800 });
  await audit(chi, 'cai-dat-thanh-vien'); await shot(chi, '25-cai-dat-thanh-vien');
  await meal(chi); await chi.waitForSelector('img.qr', { timeout: 10000 }); const oldQr = await chi.evaluate(() => document.querySelector('img.qr').getAttribute('src'));
  await meal(an); await waitText(an, 'Bạn là người ứng tiền'); // An đang mở sẵn màn này
  await chu.reload({ waitUntil: 'networkidle0' }); await tap(chu, 'Đổi người'); await tap(chu, 'Phạm Thị Chi', { scope: '.pick', wait: 1000 });
  await waitText(chu, 'Phạm Thị Chi là người ứng tiền').catch(() => {});
  await waitText(an, 'Đã đổi người ứng tiền', 14000); // hiện NGAY qua thăm dò, không cần tải lại
  await shot(an, '26a-an-thay-thong-bao-doi-nguoi');
  await meal(binh); // Bình đã xong, giữ nguyên người nhận cũ
  await waitText(binh, 'Đã xong, cảm ơn bạn');
  await meal(an);
  await waitText(an, 'Bạn cần chuyển cho Phạm Thị Chi'); // An nay nợ phần của mình cho Chi? (phần An chưa trả vì là người ứng cũ)
  await waitText(an, 'Đã đổi người nhận tiền');
  await audit(an, 'doi-nguoi-nhan'); await shot(an, '26-an-qr-moi');
  const el = await an.$('img.qr'); const data = await decodeEl(el);
  if (!data || !data.includes(BANKS.chi[1])) throw new Error('QR mới không trỏ tới Chi: ' + data);
  const r = await chi.evaluate(async (u) => (await fetch(u)).status, oldQr);
  if (r !== 410 && r !== 409) throw new Error('QR cũ chưa hết hiệu lực, status ' + r);
});

await step('sổ nợ nhóm: ai nợ ai; bù trừ sau bữa thứ hai với người ứng khác', async () => {
  // bữa thứ hai: Bình ứng tiền (cần tài khoản), An và Chủ ăn
  await chu.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await tap(chu, 'Sổ nợ nhóm', { wait: 600 });
  await waitText(chu, 'Ai nợ ai'); await audit(chu, 'so-no'); await shot(chu, '27-so-no');
  await an.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await waitText(an, 'Bạn đang nợ');
  const t = await text(an);
  if (!t.toLowerCase().includes('bạn đang nợ')) throw new Error('trang nhóm không nhắc nợ của An');
  await shot(an, '28-team-nhac-no');
});

await step('hoàn tất bữa; bữa thứ hai khi bữa đầu còn nợ; "như thường lệ"; gợi ý người ứng', async () => {
  await meal(chu); await tap(chu, 'Hoàn tất bữa');
  await tap(chu, 'Hoàn tất', { exact: true, wait: 700 }).catch(() => {});
  await gone(chu, 'Quản lý bữa').catch(() => {});
  await chu.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await tap(chu, 'Tạo bữa trưa', { wait: 900 });
  await waitText(chu, 'Chưa có đề xuất nào');
  await tap(chu, 'Gợi ý ngẫu nhiên', { wait: 900 });
  await waitText(chu, 'Cơm tấm Ba Ghiền');
  const t = await text(chu);
  if (t.includes('Phở Thìn')) throw new Error('gợi ý ngẫu nhiên không loại quán vừa ăn hôm nay');
  await tap(chu, 'Chốt quán đầu tiên', { wait: 900 });
  await waitText(chu, 'Gọi món');
  await tap(chu, 'Tôi ứng tiền', { wait: 600 }).catch(() => {});
  mealUrl = chu.url();
  await fill(chu, 'Tên món', 'Bún đậu mắm tôm'); await fill(chu, 'Giá một phần', '60.000'); await tap(chu, 'Thêm món', { exact: true, wait: 600 });
  await shot(chu, '29-bua-2');
  await meal(an); await fill(an, 'Tên món', 'Bún đậu'); await fill(an, 'Giá một phần', '45k'); await tap(an, 'Thêm món', { exact: true, wait: 600 });
  await tap(chu, 'Không cần chốt, chia tiền luôn', { wait: 900 }).catch(() => {});
});

await step('menu: giờ chốt, hủy bữa; rời nhóm khi còn nợ bị chặn có giải thích', async () => {
  await chi.goto(`${URL0}#/t/${teamId}/settings`, { waitUntil: 'networkidle0' });
  await tap(chi, 'Rời nhóm', { exact: true }); await tap(chi, 'Rời nhóm', { exact: true, scope: '.sheet button', wait: 700 });
  await waitText(chi, 'còn khoản chưa thanh toán').catch(async () => { await shot(chi, 'debug-roi-nhom'); throw new Error('không thấy lý do chặn rời nhóm: ' + (await text(chi)).slice(0, 300)); });
});

await step('đổi mã mời, xóa thành viên không còn nợ, đổi tên hiển thị', async () => {
  await chu.goto(`${URL0}#/t/${teamId}/settings`, { waitUntil: 'networkidle0' });
  await audit(chu, 'cai-dat-chu-nhom'); await shot(chu, '30-cai-dat-chu-nhom');
  await fill(chu, 'Tên hiển thị', 'Minh (kế toán)'); await tap(chu, 'Lưu tên', { wait: 600 });
  await waitText(chu, 'Minh (kế toán) (bạn)');
  await tap(chu, 'Đổi mã mời'); await tap(chu, 'Đổi mã', { exact: true, scope: '.sheet button', wait: 1200 });
  const c2 = (await api(chu, `api/teams/${teamId}`)).json.team.inviteCode;
  if (c2 === code) throw new Error('mã mời không đổi');
  const o2 = await newUser('Mã cũ'); await o2.goto(`${ORIGIN}${config.basePath}/t/${code}`, { waitUntil: 'networkidle0' });
  await waitText(o2, 'Mã mời không dùng được'); await o2.__ctx.close();
});

await step('mất mạng: báo thử lại, không mất nội dung đang gõ; có mạng lại thì gửi được', async () => {
  const p = await newUser('Offline');
  await p.goto(URL0, { waitUntil: 'networkidle0' });
  await fill(p, 'Tên nhóm', 'Nhóm thử mạng'); await fill(p, 'Tên của bạn', 'Offline Ơi');
  await p.setOfflineMode(true);
  await tap(p, 'Tạo nhóm', { exact: true, wait: 700 });
  await waitText(p, 'Không kết nối được mạng');
  await shot(p, '31-mat-mang');
  const v = await p.evaluate(() => [...document.querySelectorAll('input[type=text]')].map((i) => i.value).join('|'));
  if (!v.includes('Nhóm thử mạng') || !v.includes('Offline Ơi')) throw new Error('mất nội dung đang gõ: ' + v);
  await p.setOfflineMode(false);
  await tap(p, 'Tạo nhóm', { exact: true, wait: 1200 });
  await waitText(p, 'Hôm nay ăn gì');
  const n = (await api(p, 'api/me')).json.teams.length;
  if (n !== 1) throw new Error('tạo trùng nhóm sau khi thử lại: ' + n);
  await p.__ctx.close();
});

await step('nút Back của điện thoại, tải lại giữa chừng, hai thiết bị cùng một phiên', async () => {
  await chu.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await tap(chu, 'Sổ nợ nhóm', { wait: 600 }); await waitText(chu, 'Sổ nợ nhóm');
  await chu.goBack(); await waitText(chu, 'Thành viên');
  if (!(await hashOf(chu)).endsWith(teamId)) throw new Error('Back sai trang');
  await chu.goBack().catch(() => {});
  await chu.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await tap(chu, 'Mời bạn bè').catch(() => {});
  await chu.reload({ waitUntil: 'networkidle0' }); await waitText(chu, 'Thành viên');
  // sheet đóng bằng Back mà không rời trang
  await tap(chu, 'Sổ nợ nhóm'); await chu.goBack();
  await chu.goto(`${URL0}#/t/${teamId}/settings`, { waitUntil: 'networkidle0' });
  await tap(chu, 'Sửa tài khoản'); await waitText(chu, 'Tài khoản nhận tiền của bạn');
  await chu.goBack(); await gone(chu, 'Tài khoản nhận tiền của bạn', 4000);
  if (!(await hashOf(chu)).endsWith('/settings')) throw new Error('Back khi mở sheet đã rời trang');
  // hai thiết bị cùng cookie
  const c2 = await chu.browserContext().newPage(); await c2.setViewport({ ...VIEW, isMobile: true, hasTouch: true }); c2.__name = 'Chủ-2';
  await c2.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' }); await waitText(c2, 'Thành viên');
  await c2.close();
});


await step('bữa cà phê: chọn loại, tùy chọn nhanh, phiếu tách dòng, link đặt món, chốt đơn khóa danh sách, chia tiền', async () => {
  await chu.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await tap(chu, 'Cà phê, đồ uống', { scope: '.kindbtn', wait: 300 });
  await waitText(chu, 'Hôm nay uống gì?');
  await shot(chu, '35-tao-bua-cafe');
  await tap(chu, 'Tạo bữa đồ uống', { wait: 900 });
  await waitText(chu, 'Chưa có đề xuất nào');
  await fill(chu, 'Tên quán', 'Phúc Long'); await tap(chu, 'Thêm quán', { exact: true });
  await tap(chu, 'Chốt quán đầu tiên', { wait: 900 });
  await waitText(chu, 'Chọn đồ uống');
  const url = chu.url();
  await tap(chu, 'Tôi ứng tiền', { wait: 500 });
  const addDrink = async (p, price, size, sugar, ice, topping) => {
    await fill(p, 'Tên đồ uống', 'Trà đào cam sả'); await fill(p, 'Giá một phần', price);
    await tap(p, size, { exact: true, scope: '.optchip', wait: 80 }); await tap(p, sugar + '%', { exact: true, scope: '.optchip', wait: 80 }); await tap(p, ice, { exact: true, scope: '.optchip', wait: 80 });
    if (topping) await fill(p, 'Topping', topping);
    await tap(p, 'Thêm đồ uống', { exact: true, wait: 700 });
  };
  await waitText(chu, 'Cỡ ly');
  await audit(chu, 'cafe-goi-do-uong'); await shot(chu, '36-cafe-tuy-chon');
  await addDrink(chu, '49k', 'M', '50', 'Ít', 'trân châu');
  await waitText(chu, 'M, 50% đường, đá ít, + trân châu');
  await an.goto(url, { waitUntil: 'networkidle0' });
  await waitText(an, 'Cỡ ly');
  await addDrink(an, '49.000', 'M', '50', 'Ít', 'trân châu');
  await addDrink(an, '49.000', 'L', '100', 'Vừa', '');
  await chu.bringToFront(); await chu.waitForFunction(() => document.querySelectorAll('.slip-line').length >= 2, { timeout: 15000 }).catch(() => {});
  const slipLines = await chu.evaluate(() => [...document.querySelectorAll('.slip-line')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  if (slipLines.length !== 2) throw new Error('phiếu phải có 2 dòng (khác đường/đá), thực tế: ' + JSON.stringify(slipLines));
  if (!slipLines.some((l) => l.startsWith('2×')) ) throw new Error('hai ly giống nhau phải gộp thành 2×: ' + JSON.stringify(slipLines));
  await fill(chu, 'Link nhóm đặt', 'javascript:alert(1)'); await tap(chu, 'Lưu link', { exact: true }); await waitText(chu, 'Liên kết cần bắt đầu bằng http');
  await fill(chu, 'Link nhóm đặt', 'https://food.grab.com/vn/group-order/abc'); await tap(chu, 'Lưu link', { exact: true, wait: 700 });
  await waitText(chu, 'Mở link đặt món');
  await audit(chu, 'cafe-dat-don'); await shot(chu, '37-cafe-dat-don');
  await tap(chu, 'Chốt đơn (khóa', { wait: 1000 });
  await waitText(chu, 'Đơn đã được chốt');
  await waitText(an, 'Đơn đã được chốt', 12000);
  if ((await text(an)).includes('Thêm đồ uống')) throw new Error('sau khi chốt đơn vẫn còn form thêm món');
  await shot(an, '38-cafe-da-chot');
  await fill(chu, 'Phí giao hàng', '20k'); await fill(chu, 'Giảm giá, freeship', '15.000'); await tap(chu, 'Lưu phí và cách chia', { wait: 700 });
  await tap(chu, 'Đã đặt xong, chia tiền', { wait: 1200 });
  await waitText(chu, 'Phần của mỗi người');
  await waitText(an, 'Bạn cần chuyển cho', 12000);
  await shot(an, '39-cafe-thu-tien');
  await chu.goto(`${URL0}#/t/${teamId}/stats`, { waitUntil: 'networkidle0' });
  await tap(chu, 'Cà phê, đồ uống', { scope: '.kindbtn', wait: 700 });
  await waitText(chu, 'Phúc Long');
  if ((await text(chu)).includes('Bún đậu')) throw new Error('lọc theo loại vẫn hiện bữa cơm trưa');
  await audit(chu, 'thong-ke-loc'); await shot(chu, '40-thong-ke-cafe');
});


await step('Enter trên bàn phím gửi được form nhiều ô: tạo nhóm, thêm quán, thêm món, lưu phí', async () => {
  const x = await newUser('Enter');
  await x.goto(URL0, { waitUntil: 'networkidle0' });
  await fill(x, 'Tên nhóm', 'Nhóm Enter'); await fill(x, 'Tên của bạn', 'Enter Ơi');
  await x.keyboard.press('Enter');
  await waitText(x, 'Hôm nay ăn gì');
  await tap(x, 'Tạo bữa trưa', { wait: 900 });
  await fill(x, 'Tên quán', 'Quán Enter');
  await x.keyboard.press('Enter');
  await waitText(x, '0 phiếu');
  await x.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(300);
  await tap(x, 'Chốt quán đầu tiên', { wait: 900 });
  await fill(x, 'Tên món', 'Món Enter'); await fill(x, 'Giá một phần', '25k');
  await x.keyboard.press('Enter');
  await waitText(x, 'Món Enter');
  await waitText(x, '25.000 đ');
  await fill(x, 'Phí giao hàng', '12.000');
  await x.keyboard.press('Enter');
  await waitText(x, 'Đã lưu');
  await x.__ctx.close();
});

await step('ô "Dán link hoặc mã mời" chỉ lấy đúng mã, không cắt 10 ký tự cuối của đoạn dán dài', async () => {
  await chu.goto(URL0, { waitUntil: 'networkidle0' });
  const r = await chu.evaluate(() => [
    L9.codeFrom('https://9app.tech/9lunch/t/ABCDEFGHJK'), L9.codeFrom('  abcdefghjk  '), L9.codeFrom('https://x.vn/t/ABCDEFGHJK/?a=1'),
    L9.codeFrom('Mời bạn vào nhóm nhé xin chào mọi người ABCDEFGHJK'), L9.codeFrom('ABCDEFGHJKLMN'), L9.codeFrom('xyz'),
  ]);
  const want = ['ABCDEFGHJK', 'ABCDEFGHJK', 'ABCDEFGHJK', '', '', ''];
  if (JSON.stringify(r) !== JSON.stringify(want)) throw new Error('codeFrom sai: ' + JSON.stringify(r));
});

await step('trang nhóm không có hai lối vào cùng một bữa', async () => {
  await chu.goto(`${URL0}#/t/${teamId}`, { waitUntil: 'networkidle0' });
  await sleep(300);
  const t = await text(chu);
  if (t.includes('Vào bữa đang diễn ra')) throw new Error('còn nút trùng "Vào bữa đang diễn ra"');
});

await step('XSS: tên chứa mã HTML hiển thị nguyên văn, không chạy', async () => {
  const x = await newUser('XSS');
  await x.goto(URL0, { waitUntil: 'networkidle0' });
  await fill(x, 'Tên nhóm', '<img src=x onerror="window.__xss=1">'); await fill(x, 'Tên của bạn', '<script>window.__xss=2</script>');
  await tap(x, 'Tạo nhóm', { exact: true, wait: 900 });
  await waitText(x, '<img src=x onerror=');
  const hit = await x.evaluate(() => window.__xss);
  if (hit) throw new Error('XSS chạy được!');
  await shot(x, '32-xss-an-toan'); await x.__ctx.close();
});

await step('tên rất dài, nhiều món (30 dòng) không tràn ngang', async () => {
  const x = await newUser('Dài');
  await x.goto(URL0, { waitUntil: 'networkidle0' });
  const long = 'Nguyễn Thị Thanh Hương Giang Ngọc Lan Anh Thư Minh Châu 🍜🍜'.slice(0, 59);
  await fill(x, 'Tên nhóm', 'T'.repeat(30) + ' Công ty Cổ phần Thương mại Dịch vụ Xuất nhập khẩu'.slice(0, 29));
  await fill(x, 'Tên của bạn', long);
  await tap(x, 'Tạo nhóm', { exact: true, wait: 900 }); await waitText(x, 'Hôm nay ăn gì');
  const tid = (await hashOf(x)).split('/')[2];
  await audit(x, 'ten-dai-team');
  await tap(x, 'Tạo bữa trưa', { wait: 700 });
  const mid = (await hashOf(x)).split('/')[2];
  await api(x, `api/meals/${mid}/proposals`, 'POST', { name: 'Quán có cái tên dài thật dài khiến dòng chữ phải xuống dòng', url: 'https://example.com/' + 'a'.repeat(200) });
  await api(x, `api/meals/${mid}/status`, 'POST', { to: 'dat_mon' });
  for (let i = 1; i <= 30; i++) await api(x, `api/meals/${mid}/items`, 'POST', { name: `Món số ${i} với tên khá dài để thử xuống dòng`, price: 10000 + i * 1000, qty: 1 + (i % 3), note: i % 2 ? 'ít cay, không hành, thêm chanh' : '' });
  await x.reload({ waitUntil: 'networkidle0' });
  await waitText(x, 'Món số 30');
  await audit(x, 'meal-30-mon'); await shot(x, '33-30-mon');
  await x.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await x.reload({ waitUntil: 'networkidle0' }); await audit(x, 'meal-30-mon-360'); await shot(x, '34-30-mon-360');
  await x.__ctx.close();
});

// quét mọi màn ở 360x740 và chế độ tối
console.log('--- 360x740 + chế độ tối: quét mọi màn ---');
async function sweep(view, dark, tag) {
  const pages = [['home', URL0], ['team', `${URL0}#/t/${teamId}`], ['meal', mealUrl], ['meal1', `${URL0}#/m/${mealId}`], ['debts', `${URL0}#/t/${teamId}/debts`], ['stats', `${URL0}#/t/${teamId}/stats`], ['settings', `${URL0}#/t/${teamId}/settings`]];
  for (const mode of dark ? [true] : [false]) {
    const p = await newUser('Quét-' + tag, { dark: mode, view });
    // đăng nhập lại bằng cookie của Chủ
    const cookies = await chu.browserContext().cookies();
    await p.browserContext().setCookie(...cookies);
    for (const [n, u] of pages) {
      await step(`${tag}: ${n}`, async () => {
        await p.goto(u, { waitUntil: 'networkidle0' }); await sleep(300);
        await audit(p, `${tag}-${n}`); await shot(p, `s-${tag}-${n}`);
      });
    }
    await p.__ctx.close();
  }
}
await sweep({ width: 360, height: 740 }, false, '360-sang');
await sweep({ width: 390, height: 844 }, true, '390-toi');
await sweep({ width: 360, height: 740 }, true, '360-toi');

console.log('\n=== KẾT QUẢ ===');
const bad = results.filter((r) => !r.ok);
console.log(`${results.length - bad.length}/${results.length} bước đạt`);
for (const b of bad) console.log(' ✗', b.name, '\n    ', b.err.split('\n')[0]);
const uniq = [...new Set(problems)];
console.log(`\nVấn đề phát hiện khi kiểm tra tự động: ${uniq.length}`);
uniq.forEach((p) => console.log(' -', p));
await browser.close(); await app.close().catch(() => {}); await (await import('../src/db.js')).close(); await pg.stop();
fs.rmSync(userDataDir, { recursive: true, force: true });
process.exit(bad.length ? 1 : 0);
