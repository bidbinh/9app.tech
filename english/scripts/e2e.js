// Kiểm thử giao diện thật bằng Chrome (puppeteer-core): điện thoại 390x844 và máy tính 1280x800, sáng và tối.
// Giả lập speechSynthesis và SpeechRecognition. Ảnh chụp lưu ở shots/. Chạy: node scripts/e2e.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { start } = require('./serve.js');

const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(__dirname, '..', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const STUB = `(() => {
  window.__spoken = []; window.__heard = [];
  class U { constructor(t) { this.text = t; this.lang = 'en-US'; this.rate = 1; this.pitch = 1; this.voice = null; } }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
  const synth = { speak(u) { window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch, voice: u.voice && u.voice.name }); setTimeout(() => { u.onend && u.onend({}); }, 15); },
    cancel() {}, getVoices() { return [{ lang: 'en-US', name: 'Stub US' }, { lang: 'en-GB', name: 'Stub GB' }]; }, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  class R { constructor() { this.lang = 'en-US'; }
    start() { window.__recLang = this.lang; setTimeout(() => { this.onstart && this.onstart(); setTimeout(() => {
      const alts = window.__heard.shift();
      if (!alts) { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); return; }
      const res = alts.map((t) => ({ transcript: t })); res.isFinal = true;
      this.onresult && this.onresult({ results: [res] }); this.onend && this.onend();
    }, 60); }, 10); }
    stop() {} abort() {} }
  window.SpeechRecognition = R; window.webkitSpeechRecognition = R;
})();`;
const NOSTUB = `(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); })();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const problems = [];
let ORIGIN = '', browser = null;

async function newPage(name, { view = { width: 390, height: 844, mobile: true }, dark = false, stub = true, keepStorage = false, ctx = null } = {}) {
  const context = ctx || await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: view.width, height: view.height, deviceScaleFactor: view.mobile ? 2 : 1, isMobile: !!view.mobile, hasTouch: !!view.mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.evaluateOnNewDocument(stub ? STUB : NOSTUB);
  page.setDefaultTimeout(7000); page.__name = name; page.__ctx = context;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const t = r.failure() && r.failure().errorText || ''; if (!/ERR_ABORTED/.test(t)) problems.push(`[${name}] requestfailed ${r.url()} ${t}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`[${name}] HTTP ${r.status()} ${r.url()}`); });
  page.on('dialog', (d) => d.accept());
  return page;
}
let nOpen = 0;
async function open(page, hash = '') { await page.goto(`${ORIGIN}/english/?r=${++nOpen}${hash}`, { waitUntil: 'load' }); await page.waitForSelector('#view > *'); await sleep(120); }
async function go(page, hash) { await page.evaluate((h) => { if (location.hash === h) E9.app.render(); else location.hash = h; }, hash); await sleep(200); }
async function shot(page, name) { await sleep(150); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); }
async function shotFull(page, name) { await sleep(150); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); }
async function clickSel(page, sel) { await page.waitForSelector(sel, { visible: true, timeout: 4000 }); await page.click(sel); await sleep(120); }
async function clickText(page, text, scope = 'button, a, label') {
  const ok = await page.evaluate((text, scope) => {
    const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.textContent.replace(/\s+/g, ' ').trim().includes(text); });
    if (!els.length) return false; els[0].scrollIntoView({ block: 'center' }); els[0].click(); return true;
  }, text, scope);
  if (!ok) throw new Error('Không thấy nút: ' + text);
  await sleep(150);
}
const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('e9:state:v1') || 'null'));
const flush = (page) => page.evaluate(() => E9.store.flush());
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
async function noHScroll(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert(o.sw <= o.cw + 1, `${label}: cuộn ngang ${o.sw} > ${o.cw}`);
}

async function step(name, fn) {
  const t0 = Date.now(), before = problems.length;
  try { await fn(); const bad = problems.slice(before); if (bad.length) throw new Error('console/network: ' + bad.join(' | ')); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('  ok   ' + name); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0].slice(0, 400)); }
}

