// Kiểm tra giao diện thật bằng Chrome headless (puppeteer-core): điện thoại 390x844 (sáng/tối) và máy tính 1280x800.
// Chạy: node scripts/e2e.mjs   — ảnh chụp lưu ở shots/. Có lỗi là thoát mã 1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, control } from './serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const Q = JSON.parse(fs.readFileSync(path.join(root, 'data/questions.json'), 'utf8'));
const QB = new Map(Q.map((q) => [q.id, q]));
const SETS = JSON.parse(fs.readFileSync(path.join(root, 'data/sets.json'), 'utf8'));

const { port } = await startServer(9500 + Math.floor(Math.random() * 400));
const BASE = `http://127.0.0.1:${port}/license/`;
console.log('máy chủ thử:', BASE);
const dl = fs.mkdtempSync(path.join(os.tmpdir(), '9license-dl-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });

const problems = [];
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let offline = false;

async function newPage(name, { w = 390, h = 844, dark = false, mobile = true } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.__name = name;
  page.__ctx = ctx;
  page.on('console', (m) => {
    if (!['error', 'warning'].includes(m.type())) return;
    const t = m.text();
    if (offline && /ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(t)) return;
    problems.push(`[${name}] console.${m.type()}: ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!offline && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, eventsEnabled: true, browserContextId: ctx.id }).catch((e) => problems.push('setDownloadBehavior: ' + e.message));
  return page;
}
async function open(page, hash = '/') {
  await page.goto(BASE + '#' + hash, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await sleep(150);
}
async function go(page, hash) {
  await page.evaluate((x) => { location.hash = x; }, hash);
  await sleep(250);
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function must(cond, msg) { if (!cond) throw new Error(msg); }
async function has(page, s) { const t = await text(page); await must(t.includes(s), `không thấy "${s}" trong trang`); }
async function hasNot(page, s) { const t = await text(page); await must(!t.includes(s), `không được có "${s}"`); }

async function click(page, label, { scope = 'button, a, [role=button]', nth = 0 } = {}) {
  const ok = await page.evaluate((label, scope, nth) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
    const overlay = document.querySelector('#modal-root .overlay');
    const pool = overlay ? els.filter((e) => overlay.contains(e)) : els;
    const hits = pool.filter((e) => norm(e.innerText || e.textContent || '') .includes(label) || (e.getAttribute('aria-label') || '').includes(label));
    const el = hits[nth];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, label, scope, nth);
  await must(ok, `không tìm thấy nút "${label}"`);
  await sleep(220);
}
async function pickHang(page, k) {
  await click(page, 'Đổi hạng giấy phép lái xe', { scope: '#btn-hang' });
  await page.evaluate((k) => document.querySelector(`.overlay [data-hang="${k}"]`).click(), k);
  await sleep(250);
}
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); }

async function audit(page, where) {
  const r = await page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`cuộn ngang: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
    for (const img of document.querySelectorAll('img')) {
      const r = img.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (!img.complete || img.naturalWidth === 0) out.push('ảnh lỗi: ' + img.src);
        if (img.getAttribute('alt') === null) out.push('ảnh thiếu alt: ' + img.src);
      }
    }
    for (const b of document.querySelectorAll('button, a.btn, a.tab, a.item, input, select')) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = (b.innerText || b.getAttribute('aria-label') || b.value || b.getAttribute('placeholder') || '').trim();
      if (!name && b.tagName !== 'SELECT' && b.type !== 'file') out.push('nút không có tên: ' + b.outerHTML.slice(0, 80));
      if (b.tagName === 'BUTTON' && !b.classList.contains('ncell') && (r.height < 34 || r.width < 34)) out.push(`nút nhỏ ${Math.round(r.width)}x${Math.round(r.height)}: ${name.slice(0, 20)}`);
    }
    // chữ tràn khỏi khung (card)
    for (const el of document.querySelectorAll('.card, .item, .tile, .opt, .btn')) {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1) out.push('phần tử tràn màn hình: ' + (el.className || el.tagName));
      }
    }
    return out;
  });
  for (const m of r) problems.push(`[${page.__name}] (${where}) ${m}`);
}

