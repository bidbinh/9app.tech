// Kiểm tra giao diện THẬT bằng Chrome (puppeteer-core) cho hai mô-đun Sức khỏe và Tiền gia đình.
// Chạy: node scripts/e2e-hm.js   (tự dựng PostgreSQL nhúng ở cổng ngẫu nhiên + server cổng ngẫu nhiên + 9id GIẢ trong bộ nhớ, đồng hồ giả). Tên người toàn BỊA.
// Ảnh: shots/health/ và shots/money/. Kiểm: không tràn ngang, vùng chạm >= 44px, chữ >= 14px (trừ chữ trong SVG biểu đồ), không lỗi console, sáng/tối, Chữ lớn, 390x844 và 1280x800.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SH = path.join(root, 'shots', 'health'); const SM = path.join(root, 'shots', 'money');
fs.mkdirSync(SH, { recursive: true }); fs.mkdirSync(SM, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const pg = await startEmbedded({ database: 'family_e2e_hm' });
process.env.DATABASE_URL = pg.url;
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000';
process.env.MAX_FAMILIES_PER_IP_HOUR = '1000'; process.env.FAMILY_PUSH_ALLOW_ANY = '1';
const webpush = (await import('web-push')).default;
const vk = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = vk.publicKey; process.env.VAPID_PRIVATE_KEY = vk.privateKey;
const { start } = await import('../src/server.js');
const { config } = await import('../src/config.js');
const { clock } = await import('../src/clock.js');
const db = await import('../src/db.js');
const vn = await import('../src/vn.js');
const idmod = await import('../src/id.js');
const { createFakeId } = await import('../test/fake-id.js');
const fake = createFakeId();
config.idCacheMs = 0; config.legacySessions = false; config.port = 0;
idmod.setIdClient(fake.client);
const app = await start({ scheduler: false });
const port = app.server.address().port;
const ORIGIN = `http://127.0.0.1:${port}`;
const BASE = `${ORIGIN}${config.basePath}/`;
const at = (day, hhmm = '00:00') => vn.atMs(day, hhmm);
const TODAY = '2026-10-05';
clock.set(at(TODAY, '09:00'));

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9family-hm-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });
const problems = []; const steps = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = async () => { try { await browser.close(); } catch { /* bỏ qua */ } try { await app.close(); await db.close(); } catch { /* bỏ qua */ } try { await pg.stop(); } catch { /* bỏ qua */ } };
for (const sig of ['uncaughtException', 'unhandledRejection']) process.on(sig, async (err) => { console.error('LỖI:', err && err.stack ? err.stack.split('\n').slice(0, 5).join(' | ') : err); await cleanup(); process.exit(2); });

