// Kiểm thử TÍCH HỢP thật giữa 9id và Osin (không dùng 9id giả). Cách chạy (từ thư mục osin/):
//     npm run integration            (hoặc: node test/integration/run.js)
// Cần Chrome (CHROME_PATH, mặc định C:/Program Files/Google/Chrome/Application/chrome.exe) và puppeteer-core (PUPPETEER_CORE, đường dẫn module ESM).
// Tự dựng 2 PostgreSQL nhúng + 9id thật + Osin thật + app giả (SDK Osin) ở cổng ngẫu nhiên >= 16000 (xem harness.js). Ảnh: osin/shots/integration/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { boot, apiSignup, ID_SECRET } from './harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, '..', '..', 'shots', 'integration');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const results = []; const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); if (!cond) problems.push(`SAI: ${name} ${extra}`); console.log(cond ? '  ok ' : '  SAI', name, cond ? '' : extra); };

const CHECK_MS = 1500;                 // khoảng kiểm lại phiên 9id (OSIN_SESSION_CHECK_MS) cho test
const sys = await boot({ sessionCheckMs: CHECK_MS });
const { osinCfg, idCfg, fam, chaos, OSIN_ORIGIN, ID_PUBLIC, ID_DIRECT } = sys;
const CALLBACK = `${OSIN_ORIGIN}/auth/callback`;
console.log('9id (edge)', ID_PUBLIC + '/id/', '| Osin', OSIN_ORIGIN + '/', '| 9id nội bộ', ID_DIRECT);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'int-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

/* ---------- tiện ích trình duyệt ---------- */
async function newPage(name, { view = { width: 390, height: 844 } } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.__name = name; page.__ctx = ctx;
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('dialog', async (d) => { problems.push(`[${name}] hộp thoại bất ngờ: ${d.message()}`); await d.dismiss(); });
  page.on('console', (m) => { if (['error'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|429|503)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  return page;
}
let shotNo = 0;
const shot = async (page, name) => { await sleep(300); await page.screenshot({ path: path.join(SHOTS, `${String(++shotNo).padStart(2, '0')}-${name}.png`) }); };
const text = (page) => page.evaluate(() => (document.body ? document.body.textContent.replace(/\s+/g, ' ') : '')).catch(() => '');
const waitText = async (page, t, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await text(page)).includes(t)) return true; await sleep(150); } throw new Error(`[${page.__name}] chờ "${t}" không thấy. URL ${page.url()}. Màn hình: ${(await text(page)).slice(0, 300)}`); };
async function tap(page, label, scope = 'button, a, [role=button]') {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const ok = await page.evaluate((label, scope) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled; });
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      const el = pool.find((e) => norm(e.textContent).includes(label) || (e.getAttribute('aria-label') || '').includes(label));
      if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
    }, label, scope);
    if (ok) return;
    await sleep(150);
  }
  throw new Error(`[${page.__name}] không thấy nút "${label}"`);
}
async function fill(page, label, value) {
  const end = Date.now() + 8000; let el = null;
  while (Date.now() < end && !el) {
    const h = await page.evaluateHandle((label) => {
      const root = [...document.querySelectorAll('.sheet')].pop() || document;
      for (const l of root.querySelectorAll('label')) if (l.textContent.trim().startsWith(label)) return document.getElementById(l.htmlFor);
      return [...root.querySelectorAll('input,textarea')].find((e) => (e.getAttribute('aria-label') || '').startsWith(label)) || null;
    }, label);
    el = h.asElement(); if (!el) await sleep(150);
  }
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  await el.click({ clickCount: 3 }); await page.keyboard.press('Backspace'); await el.type(value, { delay: 4 });
}
const waitUrl = async (page, pred, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred(page.url())) return true; await sleep(100); } return false; };
const cookieNames = async (page, url) => { const host = new URL(url).hostname; return (await page.browserContext().cookies()).filter((c) => c.domain.replace(/^\./, '') === host).map((c) => c.name); };

const osinRows = (sql, a = []) => sys.osinDb.query(sql, a);
const idRows = (sql, a = []) => sys.idDb.query(sql, a);

/* ---------- gọi HTTP thô tới Osin (cookie tự quản) ---------- */
function rawReq(url, { method = 'GET', headers = {}, host } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { ...(host ? { host } : {}), ...headers } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.end();
  });
}
const cookiesOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
const cookieVal = (res, name) => { for (const c of res.headers['set-cookie'] || []) { const [kv] = c.split(';'); if (kv.startsWith(name + '=')) return kv.slice(name.length + 1); } return ''; };

