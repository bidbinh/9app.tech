/* 9tutor: màn Hôm nay, Lịch tuần, thẻ buổi học, bảng chi tiết buổi (điểm danh, nhật ký, dời, bù) */
(function () {
  'use strict';
  var T9 = window.T9; var h = T9.h;

  var DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240];
  T9.durationSelect = function (cur) {
    var sel = h('select', {}, DURATIONS.concat(DURATIONS.indexOf(cur) < 0 && cur ? [cur] : []).sort(function (a, b) { return a - b; }).map(function (m) {
      return h('option', { value: m, text: m % 60 === 0 ? (m / 60) + ' giờ' : m < 60 ? m + ' phút' : Math.floor(m / 60) + ' giờ ' + (m % 60) + ' phút' });
    }));
    sel.value = String(cur || T9.store('dur') || 60);
    return sel;
  };

  // Gọi API; nếu báo trùng giờ thì hỏi gia sư có muốn xếp trùng (dạy nhóm) rồi gọi lại với allowOverlap
  T9.tryOverlap = function (send) {
    return send(false).catch(function (e) {
      if (e && e.status === 409 && e.code === 'schedule_conflict') {
        return T9.confirm({ title: 'Trùng giờ', text: e.message, ok: 'Vẫn xếp trùng', cancel: 'Quay lại' }).then(function (yes) { return yes ? send(true) : null; });
      }
      throw e;
    });
  };

  // thông báo có nút hoàn tác
  T9.toastUndo = function (msg, label, fn) {
    var t = T9.$('toast'); T9.clear(t); t.className = 'toast act';
    t.appendChild(h('span', { text: msg }));
    t.appendChild(h('button', { type: 'button', class: 'toast-btn', text: label, onclick: function () { t.className = 'toast hidden'; fn(); } }));
    clearTimeout(T9._undoTimer);
    T9._undoTimer = setTimeout(function () { t.className = 'toast hidden'; }, 7000);
  };

  function statusChip(l) {
    var kind = { du_kien: '', da_day: 'ok', hs_nghi: 'warn', gs_huy: 'bad' }[l.status];
    var label = T9.STATUS[l.status];
    if (l.status === 'da_day' && l.fee) label += ' · ' + T9.vnd(l.fee);
    if (l.status === 'hs_nghi' && l.billable && l.fee) label += ' · tính ' + T9.vnd(l.fee);
    return T9.chip(label, kind);
  }

  // Thẻ một buổi học. o: { today, showDay, onChange }
  T9.lessonCard = function (l, o) {
    o = o || {};
    var chips = [];
    if (l.status !== 'du_kien') chips.push(statusChip(l));
    if (l.overlap) chips.push(T9.chip('Trùng giờ', 'bad'));
    if (l.makeupOf) chips.push(T9.chip('Buổi bù', 'info'));
    else if (l.hasMakeup) chips.push(T9.chip('Đã xếp bù', 'info'));
    if (l.moved) chips.push(T9.chip('Đã dời', ''));
    if (l.topic || l.comment || l.homework) chips.push(T9.chip('Có nhật ký', 'brand'));
    var canTick = l.status === 'du_kien' && l.day <= o.today;
    var main = h('button', { type: 'button', class: 'lmain', 'aria-label': 'Mở buổi học của ' + l.studentName, onclick: function () { T9.openLesson(l.id, o.onChange); } }, [
      h('div', { class: 'b trunc', text: l.studentName }),
      h('div', { class: 'muted small trunc', text: [l.grade, l.subject, l.location].filter(Boolean).join(' · ') || ' ' }),
      chips.length ? h('div', { class: 'chips' }, chips) : null,
    ]);
    var tick = null;
    if (canTick) {
      tick = h('button', { type: 'button', class: 'tick', 'aria-label': 'Điểm danh đã dạy: ' + l.studentName, onclick: function (ev) {
        var b = ev.currentTarget; if (b.disabled) return; b.disabled = true;
        T9.post('/api/lessons/' + l.id + '/mark', { status: 'da_day' }).then(function (r) {
          var msg = 'Đã điểm danh ' + l.studentName + (r.lesson.fee ? ' (+' + T9.vnd(r.lesson.fee) + ')' : '');
          if (r.pkgLeft !== null && r.pkgLeft !== undefined && r.pkgLeft <= 1) msg += r.pkgLeft < 0 ? '. Đã vượt gói!' : '. Gói còn ' + r.pkgLeft + ' buổi';
          T9.toastUndo(msg, 'Hoàn tác', function () { T9.post('/api/lessons/' + l.id + '/mark', { status: 'du_kien' }).then(function () { if (o.onChange) o.onChange(); }, T9.fail); });
          if (o.onChange) o.onChange();
        }, function (e) { b.disabled = false; T9.fail(e); });
      } }, [T9.ico('check', 24, 2.6)]);
    } else if (l.status === 'da_day') {
      tick = h('div', { class: 'tick done', 'aria-hidden': 'true' }, [T9.ico('check', 22, 2.6)]);
    }
    return h('div', { class: 'lcard st-' + l.status + (l.overlap ? ' clash' : '') }, [
      h('div', { class: 'ltime' }, [h('div', { class: 'b', text: T9.hhmm(l.startMin) }), h('div', { class: 'muted small', text: l.durationMin + "'" })]),
      main, tick,
    ]);
  };

  // ---------- bảng chi tiết buổi học ----------
  T9.openLesson = function (id, onChange) {
    T9.api('GET', 'api/lessons/' + id).then(function (r) {
      var changed = false;
      T9.sheet('Buổi học', function (body, close) {
        function done() { changed = true; if (onChange) onChange(); else T9.refresh(true); }
        function render(l) {
          T9.clear(body);
          var future = l.day > (T9._today || '');
          body.appendChild(h('div', { class: 'row' }, [
            h('div', { class: 'avatar' }, [T9.initial(l.studentName)]),
            h('div', { class: 'col' }, [
              h('div', { class: 'b', text: l.studentName }),
              h('div', { class: 'muted small', text: T9.dayLabel(l.day, T9._today || l.day) + ' · ' + T9.timeRange(l.startMin, l.durationMin) + (l.location ? ' · ' + l.location : '') }),
            ]),
          ]));
          if (l.overlap) body.appendChild(T9.notice('warn', 'Trùng giờ', 'Buổi này chồng giờ với một buổi khác trong ngày.'));
          if (l.makeupOf) body.appendChild(T9.chip('Buổi bù', 'info'));

          // điểm danh
          var seg = h('div', { class: 'seg seg4', role: 'group', 'aria-label': 'Điểm danh' });
          [['du_kien', 'Chưa dạy'], ['da_day', 'Đã dạy'], ['hs_nghi', 'HS nghỉ'], ['gs_huy', 'Tôi hủy']].forEach(function (o) {
            var b = h('button', { type: 'button', class: l.status === o[0] ? 'on' : '', text: o[1], disabled: o[0] === 'da_day' && future, onclick: function () { setStatus(o[0]); } });
            seg.appendChild(b);
          });
          body.appendChild(seg);
          if (future) body.appendChild(h('div', { class: 'hint', text: 'Chưa đến ngày dạy nên chưa chọn "Đã dạy" được.' }));
          function setStatus(st) {
            if (st === l.status) return;
            if (st === 'hs_nghi') {
              T9.sheet('Học sinh nghỉ', function (b2, close2) {
                b2.appendChild(h('p', { text: 'Có tính học phí buổi này không?' }));
                b2.appendChild(h('div', { class: 'btn-row' }, [
                  T9.btn('Không tính (sẽ dạy bù)', 'ghost', function () { close2(); send('hs_nghi', { billable: false }); }),
                  T9.btn('Có tính học phí', 'primary', function () { close2(); send('hs_nghi', { billable: true }); }),
                ]));
              });
              return;
            }
            send(st, {});
          }
          function send(st, extra) {
            T9.post('/api/lessons/' + l.id + '/mark', Object.assign({ status: st }, extra)).then(function (r2) {
              l = r2.lesson; done(); render(l);
              if (r2.warning) T9.toast(r2.warning, 'err');
              if (r2.pkgLeft !== null && r2.pkgLeft !== undefined && r2.pkgLeft < 0) T9.toast('Đã dạy vượt số buổi của gói', 'err');
            }, T9.fail);
          }
          if (l.status === 'da_day' && l.billing === 'buoi') {
            body.appendChild(h('div', { class: 'row sb feeline' }, [h('span', { text: 'Học phí buổi này' }), h('span', {}, [h('b', { text: T9.vnd(l.fee) }), ' ', h('button', { type: 'button', class: 'linkbtn', text: 'Sửa', onclick: function () { editFee(); } })])]));
          } else if (l.status === 'da_day' && l.billing) {
            body.appendChild(h('div', { class: 'hint', text: l.billing === 'goi' ? 'Tính vào gói buổi của học sinh.' : 'Học phí tháng, không tính thêm theo buổi.' }));
          }
          function editFee() {
            T9.sheet('Học phí buổi này', function (b2, close2) {
              var inp = T9.money({ value: String(l.fee), 'aria-label': 'Học phí buổi này' });
              var save = T9.btn('Lưu', 'primary block', function () {
                var v = T9.parseMoney(inp.value); if (isNaN(v) || v < 0) { T9.toast('Số tiền chưa đúng', 'err'); return; }
                return T9.busy(save, function () { return T9.post('/api/lessons/' + l.id + '/mark', { status: l.status, fee: v, billable: l.billable }).then(function (r2) { l = r2.lesson; close2(); done(); render(l); if (r2.warning) T9.toast(r2.warning, 'err'); }); });
              });
              b2.appendChild(T9.field('Số tiền (đ)', inp, 'Ví dụ 200000 hoặc 200k')); b2.appendChild(save);
            });
          }

          // nhật ký
          body.appendChild(h('div', { class: 'sec in', text: 'Nhật ký buổi học' }));
          var topic = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Hôm nay học gì?' }, []); topic.value = l.topic;
          var hw = h('textarea', { rows: 2, maxlength: 300, placeholder: 'Bài tập về nhà' }, []); hw.value = l.homework;
          var cm = h('textarea', { rows: 3, maxlength: 600, placeholder: 'Nhận xét gửi phụ huynh' }, []); cm.value = l.comment;
          var pn = h('textarea', { rows: 2, maxlength: 600, placeholder: 'Chỉ mình bạn thấy' }, []); pn.value = l.privateNote;
          var rating = l.rating;
          var rbox = h('div', { class: 'optchips', role: 'group', 'aria-label': 'Mức tiếp thu' });
          [[1, 'Yếu'], [2, 'Chưa tốt'], [3, 'Khá'], [4, 'Tốt'], [5, 'Rất tốt']].forEach(function (o) {
            var b = h('button', { type: 'button', class: 'optchip' + (rating === o[0] ? ' on' : ''), text: o[1], 'aria-pressed': rating === o[0] ? 'true' : 'false', onclick: function () {
              rating = rating === o[0] ? null : o[0];
              [].forEach.call(rbox.children, function (c, i) { c.classList.toggle('on', rating === i + 1); c.setAttribute('aria-pressed', rating === i + 1 ? 'true' : 'false'); });
            } });
            rbox.appendChild(b);
          });
          body.appendChild(T9.field('Nội dung', topic));
          body.appendChild(T9.field('Bài tập giao', hw));
          body.appendChild(T9.field('Nhận xét (phụ huynh xem được nếu bạn gửi báo cáo)', cm));
          body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Mức tiếp thu' }), rbox]));
          body.appendChild(T9.field('Ghi chú riêng (không bao giờ hiện ra ngoài)', pn));
          var saveLog = T9.btn('Lưu nhật ký', 'primary block', function () {
            return T9.busy(saveLog, function () {
              return T9.post('/api/lessons/' + l.id + '/log', { topic: topic.value, homework: hw.value, comment: cm.value, privateNote: pn.value, rating: rating }).then(function (r2) { l = r2.lesson; done(); T9.toast('Đã lưu nhật ký'); });
            });
          });
          body.appendChild(saveLog);

          // thao tác khác
          var acts = [];
          if (l.status === 'du_kien') acts.push(T9.btn('Dời buổi', 'ghost', function () { moveSheet(); }));
          if ((l.status === 'hs_nghi' || l.status === 'gs_huy') && !l.hasMakeup && !l.makeupOf) acts.push(T9.btn('Xếp buổi bù', 'ghost', function () { makeupSheet(); }));
          if (!l.slotId && l.status !== 'da_day' && !(l.status === 'hs_nghi' && l.billable)) acts.push(T9.btn('Xóa buổi', 'ghost danger-t', function () {
            T9.confirm({ title: 'Xóa buổi này?', text: 'Buổi học sẽ bị xóa khỏi lịch.', ok: 'Xóa', danger: true }).then(function (y) { if (y) T9.del('api/lessons/' + l.id).then(function () { changed = true; close(); if (onChange) onChange(); else T9.refresh(true); }, T9.fail); });
          }));
          acts.push(T9.link('#/hs/' + l.studentId, { class: 'btn ghost', onclick: function () { close(); } }, ['Hồ sơ học sinh']));
          body.appendChild(h('div', { class: 'btn-row' }, acts));

          function moveSheet() {
            T9.sheet('Dời buổi học', function (b2, close2) {
              var d = h('input', { type: 'date', value: l.day }); var t = h('input', { type: 'time', value: T9.hhmm(l.startMin), step: 300 });
              var dur = T9.durationSelect(l.durationMin);
              var go = T9.btn('Dời buổi', 'primary block', function () {
                var sm = T9.minOf(t.value); if (!d.value || isNaN(sm)) { T9.toast('Hãy chọn ngày và giờ', 'err'); return; }
                return T9.busy(go, function () {
                  return T9.tryOverlap(function (allow) { return T9.post('/api/lessons/' + l.id + '/move', { day: d.value, startMin: sm, durationMin: +dur.value, allowOverlap: allow }); }).then(function (r2) { if (!r2) return; l = r2.lesson; close2(); done(); render(l); T9.toast('Đã dời buổi'); });
                });
              });
              b2.appendChild(T9.field('Ngày', d)); b2.appendChild(T9.field('Giờ bắt đầu', t)); b2.appendChild(T9.field('Thời lượng', dur)); b2.appendChild(go);
            });
          }
          function makeupSheet() {
            T9.sheet('Xếp buổi bù', function (b2, close2) {
              var d = h('input', { type: 'date', value: T9.addDays(T9._today || l.day, 2) }); var t = h('input', { type: 'time', value: T9.hhmm(l.startMin), step: 300 });
              var dur = T9.durationSelect(l.durationMin);
              var go = T9.btn('Xếp buổi bù', 'primary block', function () {
                var sm = T9.minOf(t.value); if (!d.value || isNaN(sm)) { T9.toast('Hãy chọn ngày và giờ', 'err'); return; }
                return T9.busy(go, function () {
                  return T9.tryOverlap(function (allow) { return T9.post('/api/lessons', { makeupOf: l.id, day: d.value, startMin: sm, durationMin: +dur.value, location: l.location, allowOverlap: allow }); }).then(function (r2) { if (!r2) return; l.hasMakeup = true; close2(); done(); render(l); T9.toast(r2.warning || ('Đã xếp buổi bù ' + T9.dm(r2.lesson.day)), r2.warning ? 'err' : ''); });
                });
              });
              b2.appendChild(h('p', { class: 'muted', text: 'Buổi gốc không tính học phí nếu bạn chọn không tính. Buổi bù tính học phí khi bạn điểm danh "Đã dạy".' }));
              b2.appendChild(T9.field('Ngày bù', d)); b2.appendChild(T9.field('Giờ bắt đầu', t)); b2.appendChild(T9.field('Thời lượng', dur)); b2.appendChild(go);
            });
          }
        }
        render(r.lesson);
      });
    }, T9.fail);
  };

  // ---------- thêm buổi lẻ ----------
  T9.addLessonSheet = function (day, onDone) {
    T9.get('api/students').then(function (r) {
      var list = r.students.filter(function (s) { return s.active; });
      if (!list.length) { T9.toast('Hãy thêm học sinh trước', 'err'); T9.go('#/hs'); return; }
      T9.sheet('Thêm buổi học', function (body, close) {
        var sel = h('select', {}, list.map(function (s) { return h('option', { value: s.id, text: s.name + (s.grade ? ' (' + s.grade + ')' : '') }); }));
        var last = T9.store('lastStudent'); if (last) sel.value = last; if (!sel.value) sel.value = list[0].id;
        var d = h('input', { type: 'date', value: day }); var t = h('input', { type: 'time', value: T9.store('lastTime') || '18:00', step: 300 });
        var dur = T9.durationSelect(); var loc = T9.text({ maxlength: 80, placeholder: 'Nhà học sinh, thư viện, online...' });
        var go = T9.btn('Thêm vào lịch', 'primary block', function () {
          var sm = T9.minOf(t.value); if (!d.value || isNaN(sm)) { T9.toast('Hãy chọn ngày và giờ', 'err'); return; }
          return T9.busy(go, function () {
            return T9.tryOverlap(function (allow) { return T9.post('/api/lessons', { studentId: sel.value, day: d.value, startMin: sm, durationMin: +dur.value, location: loc.value, allowOverlap: allow }); }).then(function (r2) {
              if (!r2) return; T9.store('lastStudent', sel.value); T9.store('lastTime', t.value); T9.store('dur', +dur.value);
              close(); T9.toast('Đã thêm buổi học'); if (onDone) onDone(); else T9.refresh(true);
            });
          });
        });
        body.appendChild(T9.field('Học sinh', sel)); body.appendChild(T9.field('Ngày', d)); body.appendChild(T9.field('Giờ bắt đầu', t));
        body.appendChild(T9.field('Thời lượng', dur, 'Một buổi học không được kéo qua nửa đêm.')); body.appendChild(T9.field('Nơi dạy (tùy chọn)', loc));
        body.appendChild(h('div', { class: 'btn-row' }, [go]));
      });
    }, T9.fail);
  };

  // ---------- màn Hôm nay ----------
  T9.today = function () {
    T9.od = 0;
    T9.frame({ title: 'Hôm nay', tab: 'hom', right: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Thêm buổi học', onclick: function () { T9.addLessonSheet(T9._today || new Date().toISOString().slice(0, 10)); } }, [T9.ico('plus', 24)])] });
    T9.skeleton();
    T9.live({
      fetch: function () { return T9.get('api/today' + (T9.od ? '?od=' + T9.od : '')); },
      render: renderToday, every: 30000,
    }).catch(function (e) { T9.loadError(e, T9.today); });
  };
  function renderToday(d) {
    T9._today = d.today;
    var onChange = function () { T9.refresh(true); };
    var nodes = [];
    nodes.push(h('div', { class: 'greet' }, [h('div', { class: 'big-day', text: T9.DOW[T9.isoDow(d.today)] + ', ' + T9.dm(d.today) }), h('div', { class: 'muted', text: 'Xin chào ' + (T9.me ? T9.me.name : '') })]));
    if (!d.stats.students) {
      nodes.push(h('div', { class: 'card center' }, [
        h('div', { class: 'okmark' }, [T9.ico('users', 28)]),
        h('h2', { text: 'Thêm học sinh đầu tiên' }),
        h('p', { class: 'muted', text: 'Nhập tên, lớp, phụ huynh và học phí. Sau đó xếp lịch dạy hằng tuần là xong.' }),
        h('div', { class: 'btn-row center' }, [T9.btn('Thêm học sinh', 'primary', function () { T9.studentForm(null, function (s) { T9.go('#/hs/' + s.id); }); })]),
      ]));
      nodes.push(startHelp());
      T9.mount(nodes); return;
    }
    nodes.push(h('div', { class: 'stats2' }, [
      statCard('Đã thu ' + T9.monthLabel(d.stats.month).toLowerCase(), T9.vnd(d.stats.collected), d.stats.taught + ' buổi đã dạy', 'ok', '#/tien'),
      statCard('Còn phải thu', T9.vnd(d.stats.owed), d.stats.debtors ? d.stats.debtors + ' học sinh còn nợ' : 'Không ai còn nợ', d.stats.debtors ? 'warn' : 'ok', '#/hs'),
    ]));
    d.lowPackages.forEach(function (p) {
      nodes.push(T9.notice('warn', p.left < 0 ? 'Đã dạy vượt gói: ' + p.name : p.left === 0 ? 'Hết gói: ' + p.name : 'Gói sắp hết: ' + p.name,
        p.left < 0 ? 'Đã dạy quá ' + (-p.left) + ' buổi so với gói. Hãy bán gói mới.' : p.left === 0 ? 'Học sinh đã dùng hết số buổi của gói.' : 'Còn ' + p.left + ' buổi trong gói.',
        T9.link('#/hs/' + p.studentId, { class: 'linkbtn' }, ['Mở hồ sơ'])));
    });
    if (d.overdue.length) {
      nodes.push(h('div', { class: 'sec', text: 'Chưa điểm danh (' + d.overdueTotal + ')' }));
      nodes.push(h('div', { class: 'lcards' }, d.overdue.map(function (l) { return withDay(l, d.today, onChange); })));
      if (d.overdueTotal > d.overdueOffset + d.overdue.length) nodes.push(T9.btn('Xem thêm buổi cũ hơn', 'ghost', function () { T9.od = (T9.od || 0) + 30; T9.refresh(true); }));
      if (d.overdueOffset > 0) nodes.push(T9.btn('Về các buổi mới nhất', 'ghost', function () { T9.od = 0; T9.refresh(true); }));
    }
    nodes.push(h('div', { class: 'sec', text: 'Hôm nay (' + d.lessons.length + ' buổi)' }));
    if (d.lessons.length) nodes.push(h('div', { class: 'lcards' }, d.lessons.map(function (l) { return T9.lessonCard(l, { today: d.today, onChange: onChange }); })));
    else nodes.push(T9.empty('Hôm nay không có buổi nào', 'Nghỉ ngơi một chút, hoặc thêm buổi dạy bù.', h('div', { class: 'btn-row center' }, [T9.btn('Thêm buổi', 'ghost', function () { T9.addLessonSheet(d.today); })])));
    if (d.upcoming.length) {
      nodes.push(h('div', { class: 'sec', text: 'Sắp tới' }));
      nodes.push(h('div', { class: 'lcards' }, d.upcoming.map(function (l) { return withDay(l, d.today, onChange); })));
    }
    T9.mount(nodes);
  }
  function withDay(l, today, onChange) {
    return h('div', { class: 'daywrap' }, [h('div', { class: 'daytag', text: T9.dayLabel(l.day, today) }), T9.lessonCard(l, { today: today, onChange: onChange })]);
  }
  function statCard(label, value, sub, tone, href) {
    return T9.link(href, { class: 'card stat ' + (tone || '') }, [h('div', { class: 'muted small', text: label }), h('div', { class: 'stat-v', text: value }), h('div', { class: 'small ' + (tone === 'warn' ? 'warn-t' : 'muted'), text: sub })]);
  }
  function startHelp() {
    return h('div', { class: 'card' }, [h('h2', { text: 'Cách dùng nhanh' }), h('ol', { class: 'steps-list' }, [
      h('li', { text: 'Thêm học sinh và mức học phí.' }), h('li', { text: 'Xếp lịch dạy lặp lại mỗi tuần.' }),
      h('li', { text: 'Sau mỗi buổi, chạm dấu tích để điểm danh.' }), h('li', { text: 'Cuối tháng xem ai còn nợ và nhắc phụ huynh bằng một tin soạn sẵn.' }),
    ])]);
  }

  // ---------- Lịch tuần ----------
  T9.week = function (anchor) {
    var cur = anchor || null;
    T9.frame({ title: 'Lịch dạy', tab: 'lich', right: [h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Thêm buổi học', onclick: function () { T9.addLessonSheet(T9._today || new Date().toISOString().slice(0, 10)); } }, [T9.ico('plus', 24)])] });
    T9.skeleton();
    var from = cur ? T9.mondayOf(cur) : null; var scrolled = false;
    function load() {
      return T9.live({
        fetch: function () {
          var f = from || T9.mondayOf(T9._today || new Date().toISOString().slice(0, 10));
          return T9.get('api/week?from=' + f + '&days=7');
        },
        render: renderWeek, every: 45000,
      });
    }
    function renderWeek(d) {
      T9._today = d.today; from = d.from;
      var onChange = function () { T9.refresh(true); };
      var nav = h('div', { class: 'weeknav' }, [
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tuần trước', onclick: function () { T9.go('#/lich/' + T9.addDays(d.from, -7)); } }, [T9.ico('back', 24)]),
        h('div', { class: 'col center' }, [h('div', { class: 'b', text: T9.dm(d.from) + ' - ' + T9.dm(d.to) }), h('div', { class: 'muted small', text: d.from <= d.today && d.today <= d.to ? 'Tuần này' : T9.dmy(d.from).slice(6) })]),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tuần sau', onclick: function () { T9.go('#/lich/' + T9.addDays(d.from, 7)); } }, [T9.ico('chev', 24)]),
      ]);
      var today = d.from <= d.today && d.today <= d.to ? null : T9.btn('Về tuần này', 'ghost sm', function () { T9.go('#/lich'); });
      var days = [];
      for (var i = 0; i < 7; i++) {
        (function (day) {
          var ls = d.lessons.filter(function (l) { return l.day === day; });
          days.push(h('section', { class: 'dcol' + (day === d.today ? ' today' : ''), 'aria-label': T9.dayLabel(day, d.today) }, [
            h('div', { class: 'dhead' }, [
              h('div', { class: 'col' }, [h('span', { class: 'b', text: T9.DOW[T9.isoDow(day)] }), ' ', h('span', { class: 'muted', text: T9.dm(day) }), day === d.today ? h('span', { class: 'chip brand ml', text: 'Hôm nay' }) : null]),
              h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Thêm buổi ngày ' + T9.dm(day), onclick: function () { T9.addLessonSheet(day, onChange); } }, [T9.ico('plus', 20)]),
            ]),
            ls.length ? h('div', { class: 'lcards' }, ls.map(function (l) { return T9.lessonCard(l, { today: d.today, onChange: onChange }); })) : h('div', { class: 'muted small noles', text: 'Trống' }),
          ]));
        })(T9.addDays(d.from, i));
      }
      T9.mount([nav, today ? h('div', { class: 'btn-row center' }, [today]) : null, h('div', { class: 'weekgrid' }, days)], 'wide');
      // điện thoại: cuộn tới hôm nay ngay lần đầu mở tuần này
      if (!scrolled && d.from <= d.today && d.today <= d.to && window.innerWidth < 900) {
        scrolled = true; var el = document.querySelector('.dcol.today');
        if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -66); }
      }
    }
    load().catch(function (e) { T9.loadError(e, function () { T9.week(anchor); }); });
  };
})();
