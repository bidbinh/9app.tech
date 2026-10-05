import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as L from '../mod/logic.js'
import { buildIndex } from '../scripts/build-search-index.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const json = (p) => JSON.parse(read(p))
const vk = json('mod/data/van-khan.json')
const mc = json('mod/data/mam-cung.json')
const index = json('search-index.json')

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0

test('văn khấn: số lượng và trường bắt buộc', () => {
  assert.ok(vk.items.length >= 15, `chỉ có ${vk.items.length} bài`)
  assert.ok(nonEmpty(vk.meta.disclaimer))
  const catIds = vk.meta.categories.map((c) => c.id)
  assert.equal(new Set(catIds).size, catIds.length)
  for (const it of vk.items) {
    for (const f of ['id', 'name', 'short', 'category', 'occasion', 'whenText', 'goodTime']) assert.ok(nonEmpty(it[f]), `${it.id}: thiếu ${f}`)
    assert.match(it.id, KEBAB)
    assert.ok(catIds.includes(it.category), `${it.id}: nhóm lạ ${it.category}`)
    assert.ok(Array.isArray(it.offerings) && it.offerings.length > 0 && it.offerings.every(nonEmpty), `${it.id}: đồ lễ`)
    assert.ok(Array.isArray(it.paragraphs) && it.paragraphs.length >= 5, `${it.id}: thiếu đoạn`)
    assert.ok(Array.isArray(it.notes), `${it.id}: notes`)
    assert.ok(it.when && ['monthly', 'yearly', 'yearEnd', 'custom', 'none'].includes(it.when.kind), `${it.id}: when`)
  }
})

test('văn khấn: id duy nhất', () => {
  const ids = vk.items.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(vk.items.map((i) => i.name)).size, vk.items.length)
})

test('văn khấn: quy tắc ngày hợp lệ và tính được ngày sắp tới', () => {
  const from = { year: 2026, month: 10, day: 4 }
  for (const it of vk.items) {
    const w = it.when
    if (w.kind === 'monthly') assert.ok(w.days.length > 0 && w.days.every((d) => d >= 1 && d <= 30), it.id)
    if (w.kind === 'yearly') assert.ok(w.month >= 1 && w.month <= 12 && w.day >= 1 && w.day <= 30, it.id)
    if (['monthly', 'yearly', 'yearEnd'].includes(w.kind)) {
      const o = L.nextOccurrence(w, from)
      assert.ok(o, `${it.id}: không tính được ngày`)
      assert.ok(L.dateKey(o.solar) >= L.dateKey(from))
    } else assert.equal(L.nextOccurrence(w, from), null)
  }
})

test('văn khấn: khối dùng chung và chỗ trống đều hợp lệ', () => {
  const blocks = vk.meta.blocks
  for (const [k, v] of Object.entries(blocks)) assert.ok(Array.isArray(v) && v.length && v.every(nonEmpty), `khối ${k}`)
  for (const it of vk.items) {
    const paras = L.resolveParagraphs(it.paragraphs, blocks)
    assert.ok(paras.every(nonEmpty), it.id)
    for (const p of paras) {
      for (const k of L.templateKeys(p)) assert.ok(L.FIELD_KEYS.includes(k), `${it.id}: khóa lạ {{${k}}}`)
      const rest = p.replace(/\{\{\s*[a-z_]+\s*\}\}/g, '')
      assert.ok(!rest.includes('{{') && !rest.includes('}}'), `${it.id}: ngoặc kép lỗi trong "${p}"`)
    }
    // điền đủ thì không còn chỗ trống
    const keys = [...new Set(paras.flatMap((p) => L.templateKeys(p)))]
    const vars = Object.fromEntries(keys.map((k) => [k, 'X']))
    const filled = paras.map((p) => L.fillTemplate(p, vars)).join('\n')
    assert.ok(!filled.includes(L.BLANK) && !filled.includes('{{'), it.id)
    // bài nào cũng kính cáo thần linh hoặc phật và có lời kết
    assert.match(paras.join('\n'), /Nam mô|Con kính lạy|Con xin lạy/, `${it.id}: thiếu lời mở đầu`)
    assert.match(paras.join('\n'), /Cẩn cáo|Nam mô A Di Đà Phật/, `${it.id}: thiếu lời kết`)
  }
})

test('văn khấn: bài giỗ có chỗ điền tên người mất, các bài đều điền được ngày', () => {
  const gio = vk.items.find((i) => i.id === 'gio')
  const keys = L.templateKeys(L.resolveParagraphs(gio.paragraphs, vk.meta.blocks).join('\n'))
  assert.ok(keys.includes('ten_nguoi_mat') && keys.includes('quan_he'))
  for (const it of vk.items) {
    const keys2 = L.templateKeys(L.resolveParagraphs(it.paragraphs, vk.meta.blocks).join('\n'))
    assert.ok(keys2.includes('ngay_am') || keys2.includes('ngay_le'), `${it.id}: không có ngày`)
  }
})

