/* 9family: màn vào đầu tiên: chào + đăng nhập/đăng ký tài khoản 9app, chọn gia đình, tạo gia đình, lời mời. Tài khoản và gia đình nằm ở 9app (9id). */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;

  function relSelect(cur) {
    return F9.select(F9.RELATIONS.map(function (r) { return [r[0], r[1]]; }), cur || 'me');
  }

  // Chưa đăng nhập: màn chào với nút Đăng nhập / Đăng ký (dẫn sang 9app, quay lại đúng trang này sau khi xong)
  function welcome() {
    F9.setTabs(null); F9.setFab(null); F9.setCta(null);
    F9.frame({ title: '9family' });
    F9.mount([
      h('div', { class: 'hero' }, [h('img', { src: 'icon.svg', alt: '' }), h('h1', { class: 'h1', text: 'Chào mừng đến 9family' }),
        h('p', { class: 'sub mt', text: 'Biết hôm nay con học gì, ai đưa, ai đón. Không để con phải chờ vì không ai nhận ca đón.' })]),
      h('div', { class: 'card' }, [
        h('p', { class: 'muted', text: '9family dùng tài khoản 9app (số điện thoại và mật khẩu), dùng chung cho mọi app 9app. Đăng nhập hoặc đăng ký rồi quay lại đây.' }),
        h('div', { class: 'btn-row mt' }, [
          h('a', { class: 'btn primary', href: F9.loginUrl(), 'data-act': 'login' }, ['Đăng nhập']),
          h('a', { class: 'btn ghost', href: F9.loginUrl('register'), 'data-act': 'register' }, ['Đăng ký tài khoản 9app']),
        ]),
      ]),
      F9.notice('info', 'Đã có người mời bạn vào gia đình?', 'Đăng ký tài khoản 9app bằng đúng số điện thoại được mời, rồi mở mục Lời mời để chấp nhận.'),
    ]);
  }

  function inboxBanner(r) {
    var n = (r.pendingInvitations || 0) + (r.pendingApprovals || 0);
    if (!n) return null;
    var parts = [];
    if (r.pendingInvitations) parts.push(r.pendingInvitations + ' lời mời vào gia đình đang chờ bạn');
    if (r.pendingApprovals) parts.push(r.pendingApprovals + ' người chờ bạn duyệt vào gia đình');
    return F9.notice('warn', 'Bạn có lời mời', parts.join('. ') + '.', F9.idLink('#/' + (r.pendingInvitations ? 'loi-moi' : 'gia-dinh'), { class: 'btn primary sm mt', 'data-act': 'open-invites' }, ['Mở lời mời']));
  }

  function renderPicker(r) {
    var fams = r.families;
    F9.mount([
      h('h1', { class: 'h1', text: 'Chọn gia đình' }),
      inboxBanner(r),
      h('div', { class: 'pick-list' }, fams.map(function (f) {
        return F9.link('#/f/' + f.id + '/today', { class: 'pick' }, [
          h('div', { class: 'avatar', text: F9.initial(f.name) }),
          h('div', { class: 'col' }, [h('div', { class: 'b', text: f.name }), h('div', { class: 'muted', text: f.role === 'con' ? 'Tài khoản của con' : f.role === 'chu' ? 'Bạn là chủ gia đình' : f.role === 'quan_ly' ? 'Bạn là người quản lý' : 'Bạn là thành viên' })]),
          f.unread ? F9.chip(f.unread + ' mới', 'bad') : null,
        ]);
      })),
      h('div', { class: 'btn-row center' }, [F9.link('#/new', { class: 'btn ghost' }, ['Tạo gia đình khác']), F9.idLink('#/loi-moi', { class: 'btn ghost' }, ['Lời mời'])]),
    ]);
  }

  // Gia đình cũ (bản chưa có tài khoản) chưa được nhận về tài khoản 9app: chỉ xem
  function renderLegacy(r) {
    F9.mount([
      h('h1', { class: 'h1', text: 'Gia đình của bạn' }),
      F9.notice('warn', 'Gia đình đang chuyển sang tài khoản 9app', 'Từ nay 9family dùng tài khoản 9app. Trong lúc chuyển, bạn chỉ xem được lịch. Chủ gia đình hãy đăng nhập (hoặc đăng ký) tài khoản 9app rồi nhập mã nhận gia đình do quản trị viên cấp.',
        h('div', { class: 'btn-row mt' }, [h('a', { class: 'btn primary sm', href: F9.loginUrl(), 'data-act': 'login' }, ['Đăng nhập / Đăng ký']), F9.idLink('#/gia-dinh', { class: 'btn ghost sm' }, ['Nhập mã nhận gia đình'])])),
      h('div', { class: 'pick-list' }, r.families.map(function (f) {
        return F9.link('#/f/' + f.id + '/today', { class: 'pick' }, [h('div', { class: 'avatar', text: F9.initial(f.name) }), h('div', { class: 'col' }, [h('div', { class: 'b', text: f.name }), h('div', { class: 'muted', text: 'Chỉ xem' })])]);
      })),
    ]);
  }

  F9.home = function () {
    F9.legacy = false; document.body.classList.remove('legacy');
    F9.frame({ title: '9family' });
    F9.skeleton();
    F9.api('GET', 'api/me', undefined, { noRedirect: true }).then(function (r) {
      F9.setUnread(0);
      if (r.legacy) return renderLegacy(r);
      var fams = r.families;
      if (fams.length === 0) return F9.createFamily(true, r);
      var last = fams.filter(function (f) { return f.id === F9.store('last'); })[0];
      if ((fams.length === 1 || last) && !r.pendingInvitations && !r.pendingApprovals) {
        history.replaceState(null, '', F9.href('#/f/' + (last || fams[0]).id + '/today'));
        return F9.route();
      }
      renderPicker(r);
    }).catch(function (e) {
      if (e.status === 401) return welcome();
      F9.loadError(e, F9.home);
    });
  };

  // luôn hiện danh sách gia đình (từ nút "Chuyển gia đình" ở tab Gia đình)
  F9.pick = function () {
    F9.frame({ title: 'Gia đình của bạn', back: F9.returnTo || '#/' });
    F9.skeleton();
    F9.api('GET', 'api/me', undefined, { noRedirect: true }).then(function (r) {
      if (r.legacy) return renderLegacy(r);
      if (!r.families.length) return F9.createFamily(true, r);
      renderPicker(r);
    }).catch(function (e) { if (e.status === 401) return welcome(); F9.loadError(e, F9.pick); });
  };

  // Tạo gia đình ở 9app (cùng nguồn gốc), tên có thể trùng. first = chưa có gia đình nào.
  F9.createFamily = function (first, me) {
    F9.frame({ title: first ? '9family' : 'Tạo gia đình', back: first ? null : '#/' });
    var name = F9.text({ placeholder: 'Ví dụ: Nhà Cún', autocomplete: 'off', 'data-k': 'fam-name' });
    var rel = relSelect('me');
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var go = F9.btn('Tạo gia đình', 'primary block', function () {
      err.className = 'hint err hidden';
      return F9.busy(go, function () {
        return F9.idApi('POST', '/families', { name: name.value }, 'mkfam').then(function (r) {
          var fid = r.family.id;
          F9.store('last', fid); F9.dropGate();
          // quan hệ trong nhà (bố/mẹ...) là phần của 9family
          return F9.get(F9.fam(fid)).then(function (core) { return F9.post(F9.fam(fid, '/members/' + core.me.id), { relation: rel.value }); }).catch(function () { /* đặt sau cũng được */ }).then(function () {
            F9.go('#/f/' + fid + '/today');
          });
        }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
      });
    });
    var nodes = [
      h('div', { class: 'hero' }, [h('img', { src: 'icon.svg', alt: '' }), h('h1', { class: 'h1', text: first ? 'Chào mừng đến 9family' : 'Tạo gia đình mới' }),
        h('p', { class: 'sub mt', text: 'Biết hôm nay con học gì, ai đưa, ai đón. Không để con phải chờ vì không ai nhận ca đón.' })]),
      me ? inboxBanner(me) : null,
      h('div', { class: 'card' }, [
        F9.field('Tên gia đình', name, 'Có thể trùng với gia đình khác.'), F9.field('Bạn là', rel), err,
        h('div', { class: 'mt' }, [go]),
      ]),
      first ? F9.notice('info', 'Đã có người mời bạn?', 'Mở mục Lời mời ở tài khoản 9app để chấp nhận. Lời mời gửi theo số điện thoại bạn dùng đăng ký 9app.', h('div', { class: 'btn-row mt' }, [F9.idLink('#/loi-moi', { class: 'btn ghost sm' }, ['Mở lời mời']), F9.btn('Tải lại', 'ghost sm', function () { F9.home(); })])) : null,
    ];
    F9.mount(nodes.filter(Boolean));
  };

  // Quay lại từ 9app (nút Back hoặc đổi tab) khi đang ở màn chào: đọc lại xem đã đăng nhập chưa
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && /^#\/?$/.test(location.hash) && F9.$('view') && F9.$('view').querySelector('[data-act="login"]')) F9.home();
  });
})();
