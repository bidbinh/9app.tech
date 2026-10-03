/* 9Ship — khung ứng dụng, trạng thái, đăng nhập và điều hướng (ES5). Cần ui.js, addr.js. */
(function () {
  'use strict';
  var S9 = window.S9;
  var h = S9.h;
  var $ = function (id) { return document.getElementById(id); };
  var view = $('view'), bar = $('bar'), barIn = $('bar-in'), tabs = $('tabs'), cta = $('cta');

  var S = S9.S = { user: null, wallet: null, draft: S9.store('draft') || {}, sender: null, receiver: null, quote: null, offer: null, req: null, idem: null, notice: '' };
  S9.routes = {};
  var timers = [];

  S9.every = function (fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; };
  S9.later = function (fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; };
  S9.clearTimers = function () { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; };
  S9.go = function (hash) { if (location.hash === hash) S9.route(); else location.hash = hash; };
  S9.saveDraft = function () { S9.store('draft', S.draft); };
  S9.saveFlow = function () { S9.store('flow', { quote: S.quote, offer: S.offer, req: S.req, idem: S.idem }); };
  S9.loadFlow = function () {
    var f = S9.store('flow');
    if (!f) return;
    if (f.quote && f.quote.expiresAt && new Date(f.quote.expiresAt) < new Date()) { S9.store('flow', null); return; }
    S.quote = f.quote || null; S.offer = f.offer || null; S.req = f.req || null; S.idem = f.idem || null;
  };
  S9.fail = function (e) {
    if (e && e.status === 401) { S.user = null; S.addrs = null; S9.go('#/'); return; }
    S9.toast((e && e.message) || 'Có lỗi xảy ra');
  };

  // ---------- khung: thanh trên, tab dưới ----------
  var TABS = [['', 'Gửi hàng', 'send'], ['orders', 'Đơn hàng', 'list'], ['book', 'Sổ địa chỉ', 'book'], ['me', 'Tài khoản', 'user']];
  S9.frame = function (o) {
    S9.setCta(null);
    S9.clear(barIn);
    if (o.mode === 'auth') {
      bar.className = 'bar hidden'; tabs.className = 'tabs hidden'; view.className = '';
      return;
    }
    view.className = 'app';
    bar.className = 'bar';
    if (o.mode === 'flow') {
      tabs.className = 'tabs hidden';
      barIn.appendChild(h('div', { class: 'row', style: 'min-width:0;flex:1' }, [
        h('button', { class: 'back', type: 'button', 'aria-label': 'Quay lại', onclick: function () { if (o.back) S9.go(o.back); else history.back(); } }, [S9.ico('back', 24)]),
        h('div', { class: 'ttl', text: o.title || '' })
      ]));
      if (o.right) barIn.appendChild(o.right);
      return;
    }
    // main
    tabs.className = 'tabs';
    barIn.appendChild(h('a', { href: '#/', class: 'brand', 'aria-label': '9Ship' }, [h('span', { class: 'mark' }, [S9.ico('box', 18, 2.2)]), '9Ship']));
    barIn.appendChild(h('a', { href: '#/me', class: 'pill', id: 'wallet-pill', 'aria-label': 'Ví' }, [S9.ico('wallet', 16), h('span', { id: 'wallet-amt', text: S.wallet ? S9.vnd(S.wallet.balance) : '…' })]));
    S9.clear(tabs);
    TABS.forEach(function (t) {
      tabs.appendChild(h('a', { href: '#/' + t[0], class: o.tab === t[0] ? 'on' : '' }, [S9.ico(t[2], 22), t[1]]));
    });
  };
  S9.mount = function (nodes) {
    S9.clearTimers();
    S9.clear(view);
    var page = h('div', { class: 'page' });
    nodes.forEach(function (n) { if (n) page.appendChild(n); });
    view.appendChild(page);
    window.scrollTo(0, 0);
    return page;
  };
  S9.setCta = function (node) {
    S9.clear(cta);
    if (!node) { cta.className = 'hidden'; return; }
    cta.className = 'cta' + (tabs.className.indexOf('hidden') < 0 ? ' above' : '');
    cta.appendChild(h('div', { class: 'cta-in' }, [node]));
  };
  S9.skeleton = function () { S9.mount([h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })]); };
  S9.refreshWallet = function () {
    return S9.api('GET', 'wallet').then(function (w) {
      S.wallet = w;
      var el = $('wallet-amt');
      if (el) el.textContent = S9.vnd(w.balance);
      return w;
    }, function () { return null; });
  };

  // ---------- đăng nhập ----------
  function normPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.indexOf('84') === 0 && d.length >= 11) d = '0' + d.slice(2);
    else if (d.length === 9) d = '0' + d;
    return d;
  }
  S9.routes.auth = function () {
    S9.frame({ mode: 'auth' });
    var step = 1, phone = S9.keep('phone') || '', manual = false, devCode = null, err = '', busy = false, left = 0;

    function perk(t) { return h('li', {}, [S9.ico('check', 18, 2.5), t]); }
    function draw() {
      var nodes;
      if (step === 1) {
        var inp = h('input', { type: 'tel', inputmode: 'tel', id: 'lg-phone', autocomplete: 'tel-national', placeholder: '912 345 678', value: phone.replace(/^0/, ''), 'aria-label': 'Số điện thoại' });
        inp.addEventListener('input', function () { err = ''; var e = document.getElementById('lg-err'); if (e) e.textContent = ''; });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
        nodes = [
          h('div', { class: 'logo' }, [h('span', { class: 'mark' }, [S9.ico('box', 24, 2.2)]), h('b', { text: '9Ship' })]),
          h('h1', {}, ['Gửi hàng toàn quốc,', h('br'), h('em', { text: 'so giá trong một chạm' })]),
          h('p', { class: 'lead', text: 'Đăng nhập bằng số điện thoại để bắt đầu gửi hàng, lưu sẵn người nhận và theo dõi đơn.' }),
          h('label', { class: 'f', text: 'Số điện thoại', for: 'lg-phone' }),
          h('div', { class: 'phone-in' }, [h('span', { class: 'cc', text: '+84' }), inp]),
          h('div', { class: 'hint-err', id: 'lg-err', text: err }),
          h('button', { class: 'btn', id: 'lg-go', type: 'button', text: 'Tiếp tục', onclick: send }),
          h('ul', { class: 'perks' }, [perk('So sánh giá nhiều hãng vận chuyển trong một lần nhập'), perk('Gợi ý quầy gửi hàng gần bạn'), perk('Lưu sẵn người nhận, lần sau chỉ cần một chạm'), perk('In nhãn, theo dõi hành trình, hoàn tiền khi hủy đơn')]),
          h('div', { class: 'fine', text: 'Chúng tôi chỉ dùng số điện thoại để đăng nhập và liên hệ về đơn hàng.' })
        ];
      } else {
        var code = h('input', { type: 'text', id: 'lg-code', class: 'otp-in', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: '••••••', 'aria-label': 'Mã xác thực 6 số' });
        code.addEventListener('input', function () {
          this.value = this.value.replace(/\D/g, '').slice(0, 6);
          err = ''; var e = document.getElementById('lg-err'); if (e) e.textContent = '';
          if (this.value.length === 6) verify(this.value);
        });
        nodes = [
          h('div', { class: 'logo' }, [h('span', { class: 'mark' }, [S9.ico('box', 24, 2.2)]), h('b', { text: '9Ship' })]),
          h('h1', { text: 'Nhập mã xác thực' }),
          h('p', { class: 'lead' }, [manual ? 'Nhập mã đăng nhập do quản trị 9Ship gửi cho số ' : 'Mã gồm 6 số đã được gửi tới ', h('b', { text: phone })]),
          manual ? h('div', { class: 'alert info' }, ['Hiện chưa có tin nhắn SMS tự động. Hãy liên hệ quản trị 9Ship (Zalo) để nhận mã đăng nhập cho số điện thoại này. Mã dùng một lần, có hiệu lực 15 phút.']) : null,
          devCode ? h('div', { class: 'alert info', text: 'Chế độ thử nghiệm — mã của bạn: ' + devCode }) : null,
          code,
          h('div', { class: 'hint-err', id: 'lg-err', style: 'text-align:center', text: err }),
          h('button', { class: 'btn', id: 'lg-go', type: 'button', text: 'Đăng nhập', onclick: function () { verify(document.getElementById('lg-code').value); } }),
          h('div', { class: 'row sb mt2' }, [
            h('button', { class: 'link', type: 'button', text: '‹ Đổi số điện thoại', onclick: function () { step = 1; err = ''; draw(); } }),
            manual ? null : h('button', { class: 'link', type: 'button', id: 'lg-resend', disabled: left > 0 ? true : null, text: left > 0 ? 'Gửi lại sau ' + left + 's' : 'Gửi lại mã', onclick: function () { if (left <= 0) send(true); } })
          ])
        ];
      }
      var wrap = h('div', { class: 'auth' }, [h('div', { class: 'auth-in' }, nodes)]);
      S9.clear(view); view.appendChild(wrap);
      setTimeout(function () { var el = document.getElementById(step === 1 ? 'lg-phone' : 'lg-code'); if (el) { try { el.focus(); } catch (e) { /* bỏ qua */ } } }, 60);
    }
    function fail(msg) { err = msg; busy = false; var e = document.getElementById('lg-err'); if (e) e.textContent = msg; var b = document.getElementById('lg-go'); if (b) { b.disabled = false; b.textContent = step === 1 ? 'Tiếp tục' : 'Đăng nhập'; } }
    function send(resend) {
      if (busy) return;
      phone = normPhone(resend === true ? phone : document.getElementById('lg-phone').value);
      if (!/^0[35789]\d{8}$/.test(phone)) return fail('Số điện thoại chưa đúng. Nhập 10 số, ví dụ 0912 345 678.');
      busy = true;
      var b = document.getElementById('lg-go'); if (b) { b.disabled = true; b.textContent = 'Đang gửi mã…'; }
      S9.api('POST', 'auth/otp', { phone: phone }).then(function (r) {
        busy = false; S9.keep('phone', phone);
        manual = !!r.manual; devCode = r.devCode || null; step = 2; err = '';
        left = manual ? 0 : 30; draw();
        if (left > 0) { var iv = setInterval(function () { left--; var el = document.getElementById('lg-resend'); if (!el) { clearInterval(iv); return; } if (left <= 0) { clearInterval(iv); el.disabled = false; el.textContent = 'Gửi lại mã'; } else el.textContent = 'Gửi lại sau ' + left + 's'; }, 1000); }
      }, function (e) { fail(e.code === 'otp_unavailable' ? 'Chưa gửi được mã. Vui lòng thử lại sau hoặc liên hệ quản trị.' : e.message); });
    }
    function verify(code) {
      if (busy) return;
      code = String(code || '').replace(/\D/g, '');
      if (code.length !== 6) return fail('Nhập đủ 6 số của mã xác thực.');
      busy = true;
      var b = document.getElementById('lg-go'); if (b) { b.disabled = true; b.textContent = 'Đang đăng nhập…'; }
      S9.api('POST', 'auth/verify', { phone: phone, code: code }).then(function (r) {
        busy = false; S.user = r.user;
        S9.afterLogin().then(function () { S9.route(); });
      }, function (e) {
        busy = false; var el = document.getElementById('lg-code'); if (el) { el.value = ''; try { el.focus(); } catch (x) { /* bỏ qua */ } }
        fail(e.code === 'otp_invalid' ? 'Mã không đúng hoặc đã hết hạn.' : e.message);
      });
    }
    draw();
  };

  S9.afterLogin = function () {
    return Promise.all([S9.loadAddresses(true).catch(function () { return []; }), S9.refreshWallet()]).then(function () {
      var d = S.draft;
      if (!d.senderId) { var def = (S9.addrs || []).filter(function (a) { return a.isDefaultSender; })[0]; if (def) { d.senderId = def.id; S9.saveDraft(); } }
    });
  };

  S9.logout = function () {
    S9.api('POST', 'auth/logout', {}).then(function () {
      S.user = null; S.wallet = null; S9.addrs = null; S.sender = null; S.receiver = null; S.quote = null; S.offer = null; S.draft = {};
      S9.store('draft', null); S9.store('flow', null);
      S9.go('#/'); S9.route();
    }, S9.fail);
  };

  // ---------- điều hướng ----------
  S9.route = function () {
    S9.clearTimers();
    S9.closeAllSheets();
    if (!S.user) return S9.routes.auth();
    var parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    var name = parts[0] || 'home';
    var fn = S9.routes[name] || S9.routes.home;
    fn(parts);
  };

  S9.boot = function () {
    window.addEventListener('hashchange', S9.route);
    S9.loadFlow();
    Promise.all([
      S9.api('GET', 'meta').then(function (m) { S9.meta = m; }),
      S9.api('GET', 'me').then(function (r) { S.user = r.user; }, function () { S.user = null; })
    ]).then(function () {
      return S.user ? S9.afterLogin() : null;
    }).then(function () { S9.route(); }, function (e) {
      S9.clear(view); view.appendChild(h('div', { class: 'page' }, [h('div', { class: 'card empty', text: (e && e.message) || 'Không tải được ứng dụng' })]));
    });
  };
})();
