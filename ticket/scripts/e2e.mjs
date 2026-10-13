// E2E bằng Chrome thật (puppeteer-core): 390x844, 360x740, 1280x800; sáng/tối. Ảnh vào shots/.
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
const ok = (c, name) => { if (c) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer(0);
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: null,
  args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), '9ticket-chrome-'))}`] });

const FLIGHT = `Vietjet Air - Xác nhận đặt vé
Mã đặt chỗ: ABC12D
Chuyến bay VJ123 Hà Nội (HAN) → TP. Hồ Chí Minh (SGN)
Khởi hành: 15/11/2026 06:30  Đến: 15/11/2026 08:40
Hành khách: <img src=x onerror=window.__xss=1>  Ghế 12A`;

async function clickText(page, sel, text) {
  const done = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t));
    if (el) el.click();
    return Boolean(el);
  }, sel, text);
  if (!done) throw new Error(`không thấy ${sel} "${text}"`);
  await sleep(150);
}

const page = await browser.newPage();
const problems = [];
page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text()); });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle0' });

// 1. Trống -> chuyến mẫu
ok(await page.evaluate(() => document.querySelector('h1').textContent) === 'Chuyến của tôi', 'tiêu đề');
ok(await page.evaluate(() => document.body.textContent.includes('Chưa có chuyến nào')), 'trạng thái trống');
await clickText(page, 'button', 'Xem chuyến mẫu');
ok((await page.$$('a.card')).length === 4, '4 thẻ chuyến mẫu');
ok(await page.evaluate(() => document.body.textContent.includes('Đã đi')), 'có nhóm Đã đi');
await page.screenshot({ path: path.join(SHOTS, 'list-390.png') });

// 2. Chi tiết, giờ ra bến, chế độ vé, chia tiền
await page.evaluate(() => document.querySelector('a.card').click());
await sleep(300);
ok(await page.evaluate(() => /Nên ra sân bay lúc \d\d:\d\d/.test(document.querySelector('.leave-by').textContent)), 'có mốc ra sân bay');
ok(await page.evaluate(() => document.querySelector('#status').textContent.includes('Dữ liệu mẫu')), 'trạng thái ghi rõ dữ liệu mẫu');
ok(await page.evaluate(() => !document.body.textContent.includes('[object')), 'không lộ [object ...] trong trang chi tiết');
ok(await page.evaluate(() => /Cổng\s*A12/.test(document.querySelector('.dl').textContent) && /Nhà ga\s*T1/.test(document.querySelector('.dl').textContent)), 'hiện cổng và nhà ga');
await clickText(page, 'button', 'Chế độ vé');
ok(await page.evaluate(() => document.querySelector('main').classList.contains('ticket-mode')), 'chế độ vé bật');
await page.screenshot({ path: path.join(SHOTS, 'ticket-mode-390.png') });
await clickText(page, 'button', 'Thoát chế độ vé');
await page.type('#pay-who', 'TRAN THI B');
await page.type('#pay-amount', '100001');
await page.type('#pay-label', 'Cà phê');
await clickText(page, 'button', 'Thêm khoản chi');
ok(await page.evaluate(() => document.querySelector('.transfers') && /chuyển cho/.test(document.querySelector('.transfers').textContent)), 'có gợi ý chuyển tiền');
await page.type('#pay-who', 'A'); await page.type('#pay-amount', 'abc');
await clickText(page, 'button', 'Thêm khoản chi');
ok(await page.evaluate(() => /số nguyên dương/.test(document.querySelector('#split .error').textContent)), 'báo lỗi số tiền sai');
await page.screenshot({ path: path.join(SHOTS, 'detail-390.png'), fullPage: true });

// 2b. Đổi "Ra sớm" không làm mất khoản chi vừa thêm (I-1)
await page.evaluate(() => { const i = document.querySelector('#lead'); i.value = '90'; i.dispatchEvent(new Event('change')); });
await sleep(300);
ok(await page.evaluate(() => document.querySelector('#split').textContent.includes('Cà phê')), 'đổi Ra sớm vẫn giữ khoản chi');
ok(await page.evaluate(() => /lúc \d\d:\d\d/.test(document.querySelector('.leave-by').textContent) && document.querySelector('.leave-by').textContent.includes('90 phút')), 'mốc ra bến theo 90 phút');

// 2c. Chế độ vé vẫn hiện hành khách và ghế (I-4)
await clickText(page, 'button', 'Chế độ vé');
ok(await page.evaluate(() => document.querySelector('main').innerText.includes('12A') && document.querySelector('main').innerText.includes('NGUYEN VAN A')), 'chế độ vé hiện ghế và tên hành khách');
await clickText(page, 'button', 'Thoát chế độ vé');

// 2d. Sửa chuyến có múi giờ lạ không bị lệch giờ (I-2) và giờ đến thiếu ngày (I-3)
await page.evaluate(() => {
  const trips = JSON.parse(localStorage.getItem('9ticket.trips.v1') || '[]').concat([{ id: 'tfuk', mode: 'bay', code: 'JL100', from: { code: '', name: 'Fukuoka' }, to: { code: '', name: 'Osaka' }, departAt: '2026-11-20T10:00:00+09:00', arriveAt: '2026-11-20T11:30:00+09:00' }]);
  localStorage.setItem('9ticket.trips.v1', JSON.stringify(trips));
});
await page.goto(ORIGIN + '/#/edit/tfuk', { waitUntil: 'networkidle0' });
await page.type('#f-note', 'sửa ghi chú');
await clickText(page, 'button', 'Lưu chuyến');
await sleep(300);
ok(await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('9ticket.trips.v1')).find((x) => x.id === 'tfuk'); return t.note === 'sửa ghi chú' && t.departAt === '2026-11-20T10:00:00+09:00'; }), 'sửa chuyến lưu được và giữ nguyên múi giờ +09:00');
await page.goto(ORIGIN + '/#/edit/tfuk', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const set = (id, v) => { const e = document.querySelector(id); e.value = v; }; set('#f-dep-date', '2026-11-20'); set('#f-dep-time', '23:30'); set('#f-arr-date', ''); set('#f-arr-time', '01:40'); });
await clickText(page, 'button', 'Lưu chuyến');
await sleep(300);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('9ticket.trips.v1')).find((t) => t.id === 'tfuk').arriveAt === '2026-11-21T01:40:00+09:00'), 'giờ đến không có ngày thì sang hôm sau');
await page.evaluate(() => localStorage.setItem('9ticket.trips.v1', JSON.stringify(JSON.parse(localStorage.getItem('9ticket.trips.v1')).filter((t) => t.id !== 'tfuk'))));

// 3. Dán vé, XSS không chạy, lưu
await page.goto(ORIGIN + '/#/add', { waitUntil: 'networkidle0' });
await page.type('#paste', FLIGHT);
await clickText(page, 'button', 'Đọc vé');
ok(await page.evaluate(() => document.querySelector('#f-code').value === 'VJ123'), 'đọc ra số hiệu VJ123');
ok(await page.evaluate(() => document.querySelector('#f-from').value === 'Hà Nội'), 'đọc ra nơi đi');
await clickText(page, 'button', 'Lưu chuyến');
await sleep(300);
ok(await page.evaluate(() => location.hash.startsWith('#/trip/')), 'lưu rồi chuyển sang chi tiết');
ok(await page.evaluate(() => document.body.textContent.includes('<img src=x onerror=window.__xss=1>')), 'HTML hiển thị nguyên văn');
ok(await page.evaluate(() => window.__xss === undefined), 'XSS không chạy');

// 4. Form nhập tay có lỗi
await page.goto(ORIGIN + '/#/add', { waitUntil: 'networkidle0' });
await clickText(page, 'button', 'Lưu chuyến');
ok(await page.evaluate(() => document.querySelectorAll('ul.error li').length >= 3), 'form trống báo nhiều lỗi');

// 5. Xóa hai bước
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle0' });
const before = (await page.$$('a.card')).length;
await page.evaluate(() => document.querySelector('a.card').click()); await sleep(300);
await clickText(page, 'button', 'Xóa chuyến');
ok(await page.evaluate(() => location.hash.startsWith('#/trip/')), 'bấm một lần chưa xóa');
await clickText(page, 'button', 'Bấm lần nữa');
await sleep(300);
ok((await page.$$('a.card')).length === before - 1, 'bấm lần hai thì xóa');

// 6. Ngoại tuyến sau khi service worker sẵn sàng
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'networkidle0' });
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(500);
ok((await page.$$('a.card')).length >= 1, 'mở được danh sách khi không có mạng');
await page.setOfflineMode(false);

// 7. Ảnh và kiểm tra cuộn ngang ở 3 cỡ, sáng/tối
for (const [w, h, name] of [[390, 844, '390'], [360, 740, '360'], [1280, 800, '1280']]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    for (const [hash, tag] of [['#/', 'list'], ['#/add', 'add'], ['#/about', 'about']]) {
      await page.goto(ORIGIN + '/' + hash, { waitUntil: 'networkidle0' });
      await sleep(150);
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `không cuộn ngang ${tag} ${name} ${scheme}`);
      await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}-${scheme}.png`) });
    }
  }
}
ok(problems.length === 0, 'không có lỗi CSP/JS: ' + problems.join(' | '));

await browser.close(); server.close();
console.log(`\n${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
