/* 9family: tiện ích giao diện dùng chung. Chỉ dùng textContent / DOM API, không bao giờ chèn HTML thô. */
(function () {
  'use strict';
  var F9 = window.F9 = window.F9 || {};

  // ---------- DOM ----------
  F9.h = function (tag, attrs, kids) {
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
  var h = F9.h;
  F9.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  F9.$ = function (id) { return document.getElementById(id); };

  // ---------- biểu tượng ----------
  var PATHS = {
    back: ['M15 6l-6 6 6 6'], chev: ['M9 6l6 6-6 6'], plus: ['M12 5v14', 'M5 12h14'], check: ['M5 12l5 5L20 7'],
    close: ['M6 6l12 12', 'M18 6 6 18'], copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
    link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'], edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    warn: ['M12 3 2 21h20z', 'M12 10v5', 'M12 18h.01'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'],
    sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
    cal: ['M3 5h18v16H3z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
    car: ['M5 16V11l2-5h10l2 5v5', 'M3 16h18', 'M7 19v-3', 'M17 19v-3', 'M7.5 13h.01', 'M16.5 13h.01'],
    list: ['M9 6h12', 'M9 12h12', 'M9 18h12', 'M4 6l1 1 2-2', 'M4 12l1 1 2-2', 'M4 18l1 1 2-2'],
    bell: ['M6 9a6 6 0 0 1 12 0c0 6 2 7 2 8H4c0-1 2-2 2-8z', 'M10 21h4'],
    phone: ['M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z'],
    image: ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6', 'M8.5 9h.01'],
    home: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  };
  F9.ico = function (name, size, stroke) {
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

  // ---------- danh mục ----------
  F9.RELATIONS = [['me', 'Mẹ'], ['bo', 'Bố'], ['ong', 'Ông'], ['ba', 'Bà'], ['nguoi_than', 'Người thân'], ['giup_viec', 'Giúp việc, người trông trẻ'], ['khac', 'Khác']];
  F9.REL = { me: 'Mẹ', bo: 'Bố', ong: 'Ông', ba: 'Bà', nguoi_than: 'Người thân', giup_viec: 'Giúp việc', don_ho: 'Người đón hộ', khac: 'Khác' };
  F9.KINDS = [['hoc', 'Học trên lớp'], ['hoc_them', 'Học thêm'], ['nang_khieu', 'Năng khiếu'], ['thi', 'Thi, kiểm tra'], ['hop_phu_huynh', 'Họp phụ huynh'], ['kham', 'Khám bệnh'], ['gia_dinh', 'Sinh hoạt gia đình'], ['ngay_quan_trong', 'Ngày quan trọng'], ['khac', 'Khác']];
  F9.KIND = {}; F9.KINDS.forEach(function (k) { F9.KIND[k[0]] = k[1]; });
  F9.COLORS = ['xanh', 'cam', 'tim', 'hong', 'luc', 'vang', 'do', 'nau'];
  F9.COLOR_NAME = { xanh: 'Xanh dương', cam: 'Cam', tim: 'Tím', hong: 'Hồng', luc: 'Xanh lá', vang: 'Vàng', do: 'Đỏ', nau: 'Nâu' };
  F9.WD = ['', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
  F9.WD_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  F9.OFFSETS = [[0, 'Đúng giờ'], [10, '10 phút'], [30, '30 phút'], [60, '1 giờ'], [120, '2 giờ'], [1440, '1 ngày']];
  F9.initial = function (name) { return ([].concat(Array.from(String(name || '?').trim()))[0] || '?').toUpperCase(); };

  // ---------- thời gian (luôn theo giờ Việt Nam, không phụ thuộc múi giờ của máy) ----------
  var p2 = function (n) { return ('0' + n).slice(-2); };
  F9.skew = 0; // chênh lệch đồng hồ máy chủ - máy này
  F9.syncClock = function (serverNow) { if (serverNow) F9.skew = serverNow - Date.now(); };
  F9.nowMs = function () { return Date.now() + F9.skew; };
  F9.vnDate = function (ms) { return new Date(ms + 7 * 3600000); };
  F9.hhmm = function (ms) { var d = F9.vnDate(ms); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); };
  F9.todayOf = function (ms) { return F9.vnDate(ms).toISOString().slice(0, 10); };
  F9.addDays = function (day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  F9.weekday = function (day) { var w = new Date(day + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
  F9.diffDays = function (a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); };
  F9.dm = function (day) { var p = String(day).split('-'); return p[2] + '/' + p[1]; };
  F9.dmy = function (day) { var p = String(day).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  F9.dayLabel = function (day, today) {
    var diff = F9.diffDays(today, day);
    var base = F9.WD[F9.weekday(day)] + ', ' + F9.dm(day);
    if (diff === 0) return 'Hôm nay, ' + base;
    if (diff === 1) return 'Ngày mai, ' + base;
    if (diff === -1) return 'Hôm qua, ' + base;
    return base;
  };
  F9.dayShort = function (day, today) {
    var diff = F9.diffDays(today, day);
    if (diff === 0) return 'Hôm nay';
    if (diff === 1) return 'Ngày mai';
    if (diff === -1) return 'Hôm qua';
    return F9.WD[F9.weekday(day)] + ' ' + F9.dm(day);
  };
  F9.lunarText = function (l) { return l ? l[0] + '/' + l[1] + (l[2] ? ' nhuận' : '') : ''; };
  F9.stamp = function (ms, today) { // "Hôm nay 16:12", "05/10 16:12"
    var d = F9.todayOf(ms);
    var diff = F9.diffDays(today || F9.todayOf(F9.nowMs()), d);
    var t = F9.hhmm(ms);
    if (diff === 0) return 'Hôm nay ' + t;
    if (diff === -1) return 'Hôm qua ' + t;
    return F9.dm(d) + ' ' + t;
  };
  F9.untilText = function (ms) {
    var diff = ms - F9.nowMs();
    var m = Math.round(Math.abs(diff) / 60000);
    if (diff >= 0) {
      if (m < 1) return 'Sắp tới giờ';
      if (m < 60) return 'Còn ' + m + ' phút';
      return 'Còn ' + Math.floor(m / 60) + ' giờ' + (m % 60 ? ' ' + (m % 60) + ' phút' : '');
    }
    if (m < 1) return 'Vừa tới giờ';
    if (m < 60) return 'Quá giờ ' + m + ' phút';
    return 'Quá giờ ' + Math.floor(m / 60) + ' giờ' + (m % 60 ? ' ' + (m % 60) + ' phút' : '');
  };

  // ---------- lưu tạm (chỉ giao diện, không bí mật) ----------
  F9.store = function (k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem('9family.' + k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem('9family.' + k); else localStorage.setItem('9family.' + k, JSON.stringify(v));
    } catch (e) { /* chế độ riêng tư: bỏ qua */ }
    return null;
  };

  // bản nháp theo tab (sessionStorage): tải lại trang không mất, đóng tab thì bỏ
  F9.draft = function (k, v) {
    try {
      if (v === undefined) { var r = sessionStorage.getItem('9family.' + k); return r ? JSON.parse(r) : null; }
      if (v === null) sessionStorage.removeItem('9family.' + k); else sessionStorage.setItem('9family.' + k, JSON.stringify(v));
    } catch (e) { /* bỏ qua */ }
    return null;
  };

  // ---------- gọi API ----------
  var BASE = document.baseURI;
  function rid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  F9.rid = rid;
  var idemKeys = {};
  // Khóa idempotency giữ nguyên cho tới khi thao tác thành công: bấm lại sau khi mất mạng không làm hai lần
  F9.idem = function (name) { return idemKeys[name] || (idemKeys[name] = rid()); };
  F9.idemDone = function (name) { delete idemKeys[name]; };

  F9.api = function (method, path, body, opts) {
    opts = opts || {};
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    var headers = { 'X-Requested-With': '9family' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && opts.idem) headers['Idempotency-Key'] = F9.idem(opts.idem);
    return fetch(new URL(path, BASE).href, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        F9.setOnline(true);
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* không phải JSON */ }
          if (r.ok) { if (opts.idem) F9.idemDone(opts.idem); return j; }
          var e = (j && j.error) || {};
          var err = new Error(e.message || 'Có lỗi xảy ra, thử lại nhé');
          err.status = r.status; err.code = e.code; err.details = e.details;
          if (r.status < 500 && opts.idem) F9.idemDone(opts.idem);
          throw err;
        });
      }, function () {
        if (timer) clearTimeout(timer);
        F9.setOnline(false);
        var err = new Error('Không kết nối được mạng. Dữ liệu bạn nhập vẫn còn, bấm lại khi có mạng.');
        err.offline = true;
        throw err;
      });
  };
  F9.get = function (p) { return F9.api('GET', p); };
  F9.post = function (p, b, o) { return F9.api('POST', p, b === undefined ? {} : b, o); };
  F9.del = function (p) { return F9.api('DELETE', p); };
  F9.fam = function (fid, p) { return 'api/families/' + fid + (p || ''); };

  F9.online = true;
  F9.setOnline = function (on) {
    if (F9.online === on) return;
    F9.online = on;
    var n = F9.$('net'); if (n) n.className = 'netbar' + (on ? ' hidden' : '');
    if (on && F9.liveReload) F9.liveReload();
  };
  window.addEventListener('offline', function () { F9.setOnline(false); });
  window.addEventListener('online', function () { F9.setOnline(true); });

  // ---------- toast ----------
  var toastTimer = null;
  F9.toast = function (msg, kind) {
    var t = F9.$('toast');
    F9.clear(t);
    t.className = 'toast ' + (kind || '');
    t.appendChild(document.createTextNode(msg));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, kind === 'err' ? 6000 : 3000);
  };
  F9.fail = function (e) {
    if (e && e.status === 404 && e.code === 'not_found' && F9.currentFid && /gia đình/.test(e.message || '')) { F9.go('#/'); return; }
    F9.toast((e && e.message) || 'Có lỗi xảy ra, thử lại nhé', 'err');
  };

  // Bấm nút: khóa nút trong lúc chạy (chống bấm đúp), lỗi thì báo rõ và mở lại nút
  F9.busy = function (btn, fn) {
    if (btn.disabled) return;
    btn.setAttribute('data-label', btn.getAttribute('data-label') || btn.textContent);
    btn.disabled = true; btn.classList.add('loading');
    var done = function () { btn.disabled = false; btn.classList.remove('loading'); };
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) { done(); return r; }, function (e) { done(); F9.fail(e); });
  };

  // ---------- sao chép, chia sẻ ----------
  F9.copy = function (text, msg) {
    function ok() { F9.toast(msg || 'Đã sao chép'); }
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', class: 'offscreen', readonly: true });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { F9.toast('Máy không cho sao chép, hãy nhấn giữ để chép tay', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  };
  F9.share = function (title, text, url) {
    if (navigator.share) return navigator.share({ title: title, text: text, url: url }).catch(function () { /* người dùng đóng */ });
    F9.copy(url, 'Đã sao chép link'); return Promise.resolve();
  };
  F9.absUrl = function (path) { return new URL(path, location.origin).href; };

  // ---------- điều hướng, trang tính ----------
  F9.backPending = false;
  F9.go = function (hash) {
    if (F9.backPending) { setTimeout(function () { F9.go(hash); }, 25); return; }
    if (location.hash === hash) F9.route(); else location.hash = hash;
  };
  F9.href = function (hash) { return location.pathname + location.search + hash; };
  F9.link = function (hash, attrs, kids) {
    var a = h('a', Object.assign({ href: F9.href(hash) }, attrs || {}), kids);
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); F9.go(hash);
    });
    return a;
  };

  var sheetStack = [];
  var selfBack = 0; // số lần history.back() do chính app gọi khi đóng sheet (popstate tương ứng phải bị bỏ qua)
  var pendingPush = []; // sheet mở ngay sau khi một sheet khác vừa đóng: chờ lùi lịch sử xong mới thêm mục lịch sử (tránh lùi nhầm hai bước)
  function drainPush() {
    while (pendingPush.length) { var e = pendingPush.shift(); if (!e.closed) { history.pushState({ sheet: true }, ''); e.pushed = true; } }
  }
  F9.sheetOpen = function () { return sheetStack.length > 0; };
  F9.sheet = function (title, build) {
    var back = h('div', { class: 'sheet-back' });
    var body = h('div', { class: 'sheet-body' });
    var closed = false;
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'sheet-head' }, [
        h('div', { class: 'sheet-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: function () { close(); } }, [F9.ico('close', 22)]),
      ]),
      body,
    ]);
    back.appendChild(panel);
    var prevFocus = document.activeElement;
    var entry = { close: close, closed: false, pushed: false };
    function close(fromPop) {
      if (closed) return;
      closed = true; entry.closed = true;
      sheetStack = sheetStack.filter(function (s) { return s !== entry; });
      if (back.parentNode) back.parentNode.removeChild(back);
      document.body.classList.toggle('sheet-open', sheetStack.length > 0);
      if (!fromPop && entry.pushed && history.state && history.state.sheet) { selfBack++; F9.backPending = true; setTimeout(function () { if (selfBack > 0) { selfBack = 0; F9.backPending = false; drainPush(); } }, 1000); history.back(); }
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* bỏ qua */ } }
      if (F9.afterSheet) F9.afterSheet();
      if (entry.onclose) entry.onclose();
    }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(back);
    document.body.classList.add('sheet-open');
    sheetStack.push(entry);
    if (selfBack > 0) pendingPush.push(entry); else { history.pushState({ sheet: true }, ''); entry.pushed = true; }
    build(body, close);
    var first = body.querySelector('input:not([type=checkbox]):not([type=file]),select,textarea');
    if (first && !/Mobi|Android|iPhone/i.test(navigator.userAgent)) first.focus();
    return entry;
  };
  window.addEventListener('popstate', function () {
    if (selfBack > 0) { selfBack--; F9.backPending = selfBack > 0; if (selfBack === 0) drainPush(); return; }
    F9.backPending = false;
    if (sheetStack.length) sheetStack[sheetStack.length - 1].close(true);
  });
  F9.closeSheets = function () { while (sheetStack.length) sheetStack[sheetStack.length - 1].close(true); };

  F9.confirm = function (o) {
    return new Promise(function (resolve) {
      var answered = false;
      var s = F9.sheet(o.title || 'Xác nhận', function (body, close) {
        body.appendChild(h('p', { class: 'pre', text: o.text || '' }));
        body.appendChild(h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn ghost', type: 'button', text: o.cancel || 'Quay lại', onclick: function () { answered = true; close(); resolve(false); } }),
          h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), type: 'button', text: o.ok || 'Đồng ý', onclick: function () { answered = true; close(); resolve(true); } }),
        ]));
      });
      s.onclose = function () { if (!answered) { answered = true; resolve(false); } };
    });
  };

  // ---------- phần tử dùng lại ----------
  F9.chip = function (text, kind) { return h('span', { class: 'chip ' + (kind || ''), text: text }); };
  F9.kidChip = function (kid) { return h('span', { class: 'kid-chip c-' + (kid.color || 'xanh') }, [h('i', { class: 'kid-dot' }), kid.name]); };
  F9.empty = function (title, text, action) {
    return h('div', { class: 'empty' }, [h('div', { class: 'empty-t', text: title }), text ? h('div', { class: 'muted', text: text }) : null, action || null]);
  };
  F9.notice = function (kind, title, text, action) {
    return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : null }, [
      h('div', { class: 'notice-ico' }, [F9.ico(kind === 'bad' || kind === 'warn' ? 'warn' : 'info', 22)]),
      h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: title }), text ? h('div', { text: text }) : null, action || null]),
    ]);
  };
  F9.btn = function (text, cls, onclick, extra) {
    return h('button', Object.assign({ class: 'btn ' + (cls || ''), type: 'button', onclick: onclick }, extra || {}), [text]);
  };
  F9.field = function (label, input, hint) {
    var id = 'f' + rid().slice(0, 6);
    input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null]);
  };
  F9.text = function (o) {
    return h('input', Object.assign({ type: 'text', autocomplete: 'off', autocapitalize: 'sentences', maxlength: 60, enterkeyhint: 'done' }, o || {}));
  };
  F9.select = function (options, value, attrs) {
    var s = h('select', attrs || {}, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    s.value = value == null ? '' : value;
    return s;
  };
  // Hàng nút chọn nhiều/một: items [[value, label, extraClass]], selected: mảng giá trị; onchange(selected)
  F9.chips = function (items, selected, onchange, opts) {
    opts = opts || {};
    var sel = selected.slice();
    var wrap = h('div', { class: 'optchips', role: opts.single ? 'radiogroup' : 'group' });
    function paint() {
      F9.clear(wrap);
      items.forEach(function (it) {
        var on = sel.indexOf(it[0]) >= 0;
        wrap.appendChild(h('button', {
          type: 'button', class: 'optchip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', role: opts.single ? 'radio' : null, 'aria-checked': opts.single ? String(on) : null,
          onclick: function () {
            if (opts.single) sel = [it[0]];
            else { var i = sel.indexOf(it[0]); if (i >= 0) sel.splice(i, 1); else sel.push(it[0]); }
            paint(); if (onchange) onchange(sel.slice());
          },
        }, [it[2] ? h('i', { class: 'kid-dot ' + it[2] }) : null, it[1]]));
      });
    }
    paint();
    wrap.getValue = function () { return sel.slice(); };
    return wrap;
  };

  // ---------- cập nhật định kỳ, không làm mất thứ đang gõ ----------
  var liveTimer = null; var tickTimer = null; var liveState = null;
  var lastInput = 0; var composing = false;
  document.addEventListener('input', function () { lastInput = Date.now(); }, true);
  document.addEventListener('compositionstart', function () { composing = true; }, true);
  document.addEventListener('compositionend', function () { composing = false; lastInput = Date.now(); }, true);
  function typingNow() {
    if (F9.sheetOpen() || composing) return true;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && F9.$('view').contains(a)) return a.getAttribute('data-k') ? (Date.now() - lastInput) < 3500 : true;
    return false;
  }
  F9.typingNow = typingNow;
  F9.liveStop = function () { clearInterval(liveTimer); clearInterval(tickTimer); liveTimer = null; tickTimer = null; liveState = null; };
  // opts: { fetch: () => Promise<data>, render: (data) => void, every: ms, retick: bool }
  F9.live = function (opts) {
    F9.liveStop();
    var st = liveState = { opts: opts, last: null, pending: null, data: null };
    function apply(data) {
      var a = document.activeElement, k = a && a.getAttribute && a.getAttribute('data-k'), s0 = 0, s1 = 0;
      if (k) { try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) { /* kiểu ô không hỗ trợ */ } }
      st.last = JSON.stringify(data); st.pending = null; st.data = data; opts.render(data);
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
        if (typingNow() && !(force && !F9.sheetOpen() && !composing)) { st.pending = data; return; }
        apply(data);
      });
    };
    st.flush = function () { if (liveState === st && st.pending && !typingNow()) apply(st.pending); };
    // qua nửa đêm giờ Việt Nam thì "hôm nay" đổi: bỏ bộ nhớ đệm và tải lại ngay
    function dayChanged() { var d = st.data; var day = d && d.core && d.core.today; return !!day && F9.todayOf(F9.nowMs()) !== day; }
    st.dayChanged = dayChanged;
    liveTimer = setInterval(function () {
      if (document.hidden || liveState !== st) return;
      var dc = dayChanged(); if (dc) F9.dropGate();
      st.load(dc).then(function () { st.flush(); }).catch(function () { /* mạng chập chờn: lần sau thử lại */ });
    }, opts.every || 10000);
    tickTimer = setInterval(function () {
      if (document.hidden || liveState !== st || !st.data) return;
      if (dayChanged()) { F9.dropGate(); st.load(true).catch(function () {}); return; }
      if (opts.retick && !typingNow()) st.apply(st.data);
    }, 20000);
    return st.load(true);
  };
  F9.refresh = function (force) { return liveState ? liveState.load(force) : Promise.resolve(); };
  F9.rerender = function () { if (liveState && liveState.data) liveState.apply(liveState.data); };
  F9.liveReload = function () { if (liveState) liveState.load().catch(function () {}); };
  F9.afterSheet = function () { if (liveState) setTimeout(function () { liveState && liveState.flush(); }, 50); };
  document.addEventListener('focusout', function () { setTimeout(function () { if (liveState) liveState.flush(); }, 150); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && liveState) { var dc = liveState.dayChanged && liveState.dayChanged(); if (dc) F9.dropGate(); liveState.load(dc).catch(function () {}); } });

  // Lấy dữ liệu nhẹ: hỏi "pulse" (một dòng) trước, chỉ tải lại khi gia đình có thay đổi hoặc quá 60 giây
  var gate = {};
  F9.gated = function (fid, key, loader, force) {
    return F9.get(F9.fam(fid, '/pulse')).then(function (p) {
      F9.syncClock(p.now); F9.setUnread(p.unread);
      var c = gate[fid + ':' + key];
      if (!force && c && c.rev === p.rev && c.unread === p.unread && Date.now() - c.at < 60000) return c.data;
      return loader().then(function (d) { gate[fid + ':' + key] = { rev: p.rev, unread: p.unread, at: Date.now(), data: d }; return d; });
    });
  };
  F9.dropGate = function () { gate = {}; };

  F9.unread = 0;
  F9.setUnread = function (n) {
    F9.unread = n || 0;
    document.querySelectorAll('[data-badge="inbox"]').forEach(function (b) {
      b.textContent = F9.unread > 99 ? '99+' : String(F9.unread);
      b.classList.toggle('hidden', !F9.unread);
    });
    var bell = F9.$('bell'); if (bell) bell.setAttribute('aria-label', F9.unread ? 'Thông báo, ' + F9.unread + ' chưa đọc' : 'Thông báo');
  };

  // bàn phím ảo: chỉ các ô gõ chữ mới bật bàn phím (ô ngày, giờ, danh sách chọn dùng bảng chọn riêng); ô đang nhập luôn nằm trong tầm nhìn, thanh dưới ẩn đi
  function usesKeyboard(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && /^(text|search|number|tel|email|url|password)$/.test(el.type);
  }
  document.addEventListener('focusin', function (e) {
    if (usesKeyboard(e.target)) {
      document.body.classList.add('typing');
      setTimeout(function () { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* bỏ qua */ } }, 280);
    }
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () { if (!usesKeyboard(document.activeElement)) document.body.classList.remove('typing'); }, 100);
  });

  // ---------- khung: thanh trên, thanh tab, nút chính dưới ----------
  F9.frame = function (o) {
    var bar = F9.$('bar'), barIn = F9.$('bar-in');
    F9.clear(barIn);
    bar.className = 'bar';
    if (o.back) barIn.appendChild(F9.link(o.back, { class: 'icon-btn', 'aria-label': 'Quay lại' }, [F9.ico('back', 24)]));
    else barIn.appendChild(h('a', { href: '/', class: 'home9app', 'aria-label': 'Về trang 9app' }, [F9.ico('back', 18), '9app']));
    barIn.appendChild(h('div', { class: 'ttl', text: o.title || '9family' }));
    (o.right || []).forEach(function (n) { barIn.appendChild(n); });
    F9.setCta(null);
    F9.setTabs(o.tabs || null);
  };
  F9.bell = function (fid) {
    var a = F9.link('#/f/' + fid + '/inbox', { class: 'icon-btn', id: 'bell', 'aria-label': 'Thông báo' }, [F9.ico('bell', 24), h('span', { class: 'dot-badge hidden', 'data-badge': 'inbox', text: '0' })]);
    return a;
  };
  var TABS = [['today', 'Hôm nay', 'sun'], ['cal', 'Lịch', 'cal'], ['rides', 'Đưa đón', 'car'], ['tasks', 'Việc chung', 'list'], ['me', 'Gia đình', 'users']];
  F9.setTabs = function (fidTab) {
    var t = F9.$('tabs'); F9.clear(t);
    if (!fidTab) { t.className = 'tabs hidden'; document.body.classList.remove('has-tabs'); return; }
    t.className = 'tabs'; document.body.classList.add('has-tabs');
    var inner = h('nav', { class: 'tabs-in', 'aria-label': 'Điều hướng chính' });
    TABS.forEach(function (x) {
      var on = fidTab.tab === x[0];
      inner.appendChild(F9.link('#/f/' + fidTab.fid + '/' + x[0], { class: 'tab' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null }, [F9.ico(x[2], 24), x[1]]));
    });
    t.appendChild(inner);
  };
  F9.setCta = function (node) {
    var cta = F9.$('cta');
    F9.clear(cta);
    if (!node) { cta.className = 'cta hidden'; document.body.classList.remove('has-cta'); return; }
    cta.className = 'cta'; document.body.classList.add('has-cta');
    cta.appendChild(node);
  };
  F9.mount = function (nodes) {
    var v = F9.$('view');
    var y = window.scrollY;
    F9.clear(v);
    v.appendChild(h('div', { class: 'page' }, nodes));
    window.scrollTo(0, y);
    return y;
  };
  F9.skeleton = function () {
    F9.clear(F9.$('view'));
    F9.$('view').appendChild(h('div', { class: 'page' }, [h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel short' })]));
  };
  F9.loadError = function (e, retry) {
    F9.setCta(null);
    F9.liveStop();
    var offline = e && e.offline;
    var gone = e && e.status === 404;
    if (gone) F9.setTabs(null);
    F9.mount([F9.empty(offline ? 'Chưa có mạng' : (gone ? 'Không tìm thấy' : 'Chưa tải được'), gone ? 'Gia đình này không tồn tại, hoặc thiết bị này không còn được liên kết với gia đình. Nếu bạn là thành viên, hãy nhờ chủ gia đình gửi link mời lại.' : ((e && e.message) || 'Thử lại nhé'), h('div', { class: 'btn-row center' }, [
      e && e.status === 404 ? F9.link('#/', { class: 'btn primary' }, ['Về trang chủ']) : F9.btn('Thử lại', 'primary', retry),
    ]))]);
  };
})();
