/* 9id: tài khoản (tên, mật khẩu, thiết bị, xuất dữ liệu, xóa tài khoản) và lời mời gia đình. */
(function () {
  'use strict';
  var N = window.N, h = N.h;

  function sessionLabel(s) { return s.device + (s.current ? ' (máy này)' : ''); }

  N.account = function () {
    N.bar({ title: 'Tài khoản' }); N.tabs('tai-khoan');
    var p = N.view();
    p.appendChild(h('div', { class: 'skel' }));
    Promise.all([N.get('api/me'), N.get('api/sessions'), N.get('api/blocks'), N.get('api/oauth/grants')]).then(function (rs) {
      var me = rs[0].user, sessions = rs[1].sessions, blocks = rs[2].blocks, grants = rs[3].grants;
      if (!me) { N.me = null; N.go('#/dang-nhap'); return; }
      N.me = me; N.notices = rs[0].notices || [];
      N.clear(p);
      N.noticeCards(N.account).forEach(function (n) { p.appendChild(n); });
      if (rs[0].phoneUndo) {
        p.appendChild(N.notice('info', 'Bạn vừa đổi số điện thoại',
          'Đến ' + N.dmy(rs[0].phoneUndo.until) + ', người đang giữ số cũ vẫn có thể hoàn tác việc đổi này. Nếu số cũ không còn do bạn giữ (đã đưa hoặc trả SIM), hãy khóa hoàn tác.',
          N.btn('Khóa hoàn tác', 'ghost sm', function () { lockUndo(); })));
      }
      p.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 'row' }, [
          h('div', { class: 'avatar', text: N.initial(me.displayName) }),
          h('div', { class: 'col' }, [h('div', { class: 'b', text: me.displayName }), h('div', { class: 'muted', text: 'Số điện thoại ••••' + me.phoneLast4 })]),
          me.source === '9sport' ? N.chip('Từ 9Sport', 'info') : null,
        ]),
        h('div', { class: 'btn-row' }, [N.btn('Đổi tên', 'ghost sm', function () { editName(me); }), N.btn('Đổi mật khẩu', 'ghost sm', function () { changePassword(); }), N.btn('Đổi số điện thoại', 'ghost sm', function () { changePhone(); })]),
      ]));
      if (me.passwordWeak) p.appendChild(N.notice('warn', 'Mật khẩu của bạn còn ngắn', 'Mật khẩu mới cần ít nhất 8 ký tự. Hãy đổi mật khẩu để an toàn hơn.', N.btn('Đổi mật khẩu ngay', 'primary sm', function () { changePassword(); })));

      var dev = h('div', { class: 'card' }, [h('h2', { text: 'Thiết bị đang đăng nhập' })]);
      sessions.forEach(function (s) {
        dev.appendChild(h('div', { class: 'item' }, [
          h('div', { class: 'avatar' }, [N.ico('device', 20)]),
          h('div', { class: 'col' }, [h('div', { class: 'b', text: sessionLabel(s) }), h('div', { class: 'muted small', text: 'Dùng ' + N.ago(s.lastUsedAt) })]),
          s.current ? null : N.btn('Đăng xuất', 'ghost sm', function (e) { N.busy(e.currentTarget, function () { return N.del('api/sessions/' + s.id).then(function () { N.toast('Đã đăng xuất thiết bị đó'); N.account(); }); }); }),
        ]));
      });
      if (sessions.length > 1) dev.appendChild(h('div', { class: 'btn-row' }, [N.btn('Đăng xuất các thiết bị khác', 'ghost', function (e) { N.busy(e.currentTarget, function () { return N.post('api/sessions/revoke-others').then(function () { N.toast('Đã đăng xuất các thiết bị khác'); N.account(); }); }); })]));
      p.appendChild(dev);

      if (grants.length) {
        var gc = h('div', { class: 'card' }, [h('h2', { text: 'Ứng dụng đã cho phép đăng nhập' })]);
        grants.forEach(function (g) {
          gc.appendChild(h('div', { class: 'item' }, [h('div', { class: 'avatar', text: N.initial(g.name) }), h('div', { class: 'col' }, [h('div', { class: 'b', text: g.name }), h('div', { class: 'muted small', text: 'Từ ' + N.dmy(g.at) })]),
            N.btn('Thu hồi', 'ghost sm', function (e) { N.busy(e.currentTarget, function () { return N.del('api/oauth/grants/' + encodeURIComponent(g.client)).then(function () { N.toast('Đã thu hồi quyền của ' + g.name); N.account(); }); }); })]));
        });
        p.appendChild(gc);
      }
      if (blocks.length) {
        var bc = h('div', { class: 'card' }, [h('h2', { text: 'Người mời đã chặn' }), h('p', { class: 'muted small', text: 'Những người này không gửi được lời mời cho bạn.' })]);
        blocks.forEach(function (b) {
          bc.appendChild(h('div', { class: 'item' }, [h('div', { class: 'avatar', text: N.initial(b.displayName) }), h('div', { class: 'col' }, [h('div', { class: 'b', text: b.displayName })]),
            N.btn('Bỏ chặn', 'ghost sm', function (e) { N.busy(e.currentTarget, function () { return N.del('api/blocks/' + b.userId).then(function () { N.toast('Đã bỏ chặn'); N.account(); }); }); })]));
        });
        p.appendChild(bc);
      }
      p.appendChild(h('div', { class: 'card' }, [
        h('h2', { text: 'Dữ liệu của bạn' }),
        h('p', { class: 'muted', text: 'Tải về bản sao thông tin tài khoản, gia đình và hồ sơ con liên quan đến bạn. Cần nhập lại mật khẩu.' }),
        h('div', { class: 'btn-row' }, [N.btn('Tải dữ liệu của tôi', 'ghost', function () { exportData(); })]),
      ]));
      p.appendChild(h('div', { class: 'btn-row' }, [
        N.btn('Đăng xuất', 'ghost', function (e) { N.busy(e.currentTarget, function () { return N.post('api/logout').then(function () { N.me = null; N.pending = 0; N.go('#/dang-nhap'); }); }); }),
        N.btn('Xóa tài khoản', 'danger ghost', function () { deleteAccount(me); }),
      ]));
    }).catch(N.fail);
  };

  // xuất dữ liệu cá nhân: nhập lại mật khẩu rồi tải tệp JSON
  function exportData() {
    N.sheet('Tải dữ liệu của tôi', function (body, close) {
      var pass = N.passField('Nhập mật khẩu để xác nhận', { autocomplete: 'current-password' });
      var err = N.errBox(); var btn = N.btn('Tải về', 'primary block', go);
      function go() {
        err.hide();
        N.busy(btn, function () {
          return fetch(new URL('api/account/export', document.baseURI).href, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': '9id', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass.input.value }) })
            .then(function (r) {
              if (!r.ok) return r.json().then(function (j) { throw new Error((j && j.error && j.error.message) || 'Không tải được'); });
              return r.blob();
            }).then(function (blob) {
              var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '9app-du-lieu-ca-nhan.json'; document.body.appendChild(a); a.click(); a.remove();
              setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); close(); N.toast('Đã tải dữ liệu');
            });
        }, function (e) { err.show(e.message); });
      }
      N.onEnter(pass.input, go);
      body.appendChild(pass.node); body.appendChild(err); body.appendChild(btn);
    });
  }

  // Đổi số điện thoại: OTP gửi tới số MỚI + mật khẩu hiện tại. Sau khi đổi, các thiết bị khác bị đăng xuất.
  function changePhone() {
    N.sheet('Đổi số điện thoại', function (body) {
      var st = { phone: '', ticket: '' };
      var holder = h('div', {});
      body.appendChild(holder);
      function stepPhone() {
        N.clear(holder);
        var phone = N.tel({ name: 'new-phone', autocomplete: 'tel', value: st.phone });
        var err = N.errBox();
        var btn = N.btn('Gửi mã xác thực', 'primary block', send);
        function send() {
          err.hide();
          if (!phone.value.trim()) { err.show('Hãy nhập số điện thoại mới'); return; }
          N.busy(btn, function () {
            return N.getPow().then(function (pow) { return N.post('api/otp/request', { phone: phone.value, purpose: 'phone_change', pow: pow }); }).then(function () { st.phone = phone.value; st.ticket = ''; stepCode(); });
          }, function (e) { err.show(e.message); });
        }
        N.onEnter(phone, send);
        holder.appendChild(h('p', { class: 'muted', text: 'Nhập số điện thoại mới. Mã xác thực sẽ gửi tới số mới; sau khi đổi, các thiết bị khác sẽ bị đăng xuất.' }));
        holder.appendChild(h('p', { class: 'muted small', text: 'Trong 7 ngày sau khi đổi, người giữ số cũ có thể hoàn tác việc đổi (phòng khi tài khoản bị chiếm). Nếu số cũ không còn do bạn giữ, hãy khóa hoàn tác ngay sau khi đổi.' }));
        holder.appendChild(N.field('Số điện thoại mới', phone, 'Số di động Việt Nam, ví dụ 0912 345 678'));
        holder.appendChild(err); holder.appendChild(btn);
      }
      function stepCode() {
        N.clear(holder);
        var code = h('input', { type: 'text', class: 'otp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]*', 'aria-label': 'Mã xác thực 6 số', placeholder: '••••••' });
        var pass = N.passField('Mật khẩu hiện tại', { name: 'password', autocomplete: 'current-password' });
        var err = N.errBox();
        var btn = N.btn('Đổi số điện thoại', 'primary block', go);
        function go() {
          err.hide();
          var c = code.value.replace(/\D/g, '');
          if (!st.ticket && c.length !== 6) { err.show('Mã gồm 6 chữ số'); return; }
          if (!pass.input.value) { err.show('Hãy nhập mật khẩu hiện tại'); return; }
          N.busy(btn, function () {
            // mã OTP chỉ dùng được một lần: giữ vé để thử lại khi nhập sai mật khẩu
            var vt = st.ticket ? Promise.resolve(st.ticket) : N.post('api/otp/verify', { phone: st.phone, code: c }).then(function (v) { st.ticket = v.ticket; return v.ticket; });
            return vt.then(function (ticket) { return N.post('api/phone/change', { ticket: ticket, phone: st.phone, password: pass.input.value }); })
              .then(function () { N.closeSheets(); N.toast('Đã đổi số điện thoại. Các thiết bị khác đã bị đăng xuất.'); N.account(); });
          }, function (e) {
            err.show(e.message);
            if (e.code === 'ticket_invalid') { st.ticket = ''; setTimeout(stepPhone, 1500); }
          });
        }
        N.onEnter(pass.input, go);
        holder.appendChild(h('p', { text: 'Mã gồm 6 số đã gửi tới số điện thoại mới (qua Zalo hoặc tin nhắn). Mã có hiệu lực 5 phút.' }));
        holder.appendChild(N.field('Mã xác thực', code)); holder.appendChild(pass.node); holder.appendChild(err); holder.appendChild(btn);
        holder.appendChild(h('div', { class: 'links' }, [h('button', { class: 'linkbtn', type: 'button', text: 'Đổi số khác', onclick: function () { st.ticket = ''; stepPhone(); } })]));
      }
      stepPhone();
    });
  }

  // Khóa hoàn tác: chủ tài khoản chủ động tắt khả năng hoàn tác (số cũ không còn do mình giữ). Cần nhập lại mật khẩu.
  function lockUndo() {
    N.sheet('Khóa hoàn tác đổi số', function (body, close) {
      var pass = N.passField('Nhập mật khẩu để xác nhận', { autocomplete: 'current-password' });
      var err = N.errBox(); var btn = N.btn('Khóa hoàn tác', 'primary block', go);
      function go() {
        err.hide();
        N.busy(btn, function () { return N.post('api/phone/undo-lock', { password: pass.input.value }).then(function () { close(); N.toast('Đã khóa hoàn tác. Số cũ không còn được giữ chỗ.'); N.account(); }); }, function (e) { err.show(e.message); });
      }
      N.onEnter(pass.input, go);
      body.appendChild(h('p', { text: 'Sau khi khóa, không ai (kể cả người giữ số cũ) hoàn tác được việc đổi số này, và số cũ có thể được người khác đăng ký.' }));
      body.appendChild(pass.node); body.appendChild(err); body.appendChild(btn);
    });
  }

  function editName(me) {
    N.sheet('Đổi tên hiển thị', function (body, close) {
      var name = N.text({ value: me.displayName, maxlength: 40, autocomplete: 'name' });
      var err = N.errBox(); var btn = N.btn('Lưu', 'primary block', save);
      function save() { err.hide(); N.busy(btn, function () { return N.post('api/account/name', { name: name.value }).then(function () { close(); N.toast('Đã đổi tên'); N.account(); }); }, function (e) { err.show(e.message); }); }
      N.onEnter(name, save);
      body.appendChild(N.field('Tên hiển thị', name, 'Người nhà thấy tên này trong gia đình')); body.appendChild(err); body.appendChild(btn);
    });
  }

  function changePassword() {
    N.sheet('Đổi mật khẩu', function (body, close) {
      var cur = N.passField('Mật khẩu hiện tại', { autocomplete: 'current-password' });
      var nw = N.passField('Mật khẩu mới', { autocomplete: 'new-password' }, 'Ít nhất 8 ký tự. Các thiết bị khác sẽ bị đăng xuất.');
      var err = N.errBox(); var btn = N.btn('Đổi mật khẩu', 'primary block', save);
      function save() {
        err.hide();
        if ([].slice.call(nw.input.value).length < 8) { err.show('Mật khẩu mới cần ít nhất 8 ký tự'); return; }
        N.busy(btn, function () { return N.post('api/account/password', { currentPassword: cur.input.value, newPassword: nw.input.value }).then(function () { close(); N.toast('Đã đổi mật khẩu'); N.account(); }); }, function (e) { err.show(e.message); });
      }
      N.onEnter(nw.input, save);
      body.appendChild(cur.node); body.appendChild(nw.node); body.appendChild(err); body.appendChild(btn);
    });
  }

  function deleteAccount() {
    N.sheet('Xóa tài khoản', function (body, close) {
      var pass = N.passField('Nhập mật khẩu để xác nhận', { autocomplete: 'current-password' });
      var err = N.errBox();
      var decisions = {};
      var area = h('div', {});
      var btn = N.btn('Xóa tài khoản vĩnh viễn', 'danger block', submit);
      function submit() {
        err.hide();
        N.busy(btn, function () {
          return N.post('api/account/delete', { password: pass.input.value, decisions: decisions }).then(function () { close(); N.me = null; N.pending = 0; N.toast('Đã xóa tài khoản'); N.go('#/dang-ky'); });
        }, function (e) {
          if (e.code === 'needs_decision') { showChoices(e.details.families); err.show('Hãy chọn cách xử lý các gia đình bạn đang làm chủ, rồi bấm xóa lần nữa.'); return; }
          err.show(e.message);
        });
      }
      function showChoices(fams) {
        N.clear(area);
        fams.forEach(function (f) {
          var mode = { v: f.candidates.length ? '' : 'delete' };
          var sel = h('select', { 'aria-label': 'Chuyển quyền cho' }, [h('option', { value: '', text: 'Chọn người nhận quyền chủ' })].concat(f.candidates.map(function (c) { return h('option', { value: c.userId, text: c.displayName + ' (' + N.ROLE[c.role] + ')' }); })));
          function set() {
            if (mode.v === 'delete') decisions[f.id] = { action: 'delete' };
            else if (mode.v === 'transfer' && sel.value) decisions[f.id] = { action: 'transfer', toUserId: sel.value };
            else delete decisions[f.id];
          }
          var name = 'dec' + f.id;
          var radios = [];
          if (f.candidates.length) radios.push(h('label', { class: 'check' }, [h('input', { type: 'radio', name: name, onchange: function () { mode.v = 'transfer'; set(); } }), h('span', { text: 'Chuyển quyền chủ cho người khác' })]));
          radios.push(h('label', { class: 'check' }, [h('input', { type: 'radio', name: name, checked: !f.candidates.length, onchange: function () { mode.v = 'delete'; set(); } }), h('span', { text: 'Xóa gia đình này (xóa cả hồ sơ con và thành viên)' })]));
          sel.addEventListener('change', set);
          set();
          area.appendChild(h('div', { class: 'card' }, [h('div', { class: 'b', text: 'Gia đình "' + f.name + '"' })].concat(radios, f.candidates.length ? [sel] : [])));
        });
      }
      body.appendChild(N.notice('bad', 'Việc này không thể hoàn tác', 'Tài khoản, các thiết bị đăng nhập và việc nối với hồ sơ con sẽ bị xóa. Hồ sơ con do bạn tạo vẫn ở lại gia đình nếu còn người lớn khác.'));
      body.appendChild(pass.node); body.appendChild(area); body.appendChild(err); body.appendChild(btn);
    });
  }

  // ---------- lời mời gửi cho tôi ----------
  N.invitations = function () {
    N.bar({ title: 'Lời mời' }); N.tabs('loi-moi');
    var p = N.view();
    p.appendChild(h('div', { class: 'skel' }));
    N.get('api/invitations').then(function (r) {
      N.pending = r.invitations.length; N.tabs('loi-moi');
      N.clear(p);
      p.appendChild(h('h1', { class: 'h1', text: 'Lời mời gia đình' }));
      if (!r.invitations.length) {
        p.appendChild(N.empty('Chưa có lời mời nào', 'Khi ai đó mời số điện thoại của bạn vào gia đình, lời mời sẽ hiện ở đây. Lời mời có hiệu lực 14 ngày.'));
        return;
      }
      r.invitations.forEach(function (inv) {
        var child = inv.kind === 'con';
        var card = h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [h('div', { class: 'avatar', text: N.initial(inv.invitedByName) }), h('div', { class: 'col' }, [
            h('div', { class: 'b', text: inv.invitedByName + ' mời bạn' }),
            h('div', { text: 'vào gia đình "' + inv.familyName + '"' }),
          ])]),
          h('p', { class: 'muted mt', text: child ? 'Nối tài khoản của bạn với hồ sơ con trong gia đình này. Cha mẹ sẽ xem được lịch và việc của bạn trong gia đình.' : 'Với vai trò ' + inv.roleLabel + '. Bạn sẽ thấy thông tin chung của gia đình.' }),
          h('div', { class: 'chips' }, [N.chip(child ? 'Hồ sơ con' : inv.roleLabel, 'brand'), N.chip('Hết hạn ' + N.dmy(inv.expiresAt), 'warn')]),
          inv.awaitingApproval ? N.notice('info', 'Đang chờ chủ gia đình duyệt', 'Bạn đã chấp nhận. Khi chủ hoặc quản lý gia đình duyệt, bạn sẽ thấy gia đình ở mục Gia đình.') : null,
          h('p', { class: 'muted small', text: inv.familyNameNote }),
          h('div', { class: 'btn-row' }, [
            N.btn('Từ chối', 'ghost', function (e) { N.busy(e.currentTarget, function () { return N.post('api/invitations/' + inv.id + '/decline').then(function () { N.toast('Đã từ chối lời mời'); N.invitations(); }); }); }),
            inv.awaitingApproval ? null : N.btn('Chấp nhận', 'primary', function (e) { N.busy(e.currentTarget, function () { return N.post('api/invitations/' + inv.id + '/accept').then(function (r2) { if (r2.awaiting) { N.toast('Đã chấp nhận. Chờ chủ gia đình duyệt.'); N.invitations(); return; } N.toast('Bạn đã vào gia đình'); N.refreshPending().then(function () { N.go('#/gia-dinh/' + r2.familyId); }); }); }); }),
          ]),
          h('div', { class: 'links' }, [
            h('button', { class: 'linkbtn', type: 'button', text: 'Chặn người mời', onclick: function () { N.confirm({ title: 'Chặn người mời?', text: inv.invitedByName + ' sẽ không gửi được lời mời cho bạn nữa. Họ không được báo là đã bị chặn.', ok: 'Chặn', danger: true }).then(function (yes) { if (yes) N.post('api/invitations/' + inv.id + '/block').then(function () { N.toast('Đã chặn'); N.invitations(); }).catch(N.fail); }); } }),
            h('button', { class: 'linkbtn', type: 'button', text: 'Báo cáo', onclick: function () { N.confirm({ title: 'Báo cáo lời mời?', text: 'Lời mời bị từ chối, người mời bị chặn và 9app ghi nhận báo cáo để xem xét.', ok: 'Báo cáo', danger: true }).then(function (yes) { if (yes) N.post('api/invitations/' + inv.id + '/report').then(function () { N.toast('Đã báo cáo và chặn'); N.invitations(); }).catch(N.fail); }); } }),
          ]),
        ]);
        p.appendChild(card);
      });
      p.appendChild(h('p', { class: 'muted small center', text: 'Không quen người mời? Hãy bấm Từ chối: gia đình đó sẽ không thấy gì của bạn.' }));
    }).catch(N.fail);
  };
})();

