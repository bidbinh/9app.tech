import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as L from '../mod/logic.js'
import { convertSolar2Lunar } from '../mod/lunar.js'
import { sameKind, store } from '../mod/ui.js'
import { injectModuleTags, finalizeHtml, plan, BUILD_OWNED } from '../../tools/pack-vannien.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const vk = JSON.parse(read('mod/data/van-khan.json'))
const mc = JSON.parse(read('mod/data/mam-cung.json'))
const item = (id) => vk.items.find((i) => i.id === id)
const render = (id, vars) => L.resolveParagraphs(item(id).paragraphs, vk.meta.blocks).map((p) => L.fillTemplate(p, vars)).join('\n')
const vars = (date, extra = {}) => L.buildVars({ ho_ten: 'Nguyễn Văn An', dia_chi: 'Hà Nội', ...extra }, L.dateInfo(date))

/* V1 */
test('V1: pack chèn lại hai thẻ mô-đun, chạy lại không đổi', () => {
  const html = read('index.html')
  // bản dựng gốc = index.html hiện tại bỏ hai thẻ mô-đun (pack chèn lại phải ra đúng bản đang dùng)
  const dist = html.replace(/\s*<link rel="stylesheet" href="\/vannien\/mod\/mod\.css[^"]*" \/>/, '').replace(/\s*<script type="module" src="\/vannien\/mod\/app\.js[^"]*"><\/script>/, '')
  const cssAsset = /assets\/index-[\w-]+\.css/.exec(html)[0]
  const ver = /const VERSION = '(\d+)'/.exec(read('mod/app.js'))[1]
  assert.equal(finalizeHtml(dist, ver), html, 'index.html tạo lại từ bản dựng phải giống bản đang dùng')
  const once = injectModuleTags(dist, '5')
  assert.equal(injectModuleTags(once, '5'), once, 'idempotent')
  assert.equal((once.match(/mod\/mod\.css/g) || []).length, 1)
  assert.equal((once.match(/mod\/app\.js/g) || []).length, 1)
  assert.ok(once.indexOf('mod.css') > once.indexOf(cssAsset), 'thẻ mô-đun nằm sau css của bản dựng')
  assert.equal(injectModuleTags(once, '9').match(/\?v=(\d+)/g).join(), '?v=9,?v=9')
})
test('V1: plan chỉ xóa tệp của bản dựng, giữ mod/ và mọi thứ khác', () => {
  const p = plan(ROOT)
  for (const k of ['mod', 'search-index.json', 'scripts', 'test', 'docs', 'package.json']) assert.ok(p.keep.includes(k), k)
  for (const k of p.remove) assert.ok(BUILD_OWNED.includes(k), k)
  assert.ok(!p.remove.includes('mod'))
})
test('V1: --dry-run không đổi gì', () => {
  const list = (d) => fs.readdirSync(d, { recursive: true }).map(String).filter((f) => !/^shots/.test(f)).sort().join('|')
  const before = list(ROOT)
  const stat = fs.statSync(path.join(ROOT, 'index.html')).mtimeMs
  const r = spawnSync(process.execPath, [path.join(ROOT, '..', 'tools', 'pack-vannien.mjs'), '--dry-run'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /dry-run/)
  assert.equal(list(ROOT), before)
  assert.equal(fs.statSync(path.join(ROOT, 'index.html')).mtimeMs, stat)
})

/* V2 */
test('V2: không lặp "Nhân ngày ngày"', () => {
  for (const d of [{ year: 2026, month: 11, day: 1 }, { year: 2026, month: 10, day: 24 }, { year: 2026, month: 10, day: 4 }, { year: 2026, month: 10, day: 10 }, { year: 2026, month: 11, day: 16 }]) {
    for (const id of ['ram-mung-1', 'than-tai-tho-dia']) assert.ok(!/ngày ngày/.test(render(id, vars(d))), `${id} ${L.toISO(d)}`)
  }
  assert.match(render('ram-mung-1', vars({ year: 2026, month: 10, day: 24 })), /Nhân ngày Rằm,/)
  assert.match(render('ram-mung-1', vars({ year: 2026, month: 10, day: 10 })), /Nhân ngày mùng Một,/)
  assert.match(render('ram-mung-1', vars({ year: 2026, month: 11, day: 1 })), /Nhân ngày (mùng \d|\d+),/)
  const via = L.lunarToSolar(10, 1, 2027)
  assert.match(render('than-tai-tho-dia', vars(via)), /Nhân ngày vía Thần Tài \(mùng 10 tháng Giêng\),/)
})
test('V7: cách gọi truyền thống và ông Táo không còn ngày cứng', () => {
  const i = L.dateInfo(L.lunarToSolar(5, 1, 2027))
  assert.equal(i.ngay_am, 'mùng 5')
  assert.equal(i.thang_am, 'Giêng')
  assert.equal(L.dateInfo(L.lunarToSolar(23, 12, 2026)).thang_am, 'Chạp')
  const t = render('ong-cong-ong-tao', vars(L.lunarToSolar(23, 12, 2026)))
  assert.ok(t.includes('ngày 23 tháng Chạp năm Bính Ngọ'))
  assert.ok(!t.includes('hai mươi ba'))
  const t2 = render('ong-cong-ong-tao', vars(L.lunarToSolar(22, 12, 2026)))
  assert.ok(t2.includes('ngày 22 tháng Chạp') && !t2.includes('hai mươi ba'))
})

/* V3 */
test('V3: lời khấn theo quan hệ', () => {
  const d = { year: 2026, month: 10, day: 24 }
  const gio = (rel) => render('gio', vars(d, { quan_he: rel, ten_nguoi_mat: 'Bình' }))
  assert.match(gio('cha'), /ơn sinh thành dưỡng dục/)
  assert.match(gio('cha'), /Con cháu kính mời hương linh cha Bình/)
  assert.match(gio('em'), /tình ruột thịt/)
  assert.ok(!/sinh thành|dưỡng dục|phù hộ độ trì cho con cháu/.test(gio('em')))
  assert.match(gio('em'), /Gia đình kính mời hương linh em Bình/)
  assert.ok(!/sinh thành|dưỡng dục/.test(gio('anh')))
  assert.match(gio('bác'), /bậc bề trên/)
  assert.ok(!/sinh thành/.test(gio('bác')))
  assert.match(gio('ông nội'), /gây dựng nếp nhà/)
  assert.match(gio('người thân'), /tình nghĩa gắn bó/)
  assert.ok(!/sinh thành/.test(render('tao-mo', vars(d, { quan_he: 'chị', ten_nguoi_mat: 'Hoa' }))))
  assert.match(render('tao-mo', vars(d, { quan_he: 'mẹ', ten_nguoi_mat: 'Hoa' })), /sinh thành/)
  const groups = ['cha', 'mẹ', 'ông nội', 'bà ngoại', 'cô', 'bác', 'dì', 'cậu', 'anh', 'chị', 'em', 'người thân', ''].map((r) => L.relationGroup(r))
  assert.deepEqual(groups, ['cha-me', 'cha-me', 'ong-ba', 'ong-ba', 'tren', 'tren', 'tren', 'tren', 'ngang', 'ngang', 'ngang', 'khac', 'khac'])
})

/* V4, V6 */
test('V4: ngày giỗ 30 gặp tháng thiếu hiển thị đúng 29', () => {
  const o = L.nextGio(30, 12, { year: 2025, month: 12, day: 1 })
  assert.equal(L.lunarShort(L.dateInfo(o.solar).lunar), '29/12')
})
test('V6: Rằm, mùng Một có cả tháng nhuận (2025 nhuận tháng 6)', () => {
  const list = L.occurrences({ kind: 'monthly', days: [15] }, { year: 2025, month: 7, day: 1 }, 6)
  const leap = list.filter((o) => L.dateInfo(o.solar).lunar.leap)
  assert.equal(leap.length, 1)
  assert.equal(L.lunarShort(L.dateInfo(leap[0].solar).lunar), '15/6 nhuận')
  assert.equal(L.toISO(leap[0].solar), '2025-08-08')
  assert.equal(list.length, 6)
  assert.equal(new Set(list.map((o) => L.dateKey(o.solar))).size, 6)
})

/* V5 */
test('V5: quét 1950-2150, không còn ngày âm 0 hoặc ngoài 1-30', () => {
  assert.equal(convertSolar2Lunar(7, 5, 2054).day, 30)
  assert.equal(convertSolar2Lunar(9, 4, 2062).day, 30)
  let prev = null
  for (let t = Date.UTC(1950, 0, 1); t < Date.UTC(2151, 0, 1); t += 864e5) {
    const d = new Date(t)
    const l = convertSolar2Lunar(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear())
    assert.ok(l.day >= 1 && l.day <= 30 && l.month >= 1 && l.month <= 12, `${d.toISOString()} -> ${l.day}`)
    if (prev) assert.ok(l.day === 1 || l.day === prev.day + 1, `${d.toISOString()} ngày âm không liên tục (${prev.day} -> ${l.day})`)
    prev = l
  }
})
test('V5: khớp mô-đun lịch của unit (trừ hai ngày unit còn lỗi)', async (t) => {
  const p = 'D:/9app.tech/unit/js/lib/lunar.js'
  if (!fs.existsSync(p)) return t.skip('không có unit')
  const U = await import('file:///' + p)
  const diff = []
  for (let ts = Date.UTC(1950, 0, 1); ts < Date.UTC(2151, 0, 1); ts += 864e5) {
    const d = new Date(ts)
    const a = convertSolar2Lunar(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear())
    const u = U.duongSangAm(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear())
    if (u.ngay !== a.day || u.thang !== a.month || u.nam !== a.year) diff.push(d.toISOString().slice(0, 10))
  }
  assert.deepEqual(diff, ['2054-05-07', '2062-04-09'])
})

/* V8 */
test('V8: lượng măng khô, móng giò khớp công thức; tất niên và Tết trỏ cả hai miền', () => {
  const ing = (id, ref) => mc.items.find((i) => i.id === id).ingredients.find((x) => x.ref === ref)
  assert.equal(ing('co-gio', 'mang-kho').qty, 0.1)
  assert.equal(ing('cung-tet-bac', 'mang-kho').qty, 0.1)
  assert.equal(ing('co-gio', 'mong-gio').qty, 0.5)
  for (const id of ['tat-nien', 'cung-tet-gia-tien']) {
    assert.deepEqual(item(id).mamIds, ['cung-tet-bac', 'cung-tet-nam'])
    for (const m of item(id).mamIds) assert.ok(mc.items.some((x) => x.id === m))
  }
})

/* V10 */
test('V10: mọi import tương đối, JSON và thẻ HTML cùng một số phiên bản', () => {
  const ver = /const VERSION = '(\d+)'/.exec(read('mod/app.js'))[1]
  for (const f of fs.readdirSync(path.join(ROOT, 'mod')).filter((n) => n.endsWith('.js'))) {
    for (const m of read(`mod/${f}`).matchAll(/from\s+'(\.\/[\w.-]+\.js)(\?v=(\d+))?'/g)) assert.equal(m[3], ver, `${f}: ${m[1]}`)
  }
  assert.match(read('mod/app.js'), /data\/\$\{name\}\?v=\$\{VERSION\}/)
  for (const f of ['index.html', '404.html']) {
    const h = read(f)
    assert.ok(h.includes(`mod/mod.css?v=${ver}`) && h.includes(`mod/app.js?v=${ver}`), f)
  }
})

/* V11 */
test('V11: tab Phong thủy không có từ khóa ngoài chức năng thật', () => {
  const idx = JSON.parse(read('search-index.json'))
  const e = idx.find((x) => x.path === '#/phong-thuy')
  for (const k of ['la bàn', 'la ban', 'hướng bếp', 'huong bep', 'hướng bàn thờ', 'huong ban tho']) assert.ok(!e.keywords.includes(k), k)
})

/* V12 */
test('V12: dữ liệu localStorage bị sửa tay không làm hỏng', () => {
  assert.ok(sameKind([], []) && !sameKind({}, []) && !sameKind(null, {}) && !sameKind([], {}) && !sameKind('a', 1) && !sameKind(NaN, 1))
  const mem = {}
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = String(v)), removeItem: (k) => delete mem[k] }
  mem.a = 'null'
  mem.b = '"x"'
  mem.c = '{bad'
  mem.d = '[1]'
  assert.deepEqual(store.get('a', {}), {})
  assert.deepEqual(store.get('b', []), [])
  assert.deepEqual(store.get('c', []), [])
  assert.deepEqual(store.get('d', []), [1])
  delete globalThis.localStorage
  const ok = { id: 'a', name: 'X', relation: 'cha', day: 15, month: 7 }
  assert.deepEqual(L.sanitizeGio([null, 5, ok, { id: 'b', name: '', day: 1, month: 1 }, { id: 'c', name: 'Y', day: 99, month: 1 }, { id: 'd', name: 'Z', day: 3, month: 13 }]), [ok])
  assert.deepEqual(L.sanitizeGio('xyz'), [])
  const v = L.buildVars(null, L.dateInfo({ year: 2026, month: 10, day: 4 }))
  assert.equal(v.ho_ten, undefined)
  const v2 = L.buildVars({ ho_ten: 5, dia_chi: 'a'.repeat(1000) }, L.dateInfo({ year: 2026, month: 10, day: 4 }))
  assert.equal(v2.dia_chi.length, 300)
  assert.equal(v2.ho_ten, undefined)
  const it = L.resolveItem(mc.items[0], mc.meta.catalog)
  const r = L.scaleItem(it, { people: 4, mam: 1 }, { ga: 1e30, huong: -5, hoa: 'abc' })
  assert.ok(Number.isFinite(r.total) && r.total <= 1e11)
  assert.equal(r.lines.find((l) => l.id === 'huong').unitPrice, 0)
})
