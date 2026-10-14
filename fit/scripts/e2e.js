// Kiểm thử giao diện thật bằng Chrome headless (puppeteer-core): luồng sàng lọc, ghi buổi tập, hẹn giờ nghỉ (dịch đồng hồ),
// chương trình, khởi động có hẹn giờ, biểu đồ, xuất/nhập/xóa, ngoại tuyến; kiểm tràn ngang và vùng chạm; chụp ảnh vào shots/.
// Chạy: node scripts/e2e.js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

// ---------- Máy chủ tĩnh, cổng ngẫu nhiên >= 21000 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/id/api/me') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"user":null}'); }   // 9id giả: chưa đăng nhập (thẻ đồng bộ chỉ cần biết điều này)
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
let port = 0;
for (let i = 0; i < 60 && !port; i++) {
  const cand = 29000 + Math.floor(Math.random() * 8000);
  await new Promise((r) => { server.once('error', () => r()); server.listen(cand, '127.0.0.1', () => { port = cand; r(); }); });
}
if (!port) throw new Error('không mở được cổng');
const ORIGIN = `http://127.0.0.1:${port}`;
console.log('máy chủ thử:', ORIGIN);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9fit-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`] });

const ketQua = []; const loiConsole = [];
let nhom = '';
function check(ten, ok, chiTiet = '') {
  ketQua.push({ ten: `[${nhom}] ${ten}`, ok: !!ok });
  console.log(`${ok ? 'ĐẠT' : 'LỖI'}  [${nhom}] ${ten}${ok ? '' : '  -> ' + chiTiet}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KHOI_TAO = `
(() => {
  window.__skew = 0;
  const real = Date.now.bind(Date);
  Date.now = () => real() + window.__skew;
  window.__said = [];
  window.__rung = [];
  try { navigator.vibrate = (p) => { window.__rung.push(p); return true; }; } catch (e) {}
  class U { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.__said.push(u.text), cancel() {}, getVoices: () => [] } });
})();`;

async function moTrang(ctxB, { w = 390, h = 844, sang = true, duongDan = '/index.html#/' } = {}) {
  const page = await ctxB.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: sang ? 'light' : 'dark' }]);
  await page.evaluateOnNewDocument(KHOI_TAO);
  page.on('console', (m) => { if (m.type() === 'error' && !page.__boQuaLoi) loiConsole.push(`[${nhom}] ${m.text()}`); });
  page.on('pageerror', (e) => loiConsole.push(`[${nhom}] pageerror: ${e.message}`));
  await page.goto(ORIGIN + duongDan, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForSelector('#view > *', { timeout: 8000 });
  return page;
}
const diDen = async (page, hash) => { await page.evaluate((x) => { location.hash = x; }, hash); await sleep(300); await page.waitForFunction(() => document.querySelector('#view').children.length > 0, { timeout: 15000 }); await sleep(150); };
const cho = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, { timeout: ms }, arg).catch(() => null);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const co = async (page, sel) => !!(await page.$(sel));
const giua = (page, sel) => page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
const bam = async (page, sel) => { await page.waitForSelector(sel, { visible: true, timeout: 8000 }); await giua(page, sel); await page.click(sel); await sleep(120); };
const go = async (page, sel, v) => { await page.waitForSelector(sel, { visible: true, timeout: 8000 }); await giua(page, sel); await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Backspace'); await page.type(sel, String(v)); };
const chup = (page, ten) => page.screenshot({ path: path.join(SHOTS, `${ten}.png`) });
const chupDay = (page, ten) => page.screenshot({ path: path.join(SHOTS, `${ten}.png`), fullPage: true });

async function kiemBoCuc(page, nhan) {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const tran = de.scrollWidth > de.clientWidth + 1;
    const nho = [];
    const sel = 'button, .chip, .btn, input:not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea, .item, .tile, .tabbar a, .pill9, .brand, .seg-b, .lnk';
    for (const e of document.querySelectorAll(sel)) {
      if (e.closest('[hidden]') || e.closest('.offscreen')) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.height < 43.5 || (b.width < 43.5 && !e.matches('input'))) nho.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    let chuNho = 0; const chuNhoDs = [];
    for (const e of document.querySelectorAll('#view *, .tabbar *, .topbar *')) {
      if (!e.childNodes.length) continue;
      const coChu = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!coChu) continue;
      if (e.closest('svg') || e.closest('.offscreen')) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (parseFloat(cs.fontSize) < 13.5) { chuNho++; chuNhoDs.push(e.tagName.toLowerCase() + '.' + (e.className.baseVal ?? e.className) + ' ' + cs.fontSize); }
    }
    return { tran, nho: nho.slice(0, 6), chuNho, chuNhoDs: chuNhoDs.slice(0, 5) };
  });
  check(`${nhan}: không tràn ngang`, !r.tran);
  check(`${nhan}: vùng chạm >= 44px`, r.nho.length === 0, r.nho.join(' | '));
  check(`${nhan}: chữ >= 14px`, r.chuNho === 0, r.chuNhoDs.join(" | "));
}

const CAU = ['tim', 'nguc-gang-suc', 'nguc-nghi', 'choang', 'thai', 'xuong-khop', 'man-tinh', 'thuoc', 'khac', 'it-van-dong'];
async function lamSangLoc(page, tuoi, co = []) {
  await diDen(page, '#/them/suc-khoe/sang-loc');
  await go(page, '#sl-tuoi', String(tuoi));
  for (const q of CAU) { const s = `[data-testid="q-${q}-${co.includes(q) ? 'co' : 'khong'}"]`; await giua(page, s); await page.click(s); }
  await bam(page, '[data-testid="sl-gui"]');
}
async function taiPhienMoi() { return browser.createBrowserContext(); }

// ======================================================================
nhom = 'Khởi động và bố cục';
{
  const cx = await taiPhienMoi();
  const page = await moTrang(cx);
  check('trang mở được, tiêu đề đúng', (await page.title()).includes('9fit'));
  check('nút ‹ 9app có', await co(page, '#ve-9app'));
  check('thanh dưới có đúng 5 mục', (await page.$$('.tabbar a')).length === 5);
  check('banner chưa sàng lọc hiện ở Hôm nay', await co(page, '[data-testid="banner-chua"]'));
  check('Hôm nay có tải tuần', await co(page, '[data-testid="tai-tuan"]'));
  check('CSP có trên trang', await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.content.includes("script-src 'self'")));
  await kiemBoCuc(page, 'Hôm nay 390');
  await chupDay(page, '01-hom-nay-390-sang');
  await page.close(); await cx.close();
}

