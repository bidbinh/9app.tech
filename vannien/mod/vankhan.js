/** Mô-đun Văn khấn: danh sách theo dịp, trang bài khấn có điền chỗ trống, chữ to, đọc to, in, chia sẻ. */
import { h, clear, store, toast, copyText, shareText, uid } from './ui.js?v=2'
import * as L from './logic.js?v=2'
import { createReader, speechSupported } from './speech.js?v=2'

const PROFILE_KEY = 'vn.vk.profile'
const GIO_KEY = 'vn.vk.gio'
const SIZE_KEY = 'vn.vk.size'
const SIZES = [
  { id: 1, label: 'Thường' },
  { id: 2, label: 'To' },
  { id: 3, label: 'Rất to' },
]
const RELATIONS = ['ông nội', 'bà nội', 'ông ngoại', 'bà ngoại', 'cha', 'mẹ', 'anh', 'chị', 'em', 'cô', 'chú', 'bác', 'dì', 'cậu', 'người thân']
const FIELD_PLACEHOLDERS = {
  ho_ten: 'Ví dụ: Nguyễn Văn An',
  ho: 'Mặc định lấy từ họ tên',
  dia_chi: 'Số nhà, đường, phường, tỉnh thành',
  ten_nguoi_mat: 'Ví dụ: Nguyễn Văn Bình',
  quan_he: 'Ví dụ: cha, mẹ, ông nội',
  ten_be: 'Tên bé',
  cha_me: 'Ví dụ: Nguyễn Văn An và Trần Thị Hoa',
  ngay_sinh_be: 'Ví dụ: 20 tháng 9 năm 2026',
  ten_co_so: 'Ví dụ: Cửa hàng Hoa Sen',
  ten_xe: 'Ví dụ: Honda Vision',
  bien_so: 'Biển số xe',
  ten_chua: 'Tên chùa bạn đến lễ',
}

export const sizeLevel = () => {
  const v = Number(store.get(SIZE_KEY, 1))
  return v >= 1 && v <= 3 ? v : 1
}

const loadGio = () => L.sanitizeGio(store.get(GIO_KEY, []))

function nextText(occ, today) {
  const info = L.dateInfo(occ.solar)
  return `${L.formatDMY(occ.solar)} (${L.lunarShort(info.lunar)} âm), ${L.relativeDays(today, occ.solar)}`
}

