/**
 * Mô-đun Văn khấn + Mâm cúng gắn vào Vạn Niên (không sửa bản dựng có sẵn).
 * Định tuyến theo hash:
 *   #/van-khan, #/van-khan/<id>
 *   #/mam-cung, #/mam-cung/<id>, #/mam-cung/ngu-qua, #/mam-cung/cong-thuc/<id>
 *   #/ve-noi-dung
 *   #/hom-nay, #/lich, #/xem-ngay, #/phong-thuy   (các tab cũ, mở thẳng bằng link)
 * Thanh điều hướng có 5 mục: Hôm nay · Tháng · Xem ngày · Cúng lễ (Văn khấn | Mâm cúng) · Phong thủy.
 */
import { h, clear } from './ui.js?v=5'
import { vnToday, dateInfo, parseHash } from './logic.js?v=5'
import * as VK from './vankhan.js?v=5'
import * as MC from './mam.js?v=5'

const TAB_ROUTES = ['hom-nay', 'lich', 'xem-ngay', 'phong-thuy']
const MODULE_ROUTES = new Set(['van-khan', 'mam-cung', 've-noi-dung'])
const VERSION = '5' // do scripts/bump-version.mjs cập nhật
const BASE_TITLE = document.title

let data = null
let dataPromise = null
let main = null
let body = null
let kickerEl = null
let titleEl = null
let lunarEl = null
let programmatic = false
let leaveFns = []
let lastRendered = ''
let handledBefore = false
let moduleActive = false
let routeSeq = 0

const loadJSON = async (name) => {
  const res = await fetch(new URL(`./data/${name}?v=${VERSION}`, import.meta.url))
  if (!res.ok) throw new Error(`${name}: ${res.status}`)
  return res.json()
}
function ensureData() {
  if (data) return Promise.resolve(data)
  if (!dataPromise) {
    dataPromise = Promise.all([loadJSON('van-khan.json'), loadJSON('mam-cung.json')]).then(([vk, mc]) => (data = { vk, mc }))
    dataPromise.catch(() => (dataPromise = null))
  }
  return dataPromise
}

/* ---------- Hash ---------- */
function navigate(hash, opts = {}) {
  const fn = opts.replace ? 'replaceState' : 'pushState'
  try {
    history[fn](opts.state || null, '', hash)
  } catch {
    location.hash = hash
    return
  }
  route()
}

/* ---------- Khung giao diện ---------- */
const ICONS = {
  khan:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10.5a1.5 1.5 0 0 1 1.5 1.5v13a2 2 0 0 0 2 2H8.5a2 2 0 0 1-2-2V4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 8.5h6M9.5 11.5h6M9.5 14.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6.5 4A1.5 1.5 0 0 0 5 5.5V7h1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  mam:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 8.5c0-1.4 1-1.9 1-3.2M12 8.5c0-1.4 1-1.9 1-3.2M16 8.5c0-1.4 1-1.9 1-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>',
}
function iconSpan(key) {
  const s = document.createElement('span')
  s.className = 'vn-ico'
  s.innerHTML = ICONS[key] // chuỗi tĩnh do mã nguồn này viết, không lấy từ người dùng
  return s
}

const HOME_HOSTS = ['9app.tech', 'www.9app.tech', 'localhost', '127.0.0.1']
const homeHref = () => (HOME_HOSTS.includes(location.hostname) ? '/' : 'https://9app.tech/')

/** Hai thẻ con của màn Cúng lễ: Văn khấn | Mâm cúng. */
const SUBTABS = [
  { route: 'van-khan', label: 'Văn khấn' },
  { route: 'mam-cung', label: 'Mâm cúng' },
]
let subtabsEl = null

