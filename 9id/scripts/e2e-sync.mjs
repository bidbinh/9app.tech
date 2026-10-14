// E2E đồng bộ: 9id THẬT (PostgreSQL nhúng) + các app tĩnh cùng một nguồn gốc (giống nginx: /id/ -> 9id, /<app>/ -> thư mục app) + Chrome thật.
// Hai ngữ cảnh trình duyệt độc lập = hai "máy" của cùng một tài khoản. Chạy: node scripts/e2e-sync.mjs [payday|car|fit ...]
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';
import { SCENARIOS } from './e2e-sync-scenarios.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.join(root, '..');
const SHOTS = path.join(root, 'shots', 'sync');
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const APPS = process.argv.slice(2).length ? process.argv.slice(2) : ['payday', 'car', 'fit'];

const pg = await startEmbedded({ database: 'id_e2e_sync' });
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: pg.url, RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000' });
const H = await import('../test/helper.js');
await H.boot();
const lan = await H.signup('Lan Anh');
const TOKEN = H.tokenOf(lan);

// ---- máy chủ gộp một nguồn gốc ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const front = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/id/')) {
    const target = new URL(H.origin);
    const p = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(p); return;
  }
  const m = u.pathname.match(/^\/([a-z0-9]+)\/(.*)$/);
  if (!m || !APPS.includes(m[1])) { res.writeHead(404); res.end('x'); return; }
  const appRoot = path.join(repo, m[1]);
  let f = path.join(appRoot, decodeURIComponent(m[2]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(appRoot) || !fs.existsSync(f)) { res.writeHead(404); res.end('x'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => front.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${front.address().port}`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9sync-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });
const results = [], problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); if (!cond) problems.push(`KIỂM TRA SAI: ${name} ${extra}`); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); };
let shotNo = 0;
async function newPage(name, { login = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (login) await page.setCookie({ name: 'nine_sid', value: TOKEN, url: ORIGIN });
  page.__name = name; page.__ctx = ctx;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410)/.test(m.text()) && !/favicon|icon\.(svg|png)|serviceWorker|service worker/i.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  if (process.env.DEBUG_SYNC) page.on('response', (r) => { if (r.url().includes('/id/')) console.log('  [' + name + ']', r.request().method(), r.url().replace(ORIGIN, ''), r.status()); });
  if (process.env.DEBUG_SYNC) page.on('console', (m) => console.log('  [console ' + name + ']', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('dialog', async (d) => { problems.push(`[${name}] hộp thoại bất ngờ: ${d.message()}`); await d.dismiss(); });
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);
async function waitText(p, s, t = 12000) { await p.waitForFunction((x) => document.body.innerText.includes(x), { timeout: t }, s); }
async function tapTid(p, tid) { await p.bringToFront(); const el = await p.waitForSelector(`[data-testid="${tid}"]`, { timeout: 9000 }); await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await el.click(); }
async function shot(p, name) { shotNo++; await p.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`) }); }
async function serverDoc(app) { return (await lan.get('/api/sync/' + app)).json; }

