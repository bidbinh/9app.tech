// Kiểm thử giao diện thật bằng Chrome (puppeteer-core) với camera giả (file MJPEG là ảnh tài liệu nghiêng) và ảnh mẫu dựng bằng canvas.
// Chạy: node scripts/e2e.js   Ảnh chụp lưu ở shots/, báo cáo ở shots/e2e-report.json.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.js';
import { parsePdf } from '../tests/helpers/pdfparse.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SHOTS = path.join(ROOT, 'shots');
const SAMPLES = path.join(SHOTS, 'samples');
fs.mkdirSync(SAMPLES, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PDFJS = process.env.PDFJS || 'file:///C:/Users/admin/AppData/Local/Temp/tess/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const { default: puppeteer } = await import(PPT);

const port = 9400 + Math.floor(Math.random() * 500);
const server = await startServer(port);
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const URL0 = `${ORIGIN}/scanner/`;
const DL = fs.mkdtempSync(path.join(os.tmpdir(), '9scanner-dl-'));
const udd = fs.mkdtempSync(path.join(os.tmpdir(), '9scanner-chrome-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEXT_LINES = [
  'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
  'Độc lập - Tự do - Hạnh phúc',
  'GIẤY XÁC NHẬN',
  'Tôi tên là Nguyễn Văn An, sinh năm 1985, hiện cư trú tại số 25 đường Lê Lợi, quận 1, thành phố Hồ Chí Minh.',
  'Tôi xin xác nhận đã nhận đầy đủ hồ sơ và giấy tờ liên quan đến việc đăng ký kinh doanh của công ty.',
  'Mọi thông tin trong giấy này là đúng sự thật, tôi xin chịu trách nhiệm trước pháp luật.',
  'Thành phố Hồ Chí Minh, ngày 4 tháng 10 năm 2026',
];

const report = { steps: [], problems: [], metrics: {} };
let problems = report.problems;
function logStep(name, ok, detail) {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}
let lastNew = null;
async function step(name, fn, page) {
  try { const r = await fn(); logStep(name, true, typeof r === 'string' ? r : undefined); return r; } catch (e) {
    logStep(name, false, e.message);
    if (lastNew && lastNew !== page) { try { console.log('   trang phụ:', lastNew.__name, JSON.stringify(await lastNew.evaluate(() => ({ view: window.__scanner.S.view, stack: window.__scanner.S.stack, pages: window.__scanner.S.doc && window.__scanner.S.doc.pages.length })))); await lastNew.screenshot({ path: path.join(SHOTS, 'fail-phu-' + lastNew.__name + '.png') }); } catch (e4) { /* bỏ qua */ } }
    if (page) { try { console.log('   trạng thái:', JSON.stringify(await page.evaluate(() => ({ view: window.__scanner.S.view, stack: window.__scanner.S.stack, hist: history.length })))); } catch (e3) { /* bỏ qua */ } try { await page.screenshot({ path: path.join(SHOTS, `fail-${name.replace(/\W+/g, '_').slice(0, 40)}.png`) }); } catch (e2) { /* bỏ qua */ } }
    return undefined;
  }
}

// ---------- dựng ảnh mẫu bằng canvas trong trình duyệt ----------
async function makeSamples(browser) {
  const page = await browser.newPage();
  await page.goto(URL0 + 'manifest.webmanifest');
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  const defs = {
    'tai-lieu-nghieng': { W: 1600, H: 1200, rot: -11, persp: 0.18, bg: 'wood', shadow: true, scale: 0.8 },
    'tai-lieu-toi': { W: 1600, H: 1200, rot: 6, persp: 0.08, bg: 'dark', shadow: false, scale: 0.84 },
    'camera': { W: 1280, H: 720, rot: -7, persp: 0.12, bg: 'wood', shadow: true, scale: 0.86 },
  };
  const out = {};
  for (const [name, d] of Object.entries(defs)) {
    const r = await page.evaluate(async (d, lines) => {
      const { homography, applyH } = await import('/scanner/js/geom.js');
      // trang phẳng A4 150dpi, chữ tiếng Việt
      const PW = 1240, PH = 1754;
      const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH;
      const pctx = pc.getContext('2d');
      pctx.fillStyle = '#f7f5ef'; pctx.fillRect(0, 0, PW, PH);
      pctx.fillStyle = '#16161c'; pctx.textBaseline = 'top';
      let y = 140;
      const wrap = (t, font, width) => {
        pctx.font = font; const words = t.split(' '); const out = []; let cur = '';
        for (const w of words) { const test = cur ? cur + ' ' + w : w; if (pctx.measureText(test).width > width && cur) { out.push(cur); cur = w; } else cur = test; }
        out.push(cur); return out;
      };
      const drawn = [];
      lines.forEach((t, i) => {
        const head = i < 3;
        const font = (head ? 'bold ' : '') + (head ? '50px' : '42px') + ' Arial, "Segoe UI", sans-serif';
        for (const ln of wrap(t, font, PW - 220)) {
          pctx.font = font;
          const x = head ? (PW - pctx.measureText(ln).width) / 2 : 110;
          pctx.fillText(ln, x, y); y += head ? 84 : 66; drawn.push(ln);
        }
        y += head ? 8 : 26;
      });
      const pd = pctx.getImageData(0, 0, PW, PH);
      // quad đích
      const cx = d.W / 2, cy = d.H / 2, hh = d.H * d.scale / 2, hw = hh * PW / PH;
      const a = d.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const base = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      const dst = base.map(([x, yy], i) => {
        const sx = 1 - d.persp * (i < 2 ? 0.22 : 0), sy = 1 + (i === 1 || i === 2 ? d.persp * 0.05 : 0);
        const px = x * sx, py = yy * sy; return { x: cx + px * ca - py * sa, y: cy + px * sa + py * ca };
      });
      const Hinv = homography(dst, [{ x: 0, y: 0 }, { x: PW, y: 0 }, { x: PW, y: PH }, { x: 0, y: PH }]);
      const sc = document.createElement('canvas'); sc.width = d.W; sc.height = d.H;
      const sctx = sc.getContext('2d'); const img = sctx.createImageData(d.W, d.H);
      const bgc = { wood: [150, 105, 60], dark: [38, 40, 46] }[d.bg];
      let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let yy = 0; yy < d.H; yy++) for (let x = 0; x < d.W; x++) {
        const o = (yy * d.W + x) * 4, p = applyH(Hinv, x + 0.5, yy + 0.5);
        let r, g, b;
        if (p.x >= 0 && p.x < PW - 1 && p.y >= 0 && p.y < PH - 1) {
          const x0 = p.x | 0, y0 = p.y | 0, fx = p.x - x0, fy = p.y - y0;
          const i00 = (y0 * PW + x0) * 4, i10 = i00 + 4, i01 = i00 + PW * 4, i11 = i01 + 4;
          const px = (c) => pd.data[i00 + c] * (1 - fx) * (1 - fy) + pd.data[i10 + c] * fx * (1 - fy) + pd.data[i01 + c] * (1 - fx) * fy + pd.data[i11 + c] * fx * fy;
          r = px(0); g = px(1); b = px(2);
          if (d.shadow) { const k = 1 - 0.4 * Math.max(0, (p.x / PW - 0.4) * 1.7); r *= k; g *= k; b *= k; }
        } else {
          const tex = d.bg === 'wood' ? 1 + 0.12 * Math.sin(yy * 0.2 + Math.sin(x * 0.01) * 4) : 1;
          const grad = 1 + 0.2 * (x / d.W - 0.5); r = bgc[0] * tex * grad; g = bgc[1] * tex * grad; b = bgc[2] * tex * grad;
        }
        const nz = (rnd() - 0.5) * 8;
        img.data[o] = r + nz; img.data[o + 1] = g + nz; img.data[o + 2] = b + nz; img.data[o + 3] = 255;
      }
      sctx.putImageData(img, 0, 0);
      const blob = await new Promise((res) => sc.toBlob(res, 'image/jpeg', 0.9));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { b64: btoa(bin), truth: dst.map((p) => ({ x: p.x / d.W, y: p.y / d.H })), W: d.W, H: d.H, drawn };
    }, d, TEXT_LINES);
    const file = path.join(SAMPLES, name + '.jpg');
    fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
    out[name] = { file, truth: r.truth, W: r.W, H: r.H, drawn: r.drawn };
  }
  // ảnh chân dung giả cho ảnh thẻ
  const portrait = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1600); g.addColorStop(0, '#9ec5e8'); g.addColorStop(1, '#6a96c0');
    x.fillStyle = g; x.fillRect(0, 0, 1200, 1600);
    x.fillStyle = '#35507a'; x.beginPath(); x.ellipse(600, 1500, 420, 360, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#e7b896'; x.beginPath(); x.ellipse(600, 640, 230, 290, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2a1a12'; x.beginPath(); x.ellipse(600, 420, 250, 150, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#222'; x.beginPath(); x.arc(520, 640, 20, 0, 7); x.arc(680, 640, 20, 0, 7); x.fill();
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  });
  fs.writeFileSync(path.join(SAMPLES, 'chan-dung.jpg'), Buffer.from(portrait, 'base64'));
  out.portrait = { file: path.join(SAMPLES, 'chan-dung.jpg') };
  // thẻ có ảnh chân dung, con dấu đỏ lớn, khối xám tối (kiểm tra bộ lọc không làm cháy)
  const card = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 760;
    const x = c.getContext('2d');
    x.fillStyle = '#f1efe8'; x.fillRect(0, 0, 1200, 760);
    x.fillStyle = '#222'; for (let i = 0; i < 9; i++) x.fillRect(520, 70 + i * 50, 420 + (i % 3) * 60, 16);
    x.fillStyle = '#cda078'; x.fillRect(60, 70, 330, 420);
    x.fillStyle = '#231812'; x.fillRect(60, 70, 330, 110);
    x.fillStyle = '#1e1e1e'; x.fillRect(150, 260, 40, 24); x.fillRect(260, 260, 40, 24);
    x.fillStyle = '#c8232a'; x.beginPath(); x.arc(300, 600, 130, 0, 7); x.fill();
    x.fillStyle = '#303030'; x.fillRect(820, 480, 300, 230);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  });
  fs.writeFileSync(path.join(SAMPLES, 'the-co-anh.jpg'), Buffer.from(card, 'base64'));
  out.card = { file: path.join(SAMPLES, 'the-co-anh.jpg') };
  // video giả: lặp khung ảnh camera thành MJPEG
  const frame = fs.readFileSync(out.camera.file);
  fs.writeFileSync(path.join(SAMPLES, 'camera.mjpeg'), Buffer.concat(Array(40).fill(frame)));
  out.mjpeg = path.join(SAMPLES, 'camera.mjpeg');
  await page.close();
  return out;
}

