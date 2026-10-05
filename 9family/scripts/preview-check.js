// Kiểm bản xem thử tĩnh: phục vụ preview/ ở /family-preview/ trên cổng ngẫu nhiên, thao tác thử trong Chrome thật, chụp ảnh.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './ux-harness.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'preview'); const out = path.join(root, 'shots', 'ux-after');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let p = q.url.split('?')[0]; if (!p.startsWith('/family-preview/')) { r.writeHead(404); return r.end(); }
  p = p.slice('/family-preview'.length); if (p === '/') p = '/index.html';
  const f = path.join(dir, p); if (!f.startsWith(dir) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/family-preview/`;
const b = await launch(); const problems = [];
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => problems.push('pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') problems.push('console ' + m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => p.evaluate(() => document.body.innerText);
const click = async (t, scope = 'button, a') => { await p.evaluate((t, scope) => { const e = [...document.querySelectorAll(scope)].filter((x) => x.getBoundingClientRect().width > 0 && ((x.textContent || '').includes(t) || (x.getAttribute('aria-label') || '').includes(t))); const sh = [...document.querySelectorAll('.sheet')].pop(); const el = sh ? e.find((x) => sh.contains(x)) : e[0]; if (!el) throw new Error('không thấy ' + t); el.click(); }, t, scope); await sleep(500); };
await p.goto(url, { waitUntil: 'networkidle0' }); await sleep(800);
let t = await text();
if (!t.toLowerCase().includes('dòng thời gian hôm nay') || !t.includes('Bản xem thử')) throw new Error('Hôm nay chưa hiện: ' + t.slice(0, 200));
await p.screenshot({ path: path.join(out, 'preview-today.png') });
// nhận ca
const claim = await p.$('.ride .btn.primary'); if (claim) { await claim.click(); await sleep(700); }
// thêm sự kiện bằng một câu
await click('Thêm', '.fab'); await click('Sự kiện', '.sheet .pick');
await p.type('input[aria-label="Gõ một câu để điền sẵn"]', 'Piano thứ 7 9:30 Mía'); await p.keyboard.press('Enter'); await sleep(500);
await click('Lưu sự kiện', '.sheet button'); await sleep(800);
await p.evaluate(() => { location.hash = location.hash.replace('/today', '/cal'); }); await sleep(1200);
t = await text(); if (!t.includes('Piano')) throw new Error('Sự kiện vừa thêm chưa hiện ở Lịch');
await p.screenshot({ path: path.join(out, 'preview-cal.png') });
for (const r of ['rides', 'more', 'shop', 'me']) { await p.evaluate((r) => { location.hash = location.hash.replace(/\/(today|cal|rides|more|shop|me)$/, '/' + r); }, r); await sleep(1000); await p.screenshot({ path: path.join(out, 'preview-' + r + '.png') }); }
await p.reload({ waitUntil: 'networkidle0' }); await sleep(800);
console.log('preview ok', url, problems);
await b.close(); srv.close();
process.exit(problems.length ? 1 : 0);