test('mâm cúng: danh mục nguyên liệu', () => {
  const groupIds = mc.meta.groups.map((g) => g.id)
  assert.ok(nonEmpty(mc.meta.priceNote) && /tham khảo/i.test(mc.meta.priceNote))
  for (const [id, c] of Object.entries(mc.meta.catalog)) {
    assert.match(id, KEBAB)
    assert.ok(nonEmpty(c.name) && nonEmpty(c.unit), id)
    assert.ok(groupIds.includes(c.group), `${id}: nhóm ${c.group}`)
    assert.ok(Number.isInteger(c.price) && c.price >= 0, `${id}: giá`)
  }
})

test('mâm cúng: mục hợp lệ, id duy nhất, không đụng đường dẫn riêng', () => {
  const ids = mc.items.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(mc.items.length >= 14)
  assert.ok(!ids.includes('ngu-qua') && !ids.includes('cong-thuc'))
  const vkIds = vk.items.map((i) => i.id)
  const recipeIds = mc.recipes.map((r) => r.id)
  for (const it of mc.items) {
    assert.match(it.id, KEBAB)
    for (const f of ['name', 'short', 'occasion']) assert.ok(nonEmpty(it[f]), `${it.id}: ${f}`)
    assert.ok(vkIds.includes(it.vanKhanId), `${it.id}: vanKhanId ${it.vanKhanId}`)
    assert.ok(typeof it.scale.people === 'boolean' && typeof it.scale.mam === 'boolean')
    assert.ok(Number.isInteger(it.defaults.people) && it.defaults.people >= 1)
    assert.ok(Number.isInteger(it.defaults.mam) && it.defaults.mam >= 1)
    if (it.scale.people && it.scale.mam) assert.ok(it.peoplePerMam >= 1, `${it.id}: peoplePerMam`)
    assert.ok(Array.isArray(it.notes) && Array.isArray(it.recipes))
    for (const r of it.recipes) assert.ok(recipeIds.includes(r), `${it.id}: công thức ${r}`)
    const refs = it.ingredients.map((x) => x.ref)
    assert.equal(new Set(refs).size, refs.length, `${it.id}: trùng nguyên liệu`)
    for (const ing of it.ingredients) {
      assert.ok(mc.meta.catalog[ing.ref], `${it.id}: thiếu ${ing.ref} trong danh mục`)
      assert.ok(ing.qty > 0, `${it.id}/${ing.ref}: qty`)
      assert.ok(['person', 'mam', 'fixed'].includes(ing.basis))
      if (ing.basis === 'person') assert.ok(it.scale.people, `${it.id}/${ing.ref}: tính theo người nhưng mục không bật số người`)
      if (ing.basis === 'mam') assert.ok(it.scale.mam, `${it.id}/${ing.ref}: tính theo mâm nhưng mục không bật số mâm`)
    }
    // tính thử với số mặc định ra số dương hữu hạn
    const r = L.scaleItem(L.resolveItem(it, mc.meta.catalog), it.defaults)
    assert.ok(Number.isFinite(r.total) && r.total > 0, `${it.id}: tổng tiền`)
  }
})

test('mâm cúng: mâm càng đông thì ngân sách không giảm', () => {
  const it = L.resolveItem(mc.items.find((i) => i.id === 'co-gio'), mc.meta.catalog)
  const a = L.scaleItem(it, { people: 6, mam: 1 }).total
  const b = L.scaleItem(it, { people: 12, mam: 2 }).total
  const c = L.scaleItem(it, { people: 30, mam: 5 }).total
  assert.ok(a < b && b < c)
})

test('công thức và mâm ngũ quả đủ trường', () => {
  const rids = mc.recipes.map((r) => r.id)
  assert.equal(new Set(rids).size, rids.length)
  assert.ok(mc.recipes.length >= 6)
  for (const r of mc.recipes) {
    assert.match(r.id, KEBAB)
    for (const f of ['name', 'serves', 'time']) assert.ok(nonEmpty(r[f]), `${r.id}: ${f}`)
    assert.ok(r.ingredients.length >= 3 && r.steps.length >= 3, r.id)
    assert.ok(Array.isArray(r.tips))
  }
  const regions = mc.nguQua.regions.map((r) => r.id)
  assert.deepEqual(regions, ['bac', 'trung', 'nam'])
  for (const r of mc.nguQua.regions) assert.ok(r.fruits.length >= 4 && nonEmpty(r.note))
})