const lev = (a, b) => {
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
};
const normText = (s) => s.replace(/\s+/g, ' ').trim();
const cornerErr = (found, truth) => {
  // so khớp theo thứ tự TL,TR,BR,BL sau khi sắp lại cả hai theo (x+y, x-y)
  const ord = (q) => { const c = q.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 }); const s = q.slice().sort((p, r) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(r.y - c.y, r.x - c.x)); let st = 0, best = 9; s.forEach((p, i) => { if (p.x + p.y < best) { best = p.x + p.y; st = i; } }); return [0, 1, 2, 3].map((i) => s[(st + i) % 4]); };
  return { f: ord(found), t: ord(truth) };
};

// ---------- khởi chạy ----------
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, defaultViewport: null,
  args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const samples = await makeSamples(browser);
await browser.close();

const browser2 = await puppeteer.launch({
  executablePath: CHROME, headless: true, defaultViewport: null,
  args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}2`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${samples.mjpeg}`, '--autoplay-policy=no-user-gesture-required'],
});

async function newPage({ dark = false, view = { width: 390, height: 844 }, mobile = true, name = 'main', ctxOpts } = {}) {
  const ctx = await browser2.createBrowserContext();
  await ctx.overridePermissions(ORIGIN, ['camera', 'clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!(page.__offline)) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure() && r.failure().errorText}`); });
  const bc = await browser2.target().createCDPSession();
  await bc.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, browserContextId: ctx.id });
  page.__ctx = ctx; page.__name = name; page.__opts = ctxOpts; lastNew = page;
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const visible = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); }).catch(() => false);
async function waitVisible(page, sel, timeout = 20000) { await page.waitForFunction((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); }, { timeout }, sel); }
async function clickText(page, text, scope = 'button') {
  const ok = await page.evaluate((text, scope) => {
    const el = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).reverse().find((e) => e.textContent.replace(/\s+/g, ' ').trim() === text);
    if (el) { el.click(); return true; } return false;
  }, text, scope);
  if (!ok) throw new Error(`Không thấy nút “${text}”`);
}
const S = (page, expr) => page.evaluate(`(() => { const S = window.__scanner.S; return ${expr}; })()`);
async function chooseFile(page, clickSel, files) {
  const [fc] = await Promise.all([page.waitForFileChooser({ timeout: 8000 }), page.click(clickSel)]);
  await fc.accept(Array.isArray(files) ? files : [files]);
}
async function waitView(page, v, timeout = 20000) { await page.waitForFunction((v) => window.__scanner && window.__scanner.S.view === v, { timeout }, v); }
async function waitPages(page, n, timeout = 30000) { await page.waitForFunction((n) => window.__scanner.S.doc && window.__scanner.S.doc.pages.length >= n, { timeout }, n); }
async function waitFilterIdle(page) { await page.waitForFunction(() => document.querySelector('#pv-busy').hidden, { timeout: 30000 }); await sleep(120); }

// =====================================================================
const page = await newPage({ name: 'chinh' });
await step('Mở app, không lỗi, tiêu đề và dòng riêng tư', async () => {
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(page, 'home');
  const t = await page.title();
  if (!/9scanner/.test(t)) throw new Error('tiêu đề: ' + t);
  const priv = await page.$eval('.privacy', (e) => e.textContent);
  if (!/không gửi lên máy chủ/.test(priv)) throw new Error('thiếu dòng riêng tư');
  await shot(page, '01-home-trong-sang');
}, page);

await step('Service worker đăng ký và kích hoạt', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await sleep(800);
  const keys = await page.evaluate(async () => (await caches.keys()));
  if (!keys.some((k) => k.startsWith('9scanner-shell'))) throw new Error('chưa có cache vỏ ứng dụng: ' + keys);
  const n = await page.evaluate(async () => (await (await caches.open((await caches.keys()).find((k) => k.startsWith('9scanner-shell')))).keys()).length);
  return `cache vỏ: ${n} tệp`;
}, page);

await step('Manifest và icon tải được', async () => {
  const m = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); const j = await r.json(); const ics = await Promise.all(j.icons.map((i) => fetch(i.src).then((x) => x.status))); return { name: j.short_name, ics }; });
  if (m.ics.some((s) => s !== 200)) throw new Error(JSON.stringify(m));
  return m.name;
}, page);

// ---- Camera: chụp ----
await step('Camera giả: mở camera, có hình, chụp → vào màn chỉnh góc', async () => {
  await page.click('#btn-shoot');
  await waitView(page, 'camera');
  await page.waitForFunction(() => { const v = document.querySelector('#cam-video'); return v && v.videoWidth > 0 && v.readyState >= 2; }, { timeout: 20000 });
  await sleep(500);
  await shot(page, '02-camera');
  await page.click('#cam-shutter');
  await waitView(page, 'crop');
  await page.waitForFunction(() => document.querySelectorAll('.crop-handle').length === 4 && document.querySelector('.crop-poly polygon').getAttribute('points'), { timeout: 20000 });
  await sleep(500);
  await shot(page, '03-chinh-goc-camera');
}, page);

