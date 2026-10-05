/** Mô-đun Mâm cúng, mâm cỗ: danh sách đồ lễ theo dịp, tính lượng và ngân sách, danh sách đi chợ, công thức. */
import { h, clear, store, toast, copyText, shareText, uid } from './ui.js?v=5'
import * as L from './logic.js?v=5'

const PRICES_KEY = 'vn.mam.prices'
const SAVED_KEY = 'vn.mam.saved'
const DRAFT_KEY = 'vn.mam.draft'

const loadSaved = () => store.get(SAVED_KEY, []).filter((s) => s && typeof s === 'object' && typeof s.uid === 'string' && typeof s.itemId === 'string')
const clone = (o) => JSON.parse(JSON.stringify(o))
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))

function itemOf(mc, id) {
  const raw = mc.items.find((i) => i.id === id)
  return raw ? L.resolveItem(raw, mc.meta.catalog) : null
}

function defaultState(item) {
  return { people: item.defaults.people, mam: item.defaults.mam, off: {}, checked: {}, extras: [] }
}

function sanitizeState(st, item) {
  const base = defaultState(item)
  const out = { ...base, ...(st && typeof st === 'object' && !Array.isArray(st) ? st : {}) }
  out.people = clamp(Math.round(Number(out.people)) || base.people, 1, 500)
  out.mam = clamp(Math.round(Number(out.mam)) || base.mam, 1, 100)
  out.off = out.off && typeof out.off === 'object' ? out.off : {}
  out.checked = out.checked && typeof out.checked === 'object' ? out.checked : {}
  out.extras = Array.isArray(out.extras) ? out.extras.filter((e) => e && e.id && e.name) : []
  return out
}

function summary(item, st) {
  const bits = []
  if (item.scale.people) bits.push(`${st.people} người`)
  if (item.scale.mam) bits.push(`${st.mam} mâm`)
  return bits.join(', ')
}