// ---------- gieo dữ liệu qua API (đồng hồ 2026-10-05) ----------
const U = Object.fromEntries(['Mẹ Bịa', 'Bố Bịa', 'Bà Bịa', 'Bé Cún Bịa'].map((n) => [n, fake.signup(n)]));
const fid = fake.createFamily(U['Mẹ Bịa'].userId, 'Nhà Cây Bịa');
fake.addMember(fid, U['Bố Bịa'].userId, 'thanh_vien'); fake.addMember(fid, U['Bà Bịa'].userId, 'thanh_vien');
const kidA = fake.addChild(fid, { name: 'Bống Bịa', birthYear: 2025 });
const kidB = fake.addChild(fid, { name: 'Cún Bịa', birthYear: 2018, linkedUserId: U['Bé Cún Bịa'].userId });
async function call(who, method, p, body) {
  const r = await fetch(`${BASE}${p}`, { method, headers: { cookie: `nine_sid=${U[who].token}`, 'x-requested-with': '9family', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status >= 300) throw new Error(`${who} ${method} ${p} -> ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
const F = `api/families/${fid}`;
for (const w of Object.keys(U)) await call(w, 'GET', F);
const H = `${F}/health`;
const subj = async (who) => (await call(who, 'GET', H)).subjects;
let sA; let sB; let sBa;
{
  const s = await subj('Mẹ Bịa');
  sA = s.find((x) => x.childId && x.name.startsWith('Bống')); sB = s.find((x) => x.childId && x.name.startsWith('Cún'));
  sBa = (await subj('Bà Bịa')).find((x) => x.kind === 'adult');
}
await call('Mẹ Bịa', 'POST', `${H}/${sA.id}/profile`, { sex: 'nu', birthDate: '2025-04-05', sharedWith: [U['Bố Bịa'] ? (await call('Bố Bịa', 'GET', F)).me.id : null].filter(Boolean) });
await call('Mẹ Bịa', 'POST', `${H}/${sB.id}/profile`, { sex: 'nam', birthDate: '2018-05-10' });
const add = (who, sid, kind, day, v1, extra = {}) => call(who, 'POST', `${H}/${sid}/measures`, { kind, day, v1, ...extra });
for (const [d, w, h, hc] of [['2025-04-06', 3.2, 49.5, 34], ['2025-07-05', 5.9, 61, 40.5], ['2025-10-05', 7.6, 67.5, 43.2], ['2026-01-05', 8.6, 72, 44.8], ['2026-04-05', 9.3, 76, 45.8], ['2026-10-05', 10.4, 82, 47]]) {
  await add('Mẹ Bịa', sA.id, 'weight', d, w); await add('Mẹ Bịa', sA.id, 'height', d, h); await add('Mẹ Bịa', sA.id, 'head', d, hc);
}
for (const [d, w, h] of [['2024-05-10', 20.5, 115], ['2025-05-10', 23, 122], ['2026-10-01', 26.5, 128]]) { await add('Mẹ Bịa', sB.id, 'weight', d, w); await add('Mẹ Bịa', sB.id, 'height', d, h); }
await call('Mẹ Bịa', 'POST', `${H}/${sA.id}/vaccines/schedule`, {});
{
  const d = await call('Mẹ Bịa', 'GET', `${H}/${sA.id}`);
  for (const v of d.vaccines.filter((x) => ['vgb0', 'lao', 'dpt1', 'opv1', 'rota1', 'dpt2', 'opv2', 'rota2', 'dpt3', 'opv3', 'ipv1', 'soi9'].includes(x.code))) await call('Mẹ Bịa', 'POST', `${H}/${sA.id}/vaccines/${v.id}`, { doneOn: v.dueDate <= TODAY ? v.dueDate : TODAY });
}
const medA = await call('Mẹ Bịa', 'POST', `${H}/${sA.id}/meds`, { name: 'Thuốc ho Bịa', dose: '5 ml theo đơn', times: ['08:00', '20:00'], startDate: '2026-10-03', endDate: '2026-10-09', stock: 9 });
await call('Mẹ Bịa', 'POST', `${H}/${sA.id}/visits`, { day: '2026-09-28', place: 'Phòng khám Nhi Bịa', doctor: 'BS. Bịa', reason: 'Ho kéo dài', conclusion: 'Viêm họng nhẹ, uống thuốc theo đơn', prescription: 'Thuốc ho Bịa 5 ml x 2 lần/ngày', recheckDate: '2026-10-12', addToCalendar: true });
for (const [d, s, di, p] of [['2026-09-20', 128, 82, 72], ['2026-09-23', 132, 84, 74], ['2026-09-26', 138, 86, 70], ['2026-09-29', 142, 90, 76], ['2026-10-01', 136, 85, 72], ['2026-10-03', 148, 94, 80], ['2026-10-04', 145, 92, 78]]) await call('Bà Bịa', 'POST', `${H}/${sBa.id}/measures`, { kind: 'bp', day: d, v1: s, v2: di, v3: p });
for (const [d, g, c] of [['2026-09-22', 5.6, 'doi'], ['2026-09-25', 8.4, 'sau_an'], ['2026-09-30', 6.4, 'doi'], ['2026-10-03', 7.3, 'doi']]) await call('Bà Bịa', 'POST', `${H}/${sBa.id}/measures`, { kind: 'glucose', day: d, v1: g, ctx: c });
await call('Bà Bịa', 'POST', `${H}/${sBa.id}/meds`, { name: 'Thuốc huyết áp Bịa', dose: '1 viên theo đơn', times: ['07:30'], startDate: '2026-09-01' });
await call('Bà Bịa', 'POST', `${H}/${sBa.id}/profile`, { sharedWith: [(await call('Mẹ Bịa', 'GET', F)).me.id] });
const M = `${F}/money`;
const exp = [['2026-07-12', 4200000, 'an_uong'], ['2026-08-10', 5600000, 'di_cho'], ['2026-08-20', 900000, 'dien_nuoc'], ['2026-09-05', 6100000, 'di_cho'], ['2026-09-18', 1500000, 'hoc_hanh'], ['2026-09-25', 800000, 'y_te'],
  ['2026-10-01', 350000, 'di_cho'], ['2026-10-02', 1200000, 'dien_nuoc'], ['2026-10-03', 2100000, 'hoc_hanh'], ['2026-10-04', 450000, 'an_uong'], ['2026-10-05', 1800000, 'di_cho'], ['2026-10-05', 600000, 'y_te'], ['2026-10-05', 120000, 'khac']];
for (const [day, amount, category] of exp) await call(day.endsWith('03') ? 'Bố Bịa' : 'Mẹ Bịa', 'POST', `${M}/expenses`, { day, amount, category, note: { an_uong: 'Ăn sáng cả nhà', di_cho: 'Đi chợ tuần', dien_nuoc: 'Tiền điện', hoc_hanh: 'Học thêm Toán', y_te: 'Mua thuốc', khac: 'Linh tinh' }[category] });
await call('Mẹ Bịa', 'POST', `${M}/budget`, { budget: 8000000 });
await call('Mẹ Bịa', 'POST', `${M}/dues`, { title: 'Học phí tháng 10', amount: 1500000, dueDate: '2026-10-03', childId: kidA.id });
await call('Mẹ Bịa', 'POST', `${M}/dues`, { title: 'Quỹ lớp Cún', amount: 200000, dueDate: '2026-10-07', childId: kidB.id });
const paidDue = await call('Mẹ Bịa', 'POST', `${M}/dues`, { title: 'Tiền ăn bán trú', amount: 600000, dueDate: '2026-09-30', childId: kidB.id });
await call('Mẹ Bịa', 'POST', `${M}/dues/${paidDue.id}`, { paid: true, paidOn: '2026-09-29' });
await call('Mẹ Bịa', 'POST', `${M}/allowance/${kidB.id}`, { amount: 50000, period: 'tuan', goalName: 'Xe đạp mới', goalAmount: 2000000 });
await call('Mẹ Bịa', 'POST', `${M}/allowance/${kidB.id}/entries`, { kind: 'dua', amount: 400000, day: '2026-09-20' });
await call('Mẹ Bịa', 'POST', `${M}/allowance/${kidB.id}/entries`, { kind: 'chi', amount: 85000, day: '2026-10-02', note: 'Sách truyện' });
await call('Mẹ Bịa', 'POST', `${M}/allowance/${kidA.id}`, { amount: 0, period: 'tuan' });

// ---------- trình duyệt ----------
async function open(who, { view = { width: 390, height: 844 }, dark = false, big = false, hash = '', say = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: view.width < 700, hasTouch: view.width < 700 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.setCookie({ name: 'nine_sid', value: U[who].token, url: ORIGIN });
  if (say) await page.evaluateOnNewDocument((say) => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: say }], { isFinal: true })] }); }, 700); } stop() { setTimeout(() => this.onend && this.onend(), 50); } abort() {} }; }, say);
  if (big) await page.evaluateOnNewDocument(() => { try { localStorage.setItem('9family.big', 'true'); } catch { /* bỏ qua */ } });
  page.__ctx = ctx; page.__name = who + (dark ? ':tối' : '') + (big ? ':chữ lớn' : '') + (view.width > 700 ? ':máy tính' : '');
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/favicon|icon\.(svg|png)|Failed to load resource.*(40[0-9])/.test(m.text())) problems.push(`[${page.__name}] console ${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problems.push(`[${page.__name}] pageerror: ${e.message}`));
  await page.goto(BASE + (hash ? '#/f/' + fid + '/' + hash : ''), { waitUntil: 'load', timeout: 60000 });
  await sleep(1200);
  return page;
}
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, '#/f/' + fid + '/' + hash); await sleep(700); };
const bodyText = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, t, timeout = 8000) {
  try { await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t); }
  catch { throw new Error(`[${page.__name}] chờ không thấy "${t}". Màn hình: ${(await bodyText(page)).replace(/\s+/g, ' ').slice(0, 300)}`); }
}
async function noText(page, t) { if ((await bodyText(page)).includes(t)) throw new Error(`[${page.__name}] không được thấy "${t}"`); }
async function tap(page, text, { exact = false, scope = 'button, a, summary, [role=tab], [role=radio]' } = {}) {
  let el = null;
  for (let i = 0; i < 16 && !el; i++) {
    const h = await page.evaluateHandle((text, scope, exact) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      return [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!sheet || sheet.contains(e)); })
        .find((e) => { const t = norm(e.textContent) || ''; const a = e.getAttribute('aria-label') || ''; return exact ? (t === text || a === text) : (t.includes(text) || a.includes(text)); }) || null;
    }, text, scope, exact);
    el = h.asElement(); if (!el) await sleep(250);
  }
  if (!el) throw new Error(`[${page.__name}] không thấy nút "${text}"`);
  await el.evaluate((e) => { if (!e.closest('#cta, .sheet, #tabs, #bar')) e.scrollIntoView({ block: 'center' }); });
  await sleep(250);
  await el.click(); await sleep(400);
}
async function typeIn(page, sel, value) {
  const el = await page.waitForSelector(sel, { visible: true, timeout: 6000 });
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await sleep(200);
  await el.click({ clickCount: 3 }); await page.keyboard.press('Backspace');
  await el.type(value, { delay: 5 }); await sleep(300);
}
async function shot(page, dir, name) { await sleep(250); await page.screenshot({ path: path.join(dir, name + '.png') }); }
async function fullShot(page, dir, name) { await sleep(250); await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true }); }

