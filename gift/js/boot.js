// Đặt giao diện (sáng/tối, chữ lớn) trước khi vẽ để không bị nháy. Không phụ thuộc module.
(function () {
  try {
    var u = JSON.parse(localStorage.getItem('9gift.ui') || '{}');
    var r = document.documentElement;
    if (u.theme === 'light' || u.theme === 'dark') r.setAttribute('data-theme', u.theme);
    if (u.chuLon) r.setAttribute('data-chu', 'lon');
  } catch (e) { /* bộ nhớ bị chặn: dùng mặc định */ }
})();
