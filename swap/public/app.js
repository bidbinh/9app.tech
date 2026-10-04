/* 9swap: bộ định tuyến theo hash. Chạy sau cùng. */
(function () {
  'use strict';
  var S9 = window.S9;
  var ID = '([0-9a-fA-F-]{36})';
  var routes = [
    [/^#\/?$/, function () { S9.home(); }],
    [/^#\/rules$/, function () { S9.pollStop(); S9.rules('#/'); }],
    [/^#\/join\/([A-Za-z0-9]{1,32})$/, function (m) { S9.join(m[1]); }],
    [new RegExp('^#/c/' + ID + '$'), function (m) { S9.community(m[1]); }],
    [new RegExp('^#/c/' + ID + '/board$'), function (m) { S9.board(m[1]); }],
    [new RegExp('^#/c/' + ID + '/board/new$'), function (m) { S9.boardForm(m[1]); }],
    [new RegExp('^#/c/' + ID + '/new$'), function (m) { S9.listingForm(m[1], null); }],
    [new RegExp('^#/c/' + ID + '/mine$'), function (m) { S9.mine(m[1]); }],
    [new RegExp('^#/c/' + ID + '/notifs$'), function (m) { S9.notifs(m[1]); }],
    [new RegExp('^#/c/' + ID + '/settings$'), function (m) { S9.settings(m[1]); }],
    [new RegExp('^#/c/' + ID + '/members$'), function (m) { S9.members(m[1]); }],
    [new RegExp('^#/c/' + ID + '/reports$'), function (m) { S9.reports(m[1]); }],
    [new RegExp('^#/c/' + ID + '/rules$'), function (m) { S9.rulesIn(m[1]); }],
    [new RegExp('^#/l/' + ID + '$'), function (m) { S9.listing(m[1]); }],
    [new RegExp('^#/l/' + ID + '/edit$'), function (m) { S9.listingForm(null, m[1]); }],
    [new RegExp('^#/t/' + ID + '$'), function (m) { S9.thread(m[1]); }],
    [new RegExp('^#/b/' + ID + '$'), function (m) { S9.boardPost(m[1]); }],
  ];

  S9.route = function () {
    S9.closeSheets();
    S9.liveStop();
    S9.runLeave();
    S9.setCta(null);
    var hash = location.hash || '#/';
    for (var i = 0; i < routes.length; i++) {
      var m = hash.match(routes[i][0]);
      if (m) { window.scrollTo(0, 0); routes[i][1](m); return; }
    }
    S9.go('#/');
  };

  // link mời dạng /swap/c/<mã>: chuyển sang màn vào cộng đồng (giữ mã trong hash để tải lại vẫn đúng)
  var m = location.pathname.match(/\/c\/([A-Za-z0-9]{1,32})\/?$/);
  if (m) {
    var root = new URL('./', document.baseURI).pathname;
    history.replaceState(null, '', root + '#/join/' + m[1].toUpperCase());
  }

  window.addEventListener('hashchange', S9.route);
  // danh mục từ máy chủ (không chặn việc vẽ nếu lỗi: có bản dự phòng trong ui.js)
  fetch(new URL('api/meta', document.baseURI).href, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (meta) {
    S9.meta = Object.assign(S9.meta, meta);
  }).catch(function () { /* dùng bản dự phòng */ }).then(S9.route);
})();