// kiểm tra giao diện: tràn ngang, vùng chạm, cỡ chữ
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const out = [];
    const W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > W + 1) out.push('tràn ngang ' + document.documentElement.scrollWidth + ' > ' + W);
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const underSheet = (e) => { const s = [...document.querySelectorAll('.sheet')].pop(); return s && !s.contains(e); };
    document.querySelectorAll('button, a.btn, a.tab, a.icon-btn, input:not([type=hidden]), select, textarea, [role=tab], [role=radio], summary, a.list-row, a.pick').forEach((e) => {
      if (!vis(e) || underSheet(e)) return;
      const r = e.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.push('vùng chạm nhỏ ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30));
    });
    const seen = new Set();
    document.querySelectorAll('body *').forEach((e) => {
      if (e.closest('svg') || !vis(e) || underSheet(e) || e.closest('.printbox')) return;
      const direct = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!direct) return;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 13.99 && !seen.has(fs + e.className)) { seen.add(fs + e.className); out.push('chữ nhỏ ' + fs + 'px: ' + e.textContent.trim().slice(0, 30)); }
    });
    return out;
  });
  for (const m of r) problems.push(`[${page.__name}] ${label}: ${m}`);
  steps.push(`${page.__name} / ${label}${r.length ? ` (${r.length} cảnh báo)` : ''}`);
}

