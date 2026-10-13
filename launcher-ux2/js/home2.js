var $ = function (id) { return document.getElementById(id); };
var KEY = '9app.prefs';
var listEl = $('list');
var searchEl = $('search');
var unusedEl = $('unused');
var actEl = $('act');
var prefs = loadPrefs();
var menuApp = null;
var returnFocus = null;
var toastTimer;
var view = 'home';

function fold(value) {
  var s = String(value || '');
  try { s = s.normalize('NFD'); } catch (e) {}
  return s.replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/Đ/g, 'd');
}
function loadPrefs() {
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    var valid = function (value) {
      if (!Array.isArray(value)) return [];
      var out = [];
      for (var i = 0; i < value.length; i++) {
        var id = value[i];
        if (out.indexOf(id) >= 0) continue;
        for (var j = 0; j < APPS.length; j++) if (APPS[j].id === id) { out.push(id); break; }
      }
      return out;
    };
    var usage = {};
    for (var a = 0; a < APPS.length; a++) {
      var rec = raw.usage && raw.usage[APPS[a].id];
      if (rec && typeof rec.count === 'number' && rec.count > 0 && rec.count === Math.floor(rec.count) && isFinite(rec.lastUsed)) {
        usage[APPS[a].id] = { count: rec.count, lastUsed: rec.lastUsed };
      }
    }
    return { fav: valid(raw.fav), hide: valid(raw.hide), show: valid(raw.show), usage: usage };
  } catch (e) {
    return { fav: [], hide: [], show: [], usage: {} };
  }
}
function onHome(app) {
  if (prefs.show.indexOf(app.id) >= 0) return true;
  if (prefs.hide.indexOf(app.id) >= 0) return false;
  return app.home !== false;
}
function addToHome(app) {
  if (prefs.show.indexOf(app.id) < 0) prefs.show.push(app.id);
  prefs.hide = prefs.hide.filter(function (id) { return id !== app.id; });
  var saved = savePrefs();
  render();
  if (saved) toast('Đã thêm ' + app.name + ' vào trang chủ');
}
function hideFromHome(app) {
  if (prefs.hide.indexOf(app.id) < 0) prefs.hide.push(app.id);
  prefs.show = prefs.show.filter(function (id) { return id !== app.id; });
  prefs.fav = prefs.fav.filter(function (id) { return id !== app.id; });
  var saved = savePrefs();
  render();
  closeMenu();
  if (saved) toast('Đã ẩn ' + app.name + '. Khôi phục ở Thư viện.');
}
function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); return true; }
  catch (e) { toast('Thay đổi được giữ trong phiên này. Trình duyệt chưa cho phép lưu.'); return false; }
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { $('toast').hidden = true; }, 2800);
}
function element(tag, className, text) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function fill(container, nodes) {
  while (container.firstChild) container.removeChild(container.firstChild);
  for (var i = 0; i < nodes.length; i++) container.appendChild(nodes[i]);
}
function setDialog(dialog, backdrop, open) {
  dialog.hidden = !open;
  $(backdrop).hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) {
    returnFocus = document.activeElement;
    var buttons = dialog.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      if (!buttons[i].hidden) { buttons[i].focus(); break; }
    }
  } else if (returnFocus && returnFocus.parentNode) {
    returnFocus.focus();
  }
}
function openMenu(app, trigger) {
  menuApp = app;
  var home = onHome(app);
  $('act-name').textContent = app.name;
  $('act-fav').hidden = !home;
  $('act-fav').textContent = prefs.fav.indexOf(app.id) >= 0 ? 'Bỏ ghim' : 'Ghim vào Dùng nhanh';
  $('act-hide').textContent = home ? 'Ẩn khỏi trang chủ' : 'Thêm vào trang chủ';
  $('act-hide').className = home ? 'danger' : '';
  setDialog(actEl, 'act-backdrop', true);
  if (trigger) returnFocus = trigger;
}
function closeMenu() {
  setDialog(actEl, 'act-backdrop', false);
  menuApp = null;
}
function bindHold(el, app, trigger) {
  var timer, startX, startY, held = false;
  var clear = function () { clearTimeout(timer); timer = null; };
  el.addEventListener('touchstart', function (event) {
    var t = event.touches && event.touches[0];
    if (!t) return;
    clear(); held = false;
    startX = t.clientX; startY = t.clientY;
    timer = setTimeout(function () { held = true; openMenu(app, trigger); }, 500);
  }, false);
  el.addEventListener('touchmove', function (event) {
    var t = event.touches && event.touches[0];
    if (!t || startX == null) return;
    var dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > 8) clear();
  }, false);
  el.addEventListener('touchend', clear, false);
  el.addEventListener('touchcancel', clear, false);
  el.addEventListener('contextmenu', function (event) {
    event.preventDefault();
    clear();
    openMenu(app, trigger);
  });
  el.addEventListener('click', function (event) {
    if (held) { event.preventDefault(); held = false; }
  });
}
function recordUse(app) {
  var previous = prefs.usage[app.id];
  prefs.usage[app.id] = { count: (previous && previous.count ? previous.count : 0) + 1, lastUsed: Date.now() };
  savePrefs();
}
/* ---------- Tìm chức năng trong app ----------
 * Mỗi app khai báo `features` (ngay trong apps.js) và/hoặc `index` (tệp JSON riêng, nạp trễ).
 * Chấm điểm, xếp hạng, không dấu: xem js/search.js. */
