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
var openGroup = {};
var resizeTimer;

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
  showView('home');
  searchEl.value = '';
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
  $('act-fav').textContent = prefs.fav.indexOf(app.id) >= 0 ? 'Bỏ khỏi ưa thích' : 'Ghim ưa thích';
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
function cols() {
  var w = 390;
  if (listEl && listEl.clientWidth) w = listEl.clientWidth;
  else if ($('phone') && $('phone').clientWidth) w = $('phone').clientWidth - 28;
  else if (document.documentElement && document.documentElement.clientWidth) {
    w = Math.min(430, document.documentElement.clientWidth);
  }
  var n = Math.floor(w / 72);
  if (n < 4) n = 4;
  if (n > 6) n = 6;
  return n;
}
function applyCols(n) {
  var root = $('phone');
  if (!root) return;
  var next = 'workspace cols-' + n;
  if (root.className !== next) root.className = next;
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
  var apps = '#suggest a.tile-link[href], #list a.tile-link[href]';
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

function appTile(app, opts) {
  opts = opts || {};
  var tile = element('article', 'tile');
  var link = element(opts.add ? 'button' : (app.ready ? 'a' : 'div'), 'tile-link');
  var img = element('img');
  img.src = app.icon;
  img.alt = '';
  img.width = 48;
  img.height = 48;
  link.appendChild(img);
  link.appendChild(element('span', 'tile-name', app.name));
  if (opts.meta) link.appendChild(element('span', 'tile-meta', opts.meta));
  tile.appendChild(link);
  if (opts.add) {
    link.type = 'button';
    link.addEventListener('click', function () { addToHome(app); });
  } else if (app.ready) {
    link.href = app.href;
    link.setAttribute('aria-label', 'Mở ' + app.name);
    bindHold(link, app, link);
    link.addEventListener('click', function (event) {
      if (event.defaultPrevented) return;
      recordUse(app);
    });
  }
  return tile;
}
function addTile() {
  var wrap = element('div', 'tile-add-card');
  var btn = element('button', '', '+');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Thêm ứng dụng');
  btn.addEventListener('click', function () { showView('library'); });
  wrap.appendChild(btn);
  wrap.appendChild(element('span', '', 'Thêm ứng dụng'));
  return wrap;
}
function matchesSearch(app, words) {
  if (!words.length) return true;
  var category = '';
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === app.category) category = CATEGORIES[i].label;
  var hay = fold(app.name + ' ' + app.blurb + ' ' + category);
  for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) return false;
  return true;
}
function sortByUse(apps) {
  return apps.slice().sort(function (a, b) {
    var la = (prefs.usage[a.id] && prefs.usage[a.id].lastUsed) || 0;
    var lb = (prefs.usage[b.id] && prefs.usage[b.id].lastUsed) || 0;
    if (lb !== la) return lb - la;
    var ca = (prefs.usage[a.id] && prefs.usage[a.id].count) || 0;
    var cb = (prefs.usage[b.id] && prefs.usage[b.id].count) || 0;
    if (cb !== ca) return cb - ca;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
function homeApps() {
  var out = [];
  for (var i = 0; i < APPS.length; i++) if (onHome(APPS[i])) out.push(APPS[i]);
  return out;
}
function suggestList() {
  var out = [];
  for (var i = 0; i < APPS.length; i++) if (APPS[i].ready && !onHome(APPS[i])) out.push(APPS[i]);
  return sortByUse(out);
}
function recentList() {
  var used = [];
  for (var i = 0; i < APPS.length; i++) {
    var rec = prefs.usage[APPS[i].id];
    if (APPS[i].ready && rec && rec.lastUsed) used.push(APPS[i]);
  }
  used.sort(function (a, b) { return prefs.usage[b.id].lastUsed - prefs.usage[a.id].lastUsed; });
  return used;
}
function groupUse(catId) {
  var n = 0;
  for (var i = 0; i < APPS.length; i++) {
    if (APPS[i].category !== catId) continue;
    var rec = prefs.usage[APPS[i].id];
    if (rec && rec.count) n += rec.count;
  }
  return n;
}
function catRank(id) {
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return i;
  return 99;
}
function orderedCategories() {
  return CATEGORIES.slice().sort(function (a, b) {
    var ua = groupUse(a.id), ub = groupUse(b.id);
    if (ub !== ua) return ub - ua;
    return catRank(a.id) - catRank(b.id);
  });
}
function moreTile(cat, label) {
  var wrap = element('div', 'tile-add-card more-tile');
  var btn = element('button', '', '…');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Xem thêm ' + label);
  btn.addEventListener('click', function () {
    openGroup[cat] = true;
    render();
  });
  wrap.appendChild(btn);
  wrap.appendChild(element('span', '', 'Xem thêm'));
  return wrap;
}
function renderMine(words) {
  var n = cols();
  applyCols(n);
  var apps = homeApps();
  var nodes = [];
  var shown = 0;
  var cats = orderedCategories();
  for (var c = 0; c < cats.length; c++) {
    var cat = cats[c];
    var group = [];
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].category !== cat.id) continue;
      if (!matchesSearch(apps[i], words)) continue;
      group.push(apps[i]);
    }
    if (!group.length) continue;
    var block = element('div', 'group');
    var head = element('div', 'group-head');
    head.appendChild(element('h3', '', cat.label));
    block.appendChild(head);
    var grid = element('div', 'my-grid');
    var expanded = words.length > 0 || openGroup[cat.id];
    var full = Math.floor(group.length / n) * n;
    var visible = group.length;
    if (!expanded && full > 0) visible = full;
    var g;
    for (g = 0; g < visible; g++) grid.appendChild(appTile(group[g]));
    if (!expanded && group.length > visible) grid.appendChild(moreTile(cat.id, cat.label));
    block.appendChild(grid);
    nodes.push(block);
    shown += group.length;
  }
  if (!words.length) {
    var extra = element('div', 'my-grid');
    extra.appendChild(addTile());
    nodes.push(extra);
  }
  fill(listEl, nodes);
  $('empty').hidden = apps.length > 0 || words.length > 0;
}
function renderSuggest(words) {
  var wrap = $('suggest-wrap');
  var box = $('suggest');
  if (!wrap || !box) return;
  var n = cols();
  var list = suggestList();
  if (words.length) {
    var filtered = [];
    for (var i = 0; i < list.length; i++) if (matchesSearch(list[i], words)) filtered.push(list[i]);
    list = filtered;
  } else {
    list = list.slice(0, n);
  }
  wrap.hidden = list.length === 0;
  var nodes = [];
  for (var s = 0; s < list.length; s++) nodes.push(appTile(list[s]));
  fill(box, nodes);
}
function renderRecent(words) {
  var wrap = $('recent-wrap');
  var box = $('recent');
  if (!wrap || !box) return;
  if (words.length) { wrap.hidden = true; return; }
  var n = cols();
  var list = recentList().slice(0, n);
  wrap.hidden = list.length === 0;
  var nodes = [];
  for (var i = 0; i < list.length; i++) nodes.push(appTile(list[i]));
  fill(box, nodes);
}
function renderLibrary() {
  var hidden = [];
  for (var i = 0; i < APPS.length; i++) if (!onHome(APPS[i])) hidden.push(APPS[i]);
  var nodes = [];
  for (var h = 0; h < hidden.length; h++) nodes.push(appTile(hidden[h], { add: true }));
  fill($('unused-list'), nodes);
  $('unused-empty').hidden = hidden.length > 0;
}
function render() {
  var raw = fold(searchEl.value).trim();
  var words = raw ? raw.split(/\s+/) : [];
  renderMine(words);
  renderSuggest(words);
  renderRecent(words);
  renderLibrary();
  renderFeatures(words);
  if ($('search-clear')) $('search-clear').hidden = !searchEl.value;
  var n = 0;
  for (var i = 0; i < APPS.length; i++) n += 1;
  if ($('account-note')) $('account-note').textContent = n + ' ứng dụng trong hệ sinh thái 9app.';
}
function setTab(id) {
  var tabs = ['tab-home', 'tab-lib', 'tab-bell', 'tab-user'];
  for (var i = 0; i < tabs.length; i++) {
    var el = $(tabs[i]);
    if (el) el.className = tabs[i] === id ? 'tab on' : 'tab';
  }
}
function showView(name) {
  view = name;
  $('view-home').hidden = name !== 'home';
  unusedEl.hidden = name !== 'library';
  $('notify').hidden = name !== 'notify';
  $('account').hidden = name !== 'account';
  if (name === 'home') setTab('tab-home');
  if (name === 'library') { setTab('tab-lib'); renderLibrary(); }
  if (name === 'notify') setTab('tab-bell');
  if (name === 'account') setTab('tab-user');
}

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
$('btn-add').addEventListener('click', function () { showView('library'); });
$('tab-home').addEventListener('click', function () { showView('home'); });
$('tab-lib').addEventListener('click', function () { showView('library'); });
$('tab-bell').addEventListener('click', function () { showView('notify'); });
$('tab-user').addEventListener('click', function () { showView('account'); });
$('btn-bell').addEventListener('click', function () { showView('notify'); });
$('btn-account').addEventListener('click', function () { showView('account'); });
$('btn-discover').addEventListener('click', function () {
  showView('home');
  var el = $('suggest-wrap');
  if (el && !el.hidden && el.scrollIntoView) el.scrollIntoView();
  else showView('library');
});
$('btn-all-mine').addEventListener('click', function () { showView('library'); });
if ($('btn-all-suggest')) $('btn-all-suggest').addEventListener('click', function () { showView('library'); });
if ($('btn-all-recent')) $('btn-all-recent').addEventListener('click', function () { showView('library'); });
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

window.addEventListener('resize', function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});
try { render(); showView('home'); }
catch (e) {}