/* ------------------------------------------------------------------ */
export function renderList(ctx) {
  const { mc } = ctx.data
  ctx.setTitle('Đồ lễ và đi chợ', 'Mâm cúng')
  const root = ctx.body
  clear(root)

  root.append(
    h('article', { class: 'card vn-lead' }, [
      h('p', { class: 'vn-lead-text' }, 'Chọn dịp, nhập số người và số mâm, phần mềm tính lượng nguyên liệu, ngân sách ước tính và danh sách đi chợ để bạn tích từng món.'),
      h('p', { class: 'note' }, mc.meta.priceNote),
    ]),
  )

  // Mâm của tôi
  const saved = loadSaved()
  const mine = h('article', { class: 'card', id: 'vn-mine' })
  const drawMine = () => {
    clear(mine)
    const list = loadSaved()
    mine.append(h('h3', null, 'Mâm của tôi'))
    if (!list.length) {
      mine.append(h('p', { class: 'note vn-empty' }, 'Chưa có mâm nào được lưu. Mở một mâm bên dưới, chỉnh số người, rồi bấm Lưu vào Mâm của tôi.'))
      return
    }
    const prices = store.get(PRICES_KEY, {})
    for (const s of list) {
      const item = itemOf(mc, s.itemId)
      if (!item) continue
      const st = sanitizeState(s, item)
      const scaled = L.scaleItem(item, st, prices, st.off)
      const on = scaled.lines.filter((l) => l.on)
      const done = on.filter((l) => st.checked[l.id]).length
      mine.append(
        h('div', { class: 'vn-row', 'data-saved': s.uid }, [
          h('a', { class: 'vn-row-main', href: `#/mam-cung/${s.itemId}?u=${s.uid}` }, [
            h('b', null, s.label || item.name),
            h('span', { class: 'meta' }, `${item.name} · ${summary(item, st)} · ${L.formatVnd(scaled.total + st.extras.reduce((a, e) => a + (e.cost || 0), 0))} · đã mua ${done}/${on.length}`),
          ]),
          h('button', {
            class: 'vn-btn-sm vn-danger',
            type: 'button',
            'aria-label': `Xóa mâm ${s.label || item.name}`,
            onClick: () => {
              store.set(SAVED_KEY, loadSaved().filter((x) => x.uid !== s.uid))
              drawMine()
              toast('Đã xóa mâm.')
            },
          }, 'Xóa'),
        ]),
      )
    }
  }
  void saved
  drawMine()
  root.append(mine)

  const search = h('input', { type: 'search', placeholder: 'Tìm mâm: giỗ, Tết, ông Táo, đầy tháng...', 'aria-label': 'Tìm mâm cúng', id: 'vn-mc-search' })
  const wrap = h('div', { id: 'vn-mc-list' })
  const cards = []
  const add = (a, text) => {
    cards.push({ a, text: L.fold(text) })
    wrap.append(a)
  }
  for (const it of mc.items) {
    add(
      h('a', { class: 'card vn-card', href: `#/mam-cung/${it.id}` }, [
        h('b', null, it.name),
        h('span', { class: 'meta' }, it.short),
        h('span', { class: 'chip' }, it.occasion),
      ]),
      [it.name, it.short, it.occasion, it.id.replaceAll('-', ' ')].join(' '),
    )
  }
  add(
    h('a', { class: 'card vn-card', href: '#/mam-cung/ngu-qua' }, [
      h('b', null, 'Mâm ngũ quả ba miền'),
      h('span', { class: 'meta' }, 'Cách chọn năm loại quả của miền Bắc, miền Trung, miền Nam và ý nghĩa.'),
      h('span', { class: 'chip' }, 'Tết, bàn thờ'),
    ]),
    'mam ngu qua bac trung nam trai cay',
  )
  const empty = h('p', { class: 'note', hidden: true }, 'Không có mâm phù hợp. Thử từ khóa khác.')
  search.addEventListener('input', () => {
    const q = L.fold(search.value).trim()
    let any = false
    for (const c of cards) {
      const ok = !q || q.split(/\s+/).every((w) => c.text.includes(w))
      c.a.hidden = !ok
      any = any || ok
    }
    empty.hidden = any
  })
  root.append(h('div', { class: 'vn-search' }, [search]), h('h3', { class: 'vn-sec-title' }, 'Mâm theo dịp'), wrap, empty)

  root.append(
    h('h3', { class: 'vn-sec-title' }, 'Công thức món truyền thống'),
    h(
      'div',
      { class: 'vn-recipes' },
      mc.recipes.map((r) => h('a', { class: 'card vn-card', href: `#/mam-cung/cong-thuc/${r.id}` }, [h('b', null, r.name), h('span', { class: 'meta' }, `${r.serves} · ${r.time}`)])),
    ),
    h('div', { class: 'vn-links' }, [
      h('a', { class: 'tag vn-tag-link', href: '#/van-khan' }, 'Văn khấn theo dịp'),
      h('a', { class: 'tag vn-tag-link', href: '#/ve-noi-dung' }, 'Về nội dung'),
    ]),
  )
}

