var $ = function (id) { return document.getElementById(id); };
var KEY = '9app.prefs';
var listEl = $('list');
var searchEl = $('search');
var unusedEl = $('allview');
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
  if (saved) toast('Đã ẩn ' + app.name + '. Xem lại ở Tất cả.');
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
  $('act-fav').textContent = prefs.fav.indexOf(app.id) >= 0 ? 'Bỏ ghim' : 'Ghim vào Yêu thích';
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
 * Trang chủ v18 (theo mẫu): Hero · Lối tắt · Nổi bật · Nhóm ứng dụng · Gợi ý · 5 mục thanh dưới
 * Nguyên tắc: trong "Nhóm ứng dụng" mỗi app CHỈ thuộc MỘT nhóm; trùng lặp chỉ ở chỗ quảng bá (Hero/Nổi bật/Gợi ý).
 * Khóa lưu: 9app.prefs (giữ nguyên), 9app.fnuse (giữ nguyên), 9app.ui (lời chào cũ + ẩn gợi ý).
 * Cấu hình nhóm/banner: js/home-config.js
 * ================================================================== */
var UI_KEY = '9app.ui';
var SUGGEST_MAX = 6;
var HERO_MS = 5500;
var COLLAPSED_N = 3;       // số app hiện ở thẻ nhóm khi thu gọn
var ui = loadUi();
var libFilter = 'all';     // all | pin | hid | <id nhóm>
var libMode = 'group';     // group | az
var libText = '';
var exploreGroup = 'all';
var openGroups = {};
var heroSig = '';
var heroTimer = null;
var heroIdx = 0;
var heroHold = false;
var heroCount = 0;
var heroRaf = 0;
var NOTICES = window.NINE_NOTICES || [];   // chưa có hệ thống thông báo thật: mảng rỗng → chuông không có chấm đỏ

var SHORTCUTS = [
  { label: 'Quét tài liệu', icon: 'i-scan', tone: 'green', app: 'scanner' },
  { label: 'Ví 9Ship', icon: 'i-wallet', tone: 'blue', app: 'ship', hash: '#/me' },
  { label: 'Lịch sử', icon: 'i-history', tone: 'orange', go: '#/yeu-thich/gan-day' },
  { label: 'Tất cả dịch vụ', icon: 'i-apps', tone: 'violet', go: '#/tat-ca' }
];

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
function cls(el, name, on) {
  var c = ' ' + el.className + ' ';
  var has = c.indexOf(' ' + name + ' ') >= 0;
  if (on && !has) el.className = (el.className ? el.className + ' ' : '') + name;
  else if (!on && has) el.className = c.replace(' ' + name + ' ', ' ').replace(/^\s+|\s+$/g, '');
}
function svgUse(id, klass) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', klass || 'icon');
  s.setAttribute('aria-hidden', 'true');
  var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + id);
  u.setAttribute('href', '#' + id);
  s.appendChild(u);
  return s;
}
function groupById(id) {
  for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i];
  return null;
}
function groupIdOf(app) {
  var id = app.group || GROUP_OF[app.id] || CAT_TO_GROUP[app.category] || 'other';
  return groupById(id) ? id : 'other';
}
function toneOf(app) { return groupById(groupIdOf(app)).tone; }
function shortOf(app) {
  if (SHORT[app.id]) return SHORT[app.id];
  var b = app.blurb || '';
  return b.length > 40 ? b.slice(0, 38).replace(/[\s,.;:]+\S*$/, '') + '…' : b;
}
function order(app) {
  for (var i = 0; i < APPS.length; i++) if (APPS[i].id === app.id) return i;
  return 999;
}
function useCount(app) { return prefs.usage[app.id] ? prefs.usage[app.id].count : 0; }
function lastUsed(app) { return prefs.usage[app.id] ? prefs.usage[app.id].lastUsed : 0; }
function homeApps() {
  var out = [];
  for (var i = 0; i < APPS.length; i++) if (APPS[i].ready && onHome(APPS[i])) out.push(APPS[i]);
  return out;
}
function matchesSearch(app, words) {
  if (!words.length) return true;
  var hay = fold(app.name + ' ' + app.blurb + ' ' + categoryLabel(app.category) + ' ' + groupById(groupIdOf(app)).label);
  for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) return false;
  return true;
}
function bindUse(el, app) {
  bindHold(el, app, el);
  el.addEventListener('click', function (event) { if (!event.defaultPrevented) recordUse(app); });
}
function agoText(t) {
  var d = Date.now() - t;
  if (d < 60000) return 'Vừa xong';
  if (d < 3600000) return Math.floor(d / 60000) + ' phút trước';
  if (d < 86400000) return Math.floor(d / 3600000) + ' giờ trước';
  return Math.floor(d / 86400000) + ' ngày trước';
}
function setBusy(el) { if (el) el.removeAttribute('aria-busy'); }

