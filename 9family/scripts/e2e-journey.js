// HÀNH TRÌNH NGƯỜI DÙNG THẬT với 9id THẬT + 9family THẬT (harness test/integration/harness.js): mẹ đăng ký bằng giao diện 9id, tạo gia đình, thêm 2 con,
// mời bố; bố nhận lời mời, nhận ca đưa đón, thêm sự kiện bằng một câu, lập thực đơn, đi chợ (gõ và giọng nói giả), ghi chi tiêu, nhập thông báo trường, số đo tăng trưởng;
// con có tài khoản nhận lời mời và thấy phần hạn chế. Ảnh 390x844 sáng và tối ở shots/final/. Tên người toàn BỊA.
// Chạy: node scripts/e2e-journey.js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { boot as bootSystem, signup, Browser } from '../test/integration/harness.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots', 'final');
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);
const jsQR = (await import('jsqr')).default;
const { PNG } = await import('pngjs');

// 9id THẬT + 9family THẬT, hai PostgreSQL nhúng, "nginx" mô phỏng ở một cổng >= 17000 (cookie nine_sid dùng chung như trên 9app.tech). Xem test/integration/harness.js.
const sys = await bootSystem({ legacy: false, cacheMs: 0 });
const { config } = await import('../src/config.js');
const { clock } = await import('../src/clock.js');
const scheduler = await import('../src/scheduler.js');
const db = await import('../src/db.js');
const vn = await import('../src/vn.js');
const { solarToLunar } = await import('../src/lunar.js');
const push = await import('../src/push.js');
config.aiRetryDelayMs = 5; config.aiKey = 'khoa-ai-e2e';
const ORIGIN = sys.ORIGIN;
const URL0 = `${ORIGIN}${config.basePath}/`;
const at = (day, hhmm = '00:00') => vn.atMs(day, hhmm);
const TODAY = '2026-10-05'; // thứ hai
clock.set(at(TODAY, '06:30'));

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9family-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const results = []; const problems = [];
const cleanup = async () => { try { await browser.close(); } catch { /* bỏ qua */ } try { await sys.stop(); } catch { /* bỏ qua */ } };
for (const sig of ['uncaughtException', 'unhandledRejection']) process.on(sig, async (err) => { console.error('LỖI KHÔNG BẮT ĐƯỢC:', err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : err); await cleanup(); process.exit(2); });
let VIEW = { width: 390, height: 844 };
let lastPage = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newUser(name, { dark = false, view = VIEW, tz = null, init = null, initArg = null, anon = false, acct = null, displayName = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: view.width < 700, hasTouch: view.width < 700 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  if (tz) await page.emulateTimezone(tz);
  if (init) await page.evaluateOnNewDocument(init, initArg);
  page.__name = name; page.__ctx = ctx; page.__dark = dark;
  if (!anon) { // tài khoản 9app thật (đăng ký bằng API 9id, OTP mock), cookie nine_sid như sau khi đăng nhập
    acct = acct || await signup(sys, { name: displayName || name });
    await page.setCookie({ name: 'nine_sid', value: acct.jar.nine_sid, url: ORIGIN });
    page.__acct = acct;
  }
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|ERR_INTERNET_DISCONNECTED)/.test(m.text()) && !/favicon|icon\.(svg|png)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText?.includes('ERR_ABORTED') && !/ERR_INTERNET_DISCONNECTED/.test(r.failure()?.errorText || '')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  return page;
}

