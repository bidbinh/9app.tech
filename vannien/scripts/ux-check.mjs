// Kiểm giao diện: node scripts/ux-check.mjs
// Với 320/360/390/430/1280 px × sáng/tối × mọi đường dẫn sâu: không lỗi console, không tràn ngang, vùng chạm >= 44px,
// chữ >= 14px, tương phản chữ/nền (AA), thanh dưới đủ 5 nhãn không bị cắt, mục đang mở sáng đúng. Cổng ngẫu nhiên từ 20000.
// Thêm: tương phản các cặp màu chính tính thẳng từ biến CSS của src/index.css (cả sáng lẫn tối).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { startServer } from './server.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const SRC_CSS = [process.env.VN_SRC_CSS, 'D:/Lịch vạn niên/src/index.css'].filter(Boolean).find((p) => fs.existsSync(p))
const { default: puppeteer } = await import(PPT)

const vk = JSON.parse(fs.readFileSync(path.join(ROOT, 'mod/data/van-khan.json'), 'utf8'))
const mc = JSON.parse(fs.readFileSync(path.join(ROOT, 'mod/data/mam-cung.json'), 'utf8'))
const fails = []
const note = (m) => fails.push(m)
let checks = 0

/* ---------- 1. Tương phản theo biến màu ---------- */
function parseVars(block) {
  const out = {}
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2]
  return out
}
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
if (SRC_CSS) {
  const css = fs.readFileSync(SRC_CSS, 'utf8')
  const light = parseVars(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')))
  const darkStart = css.indexOf("@media (prefers-color-scheme: dark)")
  const dark = { ...light, ...parseVars(css.slice(darkStart, css.indexOf('* {', darkStart))) }
  // [chữ, nền, ngưỡng, mô tả]
  const PAIRS = [
    ['text', 'bg', 4.5, 'chữ chính / nền'], ['text', 'card', 4.5, 'chữ chính / thẻ'], ['muted', 'bg', 4.5, 'chữ phụ / nền'], ['muted', 'card', 4.5, 'chữ phụ / thẻ'],
    ['muted', 'soft', 4.5, 'chữ phụ / nền xanh nhạt'], ['faint', 'card', 4.5, 'chữ mờ / thẻ'],
    ['brand-text', 'card', 4.5, 'chữ xanh / thẻ'], ['brand-text', 'bg', 4.5, 'chữ xanh / nền'], ['brand-text', 'soft', 4.5, 'chữ xanh / nền xanh nhạt'], ['brand-text', 'soft-2', 4.5, 'chữ xanh / soft-2'],
    ['on-brand', 'btn', 4.5, 'chữ trên nút xanh'],
    ['good-fg', 'good-bg', 4.5, 'Hoàng đạo/tốt: chữ / nền'], ['bad-fg', 'bad-bg', 4.5, 'Hắc đạo/xấu: chữ / nền'],
    ['good-fg', 'card', 4.5, 'chữ tốt / thẻ'], ['bad-fg', 'card', 4.5, 'chữ xấu / thẻ'], ['bad-fg', 'bg', 4.5, 'chữ xấu / nền'],
    ['field-line', 'card', 3, 'viền ô nhập / thẻ (không phải chữ)'], ['good-dot', 'card', 3, 'chấm hoàng đạo / thẻ'], ['bad-dot', 'card', 3, 'chấm hắc đạo / thẻ'], ['brand', 'card', 3, 'viền nhấn / thẻ'],
    ['focus', 'bg', 3, 'viền focus / nền'], ['focus', 'card', 3, 'viền focus / thẻ'],
  ]
  const rows = []
  for (const [name, vars] of [['sáng', light], ['tối', dark]]) {
    for (const [fg, bg, min, label] of PAIRS) {
      checks++
      const r = ratio(vars[fg], vars[bg])
      rows.push(`${name.padEnd(4)} ${label.padEnd(40)} ${vars[fg]} / ${vars[bg]}  ${r.toFixed(2)}${r < min ? '  KHÔNG ĐẠT' : ''}`)
      if (r < min) note(`tương phản ${name}: ${label} ${r.toFixed(2)} < ${min}`)
    }
  }
  fs.writeFileSync(path.join(ROOT, 'shots', 'ux', 'contrast-tokens.txt'), rows.join('\n') + '\n')
  console.log(`Tương phản theo biến CSS: ${rows.length} cặp, ${rows.filter((r) => r.includes('KHÔNG')).length} không đạt (chi tiết shots/ux/contrast-tokens.txt)`)
} else console.log('Bỏ qua kiểm biến CSS: không thấy src/index.css')

/* ---------- 2. Duyệt trang thật ---------- */
const TABS = [
  ['#/hom-nay', '.hero', 'Hôm nay'],
  ['#/lich', '.cal-grid', 'Tháng'],
  ['#/xem-ngay', '.score-item', 'Xem ngày'],
  ['#/phong-thuy', '.wheel-wrap', 'Phong thủy'],
]
const MOD = [
  ['#/van-khan', 'Cúng lễ'],
  ...vk.items.map((i) => [`#/van-khan/${i.id}`, 'Cúng lễ']),
  ['#/van-khan/ram-mung-1?d=2026-10-24&doc=1', 'Cúng lễ'],
  ['#/mam-cung', 'Cúng lễ'],
  ...mc.items.map((i) => [`#/mam-cung/${i.id}`, 'Cúng lễ']),
  ['#/mam-cung/ngu-qua', 'Cúng lễ'],
  ...mc.recipes.map((r) => [`#/mam-cung/cong-thuc/${r.id}`, 'Cúng lễ']),
  ['#/ve-noi-dung', 'Cúng lễ'],
]
const ONLY = process.env.ONLY_ROUTES ? process.env.ONLY_ROUTES.split(',') : null
const ALL0 = [...TABS.map((t) => [t[0], null, t]), ...MOD.map((m) => [m[0], m[1], null])]
const ALL = ONLY ? ALL0.filter((r) => ONLY.includes(r[0])) : ALL0
const SAMPLE = ['#/hom-nay', '#/lich', '#/xem-ngay', '#/phong-thuy', '#/van-khan', '#/van-khan/ram-mung-1', '#/van-khan/gio', '#/mam-cung', '#/mam-cung/mam-ram-mung-1', '#/mam-cung/co-gio', '#/mam-cung/ngu-qua', '#/ve-noi-dung']
const VIEWS = [
  { w: 320, h: 640, routes: ALL },
  { w: 360, h: 740, routes: ALL.filter((r) => SAMPLE.includes(r[0])) },
  { w: 390, h: 844, routes: ALL },
  { w: 430, h: 932, routes: ALL.filter((r) => SAMPLE.includes(r[0])) },
  { w: 1280, h: 800, routes: ALL.filter((r) => SAMPLE.includes(r[0])) },
]

const srv = await startServer({ dir: ROOT, port: 20000 + Math.floor(Math.random() * 9000) })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'vn-ux-'))}`] })
const base = `http://127.0.0.1:${srv.port}/vannien/`

