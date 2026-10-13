// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): điện thoại 390x844 và 360x740, máy tính 1280x800, sáng và tối.
// Chạy: node scripts/e2e.js   (tự dựng PostgreSQL nhúng + server ở cổng ngẫu nhiên, cổng gửi OTP là "mock"). Ảnh chụp lưu ở shots/.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const pg = await startEmbedded({ database: 'id_e2e' });
process.env.DATABASE_URL = pg.url;
process.env.OTP_PROVIDER = 'mock';
process.env.POW_BITS = '12'; // proof-of-work thật nhưng nhẹ để chạy nhanh
process.env.INTERNAL_KEYS = 'osin:e2e-secret-osin-0123456789abcdef-abcdefgh';
Object.assign(process.env, { RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000', SESSION_LIMIT_PER_MIN: '1000000', OTP_RESEND_SEC: '1', OTP_DAILY_PER_PHONE: '1000', OTP_DAILY_PER_IP: '100000', VERIFY_PER_IP_HOUR: '1000000', INVITES_PER_USER_DAY: '1000' });
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const provider = await import('../src/otp-provider.js');
config.port = 0;
const { parseClients } = await import('../src/config.js');
const { createNineId } = await import('../client/nine-id.js');
const app = await start();
const port = app.server.address().port;
const ORIGIN = `http://127.0.0.1:${port}`;
const URL0 = `${ORIGIN}${config.basePath}/`;
config.oauthClients = parseClients(`osin=${ORIGIN}/osin-callback`);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9id-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const problems = []; const results = [];
const MOBILE = { width: 390, height: 844 }; const SMALL = { width: 360, height: 740 }; const DESKTOP = { width: 1280, height: 800 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotNo = 0;
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); if (!cond) problems.push(`KIỂM TRA SAI: ${name} ${extra}`); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };

async function newUser(name, { dark = false, view = MOBILE, desktop = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: desktop ? 1 : 2, isMobile: !desktop, hasTouch: !desktop });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.__name = name; page.__ctx = ctx;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|429)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('dialog', async (d) => { problems.push(`[${name}] HỘP THOẠI bất ngờ (XSS?): ${d.message()}`); await d.dismiss(); });
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText?.includes('ERR_ABORTED')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  return page;
}

async function shot(page, name) {
  await sleep(250);
  const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: false });
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`không tràn ngang: ${file}`, o.sw <= o.cw + 1, `${o.sw} > ${o.cw}`);
}