await step('Nhận cạnh trên khung camera: sai số góc so với đáp án', async () => {
  const corners = await S(page, 'S.doc.pages[0].corners');
  const { f, t } = cornerErr(corners, samples.camera.truth);
  const diag = Math.hypot(samples.camera.W, samples.camera.H);
  const errs = f.map((p, i) => Math.hypot((p.x - t[i].x) * samples.camera.W, (p.y - t[i].y) * samples.camera.H) / diag);
  report.metrics.cameraCornerErrPctDiag = { mean: +(100 * errs.reduce((a, b) => a + b, 0) / 4).toFixed(2), max: +(100 * Math.max(...errs)).toFixed(2) };
  const found = await S(page, 'S.doc.pages[0].found');
  if (!found) throw new Error('app báo chưa nhận được khung');
  if (Math.max(...errs) > 0.02) throw new Error('sai số quá lớn ' + errs.map((e) => (e * 100).toFixed(2)));
  return `trung bình ${report.metrics.cameraCornerErrPctDiag.mean}%, lớn nhất ${report.metrics.cameraCornerErrPctDiag.max}% đường chéo`;
}, page);

await step('Kéo một góc bằng tay → đa giác và dữ liệu đổi; Tiếp → bộ lọc', async () => {
  const before = await S(page, 'JSON.stringify(S.doc.pages[0].corners[0])');
  const box = await (await page.$('.crop-handle[data-i="0"]')).boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 14, cy + 10, { steps: 4 });
  const loupe = await visible(page, '.crop-loupe');
  await shot(page, '04-keo-goc-kinh-lup');
  await page.mouse.up();
  await page.click('#crop-next');
  await waitView(page, 'filter');
  const after = await S(page, 'JSON.stringify(S.doc.pages[0].corners[0])');
  if (before === after) throw new Error('góc không đổi sau khi kéo');
  if (!loupe) throw new Error('không thấy kính lúp khi kéo');
}, page);

await step('Bộ lọc: 5 kiểu đều dựng được, chụp từng kiểu', async () => {
  await waitFilterIdle(page);
  const ids = ['Gốc', 'Nền trắng', 'Đen trắng', 'Xám', 'Khử bóng'];
  const nameOf = { 'Gốc': 'goc', 'Nền trắng': 'nen-trang', 'Đen trắng': 'den-trang', 'Xám': 'xam', 'Khử bóng': 'khu-bong' };
  for (const t of ids) {
    await clickText(page, t, '#filter-chips button');
    await waitFilterIdle(page);
    await shot(page, `05-loc-${nameOf[t]}`);
    const on = await page.$eval('#filter-chips .chip.on', (e) => e.textContent);
    if (on !== t) throw new Error('chip không bật: ' + on);
  }
  await clickText(page, 'Nền trắng', '#filter-chips button');
  await waitFilterIdle(page);
}, page);

await step('Xoay trái/phải đổi hướng trang xem trước', async () => {
  const w0 = await page.$eval('#pv-canvas', (c) => [c.width, c.height]);
  await page.click('#f-rotr'); await waitFilterIdle(page);
  const w1 = await page.$eval('#pv-canvas', (c) => [c.width, c.height]);
  if (w0[0] !== w1[1] || w0[1] !== w1[0]) throw new Error(`kích thước không hoán đổi ${w0} -> ${w1}`);
  await page.click('#f-rotl'); await waitFilterIdle(page);
  const rot = await S(page, 'S.doc.pages[0].rot');
  if (rot !== 0) throw new Error('rot=' + rot);
}, page);

await step('Thêm trang từ thư viện (trong camera) → chỉnh góc → lọc → Xong → màn tài liệu 2 trang', async () => {
  await page.click('#f-add');
  await waitView(page, 'camera');
  await chooseFile(page, '#cam-gallery', samples['tai-lieu-nghieng'].file);
  await waitView(page, 'crop');
  await page.waitForFunction(() => window.__scanner.S.doc.pages.length === 2, { timeout: 30000 });
  await sleep(600);
  await shot(page, '06-chinh-goc-thu-vien');
  const c = await S(page, 'S.doc.pages[1].corners');
  const { f, t } = cornerErr(c, samples['tai-lieu-nghieng'].truth);
  const sm = samples['tai-lieu-nghieng'], diag = Math.hypot(sm.W, sm.H);
  const errs = f.map((p, i) => Math.hypot((p.x - t[i].x) * sm.W, (p.y - t[i].y) * sm.H) / diag);
  report.metrics.galleryTiltedCornerErrPctDiag = { mean: +(100 * errs.reduce((a, b) => a + b, 0) / 4).toFixed(2), max: +(100 * Math.max(...errs)).toFixed(2) };
  await page.click('#crop-next'); await waitView(page, 'filter'); await waitFilterIdle(page);
  await page.click('#f-done'); await waitView(page, 'doc');
  await page.waitForFunction(() => [...document.querySelectorAll('#page-grid .pic')].every((p) => p.style.backgroundImage), { timeout: 30000 });
  await shot(page, '07-tai-lieu-2-trang');
  const n = await page.$$eval('#page-grid .pg', (l) => l.length);
  if (n !== 2) throw new Error('số trang ' + n);
  return `ảnh nghiêng từ thư viện: sai số trung bình ${report.metrics.galleryTiltedCornerErrPctDiag.mean}%, lớn nhất ${report.metrics.galleryTiltedCornerErrPctDiag.max}%`;
}, page);

await step('Sắp xếp lại: đưa trang 2 lên trước', async () => {
  const idsBefore = await S(page, 'S.doc.pages.map((p) => p.id)');
  await page.click('#page-grid .pg:nth-child(2) .acts button:nth-child(1)');
  await sleep(300);
  const idsAfter = await S(page, 'S.doc.pages.map((p) => p.id)');
  if (idsAfter[0] !== idsBefore[1] || idsAfter[1] !== idsBefore[0]) throw new Error('thứ tự không đổi');
  await page.click('#page-grid .pg:nth-child(1) .acts button:nth-child(3)');
  await sleep(300);
  const ids3 = await S(page, 'S.doc.pages.map((p) => p.id)');
  if (ids3[0] !== idsBefore[0]) throw new Error('đưa lại không đúng');
}, page);

await step('Nút Back của trình duyệt/Android: bộ lọc → tài liệu → (Back) về kho', async () => {
  await page.click('#page-grid .pg:nth-child(1) .pic');
  await waitView(page, 'filter'); await waitFilterIdle(page);
  await page.goBack();
  await waitView(page, 'doc');
  await page.goBack();
  await waitView(page, 'filter');
  await page.goForward();
  await waitView(page, 'doc');
}, page);

// ---- Chữ ký ----
await step('Ký tay: vẽ, lưu, chèn vào trang, kéo vị trí', async () => {
  await page.click('#page-grid .pg:nth-child(1) .pic');
  await waitView(page, 'filter'); await waitFilterIdle(page);
  await page.click('#f-sign');
  await sleep(200);
  await clickText(page, 'Vẽ chữ ký mới', 'button');
  await waitView(page, 'sign');
  await sleep(400);
  const b = await (await page.$('#sign-pad')).boundingBox();
  const stroke = async (pts) => { await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 6 }); await page.mouse.up(); };
  const x0 = b.x + b.width * 0.15, y0 = b.y + b.height * 0.55;
  await stroke([[x0, y0], [x0 + 40, y0 - 70], [x0 + 80, y0 + 30], [x0 + 120, y0 - 60], [x0 + 170, y0 + 20], [x0 + 230, y0 - 20]]);
  await stroke([[x0 + 20, y0 + 40], [x0 + 250, y0 + 30]]);
  await shot(page, '08-ve-chu-ky');
  await page.click('#sign-save');
  await waitView(page, 'filter');
  await page.waitForSelector('.sign-ov', { timeout: 8000 });
  const o = await (await page.$('.sign-ov')).boundingBox();
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2); await page.mouse.down(); await page.mouse.move(o.x + o.width / 2 - 70, o.y + o.height / 2 - 120, { steps: 5 }); await page.mouse.up();
  const sg = await S(page, 'JSON.stringify(S.doc.pages[0].signs)');
  const cx = JSON.parse(sg)[0].cx;
  if (!(cx < 0.7)) throw new Error('kéo không đổi vị trí: ' + sg);
  await shot(page, '09-chen-chu-ky');
  const nsig = await page.evaluate(async () => (await window.__scanner.S.store.listSigs()).length);
  if (nsig !== 1) throw new Error('số chữ ký lưu ' + nsig);
}, page);

