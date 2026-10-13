// Hàm dùng chung cho e2e.js và persona.js: mở trình duyệt thật (Chrome qua puppeteer-core), trang giả lập, các hàm thao tác.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.js';

export const GOC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHOTS = path.join(GOC, 'shots');
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const problems = [];
export const VIEWS = {
  m390: { width: 390, height: 844, mobile: true },
  m360: { width: 360, height: 740, mobile: true },
  d1280: { width: 1280, height: 800, mobile: false },
};

// "Bây giờ" cố định cho mọi lần chạy: 15/10/2026 10:00 giờ Việt Nam.
const STUB = `(() => {
  const FIXED = new Date('2026-10-15T10:00:00+07:00').getTime();
  const R = Date;
  class D extends R { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }
  window.Date = D;
  window.__blobs = [];
  const old = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__blobs.push(b); return old(b); };
  window.__sr = { mode: 'ok', texto: 'cà phê bốn mươi lăm nghìn', log: [] };
  class SR {
    constructor() { this.lang = ''; }
    start() {
      window.__sr.log.push('start');
      const m = window.__sr.mode;
      setTimeout(() => { this.onstart && this.onstart(); }, 20);
      if (m === 'ok') {
        setTimeout(() => { this.onspeechend && this.onspeechend(); }, 500);
        setTimeout(() => {
          const r = [{ transcript: window.__sr.texto }]; r.isFinal = true;
          this.onresult && this.onresult({ resultIndex: 0, results: [r] });
          this.onend && this.onend();
        }, 1300);
      } else if (m === 'silence') {
        setTimeout(() => { this.onspeechend && this.onspeechend(); }, 400);
        setTimeout(() => { this.onend && this.onend(); }, 900);
      } else if (m.startsWith('error:')) {
        setTimeout(() => { this.onerror && this.onerror({ error: m.slice(6) }); this.onend && this.onend(); }, 200);
      }
    }
    stop() { window.__sr.log.push('stop'); setTimeout(() => this.onend && this.onend(), 10); }
  }
  window.SpeechRecognition = SR; window.webkitSpeechRecognition = SR;
})();`;
const NOSR = `(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; })();`;

let browser = null; let ORIGIN = ''; let srv = null; let nOpen = 0;

export async function khoiDong() {
  const s = await start(); srv = s.srv; ORIGIN = `http://127.0.0.1:${s.port}`;
  const { default: puppeteer } = await import(PPT);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '9payday-chrome-'));
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${dir}`], defaultViewport: null });
  return { browser, origin: ORIGIN };
}
export async function ketThuc() { try { await browser.close(); } catch { /* đã đóng */ } srv && srv.close(); }
export const origin = () => ORIGIN;

export async function trangMoi(ten, { view = 'm390', dark = false, stubSR = true, ctx = null, hanChe = [] } = {}) {
  const v = VIEWS[view];
  const context = ctx || await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: v.mobile ? 2 : 1, isMobile: !!v.mobile, hasTouch: !!v.mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(STUB);
  if (!stubSR) await page.evaluateOnNewDocument(NOSR);
  page.setDefaultTimeout(7000); page.__ten = ten; page.__ctx = context;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${ten}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${ten}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const t = (r.failure() && r.failure().errorText) || ''; if (!/ERR_ABORTED/.test(t) && !hanChe.some((x) => r.url().includes(x))) problems.push(`[${ten}] requestfailed ${r.url()} ${t}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`[${ten}] HTTP ${r.status()} ${r.url()}`); });
  return page;
}

