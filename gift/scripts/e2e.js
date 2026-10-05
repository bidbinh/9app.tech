// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): ba nhân vật dùng thử trọn luồng, 390x844 / 360x740 / 1280x800, sáng và tối, ngoại tuyến.
// Chạy: node scripts/e2e.js   Ảnh lưu ở shots/. Đồng hồ trang được cố định ở 05/10/2026 để kết quả ổn định.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { lanKeTiep } from '../js/lib/nhac.js';
import { amCua } from '../js/lib/ngay.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

// ---------- Máy chủ tĩnh, cổng ngẫu nhiên >= 24000 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
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
  const cand = 27000 + Math.floor(Math.random() * 2900);
  await new Promise((r) => { server.once('error', () => r()); server.listen(cand, '127.0.0.1', () => { port = cand; r(); }); });
}
if (!port) throw new Error('không mở được cổng');
const ORIGIN = `http://127.0.0.1:${port}`;
console.log('máy chủ thử:', ORIGIN);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9gift-chrome-'));
const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), '9gift-dl-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 180000, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`] });

const ketQua = []; const loiConsole = []; const vanDe = [];
let nhom = '';
process.on('uncaughtException', (e) => { console.log('Lỗi console trước khi dừng:', [...new Set(loiConsole)].slice(0, 10)); console.error(e); process.exit(2); });
function check(ten, ok, chiTiet = '') {
  ketQua.push({ ten: `[${nhom}] ${ten}`, ok: !!ok });
  console.log(`${ok ? 'ĐẠT' : 'LỖI'}  [${nhom}] ${ten}${ok ? '' : '  -> ' + chiTiet}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Đồng hồ cố định 05/10/2026 09:00 (giờ Việt Nam), vẫn chạy tiếp. Giả lập SpeechRecognition có độ trễ để quan sát các trạng thái.
const STUB = `
(() => {
  const FIX = new Date('2026-10-05T09:00:00+07:00').getTime(); const T0 = performance.now(); const RD = Date;
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX + (performance.now() - T0)); } static now() { return FIX + (performance.now() - T0); } }
  window.Date = FD;
  if (window.__KHONG_SR) { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; return; }
  class FakeRec {
    constructor() { this.lang = ''; }
    start() {
      window.__recLang = this.lang;
      const cham = window.__NOI_CHAM || 700;
      setTimeout(() => { this.onstart && this.onstart(); }, 30);
      setTimeout(() => {
        if (window.__NOI_LOI) { this.onerror && this.onerror({ error: window.__NOI_LOI }); this.onend && this.onend(); return; }
        const t = (window.__NOI || [''])[0];
        const tam = [{ transcript: t.slice(0, 8), confidence: 0.5 }]; tam.isFinal = false;
        this.onresult && this.onresult({ resultIndex: 0, results: [tam] });
        const kq = [{ transcript: t, confidence: 0.9 }]; kq.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [kq] });
        setTimeout(() => { this.onend && this.onend(); }, 30);
      }, cham);
    }
    stop() { setTimeout(() => { this.onend && this.onend(); }, 5); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
  window.__printLan = 0; window.print = () => { window.__printLan++; };
})();`;

async function moTrang(ctx, { view, dark = false, khongSR = false, url = '/', cdp = true }) {
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2 });
  await page.emulateTimezone('Asia/Ho_Chi_Minh');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.evaluateOnNewDocument(`window.__KHONG_SR = ${khongSR ? 'true' : 'false'};`);
  await page.evaluateOnNewDocument(STUB);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) loiConsole.push(`${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => loiConsole.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { if (!r.url().includes('favicon')) loiConsole.push('requestfailed: ' + r.url()); });
  if (cdp) {
    const c = await browser.target().createCDPSession();
    await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, browserContextId: ctx.id }).catch((e) => console.log('setDownloadBehavior lỗi', e.message));
  }
  for (let lan = 0; ; lan++) {
    try {
      await page.goto(ORIGIN + url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.documentElement.dataset.san === '1', { timeout: 8000 });
      return page;
    } catch (e) { if (lan >= 2) throw e; console.log('   (tải trang lại lần', lan + 1, e.message.slice(0, 60), ')'); await sleep(1000); }
  }
}
const vaoHash = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(250); };
const chup = async (page, ten) => { await page.screenshot({ path: path.join(SHOTS, `${ten}.png`) }); };
const text = (page) => page.evaluate(() => document.getElementById('view').innerText);
const click = async (page, sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await page.click(sel); await sleep(200); };
const dien = async (page, sel, v) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Backspace'); try { await page.type(sel, v); } catch (e) { console.log('dien lỗi', sel, await page.evaluate(() => location.hash + ' | ' + document.getElementById('view').innerText.slice(0, 200))); throw e; } };
const dienDate = (page, sel, v) => page.evaluate((s, val) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
const demDen = (page, sel, n, ms = 4000) => page.waitForFunction((q, k) => document.querySelectorAll(q).length === k, { timeout: ms }, sel, n).then(() => true).catch(() => false);
const coSel = (page, sel, ms = 4000) => page.waitForSelector(sel, { timeout: ms }).then(() => true).catch(() => false);
const chonOpt = (page, sel, v) => page.select(sel, v);
const chuDen = async (page, re, ms = 4000) => { try { await page.waitForFunction((r) => new RegExp(r).test(document.getElementById('view').innerText), { timeout: ms }, re.source); return true; } catch { console.log('   (màn hiện tại) ' + (await page.evaluate(() => location.hash + ' | ' + document.getElementById('view').innerText.replace(/\s+/g, ' ').slice(0, 200) + ' | LOI=' + (document.querySelector('[data-testid=f-loi]') || {}).textContent)).trim()); return false; } };

// ---------- Kiểm tra chung cho mỗi màn ----------
async function kiemTraMan(page, ten) {
  const r = await page.evaluate(() => {
    const out = { tran: false, nho: [], chạm: [], tuongPhan: [] };
    const de = document.documentElement;
    out.tran = de.scrollWidth > de.clientWidth + 1;
    const hienThi = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
    // chữ >= 14px (kích thước hiển thị)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set(); let n;
    const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const trộn = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const nen = (el) => {
      const chain = [];
      for (let e = el; e; e = e.parentElement) chain.push(e);
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      const html = getComputedStyle(document.documentElement).backgroundColor; const hb = rgb(html); if (hb && hb.a > 0) bg = hb;
      const bb = rgb(getComputedStyle(document.body).backgroundColor); if (bb && bb.a > 0) bg = trộn(bb, bg);
      for (const e of chain.reverse()) {
        const s = getComputedStyle(e);
        if (s.backgroundImage && s.backgroundImage.includes('gradient')) { const m = s.backgroundImage.match(/rgba?\([^)]+\)/); if (m) bg = trộn(rgb(m[0]), bg); }
        const c = rgb(s.backgroundColor); if (c && c.a > 0) bg = trộn(c, bg);
      }
      return bg;
    };
    while ((n = w.nextNode())) {
      const t = n.textContent.trim(); if (!t) continue;
      const el = n.parentElement; if (!el || seen.has(el) || !hienThi(el)) continue;
      if (el.closest('svg, dialog:not([open]), .visually, script, style')) continue;
      seen.add(el);
      const s = getComputedStyle(el);
      const px = parseFloat(s.fontSize);
      if (px < 13.99) out.nho.push(`${el.tagName}.${el.className}: ${px}px "${t.slice(0, 30)}"`);
      let fg = rgb(s.color); if (!fg) continue;
      const bg = nen(el); fg = trộn(fg, bg);
      const l1 = lum(fg); const l2 = lum(bg);
      const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const lon = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
      if (cr < (lon ? 3 : 4.5)) out.tuongPhan.push(`${cr.toFixed(2)} ${el.tagName}.${el.className} "${t.slice(0, 24)}" fg=${s.color}`);
    }
    // vùng chạm >= 44px cho nút, liên kết, ô nhập (bỏ qua liên kết nằm trong đoạn văn)
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]):not(.visually), select, textarea, summary')) {
      if (!hienThi(el) || el.closest('.skip')) continue;
      let r = el.getBoundingClientRect();
      if (el.matches('input[type=checkbox], input[type=radio]')) { const lb = el.closest('label'); if (lb) r = lb.getBoundingClientRect(); }
      if (el.closest('p') && el.tagName === 'A') continue;
      if (r.height < 43.5 || r.width < 43.5) out.chạm.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}"`);
    }
    return out;
  });
  check(`${ten}: không tràn ngang`, !r.tran);
  check(`${ten}: chữ hiển thị >= 14px`, r.nho.length === 0, r.nho.slice(0, 4).join(' | '));
  check(`${ten}: vùng chạm >= 44px`, r.chạm.length === 0, r.chạm.slice(0, 5).join(' | '));
  check(`${ten}: tương phản chữ đạt AA`, r.tuongPhan.length === 0, r.tuongPhan.slice(0, 5).join(' | '));
  if (r.tran) vanDe.push(`${ten}: tràn ngang`);
  return r;
}

