/* 9swap: trang vào (danh sách cộng đồng của tôi), tạo cộng đồng, vào bằng mã mời, quy tắc */
(function () {
  'use strict';
  var S9 = window.S9, h = S9.h;

  S9.RULES_BANNED = [
    'Thuốc kê đơn, thuốc kích dục, chất gây nghiện, ma túy, thuốc lá điện tử',
    'Vũ khí, súng đạn, dao nhọn, pháo nổ, chất nổ, hóa chất nguy hiểm',
    'Động vật hoang dã, sản phẩm từ động vật hoang dã (ngà voi, sừng tê giác...)',
    'Hàng giả, hàng nhái, giấy tờ giả, tài khoản hay dữ liệu cá nhân',
    'Đồ ăn đã hết hạn, hỏng hoặc không rõ nguồn gốc (đồ ăn sắp hết hạn chỉ để tặng, ghi rõ hạn dùng)',
    'Đồ ăn cắp, hàng không thuộc về bạn, tin lừa đảo hoặc quảng cáo',
  ];
  S9.RULES_SAFE = [
    'Hẹn gặp ở nơi công cộng, đông người như sảnh tòa nhà, quầy lễ tân, căng tin; ưu tiên ban ngày hoặc giờ làm việc.',
    'Kiểm tra đồ kỹ trước khi nhận. Đồ điện: thử bật; đồ ăn: xem hạn dùng.',
    'Không chuyển tiền trước khi thấy đồ. 9swap không giữ tiền, không bảo hiểm giao dịch.',
    'Đừng gửi địa chỉ nhà, số CCCD hay mã OTP. Thấy lạ hãy báo cáo tin đó cho chủ cộng đồng.',
  ];

  function rulesNodes() {
    return [
      h('div', { class: 'card' }, [
        h('h2', { text: 'Không đăng những thứ này' }),
        h('ul', { class: 'rule-list' }, S9.RULES_BANNED.map(function (t) { return h('li', { text: t }); })),
      ]),
      h('div', { class: 'card safety' }, [
        h('h2', { text: 'Gặp mặt an toàn' }),
        h('ul', { class: 'rule-list' }, S9.RULES_SAFE.map(function (t) { return h('li', { text: t }); })),
      ]),
      h('div', { class: 'card' }, [
        h('h2', { text: 'Cách hoạt động' }),
        h('ul', { class: 'rule-list' }, [
          h('li', { text: 'Tin đăng tự ẩn sau ' + S9.meta.limits.listingDays + ' ngày; bạn gia hạn được nếu vẫn còn đồ.' }),
          h('li', { text: 'Tin nhắn trong tin đăng là riêng tư giữa bạn và người đăng. Chủ cộng đồng chỉ đọc phần bị báo cáo.' }),
          h('li', { text: 'Chủ cộng đồng có quyền gỡ tin và khóa người vi phạm.' }),
          h('li', { text: 'Điểm uy tín chỉ là số lần bạn đã cho tặng, trao đổi hay bán thành công trong cộng đồng.' }),
        ]),
      ]),
    ];
  }

  S9.rules = function (backHash) {
    S9.frame({ title: 'Quy tắc cộng đồng', back: backHash || '#/' });
    S9.mount(rulesNodes());
  };

  function agreeBox() {
    var cb = h('input', { type: 'checkbox', id: 'agree' });
    var node = h('label', { class: 'check mt', for: 'agree' }, [cb, h('span', {}, ['Tôi đã đọc và đồng ý với ', S9.link('#/rules', { text: 'quy tắc cộng đồng' }), ' (không đăng đồ cấm, gặp mặt an toàn).'])]);
    return { node: node, checked: function () { return cb.checked; } };
  }

  // ---------- trang chủ ----------
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
        h('p', { class: 'muted', text: 'Đăng nhập để giữ cộng đồng của bạn và dùng trên máy khác. Không đăng nhập vẫn dùng bình thường.' }),
        h('div', { class: 'btn-row' }, [
          S9.btn('Đăng nhập', 'primary', function () { location.assign(inUrl); }),
          S9.btn('Đăng ký', 'ghost', function () { location.assign(upUrl); }),
        ]),
      ]);
    }
    var kids = [h('h2', { text: 'Tài khoản 9app' }), h('p', { text: 'Đã đăng nhập: ' + (acc.user && acc.user.displayName ? acc.user.displayName : 'bạn') })];
    if (acc.claimable && acc.claimable.length) {
      kids.push(h('p', { class: 'muted', text: 'Trên máy này có ' + acc.claimable.length + ' cộng đồng chưa gắn vào tài khoản: ' + acc.claimable.map(function (x) { return x.communityName; }).join(', ') + '.' }));
      var claim = S9.btn('Gắn vào tài khoản', 'primary block', function () {
        return S9.busy(claim, function () {
          return S9.post('api/account/claim', {}).then(function (r) {
            S9.toast('Đã gắn ' + (r.claimed ? r.claimed.length : 0) + ' cộng đồng vào tài khoản của bạn.');
            S9.home();
          });
        });
      });
      kids.push(claim);
    }
    if (acc.conflicts && acc.conflicts.length) {
      kids.push(h('p', { class: 'muted', text: 'Bạn đã tham gia ' + acc.conflicts.map(function (x) { return x.communityName; }).join(', ') + ' bằng tài khoản này, nên thành viên ẩn danh tương ứng trên máy này được giữ riêng.' }));
    }
    kids.push(h('div', { class: 'btn-row' }, [
      h('a', { class: 'btn ghost', href: acc.loginPath + '#/tai-khoan' }, ['Quản lý tài khoản']),
      S9.btn('Đăng xuất', 'ghost', function (e) {
        return S9.busy(e.currentTarget, function () {
          return fetch(acc.loginPath + 'api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': '9id', 'content-type': 'application/json' }, body: '{}' })
            .then(function (r) { if (!r.ok) throw new Error('logout'); location.reload(); }).catch(function () { S9.toast('Chưa đăng xuất được, hãy thử lại.', 'err'); });
        });
      }),
    ]));
    return h('div', { class: 'card', id: 'acc-card' }, kids);
  }

  S9.home = function () {
    S9.frame({ title: '9swap' });
    S9.pollStop();
    S9.skeleton();
    Promise.all([S9.get('api/me'), S9.get('api/account').catch(function () { return null; })]).then(function (rs) {
      var d = rs[0], acc = rs[1];
      var list = d.communities;
      var nodes = [];
      var accCard = accountCard(acc);
      if (!list.length) {
        nodes.push(h('div', { class: 'hero' }, [
          h('div', { class: 'hero-ico' }, [S9.ico('swap', 42, 1.8)]),
          h('h1', { class: 'h1', text: 'Cho tặng, trao đổi đồ cũ' }),
          h('p', { class: 'sub mt', text: 'Ngay trong công ty, tòa nhà hay khu phố của bạn. Đồ còn dùng được thì đừng bỏ đi.' }),
        ]));
        nodes.push(h('div', { class: 'card' }, [
          h('h2', { text: 'Bắt đầu' }),
          h('p', { class: 'muted', text: 'Không cần tài khoản. Có mã mời thì nhập mã; chưa có thì tạo cộng đồng và gửi mã cho hàng xóm, đồng nghiệp.' }),
          h('div', { class: 'btn-row' }, [S9.btn('Nhập mã mời', 'primary', function () { joinSheet(); }), S9.btn('Tạo cộng đồng', 'ghost', function () { createSheet(); })]),
        ]));
      } else {
        nodes.push(h('h1', { class: 'h1', text: 'Cộng đồng của bạn' }));
        list.forEach(function (c) {
          nodes.push(S9.link('#/c/' + c.id, { class: 'card row-card' }, [
            h('div', { class: 'avatar' }, [(c.name || '?').slice(0, 1).toUpperCase()]),
            h('div', { class: 'col' }, [
              h('div', { class: 'b trunc', text: c.name }),
              h('div', { class: 'muted small', text: (S9.meta.communityKinds[c.kind] || '') + ' · ' + c.memberCount + ' người · bạn là ' + c.myName }),
            ]),
            c.banned ? S9.chip('Bị khóa', 'bad') : (c.unread ? S9.chip(c.unread + ' mới', 'brand') : null),
            S9.ico('chev', 20),
          ]));
        });
        if (accCard) nodes.push(accCard);   // đã có cộng đồng: ngay dưới danh sách
        nodes.push(h('div', { class: 'btn-row' }, [S9.btn('Nhập mã mời', 'ghost', function () { joinSheet(); }), S9.btn('Tạo cộng đồng', 'ghost', function () { createSheet(); })]));
      }
      if (accCard && !list.length) nodes.push(accCard);   // người mới: không đẩy phần Bắt đầu xuống, thẻ nằm cuối
      nodes.push(h('div', { class: 'center mt2' }, [S9.link('#/rules', { class: 'linkbtn', text: 'Quy tắc và an toàn khi gặp mặt' })]));
      S9.mount(nodes);
    }, function (e) { S9.loadError(e, S9.home); });
  };

  function joinSheet() {
    S9.sheet('Nhập mã mời', function (body, close) {
      var code = S9.text({ maxlength: 40, placeholder: 'Mã 10 ký tự hoặc dán cả link', autocapitalize: 'characters', inputmode: 'text' });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        var m = code.value.trim().match(/([A-Za-z0-9]{10})\/?$/);
        if (!m) { S9.toast('Mã mời gồm 10 ký tự, kiểm tra lại nhé', 'err'); return; }
        close(); S9.go('#/join/' + m[1].toUpperCase());
      } }, [S9.field('Mã mời', code), h('div', { class: 'btn-row' }, [S9.btn('Tiếp tục', 'primary block', null, { type: 'submit' })])]);
      body.appendChild(form);
    });
  }

  function createSheet() {
    S9.sheet('Tạo cộng đồng', function (body, close) {
      var name = S9.text({ placeholder: 'Ví dụ: Tòa Sunrise, Công ty ABC' });
      var kind = S9.select(S9.meta.communityKinds, 'toa_nha');
      var me = S9.text({ placeholder: 'Tên mọi người sẽ thấy, ví dụ: Lan P1203', value: S9.store('myname') || '' });
      var agree = agreeBox();
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        var btn = form.querySelector('.btn.primary');
        if (!agree.checked()) { S9.toast('Hãy đồng ý với quy tắc cộng đồng', 'err'); return; }
        S9.busy(btn, function () {
          return S9.post('api/communities', { name: name.value, kind: kind.value, myName: me.value, agree: true }, { idem: 'mkcomm' }).then(function (r) {
            S9.store('myname', me.value.trim());
            close(); S9.go('#/c/' + r.community.id + '/settings');
            S9.toast('Đã tạo cộng đồng. Gửi mã mời cho mọi người nhé.');
          });
        });
      } }, [
        S9.field('Tên cộng đồng', name), S9.field('Loại', kind), S9.field('Tên của bạn', me), agree.node,
        h('div', { class: 'btn-row' }, [S9.btn('Tạo cộng đồng', 'primary block', null, { type: 'submit' })]),
      ]);
      body.appendChild(form);
    });
  }

  // ---------- vào bằng mã mời ----------
  S9.join = function (code) {
    S9.frame({ title: 'Vào cộng đồng', back: '#/' });
    S9.pollStop();
    S9.skeleton();
    S9.get('api/join/' + encodeURIComponent(code)).then(function (info) {
      if (info.alreadyMember) { S9.go('#/c/' + info.communityId); return; }
      if (info.banned) { S9.mount([S9.notice('bad', 'Bạn đã bị chủ cộng đồng khóa', 'Hãy liên hệ chủ cộng đồng nếu bạn nghĩ đây là nhầm lẫn.')]); return; }
      var name = S9.text({ placeholder: 'Tên mọi người sẽ thấy, ví dụ: Lan P1203', value: S9.store('myname') || '' });
      var agree = agreeBox();
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        var btn = form.querySelector('.btn.primary');
        if (!agree.checked()) { S9.toast('Hãy đồng ý với quy tắc cộng đồng', 'err'); return; }
        S9.busy(btn, function () {
          return S9.post('api/join/' + encodeURIComponent(code), { name: name.value, agree: true }, { idem: 'join' + code }).then(function (r) {
            S9.store('myname', name.value.trim());
            S9.go('#/c/' + r.community.id);
          });
        });
      } }, [
        S9.field('Tên của bạn', name, 'Dùng tên thật hoặc số phòng để hàng xóm nhận ra nhau.'), agree.node,
        info.full ? S9.notice('warn', 'Cộng đồng đã đủ người', 'Hãy nhờ chủ cộng đồng.') : null,
        h('div', { class: 'btn-row' }, [S9.btn('Vào cộng đồng', 'primary block', null, { disabled: info.full })]),
      ]);
      S9.mount([
        h('div', { class: 'hero' }, [h('div', { class: 'hero-ico sm' }, [S9.ico('users', 30)]), h('h1', { class: 'h1', text: info.name }), h('p', { class: 'sub', text: (S9.meta.communityKinds[info.kind] || '') + ' · ' + info.memberCount + ' người' })]),
        h('div', { class: 'card' }, [form]),
      ]);
    }, function (e) {
      S9.mount([S9.empty('Mã mời không dùng được', e.message, h('div', { class: 'btn-row center' }, [S9.link('#/', { class: 'btn primary' }, ['Về trang chủ'])]))]);
    });
  };
})();
