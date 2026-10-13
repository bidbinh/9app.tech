/* Vỏ ứng dụng: định tuyến theo hash, thanh điều hướng, giao diện sáng/tối, đăng ký service worker. */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon;
  var view = document.getElementById('view');
  var nav = document.getElementById('nav');

  var NAV = [
    { id: 'home', label: 'Hôm nay', icon: 'home', hash: '#/' },
    { id: 'learn', label: 'Từ vựng', icon: 'cards', hash: '#/learn' },
    { id: 'talk', label: 'Giao tiếp', icon: 'chat', hash: '#/talk' },
    { id: 'listen', label: 'Nghe', icon: 'headphones', hash: '#/listen' },
    { id: 'more', label: 'Thêm', icon: 'more', hash: '#/more' }
  ];
  var TRACKED = { learn: 1, talk: 1, listen: 1, test: 1 };

  function parse() { return E.route.parseHash(location.hash); }

  function buildNav() {
    E.ui.clear(nav);
    NAV.forEach(function (n) {
      nav.appendChild(h('a.nav-item', { href: n.hash, 'data-nav': n.id, 'aria-label': n.label }, icon(n.icon, 22), h('span', { text: n.label })));
    });
  }
  function markNav(section) {
    var key = section === 'test' ? 'home' : section;
    Array.prototype.forEach.call(nav.children, function (a) {
      var on = a.getAttribute('data-nav') === key;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  var cleanup = null;
  function render() {
    var r = parse();
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    E.speech.stop();
    E.ui.clear(view);
    var fn = E.views[r.section] || E.views.home;
    markNav(r.section);
    E.practice.setActive(!!TRACKED[r.section]);
    try { cleanup = fn(view, r.parts, r.query) || null; }
    catch (err) {
      view.appendChild(h('div.card', h('h2', 'Có lỗi khi mở màn hình này'), h('p', { text: String(err && err.message || err) }), h('a.btn', { href: '#/' }, 'Về trang chủ')));
      if (root.console) console.error(err);
    }
    updateHeader();
    root.scrollTo(0, 0);
  }

  function updateHeader() {
    var s = E.store.state(), goal = s.settings.dailyMin * 60;
    var st = E.streak.streak(s.secByDay, goal, E.store.today());
    var chip = document.getElementById('hd-streak');
    if (!chip) return;
    E.ui.clear(chip);
    chip.appendChild(icon('flame', 16));
    chip.appendChild(h('span', { text: String(st.current) }));
    chip.setAttribute('aria-label', 'Chuỗi ' + st.current + ' ngày');
    chip.classList.toggle('hot', st.todayDone);
  }

  /* ---- Giao diện sáng/tối ---- */
  function applyTheme() {
    var t = E.store.state().settings.theme;
    var el = document.documentElement;
    if (t === 'light' || t === 'dark') el.setAttribute('data-theme', t); else el.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', dark ? '#0f1220' : '#4f46e5');
  }

  E.views = E.views || {};
  E.app = { applyTheme: applyTheme, render: render, refresh: function () { var y = root.scrollY; render(); root.scrollTo(0, y); }, updateHeader: updateHeader, go: function (hash) { if (location.hash === hash) render(); else location.hash = hash; } };

  function boot() {
    E.store.load();
    applyTheme();
    if (root.matchMedia) { try { root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) {} }
    buildNav();
    root.addEventListener('hashchange', render);
    E.onTick = function () { var r = document.getElementById('live-min'); if (r && E.views._live) E.views._live(); updateHeaderThrottled(); };
    var last = 0;
    function updateHeaderThrottled() { var n = Date.now(); if (n - last > 5000) { last = n; updateHeader(); } }
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(self);