var FN_KEY = '9app.fnuse';
var FN_CACHE = '9app.fidx.';
var FN_SHOW = 8;
var FN_MAX = 30;
var IDX_REVALIDATE = 60 * 60 * 1000;
var IDX_RETRY = 20 * 1000;
var IDX_TIMEOUT = 8000;
var engine = window.NineSearch ? new NineSearch.Engine() : null;
var idxState = {};
var inlineLoaded = false;
var fnLimit = FN_SHOW;
var fnAppsFirst = false;
var fnUse = loadFnUse();
var srTimer;
var enterPending = null;

function loadFnUse() {
  try {
    var raw = JSON.parse(localStorage.getItem(FN_KEY) || '{}') || {};
    var out = {};
    for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k) && typeof raw[k] === 'number' && raw[k] > 0) out[k] = Math.floor(raw[k]);
    return out;
  } catch (e) { return {}; }
}
function recordFnUse(key) {
  fnUse[key] = (fnUse[key] || 0) + 1;
  var keys = Object.keys(fnUse);
  if (keys.length > 80) {
    keys.sort(function (a, b) { return fnUse[b] - fnUse[a]; });
    var kept = {};
    for (var i = 0; i < 60; i++) kept[keys[i]] = fnUse[keys[i]];
    fnUse = kept;
  }
  try { localStorage.setItem(FN_KEY, JSON.stringify(fnUse)); } catch (e) {}
}
function fnBoost(key) { return fnUse[key] ? 3 * fnUse[key] : 0; }
function categoryLabel(id) {
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].label;
  return '';
}
function appById(id) {
  for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i];
  return null;
}
function addDocs(app, list, tag) {
  if (!engine || !Array.isArray(list)) return 0;
  var docs = [], seen = {}, label = categoryLabel(app.category);
  for (var i = 0; i < list.length; i++) {
    var f = NineSearch.normalizeFeature(list[i]);
    if (!f) continue;
    var href = NineSearch.resolveHref(app.href, f.path, location.href);
    if (!href) continue;
    var doc = NineSearch.makeDoc(app, f, href, label);
    if (seen[doc.key]) continue;
    seen[doc.key] = true;
    docs.push(doc);
  }
  engine.setDocs(app.id + ':' + tag, docs);
  return docs.length;
}
function readIdxCache(app) {
  try {
    var c = JSON.parse(localStorage.getItem(FN_CACHE + app.id) || 'null');
    if (c && c.u === app.index && Array.isArray(c.d) && typeof c.t === 'number') return c;
  } catch (e) {}
  return null;
}
function writeIdxCache(app, data) {
  try { localStorage.setItem(FN_CACHE + app.id, JSON.stringify({ u: app.index, t: Date.now(), d: data })); } catch (e) {}
}
function refreshFeatures() {
  var a = document.activeElement;
  var wrap = $('fn-wrap');
  if (a && wrap && wrap.contains(a)) return;
  if (searchEl.value) renderFeatures(searchWords());
}
function loadIndex(app) {
  var st = idxState[app.id];
  var now = Date.now();
  if (st && (st.status === 'loading' || st.status === 'ok')) return;
  if (st && st.status === 'fail' && now - st.at < IDX_RETRY) return;
  var cached = readIdxCache(app);
  if (cached) {
    addDocs(app, cached.d, 'index');
    if (now - cached.t < IDX_REVALIDATE) { idxState[app.id] = { status: 'ok', at: now }; return; }
  }
  idxState[app.id] = { status: 'loading', at: now };
  var done = false;
  var ctl = window.AbortController ? new AbortController() : null;
  var finish = function (ok, data) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (ok) {
      addDocs(app, data, 'index');
      writeIdxCache(app, data);
      idxState[app.id] = { status: 'ok', at: Date.now() };
    } else {
      idxState[app.id] = { status: cached ? 'ok' : 'fail', at: Date.now() };
    }
    refreshFeatures();
    if (enterPending && !indexesLoading()) openFirst();
  };
  var timer = setTimeout(function () { if (ctl) { try { ctl.abort(); } catch (e) {} } finish(false); }, IDX_TIMEOUT);
  if (!window.fetch) { finish(false); return; }
  try {
    fetch(app.index, ctl ? { signal: ctl.signal } : {}).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!Array.isArray(data)) throw new Error('format');
      finish(true, data);
    }).catch(function () { finish(false); });
  } catch (e) { finish(false); }
}
function ensureIndexes() {
  if (!engine) return;
  if (!inlineLoaded) {
    inlineLoaded = true;
    for (var i = 0; i < APPS.length; i++) if (APPS[i].ready && APPS[i].features) addDocs(APPS[i], APPS[i].features, 'inline');
  }
  for (var j = 0; j < APPS.length; j++) if (APPS[j].ready && APPS[j].index) loadIndex(APPS[j]);
}
function indexesLoading() {
  for (var id in idxState) if (idxState[id].status === 'loading') return true;
  return false;
}
function searchWords() {
  var raw = fold(searchEl.value).trim();
  return raw ? raw.split(/\s+/) : [];
}
function appNameMatches(words) {
  for (var i = 0; i < APPS.length; i++) {
    if (!APPS[i].ready) continue;
    var nm = fold(APPS[i].name), all = true;
    for (var w = 0; w < words.length; w++) if (nm.indexOf(words[w]) < 0) { all = false; break; }
    if (all) return true;
  }
  return false;
}
function countAppHits(words) {
  var n = 0;
  for (var i = 0; i < APPS.length; i++) {
    var a = APPS[i];
    if ((onHome(a) || a.ready) && matchesSearch(a, words)) n++;
  }
  return n;
}
function announce(text) {
  var el = $('sr-status');
  if (!el) return;
  clearTimeout(srTimer);
  srTimer = setTimeout(function () { el.textContent = text; }, 350);
}
function fnRow(item) {
  var d = item.doc;
  var li = element('li');
  var a = element('a', 'fn-item');
  a.href = d.href;
  a.setAttribute('aria-label', d.appName + ', ' + d.name + (d.blurb ? '. ' + d.blurb : ''));
  a.setAttribute('data-key', d.key);
  var img = element('img');
  img.src = d.appIcon;
  img.alt = '';
  img.width = 36;
  img.height = 36;
  a.appendChild(img);
  var body = element('span', 'fn-body');
  var title = element('span', 'fn-title');
  title.appendChild(element('span', 'fn-app', d.appName));
  var sep = element('span', 'fn-sep', '›');
  sep.setAttribute('aria-hidden', 'true');
  title.appendChild(sep);
  title.appendChild(element('span', 'fn-name', d.name));
  body.appendChild(title);
  if (d.blurb) body.appendChild(element('span', 'fn-blurb', d.blurb));
  a.appendChild(body);
  var chev = element('span', 'fn-go', '›');
  chev.setAttribute('aria-hidden', 'true');
  a.appendChild(chev);
  a.addEventListener('click', function () {
    recordFnUse(d.key);
    var app = appById(d.appId);
    if (app) recordUse(app);
  });
  li.appendChild(a);
  return li;
}
function renderFeatures(words) {
  var wrap = $('fn-wrap');
  var list = $('fn-list');
  var main = $('view-home');
  if (!wrap || !list || !main) return;
  var searching = words.length > 0 && view === 'home';
  if (!searching || !engine) {
    main.className = 'main';
    wrap.hidden = true;
    fill(list, []);
    fnLimit = FN_SHOW;
    fnAppsFirst = false;
    announce('');
    return;
  }
  var raw = searchEl.value;
  var res = engine.search(raw, { boost: fnBoost, noTypo: indexesLoading() });
  var items = res.items.slice(0, FN_MAX);
  var appHits = countAppHits(words);
  var loading = indexesLoading();
  var chips = [];
  if ((!items.length || res.near) && !appHits && !loading) {
    var sg = engine.suggest(raw, 3);
    for (var s = 0; s < sg.length; s++) {
      var b = element('button', 'fn-chip', sg[s].query);
      b.type = 'button';
      b.setAttribute('data-q', sg[s].query);
      chips.push(b);
    }
  }
  if (res.near && (appHits || chips.length || loading)) items = [];
  var near = res.near && items.length > 0;
  fnAppsFirst = appNameMatches(words);
  main.className = 'main searching' + (fnAppsFirst ? ' apps-first' : '');
  var note = $('fn-note'), sug = $('fn-suggest'), more = $('fn-more');
  var nodes = [];
  var shown = Math.min(items.length, fnLimit);
  for (var i = 0; i < shown; i++) nodes.push(fnRow(items[i]));
  fill(list, nodes);
  more.hidden = items.length <= shown;
  more.textContent = 'Xem thêm ' + (items.length - shown) + ' chức năng';
  var noteText = '';
  if (!items.length) {
    noteText = loading ? 'Đang nạp chức năng…' : (appHits ? '' : 'Không tìm thấy “' + raw.trim() + '” trong ứng dụng hay chức năng nào.');
  } else if (near) {
    noteText = 'Chưa có chức năng khớp đủ mọi từ. Gần giống:';
  }
  note.textContent = noteText;
  note.hidden = !noteText;
  if (chips.length) chips.unshift(element('span', 'fn-sug-label', 'Có phải bạn muốn tìm:'));
  fill(sug, chips);
  sug.hidden = !chips.length;
  wrap.hidden = !(items.length || noteText);
  if (items.length && !near) announce(items.length + ' chức năng. Nhấn mũi tên xuống để chọn, Enter để mở kết quả đầu.');
  else announce(noteText);
}
function firstLink() {
  var apps = '#list a.tile-link[href]';
  var order = fnAppsFirst ? [apps, '#fn-list a'] : ['#fn-list a', apps];
  for (var i = 0; i < order.length; i++) {
    var el = document.querySelector(order[i]);
    if (el) return el;
  }
  return null;
}
function clearSearch(focus) {
  searchEl.value = '';
  fnLimit = FN_SHOW;
  render();
  if (focus) searchEl.focus();
}
function openFirst() {
  clearTimeout(enterPending);
  enterPending = null;
  var link = firstLink();
  if (link && searchEl.value.trim()) link.click();
}
function onSearchKey(event) {
  var key = event.key;
  if (key === 'Enter' && !event.isComposing) {
    if (!searchEl.value.trim()) return;
    event.preventDefault();
    if (indexesLoading()) {
      // Chỉ mục còn đang về: đợi xong rồi mở kết quả đầu (tối đa vài giây)
      clearTimeout(enterPending);
      enterPending = setTimeout(openFirst, IDX_TIMEOUT + 500);
      return;
    }
    openFirst();
  } else if (key === 'ArrowDown') {
    var first = firstLink();
    if (first && searchEl.value.trim()) { event.preventDefault(); first.focus(); }
  } else if (key === 'Escape' && searchEl.value) {
    event.preventDefault();
    clearSearch(false);
  }
}
function onResultKey(event) {
  var key = event.key;
  var links = $('fn-list').querySelectorAll('a');
  var at = -1;
  for (var i = 0; i < links.length; i++) if (links[i] === document.activeElement) at = i;
  if (at < 0) return;
  if (key === 'ArrowDown') {
    event.preventDefault();
    if (at + 1 < links.length) links[at + 1].focus();
    else if (!$('fn-more').hidden) $('fn-more').focus();
  } else if (key === 'ArrowUp') {
    event.preventDefault();
    if (at > 0) links[at - 1].focus(); else searchEl.focus();
  } else if (key === 'Escape') {
    event.preventDefault();
    searchEl.focus();
  }
}


