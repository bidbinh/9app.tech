/* 9family: Thực đơn tuần. Xem theo ngày/cả tuần, đổi món từng ô, khóa, chốt, công thức, hồ sơ ăn uống, tạo danh sách đi chợ. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var view = { mode: 'day', day: null, week: null };
  var COST = ['', 'Giá rẻ', 'Giá vừa', 'Giá cao'];
  var SC = {
    doi_chieu_so_lieu: ['Đã đối chiếu số liệu', 'ok'], cong_thuc_cung_mon: ['Có công thức cùng món', 'info'],
    cong_thuc_tuong_tu: ['Ước lượng theo món tương tự', 'warn'], tham_khao_chung: ['Chỉ tham khảo chung', 'warn'],
  };
  var MEAL = { sang: 'Bữa sáng', trua: 'Bữa trưa', toi: 'Bữa tối' };
  var MEALS = ['sang', 'trua', 'toi'];
  var WD = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  var DISCLAIMER = 'Gợi ý tham khảo từ kho món ăn miền Bắc, không phải tư vấn y tế hay dinh dưỡng. Nhà có người bệnh (tiểu đường, huyết áp, thận...) hoặc bé dưới 12 tháng: hãy hỏi bác sĩ.';
  var num = function (n) { return String(n).replace('.', ','); };
  function menuUrl(fid, p) { return F9.fam(fid, '/menu' + (p || '')); }
  function scChip(k) { var s = SC[k] || SC.tham_khao_chung; return F9.chip(s[0], s[1]); }
  function monday(day) { return F9.addDays(day, 1 - F9.weekday(day)); }

  // ---------- màn tuần ----------
  F9.menu = function (fid, start) {
    var ws = start || '';
    F9.frame({ title: 'Thực đơn tuần', back: '#/f/' + fid + '/more', tabs: { fid: fid, tab: 'more' }, right: [
      F9.link('#/f/' + fid + '/menu/profile', { class: 'icon-btn', 'aria-label': 'Hồ sơ ăn uống của gia đình' }, [F9.ico('users', 24)]),
    ] });
    F9.skeleton('list');
    F9.live({
      fetch: function () {
        return F9.loadView(fid, 'menu' + ws, function () { return F9.get(menuUrl(fid, '/week' + (ws ? '?start=' + ws : ''))); });
      },
      render: function (x) { renderWeek(fid, x); },
      retick: false, every: 12000,
    }).catch(function (e) { F9.loadError(e, function () { F9.menu(fid, start); }); });
  };

  function weekLabel(d) {
    var e = F9.addDays(d.weekStart, 6);
    return F9.dm(d.weekStart) + ' – ' + F9.dm(e) + (d.weekStart === d.thisWeek ? ' · Tuần này' : '');
  }

  function renderWeek(fid, x) {
    var core = x.core; var d = x.d; var plan = d.plan;
    F9.setFam(core.family.name); F9.setFab(null);
    if (view.week !== d.weekStart) { view.week = d.weekStart; view.day = d.weekStart === d.thisWeek ? F9.weekday(d.today) : 1; }
    var ctx = { fid: fid, core: core, d: d, plan: plan };
    var nodes = [];
    nodes.push(h('div', { class: 'wk-nav' }, [
      F9.link('#/f/' + fid + '/menu/' + F9.addDays(d.weekStart, -7), { class: 'icon-btn', 'aria-label': 'Tuần trước' }, [h('span', { class: 'flipx' }, [F9.ico('chev', 24)])]),
      h('div', { class: 'wk-ttl' }, [h('div', { class: 'b', text: weekLabel(d) }), h('div', { class: 'muted small', text: 'Mùa ' + d.season + ' · tháng ' + d.month })]),
      F9.link('#/f/' + fid + '/menu/' + F9.addDays(d.weekStart, 7), { class: 'icon-btn', 'aria-label': 'Tuần sau' }, [F9.ico('chev', 24)]),
    ]));
    var chips = [];
    if (plan) chips.push(plan.status === 'chot' ? F9.chip('Đã chốt', 'ok') : F9.chip('Bản nháp', 'info'));
    if (d.people) chips.push(F9.chip(d.people.count + ' người · ' + num(d.people.servings) + ' suất'));
    if (chips.length) nodes.push(h('div', { class: 'chip-row' }, chips));

    if (!plan) {
      F9.setCta(null);
      var gen = d.canManage ? busyBtn('Lập thực đơn tuần này', 'primary block', function () { return generate(ctx, {}); }) : null;
      nodes.push(F9.empty('Chưa có thực đơn tuần này', d.canManage ? (d.hasProfile ? 'Gợi ý món theo mùa, theo người trong nhà, rồi tự gom nguyên liệu đi chợ.' : 'Trước tiên hãy cho 9family biết nhà mình có mấy người, ai kiêng gì. Mất khoảng một phút.') : 'Nhờ chủ gia đình hoặc người quản lý lập thực đơn.', h('div', { class: 'btn-row center col-btns' }, [
        d.canManage && !d.hasProfile ? F9.link('#/f/' + fid + '/menu/profile', { class: 'btn primary' }, ['Thiết lập hồ sơ ăn uống']) : null,
        gen && d.hasProfile ? gen : null,
        gen && !d.hasProfile ? busyBtn('Lập luôn với thiết lập mặc định', 'ghost', function () { return generate(ctx, {}); }) : null,
      ].filter(Boolean)), 'utensils'));
      nodes.push(h('p', { class: 'muted small', text: DISCLAIMER }));
      F9.mount(nodes);
      return;
    }

    if (plan.profileStale && d.canManage) {
      nodes.push(F9.notice('warn', 'Hồ sơ ăn uống đã đổi', 'Thực đơn này lập theo hồ sơ cũ. Lập lại để áp dụng (món đã khóa được giữ).', h('div', { class: 'btn-row' }, [busyBtn('Lập lại tuần này', 'ghost sm', function () { return generate(ctx, { force: plan.status === 'chot' }); })])));
    }
    if (plan.warnings && plan.warnings.length) {
      var det = h('div', { class: 'hidden warn-list' }, plan.warnings.map(function (w) { return h('div', { class: 'small', text: w }); }));
      var tgl = h('button', { type: 'button', class: 'linkbtn', 'aria-expanded': 'false', text: 'Xem chi tiết', onclick: function () { det.classList.toggle('hidden'); tgl.setAttribute('aria-expanded', det.classList.contains('hidden') ? 'false' : 'true'); tgl.textContent = det.classList.contains('hidden') ? 'Xem chi tiết' : 'Ẩn chi tiết'; } });
      nodes.push(F9.notice('warn', 'Có ' + plan.warnings.length + ' chỗ phải nới quy tắc', 'Không đủ món hợp với hồ sơ nên phải dùng món ngoài mùa, lặp món hoặc bỏ một số ưu tiên.', h('div', {}, [tgl, det])));
    }
    nodes.push(F9.seg([['day', 'Theo ngày'], ['week', 'Cả tuần']], view.mode, function (m) { view.mode = m; F9.rerender(); }, 'Kiểu xem'));
    if (view.mode === 'week') nodes.push(weekGrid(ctx)); else {
      nodes.push(dayStrip(ctx));
      var day = plan.days[view.day - 1];
      var date = F9.addDays(d.weekStart, view.day - 1);
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: F9.dayLabel ? F9.dayLabel(date, d.today) : F9.dm(date) })]));
      MEALS.forEach(function (mk) { if (day.meals[mk]) nodes.push(mealCard(ctx, day, day.meals[mk])); });
    }
    nodes.push(h('p', { class: 'muted small disc', text: DISCLAIMER }));
    if (d.canManage) nodes.push(h('div', { class: 'btn-row' }, [F9.btn('Tùy chọn tuần này', 'ghost', function () { weekOptions(ctx); })]));
    F9.mount(nodes);
    if (d.canEdit) {
      var stale = plan.shopStale;
      var cta = F9.btn(stale ? 'Cập nhật danh sách đi chợ' : plan.shopSynced ? 'Xem lại danh sách đi chợ' : 'Tạo danh sách đi chợ', 'primary block', function () { shopSheet(ctx); });
      F9.setCta(h('div', { class: 'cta-in' }, [stale ? h('div', { class: 'small warn-t', text: 'Thực đơn đã đổi sau khi tạo danh sách đi chợ' }) : null, cta]));
    } else F9.setCta(null);
  }

  function dayStrip(ctx) {
    var d = ctx.d;
    return h('div', { class: 'daystrip', role: 'tablist', 'aria-label': 'Chọn ngày' }, ctx.plan.days.map(function (day) {
      var date = F9.addDays(d.weekStart, day.day - 1);
      var on = view.day === day.day;
      return h('button', { type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false', class: 'dsd' + (on ? ' on' : '') + (date === d.today ? ' today' : ''), 'aria-label': WD[day.day] + ' ngày ' + F9.dm(date) + (date === d.today ? ', hôm nay' : ''),
        onclick: function () { view.day = day.day; F9.rerender(); } }, [h('span', { class: 'dsd-w', text: WD[day.day] }), h('span', { class: 'dsd-n', text: String(+date.slice(8)) })]);
    }));
  }

  function weekGrid(ctx) {
    var d = ctx.d;
    return h('div', { class: 'list' }, ctx.plan.days.map(function (day) {
      var date = F9.addDays(d.weekStart, day.day - 1);
      var lines = MEALS.filter(function (mk) { return day.meals[mk]; }).map(function (mk) {
        var m = day.meals[mk];
        return h('div', { class: 'wk-line' }, [h('b', { text: MEAL[mk].replace('Bữa ', '') + ': ' }), m.items.map(function (i) { return i.name; }).join(', ')]);
      });
      return h('button', { type: 'button', class: 'ev wk-row' + (date === d.today ? ' now-day' : ''), 'aria-label': WD[day.day] + ' ' + F9.dm(date) + ', mở chi tiết', onclick: function () { view.mode = 'day'; view.day = day.day; F9.rerender(); window.scrollTo(0, 0); } }, [
        h('div', { class: 'ev-time' }, [WD[day.day], h('small', { text: F9.dm(date) })]),
        h('div', { class: 'ev-main' }, lines), h('div', { class: 'ev-x' }, [F9.ico('chev', 18)]),
      ]);
    }));
  }

  function mealCard(ctx, day, meal) {
    var rows = meal.items.map(function (it) {
      var chips = [];
      if (it.locked) chips.push(F9.chip('Đã khóa', 'brand'));
      if (it.relaxed) chips.push(F9.chip('Đã nới quy tắc', 'warn'));
      if (it.time) chips.push(F9.chip(it.time + ' phút'));
      if (it.cost) chips.push(F9.chip(COST[it.cost]));
      return h('button', { type: 'button', class: 'dish-row', 'aria-label': it.slotLabel + ': ' + it.name + '. Mở chi tiết và đổi món', onclick: function () { cellSheet(ctx, day, meal, it); } }, [
        h('div', { class: 'dish-slot', text: it.slotLabel }),
        h('div', { class: 'dish-name', text: it.name }),
        chips.length ? h('div', { class: 'chip-row sm' }, chips) : null,
        h('span', { class: 'dish-chev' }, [F9.ico('chev', 18)]),
      ]);
    });
    (meal.baby || []).forEach(function (b) {
      rows.push(h('button', { type: 'button', class: 'dish-row baby', onclick: function () { dishSheet(ctx.fid, b.dishId, ctx.d.weekStart); } }, [
        h('div', { class: 'dish-slot', text: 'Cháo, bột cho bé ' + b.ageMonths + ' tháng' }), h('div', { class: 'dish-name', text: b.name }),
        h('div', { class: 'muted small', text: 'Tham khảo, hãy hỏi bác sĩ về ăn dặm.' }), h('span', { class: 'dish-chev' }, [F9.ico('chev', 18)]),
      ]));
    });
    (meal.notes || []).forEach(function (n) { rows.push(h('div', { class: 'small warn-t pad', text: n })); });
    return h('div', { class: 'card tight meal' }, [h('h2', { class: 'meal-t', text: meal.label }), h('div', {}, rows)]);
  }

  // ---------- ô món: lý do, công thức, đổi, khóa, ẩn ----------
  function cellSheet(ctx, day, meal, it) {
    var fid = ctx.fid; var d = ctx.d; var plan = ctx.plan;
    var cell = { start: d.weekStart, day: day.day, meal: meal.meal, slot: it.slot };
    F9.sheet(it.slotLabel + ' · ' + meal.label, function (body, close) {
      body.appendChild(h('div', { class: 'dish-name big', text: it.name }));
      var chips = [scChip(it.sourceCheck)];
      if (it.locked) chips.push(F9.chip('Đã khóa', 'brand'));
      if (it.relaxed) chips.push(F9.chip('Đã nới quy tắc', 'warn'));
      body.appendChild(h('div', { class: 'chip-row' }, chips));
      body.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Vì sao chọn món này' })]));
      body.appendChild(h('ul', { class: 'plain why' }, it.why.map(function (w) { return h('li', { text: w }); })));
      body.appendChild(F9.btn('Xem công thức, nguyên liệu, các bước', 'ghost block', function () { close(); setTimeout(function () { dishSheet(fid, it.dishId, d.weekStart); }, 180); }));
      if (!d.canEdit) { body.appendChild(h('p', { class: 'muted small', text: 'Tài khoản này chỉ xem thực đơn.' })); return; }
      var box = h('div', { class: 'alts' });
      var swapBtn = F9.btn('Đổi món (gợi ý 3-5 món)', 'primary block', function () { return loadAlts(); });
      var lockBtn = F9.btn(it.locked ? 'Mở khóa món này' : 'Khóa món này (giữ khi lập lại tuần)', 'ghost block', function () {
        return F9.busy(lockBtn, function () {
          return F9.post(menuUrl(fid, '/week/lock'), Object.assign({ locked: !it.locked }, cell)).then(function () { close(); F9.dropGate(); return F9.refresh(true); });
        });
      });
      body.appendChild(swapBtn); body.appendChild(box);
      body.appendChild(F9.btn('Chọn món khác (tìm theo tên)', 'ghost block', function () { close(); setTimeout(function () { searchSheet(ctx, cell, it); }, 180); }));
      body.appendChild(lockBtn);
      body.appendChild(F9.btn('Không thích món này (ẩn khỏi gợi ý của nhà)', 'ghost block danger-t', function () {
        F9.confirm({ title: 'Ẩn món này?', text: '"' + it.name + '" sẽ không được gợi ý cho gia đình nữa và được đổi sang món khác. Bỏ ẩn được trong Hồ sơ ăn uống.', ok: 'Ẩn và đổi món' }).then(function (yes) {
          if (!yes) return;
          F9.post(menuUrl(fid, '/week/swap'), Object.assign({ hideCurrent: true }, cell), { idem: 'hide' + it.dishId }).then(function () { close(); F9.dropGate(); F9.toast('Đã ẩn "' + it.name + '" và đổi món', '', { undo: function () { return undoHide(fid, it.dishId, cell, it); } }); return F9.refresh(true); }, F9.fail);
        });
      }));
      if (it.locked) { swapBtn.disabled = true; box.appendChild(h('div', { class: 'hint', text: 'Món đã khóa. Mở khóa để đổi.' })); }
      function loadAlts() {
        return F9.busy(swapBtn, function () {
          return F9.get(menuUrl(fid, '/week/alternatives?start=' + d.weekStart + '&day=' + cell.day + '&meal=' + cell.meal + '&slot=' + cell.slot)).then(function (r) {
            F9.clear(box);
            if (!r.alternatives.length) { box.appendChild(h('div', { class: 'hint', text: 'Không còn món phù hợp để gợi ý. Thử tìm theo tên.' })); return; }
            box.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Chọn một món thay thế' })]));
            r.alternatives.forEach(function (a) {
              box.appendChild(h('button', { type: 'button', class: 'alt-row', onclick: function () { doSwap(a.dishId, a.name); } }, [
                h('div', { class: 'b', text: a.name }), h('div', { class: 'muted small', text: (a.why || []).slice(1, 3).join(' · ') || 'Hợp với hồ sơ ăn uống' }),
                h('div', { class: 'chip-row sm' }, [scChip(a.sourceCheck), a.time ? F9.chip(a.time + ' phút') : null].filter(Boolean)),
              ]));
            });
          });
        });
      }
      function doSwap(dishId, name) {
        F9.post(menuUrl(fid, '/week/swap'), Object.assign({ dishId: dishId }, cell), { idem: 'swap' + cell.day + cell.meal + cell.slot + dishId }).then(function () {
          close(); F9.dropGate();
          F9.toast('Đã đổi sang "' + name + '"', '', { undo: function () { return F9.post(menuUrl(fid, '/week/swap'), Object.assign({ dishId: it.dishId }, cell)).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
          return F9.refresh(true);
        }, F9.fail);
      }
    });
  }
  function undoHide(fid, dishId, cell, it) {
    return F9.post(menuUrl(fid, '/hide'), { dishId: dishId, hidden: false }).then(function () {
      return F9.post(menuUrl(fid, '/week/swap'), Object.assign({ dishId: dishId }, cell));
    }).then(function () { F9.dropGate(); return F9.refresh(true); }, function (e) { F9.fail(e); });
  }

  function searchSheet(ctx, cell, it) {
    var fid = ctx.fid;
    var role = it.slot === 'canh' ? 'canh' : it.slot.indexOf('man') === 0 ? 'man' : it.slot === 'rau' ? 'rau' : it.slot === 'mon_nuoc' ? 'mon_nuoc' : it.slot === 'dessert' ? 'dessert' : 'sang';
    F9.sheet('Chọn món khác', function (body, close) {
      var q = F9.text({ placeholder: 'Gõ tên món, ví dụ: bầu, cá, bún', maxlength: 40, type: 'search', 'aria-label': 'Tìm món' });
      var list = h('div', { class: 'alts' });
      var timer = null;
      function load() {
        F9.get(menuUrl(fid, '/dishes?role=' + role + '&q=' + encodeURIComponent(q.value.trim()))).then(function (r) {
          F9.clear(list);
          if (!r.items.length) list.appendChild(h('div', { class: 'hint', text: 'Không thấy món nào hợp với hồ sơ ăn uống.' }));
          r.items.forEach(function (a) {
            list.appendChild(h('button', { type: 'button', class: 'alt-row', onclick: function () {
              F9.post(menuUrl(fid, '/week/swap'), Object.assign({ dishId: a.dishId }, cell)).then(function () { close(); F9.dropGate(); F9.toast('Đã chọn "' + a.name + '"'); return F9.refresh(true); }, F9.fail);
            } }, [h('div', { class: 'b', text: a.name }), h('div', { class: 'chip-row sm' }, [scChip(a.sourceCheck), a.time ? F9.chip(a.time + ' phút') : null].filter(Boolean))]));
          });
        }, F9.fail);
      }
      q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(load, 250); });
      body.appendChild(F9.field('Tên món', q, 'Chỉ hiện món hợp với kiêng kỵ và độ tuổi trong nhà.')); body.appendChild(list);
      load();
    });
  }

  // ---------- công thức ----------
  function dishSheet(fid, id, ws) {
    F9.sheet('Công thức', function (body) {
      body.appendChild(h('div', { class: 'skel line' }));
      F9.get(menuUrl(fid, '/dishes/' + encodeURIComponent(id))).then(function (r) {
        F9.clear(body);
        var d = r.dish;
        body.appendChild(h('div', { class: 'dish-name big', text: d.name }));
        var chips = [scChip(d.sourceCheck.key)];
        if (d.timeMinutes) chips.push(F9.chip(d.timeMinutes + ' phút'));
        if (d.costLevel) chips.push(F9.chip(COST[d.costLevel]));
        if (d.babyDish) chips.push(F9.chip('Ăn dặm', 'info'));
        body.appendChild(h('div', { class: 'chip-row' }, chips));
        body.appendChild(h('p', { class: 'small', text: d.sourceCheck.text }));
        if (d.conflicts && (d.conflicts.avoid.length || d.conflicts.tooYoung)) body.appendChild(F9.notice('warn', 'Lưu ý với hồ sơ của nhà', (d.conflicts.avoid.length ? 'Có ' + d.conflicts.avoid.join(', ').toLowerCase() + '. ' : '') + (d.conflicts.tooYoung ? 'Chưa hợp với độ tuổi nhỏ nhất trong nhà.' : '')));
        if (d.babyDish) body.appendChild(F9.notice('info', 'Món ăn dặm chỉ để tham khảo', 'Hãy hỏi bác sĩ về thời điểm và cách cho bé ăn dặm.'));
        body.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Nguyên liệu cho ' + num(d.servings) + ' suất' })]));
        body.appendChild(h('div', { class: 'card tight' }, d.ingredients.map(function (i) {
          return h('div', { class: 'list-row ing-row' }, [h('div', { class: 'col' }, [h('div', { text: i.name + (i.optional ? ' (tùy chọn)' : '') })]), h('div', { class: 'b', text: i.display })]);
        })));
        body.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Các bước' })]));
        body.appendChild(h('ol', { class: 'steps' }, d.steps.map(function (s) { return h('li', { text: s }); })));
        if (d.notes) body.appendChild(h('p', { class: 'small', text: d.notes }));
        if (d.seasonNote) body.appendChild(h('p', { class: 'muted small', text: 'Mùa: ' + d.seasonNote }));
        if (d.sources.length) {
          body.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Nguồn tham khảo' })]));
          body.appendChild(h('ul', { class: 'plain small' }, d.sources.slice(0, 4).map(function (s) { return h('li', {}, [s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.name }) : s.name]); })));
        }
        body.appendChild(h('p', { class: 'muted small', text: r.disclaimer }));
      }, function (e) { F9.clear(body); body.appendChild(F9.notice('bad', 'Chưa tải được công thức', e.message)); });
    });
  }
  F9.dishSheet = dishSheet;

  // ---------- lập, tùy chọn tuần ----------
  function generate(ctx, o) {
    var fid = ctx.fid;
    function go(force) {
      return F9.post(menuUrl(fid, '/week/generate'), { start: ctx.d.weekStart, force: force || undefined, keepLocks: o.keepLocks }, { idem: 'gen' + ctx.d.weekStart + (o.keepLocks === false ? 'k' : '') + F9.rid().slice(0, 3) }).then(function (r) {
        F9.dropGate(); view.mode = 'day'; F9.toast('Đã lập thực đơn tuần ' + F9.dm(ctx.d.weekStart)); return F9.refresh(true);
      }, function (e) {
        if (e.status === 409 && e.code === 'finalized') return F9.confirm({ title: 'Thực đơn đã chốt', text: 'Tuần này đã chốt. Lập lại sẽ thay các món chưa khóa. Tiếp tục?', ok: 'Lập lại' }).then(function (yes) { if (yes) return go(true); });
        throw e;
      });
    }
    return go(!!o.force).catch(F9.fail);
  }
  // nút tự khóa trong lúc chạy
  function busyBtn(text, cls, fn) { var b = F9.btn(text, cls, function () { return F9.busy(b, fn); }); return b; }

  function weekOptions(ctx) {
    var fid = ctx.fid; var d = ctx.d;
    F9.sheet('Tùy chọn tuần ' + F9.dm(d.weekStart), function (body, close) {
      var opt = function (title, sub, fn, danger) {
        return h('button', { type: 'button', class: 'pick', onclick: function () { close(); setTimeout(fn, 200); } }, [h('div', { class: 'col' }, [h('div', { class: 'b' + (danger ? ' warn-t' : ''), text: title }), h('div', { class: 'muted small', text: sub })]), F9.ico('chev', 18)]);
      };
      var nextWeek = F9.addDays(d.weekStart, 7);
      body.appendChild(h('div', { class: 'pick-list' }, [
        opt('Lập lại cả tuần', 'Giữ nguyên các món đã khóa, đổi các món còn lại', function () { generate(ctx, { force: false }); }),
        opt('Lập lại, bỏ cả món đã khóa', 'Làm mới hoàn toàn', function () { generate(ctx, { keepLocks: false, force: false }); }),
        opt('Lập tuần kế tiếp', 'Không lặp món của hai tuần trước, bắt đầu ' + F9.dm(nextWeek), function () { F9.go('#/f/' + fid + '/menu/' + nextWeek); }),
        opt(ctx.plan.status === 'chot' ? 'Mở chốt thực đơn' : 'Chốt thực đơn tuần này', ctx.plan.status === 'chot' ? 'Cho phép đổi món lại' : 'Đánh dấu cả nhà đã thống nhất', function () {
          F9.post(menuUrl(fid, '/week/status'), { start: d.weekStart, status: ctx.plan.status === 'chot' ? 'nhap' : 'chot' }).then(function () { F9.dropGate(); F9.toast(ctx.plan.status === 'chot' ? 'Đã mở chốt' : 'Đã chốt thực đơn'); return F9.refresh(true); }, F9.fail);
        }),
        opt('Xóa thực đơn tuần này', 'Danh sách đi chợ đã tạo vẫn được giữ', function () {
          F9.confirm({ title: 'Xóa thực đơn?', text: 'Thực đơn tuần ' + F9.dm(d.weekStart) + ' sẽ bị xóa. Danh sách đi chợ đã tạo không bị mất.', ok: 'Xóa', danger: true }).then(function (yes) {
            if (yes) F9.del(menuUrl(fid, '/week?start=' + d.weekStart)).then(function () { F9.dropGate(); return F9.refresh(true); }, F9.fail);
          });
        }, true),
      ]));
    });
  }

  // ---------- thực đơn -> danh sách đi chợ ----------
  var AISLE_NAME = { rau_cu: 'Rau củ', thit_ca: 'Thịt, cá', hai_san: 'Hải sản', trung_dau_phu: 'Trứng, đậu phụ', do_kho_gao_bun: 'Gạo, bún, đồ khô', gia_vi: 'Gia vị', trai_cay: 'Trái cây', sua_banh: 'Sữa, bánh', do_uong: 'Đồ uống', khac: 'Khác' };
  function shopSheet(ctx) {
    var fid = ctx.fid; var ws = ctx.d.weekStart;
    F9.sheet('Danh sách đi chợ từ thực đơn', function (body, close) {
      body.appendChild(h('div', { class: 'skel line' }));
      F9.post(menuUrl(fid, '/week/shopping'), { start: ws, preview: true }).then(function (r) {
        F9.clear(body);
        var have = {}; var buy = {};
        var remembered = r.pantryHave && r.pantryHave.length ? r.pantryHave : null;
        r.pantryCheck.forEach(function (p) { buy[p.ingredientId] = remembered ? remembered.indexOf(p.ingredientId) < 0 : false; });
        body.appendChild(h('p', { class: 'small', text: 'Cộng dồn nguyên liệu của ' + ctx.plan.days.length + ' ngày cho ' + num(r.servings) + ' suất. Món nào nhà đã có thì tích "Nhà đã có", món sẽ nằm ở mục riêng và không tính là cần mua.' }));
        if (ctx.plan.shopSynced) body.appendChild(F9.notice('info', 'Đã tạo trước đó', 'Bấm lại sẽ cập nhật theo thực đơn mới. Mục đã mua và mục bạn tự thêm được giữ nguyên.'));
        var groups = {};
        r.lines.forEach(function (l) { (groups[l.aisle] = groups[l.aisle] || []).push(l); });
        Object.keys(AISLE_NAME).forEach(function (a) {
          if (!groups[a]) return;
          body.appendChild(h('div', { class: 'sec' }, [h('span', { text: AISLE_NAME[a] + ' (' + groups[a].length + ')' })]));
          body.appendChild(h('div', { class: 'card tight' }, groups[a].map(function (l) {
            var cb = h('input', { type: 'checkbox', class: 'cb', 'aria-label': 'Nhà đã có ' + l.name });
            cb.addEventListener('change', function () { have[l.ingredientId] = cb.checked; });
            return h('label', { class: 'list-row pick-line' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: l.name + (l.optional ? ' (tùy chọn)' : '') }), h('div', { class: 'muted small', text: 'Cho: ' + l.fromDishes.slice(0, 2).map(function (f) { return f.name; }).join(', ') + (l.fromDishes.length > 2 ? ' +' + (l.fromDishes.length - 2) : '') })]), h('div', { class: 'b', text: l.display }), h('span', { class: 'cb-wrap' }, [cb, h('span', { class: 'cb-t', text: 'Đã có' })])]);
          })));
        });
        if (r.pantryCheck.length) {
          body.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Đồ thường có sẵn trong nhà' })]));
          body.appendChild(h('p', { class: 'muted small', text: 'Tích những thứ nhà ĐÃ HẾT, cần mua thêm. Không tích thì coi như nhà còn.' }));
          body.appendChild(h('div', { class: 'card tight' }, r.pantryCheck.map(function (p) {
            var cb = h('input', { type: 'checkbox', class: 'cb', 'aria-label': 'Cần mua ' + p.name }); cb.checked = !!buy[p.ingredientId];
            cb.addEventListener('change', function () { buy[p.ingredientId] = cb.checked; });
            return h('label', { class: 'list-row pick-line' }, [h('div', { class: 'col b', text: p.name }), h('span', { class: 'cb-wrap' }, [cb, h('span', { class: 'cb-t', text: 'Cần mua' })])]);
          })));
        }
        var err = h('div', { class: 'hint err hidden', role: 'alert' });
        var go = F9.btn(ctx.plan.shopSynced ? 'Cập nhật danh sách đi chợ' : 'Thêm ' + r.lines.length + ' mục vào danh sách đi chợ', 'primary block', function () {
          return F9.busy(go, function () {
            var haveIds = Object.keys(have).filter(function (k) { return have[k]; });
            var buyIds = Object.keys(buy).filter(function (k) { return buy[k]; });
            return F9.post(menuUrl(fid, '/week/shopping'), { start: ws, haveIds: haveIds, buyPantry: buyIds, rememberPantry: true }, { idem: 'shopgen' + ws + F9.rid().slice(0, 3) }).then(function (res) {
              close(); F9.dropGate();
              F9.toast('Đã thêm ' + res.added + ', cập nhật ' + res.updated + (res.removed ? ', bỏ ' + res.removed : '') + ' mục');
              F9.go('#/f/' + fid + '/shop');
            }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
          });
        });
        body.appendChild(err); body.appendChild(go);
      }, function (e) { F9.clear(body); body.appendChild(F9.notice('bad', 'Chưa tạo được danh sách', e.message)); });
    });
  }

  // ---------- hồ sơ ăn uống ----------
  F9.menuProfile = function (fid) {
    F9.frame({ title: 'Hồ sơ ăn uống', back: '#/f/' + fid + '/menu', tabs: { fid: fid, tab: 'more' } });
    F9.skeleton('form');
    var draft = null;
    F9.live({
      fetch: function () { return Promise.all([F9.get(F9.fam(fid)), F9.get(menuUrl(fid, '/profile'))]).then(function (a) { F9.syncClock(a[0].now); return { core: a[0], d: a[1] }; }); },
      render: function (x) { if (!draft) draft = JSON.parse(JSON.stringify(x.d.profile)); renderProfile(fid, x, draft); },
      retick: false, every: 30000,
    }).catch(function (e) { F9.loadError(e, function () { F9.menuProfile(fid); }); });
  };

  function stepper(label, value, min, max, set, disabled) {
    return h('div', { class: 'stepper', role: 'group', 'aria-label': label }, [
      F9.btn('−', 'ghost icon', function () { if (value > min) { set(value - 1); } }, { 'aria-label': 'Bớt', disabled: disabled || value <= min }),
      h('div', { class: 'step-v', 'aria-live': 'polite', text: String(value) }),
      F9.btn('+', 'ghost icon', function () { if (value < max) { set(value + 1); } }, { 'aria-label': 'Thêm', disabled: disabled || value >= max }),
    ]);
  }

  function renderProfile(fid, x, draft) {
    var d = x.d; var can = d.canEdit; var core = x.core;
    F9.setFam(core.family.name); F9.setFab(null);
    var nodes = [];
    var redraw = function () { F9.rerender(); };
    nodes.push(h('div', {}, [h('h1', { class: 'h1', text: 'Nhà mình ăn thế nào?' }), h('div', { class: 'sub', text: 'Món ăn miền Bắc, gợi ý theo mùa. Thông tin này chỉ dùng để chọn món và tính lượng đi chợ.' })]));
    if (!can) nodes.push(F9.notice('info', 'Chỉ xem', 'Chỉ chủ gia đình và người quản lý sửa được hồ sơ ăn uống.'));
    if (d.problem) nodes.push(F9.notice('warn', 'Chưa dùng được hồ sơ', d.problem));
    (d.warnings || []).forEach(function (w) { nodes.push(F9.notice('warn', 'Lưu ý', w)); });

    // người ăn
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Ai ăn cơm nhà' })]));
    var card = h('div', { class: 'card' }, []);
    card.appendChild(h('div', { class: 'prof-row' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: 'Người lớn' }), h('div', { class: 'muted small', text: 'Bố, mẹ, người lớn khác' })]), stepper('Số người lớn', draft.adults, 0, 8, function (v) { draft.adults = v; redraw(); }, !can)]));
    card.appendChild(h('div', { class: 'prof-row' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: 'Ông bà, người cao tuổi' }), h('div', { class: 'muted small', text: 'Ưu tiên món mềm, nêm nhạt' })]), stepper('Số ông bà', draft.elders, 0, 6, function (v) { draft.elders = v; redraw(); }, !can)]));
    nodes.push(card);

    // từng người: kiêng, dị ứng
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Kiêng, dị ứng theo từng người' })]));
    var list = h('div', { class: 'list' });
    var i;
    for (i = 1; i <= draft.adults; i++) list.appendChild(personRow(fid, d, draft, 'adult:' + i, draft.adults === 1 ? 'Người lớn' : 'Người lớn ' + i, 'adult', can, null));
    for (i = 1; i <= draft.elders; i++) list.appendChild(personRow(fid, d, draft, 'elder:' + i, draft.elders === 1 ? 'Ông bà' : 'Ông bà ' + i, 'elder', can, null));
    d.children.forEach(function (k0) {
      var k = Object.assign({}, k0, { color: (F9.kidOf(core, k0.id) || {}).color });
      var ex = draft.excludeChildren.indexOf(k.id) >= 0;
      list.appendChild(personRow(fid, d, draft, 'child:' + k.id, k.name, 'child', can, k, ex));
    });
    if (!list.firstChild) list.appendChild(h('div', { class: 'pad muted', text: 'Chưa có ai. Tăng số người lớn hoặc thêm hồ sơ con ở tab Gia đình.' }));
    nodes.push(list);
    nodes.push(h('p', { class: 'muted small', text: 'Món có thành phần mà bất kỳ ai trong nhà kiêng hoặc dị ứng sẽ không được gợi ý cho cả bữa. Nước mắm, hạt nêm, tương có thể chứa cá, gluten, đậu nành: ai dị ứng loại này cần tự kiểm tra gia vị.' }));

    // bữa
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Bữa cần lên thực đơn' })]));
    nodes.push(h('div', { class: 'card' }, [F9.chips([['sang', 'Sáng'], ['trua', 'Trưa'], ['toi', 'Tối']], draft.meals, function (v) { if (can) draft.meals = v; else redraw(); })]));
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Ngân sách' })]));
    nodes.push(h('div', { class: 'card' }, [F9.chips([['', 'Không giới hạn'], ['tiet_kiem', 'Tiết kiệm'], ['vua', 'Vừa phải'], ['thoai_mai', 'Thoải mái']], [draft.budget || ''], function (v) { if (can) draft.budget = v[0] || null; else redraw(); }, { single: true })]));
    var opts = h('div', { class: 'card tight' }, [
      F9.switchRow('Không ăn cay', 'Nhà có bé dưới 10 tuổi thì luôn tránh món cay', !!draft.noSpicy, function (on) { if (can) draft.noSpicy = on; }),
      F9.switchRow('Thêm món tráng miệng bữa tối', 'Chè, trái cây', !!draft.dessert, function (on) { if (can) draft.dessert = on; }),
    ]);
    nodes.push(opts);
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Ưu tiên chung cho cả nhà' })]));
    nodes.push(h('div', { class: 'card' }, [F9.chips(d.options.diet, draft.diet, function (v) { if (can) draft.diet = v; })]));

    // nhắc đi chợ
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Nhắc đi chợ' })]));
    var time = h('input', { type: 'time', value: draft.shopReminder.time, 'aria-label': 'Giờ nhắc', disabled: !can });
    time.addEventListener('change', function () { draft.shopReminder.time = time.value || '17:00'; });
    nodes.push(h('div', { class: 'card' }, [F9.switchRow('Nhắc khi còn món chưa mua', 'Mỗi ngày một lần, nếu danh sách còn món', !!draft.shopReminder.on, function (on) { if (can) draft.shopReminder.on = on; }), F9.field('Giờ nhắc', time)]));

    // món đã ẩn
    if (d.hidden.length) {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Món đã ẩn (' + d.hidden.length + ')' })]));
      nodes.push(h('div', { class: 'card tight' }, d.hidden.map(function (m) {
        return h('div', { class: 'list-row' }, [h('div', { class: 'col b', text: m.name }), can ? F9.btn('Bỏ ẩn', 'ghost xs', function (e) {
          return F9.post(menuUrl(fid, '/hide'), { dishId: m.id, hidden: false }).then(function () { F9.dropGate(); F9.toast('Đã bỏ ẩn "' + m.name + '"'); return F9.refresh(true); }, F9.fail);
        }) : null]);
      })));
    }
    nodes.push(h('p', { class: 'muted small', text: d.disclaimer }));

    if (can) {
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = F9.btn('Lưu hồ sơ ăn uống', 'primary block', function () {
        return F9.busy(save, function () {
          return F9.post(menuUrl(fid, '/profile'), draft, { idem: 'prof' + F9.rid().slice(0, 3) }).then(function () { F9.dropGate(); F9.toast('Đã lưu hồ sơ ăn uống'); F9.go('#/f/' + fid + '/menu'); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      F9.setCta(h('div', { class: 'cta-in' }, [err, save]));
    } else F9.setCta(null);
    F9.mount(nodes);
  }

  function summary(cfg, d) {
    var a = (cfg.avoid || []).map(function (k) { var o = d.options.avoid.filter(function (x) { return x[0] === k; })[0]; return o ? o[1].toLowerCase() : k; });
    return a.length ? 'Kiêng: ' + a.join(', ') : 'Không kiêng gì';
  }
  function personRow(fid, d, draft, key, label, kind, can, kid, excluded) {
    var cfg = draft.members[key] || {};
    var shown = cfg.label || label;
    var sub = excluded ? 'Không ăn ở nhà' : summary(cfg, d) + (cfg.diet && cfg.diet.length ? ' · ' + cfg.diet.length + ' ưu tiên' : '');
    var who = kid ? { name: kid.name, color: (kid.color || 'xanh') } : { name: shown };
    var core = null;
    return h('button', { type: 'button', class: 'ev person-row', 'aria-label': shown + '. ' + sub + '. Sửa', onclick: function () { personSheet(fid, d, draft, key, label, kind, can, kid); } }, [
      h('div', { class: 'ev-time' }, [F9.avatar(kid ? { name: kid.name, color: kidColor(fid, kid) } : { name: shown }, 'l')]),
      h('div', { class: 'ev-main' }, [h('div', { class: 'ev-t', text: shown }), h('div', { class: 'ev-sub', text: sub })]),
      h('div', { class: 'ev-x' }, [F9.ico('chev', 18)]),
    ]);
  }
  function kidColor(fid, kid) { return kid.color || 'xanh'; }

  function personSheet(fid, d, draft, key, label, kind, can, kid) {
    F9.sheet(label, function (body, close) {
      var cfg = JSON.parse(JSON.stringify(draft.members[key] || { label: '', avoid: [], diet: [] }));
      cfg.avoid = cfg.avoid || []; cfg.diet = cfg.diet || [];
      var nameIn = null;
      if (kind !== 'child') { nameIn = F9.text({ value: cfg.label || '', placeholder: label, maxlength: 24, disabled: !can }); body.appendChild(F9.field('Gọi là (không bắt buộc)', nameIn)); }
      body.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Kiêng hoặc dị ứng' })]));
      var av = F9.chips(d.options.avoid, cfg.avoid, function (v) { if (can) cfg.avoid = v; });
      body.appendChild(av);
      body.appendChild(h('div', { class: 'sec' }, [h('span', { text: 'Ưu tiên ăn uống' })]));
      body.appendChild(F9.chips(d.options.diet, cfg.diet, function (v) { if (can) cfg.diet = v; }));
      var bm = null; var ex = null;
      if (kid) {
        var year = new Date().getFullYear();
        if (!kid.birthYear || kid.birthYear >= year - 2) {
          var opts = [['', 'Chưa rõ']].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return [String(m), 'Tháng ' + m]; }));
          bm = F9.select(opts, cfg.birthMonth ? String(cfg.birthMonth) : '', { disabled: !can });
          body.appendChild(F9.field('Tháng sinh của bé', bm, 'Bé nhỏ cần tính đúng tháng tuổi (ăn dặm, món mềm). Chưa rõ thì tạm tính tuổi nhỏ nhất có thể.'));
        }
        ex = F9.switchRow('Bé ăn cơm ở nhà', 'Tắt nếu bé ăn ở trường, không tính vào thực đơn và lượng đi chợ', draft.excludeChildren.indexOf(kid.id) < 0, function (on) { if (!can) return; var i = draft.excludeChildren.indexOf(kid.id); if (on && i >= 0) draft.excludeChildren.splice(i, 1); if (!on && i < 0) draft.excludeChildren.push(kid.id); });
        body.appendChild(ex);
      }
      if (can) body.appendChild(F9.btn('Xong', 'primary block', function () {
        if (nameIn) cfg.label = nameIn.value.trim();
        if (bm) cfg.birthMonth = bm.value ? Number(bm.value) : undefined;
        if (!cfg.label && !cfg.avoid.length && !cfg.diet.length && !cfg.birthMonth) delete draft.members[key]; else draft.members[key] = cfg;
        close(); F9.rerender();
      })); else body.appendChild(h('p', { class: 'muted small', text: 'Chỉ chủ gia đình và người quản lý sửa được.' }));
    });
  }

  // ---------- dòng "Hôm nay ăn gì" trên màn Hôm nay ----------
  F9.menuTodayLine = function (fid, t) {
    if (!t || !t.plan) return null;
    var meals = t.plan.meals;
    if (!meals.length) return null;
    var now = F9.hhmm(F9.nowMs());
    // ưu tiên bữa sắp tới: trước 10:30 -> sáng/trưa, trước 16:00 -> trưa, còn lại -> tối
    var pref = now < '10:30' ? ['sang', 'trua', 'toi'] : now < '16:00' ? ['trua', 'toi', 'sang'] : ['toi', 'trua', 'sang'];
    var pick = null; pref.some(function (k) { pick = meals.filter(function (m) { return m.meal === k; })[0]; return !!pick; });
    if (!pick) return null;
    return F9.link('#/f/' + fid + '/menu', { class: 'tile wide menu-line' }, [
      h('div', { class: 'tile-ico' }, [F9.ico('utensils', 24)]),
      h('div', { class: 'col' }, [h('div', { class: 'tile-t', text: pick.label + ' hôm nay' }), h('div', { class: 'tile-s trunc', text: pick.names.join(', ') })]),
      F9.ico('chev', 20),
    ]);
  };
})();
