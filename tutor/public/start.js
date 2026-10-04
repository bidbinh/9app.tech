/* 9tutor: chào mừng, tạo tài khoản, mã khôi phục, khôi phục, ghép thiết bị */
(function () {
  'use strict';
  var T9 = window.T9; var h = T9.h;

  var STATUS_OPTS = [
    ['sinh_vien', 'Sinh viên', 'Đang học đại học, cao đẳng và dạy kèm thêm.'],
    ['giao_vien_khac', 'Giáo viên hoặc người dạy khác', 'Giáo viên trường ngoài công lập, đã nghỉ hưu, gia sư tự do, giảng viên.'],
    ['giao_vien_cong', 'Giáo viên trường công lập', 'Đang công tác tại trường công lập.'],
    ['khac', 'Khác', 'Người dạy kèm không thuộc các nhóm trên.'],
  ];
  T9.STATUS_OPTS = STATUS_OPTS;

  // Thông điệp pháp lý theo tình trạng tự khai. Đây là nhắc nhở chung, không phải tư vấn pháp lý.
  T9.legalNotice = function (status) {
    if (status === 'giao_vien_cong') {
      return T9.notice('warn', 'Lưu ý dành cho giáo viên trường công lập',
        'Theo quy định hiện hành về dạy thêm, học thêm (Thông tư 29/2024/TT-BGDĐT), giáo viên trường công lập không được tự tổ chức dạy thêm có thu tiền hoặc đăng ký kinh doanh dạy thêm; chỉ được dạy với tư cách người lao động của cơ sở dạy thêm hợp pháp và phải báo cáo hiệu trưởng. 9tutor chỉ là sổ ghi chép cá nhân, không hỗ trợ đăng ký kinh doanh và sẽ không mở trang giới thiệu công khai cho tình trạng này. Hãy tự kiểm tra quy định của trường và địa phương.');
    }
    if (status === 'sinh_vien' || status === 'giao_vien_khac' || status === 'khac') {
      return T9.notice('info', 'Nhắc nhở',
        'Dạy thêm có thu tiền có thể phải đăng ký kinh doanh và kê khai thuế theo quy định tại địa phương (có tranh luận về trường hợp sinh viên dạy kèm). 9tutor chỉ là sổ ghi chép, không tư vấn pháp lý hay thuế. Hãy tự kiểm tra với cơ quan có thẩm quyền.');
    }
    return null;
  };

  T9.welcome = function () {
    T9.bare(); T9.liveStop();
    T9.mount([
      h('div', { class: 'hero' }, [
        h('img', { src: 'icon.svg', alt: '', class: 'hero-logo', width: 88, height: 88 }),
        h('h1', { class: 'h1', text: '9tutor' }),
        h('p', { class: 'sub', text: 'Sổ dạy kèm gọn trong túi cho gia sư và giáo viên dạy thêm.' }),
      ]),
      h('div', { class: 'card feat' }, [
        feat('calendar', 'Lịch dạy lặp lại mỗi tuần', 'Báo trùng giờ, xếp buổi bù khi học sinh nghỉ.'),
        feat('check', 'Điểm danh một chạm', 'Ghi nội dung, bài tập và nhận xét sau mỗi buổi.'),
        feat('wallet', 'Học phí và mã QR chuyển khoản', 'Biết ai còn nợ, nhắc phụ huynh qua Zalo bằng tin soạn sẵn.'),
        feat('share', 'Báo cáo cho phụ huynh', 'Một liên kết chỉ xem, thu hồi được bất cứ lúc nào.'),
      ]),
      h('div', { class: 'btn-row' }, [
        T9.btn('Bắt đầu, không cần đăng ký', 'primary block', function () { T9.go('#/bat-dau'); }),
        T9.btn('Tôi đã có tài khoản', 'ghost block', function () { T9.go('#/khoi-phuc'); }),
      ]),
      h('p', { class: 'muted center small', text: 'Không cần email hay mật khẩu. 9tutor không giữ tiền của ai và không môi giới gia sư.' }),
    ]);
  };
  function feat(icon, t, d) {
    return h('div', { class: 'feat-row' }, [h('div', { class: 'feat-ico' }, [T9.ico(icon, 22)]), h('div', { class: 'col' }, [h('div', { class: 'b', text: t }), h('div', { class: 'muted', text: d })])]);
  }

  // ---------- tạo tài khoản ----------
  T9.onboarding = function () {
    T9.bare(); T9.liveStop();
    var name = T9.text({ maxlength: 40, placeholder: 'Ví dụ: Cô Lan, Thầy Nam', autocomplete: 'name' });
    var status = ''; var legal = h('div', { class: 'legal-slot' });
    var optBtns = STATUS_OPTS.map(function (o) {
      var b = h('button', { type: 'button', class: 'pick', role: 'radio', 'aria-checked': 'false', onclick: function () { choose(o[0]); } }, [
        h('div', { class: 'col' }, [h('div', { class: 'b', text: o[1] }), h('div', { class: 'muted small', text: o[2] })]),
      ]);
      b.setAttribute('data-v', o[0]);
      return b;
    });
    function choose(v) {
      status = v;
      optBtns.forEach(function (b) { var on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      T9.clear(legal); var n = T9.legalNotice(v); if (n) legal.appendChild(n);
    }
    var agree = h('input', { type: 'checkbox', id: 'agree' });
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var go = T9.btn('Tạo tài khoản', 'primary block', function () {
      err.className = 'hint err hidden';
      if (!name.value.trim()) { showErr('Hãy nhập tên hiển thị'); name.focus(); return; }
      if (!status) { showErr('Hãy chọn tình trạng của bạn'); return; }
      if (!agree.checked) { showErr('Hãy tích vào ô xác nhận ở dưới'); return; }
      return T9.busy(go, function () {
        return T9.post('/api/start', { name: name.value, status: status }).then(function (r) {
          T9.me = r.me; T9.recoveryScreen(r.recoveryCode, true);
        });
      });
    });
    function showErr(m) { err.textContent = m; err.className = 'hint err'; }
    T9.frame({ title: 'Tạo tài khoản', back: '#/' });
    T9.mount([h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); go.click(); } }, [
      T9.field('Tên hiển thị', name, 'Phụ huynh sẽ thấy tên này trên báo cáo.'),
      h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Bạn là' }), h('div', { class: 'pick-list', role: 'radiogroup', 'aria-label': 'Tình trạng của bạn' }, optBtns)]),
      legal,
      h('label', { class: 'check mt', for: 'agree' }, [agree, h('span', { text: 'Tôi hiểu 9tutor chỉ là sổ ghi chép, tôi tự chịu trách nhiệm tuân thủ quy định về dạy thêm và thuế, và thông tin tôi khai là đúng.' })]),
      err,
      h('div', { class: 'btn-row' }, [go]),
    ])]);
  };

  // ---------- mã khôi phục: hiện một lần ----------
  T9.recoveryScreen = function (code, fresh) {
    T9.bare(); T9.liveStop();
    var saved = h('input', { type: 'checkbox', id: 'saved' });
    var enter = T9.btn(fresh ? 'Vào ứng dụng' : 'Xong', 'primary block', function () { T9.go('#/'); });
    enter.disabled = true;
    saved.addEventListener('change', function () { enter.disabled = !saved.checked; });
    T9.frame({ title: 'Mã khôi phục', back: fresh ? null : '#/cai-dat' });
    if (fresh) { T9.$('bar').className = 'bar'; }
    T9.mount([
      h('div', { class: 'card' }, [
        h('div', { class: 'okmark' }, [T9.ico('key', 28)]),
        h('h2', { class: 'center', text: 'Lưu mã này ngay' }),
        h('p', { class: 'center muted', text: 'Đây là chìa khóa duy nhất để mở lại sổ của bạn khi đổi điện thoại hoặc xóa trình duyệt. Mã chỉ hiện một lần; 9tutor không lưu bản đọc được nên không thể cấp lại.' }),
        h('div', { class: 'reccode', 'aria-label': 'Mã khôi phục' }, code.split('-').map(function (g) { return h('span', { text: g }); })),
        h('div', { class: 'btn-row' }, [
          T9.btn('Sao chép', 'ghost', function () { T9.copy(code, 'Đã sao chép mã khôi phục'); }, null),
          T9.btn('Tải về (.txt)', 'ghost', function () { downloadText('9tutor-ma-khoi-phuc.txt', '9tutor - mã khôi phục tài khoản\n\n' + code + '\n\nGiữ kín mã này. Ai có mã đều mở được sổ của bạn.\n'); }),
        ]),
        T9.notice('warn', 'Giữ kín', 'Ai có mã này đều vào được sổ của bạn. Đừng gửi cho học sinh hay phụ huynh. Có thể đổi mã mới trong Cài đặt.'),
        h('label', { class: 'check mt', for: 'saved' }, [saved, h('span', { text: 'Tôi đã lưu mã khôi phục ở nơi an toàn.' })]),
        h('div', { class: 'btn-row' }, [enter]),
      ]),
    ]);
  };
  function downloadText(fname, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: fname }); document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- khôi phục / ghép thiết bị ----------
  T9.recover = function () {
    T9.bare(); T9.liveStop();
    var mode = 'ma';
    var box = h('div');
    var seg = h('div', { class: 'seg', role: 'tablist' }, [
      h('button', { type: 'button', role: 'tab', class: 'on', text: 'Mã khôi phục', onclick: function () { set('ma'); } }),
      h('button', { type: 'button', role: 'tab', text: 'Mã ghép thiết bị', onclick: function () { set('ghep'); } }),
    ]);
    function set(m) {
      mode = m; [].forEach.call(seg.children, function (b, i) { b.classList.toggle('on', (i === 0) === (m === 'ma')); });
      T9.clear(box);
      var inp = T9.text({ maxlength: 40, autocapitalize: 'characters', spellcheck: 'false', placeholder: m === 'ma' ? 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' : 'Mã 12 ký tự', class: 'codein' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var go = T9.btn(m === 'ma' ? 'Mở sổ của tôi' : 'Ghép thiết bị này', 'primary block', function () {
        err.className = 'hint err hidden';
        return T9.busy(go, function () {
          return T9.post(m === 'ma' ? '/api/recover' : '/api/devices/redeem', { code: inp.value }).then(function (r) { T9.me = r.me; T9.toast('Đã mở lại sổ của bạn'); T9.go('#/'); }, function (e) { err.textContent = e.message; err.className = 'hint err'; });
        });
      });
      box.appendChild(h('form', { onsubmit: function (e) { e.preventDefault(); go.click(); } }, [
        h('p', { class: 'muted', text: m === 'ma' ? 'Nhập mã khôi phục 25 ký tự bạn đã lưu khi tạo tài khoản.' : 'Trên thiết bị cũ: Cài đặt > Thiết bị > Tạo mã ghép. Mã dùng một lần và hết hạn sau 15 phút.' }),
        T9.field(m === 'ma' ? 'Mã khôi phục' : 'Mã ghép', inp), err, h('div', { class: 'btn-row' }, [go]),
      ]));
    }
    T9.frame({ title: 'Mở lại tài khoản', back: '#/' });
    T9.mount([h('div', { class: 'card' }, [seg, box])]);
    set(mode);
  };

  // Mở từ liên kết ghép: xác nhận bằng một lần bấm (POST), tránh trình xem trước liên kết làm hỏng mã
  T9.pair = function (code) {
    T9.bare(); T9.liveStop();
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var who = h('div', { class: 'whobox', 'aria-live': 'polite' });
    T9.post('api/devices/peek', { code: code }).then(function (r) {
      who.appendChild(h('div', { class: 'muted small', text: 'Tài khoản sẽ được mở' }));
      who.appendChild(h('div', { class: 'big', text: r.name }));
    }, function (e) { who.appendChild(h('div', { class: 'hint err', text: e.message })); go.disabled = true; });
    var go = T9.btn('Ghép thiết bị này', 'primary block', function () {
      return T9.busy(go, function () {
        return T9.post('/api/devices/redeem', { code: code }).then(function (r) { T9.me = r.me; history.replaceState(null, '', location.pathname + '#/'); T9.toast('Đã ghép thiết bị'); T9.go('#/'); }, function (e) { err.textContent = e.message; err.className = 'hint err'; });
      });
    });
    T9.frame({ title: 'Ghép thiết bị', back: '#/' });
    T9.mount([h('div', { class: 'card center' }, [
      h('div', { class: 'okmark' }, [T9.ico('device', 28)]),
      h('h2', { text: 'Mở sổ dạy kèm trên máy này?' }),
      h('p', { class: 'muted', text: 'Thiết bị này sẽ vào cùng tài khoản gia sư với thiết bị đã tạo mã.' }), who,
      T9.notice('warn', 'Chỉ bấm nếu đúng là tài khoản của bạn', 'Nếu tên ở trên không phải của bạn, hoặc bạn không vừa tạo mã ghép, hãy đóng trang này. Có người có thể đang cố đưa bạn vào tài khoản của họ.'),
      err, h('div', { class: 'btn-row' }, [go, T9.link('#/', { class: 'btn ghost' }, ['Không phải tôi'])]),
    ])]);
  };
})();