/* ==================================================================
 * Trang chủ mới (v17): Dùng nhanh · Gợi ý · Ứng dụng (chip nhóm) · Thư viện
 * Nguyên tắc: mỗi app tối đa MỘT lần trên trang chủ.
 * Khóa lưu: 9app.prefs (giữ nguyên), 9app.fnuse (giữ nguyên), 9app.ui (mới: lời chào/gợi ý đã đóng).
 * ================================================================== */
var UI_KEY = '9app.ui';
var QUICK_MAX = 8;
var SUGGEST_MAX = 6;
var GRID_SHOW = 16;      // quá GRID_LIMIT app thì chỉ hiện GRID_SHOW app đầu + nút "Hiện thêm"
var GRID_LIMIT = 20;
var CHIP_ORDER = ['family', 'work', 'life', 'drive', 'hobby'];
var SOON = [
  { name: '9shop', icon: 'icons/soon-shop.svg?v=1' }, { name: '9ticket', icon: 'icons/soon-ticket.svg?v=1' },
  { name: '9voucher', icon: 'icons/soon-voucher.svg?v=1' }, { name: '9bill', icon: 'icons/soon-bill.svg?v=1' },
  { name: '9payday', icon: 'icons/soon-payday.svg?v=1' }, { name: '9car', icon: 'icons/soon-car.svg?v=1' },
  { name: '9fit', icon: 'icons/soon-fit.svg?v=1' }, { name: '9gift', icon: 'icons/soon-gift.svg?v=1' },
  { name: '9repair', icon: 'icons/soon-repair.svg?v=1' }
];
var ui = loadUi();
var homeFilter = 'all';
var gridExpanded = false;
var libFilter = 'all';
var libText = '';