/** Người dùng 9id (API) lấy mã authorize cho Osin (đã đồng ý sẵn), trả { code, state, loc }. */
async function getAuthCode(u, { redirect = CALLBACK, state = 'st-' + crypto.randomBytes(12).toString('hex') } = {}) {
  await u.call('POST', '/api/oauth/consent', { client: 'osin' });
  const r = await u.call('GET', `/authorize?client=osin&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`);
  const loc = r.headers.get('location');
  return { status: r.status, loc, state, code: loc ? new URL(loc).searchParams.get('code') : null };
}
/** Mô phỏng trình duyệt thao tác với Osin: /auth/login -> lấy cookie state; trả { stateCookie, state } */
async function osinLogin(host) {
  const r = await rawReq(`${OSIN_ORIGIN}/auth/login`, { host });
  const st = cookieVal(r, osinCfg.cookieSecure ? '__Host-osin_st' : 'osin_st');
  return { res: r, stateCookie: st, state: new URL(r.headers.location).searchParams.get('state'), loc: r.headers.location, cookieHeader: cookiesOf(r) };
}

try {
  /* ====================== A. LUỒNG ĐẦY ĐỦ TRÊN TRÌNH DUYỆT THẬT ====================== */
  console.log('\n== A. Luồng đầy đủ bằng Chrome ==');
  const lan = await newPage('lan');
  const phone = '09' + String(40_000_000 + Math.floor(Math.random() * 9_000_000));
  const PASS = 'MatKhau-Tot-1';

  await lan.goto(OSIN_ORIGIN + '/', { waitUntil: 'networkidle0' });
  await lan.waitForSelector('.intro a.btn');
  await shot(lan, 'osin-chua-dang-nhap');
  await lan.click('.intro a.btn');
  check('Osin chuyển sang /id/authorize rồi sang đăng nhập 9id (kèm next)', await waitUrl(lan, (u) => u.startsWith(ID_PUBLIC + '/id/?next=') && u.endsWith('#/dang-nhap')), lan.url());
  const nextParam = new URL(lan.url()).searchParams.get('next');
  const nu = new URL(nextParam, ID_PUBLIC);
  check('next chứa đúng client, redirect_uri của Osin và state 32 ký tự', nu.pathname === '/id/authorize' && nu.searchParams.get('client') === 'osin' && nu.searchParams.get('redirect_uri') === CALLBACK && /^[A-Za-z0-9_-]{32}$/.test(nu.searchParams.get('state') || ''), nextParam);
  const osinState = nu.searchParams.get('state');
  check('Osin đặt cookie state host-only, 9id không nhận được cookie đó', (await cookieNames(lan, OSIN_ORIGIN)).includes('osin_st') && !(await cookieNames(lan, ID_PUBLIC)).includes('osin_st'));
  await waitText(lan, 'Đăng nhập 9app');
  await shot(lan, '9id-dang-nhap-tu-osin');

  // đăng ký bằng SĐT: OTP mock + PoW giải thật trong trình duyệt
  await tap(lan, 'Đăng ký tài khoản');
  await waitText(lan, 'Tạo tài khoản 9app');
  await fill(lan, 'Số điện thoại', phone);
  await tap(lan, 'Gửi mã xác thực');
  await waitText(lan, 'Mã gồm 6 số');
  const otp = sys.idProvider.lastOtp(sys.idUtil.normalizePhone(phone));
  check('OTP mock có mã 6 số', /^\d{6}$/.test(otp || ''), String(otp));
  await fill(lan, 'Mã xác thực', otp);
  await waitText(lan, 'Số điện thoại đã được xác minh');
  await fill(lan, 'Tên hiển thị', 'Lan');
  await fill(lan, 'Mật khẩu', PASS);
  await shot(lan, '9id-dang-ky-b3');
  await tap(lan, 'Tạo tài khoản');
  await waitText(lan, 'Cho phép Osin?');
  check('đăng ký xong quay lại authorize và hiện màn "Cho phép Osin?"', true);
  check('màn Cho phép nói rõ host của Osin', (await text(lan)).includes(new URL(OSIN_ORIGIN).host));
  await shot(lan, '9id-cho-phep-osin');
  // tạo gia đình trong 9id (để Osin lấy qua families) bằng chính phiên trình duyệt
  const famId = await lan.evaluate(async () => {
    const r = await fetch('api/families', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': '9id', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ name: 'Nhà Lan' }) });
    const j = await r.json(); return j.family ? j.family.id : (j.id || JSON.stringify(j));
  });
  check('tạo được gia đình ở 9id', /^[0-9a-f-]{36}$/.test(famId), String(famId));
  await tap(lan, 'Cho phép Osin');
  check('đồng ý xong được chuyển về Osin và vào phiên (không còn ?code=)', await waitUrl(lan, (u) => u.startsWith(OSIN_ORIGIN + '/') && !u.includes('code=')) && !lan.url().includes('loi='), lan.url());
  await lan.waitForSelector('.sheet #btn-consent, #composer:not([hidden])', { timeout: 10000 });
  check('cookie phiên Osin có ở Osin, KHÔNG có ở 9id; nine_sid ngược lại', (await cookieNames(lan, OSIN_ORIGIN)).includes('osin_sid') && !(await cookieNames(lan, OSIN_ORIGIN)).includes('nine_sid') && (await cookieNames(lan, ID_PUBLIC)).includes('nine_sid') && !(await cookieNames(lan, ID_PUBLIC)).includes('osin_sid'));
  const ck = (await lan.browserContext().cookies()).find((c) => c.name === 'osin_sid');
  check('cookie Osin HttpOnly, SameSite=Lax', ck && ck.httpSecure !== undefined ? true : !!ck, JSON.stringify(ck));
  check('cookie Osin HttpOnly', ck && ck.httpOnly === true && ck.sameSite === 'Lax');
  const rowsAfterLogin = await osinRows('SELECT user_id, display_name, session9id FROM osin_sessions');
  check('Osin có đúng một phiên với userId + sessionId9id của 9id, tên "Lan"', rowsAfterLogin.length === 1 && rowsAfterLogin[0].display_name === 'Lan' && /^[0-9a-f-]{36}$/.test(rowsAfterLogin[0].session9id), JSON.stringify(rowsAfterLogin));
  const idChild = await idRows('SELECT id, client, user_id FROM app_sessions');
  check('9id có phiên con tương ứng (client osin)', idChild.length === 1 && idChild[0].client === 'osin' && idChild[0].id === rowsAfterLogin[0].session9id);
  const userId9 = rowsAfterLogin[0].user_id;
  // đồng ý AI
  await lan.waitForSelector('.sheet #btn-consent', { timeout: 10000 });
  await shot(lan, 'osin-dong-y-ai');
  check('trước khi đồng ý, Osin chưa có đồng ý AI của người này', (await osinRows('SELECT 1 FROM user_prefs WHERE user_id=$1 AND consent_at IS NOT NULL', [userId9])).length === 0);
  await lan.click('#btn-consent');
  await lan.waitForSelector('.empty h1');
  check('Osin chào đúng tên từ 9id', (await lan.$eval('.empty h1', (e) => e.textContent)).includes('Lan'));
  const me = await lan.evaluate(async () => (await (await fetch('api/me')).json()));
  check('Osin lấy được gia đình của người dùng từ 9id (families, delegate)', me.families && me.families.length === 1 && me.families[0].id === famId && me.families[0].name === 'Nhà Lan' && me.families[0].role === 'chu', JSON.stringify(me.families));
  await shot(lan, 'osin-da-dang-nhap');

  // chat: công cụ đọc
  const ask = async (page, q) => {
    const before = (await page.$$('.row.bot .bubble:not(.think)')).length;
    await page.click('#input'); await page.type('#input', q, { delay: 2 });
    await page.click('#btn-send');
    await page.waitForFunction((n) => document.querySelectorAll('.row.bot .bubble:not(.think)').length > n && !document.getElementById('thinking'), { timeout: 15000 }, before);
  };
  await ask(lan, 'Hôm nay con đi học gì?');
  const bs = await lan.$$eval('.row .bubble', (els) => els.map((e) => e.textContent));
  check('chat gọi công cụ đọc của app giả, lịch hiện ra', bs.some((b) => b.includes('Học Toán') && b.includes('Đón con')), bs.join('|'));
  check('app giả nhận lời gọi đọc với userId của 9id và familyId thật', fam.state.calls.some((c) => c.tool === 'lich_hom_nay' && c.userId === userId9 && c.familyId === famId), JSON.stringify(fam.state.calls));
  await shot(lan, 'osin-chat-cong-cu-doc');

  // công cụ ghi: thẻ xác nhận -> xác nhận -> execute có biên nhận hợp lệ
  fam.state.executed.length = 0;
  await ask(lan, 'Thêm sữa vào danh sách đi chợ');
  await lan.waitForSelector('.card.pending');
  check('chưa bấm xác nhận thì app chưa chạy', fam.state.executed.length === 0);
  await shot(lan, 'osin-the-xac-nhan');
  await tap(lan, 'Xác nhận', '.card.pending button');
  await lan.waitForSelector('.card.done');
  check('xác nhận: app giả chạy đúng 1 lần cho đúng người (biên nhận hợp lệ, nếu không SDK đã từ chối receipt_required)', fam.state.executed.length === 1 && fam.state.executed[0].userId === userId9 && fam.state.executed[0].args.muc === 'sữa tươi', JSON.stringify(fam.state.executed));
  const aud = fam.state.audit.filter((e) => e.tool === 'them_vao_danh_sach');
  check('nhật ký kiểm toán của SDK ghi lần execute, không ghi giá trị tham số', aud.length >= 1 && !JSON.stringify(aud).includes('sữa tươi'), JSON.stringify(aud).slice(0, 300));
  await shot(lan, 'osin-xac-nhan-xong');

  // ---- đổi mật khẩu thu hồi phiên con (làm trước đăng xuất để dùng chung phiên) ----
  // thẻ chờ #2, để thử "phiên bị thu hồi giữa chừng"
  fam.state.executed.length = 0;
  await ask(lan, 'Thêm sữa vào danh sách đi chợ');
  await lan.waitForSelector('.card.pending');
  // người dùng đăng xuất ở 9id (trang khác, cùng trình duyệt)
  const idTab = await lan.browserContext().newPage();
  await idTab.goto(ID_PUBLIC + '/id/#/tai-khoan', { waitUntil: 'networkidle0' });
  await idTab.waitForFunction(() => document.body.textContent.includes('Đăng xuất'));
  await idTab.screenshot({ path: path.join(SHOTS, `${String(++shotNo).padStart(2, '0')}-9id-tai-khoan.png`) });
  const gr = await idTab.evaluate(async () => (await (await fetch('api/oauth/grants')).json()));
  check('9id liệt kê Osin trong ứng dụng đã cho phép', gr.grants && gr.grants.some((g) => g.client === 'osin'), JSON.stringify(gr));
  await idTab.evaluate(async () => { await fetch('api/logout', { method: 'POST', headers: { 'x-requested-with': '9id' } }); });
  check('đăng xuất 9id xóa phiên con ngay ở 9id (cascade)', (await idRows('SELECT 1 FROM app_sessions')).length === 0);
  await idTab.close();
  await sleep(CHECK_MS + 400);
  // bấm Xác nhận SAU khi phiên bị thu hồi: phải bị từ chối, app không chạy
  await lan.bringToFront();
  await tap(lan, 'Xác nhận', '.card.pending button');
  await sleep(1200);
  check('thẻ chờ bị bỏ qua khi phiên đã bị thu hồi giữa chừng: app KHÔNG chạy', fam.state.executed.length === 0, JSON.stringify(fam.state.executed));
  const me2 = await lan.evaluate(async () => (await fetch('api/me')).status);
  check('Osin trả 401 cho phiên đã thu hồi (trong khoảng kiểm lại)', me2 === 401, String(me2));
  check('hàng phiên Osin đã bị xóa', (await osinRows('SELECT 1 FROM osin_sessions')).length === 0);
  await lan.reload({ waitUntil: 'networkidle0' });
  await lan.waitForSelector('.intro a.btn');
  await shot(lan, 'osin-het-phien-sau-dang-xuat-9id');
  check('sau khi đăng xuất 9id, Osin về trang giới thiệu (cần đăng nhập)', true);

  // ---- đăng nhập lại (đã đồng ý nên đi thẳng) ----
  await lan.click('.intro a.btn');
  await waitText(lan, 'Đăng nhập 9app');
  check('đăng xuất ở 9id nên Osin lại bị chuyển sang đăng nhập 9id', lan.url().includes('/id/?next='), lan.url());
  await fill(lan, 'Số điện thoại', phone); await fill(lan, 'Mật khẩu', PASS);
  await tap(lan, 'Đăng nhập', 'button');
  check('đăng nhập lại: không hỏi đồng ý nữa, vào thẳng Osin', await waitUrl(lan, (u) => u.startsWith(OSIN_ORIGIN + '/') && !u.includes('code=') && !u.includes('loi=')), lan.url());
  await lan.waitForSelector('#composer:not([hidden])', { timeout: 10000 });
  check('đăng nhập lại có phiên Osin mới', (await osinRows('SELECT 1 FROM osin_sessions')).length === 1);
  await shot(lan, 'osin-dang-nhap-lai');

  // ---- đổi mật khẩu thu hồi phiên con ----
  const idTab2 = await lan.browserContext().newPage();
  await idTab2.goto(ID_PUBLIC + '/id/#/tai-khoan', { waitUntil: 'networkidle0' });
  const pw = await idTab2.evaluate(async (a, b) => {
    const r = await fetch('api/account/password', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': '9id' }, body: JSON.stringify({ currentPassword: a, newPassword: b }) });
    return r.status;
  }, PASS, 'MatKhau-Moi-2026');
  check('đổi mật khẩu ở 9id thành công', pw === 200, String(pw));
  check('đổi mật khẩu xóa phiên con ở 9id', (await idRows('SELECT 1 FROM app_sessions')).length === 0);
  await idTab2.close();
  await sleep(CHECK_MS + 400);
  const me3 = await lan.evaluate(async () => (await fetch('api/me')).status);
  check('Osin hết phiên sau khi đổi mật khẩu (<= khoảng kiểm)', me3 === 401, String(me3));
  await lan.close();
  await lan.__ctx.close();

  /* ====================== B. TRƯỜNG HỢP XẤU (HTTP, người dùng thật của 9id) ====================== */
  console.log('\n== B. Trường hợp xấu ==');
  const bob = await apiSignup(sys, { name: 'Bob' });
  const bobFam = await bob.call('POST', '/api/families', { name: 'Nhà Bob' });
  const finishLogin = async (u, over = {}) => {
    const lg = await osinLogin(over.host);
    const ac = await getAuthCode(u, { redirect: over.redirect ?? CALLBACK, state: lg.state });
    return { lg, ac };
  };
  const callback = (lg, code, { state = lg.state, host } = {}) => rawReq(`${OSIN_ORIGIN}/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { headers: { cookie: `osin_st=${lg.stateCookie}` }, host });

  // B1. luồng đúng bằng HTTP + sai state
  {
    const { lg, ac } = await finishLogin(bob);
    check('B1 /auth/login chuyển tới authorize của 9id với client=osin, redirect_uri, state', lg.loc.startsWith(`${ID_PUBLIC}/id/authorize?client=osin&redirect_uri=${encodeURIComponent(CALLBACK)}&state=`), lg.loc);
    check('B1 9id cấp mã (302 về callback của Osin kèm đúng state)', ac.status === 302 && ac.loc.startsWith(CALLBACK + '?code=') && new URL(ac.loc).searchParams.get('state') === lg.state, ac.loc);
    const bad = await callback(lg, ac.code, { state: 'state-sai-hoan-toan-12345' });
    check('B1 sai state: Osin từ chối (?loi=state), không tạo phiên', bad.status === 302 && bad.headers.location.includes('loi=state') && !cookieVal(bad, 'osin_sid'), bad.headers.location);
    check('B1 sai state: mã KHÔNG bị đốt phía 9id (Osin chưa gọi exchange)', (await idRows('SELECT 1 FROM auth_codes WHERE used_at IS NOT NULL AND code_hash=$1', [crypto.createHash('sha256').update(ac.code).digest('hex')])).length === 0);
    const nocookie = await rawReq(`${OSIN_ORIGIN}/auth/callback?code=${ac.code}&state=${lg.state}`);
    check('B1 thiếu cookie state: ?loi=state', nocookie.headers.location.includes('loi=state'));
    // state của lần đăng nhập khác (CSRF đăng nhập): cookie state A, state B
    const lg2 = await osinLogin();
    const cross = await callback(lg2, ac.code, { state: lg.state });
    check('B1 state của phiên đăng nhập khác: bị từ chối', cross.headers.location.includes('loi=state'));
    const good = await callback(lg, ac.code);
    check('B1 sau đó dùng đúng state thì vào được (mã còn nguyên)', good.status === 302 && !good.headers.location.includes('loi=') && !!cookieVal(good, 'osin_sid'), good.headers.location);
    const setck = good.headers['set-cookie'].find((c) => c.startsWith('osin_sid='));
    check('B1 cookie phiên Osin: HttpOnly, SameSite=Lax, Path=/, không Domain', /HttpOnly/i.test(setck) && /SameSite=Lax/i.test(setck) && /Path=\//i.test(setck) && !/Domain=/i.test(setck), setck);
    // B2. mã dùng lại
    const again = await callback(lg, ac.code);
    check('B2 mã dùng lại: ?loi=ma, không có phiên mới', again.headers.location.includes('loi=ma') && !cookieVal(again, 'osin_sid'), again.headers.location);
    // phiên tốt dùng được
    const bobSid = cookieVal(good, 'osin_sid');
    const m = await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${bobSid}` } });
    const mj = JSON.parse(m.body);
    check('B1 phiên Bob dùng được; Osin thấy gia đình của Bob', m.status === 200 && mj.user.displayName === 'Bob' && mj.families.length === 1 && mj.families[0].name === 'Nhà Bob', m.body.slice(0, 200));
    bob.osinSid = bobSid;
  }

  // B3. mã hết hạn
  {
    const old = idCfg.authCodeTtlSec; idCfg.authCodeTtlSec = 1;
    const { lg, ac } = await finishLogin(bob);
    idCfg.authCodeTtlSec = old;
    await sleep(2300);
    const r = await callback(lg, ac.code);
    check('B3 mã hết hạn (TTL 1 giây): ?loi=ma, không phiên', r.headers.location.includes('loi=ma') && !cookieVal(r, 'osin_sid'), r.headers.location);
  }

  // B4. redirect_uri lạ / tên miền con (Host) khác nhau
  {
    const evil = await bob.call('GET', `/authorize?client=osin&redirect_uri=${encodeURIComponent('https://evil.example/auth/callback')}&state=abcdefgh1234`);
    check('B4 redirect_uri lạ: 9id trả 400 tại chỗ, không chuyển hướng', evil.status === 400 && !evil.headers.get('location'));
    const sub = await bob.call('GET', `/authorize?client=osin&redirect_uri=${encodeURIComponent('http://evil.127.0.0.1:' + sys.osinPort + '/auth/callback')}&state=abcdefgh1234`);
    check('B4 tên miền con lạ cũng bị 400', sub.status === 400 && !sub.headers.get('location'));
    // Osin dựng redirect_uri từ Host khi chưa đặt OSIN_PUBLIC_ORIGIN (chỉ phát triển)
    const savedPO = osinCfg.publicOrigin; osinCfg.publicOrigin = '';
    try {
      const lgHost = await osinLogin(`evil.example:${sys.osinPort}`);
      check('B4 Host lạ: redirect_uri Osin gửi cho 9id mang Host lạ', new URL(lgHost.loc).searchParams.get('redirect_uri') === `http://evil.example:${sys.osinPort}/auth/callback`);
      const follow = await rawReq(lgHost.loc.replace(ID_PUBLIC, ID_DIRECT), { headers: { 'x-edge-secret': 'x' } });
      const viaEdge = await bob.call('GET', new URL(lgHost.loc).pathname.replace('/id', '') + new URL(lgHost.loc).search);
      check('B4 9id từ chối redirect_uri theo Host lạ (400)', viaEdge.status === 400 && follow.status !== 302, String(viaEdge.status));
      // callback tới bằng Host lạ nhưng mã cấp cho redirect đúng: exchange sai redirect -> không đốt mã
      const { lg, ac } = await finishLogin(bob);
      const wrongHost = await callback(lg, ac.code, { host: `evil.example:${sys.osinPort}` });
      check('B4 callback với Host lạ: ?loi=ma, không phiên', wrongHost.headers.location.includes('loi=ma') && !cookieVal(wrongHost, 'osin_sid'), wrongHost.headers.location);
      osinCfg.publicOrigin = savedPO;
      const okHost = await callback(lg, ac.code);
      check('B4 mã không bị đốt bởi lần sai Host: đúng Host thì vào được', !okHost.headers.location.includes('loi=') && !!cookieVal(okHost, 'osin_sid'), okHost.headers.location);
    } finally { osinCfg.publicOrigin = savedPO; }
  }

  // B5. sai khóa HMAC / sai client
  {
    const { createIdIdentity } = await import('../../src/identity.js');
    const { lg: _l, ac } = await finishLogin(bob);
    const wrong = createIdIdentity({ url: `http://127.0.0.1:${sys.chaosPort}/id`, keyId: 'osin', secret: 'sai-khoa-sai-khoa-sai-khoa-sai-khoa-0000' });
    const r1 = await wrong.exchange(ac.code, CALLBACK);
    check('B5 sai khóa HMAC: không đổi được mã (null), mã không bị đốt', r1 === null && (await idRows('SELECT 1 FROM auth_codes WHERE used_at IS NOT NULL AND code_hash=$1', [crypto.createHash('sha256').update(ac.code).digest('hex')])).length === 0);
    const wrongKid = createIdIdentity({ url: `http://127.0.0.1:${sys.chaosPort}/id`, keyId: 'family', secret: 'int-secret-family-0123456789abcdef-0123456' });
    let e403 = null; try { await wrongKid.exchange(ac.code, CALLBACK); } catch (e) { e403 = e; }
    check('B5 khóa của app khác (family) đổi mã client=osin: bị từ chối (403), mã không đốt', !!e403 && e403.status === 503 || (await wrongKid.exchange(ac.code, CALLBACK)) === null, String(e403 && e403.status));
    const sv = await wrong.sessionValid('00000000-0000-4000-8000-000000000000').catch((e) => e.status);
    check('B5 sai khóa HMAC với session-valid: không trả valid:true', sv === false || sv === 503, String(sv));
    const okId = sys.identity;
    const u = await okId.exchange(ac.code, CALLBACK);
    check('B5 khóa đúng đổi được mã', u && u.userId === bob.userId);
    // phát lại chính yêu cầu đã ký (nonce): dùng lại header cũ -> 9id từ chối
    const ts = String(Math.floor(Date.now() / 1000)); const nonce = crypto.randomBytes(16).toString('base64url'); const body = JSON.stringify({ sessionId9id: u.sessionId9id });
    const sig = crypto.createHmac('sha256', ID_SECRET).update(`${ts}\n${nonce}\nPOST\n/id/internal/v1/session-valid\n${crypto.createHash('sha256').update(body).digest('hex')}`).digest('hex');
    const send = () => fetch(`${ID_DIRECT}/id/internal/v1/session-valid`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-9id-key': 'osin', 'x-9id-ts': ts, 'x-9id-nonce': nonce, 'x-9id-sig': sig }, body });
    const a1 = await send(); const a2 = await send();
    check('B5 chữ ký thủ công theo spec được 9id nhận; phát lại cùng nonce bị 401', a1.status === 200 && a2.status === 401, `${a1.status}/${a2.status}`);
    await okId.sessionValid(u.sessionId9id);
    // internal không ra được từ internet qua edge
    const viaEdge = await fetch(`${ID_PUBLIC}/id/internal/v1/session-valid`, { method: 'POST', body });
    check('B5 /id/internal/ bị edge chặn (404) từ phía trình duyệt', viaEdge.status === 404);
    const noEdge = await fetch(`${ID_DIRECT}/id/api/me`);
    check('B5 yêu cầu trình duyệt không qua edge (thiếu EDGE_SECRET) bị 9id từ chối (403)', noEdge.status === 403, String(noEdge.status));
  }

  // B6. 9id bận (429), sập, trả rác: Osin giữ phiên
  {
    const sid = bob.osinSid;
    const me0 = async () => rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${sid}` } });
    check('B6 trước khi lỗi: phiên Bob còn dùng được', (await me0()).status === 200);
    for (const mode of ['429', '503', 'destroy']) {
      chaos.mode = mode;
      await sleep(CHECK_MS + 300);   // tới hạn kiểm lại
      const before = chaos.hits.length;
      const r = await me0();
      check(`B6 9id ${mode}: Osin GIỮ phiên (200), không báo sập`, r.status === 200, String(r.status));
      check(`B6 9id ${mode}: Osin có thật sự hỏi 9id`, chaos.hits.length > before);
      const anon = await rawReq(`${OSIN_ORIGIN}/api/me`);
      check(`B6 9id ${mode}: người khác (chưa đăng nhập) vẫn nhận 401 bình thường, không 503`, anon.status === 401, String(anon.status));
      const pubs = await rawReq(`${OSIN_ORIGIN}/healthz`);
      check(`B6 9id ${mode}: /healthz của Osin vẫn ok`, pubs.status === 200);
    }
    // đăng nhập mới trong lúc 9id lỗi
    chaos.mode = '429';
    const { lg, ac } = await finishLogin(bob);
    const cb = await callback(lg, ac.code);
    check('B6 9id 429 lúc đổi mã: Osin chuyển về trang chủ với ?loi=ban, không 5xx', cb.status === 302 && cb.headers.location.includes('loi=ban'), cb.headers.location);
    chaos.mode = 'destroy';
    const { lg: lg2, ac: ac2 } = await finishLogin(bob);
    const cb2 = await callback(lg2, ac2.code);
    check('B6 9id sập lúc đổi mã: ?loi=ban', cb2.status === 302 && cb2.headers.location.includes('loi=ban'), cb2.headers.location);
    chaos.mode = 'pass';
    const cb3 = await callback(lg2, ac2.code);
    check('B6 9id hồi phục: cùng mã (chưa đốt) dùng lại được', !cb3.headers.location.includes('loi=') && !!cookieVal(cb3, 'osin_sid'), cb3.headers.location);
    // trả 200 nhưng không phải JSON (ví dụ trang đăng nhập của proxy): không được đăng xuất mọi người
    chaos.mode = 'html200';
    await sleep(CHECK_MS + 300);
    const rr = await me0();
    check('B6 9id trả 200 HTML rác: Osin KHÔNG xóa phiên', rr.status === 200, String(rr.status));
    chaos.mode = 'pass';
    check('B6 hồi phục: phiên vẫn còn, kiểm lại bình thường', (await (async () => { await sleep(CHECK_MS + 300); return me0(); })()).status === 200);
  }

  // B7. phiên bị thu hồi giữa chừng (nhiều cách)
  {
    const mk = async (u) => { const { lg, ac } = await finishLogin(u); const r = await callback(lg, ac.code); return cookieVal(r, 'osin_sid'); };
    const meSt = async (sid) => (await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${sid}` } })).status;
    const carl = await apiSignup(sys, { name: 'Carl' });
    const s1 = await mk(carl); const s2 = await mk(carl);
    check('B7 hai phiên Osin của cùng người đều hoạt động', (await meSt(s1)) === 200 && (await meSt(s2)) === 200);
    await carl.call('POST', '/api/logout-all', {});
    await sleep(CHECK_MS + 300);
    check('B7 "đăng xuất tất cả" ở 9id: cả hai phiên Osin hết', (await meSt(s1)) === 401 && (await meSt(s2)) === 401);
    const dora = await apiSignup(sys, { name: 'Dora' });
    const d1 = await mk(dora);
    await dora.call('POST', '/api/account/password', { currentPassword: dora.password, newPassword: 'MatKhau-Moi-9999' });
    await sleep(CHECK_MS + 300);
    check('B7 đổi mật khẩu: phiên Osin hết, phiên 9id hiện tại còn', (await meSt(d1)) === 401 && (await dora.call('GET', '/api/me')).json.user);
    const eve = await apiSignup(sys, { name: 'Eve' });
    const e1 = await mk(eve);
    await eve.call('DELETE', '/api/oauth/grants/osin');
    await sleep(CHECK_MS + 300);
    check('B7 người dùng thu hồi quyền của Osin ở 9id: phiên Osin hết', (await meSt(e1)) === 401);
    const fay = await apiSignup(sys, { name: 'Fay' });
    const f1 = await mk(fay);
    await sys.identity.sessionValid((await osinRows('SELECT session9id FROM osin_sessions WHERE token_hash=$1', [crypto.createHash('sha256').update(f1).digest('hex')]))[0].session9id);
    // đăng xuất ngay trong Osin
    const lo = await rawReq(`${OSIN_ORIGIN}/api/logout`, { method: 'POST', headers: { cookie: `osin_sid=${f1}`, 'x-requested-with': 'osin', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', origin: OSIN_ORIGIN, referer: OSIN_ORIGIN + '/' } });
    check('B7 đăng xuất ở Osin: phiên Osin hết ngay', lo.status === 200 && (await meSt(f1)) === 401, String(lo.status));
    await sleep(500);
    check('B7 đăng xuất ở Osin gọi session-end: phiên con ở 9id bị xóa', (await idRows('SELECT 1 FROM app_sessions WHERE user_id=$1', [fay.userId])).length === 0);
    // xóa tài khoản 9id -> phiên Osin hết
    const gus = await apiSignup(sys, { name: 'Gus' });
    const g1 = await mk(gus);
    const del = await gus.call('POST', '/api/account/delete', { password: gus.password });
    await sleep(CHECK_MS + 300);
    check('B7 xóa tài khoản 9id: phiên Osin hết', del.status === 200 && (await meSt(g1)) === 401, String(del.status));
  }

  // B9. 9id chưa cho osin vào INTERNAL_DELEGATE_APPS: Osin vẫn chạy (không có gia đình), không lỗi 5xx
  {
    const saved = new Set(idCfg.internalDelegateApps); idCfg.internalDelegateApps.clear();
    sys.identity.clearCache?.();
    const hana = await apiSignup(sys, { name: 'Hana' });
    await hana.call('POST', '/api/families', { name: 'Nhà Hana' });
    const { lg, ac } = await finishLogin(hana);
    const r = await callback(lg, ac.code);
    const sid = cookieVal(r, 'osin_sid');
    const m = await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${sid}` } });
    check('B9 thiếu delegate: /api/me vẫn 200 nhưng families rỗng (cấu hình 9id sai không làm sập Osin)', m.status === 200 && JSON.parse(m.body).families.length === 0, m.body.slice(0, 120));
    for (const k of saved) idCfg.internalDelegateApps.add(k);
    sys.identity.clearCache?.();
    const m2 = await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${sid}` } });
    check('B9 có delegate: thấy gia đình', JSON.parse(m2.body).families.length === 1, m2.body.slice(0, 120));
  }

  // B8. cookie Osin giả
  {
    const { resetBadCookies } = await import('../../src/auth.js');
    resetBadCookies();
    const before = chaos.hits.length;
    const fake = crypto.randomBytes(32).toString('base64url');
    const r1 = await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${fake}` } });
    const r2 = await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=khong-hop-le` } });
    const r3 = await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${bob.osinSid.slice(0, -1)}A` } });
    const r4 = await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `nine_sid=${bob.jar.nine_sid}` } });
    check('B8 cookie Osin giả/sai/đoán gần đúng/nine_sid: đều 401', [r1, r2, r3, r4].every((r) => r.status === 401), [r1, r2, r3, r4].map((r) => r.status).join());
    check('B8 cookie giả KHÔNG gây gọi 9id nào', chaos.hits.length === before);
    const spam = []; for (let i = 0; i < 40; i++) spam.push((await rawReq(`${OSIN_ORIGIN}/api/me`, { headers: { cookie: `osin_sid=${crypto.randomBytes(32).toString('base64url')}` } })).status);
    check('B8 spam cookie giả: sau ngưỡng bị giới hạn 429', spam.includes(429), spam.join(','));
    resetBadCookies();
    // 9id không nhận cookie osin_sid
    const x = await fetch(`${ID_PUBLIC}/id/api/me`, { headers: { cookie: `osin_sid=${bob.osinSid}` } });
    check('B8 cookie osin_sid gửi sang 9id: không đăng nhập', (await x.json()).user === null);
  }

  /* ====================== C. ảnh bổ sung: khi 9id bận, Osin giữ phiên ====================== */
  console.log('\n== C. Ảnh: 9id bận mà Osin vẫn dùng được ==');
  {
    const p = await newPage('bob-busy');
    await p.setCookie({ name: 'osin_sid', value: bob.osinSid, url: OSIN_ORIGIN });
    await p.goto(OSIN_ORIGIN + '/', { waitUntil: 'networkidle0' });
    // lấy phiên Bob còn không (có thể đã bị đổi): đăng nhập lại bằng luồng thật
    const alive = await p.evaluate(async () => (await fetch('api/me')).status);
    if (alive !== 200) {
      const { lg, ac } = await finishLogin(bob);
      const r = await callback(lg, ac.code); bob.osinSid = cookieVal(r, 'osin_sid');
      await p.setCookie({ name: 'osin_sid', value: bob.osinSid, url: OSIN_ORIGIN });
    }
    chaos.mode = '429';
    await sleep(CHECK_MS + 300);
    await p.goto(OSIN_ORIGIN + '/', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#composer:not([hidden]), .sheet #btn-consent', { timeout: 10000 });
    check('C 9id trả 429 mà trang Osin vẫn mở bình thường cho người đã đăng nhập', !(await p.$('.intro a.btn')));
    await shot(p, 'osin-9id-ban-van-dung-duoc');
    chaos.mode = 'pass';
    await p.__ctx.close();
  }
} catch (e) {
  problems.push('NGOẠI LỆ: ' + (e && e.stack || e));
  console.error(e);
  try { for (const p of await browser.pages()) await p.screenshot({ path: path.join(SHOTS, `loi-${Date.now()}.png`) }).catch(() => {}); } catch { /* */ }
}

await browser.close().catch(() => {});
await sys.stop().catch(() => {});
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} kiểm tra đạt, ${shotNo} ảnh ở ${SHOTS}`);
if (problems.length) { console.log('\nVẤN ĐỀ:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('Không có lỗi.');
process.exit(0);
