// Phòng thí nghiệm trang cong và ngón tay: dựng ảnh chụp giả lập (trang cuộn/sách mở/uốn mép, ngón tay nhiều tông da đè mép và đè vào chữ),
// chạy đúng pipeline của app (dò khung -> nắn phẳng -> làm sạch -> lọc) ở ba chế độ: tắt / tự động / ép bật, rồi đo:
//   - độ lệch dòng chữ (độ lệch chuẩn của tâm từ so với đường thẳng của dòng OCR, tính theo % chiều cao chữ; càng thấp càng thẳng),
//   - OCR: tỉ lệ lỗi ký tự (CER) và số ký tự đọc được,
//   - tỉ lệ điểm da còn lại trên trang.
// Dùng: node scripts/lab2.js [--scene=ten] [--noocr]   Kết quả: shots/lab3/*.png + lab3-report.json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.js';
import { sceneInPage } from './scene.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const withOcr = !argv.includes('--noocr');
const OUT = path.join(ROOT, 'shots/lab3');
fs.mkdirSync(OUT, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const base = { rot: 3, persp: 0.07, shadow: 'grad', scale: 0.86, blur: 0.8, light: 1, bg: 'wood' };
export const SCENES = {
  'binh-thuong': { ...base },
  'mo-nhe': { ...base, blur: 3.2 },
  'mo-nang-rung': { ...base, blur: 9 },
  'choi-den': { ...base, bg: 'gray', light: 0.72, glare: { x: 0.5, y: 0.38, rx: 0.2, ry: 0.1, strength: 1.2 } },
  'choi-nhe': { ...base, bg: 'white', light: 0.8, glare: { x: 0.45, y: 0.55, rx: 0.3, ry: 0.2, strength: 0.5 } },
  'thieu-sang': { ...base, light: 0.3, noiseAmp: 46 },
  'thieu-sang-nhieu': { ...base, light: 0.2, noiseAmp: 80, bg: 'dark' },
  'chu-nhat': { ...base, faint: { pencil: [150, 150, 158], blue: [120, 150, 225] }, inkLight: 0.45 },
  'but-chi-rat-nhat': { ...base, faint: { pencil: [185, 185, 190], blue: [165, 185, 235] }, inkLight: 0.6, light: 0.8 },
  'giay-o-vang': { ...base, paper: [236, 220, 170] },
  'giay-mau-xanh': { ...base, paper: [196, 224, 208], bg: 'dark' },
  'photo-xam': { ...base, paper: [214, 214, 212], inkLight: 0.4, bg: 'white' },
  'tham-mat-sau': { ...base, bleed: 0.2 },
  'tham-mat-sau-nang': { ...base, bleed: 0.34, paper: [240, 236, 226] },
  'cat-mep': { ...base, scale: 1.2, rot: 2 },
  'chup-xa': { ...base, scale: 0.34, rot: -3 },
};
const only = opt('scene', null);

const server = await startServer(9400 + Math.floor(Math.random() * 400));
const udd = fs.mkdtempSync(path.join(os.tmpdir(), '9scanner-lab2-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 3600000, defaultViewport: { width: 1000, height: 800 }, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${udd}`] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/scanner/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__scanner);

const names = Object.keys(SCENES).filter((n) => !only || n === only);
const data = {};
for (const n of names) data[n] = await page.evaluate(sceneInPage, SCENES[n]);

const result = await page.evaluate(async (names, data, withOcr) => {
  const R = await import('/scanner/js/render.js');
  const G = await import('/scanner/js/geom.js');
  const O = await import('/scanner/js/ocr.js');
  const P = await import('/scanner/js/ocrprep.js');
  const I = await import('/scanner/js/inpaint.js');
  const lev = (a, b) => { const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] || 0; };
  // độ lệch dòng: mỗi dòng OCR >= 5 từ và rộng >= 30% trang; độ lệch chuẩn của tâm từ so với đường thẳng khớp nhất, chia cho chiều cao từ trung vị
  function straightness(lines, width) {
    const vals = [];
    for (const l of lines) {
      if (l.words.length < 5) continue;
      const xs = l.words.map((w) => (w.x0 + w.x1) / 2), ys = l.words.map((w) => w.y1);
      if (Math.max(...xs) - Math.min(...xs) < width * 0.3) continue;
      const n = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
      const r = Math.sqrt(ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0) / n);
      vals.push(r / med(l.words.map((w) => w.y1 - w.y0)));
    }
    return vals.length ? { pct: +(100 * vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1), lines: vals.length } : { pct: null, lines: 0 };
  }
  function skinRatio(canvas) {
    const id = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const f = Math.max(1, Math.round(Math.max(canvas.width, canvas.height) / 420));
    let n = 0, s = 0;
    const lums = [];
    for (let y = 0; y < id.height; y += f) for (let x = 0; x < id.width; x += f) { const i = (y * id.width + x) * 4; lums.push(0.299 * id.data[i] + 0.587 * id.data[i + 1] + 0.114 * id.data[i + 2]); }
    lums.sort((a, b) => a - b);
    const thr = lums[Math.floor(lums.length * 0.7)];
    let cb = 0, cr = 0, c = 0;
    for (let y = 0; y < id.height; y += f) for (let x = 0; x < id.width; x += f) { const i = (y * id.width + x) * 4, r = id.data[i], g = id.data[i + 1], b = id.data[i + 2]; if (0.299 * r + 0.587 * g + 0.114 * b >= thr) { cb += 128 - 0.168736 * r - 0.331264 * g + 0.5 * b; cr += 128 + 0.5 * r - 0.418688 * g - 0.081312 * b; c++; } }
    const ref = { cb: cb / c, cr: cr / c };
    for (let y = 0; y < id.height; y += f) for (let x = 0; x < id.width; x += f) { const i = (y * id.width + x) * 4; n++; if (I.isSkin(id.data[i], id.data[i + 1], id.data[i + 2], ref)) s++; }
    return +(100 * s / n).toFixed(2);
  }
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
  const out = [], sheets = {};
  for (const name of names) {
    const s0 = data[name];
    const bin = atob(s0.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const imp = await R.importImage(new Blob([u8], { type: 'image/jpeg' }));
    const pg = { id: 'l2-' + name, src: imp.blob, srcW: imp.w, srcH: imp.h, corners: G.defaultCorners(), filter: 'auto', rot: 0, signs: [] };
    const det = await R.autoDetect(pg); pg.corners = det.corners;
    const orderT = (q) => { const c = q.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 }); const so = q.slice().sort((p, r) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(r.y - c.y, r.x - c.x)); let st = 0, best = 9; so.forEach((p, i) => { if (p.x + p.y < best) { best = p.x + p.y; st = i; } }); return [0, 1, 2, 3].map((i) => so[(st + i) % 4]); };
    const tq = s0.corners && s0.corners.length ? orderT(s0.corners) : null;
    const diag = Math.hypot(s0.W, s0.H);
    const errs = tq ? det.corners.map((p, i) => Math.hypot((p.x - tq[i].x) * s0.W, (p.y - tq[i].y) * s0.H) / diag * 100) : [];
    const row = { scene: name, found: det.found, cornerMax: errs.length ? +Math.max(...errs).toFixed(2) : null, errs: errs.map((e) => +e.toFixed(2)), modes: {} };
    const tiles = [];
    { const c = document.createElement('canvas'); c.width = 460; c.height = Math.round(460 * s0.H / s0.W); const x = c.getContext('2d'); x.drawImage(await createImageBitmap(new Blob([u8], { type: 'image/jpeg' })), 0, 0, c.width, c.height);
      x.strokeStyle = '#22c55e'; x.lineWidth = 3; x.beginPath(); det.corners.forEach((p, i) => { const px = p.x * c.width, py = p.y * c.height; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.stroke(); tiles.push({ c, label: name }); }
    const Q = await import('/scanner/js/quality.js');
    { // chẩn đoán trên ảnh gốc đã nắn phẳng
      const cv = await R.renderPage({ ...pg, clean: 'off', dewarp: 'off' }, { srcEdge: 2600, maxEdge: 1400, filter: 'original', noSigns: true });
      const idq = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      const q = Q.analyzeQuality(idq);
      row.issues = q.issues.map((i) => i.id).concat(Q.frameWarnings(det.corners, imp.w, imp.h, det.found).map((i) => i.id)); row.qmetrics = q.metrics;
    }
    for (const fid of ['original', 'auto', 'sharp', 'docbw']) {
      const p2 = { ...pg, clean: 'auto', dewarp: 'auto', _fix: null };
      const canvas = await R.renderPage(p2, { srcEdge: 2600, maxEdge: 2000, filter: fid, noSigns: true });
      const m = { bg: bgStats(canvas) };
      if (withOcr) {
        const oc = document.createElement('canvas'); oc.width = canvas.width; oc.height = canvas.height; oc.getContext('2d').drawImage(canvas, 0, 0);
        const id = oc.getContext('2d').getImageData(0, 0, oc.width, oc.height); P.removeRuling(id); oc.getContext('2d').putImageData(id, 0, 0);
        const r = await O.recognizeCanvas(oc);
        m.cerPct = +(lev(norm(r.text), norm(s0.text)) / norm(s0.text).length * 100).toFixed(1);
        m.chars = r.text.replace(/\s/g, '').length; m.conf = Math.round(r.confidence);
        const low = r.text.toLowerCase();
        m.faint = (/chì/.test(low) ? 1 : 0) + (/nhạt|xanh/.test(low) ? 1 : 0);
      }
      row.modes[fid] = m;
      const c = document.createElement('canvas'); const k = 460 / Math.max(canvas.width, canvas.height) * 1.2; c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(canvas, 0, 0, c.width, c.height);
      tiles.push({ c, label: fid + (m.cerPct != null ? ` CER ${m.cerPct}%` : '') });
    }
    row.truthChars = norm(s0.text).replace(/\s/g, '').length;
    const th = Math.max(...tiles.map((t) => t.c.height)) + 24;
    const sheet = document.createElement('canvas'); sheet.width = tiles.length * 470; sheet.height = th;
    const sx = sheet.getContext('2d'); sx.fillStyle = '#333'; sx.fillRect(0, 0, sheet.width, sheet.height);
    tiles.forEach((t, i) => { sx.drawImage(t.c, i * 470 + 5, 24); sx.fillStyle = '#fff'; sx.font = '14px sans-serif'; sx.fillText(t.label, i * 470 + 8, 16); });
    sheets[name] = sheet.toDataURL('image/png').split(',')[1];
    out.push(row);
  }
  return { rows: out, sheets };
}, names, data, withOcr);

for (const [n, b64] of Object.entries(result.sheets)) fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(b64, 'base64'));
fs.writeFileSync(path.join(OUT, 'lab3-report.json'), JSON.stringify(result.rows, null, 1));
for (const r of result.rows) {
  console.log(`${r.scene.padEnd(18)} found=${r.found} lệchGóc=${r.cornerMax} ${JSON.stringify(r.errs)} cảnh báo=[${(r.issues || []).join(',')}] ${JSON.stringify(r.qmetrics)}`);
  for (const [k, v] of Object.entries(r.modes)) console.log(`   ${k.padEnd(8)} trắng=${v.bg.white} CV=${v.bg.cv}% ${v.cerPct != null ? `CER=${v.cerPct}% ký tự=${v.chars}/${r.truthChars} chữ nhạt=${v.faint}/2` : ''}`);
}
await browser.close();
server.close();
process.exit(0);
