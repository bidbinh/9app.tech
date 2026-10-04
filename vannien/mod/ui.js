/** Tiện ích giao diện dùng chung cho các mô-đun Vạn Niên: tạo phần tử, lưu cục bộ, thông báo, chia sẻ. */

export function h(tag, props, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v === null || v === undefined) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = v
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, String(v))
  }
  append(el, kids)
  return el
}

export function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  }
  return el
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild)
  return el
}

/* Lưu cục bộ: mọi thao tác đều bọc try/catch, trang vẫn chạy khi bị chặn (chế độ riêng tư, v.v.). */
const memory = new Map()
/** Giá trị đọc ra phải cùng kiểu với giá trị mặc định (mảng, đối tượng thường, chuỗi, số), nếu không dùng mặc định. */
export function sameKind(value, fallback) {
  if (Array.isArray(fallback)) return Array.isArray(value)
  if (fallback !== null && typeof fallback === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (typeof fallback === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === typeof fallback
}

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key)
      const v = raw === null ? (memory.has(key) ? memory.get(key) : fallback) : JSON.parse(raw)
      return sameKind(v, fallback) ? v : fallback
    } catch {
      const v = memory.has(key) ? memory.get(key) : fallback
      return sameKind(v, fallback) ? v : fallback
    }
  },
  set(key, value) {
    memory.set(key, value)
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
  remove(key) {
    memory.delete(key)
    try {
      localStorage.removeItem(key)
    } catch {
      /* bỏ qua */
    }
  },
}

let toastTimer = 0
export function toast(msg) {
  let t = document.getElementById('vn-toast')
  if (!t) {
    t = h('div', { id: 'vn-toast', class: 'vn-toast', role: 'status', 'aria-live': 'polite' })
    document.body.append(t)
  }
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = h('textarea', { style: 'position:fixed;left:-999px;top:0', 'aria-hidden': 'true' })
      ta.value = text
      document.body.append(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Chia sẻ qua Web Share (Zalo, tin nhắn...). Không có thì sao chép vào bộ nhớ tạm. */
export async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel'
    }
  }
  const ok = await copyText(text)
  toast(ok ? 'Đã sao chép. Bạn dán vào Zalo hoặc tin nhắn để gửi.' : 'Không thể sao chép trên trình duyệt này.')
  return ok ? 'copied' : 'failed'
}

export function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}
