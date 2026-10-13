// CUTOVER trọn vẹn với 9id THẬT: gia đình "đang chạy thật" (lược đồ cũ, phiên ẩn danh) với dữ liệu BỊA giống thật (1 gia đình, 2 con, 8 sự kiện lặp có ngoại lệ,
// ca đưa đón, việc, mua sắm, thông báo, đẩy) -> export-to-9id --dry-run rồi thật -> chủ đăng ký 9app + nhập mã -> 9family tự nối -> kiểm giao diện đủ dữ liệu.
// Chạy: node scripts/e2e-cutover.js   Ảnh: shots/final/cutover-*.png
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
const sys = await bootSystem({ legacy: true, cacheMs: 0 });
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
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|423|ERR_INTERNET_DISCONNECTED)/.test(m.text()) && !/favicon|icon\.(svg|png)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
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
const FIN = (p, name) => audit(p, name).then(() => shot(p, name));

// ---------- dữ liệu "đang chạy thật" kiểu cũ, toàn tên bịa ----------
const U = () => crypto.randomUUID();
const ID9 = { fam: U(), me: U(), bo: U(), ext: U(), k1: U(), k2: U(), ev1: U(), ev2: U(), ride: U(), rd: U() };
const F9 = (sql, p) => sys.famDb.query(sql, p);
const legacyTok = crypto.randomBytes(32).toString('base64url');
const boTok = crypto.randomBytes(32).toString('base64url');
const sleep2 = sleep;
async function seedOld() {
  await F9("INSERT INTO families(id, name, created_by_hash, created_ip, settings, rev) VALUES($1,'Nhà Cây Sồi','h-bịa','10.0.0.1','{\"esc\":{\"t1\":40,\"t2\":25,\"t3\":12,\"t4\":6,\"after\":15}}',17)", [ID9.fam]);
  await F9("INSERT INTO members(id, family_id, name, relation, role, joined_at, ics_token, recovery_hash) VALUES($1,$2,'Chị Lan Anh','me','chu',now(),'ics-chu-bia','rec-hash-bia')", [ID9.me, ID9.fam]);
  await F9("INSERT INTO members(id, family_id, name, relation, role, joined_at, ics_token) VALUES($1,$2,'Anh Hùng','bo','quan_ly',now(),'ics-bo-bia')", [ID9.bo, ID9.fam]);
  await F9("INSERT INTO members(id, family_id, name, relation, role, external, phone, note, joined_at) VALUES($1,$2,'Cô Hoa hàng xóm','don_ho','thanh_vien',true,'0900000000','áo xanh',now())", [ID9.ext, ID9.fam]);
  const h = (t) => crypto.createHash('sha256').update(t).digest('hex');
  await F9("INSERT INTO sessions(token_hash, member_id, label) VALUES($1,$2,'Điện thoại Android'),($3,$4,'iPhone')", [h(legacyTok), ID9.me, h(boTok), ID9.bo]);
  await F9("INSERT INTO children(id, family_id, name, birth_year, school, grade, color, note) VALUES($1,$3,'Mía',2017,'Tiểu học Cầu Vồng','4B','xanh','Chờ ở cổng B'),($2,$3,'Sóc',2021,'Mầm non Ánh Dương','Lá 2','cam','')", [ID9.k1, ID9.k2, ID9.fam]);
  await F9("INSERT INTO events(id, family_id, title, kind, start_date, start_time, end_time, rec_type, rec_days, notify_offsets, child_ids, member_ids, created_by) VALUES($1,$2,'Học bơi','nang_khieu','2026-09-01','15:30','16:30','weekly','{2,4}','{30}',$3,$4,$5)", [ID9.ev1, ID9.fam, [ID9.k1], [ID9.me], ID9.me]);
  await F9("INSERT INTO events(id, family_id, title, kind, start_date, all_day, rec_type, lunar_month, lunar_day, created_by) VALUES($1,$2,'Giỗ cụ','ngay_quan_trong','2026-01-01',true,'yearly_lunar',8,25,$3)", [ID9.ev2, ID9.fam, ID9.me]);
  for (let i = 0; i < 6; i++) await F9("INSERT INTO events(family_id, title, kind, start_date, start_time, created_by) VALUES($1,$2,'khac',$3,'09:00',$4)", [ID9.fam, 'Việc lẻ ' + (i + 1), '2026-10-' + String(10 + i), ID9.bo]);
  await F9("INSERT INTO event_exceptions(event_id, day, action) VALUES($1,'2026-10-08','skip')", [ID9.ev1]);
  await F9("INSERT INTO event_exceptions(event_id, day, action, title, start_time) VALUES($1,'2026-10-13','edit','Học bơi (dời)','16:00')", [ID9.ev1]);
  await F9("INSERT INTO event_fires(event_id, day, offset_min) VALUES($1,'2026-10-06',30)", [ID9.ev1]);
  await F9("INSERT INTO rides(id, family_id, child_id, dir, weekday, at_time, place, p0, p1) VALUES($1,$2,$3,'don',1,'16:30','Cổng B',$4,$5)", [ID9.ride, ID9.fam, ID9.k1, ID9.ext, ID9.bo]);
  await F9("INSERT INTO ride_days(id, family_id, ride_id, child_id, dir, day, at_time, at_ts, place, p0, p1, state, claimed_by, claimed_at) VALUES($1,$2,$3,$4,'don','2026-10-05','16:30','2026-10-05T09:30:00Z','Cổng B',$5,$6,'da_nhan',$6,now())", [ID9.rd, ID9.fam, ID9.ride, ID9.k1, ID9.ext, ID9.bo]);
  await F9("INSERT INTO ride_steps(ride_day_id, step) VALUES($1,1),($1,2)", [ID9.rd]);
  await F9("INSERT INTO tasks(family_id, title, assignee_id, due_date, created_by) VALUES($1,'Đóng học phí',$2,'2026-10-12',$3)", [ID9.fam, ID9.bo, ID9.me]);
  await F9("INSERT INTO shopping(family_id, text, added_by) VALUES($1,'Sữa tươi',$2),($1,'Trứng gà',$2),($1,'Rau muống, thịt bò',$2)", [ID9.fam, ID9.me]);
  await F9("INSERT INTO notifications(family_id, member_id, type, title, body, link, dedupe_key) VALUES($1,$2,'ride','Sắp tới giờ đón','Còn 30 phút','#/x','dd-1'),($1,$2,'task','Việc mới','','#/t',NULL)", [ID9.fam, ID9.bo]);
}