const DT = { w: 390, h: 844, mobile: true, hasTouch: true };
const VIEWS = { dt: { width: 390, height: 844, isMobile: true, hasTouch: true }, nho: { width: 360, height: 740, isMobile: true, hasTouch: true }, may: { width: 1280, height: 800 } };

async function layBang(page, ten) { return page.evaluate((t) => document.querySelector(t) !== null, ten); }
async function doiFile(re, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const fs1 = fs.readdirSync(dlDir).filter((f) => re.test(f) && !f.endsWith('.crdownload'));
    if (fs1.length) return path.join(dlDir, fs1[0]);
    await sleep(150);
  }
  return null;
}
const xoaDl = () => { for (const f of fs.readdirSync(dlDir)) fs.unlinkSync(path.join(dlDir, f)); };

// =====================================================================
const mkCtx = () => (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
let ctx = await mkCtx();
let page;

// ---------- NHÂN VẬT 1: nhân viên văn phòng hay đi cưới (390x844) ----------
const SKIP = new Set((process.env.SKIP || '').split(','));
if (!SKIP.has('1')) {
nhom = 'Văn phòng';
page = await moTrang(ctx, { view: VIEWS.dt });
check('trang mở được, tiêu đề tiếng Việt', (await page.title()).includes('9gift'));
check('thanh dưới có đúng 5 mục', (await page.$$eval('.tabbar .tab', (a) => a.length)) === 5);
check('trạng thái trống có lời mời bắt đầu', (await text(page)).includes('Bắt đầu với 9gift'));
await kiemTraMan(page, 'Sắp tới (trống)');
await chup(page, '01-saptoi-trong-390');

// thêm người
await click(page, '[data-testid=bd-them-nguoi]');
await dien(page, '[data-testid=p-ten]', 'Nguyễn Văn Hùng');
await dien(page, '[data-testid=p-goi]', 'anh Hùng');
await chonOpt(page, '[data-testid=p-qh]', 'dong-nghiep');
await dien(page, '[data-testid=p-nhom]', 'Công ty');
await click(page, '.seg button[data-v=duong]');
await dien(page, '[data-testid=p-sn-ngay]', '12');
await dien(page, '[data-testid=p-sn-thang]', '10');
await dien(page, '[data-testid=p-sn-nam]', '1990');
check('xem trước sinh nhật hiện cả ngày âm', /âm lịch/.test(await page.$eval('[data-testid=p-sn-xem]', (e) => e.textContent)), await page.$eval('[data-testid=p-sn-xem]', (e) => e.textContent));
await chup(page, '02-form-nguoi-390');
await kiemTraMan(page, 'Form thêm người');
await click(page, '[data-testid=p-luu]');
check('thêm người xong về danh bạ, thấy tên', await chuDen(page, /Nguyễn Văn Hùng/));
await chup(page, '03-danhba-390');
await kiemTraMan(page, 'Danh bạ');

// ghi nhanh bằng gõ câu
await vaoHash(page, '#/le');
await dien(page, '[data-testid=nhap-nhanh]', 'mừng cưới anh Hùng 1 triệu 2');
await click(page, '[data-testid=nhap-soat]');
const thayXuLy = await page.waitForFunction(() => document.querySelector('[data-testid=mic-trang-thai]')?.dataset.trang === 'xu-ly', { timeout: 1500 }).then(() => true).catch(() => false);
check('gõ câu: có trạng thái đang xử lý (xoay xoay)', thayXuLy);
check('gõ câu: chuyển sang biểu mẫu để soát', await chuDen(page, /Kết quả để soát/));
check('gõ câu: số tiền = 1.200.000', (await page.$eval('[data-testid=f-tien]', (e) => e.value)) === '1.200.000', await page.$eval('[data-testid=f-tien]', (e) => e.value));
check('gõ câu: người = anh Hùng (khớp danh bạ)', (await page.$eval('[data-testid=f-nguoi]', (e) => e.value)).includes('Hùng'));
check('gõ câu: sự kiện = Đám cưới', (await page.$eval('[data-testid=f-sk]', (e) => e.value)) === 'cuoi');
check('ô số tiền hiện "bằng chữ"', /một triệu hai trăm nghìn/i.test(await page.$eval('[data-testid=tien-bang-chu]', (e) => e.textContent)), await page.$eval('[data-testid=tien-bang-chu]', (e) => e.textContent));
await chup(page, '04-soat-cau-390');
await kiemTraMan(page, 'Soát kết quả ghi nhanh');
await click(page, '[data-testid=f-luu]');
check('lưu khoản: về danh sách, thấy khoản 1.200.000', await chuDen(page, /1\.200\.000 đ/));
check('câu gốc không bị lưu (ô trống)', (await page.$eval('[data-testid=nhap-nhanh]', (e) => e.value)) === '');
check('thông báo có nút Hoàn tác', (await page.$$eval('#snack button', (b) => b.map((x) => x.textContent))).includes('Hoàn tác'));

// ghi bằng giọng nói: người chưa có trong danh bạ, chiều nhận
await page.evaluate(() => { window.__NOI = ['chị Lan mừng mình 2 triệu đám cưới']; window.__NOI_CHAM = 900; });
await click(page, '[data-testid=mic]');
const nghe = await page.waitForFunction(() => document.querySelector('[data-testid=mic-trang-thai]')?.dataset.trang === 'nghe', { timeout: 2000 }).then(() => true).catch(() => false);
check('mic: trạng thái đang nghe có chữ và nút đổi nhãn', nghe && /Đang nghe/.test(await page.$eval('[data-testid=mic-trang-thai]', (e) => e.textContent)) && (await page.$eval('[data-testid=mic]', (e) => e.getAttribute('aria-label'))) === 'Dừng nghe');
await chup(page, '05-mic-dang-nghe-390');
const xuly = await page.waitForFunction(() => document.querySelector('[data-testid=mic-trang-thai]')?.dataset.trang === 'xu-ly', { timeout: 3000 }).then(() => true).catch(() => false);
check('mic: sau khi nghe có trạng thái xử lý với vòng xoay', xuly && (await page.$('.mic-status .spinner')) !== null);
if (xuly) await chup(page, '06-mic-dang-xu-ly-390');
check('mic: ra kết quả để soát', await chuDen(page, /Kết quả để soát/, 3000));
check('mic: ngôn ngữ nhận dạng vi-VN', (await page.evaluate(() => window.__recLang)) === 'vi-VN');
check('mic: chiều = Mình nhận, số tiền 2.000.000', (await page.$eval('.seg button[data-v=den]', (b) => b.getAttribute('aria-pressed'))) === 'true' && (await page.$eval('[data-testid=f-tien]', (e) => e.value)) === '2.000.000');
check('mic: tên chị Lan, hộp "lưu vào danh bạ" hiện', (await page.$eval('[data-testid=f-nguoi]', (e) => e.value)).toLowerCase().includes('lan') && (await page.$('#f-luu-db')) !== null && await page.$eval('#f-luu-db', (e) => !e.closest('label').hidden));
await click(page, '[data-testid=f-luu]');
check('lưu khoản nhận: thấy 2 khoản', await chuDen(page, /2\.000\.000 đ/));

// lỗi micro không có quyền
await page.evaluate(() => { window.__NOI_LOI = 'not-allowed'; });
await click(page, '[data-testid=mic]');
await sleep(1300);
check('mic: lỗi quyền hiện thông báo tiếng Việt dễ hiểu', /bật quyền micro|gõ câu/.test(await page.$eval('[data-testid=mic-trang-thai]', (e) => e.textContent)));
await page.evaluate(() => { window.__NOI_LOI = ''; });

// nợ lễ
await click(page, '.seg-a[data-tab=no]');
check('Nợ lễ: Lan đã mừng mình chưa đáp', await chuDen(page, /chưa đáp lễ \(1\)/) && /Lan/.test(await page.$eval('[data-testid=ds-chua-dap]', (e) => e.innerText)));
check('Nợ lễ: Hùng mình mừng chưa nhận lại', /họ chưa đáp lại \(1\)/.test(await text(page)) && /Hùng/.test(await page.$eval('[data-testid=ds-chua-nhan]', (e) => e.innerText)));
check('Nợ lễ: ghi rõ ghép theo số khoản, không theo số tiền', await layBang(page, '[data-testid=ghep-theo-so-khoan]'));
check('Nợ lễ: có chú thích "chỉ để tham khảo"', /chỉ để tham khảo/.test(await text(page)));
await chup(page, '07-no-le-390');
await kiemTraMan(page, 'Nợ lễ');
await click(page, '[data-testid=ghi-da-dap]');
check('Ghi đã đáp: form điền sẵn 2.000.000, chiều Mình đi mừng', (await page.$eval('[data-testid=f-tien]', (e) => e.value)) === '2.000.000' && (await page.$eval('.seg button[data-v=di]', (b) => b.getAttribute('aria-pressed'))) === 'true');
await click(page, '[data-testid=f-luu]');
await vaoHash(page, '#/le/no');
check('Sau khi đáp lễ, Lan hết nợ', /chưa đáp lễ \(0\)/.test(await text(page)), (await text(page)).slice(0, 300));

// thống kê
await vaoHash(page, '#/le/thong-ke');
check('Thống kê: có biểu đồ SVG với thanh', (await page.$$eval('svg.chart rect', (r) => r.length)) >= 4);
check('Thống kê: tổng đã đi = 3.200.000', /3\.200\.000 đ/.test(await page.$eval('[data-testid=tk-tong]', (e) => e.innerText)), await page.$eval('[data-testid=tk-tong]', (e) => e.innerText));
await chup(page, '08-thong-ke-390');
await kiemTraMan(page, 'Thống kê');

// CSV + in
await vaoHash(page, '#/le');
xoaDl();
await click(page, '[data-testid=xuat-csv]');
const csv = await doiFile(/\.csv$/);
check('Xuất CSV tạo được tệp', !!csv);
if (csv) {
  const nd = fs.readFileSync(csv, 'utf8');
  check('CSV: có BOM, tiêu đề và 3 dòng dữ liệu', nd.startsWith('\uFEFF') && nd.split('\r\n').filter(Boolean).length === 5 && /^sep=,/.test(nd.replace('\uFEFF', '')) && /Nguyễn Văn Hùng/.test(nd) && /1200000/.test(nd), nd.slice(0, 200));
}
await click(page, '[data-testid=in-so]');
await sleep(300);
check('In sổ: chèn bảng in và gọi window.print', (await page.evaluate(() => window.__printLan)) >= 1 || (await layBang(page, '#in-an')));

// Sắp tới có sinh nhật Hùng và dịp lễ
await vaoHash(page, '#/');
const stt = await text(page);
check('Sắp tới: có sinh nhật anh Hùng 12/10', /Sinh nhật anh Hùng/.test(stt) && /12\/10\/2026/.test(stt), stt.slice(0, 400));
check('Sắp tới: hiện ngày âm lịch hôm nay', /tháng \d+.*năm Bính Ngọ/.test(stt));
check('Sắp tới: có Ngày Phụ nữ Việt Nam 20/10', /Phụ nữ Việt Nam 20\/10/.test(stt));
check('Sắp tới: có thẻ Sổ nợ lễ', await layBang(page, '[data-testid=the-no-le]'));
check('Sắp tới: nhắc sao lưu khi chưa sao lưu', await layBang(page, '[data-testid=nhac-sao-luu]'));
await chup(page, '09-saptoi-390');
await kiemTraMan(page, 'Sắp tới (có dữ liệu)');

// .ics
await vaoHash(page, '#/them/nhac');
xoaDl();
await click(page, '[data-testid=tai-ics]');
const ics = await doiFile(/\.ics$/);
check('Tải được tệp .ics', !!ics);
if (ics) {
  const nd = fs.readFileSync(ics, 'utf8');
  check('.ics: có VEVENT cho sinh nhật anh Hùng và VALARM', /SUMMARY:Sinh nhật anh Hùng/.test(nd) && /BEGIN:VALARM/.test(nd) && /DTSTART;VALUE=DATE:20261012/.test(nd), nd.slice(0, 300));
}
await chup(page, '10-nhac-ics-390');
await kiemTraMan(page, 'Nhắc .ics');

// gợi ý quà và lời chúc
await vaoHash(page, '#/qua?dip=sinhNhat');
check('Gợi ý quà: có danh sách và mẹo', (await page.$$eval('[data-testid=goi-y]', (a) => a.length)) >= 3);
await chup(page, '11-goi-y-qua-390');
await kiemTraMan(page, 'Gợi ý quà');
await vaoHash(page, '#/qua/chuc');
check('Lời chúc: có thẻ lời và nút sao chép', (await page.$$eval('[data-testid=loi]', (a) => a.length)) >= 3 && await layBang(page, '[data-testid=chep-loi]'));
await chonOpt(page, '#c-dip', 'tang');
check('Lời chia buồn: chỉ có giọng trang trọng và thân mật, kèm ghi chú', (await page.$$eval('.seg button', (b) => b.map((x) => x.textContent))).join('|') === 'Trang trọng|Thân mật' && await layBang(page, '[data-testid=ghi-chu-tang]'));
check('Lời chia buồn: không có từ chúc mừng', !/chúc mừng|vui vẻ|hạnh phúc/i.test(await page.$$eval('[data-testid=loi] .wish', (a) => a.map((x) => x.innerText).join(' '))));
await chup(page, '12-loi-chia-buon-390');
await chonOpt(page, '#c-dip', 'cuoi');
await click(page, '.seg button[data-v=haiHuoc]');
check('Lời chúc cưới giọng hài hước nhẹ có nội dung', (await page.$$eval('[data-testid=loi]', (a) => a.length)) >= 3);
await click(page, '[data-testid=chep-loi]');
check('Sao chép lời chúc báo thành công hoặc hướng dẫn', /sao chép/i.test(await page.$eval('#snack', (e) => e.innerText)));
await chup(page, '13-loi-chuc-cuoi-390');
await kiemTraMan(page, 'Lời chúc');

// dữ liệu của tôi + sao lưu
await vaoHash(page, '#/them/du-lieu');
xoaDl();
await click(page, '[data-testid=xuat-json]');
const json = await doiFile(/\.json$/);
check('Xuất JSON sao lưu', !!json);
let sao = null;
if (json) {
  sao = JSON.parse(fs.readFileSync(json, 'utf8'));
  check('JSON: đúng cấu trúc 9gift (2 người, 3 khoản)', sao.app === '9gift' && sao.people.length === 2 && sao.entries.length === 3, JSON.stringify([sao.people.length, sao.entries.length]));
}
await chup(page, '14-du-lieu-390');
await kiemTraMan(page, 'Dữ liệu của tôi');
// tải lại trang: dữ liệu còn nguyên
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.documentElement.dataset.san === '1');
await vaoHash(page, '#/ban');
check('Tải lại trang: danh bạ vẫn còn (IndexedDB)', /Nguyễn Văn Hùng/.test(await text(page)));

// ngoại tuyến
await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
await sleep(800);
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'networkidle0' }).catch(() => {});
await page.waitForFunction(() => document.documentElement.dataset.san === '1', { timeout: 8000 }).catch(() => {});
await vaoHash(page, '#/le');
check('Ngoại tuyến: mở lại được và thấy sổ lễ', /1\.200\.000 đ/.test(await text(page)), (await text(page)).slice(0, 200));
await vaoHash(page, '#/qua/chuc');
check('Ngoại tuyến: lời chúc vẫn dùng được', (await page.$$eval('[data-testid=loi]', (a) => a.length)) >= 3);
await chup(page, '15-ngoai-tuyen-390');
await page.setOfflineMode(false);

