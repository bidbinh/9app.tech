/* 9family: màn Lịch (tuần, tháng, lọc theo con, hiển thị ngày âm). */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var view = { mode: 'week', anchor: null, child: null, sel: null, fid: null };

  function mondayOf(day) { return F9.addDays(day, 1 - F9.weekday(day)); }
  function range() {
    if (view.mode === 'week') { var m = mondayOf(view.anchor); return [m, F9.addDays(m, 6)]; }
    var first = view.anchor.slice(0, 8) + '01';
    var start = mondayOf(first);
    return [start, F9.addDays(start, 41)];
  }
  function monthOf(day) { return day.slice(0, 7); }

  F9.cal = function (fid) {
    F9.frame({ title: 'Lịch', tabs: { fid: fid, tab: 'cal' }, right: [F9.bell(fid)] });
    F9.skeleton();
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

  function renderCal(fid, x, r) {
    var core = x.core; var d = x.d; var today = d.today;
    F9.setTitle(core.family.name);
    var ctx = { fid: fid, core: core, today: today };
    var nodes = [];
    nodes.push(h('div', { class: 'seg', role: 'tablist' }, [['week', 'Tuần'], ['month', 'Tháng']].map(function (m) {
      return h('button', { type: 'button', role: 'tab', class: view.mode === m[0] ? 'on' : '', 'aria-selected': view.mode === m[0] ? 'true' : 'false', text: m[1], onclick: function () { view.mode = m[0]; view.sel = null; rerange(fid); } });
    })));
    var title;
    if (view.mode === 'week') title = F9.dm(r[0]) + ' – ' + F9.dm(r[1]) + '/' + r[1].slice(0, 4);
    else { var p = view.anchor.split('-'); title = 'Tháng ' + Number(p[1]) + '/' + p[0]; }
    function shift(n) {
      if (view.mode === 'week') view.anchor = F9.addDays(view.anchor, 7 * n);
      else { var q = view.anchor.split('-'); var dt = new Date(Date.UTC(+q[0], +q[1] - 1 + n, 1)); view.anchor = dt.toISOString().slice(0, 10); }
      view.sel = null; rerange(fid);
    }
    nodes.push(h('div', { class: 'calnav' }, [
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': view.mode === 'week' ? 'Tuần trước' : 'Tháng trước', onclick: function () { shift(-1); } }, [F9.ico('back', 24)]),
      h('div', { class: 'ttl', text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': view.mode === 'week' ? 'Tuần sau' : 'Tháng sau', onclick: function () { shift(1); } }, [F9.ico('chev', 24)]),
    ]));
    var inCur = view.mode === 'week' ? (today >= r[0] && today <= r[1]) : monthOf(today) === monthOf(view.anchor);
    if (!inCur) nodes.push(h('div', { class: 'btn-row center' }, [F9.btn('Về hôm nay', 'ghost sm', function () { view.anchor = today; view.sel = null; rerange(fid); })]));
    if (core.children.length) {
      var items = [['', 'Tất cả']].concat(core.children.map(function (c) { return [c.id, c.name, 'c-' + c.color]; }));
      nodes.push(F9.chips(items, [view.child || ''], function (s) { view.child = s[0] || null; rerange(fid); }, { single: true }));
    }
    var byDay = {};
    d.events.forEach(function (o) { (byDay[o.day] = byDay[o.day] || []).push(o); });

    if (view.mode === 'week') {
      for (var i = 0; i < 7; i++) {
        (function (day) {
          var l = d.lunar[day];
          var evs = byDay[day] || [];
          nodes.push(h('div', { class: 'dayhd' + (day === today ? ' today' : '') }, [
            h('span', { text: F9.dayLabel(day, today) }),
            h('span', { class: 'lun', text: 'Âm ' + F9.lunarText(l) }),
          ]));
          if (!evs.length) nodes.push(h('div', { class: 'card flat' }, [h('div', { class: 'row sb' }, [h('span', { class: 'muted', text: 'Không có sự kiện' }), F9.link('#/f/' + fid + '/event/new/' + day, { class: 'linkbtn', 'aria-label': 'Thêm sự kiện ngày ' + F9.dm(day) }, ['+ Thêm'])])]));
          else nodes.push(h('div', { class: 'card timeline' }, evs.map(function (o) { return F9.evRow(o, ctx, { compact: false }); }).concat([h('div', { class: 'row' }, [F9.link('#/f/' + fid + '/event/new/' + day, { class: 'linkbtn' }, ['+ Thêm sự kiện'])])])));
        })(F9.addDays(r[0], i));
      }
    } else {
      var grid = h('div', { class: 'month', role: 'grid' });
      for (var w = 1; w <= 7; w++) grid.appendChild(h('div', { class: 'hd', text: F9.WD_SHORT[w] }));
      var curMonth = monthOf(view.anchor);
      for (var k = 0; k < 42; k++) {
        (function (day) {
          var l = d.lunar[day];
          var evs = byDay[day] || [];
          var colors = []; evs.forEach(function (o) { var kid = o.childIds && o.childIds[0] ? F9.kidOf(core, o.childIds[0]) : null; var c = kid ? kid.color : ''; if (colors.indexOf(c) < 0) colors.push(c); });
          var cls = 'mcell' + (day === today ? ' today' : '') + (monthOf(day) !== curMonth ? ' out' : '') + (view.sel === day ? ' sel' : '');
          var lunarTxt = l[0] === 1 ? '1/' + l[1] + (l[2] ? 'n' : '') : String(l[0]);
          grid.appendChild(h('button', { type: 'button', class: cls, 'aria-label': F9.dayLabel(day, today) + ', âm lịch ' + F9.lunarText(l) + (evs.length ? ', ' + evs.length + ' sự kiện' : ''), onclick: function () { view.sel = day; F9.rerender(); } }, [
            h('span', { class: 'd', text: String(Number(day.slice(8))) }),
            h('span', { class: 'l' + (l[0] === 1 ? ' first' : ''), text: lunarTxt }),
            h('span', { class: 'dots' }, colors.slice(0, 3).map(function (c) { return h('i', { class: c ? 'c-' + c : '' }); })),
          ]));
        })(F9.addDays(r[0], k));
      }
      nodes.push(grid);
      var sel = view.sel && view.sel >= r[0] && view.sel <= r[1] ? view.sel : (monthOf(today) === curMonth ? today : null);
      if (sel) {
        var evs2 = byDay[sel] || [];
        nodes.push(h('div', { class: 'dayhd' + (sel === today ? ' today' : '') }, [h('span', { text: F9.dayLabel(sel, today) }), h('span', { class: 'lun', text: 'Âm ' + F9.lunarText(d.lunar[sel]) })]));
        if (!evs2.length) nodes.push(h('div', { class: 'card flat' }, [h('div', { class: 'muted', text: 'Không có sự kiện' })]));
        else nodes.push(h('div', { class: 'card timeline' }, evs2.map(function (o) { return F9.evRow(o, ctx); })));
        nodes.push(h('div', { class: 'btn-row' }, [F9.link('#/f/' + fid + '/event/new/' + sel, { class: 'btn ghost' }, ['+ Thêm sự kiện ngày ' + F9.dm(sel)])]));
      }
    }
    nodes.push(h('div', { class: 'btn-row' }, [F9.link('#/f/' + fid + '/event/new/' + (view.sel || today), { class: 'btn primary' }, ['+ Thêm sự kiện'])]));
    F9.mount(nodes);
  }
})();