console.log('--- cutover: gia đình cũ -> 9id thật -> chủ nhận -> giao diện ---');
await step('gieo dữ liệu kiểu cũ; phiên ẩn danh cũ ở chế độ chỉ đọc có biểu ngữ', async () => {
  await seedOld(); fid = ID9.fam;
  const lp = await newUser('Phiên cũ', { anon: true });
  await lp.setCookie({ name: 'fsid', value: legacyTok, url: ORIGIN });
  await lp.goto(URL0, { waitUntil: 'networkidle0' });
  await waitText(lp, 'Gia đình đang chuyển sang tài khoản 9app');
  await FIN(lp, 'cutover-01-phien-cu-bieu-ngu');
  await tap(lp, 'Nhà Cây Sồi', { scope: 'a', wait: 900 });
  await waitText(lp, 'Dòng thời gian hôm nay');
  await FIN(lp, 'cutover-01b-phien-cu-chi-doc');
  must((await api(lp, `api/families/${fid}/tasks`, 'POST', { title: 'x' })).status === 423, 'phiên cũ không được ghi (423)');
  await lp.__ctx.close();
});

let claim;
await step('export-to-9id --dry-run chỉ liệt kê; chạy thật in mã một lần, 9id không nhận dữ liệu nhạy cảm', async () => {
  const dry = await sys.famExport.exportFamilies({ family: fid, dryRun: true, out: () => {} });
  must(dry[0].status === 'se_xuat' && dry[0].children === 2, 'dry-run phải báo sẽ xuất 2 con: ' + JSON.stringify(dry));
  must(!(await sys.idDb.query('SELECT 1 FROM families WHERE id=$1', [fid])).length, 'dry-run không được tạo gì ở 9id');
  const lines = [];
  const res = await sys.famExport.exportFamilies({ family: fid, out: (l) => lines.push(l) });
  must(res[0].status === 'da_xuat_moi' && /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(res[0].claimCode), 'phải trả mã nhận: ' + JSON.stringify(res));
  claim = res[0].claimCode;
  const dump = JSON.stringify(await Promise.all(['families', 'child_profiles', 'family_claims', 'users', 'memberships'].map((t) => sys.idDb.query(`SELECT * FROM ${t}`))));
  for (const secret of ['Tiểu học Cầu Vồng', 'Chờ ở cổng B', 'Anh Hùng', 'Cô Hoa', 'ics-chu', 'h-bịa', '0900000000']) must(!dump.includes(secret), '9id không được nhận: ' + secret);
  const again = await sys.famExport.exportFamilies({ family: fid, out: () => {} });
  must(again[0].status === 'da_xuat', 'chạy lại không xuất lần hai: ' + again[0].status);
});

