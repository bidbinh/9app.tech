/* 9family: Việc chung và danh sách mua sắm. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var tab = 'tasks';
  var drafts = { task: '', shop: '' };

  F9.tasks = function (fid) {
    F9.frame({ title: 'Việc chung', tabs: { fid: fid, tab: 'tasks' }, right: [F9.bell(fid)] });
    F9.skeleton();
    F9.live({
      fetch: function () { return F9.loadView(fid, 'lists', function () { return F9.get(F9.fam(fid, '/lists')); }); },
      render: function (x) { render(fid, x); },
      retick: false, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { F9.tasks(fid); }); });
  };

  function addRow(placeholder, key, label, onadd) {
    var input = F9.text({ maxlength: key === 'shop' ? 300 : 100, placeholder: placeholder, 'data-k': 'add-' + key, 'aria-label': label, enterkeyhint: 'done' });
    input.value = drafts[key];
    input.addEventListener('input', function () { drafts[key] = input.value; });
    var btn = F9.btn('Thêm', 'primary', function () { return go(); });
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      return F9.busy(btn, function () { return onadd(v).then(function () { drafts[key] = ''; input.value = ''; F9.dropGate(); return F9.refresh(true); }); });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return h('div', { class: 'row' }, [h('div', { class: 'col' }, [input]), h('div', { style: null, class: 'ml' }, [btn])]);
  }

  function render(fid, x) {
    var core = x.core; var d = x.d; var today = d.today;
    F9.setTitle(core.family.name);
    var ctx = { fid: fid, core: core, today: today };
    var nodes = [h('div', { class: 'seg', role: 'tablist' }, [['tasks', 'Việc cần làm'], ['shop', 'Mua sắm']].map(function (m) {
      return h('button', { type: 'button', role: 'tab', class: tab === m[0] ? 'on' : '', 'aria-selected': tab === m[0] ? 'true' : 'false', text: m[1], onclick: function () { tab = m[0]; F9.rerender(); } });
    }))];
    if (tab === 'tasks') {
      nodes.push(h('div', { class: 'card' }, [addRow('Việc cần làm, ví dụ: Đóng tiền điện', 'task', 'Việc mới', function (v) { return F9.post(F9.fam(fid, '/tasks'), { title: v }, { idem: 'mktask' + F9.rid().slice(0, 4) }); })]));
      var open = d.tasks.filter(function (t) { return !t.done; }); var dn = d.tasks.filter(function (t) { return t.done; });
      if (!open.length && !dn.length) nodes.push(F9.empty('Chưa có việc nào', 'Thêm việc chung của cả nhà: đóng tiền điện, đi họp phụ huynh, mua quà sinh nhật...'));
      if (open.length) nodes.push(h('div', { class: 'card' }, open.map(function (t) { return taskLine(t, ctx); })));
      if (dn.length) { nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Đã xong gần đây' })])); nodes.push(h('div', { class: 'card' }, dn.map(function (t) { return taskLine(t, ctx); }))); }
    } else {
      nodes.push(h('div', { class: 'card' }, [addRow('Thêm món, ví dụ: Sữa tươi, trứng', 'shop', 'Món cần mua', function (v) { return F9.post(F9.fam(fid, '/shopping'), { text: v }, { idem: 'mkshop' + F9.rid().slice(0, 4) }); }), h('div', { class: 'hint', text: 'Gõ nhiều món cách nhau bằng dấu phẩy.' })]));
      var need = d.shopping.filter(function (s) { return !s.bought; }); var got = d.shopping.filter(function (s) { return s.bought; });
      if (!need.length && !got.length) nodes.push(F9.empty('Danh sách mua sắm trống', 'Ai trong nhà cũng thêm và tích được.'));
      if (need.length) nodes.push(h('div', { class: 'card' }, need.map(function (s) { return shopLine(s, ctx); })));
      if (got.length) {
        nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Đã mua' }), h('button', { class: 'linkbtn', type: 'button', text: 'Dọn đã mua', onclick: function () {
          F9.post(F9.fam(fid, '/shopping/clear-bought'), {}).then(function (r) { F9.toast('Đã dọn ' + r.removed + ' món'); F9.dropGate(); F9.refresh(true); }, F9.fail);
        } })]));
        nodes.push(h('div', { class: 'card' }, got.map(function (s) { return shopLine(s, ctx); })));
      }
    }
    F9.mount(nodes);
  }

  function taskLine(t, ctx) {
    var due = t.due ? (t.due < ctx.today && !t.done ? 'Quá hạn ' + F9.dm(t.due) : t.due === ctx.today ? 'Hạn hôm nay' : 'Hạn ' + F9.dm(t.due)) : '';
    var who = t.assigneeId ? (F9.memberOf(ctx.core, t.assigneeId) || {}).name : '';
    var meta = [who ? 'Giao cho ' + who : '', due, t.done && t.doneBy ? t.doneBy + ' đã xong' : ''].filter(Boolean).join(' · ');
    return h('div', { class: 'list-row' }, [
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': (t.done ? 'Bỏ đánh dấu xong: ' : 'Đánh dấu đã xong: ') + t.title, 'aria-pressed': t.done ? 'true' : 'false', onclick: function (e) {
        F9.busy(e.currentTarget, function () { return F9.post(F9.fam(ctx.fid, '/tasks/' + t.id + '/done'), { done: !t.done }).then(function () { F9.dropGate(); return F9.refresh(true); }); });
      } }, [h('span', { class: 'step-no' }, [t.done ? F9.ico('check', 16, 3) : null])]),
      h('button', { class: 'col', type: 'button', style: null, 'aria-label': 'Sửa việc: ' + t.title, onclick: function () { taskSheet(t, ctx); } }, [
        h('div', { class: 'b' + (t.done ? ' sub' : ''), text: t.title }), meta ? h('div', { class: 'muted small' + (due.indexOf('Quá') === 0 ? ' warn-t' : ''), text: meta }) : null,
      ]),
    ]);
  }

  function taskSheet(t, ctx) {
    F9.sheet('Sửa việc', function (body, close) {
      var title = F9.text({ value: t.title, maxlength: 100 });
      var logins = ctx.core.members.filter(function (m) { return !m.external && !m.pending; });
      var who = F9.select([['', 'Chưa giao ai']].concat(logins.map(function (m) { return [m.id, m.name]; })), t.assigneeId || '');
      var due = h('input', { type: 'date', value: t.due || '', 'aria-label': 'Hạn' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = F9.btn('Lưu', 'primary block', function () {
        return F9.busy(save, function () {
          return F9.post(F9.fam(ctx.fid, '/tasks/' + t.id), { title: title.value, assigneeId: who.value || null, due: due.value || null }).then(function () { close(); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(F9.field('Việc cần làm', title)); body.appendChild(F9.field('Giao cho', who)); body.appendChild(F9.field('Hạn (không bắt buộc)', due, 'Đến hạn sẽ nhắc người được giao lúc 7 giờ sáng'));
      body.appendChild(err); body.appendChild(save);
      body.appendChild(F9.btn('Xóa việc này', 'ghost block', function () {
        F9.del(F9.fam(ctx.fid, '/tasks/' + t.id)).then(function () { close(); F9.toast('Đã xóa'); F9.dropGate(); F9.refresh(true); }, F9.fail);
      }));
    });
  }

  function shopLine(s, ctx) {
    return h('div', { class: 'list-row' }, [
      h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': s.bought ? 'true' : 'false', 'aria-label': (s.bought ? 'Chưa mua: ' : 'Đã mua: ') + s.text, onclick: function (e) {
        F9.busy(e.currentTarget, function () { return F9.post(F9.fam(ctx.fid, '/shopping/' + s.id + '/bought'), { bought: !s.bought }).then(function () { F9.dropGate(); return F9.refresh(true); }); });
      } }, [h('span', { class: 'step-no' }, [s.bought ? F9.ico('check', 16, 3) : null])]),
      h('div', { class: 'col' }, [h('div', { class: 'b' + (s.bought ? ' sub' : ''), text: s.text }), h('div', { class: 'muted small', text: s.bought && s.boughtBy ? s.boughtBy + ' đã mua' : (s.addedBy ? s.addedBy + ' thêm' : '') })]),
      (F9.isMgr(ctx.core) || s.addedById === ctx.core.me.id) ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa món ' + s.text, onclick: function () {
        F9.del(F9.fam(ctx.fid, '/shopping/' + s.id)).then(function () { F9.dropGate(); F9.refresh(true); }, F9.fail);
      } }, [F9.ico('trash', 20)]) : null,
    ]);
  }
})();