async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('  ok  ', name); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log('  LỖI ', name, '→', e.message); }
}

const futureDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
async function setInput(page, sel, value) {
  await page.evaluate((sel, value) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true })); }, sel, value);
  await sleep(200);
}
const storeData = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('9license:v1') || 'null'));

async function answerAll(page, { wrongIds = [], onlyFirst = Infinity } = {}) {
  const cur = (await storeData(page)).cur;
  let n = 0;
  for (let k = 0; k < cur.ids.length; k++) {
    const id = cur.ids[k];
    const q = QB.get(id);
    const want = wrongIds.includes(id) ? (q.a + 1) % q.opts.length : q.a;
    if (n < onlyFirst) await page.evaluate((i) => document.querySelector(`.opt[data-i="${i}"]`).click(), want);
    n++;
    if (k < cur.ids.length - 1) await page.evaluate(() => { [...document.querySelectorAll('.qnav .btn')].find((b) => /Câu tiếp/.test(b.innerText)).click(); });
    await sleep(30);
  }
  return cur;
}

// ============ Điện thoại, giao diện sáng ============
console.log('--- 390x844, sáng ---');
const p = await newPage('mobile-sáng');

await step('trang chủ: nút ‹ 9app, hạng mặc định, cấu trúc đề, không lỗi', async () => {
  await open(p, '/');
  await has(p, '‹ 9app'); await has(p, '9license'); await has(p, 'Ôn thi bằng lái hạng B');
  await has(p, '30 câu'); await has(p, '20 phút'); await has(p, 'đạt 27/30'); await has(p, 'sai câu điểm liệt là trượt');
  const href = await p.$eval('#home9app', (a) => a.getAttribute('href'));
  await must(href === '/', 'href nút 9app = ' + href);
  await audit(p, 'home'); await shot(p, '01-home-sang');
});

await step('đặt ngày thi: đếm ngược hiện đúng số ngày', async () => {
  await go(p, '/cai-dat');
  await has(p, 'Kỳ thi của bạn');
  await setInput(p, '#in-exam', futureDate(40));
  await go(p, '/');
  await has(p, '40'); await has(p, 'ngày nữa là thi');
  await shot(p, '02-home-dem-nguoc');
});

await step('đổi hạng A1/A/B1/B: cấu trúc đề đổi đúng theo quy định hiện hành', async () => {
  const exp = { A1: ['25 câu', '19 phút', 'đạt 21/25'], A: ['25 câu', '19 phút', 'đạt 23/25'], B1: ['25 câu', '19 phút', 'đạt 23/25'], B: ['30 câu', '20 phút', 'đạt 27/30'] };
  for (const k of ['A1', 'A', 'B1', 'B']) {
    await pickHang(p, k);
    for (const s of exp[k]) await has(p, s);
    await has(p, 'Hạng ' + k);
  }
});

await step('quy định mới 01/3/2027: chọn cấu trúc mới thì B = 50 câu, 33 phút, đạt 45', async () => {
  await go(p, '/cai-dat');
  await p.select('#in-prof', 'moi'); await sleep(250);
  await go(p, '/');
  await has(p, '50 câu'); await has(p, '33 phút'); await has(p, 'đạt 45/50');
  await go(p, '/cai-dat'); await p.select('#in-prof', 'auto'); await sleep(250);
  await go(p, '/'); await has(p, '30 câu');
});

await step('tự động theo ngày thi: ngày thi sau 01/3/2027 thì dùng đề mới', async () => {
  await go(p, '/cai-dat');
  await setInput(p, '#in-exam', '2027-05-10');
  await go(p, '/');
  await has(p, '50 câu'); await has(p, '33 phút'); await has(p, 'đạt 45/50');
  await go(p, '/thi'); await has(p, 'Mới từ 01/3/2027'); await shot(p, '02b-thi-quy-dinh-moi');
  await go(p, '/cai-dat'); await setInput(p, '#in-exam', futureDate(40));
  await go(p, '/'); await has(p, '30 câu');
});