const VISIBLE = `(e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }`;
async function find(page, text, scope = 'button, a, [role=radio], [role=tab]', exact = false) {
  lastPage = page;
  await page.bringToFront();
  let h = null;
  for (let tries = 0; tries < 16; tries++) {
    h = await page.evaluateHandle((text, scope, exact) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      const bars = els.filter((e) => e.closest('#cta, #tabs, #bar'));
      return [...pool, ...bars.filter((e) => !pool.includes(e) && !sheet)].find((e) => { const t = norm(e.textContent) || e.getAttribute('aria-label') || ''; return exact ? (t === text || e.getAttribute('aria-label') === text) : (t.includes(text) || (e.getAttribute('aria-label') || '').includes(text)); }) || null;
    }, text, scope, exact);
    if (h.asElement()) break;
    await sleep(250);
  }
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy "${text}" trên màn hình`);
  return el;
}
async function tap(page, text, o = {}) {
  const el = await find(page, text, o.scope, o.exact);
  await el.evaluate((e) => { if (!e.closest('#cta, .sheet, #tabs, #bar')) e.scrollIntoView({ block: 'center' }); });
  for (let i = 0, last = -1; i < 15; i++) { const y = await lastPage.evaluate(() => Math.round(window.scrollY)); if (y === last) break; last = y; await sleep(90); }
  await el.click();
  await sleep(o.wait ?? 250);
}
async function fieldEl(page, label) {
  lastPage = page;
  await page.bringToFront();
  await page.waitForFunction((label) => { const sheet = [...document.querySelectorAll('.sheet')].pop(); return [...document.querySelectorAll('label')].some((l) => (!sheet || sheet.contains(l)) && l.textContent.trim().startsWith(label) && l.getBoundingClientRect().width > 0); }, { timeout: 6000 }, label).catch(() => {});
  const h = await page.evaluateHandle((label) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sheet = [...document.querySelectorAll('.sheet')].pop();
    const labs = [...document.querySelectorAll('label')].filter((l) => !sheet || sheet.contains(l));
    const lab = labs.find((l) => norm(l.textContent).startsWith(label) && l.getBoundingClientRect().width > 0);
    return lab ? document.getElementById(lab.getAttribute('for')) : null;
  }, label);
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  return el;
}
async function fill(page, label, value, o = {}) {
  const el = await fieldEl(page, label);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const type = await el.evaluate((e) => e.type);
  if (o.select) { await el.select(value); return; }
  if (type === 'date' || type === 'time' || type === 'number') {
    await el.evaluate((e, v) => { e.focus(); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, value);
    return;
  }
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (value) await el.type(value, { delay: 0 });
  await sleep(380); // chờ cuộn mượt do bàn phím ảo kết thúc rồi mới thao tác tiếp
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, t, timeout = 9000) {
  await page.bringToFront();
  try { await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t); } catch { throw new Error(`[${page.__name}] chờ không thấy chữ "${t}". Màn hình hiện: ${(await text(page)).slice(0, 500).replace(/\n+/g, ' | ')}`); }
}
async function gone(page, t, timeout = 9000) { await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, t).catch(() => { throw new Error(`[${page.__name}] "${t}" vẫn còn trên màn hình`); }); }
async function noText(page, t) { if ((await text(page)).includes(t)) throw new Error(`[${page.__name}] không được thấy "${t}"`); }
async function shot(page, name) { await sleep(150); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const hashOf = (page) => page.evaluate(() => location.hash);
const api = (page, p, method = 'GET', body) => page.evaluate(async (p, method, body) => {
  const r = await fetch(new URL(p, document.baseURI), { method, headers: { 'X-Requested-With': '9family', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, p, method, body);

// kiểm tra từng màn: không tràn ngang, vùng bấm đủ lớn, chữ không quá nhỏ, tương phản cơ bản
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const out = { overflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth, sw: document.documentElement.scrollWidth, iw: window.innerWidth, small: [], tiny: [], noalt: 0, inputsNoLabel: [], lowContrast: [] };
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const sheetOn = !!document.querySelector('.sheet');
    for (const e of document.querySelectorAll('button, a.btn, a.tab, a.icon-btn, input, select, textarea, [role=radio], [role=tab]')) {
      if (!vis(e)) continue;
      if (sheetOn && !e.closest('.sheet')) continue;
      const r = e.getBoundingClientRect();
      if ((r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'file'))) out.small.push(`${e.tagName}.${e.className}:"${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (e.tagName === 'INPUT' && !e.labels?.length && !e.getAttribute('aria-label') && e.type !== 'checkbox') out.inputsNoLabel.push(e.placeholder || e.type);
    }
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const bgOf = (e) => { let n = e; while (n) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.9)) return c; n = n.parentElement; } return 'rgb(255,255,255)'; };
    for (const e of document.querySelectorAll('body *')) {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!vis(e)) continue;
      if (sheetOn && !e.closest('.sheet')) continue;
      const cs = getComputedStyle(e);
      const fs = parseFloat(cs.fontSize);
      if (fs < 13.9) out.tiny.push(`${e.tagName}.${e.className} ${fs}px "${e.textContent.trim().slice(0, 20)}"`);
      const fg = cs.color; const bg = bgOf(e);
      const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const big = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (big ? 3 : 4.5) && out.lowContrast.length < 6 && !e.closest('[disabled], .btn:disabled')) out.lowContrast.push(`${e.tagName}.${e.className} ${ratio.toFixed(2)} "${e.textContent.trim().slice(0, 20)}"`);
    }
    out.tabCut = [...document.querySelectorAll('.tab')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim());
    out.wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.sheet-back, .fchips, .tpl') && !e.classList.contains('offscreen')).slice(0, 4).map((e) => e.tagName + '.' + e.className);
    return out;
  });
  if (r.overflow) problems.push(`[${label}] TRÀN NGANG (scrollWidth ${r.sw} > ${r.iw})`);
  if (r.tabCut.length) problems.push(`[${label}] nhãn thanh dưới bị cắt: ${r.tabCut.join(', ')}`);
  if (r.wide.length) problems.push(`[${label}] phần tử vượt khung: ${r.wide.join(', ')}`);
  if (r.small.length) problems.push(`[${label}] vùng bấm < 44px: ${[...new Set(r.small)].slice(0, 5).join('; ')}`);
  if (r.tiny.length) problems.push(`[${label}] chữ < 14px: ${[...new Set(r.tiny)].slice(0, 4).join('; ')}`);
  if (r.inputsNoLabel.length) problems.push(`[${label}] ô nhập không nhãn: ${r.inputsNoLabel.join(', ')}`);
  if (r.lowContrast.length) problems.push(`[${label}] tương phản thấp: ${[...new Set(r.lowContrast)].join('; ')}`);
}

