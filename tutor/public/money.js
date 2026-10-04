/* 9tutor: màn Tiền (báo cáo tháng), thu tiền, khoản phải thu, nhắc phụ huynh + QR, liên kết báo cáo */
(function () {
  'use strict';
  var T9 = window.T9; var h = T9.h;

  T9.reportUrl = function (token) { return new URL('r/' + token, document.baseURI).href; };

  function methodSeg(get, set) {
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Hình thức' }, [['ck', 'Chuyển khoản'], ['tm', 'Tiền mặt']].map(function (o) {
      return h('button', { type: 'button', class: get() === o[0] ? 'on' : '', text: o[1], onclick: function () { set(o[0]); [].forEach.call(seg.children, function (b, i) { b.classList.toggle('on', ['ck', 'tm'][i] === o[0]); }); } });
    }));
    return seg;
  }

  // ---------- thu tiền ----------
  T9.paymentSheet = function (s, done) {
    T9.sheet('Thu tiền: ' + s.name, function (body, close) {
      var method = 'ck';
      var seg = methodSeg(function () { return method; }, function (m) { method = m; });
      var amount = T9.money({ placeholder: s.balance > 0 ? String(s.balance) : '0', 'aria-label': 'Số tiền đã thu' });
      var date = h('input', { type: 'date', value: T9._today || '' });
      var note = T9.text({ maxlength: 120, placeholder: 'Ví dụ: học phí tháng 10' });
      function finish(r) { close(); T9.toast('Đã ghi thu ' + T9.vnd(r.payment.amount) + (r.balance > 0 ? ', còn ' + T9.vnd(r.balance) : r.balance < 0 ? ', đóng trước ' + T9.vnd(-r.balance) : ', đã đủ')); done(); }
      if (s.balance > 0) {
        var full = T9.btn('Thu đủ ' + T9.vnd(s.balance), 'primary block', function () {
          return T9.busy(full, function () { return T9.post('api/students/' + s.id + '/payments', { full: true, method: method, paidOn: date.value || undefined, note: note.value }, { idem: 'pay-full-' + s.id }).then(finish); });
        });
        body.appendChild(full); body.appendChild(h('div', { class: 'or', text: 'hoặc thu một phần' }));
      } else {
        body.appendChild(T9.notice('info', s.balance < 0 ? 'Đang đóng trước' : 'Không còn nợ', 'Bạn vẫn ghi được khoản thu mới (ví dụ phụ huynh đóng trước).'));
      }
      var go = T9.btn('Ghi khoản đã thu', s.balance > 0 ? 'ghost block' : 'primary block', function () {
        var v = T9.parseMoney(amount.value);
        if (isNaN(v) || v < 1 || v > 1000000000) { T9.toast('Số tiền chưa đúng. Ví dụ: 500000 hoặc 500k', 'err'); amount.focus(); return; }
        return T9.busy(go, function () { return T9.post('api/students/' + s.id + '/payments', { amount: v, method: method, paidOn: date.value || undefined, note: note.value }, { idem: 'pay-' + s.id + '-' + v }).then(finish); });
      });
      body.appendChild(h('form', { onsubmit: function (e) { e.preventDefault(); go.click(); } }, [
        T9.field('Số tiền (đ)', amount), h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Hình thức' }), seg]),
        T9.field('Ngày thu', date), T9.field('Ghi chú (tùy chọn)', note), go,
      ]));
    });
  };

  // ---------- khoản phải thu ----------
  T9.chargeSheet = function (s, done) {
    T9.sheet('Thêm khoản phải thu', function (body, close) {
      var kind = s.feeModel === 'goi' ? 'goi' : s.feeModel === 'thang' ? 'thang' : 'khac';
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Loại khoản' }, [['thang', 'Học phí tháng'], ['goi', 'Bán gói'], ['khac', 'Khác']].map(function (o) {
        return h('button', { type: 'button', class: kind === o[0] ? 'on' : '', text: o[1], onclick: function () { kind = o[0]; sync(); } });
      }));
      var month = h('input', { type: 'month', value: (T9._today || '').slice(0, 7) });
      var amount = T9.money({ value: s.feeAmount ? String(s.feeAmount) : '' });
      var sessions = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 200, value: s.packageSessions || 10 });
      var note = T9.text({ maxlength: 120, placeholder: 'Ví dụ: phí tài liệu' });
      var fields = h('div');
      function sync() {
        [].forEach.call(seg.children, function (b, i) { b.classList.toggle('on', ['thang', 'goi', 'khac'][i] === kind); });
        T9.clear(fields);
        if (kind === 'thang') { fields.appendChild(T9.field('Kỳ học phí', month)); fields.appendChild(T9.field('Số tiền (đ)', amount, 'Mặc định là mức học phí tháng của học sinh.')); }
        if (kind === 'goi') { fields.appendChild(T9.field('Số buổi của gói', sessions)); fields.appendChild(T9.field('Giá gói (đ)', amount)); }
        if (kind === 'khac') { fields.appendChild(T9.field('Số tiền (đ)', amount)); fields.appendChild(T9.field('Nội dung', note)); }
      }
      var go = T9.btn('Thêm khoản', 'primary block', function () {
        var v = amount.value.trim() ? T9.parseMoney(amount.value) : undefined;
        if (v !== undefined && (isNaN(v) || v < 0)) { T9.toast('Số tiền chưa đúng', 'err'); return; }
        var data = { kind: kind };
        if (v !== undefined) data.amount = v;
        if (kind === 'thang') { if (!month.value) { T9.toast('Hãy chọn tháng', 'err'); return; } data.period = month.value; }
        if (kind === 'goi') data.sessions = parseInt(sessions.value, 10);
        if (kind === 'khac') { data.note = note.value; if (v === undefined) { T9.toast('Hãy nhập số tiền', 'err'); return; } }
        return T9.busy(go, function () {
          return T9.post('api/students/' + s.id + '/charges', data, { idem: 'chg-' + s.id + '-' + kind + (data.period || '') }).then(function (r) { close(); T9.toast('Đã thêm khoản ' + T9.vnd(r.charge.amount)); done(); });
        });
      });
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Loại khoản' }), seg])); body.appendChild(fields); body.appendChild(go);
      sync();
    });
  };

  // ---------- nhắc phụ huynh + QR ----------
  T9.reminderSheet = function (s, done) {
    T9.get('api/students/' + s.id + '/reminder').then(function (r) {
      T9.sheet('Nhắc phụ huynh: ' + s.name, function (body) {
        var ta = h('textarea', { rows: 10, 'aria-label': 'Nội dung tin nhắn' }); ta.value = r.message;
        var withLink = null;
        function text() { return ta.value + (withLink && withLink.checked && r.reportToken ? '\nXem báo cáo của bé: ' + T9.reportUrl(r.reportToken) : ''); }
        var sms = h('a', { class: 'btn ghost', href: '#' }, [T9.ico('send', 18), 'Gửi SMS']);
        function syncSms() { sms.setAttribute('href', 'sms:' + (r.phone || '') + '?&body=' + encodeURIComponent(text())); }
        ta.addEventListener('input', syncSms);
        if (r.balance <= 0) body.appendChild(T9.notice('ok', r.balance < 0 ? 'Phụ huynh đang đóng trước' : 'Học sinh không còn nợ', 'Bạn vẫn gửi được tin cảm ơn hoặc thông tin học phí.'));
        body.appendChild(T9.field('Tin nhắn (sửa tùy ý)', ta));
        if (r.reportToken) {
          withLink = h('input', { type: 'checkbox', id: 'wl' });
          withLink.addEventListener('change', syncSms);
          body.appendChild(h('label', { class: 'check', for: 'wl' }, [withLink, h('span', { text: 'Kèm liên kết báo cáo cho phụ huynh' })]));
        }
        syncSms();
        var zalo = r.zaloPhone ? h('a', { class: 'btn ghost', href: 'https://zalo.me/' + r.zaloPhone, target: '_blank', rel: 'noopener noreferrer', onclick: function () { T9.copy(text(), 'Đã chép tin nhắn. Dán vào Zalo nhé'); } }, [T9.ico('chat', 18), 'Chép và mở Zalo']) : null;
        body.appendChild(h('div', { class: 'btn-row' }, [T9.btn('Sao chép tin nhắn', 'primary', function () { T9.copy(text(), 'Đã sao chép tin nhắn'); }, null), zalo, r.phone ? sms : null]));
        if (!r.phone) body.appendChild(h('div', { class: 'hint', text: 'Chưa có số điện thoại phụ huynh nên chưa mở Zalo hay SMS được. Sửa hồ sơ học sinh để thêm số.' }));
        if (r.balance > 0) {
          if (r.hasBank) {
            body.appendChild(h('div', { class: 'qrcard card' }, [
              h('div', { class: 'b', text: 'Mã QR chuyển khoản' }),
              h('img', { class: 'qr', src: 'api/students/' + s.id + '/qr.svg?amount=' + r.balance + '&v=' + Date.now(), alt: 'Mã QR VietQR thu ' + T9.vnd(r.balance) + ' học phí của ' + s.name, width: 240, height: 240 }),
              h('div', { class: 'qr-amount', text: T9.vnd(r.balance) }),
              h('div', { class: 'muted small', text: 'Nội dung chuyển khoản: ' + r.content }),
              h('div', { class: 'btn-row center' }, [
                h('a', { class: 'btn ghost sm', href: 'api/students/' + s.id + '/qr.png?amount=' + r.balance, download: 'qr-hoc-phi-' + r.content + '.png' }, [T9.ico('download', 18), 'Lưu ảnh QR']),
                T9.btn('Chép nội dung', 'ghost sm', function () { T9.copy(r.content, 'Đã chép nội dung chuyển khoản'); }),
              ]),
              h('div', { class: 'hint', text: 'Lưu ảnh QR rồi gửi kèm tin nhắn qua Zalo để phụ huynh quét bằng app ngân hàng.' }),
            ]));
          } else {
            body.appendChild(T9.notice('warn', 'Chưa có tài khoản nhận tiền', 'Lưu số tài khoản để tạo mã QR chuyển khoản.', T9.link('#/cai-dat', { class: 'linkbtn', onclick: function () { T9.closeSheets(); } }, ['Mở Cài đặt'])));
          }
        }
      });
    }, T9.fail);
  };

  // ---------- liên kết báo cáo cho phụ huynh ----------
  T9.linkSheet = function (s, link, done) {
    T9.sheet('Báo cáo cho phụ huynh', function (body, close) {
      function render(lk) {
        T9.clear(body);
        var showC = h('input', { type: 'checkbox', id: 'lk-c' }); showC.checked = lk ? lk.showComments : true;
        var showF = h('input', { type: 'checkbox', id: 'lk-f' }); showF.checked = lk ? lk.showFee : false;
        body.appendChild(h('p', { class: 'muted', text: 'Phụ huynh mở liên kết để xem lịch học, chuyên cần của ' + s.name + '. Không cần đăng nhập. Số điện thoại, ghi chú riêng và học sinh khác không bao giờ hiện ra.' }));
        body.appendChild(h('label', { class: 'check', for: 'lk-c' }, [showC, h('span', { text: 'Hiện nội dung buổi học, bài tập và nhận xét' })]));
        body.appendChild(h('label', { class: 'check', for: 'lk-f' }, [showF, h('span', {}, [h('b', { text: 'Hiện học phí và mã QR chuyển khoản' }), h('div', { class: 'muted small', text: 'Người có liên kết sẽ thấy số còn nợ và tài khoản ngân hàng nhận tiền của bạn. Mặc định tắt.' })])]));
        if (!lk) {
          var create = T9.btn('Tạo liên kết', 'primary block', function () {
            return T9.busy(create, function () { return T9.post('api/students/' + s.id + '/link', { showComments: showC.checked, showFee: showF.checked }).then(function (r) { done(); render(r.link); }); });
          });
          body.appendChild(create); return;
        }
        var url = T9.reportUrl(lk.token);
        var inp = h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Liên kết báo cáo', onfocus: function (e) { e.target.select(); } });
        body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Liên kết' }), inp]));
        var saveOpts = T9.btn('Lưu lựa chọn', 'ghost block', function () {
          return T9.busy(saveOpts, function () { return T9.post('api/students/' + s.id + '/link', { showComments: showC.checked, showFee: showF.checked }).then(function (r) { T9.toast('Đã lưu. Liên kết giữ nguyên'); done(); render(r.link); }); });
        });
        var btns = [T9.btn('Sao chép liên kết', 'primary', function () { T9.copy(url, 'Đã sao chép liên kết'); })];
        if (navigator.share) btns.push(T9.btn('Chia sẻ', 'ghost', function () { navigator.share({ title: 'Báo cáo học tập của ' + s.name, url: url }).catch(function () {}); }));
        btns.push(h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, [T9.ico('eye', 18), 'Xem thử']));
        body.appendChild(h('div', { class: 'btn-row' }, btns));
        body.appendChild(saveOpts);
        body.appendChild(h('div', { class: 'muted small', text: 'Đã xem ' + lk.views + ' lần' + (lk.lastViewedAt ? ', gần nhất ' + new Date(lk.lastViewedAt).toLocaleString('vi-VN') : '') + '.' }));
        body.appendChild(h('div', { class: 'btn-row' }, [
          T9.btn('Tạo liên kết mới', 'ghost sm', function () {
            T9.confirm({ title: 'Tạo liên kết mới?', text: 'Liên kết cũ sẽ ngừng hoạt động ngay. Bạn cần gửi lại liên kết mới cho phụ huynh.', ok: 'Tạo mới' }).then(function (y) { if (y) T9.post('api/students/' + s.id + '/link', { regenerate: true, showComments: showC.checked, showFee: showF.checked }).then(function (r) { done(); render(r.link); T9.toast('Đã tạo liên kết mới'); }, T9.fail); });
          }),
          T9.btn('Thu hồi liên kết', 'ghost sm danger-t', function () {
            T9.confirm({ title: 'Thu hồi liên kết?', text: 'Phụ huynh sẽ không mở được trang báo cáo nữa.', ok: 'Thu hồi', danger: true }).then(function (y) { if (y) T9.del('api/students/' + s.id + '/link').then(function () { done(); close(); T9.toast('Đã thu hồi liên kết'); }, T9.fail); });
          }),
        ]));
      }
      render(link);
    });
  };

  // ---------- màn Tiền ----------
  T9.moneyScreen = function (month) {
    T9.frame({ title: 'Tiền', tab: 'tien' });
    T9.skeleton();
    var m = month || null;
    T9.live({ fetch: function () { return T9.get('api/reports/month' + (m ? '?month=' + m : '')); }, render: render, every: 45000 }).catch(function (e) { T9.loadError(e, function () { T9.moneyScreen(month); }); });
    function render(d) {
      m = d.month; var onChange = function () { T9.refresh(true); };
      var nowMonth = (T9._today || '').slice(0, 7);
      var nodes = [];
      nodes.push(h('div', { class: 'print-only phead' }, [h('div', { class: 'big', text: 'Báo cáo thu nhập ' + T9.monthLabel(d.month).toLowerCase() }), h('div', { text: 'Gia sư: ' + d.tutor.name })]));
      nodes.push(h('div', { class: 'weeknav noprint' }, [
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng trước', onclick: function () { T9.go('#/tien/' + T9.addMonths(d.month, -1)); } }, [T9.ico('back', 24)]),
        h('div', { class: 'col center' }, [h('div', { class: 'b', text: T9.monthLabel(d.month) }), h('div', { class: 'muted small', text: d.month === nowMonth ? 'Tháng này' : ' ' })]),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tháng sau', onclick: function () { T9.go('#/tien/' + T9.addMonths(d.month, 1)); } }, [T9.ico('chev', 24)]),
      ]));
      nodes.push(h('div', { class: 'stats2' }, [
        h('div', { class: 'card stat ok' }, [h('div', { class: 'muted small', text: 'Đã thu trong tháng' }), h('div', { class: 'stat-v', text: T9.vnd(d.totals.collected) })]),
        h('div', { class: 'card stat' }, [h('div', { class: 'muted small', text: 'Học phí phát sinh' }), h('div', { class: 'stat-v', text: T9.vnd(d.totals.accrued) })]),
        h('div', { class: 'card stat ' + (d.totals.owedNow ? 'warn' : 'ok') }, [h('div', { class: 'muted small', text: 'Còn phải thu (hiện tại)' }), h('div', { class: 'stat-v', text: T9.vnd(d.totals.owedNow) })]),
        h('div', { class: 'card stat' }, [h('div', { class: 'muted small', text: 'Đã dạy' }), h('div', { class: 'stat-v', text: d.totals.taught + ' buổi' }), h('div', { class: 'muted small', text: d.totals.hours + ' giờ' + (d.totals.absent ? ' · ' + d.totals.absent + ' nghỉ' : '') + (d.totals.cancelled ? ' · ' + d.totals.cancelled + ' hủy' : '') })]),
      ]));
      // xu hướng 6 tháng
      var max = Math.max(1, Math.max.apply(null, d.trend.map(function (x) { return Math.max(x.accrued, x.collected); })));
      var trend = h('div', { class: 'trend', role: 'img', 'aria-label': 'Biểu đồ thu 6 tháng' }, d.trend.map(function (x) {
        var a = h('div', { class: 'tbar acc', title: 'Phát sinh ' + T9.vnd(x.accrued) }); a.style.height = Math.max(2, Math.round(x.accrued / max * 100)) + '%';
        var c = h('div', { class: 'tbar got', title: 'Đã thu ' + T9.vnd(x.collected) }); c.style.height = Math.max(2, Math.round(x.collected / max * 100)) + '%';
        return h('div', { class: 'tcol' + (x.month === d.month ? ' cur' : '') }, [h('div', { class: 'tbars' }, [a, c]), h('div', { class: 'tlab', text: x.month.slice(5) + '/' + x.month.slice(2, 4) })]);
      }));
      nodes.push(h('div', { class: 'card' }, [h('div', { class: 'row sb' }, [h('h2', { text: '6 tháng gần nhất' }), h('div', { class: 'legend small' }, [h('span', { class: 'lgd acc' }), ' Phát sinh ', h('span', { class: 'lgd got' }), ' Đã thu'])]), trend]));
      // theo học sinh
      nodes.push(h('div', { class: 'sec', text: 'Theo từng học sinh' }));
      if (d.students.length) {
        nodes.push(h('div', { class: 'card' }, [h('ul', { class: 'plain' }, d.students.map(function (s) {
          return h('li', {}, [T9.link('#/hs/' + s.id, { class: 'srow' }, [
            h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: s.name }), h('div', { class: 'muted small', text: s.taught + ' buổi · ' + s.hours + ' giờ' + (s.active ? '' : ' · đã nghỉ') })]),
            h('div', { class: 'right' }, [h('div', { class: 'small', text: 'Phát sinh ' + T9.vnd(s.accrued) }), h('div', { class: 'small ok-t', text: 'Thu ' + T9.vnd(s.collected) }), s.balance > 0 ? h('div', { class: 'small bad-t b', text: 'Nợ ' + T9.vnd(s.balance) }) : null]),
          ])]);
        }))]));
      } else nodes.push(T9.empty('Chưa có phát sinh trong tháng này', 'Điểm danh buổi học hoặc ghi khoản thu để thấy số liệu.'));
      // người còn nợ
      var debtors = d.students.filter(function (s) { return s.balance > 0 && s.active; }).sort(function (a, b) { return b.balance - a.balance; });
      if (debtors.length) {
        nodes.push(h('div', { class: 'sec noprint', text: 'Người còn nợ (' + debtors.length + ')' }));
        nodes.push(h('div', { class: 'card noprint' }, [h('ul', { class: 'plain' }, debtors.map(function (s) {
          return h('li', { class: 'row sb' }, [
            h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: s.name }), h('div', { class: 'bad-t b', text: T9.vnd(s.balance) })]),
            h('div', { class: 'btn-row tight' }, [
              T9.btn('Nhắc', 'ghost sm', function () { T9.reminderSheet({ id: s.id, name: s.name }, onChange); }),
              T9.btn('Thu', 'primary sm', function () { T9.paymentSheet({ id: s.id, name: s.name, balance: s.balance }, onChange); }),
            ]),
          ]);
        }))]));
      }
      nodes.push(h('div', { class: 'btn-row noprint' }, [
        T9.btn('Tạo học phí tháng này', 'ghost', function () {
          T9.confirm({ title: 'Tạo học phí ' + T9.monthLabel(d.month).toLowerCase() + '?', text: 'Tạo khoản học phí cho mọi học sinh đang dạy tính theo tháng chưa có khoản của kỳ này.', ok: 'Tạo' }).then(function (y) {
            if (y) T9.post('api/billing/monthly', { period: d.month }).then(function (r) { T9.toast(r.created ? 'Đã tạo ' + r.created + ' khoản học phí' : 'Không có khoản nào cần tạo thêm'); onChange(); }, T9.fail);
          });
        }),
        T9.btn('In / Lưu PDF', 'ghost', function () { window.print(); }),
      ]));
      T9.mount(nodes);
    }
  };
})();
