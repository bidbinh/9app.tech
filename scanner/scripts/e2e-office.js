// Kiểm thử giao diện thật cho các tính năng chuyển đổi: xuất Word/Excel, công cụ PDF, tự chụp, tự xoay, kiểm tra cỡ chữ/vùng chạm/tràn ngang.
// Chạy: node scripts/e2e-office.js   (cần Chrome + puppeteer-core như e2e.js). Ảnh chụp lưu ở shots/, báo cáo shots/e2e-office-report.json.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './serve.js';
import { sceneInPage } from './scene.js';
import { readZip } from '../js/zip.js';
import { checkXml, xmlText } from '../tests/helpers/xml.js';
import { loadPdfLibNode, pdfTexts } from '../tests/helpers/libs.js';
import { buildPdf, pageBox } from '../js/pdf.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SHOTS = path.join(ROOT, 'shots');
const SAMPLES = path.join(SHOTS, 'samples');
fs.mkdirSync(SAMPLES, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const L = loadPdfLibNode();

const server = await startServer(9400 + Math.floor(Math.random() * 500));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const URL0 = `${ORIGIN}/scanner/`;
const DL = fs.mkdtempSync(path.join(os.tmpdir(), '9scanner-dl2-'));
const udd = fs.mkdtempSync(path.join(os.tmpdir(), '9scanner-chrome2-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = { steps: [], problems: [], metrics: {} };
const problems = report.problems;
let lastNew = null;
async function step(name, fn, page) {
  try { const r = await fn(); report.steps.push({ name, ok: true, detail: r }); console.log(`OK   ${name}${typeof r === 'string' ? ' — ' + r : ''}`); return r; } catch (e) {
    report.steps.push({ name, ok: false, detail: e.message }); console.log(`FAIL ${name} — ${e.message}`);
    const p = lastNew || page;
    if (p) { try { await p.screenshot({ path: path.join(SHOTS, `fail-office-${name.replace(/\W+/g, '_').slice(0, 40)}.png`) }); } catch (e2) { /* bỏ qua */ } }
    return undefined;
  }
}

// ---------- ảnh mẫu ----------
const lev = (a, b) => { const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const cer = (got, want) => lev(norm(got), norm(want)) / Math.max(1, norm(want).length);

const browser0 = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: null, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}0`] });
const p0 = await browser0.newPage();
await p0.goto(URL0, { waitUntil: 'domcontentloaded' });
const SC = {
  'bien-ban': { bg: 'wood', rot: -5, persp: 0.1, shadow: 'grad', scale: 0.86, blur: 0.8, light: 1 },
  'nguoc': { bg: 'green', rot: 180 + 4, persp: 0.08, shadow: 'grad', scale: 0.84, blur: 0.8, light: 1 },
  'ngang': { bg: 'wood', rot: 90 - 6, persp: 0.1, shadow: 'grad', scale: 0.84, blur: 0.8, light: 1 },
  'phang': { flat: true },
  'cong': { bg: 'wood', rot: 2, persp: 0.06, shadow: 'grad', scale: 0.86, blur: 0.8, light: 1, curve: { kind: 'book', amp: 0.03 } },
  'ngon': { bg: 'dark', rot: 2, persp: 0.06, shadow: 'grad', scale: 0.86, blur: 0.8, light: 1, fingers: [{ tone: [214, 160, 118], side: 'right', along: 0.62, width: 120, len: 130 }, { tone: [98, 64, 46], side: 'bottom', along: 0.3, width: 110, len: 150 }] },
  'mo': { bg: 'wood', rot: 3, persp: 0.07, shadow: 'grad', scale: 0.86, blur: 9, light: 1 },
  'choi': { bg: 'gray', rot: 3, persp: 0.07, shadow: 'grad', scale: 0.86, blur: 0.8, light: 0.72, glare: { x: 0.5, y: 0.38, rx: 0.2, ry: 0.1, strength: 1.2 } },
  'camera': { bg: 'wood', rot: -4, persp: 0.08, shadow: 'grad', scale: 0.9, blur: 0.6, light: 1, W: 1280, H: 720 },
};
const sample = {};
for (const [n, d] of Object.entries(SC)) {
  const r = await p0.evaluate(sceneInPage, d);
  const f = path.join(SAMPLES, `office-${n}.jpg`);
  fs.writeFileSync(f, Buffer.from(r.b64, 'base64'));
  sample[n] = { file: f, text: r.text, table: r.table, corners: r.corners, W: r.W, H: r.H };
}
// PDF mẫu: 3 trang chữ thuần, 2 trang chữ thuần khác, PDF bản quét (ảnh), PDF nặng ảnh
async function textPdf(label, n) {
  const doc = await L.PDFDocument.create();
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${label} trang ${i}`, { x: 60, y: 760, size: 22, font });
    p.drawText('Day la doan van mau de kiem tra chuyen doi. Noi dung khong co du lieu that.', { x: 60, y: 720, size: 12, font });
  }
  return doc.save();
}
fs.writeFileSync(path.join(SAMPLES, 'a3.pdf'), await textPdf('Alpha', 3));
fs.writeFileSync(path.join(SAMPLES, 'b2.pdf'), await textPdf('Beta', 2));
{
  const jpeg = fs.readFileSync(sample.phang.file);
  const box = pageBox(sample.phang.W, sample.phang.H, 'a4', 0);
  fs.writeFileSync(path.join(SAMPLES, 'scan.pdf'), buildPdf([{ jpeg, imgW: sample.phang.W, imgH: sample.phang.H, ...box }], { title: 'scan' }));
}
await browser0.close();

