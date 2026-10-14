/* 9lunch: trang vào (tạo nhóm, nhập mã mời, danh sách nhóm) và màn vào nhóm bằng link. */
(function () {
  'use strict';
  var L9 = window.L9; var h = L9.h;

  var STATUS = { binh_chon: ['Đang chọn quán', 'info'], dat_mon: ['Đang gọi món', 'info'], thanh_toan: ['Đang thu tiền', 'warn'], xong: ['Đã xong', 'ok'], huy: ['Đã hủy', ''] };
  L9.STATUS = STATUS;

  function createForm(onDone) {
    var name = L9.text({ placeholder: 'Ví dụ: Team Kế toán tầng 5', autocapitalize: 'sentences' });
    var me = L9.text({ placeholder: 'Tên mọi người sẽ thấy', value: L9.store('myname') || '', autocapitalize: 'words' });
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var bank = L9.bankForm(null);
    var bankBox = h('div', { class: 'hidden' }, [bank.node]);
    var toggle = h('button', { type: 'button', class: 'linkbtn', onclick: function () {
      var show = bankBox.classList.toggle('hidden');
      toggle.textContent = show ? 'Nhập tài khoản nhận tiền ngay (không bắt buộc)' : 'Để sau, tôi nhập sau';
    } }, ['Nhập tài khoản nhận tiền ngay (không bắt buộc)']);
    var submit = L9.btn('Tạo nhóm', 'primary block', function () {
      err.className = 'hint err hidden';
      var n = name.value.trim(), m = me.value.trim();
      if (!n) { name.focus(); err.textContent = 'Hãy đặt tên nhóm.'; err.className = 'hint err'; return; }
      if (!m) { me.focus(); err.textContent = 'Hãy nhập tên của bạn.'; err.className = 'hint err'; return; }
      var b = null;
      if (!bankBox.classList.contains('hidden')) {
        try { b = bank.read(); } catch (e) { err.textContent = e.message; err.className = 'hint err'; return; }
      }
      return L9.busy(submit, function () {
        return L9.post('api/teams', { name: n, myName: m, bank: b && b.account ? b : undefined }, { idem: 'mkteam' }).then(function (r) {
          L9.store('myname', m);
          L9.toast('Đã tạo nhóm. Gửi link mời cho mọi người nhé!');
          L9.go('#/t/' + r.team.id);
          if (onDone) onDone();
        });
      });
    });
    return h('form', { onsubmit: function (e) { e.preventDefault(); } }, [
      L9.field('Tên nhóm', name), L9.field('Tên của bạn', me), toggle, bankBox, err, h('div', { class: 'mt' }, [submit]),
    ]);
  }

  // Chỉ nhận: đường dẫn dạng /t/<mã 10 ký tự>, hoặc cả chuỗi là mã 10 ký tự. Không lấy 10 ký tự cuối của đoạn dán dài.
  function codeFrom(s) {
    s = String(s).trim();
    var m = s.match(/\/t\/([A-Za-z0-9]{10})(?![A-Za-z0-9])/);
    var c = (m ? m[1] : s).toUpperCase();
    return /^[A-HJ-NP-Z2-9]{10}$/.test(c) ? c : '';
  }
  L9.codeFrom = codeFrom;

  // ---------- thẻ tài khoản 9id (tùy chọn): chỉ hiện khi tích hợp bật và 9id trả lời được ----------
  function loginUrl(acc, mode) {
    // chỉ nhận đường dẫn tương đối cùng nguồn gốc (bắt đầu bằng một dấu /) từ máy chủ; next là trang hiện tại
    if (typeof acc.loginPath !== 'string' || !/^\/(?!\/)/.test(acc.loginPath)) return null;
    return acc.loginPath + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash) + '#/' + mode;
  }
  function accountCard(acc) {
    if (!acc || !acc.enabled || acc.idDown) return null;
    var inUrl = loginUrl(acc, 'dang-nhap'), upUrl = loginUrl(acc, 'dang-ky');
    if (!inUrl) return null;
    if (!acc.loggedIn) {
      return h('div', { class: 'card', id: 'acc-card' }, [
        h('h2', { text: 'Tài khoản 9app (không bắt buộc)' }),
        h('p', { class: 'muted', text: 'Đăng nhập để giữ nhóm của bạn và dùng trên máy khác. Không đăng nhập vẫn dùng bình thường.' }),
        h('div', { class: 'btn-row' }, [
          L9.btn('Đăng nhập', 'primary', function () { location.assign(inUrl); }),
          L9.btn('Đăng ký', 'ghost', function () { location.assign(upUrl); }),
        ]),
      ]);
    }
    var kids = [h('h2', { text: 'Tài khoản 9app' }), h('p', { text: 'Đã đăng nhập: ' + (acc.user && acc.user.displayName ? acc.user.displayName : 'bạn') })];
    if (acc.claimable && acc.claimable.length) {
      kids.push(h('p', { class: 'muted', text: 'Trên máy này có ' + acc.claimable.length + ' nhóm chưa gắn vào tài khoản: ' + acc.claimable.map(function (x) { return x.teamName; }).join(', ') + '.' }));
      var claim = L9.btn('Gắn vào tài khoản', 'primary block', function () {
        return L9.busy(claim, function () {
          return L9.post('api/account/claim', {}).then(function (r) {
            L9.toast('Đã gắn ' + (r.claimed ? r.claimed.length : 0) + ' nhóm vào tài khoản của bạn.');
            L9.home();
          });
        });
      });
      kids.push(claim);
    }
    if (acc.conflicts && acc.conflicts.length) {
      kids.push(h('p', { class: 'muted', text: 'Bạn đã tham gia ' + acc.conflicts.map(function (x) { return x.teamName; }).join(', ') + ' bằng tài khoản này, nên thành viên ẩn danh tương ứng trên máy này được giữ riêng.' }));
    }
    kids.push(h('div', { class: 'btn-row' }, [
      h('a', { class: 'btn ghost', href: acc.loginPath + '#/tai-khoan' }, ['Quản lý tài khoản']),
      L9.btn('Đăng xuất', 'ghost', function (e) {
        return L9.busy(e.currentTarget, function () {
          return fetch(acc.loginPath + 'api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': '9id', 'content-type': 'application/json' }, body: '{}' })
            .then(function () { location.reload(); }, function () { L9.toast('Chưa đăng xuất được, hãy thử lại.'); });
        });
      }),
    ]));
    return h('div', { class: 'card', id: 'acc-card' }, kids);
  }

  L9.home = function () {
    L9.frame({ title: '9lunch' });
    L9.skeleton();
    Promise.all([L9.get('api/me'), L9.get('api/account').catch(function () { return null; })]).then(function (rs) {
      var data = rs[0], acc = rs[1];
      var teams = data.teams || [];
      var nodes = [];
      if (!teams.length) {
        nodes.push(h('div', { class: 'hero' }, [
          h('div', { class: 'hero-ico' }, [L9.ico('bowl', 44, 1.8)]),
          h('h1', { class: 'h1', text: 'Cơm trưa cả nhóm, gọn một chỗ' }),
          h('p', { class: 'sub', text: 'Chọn quán, gom món, chia tiền và nhắc nợ. Mỗi người một mã QR riêng. Không ai phải đăng ký.' }),
        ]));
      } else {
        nodes.push(h('h1', { class: 'h1', text: 'Nhóm của bạn' }));
        teams.forEach(function (t) {
          var st = t.activeMeal ? STATUS[t.activeMeal.status] : null;
          nodes.push(L9.link('#/t/' + t.id, { class: 'card team-card' }, [
            h('div', { class: 'row sb' }, [
              h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: t.name }), h('div', { class: 'muted', text: t.memberCount + ' người, bạn là ' + t.myName })]),
              L9.ico('chev', 20),
            ]),
            h('div', { class: 'chips' }, [
              st ? L9.chip(st[0] + (t.activeMeal.venue_name ? ': ' + t.activeMeal.venue_name : ''), st[1]) : null,
              t.owe > 0 ? L9.chip('Bạn còn nợ ' + L9.vnd(t.owe), 'warn') : null,
              t.owed > 0 ? L9.chip('Được nợ ' + L9.vnd(t.owed), 'ok') : null,
            ]),
          ]));
        });
      }
      var accCard = accountCard(acc);
      if (accCard && teams.length) nodes.push(accCard);   // đã có nhóm: ngay dưới danh sách nhóm
      var createCard = h('div', { class: 'card' }, [h('h2', { text: 'Tạo nhóm mới' }), createForm()]);
      if (teams.length) {
        var wrap = h('div', { class: 'hidden' }, [createCard]);
        nodes.push(h('div', {}, [
          L9.btn('Tạo nhóm mới', 'ghost block', function (e) { var hid = wrap.classList.toggle('hidden'); e.currentTarget.setAttribute('aria-expanded', String(!hid)); }, { 'aria-expanded': 'false' }),
          wrap,
        ]));
      } else nodes.push(createCard);

      var code = L9.text({ placeholder: 'Dán link hoặc mã mời', autocapitalize: 'characters', maxlength: 120 });
      var cerr = h('div', { class: 'hint err hidden', role: 'alert' });
      var go = L9.btn('Vào nhóm', 'ghost block', function () {
        var c = codeFrom(code.value);
        if (!c) { cerr.textContent = 'Mã mời gồm 10 ký tự. Hãy dán lại link người tạo nhóm gửi bạn.'; cerr.className = 'hint err'; code.focus(); return; }
        L9.go('#/join/' + c);
      });
      nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Bạn có mã mời?' }), h('form', { onsubmit: function (e) { e.preventDefault(); } }, [L9.field('Link hoặc mã mời', code), cerr, h('div', { class: 'mt' }, [go])])]));
      if (accCard && !teams.length) nodes.push(accCard);   // người mới: không đẩy form tạo nhóm xuống, thẻ nằm cuối
      L9.mount(nodes);
    }, function (e) { L9.loadError(e, L9.home); });
  };

  L9.join = function (code) {
    L9.frame({ title: 'Vào nhóm', back: '#/' });
    L9.skeleton();
    code = String(code).toUpperCase();
    L9.get('api/join/' + code).then(function (p) {
      if (p.alreadyMember) { L9.go('#/t/' + p.teamId); return; }
      if (p.full) { L9.mount([L9.empty('Nhóm đã đủ người', 'Hỏi chủ nhóm xem có thể xóa bớt thành viên không.', L9.link('#/', { class: 'btn primary' }, ['Về trang chủ']))]); return; }
      var name = L9.text({ placeholder: 'Tên mọi người sẽ thấy', value: L9.store('myname') || '', autocapitalize: 'words' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var btn = L9.btn('Vào nhóm', 'primary block', function () {
        err.className = 'hint err hidden';
        var n = name.value.trim();
        if (!n) { err.textContent = 'Hãy nhập tên của bạn để mọi người nhận ra.'; err.className = 'hint err'; name.focus(); return; }
        return L9.busy(btn, function () {
          return L9.post('api/join/' + code, { name: n }, { idem: 'join:' + code }).then(function (r) {
            L9.store('myname', n);
            L9.toast('Chào mừng bạn vào nhóm!');
            L9.go('#/t/' + r.team.id);
          }, function (e) {
            if (e.code === 'name_taken') { err.textContent = e.message; err.className = 'hint err'; name.focus(); return; }
            throw e;
          });
        });
      });
      L9.mount([
        h('div', { class: 'hero' }, [
          h('div', { class: 'hero-ico' }, [L9.ico('users', 40, 1.8)]),
          h('p', { class: 'sub', text: 'Bạn được mời vào nhóm' }),
          h('h1', { class: 'h1', text: p.name }),
          h('p', { class: 'muted', text: p.memberCount + ' người đang ở trong nhóm' }),
        ]),
        h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); } }, [
          L9.field('Tên của bạn', name, 'Không cần mật khẩu. Trình duyệt này sẽ nhớ bạn.'), err, h('div', { class: 'mt' }, [btn]),
        ]),
      ]);
    }, function (e) {
      L9.setCta(null);
      var bad = e.status === 404;
      L9.mount([L9.empty(bad ? 'Mã mời không dùng được' : 'Chưa tải được', bad ? 'Link có thể bị sai hoặc chủ nhóm đã đổi mã mời. Hãy xin người tạo nhóm một link mới.' : e.message,
        h('div', { class: 'btn-row center' }, [bad ? L9.link('#/', { class: 'btn primary' }, ['Về trang chủ']) : L9.btn('Thử lại', 'primary', function () { L9.join(code); })]))]);
    });
  };
})();
