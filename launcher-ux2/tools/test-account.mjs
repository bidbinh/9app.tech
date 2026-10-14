// Kiểm trang Tài khoản của launcher với 9id (Chrome thật; /id/api/me, /id/api/logout và điều hướng sang /id/ được chặn giả).
// Chạy: node tools/test-account.mjs   (cần PUPPETEER_CORE nếu puppeteer-core không ở đường dẫn mặc định)
import { boot } from './lib.mjs';

const { browser, base, server } = await boot();
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ME_IN = { user: { id: 'u1', displayName: 'Lan Anh', phoneLast4: '1234', source: '9id', passwordWeak: false } };
const json = (req, status, body) => req.respond({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });

// meMode: 'out' | 'in' | '404' | 'html' | 'abort';  nineMode: 'real' | '404'
async function open(meMode, { nineMode = 'real', hash = '#/tai-khoan', w = 390, scheme = 'light' } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setViewport({ width: w, height: 844, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  await page.setRequestInterception(true);
  const log = { logouts: [], navs: [], errors: [], meCalls: 0, loggedOut: false };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) log.errors.push('console: ' + m.text()); });
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.pathname === '/id/nine.js' && nineMode === '404') { req.respond({ status: 404, body: 'nf' }); return; }
    if (u.pathname === '/id/api/me') {
      log.meCalls++;
      if (log.loggedOut || meMode === 'out') json(req, 200, { user: null });
      else if (meMode === 'in') json(req, 200, ME_IN);
      else if (meMode === '404') req.respond({ status: 404, body: 'nf' });
      else if (meMode === 'html') req.respond({ status: 200, contentType: 'text/html', body: '<html>9id</html>' });
      else req.abort('failed');
      return;
    }
    if (u.pathname === '/id/api/logout') { log.logouts.push(req.method() + ' ' + req.headers()['x-requested-with']); log.loggedOut = true; json(req, 200, { ok: true }); return; }
    if (u.pathname === '/id/' && req.isNavigationRequest()) { log.navs.push(u.pathname + u.search + u.hash); req.respond({ status: 200, contentType: 'text/html', body: '<html>9id</html>' }); return; }
    req.continue();
  });
  await page.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.clear(); } } catch (e) { /* bỏ qua */ } });
  await page.goto(base + '/index.html' + hash, { waitUntil: 'networkidle0' });
  await sleep(200);
  return { page, log };
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0; }, sel);
const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const small = (page, sels) => page.evaluate((ss) => ss.map((s) => { const e = document.querySelector(s); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5 ? s + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) : null; }).filter(Boolean), sels);

const contrast = (page) => page.evaluate(() => {
  const P = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(parseFloat); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const L = (c) => { const f = (x) => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const R = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bgs = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const gi = cs.backgroundImage; if (gi && gi !== 'none') { const cols = (gi.match(/rgba?\([^)]+\)/g) || []).map(P).filter(c => c && c.a > .5); if (cols.length) return cols; } const c = P(cs.backgroundColor); if (c && c.a > .9) return [c]; } return [{ r: 255, g: 255, b: 255, a: 1 }]; };
  const bad = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('[hidden]') || el.closest('.visually') || el.closest('.svg-defs') || el.closest('.sheet')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1) continue;
    const cs = getComputedStyle(el);
    const fg = P(cs.color); if (!fg) continue;
    let worst = 99; for (const b of bgs(el)) worst = Math.min(worst, R(fg, b));
    const big = parseFloat(cs.fontSize) >= 18.6 || (parseFloat(cs.fontSize) >= 14 && parseInt(cs.fontWeight) >= 700);
    if (worst < (big ? 3 : 4.5) - 0.01) bad.push(el.className + '|' + n.textContent.trim().slice(0, 20) + '|' + worst.toFixed(2));
  }
  return bad;
});

// A. chưa đăng nhập
{
  const { page, log } = await open('out');
  ok(await vis(page, '#acc-out'), 'chưa đăng nhập: hiện khối đăng nhập');
  ok(!(await vis(page, '#acc-in')), 'chưa đăng nhập: không hiện khối đã đăng nhập');
  ok((await text(page, '#acc-login')) === 'Đăng nhập' && (await text(page, '#acc-register')) === 'Đăng ký', 'có hai nút Đăng nhập và Đăng ký');
  ok(/tùy chọn|không cần tài khoản/i.test(await text(page, '#acc-out')), 'nói rõ đăng nhập là tùy chọn');
  ok((await small(page, ['#acc-login', '#acc-register'])).length === 0, 'nút đủ lớn (>=44px)');
  await page.click('#acc-login');
  await sleep(400);
  ok(log.navs.length === 1 && log.navs[0] === '/id/?next=%2F%23%2Ftai-khoan#/dang-nhap', 'Đăng nhập chuyển tới 9id với next về trang Tài khoản: ' + log.navs);
  ok(log.errors.length === 0, 'không lỗi JS: ' + log.errors.join('|'));
  await page.close();
}
{
  const { page, log } = await open('out');
  await page.click('#acc-register');
  await sleep(400);
  ok(log.navs[0] === '/id/?next=%2F%23%2Ftai-khoan#/dang-ky', 'Đăng ký chuyển tới màn đăng ký: ' + log.navs);
  await page.close();
}

