/* 9Ship — trang quản trị. ES5, không module. Mọi thao tác ghi đều được máy chủ ghi nhật ký. */
(function () {
  'use strict';
  var view = document.getElementById('view');
  var tabs = document.getElementById('tabs');
  var current = 'overview';

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function vnd(n) { return (Math.round(n) || 0).toLocaleString('vi-VN') + ' đ'; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function toast(m) { var t = document.getElementById('toast'); t.textContent = m; t.className = 'toast'; setTimeout(function () { t.className = 'toast hidden'; }, 3500); }
  function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function mount(nodes) { clear(view); view.className = ''; nodes.forEach(function (n) { if (n) view.appendChild(n); }); }

  function api(method, path, body, headers) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, 'v1/' + path, true);
      x.setRequestHeader('X-Requested-With', '9ship');
      if (body !== undefined && body !== null) x.setRequestHeader('Content-Type', 'application/json');
      Object.keys(headers || {}).forEach(function (k) { x.setRequestHeader(k, headers[k]); });
      x.onload = function () {
        var j = null; try { j = JSON.parse(x.responseText); } catch (e) { j = null; }
        if (x.status >= 200 && x.status < 300) return resolve(j);
        var err = (j && j.error) || {};
        reject({ status: x.status, code: err.code, message: err.message || 'Có lỗi xảy ra' });
      };
      x.onerror = function () { reject({ status: 0, message: 'Không kết nối được máy chủ' }); };
      x.send(body !== undefined && body !== null ? JSON.stringify(body) : null);
    });
  }
  function fail(e) { if (e && e.status === 401 && current !== 'login') return showLogin(); toast((e && e.message) || 'Có lỗi'); }
  function field(label, input) { return h('div', {}, [h('label', { class: 'f', text: label }), input]); }
  function val(id) { return document.getElementById(id).value.trim(); }
  function table(head, rows) {
    return h('table', { class: 't' }, [h('thead', {}, [h('tr', {}, head.map(function (x) { return h('th', { text: x }); }))]), h('tbody', {}, rows)]);
  }
  function td(x) { return h('td', {}, [typeof x === 'string' || typeof x === 'number' ? String(x) : x]); }
  function reload() { show(current); }

  var TABS = [['overview', 'Tổng quan'], ['queues', 'Hàng đợi'], ['pricing', 'Giá và ký quỹ'], ['users', 'Người dùng'], ['audit', 'Nhật ký']];
  function drawTabs() {
    clear(tabs);
    TABS.forEach(function (t) { tabs.appendChild(h('button', { class: 'chip' + (current === t[0] ? ' on' : ''), text: t[1], onclick: function () { show(t[0]); } })); });
  }

  function showLogin() {
    current = 'login'; clear(tabs); document.getElementById('logout').style.display = 'none';
    mount([h('div', { class: 'card' }, [
      h('h2', { text: 'Đăng nhập quản trị' }),
      field('Mã quản trị', h('input', { type: 'password', id: 'l-token', autocomplete: 'off' })),
      field('Mã xác thực (TOTP 6 số)', h('input', { type: 'text', id: 'l-otp', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' })),
      h('button', { class: 'btn', text: 'Đăng nhập', onclick: function () {
        api('POST', 'admin/login', { token: val('l-token'), otp: val('l-otp') }).then(function () { show('overview'); }, fail);
      } })
    ])]);
  }

  function show(name) {
    current = name; drawTabs(); document.getElementById('logout').style.display = '';
    view.className = 'spin'; view.textContent = 'Đang tải…';
    var fn = { overview: vOverview, queues: vQueues, pricing: vPricing, users: vUsers, audit: vAudit }[name];
    fn().then(null, fail);
  }

  function vOverview() {
    return api('GET', 'admin/overview').then(function (o) {
      var b = o.balances, q = o.queues;
      var card = function (t, v, sub) { return h('div', { class: 'card col' }, [h('div', { class: 'muted small', text: t }), h('div', { style: 'font-size:20px;font-weight:900', text: v }), sub ? h('div', { class: 'muted small', text: sub }) : null]); };
      mount([
        h('div', { class: 'row wrap' }, [
          card('Ký quỹ đơn vị tổng hợp', vnd(b.aggregator_deposit), 'tài sản'), card('Doanh thu gộp', vnd(b.revenue)), card('Giá vốn', vnd(b.carrier_cost)), card('Tiền tại ngân hàng (sổ)', vnd(b.bank))
        ]),
        h('div', { class: 'row wrap' }, [
          card('Nợ phải trả ví người dùng', vnd(b.userWallets)), card('Đang tạm giữ', vnd(b.userHeld + b.userBuffer)), card('Đang chờ rút', vnd(b.pendingWithdrawals)), card('Đơn 24 giờ / tổng', o.orders.today + ' / ' + o.orders.total)
        ]),
        h('div', { class: 'card' }, [h('h2', { text: 'Việc cần xử lý' }),
          h('div', { class: 'kv' }, [h('span', { text: 'Đơn cần kiểm tra tay' }), h('b', { text: q.attention })]),
          h('div', { class: 'kv' }, [h('span', { text: 'Tiền về chưa ghép' }), h('b', { text: q.bankInbox })]),
          h('div', { class: 'kv' }, [h('span', { text: 'Yêu cầu rút tiền đang mở' }), h('b', { text: q.withdrawals })]),
          h('div', { class: 'kv' }, [h('span', { text: 'Khiếu nại đang xử lý' }), h('b', { text: q.claims })]),
          h('div', { class: 'kv' }, [h('span', { text: 'Ví đang âm' }), h('b', { text: q.negativeWallets })])
        ]),
        h('div', { class: 'card' }, [h('h2', { text: 'Tình trạng hãng' }), table(['Hãng', 'Trạng thái', 'Lỗi liên tiếp', 'Lỗi gần nhất'], o.carriers.map(function (c) {
          return h('tr', {}, [td(c.name), td(h('span', { class: 'status ' + (c.open ? 'bad' : 'ok'), text: c.open ? 'Đang ngắt' : 'Tốt' })), td(c.fails), td(c.lastError || '')]);
        }))]),
        h('div', { class: 'card' }, [h('h2', { text: 'Cảnh báo giá (offer bị ẩn)' }), o.alerts.length ? table(['Hãng', 'Tuyến', 'Lý do', 'Số lần', 'Gần nhất'], o.alerts.map(function (a) {
          return h('tr', {}, [td(a.carrier), td(a.route), td({ no_verified_cap: 'Thiếu giá niêm yết đáng tin', negative_margin: 'Biên âm', margin_below_min: 'Biên dưới mức tối thiểu' }[a.reason] || a.reason), td(a.count), td(new Date(a.last).toLocaleString('vi-VN'))]);
        })) : h('div', { class: 'muted', text: 'Không có.' })])
      ]);
    });
  }

  function btn(text, fn, cls) { return h('button', { class: 'btn sm ' + (cls || ''), style: 'margin:2px 4px 2px 0', text: text, onclick: fn }); }
  function act(p) { return p.then(function () { toast('Đã cập nhật'); reload(); }, fail); }

  function vQueues() {
    return Promise.all([api('GET', 'admin/shipments?attention=1'), api('GET', 'admin/bank-inbox'), api('GET', 'admin/withdrawals'), api('GET', 'admin/claims')]).then(function (r) {
      var ships = r[0].shipments, inbox = r[1].items.filter(function (x) { return x.status === 'unmatched' || x.status === 'needs_review'; });
      var wds = r[2].items.filter(function (x) { return ['requested', 'approved', 'paying', 'unknown'].indexOf(x.status) >= 0; });
      var cls = r[3].items.filter(function (x) { return x.status === 'received' || x.status === 'forwarded'; });

      var sCard = h('div', { class: 'card' }, [h('h2', { text: 'Đơn cần kiểm tra tay (' + ships.length + ')' }), ships.length ? table(['Mã tham chiếu', 'Hãng', 'Vấn đề', 'Tiền', ''], ships.map(function (s) {
        return h('tr', {}, [td(s.carrierRef), td(s.carrier), td({ create_unknown: 'Không rõ hãng đã tạo đơn chưa', fee_drift: 'Cước hãng lệch nhiều', cancel_unknown: 'Hủy chưa rõ kết quả' }[s.needsAttention] || s.needsAttention), td(s.paymentStatus + ' · ' + vnd(s.sellPrice)),
          td(s.paymentStatus === 'held' ? h('span', {}, [
            btn('Hãng ĐÃ tạo', function () { var code = prompt('Nhập mã vận đơn của hãng:'); if (!code) return; act(api('POST', 'admin/shipments/' + s.id + '/resolve', { action: 'created', carrierCode: code, reason: 'xác nhận với hãng' })); }),
            btn('Hãng CHƯA tạo', function () { if (confirm('Xác nhận hãng chưa có đơn này? Tiền sẽ hoàn về ví người dùng.')) act(api('POST', 'admin/shipments/' + s.id + '/resolve', { action: 'not_created', reason: 'xác nhận với hãng' })); }, 'ghost')
          ]) : '')]);
      })) : h('div', { class: 'muted', text: 'Không có.' })]);

      var bCard = h('div', { class: 'card' }, [h('h2', { text: 'Tiền về chưa ghép (' + inbox.length + ')' }), inbox.length ? table(['Mã GD', 'Số tiền', 'Nội dung', 'Ghi chú', ''], inbox.map(function (x) {
        return h('tr', {}, [td(x.bank_tx_id), td(vnd(x.amount)), td(x.content), td(x.note), td(btn('Ghép cho user…', function () {
          var uid2 = prompt('Cộng ' + vnd(x.amount) + ' cho ID người dùng:'); if (!uid2) return;
          act(api('POST', 'admin/bank-inbox/' + encodeURIComponent(x.bank_tx_id) + '/match', { userId: Number(uid2), reason: 'ghép tay' }));
        }))]);
      })) : h('div', { class: 'muted', text: 'Không có.' })]);

      var wCard = h('div', { class: 'card' }, [h('h2', { text: 'Rút tiền (' + wds.length + ')' }), wds.length ? table(['Người dùng', 'Số tiền', 'Tài khoản nhận', 'Trạng thái', 'Thao tác'], wds.map(function (x) {
        var a = x.bankAccountFull;
        var ops = [];
        var call = function (action, extra) { return function () { act(api('POST', 'admin/withdrawals/' + x.id + '/' + action, extra || {})); }; };
        if (x.status === 'requested') { ops.push(btn('Duyệt', call('approve'))); ops.push(btn('Từ chối', function () { if (confirm('Từ chối và hoàn tiền về ví?')) call('reject', { note: 'từ chối' })(); }, 'ghost')); }
        if (x.status === 'approved') { ops.push(btn('Bắt đầu chi', call('start'))); ops.push(btn('Từ chối', call('reject', { note: 'từ chối' }), 'ghost')); }
        if (x.status === 'paying' || x.status === 'unknown') {
          ops.push(btn('Đã chi', function () { var ref = prompt('Mã giao dịch ngân hàng:'); if (ref) call('paid', { bankRef: ref })(); }));
          ops.push(btn('Chưa chi → hoàn ví', function () { if (confirm('Chỉ chọn khi đã đối soát chắc chắn CHƯA chuyển tiền.')) call('fail', { note: 'đối soát: chưa chi' })(); }, 'ghost'));
          if (x.status === 'paying') ops.push(btn('Không rõ', call('unknown', { note: 'kết quả chuyển không rõ' }), 'ghost'));
        }
        return h('tr', {}, [td('#' + x.userId), td(vnd(x.amount)), td(a.bank + ' · ' + a.number + ' · ' + a.holder + ' · tham chiếu ' + x.payoutRef), td(x.status + (new Date(x.notBefore) > new Date() ? ' (chờ đến ' + new Date(x.notBefore).toLocaleString('vi-VN') + ')' : '')), td(h('span', {}, ops))]);
      })) : h('div', { class: 'muted', text: 'Không có.' })]);

      var cCard = h('div', { class: 'card' }, [h('h2', { text: 'Khiếu nại (' + cls.length + ')' }), cls.length ? table(['#', 'Loại', 'Mô tả', 'Hạn', 'Trạng thái', ''], cls.map(function (c) {
        var post = function (status, extra) { return function () { act(api('POST', 'admin/claims/' + c.id, Object.assign({ status: status }, extra || {}))); }; };
        var ops = [];
        if (c.status === 'received') ops.push(btn('Đã chuyển hãng', function () { var ref = prompt('Mã hồ sơ bên hãng (nếu có):') || ''; post('forwarded', { partnerRef: ref })(); }));
        ops.push(btn('Giải quyết', function () { var amt = parseInt(prompt('Tiền bồi thường đã NHẬN từ hãng để chuyển cho khách (0 nếu không):', '0'), 10) || 0; post('resolved', amt ? { compensation: amt } : {})(); }));
        ops.push(btn('Từ chối', post('rejected'), 'ghost'));
        return h('tr', {}, [td(c.id), td(c.kind), td(c.description), td(new Date(c.deadline).toLocaleDateString('vi-VN')), td(c.status), td(h('span', {}, ops))]);
      })) : h('div', { class: 'muted', text: 'Không có.' })]);
      mount([sCard, bCard, wCard, cCard]);
    });
  }

  function vPricing() {
    return Promise.all([api('GET', 'admin/pricing-rules'), api('GET', 'admin/list-prices')]).then(function (r) {
      var rules = r[0].rules, prices = r[1].prices;
      mount([
        h('div', { class: 'card' }, [h('h2', { text: 'Quy tắc giá và biên' }), table(['Hãng', 'Tuyến', 'Biên %', 'Biên tối thiểu', 'Làm tròn', 'Cần trần', 'Cho lỗ', 'Bật'], rules.map(function (x) {
          return h('tr', {}, [td(x.carrier), td(x.route), td(x.margin_pct), td(vnd(x.margin_min)), td(x.rounding), td(x.require_cap ? 'có' : 'không'), td(x.allow_loss ? 'có' : 'không'), td(x.active ? 'có' : 'không')]);
        })),
          h('h3', { class: 'mt2', text: 'Thêm / sửa quy tắc' }),
          h('div', { class: 'row wrap' }, [
            h('div', { class: 'col' }, [field('Hãng (* = mọi hãng)', h('input', { type: 'text', id: 'r-car', value: '*' }))]),
            h('div', { class: 'col' }, [field('Tuyến (* hoặc a>b)', h('input', { type: 'text', id: 'r-route', value: '*' }))])
          ]),
          h('div', { class: 'row wrap' }, [
            h('div', { class: 'col' }, [field('Biên %', h('input', { type: 'number', id: 'r-pct', value: '8' }))]),
            h('div', { class: 'col' }, [field('Biên tối thiểu (đ)', h('input', { type: 'number', id: 'r-min', value: '1000' }))]),
            h('div', { class: 'col' }, [field('Làm tròn (đ)', h('input', { type: 'number', id: 'r-round', value: '500' }))])
          ]),
          h('label', { class: 'inline mt' }, [h('input', { type: 'checkbox', id: 'r-cap', checked: true }), h('span', { text: 'Bắt buộc có giá niêm yết đáng tin mới cho bán (khuyến nghị)' })]),
          h('label', { class: 'inline mt' }, [h('input', { type: 'checkbox', id: 'r-loss' }), h('span', { text: 'Cho phép bán lỗ có kiểm soát' })]),
          h('button', { class: 'btn', text: 'Lưu quy tắc', onclick: function () {
            act(api('PUT', 'admin/pricing-rules', { carrier: val('r-car'), route: val('r-route'), margin_pct: Number(val('r-pct')), margin_min: parseInt(val('r-min'), 10), rounding: parseInt(val('r-round'), 10), require_cap: document.getElementById('r-cap').checked, allow_loss: document.getElementById('r-loss').checked }));
          } })
        ]),
        h('div', { class: 'card' }, [h('h2', { text: 'Giá niêm yết công bố của hãng' }), h('div', { class: 'muted small mb', text: 'Dùng làm trần khi hãng/đơn vị tổng hợp không trả giá niêm yết. Phải ghi nguồn và người phụ trách; giá cũ quá 72 giờ không còn được tính là đáng tin.' }),
          prices.length ? table(['Hãng', 'Dịch vụ', 'Tuyến', 'Đến (g)', 'Giá', 'Nguồn', 'Phụ trách', 'Xác nhận'], prices.map(function (x) {
            return h('tr', {}, [td(x.carrier), td(x.service), td(x.route), td(x.max_weight_g), td(vnd(x.price)), td(x.source), td(x.owner), td(new Date(x.verified_at).toLocaleString('vi-VN'))]);
          })) : h('div', { class: 'muted', text: 'Chưa có.' }),
          h('h3', { class: 'mt2', text: 'Thêm / xác nhận lại giá' }),
          h('div', { class: 'row wrap' }, [
            h('div', { class: 'col' }, [field('Hãng', h('input', { type: 'text', id: 'p-car' }))]), h('div', { class: 'col' }, [field('Dịch vụ', h('input', { type: 'text', id: 'p-svc' }))]), h('div', { class: 'col' }, [field('Tuyến', h('input', { type: 'text', id: 'p-route', value: '*' }))])
          ]),
          h('div', { class: 'row wrap' }, [
            h('div', { class: 'col' }, [field('Đến khối lượng (g)', h('input', { type: 'number', id: 'p-w', value: '500' }))]), h('div', { class: 'col' }, [field('Giá (đ)', h('input', { type: 'number', id: 'p-price' }))])
          ]),
          field('Nguồn (bảng giá, ngày công bố)', h('input', { type: 'text', id: 'p-src' })), field('Người phụ trách', h('input', { type: 'text', id: 'p-owner' })),
          h('label', { class: 'inline mt' }, [h('input', { type: 'checkbox', id: 'p-vat' }), h('span', { text: 'Giá đã gồm VAT' })]),
          h('button', { class: 'btn', text: 'Lưu giá niêm yết', onclick: function () {
            act(api('PUT', 'admin/list-prices', { carrier: val('p-car'), service: val('p-svc'), route: val('p-route') || '*', max_weight_g: parseInt(val('p-w'), 10), price: parseInt(val('p-price'), 10), source: val('p-src'), owner: val('p-owner'), vat_included: document.getElementById('p-vat').checked }));
          } })
        ]),
        h('div', { class: 'card' }, [h('h2', { text: 'Ký quỹ với đơn vị tổng hợp' }),
          field('Ngưỡng ký quỹ tối thiểu (đ) — dưới ngưỡng sẽ ẩn mọi offer; 0 = tắt', h('input', { type: 'number', id: 'd-min', value: '0' })),
          h('button', { class: 'btn ghost', text: 'Lưu ngưỡng', onclick: function () { act(api('PUT', 'admin/settings', { key: 'deposit_min', value: parseInt(val('d-min'), 10) })); } }),
          h('h3', { class: 'mt2', text: 'Ghi nhận khoản đã nạp ký quỹ' }),
          field('Số tiền (đ)', h('input', { type: 'number', id: 'k-amt' })), field('Mã tham chiếu giao dịch (duy nhất)', h('input', { type: 'text', id: 'k-ref' })),
          h('button', { class: 'btn', text: 'Ghi nhận', onclick: function () { act(api('POST', 'admin/aggregator-deposit', { amount: parseInt(val('k-amt'), 10), ref: val('k-ref'), reason: 'nạp ký quỹ' })); } })
        ])
      ]);
    });
  }

  function vUsers() {
    mount([h('div', { class: 'card' }, [h('h2', { text: 'Cấp mã đăng nhập' }),
      h('div', { class: 'muted small mb', text: 'Khi chưa có kênh SMS: nhập số điện thoại, hệ thống tạo mã 6 số dùng một lần (hiệu lực 15 phút). Gửi mã đó cho người dùng qua Zalo hoặc tin nhắn.' }),
      field('Số điện thoại', h('input', { type: 'tel', id: 'o-phone', inputmode: 'tel' })),
      h('button', { class: 'btn', text: 'Tạo mã', onclick: function () {
        api('POST', 'admin/otp', { phone: val('o-phone') }).then(function (r) {
          var box = document.getElementById('o-res'); clear(box);
          box.appendChild(h('div', { class: 'code-box' }, [h('div', { class: 'muted small', text: 'Mã đăng nhập cho ' + r.phone + ' (hết hạn ' + new Date(r.expiresAt).toLocaleTimeString('vi-VN') + ')' }), h('div', { class: 'code', text: r.code })]));
        }, fail);
      } }), h('div', { id: 'o-res' })]),
      h('div', { class: 'card' }, [h('h2', { text: 'Tìm người dùng theo số điện thoại' }), field('Số điện thoại (ít nhất 4 số)', h('input', { type: 'text', id: 'u-q', inputmode: 'numeric' })),
      h('button', { class: 'btn', text: 'Tìm', onclick: search })]), h('div', { id: 'u-res' })]);
    return Promise.resolve();
    function search() {
      api('GET', 'admin/users?q=' + encodeURIComponent(val('u-q'))).then(function (r) {
        var box = document.getElementById('u-res'); clear(box);
        if (!r.users.length) return box.appendChild(h('div', { class: 'card empty', text: 'Không tìm thấy.' }));
        box.appendChild(h('div', { class: 'card' }, [table(['ID', 'Số điện thoại', 'Tên', 'Số dư', ''], r.users.map(function (u) {
          return h('tr', {}, [td(u.id), td(u.phone), td(u.name || ''), td(vnd(u.balance)), td(btn('Cộng ví', function () {
            var amt = parseInt(prompt('Số tiền cộng (đ) cho ' + u.phone + ':'), 10); if (!amt) return;
            var why = prompt('Lý do (bắt buộc, ví dụ: khách chuyển khoản ngoài hệ thống, mã GD …):'); if (!why) return;
            act(api('POST', 'admin/credit', { userId: u.id, amount: amt, reason: why }, { 'Idempotency-Key': uid() })).then(search);
          }))]);
        }))]));
      }, fail);
    }
  }

  function vAudit() {
    return api('GET', 'admin/audit').then(function (r) {
      mount([h('div', { class: 'card' }, [h('h2', { text: 'Nhật ký thao tác (chỉ ghi thêm)' }), table(['Giờ', 'Hành động', 'Đối tượng', 'Trước', 'Sau', 'Lý do'], r.items.map(function (a) {
        return h('tr', {}, [td(new Date(a.at).toLocaleString('vi-VN')), td(a.action), td(a.target), td(a.before ? JSON.stringify(a.before).slice(0, 120) : ''), td(a.after ? JSON.stringify(a.after).slice(0, 120) : ''), td(a.reason)]);
      }))])]);
    });
  }

  document.getElementById('logout').addEventListener('click', function () { api('POST', 'auth/logout', {}).then(showLogin, showLogin); });
  api('GET', 'me').then(function (r) { if (r.admin) show('overview'); else showLogin(); }, showLogin);
})();
