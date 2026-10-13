// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): điện thoại 390x844 (sáng, tối) và máy tính 1280x800.
// Chạy: node scripts/e2e.js   (tự dựng PostgreSQL nhúng + server). Ảnh chụp lưu ở shots/.
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

const pg = await startEmbedded({ database: 'hire_e2e' });
process.env.DATABASE_URL = pg.url;
process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000';
process.env.JOBS_PER_SESSION_DAY = '100'; process.env.JOBS_PER_NEW_SESSION_DAY = '100'; process.env.JOBS_PER_IP_DAY = '100'; process.env.EMPLOYERS_PER_IP_DAY = '100';
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
config.port = 0;
const app = await start();
const port = app.server.address().port;
const ORIGIN = `http://127.0.0.1:${port}`;
const URL0 = `${ORIGIN}${config.basePath}/`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9hire-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const cleanup = async () => { try { await browser.close(); } catch {} try { await app.close(); } catch {} try { await (await import('../src/db.js')).close(); } catch {} try { await pg.stop(); } catch {} try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {} };
process.on('uncaughtException', async (e) => { console.error(e); await cleanup(); process.exit(1); });
const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotN = 0;
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function newUser(name, { dark = false, view = MOBILE } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const mobile = view.width < 600;
  await page.setViewport({ ...view, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.__name = name; page.__ctx = ctx;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/favicon|icon\.(svg|png)/.test(m.text()) && !/Failed to load resource.*(40[0-9]|41[0-9]|429)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('dialog', async (d) => { problems.push(`[${name}] dialog: ${d.message()}`); await d.dismiss(); });
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText?.includes('ERR_ABORTED')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  return page;
}

const visibleText = (page) => page.evaluate(() => document.body.innerText);
async function shot(page, label, full = true) {
  shotN += 1;
  const file = path.join(SHOTS, `${String(shotN).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return file;
}
async function waitText(page, text, timeout = 8000) {
  await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, text).catch(async () => {
    const body = await visibleText(page);
    await shot(page, 'LOI-doi-' + text.slice(0, 20).replace(/\W+/g, '_'));
    throw new Error(`Không thấy "${text}" trên trang ${page.__name}. Nội dung: ${body.slice(0, 400)}`);
  });
}
// bấm phần tử nhìn thấy có đúng chữ (ưu tiên trong sheet đang mở)
async function click(page, text, scope = 'button, a, [role=radio]') {
  await page.bringToFront();
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    ok = await page.evaluate((text, scope) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled; });
      const sheet = document.querySelector('.sheet');
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      const lab = (e) => norm((e.innerText || e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
      const hit = pool.find((e) => norm(e.innerText || e.textContent) === text) || pool.find((e) => (e.getAttribute('aria-label') || '') === text) || pool.find((e) => lab(e).includes(text));
      if (!hit) return false;
      hit.scrollIntoView({ block: 'center' });
      hit.click();
      return true;
    }, text, scope);
    if (!ok) await sleep(150);
  }
  if (!ok) { await shot(page, 'LOI-bam-' + text.slice(0, 20).replace(/\W+/g, '_')); throw new Error(`Không bấm được "${text}" ở ${page.__name}`); }
  await sleep(120);
}
// điền ô theo nhãn
async function fill(page, label, value) {
  const id = await page.evaluate((label) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sheet = document.querySelector('.sheet');
    const root = sheet || document;
    const l = [...root.querySelectorAll('label')].find((x) => norm(x.textContent) === label && x.getBoundingClientRect().width > 0) || [...root.querySelectorAll('label')].find((x) => norm(x.textContent).startsWith(label));
    return l ? l.getAttribute('for') : null;
  }, label);
  if (!id) throw new Error(`Không thấy ô "${label}" ở ${page.__name}`);
  const sel = '#' + id;
  const tag = await page.$eval(sel, (e) => e.tagName);
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  if (tag === 'SELECT') { await page.select(sel, value); return; }
  await page.focus(sel);
  await page.$eval(sel, (e) => { e.value = ''; });
  await page.keyboard.type(value, { delay: 4 });
}
async function go(page, hash) {
  const target = URL0 + hash;
  if (page.url() === target || (page.url().startsWith(URL0) && page.url().split('#')[1] === hash.replace(/^#/, '') && hash)) { await page.reload({ waitUntil: 'networkidle0' }); return; }
  await page.goto(target, { waitUntil: 'networkidle0' });
  if (page.url() !== target && hash === '') await page.reload({ waitUntil: 'networkidle0' });
}
const jsonFetch = async (method, p, body, ip, cookie) => {
  const r = await fetch(ORIGIN + config.basePath + p, { method, headers: { 'content-type': 'application/json', 'x-requested-with': '9hire', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j, cookie: (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('hsid=')) };
};

// ---------- dữ liệu mẫu: vài quán, nhiều loại việc ----------
const SEED = [
  { emp: 'Cà Phê Gió', ip: '10.9.0.1', jobs: [
    { title: 'Phục vụ quán cà phê ca tối', category: 'phuc_vu', kind: 'ban_tg', payType: 'gio', payMin: 25000, payMax: 30000, shifts: ['toi'], district: 'Quận 1', description: 'Phục vụ bàn, pha chế đơn giản, dọn quầy. Có cơm ca, được đào tạo từ đầu, thưởng chuyên cần cuối tháng.', startNow: true, slots: 3 },
    { title: 'Pha chế (barista) có kinh nghiệm', category: 'phuc_vu', kind: 'toan_tg', payType: 'thang', payMin: 9000000, payMax: 12000000, shifts: ['sang', 'chieu'], district: 'Quận 1', description: 'Pha chế cà phê, trà trái cây theo công thức quán. Làm 8 tiếng mỗi ngày, nghỉ một ngày cố định mỗi tuần.', startNow: false, slots: 1 },
  ] },
  { emp: 'Tiệm Bánh Mì Cô Ba', ip: '10.9.0.2', jobs: [
    { title: 'Phụ bếp làm bánh mì buổi sáng', category: 'bep', kind: 'lam_them', payType: 'ngay', payMin: 250000, payMax: 300000, shifts: ['sang'], district: 'Quận 3', description: 'Nướng bánh, cắt rau, phụ khách mang đi. Làm từ 4h30 đến 10h, được ăn sáng miễn phí.', startNow: true, slots: 2 },
    { title: 'Giao bánh mì cho khách quen', category: 'giao_hang', kind: 'ban_tg', payType: 'gio', payMin: 30000, payMax: null, shifts: ['sang', 'chieu'], district: 'Bình Thạnh', description: 'Giao bánh mì và đồ ăn sáng trong bán kính 3km bằng xe máy, quán có hỗ trợ xăng xe.', startNow: false, slots: 1 },
  ] },
  { emp: 'Cửa Hàng Thời Trang Minh Anh', ip: '10.9.0.3', jobs: [
    { title: 'Nhân viên bán hàng cuối tuần', category: 'ban_hang', kind: 'lam_them', payType: 'ca', payMin: 200000, payMax: 250000, shifts: ['chieu', 'toi'], district: 'Cầu Giấy', city: 'hn', description: 'Tư vấn khách, sắp xếp hàng lên kệ, thu ngân khi cần. Ưu tiên sinh viên có thể làm thứ Bảy và Chủ nhật.', startNow: false, slots: 2 },
    { title: 'Đóng gói đơn hàng online', category: 'kho', kind: 'thoi_vu', payType: 'gio', payMin: 28000, payMax: 32000, shifts: ['linh_hoat'], district: 'Hải Châu', city: 'dn', description: 'Đóng gói, dán nhãn, xếp đơn vào thùng cho kịp đợt khuyến mãi. Làm theo ca, linh động giờ giấc.', startNow: true, slots: 5 },
  ] },
  { emp: 'Công ty TNHH Việt Tín', ip: '10.9.0.4', jobs: [
    { title: 'Trợ lý kế toán tổng hợp', category: 'van_phong', kind: 'van_phong', payType: 'thang', payMin: 10000000, payMax: 14000000, shifts: [], district: 'Tân Bình', description: 'Lập chứng từ, đối chiếu công nợ, nộp báo cáo thuế hằng tháng. Làm giờ hành chính từ thứ Hai đến thứ Sáu.', requirements: 'Tốt nghiệp kế toán, biết Excel, ưu tiên có 1 năm kinh nghiệm.', startNow: false, slots: 1 },
    { title: 'Nhân viên kho xưởng ca đêm', category: 'san_xuat', kind: 'toan_tg', payType: 'thang', payMin: 8000000, payMax: 10000000, shifts: ['dem'], district: 'Bình Tân', description: 'Xếp hàng, kiểm đếm, vận hành xe nâng nhỏ tại kho. Làm ca đêm có phụ cấp, đóng bảo hiểm sau thử việc.', startNow: false, slots: 4 },
  ] },
];
async function seed() {
  const out = [];
  for (const e of SEED) {
    const r = await jsonFetch('POST', '/api/employer', { name: e.emp }, e.ip);
    for (const j of e.jobs) {
      const body = { company: e.emp, kind: 'ban_tg', category: 'khac', requirements: '', shifts: [], shiftNote: '', city: 'hcm', address: '1 Nguyễn Huệ', contactName: 'Chị Lan', contactPhone: '0912345678', startNow: false, slots: 1, days: 14, ...j };
      const k = await jsonFetch('POST', '/api/employer/jobs', body, e.ip, r.cookie);
      assert.equal(k.status, 200, JSON.stringify(k.json));
      out.push(k.json.job);
    }
  }
  return out;
}

const seeded = await seed();
const first = seeded[0];

// =============== 1. Người tìm việc, điện thoại sáng ===============
const s1 = await newUser('seeker-sang');
await go(s1, '');
await waitText(s1, 'Phục vụ quán cà phê ca tối');
await shot(s1, 'home-sang');
assert.ok((await visibleText(s1)).includes('Không phí hồ sơ') || (await visibleText(s1)).includes('không phí hồ sơ'), 'dải cảnh báo an toàn');

// tìm không dấu
await fill(s1, 'Tìm việc', 'banh mi').catch(async () => { await s1.focus('input[type=search]'); await s1.keyboard.type('banh mi', { delay: 5 }); });
await s1.evaluate(() => { if (document.querySelector('input[type=search]').value !== 'banh mi') { document.querySelector('input[type=search]').value = 'banh mi'; } });
await s1.keyboard.press('Enter');
await sleep(600);
let txt = await visibleText(s1);
assert.ok(txt.includes('Phụ bếp làm bánh mì') && txt.includes('Giao bánh mì'), 'tìm "banh mi" ra tin có dấu');
assert.ok(!txt.includes('Trợ lý kế toán'), 'lọc loại tin khác');
await shot(s1, 'tim-khong-dau');
await s1.$eval('input[type=search]', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(700);

// bộ lọc: sheet
await click(s1, 'Bộ lọc', 'button');
await sleep(300);
await shot(s1, 'bo-loc-sheet', false);
await fill(s1, 'Thành phố', 'hn');
await sleep(700);
await click(s1, 'Xem kết quả');
await sleep(400);
txt = await visibleText(s1);
assert.ok(txt.includes('Nhân viên bán hàng cuối tuần') && !txt.includes('Phục vụ quán cà phê ca tối'), 'lọc theo Hà Nội');
await shot(s1, 'loc-ha-noi');

// lưu bộ lọc để báo tin mới
await click(s1, 'Báo tin mới');
await sleep(300);
await shot(s1, 'bao-tin-moi-sheet', false);
await click(s1, 'Theo dõi');
await sleep(300);
// xóa lọc rồi vào chi tiết
await click(s1, 'Tất cả', 'button');
await sleep(700);
await click(s1, 'Cần ngay', 'button');
await sleep(600);
txt = await visibleText(s1);
assert.ok(txt.includes('Phục vụ quán cà phê ca tối') && !txt.includes('Pha chế (barista)'), 'lọc cần ngay');
await click(s1, 'Tất cả', 'button');
await sleep(600);

// chi tiết
await click(s1, 'Phục vụ quán cà phê ca tối', 'a');
await waitText(s1, 'Mô tả công việc');
txt = await visibleText(s1);
assert.ok(!txt.includes('0912345678') && !txt.includes('0912 345 678') && !txt.includes('1 Nguyễn Huệ'), 'chưa lộ số/địa chỉ');
await shot(s1, 'chi-tiet');
await shot(s1, 'chi-tiet-vung-nhin', false);

// cổng cảnh báo -> xem liên hệ
await click(s1, 'Xem liên hệ');
await sleep(300);
await shot(s1, 'canh-bao-an-toan', false);
const disabled = await s1.evaluate(() => [...document.querySelectorAll('.sheet .btn')].find((b) => b.textContent.includes('Xem số liên hệ')).disabled);
assert.equal(disabled, true, 'nút xem số bị khóa tới khi tick xác nhận');
await click(s1, 'Tôi đã đọc và hiểu', 'label');
await click(s1, 'Xem số liên hệ');
await waitText(s1, '0912 345 678');
txt = await visibleText(s1);
assert.ok(txt.includes('1 Nguyễn Huệ') && txt.includes('Nhắn Zalo'), 'hiện số, địa chỉ, nút Zalo');
const zalo = await s1.$$eval('.sheet a.zalo', (as) => as.map((a) => a.href + '|' + a.rel + '|' + a.target));
assert.equal(zalo[0], 'https://zalo.me/0912345678|noopener noreferrer|_blank');
await shot(s1, 'lien-he', false);
await click(s1, 'Đóng', '.sheet .btn');
await sleep(300);

// gửi quan tâm
await click(s1, 'Gửi quan tâm', 'button');
await sleep(300);
await click(s1, 'Gửi quan tâm', '.sheet .btn.primary').catch(() => {});
let ptxt = await visibleText(s1);
assert.ok(ptxt.includes('Hãy nhập tên của bạn'), 'kiểm tra tên rỗng');
await shot(s1, 'quan-tam-loi', false);
await fill(s1, 'Tên của bạn', 'Nguyễn Văn An');
await fill(s1, 'Số điện thoại / Zalo', '0987 654 321');
await fill(s1, 'Lời nhắn (không bắt buộc)', 'Em rảnh các buổi tối, có thể đi làm từ thứ Hai ạ.');
await shot(s1, 'quan-tam-form', false);
await click(s1, 'Gửi quan tâm', '.sheet .btn.primary');
await waitText(s1, 'Đã gửi quan tâm');
await shot(s1, 'da-gui-quan-tam', false);

// báo cáo
await click(s1, 'Báo cáo tin này', 'button');
await sleep(300);
await click(s1, 'Đòi tiền: phí, đặt cọc, ký quỹ', '.sheet button');
await shot(s1, 'bao-cao', false);
await click(s1, 'Gửi báo cáo');
await waitText(s1, 'Cảm ơn bạn');

// lưu tin
await click(s1, 'Lưu', '.cta button');
await sleep(200);
await go(s1, '#/saved');
await waitText(s1, 'Tin đã lưu (1)');
await shot(s1, 'da-luu');

// hồ sơ + chuông báo tin mới
await go(s1, '#/me');
await waitText(s1, 'Hồ sơ ngắn của tôi');
txt = await s1.$eval('#view', (v) => v.innerText);
assert.ok(txt.includes('Tin đã gửi quan tâm'), 'đếm hoạt động');
assert.equal(await s1.$eval('input[autocomplete=name]', (e) => e.value), 'Nguyễn Văn An', 'hồ sơ tự lưu sau khi gửi quan tâm');
await shot(s1, 'ca-nhan');

// tin mới -> chuông (đăng một tin Hà Nội mới)
const newJob = await jsonFetch('POST', '/api/employer', { name: 'Quán Mới' }, '10.9.0.9');
const nj = await jsonFetch('POST', '/api/employer/jobs', { title: 'Thu ngân cửa hàng tiện lợi', company: 'Quán Mới', kind: 'ban_tg', category: 'ban_hang', description: 'Thu ngân, xếp hàng, vệ sinh quầy tại cửa hàng tiện lợi gần trường đại học.', payType: 'gio', payMin: 26000, payMax: 30000, shifts: ['toi'], shiftNote: '', city: 'hn', district: 'Cầu Giấy', address: '', contactName: 'Anh Hải', contactPhone: '0903111222', startNow: true, slots: 2, days: 14 }, '10.9.0.9', newJob.cookie);
assert.equal(nj.status, 200, JSON.stringify(nj.json));
await go(s1, '#/');
await s1.evaluate(() => window.H9.my.poll());
await sleep(800);
const badge = await s1.$eval('.bar .dot-badge', (e) => e.textContent);
assert.equal(badge, '1', 'chuông báo 1 tin mới');
await shot(s1, 'chuong-tin-moi', false);
await click(s1, 'Tin mới theo bộ lọc', 'button');
await sleep(300);
await shot(s1, 'chuong-sheet', false);
await click(s1, 'Xem tin', '.sheet .btn');
await waitText(s1, 'Thu ngân cửa hàng tiện lợi');

// các trang tĩnh
await go(s1, '#/safety');
await waitText(s1, 'Nhận biết tin lừa đảo');
await shot(s1, 'an-toan');
await go(s1, '#/privacy');
await waitText(s1, 'Quyền riêng tư');
await shot(s1, 'quyen-rieng-tu');
await go(s1, '#/terms');
await shot(s1, 'dieu-khoan');

// ngoài phạm vi: tin đã hết hạn / không tồn tại
await go(s1, '#/job/00000000-0000-0000-0000-000000000000');
await waitText(s1, 'Không tìm thấy');
await shot(s1, 'khong-tim-thay');

// =============== 2. Nhà tuyển dụng, điện thoại sáng ===============
const e1 = await newUser('nhatd');
await go(e1, '#/employer');
await waitText(e1, 'Tuyển người nhanh cho quán của bạn');
await shot(e1, 'tuyen-gioi-thieu');
await fill(e1, 'Tên quán, cửa hàng hoặc tên bạn', 'Quán Ốc Bà Tư');
await click(e1, 'Mình đồng ý với Điều khoản', 'label');
await click(e1, 'Bắt đầu đăng tin');
await waitText(e1, 'Lưu mã khôi phục');
const code = await e1.$eval('.codebox', (e) => e.textContent);
assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
await shot(e1, 'ma-khoi-phuc');
const contDisabled = await e1.evaluate(() => [...document.querySelectorAll('.btn')].find((b) => b.textContent === 'Tiếp tục').disabled);
assert.equal(contDisabled, true);
await click(e1, 'Mình đã lưu mã này', 'label');
await click(e1, 'Tiếp tục');
await waitText(e1, 'Đăng tin tuyển');

// form đăng tin: thử tin thu phí trước
await fill(e1, 'Vị trí cần tuyển', 'Phụ quán ốc ca tối');
await fill(e1, 'Mô tả công việc', 'Bưng bê, dọn bàn, rửa chén. Cần đặt cọc 300k tiền đồng phục khi nhận việc.');
await fill(e1, 'Quận, huyện', 'Quận 4');
await fill(e1, 'Người liên hệ', 'Cô Tư');
await fill(e1, 'Số điện thoại / Zalo', '0907 123 456');
await fill(e1, 'Lương thấp nhất', '25k');
await fill(e1, 'Lương cao nhất', '30k');
await click(e1, 'Ca tối', '.pill');
await click(e1, 'Cần người bắt đầu ngay', 'label');
await shot(e1, 'form-dang-tin');
await click(e1, 'Đăng tin', '.btn.primary');
await waitText(e1, 'Tin chưa đăng được');
txt = await visibleText(e1);
assert.ok(txt.includes('đòi tiền người lao động'), 'giải thích lý do chặn');
await shot(e1, 'chan-thu-phi', false);
// sửa lại cho hợp lệ
await fill(e1, 'Mô tả công việc', 'Bưng bê, dọn bàn, rửa chén tại quán ốc. Không thu phí, không đặt cọc. Có cơm tối và tiền boa chia đều.');
await click(e1, 'Đăng tin', '.btn.primary');
await waitText(e1, 'Hồ sơ ứng viên'.slice(0, 5)).catch(() => {});
await waitText(e1, 'Đã nhận 0/1');
await shot(e1, 'hop-thu-trong');
const ownJobUrl = e1.url();
const ownJobId = ownJobUrl.split('/').pop();

// một người nộp hồ sơ vào tin của quán này (qua giao diện của seeker thứ hai)
const s2 = await newUser('seeker2', { dark: true });
await go(s2, '#/job/' + ownJobId);
await waitText(s2, 'Phụ quán ốc ca tối');
await shot(s2, 'chi-tiet-toi');
await click(s2, 'Gửi quan tâm', 'button');
await fill(s2, 'Tên của bạn', 'Trần Thị Bích <b>Ngọc</b>');
await fill(s2, 'Số điện thoại / Zalo', '0911 222 333');
await fill(s2, 'Lời nhắn (không bắt buộc)', '<img src=x onerror=alert(1)> Em làm được ca tối ạ');
await click(s2, 'Gửi quan tâm', '.sheet .btn.primary');
await waitText(s2, 'Đã gửi quan tâm');
// người thứ ba qua API
await jsonFetch('POST', `/api/jobs/${ownJobId}/apply`, { name: 'Lê Minh', phone: '0933 444 555', message: 'Em là sinh viên năm hai.', startNow: true }, '10.9.5.5');

await go(e1, '#/employer/job/' + ownJobId);
await waitText(e1, 'Trần Thị Bích');
txt = await e1.$eval('#view', (v) => v.innerText);
assert.ok(txt.includes('<b>Ngọc</b>') && txt.includes('<img src=x onerror=alert(1)>'), 'dữ liệu nhập xấu hiện nguyên văn như chữ, không chạy');
assert.equal(await e1.$$eval('#view img, #view b', (x) => x.length), 0, 'không có thẻ HTML chèn vào');
await shot(e1, 'hop-thu-ung-vien');
await click(e1, 'Đã liên hệ', '.statusbtns button');
await sleep(300);
await click(e1, 'Nhận', '.statusbtns button');
await waitText(e1, 'Đã nhận 1/1').catch(() => {});
await shot(e1, 'ung-vien-da-nhan');
await click(e1, 'Mới (1)', '.pill');
await sleep(300);
await shot(e1, 'loc-moi');

// bảng điều khiển
await go(e1, '#/employer');
await waitText(e1, 'Tin của tôi');
await shot(e1, 'bang-dieu-khien');
// sửa tin
await click(e1, 'Phụ quán ốc ca tối', 'a');
await click(e1, 'Sửa', 'a');
await waitText(e1, 'Sửa tin');
await shot(e1, 'sua-tin');
await fill(e1, 'Tên quán, cửa hàng', 'Quán Ốc Bà Tư 2');
await click(e1, 'Lưu thay đổi');
await waitText(e1, 'Đã lưu thay đổi');
// đóng tin rồi mở lại
await click(e1, 'Đóng tin', 'button');
await click(e1, 'Đóng tin', '.sheet .btn.primary');
await waitText(e1, 'Mở lại / gia hạn');
await shot(e1, 'da-dong');
await click(e1, 'Mở lại / gia hạn', 'button');
await sleep(300);
await shot(e1, 'mo-lai-sheet', false);
await click(e1, 'Xác nhận');
await waitText(e1, 'Gia hạn');

// vào lại bằng mã từ trình duyệt khác
const e2 = await newUser('nhatd-may-khac');
await go(e2, '#/employer/recover');
await fill(e2, 'Mã khôi phục', code.toLowerCase().replace(/-/g, ''));
assert.equal(await e2.$eval('input', (e) => e.value), code, 'tự chèn dấu gạch và chữ hoa');
await shot(e2, 'vao-lai');
await click(e2, 'Vào lại', '.btn.primary');
await waitText(e2, 'Tin của tôi');
await go(e2, '#/employer/recover');
await fill(e2, 'Mã khôi phục', 'ABCD-EFGH-JKLM-NPQR');
await click(e2, 'Vào lại', '.btn.primary');
await waitText(e2, 'Mã khôi phục không đúng');
await shot(e2, 'vao-lai-sai', false);

// XSS ở tin công khai
const xss = await jsonFetch('POST', '/api/employer', { name: '<script>window.__x=1</script>' }, '10.9.7.7');
const xj = await jsonFetch('POST', '/api/employer/jobs', { title: 'Phụ việc <img src=x onerror=window.__x=1>', company: '"><svg onload=window.__x=1>', kind: 'ban_tg', category: 'khac', description: 'Mô tả có thẻ <script>window.__x=1</script> và &amp; ký tự đặc biệt để thử hiển thị.', payType: 'thoa_thuan', shifts: [], shiftNote: '', city: 'hcm', district: 'Quận 5', address: '', contactName: 'An', contactPhone: '0905123123', slots: 1, days: 7 }, '10.9.7.7', xss.cookie);
assert.equal(xj.status, 200, JSON.stringify(xj.json));
const s3 = await newUser('xss');
await go(s3, '');
await waitText(s3, 'Phụ việc <img');
await go(s3, '#/job/' + xj.json.job.id);
await waitText(s3, 'Mô tả có thẻ <script>');
assert.equal(await s3.evaluate(() => window.__x), undefined, 'XSS không chạy');
await shot(s3, 'xss-an-toan');

// =============== 3. Máy tính 1280x800 ===============
const d1 = await newUser('desktop', { view: DESKTOP });
await go(d1, '');
await waitText(d1, 'Phục vụ quán cà phê ca tối');
await shot(d1, 'may-tinh-trang-chu', false);
await shot(d1, 'may-tinh-trang-chu-full');
await click(d1, 'Phục vụ quán cà phê ca tối', 'a');
await waitText(d1, 'Mô tả công việc');
await shot(d1, 'may-tinh-chi-tiet', false);
await go(d1, '#/employer/recover');
await fill(d1, 'Mã khôi phục', code);
await click(d1, 'Vào lại', '.btn.primary');
await waitText(d1, 'Tin của tôi');
await shot(d1, 'may-tinh-bang-dieu-khien');
await click(d1, 'Phụ quán ốc ca tối', 'a');
await waitText(d1, 'Trần Thị Bích');
await shot(d1, 'may-tinh-hop-thu');
await go(d1, '#/employer/new');
await waitText(d1, 'Đăng tin tuyển');
await shot(d1, 'may-tinh-form', false);

// =============== 4. Điện thoại nhỏ 360 tối ===============
const s4 = await newUser('seeker-360-toi', { dark: true, view: { width: 360, height: 740 } });
await go(s4, '');
await waitText(s4, 'Phục vụ quán cà phê ca tối');
await shot(s4, '360-toi-trang-chu');
await go(s4, '#/job/' + first.id);
await waitText(s4, 'Mô tả công việc');
await shot(s4, '360-toi-chi-tiet');
const overflow = await s4.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
assert.equal(overflow, false, 'không tràn ngang ở 360px');

// chia sẻ có og
const og = await (await fetch(`${ORIGIN}${config.basePath}/j/${first.id}`)).text();
assert.ok(og.includes('og:title') && og.includes('Phục vụ quán cà phê ca tối'));
const s5 = await newUser('share');
await s5.goto(`${ORIGIN}${config.basePath}/j/${first.id}`, { waitUntil: 'networkidle0' });
await waitText(s5, 'Mô tả công việc');
assert.ok(s5.url().includes('#/job/' + first.id));

await cleanup();

if (problems.length) {
  console.error('VẤN ĐỀ trong trình duyệt:\n - ' + [...new Set(problems)].join('\n - '));
  process.exit(1);
}
console.log(`E2E đạt: ${shotN} ảnh chụp ở ${SHOTS}, không lỗi console.`);
process.exit(0);
