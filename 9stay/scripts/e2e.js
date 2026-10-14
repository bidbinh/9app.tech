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
const { startServer, apiWorld, makeFakeId } = await import('../test/helper-http.js');
await boot();
const w = await apiWorld();
const e2eId = makeFakeId();
const otpSent = e2eId.sent;
const srv = await startServer({ idClient: e2eId });
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
const waitText = (page, t, timeout = 8000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t).catch(async () => { const body = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => ''); throw new Error('Không thấy chữ: ' + t + ' | trang đang hiện: ' + body.split('\n').join(' / ')); });
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

  await hash(mp, '#/bao-cao');
  await waitText(mp, 'Công suất và doanh thu phòng');
  await waitText(mp, 'RevPAR');
  check((await text(mp)).includes('Doanh thu phòng'), 'báo cáo công suất/ADR/RevPAR hiển thị');
  await snap(mp, 'quanly-bao-cao');
  await hash(mp, '#/buong');
  await waitText(mp, 'Thêm việc dọn');
  await setValue(mp, 'input[placeholder^="Ghi chú (ví dụ"]', 'thay ga');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Thêm việc dọn');
  await waitText(mp, 'Chưa dọn');
  await clickText(mp, 'button', 'Bắt đầu dọn');
  await waitText(mp, 'Đang dọn');
  check(true, 'quản lý thêm và bắt đầu việc dọn');
  await hash(mp, '#/ket-noi');
  await waitText(mp, 'Nhập lịch từ OTA');
  await clickText(mp, 'button', 'Lấy địa chỉ lịch của căn');
  await waitText(mp, '/api/ical/out/');
  check(true, 'quản lý lấy được địa chỉ lịch xuất iCal');
  await snap(mp, 'quanly-ket-noi');
  const hk = await open('buongphong', [390, 844]);
  await waitText(hk.page, 'thay ga');
  const hkText = await text(hk.page);
  check(hkText.includes('Buồng phòng') && !hkText.includes('Thêm việc dọn') && !/Bản kê|Giá\n/.test(hkText), 'buồng phòng chỉ thấy danh sách việc dọn');
  await snap(hk.page, 'buong-phong');
  await hk.close();
  await hash(mp, '#/ngan-hang');
  await waitText(mp, 'Trang đặt phòng cho khách');
  check(true, 'quản lý có ô cấu hình trang đặt phòng cho khách');

  // danh mục nền: tòa → loại phòng → chủ → căn hàng loạt → hợp đồng → mở bán
  await hash(mp, '#/danh-muc');
  await waitText(mp, '1. Tòa nhà');
  const step = async (sel, value, button, toastText) => {
    if (sel) await setValue(mp, sel, value);
    await clearToasts(mp);
    await clickText(mp, 'button', button);
    try { await waitText(mp, toastText); } catch (e) {
      const err = await mp.evaluate(() => [...document.querySelectorAll('.err')].map((x) => x.textContent).join(' | '));
      throw new Error(`${e.message} (lỗi trên trang: ${err || 'không có'})`);
    }
  };
  await step('input[placeholder="Ví dụ: Vinhomes Ocean Park"]', 'Tòa E2E', 'Thêm tòa nhà', 'Đã thêm tòa nhà');
  await step('input[placeholder^="Studio, 1 phòng"]', 'Studio E2E', 'Thêm loại phòng', 'Đã thêm loại phòng');
  await step('input[placeholder="Tên chủ phòng"]', 'Chủ E2E', 'Thêm chủ phòng', 'Đã thêm chủ phòng');
  await step('textarea', 'E2E-1\nE2E-2', 'Thêm các căn', 'Đã thêm 2 căn');
  await mp.evaluate(() => document.querySelector('input[aria-label="Chọn căn E2E-1"]').click());
  await step(null, null, 'Tạo hợp đồng cho các căn đã chọn', 'Đã tạo 1 hợp đồng');
  await step(null, null, 'Mở bán cho các căn đã chọn', 'Đã mở 90 đêm cho 1 căn');
  check((await text(mp)).includes('E2E-2') && (await text(mp)).includes('Chưa có HĐ'), 'danh mục hiện căn mới, căn chưa chọn chưa có hợp đồng');
  await snap(mp, 'quanly-danh-muc');

  // chợ phòng: chủ đăng tin → admin duyệt → khách tìm, xem chi tiết và đặt (điện thoại)
  await db.query("UPDATE orgs SET slug = 'anstay', public_enabled = true WHERE id = $1", [w.orgId]);
  const ow = await open('chu1', [390, 844]);
  const op1 = ow.page;
  await hash(op1, '#/phong');
  await waitText(op1, 'Đăng phòng, gửi duyệt');
  await clickText(op1, 'a', '+ Đăng phòng mới');
  await waitText(op1, 'Đăng phòng mới');
  await setValue(op1, 'input[placeholder^="Ví dụ: Studio"]', 'Studio view biển E2E');
  await clickText(op1, 'button', 'Tạo tin và tiếp tục');
  await waitText(op1, 'Thông tin phòng');
  await setValue(op1, 'textarea[placeholder^="Mỗi dòng một mã căn mới"]', 'E2E-901');
  await clickText(op1, 'button', 'Thêm căn');
  await waitText(op1, 'Chưa hoạt động (chờ duyệt)');
  await op1.evaluate(async () => {
    const dt = new DataTransfer();
    for (let i = 0; i < 3; i++) {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 900;
      const g = cv.getContext('2d'); g.fillStyle = ['#0f766e', '#b45309', '#1d4ed8'][i]; g.fillRect(0, 0, 1200, 900); g.fillStyle = '#fff'; g.font = '64px sans-serif'; g.fillText('Anh ' + (i + 1), 480, 470);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      dt.items.add(new File([blob], 'p' + i + '.png', { type: 'image/png' }));
    }
    const inp = document.getElementById('photo-input'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitText(op1, 'Ảnh (3/12)', 25000);
  await setValue(op1, 'textarea[maxlength="4000"]', 'Căn studio sáng sủa, đầy đủ tiện nghi, gần biển, thích hợp cho gia đình nhỏ và cặp đôi muốn nghỉ dưỡng thoải mái.');
  await setValue(op1, 'input[placeholder="đ/đêm, chưa gồm VAT"]', '600000');
  await setValue(op1, 'input[placeholder="Thứ Sáu, thứ Bảy"]', '800000');
  await op1.evaluate(() => document.getElementById('attest').click());
  await op1.evaluate(() => document.getElementById('am-wifi').click());
  await clearToasts(op1);
  await clickText(op1, 'button', 'Gửi duyệt');
  await waitText(op1, 'Tin đang chờ admin duyệt');
  await snap(op1, 'chu-tin-cho-duyet');
  check(true, 'chủ tạo tin, thêm căn, tải 3 ảnh (tự thu nhỏ) và gửi duyệt');
  await ow.close();

  await hash(mp, '#/duyet');
  await waitText(mp, 'Studio view biển E2E');
  await mp.evaluate(() => document.querySelector('a.item[href^="#/duyet/"]').click());
  await waitText(mp, 'Duyệt: giá và điều khoản');
  await snap(mp, 'admin-duyet-tin');
  await clearToasts(mp);
  await clickText(mp, 'button', 'Duyệt tin');
  await waitText(mp, 'Đã duyệt, tin đang hiển thị');
  check(true, 'admin xem trước và duyệt tin');
  const [e2eUnit] = await db.query("SELECT id FROM units WHERE code = 'E2E-901'");
  const { Api: Api2 } = await import('../test/helper-http.js');
  const r2 = await new Api2(srv, w.users.chu1).post('/api/units/' + e2eUnit.id + '/release', { action: 'open', from: '2026-11-02', to: '2026-11-12' });
  check(r2.status === 200, 'chủ mở đêm cho thuê');

  const gu = await open(null, [390, 844]);
  const gp = gu.page;
  await gp.goto(srv.base + '/book/anstay', { waitUntil: 'networkidle0' });
  await waitText(gp, 'Studio view biển E2E');
  check(await gp.$eval('.lcard img', (i) => i.complete && i.naturalWidth > 0), 'thẻ phòng có ảnh bìa');
  await snap(gp, 'khach-ket-qua');
  await gp.evaluate(() => document.querySelector('a.lcard').click());
  await waitText(gp, 'Giới thiệu');
  const gdates = await gp.$$('input[type=date]');
  await gdates[0].evaluate((el) => { el.value = '2026-11-03'; });
  await gdates[1].evaluate((el) => { el.value = '2026-11-05'; });
  await clickText(gp, 'button', 'Xem giá');
  await waitText(gp, 'Chi tiết giá');
  check((await text(gp)).includes('1.320.000'), 'khách thấy tổng 2 đêm ngày thường 1.320.000đ đã gồm VAT');
  await snap(gp, 'khach-chi-tiet');
  await clickText(gp, 'button', 'Đặt phòng');
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
  await hash(op, '#/lich');
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