await step('Về tài liệu, ảnh thu nhỏ trang 1 có chữ ký (khác trước)', async () => {
  await page.click('#f-done'); await waitView(page, 'doc');
  await page.waitForFunction(() => [...document.querySelectorAll('#page-grid .pic')].every((p) => p.style.backgroundImage), { timeout: 20000 });
  await shot(page, '10-tai-lieu-co-chu-ky');
}, page);

// ---- Xuất PDF ----
async function waitResult(p, timeout = 90000) {
  await p.waitForFunction(() => { const r = document.querySelector('.modal .result'); return r && /KB|MB|B\b/.test(r.textContent) && !/Đang/.test(r.textContent) && !document.querySelector('.modal .actions button[disabled]'); }, { timeout });
  return page.$eval('.modal .result', (e) => e.textContent);
}
function latestDownload(before) {
  const files = fs.readdirSync(DL).filter((f) => !f.endsWith('.crdownload')).map((f) => ({ f, t: fs.statSync(path.join(DL, f)).mtimeMs })).filter((x) => !before.has(x.f) || x.t > before.get(x.f)).sort((a, b) => b.t - a.t);
  return files[0] && path.join(DL, files[0].f);
}
async function waitDownload(before, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const f = latestDownload(before); if (f) { await sleep(300); return f; } await sleep(200); }
  throw new Error('không thấy tệp tải về');
}
// xóa sạch thư mục tải về trước mỗi lần bấm để tệp mới luôn nhận diện được (Chrome ghi đè tệp trùng tên)
const listDl = () => { for (const f of fs.readdirSync(DL)) { try { fs.unlinkSync(path.join(DL, f)); } catch (e) { /* bỏ qua */ } } return new Map(); };

await step('Xuất PDF mặc định (A4, Chuẩn): 2 trang, cấu trúc hợp lệ', async () => {
  await page.click('#doc-export');
  await sleep(300);
  await shot(page, '11-xuat-sheet');
  const txt = await waitResult(page);
  const before = listDl();
  await clickText(page, 'Tải về', '.modal button');
  const file = await waitDownload(before);
  const bytes = fs.readFileSync(file);
  const pdf = parsePdf(bytes);
  if (pdf.pages.length !== 2) throw new Error('số trang PDF ' + pdf.pages.length);
  report.metrics.pdfDefaultBytes = bytes.length;
  if (Math.round(pdf.pages[0].mediaBox[0]) !== 595 || Math.round(pdf.pages[0].mediaBox[1]) !== 842) throw new Error('khổ không phải A4');
  await shot(page, '12-xuat-xong');
  return `${txt.trim()} · tệp ${bytes.length} byte, ${pdf.pages.length} trang, ảnh ${pdf.pages[0].imgW}x${pdf.pages[0].imgH}`;
}, page);

await step('Xuất PDF giới hạn dung lượng 150 KB: tệp thật nhỏ hơn giới hạn', async () => {
  await clickText(page, 'Giới hạn', '.modal .seg button');
  await page.$eval('.modal .limit-row input', (i) => { i.value = ''; });
  await page.type('.modal .limit-row input', '150 KB');
  await sleep(500);
  const txt = await waitResult(page);
  const before = listDl();
  await clickText(page, 'Tải về', '.modal button');
  const file = await waitDownload(before);
  const bytes = fs.readFileSync(file);
  const pdf = parsePdf(bytes);
  report.metrics.pdfLimit150KB = bytes.length;
  await shot(page, '13-xuat-gioi-han');
  if (bytes.length > 153600 * 0.97) throw new Error(`tệp ${bytes.length} > 97% của 153600`);
  if (bytes.length < 150 * 1024 * 0.3) throw new Error(`nén thừa: ${bytes.length}`);
  return `${bytes.length} byte (${Math.round(100 * bytes.length / 153600)}% giới hạn), ${pdf.pages.length} trang, ảnh ${pdf.pages[0].imgW}x${pdf.pages[0].imgH}`;
}, page);

await step('Chia sẻ (Web Share API giả lập): gọi share với tệp PDF đúng loại', async () => {
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = d.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); }; });
  await clickText(page, 'Giới hạn', '.modal .seg button');
  await page.$eval('.modal .limit-row input', (i) => { i.value = ''; });
  await page.type('.modal .limit-row input', '150 KB');
  await sleep(500);
  await waitResult(page);
  await clickText(page, 'Chia sẻ', '.modal button');
  await sleep(500);
  const sh = await page.evaluate(() => window.__shared);
  if (!sh || sh[0].type !== 'application/pdf' || !/.pdf$/.test(sh[0].name)) throw new Error('share: ' + JSON.stringify(sh));
  await page.evaluate(() => { delete navigator.canShare; delete navigator.share; });
  return sh[0].name + ' ' + sh[0].size + ' byte';
}, page);

await step('Xuất giới hạn 100/60/30 KB cũng đạt (nén thật sự)', async () => {
  const out = [];
  for (const [txtLim, lim] of [['100 KB', 102400], ['60 KB', 61440], ['30 KB', 30720]].map(([a, b]) => [a, Math.floor(b * 0.97)])) {
    await page.$eval('.modal .limit-row input', (i) => { i.value = ''; });
    await page.type('.modal .limit-row input', txtLim);
    await sleep(500);
    await waitResult(page);
    const before = listDl();
    await clickText(page, 'Tải về', '.modal button');
    const file = await waitDownload(before);
    const bytes = fs.readFileSync(file);
    parsePdf(bytes);
    if (bytes.length > lim) throw new Error(`${txtLim}: ${bytes.length}`);
    out.push(`${txtLim}: ${bytes.length}`);
  }
  return out.join('; ');
}, page);

await step('Xuất ảnh JPG: tệp là JPEG hợp lệ', async () => {
  await clickText(page, 'Ảnh JPG', '.modal .seg button');
  await clickText(page, 'Chuẩn', '.modal .seg button');
  await sleep(500);
  await waitResult(page);
  const before = listDl();
  await clickText(page, 'Tải về', '.modal button');
  const f = await waitDownload(before);
  await sleep(600);
  const files = fs.readdirSync(DL).filter((x) => x.endsWith('.jpg') && (!before.has(x) || fs.statSync(path.join(DL, x)).mtimeMs > before.get(x)));
  if (files.length < 1) throw new Error('không có jpg');
  const b = fs.readFileSync(path.join(DL, files[0]));
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('không phải JPEG');
  void f;
  return `${files.length} tệp jpg`;
}, page);

// đóng sheet
await page.evaluate(() => document.querySelector('.modal') && document.querySelector('.modal').remove());

// ---- OCR ----
await step('OCR tiếng Việt trên ảnh chụp nghiêng: chạy, có tiến trình, đo độ chính xác', async () => {
  // dùng tài liệu 2 trang; trang đầu là ảnh camera (cảnh khác nội dung?) — cả hai đều chứa cùng văn bản
  await page.click('#doc-ocr');
  await waitView(page, 'ocr');
  await page.waitForFunction(() => !document.querySelector('#ocr-prog').hidden, { timeout: 5000 }).catch(() => {});
  const t0 = Date.now();
  let sawProgress = false;
  const poll = setInterval(async () => { try { const w = await page.$eval('#ocr-bar', (e) => e.style.width); if (w && w !== '0%') sawProgress = true; } catch (e) { /* bỏ qua */ } }, 400);
  await page.waitForFunction(() => document.querySelector('#ocr-prog').hidden && document.querySelector('#ocr-text').value.length > 20, { timeout: 240000 });
  clearInterval(poll);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const text = await page.$eval('#ocr-text', (e) => e.value);
  await shot(page, '14-ocr');
  const truth = normText(samples['tai-lieu-nghieng'].drawn.join(' '));
  const parts = text.split(/--- Trang \d+ ---/).map(normText).filter(Boolean);
  const res = parts.map((p) => { const d = lev(p, truth); return +(100 * d / truth.length).toFixed(1); });
  report.metrics.ocr = { pages: parts.length, cerPct: res, seconds: +secs, sawProgress, sample: parts[1] ? parts[1].slice(0, 160) : parts[0].slice(0, 160) };
  if (!sawProgress) throw new Error('không thấy thanh tiến trình chạy');
  if (Math.min(...res) > 25) throw new Error('CER quá cao: ' + res);
  return `CER mỗi trang: ${res.join('%, ')}% (đối chiếu văn bản gốc ${truth.length} ký tự), ${secs}s cho 2 trang`;
}, page);

