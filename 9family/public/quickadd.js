/* 9family: nút "+ Thêm" duy nhất: menu chọn loại, và tờ dưới thêm sự kiện nhanh (mẫu có sẵn, chọn con bằng avatar, lặp chọn nhanh, gõ một câu để điền sẵn). */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;

  F9.addMenu = function (ctx, o) {
    var mgr = F9.isMgr(ctx.core);
    F9.sheet('Thêm gì?', function (body, close) {
      var opt = function (icon, title, sub, fn) {
        return h('button', { type: 'button', class: 'pick', onclick: function () { close(); setTimeout(fn, 180); } }, [
          h('span', { class: 'av l adult' }, [F9.ico(icon, 22)]), h('div', { class: 'col' }, [h('div', { class: 'b', text: title }), h('div', { class: 'muted small', text: sub })]), F9.ico('chev', 18),
        ]);
      };
      var list = h('div', { class: 'pick-list' }, [
        opt('cal', 'Sự kiện', 'Lịch học, khám bệnh, họp phụ huynh, ngày quan trọng', function () { F9.quickEvent(ctx, o); }),
        opt('list', 'Việc cần làm', 'Việc chung, có thể giao cho một người', function () { F9.quickTask(ctx); }),
        opt('cart', 'Món đi chợ', 'Thêm vào danh sách mua sắm chung', function () { F9.quickShop(ctx); }),
        mgr && ctx.core.children.length ? opt('car', 'Ca đưa đón', 'Lịch đưa đón cố định hằng tuần', function () { F9.rideForm(ctx, {}); }) : null,
      ].filter(Boolean));
      body.appendChild(list);
    });
  };

  var TPL = [['hoc_them', 'Học thêm'], ['kham', 'Khám bệnh'], ['hop_phu_huynh', 'Họp phụ huynh'], ['thi', 'Thi, kiểm tra'], ['sinh_nhat', 'Sinh nhật'], ['gio', 'Giỗ'], ['khac', 'Khác']];
  var REC = [['none', 'Một lần'], ['weekly', 'Hằng tuần'], ['daily', 'Hằng ngày'], ['yearly', 'Hằng năm'], ['yearly_lunar', 'Hằng năm (âm lịch)']];
  var REC_NAME = {}; REC.forEach(function (r) { REC_NAME[r[0]] = r[1]; });

  F9.quickEvent = function (ctx, o) {
    var core = ctx.core; var fid = ctx.fid;
    var day0 = (o && o.day) || ctx.today;
    F9.sheet('Thêm sự kiện', function (body, close) {
      var kind = 'khac';
      // gõ một câu
      var nl = F9.text({ maxlength: 200, placeholder: 'Gõ một câu, ví dụ: Piano thứ 7 9:30 ' + (core.children[0] ? core.children[0].name : 'Mía'), enterkeyhint: 'go', 'aria-label': 'Gõ một câu để điền sẵn' });
      var parsed = h('div', { class: 'parsed', 'aria-live': 'polite' });
      function fillFromText() {
        var txt = nl.value.trim(); if (!txt) { nl.focus(); return; }
        var r = F9.parseQuick(txt, { today: ctx.today, kids: core.children });
        apply(r);
        F9.clear(parsed);
        var bits = [];
        if (r.day) bits.push(F9.WD[F9.weekday(r.day)] + ' ' + F9.dm(r.day));
        if (r.start) bits.push(r.start + (r.end ? '–' + r.end : '')); if (r.allDay) bits.push('Cả ngày');
        if (r.recType !== 'none') bits.push(REC_NAME[r.recType] || r.recType);
        r.kidIds.forEach(function (id) { var k = F9.kidOf(core, id); if (k) bits.push(k.name); });
        if (r.location) bits.push(r.location);
        if (bits.length) { parsed.appendChild(h('span', { class: 'muted small', text: 'Đã hiểu:' })); bits.forEach(function (b) { parsed.appendChild(F9.chip(b, 'brand')); }); }
        else parsed.appendChild(h('span', { class: 'muted small', text: 'Chưa hiểu được ngày giờ. Bạn chọn bên dưới nhé.' }));
        title.focus();
      }
      nl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fillFromText(); } });
      var fillBtn = F9.btn('Điền sẵn', 'ghost sm', fillFromText);

      var tpl = F9.chips(TPL.map(function (t) { return [t[0], t[1]]; }), [], function (s) { applyTpl(s[0]); }, { single: true });
      tpl.className = 'tpl';
      var title = F9.text({ maxlength: 80, placeholder: 'Ví dụ: Học múa', 'aria-label': 'Tên sự kiện' });
      var kids = core.children.length ? F9.chips(core.children.map(function (c) { return [c.id, c.name, 'c-' + c.color]; }), [], null) : null;
      var logins = core.members.filter(function (m) { return !m.external && !m.pending; });
      var mems = F9.chips(logins.map(function (m) { return [m.id, m.name]; }), [], null);
      var allDayChip = F9.chips([['1', 'Cả ngày']], [], function () { paintTime(); });
      var allDay = { get checked() { return allDayChip.getValue().length > 0; }, set checked(v) { allDayChip.setValue(v ? ['1'] : []); } };
      var date = h('input', { type: 'date', value: day0, 'aria-label': 'Ngày' });
      var start = h('input', { type: 'time', value: '07:00', 'aria-label': 'Giờ bắt đầu' });
      var end = h('input', { type: 'time', value: '', 'aria-label': 'Giờ kết thúc' });
      var timeRow = h('div', { class: 'grid2' }, [F9.field('Giờ bắt đầu', start), F9.field('Giờ kết thúc', end)]);
      var rec = F9.chips(REC, ['none'], function () { paintRec(); }, { single: true });
      var wd = F9.chips([1, 2, 3, 4, 5, 6, 7].map(function (d) { return [d, F9.WD_SHORT[d]]; }), [F9.weekday(day0)], null);
      wd.className += ' wd-row';
      var wdWrap = h('div', { class: 'hidden' }, [h('div', { class: 'lab', text: 'Lặp vào các thứ' }), wd]);
      var loc = F9.text({ maxlength: 100, placeholder: 'Ví dụ: Trường Hoa Mai', 'aria-label': 'Địa điểm' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });

      function paintRec() {
        var t = rec.getValue()[0];
        wdWrap.className = t === 'weekly' ? '' : 'hidden';
        if (t === 'weekly' && !wd.getValue().length) wd.setValue([F9.weekday(date.value || day0)]);
      }
      function paintTime() { timeRow.className = allDay.checked ? 'hidden' : 'grid2'; }
      date.addEventListener('change', function () { if (rec.getValue()[0] === 'weekly' && date.value) wd.setValue([F9.weekday(date.value)]); });

      function applyTpl(k) {
        kind = ({ sinh_nhat: 'ngay_quan_trong', gio: 'ngay_quan_trong' })[k] || k;
        var selKids = kids ? kids.getValue() : [];
        var kidName = selKids.length === 1 ? (F9.kidOf(core, selKids[0]) || {}).name : '';
        var def = function (t) { if (!title.value.trim()) title.value = t; };
        var setStart = function (t) { if (!allDay.checked && !start.dataset.touched) start.value = t; };
        if (k === 'hoc_them') { def('Học thêm'); rec.setValue(['weekly']); setStart('17:00'); }
        else if (k === 'kham') { def('Khám bệnh'); rec.setValue(['none']); setStart('08:00'); }
        else if (k === 'hop_phu_huynh') { def('Họp phụ huynh'); rec.setValue(['none']); setStart('19:00'); }
        else if (k === 'thi') { def('Thi, kiểm tra'); rec.setValue(['none']); setStart('07:30'); }
        else if (k === 'sinh_nhat') { def(kidName ? 'Sinh nhật ' + kidName : 'Sinh nhật'); allDay.checked = true; rec.setValue(['yearly']); }
        else if (k === 'gio') { def('Giỗ'); allDay.checked = true; rec.setValue(['yearly_lunar']); }
        paintRec(); paintTime();
      }
      start.addEventListener('change', function () { start.dataset.touched = '1'; });

      function apply(r) {
        if (r.title) title.value = r.title;
        if (r.kidIds.length && kids) kids.setValue(r.kidIds);
        if (r.day) date.value = r.day;
        allDay.checked = !!r.allDay;
        if (r.start) { start.value = r.start; start.dataset.touched = '1'; }
        end.value = r.end || '';
        rec.setValue([r.recType === 'monthly_lunar' ? 'none' : r.recType]);
        if (r.recType === 'weekly') wd.setValue(r.recDays);
        if (r.location) loc.value = r.location;
        kind = r.kind || 'khac';
        var tk = r.recType === 'yearly_lunar' ? 'gio' : (r.recType === 'yearly' ? 'sinh_nhat' : r.kind);
        tpl.setValue(TPL.some(function (t) { return t[0] === tk; }) ? [tk] : []);
        paintRec(); paintTime();
      }

      // ---- lấy trạng thái biểu mẫu ----
      function collect(lunar) {
        var t = rec.getValue()[0];
        var b = {
          title: title.value, kind: kind, location: loc.value, note: '', allDay: allDay.checked, startDate: date.value, recType: t,
          notifyOffsets: allDay.checked ? [1440] : [30], checklist: [], childIds: kids ? kids.getValue() : [], memberIds: mems.getValue(),
        };
        if (!b.allDay) { b.start = start.value; b.end = end.value || ''; }
        if (t === 'weekly') b.recDays = wd.getValue();
        if (t === 'yearly_lunar' && lunar) { b.lunarDay = lunar[0]; b.lunarMonth = lunar[1]; }
        return b;
      }
      var save = F9.btn('Lưu sự kiện', 'primary block', function () {
        err.className = 'hint err hidden';
        if (!title.value.trim()) { err.textContent = 'Hãy nhập tên sự kiện, hoặc gõ một câu ở trên rồi bấm Điền sẵn.'; err.className = 'hint err'; title.focus(); return; }
        if (!date.value) { err.textContent = 'Hãy chọn ngày.'; err.className = 'hint err'; return; }
        if (!allDay.checked && !start.value) { err.textContent = 'Hãy chọn giờ bắt đầu, hoặc bật Cả ngày.'; err.className = 'hint err'; return; }
        return F9.busy(save, function () {
          var needLunar = rec.getValue()[0] === 'yearly_lunar';
          var pre = needLunar ? F9.get(F9.fam(fid, '/calendar?from=' + date.value + '&to=' + date.value)).then(function (r) { var l = r.lunar[date.value]; return [l[0], l[1]]; }) : Promise.resolve(null);
          return pre.then(function (lunar) { return F9.post(F9.fam(fid, '/events'), collect(lunar), { idem: 'mkev' }); }).then(function (r) {
            close(); F9.dropGate();
            var id = r.event && r.event.id;
            F9.toast('Đã lưu sự kiện', '', id ? { undo: function () { return F9.del(F9.fam(fid, '/events/' + id)).then(function () { F9.dropGate(); return F9.refresh(true); }); } } : null);
            return F9.refresh(true);
          }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      // sang biểu mẫu đầy đủ (nhắc trước, cần mang, ghi chú) mang theo những gì đã nhập
      var more = h('button', { type: 'button', class: 'linkbtn', onclick: function () {
        var b = collect(null);
        var d = { title: b.title, kind: b.kind, childIds: b.childIds, memberIds: b.memberIds, allDay: b.allDay, startDate: b.startDate, start: b.start || '07:00', end: b.end || '', recType: b.recType, location: b.location, recDays: b.recDays || [], notifyOffsets: b.notifyOffsets };
        F9.draft('draft.ev.' + fid + '.new', d);
        close(); setTimeout(function () { F9.go('#/f/' + fid + '/event/new/' + (b.startDate || day0)); }, 180);
      } }, ['Thêm chi tiết: nhắc trước, cần mang, ghi chú', F9.ico('chev', 16)]);

      body.appendChild(h('div', { class: 'field' }, [h('label', { for: 'qnl', text: 'Gõ một câu' }), h('div', { class: 'quickline' }, [nl, fillBtn]), h('div', { class: 'hint', text: 'Hiểu giờ, thứ, ngày, tên con, nơi.' })]));
      nl.id = 'qnl';
      body.appendChild(parsed);
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Mẫu nhanh' }), tpl]));
      body.appendChild(F9.field('Tên sự kiện', title));
      if (kids) body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Cho con nào' }), kids]));
      body.appendChild(h('div', { class: 'grid2' }, [F9.field('Ngày', date), h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Cả ngày hay theo giờ?' }), allDayChip])]));
      body.appendChild(timeRow);
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Lặp lại' }), rec]));
      body.appendChild(wdWrap);
      body.appendChild(F9.field('Địa điểm', loc));
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Người phụ trách, nhận nhắc (để trống: cả nhà)' }), mems]));
      body.appendChild(err);
      body.appendChild(save);
      body.appendChild(h('div', { class: 'center' }, [more]));
      paintRec(); paintTime();
    });
  };
})();
