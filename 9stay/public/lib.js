// Thư viện nhỏ dùng chung: dựng DOM an toàn (không innerHTML), gọi API, định dạng tiền và ngày.

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export class ApiError extends Error {
  constructor(status, code, message, detail) { super(message); this.status = status; this.code = code; this.detail = detail; }
}

// Mọi yêu cầu đổi dữ liệu mang header X-Requested-With: 9stay (chống CSRF). Đường dẫn tương đối so với <base>.
export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(new URL(path, document.baseURI), {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { 'x-requested-with': '9stay' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network', 'Mất kết nối, hãy kiểm tra mạng rồi thử lại');
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  if (!res.ok) throw new ApiError(res.status, json && json.error && json.error.code, (json && json.error && json.error.message) || `Lỗi ${res.status}`, json && json.error && json.error.detail);
  return json;
}

export const money = (n) => (n === null || n === undefined ? '' : new Intl.NumberFormat('vi-VN').format(n) + 'đ');
export const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
export const dm = (iso) => (iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : '');

// Hôm nay theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ máy.
export const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = (iso) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(iso + 'T00:00:00Z').getUTCDay()];
export const monthStart = (iso) => iso.slice(0, 8) + '01';
export function nextMonthStart(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export const STATUS = { giu: 'Giữ chỗ', da_coc: 'Đã cọc', da_nhan: 'Đang ở', da_tra: 'Đã trả', huy: 'Đã hủy', khong_den: 'Không đến', het_han: 'Hết hạn' };
export const chip = (status) => h('span', { class: 'chip ' + status, text: STATUS[status] || status });
export const ROLE = { quanly: 'Quản lý', letan: 'Lễ tân', buongphong: 'Buồng phòng', ctv: 'Cộng tác viên', sale: 'Sale', chu: 'Chủ phòng' };

export function toast(msg, bad = false) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg });
  box.append(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

// Hiện lỗi API ngay trong khối (không dùng alert), kèm gợi ý khi đơn bị sửa bởi người khác.
export function showError(box, e) {
  const msg = (e && e.message) || 'Có lỗi xảy ra';
  box.replaceChildren(h('div', { class: 'err', role: 'alert', text: msg }));
}

// Chạy một hành động có nút: khóa nút trong lúc chạy, lỗi hiện ở box.
export async function run(btn, box, fn) {
  if (btn) btn.disabled = true;
  if (box) box.replaceChildren();
  try { return await fn(); } catch (e) { if (box) showError(box, e); else toast(e.message, true); return undefined; } finally { if (btn) btn.disabled = false; }
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Math.random().toString(16).slice(2) + Date.now().toString(16));

export function field(label, input, id) {
  const lid = id || 'f' + Math.random().toString(36).slice(2, 8);
  input.id = lid;
  return h('div', null, h('label', { for: lid, text: label }), input);
}

export function select(options, value, props) {
  const s = h('select', props);
  for (const [v, text] of options) s.append(h('option', { value: v, text, selected: v === value }));
  return s;
}

export function ints(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  return t.split(/[,\s]+/).filter(Boolean).map(Number);
}
