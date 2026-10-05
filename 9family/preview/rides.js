/* 9family: ca đưa đón. Hàng ca (dùng ở Hôm nay và Đưa đón), tờ chi tiết ca, màn Đưa đón (theo ngày, lịch tuần, lịch sử), form ca cố định. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;

  F9.isMgr = function (core) { return core.me.role === 'chu' || core.me.role === 'quan_ly'; };
  F9.kidOf = function (core, id) { return core.children.filter(function (c) { return c.id === id; })[0]; };
  F9.memberOf = function (core, id) { return core.members.filter(function (m) { return m.id === id; })[0]; };
  F9.loadView = function (fid, key, extra, force) {
    return F9.gated(fid, key, function () {
      return Promise.all([F9.get(F9.fam(fid)), extra ? extra() : null]).then(function (a) { F9.syncClock(a[0].now); F9.role = a[0].me.role; F9.legacy = !!a[0].me.legacy; document.body.classList.toggle('legacy', F9.legacy); return { core: a[0], d: a[1] }; });
    }, force);
  };
  F9.setTitle = function (t) { var el = document.querySelector('#bar-in .ttl'); if (el) el.textContent = t; };
  // Ô nhận diện gia đình trên thanh trên: nhớ tên lần trước để không nhấp nháy
  F9.famName = function () { return F9.store('famname') || '9family'; };
  F9.setFam = function (name) {
    F9.store('famname', name);
    var av = document.querySelector('#bar-in .bar-fam .av'); if (av) av.textContent = F9.initial(name);
    var a = document.querySelector('#bar-in .bar-fam'); if (a) a.setAttribute('aria-label', 'Gia đình ' + name + '. Chạm để chuyển gia đình');
    var sub = document.querySelector('#bar-in .ttl-sub'); if (sub) sub.textContent = name;
  };
  F9.dirWord = function (dir) { return dir === 'dua' ? 'đưa' : 'đón'; };

  // ---------- trạng thái ca ----------
  var STATE = {
    cho: ['Chờ người nhận', 'info'], khong_ai: ['Chưa ai nhận', 'warn'], da_nhan: ['Đã có người nhận', 'ok'], dang_di: ['Đang đi', 'ok'], xong: ['Đã xong', 'ok'], bo_qua: ['Bỏ qua', ''],
  };
  var isOpen = function (r) { return r.state === 'cho' || r.state === 'khong_ai' || r.state === 'da_nhan' || r.state === 'dang_di'; };
  var isWaiting = function (r) { return r.state === 'cho' || r.state === 'khong_ai'; };
  // Ca cần chú ý: chưa ai nhận và sắp tới giờ (<= 60 phút) hoặc vừa quá giờ (<= 90 phút). Ca quá giờ lâu hơn chỉ hiện nhạt, không báo động.
  F9.rideUrgent = function (r) {
    if (!isWaiting(r)) return false;
    var d = r.atTs - F9.nowMs();
    return d <= 60 * 60000 && d >= -90 * 60000;
  };
  function label(r) {
    var l = STATE[r.state][0]; var kind = STATE[r.state][1];
    if (r.state === 'cho' && !r.p0) { l = 'Chưa gán người'; kind = 'warn'; }
    if (r.state === 'da_nhan') l = (r.claimedName || 'Có người') + ' đã nhận';
    if (r.state === 'xong') l = r.dir === 'dua' ? 'Đã đưa' : 'Đã đón';
    return [l, kind];
  }
  function ctxMay(r, ctx) {
    var me = ctx.core.me;
    var involved = [r.p0, r.p1, r.p2, r.claimedBy].indexOf(me.id) >= 0;
    return { involved: involved, mayAct: F9.isMgr(ctx.core) || involved };
  }
  // Gọi API một thao tác trên ca; đóng tờ chi tiết nếu có
  function callRide(ctx, r, btn, action, body, msg, undo, sheetClose) {
    return F9.busy(btn, function () {
      return F9.post(F9.fam(ctx.fid, '/ride-days/' + r.id + '/' + action), body || {}, { idem: 'rd' + r.id + action }).then(function (res) {
        if (sheetClose) sheetClose();
        if (msg && !res.already) F9.toast(msg, '', undo ? { undo: undo } : null);
        F9.dropGate(); return F9.refresh(true);
      }, function (e) { if (e.status === 409) { if (sheetClose) sheetClose(); F9.toast(e.message, 'err'); F9.dropGate(); F9.refresh(true); return; } throw e; });
    });
  }

  // Dòng tóm tắt người phụ trách cho ca
  function whoLine(r) {
    var name = r.state === 'xong' ? (r.doneName || '') : r.state === 'da_nhan' || r.state === 'dang_di' ? (r.claimedName || r.p0Name || '') : (r.p0Name || '');
    return name;
  }

  // ---------- hàng một ca ----------
  F9.rideRow = function (r, ctx, opts) {
    opts = opts || {};
    var core = ctx.core; var me = core.me;
    var kid = F9.kidOf(core, r.childId) || { color: r.childColor, name: r.childName };
    var lb = label(r); var open = isOpen(r);
    var days = F9.diffDays(ctx.today, r.day);
    var urgent = F9.rideUrgent(r);
    var past = !open || (days === 0 && F9.nowMs() > r.atTs + 90 * 60000);
    var may = ctxMay(r, ctx);
    var w = F9.dirWord(r.dir);
    var doneLabel = r.dir === 'dua' ? 'Đã đưa' : 'Đã đón';

    var who = whoLine(r);
    var sub = h('div', { class: 'ev-sub' }, []);
    var whoTxt = r.state === 'xong' ? (r.doneName || 'Có người') + ' ' + (r.dir === 'dua' ? 'đã đưa' : 'đã đón') + ' lúc ' + (r.doneAt ? F9.hhmm(r.doneAt) : '') : r.state === 'bo_qua' ? 'Bỏ qua' + (r.skipReason ? ': ' + r.skipReason : '') : who + (r.p0External && (!r.claimedBy || r.claimedBy === r.p0) ? ' (người đón hộ)' : '');
    if (who || r.state === 'bo_qua') sub.appendChild(h('span', { class: 'ico-t' }, [r.state === 'bo_qua' ? null : F9.avatar({ name: who }, 's'), h('span', {}, [r.state === 'bo_qua' ? null : h('span', { class: 'sr', text: 'Phụ trách:' }), r.state === 'bo_qua' ? null : ' ', whoTxt])]));
    if (r.place && r.state !== 'xong') sub.appendChild(h('span', { class: 'ico-t' }, [F9.ico('pin', 14), r.place]));
    var line2 = null;
    if (open) {
      line2 = h('div', { class: 'ev-sub' }, [F9.chip(lb[0], lb[1]), h('span', { class: urgent ? 'warn-t' : '', text: days === 0 ? F9.untilText(r.atTs) : F9.dayShort(r.day, ctx.today) })]);
    }

    var main = h('div', { class: 'ev-main' }, [
      h('div', { class: 'ev-t' }, [F9.avatar(kid, 's'), (r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName]),
      sub.childNodes.length ? sub : null, line2,
      (r.state === 'khong_ai') ? h('div', { class: 'ev-sub warn-t', text: 'Đã nhắc hết các mốc mà chưa ai nhận. Hãy gọi hỏi nhau.' }) : null,
      (r.overrideName && r.state !== 'bo_qua' && !opts.compact) ? h('div', { class: 'ev-sub', text: 'Đã đổi người trong ngày bởi ' + r.overrideName + (r.overrideReason ? ': ' + r.overrideReason : '') }) : null,
    ]);
    var openBtn = h('button', { type: 'button', class: 'ev-open', 'aria-label': (r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName + ' lúc ' + r.time + '. Mở chi tiết', onclick: function () { F9.rideSheet(r, ctx); } }, [
      h('div', { class: 'ev-time', text: r.time }), main,
    ]);

    // một thao tác chính ngay trên hàng
    var act = null;
    if (isWaiting(r)) { act = F9.btn('Tôi nhận', 'primary xs', function () { return callRide(ctx, r, act, 'claim', {}, 'Bạn đã nhận ca ' + w + ' ' + r.childName); }); }
    else if (r.state === 'da_nhan' && r.claimedBy === me.id) { act = F9.btn('Đang đi', 'ghost xs', function () { return callRide(ctx, r, act, 'start', {}, 'Đã báo đang đi'); }); }
    else if ((r.state === 'da_nhan' || r.state === 'dang_di') && may.mayAct) { act = F9.btn(doneLabel, r.state === 'dang_di' ? 'primary xs' : 'ghost xs', function () { return callRide(ctx, r, act, 'done', r.p0External && r.claimedBy === r.p0 ? { forId: r.p0 } : {}, 'Đã báo cả nhà'); }); }
    else if (r.state === 'bo_qua') { act = F9.btn('Khôi phục ca', 'ghost xs', function () { return callRide(ctx, r, act, 'unskip', {}, 'Đã khôi phục ca'); }); }
    var cls = 'ev ride split' + (past ? ' past' : '') + (r.state === 'xong' || r.state === 'bo_qua' ? ' done' : '') + (urgent ? ' alert' : '');
    var trail = act ? [act] : [!open && r.state === 'xong' ? h('span', { class: 'ok-ico' }, [F9.ico('check', 18, 3), h('span', { class: 'sr', text: lb[0] })]) : null, F9.ico('chev', 18)];
    return h('div', { class: cls, 'data-ride': r.id }, [openBtn, h('div', { class: 'ev-x' }, trail)]);
  };

  // ---------- tờ chi tiết ca: mọi thao tác ----------
  F9.rideSheet = function (r, ctx) {
    var core = ctx.core; var me = core.me;
    var kid = F9.kidOf(core, r.childId) || { color: r.childColor, name: r.childName };
    var w = F9.dirWord(r.dir);
    F9.sheet((r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName + ' · ' + r.time, function (body, close) {
      var lb = label(r); var open = isOpen(r); var may = ctxMay(r, ctx);
      var days = F9.diffDays(ctx.today, r.day);
      body.appendChild(h('div', { class: 'row' }, [F9.avatar(kid, 'l'), h('div', { class: 'col ml' }, [h('div', { class: 'b', text: F9.dayLabel(r.day, ctx.today) }), r.place ? h('div', { class: 'muted', text: 'Địa điểm: ' + r.place }) : null]), F9.chip(lb[0], lb[1])]));
      if (open) body.appendChild(h('div', { class: isWaiting(r) && F9.rideUrgent(r) ? 'warn-t' : 'muted', text: days === 0 ? F9.untilText(r.atTs) : 'Giờ ' + r.time }));
      var ppl = h('div', {});
      var person = function (lab, nm, ext) { return nm ? h('div', { class: 'list-row' }, [F9.avatar({ name: nm }), h('div', { class: 'col' }, [h('div', { class: 'b', text: nm + (ext ? ' (người đón hộ)' : '') }), h('div', { class: 'muted small', text: lab })])]) : null; };
      ppl.appendChild(h('div', { class: 'card tight' }, [
        r.p0Name ? person('Phụ trách', r.p0Name, r.p0External) : h('div', { class: 'list-row' }, [F9.avatar({ name: '?' }), h('div', { class: 'col b', text: 'Chưa có người phụ trách' })]),
        person('Dự phòng thứ nhất', r.p1Name), person('Dự phòng thứ hai', r.p2Name),
      ].filter(Boolean)));
      body.appendChild(ppl);
      if (r.p0External && (r.p0Phone || r.p0Note)) {
        body.appendChild(h('div', { class: 'ride-links' }, [
          r.p0Phone ? h('a', { class: 'btn ghost sm', href: 'tel:' + r.p0Phone.replace(/[^0-9+]/g, ''), 'aria-label': 'Gọi ' + r.p0Name }, [F9.ico('phone', 18), r.p0Phone]) : null,
          r.p0Note ? h('div', { class: 'muted', text: 'Nhận dạng: ' + r.p0Note }) : null,
        ]));
      }
      if (r.overrideName && r.state !== 'bo_qua') body.appendChild(h('div', { class: 'warn-t', text: 'Đã đổi người trong ngày bởi ' + r.overrideName + (r.overrideReason ? ': ' + r.overrideReason : '') }));
      if (r.state === 'xong') body.appendChild(h('div', { class: 'muted', text: (r.doneName || 'Có người') + ' ' + w + ' lúc ' + (r.doneAt ? F9.hhmm(r.doneAt) : '') }));
      if (r.state === 'bo_qua') body.appendChild(h('div', { class: 'muted', text: 'Bỏ qua bởi ' + (r.skipName || 'một thành viên') + (r.skipReason ? ': ' + r.skipReason : '') }));
      if (r.state === 'khong_ai') body.appendChild(F9.notice('warn', 'Đã nhắc hết các mốc mà chưa ai nhận', 'Hãy gọi hỏi nhau ngay. Ai nhận được thì bấm Tôi nhận.'));

      var doneLabel = r.dir === 'dua' ? 'Đã đưa' : 'Đã đón';
      var row = h('div', { class: 'btn-row' });
      var mk = function (txt, cls, action, bodyObj, msg, undo) { var b = F9.btn(txt, cls, function () { return callRide(ctx, r, b, action, bodyObj, msg, undo, close); }); row.appendChild(b); return b; };
      if (isWaiting(r)) {
        mk('Tôi nhận', 'primary', 'claim', {}, 'Bạn đã nhận ca ' + w + ' ' + r.childName);
        if (r.p0External && r.p0) mk(r.p0Name + ' đã nhận', 'ghost', 'claim', { forId: r.p0 }, 'Đã ghi nhận ' + r.p0Name + ' nhận ca');
        if (may.mayAct) mk(doneLabel, 'ghost', 'done', {}, 'Đã báo cả nhà');
      } else if (r.state === 'da_nhan') {
        if (r.claimedBy === me.id) mk('Đang đi', 'ghost', 'start', {}, 'Đã báo đang đi');
        if (may.mayAct) mk(doneLabel, 'primary', 'done', r.p0External && r.claimedBy === r.p0 ? { forId: r.p0 } : {}, 'Đã báo cả nhà');
      } else if (r.state === 'dang_di') {
        if (may.mayAct) mk(doneLabel, 'primary', 'done', {}, 'Đã báo cả nhà');
      } else if (r.state === 'bo_qua') {
        mk('Khôi phục ca', 'ghost', 'unskip', {}, 'Đã khôi phục ca');
      }
      if (row.firstChild) body.appendChild(row);
      if (open) {
        var sec = h('div', { class: 'btn-row' });
        if (F9.isMgr(core) || may.involved) sec.appendChild(F9.btn('Đổi người', 'ghost', function () { close(); setTimeout(function () { F9.assignSheet(r, ctx); }, 160); }));
        if (may.mayAct) sec.appendChild(F9.btn('Bỏ qua ca này', 'ghost', function () { close(); setTimeout(function () { F9.skipSheet(r, ctx); }, 160); }));
        body.appendChild(sec);
      }
    });
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
            F9.avatar(m, 'l'),
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
            close(); F9.dropGate();
            F9.toast('Đã báo cả nhà bỏ qua ca này', '', { undo: function () { return F9.post(F9.fam(ctx.fid, '/ride-days/' + r.id + '/unskip'), {}).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
            return F9.refresh(true);
          });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Dùng khi con nghỉ học hoặc không cần ' + F9.dirWord(r.dir) + '. Cả nhà sẽ thấy và không bị nhắc nữa.' }));
      body.appendChild(F9.field('Lý do (không bắt buộc)', reason));
      body.appendChild(go);
    });
  };

  // ---------- màn Đưa đón ----------
  var view = { mode: 'day', day: null, child: null, fid: null };

  function mondayOf(day) { return F9.addDays(day, 1 - F9.weekday(day)); }

  F9.rides = function (fid) {
    F9.frame({ title: 'Đưa đón', fam: { name: F9.famName() }, sub: F9.famName(), tabs: { fid: fid, tab: 'rides' }, right: [F9.bell(fid)] });
    F9.skeleton('strip');
    if (view.fid !== fid) { view.day = null; view.fid = fid; view.child = null; }
    var key = 'rides:' + view.mode + ':' + (view.day || 'today');
    var fetchers = {
      day: function () { return Promise.all([F9.get(F9.fam(fid, '/rides/board' + (view.day ? '?day=' + view.day : ''))), F9.get(F9.fam(fid, '/rides'))]).then(function (a) { return Object.assign(a[0], { tpl: a[1].rides }); }); },
      week: function () { return F9.get(F9.fam(fid, '/rides')); },
      hist: function () { return F9.get(F9.fam(fid, '/rides/history')); },
    };
    F9.live({
      fetch: function () { return F9.loadView(fid, key, fetchers[view.mode]).then(function (x) { return { core: x.core, d: x.d, mode: view.mode, dayKey: view.day }; }); },
      render: function (x) { if (x.mode !== view.mode || x.dayKey !== view.day) return; renderRides(fid, x); },
      retick: true, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { F9.rides(fid); }); });
  };

  function noKids(core, fid) {
    return F9.empty('Chưa có con nào', F9.isMgr(core) ? 'Thêm con trước để đặt lịch đưa đón.' : 'Nhờ chủ gia đình thêm con vào gia đình.',
      F9.isMgr(core) ? h('div', { class: 'btn-row center' }, [F9.link('#/f/' + fid + '/me', { class: 'btn primary' }, ['Thêm con'])]) : null, 'users');
  }

  function renderRides(fid, x) {
    var core = x.core; F9.setFam(core.family.name);
    var today = core.today;
    var ctx = { fid: fid, core: core, today: today };
    var mgr = F9.isMgr(core);
    var nodes = [F9.seg([['day', 'Theo ngày'], ['week', 'Lịch tuần'], ['hist', 'Lịch sử']], view.mode, function (m) { view.mode = m; F9.rides(fid); }, 'Cách xem đưa đón')];
    F9.setFab(mgr && core.children.length ? { label: 'Thêm ca', aria: 'Thêm ca đưa đón', onclick: function () { F9.rideForm(ctx, {}); } } : null);
    if (view.mode === 'day') nodes.push.apply(nodes, dayView(fid, x, ctx));
    else if (view.mode === 'week') nodes.push.apply(nodes, weekView(ctx, x.d.rides));
    else nodes.push.apply(nodes, histView(ctx, x.d.rides));
    F9.mount(nodes);
    if (view.mode === 'day') {
      var pg = document.querySelector('#view .page');
      var go = function (n) { var d = F9.addDays(x.d.day, n); if (Math.abs(F9.diffDays(today, d)) <= 30) { view.day = d; F9.rides(fid); } };
      F9.swipe(pg, function () { go(1); }, function () { go(-1); });
    }
  }

  // Dải 7 ngày của tuần chứa `day`; dấu chấm theo khuôn tuần (ca lặp), chạm để chọn ngày
  function dayStrip(fid, day, today, tpl, core, onpick) {
    var mon = mondayOf(day);
    var strip = h('div', { class: 'wstrip', role: 'group', 'aria-label': 'Chọn ngày trong tuần' });
    for (var i = 0; i < 7; i++) {
      (function (d, wd) {
        var kids = []; (tpl || []).forEach(function (t) { if (t.weekday === wd && kids.indexOf(t.childId) < 0) kids.push(t.childId); });
        var diff = F9.diffDays(today, d);
        var cls = 'wday' + (d === today ? ' today' : '') + (d === day ? ' sel' : '');
        var b = h('button', { type: 'button', class: cls, disabled: Math.abs(diff) > 30, 'aria-pressed': d === day ? 'true' : 'false', 'aria-label': F9.dayLabel(d, today) + (kids.length ? ', có ca đưa đón' : ''), onclick: function () { onpick(d); } }, [
          h('span', { class: 'wd', text: F9.WD_SHORT[wd] }), h('span', { class: 'dn', text: String(Number(d.slice(8))) }),
          h('span', { class: 'dots' }, kids.slice(0, 3).map(function (cid) { var k = F9.kidOf(core, cid); return h('i', { class: k ? 'c-' + k.color : 'plain' }); })),
        ]);
        strip.appendChild(b);
      })(F9.addDays(mon, i), i + 1);
    }
    return strip;
  }

  function dayView(fid, x, ctx) {
    var core = x.core; var today = ctx.today; var day = x.d.day; var out = [];
    var go = function (d) { if (Math.abs(F9.diffDays(today, d)) > 30) { F9.toast('Chỉ xem được các ca trong 30 ngày quanh hôm nay'); return; } view.day = d; F9.rides(fid); };
    out.push(h('div', { class: 'cal-head' }, [
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ngày trước', onclick: function () { go(F9.addDays(day, -1)); } }, [F9.ico('back', 24)]),
      h('div', { class: 'ttl center' }, [h('b', { text: F9.dayLabel(day, today) })]),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ngày sau', onclick: function () { go(F9.addDays(day, 1)); } }, [F9.ico('chev', 24)]),
    ]));
    out.push(dayStrip(fid, day, today, x.d.tpl, core, go));
    if (day !== today) out.push(h('div', { class: 'btn-row center' }, [F9.btn('Về hôm nay', 'ghost sm', function () { view.day = null; F9.rides(fid); })]));
    if (!core.children.length) { out.push(noKids(core, fid)); return out; }
    if (core.children.length > 1) {
      out.push(F9.fchips([{ value: '', label: 'Tất cả' }].concat(core.children.map(function (c) { return { value: c.id, label: c.name, who: c }; })), view.child || '', function (v) { view.child = v || null; F9.rerender(); }));
    }
    var rides = x.d.rides.filter(function (r) { return !view.child || r.childId === view.child; });
    if (!rides.length) {
      out.push(F9.empty('Không có ca đưa đón', 'Ngày này chưa có ca nào theo lịch tuần.', F9.isMgr(core) ? h('div', { class: 'btn-row center' }, [F9.btn('Đặt lịch đưa đón', 'primary', function () { view.mode = 'week'; F9.rides(fid); })]) : null, 'car'));
      return out;
    }
    var waiting = rides.filter(isWaiting).length;
    out.push(h('div', { class: 'sumline' }, [rides.length + ' ca', waiting ? F9.chip(waiting + ' ca chờ người nhận', 'warn') : F9.chip('Đã có người lo', 'ok')]));
    var list = h('div', { class: 'list' });
    var nowAt = day === today;
    var placed = !nowAt;
    var nowT = F9.hhmm(F9.nowMs());
    rides.forEach(function (r) {
      if (!placed && r.time > nowT) { list.appendChild(h('div', { class: 'now', role: 'separator', text: 'Bây giờ ' + nowT })); placed = true; }
      list.appendChild(F9.rideRow(r, ctx));
    });
    if (!placed) list.appendChild(h('div', { class: 'now', role: 'separator', text: 'Bây giờ ' + nowT }));
    out.push(list);
    return out;
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
    return order.map(function (k) { return map[k]; }).sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
  }
  // [1,2,3,4,5] -> "T2–T6", [1,3] -> "T2, T4"
  function dayRange(days) {
    var d = days.slice().sort(function (a, b) { return a - b; }); var out = []; var i = 0;
    while (i < d.length) {
      var j = i; while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
      out.push(j - i >= 2 ? F9.WD_SHORT[d[i]] + '–' + F9.WD_SHORT[d[j]] : d.slice(i, j + 1).map(function (x) { return F9.WD_SHORT[x]; }).join(', '));
      i = j + 1;
    }
    return out.join(', ');
  }

  function weekView(ctx, rides) {
    var core = ctx.core; var out = [];
    if (!core.children.length) return [noKids(core, ctx.fid)];
    var mgr = F9.isMgr(core);
    out.push(h('p', { class: 'muted', text: 'Lịch cố định hằng tuần. Muốn đổi người cho một ngày, vào "Theo ngày" và mở ca đó.' }));
    core.children.forEach(function (kid) {
      var mine = groupRides(rides.filter(function (r) { return r.childId === kid.id; }));
      var card = h('div', { class: 'list' }, [h('div', { class: 'ev allday' }, [h('div', { class: 'ev-t' }, [F9.avatar(kid), kid.name]), mgr ? h('div', { class: 'ev-x' }, [h('button', { class: 'linkbtn', type: 'button', text: 'Thêm ca', onclick: function () { F9.rideForm(ctx, { childId: kid.id }); } })]) : null])]);
      if (!mine.length) card.appendChild(h('div', { class: 'noev', text: 'Chưa có ca đưa đón nào.' }));
      mine.forEach(function (g) {
        var who = g.p0 ? personName(core, g.p0) : 'Chưa gán người';
        var backups = [g.p1, g.p2].filter(Boolean).map(function (id) { return personName(core, id); });
        var inner = [
          h('div', { class: 'ev-time', text: g.time }),
          h('div', { class: 'ev-main' }, [
            h('div', { class: 'ev-t', text: (g.dir === 'dua' ? 'Đưa' : 'Đón') + ' lúc ' + g.time + ' · ' + g.days.slice().sort(function (a, b) { return a - b; }).map(function (d) { return F9.WD_SHORT[d]; }).join(', ') }),
            h('div', { class: 'ev-sub' }, [h('span', { class: 'ico-t' }, [F9.avatar({ name: who === 'Chưa gán người' ? '?' : who }, 's'), who + (backups.length ? ' · dự phòng ' + backups.join(', ') : '')]), g.place ? h('span', { class: 'ico-t' }, [F9.ico('pin', 14), g.place]) : null]),
          ]),
          mgr ? h('div', { class: 'ev-x' }, [F9.ico('chev', 18)]) : null,
        ];
        card.appendChild(h(mgr ? 'button' : 'div', { class: 'ev', type: mgr ? 'button' : null, onclick: mgr ? function () { F9.rideForm(ctx, { group: g }); } : null }, inner));
      });
      out.push(card);
    });
    return out;
  }

  function histView(ctx, rides) {
    if (!rides.length) return [F9.empty('Chưa có lịch sử', 'Các ca đã xong hoặc bỏ qua sẽ hiện ở đây trong 30 ngày.', null, 'clock')];
    var card = h('div', { class: 'list' });
    rides.forEach(function (r) {
      var kid = F9.kidOf(ctx.core, r.childId) || { color: r.childColor, name: r.childName };
      var txt = r.state === 'xong' ? (r.doneName || '?') + ' ' + (r.dir === 'dua' ? 'đã đưa' : 'đã đón') + ' lúc ' + (r.doneAt ? F9.hhmm(r.doneAt) : '') :
        r.state === 'bo_qua' ? 'Bỏ qua' + (r.skipReason ? ': ' + r.skipReason : '') : r.state === 'khong_ai' ? 'Không ai nhận' : 'Không ghi nhận';
      card.appendChild(h('div', { class: 'ev past' }, [
        h('div', { class: 'ev-time', text: r.time }),
        h('div', { class: 'ev-main' }, [h('div', { class: 'ev-t' }, [F9.avatar(kid, 's'), (r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName]), h('div', { class: 'ev-sub', text: F9.dayShort(r.day, ctx.today) + ' · ' + txt })]),
        h('div', { class: 'ev-x' }, [F9.chip(STATE[r.state] ? (r.state === 'xong' ? 'Xong' : STATE[r.state][0]) : r.state, r.state === 'xong' ? 'ok' : r.state === 'khong_ai' ? 'warn' : '')]),
      ]));
    });
    return [card];
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
