/* 9tutor: bộ định tuyến theo hash. Chạy sau cùng. Trang công khai (/r/<mã>, /g/<mã>) đi theo đường dẫn, không cần tài khoản. */
(function () {
  'use strict';
  var T9 = window.T9;
  T9.me = null;
  T9.applyTheme();

  var ID = '([0-9a-fA-F-]{36})';
  var OPEN = [
    [/^#\/bat-dau$/, function () { T9.onboarding(); }],
    [/^#\/khoi-phuc$/, function () { T9.recover(); }],
    [/^#\/ghep\/([A-Za-z0-9]{12})$/, function (m) { T9.pair(m[1].toUpperCase()); }],
  ];
  var routes = [
    [/^#\/?$/, function () { T9.today(); }],
    [/^#\/lich$/, function () { T9.week(null); }],
    [/^#\/lich\/(\d{4}-\d{2}-\d{2})$/, function (m) { T9.week(m[1]); }],
    [/^#\/hs$/, function () { T9.students(); }],
    [new RegExp('^#/hs/' + ID + '$'), function (m) { T9.student(m[1]); }],
    [/^#\/tien$/, function () { T9.moneyScreen(null); }],
    [/^#\/tien\/(\d{4}-\d{2})$/, function (m) { T9.moneyScreen(m[1]); }],
    [/^#\/cai-dat$/, function () { T9.settings(); }],
    [/^#\/gioi-thieu$/, function () { T9.profile(); }],
    [/^#\/thiet-bi$/, function () { T9.devices(); }],
  ];

  // trang công khai theo đường dẫn
  var basePath = new URL(document.baseURI).pathname;
  var rel = location.pathname.indexOf(basePath) === 0 ? location.pathname.slice(basePath.length) : '';
  var pub = rel.match(/^(r|g)\/([A-Za-z0-9_-]{1,40})\/?$/);
  if (pub) {
    T9.route = function () {};
    if (pub[1] === 'r') T9.pubReport(pub[2]); else T9.pubProfile(pub[2]);
    return;
  }

  T9.route = function () {
    T9.closeSheets();
    T9.liveStop();
    T9.setCta(null);
    var hash = location.hash || '#/';
    var i, m;
    if (!T9.me) {
      for (i = 0; i < OPEN.length; i++) { m = hash.match(OPEN[i][0]); if (m) { window.scrollTo(0, 0); OPEN[i][1](m); return; } }
      window.scrollTo(0, 0); T9.welcome(); return;
    }
    for (i = 0; i < OPEN.length; i++) if (OPEN[i][0].test(hash)) {
      if (/^#\/ghep\//.test(hash)) { OPEN[i][1](hash.match(OPEN[i][0])); return; } // đã đăng nhập vẫn cho ghép sang tài khoản khác
      T9.go('#/'); return;
    }
    for (i = 0; i < routes.length; i++) {
      m = hash.match(routes[i][0]);
      if (m) { window.scrollTo(0, 0); routes[i][1](m); return; }
    }
    T9.go('#/');
  };

  window.addEventListener('hashchange', T9.route);
  T9.api('GET', 'api/me').then(function (r) { T9.me = r.me; T9._today = r.me.today; }, function (e) {
    if (e && e.offline) { T9.bare(); T9.loadError(e, function () { location.reload(); }); return 'stop'; }
    T9.me = null;
  }).then(function (x) { if (x !== 'stop') T9.route(); });
})();
