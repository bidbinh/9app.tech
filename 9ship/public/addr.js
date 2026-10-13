/* 9Ship — chọn tỉnh, phường/xã và sổ địa chỉ (ES5). Cần ui.js. */
(function () {
  'use strict';
  var S9 = window.S9;
  var h = S9.h;

  // ---------- danh mục tỉnh và phường/xã ----------
  var wardsPromise = null;
  S9.loadWards = function () {
    if (S9.wards) return Promise.resolve(S9.wards);
    if (!wardsPromise) {
      wardsPromise = new Promise(function (resolve, reject) {
        var x = new XMLHttpRequest();
        x.open('GET', 'data/vn-wards.json', true);
        x.onload = function () {
          try { S9.wards = JSON.parse(x.responseText).provinces; resolve(S9.wards); } catch (e) { wardsPromise = null; reject({ message: 'Không tải được danh mục phường/xã' }); }
        };
        x.onerror = function () { wardsPromise = null; reject({ message: 'Không tải được danh mục phường/xã. Kiểm tra mạng.' }); };
        x.send();
      });
    }
    return wardsPromise;
  };
  S9.provinceName = function (code) {
    var r = '';
    ((S9.meta && S9.meta.provinces) || []).forEach(function (p) { if (p.code === code) r = p.name; });
    return r || code || '';
  };

  // Ngăn kéo chọn một mục trong danh sách dài, có ô tìm kiếm.
  function listSheet(title, items, selected, onPick, placeholder) {
    var input = h('input', { type: 'search', placeholder: placeholder || 'Tìm kiếm…', autocomplete: 'off', 'aria-label': 'Tìm kiếm' });
    var sh = S9.sheet(title, { search: input });
    var MAX = 80;
    function draw() {
      var q = S9.norm(input.value.trim());
      S9.clear(sh.body);
      var shown = 0, total = 0;
      items.forEach(function (it) {
        if (q && S9.norm(it.label).indexOf(q) < 0) return;
        total++;
        if (shown >= MAX) return;
        shown++;
        sh.body.appendChild(h('button', { type: 'button', class: 'li', onclick: function () { sh.close(); onPick(it.value); } }, [
          h('div', { class: 'body' }, [h('div', { class: 't', text: it.label })]),
          it.value === selected ? h('span', { class: 'ck' }, [S9.ico('check', 20, 2.5)]) : null
        ]));
      });
      if (!total) sh.body.appendChild(h('div', { class: 'empty', text: 'Không có kết quả cho "' + input.value + '".' }));
      else if (total > shown) sh.body.appendChild(h('div', { class: 'muted small', style: 'padding:10px 4px', text: 'Còn ' + (total - shown) + ' kết quả, gõ thêm để thu hẹp.' }));
    }
    input.addEventListener('input', draw);
    draw();
    setTimeout(function () { try { input.focus(); } catch (e) { /* bỏ qua */ } }, 250);
  }

  S9.pickProvince = function (current, cb) {
    var items = S9.meta.provinces.map(function (p) { return { value: p.code, label: p.name }; });
    listSheet('Chọn tỉnh / thành phố', items, current, cb, 'Tìm tỉnh, thành phố…');
  };

  S9.pickWard = function (provinceCode, current, cb) {
    if (!provinceCode) { S9.toast('Hãy chọn tỉnh / thành phố trước'); return; }
    S9.loadWards().then(function (w) {
      var p = w[provinceCode];
      if (!p) { S9.toast('Chưa có danh mục phường/xã cho tỉnh này'); return; }
      listSheet('Phường / xã — ' + p.name, p.wards.map(function (x) { return { value: x, label: x }; }), current, cb, 'Tìm phường, xã…');
    }, function (e) { S9.toast(e.message); });
  };

  // ---------- thêm / sửa địa chỉ ----------
  var PHONE_RE = /^(0|\+?84)[35789]\d{8}$/;
  S9.editAddress = function (init, opts, cb) {
    opts = opts || {};
    var f = {
      id: init && init.id, contact: (init && init.contact) || '', phone: (init && init.phone) || '', province: (init && init.province) || '',
      ward: (init && init.ward) || '', street: (init && init.street) || '', label: (init && init.label) || '',
      lat: init && init.lat, lng: init && init.lng, isDefaultSender: !!(init && init.isDefaultSender)
    };
    var editing = !!f.id;
    var sh = S9.sheet(editing ? 'Sửa địa chỉ' : (opts.title || 'Thêm địa chỉ'));
    var errs = {};
    function fieldBlock(label, key, node) {
      return h('div', {}, [h('label', { class: 'f', text: label }), node, errs[key] ? h('div', { class: 'hint-err', text: errs[key] }) : null]);
    }
    function draw() {
      S9.clear(sh.body);
      var name = h('input', { type: 'text', value: f.contact, autocomplete: 'name', placeholder: 'Nguyễn Văn A', class: errs.contact ? 'err' : '', oninput: function () { f.contact = this.value; } });
      var phone = h('input', { type: 'tel', value: f.phone, autocomplete: 'tel', inputmode: 'tel', placeholder: '09xx xxx xxx', class: errs.phone ? 'err' : '', oninput: function () { f.phone = this.value; } });
      var prov = h('button', { type: 'button', class: 'pick' + (errs.province ? ' err' : ''), onclick: function () {
        S9.pickProvince(f.province, function (code) { if (code !== f.province) { f.province = code; f.ward = ''; } delete errs.province; draw(); });
      } }, [h('span', { class: f.province ? '' : 'ph', text: f.province ? S9.provinceName(f.province) : 'Chọn tỉnh / thành phố' }), S9.ico('chev', 18)]);
      var ward = h('button', { type: 'button', class: 'pick' + (errs.ward ? ' err' : ''), disabled: f.province ? null : true, onclick: function () {
        S9.pickWard(f.province, f.ward, function (w) { f.ward = w; delete errs.ward; draw(); });
      } }, [h('span', { class: f.ward ? '' : 'ph', text: f.ward || (f.province ? 'Chọn phường / xã' : 'Chọn tỉnh trước') }), S9.ico('chev', 18)]);
      var street = h('input', { type: 'text', value: f.street, autocomplete: 'street-address', placeholder: 'Số nhà, tên đường, thôn/xóm', class: errs.street ? 'err' : '', oninput: function () { f.street = this.value; } });
      var label = h('input', { type: 'text', value: f.label, maxlength: '40', placeholder: 'Ví dụ: Nhà, Cơ quan, Kho', oninput: function () { f.label = this.value; } });
      var nodes = [
        fieldBlock('Họ và tên', 'contact', name),
        fieldBlock('Số điện thoại', 'phone', phone),
        fieldBlock('Tỉnh / thành phố', 'province', prov),
        fieldBlock('Phường / xã', 'ward', ward),
        fieldBlock('Số nhà, đường', 'street', street),
        h('label', { class: 'f', text: 'Nhãn (không bắt buộc)' }), label,
        h('div', { class: 'opts mt' }, ['Nhà', 'Cơ quan', 'Kho'].map(function (x) {
          return h('button', { type: 'button', class: 'opt' + (f.label === x ? ' on' : ''), text: x, onclick: function () { f.label = x; draw(); } });
        }))
      ];
      if (opts.sender) {
        nodes.push(h('button', { type: 'button', class: 'btn ghost sm mt', onclick: function () {
          if (!navigator.geolocation) return S9.toast('Thiết bị không hỗ trợ định vị');
          navigator.geolocation.getCurrentPosition(function (p) { f.lat = p.coords.latitude; f.lng = p.coords.longitude; S9.toast('Đã lấy vị trí để tìm quầy gần bạn'); draw(); },
            function () { S9.toast('Không lấy được vị trí. Bạn vẫn dùng được bình thường.'); }, { timeout: 10000, maximumAge: 60000 });
        } }, [h('span', { class: 'row' }, [S9.ico('gps', 16), h('span', { style: 'margin-left:6px', text: f.lat ? 'Đã có vị trí (bấm để cập nhật)' : 'Dùng vị trí hiện tại để tìm quầy gần' })])]));
        nodes.push(h('label', { class: 'inline mt' }, [h('input', { type: 'checkbox', checked: f.isDefaultSender, onchange: function () { f.isDefaultSender = this.checked; } }), h('span', { text: 'Đặt làm địa chỉ người gửi mặc định' })]));
      }
      nodes.push(h('button', { type: 'button', class: 'btn', id: 'addr-save', text: editing ? 'Lưu thay đổi' : 'Lưu địa chỉ', onclick: save }));
      if (editing) {
        nodes.push(h('button', { type: 'button', class: 'btn danger', text: 'Xóa địa chỉ này', onclick: function () {
          if (!confirm('Xóa địa chỉ này khỏi sổ?')) return;
          S9.api('DELETE', 'addresses/' + f.id).then(function () { sh.close(); S9.toast('Đã xóa'); if (opts.onDelete) opts.onDelete(f.id); }, function (e) { S9.toast(e.message); });
        } }));
      }
      nodes.forEach(function (n) { if (n) sh.body.appendChild(n); });
    }
    function validate() {
      errs = {};
      if (f.contact.trim().length < 2) errs.contact = 'Nhập họ tên (ít nhất 2 ký tự)';
      if (!PHONE_RE.test(String(f.phone).replace(/[\s.\-]/g, ''))) errs.phone = 'Số điện thoại chưa đúng (10 số, bắt đầu 03, 05, 07, 08, 09)';
      if (!f.province) errs.province = 'Chọn tỉnh / thành phố';
      if (f.province && !f.ward) errs.ward = 'Chọn phường / xã';
      if (f.street.trim().length < 3) errs.street = 'Nhập số nhà, tên đường';
      return !Object.keys(errs).length;
    }
    function save() {
      if (!validate()) { draw(); return; }
      var btn = document.getElementById('addr-save');
      btn.disabled = true; btn.textContent = 'Đang lưu…';
      var body = { contact: f.contact.trim(), phone: f.phone, province: f.province, ward: f.ward, street: f.street.trim(), label: f.label, lat: f.lat === null ? undefined : f.lat, lng: f.lng === null ? undefined : f.lng };
      if (opts.sender) body.isDefaultSender = f.isDefaultSender;
      var req = editing ? S9.api('PATCH', 'addresses/' + f.id, body) : S9.api('POST', 'addresses', body);
      req.then(function (a) { sh.close(); S9.addrs = null; if (cb) cb(a); }, function (e) {
        btn.disabled = false; btn.textContent = editing ? 'Lưu thay đổi' : 'Lưu địa chỉ';
        if (e.details && e.details.field) { errs[(e.details.field.split('.').pop())] = e.message; draw(); }
        S9.toast(e.message);
      });
    }
    S9.loadWards().then(draw, function (e) { S9.toast(e.message); draw(); });
  };

  // ---------- chọn từ sổ địa chỉ ----------
  S9.loadAddresses = function (force) {
    if (S9.addrs && !force) return Promise.resolve(S9.addrs);
    return S9.api('GET', 'addresses').then(function (r) { S9.addrs = r.addresses; return S9.addrs; });
  };
  S9.addrLine = function (a) { return a.street + ', ' + a.ward + ', ' + (a.provinceName || S9.provinceName(a.province)); };

  S9.pickAddress = function (o, cb) {
    var input = h('input', { type: 'search', placeholder: 'Tìm theo tên, số điện thoại, địa chỉ…', autocomplete: 'off', 'aria-label': 'Tìm trong sổ địa chỉ' });
    var sh = S9.sheet(o.title, { search: input });
    var list = [];
    function draw() {
      var q = S9.norm(input.value.trim());
      S9.clear(sh.body);
      sh.body.appendChild(h('button', { type: 'button', class: 'li', onclick: function () {
        S9.editAddress(null, { sender: o.sender, title: o.sender ? 'Thêm người gửi' : 'Thêm người nhận' }, function (a) { sh.close(); cb(a); });
      } }, [h('div', { class: 'avatar', style: 'background:#fff3e8;color:#c2410c' }, [S9.ico('plus', 20, 2.5)]), h('div', { class: 'body' }, [h('div', { class: 't', text: o.sender ? 'Thêm người gửi mới' : 'Thêm người nhận mới' })])]));
      var n = 0;
      list.forEach(function (a) {
        if (o.excludeId && a.id === o.excludeId) { /* vẫn cho chọn lại */ }
        var hay = S9.norm([a.contact, a.phone, a.street, a.ward, a.provinceName, a.label].join(' '));
        if (q && hay.indexOf(q) < 0) return;
        n++;
        sh.body.appendChild(h('div', { class: 'li' }, [
          h('button', { type: 'button', class: 'row', style: 'flex:1;min-width:0;text-align:left', onclick: function () { sh.close(); cb(a); } }, [
            S9.avatar(a.contact),
            h('div', { class: 'body' }, [
              h('div', { class: 't trunc' }, [a.contact + ' · ' + a.phone, a.isDefaultSender ? h('span', { class: 'tagx blue', text: 'Mặc định gửi' }) : null, a.label ? h('span', { class: 'tagx', text: a.label }) : null]),
              h('div', { class: 's trunc', text: S9.addrLine(a) })
            ]),
            a.id === o.selectedId ? h('span', { class: 'ck' }, [S9.ico('check', 20, 2.5)]) : null
          ]),
          h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Sửa', onclick: function () {
            S9.editAddress(a, { sender: o.sender, onDelete: function () { S9.addrs = null; load(); } }, function () { load(); });
          } }, [S9.ico('edit', 18)])
        ]));
      });
      if (!n && list.length) sh.body.appendChild(h('div', { class: 'empty', text: 'Không tìm thấy trong sổ địa chỉ.' }));
      if (!list.length) sh.body.appendChild(h('div', { class: 'empty small', text: 'Sổ địa chỉ còn trống. Địa chỉ sẽ tự lưu sau mỗi đơn bạn gửi.' }));
    }
    function load() {
      S9.loadAddresses(true).then(function (l) { list = l; draw(); }, function (e) { S9.toast(e.message); });
    }
    input.addEventListener('input', draw);
    sh.body.appendChild(h('div', { class: 'spin', text: 'Đang tải…' }));
    load();
  };
})();
