// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): điện thoại 390x844 và 360x740, máy tính 1280x800, sáng và tối.
// Chạy: node scripts/e2e.js   (tự dựng PostgreSQL nhúng + server ở cổng ngẫu nhiên). Ảnh chụp lưu ở shots/.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

const pg = await startEmbedded({ database: 'tutor_e2e' });
process.env.DATABASE_URL = pg.url;
process.env.TUTORS_PER_IP_HOUR = '1000000'; process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000'; process.env.RECOVER_PER_IP_HOUR = '1000000';
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
config.port = 0;
const app = await start();
const port = app.server.address().port;
const ORIGIN = `http://127.0.0.1:${port}`;
const URL0 = `${ORIGIN}${config.basePath}/`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9tutor-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const results = []; const problems = [];
const MOBILE = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastPage = null;

async function newUser(name, { dark = false, view = MOBILE, desktop = false } = {}) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(ORIGIN, ['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: desktop ? 1 : 2, isMobile: !desktop, hasTouch: !desktop });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.__name = name; page.__ctx = ctx;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText?.includes('ERR_ABORTED')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  return page;
}

async function find(page, text, scope = 'button, a, [role=radio]', exact = false) {
  lastPage = page;
  await page.bringToFront();
  let h = null;
  for (let tries = 0; tries < 40; tries++) {
    h = await page.evaluateHandle((text, scope, exact) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      return pool.find((e) => { const t = norm(e.textContent) || ''; const a = e.getAttribute('aria-label') || ''; return exact ? (t === text || a === text) : (t.includes(text) || a.includes(text)); }) || null;
    }, text, scope, exact);
    if (h.asElement()) break;
    await sleep(250);
  }
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy "${text}" trên màn hình`);
  return el;
}
async function tap(page, text, o = {}) {
  if (!/Hoàn tác/.test(text)) await page.waitForFunction(() => { const t = document.getElementById('toast'); return !t || t.classList.contains('hidden') || !t.classList.contains('act'); }, { timeout: 12000 }).catch(() => {});
  // trang tự làm mới định kỳ có thể thay phần tử giữa lúc tìm và bấm: tìm lại và bấm lại tối đa 4 lần
  for (let attempt = 0; ; attempt++) {
    try {
      const el = await find(page, text, o.scope, o.exact);
      await el.evaluate((e) => { if (!e.closest('.sheet')) e.scrollIntoView({ block: 'center' }); else e.scrollIntoView({ block: 'nearest' }); });
      await sleep(60);
      await el.click();
      break;
    } catch (err) {
      if (attempt >= 3 || !/not clickable|detached|Execution context|not an Element/.test(err.message)) throw err;
      await sleep(400);
    }
  }
  await sleep(o.wait ?? 300);
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
    const sheet = [...document.querySelectorAll('.sheet')].pop();
    const labs = [...document.querySelectorAll('label')].filter((l) => !sheet || sheet.contains(l));
    const lab = labs.find((l) => norm(l.textContent).startsWith(label) && l.getBoundingClientRect().width > 0);
    return lab ? document.getElementById(lab.getAttribute('for')) : null;
  }, label);
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  if (o.select) { await el.select(value); return; }
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (value) await el.type(value, { delay: 0 });
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, t, timeout = 15000) {
  await page.bringToFront();
  try { await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t); } catch { throw new Error(`[${page.__name}] chờ không thấy chữ "${t}". Màn hình hiện: ${(await text(page)).slice(0, 400).replace(/\n+/g, ' | ')}`); }
}
async function gone(page, t, timeout = 15000) { await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, t); }
async function shot(page, name) { await sleep(200); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const hashOf = (page) => page.evaluate(() => location.hash);
const api = (page, p, method = 'GET', body) => page.evaluate(async (p, method, body) => {
  const r = await fetch(new URL(p, document.baseURI), { method, headers: { 'X-Requested-With': '9tutor', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, p, method, body);
// Giải mã QR của một thẻ <img> bằng cách vẽ nó lên canvas (không phụ thuộc cuộn trang / ảnh chụp phần tử)
const decodeImg = async (page, selector) => {
  const b64 = await page.evaluate(async (sel) => {
    const img = document.querySelector(sel);
    if (!img.complete) await new Promise((r) => { img.onload = r; });
    const c = document.createElement('canvas'); c.width = 600; c.height = 600;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 600); x.drawImage(img, 0, 0, 600, 600);
    return c.toDataURL('image/png').split(',')[1];
  }, selector);
  const png = PNG.sync.read(Buffer.from(b64, 'base64'));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
};

// kiểm tra từng màn: không tràn ngang, vùng bấm đủ lớn, chữ không quá nhỏ, ảnh có alt, ô nhập có nhãn
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const out = { overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1, small: [], tiny: [], noalt: 0, inputsNoLabel: [], wide: [] };
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    for (const e of document.querySelectorAll('button, a.btn, a.tab, input, select, textarea, [role=radio]')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if ((r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'INPUT' && e.type === 'checkbox')) out.small.push(`${e.tagName}.${e.className}:"${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (e.tagName === 'INPUT' && !e.labels?.length && !e.getAttribute('aria-label') && e.type !== 'checkbox') out.inputsNoLabel.push(e.placeholder || e.type);
      if (e.tagName === 'TEXTAREA' && !e.labels?.length && !e.getAttribute('aria-label')) out.inputsNoLabel.push('textarea ' + (e.placeholder || ''));
    }
    for (const e of document.querySelectorAll('body *')) {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!vis(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 13.5) out.tiny.push(`${e.tagName}.${e.className} ${fs}px "${e.textContent.trim().slice(0, 20)}"`);
    }
    for (const i of document.querySelectorAll('img')) if (!i.hasAttribute('alt')) out.noalt++;
    out.wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.sheet-back, .toast')).slice(0, 4).map((e) => e.tagName + '.' + e.className);
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
  catch (e) {
    results.push({ name, ok: false, err: e.message });
    if (lastPage) await lastPage.screenshot({ path: path.join(SHOTS, 'fail-' + results.length + '.png') }).catch(() => {});
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`);
  }
}
// chờ một điều kiện (hàm chạy ở Node) đúng, thay cho sleep cố định
async function until(fn, msg, timeout = 15000) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) { try { last = await fn(); if (last) return last; } catch (err) { last = err; } await sleep(250); }
  throw new Error('quá thời gian chờ: ' + msg + (last instanceof Error ? ' (' + last.message + ')' : ''));
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ============================================================================
let t, today, recoveryCode, studentId, reportToken, pairLink;
const dowIso = (d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DOW = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const vnd = (n) => n.toLocaleString('vi-VN') + ' đ';

console.log('--- 390x844, chế độ sáng ---');
await step('trang chào: có thiết kế rõ, không tràn, không lỗi', async () => {
  t = await newUser('Gia sư');
  await t.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(t, 'Sổ dạy kèm gọn trong túi');
  await audit(t, 'chao'); await shot(t, '01-chao');
});

await step('tạo tài khoản: bắt buộc chọn tình trạng; giáo viên công thấy cảnh báo pháp lý; sinh viên thấy nhắc nhở', async () => {
  await tap(t, 'Bắt đầu, không cần đăng ký');
  await waitText(t, 'Tên hiển thị');
  await tap(t, 'Tạo tài khoản', { exact: true, scope: 'button' });
  await waitText(t, 'Hãy nhập tên hiển thị');
  await fill(t, 'Tên hiển thị', 'Cô Lan Hương 📚');
  await tap(t, 'Tạo tài khoản', { exact: true, scope: 'button' });
  await waitText(t, 'Hãy chọn tình trạng');
  await tap(t, 'Giáo viên trường công lập');
  await waitText(t, 'chính học sinh mình đang dạy chính khóa');
  await audit(t, 'onboard-gvcong'); await shot(t, '02-onboard-gv-cong-canh-bao');
  await tap(t, 'Sinh viên');
  await waitText(t, 'có thể phải đăng ký kinh doanh');
  await tap(t, 'Tạo tài khoản', { exact: true, scope: 'button' });
  await waitText(t, 'Hãy tích vào ô xác nhận');
  await t.click('#agree');
  await audit(t, 'onboard'); await shot(t, '03-onboard');
  await tap(t, 'Tạo tài khoản', { exact: true, scope: 'button', wait: 900 });
  await waitText(t, 'Lưu mã này ngay');
  recoveryCode = (await t.evaluate(() => [...document.querySelectorAll('.reccode span')].map((s) => s.textContent).join('-')));
  expect(/^([A-HJ-NP-Z2-9]{5}-){4}[A-HJ-NP-Z2-9]{5}$/.test(recoveryCode), 'mã khôi phục sai định dạng: ' + recoveryCode);
  await tap(t, 'Sao chép', { exact: true, scope: 'button', wait: 400 }); await waitText(t, 'Đã sao chép mã khôi phục');
  await tap(t, 'Tải về (.txt)', { scope: 'button', wait: 600 });
  await audit(t, 'ma-khoi-phuc'); await shot(t, '04-ma-khoi-phuc');
  const btn = await find(t, 'Vào ứng dụng', 'button');
  expect(await btn.evaluate((b) => b.disabled), 'nút vào phải khóa tới khi tích đã lưu');
  await t.click('#saved'); await tap(t, 'Vào ứng dụng', { wait: 900 });
  await waitText(t, 'Thêm học sinh đầu tiên');
  today = (await api(t, 'api/me')).json.me.today;
  await audit(t, 'hom-nay-trong'); await shot(t, '05-hom-nay-trong');
});

await step('cài đặt: lưu tài khoản nhận học phí, cảnh báo pháp lý theo tình trạng', async () => {
  await tap(t, 'Cài đặt', { scope: 'a.tab' });
  await waitText(t, 'Tài khoản nhận học phí');
  await fill(t, 'Ngân hàng', '970436', { select: true });
  await fill(t, 'Số tài khoản', '0011004012345'); await fill(t, 'Tên chủ tài khoản', 'NGUYEN THI LAN HUONG');
  await tap(t, 'Lưu tài khoản', { wait: 700 });
  await waitText(t, 'Đã lưu tài khoản nhận học phí');
  expect((await text(t)).includes('Nhắc nhở'), 'thiếu nhắc nhở pháp lý cho sinh viên');
  await audit(t, 'cai-dat'); await shot(t, '06-cai-dat');
});

await step('thêm học sinh: form hiện lỗi rõ, lưu xong vào hồ sơ', async () => {
  await tap(t, 'Hôm nay', { scope: 'a.tab' });
  await tap(t, 'Thêm học sinh', { scope: 'button', wait: 500 });
  await waitText(t, 'Cách tính học phí');
  await tap(t, 'Thêm học sinh', { exact: true, scope: '.sheet button' });
  await waitText(t, 'Hãy nhập tên học sinh');
  await fill(t, 'Tên học sinh', 'Nguyễn Minh Anh');
  await fill(t, 'Lớp', 'Lớp 9', { select: true });
  await fill(t, 'Môn', 'Toán');
  await fill(t, 'Phụ huynh', 'Chị Hoa'); await fill(t, 'Số điện thoại phụ huynh', '0912 345 678');
  await fill(t, 'Học phí mỗi buổi', 'abc');
  await tap(t, 'Thêm học sinh', { exact: true, scope: '.sheet button' });
  await waitText(t, 'Học phí chưa đúng');
  await fill(t, 'Học phí mỗi buổi', '200k');
  await audit(t, 'form-hoc-sinh'); await shot(t, '07-form-hoc-sinh');
  await tap(t, 'Thêm học sinh', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(t, 'Lịch dạy hằng tuần');
  studentId = (await hashOf(t)).split('/')[2];
  await waitText(t, '200.000 đ mỗi buổi');
  await audit(t, 'ho-so-hoc-sinh'); await shot(t, '08-ho-so-hoc-sinh');
});

await step('lịch lặp hôm nay lúc 06:00 xuất hiện ở Hôm nay; điểm danh một chạm, hoàn tác được', async () => {
  await tap(t, 'Thêm', { exact: true, scope: 'button' });
  await waitText(t, 'Thêm lịch dạy hằng tuần');
  await tap(t, DOW[dowIso(today)], { exact: true, scope: '.sheet button' });
  await t.$eval('.sheet input[type=time]', (el) => { el.value = '06:00'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await tap(t, 'Thêm lịch', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(t, 'Đã thêm lịch');
  await tap(t, 'Hôm nay', { scope: 'a.tab' });
  await waitText(t, 'Nguyễn Minh Anh');
  await audit(t, 'hom-nay-co-buoi'); await shot(t, '09-hom-nay-co-buoi');
  await tap(t, 'Điểm danh đã dạy', { scope: 'button', wait: 700 });
  await waitText(t, 'Hoàn tác'); await shot(t, '10-diem-danh-hoan-tac');
  await waitText(t, 'Đã dạy');
  const owed = (await api(t, `api/students/${studentId}`)).json.student.balance;
  expect(owed === 200000, 'còn nợ phải 200000, thực tế ' + owed);
  await tap(t, 'Hoàn tác', { scope: 'button', wait: 700 });
  await waitText(t, 'Chưa dạy', 3000).catch(() => {});
  expect((await api(t, `api/students/${studentId}`)).json.student.balance === 0, 'hoàn tác phải trả nợ về 0');
  await tap(t, 'Điểm danh đã dạy', { scope: 'button', wait: 700 });
  await waitText(t, 'Đã dạy');
});

await step('báo trùng giờ khi xếp học sinh thứ hai cùng giờ; hủy hoặc vẫn xếp trùng có chủ ý', async () => {
  expect((await api(t, 'api/students', 'POST', { name: 'Trần Bảo Ngọc', grade: 'Lớp 7', subject: 'Văn', feeModel: 'thang', feeAmount: 1500000 })).status === 200, 'tạo học sinh thứ hai thất bại');
  await tap(t, 'Lịch', { scope: 'a.tab', wait: 600 });
  await waitText(t, 'Tuần này');
  await tap(t, 'Thêm buổi học', { scope: 'button' });
  await waitText(t, 'Thêm buổi học');
  const ngoc = await until(async () => (await api(t, 'api/students')).json.students.find((s) => s.name === 'Trần Bảo Ngọc'), 'học sinh Trần Bảo Ngọc có trong danh sách');
  await fill(t, 'Học sinh', ngoc.id, { select: true });
  await t.$eval('.sheet input[type=time]', (el) => { el.value = '06:30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await tap(t, 'Thêm vào lịch', { exact: true, scope: '.sheet button', wait: 700 });
  await waitText(t, 'Trùng giờ');
  await audit(t, 'trung-gio'); await shot(t, '11-bao-trung-gio');
  await tap(t, 'Quay lại', { exact: true, scope: '.sheet button', wait: 400 });
  const n0 = (await api(t, `api/week?from=${today}&days=1`)).json.lessons.length;
  expect(n0 === 1, 'chưa xếp trùng thì chỉ có 1 buổi, thực tế ' + n0);
  await tap(t, 'Thêm vào lịch', { exact: true, scope: '.sheet button', wait: 700 });
  await tap(t, 'Vẫn xếp trùng', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(t, 'Đã thêm buổi học');
  const wk = await until(async () => { const l = (await api(t, `api/week?from=${today}&days=1`)).json.lessons; return l.length === 2 ? l : null; }, 'có 2 buổi sau khi xếp trùng');
  expect(wk.every((l) => l.overlap), 'hai buổi phải đều gắn cờ trùng');
  await waitText(t, 'Trùng giờ'); await shot(t, '12-lich-tuan-trung-gio');
  await api(t, `api/lessons/${wk.find((l) => l.studentName === 'Trần Bảo Ngọc').id}`, 'DELETE');
});

await step('chi tiết buổi: nhật ký, mức tiếp thu; học sinh nghỉ không tính phí; xếp buổi bù', async () => {
  await tap(t, 'Hôm nay', { scope: 'a.tab', wait: 600 });
  await tap(t, 'Mở buổi học của Nguyễn Minh Anh', { scope: 'button' });
  await waitText(t, 'Nhật ký buổi học');
  await fill(t, 'Nội dung', 'Hệ phương trình bậc nhất hai ẩn');
  await fill(t, 'Bài tập giao', 'Bài 4, 5 trang 22');
  await fill(t, 'Nhận xét', 'Bé hiểu bài, cần luyện thêm dạng có tham số.');
  await tap(t, 'Tốt', { exact: true, scope: '.sheet button' });
  await fill(t, 'Ghi chú riêng', 'GHI CHÚ RIÊNG KHÔNG ĐƯỢC LỘ');
  await audit(t, 'chi-tiet-buoi'); await shot(t, '13-chi-tiet-buoi');
  await tap(t, 'Lưu nhật ký', { exact: true, scope: '.sheet button', wait: 700 });
  await waitText(t, 'Đã lưu nhật ký');
  await tap(t, 'Đóng', { scope: '.sheet button', wait: 400 });
  // một buổi lẻ hôm qua: học sinh nghỉ
  const sid = (await until(async () => (await api(t, 'api/students')).json.students.find((s) => s.name === 'Nguyễn Minh Anh'), 'có học sinh Nguyễn Minh Anh')).id;
  const l = (await api(t, 'api/lessons', 'POST', { studentId: sid, day: addDays(today, -1), startMin: 1020, durationMin: 60 })).json.lesson;
  expect(!!l, 'tạo buổi hôm qua thất bại');
  await t.goto(URL0 + '#/', { waitUntil: 'networkidle0' }); await t.reload({ waitUntil: 'networkidle0' });
  await waitText(t, 'Chưa điểm danh (1)');
  await tap(t, 'Mở buổi học của Nguyễn Minh Anh', { scope: '.daywrap button', wait: 500 });
  await tap(t, 'HS nghỉ', { exact: true, scope: '.sheet button', wait: 500 });
  await waitText(t, 'Có tính học phí buổi này không');
  await shot(t, '14-hoi-tinh-phi');
  await tap(t, 'Không tính (sẽ dạy bù)', { scope: '.sheet button', wait: 700 });
  await waitText(t, 'Xếp buổi bù');
  await tap(t, 'Xếp buổi bù', { exact: true, scope: '.sheet button', wait: 500 });
  await shot(t, '15-xep-bu');
  await tap(t, 'Xếp buổi bù', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(t, 'Đã xếp buổi bù');
  const bal = (await api(t, `api/students/${sid}`)).json.student.balance;
  expect(bal === 200000, 'chỉ buổi đã dạy hôm nay tính phí: ' + bal);
  await t.keyboard.press('Escape'); await sleep(400);
});

await step('thu tiền một phần; nhắc phụ huynh có tin soạn sẵn, QR VietQR quét ra đúng số tiền', async () => {
  await t.goto(URL0 + '#/hs/' + studentId, { waitUntil: 'networkidle0' });
  await waitText(t, 'Nhắc phụ huynh');
  await tap(t, 'Thu tiền', { exact: true, scope: 'button', wait: 500 });
  await waitText(t, 'Thu đủ');
  await shot(t, '16-thu-tien');
  await fill(t, 'Số tiền', '50k');
  await tap(t, 'Ghi khoản đã thu', { scope: '.sheet button', wait: 900 });
  await waitText(t, 'còn 150.000 đ');
  await sleep(500);
  await tap(t, 'Nhắc phụ huynh', { exact: true, scope: 'button', wait: 900 });
  await waitText(t, 'Mã QR chuyển khoản');
  const msg = await t.$eval('.sheet textarea', (x) => x.value);
  expect(msg.includes('150.000đ') && msg.includes('0011004012345') && msg.includes('Vietcombank') && /9T[A-Z0-9]{6}/.test(msg), 'tin nhắn thiếu thông tin: ' + msg);
  await t.waitForFunction(() => { const i = document.querySelector('.sheet img.qr'); return i && i.complete && i.naturalWidth > 0; }, { timeout: 5000 });
  const data = await decodeImg(t, '.sheet img.qr');
  expect(data && data.includes('5406150000') && data.includes('0011004012345'), 'QR quét ra sai: ' + data);
  await audit(t, 'nhac-phu-huynh'); await shot(t, '17-nhac-phu-huynh-qr');
  const zl = await t.$eval('.sheet a[href^="https://zalo.me/"]', (a) => a.href);
  expect(zl === 'https://zalo.me/84912345678', 'liên kết Zalo sai: ' + zl);
  await t.keyboard.press('Escape'); await sleep(400);
});

await step('liên kết báo cáo phụ huynh: công khai không cần đăng nhập, không lộ SĐT / ghi chú riêng / học phí', async () => {
  await t.goto(URL0 + '#/hs/' + studentId, { waitUntil: 'networkidle0' });
  await tap(t, 'Tạo liên kết', { exact: true, scope: 'button', wait: 500 });
  await tap(t, 'Tạo liên kết', { exact: true, scope: '.sheet button', wait: 900 });
  await waitText(t, 'Sao chép liên kết');
  reportToken = (await t.$eval('.sheet input[readonly]', (i) => i.value)).split('/r/')[1];
  expect(/^[A-Za-z0-9_-]{22}$/.test(reportToken), 'mã link sai');
  await shot(t, '18-tao-link');
  await t.keyboard.press('Escape'); await sleep(300);
  const p = await newUser('Phụ huynh');
  await p.goto(`${ORIGIN}${config.basePath}/r/${reportToken}`, { waitUntil: 'networkidle0' });
  await waitText(p, 'Nguyễn Minh Anh');
  await waitText(p, 'Hệ phương trình bậc nhất hai ẩn');
  const tx = await text(p);
  expect(!tx.includes('0912') && !tx.includes('GHI CHÚ RIÊNG') && !tx.includes('Trần Bảo Ngọc') && !tx.includes('Học phí') && !tx.includes('0011004012345'), 'trang công khai lộ dữ liệu không phù hợp');
  expect(tx.includes('Bài 4, 5 trang 22') && tx.includes('Bé hiểu bài'), 'thiếu nhật ký');
  expect((await p.evaluate(() => document.querySelector('meta[name=robots]')?.content)) === 'noindex,nofollow', 'thiếu meta noindex');
  await audit(p, 'bao-cao-phu-huynh'); await shot(p, '19-bao-cao-phu-huynh');
  p.__page = p; t.__parent = p;
  // bật hiện học phí rồi tải lại
  await api(t, `api/students/${studentId}/link`, 'POST', { showFee: true });
  await p.reload({ waitUntil: 'networkidle0' });
  await waitText(p, 'Mã QR', 3000).catch(() => {});
  await waitText(p, '0011004012345');
  await p.waitForFunction(() => { const i = document.querySelector('img.qr'); return i && i.complete && i.naturalWidth > 0; }, { timeout: 5000 });
  const d = await decodeImg(p, 'img.qr');
  expect(d && d.includes('5406150000'), 'QR công khai sai: ' + d);
  await audit(p, 'bao-cao-co-hoc-phi'); await shot(p, '20-bao-cao-co-hoc-phi');
  // in / PDF
  await p.emulateMediaType('print');
  await p.pdf({ path: path.join(SHOTS, 'bao-cao-phu-huynh.pdf'), format: 'A4', printBackground: true });
  await shot(p, '21-bao-cao-che-do-in');
  await p.emulateMediaType('screen');
  // thu hồi
  await api(t, `api/students/${studentId}/link`, 'DELETE');
  await p.reload({ waitUntil: 'networkidle0' });
  await waitText(p, 'Liên kết không còn hiệu lực');
  expect(!(await text(p)).includes('Nguyễn Minh Anh'), 'link đã thu hồi vẫn lộ tên');
  await shot(p, '22-link-het-hieu-luc');
  await p.__ctx.close();
});

await step('màn Tiền: báo cáo tháng, xu hướng, người còn nợ, bản in / PDF', async () => {
  await t.goto(URL0 + '#/tien', { waitUntil: 'networkidle0' });
  await waitText(t, 'Người còn nợ');
  await waitText(t, '6 tháng gần nhất');
  const tx = await text(t);
  expect(tx.includes('50.000 đ') && tx.includes('Nguyễn Minh Anh'), 'báo cáo thiếu số liệu');
  await audit(t, 'tien'); await shot(t, '23-tien');
  await t.emulateMediaType('print');
  await t.pdf({ path: path.join(SHOTS, 'bao-cao-thu-nhap.pdf'), format: 'A4', printBackground: true });
  await t.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 }); // gần với khổ A4 để xem bố cục bản in
  await sleep(300);
  const printBg = await t.evaluate(() => getComputedStyle(document.body).backgroundColor + '|' + getComputedStyle(document.querySelector('.card')).backgroundColor);
  expect(printBg === 'rgb(255, 255, 255)|rgb(255, 255, 255)', 'bản in phải nền trắng, thực tế ' + printBg);
  await shot(t, '24-tien-che-do-in');
  await t.setViewport({ ...MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await t.emulateMediaType('screen');
  await tap(t, 'Tạo học phí tháng này', { scope: 'button', wait: 400 });
  await tap(t, 'Tạo', { exact: true, scope: '.sheet button', wait: 800 });
  await waitText(t, 'Đã tạo 1 khoản học phí');
});

await step('học sinh: danh sách, tìm kiếm, lưu trữ, khôi phục', async () => {
  for (let i = 0; i < 8; i++) await api(t, 'api/students', 'POST', { name: 'Học sinh ' + i, feeModel: 'buoi', feeAmount: 100000 });
  await tap(t, 'Học sinh', { scope: 'a.tab', wait: 700 });
  await waitText(t, 'Học sinh 7');
  await audit(t, 'danh-sach-hs'); await shot(t, '25-danh-sach-hoc-sinh');
  await t.type('input.search', 'ngoc'); await sleep(300);
  const tx = await text(t);
  expect(tx.includes('Trần Bảo Ngọc') && !tx.includes('Học sinh 3'), 'tìm kiếm không dấu phải lọc đúng');
});

await step('thiết bị: tạo mã ghép, máy thứ hai mở link ghép và vào cùng tài khoản; thu hồi', async () => {
  await t.goto(URL0 + '#/thiet-bi', { waitUntil: 'networkidle0' });
  await tap(t, 'Tạo mã ghép', { scope: 'button', wait: 800 });
  await waitText(t, 'Mã ghép thiết bị');
  const code = await t.evaluate(() => [...document.querySelectorAll('.sheet .reccode span')].map((s) => s.textContent).join(''));
  pairLink = `${ORIGIN}${config.basePath}/#/ghep/${code}`;
  await shot(t, '26-ma-ghep');
  await t.keyboard.press('Escape'); await sleep(300);
  const u2 = await newUser('Máy 2');
  await u2.goto(pairLink, { waitUntil: 'networkidle0' });
  await waitText(u2, 'Mở sổ dạy kèm trên máy này');
  await waitText(u2, 'Tài khoản sẽ được mở'); await waitText(u2, 'Cô Lan Hương');
  await shot(u2, '27-ghep-xac-nhan');
  await waitText(u2, 'học sinh đang dạy · tạo ngày');
  await tap(u2, 'Ghép thiết bị này', { exact: true, scope: 'button', wait: 600 });
  await waitText(u2, 'Xác nhận lần cuối'); await shot(u2, '27b-ghep-xac-nhan-lan-cuoi');
  await tap(u2, 'Đúng, ghép', { exact: true, scope: '.sheet button', wait: 1000 });
  await waitText(u2, 'Xin chào Cô Lan Hương');
  const used = await newUser('Máy 3');
  await used.goto(pairLink, { waitUntil: 'networkidle0' });
  await waitText(used, 'không đúng hoặc đã hết hạn');
  await used.__ctx.close();
  await t.reload({ waitUntil: 'networkidle0' });
  await waitText(t, 'Đang đăng nhập (2)');
  await tap(t, 'Thu hồi', { exact: true, scope: 'button', wait: 800 });
  await waitText(t, 'Đang đăng nhập (1)');
  await u2.reload({ waitUntil: 'networkidle0' });
  await waitText(u2, 'Sổ dạy kèm gọn trong túi');
  await u2.__ctx.close();
});

