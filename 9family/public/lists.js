/* 9family: Tiện ích (cửa vào Việc chung, Đi chợ, Thực đơn tuần, Sức khỏe, Tiền, Thông báo trường) và Việc chung. Màn Đi chợ nằm ở menu-shop.js. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var drafts = { task: '' };

  // ---------- Tiện ích ----------
  F9.more = function (fid) {
    F9.frame({ title: 'Tiện ích', fam: { name: F9.famName() }, sub: F9.famName(), tabs: { fid: fid, tab: 'more' }, right: [F9.bell(fid)] });
    F9.skeleton('list');
    F9.live({
      fetch: function () { return F9.loadView(fid, 'lists', function () { return F9.get(F9.fam(fid, '/lists')); }); },
      render: function (x) { renderMore(fid, x); },
      retick: false, every: 15000,
    }).catch(function (e) { F9.loadError(e, function () { F9.more(fid); }); });
  };

  function tile(o) {
    var kids = [h('div', { class: 'tile-ico' }, [F9.ico(o.icon, 24)]), h('div', { class: 'tile-t', text: o.title }), h('div', { class: 'tile-s', text: o.sub })];
    if (o.badge) kids.push(F9.chip(o.badge, o.badgeKind || 'brand'));
    var cls = 'tile' + (o.soon ? ' soon' : '');
    return o.href ? F9.link(o.href, { class: cls }, kids) : h('button', { type: 'button', class: cls, onclick: o.onclick }, kids);
  }

  function renderMore(fid, x) {
    var core = x.core; var d = x.d;
    F9.setFam(core.family.name);
    F9.setFab(null);
    var openTasks = d.tasks.filter(function (t) { return !t.done; }).length;
    var need = d.shopping.filter(function (s) { return !s.bought; }).length;
    var nodes = [];
    nodes.push(h('div', {}, [h('h1', { class: 'h1', text: 'Tiện ích của cả nhà' }), h('div', { class: 'sub', text: 'Mọi thứ ngoài lịch học và đưa đón nằm ở đây.' })]));
    nodes.push(h('button', { type: 'button', class: 'tile wide', onclick: function () { F9.osinSheet(fid); } }, [
      h('div', { class: 'tile-ico' }, [F9.ico('sparkle', 26)]),
      h('div', { class: 'col' }, [h('div', { class: 'tile-t', text: 'Osin, trợ lý của nhà' }), h('div', { class: 'tile-s', text: 'Hỏi bằng chữ hoặc giọng nói: tối nay ai đón con, thêm lịch học…' })]),
      F9.chip('Sắp ra mắt', 'info'),
    ]));
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Dùng hằng ngày' })]));
    // Tài khoản của con chỉ dùng được: việc giao cho mình, sức khỏe và tiền của mình (khớp ma trận quyền ở máy chủ: thực đơn, đi chợ, thông báo trường chỉ dành cho người lớn)
    var kid = core.me.role === 'con';
    var tiles = [tile({ icon: 'list', title: 'Việc chung', sub: openTasks ? openTasks + ' việc đang chờ' : 'Chưa có việc nào', href: '#/f/' + fid + '/tasks', badge: openTasks ? String(openTasks) : null })];
    if (!kid) {
      tiles.push(tile({ icon: 'utensils', title: 'Thực đơn tuần', sub: 'Gợi ý món theo mùa, tự lập danh sách đi chợ', href: '#/f/' + fid + '/menu' }));
      tiles.push(tile({ icon: 'cart', title: 'Đi chợ', sub: need ? 'Cần mua ' + need + ' món' : 'Danh sách trống', href: '#/f/' + fid + '/shop', badge: need ? String(need) : null }));
    }
    tiles.push(tile({ icon: 'heart', title: 'Sức khỏe', sub: kid ? 'Sổ sức khỏe của bạn' : 'Tăng trưởng, tiêm chủng, thuốc, huyết áp', href: '#/f/' + fid + '/health' }));
    tiles.push(tile({ icon: 'wallet', title: 'Tiền gia đình', sub: kid ? 'Tiêu vặt của bạn' : 'Chi tiêu chung, học phí, tiêu vặt của con', href: '#/f/' + fid + '/money' }));
    if (!kid) tiles.push(tile({ icon: 'image', title: 'Thông báo của trường', sub: 'Dán hoặc chụp thông báo, lấy ra lịch họp, tiền cần đóng', href: '#/f/' + fid + '/school' }));
    nodes.push(h('div', { class: 'tiles' }, tiles));
    F9.mount(nodes);
  }

  // ---------- Việc chung / Đi chợ ----------
  F9.tasks = function (fid) { listsScreen(fid); };
  F9.shop = function (fid) { return F9.shopMain(fid); };

  function listsScreen(fid) {
    F9.frame({ title: 'Việc chung', back: '#/f/' + fid + '/more', tabs: { fid: fid, tab: 'more' } });
    F9.skeleton('list');
    F9.live({
      fetch: function () { return F9.loadView(fid, 'lists', function () { return F9.get(F9.fam(fid, '/lists')); }); },
      render: function (x) { render(fid, x); },
      retick: false, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { listsScreen(fid); }); });
  }

  function addRow(placeholder, key, label, onadd, opts) {
    opts = opts || {};
    var input = F9.text({ maxlength: 100, placeholder: placeholder, 'data-k': 'add-' + key, 'aria-label': label, enterkeyhint: 'done' });
    input.value = drafts[key];
    input.addEventListener('input', function () { drafts[key] = input.value; });
    var btn = F9.btn('Thêm', 'primary', function () { return go(); });
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      return F9.busy(btn, function () { return onadd(v).then(function () { drafts[key] = ''; input.value = ''; F9.dropGate(); return F9.refresh(true); }); });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    var kids = [h('div', { class: 'col' }, [input])];
    kids.push(btn);
    return h('div', { class: 'addbar' }, kids);
  }

  function render(fid, x) {
    var core = x.core; var d = x.d; var today = d.today;
    F9.setFam(core.family.name);
    F9.setFab(null);
    var ctx = { fid: fid, core: core, today: today };
    var nodes = core.me.role === 'con' ? [] : [F9.seg([['tasks', 'Việc cần làm'], ['shop', 'Mua sắm']], 'tasks', function (m) { F9.go('#/f/' + fid + '/' + (m === 'shop' ? 'shop' : 'tasks')); }, 'Danh sách')];
    {
      if (core.me.role !== 'con') nodes.push(h('div', { class: 'card' }, [addRow('Việc cần làm, ví dụ: Đóng tiền điện', 'task', 'Việc mới', function (v) { return F9.post(F9.fam(fid, '/tasks'), { title: v }, { idem: 'mktask' + F9.rid().slice(0, 4) }); })]));
      var open = d.tasks.filter(function (t) { return !t.done; }); var dn = d.tasks.filter(function (t) { return t.done; });
      if (!open.length && !dn.length) nodes.push(F9.empty('Chưa có việc nào', 'Thêm việc chung của cả nhà: đóng tiền điện, đi họp phụ huynh, mua quà sinh nhật...', null, 'list'));
      if (open.length) nodes.push(h('div', { class: 'list' }, open.map(function (t) { return taskLine(t, ctx); })));
      if (dn.length) { nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Đã xong gần đây' })])); nodes.push(h('div', { class: 'list' }, dn.map(function (t) { return taskLine(t, ctx); }))); }
    }
    F9.mount(nodes);
  }

  function taskLine(t, ctx) {
    var due = t.due ? (t.due < ctx.today && !t.done ? 'Quá hạn ' + F9.dm(t.due) : t.due === ctx.today ? 'Hạn hôm nay' : 'Hạn ' + F9.dm(t.due)) : '';
    var who = t.assigneeId ? (F9.memberOf(ctx.core, t.assigneeId) || {}).name : '';
    var meta = [who ? 'Giao cho ' + who : '', due, t.done && t.doneBy ? t.doneBy + ' đã xong' : ''].filter(Boolean).join(' · ');
    return h('div', { class: 'ev split task-row' }, [
      h('div', { class: 'ev-open task-open' }, [
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': (t.done ? 'Bỏ đánh dấu xong: ' : 'Đánh dấu đã xong: ') + t.title, 'aria-pressed': t.done ? 'true' : 'false', onclick: function (e) {
          F9.busy(e.currentTarget, function () {
            return F9.post(F9.fam(ctx.fid, '/tasks/' + t.id + '/done'), { done: !t.done }).then(function () {
              F9.dropGate();
              F9.toast(t.done ? 'Đã bỏ dấu xong' : 'Đã xong: ' + t.title, '', { undo: function () { return F9.post(F9.fam(ctx.fid, '/tasks/' + t.id + '/done'), { done: t.done }).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
              return F9.refresh(true);
            });
          });
        } }, [h('span', { class: 'step-no' }, [t.done ? F9.ico('check', 16, 3) : null])]),
        h('button', { class: 'ev-main task-edit', type: 'button', 'aria-label': 'Sửa việc: ' + t.title, onclick: function () { if (ctx.core.me.role !== 'con') taskSheet(t, ctx); } }, [
          h('div', { class: 'ev-t' + (t.done ? ' done-s' : ''), text: t.title }), meta ? h('div', { class: 'ev-sub' + (due.indexOf('Quá') === 0 ? ' warn-t' : ''), text: meta }) : null,
        ]),
      ]),
      h('div', { class: 'ev-x' }),
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
        F9.del(F9.fam(ctx.fid, '/tasks/' + t.id)).then(function () {
          close(); F9.dropGate();
          F9.toast('Đã xóa', '', { undo: function () { return F9.post(F9.fam(ctx.fid, '/tasks'), { title: t.title, assigneeId: t.assigneeId || null, due: t.due || null }).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
          F9.refresh(true);
        }, F9.fail);
      }));
    });
  }

  // ---------- thêm nhanh từ nút "+" ----------
  F9.quickTask = function (ctx) {
    F9.sheet('Thêm việc cần làm', function (body, close) {
      var title = F9.text({ placeholder: 'Ví dụ: Đóng tiền điện', maxlength: 100 });
      var who = F9.select([['', 'Chưa giao ai']].concat(ctx.core.members.filter(function (m) { return !m.external && !m.pending; }).map(function (m) { return [m.id, m.name]; })), '');
      var due = h('input', { type: 'date', 'aria-label': 'Hạn' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = F9.btn('Lưu việc', 'primary block', function () {
        if (!title.value.trim()) { title.focus(); return; }
        return F9.busy(save, function () {
          return F9.post(F9.fam(ctx.fid, '/tasks'), { title: title.value, assigneeId: who.value || null, due: due.value || null }, { idem: 'mktask' + F9.rid().slice(0, 4) }).then(function () { close(); F9.toast('Đã thêm việc'); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(F9.field('Việc cần làm', title)); body.appendChild(F9.field('Giao cho', who)); body.appendChild(F9.field('Hạn (không bắt buộc)', due)); body.appendChild(err); body.appendChild(save);
    });
  };
  F9.quickShop = function (ctx) {
    F9.sheet('Thêm món đi chợ', function (body, close) {
      var text = F9.text({ placeholder: 'Ví dụ: Sữa tươi, trứng, bánh mì', maxlength: 300 });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = F9.btn('Thêm vào danh sách', 'primary block', function () {
        if (!text.value.trim()) { text.focus(); return; }
        return F9.busy(save, function () {
          return F9.post(F9.fam(ctx.fid, '/shopping'), { text: text.value }, { idem: 'mkshop' + F9.rid().slice(0, 4) }).then(function () { close(); F9.toast('Đã thêm vào danh sách đi chợ'); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(F9.field('Món cần mua', text, 'Gõ nhiều món cách nhau bằng dấu phẩy.')); body.appendChild(err); body.appendChild(save);
    });
  };
})();
