/* Nút quay về 9app (‹ 9app, cùng kiểu với 9Ship) — cạnh logo app, không che nội dung. */
(function () {
  if (window.__n9home) return;
  window.__n9home = true;
  var host = location.hostname || '';
  var path = location.pathname || '/';
  // 9log có thanh điều hướng riêng, không dùng nút quay về 9app.
  if (/(^|\.)9log\.tech$/.test(host)) return;
  var onHub = host === '9app.tech' || host === 'www.9app.tech' || host === 'localhost' || host === '127.0.0.1';
  if (onHub && (path === '/' || path === '/index.html')) return;
  var home = onHub ? '/' : 'https://9app.tech/';

  var css = document.createElement('style');
  css.textContent =
    '#n9-home,.ve-9app{display:inline-flex;align-items:center;height:32px;margin-right:8px;padding:0 10px 0 6px;flex-shrink:0;border-radius:10px;background:rgba(127,127,127,.14);color:inherit;text-decoration:none;font:700 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;vertical-align:middle;white-space:nowrap;}'
    + '.ve-9app{width:auto!important;height:32px!important;min-width:0!important;padding:0 10px 0 6px!important;margin:0 8px 0 0!important;border-radius:10px!important;background:rgba(127,127,127,.14)!important;color:inherit!important;font:700 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;box-shadow:none!important;letter-spacing:0!important}'
    + '.ve-9app span{font:inherit!important;color:inherit!important}'
    + '#n9-home svg,.ve-9app svg{width:18px;height:18px;margin-right:2px;flex-shrink:0;}'
    + 'html.n9-pad{padding-top:calc(44px + env(safe-area-inset-top,0px))}#n9-bar{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;align-items:center;box-sizing:border-box;height:calc(44px + env(safe-area-inset-top,0px));padding:env(safe-area-inset-top,0px) 12px 0;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);color:#1f2937;}'
    + '#n9-bar #n9-home{margin:0;background:rgba(47,123,255,.1);color:#1d4ed8;}'
    + '@media (prefers-color-scheme:dark){#n9-bar{background:#0f172a;color:#e5e7eb;border-bottom-color:rgba(255,255,255,.1)}#n9-bar #n9-home{background:rgba(255,255,255,.12);color:#e5e7eb}}';

  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

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
      // App không có thanh đầu trang để gắn: dựng thanh mỏng ở đầu màn hình và chừa chỗ bằng đệm trên của <html>,
      // gắn vào <html> (ngoài <body>) để không đụng cây React/Next của app. Nội dung được đẩy xuống, không bị đè.
      var bar = document.createElement('div');
      bar.id = 'n9-bar';
      bar.appendChild(a);
      document.documentElement.appendChild(bar);
      document.documentElement.classList.add('n9-pad');
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
        if (found[i].className === 've-9app' && !found[i].querySelector('svg')) found[i].innerHTML = CHEV + '9app';
      }
      return;
    }
    var a = document.createElement('a');
    a.id = 'n9-home';
    a.href = home;
    a.setAttribute('data-ve-9app', '1');
    a.setAttribute('aria-label', 'Về 9app');
    a.innerHTML = CHEV + '9app';
    insertBesideLogo(a);
  }

  if (document.body) mount();
  else if (document.addEventListener) document.addEventListener('DOMContentLoaded', mount);
})();
