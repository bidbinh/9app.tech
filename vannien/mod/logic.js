/**
 * Logic thuần cho mô-đun Văn khấn và Mâm cúng của Vạn Niên.
 * Không đụng DOM, chạy được cả trong trình duyệt lẫn Node (để kiểm thử).
 */
import {
  convertLunar2Solar,
  convertSolar2Lunar,
  getFullDate,
  CAN,
  CHI,
  yearCanIndex,
  yearChiIndex,
  addDays,
  WEEKDAYS,
} from './lunar.js?v=2'

/* ---------- Chữ ---------- */

/** Bỏ dấu tiếng Việt, hạ chữ thường: "Văn khấn" -> "van khan". */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

/** Tên can chi của một năm âm lịch: 2026 -> "Bính Ngọ". */
export function canChiYear(lunarYear) {
  return `${CAN[yearCanIndex(lunarYear)]} ${CHI[yearChiIndex(lunarYear)]}`
}

/* ---------- Đường dẫn hash ---------- */

export function parseHash(hash) {
  const m = /^#\/?([^?]*)(?:\?(.*))?$/.exec(hash || '')
  if (!m) return { segs: [], q: new URLSearchParams() }
  const segs = m[1]
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
  return { segs, q: new URLSearchParams(m[2] || '') }
}

/* ---------- Ngày tháng ---------- */

const pad = (n) => String(n).padStart(2, '0')
export const dateKey = (d) => d.year * 10000 + d.month * 100 + d.day
export const toISO = (d) => `${d.year}-${pad(d.month)}-${pad(d.day)}`
export function fromISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  const d = { year: +m[1], month: +m[2], day: +m[3] }
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day))
  if (t.getUTCFullYear() !== d.year || t.getUTCMonth() !== d.month - 1 || t.getUTCDate() !== d.day) return null
  return d
}
export const formatDMY = (d) => `${pad(d.day)}/${pad(d.month)}/${d.year}`

/** Số ngày từ a đến b (b - a), cả hai là {year,month,day}. */
export function diffDays(a, b) {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000)
}

/**
 * Đổi một ngày âm lịch (không nhuận) sang dương lịch, chỉ trả về nếu ngày đó
 * thật sự tồn tại (tháng thiếu không có ngày 30). Sai thì trả null.
 */
export function lunarToSolar(day, month, lunarYear, leap = 0) {
  const s = convertLunar2Solar(day, month, lunarYear, leap ? 1 : 0)
  if (!s || !s.day) return null
  const back = convertSolar2Lunar(s.day, s.month, s.year)
  if (back.day !== day || back.month !== month || back.year !== lunarYear || (back.leap ? 1 : 0) !== (leap ? 1 : 0)) return null
  return s
}

/** Ngày cuối cùng của tháng âm lịch (29 hoặc 30), trả về dương lịch. */
export function lastDayOfLunarMonth(month, lunarYear) {
  return lunarToSolar(30, month, lunarYear) || lunarToSolar(29, month, lunarYear)
}

/** Ngày cuối năm âm lịch (30 hoặc 29 tháng Chạp) của năm âm lịch cho trước. */
export function lunarYearEnd(lunarYear) {
  return lastDayOfLunarMonth(12, lunarYear)
}

/**
 * Các ngày dương lịch ứng với một quy tắc, xếp tăng dần, bắt đầu từ `from` (bao gồm).
 * rule:
 *  {kind:'monthly', days:[1,15]}      mỗi tháng âm
 *  {kind:'yearly', month:7, day:15}   mỗi năm
 *  {kind:'yearEnd'}                   ngày cuối năm âm lịch (30 hoặc 29 tháng Chạp)
 *  {kind:'none'} / {kind:'custom'}    không có ngày cố định
 */
