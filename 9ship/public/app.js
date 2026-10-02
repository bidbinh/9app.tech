/* 9Ship — giao diện người dùng. JS cổ điển (ES5), không module, gọi API bằng đường dẫn tương đối. */
(function () {
  'use strict';

  var state = { meta: null, user: null, quote: null, offer: null, req: null, idem: null, notice: '', wallet: null };
  var view = document.getElementById('view');
  var timers = [];

  // Giữ báo giá đang chọn qua lần tải lại trang (chỉ trong phiên trình duyệt).
  function saveFlow() { store('flow', { quote: state.quote, offer: state.offer, req: state.req, geo: state.geo || null, idem: state.idem }); }
  function loadFlow() {
    var f = store('flow');
    if (!f) return;
    if (f.quote && f.quote.expiresAt && new Date(f.quote.expiresAt) < new Date()) { store('flow', null); return; }
    state.quote = f.quote || null; state.offer = f.offer || null; state.req = f.req || null; state.geo = f.geo || null; state.idem = f.idem || null;
  }

  // ---------- tiện ích ----------
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    var k;
    attrs = attrs || {};
    for (k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function vnd(n) { return (Math.round(n) || 0).toLocaleString('vi-VN') + ' đ'; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function mount(nodes) { clearTimers(); clear(view); view.className = ''; nodes.forEach(function (n) { if (n) view.appendChild(n); }); window.scrollTo(0, 0); }
  function clearTimers() { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; }
  function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast';
    setTimeout(function () { t.className = 'toast hidden'; }, 3200);
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k)); sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }
  function uid() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  function api(method, path, body, headers) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, 'v1/' + path, true);
      x.setRequestHeader('X-Requested-With', '9ship');
      if (body !== undefined && body !== null) x.setRequestHeader('Content-Type', 'application/json');
      var k;
      for (k in (headers || {})) x.setRequestHeader(k, headers[k]);
      x.onload = function () {
        var j = null;
        try { j = JSON.parse(x.responseText); } catch (e) { j = null; }
        if (x.status >= 200 && x.status < 300) return resolve(j);
        var err = (j && j.error) || {};
        reject({ status: x.status, code: err.code || 'error', message: err.message || 'Có lỗi xảy ra', details: err.details });
      };
      x.onerror = function () { reject({ status: 0, code: 'network', message: 'Không kết nối được máy chủ' }); };
      x.timeout = 30000;
      x.ontimeout = x.onerror;
      x.send(body !== undefined && body !== null ? JSON.stringify(body) : null);
    });
  }
  function fail(e) {
    if (e && e.status === 401) { state.user = null; renderWho(); return go('#/login'); }
    toast((e && e.message) || 'Có lỗi xảy ra');
  }

  var SHIP = {
    pending_carrier: ['Đang tạo đơn với hãng…', 'info'], created: ['Đã tạo đơn, chờ lấy hàng', 'info'], picked_up: ['Đã lấy hàng', 'info'],
    in_transit: ['Đang vận chuyển', 'info'], delivered: ['Đã giao', 'ok'], delivery_failed: ['Giao chưa thành công', 'warn'],
    returning: ['Đang hoàn hàng', 'warn'], returned: ['Đã hoàn', 'warn'], lost: ['Thất lạc', 'bad'], cancelled: ['Đã hủy', 'bad'], create_failed: ['Không tạo được đơn', 'bad']
  };
  function statusTag(s) { var m = SHIP[s] || [s, '']; return h('span', { class: 'status ' + m[1], text: m[0] }); }

  function me() {
    return api('GET', 'me').then(function (r) { state.user = r.user; renderWho(); return r.user; }, function () { return null; });
  }
  function renderWho() {
    var b = document.getElementById('who');
    b.textContent = state.user ? state.user.phone : 'Đăng nhập';
  }
  function needLogin(next) {
    if (state.user) return Promise.resolve(true);
    return me().then(function (u) { if (u) return true; store('next', next); go('#/login'); return false; });
  }
  function ensureMeta() {
    if (state.meta) return Promise.resolve(state.meta);
    return api('GET', 'meta').then(function (m) { state.meta = m; return m; });
  }
  function opt(value, label, sel) { return h('option', { value: value, text: label, selected: sel ? true : null }); }
  function provinceSelect(id, val) {
    var s = h('select', { id: id });
    s.appendChild(opt('', 'Chọn tỉnh / thành', false));
    state.meta.provinces.forEach(function (p) { s.appendChild(opt(p.code, p.name, p.code === val)); });
    return s;
  }
  function field(label, input) { return h('div', {}, [h('label', { class: 'f', text: label }), input]); }
  function kv(k, v) { return h('div', { class: 'kv' }, [h('span', { text: k }), h('b', { text: v })]); }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }

  // ---------- Gửi hàng ----------
  function viewSend() {
    ensureMeta().then(function () {
      var saved = store('send') || {};
      var geo = state.geo || saved.geo || null;
      var handover = saved.handover || 'dropoff';
      var form = h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); submit(); } }, [
        h('h2', { text: 'Gửi hàng đi đâu?' }),
        h('label', { class: 'f', text: 'Điểm đi' }), provinceSelect('f-prov', saved.fromProv),
        h('input', { type: 'text', id: 'f-ward', placeholder: 'Phường / xã (không bắt buộc)', value: saved.fromWard || '', class: 'mt' }),
        h('div', { class: 'row mt' }, [
          h('button', { type: 'button', class: 'btn ghost sm', id: 'geo-btn', text: geo ? '📍 Đã lấy vị trí' : '📍 Dùng vị trí hiện tại', onclick: getGeo }),
          h('span', { class: 'muted small', style: 'margin-left:10px', text: 'để tìm quầy gần bạn' })
        ]),
        h('label', { class: 'f', text: 'Điểm đến' }), provinceSelect('t-prov', saved.toProv),
        h('input', { type: 'text', id: 't-ward', placeholder: 'Phường / xã (không bắt buộc)', value: saved.toWard || '', class: 'mt' }),
        h('div', { class: 'row' }, [
          h('div', { class: 'col' }, [field('Khối lượng (kg)', h('input', { type: 'number', id: 'f-kg', step: '0.1', min: '0.1', max: '30', inputmode: 'decimal', placeholder: '0.5', value: saved.kg || '' }))]),
          h('div', { class: 'col' }, [field('Giá trị hàng (đ)', h('input', { type: 'number', id: 'f-val', min: '0', step: '1000', inputmode: 'numeric', placeholder: '0', value: saved.declared || '' }))])
        ]),
        h('details', { class: 'mt' }, [
          h('summary', { class: 'link', text: 'Kích thước (nếu kiện cồng kềnh)' }),
          h('div', { class: 'row mt' }, [
            h('div', { class: 'col' }, [h('input', { type: 'number', id: 'd-l', placeholder: 'Dài cm', min: '1', max: '200', value: saved.l || '' })]),
            h('div', { class: 'col' }, [h('input', { type: 'number', id: 'd-w', placeholder: 'Rộng cm', min: '1', max: '200', value: saved.w || '' })]),
            h('div', { class: 'col' }, [h('input', { type: 'number', id: 'd-h', placeholder: 'Cao cm', min: '1', max: '200', value: saved.hh || '' })])
          ])
        ]),
        field('Loại hàng', (function () {
          var s = h('select', { id: 'f-goods' });
          state.meta.goodsTypes.forEach(function (g) { s.appendChild(opt(g.code, g.label, g.code === (saved.goods || 'general'))); });
          return s;
        })()),
        h('label', { class: 'f', text: 'Cách bàn giao' }),
        h('div', { class: 'seg', id: 'f-handover' }, [
          h('button', { type: 'button', 'data-v': 'dropoff', class: handover === 'dropoff' ? 'on' : '', text: 'Gửi tại bưu cục', onclick: setHandover }),
          h('button', { type: 'button', 'data-v': 'pickup', class: handover === 'pickup' ? 'on' : '', text: 'Lấy tận nơi', onclick: setHandover })
        ]),
        h('div', { class: 'muted small mt', text: state.meta.notice }),
        h('button', { class: 'btn', type: 'submit', id: 'f-go', text: 'Xem giá' })
      ]);
      mount([state.notice ? h('div', { class: 'alert info', text: state.notice }) : null, form]);
      state.notice = '';
      state.geo = geo;
    });
  }
  function setHandover(e) {
    var seg = document.getElementById('f-handover');
    Array.prototype.forEach.call(seg.children, function (b) { b.className = b === e.currentTarget ? 'on' : ''; });
  }
  function getGeo() {
    if (!navigator.geolocation) return toast('Thiết bị không hỗ trợ định vị');
    var b = document.getElementById('geo-btn');
    b.textContent = 'Đang lấy vị trí…';
    navigator.geolocation.getCurrentPosition(function (p) {
      state.geo = { lat: p.coords.latitude, lng: p.coords.longitude };
      b.textContent = '📍 Đã lấy vị trí';
    }, function () { b.textContent = '📍 Dùng vị trí hiện tại'; toast('Không lấy được vị trí. Bạn vẫn xem giá được, chỉ không thấy quầy gần nhất.'); }, { timeout: 10000, maximumAge: 60000 });
  }
  function submit() {
    var kg = parseFloat(val('f-kg'));
    if (!val('f-prov') || !val('t-prov')) return toast('Hãy chọn tỉnh đi và tỉnh đến');
    if (!(kg > 0) || kg > 30) return toast('Khối lượng cần từ 0,1 đến 30 kg');
    var handover = document.querySelector('#f-handover .on').getAttribute('data-v');
    var req = {
      from: { province: val('f-prov'), ward: val('f-ward') },
      to: { province: val('t-prov'), ward: val('t-ward') },
      weightG: Math.round(kg * 1000),
      declaredValue: Math.max(0, parseInt(val('f-val') || '0', 10) || 0),
      goodsType: val('f-goods'),
      handover: handover
    };
    if (state.geo) { req.from.lat = state.geo.lat; req.from.lng = state.geo.lng; }
    var l = parseInt(val('d-l'), 10), w = parseInt(val('d-w'), 10), hh = parseInt(val('d-h'), 10);
    if (l && w && hh) req.dims = { l: l, w: w, h: hh };
    store('send', { fromProv: val('f-prov'), fromWard: val('f-ward'), toProv: val('t-prov'), toWard: val('t-ward'), kg: val('f-kg'), declared: val('f-val'), l: val('d-l'), w: val('d-w'), hh: val('d-h'), goods: val('f-goods'), handover: handover, geo: state.geo });
    var btn = document.getElementById('f-go');
    btn.disabled = true; btn.textContent = 'Đang so giá các hãng…';
    api('POST', 'quotes', req).then(function (q) {
      state.quote = q; state.req = req; state.offer = null; state.idem = null; sortKey = 'price';
      saveFlow();
      go('#/quote');
    }, function (e) { btn.disabled = false; btn.textContent = 'Xem giá'; fail(e); });
  }

  // ---------- Kết quả giá ----------
  var sortKey = 'price';
  function viewQuote() {
    if (!state.quote) return go('#/');
    var offers = state.quote.offers.slice();
    if (sortKey === 'fast') offers.sort(function (a, b) { return a.etaDays[1] - b.etaDays[1] || a.sellPrice - b.sellPrice; });
    else if (sortKey === 'near') offers.sort(function (a, b) {
      var da = a.pickupPoints.length ? a.pickupPoints[0].distanceKm : 1e9, db = b.pickupPoints.length ? b.pickupPoints[0].distanceKm : 1e9;
      return da - db || a.sellPrice - b.sellPrice;
    });
    var chips = h('div', { class: 'chips' }, [['price', 'Rẻ nhất'], ['fast', 'Nhanh nhất'], ['near', 'Quầy gần nhất']].map(function (c) {
      return h('button', { class: 'chip' + (sortKey === c[0] ? ' on' : ''), text: c[1], onclick: function () { sortKey = c[0]; viewQuote(); } });
    }));
    var head = h('div', { class: 'row sb mb' }, [
      h('a', { href: '#/', class: 'link', text: '‹ Sửa thông tin' }),
      h('span', { class: 'muted small', text: provName(state.req.from.province) + ' → ' + provName(state.req.to.province) + ' · ' + (state.req.weightG / 1000) + ' kg' })
    ]);
    var list = offers.length ? offers.map(offerCard) : [h('div', { class: 'card empty' }, [
      h('div', { text: 'Chưa có hãng nào báo giá được cho đơn này.' }),
      h('div', { class: 'small mt', text: 'Thử đổi cách bàn giao, loại hàng hoặc khối lượng, hoặc quay lại sau ít phút.' })
    ])];
    mount([head, chips].concat(list));
  }
  function provName(code) {
    var r = '';
    state.meta.provinces.forEach(function (p) { if (p.code === code) r = p.name; });
    return r || code;
  }
  function tagNode(t) {
    var map = { cheapest: ['Rẻ nhất', 'green'], fastest: ['Nhanh nhất', ''], nearest: ['Quầy gần nhất', ''] };
    return map[t] ? h('span', { class: 'tag ' + map[t][1], text: map[t][0] }) : null;
  }
  function offerCard(o) {
    var pt = o.pickupPoints[0];
    var eta = o.etaDays[0] === o.etaDays[1] ? o.etaDays[0] + ' ngày' : o.etaDays[0] + '–' + o.etaDays[1] + ' ngày';
    return h('div', { class: 'card offer' }, [
      h('div', {}, o.tags.map(tagNode)),
      h('div', { class: 'row sb' }, [
        h('div', {}, [h('h3', { text: o.carrierName }), h('div', { class: 'muted', text: o.serviceName + ' · giao trong ' + eta })]),
        h('div', { style: 'text-align:right' }, [h('span', { class: 'price', text: vnd(o.sellPrice) }), o.listPrice ? h('span', { class: 'was', text: vnd(o.listPrice) }) : null])
      ]),
      o.saved > 0 ? h('div', { class: 'save mt', text: 'Tiết kiệm ' + vnd(o.saved) + ' so với giá niêm yết của hãng' }) : null,
      pt ? h('div', { class: 'pt' }, [h('b', { text: '📍 ' + pt.name }), h('div', { class: 'muted', text: pt.distanceKm + ' km · ' + (pt.hours || 'giờ mở cửa: hỏi quầy') })]) : null,
      h('div', { class: 'row mt' }, [
        h('button', { class: 'btn sm', text: 'Chọn gửi', onclick: function () { state.offer = o; state.idem = null; saveFlow(); go('#/checkout'); } }),
        h('button', { class: 'link', style: 'margin-left:14px', text: 'Xem các quầy', onclick: function () { state.offer = o; saveFlow(); go('#/points'); } })
      ])
    ]);
  }

  // ---------- Quầy gần bạn ----------
  function viewPoints() {
    if (!state.offer) return go('#/');
    var o = state.offer;
    var geo = state.geo;
    var nodes = [h('div', { class: 'row sb mb' }, [h('a', { href: '#/quote', class: 'link', text: '‹ Quay lại giá' }), h('b', { text: 'Quầy ' + o.carrierName })])];
    if (!geo) {
      nodes.push(h('div', { class: 'card empty' }, [h('div', { text: 'Cần vị trí của bạn để tìm quầy gần nhất.' }),
        h('button', { class: 'btn sm mt', text: '📍 Dùng vị trí hiện tại', onclick: function () { navigator.geolocation && navigator.geolocation.getCurrentPosition(function (p) { state.geo = { lat: p.coords.latitude, lng: p.coords.longitude }; viewPoints(); }, function () { toast('Không lấy được vị trí'); }); } })]));
      return mount(nodes);
    }
    mount(nodes.concat([h('div', { class: 'spin', text: 'Đang tìm quầy…' })]));
    api('GET', 'pickup-points?lat=' + geo.lat + '&lng=' + geo.lng + '&carrier=' + encodeURIComponent(o.carrier) + '&radiusKm=25').then(function (r) {
      if (!r.points.length) nodes.push(h('div', { class: 'card empty', text: 'Chưa có dữ liệu quầy của hãng này quanh bạn. Bạn vẫn có thể chọn "Lấy tận nơi".' }));
      r.points.forEach(function (p) {
        nodes.push(h('div', { class: 'card' }, [
          h('h3', { text: p.name }), h('div', { class: 'muted', text: p.address }),
          h('div', { class: 'row sb mt' }, [h('span', { text: p.distanceKm + ' km · ' + (p.hours || '') }),
            h('a', { class: 'link', target: '_blank', rel: 'noopener', href: 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng, text: 'Chỉ đường ›' })])
        ]));
      });
      mount(nodes);
    }, fail);
  }

  // ---------- Thanh toán / tạo đơn ----------
  function bufferFor(sell) { return Math.max(state.meta.bufferMin, Math.ceil(sell * state.meta.bufferPct / 100 / 500) * 500); }
  function partyForm(prefix, title, init, lockProv) {
    return h('div', { class: 'card' }, [
      h('h2', { text: title }),
      field('Họ tên', h('input', { type: 'text', id: prefix + '-name', value: init.contact || '', autocomplete: 'name' })),
      field('Số điện thoại', h('input', { type: 'tel', id: prefix + '-phone', value: init.phone || '', autocomplete: 'tel', inputmode: 'tel' })),
      field('Số nhà, đường', h('input', { type: 'text', id: prefix + '-street', value: init.street || '' })),
      field('Phường / xã', h('input', { type: 'text', id: prefix + '-ward', value: init.ward || '' })),
      h('label', { class: 'f', text: 'Tỉnh / thành' }),
      (function () { var s = provinceSelect(prefix + '-prov', lockProv); s.disabled = true; return s; })()
    ]);
  }
  function viewCheckout() {
    if (!state.offer || !state.quote) return go('#/');
    needLogin('#/checkout').then(function (ok) {
      if (!ok) return;
      Promise.all([ensureMeta(), api('GET', 'addresses'), api('GET', 'wallet')]).then(function (res) {
        var addrs = res[1].addresses, w = res[2];
        var o = state.offer, req = state.req;
        var buffer = bufferFor(o.sellPrice), need = o.sellPrice + buffer;
        var last = store('lastSender') || {};
        var sender = { contact: last.contact || '', phone: last.phone || (state.user && state.user.phone) || '', street: last.street || '', ward: req.from.ward || last.ward || '' };
        var receiver = { ward: req.to.ward || '' };
        var senderCard = partyForm('s', 'Người gửi', sender, req.from.province);
        var recvCard = partyForm('r', 'Người nhận', receiver, req.to.province);
        var book = addrs.length ? h('div', { class: 'card' }, [h('label', { class: 'f', text: 'Điền nhanh từ sổ địa chỉ' }), (function () {
          var s = h('select', { id: 'book', onchange: function () {
            var a = addrs[parseInt(this.value, 10)];
            if (!a) return;
            var tgt = confirm('Dùng địa chỉ này cho NGƯỜI NHẬN? (Bấm Hủy để dùng cho người gửi)') ? 'r' : 's';
            document.getElementById(tgt + '-name').value = a.contact; document.getElementById(tgt + '-phone').value = a.phone;
            document.getElementById(tgt + '-street').value = a.street; document.getElementById(tgt + '-ward').value = a.ward || '';
            this.value = '';
          } });
          s.appendChild(opt('', 'Chọn địa chỉ…', true));
          addrs.forEach(function (a, i) { s.appendChild(opt(String(i), (a.label ? a.label + ' · ' : '') + a.contact + ' · ' + a.street, false)); });
          return s;
        })()]) : null;
        var points = (req.handover === 'dropoff' && o.pickupPoints.length) ? h('div', { class: 'card' }, [h('h2', { text: 'Quầy sẽ mang hàng đến' })].concat(o.pickupPoints.map(function (p, i) {
          return h('label', { class: 'inline', style: 'padding:8px 0' }, [h('input', { type: 'radio', name: 'pp', value: p.id, checked: i === 0 }), h('span', {}, [h('b', { text: p.name }), h('div', { class: 'muted small', text: p.distanceKm + ' km · ' + p.address })])]);
        }))) : null;
        var short = w.balance < need;
        var sum = h('div', { class: 'card' }, [
          h('h2', { text: 'Thanh toán' }),
          kv('Hãng', o.carrierName + ' · ' + o.serviceName),
          kv('Cước phí', vnd(o.sellPrice)),
          kv('Tạm giữ phòng hãng cân lại', vnd(buffer)),
          kv('Số dư ví', vnd(w.balance)),
          h('div', { class: 'muted small mt', text: 'Phần tạm giữ được hoàn lại vào ví khi hãng xác nhận cước cuối. Bạn chỉ trả thêm nếu hãng cân hoặc đo thấy kiện nặng hơn khai báo.' }),
          short ? h('div', { class: 'alert mt', text: 'Ví còn thiếu ' + vnd(need - w.balance) + '. Hãy nạp thêm để tiếp tục.' }) : null,
          short ? h('button', { class: 'btn ghost', text: 'Nạp ví', onclick: function () { store('topupAmount', Math.ceil((need - w.balance) / 10000) * 10000); go('#/wallet'); } }) : null,
          h('label', { class: 'inline mt', style: 'font-size:13px' }, [h('input', { type: 'checkbox', id: 'ack' }), h('span', { text: 'Tôi cam kết không gửi hàng cấm và thông tin khai báo là đúng.' })]),
          h('label', { class: 'inline mt', style: 'font-size:13px' }, [h('input', { type: 'checkbox', id: 'savebook' }), h('span', { text: 'Lưu người nhận vào sổ địa chỉ' })]),
          h('button', { class: 'btn', id: 'pay', text: 'Thanh toán và tạo đơn', disabled: short ? true : null, onclick: pay })
        ]);
        mount([h('div', { class: 'row sb mb' }, [h('a', { href: '#/quote', class: 'link', text: '‹ Quay lại giá' }), h('b', { text: 'Tạo đơn' })]), book, senderCard, recvCard, points, sum]);
      }, fail);
    });
  }
  function party(prefix, prov) {
    return { contact: val(prefix + '-name'), phone: val(prefix + '-phone'), street: val(prefix + '-street'), ward: val(prefix + '-ward'), province: prov };
  }
  function pay() {
    if (!document.getElementById('ack').checked) return toast('Hãy tick cam kết không gửi hàng cấm');
    var s = party('s', state.req.from.province), r = party('r', state.req.to.province);
    if (s.contact.length < 2 || r.contact.length < 2) return toast('Nhập họ tên người gửi và người nhận');
    if (s.street.length < 3 || r.street.length < 3) return toast('Nhập số nhà, đường đầy đủ');
    var ppEl = document.querySelector('input[name=pp]:checked');
    var body = { quoteId: state.quote.quoteId, offerId: state.offer.offerId, sender: s, receiver: r };
    if (ppEl) body.pickupPointId = ppEl.value;
    store('lastSender', s);
    if (!state.idem) { state.idem = uid(); saveFlow(); }
    var btn = document.getElementById('pay');
    btn.disabled = true; btn.textContent = 'Đang tạo đơn với hãng…';
    api('POST', 'shipments', body, { 'Idempotency-Key': state.idem }).then(function (sh) {
      if (document.getElementById('savebook') && document.getElementById('savebook').checked) {
        api('POST', 'addresses', { label: '', contact: r.contact, phone: r.phone, street: r.street, ward: r.ward, province: provName(r.province) }).then(function () {}, function () {});
      }
      state.quote = null; state.offer = null; state.idem = null; store('flow', null);
      go('#/ticket/' + sh.id);
    }, function (e) {
      btn.disabled = false; btn.textContent = 'Thanh toán và tạo đơn';
      if (e.code === 'price_changed' && e.details && e.details.quote) {
        state.quote = e.details.quote; state.offer = null; state.idem = null; state.notice = ''; saveFlow();
        toast('Giá của hãng vừa thay đổi. Vui lòng chọn lại.');
        return go('#/quote');
      }
      if (e.code === 'quote_expired') { state.notice = 'Báo giá đã hết hạn, hãy xem giá lại.'; return go('#/'); }
      fail(e);
    });
  }

  // ---------- Phiếu gửi ----------
  function viewTicket(id) {
    needLogin('#/ticket/' + id).then(function (ok) {
      if (!ok) return;
      var polls = 0;
      function load() {
        api('GET', 'shipments/' + id).then(function (s) { draw(s); if (s.shippingStatus === 'pending_carrier' && polls++ < 30) { timers.push(setTimeout(load, 2500)); } }, fail);
      }
      function draw(s) {
        var canCancel = s.shippingStatus === 'created' && (s.cancelStatus === 'none' || s.cancelStatus === 'rejected');
        var nodes = [
          h('div', { class: 'row sb mb' }, [h('a', { href: '#/orders', class: 'link', text: '‹ Đơn của tôi' }), statusTag(s.shippingStatus)])
        ];
        if (s.needsAttention) nodes.push(h('div', { class: 'alert', text: 'Đơn đang được kiểm tra thủ công. Tiền của bạn vẫn được giữ an toàn và sẽ được hoàn nếu đơn không tạo được.' }));
        if (s.cancelStatus === 'requested') nodes.push(h('div', { class: 'alert info', text: 'Đã gửi yêu cầu hủy, đang chờ hãng xác nhận. Tiền sẽ hoàn về ví khi hãng xác nhận.' }));
        if (s.cancelStatus === 'rejected') nodes.push(h('div', { class: 'alert', text: 'Hãng không nhận hủy (có thể hàng đã được lấy).' }));
        if (s.trackingCode) {
          nodes.push(h('div', { class: 'card' }, [
            h('div', { class: 'muted', text: s.carrierName + ' · ' + s.serviceName }),
            h('div', { class: 'code-box' }, [h('div', { class: 'muted small', text: s.handover === 'dropoff' ? 'Mã vận đơn — đưa mã này cho nhân viên quầy' : 'Mã vận đơn — nhân viên sẽ đến lấy hàng' }), h('div', { class: 'code', text: s.trackingCode })]),
            s.labelUrl ? h('div', { class: 'row' }, [
              h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: s.labelUrl, text: 'In nhãn (100×150)' }),
              h('a', { class: 'btn sm ghost', style: 'margin-left:8px', target: '_blank', rel: 'noopener', href: s.labelUrl + '?size=a6', text: 'Khổ A6' })
            ]) : null,
            h('div', { class: 'muted small mt', text: 'Dán nhãn lên kiện hàng. Nếu không có máy in, đưa mã vận đơn cho nhân viên quầy để họ in.' })
          ]));
        } else if (s.shippingStatus === 'pending_carrier') {
          nodes.push(h('div', { class: 'card spin', text: 'Đang tạo đơn với hãng, vui lòng chờ vài giây…' }));
        } else if (s.shippingStatus === 'create_failed') {
          nodes.push(h('div', { class: 'alert bad', text: 'Hãng không tạo được đơn. Toàn bộ tiền đã hoàn về ví của bạn.' }));
        }
        nodes.push(h('div', { class: 'card' }, [
          h('h2', { text: 'Tiền' }), kv('Cước phí', vnd(s.sellPrice)), kv('Đã thu', vnd(s.charged)), kv('Đang tạm giữ', vnd(s.held + s.bufferHeld)),
          s.paymentStatus === 'refunded' ? h('div', { class: 'alert ok mt', text: 'Đã hoàn tiền về ví.' }) : null
        ]));
        nodes.push(h('div', { class: 'card' }, [
          h('h2', { text: 'Hành trình' }),
          s.events.length ? h('ul', { class: 'timeline' }, s.events.map(function (ev) {
            return h('li', {}, [h('b', { text: (SHIP[ev.status] || [ev.status])[0] }), h('div', { class: 'muted small', text: new Date(ev.at).toLocaleString('vi-VN') + (ev.note ? ' · ' + ev.note : '') })]);
          })) : h('div', { class: 'muted', text: 'Chưa có sự kiện.' })
        ]));
        nodes.push(h('div', { class: 'card' }, [
          h('h2', { text: 'Người gửi / Người nhận' }),
          h('div', { class: 'small' }, [h('b', { text: 'Gửi: ' }), s.sender.contact + ' · ' + s.sender.phone + ' · ' + s.sender.street + ', ' + s.sender.provinceName]),
          h('div', { class: 'small mt' }, [h('b', { text: 'Nhận: ' }), s.receiver.contact + ' · ' + s.receiver.phone + ' · ' + s.receiver.street + ', ' + s.receiver.provinceName])
        ]));
        var actions = [];
        if (canCancel) actions.push(h('button', { class: 'btn danger', text: 'Hủy đơn', onclick: function () {
          if (!confirm('Hủy đơn này? Tiền sẽ hoàn về ví khi hãng xác nhận.')) return;
          api('POST', 'shipments/' + id + '/cancel', {}).then(function (r) { draw(r.shipment); toast(r.cancel.status === 'confirmed' ? 'Đã hủy và hoàn tiền' : r.cancel.status === 'rejected' ? 'Hãng không nhận hủy' : 'Đã gửi yêu cầu hủy'); }, fail);
        } }));
        if (s.trackingCode) actions.push(h('button', { class: 'btn ghost', text: 'Báo sự cố / khiếu nại', onclick: function () { go('#/claim/' + id); } }));
        if (state.meta && state.meta.demo && s.trackingCode && ['created', 'picked_up', 'in_transit'].indexOf(s.shippingStatus) >= 0) {
          var next = { created: 'picked_up', picked_up: 'in_transit', in_transit: 'delivered' }[s.shippingStatus];
          actions.push(h('button', { class: 'btn ghost', text: 'Chế độ demo: giả lập "' + (SHIP[next] || [next])[0] + '"', onclick: function () {
            api('POST', 'dev/mock/advance', { code: s.trackingCode, status: next }).then(function () { setTimeout(function () { api('GET', 'shipments/' + id).then(draw, fail); }, 400); }, fail);
          } }));
        }
        mount(nodes.concat(actions));
        every(function () { api('GET', 'shipments/' + id).then(function (n) { if (JSON.stringify(n) !== JSON.stringify(s)) draw(n); }, function () {}); }, 20000);
      }
      ensureMeta().then(load);
    });
  }

  // ---------- Đơn của tôi ----------
  function viewOrders() {
    needLogin('#/orders').then(function (ok) {
      if (!ok) return;
      api('GET', 'shipments').then(function (r) {
        if (!r.shipments.length) return mount([h('div', { class: 'card empty' }, [h('div', { text: 'Bạn chưa có đơn nào.' }), h('a', { class: 'btn sm mt', href: '#/', text: 'Gửi hàng ngay' })])]);
        mount(r.shipments.map(function (s) {
          return h('a', { href: '#/ticket/' + s.id, class: 'card', style: 'display:block;color:inherit' }, [
            h('div', { class: 'row sb' }, [h('b', { text: s.trackingCode || 'Đang tạo đơn…' }), statusTag(s.shippingStatus)]),
            h('div', { class: 'muted small mt', text: s.carrierName + ' → ' + s.receiver.contact + ', ' + s.receiver.provinceName }),
            h('div', { class: 'row sb small mt' }, [h('span', { class: 'muted', text: new Date(s.createdAt).toLocaleString('vi-VN') }), h('b', { text: vnd(s.sellPrice) })])
          ]);
        }));
      }, fail);
    });
  }

  // ---------- Ví ----------
  function viewWallet() {
    needLogin('#/wallet').then(function (ok) {
      if (!ok) return;
      Promise.all([api('GET', 'wallet'), api('GET', 'wallet/withdrawals')]).then(function (res) {
        var w = res[0], wds = res[1].items;
        var KIND = { topup: 'Nạp tiền', hold: 'Tạm giữ cho đơn', release: 'Hoàn tiền giữ', refund: 'Hoàn tiền đơn', adjustment: 'Điều chỉnh cước', compensation: 'Bồi thường', withdrawal: 'Rút tiền', capture: 'Thanh toán đơn', cancel_fee: 'Phí hủy', return_fee: 'Phí hoàn' };
        var WD = { requested: 'Chờ duyệt', approved: 'Đã duyệt', paying: 'Đang chuyển', paid: 'Đã chuyển', unknown: 'Đang đối soát', failed: 'Không thành công', rejected: 'Bị từ chối', cancelled: 'Đã hủy' };
        var nodes = [
          h('div', { class: 'card' }, [
            h('div', { class: 'muted', text: 'Số dư khả dụng' }), h('div', { style: 'font-size:30px;font-weight:900', text: vnd(w.balance) }),
            w.balance < 0 ? h('div', { class: 'alert bad mt', text: 'Ví đang âm do hãng điều chỉnh cước. Hãy nạp bù để gửi đơn mới.' }) : null,
            h('div', { class: 'small muted mt', text: 'Đang tạm giữ: ' + vnd(w.held + w.buffer) + (w.pendingWithdrawal ? ' · Đang rút: ' + vnd(w.pendingWithdrawal) : '') }),
            h('div', { class: 'row mt' }, [h('button', { class: 'btn sm', text: 'Nạp tiền', onclick: function () { showTopup(); } }), h('button', { class: 'btn sm ghost', style: 'margin-left:8px', text: 'Rút tiền', onclick: startWithdraw })])
          ]),
          h('div', { id: 'wallet-panel' })
        ];
        if (wds.length) nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Yêu cầu rút tiền' })].concat(wds.map(function (x) {
          return h('div', { class: 'kv' }, [h('span', {}, [x.bankAccount.bank + ' ' + x.bankAccount.number, h('div', { class: 'muted small', text: new Date(x.createdAt).toLocaleDateString('vi-VN') })]), h('span', { style: 'text-align:right' }, [h('b', { text: vnd(x.amount) }), h('div', { class: 'small', text: WD[x.status] || x.status }), x.status === 'requested' ? h('button', { class: 'link', text: 'Hủy', onclick: function () { api('POST', 'wallet/withdrawals/' + x.id + '/cancel', {}).then(viewWallet, fail); } }) : null])]);
        }))));
        nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Lịch sử' })].concat(w.entries.length ? w.entries.map(function (e) {
          return h('div', { class: 'kv' }, [h('span', {}, [KIND[e.kind] || e.kind, h('div', { class: 'muted small', text: new Date(e.at).toLocaleString('vi-VN') })]), h('b', { style: 'color:' + (e.amount >= 0 ? '#16a34a' : '#0f172a'), text: (e.amount >= 0 ? '+' : '−') + vnd(Math.abs(e.amount)) })]);
        }) : [h('div', { class: 'muted', text: 'Chưa có giao dịch.' })])));
        mount(nodes);
        var pre = store('topupAmount');
        if (pre) { store('topupAmount', 0); showTopup(pre); }
      }, fail);
    });
  }
  function panel() { var p = document.getElementById('wallet-panel'); clear(p); return p; }
  function showTopup(pre) {
    var p = panel();
    var amounts = [100000, 200000, 500000, 1000000];
    p.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Nạp tiền bằng chuyển khoản' }),
      h('div', { class: 'chips' }, amounts.map(function (a) { return h('button', { class: 'chip', text: vnd(a), onclick: function () { document.getElementById('tp-amount').value = a; } }); })),
      field('Số tiền (đ)', h('input', { type: 'number', id: 'tp-amount', min: '10000', step: '1000', inputmode: 'numeric', value: pre || '' })),
      h('button', { class: 'btn', text: 'Tạo mã nạp', onclick: function () {
        var amt = parseInt(val('tp-amount'), 10);
        if (!(amt >= 10000)) return toast('Nạp tối thiểu 10.000 đ');
        api('POST', 'wallet/topups', { amount: amt }).then(drawTopup, fail);
      } })
    ]));
  }
  function drawTopup(t) {
    var p = panel();
    var box = h('div', { class: 'card' }, [
      h('h2', { text: 'Quét mã hoặc chuyển khoản' }),
      h('div', { class: 'qr', id: 'qrbox' }),
      kv('Số tiền', vnd(t.amount)), kv('Ngân hàng (BIN)', t.transfer.bankBin), kv('Số tài khoản', t.transfer.account), kv('Chủ tài khoản', t.transfer.accountName),
      kv('Nội dung (bắt buộc)', t.transfer.content),
      h('button', { class: 'btn ghost', text: 'Sao chép nội dung chuyển khoản', onclick: function () {
        try { navigator.clipboard.writeText(t.transfer.content); toast('Đã sao chép'); } catch (e) { toast('Hãy chép tay: ' + t.transfer.content); }
      } }),
      h('div', { class: 'muted small mt', id: 'tp-status', text: 'Đang chờ tiền về… Ví sẽ tự cộng khi nhận được tiền (thường dưới 1 phút).' })
    ]);
    p.appendChild(box);
    document.getElementById('qrbox').innerHTML = t.qrSvg; // SVG do máy chủ tự sinh từ mã VietQR, không chứa dữ liệu người dùng
    every(function () {
      api('GET', 'wallet/topups/' + t.id).then(function (s) {
        if (s.status === 'paid') { toast('Đã nhận ' + vnd(s.amount)); viewWallet(); }
        else if (s.status === 'expired') { var el = document.getElementById('tp-status'); if (el) el.textContent = 'Mã nạp đã hết hạn. Nếu bạn đã chuyển tiền, hãy liên hệ hỗ trợ kèm nội dung ' + t.code + '.'; }
      }, function () {});
    }, 4000);
  }
  function startWithdraw() {
    var p = panel();
    p.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Rút tiền về ngân hàng' }),
      h('div', { class: 'muted small', text: 'Để bảo vệ tài khoản, hệ thống cần xác nhận lại bằng mã OTP gửi tới số điện thoại của bạn.' }),
      h('button', { class: 'btn', text: 'Gửi mã OTP', onclick: function () {
        api('POST', 'auth/step-up/request', {}).then(function (r) {
          clear(p);
          p.appendChild(h('div', { class: 'card' }, [
            h('h2', { text: 'Nhập mã OTP' }), r.devCode ? h('div', { class: 'alert info', text: 'Chế độ thử nghiệm — mã: ' + r.devCode }) : null,
            field('Mã 6 số', h('input', { type: 'text', id: 'su-code', inputmode: 'numeric', maxlength: '6' })),
            h('button', { class: 'btn', text: 'Xác nhận', onclick: function () {
              api('POST', 'auth/step-up/verify', { code: val('su-code') }).then(withdrawForm, fail);
            } })
          ]));
        }, fail);
      } })
    ]));
  }
  function withdrawForm() {
    var p = panel();
    var key = uid();
    p.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Thông tin nhận tiền' }),
      field('Ngân hàng', h('input', { type: 'text', id: 'wd-bank', placeholder: 'Vietcombank' })),
      field('Số tài khoản', h('input', { type: 'text', id: 'wd-num', inputmode: 'numeric' })),
      field('Tên chủ tài khoản', h('input', { type: 'text', id: 'wd-holder', placeholder: 'NGUYEN VAN A' })),
      field('Số tiền rút (tối thiểu 50.000 đ)', h('input', { type: 'number', id: 'wd-amt', min: '50000', step: '1000' })),
      h('div', { class: 'muted small mt', text: 'Tài khoản nhận mới sẽ được duyệt sau tối đa 24 giờ để an toàn.' }),
      h('button', { class: 'btn', text: 'Gửi yêu cầu rút', onclick: function () {
        api('POST', 'wallet/withdrawals', { amount: parseInt(val('wd-amt'), 10), bankAccount: { bank: val('wd-bank'), number: val('wd-num'), holder: val('wd-holder') } }, { 'Idempotency-Key': key }).then(function () { toast('Đã gửi yêu cầu rút tiền'); viewWallet(); }, fail);
      } })
    ]));
  }

  // ---------- Khiếu nại ----------
  function viewClaim(id) {
    needLogin('#/claim/' + id).then(function (ok) {
      if (!ok) return;
      api('GET', 'claims').then(function (r) {
        var mine = r.items.filter(function (c) { return c.shipmentId === id; });
        var LAB = { lost: 'Mất hàng', damaged: 'Hư hỏng', late: 'Giao chậm', other: 'Khác' };
        var ST = { received: 'Đã tiếp nhận', forwarded: 'Đã chuyển hãng', resolved: 'Đã giải quyết', rejected: 'Bị từ chối' };
        var nodes = [h('div', { class: 'row sb mb' }, [h('a', { href: '#/ticket/' + id, class: 'link', text: '‹ Về đơn hàng' }), h('b', { text: 'Báo sự cố' })])];
        mine.forEach(function (c) {
          nodes.push(h('div', { class: 'card' }, [h('div', { class: 'row sb' }, [h('b', { text: LAB[c.kind] }), h('span', { class: 'status info', text: ST[c.status] || c.status })]), h('div', { class: 'small mt', text: c.description }), h('div', { class: 'muted small mt', text: 'Hạn nộp hồ sơ: ' + new Date(c.deadline).toLocaleDateString('vi-VN') })]));
        });
        nodes.push(h('div', { class: 'card' }, [
          h('h2', { text: 'Gửi khiếu nại mới' }),
          field('Loại sự cố', (function () { var s = h('select', { id: 'cl-kind' }); ['lost', 'damaged', 'late', 'other'].forEach(function (k) { s.appendChild(opt(k, LAB[k], false)); }); return s; })()),
          field('Mô tả', h('textarea', { id: 'cl-desc', placeholder: 'Mô tả ngắn gọn sự việc' })),
          field('Liên kết ảnh / chứng cứ (không bắt buộc)', h('input', { type: 'text', id: 'cl-url', placeholder: 'https://…' })),
          h('div', { class: 'muted small mt', text: 'Chúng tôi lưu chứng cứ bàn giao và chuyển hồ sơ cho hãng đúng hạn. Hãy gửi sớm.' }),
          h('button', { class: 'btn', text: 'Gửi khiếu nại', onclick: function () {
            var ev = val('cl-url') ? [{ type: 'url', value: val('cl-url') }] : [];
            api('POST', 'claims', { shipmentId: id, kind: val('cl-kind'), description: val('cl-desc'), evidence: ev }).then(function () { toast('Đã tiếp nhận khiếu nại'); viewClaim(id); }, fail);
          } })
        ]));
        mount(nodes);
      }, fail);
    });
  }

  // ---------- Đăng nhập ----------
  function viewLogin() {
    var step = 1, phone = '';
    function draw(devCode) {
      var nodes;
      if (step === 1) {
        nodes = [h('div', { class: 'card' }, [
          h('h2', { text: 'Đăng nhập bằng số điện thoại' }),
          field('Số điện thoại', h('input', { type: 'tel', id: 'lg-phone', inputmode: 'tel', autocomplete: 'tel', placeholder: '09xx xxx xxx' })),
          h('button', { class: 'btn', text: 'Nhận mã OTP', onclick: function () {
            phone = val('lg-phone');
            api('POST', 'auth/otp', { phone: phone }).then(function (r) { step = 2; draw(r.devCode); }, fail);
          } })
        ])];
      } else {
        nodes = [h('div', { class: 'card' }, [
          h('h2', { text: 'Nhập mã OTP' }), h('div', { class: 'muted small', text: 'Mã gồm 6 số đã gửi tới ' + phone }),
          devCode ? h('div', { class: 'alert info mt', text: 'Chế độ thử nghiệm — mã: ' + devCode }) : null,
          field('Mã OTP', h('input', { type: 'text', id: 'lg-code', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' })),
          h('button', { class: 'btn', text: 'Đăng nhập', onclick: function () {
            api('POST', 'auth/verify', { phone: phone, code: val('lg-code') }).then(function (r) {
              state.user = r.user; renderWho();
              var next = store('next') || '#/'; store('next', ''); go(next);
            }, fail);
          } }),
          h('button', { class: 'btn ghost', text: 'Đổi số điện thoại', onclick: function () { step = 1; draw(); } })
        ])];
      }
      mount(nodes);
    }
    draw();
  }

  // ---------- định tuyến ----------
  function route() {
    var hash = location.hash || '#/';
    var parts = hash.replace(/^#\/?/, '').split('/');
    var name = parts[0] || 'send';
    var links = document.querySelectorAll('#nav a');
    Array.prototype.forEach.call(links, function (a) { a.className = (a.getAttribute('data-r') === (name === 'quote' || name === 'checkout' || name === 'points' ? 'send' : name === 'ticket' ? 'orders' : name)) ? 'on' : ''; });
    var done = ensureMeta();
    done.then(function () {
      if (name === 'send') return viewSend();
      if (name === 'quote') return viewQuote();
      if (name === 'points') return viewPoints();
      if (name === 'checkout') return viewCheckout();
      if (name === 'ticket') return viewTicket(parts[1]);
      if (name === 'orders') return viewOrders();
      if (name === 'wallet') return viewWallet();
      if (name === 'claim') return viewClaim(parts[1]);
      if (name === 'login') return viewLogin();
      viewSend();
    }, function (e) { mount([h('div', { class: 'card empty', text: (e && e.message) || 'Không tải được ứng dụng' })]); });
  }

  document.getElementById('who').addEventListener('click', function () {
    if (!state.user) return go('#/login');
    if (confirm('Đăng xuất ' + state.user.phone + '?')) api('POST', 'auth/logout', {}).then(function () { state.user = null; renderWho(); go('#/'); }, fail);
  });
  window.addEventListener('hashchange', route);
  loadFlow();
  me().then(route);
})();