await step('Học: sáu chương với số câu đúng bố cục (B = 600 câu)', async () => {
  await go(p, '/hoc');
  for (const s of ['180 câu', '25 câu', '58 câu', '37 câu', '185 câu', '115 câu']) await has(p, s);
  await audit(p, 'hoc'); await shot(p, '03-hoc');
});

await step('Học theo hạng A1: tập 250 câu (chương I = 100 câu)', async () => {
  await pickHang(p, 'A1');
  await go(p, '/hoc');
  await has(p, '100 câu'); await has(p, '90 câu'); await has(p, 'Hạng A1 và A dùng chung 250 câu');
  await pickHang(p, 'B');
});

await step('luyện chương I: trả lời sai thấy đáp án đúng, đánh dấu đỏ/xanh, lưu tiến độ', async () => {
  await go(p, '/hoc/c/1');
  await click(p, '1', { scope: '.ngrid .ncell', nth: 0 });
  await p.waitForSelector('.qcard');
  const q = QB.get(1);
  const wrong = (q.a + 1) % q.opts.length;
  await p.evaluate((i) => document.querySelector(`.opt[data-i="${i}"]`).click(), wrong);
  await sleep(200);
  await has(p, 'Chưa đúng'); await has(p, `Đáp án đúng: ${q.a + 1}`);
  const cls = await p.evaluate(() => [...document.querySelectorAll('.opt')].map((o) => o.className));
  await must(cls[q.a].includes('right') && cls[wrong].includes('wrong'), 'màu đáp án sai: ' + cls.join('|'));
  const d = await storeData(p);
  await must(d.q['1'] && d.q['1'].w === 1 && d.q['1'].l === 0, 'chưa lưu tiến độ câu 1');
  await audit(p, 'luyen'); await shot(p, '04-luyen-sai');
  await click(p, 'Câu tiếp'); await sleep(200);
  await has(p, 'Câu 2');
});

await step('câu điểm liệt: nhãn "Điểm liệt", mẹo nhớ, 60 câu', async () => {
  await go(p, '/hoc/diem-liet');
  await has(p, 'Câu điểm liệt'); await has(p, 'Mỗi đề thi có đúng 1 câu điểm liệt chọn trong 60 câu');
  const n = await p.$$eval('.ngrid .ncell', (c) => c.length);
  await must(n === 60, 'số ô điểm liệt = ' + n);
  await click(p, '24', { scope: '.ngrid .ncell', nth: 0 });
  await p.waitForSelector('.qcard');
  await has(p, 'Điểm liệt'); await has(p, 'Câu 24');
  await p.evaluate(() => document.querySelector('.opt[data-i="1"]').click());
  await sleep(200);
  await has(p, 'Mẹo nhớ: Rượu bia, ma túy');
  await audit(p, 'liet'); await shot(p, '05-diem-liet-meo');
});

await step('chương V: câu có hình hiện đủ, hình tải được', async () => {
  await go(p, '/hoc/c/5');
  await click(p, '301', { scope: '.ngrid .ncell', nth: 0 });
  await p.waitForSelector('.qimg');
  await sleep(300);
  const ok = await p.$eval('.qimg', (i) => i.complete && i.naturalWidth > 100);
  await must(ok, 'hình câu 301 không tải được');
  await audit(p, 'bien-bao-q'); await shot(p, '06-cau-bien-bao');
});

await step('tra cứu biển báo: tìm theo từ khóa, lọc nhóm, xem chi tiết', async () => {
  await go(p, '/hoc/bien-bao');
  await has(p, 'Tra cứu biển báo');
  const total = await p.$$eval('.sign', (c) => c.length);
  await must(total === 185, 'số biển = ' + total);
  await p.type('input[type=search]', 'đường sắt'); await sleep(300);
  const n = await p.$$eval('.sign', (c) => c.length);
  await must(n > 3 && n < 40, 'tìm "đường sắt" ra ' + n);
  await shot(p, '07-tra-cuu-bien');
  await click(p, 'Câu', { scope: '.sign', nth: 0 });
  await p.waitForSelector('.overlay .qcard');
  await has(p, 'Đáp án đúng');
  await audit(p, 'bien-bao');
  await shot(p, '08-bien-chi-tiet');
  await p.keyboard.press('Escape'); await sleep(200);
  await click(p, 'Biển cấm, hạn chế');
  const m = await p.$$eval('.sign', (c) => c.length);
  await must(m > 20, 'nhóm cấm có ' + m);
});

