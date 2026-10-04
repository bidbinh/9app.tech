/* 9lunch: trang nhóm, cài đặt nhóm, sổ nợ, lịch sử và thống kê. */
(function () {
  'use strict';
  var L9 = window.L9; var h = L9.h;

  L9.inviteLink = function (code) { return new URL('t/' + code, document.baseURI).href; };

  function shareInvite(team) {
    var url = L9.inviteLink(team.inviteCode);
    var text = 'Vào nhóm cơm trưa "' + team.name + '" trên 9lunch nhé: ' + url;
    if (navigator.share) navigator.share({ title: '9lunch', text: text, url: url }).catch(function () { /* người dùng đóng hộp thoại */ });
    else L9.copy(text, 'Đã sao chép link mời, dán vào Zalo cho mọi người nhé');
  }

  // Thẻ chuyển khoản: QR + thông tin tài khoản. o: { amount, name, pay, expired }
  L9.qrCard = function (o) {
    var pay = o.pay;
    return h('div', { class: 'qrcard' }, [
      h('img', { class: 'qr', src: pay.qrUrl, alt: 'Mã QR chuyển ' + L9.vnd(o.amount) + ' cho ' + o.name, width: 240, height: 240 }),
      h('div', { class: 'qr-amount', text: L9.vnd(o.amount) }),
      h('div', { class: 'muted center', text: 'Mở app ngân hàng, quét mã. Số tiền và nội dung đã điền sẵn.' }),
      h('dl', { class: 'bank' }, [
        h('dt', { text: 'Ngân hàng' }), h('dd', { text: L9.bankName(pay.bin) }),
        h('dt', { text: 'Số tài khoản' }), h('dd', {}, [h('span', { class: 'mono', text: pay.account }), h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Sao chép số tài khoản', onclick: function () { L9.copy(pay.account, 'Đã sao chép số tài khoản'); } }, [L9.ico('copy', 18)])]),
        h('dt', { text: 'Chủ tài khoản' }), h('dd', { text: pay.holder }),
        h('dt', { text: 'Nội dung' }), h('dd', {}, [h('span', { class: 'mono', text: pay.content }), h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Sao chép nội dung chuyển khoản', onclick: function () { L9.copy(pay.content, 'Đã sao chép nội dung chuyển khoản'); } }, [L9.ico('copy', 18)])]),
      ]),
      h('div', { class: 'btn-row' }, [
        h('a', { class: 'btn ghost', href: pay.qrUrl, download: '9lunch-qr.png' }, [L9.ico('download', 18), ' Lưu ảnh QR']),
        L9.btn('Sao chép số tiền', 'ghost', function () { L9.copy(String(o.amount), 'Đã sao chép số tiền'); }),
      ]),
    ]);
  };

  // Sheet nhập tài khoản nhận tiền của riêng mình
  L9.bankSheet = function (teamId, cur, done) {
    L9.sheet('Tài khoản nhận tiền của bạn', function (body, close) {
      var f = L9.bankForm(cur);
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = L9.btn('Lưu tài khoản', 'primary block', function () {
        err.className = 'hint err hidden';
        var b; try { b = f.read(); } catch (e) { err.textContent = e.message; err.className = 'hint err'; return; }
        if (!b.account && !(cur && cur.account)) { err.textContent = 'Hãy chọn ngân hàng và nhập số tài khoản.'; err.className = 'hint err'; return; }
        return L9.busy(save, function () {
          return L9.post('api/teams/' + teamId + '/me', { bank: b }).then(function () { L9.toast(b.account ? 'Đã lưu tài khoản' : 'Đã xóa tài khoản'); close(); if (done) done(); });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Chỉ thành viên cần chuyển tiền cho bạn mới thấy. Bạn chỉ cần nhập một lần, lần sau đến lượt ứng tiền sẽ dùng lại.' }));
      body.appendChild(f.node); body.appendChild(err); body.appendChild(h('div', { class: 'mt' }, [save]));
      if (cur && cur.account) body.appendChild(L9.btn('Xóa tài khoản đã lưu', 'linkbtn danger-t', function () { f.node.querySelectorAll('input').forEach(function (i) { i.value = ''; }); f.node.querySelector('select').value = ''; save.click(); }));
    });
  };

  // ---------- trang nhóm ----------
  L9.team = function (id) {
    L9.frame({ title: 'Nhóm', back: '#/' });
    L9.skeleton();
    L9.live({ fetch: function () { return L9.get('api/teams/' + id); }, render: render, every: 8000 }).catch(function (e) { L9.loadError(e, function () { L9.team(id); }); });

    function render(d) {
      var t = d.team;
      L9.frame({ title: t.name, back: '#/', right: [L9.link('#/t/' + id + '/settings', { class: 'icon-btn', 'aria-label': 'Cài đặt nhóm' }, [L9.ico('gear', 22)])] });
      var nodes = [];
      if (!d.me.bank) {
        nodes.push(L9.notice('info', 'Chưa có tài khoản nhận tiền', 'Khi đến lượt bạn ứng tiền, mọi người cần số tài khoản để chuyển. Nhập một lần là dùng mãi.',
          h('div', { class: 'mt' }, [L9.btn('Nhập tài khoản', 'primary sm', function () { L9.bankSheet(id, null, function () { L9.refresh(); L9.rerenderSoon(); }); })])));
      }
      // bữa ăn đang diễn ra
      var actives = d.activeMeals || (d.activeMeal ? [d.activeMeal] : []);
      actives.forEach(function (am) {
        var st = L9.STATUS[am.status]; var K = L9.KINDS[am.kind] || L9.KINDS.trua;
        nodes.push(L9.link('#/m/' + am.id, { class: 'card meal-card' }, [
          h('div', { class: 'row sb' }, [h('div', { class: 'muted row' }, [L9.ico(K.icon, 18), h('span', { class: 'ml', text: K.label + ' · ' + L9.dayLabel(am.day) })]), L9.chip(st[0], st[1])]),
          h('div', { class: 'meal-t', text: am.venueName || 'Chưa chốt quán' }),
          h('div', { class: 'muted', text: am.payerName ? 'Người ứng tiền: ' + am.payerName : 'Chưa có người ứng tiền' }),
          h('div', { class: 'btn primary block mt', text: am.status === 'thanh_toan' ? 'Xem khoản cần trả' : 'Vào bữa ăn' }),
        ]));
      });
      nodes.push(newMealCard(id, actives));
      // nợ của tôi
      if (d.myDebts.length) {
        var tot = d.myDebts.reduce(function (s, x) { return s + x.amount; }, 0);
        nodes.push(h('div', { class: 'sec' }, ['Bạn đang nợ ', h('b', { text: L9.vnd(tot) })]));
        d.myDebts.forEach(function (x) {
          nodes.push(L9.link('#/m/' + x.mealId, { class: 'card row-card' }, [
            h('div', { class: 'col' }, [
              h('div', { class: 'b trunc', text: 'Chuyển cho ' + x.payeeName }),
              h('div', { class: 'muted trunc', text: (x.venueName || 'Bữa trưa') + ', ' + L9.dayLabel(x.day) }),
              x.payeeChanged ? h('div', { class: 'warn-t', text: 'Đã đổi người nhận, dùng QR mới' }) : null,
            ]),
            h('div', { class: 'right' }, [h('div', { class: 'b', text: L9.vnd(x.amount) }), L9.chip(x.status === 'da_chuyen' ? 'Chờ xác nhận' : 'Chưa chuyển', x.status === 'da_chuyen' ? 'info' : 'warn')]),
          ]));
        });
      }
      if (d.owedToMe.length) {
        var tot2 = d.owedToMe.reduce(function (s, x) { return s + x.amount; }, 0);
        nodes.push(h('div', { class: 'sec' }, [d.owedToMe.length + ' người nợ bạn ', h('b', { text: L9.vnd(tot2) })]));
        d.owedToMe.slice(0, 6).forEach(function (x) {
          nodes.push(L9.link('#/m/' + x.mealId, { class: 'card row-card' }, [
            h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: x.memberName }), h('div', { class: 'muted trunc', text: (x.venueName || 'Bữa trưa') + ', ' + L9.dayLabel(x.day) })]),
            h('div', { class: 'right' }, [h('div', { class: 'b', text: L9.vnd(x.amount) }), L9.chip(x.status === 'da_chuyen' ? 'Báo đã chuyển' : 'Chưa trả', x.status === 'da_chuyen' ? 'info' : 'warn')]),
          ]));
        });
        if (d.owedToMe.length > 6) nodes.push(h('div', { class: 'muted center', text: 'và ' + (d.owedToMe.length - 6) + ' khoản nữa, xem ở Sổ nợ nhóm' }));
      }
      nodes.push(L9.link('#/t/' + id + '/debts', { class: 'btn ghost block' }, [L9.ico('wallet', 18), ' Sổ nợ nhóm' + (d.nettingId ? ' (đang bù trừ)' : '')]));

      // thành viên
      nodes.push(h('div', { class: 'sec', text: 'Thành viên (' + d.members.length + ')' }));
      var card = h('div', { class: 'card' }, [
        h('div', { class: 'chips wrapchips' }, d.members.map(function (m) { return L9.chip(m.name + (m.role === 'chu' ? ' (chủ nhóm)' : '') + (m.isMe ? ' (bạn)' : ''), m.isMe ? 'brand' : ''); })),
      ]);
      if (d.members.length === 1) card.appendChild(h('p', { class: 'muted', text: 'Nhóm mới chỉ có mình bạn. Gửi link mời để mọi người cùng tham gia.' }));
      card.appendChild(h('div', { class: 'btn-row mt' }, [
        L9.btn('Mời bạn bè', 'primary', function () { shareInvite(t); }),
        L9.btn('Sao chép link', 'ghost', function () { L9.copy(L9.inviteLink(t.inviteCode), 'Đã sao chép link mời'); }),
      ]));
      nodes.push(card);

      nodes.push(h('div', { class: 'sec', text: 'Các bữa gần đây' }));
      if (!d.recentMeals.length) nodes.push(L9.empty('Chưa có bữa nào', 'Các bữa đã ăn sẽ hiện ở đây.'));
      d.recentMeals.slice(0, 5).forEach(function (m) {
        var s = L9.STATUS[m.status];
        nodes.push(L9.link('#/m/' + m.id, { class: 'card row-card' }, [
          h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: m.venueName || 'Chưa chốt quán' }), h('div', { class: 'muted trunc', text: (L9.KINDS[m.kind] ? L9.KINDS[m.kind].label + ' · ' : '') + L9.dayLabel(m.day) + (m.payerName ? ', ' + m.payerName + ' ứng' : '') })]),
          L9.chip(s[0], s[1]),
        ]));
      });
      nodes.push(L9.link('#/t/' + id + '/stats', { class: 'btn ghost block' }, ['Lịch sử và thống kê']));
      L9.mount(nodes);
    }
    function newMealCard(teamId, actives) {
      var kind = L9.store('kind'); if (L9.KIND_ORDER.indexOf(kind) < 0) kind = 'trua';
      var title = h('h2', {}); var hint = h('p', { class: 'muted' }); var icon = h('div', { class: 'hero-ico sm' });
      var group = h('div', { class: 'kinds', role: 'radiogroup', 'aria-label': 'Loại bữa' });
      var go = h('button', { class: 'btn primary block', type: 'button' });
      function paint() {
        var K = L9.KINDS[kind];
        L9.clear(icon); icon.appendChild(L9.ico(K.icon, 34, 1.8));
        title.textContent = K.ask; hint.textContent = K.hint;
        var exist = actives.filter(function (a) { return a.kind === kind && a.status !== 'thanh_toan'; })[0];
        go.textContent = K.create;
        go.className = exist ? 'btn primary block hidden' : 'btn primary block';
        hint.textContent = exist ? 'Nhóm đã có bữa này đang diễn ra, mở ở thẻ phía trên.' : K.hint;
        go.onclick = function () {
          if (exist) { L9.go('#/m/' + exist.id); return; }
          L9.store('kind', kind);
          return L9.busy(go, function () {
            return L9.post('api/teams/' + teamId + '/meals', { kind: kind }, { idem: 'meal:' + teamId + ':' + kind }).then(function (r) { L9.go('#/m/' + r.mealId); }, function (e) {
              if (e.code === 'meal_exists' && e.details) { L9.go('#/m/' + e.details.mealId); return; }
              throw e;
            });
          });
        };
        group.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-kind') === kind; b.className = 'kindbtn' + (on ? ' on' : ''); b.setAttribute('aria-checked', String(on)); });
      }
      L9.KIND_ORDER.forEach(function (k) {
        group.appendChild(h('button', { type: 'button', class: 'kindbtn', role: 'radio', 'data-kind': k, 'aria-checked': 'false', onclick: function () { kind = k; paint(); } }, [L9.ico(L9.KINDS[k].icon, 22), h('span', { text: L9.KINDS[k].label })]));
      });
      paint();
      return h('div', { class: 'card center' }, [icon, title, hint, group, h('div', { class: 'mt' }, [go])]);
    }
    L9.rerenderSoon = function () { setTimeout(function () { L9.refresh(); }, 300); };
  };

  // ---------- cài đặt nhóm ----------
  L9.teamSettings = function (id) {
    L9.frame({ title: 'Cài đặt', back: '#/t/' + id });
    L9.skeleton();
    L9.live({ fetch: function () { return L9.get('api/teams/' + id); }, render: render, every: 15000 }).catch(function (e) { L9.loadError(e, function () { L9.teamSettings(id); }); });

    function render(d) {
      var t = d.team; var owner = d.me.role === 'chu';
      var nodes = [];
      // hồ sơ của tôi
      var nm = L9.text({ value: d.me.name, autocapitalize: 'words' });
      var nmSave = L9.btn('Lưu tên', 'ghost block', function () {
        var v = nm.value.trim();
        if (!v) { L9.toast('Tên không được để trống', 'err'); return; }
        return L9.busy(nmSave, function () { return L9.post('api/teams/' + id + '/me', { name: v }).then(function () { L9.toast('Đã đổi tên'); L9.refresh(); }); });
      });
      nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Hồ sơ của bạn' }), L9.field('Tên hiển thị', nm, 'Đổi tên không ảnh hưởng sổ nợ hay lịch sử'), h('div', { class: 'mt' }, [nmSave]),
        h('div', { class: 'mt2 b', text: 'Tài khoản nhận tiền' }),
        d.me.bank ? h('p', { text: L9.bankName(d.me.bank.bin) + ' · ' + d.me.bank.account + ' · ' + d.me.bank.holder }) : h('p', { class: 'muted', text: 'Chưa có. Cần khi bạn ứng tiền cho cả nhóm.' }),
        L9.btn(d.me.bank ? 'Sửa tài khoản' : 'Nhập tài khoản', 'ghost block', function () { L9.bankSheet(id, d.me.bank, function () { L9.refresh(); }); }),
      ]));
      // nhóm
      var link = L9.inviteLink(t.inviteCode);
      var inv = [h('h2', { text: 'Nhóm' }), h('div', { class: 'muted', text: 'Link mời' }), h('div', { class: 'mono wrapbreak', text: link }),
        h('div', { class: 'btn-row mt' }, [L9.btn('Sao chép link', 'ghost', function () { L9.copy(link, 'Đã sao chép link mời'); })])];
      if (owner) {
        inv[3].appendChild(L9.btn('Đổi mã mời', 'ghost', function () {
          L9.confirm({ title: 'Đổi mã mời?', text: 'Link cũ sẽ không dùng được nữa. Thành viên hiện tại vẫn ở lại trong nhóm.', ok: 'Đổi mã' }).then(function (y) {
            if (y) L9.post('api/teams/' + id + '/rotate-code').then(function () { L9.toast('Đã đổi mã mời'); L9.refresh(); }, L9.fail);
          });
        }));
        var tn = L9.text({ value: t.name });
        var tnSave = L9.btn('Lưu tên nhóm', 'ghost block', function () {
          var v = tn.value.trim(); if (!v) { L9.toast('Tên nhóm không được để trống', 'err'); return; }
          return L9.busy(tnSave, function () { return L9.post('api/teams/' + id, { name: v }).then(function () { L9.toast('Đã đổi tên nhóm'); L9.refresh(); }); });
        });
        var r5 = h('input', { type: 'checkbox', id: 'r5', checked: t.round500, onchange: function () {
          L9.post('api/teams/' + id, { round500: r5.checked }).then(function () { L9.toast(r5.checked ? 'Đã bật làm tròn lên 500 đ' : 'Đã tắt làm tròn'); }, function (e) { r5.checked = !r5.checked; L9.fail(e); });
        } });
        inv.push(L9.field('Tên nhóm', tn), h('div', { class: 'mt' }, [tnSave]));
        inv.push(h('label', { class: 'check mt2', for: 'r5' }, [r5, h('span', {}, [h('b', { text: 'Làm tròn phần của mỗi người lên 500 đ' }), h('br'), h('span', { class: 'muted', text: 'Phần chênh thuộc về người ứng tiền. Áp dụng cho các bữa chia tiền từ nay.' })])]));
      }
      nodes.push(h('div', { class: 'card' }, inv));
      // thành viên
      var ml = h('div', { class: 'card' }, [h('h2', { text: 'Thành viên' })]);
      d.members.forEach(function (m) {
        ml.appendChild(h('div', { class: 'row sb member-row' }, [
          h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: m.name + (m.isMe ? ' (bạn)' : '') }), h('div', { class: 'muted', text: (m.role === 'chu' ? 'Chủ nhóm' : 'Thành viên') + (m.hasBank ? ', đã có tài khoản nhận tiền' : '') })]),
          owner && !m.isMe ? h('div', { class: 'row' }, [
            L9.btn('Làm chủ nhóm', 'linkbtn', function () {
              L9.confirm({ title: 'Chuyển quyền chủ nhóm?', text: m.name + ' sẽ là chủ nhóm, bạn trở thành thành viên thường.', ok: 'Chuyển quyền' }).then(function (y) {
                if (y) L9.post('api/teams/' + id + '/members/' + m.id + '/make-owner').then(function () { L9.toast('Đã chuyển quyền'); L9.refresh(); }, L9.fail);
              });
            }),
            L9.btn('Xóa', 'linkbtn danger-t', function () {
              L9.confirm({ title: 'Xóa ' + m.name + ' khỏi nhóm?', text: 'Bạn ấy sẽ không vào được nhóm nữa (có thể vào lại bằng link mời). Lịch sử cũ được giữ.', ok: 'Xóa khỏi nhóm', danger: true }).then(function (y) {
                if (y) L9.post('api/teams/' + id + '/members/' + m.id + '/remove').then(function () { L9.toast('Đã xóa thành viên'); L9.refresh(); }, L9.fail);
              });
            }),
          ]) : null,
        ]));
      });
      nodes.push(ml);
      // nguy hiểm
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: 'Thiết bị này' }),
        h('p', { class: 'muted', text: 'Dùng máy chung hoặc máy công ty? Hãy thoát khỏi thiết bị này khi dùng xong. Trình duyệt sẽ quên bạn; muốn vào lại, nhờ chủ nhóm xóa tên cũ rồi vào bằng link mời.' }),
        L9.btn('Thoát khỏi thiết bị này', 'ghost block', function () {
          L9.confirm({ title: 'Thoát khỏi thiết bị này?', text: 'Máy này sẽ không còn vào được các nhóm của bạn. Tên của bạn vẫn ở trong nhóm cho tới khi chủ nhóm xóa. Nên rời nhóm trước nếu bạn không dùng nữa.', ok: 'Thoát khỏi thiết bị', danger: true }).then(function (y) {
            if (y) L9.post('api/logout').then(function () { L9.toast('Đã thoát khỏi thiết bị này'); L9.go('#/'); }, L9.fail);
          });
        }),
      ]));
      var danger = [h('h2', { text: 'Rời hoặc xóa' })];
      danger.push(L9.btn('Rời nhóm', 'ghost block', function () {
        L9.confirm({ title: 'Rời nhóm "' + t.name + '"?', text: 'Bạn cần trả hoặc nhận xong các khoản còn lại trước khi rời. Muốn vào lại thì dùng link mời.', ok: 'Rời nhóm', danger: true }).then(function (y) {
          if (y) L9.post('api/teams/' + id + '/leave').then(function () { L9.toast('Đã rời nhóm'); L9.go('#/'); }, L9.fail);
        });
      }));
      if (owner) {
        danger.push(h('div', { class: 'mt' }, [L9.btn('Xóa nhóm và toàn bộ dữ liệu', 'danger block', function () {
          L9.confirm({ title: 'Xóa nhóm "' + t.name + '"?', text: 'Toàn bộ thành viên, bữa ăn, sổ nợ của nhóm sẽ bị xóa vĩnh viễn, không khôi phục được. Hãy chắc rằng mọi người đã thanh toán xong.', ok: 'Xóa vĩnh viễn', danger: true }).then(function (y) {
            if (y) L9.del('api/teams/' + id).then(function () { L9.toast('Đã xóa nhóm'); L9.go('#/'); }, L9.fail);
          });
        })]));
      }
      nodes.push(h('div', { class: 'card' }, danger));
      L9.mount(nodes);
    }
  };

  // ---------- sổ nợ nhóm và bù trừ ----------
  L9.debts = function (id) {
    L9.frame({ title: 'Sổ nợ nhóm', back: '#/t/' + id });
    L9.skeleton();
    var netErr = null;
    L9.live({ fetch: function () { return L9.get('api/teams/' + id + '/debts'); }, render: render, every: 6000 }).catch(function (e) { L9.loadError(e, function () { L9.debts(id); }); });

    function transferRow(tr, nid) {
      var chip = tr.status === 'da_nhan' ? L9.chip('Đã nhận', 'ok') : tr.status === 'da_chuyen' ? L9.chip('Đã báo chuyển', 'info') : L9.chip('Chưa chuyển', 'warn');
      var box = h('div', { class: 'card' }, [
        h('div', { class: 'row sb' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: tr.fromName + ' chuyển cho ' + tr.toName }), h('div', { class: 'big', text: L9.vnd(tr.amount) })]), chip]),
      ]);
      if (tr.mine && tr.status !== 'da_nhan') {
        box.appendChild(L9.qrCard({ amount: tr.amount, name: tr.toName, pay: tr.pay }));
        if (tr.status === 'chua_tra') {
          var b = L9.btn('Tôi đã chuyển', 'primary block', function () { return L9.busy(b, function () { return L9.post('api/transfers/' + tr.id + '/paid').then(function () { L9.toast('Đã báo cho ' + tr.toName); L9.refresh(); L9.rerenderSoon2(); }); }); });
          box.appendChild(h('div', { class: 'mt' }, [b]));
        } else box.appendChild(h('p', { class: 'muted center', text: 'Đang chờ ' + tr.toName + ' xác nhận đã nhận.' }));
      }
      if (tr.toMe && tr.status !== 'da_nhan') {
        var row = h('div', { class: 'btn-row mt' }, []);
        var got = L9.btn('Đã nhận', 'primary', function () { return L9.busy(got, function () { return L9.post('api/transfers/' + tr.id + '/received').then(function (r) { L9.toast(r.done ? 'Đã bù trừ xong, các khoản gốc được đánh dấu đã thanh toán' : 'Đã ghi nhận'); L9.refresh(); }); }); });
        row.appendChild(got);
        if (tr.status === 'da_chuyen') {
          var un = L9.btn('Chưa thấy', 'ghost', function () { return L9.busy(un, function () { return L9.post('api/transfers/' + tr.id + '/unseen').then(function () { L9.refresh(); }); }); });
          row.appendChild(un);
        }
        box.appendChild(h('p', { class: 'muted', text: tr.status === 'da_chuyen' ? tr.fromName + ' báo đã chuyển. Kiểm tra tài khoản rồi bấm Đã nhận.' : 'Chờ ' + tr.fromName + ' chuyển. Nhận được tiền thì bấm Đã nhận.' }));
        box.appendChild(row);
      }
      return box;
    }
    L9.rerenderSoon2 = function () { setTimeout(function () { L9.refresh(); }, 400); };

    function render(d) {
      var nodes = [];
      var mine = d.balances.filter(function (b) { return b.memberId === d.me; })[0];
      if (mine && mine.net !== 0) nodes.push(L9.notice(mine.net < 0 ? 'warn' : 'ok', mine.net < 0 ? 'Bạn đang nợ ròng ' + L9.vnd(-mine.net) : 'Bạn đang được nợ ròng ' + L9.vnd(mine.net), 'Đã tính bù trừ các khoản qua lại giữa mọi bữa.'));
      if (netErr) nodes.push(L9.notice('bad', 'Chưa bù trừ được', netErr));

      if (d.netting) {
        nodes.push(h('div', { class: 'sec', text: 'Phiên bù trừ đang chạy' }));
        nodes.push(L9.notice('info', 'Chuyển ít lần hơn', 'Mỗi người chỉ chuyển theo danh sách dưới đây. Khi mọi khoản được xác nhận, các khoản gốc tự động chuyển thành "đã thanh toán qua bù trừ".'));
        d.netting.transfers.forEach(function (tr) { nodes.push(transferRow(tr, d.netting.id)); });
        if (d.netting.canCancel) nodes.push(L9.btn('Hủy phiên bù trừ', 'linkbtn danger-t', function () {
          L9.confirm({ title: 'Hủy phiên bù trừ?', text: 'Các khoản gốc trở lại như cũ, bạn vẫn trả riêng từng khoản được.', ok: 'Hủy phiên', danger: true }).then(function (y) {
            if (y) L9.post('api/nettings/' + d.netting.id + '/cancel').then(function () { L9.toast('Đã hủy phiên bù trừ'); L9.refresh(); }, L9.fail);
          });
        }));
      }
      if (!d.items.length) {
        nodes.push(L9.empty('Không ai nợ ai', 'Mọi khoản đều đã thanh toán. Sổ nợ sạch sẽ.', null));
        L9.mount(nodes); return;
      }
      if (!d.netting) {
        nodes.push(h('div', { class: 'sec', text: 'Ai nợ ai' }));
        d.pairs.forEach(function (p) {
          nodes.push(h('div', { class: 'card row-card' }, [
            h('div', { class: 'col' }, [h('div', { class: 'b', text: p.fromName + ' nợ ' + p.toName })]),
            h('div', { class: 'b', text: L9.vnd(p.amount) }),
          ]));
        });
        var liveN = d.items.filter(function (x) { return x.status === 'chua_tra' && !x.inNetting; }).length;
        if (d.canNet && (d.suggestions.length === 0 || d.suggestions.length < liveN)) {
          var go = L9.btn('Bắt đầu bù trừ', 'primary block', function () {
            return L9.busy(go, function () {
              return L9.post('api/teams/' + id + '/netting', {}, { idem: 'net:' + id }).then(function (r) { netErr = null; if (r && r.done) L9.toast('Đã bù trừ xong: ' + r.settled + ' khoản được đánh dấu thanh toán qua bù trừ'); L9.refresh(); }, function (e) {
                if (e.code === 'payee_no_bank' || e.code === 'nothing_to_net') { netErr = e.message; render(d); return; }
                throw e;
              });
            });
          });
          nodes.push(h('div', { class: 'card' }, [
            h('h2', { text: 'Gợi ý bù trừ' }),
            d.suggestions.length ? h('p', { text: 'Chỉ cần ' + d.suggestions.length + ' lần chuyển thay vì ' + liveN + ' lần:' }) : h('p', { text: 'Các khoản nợ qua lại bù nhau đúng bằng 0. Không ai phải chuyển tiền, chỉ cần đánh dấu là đã thanh toán qua bù trừ.' }),
            h('ul', { class: 'plain' }, d.suggestions.map(function (s) { return h('li', { text: s.fromName + ' chuyển cho ' + s.toName + ' ' + L9.vnd(s.amount) }); })),
            h('p', { class: 'muted', text: (d.suggestions.length ? 'Mỗi người nhận một mã QR riêng. ' : '') + ' Không xóa dữ liệu gốc: các khoản được đánh dấu "thanh toán qua bù trừ" và có lưu vết.' }),
            go,
          ]));
        }
      }
      if (d.waiting && d.waiting.length) {
        nodes.push(h('div', { class: 'sec', text: 'Đang chờ xác nhận (không tính vào bù trừ)' }));
        d.waiting.forEach(function (x) {
          nodes.push(L9.link('#/m/' + x.mealId, { class: 'card row-card' }, [
            h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: x.fromName + ' → ' + x.toName }), h('div', { class: 'muted trunc', text: 'Đã báo chuyển, chờ ' + x.toName + ' xác nhận · ' + (x.venueName || 'Bữa trưa') })]),
            h('div', { class: 'right' }, [h('div', { class: 'b', text: L9.vnd(x.amount) }), L9.chip('Chờ xác nhận', 'info')]),
          ]));
        });
      }
      nodes.push(h('div', { class: 'sec', text: 'Chi tiết từng khoản' }));
      d.items.forEach(function (x) {
        nodes.push(L9.link('#/m/' + x.mealId, { class: 'card row-card' }, [
          h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: x.fromName + ' → ' + x.toName }), h('div', { class: 'muted trunc', text: (x.venueName || 'Bữa trưa') + ', ' + L9.dayLabel(x.day) })]),
          h('div', { class: 'right' }, [h('div', { class: 'b', text: L9.vnd(x.amount) }), L9.chip(x.inNetting ? 'Trong bù trừ' : x.status === 'da_chuyen' ? 'Chờ xác nhận' : 'Chưa trả', x.inNetting || x.status === 'da_chuyen' ? 'info' : 'warn')]),
        ]));
      });
      L9.mount(nodes);
    }
  };

  // ---------- lịch sử và thống kê ----------
  L9.stats = function (id, kindArg) {
    L9.frame({ title: 'Lịch sử và thống kê', back: '#/t/' + id });
    L9.skeleton();
    var kindSel = kindArg || '';
    L9.get('api/teams/' + id + '/stats' + (kindSel ? '?kind=' + kindSel : '')).then(function (d) {
      var nodes = [];
      var filter = h('div', { class: 'kinds scroll', role: 'radiogroup', 'aria-label': 'Lọc theo loại bữa' }, [['', 'Tất cả']].concat(L9.KIND_ORDER.map(function (k) { return [k, L9.KINDS[k].label]; })).map(function (o) {
        return h('button', { type: 'button', role: 'radio', 'aria-checked': String(kindSel === o[0]), class: 'kindbtn' + (kindSel === o[0] ? ' on' : ''), onclick: function () { L9.stats(id, o[0]); } }, [o[1]]);
      }));
      nodes.push(filter);
      var max = Math.max.apply(null, d.spent.map(function (s) { return s.amount; }).concat([1]));
      var month = d.month.split('-');
      nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Ai đã chi tháng ' + parseInt(month[1], 10) + '/' + month[0] }),
        d.spent.length ? h('div', {}, d.spent.map(function (s) {
          var bar = h('div', { class: 'bar-fill' });
          bar.style.width = Math.max(4, Math.round(s.amount / max * 100)) + '%';
          return h('div', { class: 'stat-row' }, [h('div', { class: 'row sb' }, [h('span', { class: 'trunc', text: s.name }), h('b', { text: L9.vnd(s.amount) })]), h('div', { class: 'bar-track' }, [bar]), h('div', { class: 'muted', text: s.meals + ' bữa' })]);
        })) : h('p', { class: 'muted', text: 'Tháng này chưa có bữa nào chia tiền.' })]));
      nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Ai ứng tiền gần đây (30 ngày)' }),
        d.advances.length ? h('ul', { class: 'plain' }, d.advances.map(function (a) { return h('li', { text: a.name + ': ' + a.count + ' lần, ' + L9.vnd(a.amount) }); })) : h('p', { class: 'muted', text: 'Chưa ai ứng tiền trong 30 ngày qua.' })]));
      nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Quán yêu thích' }),
        d.favorites.length ? h('ul', { class: 'plain' }, d.favorites.map(function (f) { return h('li', { text: f.name + ': ' + f.count + ' lần' + (f.up || f.down ? ' (👍 ' + f.up + ', 👎 ' + f.down + ')' : '') }); })) : h('p', { class: 'muted', text: 'Chưa có quán nào được chọn.' })]));
      nodes.push(h('div', { class: 'sec', text: 'Các bữa đã qua' }));
      if (!d.meals.length) nodes.push(L9.empty('Chưa có bữa nào', ''));
      d.meals.forEach(function (m) {
        var s = L9.STATUS[m.status];
        nodes.push(L9.link('#/m/' + m.id, { class: 'card row-card' }, [
          h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: m.venueName || 'Chưa chốt quán' }), h('div', { class: 'muted trunc', text: L9.dayLabel(m.day) + (m.payerName ? ', ' + m.payerName + ' ứng' : '') })]),
          h('div', { class: 'right' }, [m.total ? h('div', { class: 'b', text: L9.vnd(m.total) }) : null, L9.chip(s[0], s[1])]),
        ]));
      });
      L9.mount(nodes);
    }, function (e) { L9.loadError(e, function () { L9.stats(id); }); });
  };
})();