await step('PDF có lớp chữ OCR: parse hợp lệ và trích được chữ tiếng Việt', async () => {
  await page.click('#v-ocr [data-back]');
  await waitView(page, 'doc');
  await page.click('#doc-export');
  await sleep(400);
  await clickText(page, 'Chuẩn', '.modal .seg button');
  await page.$eval('#exp-ocr', (c) => c.click());
  await sleep(500);
  const txt = await waitResult(page, 180000);
  const before = listDl();
  await clickText(page, 'Tải về', '.modal button');
  const file = await waitDownload(before);
  const bytes = fs.readFileSync(file);
  fs.mkdirSync(path.join(SAMPLES, 'out'), { recursive: true });
  fs.copyFileSync(file, path.join(SAMPLES, 'out', 'xuat-co-lop-chu.pdf'));
  const pdf = parsePdf(bytes);
  const hasLayer = pdf.pages.every((p) => /3 Tr/.test(p.content));
  if (!hasLayer) throw new Error('thiếu lớp chữ');
  let extracted = '';
  try {
    const pdfjs = await import(PDFJS);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 }).promise;
    for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const tc = await p.getTextContent(); extracted += tc.items.map((it) => it.str).join(' ') + '\n'; }
    report.metrics.pdfjsOpened = true;
  } catch (e) { report.metrics.pdfjsOpened = 'lỗi: ' + e.message.slice(0, 120); }
  report.metrics.pdfTextLayerBytes = bytes.length;
  const hit = ['CỘNG', 'HÒA', 'Nguyễn', 'Hồ', 'Chí', 'Minh', 'xác', 'nhận'].filter((w) => extracted.includes(w));
  if (extracted && hit.length < 4) throw new Error('trích chữ từ PDF thiếu: ' + extracted.slice(0, 120));
  await page.evaluate(() => document.querySelector('.modal') && document.querySelector('.modal').remove());
  return `${txt.trim().slice(0, 40)} · pdf.js ${report.metrics.pdfjsOpened === true ? 'mở được, trích ' + hit.length + '/8 từ khóa: ' + hit.join(',') : report.metrics.pdfjsOpened}`;
}, page);

// ---- Kho: lưu & tải lại ----
await step('Kho tài liệu: đổi tên, về Kho thấy tài liệu, tải lại trang vẫn còn (IndexedDB)', async () => {
  await page.click('#doc-name');
  await sleep(200);
  await page.$eval('.modal input', (i) => { i.value = 'Giấy xác nhận thử'; });
  await clickText(page, 'Lưu', '.modal button');
  await sleep(300);
  await page.click('#v-doc [data-back]');
  await waitView(page, 'home');
  await page.waitForSelector('.doc', { timeout: 8000 });
  await shot(page, '15-kho-co-tai-lieu');
  await page.reload({ waitUntil: 'networkidle0' });
  await waitView(page, 'home');
  await page.waitForSelector('.doc .nm', { timeout: 8000 });
  const name = await page.$eval('.doc .nm', (e) => e.textContent);
  if (name !== 'Giấy xác nhận thử') throw new Error('tên: ' + name);
  const meta = await page.$eval('.doc .meta', (e) => e.textContent);
  await page.click('.doc');
  await waitView(page, 'doc');
  await page.waitForFunction(() => window.__scanner.S.doc && window.__scanner.S.doc.pages.length === 2, { timeout: 8000 });
  const hasOcr = await S(page, 'S.doc.pages.every((p) => p.ocr && p.ocr.words.length > 5)');
  const hasSign = await S(page, 'S.doc.pages.some((p) => p.signs && p.signs.length)');
  if (!hasSign) throw new Error('mất chữ ký sau khi tải lại');
  return `${meta}; OCR lưu kèm: ${hasOcr}`;
}, page);

await step('Thư mục: tạo thư mục, chuyển tài liệu vào, lọc theo thư mục', async () => {
  await page.click('#v-doc [data-back]');
  await waitView(page, 'home');
  await page.click('[aria-label="Thêm thư mục"]');
  await sleep(200);
  await page.$eval('.modal input', (i) => { i.value = 'Hồ sơ nhà'; });
  await clickText(page, 'Tạo', '.modal button');
  await sleep(500);
  // đang ở thư mục mới (trống)
  const emptyNow = await page.$$eval('.doc', (l) => l.length);
  if (emptyNow !== 0) throw new Error('thư mục mới phải trống');
  await clickText(page, 'Tất cả', '.fchip');
  await sleep(400);
  await page.click('.doc .more');
  await sleep(200);
  await clickText(page, 'Chuyển thư mục', '.modal button');
  await sleep(200);
  await clickText(page, 'Hồ sơ nhà', '.modal button');
  await sleep(500);
  await clickText(page, 'Hồ sơ nhà', '.fchip');
  await sleep(400);
  const n = await page.$$eval('.doc', (l) => l.length);
  if (n !== 1) throw new Error('lọc thư mục: ' + n);
  await shot(page, '16-thu-muc');
}, page);