export async function mo(page, hash = '') {
  await page.goto(`${ORIGIN}/payday/?r=${++nOpen}${hash ? '' : ''}${hash}`, { waitUntil: 'load' });
  await page.waitForSelector('#view > *');
  await sleep(150);
}
export async function di(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(350); await page.waitForSelector('#view > *'); }
export async function chup(page, ten) { await sleep(200); await page.screenshot({ path: path.join(SHOTS, ten + '.png'), fullPage: false }); }
export async function chupDay(page, ten) { await sleep(200); await page.screenshot({ path: path.join(SHOTS, ten + '.png'), fullPage: true }); }
export async function bam(page, sel) { await page.waitForSelector(sel, { visible: true, timeout: 4000 }); await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await page.click(sel); await sleep(150); }
export async function bamChu(page, text, scope = 'button, a, label, summary') {
  const ok = await page.evaluate((text, scope) => {
    const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.textContent.replace(/\s+/g, ' ').trim().includes(text); });
    if (!els.length) return false; els[0].scrollIntoView({ block: 'center' }); els[0].click(); return true;
  }, text, scope);
  if (!ok) throw new Error('Không thấy nút: ' + text);
  await sleep(200);
}
export async function go(page, sel, text, { xoaTruoc = true } = {}) {
  await page.waitForSelector(sel, { visible: true });
  await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await page.click(sel);
  if (xoaTruoc) { await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); }
  await page.type(sel, text);
  await sleep(120);
}
export const chu = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
export const chuTatCa = (page, sel) => page.$$eval(sel, (es) => es.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
export const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.P9.layState())));
export const flush = async (page) => { await sleep(450); };
export function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
export async function khongCuonNgang(page, nhan) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert(o.sw <= o.cw + 1, `${nhan}: cuộn ngang ${o.sw} > ${o.cw}`);
}

/** Kiểm vùng chạm >= 44px và chữ >= 14px cho phần tử nhìn thấy. Trả danh sách vi phạm. */
export async function kiemTraKichThuoc(page) {
  return page.evaluate(() => {
    const loi = [];
    const nhin = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    document.querySelectorAll('button, a.btn, .nav a, input:not([type=checkbox]):not([type=file]), select, summary, .seg > *, a.pill9, a.chip, .ico-btn, label.btn').forEach((e) => {
      if (!nhin(e)) return;
      const r = e.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) loi.push(`chạm nhỏ ${Math.round(r.width)}x${Math.round(r.height)}: ${e.tagName}.${e.className} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30)}"`);
    });
    document.querySelectorAll('input[type=checkbox]').forEach((e) => { if (nhin(e)) { const lb = e.closest('label'); const r = (lb || e).getBoundingClientRect(); if (r.height < 43.5) loi.push('checkbox thấp ' + Math.round(r.height)); } });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const da = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.trim(); if (!t) continue;
      const e = n.parentElement; if (!e || da.has(e) || !nhin(e) || e.closest('script,style,noscript,option')) continue;
      da.add(e);
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 13.99) loi.push(`chữ ${fs}px: "${t.slice(0, 40)}"`);
    }
    return loi;
  });
}

/** Tương phản chữ so với nền gần nhất (bỏ qua phần tử có nền gradient). Trả danh sách < 4.5 (hoặc < 3 cho chữ lớn). */
export async function kiemTraTuongPhan(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const tron = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const nen = (e) => {
      let x = e; const lop = [];
      while (x) {
        const cs = getComputedStyle(x);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return { grad: true, cs };
        const bg = parse(cs.backgroundColor);
        if (bg && bg.a > 0) { lop.push(bg); if (bg.a >= 1) break; }
        x = x.parentElement;
      }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      for (const b of lop.reverse()) base = tron(b, base);
      return base;
    };
    const loi = [];
    const da = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim(); const e = n.parentElement;
      if (!t || !e || da.has(e)) continue; da.add(e);
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || e.closest('option,script,style')) continue;
      const bg = nen(e); if (bg.grad) continue;
      let fg = parse(cs.color); if (!fg) continue;
      const op = parseFloat(cs.opacity); fg = { ...fg, a: fg.a * (Number.isFinite(op) ? op : 1) };
      const c = tron(fg, bg);
      const l1 = lum(c), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const fs = parseFloat(cs.fontSize); const dam = parseInt(cs.fontWeight, 10) >= 700;
      const can = (fs >= 24 || (fs >= 18.66 && dam)) ? 3 : 4.5;
      if (ratio < can) loi.push(`tương phản ${ratio.toFixed(2)} < ${can}: "${t.slice(0, 40)}" (${cs.color})`);
    }
    return loi;
  });
}

export function xoaAnh() { fs.mkdirSync(SHOTS, { recursive: true }); for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png') && !f.startsWith('persona')) fs.rmSync(path.join(SHOTS, f)); }
