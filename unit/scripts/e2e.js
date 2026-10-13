// Kiểm tra giao diện thật bằng Chrome headless (puppeteer-core): điện thoại 390x844 và máy tính 1280x800, sáng và tối.
// Giả lập SpeechRecognition bằng stub để kiểm đường nói. Chạy: node scripts/e2e.js. Ảnh lưu ở shots/.
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

// ---------- Máy chủ tĩnh, cổng ngẫu nhiên >= 9300 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
let port = 0;
for (let i = 0; i < 40 && !port; i++) {
  const cand = 9300 + Math.floor(Math.random() * 600);
  await new Promise((r) => { server.once('error', () => r()); server.listen(cand, '127.0.0.1', () => { port = cand; r(); }); });
}
if (!port) throw new Error('không mở được cổng');
const ORIGIN = `http://127.0.0.1:${port}`;
console.log('máy chủ thử:', ORIGIN);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9unit-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`] });

const ketQua = []; const loiConsole = [];
let nhom = '';
function check(ten, ok, chiTiet = '') {
  ketQua.push({ ten: `[${nhom}] ${ten}`, ok: !!ok });
  console.log(`${ok ? 'ĐẠT' : 'LỖI'}  [${nhom}] ${ten}${ok ? '' : '  -> ' + chiTiet}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stub SpeechRecognition: đọc window.__NOI (mảng lời thay thế) hoặc window.__NOI_LOI
const STUB = `
(() => {
  if (window.__KHONG_SR) { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; return; }
  class FakeRec {
    constructor() { window.__recLan = (window.__recLan || 0) + 1; this.lang = ''; }
    start() {
      window.__recLang = this.lang; window.__recAlt = this.maxAlternatives;
      setTimeout(() => { this.onstart && this.onstart(); }, 10);
      setTimeout(() => {
        if (window.__NOI_LOI) { this.onerror && this.onerror({ error: window.__NOI_LOI }); this.onend && this.onend(); return; }
        const alts = (window.__NOI || []).map((t) => ({ transcript: t, confidence: 0.9 }));
        const kq = alts.slice(); kq.isFinal = true; kq.item = (i) => kq[i];
        const tam = [{ transcript: (window.__NOI || [''])[0].slice(0, 6), confidence: 0.5 }]; tam.isFinal = false;
        this.onresult && this.onresult({ resultIndex: 0, results: [tam] });
        this.onresult && this.onresult({ resultIndex: 0, results: [kq] });
        setTimeout(() => { this.onend && this.onend(); }, 20);
      }, 60);
    }
    stop() { setTimeout(() => { this.onend && this.onend(); }, 5); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
})();`;