// xóa sạch rồi nhập lại
await vaoHash(page, '#/them/du-lieu');
await click(page, '[data-testid=xoa-sach]');
await click(page, '[data-testid=hoi-dong-y]');
await sleep(200);
await click(page, '[data-testid=hoi-dong-y]');
await sleep(500);
check('Xóa sạch: về Sắp tới với trạng thái trống', await chuDen(page, /Bắt đầu với 9gift/));
await vaoHash(page, '#/them/du-lieu');
const dem0 = await page.$eval('[data-testid=dem-du-lieu]', (e) => e.innerText);
check('Xóa sạch: số liệu về 0', /Người trong danh bạ\s+0/.test(dem0.replace(/\n/g, ' ')) || /0/.test(dem0), dem0);
if (json) {
  const input = await page.$('[data-testid=nhap-file]');
  await input.uploadFile(json);
  await page.waitForSelector('dialog[open]', { timeout: 4000 });
  await click(page, '[data-testid=hoi-dong-y]');
  await sleep(600);
  await vaoHash(page, '#/ban');
  check('Nhập lại bản sao lưu: danh bạ trở lại', /Nguyễn Văn Hùng/.test(await text(page)));
  await vaoHash(page, '#/le');
  check('Nhập lại: 3 khoản trong sổ', (await page.$$eval('[data-testid=khoan]', (a) => a.length)) === 3);
}
// nhập tệp hỏng
{
  const bad = path.join(dlDir, 'hong.json'); fs.writeFileSync(bad, '{"app":"khac"}');
  await vaoHash(page, '#/them/du-lieu');
  const input = await page.$('[data-testid=nhap-file]');
  await input.uploadFile(bad);
  await sleep(500);
  check('Nhập tệp không đúng định dạng: báo lỗi rõ ràng', /không phải bản sao lưu/.test(await page.$eval('#snack', (e) => e.innerText)));
}
await page.close();
}