// ======================================================================
nhom = 'Sàng lọc sức khỏe';
let cxChinh;
{
  cxChinh = await taiPhienMoi();
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/them/suc-khoe/sang-loc' });
  await chup(page, '02-sang-loc-390-sang');
  await bam(page, '[data-testid="sl-gui"]');
  check('gửi trống thì báo lỗi', await page.$eval('[data-testid="sl-loi"]', (e) => !e.hidden));
  await go(page, '#sl-tuoi', '14');
  for (const q of CAU) { const s = `[data-testid="q-${q}-khong"]`; await giua(page, s); await page.click(s); }
  await bam(page, '[data-testid="sl-gui"]');
  check('dưới 16 tuổi: kết quả dừng lại', await co(page, '[data-testid="kq-dung"]'));
  await go(page, '#sl-tuoi', '30');
  await bam(page, '[data-testid="q-choang-co"]');
  await bam(page, '[data-testid="sl-gui"]');
  check('trả lời "có" chóng mặt: dừng lại, không tạo chương trình', await co(page, '[data-testid="kq-dung"]'));
  await chupDay(page, '03-sang-loc-dung-lai-390-sang');
  await diDen(page, '#/tap/chuong-trinh/cau-long-4t');
  check('chương trình bị khóa khi dừng lại', await co(page, '[data-testid="gate-dung"]') && !(await co(page, '[data-testid="form-ap"]')));
  await diDen(page, '#/thu-vien');
  check('vẫn xem được thư viện', (await page.$$('[data-ex]')).length > 20);
  await diDen(page, '#/tap/ghi');
  check('C2: dừng lại thì màn ghi buổi bị khóa', await co(page, '[data-testid="ghi-bi-khoa"]') && !(await co(page, '[data-testid="editor"]')));
  await diDen(page, '#/tap/ghi?ct=cau-long-4t:2026-10-05');
  check('C2: mở thẳng đường dẫn buổi chương trình cũng bị khóa', await co(page, '[data-testid="ghi-bi-khoa"]'));
  await diDen(page, '#/thu-vien/plank');
  check('C2: thư viện báo bài không thêm được', await co(page, '[data-testid="bai-han-che"]'));
  await bam(page, '[data-testid="them-vao-buoi"]');
  check('C2: bấm thêm bài bị từ chối', (await text(page, '.toast')).includes('hỏi bác sĩ'));
  await diDen(page, '#/tien-do/test');
  check('C2: bài kiểm tra bị khóa khi dừng lại', await co(page, '[data-testid="test-bi-khoa"]') && !(await co(page, '[data-testid="luu-test"]')));
  await lamSangLoc(page, 30, ['man-tinh']);
  check('C3: bệnh mạn tính thì mức nên hỏi bác sĩ, chỉ tập nhẹ', await co(page, '[data-testid="kq-hoi"]'));
  await diDen(page, '#/');
  check('C3: hiện banner chỉ tập nhẹ', await co(page, '[data-testid="banner-nhe"]'));
  await diDen(page, '#/thu-vien/nordic-ho-tro');
  await bam(page, '[data-testid="them-vao-buoi"]');
  check('C2: mức hỏi bác sĩ không thêm bài khó', (await co(page, '[data-testid="bai-han-che"]')) && (await text(page, '.toast')).includes('tập nhẹ'));
  await diDen(page, '#/tap/chuong-trinh/bong-da-4t');
  check('C2: mức hỏi bác sĩ khóa chương trình có bài khó', await co(page, '[data-testid="gate-dung"]'));
  await diDen(page, '#/tap/chuong-trinh/linh-hoat-2t');
  check('C2: mức hỏi bác sĩ vẫn cho chương trình nhẹ', await co(page, '[data-testid="form-ap"]'));
  await diDen(page, '#/tien-do/test');
  await page.select('[data-testid="sel-test"]', 'cooper');
  await sleep(300);
  check('C2: bài kiểm tra tối đa bị khóa ở mức hỏi bác sĩ', await co(page, '[data-testid="test-bi-khoa"]'));
  await lamSangLoc(page, 14, []);
  check('C3: dưới 16 tuổi có lý do và hướng dẫn', (await text(page, '[data-testid="kq-dung"]')).includes('phụ huynh'));
  await lamSangLoc(page, 28, ['thai']);
  check('C3: thai kỳ có hướng dẫn thay vì chặn cụt', (await text(page, '[data-testid="kq-dung"]')).includes('bác sĩ sản'));
  await lamSangLoc(page, 30, []);
  check('trả lời không rủi ro: được phép', await co(page, '[data-testid="kq-ok"]'));
  await diDen(page, '#/');
  check('banner an toàn biến mất sau khi sàng lọc đạt', !(await co(page, '[data-testid="banner-chua"]')) && !(await co(page, '[data-testid="banner-dung"]')));
  await page.close();
}

// ======================================================================
nhom = 'Thư viện';
{
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/thu-vien' });
  const tong = await text(page, '[data-testid="lib-count"]');
  check('hiện số bài', /^\d+ bài$/.test(tong) && Number(tong.split(' ')[0]) >= 120, tong);
  await go(page, '#lib-q', 'hit dat');
  await sleep(150);
  const dsTen = await page.$$eval('[data-ex] .t', (e) => e.map((x) => x.textContent));
  check('tìm không dấu "hit dat" ra Hít đất', dsTen.some((t) => t.includes('Hít đất')), dsTen.join(','));
  await go(page, '#lib-q', '');
  await bam(page, '[data-v="1"]');
  const sauLoc = await text(page, '[data-testid="lib-count"]');
  check('lọc "tại nhà, không dụng cụ" giảm số bài', Number(sauLoc.split(' ')[0]) < Number(tong.split(' ')[0]) && Number(sauLoc.split(' ')[0]) > 30, sauLoc);
  await page.select('#f-nhom', 'vai').catch(() => {});
  await page.evaluate(() => { document.querySelector('details').open = true; });
  await page.select('#f-nhom', 'vai');
  await sleep(500);
  const vai = await text(page, '[data-testid="lib-count"]');
  check('lọc theo nhóm cơ vai', Number(vai.split(' ')[0]) > 0 && Number(vai.split(' ')[0]) < Number(sauLoc.split(' ')[0]), vai);
  await chup(page, '04-thu-vien-390-sang');
  await kiemBoCuc(page, 'Thư viện 390');
  await diDen(page, '#/thu-vien/squat-than-nguoi');
  check('trang chi tiết có sơ đồ cơ thể, bước, lỗi, biến thể', (await co(page, '.big-map svg.bodymap')) && (await page.$$('.steps li')).length >= 3 && (await text(page, 'main')).includes('Dễ hơn'));
  check('chi tiết hiện cách đếm', (await text(page, '[data-testid="cach-dem"]')).includes('3 hiệp'));
  await kiemBoCuc(page, 'Chi tiết bài 390');
  await chupDay(page, '05-chi-tiet-bai-390-sang');
  await page.close();
}

