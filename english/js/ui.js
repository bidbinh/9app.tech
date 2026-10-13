/* Tiện ích giao diện: dựng DOM an toàn (không innerHTML với dữ liệu), biểu tượng SVG, thông báo nhỏ. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  // Biểu tượng nét mảnh 24x24 (stroke currentColor)
  var P = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    cards: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5V16a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 4 16zM8 20.5h9A3 3 0 0 0 20 17.5V9',
    chat: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 10h8M8 13h5',
    headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    volume: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11',
    mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6L6 18',
    flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 1.8 2.5C11 8.5 10.5 5.5 12 3z',
    clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM3.5 7.5l8.5 6 8.5-6',
    chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
    plane: 'M21 3L10 14M21 3l-6.5 18-3.5-7-7-3.5z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.100 0-2.100-.5-2.600-1.500M12 6.500V8M12 16v1.500',
    laptop: 'M5 17V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v10M3 18.5h18l-1 1.500H4z',
    hand: 'M8 12V6.500a1.500 1.500 0 0 1 3 0V11M11 11V5a1.500 1.500 0 0 1 3 0v6M14 11V6.500a1.500 1.500 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.700L3.500 14a1.500 1.500 0 0 1 2.500-1.500L8 14',
    shield: 'M12 3l7 3v5c0 5-3 8.500-7 10-4-1.500-7-5-7-10V6zM9 12l2 2 4-4',
    phone: 'M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z',
    smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.500 14a4 4 0 0 0 7 0M9 9.500h.01M15 9.500h.01',
    cal: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
    bed: 'M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.500h.01',
    'hand-shake': 'M3 11l4-3 4 1 3-2 4 3 3 0M3 11v4l5 4 2-1 2 1 3-2 1 .5M21 11v4l-3 2',
    play: 'M7 4.500v15l12-7.500z',
    pause: 'M8 5v14M16 5v14',
    copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
    back: 'M15 5l-7 7 7 7',
    next: 'M9 5l7 7-7 7',
    target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
    trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 20h8M9.500 17h5',
    download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    refresh: 'M20 11a8 8 0 0 0-14.500-3.500L4 9M4 4v5h5M4 13a8 8 0 0 0 14.500 3.500L20 15M20 20v-5h-5',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20.500a2 2 0 0 0 4 0',
    sliders: 'M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M8 16v4',
    list: 'M9 6h11M9 12h11M9 18h11M4.500 6h.01M4.500 12h.01M4.500 18h.01',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.9.400-1.600 1-2.100A6 6 0 0 0 12 3z',
    alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    stop: 'M7 7h10v10H7z'
  };

  function icon(name, size) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 22); s.setAttribute('height', size || 22);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'ic');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', P[name] || P.more);
    if (name === 'play') p.setAttribute('fill', 'currentColor');
    s.appendChild(p);
    return s;
  }

  /* h('div.card#id', {onclick: fn, 'aria-label': '...'}, child, 'text', [children]) */
  function h(sel, attrs) {
    var m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
    var el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, function (_, t, n) { if (t === '.') el.classList.add(n); else el.id = n; return ''; });
    var start = 1;
    if (attrs && typeof attrs === 'object' && !(attrs.nodeType) && !Array.isArray(attrs)) {
      start = 2;
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') v.split(' ').forEach(function (c) { if (c) el.classList.add(c); });
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    for (var i = start; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  var toastTimer = null;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  function btn(label, opts) {
    opts = opts || {};
    var b = h('button.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''), { type: 'button', onclick: opts.onclick, 'aria-label': opts.aria, disabled: opts.disabled });
    if (opts.icon) b.appendChild(icon(opts.icon, opts.iconSize || 18));
    if (label) b.appendChild(h('span', { text: label }));
    return b;
  }
  function iconBtn(name, label, onclick, cls) {
    return h('button.ibtn' + (cls ? '.' + cls : ''), { type: 'button', onclick: onclick, 'aria-label': label, title: label }, icon(name, 20));
  }

  var api = { h: h, icon: icon, clear: clear, toast: toast, btn: btn, iconBtn: iconBtn };
  (root.E9 = root.E9 || {}).ui = api; root.E9.views = root.E9.views || {};
})(self);
