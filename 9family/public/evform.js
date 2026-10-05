/* 9family: chi tiết sự kiện (sheet) và màn tạo/sửa sự kiện. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;

  var REC = [['none', 'Một lần'], ['daily', 'Hằng ngày'], ['weekly', 'Hằng tuần'], ['yearly', 'Hằng năm (dương lịch)'], ['yearly_lunar', 'Hằng năm (âm lịch)'], ['monthly_lunar', 'Hằng tháng (âm lịch)']];
  var REC_NAME = {}; REC.forEach(function (r) { REC_NAME[r[0]] = r[1]; });
  function offsetLabel(o, allDay) {
    if (allDay) return o === 0 ? 'Đúng ngày (7 giờ sáng)' : o === 1440 ? '1 ngày trước (7 giờ sáng)' : o + ' phút';
    return o === 0 ? 'Đúng giờ' : o === 1440 ? '1 ngày trước' : o >= 60 ? (o / 60) + ' giờ trước' : o + ' phút trước';
  }
  function lunarOpts(max, mon) { var a = []; for (var i = 1; i <= max; i++) a.push([i, mon ? 'Tháng ' + i : (i < 10 ? 'Mùng ' + i : i === 15 ? 'Rằm (15)' : String(i))]); return a; }
  function timeText(o) { return o.allDay ? 'Cả ngày' : o.start + (o.end ? '–' + o.end : ''); }
  function done(fid, msg, toast) { if (toast) F9.toast(toast); F9.dropGate(); return F9.refresh(true); }

  // ---------- chi tiết một lần diễn ra ----------
  F9.eventSheet = function (ctx, occ) {
    var fid = ctx.fid; var core = ctx.core;
    F9.sheet(occ.title, function (body, close) {
      var kids = (occ.childIds || []).map(function (id) { return F9.kidOf(core, id); }).filter(Boolean);
      body.appendChild(h('div', { class: 'b', text: F9.dayLabel(occ.day, ctx.today) + ' · ' + timeText(occ) }));
      if (occ.location) body.appendChild(h('div', { text: 'Địa điểm: ' + occ.location }));
      if (kids.length) body.appendChild(h('div', { class: 'chips wrapchips' }, kids.map(F9.kidChip)));
      var inCharge = (occ.memberIds || []).map(function (id) { return F9.memberOf(core, id); }).filter(Boolean);
      if (inCharge.length) body.appendChild(h('div', { class: 'row' }, [F9.avatars(inCharge), h('div', { class: 'ml muted', text: 'Phụ trách: ' + inCharge.map(function (m) { return m.name; }).join(', ') })]));
      if (occ.checklist && occ.checklist.length) body.appendChild(h('div', {}, [h('div', { class: 'lab', text: 'Cần mang' }), h('ul', { class: 'plain' }, occ.checklist.map(function (c) { return h('li', { text: c }); }))]));
      if (occ.note) body.appendChild(h('p', { class: 'pre', text: occ.note }));
      if (occ.edited) body.appendChild(F9.notice('info', 'Ngày này đã được sửa riêng', 'Các ngày khác vẫn theo lịch gốc.'));
      var holder = h('div', {}, [h('div', { class: 'skel short' })]);
      body.appendChild(holder);
      F9.get(F9.fam(fid, '/events/' + occ.eventId)).then(function (r) {
        F9.clear(holder);
        var ev = r.event;
        if (ev.recType !== 'none') body.insertBefore(h('div', { class: 'muted', text: 'Lặp: ' + REC_NAME[ev.recType] + (ev.recType === 'weekly' ? ' (' + ev.recDays.map(function (d) { return F9.WD_SHORT[d]; }).join(', ') + ')' : '') + (ev.untilDate ? ', đến hết ' + F9.dmy(ev.untilDate) : '') }), holder);
        if (ev.notifyOffsets.length) body.insertBefore(h('div', { class: 'muted', text: 'Nhắc: ' + ev.notifyOffsets.slice().sort(function (a, b) { return a - b; }).map(function (o) { return offsetLabel(o, ev.allDay); }).join(', ') }), holder);
        if (!r.canEdit) { holder.appendChild(h('p', { class: 'muted', text: 'Chỉ người tạo sự kiện hoặc người quản lý mới sửa được.' })); return; }
        var rec = ev.recType !== 'none';
        var row = h('div', { class: 'btn-row' });
        row.appendChild(F9.link('#/f/' + fid + '/event/' + ev.id, { class: 'btn primary' }, [rec ? 'Sửa cả chuỗi' : 'Sửa sự kiện']));
        if (rec) row.appendChild(F9.btn('Sửa riêng ngày này', 'ghost', function () { close(); editDay(ctx, occ, ev); }));
        holder.appendChild(row);
        var row2 = h('div', { class: 'btn-row' });
        if (rec) {
          row2.appendChild(F9.btn('Xóa chỉ ngày này', 'ghost', function () {
            F9.confirm({ title: 'Xóa ngày này?', text: 'Chỉ xóa "' + occ.title + '" ngày ' + F9.dm(occ.day) + '. Các ngày khác giữ nguyên.', ok: 'Xóa ngày này', danger: true }).then(function (y) {
              if (!y) return;
              F9.post(F9.fam(fid, '/events/' + ev.id + '/exceptions'), { day: occ.day, action: 'skip' }).then(function () { close(); return done(fid, '', 'Đã xóa ngày ' + F9.dm(occ.day)); }, F9.fail);
            });
          }));
          row2.appendChild(F9.btn('Xóa từ ngày này về sau', 'ghost', function () {
            F9.confirm({ title: 'Xóa từ ngày này về sau?', text: 'Sự kiện không lặp nữa từ ngày ' + F9.dm(occ.day) + '. Các ngày trước đó giữ nguyên.', ok: 'Xóa', danger: true }).then(function (y) {
              if (!y) return;
              F9.post(F9.fam(fid, '/events/' + ev.id + '/end-from'), { day: occ.day }).then(function () { close(); return done(fid, '', 'Đã dừng lặp từ ' + F9.dm(occ.day)); }, F9.fail);
            });
          }));
        }
        row2.appendChild(F9.btn(rec ? 'Xóa cả chuỗi' : 'Xóa sự kiện', 'ghost', function () {
          F9.confirm({ title: 'Xóa sự kiện?', text: rec ? 'Xóa toàn bộ chuỗi "' + occ.title + '", kể cả các ngày đã qua.' : 'Xóa "' + occ.title + '".', ok: 'Xóa', danger: true }).then(function (y) {
            if (!y) return;
            F9.del(F9.fam(fid, '/events/' + ev.id)).then(function () { close(); return done(fid, '', 'Đã xóa sự kiện'); }, F9.fail);
          });
        }));
        holder.appendChild(row2);
      }).catch(function (e) { F9.clear(holder); holder.appendChild(h('p', { class: 'hint err', text: e.message })); });
    });
  };

  function editDay(ctx, occ, ev) {
    var fid = ctx.fid;
    F9.sheet('Sửa riêng ngày ' + F9.dm(occ.day), function (body, close) {
      var title = F9.text({ value: occ.title, maxlength: 80 });
      var start = h('input', { type: 'time', value: occ.start || '' }); var end = h('input', { type: 'time', value: occ.end || '' });
      var loc = F9.text({ value: occ.location || '', maxlength: 100 });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = F9.btn('Lưu cho ngày này', 'primary block', function () {
        return F9.busy(save, function () {
          var b = { day: occ.day, action: 'edit', title: title.value, location: loc.value };
          if (!occ.allDay) { b.start = start.value; b.end = end.value || ''; }
          return F9.post(F9.fam(fid, '/events/' + ev.id + '/exceptions'), b).then(function () { close(); return done(fid, '', 'Đã sửa ngày ' + F9.dm(occ.day)); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Chỉ đổi cho ngày ' + F9.dmy(occ.day) + '. Các ngày khác vẫn theo lịch gốc.' }));
      body.appendChild(F9.field('Tiêu đề', title));
      if (!occ.allDay) body.appendChild(h('div', { class: 'grid2' }, [F9.field('Bắt đầu', start), F9.field('Kết thúc', end)]));
      body.appendChild(F9.field('Địa điểm', loc));
      body.appendChild(err); body.appendChild(save);
    });
  }

  // ---------- màn tạo / sửa ----------
  F9.eventForm = function (fid, id, presetDay) {
    F9.frame({ title: id ? 'Sửa sự kiện' : 'Thêm sự kiện', back: F9.returnTo || ('#/f/' + fid + '/today') });
    F9.skeleton();
    Promise.all([F9.get(F9.fam(fid)), id ? F9.get(F9.fam(fid, '/events/' + id)) : null]).then(function (a) {
      F9.syncClock(a[0].now);
      build(fid, a[0], a[1], presetDay);
    }).catch(function (e) { F9.loadError(e, function () { F9.eventForm(fid, id, presetDay); }); });
  };

  function build(fid, core, detail, presetDay) {
    var ev = detail ? detail.event : null;
    var today = core.today;
    if (detail && !detail.canEdit) { F9.mount([F9.empty('Bạn không sửa được sự kiện này', 'Chỉ người tạo sự kiện hoặc người quản lý mới sửa được.', h('div', { class: 'btn-row center' }, [F9.link('#/f/' + fid + '/cal', { class: 'btn primary' }, ['Về lịch'])]))]); return; }
    var back = F9.returnTo || ('#/f/' + fid + '/today');
    // bản nháp chưa lưu được giữ trong sessionStorage: tải lại trang giữa chừng không mất
    var draftKey = 'draft.ev.' + fid + '.' + (ev ? ev.id : 'new');
    var draft = F9.draft(draftKey);
    var d0 = draft || {};
    function pv(k, evv, def) { return d0[k] !== undefined ? d0[k] : (ev ? evv : def); }
    var saveDraft = function () {};
    var title = F9.text({ value: pv('title', ev && ev.title, ''), maxlength: 80, placeholder: 'Ví dụ: Học múa' });
    var kind = F9.select(F9.KINDS, pv('kind', ev && ev.kind, 'khac'));
    var kidChips = core.children.length ? F9.chips(core.children.map(function (c) { return [c.id, c.name, 'c-' + c.color]; }), pv('childIds', ev && ev.childIds, []), null) : null;
    var logins = core.members.filter(function (m) { return !m.external && !m.pending; });
    var memChips = F9.chips(logins.map(function (m) { return [m.id, m.name]; }), pv('memberIds', ev && ev.memberIds, []), null);
    var allDay = h('input', { type: 'checkbox', id: 'ad' }); allDay.checked = !!pv('allDay', ev && ev.allDay, false);
    var date = h('input', { type: 'date', value: pv('startDate', ev && ev.startDate, presetDay || today), 'aria-label': 'Ngày' });
    var start = h('input', { type: 'time', value: pv('start', ev && ev.start, '07:00') || '07:00' });
    var end = h('input', { type: 'time', value: pv('end', ev && ev.end, '') || '' });
    var rec = F9.select(REC, pv('recType', ev && ev.recType, 'none'));
    var until = h('input', { type: 'date', value: pv('untilDate', ev && ev.untilDate, '') || '', 'aria-label': 'Lặp đến hết ngày' });
    var loc = F9.text({ value: pv('location', ev && ev.location, ''), maxlength: 100, placeholder: 'Ví dụ: Trường Hoa Mai' });
    var note = h('textarea', { maxlength: 500, placeholder: 'Ghi chú thêm (không bắt buộc)', 'aria-label': 'Ghi chú' }); note.value = pv('note', ev && ev.note, '');
    var check = pv('checklist', ev && ev.checklist, []).slice();
    var lday = F9.select(lunarOpts(30, false), pv('lunarDay', ev && ev.lunarDay, 1) || 1);
    var lmon = F9.select(lunarOpts(12, true), pv('lunarMonth', ev && ev.lunarMonth, 1) || 1);
    var offs = pv('notifyOffsets', ev && ev.notifyOffsets, [30]).slice();
    var wdInit = pv('recDays', ev && ev.recDays, []);
    var wd = F9.chips([1, 2, 3, 4, 5, 6, 7].map(function (d) { return [d, F9.WD_SHORT[d]]; }), wdInit && wdInit.length ? wdInit : [F9.weekday(pv('startDate', ev && ev.startDate, presetDay || today))], function () { refreshPreview(); });
    wd.className += ' wd-row';
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var dyn = h('div', {});
    var offWrap = h('div', {});
    var checkWrap = h('div', {});
    var prevBox = h('div', { class: 'notice', 'aria-live': 'polite' });
    var timeRow = h('div', { class: 'grid2' }, [F9.field('Giờ bắt đầu', start), F9.field('Giờ kết thúc', end)]);

    function body() {
      var b = {
        title: title.value, kind: kind.value, location: loc.value, note: note.value, allDay: allDay.checked, startDate: date.value, recType: rec.value,
        notifyOffsets: offs.slice(), checklist: check.slice(), childIds: kidChips ? kidChips.getValue() : [], memberIds: memChips.getValue(),
      };
      if (!b.allDay) { b.start = start.value; b.end = end.value || ''; }
      if (b.recType !== 'none' && until.value) b.untilDate = until.value;
      if (b.recType === 'weekly') b.recDays = wd.getValue();
      if (b.recType === 'yearly_lunar') { b.lunarDay = Number(lday.value); b.lunarMonth = Number(lmon.value); }
      if (b.recType === 'monthly_lunar') b.lunarDay = Number(lday.value);
      return b;
    }
    var prevTimer = null; var prevSeq = 0;
    function refreshPreview() {
      clearTimeout(prevTimer);
      prevTimer = setTimeout(function () {
        var seq = ++prevSeq; var b = body();
        if (!b.title) b.title = 'x';
        F9.post(F9.fam(fid, '/events/preview'), b).then(function (r) {
          if (seq !== prevSeq) return;
          F9.clear(prevBox);
          prevBox.className = 'notice';
          prevBox.appendChild(h('div', { class: 'notice-ico' }, [F9.ico('cal', 22)]));
          prevBox.appendChild(h('div', { class: 'notice-b' }, [h('div', { class: 'b', text: r.next.length ? 'Các lần tới' : 'Chưa có lần nào sắp tới' }), r.next.length ? h('div', {}, r.next.map(function (n) { return h('div', { text: F9.WD[n.weekday] + ', ' + F9.dmy(n.day) + ' (âm ' + F9.lunarText(n.lunar) + ')' }); })) : null]));
        }, function (e) { if (seq !== prevSeq) return; F9.clear(prevBox); prevBox.className = 'notice warn'; prevBox.appendChild(h('div', { class: 'notice-b', text: e.message })); });
      }, 350);
    }

    function paintOffsets() {
      F9.clear(offWrap);
      var items = allDay.checked ? [[0, offsetLabel(0, true)], [1440, offsetLabel(1440, true)]] : F9.OFFSETS.map(function (o) { return [o[0], offsetLabel(o[0], false)]; });
      var valid = items.map(function (i) { return i[0]; });
      offs = offs.filter(function (o) { return valid.indexOf(o) >= 0; });
      var ch = F9.chips(items, offs, function (s) { offs = s; });
      offWrap.appendChild(h('div', { class: 'lab', text: 'Nhắc trước' })); offWrap.appendChild(ch);
      offWrap.appendChild(h('div', { class: 'hint', text: 'Thông báo gửi tới người được chọn ở trên, hoặc cả nhà nếu không chọn ai.' }));
    }
    function paintCheck() {
      F9.clear(checkWrap);
      var input = F9.text({ maxlength: 60, placeholder: 'Ví dụ: Giày múa', enterkeyhint: 'done', 'aria-label': 'Thêm mục cần mang' });
      function add() { var v = input.value.trim(); if (!v) return; if (check.length >= 20) { F9.toast('Tối đa 20 mục', 'err'); return; } check.push(v); paintCheck(); setTimeout(function () { var el = checkWrap.querySelector('input'); if (el) el.focus(); }, 0); }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      checkWrap.appendChild(h('div', { class: 'lab', text: 'Cần mang' }));
      if (check.length) checkWrap.appendChild(h('div', { class: 'chips' }, check.map(function (c, i) {
        return h('button', { type: 'button', class: 'optchip on', 'aria-label': 'Bỏ mục ' + c, onclick: function () { check.splice(i, 1); paintCheck(); } }, [c, ' ', F9.ico('close', 14, 3)]);
      })));
      checkWrap.appendChild(h('div', { class: 'row mt' }, [h('div', { class: 'col' }, [input]), F9.btn('Thêm', 'ghost sm', add)]));
    }
    function paintDyn() {
      F9.clear(dyn);
      var t = rec.value;
      if (t === 'weekly') dyn.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Lặp vào các thứ' }), wd]));
      if (t === 'yearly_lunar' || t === 'monthly_lunar') {
        var row = h('div', { class: t === 'yearly_lunar' ? 'grid2' : '' }, [F9.field(t === 'yearly_lunar' ? 'Ngày âm lịch' : 'Ngày âm lịch mỗi tháng', lday)].concat(t === 'yearly_lunar' ? [F9.field('Tháng âm lịch', lmon)] : []));
        dyn.appendChild(row);
        var quick = h('div', { class: 'btn-row' });
        quick.appendChild(F9.btn('Mùng 1', 'ghost sm', function () { lday.value = '1'; refreshPreview(); }));
        quick.appendChild(F9.btn('Rằm', 'ghost sm', function () { lday.value = '15'; refreshPreview(); }));
        quick.appendChild(F9.btn('Lấy theo ngày đã chọn', 'ghost sm', function () {
          F9.get(F9.fam(fid, '/calendar?from=' + date.value + '&to=' + date.value)).then(function (r) { var l = r.lunar[date.value]; lday.value = String(l[0]); lmon.value = String(l[1]); refreshPreview(); }, F9.fail);
        }));
        dyn.appendChild(quick);
        dyn.appendChild(h('div', { class: 'hint', text: 'Tháng nhuận không tính. Ngày 30 của tháng thiếu sẽ rơi vào ngày 29. Ví dụ giỗ: chọn ngày và tháng âm lịch.' }));
      }
      if (t !== 'none') dyn.appendChild(F9.field('Lặp đến hết ngày (không bắt buộc)', until, 'Ví dụ cuối học kỳ. Để trống nếu lặp mãi.'));
    }
    function paintTime() { timeRow.className = allDay.checked ? 'hidden' : 'grid2'; paintOffsets(); }
    allDay.addEventListener('change', function () { paintTime(); refreshPreview(); });
    rec.addEventListener('change', function () { paintDyn(); refreshPreview(); });
    [date, until, start, lday, lmon].forEach(function (el) { el.addEventListener('change', refreshPreview); });
    title.addEventListener('input', function () { /* chỉ để giữ bản nháp trong ô */ });
    paintTime(); paintDyn(); paintCheck();

    var save = F9.btn(ev ? 'Lưu thay đổi' : 'Lưu sự kiện', 'primary block', function () {
      err.className = 'hint err hidden';
      return F9.busy(save, function () {
        var p = ev ? F9.post(F9.fam(fid, '/events/' + ev.id), body()) : F9.post(F9.fam(fid, '/events'), body(), { idem: 'mkev' });
        return p.then(function () { F9.draft(draftKey, null); saveDraft = function () {}; F9.dropGate(); F9.toast('Đã lưu sự kiện'); F9.go(back); }, function (e) { err.textContent = e.message; err.className = 'hint err'; err.scrollIntoView({ block: 'center' }); throw e; });
      });
    });
    var nodes = [
      h('div', { class: 'card' }, [
        F9.field('Tiêu đề', title), F9.field('Loại', kind),
        kidChips ? h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Cho con nào' }), kidChips]) : null,
        h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Người phụ trách, nhận nhắc (để trống: cả nhà)' }), memChips]),
      ]),
      h('div', { class: 'card' }, [
        h('label', { class: 'check', for: 'ad' }, [allDay, 'Cả ngày']),
        F9.field(rec.value === 'none' ? 'Ngày' : 'Bắt đầu từ ngày', date), timeRow,
        F9.field('Lặp lại', rec), dyn, prevBox,
      ]),
      h('div', { class: 'card' }, [F9.field('Địa điểm', loc), offWrap, checkWrap, F9.field('Ghi chú', note)]),
      err,
    ];
    if (ev) nodes.push(F9.btn('Xóa sự kiện này', 'ghost block', function () {
      F9.confirm({ title: 'Xóa sự kiện?', text: 'Xóa "' + ev.title + '"' + (ev.recType !== 'none' ? ' và mọi lần lặp.' : '.'), ok: 'Xóa', danger: true }).then(function (y) {
        if (y) F9.del(F9.fam(fid, '/events/' + ev.id)).then(function () { F9.draft(draftKey, null); F9.dropGate(); F9.toast('Đã xóa'); F9.go(back); }, F9.fail);
      });
    }));
    // đổi nhãn "Ngày" khi đổi kiểu lặp
    rec.addEventListener('change', function () { var l = date.parentNode.querySelector('label'); if (l) l.textContent = rec.value === 'none' ? 'Ngày' : 'Bắt đầu từ ngày'; });
    if (draft) nodes.unshift(F9.notice('info', 'Đã khôi phục bản nháp chưa lưu', 'Bạn đang tiếp tục phần đã nhập dở trước đó.', h('button', { class: 'linkbtn', type: 'button', text: 'Bỏ bản nháp', onclick: function () { F9.draft(draftKey, null); saveDraft = function () {}; F9.route(); } })));
    F9.mount(nodes);
    F9.setCta(save);
    var formEl = F9.$('view').firstChild; var saveT = null;
    saveDraft = function () { clearTimeout(saveT); saveT = setTimeout(function () { F9.draft(draftKey, body()); }, 250); };
    ['input', 'change', 'click'].forEach(function (evn) { formEl.addEventListener(evn, function (e) { if (e.target && e.target.closest && e.target.closest('.card')) saveDraft(); }); });
    refreshPreview();
  }
})();
