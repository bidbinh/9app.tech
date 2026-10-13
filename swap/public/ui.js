/* 9swap: tiện ích giao diện dùng chung. Chỉ dùng textContent / DOM API, không bao giờ chèn HTML thô. */
(function () {
  'use strict';
  var S9 = window.S9 = window.S9 || {};

  // ---------- DOM ----------
  S9.h = function (tag, attrs, kids) {
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
  var h = S9.h;
  S9.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  S9.$ = function (id) { return document.getElementById(id); };

  // ---------- biểu tượng ----------
  var PATHS = {
    back: ['M15 6l-6 6 6 6'], chev: ['M9 6l6 6-6 6'], plus: ['M12 5v14', 'M5 12h14'], check: ['M5 12l5 5L20 7'],
    close: ['M6 6l12 12', 'M18 6 6 18'], copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
    gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'], edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    warn: ['M12 3 2 21h20z', 'M12 10v5', 'M12 18h.01'], info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'],
    gift: ['M20 12v9H4v-9', 'M2 7h20v5H2z', 'M12 21V7', 'M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z'],
    bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
    megaphone: ['M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z', 'M17 8a5 5 0 0 1 0 8'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M21 21l-4.3-4.3'],
    pin: ['M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    swap: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
    tag: ['M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z', 'M7 7h.01'],
    msg: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
    image: ['M3 3h18v18H3z', 'M8.5 8.5h.01', 'M21 15l-5-5L5 21'],
    send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
    heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  };
  S9.ico = function (name, size, stroke) {
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

  // ---------- danh mục (nhận từ máy chủ qua /api/meta, có bản dự phòng) ----------
  S9.meta = {
    communityKinds: { cong_ty: 'Công ty', toa_nha: 'Tòa nhà, chung cư', khu_pho: 'Khu phố, xóm' },
    kinds: { tang: 'Tặng', doi: 'Trao đổi', ban: 'Bán' },
    categories: { gia_dung: 'Đồ gia dụng', tre_em: 'Trẻ em', sach: 'Sách, văn phòng phẩm', thoi_trang: 'Thời trang', dien_tu: 'Điện tử', noi_that: 'Nội thất', cay_canh: 'Cây cảnh', the_thao: 'Thể thao, sức khỏe', thuc_pham: 'Đồ ăn sắp hết hạn tặng', khac: 'Khác' },
    conditions: { moi: 'Mới', nhu_moi: 'Như mới', tot: 'Còn tốt', dung_duoc: 'Dùng được', can_sua: 'Cần sửa' },
    boardKinds: { that_lac: 'Thất lạc', nhat_duoc: 'Nhặt được', can_tim: 'Cần tìm' },
    limits: { photos: 4, listingDays: 30 },
  };
  S9.STATUS = { mo: 'Đang mở', giu: 'Đã có người giữ', xong: 'Đã xong', huy: 'Đã rút', go: 'Bị gỡ', het_han: 'Hết hạn' };
  S9.DONE_VERB = { tang: 'Đã tặng', doi: 'Đã trao đổi', ban: 'Đã bán' };
  S9.KIND_CLASS = { tang: 'ok', doi: 'info', ban: 'warn' };

  // ---------- định dạng ----------
  S9.vnd = function (n) { return (Math.round(Number(n)) || 0).toLocaleString('vi-VN') + ' đ'; };
  // "45.000", "45k", "1,5tr" -> số nguyên đồng; không hiểu được thì NaN
  S9.parseMoney = function (s) {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(/đ|d$|vnd|vnđ/g, '').replace(/\s+/g, '');
    if (!s) return NaN;
    var mult = 1;
    if (/(tr|triệu)$/.test(s)) { mult = 1000000; s = s.replace(/(tr|triệu)$/, ''); }
    else if (/(k|nghìn|ngàn)$/.test(s)) { mult = 1000; s = s.replace(/(k|nghìn|ngàn)$/, ''); }
    if (mult > 1) {
      if (!/^\d+([.,]\d{1,3})?$/.test(s)) return NaN;
      return Math.round(parseFloat(s.replace(',', '.')) * mult);
    }
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10);
    return NaN;
  };
  S9.ago = function (iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso).getTime();
    var m = Math.floor(ms / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    var hr = Math.floor(m / 60);
    if (hr < 24) return hr + ' giờ trước';
    var d = Math.floor(hr / 24);
    if (d < 8) return d + ' ngày trước';
    var dt = new Date(iso);
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2);
  };
  S9.timeOf = function (iso) {
    var d = new Date(iso);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  };
  S9.daysLeft = function (iso) { return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); };

  // điểm uy tín nhẹ: số lần cho tặng/trao đổi/bán thành công
  S9.repText = function (st) {
    var total = (st.tang || 0) + (st.doi || 0) + (st.ban || 0);
    if (!total) return 'Thành viên mới';
    var parts = [];
    if (st.tang) parts.push('tặng ' + st.tang);
    if (st.doi) parts.push('đổi ' + st.doi);
    if (st.ban) parts.push('bán ' + st.ban);
    return 'Đã ' + parts.join(', ') + ' lần';
  };
  S9.repBadge = function (st) {
    var total = (st.tang || 0) + (st.doi || 0) + (st.ban || 0);
    return total >= 10 ? 'Người cho đi tận tâm' : total >= 3 ? 'Người trao đổi quen' : total >= 1 ? 'Đã trao tay' : '';
  };
  S9.rep = function (st) {
    var total = (st.tang || 0) + (st.doi || 0) + (st.ban || 0);
    return h('span', { class: 'rep' + (total ? '' : ' none') }, [total ? S9.ico('heart', 14) : null, S9.repText(st)]);
  };

  // ---------- lưu tạm (chỉ giao diện, không bí mật) ----------
  S9.store = function (k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem('9swap.' + k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem('9swap.' + k); else localStorage.setItem('9swap.' + k, JSON.stringify(v));
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
  S9.rid = rid;
  var idemKeys = {};
  // Khóa idempotency giữ nguyên cho tới khi thao tác thành công: bấm lại sau khi mất mạng không làm hai lần
  S9.idem = function (name) { return idemKeys[name] || (idemKeys[name] = rid()); };
  S9.idemDone = function (name) { delete idemKeys[name]; };

  S9.api = function (method, path, body, opts) {
    opts = opts || {};
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    var headers = Object.assign({ 'X-Requested-With': '9swap' }, opts.headers || {});
    var payload;
    if (opts.binary) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    if (method !== 'GET' && opts.idem) headers['Idempotency-Key'] = S9.idem(opts.idem);
    return fetch(new URL(path, BASE).href, { method: method, headers: headers, body: payload, credentials: 'same-origin', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* không phải JSON */ }
          if (r.ok) { if (opts.idem) S9.idemDone(opts.idem); return j; }
          var e = (j && j.error) || {};
          var err = new Error(e.message || 'Có lỗi xảy ra, thử lại nhé');
          err.status = r.status; err.code = e.code; err.details = e.details;
          if (r.status < 500 && opts.idem) S9.idemDone(opts.idem);
          throw err;
        });
      }, function () {
        if (timer) clearTimeout(timer);
        var err = new Error('Không kết nối được mạng. Dữ liệu bạn nhập vẫn còn, bấm lại khi có mạng.');
        err.offline = true;
        throw err;
      });
  };
  S9.get = function (p) { return S9.api('GET', p); };
  S9.post = function (p, b, o) { return S9.api('POST', p, b === undefined ? {} : b, o); };
  S9.del = function (p) { return S9.api('DELETE', p); };

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  S9.isId = function (s) { return UUID.test(String(s)); };
  S9.photoUrl = function (id, thumb) { return S9.isId(id) ? new URL('api/photos/' + id + (thumb ? '/t' : ''), BASE).href : ''; };

  // ---------- toast ----------
  var toastTimer = null;
  S9.toast = function (msg, kind) {
    var t = S9.$('toast');
    S9.clear(t);
    t.className = 'toast ' + (kind || '');
    t.appendChild(document.createTextNode(msg));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, kind === 'err' ? 6000 : 3000);
  };
  S9.fail = function (e) {
    if (e && e.code === 'banned') { S9.go('#/'); }
    S9.toast((e && e.message) || 'Có lỗi xảy ra, thử lại nhé', 'err');
  };

  // Bấm nút: khóa nút trong lúc chạy (chống bấm đúp), lỗi thì báo rõ và mở lại nút
  S9.busy = function (btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add('loading');
    var done = function () { btn.disabled = false; btn.classList.remove('loading'); };
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) { done(); return r; }, function (e) { done(); S9.fail(e); });
  };

  // ---------- sao chép, chia sẻ ----------
  S9.copy = function (text, msg) {
    function ok() { S9.toast(msg || 'Đã sao chép'); }
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', class: 'offscreen', readonly: true });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { S9.toast('Máy không cho sao chép, hãy nhấn giữ để chép tay', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  };
  S9.inviteUrl = function (code) { return location.origin + new URL('./', BASE).pathname + 'c/' + code; };

  // ---------- điều hướng ----------
  S9.backPending = false;
  S9.go = function (hash) {
    if (S9.backPending) { setTimeout(function () { S9.go(hash); }, 25); return; }
    if (location.hash === hash) S9.route(); else location.hash = hash;
  };
  S9.href = function (hash) { return location.pathname + location.search + hash; };
  S9.link = function (hash, attrs, kids) {
    var a = h('a', Object.assign({ href: S9.href(hash) }, attrs || {}), kids);
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); S9.go(hash);
    });
    return a;
  };

  // ---------- bottom sheet (đóng được bằng nút Back của điện thoại) ----------
  var sheetStack = [];
  S9.sheetOpen = function () { return sheetStack.length > 0; };
  S9.sheet = function (title, build) {
    var back = h('div', { class: 'sheet-back' });
    var body = h('div', { class: 'sheet-body' });
    var closed = false;
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { class: 'sheet-head' }, [
        h('div', { class: 'sheet-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đóng', onclick: function () { close(); } }, [S9.ico('close', 22)]),
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
      if (!fromPop && history.state && history.state.sheet) { S9.backPending = true; setTimeout(function () { S9.backPending = false; }, 600); history.back(); }
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* bỏ qua */ } }
      if (S9.afterSheet) S9.afterSheet();
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
    S9.backPending = false;
    if (sheetStack.length) sheetStack[sheetStack.length - 1].close(true);
  });
  S9.closeSheets = function () { while (sheetStack.length) sheetStack[sheetStack.length - 1].close(true); };

  S9.confirm = function (o) {
    return new Promise(function (resolve) {
      var answered = false;
      var s = S9.sheet(o.title || 'Xác nhận', function (body, close) {
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
  S9.chip = function (text, kind) { return h('span', { class: 'chip ' + (kind || ''), text: text }); };
  S9.empty = function (title, text, action) {
    return h('div', { class: 'empty' }, [h('div', { class: 'empty-t', text: title }), text ? h('div', { class: 'muted', text: text }) : null, action || null]);
  };
  S9.notice = function (kind, title, text, action) {
    return h('div', { class: 'notice ' + kind, role: kind === 'bad' ? 'alert' : null }, [
      h('div', { class: 'notice-ico' }, [S9.ico(kind === 'bad' || kind === 'warn' ? 'warn' : 'info', 22)]),
      h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: title }), text ? h('div', { text: text }) : null, action || null]),
    ]);
  };
  S9.btn = function (text, cls, onclick, extra) {
    return h('button', Object.assign({ class: 'btn ' + (cls || ''), type: 'button', onclick: onclick }, extra || {}), [text]);
  };
  S9.field = function (label, input, hint) {
    var id = 'f' + rid().slice(0, 6);
    input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null]);
  };
  S9.text = function (o) {
    return h('input', Object.assign({ type: 'text', autocomplete: 'off', autocapitalize: 'sentences', maxlength: 60, enterkeyhint: 'done' }, o || {}));
  };
  S9.select = function (map, value, allLabel) {
    var sel = h('select', {}, (allLabel ? [h('option', { value: '', text: allLabel })] : []).concat(Object.keys(map).map(function (k) { return h('option', { value: k, text: map[k] }); })));
    sel.value = value || '';
    return sel;
  };
  S9.thumb = function (photoId, cls) {
    var t = h('div', { class: 'thumb ' + (cls || '') });
    if (photoId && S9.isId(photoId)) t.appendChild(h('img', { src: S9.photoUrl(photoId, true), alt: '', loading: 'lazy', decoding: 'async' }));
    else t.appendChild(S9.ico('gift', cls === 'sm' ? 22 : 34, 1.6));
    return t;
  };

  // ---------- cập nhật định kỳ, không làm mất thứ đang gõ ----------
  var liveTimer = null; var liveState = null;
  var composing = false;
  document.addEventListener('compositionstart', function () { composing = true; }, true); // gõ Telex: không vẽ lại giữa chừng
  document.addEventListener('compositionend', function () { composing = false; }, true);
  function typingNow() {
    if (S9.sheetOpen() || composing) return true;
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && S9.$('view').contains(a));
  }
  var leaveFns = [];
  S9.onLeave = function (fn) { leaveFns.push(fn); };
  S9.runLeave = function () { var f = leaveFns; leaveFns = []; f.forEach(function (x) { try { x(); } catch (e) { /* bỏ qua */ } }); };
  S9.liveStop = function () { clearInterval(liveTimer); liveTimer = null; liveState = null; };
  // opts: { fetch: () => Promise<data>, render: (data) => void, every: ms }
  S9.live = function (opts) {
    S9.liveStop();
    var st = liveState = { opts: opts, last: null, pending: null };
    function apply(data) { st.last = JSON.stringify(data); st.pending = null; opts.render(data); }
    st.apply = apply;
    st.load = function () {
      return opts.fetch().then(function (data) {
        if (liveState !== st) return;
        if (JSON.stringify(data) === st.last) return;
        if (typingNow()) { st.pending = data; return; }
        apply(data);
      });
    };
    st.flush = function () { if (liveState === st && st.pending && !typingNow()) apply(st.pending); };
    liveTimer = setInterval(function () {
      if (document.hidden || liveState !== st) return;
      st.load().then(function () { st.flush(); }).catch(function () { /* mạng chập chờn: lần sau thử lại */ });
    }, opts.every || 12000);
    return st.load();
  };
  // gọi sau khi một thao tác đã xong: vẽ lại ngay bằng dữ liệu mới nhất
  S9.refresh = function () {
    if (!liveState) return Promise.resolve();
    var st = liveState;
    return st.opts.fetch().then(function (d) { if (liveState === st) st.apply(d); });
  };
  S9.afterSheet = function () { if (liveState) setTimeout(function () { liveState && liveState.flush(); }, 50); };
  document.addEventListener('focusout', function () { setTimeout(function () { if (liveState) liveState.flush(); }, 150); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && liveState) liveState.load().catch(function () {}); });
  window.addEventListener('online', function () { if (liveState) liveState.load().catch(function () {}); });

  // bàn phím ảo: ô đang nhập luôn nằm trong tầm nhìn, thanh dưới ẩn đi
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

  // ---------- khung: thanh trên, thanh tab, nút chính dưới ----------
  S9.frame = function (o) {
    var bar = S9.$('bar'), barIn = S9.$('bar-in');
    S9.clear(barIn);
    bar.className = 'bar';
    if (o.back) {
      barIn.appendChild(S9.link(o.back, { class: 'icon-btn', 'aria-label': 'Quay lại' }, [S9.ico('back', 24)]));
    } else {
      barIn.appendChild(h('a', { href: '/', class: 'home9app', 'aria-label': 'Về trang 9app' }, [S9.ico('back', 18), '9app']));
    }
    barIn.appendChild(h('div', { class: 'ttl', text: o.title || '9swap' }));
    (o.right || []).forEach(function (n) { barIn.appendChild(n); });
    S9.setCta(null);
    S9.setTabs(o.tabs || null);
  };
  S9.setCta = function (node) {
    var cta = S9.$('cta');
    S9.clear(cta);
    if (!node) { cta.className = 'cta hidden'; document.body.classList.remove('has-cta'); return; }
    cta.className = 'cta'; document.body.classList.add('has-cta');
    cta.appendChild(node);
  };
  // tabs: { cid, active, unread }
  var lastTabs = null;
  S9.setTabs = function (t) {
    var nav = S9.$('tabs');
    S9.clear(nav);
    lastTabs = t;
    if (!t) { nav.className = 'tabs hidden'; document.body.classList.remove('has-tabs'); return; }
    nav.className = 'tabs'; document.body.classList.add('has-tabs');
    var items = [
      ['feed', 'Đồ đạc', 'gift', '#/c/' + t.cid], ['board', 'Bảng tin', 'megaphone', '#/c/' + t.cid + '/board'], ['new', 'Đăng', 'plus', '#/c/' + t.cid + '/new'],
      ['mine', 'Của tôi', 'user', '#/c/' + t.cid + '/mine'], ['notifs', 'Thông báo', 'bell', '#/c/' + t.cid + '/notifs'],
    ];
    var inner = h('div', { class: 'tabs-in' });
    items.forEach(function (it) {
      var add = it[0] === 'new';
      var a = S9.link(it[3], { class: 'tab' + (t.active === it[0] ? ' on' : '') + (add ? ' add' : ''), 'aria-label': it[1], 'aria-current': t.active === it[0] ? 'page' : null }, [
        add ? h('span', { class: 'plus' }, [S9.ico('plus', 24, 2.6)]) : S9.ico(it[2], 24),
        h('span', { text: it[1] }),
      ]);
      if (it[0] === 'notifs' && t.unread > 0) a.appendChild(h('span', { class: 'dot-badge', id: 'notif-badge', text: t.unread > 9 ? '9+' : String(t.unread) }));
      inner.appendChild(a);
    });
    nav.appendChild(inner);
  };
  S9.setUnread = function (n) {
    if (!lastTabs) return;
    lastTabs.unread = n;
    var b = S9.$('notif-badge');
    if (!n) { if (b && b.parentNode) b.parentNode.removeChild(b); return; }
    if (!b) { S9.setTabs(lastTabs); return; }
    b.textContent = n > 9 ? '9+' : String(n);
  };

  // thăm dò thông báo của cộng đồng đang mở (15 giây một lần, tạm dừng khi ẩn tab)
  var pollTimer = null; var pollCid = null; var pollLast = null;
  S9.pollStop = function () { clearInterval(pollTimer); pollTimer = null; pollCid = null; };
  S9.pollStart = function (cid) {
    if (pollCid === cid && pollTimer) return;
    S9.pollStop(); pollCid = cid; pollLast = null;
    function tick() {
      if (document.hidden || pollCid !== cid) return;
      S9.get('api/c/' + cid + '/poll').then(function (d) {
        if (pollCid !== cid) return;
        if (pollLast !== null && d.unread > pollLast) {
          var newest = d.items.filter(function (n) { return !n.read; })[0];
          if (newest) S9.toast(newest.text);
        }
        pollLast = d.unread;
        S9.setUnread(d.unread);
      }).catch(function () { /* bỏ qua */ });
    }
    tick();
    pollTimer = setInterval(tick, 15000);
  };

  S9.mount = function (nodes) {
    var v = S9.$('view');
    var y = window.scrollY;
    S9.clear(v);
    v.appendChild(h('div', { class: 'page' }, nodes));
    // Enter trên bàn phím điện thoại phải gửi được form nhiều ô: nút chính của mỗi form là type=submit
    v.querySelectorAll('form').forEach(function (f) {
      var btns = f.querySelectorAll('.btn');
      var main = f.querySelector('.btn.primary') || btns[btns.length - 1];
      if (main) main.setAttribute('type', 'submit');
    });
    return y;
  };
  S9.skeleton = function () {
    S9.clear(S9.$('view'));
    S9.$('view').appendChild(h('div', { class: 'page' }, [h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel short' })]));
  };
  S9.loadError = function (e, retry, backHash) {
    S9.setCta(null);
    S9.liveStop();
    var offline = e && e.offline;
    S9.mount([S9.empty(offline ? 'Chưa có mạng' : (e && (e.status === 404 || e.status === 403) ? 'Không tìm thấy' : 'Chưa tải được'), (e && e.message) || 'Thử lại nhé', h('div', { class: 'btn-row center' }, [
      e && (e.status === 404 || e.status === 403) ? S9.link(backHash || '#/', { class: 'btn primary' }, ['Về trang chủ']) : S9.btn('Thử lại', 'primary', retry),
    ]))]);
  };

  // ---------- ảnh: nén ngay trên trình duyệt trước khi gửi ----------
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh này. Hãy chọn ảnh JPEG hoặc PNG.')); };
      img.src = url;
    });
  }
  function jpeg(src, maxSide, quality, maxBytes) {
    var w = src.width, hgt = src.height;
    var scale = Math.min(1, maxSide / Math.max(w, hgt));
    function attempt(sc, q) {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(hgt * sc));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return new Promise(function (resolve, reject) {
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Trình duyệt không nén được ảnh')); }, 'image/jpeg', q);
      }).then(function (b) {
        if (b.size <= maxBytes || (q <= 0.45 && sc <= 0.3)) return b;
        return q > 0.45 ? attempt(sc, q - 0.1) : attempt(sc * 0.8, q);
      });
    }
    return attempt(scale, quality);
  }
  // trả về { main, thumb } (Blob JPEG): ảnh chính cạnh dài ≤ 1280px, ảnh nhỏ ≤ 360px
  S9.compress = function (file) {
    if (!/^image\//.test(file.type || '') && file.type) return Promise.reject(new Error('Đây không phải tệp ảnh'));
    return loadBitmap(file).then(function (src) {
      return jpeg(src, 1280, 0.82, 340 * 1024).then(function (main) {
        return jpeg(src, 360, 0.72, 50 * 1024).then(function (thumb) {
          if (src.close) src.close();
          return { main: main, thumb: thumb };
        });
      });
    });
  };
  S9.uploadPhoto = function (listingId, pair) {
    return S9.api('POST', 'api/listings/' + listingId + '/photos', new Blob([pair.thumb, pair.main]), {
      binary: true, timeout: 60000, headers: { 'X-Thumb-Length': String(pair.thumb.size), 'Content-Type': 'application/octet-stream' },
    });
  };
})();
