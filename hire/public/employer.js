/* 9hire: phía nhà tuyển dụng. Tài khoản ẩn danh + mã khôi phục, bảng điều khiển, đăng/sửa tin, hộp thư ứng viên. */
(function () {
  'use strict';
  var H9 = window.H9, h = H9.h;

  var STATE = { dang: ['Đang tuyển', 'ok'], het_han: ['Hết hạn', 'bad'], dong: ['Đã đóng', ''], an: ['Bị ẩn', 'bad'] };
  var stateChip = function (st) { var s = STATE[st] || ['', '']; return H9.chip(s[0], s[1]); };

  function needAccount(e, retry) {
    if (e && e.status === 401) { H9.go('#/employer'); return true; }
    return false;
  }

  // ---------- giới thiệu / bảng điều khiển ----------
  H9.employer = function () {
    H9.frame({ title: 'Đăng tuyển', tabs: 'employer' });
    H9.skeleton();
    H9.loadMeta().then(function () { return Promise.all([H9.get('api/employer/me'), H9.get('api/account').catch(function () { return null; })]); }).then(function (rs) {
      if (!rs[0].employer) intro(rs[1]); else dashboard(rs[1]);
    }, function (e) { H9.loadError(e, H9.employer); });
  };

  function intro(acc) {
    H9.frame({ title: 'Đăng tuyển', tabs: 'employer' });
    var name = H9.text({ maxlength: 60, placeholder: 'Ví dụ: Quán Cà Phê Gió, Cửa hàng Minh Anh', autocapitalize: 'words' });
    var agree = H9.checkbox('Mình đồng ý với Điều khoản và cam kết không thu tiền người xin việc', false);
    var go = H9.btn('Bắt đầu đăng tin', 'primary block', function (e) {
      if (name.value.trim().length < 2) { H9.toast('Hãy nhập tên quán hoặc tên bạn', 'err'); return; }
      return H9.busy(e.currentTarget, function () {
        return H9.post('api/employer', { name: name.value.trim() }).then(function (d) { recoveryScreen(d.recoveryCode, function () { H9.go('#/employer/new'); }); });
      });
    }, { disabled: true });
    agree.input.addEventListener('change', function () { go.disabled = !agree.input.checked; });
    H9.mount([
      h('div', { class: 'card' }, [
        h('h1', { class: 'h1', text: 'Tuyển người nhanh cho quán của bạn' }),
        h('ul', { class: 'plain-list' }, [
          h('li', { text: 'Miễn phí, không cần email hay mật khẩu.' }),
          h('li', { text: 'Ứng viên gửi quan tâm kèm số Zalo, bạn gọi hoặc nhắn ngay.' }),
          h('li', { text: 'Tin tự hết hạn, không tồn đọng. Bạn đóng tin bất cứ lúc nào.' }),
        ]),
        H9.notice('brand', 'Không thu phí người xin việc', 'Tin yêu cầu đóng phí, đặt cọc, mua hàng hoặc đa cấp sẽ bị chặn và tài khoản có thể bị khóa.'),
        H9.field('Tên quán, cửa hàng hoặc tên bạn', name), agree.node, h('div', { class: 'btn-row' }, [go]),
      ]),
      h('div', { class: 'center' }, [h('span', { class: 'muted', text: 'Đã có tài khoản? ' }), H9.link('#/employer/recover', { class: 'linkbtn' }, ['Vào lại bằng mã khôi phục'])]),
      nineCard(acc),
    ]);
  }

  function recoveryScreen(code, next) {
    H9.frame({ title: 'Lưu mã khôi phục', narrow: true });
    H9.setCta(null);
    var saved = H9.checkbox('Mình đã lưu mã này ở nơi an toàn', false);
    var cont = H9.btn('Tiếp tục', 'primary block', next, { disabled: true });
    saved.input.addEventListener('change', function () { cont.disabled = !saved.input.checked; });
    H9.mount([h('div', { class: 'card' }, [
      h('h1', { class: 'h1', text: 'Lưu mã khôi phục' }),
      H9.notice('warn', 'Mã chỉ hiện một lần', 'Không có email hay mật khẩu, nên mã này là cách DUY NHẤT để vào lại tài khoản khi đổi điện thoại hoặc xóa dữ liệu trình duyệt. Hãy chụp màn hình hoặc chép vào nơi an toàn. Đừng gửi mã cho ai.'),
      h('div', { class: 'mt' }, [h('div', { class: 'codebox', text: code })]),
      h('div', { class: 'btn-row' }, [
        H9.btn('Sao chép mã', 'ghost', function () { H9.copy(code, 'Đã sao chép mã khôi phục'); }, null, 'copy'),
        H9.btn('Tải về (.txt)', 'ghost', function () {
          var blob = new Blob(['Mã khôi phục 9hire: ' + code + '\nGiữ kín mã này. Ai có mã đều quản lý được tin của bạn.\n'], { type: 'text/plain' });
          var a = h('a', { href: URL.createObjectURL(blob), download: '9hire-ma-khoi-phuc.txt' });
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }, null, 'download'),
      ]),
      saved.node, h('div', { class: 'btn-row' }, [cont]),
    ])]);
  }

  function dashboard(acc) {
    H9.frame({ title: 'Đăng tuyển', tabs: 'employer' });
    H9.get('api/employer/jobs').then(function (d) {
      var open = d.jobs.filter(function (j) { return j.state === 'dang'; });
      var newApps = d.jobs.reduce(function (n, j) { return n + (j.appsNew || 0); }, 0);
      var views = d.jobs.reduce(function (n, j) { return n + (j.contactViews || 0); }, 0);
      var nodes = [
        h('div', { class: 'row sb' }, [h('div', {}, [h('div', { class: 'h2', text: d.employer.name }), h('div', { class: 'muted small', text: 'Tài khoản nhà tuyển dụng' })])]),
        h('div', { class: 'stats' }, [
          h('div', { class: 'stat' }, [h('div', { class: 'n', text: String(open.length) }), h('div', { class: 'l', text: 'Tin đang mở' })]),
          h('div', { class: 'stat' }, [h('div', { class: 'n', text: String(newApps) }), h('div', { class: 'l', text: 'Hồ sơ mới' })]),
          h('div', { class: 'stat' }, [h('div', { class: 'n', text: String(views) }), h('div', { class: 'l', text: 'Lượt xem liên hệ' })]),
        ]),
        H9.link('#/employer/new', { class: 'btn primary block' }, [H9.ico('plus', 20), 'Đăng tin tuyển mới']),
      ];
      if (!d.jobs.length) nodes.push(H9.empty('Chưa có tin nào', 'Đăng tin đầu tiên chỉ mất khoảng 2 phút.'));
      else {
        nodes.push(h('div', { class: 'sec', text: 'Tin của tôi' }));
        d.jobs.forEach(function (j) {
          nodes.push(H9.link('#/employer/job/' + j.id, { class: 'card myjob' }, [
            h('div', { class: 'row sb' }, [h('div', { class: 'title', text: j.title }), stateChip(j.state)]),
            h('div', { class: 'muted small', text: j.district + ' · ' + H9.payText(j) }),
            h('div', { class: 'chips' }, [
              j.appsNew ? H9.chip(j.appsNew + ' hồ sơ mới', 'ok', 'inbox') : H9.chip(j.appsTotal + ' hồ sơ', '', 'inbox'),
              j.appsAccepted ? H9.chip('Đã nhận ' + j.appsAccepted + '/' + j.slots, 'brand') : null,
              j.state === 'dang' ? H9.chip(H9.daysLeft(j.expiresAt), '', 'calendar') : null,
              j.state === 'an' ? H9.chip('Đang chờ xem xét', 'bad') : null,
            ]),
          ]));
        });
      }
      nodes.push(nineCard(acc));
      nodes.push(accountCard(acc));
      H9.mount(nodes);
    }, function (e) { if (!needAccount(e)) H9.loadError(e, function () { dashboard(acc); }); });
  }

  // ---------- thẻ tài khoản 9id (tùy chọn): chỉ hiện khi tích hợp bật và 9id trả lời được ----------
  function loginUrl(acc, mode) {
    // chỉ nhận đường dẫn tương đối cùng nguồn gốc (bắt đầu bằng một dấu /) từ máy chủ; next là trang hiện tại
    if (typeof acc.loginPath !== 'string' || !/^\/(?!\/)/.test(acc.loginPath)) return null;
    return acc.loginPath + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash) + '#/' + mode;
  }
  function nineCard(acc) {
    if (!acc || !acc.enabled || acc.idDown) return null;
    var inUrl = loginUrl(acc, 'dang-nhap'), upUrl = loginUrl(acc, 'dang-ky');
    if (!inUrl) return null;
    if (!acc.loggedIn) {
      return h('div', { class: 'card', id: 'acc-card' }, [
        h('h2', { text: 'Tài khoản 9app (không bắt buộc)' }),
        h('p', { class: 'muted', text: 'Đăng nhập để giữ tài khoản nhà tuyển dụng và dùng trên máy khác mà không cần mã khôi phục. Không đăng nhập vẫn dùng bình thường.' }),
        h('div', { class: 'btn-row' }, [
          H9.btn('Đăng nhập', 'primary', function () { location.assign(inUrl); }),
          H9.btn('Đăng ký', 'ghost', function () { location.assign(upUrl); }),
        ]),
      ]);
    }
    var kids = [h('h2', { text: 'Tài khoản 9app' }), h('p', { text: 'Đã đăng nhập: ' + (acc.user && acc.user.displayName ? acc.user.displayName : 'bạn') })];
    if (acc.claimable) {
      kids.push(h('p', { class: 'muted', text: 'Tài khoản nhà tuyển dụng "' + acc.claimable.employerName + '" trên máy này chưa gắn vào tài khoản 9app.' }));
      var claim = H9.btn('Gắn vào tài khoản', 'primary block', function (e) {
        return H9.busy(e.currentTarget, function () {
          return H9.post('api/account/claim', {}).then(function (r) {
            H9.toast(r.claimed ? 'Đã gắn vào tài khoản 9app của bạn.' : 'Chưa gắn được, thử lại nhé.', r.claimed ? undefined : 'err');
            H9.employer();
          });
        });
      });
      kids.push(claim);
    }
    if (acc.conflict) {
      kids.push(h('p', { class: 'muted', text: 'Tài khoản 9app này đã có tài khoản nhà tuyển dụng, nên "' + acc.conflict.employerName + '" trên máy này được giữ riêng.' }));
    }
    kids.push(h('div', { class: 'btn-row' }, [
      h('a', { class: 'btn ghost', href: acc.loginPath + '#/tai-khoan' }, ['Quản lý tài khoản']),
      H9.btn('Đăng xuất 9app', 'ghost', function (e) {
        return H9.busy(e.currentTarget, function () {
          return fetch(acc.loginPath + 'api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': '9id', 'content-type': 'application/json' }, body: '{}' })
            .then(function (r) { if (!r.ok) throw new Error('logout'); location.reload(); }).catch(function () { H9.toast('Chưa đăng xuất được, hãy thử lại.', 'err'); });
        });
      }),
    ]));
    return h('div', { class: 'card', id: 'acc-card' }, kids);
  }

  function accountCard(acc) {
    var signedIn = !!(acc && acc.enabled && acc.loggedIn);   // quyền đến từ tài khoản 9app: thoát bằng nút Đăng xuất 9app, không phải nút này
    return h('div', { class: 'card' }, [
      h('h2', { text: 'Tài khoản trên thiết bị này' }),
      h('p', { class: 'muted', text: 'Mất điện thoại hoặc muốn dùng máy khác: vào lại bằng mã khôi phục.' }),
      h('div', { class: 'btn-row' }, [
        H9.btn('Đổi mã khôi phục', 'ghost sm', function () {
          H9.confirm({ title: 'Đổi mã khôi phục', text: 'Mã mới sẽ hiện một lần và mã cũ hết hiệu lực. Tiếp tục?', ok: 'Tạo mã mới' }).then(function (yes) {
            if (yes) H9.post('api/employer/recovery-code').then(function (d) { recoveryScreen(d.recoveryCode, function () { H9.go('#/employer'); }); }, H9.fail);
          });
        }, null, 'key'),
        signedIn ? null : H9.btn('Đăng xuất', 'ghost sm', function () {
          H9.confirm({ title: 'Đăng xuất', text: 'Bạn cần mã khôi phục để vào lại. Đã lưu mã chưa?', ok: 'Đăng xuất' }).then(function (yes) {
            if (yes) H9.post('api/employer/logout').then(function () { H9.toast('Đã đăng xuất'); H9.employer(); }, H9.fail);
          });
        }, null, 'logout'),
        H9.btn('Xóa tài khoản', 'ghost sm danger-t', function () {
          H9.confirm({ title: 'Xóa tài khoản', text: 'Xóa vĩnh viễn tài khoản, mọi tin và hồ sơ ứng viên? Không hoàn tác được.', ok: 'Xóa tất cả', danger: true }).then(function (yes) {
            if (yes) H9.del('api/employer').then(function () { H9.toast('Đã xóa tài khoản'); H9.employer(); }, H9.fail);
          });
        }, null, 'trash'),
      ]),
    ]);
  }

  // ---------- vào lại bằng mã ----------
  H9.recover = function () {
    H9.frame({ title: 'Vào lại tài khoản', back: '#/employer', narrow: true });
    var code = H9.text({ maxlength: 24, placeholder: 'XXXX-XXXX-XXXX-XXXX', autocapitalize: 'characters', spellcheck: 'false' });
    var err = h('div', { class: 'hint err hidden' });
    code.addEventListener('input', function () {
      var raw = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
      code.value = raw.replace(/(.{4})(?=.)/g, '$1-');
    });
    H9.mount([h('form', { class: 'card', novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, [
      h('h1', { class: 'h1', text: 'Vào lại tài khoản' }),
      h('p', { class: 'muted mt', text: 'Nhập mã khôi phục 16 ký tự bạn đã lưu khi tạo tài khoản.' }),
      H9.field('Mã khôi phục', code), err,
      h('div', { class: 'btn-row' }, [H9.btn('Vào lại', 'primary block', function (e) {
        err.classList.add('hidden');
        return H9.busy(e.currentTarget, function () {
          return H9.post('api/employer/recover', { code: code.value }).then(function () { H9.toast('Đã vào lại tài khoản'); H9.go('#/employer'); }, function (er) { err.textContent = er.message; err.classList.remove('hidden'); throw er; });
        });
      })]),
    ])]);
  };

  // ---------- đăng / sửa tin ----------
  H9.jobForm = function (id) {
    H9.frame({ title: id ? 'Sửa tin' : 'Đăng tin tuyển', back: id ? '#/employer/job/' + id : '#/employer', narrow: true });
    H9.skeleton();
    H9.loadMeta().then(function () {
      return Promise.all([H9.get('api/employer/me'), id ? H9.get('api/employer/jobs/' + id) : Promise.resolve(null)]);
    }).then(function (r) {
      if (!r[0].employer) { H9.go('#/employer'); return; }
      buildForm(r[0].employer, r[1] && r[1].job, id);
    }, function (e) { if (!needAccount(e)) H9.loadError(e, function () { H9.jobForm(id); }); });
  };

  function buildForm(emp, cur, id) {
    var M = H9.meta; cur = cur || {};
    var title = H9.text({ value: cur.title || '', maxlength: 80, placeholder: 'Ví dụ: Phục vụ quán cà phê ca tối', autocapitalize: 'sentences' });
    var company = H9.text({ value: cur.company || emp.name, maxlength: 60 });
    var kind = H9.select(M.kinds, cur.kind || 'ban_tg');
    var cat = H9.select(M.categories, cur.category || 'phuc_vu');
    var desc = h('textarea', { maxlength: 2000, placeholder: 'Làm gì, ở đâu, giờ giấc, quyền lợi (cơm, thưởng, đào tạo...). Đừng ghi số điện thoại hay link ở đây.' }); desc.value = cur.description || '';
    var descCount = h('div', { class: 'counter' });
    desc.addEventListener('input', function () { descCount.textContent = desc.value.length + '/2000'; }); descCount.textContent = desc.value.length + '/2000';
    var req = h('textarea', { maxlength: 800, placeholder: 'Độ tuổi, kinh nghiệm, kỹ năng... (không bắt buộc)' }); req.value = cur.requirements || '';
    var payType = H9.select(M.payTypes.map(function (p) { return [p[0], p[0] === 'thoa_thuan' ? 'Thỏa thuận' : 'Trả theo ' + p[1]]; }), cur.payType || 'gio');
    var payMin = H9.text({ inputmode: 'decimal', placeholder: 'Từ (ví dụ 25k)', maxlength: 14, value: cur.payMin ? String(cur.payMin) : '' });
    var payMax = H9.text({ inputmode: 'decimal', placeholder: 'Đến (không bắt buộc)', maxlength: 14, value: cur.payMax ? String(cur.payMax) : '' });
    var payWrap = h('div', { class: 'grid2' }, [H9.field('Lương thấp nhất', payMin), H9.field('Lương cao nhất', payMax)]);
    var payHint = h('div', { class: 'hint', text: 'Gõ 25k = 25.000đ, 8tr = 8.000.000đ.' });
    function syncPay() { var neg = payType.value === 'thoa_thuan'; payWrap.classList.toggle('hidden', neg); payHint.classList.toggle('hidden', neg); }
    payType.addEventListener('change', syncPay); syncPay();
    var shifts = H9.multi(M.shifts, cur.shifts || []);
    var shiftNote = H9.text({ value: cur.shiftNote || '', maxlength: 100, placeholder: 'Ví dụ: 17h - 22h, nghỉ thứ Hai' });
    var city = H9.select(M.cities, cur.city || 'hcm');
    var dl = h('datalist', { id: 'dl-form' });
    var district = H9.text({ value: cur.district || '', maxlength: 40, list: 'dl-form', placeholder: 'Ví dụ: Quận 1, Cầu Giấy' });
    function drawDl() { H9.clear(dl); (H9.DISTRICTS[city.value] || []).forEach(function (d) { dl.appendChild(h('option', { value: d })); }); }
    city.addEventListener('change', drawDl); drawDl();
    var address = H9.text({ value: cur.address || '', maxlength: 120, placeholder: 'Số nhà, đường (không bắt buộc)' });
    var cname = H9.text({ value: cur.contactName || '', maxlength: 50, placeholder: 'Ví dụ: Chị Lan' });
    var cphone = H9.text({ value: cur.contactPhone || '', maxlength: 16, inputmode: 'tel', placeholder: '0912 345 678' });
    var now = H9.checkbox('Cần người bắt đầu ngay', cur.startNow !== undefined ? cur.startNow : false);
    var slots = cur.slots || 1;
    var slotsV = h('div', { class: 'qv', text: String(slots) });
    var stepper = h('div', { class: 'stepper' }, [
      h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Giảm', onclick: function () { if (slots > 1) { slots--; slotsV.textContent = String(slots); } } }, ['−']),
      slotsV,
      h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Tăng', onclick: function () { if (slots < 100) { slots++; slotsV.textContent = String(slots); } } }, ['+']),
    ]);
    var days = H9.select([[7, '7 ngày'], [14, '14 ngày'], [21, '21 ngày'], [30, '30 ngày']].map(function (d) { return [String(d[0]), d[1]]; }), String(H9.meta.defaultDays));
    var errBox = h('div', { class: 'hidden' });

    function showErr(e) {
      H9.clear(errBox); errBox.classList.remove('hidden');
      var extra = null;
      if (e.details && e.details.fields) extra = h('div', { class: 'small', text: 'Mục cần sửa: ' + e.details.fields.join(', ') });
      errBox.appendChild(H9.notice('bad', e.code === 'scam_blocked' ? 'Tin chưa đăng được' : (e.code === 'contact_in_text' ? 'Đừng ghi liên hệ vào mô tả' : 'Chưa lưu được'), e.message, extra));
      errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    var form = h('form', { novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, [
      errBox,
      H9.notice('brand', 'Tin chuẩn, tuyển nhanh hơn', 'Ghi rõ lương, ca và địa điểm. 9hire chặn tin thu phí, đặt cọc, ép mua hàng, đa cấp và tin có số điện thoại hay link trong mô tả.'),
      h('div', { class: 'sec in', text: 'Công việc' }),
      H9.field('Vị trí cần tuyển', title), H9.field('Tên quán, cửa hàng', company),
      h('div', { class: 'grid2' }, [H9.field('Loại việc', kind), H9.field('Nhóm nghề', cat)]),
      H9.field('Mô tả công việc', desc), descCount, H9.field('Yêu cầu', req),
      h('div', { class: 'sec in', text: 'Lương, ca làm' }),
      H9.field('Hình thức trả lương', payType), payWrap, payHint,
      h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Ca làm' }), shifts.node]), H9.field('Giờ làm cụ thể', shiftNote),
      h('div', { class: 'sec in', text: 'Địa điểm' }),
      H9.field('Thành phố', city), H9.field('Quận, huyện', district), dl, H9.field('Địa chỉ cụ thể', address, 'Chỉ hiện cho người đã đọc cảnh báo an toàn và bấm xem liên hệ.'),
      h('div', { class: 'sec in', text: 'Liên hệ' }),
      h('div', { class: 'grid2' }, [H9.field('Người liên hệ', cname), H9.field('Số điện thoại / Zalo', cphone)]),
      h('p', { class: 'hint', text: 'Số này chỉ hiện sau khi người xem xác nhận đã đọc cảnh báo. Người xem nhắn Zalo theo chính số này.' }),
      h('div', { class: 'sec in', text: 'Tuyển' }),
      h('div', { class: 'row sb' }, [h('div', { class: 'lab', text: 'Số người cần tuyển' }), stepper]),
      now.node,
      id ? null : H9.field('Đăng trong', days, 'Hết hạn tin tự ẩn. Bạn gia hạn hoặc đóng sớm bất cứ lúc nào.'),
      h('div', { class: 'btn-row' }, [H9.btn(id ? 'Lưu thay đổi' : 'Đăng tin', 'primary block', function (e) {
        var body = {
          title: title.value, company: company.value, kind: kind.value, category: cat.value, description: desc.value, requirements: req.value,
          payType: payType.value, shifts: shifts.get(), shiftNote: shiftNote.value, city: city.value, district: district.value, address: address.value,
          contactName: cname.value, contactPhone: cphone.value, startNow: now.input.checked, slots: slots,
        };
        if (payType.value !== 'thoa_thuan') {
          var a = H9.parseMoney(payMin.value), b = payMax.value.trim() ? H9.parseMoney(payMax.value) : null;
          if (isNaN(a)) { H9.toast('Hãy nhập mức lương thấp nhất, ví dụ 25k', 'err'); payMin.focus(); return; }
          if (b !== null && isNaN(b)) { H9.toast('Lương cao nhất chưa đúng, ví dụ 30k', 'err'); payMax.focus(); return; }
          body.payMin = a; body.payMax = b;
        }
        if (!id) body.days = Number(days.value);
        errBox.classList.add('hidden');
        return H9.busy(e.currentTarget, function () {
          var p = id ? H9.put('api/employer/jobs/' + id, body) : H9.post('api/employer/jobs', body);
          return p.then(function (d) { H9.toast(id ? 'Đã lưu thay đổi' : 'Đã đăng tin. Chúc bạn tuyển được người!'); H9.go('#/employer/job/' + d.job.id); }, function (er) { if (er.status === 401) { needAccount(er); throw er; } if (er.status === 400 || er.status === 409 || er.status === 429) { showErr(er); } throw er; });
        });
      })]),
    ]);
    H9.mount([h('div', { class: 'card' }, [form])]);
  }

  // ---------- hộp thư ứng viên ----------
  H9.inbox = function (id, status) {
    H9.frame({ title: 'Hồ sơ ứng viên', back: '#/employer', narrow: true });
    H9.skeleton();
    H9.loadMeta().then(function () { return Promise.all([H9.get('api/employer/jobs/' + id), H9.get('api/employer/jobs/' + id + '/applications' + (status ? '?status=' + status : ''))]); }).then(function (r) {
      draw(r[0].job, r[1], status || '');
    }, function (e) { if (!needAccount(e)) H9.loadError(e, function () { H9.inbox(id, status); }); });
  };

  function draw(job, box, filter) {
    var nodes = [];
    var accepted = box.counts.nhan || 0;
    var total = Object.keys(box.counts).reduce(function (n, k) { return n + box.counts[k]; }, 0);
    var canAct = job.status !== 'an';
    if (job.status === 'an') nodes.push(H9.notice('bad', 'Tin đang tạm ẩn để xem xét', 'Lý do: ' + (job.hiddenReason === 'quan_tri' ? 'quản trị 9app ẩn tin.' : 'có nhiều người báo cáo.') + ' Bạn chưa sửa hay mở lại được. Nếu tin đúng là việc làm bình thường, hãy gửi khiếu nại, quản trị sẽ duyệt.' + (job.appealedAt ? ' Bạn đã gửi khiếu nại, đang chờ duyệt.' : ''),
      job.appealedAt ? null : h('div', { class: 'btn-row' }, [H9.btn('Gửi khiếu nại', 'primary sm', function () {
        H9.sheet('Khiếu nại tin bị ẩn', function (body, close) {
          var note = h('textarea', { maxlength: 500, placeholder: 'Giải thích vì sao tin của bạn là việc làm thật (tối thiểu 5 ký tự)' });
          body.appendChild(note);
          body.appendChild(H9.btn('Gửi khiếu nại', 'primary block', function (e) { return H9.busy(e.currentTarget, function () { return H9.post('api/employer/jobs/' + job.id + '/appeal', { note: note.value.trim() }).then(function () { close(); H9.toast('Đã gửi khiếu nại'); H9.inbox(job.id, filter); }); }); }));
        });
      })])));
    if (job.state === 'het_han') nodes.push(H9.notice('warn', 'Tin đã hết hạn', 'Người xem không còn thấy tin này. Gia hạn nếu bạn còn cần tuyển.'));
    nodes.push(h('div', { class: 'card' }, [
      h('div', { class: 'row sb' }, [h('h1', { class: 'h2', text: job.title }), stateChip(job.state)]),
      h('div', { class: 'muted', text: job.district + ' · ' + H9.payText(job) }),
      h('div', { class: 'chips' }, [
        H9.chip('Đã nhận ' + accepted + '/' + job.slots, accepted >= job.slots ? 'ok' : 'brand', 'users'),
        job.state === 'dang' ? H9.chip(H9.daysLeft(job.expiresAt), '', 'calendar') : null,
        H9.chip((job.contactViews == null ? 0 : job.contactViews) + ' lượt xem liên hệ', '', 'eye'),
      ]),
      h('div', { class: 'btn-row' }, [
        canAct ? H9.link('#/employer/edit/' + job.id, { class: 'btn ghost sm' }, [H9.ico('edit', 18), 'Sửa']) : null,
        H9.link('#/job/' + job.id, { class: 'btn ghost sm' }, ['Xem tin công khai']),
        canAct && job.state === 'dang' ? H9.btn('Đóng tin', 'ghost sm', function () {
          H9.confirm({ title: 'Đóng tin', text: 'Tin sẽ ngừng hiển thị và ngừng nhận hồ sơ. Bạn vẫn xem được các hồ sơ đã nhận. Đóng tin?', ok: 'Đóng tin' }).then(function (yes) {
            if (yes) H9.post('api/employer/jobs/' + job.id + '/close').then(function () { H9.toast('Đã đóng tin'); H9.inbox(job.id, filter); }, H9.fail);
          });
        }) : null,
        canAct && job.state !== 'dang' ? H9.btn('Mở lại / gia hạn', 'primary sm', function () { reopenSheet(job, filter); }) : null,
        canAct && job.state === 'dang' ? H9.btn('Gia hạn', 'ghost sm', function () { reopenSheet(job, filter); }) : null,
      ]),
    ]));
    var pills = [['', 'Tất cả', total]].concat(H9.meta.appStatus.map(function (s) { return [s[0], s[1], box.counts[s[0]] || 0]; }));
    nodes.push(h('div', { class: 'quick', role: 'group', 'aria-label': 'Lọc hồ sơ' }, pills.map(function (p) {
      return h('button', { type: 'button', class: 'pill' + (filter === p[0] ? ' on' : ''), 'aria-pressed': filter === p[0] ? 'true' : 'false', onclick: function () { H9.inbox(job.id, p[0]); } }, [p[1] + ' (' + p[2] + ')']);
    })));
    var items = filter ? box.items.filter(function (a) { return a.status === filter; }) : box.items;
    if (!items.length) nodes.push(H9.empty(total ? 'Không có hồ sơ ở mục này' : 'Chưa có hồ sơ nào', total ? null : 'Khi có người gửi quan tâm, tên và số Zalo của họ hiện ở đây.'));
    else {
      var card = h('div', { class: 'card' });
      items.forEach(function (a) {
        var btns = h('div', { class: 'statusbtns' });
        function paint(cur) {
          H9.clear(btns);
          H9.meta.appStatus.forEach(function (s) {
            btns.appendChild(h('button', { type: 'button', class: cur === s[0] ? 'on' : '', 'aria-pressed': cur === s[0] ? 'true' : 'false', text: s[1], onclick: function (ev) {
              var el = ev.currentTarget; if (el.disabled) return; el.disabled = true;
              H9.post('api/employer/applications/' + a.id + '/status', { status: s[0] }).then(function () { a.status = s[0]; box.counts = recount(box.items); var y = window.scrollY; draw(job, box, filter); window.scrollTo(0, y); H9.toast('Đã đánh dấu: ' + s[1]); }, function (er) { el.disabled = false; H9.fail(er); });
            } }));
          });
        }
        paint(a.status);
        card.appendChild(h('div', { class: 'applicant' }, [
          h('div', { class: 'row' }, [h('div', { class: 'avatar', text: H9.initial(a.name) }), h('div', { class: 'col' }, [h('div', { class: 'nm', text: a.name }), h('div', { class: 'muted small', text: H9.ago(a.createdAt) + ' · ' + a.phone })]), a.startNow ? H9.chip('Bắt đầu ngay', 'hot', 'bolt') : null]),
          a.message ? h('div', { class: 'msg', text: a.message }) : null,
          h('div', { class: 'btn-row' }, [
            h('a', { class: 'btn ghost sm', href: 'tel:' + a.phone }, [H9.ico('phone', 18), 'Gọi']),
            h('a', { class: 'btn zalo sm', href: a.zaloUrl, target: '_blank', rel: 'noopener noreferrer' }, [H9.ico('chat', 18), 'Nhắn Zalo']),
          ]),
          btns,
        ]));
      });
      nodes.push(card);
    }
    if (box.next) nodes.push(h('div', { class: 'more center' }, [H9.btn('Xem thêm hồ sơ', 'ghost', function (e) {
      return H9.busy(e.currentTarget, function () {
        return H9.get('api/employer/jobs/' + job.id + '/applications?before=' + box.next + (filter ? '&status=' + filter : '')).then(function (more) {
          box.items = box.items.concat(more.items); box.next = more.next; var y = window.scrollY; draw(job, box, filter); window.scrollTo(0, y);
        });
      });
    })]));
    if (total > 1) nodes.push(h('div', { class: 'btn-row center' }, [
      (box.counts.moi || 0) > 1 ? H9.btn('Loại tất cả hồ sơ mới', 'ghost sm', function () {
        H9.confirm({ title: 'Loại hàng loạt', text: 'Đánh dấu "Loại" cho tất cả hồ sơ đang ở mục Mới?', ok: 'Loại tất cả' }).then(function (yes) { if (yes) H9.post('api/employer/jobs/' + job.id + '/applications/bulk', { action: 'reject_new' }).then(function () { H9.inbox(job.id, filter); }, H9.fail); });
      }) : null,
      (box.counts.loai || 0) > 0 ? H9.btn('Xóa hồ sơ đã loại', 'ghost sm', function () {
        H9.confirm({ title: 'Xóa hồ sơ đã loại', text: 'Xóa hẳn các hồ sơ đang ở mục Loại?', ok: 'Xóa', danger: true }).then(function (yes) { if (yes) H9.post('api/employer/jobs/' + job.id + '/applications/bulk', { action: 'delete_rejected' }).then(function () { H9.inbox(job.id, filter); }, H9.fail); });
      }) : null,
    ]));
    nodes.push(h('div', { class: 'hint center', text: 'Hồ sơ tự xóa sau ' + H9.meta.retainDays + ' ngày kể từ khi tin kết thúc.' }));
    nodes.push(h('div', { class: 'center' }, [H9.btn('Xóa tin và hồ sơ', 'ghost sm danger-t', function () {
      H9.confirm({ title: 'Xóa tin', text: 'Xóa vĩnh viễn tin này và toàn bộ hồ sơ ứng viên?', ok: 'Xóa', danger: true }).then(function (yes) {
        if (yes) H9.del('api/employer/jobs/' + job.id).then(function () { H9.toast('Đã xóa tin'); H9.go('#/employer'); }, H9.fail);
      });
    }, null, 'trash')]));
    H9.mount(nodes);
  }
  function recount(items) { var c = {}; items.forEach(function (a) { c[a.status] = (c[a.status] || 0) + 1; }); return c; }

  function reopenSheet(job, filter) {
    H9.sheet(job.state === 'dang' ? 'Gia hạn tin' : 'Mở lại tin', function (body, close) {
      var days = 14;
      var pills = h('div', { class: 'pills' });
      function drawP() {
        H9.clear(pills);
        [7, 14, 21, 30].forEach(function (d) { pills.appendChild(h('button', { type: 'button', class: 'pill' + (days === d ? ' on' : ''), 'aria-pressed': days === d ? 'true' : 'false', text: d + ' ngày', onclick: function () { days = d; drawP(); } })); });
      }
      drawP();
      body.appendChild(h('p', { class: 'muted', text: 'Tin hiển thị thêm bao lâu kể từ bây giờ?' }));
      body.appendChild(pills);
      body.appendChild(h('div', { class: 'btn-row' }, [H9.btn('Xác nhận', 'primary block', function (e) {
        return H9.busy(e.currentTarget, function () { return H9.post('api/employer/jobs/' + job.id + '/reopen', { days: days }).then(function () { close(); H9.toast('Tin đang hiển thị'); H9.inbox(job.id, filter); }); });
      })]));
    });
  }
})();