export function occurrences(rule, from, count = 1) {
  if (!rule || rule.kind === 'none' || rule.kind === 'custom') return []
  const fromLunarYear = convertSolar2Lunar(from.day, from.month, from.year).year
  const found = []
  const seen = new Set()
  const push = (s, lunarDay, lunarMonth, leap = 0) => {
    if (!s || dateKey(s) < dateKey(from)) return
    const k = dateKey(s)
    if (seen.has(k)) return
    seen.add(k)
    found.push({ solar: s, lunarDay, lunarMonth, leap })
  }
  for (let ly = fromLunarYear - 1; ly <= fromLunarYear + 2; ly++) {
    if (rule.kind === 'monthly') {
      // mùng Một, Rằm cũng rơi vào tháng nhuận (nếu năm đó có), nên tính cả hai
      for (let m = 1; m <= 12; m++) {
        for (const d of rule.days) {
          push(lunarToSolar(d, m, ly), d, m)
          push(lunarToSolar(d, m, ly, 1), d, m, 1)
        }
      }
    } else if (rule.kind === 'yearly') {
      push(lunarToSolar(rule.day, rule.month, ly), rule.day, rule.month)
    } else if (rule.kind === 'yearEnd') {
      const s = lunarYearEnd(ly)
      if (s) {
        const l = convertSolar2Lunar(s.day, s.month, s.year)
        push(s, l.day, 12)
      }
    }
  }
  found.sort((a, b) => dateKey(a.solar) - dateKey(b.solar))
  return found.slice(0, count)
}

export function nextOccurrence(rule, from) {
  return occurrences(rule, from, 1)[0] || null
}

/** Ngày giỗ kế tiếp: ngày/tháng âm do người dùng nhập (không tính tháng nhuận). Tháng thiếu thì lùi về 29. */
export function nextGio(lunarDay, lunarMonth, from) {
  let r = nextOccurrence({ kind: 'yearly', day: lunarDay, month: lunarMonth }, from)
  if (lunarDay === 30) {
    // năm có tháng đủ thì dùng 30, tháng thiếu thì dùng 29 (cúng vào ngày cuối tháng)
    const cands = []
    const ly = convertSolar2Lunar(from.day, from.month, from.year).year
    for (let y = ly - 1; y <= ly + 2; y++) {
      const s = lastDayOfLunarMonth(lunarMonth, y)
      if (s && dateKey(s) >= dateKey(from)) cands.push({ solar: s, lunarDay: 30, lunarMonth })
    }
    cands.sort((a, b) => dateKey(a.solar) - dateKey(b.solar))
    r = cands[0] || r
  }
  return r
}

/** Thông tin ngày dùng để điền vào bài khấn. */
export function dateInfo(solar) {
  const info = getFullDate(solar.year, solar.month, solar.day)
  const l = info.lunar
  const ngayLe = l.day === 1 ? 'ngày mùng Một' : l.day === 15 ? 'ngày Rằm' : l.day <= 10 ? `ngày mùng ${l.day}` : `ngày ${l.day}`
  const viaTT = !l.leap && l.month === 1 && l.day === 10 ? 'ngày vía Thần Tài (mùng 10 tháng Giêng)' : ngayLe
  return {
    solar,
    lunar: l,
    ngay_am: l.day <= 10 ? `mùng ${l.day}` : String(l.day),
    thang_am: (l.month === 1 ? 'Giêng' : l.month === 12 ? 'Chạp' : String(l.month)) + (l.leap ? ' (nhuận)' : ''),
    nam_cc: canChiYear(l.year),
    ngay_duong: formatDMY(solar),
    ngay_le: ngayLe,
    ngay_le_tt: viaTT,
    ngay_cc: info.canChi.day.text,
    thu: info.weekdayName,
    lunarText: `${lunarShort(l)} âm lịch năm ${canChiYear(l.year)}`,
  }
}

/** "15/6 nhuận" hoặc "15/8". */
export function lunarShort(l) {
  return `${l.day}/${l.month}${l.leap ? ' nhuận' : ''}`
}

/** Hôm nay theo giờ Việt Nam. */
export function vnToday(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return { year: +parts.year, month: +parts.month, day: +parts.day }
}

/** "còn 3 ngày", "hôm nay", "ngày mai". */
export function relativeDays(from, to) {
  const n = diffDays(from, to)
  if (n === 0) return 'hôm nay'
  if (n === 1) return 'ngày mai'
  return `còn ${n} ngày`
}

