// Kiểm tra giao diện thật (Chrome) cho Thực đơn tuần, Đi chợ nâng cao, giọng nói (SpeechRecognition giả) và nhập thông báo trường.
// Chạy: node scripts/e2e-menu.js   Ảnh chụp: shots/menu/. Dữ liệu mẫu bịa, PostgreSQL nhúng cổng ngẫu nhiên, đồng hồ giả.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', 'shots', 'menu');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = []; const checks = [];
const check = (name, cond, extra = '') => { checks.push([name, !!cond]); if (!cond) problems.push(`KHÔNG ĐẠT: ${name} ${extra}`); console.log(`${cond ? 'ok       ' : 'KHONG DAT '}${name}${cond ? '' : ' ' + extra}`); };

// ---------- dựng máy chủ: PostgreSQL nhúng (cổng ngẫu nhiên), 9id GIẢ trong bộ nhớ, đồng hồ giả. Dữ liệu mẫu toàn tên bịa. ----------
async function boot() {
  const pg = await startEmbedded({ database: 'family_e2e_menu' });
  process.env.DATABASE_URL = pg.url; process.env.NODE_ENV = 'test';
  process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000';
  process.env.MAX_FAMILIES_PER_IP_HOUR = '1000'; process.env.FAMILY_AI_KEY = 'khoa-ai-e2e'; process.env.FAMILY_AI_RETRY_MS = '5';
  const webpush = (await import('web-push')).default;
  const vk = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = vk.publicKey; process.env.VAPID_PRIVATE_KEY = vk.privateKey;
  const { start } = await import('../src/server.js');
  const { config } = await import('../src/config.js');
  const { clock } = await import('../src/clock.js');
  const vn = await import('../src/vn.js');
  const db = await import('../src/db.js');
  const idmod = await import('../src/id.js');
  const { createFakeId } = await import('../test/fake-id.js');
  const fake = createFakeId();
  config.idCacheMs = 0; config.legacySessions = false; config.port = 0;
  idmod.setIdClient(fake.client);
  const app = await start({ scheduler: false });
  const port = app.server.address().port;
  const origin = `http://127.0.0.1:${port}`; const base = `${origin}${config.basePath}/`;
  clock.set(vn.atMs('2026-10-05', '09:00'));
  const U = {}; for (const n of ['Chị Lan Anh', 'Anh Hùng', 'Bà Tư']) U[n] = fake.signup(n);
  const fid = fake.createFamily(U['Chị Lan Anh'].userId, 'Nhà Cây Sồi');
  fake.addMember(fid, U['Anh Hùng'].userId, 'quan_ly'); fake.addMember(fid, U['Bà Tư'].userId, 'thanh_vien');
  const mia = fake.addChild(fid, { name: 'Mía', birthYear: 2017, note: 'Dị ứng tôm' }); const soc = fake.addChild(fid, { name: 'Sóc', birthYear: 2021 });
  const mk = (name) => {
    const jar = { token: U[name].token };
    const call = async (method, p, body) => {
      const r = await fetch(new URL(p, base), { method, headers: { 'X-Requested-With': '9family', 'Content-Type': 'application/json', cookie: 'nine_sid=' + jar.token }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`${name} ${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
      return j;
    };
    return { jar, call };
  };
  const me = mk('Chị Lan Anh'); const bo = mk('Anh Hùng'); const ba = mk('Bà Tư');
  const F = `api/families/${fid}`;
  const ids = {};
  for (const [n, s] of [['Chị Lan Anh', me], ['Anh Hùng', bo], ['Bà Tư', ba]]) ids[n] = (await s.call('GET', F)).me.id;
  await me.call('POST', `${F}/members/${ids['Chị Lan Anh']}`, { relation: 'me' }); await bo.call('POST', `${F}/members/${ids['Anh Hùng']}`, { relation: 'bo' }); await ba.call('POST', `${F}/members/${ids['Bà Tư']}`, { relation: 'ba' });
  await me.call('POST', `${F}/children/${mia.id}`, { school: 'Tiểu học Cầu Vồng', grade: '4B', color: 'hong' });
  await me.call('POST', `${F}/children/${soc.id}`, { school: 'Mầm non Ánh Dương', grade: 'Lá 2', color: 'xanh' });
  await me.call('POST', `${F}/shopping`, { text: 'Sữa tươi, trứng gà, bánh mì, cà chua, thịt bò, rau muống, nước giặt' });
  await me.call('POST', `${F}/tasks`, { title: 'Đóng tiền học phí tháng 10' });
  return { fid, origin, base, db, sessions: { me, bo, ba }, kids: { mia, soc }, members: { meId: ids['Chị Lan Anh'] },
    async close() { try { await app.close(); await db.close(); } catch { /* bỏ qua */ } await pg.stop(); } };
}
async function launch() {
  const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
  const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const { default: puppeteer } = await import(PPT);
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: null });
}
const h = await boot();
const browser = await launch();

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

async function mkPage(view, { dark = false, big = false, sr = 'fake', delayParse = 0, session = h.sessions.me } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: 2, isMobile: view.width < 600, hasTouch: view.width < 600 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console ${m.text()}`); });
  await page.evaluateOnNewDocument(sr === 'fake' ? FAKE_SR : NO_SR);
  if (big) await page.evaluateOnNewDocument(() => { try { localStorage.setItem('9family.big', 'true'); } catch (e) { /* bỏ qua */ } });
  if (delayParse) {
    await page.setRequestInterception(true);
    page.on('request', async (req) => { if (/\/shopping\/parse$/.test(req.url())) await sleep(delayParse); req.continue(); });
  }
  await page.setCookie({ name: 'nine_sid', value: session.jar.token, url: h.origin });
  return page;
}
const go = async (page, route, wait = 600) => { await page.goto(`${h.base}#/f/${h.fid}/${route}`, { waitUntil: 'networkidle0' }); await page.reload({ waitUntil: 'networkidle0' }); await sleep(wait); };
const shot = async (page, name, full = false) => { await sleep(300); await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }); };
const clickText = (page, text, scope = 'button, a, label') => page.evaluate((text, scope) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const sheet = [...document.querySelectorAll('.sheet')].pop();
  const els = [...document.querySelectorAll(scope)].filter(vis);
  const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
  const el = pool.find((e) => (e.textContent || '').trim().includes(text) || (e.getAttribute('aria-label') || '').includes(text));
  if (!el) throw new Error('không thấy: ' + text);
  el.click();
}, text, scope);
const has = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, sel);
const textOf = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim()), sel);
const api = (method, p, body) => h.sessions.me.call(method, `api/families/${h.fid}${p}`, body);