// ======================================================================
nhom = 'Ghi buổi tập';
{
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/tap/ghi' });
  check('màn ghi trống có gợi ý', (await text(page, '[data-testid="editor"]')).includes('Chưa có bài nào'));
  await bam(page, '[data-testid="them-bai"]');
  await go(page, '[data-testid="pick-q"]', 'squat om');
  await sleep(150);
  check('chọn bài tìm không dấu: squat ôm tạ', (await page.$$('[data-pick="squat-goblet"]')).length === 1);
  await go(page, '[data-testid="pick-q"]', 'om ta');
  await sleep(150);
  check('tìm "om ta" ra squat ôm tạ', (await page.$$('[data-pick="squat-goblet"]')).length === 1);
  await bam(page, '[data-pick="squat-goblet"]');
  check('thêm bài vào buổi', await co(page, '[data-ex="squat-goblet"]'));
  const dongLan = '[data-ex="squat-goblet"] [data-set="0"] [data-f="lan"]';
  // Buổi 1: 3 hiệp x 12 lần x 20 kg, RPE 7
  for (let j = 0; j < 3; j++) {
    await go(page, `[data-ex="squat-goblet"] [data-set="${j}"] [data-f="lan"]`, 12);
    await go(page, `[data-ex="squat-goblet"] [data-set="${j}"] [data-f="kg"]`, 20);
    await go(page, `[data-ex="squat-goblet"] [data-set="${j}"] [data-f="rpe"]`, 7);
  }
  void dongLan;
  await bam(page, '[data-ex="squat-goblet"] [data-set="0"] .done');
  check('đánh dấu xong hiệp: bật hẹn giờ nghỉ', await co(page, '[data-testid="rest-tm"]'));
  const t0 = await text(page, '[data-testid="rest-tm"]');
  check('hẹn giờ nghỉ mặc định 1:30', t0 === '1:30' || t0 === '1:29', t0);
  await chup(page, '06-ghi-buoi-hen-gio-390-sang');
  await page.evaluate(() => { window.__skew += 31000; });
  await sleep(500);
  const t1 = await text(page, '[data-testid="rest-tm"]');
  check('giả lập đồng hồ +31 giây: còn 0:59 hoặc 0:58', t1 === '0:59' || t1 === '0:58' || t1 === '1:00', t1);
  await bam(page, '[data-testid="rest-cong"]');
  const t2 = await text(page, '[data-testid="rest-tm"]');
  check('nút +15 giây', t2 === '1:14' || t2 === '1:13' || t2 === '1:15', t2);
  await page.evaluate(() => { window.__skew += 120000; });
  await sleep(500);
  check('hết giờ nghỉ: hiện "Hết giờ nghỉ"', (await text(page, '.rest-in')).includes('Hết giờ nghỉ'));
  check('hết giờ: có rung', await page.evaluate(() => window.__rung.length > 0));
  await bam(page, '[data-testid="rest-bo"]');
  check('đóng hẹn giờ', await page.$eval('.rest-dock', (e) => e.hidden));
  await bam(page, '[data-ex="squat-goblet"] [data-set="1"] .done');
  await bam(page, '[data-testid="rest-bo"]');
  await bam(page, '[data-ex="squat-goblet"] [data-set="2"] .done');
  await bam(page, '[data-testid="rest-bo"]');
  // Bản nháp: nạp lại trang
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-ex="squat-goblet"]');
  const lanSau = await page.$eval('[data-ex="squat-goblet"] [data-set="1"] [data-f="lan"]', (e) => e.value);
  check('thoát giữa chừng: bản nháp tự lưu và khôi phục', lanSau === '12', lanSau);
  await diDen(page, '#/');
  check('Hôm nay hiện "buổi đang ghi dở"', await co(page, '[data-testid="nhap-dang-ghi"]'));
  await bam(page, '[data-testid="tiep-tuc"]');
  await page.waitForSelector('[data-testid="ket-thuc"]');
  await bam(page, '[data-testid="ket-thuc"]');
  await go(page, '[data-testid="k-phut"]', '45');
  await page.click('[data-v="7"]');
  await chup(page, '07-ket-thuc-buoi-390-sang');
  await bam(page, '[data-testid="luu-buoi"]');
  await page.waitForSelector('[data-testid="sum-hiep"]');
  check('tóm tắt: 3 hiệp', (await text(page, '[data-testid="sum-hiep"]')) === '3');
  check('tóm tắt: khối lượng 720 kg', (await text(page, '[data-testid="sum-kg"]')).replace(/\D/g, '') === '720');
  check('tóm tắt: tải 7 × 45 = 315', (await text(page, '[data-testid="sum-tai"]')).replace(/\D/g, '') === '315');
  await bam(page, '[data-testid="xong-tom-tat"]');
  await sleep(300);
  check('lưu xong về Hôm nay, bản nháp đã xóa', page.url().endsWith('#/') && !(await co(page, '[data-testid="nhap-dang-ghi"]')));

  // Buổi 2: điền sẵn từ buổi trước, gợi ý tăng tạ, kỷ lục
  await diDen(page, '#/tap/ghi');
  await bam(page, '[data-testid="them-bai"]');
  await go(page, '[data-testid="pick-q"]', 'squat om');
  await bam(page, '[data-pick="squat-goblet"]');
  const ph = await page.$eval('[data-ex="squat-goblet"] [data-set="0"]', (s) => ({ kg: s.querySelector('[data-f="kg"]').placeholder, lan: s.querySelector('[data-f="lan"]').placeholder, vk: s.querySelector('[data-f="kg"]').value, vl: s.querySelector('[data-f="lan"]').value }));
  check('gợi ý từ buổi trước hiện ở placeholder (12 lần, 20 kg), ô thật còn trống', ph.kg === '20' && ph.lan === '12' && ph.vk === '' && ph.vl === '', JSON.stringify(ph));
  check('hiện "Lần trước"', (await text(page, '.lan-truoc')).includes('Lần trước'));
  const goiY = await text(page, '[data-testid="goi-y"]');
  check('gợi ý tăng 2 kg (tối đa 10 phần trăm)', goiY.includes('tăng 2 kg'), goiY);
  check('gợi ý nói rõ "chỉ là gợi ý"', goiY.includes('chỉ là gợi ý'));
  await bam(page, '[data-testid="ap-goi-y"]');
  const kgMoi = await page.$eval('[data-ex="squat-goblet"] [data-set="0"] [data-f="kg"]', (e) => e.placeholder);
  check('áp dụng gợi ý: placeholder 22 kg', kgMoi === '22', kgMoi);
  await bam(page, '[data-ex="squat-goblet"] [data-set="0"] .done');
  check('bấm xong hiệp 1 thì lấy giá trị gợi ý làm số liệu thật', (await page.$eval('[data-ex="squat-goblet"] [data-set="0"] [data-f="kg"]', (e) => e.value)) === '22');
  check('hiệp 2 và 3 vẫn chỉ là gợi ý (ô trống)', (await page.$eval('[data-ex="squat-goblet"] [data-set="2"] [data-f="lan"]', (e) => e.value)) === '');
  check('phá kỷ lục: hiện huy hiệu', await co(page, '[data-testid="pr"]'));
  await chup(page, '08-ky-luc-390-sang');
  await bam(page, '[data-testid="rest-bo"]');
  // Xóa bài có hoàn tác
  await bam(page, '[data-testid="xoa-bai"]');
  check('xóa bài', !(await co(page, '[data-ex="squat-goblet"]')));
  await bam(page, '[data-testid="hoan-tac"]');
  check('hoàn tác khôi phục bài', await co(page, '[data-ex="squat-goblet"]'));
  await kiemBoCuc(page, 'Ghi buổi 390');
  await chupDay(page, '09-ghi-buoi-day-390-sang');
  await bam(page, '[data-testid="ket-thuc"]');
  await bam(page, '[data-testid="luu-buoi"]');
  await page.waitForSelector('[data-testid="sum-hiep"]');
  check('C1: chỉ bấm xong hiệp 1 thì lưu đúng 1 hiệp (không lưu hiệp 2, 3 điền sẵn)', (await text(page, '[data-testid="sum-hiep"]')) === '1', await text(page, '[data-testid="sum-hiep"]'));
  check('C1: khối lượng chỉ tính hiệp đã làm (8 × 22 = 176 kg)', (await text(page, '[data-testid="sum-kg"]')).replace(/D/g, '') === '176', await text(page, '[data-testid="sum-kg"]'));
  check('tóm tắt buổi 2 có kỷ lục mới', (await text(page, '.modal')).includes('Kỷ lục mới'));
  await bam(page, '[data-testid="xong-tom-tat"]');
  await sleep(300);

  // Lịch sử, sao chép, sửa, xóa
  await diDen(page, '#/tap/lich-su');
  check('lịch sử có 2 buổi', (await page.$$('[data-buoi]')).length === 2);
  await chup(page, '10-lich-su-390-sang');
  const id1 = await page.$eval('[data-buoi]', (e) => e.dataset.buoi);
  await diDen(page, `#/tap/lich-su/${id1}`);
  await bam(page, '[data-testid="sao-chep"]');
  await page.waitForSelector('[data-ex="squat-goblet"]');
  check('sao chép buổi cũ thành bản nháp mới', (await page.$$('[data-ex]')).length === 1);
  check('sao chép: số liệu cũ chỉ là gợi ý, chưa tính là đã làm', (await page.$eval('[data-ex] [data-set="0"] [data-f="lan"]', (e) => e.value)) === '' && (await text(page, '[data-testid="editor"]')).includes('Điền như lần trước'));
  await bam(page, '[data-testid="dien-lan-truoc"]');
  check('nút "Điền như lần trước" điền số liệu thật', (await page.$eval('[data-ex] [data-set="0"] [data-f="lan"]', (e) => e.value)) !== '');
  await bam(page, '[data-testid="huy-buoi"]');
  await bam(page, '[data-testid="hoi-ok"]');
  await diDen(page, `#/tap/lich-su/${id1}`);
  await bam(page, '[data-testid="sua-buoi"]');
  await page.waitForSelector('[data-ex="squat-goblet"]');
  await go(page, '[data-ex="squat-goblet"] [data-set="0"] [data-f="lan"]', 10);
  await bam(page, '[data-testid="ket-thuc"]');
  await bam(page, '[data-testid="luu-buoi"]');
  await page.waitForSelector('[data-testid="xong-tom-tat"]');
  await bam(page, '[data-testid="xong-tom-tat"]');
  await sleep(300);
  await diDen(page, `#/tap/lich-su/${id1}`);
  check('sửa buổi: lưu giá trị mới', (await text(page, 'main')).includes('10'), '');
  await bam(page, '[data-testid="xoa-buoi"]');
  await bam(page, '[data-testid="hoi-ok"]');
  await sleep(300);
  check('xóa buổi: còn 1', (await page.$$('[data-buoi]')).length === 1);
  await bam(page, '[data-testid="hoan-tac"]');
  await sleep(300);
  check('hoàn tác xóa buổi: về 2', (await page.$$('[data-buoi]')).length === 2);
  await diDen(page, '#/tap/ghi');
  await bam(page, '[data-testid="them-bai"]');
  await go(page, '[data-testid="pick-q"]', 'plank');
  await bam(page, '[data-pick="plank"]');
  await go(page, '[data-ex="plank"] [data-set="0"] [data-f="giay"]', 41);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await sleep(200);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-ex="plank"]');
  check('L3: pagehide xả nháp ngay (số giây vừa gõ còn sau khi tải lại)', (await page.$eval('[data-ex="plank"] [data-set="0"] [data-f="giay"]', (e) => e.value)) === '41');
  await page.evaluate(() => { window.__skew += 5 * 3600 * 1000; });
  await bam(page, '[data-testid="ket-thuc"]');
  check('T9: nháp bỏ dở 5 giờ thì không tự đoán thời lượng', (await page.$eval('[data-testid="k-phut"]', (e) => e.value)) === '' && (await text(page, '[data-testid="k-phut-loi"]')).includes('mở từ lâu'));
  await bam(page, '[data-testid="luu-buoi"]');
  check('T9: để trống thì không lưu được', (await co(page, '[data-testid="k-phut"]')) && (await text(page, '[data-testid="k-phut-loi"]')).includes('Nhập số phút'));
  await go(page, '[data-testid="k-phut"]', '20');
  await bam(page, '[data-testid="luu-buoi"]');
  await page.waitForSelector('[data-testid="xong-tom-tat"]');
  await bam(page, '[data-testid="xong-tom-tat"]');
  await sleep(300);
  await page.close();
}