function mountShell() {
  const app = document.querySelector('.app')
  if (!app || document.getElementById('vn-main')) return !!document.getElementById('vn-main')
  const reactMain = app.querySelector(':scope > .main')
  const nav = app.querySelector('.nav')
  const mobile = app.querySelector('.mobile-nav')
  if (!reactMain || !nav || !mobile) return false

  kickerEl = h('p', { class: 'kicker' })
  titleEl = h('h2')
  lunarEl = h('div', { class: 'clock', id: 'vn-lunar' })
  body = h('div', { class: 'vn-body', id: 'vn-body' })
  subtabsEl = h(
    'div',
    { class: 'vn-subtabs', role: 'tablist', 'aria-label': 'Cúng lễ' },
    SUBTABS.map((t) => h('a', { class: 'vn-subtab', href: `#/${t.route}`, role: 'tab', 'data-sub': t.route }, t.label)),
  )
  main = h('main', { class: 'main vn-main', id: 'vn-main', hidden: true }, [
    h('header', { class: 'topbar' }, [
      h('a', { class: 'home9 ve-9app', 'data-ve-9app': '', href: homeHref(), 'aria-label': 'Về 9app' }, [h('span', { class: 'chev', 'aria-hidden': 'true' }, '‹'), '9app']),
      h('div', { class: 'titles' }, [kickerEl, titleEl]),
      lunarEl,
    ]),
    subtabsEl,
    body,
  ])
  reactMain.after(main)

  // Mục "Cúng lễ" do bản dựng vẽ sẵn (không bị trễ khi mô-đun tải chậm). Bản dựng cũ chưa có thì thêm vào đây.
  for (const [parent, cls, beforeSel] of [
    [nav, 'nav-btn', ':scope > .nav-btn:not(.vn-btn-nav):last-of-type'],
    [mobile, 'tab-btn', ':scope > .tab-btn:not(.vn-btn-nav):last-of-type'],
  ]) {
    if (parent.querySelector('.vn-btn-nav')) continue
    const a = h('a', { class: `${cls} vn-btn-nav`, href: '#/van-khan', 'data-route': 'cung-le' }, [
      h('span', { class: 'ico' }, [iconSpan('mam')]),
      h('span', { class: 'lbl' }, 'Cúng lễ'),
    ])
    const last = parent.querySelector(beforeSel)
    if (last) last.before(a)
    else parent.append(a)
  }

  // Bấm tab cũ của Vạn Niên: ghi vào hash để Back và link trực tiếp hoạt động.
  document.addEventListener('click', (e) => {
    if (programmatic) return
    const b = e.target.closest && e.target.closest('.nav-btn:not(.vn-btn-nav), .tab-btn:not(.vn-btn-nav)')
    if (!b) return
    const siblings = [...b.parentElement.querySelectorAll(':scope > .nav-btn:not(.vn-btn-nav), :scope > .tab-btn:not(.vn-btn-nav)')]
    const idx = siblings.indexOf(b)
    if (idx < 0 || !TAB_ROUTES[idx]) return
    const target = `#/${TAB_ROUTES[idx]}`
    if (location.hash === target) return
    navigate(target, { replace: !moduleActive })
  })
  return true
}

function setModuleOn(on) {
  moduleActive = on
  document.body.classList.toggle('vn-on', on)
  if (main) main.hidden = !on
}

