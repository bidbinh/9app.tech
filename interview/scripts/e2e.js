// Kiểm tra giao diện thật bằng Chrome (puppeteer-core): điện thoại 390x844 và máy tính, Speech API giả, AI giả.
// Chạy: node scripts/e2e.js    Ảnh chụp lưu ở shots/. Cổng ngẫu nhiên >= 9700. Không gọi dịch vụ AI thật.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

/* ---------- AI giả ---------- */
const geminiCalls = [];
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const sys = body.systemInstruction.parts[0].text;
  const user = body.contents[0].parts[0].text;
  geminiCalls.push({ sys, user, key: init.headers['x-goog-api-key'] });
  const out = sys.includes('chuyên gia viết CV')
    ? { bullets: ['Phụ trách đối chiếu công nợ hằng tháng cho 40 khách hàng', 'Tăng 45% hiệu suất cả phòng', 'Lập báo cáo tuần cho trưởng phòng [số liệu thật của bạn]'], keywords: ['công nợ', 'đối chiếu'], missing: ['SAP'], note: 'Chỉ giữ những gì đúng sự thật.' }
    : { overall: 7, summary: 'Câu trả lời có ví dụ thật nhưng còn thiếu số liệu.', star: { situation: true, task: false, action: true, result: true },
      criteria: [{ key: 'cau_truc', score: 7, comment: 'Có mở đầu và kết quả.' }, { key: 'cu_the', score: 8, comment: 'Có ví dụ thật.' }, { key: 'so_lieu', score: 4, comment: 'Chưa có con số.' }, { key: 'do_dai', score: 6, comment: 'Hơi ngắn.' }, { key: 'phu_hop', score: 8, comment: 'Đúng ý.' }],
      strengths: ['Có ví dụ thật'], improvements: ['Thêm số liệu thật của bạn'], rewrite_hint: 'Mở bằng bối cảnh rồi nêu kết quả.' };
  return { status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) };
};

async function startServer(env) {
  const cfg = loadConfig({ BASE_PATH: '/interview', INTERVIEW_IP_PER_MIN: '10000', INTERVIEW_SESSION_PER_MIN: '10000', INTERVIEW_IP_PER_DAY: '100000', INTERVIEW_GLOBAL_PER_DAY: '100000', ...env });
  const app = createServer(cfg, { fetchImpl: fakeFetch, log: () => {} });
  for (let i = 0; i < 40; i++) {
    const port = 9700 + Math.floor(Math.random() * 2300);
    try { await app.listen(port, '127.0.0.1'); return { app, origin: `http://127.0.0.1:${port}`, port }; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('Không tìm được cổng trống');
}
const withAi = await startServer({ INTERVIEW_AI_KEY: 'khoa-e2e-gia' });
const noAi = await startServer({});
console.log(`Máy chủ có AI giả: ${withAi.origin}  |  không AI: ${noAi.origin}`);

/* ---------- Speech API giả ---------- */
const SPEECH_STUB = `
(() => {
  window.__spoken = [];
  const synth = { speaking: false, getVoices: () => [], cancel() {}, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50); }, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  const CHUNKS = ['Ờ em tên là Lan, hiện em làm chuyên viên hành chính được ba năm. ', 'Kiểm tra lại thì kiểu như là em đã chuyển quy trình theo dõi hợp đồng sang bảng tính chung à, nhờ đó cả phòng tìm hồ sơ nhanh hơn. '];
  window.__recStarts = 0;
  class FakeRec {
    constructor() { this.idx = 0; }
    start() {
      window.__recStarts++;
      this.t1 = setTimeout(() => this._emit(false, CHUNKS[0], true), 400);
      this.t2 = setTimeout(() => this._emit(false, CHUNKS[1], true), 1100);
    }
    _emit(_, text, final) {
      const res = [{ isFinal: final, 0: { transcript: text, confidence: 0.9 }, length: 1 }];
      this.onresult && this.onresult({ resultIndex: 0, results: res });
    }
    stop() { clearTimeout(this.t1); clearTimeout(this.t2); setTimeout(() => this.onend && this.onend(), 30); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
  window.__printed = 0; window.print = () => { window.__printed++; };
})();
`;
const NO_SPEECH_STUB = `(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.__printed = 0; window.print = () => { window.__printed++; }; Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); })();`;

/* ---------- Khung kiểm tra ---------- */
const results = []; const problems = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? 'OK  ' : 'LỖI'} ${name}${extra ? ' - ' + extra : ''}`); };
const PDFJS = process.env.PDFJS || 'file:///C:/Users/admin/AppData/Local/Temp/claude/d--9app-tech/68e078a8-7890-4f10-b74b-09941b1d0c9c/scratchpad/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
// Đọc PDF bằng pdf.js: số trang, chữ, vị trí chữ cao nhất tính từ mép trên (pt)
async function readPdf(file) {
  const pdfjs = await import(PDFJS);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const H = p.view[3];
    const items = (await p.getTextContent()).items.filter((x) => x.str.trim());
    pages.push({ text: items.map((x) => x.str).join(' '), topY: items.length ? H - Math.max(...items.map((x) => x.transform[5] + x.height)) : -1, items: items.length });
  }
  return { pages };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9interview-chrome-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

async function newPage(name, { view = { width: 390, height: 844 }, dark = false, speech = true } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const mobile = view.width < 700;
  await page.setViewport({ ...view, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.evaluateOnNewDocument(speech ? SPEECH_STUB : NO_SPEECH_STUB);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!(r.failure()?.errorText || '').includes('ERR_ABORTED')) problems.push(`[${name}] requestfailed ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`[${name}] HTTP ${r.status()} ${r.url()}`); });
  page.__name = name; page.__ctx = ctx;
  return page;
}
const URL_AI = `${withAi.origin}/interview/`;
const URL_NOAI = `${noAi.origin}/interview/`;
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
async function go(page, hash = '', base = URL_AI) { await page.goto(base + (hash ? '#/' + hash : ''), { waitUntil: 'networkidle0' }); await page.evaluate(() => window.scrollTo(0, 0)); }
async function nav(page, hash) { await page.evaluate((h) => { location.hash = '#/' + h; }, hash); await sleep(150); }
const text = (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
async function clickText(page, sel, label) {
  const ok = await page.evaluate((s, l) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l)); if (!el) return false; el.click(); return true; }, sel, label);
  if (!ok) throw new Error(`Không thấy ${sel} có chữ "${label}"`);
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function ls(page, fn) { await sleep(450); return page.evaluate(fn); }
async function setValue(page, sel, v) { await page.$eval(sel, (e, val) => { e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); }, v); }