const mj = Buffer.concat(Array(30).fill(fs.readFileSync(sample.camera.file)));
fs.writeFileSync(path.join(SAMPLES, 'office-camera.mjpeg'), mj);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, defaultViewport: null,
  args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}1`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${path.join(SAMPLES, 'office-camera.mjpeg')}`, '--autoplay-policy=no-user-gesture-required'],
});

async function newPage({ dark = false, view = { width: 390, height: 844 }, name = 'main' } = {}) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(ORIGIN, ['camera']);
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[${name}] requestfailed ${r.url()} ${r.failure() && r.failure().errorText}`));
  const bc = await browser.target().createCDPSession();
  await bc.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, browserContextId: ctx.id });
  page.__ctx = ctx; lastNew = page;
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const S = (page, expr) => page.evaluate(`(() => { const S = window.__scanner.S; return ${expr}; })()`);
async function waitView(page, v, timeout = 30000) { await page.waitForFunction((v) => window.__scanner && window.__scanner.S.view === v, { timeout }, v); }
async function clickText(page, text, scope = 'button') {
  const ok = await page.evaluate((text, scope) => {
    const el = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).reverse().find((e) => e.textContent.replace(/\s+/g, ' ').trim() === text);
    if (el) { el.click(); return true; } return false;
  }, text, scope);
  if (!ok) throw new Error(`Không thấy nút “${text}”`);
}
async function chooseFile(page, clickFn, files) {
  const [fc] = await Promise.all([page.waitForFileChooser({ timeout: 10000 }), clickFn()]);
  await fc.accept(Array.isArray(files) ? files : [files]);
}
const clearDl = () => { for (const f of fs.readdirSync(DL)) { try { fs.unlinkSync(path.join(DL, f)); } catch (e) { /* bỏ qua */ } } };
async function waitDl(ext, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = fs.readdirSync(DL).filter((x) => !x.endsWith('.crdownload') && x.toLowerCase().endsWith(ext));
    if (f.length) { await sleep(300); return path.join(DL, f[0]); }
    await sleep(200);
  }
  throw new Error('không thấy tệp ' + ext);
}
async function waitModalResult(page, timeout = 240000) {
  await page.waitForFunction(() => !!document.querySelector('.modal .res-list'), { timeout });
  return page.$eval('.modal .sheet', (e) => e.textContent);
}
async function closeModal(page) { await page.evaluate(() => { for (const m of document.querySelectorAll('.modal')) m.remove(); }); }
async function wellFormed(page, xml) { return page.evaluate((x) => { const d = new DOMParser().parseFromString(x, 'application/xml'); const e = d.querySelector('parsererror'); return e ? e.textContent.slice(0, 200) : ''; }, xml); }
async function checkOoxml(page, bytes) {
  const files = await readZip(new Uint8Array(bytes));
  const td = new TextDecoder();
  for (const f of files.filter((x) => /\.(xml|rels)$/.test(x.name))) {
    const x = td.decode(f.data);
    checkXml(x, f.name);
    const err = await wellFormed(page, x);
    if (err) throw new Error(`${f.name} không phải XML hợp lệ (DOMParser): ${err}`);
  }
  return files;
}
async function auditUi(page, label) {
  const r = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
    const out = { small: [], font: [], overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
    // vùng cuộn ngang có chủ ý (chip, bảng sửa) không tính là tràn trang
    for (const e of document.querySelectorAll('button, [role="button"], input:not([type="hidden"]), a[href], select, textarea')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if (e.id === 'n9-home' || e.closest('#n9-home')) continue; // thanh điều hướng chung của cổng 9app (không thuộc app này)
      if (r.height < 43.5 || r.width < 43.5) out.small.push((e.id ? '#' + e.id : e.className ? '.' + String(e.className).split(' ')[0] : e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20) + '"');
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (!t) continue;
      const e = n.parentElement;
      if (!e || !vis(e) || e.closest('svg, script, style, option, textarea') ) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 13.99) out.font.push(`${fs}px "${t.slice(0, 24)}" in ${e.tagName}.${String(e.className).split(' ')[0]}`);
    }
    return out;
  });
  if (r.overflow) throw new Error(`${label}: trang tràn ngang`);
  return r;
}

// =====================================================================
const page = await newPage({ name: 'chinh' });
await page.goto(URL0, { waitUntil: 'networkidle0' });
await waitView(page, 'home');

await step('Trang chủ có thẻ “Công cụ chuyển đổi”; mở ra thấy đủ 9 công cụ và ghi rõ Word sang PDF chưa hỗ trợ', async () => {
  await shot(page, '40-trang-chu-co-cong-cu');
  await page.click('#btn-tools');
  await waitView(page, 'tools');
  const items = await page.$$eval('#tool-list .tool-item', (a) => a.map((e) => ({ t: e.querySelector('b').textContent, off: e.classList.contains('off') })));
  if (items.filter((x) => !x.off).length !== 9) throw new Error('số công cụ ' + JSON.stringify(items));
  if (!items.some((x) => x.off && /Word sang PDF.*chưa hỗ trợ/.test(x.t))) throw new Error('thiếu ghi chú Word sang PDF');
  await shot(page, '41-cong-cu-sang');
  return items.map((x) => x.t).join(' | ');
}, page);

// ---- Xuất Word / Excel từ ảnh quét ----
await step('Nhập ảnh biên bản (nghiêng, bóng đổ, bảng có đường kẻ) → tài liệu 1 trang, mặc định Màu tự động', async () => {
  await page.evaluate(() => window.__scanner.goHome());
  await waitView(page, 'home');
  await chooseFile(page, () => page.click('#btn-pick'), sample['bien-ban'].file);
  await waitView(page, 'crop');
  await page.waitForFunction(() => !document.querySelector('#crop-next').disabled, { timeout: 20000 });
  const d = await S(page, '({found: S.doc.pages[0].found, filter: S.doc.pages[0].filter, rot: S.doc.pages[0].rot})');
  if (d.filter !== 'auto') throw new Error('bộ lọc mặc định ' + d.filter);
  if (d.rot !== 0) throw new Error('trang thẳng mà tự xoay ' + d.rot);
  await page.click('#crop-next'); await waitView(page, 'filter');
  await page.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 });
  await shot(page, '42-loc-tu-dong');
  await page.click('#f-done'); await waitView(page, 'doc');
  await page.evaluate(() => { window.__scanner.S.doc.name = 'Biên bản bàn giao'; });
  return `found=${d.found}`;
}, page);

let docxBytes = null;
await step('Xuất Word (.docx): đọc chữ OCR, dựng tiêu đề/đoạn/bảng; tệp là OOXML hợp lệ, tên tiếng Việt đúng', async () => {
  await page.click('#doc-export');
  await clickText(page, 'Word', '.modal .seg button');
  await page.waitForFunction(() => { const r = document.querySelector('.modal .result'); return r && /^Word: /.test(r.textContent); }, { timeout: 240000 });
  await shot(page, '43-xuat-word');
  clearDl();
  await clickText(page, 'Tải về', '.modal button');
  const file = await waitDl('.docx');
  if (path.basename(file) !== 'Biên bản bàn giao.docx') throw new Error('tên tệp ' + path.basename(file));
  docxBytes = fs.readFileSync(file);
  const files = await checkOoxml(page, docxBytes);
  const doc = new TextDecoder().decode(files.find((f) => f.name === 'word/document.xml').data);
  const text = xmlText(doc);
  const want = sample['bien-ban'].text;
  const c = cer(text, want);
  report.metrics.docxCerPct = +(c * 100).toFixed(1);
  const rows = (doc.match(/<w:tr>/g) || []).length;
  if (!/<w:tbl>/.test(doc) || rows < 4) throw new Error('bảng trong Word: ' + rows + ' hàng');
  if (!/Heading1|Heading2/.test(doc)) throw new Error('không có tiêu đề');
  if (!/w:jc w:val="center"/.test(doc)) throw new Error('không có đoạn căn giữa');
  if (c > 0.22) throw new Error('chữ trong Word lệch nhiều so với bản gốc: CER ' + (c * 100).toFixed(1) + '%\n' + text.slice(0, 400));
  const tcell = /Máy tính xách tay/i.test(text);
  if (!tcell) throw new Error('thiếu ô “Máy tính xách tay”');
  return `CER ${(c * 100).toFixed(1)}%, ${rows} hàng bảng, ${docxBytes.length} byte`;
}, page);

await step('Chia sẻ Word qua Web Share: tệp .docx đúng loại MIME', async () => {
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = d.files.map((f) => ({ n: f.name, t: f.type, s: f.size })); }; });
  await clickText(page, 'Chia sẻ', '.modal button');
  await page.waitForFunction(() => window.__shared, { timeout: 5000 });
  const sh = await page.evaluate(() => window.__shared);
  if (sh[0].n !== 'Biên bản bàn giao.docx' || !/wordprocessingml/.test(sh[0].t)) throw new Error(JSON.stringify(sh));
  return JSON.stringify(sh[0]);
}, page);

await step('Xuất Word kèm ảnh trang gốc: có ảnh nhúng', async () => {
  await clickText(page, 'Word', '.modal .seg button');
  await page.click('#exp-img');
  await page.waitForFunction(() => { const r = document.querySelector('.modal .result'); return r && /^Word: /.test(r.textContent) && !document.querySelector('.modal .actions button[disabled]'); }, { timeout: 120000 });
  clearDl();
  await clickText(page, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.docx'));
  const files = await checkOoxml(page, bytes);
  const img = files.find((f) => f.name === 'word/media/trang1.jpg');
  if (!img || img.data[0] !== 0xff || img.data[1] !== 0xd8) throw new Error('không có ảnh JPEG nhúng');
  const doc = new TextDecoder().decode(files.find((f) => f.name === 'word/document.xml').data);
  if (!/<w:drawing>/.test(doc)) throw new Error('thiếu w:drawing');
  return `ảnh ${img.data.length} byte, tệp ${bytes.length} byte`;
}, page);

await step('Xuất Excel (.xlsx): dò bảng có đường kẻ, cho sửa trước khi xuất; ô số được ghi thành số', async () => {
  await clickText(page, 'Excel', '.modal .seg button');
  await page.waitForFunction(() => { const r = document.querySelector('.modal .result'); return r && /^Excel: /.test(r.textContent) && !document.querySelector('.modal .actions button[disabled]'); }, { timeout: 240000 });
  await shot(page, '44-xuat-excel');
  await clickText(page, 'Xem và sửa bảng trước khi xuất', '.modal button');
  await page.waitForSelector('.xl input', { timeout: 5000 });
  const dims = await page.$$eval('.xl tr', (rows) => rows.map((r) => [...r.querySelectorAll('input')].map((i) => i.value)));
  report.metrics.xlsxGrid = dims;
  await shot(page, '45-sua-bang-excel');
  const a = await auditUi(page, 'sửa bảng');
  report.metrics.auditXl = { small: a.small, font: a.font };
  // sửa một ô rồi xác nhận
  await page.evaluate(() => { const i = document.querySelector('.xl tr:nth-child(2) input:nth-child(1)'); void i; });
  const inp = await page.$('.xl tr:nth-child(2) td:nth-child(3) input');
  await inp.click({ clickCount: 3 });
  await inp.type('99');
  await clickText(page, 'Dùng bảng này', '.modal button');
  await page.waitForFunction(() => /đã cập nhật theo chỉnh sửa/.test(document.querySelector('.modal .result').textContent), { timeout: 20000 });
  clearDl();
  await clickText(page, 'Tải về', '.modal button');
  const file = await waitDl('.xlsx');
  if (path.basename(file) !== 'Biên bản bàn giao.xlsx') throw new Error('tên tệp ' + path.basename(file));
  const bytes = fs.readFileSync(file);
  const files = await checkOoxml(page, bytes);
  const sh = new TextDecoder().decode(files.find((f) => f.name === 'xl/worksheets/sheet1.xml').data);
  if (!/<v>99<\/v>/.test(sh)) throw new Error('ô đã sửa không có trong tệp');
  const want = sample['bien-ban'].table;
  let hit = 0, total = 0;
  for (let r = 0; r < want.length; r++) for (let c = 0; c < want[r].length; c++) {
    total++;
    const cell = dims[r] && dims[r][c] != null ? dims[r][c] : '';
    if (norm(cell) === norm(want[r][c])) hit++;
  }
  report.metrics.xlsxCellExactPct = +(100 * hit / total).toFixed(0);
  if (dims.length !== want.length) throw new Error(`số hàng ${dims.length} ≠ ${want.length}: ${JSON.stringify(dims)}`);
  if (hit / total < 0.6) throw new Error(`chỉ ${hit}/${total} ô khớp: ${JSON.stringify(dims)}`);
  await closeModal(page);
  return `${hit}/${total} ô khớp đúng, ${bytes.length} byte`;
}, page);

// ---- Tự xoay chữ ----
await step('Ảnh chụp ngang (chữ dọc) tự xoay thẳng khi nhập; ảnh lộn ngược được OCR lật lại khi xuất Word', async () => {
  const p = await newPage({ name: 'xoay' });
  await p.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(p, 'home');
  await chooseFile(p, () => p.click('#btn-pick'), sample.ngang.file);
  await waitView(p, 'crop');
  await p.waitForFunction(() => !document.querySelector('#crop-next').disabled, { timeout: 20000 });
  const r1 = await S(p, 'S.doc.pages[0].rot');
  if (r1 !== 90 && r1 !== 270) throw new Error('ảnh chụp ngang không tự xoay: rot=' + r1);
  await p.evaluate(() => window.__scanner.goHome());
  await waitView(p, 'home');
  await chooseFile(p, () => p.click('#btn-pick'), sample.nguoc.file);
  await waitView(p, 'crop');
  await p.waitForFunction(() => !document.querySelector('#crop-next').disabled, { timeout: 20000 });
  await p.click('#crop-next'); await waitView(p, 'filter');
  await p.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 });
  await shot(p, '46-anh-nguoc-truoc-xoay');
  await p.click('#f-orient');
  await p.waitForFunction(() => window.__scanner.S.doc.pages[0].rot === 180 || /đúng chiều|Không đọc/.test(document.querySelector('#toast').textContent), { timeout: 120000 });
  const r2 = await S(p, 'S.doc.pages[0].rot');
  if (r2 !== 180) throw new Error('ảnh lộn ngược chưa được xoay 180: rot=' + r2);
  await p.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 });
  await shot(p, '47-anh-nguoc-sau-xoay');
  await p.__ctx.close();
  return `ngang → rot ${r1}; lộn ngược → rot ${r2}`;
}, page);

// ---- Công cụ PDF ----
const A3 = path.join(SAMPLES, 'a3.pdf'), B2 = path.join(SAMPLES, 'b2.pdf'), SCAN = path.join(SAMPLES, 'scan.pdf');
async function openTool(p, id) {
  await p.evaluate(() => window.__scanner.goHome());
  await waitView(p, 'home');
  await p.click('#btn-tools'); await waitView(p, 'tools');
  return () => p.click(`.tool-item[data-tool="${id}"]`);
}

const tp = await newPage({ name: 'cong-cu' });
await tp.goto(URL0, { waitUntil: 'networkidle0' });
await waitView(tp, 'home');

await step('Gộp PDF: 2 tệp (3 + 2 trang) → 5 trang đúng thứ tự', async () => {
  const click = await openTool(tp, 'merge');
  await click();
  await tp.waitForSelector('.modal .fl-list', { timeout: 5000 });
  await chooseFile(tp, () => clickText(tp, 'Thêm tệp', '.modal button'), [A3, B2]);
  await tp.waitForFunction(() => document.querySelectorAll('.modal .fl-list li').length === 2, { timeout: 5000 });
  await shot(tp, '48-gop-pdf');
  const a = await auditUi(tp, 'gộp pdf'); report.metrics.auditMerge = { small: a.small, font: a.font };
  await clickText(tp, 'Gộp', '.modal button');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.pdf'));
  const t = await pdfTexts(new Uint8Array(bytes));
  if (t.length !== 5 || !/^Alpha trang 1/.test(t[0]) || !/^Beta trang 2/.test(t[4])) throw new Error(JSON.stringify(t));
  await closeModal(tp);
  return `${t.length} trang: ${t.map((x) => x.split(' ').slice(0, 2).join(' ')).join(', ')}`;
}, tp);

await step('Sắp xếp/xóa/tách trang: xem lưới trang, chọn trang 2 xóa, đổi thứ tự, lưu → đúng', async () => {
  const click = await openTool(tp, 'pages');
  await chooseFile(tp, click, A3);
  await waitView(tp, 'pdfpages');
  await tp.waitForFunction(() => [...document.querySelectorAll('#pp-grid .thumb')].every((t) => t.style.backgroundImage), { timeout: 30000 });
  await shot(tp, '49-quan-ly-trang-sang');
  const a = await auditUi(tp, 'quản lý trang'); report.metrics.auditPages = { small: a.small, font: a.font };
  await tp.click('#pp-grid .pg:nth-child(2) .pic');
  await tp.click('#pp-del');
  await clickText(tp, 'Xóa', '.modal button');
  await tp.waitForFunction(() => document.querySelectorAll('#pp-grid .pg').length === 2, { timeout: 5000 });
  await tp.click('#pp-grid .pg:nth-child(2) .acts button:nth-child(1)'); // đưa trang cuối lên trước
  await tp.click('#pp-save');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.pdf'));
  const t = await pdfTexts(new Uint8Array(bytes));
  if (t.length !== 2 || !/Alpha trang 3/.test(t[0]) || !/Alpha trang 1/.test(t[1])) throw new Error(JSON.stringify(t));
  await closeModal(tp);
  return 'còn 2 trang: trang 3 rồi trang 1';
}, tp);

await step('Tách trang: chọn trang 1 và 3 → mỗi trang một tệp (zip) đúng nội dung', async () => {
  const click = await openTool(tp, 'pages');
  await chooseFile(tp, click, A3);
  await waitView(tp, 'pdfpages');
  await tp.waitForFunction(() => [...document.querySelectorAll('#pp-grid .thumb')].every((t) => t.style.backgroundImage), { timeout: 30000 });
  await tp.click('#pp-grid .pg:nth-child(1) .pic'); await tp.click('#pp-grid .pg:nth-child(3) .pic');
  await tp.click('#pp-split');
  await clickText(tp, 'Mỗi trang một tệp (gói .zip)', '.modal button');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const zip = await readZip(new Uint8Array(fs.readFileSync(await waitDl('.zip'))));
  if (zip.length !== 2) throw new Error('số tệp trong zip ' + zip.length);
  const t0 = await pdfTexts(zip[0].data), t1 = await pdfTexts(zip[1].data);
  if (!/Alpha trang 1/.test(t0[0]) || !/Alpha trang 3/.test(t1[0])) throw new Error(JSON.stringify([t0, t1]));
  await closeModal(tp);
  return zip.map((z) => z.name).join(', ');
}, tp);

await step('PDF sang ảnh JPG: 3 trang → zip gồm 3 JPEG hợp lệ có kích thước đúng', async () => {
  const click = await openTool(tp, 'pdf2jpg');
  await chooseFile(tp, click, A3);
  await tp.waitForSelector('.modal .seg', { timeout: 20000 });
  await clickText(tp, 'Chuyển', '.modal button');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const zip = await readZip(new Uint8Array(fs.readFileSync(await waitDl('.zip'))));
  if (zip.length !== 3) throw new Error('số ảnh ' + zip.length);
  for (const z of zip) if (z.data[0] !== 0xff || z.data[1] !== 0xd8 || z.data.length < 3000) throw new Error('JPEG hỏng ' + z.name);
  // đo kích thước thật bằng trình duyệt
  const dims = await tp.evaluate(async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); const bm = await createImageBitmap(new Blob([u], { type: 'image/jpeg' })); return [bm.width, bm.height]; }, Buffer.from(zip[0].data).toString('base64'));
  if (Math.abs(dims[0] - 595 * 150 / 72) > 3) throw new Error('kích thước ảnh ' + dims);
  await closeModal(tp);
  return `${zip.map((z) => z.name).join(', ')} · ${dims[0]}x${dims[1]}`;
}, tp);

await step('PDF sang Word: PDF có chữ lấy văn bản trực tiếp', async () => {
  const click = await openTool(tp, 'pdf2word');
  await chooseFile(tp, click, A3);
  await tp.waitForSelector('.modal .check', { timeout: 20000 });
  await clickText(tp, 'Chuyển', '.modal button');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.docx'));
  const files = await checkOoxml(tp, bytes);
  const text = xmlText(new TextDecoder().decode(files.find((f) => f.name === 'word/document.xml').data));
  for (const k of ['Alpha trang 1', 'Alpha trang 2', 'Alpha trang 3', 'Day la doan van mau']) if (!text.includes(k)) throw new Error('thiếu “' + k + '”: ' + text.slice(0, 300));
  await closeModal(tp);
  return 'đủ 3 trang';
}, tp);

await step('PDF bản quét sang Word: dựng ảnh rồi OCR tiếng Việt, có bảng', async () => {
  const click = await openTool(tp, 'pdf2word');
  await chooseFile(tp, click, SCAN);
  await tp.waitForSelector('.modal .check', { timeout: 20000 });
  await clickText(tp, 'Chuyển', '.modal button');
  await waitModalResult(tp, 300000);
  const modalText = await tp.$eval('.modal .sheet', (e) => e.textContent);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.docx'));
  const files = await checkOoxml(tp, bytes);
  const doc = new TextDecoder().decode(files.find((f) => f.name === 'word/document.xml').data);
  const text = xmlText(doc);
  const c = cer(text, sample['bien-ban'].text);
  report.metrics.scanPdfToWordCerPct = +(c * 100).toFixed(1);
  if (!/OCR/.test(modalText)) throw new Error('thiếu ghi chú OCR');
  if (c > 0.3) throw new Error('CER ' + (c * 100).toFixed(1) + '%');
  await closeModal(tp);
  return `CER ${(c * 100).toFixed(1)}%`;
}, tp);

await step('Nén PDF: PDF nặng ảnh giảm dung lượng, mở lại được', async () => {
  const click = await openTool(tp, 'compress');
  await chooseFile(tp, click, SCAN);
  await tp.waitForSelector('.modal .seg', { timeout: 20000 });
  await clickText(tp, 'Mạnh', '.modal .seg button');
  await clickText(tp, 'Nén', '.modal button');
  await waitModalResult(tp);
  const sum = await tp.$eval('.modal .res-sum', (e) => e.textContent);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.pdf'));
  const orig = fs.statSync(SCAN).size;
  if (!(bytes.length < orig * 0.8)) throw new Error(`${orig} → ${bytes.length} (${sum})`);
  const doc = await L.PDFDocument.load(bytes);
  if (doc.getPageCount() !== 1) throw new Error('mất trang');
  report.metrics.compress = { before: orig, after: bytes.length };
  await closeModal(tp);
  return sum;
}, tp);

await step('Đóng dấu chữ “BẢN SAO” lên 3 trang; tệp mở được và có ảnh dấu', async () => {
  const click = await openTool(tp, 'stamp');
  await chooseFile(tp, click, A3);
  await tp.waitForSelector('.modal input[type="text"]', { timeout: 20000 });
  await shot(tp, '50-dong-dau');
  await clickText(tp, 'Đóng dấu', '.modal button');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.pdf'));
  const doc = await L.PDFDocument.load(bytes);
  if (doc.getPageCount() !== 3) throw new Error('số trang');
  for (const pg of doc.getPages()) { const xo = pg.node.Resources().lookup(L.PDFName.of('XObject')); if (!xo || !xo.keys().length) throw new Error('trang thiếu ảnh dấu'); }
  const t = await pdfTexts(new Uint8Array(bytes));
  if (!/Alpha trang 2/.test(t[1])) throw new Error('mất chữ gốc');
  await closeModal(tp);
  return '3 trang có dấu, chữ gốc còn nguyên';
}, tp);

await step('Đặt mật khẩu: mật khẩu không khớp báo lỗi; khớp thì tệp cần mật khẩu mới mở được', async () => {
  const click = await openTool(tp, 'protect');
  await chooseFile(tp, click, B2);
  await tp.waitForSelector('.modal input[type="password"]', { timeout: 20000 });
  const [i1, i2] = await tp.$$('.modal input[type="password"]');
  await i1.type('Matkhau2026'); await i2.type('Khacnhau');
  await shot(tp, '51-dat-mat-khau');
  await clickText(tp, 'Đặt mật khẩu', '.modal button');
  const err = await tp.$eval('.form-err', (e) => e.textContent);
  if (!/chưa giống/.test(err)) throw new Error('không báo lỗi: ' + err);
  await i2.click({ clickCount: 3 }); await i2.type('Matkhau2026');
  await clickText(tp, 'Đặt mật khẩu', '.modal button');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = new Uint8Array(fs.readFileSync(await waitDl('.pdf')));
  let rejected = false;
  try { await pdfTexts(bytes); } catch (e) { rejected = /password/i.test(e.message); }
  if (!rejected) throw new Error('mở được mà không cần mật khẩu');
  const t = await pdfTexts(bytes, 'Matkhau2026');
  if (t.length !== 2 || !/Beta trang 1/.test(t[0])) throw new Error(JSON.stringify(t));
  await closeModal(tp);
  return 'đúng mật khẩu mở được, thiếu mật khẩu bị từ chối';
}, tp);

await step('PDF có mật khẩu: app hỏi mật khẩu khi chuyển sang ảnh; nhập đúng thì chạy', async () => {
  // tạo tệp đã khóa bằng chính bộ mã hóa của app
  const { protectPdf } = await import('../js/pdftools.js');
  const locked = await protectPdf(new Uint8Array(fs.readFileSync(B2)), 'abc12345');
  const lf = path.join(SAMPLES, 'locked.pdf'); fs.writeFileSync(lf, locked);
  const click = await openTool(tp, 'pdf2jpg');
  await chooseFile(tp, click, lf);
  await tp.waitForSelector('.modal input[type="password"]', { timeout: 20000 });
  const inp = await tp.$('.modal input[type="password"]');
  await inp.type('sai'); await clickText(tp, 'Mở', '.modal button');
  await tp.waitForFunction(() => /chưa đúng/.test((document.querySelector('.modal .sheet') || {}).textContent || ''), { timeout: 10000 });
  const inp2 = await tp.$('.modal input[type="password"]');
  await inp2.type('abc12345'); await clickText(tp, 'Mở', '.modal button');
  await tp.waitForSelector('.modal .seg', { timeout: 20000 });
  await clickText(tp, 'Chuyển', '.modal button');
  await waitModalResult(tp);
  await closeModal(tp);
  return 'sai → hỏi lại → đúng → chuyển được';
}, tp);

await step('Ảnh sang PDF: 2 ảnh → PDF 2 trang, giữ thứ tự', async () => {
  const click = await openTool(tp, 'img2pdf');
  await chooseFile(tp, click, [sample['bien-ban'].file, sample.ngang.file]);
  await tp.waitForSelector('.modal .fl-list', { timeout: 10000 });
  await clickText(tp, 'Tiếp', '.modal button');
  await tp.waitForSelector('.modal .seg', { timeout: 5000 });
  await clickText(tp, 'Tạo PDF', '.modal button');
  await waitModalResult(tp);
  clearDl();
  await clickText(tp, 'Tải về', '.modal button');
  const bytes = fs.readFileSync(await waitDl('.pdf'));
  const doc = await L.PDFDocument.load(bytes);
  if (doc.getPageCount() !== 2) throw new Error('số trang ' + doc.getPageCount());
  await closeModal(tp);
  return `${bytes.length} byte`;
}, tp);

await step('Ảnh chụp màn hình các màn mới ở 390x844 chế độ tối; kiểm cỡ chữ ≥ 14px, vùng chạm ≥ 44px, không tràn ngang', async () => {
  const d = await newPage({ dark: true, name: 'toi' });
  await d.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(d, 'home');
  await shot(d, '52-trang-chu-toi');
  await d.click('#btn-tools'); await waitView(d, 'tools');
  await shot(d, '53-cong-cu-toi');
  const a1 = await auditUi(d, 'công cụ');
  // quản lý trang (tối)
  await chooseFile(d, () => d.click('.tool-item[data-tool="pages"]'), A3);
  await waitView(d, 'pdfpages');
  await d.waitForFunction(() => [...document.querySelectorAll('#pp-grid .thumb')].every((t) => t.style.backgroundImage), { timeout: 30000 });
  await d.click('#pp-grid .pg:nth-child(2) .pic');
  await shot(d, '54-quan-ly-trang-toi');
  const a2 = await auditUi(d, 'quản lý trang tối');
  await d.__ctx.close();
  // 320px
  const n = await newPage({ view: { width: 320, height: 640 }, name: '320' });
  await n.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(n, 'home');
  const a3 = await auditUi(n, 'trang chủ 320');
  await n.click('#btn-tools'); await waitView(n, 'tools');
  const a4 = await auditUi(n, 'công cụ 320');
  await shot(n, '55-cong-cu-320');
  await n.__ctx.close();
  const all = { tools: a1, pagesDark: a2, home320: a3, tools320: a4 };
  report.metrics.audit = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { small: v.small, font: v.font }]));
  const bad = Object.entries(all).flatMap(([k, v]) => [...v.small.map((x) => `${k}: nút nhỏ ${x}`), ...v.font.map((x) => `${k}: chữ nhỏ ${x}`)]);
  if (bad.length) throw new Error(bad.slice(0, 8).join(' ; '));
  return 'không có vi phạm';
}, tp);

// ---- Tự chụp bằng camera giả ----
await step('Camera giả: bật “Tự chụp”, giữ yên → tự chụp và vào màn chỉnh góc, không cần bấm màn trập', async () => {
  const c = await newPage({ name: 'tu-chup' });
  await c.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(c, 'home');
  await c.click('#btn-shoot');
  await waitView(c, 'camera');
  await c.waitForFunction(() => { const v = document.querySelector('#cam-video'); return v && v.videoWidth > 0 && v.readyState >= 2; }, { timeout: 20000 });
  await c.click('#cam-auto');
  await sleep(1200);
  await shot(c, '56-camera-tu-chup-nhan-khung');
  await waitView(c, 'crop', 25000);
  const n = await S(c, 'S.doc.pages.length');
  if (n !== 1) throw new Error('số trang ' + n);
  const pref = await c.evaluate(() => localStorage.getItem('9scanner.autoShoot'));
  await c.__ctx.close();
  return `tự chụp thành công, nhớ lựa chọn: ${pref}`;
}, tp);

await step('Camera giả: khung viền xanh hiện trên hình khi nhận được tài liệu; chụp liên tục + tự chụp không chụp lặp cùng một tờ', async () => {
  const c = await newPage({ name: 'lien-tuc' });
  await c.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(c, 'home');
  await c.evaluate(() => { localStorage.setItem('9scanner.multi', 'true'); localStorage.setItem('9scanner.autoShoot', 'true'); });
  await c.click('#btn-shoot');
  await waitView(c, 'camera');
  await c.waitForFunction(() => window.__scanner.S.shots >= 1, { timeout: 25000 });
  await sleep(5000);
  const shots = await S(c, 'S.shots');
  const drawn = await c.evaluate(() => { const cv = document.querySelector('#cam-outline'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let g = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i + 1] > d[i] + 60) g++; return g; });
  await shot(c, '57-camera-chup-lien-tuc');
  await c.__ctx.close();
  if (shots !== 1) throw new Error('chụp lặp: ' + shots + ' trang từ một tờ giấy');
  if (drawn < 200) throw new Error('không thấy viền xanh trên hình camera');
  return `1 trang, viền xanh ${drawn} điểm ảnh`;
}, tp);

// ---- Lọc mọi trang ----
await step('“Lọc mọi trang”: áp dụng bộ lọc hiện tại cho cả tài liệu', async () => {
  const b = await newPage({ name: 'loc-tat-ca' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  await chooseFile(b, () => b.click('#btn-pick'), [sample['bien-ban'].file, sample.camera.file]);
  await waitView(b, 'doc', 60000);
  await b.click('#page-grid .pg:nth-child(1) .pic');
  await waitView(b, 'filter');
  await b.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 });
  await clickText(b, 'Trắng đen tài liệu', '#filter-chips button');
  await b.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 });
  await shot(b, '58-trang-den-tai-lieu');
  await b.waitForFunction(() => document.querySelector('#toast').hidden, { timeout: 10000 });
  await b.click('#f-all');
  const f = await S(b, 'S.doc.pages.map((p) => p.filter)');
  if (!f.every((x) => x === 'docbw')) throw new Error(JSON.stringify(f));
  await b.__ctx.close();
  return f.join(',');
}, tp);


// ---- Nắn phẳng, xóa ngón tay, cảnh báo chất lượng ----
async function openFilterFor(file, name) {
  const b = await newPage({ name });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  await chooseFile(b, () => b.click('#btn-pick'), file);
  await waitView(b, 'crop');
  await b.waitForFunction(() => !document.querySelector('#crop-next').disabled, { timeout: 30000 });
  await b.click('#crop-next'); await waitView(b, 'filter');
  await b.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 60000 });
  await sleep(1500);
  return b;
}
await step('Trang cong: tự nắn phẳng khi vào bộ lọc; nút “Nắn phẳng” bật/tắt để so trước/sau và ảnh đổi thật', async () => {
  const b = await openFilterFor(sample.cong.file, 'cong');
  const on = await b.$eval('#f-dewarp', (e) => e.getAttribute('aria-pressed'));
  if (on !== 'true') throw new Error('trang cong không tự nắn: ' + (await b.$eval('#fix-note', (e) => e.textContent)));
  const note = await b.$eval('#fix-note', (e) => e.textContent);
  if (!/Đã nắn phẳng/.test(note)) throw new Error('thiếu thông báo: ' + note);
  const snap = () => b.$eval('#pv-canvas', (c) => { const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s += d[i]; return s; });
  const s1 = await snap();
  await shot(b, '60-nan-phang-bat');
  await b.click('#f-dewarp'); await b.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 }); await sleep(600);
  const off = await b.$eval('#f-dewarp', (e) => e.getAttribute('aria-pressed'));
  const s2 = await snap();
  await shot(b, '61-nan-phang-tat');
  if (off !== 'false') throw new Error('nút không tắt');
  if (s1 === s2) throw new Error('ảnh không đổi khi tắt nắn phẳng');
  await b.click('#f-dewarp'); await b.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 }); await sleep(600);
  if ((await b.$eval('#f-dewarp', (e) => e.getAttribute('aria-pressed'))) !== 'true') throw new Error('bật lại không được');
  await b.__ctx.close();
  return note.slice(0, 80);
}, tp);

await step('Ngón tay nhiều tông da đè mép: tự xóa; nút “Xóa ngón tay / vật cản” bật/tắt; trang phẳng không bị làm méo', async () => {
  const b = await openFilterFor(sample.ngon.file, 'ngon');
  const on = await b.$eval('#f-clean', (e) => e.getAttribute('aria-pressed'));
  const note = await b.$eval('#fix-note', (e) => e.textContent);
  if (on !== 'true' || !/Đã xóa ngón tay/.test(note)) throw new Error('không tự xóa ngón tay: ' + note);
  const dw = await b.$eval('#f-dewarp', (e) => e.getAttribute('aria-pressed'));
  if (dw !== 'false') throw new Error('trang phẳng bị tự nắn: ' + note);
  await shot(b, '62-xoa-ngon-tay-bat');
  await b.click('#f-clean'); await b.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 }); await sleep(600);
  if ((await b.$eval('#f-clean', (e) => e.getAttribute('aria-pressed'))) !== 'false') throw new Error('nút không tắt');
  await shot(b, '63-xoa-ngon-tay-tat');
  await b.__ctx.close();
  return note.slice(0, 80);
}, tp);

await step('Cảnh báo chất lượng hiện đúng chỗ: ảnh mờ (“mờ hoặc rung”), chói lóa che chữ; ảnh tốt thì không có cảnh báo', async () => {
  const warn = async (file, name) => { const b = await openFilterFor(file, name); const t = await b.$eval('#fix-note', (e) => e.hidden ? '' : e.textContent); const shotName = name; await shot(b, '64-canh-bao-' + shotName); await b.__ctx.close(); return t; };
  const blur = await warn(sample.mo.file, 'mo');
  if (!/mờ hoặc rung/.test(blur)) throw new Error('ảnh mờ không có cảnh báo: ' + blur);
  const glare = await warn(sample.choi.file, 'choi');
  if (!/chói lóa/.test(glare)) throw new Error('ảnh chói không có cảnh báo: ' + glare);
  const ok = await warn(sample['bien-ban'].file, 'tot');
  if (/mờ|chói|thiếu sáng/.test(ok)) throw new Error('ảnh tốt bị cảnh báo: ' + ok);
  return 'mờ, chói: có cảnh báo; ảnh tốt: không';
}, tp);

await step('Chế độ tối 390x844: toggle làm sạch và ghi chú đọc được, không tràn ngang, vùng chạm đủ lớn', async () => {
  const b = await newPage({ dark: true, name: 'toi-loc' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  await chooseFile(b, () => b.click('#btn-pick'), sample.cong.file);
  await waitView(b, 'crop');
  await b.waitForFunction(() => !document.querySelector('#crop-next').disabled, { timeout: 30000 });
  await b.click('#crop-next'); await waitView(b, 'filter');
  await b.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 60000 });
  await sleep(2000);
  await shot(b, '65-loc-toi-nan-phang');
  const a = await auditUi(b, 'bộ lọc tối');
  await b.__ctx.close();
  const bad = [...a.small.map((x) => 'nút nhỏ ' + x), ...a.font.map((x) => 'chữ nhỏ ' + x)];
  if (bad.length) throw new Error(bad.slice(0, 6).join(' ; '));
  return 'sạch';
}, tp);

// ---- tổng kết ----
const total = report.steps.length, failed = report.steps.filter((s) => !s.ok).length;
const allProblems = problems.filter((p) => !/favicon/.test(p));
report.metrics.stepsTotal = total; report.metrics.stepsFailed = failed; report.metrics.consoleProblems = allProblems.length;
fs.writeFileSync(path.join(SHOTS, 'e2e-office-report.json'), JSON.stringify(report, null, 2));
console.log('\n===== TỔNG KẾT E2E OFFICE =====');
console.log(`Bước: ${total - failed}/${total} đạt`);
console.log(`Lỗi/cảnh báo console: ${allProblems.length}`);
for (const p of allProblems.slice(0, 20)) console.log('  ' + p);
console.log(JSON.stringify(report.metrics, null, 2).slice(0, 4000));
await browser.close();
server.close();
process.exit(failed || allProblems.length ? 1 : 0);
void pathToFileURL;
