// Chụp ảnh giao diện: node scripts/ux-shots.mjs <tiền tố> [thư mục tĩnh]   → shots/ux/<tiền tố>_<màn>_<khung>_<sáng|tối>.png
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { startServer } from './server.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'shots', 'ux')
fs.mkdirSync(OUT, { recursive: true })
const prefix = process.argv[2] || 'after'
const dir = process.argv[3] || ROOT
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const { default: puppeteer } = await import(PPT)
const srv = await startServer({ dir, port: 20000 + Math.floor(Math.random() * 20000) })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'vn-shot-'))}`] })
const VIEWS = [
  ['390', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ['light', 'dark']],
  ['360', { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ['light']],
  ['1280', { width: 1280, height: 800, deviceScaleFactor: 1 }, ['light', 'dark']],
]
const SCREENS = [['hom-nay', '#/hom-nay'], ['lich', '#/lich'], ['xem-ngay', '#/xem-ngay'], ['phong-thuy', '#/phong-thuy'], ['van-khan', '#/van-khan'], ['kham-bai', '#/van-khan/ram-mung-1'], ['mam-cung', '#/mam-cung'], ['mam-ct', '#/mam-cung/mam-ram-mung-1']]
for (const [tag, view, schemes] of VIEWS) for (const scheme of schemes) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(view)
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
  for (const [name, hash] of SCREENS) {
    for (let i = 0; ; i++) {
      try {
        await page.goto('about:blank')
        await page.goto(`http://127.0.0.1:${srv.port}/vannien/${hash}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
        break
      } catch (e) {
        if (i >= 3) throw e
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
    await page.waitForSelector('.app', { timeout: 25000 })
    await new Promise((r) => setTimeout(r, 700))
    await page.screenshot({ path: path.join(OUT, `${prefix}_${name}_${tag}_${scheme === 'light' ? 's' : 't'}.png`), fullPage: false })
  }
  await ctx.close()
}
await browser.close(); await srv.close()
console.log('xong')