let exit = 0;
try {
  const me = await open('Mẹ Bịa', { hash: 'more' });
  await waitText(me, 'Sức khỏe'); await shot(me, SH, '01-tien-ich'); await audit(me, 'Tiện ích');
  await tap(me, 'Sức khỏe'); await waitText(me, 'Sức khỏe gia đình');
  await shot(me, SH, '02-danh-sach'); await audit(me, 'danh sách sức khỏe');
  await waitText(me, 'Bống Bịa');
  if (!(await bodyText(me)).includes('Bà Bịa')) throw new Error('Mẹ phải thấy hồ sơ Bà vì Bà đã chia sẻ');
  await tap(me, 'Bống Bịa'); await waitText(me, 'Tổng quan');
  await shot(me, SH, '03-be-tong-quan'); await audit(me, 'hồ sơ bé: tổng quan');
  await tap(me, 'Tăng trưởng', { scope: '[role=tab]' }); await waitText(me, 'phần trăm thứ');
  await shot(me, SH, '04-tang-truong-can-nang'); await audit(me, 'tăng trưởng: cân nặng');
  await tap(me, 'Chiều', { scope: '.optchip' }); await sleep(300); await shot(me, SH, '05-tang-truong-chieu-cao');
  await tap(me, 'Vòng đầu', { scope: '.optchip' }); await sleep(300); await shot(me, SH, '06-tang-truong-vong-dau');
  await tap(me, 'BMI', { scope: '.optchip' }); await sleep(300); await shot(me, SH, '07-tang-truong-bmi'); await audit(me, 'tăng trưởng: BMI');
  await tap(me, 'Tiêm chủng', { scope: '[role=tab]' }); await waitText(me, 'Đã tiêm');
  await fullShot(me, SH, '08-tiem-chung'); await audit(me, 'tiêm chủng');
  await tap(me, 'Thuốc', { scope: '[role=tab]' }); await waitText(me, 'Thuốc ho Bịa');
  await shot(me, SH, '09-thuoc'); await audit(me, 'thuốc');
  await tap(me, 'Uống 08:00', { scope: '.slot' }); await waitText(me, 'Đã uống 08:00');
  await shot(me, SH, '10-thuoc-da-uong');
  await tap(me, 'Hoàn tác', { scope: '.t-undo' }); await sleep(600);
  if (!(await bodyText(me)).includes('Uống 08:00')) throw new Error('Hoàn tác "đã uống" không có tác dụng');
  await tap(me, 'Khám', { scope: '[role=tab]' }); await waitText(me, 'Phòng khám Nhi Bịa');
  await shot(me, SH, '11-kham'); await audit(me, 'hồ sơ khám');
  await tap(me, 'Thêm lần khám', { scope: '.fab' }); await waitText(me, 'Thêm tái khám vào lịch');
  await shot(me, SH, '12-them-lan-kham'); await audit(me, 'sheet thêm lần khám');
  await page_close_sheet(me);
  await tap(me, 'Tổng quan', { scope: '[role=tab]' });
  await tap(me, 'Thêm số đo').catch(() => {});
  // thêm số đo cân nặng qua giao diện
  await tap(me, 'Tăng trưởng', { scope: '[role=tab]' });
  await tap(me, 'Cân nặng', { scope: '.optchip' }).catch(() => {});
  await tap(me, 'Thêm số đo', { scope: '.fab' }); await waitText(me, 'Loại số đo');
  await typeIn(me, '.sheet input[aria-label="Giá trị"]', '10,6');
  await shot(me, SH, '13-them-so-do'); await audit(me, 'sheet thêm số đo');
  await tap(me, 'Lưu số đo'); await waitText(me, 'Đã lưu số đo');
  // bé lớn: chuẩn 5-19 tuổi
  await go(me, 'health'); await tap(me, 'Cún Bịa'); await tap(me, 'Tăng trưởng', { scope: '[role=tab]' }); await waitText(me, 'phần trăm thứ');
  await shot(me, SH, '14-be-lon-chieu-cao-5-19'); await audit(me, 'bé lớn: chiều cao (WHO 5-19)');
  await tap(me, 'Cân nặng', { scope: '.optchip' }); await sleep(300);
  await waitText(me, 'WHO không có đường chuẩn'); await shot(me, SH, '15-be-lon-can-nang-an-duong-chuan');
  // hồ sơ Bà do Bà chia sẻ: Mẹ chỉ xem
  await go(me, 'health'); await tap(me, 'Bà Bịa'); await waitText(me, 'Chỉ xem');
  await tap(me, 'Chỉ số', { scope: '[role=tab]' }); await sleep(300);
  await shot(me, SH, '16-me-xem-ho-so-ba-chi-xem');
  if ((await me.$('.fab')) !== null) throw new Error('Người chỉ xem không được có nút thêm');
  // ===== Bà: người lớn tự quản =====
  const ba = await open('Bà Bịa', { hash: 'health' });
  await waitText(ba, 'Bà Bịa'); await noText(ba, 'Bống Bịa');
  await shot(ba, SH, '17-ba-danh-sach'); await audit(ba, 'Bà: danh sách (chỉ hồ sơ của mình)');
  await tap(ba, 'Bà Bịa'); await tap(ba, 'Chỉ số', { scope: '[role=tab]' }); await waitText(ba, 'Huyết áp theo thời gian');
  await shot(ba, SH, '18-ba-huyet-ap'); await audit(ba, 'Bà: huyết áp');
  await tap(ba, 'Đường huyết', { scope: '.optchip' }); await sleep(300); await shot(ba, SH, '19-ba-duong-huyet'); await audit(ba, 'Bà: đường huyết');
  await tap(ba, 'Huyết áp', { scope: '.optchip' }); await sleep(300);
  await tap(ba, 'Thêm số đo', { scope: '.fab' }); await sleep(300);
  await typeIn(ba, '.sheet input[aria-label="Giá trị"]', '190'); await typeIn(ba, '.sheet input[aria-label="Tâm trương"]', '105');
  await shot(ba, SH, '20-ba-them-huyet-ap'); await tap(ba, 'Lưu số đo');
  await waitText(ba, 'gọi 115'); await shot(ba, SH, '21-canh-bao-cap-cuu'); await audit(ba, 'cảnh báo cấp cứu');
  await tap(ba, 'Đã hiểu');
  await tap(ba, 'Tổng quan', { scope: '[role=tab]' }); await sleep(300);
  await fullShot(ba, SH, '22-ba-tong-quan-chia-se'); await ba.__ctx.close();
  // ===== Bố: thành viên thường =====
  const bo = await open('Bố Bịa', { hash: 'health' });
  await waitText(bo, 'Bố Bịa'); await waitText(bo, 'Bống Bịa'); await noText(bo, 'Cún Bịa'); await noText(bo, 'Bà Bịa'); // Bố được giao phụ trách Bống
  await shot(bo, SH, '23-bo-thay-ho-so-minh-va-be-phu-trach'); await bo.__ctx.close();
  // ===== Cún (vai con): chỉ hồ sơ của mình, mức hạn chế =====
  const con = await open('Bé Cún Bịa', { hash: 'health' });
  await waitText(con, 'Cún Bịa'); await noText(con, 'Bống Bịa');
  await tap(con, 'Cún Bịa'); await waitText(con, 'Xem ở mức hạn chế'); await noText(con, 'Thuốc');
  await shot(con, SH, '24-con-xem-han-che'); await audit(con, 'vai con: hồ sơ hạn chế'); await con.__ctx.close();

  // ===== Tiền =====
  const mo = await open('Mẹ Bịa', { hash: 'more' });
  await tap(mo, 'Tiền gia đình'); await waitText(mo, 'Ghi nhanh một khoản chi');
  await shot(mo, SM, '01-chi-tieu-tong-quan'); await audit(mo, 'tiền: chi tiêu');
  await typeIn(mo, 'input[aria-label="Ghi nhanh một khoản chi"]', 'chợ 350k');
  await waitText(mo, '350.000 đ'); await waitText(mo, 'Đi chợ');
  await shot(mo, SM, '02-go-mot-cau'); await audit(mo, 'tiền: gõ một câu');
  await tap(mo, 'Ghi khoản chi'); await waitText(mo, 'Đã ghi 350.000 đ');
  await shot(mo, SM, '03-da-ghi-hoan-tac');
  await tap(mo, 'Hoàn tác', { scope: '.t-undo' }); await sleep(700);
  await typeIn(mo, 'input[aria-label="Ghi nhanh một khoản chi"]', 'điện 1tr2 hôm qua'); await waitText(mo, '1.200.000 đ'); await waitText(mo, 'Điện nước');
  await tap(mo, 'Ghi khoản chi'); await waitText(mo, 'Đã ghi 1.200.000 đ'); await sleep(500);
  await fullShot(mo, SM, '04-chi-tieu-day-du');
  await tap(mo, 'Đặt ngân sách tháng'); await waitText(mo, 'Ngân sách (đồng)'); await shot(mo, SM, '05-ngan-sach'); await audit(mo, 'sheet ngân sách'); await page_close_sheet(mo);
  await tap(mo, 'Phải đóng', { scope: '[role=tab]' }); await waitText(mo, 'Học phí tháng 10');
  await shot(mo, SM, '06-phai-dong'); await audit(mo, 'tiền: phải đóng');
  await tap(mo, 'Thêm khoản', { scope: '.fab' }); await waitText(mo, 'Hạn đóng'); await shot(mo, SM, '07-them-khoan-phai-dong'); await audit(mo, 'sheet thêm khoản'); await page_close_sheet(mo);
  await tap(mo, 'Tiêu vặt', { scope: '[role=tab]' }); await waitText(mo, 'Số dư trong sổ');
  await shot(mo, SM, '08-tieu-vat'); await audit(mo, 'tiền: tiêu vặt');
  await tap(mo, 'Đã đưa tuần này'); await waitText(mo, 'Đã ghi đưa tiền'); await sleep(400);
  await tap(mo, 'Con tiêu'); await typeIn(mo, '.sheet input[aria-label="Số tiền"]', '15k'); await shot(mo, SM, '09-con-tieu'); await tap(mo, 'Lưu'); await waitText(mo, 'Đã ghi vào sổ');
  await shot(mo, SM, '10-tieu-vat-sau-khi-ghi');
  // giọng nói (Web Speech giả): rảnh -> đang nghe -> đang xử lý -> kết quả điền vào ô để soát, tách số tiền, không lưu nguyên câu
  const vo = await open('Mẹ Bịa', { hash: 'money', say: 'điện một triệu hai trăm nghìn' });
  await waitText(vo, 'Ghi nhanh một khoản chi');
  await tap(vo, 'Nói để ghi khoản chi', { scope: '.voice-btn' }); await waitText(vo, 'Đang nghe');
  await shot(vo, SM, '16-giong-noi-dang-nghe'); await audit(vo, 'giọng nói: đang nghe');
  await vo.waitForFunction(() => { const e = document.querySelector('input[aria-label="Ghi nhanh một khoản chi"]'); return e && e.value.includes('điện'); }, { timeout: 12000 }).catch(() => { throw new Error('Giọng nói chưa điền vào ô'); });
  await waitText(vo, 'Soát lại rồi bấm Ghi'); await waitText(vo, 'Điện nước'); await shot(vo, SM, '17-giong-noi-ket-qua-de-soat'); await audit(vo, 'giọng nói: kết quả');
  await tap(vo, 'Ghi khoản chi'); await waitText(vo, 'Đã ghi 1.200.000 đ'); await vo.__ctx.close();
  const stored = (await call('Mẹ Bịa', 'GET', M)).expenses.find((e) => e.amount === 1200000 && e.note !== 'Tiền điện');
  if (!stored || /một triệu|nghìn/.test(stored.note)) throw new Error('Không được lưu nguyên câu nói làm ghi chú: ' + JSON.stringify(stored));
  // Bố: tổng và khoản của mình, không thấy tiêu vặt
  const boM = await open('Bố Bịa', { hash: 'money' });
  await waitText(boM, 'Ghi nhanh một khoản chi'); await noText(boM, 'Tiêu vặt');
  await shot(boM, SM, '11-bo-thanh-vien-chi-thay-khoan-cua-minh'); await audit(boM, 'Bố: tiền'); await boM.__ctx.close();
  // Cún (vai con): chỉ tiêu vặt + khoản của mình
  const conM = await open('Bé Cún Bịa', { hash: 'money' });
  await waitText(conM, 'Số dư trong sổ'); await noText(conM, 'Ghi nhanh'); await noText(conM, 'Học phí tháng 10');
  await shot(conM, SM, '12-con-tieu-vat-cua-minh'); await audit(conM, 'vai con: tiền'); await conM.__ctx.close();

  // ===== tối, Chữ lớn, máy tính =====
  const dk = await open('Mẹ Bịa', { hash: 'health', dark: true });
  await tap(dk, 'Bống Bịa'); await tap(dk, 'Tăng trưởng', { scope: '[role=tab]' }); await waitText(dk, 'phần trăm thứ');
  await shot(dk, SH, '25-toi-tang-truong'); await audit(dk, 'tối: tăng trưởng');
  await go(dk, 'money'); await waitText(dk, 'Ghi nhanh một khoản chi'); await shot(dk, SM, '13-toi-chi-tieu'); await audit(dk, 'tối: chi tiêu'); await dk.__ctx.close();
  const bg = await open('Mẹ Bịa', { hash: 'health', big: true });
  await tap(bg, 'Bống Bịa'); await tap(bg, 'Thuốc', { scope: '[role=tab]' }); await waitText(bg, 'Thuốc ho Bịa');
  await shot(bg, SH, '26-chu-lon-thuoc'); await audit(bg, 'Chữ lớn: thuốc');
  await go(bg, 'money'); await waitText(bg, 'Ghi nhanh một khoản chi'); await shot(bg, SM, '14-chu-lon-chi-tieu'); await audit(bg, 'Chữ lớn: tiền'); await bg.__ctx.close();
  const dt = await open('Mẹ Bịa', { hash: 'health', view: { width: 1280, height: 800 } });
  await tap(dt, 'Bống Bịa'); await tap(dt, 'Tăng trưởng', { scope: '[role=tab]' }); await waitText(dt, 'phần trăm thứ');
  await shot(dt, SH, '27-may-tinh-tang-truong'); await audit(dt, 'máy tính: tăng trưởng');
  await go(dt, 'money'); await waitText(dt, 'Ghi nhanh một khoản chi'); await shot(dt, SM, '15-may-tinh-chi-tieu'); await audit(dt, 'máy tính: tiền');
  // in tóm tắt: dựng hộp in và kiểm có nội dung (không bấm in thật)
  await go(me, 'health'); await tap(me, 'Bống Bịa'); await tap(me, 'Tổng quan', { scope: '[role=tab]' });
  await me.evaluate(() => { window.__printed = false; window.print = function () { window.__printed = true; }; });
  await tap(me, 'In / lưu PDF tóm tắt'); await sleep(400);
  if (!(await me.evaluate(() => window.__printed))) throw new Error('Nút in không gọi window.print');
  const pr = await me.evaluate(() => { const b = document.getElementById('printbox'); return b ? b.innerText : null; });
  if (!pr || !pr.includes('Tóm tắt sức khỏe: Bống Bịa') || !pr.includes('không phải chẩn đoán')) throw new Error('Hộp in tóm tắt thiếu nội dung: ' + String(pr).slice(0, 100));
  await me.emulateMediaType('print'); await sleep(200);
  await me.pdf({ path: path.join(SH, '28-tom-tat-in.pdf'), format: 'A4' });
  await me.emulateMediaType('screen');
} catch (e) { console.error('THẤT BẠI:', e.message); exit = 1; if (problems.length) console.error('Lỗi console trước đó: ' + [...new Set(problems)].slice(0, 8).join(' || ')); }

async function page_close_sheet(page) { await tap(page, 'Đóng', { exact: true, scope: '.sheet button' }); }

console.log(steps.join('\n'));
const uniq = [...new Set(problems)];
console.log(uniq.length ? 'CẢNH BÁO GIAO DIỆN/CONSOLE:\n' + uniq.join('\n') : 'Không có cảnh báo giao diện hay lỗi console.');
await cleanup();
process.exit(exit || (uniq.length ? 3 : 0));