// ======================================================================
nhom = 'Buổi chơi và tải';
{
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/tap/choi' });
  await go(page, '[data-testid="c-phut"]', '90');
  await page.click('[data-v="7"]');
  check('hiện tải ước tính RPE × phút', (await text(page, '[data-testid="c-tai"]')).replace(/\D/g, '').includes('630'), await text(page, '[data-testid="c-tai"]'));
  await bam(page, '[data-testid="luu-choi"]');
  await sleep(200);
  check('buổi chơi hiện trong danh sách', (await page.$$('[data-choi]')).length === 1);
  await chup(page, '11-buoi-choi-390-sang');
  await kiemBoCuc(page, 'Buổi chơi 390');
  await diDen(page, '#/tien-do/tai');
  check('tiến độ tải: có biểu đồ cột', (await page.$$('svg.chart .ch-b')).length >= 2);
  const tong = (await text(page, '[data-testid="tai-tong"]')).replace(/\D/g, '');
  check('tải tuần = tập (315+...) + chơi 630', Number(tong) >= 945, tong);
  check('chưa đủ dữ liệu thì không cảnh báo sai', (await text(page, '[data-testid="tai-cb"]')).includes('Chưa đủ dữ liệu'));
  await page.close();
}

// ======================================================================
nhom = 'Chương trình';
{
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/tap/chuong-trinh' });
  check('có chương trình theo môn và mục tiêu', (await page.$$('[data-ct]')).length >= 9);
  await chup(page, '12-chuong-trinh-390-sang');
  await diDen(page, '#/tap/chuong-trinh/cau-long-4t');
  check('chi tiết có tuần và buổi', (await page.$$('[data-phien]')).length === 3);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '9fit-dl-'));
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, browserContextId: cxChinh.id });
  // chọn cả 7 ngày để chắc chắn hôm nay có buổi
  for (const t of [0, 1, 2, 3, 4, 5, 6]) {
    const dangBat = await page.$eval(`[data-thu="${t}"]`, (e) => e.getAttribute('aria-pressed') === 'true');
    if (!dangBat) await page.click(`[data-thu="${t}"]`);
  }
  const homNay = await page.evaluate(() => { const d = new Date(Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const giai = await page.evaluate((hn) => { const d = new Date(hn + 'T12:00:00'); d.setDate(d.getDate() + 20); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, homNay);
  await page.evaluate((v) => { const e = document.querySelector('#ap-giai'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, giai);
  await sleep(150);
  const canh48 = await page.$eval('[data-testid="canh-48h"]', (e) => !e.hidden && e.textContent.includes('48 giờ'));
  check('T4: chọn 7 ngày liền nhau thì cảnh báo cần nghỉ 48 giờ', canh48);
  const soBuoi = (await page.$$('[data-testid="xem-lich"] [data-muc]')).length;
  check('xem trước lịch có buổi, giảm tải trước giải', soBuoi >= 15 && (await text(page, '[data-testid="xem-lich"]')).includes('giảm tải'), String(soBuoi));
  await chupDay(page, '13-ap-chuong-trinh-390-sang');
  await bam(page, '[data-testid="ap-xacnhan"]');
  await page.waitForSelector('[data-testid="ap-ok"]');
  check('áp vào lịch thành công', await co(page, '[data-testid="ap-ok"]'));
  await bam(page, '[data-testid="tai-ics"]');
  await sleep(1200);
  const ics = fs.readdirSync(dir).filter((f) => f.endsWith('.ics'));
  check('tải được tệp .ics', ics.length === 1, ics.join(','));
  if (ics.length) {
    const nd = fs.readFileSync(path.join(dir, ics[0]), 'utf8');
    check('.ics có VALARM và nhiều sự kiện', (nd.match(/BEGIN:VALARM/g) || []).length === (nd.match(/BEGIN:VEVENT/g) || []).length && (nd.match(/BEGIN:VEVENT/g) || []).length >= 10 && nd.includes('\r\n'));
    check('.ics có tên buổi tập tiếng Việt', nd.replace(/\r\n /g, '').includes('9fit: A: Chân và bước'));
  }
  await diDen(page, '#/');
  check('Hôm nay hiện buổi tập theo chương trình', await co(page, '[data-testid="phien-hom-nay"]'));
  await chup(page, '14-hom-nay-co-chuong-trinh-390-sang');
  await bam(page, '[data-testid="bat-dau-hom-nay"]');
  await page.waitForSelector('[data-testid="editor"] [data-ex]');
  const soBai = (await page.$$('[data-testid="editor"] [data-ex]')).length;
  check('mở buổi từ chương trình: đủ 6 bài', soBai === 6, String(soBai));
  await go(page, '[data-testid="editor"] [data-ex] [data-set="0"] [data-f="lan"]', 10);
  await bam(page, '[data-testid="ket-thuc"]');
  await bam(page, '[data-testid="luu-buoi"]');
  await page.waitForSelector('[data-testid="xong-tom-tat"]');
  await bam(page, '[data-testid="xong-tom-tat"]');
  await sleep(300);
  await diDen(page, '#/tap');
  const tienDo = await text(page, '[data-testid="tien-do-ct"]');
  check('theo dõi hoàn thành: 1 buổi xong', /^1\//.test(tienDo), tienDo);
  await chupDay(page, '15-tap-ke-hoach-390-sang');
  await kiemBoCuc(page, 'Tập 390');
  await lamSangLoc(page, 28, ['thai']);
  await diDen(page, '#/tap');
  check('C2: làm lại sàng lọc có "có" thì kế hoạch cũ bị khóa, không còn nút bắt đầu', (await co(page, '[data-testid="ke-hoach-khoa"]')) && !(await co(page, '[data-testid="bat-dau-muc"]')));
  await diDen(page, '#/');
  check('C2: Hôm nay không mời bắt đầu buổi khi bị khóa', (await co(page, '[data-testid="phien-khoa"]')) && !(await co(page, '[data-testid="bat-dau-hom-nay"]')));
  await lamSangLoc(page, 30, []);
  check('làm lại sàng lọc đạt thì mở khóa', await co(page, '[data-testid="kq-ok"]'));
  await page.close();
}

// ======================================================================
nhom = 'Khởi động có hẹn giờ';
{
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/them/khoi-dong' });
  check('có chuỗi 5/10/15/20/30 phút', (await page.$$('[data-chuoi^="kd-cau-long-"]')).length === 5);
  await chup(page, '16-khoi-dong-ds-390-sang');
  await diDen(page, '#/them/khoi-dong/kd-cau-long-5');
  check('tóm tắt chuỗi ~5 phút', (await text(page, '[data-testid="tom-tat"]')).includes('5 phút'));
  await page.click('[data-testid="tg-doc"]');
  await bam(page, '[data-testid="bat-dau-chuoi"]');
  check('có bước chuẩn bị', (await text(page, '[data-testid="ten-dong-tac"]')) === 'Sẵn sàng');
  await page.evaluate(() => { window.__skew += 3300; });
  await sleep(600);
  const ten1 = await text(page, '[data-testid="ten-dong-tac"]');
  check('sau chuẩn bị: vào động tác đầu', ten1 && ten1 !== 'Sẵn sàng', ten1);
  check('đọc to tên động tác (speechSynthesis)', await page.evaluate((t) => window.__said.some((s) => s.includes(t.split(' · ')[0])), ten1));
  const dem0 = await text(page, '[data-testid="dem-so"]');
  await chup(page, '17-khoi-dong-chay-390-sang');
  await bam(page, '[data-testid="tam-dung"]');
  await page.evaluate(() => { window.__skew += 8000; });
  await sleep(500);
  const demDung = await text(page, '[data-testid="dem-so"]');
  check('tạm dừng: đồng hồ đứng yên khi dịch giờ', demDung === dem0 || Math.abs(Number(demDung.split(':')[1]) - Number(dem0.split(':')[1])) <= 1, `${dem0}->${demDung}`);
  await bam(page, '[data-testid="tam-dung"]');
  await page.evaluate(() => { window.__skew += 6000; });
  await sleep(600);
  const demTiep = await text(page, '[data-testid="dem-so"]');
  check('tiếp tục: đồng hồ chạy', demTiep !== demDung, `${demDung}->${demTiep}`);
  await bam(page, '[data-testid="bo-qua"]');
  check('bỏ qua sang bước 2', (await text(page, '[data-testid="buoc-so"]')).startsWith('Bước 2/'));
  await bam(page, '[data-testid="quay-lai"]');
  check('quay lại bước 1', (await text(page, '[data-testid="buoc-so"]')).startsWith('Bước 1/'));
  for (let i = 0; i < 60 && !(await co(page, '[data-testid="chuoi-xong"]')); i++) await bam(page, '[data-testid="bo-qua"]');
  check('chạy hết chuỗi: hoàn thành', await co(page, '[data-testid="chuoi-xong"]'));
  await kiemBoCuc(page, 'Khởi động 390');
  await diDen(page, '#/them/khoi-dong/yoga-20');
  check('yoga 20 phút có chuỗi', (await text(page, '[data-testid="tom-tat"]')).includes('20 phút'));
  await diDen(page, '#/them/hen-gio');
  await bam(page, '[data-g="60"]');
  check('hẹn giờ nghỉ lẻ chạy', (await text(page, '[data-testid="rest-tm"]')).startsWith('1:0') || (await text(page, '[data-testid="rest-tm"]')).startsWith('0:5'));
  await bam(page, '[data-testid="rest-bo"]');
  await page.close();
}

// ======================================================================
nhom = 'Biểu đồ, số đo, kiểm tra';
{
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/them/du-lieu' });
  // Nạp dữ liệu mẫu 6 tuần bằng chức năng nhập
  const hn = await page.evaluate(() => { const d = new Date(Date.now()); return d.getTime(); });
  const f = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const buoi = []; const choi = [];
  for (let w = 1; w <= 5; w++) {
    buoi.push({ id: `s${w}`, ngay: f(hn - w * 7 * 86400000), ten: 'Buổi mẫu', phut: 45, rpe: 6, ghiChu: '', bai: [{ ex: 'squat-goblet', sets: [{ lan: 10, kg: 16 }, { lan: 10, kg: 16 }] }, { ex: 'hit-dat', sets: [{ lan: 12, kg: 0 }, { lan: 10, kg: 0 }] }, { ex: 'plank', sets: [{ giay: 40 }] }] });
    choi.push({ id: `c${w}`, ngay: f(hn - w * 7 * 86400000 - 86400000), mon: 'cau-long', phut: 60, rpe: 5, ghiChu: '' });
  }
  // tuần này tải rất cao để thấy cảnh báo
  choi.push({ id: 'cx1', ngay: f(hn), mon: 'bong-da', phut: 150, rpe: 9, ghiChu: '' });
  choi.push({ id: 'cx2', ngay: f(hn), mon: 'bong-da', phut: 120, rpe: 9, ghiChu: '' });
  const goi = { ungDung: '9fit', phienBan: 1, xuatLuc: new Date().toISOString(), duLieu: { buoi, choi, dodac: [{ id: 'd1', ngay: f(hn - 21 * 86400000), kg: 64.5, vong: { eo: 80 } }, { id: 'd2', ngay: f(hn - 7 * 86400000), kg: 63.8, vong: { eo: 79 } }], test: [{ id: 't1', ngay: f(hn - 30 * 86400000), loai: 'chong-day', v: 18 }], muctieu: { kg: 62 }, sangloc: { ngay: f(hn), tuoi: 30, traLoi: { tim: false, 'nguc-gang-suc': false, 'nguc-nghi': false, choang: false, 'xuong-khop': false, thuoc: false, thai: false, khac: false }, ketQua: 'duoc-phep', lyDo: [] } } };
  const tep = path.join(os.tmpdir(), '9fit-mau.json');
  fs.writeFileSync(tep, JSON.stringify(goi));
  const input = await page.$('[data-testid="nhap-tep"]');
  await input.uploadFile(tep);
  await page.waitForSelector('[data-testid="hoi-ok"]');
  await chup(page, '18-nhap-xac-nhan-390-sang');
  await bam(page, '[data-testid="hoi-ok"]');
  await sleep(500);
  check('nhập dữ liệu: đếm 5 buổi tập', (await text(page, '[data-testid="dem-buoi"]')) === '5');
  check('nhập dữ liệu: đếm 7 buổi chơi', (await text(page, '[data-testid="dem-choi"]')) === '7');
  // Tệp sai
  const sai = path.join(os.tmpdir(), '9fit-sai.json'); fs.writeFileSync(sai, '{"a":1}');
  await (await page.$('[data-testid="nhap-tep"]')).uploadFile(sai);
  await sleep(400);
  check('tệp sai bị từ chối, dữ liệu còn nguyên', (await text(page, '.toast')).includes('không phải tệp sao lưu') && (await text(page, '[data-testid="dem-buoi"]')) === '5', await text(page, '.toast'));

  await diDen(page, '#/tien-do/tai');
  await page.waitForSelector('svg.chart');
  check('biểu đồ tải: 8 tuần cột chồng', (await page.$$('svg.chart .ch-b.c1')).length >= 5 && (await page.$$('svg.chart .ch-b.c2')).length >= 5);
  const cb = await text(page, '[data-testid="tai-cb"]');
  check('tuần tăng tải mạnh: cảnh báo nhẹ có chữ "gợi ý"', cb.includes('gấp') && cb.includes('gợi ý'), cb);
  await chupDay(page, '19-tien-do-tai-390-sang');
  await kiemBoCuc(page, 'Tiến độ tải 390');
  await bam(page, '[data-tab="khoi-luong"]');
  await bam(page, '[data-testid="tuan-truoc"]');
  await page.waitForSelector('svg.chart');
  check('khối lượng tuần trước có thanh nhóm cơ', (await page.$$('svg.chart .ch-b.c1')).length >= 3);
  check('tuần trước: 16 kg × 20 lần = 320 kg', (await text(page, '[data-testid="kl-kg"]')).replace(/\D/g, '') === '320', await text(page, '[data-testid="kl-kg"]'));
  await chupDay(page, '20-khoi-luong-390-sang');
  await kiemBoCuc(page, 'Khối lượng 390');
  await bam(page, '[data-tab="do"]');
  await page.waitForSelector('svg.chart');
  check('biểu đồ cân nặng có đường mục tiêu', await page.$$eval('svg.chart .ch-avg', (e) => e.length) >= 1);
  await go(page, '[data-testid="d-kg"]', '63,2');
  await bam(page, '[data-testid="luu-do"]');
  await sleep(300);
  check('lưu cân nặng mới', (await page.$$('[data-do]')).length === 3);
  await chupDay(page, '21-so-do-390-sang');
  await kiemBoCuc(page, 'Số đo 390');
  await bam(page, '[data-tab="test"]');
  await sleep(300);
  await go(page, '[data-testid="t-v"]', '22');
  await bam(page, '[data-testid="luu-test"]');
  await cho(page, () => (document.querySelector('[data-testid="test-tot"]')?.textContent || '').includes('22'));
  check('kiểm tra thể lực: tốt nhất 22 lần', (await text(page, '[data-testid="test-tot"]')).includes('22'), await text(page, '[data-testid="test-tot"]'));
  check('có biểu đồ tiến bộ', (await page.$$('svg.chart .ch-dot')).length >= 2);
  await page.select('[data-testid="sel-test"]', 'cooper');
  await sleep(300);
  await go(page, '[data-testid="t-v"]', '99999');
  await bam(page, '[data-testid="luu-test"]');
  check('T7: Cooper từ chối 99999 m', (await text(page, '.toast')).includes('800') && (await text(page, '.toast')).includes('4500'), await text(page, '.toast'));
  await go(page, '[data-testid="t-v"]', '2400');
  await bam(page, '[data-testid="luu-test"]');
  await cho(page, () => (document.querySelector('[data-testid="ds-test"]')?.textContent || '').includes('42,4'));
  check('Cooper: VO2max ước tính 42,4 ml/kg/phút (khi chạy)', (await text(page, '[data-testid="ds-test"]')).includes('42,4 ml/kg/phút'), await text(page, '[data-testid="ds-test"]'));
  await page.select('[data-testid="t-bt"]', 'Đi nhanh');
  await go(page, '[data-testid="t-v"]', '1500');
  await bam(page, '[data-testid="luu-test"]');
  await cho(page, () => (document.querySelector('[data-testid="ds-test"]')?.textContent || '').includes('Đi nhanh'));
  check('T7: đi nhanh không tính VO2max', !((await page.$$eval('[data-test]', (e) => e.find((x) => x.textContent.includes('Đi nhanh'))?.textContent || '')).includes('VO2max')));
  await chupDay(page, '22-kiem-tra-390-sang');
  await kiemBoCuc(page, 'Kiểm tra 390');
  await diDen(page, '#/');
  check('Hôm nay có cảnh báo tải', await co(page, '[data-testid="tai-cb"]'));
  await chupDay(page, '23-hom-nay-co-du-lieu-390-sang');
  await page.close();
}

// ======================================================================
nhom = 'Dữ liệu, tìm kiếm, cài đặt';
{
  const page = await moTrang(cxChinh, { duongDan: '/index.html#/them' });
  await go(page, '[data-testid="tim-cn"]', 'khoi dong');
  await sleep(200);
  check('tìm chức năng không dấu "khoi dong"', (await page.$$('[data-testid="tim-ket-qua"] a')).length >= 3);
  await chup(page, '24-them-tim-390-sang');
  await go(page, '[data-testid="tim-cn"]', 'zzzzz');
  await sleep(200);
  check('tìm không ra: thông báo trống', (await text(page, '[data-testid="tim-ket-qua"]')).includes('Không thấy'));
  await go(page, '[data-testid="tim-cn"]', '');
  await kiemBoCuc(page, 'Thêm 390');
  await diDen(page, '#/them/du-lieu');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '9fit-dl2-'));
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, browserContextId: cxChinh.id });
  await bam(page, '[data-testid="xuat"]');
  await sleep(1200);
  const js = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  check('xuất được tệp JSON', js.length === 1, js.join(','));
  if (js.length) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, js[0]), 'utf8'));
    check('tệp xuất đúng định dạng và đủ dữ liệu', d.ungDung === '9fit' && d.duLieu.buoi.length >= 5 && d.duLieu.sangloc.ketQua === 'duoc-phep');
  }
  await bam(page, '[data-testid="cd-chu-lon"]');
  check('bật chữ lớn', await page.evaluate(() => document.documentElement.classList.contains('chu-lon')));
  await chupDay(page, '25-du-lieu-chu-lon-390-sang');
  await kiemBoCuc(page, 'Dữ liệu chữ lớn 390');
  await bam(page, '[data-testid="cd-chu-lon"]');
  await chupDay(page, '26-du-lieu-390-sang');
  const hong = path.join(os.tmpdir(), '9fit-hong.json');
  fs.writeFileSync(hong, JSON.stringify({ ungDung: '9fit', phienBan: 1, duLieu: { buoi: [1, null, 'x', { ngay: '2026-10-06', bai: [] }], dodac: [{ ngay: null }], kehoach: { ctId: 'cau-long-4t', muc: 'abc' } } }));
  await (await page.$('[data-testid="nhap-tep"]')).uploadFile(hong);
  await bam(page, '[data-testid="hoi-ok"]');
  await cho(page, () => document.querySelector('.toast')?.textContent.includes('Bỏ qua'));
  check('L5: nhập tệp có dòng hỏng, bỏ qua dòng lỗi', (await text(page, '.toast')).includes('Bỏ qua'), await text(page, '.toast'));
  for (const hh of ['#/', '#/tap', '#/tap/lich-su', '#/tien-do/do', '#/tien-do/tai']) { await diDen(page, hh); check(`L5: ${hh} không sập sau khi nhập dữ liệu hỏng`, !(await co(page, '#view .note.bad'))); }
  await diDen(page, '#/them/du-lieu');
  await bam(page, '[data-testid="xoa-het"]');
  await bam(page, '[data-testid="hoi-ok"]');
  await sleep(500);
  check('xóa sạch: không còn buổi tập', (await text(page, '[data-testid="dem-buoi"]')) === '0');
  await diDen(page, '#/');
  check('sau khi xóa: lại hiện banner sàng lọc', await co(page, '[data-testid="banner-chua"]'));
  await page.close();
}