await step('thi thử B: đúng cấu trúc 30 câu, đồng hồ, lưới số câu, đạt khi đúng hết', async () => {
  await go(p, '/thi');
  await has(p, 'Thi thử hạng B'); await has(p, 'đạt từ 27/30');
  await shot(p, '09-thi-gioi-thieu');
  await click(p, 'Bắt đầu thi thử');
  await p.waitForSelector('.qcard');
  const timer = await p.$eval('.timer', (t) => t.innerText);
  await must(/^(19|20):\d\d$/.test(timer), 'đồng hồ: ' + timer);
  const cur = (await storeData(p)).cur;
  await must(cur.ids.length === 30 && new Set(cur.ids).size === 30, 'số câu đề');
  const crit = cur.ids.filter((id) => SETS.all.crit.includes(id));
  await must(crit.length === 1, 'số câu điểm liệt trong đề = ' + crit.length);
  const chs = {};
  cur.ids.forEach((id) => { const q = QB.get(id); if (!q.crit) chs[q.ch] = (chs[q.ch] || 0) + 1; });
  await must(chs[1] === 8 && chs[2] === 1 && chs[3] === 1 && chs[4] === 1 && chs[5] === 9 && chs[6] === 9, 'cơ cấu theo chương ' + JSON.stringify(chs));
  await audit(p, 'thi'); await shot(p, '10-thi-dang-lam');
  await click(p, 'Xem danh sách câu'); await sleep(150); await shot(p, '11-thi-luoi'); await p.keyboard.press('Escape');
  await answerAll(p);
  await click(p, 'Nộp bài', { scope: '.qnav .btn' });
  await click(p, 'Nộp bài', { scope: '.overlay .btn' });
  await p.waitForSelector('.result');
  await has(p, '30/30'); await has(p, 'ĐẠT');
  await audit(p, 'ket-qua'); await shot(p, '12-ket-qua-dat');
});

await step('thi thử: sai đúng 1 câu điểm liệt → KHÔNG ĐẠT dù 29/30', async () => {
  await go(p, '/thi'); await click(p, 'Bắt đầu thi thử'); await p.waitForSelector('.qcard');
  const cur = (await storeData(p)).cur;
  const crit = cur.ids.filter((id) => SETS.all.crit.includes(id));
  await answerAll(p, { wrongIds: crit });
  await click(p, 'Nộp bài', { scope: '.qnav .btn' }); await click(p, 'Nộp bài', { scope: '.overlay .btn' });
  await p.waitForSelector('.result');
  await has(p, '29/30'); await has(p, 'KHÔNG ĐẠT'); await has(p, 'câu điểm liệt');
  await shot(p, '13-ket-qua-diem-liet');
  const d = await storeData(p);
  await must(d.exams.length === 2 && d.exams[1].pass === false && d.exams[1].failReason === 'diem-liet', 'lịch sử thi');
});

await step('thi thử: thiếu điểm (sai 4 câu thường) → KHÔNG ĐẠT; bỏ trống tính sai', async () => {
  await go(p, '/thi'); await click(p, 'Bắt đầu thi thử'); await p.waitForSelector('.qcard');
  const cur = (await storeData(p)).cur;
  const nonCrit = cur.ids.filter((id) => !SETS.all.crit.includes(id)).slice(0, 4);
  await answerAll(p, { wrongIds: nonCrit });
  await click(p, 'Nộp bài', { scope: '.qnav .btn' }); await click(p, 'Nộp bài', { scope: '.overlay .btn' });
  await p.waitForSelector('.result');
  await has(p, '26/30'); await has(p, 'KHÔNG ĐẠT'); await has(p, 'Chưa đủ điểm');
});