async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); if (lastPage) { await lastPage.screenshot({ path: path.join(SHOTS, 'fail-' + results.length + '.png') }).catch(() => {}); }
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const tickNow = () => scheduler.tick(clock.now());
const setClock = (day, hhmm) => clock.set(at(day, hhmm));
const closeSheet = async (p) => { await tap(p, 'Đóng', { exact: true, scope: '.sheet button', wait: 300 }); };
const reloadAt = async (p, name) => { await p.evaluate((h) => { location.hash = h; }, '#/f/' + fid + '/' + name); await p.reload({ waitUntil: 'networkidle0' }); };
const goto = async (p, hash) => { await p.goto(URL0 + hash, { waitUntil: 'networkidle0' }); };
const tab = async (p, name) => {
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(250);
  if (name === 'Việc chung') { await tap(p, 'Tiện ích', { scope: '#tabs a', wait: 500 }); await tap(p, 'Việc chung', { scope: 'a.tile', wait: 600 }); return; }
  await tap(p, name, { scope: '#tabs a', wait: 500 });
};
// mở mục "Nâng cao" ở tab Gia đình (lịch ICS, mốc nhắc)
const adv = async (p) => { if (!(await p.$('details.more[open]'))) await tap(p, 'Lịch ICS', { scope: 'summary', wait: 400 }); };
const sheetText = (p) => p.evaluate(() => [...document.querySelectorAll('.sheet')].pop()?.innerText || '');
// mở tờ chi tiết của dòng ca có chứa chữ `t`
const openRide = async (p, t) => {
  await p.bringToFront();
  const h = await p.evaluateHandle((t) => [...document.querySelectorAll('.ride')].find((c) => c.textContent.includes(t)) || null, t);
  const el = h.asElement(); if (!el) throw new Error('[' + p.__name + '] không thấy dòng ca "' + t + '"');
  await el.evaluate((c) => c.scrollIntoView({ block: 'center' })); await sleep(300);
  await (await el.$('.ev-open')).click(); await sleep(500);
};

let me, bo, ba, out, fid, RECOVERY1, RECOVERY2;
const NAMES = { me: 'Mẹ Bình Minh 🌸', bo: 'Bố Tuấn', ba: 'Bà nội Lan' };

