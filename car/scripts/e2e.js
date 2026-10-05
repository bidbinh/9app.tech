// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): 3 cỡ màn hình x sáng/tối, ngoại tuyến, và 3 kịch bản người dùng.
// Chạy: node scripts/e2e.js . Ảnh lưu ở shots/. Cổng ngẫu nhiên >= 23000.
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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
let port = 0;
for (let i = 0; i < 60 && !port; i++) {
  const cand = 28000 + Math.floor(Math.random() * 6000);
  await new Promise((r) => { server.once('error', () => r()); server.listen(cand, '127.0.0.1', () => { port = cand; r(); }); });
}
if (!port) throw new Error('không mở được cổng');
const ORIGIN = `http://127.0.0.1:${port}`;
console.log('máy chủ thử:', ORIGIN);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9car-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 180000, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`] });

const ketQua = []; const loiConsole = [];
let nhom = '';
let trangHienTai = null; let demLoi = 0; const chupLoi = [];
function check(ten, ok, chiTiet = '') {
  if (!ok && trangHienTai && !trangHienTai.isClosed()) { const f = path.join(SHOTS, `loi-${++demLoi}.png`); chupLoi.push(trangHienTai.screenshot({ path: f, fullPage: true }).catch(() => {})); }
  ketQua.push({ ten: `[${nhom}] ${ten}`, ok: !!ok });
  console.log(`${ok ? 'ĐẠT' : 'LỖI'}  [${nhom}] ${ten}${ok ? '' : '  -> ' + chiTiet}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Giả lập SpeechRecognition: đọc window.__NOI (câu) hoặc window.__NOI_LOI (mã lỗi); window.__TRE là độ trễ (ms)
const STUB = `
(() => {
  if (window.__KHONG_SR) { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; return; }
  class FakeRec {
    constructor() { this.lang = ''; }
    start() {
      window.__recLang = this.lang;
      setTimeout(() => {
        if (window.__NOI_LOI) { this.onerror && this.onerror({ error: window.__NOI_LOI }); this.onend && this.onend(); return; }
        const kq = [{ transcript: window.__NOI || '', confidence: 0.9 }]; kq.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [kq] });
        setTimeout(() => { this.onend && this.onend(); }, 30);
      }, window.__TRE || 300);
    }
    stop() { setTimeout(() => { this.onend && this.onend(); }, 5); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
})();`;

