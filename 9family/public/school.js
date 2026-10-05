/* 9family: nhập thông báo của trường. Dán văn bản (luật, không AI) hoặc chụp ảnh/đọc kỹ bằng AI -> MÀN XEM LẠI, sửa từng mục -> mới lưu thành sự kiện/việc.
   Không tự lưu. Không lưu ảnh. Khi gửi cho AI luôn ghi rõ nội dung được gửi đi đâu. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var KINDS = [['event', 'Sự kiện'], ['task', 'Việc cần làm'], ['payment', 'Khoản phải đóng'], ['skip', 'Bỏ qua']];
  var EVENT_KINDS = [['hop_phu_huynh', 'Họp phụ huynh'], ['thi', 'Thi, kiểm tra'], ['hoc', 'Học, ngoại khóa'], ['ngay_quan_trong', 'Nghỉ lễ, ngày quan trọng'], ['khac', 'Khác']];
  var OFFS = [['', 'Không nhắc'], ['1440', 'Nhắc trước 1 ngày'], ['120', 'Nhắc trước 2 giờ'], ['60', 'Nhắc trước 1 giờ'], ['0', 'Nhắc đúng giờ']];
  var textDraft = '';

  F9.school = function (fid) {
    F9.frame({ title: 'Thông báo của trường', back: '#/f/' + fid + '/more', tabs: { fid: fid, tab: 'more' } });
    F9.skeleton('form');
    F9.get(F9.fam(fid)).then(function (core) { F9.syncClock(core.now); F9.setFam(core.family.name); renderInput(fid, core); }, function (e) { F9.loadError(e, function () { F9.school(fid); }); });
  };

  function renderInput(fid, core, errMsg) {
    F9.liveStop(); F9.setFab(null); F9.setCta(null);
    var ai = !!(core.caps && core.caps.ai);
    var canUse = core.me.role !== 'con';
    var nodes = [h('div', {}, [h('h1', { class: 'h1', text: 'Đọc thông báo của trường' }), h('div', { class: 'sub', text: 'Dán tin nhắn Zalo, email hoặc chụp thông báo. Bạn xem lại và sửa trước khi lưu, không có gì tự lưu.' })])];
    if (!canUse) { nodes.push(F9.notice('info', 'Chỉ dành cho người lớn', 'Tài khoản của con không nhập thông báo trường.')); F9.mount(nodes); return; }
    var ta = h('textarea', { class: 'school-ta', rows: '7', maxlength: '8000', placeholder: 'Ví dụ: Nhà trường họp phụ huynh lúc 7h30 ngày 12/10 tại phòng học lớp 3A. Phụ huynh đóng quỹ lớp 300.000đ trước ngày 10/10.', 'aria-label': 'Nội dung thông báo', 'data-k': 'school-text' });
    ta.value = textDraft;
    ta.addEventListener('input', function () { textDraft = ta.value; });
    var err = h('div', { class: 'hint err' + (errMsg ? '' : ' hidden'), role: 'alert', text: errMsg || '' });
    var read = F9.btn('Đọc thông báo', 'primary block', function () {
      var t = ta.value.trim();
      if (!t) { ta.focus(); return; }
      return F9.busy(read, function () {
        return F9.post(F9.fam(fid, '/school/extract'), { text: t, mode: 'rules' }, { timeout: 30000 }).then(function (r) { renderReview(fid, core, r, t); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
      });
    });
    nodes.push(h('div', { class: 'card' }, [F9.field('Nội dung thông báo', ta, 'Đọc bằng quy tắc ngay trên máy chủ, không dùng AI, không lưu văn bản.'), err, read]));
    if (ai) {
      var aiBtn = F9.btn('Đọc kỹ hơn bằng AI', 'ghost block', function () { aiConfirm(fid, core, 'text', ta); });
      var file = h('input', { type: 'file', accept: 'image/*', class: 'hidden', 'aria-label': 'Chọn ảnh thông báo' });
      file.addEventListener('change', function () { if (file.files && file.files[0]) { var f = file.files[0]; file.value = ''; aiConfirm(fid, core, 'image', ta, f); } });
      var cam = F9.btn('Chụp hoặc chọn ảnh thông báo', 'ghost block', function () { file.click(); });
      nodes.push(h('div', { class: 'card flat' }, [
        h('div', { class: 'b', text: 'Dùng AI (Google Gemini)' }),
        h('p', { class: 'muted small', text: 'Dành cho văn bản phức tạp hoặc ảnh chụp. Nội dung bạn chọn sẽ được gửi tới dịch vụ AI của Google để đọc. 9family không lưu văn bản và không lưu ảnh. Có giới hạn số lần mỗi ngày.' }),
        aiBtn, cam, file,
      ]));
    } else {
      nodes.push(h('p', { class: 'muted small', text: 'Đọc ảnh chụp thông báo bằng AI chưa được bật trên máy chủ này. Bạn vẫn dán văn bản để đọc bằng quy tắc.' }));
    }
    F9.mount(nodes);
  }

  function aiConfirm(fid, core, kind, ta, file) {
    var t = ta.value.trim();
    if (kind === 'text' && !t) { ta.focus(); F9.toast('Hãy dán văn bản trước', 'err'); return; }
    F9.sheet(kind === 'image' ? 'Gửi ảnh cho AI?' : 'Gửi văn bản cho AI?', function (body, close) {
      body.appendChild(F9.notice('warn', kind === 'image' ? 'Ảnh sẽ được gửi tới Google Gemini' : 'Văn bản sẽ được gửi tới Google Gemini', 'Dùng để đọc thông báo. 9family không lưu ' + (kind === 'image' ? 'ảnh' : 'văn bản') + ' sau khi đọc xong. Hãy che thông tin nhạy cảm (số điện thoại, tài khoản) trước khi gửi nếu có.'));
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var go = F9.btn('Đồng ý, gửi để đọc', 'primary block', function () {
        return F9.busy(go, function () {
          var p = kind === 'image' ? downscale(file).then(function (b64) { return { image: b64, text: t || undefined }; }) : Promise.resolve({ text: t });
          return p.then(function (payload) { return F9.post(F9.fam(fid, '/school/extract'), Object.assign({ mode: 'ai' }, payload), { timeout: 70000 }); }).then(function (r) { close(); renderReview(fid, core, r, t); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(err); body.appendChild(go); body.appendChild(F9.btn('Không gửi', 'ghost block', close));
    });
  }
  function downscale(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error('Không đọc được ảnh')); };
      rd.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Ảnh không hợp lệ')); };
        img.onload = function () {
          var max = 1600; var s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }

  // ---------- màn xem lại ----------
  function money(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ'; }

  function renderReview(fid, core, r, source) {
    F9.liveStop(); F9.setFab(null);
    var kids = core.children;
    var items = r.items.map(function (it, i) {
      return {
        uid: i, kind: it.type === 'note' ? 'skip' : it.type, include: it.type !== 'note', title: it.title || '', day: it.day || '', endDay: it.endDay || '', allDay: it.allDay !== false && !it.start, start: it.start || '', end: it.end || '',
        location: it.location || '', amount: it.amount || '', due: it.due || '', evKind: it.kind || 'khac', childIds: (it.childIds || []).slice(), offset: it.notifyOffsets && it.notifyOffsets.length ? String(it.notifyOffsets[0]) : (it.type === 'event' ? '1440' : ''),
        evidence: it.evidence || '', note: it.note || '', confidence: it.confidence, missing: it.missing || [], recType: it.recType || 'none', error: '', saved: false,
      };
    });
    var nodes = [];
    var box = h('div', { class: 'rv-list' });
    var save = F9.btn('', 'primary block', function () { return doSave(); });
    function counts() { var n = items.filter(function (x) { return x.include && x.kind !== 'skip' && !x.saved; }).length; save.textContent = n ? 'Lưu ' + n + ' mục' : 'Không có mục nào để lưu'; save.disabled = !n; }

    function card(it) {
      var c = h('div', { class: 'card rv-card' + (it.include && it.kind !== 'skip' ? '' : ' off') + (it.saved ? ' saved' : '') }, []);
      var inc = h('input', { type: 'checkbox', class: 'cb', 'aria-label': 'Lưu mục này' }); inc.checked = it.include && it.kind !== 'skip';
      inc.addEventListener('change', function () { it.include = inc.checked; if (inc.checked && it.kind === 'skip') it.kind = 'event'; redraw(); });
      var head = h('div', { class: 'rv-head' }, [
        h('label', { class: 'cb-wrap' }, [inc, h('span', { class: 'cb-t', text: it.saved ? 'Đã lưu' : 'Lưu' })]),
        it.confidence === 'thap' ? F9.chip('Cần kiểm tra', 'warn') : it.confidence === 'cao' ? F9.chip('Rõ ràng', 'ok') : F9.chip('Nên kiểm tra'),
      ]);
      c.appendChild(head);
      if (it.saved) { c.appendChild(h('div', { class: 'b', text: it.title })); return c; }
      var kind = F9.select(KINDS, it.kind, { 'aria-label': 'Loại' });
      kind.addEventListener('change', function () { it.kind = kind.value; if (it.kind !== 'skip') it.include = true; redraw(); });
      c.appendChild(F9.field('Loại', kind));
      if (it.kind === 'skip') { c.appendChild(h('div', { class: 'ev-sub', text: it.evidence })); return c; }
      var title = F9.text({ value: it.title, maxlength: 80 }); title.addEventListener('input', function () { it.title = title.value; });
      c.appendChild(F9.field(it.kind === 'payment' ? 'Khoản phải đóng' : it.kind === 'task' ? 'Việc cần làm' : 'Tên sự kiện', title));
      var miss = function (k) { return it.missing.indexOf(k) >= 0 && !(k === 'ngày' ? it.day : k === 'hạn' ? it.due : k === 'giờ' ? it.start : k === 'số tiền' ? it.amount : true); };
      if (it.kind === 'event') {
        var kd = F9.select(EVENT_KINDS, it.evKind); kd.addEventListener('change', function () { it.evKind = kd.value; });
        c.appendChild(F9.field('Loại sự kiện', kd));
        var day = h('input', { type: 'date', value: it.day, 'aria-label': 'Ngày' }); day.addEventListener('change', function () { it.day = day.value; });
        c.appendChild(F9.field('Ngày' + (miss('ngày') ? ' (cần điền)' : ''), day));
        if (it.endDay) {
          var ed = h('input', { type: 'date', value: it.endDay, 'aria-label': 'Đến hết ngày' }); ed.addEventListener('change', function () { it.endDay = ed.value; });
          c.appendChild(F9.field('Đến hết ngày (nghỉ nhiều ngày)', ed));
        }
        var ad = F9.switchRow('Cả ngày', null, it.allDay, function (on) { it.allDay = on; redraw(); });
        c.appendChild(ad);
        if (!it.allDay) {
          var st = h('input', { type: 'time', value: it.start, 'aria-label': 'Giờ bắt đầu' }); st.addEventListener('change', function () { it.start = st.value; });
          var en = h('input', { type: 'time', value: it.end, 'aria-label': 'Giờ kết thúc' }); en.addEventListener('change', function () { it.end = en.value; });
          c.appendChild(h('div', { class: 'two' }, [F9.field('Giờ bắt đầu', st), F9.field('Kết thúc (không bắt buộc)', en)]));
        }
        var loc = F9.text({ value: it.location, maxlength: 100, placeholder: 'Địa điểm (không bắt buộc)' }); loc.addEventListener('input', function () { it.location = loc.value; });
        c.appendChild(F9.field('Địa điểm', loc));
        var off = F9.select(OFFS, it.offset); off.addEventListener('change', function () { it.offset = off.value; });
        c.appendChild(F9.field('Nhắc', off));
      } else {
        if (it.kind === 'payment') {
          var am = h('input', { type: 'text', inputmode: 'numeric', value: it.amount ? String(it.amount) : '', placeholder: 'Số tiền (đồng)', 'aria-label': 'Số tiền' });
          am.addEventListener('input', function () { var n = parseInt(am.value.replace(/\D/g, ''), 10); it.amount = isFinite(n) ? n : ''; });
          c.appendChild(F9.field('Số tiền (đồng)' + (miss('số tiền') ? ' (cần điền)' : ''), am, it.amount ? 'Hiện: ' + money(it.amount) : null));
        }
        var due = h('input', { type: 'date', value: it.due, 'aria-label': 'Hạn' }); due.addEventListener('change', function () { it.due = due.value; });
        c.appendChild(F9.field('Hạn' + (miss('hạn') ? ' (cần điền)' : ' (không bắt buộc)'), due, 'Đến hạn sẽ nhắc người được giao lúc 7 giờ sáng.'));
      }
      if (kids.length) {
        c.appendChild(h('div', { class: 'field' }, [h('label', { text: 'Cho con nào' }), F9.chips(kids.map(function (k) { return [k.id, k.name, 'c-' + k.color]; }), it.childIds, function (v) { it.childIds = v; })]));
      }
      if (it.evidence) c.appendChild(h('div', { class: 'evid' }, [h('span', { class: 'muted small', text: 'Trong thông báo: ' }), h('span', { class: 'small', text: '“' + it.evidence + '”' })]));
      if (it.note) c.appendChild(h('div', { class: 'small warn-t', text: it.note }));
      if (it.error) c.appendChild(h('div', { class: 'hint err', role: 'alert', text: it.error }));
      return c;
    }
    function redraw() { F9.clear(box); items.forEach(function (it) { box.appendChild(card(it)); }); counts(); }

    nodes.push(h('div', {}, [h('h1', { class: 'h1', text: 'Xem lại trước khi lưu' }), h('div', { class: 'sub', text: r.mode === 'ai' ? 'Đọc bằng AI' + (r.sentImage ? ' (đã gửi ảnh, không lưu ảnh)' : ' (đã gửi văn bản)') : 'Đọc bằng quy tắc, không dùng AI' })]));
    nodes.push(F9.notice('info', 'Chưa có gì được lưu', 'Kiểm tra từng mục, sửa nếu sai, bỏ tích mục không cần. Chỉ khi bấm Lưu mới tạo sự kiện và việc.'));
    (r.warnings || []).forEach(function (w) { nodes.push(F9.notice('warn', 'Lưu ý', w)); });
    if (!items.length) nodes.push(F9.empty('Không tìm thấy mục nào', 'Bạn thử dán thêm chi tiết, hoặc thêm thủ công.', null, 'info'));
    nodes.push(box);
    var back = F9.btn('Đọc thông báo khác', 'ghost block', function () { renderInput(fid, core); });
    nodes.push(h('div', { class: 'btn-row' }, [back]));
    F9.mount(nodes);
    redraw();
    F9.setCta(h('div', { class: 'cta-in' }, [save]));

    function validate(it) {
      if (!it.title.trim()) return 'Hãy nhập tên';
      if (it.kind === 'event') {
        if (!it.day) return 'Hãy chọn ngày';
        if (!it.allDay && !it.start) return 'Hãy chọn giờ bắt đầu, hoặc bật "Cả ngày"';
        if (!it.allDay && it.end && it.end <= it.start) return 'Giờ kết thúc phải sau giờ bắt đầu';
        if (it.endDay && it.endDay < it.day) return 'Ngày kết thúc phải sau ngày đầu';
      }
      return '';
    }
    function bodyOf(it) {
      if (it.kind === 'event') {
        var multi = it.endDay && it.endDay > it.day;
        return ['events', {
          title: it.title.trim(), kind: it.evKind, location: it.location.trim(), note: '', allDay: !!it.allDay, startDate: it.day, start: it.allDay ? undefined : it.start, end: it.allDay || !it.end ? undefined : it.end,
          recType: multi ? 'daily' : 'none', untilDate: multi ? it.endDay : undefined, notifyOffsets: it.offset === '' ? [] : [Number(it.offset)], childIds: it.childIds,
        }];
      }
      var t = it.kind === 'payment' && it.amount ? it.title.trim() + ' ' + money(it.amount) : it.title.trim();
      return ['tasks', { title: t.slice(0, 100), due: it.due || null }];
    }
    function doSave() {
      var todo = items.filter(function (x) { return x.include && x.kind !== 'skip' && !x.saved; });
      var bad = false;
      todo.forEach(function (it) { it.error = validate(it); if (it.error) bad = true; });
      if (bad) { redraw(); F9.toast('Có mục cần sửa trước khi lưu', 'err'); return; }
      return F9.busy(save, function () {
        var okN = 0; var chain = Promise.resolve();
        todo.forEach(function (it) {
          chain = chain.then(function () {
            var b = bodyOf(it);
            return F9.post(F9.fam(fid, '/' + b[0]), b[1], { idem: 'school' + it.uid + F9.rid().slice(0, 4) }).then(function () { it.saved = true; it.error = ''; okN++; }, function (e) { it.error = e.message; });
          });
        });
        return chain.then(function () {
          F9.dropGate(); redraw();
          var left = items.filter(function (x) { return x.include && x.kind !== 'skip' && !x.saved; }).length;
          if (!left) { F9.toast('Đã lưu ' + okN + ' mục vào lịch và việc chung'); textDraft = ''; F9.setCta(h('div', { class: 'cta-in' }, [F9.link('#/f/' + fid + '/cal', { class: 'btn primary block' }, ['Xem lịch']), F9.link('#/f/' + fid + '/tasks', { class: 'btn ghost block' }, ['Xem việc chung'])])); }
          else F9.toast('Đã lưu ' + okN + ' mục, còn ' + left + ' mục lỗi. Sửa rồi lưu lại.', 'err');
        });
      });
    }
  }
})();
