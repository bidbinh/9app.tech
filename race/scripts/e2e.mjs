// E2E bằng Chrome headless (puppeteer-core): điện thoại 390x844 và máy tính 1280x900, sáng và tối.
// Chạy: node scripts/e2e.mjs   Ảnh lưu ở shots/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; failures.push(name); console.log('  FAIL ' + name); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer(0);
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9race-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const CONTRAST_JS = () => {
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const bgOf = (el) => {
    let layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255];
    if (!layers.length || layers[layers.length - 1][3] < 1) base = parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    for (let i = layers.length - 1; i >= 0; i--) {
      const [r, g, b, a] = layers[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    }
    return base;
  };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.closest('[disabled]')) continue;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    const a = fg[3];
    const f2 = [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
    const l1 = lum(f2), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const op = parseFloat(cs.opacity);
    if (ratio < need && op >= 1) bad.push(`${ratio.toFixed(2)} < ${need} "${el.textContent.trim().slice(0, 40)}" <${el.tagName.toLowerCase()} class="${el.className}">`);
  }
  return bad;
};

async function runProfile(name, viewport, scheme) {
  console.log(`\n=== ${name} / ${scheme} ===`);
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  const client = await page.createCDPSession();
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), '9race-dl-'));
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, eventsEnabled: true, browserContextId: ctx.id });
  const go = async (u) => { await page.goto(u, { waitUntil: 'load' }); await page.waitForFunction(() => document.getElementById('main') && !document.querySelector('.loading')); await sleep(60); };
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${name}-${scheme}-${n}.png`) });
  const noOverflow = async (label) => {
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok(o.sw <= o.iw, `${label}: không tràn ngang (${o.sw} <= ${o.iw})`);
  };
  const noJunk = async (label) => {
    const t = await page.$eval('main', (m) => m.textContent);
    ok(!/\b(null|undefined|NaN)\b|\[object/.test(t), `${label}: không rò chữ null/undefined/NaN`);
  };
  const contrast = async (label) => {
    const bad = await page.evaluate(CONTRAST_JS);
    ok(bad.length === 0, `${label}: tương phản chữ đạt${bad.length ? ' | ' + bad.slice(0, 5).join(' || ') : ''}`);
  };
  const waitDl = async (ext) => {
    for (let i = 0; i < 40; i++) {
      const f = fs.readdirSync(dl).find((x) => x.endsWith(ext));
      if (f) { const p = path.join(dl, f); await sleep(100); return p; }
      await sleep(100);
    }
    return null;
  };

  await go(`${ORIGIN}/index.html`);
  await page.waitForSelector('.card');

  // --- danh sách ---
  const n = await page.$$eval('.card', (c) => c.length);
  ok(n >= 50, `danh sách có nhiều giải sắp tới (${n})`);
  ok((await page.title()).includes('9race'), 'tiêu đề trang');
  ok(await page.$eval('.home', (a) => a.getAttribute('href') === 'https://9app.tech/' && a.textContent.includes('9app')), 'có link ‹ 9app');
  const first = await page.$eval('.card .card-title', (e) => e.textContent);
  ok(first.includes('Kuala Lumpur'), 'giải đầu tiên là giải bắt đầu sớm nhất còn diễn ra: ' + first);
  ok(await page.$$eval('.card .actions a[href^="https://"]', (as) => as.length > 30 && as.every((a) => a.target === '_blank' && /noopener/.test(a.rel) && /noreferrer/.test(a.rel))), 'link ngoài target=_blank rel=noopener noreferrer');
  ok(await page.$$eval('.card .actions a[href^="mailto:"]', (as) => as.length === document.querySelectorAll('.card').length && as[0].href.includes('ttrongbinh%40gmail.com') || as[0].href.includes('ttrongbinh@gmail.com')), 'mỗi thẻ có nút Báo sai (mailto)');
  ok(await page.$$eval('.badge.warn', (b) => b.some((x) => x.textContent === 'Cần kiểm chứng')), 'có nhãn "Cần kiểm chứng"');
  ok(await page.$$eval('.meta', (m) => m.every((x) => /^Cập nhật \d\d\/\d\d\/\d{4}$/.test(x.textContent))), 'nhãn "Cập nhật <ngày>"');
  await noOverflow('danh sách');
  await shot('01-list');
  await contrast('danh sách');
  await noJunk('danh sách');

  // --- tìm không dấu + hash ---
  await page.type('#q', 'da lat');
  await sleep(150);
  const n2 = await page.$$eval('.card', (c) => c.length);
  ok(n2 > 0 && n2 < n, `tìm "da lat" còn ${n2} giải`);
  ok(await page.$$eval('.card .card-title', (t) => t.length > 0), 'có kết quả Đà Lạt');
  ok((await page.evaluate(() => location.hash)).includes('q=da%20lat') || (await page.evaluate(() => location.hash)).includes('q=da+lat'), 'q lưu trong URL hash');
  await page.$eval('#q', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(100);

  // --- lọc loại bằng chip + hash khôi phục ---
  if (await page.$eval('details.filters', (d) => !d.open)) await page.click('details.filters > summary');
  await page.click('.chip[data-key="types"][data-id="trail"]');
  await sleep(100);
  ok(await page.$$eval('.card .badge.type-trail', (b) => b.length) === await page.$$eval('.card', (c) => c.length), 'lọc Trail: mọi thẻ là trail');
  ok((await page.evaluate(() => location.hash)).includes('type=trail'), 'type=trail trong hash');
  await shot('02-filters');
  const hashTrail = await page.evaluate(() => location.hash);
  await go(`${ORIGIN}/index.html${hashTrail}`);
  await page.waitForSelector('.card');
  ok(await page.$eval('.chip[data-key="types"][data-id="trail"]', (c) => c.getAttribute('aria-pressed') === 'true'), 'mở lại URL: chip Trail vẫn bật');
  // lọc cự ly + vùng + đăng ký
  await go(`${ORIGIN}/index.html#/?dist=ultra&region=vn-bac&reg=open`);
  await page.waitForSelector('.card');
  ok(await page.$$eval('.card', (c) => c.length > 0), 'lọc tổ hợp ultra + miền Bắc + đang mở có kết quả');
  ok(await page.$$eval('.card .badge.reg-open', (b) => b.length) === await page.$$eval('.card', (c) => c.length), 'tất cả thẻ "Đang mở đăng ký"');
  await go(`${ORIGIN}/index.html#/?q=zzzkhongco`);
  ok(await page.$('.empty') !== null, 'trạng thái rỗng khi không khớp');
  // giải đã qua
  await go(`${ORIGIN}/index.html#/?past=1`);
  await page.waitForSelector('.card');
  ok(await page.$$eval('.card.past', (c) => c.length > 0), 'past=1 hiện giải đã qua');

  // --- lịch tháng ---
  await go(`${ORIGIN}/index.html#/?view=month&m=2026-11`);
  await page.waitForSelector('.cal');
  ok(await page.$$eval('.cell.has', (c) => c.length) > 8, 'lịch tháng 11/2026 có nhiều ngày có giải');
  await noOverflow('lịch tháng');
  await shot('03-month');
  await contrast('lịch tháng');
  await page.click('.cell.has[aria-label^="Ngày 15 "]');
  await sleep(100);
  ok(await page.$$eval('.card .card-title', (t) => t.some((x) => x.textContent.includes('Tràng An'))), 'bấm ngày 15/11 ra Tràng An');
  ok((await page.evaluate(() => location.hash)).includes('d=2026-11-15'), 'ngày chọn lưu trong hash');
  await page.click('.month-nav button[aria-label="Tháng sau"]');
  await sleep(100);
  ok(await page.$eval('#month-title', (e) => e.textContent) === 'Tháng 12/2026', 'chuyển tháng sau');

  // --- chi tiết ---
  await go(`${ORIGIN}/index.html#/g/tokyo-marathon-2027`);
  await page.waitForSelector('.detail-title');
  ok(await page.$eval('.detail-title', (e) => e.textContent.includes('Tokyo')), 'trang chi tiết hiện tên giải');
  ok(await page.$$eval('.detail .facts dt', (d) => d.some((x) => x.textContent === 'Nhận BIB')), 'chi tiết có mốc nhận BIB');
  await noOverflow('chi tiết');
  await shot('04-detail');
  await contrast('chi tiết');
  await noJunk('chi tiết');
  // lịch .ics
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Tải lịch .ics').click());
  const icsPath = await waitDl('.ics');
  ok(icsPath && fs.readFileSync(icsPath, 'utf8').startsWith('BEGIN:VCALENDAR') && fs.readFileSync(icsPath, 'utf8').includes('BEGIN:VALARM'), 'tải .ics hợp lệ có VALARM');
  // trạng thái "Đã chạy", PB sai/đúng, ghi chú
  await go(`${ORIGIN}/index.html#/g/vmm-2026`);
  await page.waitForSelector('.seg[data-status="ran"]');
  await page.click('.seg[data-status="ran"]');
  await page.waitForSelector('#pb');
  await page.type('#pb', '12:xx');
  await page.keyboard.press('Tab');
  ok(await page.$eval('#pb-err', (e) => !e.hidden), 'PB sai hiện lỗi');
  await page.$eval('#pb', (e) => { e.value = ''; });
  await page.type('#pb', '9:05:07');
  await page.keyboard.press('Tab');
  await page.type('#note', 'Mưa to, rất đáng nhớ');
  await page.$eval('#note', (e) => e.blur());
  await shot('05-detail-ran');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#pb');
  ok(await page.$eval('#pb', (e) => e.value) === '9:05:07', 'PB lưu sau khi tải lại');
  ok(await page.$eval('#note', (e) => e.value) === 'Mưa to, rất đáng nhớ', 'ghi chú lưu sau khi tải lại');
  await contrast('chi tiết (đã chạy)');
  // quan tâm từ thẻ
  await go(`${ORIGIN}/index.html`);
  await page.waitForSelector('.card');
  await page.click('.card[data-id="trang-an-marathon-2026"] button[aria-pressed="false"]');
  await page.click('.card[data-id="hcmc-marathon-2027"] button[aria-pressed="false"]');
  ok(await page.$eval('#mine-count', (e) => e.textContent === '3' && !e.hidden), 'đếm Giải của tôi = 3');

  // --- Giải của tôi ---
  await go(`${ORIGIN}/index.html#/mine`);
  await page.waitForSelector('#tools-h');
  ok(await page.$$eval('.card .card-title', (t) => t.some((x) => x.textContent.includes('Tràng An'))), 'Giải của tôi liệt kê Tràng An');
  ok(await page.$$eval('main h2', (h2) => h2.some((x) => x.textContent.startsWith('Đã chạy (1)'))), 'mục Đã chạy có 1 giải');
  ok(await page.$eval('main', (m) => m.textContent.includes('9:05:07')), 'hiện PB');
  ok(await page.$eval('main', (m) => /chưa có thông báo đẩy/i.test(m.textContent)), 'nói rõ chưa có push');
  await noOverflow('Giải của tôi');
  await shot('06-mine');
  await contrast('Giải của tôi');
  await noJunk('Giải của tôi');
  for (const f of fs.readdirSync(dl)) fs.unlinkSync(path.join(dl, f));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Xuất sao lưu JSON').click());
  const jsonPath = await waitDl('.json');
  const backup = jsonPath ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : null;
  ok(backup && backup.app === '9race' && Object.keys(backup.items).length === 3, 'xuất JSON sao lưu đủ 3 giải');
  // xóa dữ liệu rồi nhập lại
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#import-file');
  ok(await page.$eval('#mine-count', (e) => e.hidden), 'sau khi xóa, danh sách trống');
  const input = await page.$('#import-file');
  await input.uploadFile(jsonPath);
  await page.waitForFunction(() => document.getElementById('mine-count') && !document.getElementById('mine-count').hidden);
  ok(await page.$eval('#mine-count', (e) => e.textContent) === '3', 'nhập JSON khôi phục 3 giải');
  // nhập tệp rác
  const bad = path.join(dl, 'rac.json');
  fs.writeFileSync(bad, '{"x":1}');
  await (await page.$('#import-file')).uploadFile(bad);
  await page.waitForFunction(() => document.getElementById('io-msg').textContent.length > 0);
  ok(await page.$eval('#io-msg', (e) => e.textContent.includes('không phải tệp sao lưu')), 'nhập tệp sai báo lỗi tiếng Việt');
  for (const f of fs.readdirSync(dl)) fs.unlinkSync(path.join(dl, f));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Tải lịch .ics')).click());
  const ics2 = await waitDl('.ics');
  ok(ics2 && (fs.readFileSync(ics2, 'utf8').match(/BEGIN:VEVENT/g) || []).length >= 2, 'tải lịch .ics cho giải của tôi');

  // --- về dữ liệu ---
  await go(`${ORIGIN}/index.html#/about`);
  await page.waitForSelector('h1');
  ok(await page.$eval('main', (m) => m.textContent.includes('Miễn trừ') && m.textContent.includes('ttrongbinh@gmail.com')), 'trang Về dữ liệu có miễn trừ và cách báo sai');
  await noOverflow('Về dữ liệu');
  await shot('07-about');
  await contrast('Về dữ liệu');
  await noJunk('Về dữ liệu');

  // --- giải không tồn tại ---
  await go(`${ORIGIN}/index.html#/g/khong-ton-tai`);
  ok(await page.$eval('main h1', (e) => e.textContent === 'Không tìm thấy giải'), 'id lạ: trang báo không tìm thấy');

  // --- bàn phím ---
  await go(`${ORIGIN}/index.html`);
  await page.waitForSelector('.card');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.className === 'skip'), 'Tab đầu tiên vào liên kết "Bỏ qua"');
  let reached = false;
  for (let i = 0; i < 25 && !reached; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'SUMMARY' && !document.activeElement.parentElement.open)) await page.keyboard.press('Enter');
    reached = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('chip'));
  }
  ok(reached, 'Tab tới được các chip bộ lọc');
  if (reached) {
    const before = await page.evaluate(() => document.activeElement.getAttribute('aria-pressed'));
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => document.activeElement.getAttribute('aria-pressed'));
    ok(before === 'false' && after === 'true', 'Enter bật chip và giữ focus');
  }

  // --- service worker + ngoại tuyến ---
  await go(`${ORIGIN}/index.html`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await sleep(500);
  const cacheKeys = await page.evaluate(async () => (await caches.keys()));
  ok(cacheKeys.some((k) => k.startsWith('9race-shell-')), 'service worker đã cache vỏ ứng dụng');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.card');
  ok(await page.evaluate(async () => (await caches.keys()).includes('9race-data')), 'dữ liệu được cache (stale-while-revalidate)');
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card', { timeout: 8000 }).catch(() => {});
  ok(await page.$$eval('.card', (c) => c.length > 30), 'mở được khi ngoại tuyến (từ cache)');
  await page.setOfflineMode(false);

  // --- cập nhật dữ liệu thông báo ---
  // (SW báo data-updated khi nội dung races.json khác bản cache; kiểm bằng cách sửa tệp tạm.)
  const racesPath = path.join(root, 'data/races.json');
  const original = fs.readFileSync(racesPath, 'utf8');
  try {
    const doc = JSON.parse(original);
    doc.updatedAt = '2026-10-05';
    doc.races[0].updatedAt = '2026-10-05';
    fs.writeFileSync(racesPath, JSON.stringify(doc));
    await page.evaluateOnNewDocument(() => { window.__msgs = 0; navigator.serviceWorker.addEventListener('message', () => { window.__msgs++; }); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.card');
    await page.waitForFunction(() => !document.getElementById('toast').hidden && document.getElementById('toast').textContent.includes('cập nhật'), { timeout: 5000 }).catch(() => {});
    await sleep(800);
    ok(await page.evaluate(() => window.__msgs) === 1, 'SW chỉ báo đúng 1 lần khi dữ liệu đổi (không lặp)');
    ok(await page.$eval('#toast', (t) => t.textContent.includes('cập nhật')), 'dữ liệu mới -> toast "Dữ liệu giải vừa được cập nhật"');
  } finally {
    fs.writeFileSync(racesPath, original);
  }

  ok(errors.length === 0, `không có lỗi/cảnh báo console${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
  await ctx.close();
}

try {
  await runProfile('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'light');
  await runProfile('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'dark');
  await runProfile('desktop', { width: 1280, height: 900, deviceScaleFactor: 1 }, 'light');
  await runProfile('desktop', { width: 1280, height: 900, deviceScaleFactor: 1 }, 'dark');
} catch (e) {
  fail++; failures.push('ngoại lệ: ' + e.message);
  console.error(e);
} finally {
  await browser.close();
  server.close();
}
console.log(`\nE2E: ${pass} đạt / ${pass + fail} (${fail} lỗi)`);
if (failures.length) console.log('Lỗi:\n- ' + failures.join('\n- '));
process.exit(fail ? 1 : 0);