// ======================================================================
nhom = 'Chưa sàng lọc và lưu thất bại';
{
  const cx = await taiPhienMoi();
  const page = await moTrang(cx, { duongDan: '/index.html#/thu-vien/nordic-ho-tro' });
  await bam(page, '[data-testid="them-vao-buoi"]');
  check('C2: chưa sàng lọc thì không thêm bài khó vào buổi', (await text(page, '.toast')).includes('sàng lọc'));
  await diDen(page, '#/tien-do/test');
  await page.select('[data-testid="sel-test"]', 'chay-1600');
  await sleep(300);
  check('C2: chưa sàng lọc thì khóa bài chạy 1,6 km', await co(page, '[data-testid="test-bi-khoa"]'));
  await page.select('[data-testid="sel-test"]', 'plank');
  await sleep(300);
  check('chưa sàng lọc vẫn làm được bài nhẹ (plank)', await co(page, '[data-testid="luu-test"]'));
  await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new Error('giả lập lỗi ghi'); }; });
  await diDen(page, '#/tap/choi');
  await bam(page, '[data-testid="luu-choi"]');
  await cho(page, () => document.querySelector('[data-testid="canh-luu-toan-cuc"]') && !document.querySelector('[data-testid="canh-luu-toan-cuc"]').hidden);
  check('T8: ghi thất bại thì hiện banner toàn cục', await page.$eval('[data-testid="canh-luu-toan-cuc"]', (e) => !e.hidden));
  check('T8: toast không báo "Đã ghi" khi ghi thất bại', (await text(page, '.toast')).includes('Không lưu được') && !(await text(page, '.toast')).startsWith('Đã ghi'), await text(page, '.toast'));
  await page.close(); await cx.close();
}