await step('thi thử: sai đúng 3 câu thường (27/30) vẫn ĐẠT', async () => {
  await go(p, '/thi'); await click(p, 'Bắt đầu thi thử'); await p.waitForSelector('.qcard');
  const cur = (await storeData(p)).cur;
  const nonCrit = cur.ids.filter((id) => !SETS.all.crit.includes(id)).slice(0, 3);
  await answerAll(p, { wrongIds: nonCrit });
  await click(p, 'Nộp bài', { scope: '.qnav .btn' }); await click(p, 'Nộp bài', { scope: '.overlay .btn' });
  await p.waitForSelector('.result');
  await has(p, '27/30'); await has(p, 'ĐẠT');
});

await step('thi thử: làm dở, tải lại trang vẫn còn bài; hết giờ tự nộp', async () => {
  await go(p, '/thi'); await click(p, 'Bắt đầu thi thử'); await p.waitForSelector('.qcard');
  await p.evaluate(() => document.querySelector('.opt[data-i="0"]').click());
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__ready === true);
  await p.waitForSelector('.qcard');
  const d = await storeData(p);
  await must(d.cur && Object.keys(d.cur.answers).length === 1, 'mất bài làm dở sau khi tải lại');
  await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('9license:v1')); o.cur.startedAt = Date.now() - 21 * 60 * 1000; localStorage.setItem('9license:v1', JSON.stringify(o)); });
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('.result', { timeout: 8000 });
  await has(p, 'KHÔNG ĐẠT');
  const d2 = await storeData(p);
  await must(d2.cur === null && d2.exams[d2.exams.length - 1].auto === true, 'không tự nộp khi hết giờ');
});

await step('thi thử hạng A1: 25 câu, 19 phút', async () => {
  await pickHang(p, 'A1');
  await go(p, '/thi'); await click(p, 'Bắt đầu thi thử'); await p.waitForSelector('.qcard');
  const cur = (await storeData(p)).cur;
  await must(cur.ids.length === 25 && cur.minutes === 19 && cur.passMark === 21, 'cấu trúc A1');
  const aPool = new Set(SETS.A.pool);
  await must(cur.ids.every((id) => aPool.has(id)), 'câu ngoài tập A1');
  await shot(p, '14-thi-a1');
  await answerAll(p);
  await click(p, 'Nộp bài', { scope: '.qnav .btn' }); await click(p, 'Nộp bài', { scope: '.overlay .btn' });
  await p.waitForSelector('.result'); await has(p, '25/25');
  await pickHang(p, 'B');
});

await step('Ôn lại: có câu đến hạn / câu sai, bắt đầu ôn', async () => {
  await go(p, '/on');
  await has(p, 'Đến hạn ôn'); await has(p, 'Câu đã làm sai'); await has(p, 'Câu hay sai nhất');
  await audit(p, 'on-lai'); await shot(p, '15-on-lai');
  await click(p, 'Ôn ', { scope: 'section button.btn', nth: 0 });
  await p.waitForSelector('.qcard');
  await has(p, 'Ôn câu đến hạn');
  await p.evaluate(() => document.querySelector('.opt[data-i="0"]').click());
  await sleep(200);
  const t1 = await text(p);
  await must(t1.includes('Chính xác') || t1.includes('Đáp án đúng'), 'không hiện kết quả câu ôn');
  await p.keyboard.press('ArrowRight'); await sleep(150);
  await click(p, 'Thoát phiên luyện');
});

await step('Tiến độ: thống kê, theo chương, lịch sử thi', async () => {
  await go(p, '/tien-do');
  await has(p, 'câu đã làm'); await has(p, 'Theo chương'); await has(p, 'Lịch sử thi thử'); await has(p, '14 ngày gần đây');
  await audit(p, 'tien-do'); await shot(p, '16-tien-do');
});

