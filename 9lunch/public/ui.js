/* 9lunch: tiện ích giao diện dùng chung. Chỉ dùng textContent / DOM API, không bao giờ chèn HTML thô. */
(function () {
  'use strict';
  var L9 = window.L9 = window.L9 || {};

  // ---------- DOM ----------
  L9.h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'disabled') el.disabled = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  };
  var h = L9.h;
  L9.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  L9.$ = function (id) { return document.getElementById(id); };

  // ---------- biểu tượng ----------
  var PATHS = {
    back: ['M15 6l-6 6 6 6'], chev: ['M9 6l6 6-6 6'], plus: ['M12 5v14', 'M5 12h14'], check: ['M5 12l5 5L20 7'],
    close: ['M6 6l12 12', 'M18 6 6 18'], copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
    link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
    dice: ['M4 4h16v16H4z', 'M8.5 8.5h.01', 'M15.5 8.5h.01', 'M12 12h.01', 'M8.5 15.5h.01', 'M15.5 15.5h.01'],
    gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'], edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'], wallet: ['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z', 'M16 14h.01'],
    warn: ['M12 3 2 21h20z', 'M12 10v5', 'M12 18h.01'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'], bowl: ['M3 11h18a9 9 0 0 1-18 0z', 'M8 7c0-1.5 1-2 1-3', 'M13 7c0-1.5 1-2 1-3', 'M17 3l-3 7'],
    cup: ['M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z', 'M17 9h2a2 2 0 0 1 0 5h-2', 'M8 3v2', 'M12 3v2'],
    sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
    party: ['M4 20l4-12 8 8z', 'M14 4l1 2', 'M18 8l2-1', 'M17 3v.01', 'M21 12v.01'],
    share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'], list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  };
  L9.ico = function (name, size, stroke) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    var s = size || 20;
    svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', stroke || 2); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    (PATHS[name] || []).forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); svg.appendChild(p);
    });
    return svg;
  };

  // ---------- loại bữa ----------
  L9.KIND_ORDER = ['trua', 'cafe', 'sang', 'tiec'];
  L9.KINDS = {
    trua: { label: 'Cơm trưa', ask: 'Hôm nay ăn gì?', hint: 'Cả nhóm đề xuất quán, bình chọn và gọi món.', icon: 'bowl', order: 'Gọi món', item: 'món', itemEx: 'Cơm sườn', create: 'Tạo bữa trưa' },
    cafe: { label: 'Cà phê, đồ uống', ask: 'Hôm nay uống gì?', hint: 'Mỗi người chọn đồ uống, cỡ ly, đường, đá. Một người đặt cho cả nhóm.', icon: 'cup', order: 'Chọn đồ uống', item: 'đồ uống', itemEx: 'Trà đào cam sả', create: 'Tạo bữa đồ uống' },
    sang: { label: 'Bữa sáng', ask: 'Sáng nay ăn gì?', hint: 'Gom món sáng cho cả nhóm trước giờ làm.', icon: 'sun', order: 'Gọi món', item: 'món', itemEx: 'Bánh mì trứng', create: 'Tạo bữa sáng' },
    tiec: { label: 'Tiệc', ask: 'Tiệc gì, ở đâu?', hint: 'Sinh nhật, liên hoan: chọn chỗ, gọi món, chia đều tiền.', icon: 'party', order: 'Gọi món', item: 'món', itemEx: 'Lẩu thái', create: 'Tạo bữa tiệc' },
  };

  // ---------- định dạng ----------
  L9.vnd = function (n) { return (Math.round(Number(n)) || 0).toLocaleString('vi-VN') + ' đ'; };
  // "45.000", "45,000", "45 000", "45k", "1,5tr" -> số nguyên đồng; không hiểu được thì trả NaN
  L9.parseMoney = function (s) {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(/đ|d$|vnd|vnđ/g, '').replace(/\s+/g, '');
    if (!s) return NaN;
    var mult = 1;
    if (/(tr|triệu)$/.test(s)) { mult = 1000000; s = s.replace(/(tr|triệu)$/, ''); }
    else if (/(k|nghìn|ngàn)$/.test(s)) { mult = 1000; s = s.replace(/(k|nghìn|ngàn)$/, ''); }
    if (mult > 1) {
      // 1,5tr / 1.5tr / 45k: dấu , hoặc . là phần thập phân
      if (!/^\d+([.,]\d{1,3})?$/.test(s)) return NaN;
      return Math.round(parseFloat(s.replace(',', '.')) * mult);
    }
    // 45.000 / 45,000 / 1.250.000: dấu chấm hoặc phẩy là ngăn cách hàng nghìn
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10);
    return NaN;
  };
  L9.dayLabel = function (day) {
    var p = String(day).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var diff = Math.round((d - now) / 86400000);
    var dm = ('0' + p[2]).slice(-2) + '/' + ('0' + p[1]).slice(-2);
    if (diff === 0) return 'Hôm nay, ' + dm;
    if (diff === -1) return 'Hôm qua, ' + dm;
    if (diff === 1) return 'Ngày mai, ' + dm;
    return ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][d.getDay()] + ', ' + dm;
  };
  L9.timeOf = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  };
  // "11:30" + ngày bữa -> ISO
  L9.isoFromTime = function (hhmm, day) {
    if (!hhmm) return null;
    var p = String(day).split('-'); var t = hhmm.split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]).toISOString();
  };
  L9.untilText = function (iso) {
    var ms = new Date(iso) - Date.now();
    if (ms <= 0) return 'Đã hết giờ';
    var m = Math.round(ms / 60000);
    if (m < 1) return 'Còn dưới 1 phút';
    if (m < 60) return 'Còn ' + m + ' phút';
    var hr = Math.floor(m / 60);
    return 'Còn ' + hr + ' giờ' + (m % 60 ? ' ' + (m % 60) + ' phút' : '');
  };

  // ---------- lưu tạm (chỉ giao diện, không bí mật) ----------
  L9.store = function (k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem('9lunch.' + k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem('9lunch.' + k); else localStorage.setItem('9lunch.' + k, JSON.stringify(v));
    } catch (e) { /* chế độ riêng tư: bỏ qua */ }
    return null;
  };

  // ---------- gọi API ----------
  var BASE = document.baseURI;
  function rid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  L9.rid = rid;
  var idemKeys = {};
  // Khóa idempotency giữ nguyên cho tới khi thao tác thành công: bấm lại sau khi mất mạng không làm hai lần
  L9.idem = function (name) { return idemKeys[name] || (idemKeys[name] = rid()); };
  L9.idemDone = function (name) { delete idemKeys[name]; };

  L9.api = function (method, path, body, opts) {
    opts = opts || {};
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    var headers = { 'X-Requested-With': '9lunch' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && opts.idem) headers['Idempotency-Key'] = L9.idem(opts.idem);
    return fetch(new URL(path, BASE).href, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* không phải JSON */ }
          if (r.ok) { if (opts.idem) L9.idemDone(opts.idem); return j; }
          var e = (j && j.error) || {};
          var err = new Error(e.message || 'Có lỗi xảy ra, thử lại nhé');
          err.status = r.status; err.code = e.code; err.details = e.details;
          if (r.status < 500 && opts.idem) L9.idemDone(opts.idem);
          throw err;
        });
      }, function () {
        if (timer) clearTimeout(timer);
        var err = new Error('Không kết nối được mạng. Dữ liệu bạn nhập vẫn còn, bấm lại khi có mạng.');
        err.offline = true;
        throw err;
      });
  };
  L9.get = function (p) { return L9.api('GET', p); };
  L9.post = function (p, b, o) { return L9.api('POST', p, b === undefined ? {} : b, o); };
  L9.del = function (p) { return L9.api('DELETE', p); };

  // ---------- toast ----------
  var toastTimer = null;
  L9.toast = function (msg, kind) {
    var t = L9.$('toast');
    L9.clear(t);
    t.className = 'toast ' + (kind || '');
    t.appendChild(document.createTextNode(msg));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, kind === 'err' ? 6000 : 3000);
  };
  L9.fail = function (e) {
    if (e && e.status === 401) { L9.go('#/'); return; }
    L9.toast((e && e.message) || 'Có lỗi xảy ra, thử lại nhé', 'err');
  };

  // Bấm nút: khóa nút trong lúc chạy (chống bấm đúp), lỗi thì báo rõ và mở lại nút
  L9.busy = function (btn, fn) {
    if (btn.disabled) return;
    var label = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', label);
    btn.disabled = true; btn.classList.add('loading');
    var done = function () { btn.disabled = false; btn.classList.remove('loading'); };
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) { done(); return r; }, function (e) { done(); L9.fail(e); });
  };

  // ---------- sao chép ----------
  L9.copy = function (text, msg) {
    function ok() { L9.toast(msg || 'Đã sao chép'); }
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', class: 'offscreen', readonly: true });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { L9.toast('Máy không cho sao chép, hãy nhấn giữ để chép tay', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  };

  // ---------- trang tính điều hướng ----------
  L9.backPending = false;
  L9.go = function (hash) {
    if (L9.backPending) { setTimeout(function () { L9.go(hash); }, 25); return; } // đợi history.back() của sheet xong, kẻo lùi nhầm trang
    if (location.hash === hash) L9.route(); else location.hash = hash;
  };
  // href đúng với thẻ <base>: dùng đường dẫn hiện tại + hash
  L9.href = function (hash) { return location.pathname + location.search + hash; };
  L9.link = function (hash, attrs, kids) {
    var a = h('a', Object.assign({ href: L9.href(hash) }, attrs || {}), kids);
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); L9.go(hash);
    });
    return a;
  };

  // ---------- bottom sheet (đóng được bằng nút Back của điện thoại) ----------
  var sheetStack = [];
  L9.sheetOpen = function () { return sheetStack.length > 0; };
  L9.sheet = function (title, build) {
    var back = h('div', { class: 'sheet-back' });
    var body = h('div', { class: 'sheet-body' });
    var closed = false;
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'sheet-head' }, [
        h('div', { class: 'sheet-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: function () { close(); } }, [L9.ico('close', 22)]),
      ]),
      body,
    ]);
    back.appendChild(panel);
    var prevFocus = document.activeElement;
    var entry = { close: close };
    function close(fromPop) {
      if (closed) return;
      closed = true;
      sheetStack = sheetStack.filter(function (s) { return s !== entry; });
      if (back.parentNode) back.parentNode.removeChild(back);
      document.body.classList.toggle('sheet-open', sheetStack.length > 0);
      if (!fromPop && history.state && history.state.sheet) { L9.backPending = true; setTimeout(function () { L9.backPending = false; }, 600); history.back(); }
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* bỏ qua */ } }
      if (L9.afterSheet) L9.afterSheet();
    }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(back);
    document.body.classList.add('sheet-open');
    sheetStack.push(entry);
    history.pushState({ sheet: true }, '');
    build(body, close);
    var first = body.querySelector('input,select,textarea,button');
    if (first && !/Mobi|Android/i.test(navigator.userAgent)) first.focus();
    return entry;
  };
  window.addEventListener('popstate', function () {
    L9.backPending = false;
    if (sheetStack.length) sheetStack[sheetStack.length - 1].close(true);
  });

  L9.closeSheets = function () { while (sheetStack.length) sheetStack[sheetStack.length - 1].close(true); };

  L9.confirm = function (o) {
    return new Promise(function (resolve) {
      var answered = false;
      var s = L9.sheet(o.title || 'Xác nhận', function (body, close) {
        body.appendChild(h('p', { class: 'pre', text: o.text || '' }));
        body.appendChild(h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn ghost', type: 'button', text: o.cancel || 'Quay lại', onclick: function () { answered = true; close(); resolve(false); } }),
          h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), type: 'button', text: o.ok || 'Đồng ý', onclick: function () { answered = true; close(); resolve(true); } }),
        ]));
      });
      var orig = s.close;
      s.close = function (f) { orig(f); if (!answered) { answered = true; resolve(false); } };
    });
  };

  // ---------- phần tử dùng lại ----------
  L9.chip = function (text, kind) { return h('span', { class: 'chip ' + (kind || ''), text: text }); };
  L9.empty = function (title, text, action) {
    return h('div', { class: 'empty' }, [h('div', { class: 'empty-t', text: title }), text ? h('div', { class: 'muted', text: text }) : null, action || null]);
  };
  L9.notice = function (kind, title, text, action) {
    return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : null }, [
      h('div', { class: 'notice-ico' }, [L9.ico(kind === 'bad' || kind === 'warn' ? 'warn' : 'info', 22)]),
      h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: title }), text ? h('div', { text: text }) : null, action || null]),
    ]);
  };
  L9.btn = function (text, cls, onclick, extra) {
    return h('button', Object.assign({ class: 'btn ' + (cls || ''), type: 'button', onclick: onclick }, extra || {}), [text]);
  };
  L9.field = function (label, input, hint) {
    var id = 'f' + rid().slice(0, 6);
    input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null]);
  };
  L9.text = function (o) {
    return h('input', Object.assign({ type: 'text', autocomplete: 'off', autocapitalize: 'sentences', maxlength: 60, enterkeyhint: 'done' }, o || {}));
  };
  L9.money = function (o) {
    return h('input', Object.assign({ type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', enterkeyhint: 'done' }, o || {}));
  };

  // Mẫu nhập tài khoản ngân hàng: trả về { node, read() } (read trả null nếu bỏ trống, ném lỗi nếu nhập dở)
  L9.bankForm = function (cur) {
    cur = cur || {};
    var sel = h('select', {}, [h('option', { value: '', text: 'Chọn ngân hàng' })].concat(L9.BANKS.map(function (b) {
      return h('option', { value: b[0], text: b[1] });
    })));
    sel.value = cur.bin || '';
    var acc = L9.text({ inputmode: 'numeric', maxlength: 24, value: cur.account || '', placeholder: 'Số tài khoản' });
    var holder = L9.text({ maxlength: 50, value: cur.holder || '', placeholder: 'NGUYEN VAN A', autocapitalize: 'characters' });
    var node = h('div', {}, [
      L9.field('Ngân hàng', sel), L9.field('Số tài khoản', acc), L9.field('Tên chủ tài khoản', holder, 'Đúng tên in trên thẻ để mọi người yên tâm chuyển'),
    ]);
    return {
      node: node,
      read: function () {
        var a = acc.value.replace(/[\s.-]/g, ''), hd = holder.value.trim();
        if (!sel.value && !a && !hd) return { bin: '', account: '', holder: '' };
        if (!sel.value) throw new Error('Hãy chọn ngân hàng');
        if (!/^[0-9A-Za-z]{4,19}$/.test(a)) throw new Error('Số tài khoản gồm 4 đến 19 chữ số');
        if (!hd) throw new Error('Hãy nhập tên chủ tài khoản');
        return { bin: sel.value, account: a, holder: hd };
      },
    };
  };

  // ---------- cập nhật định kỳ, không làm mất thứ đang gõ ----------
  var liveTimer = null; var liveState = null;
  var lastInput = 0; var composing = false;
  document.addEventListener('input', function () { lastInput = Date.now(); }, true);
  document.addEventListener('compositionstart', function () { composing = true; }, true); // gõ Telex: không vẽ lại giữa chừng
  document.addEventListener('compositionend', function () { composing = false; lastInput = Date.now(); }, true);
  // Đang gõ: có bảng nhập mở, đang ghép chữ, hoặc ô nhập có tiêu điểm. Ô có bản nháp (data-k) chỉ được coi là
  // đang gõ trong 3,5 giây sau lần gõ cuối, sau đó cho phép làm mới và trả lại tiêu điểm đúng chỗ.
  function typingNow() {
    if (L9.sheetOpen() || composing) return true;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && L9.$('view').contains(a)) {
      return a.getAttribute('data-k') ? (Date.now() - lastInput) < 3500 : true;
    }
    return false;
  }
  L9.liveStop = function () { clearInterval(liveTimer); liveTimer = null; liveState = null; };
  // opts: { fetch: () => Promise<data>, render: (data) => void, every: ms }
  L9.live = function (opts) {
    L9.liveStop();
    var st = liveState = { opts: opts, last: null, pending: null, gone: false };
    function apply(data) {
      // giữ ô đang gõ: nhớ ô (data-k) và vị trí con trỏ rồi trả lại sau khi vẽ lại
      var a = document.activeElement, k = a && a.getAttribute && a.getAttribute('data-k'), s0 = 0, s1 = 0;
      if (k) { try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) { /* kiểu ô không hỗ trợ */ } }
      st.last = JSON.stringify(data); st.pending = null; opts.render(data);
      if (k) {
        var el = document.querySelector('[data-k="' + k + '"]');
        if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(s0, s1); } catch (e) { /* bỏ qua */ } }
      }
    }
    st.apply = apply;
    st.load = function (force) {
      return opts.fetch().then(function (data) {
        if (liveState !== st) return;
        var j = JSON.stringify(data);
        if (j === st.last) return;
        if (typingNow() && !(force && !L9.sheetOpen() && !composing)) { st.pending = data; return; }
        apply(data);
      });
    };
    st.flush = function () { if (liveState === st && st.pending && !typingNow()) apply(st.pending); };
    liveTimer = setInterval(function () {
      if (document.hidden || liveState !== st) return;
      st.load().then(function () { st.flush(); }).catch(function () { /* mạng chập chờn: lần sau thử lại, không làm phiền */ });
    }, opts.every || 6000);
    return st.load();
  };
  // force=true: vẽ lại ngay cả khi đang gõ (chỉ dùng ở màn có bản nháp giữ ô nhập, xem data-k)
  L9.refresh = function (force) { return liveState ? liveState.load(force) : Promise.resolve(); };
  // gọi sau khi một thao tác đã xong: luôn vẽ lại (kể cả khi dữ liệu trùng) bằng dữ liệu mới nhất
  L9.rerender = function (data) { if (liveState) liveState.apply(data); };
  L9.afterSheet = function () { if (liveState) setTimeout(function () { liveState && liveState.flush(); }, 50); };
  document.addEventListener('focusout', function () { setTimeout(function () { if (liveState) liveState.flush(); }, 150); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && liveState) liveState.load().catch(function () {}); });
  window.addEventListener('online', function () { if (liveState) liveState.load().catch(function () {}); });

  // bàn phím ảo: ô đang nhập luôn nằm trong tầm nhìn, thanh nút dưới ẩn đi
  document.addEventListener('focusin', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      document.body.classList.add('typing');
      setTimeout(function () { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* bỏ qua */ } }, 280);
    }
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      var a = document.activeElement;
      if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) document.body.classList.remove('typing');
    }, 100);
  });

  // ---------- khung: thanh trên và nút chính dưới ----------
  L9.frame = function (o) {
    var bar = L9.$('bar'), barIn = L9.$('bar-in');
    L9.clear(barIn);
    bar.className = 'bar';
    if (o.back) {
      barIn.appendChild(L9.link(o.back, { class: 'icon-btn', 'aria-label': 'Quay lại' }, [L9.ico('back', 24)]));
    } else {
      barIn.appendChild(h('a', { href: '/', class: 'home9app', 'aria-label': 'Về trang 9app' }, [L9.ico('back', 18), '9app']));
    }
    barIn.appendChild(h('div', { class: 'ttl', text: o.title || '9lunch' }));
    (o.right || []).forEach(function (n) { barIn.appendChild(n); });
    L9.setCta(null);
  };
  L9.setCta = function (node) {
    var cta = L9.$('cta');
    L9.clear(cta);
    if (!node) { cta.className = 'cta hidden'; document.body.classList.remove('has-cta'); return; }
    cta.className = 'cta'; document.body.classList.add('has-cta');
    cta.appendChild(node);
  };
  L9.mount = function (nodes) {
    var v = L9.$('view');
    var y = window.scrollY;
    L9.clear(v);
    v.appendChild(h('div', { class: 'page' }, nodes));
    // Enter trên bàn phím điện thoại phải gửi được form nhiều ô: nút chính của mỗi form là type=submit
    v.querySelectorAll('form').forEach(function (f) {
      var btns = f.querySelectorAll('.btn');
      var main = f.querySelector('.btn.primary') || btns[btns.length - 1];
      if (main) main.setAttribute('type', 'submit');
    });
    return y;
  };
  L9.skeleton = function () {
    L9.clear(L9.$('view'));
    L9.$('view').appendChild(h('div', { class: 'page' }, [h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel short' })]));
  };

  // Màn lỗi tải trang: có nút thử lại
  L9.loadError = function (e, retry) {
    L9.setCta(null);
    L9.liveStop();
    var offline = e && e.offline;
    L9.mount([L9.empty(offline ? 'Chưa có mạng' : (e && e.status === 404 ? 'Không tìm thấy' : 'Chưa tải được'), (e && e.message) || 'Thử lại nhé', h('div', { class: 'btn-row center' }, [
      e && e.status === 404 ? L9.link('#/', { class: 'btn primary' }, ['Về trang chủ']) : L9.btn('Thử lại', 'primary', retry),
    ]))]);
  };
})();
