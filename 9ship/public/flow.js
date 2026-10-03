/* 9Ship — luồng gửi hàng: trang chủ, chọn hãng, quầy gần bạn, thanh toán (ES5). */
(function () {
  'use strict';
  var S9 = window.S9, S = S9.S, h = S9.h;
  var val = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };

  function addrById(id) {
    var r = null;
    (S9.addrs || []).forEach(function (a) { if (a.id === id) r = a; });
    return r;
  }
  function resolveParties() {
    S.sender = addrById(S.draft.senderId);
    S.receiver = addrById(S.draft.receiverId);
  }

  function leg(kind, a, onTap) {
    var isFrom = kind === 'from';
    return h('button', { type: 'button', class: 'leg ' + (isFrom ? 'from' : 'to'), onclick: onTap, 'aria-label': isFrom ? 'Chọn người gửi' : 'Chọn người nhận' }, [
      h('span', { class: 'dot' }, [S9.ico(isFrom ? 'box' : 'pin', 18)]),
      h('span', { class: 'body' }, a ? [
        h('div', { class: 'lb', text: isFrom ? 'Người gửi' : 'Người nhận' }),
        h('div', { class: 'nm trunc', text: a.contact + ' · ' + a.phone }),
        h('div', { class: 'ad', text: S9.addrLine(a) })
      ] : [
        h('div', { class: 'lb', text: isFrom ? 'Người gửi' : 'Người nhận' }),
        h('div', { class: 'nm ph', text: isFrom ? 'Chọn hoặc thêm địa chỉ người gửi' : 'Chọn hoặc thêm địa chỉ người nhận' })
      ]),
      h('span', { class: 'chev' }, [S9.ico('chev', 20)])
    ]);
  }

  // ---------- Trang chủ: tạo đơn ----------
  S9.routes.home = function () {
    S9.frame({ mode: 'main', tab: '' });
    S9.skeleton();
    S9.loadAddresses(true).then(function () {
      resolveParties();
      draw();
    }, function (e) { S9.fail(e); });

    function draw() {
      var d = S.draft;
      d.kg = d.kg || 1; d.goods = d.goods || 'general'; d.handover = d.handover || 'dropoff';
      var name = (S.user && S.user.name) || '';
      var recent = (S9.addrs || []).filter(function (a) { return a.useCount > 0 && a.id !== d.senderId && a.id !== d.receiverId; })
        .sort(function (a, b) { return String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)); }).slice(0, 8);

      var route = h('div', { class: 'card route' }, [
        leg('from', S.sender, function () { S9.pickAddress({ title: 'Người gửi', sender: true, selectedId: d.senderId }, function (a) { d.senderId = a.id; S9.saveDraft(); S9.addrs = null; S9.loadAddresses(true).then(function () { resolveParties(); draw(); }); }); }),
        leg('to', S.receiver, function () { S9.pickAddress({ title: 'Người nhận', sender: false, selectedId: d.receiverId }, function (a) { d.receiverId = a.id; S9.saveDraft(); S9.addrs = null; S9.loadAddresses(true).then(function () { resolveParties(); draw(); }); }); })
      ]);

      var recentRow = recent.length ? h('div', {}, [
        h('div', { class: 'sec', text: 'Gửi lại cho' }),
        h('div', { style: 'display:flex;overflow-x:auto;margin:0 -16px;padding:0 16px 8px;-webkit-overflow-scrolling:touch' }, recent.map(function (a) {
          return h('button', { type: 'button', class: 'card', style: 'flex:none;width:200px;margin:0 10px 6px 0;padding:12px;text-align:left', onclick: function () { d.receiverId = a.id; S9.saveDraft(); resolveParties(); draw(); } }, [
            h('div', { class: 'row' }, [S9.avatar(a.contact), h('div', { class: 'body', style: 'min-width:0' }, [h('div', { class: 'b trunc', text: a.contact }), h('div', { class: 'muted small trunc', text: a.provinceName })])])
          ]);
        }))
      ]) : null;

      var kgInput = h('input', { type: 'number', id: 'kg', step: '0.1', min: '0.1', max: '30', inputmode: 'decimal', value: String(d.kg), 'aria-label': 'Khối lượng kg' });
      kgInput.addEventListener('input', function () { d.kg = parseFloat(this.value) || 0; S9.saveDraft(); markOpts(); });
      function setKg(v) { v = Math.max(0.1, Math.min(30, Math.round(v * 10) / 10)); d.kg = v; kgInput.value = String(v); S9.saveDraft(); markOpts(); }
      var optBtns = [0.5, 1, 2, 5].map(function (v) { return h('button', { type: 'button', class: 'opt', 'data-v': String(v), text: v + ' kg', onclick: function () { setKg(v); } }); });
      function markOpts() { optBtns.forEach(function (b) { b.className = 'opt' + (parseFloat(b.getAttribute('data-v')) === d.kg ? ' on' : ''); }); }

      var goods = h('select', { id: 'goods', 'aria-label': 'Loại hàng', onchange: function () { d.goods = this.value; S9.saveDraft(); } },
        S9.meta.goodsTypes.map(function (g) { return h('option', { value: g.code, text: g.label, selected: g.code === d.goods ? true : null }); }));

      var parcel = h('div', { class: 'card' }, [
        h('h2', { text: 'Thông tin hàng' }),
        h('label', { class: 'f', text: 'Khối lượng', style: 'margin-top:0' }),
        h('div', { class: 'stepper' }, [h('button', { type: 'button', 'aria-label': 'Giảm', text: '−', onclick: function () { setKg((d.kg || 1) - 0.5); } }), kgInput, h('button', { type: 'button', 'aria-label': 'Tăng', text: '+', onclick: function () { setKg((d.kg || 0) + 0.5); } })]),
        h('div', { class: 'opts mt' }, optBtns),
        h('label', { class: 'f', text: 'Loại hàng' }), goods,
        h('label', { class: 'f', text: 'Giá trị hàng (để tính bảo hiểm, không bắt buộc)' }),
        h('input', { type: 'number', id: 'declared', min: '0', step: '1000', inputmode: 'numeric', placeholder: '0', value: d.declared || '', oninput: function () { d.declared = parseInt(this.value, 10) || 0; S9.saveDraft(); } }),
        h('details', { class: 'mt' }, [
          h('summary', { class: 'link', text: 'Kiện cồng kềnh? Nhập kích thước' }),
          h('div', { class: 'row mt' }, [['l', 'Dài'], ['w', 'Rộng'], ['hh', 'Cao']].map(function (x, i) {
            return h('div', { class: 'col' }, [h('input', { type: 'number', min: '1', max: '200', inputmode: 'numeric', placeholder: x[1] + ' cm', value: d[x[0]] || '', 'aria-label': x[1] + ' cm', oninput: function () { d[x[0]] = parseInt(this.value, 10) || 0; S9.saveDraft(); } })]);
          }))
        ]),
        h('label', { class: 'f', text: 'Cách bàn giao' }),
        h('div', { class: 'seg', id: 'handover' }, [
          h('button', { type: 'button', class: d.handover === 'dropoff' ? 'on' : '', text: 'Gửi tại bưu cục', onclick: function () { d.handover = 'dropoff'; S9.saveDraft(); draw(); } }),
          h('button', { type: 'button', class: d.handover === 'pickup' ? 'on' : '', text: 'Lấy tận nơi', onclick: function () { d.handover = 'pickup'; S9.saveDraft(); draw(); } })
        ]),
        h('div', { class: 'muted small mt', text: S9.meta.notice })
      ]);

      var hello = h('div', {}, [h('div', { class: 'h1', text: name ? 'Xin chào, ' + name : 'Gửi hàng' }), h('p', { class: 'sub', text: 'Chọn người gửi, người nhận và thông tin hàng để so giá các hãng.' })]);
      S9.mount([S.notice ? h('div', { class: 'alert info', text: S.notice }) : null, hello, route, recentRow, parcel]);
      S.notice = '';
      markOpts();
      S9.setCta(h('button', { type: 'button', class: 'btn', id: 'go', text: 'So sánh giá', onclick: submit }));
    }

    function submit() {
      var d = S.draft;
      if (!S.sender) return S9.toast('Hãy chọn người gửi');
      if (!S.receiver) return S9.toast('Hãy chọn người nhận');
      if (!(d.kg > 0) || d.kg > 30) return S9.toast('Khối lượng cần từ 0,1 đến 30 kg');
      var req = {
        from: { province: S.sender.province, ward: S.sender.ward },
        to: { province: S.receiver.province, ward: S.receiver.ward },
        weightG: Math.round(d.kg * 1000),
        declaredValue: Math.max(0, d.declared || 0),
        goodsType: d.goods,
        handover: d.handover
      };
      if (S.sender.lat !== null && S.sender.lat !== undefined) { req.from.lat = S.sender.lat; req.from.lng = S.sender.lng; }
      if (d.l && d.w && d.hh) req.dims = { l: d.l, w: d.w, h: d.hh };
      var btn = document.getElementById('go');
      btn.disabled = true; btn.textContent = 'Đang so giá các hãng…';
      S9.api('POST', 'quotes', req).then(function (q) {
        S.quote = q; S.req = req; S.offer = null; S.idem = null; S9.sortKey = 'price';
        S9.saveFlow();
        S9.go('#/quote');
      }, function (e) { btn.disabled = false; btn.textContent = 'So sánh giá'; S9.fail(e); });
    }
  };

  // ---------- Chọn hãng ----------
  S9.sortKey = 'price';
  S9.routes.quote = function () {
    if (!S.quote || !S.req) return S9.go('#/');
    resolveParties();
    S9.frame({ mode: 'flow', title: 'Chọn hãng vận chuyển', back: '#/' });
    var offers = S.quote.offers.slice();
    if (S9.sortKey === 'fast') offers.sort(function (a, b) { return a.etaDays[1] - b.etaDays[1] || a.sellPrice - b.sellPrice; });
    else if (S9.sortKey === 'near') offers.sort(function (a, b) {
      var da = a.pickupPoints.length ? a.pickupPoints[0].distanceKm : 1e9, db = b.pickupPoints.length ? b.pickupPoints[0].distanceKm : 1e9;
      return da - db || a.sellPrice - b.sellPrice;
    });
    var sum = h('div', { class: 'card', style: 'padding:12px 16px' }, [
      h('div', { class: 'row sb' }, [
        h('div', { class: 'body', style: 'min-width:0' }, [h('div', { class: 'b trunc', text: S9.provinceName(S.req.from.province) + '  →  ' + S9.provinceName(S.req.to.province) }), h('div', { class: 'muted small', text: (S.req.weightG / 1000) + ' kg · ' + (S.req.handover === 'dropoff' ? 'Gửi tại bưu cục' : 'Lấy tận nơi') })]),
        h('a', { href: '#/', class: 'link sp', text: 'Sửa' })
      ])
    ]);
    var chips = offers.length > 1 ? h('div', { class: 'opts' }, [['price', 'Rẻ nhất'], ['fast', 'Nhanh nhất'], ['near', 'Quầy gần nhất']].map(function (c) {
      return h('button', { type: 'button', class: 'opt' + (S9.sortKey === c[0] ? ' on' : ''), text: c[1], onclick: function () { S9.sortKey = c[0]; S9.routes.quote(); } });
    })) : null;
    var list;
    if (offers.length) list = offers.map(offerCard);
    else {
      var none = !(S9.meta.carriers && S9.meta.carriers.length);
      list = [h('div', { class: 'card empty' }, [
        h('div', { class: 'ei' }, [S9.ico('truck', 30)]),
        h('div', { class: 'b', text: none ? 'Chưa có hãng vận chuyển nào được kết nối' : 'Chưa có hãng nào nhận đơn này' }),
        h('div', { class: 'small mt', text: none ? 'Ứng dụng đang chờ kết nối API các hãng. Bạn sẽ báo giá và gửi được ngay khi có ít nhất một hãng.' : 'Thử đổi cách bàn giao, loại hàng hoặc khối lượng, rồi so giá lại.' })
      ])];
    }
    S9.mount([sum, chips].concat(list));
  };

  function offerCard(o) {
    var pt = o.pickupPoints[0];
    var eta = o.etaDays[0] === o.etaDays[1] ? o.etaDays[0] + ' ngày' : o.etaDays[0] + '–' + o.etaDays[1] + ' ngày';
    var tagMap = { cheapest: ['Rẻ nhất', 'green'], fastest: ['Nhanh nhất', 'blue'], nearest: ['Quầy gần nhất', ''] };
    return h('div', { class: 'card offer' }, [
      h('div', {}, o.tags.map(function (t) { return tagMap[t] ? h('span', { class: 'tag ' + tagMap[t][1], text: tagMap[t][0] }) : null; })),
      h('div', { class: 'row top' }, [
        S9.avatar(o.carrierName),
        h('div', { class: 'col' }, [h('h3', { text: o.carrierName }), h('div', { class: 'muted', text: o.serviceName + ' · ' + eta })]),
        h('div', { style: 'text-align:right;flex:none;margin-left:8px' }, [h('div', { class: 'price', text: S9.vnd(o.sellPrice) }), o.listPrice ? h('div', { class: 'was', text: S9.vnd(o.listPrice) }) : null])
      ]),
      o.saved > 0 ? h('div', { class: 'save mt', text: 'Tiết kiệm ' + S9.vnd(o.saved) + ' so với giá niêm yết' }) : null,
      pt ? h('div', { class: 'pt' }, [S9.ico('pin', 16), h('div', {}, [h('b', { text: pt.name }), h('div', { class: 'muted', text: pt.distanceKm + ' km · ' + (pt.hours || 'hỏi giờ mở cửa tại quầy') })])]) : null,
      h('div', { class: 'row mt' }, [
        h('button', { type: 'button', class: 'btn sm', text: 'Chọn hãng này', onclick: function () { S.offer = o; S.idem = null; S9.saveFlow(); S9.go('#/checkout'); } }),
        o.pickupPoints.length ? h('button', { type: 'button', class: 'link', style: 'margin-left:16px', text: 'Xem các quầy', onclick: function () { S.offer = o; S9.saveFlow(); S9.go('#/points'); } }) : null
      ])
    ]);
  }

  // ---------- Quầy gần bạn ----------
  S9.routes.points = function () {
    if (!S.offer || !S.req) return S9.go('#/');
    S9.frame({ mode: 'flow', title: 'Quầy ' + S.offer.carrierName, back: '#/quote' });
    var o = S.offer;
    var from = S.req.from;
    var nodes = [];
    if (from.lat === undefined) {
      return S9.mount([h('div', { class: 'card empty' }, [h('div', { class: 'ei' }, [S9.ico('gps', 30)]), h('div', { class: 'b', text: 'Chưa có vị trí của bạn' }),
        h('div', { class: 'small mt', text: 'Vào Sổ địa chỉ, sửa địa chỉ người gửi và bấm "Dùng vị trí hiện tại" để thấy quầy gần nhất.' })])]);
    }
    S9.skeleton();
    S9.api('GET', 'pickup-points?lat=' + from.lat + '&lng=' + from.lng + '&carrier=' + encodeURIComponent(o.carrier) + '&radiusKm=25').then(function (r) {
      if (!r.points.length) nodes.push(h('div', { class: 'card empty', text: 'Chưa có dữ liệu quầy của hãng này quanh bạn. Bạn vẫn có thể chọn "Lấy tận nơi".' }));
      r.points.forEach(function (p) {
        nodes.push(h('div', { class: 'card' }, [
          h('h3', { text: p.name }), h('div', { class: 'muted', text: p.address }),
          h('div', { class: 'row sb mt' }, [h('span', { class: 'small', text: p.distanceKm + ' km · ' + (p.hours || '') }),
            h('a', { class: 'link', target: '_blank', rel: 'noopener', href: 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng, text: 'Chỉ đường ›' })])
        ]));
      });
      S9.mount(nodes);
    }, S9.fail);
  };

  // ---------- Xác nhận và thanh toán ----------
  function bufferFor(sell) { return Math.max(S9.meta.bufferMin, Math.ceil(sell * S9.meta.bufferPct / 100 / 500) * 500); }
  S9.routes.checkout = function () {
    if (!S.offer || !S.quote || !S.req) return S9.go('#/');
    resolveParties();
    if (!S.sender || !S.receiver) return S9.go('#/');
    S9.frame({ mode: 'flow', title: 'Xác nhận đơn', back: '#/quote' });
    S9.skeleton();
    S9.refreshWallet().then(function (w) {
      var o = S.offer, req = S.req;
      var buffer = bufferFor(o.sellPrice), need = o.sellPrice + buffer;
      var bal = w ? w.balance : 0;
      var short = bal < need;

      var route = h('div', { class: 'card route' }, [leg('from', S.sender, function () { S9.go('#/'); }), leg('to', S.receiver, function () { S9.go('#/'); })]);
      var carrier = h('div', { class: 'card' }, [
        h('div', { class: 'row top' }, [S9.avatar(o.carrierName), h('div', { class: 'col' }, [h('h3', { text: o.carrierName }), h('div', { class: 'muted', text: o.serviceName + ' · giao trong ' + (o.etaDays[0] === o.etaDays[1] ? o.etaDays[0] : o.etaDays[0] + '–' + o.etaDays[1]) + ' ngày' })]),
          h('a', { href: '#/quote', class: 'link sp', text: 'Đổi' })])
      ]);
      var points = (req.handover === 'dropoff' && o.pickupPoints.length) ? h('div', { class: 'card' }, [h('h2', { text: 'Mang hàng đến quầy' })].concat(o.pickupPoints.map(function (p, i) {
        return h('label', { class: 'inline', style: 'padding:9px 0' }, [h('input', { type: 'radio', name: 'pp', value: p.id, checked: i === 0 }), h('span', {}, [h('b', { text: p.name }), h('div', { class: 'muted small', text: p.distanceKm + ' km · ' + p.address })])]);
      }))) : (req.handover === 'pickup' ? h('div', { class: 'alert info', text: 'Nhân viên hãng sẽ liên hệ người gửi để lấy hàng tại địa chỉ đã chọn.' }) : null);

      var sum = h('div', { class: 'card' }, [
        h('h2', { text: 'Chi phí' }),
        S9_kv('Cước vận chuyển', S9.vnd(o.sellPrice)),
        o.saved > 0 ? S9_kv('Đã tiết kiệm so với niêm yết', S9.vnd(o.saved)) : null,
        S9_kv('Tạm giữ phòng hãng cân lại', S9.vnd(buffer)),
        S9_kv('Số dư ví', S9.vnd(bal)),
        h('div', { class: 'muted small mt', text: 'Khoản tạm giữ được hoàn lại vào ví khi hãng xác nhận cước cuối. Bạn chỉ trả thêm nếu hãng cân hoặc đo thấy kiện lớn hơn khai báo.' }),
        short ? h('div', { class: 'alert mt', text: 'Ví còn thiếu ' + S9.vnd(need - bal) + '. Hãy nạp thêm để tiếp tục.' }) : null,
        short ? h('button', { type: 'button', class: 'btn ghost', text: 'Nạp ví', onclick: function () { S9.store('topupAmount', Math.max(10000, Math.ceil((need - bal) / 10000) * 10000)); S9.go('#/me'); } }) : null
      ]);
      var ack = h('label', { class: 'inline', style: 'padding:6px 4px 16px;font-size:14px' }, [h('input', { type: 'checkbox', id: 'ack' }), h('span', { text: 'Tôi cam kết không gửi hàng cấm và thông tin khai báo là đúng.' })]);
      S9.mount([route, carrier, points, sum, ack]);
      S9.setCta(h('div', {}, [
        h('div', { class: 'tot' }, [h('span', { text: 'Thanh toán từ ví' }), h('b', { text: S9.vnd(o.sellPrice) })]),
        h('button', { type: 'button', class: 'btn', id: 'pay', text: short ? 'Cần nạp thêm tiền' : 'Thanh toán và tạo đơn', disabled: short ? true : null, onclick: pay })
      ]));
    }, S9.fail);

    function pay() {
      if (!document.getElementById('ack').checked) return S9.toast('Hãy tick cam kết không gửi hàng cấm');
      var party = function (a) { return { contact: a.contact, phone: a.phone, street: a.street, ward: a.ward, province: a.province }; };
      var body = { quoteId: S.quote.quoteId, offerId: S.offer.offerId, sender: party(S.sender), receiver: party(S.receiver) };
      var pp = document.querySelector('input[name=pp]:checked');
      if (pp) body.pickupPointId = pp.value;
      if (!S.idem) { S.idem = S9.uid(); S9.saveFlow(); }
      var btn = document.getElementById('pay');
      btn.disabled = true; btn.textContent = 'Đang tạo đơn với hãng…';
      S9.api('POST', 'shipments', body, { 'Idempotency-Key': S.idem }).then(function (sh) {
        S.quote = null; S.offer = null; S.idem = null; S9.store('flow', null);
        S.draft.receiverId = null; S9.saveDraft();
        S9.addrs = null; S9.refreshWallet();
        S9.go('#/ticket/' + sh.id);
      }, function (e) {
        btn.disabled = false; btn.textContent = 'Thanh toán và tạo đơn';
        if (e.code === 'price_changed' && e.details && e.details.quote) {
          S.quote = e.details.quote; S.offer = null; S.idem = null; S9.saveFlow();
          S9.toast('Giá của hãng vừa thay đổi. Vui lòng chọn lại.');
          return S9.go('#/quote');
        }
        if (e.code === 'idempotency_conflict') {
          S9.toast('Yêu cầu tạo đơn trước đó đã được ghi nhận. Kiểm tra mục Đơn hàng.');
          S.idem = null; S9.store('flow', null);
          return S9.go('#/orders');
        }
        if (e.code === 'quote_expired') { S.notice = 'Báo giá đã hết hạn, hãy so giá lại.'; S.quote = null; S9.store('flow', null); return S9.go('#/'); }
        S9.fail(e);
      });
    }
  };

  function S9_kv(k, v) { return h('div', { class: 'kv' }, [h('span', { text: k }), h('b', { text: v })]); }
  S9.kv = S9_kv;
})();
