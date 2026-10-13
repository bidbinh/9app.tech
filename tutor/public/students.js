/* 9tutor: danh sách học sinh, hồ sơ học sinh, biểu mẫu học sinh, lịch lặp */
(function () {
  'use strict';
  var T9 = window.T9; var h = T9.h;

  var GRADES = ['Mầm non'].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return 'Lớp ' + n; }), ['Luyện thi đại học', 'Đại học', 'Người đi làm']);
  var SUBJECTS = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Tin học', 'Tiếng Việt', 'IELTS', 'Piano', 'Vẽ'];

  T9.intl = function (p) {
    var d = String(p || '').replace(/\D/g, '');
    if (!d) return '';
    if (String(p).charAt(0) === '+') return d;
    if (d.indexOf('84') === 0 && d.length >= 11) return d;
    if (d.charAt(0) === '0') return '84' + d.slice(1);
    return d;
  };
  T9.balanceChip = function (b) {
    if (b > 0) return T9.chip('Nợ ' + T9.vnd(b), 'bad');
    if (b < 0) return T9.chip('Đóng trước ' + T9.vnd(-b), 'info');
    return T9.chip('Đã đóng đủ', 'ok');
  };
  var MODEL_LABEL = { buoi: 'Theo buổi', thang: 'Theo tháng', goi: 'Theo gói' };
  T9.feeText = function (s) {
    if (s.feeModel === 'buoi') return T9.vnd(s.feeAmount) + ' mỗi buổi';
    if (s.feeModel === 'thang') return T9.vnd(s.feeAmount) + ' mỗi tháng';
    return 'Gói ' + s.packageSessions + ' buổi: ' + T9.vnd(s.feeAmount);
  };

  // ---------- biểu mẫu học sinh (thêm / sửa) ----------
  T9.studentForm = function (s, onSaved) {
    T9.sheet(s ? 'Sửa thông tin' : 'Thêm học sinh', function (body, close) {
      var name = T9.text({ maxlength: 60, placeholder: 'Họ tên học sinh', value: s ? s.name : '' });
      var grade = h('select', {}, [h('option', { value: '', text: 'Chọn lớp' })].concat((s && s.grade && GRADES.indexOf(s.grade) < 0 ? [s.grade] : []).concat(GRADES).map(function (g) { return h('option', { value: g, text: g }); })));
      grade.value = s ? s.grade : '';
      var dl = h('datalist', { id: 'subjlist' }, SUBJECTS.map(function (x) { return h('option', { value: x }); }));
      var subject = T9.text({ maxlength: 60, list: 'subjlist', placeholder: 'Ví dụ: Toán', value: s ? s.subject : '' });
      var pname = T9.text({ maxlength: 60, placeholder: 'Tên phụ huynh (tùy chọn)', value: s ? s.parentName : '' });
      var pphone = T9.text({ type: 'tel', inputmode: 'tel', maxlength: 24, placeholder: '09xx xxx xxx', value: s ? s.parentPhone : '' });
      var pzalo = T9.text({ type: 'tel', inputmode: 'tel', maxlength: 24, placeholder: 'Để trống nếu cùng số điện thoại', value: s ? s.parentZalo : '' });
      var model = s ? s.feeModel : (T9.store('feeModel') || 'buoi');
      var amount = T9.money({ value: s && s.feeAmount ? String(s.feeAmount) : '' });
      var pk = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 200, value: s && s.packageSessions ? s.packageSessions : 10 });
      var note = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Mục tiêu, điểm yếu, lưu ý riêng...' }); note.value = s ? s.note : '';
      var amountField = h('div'); var pkField = h('div');
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Cách tính học phí' }, ['buoi', 'thang', 'goi'].map(function (m) {
        return h('button', { type: 'button', class: model === m ? 'on' : '', text: MODEL_LABEL[m], onclick: function () { model = m; sync(); } });
      }));
      function sync() {
        [].forEach.call(seg.children, function (b, i) { b.classList.toggle('on', ['buoi', 'thang', 'goi'][i] === model); });
        T9.clear(amountField); T9.clear(pkField);
        amountField.appendChild(T9.field(model === 'buoi' ? 'Học phí mỗi buổi (đ)' : model === 'thang' ? 'Học phí mỗi tháng (đ)' : 'Giá cả gói (đ)', amount, 'Gõ 200000 hoặc 200k'));
        if (model === 'goi') pkField.appendChild(T9.field('Số buổi của gói', pk));
      }
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = T9.btn(s ? 'Lưu' : 'Thêm học sinh', 'primary block', function () {
        err.className = 'hint err hidden';
        var fee = amount.value.trim() ? T9.parseMoney(amount.value) : 0;
        if (!name.value.trim()) { showErr('Hãy nhập tên học sinh'); return; }
        if (isNaN(fee) || fee < 0 || fee > 100000000) { showErr('Học phí chưa đúng. Ví dụ: 200000 hoặc 200k'); return; }
        var pks = parseInt(pk.value, 10);
        if (model === 'goi' && !(pks >= 1 && pks <= 200)) { showErr('Số buổi của gói từ 1 đến 200'); return; }
        var data = { name: name.value, grade: grade.value, subject: subject.value, parentName: pname.value, parentPhone: pphone.value, parentZalo: pzalo.value, note: note.value, feeModel: model, feeAmount: fee, packageSessions: model === 'goi' ? pks : 0 };
        return T9.busy(save, function () {
          return (s ? T9.post('api/students/' + s.id, data) : T9.post('api/students', data, { idem: 'student-new' })).then(function (r) {
            T9.store('feeModel', model); close(); T9.toast(s ? 'Đã lưu' : 'Đã thêm học sinh'); if (onSaved) onSaved(r.student); else T9.refresh(true);
          }, function (e) { showErr(e.message); });
        });
      });
      function showErr(m) { err.textContent = m; err.className = 'hint err'; }
      body.appendChild(h('form', { onsubmit: function (e) { e.preventDefault(); save.click(); } }, [
        T9.field('Tên học sinh', name), h('div', { class: 'grid2' }, [T9.field('Lớp', grade), T9.field('Môn', subject)]), dl,
        T9.field('Phụ huynh', pname), T9.field('Số điện thoại phụ huynh', pphone), T9.field('Số Zalo (nếu khác)', pzalo),
        h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Cách tính học phí' }), seg]), amountField, pkField,
        T9.field('Ghi chú', note), err, h('div', { class: 'btn-row' }, [save]),
      ]));
      sync();
    });
  };

  // ---------- danh sách học sinh ----------
  T9.students = function () {
    T9.frame({ title: 'Học sinh', tab: 'hs', right: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Thêm học sinh', onclick: function () { T9.studentForm(null, function (s) { T9.go('#/hs/' + s.id); }); } }, [T9.ico('plus', 24)])] });
    T9.skeleton();
    var q = '';
    var showOld = false;
    T9.live({ fetch: function () { return T9.get('api/students'); }, render: render, every: 40000 }).catch(function (e) { T9.loadError(e, T9.students); });
    function render(d) {
      var act = d.students.filter(function (s) { return s.active; }); var old = d.students.filter(function (s) { return !s.active; });
      var nodes = [];
      if (!d.students.length) {
        nodes.push(T9.empty('Chưa có học sinh', 'Thêm học sinh đầu tiên để bắt đầu xếp lịch và theo dõi học phí.', h('div', { class: 'btn-row center' }, [T9.btn('Thêm học sinh', 'primary', function () { T9.studentForm(null, function (s) { T9.go('#/hs/' + s.id); }); })])));
        T9.mount(nodes); return;
      }
      var owed = act.reduce(function (a, s) { return a + Math.max(0, s.balance); }, 0);
      nodes.push(h('div', { class: 'row sb sumline' }, [h('span', { class: 'muted', text: act.length + ' học sinh đang dạy' }), owed ? h('span', { class: 'warn-t', text: 'Còn phải thu ' + T9.vnd(owed) }) : h('span', { class: 'muted', text: 'Không ai còn nợ' })]));
      if (act.length > 7) {
        var search = h('input', { type: 'search', class: 'search', placeholder: 'Tìm theo tên', 'aria-label': 'Tìm học sinh', value: q, 'data-k': 'q', oninput: function (e) { q = e.target.value; list(); } });
        nodes.push(search);
      }
      var box = h('div', { class: 'cards' });
      function list() {
        T9.clear(box);
        var n = T9.norm(q);
        act.filter(function (s) { return !n || T9.norm(s.name).indexOf(n) >= 0; }).forEach(function (s) { box.appendChild(card(s)); });
      }
      list(); nodes.push(box);
      if (old.length) {
        nodes.push(h('button', { type: 'button', class: 'linkbtn', text: (showOld ? 'Ẩn' : 'Hiện') + ' học sinh đã nghỉ (' + old.length + ')', onclick: function () { showOld = !showOld; render(d); } }));
        if (showOld) nodes.push(h('div', { class: 'cards' }, old.map(card)));
      }
      T9.mount(nodes);
    }
    function card(s) {
      var nxt = s.next ? 'Buổi tới: ' + T9.DOW_SHORT[T9.isoDow(s.next.day)] + ' ' + T9.dm(s.next.day) + ' ' + T9.hhmm(s.next.startMin) : (s.active ? 'Chưa có lịch' : 'Đã nghỉ');
      return T9.link('#/hs/' + s.id, { class: 'card row-card' + (s.active ? '' : ' dim') }, [
        h('div', { class: 'avatar' }, [T9.initial(s.name)]),
        h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: s.name }), h('div', { class: 'muted small trunc', text: [s.grade, s.subject].filter(Boolean).join(' · ') || 'Chưa nhập lớp, môn' }), h('div', { class: 'muted small trunc', text: nxt })]),
        h('div', { class: 'right' }, [T9.balanceChip(s.balance), s.pkgLeft !== null && s.pkgLeft !== undefined && s.feeModel === 'goi' ? h('div', { class: 'small ' + (s.pkgLeft <= 1 ? 'warn-t' : 'muted'), text: 'Gói còn ' + s.pkgLeft + ' buổi' }) : null]),
      ]);
    }
  };
  T9.norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim(); };

  // ---------- lịch lặp ----------
  function slotSheet(st, onDone) {
    T9.sheet('Thêm lịch dạy hằng tuần', function (body, close) {
      var wd = null;
      var chips = h('div', { class: 'optchips', role: 'group', 'aria-label': 'Thứ trong tuần' }, [1, 2, 3, 4, 5, 6, 7].map(function (n) {
        return h('button', { type: 'button', class: 'optchip', text: T9.DOW_SHORT[n], 'aria-pressed': 'false', onclick: function () { wd = n; [].forEach.call(chips.children, function (c, i) { c.classList.toggle('on', i + 1 === n); c.setAttribute('aria-pressed', i + 1 === n ? 'true' : 'false'); }); } });
      }));
      var t = h('input', { type: 'time', value: T9.store('lastTime') || '18:00', step: 300 }); var dur = T9.durationSelect(); var loc = T9.text({ maxlength: 80, placeholder: 'Nhà học sinh, online...' });
      var from = h('input', { type: 'date', value: T9._today || '' });
      var go = T9.btn('Thêm lịch', 'primary block', function () {
        var sm = T9.minOf(t.value);
        if (!wd) { T9.toast('Hãy chọn thứ trong tuần', 'err'); return; }
        if (isNaN(sm)) { T9.toast('Hãy chọn giờ bắt đầu', 'err'); return; }
        return T9.busy(go, function () {
          return T9.tryOverlap(function (allow) { return T9.post('api/students/' + st.id + '/slots', { weekday: wd, startMin: sm, durationMin: +dur.value, location: loc.value, validFrom: from.value || undefined, allowOverlap: allow }); }).then(function (r) {
            if (!r) return; T9.store('lastTime', t.value); T9.store('dur', +dur.value); close(); T9.toast('Đã thêm lịch'); onDone();
          });
        });
      });
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Thứ' }), chips]));
      body.appendChild(T9.field('Giờ bắt đầu', t)); body.appendChild(T9.field('Thời lượng', dur, 'Một buổi học không được kéo qua nửa đêm.')); body.appendChild(T9.field('Nơi dạy (tùy chọn)', loc));
      body.appendChild(T9.field('Bắt đầu từ ngày', from, 'Chọn ngày trong quá khứ nếu muốn ghi bù các buổi đã dạy.'));
      body.appendChild(h('div', { class: 'btn-row' }, [go]));
    });
  }

  // ---------- hồ sơ học sinh ----------
  T9.student = function (id) {
    T9.frame({ title: 'Học sinh', back: '#/hs', tab: 'hs' });
    T9.skeleton();
    T9.live({ fetch: function () { return T9.get('api/students/' + id); }, render: render, every: 30000 }).catch(function (e) { T9.loadError(e, function () { T9.student(id); }); });
    function render(d) {
      var s = d.student; var onChange = function () { T9.refresh(true); };
      T9.frame({ title: s.name, back: '#/hs', tab: 'hs', right: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sửa thông tin', onclick: function () { T9.studentForm(s, onChange); } }, [T9.ico('edit', 22)])] });
      var zalo = T9.intl(s.parentZalo || s.parentPhone);
      var nodes = [];
      nodes.push(h('div', { class: 'card' }, [
        h('div', { class: 'row' }, [h('div', { class: 'avatar' }, [T9.initial(s.name)]), h('div', { class: 'col' }, [h('div', { class: 'big trunc', text: s.name }), h('div', { class: 'muted', text: [s.grade, s.subject].filter(Boolean).join(' · ') || 'Chưa nhập lớp, môn' }), !s.active ? T9.chip('Đã nghỉ', 'warn') : null])]),
        h('div', { class: 'kv' }, [
          kv('Phụ huynh', s.parentName || 'Chưa nhập'), kv('Điện thoại', s.parentPhone || 'Chưa nhập'), kv('Học phí', T9.feeText(s)),
        ]),
        s.note ? h('p', { class: 'pre muted small', text: s.note }) : null,
        (s.parentPhone || zalo) ? h('div', { class: 'btn-row' }, [
          s.parentPhone ? h('a', { class: 'btn ghost sm', href: 'tel:' + s.parentPhone }, [T9.ico('phone', 18), 'Gọi']) : null,
          zalo ? h('a', { class: 'btn ghost sm', href: 'https://zalo.me/' + zalo, target: '_blank', rel: 'noopener noreferrer' }, [T9.ico('chat', 18), 'Zalo']) : null,
        ]) : null,
      ]));

      // tiền
      var bal = s.balance;
      nodes.push(h('div', { class: 'card' }, [
        h('div', { class: 'row sb' }, [h('h2', { text: 'Học phí' }), T9.balanceChip(bal)]),
        h('div', { class: 'kv' }, [kv('Tổng học phí đến nay', T9.vnd(s.total)), kv('Đã thu', T9.vnd(s.paid)), kv(bal >= 0 ? 'Còn lại' : 'Đóng trước', T9.vnd(Math.abs(bal)), bal > 0 ? 'bad-t' : '')]),
        s.feeModel === 'goi' || (s.pkgLeft !== null && s.pkgLeft !== undefined && s.pkgLeft !== 0) ? h('div', { class: 'hint ' + (s.pkgLeft <= 1 ? 'warn-t' : ''), text: 'Gói còn ' + s.pkgLeft + ' buổi' + (s.pkgLeft < 0 ? ' (đã dạy vượt gói)' : '') }) : null,
        h('div', { class: 'btn-row' }, [
          T9.btn('Thu tiền', 'primary', function () { T9.paymentSheet(s, onChange); }),
          T9.btn('Nhắc phụ huynh', 'ghost', function () { T9.reminderSheet(s, onChange); }),
        ]),
        h('div', { class: 'btn-row' }, [T9.btn('Thêm khoản phải thu', 'ghost sm', function () { T9.chargeSheet(s, onChange); })]),
      ]));

      // báo cáo phụ huynh
      nodes.push(h('div', { class: 'card' }, [
        h('div', { class: 'row sb' }, [h('h2', { text: 'Báo cáo cho phụ huynh' }), d.link ? T9.chip('Đang chia sẻ', 'ok') : T9.chip('Chưa tạo', '')]),
        h('p', { class: 'muted', text: d.link ? 'Phụ huynh mở liên kết là xem được lịch học, chuyên cần' + (d.link.showComments ? ' và nhận xét' : '') + (d.link.showFee ? ', học phí' : '') + '. Đã xem ' + d.link.views + ' lần.' : 'Tạo một liên kết chỉ xem để gửi qua Zalo. Không cần đăng nhập, thu hồi được bất cứ lúc nào.' }),
        h('div', { class: 'btn-row' }, [T9.btn(d.link ? 'Quản lý liên kết' : 'Tạo liên kết', d.link ? 'ghost' : 'primary', function () { T9.linkSheet(s, d.link, onChange); })]),
      ]));

      // lịch lặp
      nodes.push(h('div', { class: 'card' }, [
        h('div', { class: 'row sb' }, [h('h2', { text: 'Lịch dạy hằng tuần' }), s.active ? T9.btn('Thêm', 'ghost sm', function () { slotSheet(s, onChange); }) : T9.chip('Tạm dừng', 'warn')]),
        d.slots.length ? h('ul', { class: 'plain' }, d.slots.map(function (sl) {
          return h('li', { class: 'row sb' }, [
            h('div', { class: 'col' }, [h('span', { class: 'b', text: T9.DOW[sl.weekday] }), ' ', T9.timeRange(sl.startMin, sl.durationMin), sl.location ? h('div', { class: 'muted small', text: sl.location }) : null]),
            h('button', { type: 'button', class: 'linkbtn danger-t', text: 'Dừng', 'aria-label': 'Dừng lịch ' + T9.DOW[sl.weekday], onclick: function () {
              T9.confirm({ title: 'Dừng lịch này?', text: 'Các buổi từ hôm nay trở đi chưa ghi chép sẽ bị gỡ. Lịch sử giữ nguyên.', ok: 'Dừng lịch', danger: true }).then(function (y) { if (y) T9.del('api/slots/' + sl.id).then(onChange, T9.fail); });
            } }),
          ]);
        })) : h('p', { class: 'muted', text: s.active ? 'Chưa có lịch lặp. Thêm lịch để buổi học tự hiện mỗi tuần, hoặc thêm buổi lẻ.' : 'Lịch lặp được giữ nhưng đang tạm dừng vì học sinh đã nghỉ; khôi phục học sinh thì lịch chạy lại.' }),
        s.active ? h('div', { class: 'btn-row' }, [T9.btn('Thêm buổi lẻ', 'ghost sm', function () { T9.addLessonSheet(T9._today || new Date().toISOString().slice(0, 10), onChange); })]) : null,
      ]));

      // buổi học
      var up = d.lessons.filter(function (l) { return l.status === 'du_kien' && l.day >= (T9._today || ''); }).sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : a.startMin - b.startMin; }).slice(0, 5);
      var past = d.lessons.filter(function (l) { return up.indexOf(l) < 0 && !(l.status === 'du_kien' && l.day >= (T9._today || '')); }).slice(0, 15);
      if (up.length) { nodes.push(h('div', { class: 'sec', text: 'Sắp tới' })); nodes.push(h('div', { class: 'lcards' }, up.map(function (l) { return dayCard(l, onChange); }))); }
      if (past.length) { nodes.push(h('div', { class: 'sec', text: 'Các buổi gần đây' })); nodes.push(h('div', { class: 'lcards' }, past.map(function (l) { return dayCard(l, onChange); }))); }

      // sổ thu
      var entries = d.charges.map(function (c) { return { t: 'c', date: c.onDate, c: c }; }).concat(d.payments.map(function (p) { return { t: 'p', date: p.paidOn, p: p }; })).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      if (entries.length) {
        nodes.push(h('div', { class: 'sec', text: 'Sổ thu' }));
        nodes.push(h('div', { class: 'card' }, [h('ul', { class: 'plain' }, entries.slice(0, 30).map(function (e) {
          var isP = e.t === 'p'; var x = isP ? e.p : e.c;
          var label = isP ? 'Đã thu' + (x.method === 'tm' ? ' (tiền mặt)' : ' (chuyển khoản)') : e.c.kind === 'thang' ? 'Học phí ' + T9.monthLabel(e.c.period).toLowerCase() : e.c.kind === 'goi' ? 'Bán gói ' + e.c.sessions + ' buổi' : 'Khoản khác';
          return h('li', { class: 'row sb' }, [
            h('div', { class: 'col' }, [h('div', { class: 'b', text: label }), h('div', { class: 'muted small', text: T9.dmy(e.date) + (x.note ? ' · ' + x.note : '') })]),
            h('div', { class: 'right' }, [h('div', { class: 'b ' + (isP ? 'ok-t' : ''), text: (isP ? '+ ' : '') + T9.vnd(x.amount) }),
              h('button', { type: 'button', class: 'linkbtn danger-t small', text: 'Xóa', 'aria-label': 'Xóa khoản này', onclick: function () {
                T9.confirm({ title: 'Xóa khoản này?', text: label + ' ' + T9.vnd(x.amount) + '. Số còn nợ sẽ được tính lại.', ok: 'Xóa', danger: true }).then(function (y) { if (y) T9.del(isP ? 'api/payments/' + x.id : 'api/charges/' + x.id).then(onChange, T9.fail); });
              } })]),
          ]);
        }))]));
      }

      // quản lý hồ sơ
      nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Quản lý hồ sơ' }), h('div', { class: 'btn-row' }, [
        T9.btn(s.active ? 'Ngừng dạy (lưu trữ)' : 'Khôi phục học sinh', 'ghost', function () {
          if (!s.active) { T9.post('api/students/' + s.id + '/archive', { active: true }).then(function () { T9.toast('Đã khôi phục'); onChange(); }, T9.fail); return; }
          T9.confirm({ title: 'Ngừng dạy học sinh này?', text: 'Lịch hằng tuần tạm dừng (khôi phục học sinh thì chạy lại), liên kết phụ huynh bị thu hồi. Lịch sử và sổ nợ vẫn giữ để bạn xem lại.', ok: 'Ngừng dạy', danger: true }).then(function (y) { if (y) T9.post('api/students/' + s.id + '/archive', { active: false }).then(function () { T9.toast('Đã lưu trữ'); onChange(); }, T9.fail); });
        }),
        T9.btn('Xóa hẳn', 'ghost danger-t', function () {
          T9.confirm({ title: 'Xóa hẳn ' + s.name + '?', text: 'Toàn bộ buổi học, nhật ký, học phí và liên kết của học sinh này sẽ bị xóa vĩnh viễn, không khôi phục được.', ok: 'Xóa vĩnh viễn', danger: true }).then(function (y) { if (y) T9.del('api/students/' + s.id).then(function () { T9.toast('Đã xóa'); T9.go('#/hs'); }, T9.fail); });
        }),
      ])]));
      T9.mount(nodes);
    }
    function dayCard(l, onChange) {
      return h('div', { class: 'daywrap' }, [h('div', { class: 'daytag', text: T9.dayLabel(l.day, T9._today || l.day) }), T9.lessonCard(l, { today: T9._today || '', onChange: onChange })]);
    }
    function kv(k, v, cls) { return h('div', { class: 'kvrow' }, [h('span', { class: 'muted', text: k }), h('span', { class: 'b ' + (cls || ''), text: v })]); }
  };
})();