try {
  for (const app of APPS) {
    const sc = SCENARIOS[app];
    const url = `${ORIGIN}/${app}/`;
    console.log(`\n== ${app} ==`);
    // 1. ẩn danh: thẻ mời đăng nhập
    const anon = await newPage(app + '-anon');
    await anon.goto(url + sc.dataHash, { waitUntil: 'networkidle0' });
    await waitText(anon, 'Đăng nhập tài khoản 9app');
    check(`${app}: chưa đăng nhập thì thẻ mời đăng nhập, ghi rõ không bắt buộc`, /không bắt buộc/i.test(await text(anon)));
    await shot(anon, `${app}-chua-dang-nhap`);
    await anon.__ctx.close();

    // 2. máy A: đăng nhập, thêm dữ liệu, bật đồng bộ có đồng ý
    const A = await newPage(app + '-A', { login: true });
    await A.goto(url + sc.dataHash, { waitUntil: 'networkidle0' });
    await sc.seed(A, 'A1');
    await A.goto(url + '?r=1' + sc.dataHash, { waitUntil: 'networkidle0' });
    await waitText(A, 'Tôi hiểu và đồng ý');
    check(`${app}: nút Bật đồng bộ bị khóa tới khi tích đồng ý`, (await A.$eval('[data-testid="dong-bo-bat"]', (b) => b.disabled)) === true);
    await shot(A, `${app}-dong-y`);
    await A.click('[data-testid="dong-bo-dong-y"]');
    await tapTid(A, 'dong-bo-bat');
    await waitText(A, 'Đồng bộ gần nhất');
    const d1 = await serverDoc(app);
    check(`${app}: bật đồng bộ đẩy dữ liệu lên máy chủ (version 1)`, d1.version === 1 && JSON.stringify(d1.data).includes('A1'), JSON.stringify(d1).slice(0, 120));
    await shot(A, `${app}-da-bat`);

    // 3. máy B: đăng nhập, bật, kéo về dữ liệu của A
    const B = await newPage(app + '-B', { login: true });
    await B.goto(url + sc.dataHash, { waitUntil: 'networkidle0' });
    await waitText(B, 'Tôi hiểu và đồng ý');
    await B.click('[data-testid="dong-bo-dong-y"]');
    await tapTid(B, 'dong-bo-bat');
    await waitText(B, 'Đồng bộ gần nhất');
    await sleep(500);
    check(`${app}: máy B thấy dữ liệu của máy A sau khi bật`, (await sc.read(B)).includes('A1'), (await sc.read(B)).slice(0, 120));
    await shot(B, `${app}-may-b`);

    // 4. B thêm B1, A thêm A2 (chưa biết nhau), đồng bộ -> cả hai có đủ
    await sc.seed(B, 'B1');
    await sc.seed(A, 'A2');
    await tapTid(B, 'dong-bo-ngay'); await sleep(900);
    await tapTid(A, 'dong-bo-ngay'); await sleep(900);
    await tapTid(B, 'dong-bo-ngay'); await sleep(900);
    const ra = await sc.read(A), rb = await sc.read(B);
    check(`${app}: hai máy cùng thêm dữ liệu rồi đồng bộ: cả A lẫn B có A1, A2, B1`, ['A1', 'A2', 'B1'].every((k) => ra.includes(k) && rb.includes(k)), `A=${ra.slice(0, 100)} B=${rb.slice(0, 100)}`);

    // 5. A xóa A1, đồng bộ; B đồng bộ -> A1 biến mất ở B (không sống lại)
    await sc.remove(A, 'A1');
    if (process.env.DEBUG_SYNC) console.log('  A sau khi xóa:', await sc.read(A));
    await tapTid(A, 'dong-bo-ngay'); await sleep(900);
    if (process.env.DEBUG_SYNC) console.log('  máy chủ:', JSON.stringify((await serverDoc(app)).data).slice(0, 300), ' A:', await sc.read(A));
    await tapTid(B, 'dong-bo-ngay'); await sleep(900);
    const rb2 = await sc.read(B);
    check(`${app}: xóa ở máy A lan sang máy B, không sống lại`, !rb2.includes('A1') && rb2.includes('B1'), rb2.slice(0, 120));

    // 6. mở lại app ở B: đồng bộ tự động khi mở (A thêm A3 trước)
    await sc.seed(A, 'A3'); await tapTid(A, 'dong-bo-ngay'); await sleep(900);
    await B.goto(url + '?r=2' + sc.dataHash, { waitUntil: 'networkidle0' });
    await sleep(2000);
    if (process.env.DEBUG_SYNC) console.log('  LS:', await B.evaluate(() => JSON.stringify(Object.entries(localStorage).map(([k, v]) => [k, v.slice(0, 40)]))), await B.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name.split('/').slice(-2).join('/')).filter((n) => /sync|dongbo/.test(n)).join(',')));
    check(`${app}: mở lại app tự đồng bộ (B thấy A3)`, (await sc.read(B)).includes('A3'), (await sc.read(B)).slice(0, 120));

    // 7. tắt đồng bộ giữ dữ liệu máy; xóa bản máy chủ
    await tapTid(B, 'dong-bo-tat');
    await waitText(B, 'Tôi hiểu và đồng ý');
    check(`${app}: tắt đồng bộ giữ nguyên dữ liệu trên máy`, (await sc.read(B)).includes('B1'));
    await tapTid(A, 'dong-bo-xoa');
    await sc.confirm(A);
    await waitText(A, 'Tôi hiểu và đồng ý');
    const d2 = await serverDoc(app);
    check(`${app}: xóa bản trên máy chủ`, d2.version === 0 && d2.data === null);
    await A.__ctx.close(); await B.__ctx.close();
  }
} catch (e) {
  problems.push('NGOẠI LỆ: ' + e.message); console.error(e);
  try { for (const p of await browser.pages()) await p.screenshot({ path: path.join(SHOTS, `loi-${p.__name || 'x'}.png`) }).catch(() => {}); } catch { /* */ }
}

await browser.close(); front.close();
await H.shutdown(); await pg.stop();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} kiểm tra đạt, ${shotNo} ảnh ở ${SHOTS}`);
if (problems.length) { console.log('\nVẤN ĐỀ:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('Không có lỗi console / pageerror / hộp thoại bất ngờ.');
process.exit(0);