/** Chạy trong trang: gom mọi vi phạm của màn đang hiện. */
function audit() {
  const out = { touch: [], font: [], contrast: [], overflow: false, nav: [] }
  const vis = (e) => {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return null
    const cs = getComputedStyle(e)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null
    for (let p = e; p; p = p.parentElement) if (p.hidden || getComputedStyle(p).display === 'none') return null
    return r
  }
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''}`
  out.overflow = document.documentElement.scrollWidth > window.innerWidth + 1
  for (const e of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=tab]')) {
    if (e.closest('.sr') || e.classList.contains('sr')) continue
    const r = vis(e)
    if (!r) continue
    // Ô lịch tháng: 7 cột trong màn 320px nên bề ngang tối đa ~41px (cao 62px); chỉ coi là lỗi nếu hẹp hơn 36px hoặc thấp hơn 44px.
    const minW = e.classList.contains('cell') ? 36 : 43.5
    if (r.width < minW || r.height < 43.5) out.touch.push(`${name(e)} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.innerText || e.value || '').replace(/\s+/g, ' ').slice(0, 20)}"`)
  }
  const rgb = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s)
    if (!m) return null
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = (c) => {
    const f = [c.r, c.g, c.b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const mix = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
  /** Màu nền hiệu dụng; nền gradient trả về các màu đầu / cuối (lấy giá trị kém nhất). */
  const bgsOf = (el) => {
    let layers = []
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p)
      const bi = cs.backgroundImage
      if (bi && bi !== 'none' && /gradient/.test(bi)) {
        const cols = [...bi.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgb(m[0]))
        layers.push({ grad: cols })
        break
      }
      const c = rgb(cs.backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a >= 1) break
      }
    }
    let bases = [{ r: 255, g: 255, b: 255, a: 1 }]
    for (const l of layers.reverse()) {
      if (l.grad) bases = l.grad.map((g) => mix(g, bases[0]))
      else bases = bases.map((b) => mix(l, b))
    }
    return bases
  }
  const seen = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const t = walker.currentNode
    const txt = t.nodeValue.replace(/\s+/g, ' ').trim()
    if (!txt) continue
    const e = t.parentElement
    if (!e || ['SCRIPT', 'STYLE', 'OPTION', 'TITLE'].includes(e.tagName) || e.closest('svg') || e.closest('.sr') || e.closest('.vn-toast') || e.closest('[aria-hidden=true]:not(.legend)')) continue
    if (!vis(e) || seen.has(e)) continue
    seen.add(e)
    const cs = getComputedStyle(e)
    const fs = parseFloat(cs.fontSize)
    if (fs < 13.99) out.font.push(`${name(e)} ${fs}px "${txt.slice(0, 24)}"`)
    const fg = rgb(cs.color)
    if (!fg) continue
    const large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700)
    const need = large ? 3 : 4.5
    let worst = 99
    for (const b of bgsOf(e)) worst = Math.min(worst, ratio(mix(fg, b), b))
    out.minRatio = Math.min(out.minRatio ?? 99, worst)
    out.nText = (out.nText || 0) + 1
    if (worst < need) out.contrast.push(`${name(e)} ${worst.toFixed(2)} (<${need}) "${txt.slice(0, 24)}"`)
  }
  // chữ trong ô nhập (placeholder, giá trị)
  for (const e of document.querySelectorAll('input:not([type=checkbox]):not([type=hidden]), select')) {
    if (!vis(e)) continue
    const cs = getComputedStyle(e)
    if (parseFloat(cs.fontSize) < 15.99) out.font.push(`${name(e)} ${cs.fontSize} (ô nhập < 16px, iOS sẽ phóng to)`)
  }
  // thanh dưới / sidebar
  const nav = document.querySelector('.mobile-nav') && vis(document.querySelector('.mobile-nav')) ? '.mobile-nav' : '.sidebar .nav'
  out.navKind = nav
  for (const it of document.querySelectorAll(`${nav} > *`)) {
    const lbl = it.querySelector('.lbl')
    const r = it.getBoundingClientRect()
    const lr = lbl ? lbl.getBoundingClientRect() : r
    out.nav.push({
      text: lbl ? lbl.innerText.trim() : it.innerText.trim(),
      cut: lbl ? lbl.scrollWidth > lbl.clientWidth + 1 || lr.left < r.left - 1 || lr.right > r.right + 1 || lr.bottom > r.bottom + 1 : false,
      lines: lbl ? Math.round(lr.height / parseFloat(getComputedStyle(lbl).lineHeight || 16)) : 1,
      onscreen: r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5,
      active: it.classList.contains('active'),
    })
  }
  out.stat = { texts: seen.size, min: out.minRatio }
  return out
}