/* ------------------------------------------------------------------ */
/* Danh sách                                                           */
/* ------------------------------------------------------------------ */
export function renderList(ctx) {
  const { vk } = ctx.data
  const today = L.vnToday()
  ctx.setTitle('Cúng lễ theo phong tục', 'Văn khấn')
  const root = ctx.body
  clear(root)

  root.append(
    h('article', { class: 'card vn-lead' }, [
      h('p', { class: 'vn-lead-text' }, 'Bài khấn theo từng dịp, tự tính ngày Rằm, mùng Một, ngày giỗ theo âm lịch, có chữ to và đọc to cho người lớn tuổi.'),
      h('p', { class: 'note' }, vk.meta.disclaimer),
    ]),
  )

  // Sắp tới: gộp theo ngày; vẽ lại được khi thêm hoặc xóa ngày giỗ
  const upcomingCard = h('article', { class: 'card', id: 'vn-upcoming' })
  const drawUpcoming = () => {
    clear(upcomingCard)
    const byDate = new Map()
    const addUp = (occ, label, href) => {
      const k = L.dateKey(occ.solar)
      if (!byDate.has(k)) byDate.set(k, { occ, items: [] })
      byDate.get(k).items.push({ label, href })
    }
    for (const it of vk.items) {
      const o = L.nextOccurrence(it.when, today)
      if (o) addUp(o, it.name, `#/van-khan/${it.id}`)
    }
    for (const p of loadGio()) {
      const o = L.nextGio(p.day, p.month, today)
      if (o) addUp(o, `Giỗ ${p.relation} ${p.name}`, `#/van-khan/gio?p=${p.id}`)
    }
    const upcoming = [...byDate.values()].sort((a, b) => L.dateKey(a.occ.solar) - L.dateKey(b.occ.solar)).slice(0, 5)
    upcomingCard.append(
      h('h3', null, 'Sắp tới'),
      h(
        'div',
        { class: 'vn-up-list' },
        upcoming.map((u) => {
          const info = L.dateInfo(u.occ.solar)
          return h('div', { class: 'vn-up' }, [
            h('div', { class: 'vn-up-date' }, [h('b', null, String(u.occ.solar.day)), h('span', null, `Th${u.occ.solar.month}`)]),
            h('div', { class: 'vn-up-body' }, [
              h('b', null, `${info.thu} · ${L.lunarShort(info.lunar)} âm lịch`),
              h('span', { class: 'meta' }, L.relativeDays(today, u.occ.solar)),
              h(
                'div',
                { class: 'tags' },
                u.items.map((i) => h('a', { class: 'tag vn-tag-link', href: i.href }, i.label)),
              ),
            ]),
          ])
        }),
      ),
    )
  }
  drawUpcoming()
  root.append(upcomingCard)

  // Tìm kiếm + danh sách theo nhóm
  const searchBox = h('input', { type: 'search', placeholder: 'Tìm bài khấn: rằm, giỗ, tân gia...', 'aria-label': 'Tìm bài khấn', id: 'vn-vk-search' })
  const listWrap = h('div', { id: 'vn-vk-list' })
  const cards = []
  for (const cat of vk.meta.categories) {
    const items = vk.items.filter((i) => i.category === cat.id)
    if (!items.length) continue
    const sec = h('section', { class: 'vn-section', 'data-cat': cat.id }, [h('h3', { class: 'vn-sec-title' }, cat.label)])
    for (const it of items) {
      const occ = L.nextOccurrence(it.when, today)
      const a = h('a', { class: 'card vn-card', href: `#/van-khan/${it.id}` }, [
        h('b', null, it.name),
        h('span', { class: 'meta' }, it.short),
        occ ? h('span', { class: 'chip good' }, `Tiếp theo: ${nextText(occ, today)}`) : h('span', { class: 'chip' }, it.when.kind === 'custom' ? 'Theo ngày giỗ của gia đình' : 'Chọn ngày theo việc'),
      ])
      cards.push({ a, sec, text: L.fold([it.name, it.short, it.occasion, it.id.replaceAll('-', ' '), it.offerings.join(' ')].join(' ')) })
      sec.append(a)
    }
    listWrap.append(sec)
  }
  const empty = h('p', { class: 'note', hidden: true }, 'Không có bài khấn phù hợp. Thử từ khóa ngắn hơn, ví dụ: giỗ, rằm, tân gia.')
  searchBox.addEventListener('input', () => {
    const q = L.fold(searchBox.value).trim()
    let any = false
    for (const c of cards) {
      const ok = !q || q.split(/\s+/).every((w) => c.text.includes(w))
      c.a.hidden = !ok
      any = any || ok
    }
    for (const s of listWrap.querySelectorAll('.vn-section')) s.hidden = ![...s.querySelectorAll('.vn-card')].some((c) => !c.hidden)
    empty.hidden = any
  })
  root.append(h('div', { class: 'vn-search' }, [searchBox]), listWrap, empty)

  root.append(giỗPanel(ctx, today, drawUpcoming))

  root.append(
    h('div', { class: 'vn-links' }, [
      h('a', { class: 'tag vn-tag-link', href: '#/mam-cung' }, 'Mâm cúng và đi chợ'),
      h('a', { class: 'tag vn-tag-link', href: '#/ve-noi-dung' }, 'Về nội dung'),
    ]),
  )
}

