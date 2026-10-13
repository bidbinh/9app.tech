/* 9Ship — tiện ích giao diện dùng chung (ES5, không module). Gắn vào window.S9. */
(function () {
  'use strict';
  var S9 = window.S9 = window.S9 || {};

  // ---------- DOM ----------
  S9.h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    var k;
    attrs = attrs || {};
    for (k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  };
  var h = S9.h;
  S9.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };

  // ---------- biểu tượng (SVG dựng bằng DOM, không chèn markup thô) ----------
  var PATHS = {
    box: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5', 'M12 13v8'],
    send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    pin: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', 'M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    wallet: ['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z', 'M16 14h.01'],
    chev: ['M9 6l6 6-6 6'],
    back: ['M15 6l-6 6 6 6'],
    close: ['M6 6l12 12', 'M18 6 6 18'],
    check: ['M5 12l5 5L20 7'],
    plus: ['M12 5v14', 'M5 12h14'],
    search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-4.3-4.3'],
    edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
    copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
    truck: ['M1 4h13v12H1z', 'M14 8h4l3 3v5h-7z', 'M5.5 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'M17.5 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
    shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
    tag: ['M20 12l-8 8-9-9V3h8z', 'M7.5 7.5h.01'],
    star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    warn: ['M12 3 2 21h20z', 'M12 10v5', 'M12 18h.01'],
    gps: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
    home: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
    book: ['M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z', 'M8 8h7', 'M8 12h7']
  };
  S9.ico = function (name, size, stroke) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    var s = size || 20;
    svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', stroke || 2); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    (PATHS[name] || []).forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  };

  // ---------- định dạng ----------
  S9.vnd = function (n) { return (Math.round(n) || 0).toLocaleString('vi-VN') + ' đ'; };
  S9.norm = function (s) {
    s = String(s || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* trình duyệt cũ: bỏ qua */ }
    return s.replace(/đ/g, 'd');
  };
  S9.uid = function () { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); };
  S9.fmtDate = function (d) {
    var x = new Date(d);
    return x.toLocaleDateString('vi-VN') + ' ' + x.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };
  S9.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p.length > 1 ? p[p.length - 2].charAt(0) : '') + p[p.length - 1].charAt(0)).toUpperCase();
  };
  var COLORS = ['#f97316', '#2563eb', '#16a34a', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#475569'];
  S9.colorOf = function (s) {
    var n = 0, i;
    s = String(s || '');
    for (i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 997;
    return COLORS[n % COLORS.length];
  };
  S9.avatar = function (name) { return h('div', { class: 'avatar', style: 'background:' + S9.colorOf(name), text: S9.initials(name) }); };

  // ---------- lưu tạm theo phiên ----------
  S9.store = function (k, v) {
    try {
      if (v === undefined) return JSON.parse(sessionStorage.getItem(k));
      if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v));
    } catch (e) { /* bỏ qua */ }
    return null;
  };
  S9.keep = function (k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { /* bỏ qua */ }
    return null;
  };

  // ---------- thông báo ----------
  var toastTimer = null;
  S9.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.className = 'toast';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, 3400);
  };

  // ---------- gọi API ----------
  S9.api = function (method, path, body, headers) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, 'v1/' + path, true);
      x.setRequestHeader('X-Requested-With', '9ship');
      if (body !== undefined && body !== null) x.setRequestHeader('Content-Type', 'application/json');
      var k;
      for (k in (headers || {})) x.setRequestHeader(k, headers[k]);
      x.onload = function () {
        var j = null;
        try { j = JSON.parse(x.responseText); } catch (e) { j = null; }
        if (x.status >= 200 && x.status < 300) return resolve(j);
        var err = (j && j.error) || {};
        reject({ status: x.status, code: err.code || 'error', message: err.message || 'Có lỗi xảy ra', details: err.details });
      };
      x.onerror = function () { reject({ status: 0, code: 'network', message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.' }); };
      x.timeout = 30000; x.ontimeout = x.onerror;
      x.send(body !== undefined && body !== null ? JSON.stringify(body) : null);
    });
  };

  // ---------- ngăn kéo (bottom sheet) ----------
  var openSheets = [];
  S9.sheet = function (title, opts) {
    opts = opts || {};
    var back = h('div', { class: 'sheet-back' });
    var bd = h('div', { class: 'bd' });
    var closeBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Đóng', onclick: function () { api.close(); } }, [S9.ico('close', 22)]);
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'grab' }),
      h('div', { class: 'hd' }, [h('b', { text: title }), closeBtn])
    ]);
    if (opts.search) panel.appendChild(h('div', { class: 'srch' }, [opts.search]));
    panel.appendChild(bd);
    back.appendChild(panel);
    back.style.top = '0'; back.style.left = '0'; back.style.right = '0'; back.style.bottom = '0';
    back.addEventListener('click', function (e) { if (e.target === back) api.close(); });
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    var api = {
      body: bd,
      close: function () {
        if (!back.parentNode) return;
        back.parentNode.removeChild(back);
        openSheets = openSheets.filter(function (s) { return s !== api; });
        if (!openSheets.length) document.body.style.overflow = '';
        if (opts.onclose) opts.onclose();
      }
    };
    openSheets.push(api);
    return api;
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openSheets.length) openSheets[openSheets.length - 1].close();
  });
  S9.closeAllSheets = function () { while (openSheets.length) openSheets[openSheets.length - 1].close(); };
})();