/* ------------------------------------------------------------------ */
export function renderDetail(ctx, id, q) {
  const { mc } = ctx.data
  const root = ctx.body
  clear(root)
  const item = itemOf(mc, id)
  if (!item) return ctx.notFound('Không tìm thấy mâm cúng này.', '#/mam-cung', 'Về danh sách mâm cúng')
  ctx.setTitle('Mâm cúng', item.name)

  const groups = mc.meta.groups
  const savedList = loadSaved()
  let savedRec = savedList.find((s) => s.uid === q.get('u') && s.itemId === id) || null
  const drafts = store.get(DRAFT_KEY, {})
  let st = sanitizeState(savedRec || drafts[id], item)
  if (q.get('n')) {
    st.people = clamp(Math.round(Number(q.get('n'))) || st.people, 1, 500)
    // chỉ có số người: số mâm theo số người
    if (!q.get('m') && item.scale.people && item.scale.mam && item.peoplePerMam) st.mam = clamp(Math.ceil(st.people / item.peoplePerMam), 1, 100)
  }
  if (q.get('m')) st.mam = clamp(Math.round(Number(q.get('m'))) || st.mam, 1, 100)

  const persist = () => {
    if (savedRec) {
      const list = loadSaved()
      const i = list.findIndex((s) => s.uid === savedRec.uid)
      if (i >= 0) {
        list[i] = { ...list[i], people: st.people, mam: st.mam, off: st.off, checked: st.checked, extras: st.extras }
        store.set(SAVED_KEY, list)
      }
    } else {
      const d = store.get(DRAFT_KEY, {})
      d[id] = { people: st.people, mam: st.mam, off: st.off, checked: st.checked, extras: st.extras }
      store.set(DRAFT_KEY, d)
    }
  }
  const syncUrl = () => {
    const p = new URLSearchParams()
    if (savedRec) p.set('u', savedRec.uid)
    p.set('n', String(st.people))
    p.set('m', String(st.mam))
    try {
      history.replaceState(history.state, '', `#/mam-cung/${id}?${p.toString()}`)
      ctx.markRendered()
    } catch {
      /* bỏ qua */
    }
  }

  const compute = () => {
    const prices = store.get(PRICES_KEY, {})
    const scaled = L.scaleItem(item, st, prices, st.off)
    const extrasTotal = st.extras.reduce((a, e) => a + (e.cost || 0), 0)
    return { scaled, prices, extrasTotal, total: scaled.total + extrasTotal }
  }

  root.append(h('a', { class: 'vn-back', href: '#/mam-cung' }, '‹ Tất cả mâm cúng'))
  root.append(
    h('article', { class: 'card vn-head' }, [
      h('h3', null, item.occasion),
      h('p', { class: 'loi' }, item.short),
      item.vanKhanId ? h('a', { class: 'vn-btn vn-ghost', href: `#/van-khan/${item.vanKhanId}` }, 'Xem văn khấn cho dịp này') : null,
    ]),
  )

  /* ---- số người, số mâm ---- */
  const controls = h('article', { class: 'card vn-noprint', id: 'vn-controls' }, [h('h3', null, 'Quy mô')])
  const peopleInput = stepper('Số người', st.people, 1, 500, (v) => {
    const oldAuto = item.peoplePerMam ? Math.ceil(st.people / item.peoplePerMam) : null
    st.people = v
    if (item.scale.mam && item.peoplePerMam && st.mam === oldAuto) {
      st.mam = Math.max(1, Math.ceil(v / item.peoplePerMam))
      mamInput.set(st.mam)
    }
    afterChange()
  }, 'vn-people')
  const mamInput = stepper('Số mâm', st.mam, 1, 100, (v) => {
    st.mam = v
    afterChange()
  }, 'vn-mam')
  const ctlRow = h('div', { class: 'vn-form-grid' })
  if (item.scale.people) ctlRow.append(peopleInput.el)
  if (item.scale.mam) ctlRow.append(mamInput.el)
  if (item.scale.people || item.scale.mam) controls.append(ctlRow)
  if (item.peoplePerMam && item.scale.people && item.scale.mam) {
    controls.append(h('p', { class: 'note' }, `Mỗi mâm khoảng ${item.peoplePerMam} người. Đổi số người thì số mâm tự cập nhật, bạn vẫn có thể sửa tay.`))
  }
  if (!item.scale.people && !item.scale.mam) controls.append(h('p', { class: 'note' }, 'Mâm này có số lượng cố định.'))
  root.append(controls)

  /* ---- ngân sách ---- */
  const budget = h('article', { class: 'card vn-budget', id: 'vn-budget' })
  root.append(budget)

  /* ---- danh sách đi chợ ---- */
  const listCard = h('article', { class: 'card', id: 'vn-shop' })
  root.append(listCard)

  /* ---- món thêm ---- */
  const extraCard = h('article', { class: 'card vn-noprint', id: 'vn-extras' })
  root.append(extraCard)

  /* ---- thao tác ---- */
  const actions = h('article', { class: 'card vn-noprint', id: 'vn-actions' })
  root.append(actions)

  /* ---- công thức và lưu ý ---- */
  if (item.recipes && item.recipes.length) {
    root.append(
      h('article', { class: 'card vn-noprint' }, [
        h('h3', null, 'Công thức món chính'),
        h(
          'div',
          { class: 'tags' },
          item.recipes.map((rid) => {
            const r = mc.recipes.find((x) => x.id === rid)
            return h('a', { class: 'tag vn-tag-link', href: `#/mam-cung/cong-thuc/${rid}` }, r ? r.name : rid)
          }),
        ),
      ]),
    )
  }
  if (item.notes && item.notes.length) {
    root.append(h('article', { class: 'card' }, [h('h3', null, 'Lưu ý'), h('ul', { class: 'vn-list' }, item.notes.map((n) => h('li', null, n)))]))
  }
  root.append(h('p', { class: 'note vn-disclaimer' }, mc.meta.disclaimer))

  function afterChange() {
    persist()
    syncUrl()
    drawBudget()
    drawList()
  }

  function drawBudget() {
    const c = compute()
    const on = c.scaled.lines.filter((l) => l.on)
    const boughtN = on.filter((l) => st.checked[l.id]).length + st.extras.filter((e) => st.checked[e.id]).length
    const totalN = on.length + st.extras.length
    clear(budget)
    budget.append(
      h('h3', null, 'Ngân sách ước tính'),
      h('p', { class: 'vn-total', id: 'vn-total' }, L.formatVnd(c.total)),
      h('p', { class: 'note' }, [
        `Cho ${summary(item, st) || 'một mâm'}. `,
        item.scale.people && st.people > 0 ? `Khoảng ${L.formatVnd(Math.round(c.total / st.people / 1000) * 1000)} mỗi người. ` : '',
        `Đã mua ${boughtN}/${totalN} món.`,
      ]),
      h('div', { class: 'vn-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(totalN), 'aria-valuenow': String(boughtN) }, [
        h('span', { style: `width:${totalN ? Math.round((boughtN / totalN) * 100) : 0}%` }),
      ]),
      h('p', { class: 'note vn-pricenote' }, 'Giá chỉ để tham khảo. Hãy sửa đơn giá từng món theo chợ nơi bạn mua; giá bạn sửa được nhớ trên máy này cho mọi mâm.'),
    )
  }

  function drawList() {
    const c = compute()
    clear(listCard)
    listCard.append(h('h3', null, 'Danh sách đi chợ'))
    for (const g of L.groupLines(c.scaled.lines, groups)) {
      listCard.append(h('h4', { class: 'vn-group' }, g.label))
      for (const l of g.lines) {
        const checked = !!st.checked[l.id]
        const cb = h('input', {
          type: 'checkbox',
          class: 'vn-check',
          id: `vn-chk-${l.id}`,
          checked,
          disabled: !l.on,
          'aria-label': `Đã mua ${l.name}`,
          onChange: () => {
            st.checked[l.id] = cb.checked
            persist()
            drawBudget()
            row.classList.toggle('done', cb.checked)
          },
        })
        const price = h('input', {
          type: 'number',
          inputmode: 'numeric',
          min: '0',
          step: '1000',
          class: 'vn-price',
          value: String(l.unitPrice),
          'aria-label': `Đơn giá ${l.name} (đồng mỗi ${l.unit})`,
          'data-price': l.id,
          onChange: () => {
            const v = price.value === '' ? null : Math.max(0, Number(price.value) || 0)
            const prices = store.get(PRICES_KEY, {})
            if (v === null || v === l.price) delete prices[l.id]
            else prices[l.id] = v
            store.set(PRICES_KEY, prices)
            drawBudget()
            drawList()
          },
        })
        const toggle = h('button', {
          type: 'button',
          class: 'vn-btn-sm',
          'aria-label': l.on ? `Bỏ ${l.name}` : `Thêm lại ${l.name}`,
          onClick: () => {
            st.off[l.id] = !l.on
            afterChange()
          },
        }, l.on ? 'Bỏ' : 'Thêm lại')
        const row = h('div', { class: `vn-item ${checked && l.on ? 'done' : ''} ${l.on ? '' : 'off'}`, 'data-ing': l.id }, [
          h('label', { class: 'vn-item-main' }, [
            cb,
            h('span', { class: 'vn-item-text' }, [
              h('b', null, l.name),
              l.note ? h('span', { class: 'meta' }, l.note) : null,
              !l.on && l.defaultOff ? h('span', { class: 'meta' }, 'Tùy chọn, đang tắt') : null,
            ]),
          ]),
          h('span', { class: 'vn-qty' }, l.qty > 0 ? L.formatQty(l.qty, l.unit) : '0'),
          h('div', { class: 'vn-item-price' }, [
            price,
            h('span', { class: 'meta' }, `đ/${l.unit}${l.customPrice ? ' (giá của bạn)' : ''}`),
            h('b', { class: 'vn-cost' }, L.formatVnd(l.cost)),
            toggle,
          ]),
        ])
        listCard.append(row)
      }
    }
    if (st.extras.length) {
      listCard.append(h('h4', { class: 'vn-group' }, 'Món thêm của bạn'))
      for (const e of st.extras) {
        const cb = h('input', {
          type: 'checkbox',
          class: 'vn-check',
          checked: !!st.checked[e.id],
          'aria-label': `Đã mua ${e.name}`,
          onChange: () => {
            st.checked[e.id] = cb.checked
            persist()
            drawBudget()
            row.classList.toggle('done', cb.checked)
          },
        })
        const row = h('div', { class: `vn-item ${st.checked[e.id] ? 'done' : ''}`, 'data-extra': e.id }, [
          h('label', { class: 'vn-item-main' }, [cb, h('span', { class: 'vn-item-text' }, [h('b', null, e.name)])]),
          h('span', { class: 'vn-qty' }, ''),
          h('div', { class: 'vn-item-price' }, [
            h('b', { class: 'vn-cost' }, L.formatVnd(e.cost || 0)),
            h('button', {
              type: 'button',
              class: 'vn-btn-sm vn-danger',
              'aria-label': `Xóa ${e.name}`,
              onClick: () => {
                st.extras = st.extras.filter((x) => x.id !== e.id)
                afterChange()
                drawExtras()
              },
            }, 'Xóa'),
          ]),
        ])
        listCard.append(row)
      }
    }
  }

  function drawExtras() {
    clear(extraCard)
    const name = h('input', { type: 'text', placeholder: 'Ví dụ: Bia, nước ngọt cho khách', id: 'vn-extra-name', 'aria-label': 'Tên món thêm' })
    const cost = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '1000', placeholder: 'Thành tiền (đ)', id: 'vn-extra-cost', 'aria-label': 'Thành tiền món thêm' })
    extraCard.append(
      h('h3', null, 'Thêm món hoặc đồ lẻ'),
      h('form', {
        class: 'vn-form',
        onSubmit: (e) => {
          e.preventDefault()
          if (!name.value.trim()) {
            toast('Hãy nhập tên món.')
            return
          }
          st.extras.push({ id: 'x' + uid(), name: name.value.trim(), cost: Math.max(0, Number(cost.value) || 0) })
          afterChange()
          drawExtras()
        },
      }, [h('div', { class: 'vn-form-grid' }, [h('label', null, ['Tên món', name]), h('label', null, ['Thành tiền', cost])]), h('button', { class: 'vn-btn vn-ghost', type: 'submit' }, 'Thêm vào danh sách')]),
    )
  }

  function drawActions() {
    clear(actions)
    const labelInput = h('input', { type: 'text', id: 'vn-save-label', value: savedRec ? savedRec.label || '' : '', placeholder: `Ví dụ: ${item.name} nhà bà nội`, 'aria-label': 'Tên mâm của tôi' })
    actions.append(
      h('h3', null, 'Lưu và chia sẻ'),
      h('div', { class: 'vn-actions' }, [
        h('button', {
          class: 'vn-btn',
          type: 'button',
          id: 'vn-share',
          onClick: () => {
            const c = compute()
            shareText(item.name, L.shoppingText(item, c.scaled, groups, st.checked, { people: item.scale.people ? st.people : 0, mam: item.scale.mam ? st.mam : 0, extras: st.extras }))
          },
        }, 'Chia sẻ qua Zalo'),
        h('button', {
          class: 'vn-btn vn-ghost',
          type: 'button',
          onClick: async () => {
            const c = compute()
            const ok = await copyText(L.shoppingText(item, c.scaled, groups, st.checked, { people: item.scale.people ? st.people : 0, mam: item.scale.mam ? st.mam : 0, extras: st.extras }))
            toast(ok ? 'Đã sao chép danh sách.' : 'Không thể sao chép.')
          },
        }, 'Sao chép'),
        h('button', { class: 'vn-btn vn-ghost', type: 'button', onClick: () => window.print() }, 'In'),
      ]),
      h('div', { class: 'vn-form-grid', style: 'margin-top:14px' }, [h('label', { class: 'wide' }, ['Tên mâm để lưu', labelInput])]),
      h('div', { class: 'vn-actions' }, [
        h('button', {
          class: 'vn-btn',
          type: 'button',
          id: 'vn-save',
          onClick: () => {
            const list = loadSaved()
            if (savedRec) {
              const i = list.findIndex((s) => s.uid === savedRec.uid)
              if (i >= 0) list[i] = { ...list[i], label: labelInput.value.trim(), people: st.people, mam: st.mam, off: st.off, checked: st.checked, extras: st.extras }
              store.set(SAVED_KEY, list)
              toast('Đã cập nhật Mâm của tôi.')
            } else {
              savedRec = { uid: uid(), itemId: id, label: labelInput.value.trim() || `${item.name} (${summary(item, st) || 'một mâm'})`, created: Date.now(), people: st.people, mam: st.mam, off: st.off, checked: st.checked, extras: st.extras }
              list.push(savedRec)
              store.set(SAVED_KEY, list)
              syncUrl()
              toast('Đã lưu vào Mâm của tôi.')
              drawActions()
            }
          },
        }, savedRec ? 'Cập nhật Mâm của tôi' : 'Lưu vào Mâm của tôi'),
        h('button', {
          class: 'vn-btn vn-ghost',
          type: 'button',
          onClick: () => {
            const prices = store.get(PRICES_KEY, {})
            for (const ing of item.ingredients) delete prices[ing.id]
            store.set(PRICES_KEY, prices)
            drawBudget()
            drawList()
            toast('Đã đặt lại đơn giá mặc định.')
          },
        }, 'Đặt lại đơn giá'),
        h('button', {
          class: 'vn-btn vn-ghost',
          type: 'button',
          onClick: () => {
            st.checked = {}
            afterChange()
          },
        }, 'Bỏ tích tất cả'),
      ]),
      savedRec ? h('a', { class: 'tag vn-tag-link', href: '#/mam-cung' }, 'Xem Mâm của tôi') : null,
    )
  }

  drawBudget()
  drawList()
  drawExtras()
  drawActions()
}