function giỗPanel(ctx, today, onChange) {
  const wrap = h('article', { class: 'card', id: 'vn-gio' })
  const draw = () => {
    clear(wrap)
    const people = loadGio()
    wrap.append(h('h3', null, 'Ngày giỗ của gia đình'))
    wrap.append(h('p', { class: 'note' }, 'Nhập ngày mất theo âm lịch. Phần mềm tự tính ngày giỗ các năm tới theo dương lịch. Dữ liệu chỉ lưu trên máy này.'))
    if (!people.length) wrap.append(h('p', { class: 'note vn-empty' }, 'Chưa có ai. Thêm người đầu tiên bên dưới.'))
    for (const p of people) {
      const o = L.nextGio(p.day, p.month, today)
      wrap.append(
        h('div', { class: 'vn-row', 'data-gio': p.id }, [
          h('div', { class: 'vn-row-main' }, [
            h('b', null, `Giỗ ${p.relation} ${p.name}`),
            h('span', { class: 'meta' }, `Ngày mất: ${p.day}/${p.month} âm lịch` + (o ? ` · Tiếp theo: ${nextText(o, today)}` : '')),
          ]),
          h('a', { class: 'vn-btn-sm', href: `#/van-khan/gio?p=${p.id}` }, 'Mở bài khấn'),
          h('button', {
            class: 'vn-btn-sm vn-danger',
            type: 'button',
            'aria-label': `Xóa ${p.name}`,
            onClick: () => {
              store.set(GIO_KEY, people.filter((x) => x.id !== p.id))
              draw()
              onChange()
            },
          }, 'Xóa'),
        ]),
      )
    }
    const name = h('input', { type: 'text', placeholder: 'Họ tên người mất', 'aria-label': 'Họ tên người mất', id: 'vn-gio-name' })
    const rel = h('select', { 'aria-label': 'Quan hệ', id: 'vn-gio-rel' }, RELATIONS.map((r) => h('option', { value: r }, r)))
    const day = h('select', { 'aria-label': 'Ngày âm lịch', id: 'vn-gio-day' }, Array.from({ length: 30 }, (_, i) => h('option', { value: i + 1 }, `Ngày ${i + 1}`)))
    const month = h('select', { 'aria-label': 'Tháng âm lịch', id: 'vn-gio-month' }, Array.from({ length: 12 }, (_, i) => h('option', { value: i + 1 }, `Tháng ${i + 1}`)))
    wrap.append(
      h('form', {
        class: 'vn-form',
        onSubmit: (e) => {
          e.preventDefault()
          const n = name.value.trim()
          if (!n) {
            toast('Hãy nhập tên người mất.')
            name.focus()
            return
          }
          const list = loadGio()
          list.push({ id: uid(), name: n, relation: rel.value, day: Number(day.value), month: Number(month.value) })
          store.set(GIO_KEY, list)
          draw()
          onChange()
          toast('Đã thêm ngày giỗ.')
        },
      }, [
        h('div', { class: 'vn-form-grid' }, [
          h('label', null, ['Họ tên', name]),
          h('label', null, ['Quan hệ', rel]),
          h('label', null, ['Ngày âm', day]),
          h('label', null, ['Tháng âm', month]),
        ]),
        h('button', { class: 'vn-btn', type: 'submit' }, 'Thêm ngày giỗ'),
      ]),
    )
  }
  draw()
  return wrap
}

function mamLinks(item, ctx) {
  const ids = item.mamIds || (item.mamId ? [item.mamId] : [])
  return ids.map((id) => {
    const m = ctx.data.mc.items.find((x) => x.id === id)
    const label = ids.length > 1 && m ? `Xem mâm cúng: ${m.name}` : 'Xem mâm cúng và danh sách đi chợ'
    return h('a', { class: 'vn-btn vn-ghost vn-noprint', href: `#/mam-cung/${id}` }, label)
  })
}