await step('Cài đặt: tạo file lịch .ics đúng nội dung', async () => {
  await go(p, '/cai-dat');
  await setInput(p, '#in-exp', futureDate(200));
  await setInput(p, '#in-time', '19:30');
  for (const f of fs.readdirSync(dl)) fs.rmSync(path.join(dl, f));
  await click(p, 'Tải file lịch');
  await sleep(900);
  const f = fs.readdirSync(dl).find((x) => x.endsWith('.ics'));
  await must(f, 'không có file .ics');
  const ics = fs.readFileSync(path.join(dl, f), 'utf8');
  await must(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('RRULE:FREQ=DAILY') && ics.includes('T193000') && ics.includes('Ngày thi sát hạch GPLX hạng B') && ics.includes('hethan'), 'nội dung ics');
  await audit(p, 'cai-dat'); await shot(p, '17-cai-dat');
});

await step('Cài đặt: sao lưu và khôi phục tiến độ', async () => {
  const before = await storeData(p);
  for (const f of fs.readdirSync(dl)) fs.rmSync(path.join(dl, f));
  await click(p, 'Tải file sao lưu'); await sleep(900);
  const f = fs.readdirSync(dl).find((x) => x.endsWith('.json'));
  await must(f, 'không có file sao lưu');
  const j = JSON.parse(fs.readFileSync(path.join(dl, f), 'utf8'));
  await must(j.app === '9license' && Object.keys(j.data.q).length === Object.keys(before.q).length, 'nội dung sao lưu');
  await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('9license:v1')); o.q = {}; o.exams = []; localStorage.setItem('9license:v1', JSON.stringify(o)); });
  const input = await p.$('input[type=file]');
  await input.uploadFile(path.join(dl, f)); await sleep(500);
  const after = await storeData(p);
  await must(Object.keys(after.q).length === Object.keys(before.q).length && after.exams.length === before.exams.length, 'khôi phục chưa đủ');
});

await step('Về dữ liệu: nguồn, quy định, điều chưa chắc, nút báo sai', async () => {
  await go(p, '/du-lieu');
  for (const s of ['Công văn 2262/CSGT-P5', 'Thông tư 12/2025/TT-BCA', 'Thông tư 108/2026/TT-BCA', 'Điều chưa chắc chắn', 'Chỉ để tham khảo', 'Báo sai dữ liệu', '600 câu']) await has(p, s);
  await audit(p, 'du-lieu'); await shot(p, '18-ve-du-lieu');
  await click(p, 'Báo sai dữ liệu', { scope: 'section button.btn' });
  await p.waitForSelector('.overlay textarea');
  await shot(p, '19-bao-sai');
  await p.keyboard.press('Escape');
});

await step('điểm liệt theo hạng của bài thi: kết quả thi A1 xem khi đang chọn hạng B không gắn nhãn sai', async () => {
  const onlyB = SETS.all.crit.filter((id) => !SETS.A.crit.includes(id) && SETS.A.pool.includes(id))[0];
  const a = SETS.A.crit[0];
  await p.evaluate((onlyB, a) => {
    const o = JSON.parse(localStorage.getItem('9license:v1'));
    o.exams.push({ t: Date.now(), hang: 'A1', profile: 'hien-hanh', score: 1, total: 2, passMark: 1, pass: false, failReason: 'diem-liet', critWrong: [a], used: 5, ids: [onlyB, a], ans: [-1, -1] });
    localStorage.setItem('9license:v1', JSON.stringify(o));
  }, onlyB, a);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__ready === true);
  const idx = (await storeData(p)).exams.length - 1;
  await go(p, '/thi/ket-qua/' + idx);
  await click(p, 'Câu thứ 1', { scope: '.ngrid .ncell' });
  await p.waitForSelector('.overlay .qcard');
  let pills = await p.$$eval('.overlay .pill.crit', (e) => e.length);
  await must(pills === 0, 'câu điểm liệt của hạng B nhưng không thuộc A1 lại bị gắn nhãn điểm liệt (' + pills + ')');
  await p.keyboard.press('Escape'); await sleep(150);
  await click(p, 'Câu thứ 2', { scope: '.ngrid .ncell' });
  await p.waitForSelector('.overlay .qcard');
  pills = await p.$$eval('.overlay .pill.crit', (e) => e.length);
  await must(pills === 1, 'câu điểm liệt thật của A1 phải có nhãn');
  await p.keyboard.press('Escape');
});

