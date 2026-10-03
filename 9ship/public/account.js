/* 9Ship — phiếu gửi, đơn hàng, sổ địa chỉ, tài khoản và ví, khiếu nại (ES5). */
(function () {
  'use strict';
  var S9 = window.S9, S = S9.S, h = S9.h;
  var val = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
  var field = function (label, input) { return h('div', {}, [h('label', { class: 'f', text: label }), input]); };

  var SHIP = {
    pending_carrier: ['Đang tạo đơn với hãng…', 'info'], created: ['Đã tạo đơn, chờ lấy hàng', 'info'], picked_up: ['Đã lấy hàng', 'info'],
    in_transit: ['Đang vận chuyển', 'info'], delivered: ['Đã giao', 'ok'], delivery_failed: ['Giao chưa thành công', 'warn'],
    returning: ['Đang hoàn hàng', 'warn'], returned: ['Đã hoàn', 'warn'], lost: ['Thất lạc', 'bad'], cancelled: ['Đã hủy', 'bad'], create_failed: ['Không tạo được đơn', 'bad']
  };
  S9.statusTag = function (s) { var m = SHIP[s] || [s, '']; return h('span', { class: 'status ' + m[1], text: m[0] }); };

  // ---------- Phiếu gửi ----------
  var STEPS = [['created', 'Đã tạo'], ['picked_up', 'Đã lấy'], ['in_transit', 'Vận chuyển'], ['delivered', 'Đã giao']];
  function stepIndex(st) { var r = -1; STEPS.forEach(function (s, i) { if (s[0] === st) r = i; }); return r; }

  S9.routes.ticket = function (parts) {
    var id = parts[1];
    S9.frame({ mode: 'flow', title: 'Đơn hàng', back: '#/orders' });
    S9.skeleton();
    var polls = 0;
    function load() {
      S9.api('GET', 'shipments/' + id).then(function (s) {
        draw(s);
        if (s.shippingStatus === 'pending_carrier' && polls++ < 30) S9.later(load, 2500);
      }, S9.fail);
    }
    function draw(s) {
      var canCancel = s.shippingStatus === 'created' && (s.cancelStatus === 'none' || s.cancelStatus === 'rejected');
      var idx = stepIndex(s.shippingStatus);
      var nodes = [h('div', { class: 'row sb mb' }, [S9.statusTag(s.shippingStatus), h('span', { class: 'muted small', text: S9.fmtDate(s.createdAt) })])];
      if (s.needsAttention) nodes.push(h('div', { class: 'alert', text: 'Đơn đang được kiểm tra thủ công. Tiền của bạn vẫn được giữ an toàn và sẽ được hoàn nếu đơn không tạo được.' }));
      if (s.cancelStatus === 'requested') nodes.push(h('div', { class: 'alert info', text: 'Đã gửi yêu cầu hủy, đang chờ hãng xác nhận. Tiền hoàn về ví khi hãng xác nhận.' }));
      if (s.cancelStatus === 'rejected') nodes.push(h('div', { class: 'alert', text: 'Hãng không nhận hủy (có thể hàng đã được lấy).' }));
      if (idx >= 0) {
        nodes.push(h('div', { class: 'card' }, [h('div', { class: 'steps' }, STEPS.map(function (st, i) {
          return h('div', { class: 'st' + (i < idx || (i === idx && idx === STEPS.length - 1) ? ' done' : (i === idx ? ' cur' : '')), text: st[1] });
        }))]));
      }
      if (s.trackingCode) {
        nodes.push(h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [S9.avatar(s.carrierName), h('div', { class: 'col' }, [h('h3', { text: s.carrierName }), h('div', { class: 'muted', text: s.serviceName })])]),
          h('div', { class: 'code-box' }, [h('div', { class: 'muted small', text: s.handover === 'dropoff' ? 'Mã vận đơn — đưa mã này cho nhân viên quầy' : 'Mã vận đơn — nhân viên sẽ đến lấy hàng' }), h('div', { class: 'code', text: s.trackingCode }), h('button', { type: 'button', class: 'link', style: 'margin-top:8px', text: 'Sao chép mã', onclick: function () { try { navigator.clipboard.writeText(s.trackingCode); S9.toast('Đã sao chép mã vận đơn'); } catch (e) { S9.toast('Hãy chép tay: ' + s.trackingCode); } } })]),
          h('div', { class: 'row wrap' }, [
            s.labelUrl ? h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: s.labelUrl, text: 'In nhãn 100×150' }) : null,
            s.labelUrl ? h('a', { class: 'btn sm ghost', style: 'margin-left:8px', target: '_blank', rel: 'noopener', href: s.labelUrl + '?size=a6', text: 'Khổ A6' }) : null,
          ]),
          h('div', { class: 'muted small mt', text: 'Dán nhãn lên kiện hàng. Không có máy in thì đưa mã vận đơn cho nhân viên quầy để họ in.' })
        ]));
      } else if (s.shippingStatus === 'pending_carrier') {
        nodes.push(h('div', { class: 'card spin', text: 'Đang tạo đơn với hãng, vui lòng chờ vài giây…' }));
      } else if (s.shippingStatus === 'create_failed') {
        nodes.push(h('div', { class: 'alert bad', text: 'Hãng không tạo được đơn. Toàn bộ tiền đã hoàn về ví của bạn.' }));
      }
      nodes.push(h('div', { class: 'card route' }, [
        partyLeg('from', s.sender), partyLeg('to', s.receiver)
      ]));
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: 'Tiền' }), S9.kv('Cước phí', S9.vnd(s.sellPrice)), S9.kv('Đã thu', S9.vnd(s.charged)), S9.kv('Đang tạm giữ', S9.vnd(s.held + s.bufferHeld)),
        s.paymentStatus === 'refunded' ? h('div', { class: 'alert ok mt', text: 'Đã hoàn tiền về ví.' }) : null
      ]));
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: 'Hành trình' }),
        s.events.length ? h('ul', { class: 'timeline' }, s.events.slice().reverse().map(function (ev) {
          return h('li', {}, [h('b', { text: (SHIP[ev.status] || [ev.status])[0] }), h('div', { class: 'muted small', text: S9.fmtDate(ev.at) + (ev.note ? ' · ' + ev.note : '') })]);
        })) : h('div', { class: 'muted', text: 'Chưa có sự kiện.' })
      ]));
      var actions = [];
      if (canCancel) actions.push(h('button', { type: 'button', class: 'btn danger', text: 'Hủy đơn', onclick: function () {
        if (!confirm('Hủy đơn này? Tiền sẽ hoàn về ví khi hãng xác nhận.')) return;
        S9.api('POST', 'shipments/' + id + '/cancel', {}).then(function (r) { draw(r.shipment); S9.refreshWallet(); S9.toast(r.cancel.status === 'confirmed' ? 'Đã hủy và hoàn tiền' : r.cancel.status === 'rejected' ? 'Hãng không nhận hủy' : 'Đã gửi yêu cầu hủy'); }, S9.fail);
      } }));
      if (s.trackingCode) actions.push(h('button', { type: 'button', class: 'btn ghost', text: 'Báo sự cố / khiếu nại', onclick: function () { S9.go('#/claim/' + id); } }));
      actions.push(h('a', { class: 'btn ghost', href: '#/', text: 'Gửi đơn mới' }));
      if (S9.meta && S9.meta.demo && s.trackingCode && ['created', 'picked_up', 'in_transit'].indexOf(s.shippingStatus) >= 0) {
        var next = { created: 'picked_up', picked_up: 'in_transit', in_transit: 'delivered' }[s.shippingStatus];
        actions.push(h('button', { type: 'button', class: 'btn ghost', text: 'Chế độ demo: giả lập "' + (SHIP[next] || [next])[0] + '"', onclick: function () {
          S9.api('POST', 'dev/mock/advance', { code: s.trackingCode, status: next }).then(function () { setTimeout(load, 400); }, S9.fail);
        } }));
      }
      S9.mount(nodes.concat(actions));
      S9.every(function () { S9.api('GET', 'shipments/' + id).then(function (n) { if (JSON.stringify(n) !== JSON.stringify(s)) draw(n); }, function () {}); }, 20000);
    }
    load();
  };
  function partyLeg(kind, p) {
    var isFrom = kind === 'from';
    return h('div', { class: 'leg ' + kind }, [
      h('span', { class: 'dot' }, [S9.ico(isFrom ? 'box' : 'pin', 18)]),
      h('span', { class: 'body' }, [h('div', { class: 'lb', text: isFrom ? 'Người gửi' : 'Người nhận' }), h('div', { class: 'nm', text: p.contact + ' · ' + p.phone }), h('div', { class: 'ad', text: p.street + ', ' + p.ward + ', ' + p.provinceName })])
    ]);
  }

  // ---------- Đơn hàng ----------
  S9.routes.orders = function () {
    S9.frame({ mode: 'main', tab: 'orders' });
    S9.skeleton();
    var filter = 'all', q = '', list = [];
    var GROUPS = { active: ['pending_carrier', 'created', 'picked_up', 'in_transit', 'delivery_failed', 'returning'], done: ['delivered', 'returned'], cancelled: ['cancelled', 'create_failed', 'lost'] };
    S9.api('GET', 'shipments').then(function (r) { list = r.shipments; draw(); }, S9.fail);
    function draw() {
      var shown = list.filter(function (s) {
        if (filter !== 'all' && GROUPS[filter].indexOf(s.shippingStatus) < 0) return false;
        if (q) { var hay = S9.norm([s.trackingCode, s.receiver.contact, s.receiver.phone, s.receiver.provinceName, s.carrierName].join(' ')); if (hay.indexOf(S9.norm(q)) < 0) return false; }
        return true;
      });
      var search = h('input', { type: 'search', placeholder: 'Tìm theo mã vận đơn, người nhận…', value: q, 'aria-label': 'Tìm đơn' });
      search.addEventListener('input', function () { q = this.value; var pos = this.selectionStart; draw(); var el = document.querySelector('#view input[type=search]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* bỏ qua */ } } });
      var seg = h('div', { class: 'seg mb' }, [['all', 'Tất cả'], ['active', 'Đang xử lý'], ['done', 'Hoàn tất'], ['cancelled', 'Hủy/lỗi']].map(function (x) {
        return h('button', { type: 'button', class: filter === x[0] ? 'on' : '', text: x[1], onclick: function () { filter = x[0]; draw(); } });
      }));
      var nodes = [h('div', { class: 'h1', text: 'Đơn hàng' }), list.length ? search : null, list.length ? seg : null];
      if (!list.length) nodes.push(h('div', { class: 'card empty' }, [h('div', { class: 'ei' }, [S9.ico('box', 30)]), h('div', { class: 'b', text: 'Bạn chưa có đơn nào' }), h('a', { class: 'btn sm mt', href: '#/', text: 'Gửi đơn đầu tiên' })]));
      else if (!shown.length) nodes.push(h('div', { class: 'card empty', text: 'Không có đơn phù hợp.' }));
      shown.forEach(function (s) {
        nodes.push(h('a', { href: '#/ticket/' + s.id, class: 'card', style: 'display:block;color:inherit;padding:14px 16px' }, [
          h('div', { class: 'row sb' }, [h('b', { text: s.trackingCode || 'Đang tạo đơn…' }), S9.statusTag(s.shippingStatus)]),
          h('div', { class: 'row mt' }, [S9.avatar(s.receiver.contact), h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: s.receiver.contact }), h('div', { class: 'muted small trunc', text: s.receiver.ward + ', ' + s.receiver.provinceName })])]),
          h('div', { class: 'row sb small mt' }, [h('span', { class: 'muted', text: s.carrierName + ' · ' + S9.fmtDate(s.createdAt) }), h('b', { text: S9.vnd(s.sellPrice) })])
        ]));
      });
      var hadFocus = document.activeElement && document.activeElement.type === 'search';
      S9.mount(nodes);
      if (hadFocus) { var el = document.querySelector('#view input[type=search]'); if (el) el.focus(); }
    }
  };

  // ---------- Sổ địa chỉ ----------
  S9.routes.book = function () {
    S9.frame({ mode: 'main', tab: 'book' });
    S9.skeleton();
    function load() { S9.loadAddresses(true).then(draw, S9.fail); }
    function draw(list) {
      var nodes = [
        h('div', { class: 'row sb' }, [h('div', { class: 'h1', text: 'Sổ địa chỉ' }), h('button', { type: 'button', class: 'btn sm', text: '+ Thêm', onclick: function () { S9.editAddress(null, { sender: true, title: 'Thêm địa chỉ' }, load); } })]),
        h('p', { class: 'sub', text: 'Người gửi và người nhận được tự lưu sau mỗi đơn. Chạm vào một mục để sửa.' })
      ];
      if (!list.length) nodes.push(h('div', { class: 'card empty' }, [h('div', { class: 'ei' }, [S9.ico('pin', 30)]), h('div', { class: 'b', text: 'Sổ địa chỉ còn trống' }), h('div', { class: 'small mt', text: 'Thêm địa chỉ ở đây hoặc ngay khi tạo đơn, lần sau chỉ cần chạm để chọn.' })]));
      var card = h('div', { class: 'card', style: 'padding:6px 16px' });
      list.forEach(function (a) {
        card.appendChild(h('button', { type: 'button', class: 'li', onclick: function () { S9.editAddress(a, { sender: true, onDelete: load }, load); } }, [
          S9.avatar(a.contact),
          h('div', { class: 'body' }, [
            h('div', { class: 't trunc' }, [a.contact, a.isDefaultSender ? h('span', { class: 'tagx blue', text: 'Mặc định gửi' }) : null, a.label ? h('span', { class: 'tagx', text: a.label }) : null]),
            h('div', { class: 's trunc', text: a.phone + ' · ' + S9.addrLine(a) }),
            a.useCount ? h('div', { class: 's', text: 'Đã dùng ' + a.useCount + ' lần' }) : null
          ]),
          S9.ico('chev', 18)
        ]));
      });
      if (list.length) nodes.push(card);
      S9.mount(nodes);
    }
    load();
  };

  // ---------- Tài khoản và ví ----------
  S9.routes.me = function () {
    S9.frame({ mode: 'main', tab: 'me' });
    S9.skeleton();
    Promise.all([S9.api('GET', 'wallet'), S9.api('GET', 'wallet/withdrawals')]).then(function (res) {
      S.wallet = res[0];
      var w = res[0], wds = res[1].items;
      var KIND = { topup: 'Nạp tiền', hold: 'Tạm giữ cho đơn', release: 'Hoàn tiền giữ', refund: 'Hoàn tiền đơn', adjustment: 'Điều chỉnh cước', compensation: 'Bồi thường', withdrawal: 'Rút tiền', capture: 'Thanh toán đơn', cancel_fee: 'Phí hủy', return_fee: 'Phí hoàn' };
      var WD = { requested: 'Chờ duyệt', approved: 'Đã duyệt', paying: 'Đang chuyển', paid: 'Đã chuyển', unknown: 'Đang đối soát', failed: 'Không thành công', rejected: 'Bị từ chối', cancelled: 'Đã hủy' };
      var nodes = [
        h('div', { class: 'wallet-card' }, [
          h('div', { style: 'opacity:.85;font-size:13px', text: 'Số dư khả dụng' }), h('div', { class: 'amt', text: S9.vnd(w.balance) }),
          h('div', { style: 'opacity:.85;font-size:13px;margin:4px 0 14px', text: 'Đang tạm giữ: ' + S9.vnd(w.held + w.buffer) + (w.pendingWithdrawal ? ' · Đang rút: ' + S9.vnd(w.pendingWithdrawal) : '') }),
          h('button', { type: 'button', class: 'btn sm w', text: 'Nạp tiền', onclick: function () { showTopup(); } }),
          h('button', { type: 'button', class: 'btn sm', text: 'Rút tiền', onclick: startWithdraw })
        ]),
        w.balance < 0 ? h('div', { class: 'alert bad', text: 'Ví đang âm do hãng điều chỉnh cước. Hãy nạp bù để gửi đơn mới.' }) : null,
        h('div', { id: 'wallet-panel' })
      ];
      if (wds.length) {
        nodes.push(h('div', { class: 'sec', text: 'Yêu cầu rút tiền' }));
        nodes.push(h('div', { class: 'card', style: 'padding:6px 16px' }, wds.map(function (x) {
          return h('div', { class: 'kv' }, [h('span', {}, [x.bankAccount.bank + ' ' + x.bankAccount.number, h('div', { class: 'muted small', text: S9.fmtDate(x.createdAt) })]),
            h('span', { style: 'text-align:right' }, [h('b', { text: S9.vnd(x.amount) }), h('div', { class: 'small', text: WD[x.status] || x.status }), x.status === 'requested' ? h('button', { type: 'button', class: 'link', text: 'Hủy yêu cầu', onclick: function () { S9.api('POST', 'wallet/withdrawals/' + x.id + '/cancel', {}).then(S9.routes.me, S9.fail); } }) : null])]);
        })));
      }
      nodes.push(h('div', { class: 'sec', text: 'Lịch sử ví' }));
      nodes.push(h('div', { class: 'card', style: 'padding:6px 16px' }, w.entries.length ? w.entries.map(function (e) {
        return h('div', { class: 'kv' }, [h('span', {}, [KIND[e.kind] || e.kind, h('div', { class: 'muted small', text: S9.fmtDate(e.at) })]), h('b', { style: 'color:' + (e.amount >= 0 ? '#16a34a' : '#0f172a'), text: (e.amount >= 0 ? '+' : '−') + S9.vnd(Math.abs(e.amount)) })]);
      }) : [h('div', { class: 'muted', style: 'padding:12px 0', text: 'Chưa có giao dịch.' })]));

      nodes.push(h('div', { class: 'sec', text: 'Tài khoản' }));
      nodes.push(h('div', { class: 'card' }, [
        S9.kv('Số điện thoại', S.user.phone),
        field('Tên hiển thị', h('input', { type: 'text', id: 'pf-name', value: S.user.name || '', maxlength: '80', placeholder: 'Tên của bạn' })),
        h('button', { type: 'button', class: 'btn ghost', text: 'Lưu tên', onclick: function () {
          S9.api('PATCH', 'me', { name: val('pf-name') }).then(function (r) { S.user = r.user; S9.toast('Đã lưu'); }, S9.fail);
        } }),
        h('details', { class: 'mt' }, [
          h('summary', { class: 'link', text: 'Đổi mật khẩu' }),
          field('Mật khẩu hiện tại', h('input', { type: 'password', id: 'pw-cur', autocomplete: 'current-password' })),
          field('Mật khẩu mới (ít nhất 6 ký tự)', h('input', { type: 'password', id: 'pw-new', autocomplete: 'new-password' })),
          h('button', { type: 'button', class: 'btn ghost', text: 'Đổi mật khẩu', onclick: function () {
            S9.api('POST', 'me/password', { current: document.getElementById('pw-cur').value, password: document.getElementById('pw-new').value }).then(function () {
              S9.toast('Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.'); document.getElementById('pw-cur').value = ''; document.getElementById('pw-new').value = '';
            }, function (e) { S9.toast(e.message); });
          } })
        ]),
        h('button', { type: 'button', class: 'btn danger', text: 'Đăng xuất', onclick: function () { if (confirm('Đăng xuất khỏi ' + S.user.phone + '?')) S9.logout(); } })
      ]));
      S9.mount(nodes);
      var pre = S9.store('topupAmount');
      if (pre) { S9.store('topupAmount', null); showTopup(pre); }
    }, S9.fail);
  };

  function panel() { var p = document.getElementById('wallet-panel'); S9.clear(p); return p; }
  function showTopup(pre) {
    var p = panel();
    p.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Nạp tiền bằng chuyển khoản' }),
      h('div', { class: 'opts' }, [100000, 200000, 500000, 1000000].map(function (a) { return h('button', { type: 'button', class: 'opt', text: S9.vnd(a), onclick: function () { document.getElementById('tp-amount').value = a; } }); })),
      field('Số tiền (đ)', h('input', { type: 'number', id: 'tp-amount', min: '10000', step: '1000', inputmode: 'numeric', value: pre || '' })),
      h('button', { type: 'button', class: 'btn', text: 'Tạo mã nạp', onclick: function () {
        var amt = parseInt(val('tp-amount'), 10);
        if (!(amt >= 10000)) return S9.toast('Nạp tối thiểu 10.000 đ');
        S9.api('POST', 'wallet/topups', { amount: amt }).then(drawTopup, function (e) { S9.toast(e.message); });
      } })
    ]));
    p.scrollIntoView && p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function drawTopup(t) {
    var p = panel();
    p.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Quét mã hoặc chuyển khoản' }),
      h('div', { class: 'qr', id: 'qrbox' }),
      S9.kv('Số tiền', S9.vnd(t.amount)), S9.kv('Ngân hàng (BIN)', t.transfer.bankBin), S9.kv('Số tài khoản', t.transfer.account), S9.kv('Chủ tài khoản', t.transfer.accountName),
      S9.kv('Nội dung (bắt buộc)', t.transfer.content),
      h('button', { type: 'button', class: 'btn ghost', text: 'Sao chép nội dung chuyển khoản', onclick: function () { try { navigator.clipboard.writeText(t.transfer.content); S9.toast('Đã sao chép'); } catch (e) { S9.toast('Hãy chép tay: ' + t.transfer.content); } } }),
      h('div', { class: 'muted small mt', id: 'tp-status', text: 'Đang chờ tiền về… Ví tự cộng khi nhận được tiền (thường dưới 1 phút).' })
    ]));
    document.getElementById('qrbox').innerHTML = t.qrSvg; // SVG do máy chủ tự sinh từ mã VietQR, không chứa dữ liệu người dùng
    S9.every(function () {
      S9.api('GET', 'wallet/topups/' + t.id).then(function (s) {
        if (s.status === 'paid') { S9.toast('Đã nhận ' + S9.vnd(s.amount)); S9.routes.me(); }
        else if (s.status === 'expired') { var el = document.getElementById('tp-status'); if (el) el.textContent = 'Mã nạp đã hết hạn. Nếu bạn đã chuyển tiền, hãy liên hệ hỗ trợ kèm nội dung ' + t.code + '.'; }
      }, function () {});
    }, 4000);
  }
  function startWithdraw() {
    var p = panel();
    p.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Rút tiền về ngân hàng' }),
      h('div', { class: 'muted small', text: 'Để bảo vệ tiền của bạn, hãy nhập lại mật khẩu.' }),
      field('Mật khẩu', h('input', { type: 'password', id: 'su-pass', autocomplete: 'current-password' })),
      h('button', { type: 'button', class: 'btn', text: 'Tiếp tục', onclick: function () {
        S9.api('POST', 'auth/step-up', { password: document.getElementById('su-pass').value }).then(withdrawForm, function (e) { S9.toast(e.code === 'bad_credentials' ? 'Mật khẩu không đúng' : e.message); });
      } })
    ]));
  }
  function withdrawForm() {
    var p = panel();
    var key = S9.uid();
    p.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Thông tin nhận tiền' }),
      field('Ngân hàng', h('input', { type: 'text', id: 'wd-bank', placeholder: 'Vietcombank' })),
      field('Số tài khoản', h('input', { type: 'text', id: 'wd-num', inputmode: 'numeric' })),
      field('Tên chủ tài khoản', h('input', { type: 'text', id: 'wd-holder', placeholder: 'NGUYEN VAN A' })),
      field('Số tiền rút (tối thiểu 50.000 đ)', h('input', { type: 'number', id: 'wd-amt', min: '50000', step: '1000' })),
      h('div', { class: 'muted small mt', text: 'Tài khoản nhận mới sẽ được duyệt sau tối đa 24 giờ để an toàn.' }),
      h('button', { type: 'button', class: 'btn', text: 'Gửi yêu cầu rút', onclick: function () {
        S9.api('POST', 'wallet/withdrawals', { amount: parseInt(val('wd-amt'), 10), bankAccount: { bank: val('wd-bank'), number: val('wd-num'), holder: val('wd-holder') } }, { 'Idempotency-Key': key }).then(function () { S9.toast('Đã gửi yêu cầu rút tiền'); S9.routes.me(); }, S9.fail);
      } })
    ]));
  }

  // ---------- Khiếu nại ----------
  S9.routes.claim = function (parts) {
    var id = parts[1];
    S9.frame({ mode: 'flow', title: 'Báo sự cố', back: '#/ticket/' + id });
    S9.skeleton();
    S9.api('GET', 'claims').then(function (r) {
      var mine = r.items.filter(function (c) { return c.shipmentId === id; });
      var LAB = { lost: 'Mất hàng', damaged: 'Hư hỏng', late: 'Giao chậm', other: 'Khác' };
      var ST = { received: 'Đã tiếp nhận', forwarded: 'Đã chuyển hãng', resolved: 'Đã giải quyết', rejected: 'Bị từ chối' };
      var nodes = [];
      mine.forEach(function (c) {
        nodes.push(h('div', { class: 'card' }, [h('div', { class: 'row sb' }, [h('b', { text: LAB[c.kind] }), h('span', { class: 'status info', text: ST[c.status] || c.status })]), h('div', { class: 'small mt', text: c.description }), h('div', { class: 'muted small mt', text: 'Hạn nộp hồ sơ: ' + new Date(c.deadline).toLocaleDateString('vi-VN') })]));
      });
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: 'Gửi khiếu nại mới' }),
        field('Loại sự cố', (function () { var s = h('select', { id: 'cl-kind' }); ['lost', 'damaged', 'late', 'other'].forEach(function (k) { s.appendChild(h('option', { value: k, text: LAB[k] })); }); return s; })()),
        field('Mô tả', h('textarea', { id: 'cl-desc', placeholder: 'Mô tả ngắn gọn sự việc' })),
        field('Liên kết ảnh / chứng cứ (không bắt buộc)', h('input', { type: 'text', id: 'cl-url', placeholder: 'https://…' })),
        h('div', { class: 'muted small mt', text: 'Chúng tôi lưu chứng cứ bàn giao và chuyển hồ sơ cho hãng đúng hạn. Hãy gửi sớm.' }),
        h('button', { type: 'button', class: 'btn', text: 'Gửi khiếu nại', onclick: function () {
          var ev = val('cl-url') ? [{ type: 'url', value: val('cl-url') }] : [];
          S9.api('POST', 'claims', { shipmentId: id, kind: val('cl-kind'), description: val('cl-desc'), evidence: ev }).then(function () { S9.toast('Đã tiếp nhận khiếu nại'); S9.routes.claim(parts); }, S9.fail);
        } })
      ]));
      S9.mount(nodes);
    }, S9.fail);
  };
})();
