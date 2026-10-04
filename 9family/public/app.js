/* 9family: bộ định tuyến theo hash. Chạy sau cùng. */
(function () {
  'use strict';
  var F9 = window.F9;
  var ID = '([0-9a-fA-F-]{36})';
  var routes = [
    [/^#\/?$/, function () { F9.home(); }],
    [/^#\/pick$/, function () { F9.pick(); }],
    [/^#\/new$/, function () { F9.createFamily(false); }],
    [/^#\/join\/([A-Za-z0-9_-]{1,40})$/, function (m) { F9.join(m[1]); }],
    [new RegExp('^#/f/' + ID + '/today$'), function (m) { F9.today(m[1]); }],
    [new RegExp('^#/f/' + ID + '/cal$'), function (m) { F9.cal(m[1]); }],
    [new RegExp('^#/f/' + ID + '/rides$'), function (m) { F9.rides(m[1]); }],
    [new RegExp('^#/f/' + ID + '/tasks$'), function (m) { F9.tasks(m[1]); }],
    [new RegExp('^#/f/' + ID + '/me$'), function (m) { F9.me(m[1]); }],
    [new RegExp('^#/f/' + ID + '/inbox$'), function (m) { F9.inbox(m[1]); }],
    [new RegExp('^#/f/' + ID + '/event/new(?:/(\\d{4}-\\d{2}-\\d{2}))?$'), function (m) { F9.eventForm(m[1], null, m[2]); }],
    [new RegExp('^#/f/' + ID + '/event/' + ID + '$'), function (m) { F9.eventForm(m[1], m[2]); }],
    [new RegExp('^#/f/' + ID + '/tkb/' + ID + '$'), function (m) { F9.tkb(m[1], m[2]); }],
  ];

  F9.route = function () {
    F9.closeSheets();
    F9.liveStop();
    F9.setCta(null);
    F9.currentFid = null;
    var hash = location.hash || '#/';
    if (/^#\/f\/[0-9a-fA-F-]{36}\/(today|cal|rides|tasks|me)$/.test(hash)) F9.returnTo = hash;
    for (var i = 0; i < routes.length; i++) {
      var m = hash.match(routes[i][0]);
      if (m) {
        window.scrollTo(0, 0);
        if (m[1] && /^[0-9a-fA-F-]{36}$/.test(m[1])) { F9.currentFid = m[1].toLowerCase(); F9.store('last', F9.currentFid); }
        F9.$('bar').classList.remove('hidden');
        routes[i][1](m);
        return;
      }
    }
    F9.go('#/');
  };

  // link mời dạng /9family/m/<mã> hoặc /9family/d/<mã>: chuyển sang màn vào gia đình (mã nằm trong hash để tải lại vẫn đúng)
  var m = location.pathname.match(/\/[md]\/([A-Za-z0-9_-]{1,40})\/?$/);
  if (m) {
    var root = new URL('./', document.baseURI).pathname;
    history.replaceState(null, '', root + '#/join/' + m[1]);
  }

  window.addEventListener('hashchange', F9.route);
  F9.route();
})();
