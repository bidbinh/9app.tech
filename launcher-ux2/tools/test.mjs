import { boot, PREFS_OLD } from './lib.mjs';
import { withFake, PREFS_MANY } from './shots.mjs';
const { browser, base, server } = await boot();
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(w, h, prefs, fake, scheme, hash, motion) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme || 'light' }, { name: 'prefers-reduced-motion', value: motion || 'no-preference' }]);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  if (fake) await withFake(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.evaluateOnNewDocument((p) => {
    if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.clear(); if (p) localStorage.setItem('9app.prefs', JSON.stringify(p)); }
  }, prefs);
  await page.goto(base + '/index.html' + (hash || ''), { waitUntil: 'networkidle0' });
  return { page, errors };
}
const dups = (a) => a.filter((x, i) => a.indexOf(x) !== i);
const txt = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map(e => e.textContent.trim()), sel);
const small = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a[href], button, input').forEach((e) => {
    if (e.closest('[hidden]')) return;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (r.height < 43.5 || r.width < 43.5) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  return out;
});
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

for (const w of [320, 360, 390, 430, 1280]) {
  for (const [nm, prefs, fake] of [['moi', null, 0], ['cu', PREFS_OLD, 0], ['40', PREFS_MANY, 1]]) {
    for (const scheme of (w === 390 ? ['light', 'dark'] : ['light'])) {
      const { page, errors } = await open(w, w < 700 ? 740 : 800, prefs, fake, scheme);
      const tag = `${nm} ${w} ${scheme}`;
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      ok(sw[0] <= sw[1], `${tag}: không tràn ngang (${sw})`);
      ok(errors.length === 0, `${tag}: không lỗi console ${errors.join('|')}`);
      const names = await txt(page, '#groups .mini-name, #groups .tile-name');
      ok(dups(names).length === 0, `${tag}: không app lặp trong Nhóm (${names.length}) ${dups(names)}`);
      const sm = await small(page);
      ok(sm.length === 0, `${tag}: vùng chạm >=44 ${sm.join(', ')}`);
      const cb = await contrast(page);
      ok(cb.length === 0, `${tag}: tương phản AA ${cb.slice(0, 5).join(' ; ')}`);
      await page.close();
    }
  }
}
for (const [nm, prefs, fake] of [['moi', null, 0], ['cu', PREFS_OLD, 0], ['40', PREFS_MANY, 1]]) {
  const { page } = await open(390, 844, prefs, fake);
  await page.evaluate(() => { GROUPS.forEach(g => { openGroups[g.id] = true; }); render(); });
  const all = await txt(page, '#groups .tile-name');
  const miniLeft = await txt(page, '#groups .mini-name');
  const home = await page.evaluate(() => APPS.filter(a => a.ready && onHome(a)).map(a => a.name));
  const seen = all.concat(miniLeft);
  const miss = home.filter(n => seen.indexOf(n) < 0);
  ok(miss.length === 0 && dups(seen).length === 0, `${nm}: mọi app trên trang chủ đúng 1 lần trong Nhóm (thiếu ${miss}, lặp ${dups(seen)}) ${seen.length}/${home.length}`);
  const g = await page.evaluate(() => ({ n: document.querySelectorAll('.gcard').length, few: [...document.querySelectorAll('.gcard')].filter(c => c.querySelectorAll('.tile,.mini').length < 2).length }));
  ok(g.n >= 3 && g.n <= 7, `${nm}: số nhóm ${g.n}`);
  if (nm !== 'cu') ok(g.few === 0, `${nm}: nhóm nào cũng >=2 app`);
  await page.close();
}
{
  const { page } = await open(390, 844, PREFS_OLD, 0);
  const sugg = await page.evaluate(() => [...document.querySelectorAll('#suggest .scard')].map(a => a.getAttribute('href')));
  ok(sugg.length > 0 && !sugg.some(h => /license|hire|interview|hotranvan/.test(h)), 'cũ: Gợi ý không chứa app đã dùng/ẩn: ' + sugg);
  const feat = await txt(page, '#featured .fc-name');
  ok(feat.indexOf('9license') >= 0 && feat.indexOf('9hire') >= 0 && feat.length === 3, 'cũ: Nổi bật cá nhân hóa ' + feat);
  ok(await page.evaluate(() => { const t = document.querySelector('#groups').textContent; return t.indexOf('Gia phả') < 0 && t.indexOf('9interview') < 0; }), 'cũ: app ẩn không hiện trong Nhóm');
  const before = await page.evaluate(() => localStorage.getItem('9app.prefs'));
  await page.reload({ waitUntil: 'networkidle0' });
  ok(before === await page.evaluate(() => localStorage.getItem('9app.prefs')), 'cũ: prefs không đổi sau tải lại');
  await page.close();
  const m = await open(390, 844, null, 0);
  const f = await txt(m.page, '#featured .fc-name');
  ok(f.join() === '9Ship,9family,9hire', 'mới: Nổi bật mặc định ' + f);
  ok(await m.page.evaluate(() => document.getElementById('bell-dot').hidden), 'chuông không chấm đỏ khi không có thông báo');
  await m.page.close();
}
{
  const { page } = await open(390, 844, null, 0);
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => !/^#|^https?:/.test(h)).map(h => h.split('#')[0]));
  const uniq = [...new Set(links)];
  const bad = [];
  for (const l of uniq) { const p = l.replace(/^\.\//, ''); if (p === '') continue; const r = await page.evaluate(async (u) => (await fetch(u)).status, base + '/' + p).catch(() => 0); if (r >= 400 || r === 0) bad.push(l + ':' + r); }
  console.log('   liên kết nội bộ tới app:', uniq.length, '| không có trong thư mục launcher (app nằm ở máy chủ):', bad.join(' '));
  const sc = await page.evaluate(() => [...document.querySelectorAll('#shortcuts .sc')].map(a => a.textContent + '=' + a.getAttribute('href')));
  ok(sc.length === 4 && sc.every(s => !/=null$/.test(s)), 'Lối tắt có đích: ' + sc.join(' | '));
  const hs = await page.evaluate(() => [...document.querySelectorAll('.hs-cta')].map(a => a.tagName + ':' + a.textContent + ':' + (a.getAttribute('href') || '')));
  ok(hs.length === 5, 'Hero 5 banner: ' + hs.join(' | '));
  ok(await page.evaluate(() => { const s = document.querySelector('.hs-cta.is-soon'); return s && s.tagName === 'SPAN' && !s.getAttribute('href'); }), 'Osin: Sắp ra mắt không dẫn đi đâu');
  for (const [id, vis] of [['tab-explore', 'explore'], ['tab-lib', 'allview'], ['tab-fav', 'fav'], ['tab-user', 'account'], ['tab-home', 'view-home']]) {
    await page.click('#' + id);
    await sleep(80);
    const st = await page.evaluate((v) => ({ h: location.hash, vis: !document.getElementById(v).hidden, on: (document.querySelector('.tab.on') || {}).id }), vis);
    ok(st.vis && st.on === id, `tab ${id} mở ${vis} (hash ${st.h})`);
  }
  await page.click('#btn-bell'); await sleep(80);
  ok(await page.evaluate(() => !document.getElementById('notify').hidden), 'chuông mở Thông báo (trống)');
  await page.click('#tab-home');
  await page.click('#shortcuts .sc:nth-child(3)'); await sleep(80);
  ok(await page.evaluate(() => !document.getElementById('fav').hidden), 'Lối tắt Lịch sử mở Yêu thích');
  await page.click('#tab-home');
  await page.click('#shortcuts .sc:nth-child(4)'); await sleep(80);
  ok(await page.evaluate(() => !document.getElementById('allview').hidden), 'Lối tắt Tất cả dịch vụ mở thư viện');
  await page.click('#tab-home');
  await page.evaluate(() => { [...document.querySelectorAll('.hs-cta')].find(b => b.textContent.indexOf('Thử tìm') >= 0).click(); });
  await page.waitForFunction(() => document.querySelectorAll('#fn-list li').length > 0, { timeout: 8000 });
  ok(true, 'Banner "Thử tìm ngay" ra kết quả chức năng');
  await page.close();
}
{
  const { page } = await open(390, 844, PREFS_OLD, 0, 'light', '#/tat-ca');
  ok(await page.evaluate(() => !!document.querySelector('#lib-soon .row')), 'Tất cả: có Sắp ra mắt');
  ok(await page.evaluate(() => !!(document.getElementById('lib-list').compareDocumentPosition(document.getElementById('lib-soon')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Sắp ra mắt nằm cuối');
  await page.click('#lib-mode [data-m="az"]');
  const az = await txt(page, '#lib-list .row-name');
  ok(az.length >= 17 && az[0] === '9english', 'A–Z: ' + az.slice(0, 4));
  await page.click('#lib-chips [data-f="hid"]');
  const hid = await txt(page, '#lib-list .row-name');
  ok(hid.length === 2, 'lọc Đã ẩn = ' + hid);
  await page.click('#lib-chips [data-f="pin"]');
  ok(await page.evaluate(() => !document.getElementById('unused-empty').hidden), 'lọc Đã ghim rỗng: trạng thái trống');
  await page.close();
  const f = await open(390, 844, null, 0, 'light', '#/yeu-thich');
  ok((await txt(f.page, '#fav .empty h3')).length === 2, 'Yêu thích mới: 2 trạng thái trống');
  await f.page.close();
  const g = await open(390, 844, PREFS_OLD, 0, 'light', '#/yeu-thich');
  const rec = await txt(g.page, '#fav-recent .row-name');
  ok(rec.join() === '9license,9hire', 'Yêu thích: Gần đây = ' + rec);
  await g.page.close();
  const e = await open(390, 844, null, 0, 'light', '#/kham-pha');
  const qs = await txt(e.page, '#explore .qchips .fn-chip');
  for (const q of qs) {
    await e.page.evaluate((v) => { document.querySelector('[data-q="' + v + '"]').click(); }, q);
    let n = 0;
    for (let t = 0; t < 40 && !n; t++) { await sleep(200); n = await e.page.evaluate(() => document.querySelectorAll('#fn-list li').length + document.querySelectorAll('#list .tile').length); }
    ok(n > 0, `Khám phá gợi ý "${q}" ra ${n} kết quả`);
    await e.page.evaluate(() => { var s = document.getElementById('search'); s.value = ''; s.dispatchEvent(new Event('input')); location.hash = '#/kham-pha'; });
    await sleep(100);
  }
  await e.page.close();
}
{
  const { page, errors } = await open(390, 844, PREFS_OLD, 0);
  await page.type('#search', 'van khan');
  await page.waitForFunction(() => document.querySelectorAll('#fn-list li').length > 0, { timeout: 8000 });
  const first = await page.evaluate(() => document.querySelector('#fn-list .fn-item').textContent);
  ok(/Vạn Niên.*Văn khấn/.test(first), 'tìm "van khan" -> ' + first.slice(0, 40));
  ok(await page.evaluate(() => document.getElementById('hero').hidden && document.getElementById('groups-wrap').hidden), 'khi tìm: ẩn hero/nhóm');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !document.getElementById('groups-wrap').hidden), 'Esc xóa tìm, về trang chủ');
  await page.type('#search', 'speed');
  ok((await txt(page, '#list .tile-name')).indexOf('9speed') >= 0, 'tìm app "speed"');
  ok(errors.length === 0, 'tìm: không lỗi console ' + errors);
  await page.close();
}
{
  const { page } = await open(390, 844, PREFS_OLD, 0);
  await page.evaluate(() => { document.querySelector('[aria-label="Mở 9speed"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  ok(await page.evaluate(() => !document.getElementById('act').hidden), 'menu giữ lâu mở');
  await page.click('#act-fav');
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('9app.prefs')).fav)).join() === 'speed', 'ghim 9speed');
  await page.click('#tab-fav'); await sleep(80);
  ok((await txt(page, '#fav-pins .tile-name')).join() === '9speed', 'Yêu thích hiện 9speed đã ghim');
  await page.click('#tab-home'); await sleep(300);
  await page.evaluate(() => { document.querySelector('#groups [aria-label^="Mở 9speed"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.click('#act-hide');
  ok((await txt(page, '#groups .mini-name')).indexOf('9speed') < 0, 'ẩn 9speed khỏi trang chủ');
  await page.close();
}
{
  const { page } = await open(390, 844, null, 0);
  const idx = () => page.evaluate(() => Math.round(document.getElementById('hero-track').scrollLeft / document.getElementById('hero-track').clientWidth));
  ok(await idx() === 0, 'hero bắt đầu ở 0');
  await sleep(6800);
  ok(await idx() === 1, 'hero tự chạy sau ~5,5 s -> ' + await idx());
  ok(await page.evaluate(() => document.querySelectorAll('.hero-dots span')[1].className === 'on'), 'chấm phân trang cập nhật');
  await page.evaluate(() => document.getElementById('hero').dispatchEvent(new Event('touchstart')));
  await sleep(6500);
  ok(await idx() === 1, 'chạm giữ: tạm dừng');
  await page.evaluate(() => { const t = document.getElementById('hero-track'); t.scrollTo({ left: t.clientWidth * 3, behavior: 'instant' }); });
  await sleep(400);
  ok(await idx() === 3, 'vuốt/cuộn ngang tới banner 3');
  await page.evaluate(() => document.getElementById('hero').dispatchEvent(new Event('touchend')));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(6500);
  ok(await idx() === 3, 'ẩn tab: tạm dừng');
  await page.evaluate(() => document.querySelectorAll('.hero-dots span')[0].click());
  await sleep(900);
  ok(await idx() === 0, 'bấm chấm về banner 0');
  await page.close();
  const r = await open(390, 844, null, 0, 'light', '', 'reduce');
  await sleep(7000);
  ok(await r.page.evaluate(() => document.getElementById('hero-track').scrollLeft) === 0, 'prefers-reduced-motion: không tự chạy');
  await r.page.close();
}
for (const [nm, prefs] of [['moi', null], ['cu', PREFS_OLD]]) {
  const { page } = await open(390, 844, prefs, 0);
  const m = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, vp: innerHeight }));
  console.log('   đo', nm, JSON.stringify(m), 'số màn =', (m.docH / m.vp).toFixed(2));
  await page.close();
}
console.log(fail ? `\n${fail} LOI` : '\nTAT CA DAT');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