try {
  /* ===== 1. Trang chủ, điều hướng, PWA ===== */
  const m = await newPage('mobile');
  await go(m);
  ok('Trang chủ có tiêu đề', (await text(m, 'h1')) === 'Sẵn sàng cho buổi phỏng vấn');
  ok('Nút ‹ 9app có mặt, trỏ về launcher', await m.$eval('#home-link', (a) => a.textContent.includes('9app') && /9app\.tech/.test(a.href)));
  ok('Có 5 mục điều hướng', (await m.$$('#nav a')).length === 5);
  await m.waitForFunction(() => /bật/.test(document.getElementById('ai-pill').textContent));
  ok('Trạng thái AI hiển thị "bật" khi máy chủ có khóa', /bật/.test(await text(m, '#ai-pill')));
  ok('Không tràn ngang ở 390px (trang chủ)', await noHScroll(m));
  await shot(m, 'm-01-home', true);
  ok('manifest và icon tải được', (await (await fetch(`${withAi.origin}/interview/manifest.webmanifest`)).json()).short_name === '9interview' && (await fetch(`${withAi.origin}/interview/icons/icon-192.png`)).status === 200);
  const swReady = await m.evaluate(async () => { try { const r = await navigator.serviceWorker.ready; return !!r.active; } catch { return false; } });
  ok('Service worker đăng ký được', swReady);
  // chọn nhóm nghề
  await clickText(m, '.chips .chip', 'Kế toán');
  ok('Chọn nhóm nghề lưu vào máy', await ls(m, () => JSON.parse(localStorage.getItem('n9interview.v1')).settings.group === 'ketoan'));

  /* ===== 2. Ngân hàng câu hỏi ===== */
  await nav(m, 'hoi');
  const total = await m.$$eval('#q-list .qitem', (a) => a.length);
  ok('Danh sách câu hỏi >= 80', total >= 80, `${total} câu`);
  await clickText(m, '#f-group .chip', 'Kế toán');
  const kt = await m.$$eval('#q-list .qitem', (a) => a.length);
  ok('Lọc theo nhóm Kế toán', kt >= 9 && kt < total, `${kt} câu`);
  await clickText(m, '#f-group .chip', 'Tất cả');
  await setValue(m, '#q-search', 'điểm yếu');
  ok('Tìm kiếm "điểm yếu"', (await m.$$eval('#q-list .qitem', (a) => a.length)) >= 1);
  await setValue(m, '#q-search', '');
  await m.evaluate(() => document.querySelector('#q-list .qitem').click());
  await m.waitForSelector('#btn-sample');
  ok('Chi tiết câu hỏi có ý đồ và mẹo', (await m.$$('.card .eyebrow')).length >= 2);
  ok('Mẫu trả lời ẩn mặc định', await m.$eval('#sample-box', (e) => e.classList.contains('hidden')));
  await m.click('#btn-sample');
  ok('Bấm mở ví dụ trả lời', await m.$eval('#sample-box', (e) => !e.classList.contains('hidden')));
  await shot(m, 'm-02-question', true);
  await nav(m, 'hoi');
  await shot(m, 'm-02-bank');

  /* ===== 3. Luyện nói bằng giọng (Speech giả) ===== */
  await nav(m, 'luyen');
  await shot(m, 'm-03-setup');
  await m.click('#btn-start');
  await m.waitForSelector('#btn-rec');
  const q1 = await text(m, '#q-text');
  ok('Hiện câu hỏi đầu tiên của bộ', q1 && q1.length > 10 && (await text(m, '.progress')).includes('Câu 1 / 5'), q1);
  await m.click('#btn-tts');
  ok('Đọc câu hỏi bằng TTS (giả)', (await m.evaluate(() => window.__spoken)).includes(q1));
  await m.click('#btn-rec');
  ok('Đang ghi: nút đổi trạng thái', await m.$eval('#btn-rec', (b) => b.classList.contains('rec') && /Dừng/.test(b.textContent)));
  await m.waitForFunction(() => document.getElementById('answer').value.includes('bảng tính chung'), { timeout: 5000 });
  await sleep(5600);
  const timerTxt = await text(m, '#timer');
  ok('Đồng hồ chạy khi nói', timerTxt !== '0:00', timerTxt);
  await shot(m, 'm-04-recording');
  await m.click('#btn-rec');
  await sleep(700);
  const ansVal = await m.$eval('#answer', (e) => e.value);
  ok('Chữ nhận dạng điền vào ô trả lời', ansVal.includes('chuyên viên hành chính') && ansVal.includes('bảng tính chung'));
  // giả lập nói đủ 20 giây để tính tốc độ: chỉnh bộ đếm thời gian nói qua đồng hồ
  await m.click('#btn-analyze');
  await m.waitForSelector('#result .stats');
  const stat = await m.$$eval('#result .stats .stat', (els) => els.map((e) => e.querySelector('b').textContent));
  ok('Phân tích: có số từ và từ độn', Number(stat[0]) > 20 && Number(stat[1]) === 3 && Number(stat[2]) > 0, JSON.stringify(stat));
  ok('Hiện từ độn đã bắt được ("ờ", "kiểu như là", "à")', await m.$$eval('#result .tag.warn', (t) => t.map((x) => x.textContent).join('|')).then((s) => s.includes('"ờ"') && s.includes('kiểu như là') && s.includes('"à"')));
  ok('Có lưu ý nhận dạng giọng nói bỏ từ độn', (await text(m, '#result')).includes('mức tối thiểu'));
  ok('Lưu lịch sử luyện tập vào máy', await ls(m, () => JSON.parse(localStorage.getItem('n9interview.v1')).history.length === 1));
  await shot(m, 'm-05-analysis', true);
  // AI: đồng ý gửi
  await m.click('#btn-ai');
  await m.waitForSelector('.modal');
  ok('Hỏi đồng ý trước khi gửi AI, nêu rõ gửi gì', (await text(m, '.modal')).includes('Google Gemini') && (await text(m, '.modal')).includes('không lưu'));
  await shot(m, 'm-06-consent');
  await m.click('.modal [data-act=ok]');
  await m.waitForSelector('#feedback', { timeout: 8000 });
  ok('AI chấm trả điểm 7/10 và 5 tiêu chí', (await text(m, '.score b')) === '7' && (await m.$$('.crit-row')).length === 5);
  ok('Máy chủ giả nhận đúng khóa và nội dung, khóa không hiện ở trình duyệt', geminiCalls.length === 1 && geminiCalls[0].key === 'khoa-e2e-gia' && geminiCalls[0].user.includes('bảng tính chung') && !(await m.content()).includes('khoa-e2e-gia'));
  await m.evaluate(() => document.getElementById('feedback').scrollIntoView());
  await shot(m, 'm-07-ai-feedback');
  // Câu tiếp theo cho tới hết bộ
  for (let i = 2; i <= 5; i++) {
    await m.evaluate(() => document.getElementById('btn-next').click());
    await m.waitForSelector('#btn-rec', { timeout: 4000 }).catch(async (e) => { console.log('DEBUG', await m.evaluate(() => location.hash + ' | ' + document.getElementById('view').innerText.slice(0, 300))); throw e; });
    const prog = await text(m, '.progress'); ok(`Sang câu ${i}/5`, prog.includes(`Câu ${i} / 5`), prog + ' ' + (await m.evaluate(() => location.hash)));
    await setValue(m, '#answer', 'Có lần tại công ty cũ em được giao phụ trách đối chiếu 120 hồ sơ. Em đã lập bảng theo dõi chung. Kết quả là thời gian giảm từ 3 ngày xuống 1 ngày, nhờ đó cả phòng làm việc nhanh hơn.');
    await m.click('#btn-analyze');
    await m.waitForSelector('#result .stats');
  }
  await m.evaluate(() => document.getElementById('btn-next').click());
  await m.waitForSelector('.list .card');
  ok('Màn tổng kết bộ câu hỏi', (await m.$$('.list .card')).length === 5);
  await shot(m, 'm-08-session-end', true);

  /* Hẹn giờ tự dừng */
  await nav(m, 'luyen/q/c01');
  await m.waitForSelector('#btn-rec');
  await m.select('#limit', '60');
  ok('Hẹn giờ có các mức', (await m.$$eval('#limit option', (o) => o.length)) === 4);
  await shot(m, 'm-09-single-question');

  /* ===== 4. Gõ chữ khi không có Speech API ===== */
  const t = await newPage('typed', { speech: false });
  await go(t, 'luyen/q/c10');
  await t.waitForSelector('#answer');
  ok('Không có Speech API: vẫn luyện bằng gõ, có thông báo', (await t.$eval('#answer', (e) => e.placeholder)).includes('Gõ') && (await t.$$eval('.muted.small', (a) => a.map((x) => x.textContent).join(' '))).includes('gõ'));
  await t.click('#btn-rec');
  ok('Bấm nói khi không hỗ trợ: báo, không lỗi', (await text(t, '#toast')).includes('chưa hỗ trợ'));
  await t.click('#btn-tts');
  ok('TTS không hỗ trợ: báo gọn', (await text(t, '#toast')).includes('chưa hỗ trợ'));
  await t.type('#answer', 'Ờ trong dự án sự kiện cuối năm em và bạn phụ trách truyền thông bất đồng về ngân sách. Em hẹn nói chuyện riêng, đề xuất in số lượng vừa phải. Kết quả là sự kiện suôn sẻ.');
  await t.click('#btn-analyze');
  await t.waitForSelector('#result .stats');
  const tstat = await t.$$eval('#result .stats .stat', (els) => els.map((e) => e.querySelector('b').textContent));
  ok('Gõ chữ: có số từ, từ độn; tốc độ để trống', Number(tstat[0]) > 25 && Number(tstat[1]) === 1 && tstat[2] === '-', JSON.stringify(tstat));
  ok('Gợi ý nhanh STAR hiện cho câu hành vi', (await t.$$('.starrow .star')).length === 4);
  await shot(t, 'm-10-typed-analysis', true);
  await t.close();

  /* ===== 5. CV ===== */
  await nav(m, 'cv');
  await m.waitForSelector('#add-exp');
  ok('Trang CV: có tab Nhập thông tin / Xem trước', (await m.$$('#cv-wrap')).length === 1);
  await m.click('#btn-sample-cv').catch(() => {});
  // nút dữ liệu mẫu nằm ở tab xem trước
  await m.click('#seg-preview');
  await m.click('#btn-sample-cv');
  await m.waitForSelector('#cv-frame .cv h1');
  ok('Điền dữ liệu mẫu: xem trước hiện họ tên', (await text(m, '#cv-frame .cv h1')) === 'Nguyễn Thị Lan');
  ok('Xem trước nằm gọn trong màn hình 390px', await noHScroll(m) && await m.$eval('#cv-frame', (f) => f.getBoundingClientRect().width <= 390));
  const scale = await m.$eval('.cv-scale', (e) => e.style.transform);
  ok('Xem trước co theo bề rộng điện thoại', /scale\(0\.[3-6]/.test(scale), scale);
  const checks = await text(m, '#cv-checks');
  ok('Mục kiểm tra CV hiện', checks.includes('Kiểm tra trước khi gửi'));
  for (const tpl of ['codien', 'hiendai', 'toigian', 'noibat']) {
    await m.click(`[data-tpl=${tpl}]`);
    await sleep(250);
    ok(`Mẫu ${tpl} áp dụng`, await m.$eval('#cv-frame .cv', (e, t) => e.classList.contains('tpl-' + t), tpl));
    await m.evaluate(() => document.getElementById('cv-frame').scrollIntoView());
    await shot(m, `m-11-cv-${tpl}`);
  }
  // ảnh chân dung cho mẫu Nổi bật
  const pngFile = path.join(os.tmpdir(), '9interview-photo.png');
  const dataUrl = await m.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#6aa'; x.fillRect(0, 0, 400, 300); x.fillStyle = '#fed'; x.beginPath(); x.arc(200, 130, 60, 0, 7); x.fill(); return c.toDataURL('image/png'); });
  fs.writeFileSync(pngFile, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await (await m.$('#photo-file')).uploadFile(pngFile);
  await m.waitForSelector('#cv-frame .cv-photo');
  ok('Ảnh chân dung hiện ở mẫu Nổi bật', true);
  await m.evaluate(() => document.getElementById('cv-frame').scrollIntoView());
  await shot(m, 'm-12-cv-photo');
  // sửa form → xem trước đổi
  await m.click('#seg-form');
  await setValue(m, '#f-hoTen', 'Trần Văn Bình <b>');
  await m.click('#seg-preview');
  await sleep(300);
  ok('Sửa tên → xem trước đổi, ký tự HTML được escape', (await text(m, '#cv-frame .cv h1')) === 'Trần Văn Bình <b>' && (await m.$$('#cv-frame .cv h1 b')).length === 0);
  ok('Dữ liệu CV lưu cục bộ, không gọi máy chủ', await ls(m, () => JSON.parse(localStorage.getItem('n9interview.v1')).cv.hoTen === 'Trần Văn Bình <b>'));
  await m.click('#seg-form');
  await setValue(m, '#f-hoTen', 'Nguyễn Thị Lan');

  // AI viết lại mô tả
  const aiBtns = await m.$$('[data-ai]');
  ok('Nút AI viết lại hiện khi máy chủ bật AI', aiBtns.length >= 1);
  await setValue(m, '[data-exp="0"] textarea', 'Phụ trách đối chiếu công nợ hằng tháng cho 40 khách hàng, lập báo cáo tuần.');
  await m.evaluate(() => document.querySelector('[data-ai="0"]').click());
  await m.waitForSelector('#go-ai-0');
  await m.evaluate(() => { const t = document.getElementById('job-0'); t.value = 'Cần kế toán công nợ biết SAP, kỹ năng đối chiếu.'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await m.click('#go-ai-0');
  await m.waitForSelector('.modal');
  ok('Hỏi đồng ý riêng cho CV, nói rõ không gửi họ tên', (await text(m, '.modal')).includes('không được gửi'));
  await m.click('.modal [data-act=ok]');
  await m.waitForSelector('[data-use=replace]', { timeout: 8000 });
  const bl = await m.$$eval('.ai-out .bul li', (a) => a.map((x) => x.textContent));
  ok('Gợi ý viết lại: bỏ dòng có số bịa (45%)', bl.length === 2 && !bl.join('').includes('45'), JSON.stringify(bl));
  ok('Máy chủ giả không nhận họ tên/liên hệ khi viết lại CV', !geminiCalls.at(-1).user.includes('Nguyễn') && !geminiCalls.at(-1).user.includes('0901') && geminiCalls.at(-1).user.includes('SAP'));
  await m.evaluate(() => document.querySelector('.ai-out').scrollIntoView());
  await shot(m, 'm-13-cv-ai');
  await m.click('[data-use=replace]');
  ok('Dùng gợi ý: thay phần mô tả', (await m.$eval('[data-exp="0"] textarea', (e) => e.value)).includes('40 khách hàng') && !(await m.$eval('[data-exp="0"] textarea', (e) => e.value)).includes('45'));
  await shot(m, 'm-14-cv-form', true);

  // Xuất PDF
  await m.click('#seg-preview');
  await clickText(m, '[data-tpl]', 'Cổ điển');
  await m.click('#btn-pdf');
  await m.waitForSelector('.modal');
  ok('CV còn chỗ trống [...]: hỏi xác nhận trước khi xuất PDF', (await text(m, '.modal')).includes('chỗ trống') && (await m.evaluate(() => window.__printed)) === 0);
  ok('Mục kiểm tra CV cảnh báo chỗ trống', (await text(m, '#cv-checks')).includes('chỗ trống'));
  await m.click('.modal [data-act=ok]');
  await sleep(900);
  ok('Bấm Xuất PDF gọi in của trình duyệt', (await m.evaluate(() => window.__printed)) === 1);
  const pdfInfo = {};
  for (const tpl of ['codien', 'hiendai', 'toigian', 'noibat']) {
    await m.evaluate((t) => { document.querySelector(`[data-tpl=${t}]`).click(); }, tpl);
    await sleep(250);
    await m.evaluate(() => { document.getElementById('print-root').innerHTML = document.querySelector('#cv-frame .cv-scale').innerHTML; });
    await m.emulateMediaType('print');
    const file = path.join(SHOTS, `cv-${tpl}.pdf`);
    await m.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    await m.screenshot({ path: path.join(SHOTS, `cv-print-${tpl}.png`), fullPage: true });
    await m.emulateMediaType('screen');
    await m.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
    const buf = fs.readFileSync(file);
    const pdf = await readPdf(file);
    const txt = pdf.pages.map((p) => p.text).join(' ');
    const fold = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, '').toLowerCase();
    const flat = fold(txt);
    const has = (w) => flat.includes(fold(w));
    const pages = pdf.pages.length;
    pdfInfo[tpl] = { bytes: buf.length, pages };
    ok(`PDF mẫu ${tpl}: hợp lệ, có chữ thật trích xuất được`, buf.slice(0, 5).toString() === '%PDF-' && buf.length > 5000 && has('Nguyễn Thị Lan') && has('Kinh nghiệm làm việc') && has('đối chiếu công nợ'), `${buf.length} byte, ${pages} trang${[has('Nguyễn Thị Lan'), has('Kinh nghiệm làm việc'), has('đối chiếu công nợ')].join('/')}`);
    ok(`PDF mẫu ${tpl}: vừa 1 trang A4 với CV mẫu`, Number(pages) === 1);
  }
  // CV dài 2 trang: kiểm tra lề trên của trang 2
  await m.evaluate(async () => { const st = await import('./js/store.js'); const s = st.get(); const e = s.cv.kinhNghiem[0]; for (let i = 0; i < 6; i++) s.cv.kinhNghiem.push({ ...e, congTy: 'Công ty số ' + (i + 3), chucVu: 'Vị trí ' + (i + 3), mota: e.mota + '\nThêm một dòng mô tả khá dài để chiếm chỗ trên trang giấy A4 trong bản in thử' }); st.flush(); });
  await m.reload({ waitUntil: 'networkidle0' });
  await nav(m, 'cv'); await m.waitForSelector('#seg-preview'); await m.click('#seg-preview'); await sleep(300);
  for (const tpl of ['codien', 'noibat']) {
    await m.evaluate((t) => document.querySelector(`[data-tpl=${t}]`).click(), tpl);
    await sleep(250);
    await m.evaluate(() => { document.getElementById('print-root').innerHTML = document.querySelector('#cv-frame .cv-scale').innerHTML; });
    await m.emulateMediaType('print');
    const file = path.join(SHOTS, `cv-long-${tpl}.pdf`);
    await m.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    await m.emulateMediaType('screen');
    await m.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
    const pdf = await readPdf(file);
    const pages = pdf.pages.length;
    const minY = pages >= 2 ? Math.round(pdf.pages[1].topY) : -1;
    ok(`CV dài mẫu ${tpl}: nhiều trang, trang 2 có lề trên >= 30pt`, pages >= 2 && minY >= 30, `${pages} trang, chữ cao nhất trang 2 ở ${minY}pt`);
  }
  // tải lại → dữ liệu còn
  await m.reload({ waitUntil: 'networkidle0' });
  await nav(m, 'cv'); await m.waitForSelector('#seg-preview'); await m.click('#seg-preview');
  ok('Tải lại trang: CV vẫn còn (lưu cục bộ)', (await text(m, '#cv-frame .cv h1')) === 'Nguyễn Thị Lan');

  /* ===== 6. Thư xin việc ===== */
  await nav(m, 'cv/thu');
  await m.waitForSelector('#btn-prefill');
  await m.click('#btn-prefill');
  await setValue(m, '[data-k=congTy]', 'Công ty Hoàng Long');
  await setValue(m, '[data-k=lyDo]', 'định hướng phát triển kênh bán trực tuyến');
  const letter = await text(m, '#letter-out');
  ok('Thư: điền từ CV, ghép ô, giữ chỗ cho ô còn trống', letter.includes('Nguyễn Thị Lan') && letter.includes('Công ty Hoàng Long') && letter.includes('[kinh nghiệm tóm tắt]'));
  await clickText(m, '[data-lt]', 'Ngắn gọn');
  ok('Đổi mẫu thư', (await text(m, '#letter-out')).startsWith('Chào'));
  ok('Không tràn ngang (thư)', await noHScroll(m));
  await shot(m, 'm-15-letter', true);
  ok('Thư hiện cảnh báo chỗ trống', (await text(m, '#letter-warn')).includes('chỗ trống'));
  await m.evaluate(() => document.getElementById('btn-pdf-letter').click()); await m.waitForSelector('.modal'); await m.click('.modal [data-act=ok]'); await sleep(900);
  ok('Thư: xuất PDF gọi in', (await m.evaluate(() => window.__printed)) >= 1);

  /* ===== 7. Chuẩn bị ===== */
  await nav(m, 'chuanbi');
  await m.waitForSelector('#chk-count');
  const chks = await m.$$('#prep-body input[type=checkbox]');
  ok('Checklist có nhiều mục', chks.length >= 20, `${chks.length}`);
  await chks[0].click(); await chks[1].click();
  ok('Đếm tiến độ checklist', (await text(m, '#chk-count')).startsWith('Đã xong 2/'));
  await shot(m, 'm-16-checklist');
  await clickText(m, '[data-sub]', 'Hỏi lại');
  ok('Có câu hỏi nên hỏi lại', (await m.$$('#prep-body .bul li')).length >= 10);
  await clickText(m, '[data-sub]', 'lương');
  const sal = await text(m, '#prep-body');
  ok('Đàm phán lương: có câu mẫu, nói rõ không đưa số liệu thị trường', sal.includes('không đưa ra số liệu') && !/\d+\s*(triệu|tr\b|vnđ)/i.test(sal));
  await shot(m, 'm-17-salary', true);
  await clickText(m, '[data-sub]', 'nhạy cảm');
  ok('Tab câu hỏi nhạy cảm có ghi chú pháp lý chung', (await text(m, '#prep-body')).includes('kiểm chứng') && (await m.$$('#prep-body .qitem')).length >= 4);
  await clickText(m, '[data-sub]', 'STAR');
  ok('Có hướng dẫn STAR', (await m.$$('.star-item')).length === 4);
  await m.reload({ waitUntil: 'networkidle0' });
  await nav(m, 'chuanbi'); await m.waitForSelector('#chk-count');
  ok('Tải lại: checklist còn nguyên', (await text(m, '#chk-count')).startsWith('Đã xong 2/'));

  /* ===== 8. Cài đặt, xóa dữ liệu ===== */
  await nav(m, 'caidat');
  await m.waitForSelector('#btn-wipe');
  ok('Trang dữ liệu nói rõ khi nào nội dung được gửi đi', (await text(m, '.page')).includes('Chỉ khi bạn chủ động bấm'));
  await shot(m, 'm-18-settings', true);
  const backup = await m.evaluate(() => localStorage.getItem('n9interview.v1'));
  ok('Sao lưu là JSON hợp lệ có CV', JSON.parse(backup).cv.hoTen === 'Nguyễn Thị Lan');
  await m.click('#btn-wipe');
  await m.waitForSelector('.modal');
  await m.click('.modal [data-act=ok]');
  await sleep(400);
  ok('Xóa toàn bộ dữ liệu: localStorage sạch', await m.evaluate(() => { const v = localStorage.getItem('n9interview.v1'); return !v || JSON.parse(v).cv.hoTen === ''; }));
  await nav(m, 'cv'); await m.waitForSelector('#seg-preview');
  ok('Sau khi xóa: CV trống', await m.evaluate(() => document.getElementById('f-hoTen').value === ''));
  ok('Không tràn ngang 390px (cài đặt, CV)', await noHScroll(m));
  await m.close();

  /* ===== 9. Máy chủ không có khóa AI ===== */
  const n = await newPage('noai');
  await go(n, '', URL_NOAI);
  await n.waitForFunction(() => /tắt/.test(document.getElementById('ai-pill').textContent));
  ok('Không khóa AI: trang chủ báo tắt gọn', /tắt/.test(await text(n, '#ai-pill')));
  await go(n, 'luyen/q/c10', URL_NOAI);
  await n.waitForSelector('#answer');
  await n.type('#answer', 'Trong dự án sự kiện em phụ trách truyền thông, em đề xuất in số lượng vừa phải. Kết quả sự kiện suôn sẻ.');
  await n.click('#btn-analyze');
  await n.waitForSelector('#btn-ai');
  await n.waitForFunction(() => document.getElementById('btn-ai').disabled);
  ok('Không khóa AI: nút AI bị khóa, phân tích cục bộ vẫn chạy', /đang tắt/.test(await text(n, '#btn-ai')) && (await n.$$('#result .stats .stat')).length === 4);
  await go(n, 'cv', URL_NOAI);
  await n.waitForSelector('#add-exp');
  await n.click('#add-exp');
  await sleep(300);
  ok('Không khóa AI: nút "AI viết lại" bị ẩn', await n.$eval('[data-ai="0"]', (b) => b.classList.contains('hidden')));
  const apiRes = await n.evaluate(async () => (await fetch('api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': 'abcdefghijklmnop1234' }, body: '{}' })).status);
  ok('Không khóa AI: API trả 503', apiRes === 503);
  problems.splice(0, problems.length, ...problems.filter((p) => !/HTTP 503|status of 503/.test(p)));
  await shot(n, 'm-19-noai-cv');
  await n.close();

  /* ===== 10. Máy tính (desktop) và chế độ tối ===== */
  const d = await newPage('desktop', { view: { width: 1280, height: 860 } });
  await go(d);
  ok('Desktop: không tràn ngang', await noHScroll(d));
  await shot(d, 'd-01-home');
  await nav(d, 'hoi'); await shot(d, 'd-02-bank');
  await nav(d, 'cv');
  await d.waitForSelector('#btn-sample-cv');
  await d.click('#btn-sample-cv');
  await d.waitForSelector('#cv-frame .cv h1');
  await sleep(300);
  ok('Desktop: biểu mẫu và xem trước hiện cạnh nhau', await d.evaluate(() => { const a = document.getElementById('cv-form').getBoundingClientRect(), b = document.getElementById('cv-preview').getBoundingClientRect(); return a.width > 300 && b.width > 300 && b.left > a.left + 200; }));
  await shot(d, 'd-03-cv-split');
  await nav(d, 'luyen/q/c10'); await d.waitForSelector('#btn-rec'); await shot(d, 'd-04-practice');
  await d.close();

  const dk = await newPage('dark', { dark: true });
  await go(dk); await shot(dk, 'm-20-dark-home');
  await nav(dk, 'luyen/q/c10'); await dk.waitForSelector('#btn-rec');
  await dk.click('#btn-rec'); await sleep(900); await dk.click('#btn-rec'); await sleep(500); await dk.click('#btn-analyze'); await dk.waitForSelector('#result .stats');
  await shot(dk, 'm-21-dark-analysis', true);
  await dk.close();

  const small = await newPage('small', { view: { width: 360, height: 740 } });
  await go(small);
  for (const h of ['', 'hoi', 'luyen', 'luyen/q/c05', 'cv', 'cv/thu', 'chuanbi', 'caidat']) { await nav(small, h); await sleep(120); ok(`360px không tràn ngang: #/${h}`, await noHScroll(small)); }
  await small.close();
} catch (e) {
  ok('E2E chạy hết không ngoại lệ', false, e.stack || e.message);
  try { for (const p of await browser.pages()) await p.screenshot({ path: path.join(SHOTS, `lỗi-${Date.now()}.png`) }); } catch { /* bỏ qua */ }
}

ok('Không có lỗi console / pageerror / request lỗi', problems.length === 0, problems.slice(0, 8).join(' || '));
await browser.close();
await withAi.app.close(); await noAi.app.close();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* bỏ qua */ }
const failed = results.filter((r) => !r.pass);
console.log(`\nTổng: ${results.length} kiểm tra, ${results.length - failed.length} đạt, ${failed.length} lỗi`);
if (problems.length) console.log('Vấn đề:\n' + problems.join('\n'));
process.exit(failed.length ? 1 : 0);
