/* 9hire: dữ liệu của người tìm việc, LƯU TRÊN THIẾT BỊ (hồ sơ ngắn, tin đã lưu, đã gửi, bộ lọc báo tin mới). */
(function () {
  'use strict';
  var H9 = window.H9, h = H9.h;

  // ---------- kho trên thiết bị ----------
  var my = H9.my = {
    profile: function () { return H9.store('profile') || null; },
    setProfile: function (p) { H9.store('profile', p); },
    saved: function () { return H9.store('saved') || []; },
    isSaved: function (id) { return my.saved().indexOf(id) >= 0; },
    toggleSaved: function (id) {
      var s = my.saved(); var i = s.indexOf(id);
      if (i >= 0) s.splice(i, 1); else { s.unshift(id); s = s.slice(0, 100); }
      H9.store('saved', s);
      return i < 0;
    },
    applied: function () { return H9.store('applied') || {}; },
    isApplied: function (id) { return !!my.applied()[id]; },
    markApplied: function (id) {
      var a = my.applied(); a[id] = Date.now();
      var keys = Object.keys(a).sort(function (x, y) { return a[y] - a[x]; }).slice(0, 100);
      var out = {}; keys.forEach(function (k) { out[k] = a[k]; });
      H9.store('applied', out);
    },
    unmarkApplied: function (id) { var a = my.applied(); delete a[id]; H9.store('applied', a); },
    alerts: function () { return H9.store('alerts') || []; },
    setAlerts: function (a) { H9.store('alerts', a); },
  };

  // ---------- báo tin mới theo bộ lọc (thăm dò, không cần cài đặt thêm) ----------
  var bells = [];
  function totalNew() { return my.alerts().reduce(function (n, a) { return n + (a.news || 0); }, 0); }
  function drawBells() {
    var n = totalNew();
    bells = bells.filter(function (b) { return document.body.contains(b.el); });
    bells.forEach(function (b) { b.badge.textContent = n > 99 ? '99+' : String(n); b.badge.classList.toggle('hidden', !n); });
  }
  H9.bellButton = function () {
    var badge = h('span', { class: 'dot-badge hidden' });
    var el = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tin mới theo bộ lọc', onclick: alertsSheet }, [H9.ico('bell', 24), badge]);
    bells.push({ el: el, badge: badge });
    setTimeout(drawBells, 0);
    return el;
  };
  var polling = false; var lastToast = 0;
  my.poll = function () {
    var alerts = my.alerts();
    if (!alerts.length || polling || document.hidden) return Promise.resolve();
    polling = true;
    return Promise.all(alerts.map(function (a) {
      return H9.get('api/jobs/new' + H9.filterQuery(a.filters, { since: a.since })).then(function (d) {
        var grew = d.count > (a.news || 0);
        a.news = d.count; a.latest = d.latest; a.more = d.more;
        return grew ? a : null;
      }, function () { return null; });
    })).then(function (grown) {
      var cur = my.alerts();
      // ghi lại, giữ nguyên các thay đổi khác (xóa/thêm bộ lọc) xảy ra trong lúc chờ
      cur.forEach(function (c) { alerts.forEach(function (a) { if (a.id === c.id) { c.news = a.news; c.latest = a.latest; c.more = a.more; } }); });
      my.setAlerts(cur);
      drawBells();
      var g = grown.filter(Boolean);
      if (g.length && Date.now() - lastToast > 20000) { lastToast = Date.now(); H9.toast(g[0].news + (g[0].more ? '+' : '') + ' tin mới cho "' + g[0].name + '"'); }
    }).then(function () { polling = false; }, function () { polling = false; });
  };
  setInterval(function () { my.poll(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) my.poll(); });

  H9.promptAlert = function (filters, head) {
    var cur = my.alerts();
    if (cur.length >= 5) { H9.toast('Bạn đang theo dõi tối đa 5 bộ lọc. Hãy xóa bớt ở biểu tượng chuông.', 'err'); return; }
    var f = Object.assign({}, filters);
    H9.sheet('Báo tin mới', function (body, close) {
      var name = H9.text({ value: H9.filterSummary(f).slice(0, 50), maxlength: 50 });
      body.appendChild(h('p', { class: 'muted', text: 'Khi có tin mới khớp bộ lọc này, số tin hiện ở biểu tượng chuông mỗi lần bạn mở 9hire (app kiểm tra mỗi phút khi đang mở).' }));
      body.appendChild(H9.field('Tên bộ lọc', name));
      body.appendChild(h('div', { class: 'btn-row' }, [H9.btn('Theo dõi', 'primary block', function () {
        var list = my.alerts();
        list.push({ id: H9.rid(), name: name.value.trim() || 'Bộ lọc của tôi', filters: f, since: head || 0, news: 0 });
        my.setAlerts(list); drawBells(); close(); H9.toast('Đã bật báo tin mới');
      })]));
    });
  };
  H9.rid = function () { var a = new Uint8Array(8); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };

  function alertsSheet() {
    H9.sheet('Tin mới theo bộ lọc', function (body, close) {
      function draw() {
        H9.clear(body);
        var list = my.alerts();
        if (!list.length) {
          body.appendChild(H9.empty('Chưa theo dõi bộ lọc nào', 'Tìm việc theo khu vực, ca, mức lương rồi bấm "Báo tin mới". Khi có tin hợp, số tin hiện ở chuông này.'));
          return;
        }
        list.forEach(function (a) {
          body.appendChild(h('div', { class: 'card' }, [
            h('div', { class: 'row sb' }, [h('div', { class: 'b', text: a.name }), a.news ? H9.chip(a.news + (a.more ? '+' : '') + ' tin mới', 'ok') : H9.chip('Chưa có tin mới', '')]),
            h('div', { class: 'muted small', text: H9.filterSummary(a.filters) }),
            h('div', { class: 'btn-row' }, [
              H9.btn('Xem tin', 'primary sm', function () {
                var all = my.alerts();
                all.forEach(function (x) { if (x.id === a.id) { x.since = x.latest || x.since; x.news = 0; } });
                my.setAlerts(all); drawBells();
                H9.setFilters(a.filters); close(); H9.go('#/');
              }),
              H9.btn('Xóa', 'ghost sm', function () { my.setAlerts(my.alerts().filter(function (x) { return x.id !== a.id; })); drawBells(); draw(); }),
            ]),
          ]));
        });
      }
      draw();
    });
  }

  // ---------- tin đã lưu ----------
  H9.saved = function () {
    H9.frame({ title: 'Tin đã lưu', tabs: 'saved' });
    var ids = my.saved();
    if (!ids.length) {
      H9.mount([H9.empty('Chưa lưu tin nào', 'Bấm hình trái tim ở tin bạn quan tâm để xem lại sau. Tin được lưu ngay trên máy này.', h('div', { class: 'btn-row center' }, [H9.link('#/', { class: 'btn primary' }, ['Đi tìm việc'])]))]);
      return;
    }
    H9.skeleton();
    H9.loadMeta().then(function () { return H9.post('api/jobs/lookup', { ids: ids }); }).then(function (d) {
      var byId = {}; d.items.forEach(function (j) { byId[j.id] = j; });
      var list = h('div', { class: 'jobs' });
      var gone = ids.filter(function (id) { return !byId[id]; });
      ids.forEach(function (id) { if (byId[id]) list.appendChild(H9.jobCard(byId[id], { onUnsave: function () {} })); });
      var nodes = [h('div', { class: 'h2', text: 'Tin đã lưu (' + d.items.length + ')' }), list];
      if (gone.length) nodes.push(H9.notice('info', gone.length + ' tin đã lưu không còn hiển thị', 'Có thể tin đã bị gỡ hoặc quá cũ.', h('div', { class: 'btn-row' }, [H9.btn('Dọn các tin này', 'ghost sm', function () { gone.forEach(function (id) { if (my.isSaved(id)) my.toggleSaved(id); }); H9.saved(); })])));
      H9.mount(nodes);
    }, function (e) { H9.loadError(e, H9.saved); });
  };

  // ---------- của tôi ----------
  H9.me = function () {
    H9.frame({ title: 'Của tôi', tabs: 'me' });
    H9.loadMeta().then(function () {
      var p = my.profile() || {};
      var name = H9.text({ value: p.name || '', maxlength: 50, autocomplete: 'name', placeholder: 'Họ tên' });
      var phone = H9.text({ value: p.phone || '', maxlength: 16, inputmode: 'tel', autocomplete: 'tel', placeholder: '0912 345 678' });
      var city = H9.select(H9.meta.cities, p.city || '', 'Chọn thành phố');
      var district = H9.text({ value: p.district || '', maxlength: 40, placeholder: 'Quận, huyện bạn ở hoặc muốn làm' });
      var shifts = H9.multi(H9.meta.shifts, p.shifts || []);
      var now = H9.checkbox('Mình có thể bắt đầu ngay', p.startNow !== false);
      var intro = h('textarea', { maxlength: 300, placeholder: 'Ví dụ: Sinh viên năm 2, rảnh các buổi tối và cuối tuần, đã từng phục vụ quán cà phê.' }); intro.value = p.intro || '';
      var form = h('form', { novalidate: true, class: 'card', onsubmit: function (e) { e.preventDefault(); } }, [
        h('h2', { text: 'Hồ sơ ngắn của tôi' }),
        h('p', { class: 'muted', text: 'Chỉ lưu trên máy này, không gửi cho ai cho tới khi bạn bấm "Gửi quan tâm". Dùng để điền nhanh.' }),
        H9.field('Họ tên', name), H9.field('Số điện thoại / Zalo', phone), H9.field('Thành phố', city), H9.field('Quận, huyện', district),
        h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Ca có thể làm' }), shifts.node]), now.node, H9.field('Giới thiệu ngắn', intro),
        h('div', { class: 'btn-row' }, [H9.btn('Lưu hồ sơ', 'primary', function () {
          my.setProfile({ name: name.value.trim(), phone: phone.value.trim(), city: city.value, district: district.value.trim(), shifts: shifts.get(), startNow: now.input.checked, intro: intro.value.trim() });
          H9.toast('Đã lưu hồ sơ trên máy này');
        })]),
      ]);
      var nApplied = Object.keys(my.applied()).length;
      var info = h('div', { class: 'card' }, [
        h('h2', { text: 'Hoạt động trên máy này' }),
        h('div', { class: 'row sb' }, [h('span', { text: 'Tin đã lưu' }), H9.link('#/saved', { class: 'b' }, [String(my.saved().length)])]),
        h('div', { class: 'row sb mt' }, [h('span', { text: 'Tin đã gửi quan tâm' }), h('span', { class: 'b', text: String(nApplied) })]),
        h('div', { class: 'row sb mt' }, [h('span', { text: 'Bộ lọc đang theo dõi' }), h('span', { class: 'b', text: String(my.alerts().length) })]),
      ]);
      var about = h('div', { class: 'card' }, [
        h('h2', { text: 'Về 9hire' }),
        h('div', { class: 'btn-row' }, [H9.link('#/safety', { class: 'btn ghost sm' }, [H9.ico('shield', 18), 'An toàn khi xin việc']), H9.link('#/terms', { class: 'btn ghost sm' }, ['Điều khoản']), H9.link('#/privacy', { class: 'btn ghost sm' }, ['Quyền riêng tư'])]),
        h('div', { class: 'btn-row' }, [H9.btn('Xóa dữ liệu của tôi trên máy này', 'ghost sm', function () {
          H9.confirm({ title: 'Xóa dữ liệu trên máy', text: 'Xóa hồ sơ ngắn, tin đã lưu, bộ lọc theo dõi và lịch sử đã gửi quan tâm trên thiết bị này? Việc này không hoàn tác được.', ok: 'Xóa', danger: true }).then(function (yes) {
            if (!yes) return; ['profile', 'saved', 'applied', 'alerts'].forEach(function (k) { H9.store(k, null); }); drawBells(); H9.toast('Đã xóa dữ liệu trên máy'); H9.me();
          });
        })]),
      ]);
      H9.mount([form, info, about]);
    }, function (e) { H9.loadError(e, H9.me); });
  };
})();
