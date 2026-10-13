/* 9family: màn Hôm nay (dòng thời gian có đồng hồ "bây giờ") và hộp thông báo. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var showTomorrow = false;

  function kidsOf(core, o) { return (o.childIds || []).map(function (id) { return F9.kidOf(core, id); }).filter(Boolean); }
  function peopleOf(core, o) { return (o.memberIds || []).map(function (id) { return F9.memberOf(core, id); }).filter(Boolean); }
  function endMin(o) { // phút kết thúc trong ngày (mặc định bắt đầu + 60 phút)
    var s = o.start || '00:00'; var e = o.end || null;
    var t = (e || s).split(':'); var v = +t[0] * 60 + +t[1];
    return e ? v : v + 60;
  }

  // Một dòng sự kiện: giờ | (avatar con) tiêu đề / nơi · người phụ trách | avatar người phụ trách
  F9.evRow = function (o, ctx, opts) {
    opts = opts || {};
    var core = ctx.core;
    var kids = kidsOf(core, o); var ppl = peopleOf(core, o);
    var past = false;
    if (ctx.today === o.day && !o.allDay) { var n = F9.vnDate(F9.nowMs()); past = (n.getUTCHours() * 60 + n.getUTCMinutes()) > endMin(o); }
    var sub = [];
    if (kids.length) sub.push(h('span', { class: 'ico-t' }, [kids.map(function (k) { return k.name; }).join(', ')]));
    if (o.location) sub.push(h('span', { class: 'ico-t' }, [F9.ico('pin', 14), o.location]));
    if (opts.showDay) sub.unshift(h('span', { class: 'ico-t', text: F9.dayShort(o.day, ctx.today) }));
    if (o.edited) sub.push(F9.chip('Đã sửa riêng ngày này'));
    var title = h('div', { class: 'ev-t' }, [kids.length ? F9.avatars(kids, 's') : null, o.title]);
    var main = h('div', { class: 'ev-main' }, [
      title, sub.length ? h('div', { class: 'ev-sub' }, sub) : null,
      (o.checklist && o.checklist.length && !opts.compact) ? h('div', { class: 'bring' }, [h('b', { text: 'Cần mang: ' }), o.checklist.join(', ')]) : null,
    ]);
    var who = ppl.length ? h('div', { class: 'ev-x' }, [F9.avatars(ppl, 's'), h('span', { class: 'sr', text: 'Phụ trách: ' + ppl.map(function (p) { return p.name; }).join(', ') })]) : h('div', { class: 'ev-x' });
    var cls = 'ev' + (past ? ' past' : '') + (o.allDay ? ' allday' : '');
    if (o.allDay) {
      return h('button', { class: cls, type: 'button', 'aria-label': o.title + ', cả ngày', onclick: function () { F9.eventSheet(ctx, o); } }, [main, h('div', { class: 'ev-x' }, [F9.chip('Cả ngày'), ppl.length ? F9.avatars(ppl, 's') : null])]);
    }
    return h('button', { class: cls, type: 'button', 'aria-label': o.title + ' lúc ' + o.start, onclick: function () { F9.eventSheet(ctx, o); } }, [
      h('div', { class: 'ev-time' }, [o.start, o.end ? h('small', { text: o.end }) : null]), main, who,
    ]);
  };

  function onboarding(core, fid, rides) {
    var mgr = F9.isMgr(core);
    var hasKids = core.children.length > 0;
    var others = core.members.filter(function (m) { return !m.external && !m.isMe; }).length > 0;
    var hasRides = rides > 0;
    if (hasKids && others && hasRides) return null;
    if (!mgr) {
      return hasKids ? null : F9.notice('info', 'Gia đình chưa có con nào', 'Nhờ chủ gia đình thêm hồ sơ con, rồi lịch học và đưa đón sẽ hiện ở đây.');
    }
    var steps = [
      [true, 'Tạo gia đình', null],
      [hasKids, 'Thêm con', '#/f/' + fid + '/me'],
      [others, 'Mời bố, mẹ, ông, bà vào gia đình', '#/f/' + fid + '/me'],
      [hasRides, 'Đặt lịch đưa đón và người dự phòng', '#/f/' + fid + '/rides'],
    ];
    return h('div', { class: 'card' }, [
      h('h2', { text: core.children.length ? 'Hoàn tất thiết lập' : 'Bắt đầu với gia đình mới' }),
      h('div', { class: 'muted', text: 'Làm lần lượt vài bước, mất khoảng 3 phút.' }),
      h('div', { class: 'progress' }, steps.map(function (s, i) {
        var body = [h('div', { class: 'step-no' }, [s[0] ? F9.ico('check', 16, 3) : String(i + 1)]), h('div', { class: 'col b', text: s[1] }), !s[0] && s[2] ? F9.ico('chev', 20) : null];
        return !s[0] && s[2] ? F9.link(s[2], { class: 'step-row' }, body) : h('div', { class: 'step-row' + (s[0] ? ' done' : '') }, body);
      })),
    ]);
  }

  F9.today = function (fid) {
    F9.frame({ title: 'Hôm nay', fam: { name: F9.famName() }, sub: F9.famName(), tabs: { fid: fid, tab: 'today' }, right: [F9.osinBtn(fid), F9.bell(fid)] });
    F9.skeleton('list');
    F9.live({
      fetch: function () {
        return F9.loadView(fid, 'today', function () {
          return Promise.all([F9.get(F9.fam(fid, '/today')), F9.get(F9.fam(fid, '/lists')), F9.get(F9.fam(fid, '/menu/today')).catch(function () { return null; })]).then(function (a) { return Object.assign(a[0], { shopping: a[1].shopping, menuToday: a[2] }); });
        });
      },
      render: function (x) { renderToday(fid, x); },
      retick: true, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { F9.today(fid); }); });
  };

  function renderToday(fid, x) {
    var core = x.core; var t = x.d; F9.syncClock(t.now);
    F9.setFam(core.family.name);
    F9.setUnread(t.unread);
    var ctx = { fid: fid, core: core, today: t.today };
    var mgr = F9.isMgr(core);
    F9.setFab({ label: 'Thêm', aria: 'Thêm sự kiện, việc hoặc món đi chợ', onclick: function () { F9.addMenu(ctx, { day: t.today }); } });
    var nodes = [];
    var l = core.lunar || {};
    nodes.push(h('div', {}, [
      h('h1', { class: 'h1', text: F9.WD[F9.weekday(t.today)] + ', ' + F9.dm(t.today) }),
      h('div', { class: 'sub', text: F9.dmy(t.today).slice(6) + ' · Âm lịch ' + F9.lunarText(t.lunar) + (l.canChi ? ' · năm ' + l.canChi : '') }),
    ]));

    var rides = t.rides;
    var timed = t.events.filter(function (e) { return !e.allDay; }); var allday = t.events.filter(function (e) { return e.allDay; });
    var urgent = rides.filter(F9.rideUrgent);
    var left = rides.filter(function (r) { return r.state !== 'xong' && r.state !== 'bo_qua'; }).length;
    var sum = [];
    if (rides.length) sum.push(left ? left + ' ca đưa đón còn lại' : 'Xong hết ' + rides.length + ' ca đưa đón');
    if (t.events.length) sum.push(t.events.length + ' sự kiện');
    if (t.tasks.length) sum.push(t.tasks.length + ' việc');
    if (sum.length) nodes.push(h('div', { class: 'sumline', text: sum.join(' · ') }));

    // cần chú ý: ca chưa ai nhận, nổi bật nhưng bình tĩnh
    urgent.forEach(function (r) {
      var w = F9.dirWord(r.dir);
      var claim = F9.btn('Tôi nhận', 'primary xs', function () {
        return F9.busy(claim, function () {
          return F9.post(F9.fam(fid, '/ride-days/' + r.id + '/claim'), {}, { idem: 'rd' + r.id + 'claim' }).then(function (res) {
            if (!res.already) F9.toast('Bạn đã nhận ca ' + w + ' ' + r.childName); F9.dropGate(); return F9.refresh(true);
          }, function (e) { if (e.status === 409) { F9.toast(e.message, 'err'); F9.dropGate(); F9.refresh(true); return; } throw e; });
        });
      });
      nodes.push(h('div', { class: 'callout', role: 'status' }, [
        h('div', { class: 'callout-ico' }, [F9.ico('warn', 24)]),
        h('div', { class: 'col' }, [h('b', { text: 'Chưa ai nhận ca ' + w + ' ' + r.childName }), h('div', { class: 'small', text: r.time + ' · ' + F9.untilText(r.atTs).toLowerCase() })]),
        claim,
      ]));
    });

    var ob = onboarding(core, fid, rides.length);
    if (ob) nodes.push(ob);
    if (t.unread) nodes.push(F9.link('#/f/' + fid + '/inbox', { class: 'callout info' }, [h('div', { class: 'callout-ico' }, [F9.ico('bell', 22)]), h('div', { class: 'col' }, [h('b', { text: 'Bạn có ' + t.unread + ' thông báo chưa đọc' }), h('div', { class: 'small', text: 'Chạm để xem' })]), F9.ico('chev', 20)]));

    // dòng thời gian: ca đưa đón + sự kiện theo giờ, có mốc "Bây giờ"
    if (core.children.length || t.events.length) {
      var items = [];
      rides.forEach(function (r) { items.push({ time: r.time, kind: 0, node: function () { return F9.rideRow(r, ctx); } }); });
      timed.forEach(function (o) { items.push({ time: o.start, kind: 1, node: function () { return F9.evRow(o, ctx); } }); });
      items.sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : a.kind - b.kind; });
      var nowT = F9.hhmm(F9.nowMs());
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Dòng thời gian hôm nay' }), F9.link('#/f/' + fid + '/rides', { class: 'linkbtn', 'aria-label': 'Mở màn Đưa đón' }, ['Đưa đón', F9.ico('chev', 16)])]));
      if (!items.length && !allday.length) {
        nodes.push(F9.empty('Hôm nay thư thả', (core.me.role === 'con' ? 'Chưa có ca đưa đón hay sự kiện nào của bạn.' : 'Chưa có ca đưa đón hay sự kiện nào. Bấm Thêm để ghi lại.'), mgr && core.children.length ? h('div', { class: 'btn-row center' }, [F9.link('#/f/' + fid + '/rides', { class: 'btn ghost sm' }, ['Đặt lịch đưa đón'])]) : null, 'sun'));
      } else {
        var list = h('div', { class: 'list' });
        allday.forEach(function (o) { list.appendChild(F9.evRow(o, ctx)); });
        var placed = false;
        items.forEach(function (it) {
          if (!placed && it.time > nowT) { list.appendChild(h('div', { class: 'now', role: 'separator', text: 'Bây giờ ' + nowT })); placed = true; }
          list.appendChild(it.node());
        });
        if (!placed && items.length) list.appendChild(h('div', { class: 'now', role: 'separator', text: 'Bây giờ ' + nowT }));
        nodes.push(list);
      }
    } else {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Lịch hôm nay' })]));
      nodes.push(F9.empty('Hôm nay chưa có gì', 'Bấm Thêm để ghi sự kiện đầu tiên.', null, 'cal'));
    }

    // việc đang chờ
    if (t.tasks.length) {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Việc đang chờ' }), F9.link('#/f/' + fid + '/tasks', { class: 'linkbtn' }, ['Tất cả', F9.ico('chev', 16)])]));
      nodes.push(h('div', { class: 'list' }, t.tasks.map(function (k) { return taskRow(k, ctx); })));
    }

    // hôm nay ăn gì (thực đơn tuần, một dòng)
    var ml = F9.menuTodayLine ? F9.menuTodayLine(fid, t.menuToday) : null;
    if (ml) nodes.push(ml);

    // đi chợ
    var need = (t.shopping || []).filter(function (s) { return !s.bought; });
    if (need.length) {
      nodes.push(F9.link('#/f/' + fid + '/shop', { class: 'tile wide' }, [
        h('div', { class: 'tile-ico' }, [F9.ico('cart', 24)]),
        h('div', { class: 'col' }, [h('div', { class: 'tile-t', text: 'Cần mua ' + need.length + ' món' }), h('div', { class: 'tile-s trunc', text: need.slice(0, 4).map(function (s) { return s.text; }).join(', ') + (need.length > 4 ? '…' : '') })]),
        F9.ico('chev', 20),
      ]));
    }

    // ngày mai (gập lại cho gọn)
    var tmr = F9.addDays(t.today, 1);
    var nT = t.tomorrowRides.length + t.tomorrowEvents.length;
    if (nT) {
      nodes.push(h('button', { type: 'button', class: 'togl', 'aria-expanded': showTomorrow ? 'true' : 'false', onclick: function () { showTomorrow = !showTomorrow; F9.rerender(); } }, [
        F9.ico(showTomorrow ? 'chevu' : 'chevd', 20), 'Ngày mai, ' + F9.dm(tmr) + ' · ' + t.tomorrowRides.length + ' ca, ' + t.tomorrowEvents.length + ' sự kiện',
      ]));
      if (showTomorrow) {
        var card = h('div', { class: 'list' });
        t.tomorrowRides.forEach(function (r) {
          var kid = F9.kidOf(core, r.childId) || { color: r.childColor, name: r.childName };
          card.appendChild(h('div', { class: 'ev' }, [h('div', { class: 'ev-time', text: r.time }), h('div', { class: 'ev-main' }, [
            h('div', { class: 'ev-t' }, [F9.avatar(kid, 's'), (r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName]), h('div', { class: 'ev-sub', text: r.p0Name ? 'Phụ trách: ' + r.p0Name : 'Chưa có người phụ trách' })]), h('div', { class: 'ev-x' })]));
        });
        t.tomorrowEvents.forEach(function (o) { card.appendChild(F9.evRow(o, ctx, { compact: true })); });
        nodes.push(card);
      }
    }
    F9.mount(nodes);
  }

  function taskRow(k, ctx) {
    var due = k.due ? (k.due < ctx.today ? 'Quá hạn ' + F9.dm(k.due) : k.due === ctx.today ? 'Hạn hôm nay' : 'Hạn ' + F9.dm(k.due)) : '';
    var who = k.assigneeId ? (F9.memberOf(ctx.core, k.assigneeId) || {}).name : '';
    return h('div', { class: 'ev split task-row' }, [
      h('div', { class: 'ev-open task-open' }, [
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đánh dấu đã xong: ' + k.title, onclick: function (e) {
          var b = e.currentTarget;
          F9.busy(b, function () {
            return F9.post(F9.fam(ctx.fid, '/tasks/' + k.id + '/done'), {}).then(function () {
              F9.dropGate();
              F9.toast('Đã xong: ' + k.title, '', { undo: function () { return F9.post(F9.fam(ctx.fid, '/tasks/' + k.id + '/done'), { done: false }).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
              return F9.refresh(true);
            });
          });
        } }, [h('span', { class: 'step-no' })]),
        h('div', { class: 'ev-main' }, [h('div', { class: 'ev-t', text: k.title }), (due || who) ? h('div', { class: 'ev-sub' + (due.indexOf('Quá') === 0 ? ' warn-t' : ''), text: [who, due].filter(Boolean).join(' · ') }) : null]),
      ]),
      h('div', { class: 'ev-x' }),
    ]);
  }
  F9.taskRow = taskRow;

  // ---------- hộp thông báo ----------
  var ICON = { ride: 'car', event: 'cal', important: 'sun', task: 'list', family: 'users', health: 'heart', money: 'wallet' };
  F9.inbox = function (fid) {
    F9.frame({ title: 'Thông báo', back: '#/f/' + fid + '/today' });
    F9.skeleton('list');
    var firstUnread = null;
    F9.live({
      fetch: function () {
        return Promise.all([F9.get(F9.fam(fid)), F9.get(F9.fam(fid, '/notifications?limit=60'))]).then(function (a) { F9.syncClock(a[0].now); return { core: a[0], items: a[1].items }; });
      },
      render: function (x) {
        var ids = x.items.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
        if (firstUnread === null) firstUnread = {};
        ids.forEach(function (i) { firstUnread[i] = true; });
        var nodes = [];
        if (!x.items.length) nodes.push(F9.empty('Chưa có thông báo nào', 'Nhắc đưa đón, sự kiện và việc chung sẽ hiện ở đây.', null, 'bell'));
        else {
          nodes.push(h('div', { class: 'list' }, x.items.map(function (n) {
            var unread = firstUnread[n.id];
            var body = [
              h('span', { class: 'av l adult' }, [F9.ico(ICON[n.type] || 'bell', 20)]),
              h('div', { class: 'col' }, [h('div', { class: unread ? 'b' : '', text: n.title }), n.body ? h('div', { class: 'muted', text: n.body }) : null, h('div', { class: 'muted small', text: F9.stamp(n.at, x.core.today) })]),
              unread ? F9.chip('Mới', 'bad') : null,
            ];
            return n.link ? F9.link(n.link, { class: 'list-row inbox-row' }, body) : h('div', { class: 'list-row inbox-row' }, body);
          })));
        }
        nodes.push(F9.notice('info', 'Bật thông báo trên điện thoại', 'Vào tab Gia đình, mục Thông báo, để nhận nhắc đưa đón ngay cả khi không mở app.'));
        F9.mount(nodes);
        if (ids.length) F9.post(F9.fam(fid, '/notifications/read'), { upTo: Math.max.apply(null, ids) }).then(function () { F9.setUnread(0); }, function () {});
      },
      every: 12000,
    }).catch(function (e) { F9.loadError(e, function () { F9.inbox(fid); }); });
  };
})();
