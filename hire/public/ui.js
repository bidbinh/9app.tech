/* 9hire: tiện ích giao diện dùng chung. Chỉ dùng textContent / DOM API, không bao giờ chèn HTML thô. */
(function () {
  'use strict';
  var H9 = window.H9 = window.H9 || {};

  // ---------- DOM ----------
  H9.h = function (tag, attrs, kids) {
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
  var h = H9.h;
  H9.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  H9.$ = function (id) { return document.getElementById(id); };

  // ---------- biểu tượng ----------
  var PATHS = {
    back: ['M15 6l-6 6 6 6'], chev: ['M9 6l6 6-6 6'], plus: ['M12 5v14', 'M5 12h14'], check: ['M5 12l5 5L20 7'], close: ['M6 6l12 12', 'M18 6 6 18'],
    copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'], search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-4.3-4.3'],
    sliders: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', 'M15 4v4', 'M9 10v4', 'M17 16v4'],
    phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
    chat: ['M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z'],
    pin: ['M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'],
    shield: ['M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z', 'M9 12l2 2 4-4'],
    flag: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
    briefcase: ['M3 8h18v12H3z', 'M8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3', 'M3 13h18'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
    bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0'],
    inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z'],
    bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'], clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    warn: ['M12 3 2 21h20z', 'M12 10v5', 'M12 18h.01'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
    share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'], trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
    edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'], lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
    key: ['M15.5 7.5l3 3L22 7l-3-3', 'M15.5 7.5L11.4 11.6', 'M11.4 11.6a5 5 0 1 0-7 7 5 5 0 0 0 7-7z'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'], download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
    plusc: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8v8', 'M8 12h8'], money: ['M12 2v20', 'M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
    cup: ['M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z', 'M17 9h2a2 2 0 0 1 0 5h-2', 'M8 3v2', 'M12 3v2'],
    bowl: ['M3 11h18a9 9 0 0 1-18 0z', 'M8 7c0-1.5 1-2 1-3', 'M13 7c0-1.5 1-2 1-3'],
    cart: ['M3 4h2l2.4 11h10.2L20 7H6', 'M9 20a1 1 0 1 0 0 .01', 'M17 20a1 1 0 1 0 0 .01'],
    box: ['M21 8l-9-5-9 5v8l9 5 9-5z', 'M3 8l9 5 9-5', 'M12 13v8'], bike: ['M5 18a3 3 0 1 0 0 .01', 'M19 18a3 3 0 1 0 0 .01', 'M5 18l4-9h5l3 9', 'M9 9l-1-3H6', 'M14 9l1-3h2'],
    helmet: ['M4 16a8 8 0 0 1 16 0v2H4z', 'M12 8v4'], gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z'],
    desk: ['M3 6h18v9H3z', 'M8 21h8', 'M12 15v6'], dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'], calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
    eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  };
  H9.ico = function (name, size, stroke) {
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

  // ---------- danh mục (lấy từ máy chủ, có bản dự phòng) ----------
  H9.meta = null;
  H9.loadMeta = function () {
    if (H9.meta) return Promise.resolve(H9.meta);
    return H9.get('api/meta').then(function (m) { H9.meta = m; return m; });
  };
  H9.label = function (list, key) {
    var l = (H9.meta && H9.meta[list]) || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === key) return l[i][1];
    return '';
  };
  H9.CAT_ICON = { phuc_vu: 'cup', bep: 'bowl', ban_hang: 'cart', kho: 'box', giao_hang: 'bike', tap_vu: 'helmet', san_xuat: 'gear', van_phong: 'desk', khac: 'briefcase' };
  // gợi ý quận/huyện (chỉ để gõ nhanh, không bắt buộc)
  H9.DISTRICTS = {
    hcm: ['Quận 1', 'Quận 3', 'Quận 4', 'Quận 5', 'Quận 6', 'Quận 7', 'Quận 8', 'Quận 10', 'Quận 11', 'Quận 12', 'Bình Thạnh', 'Gò Vấp', 'Phú Nhuận', 'Tân Bình', 'Tân Phú', 'Bình Tân', 'Thủ Đức', 'Nhà Bè', 'Bình Chánh', 'Hóc Môn', 'Củ Chi', 'Dĩ An', 'Thuận An'],
    hn: ['Ba Đình', 'Hoàn Kiếm', 'Đống Đa', 'Hai Bà Trưng', 'Cầu Giấy', 'Thanh Xuân', 'Hoàng Mai', 'Long Biên', 'Tây Hồ', 'Nam Từ Liêm', 'Bắc Từ Liêm', 'Hà Đông', 'Gia Lâm', 'Đông Anh'],
    dn: ['Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Liên Chiểu', 'Cẩm Lệ', 'Hòa Vang'],
    hp: ['Hồng Bàng', 'Ngô Quyền', 'Lê Chân', 'Kiến An', 'Hải An'], ct: ['Ninh Kiều', 'Bình Thủy', 'Cái Răng', 'Ô Môn'], khac: [],
  };

  // ---------- định dạng ----------
  var DOT = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  H9.vnd = function (n) { return DOT(n) + 'đ'; };
  // "25k", "1,5tr", "25.000" -> số nguyên; NaN nếu không hiểu
  H9.parseMoney = function (s) {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(/đ|d$|vnd|vnđ/g, '').replace(/\s+/g, '');
    if (!s) return NaN;
    var mult = 1;
    if (/(tr|triệu|trieu)$/.test(s)) { mult = 1000000; s = s.replace(/(tr|triệu|trieu)$/, ''); }
    else if (/(k|nghìn|ngàn)$/.test(s)) { mult = 1000; s = s.replace(/(k|nghìn|ngàn)$/, ''); }
    if (mult > 1) {
      if (!/^\d+([.,]\d{1,3})?$/.test(s)) return NaN;
      return Math.round(parseFloat(s.replace(',', '.')) * mult);
    }
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10);
    return NaN;
  };
  var UNIT = { gio: '/giờ', ngay: '/ngày', ca: '/ca', thang: '/tháng' };
  function trieu(n) { var v = Math.round(n / 100000) / 10; return String(v).replace('.', ','); }
  H9.payText = function (j) {
    if (j.payType === 'thoa_thuan' || j.payMin == null) return 'Thỏa thuận';
    var u = UNIT[j.payType] || '';
    if (j.payType === 'thang' && j.payMin >= 1000000) {
      return j.payMax && j.payMax !== j.payMin ? trieu(j.payMin) + ' - ' + trieu(j.payMax) + ' triệu' + u : (trieu(j.payMin) + ' triệu' + u);
    }
    if (j.payMax && j.payMax !== j.payMin) return DOT(j.payMin) + ' - ' + DOT(j.payMax) + 'đ' + u;
    return 'Từ ' + DOT(j.payMin) + 'đ' + u;
  };
  H9.ago = function (iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'Vừa đăng';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' phút trước';
    var hr = Math.round(m / 60);
    if (hr < 24) return hr + ' giờ trước';
    var d = Math.round(hr / 24);
    if (d < 30) return d + ' ngày trước';
    return Math.round(d / 30) + ' tháng trước';
  };
  H9.daysLeft = function (iso) {
    var ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Đã hết hạn';
    var d = Math.ceil(ms / 86400000);
    return d <= 1 ? 'Hạn hôm nay' : 'Còn ' + d + ' ngày';
  };
  H9.dateVN = function (iso) {
    var d = new Date(iso);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  };
  H9.initial = function (s) { return String(s || '?').trim().charAt(0).toUpperCase() || '?'; };

  // ---------- lưu trên thiết bị (không bí mật) ----------
  H9.store = function (k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem('9hire.' + k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem('9hire.' + k); else localStorage.setItem('9hire.' + k, JSON.stringify(v));
    } catch (e) { /* chế độ riêng tư: bỏ qua */ }
    return null;
  };

  // ---------- gọi API ----------
  var BASE = document.baseURI;
  H9.api = function (method, path, body, opts) {
    opts = opts || {};
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    var headers = { 'X-Requested-With': '9hire' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(new URL(path, BASE).href, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* không phải JSON */ }
          if (r.ok) return j;
          var e = (j && j.error) || {};
          var err = new Error(e.message || 'Có lỗi xảy ra, thử lại nhé');
          err.status = r.status; err.code = e.code; err.details = e.details;
          throw err;
        });
      }, function () {
        if (timer) clearTimeout(timer);
        var err = new Error('Không kết nối được mạng. Dữ liệu bạn nhập vẫn còn, bấm lại khi có mạng.');
        err.offline = true;
        throw err;
      });
  };
  H9.get = function (p) { return H9.api('GET', p); };
  H9.post = function (p, b) { return H9.api('POST', p, b === undefined ? {} : b); };
  H9.put = function (p, b) { return H9.api('PUT', p, b); };
  H9.del = function (p) { return H9.api('DELETE', p); };

  // ---------- toast ----------
  var toastTimer = null;
  H9.toast = function (msg, kind) {
    var t = H9.$('toast');
    H9.clear(t);
    t.className = 'toast ' + (kind || '');
    t.appendChild(document.createTextNode(msg));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, kind === 'err' ? 6000 : 3200);
  };
  H9.fail = function (e) { H9.toast((e && e.message) || 'Có lỗi xảy ra, thử lại nhé', 'err'); };

  // Bấm nút: khóa nút trong lúc chạy (chống bấm đúp), lỗi thì báo rõ và mở lại nút
  H9.busy = function (btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add('loading');
    var done = function () { btn.disabled = false; btn.classList.remove('loading'); };
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) { done(); return r; }, function (e) { done(); H9.fail(e); });
  };

  // ---------- sao chép ----------
  H9.copy = function (text, msg) {
    function ok() { H9.toast(msg || 'Đã sao chép'); }
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', class: 'offscreen', readonly: true });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { H9.toast('Máy không cho sao chép, hãy nhấn giữ để chép tay', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  };

  // ---------- điều hướng ----------
  H9.backPending = false;
  H9.go = function (hash) {
    if (H9.backPending) { setTimeout(function () { H9.go(hash); }, 25); return; } // đợi history.back() của sheet xong
    if (location.hash === hash) H9.route(); else location.hash = hash;
  };
  H9.href = function (hash) { return location.pathname + location.search + hash; };
  H9.link = function (hash, attrs, kids) {
    var a = h('a', Object.assign({ href: H9.href(hash) }, attrs || {}), kids);
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); H9.go(hash);
    });
    return a;
  };

  // ---------- bottom sheet (đóng được bằng nút Back của điện thoại) ----------
  var sheetStack = [];
  H9.sheetOpen = function () { return sheetStack.length > 0; };
  H9.sheet = function (title, build) {
    var back = h('div', { class: 'sheet-back' });
    var body = h('div', { class: 'sheet-body' });
    var closed = false;
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'sheet-head' }, [
        h('div', { class: 'sheet-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: function () { close(); } }, [H9.ico('close', 22)]),
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
      if (!fromPop && history.state && history.state.sheet) { H9.backPending = true; setTimeout(function () { H9.backPending = false; }, 600); history.back(); }
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* bỏ qua */ } }
      if (entry.onclose) entry.onclose();
    }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(back);
    document.body.classList.add('sheet-open');
    sheetStack.push(entry);
    history.pushState({ sheet: true }, '');
    build(body, close);
    var first = body.querySelector('input,select,textarea');
    if (first && !/Mobi|Android/i.test(navigator.userAgent)) first.focus();
    return entry;
  };
  window.addEventListener('popstate', function () {
    H9.backPending = false;
    if (sheetStack.length) sheetStack[sheetStack.length - 1].close(true);
  });
  H9.closeSheets = function () { while (sheetStack.length) sheetStack[sheetStack.length - 1].close(true); };

  H9.confirm = function (o) {
    return new Promise(function (resolve) {
      var answered = false;
      var s = H9.sheet(o.title || 'Xác nhận', function (body, close) {
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
  H9.chip = function (text, kind, icon) { return h('span', { class: 'chip ' + (kind || '') }, [icon ? H9.ico(icon, 14) : null, text]); };
  H9.empty = function (title, text, action) {
    return h('div', { class: 'empty' }, [h('div', { class: 'empty-t', text: title }), text ? h('div', { class: 'muted', text: text }) : null, action || null]);
  };
  H9.notice = function (kind, title, text, extra) {
    return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : null }, [
      h('div', { class: 'notice-ico' }, [H9.ico(kind === 'bad' || kind === 'warn' ? 'warn' : (kind === 'brand' ? 'shield' : 'info'), 22)]),
      h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: title }), text ? h('div', { text: text }) : null, extra || null]),
    ]);
  };
  H9.btn = function (text, cls, onclick, extra, icon) {
    return h('button', Object.assign({ class: 'btn ' + (cls || ''), type: 'button', onclick: onclick }, extra || {}), [icon ? H9.ico(icon, 20) : null, text]);
  };
  var fid = 0;
  H9.field = function (label, input, hint) {
    var id = 'f' + (++fid);
    input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null]);
  };
  H9.text = function (o) { return h('input', Object.assign({ type: 'text', autocomplete: 'off', maxlength: 80, enterkeyhint: 'done' }, o || {})); };
  H9.select = function (opts, value, first) {
    var s = h('select', {}, (first ? [h('option', { value: '', text: first })] : []).concat(opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); })));
    s.value = value || '';
    return s;
  };
  H9.checkbox = function (label, checked) {
    var inp = h('input', { type: 'checkbox', checked: !!checked });
    return { node: h('label', { class: 'check' }, [inp, h('span', { text: label })]), input: inp };
  };
  // nhóm nút chọn nhiều (ca làm...): trả { node, get(), set(arr) }
  H9.multi = function (opts, selected) {
    var sel = (selected || []).slice();
    var node = h('div', { class: 'pills' });
    function draw() {
      H9.clear(node);
      opts.forEach(function (o) {
        var on = sel.indexOf(o[0]) >= 0;
        node.appendChild(h('button', { type: 'button', class: 'pill' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', text: o[1], onclick: function () {
          var i = sel.indexOf(o[0]);
          if (i >= 0) sel.splice(i, 1); else sel.push(o[0]);
          draw();
        } }));
      });
    }
    draw();
    return { node: node, get: function () { return sel.slice(); } };
  };

  // bàn phím ảo: ô đang nhập luôn nằm trong tầm nhìn, thanh nút dưới ẩn đi
  document.addEventListener('focusin', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'checkbox') {
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

  // ---------- khung ----------
  // o: { title, back (hash), right: [node], brand: true, tabs: 'home'|'saved'|'employer'|'me'|null, narrow: bool }
  var NAV = [['#/', 'Việc làm', 'briefcase', 'home'], ['#/saved', 'Đã lưu', 'heart', 'saved'], ['#/employer', 'Đăng tuyển', 'plusc', 'employer'], ['#/me', 'Của tôi', 'user', 'me']];
  H9.alertBadge = 0;
  H9.frame = function (o) {
    var bar = H9.$('bar'), barIn = H9.$('bar-in');
    H9.clear(barIn);
    bar.className = 'bar';
    if (o.back) {
      barIn.appendChild(H9.link(o.back, { class: 'icon-btn', 'aria-label': 'Quay lại' }, [H9.ico('back', 24)]));
    } else {
      barIn.appendChild(h('a', { href: '/', class: 'home9app', 'aria-label': 'Về trang 9app' }, [H9.ico('back', 18), '9app']));
    }
    if (o.brand) barIn.appendChild(h('div', { class: 'ttl' }, [h('span', { class: 'brand-mark' }, [h('img', { src: 'icon.svg', alt: '', width: 30, height: 30 }), h('span', {}, ['9', h('b', { text: 'hire' })])])]));
    else barIn.appendChild(h('div', { class: 'ttl', text: o.title || '9hire' }));
    var dn = h('nav', { class: 'desk-nav', 'aria-label': 'Điều hướng' }, NAV.map(function (n) {
      return H9.link(n[0], { class: o.tabs === n[3] ? 'on' : '', 'aria-current': o.tabs === n[3] ? 'page' : null }, [n[1]]);
    }));
    barIn.appendChild(dn);
    (o.right || []).forEach(function (n) { barIn.appendChild(n); });
    // thanh tab dưới
    var tabs = H9.$('tabs');
    H9.clear(tabs);
    if (o.tabs) {
      tabs.className = 'tabs'; document.body.classList.add('has-tabs');
      NAV.forEach(function (n) {
        var a = H9.link(n[0], { class: 'tab' + (o.tabs === n[3] ? ' on' : ''), 'aria-current': o.tabs === n[3] ? 'page' : null }, [H9.ico(n[2], 24), n[1]]);
        tabs.appendChild(a);
      });
    } else { tabs.className = 'tabs hidden'; document.body.classList.remove('has-tabs'); }
    H9.$('view').className = 'app' + (o.narrow ? ' narrow' : '');
    H9.setCta(null);
  };
  H9.setCta = function (node) {
    var cta = H9.$('cta');
    H9.clear(cta);
    if (!node) { cta.className = 'cta hidden'; document.body.classList.remove('has-cta'); return; }
    cta.className = 'cta'; document.body.classList.add('has-cta');
    cta.appendChild(node);
  };
  H9.mount = function (nodes) {
    var v = H9.$('view');
    H9.clear(v);
    v.appendChild(h('div', { class: 'page' }, nodes));
    // Enter trên bàn phím điện thoại phải gửi được form nhiều ô
    v.querySelectorAll('form').forEach(function (f) {
      var btns = f.querySelectorAll('.btn');
      var main = f.querySelector('.btn.primary') || btns[btns.length - 1];
      if (main) main.setAttribute('type', 'submit');
    });
  };
  H9.skeleton = function () {
    H9.clear(H9.$('view'));
    H9.$('view').appendChild(h('div', { class: 'page' }, [h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel short' })]));
  };
  H9.loadError = function (e, retry) {
    H9.setCta(null);
    var offline = e && e.offline;
    H9.mount([H9.empty(offline ? 'Chưa có mạng' : (e && e.status === 404 ? 'Không tìm thấy' : 'Chưa tải được'), (e && e.message) || 'Thử lại nhé', h('div', { class: 'btn-row center' }, [
      e && e.status === 404 ? H9.link('#/', { class: 'btn primary' }, ['Về trang chủ']) : H9.btn('Thử lại', 'primary', retry),
    ]))]);
  };
})();