function loadUi() {
  try {
    var r = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {};
    return { welcome: !!r.welcome, suggest: !!r.suggest };
  } catch (e) { return { welcome: false, suggest: false }; }
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {}
}
function isFav(app) { return prefs.fav.indexOf(app.id) >= 0; }
function isUsed(app) { return !!(prefs.usage[app.id] && prefs.usage[app.id].count); }
function userHidden(app) { return prefs.hide.indexOf(app.id) >= 0 && prefs.show.indexOf(app.id) < 0; }
function byName(a, b) {
  var x = fold(a.name), y = fold(b.name);
  return x < y ? -1 : x > y ? 1 : 0;
}
function hasUsage() {
  for (var k in prefs.usage) if (Object.prototype.hasOwnProperty.call(prefs.usage, k)) return true;
  return false;
}
function setBusy() { if (listEl) listEl.removeAttribute('aria-busy'); }

/* ---------- Ô ứng dụng ---------- */
function appTile(app, opts) {
  opts = opts || {};
  var tile = element('article', 'tile');
  var link = element(app.ready ? 'a' : 'div', 'tile-link');
  var ico = element('span', 'ico');
  var img = element('img');
  img.src = app.icon;
  img.alt = '';
  img.width = 56;
  img.height = 56;
  ico.appendChild(img);
  if (opts.pin) {
    var pin = element('span', 'pin');
    pin.setAttribute('aria-hidden', 'true');
    pin.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-star"/></svg>';
    ico.appendChild(pin);
  }
  link.appendChild(ico);
  link.appendChild(element('span', 'tile-name', app.name));
  if (opts.meta) link.appendChild(element('span', 'tile-meta', opts.meta));
  tile.appendChild(link);
  if (app.ready) {
    link.href = app.href;
    link.setAttribute('aria-label', 'Mở ' + app.name + (opts.pin ? ', đã ghim' : ''));
    bindHold(link, app, link);
    link.addEventListener('click', function (event) {
      if (event.defaultPrevented) return;
      recordUse(app);
    });
  }
  return tile;
}
function suggestPill(app) {
  var a = element('a', 'sug-pill');
  a.href = app.href;
  a.setAttribute('aria-label', 'Mở ' + app.name + ', ứng dụng gợi ý');
  var img = element('img');
  img.src = app.icon; img.alt = ''; img.width = 32; img.height = 32;
  a.appendChild(img);
  a.appendChild(element('span', 'tile-name', app.name));
  bindHold(a, app, a);
  a.addEventListener('click', function (event) { if (!event.defaultPrevented) recordUse(app); });
  return a;
}
function matchesSearch(app, words) {
  if (!words.length) return true;
  var hay = fold(app.name + ' ' + app.blurb + ' ' + categoryLabel(app.category));
  for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) return false;
  return true;
}

