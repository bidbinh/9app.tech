/* 9family: tab Gia đình: thành viên, trẻ em, người đón hộ, thông báo đẩy, lịch ICS, cài đặt leo thang. Tài khoản, gia đình, lời mời nằm ở 9app (9id): màn này dẫn sang /id/ hoặc gọi API cùng nguồn gốc. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var TYPES = [['ride', 'Đưa đón'], ['event', 'Sự kiện'], ['important', 'Ngày quan trọng'], ['task', 'Việc chung'], ['family', 'Gia đình'], ['health', 'Sức khỏe'], ['money', 'Tiền']];
  var advOpen = false;
  var push = { ready: false, supported: false, ios: false, standalone: false, permission: 'default', subscribed: false, types: [] };

  // ---------- Web Push phía trình duyệt ----------
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function b64ToBytes(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a;
  }
  function refreshPush(fid) {
    push.supported = pushSupported();
    push.ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    push.standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    push.permission = 'Notification' in window ? Notification.permission : 'denied';
    if (!push.supported) { push.ready = true; return Promise.resolve(); }
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    }).then(function (sub) {
      if (!sub) { push.subscribed = false; push.types = []; push.endpoint = ''; push.ready = true; return; }
      push.endpoint = sub.endpoint;
      return F9.post(F9.fam(fid, '/push/status'), { endpoint: sub.endpoint }).then(function (r) { push.subscribed = r.subscribed; push.types = r.types; push.hide = r.hide !== false; push.ready = true; });
    }).catch(function () { push.ready = true; });
  }
  function enablePush(fid, caps) {
    return Notification.requestPermission().then(function (perm) {
      push.permission = perm;
      if (perm !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Hãy bật quyền thông báo cho trang này trong cài đặt trình duyệt.');
      return navigator.serviceWorker.register('sw.js');
    }).then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(caps.pushKey) }); });
    }).then(function (sub) {
      var j = sub.toJSON();
      return F9.post(F9.fam(fid, '/push/subscribe'), { endpoint: j.endpoint, keys: j.keys, types: TYPES.map(function (t) { return t[0]; }) }).then(function () { return refreshPush(fid); });
    });
  }
  function disablePush(fid) {
    return navigator.serviceWorker.getRegistration().then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; }).then(function (sub) {
      if (!sub) return null;
      var ep = sub.endpoint;
      return F9.post(F9.fam(fid, '/push/unsubscribe'), { endpoint: ep }).then(function () { return sub.unsubscribe(); });
    }).then(function () { return refreshPush(fid); });
  }

  // ---------- màn chính ----------
  F9.me = function (fid) {
    F9.frame({ title: 'Gia đình', fam: { name: F9.famName() }, sub: F9.famName(), tabs: { fid: fid, tab: 'me' }, right: [F9.bell(fid)] });
    F9.skeleton('list');
    refreshPush(fid).then(function () { F9.rerender(); });
    F9.live({
      fetch: function () {
        return F9.loadView(fid, 'me', function () { return F9.get(F9.fam(fid, '/ics')).then(function (a) { return { ics: a.path }; }); });
      },
      render: function (x) { render(fid, x); },
      retick: false, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { F9.me(fid); }); });
  };

  function roleChip(m) { return m.role === 'chu' ? F9.chip('Chủ gia đình', 'brand') : m.role === 'quan_ly' ? F9.chip('Quản lý', 'info') : m.role === 'con' ? F9.chip('Tài khoản của con', '') : null; }

  // Sau khi đổi gì đó ở 9id: báo 9family đọc lại ngay (bỏ đệm 60 giây) rồi vẽ lại
  function afterIdChange(fid) {
    return F9.post(F9.fam(fid, '/resync'), {}).then(function () { F9.dropGate(); return F9.refresh(true); });
  }

  function render(fid, x) {
    var core = x.core; var me = core.me; var mgr = F9.isMgr(core); var owner = me.role === 'chu'; var kidAcc = me.role === 'con';
    F9.setFam(core.family.name);
    var ctx = { fid: fid, core: core, today: core.today };
    var nodes = [];
    var inbox = (core.id && core.id.inbox) || { invitations: 0, approvals: 0 };
    var waiting = inbox.invitations + inbox.approvals;
    var placeholders = core.members.filter(function (m) { return !m.external && m.pending; });
    var invSub = [];
    if (inbox.invitations) invSub.push(inbox.invitations + ' lời mời đang chờ bạn');
    if (inbox.approvals) invSub.push(inbox.approvals + ' người chờ bạn duyệt vào gia đình');
    if (!invSub.length) invSub.push(mgr ? 'Mời người thân vào gia đình' : 'Xem lời mời của bạn');

    // đầu trang: gia đình, chuyển gia đình, lời mời (tài khoản 9app / 9id)
    var links = h('div', { class: 'famlinks' }, [
      F9.link('#/pick', { class: 'list-row' }, [h('span', { class: 'av adult' }, [F9.ico('users', 18)]), h('div', { class: 'col' }, [h('div', { class: 'b', text: 'Chuyển gia đình' }), h('div', { class: 'muted small', text: 'Đổi sang hoặc tạo gia đình khác' })]), F9.ico('chev', 18)]),
      F9.idLink('#/' + (inbox.invitations ? 'loi-moi' : 'gia-dinh/' + fid), { class: 'list-row', 'data-act': 'invites' }, [h('span', { class: 'av adult' }, [F9.ico('link', 18)]), h('div', { class: 'col' }, [h('div', { class: 'b', text: 'Lời mời' }), h('div', { class: 'muted small', text: invSub.join(' · ') })]), waiting ? F9.chip(String(waiting), 'warn') : null, F9.ico('chev', 18)]),
    ]);
    nodes.push(h('div', { class: 'card' }, [
      h('div', { class: 'famhead' }, [h('span', { class: 'av xl fam', 'aria-hidden': 'true', text: F9.initial(core.family.name) }), h('div', { class: 'col' }, [h('div', { class: 'big', text: core.family.name }), h('div', { class: 'muted', text: 'Bạn là ' + me.name + (me.relation && F9.REL[me.relation] && me.relation !== 'khac' ? ' (' + F9.REL[me.relation].toLowerCase() + ')' : '') })]),
        mgr ? F9.idLink('#/gia-dinh/' + fid, { class: 'icon-btn', 'aria-label': 'Đổi tên gia đình (ở tài khoản 9app)' }, [F9.ico('edit', 20)]) : null]),
      links,
    ]));

    // thành viên
    var real = core.members.filter(function (m) { return !m.external; });
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Thành viên (' + real.length + ')' }), mgr ? h('button', { class: 'linkbtn', type: 'button', text: '+ Mời', onclick: function () { inviteSheet(ctx); } }) : null]));
    nodes.push(h('div', { class: 'card tight' }, real.map(function (m) {
      return h('button', { class: 'list-row tap', type: 'button', 'aria-label': 'Thành viên ' + m.name, onclick: function () { memberSheet(ctx, m); } }, [
        F9.avatar(m, 'l'),
        h('div', { class: 'col' }, [h('div', { class: 'b', text: m.name + (m.isMe ? ' (bạn)' : '') }), h('div', { class: 'ev-sub' }, [h('span', { text: F9.REL[m.relation] && m.relation !== 'khac' ? F9.REL[m.relation] : '' }), m.pending ? F9.chip('Chưa nối tài khoản', 'warn') : roleChip(m)])]),
        F9.ico('chev', 18),
      ]);
    })));
    if (mgr && placeholders.length) nodes.push(F9.notice('info', 'Có thành viên cũ chưa nối tài khoản 9app', 'Mời họ bằng số điện thoại (nút + Mời). Khi họ đã vào gia đình, bấm tên họ ở đây và chọn "Gộp" để giữ nguyên ca đưa đón và việc đã giao.'));
    if (!mgr) nodes.push(h('p', { class: 'muted small', text: 'Chỉ chủ gia đình và người quản lý mời người thân hoặc mời ra khỏi gia đình (ở tài khoản 9app).' }));

    // trẻ em
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Trẻ em (' + core.children.length + (kidAcc ? ')' : '/' + core.limits.children + ')') }), mgr && core.children.length < core.limits.children ? h('button', { class: 'linkbtn', type: 'button', text: '+ Thêm con', onclick: function () { childSheet(ctx, null); } }) : null]));
    if (!core.children.length) nodes.push(F9.empty('Chưa có con nào', mgr ? 'Thêm hồ sơ con để đặt lịch học và đưa đón.' : 'Nhờ chủ gia đình thêm hồ sơ con.', mgr ? h('div', { class: 'btn-row' }, [F9.btn('Thêm con', 'primary', function () { childSheet(ctx, null); })]) : null, 'users'));
    core.children.forEach(function (k) {
      var age = k.birthYear ? (F9.vnDate(F9.nowMs()).getUTCFullYear() - k.birthYear) : 0;
      var sub = [k.grade ? 'Lớp ' + k.grade : '', k.school, age > 0 ? age + ' tuổi' : ''].filter(Boolean).join(' · ');
      nodes.push(h('div', { class: 'card' }, [
        h('div', { class: 'kidcard' }, [F9.avatar(k, 'xl'), h('div', { class: 'col' }, [h('div', { class: 'b big', text: k.name }), sub ? h('div', { class: 'muted', text: sub }) : null, k.birthYear ? h('div', { class: 'sr', text: 'Sinh ' + k.birthYear }) : null, k.linked ? h('div', { class: 'small' }, [F9.chip('Đã nối tài khoản của con', 'ok')]) : null, k.note ? h('div', { class: 'small', text: 'Lưu ý đón: ' + k.note }) : null, k.healthNote ? h('div', { class: 'small', text: 'Sức khỏe: ' + k.healthNote }) : null])]),
        mgr ? h('div', { class: 'btn-row' }, [
          F9.link('#/f/' + fid + '/tkb/' + k.id, { class: 'btn ghost sm' }, ['Thời khóa biểu']),
          F9.btn('Sửa hồ sơ', 'ghost sm', function () { childSheet(ctx, k); }),
        ]) : null,
      ]));
    });

    // người đón hộ (không có tài khoản)
    var helpers = core.members.filter(function (m) { return m.external; });
    if (!kidAcc) {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Người đón hộ' }), mgr ? h('button', { class: 'linkbtn', type: 'button', text: '+ Thêm', onclick: function () { helperSheet(ctx, null); } }) : null]));
      if (!helpers.length) nodes.push(h('div', { class: 'card flat' }, [h('div', { class: 'muted', text: 'Người ngoài gia đình đón hộ (cô giáo trông, hàng xóm, xe ôm quen...). Họ không cần dùng app. Lưu số điện thoại và đặc điểm nhận dạng để cả nhà và nhà trường xác nhận.' })]));
      else nodes.push(h('div', { class: 'card tight' }, helpers.map(function (m) {
        return h(mgr ? 'button' : 'div', { class: 'list-row' + (mgr ? ' tap' : ''), type: mgr ? 'button' : null, onclick: mgr ? function () { helperSheet(ctx, m); } : null }, [
          F9.avatar(m, 'l'),
          h('div', { class: 'col' }, [h('div', { class: 'b', text: m.name }), h('div', { class: 'muted small', text: [m.phone, m.note].filter(Boolean).join(' · ') || 'Chưa có số điện thoại' })]),
          mgr ? F9.ico('chev', 18) : null,
        ]);
      })));
    }

    // hiển thị: chữ lớn
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Hiển thị' })]));
    nodes.push(h('div', { class: 'card tight' }, [
      F9.switchRow('Chữ lớn', 'Phóng to chữ cho dễ đọc, máy sẽ nhớ lựa chọn này.', F9.isBig(), function (on) { F9.setBig(on); }),
      h('div', { class: 'muted small', text: 'Giao diện sáng hoặc tối đi theo cài đặt của điện thoại.' }),
    ]));

    // thông báo đẩy
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Thông báo trên máy này' })]));
    nodes.push(pushCard(fid, core));

    // nâng cao: lịch ICS, mốc nhắc
    var adv = h('div', { class: 'more-b' });
    var icsUrl = F9.absUrl(x.d.ics);
    adv.appendChild(h('div', { class: 'b', text: 'Đăng ký lịch vào Google/Apple Calendar' }));
    adv.appendChild(h('div', { class: 'card' }, [
      h('p', { class: 'muted', text: 'Dán link này vào mục "Thêm lịch qua URL" của Google Calendar hoặc Apple Calendar để thấy lịch của gia đình ngay trong lịch điện thoại. Link chỉ đọc, ai có link đều xem được lịch của bạn.' }),
      h('div', { class: 'linkbox mt', text: icsUrl }),
      h('div', { class: 'btn-row' }, [F9.btn('Sao chép link', 'ghost sm', function () { F9.copy(icsUrl, 'Đã sao chép link lịch'); }), F9.btn('Đổi link', 'ghost sm', function () {
        F9.confirm({ title: 'Đổi link lịch?', text: 'Link cũ sẽ ngừng hoạt động. Bạn cần dán link mới vào ứng dụng lịch.', ok: 'Đổi link' }).then(function (y) {
          if (y) F9.post(F9.fam(fid, '/ics/reset'), {}).then(function () { F9.toast('Đã đổi link lịch'); F9.dropGate(); F9.refresh(true); }, F9.fail);
        });
      })]),
    ]));
    if (mgr) { adv.appendChild(h('div', { class: 'b mt', text: 'Mốc nhắc đưa đón' })); adv.appendChild(escCard(ctx)); }
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Nâng cao' })]));
    nodes.push(h('details', { class: 'more', open: advOpen ? true : null, ontoggle: function (e) { advOpen = e.target.open; } }, [h('summary', {}, ['Lịch ICS' + (mgr ? ', mốc nhắc' : ''), F9.ico('chevd', 20)]), adv]));

    // tài khoản 9app
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Tài khoản' })]));
    var acc = h('div', { class: 'card tight' });
    acc.appendChild(h('a', { class: 'list-row', href: '/' }, [h('div', { class: 'col b', text: 'Về trang 9app' }), F9.ico('chev', 18)]));
    acc.appendChild(F9.idLink('#/tai-khoan', { class: 'list-row' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: 'Tài khoản 9app' }), h('div', { class: 'muted small', text: 'Tên, mật khẩu, thiết bị đăng nhập, đăng xuất' })]), F9.ico('chev', 18)]));
    acc.appendChild(F9.link('#/new', { class: 'list-row' }, [h('div', { class: 'col b', text: 'Tạo gia đình khác' }), F9.ico('chev', 18)]));
    acc.appendChild(F9.idLink('#/gia-dinh/' + fid, { class: 'list-row' }, [h('div', { class: 'col' }, [h('div', { class: 'b ' + (owner ? '' : 'danger-t'), text: owner ? 'Chuyển quyền chủ, rời hoặc xóa gia đình' : 'Rời gia đình' }), h('div', { class: 'muted small', text: 'Thực hiện ở tài khoản 9app' })]), F9.ico('chev', 18)]));
    nodes.push(acc);
    nodes.push(h('p', { class: 'muted small center', text: '9family không quảng cáo, không bán dữ liệu và không theo dõi vị trí.' }));
    F9.mount(nodes);
  }

  function pushCard(fid, core) {
    var card = h('div', { class: 'card' });
    var caps = core.caps;
    if (!caps.push) { card.appendChild(h('p', { class: 'muted', text: 'Máy chủ chưa bật thông báo đẩy. Bạn vẫn xem được thông báo trong app (biểu tượng chuông).' })); return card; }
    if (!push.ready) { card.appendChild(h('div', { class: 'skel short' })); return card; }
    if (!push.supported) {
      card.appendChild(h('p', { class: 'muted', text: 'Trình duyệt này chưa hỗ trợ thông báo đẩy. Bạn vẫn xem được thông báo trong app.' }));
      if (push.ios) card.appendChild(F9.notice('info', 'Trên iPhone', 'Bấm nút Chia sẻ, chọn "Thêm vào Màn hình chính", rồi mở 9family từ biểu tượng đó và bật thông báo.'));
      return card;
    }
    if (push.ios && !push.standalone) {
      card.appendChild(F9.notice('warn', 'Trên iPhone cần thêm vào Màn hình chính', 'Bấm nút Chia sẻ trong Safari, chọn "Thêm vào Màn hình chính", mở 9family từ biểu tượng mới rồi quay lại đây để bật thông báo.'));
      return card;
    }
    if (push.permission === 'denied') { card.appendChild(F9.notice('warn', 'Thông báo đang bị chặn', 'Hãy cho phép thông báo cho trang này trong cài đặt trình duyệt, rồi quay lại đây.')); return card; }
    if (!push.subscribed) {
      card.appendChild(h('p', { class: 'muted', text: 'Nhận nhắc đưa đón và sự kiện ngay cả khi không mở app. Mặc định thông báo trên màn hình khóa chỉ ghi chung chung (không tên con, địa điểm); ghi chú y tế không bao giờ nằm trong thông báo.' }));
      var on = F9.btn('Bật thông báo trên máy này', 'primary block', function () {
        return F9.busy(on, function () { return enablePush(fid, caps).then(function () { F9.toast('Đã bật thông báo'); F9.rerender(); }); });
      });
      card.appendChild(on);
      return card;
    }
    card.appendChild(h('div', { class: 'row' }, [h('div', { class: 'col b', text: 'Đã bật trên máy này' }), F9.chip('Bật', 'ok')]));
    var hideCb = h('input', { type: 'checkbox', id: 'pt-hide' }); hideCb.checked = push.hide !== false;
    hideCb.addEventListener('change', function () {
      F9.post(F9.fam(fid, '/push/types'), { endpoint: push.endpoint, hide: hideCb.checked }).then(function () { push.hide = hideCb.checked; F9.toast('Đã lưu'); }, function (e) { hideCb.checked = !hideCb.checked; F9.fail(e); });
    });
    card.appendChild(h('label', { class: 'check mt', for: 'pt-hide' }, [hideCb, 'Ẩn tên con và địa điểm trên màn hình khóa']));
    card.appendChild(h('div', { class: 'lab mt', text: 'Loại thông báo cần nhận' }));
    TYPES.forEach(function (t) {
      var cb = h('input', { type: 'checkbox', id: 'pt-' + t[0] }); cb.checked = push.types.indexOf(t[0]) >= 0;
      cb.addEventListener('change', function () {
        var next = TYPES.map(function (x) { return x[0]; }).filter(function (k) { return k === t[0] ? cb.checked : push.types.indexOf(k) >= 0; });
        F9.post(F9.fam(fid, '/push/types'), { endpoint: push.endpoint, types: next }).then(function () { push.types = next; F9.toast('Đã lưu'); }, function (e) { cb.checked = !cb.checked; F9.fail(e); });
      });
      card.appendChild(h('label', { class: 'check', for: 'pt-' + t[0] }, [cb, t[1]]));
    });
    card.appendChild(h('div', { class: 'btn-row' }, [F9.btn('Tắt thông báo trên máy này', 'ghost sm', function (e) {
      var b = e.currentTarget; return F9.busy(b, function () { return disablePush(fid).then(function () { F9.toast('Đã tắt thông báo'); F9.rerender(); }); });
    })]));
    return card;
  }

  function escCard(ctx) {
    var e = ctx.core.family.esc;
    var inputs = {};
    function num(k, label, hint) {
      var i = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '180', value: String(e[k]), 'data-k': 'esc-' + k });
      inputs[k] = i; return F9.field(label, i, hint);
    }
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var save = F9.btn('Lưu mốc nhắc', 'primary block', function () {
      err.className = 'hint err hidden';
      return F9.busy(save, function () {
        var v = {}; Object.keys(inputs).forEach(function (k) { v[k] = Number(inputs[k].value); });
        return F9.post(F9.fam(ctx.fid, '/settings'), { esc: v }).then(function () { F9.toast('Đã lưu mốc nhắc'); F9.dropGate(); return F9.refresh(true); }, function (er) { err.textContent = er.message; err.className = 'hint err'; throw er; });
      });
    });
    return h('div', {}, [
      h('div', { class: 'card' }, [
        h('p', { class: 'muted', text: 'Tính theo số phút trước giờ ca. Nếu chưa ai bấm Tôi nhận, app nhắc lần lượt người phụ trách, người dự phòng rồi cả nhà.' }),
        num('t1', 'Nhắc người phụ trách (phút trước giờ ca)'), num('t2', 'Nhắc người dự phòng thứ nhất, báo người phụ trách'), num('t3', 'Nhắc người dự phòng thứ hai'),
        num('t4', 'Báo cả gia đình "chưa ai nhận"'), num('after', 'Nhắc cả nhà nếu quá giờ ca bao nhiêu phút mà chưa xong', 'Các mốc trước giờ ca phải giảm dần: 30, 20, 10, 5 là mặc định.'),
        err, h('div', { class: 'mt' }, [save]),
      ]),
    ]);
  }

  // ---------- các bảng nhập ----------
  // Mời người lớn bằng số điện thoại: gọi 9id (cùng nguồn gốc). Người được mời phải chấp nhận, rồi chủ/quản lý duyệt (theo cài đặt của gia đình).
  function inviteSheet(ctx) {
    F9.sheet('Mời người thân', function (body, close) {
      var phone = F9.text({ inputmode: 'tel', maxlength: 20, placeholder: 'Số điện thoại, ví dụ 0912 345 678', autocomplete: 'off', 'data-k': 'inv-phone' });
      var label = F9.text({ maxlength: 40, placeholder: 'Ví dụ: Bà nội (không bắt buộc)' });
      var roles = [['thanh_vien', 'Thành viên (xem lịch, nhận ca đưa đón)']];
      if (ctx.core.me.role === 'chu') roles.push(['quan_ly', 'Người quản lý (thêm con, đặt lịch đưa đón)']);
      var role = F9.select(roles, 'thanh_vien');
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var go = F9.btn('Gửi lời mời', 'primary block', function () {
        err.className = 'hint err hidden';
        return F9.busy(go, function () {
          return F9.idApi('POST', '/families/' + ctx.fid + '/invites', { phone: phone.value, role: role.value, label: label.value }, 'inv' + ctx.fid).then(function (r) {
            close(); F9.toast((r && r.notice) || 'Đã gửi lời mời');
          }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Người được mời cần có tài khoản 9app (đăng ký bằng đúng số này). Họ sẽ thấy lời mời trong 9app và bấm chấp nhận; sau đó chủ gia đình hoặc người quản lý duyệt.' }));
      body.appendChild(F9.field('Số điện thoại', phone)); body.appendChild(F9.field('Ghi chú', label)); body.appendChild(F9.field('Vai trò', role));
      body.appendChild(err); body.appendChild(go);
      body.appendChild(h('div', { class: 'center mt' }, [F9.idLink('#/gia-dinh/' + ctx.fid, { class: 'linkbtn' }, ['Xem và thu hồi lời mời ở tài khoản 9app'])]));
    });
  }

  function memberSheet(ctx, m) {
    var core = ctx.core; var me = core.me; var mgr = F9.isMgr(core);
    F9.sheet(m.name, function (body, close) {
      var canRel = m.isMe || (mgr && m.role !== 'chu' && (me.role === 'chu' || m.role === 'thanh_vien'));
      body.appendChild(h('div', { class: 'row' }, [h('div', { class: 'avatar', text: F9.initial(m.name) }), h('div', { class: 'col' }, [h('div', { class: 'muted', text: F9.REL[m.relation] && m.relation !== 'khac' ? F9.REL[m.relation] : '' })]), m.pending ? F9.chip('Chưa nối tài khoản', 'warn') : roleChip(m)]));
      if (canRel) {
        var rel = F9.select(F9.RELATIONS.map(function (r) { return [r[0], r[1]]; }), m.relation);
        var save = F9.btn('Lưu', 'primary block', function () {
          return F9.busy(save, function () { return F9.post(F9.fam(ctx.fid, '/members/' + m.id), { relation: rel.value }).then(function () { close(); F9.dropGate(); return F9.refresh(true); }); });
        });
        body.appendChild(F9.field('Vai trò trong nhà', rel)); body.appendChild(save);
      }
      if (m.pending) {
        // thành viên cũ (từ bản dùng không tài khoản): gộp vào người đã có tài khoản 9app, hoặc xóa
        body.appendChild(F9.notice('info', 'Chưa nối tài khoản 9app', 'Người này vào gia đình từ bản cũ chưa có tài khoản. Mời họ bằng số điện thoại, rồi gộp để giữ nguyên ca đưa đón và việc đã giao.'));
        if (mgr) {
          var linked = core.members.filter(function (x) { return !x.external && !x.pending && x.role !== 'con' && !x.isMe; });
          if (linked.length) {
            var into = F9.select(linked.map(function (x) { return [x.id, x.name]; }), linked[0].id);
            var merge = F9.btn('Gộp vào người này', 'ghost block', function () {
              F9.confirm({ title: 'Gộp ' + m.name + ' vào ' + (linked.filter(function (x) { return x.id === into.value; })[0] || {}).name + '?', text: 'Ca đưa đón, việc và thông báo của ' + m.name + ' chuyển sang tài khoản mới. Không hoàn tác được.', ok: 'Gộp' }).then(function (y) {
                if (y) F9.post(F9.fam(ctx.fid, '/members/' + m.id + '/merge'), { into: into.value }).then(function () { close(); F9.toast('Đã gộp'); F9.dropGate(); F9.refresh(true); }, F9.fail);
              });
            });
            body.appendChild(F9.field('Gộp với thành viên đã có tài khoản', into)); body.appendChild(merge);
          }
          body.appendChild(F9.btn('Xóa khỏi danh sách', 'ghost block', function () {
            F9.confirm({ title: 'Xóa ' + m.name + '?', text: 'Các ca đang gán cho người này trở thành chưa gán người.', ok: 'Xóa', danger: true }).then(function (y) {
              if (y) F9.del(F9.fam(ctx.fid, '/members/' + m.id)).then(function () { close(); F9.toast('Đã xóa'); F9.dropGate(); F9.refresh(true); }, F9.fail);
            });
          }));
        }
      } else if (mgr || m.isMe) {
        body.appendChild(h('p', { class: 'muted small', text: 'Tên và quyền của thành viên đổi ở tài khoản 9app.' }));
        body.appendChild(F9.idLink('#/gia-dinh/' + ctx.fid, { class: 'btn ghost block' }, ['Quản lý thành viên ở tài khoản 9app']));
      }
    });
  }

  // Thêm/sửa hồ sơ con. Tên, năm sinh, ghi chú sức khỏe và việc nối tài khoản của con nằm ở 9id (gọi cùng nguồn gốc);
  // trường, lớp, màu, lưu ý đưa đón nằm ở 9family.
  function childSheet(ctx, k) {
    F9.sheet(k ? 'Sửa hồ sơ ' + k.name : 'Thêm con', function (body, close) {
      var name = F9.text({ value: k ? k.name : '', maxlength: 40, placeholder: 'Tên gọi ở nhà, ví dụ: Bống' });
      var year = h('input', { type: 'number', inputmode: 'numeric', min: '1990', max: '2100', value: k && k.birthYear ? String(k.birthYear) : '', placeholder: 'Ví dụ: 2018' });
      var school = F9.text({ value: k ? k.school : '', maxlength: 80, placeholder: 'Tên trường' });
      var grade = F9.text({ value: k ? k.grade : '', maxlength: 20, placeholder: 'Ví dụ: 3A' });
      var note = h('textarea', { maxlength: 300, placeholder: 'Ví dụ: Chờ ở cổng B.' }); note.value = k ? k.note : '';
      var showHealth = !k || k.healthNote !== undefined || (ctx.core.id && !ctx.core.id.notesHidden);
      var health = h('textarea', { maxlength: 300, placeholder: 'Ví dụ: Dị ứng đậu phộng' }); health.value = k && k.healthNote ? k.healthNote : '';
      var phone = !k ? F9.text({ inputmode: 'tel', maxlength: 20, placeholder: 'Không bắt buộc', autocomplete: 'off' }) : null;
      var color = k ? k.color : null;
      var sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Màu nhận diện' });
      function paintSw() {
        F9.clear(sw);
        F9.COLORS.forEach(function (c) {
          sw.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': color === c ? 'true' : 'false', 'aria-label': F9.COLOR_NAME[c], class: 'swatch c-' + c + (color === c ? ' on' : ''), onclick: function () { color = c; paintSw(); } }, [color === c ? F9.ico('check', 20, 3) : null]));
        });
      }
      paintSw();
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = F9.btn(k ? 'Lưu hồ sơ' : 'Thêm con', 'primary block', function () {
        err.className = 'hint err hidden';
        return F9.busy(save, function () {
          var ext = { school: school.value, grade: grade.value, note: note.value };
          if (color) ext.color = color;
          var idBody = { name: name.value, birthYear: year.value ? Number(year.value) : null };
          if (showHealth) idBody.note = health.value;
          var p;
          if (k) {
            var changed = name.value !== k.name || (idBody.birthYear || null) !== (k.birthYear || null) || (showHealth && health.value !== (k.healthNote || ''));
            p = (changed ? F9.idApi('POST', '/families/' + ctx.fid + '/children/' + k.id, idBody) : Promise.resolve()).then(function () { return k.id; });
          } else {
            if (phone.value.trim()) idBody.phone = phone.value;
            p = F9.idApi('POST', '/families/' + ctx.fid + '/children', idBody, 'mkkid' + ctx.fid).then(function (r) { if (r && r.notice && idBody.phone) F9.toast(r.notice); return r.child.id; });
          }
          return p.then(function (cid) {
            return F9.post(F9.fam(ctx.fid, '/resync'), {}).then(function () { return F9.post(F9.fam(ctx.fid, '/children/' + cid), ext); });
          }).then(function () { close(); if (!k) F9.toast('Đã thêm con'); else F9.toast('Đã lưu hồ sơ'); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(F9.field('Tên gọi', name)); body.appendChild(h('div', { class: 'grid2' }, [F9.field('Năm sinh', year), F9.field('Lớp', grade)]));
      body.appendChild(F9.field('Trường', school));
      body.appendChild(F9.field('Lưu ý đưa đón', note, 'Chỉ hiện trong gia đình, không nằm trong thông báo đẩy.'));
      if (showHealth) body.appendChild(F9.field('Ghi chú sức khỏe, dị ứng (lưu ở tài khoản 9app)', health, 'Chỉ người lớn trong gia đình thấy; người mới vào gia đình có thể chưa thấy ngay.'));
      if (phone) body.appendChild(F9.field('Số điện thoại của con (nếu con có tài khoản 9app)', phone, 'Không bắt buộc. Chỉ để nối tài khoản của con vào hồ sơ; con phải tự bấm chấp nhận.'));
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Màu nhận diện' }), sw]));
      body.appendChild(err); body.appendChild(save);
      if (k) {
        if (k.linked) {
          body.appendChild(h('div', { class: 'mt' }, [F9.chip('Đã nối tài khoản của con', 'ok')]));
          body.appendChild(F9.btn('Gỡ nối tài khoản của con', 'ghost block', function () {
            F9.confirm({ title: 'Gỡ nối tài khoản của ' + k.name + '?', text: 'Con không còn xem được lịch trong gia đình. Hồ sơ và lịch vẫn còn.', ok: 'Gỡ nối', danger: true }).then(function (y) {
              if (y) F9.idApi('POST', '/families/' + ctx.fid + '/children/' + k.id + '/unlink', {}).then(function () { close(); F9.toast('Đã gỡ nối'); return afterIdChange(ctx.fid); }, F9.fail);
            });
          }));
        } else {
          var cp = F9.text({ inputmode: 'tel', maxlength: 20, placeholder: 'Số điện thoại tài khoản của con' });
          var cpb = F9.btn('Gửi lời mời nối tài khoản', 'ghost block', function () {
            return F9.busy(cpb, function () {
              return F9.idApi('POST', '/families/' + ctx.fid + '/children/' + k.id + '/phone', { phone: cp.value }, 'kidphone' + k.id).then(function (r) { close(); F9.toast((r && r.notice) || 'Đã gửi lời mời'); });
            });
          });
          body.appendChild(F9.field('Nối tài khoản của con (không bắt buộc)', cp, 'Con tự bấm chấp nhận trong 9app thì mới nối.')); body.appendChild(cpb);
        }
        body.appendChild(F9.btn('Lưu trữ hồ sơ con', 'ghost block', function () {
          F9.confirm({ title: 'Lưu trữ hồ sơ ' + k.name + '?', text: 'Hồ sơ ẩn khỏi danh sách, lịch đưa đón định kỳ của con được gỡ. Lịch sử đã có vẫn còn. Khôi phục ở tài khoản 9app.', ok: 'Lưu trữ', danger: true }).then(function (y) {
            if (y) F9.idApi('POST', '/families/' + ctx.fid + '/children/' + k.id + '/archive', { archived: true }).then(function () { close(); F9.toast('Đã lưu trữ'); return afterIdChange(ctx.fid); }, F9.fail);
          });
        }));
      }
    });
  }

  function helperSheet(ctx, m) {
    F9.sheet(m ? 'Sửa ' + m.name : 'Thêm người đón hộ', function (body, close) {
      var name = F9.text({ value: m ? m.name : '', placeholder: 'Ví dụ: Cô Hoa hàng xóm' });
      var phone = F9.text({ value: m ? m.phone : '', maxlength: 20, placeholder: 'Số điện thoại', inputmode: 'tel', type: 'text' });
      var note = h('textarea', { maxlength: 200, placeholder: 'Ví dụ: Áo xanh, xe Vision biển 29-B1 123.45' }); note.value = m ? m.note : '';
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var save = F9.btn(m ? 'Lưu' : 'Thêm người đón hộ', 'primary block', function () {
        return F9.busy(save, function () {
          var p = m ? F9.post(F9.fam(ctx.fid, '/members/' + m.id), { name: name.value, phone: phone.value, note: note.value }) : F9.post(F9.fam(ctx.fid, '/members'), { name: name.value, external: true, phone: phone.value, note: note.value }, { idem: 'mkhelp' + F9.rid().slice(0, 5) });
          return p.then(function () { close(); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Người này không cần cài app. Bạn gán họ vào ca đưa đón, rồi bấm "đã nhận" hộ khi họ báo.' }));
      body.appendChild(F9.field('Họ tên', name)); body.appendChild(F9.field('Số điện thoại', phone)); body.appendChild(F9.field('Nhận dạng (để nhà trường xác nhận)', note));
      body.appendChild(err); body.appendChild(save);
      if (m) body.appendChild(F9.btn('Xóa khỏi danh sách', 'ghost block', function () {
        F9.confirm({ title: 'Xóa ' + m.name + '?', text: 'Các ca đang gán cho người này trở thành chưa gán người.', ok: 'Xóa', danger: true }).then(function (y) {
          if (y) F9.del(F9.fam(ctx.fid, '/members/' + m.id)).then(function () { close(); F9.dropGate(); F9.refresh(true); }, F9.fail);
        });
      }));
    });
  }
})();
