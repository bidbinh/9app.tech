/* 9id: đăng nhập, đăng ký (3 bước), quên mật khẩu. */
(function () {
  'use strict';
  var N = window.N, h = N.h;

  // sau khi đăng nhập/đăng ký/đặt lại: chuyển về `next` (máy chủ đã làm sạch, trình duyệt kiểm lại) hoặc vào Gia đình
  N.afterAuth = function (r) {
    N.me = r.user; N.notices = r.notices || [];
    var nx = N.safeNext(r.next);
    if (nx) { location.assign(nx); return; }
    // bỏ ?next khỏi địa chỉ để không bị chuyển lại lần sau
    if (location.search) history.replaceState(null, '', location.pathname + '#/gia-dinh');
    N.refreshPending().then(function () { N.go('#/gia-dinh'); });
    if (r.mustChangePassword) N.toast('Mật khẩu của bạn còn ngắn. Hãy đổi mật khẩu mới trong mục Tài khoản.');
  };
  var rawNext = function () { return new URLSearchParams(location.search).get('next') || undefined; };

  function hero(title, sub) {
    return h('div', { class: 'hero' }, [
      h('div', { class: 'hero-ico' }, [h('img', { src: 'icon.svg', alt: '', width: 84, height: 84 })]),
      h('h1', { class: 'h1', text: title }),
      sub ? h('p', { class: 'sub', text: sub }) : null,
    ]);
  }

  // ---------- đăng nhập ----------
  N.login = function () {
    N.bar({ title: 'Đăng nhập' }); N.tabs(null);
    var p = N.view();
    if (N.me) {
      var nx = N.next();
      p.appendChild(hero('Xin chào, ' + N.me.displayName, 'Bạn đang đăng nhập tài khoản 9app.'));
      p.appendChild(h('div', { class: 'card' }, [
        nx ? N.btn('Tiếp tục', 'primary block', function () { location.assign(nx); }) : N.btn('Vào Gia đình', 'primary block', function () { N.go('#/gia-dinh'); }),
        h('div', { class: 'btn-row' }, [N.btn('Đăng xuất', 'ghost', function (e) { N.busy(e.currentTarget, function () { return N.post('api/logout').then(function () { N.me = null; N.pending = 0; N.route(); }); }); })]),
      ]));
      return;
    }
    p.appendChild(hero('Đăng nhập 9app', 'Một tài khoản dùng cho mọi app 9app.'));
    var phone = N.tel({ name: 'phone', autocomplete: 'username' });
    var pass = N.passField('Mật khẩu', { name: 'password', autocomplete: 'current-password' });
    var err = N.errBox();
    var btn = N.btn('Đăng nhập', 'primary block', submit);
    function submit() {
      err.hide();
      if (!phone.value.trim() || !pass.input.value) { err.show('Hãy nhập số điện thoại và mật khẩu'); return; }
      N.busy(btn, function () {
        return N.post('api/login', { phone: phone.value, password: pass.input.value, next: rawNext() }).then(N.afterAuth);
      }, function (e) { err.show(e.message); });
    }
    N.onEnter(phone, function () { pass.input.focus(); }); N.onEnter(pass.input, submit);
    p.appendChild(h('form', { class: 'card', novalidate: '', onsubmit: function (e) { e.preventDefault(); } }, [
      N.field('Số điện thoại', phone), pass.node, err,
      h('div', { class: 'mt' }, [btn]),
      h('div', { class: 'links' }, [N.link('#/quen-mat-khau', { class: 'linkbtn', text: 'Quên mật khẩu?' }), N.link('#/dang-ky', { class: 'linkbtn', text: 'Đăng ký tài khoản' })]),
    ]));
    p.appendChild(h('p', { class: 'muted center', text: 'Có tài khoản 9Sport? Chọn Đăng ký, xác minh số điện thoại rồi chọn "Nhập tài khoản 9Sport".' }));
  };

  // ---------- đăng ký / quên mật khẩu ----------
  // mode: 'register' | 'reset'. Trạng thái giữ trong closure; mỗi bước vẽ lại cả trang.
  N.phoneFlow = function (mode) {
    var st = { step: 1, phone: '', ticket: '', exists: false, undoable: false, mode: mode, resend: 0 };
    var timer = null;
    N.onLeave(function () { clearInterval(timer); });
    var TITLES = { register: ['Đăng ký', 'Tạo tài khoản 9app', 'Dùng số điện thoại để tạo tài khoản. Đăng ký một lần, dùng cho mọi app 9app cần đăng nhập. Bạn sẽ nhận một mã xác thực.'], reset: ['Quên mật khẩu', 'Đặt lại mật khẩu', 'Nhập số điện thoại đã đăng ký, chúng tôi sẽ gửi mã xác thực để đặt mật khẩu mới.'] };

    function steps() {
      var names = ['Số điện thoại', 'Mã xác thực', st.mode === 'reset' ? 'Mật khẩu mới' : 'Tên và mật khẩu'];
      return h('ol', { class: 'steps', 'aria-label': 'Các bước' }, names.map(function (n, i) {
        var k = i + 1 < st.step ? 'done' : i + 1 === st.step ? 'now' : '';
        return h('li', { class: 'step ' + k, 'aria-current': k === 'now' ? 'step' : null }, [h('span', { class: 'dot', text: k === 'done' ? '✓' : String(i + 1) }), h('span', { class: 'lbl', text: n })]);
      }));
    }
    function startResend(sec) {
      clearInterval(timer); st.resend = sec;
      timer = setInterval(function () {
        st.resend = Math.max(0, st.resend - 1);
        var b = document.getElementById('resend'); if (b) { b.disabled = st.resend > 0; b.textContent = st.resend > 0 ? 'Gửi lại mã sau ' + st.resend + ' giây' : 'Gửi lại mã'; }
        if (st.resend <= 0) clearInterval(timer);
      }, 1000);
    }

    function render() {
      var t = TITLES[mode];
      N.bar({ title: t[0] }); N.tabs(null);
      var p = N.view();
      p.appendChild(h('div', { class: 'hero' }, [h('h1', { class: 'h1', text: st.step === 3 && st.mode === 'reset' ? 'Đặt mật khẩu mới' : t[1] })]));
      p.appendChild(steps());
      if (st.step === 1) step1(p, t); else if (st.step === 2) step2(p); else step3(p);
    }

    function step1(p, t) {
      var phone = N.tel({ name: 'phone', value: st.phone });
      var err = N.errBox();
      var btn = N.btn('Gửi mã xác thực', 'primary block', send);
      function send() {
        err.hide();
        if (!phone.value.trim()) { err.show('Hãy nhập số điện thoại'); return; }
        N.busy(btn, function () {
          return N.getPow().then(function (pow) { return N.post('api/otp/request', { phone: phone.value, purpose: mode, pow: pow }); }).then(function (r) { st.phone = phone.value; st.step = 2; startResend(r.resendAfterSec || 60); render(); });
        }, function (e) { err.show(e.message); });
      }
      N.onEnter(phone, send);
      p.appendChild(h('div', { class: 'card' }, [
        h('p', { class: 'muted', text: t[2] }),
        N.field('Số điện thoại', phone, 'Số di động Việt Nam, ví dụ 0912 345 678'), err, h('div', { class: 'mt' }, [btn]),
        h('div', { class: 'links' }, [N.link('#/dang-nhap', { class: 'linkbtn', text: 'Đã có tài khoản? Đăng nhập' })]),
      ]));
    }

    function step2(p) {
      var code = h('input', { type: 'text', class: 'otp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]*', 'aria-label': 'Mã xác thực 6 số', placeholder: '••••••' });
      var err = N.errBox();
      var btn = N.btn('Xác nhận', 'primary block', verify);
      function verify() {
        err.hide();
        var c = code.value.replace(/\D/g, '');
        if (c.length !== 6) { err.show('Mã gồm 6 chữ số'); return; }
        N.busy(btn, function () {
          return N.post('api/otp/verify', { phone: st.phone, code: c }).then(function (r) { st.ticket = r.ticket; st.exists = r.accountExists; st.undoable = !!r.phoneChangeUndoable; clearInterval(timer); st.step = 3; render(); });
        }, function (e) { err.show(e.message); });
      }
      code.addEventListener('input', function () { code.value = code.value.replace(/\D/g, '').slice(0, 6); if (code.value.length === 6) verify(); });
      N.onEnter(code, verify);
      var resend = h('button', { id: 'resend', class: 'linkbtn', type: 'button', disabled: st.resend > 0, text: st.resend > 0 ? 'Gửi lại mã sau ' + st.resend + ' giây' : 'Gửi lại mã' });
      resend.addEventListener('click', function () {
        err.hide();
        N.busy(resend, function () { return N.getPow().then(function (pow) { return N.post('api/otp/request', { phone: st.phone, purpose: mode, pow: pow }); }).then(function (r) { startResend(r.resendAfterSec || 60); N.toast('Đã gửi lại mã'); }); }, function (e) { err.show(e.message); });
      });
      p.appendChild(h('div', { class: 'card' }, [
        h('p', { text: 'Mã gồm 6 số đã gửi tới số điện thoại của bạn (qua Zalo hoặc tin nhắn). Mã có hiệu lực 5 phút.' }),
        N.field('Mã xác thực', code), err, h('div', { class: 'mt' }, [btn]),
        h('div', { class: 'links' }, [resend, h('button', { class: 'linkbtn', type: 'button', text: 'Đổi số điện thoại', onclick: function () { clearInterval(timer); st.step = 1; render(); } })]),
      ]));
    }

    // Số này vừa được đổi khỏi một tài khoản (trong 7 ngày): người giữ số cũ hoàn tác và đặt mật khẩu mới
    function undoBlock(p) {
      var pass = N.passField('Mật khẩu mới', { name: 'new-password', autocomplete: 'new-password' }, 'Ít nhất 8 ký tự. Mọi thiết bị đang đăng nhập tài khoản này sẽ bị đăng xuất.');
      var err = N.errBox();
      var btn = N.btn('Hoàn tác và đặt mật khẩu mới', 'primary block', go);
      function go() {
        err.hide();
        if ([].slice.call(pass.input.value).length < 8) { err.show('Mật khẩu cần ít nhất 8 ký tự'); return; }
        N.busy(btn, function () {
          return N.post('api/phone/undo', { ticket: st.ticket, phone: st.phone, password: pass.input.value, next: rawNext() }).then(function (r) { N.toast('Đã hoàn tác việc đổi số'); N.afterAuth(r); });
        }, function (e) {
          err.show(e.message);
          if (e.code === 'ticket_invalid') { st.step = 1; setTimeout(render, 1500); }
        });
      }
      N.onEnter(pass.input, go);
      p.appendChild(N.notice('warn', 'Số này vừa được chuyển khỏi một tài khoản', 'Trong 7 ngày qua số điện thoại này đã được đổi sang số khác. Nếu không phải bạn làm, hãy hoàn tác để lấy lại tài khoản.'));
      p.appendChild(h('form', { class: 'card', novalidate: '', onsubmit: function (e) { e.preventDefault(); } }, [pass.node, err, h('div', { class: 'mt' }, [btn])]));
      p.appendChild(h('div', { class: 'center' }, [N.link('#/dang-nhap', { class: 'linkbtn', text: 'Quay lại đăng nhập' })]));
    }

    function step3(p) {
      if (!st.exists && st.undoable) { undoBlock(p); return; }
      // đăng ký mà số đã có tài khoản: chỉ chủ số mới tới được đây, chuyển sang đặt lại mật khẩu
      // quên mật khẩu mà số chưa có tài khoản: đề nghị đăng ký bằng số này
      if (st.mode === 'register' && st.exists) {
        p.appendChild(N.notice('info', 'Số này đã có tài khoản 9app', 'Bạn không cần đăng ký lại. Hãy đặt mật khẩu mới để vào tài khoản của mình.'));
        p.appendChild(N.btn('Đặt mật khẩu mới', 'primary block', function () { st.mode = 'reset'; render(); }));
        p.appendChild(h('div', { class: 'center' }, [N.link('#/dang-nhap', { class: 'linkbtn', text: 'Tôi nhớ mật khẩu, đăng nhập' })]));
        return;
      }
      if (st.mode === 'reset' && !st.exists) {
        p.appendChild(N.notice('warn', 'Số này chưa có tài khoản 9app', 'Bạn đã xác minh được số điện thoại, nên có thể tạo tài khoản mới ngay bây giờ.'));
        p.appendChild(N.btn('Tạo tài khoản bằng số này', 'primary block', function () { st.mode = 'register'; render(); }));
        return;
      }
      var reg = st.mode === 'register';
      var name = N.text({ name: 'name', autocomplete: 'name', maxlength: 40, placeholder: 'Ví dụ: Lan Anh', autocapitalize: 'words' });
      var pass = N.passField(reg ? 'Mật khẩu' : 'Mật khẩu mới', { name: 'new-password', autocomplete: 'new-password' }, 'Ít nhất 8 ký tự');
      var err = N.errBox();
      var btn = N.btn(reg ? 'Tạo tài khoản' : 'Đặt mật khẩu và đăng nhập', 'primary block', done);
      function done() {
        err.hide();
        if (reg && !name.value.trim()) { err.show('Hãy nhập tên hiển thị'); return; }
        if ([].slice.call(pass.input.value).length < 8) { err.show('Mật khẩu cần ít nhất 8 ký tự'); return; }
        N.busy(btn, function () {
          var body = reg ? { ticket: st.ticket, phone: st.phone, name: name.value, password: pass.input.value } : { ticket: st.ticket, phone: st.phone, password: pass.input.value };
          body.next = rawNext();
          return N.post(reg ? 'api/register' : 'api/password/reset', body).then(function (r) { N.toast(reg ? 'Đã tạo tài khoản' : 'Đã đặt mật khẩu mới'); N.afterAuth(r); });
        }, function (e) {
          err.show(e.message);
          if (e.code === 'ticket_invalid') { st.step = 1; setTimeout(render, 1500); }
          if (e.code === 'account_exists') { st.exists = true; setTimeout(render, 1200); }
        });
      }
      N.onEnter(name, function () { pass.input.focus(); }); N.onEnter(pass.input, done);
      p.appendChild(h('form', { class: 'card', novalidate: '', onsubmit: function (e) { e.preventDefault(); } }, [
        h('p', { class: 'ok-t', text: 'Số điện thoại đã được xác minh.' }),
        reg ? N.field('Tên hiển thị', name, 'Tên người nhà sẽ thấy trong gia đình') : null, pass.node, err, h('div', { class: 'mt' }, [btn]),
      ]));
      if (reg) sportOption(p);
    }
    // Nhập tài khoản 9Sport: chỉ sau khi đã xác minh OTP số điện thoại
    function sportOption(p) {
      var holder = h('div', {});
      p.appendChild(holder);
      N.get('api/register/9sport/enabled').then(function (r) {
        if (!r.enabled) return;
        var open = false;
        function draw() {
          N.clear(holder);
          if (!open) { holder.appendChild(h('div', { class: 'center' }, [h('button', { class: 'linkbtn', type: 'button', text: 'Có tài khoản 9Sport? Nhập vào 9app', onclick: function () { open = true; draw(); } })])); return; }
          var sp = N.passField('Mật khẩu 9Sport', { name: 'sport-password', autocomplete: 'off' }, 'Số điện thoại này đã được xác minh. Mật khẩu 9Sport chỉ dùng để kiểm tra một lần.');
          var np = N.passField('Mật khẩu mới cho 9app (không bắt buộc)', { name: 'new-password', autocomplete: 'new-password' }, 'Để trống nếu muốn dùng lại mật khẩu 9Sport. Nên chọn mật khẩu từ 8 ký tự.');
          var e2 = N.errBox();
          var b2 = N.btn('Nhập tài khoản 9Sport', 'primary block', function () {
            e2.hide();
            if (!sp.input.value) { e2.show('Hãy nhập mật khẩu 9Sport'); return; }
            N.busy(b2, function () {
              return N.post('api/register/9sport', { ticket: st.ticket, phone: st.phone, sportPassword: sp.input.value, newPassword: np.input.value || undefined, next: rawNext() }).then(function (r2) { N.toast('Đã nhập tài khoản 9Sport'); N.afterAuth(r2); });
            }, function (e) { e2.show(e.message); });
          });
          holder.appendChild(h('div', { class: 'card' }, [h('h2', { text: 'Nhập tài khoản 9Sport' }), sp.node, np.node, e2, h('div', { class: 'mt' }, [b2])]));
        }
        draw();
      }, function () { /* bỏ qua */ });
    }
    render();
  };
})();
