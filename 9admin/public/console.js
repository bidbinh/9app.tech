/* 9app Console — giao diện quản trị (desktop). Mọi dữ liệu hiển thị bằng textContent; không dùng innerHTML. */
(() => {
  'use strict';
  const root = document.getElementById('root');
  const modalRoot = document.getElementById('modal-root');
  const S = { admin: null, apps: [], timer: null };

  // ---------- tiện ích ----------
  const h = (tag, attrs = {}, kids = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(kids)) { if (c === null || c === undefined || c === false) continue; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }
    return el;
  };
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  const vnd = (n) => (Math.round(Number(n)) || 0).toLocaleString('vi-VN') + ' đ';
  const fmtDT = (d) => (d ? new Date(d).toLocaleString('vi-VN', { hour12: false }) : '—');
  const fmtD = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');
  const ago = (d) => {
    if (!d) return 'chưa lần nào';
    const s = Math.max(0, (Date.now() - new Date(d)) / 1000);
    return s < 90 ? 'vừa xong' : s < 5400 ? Math.round(s / 60) + ' phút trước' : s < 129600 ? Math.round(s / 3600) + ' giờ trước' : Math.round(s / 86400) + ' ngày trước';
  };
  const toast = (m) => { const t = document.getElementById('toast'); t.textContent = m; t.className = 'toast'; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast hidden'; }, 3800); };
  const todayISO = (off = 0) => { const d = new Date(Date.now() + off * 86400000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  async function api(method, path, body) {
    const res = await fetch('api' + path, { method, headers: { 'X-Requested-With': 'console', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = null; try { j = await res.json(); } catch { /* không phải JSON */ }
    if (!res.ok) {
      const e = new Error((j && j.error && j.error.message) || `Lỗi ${res.status}`); e.status = res.status; e.code = j && j.error && j.error.code; e.details = j && j.error && j.error.details;
      if (res.status === 401 && S.admin) { S.admin = null; render(); }
      throw e;
    }
    return j;
  }
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message); } };

  // ---------- biểu tượng nhỏ ----------
  const ICONS = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10', money: 'M3 6h18v12H3zM12 9v6M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.5 2.5 1.5-1 1.3-2.5 1.5-2.5.6-2.5 1.5 1 1.5 2.5 1.5 2.5-.5 2.5-1.5',
    users: 'M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM21 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    app: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    log: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 12h6M9 16h4',
  };
  const ico = (name, size = 18) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.app); svg.appendChild(p); return svg;
  };

  // ---------- định dạng ô ----------
  function cell(format, v) {
    if (v === null || v === undefined || v === '') return '—';
    switch (format) {
      case 'money': return vnd(v);
      case 'int': return Number(v).toLocaleString('vi-VN');
      case 'date': return fmtD(v);
      case 'datetime': return fmtDT(v);
      case 'phone': return String(v);
      case 'status': return h('span', { class: 'badge ' + statusTone(String(v)), text: String(v) });
      case 'link': return /^(https:\/\/|\/)/.test(String(v)) ? h('a', { href: String(v), target: '_blank', rel: 'noopener', text: 'Mở' }) : String(v);
      default: return String(v);
    }
  }
  function statusTone(s) {
    const x = s.toLowerCase();
    if (/(lỗi|thất bại|failed|rejected|bị từ chối|khóa|hủy|cancel|bad|quá hạn|đã hủy)/.test(x)) return 'bad';
    if (/(chờ|requested|pending|đang|approved|unknown|kiểm tra|attention|warn)/.test(x)) return 'warn';
    if (/(ok|đã|paid|active|hoàn tất|delivered|captured|matched|resolved|done)/.test(x)) return 'ok';
    return '';
  }

  // ---------- biểu đồ cột ----------
  function barChart(days, series) {
    const W = 760; const H = 190; const pad = { l: 56, r: 8, t: 10, b: 24 };
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('preserveAspectRatio', 'none');
    const max = Math.max(1, ...days.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
    const mk = (tag, attrs, text) => { const e = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; svg.appendChild(e); return e; };
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (H - pad.t - pad.b) * (1 - i / 4);
      mk('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: '#e5e9f2', 'stroke-width': 1 });
      const v = max * i / 4; mk('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#94a3b8' }, v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '') + 'tr' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v));
    }
    if (!days.length) { mk('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', 'font-size': 13, fill: '#94a3b8' }, 'Chưa có dữ liệu'); return svg; }
    const bw = (W - pad.l - pad.r) / days.length; const gw = Math.min(bw * 0.8, 40); const sw = gw / series.length;
    days.forEach((d, i) => {
      const x0 = pad.l + bw * i + (bw - gw) / 2;
      series.forEach((s, j) => {
        const v = Number(d[s.key]) || 0; const hh = (H - pad.t - pad.b) * v / max;
        const r = mk('rect', { x: x0 + sw * j, y: H - pad.b - hh, width: Math.max(1, sw - 1), height: hh, rx: 2, fill: s.color });
        const t = document.createElementNS(svgNS, 'title'); t.textContent = `${d.day} · ${s.label}: ${vnd(v)}`; r.appendChild(t);
      });
      if (days.length <= 16 || i % Math.ceil(days.length / 12) === 0) mk('text', { x: x0 + gw / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: '#94a3b8' }, d.day.slice(5));
    });
    return svg;
  }
  const legend = (series) => h('div', { class: 'legend' }, series.map((s) => h('span', {}, [h('i', { style: 'background:' + s.color }), s.label])));

  // ---------- bảng chung ----------
  function table(cols, rows, { onRow, empty = 'Không có dữ liệu' } = {}) {
    if (!rows.length) return h('div', { class: 'empty', text: empty });
    return h('table', { class: 't' }, [
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.num ? 'num' : '', text: c.label })))),
      h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null }, cols.map((c) => h('td', { class: c.num ? 'num' : '' }, [c.render ? c.render(r) : cell(c.format, r[c.key])]))))),
    ]);
  }
  const pager = (page, pageSize, total, go) => {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return h('div', { class: 'pager' }, [h('span', { text: `${total.toLocaleString('vi-VN')} bản ghi · trang ${page}/${pages}` }), h('button', { class: 'btn ghost sm', disabled: page <= 1, text: '‹ Trước', onclick: () => go(page - 1) }), h('button', { class: 'btn ghost sm', disabled: page >= pages, text: 'Sau ›', onclick: () => go(page + 1) })]);
  };
  const kpi = (label, value, hint, tone = '') => h('div', { class: 'kpi ' + tone }, [h('div', { class: 'lb', text: label }), h('div', { class: 'v', text: value }), hint ? h('div', { class: 'h', text: hint }) : null]);

  function modal({ title, body, confirmText = 'Xác nhận', tone = '', inputs = [], onSubmit }) {
    const vals = {};
    const fields = inputs.map((i) => {
      const el = i.type === 'textarea' ? h('textarea', { name: i.name }) : h('input', { type: i.type === 'number' ? 'number' : 'text', name: i.name });
      el.addEventListener('input', () => { vals[i.name] = el.value; });
      return h('div', {}, [h('label', { text: i.label }), el]);
    });
    const err = h('div', { class: 'small neg', style: 'min-height:18px;margin-top:8px' });
    const ok = h('button', { class: 'btn' + (tone === 'danger' ? ' danger' : ''), text: confirmText, onclick: async () => {
      ok.disabled = true;
      try { await onSubmit(vals); close(); } catch (e) { err.textContent = e.message; ok.disabled = false; }
    } });
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      h('h3', { text: title }), body ? h('p', { class: 'muted', text: body }) : null, ...fields, err,
      h('div', { class: 'foot' }, [h('button', { class: 'btn ghost', text: 'Hủy', onclick: () => close() }), ok]),
    ]));
    const close = () => back.remove();
    modalRoot.appendChild(back);
    const first = back.querySelector('input,textarea'); if (first) first.focus();
  }

  // ---------- khung chính ----------
  const routeParts = () => (location.hash || '#/').replace(/^#\/?/, '').split('/').map(decodeURIComponent);

  function shell(title, content, actions = []) {
    const [r0, r1] = routeParts();
    const nav = (href, icon, label, on) => h('a', { class: 'nav' + (on ? ' on' : ''), href }, [ico(icon), label]);
    const side = h('aside', { class: 'side' }, [
      h('div', { class: 'brand' }, [h('img', { src: 'icon.svg', alt: '' }), '9app Console']),
      h('div', { class: 'grp', text: 'Tổng hợp' }),
      nav('#/', 'home', 'Tổng quan', !r0),
      nav('#/money', 'money', 'Dòng tiền', r0 === 'money'),
      nav('#/users', 'users', 'Người dùng', r0 === 'users'),
      h('div', { class: 'grp', text: 'Ứng dụng' }),
      ...S.apps.filter((a) => a.enabled).map((a) => h('a', { class: 'nav' + (r0 === 'app' && r1 === a.id ? ' on' : ''), href: '#/app/' + a.id }, [h('span', { class: 'dot ' + a.status }), a.name])),
      h('div', { class: 'grp', text: 'Hệ thống' }),
      nav('#/system', 'cog', 'Kết nối ứng dụng', r0 === 'system'),
      nav('#/audit', 'log', 'Nhật ký thao tác', r0 === 'audit'),
      h('div', { class: 'foot', text: 'Đăng nhập: ' + S.admin.username }),
    ]);
    const top = h('header', { class: 'top' }, [h('h1', { text: title }), h('div', { class: 'actions' }, [
      ...actions,
      h('button', { class: 'btn ghost sm', text: 'Đồng bộ ngay', onclick: guard(async () => { toast('Đang đồng bộ…'); await api('POST', '/sync'); toast('Đã đồng bộ'); await loadApps(); route(); }) }),
      h('button', { class: 'btn ghost sm', text: 'Đăng xuất', onclick: guard(async () => { await api('POST', '/logout', {}); S.admin = null; render(); }) }),
    ])]);
    clear(root);
    root.appendChild(h('div', { class: 'shell' }, [side, h('main', { class: 'main' }, [top, h('div', { class: 'page' }, content)])]));
  }

  // ---------- đăng nhập ----------
  function loginView() {
    const err = h('div', { class: 'err' });
    const u = h('input', { type: 'text', autocomplete: 'username', id: 'u' });
    const p = h('input', { type: 'password', autocomplete: 'current-password', id: 'p' });
    const t = h('input', { type: 'text', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', id: 't', placeholder: '6 số' });
    const go = async () => {
      err.textContent = ''; btn.disabled = true;
      try { const r = await api('POST', '/login', { username: u.value, password: p.value, totp: t.value }); S.admin = r.admin; await loadApps(); route(); } catch (e) { err.textContent = e.message; btn.disabled = false; p.value = ''; t.value = ''; }
    };
    const btn = h('button', { class: 'btn block', text: 'Đăng nhập', onclick: go });
    [u, p, t].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
    clear(root);
    root.appendChild(h('div', { class: 'login' }, h('div', { class: 'login-card' }, [
      h('div', { class: 'logo' }, [h('img', { src: 'icon.svg', alt: '' }), h('div', {}, [h('h1', { text: '9app Console' }), h('p', { class: 'sub', text: 'Quản trị chung các ứng dụng 9app.tech' })])]),
      h('label', { text: 'Tên đăng nhập', for: 'u' }), u, h('label', { text: 'Mật khẩu', for: 'p' }), p, h('label', { text: 'Mã xác thực (Authenticator)', for: 't' }), t, err, btn,
    ])));
    u.focus();
  }

  // ---------- Tổng quan ----------
  async function overviewView() {
    const o = await api('GET', '/overview');
    const a = o.money30;
    const cards = o.apps.map((c) => h('div', { class: 'card appcard' }, [
      h('div', {}, [h('div', { class: 'b' }, [h('a', { href: '#/app/' + c.id, text: c.name })]), h('div', { class: 'small muted', text: c.status === 'ok' ? 'Đồng bộ ' + ago(c.checkedAt) : (c.detail || 'Chưa kết nối') })]),
      h('span', { class: 'statusline' }, [h('i', { class: c.status }), { ok: 'Hoạt động', stale: 'Dữ liệu cũ', down: 'Lỗi', unknown: 'Chưa kiểm tra' }[c.status]]),
    ]));
    shell('Tổng quan', [
      h('div', { class: 'grid g6', style: 'margin-bottom:18px' }, [
        kpi('Doanh thu 30 ngày', vnd(a.revenue), 'tính theo kết quả kinh doanh', 'brand'),
        kpi('Chi phí 30 ngày', vnd(a.expense), null, 'warn'),
        kpi('Lãi gộp 30 ngày', vnd(a.revenue - a.expense), null, a.revenue - a.expense >= 0 ? 'ok' : 'bad'),
        kpi('Tiền vào ngân hàng', vnd(a.cash_in), '30 ngày', 'info'),
        kpi('Tiền khách giữ hộ', vnd(o.customerFunds), 'số dư ví đang giữ — không phải doanh thu', 'warn'),
        kpi('Người dùng', o.users.total.toLocaleString('vi-VN'), `+${o.users.new7} trong 7 ngày`),
      ]),
      o.alerts.length ? h('div', { class: 'card' }, [h('h2', { text: `Cần chú ý (${o.alerts.length})` }), ...o.alerts.slice(0, 12).map((x) => h('div', { class: 'alert ' + (x.level === 'info' ? '' : x.level) }, [h('span', {}, [h('b', { text: x.appName + ': ' }), x.text]), h('a', { href: '#/app/' + x.app + (x.panel ? '/' + x.panel : ''), text: 'Xử lý ›' })]))]) : h('div', { class: 'card' }, [h('h2', { text: 'Không có cảnh báo' }), h('div', { class: 'muted', text: 'Mọi ứng dụng đang hoạt động bình thường.' })]),
      h('div', { class: 'grid g2' }, [
        h('div', { class: 'card' }, [h('h2', { text: 'Doanh thu và tiền vào theo ngày (30 ngày)' }), barChart(o.daily, [{ key: 'revenue', label: 'Doanh thu', color: '#4f46e5' }, { key: 'cash_in', label: 'Tiền vào ngân hàng', color: '#38bdf8' }]), legend([{ label: 'Doanh thu', color: '#4f46e5' }, { label: 'Tiền vào ngân hàng', color: '#38bdf8' }])]),
        h('div', { class: 'card' }, [h('h2', { text: 'Ứng dụng' }), ...cards]),
      ]),
    ]);
  }

  // ---------- Dòng tiền ----------
  const KIND = { cash_in: ['Tiền vào', 'info'], cash_out: ['Tiền ra', 'warn'], revenue: ['Doanh thu', 'ok'], expense: ['Chi phí', 'bad'] };
  async function moneyView() {
    const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    const f = { from: q.from || todayISO(-29), to: q.to || todayISO(0), app: q.app || '', kind: q.kind || '', q: q.q || '', page: Number(q.page) || 1 };
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== 0))).toString();
    const m = await api('GET', '/money?' + qs);
    const set = (patch) => { const n = { ...f, ...patch }; if (!('page' in patch)) n.page = 1; location.hash = '#/money?' + new URLSearchParams(Object.fromEntries(Object.entries(n).filter(([, v]) => v !== '' && v !== 0))).toString(); };
    const inp = (id, type, val) => h('input', { type, id, value: val });
    const from = inp('f-from', 'date', f.from); const to = inp('f-to', 'date', f.to); const search = h('input', { type: 'search', id: 'f-q', value: f.q, placeholder: 'Tìm mô tả, mã, số điện thoại…' });
    const appSel = h('select', { id: 'f-app' }, [h('option', { value: '', text: 'Tất cả ứng dụng' }), ...S.apps.map((a) => h('option', { value: a.id, text: a.name, selected: a.id === f.app ? true : null }))]);
    const kindSel = h('select', { id: 'f-kind' }, [h('option', { value: '', text: 'Mọi loại' }), ...Object.entries(KIND).map(([k, v]) => h('option', { value: k, text: v[0], selected: k === f.kind ? true : null }))]);
    const apply = () => set({ from: from.value, to: to.value, app: appSel.value, kind: kindSel.value, q: search.value.trim() });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    const t = m.totals;
    shell('Dòng tiền', [
      h('div', { class: 'card' }, [h('div', { class: 'filters' }, [
        h('div', {}, [h('label', { text: 'Từ ngày' }), from]), h('div', {}, [h('label', { text: 'Đến ngày' }), to]), h('div', {}, [h('label', { text: 'Ứng dụng' }), appSel]), h('div', {}, [h('label', { text: 'Loại' }), kindSel]),
        h('div', {}, [h('label', { text: 'Tìm kiếm' }), search]), h('div', {}, [h('label', { html: null, text: ' ' }), h('button', { class: 'btn', text: 'Lọc', onclick: apply })]),
        h('div', {}, [h('label', { text: ' ' }), h('a', { class: 'btn ghost', href: 'api/money.csv?' + qs, text: 'Xuất CSV' })]),
      ])]),
      h('div', { class: 'grid g6', style: 'margin-bottom:18px' }, [
        kpi('Tiền vào ngân hàng', vnd(t.cashIn), null, 'info'), kpi('Tiền ra ngân hàng', vnd(t.cashOut), null, 'warn'), kpi('Dòng tiền thuần', vnd(t.netCash), 'vào − ra', t.netCash >= 0 ? 'ok' : 'bad'),
        kpi('Doanh thu', vnd(t.revenue), null, 'brand'), kpi('Chi phí', vnd(t.expense), null, 'warn'), kpi('Lãi gộp', vnd(t.grossProfit), 'doanh thu − chi phí', t.grossProfit >= 0 ? 'ok' : 'bad'),
      ]),
      h('div', { class: 'grid g2' }, [
        h('div', { class: 'card' }, [h('h2', { text: 'Tiền vào / ra theo ngày' }), barChart(m.daily, [{ key: 'cash_in', label: 'Vào', color: '#38bdf8' }, { key: 'cash_out', label: 'Ra', color: '#f59e0b' }]), legend([{ label: 'Tiền vào', color: '#38bdf8' }, { label: 'Tiền ra', color: '#f59e0b' }])]),
        h('div', { class: 'card' }, [h('h2', { text: 'Doanh thu / chi phí theo ngày' }), barChart(m.daily, [{ key: 'revenue', label: 'Doanh thu', color: '#4f46e5' }, { key: 'expense', label: 'Chi phí', color: '#ef4444' }]), legend([{ label: 'Doanh thu', color: '#4f46e5' }, { label: 'Chi phí', color: '#ef4444' }])]),
      ]),
      h('div', { class: 'grid g2' }, [
        h('div', { class: 'card' }, [h('h2', { text: 'Theo ứng dụng' }), table([
          { label: 'Ứng dụng', render: (r) => r.name }, { label: 'Tiền vào', num: true, render: (r) => vnd(r.cash_in) }, { label: 'Tiền ra', num: true, render: (r) => vnd(r.cash_out) },
          { label: 'Doanh thu', num: true, render: (r) => vnd(r.revenue) }, { label: 'Chi phí', num: true, render: (r) => vnd(r.expense) },
        ], m.perApp, { empty: 'Chưa có giao dịch trong khoảng này' })]),
        h('div', { class: 'card' }, [h('h2', { text: 'Số dư đang giữ' }), h('div', { class: 'desc', text: 'Tiền khách nạp vào ví là nợ phải trả, không tính vào doanh thu.' }),
          table([{ label: 'Ứng dụng', key: 'app_name' }, { label: 'Khoản', key: 'label' }, { label: 'Loại', render: (r) => ({ cash: 'Tiền mặt/ngân hàng', customer_funds: 'Tiền khách giữ hộ', receivable: 'Phải thu' }[r.kind]) }, { label: 'Số tiền', num: true, render: (r) => vnd(r.amount) }], m.balances.items, { empty: 'Chưa có số dư' }),
          h('div', { class: 'kv', style: 'margin-top:8px' }, [h('span', { text: 'Tổng tiền khách giữ hộ' }), h('b', { text: vnd(m.balances.customerFunds) })])]),
      ]),
      h('div', { class: 'card' }, [h('h2', { text: 'Giao dịch' }), table([
        { label: 'Thời gian', render: (r) => fmtDT(r.at) }, { label: 'Ứng dụng', key: 'app_name' }, { label: 'Loại', render: (r) => h('span', { class: 'badge ' + KIND[r.kind][1], text: KIND[r.kind][0] }) },
        { label: 'Số tiền', num: true, render: (r) => h('span', { class: r.kind === 'cash_out' || r.kind === 'expense' ? 'neg' : 'pos', text: (r.kind === 'cash_out' || r.kind === 'expense' ? '−' : '+') + vnd(r.amount) }) },
        { label: 'Danh mục', key: 'category' }, { label: 'Mô tả', key: 'description' }, { label: 'Tham chiếu', key: 'ref' }, { label: 'Số điện thoại', key: 'phone' },
      ], m.items, { empty: 'Không có giao dịch' }), pager(m.page, m.pageSize, t.count, (p) => set({ page: p }))]),
    ]);
  }

  // ---------- Người dùng ----------
  async function usersView() {
    const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    const f = { q: q.q || '', app: q.app || '', page: Number(q.page) || 1 };
    const r = await api('GET', '/users?' + new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== 0))).toString());
    const set = (patch) => { const n = { ...f, ...patch }; if (!('page' in patch)) n.page = 1; location.hash = '#/users?' + new URLSearchParams(Object.fromEntries(Object.entries(n).filter(([, v]) => v !== '' && v !== 0))).toString(); };
    const search = h('input', { type: 'search', value: f.q, placeholder: 'Tìm số điện thoại hoặc tên…' });
    const appSel = h('select', {}, [h('option', { value: '', text: 'Tất cả ứng dụng' }), ...S.apps.map((a) => h('option', { value: a.id, text: a.name, selected: a.id === f.app ? true : null }))]);
    const apply = () => set({ q: search.value.trim(), app: appSel.value });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    const names = Object.fromEntries(S.apps.map((a) => [a.id, a.name]));
    shell('Người dùng', [
      h('div', { class: 'grid g4', style: 'margin-bottom:18px' }, [kpi('Tổng người dùng (theo số điện thoại)', r.total.toLocaleString('vi-VN'), null, 'brand'), ...r.byApp.map((b) => kpi(names[b.app_id] || b.app_id, b.n.toLocaleString('vi-VN'), 'tài khoản'))]),
      h('div', { class: 'card' }, [h('div', { class: 'filters' }, [h('div', {}, [h('label', { text: 'Tìm kiếm' }), search]), h('div', {}, [h('label', { text: 'Ứng dụng' }), appSel]), h('div', {}, [h('label', { text: ' ' }), h('button', { class: 'btn', text: 'Lọc', onclick: apply })])]),
        table([
          { label: 'Số điện thoại', render: (u) => u.phone || '(không có số)' }, { label: 'Tên', key: 'name' },
          { label: 'Đang dùng', render: (u) => h('span', {}, u.accounts.map((a) => h('span', { class: 'badge ' + (a.status === 'active' ? 'brand' : 'bad'), style: 'margin-right:6px', text: names[a.app] || a.app }))) },
          { label: 'Tham gia', render: (u) => fmtD(u.first_seen) }, { label: 'Hoạt động gần nhất', render: (u) => ago(u.last_seen) },
        ], r.rows, { onRow: (u) => userDrawer(u.ukey), empty: 'Không có người dùng phù hợp' }), pager(r.page, r.pageSize, r.total, (p) => set({ page: p }))]),
    ]);
  }
  async function userDrawer(ukey) {
    const back = h('div', { class: 'drawer-back', onclick: (e) => { if (e.target === back) back.remove(); } });
    const panel = h('div', { class: 'drawer' }, [h('div', { class: 'muted', text: 'Đang tải…' })]);
    back.appendChild(panel); modalRoot.appendChild(back);
    try {
      const d = await api('GET', '/users/' + encodeURIComponent(ukey));
      clear(panel);
      panel.appendChild(h('div', { class: 'row sb' }, [h('h2', { style: 'margin:0', text: d.phone || ukey }), h('button', { class: 'btn ghost sm', text: 'Đóng', onclick: () => back.remove() })]));
      if (d.cash.length) panel.appendChild(h('div', { class: 'card', style: 'margin-top:16px' }, [h('h2', { text: 'Giao dịch của số này' }), table([{ label: 'Ứng dụng', key: 'app_id' }, { label: 'Tiền vào', num: true, render: (r) => vnd(r.cash_in) }, { label: 'Tiền ra', num: true, render: (r) => vnd(r.cash_out) }, { label: 'Doanh thu', num: true, render: (r) => vnd(r.revenue) }, { label: 'Số GD', num: true, key: 'n' }], d.cash)]));
      for (const x of d.details) {
        panel.appendChild(h('div', { class: 'card', style: 'margin-top:16px' }, [
          h('div', { class: 'row sb' }, [h('h2', { style: 'margin:0', text: x.appName }), h('span', { class: 'badge ' + (x.status === 'active' ? 'ok' : 'bad'), text: x.status })]),
          x.ok ? h('div', { style: 'margin-top:8px' }, x.fields.map((fl) => h('div', { class: 'kv' }, [h('span', { class: 'muted', text: fl.label }), h('b', {}, [cell(fl.format, fl.value)])]))) : h('div', { class: 'alert warn', style: 'margin-top:10px', text: 'Không lấy được chi tiết trực tiếp: ' + x.error }),
        ]));
      }
    } catch (e) { clear(panel); panel.appendChild(h('div', { class: 'alert bad', text: e.message })); }
  }

  // ---------- Trang từng app ----------
  async function appView() {
    const [, id, pid] = routeParts();
    const a = await api('GET', '/apps/' + encodeURIComponent(id));
    const tabs = [{ id: '', label: 'Tổng quan' }, ...a.panels.map((p) => ({ id: p.id, label: p.title }))];
    const cur = pid || '';
    const head = h('div', { class: 'tabs' }, tabs.map((t) => h('a', { class: t.id === cur ? 'on' : '', href: '#/app/' + id + (t.id ? '/' + t.id : ''), text: t.label })));
    const actions = a.adminUrl ? [h('a', { class: 'btn ghost sm', href: a.adminUrl, target: '_blank', rel: 'noopener', text: 'Mở trang quản trị riêng ↗' })] : [];
    if (!cur) {
      shell(a.name, [head,
        h('div', { class: 'row', style: 'margin-bottom:14px' }, [h('span', { class: 'statusline' }, [h('i', { class: a.status }), { ok: 'Hoạt động', stale: 'Dữ liệu cũ', down: 'Lỗi kết nối', unknown: 'Chưa kiểm tra' }[a.status]]), h('span', { class: 'muted small', style: 'margin-left:14px', text: `Kiểm tra ${ago(a.checkedAt)}${a.detail ? ' · ' + a.detail : ''}` })]),
        a.summary.kpis.length ? h('div', { class: 'grid g4', style: 'margin-bottom:18px' }, a.summary.kpis.map((k) => kpi(k.label, k.format === 'money' ? vnd(k.value) : k.format === 'int' ? Number(k.value).toLocaleString('vi-VN') : String(k.value ?? '—'), k.hint, k.tone))) : h('div', { class: 'card empty', text: 'App chưa cung cấp chỉ số.' }),
        a.summary.alerts.length ? h('div', { class: 'card' }, [h('h2', { text: 'Cảnh báo' }), ...a.summary.alerts.map((x) => h('div', { class: 'alert ' + (x.level === 'info' ? '' : x.level) }, [h('span', { text: x.text }), x.panel ? h('a', { href: '#/app/' + id + '/' + x.panel, text: 'Xử lý ›' }) : null]))]) : null,
        h('div', { class: 'card' }, [h('h2', { text: 'Đồng bộ' }), table([{ label: 'Luồng', key: 'stream' }, { label: 'Lần cuối', render: (r) => ago(r.last_ok_at) }, { label: 'Bản ghi', num: true, key: 'last_count' }, { label: 'Lỗi', render: (r) => r.last_error || '—' }], a.sync, { empty: 'Chưa đồng bộ' })]),
      ], actions);
      return;
    }
    const panel = a.panels.find((p) => p.id === cur);
    if (!panel) { shell(a.name, [head, h('div', { class: 'card empty', text: 'Không có bảng này.' })], actions); return; }
    const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    const page = Number(q.page) || 1;
    const data = await api('GET', `/apps/${encodeURIComponent(id)}/panels/${encodeURIComponent(cur)}?page=${page}&q=${encodeURIComponent(q.q || '')}`);
    const cols = panel.columns.map((c) => ({ label: c.label, num: c.format === 'money' || c.format === 'int', render: (r) => cell(c.format, r[c.key]) }));
    if (panel.rowActions.length) {
      cols.push({ label: '', render: (r) => h('span', {}, panel.rowActions.filter((x) => !x.when || x.when.in.includes(String(r[x.when.key]))).map((x) => h('button', {
        class: 'btn sm ' + (x.tone === 'danger' ? 'danger' : x.tone === 'primary' ? '' : 'ghost'), style: 'margin-right:6px', text: x.label,
        onclick: () => modal({ title: x.label, body: x.confirm || 'Xác nhận thực hiện?', inputs: x.inputs, confirmText: x.label, tone: x.tone, onSubmit: async (vals) => { const res = await api('POST', `/apps/${encodeURIComponent(id)}/actions/${encodeURIComponent(x.id)}`, { panel: panel.id, rowId: r._id, inputs: vals }); toast(res.message || (res.ok ? 'Đã thực hiện' : 'Không thành công')); route(); } }),
      }))) });
    }
    const search = panel.searchable ? h('input', { type: 'search', value: q.q || '', placeholder: 'Tìm…', onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/app/${id}/${cur}?q=${encodeURIComponent(e.target.value)}`; } }) : null;
    shell(a.name, [head, h('div', { class: 'card' }, [h('div', { class: 'row sb' }, [h('h2', { text: panel.title }), search]), panel.description ? h('div', { class: 'desc', text: panel.description }) : null,
      table(cols, data.rows, { empty: 'Không có mục nào cần xử lý' }), pager(data.page, data.pageSize, data.total, (p) => { location.hash = `#/app/${id}/${cur}?page=${p}&q=${encodeURIComponent(q.q || '')}`; })])], actions);
  }

  // ---------- Hệ thống ----------
  async function systemView() {
    const { apps } = await api('GET', '/apps');
    const edit = (a) => {
      const vals = a ? { id: a.id, name: a.name, baseUrl: a.baseUrl, keyId: a.keyId, note: a.note, secret: '' } : { id: '', name: '', baseUrl: '', keyId: '', note: '', secret: '' };
      modal({ title: a ? 'Sửa kết nối ' + a.name : 'Thêm ứng dụng', confirmText: 'Lưu', inputs: [
        { name: 'id', label: 'Mã app (a-z, 0-9)', type: 'text' }, { name: 'name', label: 'Tên hiển thị', type: 'text' }, { name: 'baseUrl', label: 'Địa chỉ (vd. http://9ship:8099/9ship)', type: 'text' },
        { name: 'keyId', label: 'Mã khóa', type: 'text' }, { name: 'secret', label: a ? 'Bí mật mới (để trống nếu giữ nguyên)' : 'Bí mật kết nối (≥ 24 ký tự)', type: 'text' }, { name: 'note', label: 'Ghi chú', type: 'text' },
      ], onSubmit: async (v) => { await api('POST', '/apps', { ...vals, ...v, id: (v.id ?? vals.id), name: v.name ?? vals.name, baseUrl: v.baseUrl ?? vals.baseUrl, keyId: v.keyId ?? vals.keyId, secret: v.secret || undefined, note: v.note ?? vals.note }); toast('Đã lưu'); await loadApps(); route(); } });
      // điền sẵn giá trị khi sửa
      setTimeout(() => { for (const [k, v] of Object.entries(vals)) { const el = modalRoot.querySelector(`[name="${k}"]`); if (el && k !== 'secret') el.value = v || ''; } if (a) { const idEl = modalRoot.querySelector('[name="id"]'); if (idEl) idEl.readOnly = true; } }, 0);
    };
    shell('Kết nối ứng dụng', [
      h('div', { class: 'card' }, [h('div', { class: 'row sb' }, [h('h2', { text: 'Ứng dụng đã khai báo' }), h('button', { class: 'btn sm', text: '+ Thêm ứng dụng', onclick: () => edit(null) })]),
        table([
          { label: 'Ứng dụng', render: (a) => h('b', { text: a.name }) }, { label: 'Địa chỉ', key: 'baseUrl' },
          { label: 'Tình trạng', render: (a) => h('span', { class: 'statusline' }, [h('i', { class: a.status }), { ok: 'Hoạt động', stale: 'Cũ', down: 'Lỗi', unknown: 'Chưa kiểm tra' }[a.status]]) },
          { label: 'Khả năng', render: (a) => (a.manifest ? a.manifest.capabilities.join(', ') : '—') },
          { label: '', render: (a) => h('span', {}, [
            h('button', { class: 'btn ghost sm', style: 'margin-right:6px', text: 'Thử kết nối', onclick: guard(async () => { const r = await api('POST', `/apps/${a.id}/test`, {}); const bad = Object.entries(r.steps).filter(([, v]) => !v.ok); toast(bad.length ? 'Có lỗi: ' + bad.map(([k, v]) => `${k} (${v.error})`).join('; ') : 'Kết nối tốt'); await loadApps(); route(); }) }),
            h('button', { class: 'btn ghost sm', style: 'margin-right:6px', text: 'Sửa', onclick: () => edit(a) }),
            h('button', { class: 'btn danger sm', text: 'Xóa', onclick: () => modal({ title: 'Xóa kết nối ' + a.name, body: 'Xóa luôn dữ liệu người dùng và dòng tiền đã đồng bộ của app này khỏi cổng (dữ liệu gốc ở app không bị ảnh hưởng).', confirmText: 'Xóa', tone: 'danger', onSubmit: async () => { await api('DELETE', '/apps/' + a.id); await loadApps(); route(); } }) }),
          ]) },
        ], apps, { empty: 'Chưa khai báo ứng dụng nào' })]),
      h('div', { class: 'card' }, [h('h2', { text: 'Tài khoản quản trị' }), h('div', { class: 'kv' }, [h('span', { text: 'Đăng nhập' }), h('b', { text: S.admin.username })]),
        h('button', { class: 'btn ghost sm', style: 'margin-top:12px', text: 'Đổi mật khẩu', onclick: () => modal({ title: 'Đổi mật khẩu', inputs: [{ name: 'current', label: 'Mật khẩu hiện tại', type: 'text' }, { name: 'password', label: 'Mật khẩu mới (≥ 10 ký tự)', type: 'text' }], confirmText: 'Đổi', onSubmit: async (v) => { await api('POST', '/me/password', { current: v.current, password: v.password }); toast('Đã đổi mật khẩu. Các thiết bị khác phải đăng nhập lại.'); } }) })]),
    ]);
    // ô mật khẩu ẩn ký tự
    new MutationObserver(() => modalRoot.querySelectorAll('[name="current"],[name="password"],[name="secret"]').forEach((e) => { e.type = 'password'; })).observe(modalRoot, { childList: true, subtree: true });
  }

  async function auditView() {
    const { items } = await api('GET', '/audit');
    shell('Nhật ký thao tác', [h('div', { class: 'card' }, [table([
      { label: 'Thời gian', render: (r) => fmtDT(r.at) }, { label: 'Người thao tác', key: 'admin' }, { label: 'Hành động', key: 'action' }, { label: 'Ứng dụng', key: 'app_id' },
      { label: 'Chi tiết', render: (r) => (r.detail ? JSON.stringify(r.detail).slice(0, 220) : '') },
    ], items, { empty: 'Chưa có thao tác nào' })])]);
  }

  // ---------- điều hướng ----------
  async function loadApps() { try { S.apps = (await api('GET', '/apps')).apps; } catch { S.apps = []; } }
  async function route() {
    if (!S.admin) return loginView();
    const [r0] = routeParts();
    const views = { '': overviewView, money: moneyView, users: usersView, app: appView, system: systemView, audit: auditView };
    clearInterval(S.timer);
    try { await (views[r0 || ''] || overviewView)(); } catch (e) {
      if (e.status === 401) return;
      shell('Có lỗi', [h('div', { class: 'card' }, [h('div', { class: 'alert bad', text: e.message })])]);
    }
    window.scrollTo(0, 0);
  }
  function render() { route(); }
  window.addEventListener('hashchange', route);

  (async () => {
    try { S.admin = (await api('GET', '/me')).admin; } catch { S.admin = null; }
    if (S.admin) await loadApps();
    route();
  })();
})();