// kiểm tra bố cục: không tràn ngang, vùng chạm >= 44px, chữ >= 14px
async function layout(page, name) {
  const r = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [];
    document.querySelectorAll('button, a.btn, a.tab, a.icon-btn, select, input:not([type=checkbox]):not([type=file]):not([type=hidden])').forEach((e) => {
      if (!vis(e) || e.closest('.hidden') || e.disabled) return;
      const r = e.getBoundingClientRect();
      if (r.height < 43.5 && !e.classList.contains('linkbtn') && !e.classList.contains('togl')) small.push((e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    const tiny = [];
    const walker = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) { if (!n.nodeValue.trim() || !n.parentElement || !vis(n.parentElement)) continue; const fs = parseFloat(getComputedStyle(n.parentElement).fontSize); if (fs < 13.9) tiny.push(n.nodeValue.trim().slice(0, 20) + ' ' + fs); }
    return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, small, tiny: tiny.slice(0, 5) };
  });
  check(`${name}: không tràn ngang`, !r.overflow);
  check(`${name}: vùng chạm >= 44px`, r.small.length === 0, JSON.stringify(r.small.slice(0, 6)));
  check(`${name}: chữ >= 14px`, r.tiny.length === 0, JSON.stringify(r.tiny));
}

try {
  const M = { width: 390, height: 844 };
  const fid = h.fid;
  // ---------- 1. Tiện ích + thực đơn tuần ----------
  let p = await mkPage(M);
  await go(p, 'more');
  const tiles = await textOf(p, '.tile-t');
  check('Tiện ích có Thực đơn tuần và Thông báo của trường', tiles.includes('Thực đơn tuần') && tiles.includes('Thông báo của trường'), tiles.join('|'));
  check('Tiện ích không còn "Sắp có" cho thực đơn', !(await textOf(p, '.soon-row')).length);
  await shot(p, '01-tien-ich');

  await go(p, 'menu');
  check('chưa có thực đơn: trạng thái trống có nút', (await textOf(p, '.empty-t'))[0] === 'Chưa có thực đơn tuần này');
  await shot(p, '02-thuc-don-trong');
  await layout(p, 'thực đơn trống');
  await clickText(p, 'Thiết lập hồ sơ ăn uống'); await sleep(900);
  check('mở hồ sơ ăn uống', (await textOf(p, '.h1'))[0] === 'Nhà mình ăn thế nào?');
  await shot(p, '03-ho-so-an-uong', true);
  await layout(p, 'hồ sơ ăn uống');
  // cấu hình: có bà (Bà Tư), Mía dị ứng tôm
  const prof0 = await api('GET', '/menu/profile');
  check('hồ sơ mặc định lấy ông bà từ thành viên', prof0.profile.elders === 1, JSON.stringify(prof0.profile));
  await clickText(p, 'Mía'); await sleep(500);
  await shot(p, '04-ho-so-nguoi');
  await clickText(p, 'Hải sản'); await clickText(p, 'Xong'); await sleep(400);
  await clickText(p, 'Lưu hồ sơ ăn uống'); await sleep(1200);
  const prof1 = await api('GET', '/menu/profile');
  check('lưu hồ sơ: Mía kiêng hải sản', (prof1.profile.members[`child:${h.kids.mia.id}`] || {}).avoid?.includes('hai_san'), JSON.stringify(prof1.profile.members));
  check('quay lại màn thực đơn sau khi lưu', /\/menu$/.test(await p.evaluate(() => location.hash)));

  await clickText(p, 'Lập thực đơn tuần này'); await sleep(1500);
  check('đã lập thực đơn: hiện bữa trưa và tối', (await textOf(p, '.meal-t')).join('|') === 'Bữa trưa|Bữa tối', (await textOf(p, '.meal-t')).join('|'));
  await shot(p, '05-thuc-don-ngay');
  await layout(p, 'thực đơn theo ngày');
  const names1 = await textOf(p, '.meal .dish-name');
  check('có món cho ngày hôm nay', names1.length >= 4, names1.join('|'));
  check('không có món hải sản (Mía dị ứng tôm)', !(await api('GET', '/menu/week')).plan.days.some((d) => Object.values(d.meals).some((m) => m.items.some((i) => /tôm|cua|ghẹ|mực|ngao|ốc/i.test(i.name)))) );
  await clickText(p, 'Cả tuần'); await sleep(400);
  await shot(p, '06-thuc-don-ca-tuan');
  await layout(p, 'thực đơn cả tuần');
  await clickText(p, 'Theo ngày'); await sleep(300);

  // ô món: lý do, đổi, khóa
  await p.evaluate(() => document.querySelector('.meal .dish-row:not(.baby)').click()); await sleep(500);
  check('ô món mở tờ chi tiết có "Vì sao chọn"', (await textOf(p, '.sheet .sec')).join('|').includes('Vì sao chọn'));
  await shot(p, '07-o-mon');
  const before = await textOf(p, '.sheet .dish-name');
  await clickText(p, 'Đổi món (gợi ý'); await sleep(900);
  const alts = await p.evaluate(() => document.querySelectorAll('.sheet .alt-row').length);
  check('hiện 3-5 món thay thế', alts >= 3 && alts <= 5, String(alts));
  await shot(p, '08-goi-y-doi-mon');
  await p.evaluate(() => document.querySelector('.sheet .alt-row').click()); await sleep(1000);
  const after = await textOf(p, '.meal .dish-name');
  check('đổi món thành công và có nút Hoàn tác', (await has(p, '.t-undo')) && after.join() !== names1.join(), '');
  await shot(p, '09-da-doi-mon');
  await p.evaluate(() => document.querySelector('.t-undo').click()); await sleep(900);
  check('hoàn tác trả món cũ', (await textOf(p, '.meal .dish-name')).join() === names1.join());
  // khóa
  await p.evaluate(() => document.querySelector('.meal .dish-row:not(.baby)').click()); await sleep(400);
  await clickText(p, 'Khóa món này'); await sleep(900);
  check('món đã khóa có nhãn', (await textOf(p, '.meal .chip')).includes('Đã khóa'));
  // công thức
  await p.evaluate(() => document.querySelector('.meal .dish-row:not(.baby)').click()); await sleep(400);
  await clickText(p, 'Xem công thức'); await sleep(1200);
  check('công thức: nguyên liệu, các bước, nhãn tin cậy, nguồn', (await textOf(p, '.sheet .sec')).join('|').includes('Các bước') && (await has(p, '.sheet .steps')) && (await has(p, '.sheet .chip')));
  await shot(p, '10-cong-thuc', false);
  await p.evaluate(() => { const s = document.querySelector('.sheet-body'); s.scrollTop = 99999; }); await shot(p, '10b-cong-thuc-cuoi');
  await clickText(p, 'Đóng', 'button'); await sleep(300);

  // tạo danh sách đi chợ
  await clickText(p, 'Tạo danh sách đi chợ'); await sleep(1500);
  check('xem trước danh sách có nhóm theo khu quầy', (await textOf(p, '.sheet .sec')).some((t) => /Rau củ|Thịt/.test(t)));
  await shot(p, '11-tao-danh-sach');
  await p.evaluate(() => { const s = document.querySelector('.sheet-body'); s.scrollTop = 600; }); await shot(p, '11b-tao-danh-sach-giua');
  await p.evaluate(() => { document.querySelector('.sheet .cb').click(); });
  await clickText(p, 'Thêm ', 'button'); await sleep(1500);
  check('sang màn Đi chợ', /\/shop$/.test(await p.evaluate(() => location.hash)));
  const sp = await api('GET', '/shopping');
  check('danh sách có dòng từ thực đơn kèm món nguồn', sp.items.filter((i) => i.source === 'thuc_don').length > 8 && sp.items.find((i) => i.source === 'thuc_don').fromDishes.length > 0);
  check('mục cũ (Sữa tươi, trứng...) vẫn còn', sp.items.some((i) => /Sữa tươi/i.test(i.text)) && sp.items.some((i) => /nước giặt/i.test(i.text)));
  check('một dòng được đánh dấu "Nhà đã có"', sp.items.some((i) => i.have));
  await shot(p, '12-di-cho', false);
  await shot(p, '12b-di-cho-day-du', true);
  await layout(p, 'đi chợ');

  // tích đã mua + thời gian thực giữa hai thiết bị
  const p2 = await mkPage(M, { session: h.sessions.bo });
  await go(p2, 'shop');
  const first = sp.items.find((i) => i.source === 'tay' && !i.bought);
  await p.evaluate((t) => { const b = [...document.querySelectorAll('.shop-row')].find((r) => r.querySelector('.ev-t').textContent === t).querySelector('.icon-btn'); b.click(); }, first.text);
  await sleep(800);
  await sleep(4500); // chu kỳ thăm dò 4 giây
  await clickText(p2, 'Đã mua ('); await sleep(400);
  const seen = await p2.evaluate((t) => { const r = [...document.querySelectorAll('.shop-row')].find((x) => x.querySelector('.ev-t').textContent === t); return r ? r.textContent : null; }, first.text);
  check('thiết bị thứ hai thấy ai đã tích (thăm dò)', seen && /Chị Lan Anh đã mua/.test(seen), String(seen));
  await shot(p2, '13-bo-thay-da-mua');
  await p2.close();

  // ---------- 2. giọng nói: các trạng thái ----------
  await go(p, 'shop');
  await p.evaluate(() => { window.__sr = { mode: 'ok', text: 'mua một chai nước mắm với hai bó rau muống', hold: 2500 }; });
  const mic = 'button.voice-btn';
  check('nút micro ở trạng thái rảnh', (await p.$eval(mic, (b) => b.getAttribute('data-voice'))) === 'idle');
  await shot(p, '20-voice-ranh');
  await p.click(mic); await sleep(900);
  const listening = await p.evaluate(() => { const b = document.querySelector('button.voice-btn'); return { st: b.getAttribute('data-voice'), label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), msg: document.querySelector('.voice-msg').textContent, interim: document.querySelector('.voice-interim').textContent, wave: !document.querySelector('.voice-wave').classList.contains('hidden'), live: document.querySelector('.voice-panel').getAttribute('aria-live'), bg: getComputedStyle(b).backgroundColor }; });
  check('đang nghe: đổi trạng thái, nhãn "Dừng nghe", chữ "Đang nghe… hãy nói"', listening.st === 'listening' && listening.label === 'Dừng nghe' && listening.pressed === 'true' && /Đang nghe… hãy nói/.test(listening.msg), JSON.stringify(listening));
  check('đang nghe: hiện lời nhận dạng tạm thời, sóng âm, aria-live', /mua một chai/.test(listening.interim) && listening.wave && listening.live === 'polite', JSON.stringify(listening));
  check('đang nghe: nút đổi màu (đỏ)', /rgb\(185, 28, 28\)|rgb\(220, 38, 38\)/.test(listening.bg), listening.bg);
  await shot(p, '21-voice-dang-nghe');
  await p.click(mic); // chạm lần nữa để dừng
  await sleep(150);
  await sleep(1500);
  check('dừng bằng chạm lần nữa -> mở màn soát lại, chưa thêm gì', await has(p, '.sheet .rev-row'));
  const rows = await p.evaluate(() => [...document.querySelectorAll('.sheet .rev-row')].map((r) => ({ name: r.querySelector('input[type=text]').value, qty: r.querySelector('.qty-in').value, unit: r.querySelector('select').value })));
  check('tách đúng: Nước mắm 1 chai; Rau muống 2 bó', rows.length === 2 && rows[0].name === 'Nước mắm' && rows[0].qty === '1' && rows[0].unit === 'chai' && rows[1].name === 'Rau muống' && rows[1].qty === '2' && rows[1].unit === 'bo', JSON.stringify(rows));
  check('chưa tự thêm vào danh sách', !(await api('GET', '/shopping')).items.some((i) => /nước mắm/i.test(i.text)));
  await shot(p, '22-voice-soat-lai');
  await layout(p, 'màn soát lại giọng nói');
  // sửa tên món 2 rồi thêm
  await p.evaluate(() => { const r = document.querySelectorAll('.sheet .rev-row')[1]; const i = r.querySelector('input[type=text]'); i.value = 'Rau muống luộc'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.evaluate(() => document.querySelectorAll('.sheet .rev-row')[0].querySelector('.qty-in').focus());
  await clickText(p, 'Thêm 2 món vào danh sách'); await sleep(1200);
  const sp2 = await api('GET', '/shopping');
  const nm = sp2.items.find((i) => i.text === 'Nước mắm · 1 chai');
  check('thêm sau khi soát: "Nước mắm · 1 chai", nguồn giọng nói, khu quầy gia vị', nm && nm.source === 'giong_noi' && nm.aisle === 'gia_vi', JSON.stringify(nm));
  check('mục sửa tay trước khi thêm được dùng', sp2.items.some((i) => /^Rau muống luộc/.test(i.text)));
  await shot(p, '23-voice-da-them');

  // đang xử lý: trễ phản hồi parse để thấy vòng xoay
  const pp = await mkPage(M, { delayParse: 2500 });
  await go(pp, 'shop');
  await pp.evaluate(() => { window.__sr = { mode: 'ok', text: 'giấy vệ sinh nữa', hold: 700 }; });
  await pp.click(mic); await sleep(1200);
  const proc = await pp.evaluate(() => { const b = document.querySelector('button.voice-btn'); return { st: b.getAttribute('data-voice'), dis: b.disabled, label: b.getAttribute('aria-label'), msg: document.querySelector('.voice-msg').textContent, spin: !document.querySelector('.voice-spin').classList.contains('hidden'), cancel: !document.querySelector('.voice-actions .btn.ghost').classList.contains('hidden') }; });
  check('đang xử lý: khóa nút, vòng xoay, chữ "Đang xử lý…", có Hủy', proc.st === 'processing' && proc.dis && proc.spin && /Đang xử lý…/.test(proc.msg) && proc.cancel && proc.label === 'Đang xử lý', JSON.stringify(proc));
  await shot(pp, '24-voice-dang-xu-ly');
  await sleep(2500);
  check('xử lý xong -> soát lại "Giấy vệ sinh" (bỏ "nữa")', (await pp.evaluate(() => (document.querySelector('.sheet .rev-row input[type=text]') || {}).value)) === 'Giấy vệ sinh');
  await pp.close();

  // hủy khi đang xử lý
  const pc = await mkPage(M, { delayParse: 3000 });
  await go(pc, 'shop');
  await pc.evaluate(() => { window.__sr = { mode: 'ok', text: 'thêm sữa tươi hai hộp', hold: 600 }; });
  await pc.click(mic); await sleep(1100);
  await pc.evaluate(() => [...document.querySelectorAll('.voice-actions .btn')].find((b) => b.textContent === 'Hủy').click()); await sleep(300);
  check('Hủy khi đang xử lý trả nút về rảnh', (await pc.$eval(mic, (b) => b.getAttribute('data-voice'))) === 'idle' && !(await has(pc, '.sheet')));
  await pc.close();

  // lỗi: không có quyền, không nghe thấy, không hỗ trợ
  await p.evaluate(() => { window.__sr = { mode: 'denied', text: '', hold: 100 }; });
  await go(p, 'shop');
  await p.evaluate(() => { window.__sr = { mode: 'denied', text: '', hold: 100 }; });
  await p.click(mic); await sleep(800);
  const den = await p.evaluate(() => ({ st: document.querySelector('button.voice-btn').getAttribute('data-voice'), msg: document.querySelector('.voice-msg').textContent, retry: !document.querySelector('.voice-actions .btn.ghost.xs:not(.hidden)') === false }));
  check('lỗi quyền micro: báo thân thiện', den.st === 'error' && /Chưa được phép dùng micro/.test(den.msg), JSON.stringify(den));
  await shot(p, '25-voice-loi-quyen');
  await p.evaluate(() => { window.__sr = { mode: 'nospeech', text: '', hold: 100 }; });
  await p.evaluate(() => [...document.querySelectorAll('.voice-actions .btn')].find((b) => b.textContent === 'Thử lại').click()); await sleep(900);
  const ns = await p.evaluate(() => document.querySelector('.voice-msg').textContent);
  check('không nghe thấy gì: báo và gợi ý thử lại', /Không nghe thấy gì/.test(ns), ns);
  await shot(p, '26-voice-khong-nghe-thay');
  const pu = await mkPage(M, { sr: 'none' });
  await go(pu, 'shop');
  await pu.click(mic); await sleep(400);
  check('trình duyệt không hỗ trợ: giải thích, vẫn gõ được', /chưa hỗ trợ nhập bằng giọng nói/.test(await pu.$eval('.voice-msg', (e) => e.textContent)) && (await has(pu, '[data-k="add-shop"]')));
  await shot(pu, '27-voice-khong-ho-tro');
  // gõ thay cho nói: vẫn tách tên
  await pu.type('[data-k="add-shop"]', 'Mua giúp mình hai hộp sữa chua nhé'); await pu.click('.addbar .btn.primary'); await sleep(1200);
  check('gõ chữ cũng được tách tên/số lượng', (await api('GET', '/shopping')).items.some((i) => i.text === 'Sữa chua · 2 hộp'));
  await pu.close();

  // chuẩn hóa dự phòng chạy hoàn toàn trong trình duyệt (public/menu/*)
  const loc = await p.evaluate(() => F9.shopLocalParse('Mua một chai nước mắm với hai bó rau muống').then((r) => r.map((x) => [x.name, x.qty, x.unit])));
  check('chuẩn hóa dự phòng trong trình duyệt (public/menu)', JSON.stringify(loc) === JSON.stringify([['Nước mắm', 1, 'chai'], ['Rau muống', 2, 'bo']]), JSON.stringify(loc));

  // ---------- 3. mục cũ nguyên câu: gợi ý gọn + nút làm gọn ----------
  await h.db.query("INSERT INTO shopping(family_id, text, added_by) VALUES($1, 'Mua một chai dầu ăn', $2), ($1, 'Pin nữa', $2)", [h.fid, h.members.meId]);
  await go(p, 'shop');
  const rowsT = await textOf(p, '.shop-row .ev-t');
  check('mục cũ hiện bản gọn "Dầu ăn · 1 chai" (không sửa dữ liệu im lặng)', rowsT.includes('Dầu ăn · 1 chai') && rowsT.includes('Pin'), rowsT.join('|'));
  check('mục cũ vẫn là câu gốc trong CSDL', (await h.db.query("SELECT count(*)::int n FROM shopping WHERE text='Mua một chai dầu ăn' AND name IS NULL"))[0].n === 1);
  await shot(p, '30-muc-cu-gon');
  await p.evaluate(() => [...document.querySelectorAll('.shop-row .task-edit')].find((b) => b.textContent.includes('Dầu ăn · 1 chai')).click()); await sleep(500);
  await shot(p, '31-sua-muc');
  await clickText(p, 'Lưu', '.sheet button'); await sleep(1000);
  check('bấm Lưu thì lưu bản gọn', (await h.db.query("SELECT count(*)::int n FROM shopping WHERE text='Dầu ăn · 1 chai' AND name='Dầu ăn'"))[0].n === 1);

  // ---------- 4. chế độ đi chợ ----------
  await clickText(p, 'Chế độ đi chợ'); await sleep(1200);
  check('chế độ đi chợ: chữ to', (await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.go-name')).fontSize))) >= 20);
  check('chế độ đi chợ: hàng cao >= 64px', (await p.evaluate(() => document.querySelector('.go-row').getBoundingClientRect().height)) >= 64);
  await shot(p, '40-che-do-di-cho');
  await layout(p, 'chế độ đi chợ');
  const nBefore = (await api('GET', '/shopping')).items.filter((i) => !i.bought && !i.have).length;
  await p.evaluate(() => document.querySelector('.go-row:not(.done)').click()); await sleep(1300);
  check('một chạm là tích đã mua', (await api('GET', '/shopping')).items.filter((i) => !i.bought && !i.have).length === nBefore - 1);
  await shot(p, '41-che-do-di-cho-da-tich');
  await clickText(p, 'Xong'); await sleep(600);

  // chia sẻ: không có Web Share trong Chrome headless -> sao chép văn bản
  await p.evaluate(() => { window.__copied = null; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); navigator.share = (d) => { window.__copied = d.text; return Promise.resolve(); }; } catch (e) { /* bỏ qua */ } });
  await clickText(p, 'Chia sẻ'); await sleep(500);
  const copied = await p.evaluate(() => window.__copied);
  check('chia sẻ: văn bản nhóm theo khu quầy, không có mục đã mua', copied && /Đi chợ - Nhà Cây Sồi/.test(copied) && /RAU CỦ/.test(copied) && !/^- Nước giặt$/m.test('') && /- Nước mắm|- Rau muống/.test(copied), String(copied).slice(0, 120));
  await p.close();

  // ---------- 5. Hôm nay ăn gì ----------
  const pt = await mkPage(M);
  await go(pt, 'today');
  check('Hôm nay có dòng thực đơn', await has(pt, '.menu-line'), '');
  await shot(pt, '50-hom-nay-an-gi');
  await pt.close();

  // ---------- 6. nhập thông báo của trường ----------
  const ps = await mkPage(M);
  await go(ps, 'school');
  await shot(ps, '60-thong-bao-truong');
  check('hiện nút AI và ghi rõ gửi tới Google Gemini', (await textOf(ps, '.card.flat')).join().includes('Google Gemini') && (await textOf(ps, 'button')).some((t) => t.includes('Đọc kỹ hơn bằng AI')));
  const sample = 'Kính gửi: Quý phụ huynh lớp 4B\nNhà trường họp phụ huynh lúc 19h30 ngày 12/10/2026 tại phòng 4B.\nPhụ huynh đóng học phí tháng 10 là 1.250.000 đồng trước ngày 15/10.\nThứ Sáu (09/10) học sinh mặc đồng phục thể dục.\nHọc sinh nghỉ lễ từ ngày 30/10 đến hết ngày 1/11.';
  await ps.type('.school-ta', sample); await clickText(ps, 'Đọc thông báo'); await sleep(1200);
  check('màn xem lại: nhiều mục, chưa lưu gì', (await ps.evaluate(() => document.querySelectorAll('.rv-card').length)) >= 4 && (await api('GET', '/shopping')).items.length >= 0);
  const evBefore = (await h.db.query('SELECT count(*)::int n FROM events WHERE family_id=$1', [h.fid]))[0].n;
  await shot(ps, '61-xem-lai', false); await shot(ps, '61b-xem-lai-day-du', true);
  await layout(ps, 'xem lại thông báo trường');
  // sửa một mục: đổi giờ họp thành 19:45, bỏ tích mục nghỉ lễ
  await ps.evaluate(() => { const c = [...document.querySelectorAll('.rv-card')].find((x) => /Họp phụ huynh/.test((x.querySelector('input[type=text]') || {}).value || '')); const t = c.querySelector('input[type=time]'); t.value = '19:45'; t.dispatchEvent(new Event('change', { bubbles: true })); });
  await ps.evaluate(() => { const cards = [...document.querySelectorAll('.rv-card')]; const hol = cards.find((c) => /nghỉ/i.test((c.querySelector('input[type=text]') || {}).value || '')); if (hol) hol.querySelector('input.cb').click(); });
  await sleep(300);
  await clickText(ps, 'Lưu ', '#cta button'); await sleep(2000);
  const evAfter = await h.db.query("SELECT title, start_time, start_date::text d FROM events WHERE family_id=$1 AND title LIKE 'Họp phụ huynh%'", [h.fid]);
  const tasks = await h.db.query("SELECT title, due_date::text d FROM tasks WHERE family_id=$1 ORDER BY created_at DESC LIMIT 4", [h.fid]);
  check('chỉ khi bấm Lưu mới tạo sự kiện (giờ đã sửa 19:45)', evAfter.some((e) => e.start_time === '19:45' && e.d === '2026-10-12'), JSON.stringify(evAfter));
  check('khoản đóng thành việc có hạn và số tiền', tasks.some((t) => /Đóng học phí tháng 10 1\.250\.000đ/.test(t.title) && t.d === '2026-10-15'), JSON.stringify(tasks));
  check('mục bỏ tích không được lưu', !(await h.db.query("SELECT 1 FROM events WHERE family_id=$1 AND title ILIKE '%nghỉ lễ%'", [h.fid])).length);
  await shot(ps, '62-da-luu');
  void evBefore;
  await ps.close();

  // ---------- 7. giao diện: tối, Chữ lớn, máy tính ----------
  const pd = await mkPage(M, { dark: true });
  await go(pd, 'menu'); await shot(pd, '70-toi-thuc-don');
  await go(pd, 'shop'); await shot(pd, '71-toi-di-cho');
  await layout(pd, 'chế độ tối thực đơn');
  await pd.evaluate(() => { window.__sr = { mode: 'ok', text: 'hai bó rau muống', hold: 2000 }; });
  await pd.click(mic); await sleep(1000); await shot(pd, '72-toi-voice-dang-nghe');
  await pd.close();
  const pb = await mkPage(M, { big: true });
  await go(pb, 'menu'); await shot(pb, '73-chu-lon-thuc-don');
  await layout(pb, 'Chữ lớn thực đơn');
  await go(pb, 'shop'); await shot(pb, '74-chu-lon-di-cho');
  await layout(pb, 'Chữ lớn đi chợ');
  await pb.close();
  const pdk = await mkPage({ width: 1280, height: 800 });
  await go(pdk, 'menu'); await shot(pdk, '80-may-tinh-thuc-don');
  await layout(pdk, 'máy tính thực đơn');
  await go(pdk, 'shop'); await shot(pdk, '81-may-tinh-di-cho');
  await go(pdk, 'school'); await shot(pdk, '82-may-tinh-thong-bao');
  await pdk.close();
  const p360 = await mkPage({ width: 320, height: 640 });
  await go(p360, 'menu'); await layout(p360, '320px thực đơn'); await shot(p360, '90-320-thuc-don');
  await go(p360, 'shop'); await layout(p360, '320px đi chợ');
} catch (e) {
  problems.push('NGOẠI LỆ: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  console.error(e);
} finally {
  await browser.close();
  await h.close();
}
const failed = checks.filter((c) => !c[1]).length;
console.log(`\n${checks.length - failed}/${checks.length} kiểm tra đạt.`);
if (problems.length) { console.log('\nVẤN ĐỀ:\n' + [...new Set(problems)].join('\n')); process.exit(1); }