function setActiveNav(routeName) {
  // Văn khấn, Mâm cúng và Về nội dung đều thuộc mục "Cúng lễ" của thanh điều hướng.
  const inModule = routeName === 'van-khan' || routeName === 'mam-cung'
  document.querySelectorAll('.vn-btn-nav').forEach((a) => {
    a.classList.toggle('active', inModule)
    if (inModule) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
  if (subtabsEl) {
    subtabsEl.querySelectorAll('.vn-subtab').forEach((t) => {
      const on = t.dataset.sub === routeName
      t.classList.toggle('active', on)
      t.setAttribute('aria-selected', on ? 'true' : 'false')
    })
  }
}

function reactTabButtons() {
  const nav = document.querySelector('.app .nav')
  return nav ? [...nav.querySelectorAll(':scope > .nav-btn:not(.vn-btn-nav)')] : []
}
function activeReactTab() {
  return reactTabButtons().findIndex((b) => b.classList.contains('active'))
}
function selectReactTab(i) {
  const mobileBtns = [...document.querySelectorAll('.app .mobile-nav > .tab-btn:not(.vn-btn-nav)')]
  const btn = (getComputedStyle(document.querySelector('.sidebar') || document.body).display === 'none' ? mobileBtns : reactTabButtons())[i]
  if (!btn || activeReactTab() === i) return
  programmatic = true
  try {
    btn.click()
  } finally {
    programmatic = false
  }
}

const ctx = {
  get data() {
    return data
  },
  get body() {
    return body
  },
  setTitle(kicker, title) {
    kickerEl.textContent = kicker
    titleEl.textContent = title
    document.title = `${title} · Vạn Niên`
  },
  onLeave(fn) {
    leaveFns.push(fn)
  },
  navigate,
  markRendered() {
    lastRendered = location.hash
  },
  notFound(msg, href, label) {
    clear(body)
    ctx.setTitle('Vạn Niên', 'Không tìm thấy')
    body.append(h('article', { class: 'card' }, [h('p', { class: 'loi' }, msg), h('a', { class: 'vn-btn', href }, label)]))
  },
}

function runLeave() {
  const fns = leaveFns
  leaveFns = []
  for (const fn of fns) {
    try {
      fn()
    } catch {
      /* bỏ qua */
    }
  }
}

/* ---------- Trang Về nội dung ---------- */
function renderAbout() {
  const { vk, mc } = data
  clear(body)
  ctx.setTitle('Minh bạch nội dung', 'Về nội dung')
  const li = (t) => h('li', null, t)
  body.append(
    h('a', { class: 'vn-back', href: '#/van-khan' }, '‹ Văn khấn'),
    h('article', { class: 'card vn-head' }, [
      h('h3', null, 'Tham khảo theo phong tục'),
      h('p', { class: 'loi' }, vk.meta.disclaimer),
      h('p', { class: 'note' }, `Hiện có ${vk.items.length} bài khấn, ${mc.items.length + 1} mục mâm cúng (kể cả mâm ngũ quả ba miền) và ${mc.recipes.length} công thức món truyền thống.`),
    ]),
    h('article', { class: 'card' }, [
      h('h3', null, 'Cách soạn nội dung'),
      h('ul', { class: 'vn-list' }, [
        li('Các bài khấn do Vạn Niên tự soạn lại bằng lời văn riêng, theo khuôn mẫu truyền thống vẫn lưu truyền trong dân gian: mở đầu niệm Phật, kính lạy thần linh và gia tiên, báo danh, nêu việc, thỉnh cầu, kết lời. Không sao chép nguyên văn từ sách hoặc trang web có bản quyền.'),
        li('Những câu xưng hô cổ truyền ngắn như Hoàng thiên Hậu thổ, Bản cảnh Thành hoàng, Định phúc Táo quân là danh xưng chung của phong tục, không thuộc quyền riêng của ai.'),
        li('Danh sách đồ lễ, mâm cúng, công thức tổng hợp từ cách làm phổ biến trong gia đình Việt, viết lại bằng lời riêng.'),
        li('Đơn giá nguyên liệu mặc định chỉ là mức ước lệ để có con số bắt đầu, không phải giá thị trường. Bạn hãy sửa theo giá thực tế.'),
      ]),
    ]),
    h('article', { class: 'card' }, [
      h('h3', null, 'Nguồn tham khảo'),
      h('ul', { class: 'vn-list' }, [
        li('Phong tục thờ cúng và lễ tết của người Việt: kiến thức dân gian phổ thông, các tài liệu giới thiệu phong tục truyền thống đã được lưu hành rộng rãi.'),
        li('Lịch âm dương: thuật toán tính âm lịch Việt Nam (múi giờ GMT+7) của Hồ Ngọc Đức, đã dùng sẵn trong Vạn Niên.'),
        li('Ẩm thực: cách chế biến món cổ truyền phổ biến trong gia đình, không trích nguyên văn từ một công thức cụ thể.'),
      ]),
      h('p', { class: 'note' }, 'Lưu ý trung thực: nội dung chưa qua thẩm định của nhà nghiên cứu văn hóa hay chức sắc tôn giáo. Những điểm khác nhau theo vùng miền được ghi chú ngay tại từng bài.'),
    ]),
    h('article', { class: 'card' }, [
      h('h3', null, 'Quyền riêng tư'),
      h('p', { class: 'loi' }, 'Họ tên, địa chỉ, ngày giỗ, đơn giá và các mâm bạn lưu chỉ nằm trong bộ nhớ của trình duyệt trên máy bạn. Không đăng nhập, không gửi lên máy chủ.'),
    ]),
    h('div', { class: 'vn-links' }, [
      h('a', { class: 'tag vn-tag-link', href: '#/van-khan' }, 'Văn khấn'),
      h('a', { class: 'tag vn-tag-link', href: '#/mam-cung' }, 'Mâm cúng'),
    ]),
  )
}

/* ---------- Định tuyến ---------- */
async function route() {
  if (!main && !mountShell()) return
  const seq = ++routeSeq
  const hash = location.hash
  lastRendered = hash
  const { segs, q } = parseHash(hash)
  const first = segs[0]
  runLeave()

  const tab = TAB_ROUTES.indexOf(first)
  if (tab >= 0 || (!first && handledBefore)) {
    setModuleOn(false)
    setActiveNav('')
    document.title = BASE_TITLE
    selectReactTab(tab >= 0 ? tab : 0)
    handledBefore = true
    window.scrollTo(0, 0)
    return
  }
  if (!MODULE_ROUTES.has(first)) {
    setModuleOn(false)
    setActiveNav('')
    document.title = BASE_TITLE
    return
  }

  handledBefore = true
  setModuleOn(true)
  setActiveNav(first === 've-noi-dung' ? 'van-khan' : first)
  try {
    await ensureData()
  } catch {
    clear(body)
    ctx.setTitle('Vạn Niên', 'Không tải được dữ liệu')
    body.append(h('article', { class: 'card' }, [h('p', { class: 'loi' }, 'Không tải được dữ liệu văn khấn và mâm cúng. Hãy kiểm tra kết nối mạng rồi tải lại trang.')]))
    return
  }
  if (seq !== routeSeq) return
  const info = dateInfo(vnToday())
  lunarEl.textContent = `Hôm nay ${info.lunar.day}/${info.lunar.month} âm · ${info.nam_cc}`

  const [, second, third] = segs
  if (first === 'van-khan') {
    if (second) VK.renderDetail(ctx, second, q)
    else VK.renderList(ctx)
  } else if (first === 'mam-cung') {
    if (second === 'ngu-qua') MC.renderNguQua(ctx, q)
    else if (second === 'cong-thuc' && third) MC.renderRecipe(ctx, third)
    else if (second) MC.renderDetail(ctx, second, q)
    else MC.renderList(ctx)
  } else {
    renderAbout()
  }
  if (!ctx._keepScroll) window.scrollTo(0, 0)
}

function onHashChange() {
  if (location.hash === lastRendered) return
  route()
}

function boot() {
  const start = () => {
    if (!mountShell()) return false
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('popstate', onHashChange)
    window.addEventListener('pagehide', () => runLeave())
    route()
    return true
  }
  if (start()) return
  const obs = new MutationObserver(() => {
    if (start()) obs.disconnect()
  })
  obs.observe(document.documentElement, { childList: true, subtree: true })
}

boot()

// Thanh dự phòng của /js/homebar.js (#n9-bar + html.n9-pad) chỉ cần khi trang chưa có nút ‹ 9app.
// Vạn Niên đã có nút của riêng mình (.ve-9app trong tiêu đề), nên gỡ thanh trống và đệm 44 px còn sót lại.
function dropEmptyHomeBar() {
  const root = document.documentElement
  const bar = document.getElementById('n9-bar')
  if (bar && !bar.querySelector('a')) bar.remove()
  if (!document.getElementById('n9-bar') && root.classList.contains('n9-pad')) root.classList.remove('n9-pad')
}
dropEmptyHomeBar()
{
  const o = new MutationObserver(dropEmptyHomeBar)
  o.observe(document.documentElement, { childList: true, subtree: true })
  setTimeout(() => o.disconnect(), 8000)
}
