/* Tiện ích giao diện: dựng DOM an toàn (chỉ textContent), gọi API có CSRF, hộp thoại, thông báo. */
(function () {
  'use strict';
  var O = (window.Osin = window.Osin || {});

  // h('div', {class:'a', onclick: fn}, 'text', childNode, ...)
  O.h = function (tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) O.append(el, arguments[i]);
    return el;
  };
  O.append = function (el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { O.append(el, x); });
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  };
  O.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); };

  // Gọi API cùng nguồn gốc. Lỗi trả về Error có .status .code .details
  O.uiToken = null;
  O.loadUiToken = function () {
    return fetch('api/ui-token', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { O.uiToken = j && j.token; }, function () { /* bỏ qua */ });
  };
  O.api = function (method, path, body, retried) {
    var opts = { method: method, headers: { 'x-requested-with': 'osin' }, credentials: 'same-origin' };
    if (O.uiToken) opts.headers['x-osin-ui'] = O.uiToken;
    if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch('api/' + path, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* không phải JSON */ }
        if (r.ok) return j;
        var err = new Error((j && j.error && j.error.message) || 'Có lỗi xảy ra, bạn thử lại nhé.');
        err.status = r.status; err.code = j && j.error && j.error.code; err.details = j && j.error && j.error.details;
        // token giao diện hết hạn (trang mở quá lâu): lấy lại một lần rồi thử lại
        if (err.code === 'ui_session' && !retried) return O.loadUiToken().then(function () { return O.api(method, path, body, true); });
        throw err;
      });
    }, function () {
      var err = new Error('Không kết nối được máy chủ. Bạn kiểm tra mạng rồi thử lại nhé.'); err.status = 0; err.code = 'network'; throw err;
    });
  };

  var toastTimer = null;
  O.toast = function (msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  };

  // Hộp thoại dạng tấm trượt. Trả về { close, el }. Đóng bằng nền, nút Đóng hoặc phím Esc.
  var openSheets = [];
  O.sheet = function (build, opts) {
    opts = opts || {};
    var root = document.getElementById('sheet-root');
    var prevFocus = document.activeElement;
    var bg = O.h('div', { class: 'sheet-bg' });
    var el = O.h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
    var api = { el: el, close: close };
    function close(silent) {
      if (!bg.parentNode) return;
      root.removeChild(bg);
      openSheets = openSheets.filter(function (s) { return s !== api; });
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* bỏ qua */ } }
      if (!silent && opts.onclose) opts.onclose();
    }
    bg.addEventListener('mousedown', function (e) { if (e.target === bg && !opts.modal) close(); });
    build(el, api);
    bg.appendChild(el); root.appendChild(bg);
    openSheets.push(api);
    el.setAttribute('aria-label', opts.label || 'Hộp thoại');
    el.focus();
    return api;
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openSheets.length) { var top = openSheets[openSheets.length - 1]; if (!top.modal) top.close(); }
  });
  O.closeSheets = function () { openSheets.slice().forEach(function (s) { s.close(true); }); };

  O.isLocalPath = function (p) { return typeof p === 'string' && p.charAt(0) === '/' && p.charAt(1) !== '/' && p.indexOf('\\') < 0 && p.length < 400; };
  // liên kết sâu tới app (origin khác): chỉ nhận https tuyệt đối do máy chủ whitelist, hoặc đường dẫn cục bộ
  O.safeLink = function (it) {
    if (it && typeof it.url === 'string') { try { var u = new URL(it.url); if (u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return it.url; } catch (e) { /* hỏng */ } return null; }
    return it && O.isLocalPath(it.path) ? it.path : null;
  };

  // Định dạng nhẹ: **đậm**, gạch đầu dòng "- ", đoạn văn. Dựng bằng DOM, không bao giờ dùng innerHTML.
  function inline(text) {
    var frag = document.createDocumentFragment();
    String(text).split(/(\*\*[^*\n]+\*\*)/g).forEach(function (part) {
      if (/^\*\*[^*\n]+\*\*$/.test(part)) frag.appendChild(O.h('strong', { text: part.slice(2, -2) }));
      else if (part) frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }
  O.richText = function (text) {
    var box = document.createDocumentFragment();
    var list = null; var para = null;
    String(text).split('\n').forEach(function (line) {
      var m = line.match(/^\s*[-•*]\s+(.*)$/);
      if (m) {
        para = null;
        if (!list) { list = O.h('ul'); box.appendChild(list); }
        var li = O.h('li'); li.appendChild(inline(m[1])); list.appendChild(li);
      } else if (!line.trim()) { list = null; para = null; }
      else {
        list = null;
        if (!para) { para = O.h('p'); box.appendChild(para); } else para.appendChild(document.createElement('br'));
        para.appendChild(inline(line));
      }
    });
    return box;
  };
  O.plain = function (text) { return String(text).replace(/\*\*/g, '').replace(/^\s*[-•*]\s+/gm, ''); };
  O.timeLeft = function (iso) {
    var s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
})();