await step('tải nền: tự tải đủ 312 hình khi rảnh; ngoại tuyến xem câu chưa từng mở vẫn có hình', async () => {
  await open(p, '/');
  let n = 0;
  for (let i = 0; i < 90 && n < 312; i++) {
    n = await p.evaluate(() => caches.open('9license-img-v1').then((c) => c.keys()).then((k) => k.length));
    if (n < 312) await sleep(1000);
  }
  await must(n >= 312, 'mới tải nền được ' + n + '/312 hình');
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(500);
  offline = true; await p.setOfflineMode(true);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await go(p, '/hoc/c/5'); await click(p, '450', { scope: '.ngrid .ncell', nth: 0 }); await p.waitForSelector('.qimg'); await sleep(500);
  const ok = await p.$eval('.qimg', (i) => i.complete && i.naturalWidth > 100);
  await must(ok, 'câu chưa mở bao giờ vẫn phải có hình khi ngoại tuyến');
  await p.setOfflineMode(false); offline = false;
});

await step('mạng hỏng khi hình chưa tải: hiện rõ ở màn hình học và ở câu hỏi', async () => {
  const q = await newPage('hinh-chua-tai');
  await q.evaluateOnNewDocument(() => { if (!localStorage.getItem('9license:v1')) localStorage.setItem('9license:v1', JSON.stringify({ v: 1, settings: { autoImg: false } })); });
  await open(q, '/');
  await q.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  control.blockImg = true; offline = true;
  await q.reload({ waitUntil: 'networkidle0' });
  await q.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await go(q, '/hoc');
  await q.waitForFunction(() => { const b = document.getElementById('img-banner'); return b && !b.hidden && b.textContent.length > 10; }, { timeout: 8000 });
  await has(q, 'Đang ngoại tuyến'); await has(q, 'hình chưa có trên máy');
  await shot(q, '21-ngoai-tuyen-thieu-hinh');
  await go(q, '/hoc/c/5'); await click(q, '301', { scope: '.ngrid .ncell', nth: 0 }); await q.waitForSelector('.qimg-missing', { timeout: 8000 });
  await has(q, 'chưa có trên máy');
  await shot(q, '22-cau-thieu-hinh');
  control.blockImg = false; offline = false;
  await q.__ctx.close();
});

await step('ngoại tuyến: service worker, mở lại khi mất mạng, hình đã xem vẫn hiện', async () => {
  await open(p, '/');
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await p.reload({ waitUntil: 'networkidle0' }); // để được SW kiểm soát
  await sleep(500);
  const ctrl = await p.evaluate(() => !!navigator.serviceWorker.controller);
  await must(ctrl, 'SW chưa kiểm soát trang');
  await go(p, '/hoc/c/5'); await click(p, '301', { scope: '.ngrid .ncell', nth: 0 }); await p.waitForSelector('.qimg'); await sleep(400);
  offline = true;
  await p.setOfflineMode(true);
  await p.goto(BASE + '#/', { waitUntil: 'domcontentloaded' });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await has(p, 'ngày nữa là thi'); await has(p, 'Hôm nay');
  await go(p, '/hoc/c/5'); await click(p, '301', { scope: '.ngrid .ncell', nth: 0 }); await p.waitForSelector('.qimg');
  await sleep(500);
  const ok = await p.$eval('.qimg', (i) => i.complete && i.naturalWidth > 100);
  await must(ok, 'hình không hiện khi ngoại tuyến');
  await shot(p, '20-ngoai-tuyen');
  await p.setOfflineMode(false);
  offline = false;
});

