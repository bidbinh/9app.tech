/* 9hire: bộ định tuyến theo hash. Chạy sau cùng. */
(function () {
  'use strict';
  var H9 = window.H9;
  var ID = '([0-9a-fA-F-]{36})';
  var routes = [
    [/^#\/?$/, function () { H9.home(); }],
    [new RegExp('^#/job/' + ID + '$'), function (m) { H9.jobDetail(m[1].toLowerCase()); }],
    [/^#\/saved$/, function () { H9.saved(); }],
    [/^#\/me$/, function () { H9.me(); }],
    [/^#\/employer$/, function () { H9.employer(); }],
    [/^#\/employer\/new$/, function () { H9.jobForm(null); }],
    [/^#\/employer\/recover$/, function () { H9.recover(); }],
    [new RegExp('^#/employer/edit/' + ID + '$'), function (m) { H9.jobForm(m[1].toLowerCase()); }],
    [new RegExp('^#/employer/job/' + ID + '$'), function (m) { H9.inbox(m[1].toLowerCase()); }],
    [/^#\/safety$/, function () { H9.loadMeta().then(H9.safetyPage, H9.safetyPage); }],
    [/^#\/terms$/, function () { H9.termsPage(); }],
    [/^#\/privacy$/, function () { H9.loadMeta().then(H9.privacyPage, H9.privacyPage); }],
  ];

  H9.route = function () {
    H9.closeSheets();
    H9.setCta(null);
    document.title = '9hire - Việc làm gần bạn';
    var hash = location.hash || '#/';
    for (var i = 0; i < routes.length; i++) {
      var m = hash.match(routes[i][0]);
      if (m) { window.scrollTo(0, 0); routes[i][1](m); return; }
    }
    H9.go('#/');
  };

  // link chia sẻ dạng /hire/j/<id>: chuyển sang màn chi tiết (giữ mã trong hash để tải lại vẫn đúng)
  var m = location.pathname.match(/\/j\/([0-9a-fA-F-]{36})\/?$/);
  if (m) {
    var root = new URL('./', document.baseURI).pathname;
    history.replaceState(null, '', root + '#/job/' + m[1].toLowerCase());
  }

  window.addEventListener('hashchange', H9.route);
  H9.route();
})();