// tìm phần tử bấm được có chữ (ưu tiên bảng nhập đang mở)
async function find(page, text, scope = 'button, a, [role=button]') {
  await page.bringToFront();
  let h = null;
  for (let i = 0; i < 40; i++) {
    h = await page.evaluateHandle((text, scope) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      return pool.find((e) => norm(e.textContent).includes(text) || (e.getAttribute('aria-label') || '').includes(text)) || null;
    }, text, scope);
    if (h.asElement()) break;
    await sleep(200);
  }
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy "${text}" trên màn hình`);
  return el;
}
async function tap(page, text, scope) {
  for (let attempt = 0; ; attempt++) {
    try {
      const el = await find(page, text, scope);
      await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await sleep(80);
      await el.click();
      await sleep(150);
      return;
    } catch (err) {
      if (attempt >= 3 || !/not clickable|detached|Execution context|not an Element/.test(err.message)) throw err;
      await sleep(250);
    }
  }
}
// nhập vào ô theo nhãn
async function fill(page, label, value) {
  await page.bringToFront();
  let el = null;
  for (let i = 0; i < 30 && !el; i++) {
    const h = await page.evaluateHandle((label) => {
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const root = sheet || document;
      for (const l of root.querySelectorAll('label')) if (l.textContent.trim().startsWith(label)) return document.getElementById(l.htmlFor);
      const byAria = [...root.querySelectorAll('input,textarea,select')].find((e) => (e.getAttribute('aria-label') || '').startsWith(label));
      return byAria || null;
    }, label);
    el = h.asElement(); if (!el) await sleep(150);
  }
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const tag = await el.evaluate((e) => e.tagName);
  if (tag === 'SELECT') { await el.select(value); return; }
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 5 });
}
const text = (page) => page.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('noscript,script').forEach((n) => n.remove());
  return c.textContent.replace(/\s+/g, ' ');
});
const waitText = async (page, t, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await text(page)).includes(t)) return true; await sleep(150); } throw new Error(`[${page.__name}] chờ chữ "${t}" không thấy. Màn hình: ${(await text(page)).slice(0, 300)}`); };
const hasText = async (page, t) => (await text(page)).includes(t);
const phoneInput = async (page, phone) => fill(page, 'Số điện thoại', phone);
let phoneSeq = 20_000_000;
const newPhone = () => '09' + String(phoneSeq++).padStart(8, '0');
const otpFor = (phone) => provider.lastOtp('+84' + phone.slice(1));

async function registerViaUi(page, { phone, name, password, query = '' }) {
  await page.goto(URL0 + query + '#/dang-ky', { waitUntil: 'networkidle0' });
  await phoneInput(page, phone);
  await tap(page, 'Gửi mã xác thực');
  await waitText(page, 'Mã gồm 6 số');
  const code = otpFor(phone);
  await fill(page, 'Mã xác thực', code); // đủ 6 số tự gửi
  await waitText(page, 'Số điện thoại đã được xác minh');
  await fill(page, 'Tên hiển thị', name);
  await fill(page, 'Mật khẩu', password);
}

try {
  const momPhone = newPhone(); const kidPhone = newPhone(); const grandPhone = newPhone();
  const PASS = 'MatKhau-Tot-1';

  // ================= 1. Mẹ: đăng nhập sai, đăng ký 3 bước, next an toàn =================
  const mom = await newUser('me');
  await mom.goto(URL0 + '?next=' + encodeURIComponent('//evil.example/phish'), { waitUntil: 'networkidle0' });
  await waitText(mom, 'Đăng nhập 9app');
  await shot(mom, 'dang-nhap');
  await phoneInput(mom, momPhone); await fill(mom, 'Mật khẩu', 'sai-mat-khau-1');
  await tap(mom, 'Đăng nhập');
  await waitText(mom, 'không đúng');
  await shot(mom, 'dang-nhap-sai');
  // nút hiện mật khẩu
  await tap(mom, 'Hiện mật khẩu');
  check('nút hiện mật khẩu đổi kiểu ô', await mom.evaluate(() => document.querySelector('input[name=password]').type === 'text'));

  await tap(mom, 'Đăng ký tài khoản');
  await waitText(mom, 'Tạo tài khoản 9app');
  await shot(mom, 'dang-ky-b1');
  await phoneInput(mom, '123');
  await tap(mom, 'Gửi mã xác thực');
  await waitText(mom, 'không hợp lệ');
  await phoneInput(mom, momPhone.replace(/^0/, '+84 ').replace(/(\d{3})(\d{3})(\d+)$/, '$1 $2 $3'));
  await tap(mom, 'Gửi mã xác thực');
  await waitText(mom, 'Mã gồm 6 số');
  await shot(mom, 'dang-ky-b2-otp');
  await fill(mom, 'Mã xác thực', '000000');
  await waitText(mom, 'không đúng hoặc đã hết hạn');
  await fill(mom, 'Mã xác thực', otpFor(momPhone));
  await waitText(mom, 'Số điện thoại đã được xác minh');
  await fill(mom, 'Tên hiển thị', 'Mẹ Hoa');
  await fill(mom, 'Mật khẩu', 'ngan');
  await tap(mom, 'Tạo tài khoản');
  await waitText(mom, 'ít nhất 8 ký tự');
  await shot(mom, 'dang-ky-b3');
  await fill(mom, 'Mật khẩu', PASS);
  await tap(mom, 'Tạo tài khoản');
  await waitText(mom, 'Gia đình của tôi');
  check('next lạ (//evil) bị bỏ qua: vẫn ở trang 9id', mom.url().startsWith(ORIGIN + '/id/'), mom.url());
  await shot(mom, 'gia-dinh-trong');

  // ================= 2. Mẹ: tạo gia đình, XSS, thêm con kèm số, mời bà =================
  await tap(mom, 'Tạo gia đình');
  await fill(mom, 'Tên gia đình', '<img src=x onerror=alert(1)> Nhà Cún');
  await shot(mom, 'tao-gia-dinh');
  await tap(mom, 'Tạo gia đình', '.sheet button');
  await waitText(mom, 'Người lớn và tài khoản trong gia đình');
  check('tên gia đình chứa HTML hiển thị nguyên văn (không chạy)', await hasText(mom, '<img src=x onerror=alert(1)> Nhà Cún') && (await mom.$$('img[src="x"]')).length === 0);
  await shot(mom, 'gia-dinh-moi');
  await tap(mom, 'Đổi tên gia đình');
  await fill(mom, 'Tên gia đình', 'Nhà Cún');
  await tap(mom, 'Lưu');
  await waitText(mom, 'Hồ sơ các con').catch(() => {});
  await tap(mom, 'Thêm con');
  await fill(mom, 'Tên', 'Bé Na'); await fill(mom, 'Năm sinh', '2015'); await fill(mom, 'Ghi chú', 'Dị ứng tôm');
  await fill(mom, 'Số điện thoại của con', kidPhone);
  await shot(mom, 'them-con');
  await tap(mom, 'Thêm con', '.sheet button');
  await waitText(mom, 'Chờ con xác nhận');
  await tap(mom, 'Thêm con');
  await fill(mom, 'Tên', 'Bé Bi'); await fill(mom, 'Năm sinh', '2019');
  await tap(mom, 'Thêm con', '.sheet button');
  await waitText(mom, 'Bé Bi');
  await tap(mom, 'Mời người lớn');
  await fill(mom, 'Số điện thoại', grandPhone); await fill(mom, 'Ghi chú cho riêng bạn', 'Bà nội');
  await shot(mom, 'moi-nguoi-lon');
  await tap(mom, 'Gửi lời mời', '.sheet button');
  await waitText(mom, 'Lời mời đang chờ');
  await shot(mom, 'gia-dinh-co-con-loi-moi');

  // ================= 3. Con: đăng ký bằng số được mời -> thấy lời mời -> chấp nhận =================
  const kid = await newUser('con');
  await registerViaUi(kid, { phone: kidPhone, name: 'Bé Na', password: PASS });
  await shot(kid, 'dang-ky-b3-con');
  await tap(kid, 'Tạo tài khoản');
  await waitText(kid, 'Gia đình của tôi');
  await waitText(kid, 'Bạn có 1 lời mời gia đình');
  check('con chưa chấp nhận thì chưa thấy gia đình nào', await hasText(kid, 'chưa ở trong gia đình nào'));
  await tap(kid, 'Xem lời mời');
  await waitText(kid, 'Mẹ Hoa mời bạn');
  check('thẻ lời mời không lộ tên con / thành viên khác', !(await hasText(kid, 'Dị ứng')) && !(await hasText(kid, 'Bé Bi')));
  await shot(kid, 'loi-moi-con');
  check('thẻ lời mời có nút Chặn và Báo cáo, kèm ghi chú tên gia đình tự đặt', (await hasText(kid, 'Chặn người mời')) && (await hasText(kid, 'Báo cáo')) && (await hasText(kid, 'do người dùng tự đặt')));
  await tap(kid, 'Chấp nhận');
  await waitText(kid, 'Đang chờ chủ gia đình duyệt');
  await shot(kid, 'cho-duyet-goc-nhin-con');
  check('con chưa được duyệt thì chưa thấy gia đình', !(await hasText(kid, 'Hồ sơ của bạn')));
  // mẹ thấy lời chờ duyệt kèm 4 số cuối và duyệt
  await mom.reload({ waitUntil: 'networkidle0' });
  await waitText(mom, 'chờ bạn duyệt');
  check('mẹ thấy 4 số cuối điện thoại để đối chiếu', await hasText(mom, 'Số ••••' + kidPhone.slice(-4)));
  await shot(mom, 'cho-duyet-goc-nhin-me');
  await tap(mom, 'Duyệt');
  await waitText(mom, 'Đã nối tài khoản');
  await kid.goto(URL0 + '#/gia-dinh', { waitUntil: 'networkidle0' });
  await tap(kid, 'Nhà Cún');
  await waitText(kid, 'Hồ sơ của bạn');
  check('con chỉ thấy hồ sơ của mình, không thấy Bé Bi / ghi chú', !(await hasText(kid, 'Bé Bi')) && !(await hasText(kid, 'Dị ứng')));
  check('con không có nút mời/đổi tên/xóa', !(await hasText(kid, 'Mời người lớn')) && !(await hasText(kid, 'Đổi tên gia đình')) && !(await hasText(kid, 'Xóa gia đình')) && await hasText(kid, 'Rời gia đình'));
  await shot(kid, 'gia-dinh-goc-nhin-con');

  // mẹ tải lại: con đã nối
  await mom.reload({ waitUntil: 'networkidle0' });
  await waitText(mom, 'Đã nối tài khoản');
  await shot(mom, 'gia-dinh-con-da-noi');

  // ================= 4. Bà: số chưa có tài khoản, đăng ký rồi thấy lời mời; "đăng ký" bằng số đã có thì chuyển sang đặt lại =================
  const gran = await newUser('ba');
  await registerViaUi(gran, { phone: grandPhone, name: 'Bà Nội', password: PASS });
  await tap(gran, 'Tạo tài khoản');
  await waitText(gran, 'Bạn có 1 lời mời gia đình');
  await tap(gran, 'Xem lời mời');
  await waitText(gran, 'Mẹ Hoa mời bạn');
  await tap(gran, 'Chấp nhận');
  await waitText(gran, 'Đang chờ chủ gia đình duyệt');
  await mom.reload({ waitUntil: 'networkidle0' });
  await waitText(mom, 'Bà Nội đã chấp nhận');
  await tap(mom, 'Duyệt');
  await waitText(mom, 'Bà Nội');
  await gran.goto(URL0 + '#/gia-dinh', { waitUntil: 'networkidle0' });
  await tap(gran, 'Nhà Cún');
  await waitText(gran, 'Người lớn và tài khoản trong gia đình');
  check('thành viên mới (bà) chưa thấy ghi chú của con trong 24 giờ đầu', !(await hasText(gran, 'Dị ứng')) && (await hasText(gran, 'Ghi chú của các con tạm ẩn')));
  await shot(gran, 'ba-vao-gia-dinh');
  const again = await newUser('dk-lai');
  await again.goto(URL0 + '#/dang-ky', { waitUntil: 'networkidle0' });
  await phoneInput(again, grandPhone); await tap(again, 'Gửi mã xác thực'); await waitText(again, 'Mã gồm 6 số');
  await fill(again, 'Mã xác thực', otpFor(grandPhone));
  await waitText(again, 'Số này đã có tài khoản 9app');
  await shot(again, 'dang-ky-so-da-co');
  await tap(again, 'Đặt mật khẩu mới');
  await fill(again, 'Mật khẩu mới', 'MatKhauMoi-2026');
  await tap(again, 'Đặt mật khẩu và đăng nhập');
  await waitText(again, 'Gia đình của tôi');
  await gran.reload({ waitUntil: 'networkidle0' });
  await waitText(gran, 'Đăng nhập 9app');
  check('đặt lại mật khẩu đăng xuất thiết bị cũ', true);
  await again.close();

  // ================= 5. Quên mật khẩu (số chưa có tài khoản đề nghị đăng ký) =================
  const forgot = await newUser('quen');
  await forgot.goto(URL0 + '#/quen-mat-khau', { waitUntil: 'networkidle0' });
  await shot(forgot, 'quen-mat-khau');
  const strange = newPhone();
  await phoneInput(forgot, strange); await tap(forgot, 'Gửi mã xác thực'); await waitText(forgot, 'Mã gồm 6 số');
  await fill(forgot, 'Mã xác thực', otpFor(strange));
  await waitText(forgot, 'chưa có tài khoản 9app');
  await shot(forgot, 'quen-mat-khau-chua-co-tk');
  await forgot.close();

  // ================= 6. Tài khoản: đổi mật khẩu, thiết bị, xóa tài khoản =================
  await mom.goto(URL0 + '#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitText(mom, 'Thiết bị đang đăng nhập');
  await shot(mom, 'tai-khoan');
  await tap(mom, 'Đổi mật khẩu');
  await fill(mom, 'Mật khẩu hiện tại', PASS); await fill(mom, 'Mật khẩu mới', 'MatKhau-Moi-9');
  await shot(mom, 'doi-mat-khau');
  await tap(mom, 'Đổi mật khẩu', '.sheet button');
  await waitText(mom, 'Đã đổi mật khẩu');
await waitText(mom, 'Thiết bị đang đăng nhập'); await sleep(900);
  await tap(mom, 'Xóa tài khoản');
  await waitText(mom, 'không thể hoàn tác');
  await fill(mom, 'Nhập mật khẩu để xác nhận', 'MatKhau-Moi-9');
  await tap(mom, 'Xóa tài khoản vĩnh viễn');
  await waitText(mom, 'Hãy chọn cách xử lý');
  await shot(mom, 'xoa-tai-khoan-chon');
  // chuyển quyền cho bà rồi xóa
  await mom.evaluate(() => { const r = document.querySelector('.sheet input[type=radio]'); r.click(); });
  await mom.select('.sheet select', await mom.evaluate(() => [...document.querySelectorAll('.sheet select option')].find((o) => o.value).value));
  await tap(mom, 'Xóa tài khoản vĩnh viễn');
  await waitText(mom, 'Tạo tài khoản 9app').catch(async () => { await waitText(mom, 'Đã xóa tài khoản'); });
  check('xóa tài khoản xong thì ra màn đăng ký', true);
  await mom.goto(URL0 + '#/dang-nhap', { waitUntil: 'networkidle0' });
  await phoneInput(mom, momPhone); await fill(mom, 'Mật khẩu', 'MatKhau-Moi-9');
  await tap(mom, 'Đăng nhập');
  await waitText(mom, 'không đúng');
  check('tài khoản đã xóa không đăng nhập lại được', true);

  // ================= 7. Bà đăng nhập bằng mật khẩu mới, thấy mình là chủ; giao diện tối, 360x740, máy tính =================
  const dark = await newUser('toi', { dark: true });
  await dark.goto(URL0 + '#/dang-nhap', { waitUntil: 'networkidle0' });
  await shot(dark, 'dang-nhap-toi');
  await phoneInput(dark, grandPhone); await fill(dark, 'Mật khẩu', 'MatKhauMoi-2026');
  await tap(dark, 'Đăng nhập');
  await waitText(dark, 'Gia đình của tôi');
  await shot(dark, 'gia-dinh-toi');
  await tap(dark, 'Nhà Cún');
  await waitText(dark, 'Chủ gia đình');
  await shot(dark, 'chi-tiet-toi');
  await dark.goto(URL0 + '#/loi-moi', { waitUntil: 'networkidle0' });
  await waitText(dark, 'Chưa có lời mời nào');
  await shot(dark, 'loi-moi-trong-toi');

  const small = await newUser('nho', { view: SMALL });
  await small.goto(URL0 + '#/dang-nhap', { waitUntil: 'networkidle0' });
  await shot(small, 'dang-nhap-360');
  await phoneInput(small, grandPhone); await fill(small, 'Mật khẩu', 'MatKhauMoi-2026'); await tap(small, 'Đăng nhập');
  await waitText(small, 'Gia đình của tôi');
  await tap(small, 'Nhà Cún'); await waitText(small, 'Chủ gia đình');
  await shot(small, 'chi-tiet-360');
  await tap(small, 'Mời người lớn'); await shot(small, 'moi-360');

  const desk = await newUser('may-tinh', { view: DESKTOP, desktop: true });
  await desk.goto(URL0 + '#/dang-nhap', { waitUntil: 'networkidle0' });
  await shot(desk, 'dang-nhap-may-tinh');
  await phoneInput(desk, grandPhone); await fill(desk, 'Mật khẩu', 'MatKhauMoi-2026'); await tap(desk, 'Đăng nhập');
  await waitText(desk, 'Gia đình của tôi');
  await tap(desk, 'Nhà Cún'); await waitText(desk, 'Chủ gia đình');
  await shot(desk, 'chi-tiet-may-tinh');
  await desk.keyboard.press('Tab');

  // con vẫn còn ở gia đình, nhưng mẹ đã xóa: con thấy gì?
  await kid.reload({ waitUntil: 'networkidle0' });
  await kid.goto(URL0 + '#/gia-dinh', { waitUntil: 'networkidle0' });
  await waitText(kid, 'Nhà Cún');
  check('con vẫn ở trong gia đình sau khi mẹ xóa tài khoản (bà làm chủ)', true);

  // ================= 8. Osin ở tên miền con riêng: đăng nhập bằng mã dùng một lần =================
  const osin = await newUser('osin');
  const state = 'trang-thai-e2e-0123456789';
  const authUrl = `${ORIGIN}/id/authorize?client=osin&redirect_uri=${encodeURIComponent(ORIGIN + '/osin-callback')}&state=${state}`;
  await osin.goto(authUrl, { waitUntil: 'networkidle0' });
  await waitText(osin, 'Đăng nhập 9app');
  check('chưa đăng nhập thì authorize chuyển sang trang đăng nhập 9id', osin.url().includes('/id/?next=') && osin.url().endsWith('#/dang-nhap'), osin.url());
  await phoneInput(osin, grandPhone); await fill(osin, 'Mật khẩu', 'MatKhauMoi-2026');
  await tap(osin, 'Đăng nhập');
  await waitText(osin, 'Cho phép Osin?');
  await shot(osin, 'cho-phep-osin');
  check('màn Cho phép nói rõ không chia sẻ số điện thoại', await hasText(osin, 'Không nhận số điện thoại'));
  await tap(osin, 'Cho phép Osin');
  for (let i = 0; i < 40 && !osin.url().includes('code='); i++) await sleep(200);
  const back = new URL(osin.url());
  check('sau khi cho phép được chuyển về Osin kèm mã và state', back.origin + back.pathname === ORIGIN + '/osin-callback' && back.searchParams.get('state') === state && /^[A-Za-z0-9_-]{43}$/.test(back.searchParams.get('code') || ''), osin.url());
  const idc = createNineId({ baseUrl: ORIGIN + '/id', keyId: 'osin', secret: process.env.INTERNAL_KEYS.split(':')[1] });
  const sess = await idc.exchange(back.searchParams.get('code'), 'osin', ORIGIN + '/osin-callback');
  check('máy chủ Osin đổi mã lấy phiên, mã dùng lại bị từ chối', !!sess.sessionId9id && await idc.exchange(back.searchParams.get('code'), 'osin', ORIGIN + '/osin-callback').then(() => false, () => true));
  check('phiên con còn hiệu lực', (await idc.sessionValid(sess.sessionId9id)).valid === true);
  // redirect_uri lạ: trang báo lỗi, không chuyển hướng
  const evil = await osin.goto(`${ORIGIN}/id/authorize?client=osin&redirect_uri=${encodeURIComponent('https://evil.example/x')}&state=${state}`, { waitUntil: 'networkidle0' });
  check('redirect_uri lạ bị 400 và ở lại 9id', evil.status() === 400 && osin.url().startsWith(ORIGIN + '/id/'), String(evil.status()));
  // thu hồi trong Tài khoản
  await osin.goto(URL0 + '#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitText(osin, 'Ứng dụng đã cho phép đăng nhập');
  await shot(osin, 'tai-khoan-ung-dung');
  await tap(osin, 'Thu hồi');
  await waitText(osin, 'Đã thu hồi quyền của Osin');
  check('thu hồi quyền thì phiên con của Osin mất', (await idc.sessionValid(sess.sessionId9id)).valid === false);

  // truy cập khi chưa đăng nhập vào trang riêng -> về đăng nhập
  const anon = await newUser('khach');
  await anon.goto(URL0 + '#/tai-khoan', { waitUntil: 'networkidle0' });
  await waitText(anon, 'Đăng nhập 9app');
  await anon.goto(URL0 + '#/gia-dinh/00000000-0000-4000-8000-000000000000', { waitUntil: 'networkidle0' });
  await waitText(anon, 'Đăng nhập 9app');
  check('chưa đăng nhập vào trang riêng thì về đăng nhập', true);
  // đã đăng nhập, gia đình không có: thông báo, không lộ
  await dark.goto(URL0 + '#/gia-dinh/00000000-0000-4000-8000-000000000000', { waitUntil: 'networkidle0' });
  await waitText(dark, 'Không tìm thấy gia đình');
} catch (e) {
  problems.push('NGOẠI LỆ: ' + e.message);
  console.error(e);
  try { for (const p of await browser.pages()) { await p.screenshot({ path: path.join(SHOTS, `loi-${p.__name || 'x'}.png`) }).catch(() => {}); } } catch { /* */ }
}

await browser.close();
await app.close();
await (await import("../src/db.js")).close();
await pg.stop();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} kiểm tra đạt, ${shotNo} ảnh ở ${SHOTS}`);
if (problems.length) { console.log('\nVẤN ĐỀ:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('Không có lỗi console / pageerror / requestfailed.');
process.exit(0);