await step('xóa toàn bộ dữ liệu: về trạng thái ban đầu', async () => {
  await open(p, '/cai-dat');
  await click(p, 'Xóa toàn bộ dữ liệu');
  await click(p, 'Xóa hết', { scope: '.overlay .btn' });
  await p.waitForFunction(() => window.__ready === true); await sleep(400);
  const d = await storeData(p);
  await must(!d || Object.keys(d.q || {}).length === 0, 'còn dữ liệu sau khi xóa');
});
await p.__ctx.close();

// ============ Máy tính ============
console.log('--- 1280x800, sáng ---');
const dk = await newPage('desktop', { w: 1280, h: 800, mobile: false });
await step('máy tính: trang chủ, luyện tập, kết quả không tràn, đọc dễ', async () => {
  await open(dk, '/');
  await audit(dk, 'home'); await shot(dk, '30-desktop-home');
  await go(dk, '/hoc/c/6'); await click(dk, '486', { scope: '.ngrid .ncell' }); await dk.waitForSelector('.qimg');
  await dk.evaluate(() => document.querySelector('.opt[data-i="0"]').click()); await sleep(200);
  await audit(dk, 'luyen'); await shot(dk, '31-desktop-luyen');
  await dk.keyboard.press('Escape');
  await go(dk, '/thi'); await click(dk, 'Bắt đầu thi thử'); await dk.waitForSelector('.qcard');
  await dk.keyboard.press('2'); await sleep(150);
  const sel = await dk.$$eval('.opt.sel', (e) => e.length);
  await must(sel === 1, 'phím số 2 không chọn đáp án');
  await audit(dk, 'thi'); await shot(dk, '32-desktop-thi');
  await go(dk, '/tien-do'); await audit(dk, 'tien-do'); await shot(dk, '33-desktop-tien-do');
  await go(dk, '/du-lieu'); await audit(dk, 'du-lieu'); await shot(dk, '34-desktop-du-lieu');
});
await dk.__ctx.close();

// ============ Điện thoại, giao diện tối ============
console.log('--- 390x844, tối ---');
const dd = await newPage('mobile-tối', { dark: true });
await step('giao diện tối: trang chủ, câu hỏi có hình, kết quả', async () => {
  await open(dd, '/');
  await audit(dd, 'home'); await shot(dd, '40-toi-home');
  await go(dd, '/hoc/c/6'); await click(dd, '490', { scope: '.ngrid .ncell' }); await dd.waitForSelector('.qimg');
  const q = QB.get(490);
  await dd.evaluate((i) => document.querySelector(`.opt[data-i="${i}"]`).click(), (q.a + 1) % q.opts.length); await sleep(200);
  await audit(dd, 'luyen'); await shot(dd, '41-toi-luyen');
  await go(dd, '/hoc/diem-liet'); await shot(dd, '42-toi-diem-liet');
  await go(dd, '/thi'); await click(dd, 'Bắt đầu thi thử'); await dd.waitForSelector('.qcard');
  await answerAll(dd);
  await click(dd, 'Nộp bài', { scope: '.qnav .btn' }); await click(dd, 'Nộp bài', { scope: '.overlay .btn' });
  await dd.waitForSelector('.result'); await audit(dd, 'ket-qua'); await shot(dd, '43-toi-ket-qua');
  await go(dd, '/cai-dat'); await shot(dd, '44-toi-cai-dat');
});
await step('giao diện tối: đổi sang sáng trong cài đặt có hiệu lực', async () => {
  await go(dd, '/cai-dat'); await dd.select('#in-theme', 'light'); await sleep(300);
  const th = await dd.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await must(th === 'light', 'data-theme=' + th);
});
await dd.__ctx.close();

await browser.close();

console.log('\n=== TỔNG KẾT ===');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} bước đạt`);
for (const r of failed) console.log(' - LỖI:', r.name, '→', r.err);
const uniq = [...new Set(problems)];
console.log(`Vấn đề giao diện/console: ${uniq.length}`);
for (const m of uniq) console.log(' -', m);
process.exit(failed.length || uniq.length ? 1 : 0);
