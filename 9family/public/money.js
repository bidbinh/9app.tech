/* 9family: Tiền gia đình. Sổ nhẹ (không thanh toán thật): chi tiêu chung (gõ một câu / giọng nói), khoản phải đóng, tiền tiêu vặt của con.
   Số tiền VND làm tròn đồng. Chỉ vẽ bằng DOM API. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var state = { tab: null, month: null, draft: '', cat: null };
  var CAT = { an_uong: 'Ăn uống', di_cho: 'Đi chợ', dien_nuoc: 'Điện nước', hoc_hanh: 'Học hành', y_te: 'Y tế', khac: 'Khác' };
  var CAT_CLS = { an_uong: 'k1', di_cho: 'k2', dien_nuoc: 'k3', hoc_hanh: 'k4', y_te: 'k5', khac: 'k6' };
  function vnd(n) { return String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ'; }
  function sgn(n) { return (n < 0 ? '-' : '') + vnd(n); }
  function reload() { F9.dropGate(); return F9.refresh(true); }
  function monthLabel(m) { var p = m.split('-'); return 'Tháng ' + Number(p[1]) + '/' + p[0]; }
  function shiftMonth(m, n) { var p = m.split('-').map(Number); var t = p[0] * 12 + (p[1] - 1) + n; return Math.floor(t / 12) + '-' + ('0' + ((t % 12) + 1)).slice(-2); }
  // đọc số tiền người dùng gõ: "350000", "350k", "1tr2", "1.200.000"
  function readAmount(v) {
    v = String(v || '').trim();
    if (/^\d+$/.test(v)) return Number(v);
    var r = F9.parseMoney(v, { today: '2026-01-01' });
    return r.ok && !r.assumed ? r.amount : null;
  }
  function amountField(label, initial) {
    var input = F9.text({ inputmode: 'text', maxlength: 20, 'aria-label': label, value: initial ? String(initial) : '', placeholder: 'Ví dụ: 350k, 1tr2, 1.200.000' });
    var echo = h('div', { class: 'hint', 'aria-live': 'polite' });
    function upd() { var a = readAmount(input.value); echo.textContent = a === null ? (input.value ? 'Chưa hiểu số tiền' : '') : '= ' + vnd(a); }
    input.addEventListener('input', upd); upd();
    return { node: F9.field(label, h('div', {}, [input, echo])), get: function () { return readAmount(input.value); }, input: input };
  }
  var dateInput = function (v, max) { return h('input', { type: 'date', value: v, max: max || null, 'aria-label': 'Ngày' }); };

  F9.money = function (fid) {
    F9.frame({ title: 'Tiền gia đình', back: '#/f/' + fid + '/more', tabs: { fid: fid, tab: 'more' }, right: [F9.bell(fid)] });
    F9.skeleton('list');
    F9.live({
      fetch: function () { var m = state.month || ''; return F9.gated(fid, 'money:' + m, function () { return F9.get(F9.fam(fid, '/money' + (m ? '?month=' + m : ''))); }); },
      render: function (x) { renderMoney(fid, x); }, retick: false, every: 20000,
    }).catch(function (e) { F9.loadError(e, function () { F9.money(fid); }); });
  };

  function tabsOf(x) {
    var t = [];
    if (x.perm.seeTotals) t.push(['chi', 'Chi tiêu']);
    t.push(['dong', 'Phải đóng']);
    if (x.perm.seeAllowance) t.push(['vat', 'Tiêu vặt']);
    return t;
  }

  function renderMoney(fid, x) {
    if (!state.month) state.month = x.month;
    var tabs = tabsOf(x);
    var cur = state.tab;
    if (!tabs.some(function (t) { return t[0] === cur; })) cur = x.role === 'con' ? 'vat' : tabs[0][0];
    var nodes = [h('div', {}, [h('h1', { class: 'h1', text: 'Tiền gia đình' }), h('div', { class: 'sub', text: 'Sổ ghi chép nhẹ nhàng. App không chuyển hay giữ tiền thật.' })])];
    if (tabs.length > 1) nodes.push(F9.seg(tabs, cur, function (v) { state.tab = v; F9.rerender(); }, 'Mục tiền'));
    var fab = null;
    if (cur === 'chi') nodes = nodes.concat(viewExpenses(fid, x));
    else if (cur === 'dong') { nodes = nodes.concat(viewDues(fid, x)); if (x.perm.manage) fab = { label: 'Thêm khoản', onclick: function () { dueSheet(fid, x, null); } }; }
    else nodes = nodes.concat(viewAllowance(fid, x));
    F9.mount(nodes);
    F9.setFab(fab);
  }

  // ---------- gõ nhanh / giọng nói ----------
  // Nút giọng nói dùng chung (public/voice.js): rảnh -> đang nghe -> đang xử lý -> kết quả. Lời nói được TÁCH thành số tiền, danh mục, ngày, ghi chú
  // ở bước "đang xử lý"; kết quả chỉ điền vào ô gõ để soát/sửa, chưa lưu. Không lưu nguyên câu nói.
  function addVoice(row, host, input, update) {
    if (typeof F9.voiceButton !== 'function') return;
    var v = F9.voiceButton({
      lang: 'vi-VN', label: 'Nói để ghi khoản chi', hint: 'Ví dụ: chợ ba trăm năm mươi nghìn',
      parse: function (t) { return F9.parseMoney(t, { today: F9.todayOf(F9.nowMs()) }); },
      onResult: function (text, parsed) {
        if (!text) return;
        input.value = text; state.draft = text; state.cat = null; update(); input.focus();
        F9.toast(parsed && parsed.ok ? 'Đã hiểu ' + vnd(parsed.amount) + '. Soát lại rồi bấm Ghi.' : 'Chưa thấy số tiền, bạn sửa lại trong ô nhé.');
      },
    });
    row.appendChild(v.button); host.appendChild(v.panel);
  }

  function quickCard(fid, x) {
    var today = x.today;
    var input = F9.text({ maxlength: 120, placeholder: 'Gõ một câu: chợ 350k, điện 1tr2', 'aria-label': 'Ghi nhanh một khoản chi', 'data-k': 'money-quick', enterkeyhint: 'done' });
    input.value = state.draft;
    var prev = h('div', { class: 'qprev', 'aria-live': 'polite' });
    var catChips = h('div', { class: 'qcats' });
    var go = F9.btn('Ghi khoản chi', 'primary', function () { return submit(); });
    function parsed() { return F9.parseMoney(input.value, { today: today }); }
    function update() {
      state.draft = input.value;
      F9.clear(prev); F9.clear(catChips);
      if (!input.value.trim()) { prev.appendChild(h('span', { class: 'muted small', text: 'Ví dụ: "chợ 350k", "điện nước 1 triệu rưỡi", "cafe 35 hôm qua".' })); go.disabled = true; return; }
      var p = parsed();
      if (!p.ok) { prev.appendChild(h('span', { class: 'qbad', text: 'Chưa thấy số tiền. Thử "chợ 350k".' })); go.disabled = true; return; }
      go.disabled = false;
      var cat = state.cat || p.category;
      prev.appendChild(h('div', { class: 'qline' }, [h('b', { text: vnd(p.amount) }), h('span', { text: ' · ' + CAT[cat] + ' · ' + (p.day === today ? 'hôm nay' : F9.dmy(p.day)) + (p.note ? ' · ' + p.note : '') })]));
      if (p.assumed) prev.appendChild(h('div', { class: 'small muted', text: 'Số không có đơn vị được hiểu là nghìn đồng. Sửa lại nếu chưa đúng.' }));
      catChips.appendChild(F9.chips(Object.keys(CAT).map(function (k) { return [k, CAT[k]]; }), [cat], function (v) { state.cat = v[0]; update(); }, { single: true }));
    }
    function submit() {
      var p = parsed(); if (!p.ok) return null;
      var cat = state.cat || p.category;
      return F9.busy(go, function () {
        return F9.post(F9.fam(fid, '/money/expenses'), { amount: p.amount, category: cat, day: p.day, note: p.note }, { idem: 'mexp' }).then(function (r) {
          state.draft = ''; state.cat = null; input.value = ''; update();
          return reload().then(function () {
            F9.toast('Đã ghi ' + vnd(p.amount) + ' · ' + CAT[cat], '', { undo: function () { return F9.del(F9.fam(fid, '/money/expenses/' + r.id)).then(reload); } });
          });
        });
      });
    }
    input.addEventListener('input', function () { state.cat = null; update(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!go.disabled) submit(); } });
    var row = h('div', { class: 'row qrow' }, [h('div', { class: 'col' }, [input])]);
    var vhost = h('div', { class: 'qvoice' });
    addVoice(row, vhost, input, update);
    update();
    return h('div', { class: 'card quick' }, [h('div', { class: 'b', text: 'Ghi nhanh một khoản chi' }), h('div', { class: 'mt' }, [row]), vhost, prev, catChips, h('div', { class: 'btn-row' }, [go])]);
  }

  // ---------- chi tiêu ----------
  function viewExpenses(fid, x) {
    var n = [];
    if (x.perm.addExpense) n.push(quickCard(fid, x));
    var s = x.summary;
    var head = h('div', { class: 'row sb mnav' }, [
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng trước', onclick: function () { state.month = shiftMonth(x.month, -1); F9.money(fid); } }, [F9.ico('back', 22)]),
      h('div', { class: 'b', text: monthLabel(x.month) }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng sau', disabled: x.month >= x.today.slice(0, 7), onclick: function () { state.month = shiftMonth(x.month, 1); F9.money(fid); } }, [F9.ico('chev', 22)]),
    ]);
    var card = [head, h('div', { class: 'bigsum' }, [h('div', { class: 'muted small', text: 'Tổng chi chung của cả nhà' }), h('div', { class: 'amt', text: vnd(s.total) }), h('div', { class: 'muted small', text: s.count + ' khoản' })])];
    if (x.budget > 0) {
      var b = x.budgetStatus;
      card.push(h('div', { class: 'budget ' + b.level }, [F9.chart.bars({ max: 100, title: 'Đã dùng ' + b.pct + '% ngân sách', items: [{ value: Math.min(100, b.pct), cls: b.level === 'over' ? 'kover' : b.level === 'near' ? 'knear' : 'k1' }] }),
        h('div', { class: 'small', text: b.text })]));
    }
    var cats = Object.keys(CAT).filter(function (k) { return s.byCat[k] > 0; }).sort(function (a, c) { return s.byCat[c] - s.byCat[a]; });
    if (cats.length) {
      card.push(h('div', { class: 'sec2', text: 'Theo danh mục' }));
      card.push(h('div', { class: 'catlist' }, cats.map(function (k) {
        return h('div', { class: 'catrow' }, [h('div', { class: 'row sb' }, [h('span', { class: 'cdot ' + CAT_CLS[k] }), h('span', { class: 'col b', text: CAT[k] }), h('span', { text: vnd(s.byCat[k]) }), h('span', { class: 'muted small cpct', text: Math.round(s.byCat[k] / s.total * 100) + '%' })]),
          F9.chart.bars({ max: 100, title: CAT[k] + ' ' + vnd(s.byCat[k]), items: [{ value: s.byCat[k] / s.total * 100, cls: CAT_CLS[k] }] })]);
      })));
    } else card.push(F9.empty('Tháng này chưa có khoản chi', x.perm.addExpense ? 'Gõ một câu ở trên để ghi khoản đầu tiên.' : null, null, 'wallet'));
    if (x.history && x.history.length > 1) {
      card.push(h('div', { class: 'sec2', text: '6 tháng gần đây' }));
      card.push(F9.chart.columns({ title: 'Tổng chi các tháng gần đây', items: x.history.map(function (m) { return { label: 'T' + Number(m.month.slice(5)), value: m.total, cls: m.month === x.month ? 'k1' : 'kmute' }; }) }));
    }
    n.push(h('div', { class: 'card' }, card));
    var acts = [];
    if (x.perm.seeTotals) acts.push(h('a', { class: 'btn ghost xs', href: new URL(F9.fam(fid, '/money/export.csv?month=' + x.month), document.baseURI).href, download: 'chi-tieu-' + x.month + '.csv' }, [F9.ico('share', 18), 'Xuất CSV']));
    if (x.perm.manage) acts.push(F9.btn('Đặt ngân sách tháng', 'ghost xs', function () { budgetSheet(fid, x); }));
    if (acts.length) n.push(h('div', { class: 'btn-row' }, acts));
    // danh sách theo ngày
    n.push(h('div', { class: 'sec' }, [h('span', { text: x.role === 'manager' ? 'Các khoản chi' : 'Khoản chi của bạn' })]));
    if (!x.expenses.length) n.push(F9.empty('Chưa có khoản nào', null, null, 'info'));
    else {
      var byDay = {}; var days = [];
      x.expenses.forEach(function (e) { if (!byDay[e.day]) { byDay[e.day] = []; days.push(e.day); } byDay[e.day].push(e); });
      days.forEach(function (d) {
        var tot = byDay[d].reduce(function (a, e) { return a + e.amount; }, 0);
        n.push(h('div', { class: 'daytag' }, [h('span', { text: F9.dayLabel ? F9.dayLabel(d, x.today) : F9.dmy(d) }), h('span', { text: vnd(tot) })]));
        n.push(h('div', { class: 'list' }, byDay[d].map(function (e) {
          var mine = x.role === 'manager' || e.createdBy === x.members[0].id;
          return h('button', { type: 'button', class: 'list-row tap', onclick: function () { expenseSheet(fid, x, e); }, disabled: !mine }, [h('span', { class: 'cdot ' + CAT_CLS[e.category] }), h('div', { class: 'col' }, [h('div', { class: 'b', text: e.note || CAT[e.category] }), h('div', { class: 'muted small', text: CAT[e.category] + (e.whoName && x.role === 'manager' ? ' · ' + e.whoName : '') })]), h('div', { class: 'b', text: vnd(e.amount) })]);
        })));
      });
    }
    return n;
  }

  function expenseSheet(fid, x, e) {
    F9.sheet('Sửa khoản chi', function (body, close) {
      var amt = amountField('Số tiền', e.amount);
      var cat = e.category;
      var catChips = F9.chips(Object.keys(CAT).map(function (k) { return [k, CAT[k]]; }), [cat], function (v) { cat = v[0]; }, { single: true });
      var day = dateInput(e.day, x.today);
      var note = F9.text({ maxlength: 100, value: e.note, 'aria-label': 'Ghi chú' });
      var who = e.who;
      body.appendChild(amt.node); body.appendChild(F9.field('Danh mục', catChips)); body.appendChild(F9.field('Ngày', day)); body.appendChild(F9.field('Ghi chú', note));
      if (x.perm.manage && x.members.length > 1) body.appendChild(F9.field('Người chi', F9.chips(x.members.map(function (m) { return [m.id, m.name]; }), who ? [who] : [], function (v) { who = v[0]; }, { single: true })));
      var go = F9.btn('Lưu', 'primary block', function () {
        var a = amt.get(); if (a === null || a < 1) { F9.toast('Số tiền chưa đúng', 'err'); return; }
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/money/expenses/' + e.id), { amount: a, category: cat, day: day.value, note: note.value, who: who }, { idem: 'mexpe' }).then(function () { close(); F9.toast('Đã lưu'); return reload(); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
      body.appendChild(h('div', { class: 'btn-row' }, [F9.btn('Xóa khoản chi', 'ghost danger-t', function () {
        F9.del(F9.fam(fid, '/money/expenses/' + e.id)).then(function () { close(); return reload().then(function () { F9.toast('Đã xóa khoản chi', '', { undo: function () { return F9.post(F9.fam(fid, '/money/expenses/' + e.id + '/restore'), {}).then(reload); } }); }); }, F9.fail);
      })]));
    });
  }

  function budgetSheet(fid, x) {
    F9.sheet('Ngân sách mỗi tháng', function (body, close) {
      var amt = amountField('Ngân sách (đồng)', x.budget || '');
      body.appendChild(amt.node);
      body.appendChild(h('p', { class: 'small muted', text: 'App chỉ nhắc nhẹ khi gần hoặc vượt ngân sách. Để trống để tắt.' }));
      var go = F9.btn('Lưu', 'primary block', function () {
        var v = amt.input.value.trim() === '' ? 0 : amt.get(); if (v === null) { F9.toast('Số tiền chưa đúng', 'err'); return; }
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/money/budget'), { budget: v }, { idem: 'mbud' }).then(function () { close(); F9.toast('Đã lưu ngân sách'); return reload(); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
    });
  }

  // ---------- khoản phải đóng ----------
  function dueStatus(d, today) {
    if (d.paid) return ['Đã đóng ' + F9.dm(d.paidOn), 'ok'];
    if (d.overdue) return ['Quá hạn ' + F9.diffDays(d.dueDate, today) + ' ngày', 'warn'];
    var n = F9.diffDays(today, d.dueDate);
    return [n === 0 ? 'Hạn hôm nay' : 'Còn ' + n + ' ngày', n <= 3 ? 'info' : ''];
  }
  function viewDues(fid, x) {
    var n = [];
    var open = x.dues.filter(function (d) { return !d.paid; }); var paid = x.dues.filter(function (d) { return d.paid; });
    var total = open.reduce(function (a, d) { return a + d.amount; }, 0);
    if (!x.dues.length) { n.push(F9.empty('Chưa có khoản phải đóng', x.perm.manage ? 'Thêm học phí, quỹ lớp, tiền điện nước... để được nhắc trước hạn.' : null, null, 'wallet')); return n; }
    if (open.length) n.push(h('div', { class: 'sumline' }, [h('b', { text: open.length + ' khoản chưa đóng' }), h('span', { text: 'tổng ' + vnd(total) })]));
    function row(d) {
      var st = dueStatus(d, x.today); var kid = x.children.filter(function (c) { return c.id === d.childId; })[0];
      return h('div', { class: 'list-row hdue' }, [
        h('button', { type: 'button', class: 'col', onclick: function () { dueSheet(fid, x, d); } }, [h('div', { class: 'b', text: d.title }), h('div', { class: 'muted small', text: vnd(d.amount) + ' · hạn ' + F9.dmy(d.dueDate) + (kid ? ' · ' + kid.name : '') }), h('div', { class: 'chips' }, [F9.chip(st[0], st[1]), d.source === 'truong' ? F9.chip('Từ thông báo trường', 'info') : null])]),
        x.perm.manage && !d.paid ? F9.btn('Đã đóng', 'ghost xs', function () { markPaid(fid, d, true); }) : null]);
    }
    if (open.length) { n.push(h('div', { class: 'sec' }, [h('span', { text: 'Chưa đóng' })])); n.push(h('div', { class: 'list' }, open.map(row))); }
    if (paid.length) { n.push(h('div', { class: 'sec' }, [h('span', { text: 'Đã đóng gần đây' })])); n.push(h('div', { class: 'list' }, paid.map(row))); }
    if (!x.perm.manage) n.push(h('p', { class: 'small muted', text: 'Chỉ chủ gia đình và người quản lý sửa được các khoản này.' }));
    return n;
  }
  function markPaid(fid, d, paid, addExpense) {
    return F9.post(F9.fam(fid, '/money/dues/' + d.id), { paid: paid, addExpense: !!addExpense }).then(function () {
      return reload().then(function () { F9.toast(paid ? 'Đã đánh dấu đã đóng' : 'Đã bỏ dấu đã đóng', '', paid ? { undo: function () { return F9.post(F9.fam(fid, '/money/dues/' + d.id), { paid: false }).then(reload); } } : undefined); });
    }, F9.fail);
  }
  function dueSheet(fid, x, d) {
    F9.sheet(d ? d.title : 'Thêm khoản phải đóng', function (body, close) {
      var ro = !x.perm.manage;
      if (ro) { body.appendChild(h('p', { text: vnd(d.amount) + ' · hạn ' + F9.dmy(d.dueDate) })); if (d.note) body.appendChild(h('p', { class: 'muted', text: d.note })); return; }
      var title = F9.text({ maxlength: 100, value: d ? d.title : '', placeholder: 'Ví dụ: Học phí tháng 10', 'aria-label': 'Tên khoản' });
      var amt = amountField('Số tiền', d ? d.amount : '');
      var due = dateInput(d ? d.dueDate : x.today); due.setAttribute('aria-label', 'Hạn đóng');
      var kid = d ? d.childId : null; var cal = true; var note = F9.text({ maxlength: 300, value: d ? d.note : '', 'aria-label': 'Ghi chú' });
      body.appendChild(F9.field('Tên khoản', title)); body.appendChild(amt.node); body.appendChild(F9.field('Hạn đóng', due));
      if (x.children.length) body.appendChild(F9.field('Của con nào (không bắt buộc)', F9.chips(x.children.map(function (c) { return [c.id, c.name, 'c-' + c.color]; }), kid ? [kid] : [], function (v) { kid = v[0] || null; }, { single: true })));
      body.appendChild(F9.field('Ghi chú', note));
      if (!d) body.appendChild(F9.switchRow('Thêm hạn vào lịch gia đình', 'Nhắc cả nhà trên lịch; app còn nhắc riêng chủ và quản lý.', cal, function (v) { cal = v; }));
      var go = F9.btn('Lưu', 'primary block', function () {
        var a = amt.get(); if (a === null) { F9.toast('Số tiền chưa đúng', 'err'); return; }
        var p = d ? { title: title.value, amount: a, dueDate: due.value, note: note.value } : { title: title.value, amount: a, dueDate: due.value, childId: kid, note: note.value, addToCalendar: cal };
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/money/dues' + (d ? '/' + d.id : '')), p, { idem: 'mdue' }).then(function () { close(); F9.toast('Đã lưu'); return reload(); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
      if (d) {
        var btns = [];
        if (!d.paid) btns.push(F9.btn('Đã đóng và ghi vào chi tiêu', 'ghost', function () { close(); markPaid(fid, d, true, true); }));
        else btns.push(F9.btn('Bỏ dấu đã đóng', 'ghost', function () { close(); markPaid(fid, d, false); }));
        btns.push(F9.btn('Xóa khoản này', 'ghost danger-t', function () { F9.confirm({ title: 'Xóa khoản phải đóng', text: 'Xóa "' + d.title + '" (và hạn trên lịch)?', ok: 'Xóa', danger: true }).then(function (y) { if (y) F9.del(F9.fam(fid, '/money/dues/' + d.id)).then(function () { close(); F9.toast('Đã xóa'); return reload(); }, F9.fail); }); }));
        body.appendChild(h('div', { class: 'btn-row' }, btns));
      }
    });
  }

  // ---------- tiền tiêu vặt ----------
  function viewAllowance(fid, x) {
    var n = [F9.notice('info', 'Chỉ là sổ ghi chép', 'App không giữ hay chuyển tiền thật. Số dư là số bạn ghi: tiền cha mẹ đưa trừ tiền con tiêu.')];
    if (!x.allowances || !x.allowances.length) { n.push(F9.empty('Chưa có hồ sơ con', null, null, 'users')); return n; }
    x.allowances.forEach(function (a) {
      var per = a.period === 'thang' ? 'tháng' : 'tuần';
      var kids = [h('div', { class: 'row' }, [F9.avatar({ name: a.name, color: a.color }, 'l'), h('div', { class: 'col ml' }, [h('div', { class: 'b', text: a.name }), h('div', { class: 'muted small', text: a.configured && a.amount > 0 ? 'Tiêu vặt ' + vnd(a.amount) + ' mỗi ' + per : 'Chưa đặt mức tiêu vặt' })])]),
        h('div', { class: 'bigsum' }, [h('div', { class: 'muted small', text: 'Số dư trong sổ' }), h('div', { class: 'amt', text: sgn(a.balance) })])];
      if (a.goalAmount > 0) kids.push(h('div', { class: 'goal' }, [h('div', { class: 'row sb small' }, [h('span', { class: 'b', text: 'Mục tiêu: ' + (a.goalName || 'tiết kiệm') }), h('span', { text: a.goalPct + '% · ' + vnd(a.goalAmount) })]), F9.chart.bars({ max: 100, title: 'Đạt ' + a.goalPct + '% mục tiêu', items: [{ value: a.goalPct, cls: 'k1' }] })]));
      if (x.perm.manage) {
        var btns = [];
        if (a.configured && a.amount > 0) btns.push(a.givenThisPeriod ? h('div', { class: 'given' }, [F9.chip('Đã đưa ' + per + ' này', 'ok')]) : F9.btn('Đã đưa ' + per + ' này (' + vnd(a.amount) + ')', 'primary', function () {
          F9.post(F9.fam(fid, '/money/allowance/' + a.childId + '/give'), {}, { idem: 'mgive' + a.childId }).then(function () { F9.toast('Đã ghi đưa tiền'); return reload(); }, F9.fail);
        }));
        if (!(a.configured && a.amount > 0)) btns.push(F9.btn('Đặt mức tiêu vặt', 'primary', function () { allowSheet(fid, a); }));
        btns.push(F9.btn('Con tiêu', 'ghost', function () { entrySheet(fid, a, 'chi'); }));
        n.push(h('div', { class: 'card' }, kids.concat([h('div', { class: 'btn-row' }, btns), h('div', { class: 'btn-row' }, [F9.btn('Thêm tiền', 'ghost xs', function () { entrySheet(fid, a, 'dua'); }), F9.btn('Điều chỉnh số dư', 'ghost xs', function () { entrySheet(fid, a, 'dieu_chinh'); }), F9.btn('Cài đặt', 'ghost xs', function () { allowSheet(fid, a); })]), entriesList(fid, a, true)])));
      } else n.push(h('div', { class: 'card' }, kids.concat([entriesList(fid, a, false)])));
    });
    return n;
  }
  function entriesList(fid, a, canDel) {
    if (!a.entries.length) return h('p', { class: 'small muted mt', text: 'Chưa có dòng nào trong sổ.' });
    var KIND = { dua: 'Được đưa', chi: 'Đã tiêu', dieu_chinh: 'Điều chỉnh' };
    return h('div', { class: 'list mt' }, a.entries.slice(0, 6).map(function (e) {
      return h('div', { class: 'list-row' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: KIND[e.kind] + (e.note ? ': ' + e.note : '') }), h('div', { class: 'muted small', text: F9.dmy(e.day) })]), h('div', { class: 'b ' + (e.amount < 0 ? 'neg' : 'pos'), text: (e.amount > 0 ? '+' : '') + sgn(e.amount) }),
        canDel ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Xóa dòng ' + F9.dmy(e.day), onclick: function () { F9.del(F9.fam(fid, '/money/allowance/entries/' + e.id)).then(function () { F9.toast('Đã xóa dòng'); return reload(); }, F9.fail); } }, [F9.ico('trash', 20)]) : null]);
    }));
  }
  function entrySheet(fid, a, kind) {
    var title = kind === 'chi' ? 'Con tiêu tiền' : kind === 'dua' ? 'Thêm tiền cho ' + a.name : 'Điều chỉnh số dư';
    F9.sheet(title, function (body, close) {
      var amt = amountField(kind === 'dieu_chinh' ? 'Số tiền (nhập số âm để trừ)' : 'Số tiền');
      if (kind === 'dieu_chinh') amt.input.setAttribute('inputmode', 'text');
      var note = F9.text({ maxlength: 80, placeholder: kind === 'chi' ? 'Mua gì? (không bắt buộc)' : 'Ghi chú (không bắt buộc)', 'aria-label': 'Ghi chú' });
      body.appendChild(amt.node); body.appendChild(F9.field('Ghi chú', note));
      var go = F9.btn('Lưu', 'primary block', function () {
        var raw = amt.input.value.trim(); var neg = kind === 'dieu_chinh' && raw.charAt(0) === '-'; var v = readAmount(neg ? raw.slice(1) : raw);
        if (v === null || v === 0) { F9.toast('Số tiền chưa đúng', 'err'); return; }
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/money/allowance/' + a.childId + '/entries'), { kind: kind, amount: neg ? -v : v, note: note.value }, { idem: 'mentry' }).then(function (r) { close(); return reload().then(function () { F9.toast('Đã ghi vào sổ', '', { undo: function () { return F9.del(F9.fam(fid, '/money/allowance/entries/' + r.id)).then(reload); } }); }); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
    });
  }
  function allowSheet(fid, a) {
    F9.sheet('Tiêu vặt của ' + a.name, function (body, close) {
      var amt = amountField('Số tiền mỗi kỳ', a.amount || ''); var period = a.period;
      var gname = F9.text({ maxlength: 60, value: a.goalName, placeholder: 'Ví dụ: xe đạp mới', 'aria-label': 'Tên mục tiêu' }); var gamt = amountField('Số tiền mục tiêu', a.goalAmount || '');
      body.appendChild(amt.node); body.appendChild(F9.field('Đưa mỗi', F9.chips([['tuan', 'Tuần'], ['thang', 'Tháng']], [period], function (v) { period = v[0]; }, { single: true })));
      body.appendChild(F9.field('Mục tiết kiệm (không bắt buộc)', gname)); body.appendChild(gamt.node);
      var go = F9.btn('Lưu', 'primary block', function () {
        var v = amt.input.value.trim() === '' ? 0 : amt.get(); var g = gamt.input.value.trim() === '' ? 0 : gamt.get();
        if (v === null || g === null) { F9.toast('Số tiền chưa đúng', 'err'); return; }
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/money/allowance/' + a.childId), { amount: v, period: period, goalName: gname.value, goalAmount: g }, { idem: 'mallow' }).then(function () { close(); F9.toast('Đã lưu'); return reload(); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
    });
  }
})();