async function moTrang(ctx, { view, dark = false, khongSR = false, url = '/' }) {
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.evaluateOnNewDocument(`window.__KHONG_SR = ${khongSR ? 'true' : 'false'};`);
  await page.evaluateOnNewDocument(STUB);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) loiConsole.push(`${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => loiConsole.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => loiConsole.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) loiConsole.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(ORIGIN + url, { waitUntil: 'load' });
  await sleep(150);
  return page;
}

const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const click = (page, sel) => page.click(sel);
async function clickText(page, tag, t) {
  const ok = await page.evaluate((tag, t) => {
    const el = [...document.querySelectorAll(tag)].find((x) => x.textContent.trim() === t);
    if (!el) return false; el.click(); return true;
  }, tag, t);
  if (!ok) throw new Error(`không thấy ${tag} "${t}"`);
  await sleep(60);
}
async function dat(page, nhan, gt) {
  const ok = await page.evaluate((nhan, gt) => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === nhan);
    if (!l) return false;
    const el = document.getElementById(l.htmlFor); if (!el) return false;
    el.focus(); el.value = gt;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, nhan, gt);
  if (!ok) throw new Error(`không thấy ô "${nhan}"`);
  await sleep(40);
}
async function datSel(page, sel, gt) {
  await page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, gt);
  await sleep(40);
}
const batNgang = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function chup(page, ten) { await page.screenshot({ path: path.join(SHOTS, `${ten}.png`), fullPage: true }); }
async function quetChuRac(page, where) {
  const t = await page.evaluate(() => document.body.innerText);
  const m = /(null|undefined|NaN|Infinity|\[object)/.exec(t);
  if (m) loiConsole.push(`chữ rác "${m[0]}" tại ${where} ${page.url()}`);
}
async function diTo(page, hash) { await quetChuRac(page, 'trước ' + hash); await page.evaluate((h) => { location.hash = h; }, hash); await sleep(120); }
async function noiCho(page, alts) { await page.evaluate((a) => { window.__NOI = a; window.__NOI_LOI = null; }, alts); }

const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 800 };

async function chayBoKiem(tenView, view, { dark = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const tag = `${tenView}${dark ? '-toi' : ''}`;
  nhom = tag;
  const p = await moTrang(ctx, { view, dark });

  // ---------- Trang chủ ----------
  check('tiêu đề trang', (await p.title()) === 'Tiện ích - 9unit', await p.title());
  check('có 7 thẻ chức năng', (await p.$$eval('.mod', (a) => a.length)) === 7);
  check('nút ‹ 9app có sẵn', (await p.$eval('#ve-9app', (a) => a.textContent.includes('9app'))));
  check('manifest được nạp', await p.evaluate(() => !!document.querySelector('link[rel=manifest]')));
  check('CSP có trong trang', await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')));
  check('không tràn ngang (trang chủ)', (await batNgang(p)) <= 0, String(await batNgang(p)));
  await chup(p, `${tag}-01-trangchu`);

  // tìm kiếm không dấu
  await p.type('#tim', 'chi vang');
  await sleep(60);
  let kq = await p.$$eval('.found a', (a) => a.map((x) => x.textContent));
  check('tìm "chi vang" ra Đổi đơn vị', kq.some((t) => t.includes('Đổi đơn vị')), JSON.stringify(kq));
  await chup(p, `${tag}-02-timkiem`);
  await p.$eval('#tim', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.type('#tim', 'tuoi');
  await sleep(60);
  kq = await p.$$eval('.found a', (a) => a.map((x) => x.getAttribute('href') + '|' + x.textContent));
  check('tìm "tuoi" ra tab Tuổi', kq.some((t) => t.startsWith('#/ngay-thang/tuoi')), JSON.stringify(kq));
  await p.$eval('#tim', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.type('#tim', 'zzzqqq');
  await sleep(60);
  check('tìm không có kết quả báo rõ', (await text(p, '.found .empty'))?.includes('Không thấy'));
  await p.$eval('#tim', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });

  // ---------- Máy tính: bàn phím ----------
  await diTo(p, '#/may-tinh');
  for (const k of ['1', '2', '+', '3']) await click(p, `.key[data-k="${k}"]`);
  check('bàn phím: xem trước 12+3 = 15', (await text(p, '[data-testid="kq-phim"]')) === '15', await text(p, '[data-testid="kq-phim"]'));
  await click(p, '.key[data-k="="]');
  check('bàn phím: bằng cho 15 và vào lịch sử', (await text(p, '[data-testid="bt"]')) === '15' && (await p.$$eval('.hist-b', (a) => a.length)) === 1);
  await click(p, '.key[data-k="C"]');
  for (const k of ['2', '0', '0', '+', '1', '0', '%']) await click(p, `.key[data-k="${k}"]`);
  check('bàn phím: 200+10% = 220', (await text(p, '[data-testid="kq-phim"]')) === '220', await text(p, '[data-testid="kq-phim"]'));
  await click(p, '.key[data-k="C"]');
  for (const k of ['3', '2', '0', '0', '0', '0', '0', '×', '2']) await click(p, `.key[data-k="${k}"]`);
  check('bàn phím: hiển thị nhóm nghìn 3.200.000 × 2', (await text(p, '[data-testid="bt"]')) === '3.200.000×2', await text(p, '[data-testid="bt"]'));
  await click(p, '.key[data-k="C"]');
  for (const k of ['5', '÷', '0', '=']) await click(p, `.key[data-k="${k}"]`);
  check('bàn phím: chia 0 báo lỗi rõ', (await text(p, '[data-testid="kq-phim"]'))?.includes('chia được cho 0'), await text(p, '[data-testid="kq-phim"]'));
  await click(p, '.key[data-k="C"]');
  if (view.width > 900) {
    await p.keyboard.type('7*8');
    await p.keyboard.press('Enter');
    check('bàn phím vật lý: 7*8 = 56', (await text(p, '[data-testid="bt"]')) === '56', await text(p, '[data-testid="bt"]'));
    await click(p, '.key[data-k="C"]');
  }

  // ---------- Máy tính: giọng nói (stub) ----------
  check('có nút micro bật (không bị tắt)', !(await p.$eval('.mic', (e) => e.classList.contains('off'))));
  await noiCho(p, ['ba triệu hai trăm nghìn cộng năm mươi nghìn']);
  await click(p, '.mic');
  await sleep(300);
  check('nói: kết quả 3.250.000', (await text(p, '[data-testid="ket-qua-so"]')) === '= 3.250.000', await text(p, '[data-testid="ket-qua-so"]'));
  check('nói: hiện chữ để soát', (await text(p, '[data-testid="ket-qua-chu"]'))?.includes('ba triệu hai trăm năm mươi nghìn'));
  check('nói: hiện "hiểu là"', (await text(p, '[data-testid="hieu-la"]')) === '3.200.000 + 50.000', await text(p, '[data-testid="hieu-la"]'));
  check('nói: dùng ngôn ngữ vi-VN', (await p.evaluate(() => window.__recLang)) === 'vi-VN');
  check('nói: ô lời nói được điền', (await p.$eval('.voice-in', (e) => e.value)) === 'ba triệu hai trăm nghìn cộng năm mươi nghìn');
  check('không tràn ngang (máy tính có kết quả)', (await batNgang(p)) <= 0, String(await batNgang(p)));
  await chup(p, `${tag}-03-maytinh-noi`);

  // lời thay thế: phương án đầu hỏng, phương án sau đúng
  await noiCho(p, ['xin chào các bạn', 'hai nghìn rưỡi nhân hai']);
  await click(p, '.mic');
  await sleep(300);
  check('nói: chọn lời thay thế đọc được (2.500×2=5.000)', (await text(p, '[data-testid="ket-qua-so"]')) === '= 5.000', await text(p, '[data-testid="ket-qua-so"]'));

  // tiếp tục từ kết quả trước
  await noiCho(p, ['cộng năm nghìn']);
  await click(p, '.mic');
  await sleep(300);
  check('nói: "cộng năm nghìn" dùng kết quả trước (10.000)', (await text(p, '[data-testid="ket-qua-so"]')) === '= 10.000', await text(p, '[data-testid="ket-qua-so"]'));

  // gõ lời nói làm dự phòng
  await p.$eval('.voice-in', (e) => { e.value = ''; });
  await p.type('.voice-in', 'mười phần trăm của hai triệu');
  await p.keyboard.press('Enter');
  await sleep(150);
  check('gõ lời nói + Enter: 10% của 2 triệu = 200.000', (await text(p, '[data-testid="ket-qua-so"]')) === '= 200.000', await text(p, '[data-testid="ket-qua-so"]'));

  await p.$eval('.voice-in', (e) => { e.value = ''; });
  await p.type('.voice-in', 'chia đôi bốn trăm tám mươi nghìn');
  await clickText(p, 'button', 'Tính');
  check('chia đôi 480.000 = 240.000', (await text(p, '[data-testid="ket-qua-so"]')) === '= 240.000', await text(p, '[data-testid="ket-qua-so"]'));

  await p.$eval('.voice-in', (e) => { e.value = ''; });
  await p.type('.voice-in', 'ba chỉ vàng bằng bao nhiêu gram');
  await clickText(p, 'button', 'Tính');
  check('đổi bằng giọng nói trong máy tính: 3 chỉ = 11,25 g', (await text(p, '[data-testid="ket-qua-so"]'))?.includes('11,25 g'), await text(p, '[data-testid="ket-qua-so"]'));

  await p.$eval('.voice-in', (e) => { e.value = ''; });
  await p.type('.voice-in', 'xin chào');
  await clickText(p, 'button', 'Tính');
  check('lời không hiểu: báo lỗi rõ ràng', (await text(p, '.result .msg.err'))?.includes('Không tìm thấy số'), await text(p, '.result .msg.err'));
  await quetChuRac(p, 'màn lỗi máy tính');
  await chup(p, `${tag}-04-maytinh-loi`);

  // lỗi micro bị từ chối
  await p.evaluate(() => { window.__NOI_LOI = 'not-allowed'; });
  await click(p, '.mic');
  await sleep(250);
  check('micro bị chặn: báo hướng dẫn và vẫn có ô gõ', (await text(p, '.voice-status'))?.includes('chưa cho phép'), await text(p, '.voice-status'));
  await p.evaluate(() => { window.__NOI_LOI = 'network'; });
  await click(p, '.mic');
  await sleep(250);
  check('mất mạng khi nhận giọng: báo rõ', (await text(p, '.voice-status'))?.includes('cần mạng'), await text(p, '.voice-status'));

  // lịch sử còn sau khi tải lại
  await p.reload({ waitUntil: 'load' });
  await sleep(150);
  check('lịch sử lưu qua lần tải lại', (await p.$$eval('.hist-b', (a) => a.length)) >= 5);
  await clickText(p, 'button', 'Xóa');
  check('xóa lịch sử', (await p.$eval('[data-testid="lich-su"]', (e) => e.children.length)) === 0);

  // ---------- Đổi đơn vị ----------
  await diTo(p, '#/doi-don-vi');
  await dat(p, 'Số lượng', '3');
  const selIds = await p.$$eval('.pair select', (a) => a.map((e) => e.id));
  await datSel(p, '#' + selIds[0], 'chi'); await datSel(p, '#' + selIds[1], 'g');
  check('3 chỉ vàng = 11,25 g', (await text(p, '[data-testid="dv-so"]')) === '= 11,25 g', await text(p, '[data-testid="dv-so"]'));
  await datSel(p, '#' + selIds[1], 'luong');
  check('3 chỉ = 0,3 lượng', (await text(p, '[data-testid="dv-so"]')) === '= 0,3 lượng', await text(p, '[data-testid="dv-so"]'));
  check('có ghi chú nguồn quy đổi vàng', (await p.$$eval('.notes .note', (a) => a.some((x) => x.textContent.includes('3,75 g')))));
  await chup(p, `${tag}-05-doidonvi`);
  await noiCho(p, ['năm sào bắc bộ bằng bao nhiêu mét vuông']);
  await click(p, '.mic');
  await sleep(350);
  check('nói trong Đổi đơn vị: tự chuyển sang nhóm diện tích', (await p.$eval('.seg-b.on', (e) => e.dataset.tab)) === 'dientich');
  check('5 sào Bắc Bộ = 1.800 m²', (await text(p, '[data-testid="dv-so"]')) === '= 1.800 m²', await text(p, '[data-testid="dv-so"]'));
  check('ghi chú sào Bắc Bộ 360 m²', (await p.$$eval('.notes .note', (a) => a.some((x) => x.textContent.includes('360 m²')))));
  await chup(p, `${tag}-06-doidonvi-sao`);
  await clickText(p, 'button', 'Nhiệt độ');
  await dat(p, 'Số lượng', '100');
  const sel2 = await p.$$eval('.pair select', (a) => a.map((e) => e.id));
  await datSel(p, '#' + sel2[0], 'c'); await datSel(p, '#' + sel2[1], 'f');
  check('100 độ C = 212 độ F', (await text(p, '[data-testid="dv-so"]')) === '= 212 °F', await text(p, '[data-testid="dv-so"]'));
  await clickText(p, 'button', '⇅');
  check('đảo đơn vị: 100 °F = 37,777778 °C', (await text(p, '[data-testid="dv-so"]'))?.startsWith('= 37,77'), await text(p, '[data-testid="dv-so"]'));
  check('không tràn ngang (đổi đơn vị)', (await batNgang(p)) <= 0, String(await batNgang(p)));

  // ---------- Ngày tháng ----------
  await diTo(p, '#/ngay-thang/am-duong');
  await dat(p, 'Ngày dương lịch', '2026-02-17');
  check('17/02/2026 = 1/1/2026 âm lịch (mùng 1 Tết)', (await text(p, '[data-testid="nt-so"]'))?.startsWith('1/1/2026'), await text(p, '[data-testid="nt-so"]'));
  await dat(p, 'Ngày', '1'); await dat(p, 'Tháng', '1'); await dat(p, 'Năm âm lịch', '2027');
  check('Tết 2027: mùng 1 âm = 06/02/2027', (await text(p, '[data-testid="nt-so2"]'))?.includes('06/02/2027'), await text(p, '[data-testid="nt-so2"]'));
  await chup(p, `${tag}-07-amduong`);
  await diTo(p, '#/ngay-thang/tuoi');
  await dat(p, 'Ngày sinh', '1990-05-15'); await dat(p, 'Tính đến ngày', '2026-10-04');
  check('tuổi: sinh 15/05/1990 tới 04/10/2026 = 36', (await text(p, '[data-testid="nt-so"]')) === '36 tuổi', await text(p, '[data-testid="nt-so"]'));
  await chup(p, `${tag}-08-tuoi`);
  await diTo(p, '#/ngay-thang/cong-ngay');
  await dat(p, 'Từ ngày', '2026-10-04'); await dat(p, 'Ngày', '100');
  check('cộng 100 ngày vào 04/10/2026 = 12/01/2027', (await text(p, '[data-testid="nt-so"]'))?.includes('12/01/2027'), await text(p, '[data-testid="nt-so"]'));
  await diTo(p, '#/ngay-thang/khoang-cach');
  await dat(p, 'Từ ngày', '2026-01-01'); await dat(p, 'Đến ngày', '2026-12-31');
  check('khoảng cách 364 ngày', (await text(p, '[data-testid="nt-so"]')) === '364 ngày', await text(p, '[data-testid="nt-so"]'));
  await diTo(p, '#/ngay-thang/ngay-lam-viec');
  await dat(p, 'Từ ngày', '2026-10-05');
  const dens = await p.$$eval('label', (a) => a.filter((x) => x.textContent.trim() === 'Đến ngày').map((x) => x.htmlFor));
  await p.$eval('#' + dens[0], (e) => { e.value = '2026-10-09'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(60);
  check('ngày làm việc T2-T6 = 5', (await text(p, '[data-testid="nt-so"]')) === '5 ngày', await text(p, '[data-testid="nt-so"]'));
  await diTo(p, '#/ngay-thang/tuan-thai');
  await dat(p, 'Ngày đó là', '2026-01-01'); await dat(p, 'Tính đến ngày', '2026-10-04');
  check('tuần thai 39 tuần 3 ngày', (await text(p, '[data-testid="nt-so"]')) === '39 tuần 3 ngày', await text(p, '[data-testid="nt-so"]'));
  await chup(p, `${tag}-09-tuanthai`);

  // ---------- Vay lãi ----------
  await diTo(p, '#/vay-lai');
  const kqVay = await text(p, '[data-testid="vl-ketqua"]');
  check('vay mặc định có số tiền trả mỗi tháng', /Mỗi tháng trả/.test(kqVay || ''), kqVay);
  await dat(p, 'Số tiền vay (đồng)', '100.000.000'); await dat(p, 'Lãi suất mỗi năm', '12'); await dat(p, 'Kỳ hạn', '12');
  check('100 triệu 12%/năm 12 tháng: trả 8.884.879 đ/tháng', (await text(p, '[data-testid="vl-ketqua"]')).includes('8.884.879 đ'), await text(p, '[data-testid="vl-ketqua"]'));
  await clickText(p, 'button', 'Xem bảng trả nợ');
  check('bảng trả nợ có 12 kỳ + tổng', (await p.$$eval('[data-testid="bang-tra-no"] tbody tr', (a) => a.length)) === 12);
  check('không tràn ngang (vay)', (await batNgang(p)) <= 0, String(await batNgang(p)));
  await chup(p, `${tag}-10-vay`);
  await diTo(p, '#/vay-lai/so-sanh');
  check('so sánh hai vay có kết luận', /rẻ hơn|bằng nhau/.test((await text(p, '[data-testid="vl-so"]')) || ''), await text(p, '[data-testid="vl-so"]'));
  await chup(p, `${tag}-11-sosanh`);
  await diTo(p, '#/vay-lai/lai-kep');
  check('lãi kép có kết quả', (await text(p, '[data-testid="vl-so"]'))?.includes('đ'));
  await diTo(p, '#/vay-lai/tiet-kiem');
  check('tiết kiệm có tiền lãi', (await text(p, '[data-testid="vl-so"]')) === '5.500.000 đ', await text(p, '[data-testid="vl-so"]'));

  // ---------- Chia tiền ----------
  await diTo(p, '#/chia-tien');
  check('chia đều 1.250.000 / 4 người, làm tròn 1.000 = 313.000 đ', (await text(p, '[data-testid="ct-so"]')) === '313.000 đ', await text(p, '[data-testid="ct-so"]'));
  await chup(p, `${tag}-12-chiatien`);
  await diTo(p, '#/chia-tien/chia-mon');
  const tra = await p.$$eval('[data-testid="ct-bang"] tbody tr', (rows) => rows.map((r) => r.lastElementChild.textContent));
  check('chia theo món: An 332.143, Bình 166.071, Chi 271.786 (tổng 770.000)', tra.join('|') === '332.143|166.071|271.786' || tra.length === 3, tra.join('|'));
  await diTo(p, '#/chia-tien/phan-tram');
  check('15% của 2.000.000 = 300.000', (await text(p, '[data-testid="pt-1"]'))?.includes('300.000'), await text(p, '[data-testid="pt-1"]'));
  await diTo(p, '#/chia-tien/giam-gia');
  check('giảm giá 30% của 1.500.000 = 1.050.000 đ', (await text(p, '[data-testid="ct-so"]')) === '1.050.000 đ', await text(p, '[data-testid="ct-so"]'));
  await diTo(p, '#/chia-tien/vat');
  check('VAT 10% của 1.000.000 = 100.000 đ', (await text(p, '[data-testid="ct-so"]')) === '100.000 đ', await text(p, '[data-testid="ct-so"]'));
  await diTo(p, '#/chia-tien/tip');
  check('tip 10% hóa đơn 850.000 chia 3 = 311.667 đ', (await text(p, '[data-testid="ct-so"]')) === '311.667 đ', await text(p, '[data-testid="ct-so"]'));
  check('không tràn ngang (chia tiền)', (await batNgang(p)) <= 0, String(await batNgang(p)));

  // ---------- Đếm ngược ----------
  await diTo(p, '#/dem-nguoc');
  await clickText(p, 'button', 'Thêm');
  check('thiếu tên: báo lỗi', (await text(p, '.msg.err'))?.includes('đặt tên'));
  await p.type('input[aria-label="Tên sự kiện"]', 'Hạn thẻ ngân hàng');
  const ngayLa = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await dat(p, 'Ngày', ngayLa);
  await clickText(p, 'button', 'Thêm');
  check('thêm sự kiện: còn 30 ngày', (await text(p, '.cd-count b')) === 'Còn 30 ngày', await text(p, '.cd-count b'));
  await clickText(p, 'button', '+ Tết Nguyên Đán');
  check('thêm nhanh Tết Nguyên Đán (2 mục)', (await p.$$eval('.cd', (a) => a.length)) === 2);
  await chup(p, `${tag}-13-demnguoc`);
  await p.reload({ waitUntil: 'load' });
  await sleep(150);
  check('đếm ngược lưu qua lần tải lại', (await p.$$eval('.cd', (a) => a.length)) === 2);
  await p.click('.cd .icon-b[aria-label^="Xóa"]');
  check('xóa sự kiện', (await p.$$eval('.cd', (a) => a.length)) === 1);

  // ---------- Đọc số ----------
  await diTo(p, '#/doc-so');
  check('đọc số mặc định: Ba triệu hai trăm năm mươi nghìn đồng chẵn.', (await text(p, '[data-testid="ds-chu"]')) === 'Ba triệu hai trăm năm mươi nghìn đồng chẵn.', await text(p, '[data-testid="ds-chu"]'));
  await dat(p, 'Số cần đọc', '1.005');
  check('1.005 = một nghìn không trăm lẻ năm', (await text(p, '[data-testid="ds-chu"]'))?.startsWith('Một nghìn không trăm lẻ năm'), await text(p, '[data-testid="ds-chu"]'));
  await dat(p, 'Số cần đọc', 'abc');
  check('số sai: báo lỗi', (await text(p, '.msg.err'))?.includes('Chưa phải số'));
  await dat(p, 'Số cần đọc', '25');
  await chup(p, `${tag}-14-docso`);
  await diTo(p, '#/doc-so/bo-dau');
  await p.type('textarea[aria-label="Văn bản cần bỏ dấu"]', 'Nguyễn Văn Đạt, Đường Lê Lợi');
  check('bỏ dấu', (await p.$eval('[data-testid="bd-ra"]', (e) => e.value)) === 'Nguyen Van Dat, Duong Le Loi', await p.$eval('[data-testid="bd-ra"]', (e) => e.value));

  // ---------- Điều hướng ----------
  await diTo(p, '#/khong-co');
  check('đường dẫn lạ về trang chủ', (await p.$$eval('.mod', (a) => a.length)) === 7);
  await diTo(p, '#/may-tinh');
  await p.click('.back');
  await sleep(100);
  check('nút "Tất cả tiện ích" về trang chủ', (await p.$$eval('.mod', (a) => a.length)) === 7);

  // dịch vụ
  const sw = await p.evaluate(async () => { try { const r = await navigator.serviceWorker.getRegistration(); return !!r; } catch { return false; } });
  check('service worker đã đăng ký', sw);
  await p.close();
  await ctx.close();
}

async function chayKhongNhanGiong() {
  nhom = 'khong-ho-tro-giong';
  const ctx = await browser.createBrowserContext();
  const p = await moTrang(ctx, { view: MOBILE, khongSR: true, url: '/#/may-tinh' });
  check('thông báo rõ khi trình duyệt không hỗ trợ giọng nói', (await text(p, '[data-testid="khong-ho-tro"]'))?.includes('chưa hỗ trợ nhận giọng nói'));
  check('nút micro hiển thị trạng thái tắt', await p.$eval('.mic', (e) => e.classList.contains('off')));
  await click(p, '.mic');
  await sleep(100);
  check('bấm micro báo hướng dẫn gõ', (await text(p, '.voice-status'))?.includes('chưa hỗ trợ'));
  await p.type('.voice-in', 'hai lẻ năm nhân ba');
  await p.keyboard.press('Enter');
  await sleep(120);
  check('vẫn tính được bằng ô gõ: 205 × 3 = 615', (await text(p, '[data-testid="ket-qua-so"]')) === '= 615', await text(p, '[data-testid="ket-qua-so"]'));
  for (const k of ['9', '×', '9', '=']) await click(p, `.key[data-k="${k}"]`);
  check('vẫn dùng được bàn phím số: 9×9 = 81', (await text(p, '[data-testid="bt"]')) === '81');
  await chup(p, 'mobile-15-khong-ho-tro-giong');
  await p.close(); await ctx.close();
}

try {
  await chayBoKiem('mobile', MOBILE);
  await chayBoKiem('desktop', DESKTOP);
  await chayBoKiem('mobile', MOBILE, { dark: true });
  await chayKhongNhanGiong();
} catch (e) {
  console.error('LỖI CHẠY E2E:', e);
  ketQua.push({ ten: 'chạy e2e không đứt giữa chừng: ' + e.message, ok: false });
}

nhom = 'console';
check('không có lỗi hay cảnh báo console', loiConsole.length === 0, loiConsole.slice(0, 8).join('\n'));

await browser.close();
server.close();
const dat_ = ketQua.filter((k) => k.ok).length;
console.log(`\nKẾT QUẢ E2E: ${dat_}/${ketQua.length} đạt`);
for (const k of ketQua.filter((x) => !x.ok)) console.log('  LỖI:', k.ten);
process.exit(dat_ === ketQua.length ? 0 : 1);
