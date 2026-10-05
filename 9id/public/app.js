/* 9id: bộ định tuyến theo hash. Chạy sau cùng.
   Tuyến: #/dang-nhap  #/dang-ky  #/quen-mat-khau  #/tai-khoan  #/loi-moi  #/gia-dinh  #/gia-dinh/<id> */
(function () {
  'use strict';
  var N = window.N;
  N.applyTheme();

  var leavers = [];
  N.onLeave = function (fn) { leavers.push(fn); };

  var UUID = '([0-9a-fA-F-]{36})';
  var OPEN = [
    [/^#\/dang-nhap$/, function () { N.login(); }],
    [/^#\/dang-ky$/, function () { N.phoneFlow('register'); }],
    [/^#\/quen-mat-khau$/, function () { N.phoneFlow('reset'); }],
  ];
  var PRIVATE = [
    [/^#\/tai-khoan$/, function () { N.account(); }],
    [/^#\/loi-moi$/, function () { N.invitations(); }],
    [/^#\/cho-phep$/, function () { N.consent(); }],
    [/^#\/gia-dinh$/, function () { N.families(); }],
    [new RegExp('^#/gia-dinh/' + UUID + '$'), function (m) { N.family(m[1]); }],
  ];

  N.refreshPending = function () {
    return N.get('api/me').then(function (r) { N.me = r.user; N.pending = r.pendingInvitations || 0; N.approvals = r.pendingApprovals || 0; N.notices = r.notices || []; }, function () { /* mạng lỗi: giữ nguyên */ });
  };

  N.route = function () {
    N.closeSheets();
    leavers.splice(0).forEach(function (f) { try { f(); } catch (e) { /* bỏ qua */ } });
    var hash = location.hash || '#/';
    var i, m;
    window.scrollTo(0, 0);
    for (i = 0; i < OPEN.length; i++) { m = hash.match(OPEN[i][0]); if (m) { if (N.me && i > 0) { N.go('#/gia-dinh'); return; } OPEN[i][1](m); return; } }
    for (i = 0; i < PRIVATE.length; i++) {
      m = hash.match(PRIVATE[i][0]);
      if (m) { if (!N.me) { N.go('#/dang-nhap'); return; } PRIVATE[i][1](m); return; }
    }
    N.go(N.me ? '#/gia-dinh' : '#/dang-nhap');
  };

  window.addEventListener('hashchange', N.route);
  N.api('GET', 'api/me').then(function (r) { N.me = r.user; N.pending = r.pendingInvitations || 0; N.approvals = r.pendingApprovals || 0; N.notices = r.notices || []; N.route(); }, function (e) {
    N.bar({ title: '9id' }); N.tabs(null);
    var p = N.view();
    p.appendChild(N.empty('Không kết nối được', e.message, N.btn('Thử lại', 'primary', function () { location.reload(); })));
  });
})();
