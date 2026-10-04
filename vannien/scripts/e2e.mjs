// Kiểm thử giao diện thật bằng Chrome (puppeteer-core): điện thoại 390x844 và máy tính 1280x800.
// Chạy:  node scripts/e2e.mjs        Ảnh chụp ghi vào vannien/shots/ (thư mục này KHÔNG đưa lên bản triển khai).
// Tự dựng máy chủ tĩnh ở cổng ngẫu nhiên từ 10100 trở lên; so sánh tính năng cũ với bản sao lưu (BACKUP).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { startServer } from './server.mjs'
import * as L from '../mod/logic.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = path.join(ROOT, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })
const BACKUP = process.env.BACKUP || fs.readdirSync(path.resolve(ROOT, '..')).filter((n) => n.startsWith('vannien.bak-')).sort().map((n) => path.resolve(ROOT, '..', n)).pop()
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const { default: puppeteer } = await import(PPT)

const vk = JSON.parse(fs.readFileSync(path.join(ROOT, 'mod/data/van-khan.json'), 'utf8'))
const mc = JSON.parse(fs.readFileSync(path.join(ROOT, 'mod/data/mam-cung.json'), 'utf8'))

const cur = await startServer({ dir: ROOT })
const old = BACKUP ? await startServer({ dir: BACKUP }) : null
const ORIGIN = `http://127.0.0.1:${cur.port}`
const URL0 = `${ORIGIN}/vannien/`
console.log(`Máy chủ mới ${ORIGIN}${old ? `, bản sao lưu http://127.0.0.1:${old.port} (${path.basename(BACKUP)})` : ', KHÔNG có bản sao lưu'}`)

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vannien-chrome-'))
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`] })

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }
const results = []
const problems = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const FAKE_ENV = `
  window.__spoken = []; window.__shared = null; window.__speechState = 'idle';
  const Utt = function (text) { this.text = text; this.lang = ''; this.rate = 1; };
  window.SpeechSynthesisUtterance = Utt;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speaking: false,
    getVoices() { return [{ lang: 'vi-VN', name: 'Giọng thử' }] },
    speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => { u.onstart && u.onstart({}); setTimeout(() => u.onend && u.onend({}), 5) }, 5) },
    cancel() { window.__speechState = 'cancel' }, pause() { window.__speechState = 'pause' }, resume() { window.__speechState = 'resume' },
  } });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = d } });
