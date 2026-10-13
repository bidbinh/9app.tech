import test from 'node:test'
import assert from 'node:assert/strict'
import * as L from '../mod/logic.js'
import { chunkText } from '../mod/speech.js'

const iso = (o) => L.toISO(o.solar || o)

test('fold bỏ dấu và hạ chữ thường', () => {
  assert.equal(L.fold('Văn khấn'), 'van khan')
  assert.equal(L.fold('Đầy tháng Đức'), 'day thang duc')
  assert.equal(L.fold('MÂM CÚNG'), 'mam cung')
})

test('can chi của năm âm lịch', () => {
  assert.equal(L.canChiYear(2024), 'Giáp Thìn')
  assert.equal(L.canChiYear(2025), 'Ất Tỵ')
  assert.equal(L.canChiYear(2026), 'Bính Ngọ')
  assert.equal(L.canChiYear(2027), 'Đinh Mùi')
})

test('đổi âm sang dương khớp các mốc đã biết', () => {
  assert.equal(iso(L.lunarToSolar(1, 1, 2025)), '2025-01-29') // Tết Ất Tỵ
  assert.equal(iso(L.lunarToSolar(15, 8, 2025)), '2025-10-06') // Trung thu 2025
  assert.equal(iso(L.lunarToSolar(1, 1, 2026)), '2026-02-17') // Tết Bính Ngọ
  assert.equal(iso(L.lunarToSolar(15, 8, 2026)), '2026-09-25') // Trung thu 2026
  assert.equal(iso(L.lunarToSolar(1, 1, 2027)), '2027-02-06') // Tết Đinh Mùi
})

test('ngày không tồn tại (tháng thiếu không có ngày 30) trả về null', () => {
  assert.equal(L.lunarToSolar(30, 12, 2025), null)
  assert.equal(iso(L.lastDayOfLunarMonth(12, 2025)), '2026-02-16')
  assert.equal(iso(L.lunarYearEnd(2026)), '2027-02-05')
})

test('chiều ngược lại: dương sang âm cho ngày giữa chừng', () => {
  const info = L.dateInfo({ year: 2026, month: 10, day: 4 })
  assert.equal(info.ngay_am, '24')
  assert.equal(info.thang_am, '8')
  assert.equal(info.nam_cc, 'Bính Ngọ')
  assert.equal(info.ngay_duong, '04/10/2026')
  assert.equal(info.ngay_le, 'ngày 24')
  assert.equal(L.dateInfo({ year: 2026, month: 9, day: 25 }).ngay_le, 'ngày Rằm')
  assert.equal(L.dateInfo({ year: 2026, month: 10, day: 10 }).ngay_le, 'ngày mùng Một')
  assert.equal(L.dateInfo({ year: 2026, month: 2, day: 17 }).nam_cc, 'Bính Ngọ')
  assert.equal(L.dateInfo({ year: 2026, month: 2, day: 16 }).nam_cc, 'Ất Tỵ') // giao thừa vẫn thuộc năm cũ
})

test('ngày Rằm và mùng Một sắp tới, theo thứ tự tăng dần', () => {
  const from = { year: 2026, month: 10, day: 4 }
  const list = L.occurrences({ kind: 'monthly', days: [1, 15] }, from, 6)
  assert.deepEqual(list.slice(0, 4).map(iso), ['2026-10-10', '2026-10-24', '2026-11-09', '2026-11-23'])
  assert.equal(list.length, 6)
  for (let i = 1; i < list.length; i++) assert.ok(L.dateKey(list[i].solar) > L.dateKey(list[i - 1].solar))
  for (const o of list) {
    const d = L.dateInfo(o.solar).lunar
    assert.ok(d.day === 1 || d.day === 15, `ngày âm ${d.day}`)
  }
})

test('hôm nay đúng ngày Rằm thì tính luôn hôm nay', () => {
  const o = L.nextOccurrence({ kind: 'monthly', days: [1, 15] }, { year: 2026, month: 9, day: 25 })
  assert.equal(iso(o), '2026-09-25')
  const after = L.nextOccurrence({ kind: 'monthly', days: [1, 15] }, { year: 2026, month: 9, day: 26 })
  assert.equal(iso(after), '2026-10-10')
})