export { addDays, WEEKDAYS, convertSolar2Lunar, convertLunar2Solar, getFullDate }

/* ---------- Quan hệ với người được cúng ---------- */

/** Nhóm quan hệ: cha-me, ong-ba, tren (cô, chú, bác, dì, cậu), ngang (anh, chị, em, vợ, chồng), khac. */
export function relationGroup(rel) {
  const f = fold(rel).trim()
  if (/^(cha|me|bo|ma|than phu|than mau)( |$)/.test(f)) return 'cha-me'
  if (/^(ong|ba|cu)( |$)/.test(f)) return 'ong-ba'
  if (/^(co|chu|bac|di|cau|thim|duong|mo)( |$)/.test(f)) return 'tren'
  if (/^(anh|chi|em|vo|chong)( |$)/.test(f)) return 'ngang'
  return 'khac'
}

const NHO = {
  'cha-me': 'Con cháu nhớ ơn sinh thành dưỡng dục, công cha nghĩa mẹ như trời biển,',
  'ong-ba': 'Con cháu nhớ công ơn ông bà gây dựng nếp nhà, nuôi dạy con cháu,',
  tren: 'Con cháu nhớ tình thương yêu, dìu dắt và công ơn của bậc bề trên,',
  ngang: 'Gia đình nhớ tình ruột thịt, nghĩa tình gắn bó khi còn sống,',
  khac: 'Gia đình nhớ tình nghĩa gắn bó,',
}
const XIN_TREN = 'phù hộ độ trì cho con cháu trong nhà mạnh khỏe, bình an, hòa thuận, làm ăn tiến tới, sống theo nếp nhà tử tế.'
const XIN_KHAC = 'an nghỉ nơi cõi trên, và che chở cho gia đình mạnh khỏe, bình an, hòa thuận, sống theo nếp nhà tử tế.'

/** Lời lẽ phù hợp với quan hệ: bậc trên thì nhớ ơn nuôi dạy, ngang hàng và người thân thì nhớ tình nghĩa. */
export function relationPhrases(rel) {
  const g = relationGroup(rel)
  const upper = g === 'cha-me' || g === 'ong-ba' || g === 'tren'
  return { group: g, xung_ho: upper ? 'Con cháu' : 'Gia đình', loi_nho: NHO[g], loi_xin: upper ? XIN_TREN : XIN_KHAC }
}

const firstWord = (s) => String(s || '').trim().split(/s+/)[0] || ''

/** Gộp thông tin người dùng nhập, người được cúng và ngày thành bảng giá trị để điền bài khấn. */
export function buildVars(profile, info, person) {
  const vars = {}
  for (const [k, v] of Object.entries(profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {})) {
    if (typeof v === 'string') vars[k] = v.slice(0, 300)
  }
  if (!String(vars.ho || '').trim()) vars.ho = firstWord(vars.ho_ten)
  if (person) {
    vars.ten_nguoi_mat = person.name
    vars.quan_he = person.relation
  }
  const rp = relationPhrases(vars.quan_he)
  return { ...vars, xung_ho: rp.xung_ho, loi_nho: rp.loi_nho, loi_xin: rp.loi_xin, ...info }
}

/** Lọc danh sách ngày giỗ lưu trong máy: bỏ phần tử hỏng do sửa tay. */
export function sanitizeGio(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim())
    .map((p) => ({ id: p.id, name: p.name.slice(0, 120), relation: typeof p.relation === 'string' ? p.relation.slice(0, 40) : 'người thân', day: Number(p.day), month: Number(p.month) }))
    .filter((p) => Number.isInteger(p.day) && p.day >= 1 && p.day <= 30 && Number.isInteger(p.month) && p.month >= 1 && p.month <= 12)
}

/* ---------- Điền chỗ trống trong bài khấn ---------- */