/* ---------- Chia app vào các vùng, KHÔNG trùng nhau ---------- */
function partition() {
  var home = [];
  for (var i = 0; i < APPS.length; i++) if (onHome(APPS[i]) && APPS[i].ready) home.push(APPS[i]);
  var quick = [], seen = {}, f, a;
  for (f = 0; f < prefs.fav.length && quick.length < QUICK_MAX; f++) {
    a = appById(prefs.fav[f]);
    if (a && onHome(a) && a.ready && !seen[a.id]) { quick.push(a); seen[a.id] = true; }
  }
  var rec = [];
  for (i = 0; i < home.length; i++) if (!seen[home[i].id] && isUsed(home[i])) rec.push(home[i]);
  rec.sort(function (x, y) { return prefs.usage[y.id].lastUsed - prefs.usage[x.id].lastUsed; });
  for (i = 0; i < rec.length && quick.length < QUICK_MAX; i++) { quick.push(rec[i]); seen[rec[i].id] = true; }
  var suggest = [];
  if (!ui.suggest) {
    for (i = 0; i < APPS.length && suggest.length < SUGGEST_MAX; i++) {
      a = APPS[i];
      if (a.ready && !onHome(a) && !userHidden(a) && !isUsed(a)) suggest.push(a);
    }
  }
  var grid = [];
  for (i = 0; i < APPS.length; i++) if (onHome(APPS[i]) && !seen[APPS[i].id]) grid.push(APPS[i]);
  grid.sort(byName);
  return { quick: quick, suggest: suggest, grid: grid, hasHome: home.length > 0 || grid.length > 0 };
}
function chipOrder(grid) {
  var present = {}, out = [], i;
  for (i = 0; i < grid.length; i++) present[grid[i].category] = (present[grid[i].category] || 0) + 1;
  for (i = 0; i < CHIP_ORDER.length; i++) if (present[CHIP_ORDER[i]]) { out.push(CHIP_ORDER[i]); delete present[CHIP_ORDER[i]]; }
  for (i = 0; i < CATEGORIES.length; i++) if (present[CATEGORIES[i].id]) out.push(CATEGORIES[i].id);
  return out;
}
function chipButton(key, label, active, attr) {
  var b = element('button', 'chip' + (active ? ' on' : ''));
  b.type = 'button';
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  b.setAttribute(attr, key);
  b.appendChild(element('span', 'pill', label));
  return b;
}
function refocus(container, attr, key) {
  var el = container.querySelector('[' + attr + '="' + key + '"]');
  if (el) el.focus();
}