// ======================================================================
nhom = 'Ngoại tuyến';
{
  const cx = await taiPhienMoi();
  const page = await moTrang(cx, { duongDan: '/index.html#/thu-vien' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await sleep(1500);
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks.find((k) => k.startsWith('9fit-'))); return (await c.keys()).length; });
  check('service worker đã lưu vỏ ứng dụng', cached >= 40, String(cached));
  await page.setOfflineMode(true);
  page.__boQuaLoi = true;
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForSelector('#view > *', { timeout: 8000 });
  const tong = await text(page, '[data-testid="lib-count"]');
  check('tắt mạng, tải lại: thư viện vẫn hiện đủ bài', /^\d+ bài$/.test(tong) && Number(tong.split(' ')[0]) >= 120, tong);
  await diDen(page, '#/them/khoi-dong/kd-chung-10');
  check('tắt mạng: chuỗi khởi động vẫn mở', await co(page, '[data-testid="bat-dau-chuoi"]'));
  await diDen(page, '#/tap/ghi');
  await bam(page, '[data-testid="them-bai"]');
  await go(page, '[data-testid="pick-q"]', 'plank');
  await bam(page, '[data-pick="plank"]');
  check('tắt mạng: ghi buổi tập hoạt động', await co(page, '[data-ex="plank"]'));
  await page.setOfflineMode(false);
  await page.close(); await cx.close();
}

