/* 9family: màn vào đầu tiên: tạo gia đình, chọn gia đình, mở link mời / liên kết thiết bị. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;

  function relSelect(cur) {
    return F9.select(F9.RELATIONS.map(function (r) { return [r[0], r[1]]; }), cur || 'me');
  }

  function renderPicker(fams) {
    F9.mount([
      h('h1', { class: 'h1', text: 'Chọn gia đình' }),
      h('div', { class: 'pick-list' }, fams.map(function (f) {
        return F9.link('#/f/' + f.id + '/today', { class: 'pick' }, [
          h('div', { class: 'avatar', text: F9.initial(f.name) }),
          h('div', { class: 'col' }, [h('div', { class: 'b', text: f.name }), h('div', { class: 'muted', text: 'Bạn là ' + f.myName })]),
          f.unread ? F9.chip(f.unread + ' mới', 'bad') : null,
        ]);
      })),
      h('div', { class: 'btn-row center' }, [F9.link('#/new', { class: 'btn ghost' }, ['Tạo gia đình khác'])]),
    ]);
  }

  F9.home = function () {
    F9.frame({ title: '9family' });
    F9.skeleton();
    F9.get('api/me').then(function (r) {
      var fams = r.families;
      if (fams.length === 0) return F9.createFamily(true);
      var last = fams.filter(function (f) { return f.id === F9.store('last'); })[0];
      if (fams.length === 1 || last) {
        history.replaceState(null, '', F9.href('#/f/' + (last || fams[0]).id + '/today'));
        return F9.route();
      }
      renderPicker(fams);
    }).catch(function (e) { F9.loadError(e, F9.home); });
  };

  // luôn hiện danh sách gia đình (từ nút "Đổi gia đình" ở tab Gia đình)
  F9.pick = function () {
    F9.frame({ title: 'Gia đình của bạn', back: F9.returnTo || '#/' });
    F9.skeleton();
    F9.get('api/me').then(function (r) { if (!r.families.length) return F9.createFamily(true); renderPicker(r.families); }).catch(function (e) { F9.loadError(e, F9.pick); });
  };

  F9.createFamily = function (first) {
    F9.frame({ title: first ? '9family' : 'Tạo gia đình', back: first ? null : '#/' });
    var name = F9.text({ placeholder: 'Ví dụ: Nhà Cún', autocomplete: 'off' });
    var me = F9.text({ placeholder: 'Ví dụ: Mẹ Bình', autocomplete: 'given-name' });
    var rel = relSelect('me');
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var go = F9.btn('Tạo gia đình', 'primary block', function () {
      err.className = 'hint err hidden';
      return F9.busy(go, function () {
        return F9.post('api/families', { name: name.value, myName: me.value, relation: rel.value }, { idem: 'mkfam' }).then(function (r) {
          F9.store('last', r.family.id); F9.dropGate();
          F9.toast('Đã tạo gia đình. Bước tiếp theo: thêm con.');
          F9.go('#/f/' + r.family.id + '/today');
        }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
      });
    });
    F9.mount([
      h('div', { class: 'hero' }, [h('img', { src: 'icon.svg', alt: '' }), h('h1', { class: 'h1', text: first ? 'Chào mừng đến 9family' : 'Tạo gia đình mới' }),
        h('p', { class: 'sub mt', text: 'Biết hôm nay con học gì, ai đưa, ai đón. Không để con phải chờ vì không ai nhận ca đón.' })]),
      h('div', { class: 'card' }, [
        F9.field('Tên gia đình', name), F9.field('Tên của bạn trong gia đình', me), F9.field('Bạn là', rel), err,
        h('div', { class: 'mt' }, [go]),
      ]),
      first ? F9.notice('info', 'Đã có người mời bạn?', 'Hãy mở link mời mà người trong nhà gửi qua Zalo hoặc tin nhắn. Link chỉ dùng được một lần.') : null,
    ]);
  };

  // ---------- link mời / liên kết thiết bị ----------
  function joinProblem(e, code) {
    F9.frame({ title: 'Link mời' });
    var used = e.code === 'invite_used', exp = e.code === 'invite_expired';
    F9.mount([F9.empty(used ? 'Link này đã được dùng' : exp ? 'Link đã hết hạn' : 'Link không dùng được', e.message || 'Hãy xin người trong nhà gửi lại link mới.',
      h('div', { class: 'btn-row center' }, [F9.link('#/', { class: 'btn primary' }, ['Về trang chủ'])]))]);
  }

  F9.join = function (code) {
    F9.frame({ title: 'Vào gia đình' });
    F9.skeleton();
    F9.get('api/invites/' + encodeURIComponent(code)).then(function (inv) {
      if (inv.alreadyMember) {
        F9.mount([F9.empty('Bạn đã ở trong gia đình ' + inv.familyName, 'Không cần dùng link này nữa.', h('div', { class: 'btn-row center' }, [F9.link('#/f/' + inv.familyId + '/today', { class: 'btn primary' }, ['Mở gia đình'])]))]);
        return;
      }
      var isDevice = inv.kind === 'thiet_bi';
      var name = F9.text({ value: inv.memberName, placeholder: 'Tên của bạn', autocomplete: 'given-name' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var go = F9.btn(isDevice ? 'Liên kết thiết bị này' : 'Vào gia đình', 'primary block', function () {
        err.className = 'hint err hidden';
        return F9.busy(go, function () {
          var body = isDevice ? {} : { name: name.value };
          return F9.post('api/invites/' + encodeURIComponent(code) + '/accept', body, { idem: 'acc' + code }).then(function (r) {
            F9.store('last', r.familyId); F9.dropGate();
            history.replaceState(null, '', F9.href('#/f/' + r.familyId + '/today'));
            F9.toast(isDevice ? 'Đã liên kết thiết bị' : 'Chào mừng bạn vào gia đình ' + inv.familyName);
            F9.route();
          }, function (e) {
            if (e.status === 410 || e.status === 404) { joinProblem(e, code); return; }
            err.textContent = e.message; err.className = 'hint err'; throw e;
          });
        });
      });
      F9.mount([
        h('div', { class: 'hero' }, [h('img', { src: 'icon.svg', alt: '' }), h('h1', { class: 'h1', text: isDevice ? 'Thêm thiết bị mới' : 'Bạn được mời vào gia đình' })]),
        h('div', { class: 'card center' }, [
          h('div', { class: 'big', text: inv.familyName }),
          h('p', { class: 'muted mt', text: isDevice ? 'Thiết bị này sẽ dùng chung tài khoản "' + inv.memberName + '".' : 'Bạn được thêm với vai trò ' + (F9.REL[inv.relation] || 'Thành viên').toLowerCase() + '.' }),
          isDevice ? null : F9.field('Tên của bạn trong gia đình', name),
          err,
          h('div', { class: 'mt' }, [go]),
        ]),
        F9.notice('info', 'Không cần mật khẩu', 'Thiết bị này sẽ nhớ bạn. Nếu đổi hoặc mất điện thoại, hãy nhờ chủ gia đình gửi link mời lại.'),
      ]);
    }).catch(function (e) {
      if (e.status === 410 || e.status === 404) joinProblem(e, code); else F9.loadError(e, function () { F9.join(code); });
    });
  };
})();
