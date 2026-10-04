/* 9tutor: tiện ích giao diện dùng chung. Chỉ dùng textContent / DOM API, không bao giờ chèn HTML thô. */
(function () {
  'use strict';
  var T9 = window.T9 = window.T9 || {};

  // ---------- DOM ----------
  T9.h = function (tag, attrs, kids) {
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
  var h = T9.h;
  T9.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  T9.$ = function (id) { return document.getElementById(id); };

  // ---------- biểu tượng ----------
  var PATHS = {
    back: ['M15 6l-6 6 6 6'], chev: ['M9 6l6 6-6 6'], plus: ['M12 5v14', 'M5 12h14'], check: ['M5 12l5 5L20 7'],
    close: ['M6 6l12 12', 'M18 6 6 18'], copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
    gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'], edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'], wallet: ['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z', 'M16 14h.01'],
    warn: ['M12 3 2 21h20z', 'M12 10v5', 'M12 18h.01'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'], list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    calendar: ['M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
    home: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
    book: ['M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z', 'M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z'],
    chat: ['M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z'],
    phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
    qr: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M20 14v.01', 'M14 20h3', 'M20 17v4'],
    print: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'],
    eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    key: ['M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z', 'M15.5 7.5l3 3L22 7l-3-3'],
    device: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
    chart: ['M3 20h18', 'M6 16v-5', 'M11 16V6', 'M16 16v-8'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
    shield: ['M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z', 'M9 12l2 2 4-4'],
    star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
    undo: ['M3 7v6h6', 'M3 13a9 9 0 1 0 3-7'],
  };
  T9.ico = function (name, size, stroke) {
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

  // ---------- định dạng ----------
  T9.vnd = function (n) { return (Math.round(Number(n)) || 0).toLocaleString('vi-VN') + ' đ'; };
  // "45.000", "45,000", "45 000", "45k", "1,5tr" -> số nguyên đồng; không hiểu được thì trả NaN
  T9.parseMoney = function (s) {
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
  // ---------- ngày giờ (chuỗi YYYY-MM-DD, phép tính theo UTC nên không lệch múi giờ) ----------
  T9.addDays = function (day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  T9.isoDow = function (day) { var w = new Date(day + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
  T9.mondayOf = function (day) { return T9.addDays(day, 1 - T9.isoDow(day)); };
  T9.DOW = ['', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
  T9.DOW_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  T9.dm = function (day) { return day.slice(8, 10) + '/' + day.slice(5, 7); };
  T9.dmy = function (day) { return day.slice(8, 10) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4); };
  T9.dayLabel = function (day, today) {
    var diff = Math.round((new Date(day + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
    var base = T9.DOW[T9.isoDow(day)] + ', ' + T9.dm(day);
    return diff === 0 ? 'Hôm nay, ' + T9.dm(day) : diff === 1 ? 'Ngày mai, ' + T9.dm(day) : diff === -1 ? 'Hôm qua, ' + T9.dm(day) : base;
  };
  T9.hhmm = function (min) { return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); };
  T9.timeRange = function (start, dur) { return T9.hhmm(start) + ' - ' + T9.hhmm(Math.min(1440, start + dur)); };
  T9.minOf = function (hhmm) { var p = String(hhmm || '').split(':'); return p.length === 2 ? (+p[0]) * 60 + (+p[1]) : NaN; };
  T9.monthLabel = function (m) { return 'Tháng ' + m.slice(5) + '/' + m.slice(0, 4); };
  T9.addMonths = function (m, n) { var t = (+m.slice(0, 4)) * 12 + (+m.slice(5)) - 1 + n; return Math.floor(t / 12) + '-' + ('0' + ((t % 12) + 1)).slice(-2); };
  T9.initial = function (name) { var t = String(name || '?').trim(); return t ? [].slice.call(t)[0].toUpperCase() : '?'; };
  T9.STATUS = { du_kien: 'Chưa dạy', da_day: 'Đã dạy', hs_nghi: 'Học sinh nghỉ', gs_huy: 'Gia sư hủy' };
  T9.TUTOR_STATUS = { sinh_vien: 'Sinh viên', giao_vien_cong: 'Giáo viên trường công lập', giao_vien_khac: 'Giáo viên / người dạy khác', khac: 'Khác' };

  // ---------- lưu tạm (chỉ giao diện, không bí mật) ----------
  T9.store = function (k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem('9tutor.' + k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem('9tutor.' + k); else localStorage.setItem('9tutor.' + k, JSON.stringify(v));
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
  T9.rid = rid;
  var idemKeys = {};
  // Khóa idempotency giữ nguyên cho tới khi thao tác thành công: bấm lại sau khi mất mạng không làm hai lần
  T9.idem = function (name) { return idemKeys[name] || (idemKeys[name] = rid()); };
  T9.idemDone = function (name) { delete idemKeys[name]; };

  T9.api = function (method, path, body, opts) {
    opts = opts || {};
    path = String(path).replace(/^\/+/, ''); // luôn tương đối với thẻ <base>
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    var headers = { 'X-Requested-With': '9tutor' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && opts.idem) headers['Idempotency-Key'] = T9.idem(opts.idem);
    return fetch(new URL(path, BASE).href, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* không phải JSON */ }
          if (r.ok) { if (opts.idem) T9.idemDone(opts.idem); return j; }
          var e = (j && j.error) || {};
          var err = new Error(e.message || 'Có lỗi xảy ra, thử lại nhé');
          err.status = r.status; err.code = e.code; err.details = e.details;
          if (r.status < 500 && opts.idem) T9.idemDone(opts.idem);
          throw err;
        });
      }, function () {
        if (timer) clearTimeout(timer);
        var err = new Error('Không kết nối được mạng. Dữ liệu bạn nhập vẫn còn, bấm lại khi có mạng.');
        err.offline = true;
        throw err;
      });
  };
  T9.get = function (p) { return T9.api('GET', p); };
  T9.post = function (p, b, o) { return T9.api('POST', p, b === undefined ? {} : b, o); };
  T9.del = function (p) { return T9.api('DELETE', p); };

  // ---------- toast ----------
  var toastTimer = null;
  T9.toast = function (msg, kind) {
    var t = T9.$('toast');
    T9.clear(t);
    t.className = 'toast ' + (kind || '');
    t.appendChild(document.createTextNode(msg));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, kind === 'err' ? 6000 : 3000);
  };
  T9.fail = function (e) {
    if (e && e.status === 401) { T9.me = null; T9.go('#/'); return; }
    T9.toast((e && e.message) || 'Có lỗi xảy ra, thử lại nhé', 'err');
  };

  // Bấm nút: khóa nút trong lúc chạy (chống bấm đúp), lỗi thì báo rõ và mở lại nút
  T9.busy = function (btn, fn) {
    if (btn.disabled) return;
    var label = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', label);
    btn.disabled = true; btn.classList.add('loading');
    var done = function () { btn.disabled = false; btn.classList.remove('loading'); };
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) { done(); return r; }, function (e) { done(); T9.fail(e); });
  };

  // ---------- sao chép ----------
  T9.copy = function (text, msg) {
    function ok() { T9.toast(msg || 'Đã sao chép'); }
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', class: 'offscreen', readonly: true });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { T9.toast('Máy không cho sao chép, hãy nhấn giữ để chép tay', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  };

  // ---------- trang tính điều hướng ----------
  T9.backPending = false;
  T9.go = function (hash) {
    if (T9.backPending) { setTimeout(function () { T9.go(hash); }, 25); return; } // đợi history.back() của sheet xong, kẻo lùi nhầm trang
    if (location.hash === hash) T9.route(); else location.hash = hash;
  };
  // href đúng với thẻ <base>: dùng đường dẫn hiện tại + hash
  T9.href = function (hash) { return location.pathname + location.search + hash; };
  T9.link = function (hash, attrs, kids) {
    var a = h('a', Object.assign({ href: T9.href(hash) }, attrs || {}), kids);
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); T9.go(hash);
    });
    return a;
  };

  // ---------- bottom sheet (đóng được bằng nút Back của điện thoại) ----------
  var sheetStack = [];
  var ignorePops = 0;
  T9.sheetOpen = function () { return sheetStack.length > 0; };
  T9.sheet = function (title, build) {
    var back = h('div', { class: 'sheet-back' });
    var body = h('div', { class: 'sheet-body' });
    var closed = false;
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'sheet-head' }, [
        h('div', { class: 'sheet-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: function () { close(); } }, [T9.ico('close', 22)]),
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
      if (!fromPop && history.state && history.state.sheet) { ignorePops++; T9.backPending = true; setTimeout(function () { T9.backPending = false; }, 600); history.back(); }
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* bỏ qua */ } }
      if (T9.afterSheet) T9.afterSheet();
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
    T9.backPending = false;
    if (ignorePops > 0) { ignorePops--; return; } // popstate do chính mình gọi history.back() khi đóng bảng
    if (sheetStack.length) sheetStack[sheetStack.length - 1].close(true);
  });

  T9.closeSheets = function () { while (sheetStack.length) sheetStack[sheetStack.length - 1].close(true); };

  T9.confirm = function (o) {
    return new Promise(function (resolve) {
      var answered = false;
      var s = T9.sheet(o.title || 'Xác nhận', function (body, close) {
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
  T9.chip = function (text, kind) { return h('span', { class: 'chip ' + (kind || ''), text: text }); };
  T9.empty = function (title, text, action) {
    return h('div', { class: 'empty' }, [h('div', { class: 'empty-t', text: title }), text ? h('div', { class: 'muted', text: text }) : null, action || null]);
  };
  T9.notice = function (kind, title, text, action) {
    return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : null }, [
      h('div', { class: 'notice-ico' }, [T9.ico(kind === 'bad' || kind === 'warn' ? 'warn' : 'info', 22)]),
      h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: title }), text ? h('div', { text: text }) : null, action || null]),
    ]);
  };
  T9.btn = function (text, cls, onclick, extra) {
    return h('button', Object.assign({ class: 'btn ' + (cls || ''), type: 'button', onclick: onclick }, extra || {}), [text]);
  };
  T9.field = function (label, input, hint) {
    var id = 'f' + rid().slice(0, 6);
    input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null]);
  };
  T9.text = function (o) {
    return h('input', Object.assign({ type: 'text', autocomplete: 'off', autocapitalize: 'sentences', maxlength: 60, enterkeyhint: 'done' }, o || {}));
  };
  T9.money = function (o) {
    return h('input', Object.assign({ type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', enterkeyhint: 'done' }, o || {}));
  };

  // Mẫu nhập tài khoản ngân hàng: trả về { node, read() } (read trả null nếu bỏ trống, ném lỗi nếu nhập dở)
  T9.bankForm = function (cur) {
    cur = cur || {};
    var sel = h('select', {}, [h('option', { value: '', text: 'Chọn ngân hàng' })].concat(T9.BANKS.map(function (b) {
      return h('option', { value: b[0], text: b[1] });
    })));
    sel.value = cur.bin || '';
    var acc = T9.text({ inputmode: 'numeric', maxlength: 24, value: cur.account || '', placeholder: 'Số tài khoản' });
    var holder = T9.text({ maxlength: 50, value: cur.holder || '', placeholder: 'NGUYEN VAN A', autocapitalize: 'characters' });
    var node = h('div', {}, [
      T9.field('Ngân hàng', sel), T9.field('Số tài khoản', acc), T9.field('Tên chủ tài khoản', holder, 'Đúng tên in trên thẻ để mọi người yên tâm chuyển'),
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
    if (T9.sheetOpen() || composing) return true;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && T9.$('view').contains(a)) {
      return a.getAttribute('data-k') ? (Date.now() - lastInput) < 3500 : true;
    }
    return false;
  }
  T9.liveStop = function () { clearInterval(liveTimer); liveTimer = null; liveState = null; };
  // opts: { fetch: () => Promise<data>, render: (data) => void, every: ms }
  T9.live = function (opts) {
    T9.liveStop();
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
        if (typingNow() && !(force && !T9.sheetOpen() && !composing)) { st.pending = data; return; }
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
  T9.refresh = function (force) { return liveState ? liveState.load(force) : Promise.resolve(); };
  // gọi sau khi một thao tác đã xong: luôn vẽ lại (kể cả khi dữ liệu trùng) bằng dữ liệu mới nhất
  T9.rerender = function (data) { if (liveState) liveState.apply(data); };
  T9.afterSheet = function () { if (liveState) setTimeout(function () { liveState && liveState.flush(); }, 50); };
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
  // Các mục của thanh dưới
  T9.TABS = [
    ['hom', 'Hôm nay', 'home', '#/'], ['lich', 'Lịch', 'calendar', '#/lich'], ['hs', 'Học sinh', 'users', '#/hs'],
    ['tien', 'Tiền', 'wallet', '#/tien'], ['cd', 'Cài đặt', 'gear', '#/cai-dat'],
  ];
  // o: { title, back (hash), right (nodes), tab (khóa mục đang chọn; bỏ trống = ẩn thanh dưới) }
  T9.frame = function (o) {
    var bar = T9.$('bar'), barIn = T9.$('bar-in'), tabs = T9.$('tabs');
    T9.clear(barIn);
    bar.className = 'bar';
    if (o.back) {
      barIn.appendChild(T9.link(o.back, { class: 'icon-btn', 'aria-label': 'Quay lại' }, [T9.ico('back', 24)]));
    } else {
      barIn.appendChild(h('a', { href: '/', class: 'home9app', 'aria-label': 'Về trang 9app' }, [T9.ico('back', 18), '9app']));
    }
    barIn.appendChild(h('div', { class: 'ttl', text: o.title || '9tutor' }));
    (o.right || []).forEach(function (n) { barIn.appendChild(n); });
    T9.clear(tabs);
    if (o.tab) {
      T9.TABS.forEach(function (t) {
        tabs.appendChild(T9.link(t[3], { class: 'tab' + (t[0] === o.tab ? ' on' : ''), 'aria-current': t[0] === o.tab ? 'page' : null }, [T9.ico(t[2], 24), h('span', { text: t[1] })]));
      });
      tabs.className = 'tabs'; document.body.classList.add('has-tabs');
    } else { tabs.className = 'tabs hidden'; document.body.classList.remove('has-tabs'); }
    T9.setCta(null);
  };
  // Màn không có khung (trang công khai, chào mừng)
  T9.bare = function () {
    T9.$('bar').className = 'bar hidden'; T9.$('tabs').className = 'tabs hidden';
    document.body.classList.remove('has-tabs'); T9.setCta(null);
  };
  T9.setCta = function (node) {
    var cta = T9.$('cta');
    T9.clear(cta);
    if (!node) { cta.className = 'cta hidden'; document.body.classList.remove('has-cta'); return; }
    cta.className = 'cta'; document.body.classList.add('has-cta');
    cta.appendChild(node);
  };
  T9.mount = function (nodes, cls) {
    var v = T9.$('view');
    var y = window.scrollY;
    T9.clear(v);
    v.appendChild(h('div', { class: 'page' + (cls ? ' ' + cls : '') }, nodes));
    // Enter trên bàn phím điện thoại phải gửi được form nhiều ô: nút chính của mỗi form là type=submit
    v.querySelectorAll('form').forEach(function (f) {
      var btns = f.querySelectorAll('.btn');
      var main = f.querySelector('.btn.primary') || btns[btns.length - 1];
      if (main) main.setAttribute('type', 'submit');
    });
    return y;
  };
  T9.skeleton = function () {
    T9.clear(T9.$('view'));
    T9.$('view').appendChild(h('div', { class: 'page' }, [h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel short' })]));
  };

  // Màn lỗi tải trang: có nút thử lại
  T9.loadError = function (e, retry) {
    T9.setCta(null);
    T9.liveStop();
    var offline = e && e.offline;
    T9.mount([T9.empty(offline ? 'Chưa có mạng' : (e && e.status === 404 ? 'Không tìm thấy' : 'Chưa tải được'), (e && e.message) || 'Thử lại nhé', h('div', { class: 'btn-row center' }, [
      e && e.status === 404 ? T9.link('#/', { class: 'btn primary' }, ['Về trang chủ']) : T9.btn('Thử lại', 'primary', retry),
    ]))]);
  };
})();