function renderHome(words) {
  var searching = words.length > 0;
  var p = partition();
  var quickEl = $('quick'), grid;
  var i, nodes;

  var welcome = !(ui.welcome || hasUsage() || prefs.fav.length > 0);
  $('welcome').hidden = searching || !welcome;

  // Dùng nhanh
  var quick = searching ? [] : p.quick;
  $('quick-wrap').hidden = quick.length === 0;
  var sl = quickEl.scrollLeft;
  nodes = [];
  for (i = 0; i < quick.length; i++) nodes.push(appTile(quick[i], { pin: isFav(quick[i]) }));
  fill(quickEl, nodes);
  quickEl.scrollLeft = sl;

  // Gợi ý
  var sug = (searching || welcome) ? [] : p.suggest;  // người mới: chỉ lời chào + ứng dụng, gợi ý đến sau
  $('suggest-wrap').hidden = sug.length === 0;
  nodes = [];
  for (i = 0; i < sug.length; i++) nodes.push(suggestPill(sug[i]));
  fill($('suggest'), nodes);

  // Ứng dụng
  var chipsEl = $('chips');
  if (searching) {
    grid = [];
    for (i = 0; i < APPS.length; i++) {
      if (APPS[i].ready && matchesSearch(APPS[i], words)) grid.push(APPS[i]);
    }
    grid.sort(byName);
    $('apps-title').textContent = 'Ứng dụng';
    chipsEl.hidden = true;
    $('library').hidden = grid.length === 0;
    $('list-more').hidden = true;
    $('empty').hidden = true;
    nodes = [];
    for (i = 0; i < grid.length; i++) nodes.push(appTile(grid[i], { meta: onHome(grid[i]) ? '' : 'Đã ẩn' }));
    fill(listEl, nodes);
    setBusy();
    return;
  }
  $('library').hidden = false;
  grid = p.grid;
  $('apps-title').textContent = p.quick.length ? 'Ứng dụng khác' : 'Tất cả ứng dụng';
  var cats = chipOrder(grid);
  var showChips = grid.length >= 9 && cats.length >= 2;
  if (!showChips || (homeFilter !== 'all' && cats.indexOf(homeFilter) < 0)) homeFilter = 'all';
  chipsEl.hidden = !showChips;
  if (showChips) {
    var cn = [chipButton('all', 'Tất cả', homeFilter === 'all', 'data-k')];
    for (i = 0; i < cats.length; i++) cn.push(chipButton(cats[i], categoryLabel(cats[i]), homeFilter === cats[i], 'data-k'));
    fill(chipsEl, cn);
  }
  var shown = grid;
  if (homeFilter !== 'all') {
    shown = [];
    for (i = 0; i < grid.length; i++) if (grid[i].category === homeFilter) shown.push(grid[i]);
  }
  var cut = homeFilter === 'all' && !gridExpanded && shown.length > GRID_LIMIT ? GRID_SHOW : shown.length;
  nodes = [];
  for (i = 0; i < cut; i++) nodes.push(appTile(shown[i]));
  fill(listEl, nodes);
  setBusy();
  var more = $('list-more');
  more.hidden = cut >= shown.length;
  more.textContent = 'Hiện thêm ' + (shown.length - cut) + ' ứng dụng';
  var emptyAll = !p.hasHome;
  $('empty').hidden = !emptyAll;
  if (emptyAll) {
    $('empty-title').textContent = 'Chưa có ứng dụng';
    $('empty-message').textContent = 'Mở Thư viện để thêm ứng dụng vào trang chủ.';
  }
  $('library').hidden = grid.length === 0 && !emptyAll;
}