console.log('--- 390x844, chế độ sáng ---');
const kidForm = async (p, name, year, grade, school, note) => {
  await fill(p, 'Tên gọi', name); await fill(p, 'Năm sinh', String(year)); await fill(p, 'Lớp', grade); await fill(p, 'Trường', school); if (note) await fill(p, 'Lưu ý đưa đón', note);
};
// người lớn vào gia đình bằng lời mời qua số điện thoại ở 9id (API thật), rồi mở 9family; relation là quan hệ trong nhà (phần của 9family)
const joinFamily = async (label, displayName, relation) => {
  const acct = await signup(sys, { name: displayName });
  await me.__acct.id('POST', `/families/${fid}/invites`, { phone: acct.phone, role: 'thanh_vien' });
  const inv = (await acct.id('GET', '/invitations')).json.invitations[0];
  await acct.id('POST', `/invitations/${inv.id}/accept`, {});
  const w = (await me.__acct.id('GET', `/families/${fid}`)).json.invitations.find((i) => i.status === 'awaiting');
  if (w) await me.__acct.id('POST', `/families/${fid}/invites/${w.id}/approve`, {});
  const pg = await newUser(label, { acct });
  await goto(pg, '#/f/' + fid + '/today');
  await waitText(pg, 'Hôm nay');
  const mem = (await api(pg, 'api/families/' + fid)).json.me;
  await api(pg, `api/families/${fid}/members/${mem.id}`, 'POST', { relation });
  return pg;
};
// SpeechRecognition giả: điều khiển bằng window.__sr = { mode, text, hold }
const FAKE_SR = () => {
  window.__sr = window.__sr || { mode: 'ok', text: 'mua một chai nước mắm', hold: 1500 };
  class FakeSR {
    constructor() { this.listeners = {}; }
    start() {
      const cfg = window.__sr; this._on = true; window.__srStarted = (window.__srStarted || 0) + 1;
      if (cfg.mode === 'denied') { setTimeout(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); }, 200); return; }
      if (cfg.mode === 'nospeech') { setTimeout(() => { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); }, 300); return; }
      const words = cfg.text.split(' ');
      this._t1 = setTimeout(() => { if (!this._on) return; const part = words.slice(0, Math.max(1, Math.ceil(words.length / 2))).join(' '); this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: part }], { isFinal: false })] }); }, 400);
      this._t2 = setTimeout(() => this._finish(), cfg.hold);
    }
    _finish() { if (!this._on) return; this._on = false; clearTimeout(this._t1); clearTimeout(this._t2); this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: window.__sr.text }], { isFinal: true })] }); setTimeout(() => this.onend && this.onend(), 50); }
    stop() { this._finish(); }
    abort() { this._on = false; clearTimeout(this._t1); clearTimeout(this._t2); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
};
const NO_SR = () => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; };

// ---------- hành trình ----------
const FIN = (p, name) => audit(p, name).then(() => shot(p, name));
let mama, papa, kidAcc, kid2;
const NM = { me: 'Chị Hoa Mai', bo: 'Anh Quang Vinh', kid: 'Bé Mầm Non' };
const RAND = () => '09' + String(Math.floor(30_000_000 + Math.random() * 60_000_000));
const kidPhone = RAND(); const boPhone = RAND(); const mePhone = RAND();
let ex1;

console.log('--- hành trình: mẹ, bố, con (390x844) ---');
await step('Mẹ đăng ký tài khoản 9app bằng giao diện thật rồi quay lại 9family', async () => {
  const pg = await newUser('Mẹ', { anon: true });
  await goto(pg, '');
  await waitText(pg, 'Chào mừng đến 9family');
  await FIN(pg, '01-chao');
  await tap(pg, 'Đăng ký tài khoản 9app', { wait: 1500 });
  await waitText(pg, 'Số điện thoại');
  await fill(pg, 'Số điện thoại', mePhone);
  await FIN(pg, '02-dang-ky-so');
  await tap(pg, 'Gửi mã xác thực', { exact: true, wait: 1500 });
  await waitText(pg, 'Mã xác thực');
  const code = sys.idProvider.lastOtp(sys.idUtil.normalizePhone(mePhone));
  must(code, 'không có mã OTP mock');
  const c = await pg.waitForSelector('input.otp'); await c.type(code, { delay: 20 });
  await waitText(pg, 'Số điện thoại đã được xác minh');
  await fill(pg, 'Tên hiển thị', NM.me); await fill(pg, 'Mật khẩu', 'MatKhau-Tot-1');
  await FIN(pg, '03-dang-ky-ten');
  await tap(pg, 'Tạo tài khoản', { exact: true, wait: 2500 });
  await waitText(pg, 'Tạo gia đình');
  must((await hashOf(pg)).length >= 0 && pg.url().includes('/9family/'), 'sau đăng ký phải quay lại 9family: ' + pg.url());
  mama = pg;
  const ck = (await pg.cookies()).find((c) => c.name === 'nine_sid'); must(ck, 'thiếu cookie phiên sau đăng ký');
  const acct = new Browser(sys, NM.me); acct.jar.nine_sid = ck.value; acct.phone = mePhone; acct.password = 'MatKhau-Tot-1';
  const who = await acct.id('GET', '/me'); acct.userId = who.json && (who.json.user ? who.json.user.id : who.json.id);
  mama.__acct = acct; pg.__name = 'Mẹ';
  await FIN(pg, '04-tao-gia-dinh');
});