// ---- Ảnh thẻ ----
await step('Ảnh thẻ 3x4: cắt, ghép tờ 10x15, tải JPG đúng kích thước và PDF', async () => {
  await page.click('#btn-home-id');
  await waitView(page, 'id');
  await shot(page, '17-anh-the-trong');
  await chooseFile(page, '#id-pick', samples.portrait.file);
  await waitVisible(page, '#id-frame');
  await sleep(500);
  await shot(page, '18-anh-the-khung');
  await page.$eval('#id-zoom', (z) => { z.value = '1.6'; z.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(300);
  const st = await page.$('#id-stage'); const b = await st.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 30, { steps: 4 }); await page.mouse.up();
  await sleep(300);
  const count = await page.$eval('#id-copies-label', (e) => e.textContent);
  const dims = await page.$eval('#id-sheet-canvas', (c) => [c.width, c.height]);
  if (dims[0] !== 1181 || dims[1] !== 1772) throw new Error('kích thước tờ ' + dims);
  await shot(page, '19-anh-the-to-in');
  const before = listDl();
  await page.click('#id-dl-jpg');
  const jf = await waitDownload(before);
  const jb = fs.readFileSync(jf);
  if (jb[0] !== 0xff || jb[1] !== 0xd8) throw new Error('ảnh tải về không phải JPEG');
  // đọc kích thước JPEG (SOF0/2)
  if (jb[13] !== 1 || ((jb[14] << 8) | jb[15]) !== 300 || ((jb[16] << 8) | jb[17]) !== 300) throw new Error('JPG ảnh thẻ thiếu JFIF 300 dpi: ' + [...jb.slice(13, 18)]);
  let w = 0, h = 0;
  for (let i = 2; i < jb.length - 9;) { if (jb[i] !== 0xff) { i++; continue; } const m = jb[i + 1]; if (m >= 0xc0 && m <= 0xc3) { h = jb.readUInt16BE(i + 5); w = jb.readUInt16BE(i + 7); break; } i += 2 + jb.readUInt16BE(i + 2); }
  if (w !== 1181 || h !== 1772) throw new Error(`JPEG ${w}x${h}`);
  const before2 = listDl();
  await page.click('#id-dl-pdf');
  const pf = await waitDownload(before2);
  const pdf = parsePdf(fs.readFileSync(pf));
  const mm = pdf.pages[0].mediaBox.map((v) => +(v / 72 * 25.4).toFixed(1));
  if (Math.abs(mm[0] - 100) > 0.3 || Math.abs(mm[1] - 150) > 0.3) throw new Error('khổ PDF mm ' + mm);
  return `${count}; JPEG ${w}x${h} (300dpi, 10x15cm); PDF ${mm[0]}x${mm[1]} mm`;
}, page);

await step('Ảnh thẻ 4x6 trên A4', async () => {
  await clickText(page, '4x6 cm', '#id-size button');
  await clickText(page, 'Giấy A4', '#id-sheet button');
  await sleep(500);
  const dims = await page.$eval('#id-sheet-canvas', (c) => [c.width, c.height]);
  if (dims[0] !== 2480 || dims[1] !== 3508) throw new Error('kích thước A4 ' + dims);
  await shot(page, '20-anh-the-4x6-a4');
  return await page.$eval('#id-copies-label', (e) => e.textContent);
}, page);

// ---- Giao diện: tối, desktop ----
await step('Chụp giao diện chế độ tối (390x844) các màn hình chính', async () => {
  const d = await newPage({ dark: true, name: 'toi' });
  await d.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(d, 'home');
  await shot(d, '21-toi-home');
  await d.evaluate(async () => { await window.__scanner.S.store.listDocs(); });
  await chooseFile(d, '#btn-pick', [samples['tai-lieu-toi'].file, samples['tai-lieu-nghieng'].file]);
  await waitView(d, 'doc', 60000);
  await d.waitForFunction(() => [...document.querySelectorAll('#page-grid .pic')].every((p) => p.style.backgroundImage), { timeout: 30000 });
  await shot(d, '22-toi-tai-lieu');
  await d.click('#page-grid .pg:nth-child(1) .pic');
  await waitView(d, 'filter'); await waitFilterIdle(d);
  await shot(d, '23-toi-loc');
  await d.click('#f-crop'); await waitView(d, 'crop'); await sleep(600);
  await shot(d, '24-toi-chinh-goc');
  const f = await S(d, 'S.doc.pages.map((p) => p.found)');
  const c = await S(d, 'S.doc.pages[0].corners');
  const sm = samples['tai-lieu-toi'], { f: ff, t } = cornerErr(c, sm.truth), diag = Math.hypot(sm.W, sm.H);
  const errs = ff.map((p, i) => Math.hypot((p.x - t[i].x) * sm.W, (p.y - t[i].y) * sm.H) / diag);
  report.metrics.darkBgCornerErrPctDiag = { mean: +(100 * errs.reduce((a, b) => a + b, 0) / 4).toFixed(2), max: +(100 * Math.max(...errs)).toFixed(2) };
  await d.click('#crop-next'); await waitView(d, 'filter'); await waitFilterIdle(d);
  await d.click('#f-sign'); await sleep(300);
  await shot(d, '25-toi-chon-chu-ky');
  await d.evaluate(() => document.querySelector('.modal') && document.querySelector('.modal').remove());
  await d.click('#f-done'); await waitView(d, 'doc');
  await d.click('#doc-export'); await sleep(2500);
  await shot(d, '26-toi-xuat');
  await d.__ctx.close();
  return `found=${f}; nền tối sai số trung bình ${report.metrics.darkBgCornerErrPctDiag.mean}%`;
}, page);

await step('Chụp giao diện desktop 1280x800', async () => {
  const dk = await newPage({ view: { width: 1280, height: 800 }, mobile: false, name: 'desktop' });
  await dk.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(dk, 'home');
  await shot(dk, '27-desktop-home');
  await chooseFile(dk, '#btn-pick', samples['tai-lieu-nghieng'].file);
  await waitView(dk, 'crop', 30000); await sleep(800);
  await shot(dk, '28-desktop-chinh-goc');
  await dk.click('#crop-next'); await waitView(dk, 'filter'); await waitFilterIdle(dk);
  await shot(dk, '29-desktop-loc');
  await dk.click('#f-done'); await waitView(dk, 'doc'); await sleep(800);
  await shot(dk, '30-desktop-tai-lieu');
  await dk.__ctx.close();
}, page);

await step('Ngoại tuyến: sau lần đầu, tải lại khi mất mạng vẫn mở được app và kho', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  page.__offline = true;
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitView(page, 'home');
  await page.waitForSelector('.doc', { timeout: 8000 });
  await shot(page, '31-ngoai-tuyen');
  // OCR đã dùng nên dữ liệu vendor cũng nằm trong cache
  const hasVendor = await page.evaluate(async () => { const k = (await caches.keys()).find((x) => x.includes('vendor')); if (!k) return 0; return (await (await caches.open(k)).keys()).length; });
  await page.setOfflineMode(false);
  page.__offline = false;
  return `kho hiển thị khi offline; cache OCR: ${hasVendor} tệp`;
}, page);

await step('Ngoại tuyến + OCR: chạy lại đọc chữ khi mất mạng', async () => {
  page.__offline = true;
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitView(page, 'home');
  await page.waitForSelector('.doc');
  await page.click('.doc'); await waitView(page, 'doc');
  // xóa kết quả OCR đã nhớ để buộc đọc lại
  await page.evaluate(() => { for (const p of window.__scanner.S.doc.pages) p.ocr = null; });
  await page.click('#doc-ocr');
  await waitView(page, 'ocr');
  await page.waitForFunction(() => document.querySelector('#ocr-prog').hidden && document.querySelector('#ocr-text').value.length > 20, { timeout: 240000 });
  const len = await page.$eval('#ocr-text', (e) => e.value.length);
  await page.setOfflineMode(false);
  page.__offline = false;
  return `OCR offline ra ${len} ký tự`;
}, page);

await step('IndexedDB bị chặn: app vẫn chạy, báo rõ, tài liệu giữ trong phiên', async () => {
  const b = await newPage({ name: 'idb-chan' });
  b.__dbg = true;
  await b.evaluateOnNewDocument(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('bị chặn'); } }); });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  const banner = await b.$eval('#storage-banner', (e) => e.hidden ? '' : e.textContent);
  if (!/chặn lưu trữ/.test(banner)) throw new Error('thiếu cảnh báo: ' + banner);
  await chooseFile(b, '#btn-pick', samples['tai-lieu-toi'].file);
  await waitView(b, 'crop', 30000);
  await b.waitForFunction(() => !document.querySelector('#crop-next').disabled, { timeout: 15000 });
  await b.click('#crop-next'); await waitView(b, 'filter');
  await b.click('#f-done'); await waitView(b, 'doc');
  await shot(b, '32-idb-chan');
  await b.__ctx.close();
  return banner;
}, page);

