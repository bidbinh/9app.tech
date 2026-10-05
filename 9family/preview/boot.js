/* 9family: chạy sớm ở <head> để áp "Chữ lớn" trước khi vẽ màn hình đầu tiên (không nhấp nháy bố cục). */
(function () {
  'use strict';
  try { if (localStorage.getItem('9family.big') === 'true') document.documentElement.classList.add('big'); } catch (e) { /* chế độ riêng tư: bỏ qua */ }
})();