await step('Mẹ tạo gia đình, thêm 2 con (một con có số điện thoại), mời bố bằng số điện thoại', async () => {
  const me = mama;
  await fill(me, 'Tên gia đình', 'Nhà Cây Sồi');
  await fill(me, 'Bạn là', 'me', { select: true });
  await tap(me, 'Tạo gia đình', { exact: true, wait: 1400 });
  await waitText(me, 'Bắt đầu với gia đình mới');
  fid = (await hashOf(me)).split('/')[2];
  await FIN(me, '05-hom-nay-moi');
  await tab(me, 'Gia đình'); await waitText(me, 'Trẻ em (0/8)');
  await tap(me, '+ Thêm con', { wait: 400 });
  await kidForm(me, 'Mía', 2017, '4B', 'Tiểu học Cầu Vồng', 'Chờ ở cổng B.');
  await tap(me, 'Thêm con', { exact: true, wait: 1000 });
  await waitText(me, 'Trẻ em (1/8)');
  kidAcc = await signup(sys, { name: NM.kid, phone: kidPhone });
  await tap(me, '+ Thêm con', { wait: 400 });
  await kidForm(me, 'Sóc', 2012, '9A', 'THCS Ánh Dương', '');
  await fill(me, 'Số điện thoại của con', kidPhone);
  await FIN(me, '06-them-con-co-sdt');
  await tap(me, 'Thêm con', { exact: true, wait: 1400 });
  await waitText(me, 'Trẻ em (2/8)');
  await tap(me, '+ Mời', { wait: 500 });
  await fill(me, 'Số điện thoại', boPhone);
  await FIN(me, '07-moi-bo');
  await tap(me, 'Gửi lời mời', { wait: 1200 }).catch(async () => { await tap(me, 'Mời', { exact: true, scope: '.sheet button', wait: 1200 }); });
  await shot(me, '08-da-moi');
  await sleep(500);
  const t = await text(me);
  must(/lời mời|Lời mời|đang chờ|Đang chờ/i.test(t), 'không thấy dấu hiệu lời mời đã gửi: ' + t.slice(0, 300));
  await closeSheet(me).catch(() => {});
});

await step('Bố có tài khoản, thấy lời mời ở 9family, chấp nhận, mẹ duyệt, bố vào gia đình', async () => {
  const acct = await signup(sys, { name: NM.bo, phone: boPhone });
  papa = await newUser('Bố', { acct, init: FAKE_SR });
  await goto(papa, '');
  await waitText(papa, 'Lời mời');
  await FIN(papa, '09-bo-thay-loi-moi');
  const inv = (await acct.id('GET', '/invitations')).json.invitations[0];
  must(inv, 'bố phải có lời mời');
  must((await acct.id('POST', `/invitations/${inv.id}/accept`, {})).status === 200, 'chấp nhận thất bại');
  const w = (await mama.__acct.id('GET', `/families/${fid}`)).json.invitations.find((i) => i.status === 'awaiting');
  if (w) must((await mama.__acct.id('POST', `/families/${fid}/invites/${w.id}/approve`, {})).status === 200, 'duyệt thất bại');
  await goto(papa, '#/f/' + fid + '/today');
  await waitText(papa, 'Hôm nay');
  const mem = (await api(papa, 'api/families/' + fid)).json.me;
  await api(papa, `api/families/${fid}/members/${mem.id}`, 'POST', { relation: 'bo' });
  await reloadAt(papa, 'today'); await waitText(papa, 'Dòng thời gian hôm nay');
  await FIN(papa, '10-bo-hom-nay');
});

const memberIds = async (p) => { const c = (await api(p, 'api/families/' + fid)).json; return { me: c.me, members: c.members, children: c.children }; };

