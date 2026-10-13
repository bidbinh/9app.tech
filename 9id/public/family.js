/* 9id: gia đình, thành viên, hồ sơ con, lời mời. */
(function () {
  'use strict';
  var N = window.N, h = N.h;

  var SENT = 'Đã ghi nhận lời mời. Nếu người nhận đã có tài khoản 9app, lời mời hiện ngay trong mục Lời mời của họ; nếu chưa, lời mời chờ tối đa 14 ngày. Có thể lời mời chưa đến được người nhận, hãy nhắc họ mở 9app.';

  // ---------- danh sách ----------
  N.families = function () {
    N.bar({ title: 'Gia đình' }); N.tabs('gia-dinh');
    var p = N.view();
    p.appendChild(h('div', { class: 'skel' }));
    N.get('api/families').then(function (r) {
      N.clear(p);
      p.appendChild(h('h1', { class: 'h1', text: 'Gia đình của tôi' }));
      (N.notices || []).forEach(function (n) {
        if (n.kind !== 'password_reset') return;
        p.appendChild(N.notice('warn', 'Mật khẩu của bạn đã được đặt lại bằng mã OTP', 'Lúc ' + new Date(n.at).toLocaleString('vi-VN') + '. Nếu không phải bạn, hãy đổi mật khẩu ngay, kiểm tra thiết bị đang đăng nhập và liên hệ nhà mạng về SIM của bạn.',
          N.btn('Tôi đã biết', 'ghost sm', function (e) { N.busy(e.currentTarget, function () { return N.post('api/notices/seen').then(function () { N.notices = []; N.families(); }); }); })));
      });
      if (N.approvals > 0) p.appendChild(N.notice('warn', N.approvals + ' người đang chờ bạn duyệt vào gia đình', 'Mở gia đình tương ứng để xem 4 số cuối điện thoại và duyệt hoặc từ chối.'));
      if (N.pending > 0) p.appendChild(N.notice('info', 'Bạn có ' + N.pending + ' lời mời gia đình', 'Mở để chấp nhận hoặc từ chối.', N.link('#/loi-moi', { class: 'linkbtn', text: 'Xem lời mời' })));
      if (!r.families.length) {
        p.appendChild(N.empty('Bạn chưa ở trong gia đình nào', 'Tạo gia đình để thêm con và mời người thân. Mọi app 9app dùng chung gia đình này.'));
      }
      r.families.forEach(function (f) {
        var chips = [N.chip(f.roleLabel, f.role === 'chu' ? 'brand' : ''), N.chip(f.memberCount + ' thành viên')];
        if (f.childCount !== null) chips.push(N.chip(f.childCount + ' con'));
        p.appendChild(N.link('#/gia-dinh/' + f.id, { class: 'card block' }, [
          h('div', { class: 'row' }, [h('div', { class: 'avatar', text: N.initial(f.name) }), h('div', { class: 'col' }, [h('div', { class: 'b', text: f.name }), h('div', { class: 'chips' }, chips)]), N.ico('chev', 22)]),
        ]));
      });
      p.appendChild(h('div', { class: 'btn-row' }, [N.btn('Tạo gia đình', 'primary', createFamily), N.btn('Nhập mã nhận gia đình', 'ghost', redeemSheet)]));
    }).catch(N.fail);
  };

  function idemKey() { return 'k' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }
  function postIdem(path, body, key) {
    return fetch(new URL(path, document.baseURI).href, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': '9id', 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) })
      .then(function (r) { return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* */ }
        if (r.ok) return j;
        var e = (j && j.error) || {}; var err = new Error(e.message || 'Có lỗi xảy ra, thử lại nhé'); err.status = r.status; err.code = e.code; throw err;
      }); }, function () { var err = new Error('Không kết nối được mạng. Bấm lại khi có mạng.'); err.offline = true; throw err; });
  }

  // gia đình được chuyển từ app khác (ví dụ 9family): chủ nhập mã nhận để trở thành chủ
  function redeemSheet() {
    N.sheet('Nhập mã nhận gia đình', function (body, close) {
      var code = N.text({ maxlength: 40, placeholder: 'ABCDE-FGHJK-LMNPQ-RSTUV', autocapitalize: 'characters' });
      var err = N.errBox(); var btn = N.btn('Nhận gia đình', 'primary block', go);
      function go() {
        err.hide();
        N.busy(btn, function () { return N.post('api/claims/redeem', { code: code.value }).then(function (r) { close(); N.toast('Bạn đã là chủ gia đình này'); N.go('#/gia-dinh/' + r.familyId); }); }, function (e) { err.show(e.message); });
      }
      N.onEnter(code, go);
      body.appendChild(N.field('Mã nhận', code, 'Mã do ứng dụng cũ cấp khi chuyển gia đình sang tài khoản 9app. Mã chỉ dùng được một lần.')); body.appendChild(err); body.appendChild(btn);
    });
  }

  function createFamily() {
    N.sheet('Tạo gia đình', function (body, close) {
      var name = N.text({ maxlength: 60, placeholder: 'Ví dụ: Nhà Cún' });
      var err = N.errBox(); var key = idemKey();
      var btn = N.btn('Tạo gia đình', 'primary block', save);
      function save() {
        err.hide();
        N.busy(btn, function () { return postIdem('api/families', { name: name.value }, key).then(function (r) { close(); N.toast('Đã tạo gia đình'); N.go('#/gia-dinh/' + r.family.id); }); }, function (e) { err.show(e.message); });
      }
      N.onEnter(name, save);
      body.appendChild(N.field('Tên gia đình', name, 'Tên có thể trùng với gia đình khác, mỗi gia đình có mã riêng.')); body.appendChild(err); body.appendChild(btn);
    });
  }

  // ---------- chi tiết ----------
  N.family = function (fid) {
    N.bar({ title: 'Gia đình', back: '#/gia-dinh' }); N.tabs('gia-dinh');
    var p = N.view();
    p.appendChild(h('div', { class: 'skel' }));
    var reload = function () { return N.family(fid); };
    N.get('api/families/' + fid).then(function (d) {
      N.bar({ title: d.family.name, back: '#/gia-dinh' });
      N.clear(p);
      var can = d.can, me = d.me;
      p.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 'row' }, [h('div', { class: 'avatar', text: N.initial(d.family.name) }), h('div', { class: 'col' }, [h('h1', { class: 'h1', text: d.family.name }), h('div', { class: 'chips' }, [N.chip(me.roleLabel, 'brand')])])]),
      ]));
      if (d.family.notesHidden) p.appendChild(N.notice('info', 'Ghi chú của các con tạm ẩn', 'Để bảo vệ trẻ, ghi chú sức khỏe và dị ứng chỉ hiện sau 24 giờ kể từ khi bạn vào gia đình (trừ khi chủ gia đình bật sớm hơn).'));

      // thành viên
      p.appendChild(h('div', { class: 'sec', text: 'Người lớn và tài khoản trong gia đình' }));
      var mem = h('div', { class: 'card' });
      d.members.forEach(function (m) {
        var tappable = (can.changeRoles || can.removeThanhVien) && !m.isMe && m.role !== 'chu';
        var row = h(tappable ? 'button' : 'div', { class: 'item' + (tappable ? ' item-btn' : ''), type: tappable ? 'button' : null, onclick: tappable ? function () { memberSheet(d, m, reload); } : null }, [
          h('div', { class: 'avatar', text: N.initial(m.displayName) }),
          h('div', { class: 'col' }, [h('div', { class: 'b', text: m.displayName + (m.isMe ? ' (bạn)' : '') })]),
          N.chip(m.roleLabel, m.role === 'chu' ? 'brand' : m.role === 'con' ? 'info' : ''),
        ]);
        mem.appendChild(row);
      });
      p.appendChild(mem);
      if (can.invite) p.appendChild(h('div', { class: 'btn-row' }, [N.btn('Mời người lớn', 'ghost', function () { inviteSheet(d, reload); })]));

      // hồ sơ con
      var showKids = d.children.length || can.editChildren;
      if (showKids) {
        p.appendChild(h('div', { class: 'sec', text: me.role === 'con' ? 'Hồ sơ của bạn' : 'Hồ sơ các con' }));
        if (!d.children.length) p.appendChild(N.empty('Chưa có hồ sơ con', 'Thêm con để các app lịch học, đưa đón, sức khỏe dùng chung. Con không cần tài khoản.'));
        else {
          var kids = h('div', { class: 'card' });
          d.children.forEach(function (c) {
            var status = c.archived ? N.chip('Đã lưu trữ') : c.linkedUserId ? N.chip(me.role === 'con' ? 'Đã nối với bạn' : 'Đã nối tài khoản' + (c.linkedName ? ': ' + c.linkedName : ''), 'ok') : c.invitePending ? N.chip('Chờ con xác nhận', 'warn') : me.role === 'con' ? null : N.chip('Chưa nối tài khoản');
            kids.appendChild(h('button', { class: 'item item-btn', type: 'button', onclick: function () { childSheet(d, c, reload); } }, [
              h('div', { class: 'avatar', text: N.initial(c.name) }),
              h('div', { class: 'col' }, [h('div', { class: 'b', text: c.name }), h('div', { class: 'muted small', text: c.birthYear ? 'Sinh năm ' + c.birthYear : 'Chưa có năm sinh' })]),
              status, N.ico('chev', 20),
            ]));
          });
          p.appendChild(kids);
        }
        if (can.editChildren) p.appendChild(h('div', { class: 'btn-row' }, [N.btn('Thêm con', 'primary', function () { addChildSheet(d, reload); })]));
      }

      // lời mời đang chờ
      if (can.invite && d.invitations.length) {
        p.appendChild(h('div', { class: 'sec', text: 'Lời mời đang chờ' }));
        var inv = h('div', { class: 'card' });
        d.invitations.forEach(function (i) {
          var title = i.kind === 'con' ? 'Nối hồ sơ con: ' + (i.childName || '') : (i.label || 'Người lớn') + ' (' + N.ROLE[i.role] + ')';
          var sub = 'Số ••••' + i.phoneLast4 + ' • hết hạn ' + N.dmy(i.expiresAt) + ' • mời bởi ' + i.invitedByName;
          if (i.awaiting) {
            inv.appendChild(h('div', { class: 'item', style: null }, [
              h('div', { class: 'avatar' }, [N.ico('check', 20)]),
              h('div', { class: 'col' }, [h('div', { class: 'b', text: i.accepterName + ' đã chấp nhận, chờ bạn duyệt' }), h('div', { class: 'muted small', text: title + ' • ' + sub }), h('div', { class: 'muted small', text: 'Đúng người bạn định mời chưa? Hãy đối chiếu 4 số cuối điện thoại rồi mới duyệt.' })]),
            ]));
            if (can.approve) inv.appendChild(h('div', { class: 'btn-row' }, [
              N.btn('Từ chối', 'ghost sm', function (e) { N.busy(e.currentTarget, function () { return N.post('api/families/' + fid + '/invites/' + i.id + '/reject').then(function () { N.toast('Đã từ chối'); reload(); }); }); }),
              N.btn('Duyệt', 'primary sm', function (e) { N.busy(e.currentTarget, function () { return N.post('api/families/' + fid + '/invites/' + i.id + '/approve').then(function () { N.toast('Đã duyệt'); N.refreshPending(); reload(); }); }); }),
            ]));
            return;
          }
          inv.appendChild(h('div', { class: 'item' }, [
            h('div', { class: 'avatar' }, [N.ico('mail', 20)]),
            h('div', { class: 'col' }, [h('div', { class: 'b', text: title }), h('div', { class: 'muted small', text: sub })]),
            (can.changeRoles || i.mine) ? N.btn('Thu hồi', 'ghost sm', function (e) { N.busy(e.currentTarget, function () { return N.del('api/families/' + fid + '/invites/' + i.id).then(function () { N.toast('Đã thu hồi lời mời'); reload(); }); }); }) : null,
          ]));
        });
        p.appendChild(inv);
      }

      // quản lý gia đình
      var acts = [];
      if (can.rename) acts.push(N.btn('Đổi tên gia đình', 'ghost', function () { renameSheet(d, reload); }));
      if (can.settings) acts.push(N.btn('Cài đặt duyệt thành viên', 'ghost', function () { settingsSheet(d, reload); }));
      if (can.transfer) acts.push(N.btn('Chuyển quyền chủ', 'ghost', function () { transferSheet(d, reload); }));
      if (can.leave) acts.push(N.btn('Rời gia đình', 'danger ghost', function () { leaveSheet(d); }));
      if (can.delete) acts.push(N.btn('Xóa gia đình', 'danger ghost', function () { deleteSheet(d); }));
      if (acts.length) { p.appendChild(h('div', { class: 'sec', text: 'Quản lý' })); p.appendChild(h('div', { class: 'btn-row' }, acts)); }
    }).catch(function (e) { if (e.status === 404) { N.clear(p); p.appendChild(N.empty('Không tìm thấy gia đình', 'Gia đình này không tồn tại hoặc bạn không còn ở trong gia đình.', N.link('#/gia-dinh', { class: 'linkbtn', text: 'Về danh sách gia đình' }))); } else N.fail(e); });
  };

  // ---------- các bảng nhập ----------
  function phoneHint() { return 'Không bắt buộc. Nếu con đã có (hoặc sẽ dùng) tài khoản 9app, nhập số điện thoại của con. Con sẽ nhận lời mời và phải tự bấm chấp nhận.'; }

  function addChildSheet(d, reload) {
    N.sheet('Thêm con', function (body, close) {
      var name = N.text({ maxlength: 40, placeholder: 'Tên của con', autocapitalize: 'words' });
      var year = N.text({ inputmode: 'numeric', maxlength: 4, placeholder: 'Ví dụ: 2015' });
      var note = h('textarea', { maxlength: 300, placeholder: 'Ví dụ: dị ứng tôm, học lớp 5A' });
      var phone = N.tel({ placeholder: 'Số điện thoại của con (nếu có)' });
      var err = N.errBox(); var key = idemKey();
      var btn = N.btn('Thêm con', 'primary block', save);
      function save() {
        err.hide();
        var b = { name: name.value, birthYear: year.value.trim() || null, note: note.value };
        if (phone.value.trim()) b.phone = phone.value;
        N.busy(btn, function () { return postIdem('api/families/' + d.family.id + '/children', b, key).then(function () { close(); N.toast(b.phone ? SENT : 'Đã thêm con'); reload(); }); }, function (e) { err.show(e.message); });
      }
      body.appendChild(N.field('Tên', name)); body.appendChild(N.field('Năm sinh', year)); body.appendChild(N.field('Ghi chú', note, 'Chỉ người lớn trong gia đình thấy ghi chú')); body.appendChild(N.field('Số điện thoại của con', phone, phoneHint())); body.appendChild(err); body.appendChild(btn);
    });
  }

  function childSheet(d, c, reload) {
    var fid = d.family.id, base = 'api/families/' + fid + '/children/' + c.id;
    var isCon = d.me.role === 'con';
    N.sheet(c.name, function (body, close) {
      body.appendChild(h('p', { class: 'muted', text: (c.birthYear ? 'Sinh năm ' + c.birthYear + '. ' : '') + (c.linkedUserId ? 'Đã nối với một tài khoản 9app.' : c.invitePending ? 'Đang chờ con xác nhận lời mời.' : 'Chưa nối với tài khoản nào.') }));
      if (c.note) body.appendChild(h('p', { class: 'pre', text: c.note }));
      var act = (text, cls, fn) => N.btn(text, cls, function (e) { N.busy(e.currentTarget, function () { return fn().then(function () { close(); reload(); }); }); });
      if (c.linkedUserId && (isCon || d.can.editChildren)) {
        body.appendChild(act(isCon ? 'Gỡ nối tài khoản của tôi khỏi hồ sơ này' : 'Gỡ nối tài khoản', 'ghost block', function () { return N.post(base + '/unlink').then(function () { N.toast('Đã gỡ nối'); }); }));
      }
      if (isCon || !d.can.editChildren) return;
      if (!c.linkedUserId && !c.archived) {
        var phone = N.tel({ placeholder: 'Số điện thoại của con' });
        var err = N.errBox(); var key = idemKey();
        var send = N.btn(c.invitePending ? 'Gửi lại lời mời' : 'Mời con nối tài khoản', 'primary block', function () {
          err.hide();
          N.busy(send, function () { return postIdem(base + '/phone', { phone: phone.value }, key).then(function () { close(); N.toast(SENT); reload(); }); }, function (e) { err.show(e.message); });
        });
        body.appendChild(N.field('Nối bằng số điện thoại', phone, phoneHint())); body.appendChild(err); body.appendChild(send);
      }
      body.appendChild(N.btn('Sửa thông tin', 'ghost block', function () { close(); editChildSheet(d, c, reload); }));
      body.appendChild(act(c.archived ? 'Bỏ lưu trữ' : 'Lưu trữ hồ sơ', 'ghost block', function () { return N.post(base + '/archive', { archived: !c.archived }); }));
      body.appendChild(N.btn('Xóa hồ sơ con', 'danger ghost block', function () {
        N.confirm({ title: 'Xóa hồ sơ con?', text: 'Hồ sơ "' + c.name + '" sẽ bị xóa khỏi gia đình. Các app dùng hồ sơ này có thể mất dữ liệu liên quan.', ok: 'Xóa hồ sơ', danger: true }).then(function (yes) {
          if (yes) N.del(base).then(function () { close(); N.toast('Đã xóa hồ sơ'); reload(); }).catch(N.fail);
        });
      }));
    });
  }

  function editChildSheet(d, c, reload) {
    N.sheet('Sửa hồ sơ con', function (body, close) {
      var name = N.text({ maxlength: 40, value: c.name });
      var year = N.text({ inputmode: 'numeric', maxlength: 4, value: c.birthYear || '' });
      var note = h('textarea', { maxlength: 300 }); note.value = c.note || '';
      var err = N.errBox(); var btn = N.btn('Lưu', 'primary block', save);
      function save() {
        err.hide();
        N.busy(btn, function () { return N.post('api/families/' + d.family.id + '/children/' + c.id, { name: name.value, birthYear: year.value.trim() || null, note: note.value }).then(function () { close(); N.toast('Đã lưu'); reload(); }); }, function (e) { err.show(e.message); });
      }
      body.appendChild(N.field('Tên', name)); body.appendChild(N.field('Năm sinh', year)); body.appendChild(N.field('Ghi chú', note)); body.appendChild(err); body.appendChild(btn);
    });
  }

  function inviteSheet(d, reload) {
    N.sheet('Mời người lớn', function (body, close) {
      var phone = N.tel({ placeholder: 'Số điện thoại người được mời' });
      var label = N.text({ maxlength: 40, placeholder: 'Ví dụ: Bà nội, Cô Hà (không bắt buộc)' });
      var role = h('select', {}, [h('option', { value: 'thanh_vien', text: 'Thành viên (xem, không sửa)' })].concat(d.can.inviteManager ? [h('option', { value: 'quan_ly', text: 'Quản lý (thêm con, mời người)' })] : []));
      var err = N.errBox(); var key = idemKey();
      var btn = N.btn('Gửi lời mời', 'primary block', save);
      function save() {
        err.hide();
        N.busy(btn, function () { return postIdem('api/families/' + d.family.id + '/invites', { phone: phone.value, role: role.value, label: label.value }, key).then(function () { close(); N.toast(SENT); reload(); }); }, function (e) { err.show(e.message); });
      }
      N.onEnter(phone, save);
      body.appendChild(N.field('Số điện thoại', phone, 'Họ sẽ nhận lời mời và phải tự bấm chấp nhận. Chưa có tài khoản 9app thì lời mời chờ họ đăng ký.')); body.appendChild(N.field('Ghi chú cho riêng bạn', label)); body.appendChild(N.field('Vai trò', role)); body.appendChild(err); body.appendChild(btn);
    });
  }

  function memberSheet(d, m, reload) {
    var base = 'api/families/' + d.family.id + '/members/' + m.userId;
    N.sheet(m.displayName, function (body, close) {
      body.appendChild(h('p', { class: 'muted', text: 'Vai trò hiện tại: ' + m.roleLabel }));
      if (d.can.changeRoles && (m.role === 'quan_ly' || m.role === 'thanh_vien')) {
        var to = m.role === 'quan_ly' ? 'thanh_vien' : 'quan_ly';
        body.appendChild(N.btn(to === 'quan_ly' ? 'Nâng lên Quản lý' : 'Hạ xuống Thành viên', 'ghost block', function (e) { N.busy(e.currentTarget, function () { return N.post(base + '/role', { role: to }).then(function () { close(); N.toast('Đã đổi vai trò'); reload(); }); }); }));
      }
      var canRemove = m.role === 'con' || m.role === 'thanh_vien' ? d.can.removeThanhVien : d.can.removeQuanLy;
      if (canRemove) body.appendChild(N.btn('Xóa khỏi gia đình', 'danger ghost block', function () {
        N.confirm({ title: 'Xóa khỏi gia đình?', text: m.displayName + ' sẽ không còn thấy gia đình này.', ok: 'Xóa', danger: true }).then(function (yes) {
          if (yes) N.del(base).then(function () { close(); N.toast('Đã xóa khỏi gia đình'); reload(); }).catch(N.fail);
        });
      }));
    });
  }

  function settingsSheet(d, reload) {
    var st = d.family.settings || {};
    N.sheet('Cài đặt gia đình', function (body, close) {
      var appr = h('input', { type: 'checkbox', checked: st.requireApproval !== false });
      var notes = h('input', { type: 'checkbox', checked: !!st.notesForNewMembers });
      var err = N.errBox(); var btn = N.btn('Lưu', 'primary block', save);
      function save() { err.hide(); N.busy(btn, function () { return N.post('api/families/' + d.family.id + '/settings', { requireApproval: appr.checked, notesForNewMembers: notes.checked }).then(function () { close(); N.toast('Đã lưu cài đặt'); reload(); }); }, function (e) { err.show(e.message); }); }
      body.appendChild(h('label', { class: 'check' }, [appr, h('span', {}, [h('b', { text: 'Duyệt trước khi người được mời vào gia đình' }), h('div', { class: 'muted small', text: 'Khuyến nghị bật. Nếu tắt, lỡ gõ nhầm số điện thoại thì người lạ bấm chấp nhận là vào thẳng gia đình và thấy thông tin của con.' })])]));
      body.appendChild(h('label', { class: 'check' }, [notes, h('span', {}, [h('b', { text: 'Cho thành viên mới xem ghi chú sức khỏe của con ngay' }), h('div', { class: 'muted small', text: 'Mặc định ghi chú chỉ hiện sau 24 giờ kể từ khi thành viên vào gia đình.' })])]));
      body.appendChild(err); body.appendChild(btn);
    });
  }

  function renameSheet(d, reload) {
    N.sheet('Đổi tên gia đình', function (body, close) {
      var name = N.text({ maxlength: 60, value: d.family.name });
      var err = N.errBox(); var btn = N.btn('Lưu', 'primary block', save);
      function save() { err.hide(); N.busy(btn, function () { return N.post('api/families/' + d.family.id + '/rename', { name: name.value }).then(function () { close(); N.toast('Đã đổi tên'); reload(); }); }, function (e) { err.show(e.message); }); }
      N.onEnter(name, save);
      body.appendChild(N.field('Tên gia đình', name)); body.appendChild(err); body.appendChild(btn);
    });
  }

  function transferSheet(d, reload) {
    var adults = d.members.filter(function (m) { return m.role === 'quan_ly' || m.role === 'thanh_vien'; });
    N.sheet('Chuyển quyền chủ', function (body, close) {
      if (!adults.length) { body.appendChild(N.notice('info', 'Chưa có người lớn khác', 'Hãy mời một người lớn vào gia đình trước khi chuyển quyền chủ.')); return; }
      var sel = h('select', {}, adults.map(function (m) { return h('option', { value: m.userId, text: m.displayName + ' (' + m.roleLabel + ')' }); }));
      var pass = N.passField('Nhập mật khẩu để xác nhận', { autocomplete: 'current-password' });
      var err = N.errBox(); var btn = N.btn('Chuyển quyền chủ', 'primary block', save);
      function save() { err.hide(); N.busy(btn, function () { return N.post('api/families/' + d.family.id + '/transfer', { toUserId: sel.value, password: pass.input.value }).then(function () { close(); N.toast('Đã chuyển quyền chủ'); reload(); }); }, function (e) { err.show(e.message); }); }
      body.appendChild(N.notice('warn', 'Bạn sẽ trở thành Quản lý', 'Người nhận quyền chủ có thể xóa gia đình và đổi vai trò mọi người.'));
      body.appendChild(N.field('Chuyển cho', sel)); body.appendChild(pass.node); body.appendChild(err); body.appendChild(btn);
    });
  }

  function leaveSheet(d) {
    N.confirm({ title: 'Rời gia đình?', text: 'Bạn sẽ không còn thấy gia đình "' + d.family.name + '". Muốn quay lại, người trong gia đình cần mời lại.', ok: 'Rời gia đình', danger: true }).then(function (yes) {
      if (yes) N.post('api/families/' + d.family.id + '/leave').then(function () { N.toast('Đã rời gia đình'); N.go('#/gia-dinh'); }).catch(N.fail);
    });
  }

  function deleteSheet(d) {
    N.sheet('Xóa gia đình', function (body, close) {
      var typed = N.text({ maxlength: 60, placeholder: d.family.name });
      var pass = N.passField('Mật khẩu của bạn', { autocomplete: 'current-password' });
      var err = N.errBox(); var btn = N.btn('Xóa gia đình vĩnh viễn', 'danger block', save);
      function save() { err.hide(); N.busy(btn, function () { return N.post('api/families/' + d.family.id + '/delete', { confirmName: typed.value, password: pass.input.value }).then(function () { close(); N.toast('Đã xóa gia đình'); N.go('#/gia-dinh'); }); }, function (e) { err.show(e.message); }); }
      body.appendChild(N.notice('bad', 'Không thể hoàn tác', 'Mọi thành viên, hồ sơ con và lời mời của gia đình này sẽ bị xóa. Các app khác sẽ không còn thấy gia đình này.'));
      body.appendChild(N.field('Gõ lại tên gia đình để xác nhận', typed)); body.appendChild(pass.node); body.appendChild(err); body.appendChild(btn);
    });
  }
})();