/* Màn "Cho phép": app ở tên miền con riêng (ví dụ Osin) xin đăng nhập bằng tài khoản 9app */
(function () {
  'use strict';
  var N = window.N, h = N.h;
  N.consent = function () {
    N.bar({ title: 'Cho phép đăng nhập' }); N.tabs(null);
    var p = N.view();
    var next = N.next(), client = null;
    try { client = next ? new URL(next, location.origin).searchParams.get('client') : null; } catch (e) { client = null; }
    if (!next || !client) { p.appendChild(N.empty('Liên kết không hợp lệ', 'Hãy mở lại từ ứng dụng cần đăng nhập.')); return; }
    N.get('api/oauth/client?client=' + encodeURIComponent(client)).then(function (info) {
      N.clear(p);
      p.appendChild(h('h1', { class: 'h1', text: 'Cho phép ' + info.name + '?' }));
      p.appendChild(h('div', { class: 'card' }, [
        h('p', { text: info.name + ' (' + info.hosts.join(', ') + ') muốn xác nhận bạn là ' + N.me.displayName + ' bằng tài khoản 9app.' }),
        h('p', { class: 'muted mt', text: 'Ứng dụng chỉ nhận mã người dùng và tên hiển thị. Không nhận số điện thoại hay mật khẩu. Bạn có thể thu hồi trong mục Tài khoản bất cứ lúc nào.' }),
        h('div', { class: 'btn-row' }, [
          N.btn('Không', 'ghost', function () { N.go('#/gia-dinh'); }),
          N.btn('Cho phép ' + info.name, 'primary', function (e) { N.busy(e.currentTarget, function () { return N.post('api/oauth/consent', { client: client }).then(function () { location.assign(next); }); }); }),
        ]),
      ]));
    }).catch(function () { N.clear(p); p.appendChild(N.empty('Ứng dụng không được đăng ký', 'Liên kết này không đáng tin. Đừng tiếp tục.')); });
  };
})();