await step('Bố: ca đưa đón chờ người nhận, bấm "Tôi nhận"; thêm sự kiện bằng một câu', async () => {
  const m = await memberIds(papa); const mm = await memberIds(mama);
  const kidMia = mm.children.find((k) => k.name === 'Mía');
  const r = await api(mama, `api/families/${fid}/rides`, 'POST', { childId: kidMia.id, dir: 'dua', weekdays: [1, 2, 3, 4, 5], time: '07:00', place: 'Cổng trường', p0: m.me.id, p1: mm.me.id });
  must(r.status === 200, 'tạo ca thất bại ' + JSON.stringify(r.json));
  await papa.bringToFront(); await goto(papa, '#/f/' + fid + '/today'); await waitText(papa, 'Dòng thời gian hôm nay');
  await tab(papa, 'Đưa đón'); await waitText(papa, 'Theo ngày');
  await waitText(papa, 'Tôi nhận');
  await FIN(papa, '11-bo-dua-don');
  await tap(papa, 'Tôi nhận', { scope: 'button', wait: 1200 });
  await waitText(papa, 'Bạn đã nhận'); 
  await shot(papa, '12-bo-da-nhan');
  must(!(await text(papa)).includes('Tôi nhận'), 'sau khi nhận không còn nút Tôi nhận');
  await tab(papa, 'Hôm nay');
  await tap(papa, 'Thêm', { scope: '.fab', wait: 700 }); await waitText(papa, 'Thêm gì?');
  await tap(papa, 'Sự kiện', { scope: '.sheet .pick', wait: 900 });
  await FIN(papa, '13-them-su-kien');
  const nl = await papa.waitForSelector('input[aria-label^="Gõ một câu"]');
  await nl.type('Piano thứ 7 9:30 Mía', { delay: 5 }); await papa.keyboard.press('Enter');
  await waitText(papa, 'Đã hiểu');
  await sleep(600);
  await shot(papa, '14-su-kien-mot-cau');
  const t = await papa.evaluate(() => (document.querySelector('.parsed') || {}).textContent + ' | ' + document.querySelector('input[aria-label="Tên sự kiện"]').value);
  must(/Piano/.test(t) && /Mía/.test(t) && /09:30/.test(t), 'phân tích một câu phải thấy Piano, Mía, 09:30: ' + t);
  await tap(papa, 'Lưu sự kiện', { scope: '.sheet button', wait: 1500 });
  const evs = (await api(papa, `api/families/${fid}/calendar?from=2026-10-05&to=2026-10-12`)).json.events;
  must(evs.some((e) => /Piano/.test(e.title)), 'sự kiện Piano chưa được tạo: ' + JSON.stringify(evs.map((e) => e.title)));
});


await step('Mẹ lập thực đơn tuần (bố chỉ xem): lập, đổi một món, tạo danh sách đi chợ từ thực đơn', async () => {
  const p = mama;
  await goto(p, '#/f/' + fid + '/more'); await waitText(p, 'Tiện ích của cả nhà');
  await FIN(p, '20-tien-ich');
  await tap(p, 'Thực đơn tuần', { scope: 'a.tile', wait: 900 });
  await waitText(p, 'Chưa có thực đơn tuần này');
  await goto(papa, '#/f/' + fid + '/menu'); await waitText(papa, 'Chưa có thực đơn tuần này'); must(!(await text(papa)).includes('Lập thực đơn tuần này'), 'bố không được thấy nút lập thực đơn'); await shot(papa, '21b-bo-thuc-don-trong');
  await p.bringToFront();
  await FIN(p, '21-thuc-don-trong');
  await tap(p, 'Lập luôn với thiết lập mặc định', { wait: 2500 });
  await waitText(p, 'Bữa trưa');
  await FIN(p, '22-thuc-don-ngay');
  await tap(p, 'Cả tuần', { wait: 500 });
  await shot(p, '23-thuc-don-ca-tuan');
  await tap(p, 'Theo ngày', { wait: 400 });
  await p.evaluate(() => document.querySelector('.meal .dish-row:not(.baby)').click()); await sleep(600);
  await shot(p, '24-o-mon');
  await tap(p, 'Đổi món', { wait: 1000 });
  await shot(p, '25-goi-y-doi-mon');
  await p.evaluate(() => document.querySelector('.sheet .alt-row').click()); await sleep(1200);
  await tap(p, 'Tạo danh sách đi chợ', { wait: 1800 });
  await FIN(p, '26-tao-danh-sach');
  await p.evaluate(() => { const c = document.querySelector('.sheet .cb'); c && c.click(); });
  await tap(p, 'Thêm ', { scope: '.sheet button', wait: 1800 });
  must((await hashOf(p)).endsWith('/shop'), 'phải sang màn Đi chợ: ' + await hashOf(p));
  await FIN(p, '27-di-cho');
});

