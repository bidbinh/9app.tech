/* 9tutor: Cài đặt, trang giới thiệu gia sư (tùy chọn), thiết bị */
(function () {
  'use strict';
  var T9 = window.T9; var h = T9.h;

  T9.applyTheme = function () {
    var t = T9.store('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  };

  function profileSheet() {
    T9.sheet('Thông tin của bạn', function (body, close) {
      var name = T9.text({ maxlength: 40, value: T9.me.name });
      var status = T9.me.status; var legal = h('div');
      var opts = T9.STATUS_OPTS.map(function (o) {
        var b = h('button', { type: 'button', class: 'pick' + (o[0] === status ? ' on' : ''), role: 'radio', 'aria-checked': o[0] === status ? 'true' : 'false', onclick: function () { status = o[0]; sync(); } }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: o[1] }), h('div', { class: 'muted small', text: o[2] })])]);
        b.setAttribute('data-v', o[0]); return b;
      });
      function sync() {
        opts.forEach(function (b) { var on = b.getAttribute('data-v') === status; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        T9.clear(legal); var n = T9.legalNotice(status); if (n) legal.appendChild(n);
        if (status === 'giao_vien_cong' && T9.me.status !== 'giao_vien_cong') legal.appendChild(T9.notice('warn', 'Trang giới thiệu công khai sẽ bị tắt', 'Với tình trạng này 9tutor không mở trang giới thiệu công khai.'));
      }
      var save = T9.btn('Lưu', 'primary block', function () {
        return T9.busy(save, function () { return T9.post('api/me', { name: name.value, status: status }).then(function (r) { T9.me = r.me; close(); T9.toast('Đã lưu'); T9.route(); }); });
      });
      body.appendChild(T9.field('Tên hiển thị', name));
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Tình trạng (tự khai)' }), h('div', { class: 'pick-list', role: 'radiogroup' }, opts)]));
      body.appendChild(legal); body.appendChild(save); sync();
    });
  }

  T9.settings = function () {
    T9.frame({ title: 'Cài đặt', tab: 'cd' });
    var me = T9.me;
    var bank = T9.bankForm(me.bank);
    var bankErr = h('div', { class: 'hint err hidden', role: 'alert' });
    var saveBank = T9.btn('Lưu tài khoản', 'primary block', function () {
      bankErr.className = 'hint err hidden';
      var b; try { b = bank.read(); } catch (e) { bankErr.textContent = e.message; bankErr.className = 'hint err'; return; }
      return T9.busy(saveBank, function () { return T9.post('api/me', { bank: b }).then(function (r) { T9.me = r.me; T9.toast(b.bin ? 'Đã lưu tài khoản nhận học phí' : 'Đã xóa tài khoản'); }); });
    });
    var themeNow = T9.store('theme') || 'auto';
    var themeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Giao diện' }, [['auto', 'Theo máy'], ['light', 'Sáng'], ['dark', 'Tối']].map(function (o) {
      return h('button', { type: 'button', class: themeNow === o[0] ? 'on' : '', text: o[1], onclick: function () {
        T9.store('theme', o[0] === 'auto' ? null : o[0]); T9.applyTheme();
        [].forEach.call(themeSeg.children, function (b, i) { b.classList.toggle('on', ['auto', 'light', 'dark'][i] === o[0]); });
      } });
    }));
    var legal = T9.legalNotice(me.status);
    T9.mount([
      h('div', { class: 'card' }, [
        h('div', { class: 'row' }, [h('div', { class: 'avatar' }, [T9.initial(me.name)]), h('div', { class: 'col' }, [h('div', { class: 'big trunc', text: me.name }), h('div', { class: 'muted', text: T9.TUTOR_STATUS[me.status] || '' })]), T9.btn('Sửa', 'ghost sm', profileSheet)]),
        legal,
      ]),
      h('div', { class: 'card' }, [h('h2', { text: 'Tài khoản nhận học phí' }), h('p', { class: 'muted', text: 'Dùng để tạo mã QR chuyển khoản gửi phụ huynh. 9tutor không chuyển hay giữ tiền: phụ huynh chuyển thẳng vào tài khoản này.' }), bank.node, bankErr, h('div', { class: 'btn-row' }, [saveBank])]),
      h('div', { class: 'card' }, [h('h2', { text: 'Trang giới thiệu gia sư' }), h('p', { class: 'muted', text: me.publicProfileAllowed ? 'Tùy chọn: một trang ngắn để bạn gửi qua Zalo hoặc Facebook. 9tutor không môi giới và không có danh sách tìm gia sư.' : 'Không khả dụng với tình trạng giáo viên trường công lập.' }), h('div', { class: 'btn-row' }, [T9.link('#/gioi-thieu', { class: 'btn ghost' }, [me.publicProfileAllowed ? 'Thiết lập trang giới thiệu' : 'Xem lý do'])])]),
      h('div', { class: 'card' }, [h('h2', { text: 'Bảo mật và thiết bị' }),
        menuRow('device', 'Thiết bị đang đăng nhập', 'Ghép điện thoại hoặc máy tính khác', function () { T9.go('#/thiet-bi'); }),
        menuRow('key', 'Đổi mã khôi phục', 'Mã cũ sẽ không dùng được nữa', function () {
          T9.confirm({ title: 'Tạo mã khôi phục mới?', text: 'Mã cũ vô hiệu ngay. Bạn cần lưu mã mới ở nơi an toàn.', ok: 'Tạo mã mới' }).then(function (y) { if (y) T9.post('api/me/recovery').then(function (r) { T9.recoveryScreen(r.recoveryCode, false); }, T9.fail); });
        }),
        h('a', { class: 'menurow', href: 'api/export', download: '9tutor-du-lieu.json' }, [h('span', { class: 'micon' }, [T9.ico('download', 20)]), h('span', { class: 'col' }, [h('span', { class: 'b block', text: 'Tải dữ liệu của tôi' }), h('span', { class: 'muted small block', text: 'Tệp JSON gồm học sinh, buổi học và học phí' })]), T9.ico('chev', 18)]),
      ]),
      h('div', { class: 'card' }, [h('h2', { text: 'Giao diện' }), themeSeg]),
      h('div', { class: 'card' }, [h('h2', { text: 'Tài khoản' }), h('div', { class: 'btn-row' }, [
        T9.btn('Đăng xuất khỏi máy này', 'ghost', function () {
          T9.confirm({ title: 'Đăng xuất?', text: 'Bạn chỉ vào lại được bằng mã khôi phục hoặc mã ghép từ thiết bị khác. Hãy chắc chắn đã lưu mã khôi phục.', ok: 'Đăng xuất', danger: true }).then(function (y) { if (y) T9.post('api/logout').then(function () { T9.me = null; T9.go('#/'); T9.route(); }, T9.fail); });
        }),
        T9.btn('Xóa tài khoản và dữ liệu', 'ghost danger-t', deleteAccount),
      ])]),
      h('p', { class: 'muted small center', text: '9tutor là sổ ghi chép cho gia sư. Không giữ tiền, không môi giới, không thay thế tư vấn pháp lý hay thuế.' }),
    ]);
  };
  function menuRow(icon, t, d, fn) {
    return h('button', { type: 'button', class: 'menurow', onclick: fn }, [h('span', { class: 'micon' }, [T9.ico(icon, 20)]), h('span', { class: 'col' }, [h('span', { class: 'b block', text: t }), h('span', { class: 'muted small block', text: d })]), T9.ico('chev', 18)]);
  }
  function deleteAccount() {
    T9.sheet('Xóa tài khoản', function (body, close) {
      var inp = T9.text({ placeholder: 'XÓA', autocapitalize: 'characters', maxlength: 10 });
      var go = T9.btn('Xóa vĩnh viễn', 'danger block', function () {
        return T9.busy(go, function () { return T9.post('api/me/delete', { confirm: inp.value }).then(function () { close(); T9.me = null; T9.toast('Đã xóa tài khoản'); T9.go('#/'); T9.route(); }); });
      });
      body.appendChild(T9.notice('bad', 'Không thể hoàn tác', 'Toàn bộ học sinh, lịch, nhật ký, học phí, liên kết phụ huynh và trang giới thiệu sẽ bị xóa. Hãy tải dữ liệu về trước nếu cần.'));
      body.appendChild(T9.field('Gõ XÓA để xác nhận', inp)); body.appendChild(go);
    });
  }

  // ---------- trang giới thiệu ----------
  T9.profile = function () {
    T9.frame({ title: 'Trang giới thiệu', back: '#/cai-dat', tab: 'cd' });
    T9.skeleton();
    T9.get('api/profile').then(function (r) {
      var p = r.profile || { enabled: false, headline: '', bio: '', subjects: '', levels: '', area: '', priceFrom: null, priceTo: null, mode: 'ca_hai', contact: '' };
      var allowed = r.allowed;
      var enabled = h('input', { type: 'checkbox', id: 'pe' }); enabled.checked = p.enabled && allowed; enabled.disabled = !allowed;
      var headline = T9.text({ maxlength: 80, value: p.headline, placeholder: 'Gia sư Toán lớp 6 đến 9, 3 năm kinh nghiệm' });
      var bio = h('textarea', { rows: 5, maxlength: 800, placeholder: 'Phương pháp dạy, thành tích, thời gian rảnh...' }); bio.value = p.bio;
      var subjects = T9.text({ maxlength: 120, value: p.subjects, placeholder: 'Toán, Vật lý' }); var levels = T9.text({ maxlength: 80, value: p.levels, placeholder: 'Lớp 6 đến lớp 9' });
      var area = T9.text({ maxlength: 100, value: p.area, placeholder: 'Quận Cầu Giấy, Hà Nội' });
      var pf = T9.money({ value: p.priceFrom ? String(p.priceFrom) : '', placeholder: '150000' }); var pt = T9.money({ value: p.priceTo ? String(p.priceTo) : '', placeholder: '250000' });
      var mode = p.mode;
      var modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Hình thức dạy' }, [['tai_nha', 'Tại nhà'], ['online', 'Online'], ['ca_hai', 'Cả hai']].map(function (o) {
        return h('button', { type: 'button', class: mode === o[0] ? 'on' : '', text: o[1], onclick: function () { mode = o[0]; [].forEach.call(modeSeg.children, function (b, i) { b.classList.toggle('on', ['tai_nha', 'online', 'ca_hai'][i] === o[0]); }); } });
      }));
      var contact = T9.text({ maxlength: 60, value: p.contact, placeholder: 'Zalo 09xx xxx xxx' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var linkBox = h('div');
      var save = T9.btn('Lưu', 'primary block', function () {
        err.className = 'hint err hidden';
        var a = pf.value.trim() ? T9.parseMoney(pf.value) : null; var b = pt.value.trim() ? T9.parseMoney(pt.value) : null;
        if ((a !== null && isNaN(a)) || (b !== null && isNaN(b))) { err.textContent = 'Giá chưa đúng. Ví dụ: 150000 hoặc 150k'; err.className = 'hint err'; return; }
        return T9.busy(save, function () {
          return T9.post('api/profile', { enabled: enabled.checked, headline: headline.value, bio: bio.value, subjects: subjects.value, levels: levels.value, area: area.value, priceFrom: a, priceTo: b, mode: mode, contact: contact.value }).then(function (res) {
            p = res.profile; T9.toast(p.enabled ? 'Đã lưu. Trang đang bật' : 'Đã lưu. Trang đang tắt'); showLink();
          }, function (e) { err.textContent = e.message; err.className = 'hint err'; });
        });
      });
      function showLink() {
        T9.clear(linkBox);
        if (!p.code || !p.enabled) { if (p.code) linkBox.appendChild(h('p', { class: 'muted small', text: 'Trang đang tắt: ai mở liên kết cũng không thấy gì.' })); return; }
        var url = new URL('g/' + p.code, document.baseURI).href;
        linkBox.appendChild(h('div', { class: 'card' }, [
          h('h2', { text: 'Liên kết của bạn' }), h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Liên kết trang giới thiệu', onfocus: function (e) { e.target.select(); } }),
          h('div', { class: 'btn-row' }, [T9.btn('Sao chép', 'primary', function () { T9.copy(url, 'Đã sao chép liên kết'); }),
            navigator.share ? T9.btn('Chia sẻ', 'ghost', function () { navigator.share({ title: headline.value, url: url }).catch(function () {}); }) : null,
            h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, [T9.ico('eye', 18), 'Xem trang'])]),
          h('div', { class: 'btn-row' }, [T9.btn('Tạo lại mã trang', 'ghost sm danger-t', function () {
            T9.confirm({ title: 'Tạo lại mã trang?', text: 'Liên kết hiện tại ngừng hoạt động ngay. Bạn cần chia sẻ lại liên kết mới.', ok: 'Tạo lại', danger: true }).then(function (y) { if (y) T9.post('api/profile/regenerate-code').then(function (r) { p = r.profile; T9.toast('Đã tạo mã mới'); showLink(); }, T9.fail); });
          })]),
          h('div', { class: 'hint', text: 'Trang này cố ý không cho công cụ tìm kiếm lập chỉ mục; chỉ ai có liên kết mới xem được.' }),
        ]));
      }
      var nodes = [];
      if (!allowed) nodes.push(T9.legalNotice('giao_vien_cong'));
      else nodes.push(T9.notice('info', 'Trang tự giới thiệu', 'Chỉ hiện những gì bạn điền ở đây. Đừng ghi tên học sinh, địa chỉ nhà hay giấy tờ cá nhân. Thông tin do bạn tự khai, 9tutor không xác minh và không môi giới. Không có danh sách hay tìm kiếm gia sư.'));
      nodes.push(h('form', { class: 'card', onsubmit: function (e) { e.preventDefault(); save.click(); } }, [
        h('label', { class: 'check', for: 'pe' }, [enabled, h('span', {}, [h('b', { text: 'Bật trang giới thiệu công khai' }), h('div', { class: 'muted small', text: 'Ai có liên kết đều xem được. Tắt bất cứ lúc nào.' })])]),
        T9.field('Tiêu đề ngắn', headline), T9.field('Giới thiệu', bio), T9.field('Môn dạy', subjects), T9.field('Cấp lớp', levels), T9.field('Khu vực', area),
        h('div', { class: 'grid2' }, [T9.field('Giá từ (đ/buổi)', pf), T9.field('Đến (đ/buổi)', pt)]),
        h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Hình thức dạy' }), modeSeg]), T9.field('Cách liên hệ', contact, 'Hiện công khai. Chỉ điền số bạn muốn người lạ thấy.'),
        err, h('div', { class: 'btn-row' }, [allowed ? save : null]),
      ]));
      nodes.push(linkBox); showLink();
      T9.mount(nodes);
    }, function (e) { T9.loadError(e, T9.profile); });
  };

  // ---------- thiết bị ----------
  T9.devices = function () {
    T9.frame({ title: 'Thiết bị', back: '#/cai-dat', tab: 'cd' });
    T9.skeleton();
    T9.live({ fetch: function () { return T9.get('api/devices'); }, render: render, every: 20000 }).catch(function (e) { T9.loadError(e, T9.devices); });
    function render(d) {
      var onChange = function () { T9.refresh(true); };
      T9.mount([
        h('div', { class: 'card' }, [h('h2', { text: 'Ghép thiết bị mới' }), h('p', { class: 'muted', text: 'Tạo mã dùng một lần (hết hạn sau 15 phút), rồi mở liên kết hoặc nhập mã trên điện thoại hay máy tính khác.' }), h('div', { class: 'btn-row' }, [T9.btn('Tạo mã ghép', 'primary', function () { pairSheet(); })])]),
        h('div', { class: 'sec', text: 'Đang đăng nhập (' + d.devices.length + ')' }),
        h('div', { class: 'card' }, [h('ul', { class: 'plain' }, d.devices.map(function (x) {
          return h('li', { class: 'row sb' }, [
            h('div', { class: 'col' }, [h('div', { class: 'b', text: x.label }), h('div', { class: 'muted small', text: 'Dùng gần nhất ' + new Date(x.lastUsedAt).toLocaleString('vi-VN') })]),
            x.current ? T9.chip('Máy này', 'ok') : T9.btn('Thu hồi', 'ghost sm danger-t', function () { T9.post('api/devices/' + x.id + '/revoke').then(function () { T9.toast('Đã thu hồi'); onChange(); }, T9.fail); }),
          ]);
        }))]),
        d.devices.length > 1 ? h('div', { class: 'btn-row' }, [T9.btn('Đăng xuất mọi máy khác', 'ghost danger-t', function () {
          T9.confirm({ title: 'Đăng xuất các máy khác?', text: 'Chỉ máy này còn đăng nhập.', ok: 'Đăng xuất', danger: true }).then(function (y) { if (y) T9.post('api/logout-others').then(function (r) { T9.toast('Đã đăng xuất ' + r.removed + ' máy'); onChange(); }, T9.fail); });
        })]) : null,
      ]);
    }
    function pairSheet() {
      T9.post('api/devices/pair').then(function (r) {
        var url = new URL('./#/ghep/' + r.code, document.baseURI).href;
        T9.sheet('Mã ghép thiết bị', function (body) {
          body.appendChild(h('div', { class: 'reccode single' }, [h('span', { text: r.code.slice(0, 4) }), h('span', { text: r.code.slice(4, 8) }), h('span', { text: r.code.slice(8) })]));
          body.appendChild(h('p', { class: 'muted center', text: 'Dùng được một lần, hết hạn lúc ' + new Date(r.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + '.' }));
          body.appendChild(h('div', { class: 'btn-row' }, [T9.btn('Chép mã', 'ghost', function () { T9.copy(r.code, 'Đã chép mã'); }), T9.btn('Chép liên kết', 'primary', function () { T9.copy(url, 'Đã chép liên kết'); })]));
          body.appendChild(h('div', { class: 'hint', text: 'Trên máy mới mở liên kết, hoặc vào 9tutor > Tôi đã có tài khoản > Mã ghép thiết bị.' }));
        });
      }, T9.fail);
    }
  };
})();