/* ---------- Ô ứng dụng (lưới 4 cột: kết quả tìm, Đã ghim, Mới…) ---------- */
function appTile(app, opts) {
  opts = opts || {};
  var tile = element('article', 'tile');
  var link = element(app.ready ? 'a' : 'div', 'tile-link');
  var ico = element('span', 'ico');
  var img = element('img');
  img.src = app.icon; img.alt = ''; img.width = 56; img.height = 56;
  ico.appendChild(img);
  if (opts.pin) {
    var pin = element('span', 'pin');
    pin.setAttribute('aria-hidden', 'true');
    pin.appendChild(svgUse('i-star', 'icon'));
    ico.appendChild(pin);
  }
  link.appendChild(ico);
  link.appendChild(element('span', 'tile-name', app.name));
  if (opts.meta) link.appendChild(element('span', 'tile-meta', opts.meta));
  tile.appendChild(link);
  if (app.ready) {
    link.href = app.href;
    link.setAttribute('aria-label', 'Mở ' + app.name + (opts.pin ? ', đã ghim' : ''));
    bindUse(link, app);
  }
  return tile;
}
/* Thẻ nhỏ trong thẻ nhóm: icon 40 + tên */
function miniApp(app) {
  var a = element('a', 'mini');
  a.href = app.href;
  a.setAttribute('aria-label', 'Mở ' + app.name);
  var img = element('img');
  img.src = app.icon; img.alt = ''; img.width = 40; img.height = 40;
  a.appendChild(img);
  a.appendChild(element('span', 'mini-name', app.name));
  bindUse(a, app);
  return a;
}
/* Thẻ "Nổi bật" pastel */
function featCard(app, why) {
  var a = element('a', 'fcard tone-' + toneOf(app));
  a.href = app.href;
  a.setAttribute('aria-label', 'Mở ' + app.name + '. ' + shortOf(app) + (why ? '. ' + why : ''));
  var top = element('span', 'fc-top');
  var img = element('img');
  img.src = app.icon; img.alt = ''; img.width = 44; img.height = 44;
  top.appendChild(img);
  var ch = element('span', 'fc-go');
  ch.appendChild(svgUse('i-chev', 'icon'));
  top.appendChild(ch);
  a.appendChild(top);
  a.appendChild(element('span', 'fc-name', app.name));
  a.appendChild(element('span', 'fc-desc', shortOf(app)));
  bindUse(a, app);
  return a;
}
/* Thẻ banner nhỏ "Gợi ý cho bạn": nền theo màu nhóm, hình minh họa vẽ bằng CSS quanh icon app */
function sugCard(app) {
  var promo = PROMO[app.id] || [app.name, shortOf(app)];
  var a = element('a', 'scard tone-' + toneOf(app));
  a.href = app.href;
  a.setAttribute('aria-label', 'Mở ' + app.name + '. ' + promo[0] + '. ' + promo[1]);
  var art = element('span', 'sc-art');
  art.setAttribute('aria-hidden', 'true');
  var img = element('img');
  img.src = app.icon; img.alt = ''; img.width = 64; img.height = 64;
  art.appendChild(img);
  a.appendChild(art);
  var copy = element('span', 'sc-copy');
  copy.appendChild(element('span', 'sc-title', promo[0]));
  copy.appendChild(element('span', 'sc-sub', promo[1]));
  var chip = element('span', 'sc-chip');
  var ci = element('img');
  ci.src = app.icon; ci.alt = ''; ci.width = 20; ci.height = 20;
  chip.appendChild(ci);
  chip.appendChild(element('span', '', app.name));
  copy.appendChild(chip);
  a.appendChild(copy);
  bindUse(a, app);
  return a;
}

