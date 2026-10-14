// Kiểm tra giao diện thật bằng Chrome headless (puppeteer-core): vẽ, tẩy, hoàn tác, giấy, xuất ảnh, hai ngón, lưu lại.
// Điện thoại 390x844, 360x740, máy tính 1280x800; sáng và tối. Ảnh lưu ở shots/. Chạy: node scripts/e2e.js
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9draw-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`] });

const ketQua = []; const loiConsole = [];
let nhom = '';
function check(ten, ok, chiTiet = '') {
  ketQua.push({ ten: `[${nhom}] ${ten}`, ok: !!ok });
  console.log(`${ok ? 'ĐẠT' : 'LỖI'}  [${nhom}] ${ten}${ok ? '' : '  -> ' + chiTiet}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function moTrang(ctx, { view, dark = false, touch = false }) {
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) loiConsole.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => loiConsole.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => loiConsole.push('requestfailed: ' + r.url()));
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForSelector('#c-ink');
  return page;
}
// Số điểm ảnh có màu (alpha > 0) trong hình chữ nhật trang (toạ độ trang 1080).
const pixels = (page, x, y, w, h) => page.evaluate((x, y, w, h) => {
  const d = document.getElementById('c-ink').getContext('2d').getImageData(x, y, w, h).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
  return n;
}, x, y, w, h);
// Vẽ bằng chuột: đi theo danh sách điểm (toạ độ trang), đổi sang toạ độ màn hình.
async function ve(page, pts) {
  const r = await page.evaluate(() => { const b = document.getElementById('c-ink').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
  const H = await page.evaluate(() => document.getElementById('c-ink').height);
  const m = ([x, y]) => [r.l + x * r.w / 1080, r.t + y * r.h / H];
  const [x0, y0] = m(pts[0]);
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (const p of pts.slice(1)) { const [x, y] = m(p); await page.mouse.move(x, y, { steps: 4 }); }
  await page.mouse.up();
}
const dem = (page) => page.evaluate(() => window.__draw.doc.strokes.length);
const NET = [[200, 300], [400, 200], [600, 400], [800, 300]];

async function kichban(ten, opts) {
  nhom = ten;
  const ctx = await browser.createBrowserContext();
  const page = await moTrang(ctx, opts);

  check('tải trang, có khung vẽ và nút 9app', await page.$eval('#ve-9app', (a) => a.href.startsWith('https://9app.tech')));
  check('chưa vẽ: hoàn tác tắt', await page.$eval('#b-undo', (b) => b.disabled));
  await page.screenshot({ path: path.join(SHOTS, `${ten}-01-trong.png`) });

  // Bút
  await ve(page, NET);
  check('vẽ bút: có nét trong dữ liệu', (await dem(page)) === 1);
  check('vẽ bút: có điểm ảnh trên lớp mực', (await pixels(page, 150, 150, 700, 300)) > 500);
  check('hoàn tác bật', await page.$eval('#b-undo', (b) => !b.disabled));

  // Chạm một cái = chấm
  await ve(page, [[900, 800], [900, 800]]);
  check('chạm một cái ra chấm', (await dem(page)) === 2 && (await pixels(page, 870, 770, 60, 60)) > 20);

  // Bút dạ + đổi màu
  await page.click('[data-tool="hl"]');
  await page.click('.sw[data-c="#facc15"]');
  await ve(page, [[150, 600], [900, 600]]);
  const hl = await page.evaluate(() => window.__draw.doc.strokes.at(-1));
  check('bút dạ lưu đúng loại + màu', hl.t === 'hl' && hl.c === '#facc15', JSON.stringify(hl));

  // Tẩy xóa thật (điểm ảnh giảm)
  const truoc = await pixels(page, 150, 550, 760, 100);
  await page.click('[data-tool="er"]');
  await ve(page, [[150, 600], [900, 600]]);
  const sau = await pixels(page, 150, 550, 760, 100);
  check('tẩy làm mất nét dạ', sau < truoc * 0.2, `${truoc} -> ${sau}`);

  // Hoàn tác / làm lại: nét tẩy
  await page.click('#b-undo');
  check('hoàn tác tẩy: nét dạ hiện lại', (await pixels(page, 150, 550, 760, 100)) > truoc * 0.8);
  await page.click('#b-redo');
  check('làm lại tẩy', (await pixels(page, 150, 550, 760, 100)) < truoc * 0.2);

  // Xóa hết, hoàn tác lấy lại
  await page.click('#b-clear');
  check('xóa hết: lớp mực trống', (await pixels(page, 0, 0, 1080, 1350)) === 0);
  await page.click('#b-undo');
  check('hoàn tác xóa hết: nét về lại', (await pixels(page, 150, 150, 700, 300)) > 500);

  // Giấy: khổ + nền
  await page.click('#b-paper');
  await page.click('#fmts [data-k="1:1"]');
  await page.click('#bgs [data-k="grid"]');
  await sleep(100);
  await page.screenshot({ path: path.join(SHOTS, `${ten}-02-giay.png`) });
  await page.click('#d-paper [data-close]');
  const g = await page.evaluate(() => ({ h: document.getElementById('c-ink').height, bg: window.__draw.doc.bg, fmt: window.__draw.doc.fmt }));
  check('đổi sang vuông + ô vuông', g.h === 1080 && g.bg === 'grid' && g.fmt === '1:1', JSON.stringify(g));
  check('đổi khổ giữ nguyên nét', (await pixels(page, 150, 150, 700, 300)) > 500);

  // Phóng to bằng con lăn rồi vẽ: nét vẫn rơi đúng chỗ
  const sb = await page.$eval('#stage', (s) => { const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(sb.x, sb.y);
  await page.mouse.wheel({ deltaY: -300 });
  await sleep(100);
  const z = await page.evaluate(() => window.__draw.view.s);
  check('con lăn phóng to', z > 1.2, 'z=' + z);
  check('hiện nút Vừa khung', await page.$eval('#b-fit', (b) => !b.hidden));
  await page.click('[data-tool="pen"]');
  const n0 = await dem(page);
  await page.mouse.move(sb.x, sb.y); await page.mouse.down(); await page.mouse.move(sb.x + 60, sb.y + 30, { steps: 3 }); await page.mouse.up();
  const cx = await page.evaluate((sx, sy) => {
    const r = document.getElementById('c-ink').getBoundingClientRect();
    const s = window.__draw.doc.strokes.at(-1);
    return { dx: Math.abs(s.p[0] - (sx - r.left) * 1080 / r.width), dy: Math.abs(s.p[1] - (sy - r.top) * document.getElementById('c-ink').height / r.height) };
  }, sb.x, sb.y);
  check('vẽ khi đã phóng to: toạ độ đúng', (await dem(page)) === n0 + 1 && cx.dx < 3 && cx.dy < 3, JSON.stringify(cx));
  await page.click('#b-fit');
  check('Vừa khung đặt lại', await page.evaluate(() => window.__draw.view.s === 1));

  // Hai ngón: phóng to, không để lại nét
  if (opts.touch) {
    const cdp = await page.createCDPSession();
    const n1 = await dem(page);
    const mid = sb;
    const tp = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, mid.x - 40, mid.y), tp(2, mid.x + 40, mid.y)] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, mid.x - 40 - i * 12, mid.y), tp(2, mid.x + 40 + i * 12, mid.y)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
    const vz = await page.evaluate(() => window.__draw.view.s);
    check('hai ngón: phóng to', vz > 1.3, 'z=' + vz);
    check('hai ngón: không để lại nét', (await dem(page)) === n1);
    // Một ngón vẽ được
    await page.click('#b-fit');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, mid.x - 50, mid.y)] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, mid.x - 50 + i * 20, mid.y + i * 8)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
    check('một ngón: vẽ được', (await dem(page)) === n1 + 1);
  }

  // Xuất ảnh
  await page.click('#b-share');
  await page.waitForSelector('#d-out[open]');
  await page.waitForFunction(() => document.getElementById('prev').complete && document.getElementById('prev').naturalWidth > 0);
  const out = await page.evaluate(() => {
    const im = document.getElementById('prev');
    return { w: im.naturalWidth, h: im.naturalHeight, blob: im.src.startsWith('blob:') };
  });
  check('ảnh xuất 1080x1080', out.w === 1080 && out.h === 1080 && out.blob, JSON.stringify(out));
  await page.screenshot({ path: path.join(SHOTS, `${ten}-03-xuat.png`) });
  // Ảnh xuất có nền ô vuông (không trong suốt): lấy điểm góc
  const nen = await page.evaluate(async () => {
    const im = document.getElementById('prev');
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return x.getImageData(10, 10, 1, 1).data[3];
  });
  check('ảnh xuất có nền đặc', nen === 255);
  // Hộp chia sẻ hệ thống không có trong Chrome headless: giả lập cả hai nhánh.
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { n: d.files.length, type: d.files[0].type, name: d.files[0].name }; }; });
  await page.click('#o-share');
  await sleep(300);
  const sh = await page.evaluate(() => window.__shared);
  check('chia sẻ gửi 1 tệp PNG', sh && sh.n === 1 && sh.type === 'image/png' && /^9draw-\d{8}-\d{6}\.png$/.test(sh.name), JSON.stringify(sh));
  await page.evaluate(() => { navigator.share = async () => { throw Object.assign(new Error('lỗi'), { name: 'NotAllowedError' }); }; });
  await page.click('#o-share');
  await sleep(300);
  check('chia sẻ lỗi thì rơi về lưu ảnh và báo', await page.$eval('#toast', (t) => !t.hidden && /đã lưu ảnh/i.test(t.textContent)));
  await page.evaluate(() => { navigator.share = async () => { throw Object.assign(new Error('hủy'), { name: 'AbortError' }); }; document.getElementById('toast').hidden = true; });
  await page.click('#o-share');
  await sleep(300);
  check('người dùng hủy chia sẻ thì không báo lỗi', await page.$eval('#toast', (t) => t.hidden));
  await page.click('#d-out [data-close]');

  // Lưu lại khi tải lại trang
  await sleep(600);
  const truocTai = await dem(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#c-ink');
  check('tải lại: bản vẽ còn nguyên', (await dem(page)) === truocTai && (await pixels(page, 150, 150, 700, 300)) > 500);
  await page.screenshot({ path: path.join(SHOTS, `${ten}-04-sau-tai-lai.png`) });

  // Tràn ngang
  const tran = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check('không tràn ngang', !tran);

  await page.close();
  await ctx.close();
}

try {
  await kichban('dt390-sang', { view: { width: 390, height: 844 }, touch: true });
  await kichban('dt360-toi', { view: { width: 360, height: 740 }, dark: true, touch: true });
  await kichban('pc1280-sang', { view: { width: 1280, height: 800 } });
  await kichban('pc1280-toi', { view: { width: 1280, height: 800 }, dark: true });
} finally {
  await browser.close();
  server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* Chrome còn giữ tệp: bỏ qua */ }
}

nhom = 'console';
check('không có lỗi/cảnh báo trong console', loiConsole.length === 0, loiConsole.slice(0, 5).join(' | '));
const loi = ketQua.filter((k) => !k.ok);
console.log(`\n${ketQua.length - loi.length}/${ketQua.length} đạt`);
process.exit(loi.length ? 1 : 0);
