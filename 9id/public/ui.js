/* 9id: tiện ích giao diện dùng chung. Chỉ dùng textContent / DOM API, không bao giờ chèn HTML thô. */
(function () {
  'use strict';
  var N = window.N = window.N || {};
  N.me = null; N.pending = 0; N.approvals = 0; N.notices = [];

  // ---------- DOM ----------
  N.h = function (tag, attrs, kids) {
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
  var h = N.h;
  N.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  N.$ = function (id) { return document.getElementById(id); };

  // ---------- biểu tượng ----------
  var PATHS = {
    back: ['M15 6l-6 6 6 6'], chev: ['M9 6l6 6-6 6'], plus: ['M12 5v14', 'M5 12h14'], check: ['M5 12l5 5L20 7'], close: ['M6 6l12 12', 'M18 6 6 18'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    mail: ['M3 5h18v14H3z', 'M3 6l9 7 9-7'], warn: ['M12 3 2 21h20z', 'M12 10v5', 'M12 18h.01'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
    eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    eyeoff: ['M3 3l18 18', 'M10.6 5.1A10 10 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4', 'M6.6 6.6A18 18 0 0 0 1 12s4 7 11 7a10 10 0 0 0 4-.8', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
    shield: ['M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z', 'M9 12l2 2 4-4'], device: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
    home: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'], trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'], edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'], logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'], phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  };
  N.ico = function (name, size, stroke) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    var s = size || 20;
    svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', stroke || 2); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    (PATHS[name] || []).forEach(function (d) { var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    return svg;
  };

  // ---------- định dạng ----------
  N.initial = function (name) { var t = String(name || '?').trim(); return t ? Array.from(t)[0].toUpperCase() : '?'; };
  N.dmy = function (iso) { var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); };
  N.ago = function (iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'vừa xong'; if (s < 3600) return Math.round(s / 60) + ' phút trước';
    if (s < 86400) return Math.round(s / 3600) + ' giờ trước'; if (s < 86400 * 30) return Math.round(s / 86400) + ' ngày trước';
    return N.dmy(iso);
  };
  N.ROLE = { chu: 'Chủ gia đình', quan_ly: 'Quản lý', thanh_vien: 'Thành viên', con: 'Con' };

  // ---------- next: chỉ đường dẫn cùng nguồn gốc (giống máy chủ; máy chủ vẫn kiểm lại) ----------
  N.safeNext = function (v) {
    if (typeof v !== 'string' || !v || v.length > 500 || v.charAt(0) !== '/') return null;
    if (v.charAt(1) === '/' || v.charAt(1) === '\\') return null;
    if (/[\\\u0000-\u001f\u007f-\u009f]/.test(v)) return null;
    var dec; try { dec = decodeURIComponent(v); } catch (e) { return null; }
    if (/^\/[\\/]/.test(dec) || dec.indexOf('\\') >= 0) return null;
    try { if (new URL(v, location.origin).origin !== location.origin) return null; } catch (e) { return null; }
    return v;
  };
  N.next = function () { return N.safeNext(new URLSearchParams(location.search).get('next')); };

  // ---------- gọi API ----------
  var BASE = document.baseURI;
  N.api = function (method, path, body, opts) {
    opts = opts || {};
    path = String(path).replace(/^\/+/, '');
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    var headers = { 'X-Requested-With': '9id' };
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
  N.get = function (p) { return N.api('GET', p); };
  N.post = function (p, b) { return N.api('POST', p, b === undefined ? {} : b); };
  N.del = function (p) { return N.api('DELETE', p); };

  // ---------- toast ----------
  var toastTimer = null;
  N.toast = function (msg, kind) {
    var t = N.$('toast');
    N.clear(t);
    t.className = 'toast ' + (kind || '');
    t.appendChild(document.createTextNode(msg));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, kind === 'err' ? 6000 : 3500);
  };
  N.fail = function (e) {
    if (e && e.status === 401 && N.me) { N.me = null; N.closeSheets(); N.toast('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại', 'err'); N.go('#/dang-nhap'); return; }
    N.toast((e && e.message) || 'Có lỗi xảy ra, thử lại nhé', 'err');
  };
  // Bấm nút: khóa nút trong lúc chạy (chống bấm đúp), lỗi thì báo và mở lại nút
  N.busy = function (btn, fn, onErr) {
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add('loading');
    var done = function () { btn.disabled = false; btn.classList.remove('loading'); };
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) { done(); return r; }, function (e) { done(); if (onErr) onErr(e); else N.fail(e); });
  };

  // ---------- điều hướng ----------
  N.go = function (hash) { if (location.hash === hash) N.route(); else location.hash = hash; };
  // liên kết giữ nguyên query (?next=...) khi đổi màn
  N.link = function (hash, attrs, kids) {
    var a = h('a', Object.assign({ href: location.pathname + location.search + hash }, attrs || {}), kids);
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); N.go(hash);
    });
    return a;
  };

  // ---------- bảng nhập (bottom sheet) ----------
  var sheets = [];
  N.sheetOpen = function () { return sheets.length > 0; };
  N.sheet = function (title, build) {
    var back = h('div', { class: 'sheet-back' });
    var body = h('div', { class: 'sheet-body' });
    var closed = false;
    var prev = document.activeElement;
    var entry = { close: close };
    function close() {
      if (closed) return;
      closed = true;
      sheets = sheets.filter(function (s) { return s !== entry; });
      if (back.parentNode) back.parentNode.removeChild(back);
      document.body.classList.toggle('sheet-open', sheets.length > 0);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* bỏ qua */ } }
    }
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'sheet-head' }, [
        h('div', { class: 'sheet-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: close }, [N.ico('close', 22)]),
      ]),
      body,
    ]);
    back.appendChild(panel);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(back);
    document.body.classList.add('sheet-open');
    sheets.push(entry);
    build(body, close);
    var first = body.querySelector('input,select,textarea,button');
    if (first && !/Mobi|Android/i.test(navigator.userAgent)) first.focus();
    return entry;
  };
  N.closeSheets = function () { while (sheets.length) sheets[sheets.length - 1].close(); };
  N.confirm = function (o) {
    return new Promise(function (resolve) {
      N.sheet(o.title || 'Xác nhận', function (body, close) {
        body.appendChild(h('p', { class: 'pre', text: o.text || '' }));
        body.appendChild(h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn ghost', type: 'button', text: o.cancel || 'Quay lại', onclick: function () { close(); resolve(false); } }),
          h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), type: 'button', text: o.ok || 'Đồng ý', onclick: function () { close(); resolve(true); } }),
        ]));
      });
    });
  };

  // ---------- phần tử dùng lại ----------
  N.chip = function (text, kind) { return h('span', { class: 'chip ' + (kind || ''), text: text }); };
  N.empty = function (title, text, action) {
    return h('div', { class: 'empty' }, [h('div', { class: 'empty-t', text: title }), text ? h('div', { class: 'muted', text: text }) : null, action || null]);
  };
  N.notice = function (kind, title, text, action) {
    return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : null }, [
      h('div', { class: 'notice-ico' }, [N.ico(kind === 'bad' || kind === 'warn' ? 'warn' : 'info', 22)]),
      h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: title }), text ? h('div', { text: text }) : null, action || null]),
    ]);
  };
  // Thông báo bảo mật dùng chung (bảng notices ở máy chủ). reload: hàm vẽ lại trang sau khi bấm "Tôi đã biết".
  var NOTICE_TEXT = {
    password_reset: ['warn', 'Mật khẩu của bạn đã được đặt lại bằng mã OTP', 'Nếu không phải bạn, hãy đổi mật khẩu ngay, kiểm tra thiết bị đang đăng nhập và liên hệ nhà mạng về SIM của bạn.'],
    new_device: ['warn', 'Có đăng nhập từ một thiết bị mới', 'Nếu không phải bạn, hãy vào Tài khoản, đăng xuất thiết bị lạ và đổi mật khẩu.'],
    phone_changed: ['info', 'Số điện thoại của tài khoản đã được đổi', 'Nếu không phải bạn, người giữ số cũ có thể hoàn tác trong 7 ngày: chọn Quên mật khẩu và nhập số cũ.'],
    phone_change_undone: ['warn', 'Việc đổi số điện thoại đã được hoàn tác', 'Số điện thoại cũ đã được khôi phục và mọi thiết bị đã bị đăng xuất. Hãy kiểm tra lại các thiết bị của bạn.'],
  };
  N.noticeCards = function (reload) {
    var out = [];
    (N.notices || []).forEach(function (n) {
      var spec = NOTICE_TEXT[n.kind];
      if (!spec) return;
      var when = 'Lúc ' + new Date(n.at).toLocaleString('vi-VN') + '. ';
      out.push(N.notice(spec[0], spec[1], when + spec[2],
        N.btn('Tôi đã biết', 'ghost sm', function (e) { N.busy(e.currentTarget, function () { return N.post('api/notices/seen').then(function () { N.notices = []; reload(); }); }); })));
    });
    return out;
  };
  N.btn = function (text, cls, onclick, extra) { return h('button', Object.assign({ class: 'btn ' + (cls || ''), type: 'button', onclick: onclick }, extra || {}), [text]); };
  var fid = 0;
  N.field = function (label, input, hint) {
    var id = 'f' + (++fid);
    input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null]);
  };
  N.text = function (o) { return h('input', Object.assign({ type: 'text', autocomplete: 'off', maxlength: 60, enterkeyhint: 'done' }, o || {})); };
  N.tel = function (o) { return h('input', Object.assign({ type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 20, placeholder: '0912 345 678', enterkeyhint: 'next' }, o || {})); };
  // ô mật khẩu có nút hiện/ẩn; trả về { node, input }
  N.password = function (o) {
    var input = h('input', Object.assign({ type: 'password', autocomplete: 'current-password', maxlength: 100, enterkeyhint: 'done' }, o || {}));
    var shown = false;
    var eye = h('button', { class: 'eye', type: 'button', 'aria-label': 'Hiện mật khẩu', 'aria-pressed': 'false' }, [N.ico('eye', 22)]);
    eye.addEventListener('click', function () {
      shown = !shown; input.type = shown ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(shown)); eye.setAttribute('aria-label', shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      N.clear(eye); eye.appendChild(N.ico(shown ? 'eyeoff' : 'eye', 22));
    });
    return { input: input, node: h('div', { class: 'pw' }, [input, eye]) };
  };
  N.passField = function (label, o, hint) {
    var p = N.password(o);
    var id = 'f' + (++fid);
    p.input.id = id;
    return { input: p.input, node: h('div', { class: 'field' }, [h('label', { for: id, text: label }), p.node, hint ? h('div', { class: 'hint', text: hint }) : null]) };
  };
  N.errBox = function () { var e = h('div', { class: 'hint err hidden', role: 'alert' }); e.show = function (m) { e.textContent = m; e.classList.remove('hidden'); }; e.hide = function () { e.classList.add('hidden'); }; return e; };
  N.onEnter = function (input, fn) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fn(); } }); };

  // ---------- thanh trên và thanh dưới ----------
  // o: { title, back (hash) }  — không có back thì hiện "‹ 9app" về launcher
  N.bar = function (o) {
    var el = N.$('bar-in'); N.clear(el);
    if (o && o.back) {
      el.appendChild(N.link(o.back, { class: 'icon-btn', 'aria-label': 'Quay lại' }, [N.ico('back', 24)]));
      el.appendChild(h('div', { class: 'ttl', text: (o && o.title) || '' }));
    } else {
      el.appendChild(h('a', { class: 'home9app', href: '/', 'aria-label': 'Về 9app' }, [N.ico('back', 22), '9app']));
      el.appendChild(h('div', { class: 'ttl', text: (o && o.title) || '' }));
    }
  };
  var TABS = [['gia-dinh', 'Gia đình', 'users', '#/gia-dinh'], ['loi-moi', 'Lời mời', 'mail', '#/loi-moi'], ['tai-khoan', 'Tài khoản', 'user', '#/tai-khoan']];
  N.tabs = function (active) {
    var nav = N.$('tabs'); N.clear(nav);
    if (!active) { nav.classList.add('hidden'); document.body.classList.remove('has-tabs'); return; }
    nav.classList.remove('hidden'); document.body.classList.add('has-tabs');
    var inner = h('div', { class: 'tabs-in' });
    TABS.forEach(function (t) {
      var a = N.link(t[3], { class: 'tab' + (t[0] === active ? ' on' : ''), 'aria-current': t[0] === active ? 'page' : null }, [N.ico(t[2], 24), t[1]]);
      if (t[0] === 'loi-moi' && N.pending > 0) a.appendChild(h('span', { class: 'badge', text: String(N.pending), 'aria-label': N.pending + ' lời mời mới' }));
      if (t[0] === 'gia-dinh' && N.approvals > 0) a.appendChild(h('span', { class: 'badge', text: String(N.approvals), 'aria-label': N.approvals + ' người chờ duyệt' }));
      inner.appendChild(a);
    });
    nav.appendChild(inner);
  };
  N.view = function () { var v = N.$('view'); N.clear(v); var p = h('div', { class: 'page' }); v.appendChild(p); return p; };

  // sáng/tối theo hệ thống; ?theme=dark|light để thử
  N.applyTheme = function () {
    var t = new URLSearchParams(location.search).get('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  };

  // bàn phím ảo: ô đang nhập luôn nằm trong tầm nhìn, thanh dưới ẩn đi
  document.addEventListener('focusin', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      document.body.classList.add('typing');
      setTimeout(function () { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* bỏ qua */ } }, 280);
    }
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () { var a = document.activeElement; if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) document.body.classList.remove('typing'); }, 100);
  });
})();