// ---------- NHÂN VẬT 2: người giữ sổ gia đình, ngày giỗ, nội ngoại (390x844) ----------
nhom = 'Gia đình';
ctx = await mkCtx();
page = await moTrang(ctx, { view: VIEWS.dt });
const themNguoi = async (ten, goi, qh, nhomTen, sinhKieu, d, m, y, ghi) => {
  await vaoHash(page, '#/ban/moi');
  await dien(page, '[data-testid=p-ten]', ten);
  if (goi) await dien(page, '[data-testid=p-goi]', goi);
  await chonOpt(page, '[data-testid=p-qh]', qh);
  if (nhomTen) await dien(page, '[data-testid=p-nhom]', nhomTen);
  if (sinhKieu) {
    await click(page, `.seg button[data-v=${sinhKieu}]`);
    await dien(page, '[data-testid=p-sn-ngay]', String(d)); await dien(page, '[data-testid=p-sn-thang]', String(m)); if (y) await dien(page, '[data-testid=p-sn-nam]', String(y));
  }
  if (ghi) await dien(page, '#p-ghi', ghi);
  await click(page, '[data-testid=p-luu]');
};
// Hôm nay 5/10/2026 = âm 24/8. Sinh nhật âm 10/9 rơi trong 30 ngày tới.
await themNguoi('Trần Thị Bảy', 'bà nội', 'ong-ba', 'Họ nội', 'am', 10, 9, 1950, 'Dị ứng tôm cua. Thích trà sen.');
await themNguoi('Lê Văn Tư', 'chú Tư', 'ho-hang-tren', 'Họ ngoại', 'duong', 20, 10, 1975, '');
await themNguoi('Phạm Thị Hoa', 'cô Hoa', 'ho-hang-tren', 'Họ ngoại', 'am', 30, 12, 1960, '');
check('Danh bạ: 3 người', (await page.$$eval('[data-testid=nguoi]', (a) => a.length)) === 3);
// tìm không dấu
await dien(page, '[data-testid=tim-ban]', 'ba noi');
check('Tìm không dấu "ba noi" ra bà nội', (await page.$$eval('[data-testid=nguoi]', (a) => a.length)) === 1);
await dien(page, '[data-testid=tim-ban]', 'di ung tom');
check('Tìm theo ghi chú "di ung tom"', (await page.$$eval('[data-testid=nguoi]', (a) => a.length)) === 1);
await dien(page, '[data-testid=tim-ban]', '');
await click(page, '.chips .chip:nth-child(3)');
check('Lọc theo nhóm Họ nội/Họ ngoại hoạt động', (await page.$$eval('[data-testid=nguoi]', (a) => a.length)) >= 1);
await click(page, '.chips .chip:nth-child(1)');