/* ---------- Thư viện ---------- */
function statusOf(app) {
  if (isFav(app) && onHome(app)) return { text: 'Đã ghim', cls: 'b-pin' };
  if (!onHome(app)) return userHidden(app) ? { text: 'Đã ẩn', cls: 'b-hide' } : { text: 'Chưa thêm', cls: 'b-hide' };
  return null;
}
function libRow(app) {
  var li = element('li', 'row');
  var main = element(app.ready ? 'a' : 'div', 'row-main');
  var img = element('img');
  img.src = app.icon; img.alt = ''; img.width = 44; img.height = 44;
  main.appendChild(img);
  var body = element('span', 'row-body');
  var t = element('span', 'row-title');
  t.appendChild(element('span', 'row-name', app.name));
  var st = statusOf(app);
  if (st) t.appendChild(element('span', 'badge ' + st.cls, st.text));
  body.appendChild(t);
  body.appendChild(element('span', 'row-blurb', app.blurb || ''));
  main.appendChild(body);
  if (app.ready) {
    main.href = app.href;
    main.setAttribute('aria-label', 'Mở ' + app.name);
    main.addEventListener('click', function (event) { if (!event.defaultPrevented) recordUse(app); });
  }
  li.appendChild(main);
  var act;
  if (!onHome(app)) {
    act = element('button', 'row-act add', 'Thêm');
    act.type = 'button';
    act.setAttribute('aria-label', 'Thêm ' + app.name + ' vào trang chủ');
    act.addEventListener('click', function () { addToHome(app); });
  } else {
    act = element('button', 'row-act');
    act.type = 'button';
    act.setAttribute('aria-label', 'Tùy chọn cho ' + app.name);
    act.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-more"/></svg>';
    act.addEventListener('click', function () { openMenu(app, act); });
  }
  li.appendChild(act);
  return li;
}
function renderLibrary() {
  var words = fold(libText).trim();
  words = words ? words.split(/\s+/) : [];
  var counts = { all: APPS.length, pin: 0, hid: 0 }, i, a;
  for (i = 0; i < APPS.length; i++) {
    a = APPS[i];
    if (isFav(a) && onHome(a)) counts.pin++;
    if (!onHome(a)) counts.hid++;
  }
  var cn = [
    chipButton('all', 'Tất cả ' + counts.all, libFilter === 'all', 'data-f'),
    chipButton('pin', 'Đã ghim ' + counts.pin, libFilter === 'pin', 'data-f'),
    chipButton('hid', 'Đã ẩn ' + counts.hid, libFilter === 'hid', 'data-f')
  ];
  fill($('lib-chips'), cn);
  $('lib-sub').textContent = APPS.length + ' ứng dụng. Chạm để mở, “⋯” để ghim hoặc ẩn.';
  var order = CHIP_ORDER.slice();
  for (i = 0; i < CATEGORIES.length; i++) if (order.indexOf(CATEGORIES[i].id) < 0) order.push(CATEGORIES[i].id);
  var nodes = [], total = 0;
  for (var c = 0; c < order.length; c++) {
    var group = [];
    for (i = 0; i < APPS.length; i++) {
      a = APPS[i];
      if (a.category !== order[c] || !matchesSearch(a, words)) continue;
      if (libFilter === 'pin' && !(isFav(a) && onHome(a))) continue;
      if (libFilter === 'hid' && onHome(a)) continue;
      group.push(a);
    }
    if (!group.length) continue;
    group.sort(byName);
    total += group.length;
    var sec = element('section', 'lib-group');
    var h = element('h2', 'lib-h', categoryLabel(order[c]));
    h.appendChild(element('span', 'lib-n', String(group.length)));
    sec.appendChild(h);
    var ul = element('ul', 'rows');
    for (i = 0; i < group.length; i++) ul.appendChild(libRow(group[i]));
    sec.appendChild(ul);
    nodes.push(sec);
  }
  fill($('lib-list'), nodes);
  $('unused-empty').hidden = total > 0;
  // Sắp ra mắt: cuối thư viện
  var soon = [];
  if (libFilter === 'all') {
    for (i = 0; i < SOON.length; i++) {
      var dup = false;
      for (var j = 0; j < APPS.length; j++) if (fold(APPS[j].name) === fold(SOON[i].name)) dup = true;
      var hay = fold(SOON[i].name + ' sap ra mat'), okw = true;
      for (var q = 0; q < words.length; q++) if (hay.indexOf(words[q]) < 0) okw = false;
      if (!dup && okw) soon.push(SOON[i]);
    }
  }
  var box = $('lib-soon');
  box.hidden = soon.length === 0;
  if (soon.length) {
    var s = element('section', 'lib-group');
    var sh = element('h2', 'lib-h', 'Sắp ra mắt');
    sh.appendChild(element('span', 'lib-n', String(soon.length)));
    s.appendChild(sh);
    var sl = element('ul', 'rows soon-rows');
    for (i = 0; i < soon.length; i++) {
      var li = element('li', 'row');
      var m = element('div', 'row-main');
      var im = element('img');
      im.src = soon[i].icon; im.alt = ''; im.width = 44; im.height = 44;
      m.appendChild(im);
      var bd = element('span', 'row-body');
      bd.appendChild(element('span', 'row-title')).appendChild(element('span', 'row-name', soon[i].name));
      bd.appendChild(element('span', 'row-blurb', 'Đang xây dựng'));
      m.appendChild(bd);
      m.appendChild(element('span', 'badge b-soon', 'Sắp ra mắt'));
      li.appendChild(m);
      sl.appendChild(li);
    }
    s.appendChild(sl);
    fill(box, [s]);
  }
}