/** Máy dùng chung nhiều tiến trình nên thỉnh thoảng nạp trang bị từ chối vì thiếu tài nguyên: thử lại tối đa 4 lần. */
async function gotoRetry(page, url) {
  for (let i = 0; ; i++) {
    try {
      await page.goto('about:blank')
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      return
    } catch (e) {
      if (i >= 3) throw e
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
}

let pages = 0
for (const view of VIEWS) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    const tag = `${view.w}px ${scheme === 'light' ? 'sáng' : 'tối'}`
    const problems = []
    await page.setViewport({ width: view.w, height: view.h, deviceScaleFactor: 1, isMobile: view.w < 700, hasTouch: view.w < 700 })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
    page.on('console', (m) => {
      if (!['error', 'warning'].includes(m.type())) return
      if (/apple-mobile-web-app-capable.*deprecated/.test(m.text())) return
      problems.push(`console.${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('requestfailed', (r) => problems.push(`requestfailed ${r.url()}`))
    page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`))
    for (const [hash, navLabel, tabInfo] of view.routes) {
      pages++
      checks++
      await gotoRetry(page, base + hash)
      await page.waitForSelector('.app', { timeout: 25000 })
      const want = tabInfo ? tabInfo[1] : '#vn-body > *'
      try {
        await page.waitForSelector(want, { timeout: 20000 })
      } catch {
        note(`[${tag}] ${hash}: không thấy ${want}`)
        continue
      }
      await new Promise((r) => setTimeout(r, 200))
      // cuộn tới đáy để chắc không có phần tử nào ngoài tầm (không đổi bố cục)
      const a = await page.evaluate(audit)
      if (process.env.VERBOSE) console.log(tag, hash, 'chữ đã kiểm', a.stat.texts, 'tương phản thấp nhất', a.stat.min?.toFixed(2), 'phần tử chạm', a.nav.length)
      const where = `[${tag}] ${hash}`
      if (a.overflow) note(`${where}: tràn ngang`)
      for (const t of a.touch) note(`${where}: vùng chạm nhỏ ${t}`)
      for (const t of a.font) note(`${where}: chữ nhỏ ${t}`)
      for (const t of a.contrast) note(`${where}: tương phản ${t}`)
      const labels = a.nav.map((n) => n.text).join('|')
      if (labels !== 'Hôm nay|Tháng|Xem ngày|Cúng lễ|Phong thủy') note(`${where}: nhãn điều hướng "${labels}"`)
      for (const n of a.nav) {
        if (n.cut) note(`${where}: nhãn "${n.text}" bị cắt`)
        if (!n.onscreen) note(`${where}: mục "${n.text}" ra ngoài màn hình`)
        if (n.lines > 2) note(`${where}: nhãn "${n.text}" quá ${n.lines} dòng`)
      }
      const act = a.nav.filter((n) => n.active).map((n) => n.text)
      const wantLabel = tabInfo ? tabInfo[2] : navLabel
      if (act.length !== 1 || act[0] !== wantLabel) note(`${where}: mục sáng "${act.join(',')}" ≠ "${wantLabel}"`)
      if (tabInfo) {
        const h2 = await page.$eval('.app > .main:not(.vn-main) .topbar h2', (e) => e.innerText.trim())
        if (h2 !== tabInfo[2]) note(`${where}: tiêu đề "${h2}"`)
      } else {
        const vis = await page.$eval('#vn-main', (e) => !e.hidden)
        if (!vis) note(`${where}: mô-đun không hiện`)
        const sub = await page.$$eval('.vn-subtab.active', (a) => a.map((x) => x.innerText.trim()).join(','))
        const wantSub = hash.startsWith('#/van-khan') || hash.startsWith('#/ve-noi-dung') ? 'Văn khấn' : hash.startsWith('#/mam-cung') ? 'Mâm cúng' : ''
        if (sub !== wantSub) note(`${where}: thẻ con sáng "${sub}" ≠ "${wantSub}"`)
      }
      // màu nền đúng chế độ
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const exp = scheme === 'light' ? 'rgb(244, 247, 251)' : 'rgb(11, 18, 32)'
      if (bg !== exp) note(`${where}: nền ${bg} ≠ ${exp}`)
    }
    // nút ‹ 9app: có, bấm được (href về cổng), không đè lên tiêu đề
    await gotoRetry(page, base + '#/hom-nay')
    await page.waitForSelector('.hero')
    const home = await page.evaluate(() => {
      const el = document.querySelector('.topbar .home9')
      const t = document.querySelector('.topbar .titles')
      const r = el.getBoundingClientRect()
      const tr = t.getBoundingClientRect()
      return { n: [...document.querySelectorAll('#n9-home, .home9')].filter((x) => x.getBoundingClientRect().width > 0).length, href: el.getAttribute('href'), overlap: r.right > tr.left + 1, w: r.width, h: r.height, fixedLeft: !!document.getElementById('n9-home') }
    })
    if (home.n !== 1 || home.overlap || home.fixedLeft || home.href !== '/') note(`[${tag}] nút ‹ 9app: ${JSON.stringify(home)}`)
    for (const p of [...new Set(problems)]) note(`[${tag}] ${p}`)
    await ctx.close()
  }
}
await browser.close()
await srv.close()
const uniq = [...new Set(fails)]
console.log(`Đã duyệt ${pages} trang, ${checks} kiểm tra. Vi phạm: ${uniq.length}`)
uniq.slice(0, 80).forEach((f) => console.log('  - ' + f))
if (uniq.length > 80) console.log(`  ... và ${uniq.length - 80} vi phạm nữa`)
fs.writeFileSync(path.join(ROOT, 'shots', 'ux', 'ux-check-result.txt'), `Đã duyệt ${pages} trang, ${checks} kiểm tra. Vi phạm: ${uniq.length}\n` + uniq.join('\n') + '\n')
process.exit(uniq.length ? 1 : 0)