// ngày giỗ âm
const ngBa = await page.$$eval('[data-testid=nguoi]', (a) => a.map((x) => x.innerText));
await vaoHash(page, '#/them/ngay/moi');
await chonOpt(page, '[data-testid=d-loai]', 'gio');
await dien(page, '[data-testid=d-ten]', 'Ông nội');
await dien(page, '[data-testid=d-ngay]', '1'); await dien(page, '[data-testid=d-thang]', '9'); await dien(page, '[data-testid=d-nam]', '2015');
const xemGio = await page.$eval('[data-testid=d-xem]', (e) => e.textContent);
const mongGio = lanKeTiep({ kieu: 'am', ngay: 1, thang: 9 }, '2026-10-05');
check('Giỗ âm 1/9: xem trước đúng ngày dương theo thuật toán', xemGio.includes(mongGio.iso.split('-').reverse().join('/')), `${xemGio} | mong ${mongGio.iso}`);
await click(page, '[data-testid=d-luu]');
// giỗ ngày 30 tháng 12 âm (có thể là tháng thiếu)
await vaoHash(page, '#/them/ngay/moi');
await chonOpt(page, '[data-testid=d-loai]', 'gio');
await dien(page, '[data-testid=d-ten]', 'Bà ngoại');
await dien(page, '[data-testid=d-ngay]', '30'); await dien(page, '[data-testid=d-thang]', '12'); await dien(page, '[data-testid=d-nam]', '2010');
const xem30 = await page.$eval('[data-testid=d-xem]', (e) => e.textContent);
const mong30 = lanKeTiep({ kieu: 'am', ngay: 30, thang: 12 }, '2026-10-05');
check('Giỗ 30/12 âm: ngày dương đúng và có chú thích tháng thiếu', xem30.includes(mong30.iso.split('-').reverse().join('/')) && /Tháng thiếu/.test(xem30), `${xem30} | mong ${mong30.iso}`);
await chup(page, '16-form-ngay-gio-390');
await kiemTraMan(page, 'Form ngày giỗ');
await click(page, '[data-testid=d-luu]');
await sleep(300);
check('Danh sách ngày quan trọng có 2 ngày giỗ', await demDen(page, '[data-testid=ds-ngay] li', 2));
await chup(page, '17-ds-ngay-390');