export const BLANK = '……………'
export const AUTO_KEYS = ['ngay_am', 'thang_am', 'nam_cc', 'ngay_duong', 'ngay_le', 'ngay_le_tt', 'ngay_cc', 'xung_ho', 'loi_nho', 'loi_xin']
export const FIELD_LABELS = {
  ho_ten: 'Họ tên gia chủ',
  ho: 'Họ của dòng tộc (ví dụ: Nguyễn)',
  dia_chi: 'Địa chỉ',
  ten_nguoi_mat: 'Tên người được cúng',
  quan_he: 'Quan hệ (ví dụ: cha, mẹ, ông nội)',
  ten_be: 'Tên bé',
  cha_me: 'Tên cha mẹ của bé',
  ngay_sinh_be: 'Ngày sinh của bé',
  ten_co_so: 'Tên cửa hàng, công ty',
  ten_xe: 'Loại xe',
  bien_so: 'Biển số xe',
  ten_chua: 'Tên chùa',
  ngay_am: 'Ngày âm lịch',
  thang_am: 'Tháng âm lịch',
  nam_cc: 'Năm âm lịch (can chi)',
  ngay_duong: 'Ngày dương lịch',
  ngay_le: 'Tên ngày lễ',
  ngay_le_tt: 'Tên ngày lễ (có vía Thần Tài)',
  xung_ho: 'Cách xưng hô theo quan hệ',
  loi_nho: 'Lời nhớ ơn theo quan hệ',
  loi_xin: 'Lời cầu theo quan hệ',
  ngay_cc: 'Can chi của ngày',
}
export const FIELD_KEYS = Object.keys(FIELD_LABELS)

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g

/** Các khóa {{...}} có trong một đoạn chữ. */
export function templateKeys(text) {
  const out = []
  for (const m of String(text).matchAll(TOKEN)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Tách đoạn chữ thành các mảnh: chữ thường, chỗ đã điền, chỗ còn trống. */
export function fillSegments(text, vars = {}) {
  const segs = []
  let last = 0
  const s = String(text)
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > last) segs.push({ kind: 'text', text: s.slice(last, m.index) })
    const v = String(vars[m[1]] ?? '').trim()
    segs.push(v ? { kind: 'val', text: v, key: m[1] } : { kind: 'blank', text: BLANK, key: m[1] })
    last = m.index + m[0].length
  }
  if (last < s.length) segs.push({ kind: 'text', text: s.slice(last) })
  return segs
}

export function fillTemplate(text, vars = {}) {
  return fillSegments(text, vars)
    .map((x) => x.text)
    .join('')
}

/** Ghép các đoạn `@tên-khối` với kho khối dùng chung. */
export function resolveParagraphs(paragraphs, blocks = {}) {
  const out = []
  for (const p of paragraphs) {
    if (typeof p === 'string' && p.startsWith('@')) {
      const b = blocks[p.slice(1)]
      if (!b) throw new Error(`Thiếu khối dùng chung: ${p}`)
      out.push(...b)
    } else out.push(p)
  }
  return out
}

/** Chữ để máy đọc: bỏ chỗ trống, bỏ dấu ba chấm. */
export function speechText(text) {
  return String(text).replaceAll(BLANK, ', ').replace(/…+/g, ', ').replace(/\(\s*(ba|3)\s*lần\s*\)/gi, '(ba lần)')
}

/* ---------- Mâm cúng: tính lượng và tiền ---------- */

export const MAX_PRICE = 1e9

export function stepOf(ing) {
  if (ing.step) return ing.step
  return ing.unit === 'kg' || ing.unit === 'lít' ? 0.05 : 1
}

/** Làm tròn lên theo bước nhỏ nhất (0,05 kg hoặc 1 đơn vị đếm được). */
export function roundUp(qty, step) {
  const v = Math.ceil(qty / step - 1e-9) * step
  return Math.round(v * 1000) / 1000
}

/** Ghép mục mâm cúng với danh mục nguyên liệu dùng chung (đơn vị, nhóm, đơn giá mặc định). */
export function resolveItem(raw, catalog) {
  const ingredients = raw.ingredients.map((r) => {
    const c = catalog[r.ref]
    if (!c) throw new Error(`Thiếu nguyên liệu trong danh mục: ${r.ref}`)
    return {
      id: r.ref,
      name: r.name || c.name,
      group: c.group,
      unit: c.unit,
      price: c.price,
      step: c.step,
      qty: r.qty,
      basis: r.basis,
      note: r.note || '',
      defaultOff: !!r.defaultOff,
    }
  })
  return { ...raw, ingredients }
}

