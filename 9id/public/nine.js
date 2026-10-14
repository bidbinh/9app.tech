/* Nine: thư viện trình duyệt dùng chung để biết người dùng đã đăng nhập 9app chưa, dành cho app CÙNG NGUỒN GỐC (9app.tech).
 * Nạp bằng <script src="/id/nine.js"></script>. Cần fetch và Promise (mọi trình duyệt từ 2017). Viết bằng JS cổ điển (ES5).
 *
 *   Nine.me()          -> Promise<{id, displayName, phoneLast4} | null>   (reject khi 9id không đạt được: KHÔNG coi là đăng xuất)
 *   Nine.user()        -> kết quả đã nạp gần nhất (hoặc null)
 *   Nine.login(next)   -> chuyển tới màn đăng nhập của 9id, xong quay lại `next` (mặc định: trang hiện tại)
 *   Nine.register(next)-> như trên nhưng mở màn đăng ký
 *   Nine.logout()      -> Promise
 *   Nine.require(ok, fail) -> đã đăng nhập thì ok(user); chưa thì chuyển tới đăng nhập; 9id không đạt được thì fail(lỗi) nếu có
 *
 * Không lưu gì ở trình duyệt và không đọc cookie (cookie phiên là HttpOnly, 9id tự gửi kèm). App ở tên miền con (ví dụ Osin)
 * không dùng được cookie này và dùng luồng authorize của 9id. */
(function (root) {
  'use strict';
  var BASE = '/id/';
  var current = null;

  // Giống N.safeNext của giao diện 9id và safeNext của máy chủ: chỉ nhận đường dẫn cùng nguồn gốc; ngoài ra trả '/'.
  function safeNext(v) {
    if (typeof v !== 'string' || !v || v.length > 500 || v.charAt(0) !== '/') return '/';
    if (v.charAt(1) === '/' || v.charAt(1) === '\\') return '/';
    if (/[\\\u0000-\u001f\u007f-\u009f]/.test(v)) return '/';
    var dec;
    try { dec = decodeURIComponent(v); } catch (e) { return '/'; }
    if (/^\/[\\\/]/.test(dec) || dec.indexOf('\\') >= 0) return '/';
    return v;
  }

  function me() {
    return fetch(BASE + 'api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('9id trả ' + r.status);
      var type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (type.indexOf('json') < 0) throw new Error('9id không trả JSON');
      return r.json();
    }).then(function (j) {
      if (!j || typeof j !== 'object' || !('user' in j)) throw new Error('9id trả dữ liệu lạ');
      current = j.user ? { id: j.user.id, displayName: j.user.displayName, phoneLast4: j.user.phoneLast4 } : null;
      return current;
    });
  }

  function go(hash, next) {
    var n = next === undefined ? (root.location.pathname + root.location.search + root.location.hash) : next;
    root.location.href = BASE + '?next=' + encodeURIComponent(safeNext(n)) + hash;
  }
  function login(next) { go('#/dang-nhap', next); }
  function register(next) { go('#/dang-ky', next); }

  function logout() {
    return fetch(BASE + 'api/logout', {
      method: 'POST', credentials: 'same-origin', body: '{}',
      headers: { 'x-requested-with': '9id', 'content-type': 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('9id trả ' + r.status);
      current = null;
    });
  }

  function requireLogin(ok, fail) {
    return me().then(function (u) {
      if (u) ok(u); else login();
    }, function (e) {
      if (typeof fail === 'function') fail(e);
    });
  }

  root.Nine = { me: me, user: function () { return current; }, login: login, register: register, logout: logout, require: requireLogin, _safeNext: safeNext };
})(typeof window !== 'undefined' ? window : this);