test('ngày hằng năm: ông Công ông Táo, Rằm tháng Bảy, mùng Một Tết', () => {
  const from = { year: 2026, month: 10, day: 4 }
  assert.equal(iso(L.nextOccurrence({ kind: 'yearly', month: 12, day: 23 }, from)), '2027-01-30')
  assert.equal(iso(L.nextOccurrence({ kind: 'yearly', month: 1, day: 1 }, from)), '2027-02-06')
  const ram7 = L.nextOccurrence({ kind: 'yearly', month: 7, day: 15 }, from)
  assert.equal(L.dateInfo(ram7.solar).lunar.month, 7)
  assert.equal(L.dateInfo(ram7.solar).lunar.day, 15)
  assert.equal(ram7.solar.year, 2027)
})

test('giao thừa, tất niên: ngày cuối năm âm lịch', () => {
  const from = { year: 2026, month: 10, day: 4 }
  assert.equal(iso(L.nextOccurrence({ kind: 'yearEnd' }, from)), '2027-02-05')
  assert.equal(iso(L.nextOccurrence({ kind: 'yearEnd' }, { year: 2026, month: 2, day: 1 })), '2026-02-16')
})

test('ngày giỗ kế tiếp, cả ngày 30 ở tháng thiếu', () => {
  const from = { year: 2026, month: 10, day: 4 }
  const g = L.nextGio(15, 7, from)
  assert.equal(g.lunarDay, 15)
  assert.equal(g.lunarMonth, 7)
  assert.ok(L.dateKey(g.solar) >= L.dateKey(from))
  // sau giỗ năm nay thì sang năm sau
  const g2 = L.nextGio(15, 8, { year: 2026, month: 9, day: 26 })
  assert.equal(g2.solar.year, 2027)
  // giỗ 30 tháng Chạp mà tháng thiếu: lùi về ngày cuối tháng (29)
  assert.equal(iso(L.nextGio(30, 12, { year: 2025, month: 12, day: 1 })), '2026-02-16')
})

test('không có quy tắc thì không có ngày', () => {
  assert.deepEqual(L.occurrences({ kind: 'none' }, { year: 2026, month: 1, day: 1 }, 3), [])
  assert.deepEqual(L.occurrences({ kind: 'custom' }, { year: 2026, month: 1, day: 1 }, 3), [])
  assert.equal(L.nextOccurrence(undefined, { year: 2026, month: 1, day: 1 }), null)
})

test('ngày ISO và khoảng cách ngày', () => {
  assert.deepEqual(L.fromISO('2026-10-04'), { year: 2026, month: 10, day: 4 })
  assert.equal(L.fromISO('2026-02-30'), null)
  assert.equal(L.fromISO('abc'), null)
  assert.equal(L.fromISO(null), null)
  assert.equal(L.diffDays({ year: 2026, month: 10, day: 4 }, { year: 2026, month: 10, day: 10 }), 6)
  assert.equal(L.relativeDays({ year: 2026, month: 10, day: 4 }, { year: 2026, month: 10, day: 4 }), 'hôm nay')
  assert.equal(L.relativeDays({ year: 2026, month: 10, day: 4 }, { year: 2026, month: 10, day: 5 }), 'ngày mai')
  assert.equal(L.relativeDays({ year: 2026, month: 10, day: 4 }, { year: 2026, month: 10, day: 10 }), 'còn 6 ngày')
})

test('điền chỗ trống: giá trị, chỗ trống, khoảng trắng', () => {
  const t = 'Tín chủ con là {{ho_ten}}, ngụ tại {{dia_chi}}. Hôm nay ngày {{ngay_am}}.'
  assert.equal(L.fillTemplate(t, { ho_ten: ' Nguyễn Văn An ', dia_chi: 'Hà Nội', ngay_am: '15' }), 'Tín chủ con là Nguyễn Văn An, ngụ tại Hà Nội. Hôm nay ngày 15.')
  assert.equal(L.fillTemplate(t, { ho_ten: 'An' }), `Tín chủ con là An, ngụ tại ${L.BLANK}. Hôm nay ngày ${L.BLANK}.`)
  assert.equal(L.fillTemplate(t, { ho_ten: '   ' }).startsWith(`Tín chủ con là ${L.BLANK}`), true)
  assert.equal(L.fillTemplate('{{ khong_co }}', {}), L.BLANK)
  assert.equal(L.fillTemplate('Không có chỗ trống', {}), 'Không có chỗ trống')
})

