// Tiện ích giao diện dùng chung: tạo phần tử, thông báo nhanh, hộp thoại, lưu tùy chọn.
export const $ = (s, r = document) => r.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';

/* ---------------- tiện ích DOM ---------------- */
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
export function icon(id) {
  const s = document.createElementNS(SVGNS, 'svg');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', '#i-' + id);
  s.append(u);
  return s;
}
let toastTimer;
export function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
export const pref = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('9scanner.' + k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('9scanner.' + k, JSON.stringify(v)); } catch (e) { /* bị chặn: bỏ qua */ } },
};

export function openModal(build, { center = false } = {}) {
  const m = h('div', { class: 'modal' + (center ? ' center' : '') });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const api = { close() { m.remove(); if (api.onclose) api.onclose(); }, el: sheet };
  m.addEventListener('pointerdown', (e) => { if (e.target === m) api.close(); });
  build(sheet, api);
  m.append(sheet);
  $('#overlay-root').append(m);
  return api;
}
export function askText(title, value = '', okLabel = 'Lưu') {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal((sheet, api) => {
      const inp = h('input', { type: 'text', value, maxlength: '60', 'aria-label': title });
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(inp.value.trim() || null); });
      sheet.append(h('h2', { text: title }), inp,
        h('div', { class: 'actions' },
          h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(null) }),
          h('button', { class: 'btn primary', text: okLabel, onclick: () => finish(inp.value.trim() || null) })));
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    }, { center: true });
    m.onclose = () => { if (!done) { done = true; resolve(null); } };
  });
}
export function confirmDlg(title, msg, okLabel = 'Đồng ý', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal((sheet, api) => {
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      sheet.append(h('h2', { text: title }), h('p', { text: msg }),
        h('div', { class: 'actions' },
          h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(false) }),
          h('button', { class: 'btn primary', text: okLabel, onclick: () => finish(true) })));
    }, { center: true });
    m.onclose = () => { if (!done) { done = true; resolve(false); } };
    void danger;
  });
}
export function actionSheet(title, items) {
  openModal((sheet, api) => {
    sheet.append(h('h2', { text: title }));
    for (const it of items) {
      sheet.append(h('button', { class: 'list-btn' + (it.danger ? ' danger' : ''), onclick: () => { api.close(); it.fn(); } }, icon(it.icon || 'file'), it.label));
    }
  });
}