function stepper(label, value, min, max, onChange, id) {
  const input = h('input', { type: 'number', inputmode: 'numeric', min: String(min), max: String(max), value: String(value), id, 'aria-label': label })
  const apply = (v) => {
    v = clamp(Math.round(Number(v)) || min, min, max)
    input.value = String(v)
    onChange(v)
  }
  input.addEventListener('change', () => apply(input.value))
  const el = h('label', null, [
    label,
    h('div', { class: 'vn-stepper' }, [
      h('button', { type: 'button', 'aria-label': `Giảm ${label.toLowerCase()}`, onClick: () => apply(Number(input.value) - 1) }, '−'),
      input,
      h('button', { type: 'button', 'aria-label': `Tăng ${label.toLowerCase()}`, onClick: () => apply(Number(input.value) + 1) }, '+'),
    ]),
  ])
  return { el, set: (v) => (input.value = String(v)) }
}

/* ------------------------------------------------------------------ */
export function renderNguQua(ctx, q) {
  const { mc } = ctx.data
  const nq = mc.nguQua
  const root = ctx.body
  clear(root)
  ctx.setTitle('Mâm cúng', 'Mâm ngũ quả')
  const region = nq.regions.find((r) => r.id === q.get('r')) || nq.regions[0]
  root.append(
    h('a', { class: 'vn-back', href: '#/mam-cung' }, '‹ Tất cả mâm cúng'),
    h('article', { class: 'card vn-head' }, [h('h3', null, 'Ba miền, ba cách bày'), h('p', { class: 'loi' }, nq.intro)]),
    h(
      'div',
      { class: 'vn-seg vn-regions', role: 'tablist' },
      nq.regions.map((r) =>
        h('a', { href: `#/mam-cung/ngu-qua?r=${r.id}`, role: 'tab', class: r.id === region.id ? 'active' : '', 'aria-selected': String(r.id === region.id), 'data-region': r.id }, r.name),
      ),
    ),
    h('article', { class: 'card', id: 'vn-fruits' }, [
      h('h3', null, region.name),
      ...region.fruits.map((f) => h('div', { class: 'vn-fruit' }, [h('b', null, f.name), h('span', { class: 'meta' }, f.meaning)])),
      h('p', { class: 'note' }, region.note),
    ]),
    h('div', { class: 'grid-2 vn-grid' }, [
      h('article', { class: 'card nen-card' }, [h('h3', null, 'Nên'), h('ul', { class: 'vn-list' }, nq.dos.map((d) => h('li', null, d)))]),
      h('article', { class: 'card kieng-card' }, [h('h3', null, 'Nên tránh'), h('ul', { class: 'vn-list' }, nq.donts.map((d) => h('li', null, d)))]),
    ]),
    h('p', { class: 'note vn-disclaimer' }, 'Cách chọn quả khác nhau theo địa phương và gia đình. Đây là gợi ý phổ biến, bạn hãy theo thói quen nhà mình.'),
  )
}

