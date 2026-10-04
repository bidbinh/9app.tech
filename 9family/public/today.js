/* 9family: màn Hôm nay và hộp thông báo. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;

  // một dòng sự kiện trong dòng thời gian
  F9.evRow = function (o, ctx, opts) {
    opts = opts || {};
    var core = ctx.core;
    var kids = (o.childIds || []).map(function (id) { return F9.kidOf(core, id); }).filter(Boolean);
    var timeCol = h('div', { class: 'ev-time' }, o.allDay ? [h('small', { text: 'Cả ngày' })] : [o.start, o.end ? h('small', { text: o.end }) : null]);
    var main = h('div', { class: 'ev-main' + (kids[0] ? ' c-' + kids[0].color : '') }, [
      h('div', { class: 'ev-t', text: o.title }),
      (o.location || kids.length || opts.showDay) ? h('div', { class: 'ev-sub' }, [
        opts.showDay ? F9.dayShort(o.day, ctx.today) + (o.location || kids.length ? ' · ' : '') : '',
        o.location ? o.location + (kids.length ? ' · ' : '') : '',
        kids.length ? kids.map(function (k) { return k.name; }).join(', ') : '',
      ]) : null,
      (o.checklist && o.checklist.length && !opts.compact) ? h('div', { class: 'bring' }, [h('b', { text: 'Cần mang: ' }), o.checklist.join(', ')]) : null,
      o.edited ? h('div', { class: 'ev-sub', text: 'Đã sửa riêng ngày này' }) : null,
    ]);
    return h('button', { class: 'ev', type: 'button', 'aria-label': o.title, onclick: function () { F9.eventSheet(ctx, o); } }, [timeCol, main]);
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
      [others, 'Mời bố, mẹ, ông, bà qua link', '#/f/' + fid + '/me'],
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
    F9.frame({ title: 'Hôm nay', tabs: { fid: fid, tab: 'today' }, right: [F9.bell(fid)] });
    F9.skeleton();
    F9.live({
      fetch: function () { return F9.loadView(fid, 'today', function () { return F9.get(F9.fam(fid, '/today')); }); },
      render: function (x) { renderToday(fid, x); },
      retick: true, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { F9.today(fid); }); });
  };

  function renderToday(fid, x) {
    var core = x.core; var t = x.d; F9.syncClock(t.now);
    F9.setTitle(core.family.name);
    F9.setUnread(t.unread);
    var ctx = { fid: fid, core: core, today: t.today };
    var nodes = [];
    nodes.push(h('div', {}, [
      h('h1', { class: 'h1', text: 'Hôm nay' }),
      h('div', { class: 'sub', text: F9.WD[F9.weekday(t.today)] + ', ' + F9.dmy(t.today) + ' · Âm lịch ' + F9.lunarText(t.lunar) }),
    ]));
    var ob = onboarding(core, fid, t.rides.length);
    if (ob) nodes.push(ob);
    if (t.unread) nodes.push(F9.link('#/f/' + fid + '/inbox', { class: 'notice' }, [h('div', { class: 'notice-ico' }, [F9.ico('bell', 22)]), h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: 'Bạn có ' + t.unread + ' thông báo chưa đọc' }), h('div', { text: 'Bấm để xem' })])]));

    // đưa đón
    if (core.children.length) {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Đưa đón hôm nay' }), F9.link('#/f/' + fid + '/rides', { class: 'linkbtn', 'aria-label': 'Mở màn Đưa đón' }, ['Tất cả'])]));
      if (!t.rides.length) nodes.push(h('div', { class: 'card flat' }, [h('div', { class: 'muted', text: 'Hôm nay không có ca đưa đón nào.' }), F9.isMgr(core) ? h('div', { class: 'mt' }, [F9.link('#/f/' + fid + '/rides', { class: 'linkbtn' }, ['Đặt lịch đưa đón'])]) : null]));
      t.rides.forEach(function (r) { nodes.push(F9.rideCard(r, ctx)); });
    }

    // lịch hôm nay
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Lịch hôm nay' }), F9.link('#/f/' + fid + '/event/new/' + t.today, { class: 'linkbtn' }, ['+ Thêm'])]));
    var allday = t.events.filter(function (e) { return e.allDay; }); var timed = t.events.filter(function (e) { return !e.allDay; });
    if (!t.events.length) nodes.push(h('div', { class: 'card flat' }, [h('div', { class: 'muted', text: 'Hôm nay chưa có sự kiện nào.' })]));
    else nodes.push(h('div', { class: 'card timeline' }, allday.concat(timed).map(function (o) { return F9.evRow(o, ctx); })));

    // việc chung đang chờ
    if (t.tasks.length) {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Việc đang chờ' }), F9.link('#/f/' + fid + '/tasks', { class: 'linkbtn' }, ['Tất cả'])]));
      nodes.push(h('div', { class: 'card' }, t.tasks.map(function (k) { return taskRow(k, ctx); })));
    }

    // ngày mai
    var tmr = F9.addDays(t.today, 1);
    if (t.tomorrowRides.length || t.tomorrowEvents.length) {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Ngày mai, ' + F9.dm(tmr) })]));
      var card = h('div', { class: 'card timeline' });
      t.tomorrowRides.forEach(function (r) {
        card.appendChild(h('div', { class: 'ev' }, [h('div', { class: 'ev-time', text: r.time }), h('div', { class: 'ev-main c-' + (r.childColor || 'xanh') }, [
          h('div', { class: 'ev-t', text: (r.dir === 'dua' ? 'Đưa ' : 'Đón ') + r.childName }), h('div', { class: 'ev-sub', text: r.p0Name ? 'Phụ trách: ' + r.p0Name : 'Chưa có người phụ trách' })])]));
      });
      t.tomorrowEvents.forEach(function (o) { card.appendChild(F9.evRow(o, ctx, { compact: true })); });
      nodes.push(card);
    }
    F9.mount(nodes);
  }

  function taskRow(k, ctx) {
    var due = k.due ? (k.due < ctx.today ? 'Quá hạn ' + F9.dm(k.due) : k.due === ctx.today ? 'Hạn hôm nay' : 'Hạn ' + F9.dm(k.due)) : '';
    var who = k.assigneeId ? (F9.memberOf(ctx.core, k.assigneeId) || {}).name : '';
    return h('div', { class: 'list-row' }, [
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Đánh dấu đã xong: ' + k.title, onclick: function (e) {
        var b = e.currentTarget;
        F9.busy(b, function () { return F9.post(F9.fam(ctx.fid, '/tasks/' + k.id + '/done'), {}).then(function () { F9.dropGate(); return F9.refresh(true); }); });
      } }, [h('span', { class: 'step-no' })]),
      h('div', { class: 'col' }, [h('div', { class: 'b', text: k.title }), (due || who) ? h('div', { class: 'muted small' + (due.indexOf('Quá') === 0 ? ' warn-t' : ''), text: [who, due].filter(Boolean).join(' · ') }) : null]),
    ]);
  }
  F9.taskRow = taskRow;

  // ---------- hộp thông báo ----------
  var ICON = { ride: 'car', event: 'cal', important: 'sun', task: 'list', family: 'users' };
  F9.inbox = function (fid) {
    F9.frame({ title: 'Thông báo', back: '#/f/' + fid + '/today' });
    F9.skeleton();
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
        if (!x.items.length) nodes.push(F9.empty('Chưa có thông báo nào', 'Nhắc đưa đón, sự kiện và việc chung sẽ hiện ở đây.'));
        else {
          nodes.push(h('div', { class: 'card' }, x.items.map(function (n) {
            var unread = firstUnread[n.id];
            var body = [
              h('div', { class: 'avatar' }, [F9.ico(ICON[n.type] || 'bell', 20)]),
              h('div', { class: 'col' }, [h('div', { class: unread ? 'b' : '', text: n.title }), n.body ? h('div', { class: 'muted', text: n.body }) : null, h('div', { class: 'muted small', text: F9.stamp(n.at, x.core.today) })]),
              unread ? F9.chip('Mới', 'bad') : null,
            ];
            return n.link ? F9.link(n.link, { class: 'list-row' }, body) : h('div', { class: 'list-row' }, body);
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
