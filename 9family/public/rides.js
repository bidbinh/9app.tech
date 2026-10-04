/* 9family: ca đưa đón (thẻ ca dùng ở màn Hôm nay và màn Đưa đón), lịch tuần, lịch sử. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;

  F9.isMgr = function (core) { return core.me.role === 'chu' || core.me.role === 'quan_ly'; };
  F9.kidOf = function (core, id) { return core.children.filter(function (c) { return c.id === id; })[0]; };
  F9.memberOf = function (core, id) { return core.members.filter(function (m) { return m.id === id; })[0]; };
  F9.loadView = function (fid, key, extra, force) {
    return F9.gated(fid, key, function () {
      return Promise.all([F9.get(F9.fam(fid)), extra ? extra() : null]).then(function (a) { F9.syncClock(a[0].now); return { core: a[0], d: a[1] }; });
    }, force);
  };
  F9.setTitle = function (t) { var el = document.querySelector('#bar-in .ttl'); if (el) el.textContent = t; };
  F9.dirWord = function (dir) { return dir === 'dua' ? 'đưa' : 'đón'; };

  // ---------- thẻ một ca ----------
  var STATE = {
    cho: ['Chờ người nhận', 'info'], khong_ai: ['Chưa ai nhận', 'bad'], da_nhan: ['Đã có người nhận', 'ok'], dang_di: ['Đang đi', 'ok'], xong: ['Đã xong', 'ok'], bo_qua: ['Bỏ qua', ''],
  };

  F9.rideCard = function (r, ctx) {
    var core = ctx.core; var me = core.me; var fid = ctx.fid;
    var kid = F9.kidOf(core, r.childId) || { color: r.childColor, name: r.childName };
    var open = r.state === 'cho' || r.state === 'khong_ai' || r.state === 'da_nhan' || r.state === 'dang_di';
    var w = F9.dirWord(r.dir);
    var st = STATE[r.state];
    var label = st[0]; var kind = st[1];
    if (r.state === 'cho' && !r.p0) { label = 'Chưa gán người'; kind = 'warn'; }
    if (r.state === 'da_nhan') label = (r.claimedName || 'Có người') + ' đã nhận';
    if (r.state === 'xong') label = r.dir === 'dua' ? 'Đã đưa' : 'Đã đón';
    var overdue = open && r.state !== 'da_nhan' && r.state !== 'dang_di' && F9.nowMs() > r.atTs + 5 * 60000;
    var involved = [r.p0, r.p1, r.p2, r.claimedBy].indexOf(me.id) >= 0;
    var days = F9.diffDays(ctx.today, r.day);

    var kids = [];
    var head = h('div', {}, [
      h('div', { class: 'ride-t', text: (r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName + ' · ' + r.time }),
      h('div', { class: 'ride-st' }, [
        F9.chip(label, kind),
        open ? h('span', { class: overdue ? 'warn-t' : 'muted', text: (days === 0 ? '' : F9.dayShort(r.day, ctx.today) + ' · ') + (days === 0 ? F9.untilText(r.atTs) : 'Giờ ' + r.time) }) : null,
      ]),
    ]);
    kids.push(head);
    if (r.place) kids.push(h('div', { class: 'ppl', text: 'Địa điểm: ' + r.place }));
    var ppl = h('div', { class: 'ppl' });
    if (r.p0Name) {
      ppl.appendChild(document.createTextNode('Phụ trách: ')); ppl.appendChild(h('b', { text: r.p0Name + (r.p0External ? ' (người đón hộ)' : '') }));
      var backups = [r.p1Name, r.p2Name].filter(Boolean);
      if (backups.length) ppl.appendChild(document.createTextNode(' · Dự phòng: ' + backups.join(', ')));
    } else {
      ppl.appendChild(h('b', { text: 'Chưa có người phụ trách' }));
      var b2 = [r.p1Name, r.p2Name].filter(Boolean);
      if (b2.length) ppl.appendChild(document.createTextNode(' · Dự phòng: ' + b2.join(', ')));
    }
    kids.push(ppl);
    if (r.p0External && (r.p0Phone || r.p0Note)) {
      kids.push(h('div', { class: 'ride-links' }, [
        r.p0Phone ? h('a', { class: 'linkbtn', href: 'tel:' + r.p0Phone.replace(/[^0-9+]/g, ''), 'aria-label': 'Gọi ' + r.p0Name }, [F9.ico('phone', 16), ' ' + r.p0Phone]) : null,
        r.p0Note ? h('span', { class: 'muted', text: 'Nhận dạng: ' + r.p0Note }) : null,
      ]));
    }
    if (kid && kid.note && ctx.core.children.length) { /* ghi chú của con hiện ở hồ sơ con, không lặp ở mỗi thẻ */ }
    if (r.overrideName && r.state !== 'bo_qua') kids.push(h('div', { class: 'ovr', text: 'Đã đổi người trong ngày bởi ' + r.overrideName + (r.overrideReason ? ': ' + r.overrideReason : '') }));
    if (r.state === 'xong') kids.push(h('div', { class: 'ppl', text: (r.doneName || 'Có người') + ' ' + (r.dir === 'dua' ? 'đã đưa' : 'đã đón') + ' lúc ' + (r.doneAt ? F9.hhmm(r.doneAt) : '') }));
    if (r.state === 'bo_qua') kids.push(h('div', { class: 'ppl', text: 'Bỏ qua bởi ' + (r.skipName || 'một thành viên') + (r.skipReason ? ': ' + r.skipReason : '') }));
    if (r.state === 'khong_ai') kids.push(F9.notice('bad', 'Đã nhắc hết các mốc mà chưa ai nhận', 'Hãy gọi hỏi nhau ngay. Ai nhận được thì bấm Tôi nhận.'));

    function call(btn, action, body, msg) {
      return F9.busy(btn, function () {
        return F9.post(F9.fam(fid, '/ride-days/' + r.id + '/' + action), body || {}, { idem: 'rd' + r.id + action }).then(function (res) {
          if (msg && !res.already) F9.toast(msg);
          F9.dropGate(); return F9.refresh(true);
        }, function (e) { if (e.status === 409) { F9.toast(e.message, 'err'); F9.dropGate(); F9.refresh(true); return; } throw e; });
      });
    }
    var actions = h('div', { class: 'ride-actions' });
    var doneLabel = r.dir === 'dua' ? 'Đã đưa' : 'Đã đón';
    if (r.state === 'cho' || r.state === 'khong_ai') {
      var claim = F9.btn('Tôi nhận', 'primary', function () { return call(claim, 'claim', {}, 'Bạn đã nhận ca ' + w + ' ' + r.childName); });
      actions.appendChild(claim);
      if (r.p0External && r.p0) {
        var hc = F9.btn(r.p0Name + ' đã nhận', 'ghost', function () { return call(hc, 'claim', { forId: r.p0 }, 'Đã ghi nhận ' + r.p0Name + ' nhận ca'); });
        actions.appendChild(hc);
      }
      var dn = F9.btn(doneLabel, 'ghost', function () { return call(dn, 'done', {}, 'Đã báo cả nhà'); });
      actions.appendChild(dn);
    } else if (r.state === 'da_nhan') {
      if (r.claimedBy === me.id) { var go = F9.btn('Đang đi', 'ghost', function () { return call(go, 'start', {}, 'Đã báo đang đi'); }); actions.appendChild(go); }
      var d2 = F9.btn(doneLabel, 'primary', function () { return call(d2, 'done', r.p0External && r.claimedBy === r.p0 ? { forId: r.p0 } : {}, 'Đã báo cả nhà'); });
      actions.appendChild(d2);
    } else if (r.state === 'dang_di') {
      var d3 = F9.btn(doneLabel, 'primary', function () { return call(d3, 'done', {}, 'Đã báo cả nhà'); });
      actions.appendChild(d3);
    } else if (r.state === 'bo_qua') {
      var un = F9.btn('Khôi phục ca', 'ghost', function () { return call(un, 'unskip', {}, 'Đã khôi phục ca'); });
      actions.appendChild(un);
    }
    if (actions.firstChild) kids.push(actions);
    if (open) {
      var sec = h('div', { class: 'row', style: null }, []);
      if (F9.isMgr(core) || involved) sec.appendChild(h('button', { class: 'linkbtn', type: 'button', text: 'Đổi người', onclick: function () { F9.assignSheet(r, ctx); } }));
      sec.appendChild(h('button', { class: 'linkbtn', type: 'button', text: 'Bỏ qua ca này', onclick: function () { F9.skipSheet(r, ctx); } }));
      kids.push(sec);
    }
    return h('div', { class: 'card ride c-' + (kid.color || 'xanh') + (r.state === 'xong' || r.state === 'bo_qua' ? ' done' : '') + (overdue ? ' alert' : ''), 'data-ride': r.id }, kids);
  };

  F9.assignSheet = function (r, ctx) {
    var core = ctx.core;
    var people = core.members.filter(function (m) { return m.external || !m.pending; });
    F9.sheet('Đổi người ' + F9.dirWord(r.dir) + ' ' + r.childName, function (body, close) {
      var chosen = r.p0 || null;
      var reason = F9.text({ placeholder: 'Ví dụ: Hôm nay mẹ họp', maxlength: 100 });
      var list = h('div', { class: 'pick-list' });
      function paint() {
        F9.clear(list);
        people.forEach(function (m) {
          list.appendChild(h('button', { type: 'button', class: 'pick' + (chosen === m.id ? ' on' : ''), 'aria-pressed': chosen === m.id ? 'true' : 'false', onclick: function () { chosen = m.id; paint(); } }, [
            h('div', { class: 'avatar', text: F9.initial(m.name) }),
            h('div', { class: 'col' }, [h('div', { class: 'b', text: m.name }), h('div', { class: 'muted small', text: F9.REL[m.relation] || '' })]),
            chosen === m.id ? F9.ico('check', 22) : null,
          ]));
        });
      }
      paint();
      var go = F9.btn('Đổi người', 'primary block', function () {
        if (!chosen) { F9.toast('Hãy chọn một người', 'err'); return; }
        return F9.busy(go, function () {
          var path = F9.fam(ctx.fid, '/ride-days/' + r.id + '/assign');
          return F9.post(path, { memberId: chosen, reason: reason.value }, { idem: 'asg' + r.id + chosen }).then(function () {
            close(); F9.toast('Đã đổi người phụ trách'); F9.dropGate(); return F9.refresh(true);
          });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Chỉ đổi cho ' + F9.dayShort(r.day, ctx.today).toLowerCase() + '. Lịch cố định hằng tuần không đổi.' }));
      body.appendChild(list);
      body.appendChild(F9.field('Lý do (không bắt buộc)', reason));
      body.appendChild(go);
    });
  };

  F9.skipSheet = function (r, ctx) {
    F9.sheet('Bỏ qua ca ' + F9.dirWord(r.dir) + ' ' + r.childName, function (body, close) {
      var reason = F9.text({ placeholder: 'Ví dụ: Con nghỉ ốm', maxlength: 100 });
      var go = F9.btn('Bỏ qua ca này', 'primary block', function () {
        return F9.busy(go, function () {
          return F9.post(F9.fam(ctx.fid, '/ride-days/' + r.id + '/skip'), { reason: reason.value }, { idem: 'skip' + r.id }).then(function () {
            close(); F9.toast('Đã báo cả nhà bỏ qua ca này'); F9.dropGate(); return F9.refresh(true);
          });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Dùng khi con nghỉ học hoặc không cần ' + F9.dirWord(r.dir) + '. Cả nhà sẽ thấy và không bị nhắc nữa.' }));
      body.appendChild(F9.field('Lý do (không bắt buộc)', reason));
      body.appendChild(go);
    });
  };

  // ---------- màn Đưa đón ----------
  var view = { mode: 'day', day: null };

  F9.rides = function (fid) {
    F9.frame({ title: 'Đưa đón', tabs: { fid: fid, tab: 'rides' }, right: [F9.bell(fid)] });
    F9.skeleton();
    if (!view.day || view.fid !== fid) { view.day = null; view.fid = fid; }
    var key = 'rides:' + view.mode + ':' + (view.day || 'today');
    var fetchers = {
      day: function () { return F9.get(F9.fam(fid, '/rides/board' + (view.day ? '?day=' + view.day : ''))); },
      week: function () { return F9.get(F9.fam(fid, '/rides')); },
      hist: function () { return F9.get(F9.fam(fid, '/rides/history')); },
    };
    F9.live({
      fetch: function () { return F9.loadView(fid, key, fetchers[view.mode]).then(function (x) { return { core: x.core, d: x.d, mode: view.mode, dayKey: view.day }; }); },
      render: function (x) { if (x.mode !== view.mode || x.dayKey !== view.day) return; renderRides(fid, x); },
      retick: true, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { F9.rides(fid); }); });
  };

  function modeBar(fid) {
    var seg = h('div', { class: 'seg', role: 'tablist' });
    [['day', 'Theo ngày'], ['week', 'Lịch tuần'], ['hist', 'Lịch sử']].forEach(function (m) {
      seg.appendChild(h('button', { type: 'button', role: 'tab', class: view.mode === m[0] ? 'on' : '', 'aria-selected': view.mode === m[0] ? 'true' : 'false', text: m[1], onclick: function () { view.mode = m[0]; F9.rides(fid); } }));
    });
    return seg;
  }

  function renderRides(fid, x) {
    var core = x.core; F9.setTitle(core.family.name);
    var nodes = [modeBar(fid)];
    var today = core.today;
    var ctx = { fid: fid, core: core, today: today };
    if (view.mode === 'day') {
      var day = x.d.day;
      nodes.push(h('div', { class: 'calnav' }, [
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ngày trước', onclick: function () { view.day = F9.addDays(day, -1); F9.rides(fid); } }, [F9.ico('back', 24)]),
        h('div', { class: 'ttl', text: F9.dayLabel(day, today) }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ngày sau', onclick: function () { view.day = F9.addDays(day, 1); F9.rides(fid); } }, [F9.ico('chev', 24)]),
      ]));
      if (day !== today) nodes.push(h('div', { class: 'btn-row center' }, [F9.btn('Về hôm nay', 'ghost sm', function () { view.day = null; F9.rides(fid); })]));
      if (!core.children.length) nodes.push(noKids(core, fid));
      else if (!x.d.rides.length) nodes.push(F9.empty('Không có ca đưa đón', 'Ngày này chưa có ca nào theo lịch tuần.', F9.isMgr(core) ? h('div', { class: 'btn-row center' }, [F9.btn('Đặt lịch đưa đón', 'primary', function () { view.mode = 'week'; F9.rides(fid); })]) : null));
      else x.d.rides.forEach(function (r) { nodes.push(F9.rideCard(r, ctx)); });
    } else if (view.mode === 'week') {
      nodes.push.apply(nodes, weekView(ctx, x.d.rides));
    } else {
      nodes.push.apply(nodes, histView(ctx, x.d.rides));
    }
    F9.mount(nodes);
  }

  function noKids(core, fid) {
    return F9.empty('Chưa có con nào', F9.isMgr(core) ? 'Thêm con trước để đặt lịch đưa đón.' : 'Nhờ chủ gia đình thêm con vào gia đình.',
      F9.isMgr(core) ? h('div', { class: 'btn-row center' }, [F9.link('#/f/' + fid + '/me', { class: 'btn primary' }, ['Thêm con'])]) : null);
  }

  function personName(core, id) { var m = F9.memberOf(core, id); return m ? m.name : ''; }

  // nhóm các ca giống hệt nhau ở nhiều thứ thành một dòng
  function groupRides(rides) {
    var map = {}; var order = [];
    rides.forEach(function (r) {
      var k = [r.childId, r.dir, r.time, r.place, r.p0, r.p1, r.p2].join('|');
      if (!map[k]) { map[k] = { key: k, childId: r.childId, dir: r.dir, time: r.time, place: r.place, p0: r.p0, p1: r.p1, p2: r.p2, days: [], ids: [] }; order.push(k); }
      map[k].days.push(r.weekday); map[k].ids.push(r.id);
    });
    return order.map(function (k) { return map[k]; });
  }

  function weekView(ctx, rides) {
    var core = ctx.core; var out = [];
    if (!core.children.length) return [noKids(core, ctx.fid)];
    var mgr = F9.isMgr(core);
    out.push(h('p', { class: 'muted', text: 'Lịch cố định hằng tuần. Muốn đổi người cho một ngày, vào "Theo ngày" và bấm Đổi người.' }));
    core.children.forEach(function (kid) {
      var mine = groupRides(rides.filter(function (r) { return r.childId === kid.id; }));
      var card = h('div', { class: 'card c-' + kid.color }, [h('div', { class: 'row' }, [h('div', { class: 'col' }, [F9.kidChip(kid)]), mgr ? h('button', { class: 'linkbtn', type: 'button', text: 'Thêm ca', onclick: function () { F9.rideForm(ctx, { childId: kid.id }); } }) : null])]);
      if (!mine.length) card.appendChild(h('p', { class: 'muted mt', text: 'Chưa có ca đưa đón nào.' }));
      mine.forEach(function (g) {
        var who = g.p0 ? personName(core, g.p0) : 'Chưa gán người';
        var backups = [g.p1, g.p2].filter(Boolean).map(function (id) { return personName(core, id); });
        var el = h(mgr ? 'button' : 'div', { class: 'list-row' + (mgr ? ' tap' : ''), type: mgr ? 'button' : null, onclick: mgr ? function () { F9.rideForm(ctx, { group: g }); } : null }, [
          h('div', { class: 'col' }, [
            h('div', { class: 'b', text: (g.dir === 'dua' ? 'Đưa' : 'Đón') + ' lúc ' + g.time + ' · ' + g.days.sort().map(function (d) { return F9.WD_SHORT[d]; }).join(', ') }),
            h('div', { class: 'muted', text: who + (backups.length ? ' · dự phòng ' + backups.join(', ') : '') + (g.place ? ' · ' + g.place : '') }),
          ]),
          mgr ? F9.ico('chev', 20) : null,
        ]);
        card.appendChild(el);
      });
      out.push(card);
    });
    return out;
  }

  function histView(ctx, rides) {
    var out = [];
    if (!rides.length) return [F9.empty('Chưa có lịch sử', 'Các ca đã xong hoặc bỏ qua sẽ hiện ở đây trong 30 ngày.')];
    var card = h('div', { class: 'card' });
    rides.forEach(function (r) {
      var txt = r.state === 'xong' ? (r.doneName || '?') + ' ' + (r.dir === 'dua' ? 'đã đưa' : 'đã đón') + ' lúc ' + (r.doneAt ? F9.hhmm(r.doneAt) : '') :
        r.state === 'bo_qua' ? 'Bỏ qua' + (r.skipReason ? ': ' + r.skipReason : '') : r.state === 'khong_ai' ? 'Không ai nhận' : 'Không ghi nhận';
      card.appendChild(h('div', { class: 'list-row' }, [
        h('div', { class: 'col' }, [h('div', { class: 'b', text: (r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName + ' · ' + r.time }), h('div', { class: 'muted', text: F9.dayShort(r.day, ctx.today) + ' · ' + txt })]),
        F9.chip(STATE[r.state] ? (r.state === 'xong' ? 'Xong' : STATE[r.state][0]) : r.state, r.state === 'xong' ? 'ok' : r.state === 'khong_ai' ? 'bad' : ''),
      ]));
    });
    out.push(card);
    return out;
  }

  // ---------- thêm / sửa ca cố định ----------
  F9.rideForm = function (ctx, o) {
    var core = ctx.core; var g = o.group;
    var people = core.members.filter(function (m) { return m.external || !m.pending; });
    var peopleOpts = [['', 'Chưa gán']].concat(people.map(function (m) { return [m.id, m.name + (m.external ? ' (đón hộ)' : '')]; }));
    F9.sheet(g ? 'Sửa ca đưa đón' : 'Thêm ca đưa đón', function (body, close) {
      var kidSel = F9.select(core.children.map(function (c) { return [c.id, c.name]; }), (g ? g.childId : o.childId) || core.children[0].id);
      var dir = F9.chips([['don', 'Đón'], ['dua', 'Đưa']], [g ? g.dir : 'don'], null, { single: true });
      var days = F9.chips([1, 2, 3, 4, 5, 6, 7].map(function (d) { return [d, F9.WD_SHORT[d]]; }), g ? g.days : [1, 2, 3, 4, 5], null);
      days.className += ' wd-row';
      var time = h('input', { type: 'time', value: g ? g.time : '16:30', 'aria-label': 'Giờ' });
      var place = F9.text({ value: g ? g.place : '', maxlength: 100, placeholder: 'Ví dụ: Cổng B' });
      var p0 = F9.select(peopleOpts, g ? g.p0 || '' : ''); var p1 = F9.select(peopleOpts, g ? g.p1 || '' : ''); var p2 = F9.select(peopleOpts, g ? g.p2 || '' : '');
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      function pv(s) { return s.value || null; }
      var save = F9.btn(g ? 'Lưu thay đổi' : 'Thêm ca', 'primary block', function () {
        err.className = 'hint err hidden';
        return F9.busy(save, function () {
          var people3 = { p0: pv(p0), p1: pv(p1), p2: pv(p2) };
          var p;
          if (g) {
            // sửa cả nhóm các thứ giống nhau; thay đổi thứ thì xóa và tạo lại phần chênh lệch
            var newDays = days.getValue(); var jobs = [];
            var curDays = g.days.slice();
            g.ids.forEach(function (id, i) {
              if (newDays.indexOf(curDays[i]) >= 0) jobs.push(F9.post(F9.fam(ctx.fid, '/rides/' + id), { time: time.value, place: place.value, p0: people3.p0, p1: people3.p1, p2: people3.p2 }));
              else jobs.push(F9.del(F9.fam(ctx.fid, '/rides/' + id)));
            });
            var add = newDays.filter(function (d) { return curDays.indexOf(d) < 0; });
            p = Promise.all(jobs).then(function () { return add.length ? F9.post(F9.fam(ctx.fid, '/rides'), { childId: g.childId, dir: g.dir, weekdays: add, time: time.value, place: place.value, p0: people3.p0, p1: people3.p1, p2: people3.p2 }) : null; });
          } else {
            p = F9.post(F9.fam(ctx.fid, '/rides'), { childId: kidSel.value, dir: dir.getValue()[0], weekdays: days.getValue(), time: time.value, place: place.value, p0: people3.p0, p1: people3.p1, p2: people3.p2 }, { idem: 'mkride' });
          }
          return p.then(function () { close(); F9.toast('Đã lưu lịch đưa đón'); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      if (!g) body.appendChild(F9.field('Con', kidSel));
      if (!g) { body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Loại ca' }), dir])); }
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Các thứ trong tuần' }), days]));
      body.appendChild(F9.field('Giờ', time));
      body.appendChild(F9.field('Địa điểm, ghi chú', place));
      body.appendChild(F9.field('Người phụ trách', p0));
      body.appendChild(F9.field('Người dự phòng thứ nhất', p1, 'Được nhắc nếu người phụ trách chưa nhận ca'));
      body.appendChild(F9.field('Người dự phòng thứ hai', p2));
      body.appendChild(err);
      body.appendChild(save);
      if (g) {
        var del = F9.btn('Xóa ca này', 'ghost block', function () {
          F9.confirm({ title: 'Xóa ca đưa đón?', text: 'Xóa ' + (g.dir === 'dua' ? 'ca đưa' : 'ca đón') + ' lúc ' + g.time + ' khỏi lịch hằng tuần. Lịch sử đã ghi vẫn giữ nguyên.', ok: 'Xóa', danger: true }).then(function (yes) {
            if (!yes) return;
            Promise.all(g.ids.map(function (id) { return F9.del(F9.fam(ctx.fid, '/rides/' + id)); })).then(function () { close(); F9.toast('Đã xóa'); F9.dropGate(); F9.refresh(true); }, F9.fail);
          });
        });
        body.appendChild(del);
      }
    });
  };
})();
