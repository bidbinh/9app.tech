/* 9swap: cài đặt cộng đồng, thành viên, hàng chờ báo cáo (chủ cộng đồng) */
(function () {
  'use strict';
  var S9 = window.S9, h = S9.h;

  function renameSheet(cid, cur) {
    S9.sheet('Đổi tên của bạn', function (body, close) {
      var name = S9.text({ value: cur });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        S9.busy(form.querySelector('.btn.primary'), function () { return S9.post('api/c/' + cid + '/me', { name: name.value }).then(function () { S9.store('myname', name.value.trim()); close(); S9.settings(cid); }); });
      } }, [S9.field('Tên hiển thị', name), h('div', { class: 'btn-row' }, [S9.btn('Lưu', 'primary block', null, { type: 'submit' })])]);
      body.appendChild(form);
    });
  }

  function communitySheet(cid, c) {
    S9.sheet('Sửa cộng đồng', function (body, close) {
      var name = S9.text({ value: c.name });
      var kind = S9.select(S9.meta.communityKinds, c.kind);
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        S9.busy(form.querySelector('.btn.primary'), function () { return S9.post('api/c/' + cid, { name: name.value, kind: kind.value }).then(function () { close(); S9.settings(cid); }); });
      } }, [S9.field('Tên cộng đồng', name), S9.field('Loại', kind), h('div', { class: 'btn-row' }, [S9.btn('Lưu', 'primary block', null, { type: 'submit' })])]);
      body.appendChild(form);
    });
  }

  S9.settings = function (cid) {
    S9.withCommunity(cid, { title: 'Cài đặt', back: '#/c/' + cid, settings: false }, function (info) {
      var c = info.community; var me = info.me; var owner = me.role === 'chu';
      var url = S9.inviteUrl(c.inviteCode);
      var nodes = [];
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: c.name }),
        h('div', { class: 'muted', text: (S9.meta.communityKinds[c.kind] || '') + ' · ' + info.counts.members + ' người' }),
        owner ? h('div', { class: 'btn-row' }, [S9.btn('Sửa tên, loại', 'ghost sm', function () { communitySheet(cid, c); })]) : null,
      ]));
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: 'Mời mọi người vào' }),
        h('p', { class: 'muted', text: 'Gửi link hoặc mã này cho đồng nghiệp, hàng xóm. Ai có mã đều vào được, nên đừng đăng công khai.' }),
        h('div', { class: 'copybox' }, [h('div', { class: 'mono', id: 'invite-url', text: url }), S9.btn('Chép', 'ghost sm', function () { S9.copy(url, 'Đã chép link mời'); })]),
        h('div', { class: 'copybox mt' }, [h('div', { class: 'mono big', id: 'invite-code', text: c.inviteCode }), S9.btn('Chép mã', 'ghost sm', function () { S9.copy(c.inviteCode, 'Đã chép mã mời'); })]),
        h('div', { class: 'btn-row' }, [
          navigator.share ? S9.btn('Chia sẻ', 'primary', function () { navigator.share({ title: '9swap: ' + c.name, text: 'Vào cộng đồng ' + c.name + ' trên 9swap để cho tặng, trao đổi đồ cũ:', url: url }).catch(function () {}); }) : null,
          owner ? S9.btn('Đổi mã mời', 'ghost', function (ev) {
            var btn = ev.currentTarget;
            S9.confirm({ title: 'Đổi mã mời?', text: 'Link và mã cũ sẽ không dùng được nữa. Người đã vào vẫn ở lại.', ok: 'Đổi mã' }).then(function (yes) {
              if (yes) S9.busy(btn, function () { return S9.post('api/c/' + cid + '/rotate-code').then(function () { S9.toast('Đã đổi mã mời'); S9.settings(cid); }); });
            });
          }) : null,
        ]),
      ]));
      if (info.canClaimOwner) nodes.push(S9.notice('warn', 'Cộng đồng đang không có chủ hoạt động', 'Chủ cộng đồng đã vắng lâu. Bạn là thành viên lâu năm nhất nên có thể nhận quyền chủ để gỡ tin xấu và quản lý thành viên.', h('div', { class: 'btn-row' }, [S9.btn('Nhận quyền chủ cộng đồng', 'primary', function (ev) {
        var btn = ev.currentTarget;
        S9.confirm({ title: 'Nhận quyền chủ?', text: 'Bạn sẽ trở thành chủ cộng đồng; chủ cũ thành thành viên thường.', ok: 'Nhận quyền' }).then(function (yes) {
          if (yes) S9.busy(btn, function () { return S9.post('api/c/' + cid + '/claim-owner').then(function () { S9.toast('Bạn là chủ cộng đồng'); S9.settings(cid); }); });
        });
      })])));
      nodes.push(h('div', { class: 'card' }, [
        S9.link('#/c/' + cid + '/members', { class: 'trow' }, [S9.ico('users', 22), h('div', { class: 'col b', text: 'Thành viên (' + info.counts.members + ')' }), S9.ico('chev', 18)]),
        owner ? S9.link('#/c/' + cid + '/reports', { class: 'trow' }, [S9.ico('flag', 22), h('div', { class: 'col b', text: 'Báo cáo cần xử lý' }), info.counts.reports ? S9.chip(String(info.counts.reports), 'bad') : null, S9.ico('chev', 18)]) : null,
        S9.link('#/c/' + cid + '/rules', { class: 'trow' }, [S9.ico('shield', 22), h('div', { class: 'col b', text: 'Quy tắc và an toàn' }), S9.ico('chev', 18)]),
      ]));
      nodes.push(h('div', { class: 'card' }, [
        h('h2', { text: 'Tôi' }),
        h('div', { class: 'row sb' }, [h('div', {}, [h('div', { class: 'b', text: me.name }), h('div', { class: 'muted small', text: owner ? 'Chủ cộng đồng' : 'Thành viên' })]), S9.btn('Đổi tên', 'ghost sm', function () { renameSheet(cid, me.name); })]),
        h('div', { class: 'btn-row' }, [
          !owner ? S9.btn('Rời cộng đồng', 'ghost', function (ev) {
            var btn = ev.currentTarget;
            S9.confirm({ title: 'Rời cộng đồng?', text: 'Các tin đang mở của bạn sẽ bị đóng. Bạn vào lại được bằng mã mời.', ok: 'Rời cộng đồng', danger: true }).then(function (yes) {
              if (yes) S9.busy(btn, function () { return S9.post('api/c/' + cid + '/leave').then(function () { S9.pollStop(); S9.toast('Đã rời cộng đồng'); S9.go('#/'); }); });
            });
          }) : null,
          owner ? S9.btn('Xóa cộng đồng', 'ghost', function (ev) {
            var btn = ev.currentTarget;
            S9.confirm({ title: 'Xóa cộng đồng?', text: 'Toàn bộ tin, ảnh, tin nhắn và bảng tin của "' + c.name + '" sẽ bị xóa vĩnh viễn. Bạn muốn chuyển quyền cho người khác thì vào mục Thành viên.', ok: 'Xóa vĩnh viễn', danger: true }).then(function (yes) {
              if (yes) S9.busy(btn, function () { return S9.post('api/c/' + cid + '/delete', { confirm: true }).then(function () { S9.pollStop(); S9.toast('Đã xóa cộng đồng'); S9.go('#/'); }); });
            });
          }) : null,
        ]),
      ]));
      S9.mount(nodes);
    });
  };

  S9.rulesIn = function (cid) {
    S9.pollStart(cid);
    S9.rules('#/c/' + cid + '/settings');
  };

  S9.members = function (cid) {
    S9.withCommunity(cid, { title: 'Thành viên', back: '#/c/' + cid + '/settings', settings: false }, function (info) {
      var owner = info.me.role === 'chu';
      S9.get('api/c/' + cid + '/members').then(function (d) {
        var card = h('div', { class: 'card' });
        d.members.forEach(function (m) {
          card.appendChild(h('div', { class: 'member-row' }, [h('div', { class: 'row' }, [
            h('div', { class: 'avatar sm' }, [m.name.slice(0, 1).toUpperCase()]),
            h('div', { class: 'col' }, [
              h('div', { class: 'b trunc', text: m.name + (m.isMe ? ' (bạn)' : '') }),
              S9.rep({ tang: m.tang, doi: m.other, ban: 0 }),
            ]),
            m.role === 'chu' ? S9.chip('Chủ', 'brand') : null,
            m.banned ? S9.chip('Bị khóa', 'bad') : null,
            owner && !m.isMe ? S9.btn('Quản lý', 'ghost sm', function () { manageSheet(cid, m); }) : null,
          ])]));
        });
        S9.mount([card]);
      }, function (e) { S9.loadError(e, function () { S9.members(cid); }); });
    });
  };

  function manageSheet(cid, m) {
    S9.sheet(m.name, function (body, close) {
      function act(label, path, cls, confirmText, after) {
        return S9.btn(label, cls, function (ev) {
          var btn = ev.currentTarget;
          S9.confirm({ title: label + '?', text: confirmText, ok: label, danger: cls === 'danger' }).then(function (yes) {
            if (yes) S9.busy(btn, function () { return S9.post('api/c/' + cid + '/members/' + m.id + '/' + path).then(function () { close(); S9.toast('Đã cập nhật'); S9.members(cid); if (after) after(); }); });
          });
        });
      }
      body.appendChild(h('p', { class: 'muted', text: S9.repText({ tang: m.tang, doi: m.other, ban: 0 }) + (m.lastSeenAt ? ' · hoạt động ' + S9.ago(m.lastSeenAt) : '') }));
      body.appendChild(h('div', { class: 'btn-row' }, [
        m.banned ? act('Mở khóa', 'unban', 'primary', m.name + ' sẽ dùng lại được cộng đồng (các tin đã bị gỡ không tự khôi phục).')
          : act('Khóa thành viên', 'ban', 'danger', m.name + ' sẽ không xem hay đăng được nữa, mọi tin đang mở của họ bị gỡ.'),
        !m.banned ? act('Chuyển quyền chủ', 'make-owner', 'ghost', 'Bạn sẽ trở thành thành viên thường và ' + m.name + ' là chủ cộng đồng.') : null,
      ]));
    });
  }

  var TYPE = { listing: 'Tin đăng', message: 'Tin nhắn riêng', board: 'Bài bảng tin', reply: 'Bình luận' };
  S9.reports = function (cid) {
    S9.withCommunity(cid, { title: 'Báo cáo', back: '#/c/' + cid + '/settings', settings: false }, function (info) {
      if (info.me.role !== 'chu') { S9.mount([S9.empty('Chỉ chủ cộng đồng', 'Mục này dành cho chủ cộng đồng.')]); return; }
      S9.get('api/c/' + cid + '/reports').then(function (d) {
        if (!d.items.length) { S9.mount([S9.empty('Không có báo cáo nào', 'Khi thành viên báo cáo tin hay tin nhắn xấu, bạn sẽ xử lý ở đây.')]); return; }
        var card = h('div', { class: 'card' });
        d.items.forEach(function (r) {
          function act(action, label, cls) {
            return S9.btn(label, cls, function (ev) {
              var btn = ev.currentTarget;
              S9.confirm({ title: label + '?', text: action === 'ban' ? r.targetName + ' sẽ bị khóa và mọi tin đang mở của họ bị gỡ.' : action === 'remove' ? 'Nội dung bị báo cáo sẽ bị gỡ.' : 'Bỏ qua báo cáo này.', ok: label, danger: action !== 'dismiss' }).then(function (yes) {
                if (yes) S9.busy(btn, function () { return S9.post('api/reports/' + r.id + '/action', { action: action }).then(function () { S9.toast('Đã xử lý'); S9.reports(cid); }); });
              });
            });
          }
          card.appendChild(h('div', { class: 'report' }, [
            h('div', { class: 'row sb' }, [h('div', { class: 'b', text: TYPE[r.type] + (r.targetName ? ' của ' + r.targetName : '') }), S9.chip(r.status === 'cho' ? 'Chờ xử lý' : r.status === 'da_xu_ly' ? 'Đã xử lý' : 'Bỏ qua', r.status === 'cho' ? 'warn' : '')]),
            h('div', { class: 'muted small', text: r.reporterName + ' báo ' + S9.ago(r.createdAt) + ': ' + r.reason }),
            h('div', { class: 'snap', text: r.snapshot }),
            r.type === 'listing' ? S9.link('#/l/' + r.targetId, { class: 'linkbtn', text: 'Mở tin' }) : r.type === 'board' ? S9.link('#/b/' + r.targetId, { class: 'linkbtn', text: 'Mở bài' }) : null,
            r.status === 'cho' ? h('div', { class: 'btn-row' }, [act('dismiss', 'Bỏ qua', 'ghost sm'), act('remove', r.type === 'message' ? 'Gỡ tin nhắn' : 'Gỡ nội dung', 'danger sm'), (r.targetMemberId && !r.targetBanned) ? act('ban', 'Khóa người này', 'danger sm') : null]) : null,
          ]));
        });
        S9.mount([card]);
      }, function (e) { S9.loadError(e, function () { S9.reports(cid); }); });
    });
  };
})();