test('fillSegments phân loại chữ, giá trị, chỗ trống', () => {
  const segs = L.fillSegments('A {{ho}} B {{ten_be}} C', { ho: 'Trần' })
  assert.deepEqual(segs.map((s) => s.kind), ['text', 'val', 'text', 'blank', 'text'])
  assert.equal(segs[1].text, 'Trần')
  assert.equal(segs[3].key, 'ten_be')
  assert.equal(segs.map((s) => s.text).join(''), `A Trần B ${L.BLANK} C`)
})

test('templateKeys và resolveParagraphs', () => {
  assert.deepEqual(L.templateKeys('{{a_b}} và {{c}} và {{a_b}}'), ['a_b', 'c'])
  const blocks = { x: ['một', 'hai {{ho}}'] }
  assert.deepEqual(L.resolveParagraphs(['đầu', '@x', 'cuối'], blocks), ['đầu', 'một', 'hai {{ho}}', 'cuối'])
  assert.throws(() => L.resolveParagraphs(['@khong-co'], blocks))
})

test('chữ để máy đọc bỏ chỗ trống', () => {
  assert.ok(!L.speechText(`Con là ${L.BLANK}, ngụ tại ${L.BLANK}`).includes('…'))
})

const catalog = {
  ga: { name: 'Gà', group: 'thit-ca', unit: 'con', price: 250000 },
  nep: { name: 'Gạo nếp', group: 'do-kho', unit: 'kg', price: 40000 },
  hoa: { name: 'Hoa', group: 'do-le', unit: 'bó', price: 80000 },
  mut: { name: 'Mứt', group: 'do-le', unit: 'kg', price: 100000 },
}
const sample = L.resolveItem(
  {
    id: 't',
    name: 'Mâm thử',
    ingredients: [
      { ref: 'ga', qty: 1, basis: 'mam' },
      { ref: 'nep', qty: 0.1, basis: 'person' },
      { ref: 'hoa', qty: 1, basis: 'fixed' },
      { ref: 'mut', qty: 0.5, basis: 'fixed', defaultOff: true },
    ],
  },
  catalog,
)

test('tính lượng theo số người và số mâm', () => {
  const r = L.scaleItem(sample, { people: 12, mam: 2 })
  const by = Object.fromEntries(r.lines.map((l) => [l.id, l]))
  assert.equal(by.ga.qty, 2)
  assert.equal(by.nep.qty, 1.2) // 0,1 x 12 không bị lệch số thực
  assert.equal(by.hoa.qty, 1)
  assert.equal(by.mut.on, false)
  assert.equal(by.mut.cost, 0)
  assert.equal(r.total, 2 * 250000 + 1.2 * 40000 + 80000)
})

test('làm tròn lên: nguyên liệu đếm được tròn đơn vị, cân nặng tròn 0,05 kg', () => {
  const r = L.scaleItem(sample, { people: 7, mam: 1 })
  const by = Object.fromEntries(r.lines.map((l) => [l.id, l]))
  assert.equal(by.nep.qty, 0.7)
  const r2 = L.scaleItem(sample, { people: 1, mam: 3 })
  assert.equal(Object.fromEntries(r2.lines.map((l) => [l.id, l])).ga.qty, 3)
  assert.equal(L.roundUp(0.31, 0.05), 0.35)
  assert.equal(L.roundUp(1.2000000000000002, 0.05), 1.2)
  assert.equal(L.roundUp(2.01, 1), 3)
})