`

async function newPage(view, { fake = true, ctx } = {}) {
  const context = ctx || (await browser.createBrowserContext())
  try {
    await context.overridePermissions(ORIGIN, ['clipboard-read', 'clipboard-write'])
  } catch {
    /* bỏ qua */
  }
  const page = await context.newPage()
  await page.setViewport(view)
  if (fake) await page.evaluateOnNewDocument(FAKE_ENV)
  const tag = `${view.width}px`
  page.__ctx = context
  page.__tag = tag
  page.on('console', (m) => {
    if (!['error', 'warning'].includes(m.type())) return
    const t = m.text()
    if (/apple-mobile-web-app-capable.*deprecated/.test(t)) return // cảnh báo có sẵn của bản gốc
    if (/Failed to load resource.*(fonts\.g)/.test(t)) return
    problems.push(`[${tag}] console.${m.type()}: ${t}`)
  })
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`))
  page.on('requestfailed', (r) => {
    if (/fonts\.g/.test(r.url())) return
    if (r.failure()?.errorText?.includes('ERR_ABORTED')) return
    problems.push(`[${tag}] requestfailed ${r.url()} ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && !/fonts\.g/.test(r.url())) problems.push(`[${tag}] HTTP ${r.status()} ${r.url()}`)
  })
  return page
}

async function open(page, hash, base = URL0) {
  await page.goto('about:blank')
  await page.goto(`${base}${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.app', { timeout: 8000 })
  if (/^#\/(van-khan|mam-cung|ve-noi-dung)/.test(hash)) await page.waitForSelector('#vn-body > *', { timeout: 8000 })
  await sleep(120)
}
const text = (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim())
const count = (page, sel) => page.$$eval(sel, (a) => a.length)
const hashOf = (page) => page.evaluate(() => location.hash)
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' }, sel)
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${page.__tag === '390px' ? 'm' : 'd'}_${name}.png`), fullPage: full })
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

async function clickText(page, selector, label, exact = true) {
  const h = await page.evaluateHandle((selector, label, exact) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim()
    return [...document.querySelectorAll(selector)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (exact ? norm(e.innerText) === label : norm(e.innerText).includes(label)) }) || null
  }, selector, label, exact)
  const el = h.asElement()
  if (!el) throw new Error(`Không thấy "${label}" (${selector})`)
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await el.click()
  await sleep(150)
}
async function setValue(page, sel, value, ev = 'input') {
  await page.$eval(sel, (e, v, ev) => { const proto = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v); e.dispatchEvent(new Event(ev, { bubbles: true })); if (ev === 'input') e.dispatchEvent(new Event('change', { bubbles: true })) }, value, ev)
  await sleep(120)
}
const parseVnd = (s) => Number(String(s).replace(/[^\d]/g, ''))

async function step(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ok   ${name}`)
  } catch (e) {
    results.push({ name, ok: false, err: e.message })
    console.log(`  LỖI  ${name}\n       ${e.message.split('\n')[0]}`)
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'khác nhau'}: nhận được ${JSON.stringify(a)}, mong đợi ${JSON.stringify(b)}`)
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg)
}

/* ================================================================ */
/* 1. Tính năng cũ so với bản sao lưu                               */
/* ================================================================ */
async function legacySnapshot(base, view) {
  const page = await newPage(view, { fake: false })
  await page.goto(`${base}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.app .main')
  await sleep(300)
  const mobile = view.width < 981
  const snap = {}
  const labels = ['Hôm nay', 'Tháng', 'Xem ngày', 'Phong thủy']
  for (const [i, label] of labels.entries()) {
    await clickText(page, mobile ? '.mobile-nav > .tab-btn' : '.sidebar .nav-btn', label)
    await sleep(250)
    snap[label] = await page.evaluate(() => {
      const m = document.querySelector('.app > .main:not(.vn-main)')
      const c = m.cloneNode(true)
      c.querySelectorAll('.clock').forEach((e) => e.remove())
      return { text: c.innerText.replace(/\s+/g, ' ').trim(), cards: c.querySelectorAll('.card').length, h2: m.querySelector('.topbar h2').innerText }
    })
    if (label === 'Tháng') {
      // bấm sang tháng sau rồi chọn ngày 15
      await clickText(page, 'button[aria-label="Tháng sau"]', '›')
      await clickText(page, '.cal-grid .cell', '15', false)
      snap['Tháng:sau'] = await page.evaluate(() => document.querySelector('.month-head h3').innerText + '|' + document.querySelectorAll('.cal-grid .cell').length)
    }
    if (label === 'Xem ngày') {
      await page.select('.main select', 'khaitruong').catch(() => {})
      const opts = await page.$$eval('.main select option', (o) => o.map((x) => x.value))
      await page.select('.main select', opts[5])
      await sleep(200)
      snap['Xem ngày:việc6'] = await page.evaluate(() => [...document.querySelectorAll('.score-item')].map((e) => e.innerText.replace(/\s+/g, ' ')).join('||'))
    }
    if (label === 'Phong thủy') {
      snap['Phong thủy:input'] = await page.evaluate(() => [...document.querySelectorAll('.main input, .main select')].length)
    }
  }
  await page.__ctx.close()
  return snap
}

if (old) {
  console.log('\n[1] Tính năng cũ: so với bản sao lưu')
  for (const [label, view] of [['điện thoại', MOBILE], ['máy tính', DESKTOP]]) {
    await step(`Bốn tab và thao tác cũ giống bản sao lưu (${label})`, async () => {
      const a = await legacySnapshot(`http://127.0.0.1:${old.port}/vannien/`, view)
      const b = await legacySnapshot(URL0, view)
      for (const k of Object.keys(a)) {
        const x = JSON.stringify(a[k])
        const y = JSON.stringify(b[k])
        if (x !== y) throw new Error(`"${k}" khác bản sao lưu:\n  cũ: ${x.slice(0, 160)}\n  mới: ${y.slice(0, 160)}`)
      }
      ok(Object.keys(a).length >= 7, 'ít bước so sánh')
    })
  }
}

/* ================================================================ */
/* 2. Mô-đun mới                                                    */
/* ================================================================ */
async function suite(view) {
  const tag = view.width === 390 ? 'điện thoại' : 'máy tính'
  const mobile = view.width < 981
  console.log(`\n[2] Mô-đun mới (${tag} ${view.width}x${view.height})`)
  const page = await newPage(view)

  await step(`${tag}: nút Văn khấn, Mâm cúng trên thanh điều hướng, tab cũ vẫn còn`, async () => {
    await open(page, '')
    const sel = mobile ? '.mobile-nav' : '.sidebar .nav'
    const labels = await page.$$eval(`${sel} > *`, (a) => a.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
    eq(labels.join('|'), 'Hôm nay|Tháng|Xem ngày|Phong thủy|Văn khấn|Mâm cúng')
    ok(await visible(page, '.hero'), 'trang Hôm nay phải hiện khi không có hash')
    ok(!(await visible(page, '#vn-main')), 'mô-đun phải ẩn khi không có hash')
    if (mobile) ok(await noOverflow(page), 'tràn ngang')
  })

  await step(`${tag}: #/van-khan mở thẳng, danh sách + sắp tới`, async () => {
    await open(page, '#/van-khan')
    eq(await text(page, '#vn-main .topbar h2'), 'Văn khấn')
    eq(await count(page, '#vn-vk-list .vn-card'), vk.items.length)
    ok((await count(page, '#vn-upcoming .vn-up')) >= 3, 'mục Sắp tới')
    ok(!(await visible(page, '.hero')), 'trang cũ phải ẩn')
    ok(await page.$eval('.vn-btn-nav[data-route="van-khan"]', (e) => e.classList.contains('active')), 'nút điều hướng sáng')
    if (mobile) ok(await noOverflow(page), 'tràn ngang')
    await shot(page, 'vankhan_list')
    await shot(page, 'vankhan_list_full', true)
  })

  await step(`${tag}: tìm bài khấn bỏ dấu`, async () => {
    await setValue(page, '#vn-vk-search', 'gio')
    const names = await page.$$eval('#vn-vk-list .vn-card:not([hidden]) b', (a) => a.map((e) => e.innerText))
    ok(names.some((n) => /giỗ/i.test(n)), 'thấy bài giỗ')
    ok(names.length < vk.items.length, 'có lọc')
    await setValue(page, '#vn-vk-search', 'xyzxyz')
    ok(await visible(page, '#vn-vk-list ~ p'), 'thông báo rỗng')
    await setValue(page, '#vn-vk-search', '')
  })

  await step(`${tag}: mọi ${vk.items.length} bài khấn mở thẳng bằng link, đủ đoạn, không lỗi hiển thị`, async () => {
    const p2 = await newPage(view)
    for (const it of vk.items) {
      await open(p2, `#/van-khan/${it.id}`)
      eq(await text(p2, '#vn-main .topbar h2'), it.name, it.id)
      const paras = L.resolveParagraphs(it.paragraphs, vk.meta.blocks)
      eq(await count(p2, '#vn-text p'), paras.length, `${it.id}: số đoạn`)
      const t = await text(p2, '#vn-text')
      ok(!/undefined|\{\{|\}\}|null/.test(t), `${it.id}: chữ lỗi`)
      if (mobile) ok(await noOverflow(p2), `${it.id}: tràn ngang`)
    }
    await p2.__ctx.close()
  })

  await step(`${tag}: điền họ tên, địa chỉ, ngày: bài khấn Rằm`, async () => {
    await open(page, '#/van-khan/ram-mung-1?d=2026-09-25')
    ok((await text(page, '#vn-text')).includes('ngày 15 tháng 8 năm Bính Ngọ'), 'ngày âm Trung thu 2026')
    ok((await text(page, '#vn-text')).includes('Nhân ngày Rằm'), 'ngay_le = Rằm')
    const blanksBefore = await count(page, '#vn-text .vn-blank')
    ok(blanksBefore >= 3, 'chỗ trống ban đầu')
    await setValue(page, '#vn-f-ho_ten', 'Nguyễn Văn An')
    await setValue(page, '#vn-f-dia_chi', '12 Phố Huế, Hà Nội')
    const t = await text(page, '#vn-text')
    ok(t.includes('Tín chủ con là Nguyễn Văn An, ngụ tại 12 Phố Huế, Hà Nội'), 'đã điền')
    ok(t.includes('họ Nguyễn'), 'họ tự lấy từ họ tên')
    eq(await count(page, '#vn-text .vn-blank'), 0, 'hết chỗ trống')
    ok((await count(page, '#vn-text mark.vn-val')) >= 3, 'tô sáng giá trị đã điền')
    await shot(page, 'vankhan_detail_filled')
    // lưu lại sau khi tải lại
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#vn-text')
    eq(await page.$eval('#vn-f-ho_ten', (e) => e.value), 'Nguyễn Văn An', 'nhớ họ tên')
  })

  await step(`${tag}: đổi ngày cúng cập nhật ngày âm và đường dẫn`, async () => {
    await setValue(page, '#vn-date', '2026-10-24')
    ok((await text(page, '#vn-text')).includes('ngày 15 tháng 9'), 'ngày 15 tháng 9')
    ok((await hashOf(page)).includes('d=2026-10-24'), 'url có d=')
    ok(!(await visible(page, '#vn-datewarn')), 'ngày Rằm không cảnh báo')
    await setValue(page, '#vn-date', '2026-10-25')
    ok(await visible(page, '#vn-datewarn'), 'ngày thường phải cảnh báo')
  })

  await step(`${tag}: chế độ chữ to đổi cỡ chữ thật và nhớ lại`, async () => {
    await open(page, '#/van-khan/ram-mung-1?d=2026-09-25')
    const fs1 = await page.$eval('#vn-text', (e) => parseFloat(getComputedStyle(e).fontSize))
    await clickText(page, '.vn-seg button', 'Rất to')
    const fs3 = await page.$eval('#vn-text', (e) => parseFloat(getComputedStyle(e).fontSize))
    eq(fs3, 32)
    ok(fs3 > fs1 * 1.7, 'chữ phải to hơn nhiều')
    await shot(page, 'vankhan_bigtext')
    await clickText(page, '.vn-seg button', 'To')
    eq(await page.$eval('#vn-text', (e) => parseFloat(getComputedStyle(e).fontSize)), 24)
    await clickText(page, '.vn-seg button', 'Rất to')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#vn-text')
    eq(await page.$eval('#vn-text', (e) => e.dataset.size), '3', 'nhớ cỡ chữ')
    if (mobile) ok(await noOverflow(page), 'tràn ngang ở chữ rất to')
    await clickText(page, '.vn-seg button', 'Thường')
  })

  await step(`${tag}: chế độ đọc toàn màn hình, mở bằng link và Back đóng lại`, async () => {
    await open(page, '#/van-khan/ram-mung-1?d=2026-09-25')
    await page.click('#vn-read-open')
    await page.waitForSelector('#vn-read')
    ok((await hashOf(page)).includes('doc=1'), 'url có doc=1')
    const box = await page.$eval('#vn-read', (e) => { const r = e.getBoundingClientRect(); return [r.width, r.height] })
    ok(box[0] >= view.width - 1 && box[1] >= view.height - 1, 'phủ kín màn hình')
    ok((await page.$eval('#vn-read-text', (e) => parseFloat(getComputedStyle(e).fontSize))) >= 28, 'chữ đủ to')
    await shot(page, 'vankhan_reading')
    await page.goBack()
    await sleep(250)
    ok(!(await visible(page, '#vn-read')), 'Back phải đóng chế độ đọc')
    ok(!(await hashOf(page)).includes('doc=1'), 'hash bỏ doc')
    // mở thẳng bằng link
    await open(page, '#/van-khan/ram-mung-1?d=2026-09-25&doc=1')
    ok(await visible(page, '#vn-read'), 'mở thẳng chế độ đọc')
    await page.click('#vn-read-close')
    await sleep(250)
    ok(!(await visible(page, '#vn-read')), 'nút Đóng')
  })

  await step(`${tag}: đọc to (vi-VN) chia theo đoạn, có tạm dừng và dừng`, async () => {
    await open(page, '#/van-khan/ram-mung-1?d=2026-09-25')
    await setValue(page, '#vn-f-ho_ten', 'Nguyễn Văn An')
    await page.click('#vn-speak')
    await page.waitForFunction(() => window.__spoken.length >= 8, { timeout: 5000 })
    await sleep(300)
    const spoken = await page.evaluate(() => window.__spoken)
    ok(spoken.every((s) => s.lang === 'vi-VN'), 'lang vi-VN')
    ok(spoken.some((s) => s.text.includes('Nguyễn Văn An')), 'đọc cả tên đã điền')
    ok(!spoken.some((s) => s.text.includes('…')), 'không đọc dấu chấm lửng')
    eq(await text(page, '#vn-speak'), 'Đọc to', 'xong thì về Đọc to')
  })

  await step(`${tag}: in ra giấy ẩn thanh điều hướng, giữ nội dung bài`, async () => {
    await open(page, '#/van-khan/ram-mung-1?d=2026-09-25')
    await setValue(page, '#vn-f-ho_ten', 'Nguyễn Văn An')
    await page.emulateMediaType('print')
    ok(!(await visible(page, '.mobile-nav')) && !(await visible(page, '.sidebar')), 'ẩn điều hướng')
    ok(!(await visible(page, '#vn-fields')), 'ẩn biểu mẫu')
    ok(await visible(page, '#vn-text'), 'giữ nội dung')
    await shot(page, 'vankhan_print', true)
    await page.emulateMediaType('screen')
  })

  await step(`${tag}: chia sẻ và sao chép bài khấn`, async () => {
    await open(page, '#/van-khan/ram-mung-1?d=2026-09-25')
    await clickText(page, '.vn-doc .vn-btn', 'Chia sẻ')
    const shared = await page.evaluate(() => window.__shared)
    ok(shared && shared.text.includes('CÚNG RẰM') && shared.text.includes('tham khảo'), 'nội dung chia sẻ')
    await clickText(page, '.vn-doc .vn-btn', 'Sao chép')
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
    ok(clip.includes('Nam mô A Di Đà Phật'), 'đã sao chép')
  })

  await step(`${tag}: ngày giỗ gia đình: thêm, tính ngày, mở bài khấn, xóa`, async () => {
    await open(page, '#/van-khan')
    await setValue(page, '#vn-gio-name', 'Nguyễn Văn Bình')
    await setValue(page, '#vn-gio-rel', 'cha')
    const soon = L.dateInfo(L.addDays(L.vnToday().year, L.vnToday().month, L.vnToday().day, 3))
    await setValue(page, '#vn-gio-day', String(soon.lunar.day))
    await setValue(page, '#vn-gio-month', String(soon.lunar.month))
    await page.$eval('#vn-gio form', (f) => f.requestSubmit())
    await page.waitForSelector('#vn-gio .vn-row')
    const row = await text(page, '#vn-gio .vn-row')
    ok(row.includes('Giỗ cha Nguyễn Văn Bình') && row.includes(`${soon.lunar.day}/${soon.lunar.month} âm lịch`), 'hàng giỗ')
    const exp = L.nextGio(soon.lunar.day, soon.lunar.month, L.vnToday())
    eq(L.toISO(exp.solar), L.toISO(L.addDays(L.vnToday().year, L.vnToday().month, L.vnToday().day, 3)), 'giỗ rơi vào 3 ngày nữa')
    ok(row.includes(L.formatDMY(exp.solar)), `ngày dương lịch ${L.formatDMY(exp.solar)}`)
    ok((await text(page, '#vn-upcoming')).includes('Giỗ cha Nguyễn Văn Bình'), 'xuất hiện ở Sắp tới')
    await shot(page, 'vankhan_gio_panel')
    await clickText(page, '#vn-gio .vn-row a', 'Mở bài khấn')
    await page.waitForSelector('#vn-text')
    const t = await text(page, '#vn-text')
    ok(t.includes('giỗ của cha Nguyễn Văn Bình'), 'điền người giỗ')
    ok((await text(page, '#vn-dateinfo')).includes(`${soon.lunar.day}/${soon.lunar.month} âm lịch`), 'ngày âm của giỗ')
    eq(await count(page, '#vn-text .vn-blank'), 0, 'họ tên và địa chỉ gia chủ đã nhớ từ bước trước')
  })

  await step(`${tag}: giỗ: không còn trống thừa sau khi điền gia chủ, xóa người giỗ`, async () => {
    await setValue(page, '#vn-f-ho_ten', 'Nguyễn Văn An')
    await setValue(page, '#vn-f-dia_chi', 'Hà Nội')
    eq(await count(page, '#vn-text .vn-blank'), 0)
    await shot(page, 'vankhan_gio_detail')
    await open(page, '#/van-khan')
    await clickText(page, '#vn-gio .vn-row button', 'Xóa')
    eq(await count(page, '#vn-gio .vn-row'), 0)
  })

  await step(`${tag}: điều hướng Back/Forward trong mô-đun`, async () => {
    await open(page, '#/van-khan')
    await clickText(page, '#vn-vk-list .vn-card', 'Cúng tất niên', false)
    eq(await hashOf(page), '#/van-khan/tat-nien')
    eq(await text(page, '#vn-main .topbar h2'), 'Cúng tất niên')
    await page.goBack()
    await sleep(250)
    eq(await hashOf(page), '#/van-khan')
    eq(await text(page, '#vn-main .topbar h2'), 'Văn khấn')
    await page.goForward()
    await sleep(250)
    eq(await text(page, '#vn-main .topbar h2'), 'Cúng tất niên')
    // liên kết sang mâm cúng và quay lại
    await clickText(page, '.vn-grid .vn-btn', 'Xem mâm cúng', false)
    ok((await hashOf(page)).startsWith('#/mam-cung/'), 'sang mâm cúng')
    await page.goBack()
    await sleep(250)
    eq(await hashOf(page), '#/van-khan/tat-nien')
  })

  await step(`${tag}: bài không tồn tại báo thân thiện`, async () => {
    await open(page, '#/van-khan/khong-co-bai-nay')
    ok((await text(page, '#vn-body')).includes('Không tìm thấy bài khấn'))
    await open(page, '#/mam-cung/khong-co')
    ok((await text(page, '#vn-body')).includes('Không tìm thấy mâm cúng'))
    await open(page, '#/mam-cung/cong-thuc/khong-co')
    ok((await text(page, '#vn-body')).includes('Không tìm thấy công thức'))
  })

  await step(`${tag}: #/mam-cung danh sách`, async () => {
    await open(page, '#/mam-cung')
    eq(await text(page, '#vn-main .topbar h2'), 'Mâm cúng')
    eq(await count(page, '#vn-mc-list .vn-card'), mc.items.length + 1)
    eq(await count(page, '.vn-recipes .vn-card'), mc.recipes.length)
    ok((await text(page, '.vn-lead')).includes('tham khảo'), 'ghi chú giá')
    if (mobile) ok(await noOverflow(page), 'tràn ngang')
    await shot(page, 'mamcung_list')
    await setValue(page, '#vn-mc-search', 'tet')
    const names = await page.$$eval('#vn-mc-list .vn-card:not([hidden]) b', (a) => a.map((e) => e.innerText))
    ok(names.some((n) => /Tết/.test(n)) && names.length < mc.items.length, 'lọc theo tet')
  })

  await step(`${tag}: mọi ${mc.items.length} mâm cúng, ngũ quả và ${mc.recipes.length} công thức mở thẳng bằng link`, async () => {
    const p2 = await newPage(view)
    for (const it of mc.items) {
      await open(p2, `#/mam-cung/${it.id}`)
      eq(await text(p2, '#vn-main .topbar h2'), it.name, it.id)
      const exp = L.scaleItem(L.resolveItem(it, mc.meta.catalog), it.defaults).total
      eq(parseVnd(await text(p2, '#vn-total')), exp, `${it.id}: tổng tiền`)
      ok((await count(p2, '.vn-item')) >= it.ingredients.length, `${it.id}: số dòng`)
      if (mobile) ok(await noOverflow(p2), `${it.id}: tràn ngang`)
    }
    for (const r of mc.recipes) {
      await open(p2, `#/mam-cung/cong-thuc/${r.id}`)
      eq(await text(p2, '#vn-main .topbar h2'), r.name)
      eq(await count(p2, '.vn-steps li'), r.steps.length)
    }
    await open(p2, '#/mam-cung/ngu-qua')
    eq(await text(p2, '#vn-main .topbar h2'), 'Mâm ngũ quả')
    await p2.__ctx.close()
  })

  await step(`${tag}: cỗ giỗ: số người, số mâm, ngân sách tính đúng, sửa đơn giá, tích đi chợ`, async () => {
    await open(page, '#/mam-cung/co-gio?n=12&m=2')
    const item = L.resolveItem(mc.items.find((i) => i.id === 'co-gio'), mc.meta.catalog)
    eq(await page.$eval('#vn-people', (e) => e.value), '12')
    eq(await page.$eval('#vn-mam', (e) => e.value), '2')
    eq(parseVnd(await text(page, '#vn-total')), L.scaleItem(item, { people: 12, mam: 2 }).total, 'tổng 12 người 2 mâm')
    await shot(page, 'mamcung_detail_top')
    // đổi số người: số mâm tự cập nhật
    await setValue(page, '#vn-people', '18')
    eq(await page.$eval('#vn-mam', (e) => e.value), '3', 'mâm tự tăng')
    eq(parseVnd(await text(page, '#vn-total')), L.scaleItem(item, { people: 18, mam: 3 }).total, 'tổng 18/3')
    ok((await hashOf(page)).includes('n=18') && (await hashOf(page)).includes('m=3'), 'url cập nhật')
    // sửa đơn giá gà
    await setValue(page, '[data-price="ga"]', '300000', 'change')
    eq(parseVnd(await text(page, '#vn-total')), L.scaleItem(item, { people: 18, mam: 3 }, { ga: 300000 }).total, 'tổng sau sửa giá')
    ok((await text(page, '[data-ing="ga"]')).includes('giá của bạn'), 'nhãn giá của bạn')
    // tích món
    await page.click('[data-ing="ga"] .vn-check')
    ok((await text(page, '#vn-budget')).includes('Đã mua 1/'), 'đếm đã mua')
    ok(await page.$eval('[data-ing="ga"]', (e) => e.classList.contains('done')), 'gạch món đã mua')
    await shot(page, 'mamcung_detail_list')
    // tải lại: đơn giá và tích được nhớ
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#vn-total')
    eq(await page.$eval('[data-price="ga"]', (e) => e.value), '300000', 'nhớ đơn giá')
    ok(await page.$eval('[data-ing="ga"] .vn-check', (e) => e.checked), 'nhớ đã tích')
    // đơn giá dùng chung cho mâm khác
    await open(page, '#/mam-cung/cung-tet-bac')
    eq(await page.$eval('[data-price="ga"]', (e) => e.value), '300000', 'đơn giá dùng chung')
    // đặt lại
    await clickText(page, '#vn-actions .vn-btn', 'Đặt lại đơn giá')
    eq(await page.$eval('[data-price="ga"]', (e) => e.value), '250000', 'đặt lại đơn giá')
  })

  await step(`${tag}: bỏ/thêm món, món thêm, bỏ tích`, async () => {
    await open(page, '#/mam-cung/co-gio?n=12&m=2')
    const t0 = parseVnd(await text(page, '#vn-total'))
    await clickText(page, '[data-ing="heo-quay"] .vn-btn-sm, [data-ing="ga"] .vn-btn-sm', 'Bỏ')
    const t1 = parseVnd(await text(page, '#vn-total'))
    ok(t1 < t0, 'bỏ món thì giảm tiền')
    await setValue(page, '#vn-extra-name', 'Bia, nước ngọt')
    await setValue(page, '#vn-extra-cost', '100000')
    await page.$eval('#vn-extras form', (f) => f.requestSubmit())
    await sleep(200)
    eq(parseVnd(await text(page, '#vn-total')), t1 + 100000, 'món thêm cộng vào tổng')
    ok((await text(page, '#vn-shop')).includes('Bia, nước ngọt'), 'hiện món thêm')
    await clickText(page, '#vn-actions .vn-btn', 'Bỏ tích tất cả')
    eq(await count(page, '#vn-shop .vn-check:checked'), 0)
    await clickText(page, '[data-ing="ga"] .vn-btn-sm', 'Thêm lại')
    eq(parseVnd(await text(page, '#vn-total')), t0 + 100000, 'thêm lại món')
    await page.evaluate(() => localStorage.removeItem('vn.mam.draft'))
  })

  await step(`${tag}: lưu vào Mâm của tôi, mở lại, xóa`, async () => {
    await open(page, '#/mam-cung/co-gio?n=24&m=4')
    await setValue(page, '#vn-save-label', 'Giỗ ông nội 2026')
    await page.click('#vn-save')
    await sleep(200)
    ok((await hashOf(page)).includes('u='), 'url có u=')
    await page.click('[data-ing="gio-lua"] .vn-check')
    await open(page, '#/mam-cung')
    eq(await count(page, '#vn-mine .vn-row'), 1)
    const row = await text(page, '#vn-mine .vn-row')
    ok(row.includes('Giỗ ông nội 2026') && row.includes('24 người') && row.includes('4 mâm') && row.includes('đã mua 1/'), `hàng Mâm của tôi: ${row}`)
    await shot(page, 'mamcung_mine')
    await page.click('#vn-mine .vn-row-main')
    await page.waitForSelector('#vn-total')
    eq(await page.$eval('#vn-people', (e) => e.value), '24')
    ok(await page.$eval('[data-ing="gio-lua"] .vn-check', (e) => e.checked), 'nhớ tích trong mâm đã lưu')
    // tải lại hẳn trang vẫn còn
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#vn-total')
    eq(await page.$eval('#vn-people', (e) => e.value), '24')
    await open(page, '#/mam-cung')
    await clickText(page, '#vn-mine .vn-row button', 'Xóa')
    eq(await count(page, '#vn-mine .vn-row'), 0)
  })

  await step(`${tag}: chia sẻ danh sách đi chợ qua Web Share`, async () => {
    await open(page, '#/mam-cung/co-gio?n=12&m=2')
    await page.click('[data-ing="ga"] .vn-check')
    await page.click('#vn-share')
    await sleep(200)
    const shared = await page.evaluate(() => window.__shared)
    ok(shared && shared.text.includes('Cỗ giỗ') && shared.text.includes('[x] Gà ta luộc nguyên con: 2 con') && shared.text.includes('Ngân sách ước tính'), `nội dung chia sẻ: ${shared && shared.text.slice(0, 120)}`)
    ok(shared.text.includes('12 người, 2 mâm'), 'ghi quy mô')
  })

  await step(`${tag}: ?n= đứng một mình tự tính số mâm; tất niên có hai mâm; localStorage hỏng không sập`, async () => {
    await open(page, '#/mam-cung/co-gio?n=18')
    eq(await page.$eval('#vn-mam', (e) => e.value), '3')
    await open(page, '#/van-khan/tat-nien')
    eq(await count(page, '.vn-grid a.vn-btn'), 2)
    await page.evaluate(() => { localStorage.setItem('vn.vk.gio', 'null'); localStorage.setItem('vn.vk.profile', '[]'); localStorage.setItem('vn.mam.prices', '{"ga":1e30}'); localStorage.setItem('vn.mam.saved', '{}') })
    await open(page, '#/van-khan')
    ok(await visible(page, '#vn-gio'), 'giỗ vẫn hiện')
    await open(page, '#/mam-cung/co-gio')
    ok(parseVnd(await text(page, '#vn-total')) > 0, 'vẫn tính được')
    await open(page, '#/mam-cung')
    ok(await visible(page, '#vn-mine'), 'danh sách vẫn hiện')
    await page.evaluate(() => localStorage.clear())
  })

  await step(`${tag}: mâm không đổi theo người (ông Công ông Táo) ẩn ô số người`, async () => {
    await open(page, '#/mam-cung/ong-cong-ong-tao')
    ok(!(await visible(page, '#vn-people')), 'không có ô số người')
    ok(await visible(page, '#vn-mam'), 'có ô số mâm')
    await setValue(page, '#vn-mam', '2')
    const item = L.resolveItem(mc.items.find((i) => i.id === 'ong-cong-ong-tao'), mc.meta.catalog)
    eq(parseVnd(await text(page, '#vn-total')), L.scaleItem(item, { people: 4, mam: 2 }).total)
  })

  await step(`${tag}: mâm ngũ quả ba miền và công thức`, async () => {
    await open(page, '#/mam-cung/ngu-qua')
    eq(await count(page, '.vn-regions a'), 3)
    for (const r of mc.nguQua.regions) {
      await page.click(`.vn-regions a[data-region="${r.id}"]`)
      await sleep(250)
      ok((await hashOf(page)).includes(`r=${r.id}`), `url ${r.id}`)
      eq(await count(page, '#vn-fruits .vn-fruit'), r.fruits.length, r.id)
    }
    await shot(page, 'nguqua_nam')
    await open(page, '#/mam-cung/cong-thuc/banh-chung')
    await shot(page, 'recipe')
  })

  await step(`${tag}: #/ve-noi-dung`, async () => {
    await open(page, '#/ve-noi-dung')
    const t = (await text(page, '#vn-body')).toLowerCase()
    ok(t.includes('nguồn tham khảo') && t.includes('tham khảo theo phong tục') && t.includes(`${vk.items.length} bài khấn`), `nội dung minh bạch: ${t.slice(0, 200)}`)
    await shot(page, 've_noi_dung')
  })

  await step(`${tag}: link thẳng tới bốn tab cũ`, async () => {
    for (const [hash, sel, label] of [['#/hom-nay', '.hero', 'Hôm nay'], ['#/lich', '.cal-grid', 'Tháng'], ['#/xem-ngay', '.score-item', 'Xem ngày'], ['#/phong-thuy', '.wheel-wrap', 'Phong thủy']]) {
      await open(page, hash)
      await page.waitForSelector(sel, { timeout: 4000 })
      ok(!(await visible(page, '#vn-main')), `${hash}: mô-đun phải ẩn`)
      ok(await page.$eval(mobile ? '.mobile-nav > .tab-btn.active' : '.nav-btn.active', (e) => e.innerText.replace(/\s+/g, ' ').trim()) === label, `${hash}: tab ${label} sáng`)
    }
    await shot(page, 'tab_phongthuy')
  })

  await step(`${tag}: bấm tab cũ cập nhật hash; Back qua lại giữa tab cũ và mô-đun`, async () => {
    await open(page, '')
    const navSel = mobile ? '.mobile-nav > a.tab-btn, .mobile-nav > button.tab-btn' : '.sidebar .nav-btn'
    await clickText(page, navSel, 'Tháng')
    eq(await hashOf(page), '#/lich')
    ok(await visible(page, '.cal-grid'), 'lịch tháng hiện')
    await clickText(page, navSel, 'Văn khấn')
    eq(await hashOf(page), '#/van-khan')
    ok(await visible(page, '#vn-main') && !(await visible(page, '.cal-grid')), 'sang văn khấn')
    await clickText(page, navSel, 'Xem ngày')
    eq(await hashOf(page), '#/xem-ngay')
    ok(!(await visible(page, '#vn-main')) && (await visible(page, '.score-item')), 'sang xem ngày')
    await page.goBack()
    await sleep(300)
    eq(await hashOf(page), '#/van-khan')
    ok(await visible(page, '#vn-main'), 'Back về văn khấn')
    await page.goBack()
    await sleep(300)
    eq(await hashOf(page), '#/lich')
    ok(await visible(page, '.cal-grid'), 'Back về lịch tháng')
  })

  await step(`${tag}: từ trang gốc vào Văn khấn rồi Back về đúng Hôm nay`, async () => {
    await open(page, '')
    const navSel = mobile ? '.mobile-nav > a.tab-btn' : '.sidebar a.nav-btn'
    await clickText(page, navSel, 'Văn khấn')
    ok(await visible(page, '#vn-main'), 'vào văn khấn')
    await page.goBack()
    await sleep(300)
    ok(await visible(page, '.hero') && !(await visible(page, '#vn-main')), 'Back về Hôm nay')
  })

  await step(`${tag}: chỉ mục tìm kiếm tải được qua HTTP và là JSON hợp lệ`, async () => {
    const r = await page.evaluate(async (u) => { const x = await fetch(u); return { s: x.status, t: await x.text(), c: x.headers.get('content-type') } }, `${URL0}search-index.json`)
    eq(r.s, 200)
    ok(/json/.test(r.c), 'content-type json')
    ok(Array.isArray(JSON.parse(r.t)) && JSON.parse(r.t).length > 40)
  })

  await page.__ctx.close()
}

if (process.env.ONLY !== 'desktop') await suite(MOBILE)
if (process.env.ONLY !== 'mobile') await suite(DESKTOP)

await step('Màn hình desktop: chụp trang chủ văn khấn và chi tiết', async () => {
  const p = await newPage(DESKTOP)
  await open(p, '#/van-khan/gio')
  await shot(p, 'vankhan_gio_full', true)
  await open(p, '#/mam-cung/co-gio?n=12&m=2')
  await shot(p, 'mamcung_full', true)
  await p.__ctx.close()
})

/* ================================================================ */
const withTimeout = (p, ms = 4000) => Promise.race([p, sleep(ms)])
await withTimeout(browser.close())
await withTimeout(cur.close(), 1000)
if (old) await withTimeout(old.close(), 1000)
try {
  fs.rmSync(userDataDir, { recursive: true, force: true })
} catch {
  /* Chrome còn giữ tệp tạm trên Windows, bỏ qua */
}

const failed = results.filter((r) => !r.ok)
const uniqueProblems = [...new Set(problems)]
console.log(`\nKết quả: ${results.length - failed.length}/${results.length} bước đạt`)
if (uniqueProblems.length) {
  console.log(`Lỗi console/mạng (${uniqueProblems.length}):`)
  uniqueProblems.slice(0, 30).forEach((p) => console.log('  - ' + p))
}
if (failed.length) {
  console.log('Bước lỗi:')
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.err}`))
}
process.exit(failed.length || uniqueProblems.length ? 1 : 0) // thoát hẳn, không chờ Chrome/máy chủ đóng hết