await step('Giới hạn 30/60/100/150/200 KB với 5 trang: tệp thật <= giới hạn x 1024 (hoặc app báo không đạt, không cho tải)', async () => {
  const b = await newPage({ name: 'gioi-han-nhieu-trang' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  const f1 = samples['tai-lieu-toi'].file, f2 = samples['tai-lieu-nghieng'].file;
  await chooseFile(b, '#btn-pick', [f1, f2, f1, f2, f1]);
  await waitView(b, 'doc', 90000);
  await b.waitForFunction(() => window.__scanner.S.doc.pages.length === 5 && [...document.querySelectorAll('#page-grid .pic')].every((p) => p.style.backgroundImage), { timeout: 60000 });
  await b.click('#doc-export'); await sleep(300);
  await clickText(b, 'Giới hạn', '.modal .seg button');
  await b.$eval('.modal .limit-row input', (i) => { i.value = ''; });
  await b.type('.modal .limit-row input', '2 KB'); await sleep(700);
  const small = await b.$eval('.modal .result', (e) => ({ bad: e.classList.contains('bad'), t: e.textContent }));
  if (!small.bad || !/5 KB/.test(small.t)) throw new Error('giới hạn 2 KB phải bị từ chối: ' + small.t);
  const out = [];
  for (const kb of [200, 150, 100, 60, 30]) {
    await b.$eval('.modal .limit-row input', (i) => { i.value = ''; });
    await b.type('.modal .limit-row input', kb + ' KB');
    await sleep(600);
    await b.waitForFunction(() => { const r = document.querySelector('.modal .result'); return r && !/Đang/.test(r.textContent); }, { timeout: 120000 });
    const bad = await b.$eval('.modal .result', (e) => e.classList.contains('bad'));
    const dlDisabled = await b.$eval('.modal .actions button', (e) => e.disabled);
    if (bad) { if (!dlDisabled) throw new Error(kb + ' KB: báo không đạt nhưng vẫn cho tải'); out.push(kb + 'KB: báo không đạt'); continue; }
    const before = listDl();
    await clickText(b, 'Tải về', '.modal button');
    const file = await waitDownload(before);
    const bytes = fs.readFileSync(file);
    parsePdf(bytes);
    if (bytes.length > kb * 1024) throw new Error(kb + ' KB: tệp ' + bytes.length + ' > ' + kb * 1024);
    out.push(kb + 'KB: ' + bytes.length);
  }
  report.metrics.limit5Pages = out;
  await b.__ctx.close();
  return out.join('; ');
}, page);

await step('Bộ lọc không làm cháy thẻ có ảnh/con dấu/khối tối; mặc định Khử bóng; có cảnh báo', async () => {
  const b = await newPage({ name: 'the-co-anh' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  await chooseFile(b, '#btn-pick', samples.card.file);
  await waitView(b, 'crop', 30000);
  await b.waitForFunction(() => !document.querySelector('#crop-next').disabled, { timeout: 15000 });
  await b.click('#crop-full');
  await b.click('#crop-next'); await waitView(b, 'filter'); await waitFilterIdle(b);
  const def = await S(b, 'S.doc.pages[0].filter');
  if (def !== 'deshadow') throw new Error('mặc định ' + def);
  const px = async () => b.evaluate(() => {
    const c = document.querySelector('#pv-canvas'), x = c.getContext('2d');
    const at = (fx, fy) => { const d = x.getImageData(Math.round(fx * c.width), Math.round(fy * c.height), 1, 1).data; return [d[0], d[1], d[2]]; };
    return { dark: at(0.84, 0.78), stamp: at(0.25, 0.79), skin: at(0.2, 0.5), hair: at(0.2, 0.15), paper: at(0.5, 0.95) };
  });
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const out = {};
  for (const f of ['Khử bóng', 'Nền trắng']) {
    await clickText(b, f, '#filter-chips button'); await waitFilterIdle(b);
    const p = await px(); out[f] = p;
    if (lum(p.dark) > 95) throw new Error(f + ': khối xám tối bị cháy ' + p.dark);
    if (!(p.stamp[0] - p.stamp[1] > 80)) throw new Error(f + ': con dấu mất màu đỏ ' + p.stamp);
    if (!(lum(p.skin) - lum(p.hair) > 60)) throw new Error(f + ': ảnh mất chi tiết ' + p.skin + ' ' + p.hair);
  }
  const warn = await b.$eval('#filter-hint', (e) => ({ t: e.textContent, w: e.classList.contains('warn') }));
  if (!warn.w || !/ảnh hoặc mảng màu/.test(warn.t)) throw new Error('thiếu cảnh báo trang có ảnh khi dùng Nền trắng: ' + warn.t);
  await shot(b, '35-the-co-anh-nen-trang');
  await clickText(b, 'Đen trắng', '#filter-chips button'); await waitFilterIdle(b);
  const bw = await b.$eval('#filter-hint', (e) => e.classList.contains('warn'));
  if (!bw) throw new Error('Đen trắng thiếu cảnh báo');
  await b.__ctx.close();
  return 'khối tối ' + out['Nền trắng'].dark + ', con dấu ' + out['Nền trắng'].stamp;
}, page);

await step('Xoay trang giữ chữ ký (không xóa), xoay lại về chỗ cũ', async () => {
  await page.evaluate(() => window.__scanner.navTo('doc'));
  await waitView(page, 'doc');
  await page.click('#page-grid .pg:nth-child(1) .pic');
  await waitView(page, 'filter'); await waitFilterIdle(page);
  const s0 = await S(page, 'JSON.stringify(S.doc.pages[0].signs)');
  if (!JSON.parse(s0).length) throw new Error('trang chưa có chữ ký để thử');
  await page.click('#f-rotr'); await waitFilterIdle(page);
  const s1 = JSON.parse(await S(page, 'JSON.stringify(S.doc.pages[0].signs)'));
  if (s1.length !== 1) throw new Error('chữ ký bị xóa khi xoay');
  await page.click('#f-rotl'); await waitFilterIdle(page);
  const s2 = JSON.parse(await S(page, 'JSON.stringify(S.doc.pages[0].signs)'));
  const o = JSON.parse(s0)[0];
  if (Math.abs(s2[0].cx - o.cx) > 0.02 || Math.abs(s2[0].cy - o.cy) > 0.02) throw new Error('xoay đi rồi xoay lại không về chỗ cũ');
}, page);

await step('Lưu lỗi thì tập dirty được khôi phục (không mất thay đổi chưa lưu)', async () => {
  const r = await page.evaluate(async () => {
    const A = window.__scanner, st = A.S.store, orig = st.saveDoc.bind(st);
    A.S.dirty.add(A.S.doc.pages[0].id);
    st.saveDoc = async () => { throw new Error('giả lập lỗi ghi'); };
    await A.saveNow();
    const kept = A.S.dirty.size;
    st.saveDoc = orig;
    await A.saveNow();
    return { kept, after: A.S.dirty.size };
  });
  if (r.kept < 1 || r.after !== 0) throw new Error(JSON.stringify(r));
}, page);

await step('Bảng chữ ký: xoay màn hình dọc → ngang → dọc vẫn vẽ lại đúng, không mất nét', async () => {
  const b = await newPage({ name: 'xoay-chu-ky' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await b.click('#btn-home-sign'); await waitView(b, 'sign'); await sleep(400);
  const box = await (await b.$('#sign-pad')).boundingBox();
  await b.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5); await b.mouse.down();
  for (let i = 1; i <= 12; i++) await b.mouse.move(box.x + box.width * (0.1 + i * 0.07), box.y + box.height * (0.5 + 0.2 * Math.sin(i)), { steps: 2 });
  await b.mouse.up();
  const bbox = () => b.evaluate(() => {
    const c = document.querySelector('#sign-pad'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, x1 = 0, n = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    return { w: c.width, h: c.height, x0, x1, n };
  });
  const a = await bbox();
  await b.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(600);
  const l = await bbox();
  await b.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(600);
  const p = await bbox();
  await b.__ctx.close();
  if (a.n < 200 || l.n < 200 || p.n < 200) throw new Error('mất nét: ' + [a.n, l.n, p.n]);
  if (l.x1 > l.w || p.x1 > p.w * 0.99) throw new Error('nét tràn khỏi bảng ' + JSON.stringify({ l, p }));
  // tỉ lệ rộng/cao của nét phải giữ nguyên giữa hai lần dọc
  const r1 = (a.x1 - a.x0) / a.h, r2 = (p.x1 - p.x0) / p.h;
  if (Math.abs(r1 - r2) / r1 > 0.12) throw new Error('hình dạng nét đổi: ' + r1 + ' vs ' + r2);
  return 'nét còn nguyên sau xoay (' + a.n + '/' + l.n + '/' + p.n + ' điểm)';
}, page);

await step('Camera bị ngắt giữa chừng: tự mở lại; quyền bị thu hồi: báo rõ', async () => {
  const b = await newPage({ name: 'camera-ngat' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await b.click('#btn-shoot'); await waitView(b, 'camera');
  await b.waitForFunction(() => document.querySelector('#cam-video').videoWidth > 0, { timeout: 20000 });
  await b.evaluate(() => { window.__old = window.__scanner.S.cam.stream; window.__scanner.S.cam.stream.getVideoTracks()[0].dispatchEvent(new Event('ended')); });
  await b.waitForFunction(() => window.__scanner.S.cam && window.__scanner.S.cam.stream && window.__scanner.S.cam.stream !== window.__old && document.querySelector('#cam-video').videoWidth > 0, { timeout: 15000 });
  // thu hồi quyền: getUserMedia từ chối
  await b.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); window.__scanner.S.cam.stream.getVideoTracks()[0].dispatchEvent(new Event('ended')); });
  await b.waitForFunction(() => /quyền camera/.test(document.querySelector('#cam-msg-text').textContent) && !document.querySelector('#cam-msg').hidden, { timeout: 15000 });
  await b.__ctx.close();
}, page);

await step('Xóa trang và xóa tài liệu có xác nhận', async () => {
  const b = await newPage({ name: 'xoa' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  await chooseFile(b, '#btn-pick', [samples['tai-lieu-toi'].file, samples['tai-lieu-nghieng'].file]);
  await waitView(b, 'doc', 60000);
  await b.waitForFunction(() => document.querySelectorAll('#page-grid .pg').length === 2, { timeout: 10000 });
  await b.click('#page-grid .pg:nth-child(2) .del');
  await sleep(200);
  await clickText(b, 'Xóa', '.modal button');
  await sleep(500);
  const n = await b.$$eval('#page-grid .pg', (l) => l.length);
  if (n !== 1) throw new Error('còn ' + n + ' trang');
  await b.click('#v-doc [data-back]');
  await waitView(b, 'home');
  await b.waitForSelector('.doc .more', { timeout: 8000 });
  await b.click('.doc .more'); await sleep(200);
  await clickText(b, 'Xóa tài liệu', '.modal button'); await sleep(200);
  await shot(b, '34-xac-nhan-xoa');
  await clickText(b, 'Xóa', '.modal button'); await sleep(600);
  const empty = await visible(b, '#empty-home');
  if (!empty) throw new Error('kho chưa trống sau khi xóa');
  await b.__ctx.close();
}, page);

await step('Xuất 40 trang mức Cao: dựng từng trang, đổi khổ giấy không dựng lại, đổi tuỳ chọn nhanh không chồng lượt', async () => {
  const b = await newPage({ name: '40-trang' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  await waitView(b, 'home');
  await chooseFile(b, '#btn-pick', Array(40).fill(samples['tai-lieu-toi'].file));
  await waitView(b, 'doc', 300000);
  await b.waitForFunction(() => window.__scanner.S.doc.pages.length === 40, { timeout: 120000 });
  const r = await b.evaluate(async () => {
    const X = await import('/scanner/js/export.js');
    const pages = window.__scanner.S.doc.pages;
    const t0 = performance.now();
    const h0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const a = await X.exportPdf(pages, { paper: 'a4', quality: 'high' });
    const t1 = performance.now();
    const renders1 = X.stats.renders;
    const bb = await X.exportPdf(pages, { paper: 'fit', quality: 'high' }); // đổi khổ giấy: phải dùng lại
    const renders2 = X.stats.renders;
    // hủy giữa chừng
    const ctl = new AbortController();
    const p = X.exportPdf(pages, { paper: 'a4', quality: 'small', signal: ctl.signal });
    setTimeout(() => ctl.abort(), 300);
    let aborted = false;
    try { await p; } catch (e) { aborted = e.name === 'AbortError'; }
    const h1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    X.clearExportCache();
    return { ms: Math.round(t1 - t0), size: a.size, size2: bb.size, rendersFirst: renders1, rendersSecond: renders2 - renders1, aborted, heapMB: Math.round((h1 - h0) / 1e6) };
  });
  report.metrics.export40Pages = r;
  await b.__ctx.close();
  if (r.rendersFirst !== 40) throw new Error('dựng ' + r.rendersFirst + ' trang');
  if (r.rendersSecond !== 0) throw new Error('đổi khổ giấy lại dựng lại ' + r.rendersSecond + ' trang');
  if (!r.aborted) throw new Error('không hủy được');
  return JSON.stringify(r);
}, page);

await step('Hiệu năng xử lý trên ảnh 12 MP (4000x3000) — chạy trên máy dev, không phải điện thoại', async () => {
  const b = await newPage({ name: 'hieu-nang' });
  await b.goto(URL0, { waitUntil: 'networkidle0' });
  const r = await b.evaluate(async () => {
    const R = await import('/scanner/js/render.js');
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
    const x = c.getContext('2d');
    x.fillStyle = '#8a6a44'; x.fillRect(0, 0, 4000, 3000);
    x.save(); x.translate(2000, 1500); x.rotate(-0.15); x.fillStyle = '#f4f2ec'; x.fillRect(-1100, -1500, 2200, 3000 * 0.92); x.fillStyle = '#222';
    for (let i = 0; i < 40; i++) x.fillRect(-950, -1350 + i * 60, 1200 + (i % 7) * 120, 18);
    x.restore();
    const out = {};
    let t = performance.now();
    const imp = await R.importImage(c); out.nhapAnh = Math.round(performance.now() - t);
    const page = { id: 'perf', src: imp.blob, corners: [{ x: 0.2, y: 0.05 }, { x: 0.8, y: 0.08 }, { x: 0.8, y: 0.95 }, { x: 0.2, y: 0.92 }], filter: 'original', rot: 0, signs: [] };
    t = performance.now(); const d = await R.autoDetect(page); out.nhanCanh = Math.round(performance.now() - t); out.found = d.found;
    for (const f of ['original', 'magic', 'bw', 'gray', 'deshadow']) {
      t = performance.now();
      const cv = await R.renderPage(page, { srcEdge: 2600, maxEdge: 2480, filter: f });
      out['xuatTrang_' + f] = Math.round(performance.now() - t); out.kichThuoc = cv.width + 'x' + cv.height;
    }
    t = performance.now(); await R.renderPage(page, { srcEdge: 1400, maxEdge: 1100, filter: 'magic' }); out.xemTruoc_magic = Math.round(performance.now() - t);
    return out;
  });
  report.metrics.perfMs12MP = r;
  await b.__ctx.close();
  return JSON.stringify(r);
}, page);

// ---- Camera bị từ chối ----
await step('Camera bị từ chối quyền: hiện thông báo tiếng Việt, vẫn chọn ảnh được', async () => {
  const ctx = await browser2.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => problems.push(`[tu-choi] pageerror: ${e.message}`));
  await p.evaluateOnNewDocument(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); });
  await p.goto(URL0, { waitUntil: 'networkidle0' });
  await p.click('#btn-shoot');
  await waitView(p, 'camera');
  await p.waitForFunction(() => !document.querySelector('#cam-msg').hidden, { timeout: 8000 });
  const msg = await p.$eval('#cam-msg-text', (e) => e.textContent);
  if (!(await visible(p, '#cam-msg-pick'))) throw new Error('thiếu nút chọn ảnh khi camera lỗi');
  await shot(p, '33-camera-tu-choi');
  await ctx.close();
  if (!/quyền camera/.test(msg)) throw new Error(msg);
}, page);

// ---- tổng kết ----
const total = report.steps.length, failed = report.steps.filter((s) => !s.ok).length;
const allProblems = problems.filter((p) => !/favicon/.test(p));
report.metrics.stepsTotal = total; report.metrics.stepsFailed = failed; report.metrics.consoleProblems = allProblems.length;
fs.writeFileSync(path.join(SHOTS, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log('\n===== TỔNG KẾT E2E =====');
console.log(`Bước: ${total - failed}/${total} đạt`);
console.log(`Lỗi/cảnh báo console: ${allProblems.length}`);
for (const p of allProblems.slice(0, 20)) console.log('  ' + p);
console.log(JSON.stringify(report.metrics, null, 2));
await browser2.close();
server.close();
process.exit(failed || allProblems.length ? 1 : 0);