test('đơn giá người dùng sửa và bật tắt từng món', () => {
  const r = L.scaleItem(sample, { people: 12, mam: 2 }, { ga: 300000, nep: '' }, { mut: true, hoa: false })
  const by = Object.fromEntries(r.lines.map((l) => [l.id, l]))
  assert.equal(by.ga.unitPrice, 300000)
  assert.equal(by.ga.customPrice, true)
  assert.equal(by.nep.customPrice, false) // ô trống thì dùng giá mặc định
  assert.equal(by.nep.unitPrice, 40000)
  assert.equal(by.mut.on, true)
  assert.equal(by.mut.cost, 50000)
  assert.equal(by.hoa.on, false)
  assert.equal(r.total, 2 * 300000 + 1.2 * 40000 + 50000)
})

test('số lượng 0 hoặc không hợp lệ không gây lỗi', () => {
  const r = L.scaleItem(sample, { people: 0, mam: 'abc' })
  assert.ok(r.total >= 0)
  assert.ok(r.lines.every((l) => Number.isFinite(l.cost)))
})

test('thiếu nguyên liệu trong danh mục thì báo lỗi', () => {
  assert.throws(() => L.resolveItem({ ingredients: [{ ref: 'khong-co', qty: 1, basis: 'fixed' }] }, catalog))
})

test('định dạng số lượng và tiền', () => {
  assert.equal(L.formatQty(0.3, 'kg'), '300 g')
  assert.equal(L.formatQty(1.5, 'kg'), '1,5 kg')
  assert.equal(L.formatQty(2, 'con'), '2 con')
  assert.equal(L.formatQty(0.5, 'lít'), '500 ml')
  assert.equal(L.formatVnd(1529000), '1.529.000 đ')
  assert.equal(L.formatVnd(0), '0 đ')
  assert.equal(L.formatVnd(999), '999 đ')
})

test('văn bản danh sách đi chợ để chia sẻ', () => {
  const groups = [
    { id: 'thit-ca', label: 'Thịt, cá' },
    { id: 'do-kho', label: 'Đồ khô' },
    { id: 'do-le', label: 'Đồ lễ' },
  ]
  const scaled = L.scaleItem(sample, { people: 12, mam: 2 })
  const text = L.shoppingText(sample, scaled, groups, { ga: true }, { people: 12, mam: 2, extras: [{ id: 'x1', name: 'Bia', cost: 100000 }] })
  assert.match(text, /Mâm thử/)
  assert.match(text, /\[x\] Gà: 2 con/)
  assert.match(text, /\[ \] Gạo nếp: 1,2 kg/)
  assert.match(text, /Bia/)
  assert.ok(!text.includes('Mứt')) // món đang tắt không vào danh sách
  assert.match(text, /Ngân sách ước tính: /)
})

test('từ khóa có dấu và không dấu, không trùng', () => {
  const k = L.expandKeywords(['Văn khấn', 'van khan', 'Rằm'])
  assert.deepEqual(k, ['văn khấn', 'van khan', 'rằm', 'ram'])
})

test('đường dẫn hash', () => {
  assert.deepEqual(L.parseHash('#/van-khan').segs, ['van-khan'])
  const p = L.parseHash('#/van-khan/gio?p=abc&d=2026-10-24')
  assert.deepEqual(p.segs, ['van-khan', 'gio'])
  assert.equal(p.q.get('p'), 'abc')
  assert.equal(p.q.get('d'), '2026-10-24')
  assert.deepEqual(L.parseHash('').segs, [])
  assert.deepEqual(L.parseHash('#').segs, [])
  assert.deepEqual(L.parseHash('#/mam-cung/cong-thuc/banh-chung').segs, ['mam-cung', 'cong-thuc', 'banh-chung'])
  assert.deepEqual(L.parseHash('#/a%20b').segs, ['a b'])
})

test('chia câu để đọc to', () => {
  const long = 'Con kính lạy ngài. ' + 'rất dài '.repeat(60) + 'kết thúc.'
  const chunks = chunkText(long, 120)
  assert.ok(chunks.length > 2)
  assert.ok(chunks.every((c) => c.length <= 130))
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').includes('Con kính lạy ngài.'), true)
  assert.deepEqual(chunkText('Một câu.'), ['Một câu.'])
  assert.deepEqual(chunkText(''), [])
})