await step('khôi phục bằng mã trên máy mới; mã sai báo rõ', async () => {
  const u = await newUser('Máy khôi phục');
  await u.goto(URL0 + '#/khoi-phuc', { waitUntil: 'networkidle0' });
  await fill(u, 'Mã khôi phục', 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA');
  await tap(u, 'Mở sổ của tôi', { scope: 'button', wait: 700 });
  await waitText(u, 'Mã khôi phục không đúng');
  await audit(u, 'khoi-phuc'); await shot(u, '28-khoi-phuc-sai');
  await fill(u, 'Mã khôi phục', recoveryCode.toLowerCase());
  await tap(u, 'Mở sổ của tôi', { scope: 'button', wait: 1000 });
  await waitText(u, 'Xin chào Cô Lan Hương');
  expect((await api(u, 'api/students')).json.students.some((s) => s.name === 'Nguyễn Minh Anh'), 'thiếu dữ liệu sau khôi phục');
  await u.__ctx.close();
});

await step('trang giới thiệu gia sư: bật, xem công khai; đổi sang giáo viên công thì tự khóa', async () => {
  await t.goto(URL0 + '#/gioi-thieu', { waitUntil: 'networkidle0' });
  await waitText(t, 'Trang tự giới thiệu');
  await t.click('#pe');
  await tap(t, 'Lưu', { exact: true, scope: 'button', wait: 700 });
  await waitText(t, 'Hãy điền tiêu đề');
  await fill(t, 'Tiêu đề ngắn', 'Gia sư Toán Văn lớp 6 đến 9, 3 năm kinh nghiệm');
  await fill(t, 'Giới thiệu', 'Dạy kiên nhẫn, có giáo án riêng cho từng em.\nNhận nhóm nhỏ 2 đến 3 bạn.');
  await fill(t, 'Môn dạy', 'Toán, Ngữ văn'); await fill(t, 'Cấp lớp', 'Lớp 6 đến lớp 9'); await fill(t, 'Khu vực', 'Quận Cầu Giấy, Hà Nội');
  await fill(t, 'Giá từ', '150k'); await fill(t, 'Đến', '250k'); await fill(t, 'Cách liên hệ', 'Zalo 0901 234 567');
  await audit(t, 'gioi-thieu-form'); await shot(t, '29-gioi-thieu-form');
  await tap(t, 'Lưu', { exact: true, scope: 'button', wait: 900 });
  await waitText(t, 'Liên kết của bạn');
  const url = await t.$eval('input[aria-label="Liên kết trang giới thiệu"]', (i) => i.value);
  const p = await newUser('Người xem hồ sơ');
  await p.goto(url, { waitUntil: 'networkidle0' });
  await waitText(p, 'Cô Lan Hương');
  await waitText(p, 'Gia sư Toán Văn lớp 6 đến 9');
  expect((await text(p)).includes('không xác minh'), 'thiếu cảnh báo không xác minh');
  expect(!(await text(p)).includes('Nguyễn Minh Anh'), 'trang giới thiệu lộ học sinh');
  expect((await p.evaluate(() => document.querySelector('meta[property="og:title"]')?.content)).includes('Cô Lan Hương'), 'thiếu thẻ og:title');
  await audit(p, 'gioi-thieu-cong-khai'); await shot(p, '30-gioi-thieu-cong-khai');
  await api(t, 'api/me', 'POST', { status: 'giao_vien_cong' });
  await p.reload({ waitUntil: 'networkidle0' });
  await waitText(p, 'Liên kết không còn hiệu lực');
  await t.goto(URL0 + '#/gioi-thieu', { waitUntil: 'networkidle0' }); await t.reload({ waitUntil: 'networkidle0' });
  await waitText(t, 'chính học sinh mình đang dạy chính khóa');
  await audit(t, 'gioi-thieu-khoa'); await shot(t, '31-gioi-thieu-bi-khoa');
  await api(t, 'api/me', 'POST', { status: 'sinh_vien' });
  await p.__ctx.close();
});

await step('XSS: tên học sinh chứa mã HTML hiển thị như chữ, không chạy', async () => {
  const x = await newUser('XSS');
  await x.goto(URL0, { waitUntil: 'networkidle0' });
  await api(x, 'api/start', 'POST', { name: '<b>in đậm</b>', status: 'khac' });
  await api(x, 'api/students', 'POST', { name: '<img src=x onerror="window.__xss=1">', note: '<script>window.__xss=2</script>' });
  await x.goto(URL0 + '#/hs', { waitUntil: 'networkidle0' }); await x.reload({ waitUntil: 'networkidle0' });
  await waitText(x, '<img src=x onerror=');
  expect(!(await x.evaluate(() => window.__xss)), 'XSS chạy được!');
  await shot(x, '32-xss-an-toan'); await x.__ctx.close();
});

await step('tên rất dài, 40 học sinh không tràn ngang', async () => {
  const x = await newUser('Dài');
  await x.goto(URL0, { waitUntil: 'networkidle0' });
  await api(x, 'api/start', 'POST', { name: 'Nguyễn Thị Thanh Hương Giang Ngọc Lan', status: 'giao_vien_khac' });
  for (let i = 0; i < 40; i++) await api(x, 'api/students', 'POST', { name: `Học sinh có tên rất dài số ${i} Nguyễn Hoàng Phương Thảo Ngân`, grade: 'Lớp 12', subject: 'Luyện thi đại học môn Toán nâng cao', feeModel: 'buoi', feeAmount: 100000 + i });
  await x.goto(URL0 + '#/hs', { waitUntil: 'networkidle0' }); await x.reload({ waitUntil: 'networkidle0' });
  await waitText(x, 'Học sinh có tên rất dài số 39');
  await audit(x, 'hs-dai'); await shot(x, '33-40-hoc-sinh');
  await x.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await x.reload({ waitUntil: 'networkidle0' }); await audit(x, 'hs-dai-360'); await shot(x, '34-40-hoc-sinh-360');
  await x.__ctx.close();
});

// quét mọi màn ở các cỡ máy, sáng và tối
async function sweep(view, dark, tag, desktop = false) {
  const p = await newUser('Quét-' + tag, { dark, view, desktop });
  await p.goto(URL0, { waitUntil: 'networkidle0' });
  const rec = await api(p, 'api/recover', 'POST', { code: recoveryCode });
  if (rec.status !== 200) { problems.push(`[${tag}] khôi phục bằng mã thất bại: ${rec.status}`); await p.__ctx.close(); return; }
  await p.reload({ waitUntil: 'networkidle0' });
  const stu = (await api(p, 'api/students')).json?.students?.find((s) => s.name === 'Nguyễn Minh Anh');
  if (!stu) { problems.push(`[${tag}] không thấy học sinh mẫu (bước trước thất bại?)`); await p.__ctx.close(); return; }
  const sid = stu.id;
  const pages = [['hom-nay', '#/'], ['lich', '#/lich'], ['hoc-sinh', '#/hs'], ['ho-so', '#/hs/' + sid], ['tien', '#/tien'], ['cai-dat', '#/cai-dat'], ['gioi-thieu', '#/gioi-thieu'], ['thiet-bi', '#/thiet-bi']];
  for (const [n, h] of pages) {
    await step(`${tag}: ${n}`, async () => {
      await p.goto(URL0 + h, { waitUntil: 'networkidle0' }); await sleep(500);
      await audit(p, `${tag}-${n}`); await shot(p, `s-${tag}-${n}`);
    });
  }
  await step(`${tag}: bảng chi tiết buổi học và form`, async () => {
    await p.goto(URL0 + '#/', { waitUntil: 'networkidle0' });
    await tap(p, 'Mở buổi học của', { scope: 'button', wait: 600 });
    await audit(p, `${tag}-sheet-buoi`); await shot(p, `s-${tag}-sheet-buoi`);
    await p.keyboard.press('Escape'); await sleep(300);
  });
  await p.__ctx.close();
}
console.log('--- 360x740 sáng; 390x844 tối; 360x740 tối; máy tính 1280x800 ---');
await sweep({ width: 360, height: 740 }, false, '360-sang');
await sweep({ width: 390, height: 844 }, true, '390-toi');
await sweep({ width: 360, height: 740 }, true, '360-toi');
await sweep({ width: 1280, height: 800 }, false, 'may-tinh', true);
await sweep({ width: 1280, height: 800 }, true, 'may-tinh-toi', true);

console.log('\n=== KẾT QUẢ ===');
const bad = results.filter((r) => !r.ok);
console.log(`${results.length - bad.length}/${results.length} bước đạt`);
for (const b of bad) console.log(' ✗', b.name, '\n    ', b.err.split('\n')[0]);
const uniq = [...new Set(problems)];
console.log(`\nVấn đề phát hiện khi kiểm tra tự động: ${uniq.length}`);
uniq.forEach((p) => console.log(' -', p));
await browser.close(); await app.close().catch(() => {}); await (await import('../src/db.js')).close(); await pg.stop();
fs.rmSync(userDataDir, { recursive: true, force: true });
process.exit(bad.length || uniq.length ? 1 : 0);