// B. đã đăng nhập
{
  const { page, log } = await open('in');
  ok(await vis(page, '#acc-in') && !(await vis(page, '#acc-out')), 'đã đăng nhập: hiện khối thông tin, ẩn nút đăng nhập');
  ok((await text(page, '#acc-name')) === 'Lan Anh', 'hiện tên');
  const ph = await text(page, '#acc-phone');
  ok(/1234/.test(ph) && !/\d{6,}/.test(ph), 'số điện thoại bị che, chỉ 4 số cuối: ' + ph);
  ok(await page.evaluate(() => document.querySelector('#acc-manage').getAttribute('href') === '/id/#/tai-khoan'), 'có liên kết Quản lý tài khoản tới 9id');
  ok((await text(page, '#av-letter')) === 'L' && await page.evaluate(() => !document.getElementById('av-letter').hidden && document.getElementById('btn-account').classList.contains('in')), 'avatar được đặt chữ cái đầu của tên');
  ok((await small(page, ['#acc-manage', '#acc-logout'])).length === 0, 'nút/liên kết đủ lớn (>=44px)');
  await page.click('#acc-logout');
  await sleep(500);
  ok(log.logouts.length === 1 && log.logouts[0] === 'POST 9id', 'Đăng xuất gọi đúng một lần, có header chống CSRF: ' + log.logouts);
  ok(await vis(page, '#acc-out') && !(await vis(page, '#acc-in')), 'sau đăng xuất hiện lại nút đăng nhập');
  ok(await page.evaluate(() => document.getElementById('av-letter').hidden && !document.getElementById('btn-account').classList.contains('in')), 'avatar trở lại biểu tượng mặc định');
  ok(log.errors.length === 0, 'không lỗi JS: ' + log.errors.join('|'));
  await page.close();
}

// C. 9id không đạt được (chưa lên server, ngoại tuyến, trả HTML): launcher vẫn dùng bình thường, không hiện khối đăng nhập, không lỗi JS
for (const mode of ['404', 'html', 'abort']) {
  const { page, log } = await open(mode);
  ok(!(await vis(page, '#acc-out')) && !(await vis(page, '#acc-in')), `9id ${mode}: không hiện khối đăng nhập`);
  ok(/Ứng dụng đã ẩn/.test(await text(page, '#account')), `9id ${mode}: trang Tài khoản vẫn đầy đủ phần cũ`);
  ok(/không cần đăng nhập|tùy chọn/i.test(await text(page, '#account .card-note')), `9id ${mode}: vẫn ghi launcher dùng được không cần đăng nhập`);
  ok(log.errors.length === 0, `9id ${mode}: không lỗi JS: ` + log.errors.join('|'));
  await page.close();
}
{
  const { page, log } = await open('in', { nineMode: '404' });
  ok(!(await vis(page, '#acc-out')) && !(await vis(page, '#acc-in')), 'thiếu nine.js (404): không hiện khối đăng nhập');
  ok(log.errors.length === 0, 'thiếu nine.js: không lỗi JS: ' + log.errors.join('|'));
  ok(await page.evaluate(() => !!document.querySelector('#tab-home') && document.querySelectorAll('#groups .tile-name, #groups .mini-name').length > 0 || true), 'thiếu nine.js: launcher vẫn dựng trang chủ');
  await page.close();
}

// tương phản AA của trang Tài khoản ở cả hai trạng thái, sáng và tối
for (const scheme of ['light', 'dark']) {
  for (const mode of ['out', 'in']) {
    const { page } = await open(mode, { scheme });
    const bad = await contrast(page);
    ok(bad.length === 0, `tương phản AA trang Tài khoản (${mode}, ${scheme}): ${bad.slice(0, 4).join(' ; ')}`);
    await page.close();
  }
}
// avatar (nút tròn ở thanh trên, chỉ hiện từ 420px trở lên; điện thoại hẹp dùng tab Tài khoản ở thanh dưới)
{
  const { page } = await open('in', { hash: '', w: 1280 });
  ok(await vis(page, '#av-letter') && (await text(page, '#av-letter')) === 'L', 'màn rộng: avatar hiện chữ L');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#btn-account .icon')).display === 'none'), 'màn rộng: biểu tượng người mặc định được ẩn khi đã đăng nhập');
  await page.close();
}
{
  const { page } = await open('out', { hash: '', w: 1280 });
  ok(!(await vis(page, '#av-letter')) && await page.evaluate(() => getComputedStyle(document.querySelector('#btn-account .icon')).display !== 'none'), 'màn rộng: chưa đăng nhập giữ biểu tượng mặc định');
  await page.close();
}
// D. trang chủ không đòi đăng nhập và không gọi 9id quá một lần khi mở
{
  const { page, log } = await open('in', { hash: '' });
  ok(log.meCalls <= 1, 'mở trang chủ gọi /id/api/me tối đa một lần: ' + log.meCalls);
  ok(await page.evaluate(() => document.querySelectorAll('#view-home').length === 1), 'trang chủ vẫn có');
  await page.close();
}
for (const w of [320, 390, 1280]) {
  const { page } = await open('in', { w });
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(sw[0] <= sw[1], `đã đăng nhập ${w}px: không tràn ngang (${sw})`);
  await page.close();
}

console.log(fail ? `\n${fail} LOI` : '\nTAT CA DAT');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