function render() {
  var raw = fold(searchEl.value).trim();
  var words = raw ? raw.split(/\s+/) : [];
  renderHome(words);
  renderLibrary();
  renderFeatures(words);
  if ($('search-clear')) $('search-clear').hidden = !searchEl.value;
  if ($('account-note')) $('account-note').textContent = APPS.length + ' ứng dụng trong hệ sinh thái 9app.';
}
function setTab(id) {
  var tabs = ['tab-home', 'tab-lib', 'tab-bell', 'tab-user'];
  for (var i = 0; i < tabs.length; i++) {
    var el = $(tabs[i]);
    if (!el) continue;
    el.className = tabs[i] === id ? 'tab on' : 'tab';
    if (tabs[i] === id) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }
}
function showView(name) {
  var changed = view !== name;
  view = name;
  $('view-home').hidden = name !== 'home';
  unusedEl.hidden = name !== 'library';
  $('notify').hidden = name !== 'notify';
  $('account').hidden = name !== 'account';
  if (name === 'home') setTab('tab-home');
  if (name === 'library') setTab('tab-lib');
  if (name === 'notify') setTab('tab-bell');
  if (name === 'account') setTab('tab-user');
  if (changed) { try { window.scrollTo(0, 0); } catch (e) {} }
}

/* ---------- Sự kiện ---------- */
searchEl.addEventListener('input', function () {
  showView('home');
  ensureIndexes();
  fnLimit = FN_SHOW;
  clearTimeout(enterPending);
  enterPending = null;
  render();
});
searchEl.addEventListener('focus', ensureIndexes);
searchEl.addEventListener('keydown', onSearchKey);
if ($('search-clear')) $('search-clear').addEventListener('click', function () { clearSearch(true); });
if ($('fn-wrap')) $('fn-wrap').addEventListener('keydown', onResultKey);
if ($('fn-more')) {
  $('fn-more').addEventListener('click', function () { fnLimit = FN_MAX; renderFeatures(searchWords()); });
  $('fn-more').addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowUp') return;
    var links = $('fn-list').querySelectorAll('a');
    if (links.length) { event.preventDefault(); links[links.length - 1].focus(); }
  });
}
if ($('fn-suggest')) $('fn-suggest').addEventListener('click', function (event) {
  var b = event.target;
  while (b && b !== this && !(b.getAttribute && b.getAttribute('data-q'))) b = b.parentNode;
  if (!b || b === this) return;
  searchEl.value = b.getAttribute('data-q');
  searchEl.focus();
  fnLimit = FN_SHOW;
  render();
});
function chipTarget(event, attr) {
  var b = event.target;
  while (b && !(b.getAttribute && b.getAttribute(attr))) { if (b === event.currentTarget) return null; b = b.parentNode; }
  return b && b.getAttribute ? b.getAttribute(attr) : null;
}
$('chips').addEventListener('click', function (event) {
  var k = chipTarget(event, 'data-k');
  if (!k) return;
  homeFilter = k;
  gridExpanded = false;
  render();
  refocus($('chips'), 'data-k', k);
});
$('lib-chips').addEventListener('click', function (event) {
  var k = chipTarget(event, 'data-f');
  if (!k) return;
  libFilter = k;
  renderLibrary();
  refocus($('lib-chips'), 'data-f', k);
});
$('lib-q').addEventListener('input', function () { libText = this.value; renderLibrary(); });
$('list-more').addEventListener('click', function () { gridExpanded = true; render(); });
$('tab-home').addEventListener('click', function () { showView('home'); });
$('tab-lib').addEventListener('click', function () { showView('library'); });
$('tab-bell').addEventListener('click', function () { showView('notify'); });
$('tab-user').addEventListener('click', function () { showView('account'); });
$('btn-account').addEventListener('click', function () { showView('account'); });
$('btn-all-mine').addEventListener('click', function () { showView('library'); });
$('empty-go').addEventListener('click', function () { showView('library'); });
$('welcome-x').addEventListener('click', function () { ui.welcome = true; saveUi(); render(); });
$('suggest-x').addEventListener('click', function () { ui.suggest = true; saveUi(); render(); toast('Đã ẩn gợi ý. Xem lại ở Thư viện.'); });
$('reset-ui').addEventListener('click', function () { ui.welcome = false; ui.suggest = false; saveUi(); render(); toast('Đã hiện lại lời chào và gợi ý.'); });
$('act-cancel').addEventListener('click', closeMenu);
$('act-backdrop').addEventListener('click', closeMenu);
$('act-fav').addEventListener('click', function () {
  if (!menuApp) return;
  var id = menuApp.id, name = menuApp.name;
  var wasFavorite = prefs.fav.indexOf(id) >= 0;
  prefs.fav = wasFavorite
    ? prefs.fav.filter(function (item) { return item !== id; })
    : prefs.fav.concat([id]);
  var saved = savePrefs();
  render(); closeMenu();
  if (saved) toast(wasFavorite ? ('Đã bỏ ghim ' + name) : ('Đã ghim ' + name));
});
$('act-hide').addEventListener('click', function () {
  if (!menuApp) return;
  if (onHome(menuApp)) hideFromHome(menuApp);
  else { addToHome(menuApp); closeMenu(); }
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && !actEl.hidden) closeMenu();
});

try { render(); showView('home'); }
catch (e) { try { console.error(e); } catch (x) {} }