/**
 * Tính lượng cho từng nguyên liệu theo số người và số mâm.
 * basis: 'person' nhân theo số người, 'mam' nhân theo số mâm, 'fixed' không đổi.
 * prices: đơn giá do người dùng sửa, ví dụ { ga: 300000 }.
 * off: bật tắt từng món, ví dụ { ga: false } là bỏ món đó; không ghi thì theo mặc định của mục.
 */
export function scaleItem(item, { people = 1, mam = 1 } = {}, prices = {}, off = {}) {
  const P = Math.max(0, Number(people) || 0)
  const M = Math.max(0, Number(mam) || 0)
  const lines = item.ingredients.map((ing) => {
    const factor = ing.basis === 'person' ? P : ing.basis === 'mam' ? M : 1
    const raw = ing.qty * factor
    const qty = raw <= 0 ? 0 : roundUp(raw, stepOf(ing))
    const hasCustom = prices[ing.id] !== undefined && prices[ing.id] !== null && prices[ing.id] !== ''
    const unitPrice = hasCustom ? Math.min(MAX_PRICE, Math.max(0, Number(prices[ing.id]) || 0)) : ing.price
    const on = off[ing.id] === undefined ? !ing.defaultOff : !!off[ing.id]
    return { ...ing, qty, unitPrice, customPrice: hasCustom, on, cost: on ? Math.round(qty * unitPrice) : 0 }
  })
  const total = lines.reduce((s, l) => s + l.cost, 0)
  return { lines, total }
}

/** 0,3 kg -> "300 g"; 1,5 kg -> "1,5 kg"; 2 con -> "2 con". */
export function formatQty(qty, unit) {
  if (unit === 'kg' && qty < 1) return `${Math.round(qty * 1000)} g`
  if (unit === 'lít' && qty < 1) return `${Math.round(qty * 1000)} ml`
  const s = String(Math.round(qty * 100) / 100).replace('.', ',')
  return `${s} ${unit}`
}

export function formatVnd(n) {
  return `${Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`
}

export function groupLines(lines, groups) {
  return groups
    .map((g) => ({ ...g, lines: lines.filter((l) => l.group === g.id) }))
    .filter((g) => g.lines.length > 0)
}

/** Văn bản danh sách đi chợ để chia sẻ qua Zalo, tin nhắn. */
export function shoppingText(item, scaled, groups, checked = {}, opts = {}) {
  const out = []
  out.push(`${item.name}`)
  const bits = []
  if (opts.people) bits.push(`${opts.people} người`)
  if (opts.mam) bits.push(`${opts.mam} mâm`)
  if (bits.length) out.push(`Cho ${bits.join(', ')}`)
  out.push('')
  for (const g of groupLines(scaled.lines.filter((l) => l.on), groups)) {
    out.push(`${g.label.toUpperCase()}`)
    for (const l of g.lines) {
      out.push(`${checked[l.id] ? '[x]' : '[ ]'} ${l.name}: ${formatQty(l.qty, l.unit)}`)
    }
    out.push('')
  }
  for (const e of opts.extras || []) out.push(`${checked[e.id] ? '[x]' : '[ ]'} ${e.name}${e.cost ? ` (${formatVnd(e.cost)})` : ''}`)
  out.push(`Ngân sách ước tính: ${formatVnd(scaled.total + (opts.extras || []).reduce((s, e) => s + (e.cost || 0), 0))} (giá tham khảo, có thể khác)`)
  out.push('Theo Vạn Niên · 9app.tech/vannien')
  return out.join('\n')
}

/* ---------- Chỉ mục tìm kiếm ---------- */

/** Từ khóa có dấu + không dấu, không trùng. */
export function expandKeywords(list) {
  const out = []
  for (const k of list) {
    for (const v of [String(k).toLowerCase(), fold(k)]) if (v && !out.includes(v)) out.push(v)
  }
  return out
}