/* ------------------------------------------------------------------ */
/* Chi tiết                                                            */
/* ------------------------------------------------------------------ */
export function renderDetail(ctx, id, q) {
  const { vk } = ctx.data
  const item = vk.items.find((i) => i.id === id)
  const root = ctx.body
  clear(root)
  if (!item) return ctx.notFound('Không tìm thấy bài khấn này.', '#/van-khan', 'Về danh sách văn khấn')

  ctx.setTitle('Văn khấn', item.name)
  const today = L.vnToday()
  const paragraphs = L.resolveParagraphs(item.paragraphs, vk.meta.blocks)
  const userKeys = [...new Set(paragraphs.flatMap((p) => L.templateKeys(p)))].filter((k) => !L.AUTO_KEYS.includes(k))
  const isGio = item.when.kind === 'custom'
  const people = loadGio()
  let person = isGio ? people.find((p) => p.id === q.get('p')) || null : null
  const profile = store.get(PROFILE_KEY, {})
  const occs = L.occurrences(item.when, today, item.when.kind === 'monthly' ? 4 : 2)

  let date = L.fromISO(q.get('d'))
  if (!date) {
    if (person) date = (L.nextGio(person.day, person.month, today) || { solar: today }).solar
    else date = (occs[0] && occs[0].solar) || today
  }

  const state = { date, person }
  const hashBase = `#/van-khan/${item.id}`
  const hashFor = (extra = {}) => {
    const p = new URLSearchParams()
    if (state.person) p.set('p', state.person.id)
    p.set('d', L.toISO(state.date))
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    return `${hashBase}?${p.toString()}`
  }
  const syncUrl = () => {
    try {
      history.replaceState(history.state, '', hashFor(q.get('doc') === '1' ? { doc: '1' } : {}))
      ctx.markRendered()
    } catch {
      /* bỏ qua */
    }
  }

  const currentVars = () => L.buildVars(store.get(PROFILE_KEY, {}), L.dateInfo(state.date), state.person)
  const filledParagraphs = () => paragraphs.map((p) => L.fillTemplate(p, currentVars()))
  const plainText = () => [item.name.toUpperCase(), '', ...filledParagraphs(), '', 'Mang tính tham khảo theo phong tục. Theo Vạn Niên · 9app.tech/vannien'].join('\n')

  /* ---- vùng chữ ---- */
  const textBox = h('div', { class: 'vn-text', id: 'vn-text', 'data-size': String(sizeLevel()) })
  const drawText = (box = textBox) => {
    clear(box)
    const vars = currentVars()
    paragraphs.forEach((p, i) => {
      const para = h('p', { 'data-i': String(i) })
      for (const seg of L.fillSegments(p, vars)) {
        if (seg.kind === 'text') para.append(seg.text)
        else if (seg.kind === 'val') para.append(h('mark', { class: 'vn-val' }, seg.text))
        else para.append(h('span', { class: 'vn-blank', title: L.FIELD_LABELS[seg.key] || '' }, seg.text))
      }
      box.append(para)
    })
  }

  /* ---- đọc to ---- */
  let activeBox = textBox
  let readBox = null
  const speakBtn = h('button', { class: 'vn-btn', type: 'button', id: 'vn-speak' }, 'Đọc to')
  const stopBtn = h('button', { class: 'vn-btn vn-ghost', type: 'button', id: 'vn-stop', hidden: true }, 'Dừng')
  const speechHint = h('p', { class: 'note vn-noprint', hidden: true })
  const reader = createReader({
    onState: (s) => {
      speakBtn.textContent = s === 'playing' ? 'Tạm dừng' : s === 'paused' ? 'Đọc tiếp' : 'Đọc to'
      stopBtn.hidden = s === 'idle'
    },
    onParagraph: (i) => {
      for (const box of [textBox, readBox]) {
        if (!box) continue
        box.querySelectorAll('p').forEach((p) => p.classList.toggle('vn-speaking', Number(p.dataset.i) === i))
        const cur = box.querySelector('.vn-speaking')
        if (cur && box === activeBox && cur.scrollIntoView) cur.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    },
  })
  ctx.onLeave(() => reader.stop())
  const onSpeak = () => {
    if (reader.state === 'playing') return reader.pause()
    if (reader.state === 'paused') return reader.resume()
    const ok = reader.play(filledParagraphs())
    if (!ok) toast('Trình duyệt này chưa hỗ trợ đọc to.')
    const has = reader.hasVietnameseVoice()
    if (has === false) {
      speechHint.hidden = false
      speechHint.textContent = 'Máy của bạn có thể chưa có giọng đọc tiếng Việt. Hãy thêm giọng Tiếng Việt trong cài đặt hệ thống nếu nghe không rõ.'
    }
  }
  speakBtn.addEventListener('click', onSpeak)
  stopBtn.addEventListener('click', () => reader.stop())
  if (!speechSupported()) {
    speakBtn.hidden = true
  }

  /* ---- cỡ chữ ---- */
  const sizeButtons = []
  const setSize = (n) => {
    store.set(SIZE_KEY, n)
    for (const b of sizeButtons) b.classList.toggle('active', Number(b.dataset.size) === n)
    textBox.dataset.size = String(n)
    if (readBox) readBox.dataset.size = String(Math.max(n, 2))
  }
  const sizeSeg = () =>
    h(
      'div',
      { class: 'vn-seg', role: 'group', 'aria-label': 'Cỡ chữ' },
      SIZES.map((s) => {
        const b = h('button', {
          type: 'button',
          class: s.id === sizeLevel() ? 'active' : '',
          'data-size': String(s.id),
          'aria-pressed': String(s.id === sizeLevel()),
          onClick: () => setSize(s.id),
        }, s.label)
        sizeButtons.push(b)
        return b
      }),
    )

  /* ---- đầu trang ---- */
  root.append(h('a', { class: 'vn-back', href: '#/van-khan' }, '‹ Tất cả bài khấn'))
  root.append(
    h('article', { class: 'card vn-head' }, [
      h('h3', null, item.occasion),
      h('p', { class: 'note' }, item.whenText),
    ]),
  )

  /* ---- ngày cúng ---- */
  const dateInput = h('input', { type: 'date', value: L.toISO(state.date), id: 'vn-date', 'aria-label': 'Ngày cúng' })
  const dateInfoBox = h('p', { class: 'vn-dateinfo', id: 'vn-dateinfo' })
  const dateWarn = h('p', { class: 'warn-banner', hidden: true, id: 'vn-datewarn' })
  const chipsBox = h('div', { class: 'tags' })
  const drawDateInfo = () => {
    const info = L.dateInfo(state.date)
    dateInfoBox.textContent = `${info.thu}, ${info.ngay_duong} dương lịch · ${L.lunarShort(info.lunar)} âm lịch, năm ${info.nam_cc} · ngày ${info.ngay_cc}`
    const rule = item.when
    let warn = ''
    if (rule.kind === 'monthly' || rule.kind === 'yearly' || rule.kind === 'yearEnd') {
      const o = L.nextOccurrence(rule, state.date)
      if (!o || L.dateKey(o.solar) !== L.dateKey(state.date)) warn = 'Ngày này không trùng ngày thường cúng của bài khấn. Bạn vẫn có thể dùng, hoặc chọn một ngày gợi ý ở trên.'
    }
    dateWarn.hidden = !warn
    dateWarn.textContent = warn
    clear(chipsBox)
    const picks = person ? [L.nextGio(person.day, person.month, today)].filter(Boolean) : occs
    for (const o of picks) {
      const on = L.dateKey(o.solar) === L.dateKey(state.date)
      chipsBox.append(
        h('button', {
          type: 'button',
          class: `tag vn-pick ${on ? 'active' : ''}`,
          onClick: () => setDate(o.solar),
        }, `${L.formatDMY(o.solar)} · ${L.lunarShort(L.dateInfo(o.solar).lunar)} âm`),
      )
    }
  }
  const setDate = (d) => {
    state.date = d
    dateInput.value = L.toISO(d)
    drawDateInfo()
    drawText()
    if (readBox) drawText(readBox)
    syncUrl()
  }
  dateInput.addEventListener('change', () => {
    const d = L.fromISO(dateInput.value)
    if (d) setDate(d)
  })

  const dateCard = h('article', { class: 'card vn-noprint' }, [
    h('h3', null, 'Ngày cúng'),
    chipsBox,
    h('div', { class: 'vn-date-row' }, [h('label', null, ['Chọn ngày dương lịch', dateInput])]),
    dateInfoBox,
    dateWarn,
    item.when.kind === 'none'
      ? h('p', { class: 'note' }, ['Chưa có ngày cố định. ', h('a', { href: '#/xem-ngay' }, 'Chọn ngày tốt ở mục Xem ngày'), ' theo tuổi gia chủ.'])
      : null,
  ])
  root.append(dateCard)

  /* ---- giỗ: chọn người ---- */
  if (isGio) {
    const sel = h('select', { id: 'vn-gio-pick', 'aria-label': 'Chọn người được cúng' }, [
      h('option', { value: '' }, people.length ? 'Chọn người đã lưu' : 'Chưa lưu ai, nhập tay bên dưới'),
      ...people.map((p) => h('option', { value: p.id, selected: person && person.id === p.id }, `${p.relation} ${p.name} (${p.day}/${p.month} âm)`)),
    ])
    sel.addEventListener('change', () => {
      person = people.find((p) => p.id === sel.value) || null
      state.person = person
      if (person) {
        const o = L.nextGio(person.day, person.month, today)
        if (o) state.date = o.solar
        dateInput.value = L.toISO(state.date)
      }
      for (const k of ['ten_nguoi_mat', 'quan_he']) {
        const inp = root.querySelector(`[data-field="${k}"]`)
        if (inp) {
          inp.disabled = !!person
          if (person) inp.value = k === 'ten_nguoi_mat' ? person.name : person.relation
        }
      }
      drawDateInfo()
      drawText()
      if (readBox) drawText(readBox)
      syncUrl()
    })
    root.append(
      h('article', { class: 'card vn-noprint' }, [
        h('h3', null, 'Người được cúng giỗ'),
        h('label', null, ['Chọn người', sel]),
        h('p', { class: 'note' }, ['Chưa lưu ngày giỗ? ', h('a', { href: '#/van-khan' }, 'Thêm ở mục Ngày giỗ của gia đình'), ' để tự tính các năm sau.']),
      ]),
    )
  }

  /* ---- thông tin cá nhân ---- */
  const form = h('div', { class: 'vn-form-grid' })
  for (const key of userKeys) {
    const locked = (key === 'ten_nguoi_mat' || key === 'quan_he') && !!person
    const inp = h('input', {
      type: 'text',
      'data-field': key,
      id: `vn-f-${key}`,
      value: locked ? (key === 'ten_nguoi_mat' ? person.name : person.relation) : profile[key] || '',
      placeholder: FIELD_PLACEHOLDERS[key] || '',
      disabled: locked,
      autocomplete: key === 'ho_ten' ? 'name' : key === 'dia_chi' ? 'street-address' : 'off',
    })
    inp.addEventListener('input', () => {
      const cur = store.get(PROFILE_KEY, {})
      cur[key] = inp.value
      store.set(PROFILE_KEY, cur)
      drawText()
      if (readBox) drawText(readBox)
    })
    form.append(h('label', { class: key === 'dia_chi' || key === 'cha_me' ? 'wide' : '' }, [L.FIELD_LABELS[key] || key, inp]))
  }
  if (userKeys.length) {
    root.append(
      h('article', { class: 'card vn-noprint', id: 'vn-fields' }, [
        h('h3', null, 'Thông tin điền vào bài khấn'),
        form,
        h('p', { class: 'note' }, 'Thông tin chỉ lưu trên máy của bạn, không gửi đi đâu. Chỗ để trống sẽ hiện dấu chấm để bạn viết tay hoặc đọc bỏ qua.'),
      ]),
    )
  }

  /* ---- nội dung bài khấn ---- */
  root.append(buildTextCard())

  function buildTextCard() {
    const printBtn = h('button', { class: 'vn-btn vn-ghost', type: 'button', onClick: () => window.print() }, 'In')
    const shareBtn = h('button', { class: 'vn-btn vn-ghost', type: 'button', onClick: () => shareText(item.name, plainText()) }, 'Chia sẻ')
    const copyBtn = h('button', {
      class: 'vn-btn vn-ghost',
      type: 'button',
      onClick: async () => toast((await copyText(plainText())) ? 'Đã sao chép bài khấn.' : 'Không thể sao chép.'),
    }, 'Sao chép')
    const readLink = h('a', { class: 'vn-btn', href: hashFor({ doc: '1' }), id: 'vn-read-open' }, 'Chế độ đọc chữ to')
    readLink.addEventListener('click', (e) => {
      e.preventDefault()
      ctx.navigate(hashFor({ doc: '1' }), { state: { vnRead: true } })
    })
    const card = h('article', { class: 'card vn-doc' }, [
      h('div', { class: 'vn-toolbar vn-noprint' }, [sizeSeg(), h('div', { class: 'vn-actions' }, [readLink, speakBtn, stopBtn])]),
      h('h3', { class: 'vn-doc-title' }, item.name),
      textBox,
      speechHint,
      h('div', { class: 'vn-actions vn-noprint' }, [printBtn, shareBtn, copyBtn]),
      h('p', { class: 'note vn-disclaimer' }, vk.meta.disclaimer),
    ])
    return card
  }

  /* ---- đồ lễ, giờ tốt ---- */
  root.append(
    h('div', { class: 'grid-2 vn-grid' }, [
      h('article', { class: 'card' }, [
        h('h3', null, 'Đồ lễ cần chuẩn bị'),
        h('ul', { class: 'vn-list' }, item.offerings.map((o) => h('li', null, o))),
        ...mamLinks(item, ctx),
      ]),
      h('article', { class: 'card' }, [
        h('h3', null, 'Giờ cúng gợi ý'),
        h('p', { class: 'loi' }, item.goodTime),
        h('p', { class: 'note' }, 'Gợi ý chung theo thói quen, không phải bói toán. Nhà bạn thuận giờ nào thì cúng giờ đó.'),
      ]),
    ]),
  )
  if (item.notes && item.notes.length) {
    root.append(
      h('article', { class: 'card' }, [
        h('h3', null, 'Lưu ý'),
        h('ul', { class: 'vn-list' }, item.notes.map((n) => h('li', null, n))),
      ]),
    )
  }
  root.append(
    h('div', { class: 'vn-links vn-noprint' }, [
      h('a', { class: 'tag vn-tag-link', href: '#/van-khan' }, 'Tất cả bài khấn'),
      h('a', { class: 'tag vn-tag-link', href: '#/ve-noi-dung' }, 'Về nội dung'),
    ]),
  )

  /* ---- chế độ đọc toàn màn hình ---- */
  drawDateInfo()
  drawText()
  setSize(sizeLevel())
  if (q.get('doc') === '1') openReading()

  function openReading() {
    const box = h('div', { class: 'vn-text vn-read-text', id: 'vn-read-text', 'data-size': String(Math.max(sizeLevel(), 2)) })
    drawText(box)
    const close = () => {
      reader.stop()
      if (history.state && history.state.vnRead) history.back()
      else ctx.navigate(hashFor(), { replace: true })
    }
    const rSpeak = h('button', { class: 'vn-btn', type: 'button', id: 'vn-read-speak' }, speakBtn.textContent)
    const rSeg = h(
      'div',
      { class: 'vn-seg', role: 'group', 'aria-label': 'Cỡ chữ' },
      SIZES.filter((s) => s.id >= 2).map((s) =>
        h('button', {
          type: 'button',
          'data-size': String(s.id),
          class: Number(box.dataset.size) === s.id ? 'active' : '',
          onClick: () => {
            box.dataset.size = String(s.id)
            store.set(SIZE_KEY, s.id)
            rSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', Number(b.dataset.size) === s.id))
          },
        }, s.label),
      ),
    )
    const overlay = h('div', { class: 'vn-read', id: 'vn-read', role: 'dialog', 'aria-label': `Chế độ đọc: ${item.name}` }, [
      h('div', { class: 'vn-read-bar' }, [
        h('button', { class: 'vn-btn vn-ghost', type: 'button', id: 'vn-read-close', onClick: close }, '‹ Đóng'),
        rSeg,
        rSpeak,
      ]),
      h('div', { class: 'vn-read-body' }, [h('h2', null, item.name), box, h('p', { class: 'note' }, vk.meta.disclaimer)]),
    ])
    rSpeak.addEventListener('click', () => {
      onSpeak()
    })
    const sync = () => {
      rSpeak.textContent = speakBtn.textContent
    }
    const obs = new MutationObserver(sync)
    obs.observe(speakBtn, { childList: true, characterData: true, subtree: true })
    if (!speechSupported()) rSpeak.hidden = true
    document.body.append(overlay)
    document.body.classList.add('vn-reading')
    activeBox = box
    readBox = box
    ctx.onLeave(() => {
      obs.disconnect()
      overlay.remove()
      document.body.classList.remove('vn-reading')
      readBox = null
      activeBox = textBox
    })
    rSpeak.focus({ preventScroll: true })
  }
}