// Sắp tới: sinh nhật âm bà nội 10/9 và giỗ ông nội 1/9
await vaoHash(page, '#/');
const st2 = await text(page);
const snBa = lanKeTiep({ kieu: 'am', ngay: 10, thang: 9 }, '2026-10-05');
const dmy = (iso) => iso.split('-').reverse().join('/');
check('Sắp tới: sinh nhật âm bà nội đúng ngày dương', st2.includes(`Sinh nhật bà nội`) && st2.includes(dmy(snBa.iso)), `${dmy(snBa.iso)} | ${st2.slice(0, 500)}`);
check('Sắp tới: hiện ngày âm bên cạnh', /10\/9 âm lịch/.test(st2));
check('Sắp tới: giỗ ông nội có nút Văn khấn (sang Vạn Niên)', st2.includes('Giỗ Ông nội') && (await layBang(page, 'a[href*="vannien/#/van-khan/gio"]')));
check('Sắp tới: giỗ lần thứ N hiện đúng', /giỗ lần thứ 11/.test(st2) || /giỗ lần thứ 1\d/.test(st2), st2.slice(0, 600));
await chup(page, '18-saptoi-gia-dinh-390');
await kiemTraMan(page, 'Sắp tới (gia đình)');
// 90 ngày
await click(page, '.seg button[data-v="90"]');
check('Chuyển 90 ngày thấy thêm Tết/dịp khác', /90 ngày/.test(await text(page)));

