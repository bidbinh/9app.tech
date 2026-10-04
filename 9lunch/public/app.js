/* 9lunch: bộ định tuyến theo hash. Chạy sau cùng. */
(function () {
  'use strict';
  var L9 = window.L9;
  var ID = '([0-9a-fA-F-]{36})';
  var routes = [
    [/^#\/?$/, function () { L9.home(); }],
    [/^#\/join\/([A-Za-z0-9]{1,32})$/, function (m) { L9.join(m[1]); }],
    [new RegExp('^#/t/' + ID + '$'), function (m) { L9.team(m[1]); }],
    [new RegExp('^#/t/' + ID + '/settings$'), function (m) { L9.teamSettings(m[1]); }],
    [new RegExp('^#/t/' + ID + '/debts$'), function (m) { L9.debts(m[1]); }],
    [new RegExp('^#/t/' + ID + '/stats$'), function (m) { L9.stats(m[1]); }],
    [new RegExp('^#/m/' + ID + '$'), function (m) { L9.meal(m[1]); }],
  ];

  L9.route = function () {
    L9.closeSheets();
    L9.liveStop();
    L9.setCta(null);
    var hash = location.hash || '#/';
    for (var i = 0; i < routes.length; i++) {
      var m = hash.match(routes[i][0]);
      if (m) { window.scrollTo(0, 0); routes[i][1](m); return; }
    }
    L9.go('#/');
  };

  // link mời dạng /9lunch/t/<mã>: chuyển sang màn vào nhóm (giữ mã trong hash để tải lại vẫn đúng)
  var m = location.pathname.match(/\/t\/([A-Za-z0-9]{1,32})\/?$/);
  if (m) {
    var root = new URL('./', document.baseURI).pathname;
    history.replaceState(null, '', root + '#/join/' + m[1].toUpperCase());
  }

  window.addEventListener('hashchange', L9.route);
  if ('serviceWorker' in navigator) { /* bản đầu chưa có service worker: cài ở màn hình chính vẫn chạy nhờ manifest */ }
  L9.route();
})();