// ======================================================================
nhom = 'Bố cục các cỡ màn hình, sáng và tối';
{
  const cx = await taiPhienMoi();
  // Nạp sàng lọc + dữ liệu để màn có nội dung
  const seed = await moTrang(cx, { duongDan: '/index.html#/them/du-lieu' });
  const hn = await seed.evaluate(() => Date.now());
  const f = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const buoi = [1, 2, 3, 4].map((w) => ({ id: `s${w}`, ngay: f(hn - w * 5 * 86400000), ten: 'Buổi A: Chân và bước', phut: 45, rpe: 6, ghiChu: '', bai: [{ ex: 'squat-goblet', sets: [{ lan: 10, kg: 16 + w }, { lan: 10, kg: 16 + w }] }, { ex: 'hit-dat', sets: [{ lan: 12, kg: 0 }] }] }));
  const goi = { ungDung: '9fit', phienBan: 1, xuatLuc: new Date().toISOString(), duLieu: { buoi, choi: [{ id: 'c1', ngay: f(hn - 86400000), mon: 'cau-long', phut: 90, rpe: 7, ghiChu: '' }], dodac: [{ id: 'd1', ngay: f(hn - 14 * 86400000), kg: 65, vong: {} }, { id: 'd2', ngay: f(hn), kg: 64, vong: {} }], sangloc: { ngay: f(hn), tuoi: 30, traLoi: { tim: false, 'nguc-gang-suc': false, 'nguc-nghi': false, choang: false, 'xuong-khop': false, thuoc: false, thai: false, khac: false }, ketQua: 'duoc-phep', lyDo: [] } } };
  const tep = path.join(os.tmpdir(), '9fit-mau2.json'); fs.writeFileSync(tep, JSON.stringify(goi));
  await (await seed.$('[data-testid="nhap-tep"]')).uploadFile(tep);
  await bam(seed, '[data-testid="hoi-ok"]');
  await sleep(400);
  await seed.close();
  const cacMan = [['hom-nay', '#/'], ['tap', '#/tap'], ['thu-vien', '#/thu-vien'], ['chi-tiet', '#/thu-vien/nordic-ho-tro'], ['tien-do', '#/tien-do/tai'], ['them', '#/them'], ['suc-khoe', '#/them/suc-khoe'], ['chuong-trinh', '#/tap/chuong-trinh']];
  for (const [w, hh, ten] of [[360, 740, '360'], [1280, 800, '1280'], [390, 844, '390']]) {
    for (const sang of [true, false]) {
      const page = await moTrang(cx, { w, h: hh, sang, duongDan: '/index.html#/' });
      for (const [tenMan, hash] of cacMan) {
        await diDen(page, hash);
        await sleep(200);
        await kiemBoCuc(page, `${tenMan} ${ten} ${sang ? 'sáng' : 'tối'}`);
        if (ten !== '390' || !sang) await chup(page, `m-${tenMan}-${ten}-${sang ? 'sang' : 'toi'}`);
      }
      await page.close();
    }
  }
  // Chữ lớn ở 360
  const page = await moTrang(cx, { w: 360, h: 740, duongDan: '/index.html#/them/du-lieu' });
  await bam(page, '[data-testid="cd-chu-lon"]');
  for (const [tenMan, hash] of cacMan) { await diDen(page, hash); await kiemBoCuc(page, `${tenMan} 360 chữ lớn`); }
  await diDen(page, '#/');
  await chup(page, 'm-hom-nay-360-chu-lon');
  await page.close();
  // Giảm chuyển động
  const p2 = await cx.newPage();
  await p2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p2.goto(`${ORIGIN}/index.html#/`, { waitUntil: 'networkidle0' });
  check('tôn trọng prefers-reduced-motion (CSS có khối giảm chuyển động)', await p2.evaluate(() => [...document.styleSheets].some((s) => [...s.cssRules].some((r) => r.media && r.media.mediaText.includes('reduced-motion')))));
  await p2.close();
  await cx.close();
}

await browser.close();
server.close();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* bỏ qua */ }

console.log('\n==== Tổng kết ====');
const hong = ketQua.filter((k) => !k.ok);
console.log(`${ketQua.length - hong.length}/${ketQua.length} kiểm tra đạt`);
const loiThat = loiConsole;
console.log(`Lỗi console/pageerror: ${loiThat.length}`);
for (const l of loiThat.slice(0, 20)) console.log('  ', l);
if (hong.length) { console.log('Không đạt:'); for (const k of hong) console.log('  -', k.ten); }
process.exit(hong.length || loiThat.length ? 1 : 0);
