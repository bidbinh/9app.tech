/* 9family: tab Gia đình: thành viên, trẻ em, người đón hộ, thông báo đẩy, thiết bị, lịch ICS, cài đặt leo thang, rời/xóa gia đình. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var TYPES = [['ride', 'Đưa đón'], ['event', 'Sự kiện'], ['important', 'Ngày quan trọng'], ['task', 'Việc chung'], ['family', 'Gia đình']];
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
      return F9.post(F9.fam(fid, '/push/status'), { endpoint: sub.endpoint }).then(function (r) { push.subscribed = r.subscribed; push.types = r.types; push.ready = true; });
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
    F9.frame({ title: 'Gia đình', tabs: { fid: fid, tab: 'me' }, right: [F9.bell(fid)] });
    F9.skeleton();
    refreshPush(fid).then(function () { F9.rerender(); });
    F9.live({
      fetch: function () {
        return F9.loadView(fid, 'me', function () { return Promise.all([F9.get(F9.fam(fid, '/devices')), F9.get(F9.fam(fid, '/ics'))]).then(function (a) { return { devices: a[0].devices, ics: a[1].path }; }); });
      },
      render: function (x) { render(fid, x); },
      retick: false, every: 10000,
    }).catch(function (e) { F9.loadError(e, function () { F9.me(fid); }); });
  };

  function roleChip(m) { return m.role === 'chu' ? F9.chip('Chủ gia đình', 'brand') : m.role === 'quan_ly' ? F9.chip('Quản lý', 'info') : null; }

  function render(fid, x) {
    var core = x.core; var me = core.me; var mgr = F9.isMgr(core); var owner = me.role === 'chu';
    F9.setTitle(core.family.name);
    var ctx = { fid: fid, core: core, today: core.today };
    var nodes = [];
    // đầu trang
    nodes.push(h('div', { class: 'card' }, [
      h('div', { class: 'row' }, [h('div', { class: 'avatar', text: F9.initial(core.family.name) }), h('div', { class: 'col' }, [h('div', { class: 'big', text: core.family.name }), h('div', { class: 'muted', text: 'Bạn là ' + me.name + ' (' + (F9.REL[me.relation] || '').toLowerCase() + ')' })])]),
      mgr ? h('div', { class: 'btn-row' }, [F9.btn('Đổi tên gia đình', 'ghost sm', function () { renameSheet(ctx); })]) : null,
    ]));

    // thành viên
    var real = core.members.filter(function (m) { return !m.external; });
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Thành viên (' + real.length + ')' }), mgr ? h('button', { class: 'linkbtn', type: 'button', text: '+ Mời', onclick: function () { addMemberSheet(ctx); } }) : null]));
    nodes.push(h('div', { class: 'card' }, real.map(function (m) {
      return h('button', { class: 'list-row tap', type: 'button', 'aria-label': 'Thành viên ' + m.name, onclick: function () { memberSheet(ctx, m, x); } }, [
        h('div', { class: 'avatar', text: F9.initial(m.name) }),
        h('div', { class: 'col' }, [h('div', { class: 'b', text: m.name + (m.isMe ? ' (bạn)' : '') }), h('div', { class: 'muted small', text: F9.REL[m.relation] || '' })]),
        m.pending ? F9.chip('Chưa vào', 'warn') : roleChip(m), F9.ico('chev', 18),
      ]);
    })));
    if (!mgr) nodes.push(h('p', { class: 'muted small', text: 'Chỉ chủ gia đình và người quản lý mời hoặc mời ra khỏi gia đình.' }));

    // trẻ em
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Trẻ em (' + core.children.length + '/' + core.limits.children + ')' }), mgr && core.children.length < core.limits.children ? h('button', { class: 'linkbtn', type: 'button', text: '+ Thêm con', onclick: function () { childSheet(ctx, null); } }) : null]));
    if (!core.children.length) nodes.push(h('div', { class: 'card flat' }, [h('div', { class: 'muted', text: mgr ? 'Chưa có con nào. Thêm hồ sơ con để đặt lịch học và đưa đón.' : 'Chưa có con nào. Nhờ chủ gia đình thêm hồ sơ con.' }), mgr ? h('div', { class: 'btn-row' }, [F9.btn('Thêm con', 'primary', function () { childSheet(ctx, null); })]) : null]));
    core.children.forEach(function (k) {
      var sub = [k.birthYear ? 'Sinh ' + k.birthYear : '', k.school, k.grade ? 'Lớp ' + k.grade : ''].filter(Boolean).join(' · ');
      nodes.push(h('div', { class: 'card c-' + k.color }, [
        h('div', { class: 'row top' }, [h('div', { class: 'avatar kid', text: F9.initial(k.name) }), h('div', { class: 'col' }, [h('div', { class: 'b', text: k.name }), sub ? h('div', { class: 'muted', text: sub }) : null, k.note ? h('div', { class: 'small', text: 'Lưu ý: ' + k.note }) : null])]),
        h('div', { class: 'btn-row' }, [
          mgr ? F9.link('#/f/' + fid + '/tkb/' + k.id, { class: 'btn ghost sm' }, ['Thời khóa biểu']) : null,
          mgr ? F9.btn('Sửa hồ sơ', 'ghost sm', function () { childSheet(ctx, k); }) : null,
        ]),
      ]));
    });

    // người đón hộ
    var helpers = core.members.filter(function (m) { return m.external; });
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Người đón hộ' }), mgr ? h('button', { class: 'linkbtn', type: 'button', text: '+ Thêm', onclick: function () { helperSheet(ctx, null); } }) : null]));
    if (!helpers.length) nodes.push(h('div', { class: 'card flat' }, [h('div', { class: 'muted', text: 'Người ngoài gia đình đón hộ (cô giáo trông, hàng xóm, xe ôm quen...). Họ không cần dùng app. Lưu số điện thoại và đặc điểm nhận dạng để cả nhà và nhà trường xác nhận.' })]));
    else nodes.push(h('div', { class: 'card' }, helpers.map(function (m) {
      return h(mgr ? 'button' : 'div', { class: 'list-row' + (mgr ? ' tap' : ''), type: mgr ? 'button' : null, onclick: mgr ? function () { helperSheet(ctx, m); } : null }, [
        h('div', { class: 'avatar', text: F9.initial(m.name) }),
        h('div', { class: 'col' }, [h('div', { class: 'b', text: m.name }), h('div', { class: 'muted small', text: [m.phone, m.note].filter(Boolean).join(' · ') || 'Chưa có số điện thoại' })]),
        mgr ? F9.ico('chev', 18) : null,
      ]);
    })));

    // thông báo đẩy
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Thông báo trên máy này' })]));
    nodes.push(pushCard(fid, core));

    // thiết bị
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Thiết bị của bạn' }), h('button', { class: 'linkbtn', type: 'button', text: '+ Thêm thiết bị', onclick: function () { deviceLinkSheet(ctx); } })]));
    nodes.push(h('div', { class: 'card' }, x.d.devices.map(function (d) {
      return h('div', { class: 'list-row' }, [
        h('div', { class: 'col' }, [h('div', { class: 'b', text: d.label + (d.current ? ' (máy này)' : '') }), h('div', { class: 'muted small', text: 'Dùng gần nhất ' + F9.stamp(Date.parse(d.lastUsedAt), core.today) })]),
        d.current ? null : h('button', { class: 'linkbtn danger-t', type: 'button', text: 'Gỡ', 'aria-label': 'Gỡ thiết bị ' + d.label, onclick: function () {
          F9.confirm({ title: 'Gỡ thiết bị này?', text: 'Thiết bị đó sẽ không vào được gia đình nữa cho tới khi được liên kết lại.', ok: 'Gỡ thiết bị', danger: true }).then(function (y) {
            if (y) F9.del(F9.fam(fid, '/devices/' + d.id)).then(function () { F9.toast('Đã gỡ thiết bị'); F9.dropGate(); F9.refresh(true); }, F9.fail);
          });
        } }),
      ]);
    })));
    nodes.push(h('p', { class: 'muted small', text: 'Mất điện thoại và không còn thiết bị nào? Nhờ chủ gia đình gửi link mời lại cho bạn.' }));

    // ICS
    var icsUrl = F9.absUrl(x.d.ics);
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Đăng ký lịch vào Google/Apple Calendar' })]));
    nodes.push(h('div', { class: 'card' }, [
      h('p', { class: 'muted', text: 'Dán link này vào mục "Thêm lịch qua URL" của Google Calendar hoặc Apple Calendar để thấy lịch của gia đình ngay trong lịch điện thoại. Link chỉ đọc, ai có link đều xem được lịch của bạn.' }),
      h('div', { class: 'linkbox mt', text: icsUrl }),
      h('div', { class: 'btn-row' }, [F9.btn('Sao chép link', 'ghost sm', function () { F9.copy(icsUrl, 'Đã sao chép link lịch'); }), F9.btn('Đổi link', 'ghost sm', function () {
        F9.confirm({ title: 'Đổi link lịch?', text: 'Link cũ sẽ ngừng hoạt động. Bạn cần dán link mới vào ứng dụng lịch.', ok: 'Đổi link' }).then(function (y) {
          if (y) F9.post(F9.fam(fid, '/ics/reset'), {}).then(function () { F9.toast('Đã đổi link lịch'); F9.dropGate(); F9.refresh(true); }, F9.fail);
        });
      })]),
    ]));

    // cài đặt leo thang
    if (mgr) nodes.push(escCard(ctx));

    // tài khoản
    nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Tài khoản' })]));
    var acc = h('div', { class: 'card' });
    acc.appendChild(F9.link('#/pick', { class: 'list-row' }, [h('div', { class: 'col b', text: 'Đổi sang gia đình khác' }), F9.ico('chev', 18)]));
    acc.appendChild(F9.link('#/new', { class: 'list-row' }, [h('div', { class: 'col b', text: 'Tạo gia đình khác' }), F9.ico('chev', 18)]));
    if (owner) acc.appendChild(h('button', { class: 'list-row tap', type: 'button', onclick: function () { transferSheet(ctx); } }, [h('div', { class: 'col b', text: 'Chuyển quyền chủ gia đình' }), F9.ico('chev', 18)]));
    acc.appendChild(h('button', { class: 'list-row tap', type: 'button', onclick: function () { leaveSheet(ctx); } }, [h('div', { class: 'col b danger-t', text: 'Rời gia đình' }), F9.ico('chev', 18)]));
    if (owner) acc.appendChild(h('button', { class: 'list-row tap', type: 'button', onclick: function () { deleteSheet(ctx); } }, [h('div', { class: 'col b danger-t', text: 'Xóa gia đình' }), F9.ico('chev', 18)]));
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
      card.appendChild(h('p', { class: 'muted', text: 'Nhận nhắc đưa đón và sự kiện ngay cả khi không mở app. Nội dung thông báo ngắn gọn, không kèm ghi chú nhạy cảm.' }));
      var on = F9.btn('Bật thông báo trên máy này', 'primary block', function () {
        return F9.busy(on, function () { return enablePush(fid, caps).then(function () { F9.toast('Đã bật thông báo'); F9.rerender(); }); });
      });
      card.appendChild(on);
      return card;
    }
    card.appendChild(h('div', { class: 'row' }, [h('div', { class: 'col b', text: 'Đã bật trên máy này' }), F9.chip('Bật', 'ok')]));
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
      h('div', { class: 'sec' }, [h('span', { text: 'Mốc nhắc đưa đón' })]),
      h('div', { class: 'card' }, [
        h('p', { class: 'muted', text: 'Tính theo số phút trước giờ ca. Nếu chưa ai bấm Tôi nhận, app nhắc lần lượt người phụ trách, người dự phòng rồi cả nhà.' }),
        num('t1', 'Nhắc người phụ trách (phút trước giờ ca)'), num('t2', 'Nhắc người dự phòng thứ nhất, báo người phụ trách'), num('t3', 'Nhắc người dự phòng thứ hai'),
        num('t4', 'Báo cả gia đình "chưa ai nhận"'), num('after', 'Nhắc cả nhà nếu quá giờ ca bao nhiêu phút mà chưa xong', 'Các mốc trước giờ ca phải giảm dần: 30, 20, 10, 5 là mặc định.'),
        err, h('div', { class: 'mt' }, [save]),
      ]),
    ]);
  }

  // ---------- các bảng nhập ----------
  function renameSheet(ctx) {
    F9.sheet('Đổi tên gia đình', function (body, close) {
      var n = F9.text({ value: ctx.core.family.name });
      var save = F9.btn('Lưu', 'primary block', function () {
        return F9.busy(save, function () { return F9.post(F9.fam(ctx.fid, '/settings'), { name: n.value }).then(function () { close(); F9.dropGate(); return F9.refresh(true); }); });
      });
      body.appendChild(F9.field('Tên gia đình', n)); body.appendChild(save);
    });
  }

  function inviteSheet(ctx, inv, name) {
    var url = F9.absUrl(inv.path);
    var msg = 'Mời ' + name + ' vào gia đình "' + ctx.core.family.name + '" trên 9family. Mở link này (dùng được một lần, hết hạn sau 7 ngày): ' + url;
    F9.sheet('Link mời ' + name, function (body) {
      body.appendChild(h('p', { text: 'Gửi link này cho ' + name + ' qua Zalo hoặc tin nhắn. Link chỉ dùng được một lần và hết hạn ngày ' + F9.dmy(F9.todayOf(Date.parse(inv.expiresAt))) + '.' }));
      body.appendChild(h('div', { class: 'linkbox', text: url, 'data-invite': '1' }));
      body.appendChild(h('div', { class: 'btn-row' }, [
        F9.btn('Sao chép link', 'primary', function () { F9.copy(url, 'Đã sao chép link mời'); }),
        F9.btn('Chia sẻ', 'ghost', function () { F9.share('Mời vào gia đình', msg, url); }),
      ]));
      body.appendChild(F9.notice('info', 'Ai mở link trước thì vào trước', 'Hãy chỉ gửi cho đúng người. Nếu gửi nhầm, tạo link mới thì link cũ tự hết hiệu lực.'));
    });
  }

  function addMemberSheet(ctx) {
    F9.sheet('Mời thành viên', function (body, close) {
      var name = F9.text({ placeholder: 'Ví dụ: Bà nội', autocomplete: 'off' });
      var rel = F9.select(F9.RELATIONS.map(function (r) { return [r[0], r[1]]; }), 'nguoi_than');
      var mgr = h('input', { type: 'checkbox', id: 'asmgr' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var go = F9.btn('Tạo link mời', 'primary block', function () {
        err.className = 'hint err hidden';
        return F9.busy(go, function () {
          return F9.post(F9.fam(ctx.fid, '/members'), { name: name.value, relation: rel.value, role: mgr.checked ? 'quan_ly' : undefined }, { idem: 'mkmem' + F9.rid().slice(0, 5) }).then(function (r) {
            close(); F9.dropGate(); F9.refresh(true); setTimeout(function () { inviteSheet(ctx, r.invite, r.member.name); }, 120);
          }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Gõ tên mà cả nhà quen gọi. Người nhận link vào thẳng gia đình với tên này.' }));
      body.appendChild(F9.field('Tên', name)); body.appendChild(F9.field('Vai trò', rel));
      if (ctx.core.me.role === 'chu') body.appendChild(h('label', { class: 'check', for: 'asmgr' }, [mgr, 'Cho làm người quản lý (thêm con, đặt lịch đưa đón)']));
      body.appendChild(err); body.appendChild(go);
    });
  }

  function memberSheet(ctx, m, x) {
    var core = ctx.core; var me = core.me; var mgr = F9.isMgr(core); var owner = me.role === 'chu';
    F9.sheet(m.name, function (body, close) {
      var canEdit = m.isMe || (mgr && m.role !== 'chu' && (me.role === 'chu' || m.role === 'thanh_vien'));
      body.appendChild(h('div', { class: 'row' }, [h('div', { class: 'avatar', text: F9.initial(m.name) }), h('div', { class: 'col' }, [h('div', { class: 'muted', text: F9.REL[m.relation] || '' })]), m.pending ? F9.chip('Chưa vào', 'warn') : roleChip(m)]));
      if (canEdit) {
        var name = F9.text({ value: m.name }); var rel = F9.select(F9.RELATIONS.map(function (r) { return [r[0], r[1]]; }), m.relation);
        var save = F9.btn('Lưu', 'primary block', function () {
          return F9.busy(save, function () { return F9.post(F9.fam(ctx.fid, '/members/' + m.id), { name: name.value, relation: rel.value }).then(function () { close(); F9.dropGate(); return F9.refresh(true); }); });
        });
        body.appendChild(F9.field('Tên', name)); body.appendChild(F9.field('Vai trò trong nhà', rel)); body.appendChild(save);
      }
      if (mgr && !m.isMe && m.role !== 'chu' && (owner || m.role === 'thanh_vien')) {
        var inv = F9.btn(m.pending ? 'Tạo link mời mới' : 'Mời lại (mất điện thoại)', 'ghost block', function () {
          return F9.busy(inv, function () {
            return F9.post(F9.fam(ctx.fid, '/members/' + m.id + '/invite'), {}).then(function (r) { close(); F9.dropGate(); setTimeout(function () { inviteSheet(ctx, r.invite, m.name); }, 120); });
          });
        });
        body.appendChild(inv);
        if (!m.pending) body.appendChild(h('p', { class: 'muted small', text: 'Khi ' + m.name + ' mở link mời lại, các thiết bị cũ của họ bị gỡ. Dữ liệu và lịch phụ trách giữ nguyên.' }));
      }
      if (owner && !m.isMe && !m.pending) {
        body.appendChild(F9.btn(m.role === 'quan_ly' ? 'Bỏ quyền quản lý' : 'Cho làm người quản lý', 'ghost block', function () {
          F9.post(F9.fam(ctx.fid, '/members/' + m.id), { role: m.role === 'quan_ly' ? 'thanh_vien' : 'quan_ly' }).then(function () { close(); F9.dropGate(); F9.refresh(true); }, F9.fail);
        }));
      }
      if (mgr && !m.isMe && m.role !== 'chu' && (owner || m.role === 'thanh_vien')) {
        body.appendChild(F9.btn(m.pending ? 'Hủy lời mời' : 'Mời ra khỏi gia đình', 'ghost block', function () {
          F9.confirm({ title: m.pending ? 'Hủy lời mời?' : 'Mời ' + m.name + ' ra khỏi gia đình?', text: m.pending ? 'Link mời đã gửi sẽ không dùng được nữa.' : m.name + ' sẽ không xem được lịch gia đình nữa. Các ca họ phụ trách trở thành chưa gán người.', ok: m.pending ? 'Hủy lời mời' : 'Mời ra', danger: true }).then(function (y) {
            if (y) F9.del(F9.fam(ctx.fid, '/members/' + m.id)).then(function () { close(); F9.toast('Đã cập nhật'); F9.dropGate(); F9.refresh(true); }, F9.fail);
          });
        }));
      }
    });
  }

  function childSheet(ctx, k) {
    F9.sheet(k ? 'Sửa hồ sơ ' + k.name : 'Thêm con', function (body, close) {
      var name = F9.text({ value: k ? k.name : '', maxlength: 40, placeholder: 'Tên gọi ở nhà, ví dụ: Bống' });
      var year = h('input', { type: 'number', inputmode: 'numeric', min: '1990', max: '2100', value: k && k.birthYear ? String(k.birthYear) : '', placeholder: 'Ví dụ: 2018' });
      var school = F9.text({ value: k ? k.school : '', maxlength: 80, placeholder: 'Tên trường' });
      var grade = F9.text({ value: k ? k.grade : '', maxlength: 20, placeholder: 'Ví dụ: 3A' });
      var note = h('textarea', { maxlength: 300, placeholder: 'Ví dụ: Dị ứng đậu phộng. Chờ ở cổng B.' }); note.value = k ? k.note : '';
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
          var b = { name: name.value, birthYear: year.value ? Number(year.value) : null, school: school.value, grade: grade.value, note: note.value };
          if (color) b.color = color;
          var p = k ? F9.post(F9.fam(ctx.fid, '/children/' + k.id), b) : F9.post(F9.fam(ctx.fid, '/children'), b, { idem: 'mkkid' + F9.rid().slice(0, 5) });
          return p.then(function () { close(); F9.toast(k ? 'Đã lưu hồ sơ' : 'Đã thêm con'); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(F9.field('Tên gọi', name)); body.appendChild(h('div', { class: 'grid2' }, [F9.field('Năm sinh', year), F9.field('Lớp', grade)]));
      body.appendChild(F9.field('Trường', school)); body.appendChild(F9.field('Ghi chú (dị ứng, lưu ý đón)', note, 'Ghi chú chỉ hiện trong gia đình, không nằm trong thông báo đẩy.'));
      body.appendChild(h('div', { class: 'field' }, [h('div', { class: 'lab', text: 'Màu nhận diện' }), sw]));
      body.appendChild(err); body.appendChild(save);
      if (k) body.appendChild(F9.btn('Xóa hồ sơ con', 'ghost block', function () {
        F9.confirm({ title: 'Xóa hồ sơ ' + k.name + '?', text: 'Xóa luôn lịch đưa đón, lịch sử và thời khóa biểu của con. Không khôi phục được.', ok: 'Xóa hồ sơ', danger: true }).then(function (y) {
          if (y) F9.del(F9.fam(ctx.fid, '/children/' + k.id)).then(function () { close(); F9.toast('Đã xóa'); F9.dropGate(); F9.refresh(true); }, F9.fail);
        });
      }));
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

  function deviceLinkSheet(ctx) {
    var timer = null;
    var entry = F9.sheet('Thêm thiết bị', function (body, close) {
      var holder = h('div', {}, [h('div', { class: 'skel' })]);
      body.appendChild(holder);
      F9.post(F9.fam(ctx.fid, '/devices/link'), { origin: location.origin }).then(function (r) {
        F9.clear(holder);
        var left = h('div', { class: 'muted center', 'aria-live': 'off' });
        var exp = Date.parse(r.invite.expiresAt);
        function tick() { var s = Math.max(0, Math.round((exp - F9.nowMs()) / 1000)); left.textContent = s ? 'Còn ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) + ' trước khi link hết hạn' : 'Link đã hết hạn. Đóng bảng này và tạo link mới.'; }
        tick(); timer = setInterval(tick, 1000);
        holder.appendChild(h('p', { text: 'Trên thiết bị mới, quét mã QR này bằng camera hoặc mở link bên dưới. Link dùng một lần và hết hạn sau 10 phút.' }));
        holder.appendChild(h('img', { class: 'qr', src: r.qr, alt: 'Mã QR liên kết thiết bị' }));
        holder.appendChild(left);
        holder.appendChild(h('div', { class: 'linkbox mt', text: r.url }));
        holder.appendChild(h('div', { class: 'btn-row' }, [F9.btn('Sao chép link', 'ghost', function () { F9.copy(r.url, 'Đã sao chép link'); }), F9.btn('Chia sẻ', 'ghost', function () { F9.share('Liên kết thiết bị', 'Mở link này trên thiết bị mới của bạn: ' + r.url, r.url); })]));
      }, function (e) { F9.clear(holder); holder.appendChild(h('p', { class: 'hint err', text: e.message })); });
    });
    entry.onclose = function () { clearInterval(timer); F9.dropGate(); F9.refresh(true); };
  }

  function transferSheet(ctx) {
    var others = ctx.core.members.filter(function (m) { return !m.external && !m.pending && !m.isMe; });
    F9.sheet('Chuyển quyền chủ gia đình', function (body, close) {
      if (!others.length) { body.appendChild(h('p', { class: 'muted', text: 'Chưa có thành viên nào khác đã vào gia đình. Hãy mời họ trước.' })); return; }
      var chosen = null;
      var list = h('div', { class: 'pick-list' });
      function paint() {
        F9.clear(list);
        others.forEach(function (m) { list.appendChild(h('button', { type: 'button', class: 'pick' + (chosen === m.id ? ' on' : ''), 'aria-pressed': chosen === m.id ? 'true' : 'false', onclick: function () { chosen = m.id; paint(); } }, [h('div', { class: 'avatar', text: F9.initial(m.name) }), h('div', { class: 'col b', text: m.name }), chosen === m.id ? F9.ico('check', 22) : null])); });
      }
      paint();
      var go = F9.btn('Chuyển quyền', 'primary block', function () {
        if (!chosen) { F9.toast('Hãy chọn một người', 'err'); return; }
        return F9.busy(go, function () { return F9.post(F9.fam(ctx.fid, '/transfer'), { memberId: chosen }).then(function () { close(); F9.toast('Đã chuyển quyền chủ gia đình'); F9.dropGate(); return F9.refresh(true); }); });
      });
      body.appendChild(h('p', { class: 'muted', text: 'Người được chọn trở thành chủ gia đình. Bạn trở thành người quản lý.' })); body.appendChild(list); body.appendChild(go);
    });
  }

  function leaveSheet(ctx) {
    F9.sheet('Rời gia đình', function (body, close) {
      body.appendChild(h('p', { text: 'Bạn sẽ không xem được lịch của "' + ctx.core.family.name + '" nữa. Các ca bạn đang phụ trách trở thành chưa gán người. Muốn quay lại cần được mời lại.' }));
      var go = F9.btn('Rời gia đình', 'danger block', function () {
        return F9.busy(go, function () {
          return F9.post(F9.fam(ctx.fid, '/leave'), {}).then(function () { close(); F9.store('last', null); F9.dropGate(); F9.toast('Bạn đã rời gia đình'); F9.go('#/'); });
        });
      });
      body.appendChild(go);
    });
  }

  function deleteSheet(ctx) {
    F9.sheet('Xóa gia đình', function (body, close) {
      var confirmIn = F9.text({ placeholder: ctx.core.family.name, maxlength: 60 });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var go = F9.btn('Xóa vĩnh viễn', 'danger block', function () {
        return F9.busy(go, function () {
          return F9.post(F9.fam(ctx.fid, '/delete'), { confirm: confirmIn.value }).then(function () { close(); F9.store('last', null); F9.dropGate(); F9.toast('Đã xóa gia đình'); F9.go('#/'); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      });
      body.appendChild(F9.notice('bad', 'Không thể khôi phục', 'Toàn bộ lịch, ca đưa đón, lịch sử và thông báo của gia đình bị xóa cho mọi thành viên.'));
      body.appendChild(F9.field('Gõ tên gia đình để xác nhận: ' + ctx.core.family.name, confirmIn)); body.appendChild(err); body.appendChild(go);
    });
  }
})();
