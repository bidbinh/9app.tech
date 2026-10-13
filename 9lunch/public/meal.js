/* 9lunch: màn bữa ăn (chọn quán, gọi món, chia tiền, thu tiền). */
(function () {
  'use strict';
  var L9 = window.L9; var h = L9.h;
  var STEPS = [['binh_chon', 'Chọn quán'], ['dat_mon', 'Đặt món'], ['thanh_toan', 'Trả tiền']];
  var D = {}; // bản nháp ô nhập: giữ nguyên khi làm mới màn
  var CHARGE_CHIP = { chua_tra: ['Chưa trả', 'warn'], da_chuyen: ['Chờ xác nhận', 'info'], da_nhan: ['Đã nhận', 'ok'] };
  var latest = null; var mealId = null; var seenChange = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function safeLink(url) { return /^https?:\/\//i.test(url || ''); }
  function ext(url, label) {
    return safeLink(url) ? h('a', { class: 'ext', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, [L9.ico('link', 16), ' ', label || 'Mở link']) : null;
  }
  function saveAndRender(promise, btn) {
    return L9.busy(btn, function () {
      return promise().then(function (r) { if (r && r.meal) { latest = r.meal; L9.rerender(r.meal); } else return L9.refresh(); });
    });
  }
  function reload() { return L9.refresh(true); }
  function post(path, body) { return L9.post('api/meals/' + mealId + path, body); }

  L9.meal = function (id) {
    mealId = id; D = {}; latest = null; seenChange = null;
    L9.frame({ title: 'Bữa ăn', back: '#/' });
    L9.skeleton();
    L9.live({ fetch: function () { return L9.get('api/meals/' + id).then(function (r) { return r.meal; }); }, render: render, every: 5000 })
      .catch(function (e) { L9.loadError(e, function () { L9.meal(id); }); });
  };

  // ---------- thanh tiến trình ----------
  function stepper(m) {
    var idx = m.status === 'binh_chon' ? 0 : m.status === 'dat_mon' ? 1 : 2;
    var done = m.status === 'xong';
    var K = L9.KINDS[m.kind] || L9.KINDS.trua;
    return h('ol', { class: 'steps', 'aria-label': 'Các bước của bữa ăn' }, STEPS.map(function (s, i) {
      var st = (i < idx || (done && i === 2)) ? 'done' : i === idx ? 'now' : '';
      return h('li', { class: 'step ' + st, 'aria-current': i === idx ? 'step' : null }, [
        h('span', { class: 'dot' }, [st === 'done' ? L9.ico('check', 16, 3) : String(i + 1)]),
        h('span', { class: 'lbl', text: i === 1 ? K.order : s[1] }),
      ]);
    }));
  }

  // ---------- khối người ứng tiền ----------
  function payerBlock(m) {
    var open = m.status === 'binh_chon' || m.status === 'dat_mon' || m.status === 'thanh_toan';
    var box = h('div', { class: 'card' }, [h('div', { class: 'row sb' }, [h('h2', { text: 'Người ứng tiền' })])]);
    var pickBtn = function (label, cls) {
      return L9.btn(label, cls || 'ghost sm', function () { payerSheet(m); });
    };
    if (!m.payer) {
      box.appendChild(h('p', { text: 'Chưa có ai ứng tiền cho bữa này. Người ứng tiền trả cho quán rồi thu lại của mọi người bằng QR.' }));
      if (m.suggestedPayer) box.appendChild(h('p', { class: 'muted' }, ['Gợi ý: ', h('b', { text: m.suggestedPayer.name }), '. ' + m.suggestedPayer.reason + '.']));
      if (open) {
        var me = L9.btn('Tôi ứng tiền', 'primary sm', function () {
          return saveAndRender(function () { return post('/settings', { payerId: m.me.id }); }, me);
        });
        box.appendChild(h('div', { class: 'btn-row' }, [me, m.canManage ? pickBtn('Chọn người khác') : null]));
      }
      return box;
    }
    box.firstChild.appendChild(open && m.status !== 'xong' && (m.status === 'thanh_toan' ? m.canChangePayer : m.canManage) ? pickBtn('Đổi người') : h('span'));
    box.appendChild(h('div', { class: 'row' }, [h('div', { class: 'avatar', text: initial(m.payer.name) }), h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: m.payer.name + (m.isPayer ? ' (bạn)' : '') }), h('div', { class: 'muted', text: m.payer.hasBank ? 'Đã có tài khoản nhận tiền' : 'Chưa có tài khoản nhận tiền' })])]));
    if (!m.payer.hasBank && open) {
      box.appendChild(L9.notice('warn', 'Chưa thể sang bước thu tiền',
        m.isPayer ? 'Bạn cần nhập tài khoản nhận tiền để mọi người chuyển được. Chỉ mất một lần.' : m.payer.name + ' chưa nhập tài khoản nhận tiền. Nhắc bạn ấy vào Cài đặt nhóm để nhập, hoặc đổi người ứng tiền.',
        m.isPayer ? h('div', { class: 'mt' }, [L9.btn('Nhập tài khoản của tôi', 'primary sm', function () { L9.bankSheet(m.teamId, null, function () { reload(); }); })]) : null));
    }
    return box;
  }
  function initial(name) { return Array.from(String(name || '?'))[0].toUpperCase(); }

  function payerSheet(m) {
    L9.sheet('Chọn người ứng tiền', function (body, close) {
      if (m.status === 'thanh_toan') {
        body.appendChild(L9.notice('info', 'Đổi người nhận khi đang thu tiền', 'Khoản chưa trả sẽ chuyển sang người mới và có QR mới (QR cũ hết hiệu lực). Khoản đã báo chuyển hoặc đã nhận giữ nguyên người nhận cũ.'));
      }
      var list = h('div', { class: 'pick-list', role: 'radiogroup', 'aria-label': 'Người ứng tiền' });
      var cands = (m.canManage || (m.status === 'thanh_toan' && m.canChangePayer)) ? m.members : m.members.filter(function (x) { return x.id === m.me.id; });
      cands.forEach(function (x) {
        var cur = m.payer && m.payer.id === x.id;
        var blocked = m.status === 'thanh_toan' && !x.hasBank;
        var b = h('button', { type: 'button', class: 'pick' + (cur ? ' on' : ''), role: 'radio', 'aria-checked': cur ? 'true' : 'false', disabled: blocked, onclick: function () {
          if (cur) { close(); return; }
          L9.busy(b, function () {
            return post('/settings', { payerId: x.id }).then(function (r) { close(); L9.toast(x.name + ' là người ứng tiền'); latest = r.meal; L9.rerender(r.meal); }, function (e) {
              if (e.code === 'payer_no_bank') { close(); L9.toast(e.message, 'err'); return; }
              throw e;
            });
          });
        } }, [
          h('span', { class: 'avatar sm', text: initial(x.name) }),
          h('span', { class: 'col' }, [h('span', { class: 'b', text: x.name + (x.id === m.me.id ? ' (bạn)' : '') }), h('span', { class: 'muted block', text: x.hasBank ? 'Đã có tài khoản nhận tiền' : (blocked ? 'Chưa có tài khoản nên chưa chọn được' : 'Chưa có tài khoản nhận tiền') })]),
          cur ? L9.ico('check', 20, 3) : null,
        ]);
        list.appendChild(b);
      });
      body.appendChild(list);
      if (!m.canManage && !(m.status === 'thanh_toan' && m.canChangePayer)) body.appendChild(h('p', { class: 'muted', text: 'Muốn nhờ người khác ứng tiền, hãy nhờ chủ nhóm hoặc người tạo bữa chọn giúp.' }));
      if (m.suggestedPayer && m.status !== 'thanh_toan') body.appendChild(h('p', { class: 'muted' }, ['Gợi ý: ', h('b', { text: m.suggestedPayer.name }), '. ' + m.suggestedPayer.reason + '.']));
    });
  }

  // ---------- bước 1: chọn quán ----------
  function stepVote(m, nodes) {
    var head = h('div', { class: 'row sb' }, [h('h2', { class: 'h2', text: 'Chọn quán' })]);
    if (m.voteDeadline) head.appendChild(deadlineChip(m.voteDeadline, 'bình chọn'));
    nodes.push(head);
    if (!m.voteOpen) nodes.push(L9.notice('warn', 'Đã hết giờ bình chọn', 'Quán nhiều phiếu nhất sẽ được chốt. Chủ nhóm có thể chốt ngay.'));
    if (!m.proposals.length) nodes.push(L9.empty('Chưa có đề xuất nào', 'Thêm quán bạn muốn ăn, hoặc để app gợi ý một quán nhóm từng ăn.'));
    m.proposals.forEach(function (p) {
      var top = m.proposals[0].votes > 0 && p.votes === m.proposals[0].votes;
      var vote = h('button', { type: 'button', class: 'vote' + (p.mine ? ' on' : ''), 'aria-pressed': p.mine ? 'true' : 'false', disabled: !m.voteOpen,
        'aria-label': (p.mine ? 'Bỏ phiếu cho ' : 'Bình chọn cho ') + p.name, onclick: function () {
          var cp = clone(m);
          cp.proposals.forEach(function (q) {
            if (q.mine) { q.mine = false; q.votes -= 1; q.voters = q.voters.filter(function (n) { return n !== m.me.name; }); }
          });
          if (!p.mine) { var t = cp.proposals.filter(function (q) { return q.id === p.id; })[0]; t.mine = true; t.votes += 1; t.voters.push(m.me.name); }
          latest = cp; L9.rerender(cp);
          L9.post('api/meals/' + mealId + '/vote', { proposalId: p.mine ? null : p.id }).then(reload, function (e) { L9.fail(e); reload(); });
        } }, [L9.ico('check', 22, 3)]);
      var card = h('div', { class: 'card prop' + (p.mine ? ' on' : '') }, [
        h('div', { class: 'row' }, [
          vote,
          h('div', { class: 'col' }, [
            h('div', { class: 'b', text: p.name }),
            p.note ? h('div', { class: 'muted', text: p.note }) : null,
            h('div', { class: 'muted' }, [p.votes + ' phiếu' + (p.voters.length ? ': ' + p.voters.join(', ') : '')]),
            ext(p.url, 'Xem menu'),
          ]),
          top && p.votes > 0 ? L9.chip('Dẫn đầu', 'ok') : null,
        ]),
      ]);
      var acts = h('div', { class: 'btn-row end' }, []);
      if (m.canManage) acts.appendChild(L9.btn('Chốt quán này', 'ghost sm', function (e) {
        var b = e.currentTarget;
        return saveAndRender(function () { return post('/status', { to: 'dat_mon', proposalId: p.id }); }, b);
      }));
      if (p.canDelete) acts.appendChild(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa đề xuất ' + p.name, onclick: function () {
        L9.del('api/proposals/' + p.id).then(reload, L9.fail);
      } }, [L9.ico('trash', 20)]));
      if (acts.childNodes.length) card.appendChild(acts);
      nodes.push(card);
    });

    // thêm đề xuất
    D.pname = D.pname || ''; D.purl = D.purl || '';
    var pn = L9.text({ placeholder: 'Tên quán, ví dụ: Cơm tấm Ba Ghiền', value: D.pname, 'data-k': 'pname', oninput: function () { D.pname = pn.value; } });
    var pu = L9.text({ 'data-k': 'purl', placeholder: 'https://… (không bắt buộc)', value: D.purl, inputmode: 'url', maxlength: 300, autocapitalize: 'none', oninput: function () { D.purl = pu.value; } });
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var add = L9.btn('Thêm quán', 'primary block', function () {
      err.className = 'hint err hidden';
      if (!pn.value.trim()) { err.textContent = 'Hãy nhập tên quán.'; err.className = 'hint err'; pn.focus(); return; }
      var body = { name: pn.value.trim(), url: pu.value.trim() };
      return L9.busy(add, function () {
        return L9.post('api/meals/' + mealId + '/proposals', body, { idem: 'prop:' + mealId + ':' + body.name }).then(function () { D.pname = ''; D.purl = ''; return L9.refresh(true); }, function (e) {
          if (e.status === 400) { err.textContent = e.message; err.className = 'hint err'; return; }
          throw e;
        });
      });
    });
    var rnd = L9.btn('Gợi ý ngẫu nhiên', 'ghost block', function () {
      return L9.busy(rnd, function () {
        return L9.post('api/meals/' + mealId + '/random').then(function (r) { L9.toast('Gợi ý: ' + r.name); return reload(); }, function (e) {
          if (e.code === 'no_venues') { L9.toast(e.message, 'err'); return; }
          throw e;
        });
      });
    });
    nodes.push(h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); } }, [
      h('h2', { text: 'Đề xuất quán' }), L9.field('Tên quán', pn), L9.field('Link menu hoặc ShopeeFood, GrabFood', pu), err, h('div', { class: 'mt' }, [add]),
      h('div', { class: 'or', text: 'hoặc' }), rnd,
      h('p', { class: 'muted small', text: 'Gợi ý ngẫu nhiên lấy từ các quán nhóm đã từng đề xuất, bỏ qua quán vừa ăn trong 3 ngày.' }),
    ]));

    if (m.canManage) {
      var leader = m.proposals[0];
      var go = L9.btn(leader ? (leader.votes ? 'Chốt quán: ' + leader.name : 'Chốt quán đầu tiên: ' + leader.name) : 'Thêm ít nhất một quán để chốt', 'primary block', function () {
        if (!leader) return;
        return saveAndRender(function () { return post('/status', { to: 'dat_mon' }); }, go);
      }, { disabled: !leader });
      L9.setCta(go);
    } else nodes.push(h('p', { class: 'muted center', text: 'Chủ nhóm, người tạo bữa hoặc người ứng tiền sẽ chốt quán. Bạn cứ bình chọn nhé.' }));
  }

  function deadlineChip(iso, what) {
    var c = L9.chip(L9.untilText(iso), new Date(iso) < Date.now() ? 'bad' : 'info');
    c.setAttribute('title', 'Giờ chốt ' + what + ': ' + L9.timeOf(iso));
    c.textContent = 'Chốt ' + what + ' ' + L9.timeOf(iso) + ' · ' + L9.untilText(iso);
    return c;
  }

  // ---------- bước 2: gọi món ----------
  function itemRow(m, it) {
    var row = h('div', { class: 'item' }, [
      h('div', { class: 'col' }, [
        h('div', { class: 'b', text: it.qty + ' × ' + it.name }),
        it.note ? h('div', { class: 'muted', text: it.note }) : null,
      ]),
      h('div', { class: 'b right', text: L9.vnd(it.price * it.qty) }),
    ]);
    if (it.mine && m.orderOpen && String(it.id).indexOf('tmp') !== 0) {
      row.appendChild(h('div', { class: 'row' }, [
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sửa món ' + it.name, onclick: function () { itemSheet(m, it); } }, [L9.ico('edit', 20)]),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa món ' + it.name, onclick: function () {
          var cp = clone(m); cp.items = cp.items.filter(function (x) { return x.id !== it.id; }); latest = cp; L9.rerender(cp);
          L9.del('api/items/' + it.id).then(reload, function (e) { L9.fail(e); reload(); });
        } }, [L9.ico('trash', 20)]),
      ]));
    }
    return row;
  }

  function itemSheet(m, it) {
    L9.sheet('Sửa món', function (body, close) {
      var name = L9.text({ value: it.name }), price = L9.money({ value: String(it.price) }), qty = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 99, value: String(it.qty) });
      var note = L9.text({ value: it.note, maxlength: 160, placeholder: 'Ví dụ: ít cay, không hành' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = L9.btn('Lưu', 'primary block', function () {
        var p = L9.parseMoney(price.value), q = parseInt(qty.value, 10);
        if (!name.value.trim()) { err.textContent = 'Hãy nhập tên món.'; err.className = 'hint err'; return; }
        if (isNaN(p) || p < 0) { err.textContent = 'Giá chưa đúng. Ví dụ: 45000 hoặc 45.000 hoặc 45k.'; err.className = 'hint err'; return; }
        if (!(q >= 1 && q <= 99)) { err.textContent = 'Số lượng từ 1 đến 99.'; err.className = 'hint err'; return; }
        return L9.busy(save, function () {
          return L9.post('api/items/' + it.id, { name: name.value.trim(), price: p, qty: q, note: note.value.trim() }).then(function () { close(); return reload(); });
        });
      });
      body.appendChild(L9.field('Tên món', name)); body.appendChild(L9.field('Giá một phần (đồng)', price)); body.appendChild(L9.field('Số lượng', qty)); body.appendChild(L9.field('Ghi chú', note));
      body.appendChild(err); body.appendChild(h('div', { class: 'mt' }, [save]));
    });
  }

  // ---------- tùy chọn nhanh cho đồ uống: ghép thành ghi chú của dòng ----------
  var SIZE = ['S', 'M', 'L'], SUGAR = ['0', '30', '50', '70', '100'], ICE = ['Không', 'Ít', 'Vừa', 'Nhiều'];
  function composeNote(o, free) {
    var p = [];
    if (o.size) p.push(o.size);
    if (o.sugar) p.push(o.sugar + '% đường');
    if (o.ice) p.push(o.ice === 'Không' ? 'không đá' : 'đá ' + o.ice.toLowerCase());
    if (o.topping) p.push('+ ' + o.topping);
    if (free) p.push(free);
    return p.join(', ');
  }
  function optionChips() {
    var box = h('div', {});
    function group(label, key, values, fmt) {
      var wrap = h('div', { class: 'optchips', role: 'radiogroup', 'aria-label': label });
      values.forEach(function (v) {
        var b = h('button', { type: 'button', role: 'radio', class: 'optchip' + (D.opts[key] === v ? ' on' : ''), 'aria-checked': String(D.opts[key] === v), onclick: function () {
          D.opts[key] = D.opts[key] === v ? '' : v; // bấm lại để bỏ chọn
          wrap.querySelectorAll('button').forEach(function (x) { var on = x === b && D.opts[key] === v; x.className = 'optchip' + (on ? ' on' : ''); x.setAttribute('aria-checked', String(on)); });
        } }, [fmt ? fmt(v) : v]);
        wrap.appendChild(b);
      });
      box.appendChild(h('div', { class: 'optgroup' }, [h('div', { class: 'lab', text: label }), wrap]));
    }
    group('Cỡ ly', 'size', SIZE);
    group('Đường', 'sugar', SUGAR, function (v) { return v + '%'; });
    group('Đá', 'ice', ICE);
    var top = L9.text({ 'data-k': 'topping', maxlength: 40, placeholder: 'Ví dụ: trân châu, thạch', value: D.opts.topping || '', oninput: function () { D.opts.topping = top.value.trim(); } });
    box.appendChild(L9.field('Topping', top));
    return box;
  }

  function orderCard(m) {
    var card = h('div', { class: 'card' }, [h('h2', { text: 'Đặt đơn' })]);
    card.appendChild(h('p', { class: 'muted', text: 'App không đặt món hộ bạn. Người chốt đơn dùng phiếu đặt ở trên để đặt trên Grab, ShopeeFood hoặc gọi thẳng quán. Đặt xong, nhập phí theo hóa đơn rồi chia tiền.' }));
    card.appendChild(h('div', { class: 'row sb' }, [
      h('div', { class: 'col' }, [h('div', { class: 'muted', text: 'Người chốt đơn' }), h('div', { class: 'b', text: m.orderer ? m.orderer.name + (m.orderer.id === m.me.id ? ' (bạn)' : '') + (m.orderer.isDefault ? ' · cũng là người ứng tiền' : '') : 'Chưa có (chọn người ứng tiền trước)' })]),
      (m.canManage || !m.orderer) ? L9.btn(m.canManage ? 'Đổi' : 'Tôi chốt đơn', 'ghost sm', function (e) {
        var b = e.currentTarget;
        if (!m.canManage) return saveAndRender(function () { return post('/settings', { ordererId: m.me.id }); }, b);
        L9.sheet('Chọn người chốt đơn', function (body, close) {
          var list = h('div', { class: 'pick-list', role: 'radiogroup', 'aria-label': 'Người chốt đơn' });
          m.members.forEach(function (x) {
            var cur = m.orderer && m.orderer.id === x.id;
            var pb = h('button', { type: 'button', class: 'pick' + (cur ? ' on' : ''), role: 'radio', 'aria-checked': String(!!cur), onclick: function () {
              L9.busy(pb, function () { return post('/settings', { ordererId: x.id }).then(function (r) { close(); latest = r.meal; L9.rerender(r.meal); }); });
            } }, [h('span', { class: 'avatar sm', text: initial(x.name) }), h('span', { class: 'col' }, [h('span', { class: 'b', text: x.name + (x.id === m.me.id ? ' (bạn)' : '') })]), cur ? L9.ico('check', 20, 3) : null]);
            list.appendChild(pb);
          });
          body.appendChild(list);
        });
      }) : null,
    ]));
    if (m.orderUrl) card.appendChild(h('div', { class: 'mt' }, [h('a', { class: 'btn ghost block', href: m.orderUrl, target: '_blank', rel: 'noopener noreferrer nofollow' }, [L9.ico('link', 18), ' Mở link đặt món'])]));
    if (m.canManage) {
      D.ourl = D.ourl === undefined ? (m.orderUrl || '') : D.ourl;
      var url = L9.text({ 'data-k': 'ourl', inputmode: 'url', maxlength: 300, autocapitalize: 'none', placeholder: 'https://… link nhóm đặt hoặc link quán', value: D.ourl, oninput: function () { D.ourl = url.value; } });
      var uerr = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = L9.btn('Lưu link', 'ghost block', function () {
        uerr.className = 'hint err hidden';
        return L9.busy(save, function () {
          return post('/settings', { orderUrl: url.value.trim() }).then(function (r) { D.ourl = undefined; L9.toast(url.value.trim() ? 'Đã lưu link đặt món' : 'Đã xóa link'); latest = r.meal; L9.rerender(r.meal); }, function (e) {
            if (e.status === 400) { uerr.textContent = e.message; uerr.className = 'hint err'; return; }
            throw e;
          });
        });
      });
      card.appendChild(L9.field('Link nhóm đặt của sàn hoặc link quán (không bắt buộc)', url, 'Dán để mọi người mở nhanh'));
      card.appendChild(uerr); card.appendChild(h('div', { class: 'mt' }, [save]));
      if (m.locked) card.appendChild(h('div', { class: 'mt' }, [L9.btn('Mở khóa để sửa món', 'linkbtn', function (e) { var b = e.currentTarget; return saveAndRender(function () { return L9.post('api/meals/' + mealId + '/lock', { locked: false }); }, b); })]));
    }
    return card;
  }

  function stepOrder(m, nodes) {
    var K = L9.KINDS[m.kind] || L9.KINDS.trua;
    var head = h('div', { class: 'row sb' }, [h('h2', { class: 'h2', text: K.order })]);
    if (m.orderDeadline) head.appendChild(deadlineChip(m.orderDeadline, 'đặt món'));
    nodes.push(head);
    nodes.push(h('div', { class: 'card' }, [
      h('div', { class: 'row sb' }, [h('div', { class: 'col' }, [h('div', { class: 'muted', text: 'Quán hôm nay' }), h('div', { class: 'meal-t', text: m.venue ? m.venue.name : '' }), m.venue ? ext(m.venue.url, 'Xem menu') : null]),
        m.canManage && !m.items.length ? L9.btn('Đổi quán', 'ghost sm', function (e) { var b = e.currentTarget; return saveAndRender(function () { return post('/status', { to: 'binh_chon' }); }, b); }) : null]),
    ]));
    if (m.locked) nodes.push(L9.notice('ok', 'Đơn đã được chốt', 'Danh sách ' + K.item + ' đã khóa. ' + (m.orderer ? m.orderer.name : 'Người chốt đơn') + ' dùng phiếu đặt bên dưới để đặt, rồi nhập phí theo hóa đơn.'));
    else if (!m.orderOpen) nodes.push(L9.notice('warn', 'Đã hết giờ chốt đặt món', 'Không thêm hay sửa được nữa. Chủ nhóm có thể chốt đơn và chia tiền.'));

    var mine = m.items.filter(function (i) { return i.mine; });
    var sec = h('div', { class: 'card' }, [h('h2', { text: (m.kind === 'cafe' ? 'Đồ uống' : 'Món') + ' của bạn' })]);
    if (!mine.length) sec.appendChild(h('p', { class: 'muted', text: m.orderOpen ? 'Bạn chưa chọn ' + K.item + ' nào. Thêm ' + K.item + ' bên dưới.' : 'Bạn không chọn ' + K.item + ' nào.' }));
    mine.forEach(function (it) { sec.appendChild(itemRow(m, it)); });
    if (mine.length) sec.appendChild(h('div', { class: 'row sb item total' }, [h('span', { class: 'b', text: 'Cộng tiền món của bạn' }), h('span', { class: 'b', text: L9.vnd(mine.reduce(function (s, i) { return s + i.price * i.qty; }, 0)) })]));
    nodes.push(sec);

    if (m.orderOpen) {
      if (m.repeat) {
        var rep = L9.btn('Như thường lệ: ' + m.repeat.names.join(', ') + (m.repeat.count > 3 ? '…' : ''), 'ghost block', function () {
          return L9.busy(rep, function () { return L9.post('api/meals/' + mealId + '/items/repeat').then(function () { L9.toast('Đã thêm đơn lần trước của bạn'); return reload(); }); });
        });
        nodes.push(rep);
      }
      D.iname = D.iname || ''; D.iprice = D.iprice || ''; D.iqty = D.iqty || 1; D.inote = D.inote || '';
      var name = L9.text({ placeholder: 'Tên ' + K.item + ', ví dụ: ' + K.itemEx, value: D.iname, 'data-k': 'iname', oninput: function () { D.iname = name.value; } });
      var price = L9.money({ 'data-k': 'iprice', placeholder: 'Giá, ví dụ 45000 hoặc 45k', value: D.iprice, oninput: function () { D.iprice = price.value; } });
      D.opts = D.opts || {};
      var cafeOpts = m.kind === 'cafe' ? optionChips() : null;
      var note = L9.text({ 'data-k': 'inote', placeholder: m.kind === 'cafe' ? 'Ghi chú khác (không bắt buộc)' : 'Ghi chú: ít cay, không hành…', value: D.inote, maxlength: m.kind === 'cafe' ? 40 : 160, oninput: function () { D.inote = note.value; } });
      var qv = h('span', { class: 'qv', 'aria-live': 'polite', text: String(D.iqty) });
      var step = function (d) { D.iqty = Math.min(99, Math.max(1, D.iqty + d)); qv.textContent = String(D.iqty); };
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var add = L9.btn('Thêm ' + K.item, 'primary block', function () {
        err.className = 'hint err hidden';
        var p = L9.parseMoney(price.value);
        if (!name.value.trim()) { err.textContent = 'Hãy nhập tên món.'; err.className = 'hint err'; name.focus(); return; }
        if (isNaN(p) || p < 0 || p > 10000000) { err.textContent = 'Giá chưa đúng. Nhập số tiền một phần, ví dụ 45000, 45.000 hoặc 45k.'; err.className = 'hint err'; price.focus(); return; }
        if (mine.length >= 30) { err.textContent = 'Mỗi người tối đa 30 dòng món.'; err.className = 'hint err'; return; }
        var body = { name: name.value.trim(), price: p, qty: D.iqty, note: m.kind === 'cafe' ? composeNote(D.opts, note.value.trim()) : note.value.trim() };
        var saved = { n: D.iname, p: D.iprice, q: D.iqty, t: D.inote, o: Object.assign({}, D.opts) };
        var cp = clone(m);
        cp.items.push({ id: 'tmp' + L9.rid(), memberId: m.me.id, memberName: m.me.name, name: body.name, price: body.price, qty: body.qty, note: body.note, mine: true });
        D.iname = ''; D.iprice = ''; D.iqty = 1; D.inote = ''; D.opts = {}; latest = cp; L9.rerender(cp);
        var again = document.querySelector('[data-k="iname"]'); if (again) again.focus();
        return L9.post('api/meals/' + mealId + '/items', body, { idem: 'item:' + L9.rid() }).then(reload, function (e) {
          D.iname = saved.n; D.iprice = saved.p; D.iqty = saved.q; D.inote = saved.t; D.opts = saved.o; // giữ lại chip đã chọn khi bị từ chối
          L9.fail(e); return reload();
        });
      });
      nodes.push(h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); } }, [
        h('h2', { text: 'Thêm ' + K.item }), L9.field('Tên ' + K.item, name), L9.field('Giá một phần (đồng)', price), cafeOpts,
        h('div', { class: 'field' }, [h('label', { text: 'Số lượng' }), h('div', { class: 'stepper' }, [
          h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Giảm số lượng', onclick: function () { step(-1); } }, ['−']), qv,
          h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Tăng số lượng', onclick: function () { step(1); } }, ['+'])])]),
        L9.field(m.kind === 'cafe' ? 'Ghi chú khác' : 'Ghi chú', note), err, h('div', { class: 'mt' }, [add]),
      ]));
    }

    // mọi người đã gọi
    var others = {};
    m.items.forEach(function (i) { if (!i.mine) (others[i.memberName] = others[i.memberName] || []).push(i); });
    var names = Object.keys(others);
    if (names.length) {
      var oc = h('div', { class: 'card' }, [h('h2', { text: 'Mọi người đã gọi (' + names.length + ')' })]);
      names.forEach(function (n) {
        var list = others[n];
        oc.appendChild(h('div', { class: 'who' }, [h('div', { class: 'row sb' }, [h('b', { text: n }), h('b', { text: L9.vnd(list.reduce(function (s, i) { return s + i.price * i.qty; }, 0)) })]),
          h('div', { class: 'muted', text: list.map(function (i) { return i.qty + ' ' + i.name + (i.note ? ' (' + i.note + ')' : ''); }).join(', ') })]));
      });
      nodes.push(oc);
    }

    // phiếu đặt
    if (m.slip.lines.length) {
      var sc = h('div', { class: 'card' }, [h('h2', { text: 'Phiếu đặt gửi quán' })]);
      m.slip.lines.forEach(function (l) {
        sc.appendChild(h('div', { class: 'slip-line' }, [
          h('span', { class: 'qty', text: l.qty + '×' }),
          h('span', { class: 'col' }, [h('b', { text: l.name }), l.notes.length ? h('span', { class: 'muted block', text: l.notes.map(function (n) { return n.qty + ' ' + n.note; }).join(', ') }) : null]),
        ]));
      });
      sc.appendChild(h('div', { class: 'muted', text: 'Tổng ' + m.slip.dishes + ' phần, ' + L9.vnd(m.slip.sum) }));
      sc.appendChild(h('div', { class: 'mt' }, [L9.btn('Sao chép phiếu đặt', 'ghost block', function () { L9.copy(m.slip.text, 'Đã sao chép, dán vào Zalo hoặc app của quán'); })]));
      nodes.push(sc);
    }

    nodes.push(orderCard(m));

    // phí và chia tiền
    nodes.push(feesCard(m));

    if (m.canManage) {
      var lock = L9.btn('Chốt đơn (khóa danh sách món)', 'primary block', function () {
        if (!m.items.length) { L9.toast('Chưa ai gọi món nên chưa chốt đơn được', 'err'); return; }
        return saveAndRender(function () { return L9.post('api/meals/' + mealId + '/lock'); }, lock).then(function () { window.scrollTo(0, 0); L9.toast('Đã chốt đơn. Gửi phiếu đặt cho quán nhé.'); });
      });
      var next = L9.btn(m.locked ? 'Đã đặt xong, chia tiền' : 'Chia tiền', 'primary block', function () {
        if (!m.items.length) { L9.toast('Chưa ai gọi món nên chưa chia tiền được', 'err'); return; }
        return L9.busy(next, function () {
          return post('/status', { to: 'thanh_toan' }).then(function (r) { latest = r.meal; L9.rerender(r.meal); window.scrollTo(0, 0); L9.toast('Đã chia tiền. Mọi người sẽ thấy QR của mình.'); }, function (e) {
            if (e.code === 'payer_no_bank' || e.code === 'no_payer' || e.code === 'no_items') { L9.sheet('Chưa sang bước thu tiền được', function (b, close) { b.appendChild(h('p', { text: e.message })); b.appendChild(L9.btn('Đã hiểu', 'primary block', function () { close(); })); }); return; }
            throw e;
          });
        });
      });
      if (m.locked) L9.setCta(next);
      else {
        L9.setCta(lock);
        nodes.push(L9.btn('Không cần chốt, chia tiền luôn', 'linkbtn', function () { next.click(); }));
      }
    } else nodes.push(h('p', { class: 'muted center', text: 'Khi mọi người gọi xong, người chốt đơn sẽ khóa danh sách, đặt rồi chia tiền.' }));
  }

  function feesCard(m) {
    var f = m.fees; var can = m.canManage;
    var card = h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); } }, [h('h2', { text: 'Phí và cách chia' })]);
    if (can) {
      if (D.fees === undefined) D.fees = { ship: f.ship ? String(f.ship) : '', service: f.service ? String(f.service) : '', tip: f.tip ? String(f.tip) : '', discount: f.discount ? String(f.discount) : '' };
      if (!D.mode) D.mode = m.splitMode;
      var mk = function (key, label) {
        var i = L9.money({ 'data-k': 'fee-' + key, value: D.fees[key], oninput: function () { D.fees[key] = i.value; D.dirty = true; } });
        return L9.field(label, i);
      };
      var grid = h('div', { class: 'grid2' }, [mk('ship', 'Phí giao hàng'), mk('service', 'Phí dịch vụ'), mk('tip', 'Tiền boa'), mk('discount', 'Giảm giá, freeship')]);
      var seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Cách chia' }, [['ty_le', 'Theo tiền món'], ['chia_deu', 'Chia đều']].map(function (o) {
        var b = h('button', { type: 'button', role: 'radio', 'aria-checked': D.mode === o[0] ? 'true' : 'false', class: D.mode === o[0] ? 'on' : '', onclick: function () {
          D.mode = o[0]; D.dirty = true; seg.querySelectorAll('button').forEach(function (x) { var on = x === b; x.className = on ? 'on' : ''; x.setAttribute('aria-checked', String(on)); });
          hint.textContent = modeHint(D.mode);
        } }, [o[1]]);
        return b;
      }));
      var hint = h('div', { class: 'muted', text: modeHint(D.mode) });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = L9.btn('Lưu phí và cách chia', 'ghost block', function () {
        err.className = 'hint err hidden';
        var out = {};
        for (var k in D.fees) {
          var raw = String(D.fees[k]).trim();
          var v = raw === '' ? 0 : L9.parseMoney(raw);
          if (isNaN(v) || v < 0 || v > 100000000) { err.textContent = 'Số tiền ở ô "' + ({ ship: 'phí giao hàng', service: 'phí dịch vụ', tip: 'tiền boa', discount: 'giảm giá' }[k]) + '" chưa đúng. Ví dụ: 15000, 15.000 hoặc 15k.'; err.className = 'hint err'; return; }
          out[k] = v;
        }
        return L9.busy(save, function () {
          return post('/settings', { fees: out, splitMode: D.mode }).then(function (r) { D.dirty = false; D.fees = undefined; D.mode = null; L9.toast('Đã lưu'); latest = r.meal; L9.rerender(r.meal); });
        });
      });
      card.appendChild(grid); card.appendChild(seg); card.appendChild(hint); card.appendChild(err); card.appendChild(h('div', { class: 'mt' }, [save]));
    } else {
      var parts = [['Phí giao hàng', f.ship], ['Phí dịch vụ', f.service], ['Tiền boa', f.tip], ['Giảm giá', -f.discount]].filter(function (x) { return x[1]; });
      if (!parts.length) card.appendChild(h('p', { class: 'muted', text: 'Chưa có phí nào. Chủ nhóm hoặc người ứng tiền sẽ nhập phí giao hàng, giảm giá.' }));
      parts.forEach(function (x) { card.appendChild(h('div', { class: 'row sb item' }, [h('span', { text: x[0] }), h('b', { text: (x[1] < 0 ? '−' : '') + L9.vnd(Math.abs(x[1])) })])); });
      card.appendChild(h('div', { class: 'muted', text: 'Cách chia: ' + (m.splitMode === 'ty_le' ? 'theo tiền món' : 'chia đều') }));
    }
    var pv = m.preview;
    if (pv.shares.length) {
      var t = h('div', { class: 'preview' }, [h('div', { class: 'sec in', text: 'Dự kiến mỗi người trả' })]);
      pv.shares.forEach(function (s) {
        t.appendChild(h('div', { class: 'row sb item' }, [h('span', { class: 'trunc', text: s.name + (m.payer && m.payer.name === s.name ? ' (ứng tiền)' : '') }), h('b', { text: L9.vnd(s.amount) })]));
      });
      t.appendChild(h('div', { class: 'row sb item total' }, [h('b', { text: 'Tổng' }), h('b', { text: L9.vnd(pv.total) })]));
      if (pv.discountApplied < (f.discount)) t.appendChild(h('div', { class: 'muted', text: 'Giảm giá lớn hơn tổng nên chỉ giảm tối đa ' + L9.vnd(pv.discountApplied) + '.' }));
      if (m.round500 && pv.surplus) t.appendChild(h('div', { class: 'muted', text: 'Đã làm tròn lên 500 đ, phần chênh ' + L9.vnd(pv.surplus) + ' thuộc về người ứng tiền.' }));
      card.appendChild(t);
    }
    return card;
  }
  function modeHint(mode) { return mode === 'ty_le' ? 'Phí giao hàng, dịch vụ, boa và giảm giá chia theo tỷ lệ tiền món của từng người.' : 'Cả bữa chia đều cho những người có gọi món, không phân biệt ăn nhiều hay ít.'; }

  // ---------- bước 3: thu tiền ----------
  function stepPay(m, nodes) {
    var total = m.preview.total;
    var closed = m.status === 'xong';
    if (m.payerChange && Date.now() - new Date(m.payerChange.at) < 3 * 86400000) {
      nodes.push(L9.notice('warn', 'Đã đổi người ứng tiền', changeText(m.payerChange) + '. ' + (m.payerChange.fromMe ? 'Khoản chưa trả đã chuyển sang người mới; khoản đã báo chuyển hoặc đã nhận cho bạn vẫn do bạn xác nhận.' : 'Khoản chưa trả dùng mã QR mới; khoản bạn đã báo chuyển vẫn do người nhận cũ xác nhận. Đừng dùng QR cũ.')));
    }
    nodes.push(h('div', { class: 'row sb' }, [h('h2', { class: 'h2', text: closed ? 'Đã xong' : 'Trả tiền' }), closed ? L9.chip('Hoàn tất', 'ok') : null]));
    nodes.push(h('div', { class: 'card' }, [
      h('div', { class: 'row sb' }, [h('span', { class: 'muted', text: 'Tổng bữa ăn' }), h('b', { class: 'big', text: L9.vnd(total) })]),
      h('div', { class: 'muted', text: 'Tiền món ' + L9.vnd(m.preview.foodTotal) + (m.preview.gross ? ' + phí ' + L9.vnd(m.preview.gross) : '') + (m.preview.discountApplied ? ' − giảm ' + L9.vnd(m.preview.discountApplied) : '') }),
    ]));
    var charges = m.charges || [];
    var myc = charges.filter(function (c) { return c.mine; })[0];
    if (myc) nodes.push(myCharge(m, myc));
    else if (!charges.length) nodes.push(L9.empty('Chưa có khoản nào', ''));
    else nodes.push(L9.notice('info', 'Bạn không gọi món trong bữa này', 'Nên không có khoản nào cần trả.'));

    // người nhận tiền: danh sách cần thu
    var toMe = charges.filter(function (c) { return c.toMe && !c.isSelf; });
    if (toMe.length) nodes.push(collectCard(m, toMe));

    // cảnh báo tiền đã nằm ở người nhận cũ
    (m.heldByOldPayees || []).forEach(function (x) {
      nodes.push(L9.notice('info', x.payeeName + ' đã nhận ' + L9.vnd(x.amount) + ' (hoặc đang chờ nhận) trước khi đổi người ứng tiền', 'Các khoản này giữ nguyên người nhận cũ. ' + x.payeeName + ' và ' + (m.payer ? m.payer.name : 'người ứng tiền mới') + ' tự cân đối với nhau.'));
    });

    // phần của mọi người
    var all = h('div', { class: 'card' }, [h('h2', { text: 'Phần của mỗi người' })]);
    charges.forEach(function (c) {
      var chip = c.isSelf ? L9.chip('Người ứng tiền', 'brand') : (CHARGE_CHIP[c.status] ? L9.chip(c.inNetting ? 'Trong bù trừ' : CHARGE_CHIP[c.status][0], c.inNetting ? 'info' : CHARGE_CHIP[c.status][1]) : null);
      all.appendChild(h('div', { class: 'row sb item' }, [
        h('div', { class: 'col' }, [h('div', { class: 'trunc b', text: c.memberName + (c.mine ? ' (bạn)' : '') }), h('div', { class: 'muted trunc', text: c.isSelf ? 'Tự thanh toán' : 'Trả cho ' + c.payeeName + (c.settledByNetting ? ', qua bù trừ' : '') })]),
        h('div', { class: 'right' }, [h('div', { class: 'b', text: L9.vnd(c.amount) }), chip]),
      ]));
    });
    nodes.push(all);

    // đánh giá quán
    var joined = m.items.some(function (i) { return i.mine; });
    if (m.venue && joined) {
      var rate = function (v) { return function () {
        var cur = m.ratings.mine === v ? 0 : v;
        var cp = clone(m); cp.ratings.mine = cur; latest = cp; L9.rerender(cp);
        L9.post('api/meals/' + mealId + '/rating', { value: cur }).then(reload, function (e) { L9.fail(e); reload(); });
      }; };
      nodes.push(h('div', { class: 'card center' }, [h('h2', { text: 'Quán ' + m.venue.name + ' thế nào?' }), h('div', { class: 'btn-row center' }, [
        h('button', { type: 'button', class: 'rate' + (m.ratings.mine === 1 ? ' on' : ''), 'aria-pressed': String(m.ratings.mine === 1), 'aria-label': 'Ngon, nên ăn lại', onclick: rate(1) }, ['👍 ', String(m.ratings.up)]),
        h('button', { type: 'button', class: 'rate' + (m.ratings.mine === -1 ? ' on' : ''), 'aria-pressed': String(m.ratings.mine === -1), 'aria-label': 'Không ngon', onclick: rate(-1) }, ['👎 ', String(m.ratings.down)]),
      ])]));
    }

    // quản lý bữa
    if (m.canManage && !closed) {
      var open = charges.filter(function (c) { return !c.isSelf && c.status !== 'da_nhan'; }).length;
      var canBack = charges.every(function (c) { return c.isSelf || (c.status === 'chua_tra' && !c.inNetting); });
      var fin = L9.btn(open ? 'Hoàn tất bữa (còn ' + open + ' khoản chưa xong)' : 'Hoàn tất bữa', open ? 'ghost block' : 'primary block', function () {
        var run = function () { return saveAndRender(function () { return post('/status', { to: 'xong' }); }, fin); };
        if (!open) return run();
        return L9.confirm({ title: 'Hoàn tất bữa?', text: 'Còn ' + open + ' khoản chưa xong. Các khoản đó vẫn nằm trong Sổ nợ nhóm và vẫn đánh dấu được sau khi hoàn tất.', ok: 'Hoàn tất' }).then(function (y) { if (y) return run(); });
      });
      var box = h('div', { class: 'card' }, [h('h2', { text: 'Quản lý bữa' }), fin]);
      if (canBack) box.appendChild(h('div', { class: 'mt' }, [L9.btn('Quay lại sửa món hoặc phí', 'ghost block', function (e) {
        var b = e.currentTarget;
        return L9.confirm({ title: 'Quay lại sửa?', text: 'Các khoản và QR đã tạo sẽ được xóa, chia lại khi bạn chốt đơn lần nữa. Chỉ làm được khi chưa ai báo đã chuyển.', ok: 'Quay lại sửa' }).then(function (y) { if (y) return saveAndRender(function () { return post('/status', { to: 'dat_mon' }); }, b); });
      })]));
      nodes.push(box);
      if (open === 0 && charges.length) L9.setCta(fin);
    }
  }

  function myCharge(m, c) {
    if (c.isSelf) return L9.notice('ok', 'Bạn là người ứng tiền', 'Phần của bạn ' + L9.vnd(c.amount) + ' không cần chuyển. Mọi người sẽ chuyển cho bạn.');
    var card = h('div', { class: 'card pay' }, []);
    if (c.status === 'da_nhan') {
      card.appendChild(h('div', { class: 'center' }, [h('div', { class: 'okmark' }, [L9.ico('check', 32, 3)]), h('h2', { text: 'Đã xong, cảm ơn bạn!' }), h('p', { class: 'muted', text: c.payeeName + ' đã nhận ' + L9.vnd(c.amount) + '.' })]));
      return card;
    }
    card.appendChild(h('div', { class: 'row sb' }, [h('h2', { text: 'Bạn cần chuyển cho ' + c.payeeName }), CHARGE_CHIP[c.status] ? L9.chip(CHARGE_CHIP[c.status][0], CHARGE_CHIP[c.status][1]) : null]));
    if (c.payeeChanged) card.appendChild(L9.notice('warn', 'Đã đổi người nhận tiền', 'Đừng dùng QR cũ. Hãy chuyển theo mã QR mới bên dưới.'));
    if (c.status === 'da_chuyen') {
      card.appendChild(h('p', {}, ['Bạn đã báo chuyển ', h('b', { text: L9.vnd(c.amount) }), '. Đang chờ ', h('b', { text: c.payeeName }), ' xác nhận đã nhận.']));
      var show = h('div', { class: 'hidden' }, [c.pay ? L9.qrCard({ amount: c.amount, name: c.payeeName, pay: c.pay }) : null]);
      card.appendChild(L9.btn('Xem lại mã QR', 'ghost block', function (e) { var hid = show.classList.toggle('hidden'); e.currentTarget.textContent = hid ? 'Xem lại mã QR' : 'Ẩn mã QR'; }));
      card.appendChild(show);
      return card;
    }
    if (c.inNetting) { card.appendChild(L9.notice('info', 'Khoản này đang nằm trong phiên bù trừ', 'Làm theo hướng dẫn ở Sổ nợ nhóm.', h('div', { class: 'mt' }, [L9.link('#/t/' + m.teamId + '/debts', { class: 'btn primary sm' }, ['Mở Sổ nợ nhóm'])]))); return card; }
    if (c.pay) card.appendChild(L9.qrCard({ amount: c.amount, name: c.payeeName, pay: c.pay }));
    else card.appendChild(L9.notice('warn', 'Chưa có thông tin chuyển khoản', 'Hãy hỏi ' + c.payeeName + ' số tài khoản.'));
    var done = L9.btn('Tôi đã chuyển ' + L9.vnd(c.amount), 'primary block', function () {
      var cp = clone(m); cp.charges.forEach(function (x) { if (x.id === c.id) x.status = 'da_chuyen'; }); latest = cp; L9.rerender(cp);
      L9.post('api/charges/' + c.id + '/paid').then(function () { L9.toast('Đã báo cho ' + c.payeeName); reload(); }, function (e) { L9.fail(e); reload(); });
    });
    L9.setCta(done);
    return card;
  }

  function collectCard(m, list) {
    var card = h('div', { class: 'card' }, [h('h2', { text: 'Bạn cần thu (' + list.filter(function (c) { return c.status !== 'da_nhan'; }).length + ' khoản chưa xong)' })]);
    var pending = list.filter(function (c) { return c.status !== 'da_nhan'; });
    list.forEach(function (c) {
      var row = h('div', { class: 'collect' }, [
        h('div', { class: 'row sb' }, [h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: c.memberName }), h('div', { class: 'big', text: L9.vnd(c.amount) })]), L9.chip(c.inNetting ? 'Trong bù trừ' : CHARGE_CHIP[c.status][0], c.inNetting ? 'info' : CHARGE_CHIP[c.status][1])]),
      ]);
      if (c.status !== 'da_nhan' && !c.inNetting) {
        var acts = h('div', { class: 'btn-row' }, []);
        var got = L9.btn(c.status === 'da_chuyen' ? 'Đã nhận' : 'Đã nhận (tiền mặt)', 'primary sm', function () {
          var cp = clone(m); cp.charges.forEach(function (x) { if (x.id === c.id) x.status = 'da_nhan'; }); latest = cp; L9.rerender(cp);
          L9.post('api/charges/' + c.id + '/received').then(reload, function (e) { L9.fail(e); reload(); });
        });
        acts.appendChild(got);
        if (c.status === 'da_chuyen') acts.appendChild(L9.btn('Chưa thấy', 'ghost sm', function () {
          L9.post('api/charges/' + c.id + '/unseen').then(function () { L9.toast('Đã chuyển về "Chưa trả"'); reload(); }, L9.fail);
        }));
        var rem = (m.reminders || []).filter(function (r) { return r.chargeId === c.id; })[0];
        if (rem && c.status === 'chua_tra') acts.appendChild(L9.btn('Sao chép lời nhắc', 'ghost sm', function () { L9.copy(rem.text, 'Đã sao chép lời nhắc, dán vào Zalo cho ' + c.memberName); }));
        row.appendChild(acts);
      } else if (c.status === 'da_nhan' && !c.settledByNetting) {
        row.appendChild(L9.btn('Chưa thấy tiền (hoàn lại)', 'linkbtn danger-t', function () {
          L9.post('api/charges/' + c.id + '/unseen').then(function () { reload(); }, L9.fail);
        }));
      }
      card.appendChild(row);
    });
    var rems = (m.reminders || []).filter(function (r) { return r.name; });
    if (rems.length > 1) {
      card.appendChild(L9.btn('Sao chép lời nhắc cho tất cả', 'ghost block', function () {
        var txt = 'Nhắc nhẹ cả nhà: bữa ' + (m.venue ? m.venue.name : 'trưa') + ' ngày ' + m.day.split('-').reverse().join('/') + ' còn các khoản sau gửi ' + m.me.name + ' nhé, cảm ơn mọi người!\n' +
          rems.map(function (r) { return '- ' + r.name + ': ' + L9.vnd(r.amount); }).join('\n');
        L9.copy(txt, 'Đã sao chép lời nhắc chung');
      }));
    }
    if (!pending.length) card.appendChild(h('p', { class: 'muted center', text: 'Bạn đã nhận đủ tiền.' }));
    return card;
  }

  // ---------- menu ⋯ ----------
  function menuSheet(m) {
    L9.sheet('Tùy chọn bữa ăn', function (body, close) {
      if (m.canManage && (m.status === 'binh_chon' || m.status === 'dat_mon')) {
        body.appendChild(L9.btn('Đặt giờ chốt', 'ghost block', function () { close(); deadlineSheet(m); }));
        body.appendChild(h('div', { class: 'mt' }, [L9.btn('Hủy bữa này', 'danger block', function () {
          close();
          L9.confirm({ title: 'Hủy bữa này?', text: 'Bữa sẽ chuyển sang "Đã hủy" và không ai phải trả tiền. Tạo bữa mới sau đó vẫn được.', ok: 'Hủy bữa', danger: true }).then(function (y) {
            if (y) L9.post('api/meals/' + mealId + '/status', { to: 'huy' }).then(function (r) { L9.toast('Đã hủy bữa'); latest = r.meal; L9.rerender(r.meal); }, L9.fail);
          });
        })]));
      } else body.appendChild(h('p', { class: 'muted', text: 'Không có tùy chọn nào ở bước này.' }));
      body.appendChild(h('div', { class: 'mt' }, [L9.link('#/t/' + m.teamId + '/debts', { class: 'btn ghost block' }, ['Mở Sổ nợ nhóm'])]));
    });
  }
  function deadlineSheet(m) {
    L9.sheet('Đặt giờ chốt', function (body, close) {
      var v = h('input', { type: 'time', value: L9.timeOf(m.voteDeadline) });
      var o = h('input', { type: 'time', value: L9.timeOf(m.orderDeadline) });
      var save = L9.btn('Lưu giờ chốt', 'primary block', function () {
        return L9.busy(save, function () {
          return post('/settings', { voteDeadline: L9.isoFromTime(v.value, m.day), orderDeadline: L9.isoFromTime(o.value, m.day) }).then(function (r) { close(); L9.toast('Đã lưu giờ chốt'); latest = r.meal; L9.rerender(r.meal); });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Hết giờ bình chọn, quán nhiều phiếu nhất được chốt tự động. Hết giờ đặt món, không ai thêm hay sửa món được nữa. Để trống nếu không cần.' }));
      body.appendChild(L9.field('Chốt bình chọn lúc', v)); body.appendChild(L9.field('Chốt đặt món lúc', o)); body.appendChild(h('div', { class: 'mt' }, [save]));
    });
  }

  // ---------- vẽ cả màn ----------
  function changeText(pc) { return pc.fromName + ' → ' + pc.toName + ' lúc ' + L9.timeOf(pc.at); }
  function render(m) {
    latest = m;
    // phát hiện qua thăm dò: có người vừa đổi người ứng tiền khi bạn đang xem thì báo ngay
    var curChange = m.payerChange ? m.payerChange.id : 0;
    if (seenChange !== null && curChange && curChange !== seenChange) L9.toast('Đã đổi người ứng tiền: ' + changeText(m.payerChange) + '. Đừng dùng QR cũ.', 'err');
    seenChange = curChange;
    var title = m.venue ? m.venue.name : L9.dayLabel(m.day);
    L9.frame({ title: title, back: '#/t/' + m.teamId, right: [h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tùy chọn bữa ăn', onclick: function () { menuSheet(latest); } }, [h('span', { class: 'dots', text: '⋯' })])] });
    var nodes = [];
    var KK = L9.KINDS[m.kind] || L9.KINDS.trua;
    nodes.push(h('div', { class: 'row sb' }, [h('div', { class: 'muted row' }, [L9.ico(KK.icon, 18), h('span', { class: 'ml', text: KK.label + ' · ' + m.teamName + ' · ' + L9.dayLabel(m.day) })]), L9.chip(L9.STATUS[m.status][0], L9.STATUS[m.status][1])]));
    if (m.status === 'huy') {
      L9.setCta(null);
      nodes.push(L9.empty('Bữa này đã hủy', 'Không ai phải trả tiền. Bạn có thể tạo bữa mới ở trang nhóm.', h('div', { class: 'btn-row center' }, [L9.link('#/t/' + m.teamId, { class: 'btn primary' }, ['Về trang nhóm'])])));
      L9.mount(nodes); return;
    }
    nodes.push(stepper(m));
    L9.setCta(null);
    nodes.push(payerBlock(m));
    if (m.status === 'binh_chon') stepVote(m, nodes);
    else if (m.status === 'dat_mon') stepOrder(m, nodes);
    else stepPay(m, nodes);
    var y = window.scrollY;
    L9.mount(nodes);
    window.scrollTo(0, y);
  }
})();
