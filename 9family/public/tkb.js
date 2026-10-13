/* 9family: nhập thời khóa biểu bằng lưới (theo thứ và tiết), hoặc đọc từ ảnh bằng AI rồi xem lại từng ô. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var DEF_PERIODS = [['07:00', '07:45'], ['07:50', '08:35'], ['08:50', '09:35'], ['09:40', '10:25'], ['10:30', '11:15']];

  F9.tkb = function (fid, cid) {
    F9.frame({ title: 'Thời khóa biểu', back: '#/f/' + fid + '/me' });
    F9.skeleton();
    Promise.all([F9.get(F9.fam(fid)), F9.get(F9.fam(fid, '/timetable/' + cid))]).then(function (a) {
      var core = a[0]; var kid = F9.kidOf(core, cid);
      F9.syncClock(core.now);
      if (!kid) { F9.loadError({ status: 404, message: 'Không tìm thấy con này' }); return; }
      if (!F9.isMgr(core)) { F9.mount([F9.empty('Chỉ chủ gia đình hoặc người quản lý mới nhập thời khóa biểu')]); return; }
      var t = a[1].timetable;
      var st = {
        fid: fid, cid: cid, core: core, kid: kid, day: 1, ai: {}, existing: !!t,
        periods: t ? t.periods.map(function (p) { return { n: p.n, start: p.start, end: p.end }; }) : DEF_PERIODS.map(function (p, i) { return { n: i + 1, start: p[0], end: p[1] }; }),
        cells: {}, start: t ? t.startDate : core.today, until: t && t.untilDate ? t.untilDate : '',
      };
      if (t) t.cells.forEach(function (c) { st.cells[c.weekday + '-' + c.period] = c.subject; });
      draw(st);
    }).catch(function (e) { F9.loadError(e, function () { F9.tkb(fid, cid); }); });
  };

  function hasDay(st, wd) { return st.periods.some(function (p) { return (st.cells[wd + '-' + p.n] || '').trim(); }); }
  function countCells(st) { return Object.keys(st.cells).filter(function (k) { return st.cells[k].trim(); }).length; }

  function draw(st) {
    var core = st.core; var nodes = [];
    nodes.push(h('div', { class: 'row' }, [F9.kidChip(st.kid), h('div', { class: 'col ml muted', text: st.existing ? 'Đã có thời khóa biểu, đang sửa' : 'Chưa có thời khóa biểu' })]));
    if (core.caps.ai) {
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: 'Nhập nhanh từ ảnh' }),
        h('p', { class: 'muted', text: 'Chụp hoặc chọn ảnh thời khóa biểu, AI đọc giúp. Bạn xem lại và sửa từng ô trước khi lưu.' }),
        h('div', { class: 'btn-row' }, [F9.btn('Chọn ảnh thời khóa biểu', 'ghost', function () { aiIntro(st); })]),
      ]));
    }
    var from = h('input', { type: 'date', value: st.start, 'aria-label': 'Áp dụng từ ngày' }); from.addEventListener('change', function () { st.start = from.value; });
    var until = h('input', { type: 'date', value: st.until, 'aria-label': 'Đến hết ngày' }); until.addEventListener('change', function () { st.until = until.value; });
    nodes.push(h('div', { class: 'card' }, [h('div', { class: 'grid2' }, [F9.field('Áp dụng từ ngày', from), F9.field('Đến hết ngày', until)]), h('div', { class: 'hint', text: 'Ví dụ từ đầu đến cuối học kỳ. Để trống ô thứ hai nếu chưa biết.' })]));

    var tabs = h('div', { class: 'wdtabs', role: 'tablist' });
    for (var wd = 1; wd <= 7; wd++) (function (d) {
      tabs.appendChild(h('button', { type: 'button', role: 'tab', class: st.day === d ? 'on' : '', 'aria-selected': st.day === d ? 'true' : 'false', 'aria-label': F9.WD[d] + (hasDay(st, d) ? ', đã có môn' : ''), onclick: function () { st.day = d; draw(st); } }, [F9.WD_SHORT[d], hasDay(st, d) ? h('i') : null]));
    })(wd);
    nodes.push(tabs);
    var card = h('div', { class: 'card' }, [h('div', { class: 'row sb' }, [h('h2', { text: F9.WD[st.day] }), h('button', { class: 'linkbtn', type: 'button', text: 'Giờ các tiết', onclick: function () { periodsSheet(st); } })])]);
    st.periods.forEach(function (p) {
      var key = st.day + '-' + p.n;
      var inp = F9.text({ value: st.cells[key] || '', maxlength: 40, placeholder: 'Môn học', 'data-k': 'c-' + key, 'aria-label': 'Tiết ' + p.n + ' ' + p.start + ' đến ' + p.end + ', ' + F9.WD[st.day] });
      if (st.ai[key]) inp.className += ' ai';
      inp.addEventListener('input', function () { st.cells[key] = inp.value; delete st.ai[key]; inp.classList.remove('ai'); });
      card.appendChild(h('div', { class: 'period' }, [h('div', { class: 'pn' }, ['Tiết ' + p.n, h('small', { text: p.start + '–' + p.end })]), inp]));
    });
    card.appendChild(h('div', { class: 'btn-row' }, [F9.btn('Chép ' + F9.WD[st.day].toLowerCase() + ' sang các thứ khác', 'ghost sm', function () { copySheet(st); })]));
    nodes.push(card);
    if (st.existing) nodes.push(F9.btn('Xóa thời khóa biểu này', 'ghost block', function () {
      F9.confirm({ title: 'Xóa thời khóa biểu?', text: 'Xóa mọi môn học đã tạo từ thời khóa biểu của ' + st.kid.name + ' khỏi lịch.', ok: 'Xóa', danger: true }).then(function (y) {
        if (y) F9.del(F9.fam(st.fid, '/timetable/' + st.cid)).then(function () { F9.dropGate(); F9.toast('Đã xóa thời khóa biểu'); F9.go('#/f/' + st.fid + '/me'); }, F9.fail);
      });
    }));
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    nodes.push(err);
    var save = F9.btn('Lưu thời khóa biểu (' + countCells(st) + ' ô)', 'primary block', function () {
      err.className = 'hint err hidden';
      return F9.busy(save, function () {
        var cells = [];
        Object.keys(st.cells).forEach(function (k) { var s = st.cells[k].trim(); if (s) { var p = k.split('-'); cells.push({ weekday: Number(p[0]), period: Number(p[1]), subject: s }); } });
        return F9.post(F9.fam(st.fid, '/timetable'), { childId: st.cid, startDate: st.start, untilDate: st.until || null, periods: st.periods, cells: cells }, { idem: 'tkb' + st.cid }).then(function (r) {
          F9.dropGate(); F9.toast('Đã lưu: ' + r.created + ' môn lặp theo tuần'); F9.go('#/f/' + st.fid + '/cal');
        }, function (e) { err.textContent = e.message; err.className = 'hint err'; err.scrollIntoView({ block: 'center' }); throw e; });
      });
    });
    F9.mount(nodes);
    F9.setCta(save);
  }

  function periodsSheet(st) {
    F9.sheet('Giờ các tiết học', function (body, close) {
      var rows = st.periods.map(function (p) { return { n: p.n, start: h('input', { type: 'time', value: p.start, 'aria-label': 'Tiết ' + p.n + ' bắt đầu' }), end: h('input', { type: 'time', value: p.end, 'aria-label': 'Tiết ' + p.n + ' kết thúc' }) }; });
      var list = h('div', {});
      function paint() {
        F9.clear(list);
        rows.forEach(function (r) { list.appendChild(h('div', { class: 'period' }, [h('div', { class: 'pn', text: 'Tiết ' + r.n }), r.start, r.end])); });
      }
      paint();
      body.appendChild(list);
      body.appendChild(h('div', { class: 'btn-row' }, [
        F9.btn('+ Thêm tiết', 'ghost sm', function () {
          if (rows.length >= 14) { F9.toast('Tối đa 14 tiết', 'err'); return; }
          var last = rows[rows.length - 1]; var n = rows.length + 1;
          rows.push({ n: n, start: h('input', { type: 'time', value: last ? last.end.value : '13:00', 'aria-label': 'Tiết ' + n + ' bắt đầu' }), end: h('input', { type: 'time', value: last ? addMin(last.end.value, 45) : '13:45', 'aria-label': 'Tiết ' + n + ' kết thúc' }) }); paint();
        }),
        F9.btn('Bớt tiết cuối', 'ghost sm', function () { if (rows.length > 1) { rows.pop(); paint(); } }),
      ]));
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var ok = F9.btn('Xong', 'primary block', function () {
        for (var i = 0; i < rows.length; i++) { if (!rows[i].start.value || !rows[i].end.value || rows[i].end.value <= rows[i].start.value) { err.textContent = 'Tiết ' + rows[i].n + ': giờ kết thúc phải sau giờ bắt đầu'; err.className = 'hint err'; return; } }
        st.periods = rows.map(function (r) { return { n: r.n, start: r.start.value, end: r.end.value }; });
        var maxN = st.periods.length;
        Object.keys(st.cells).forEach(function (k) { if (Number(k.split('-')[1]) > maxN) delete st.cells[k]; });
        close(); draw(st);
      });
      body.appendChild(err); body.appendChild(ok);
    });
  }
  function addMin(t, m) { var p = t.split(':'); var v = Number(p[0]) * 60 + Number(p[1]) + m; if (v >= 1440) v = 1439; return ('0' + Math.floor(v / 60)).slice(-2) + ':' + ('0' + (v % 60)).slice(-2); }

  function copySheet(st) {
    F9.sheet('Chép ' + F9.WD[st.day].toLowerCase() + ' sang…', function (body, close) {
      var days = [1, 2, 3, 4, 5, 6, 7].filter(function (d) { return d !== st.day; });
      var chips = F9.chips(days.map(function (d) { return [d, F9.WD_SHORT[d]]; }), [], null);
      chips.className += ' wd-row';
      var go = F9.btn('Chép', 'primary block', function () {
        var sel = chips.getValue();
        if (!sel.length) { F9.toast('Hãy chọn ít nhất một thứ', 'err'); return; }
        sel.forEach(function (d) { st.periods.forEach(function (p) { var v = st.cells[st.day + '-' + p.n]; if (v && v.trim()) st.cells[d + '-' + p.n] = v; else delete st.cells[d + '-' + p.n]; }); });
        close(); draw(st); F9.toast('Đã chép');
      });
      body.appendChild(h('p', { class: 'muted', text: 'Các môn của ' + F9.WD[st.day].toLowerCase() + ' sẽ thay thế môn đang có ở những thứ bạn chọn.' }));
      body.appendChild(chips); body.appendChild(go);
    });
  }

  // ---------- đọc ảnh bằng AI ----------
  function aiIntro(st) {
    F9.sheet('Đọc thời khóa biểu từ ảnh', function (body, close) {
      var file = h('input', { type: 'file', accept: 'image/*', class: 'offscreen', 'aria-label': 'Chọn ảnh', tabindex: '-1' });
      file.addEventListener('change', function () { if (file.files && file.files[0]) { var f = file.files[0]; file.value = ''; close(); scan(st, f); } });
      body.appendChild(F9.notice('warn', 'Ảnh sẽ được gửi cho dịch vụ AI để đọc', 'Ảnh được gửi cho dịch vụ AI (Google Gemini) chỉ để đọc chữ. 9family không lưu ảnh sau khi xử lý. Đừng chọn ảnh có thông tin cá nhân không liên quan.'));
      body.appendChild(file);
      body.appendChild(h('div', { class: 'btn-row' }, [
        F9.btn('Tôi hiểu, chọn ảnh', 'primary', function () { file.click(); }),
        F9.btn('Thôi', 'ghost', function () { close(); }),
      ]));
    });
  }

  function downscale(file) {
    function draw(src, w, hgt) {
      var max = 1600; var s = Math.min(1, max / Math.max(w, hgt));
      var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(hgt * s));
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    }
    var fail = function () { throw new Error('Không đọc được ảnh này. Hãy thử ảnh khác (JPEG hoặc PNG).'); };
    if (window.createImageBitmap) return createImageBitmap(file).then(function (bm) { var out = draw(bm, bm.width, bm.height); if (bm.close) bm.close(); return out; }).catch(fail);
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () { var img = new Image(); img.onload = function () { resolve(draw(img, img.naturalWidth, img.naturalHeight)); }; img.onerror = function () { reject(new Error('Không đọc được ảnh này. Hãy thử ảnh khác (JPEG hoặc PNG).')); }; img.src = rd.result; };
      rd.onerror = function () { reject(new Error('Không đọc được ảnh này.')); };
      rd.readAsDataURL(file);
    });
  }

  function scan(st, file) {
    var wait = h('div', { class: 'card center' }, [h('div', { class: 'skel' }), h('div', { class: 'b', text: 'Đang đọc ảnh...' }), h('div', { class: 'muted', text: 'Thường mất vài giây.' })]);
    F9.mount([wait]); F9.setCta(null);
    downscale(file).then(function (b64) { return F9.api('POST', F9.fam(st.fid, '/timetable/scan'), { image: b64 }, { timeout: 60000 }); }).then(function (r) {
      draw(st); review(st, r);
    }, function (e) { draw(st); F9.toast(e.message, 'err'); });
  }

  function review(st, r) {
    F9.sheet('Xem lại kết quả đọc ảnh', function (body, close) {
      body.appendChild(F9.notice('info', 'AI có thể đọc sai', 'Bỏ chọn ô sai hoặc sửa chữ trực tiếp. Chỉ các ô được chọn mới đưa vào lưới.'));
      var rows = r.cells.map(function (c) { return { c: c, on: true, input: F9.text({ value: c.subject, maxlength: 40, 'aria-label': F9.WD[c.weekday] + ' tiết ' + c.period }) }; });
      var usePeriods = null;
      if (r.periods.length) {
        usePeriods = h('input', { type: 'checkbox', id: 'usep' }); usePeriods.checked = true;
        body.appendChild(h('label', { class: 'check', for: 'usep' }, [usePeriods, 'Dùng giờ các tiết đọc được (' + r.periods.map(function (p) { return p.n + ': ' + p.start; }).join(', ') + ')']));
      }
      for (var wd = 1; wd <= 7; wd++) {
        var mine = rows.filter(function (x) { return x.c.weekday === wd; });
        if (!mine.length) continue;
        body.appendChild(h('div', { class: 'sec in', text: F9.WD[wd] }));
        mine.forEach(function (x) {
          var cb = h('input', { type: 'checkbox', 'aria-label': 'Dùng ô ' + F9.WD[wd] + ' tiết ' + x.c.period }); cb.checked = true;
          cb.addEventListener('change', function () { x.on = cb.checked; });
          body.appendChild(h('div', { class: 'period' }, [h('label', { class: 'check pn' }, [cb, 'Tiết ' + x.c.period]), x.input]));
        });
      }
      var use = F9.btn('Dùng các ô đã chọn', 'primary block', function () {
        if (usePeriods && usePeriods.checked) {
          r.periods.forEach(function (p) { var ex = st.periods.filter(function (q) { return q.n === p.n; })[0]; if (ex) { ex.start = p.start; ex.end = p.end; } else st.periods.push({ n: p.n, start: p.start, end: p.end }); });
          st.periods.sort(function (a, b) { return a.n - b.n; });
        }
        var n = 0;
        rows.forEach(function (x) {
          var s = x.input.value.trim(); if (!x.on || !s) return;
          if (!st.periods.some(function (p) { return p.n === x.c.period; })) {
            var last = st.periods[st.periods.length - 1]; st.periods.push({ n: x.c.period, start: last ? last.end : '13:00', end: last ? addMin(last.end, 45) : '13:45' });
            st.periods.sort(function (a, b) { return a.n - b.n; });
          }
          var key = x.c.weekday + '-' + x.c.period; st.cells[key] = s; st.ai[key] = true; n++;
        });
        close(); draw(st); F9.toast('Đã đưa ' + n + ' ô vào lưới. Kiểm tra lại rồi bấm Lưu.');
      });
      body.appendChild(use);
    });
  }
})();