(async () => {
  const { srv, port } = await start();
  ORIGIN = `http://127.0.0.1:${port}`;
  console.log('Máy chủ thử nghiệm', ORIGIN);
  const { default: puppeteer } = await import(PPT);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9english-chrome-'));
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

  let m; // trang điện thoại chính, dùng chung một ngữ cảnh để giữ tiến độ

  await step('Trang chủ: tải, không lỗi console, nút về 9app, tiêu đề, manifest, CSP', async () => {
    m = await newPage('mobile');
    await open(m);
    assert((await m.title()).includes('9english'), 'tiêu đề');
    assert(await m.$('#n9-home'), 'thiếu nút về 9app (homebar.js)');
    const href = await m.$eval('#n9-home', (a) => a.getAttribute('href'));
    assert(href === '/', 'nút về 9app trỏ ' + href);
    const csp = await m.$eval('meta[http-equiv="Content-Security-Policy"]', (e) => e.content);
    assert(/script-src 'self'/.test(csp) && /default-src 'none'/.test(csp), 'CSP');
    const man = await m.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
    assert(man.icons.length >= 4 && man.start_url, 'manifest');
    assert(await m.$('.hero .ring'), 'vòng mục tiêu');
    await noHScroll(m, 'home');
    await shot(m, '01-home-mobile');
  });

  await step('Dữ liệu nạp đủ trong trình duyệt (≥400 từ, 7 chủ đề, 7 kịch bản...)', async () => {
    const d = await m.evaluate(() => ({ v: E9.vocab.length, t: E9.topics.length, d: E9.dialogs.list.length, l: E9.listening.list.length, p: E9.phrasesData.phrases.length, e: E9.templates.list.length, q: E9.placement.questions.length }));
    assert(d.v >= 400 && d.t === 7 && d.d >= 6 && d.l >= 8 && d.p >= 80 && d.e >= 8 && d.q === 20, JSON.stringify(d));
    console.log('       ', JSON.stringify(d));
  });

  await step('Từ vựng: danh sách chủ đề, lọc mức, danh sách từ có tìm kiếm', async () => {
    await clickText(m, 'Từ vựng', '#nav a');
    await m.waitForSelector('.topic');
    assert((await m.$$('.topic')).length === 7, '7 chủ đề');
    await noHScroll(m, 'learn');
    await shot(m, '02-learn-topics');
    await clickText(m, 'B1', '.chip');
    await sleep(500);
    assert((await state(m)).settings.levels.join() === 'B1', 'lọc mức B1 chưa lưu');
    await clickText(m, 'Tất cả', '.chip');
    await go(m, '#/learn/list/finance');
    await m.waitForSelector('.witem');
    await m.type('.search', 'invoice');
    await sleep(200);
    const n = (await m.$$('.witem')).length;
    assert(n >= 1 && n <= 3, 'tìm "invoice" ra ' + n);
    assert((await txt(m, '.witem')).includes('/ˈɪnvɔɪs/'), 'IPA hiển thị');
    await shot(m, '03-word-list-search');
  });

  await step('Phiên học: hiện nghĩa, chấm điểm, SM-2 lưu, thẻ "Quên" làm lại trong phiên', async () => {
    await go(m, '#/learn/s/email');
    await m.waitForSelector('#reveal');
    const first = await txt(m, '.bigword');
    await shot(m, '04-card-front');
    assert((await m.evaluate(() => window.__spoken.length)) >= 1, 'từ mới phải tự phát âm');
    await clickSel(m, '#reveal');
    await m.waitForSelector('.grades');
    assert((await txt(m, '.flash .vi')).length > 1, 'nghĩa');
    await shot(m, '05-card-back');
    // Quên thẻ đầu -> phải gặp lại trong phiên
    await clickSel(m, '.grade[data-grade=again]');
    let seen = false;
    for (let i = 0; i < 9; i++) {
      await m.waitForSelector('#reveal'); const w = await txt(m, '.bigword');
      if (w === first && i > 0) seen = true;
      await clickSel(m, '#reveal'); await m.waitForSelector('.grades');
      await clickSel(m, '.grade[data-grade=' + (i % 3 === 0 ? 'easy' : 'good') + ']');
      if (await m.$('.sumgrid')) break;
    }
    assert(seen, 'thẻ "Quên" không quay lại trong phiên');
    // hoàn tất phiên (còn thẻ làm lại nếu có)
    for (let i = 0; i < 6 && !(await m.$('.sumgrid')); i++) { await clickSel(m, '#reveal'); await m.waitForSelector('.grades'); await clickSel(m, '.grade[data-grade=good]'); }
    await m.waitForSelector('.sumgrid');
    await shot(m, '06-session-done');
    await flush(m);
    const st = await state(m);
    const ids = Object.keys(st.cards);
    assert(ids.length === 10, 'đã học ' + ids.length + ' thẻ (mong 10)');
    const f = st.cards[ids.find((id) => st.cards[id].lapses === 1)];
    assert(f && f.interval === 1 && f.reps === 0, 'thẻ Quên: interval 1, reps 0');
    assert(ids.some((id) => st.cards[id].interval === 1 && st.cards[id].reps === 1), 'thẻ Tốt đầu tiên hẹn 1 ngày');
    const today = await m.evaluate(() => E9.store.today());
    assert(Object.values(st.cards).every((c) => c.due >= today + 1), 'mọi thẻ đã chấm phải hẹn từ ngày mai');
    assert(st.daily[today].newCount === 10, 'đếm từ mới hôm nay');
  });

  await step('Giới hạn từ mới mỗi ngày: hết 10 từ thì phiên báo trống, "Học thêm 5 từ" hoạt động', async () => {
    await go(m, '#/learn/s/all');
    await m.waitForSelector('.card.center');
    assert((await txt(m, '.card.center')).includes('không còn thẻ'), 'nên báo hết thẻ');
    await clickText(m, 'Học thêm 5 từ mới', 'button');
    await m.waitForSelector('#reveal');
    assert((await txt(m, '.sess-head')).includes('/ 5'), 'phiên thêm 5 từ');
  });

  await step('Luyện nói trên thẻ: so khớp từ, gợi ý khi nghe sai', async () => {
    await go(m, '#/learn/s/all');
    await m.waitForSelector('.card.center, #reveal');
    await clickText(m, 'Học thêm 5 từ mới', 'button').catch(() => {});
    await m.waitForSelector('#reveal');
    const word = await txt(m, '.bigword');
    await clickSel(m, '#reveal'); await m.waitForSelector('button.mic');
    await m.evaluate((w) => { window.__heard.push([w.toLowerCase()]); }, word);
    await clickSel(m, 'button.mic');
    await m.waitForSelector('.mic-out .result');
    assert((await txt(m, '.mic-out .result')).includes('100'), 'nói đúng phải 100 điểm: ' + await txt(m, '.mic-out'));
    await m.evaluate(() => { window.__heard.push(['banana split']); });
    await clickSel(m, 'button.mic');
    await sleep(400);
    const r = await txt(m, '.mic-out');
    assert(/Cần luyện thêm/.test(r) && /banana/.test(r), 'nói sai: ' + r);
    await shot(m, '07-mic-wrong');
  });

  await step('Luyện nói: không nghe thấy gì -> thông báo thân thiện', async () => {
    await clickSel(m, 'button.mic');
    await sleep(500);
    assert(/Chưa nghe thấy/.test(await txt(m, '.mic-out')), 'thiếu thông báo no-speech: ' + await txt(m, '.mic-out'));
  });

  await step('Giao tiếp: trang chính, mẫu câu, nói thử gần đúng, ghi điểm', async () => {
    await clickText(m, 'Giao tiếp', '#nav a');
    await m.waitForSelector('.tile');
    await noHScroll(m, 'talk');
    await shot(m, '08-talk-hub');
    await go(m, '#/talk/c/decline');
    await m.waitForSelector('.phrase');
    assert((await m.$$('.phrase')).length >= 10, 'số mẫu câu');
    const en = await txt(m, '.phrase .en');
    // "near": thay một từ bằng dạng gần giống
    await m.evaluate((e) => { const w = e.split(' '); w[w.length - 1] = w[w.length - 1].replace(/[a-z]$/i, ''); window.__heard.push([w.join(' '), e.toLowerCase().replace(/[^a-z' ]/g, '')]); }, en);
    await m.click('.phrase button.mic');
    await m.waitForSelector('.phrase .mic-out .result');
    assert((await txt(m, '.phrase .mic-out .result')).includes('100'), 'chọn giả thuyết tốt nhất');
    await sleep(400); await flush(m);
    const st = await state(m);
    assert(Object.keys(st.spoken).length === 1 && st.daily[await m.evaluate(() => E9.store.today())].phrase, 'điểm nói chưa lưu');
    // từ gần giống: tô vàng + gợi ý
    await m.evaluate(() => { window.__heard.push(['i am afraid i cannot make it']); });
    await go(m, '#/talk/c/decline');
    await m.waitForSelector('.phrase');
    await m.evaluate(() => { window.__heard.length = 0; window.__heard.push(["i'm afraid i can't mak it"]); });
    await m.click('.phrase button.mic');
    await m.waitForSelector('.phrase .mic-out .words');
    assert(await m.$('.phrase .mic-out .w.near'), 'phải có từ gần đúng');
    assert(await m.$('.phrase .mic-out .hints li'), 'phải có gợi ý');
    await shot(m, '09-phrases-near');
  });

  await step('Email mẫu: điền ô, xem trước cập nhật, sao chép, đặt lại', async () => {
    await go(m, '#/talk/email');
    await m.waitForSelector('.row-card');
    assert((await m.$$('.row-card')).length >= 8, 'danh sách email');
    await go(m, '#/talk/email/meeting-request');
    await m.waitForSelector('.mail-body');
    assert((await txt(m, '.mail-body')).includes('Ms. Lan'), 'giá trị mặc định');
    await m.click('#f-to', { clickCount: 3 }); await m.type('#f-to', 'Mr. Pham');
    await m.click('#f-topic', { clickCount: 3 }); await m.keyboard.press('Backspace');
    const body = await txt(m, '.mail-body');
    assert(body.includes('Dear Mr. Pham,') && body.includes('[topic]'), 'xem trước phải cập nhật, ô trống giữ [topic]');
    await shotFull(m, '10-email-template');
    await m.evaluate(() => { const o = navigator.clipboard.writeText.bind(navigator.clipboard); window.__copied = null; navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; });
    await clickText(m, 'Sao chép email', 'button');
    const copied = await m.evaluate(() => window.__copied);
    assert(copied && copied.startsWith('Subject: Meeting request:') && copied.includes('Dear Mr. Pham'), 'nội dung sao chép');
    await m.evaluate(() => { window.__spoken.length = 0; });
    await clickText(m, 'Nghe cả email', 'button'); await sleep(300);
    assert((await m.evaluate(() => window.__spoken.some((s) => /^Dear Mr\. Pham/.test(s.text)))), 'TTS đọc email');
    await clickText(m, 'Đặt lại', 'button');
    assert((await txt(m, '.mail-body')).includes('Ms. Lan'), 'đặt lại');
  });

  await step('Đóng vai: chọn đường tốt -> kết quả Tốt; đường xấu -> cần cải thiện; lưu kết quả', async () => {
    await go(m, '#/talk/role');
    await m.waitForSelector('.row-card');
    await go(m, '#/talk/role/extension');
    await m.waitForSelector('.choices .choice');
    await shot(m, '11-role-start');
    // đi theo lựa chọn "best" bằng cách đọc dữ liệu
    const bestPath = async (wantTone) => {
      for (let i = 0; i < 12; i++) {
        await m.waitForSelector('.choices .choice, .end', { timeout: 4000 });
        if (await m.$('.end')) return;
        const pick = await m.evaluate((tone) => {
          const d = E9.dialogs.list.find((x) => x.id === 'extension');
          const said = [...document.querySelectorAll('.choices .choice .cs')].map((e) => e.textContent);
          const nodeId = Object.keys(d.nodes).find((id) => d.nodes[id].choices.every((c) => said.includes(c.say)));
          const c = d.nodes[nodeId].choices.find((c) => c.tone === tone) || d.nodes[nodeId].choices[0];
          return c.say;
        }, wantTone);
        await m.evaluate((say) => { [...document.querySelectorAll('.choices .choice')].find((b) => b.querySelector('.cs').textContent === say).click(); }, pick);
        await m.waitForSelector('.fb');
        if (i === 0) await shot(m, '12-role-feedback');
        await clickText(m, wantTone === 'best' ? 'Tiếp tục' : 'Tiếp tục', 'button').catch(async () => { await clickText(m, 'Xem kết quả', 'button'); });
      }
    };
    await bestPath('best');
    await m.waitForSelector('.end');
    assert(/Rất tốt/.test(await txt(m, '.end')), 'kết quả tốt: ' + await txt(m, '.end'));
    await shot(m, '13-role-good');
    await go(m, '#/talk/role/extension'); await m.waitForSelector('.choices .choice');
    await bestPath('poor');
    await m.waitForSelector('.end');
    await sleep(300); await flush(m);
    const st = await state(m);
    assert(st.roles.extension.best === 'good' && st.roles.extension.plays === 2, 'lưu kết quả đóng vai ' + JSON.stringify(st.roles));
  });

  await step('Đóng vai: duyệt mọi kịch bản không kẹt (đi theo lựa chọn đầu tiên đến hết)', async () => {
    const ids = await m.evaluate(() => E9.dialogs.list.map((d) => d.id));
    for (const id of ids) {
      await go(m, '#/talk/role/' + id);
      let done = false;
      for (let i = 0; i < 14 && !done; i++) {
        await m.waitForSelector('.choices .choice, .end', { timeout: 4000 });
        if (await m.$('.end')) { done = true; break; }
        await m.evaluate(() => document.querySelector('.choices .choice').click());
        await m.waitForSelector('.fb'); await m.evaluate(() => [...document.querySelectorAll('button.primary.wide')].pop().click()); await sleep(80);
      }
      if (!done) { await m.waitForSelector('.end', { timeout: 3000 }); }
    }
  });

  await step('Địa chỉ lạ không làm trống app: #/%, #/learn?x=%, chủ đề không tồn tại', async () => {
    await go(m, '#/%'); await m.waitForSelector('.hero');
    await go(m, '#/learn?x=%'); await m.waitForSelector('.topic');
    await go(m, '#/learn/s/xyz'); await m.waitForSelector('#view .card.center');
    assert(/không tồn tại/.test(await txt(m, '#view')), 'báo chủ đề không tồn tại');
    await go(m, '#/learn/list/xyz'); await m.waitForSelector('#view .card.center');
    await m.goto(`${ORIGIN}/english/?r=%25#/%`, { waitUntil: 'load' }); await m.waitForSelector('.hero');
  });

  await step('Đóng vai: chọn tốt hết rồi chọn xấu ở lượt cuối thì không được "Rất tốt"', async () => {
    await go(m, '#/talk/role/extension'); await m.waitForSelector('.choices .choice');
    const pickTone = async (tone) => {
      const say = await m.evaluate((tone) => {
        const d = E9.dialogs.list.find((x) => x.id === 'extension');
        const said = [...document.querySelectorAll('.choices .choice .cs')].map((e) => e.textContent);
        const n = Object.values(d.nodes).find((nd) => nd.choices.every((c) => said.includes(c.say)));
        return (n.choices.find((c) => c.tone === tone) || n.choices[0]).say;
      }, tone);
      await m.evaluate((say) => { [...document.querySelectorAll('.choices .choice')].find((b) => b.querySelector('.cs').textContent === say).click(); }, say);
      await m.waitForSelector('.fb');
      await m.evaluate(() => [...document.querySelectorAll('button.primary.wide')].pop().click());
      await sleep(100);
    };
    await pickTone('best');       // n1 -> n2a
    await pickTone('poor');       // n2a -> kết thúc xấu
    await m.waitForSelector('.end');
    assert(!/Rất tốt/.test(await txt(m, '.end')), 'kết quả: ' + await txt(m, '.end'));
  });

  await step('Bài nghe: phát từng dòng bằng giọng khác nhau, làm bài, chấm điểm, hiện lời thoại', async () => {
    await clickText(m, 'Nghe', '#nav a');
    await m.waitForSelector('.row-card');
    assert((await m.$$('.row-card')).length >= 8, 'số bài nghe');
    await shot(m, '14-listen-list');
    await go(m, '#/listen/checkin');
    await m.waitForSelector('#play');
    await m.evaluate(() => { window.__spoken.length = 0; });
    await m.click('#play');
    await m.waitForFunction(() => document.querySelector('#play span').textContent === 'Nghe', { timeout: 6000 });
    const sp = await m.evaluate(() => window.__spoken);
    assert(sp.length >= 4, 'đọc đủ các dòng, thực tế ' + sp.length);
    assert(sp[0].text.startsWith('Good evening') && sp.some((x) => x.text.startsWith('Welcome, Mr. Tran')), 'đúng thứ tự và không cắt sau "Mr."');
    assert(new Set(sp.map((s) => s.pitch)).size >= 2, 'hai người nói phải khác cao độ');
    assert(sp[0].lang === 'en-US', 'giọng Mỹ mặc định');
    await clickText(m, 'Chậm', '.chip');
    await m.evaluate(() => { window.__spoken.length = 0; });
    await m.click('#play'); await sleep(300);
    const slow = await m.evaluate(() => window.__spoken[0].rate);
    assert(slow < 0.8, 'chế độ chậm: ' + slow);
    assert((await m.$eval('.transcript', (e) => e.hidden)) === true, 'lời thoại ẩn trước khi làm bài');
    assert((await m.$eval('#check', (b) => b.disabled)) === true, 'nộp bài bị khóa khi chưa trả lời hết');
    // chọn đúng 2 câu, sai 1
    const picks = await m.evaluate(() => {
      const l = E9.listening.list.find((x) => x.id === 'checkin');
      return l.questions.map((q, i) => { const want = i === 2 ? (q.a + 1) % 4 : q.a; return q.options[want]; });
    });
    for (let i = 0; i < 3; i++) await m.evaluate((i, label) => { const fs = document.querySelectorAll('fieldset.q')[i]; [...fs.querySelectorAll('label.opt')].find((l) => l.textContent.trim() === label).click(); }, i, picks[i]);
    await shotFull(m, '15-listen-quiz');
    assert((await m.$eval('#check', (b) => b.disabled)) === false, 'nộp bài mở khi đã trả lời hết');
    await m.click('#check'); await sleep(200);
    assert((await txt(m, '.result-box')).includes('2/3'), 'điểm 2/3: ' + await txt(m, '.result-box'));
    assert((await m.$$('.opt.right')).length === 3 && (await m.$$('.opt.wrong')).length === 1, 'tô đúng/sai');
    assert((await m.$eval('.transcript', (e) => e.hidden)) === false, 'hiện lời thoại sau khi nộp');
    await shotFull(m, '16-listen-result');
    await flush(m);
    assert((await state(m)).listen.checkin === 2, 'lưu điểm nghe');
  });

  await step('Kiểm tra trình độ: làm đủ 20 câu, ra C1, áp dụng lộ trình lọc từ vựng', async () => {
    await go(m, '#/test');
    await m.waitForSelector('#start');
    await shot(m, '17-test-intro');
    await m.click('#start');
    for (let i = 0; i < 20; i++) {
      await m.waitForSelector('.opt-btn');
      if (i === 8) await shot(m, '18-test-question');
      await m.evaluate(() => {
        const q = E9.placement.questions.find((x) => document.querySelector('fieldset.q legend').textContent.includes(x.q.split('\n')[0].slice(0, 20)));
        const lab = q.options[q.a];
        [...document.querySelectorAll('.opt-btn')].find((b) => b.textContent.trim() === lab).click();
      });
      await sleep(60);
    }
    await m.waitForSelector('.lvl-badge.xl');
    assert((await txt(m, '.lvl-badge.xl')) === 'C1', 'trình độ ' + await txt(m, '.lvl-badge.xl'));
    await shotFull(m, '19-test-result');
    await clickSel(m, '#apply');
    await m.waitForSelector('.topic');
    await flush(m);
    const st = await state(m);
    assert(st.placement.level === 'C1' && st.settings.levels.join() === 'C1,B2', 'lưu kết quả/lộ trình ' + JSON.stringify(st.settings.levels));
    await go(m, '#/'); await m.waitForSelector('.lvl');
    assert((await txt(m, '.lvl')).includes('C1'), 'trang chủ hiển thị trình độ');
  });

  await step('Kiểm tra trình độ: trả lời sai hết -> A1; "Chưa chắc" tính là sai', async () => {
    await go(m, '#/test'); await m.waitForSelector('#start'); await m.click('#start');
    for (let i = 0; i < 20; i++) { await m.waitForSelector('.opt-btn'); await clickText(m, 'Chưa chắc', 'button'); }
    await m.waitForSelector('.lvl-badge.xl');
    assert((await txt(m, '.lvl-badge.xl')) === 'A1', 'A1');
    await go(m, '#/more'); await clickText(m, 'Tất cả', 'button').catch(() => {});
    await m.evaluate(() => { E9.store.state().settings.levels = []; E9.store.save(); });
  });

  await step('Chuỗi ngày: 3 ngày đạt mục tiêu -> chip 3, hôm nay "đã đạt"; thời gian học thật được đếm', async () => {
    await m.evaluate(() => { const s = E9.store.state(), t = E9.store.today(); s.secByDay = {}; s.secByDay[t - 3] = 700; s.secByDay[t - 2] = 650; s.secByDay[t - 1] = 600; E9.store.flush(); });
    await open(m, '#/');
    assert((await txt(m, '#hd-streak')).trim() === '3', 'chip chuỗi = ' + await txt(m, '#hd-streak'));
    assert((await txt(m, '.hero')).includes('3 ngày'), 'hero chuỗi');
    // đếm thời gian thật khi học
    await go(m, '#/learn/list/email');
    await m.waitForSelector('.witem');
    const before = (await state(m)).secByDay[await m.evaluate(() => E9.store.today())] || 0;
    for (let i = 0; i < 4; i++) { await m.mouse.click(10, 300); await sleep(700); }
    await sleep(600); await flush(m);
    const after = (await state(m)).secByDay[await m.evaluate(() => E9.store.today())] || 0;
    assert(after - before >= 2, `thời gian học tăng ${after - before}s (mong ≥2)`);
    // đạt mục tiêu hôm nay
    await m.evaluate(() => { const s = E9.store.state(); s.secByDay[E9.store.today()] = 600; E9.store.flush(); });
    await open(m, '#/');
    assert((await txt(m, '#hd-streak')).trim() === '4', 'chuỗi 4 sau khi đạt hôm nay: ' + await txt(m, '#hd-streak'));
    assert((await txt(m, '.hero')).includes('đã đạt mục tiêu'), 'thông báo đạt');
    await shot(m, '20-home-streak');
  });

  await step('Cài đặt: tải ICS đúng nội dung, đổi giọng Anh-Anh, xuất JSON, chế độ tối, xóa tiến độ', async () => {
    const dl = path.join(userDataDir, 'dl'); fs.mkdirSync(dl, { recursive: true });
    const cdp = await browser.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, browserContextId: m.__ctx.id });
    await go(m, '#/more'); await m.waitForSelector('#ics');
    await shotFull(m, '21-more');
    await m.evaluate(() => { const t = document.getElementById('remind-time'); t.value = '07:45'; t.dispatchEvent(new Event('change')); });
    await m.click('#ics'); await sleep(900);
    const f = path.join(dl, '9english-nhac-hoc.ics');
    assert(fs.existsSync(f), 'chưa tải được tệp ICS');
    const ics = fs.readFileSync(f, 'utf8');
    assert(/BEGIN:VCALENDAR/.test(ics) && /T074500/.test(ics) && /RRULE:FREQ=DAILY/.test(ics) && /VALARM/.test(ics), 'nội dung ICS');
    await clickText(m, 'Anh - Anh', '.segb');
    await clickText(m, 'Thử giọng đọc', 'button'); await sleep(200);
    assert((await m.evaluate(() => window.__spoken.pop().lang)) === 'en-GB', 'giọng Anh-Anh');
    await clickText(m, 'Xuất tiến độ', 'button'); await sleep(700);
    const j = path.join(dl, '9english-tien-do.json');
    assert(fs.existsSync(j) && JSON.parse(fs.readFileSync(j, 'utf8')).v === 1, 'xuất JSON');
    await clickText(m, 'Tối', '.segb');
    assert((await m.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'chế độ tối');
    await shot(m, '22-more-dark-top');
    await m.evaluate(() => scrollTo(0, 0));
    await clickText(m, 'Xóa tiến độ', 'button'); await sleep(300);
    await flush(m);
    const st = await state(m);
    assert(Object.keys(st.cards).length === 0 && Object.keys(st.secByDay).length === 0, 'xóa tiến độ');
    await m.evaluate(() => { E9.store.state().settings.theme = 'auto'; E9.store.flush(); E9.app.applyTheme(); });
  });

  await step('Tiến độ lưu qua lần mở lại; localStorage bị chặn vẫn chạy (không lỗi)', async () => {
    await open(m, '#/learn/s/meeting'); await m.waitForSelector('#reveal');
    await clickSel(m, '#reveal'); await m.waitForSelector('.grades'); await clickSel(m, '.grade[data-grade=good]');
    await flush(m);
    await open(m, '#/learn'); await m.waitForSelector('.topic');
    assert(/62 mới/.test(await m.$$eval('.topic', (els) => els.find((e) => e.textContent.includes('Họp')).textContent)), 'thẻ đã học được nhớ sau tải lại');
    const blocked = await newPage('blocked');
    await blocked.evaluateOnNewDocument(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } }); });
    await open(blocked);
    await blocked.waitForSelector('.hero');
    await go(blocked, '#/learn/s/email'); await blocked.waitForSelector('#reveal');
    await clickSel(blocked, '#reveal'); await blocked.waitForSelector('.grades'); await clickSel(blocked, '.grade[data-grade=good]');
    await go(blocked, '#/more'); await blocked.waitForSelector('.sys');
    assert(/Tạm thời/.test(await txt(blocked, '.sys')), 'báo lưu tạm thời');
    await blocked.close();
  });

  await step('Dự phòng khi trình duyệt không hỗ trợ nhận giọng/phát âm', async () => {
    const n = await newPage('nospeech', { stub: false });
    await open(n);
    await go(n, '#/talk/c/email'); await n.waitForSelector('.phrase');
    await n.click('.phrase button.mic'); await n.waitForSelector('.phrase .mic-out .note');
    assert(/chưa hỗ trợ nhận giọng/.test(await txt(n, '.phrase .mic-out')), 'thông báo dự phòng');
    await shot(n, '23-fallback-mic');
    await clickText(n, 'Đọc tốt', 'button'); await n.waitForSelector('.phrase .mic-out .result');
    await clickText(n, 'Nghe mẫu', 'button');
    await sleep(200);
    assert(/chưa hỗ trợ phát âm/.test(await txt(n, '#toast')), 'toast TTS: ' + await txt(n, '#toast'));
    await go(n, '#/listen/voicemail'); await n.waitForSelector('#play');
    await n.click('#play'); await sleep(300);
    assert((await n.$eval('.transcript', (e) => e.hidden)) === false, 'tự hiện lời thoại khi không có TTS');
    await go(n, '#/more'); await n.waitForSelector('.sys');
    assert((await txt(n, '.sys')).includes('Không'), 'báo thiếu hỗ trợ');
    await n.close();
  });

  await step('Service worker đăng ký và mở được khi mất mạng', async () => {
    const p = await newPage('sw');
    await open(p);
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await sleep(800);
    await p.reload({ waitUntil: 'load' }); await sleep(400);
    const keys = await p.evaluate(() => caches.keys());
    assert(keys.some((k) => k.startsWith('9english-')), 'chưa có bộ nhớ đệm: ' + keys);
    const cnt = await p.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
    assert(cnt >= 30, 'bộ nhớ đệm chỉ có ' + cnt);
    await p.setOfflineMode(true);
    const before = problems.length;
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('.hero', { timeout: 5000 });
    problems.splice(before); // mất mạng: bỏ qua lỗi tải homebar.js dùng chung
    await go(p, '#/learn'); await p.waitForSelector('.topic');
    await p.setOfflineMode(false);
    await p.close();
  });

  // ---- Ảnh chụp giao diện sáng/tối, điện thoại/máy tính ----
  await step('Chụp màn hình: tối (điện thoại)', async () => {
    const d = await newPage('dark', { dark: true });
    await open(d); await shot(d, '30-home-dark');
    await go(d, '#/learn'); await d.waitForSelector('.topic'); await shot(d, '31-learn-dark');
    await go(d, '#/learn/s/tech'); await d.waitForSelector('#reveal'); await clickSel(d, '#reveal'); await d.waitForSelector('.grades'); await shot(d, '32-card-back-dark');
    await go(d, '#/talk/role/complaint'); await d.waitForSelector('.choice'); await shot(d, '33-role-dark');
    await noHScroll(d, 'dark role');
    await d.close();
  });
  await step('Chụp màn hình: máy tính 1280x800', async () => {
    const w = await newPage('desktop', { view: { width: 1280, height: 800, mobile: false } });
    await open(w); await shot(w, '40-home-desktop');
    await go(w, '#/learn'); await w.waitForSelector('.topic'); await shot(w, '41-learn-desktop');
    await go(w, '#/learn/s/finance'); await w.waitForSelector('#reveal'); await clickSel(w, '#reveal'); await w.waitForSelector('.grades'); await shot(w, '42-card-desktop');
    await go(w, '#/talk'); await w.waitForSelector('.tile'); await shot(w, '43-talk-desktop');
    await go(w, '#/talk/email/follow-up'); await w.waitForSelector('.mail-body'); await shot(w, '44-email-desktop');
    await noHScroll(w, 'desktop');
    await w.close();
  });
  await step('Màn hình hẹp 360x740: không tràn ngang ở mọi mục', async () => {
    const n = await newPage('narrow', { view: { width: 360, height: 740, mobile: true } });
    await open(n);
    for (const h of ['#/', '#/learn', '#/learn/list/tech', '#/talk', '#/talk/c/meeting', '#/talk/email', '#/talk/role', '#/listen', '#/listen/negotiation', '#/more']) { await go(n, h); await sleep(200); await noHScroll(n, h); }
    await go(n, '#/learn/s/report'); await n.waitForSelector('#reveal'); await clickSel(n, '#reveal'); await n.waitForSelector('.grades'); await noHScroll(n, 'card');
    await shot(n, '50-card-360');
    await n.close();
  });

  await browser.close(); srv.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  const failed = results.filter((r) => !r.ok);
  console.log(`\nKết quả: ${results.length - failed.length}/${results.length} bước đạt`);
  if (problems.length) console.log('Vấn đề console/mạng chưa xử lý:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