await step('Bố đi chợ: gõ một món, nói hai món (giọng giả) soát lại rồi thêm, tích đã mua, Mẹ thấy ai đã mua', async () => {
  const p = papa; await goto(p, '#/f/' + fid + '/shop'); await waitText(p, 'Cần mua');
  const n0 = (await api(p, `api/families/${fid}/shopping`)).json.items.length;
  const inp = await p.waitForSelector('[data-k="add-shop"]'); await inp.type('Mua giúp mình hai hộp sữa chua nhé');
  await tap(p, 'Thêm', { scope: '.addbar .btn.primary', wait: 1500 });
  must((await api(p, `api/families/${fid}/shopping`)).json.items.some((i) => i.text === 'Sữa chua · 2 hộp'), 'gõ chữ phải được tách: Sữa chua · 2 hộp');
  await p.evaluate(() => { window.__sr = { mode: 'ok', text: 'mua một chai nước mắm với hai bó rau muống', hold: 1400 }; });
  const mic = 'button.voice-btn';
  await p.click(mic); await sleep(700);
  const st1 = await p.$eval(mic, (b) => b.getAttribute('data-voice')); must(st1 === 'listening', 'nút phải ở trạng thái đang nghe: ' + st1);
  await shot(p, '28-voice-dang-nghe');
  await p.waitForSelector('.sheet .rev-row', { timeout: 10000 });
  await FIN(p, '29-voice-soat-lai');
  await tap(p, 'Thêm 2 món', { scope: '.sheet button', wait: 1500 });
  const items = (await api(p, `api/families/${fid}/shopping`)).json.items;
  must(items.some((i) => i.text === 'Nước mắm · 1 chai') && items.some((i) => /^Rau muống · 2 bó/.test(i.text)), 'giọng nói phải thêm đúng: ' + items.map((i) => i.text).slice(-5).join('|'));
  must(items.length >= n0 + 3, 'phải thêm đủ 3 món');
  await p.evaluate(() => { const b = [...document.querySelectorAll('.shop-row .icon-btn')].find((x) => /Đã mua:|mua/i.test(x.getAttribute('aria-label') || '')); b.click(); });
  await sleep(1200);
  await shot(p, '30-da-mua');
  const items2 = (await api(p, `api/families/${fid}/shopping`)).json.items;
  must(items2.some((i) => i.bought), 'phải có món đã mua');
  await mama.bringToFront(); await goto(mama, '#/f/' + fid + '/shop'); await waitText(mama, 'Đã mua (');
  await tap(mama, 'Đã mua (', { wait: 500 });
  must((await text(mama)).includes(NM.bo), 'Mẹ phải thấy ai đã mua');
  await FIN(mama, '31-me-thay-bo-da-mua');
});

await step('Mẹ ghi chi tiêu "chợ 350k", thấy xem trước và lưu', async () => {
  const p = mama;
  await goto(p, '#/f/' + fid + '/money'); await waitText(p, 'Tiền');
  await FIN(p, '40-tien');
  const inp = await p.waitForSelector('[data-k="money-quick"]'); await inp.type('chợ 350k');
  await waitText(p, '350.000'); await shot(p, '41-tien-xem-truoc');
  await tap(p, 'Ghi khoản chi', { scope: 'button', wait: 1500 });
  await waitText(p, 'Đã ghi');
  await FIN(p, '42-tien-da-ghi');
});

await step('Nhập thông báo trường bằng cách dán chữ: đọc ra buổi họp và tiền quỹ', async () => {
  const p = papa;
  await goto(p, '#/f/' + fid + '/school'); await waitText(p, 'Đọc thông báo của trường');
  await FIN(p, '50-thong-bao-truong');
  const ta = await p.waitForSelector('textarea.school-ta');
  await ta.type('Nhà trường họp phụ huynh lúc 7h30 ngày 12/10 tại phòng học lớp 4B. Phụ huynh đóng quỹ lớp 200.000 đồng trước ngày 15/10.', { delay: 2 });
  await tap(p, 'Đọc thông báo', { exact: true, scope: 'button', wait: 2000 });
  await sleep(500);
  await FIN(p, '51-thong-bao-soat-lai');
  const t = await text(p);
  must(/họp|Họp/.test(t), 'phải đọc ra buổi họp: ' + t.slice(0, 300));
});

