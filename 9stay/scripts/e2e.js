// `npm run e2e`: kiểm tra giao diện thật bằng Chrome (puppeteer-core): quản lý, lễ tân, CTV, chủ phòng; điện thoại 390x844,
// 360x740 và máy tính 1280x800; sáng và tối. Dựng PostgreSQL tạm, máy chủ thật và 9id giả (cookie nine_sid = "tok:<userId>").
// Cần Chrome (CHROME_PATH) và puppeteer-core (PUPPETEER_CORE = đường dẫn ESM của puppeteer-core.js). Ảnh chụp vào shots/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PPT = process.env.PUPPETEER_CORE;
if (!PPT) { console.error('Đặt PUPPETEER_CORE tới puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'); process.exit(2); }
if (!fs.existsSync(CHROME)) { console.error('Không thấy Chrome: ' + CHROME); process.exit(2); }

const pg = await startEmbedded({ database: 'stay_e2e' });
process.env.DATABASE_URL = pg.url;
const { db, boot } = await import('../test/helper.js');
const { startServer, apiWorld } = await import('../test/helper-http.js');
await boot();
const w = await apiWorld();
const otpSent = [];
const srv = await startServer({ otpSender: { send: async (phone, code) => { otpSent.push({ phone, code }); } } });
const START = srv.base + '/';

