// Phòng thí nghiệm chất lượng ảnh: dựng ảnh "chụp tài liệu" giả lập sát thực tế (bàn gỗ/trắng/tối, nghiêng, phối cảnh, bóng đổ, mờ nhẹ, nhiễu, nén JPEG),
// chạy đúng các hàm của app (dò cạnh, nắn phẳng, các bộ lọc, hướng chữ, OCR) rồi đo: sai số góc, độ đều nền, và tỉ lệ lỗi ký tự OCR (CER).
// Dùng: node scripts/lab.js [--ocr] [--scene=ten] [--out=thu-muc]    Kết quả: shots/lab/*.png + lab-report.json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.js';
import { sceneInPage } from './scene.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.some((a) => a === '--' + n);
const opt = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const OUT = path.join(ROOT, opt('out', 'shots/lab'));
fs.mkdirSync(OUT, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const server = await startServer(9400 + Math.floor(Math.random() * 400));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const udd = fs.mkdtempSync(path.join(os.tmpdir(), '9scanner-lab-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1000, height: 800 }, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}`] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
await page.goto(`${ORIGIN}/scanner/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__scanner);

const SCENES = {
  'go-nghieng': { bg: 'wood', rot: -11, persp: 0.18, shadow: 'grad', scale: 0.8, blur: 0.9, light: 1 },
  'ban-trang': { bg: 'white', rot: 4, persp: 0.08, shadow: 'grad', scale: 0.84, blur: 0.8, light: 1 },
  'nen-toi-phoi-canh': { bg: 'dark', rot: 7, persp: 0.4, shadow: 'none', scale: 0.78, blur: 1.1, light: 1 },
  'bong-tay': { bg: 'gray', rot: -4, persp: 0.12, shadow: 'hand', scale: 0.82, blur: 1.0, light: 1 },
  'chup-ngang': { bg: 'wood', rot: 90 - 8, persp: 0.15, shadow: 'grad', scale: 0.8, blur: 0.9, light: 1 },
  'nguoc-180': { bg: 'green', rot: 180 + 6, persp: 0.1, shadow: 'grad', scale: 0.8, blur: 0.9, light: 1 },
  'bien-ban': { bg: 'wood', rot: -5, persp: 0.1, shadow: 'grad', scale: 0.86, blur: 0.8, light: 1 },
  'thieu-sang-vang': { bg: 'wood', rot: 3, persp: 0.1, shadow: 'grad', scale: 0.84, blur: 1.4, light: 0.55, warm: true },
};
const only = opt('scene', null);

const scenesData = {};
for (const n of Object.keys(SCENES).filter((x) => !only || x === only)) scenesData[n] = await page.evaluate(sceneInPage, SCENES[n]);
const result = await page.evaluate(async (SCENES, only, withOcr, scenesData) => {
  const g = await import('/scanner/js/geom.js');
  const R = await import('/scanner/js/render.js');
  const F = await import('/scanner/js/filters.js');
  const O = await import('/scanner/js/ocr.js');
  const P = await import('/scanner/js/ocrprep.js');
  let orient = null;
  try { orient = await import('/scanner/js/orient.js'); } catch (e) { /* chưa có */ }
  const { homography, applyH } = g;

  const lev = (a, b) => { const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const orderTruth = (q) => { const c = q.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 }); const s = q.slice().sort((p, r) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(r.y - c.y, r.x - c.x)); let st = 0, best = 9; s.forEach((p, i) => { if (p.x + p.y < best) { best = p.x + p.y; st = i; } }); return [0, 1, 2, 3].map((i) => s[(st + i) % 4]); };

  // độ đều nền: P90 từng ô 16x16 (chỉ ô nằm trong vùng giấy sáng), trả về hệ số biến thiên và độ trắng trung vị
  function bgStats(canvas) {
    const ctx = canvas.getContext('2d'); const { width: w, height: h } = canvas; const d = ctx.getImageData(0, 0, w, h).data;
    const cell = Math.max(16, Math.round(Math.min(w, h) / 40)); const vals = [];
    for (let by = 0; by + cell <= h; by += cell) for (let bx = 0; bx + cell <= w; bx += cell) {
      const hist = new Uint32Array(256); let n = 0;
      for (let y = by; y < by + cell; y += 2) for (let x = bx; x < bx + cell; x += 2) { const i = (y * w + x) * 4; hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++; n++; }
      let acc = 0, p = 0; for (; p < 256; p++) { acc += hist[p]; if (acc >= n * 0.9) break; }
      vals.push(p);
    }
    vals.sort((a, b) => a - b); const med = vals[vals.length >> 1];
    const paper = vals.filter((v) => v > 0.6 * med); const mean = paper.reduce((s, v) => s + v, 0) / paper.length;
    const sd = Math.sqrt(paper.reduce((s, v) => s + (v - mean) ** 2, 0) / paper.length);
    return { white: med, cv: +(sd / mean * 100).toFixed(2) };
  }

  const names = Object.keys(SCENES).filter((n) => !only || n === only);
  const filters = ['original', 'deshadow', 'magic', 'bw', ...(F.FILTERS.map((f) => f.id).filter((id) => ['sharp', 'docbw', 'auto'].includes(id)))];
  const out = [];
  const sheets = {};
  for (const name of names) {
    const s0 = scenesData[name];
    const bin = atob(s0.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const sc = { blob: new Blob([u8], { type: 'image/jpeg' }), truth: s0.corners, W: s0.W, H: s0.H };
    const doc = { truth: s0.text };
    const imp = await R.importImage(sc.blob);
    const pg = { id: 'lab-' + name, src: imp.blob, srcW: imp.w, srcH: imp.h, corners: g.defaultCorners(), filter: 'original', rot: 0, signs: [] };
    const t0 = performance.now();
    const det = await R.autoDetect(pg);
    const tDet = performance.now() - t0;
    pg.corners = det.corners;
    const t = orderTruth(sc.truth);
    const f = det.corners;
    const diag = Math.hypot(sc.W, sc.H);
    const errs = f.map((p, i) => Math.hypot((p.x - t[i].x) * sc.W, (p.y - t[i].y) * sc.H) / diag * 100);
    const row = { scene: name, found: det.found, score: +det.score.toFixed(2), cornerMeanPct: +(errs.reduce((a, b) => a + b, 0) / 4).toFixed(2), cornerMaxPct: +Math.max(...errs).toFixed(2), detectMs: Math.round(tDet), filters: {} };
    // hướng chữ
    if (orient) {
      const tmp = await R.renderPage(pg, { srcEdge: 1400, maxEdge: 1000, filter: 'auto' });
      const o = orient.detectOrientation(tmp.getContext('2d').getImageData(0, 0, tmp.width, tmp.height));
      row.orientation = o;
    }
    const tiles = [];
    // ảnh gốc + khung dò
    { const c = document.createElement('canvas'); c.width = 520; c.height = Math.round(520 * sc.H / sc.W); const x = c.getContext('2d'); const bm = await createImageBitmap(sc.blob); x.drawImage(bm, 0, 0, c.width, c.height);
      x.strokeStyle = det.found ? '#22c55e' : '#ef4444'; x.lineWidth = 3; x.beginPath(); f.forEach((p, i) => { const px = p.x * c.width, py = p.y * c.height; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke();
      x.strokeStyle = '#38bdf8'; x.lineWidth = 1; x.beginPath(); t.forEach((p, i) => { const px = p.x * c.width, py = p.y * c.height; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke();
      tiles.push({ c, label: name }); }
    for (const fid of filters) {
      const pr = { ...pg, rot: row.orientation ? row.orientation.rot : 0 };
      const canvas = await R.renderPage(pr, { srcEdge: 2600, maxEdge: 2000, filter: fid, noSigns: true });
      const bs = bgStats(canvas);
      row.filters[fid] = { white: bs.white, bgCv: bs.cv };
      if (withOcr) {
        const t1 = performance.now();
        const oc = document.createElement('canvas'); oc.width = canvas.width; oc.height = canvas.height;
        const octx = oc.getContext('2d'); octx.drawImage(canvas, 0, 0);
        const idt = octx.getImageData(0, 0, oc.width, oc.height); const ruling = P.removeRuling(idt); octx.putImageData(idt, 0, 0);
        row.filters[fid].rules = ruling.hLines.length + '/' + ruling.vLines.length;
        const r = await O.recognizeCanvas(oc);
        const a = norm(r.text), b = norm(doc.truth);
        row.filters[fid].cerPct = +(lev(a, b) / b.length * 100).toFixed(1);
        row.filters[fid].ocrMs = Math.round(performance.now() - t1);
        row.filters[fid].conf = Math.round(r.confidence); if (fid === 'auto') row.text = r.text;
      }
      const c = document.createElement('canvas'); const s = 520 / Math.max(canvas.width, canvas.height) * 1.0; c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(canvas, 0, 0, c.width, c.height);
      tiles.push({ c, label: fid });
    }
    // dán thành contact sheet một hàng
    const th = Math.max(...tiles.map((t) => t.c.height)) + 22;
    const sheet = document.createElement('canvas'); sheet.width = tiles.length * 530; sheet.height = th;
    const sx = sheet.getContext('2d'); sx.fillStyle = '#333'; sx.fillRect(0, 0, sheet.width, sheet.height);
    tiles.forEach((t, i) => { sx.drawImage(t.c, i * 530 + 5, 22); sx.fillStyle = '#fff'; sx.font = '16px sans-serif'; sx.fillText(t.label, i * 530 + 8, 16); });
    sheets[name] = sheet.toDataURL('image/png').split(',')[1];
    out.push(row);
  }
  return { rows: out, sheets };
}, SCENES, only, flag('ocr'), scenesData);

for (const [n, b64] of Object.entries(result.sheets)) fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(b64, 'base64'));
fs.writeFileSync(path.join(OUT, 'lab-report.json'), JSON.stringify(result.rows, null, 1));
for (const r of result.rows) {
  console.log(`${r.scene.padEnd(20)} found=${r.found} score=${r.score} góc: tb ${r.cornerMeanPct}% max ${r.cornerMaxPct}%  ${r.orientation ? 'hướng=' + JSON.stringify(r.orientation) : ''}`);
  for (const [k, v] of Object.entries(r.filters)) console.log(`   ${k.padEnd(9)} trắng=${v.white} nềnCV=${v.bgCv}% ${v.cerPct != null ? `CER=${v.cerPct}% rules=${v.rules} conf=${v.conf} (${v.ocrMs}ms)` : ''}`);
}
await browser.close();
server.close();
process.exit(0);
