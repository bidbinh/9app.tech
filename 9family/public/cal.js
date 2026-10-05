/* 9family: màn Lịch. Dải tuần (chấm theo màu từng con), danh sách gọn chỉ hiện ngày có sự kiện, lọc theo con, chuyển tuần/tháng, vuốt đổi tuần. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var view = { mode: 'week', anchor: null, child: null, sel: null, fid: null, empty: F9.store('cal.empty') === true };

  function mondayOf(day) { return F9.addDays(day, 1 - F9.weekday(day)); }
  function monthOf(day) { return day.slice(0, 7); }
  function range() {
    if (view.mode === 'week') { var m = mondayOf(view.anchor); return [m, F9.addDays(m, 6)]; }
    var first = view.anchor.slice(0, 8) + '01';
    var start = mondayOf(first);
    return [start, F9.addDays(start, 41)];
  }

  F9.cal = function (fid) {
    F9.frame({ title: 'Lịch', fam: { name: F9.famName() }, sub: F9.famName(), tabs: { fid: fid, tab: 'cal' }, right: [F9.btn(view.mode === 'week' ? 'Xem tháng' : 'Xem tuần', 'ghost xs', function () { view.mode = view.mode === 'week' ? 'month' : 'week'; view.sel = null; F9.cal(fid); }, { 'aria-label': view.mode === 'week' ? 'Chuyển sang xem theo tháng' : 'Chuyển sang xem theo tuần' }), F9.bell(fid)] });
    F9.skeleton('strip');
    if (view.fid !== fid) { view.fid = fid; view.anchor = null; view.child = null; view.sel = null; }
    F9.get(F9.fam(fid, '/pulse')).then(function (p) {
      F9.syncClock(p.now);
      if (!view.anchor) view.anchor = F9.todayOf(p.now);
      start(fid);
    }).catch(function (e) { F9.loadError(e, function () { F9.cal(fid); }); });
  };

  function start(fid) {
    var r = range(); var key = ['cal', view.mode, r[0], view.child || ''].join(':');
    F9.live({
      fetch: function () {
        return F9.loadView(fid, key, function () { return F9.get(F9.fam(fid, '/calendar?from=' + r[0] + '&to=' + r[1] + (view.child ? '&childId=' + view.child : ''))); });
      },
      render: function (x) { renderCal(fid, x, r); },
      retick: false, every: 12000,
    }).catch(function (e) { F9.loadError(e, function () { F9.cal(fid); }); });
  }

  function rerange(fid) { F9.cal(fid); }

  // Một ngày = MỘT dòng tiêu đề gọn (thứ + ngày, âm lịch nhạt bên phải) rồi danh sách sự kiện rộng hết cỡ
  function dayRow(day, today, lunar, content) {
    var isToday = day === today;
    var label = F9.dayLabel(day, today) + ', âm lịch ' + F9.lunarText(lunar);
    var head = h('div', { class: 'dcol' + (isToday ? ' today' : '') + (view.sel === day ? ' sel' : ''), role: 'group', 'aria-label': label }, [
      h('span', { class: 'dt' }, [isToday ? h('span', { class: 'dtoday', text: 'Hôm nay' }) : null, F9.WD[F9.weekday(day)] + ' ' + F9.dm(day)]),
      h('span', { class: 'lun', text: 'Âm ' + F9.lunarText(lunar) }),
    ]);
    return h('div', { class: 'dayrow', id: 'd-' + day }, [head, h('div', { class: 'dbody' }, content)]);
  }

  // Dải ngày: 7 ô (tuần) hoặc lưới 6 hàng (tháng). Chấm = màu của con có sự kiện ngày đó (chấm rỗng = sự kiện chung)
  function dayCell(day, today, byDay, core, o) {
    var evs = byDay[day] || [];
    var cols = []; var plain = false;
    evs.forEach(function (e) {
      var kid = e.childIds && e.childIds[0] ? F9.kidOf(core, e.childIds[0]) : null;
      if (kid) { if (cols.indexOf(kid.color) < 0) cols.push(kid.color); } else plain = true;
    });
    var dots = cols.slice(0, 3).map(function (c) { return h('i', { class: 'c-' + c }); });
    if (plain && dots.length < 3) dots.push(h('i', { class: 'plain' }));
    var cls = 'wday' + (day === today ? ' today' : '') + (view.sel === day ? ' sel' : '') + (o.out ? ' out' : '');
    return h('button', { type: 'button', class: cls, 'aria-pressed': view.sel === day ? 'true' : 'false', 'aria-label': F9.dayLabel(day, today) + (evs.length ? ', ' + evs.length + ' sự kiện' : ', không có sự kiện'), onclick: function () { o.onpick(day); } }, [
      o.showWd ? h('span', { class: 'wd', text: F9.WD_SHORT[F9.weekday(day)] }) : null,
      h('span', { class: 'dn', text: String(Number(day.slice(8))) }),
      h('span', { class: 'dots' }, dots),
    ]);
  }

  function renderCal(fid, x, r) {
    var core = x.core; var d = x.d; var today = d.today;
    F9.setFam(core.family.name);
    var ctx = { fid: fid, core: core, today: today };
    var sel = view.sel && view.sel >= r[0] && view.sel <= r[1] ? view.sel : null;
    if (view.mode === 'month' && !sel) { view.sel = monthOf(today) === monthOf(view.anchor) ? today : view.anchor.slice(0, 8) + '01'; sel = view.sel; }
    if (!sel) view.sel = null;
    F9.setFab({ label: 'Thêm', aria: 'Thêm sự kiện', onclick: function () { F9.quickEvent(ctx, { day: sel || (today >= r[0] && today <= r[1] ? today : view.anchor) }); } });
    var nodes = [];
    var inCur = view.mode === 'week' ? (today >= r[0] && today <= r[1]) : monthOf(today) === monthOf(view.anchor);
    var title, sub;
    if (view.mode === 'week') { title = F9.dm(r[0]) + ' – ' + F9.dm(r[1]) + '/' + r[1].slice(0, 4); sub = inCur ? 'Tuần này' : 'Tháng ' + Number(F9.addDays(r[0], 3).slice(5, 7)); }
    else { var p = view.anchor.split('-'); title = 'Tháng ' + Number(p[1]) + '/' + p[0]; sub = inCur ? 'Tháng này' : ''; }
    function shift(n) {
      if (view.mode === 'week') view.anchor = F9.addDays(view.anchor, 7 * n);
      else { var q = view.anchor.split('-'); var dt = new Date(Date.UTC(+q[0], +q[1] - 1 + n, 1)); view.anchor = dt.toISOString().slice(0, 10); }
      view.sel = null; rerange(fid);
    }
    nodes.push(h('div', { class: 'cal-head' }, [
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': view.mode === 'week' ? 'Tuần trước' : 'Tháng trước', onclick: function () { shift(-1); } }, [F9.ico('back', 24)]),
      h('div', { class: 'ttl center' }, [h('b', { text: title }), sub ? h('span', { text: sub }) : null]),
      !inCur ? F9.btn('Hôm nay', 'ghost xs', function () { view.anchor = today; view.sel = null; rerange(fid); }) : null,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': view.mode === 'week' ? 'Tuần sau' : 'Tháng sau', onclick: function () { shift(1); } }, [F9.ico('chev', 24)]),
    ]));

    var byDay = {};
    d.events.forEach(function (o) { (byDay[o.day] = byDay[o.day] || []).push(o); });

    var chips = core.children.length > 1 ? F9.fchips([{ value: '', label: 'Tất cả' }].concat(core.children.map(function (c) { return { value: c.id, label: c.name, who: c }; })), view.child || '', function (v) { view.child = v || null; rerange(fid); }) : null;
    if (view.mode === 'week') {
      var strip = h('div', { class: 'wstrip', role: 'group', 'aria-label': 'Chọn ngày trong tuần' });
      for (var i = 0; i < 7; i++) strip.appendChild(dayCell(F9.addDays(r[0], i), today, byDay, core, { showWd: true, onpick: function (day) {
        view.sel = day; F9.rerender();
        var el = document.getElementById('d-' + day); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } }));
      nodes.push(strip);
      if (chips) nodes.push(chips);
    } else {
      if (chips) nodes.push(chips);
      var grid = h('div', { class: 'month', role: 'group', 'aria-label': 'Chọn ngày trong tháng' });
      for (var w = 1; w <= 7; w++) grid.appendChild(h('div', { class: 'hd', text: F9.WD_SHORT[w] }));
      var curMonth = monthOf(view.anchor);
      for (var k = 0; k < 42; k++) grid.appendChild(dayCell(F9.addDays(r[0], k), today, byDay, core, { out: monthOf(F9.addDays(r[0], k)) !== curMonth, onpick: function (day) { view.sel = day; F9.rerender(); } }));
      nodes.push(grid);
    }

    // danh sách gọn
    var listNodes = [];
    function dayBlock(day, forceShow) {
      var evs = byDay[day] || [];
      var lun = d.lunar[day];
      if (!evs.length) {
        if (!(forceShow || view.empty || day === today)) return 0;
        listNodes.push(dayRow(day, today, lun, [h('div', { class: 'noev' }, [h('span', { text: 'Không có sự kiện' }), h('button', { class: 'linkbtn', type: 'button', 'aria-label': 'Thêm sự kiện ngày ' + F9.dm(day), onclick: function () { F9.quickEvent(ctx, { day: day }); } }, [F9.ico('plus', 16, 2.6), 'Thêm'])])]));
        return 0;
      }
      var allday = evs.filter(function (e) { return e.allDay; }); var timed = evs.filter(function (e) { return !e.allDay; });
      listNodes.push(dayRow(day, today, lun, [h('div', { class: 'list' }, allday.concat(timed).map(function (o) { return F9.evRow(o, ctx, { compact: true }); }))]));
      return evs.length;
    }
    if (view.mode === 'week') {
      var hidden = 0; var total = 0;
      for (var j = 0; j < 7; j++) {
        var day = F9.addDays(r[0], j);
        var n = dayBlock(day, view.sel === day);
        total += n;
        if (!n && !(view.empty || view.sel === day || day === today)) hidden++;
      }
      if (!total) listNodes.push(F9.empty('Tuần này chưa có sự kiện', 'Bấm Thêm để ghi lịch học, lịch khám hoặc ngày quan trọng.', null, 'cal'));
      if (hidden || view.empty) {
        listNodes.push(h('button', { type: 'button', class: 'togl', onclick: function () { view.empty = !view.empty; F9.store('cal.empty', view.empty); F9.rerender(); } }, [F9.ico(view.empty ? 'chevu' : 'chevd', 18), view.empty ? 'Ẩn ngày trống' : 'Hiện cả ngày trống (' + hidden + ')']));
      }
    } else {
      dayBlock(view.sel, true);
    }
    nodes.push.apply(nodes, listNodes);
    F9.mount(nodes);
    var pg = document.querySelector('#view .page');
    if (pg) F9.swipe(pg, function () { shift(1); }, function () { shift(-1); });
  }
})();