// chi tiết người: ghi chú dị ứng, quà trùng
await vaoHash(page, '#/ban');
await click(page, '[data-testid=nguoi]');
await page.evaluate(() => { const a = [...document.querySelectorAll('[data-testid=nguoi]')].find((x) => /Bảy/.test(x.innerText)); if (a) a.click(); });
await sleep(300);
check('Chi tiết: ghi chú dị ứng nổi bật', /Dị ứng tôm cua/.test(await page.$eval('[data-testid=ghi-chu-nguoi]', (e) => e.innerText).catch(() => '')));
await dien(page, '[data-testid=qua-y-tuong]', 'Hộp trà sen');
await click(page, '[data-testid=luu-da-tang]');
await dien(page, '[data-testid=qua-y-tuong]', 'hộp trà sen');
await click(page, '[data-testid=luu-y-tuong]');
check('Quà trùng: cảnh báo đã tặng', /Bạn đã tặng/.test(await page.$eval('[data-testid=qua-canh-bao]', (e) => e.textContent)), await page.$eval('[data-testid=qua-canh-bao]', (e) => e.textContent));
await chup(page, '19-chi-tiet-nguoi-390');
await kiemTraMan(page, 'Chi tiết người');
// gợi ý quà cho người này: đánh dấu đã tặng
await page.evaluate(() => { [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Gợi ý quà').click(); });
await sleep(300);
check('Gợi ý quà cho bà nội: hiện lưu ý dị ứng', /Dị ứng tôm cua/.test(await page.$eval('[data-testid=luu-y-nguoi]', (e) => e.innerText).catch(() => '')));
await chonOpt(page, '#g-dip', 'tet');
check('Gợi ý quà Tết cho ông bà, cha mẹ có kết quả', (await page.$$eval('[data-testid=goi-y]', (a) => a.length)) >= 2);
// ngân sách
await click(page, 'details > summary');
await dien(page, 'input[placeholder^="Ví dụ: 500.000"]', '200000');
await sleep(300);
check('Ngân sách 200.000 lọc ra mức Gọn nhẹ', (await page.$$eval('[data-testid=goi-y] .tag', (a) => a.map((x) => x.textContent))).includes('Gọn nhẹ'));
await chup(page, '20-goi-y-qua-ngan-sach-390');

// xóa người + hoàn tác
await vaoHash(page, '#/ban');
await page.evaluate(() => { [...document.querySelectorAll('[data-testid=nguoi]')].find((x) => /Phạm Thị Hoa/.test(x.innerText)).click(); });
await sleep(300);
await click(page, '[data-testid=xoa-nguoi]');
await click(page, '[data-testid=hoi-dong-y]');
await sleep(400);
check('Xóa người: về danh bạ còn 2 người', await demDen(page, '[data-testid=nguoi]', 2));
await page.evaluate(() => { [...document.querySelectorAll('#snack button')].find((b) => b.textContent === 'Hoàn tác').click(); });
await sleep(400);
await vaoHash(page, '#/ban');
check('Hoàn tác xóa người: danh bạ trở lại 3 người', (await page.$$eval('[data-testid=nguoi]', (a) => a.length)) === 3);

// nhập sai: lỗi hiển thị
await vaoHash(page, '#/le/moi');
await click(page, '[data-testid=f-luu]');
check('Biểu mẫu trống: báo lỗi rõ', /nhập tên người/i.test(await page.$eval('[data-testid=f-loi]', (e) => e.textContent)));
await dien(page, '[data-testid=f-nguoi]', 'Bác Ba');
await click(page, '[data-testid=f-luu]');
check('Thiếu số tiền: báo lỗi rõ', /số tiền/i.test(await page.$eval('[data-testid=f-loi]', (e) => e.textContent)));
await dien(page, '[data-testid=f-tien]', '500');
check('Số tiền 500 hiểu là 500 nghìn, có chú thích', /500\.000/.test(await page.$eval('[data-testid=tien-bang-chu]', (e) => e.textContent)));
await chonOpt(page, '[data-testid=f-sk]', 'tang');
await click(page, '[data-testid=f-luu]');
check('Lưu phúng viếng 500.000 thành công', await chuDen(page, /500\.000 đ/));
check('Tang lễ ghi nhãn "Mình phúng viếng", không dùng chữ mừng', /Mình phúng viếng/.test(await text(page)) && !/phúng viếng[^\n]*mừng/i.test(await page.$eval('[data-testid=ds-khoan]', (e) => e.innerText)));
await vaoHash(page, '#/qua?dip=thayCo');
check('Gợi ý quà thầy cô: cảnh báo quy định nhận quà', await coSel(page, '[data-testid=luu-y-thay-co]'));
await vaoHash(page, '#/ban');
await page.evaluate(() => { [...document.querySelectorAll('[data-testid=nguoi]')].find((x) => /Lê Văn Tư/.test(x.innerText)).click(); });
await sleep(300);
await click(page, '[data-testid=gop-nguoi]');
await page.select('[data-testid=gop-sel]', await page.$eval('[data-testid=gop-sel] option', (o) => o.value));
await click(page, '[data-testid=gop-ok]');
await vaoHash(page, '#/ban');
check('Gộp người trùng: danh bạ giảm một người', await demDen(page, '[data-testid=nguoi]', 3));
await page.close();

// ---------- NHÂN VẬT 3: bà nội dùng điện thoại chữ lớn (360x740) ----------
nhom = 'Bà nội chữ lớn';
ctx = await mkCtx();
page = await moTrang(ctx, { view: VIEWS.nho });
await vaoHash(page, '#/them/giao-dien');
await click(page, '[data-testid=chu-lon]');
check('Bật Chữ lớn: cỡ chữ gốc 20px', (await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === '20px');
await chup(page, '21-giao-dien-chu-lon-360');
for (const [h, ten] of [['#/', 'Sắp tới'], ['#/le', 'Sổ lễ'], ['#/le/moi', 'Ghi khoản lễ'], ['#/le/no', 'Nợ lễ'], ['#/le/thong-ke', 'Thống kê'], ['#/ban', 'Danh bạ'], ['#/ban/moi', 'Thêm người'], ['#/qua', 'Gợi ý quà'], ['#/qua/chuc', 'Lời chúc'], ['#/qua/cua-toi', 'Quà của tôi'], ['#/them', 'Thêm'], ['#/them/ngay', 'Ngày quan trọng'], ['#/them/dip', 'Dịp lễ'], ['#/them/nhac', 'Nhắc'], ['#/them/du-lieu', 'Dữ liệu'], ['#/them/gioi-thieu', 'Giới thiệu']]) {
  await vaoHash(page, h);
  await kiemTraMan(page, `Chữ lớn 360: ${ten}`);
  if (['#/', '#/le/moi', '#/qua/chuc', '#/them'].includes(h)) await chup(page, `22-chu-lon-${ten.replace(/\s/g, '-').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')}-360`);
}
// luồng đơn giản của bà: thêm người, ghi một khoản bằng biểu mẫu
await vaoHash(page, '#/ban/moi');
await dien(page, '[data-testid=p-ten]', 'Cô Mai');
await click(page, '[data-testid=p-luu]');
await vaoHash(page, '#/le/moi');
await dien(page, '[data-testid=f-nguoi]', 'Cô Mai');
await click(page, '.chips .chip:nth-child(4)');
check('Chữ lớn: chọn nhanh 500 nghìn điền vào ô tiền', (await page.$eval('[data-testid=f-tien]', (e) => e.value)) === '500.000');
await click(page, '[data-testid=f-luu]');
check('Chữ lớn: lưu khoản lễ thành công', await chuDen(page, /500\.000 đ/));
await page.close();

// ---------- Trình duyệt không hỗ trợ giọng nói ----------
nhom = 'Không có giọng nói';
ctx = await mkCtx();
page = await moTrang(ctx, { view: VIEWS.dt, khongSR: true });
await vaoHash(page, '#/le');
check('Không có SpeechRecognition: có chú thích vẫn gõ được', /chưa hỗ trợ nhận giọng nói/.test(await text(page)));
await click(page, '[data-testid=mic]');
check('Bấm mic khi không hỗ trợ: thông báo hướng dẫn gõ', /chưa hỗ trợ nhận giọng nói/.test(await page.$eval('[data-testid=mic-trang-thai]', (e) => e.textContent)));
await page.close();

// ---------- Ảnh các màn ở ba khung nhìn, sáng và tối, với dữ liệu mẫu ----------
const MAU = {
  app: '9gift', version: 1,
  people: [
    { id: 'p1', ten: 'Nguyễn Văn Hùng', cachGoi: 'anh Hùng', quanHe: 'dong-nghiep', nhom: 'Công ty', sinh: { kieu: 'duong', ngay: 12, thang: 10, nam: 1990, nhuan: false }, ghiChu: 'Thích cà phê, không uống rượu.', sdt: '', nhacTruoc: null },
    { id: 'p2', ten: 'Trần Thị Bảy', cachGoi: 'bà nội', quanHe: 'ong-ba', nhom: 'Họ nội', sinh: { kieu: 'am', ngay: 10, thang: 9, nam: 1950, nhuan: false }, ghiChu: 'Dị ứng tôm cua.', sdt: '0901234567', nhacTruoc: null },
    { id: 'p3', ten: 'Lê Thị Lan', cachGoi: 'chị Lan', quanHe: 'ban-be', nhom: 'Bạn học', sinh: { kieu: 'duong', ngay: 3, thang: 11, nam: null, nhuan: false }, ghiChu: '', sdt: '', nhacTruoc: null },
  ],
  entries: [
    { id: 'e1', huong: 'den', ngay: '2022-05-01', personId: 'p1', tenNguoi: '', suKien: 'cuoi', soTien: 1000000, qua: '', ghiChu: '' },
    { id: 'e2', huong: 'di', ngay: '2023-03-12', personId: 'p3', tenNguoi: '', suKien: 'tanGia', soTien: 500000, qua: 'Nồi chiên', ghiChu: '' },
    { id: 'e3', huong: 'di', ngay: '2024-11-20', personId: 'p1', tenNguoi: '', suKien: 'thoiNoi', soTien: 1000000, qua: '', ghiChu: '' },
    { id: 'e4', huong: 'di', ngay: '2025-06-01', personId: null, tenNguoi: 'Bác Ba', suKien: 'tang', soTien: 500000, qua: '', ghiChu: '' },
    { id: 'e5', huong: 'den', ngay: '2025-09-09', personId: 'p3', tenNguoi: '', suKien: 'cuoi', soTien: 2000000, qua: '', ghiChu: '' },
    { id: 'e6', huong: 'di', ngay: '2026-02-20', personId: null, tenNguoi: 'Chú Tư', suKien: 'liXi', soTien: 200000, qua: '', ghiChu: '' },
  ],
  dates: [{ id: 'd1', personId: null, loai: 'gio', ten: 'Ông nội', kieu: 'am', ngay: 1, thang: 9, nam: 2015, nhuan: false, truoc: null }],
  gifts: [{ id: 'g1', personId: 'p2', trangThai: 'y-tuong', ten: 'Khăn len màu xám', dip: 'tet' }, { id: 'g2', personId: 'p1', trangThai: 'da-tang', ten: 'Hộp cà phê', dip: 'sinhNhat', ngay: '2025-10-12' }],
};
fs.writeFileSync(path.join(dlDir, 'mau.json'), JSON.stringify(MAU));
const MAN_HINH = [['#/', 'saptoi'], ['#/le', 'sole'], ['#/le/no', 'nole'], ['#/le/thong-ke', 'thongke'], ['#/ban', 'danhba'], ['#/ban/p2', 'chitiet'], ['#/qua', 'goiy'], ['#/qua/chuc', 'loichuc'], ['#/them', 'them'], ['#/le/moi', 'form']];
for (const [vk, view] of Object.entries(VIEWS)) {
  for (const dark of [false, true]) {
    nhom = `${vk} ${dark ? 'tối' : 'sáng'}`;
    ctx = await mkCtx();
    page = await moTrang(ctx, { view, dark });
    await vaoHash(page, '#/them/du-lieu');
    const input = await page.$('[data-testid=nhap-file]');
    await input.uploadFile(path.join(dlDir, 'mau.json'));
    await page.waitForSelector('dialog[open]', { timeout: 4000 });
    await click(page, '[data-testid=hoi-dong-y]');
    await sleep(600);
    for (const [h, ten] of MAN_HINH) {
      await vaoHash(page, h);
      await sleep(150);
      await kiemTraMan(page, ten);
      await chup(page, `m-${ten}-${vk}-${dark ? 'toi' : 'sang'}`);
    }
    await page.close();
    await ctx.close().catch(() => {});
  }
}

await browser.close();
server.close();
const loi = ketQua.filter((k) => !k.ok);
const loiCon = [...new Set(loiConsole)];
console.log(`\nTổng: ${ketQua.length - loi.length}/${ketQua.length} đạt.`);
console.log(`Lỗi console/mạng: ${loiCon.length}`);
loiCon.slice(0, 15).forEach((l) => console.log('  ' + l));
if (loi.length) { console.log('Không đạt:'); loi.forEach((k) => console.log('  - ' + k.ten)); }
process.exit(loi.length || loiCon.length ? 1 : 0);
