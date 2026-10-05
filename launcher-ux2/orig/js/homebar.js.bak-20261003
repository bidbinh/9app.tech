/* Nút quay về 9app — cạnh logo app, không che nội dung. */
(function () {
  if (window.__n9home) return;
  window.__n9home = true;
  var host = location.hostname || '';
  var path = location.pathname || '/';
  var onHub = host === '9app.tech' || host === 'www.9app.tech' || host === 'localhost' || host === '127.0.0.1';
  if (onHub && (path === '/' || path === '/index.html')) return;
  var home = onHub ? '/' : 'https://9app.tech/';

  var css = document.createElement('style');
  css.textContent =
    '#n9-home{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;margin-right:8px;flex-shrink:0;border-radius:9px;background:#2F7BFF;color:#fff;text-decoration:none;font:800 16px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;vertical-align:middle;}'
    + '#n9-home.n9-fallback{position:fixed;top:10px;left:10px;z-index:2147483000;margin:0;box-shadow:0 4px 12px rgba(30,80,180,.35);}';

  function existing() {
    var nodes = document.querySelectorAll('[data-ve-9app], .ve-9app, #n9-home');
    var out = [];
    for (var i = 0; i < nodes.length; i++) out.push(nodes[i]);
    return out;
  }

  function findSlot() {
    return document.querySelector('.dau-tren')
      || document.querySelector('.dau-trong')
      || document.querySelector('.statusbar')
      || document.querySelector('header');
  }

  function insertBesideLogo(a) {
    var slot = findSlot();
    if (!slot) {
      a.className = 'n9-fallback';
      document.body.appendChild(a);
      return;
    }
    var logo = slot.querySelector('a.hieu, .hieu, img.dau-logo, .brand');
    if (logo && logo.parentNode) logo.parentNode.insertBefore(a, logo);
    else slot.insertBefore(a, slot.firstChild);
  }

  function mount() {
    if (!document.body) return;
    if (!css.parentNode) document.head.appendChild(css);
    var found = existing();
    if (found.length) {
      for (var i = 0; i < found.length; i++) {
        if (!found[i].getAttribute('href')) found[i].setAttribute('href', home);
      }
      return;
    }
    var a = document.createElement('a');
    a.id = 'n9-home';
    a.href = home;
    a.setAttribute('data-ve-9app', '1');
    a.setAttribute('aria-label', 'Về 9app');
    a.innerHTML = '<span class="n9-mark">9</span>';
    insertBesideLogo(a);
  }

  if (document.body) mount();
  else if (document.addEventListener) document.addEventListener('DOMContentLoaded', mount);
})();