let owner, ownerPg;
await step('chủ đăng ký 9app, nhập mã ở 9id; mở 9family tự nối chủ cũ; dữ liệu và giao diện đủ', async () => {
  owner = await signup(sys, { name: 'Chị Lan Anh Mới' });
  must((await owner.id('POST', '/claims/redeem', { code: claim })).status === 200, 'nhập mã thất bại');
  ownerPg = await newUser('Chủ', { acct: owner });
  await goto(ownerPg, '#/f/' + fid + '/today');
  await waitText(ownerPg, 'Dòng thời gian hôm nay');
  const me = (await api(ownerPg, 'api/me')).json;
  must(me.families.length === 1 && me.families[0].role === 'chu' && me.families[0].memberId === ID9.me, 'phải tự nối chủ cũ giữ memberId: ' + JSON.stringify(me.families));
  const t = await text(ownerPg);
  must(/Học bơi|Đón Mía|Giỗ cụ/.test(t), 'Hôm nay phải có dữ liệu cũ: ' + t.slice(0, 300));
  await FIN(ownerPg, 'cutover-02-hom-nay');
  const evs = (await api(ownerPg, `api/families/${fid}/calendar?from=2026-10-05&to=2026-10-18`)).json.events;
  const swims = evs.filter((e) => /Học bơi/.test(e.title));
  must(!swims.some((e) => e.day === '2026-10-08' || e.date === '2026-10-08'), 'ngày bị bỏ qua không được hiện');
  must(swims.some((e) => /dời/.test(e.title)), 'ngoại lệ sửa phải còn: ' + JSON.stringify(swims.map((e) => e.title)));
  must(evs.filter((e) => /Việc lẻ/.test(e.title)).length === 6, 'đủ 6 việc lẻ');
  await tab(ownerPg, 'Lịch'); await waitText(ownerPg, 'Xem tháng'); await FIN(ownerPg, 'cutover-03-lich');
  await tab(ownerPg, 'Đưa đón'); await waitText(ownerPg, 'Đón Mía'); await FIN(ownerPg, 'cutover-04-dua-don');
  await tab(ownerPg, 'Gia đình'); await waitText(ownerPg, 'Trẻ em (2/8)');
  const ft = await text(ownerPg);
  must(ft.includes('Mía') && ft.includes('Sóc') && ft.includes('Tiểu học Cầu Vồng') && ft.includes('Anh Hùng') && ft.includes('Cô Hoa'), 'Gia đình phải đủ con và thành viên cũ');
  await FIN(ownerPg, 'cutover-05-gia-dinh');
  await tap(ownerPg, 'Thành viên Anh Hùng', { wait: 600 });
  const st = await sheetText(ownerPg);
  await FIN(ownerPg, 'cutover-06-thanh-vien-cu');
  must(/chưa|Chưa/.test(st), 'tờ thành viên cũ phải nói rõ chưa nối tài khoản: ' + st.slice(0, 300));
  await closeSheet(ownerPg);
  await goto(ownerPg, '#/f/' + fid + '/tasks'); await waitText(ownerPg, 'Đóng học phí'); await FIN(ownerPg, 'cutover-07-viec');
  await goto(ownerPg, '#/f/' + fid + '/shop'); await waitText(ownerPg, 'Sữa tươi'); await FIN(ownerPg, 'cutover-08-di-cho');
  const it = (await api(ownerPg, `api/families/${fid}/shopping`)).json.items;
  must(it.length === 3, 'đủ 3 món mua sắm cũ: ' + JSON.stringify(it.map((i) => [i.text, i.aisle])));
  await goto(ownerPg, '#/f/' + fid + '/more'); await waitText(ownerPg, 'Tiện ích của cả nhà'); await FIN(ownerPg, 'cutover-09-tien-ich');
  await goto(ownerPg, '#/f/' + fid + '/inbox'); await sleep(1200);
  await shot(ownerPg, 'cutover-10-thong-bao');
  await goto(ownerPg, '#/f/' + fid + '/menu'); await waitText(ownerPg, 'Chưa có thực đơn tuần này'); await FIN(ownerPg, 'cutover-11-thuc-don');
  await goto(ownerPg, '#/f/' + fid + '/health'); await waitText(ownerPg, 'Sức khỏe gia đình');
  must((await text(ownerPg)).includes('Mía') && (await text(ownerPg)).includes('Sóc'), 'Sức khỏe phải liệt kê 2 con cũ'); await FIN(ownerPg, 'cutover-12-suc-khoe');
  await goto(ownerPg, '#/f/' + fid + '/money'); await waitText(ownerPg, 'Tiền gia đình'); await FIN(ownerPg, 'cutover-13-tien');
  must((await api(ownerPg, `api/families/${fid}/tasks`, 'POST', { title: 'Ghi được sau khi nối' })).status === 200, 'phải ghi được sau khi nối');
});