/* ---------- Hero (carousel) ---------- */
function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
function heroList() {
  var out = [];
  for (var i = 0; i < BANNERS.length; i++) {
    var b = BANNERS[i];
    if (b.app) {
      var a = appById(b.app);
      if (!a || !a.ready || userHidden(a)) continue;
    }
    out.push(b);
  }
  return out;
}
function setSearch(q) {
  searchEl.value = q;
  showView('home');
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  ensureIndexes();
  fnLimit = FN_SHOW;
  render();
  try { window.scrollTo(0, 0); } catch (e2) {}
}
function heroSlide(b, i, n) {
  var s = element('div', 'hs tone-' + b.tone);
  s.setAttribute('role', 'group');
  s.setAttribute('aria-roledescription', 'slide');
  s.setAttribute('aria-label', (i + 1) + ' / ' + n);
  var copy = element('div', 'hs-copy');
  copy.appendChild(element('span', 'hs-tag', b.tag));
  var h = element('h3', 'hs-title');
  var lines = String(b.title).split('|');
  for (var l = 0; l < lines.length; l++) h.appendChild(element('span', 'hs-line', lines[l]));
  copy.appendChild(h);
  copy.appendChild(element('p', 'hs-desc', b.desc));
  var cta;
  if (b.soon) {
    cta = element('span', 'hs-cta is-soon', b.cta);
    cta.setAttribute('role', 'note');
  } else if (b.href) {
    cta = element('a', 'hs-cta');
    cta.href = b.href;
    cta.appendChild(element('span', '', b.cta));
    cta.appendChild(svgUse('i-arrow', 'icon'));
    (function (bn) {
      cta.addEventListener('click', function () { var a = bn.app ? appById(bn.app) : null; if (a) recordUse(a); });
    })(b);
  } else {
    cta = element('button', 'hs-cta');
    cta.type = 'button';
    cta.appendChild(element('span', '', b.cta));
    cta.appendChild(svgUse('i-arrow', 'icon'));
    (function (bn) {
      cta.addEventListener('click', function () {
        if (bn.search) setSearch(bn.search);
        else if (bn.view === 'explore') go('#/kham-pha');
        else if (bn.view === 'library') go('#/tat-ca');
        else if (bn.view === 'favorites') go('#/yeu-thich');
      });
    })(b);
  }
  copy.appendChild(cta);
  s.appendChild(copy);
  var art = element('div', 'hs-art');
  art.setAttribute('aria-hidden', 'true');
  if (ART[b.art]) art.innerHTML = ART[b.art];
  s.appendChild(art);
  return s;
}
function renderHero() {
  var list = heroList();
  var sig = '';
  for (var i = 0; i < list.length; i++) sig += list[i].id + ',';
  if (sig === heroSig) return;
  heroSig = sig;
  var track = $('hero-track'), dots = $('hero-dots');
  var slides = [], dn = [];
  for (i = 0; i < list.length; i++) {
    slides.push(heroSlide(list[i], i, list.length));
    dn.push(element('span', i === 0 ? 'on' : ''));
  }
  heroCount = list.length;
  heroIdx = 0;
  fill(track, slides);
  fill(dots, dn);
  dots.hidden = list.length < 2;
  $('hero').hidden = list.length === 0;
  try { track.scrollLeft = 0; } catch (e) {}
  heroSchedule();
}
function heroDots() {
  var d = $('hero-dots').childNodes;
  for (var i = 0; i < d.length; i++) cls(d[i], 'on', i === heroIdx);
}
function heroGo(i) {
  var track = $('hero-track');
  heroIdx = i;
  var x = i * track.clientWidth;
  if ('scrollBehavior' in document.documentElement.style && track.scrollTo) {
    try { track.scrollTo({ left: x, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { track.scrollLeft = x; }
  } else { track.scrollLeft = x; }
  heroDots();
}
function heroTick() {
  heroTimer = null;
  if (!heroHold && !document.hidden && view === 'home' && !searchEl.value && !reducedMotion() && heroCount > 1) {
    heroGo((heroIdx + 1) % heroCount);
  }
  heroSchedule();
}
function heroSchedule() {
  clearTimeout(heroTimer);
  heroTimer = null;
  if (heroCount > 1 && !document.hidden) heroTimer = setTimeout(heroTick, HERO_MS);
}
function heroHoldOn() { heroHold = true; clearTimeout(heroTimer); heroTimer = null; }
function heroHoldOff() { heroHold = false; heroSchedule(); }
function bindHero() {
  var track = $('hero-track');
  track.addEventListener('scroll', function () {
    if (heroRaf) return;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    heroRaf = raf(function () {
      heroRaf = 0;
      var w = track.clientWidth || 1;
      var i = Math.round(track.scrollLeft / w);
      if (i !== heroIdx && i >= 0 && i < heroCount) { heroIdx = i; heroDots(); }
    });
  }, false);
  var wrap = $('hero');
  wrap.addEventListener('touchstart', heroHoldOn, false);
  wrap.addEventListener('touchend', function () { setTimeout(heroHoldOff, 2500); }, false);
  wrap.addEventListener('touchcancel', function () { setTimeout(heroHoldOff, 2500); }, false);
  wrap.addEventListener('mouseenter', heroHoldOn, false);
  wrap.addEventListener('mouseleave', heroHoldOff, false);
  wrap.addEventListener('focusin', heroHoldOn, false);
  wrap.addEventListener('focusout', heroHoldOff, false);
  $('hero-dots').addEventListener('click', function (event) {
    var t = event.target, d = this.childNodes;
    for (var i = 0; i < d.length; i++) if (d[i] === t) { heroGo(i); heroSchedule(); return; }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(heroTimer); heroTimer = null; } else heroSchedule();
  });
}

/* ---------- Lối tắt ---------- */
function renderShortcuts() {
  var box = $('shortcuts');
  var nodes = [];
  for (var i = 0; i < SHORTCUTS.length; i++) {
    var d = SHORTCUTS[i], el, app = null;
    if (d.app) {
      app = appById(d.app);
      if (!app || !app.ready) d = { label: 'Tìm chức năng', icon: 'i-search', tone: d.tone, find: true };
    }
    if (d.go) {
      el = element('a', 'sc');
      el.href = d.go;
    } else if (d.find) {
      el = element('button', 'sc');
      el.type = 'button';
      el.addEventListener('click', function () { searchEl.focus(); });
    } else {
      el = element('a', 'sc');
      el.href = app.href + (d.hash || '');
      (function (a) { el.addEventListener('click', function () { recordUse(a); }); })(app);
    }
    var ico = element('span', 'sc-ico sol-' + d.tone);
    ico.appendChild(svgUse(d.icon, 'icon'));
    el.appendChild(ico);
    el.appendChild(element('span', 'sc-lbl', d.label));
    nodes.push(el);
  }
  fill(box, nodes);
}

/* ---------- Nổi bật cho bạn: theo hành vi ---------- */
function pickFeatured() {
  var pool = homeApps();
  var out = [], seen = {}, i, a;
  function add(app, why) { if (app && !seen[app.id]) { seen[app.id] = true; out.push({ app: app, why: why }); } }
  var pins = [];
  for (i = 0; i < prefs.fav.length; i++) { a = appById(prefs.fav[i]); if (a && a.ready && onHome(a)) pins.push(a); }
  var used = [];
  for (i = 0; i < pool.length; i++) if (isUsed(pool[i]) && !isFav(pool[i])) used.push(pool[i]);
  used.sort(function (x, y) { return (useCount(y) - useCount(x)) || (lastUsed(y) - lastUsed(x)); });
  var n = Math.max(3, Math.min(6, pins.length + used.length));
  for (i = 0; i < pins.length && out.length < n; i++) add(pins[i], 'Đã ghim');
  for (i = 0; i < used.length && out.length < n; i++) add(used[i], 'Hay dùng');
  for (i = 0; i < FEATURED_DEFAULT.length && out.length < n; i++) {
    a = appById(FEATURED_DEFAULT[i]);
    if (a && a.ready && onHome(a) && !isUsed(a)) add(a, 'Nên thử');
  }
  var rest = pool.slice();
  rest.sort(function (x, y) { return prioIndex(x) - prioIndex(y); });
  for (i = 0; i < rest.length && out.length < n; i++) if (!isUsed(rest[i])) add(rest[i], 'Nên thử');
  for (i = 0; i < rest.length && out.length < n; i++) add(rest[i], '');
  return out;
}
function prioIndex(app) {
  var p = SUGGEST_PRIORITY.indexOf(app.id);
  return p >= 0 ? p : 100 + order(app);
}
function renderFeatured(hide) {
  var wrap = $('featured-wrap');
  var f = hide ? [] : pickFeatured();
  wrap.hidden = f.length === 0;
  var nodes = [];
  for (var i = 0; i < f.length; i++) nodes.push(featCard(f[i].app, f[i].why));
  var sl = $('featured').scrollLeft;
  fill($('featured'), nodes);
  $('featured').scrollLeft = sl;
  setBusy($('featured'));
  var ids = {};
  for (i = 0; i < f.length; i++) ids[f[i].app.id] = true;
  return ids;
}

/* ---------- Nhóm ứng dụng: mỗi app đúng MỘT nhóm ---------- */
function groupedHome() {
  var by = {}, i, a, gid;
  var apps = homeApps();
  for (i = 0; i < apps.length; i++) {
    a = apps[i];
    gid = groupIdOf(a);
    (by[gid] = by[gid] || []).push(a);
  }
  var out = [];
  for (i = 0; i < GROUPS.length; i++) {
    var list = by[GROUPS[i].id];
    if (!list || !list.length) continue;
    list.sort(function (x, y) {
      return ((isFav(y) ? 1 : 0) - (isFav(x) ? 1 : 0)) || (useCount(y) - useCount(x)) || (order(x) - order(y));
    });
    out.push({ g: GROUPS[i], apps: list });
  }
  return out;
}
function groupCard(entry) {
  var g = entry.g, apps = entry.apps;
  var expandable = apps.length > COLLAPSED_N;
  var open = expandable && !!openGroups[g.id];
  var card = element('article', 'gcard tone-' + g.tone + (open ? ' open' : ''));
  card.setAttribute('data-g', g.id);
  var head = element(expandable ? 'button' : 'div', 'g-head');
  if (expandable) {
    head.type = 'button';
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    head.setAttribute('aria-label', g.label + ', ' + apps.length + ' ứng dụng, ' + (open ? 'thu gọn' : 'mở rộng'));
    head.setAttribute('data-gtoggle', g.id);
  }
  var ico = element('span', 'g-ico sol-' + g.tone);
  ico.appendChild(svgUse(g.icon, 'icon'));
  head.appendChild(ico);
  head.appendChild(element('span', 'g-title', g.label));
  if (expandable) {
    var ch = element('span', 'g-chev');
    ch.appendChild(svgUse('i-down', 'icon'));
    head.appendChild(ch);
  }
  card.appendChild(head);
  card.appendChild(element('p', 'g-blurb', g.blurb));
  var i;
  if (open) {
    var grid = element('div', 'g-all');
    for (i = 0; i < apps.length; i++) grid.appendChild(appTile(apps[i], { pin: isFav(apps[i]) }));
    card.appendChild(grid);
  } else {
    var row = element('div', 'g-apps');
    for (i = 0; i < apps.length && i < COLLAPSED_N; i++) row.appendChild(miniApp(apps[i]));
    card.appendChild(row);
  }
  return card;
}
function renderGroups(hide) {
  var wrap = $('groups-wrap');
  var list = hide ? [] : groupedHome();
  var nodes = [];
  for (var i = 0; i < list.length; i++) nodes.push(groupCard(list[i]));
  fill($('groups'), nodes);
  setBusy($('groups'));
  wrap.hidden = !!hide;
  $('empty').hidden = !!hide || list.length > 0;
  $('groups').hidden = list.length === 0;
  $('groups-all').hidden = list.length === 0;
}

/* ---------- Gợi ý cho bạn: app chưa dùng ---------- */
function renderSuggest(hide, featIds) {
  var cand = [];
  if (!hide && !ui.suggest) {
    for (var i = 0; i < APPS.length; i++) {
      var a = APPS[i];
      if (a.ready && !userHidden(a) && !isUsed(a) && !featIds[a.id]) cand.push(a);
    }
    cand.sort(function (x, y) { return prioIndex(x) - prioIndex(y); });
    cand = cand.slice(0, SUGGEST_MAX);
  }
  $('suggest-wrap').hidden = cand.length === 0;
  var nodes = [];
  for (var j = 0; j < cand.length; j++) nodes.push(sugCard(cand[j]));
  var sl = $('suggest').scrollLeft;
  fill($('suggest'), nodes);
  $('suggest').scrollLeft = sl;
}

/* ---------- Trang chủ + tìm kiếm ---------- */
function renderHome(words) {
  var searching = words.length > 0;
  $('hero').hidden = searching || heroCount === 0;
  $('shortcuts').hidden = searching;
  if (searching) {
    $('featured-wrap').hidden = true;
    $('groups-wrap').hidden = true;
    $('suggest-wrap').hidden = true;
    var hits = [], i;
    for (i = 0; i < APPS.length; i++) if (APPS[i].ready && matchesSearch(APPS[i], words)) hits.push(APPS[i]);
    hits.sort(byName);
    $('apps-hit').hidden = hits.length === 0;
    var nodes = [];
    for (i = 0; i < hits.length; i++) nodes.push(appTile(hits[i], { meta: onHome(hits[i]) ? '' : 'Đã ẩn' }));
    fill(listEl, nodes);
    setBusy(listEl);
    return;
  }
  $('apps-hit').hidden = true;
  fill(listEl, []);
  renderHero();
  $('hero').hidden = heroCount === 0;
  var ids = renderFeatured(false);
  renderGroups(false);
  renderSuggest(false, ids);
}

/* ---------- Tất cả (thư viện) ---------- */
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
    act.appendChild(svgUse('i-more', 'icon'));
    act.addEventListener('click', function () { openMenu(app, act); });
  }
  li.appendChild(act);
  return li;
}
function rowsOf(list) {
  var ul = element('ul', 'rows');
  for (var i = 0; i < list.length; i++) ul.appendChild(libRow(list[i]));
  return ul;
}
function groupHeading(g, n) {
  var h = element('h2', 'lib-h');
  var ico = element('span', 'g-ico sm sol-' + g.tone);
  ico.appendChild(svgUse(g.icon, 'icon'));
  h.appendChild(ico);
  h.appendChild(element('span', '', g.label));
  h.appendChild(element('span', 'lib-n', String(n)));
  return h;
}
function sortKey(app) { return fold(app.name).replace(/^9/, ''); }
function renderLibrary() {
  var words = fold(libText).trim();
  words = words ? words.split(/\s+/) : [];
  var counts = { all: 0, pin: 0, hid: 0 }, i, a, readyApps = [];
  for (i = 0; i < APPS.length; i++) {
    a = APPS[i];
    if (!a.ready) continue;
    readyApps.push(a);
    counts.all++;
    if (isFav(a) && onHome(a)) counts.pin++;
    if (!onHome(a)) counts.hid++;
  }
  var cn = [chipButton('all', 'Tất cả ' + counts.all, libFilter === 'all', 'data-f')];
  for (i = 0; i < GROUPS.length; i++) {
    var has = false;
    for (var k = 0; k < readyApps.length; k++) if (groupIdOf(readyApps[k]) === GROUPS[i].id) { has = true; break; }
    if (has) cn.push(chipButton(GROUPS[i].id, GROUPS[i].label, libFilter === GROUPS[i].id, 'data-f'));
  }
  cn.push(chipButton('pin', 'Đã ghim ' + counts.pin, libFilter === 'pin', 'data-f'));
  cn.push(chipButton('hid', 'Đã ẩn ' + counts.hid, libFilter === 'hid', 'data-f'));
  fill($('lib-chips'), cn);
  var seg = $('lib-mode').childNodes;
  for (i = 0; i < seg.length; i++) {
    if (!seg[i].getAttribute) continue;
    var on = seg[i].getAttribute('data-m') === libMode;
    cls(seg[i], 'on', on);
    seg[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  $('lib-sub').textContent = counts.all + ' ứng dụng. Chạm để mở, “⋯” để ghim hoặc ẩn.';
  var shown = [];
  for (i = 0; i < readyApps.length; i++) {
    a = readyApps[i];
    if (!matchesSearch(a, words)) continue;
    if (libFilter === 'pin' && !(isFav(a) && onHome(a))) continue;
    if (libFilter === 'hid' && onHome(a)) continue;
    if (groupById(libFilter) && groupIdOf(a) !== libFilter) continue;
    shown.push(a);
  }
  var nodes = [];
  if (libMode === 'az') {
    shown.sort(function (x, y) { var p = sortKey(x), q = sortKey(y); return p < q ? -1 : p > q ? 1 : 0; });
    var letter = '', sec = null;
    for (i = 0; i < shown.length; i++) {
      var L = sortKey(shown[i]).charAt(0).toUpperCase();
      if (L !== letter) {
        letter = L;
        sec = element('section', 'lib-group');
        sec.appendChild(element('h2', 'lib-h az-h', L));
        sec.appendChild(element('ul', 'rows'));
        nodes.push(sec);
      }
      sec.lastChild.appendChild(libRow(shown[i]));
    }
  } else {
    for (var g = 0; g < GROUPS.length; g++) {
      var grp = [];
      for (i = 0; i < shown.length; i++) if (groupIdOf(shown[i]) === GROUPS[g].id) grp.push(shown[i]);
      if (!grp.length) continue;
      grp.sort(byName);
      var s2 = element('section', 'lib-group');
      s2.appendChild(groupHeading(GROUPS[g], grp.length));
      s2.appendChild(rowsOf(grp));
      nodes.push(s2);
    }
  }
  fill($('lib-list'), nodes);
  $('unused-empty').hidden = shown.length > 0;
  // Sắp ra mắt: cuối danh sách (app chưa ready + mục SOON không trùng tên)
  var soon = [];
  if (libFilter === 'all') {
    var items = [];
    for (i = 0; i < APPS.length; i++) if (!APPS[i].ready) items.push({ name: APPS[i].name, icon: APPS[i].icon, note: APPS[i].blurb });
    for (i = 0; i < SOON.length; i++) items.push(SOON[i]);
    for (i = 0; i < items.length; i++) {
      var dup = false;
      for (var j = 0; j < APPS.length; j++) if (APPS[j].ready && fold(APPS[j].name) === fold(items[i].name)) dup = true;
      for (j = 0; j < soon.length; j++) if (fold(soon[j].name) === fold(items[i].name)) dup = true;
      var hay = fold(items[i].name + ' sap ra mat'), okw = true;
      for (var q = 0; q < words.length; q++) if (hay.indexOf(words[q]) < 0) okw = false;
      if (!dup && okw) soon.push(items[i]);
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
      bd.appendChild(element('span', 'row-blurb', soon[i].note || 'Đang xây dựng'));
      m.appendChild(bd);
      m.appendChild(element('span', 'badge b-soon', 'Sắp ra mắt'));
      li.appendChild(m);
      sl.appendChild(li);
    }
    s.appendChild(sl);
    fill(box, [s]);
  }
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

/* ---------- Khám phá ---------- */
function renderExplore() {
  var box = $('explore'), i, nodes = [];
  var head = element('div', 'page-head');
  head.appendChild(element('h1', '', 'Khám phá'));
  head.appendChild(element('p', '', 'Tìm đúng chức năng, thử ứng dụng mới.'));
  nodes.push(head);

  // 1) Tìm chức năng
  var c1 = element('div', 'card exp-card');
  c1.appendChild(element('h2', 'exp-h', 'Bạn muốn làm gì?'));
  c1.appendChild(element('p', 'exp-p', 'Gõ vào ô tìm ở đầu trang hoặc chạm một gợi ý. Tìm được cả chức năng bên trong từng ứng dụng.'));
  var qs = element('div', 'qchips');
  for (i = 0; i < EXPLORE_QUERIES.length; i++) {
    var qb = element('button', 'fn-chip', EXPLORE_QUERIES[i]);
    qb.type = 'button';
    qb.setAttribute('data-q', EXPLORE_QUERIES[i]);
    qs.appendChild(qb);
  }
  c1.appendChild(qs);
  var open = element('button', 'pill-btn', 'Mở ô tìm');
  open.type = 'button';
  open.id = 'exp-find';
  c1.appendChild(open);
  nodes.push(c1);

  // 2) Mới trên 9app
  var fresh = [];
  for (i = 0; i < NEW_IDS.length; i++) { var na = appById(NEW_IDS[i]); if (na && na.ready && !userHidden(na)) fresh.push(na); }
  if (fresh.length) {
    var s2 = element('section', 'exp-sec');
    s2.appendChild(element('h2', 'sec-h', 'Mới trên 9app'));
    var st = element('div', 'strip');
    for (i = 0; i < fresh.length; i++) st.appendChild(appTile(fresh[i], {}));
    s2.appendChild(st);
    nodes.push(s2);
  }

  // 3) Chưa thử, lọc theo nhóm
  var unused = [];
  for (i = 0; i < APPS.length; i++) if (APPS[i].ready && !isUsed(APPS[i]) && !userHidden(APPS[i])) unused.push(APPS[i]);
  var s3 = element('section', 'exp-sec');
  s3.appendChild(element('h2', 'sec-h', 'Chưa thử'));
  var present = {};
  for (i = 0; i < unused.length; i++) present[groupIdOf(unused[i])] = true;
  if (exploreGroup !== 'all' && !present[exploreGroup]) exploreGroup = 'all';
  if (unused.length) {
    var chips = element('div', 'chips');
    chips.id = 'exp-chips';
    chips.appendChild(chipButton('all', 'Tất cả ' + unused.length, exploreGroup === 'all', 'data-eg'));
    for (i = 0; i < GROUPS.length; i++) if (present[GROUPS[i].id]) chips.appendChild(chipButton(GROUPS[i].id, GROUPS[i].label, exploreGroup === GROUPS[i].id, 'data-eg'));
    s3.appendChild(chips);
    var list = [];
    for (i = 0; i < unused.length; i++) if (exploreGroup === 'all' || groupIdOf(unused[i]) === exploreGroup) list.push(unused[i]);
    list.sort(function (x, y) { return prioIndex(x) - prioIndex(y); });
    s3.appendChild(rowsOf(list));
  } else {
    var em = element('div', 'empty card');
    em.appendChild(element('h3', '', 'Bạn đã thử hết rồi'));
    em.appendChild(element('p', '', 'Mọi ứng dụng trên 9app đều đã được mở. Có app mới, chúng tôi sẽ báo ở đây.'));
    s3.appendChild(em);
  }
  nodes.push(s3);

  // 4) Osin (sắp ra mắt) — xem trước, không dẫn đi đâu
  var o = element('section', 'osin-card');
  var oh = element('div', 'osin-head');
  var oi = element('img'); oi.src = 'icons/soon-osin.svg?v=1'; oi.alt = ''; oi.width = 44; oi.height = 44;
  oh.appendChild(oi);
  var ot = element('div', 'osin-t');
  ot.appendChild(element('h2', '', 'Hỏi Osin'));
  ot.appendChild(element('span', 'badge b-soon', 'Sắp ra mắt'));
  oh.appendChild(ot);
  o.appendChild(oh);
  o.appendChild(element('p', 'exp-p', 'Trợ lý của 9app: hỏi bằng lời thường, Osin chỉ đúng chức năng cần dùng. Câu hỏi mẫu:'));
  var ol = element('ul', 'osin-q');
  for (i = 0; i < OSIN_SAMPLES.length; i++) ol.appendChild(element('li', '', OSIN_SAMPLES[i]));
  o.appendChild(ol);
  var fake = element('div', 'osin-input', 'Hỏi Osin… (chưa mở)');
  fake.setAttribute('aria-disabled', 'true');
  o.appendChild(fake);
  nodes.push(o);
  fill(box, nodes);
}

/* ---------- Yêu thích ---------- */
function emptyCard(title, text, btn, hash) {
  var e = element('div', 'empty card');
  var ic = element('span', 'empty-ico');
  ic.appendChild(svgUse('i-heart', 'icon'));
  e.appendChild(ic);
  e.appendChild(element('h3', '', title));
  e.appendChild(element('p', '', text));
  if (btn) {
    var a = element('a', 'pill-btn', btn);
    a.href = hash;
    e.appendChild(a);
  }
  return e;
}
function renderFav() {
  var i, a, pins = [];
  for (i = 0; i < prefs.fav.length; i++) { a = appById(prefs.fav[i]); if (a && a.ready && onHome(a)) pins.push(a); }
  var box = $('fav-pins');
  if (pins.length) {
    var grid = element('div', 'grid');
    for (i = 0; i < pins.length; i++) grid.appendChild(appTile(pins[i], { pin: true }));
    fill(box, [grid]);
  } else {
    fill(box, [emptyCard('Chưa ghim ứng dụng nào', 'Giữ lâu một ứng dụng ở trang chủ, hoặc chạm “⋯” trong Tất cả, rồi chọn “Ghim vào Yêu thích”.', 'Mở Tất cả', '#/tat-ca')]);
  }
  var rec = [];
  for (i = 0; i < APPS.length; i++) if (APPS[i].ready && isUsed(APPS[i]) && onHome(APPS[i])) rec.push(APPS[i]);
  rec.sort(function (x, y) { return lastUsed(y) - lastUsed(x); });
  rec = rec.slice(0, 10);
  var rbox = $('fav-recent');
  if (rec.length) {
    var ul = element('ul', 'rows');
    for (i = 0; i < rec.length; i++) {
      var app = rec[i];
      var li = element('li', 'row');
      var m = element('a', 'row-main');
      m.href = app.href;
      m.setAttribute('aria-label', 'Mở ' + app.name + ', ' + agoText(lastUsed(app)));
      var im = element('img'); im.src = app.icon; im.alt = ''; im.width = 44; im.height = 44;
      m.appendChild(im);
      var bd = element('span', 'row-body');
      bd.appendChild(element('span', 'row-title')).appendChild(element('span', 'row-name', app.name));
      bd.appendChild(element('span', 'row-blurb', agoText(lastUsed(app)) + ' • đã mở ' + useCount(app) + ' lần'));
      m.appendChild(bd);
      (function (ap) { m.addEventListener('click', function () { recordUse(ap); }); })(app);
      li.appendChild(m);
      ul.appendChild(li);
    }
    fill(rbox, [ul]);
  } else {
    fill(rbox, [emptyCard('Chưa có lịch sử', 'Những ứng dụng bạn vừa mở sẽ hiện ở đây để mở lại nhanh.', 'Xem tất cả ứng dụng', '#/tat-ca')]);
  }
}

/* ---------- Tổng hợp ---------- */
function render() {
  var raw = fold(searchEl.value).trim();
  var words = raw ? raw.split(/\s+/) : [];
  renderHome(words);
  renderLibrary();
  renderExplore();
  renderFav();
  renderFeatures(words);
  if ($('search-clear')) $('search-clear').hidden = !searchEl.value;
  var hid = 0;
  for (var i = 0; i < APPS.length; i++) if (APPS[i].ready && !onHome(APPS[i])) hid++;
  if ($('account-note')) $('account-note').textContent = APPS.length + ' ứng dụng trong hệ sinh thái 9app.';
  if ($('set-hidden-n')) $('set-hidden-n').textContent = hid ? String(hid) : 'Không có';
  $('bell-dot').hidden = !(NOTICES && NOTICES.length);
}

/* ---------- Điều hướng (hash) ---------- */
var VIEW_IDS = { home: 'view-home', explore: 'explore', library: 'allview', favorites: 'fav', notify: 'notify', account: 'account' };
var TAB_OF = { home: 'tab-home', explore: 'tab-explore', library: 'tab-lib', favorites: 'tab-fav', account: 'tab-user' };
function setTab(id) {
  var tabs = ['tab-home', 'tab-explore', 'tab-lib', 'tab-fav', 'tab-user'];
  for (var i = 0; i < tabs.length; i++) {
    var el = $(tabs[i]);
    if (!el) continue;
    var on = tabs[i] === id;
    cls(el, 'on', on);
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }
}
function showView(name) {
  var changed = view !== name;
  view = name;
  for (var k in VIEW_IDS) if (Object.prototype.hasOwnProperty.call(VIEW_IDS, k)) $(VIEW_IDS[k]).hidden = k !== name;
  setTab(TAB_OF[name] || '');
  if (changed) { try { window.scrollTo(0, 0); } catch (e) {} }
  renderFeatures(searchWords());
}
function route() {
  var h = String(location.hash || '').replace(/^#\/?/, '');
  var parts = h.split('/');
  var name = parts[0], arg = parts[1] || '';
  if (name === 'kham-pha') { showView('explore'); }
  else if (name === 'tat-ca') {
    libFilter = 'all';
    if (arg === 'az') libMode = 'az';
    else if (arg === 'pin' || arg === 'hid' || groupById(arg)) libFilter = arg;
    showView('library');
    renderLibrary();
  } else if (name === 'yeu-thich') {
    showView('favorites');
    if (arg === 'gan-day') { try { $('recent-h').scrollIntoView(); } catch (e) {} }
  } else if (name === 'tai-khoan') showView('account');
  else if (name === 'thong-bao') showView('notify');
  else showView('home');
}
function go(hash) {
  if (location.hash === hash || (hash === '#/' && !location.hash)) route();
  else location.hash = hash;
}

/* ---------- Sự kiện ---------- */
searchEl.addEventListener('input', function () {
  if (view !== 'home') {
    showView('home');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
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
function dataTarget(event, attr) {
  var b = event.target;
  while (b && !(b.getAttribute && b.getAttribute(attr) !== null && b.getAttribute(attr) !== undefined)) {
    if (b === event.currentTarget) return null;
    b = b.parentNode;
  }
  return b && b.getAttribute ? b.getAttribute(attr) : null;
}
$('groups').addEventListener('click', function (event) {
  var id = dataTarget(event, 'data-gtoggle');
  if (!id) return;
  openGroups[id] = !openGroups[id];
  renderGroups(false);
  refocus($('groups'), 'data-gtoggle', id);
});
$('lib-chips').addEventListener('click', function (event) {
  var k = dataTarget(event, 'data-f');
  if (!k) return;
  libFilter = k;
  renderLibrary();
  refocus($('lib-chips'), 'data-f', k);
});
$('lib-mode').addEventListener('click', function (event) {
  var m = dataTarget(event, 'data-m');
  if (!m) return;
  libMode = m;
  renderLibrary();
});
$('lib-q').addEventListener('input', function () { libText = this.value; renderLibrary(); });
$('explore').addEventListener('click', function (event) {
  var q = dataTarget(event, 'data-q');
  if (q) { setSearch(q); return; }
  var g = dataTarget(event, 'data-eg');
  if (g) { exploreGroup = g; renderExplore(); refocus($('explore'), 'data-eg', g); return; }
  var t = event.target;
  while (t && t !== this) { if (t.id === 'exp-find') { go('#/'); searchEl.focus(); return; } t = t.parentNode; }
});
$('tab-home').addEventListener('click', function () { if (searchEl.value) clearSearch(false); go('#/'); });
$('tab-explore').addEventListener('click', function () { go('#/kham-pha'); });
$('tab-lib').addEventListener('click', function () { go('#/tat-ca'); });
$('tab-fav').addEventListener('click', function () { go('#/yeu-thich'); });
$('tab-user').addEventListener('click', function () { go('#/tai-khoan'); });
$('btn-account').addEventListener('click', function () { go('#/tai-khoan'); });
$('btn-bell').addEventListener('click', function () { go('#/thong-bao'); });
$('featured-all').addEventListener('click', function () { go('#/tat-ca'); });
$('groups-all').addEventListener('click', function () { go('#/tat-ca'); });
$('suggest-all').addEventListener('click', function () { go('#/kham-pha'); });
$('empty-go').addEventListener('click', function () { go('#/tat-ca'); });
$('set-hidden').addEventListener('click', function () { go('#/tat-ca/hid'); });
$('suggest-x').addEventListener('click', function () { ui.suggest = true; saveUi(); render(); toast('Đã ẩn gợi ý. Hiện lại ở Tài khoản.'); });
$('reset-ui').addEventListener('click', function () { ui.welcome = false; ui.suggest = false; saveUi(); render(); toast('Đã hiện lại gợi ý trên trang chủ.'); });
$('clear-usage').addEventListener('click', function () {
  var ok = true;
  try { ok = window.confirm('Xóa lịch sử gần đây? Ứng dụng đã ghim và đã ẩn được giữ nguyên.'); } catch (e) {}
  if (!ok) return;
  prefs.usage = {};
  if (savePrefs()) toast('Đã xóa lịch sử gần đây.');
  render();
});
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
window.addEventListener('hashchange', route, false);
window.addEventListener('pageshow', function (e) { if (e.persisted) { prefs = loadPrefs(); render(); accountInit(); } }, false);

/* ---------- Tài khoản 9id (tùy chọn) ----------
   Chỉ hiện khối đăng nhập khi 9id trả lời được (Nine.me thành công). 9id chưa chạy, ngoại tuyến, thiếu nine.js: giữ nguyên
   giao diện cũ, không báo lỗi. Launcher luôn dùng được không cần tài khoản. */
var accState = 'off', accUser = null;
function firstChar(name) {
  var m = /^\s*([\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S])/.exec(String(name || ''));
  return m ? m[1].toUpperCase() : '';
}
function accountRender() {
  var out = $('acc-out'), inn = $('acc-in'), letter = $('av-letter'), btn = $('btn-account');
  if (!out || !inn || !letter) return;
  out.hidden = accState !== 'out';
  inn.hidden = accState !== 'in';
  var on = accState === 'in' && !!accUser;
  if (on) {
    var ch = firstChar(accUser.displayName) || '•';
    $('acc-name').textContent = accUser.displayName || '';
    $('acc-phone').textContent = 'Số điện thoại ••••' + String(accUser.phoneLast4 || '');
    $('acc-av').textContent = ch;
    letter.textContent = ch;
  }
  letter.hidden = !on;
  if (on) btn.classList.add('in'); else btn.classList.remove('in');
}
// nine.js nạp BẤT ĐỒNG BỘ sau khi launcher đã dựng xong (9id chậm/treo không được chặn trang chủ), và chỉ chèn script khi máy chủ
// trả đúng JavaScript (nginx có thể trả index.html cho đường dẫn không có: không chạy HTML như script).
function loadNine(done) {
  if (typeof Nine !== 'undefined' && Nine && typeof Nine.me === 'function') { done(true); return; }
  if (typeof fetch !== 'function') { done(false); return; }
  fetch('/id/nine.js', { credentials: 'omit' }).then(function (r) {
    var type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    var good = r.ok && type.indexOf('javascript') >= 0;
    // đọc hết thân phản hồi để nhả kết nối (nếu không, yêu cầu treo đến khi bị thu gom)
    return r.text().then(function () { return good; }, function () { return false; });
  }).then(function (good) {
    if (!good) { done(false); return; }
    var s = document.createElement('script');
    s.src = '/id/nine.js';
    s.async = true;
    s.onload = function () { done(typeof Nine !== 'undefined' && !!Nine && typeof Nine.me === 'function'); };
    s.onerror = function () { done(false); };
    document.head.appendChild(s);
  }, function () { done(false); });
}
function accountInit() {
  loadNine(function (okLoaded) { if (okLoaded) accountStart(); });
}
function accountStart() {
  Nine.me().then(function (u) { accUser = u; accState = u ? 'in' : 'out'; accountRender(); },
    function () { accState = 'off'; accUser = null; accountRender(); });
}
$('acc-login').addEventListener('click', function () { if (typeof Nine !== 'undefined') Nine.login('/#/tai-khoan'); });
$('acc-register').addEventListener('click', function () { if (typeof Nine !== 'undefined') Nine.register('/#/tai-khoan'); });
$('acc-logout').addEventListener('click', function () {
  if (typeof Nine === 'undefined') return;
  Nine.logout().then(function () { accUser = null; accState = 'out'; accountRender(); toast('Đã đăng xuất'); },
    function () { toast('Chưa đăng xuất được, hãy thử lại.'); });
});

try { bindHero(); renderShortcuts(); render(); route(); accountInit(); }
catch (e) { try { console.error(e); } catch (x) {} }