export function renderRecipe(ctx, rid) {
  const { mc } = ctx.data
  const root = ctx.body
  clear(root)
  const r = mc.recipes.find((x) => x.id === rid)
  if (!r) return ctx.notFound('Không tìm thấy công thức này.', '#/mam-cung', 'Về mâm cúng')
  ctx.setTitle('Công thức', r.name)
  root.append(
    h('a', { class: 'vn-back', href: '#/mam-cung' }, '‹ Tất cả mâm cúng'),
    h('article', { class: 'card vn-head' }, [h('h3', null, r.name), h('p', { class: 'note' }, `${r.serves} · ${r.time}`)]),
    h('div', { class: 'grid-2 vn-grid' }, [
      h('article', { class: 'card' }, [h('h3', null, 'Nguyên liệu'), h('ul', { class: 'vn-list' }, r.ingredients.map((x) => h('li', null, x)))]),
      h('article', { class: 'card' }, [h('h3', null, 'Các bước'), h('ol', { class: 'vn-list vn-steps' }, r.steps.map((x) => h('li', null, x)))]),
    ]),
    r.tips && r.tips.length ? h('article', { class: 'card' }, [h('h3', null, 'Mẹo nhỏ'), h('ul', { class: 'vn-list' }, r.tips.map((x) => h('li', null, x)))]) : null,
    h('p', { class: 'note vn-disclaimer' }, 'Công thức rút gọn theo cách làm phổ biến; khẩu vị và cách làm mỗi nhà một khác.'),
  )
}