await step('phiên ẩn danh cũ hết hiệu lực khi đã có chủ; Bố cũ chưa nối: mời tài khoản mới rồi gộp, ca đưa đón chuyển theo', async () => {
  const lp = await newUser('Phiên cũ 2', { anon: true });
  await lp.setCookie({ name: 'fsid', value: legacyTok, url: ORIGIN });
  await lp.goto(URL0 + '#/f/' + fid + '/today', { waitUntil: 'networkidle0' });
  must((await api(lp, 'api/families/' + fid)).status === 401, 'phiên cũ phải bị từ chối sau khi có chủ');
  await lp.__ctx.close();
  const boAcct = await signup(sys, { name: 'Anh Hùng Mới' });
  const inv = await owner.id('POST', `/families/${fid}/invites`, { phone: boAcct.phone, role: 'quan_ly' }); must(inv.status === 200, 'mời Bố thất bại ' + inv.text);
  const i0 = (await boAcct.id('GET', '/invitations')).json.invitations[0];
  await boAcct.id('POST', `/invitations/${i0.id}/accept`, {});
  const w = (await owner.id('GET', `/families/${fid}`)).json.invitations.find((i) => i.status === 'awaiting'); if (w) await owner.id('POST', `/families/${fid}/invites/${w.id}/approve`, {});
  sys.famId.flushCaches();
  const bp = await newUser('Bố mới', { acct: boAcct });
  await goto(bp, '#/f/' + fid + '/today'); await waitText(bp, 'Dòng thời gian hôm nay');
  const boMe = (await api(bp, 'api/families/' + fid)).json.me;
  must(boMe.id !== ID9.bo, 'Bố mới có member mới trước khi gộp');
  await goto(ownerPg, '#/f/' + fid + '/me'); await waitText(ownerPg, 'Trẻ em (2/8)');
  await tap(ownerPg, 'Thành viên Anh Hùng', { wait: 600 });
  await shot(ownerPg, 'cutover-14-gop');
  const sheet = await sheetText(ownerPg);
  await closeSheet(ownerPg);
  must(/gộp|Gộp/.test(sheet), 'phải có lối gộp thành viên cũ với tài khoản mới: ' + sheet.slice(0, 400));
  const mg = await api(ownerPg, `api/families/${fid}/members/${ID9.bo}/merge`, 'POST', { into: boMe.id });
  must(mg.status === 200, 'gộp thất bại ' + JSON.stringify(mg.json));
  const rides = (await api(bp, `api/families/${fid}/rides`)).json.rides;
  must(rides[0].p1 === boMe.id, 'ca đưa đón cũ của Bố phải chuyển sang tài khoản mới');
  await goto(bp, '#/f/' + fid + '/tasks'); await waitText(bp, 'Đóng học phí'); await FIN(bp, 'cutover-15-bo-thay-viec');
});

console.log('\n--- kết quả ---');
const okN = results.filter((r) => r.ok).length;
console.log(`${okN}/${results.length} bước đạt`);
if (problems.length) { console.log('\nVấn đề phát hiện:'); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); }
await cleanup();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* bỏ qua */ }
process.exit(okN === results.length && !problems.length ? 0 : 1);
