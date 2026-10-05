// Tài khoản 9app — khách được xem; ghi dữ liệu thì cần phiên. Classic JS.

var Id = (function () {
  var USER_KEY = '9app.id.user';
  var SESS_KEY = '9app.id.sess';
  var pending = null;

  function foldPhone(s) {
    var so = String(s || '').replace(/\D/g, '');
    if (so.indexOf('84') === 0 && so.length >= 11) so = '0' + so.slice(2);
    return so;
  }
  function hopLe(sdt) {
    return /^0\d{9}$/.test(sdt);
  }
  function bam(mk) {
    var s = String(mk || '');
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return 'sdbm$' + (h >>> 0).toString(16);
  }
  function loadUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveUser(rec) {
    localStorage.setItem(USER_KEY, JSON.stringify(rec));
  }
  function session() {
    try { return JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); } catch (e) { return null; }
  }
  function setSession(user) {
    var rec = { sdt: user.sdt, at: Date.now() };
    localStorage.setItem(SESS_KEY, JSON.stringify(rec));
    return rec;
  }
  function logout() {
    localStorage.removeItem(SESS_KEY);
  }
  function dangKy(sdt, mk) {
    sdt = foldPhone(sdt);
    if (!hopLe(sdt)) return { loi: 'Số điện thoại gồm 10 số, bắt đầu bằng 0.' };
    if (!mk || mk.length < 6) return { loi: 'Mật khẩu ít nhất 6 ký tự.' };
    if (loadUser()) return { loi: 'Đã có tài khoản trên máy này. Đăng nhập giúp.' };
    var user = { sdt: sdt, mk: bam(mk), createdAt: Date.now() };
    saveUser(user);
    return { ok: true, sess: setSession(user) };
  }
  function dangNhap(sdt, mk) {
    sdt = foldPhone(sdt);
    var user = loadUser();
    if (!user || user.sdt !== sdt || user.mk !== bam(mk)) return { loi: 'Số điện thoại hoặc mật khẩu không đúng.' };
    return { ok: true, sess: setSession(user) };
  }
  function require(ok) {
    if (session()) { ok(); return true; }
    pending = ok;
    return false;
  }
  function runPending() {
    var fn = pending;
    pending = null;
    if (fn) fn();
  }
  return {
    session: session,
    logout: logout,
    dangKy: dangKy,
    dangNhap: dangNhap,
    require: require,
    runPending: runPending,
    hopLe: hopLe,
    foldPhone: foldPhone,
    hasUser: function () { return !!loadUser(); }
  };
})();