async function moTrang(ctx, { view, dark = false, khongSR = false, url = '/' }) {
  const page = await ctx.newPage(); trangHienTai = page;
  await page.setViewport({ ...view, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(`window.__KHONG_SR = ${khongSR ? 'true' : 'false'};`);
  await page.evaluateOnNewDocument(STUB);
  await page.evaluateOnNewDocument(`(() => { window.__DAYS = 0; const RD = Date; class D2 extends RD { constructor(...a) { if (a.length === 0) super(RD.now() + window.__DAYS * 86400000); else super(...a); } static now() { return RD.now() + window.__DAYS * 86400000; } } window.Date = D2; })();`);
  await page.evaluateOnNewDocument(`(() => { window.__BLOBS = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__BLOBS.push(b); return o(b); };
    document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[download]'); if (a) window.__DL_TEN = a.getAttribute('download'); }, true); })();`);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) loiConsole.push(`${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => loiConsole.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { if (!r.url().includes('offline-ok')) loiConsole.push('requestfailed: ' + r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) loiConsole.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(ORIGIN + url, { waitUntil: 'load' });
  await sleep(250);
  return page;
}

const batNgang = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function chup(page, ten) { await page.bringToFront(); await page.screenshot({ path: path.join(SHOTS, `${ten}.png`), fullPage: true }); }
async function quetChuRac(page, where) {
  const t = await page.evaluate(() => document.body.innerText);
  const m = /(null|undefined|NaN|Infinity|\[object)/.exec(t);
  if (m) loiConsole.push(`chữ rác "${m[0]}" tại ${where} ${page.url()}`);
}
async function di(page, hash) { await quetChuRac(page, 'trước ' + hash); await page.evaluate((h) => { location.hash = h; }, hash); await sleep(180); }
async function clickText(page, sel, t, { chinhXac = false } = {}) {
  const ok = await page.evaluate((sel, t, cx) => {
    const ok = (x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = [...document.querySelectorAll(sel)].find((x) => ok(x) && (cx ? x.textContent.trim() === t : x.textContent.trim().includes(t)));
    if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, sel, t, chinhXac);
  if (!ok) throw new Error(`không thấy ${sel} "${t}" (${await page.evaluate(() => location.hash)})`);
  await sleep(150);
}
// Gõ thật vào ô theo nhãn (xóa nội dung cũ trước)
async function go(page, nhan, gt) {
  const id = await page.evaluate((nhan) => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(nhan) && x.getBoundingClientRect().width > 0);
    return l ? l.htmlFor : null;
  }, nhan);
  if (!id) throw new Error(`không thấy ô "${nhan}" (${await page.evaluate(() => location.hash)})`);
  const el = await page.$('#' + id);
  await el.evaluate((e) => { e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); });
  await page.keyboard.press('Backspace');
  await el.type(gt, { delay: 8 });
  await sleep(30);
}
async function datNgay(page, nhan, gt) { // ô ngày: đặt giá trị như bộ chọn ngày của trình duyệt
  const ok = await page.evaluate((nhan, gt) => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(nhan) && x.getBoundingClientRect().width > 0);
    const el = l && document.getElementById(l.htmlFor); if (!el) return false;
    el.value = gt; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, nhan, gt);
  if (!ok) throw new Error(`không thấy ô ngày "${nhan}"`);
}
async function chon(page, nhan, nhanOption) {
  const ok = await page.evaluate((nhan, no) => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(nhan) && x.getBoundingClientRect().width > 0);
    const el = l && document.getElementById(l.htmlFor); if (!el) return false;
    const o = [...el.options].find((x) => x.textContent.trim().startsWith(no)); if (!o) return false;
    el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, nhan, nhanOption);
  if (!ok) throw new Error(`không chọn được "${nhan}" = "${nhanOption}"`);
  await sleep(60);
}
const van = (page) => page.evaluate(() => document.getElementById('main').innerText);
const hash = (page) => page.evaluate(() => location.hash);
const homNayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const congNgay = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n, 12); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const HOM = homNayIso();

// Kiểm tra chung cho một màn: không tràn ngang, chữ >= 14px, vùng chạm >= 44px, có tiêu đề
async function kiemMan(page, ten) {
  const ng = await batNgang(page);
  check(`${ten}: không tràn ngang`, ng <= 0, String(ng));
  const loi = await page.evaluate(() => {
    const out = [];
    const hien = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    for (const e of document.querySelectorAll('body *')) {
      if (!hien(e) || e.closest('svg') || e.closest('.visually,.skip')) continue;
      const coChu = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (coChu) { const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13.99) out.push(`chữ ${fs.toFixed(1)}px: "${e.textContent.trim().slice(0, 30)}"`); }
    }
    for (const e of document.querySelectorAll('button, a.btn, a.tab, a.chip, a.item, .chip, select, input:not([type=checkbox]):not([type=hidden]):not([type=file]), summary, a.back, a.pill9, a.brand')) {
      if (!hien(e)) continue; const r = e.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.push(`vùng chạm ${Math.round(r.width)}x${Math.round(r.height)}: ${(e.getAttribute('aria-label') || e.textContent || e.id).trim().slice(0, 30)}`);
    }
    for (const c of document.querySelectorAll('input[type=checkbox]')) { if (!hien(c)) continue; const l = c.closest('label'); const r = (l || c).getBoundingClientRect(); if (r.height < 43.5) out.push(`ô chọn cao ${Math.round(r.height)}`); }
    for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')) { if (!hien(e) || e.type === 'checkbox') continue; if (!e.labels?.length && !e.getAttribute('aria-label')) out.push(`ô thiếu nhãn: ${e.id || e.name}`); }
    for (const b of document.querySelectorAll('button, a')) { if (!hien(b)) continue; if (!b.textContent.trim() && !b.getAttribute('aria-label')) out.push('nút/liên kết không có tên'); }
    return [...new Set(out)];
  });
  check(`${ten}: chữ >= 14px, vùng chạm >= 44px, có nhãn`, loi.length === 0, loi.slice(0, 6).join(' | '));
}

// ---------- Dữ liệu mẫu cho phần quét giao diện ----------
async function gieoDuLieu(page) {
  await page.evaluate(async (HOM) => {
    const d = await import('/js/lib/data.js');
    const cong = (iso, n) => { const [y, m, dd] = iso.split('-').map(Number); const t = new Date(y, m - 1, dd + n, 12); return t.toISOString().slice(0, 10); };
    await d.xoaSach();
    await d.luuXe({ id: 'x1', loai: 'oto', bienSo: '30A-123.45', hang: 'Toyota', dong: 'Vios 2019', namSX: 2019, nhienLieu: 'xang', ngayDangKy: '2019-06-10', km: 52300, kmNgay: cong(HOM, -3), giaMua: 480000000, hotlineBH: '1900 9999' });
    await d.luuXe({ id: 'x2', loai: 'xemay', bienSo: '59X1-678.90', hang: 'Honda', dong: 'Vision', namSX: 2021, nhienLieu: 'xang', km: 18500, kmNgay: cong(HOM, -3), khuVuc: 'hn-hcm' });
    await d.luuXe({ id: 'x3', loai: 'oto', bienSo: '51L-111.22', hang: 'VinFast', dong: 'VF 6', namSX: 2025, nhienLieu: 'dien', km: 6400, kmNgay: cong(HOM, -2) });
    const nk = [];
    for (let i = 0; i < 14; i++) {
      const ngay = cong(HOM, -i * 13);
      nk.push({ xeId: 'x1', loai: 'xang', ngay, tien: 700000 + (i % 3) * 20000, luong: 30 + (i % 3), km: 52300 - i * 420, day: true });
      if (i % 3 === 0) nk.push({ xeId: 'x1', loai: 'bao-duong', ngay, tien: 1200000, hangMuc: 'Thay dầu', km: 52300 - i * 420 });
      if (i % 4 === 0) nk.push({ xeId: 'x1', loai: 'gui-xe', ngay, tien: 60000 });
      nk.push({ xeId: 'x2', loai: 'xang', ngay, tien: 55000, luong: 1.3, km: 18500 - i * 90, day: true });
      nk.push({ xeId: 'x3', loai: 'sac', ngay, tien: 180000 + i * 3000, luong: 45, km: 6400 - i * 150, noi: 'Trạm sạc Vincom', phut: 40 });
    }
    for (const e of nk) await d.luuNhatKy(e, HOM);
    const hen = [
      { xeId: 'x1', kind: 'dang-kiem', ten: 'Đăng kiểm', han: cong(HOM, 4) },
      { xeId: 'x1', kind: 'tnds', ten: 'Bảo hiểm bắt buộc (TNDS)', han: cong(HOM, 21) },
      { xeId: 'x1', kind: 'phi-duong', ten: 'Phí sử dụng đường bộ', han: cong(HOM, 200) },
      { xeId: 'x1', kind: 'dau', ten: 'Thay dầu động cơ và lọc dầu', chuKyThang: 6, chuKyKm: 5000, ngayLanCuoi: cong(HOM, -80), kmLanCuoi: 48000 },
      { xeId: 'x2', kind: 'tnds', ten: 'Bảo hiểm bắt buộc (TNDS)', han: cong(HOM, 120) },
      { xeId: 'x2', kind: 'dau', ten: 'Thay nhớt máy', chuKyThang: 3, chuKyKm: 2000, ngayLanCuoi: cong(HOM, -30), kmLanCuoi: 17000 },
      { xeId: 'x3', kind: 'bao-duong', ten: 'Đảo lốp', chuKyThang: 6, chuKyKm: 10000, ngayLanCuoi: cong(HOM, -20), kmLanCuoi: 5000 },
      { xeId: '', kind: 'gplx', ten: 'Giấy phép lái xe hạng B', han: cong(HOM, 700) },
      { xeId: 'x1', kind: 'vat-chat', ten: 'Bảo hiểm vật chất (thân vỏ)', han: '' },
    ];
    for (const h of hen) await d.luuHen(h);
    await d.datMeta('giaNangLuong', { dien: 3000, xang: 24000, l100: 7, ngay: HOM });
    const c = await import('/js/ui/common.js'); c.app.render();
  }, HOM);
  await sleep(150);
}

const ROUTES = [
  ['hom-nay', '#/'], ['xe', '#/xe'], ['xe-chi-tiet', '#/xe/x1'], ['xe-may', '#/xe/x2'], ['xe-sua', '#/xe/x1/sua'], ['thiet-lap', '#/xe/x2/thiet-lap'],
  ['hen', '#/hen/moi?xe=x1'], ['nhat-ky', '#/nhat-ky'], ['nhat-ky-moi', '#/nhat-ky/moi?xe=x1'], ['chi-phi', '#/chi-phi'], ['chi-phi-xe', '#/chi-phi?xe=x1'],
  ['them', '#/them'], ['sac', '#/sac?xe=x3'], ['phat-nguoi', '#/phat-nguoi'], ['checklist', '#/checklist'], ['tai-nan', '#/tai-nan?xe=x1'],
  ['bao-hiem', '#/bao-hiem'], ['ban-xe', '#/ban-xe'], ['du-lieu', '#/du-lieu'], ['nguon', '#/nguon'],
];

async function quet(tenView, view, dark) {
  const ctx = await browser.createBrowserContext();
  const tag = `${tenView}${dark ? '-toi' : ''}`; nhom = tag;
  const p = await moTrang(ctx, { view, dark });
  check('tiêu đề trang', (await p.title()).includes('9car'), await p.title());
  check('CSP có trong trang', await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')));
  check('màn trống (chưa có xe) hiện lời mời thêm xe', (await van(p)).includes('Thêm chiếc xe đầu tiên'));
  await kiemMan(p, 'trống'); await chup(p, `${tag}-00-trong`);
  await gieoDuLieu(p);
  for (const [ten, h] of ROUTES) {
    await di(p, h);
    const n = await p.$$eval('#main > *', (a) => a.length);
    check(`${ten}: có nội dung`, n > 0);
    await kiemMan(p, ten);
    if (['hom-nay', 'xe-chi-tiet', 'chi-phi-xe', 'nhat-ky', 'sac', 'them', 'thiet-lap', 'xe-may'].includes(ten)) await chup(p, `${tag}-${ten}`);
  }
  // thanh dưới: đúng 5 mục
  check('thanh dưới có đúng 5 mục', (await p.$$eval('#tabs .tab', (a) => a.length)) === 5);
  await ctx.close();
}

// ---------- Kịch bản người dùng ----------
async function taiBang(page, fn) { // bắt nội dung tệp tải về qua Blob (trong trình duyệt)
  await page.evaluate(() => { window.__BLOBS = []; });
  await fn();
  await sleep(300);
  const r = await page.evaluate(async () => { const b = window.__BLOBS.at(-1); return b ? { ten: window.__DL_TEN, nd: await b.text() } : null; });
  if (!r) return null;
  const f = path.join(os.tmpdir(), '9car-' + (r.ten || 'tep'));
  fs.writeFileSync(f, r.nd); return f;
}
async function themXeUi(page, { loai, bien, hang, dong, nam, nl, km, dk, khuVuc, ten }) {
  await di(page, '#/xe/moi');
  if (loai) await chon(page, 'Loại xe', loai);
  await go(page, 'Biển số', bien);
  if (ten) await go(page, 'Tên gọi', ten);
  await go(page, 'Hãng', hang); await go(page, 'Dòng xe', dong); await go(page, 'Năm sản xuất', String(nam));
  if (nl) await chon(page, 'Nhiên liệu', nl);
  if (khuVuc) await chon(page, 'Khu vực', khuVuc);
  if (dk) await datNgay(page, 'Ngày đăng ký', dk);
  await go(page, 'Số km hiện tại', String(km));
  await clickText(page, 'button', 'Lưu xe');
  await sleep(250);
}

async function kichBanXeMay() {
  nhom = 'người đi xe máy 1 xe (390x844)';
  const ctx = await browser.createBrowserContext();
  const p = await moTrang(ctx, { view: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  await chup(p, 'xemay-01-lan-dau');
  await p.evaluate(() => { location.hash = '#/xe/moi'; }); await sleep(200);
  await themXeUi(p, { loai: 'Xe máy', bien: '59X1-678.90', hang: 'Honda', dong: 'Vision', nam: 2021, km: 18500, khuVuc: 'Hà Nội' });
  check('thêm xe máy chuyển sang màn thiết lập nhắc', (await hash(p)).includes('thiet-lap'), await hash(p));
  const txt = await van(p);
  check('thiết lập nhắc xe máy không có phí đường bộ, có kiểm định khí thải', !txt.includes('Phí sử dụng đường bộ') && txt.includes('Kiểm định khí thải'));
  await datNgay(p, 'Hạn Bảo hiểm bắt buộc', congNgay(HOM, 25)).catch(async () => {
    await p.evaluate((v) => { const e = document.getElementById('tl-d1'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, congNgay(HOM, 25));
  });
  await chup(p, 'xemay-02-thiet-lap');
  await clickText(p, 'button', 'Tạo các mục nhắc đã chọn');
  check('về trang xe sau khi tạo nhắc', (await hash(p)).startsWith('#/xe/') && !(await hash(p)).includes('thiet-lap'));
  let t = await van(p);
  check('trang xe có nhắc TNDS vàng (còn 25 ngày)', t.includes('Bảo hiểm bắt buộc') && t.includes('Còn 25 ngày'), t.slice(0, 300));
  check('xe máy có lưu ý kiểm định khí thải và mốc 01/07/2027', t.includes('01/07/2027'), '');
  await chup(p, 'xemay-03-chi-tiet');

  // Ghi nhanh bằng câu gõ tại Hôm nay
  await di(p, '#/');
  await p.type('#cau-nhanh', 'đổ xăng 60k 1,5 lít 18600', { delay: 5 });
  await clickText(p, 'button', 'Phân tích câu');
  t = await van(p);
  check('phân tích câu gõ hiện biểu mẫu soát', t.includes('Kết quả để soát'), t.slice(0, 200));
  const gt = await p.evaluate(() => ({ tien: document.getElementById('tien-nk')?.value, luong: document.getElementById('luong-nk')?.value, km: document.getElementById('km-nk')?.value }));
  check('tách đúng tiền 60.000, 1,5 lít, 18.600 km', gt.tien === '60.000' && gt.luong === '1,5' && gt.km === '18.600', JSON.stringify(gt));
  await chup(p, 'xemay-04-phan-tich');
  await clickText(p, 'button', 'Lưu', { chinhXac: true });
  check('lưu xong có thông báo đã lưu', (await p.$eval('#toast-vung', (e) => e.textContent)).includes('Đã lưu khoản chi'));
  // lần đổ thứ hai (đổ đầy) sau 200 km, để tính tiêu hao
  await p.type('#cau-nhanh', 'đổ xăng 75k 2 lít 18800', { delay: 5 });
  await clickText(p, 'button', 'Phân tích câu'); await clickText(p, 'button', 'Lưu', { chinhXac: true });
  await di(p, '#/nhat-ky');
  t = await van(p);
  check('nhật ký có 2 khoản xăng', (t.match(/Đổ nhiên liệu/g) || []).length === 2, t.slice(0, 300));
  // thêm một lần đổ nữa để có 2 đoạn tiêu hao
  await di(p, '#/nhat-ky/moi');
  await go(p, 'Số tiền', '72.000'); await go(p, 'Số lít', '1,9'); await go(p, 'Số km trên đồng hồ', '19000');
  await clickText(p, 'button', 'Lưu', { chinhXac: true }); await sleep(250);
  t = await van(p);
  check('nhật ký hiện tiêu hao trung bình', /Tiêu hao trung bình \d+,\d lít\/100 km/.test(t), t.slice(0, 200));
  // 2 lít/200km... đoạn 1: 18600->18800 (lít từ lần 2: 2) = 1,0 ; đoạn 2: 18800->19000 (1,9) = 0,95
  await chup(p, 'xemay-05-nhat-ky');
  // thay nhớt qua câu nói trong Hôm nay với km
  await di(p, '#/');
  await p.type('#cau-nhanh', 'thay nhớt 90k 19000 km', { delay: 5 });
  await clickText(p, 'button', 'Phân tích câu');
  const loai = await p.$eval('#loai-nk', (e) => e.value);
  check('"thay nhớt" nhận ra bảo dưỡng', loai === 'bao-duong', loai);
  await clickText(p, 'button', 'Lưu', { chinhXac: true });
  // gia hạn TNDS
  await di(p, '#/xe'); await clickText(p, 'a.item', 'Honda'); await sleep(100);
  await clickText(p, 'a.item', 'Bảo hiểm bắt buộc');
  await clickText(p, 'button', 'Đã gia hạn');
  const hanMoi = await p.$eval('#gh-han', (e) => e.value);
  check('gia hạn gợi ý hạn mới + 12 tháng', hanMoi > congNgay(HOM, 25), hanMoi);
  await clickText(p, '#gia-han button', 'Xác nhận');
  t = await van(p);
  check('sau gia hạn TNDS chuyển xanh (còn xa)', t.includes('Bảo hiểm bắt buộc') && /Còn \d{3} ngày/.test(t), t.slice(0, 400));
  // xe máy: câu giải thích đăng kiểm không gây hiểu nhầm
  const idXm = await p.evaluate(async () => (await import('/js/lib/data.js')).kho.xe[0].id);
  await di(p, `#/hen/moi?xe=${idXm}&kind=dang-kiem`);
  t = await van(p);
  check('xe máy: nhắc kiểm định khí thải nói rõ nghĩa vụ chưa bắt đầu và ngày bắt đầu', t.includes('chưa phải kiểm định cho đến khi') && t.includes('01/07/2027') && t.includes('Hạn gợi ý, hãy đối chiếu') && !t.includes('Chu kỳ hiện hành cho xe này'), t.slice(0, 500));
  // bảo dưỡng: đã làm xong thì hạn tính lại, có ghi chi phí
  await di(p, '#/xe'); await clickText(p, 'a.item', 'Honda'); await clickText(p, 'a.item', 'Thay nhớt máy');
  await clickText(p, 'button', 'Đã làm xong');
  await go(p, 'Số km lúc làm', '19000'); await go(p, 'Chi phí', '90.000');
  await chup(p, 'xemay-08-da-lam-xong');
  await clickText(p, '#gia-han button', 'Xác nhận');
  t = await van(p);
  check('sau khi thay nhớt, hạn tính lại: còn 2.000 km', t.includes('Thay nhớt máy') && t.includes('Còn 2.000 km'), t.slice(0, 600));
  // kiểm tra lỗi nhập
  await di(p, '#/nhat-ky/moi'); await clickText(p, 'button', 'Lưu', { chinhXac: true });
  check('ghi khoản trống báo lỗi dễ hiểu', (await van(p)).includes('Hãy nhập số tiền'));
  await di(p, '#/xe/moi'); await clickText(p, 'button', 'Lưu xe');
  check('thêm xe trống báo lỗi dễ hiểu', (await van(p)).includes('Hãy nhập biển số hoặc hãng xe'));
  await di(p, '#/xe'); await clickText(p, 'a.item', 'Honda');
  // tải .ics
  const f = await taiBang(p, () => clickText(p, 'button', 'Tải lịch'));
  const ics = f ? fs.readFileSync(f, 'utf8') : '';
  check('tải được tệp .ics có VALARM 30/7/1', ics.includes('BEGIN:VCALENDAR') && ics.includes('TRIGGER:-P30D') && ics.includes('TRIGGER:-P7D') && ics.includes('TRIGGER:-P1D'), ics.slice(0, 80));
  // Hôm nay, chi phí
  await di(p, '#/'); await chup(p, 'xemay-06-hom-nay');
  await di(p, '#/chi-phi'); t = await van(p);
  check('chi phí hiện tổng và chi phí mỗi km', t.includes('Tổng 12 tháng qua') && /\d+ đ/.test(t), t.slice(0, 200));
  await chup(p, 'xemay-07-chi-phi');
  // hoàn tác khi xóa xe
  await di(p, '#/xe'); await clickText(p, 'a.item', 'Honda');
  await clickText(p, 'button', 'Xóa xe này');
  await p.waitForSelector('dialog[open]'); await clickText(p, 'dialog button', 'Xóa xe');
  await sleep(250);
  check('xóa xe về danh sách trống', (await van(p)).includes('Chưa có xe nào'));
  await clickText(p, '.toast button', 'Hoàn tác'); await sleep(300);
  await di(p, '#/xe');
  check('hoàn tác khôi phục xe cùng nhật ký', (await van(p)).includes('Honda') && (await p.evaluate(async () => (await import('/js/lib/data.js')).kho.nhatKy.length)) >= 4);
  await ctx.close();
}

async function kichBanGiaDinh() {
  nhom = 'gia đình 2 ô tô xăng (390x844)';
  const ctx = await browser.createBrowserContext();
  const p = await moTrang(ctx, { view: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  await themXeUi(p, { loai: 'Ô tô chở người đến', bien: '30A-123.45', hang: 'Toyota', dong: 'Vios', nam: 2018, km: 62000, dk: '2018-05-10', ten: 'Xe của bố' });
  t0: {
    const v = await van(p);
    check('xe 2018: đề xuất hạn đăng kiểm từ ngày đăng ký', v.includes('Gợi ý') || v.includes('Nhập hạn ghi trên tem'), v.slice(0, 200));
  }
  // đăng kiểm hạn gần => đỏ; chọn hạn qua 6 ngày
  await p.evaluate((v) => { const e = document.getElementById('tl-d0'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, congNgay(HOM, 6));
  await p.evaluate((v) => { const e = document.getElementById('tl-d1'); e.value = v; }, congNgay(HOM, 40));
  await clickText(p, 'button', 'Tạo các mục nhắc đã chọn');
  await themXeUi(p, { loai: 'Ô tô chở người đến', bien: '51G-999.88', hang: 'Mazda', dong: 'CX-5', nam: 2022, km: 30500, ten: 'Xe của mẹ' });
  await clickText(p, 'a.btn', 'Để sau');
  await di(p, '#/');
  let t = await van(p);
  check('Hôm nay đỏ: đăng kiểm còn 6 ngày', t.includes('Cần làm ngay') && t.includes('Đăng kiểm') && t.includes('Còn 6 ngày'), t.slice(0, 500));
  check('Hôm nay có chọn xe khi ghi nhanh (2 xe)', (await p.$$eval('#main select', (a) => a.length)) >= 1);
  const badge = await p.$eval('.tab .dem', (e) => e.textContent).catch(() => '');
  check('tab Hôm nay có huy hiệu số mục đỏ', badge === '1', badge);
  await chup(p, 'giadinh-01-hom-nay');
  // ghi nhanh bằng giọng nói cho xe thứ hai
  await p.select('#main select', await p.evaluate(() => [...document.querySelectorAll('#main select option')].find((o) => o.textContent.includes('51G'))?.value));
  await p.evaluate(() => { window.__NOI = 'đổ xăng ba trăm nghìn mười hai lít'; window.__NOI_LOI = null; window.__TRE = 1400; });
  await p.click('.mic');
  await sleep(500);
  const trangThai1 = await p.$eval('.mic', (e) => e.dataset.trangThai);
  const vs1 = await p.$eval('.vstatus', (e) => e.textContent);
  check('nút mic: đang nghe', trangThai1 === 'nghe' && vs1.includes('Đang nghe'), `${trangThai1} / ${vs1}`);
  await chup(p, 'giadinh-02-mic-dang-nghe');
  await sleep(1100);
  const mid = await p.$eval('.mic', (e) => e.dataset.trangThai);
  await sleep(600);
  t = await van(p);
  check('giọng nói cho ra biểu mẫu soát (không có nguyên câu)', t.includes('Kết quả để soát') && !t.includes('ba trăm nghìn'), t.slice(0, 200));
  const gt = await p.evaluate(() => ({ tien: document.getElementById('tien-nk')?.value, luong: document.getElementById('luong-nk')?.value }));
  check('giọng nói tách 300.000 và 12 lít', gt.tien === '300.000' && gt.luong === '12', JSON.stringify(gt));
  check('thấy trạng thái đang xử lý hoặc đã xong', ['xuly', 'nghi'].includes(mid), mid);
  await chup(p, 'giadinh-03-mic-ket-qua');
  await go(p, 'Số km trên đồng hồ', '30900');
  await clickText(p, 'button', 'Lưu', { chinhXac: true });
  // lỗi mic: không có quyền
  await p.evaluate(() => { window.__NOI_LOI = 'not-allowed'; });
  await p.click('.mic'); await sleep(2000);
  check('mic bị từ chối hiện hướng dẫn gõ câu', (await p.$eval('.vstatus', (e) => e.textContent)).includes('quyền'));
  // lọc nhật ký theo xe
  await di(p, '#/nhat-ky');
  t = await van(p);
  check('nhật ký 2 xe có bộ lọc xe và hiện khoản xăng', t.includes('Đổ nhiên liệu') && (await p.$$eval('#main select', (a) => a.length)) === 1);
  const ids = await p.evaluate(() => [...document.querySelectorAll('#main select option')].map((o) => [o.value, o.textContent]));
  const xe1 = ids.find(([, tx]) => tx.includes('30A'))[0];
  await p.select('#main select', xe1); await sleep(250);
  check('lọc theo xe thứ nhất không còn khoản của xe thứ hai', !(await van(p)).includes('Đổ nhiên liệu'));
  // gia hạn đăng kiểm theo quy tắc
  await di(p, '#/'); await clickText(p, 'a.item', 'Đăng kiểm');
  await clickText(p, 'button', 'Đã gia hạn');
  const g = await p.evaluate(() => ({ han: document.getElementById('gh-han').value, ghi: document.querySelector('#gia-han .hint')?.textContent }));
  check('gia hạn đăng kiểm xe 2018 (8 tuổi): chu kỳ 12 tháng', /12 tháng/.test(g.ghi || '') && g.han === (() => { const [y, m, d] = HOM.split('-').map(Number); const t = new Date(y + 1, m - 1, d - 1, 12); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })(), JSON.stringify(g));
  check('gia hạn đăng kiểm ghi "Hạn gợi ý, hãy đối chiếu với tem/giấy kiểm định"', (g.ghi || '').includes('Hạn gợi ý, hãy đối chiếu với tem/giấy kiểm định'), g.ghi);
  await chup(p, 'giadinh-04-gia-han');
  await clickText(p, '#gia-han button', 'Xác nhận');
  await di(p, '#/');
  t = await van(p);
  check('sau gia hạn không còn mục đỏ đăng kiểm', !t.includes('Còn 6 ngày'));
  // GPLX
  await di(p, '#/hen/moi?kind=gplx');
  await go(p, 'Tên', 'Giấy phép lái xe hạng B của bố');
  await datNgay(p, 'Hạn (ngày)', congNgay(HOM, 900));
  await clickText(p, 'button', 'Lưu mục nhắc'); await sleep(250);
  await di(p, '#/');
  { await clickText(p, 'summary', 'Xem thêm'); const tv = await van(p); check('GPLX không gắn xe xuất hiện ở Hôm nay (mục xem thêm)', tv.includes('Giấy phép lái xe hạng B'), tv.slice(0, 900)); }
  // gia hạn GPLX: mặc định theo hạng (B 10 năm, C 5 năm), không phải 12 tháng
  await di(p, '#/'); await clickText(p, 'summary', 'Xem thêm').catch(() => {}); await clickText(p, 'a.item', 'Giấy phép lái xe hạng B');
  await clickText(p, 'button', 'Đã gia hạn');
  const namSau = (n) => `${Number(HOM.slice(0, 4)) + n}${HOM.slice(4)}`;
  const gB = await p.$eval('#gh-han', (e) => e.value);
  await p.select('#gh-hang', 'C'); await sleep(100);
  const gC = await p.$eval('#gh-han', (e) => e.value);
  check('gia hạn GPLX: hạng B +10 năm, hạng C +5 năm (không mặc định 12 tháng)', gB === namSau(10) && gC === namSau(5), `${gB} ${gC}`);
  // tiện ích
  await di(p, '#/phat-nguoi'); t = await van(p);
  const lk = await p.$$eval('#main a[target=_blank]', (a) => a.map((x) => x.href));
  check('phạt nguội: liên kết sang trang chính thức, không cào dữ liệu', lk.some((x) => x.startsWith('https://csgt.bocongan.gov.vn/')) && t.includes('9speed'), lk.join(','));
  await di(p, '#/tai-nan'); const tel = await p.$$eval('#main a[href^="tel:"]', (a) => a.map((x) => x.getAttribute('href')));
  check('tai nạn: có 113, 114, 115', ['tel:113', 'tel:114', 'tel:115'].every((x) => tel.includes(x)), tel.join(','));
  await di(p, '#/checklist'); await p.click('#main input[type=checkbox]'); await sleep(150);
  await p.reload({ waitUntil: 'load' }); await sleep(300);
  check('checklist nhớ trạng thái sau khi tải lại', await p.$eval('#main input[type=checkbox]', (e) => e.checked));
  await di(p, '#/ban-xe');
  await go(p, 'Người bán', 'Nguyễn Văn A'); await go(p, 'Người mua', 'Trần Văn B'); await go(p, 'Giá thỏa thuận', '450000000');
  await clickText(p, 'button', 'Xem bản in');
  t = await van(p);
  check('sổ giao xe dựng được bản in', t.includes('BIÊN BẢN GIAO NHẬN XE') && t.includes('450.000.000 đ'), t.slice(-300));
  await chup(p, 'giadinh-05-ban-xe');
  // nguồn quy định: phí đường bộ theo Nghị định 364/2025, ô tô trên 8 chỗ chưa xác minh
  await di(p, '#/nguon'); t = await van(p);
  check('Nguồn quy định nêu Nghị định 364/2025/NĐ-CP và ghi chưa xác minh đối tượng chịu phí', t.includes('364/2025/NĐ-CP') && t.includes('Chưa xác minh đối tượng') && !t.includes('Thông tư 70/2021/TT-BTC: nộp theo'), t.slice(0, 300));
  await di(p, '#/xe/moi'); await chon(p, 'Loại xe', 'Ô tô chở người đến');
  check('nhãn loại xe nói "đến 8 chỗ" và ghi chú cách đếm chỗ chưa xác minh', (await van(p)).includes('Ô tô chở người đến 8 chỗ') && (await van(p)).includes('Cách đếm chỗ'));
  // hạn đăng kiểm luôn kèm lưu ý đối chiếu
  await di(p, '#/'); await clickText(p, 'a.item', 'Đăng kiểm').catch(() => {});
  // tự làm mới sau nửa đêm
  await di(p, '#/');
  const ngayTruoc = await p.$eval('#main .sub', (e) => e.textContent);
  await p.evaluate(() => { window.__DAYS = 1; document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  const ngaySau = await p.$eval('#main .sub', (e) => e.textContent);
  check('qua nửa đêm, quay lại app thì ngày ở Hôm nay tự đổi', ngayTruoc !== ngaySau, `${ngayTruoc} -> ${ngaySau}`);
  await p.evaluate(() => { window.__DAYS = 0; });
  const pdf = path.join(SHOTS, 'giadinh-ban-xe.pdf');
  await p.emulateMediaType('print'); await p.pdf({ path: pdf, format: 'A4' }); await p.emulateMediaType('screen');
  check('xuất được PDF sổ giao xe', fs.existsSync(pdf) && fs.statSync(pdf).size > 3000);
  await ctx.close();
}

async function kichBanXeDien() {
  nhom = 'chủ xe điện (390x844)';
  const ctx = await browser.createBrowserContext();
  const p = await moTrang(ctx, { view: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  await themXeUi(p, { loai: 'Ô tô chở người đến', bien: '51L-111.22', hang: 'VinFast', dong: 'VF 6', nam: 2025, nl: 'Điện', km: 5000, dk: congNgay(HOM, -200) });
  await clickText(p, 'button', 'Tạo các mục nhắc đã chọn');
  let t = await van(p);
  check('xe điện: mẫu bảo dưỡng không có thay dầu động cơ', !t.includes('dầu động cơ'), t.slice(0, 300));
  check('xe điện: có mục đăng kiểm gợi ý (chu kỳ đầu 36 tháng)', t.includes('Đăng kiểm'));
  await di(p, '#/sac');
  t = await van(p);
  check('màn sạc: chưa nhập giá thì ghi rõ chưa có giá, không bịa', t.includes('Chưa nhập giá'), t.slice(0, 600));
  const lkMap = await p.$$eval('#main a[target=_blank]', (a) => a.map((x) => x.href));
  check('có liên kết Google Maps tìm trạm sạc, không có bản đồ nhúng', lkMap.some((x) => x.includes('google.com/maps/search')) && (await p.$$('iframe')).length === 0, lkMap.join(','));
  // ghi buổi sạc
  const ghi = async (tien, kwh, km, noi, ngay) => {
    await di(p, '#/nhat-ky/moi?loai=sac');
    await datNgay(p, 'Ngày', ngay); await go(p, 'Số tiền', tien); await go(p, 'Điện đã sạc', kwh); await go(p, 'Số km trên đồng hồ', km); await go(p, 'Nơi sạc', noi);
    await clickText(p, 'button', 'Lưu', { chinhXac: true }); await sleep(250);
  };
  await ghi('150.000', '40', '5000', 'Trạm sạc Vincom', congNgay(HOM, -30));
  await ghi('120.000', '31', '5200', 'Sạc tại nhà', congNgay(HOM, -15));
  await ghi('135.000', '34,5', '5400', 'Trạm sạc Vincom', congNgay(HOM, -2));
  await di(p, '#/sac');
  t = await van(p);
  check('3 buổi sạc: kWh/100km trung bình 16,4', t.includes('16,4'), t.slice(0, 500));
  await go(p, 'Giá điện', '3000'); await go(p, 'Giá xăng', '24000'); await go(p, 'Xe xăng tương đương', '7');
  t = await van(p);
  check('so sánh: điện ~491 đ/km, xăng 1.680 đ/km', t.includes('1.680 đ') && /49\d đ/.test(t), t.slice(0, 700));
  await clickText(p, 'button', 'Lưu giá');
  t = await van(p);
  check('giá có ghi ngày cập nhật', t.includes('Giá cập nhật ngày') && t.includes('rẻ hơn'), t.slice(0, 900));
  await chup(p, 'xedien-01-sac');
  // xuất / xóa / nhập
  await di(p, '#/du-lieu');
  const f = await taiBang(p, () => p.click('#xuat-json'));
  const json = f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  check('xuất JSON có xe, nhật ký, nhắc', json && json.ung === '9car' && json.xe.length === 1 && json.nhatKy.length === 3 && json.hen.length >= 3, json ? JSON.stringify(Object.keys(json)) : 'không tải được');
  await p.click('#xoa-het'); await p.waitForSelector('dialog[open]'); await clickText(p, 'dialog button', 'Xóa sạch'); await sleep(300);
  check('xóa sạch về màn mời thêm xe', (await van(p)).includes('Thêm chiếc xe đầu tiên'));
  await di(p, '#/du-lieu');
  const inp = await p.$('#nhap-tep'); await inp.uploadFile(f);
  await p.waitForSelector('dialog[open]'); await clickText(p, 'dialog button', 'Thay thế'); await sleep(400);
  await di(p, '#/xe');
  check('nhập lại khôi phục xe', (await van(p)).includes('VF 6') || (await van(p)).includes('VinFast'));
  const hong = path.join(os.tmpdir(), 'hong.json'); fs.writeFileSync(hong, '{"khong":"phai 9car"}');
  await di(p, '#/du-lieu'); await (await p.$('#nhap-tep')).uploadFile(hong); await sleep(400);
  check('nhập tệp sai định dạng báo lỗi dễ hiểu', (await van(p)).includes('không phải bản sao lưu'));
  // chữ lớn, tối
  await p.select('#chu-de', 'dark'); await p.click('#chu-lon'); await sleep(200);
  await di(p, '#/'); await kiemMan(p, 'chữ lớn + tối'); await chup(p, 'xedien-02-chu-lon-toi');
  check('chữ lớn tăng cỡ chữ gốc', await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) > 17));
  await ctx.close();
}

async function ngoaiTuyen() {
  nhom = 'ngoại tuyến';
  const ctx = await browser.createBrowserContext();
  const p = await moTrang(ctx, { view: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  await sleep(1200);
  const n = await p.evaluate(async () => { const ks = await caches.keys(); let c = 0; for (const k of ks) c += (await (await caches.open(k)).keys()).length; return c; });
  check('service worker đã lưu vỏ ứng dụng', n >= 25, String(n));
  await gieoDuLieu(p);
  await p.setOfflineMode(true);
  await p.reload({ waitUntil: 'load' }); await sleep(500);
  const t = await van(p);
  check('mở được khi ngoại tuyến và vẫn thấy dữ liệu', t.includes('Hôm nay') && t.includes('Đăng kiểm'), t.slice(0, 200));
  await di(p, '#/chi-phi'); check('chuyển màn khi ngoại tuyến', (await van(p)).includes('Theo tháng'));
  await p.setOfflineMode(false);
  await ctx.close();
}

async function khongHoTroGiongNoi() {
  nhom = 'không có nhận giọng nói';
  const ctx = await browser.createBrowserContext();
  const p = await moTrang(ctx, { view: { width: 360, height: 740, isMobile: true, hasTouch: true }, khongSR: true });
  await gieoDuLieu(p); await di(p, '#/');
  await p.click('.mic'); await sleep(150);
  check('không có SpeechRecognition: nút mic giải thích và vẫn gõ được', (await p.$eval('.vstatus', (e) => e.textContent)).includes('chưa hỗ trợ'));
  await ctx.close();
}

try {
  if (!process.env.SKIP_SWEEP) for (const [n, v] of [['dt390', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['dt360', { width: 360, height: 740, isMobile: true, hasTouch: true }], ['pc1280', { width: 1280, height: 800 }]]) {
    await quet(n, v, false); await quet(n, v, true);
  }
  const chi = process.env.ONLY || '';
  const KB = { xemay: kichBanXeMay, giadinh: kichBanGiaDinh, xedien: kichBanXeDien, offline: ngoaiTuyen, giongnoi: khongHoTroGiongNoi };
  for (const [k, fn] of Object.entries(KB)) if (!chi || chi.split(',').includes(k)) await fn();
} catch (e) {
  nhom = 'sập kịch bản'; check(`kịch bản gặp lỗi: ${e.message}`, false, e.stack.split('\n').slice(0, 3).join(' '));
}
nhom = 'console';
check('không có lỗi/cảnh báo console, trang lỗi, yêu cầu hỏng', loiConsole.length === 0, [...new Set(loiConsole)].slice(0, 8).join('\n'));
await Promise.all(chupLoi);
await browser.close();
server.close();
const loi = ketQua.filter((k) => !k.ok);
console.log(`\nTổng ${ketQua.length} kiểm tra, ${ketQua.length - loi.length} đạt, ${loi.length} lỗi`);
if (loi.length) { console.log(loi.map((l) => ' - ' + l.ten).join('\n')); process.exitCode = 1; }
