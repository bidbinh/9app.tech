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
    barIn.appendChild(h('a', { href: '/', class: 'home9app', 'aria-label': 'Về 9app' }, [S9.ico('back', 20), '9app']));
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
  // ---------- đăng nhập / đăng ký ----------
  // Số điện thoại → (đã có mật khẩu) nhập mật khẩu | (số mới) tạo tài khoản bằng OTP một lần, hoặc dùng tài khoản 9Sport/9app.
  S9.routes.auth = function () {
    S9.frame({ mode: 'auth' });
    var st = { step: 'phone', phone: S9.keep('phone') || '', manual: false, devCode: null, sso: false, err: '', busy: false, left: 0, link: false, legacy: false };
    var countdown = null;

    function perk(t) { return h('li', {}, [S9.ico('check', 18, 2.5), t]); }
    function logo() { return h('div', { class: 'logo' }, [h('span', { class: 'mark' }, [S9.ico('box', 24, 2.2)]), h('b', { text: '9Ship' })]); }
    function errBox(center) { return h('div', { class: 'hint-err', id: 'lg-err', style: center ? 'text-align:center' : '', text: st.err }); }
    function setErr(msg) { st.err = msg || ''; st.busy = false; var e = document.getElementById('lg-err'); if (e) e.textContent = st.err; var b = document.getElementById('lg-go'); if (b) { b.disabled = false; b.textContent = b.getAttribute('data-label'); } }
    function clearErr() { st.err = ''; var e = document.getElementById('lg-err'); if (e) e.textContent = ''; }
    function goBtn(label, fn) { return h('button', { class: 'btn', id: 'lg-go', type: 'button', 'data-label': label, text: label, onclick: fn }); }
    function busy(label) { st.busy = true; var b = document.getElementById('lg-go'); if (b) { b.disabled = true; b.textContent = label; } }
    function passField(id, placeholder, autocomplete) {
      var inp = h('input', { type: 'password', id: id, autocomplete: autocomplete, placeholder: placeholder || 'Mật khẩu', 'aria-label': placeholder || 'Mật khẩu' });
      var show = h('button', { type: 'button', class: 'link', style: 'position:absolute;right:14px;top:14px', text: 'Hiện', onclick: function () { var t = inp.type === 'password'; inp.type = t ? 'text' : 'password'; this.textContent = t ? 'Ẩn' : 'Hiện'; } });
      inp.addEventListener('input', clearErr);
      return h('div', { style: 'position:relative' }, [inp, show]);
    }
    function codeField() {
      var code = h('input', { type: 'text', id: 'lg-code', class: 'otp-in', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: '••••••', 'aria-label': 'Mã xác thực 6 số' });
      code.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); clearErr(); });
      return code;
    }

    function draw() {
      var nodes;
      if (st.step === 'phone') {
        var inp = h('input', { type: 'tel', inputmode: 'tel', id: 'lg-phone', autocomplete: 'tel-national', placeholder: '912 345 678', value: st.phone.replace(/^0/, ''), 'aria-label': 'Số điện thoại' });
        inp.addEventListener('input', clearErr);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkPhone(); });
        nodes = [
          logo(),
          h('h1', {}, ['Gửi hàng toàn quốc,', h('br'), h('em', { text: 'so giá trong một chạm' })]),
          h('p', { class: 'lead', text: 'Dùng chung tài khoản với các app 9app.tech. Nhập số điện thoại để đăng nhập hoặc tạo tài khoản.' }),
          h('label', { class: 'f', text: 'Số điện thoại', for: 'lg-phone' }),
          h('div', { class: 'phone-in' }, [h('span', { class: 'cc', text: '+84' }), inp]),
          errBox(),
          goBtn('Tiếp tục', checkPhone),
          h('ul', { class: 'perks' }, [perk('So sánh giá nhiều hãng vận chuyển trong một lần nhập'), perk('Gợi ý quầy gửi hàng gần bạn'), perk('Lưu sẵn người nhận, lần sau chỉ cần một chạm'), perk('In nhãn, theo dõi hành trình, hoàn tiền khi hủy đơn')])
        ];
      } else if (st.step === 'login') {
        nodes = [
          logo(),
          h('h1', { text: st.link ? 'Dùng tài khoản 9app' : 'Chào mừng quay lại' }),
          h('p', { class: 'lead' }, [st.link ? 'Nhập mật khẩu tài khoản 9Sport/9app của số ' : 'Nhập mật khẩu cho số ', h('b', { text: st.phone })]),
          passField('lg-pass', 'Mật khẩu', 'current-password'),
          errBox(),
          goBtn('Đăng nhập', login),
          h('div', { class: 'row sb mt2' }, [
            h('button', { class: 'link', type: 'button', text: '‹ Đổi số điện thoại', onclick: function () { st.step = 'phone'; st.err = ''; draw(); } }),
            h('button', { class: 'link', type: 'button', text: 'Quên mật khẩu?', onclick: function () { startOtp('reset'); } })
          ])
        ];
      } else if (st.step === 'choose') {
        nodes = [
          logo(),
          h('h1', { text: 'Số này chưa có tài khoản 9Ship' }),
          h('p', { class: 'lead' }, ['Số ', h('b', { text: st.phone }), st.sso ? '. Bạn đã dùng 9Sport hay app khác của 9app.tech chưa?' : '. Tạo tài khoản mới chỉ mất một phút.']),
          h('button', { class: 'btn', type: 'button', text: 'Tạo tài khoản mới', onclick: function () { startOtp('register'); } }),
          st.sso ? h('button', { class: 'btn ghost', type: 'button', text: 'Tôi đã có tài khoản 9Sport / 9app', onclick: function () { st.link = true; st.step = 'login'; st.err = ''; draw(); } }) : null,
          h('div', { class: 'row mt2' }, [h('button', { class: 'link', type: 'button', text: '‹ Đổi số điện thoại', onclick: function () { st.step = 'phone'; st.err = ''; draw(); } })])
        ];
      } else {
        // register | reset: nhập OTP (chỉ lần này) + thông tin + mật khẩu
        var isReset = st.step === 'reset';
        nodes = [
          logo(),
          h('h1', { text: isReset ? 'Đặt lại mật khẩu' : (st.legacy ? 'Đặt mật khẩu' : 'Tạo tài khoản') }),
          h('p', { class: 'lead' }, [st.manual ? 'Nhập mã xác thực do quản trị 9Ship gửi cho số ' : 'Mã gồm 6 số đã được gửi tới ', h('b', { text: st.phone }), '. Chỉ cần xác thực một lần này.']),
          st.manual ? h('div', { class: 'alert info', text: 'Hiện chưa gửi tin nhắn tự động được. Hãy liên hệ quản trị 9Ship (Zalo) để nhận mã cho số điện thoại này. Mã dùng một lần, có hiệu lực 15 phút.' }) : null,
          st.devCode ? h('div', { class: 'alert info', text: 'Chế độ thử nghiệm — mã của bạn: ' + st.devCode }) : null,
          h('label', { class: 'f', text: 'Mã xác thực (OTP)' }),
          codeField(),
          isReset ? null : h('div', {}, [h('label', { class: 'f', text: 'Họ và tên' }), h('input', { type: 'text', id: 'lg-name', autocomplete: 'name', placeholder: 'Nguyễn Văn A', maxlength: '80' })]),
          h('label', { class: 'f', text: isReset ? 'Mật khẩu mới (ít nhất 6 ký tự)' : 'Mật khẩu (ít nhất 6 ký tự)' }),
          passField('lg-pass', 'Mật khẩu', 'new-password'),
          errBox(),
          goBtn(isReset ? 'Đặt lại mật khẩu' : 'Tạo tài khoản', finishOtp),
          h('div', { class: 'row sb mt2' }, [
            h('button', { class: 'link', type: 'button', text: '‹ Quay lại', onclick: function () { st.step = isReset ? 'login' : 'choose'; st.err = ''; draw(); } }),
            st.manual ? null : h('button', { class: 'link', type: 'button', id: 'lg-resend', disabled: st.left > 0 ? true : null, text: st.left > 0 ? 'Gửi lại sau ' + st.left + 's' : 'Gửi lại mã', onclick: function () { if (st.left <= 0) startOtp(st.step, true); } })
          ])
        ];
      }
      S9.clear(view);
      view.appendChild(h('div', { class: 'auth' }, [h('div', { class: 'auth-in' }, nodes.concat([h('a', { class: 'link back9app', href: '/', text: '‹ Về 9app' })]))]));
      setTimeout(function () { var el = document.getElementById({ phone: 'lg-phone', login: 'lg-pass', register: 'lg-code', reset: 'lg-code' }[st.step]); if (el) { try { el.focus(); } catch (e) { /* bỏ qua */ } } }, 60);
    }

    function inPhone() { return normPhone(document.getElementById('lg-phone').value); }
    function checkPhone() {
      if (st.busy) return;
      st.phone = inPhone();
      if (!/^0[35789]\d{8}$/.test(st.phone)) return setErr('Số điện thoại chưa đúng. Nhập 10 số, ví dụ 0912 345 678.');
      busy('Đang kiểm tra…');
      S9.api('POST', 'auth/check', { phone: st.phone }).then(function (r) {
        st.busy = false; st.sso = !!r.sso; st.link = false; st.err = '';
        S9.keep('phone', st.phone);
        st.step = r.state === 'login' ? 'login' : 'choose';
        draw();
      }, function (e) { setErr(e.message); });
    }
    function afterAuth(r) {
      st.busy = false;
      S.user = r.user;
      S9.afterLogin().then(function () {
        S9.route();
        if (r.needsName) S9.askName();
      });
    }
    function login() {
      if (st.busy) return;
      var pass = document.getElementById('lg-pass').value;
      if (!pass) return setErr('Nhập mật khẩu.');
      busy('Đang đăng nhập…');
      S9.api('POST', 'auth/login', { phone: st.phone, password: pass }).then(afterAuth, function (e) {
        if (e.code === 'password_required') { st.legacy = true; return startOtp('register'); }
        setErr(e.code === 'bad_credentials' ? 'Số điện thoại hoặc mật khẩu không đúng.' : e.message);
      });
    }
    // gửi OTP cho đăng ký / quên mật khẩu
    function startOtp(kind, resend) {
      if (st.busy && !resend) return;
      st.busy = true;
      S9.api('POST', kind === 'reset' ? 'auth/reset/otp' : 'auth/register/otp', { phone: st.phone }).then(function (r) {
        st.busy = false; st.manual = !!r.manual; st.devCode = r.devCode || null; st.step = kind; st.err = '';
        st.left = st.manual ? 0 : 30;
        draw();
        clearInterval(countdown);
        if (st.left > 0) {
          countdown = setInterval(function () {
            st.left--;
            var el = document.getElementById('lg-resend');
            if (!el) { clearInterval(countdown); return; }
            if (st.left <= 0) { clearInterval(countdown); el.disabled = false; el.textContent = 'Gửi lại mã'; } else el.textContent = 'Gửi lại sau ' + st.left + 's';
          }, 1000);
        }
      }, function (e) {
        st.busy = false;
        if (e.code === 'account_exists') { st.step = 'login'; st.err = 'Số này đã có tài khoản. Nhập mật khẩu để đăng nhập.'; return draw(); }
        if (e.code === 'no_account') { st.step = 'choose'; st.err = ''; return draw(); }
        if (st.step === 'phone' || st.step === 'login' || st.step === 'choose') { S9.toast(e.code === 'otp_unavailable' ? 'Chưa gửi được mã. Vui lòng thử lại sau hoặc liên hệ quản trị.' : e.message); } else setErr(e.message);
      });
    }
    function finishOtp() {
      if (st.busy) return;
      var code = document.getElementById('lg-code').value;
      var pass = document.getElementById('lg-pass').value;
      var nameEl = document.getElementById('lg-name');
      if (code.length !== 6) return setErr('Nhập đủ 6 số của mã xác thực.');
      if (nameEl && nameEl.value.trim().length < 2) return setErr('Nhập họ và tên.');
      if (pass.length < 6) return setErr('Mật khẩu cần ít nhất 6 ký tự.');
      busy('Đang xử lý…');
      var isReset = st.step === 'reset';
      var body = isReset ? { phone: st.phone, code: code, password: pass } : { phone: st.phone, code: code, name: nameEl.value.trim(), password: pass };
      S9.api('POST', isReset ? 'auth/reset' : 'auth/register', body).then(afterAuth, function (e) {
        if (e.code === 'account_exists') { st.step = 'login'; st.err = 'Số này đã có tài khoản. Nhập mật khẩu để đăng nhập.'; return draw(); }
        setErr(e.code === 'otp_invalid' ? 'Mã không đúng hoặc đã hết hạn.' : e.code === 'otp_locked' ? 'Nhập sai quá nhiều lần, hãy xin mã mới.' : e.message);
      });
    }
    draw();
  };

  // Hỏi họ tên một lần nếu tài khoản (ví dụ lấy từ 9Sport) chưa có tên.
  S9.askName = function () {
    var sh = S9.sheet('Bạn tên là gì?');
    var inp = h('input', { type: 'text', id: 'nm-in', maxlength: '80', placeholder: 'Họ và tên', autocomplete: 'name' });
    sh.body.appendChild(h('p', { class: 'muted', text: 'Tên hiển thị trong tài khoản của bạn (người nhận sẽ không thấy).' }));
    sh.body.appendChild(inp);
    sh.body.appendChild(h('button', { class: 'btn', type: 'button', text: 'Lưu', onclick: function () {
      var v = inp.value.trim();
      if (v.length < 2) return S9.toast('Nhập họ và tên');
      S9.api('PATCH', 'me', { name: v }).then(function (r) { S.user = r.user; sh.close(); S9.route(); }, S9.fail);
    } }));
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