const shots = path.join(process.cwd(), 'shots');
fs.mkdirSync(shots, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9stay-chrome-'));
const { default: puppeteer } = await import(pathToFileURL(path.resolve(PPT)).href);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const problems = [];
let passed = 0;
const check = (cond, msg) => { if (cond) passed += 1; else { problems.push(msg); console.error('  ✗ ' + msg); } };

async function open(role, size = [1280, 800], scheme = 'light') {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: size[0], height: size[1], deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  page.on('pageerror', (e) => problems.push(`[${role}] lỗi trang: ${e.message}`));
  // 'Failed to load resource' chỉ là bản sao ở mức mạng của lỗi API mà giao diện đã xử lý (401 khi chưa đăng nhập, 409 khi còn nợ...).
  // Mọi thứ khác (lỗi script, vi phạm CSP 'Refused to ...') vẫn bị tính là vấn đề.
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource/.test(m.text())) problems.push(`[${role}] console ${m.type()}: ${m.text()}`); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'ref-e2e-' + Date.now() : undefined));
  if (role) await page.setCookie({ name: 'nine_sid', value: 'tok:' + w.users[role], url: srv.origin });
  await page.goto(START, { waitUntil: 'networkidle0' });
  return { page, close: () => ctx.close() };
}
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 8000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t).catch(() => { throw new Error('Không thấy chữ: ' + t); });
const snap = (page, name) => page.screenshot({ path: path.join(shots, name + '.png') });
const setValue = (page, sel, v) => page.$eval(sel, (el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const clickText = (page, tag, t) => page.evaluate((tg, x) => { const el = [...document.querySelectorAll(tg)].find((e) => e.textContent.trim() === x); if (!el) throw new Error('Không có ' + tg + ': ' + x); el.click(); }, tag, t);
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
const selectByText = (page, sel, label) => page.$eval(sel, (el, t) => { const o = [...el.options].find((x) => x.text.startsWith(t)); if (!o) throw new Error('Không có lựa chọn: ' + t); el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); }, label);
const hash = (page, h) => page.evaluate((x) => { location.hash = x; }, h);

try {
  // ---- 1. Cổng vào: chưa đăng nhập, chưa có mã mời ----
  {
    const s = await open(null, [390, 844]);
    check((await text(s.page)).includes('Đăng nhập'), 'chưa đăng nhập thấy nút Đăng nhập');
    check((await s.page.$eval('a.btn', (a) => a.getAttribute('href'))).startsWith('/id/?next='), 'nút đăng nhập chuyển sang /id/?next=');
    await snap(s.page, 'gate-login');
    await s.close();
    const o = await open('outsider', [390, 844], 'dark');
    check((await text(o.page)).includes('Nhập mã mời'), 'người chưa là thành viên thấy ô nhập mã mời');
    await snap(o.page, 'gate-invite-dark');
    await o.close();
  }

  // ---- 2. Quản lý (máy tính): lịch, tạo đơn, thu cọc, nhận/trả phòng ----
  const mgr = await open('quanly', [1280, 800]);
  const mp = mgr.page;
  await waitText(mp, 'A1205');
  const t0 = await text(mp);
  check(t0.includes('A1205') && t0.includes('A1206') && t0.includes('B1'), 'quản lý thấy cả ba căn trên lịch');
  check(await mp.$('table.cal') !== null, 'lịch là bảng');
  await snap(mp, 'quanly-lich');

  await hash(mp, '#/tao');
  await waitText(mp, 'Tìm phòng trống');
  await setValue(mp, 'input[type=date]:nth-of-type(1)', '2026-11-12');
  const dates = await mp.$$('input[type=date]');
  await dates[0].evaluate((el) => { el.value = '2026-11-12'; });
  await dates[1].evaluate((el) => { el.value = '2026-11-14'; });
  await clickText(mp, 'button', 'Tìm phòng trống');
  await waitText(mp, 'Còn 3 căn');
  await clickText(mp, 'button', 'Chọn');
  await waitText(mp, 'Tổng (đã gồm VAT)');
  const q = await text(mp);
  check(q.includes('1.430.000'), 'báo giá 2 đêm = 1.430.000đ gồm VAT');
  check(q.includes('Cọc yêu cầu') && q.includes('429.000'), 'cọc yêu cầu 429.000đ');
  await snap(mp, 'quanly-bao-gia');
  const inputs = await mp.$$('input[maxlength="120"]');
  await inputs[0].type('Nguyễn Văn Lan');
  await clickText(mp, 'button', 'Tạo đơn giữ chỗ');
  await waitText(mp, 'Ghi nhận tiền (chuyển khoản)'); // đã sang màn chi tiết đơn
  await waitText(mp, 'ST1000');
  check((await text(mp)).includes('Giữ chỗ'), 'đơn vừa tạo ở trạng thái Giữ chỗ');
  const detailUrl = mp.url();

  // thu cọc đủ → Đã cọc
  await setValue(mp, 'input[type=number]', '429000');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Ghi nhận');
  await waitText(mp, 'Đã ghi nhận');
  await waitText(mp, 'Đã cọc');
  check((await text(mp)).includes('Đã thu') && (await text(mp)).includes('429.000'), 'đã thu 429.000đ');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Nhận phòng');
  await waitText(mp, 'Đã nhận phòng');
  await waitText(mp, 'Đang ở');
  // còn nợ thì trả phòng báo lỗi rõ ràng bằng tiếng Việt
  await clickText(mp, 'button', 'Trả phòng & quyết toán');
  await waitText(mp, 'còn nợ');
  check(true, 'trả phòng khi còn nợ hiện lỗi tiếng Việt');
  await mp.evaluate(() => { document.querySelectorAll('.err').forEach((e) => e.remove()); });
  await setValue(mp, 'input[type=number]', '1001000');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Ghi nhận');
  await waitText(mp, 'Đã ghi nhận');
  await waitText(mp, 'Trả phòng & quyết toán');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Trả phòng & quyết toán');
  await waitText(mp, 'Đã trả phòng');
  check((await text(mp)).includes('Đã trả'), 'trả phòng và quyết toán thành công');
  await snap(mp, 'quanly-don-da-tra');

  // bản kê chủ phòng: chốt, chi
  await hash(mp, '#/ban-ke');
  await waitText(mp, 'Bản kê chủ phòng');
  await selectByText(mp, 'select', 'Minh');
  await setValue(mp, 'input[type=month]', '2026-10');
  await clickText(mp, 'button', 'Xem trước kỳ');
  await waitText(mp, 'Phải chi');
  const st = await text(mp);
  check(st.includes('ST1000') && st.includes('760.000'), 'bản kê xem trước có đơn ST1000, phải chi 760.000đ');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Chốt bản kê');
  await waitText(mp, 'Đã chốt bản kê');
  await waitText(mp, 'Ghi chi trả');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Ghi chi trả');
  await waitText(mp, 'Đã ghi chi trả');
  await waitText(mp, 'Đã chi');
  check(true, 'chi trả chủ phòng');
  await snap(mp, 'quanly-ban-ke');
  await clickText(mp, 'button', 'Xem tiền giữ hộ');
  await waitText(mp, 'Sổ ngân hàng');
  await snap(mp, 'quanly-giu-ho');

  // thành viên và mã mời
  await hash(mp, '#/thanh-vien');
  await waitText(mp, 'Mời thành viên');
  await clickText(mp, 'button', 'Tạo mã mời');
  await waitText(mp, 'Mã mời (chỉ hiện một lần');
  const code = await mp.$eval('#invite-code', (e) => e.textContent);
  check(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/.test(code), 'mã mời đúng định dạng');
  await snap(mp, 'quanly-thanh-vien');
  // dùng mã mời bằng người ngoài
  const ou = await open('outsider', [390, 844]);
  await ou.page.type('input', code);
  await clickText(ou.page, 'button', 'Vào tổ chức');
  await ou.page.waitForFunction(() => document.querySelector('nav.nav') !== null, { timeout: 8000 });
  check((await text(ou.page)).includes('Lễ tân'), 'người ngoài dùng mã mời thành Lễ tân');
  await ou.close();

  // giá
  await hash(mp, '#/gia');
  await waitText(mp, 'Giá theo đêm');
  await setValue(mp, 'input[placeholder="Giá trước VAT mỗi đêm"]', '700000');
  await clickText(mp, 'button', 'Lưu giá');
  await waitText(mp, 'Đã lưu giá');
  check(true, 'lưu giá thành công');
  await snap(mp, 'quanly-gia');

  // ngân hàng: tài khoản nhận tiền, hàng chờ lệch, mã QR trong chi tiết đơn
  await hash(mp, '#/ngan-hang');
  await waitText(mp, 'Tài khoản nhận tiền');
  await setValue(mp, 'input[placeholder="970436"]', '970436');
  await setValue(mp, 'input[placeholder="Số tài khoản"]', '0123456789');
  await setValue(mp, 'input[placeholder="TEN CONG TY"]', 'CONG TY ANSTAY');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Lưu tài khoản');
  await waitText(mp, 'Đã lưu tài khoản nhận tiền');
  check((await text(mp)).includes('/api/bank/webhook/'), 'hiện địa chỉ webhook sau khi lưu tài khoản');
  const { ingestBankTx } = await import('../src/bank.js');
  await db.tx((c) => ingestBankTx(c, { orgId: w.orgId, provider: 'webhook', bankTxId: 'e2e-1', amount: 500000, content: 'ck khong ro' }, { now: new Date() }));
  await hash(mp, '#/lich');
  await hash(mp, '#/ngan-hang');
  await waitText(mp, 'Lệch thanh toán (1)');
  await snap(mp, 'quanly-ngan-hang');
  await setValue(mp, 'input[placeholder^="Lý do bỏ qua"]', 'đã hoàn khách');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Bỏ qua');
  await waitText(mp, 'Lệch thanh toán (0)');
  check(true, 'bỏ qua giao dịch lệch có ghi chú');
  const { Api } = await import('../test/helper-http.js');
  const qapi = new Api(srv, w.users.quanly);
  const qq = await qapi.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-11-20', checkout: '2026-11-22', adults: 2 });
  const qb = await qapi.post('/api/bookings', { roomTypeId: w.roomTypeId, checkin: '2026-11-20', checkout: '2026-11-22', guestName: 'Khách QR', adults: 2, quoteId: qq.json.id });
  await hash(mp, '#/don/' + qb.json.booking.id);
  await waitText(mp, 'Thanh toán bằng QR');
  await clickText(mp, 'button', 'Hiện mã QR chuyển khoản');
  await waitText(mp, 'Nội dung (bắt buộc đúng)');
  check(await mp.$eval('img.qr', (i) => i.complete && i.naturalWidth > 0), 'mã QR hiện ra (ảnh data: không bị CSP chặn)');
  check((await text(mp)).includes(qb.json.booking.code), 'nội dung chuyển khoản là mã đơn');
  await snap(mp, 'quanly-qr');

  // trang đặt phòng công khai của khách (điện thoại): tìm → OTP → giữ phòng → QR → tiền về → đã cọc
  await db.query("UPDATE orgs SET slug = 'anstay', public_enabled = true WHERE id = $1", [w.orgId]);
  const gu = await open(null, [390, 844]);
  const gp = gu.page;
  await gp.goto(srv.base + '/book/anstay', { waitUntil: 'networkidle0' });
  await waitText(gp, 'Tìm phòng');
  const gdates = await gp.$$('input[type=date]');
  await gdates[0].evaluate((el) => { el.value = '2026-11-02'; });
  await gdates[1].evaluate((el) => { el.value = '2026-11-04'; });
  await clickText(gp, 'button', 'Tìm phòng');
  await waitText(gp, 'Giá đã gồm VAT');
  await snap(gp, 'khach-ket-qua');
  await clickText(gp, 'button', 'Chọn');
  await waitText(gp, 'Thông tin của bạn');
  await gp.type('input[autocomplete=name]', 'Trần Thị Khách');
  await gp.type('input[type=tel]', '0912345678');
  await clickText(gp, 'button', 'Gửi mã xác thực');
  await waitText(gp, 'Đã gửi mã');
  await gp.type('input[autocomplete=one-time-code]', otpSent.at(-1).code);
  await clickText(gp, 'button', 'Xác nhận và giữ phòng');
  await waitText(gp, 'Nội dung chuyển khoản');
  check(await gp.$eval('img.qr', (i) => i.complete && i.naturalWidth > 0), 'khách thấy mã QR chuyển khoản');
  check(/^\d+:\d{2}$/.test(await gp.$eval('#left', (e) => e.textContent)), 'có đồng hồ đếm ngược giữ phòng');
  const gcode = await gp.$eval('.code', (e) => e.textContent);
  const [gb] = await db.query('SELECT deposit_required FROM bookings WHERE code = $1', [gcode]);
  await snap(gp, 'khach-thanh-toan');
  await db.tx((c) => ingestBankTx(c, { orgId: w.orgId, provider: 'webhook', bankTxId: 'e2e-guest', amount: gb.deposit_required, content: gcode }, { now: new Date() }));
  await waitText(gp, 'Đã nhận cọc', 15000);
  check(true, 'tiền về qua webhook thì trang của khách tự chuyển sang đã cọc');
  await snap(gp, 'khach-da-coc');
  await gu.close();
  await mgr.close();

  // ---- 3. CTV (điện thoại): tìm, báo giá, giữ chỗ; không lộ căn ----
  const ctv = await open('ctv1', [390, 844]);
  const cp = ctv.page;
  await waitText(cp, 'Tìm phòng & giữ chỗ');
  const cd = await cp.$$('input[type=date]');
  await cd[0].evaluate((el) => { el.value = '2026-11-20'; });
  await cd[1].evaluate((el) => { el.value = '2026-11-22'; });
  await clickText(cp, 'button', 'Tìm phòng trống');
  await waitText(cp, 'Deluxe');
  await clickText(cp, 'button', 'Chọn');
  await waitText(cp, 'Hoa hồng dự kiến');
  check((await text(cp)).includes('Hoa hồng dự kiến'), 'CTV thấy hoa hồng dự kiến');
  await snap(cp, 'ctv-bao-gia');
  const gi = await cp.$$('input[maxlength="120"]');
  await gi[0].type('Trần Thị Hà');
  await clickText(cp, 'button', 'Giữ chỗ');
  await waitText(cp, 'Giữ chỗ đến');
  const ctvText = await text(cp);
  check(!/A120[56]|Sunrise|Minh/.test(ctvText), 'CTV không thấy mã căn, tòa, chủ phòng trên chi tiết đơn');
  check(ctvText.includes('Deluxe'), 'CTV thấy loại phòng');
  await snap(cp, 'ctv-don');
  await hash(cp, '#/hoa-hong');
  await waitText(cp, 'Hoa hồng của tôi');
  await ctv.close();

  // ---- 4. Chủ phòng (điện thoại nhỏ, tối): chỉ thấy căn của mình, chặn ngày ----
  const own = await open('chu1', [360, 740], 'dark');
  const op = own.page;
  await waitText(op, 'A1205');
  const ot = await text(op);
  check(ot.includes('A1206') && !ot.includes('B1\n') && !/\bB1\b/.test(ot.split('Chặn / mở bán ngày')[0]), 'chủ phòng chỉ thấy căn của mình trên lịch');
  const od = await op.$$('.card input[type=date]');
  await od[1].evaluate((el) => { el.value = '2026-11-25'; });
  await od[2].evaluate((el) => { el.value = '2026-11-27'; });
  await clickText(op, 'button', 'Áp dụng');
  await waitText(op, 'Đã chặn 2 đêm');
  check(true, 'chủ chặn 2 đêm');
  await snap(op, 'chu-lich-dark');
  const noOverflow = await op.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(noOverflow, 'trang không tràn ngang ở 360px (bảng lịch cuộn trong khung riêng)');
  await own.close();

  // ---- 5. Lễ tân (máy tính, tối): thấy lịch và đơn, không có tab quản lý ----
  const rec = await open('letan', [1280, 800], 'dark');
  await waitText(rec.page, 'A1205');
  const rt = await text(rec.page);
  check(!rt.includes('Bản kê') && !rt.includes('Thành viên') && !rt.includes('Giá\n'), 'lễ tân không có tab Bản kê/Giá/Thành viên');
  await hash(rec.page, '#/don');
  await waitText(rec.page, 'ST1000');
  await snap(rec.page, 'letan-don-dark');
  await rec.close();
} catch (e) {
  problems.push('Kịch bản dừng giữa chừng: ' + e.message);
  console.error(e);
}

await browser.close();
await srv.close();
await db.close();
await pg.stop();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* Windows có thể còn khóa tệp */ }
console.log(`\ne2e: ${passed} kiểm tra đạt, ${problems.length} vấn đề`);
for (const p of problems) console.log(' - ' + p);
process.exit(problems.length ? 1 : 0);