await step('Sức khỏe: mẹ nhập giới tính/ngày sinh của Mía và ghi số đo tăng trưởng', async () => {
  const p = mama;
  await goto(p, '#/f/' + fid + '/health'); await waitText(p, 'Sức khỏe gia đình');
  await FIN(p, '60-suc-khoe');
  await tap(p, 'Mía', { scope: 'a, button', wait: 1200 });
  await FIN(p, '61-ho-so-mia');
  const subjId = (await hashOf(p)).split('/').pop();
  await api(p, `api/families/${fid}/health/${subjId}/profile`, 'POST', { sex: 'nu', birthDate: '2017-03-12' });
  await reloadAt(p, 'health/' + subjId);
  await waitText(p, 'Tăng trưởng');
  await tap(p, 'Tăng trưởng', { scope: '[role=tab], button', wait: 800 });
  await tap(p, 'Thêm số đo', { wait: 800 });
  const val = await p.waitForSelector('input[aria-label="Giá trị"]'); await val.type('24.5');
  await tap(p, 'Lưu số đo', { scope: '.sheet button', wait: 1500 });
  await FIN(p, '62-so-do');
  const d = (await api(p, `api/families/${fid}/health/${subjId}`)).json;
  must(JSON.stringify(d).includes('24.5'), 'số đo phải được lưu');
});

await step('Con có tài khoản: nhận lời mời nối hồ sơ, chấp nhận, chỉ thấy phần hạn chế', async () => {
  const inv = (await kidAcc.id('GET', '/invitations')).json.invitations;
  must(inv && inv.length, 'con phải có lời mời');
  must((await kidAcc.id('POST', `/invitations/${inv[0].id}/accept`, {})).status === 200, 'con chấp nhận thất bại');
  const w = (await mama.__acct.id('GET', `/families/${fid}`)).json.invitations;
  const aw = (w || []).find((i) => i.status === 'awaiting'); if (aw) await mama.__acct.id('POST', `/families/${fid}/invites/${aw.id}/approve`, {});
  const kp = await newUser('Con', { acct: kidAcc });
  await goto(kp, '#/f/' + fid + '/today'); await waitText(kp, 'Hôm nay');
  await FIN(kp, '70-con-hom-nay');
  const core = (await api(kp, 'api/families/' + fid)).json;
  must(core.me.role === 'con', 'vai phải là con: ' + core.me.role);
  await tab(kp, 'Tiện ích'); await waitText(kp, 'Tiện ích của cả nhà');
  const tiles = await kp.$$eval('a.tile', (a) => a.map((x) => x.textContent.trim()));
  must(!tiles.some((t) => /Thực đơn|Đi chợ|Thông báo của trường/.test(t)), 'con không được thấy ô: ' + tiles.join('|'));
  await FIN(kp, '71-con-tien-ich');
  await tab(kp, 'Gia đình'); await waitText(kp, 'Gia đình');
  await FIN(kp, '72-con-gia-dinh');
  const dn = await api(kp, `api/families/${fid}/shopping`); must(dn.status === 403, 'con bị chặn đi chợ: ' + dn.status);
  await goto(kp, '#/f/' + fid + '/tasks'); await waitText(kp, 'Việc'); await FIN(kp, '73-con-viec');
});


await step('Bản tối 390x844: các màn quan trọng của mẹ không vỡ bố cục, đủ tương phản', async () => {
  const d = await newUser('Mẹ tối', { dark: true, acct: mama.__acct, init: FAKE_SR });
  const SCR = [['today', 'Dòng thời gian hôm nay', 'hom-nay'], ['cal', 'Xem tháng', 'lich'], ['rides', 'Theo ngày', 'dua-don'], ['more', 'Tiện ích của cả nhà', 'tien-ich'],
    ['menu', 'Thực đơn tuần', 'thuc-don'], ['shop', 'Cần mua', 'di-cho'], ['money', 'Tiền gia đình', 'tien'], ['health', 'Sức khỏe gia đình', 'suc-khoe'],
    ['school', 'Đọc thông báo của trường', 'thong-bao-truong'], ['me', 'Thành viên', 'gia-dinh']];
  for (const [route, wait, name] of SCR) {
    await goto(d, '#/f/' + fid + '/' + route); await waitText(d, wait);
    await FIN(d, 'toi-' + name);
  }
  for (const [who, pg] of [['mẹ', mama], ['bố', papa]]) { const nt = (await api(pg, `api/families/${fid}/notifications`)).json; console.log('    thông báo của ' + who + ': ' + JSON.stringify((nt.items || nt.notifications || []).map((n) => n.title + ' | ' + (n.body || n.text || '')))); }
  await d.__ctx.close();
});

// ==== TAIL ====
console.log('\n--- kết quả ---');
const okN = results.filter((r) => r.ok).length;
console.log(`${okN}/${results.length} bước đạt`);
if (problems.length) { console.log('\nVấn đề phát hiện:'); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); }
await cleanup();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* bỏ qua */ }
process.exit(okN === results.length && !problems.length ? 0 : 1);
