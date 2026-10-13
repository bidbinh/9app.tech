(function () {
  var b = document.getElementById('print');
  if (b) b.addEventListener('click', function () { window.print(); });
  if (location.hash === '#print') setTimeout(function () { window.print(); }, 300);
})();