test('chỉ mục tìm kiếm: trường bắt buộc, không trùng', () => {
  assert.ok(Array.isArray(index) && index.length > 40)
  const paths = index.map((e) => e.path)
  assert.equal(new Set(paths).size, paths.length, 'đường dẫn trùng')
  assert.equal(new Set(index.map((e) => e.name)).size, index.length, 'tên trùng')
  for (const e of index) {
    assert.deepEqual(Object.keys(e).sort(), ['blurb', 'keywords', 'name', 'path'], e.name)
    assert.ok(nonEmpty(e.name) && nonEmpty(e.blurb) && nonEmpty(e.path))
    assert.ok(Array.isArray(e.keywords) && e.keywords.length >= 4 && e.keywords.every(nonEmpty), e.name)
    assert.equal(new Set(e.keywords).size, e.keywords.length, `${e.name}: từ khóa trùng`)
    // mỗi từ khóa có dấu đều kèm bản không dấu
    for (const k of e.keywords) assert.ok(e.keywords.includes(L.fold(k)), `${e.name}: thiếu bản không dấu của "${k}"`)
    assert.ok(e.keywords.every((k) => k === k.toLowerCase()), `${e.name}: từ khóa phải chữ thường`)
  }
})

test('chỉ mục tìm kiếm: mọi đường dẫn trỏ tới màn hình có thật', () => {
  const vkIds = new Set(vk.items.map((i) => i.id))
  const mcIds = new Set([...mc.items.map((i) => i.id), 'ngu-qua'])
  const rIds = new Set(mc.recipes.map((r) => r.id))
  const tabs = new Set(['#/hom-nay', '#/lich', '#/xem-ngay', '#/phong-thuy', '#/van-khan', '#/mam-cung', '#/ve-noi-dung'])
  for (const e of index) {
    const { segs, q } = L.parseHash(e.path)
    assert.ok(e.path.startsWith('#/'), e.path)
    assert.equal([...q.keys()].length, 0)
    if (tabs.has(e.path)) continue
    if (segs[0] === 'van-khan') assert.ok(segs.length === 2 && vkIds.has(segs[1]), e.path)
    else if (segs[0] === 'mam-cung' && segs[1] === 'cong-thuc') assert.ok(segs.length === 3 && rIds.has(segs[2]), e.path)
    else if (segs[0] === 'mam-cung') assert.ok(segs.length === 2 && mcIds.has(segs[1]), e.path)
    else assert.fail(`đường dẫn lạ: ${e.path}`)
  }
})

test('chỉ mục tìm kiếm: phủ đủ mọi bài khấn, mâm cúng, công thức và bốn tab cũ', () => {
  const paths = new Set(index.map((e) => e.path))
  for (const p of ['#/hom-nay', '#/lich', '#/xem-ngay', '#/phong-thuy', '#/van-khan', '#/mam-cung', '#/ve-noi-dung', '#/mam-cung/ngu-qua']) assert.ok(paths.has(p), p)
  for (const i of vk.items) assert.ok(paths.has(`#/van-khan/${i.id}`), i.id)
  for (const i of mc.items) assert.ok(paths.has(`#/mam-cung/${i.id}`), i.id)
  for (const r of mc.recipes) assert.ok(paths.has(`#/mam-cung/cong-thuc/${r.id}`), r.id)
})

test('chỉ mục tìm kiếm: khớp từ khóa người dùng hay gõ', () => {
  const find = (q) => {
    const f = L.fold(q)
    return index.filter((e) => e.keywords.some((k) => k.includes(f) || f.includes(k))).map((e) => e.path)
  }
  assert.ok(find('van khan').includes('#/van-khan'))
  assert.ok(find('văn khấn').includes('#/van-khan'))
  assert.ok(find('gio').includes('#/van-khan/gio'))
  assert.ok(find('tân gia').includes('#/van-khan/tan-gia'))
  assert.ok(find('ram').includes('#/van-khan/ram-mung-1'))
  assert.ok(find('mam co').includes('#/mam-cung'))
  assert.ok(find('banh chung').includes('#/mam-cung/cong-thuc/banh-chung'))
  assert.ok(find('lich am').includes('#/hom-nay'))
  assert.ok(find('xem ngay').includes('#/xem-ngay'))
})

test('chỉ mục tìm kiếm đã khớp với dữ liệu (chạy build-search-index nếu lệch)', () => {
  assert.equal(read('search-index.json'), JSON.stringify(buildIndex(), null, 2) + '\n')
})

/** Tên tệp js/css của bản dựng, đọc từ index.html (tên có mã băm đổi sau mỗi lần build). */
function builtAssets() {
  const html = read('index.html')
  return [...html.matchAll(/\/vannien\/(assets\/[\w.-]+\.(?:js|css))/g)].map((m) => m[1])
}

test('trang chính đã gắn mô-đun và các tệp cần thiết có thật', () => {
  for (const f of ['index.html', '404.html']) {
    const html = read(f)
    assert.match(html, /\/vannien\/mod\/mod\.css/)
    assert.match(html, /\/vannien\/mod\/app\.js/)
    assert.match(html, /\/vannien\/assets\/index-[\w-]+\.js/, 'bản dựng phải còn nguyên')
  }
  for (const f of ['mod/app.js', 'mod/mod.css', 'mod/logic.js', 'mod/lunar.js', 'mod/ui.js', 'mod/speech.js', 'mod/vankhan.js', 'mod/mam.js', 'mod/data/van-khan.json', 'mod/data/mam-cung.json', 'search-index.json', ...builtAssets()]) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f)
  }
})
