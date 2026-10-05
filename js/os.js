var $ = function (id) { return document.getElementById(id); };
var KEY = '9app.prefs';
var prefs = loadPrefs();
var toastTimer;
var resizeTimer;
var openGroup = {};
var route = { name: 'home', id: '' };
var returnFocus = null;

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
        if (Catalog.byId(id)) out.push(id);
      }
      return out;
    };
    return { fav: valid(raw.fav), hide: valid(raw.hide), show: valid(raw.show) };
  } catch (e) {
    return { fav: [], hide: [], show: [] };
  }
}
function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); return true; }
  catch (e) { toast('Thay đổi được giữ trong phiên này.'); return false; }
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
function onHome(app) {
  if (prefs.show.indexOf(app.id) >= 0) return true;
  if (prefs.hide.indexOf(app.id) >= 0) return false;
  return Catalog.homeDefault(app);
}
function cols() {
  var w = 390;
  if ($('phone') && $('phone').clientWidth) w = $('phone').clientWidth - 28;
  var n = Math.floor(w / 72);
  if (n < 4) n = 4;
  if (n > 6) n = 6;
  return n;
}
function applyCols(n) {
  var root = $('phone');
  if (!root) return;
  root.className = 'workspace cols-' + n;
}
function fmtDate(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var dd = d.getDate();
  var mm = d.getMonth() + 1;
  var yyyy = d.getFullYear();
  return (dd < 10 ? '0' : '') + dd + '/' + (mm < 10 ? '0' : '') + mm + '/' + yyyy;
}
function parseDate(value) {
  if (!value) return 0;
  var p = String(value).split('-');
  if (p.length !== 3) return 0;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
}
function dateInput(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var mm = d.getMonth() + 1;
  var dd = d.getDate();
  return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
}
function money(n) {
  if (!n) return '';
  return Number(n).toLocaleString('vi-VN') + 'đ';
}

function parseHash() {
  var h = (location.hash || '#/').replace(/^#/, '');
  if (h.charAt(0) !== '/') h = '/' + h;
  var parts = h.split('/');
  var name = parts[1] || '';
  var id = parts[2] || '';
  if (!name || name === 'today') name = 'home';
  return { name: name, id: id };
}
function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = path;
}

function recordOpen(app) {
  Graph.recordUse(app.id);
  if (typeof Graph.event === 'function') Graph.event('app-open', { appId: app.id });
}

function appTile(app, opts) {
  opts = opts || {};
  var tile = element('article', 'tile');
  var link = element(opts.add ? 'button' : (app.ready ? 'a' : 'div'), 'tile-link');
  var img = element('img');
  img.src = app.icon;
  img.alt = '';
  img.width = 56;
  img.height = 56;
  link.appendChild(img);
  link.appendChild(element('span', 'tile-name', app.name));
  if (opts.meta) link.appendChild(element('span', 'tile-meta', opts.meta));
  tile.appendChild(link);
  if (opts.add) {
    link.type = 'button';
    link.addEventListener('click', function () {
      if (prefs.show.indexOf(app.id) < 0) prefs.show.push(app.id);
      prefs.hide = prefs.hide.filter(function (id) { return id !== app.id; });
      savePrefs();
      toast('Đã thêm ' + app.name);
      go('/');
    });
  } else if (app.ready) {
    link.href = app.href;
    link.setAttribute('aria-label', 'Mở ' + app.name);
    link.addEventListener('click', function (event) {
      recordOpen(app);
      if (app.module) {
        event.preventDefault();
        go(app.href.replace(/^#/, ''));
      }
    });
  }
  return tile;
}

function moreTile(cat, label) {
  var wrap = element('div', 'tile-add-card more-tile');
  var btn = element('button', '', '…');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Xem thêm ' + label);
  btn.addEventListener('click', function () { openGroup[cat] = true; render(); });
  wrap.appendChild(btn);
  wrap.appendChild(element('span', '', 'Xem thêm'));
  return wrap;
}

function addTile() {
  var wrap = element('div', 'tile-add-card');
  var btn = element('button', '', '+');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Thêm ứng dụng');
  btn.addEventListener('click', function () { go('/library'); });
  wrap.appendChild(btn);
  wrap.appendChild(element('span', '', 'Thêm ứng dụng'));
  return wrap;
}

function groupUse(catId) {
  var n = 0;
  for (var i = 0; i < APPS.length; i++) {
    if (APPS[i].category !== catId) continue;
    n += Graph.usageOf(APPS[i].id).count || 0;
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
function matchesSearch(app, words) {
  if (!words.length) return true;
  var hay = fold(app.name + ' ' + app.blurb + ' ' + Catalog.categoryLabel(app.category));
  for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) return false;
  return true;
}
function homeApps() {
  var out = [];
  for (var i = 0; i < APPS.length; i++) if (onHome(APPS[i])) out.push(APPS[i]);
  return out;
}

function field(form, name, label, type, value) {
  var lab = element('label', '', label);
  lab.setAttribute('for', name);
  var input = element(type === 'textarea' ? 'textarea' : 'input');
  input.id = name;
  input.name = name;
  if (type !== 'textarea') input.type = type || 'text';
  if (value) input.value = value;
  form.appendChild(lab);
  form.appendChild(input);
  return input;
}
function selectField(form, name, label, options, value) {
  var lab = element('label', '', label);
  lab.setAttribute('for', name);
  var sel = element('select');
  sel.id = name;
  sel.name = name;
  for (var i = 0; i < options.length; i++) {
    var opt = element('option', '', options[i]);
    opt.value = options[i];
    if (options[i] === value) opt.selected = true;
    sel.appendChild(opt);
  }
  form.appendChild(lab);
  form.appendChild(sel);
  return sel;
}
function putOwned(store, rec) {
  var s = Id.session();
  if (s) rec.userId = 'u-' + s.sdt;
  return Graph.put(store, rec);
}
function withLogin(fn) {
  if (Id.require(fn)) return;
  showLoginSheet();
}
function showLoginSheet() {
  $('act-name').textContent = Id.hasUser() ? 'Đăng nhập để lưu' : 'Tạo tài khoản để lưu lần sau';
  fill($('act-body'), []);
  var form = element('form', 'form');
  field(form, 'id-sdt', 'Số điện thoại', 'tel');
  field(form, 'id-mk', 'Mật khẩu', 'password');
  if (!Id.hasUser()) field(form, 'id-mk2', 'Nhập lại mật khẩu', 'password');
  var btn = element('button', 'btn', Id.hasUser() ? 'Đăng nhập' : 'Tạo tài khoản');
  btn.type = 'submit';
  form.appendChild(btn);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var r;
    if (Id.hasUser()) r = Id.dangNhap($('id-sdt').value, $('id-mk').value);
    else {
      if ($('id-mk').value !== $('id-mk2').value) r = { loi: 'Hai mật khẩu không khớp.' };
      else r = Id.dangKy($('id-sdt').value, $('id-mk').value);
    }
    if (r.loi) { toast(r.loi); return; }
    closeSheet();
    toast('Đã đăng nhập. Lần sau các app ghi dữ liệu dùng chung tài khoản này.');
    Id.runPending();
    render();
  });
  $('act-body').appendChild(form);
  var note = element('p', 'muted', '9speed, Vạn Niên không cần. 9log, Gia phả, 9Sport giữ login riêng.');
  $('act-body').appendChild(note);
  setDialog(true);
}

function moduleHead(title, back, href) {
  var head = element('div', 'module-head');
  if (back) {
    var a = element('a', 'back-link', href === '#/home' ? '← Nhà' : '← 9app');
    a.href = href || '#/';
    head.appendChild(a);
  }
  head.appendChild(element('h1', '', title));
  return head;
}

function emptyBox(title, text) {
  var box = element('div', 'empty ok');
  box.appendChild(element('h3', '', title));
  box.appendChild(element('p', '', text));
  return box;
}

function renderSearchHits(into, words) {
  var stores = ['documents', 'vehicles', 'assets', 'appointments', 'people', 'obligations', 'providers', 'requests'];
  var hits = [];
  for (var s = 0; s < stores.length; s++) {
    var rows = Graph.query(stores[s]);
    for (var i = 0; i < rows.length; i++) {
      var rec = rows[i];
      var hay = fold((rec.title || '') + ' ' + (rec.name || '') + ' ' + (rec.plate || '') + ' ' + (rec.note || '') + ' ' + (rec.job || ''));
      var ok = true;
      for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) ok = false;
      if (ok) hits.push({ store: stores[s], rec: rec });
    }
  }
  if (!hits.length) return;
  var block = element('section', 'block');
  block.appendChild(element('h2', '', 'Việc và giấy tờ'));
  for (var h = 0; h < hits.length && h < 8; h++) {
    var a = element('a', 'search-hit');
    var rec2 = hits[h].rec;
    var st = hits[h].store;
    a.href = st === 'documents' ? '#/vault' : st === 'vehicles' ? '#/move' : (st === 'appointments' || st === 'people') ? '#/care' : st === 'obligations' ? '#/fin' : (st === 'providers' || st === 'requests') ? '#/local' : '#/home';
    a.appendChild(element('strong', '', rec2.title || rec2.name || rec2.plate || 'Mục'));
    a.appendChild(element('span', '', st));
    block.appendChild(a);
  }
  into.appendChild(block);
}

function renderToday(into) {
  var cards = Engine.today();
  var block = element('section', 'block');
  var head = element('div', 'block-head');
  var title = element('div', 'block-title');
  title.appendChild(element('h2', '', 'Hôm nay'));
  head.appendChild(title);
  block.appendChild(head);
  if (!cards.length) {
    block.appendChild(emptyBox('Hôm nay chưa có việc gấp', 'Thêm giấy tờ, xe, lịch khám — 9app sẽ nhắc trước hạn.'));
    into.appendChild(block);
    return;
  }
  var list = element('div', 'today-list');
  for (var i = 0; i < cards.length; i++) {
    (function (item) {
      var card = element('article', 'today-card ' + (item.level || ''));
      card.appendChild(element('div', 'kicker', item.source === 'vault' ? 'Giấy tờ' : item.source === 'move' ? 'Xe' : item.source === 'care' ? 'Chăm sóc' : 'Chi tiêu'));
      card.appendChild(element('h3', '', item.title));
      card.appendChild(element('p', '', item.body));
      var row = element('div', 'row');
      var open = element('a', '', item.action);
      open.href = item.href;
      row.appendChild(open);
      var skip = element('button', '', 'Bỏ qua');
      skip.type = 'button';
      skip.addEventListener('click', function () {
        Graph.dismiss(item.id);
        toast('Đã bỏ qua');
        render();
      });
      row.appendChild(skip);
      card.appendChild(row);
      list.appendChild(card);
    })(cards[i]);
  }
  block.appendChild(list);
  into.appendChild(block);
}

function renderMine(into, words) {
  var n = cols();
  applyCols(n);
  var block = element('section', 'block');
  var head = element('div', 'block-head');
  var title = element('div', 'block-title');
  title.appendChild(element('h2', '', 'Ứng dụng của tôi'));
  head.appendChild(title);
  var all = element('button', 'text-link', 'Xem tất cả →');
  all.type = 'button';
  all.addEventListener('click', function () { go('/library'); });
  head.appendChild(all);
  block.appendChild(head);
  var apps = homeApps();
  var cats = orderedCategories();
  var shown = 0;
  for (var c = 0; c < cats.length; c++) {
    var cat = cats[c];
    var group = [];
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].category !== cat.id) continue;
      if (!matchesSearch(apps[i], words)) continue;
      group.push(apps[i]);
    }
    if (!group.length) continue;
    var gwrap = element('div', 'group');
    var ghead = element('div', 'group-head');
    ghead.appendChild(element('h3', '', cat.label));
    gwrap.appendChild(ghead);
    var grid = element('div', 'my-grid');
    var expanded = words.length > 0 || openGroup[cat.id];
    var full = Math.floor(group.length / n) * n;
    var visible = group.length;
    if (!expanded && full > 0) visible = full;
    for (var g = 0; g < visible; g++) grid.appendChild(appTile(group[g]));
    if (!expanded && group.length > visible) grid.appendChild(moreTile(cat.id, cat.label));
    gwrap.appendChild(grid);
    block.appendChild(gwrap);
    shown += group.length;
  }
  if (!words.length) {
    var extra = element('div', 'my-grid');
    extra.appendChild(addTile());
    block.appendChild(extra);
  }
  if (!shown && words.length) block.appendChild(emptyBox('Không thấy ứng dụng', 'Thử từ khác, hoặc mở Thư viện.'));
  into.appendChild(block);
}

function renderSuggest(into, words) {
  if (words.length) return;
  var recs = Engine.recommend();
  if (!recs.length) return;
  var n = cols();
  recs = recs.slice(0, n);
  var block = element('section', 'block');
  var head = element('div', 'block-head');
  var title = element('div', 'block-title');
  title.appendChild(element('h2', '', 'Có thể bạn cần'));
  head.appendChild(title);
  block.appendChild(head);
  var row = element('div', 'h-row');
  for (var i = 0; i < recs.length; i++) row.appendChild(appTile(recs[i].app, { meta: recs[i].reason }));
  block.appendChild(row);
  into.appendChild(block);
}

function renderDiscover(into, words) {
  if (words.length) return;
  var unused = [];
  for (var i = 0; i < APPS.length; i++) if (!onHome(APPS[i]) && APPS[i].ready) unused.push(APPS[i]);
  if (!unused.length) return;
  var block = element('section', 'block');
  var head = element('div', 'block-head');
  var title = element('div', 'block-title');
  title.appendChild(element('h2', '', 'Khám phá'));
  head.appendChild(title);
  block.appendChild(head);
  var row = element('div', 'h-row');
  var n = cols();
  for (var u = 0; u < unused.length && u < n; u++) row.appendChild(appTile(unused[u]));
  block.appendChild(row);
  into.appendChild(block);
}

function renderHome() {
  var words = fold($('search').value).trim();
  words = words ? words.split(/\s+/) : [];
  var main = $('stage');
  var nodes = [];
  var wrap = element('div');
  if (!words.length) {
    var banner = $('banner-tpl').content.cloneNode(true);
    wrap.appendChild(banner);
  }
  if (words.length) renderSearchHits(wrap, words);
  else renderToday(wrap);
  renderMine(wrap, words);
  renderSuggest(wrap, words);
  renderDiscover(wrap, words);
  nodes.push(wrap);
  fill(main, nodes);
  setTab('tab-home');
}

function renderLibrary() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Thư viện', true));
  page.appendChild(element('p', 'muted', 'Bấm để thêm vào trang chủ. 9log mặc định ở Công việc.'));
  var grid = element('div', 'my-grid');
  var hidden = [];
  for (var i = 0; i < APPS.length; i++) if (!onHome(APPS[i])) hidden.push(APPS[i]);
  for (var h = 0; h < hidden.length; h++) grid.appendChild(appTile(hidden[h], { add: true }));
  page.appendChild(grid);
  if (!hidden.length) page.appendChild(emptyBox('Không còn ứng dụng nào', 'Mọi ứng dụng đều đang hiện trên trang chủ.'));
  fill(main, [page]);
  setTab('tab-lib');
}

function renderNotify() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Thông báo', true));
  var list = Graph.query('notifications').sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  if (!list.length) page.appendChild(emptyBox('Chưa có thông báo', 'Hạn giấy tờ, đăng kiểm, lịch khám sẽ hiện ở đây.'));
  for (var i = 0; i < list.length; i++) {
    (function (n) {
      var card = element('article', 'item-card');
      card.appendChild(element('h3', '', n.title));
      card.appendChild(element('p', '', n.body || ''));
      var a = element('a', '', 'Mở');
      a.href = n.href || '#/';
      card.appendChild(a);
      page.appendChild(card);
    })(list[i]);
  }
  fill(main, [page]);
  setTab('tab-bell');
}

function renderAccount() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Tài khoản', true));
  var note = element('div', 'card-note');
  var sess = Id.session();
  if (sess) {
    note.appendChild(element('p', '', 'Đã đăng nhập: ' + sess.sdt));
    note.appendChild(element('p', 'muted', 'Cùng tài khoản cho 9Vault, 9Home, 9Move, 9Care, 9Local, 9Fin, 9quy.'));
    var out = element('button', 'btn btn-ghost', 'Đăng xuất');
    out.type = 'button';
    out.addEventListener('click', function () { Id.logout(); toast('Đã đăng xuất'); render(); });
    note.appendChild(out);
  } else {
    note.appendChild(element('p', '', 'Chưa cần đăng nhập để tra cứu. App ghi dữ liệu sẽ hỏi khi bạn bấm Lưu.'));
    var inn = element('button', 'btn', Id.hasUser() ? 'Đăng nhập' : 'Tạo tài khoản');
    inn.type = 'button';
    inn.addEventListener('click', function () { withLogin(function () { render(); }); });
    note.appendChild(inn);
  }
  note.appendChild(element('p', 'muted', APPS.length + ' ứng dụng trong hệ sinh thái 9app. 9log, Gia phả, 9Sport login riêng.'));
  page.appendChild(note);
  fill(main, [page]);
  setTab('tab-user');
}

function renderVault() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('9Vault', true));
  var form = element('form', 'form');
  field(form, 'v-title', 'Tên giấy tờ', 'text');
  field(form, 'v-file', 'Tên tệp / ghi chú để nhận loại', 'text');
  field(form, 'v-amount', 'Số tiền (nếu có)', 'number');
  field(form, 'v-exp', 'Hết hạn', 'date');
  field(form, 'v-plate', 'Biển số (nếu là xe)', 'text');
  var guess = element('p', 'muted', 'Gợi ý loại sẽ hiện khi bạn gõ.');
  form.appendChild(guess);
  var btn = element('button', 'btn', 'Lưu giấy tờ');
  btn.type = 'submit';
  form.appendChild(btn);
  form.addEventListener('input', function () {
    var extracted = Engine.extractDocument($('v-title').value + ' ' + ($('v-file').value || ''), $('v-file').value || '');
    guess.textContent = 'Loại gợi ý: ' + extracted.title + ' (' + Math.round(extracted.confidence * 100) + '%)';
    form.setAttribute('data-type', extracted.type);
    if (!$('v-title').value) $('v-title').placeholder = extracted.title;
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      var extracted = Engine.extractDocument($('v-title').value + ' ' + ($('v-file').value || ''), $('v-file').value || '');
      var doc = putOwned('documents', {
        title: $('v-title').value || extracted.title,
        type: extracted.type,
        note: $('v-file').value || '',
        amount: Number($('v-amount').value) || 0,
        expiresAt: parseDate($('v-exp').value),
        plate: $('v-plate').value || '',
        confirmed: false
      });
      Engine.confirmDocument(doc);
      toast('Đã lưu và gắn sang nhà / xe / chi tiêu nếu khớp');
      go('/vault');
    });
  });
  page.appendChild(form);

  var docs = Graph.query('documents').sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  if (!docs.length) page.appendChild(emptyBox('Chưa có giấy tờ', 'Thêm đăng kiểm, bảo hành, căn cước — 9app nhắc trước hạn.'));
  for (var i = 0; i < docs.length; i++) {
    (function (d) {
      var card = element('article', 'item-card');
      card.appendChild(element('h3', '', d.title));
      var line = (d.type || '') + (d.expiresAt ? ' · hết hạn ' + fmtDate(d.expiresAt) : '');
      card.appendChild(element('p', '', line));
      var del = element('button', '', 'Xoá');
      del.type = 'button';
      del.addEventListener('click', function () { Graph.remove('documents', d.id); render(); });
      card.appendChild(del);
      page.appendChild(card);
    })(docs[i]);
  }
  fill(main, [page]);
  setTab('tab-home');
}

function houseSubmit(form, fn) {
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(fn);
  });
}
function renderHouseNewProp() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Thêm nhà', true, '#/home'));
  var form = element('form', 'form');
  field(form, 'h-name', 'Tên nhà', 'text', 'Nhà mình');
  selectField(form, 'h-type', 'Loại', ['Nhà', 'Căn hộ', 'Phòng trọ', 'Khác'], 'Căn hộ');
  field(form, 'h-addr', 'Địa chỉ', 'text');
  selectField(form, 'h-own', 'Sở hữu', ['Ở thuê', 'Nhà mình', 'Khác'], 'Ở thuê');
  field(form, 'h-move', 'Ngày vào ở', 'date');
  var btn = element('button', 'btn', 'Lưu nhà');
  btn.type = 'submit';
  form.appendChild(btn);
  houseSubmit(form, function () {
    putOwned('properties', {
      name: $('h-name').value || 'Nhà mình',
      type: $('h-type').value,
      address: $('h-addr').value || '',
      ownership: $('h-own').value,
      moveInDate: parseDate($('h-move').value)
    });
    toast('Đã thêm nhà');
    go('/home');
  });
  page.appendChild(form);
  fill(main, [page]);
  setTab('tab-home');
}
function renderHouseNewRoom() {
  var props = Graph.query('properties');
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Thêm phòng', true, '#/home'));
  if (!props.length) {
    page.appendChild(emptyBox('Chưa có nhà', 'Thêm nhà trước, rồi mới chia phòng khách, bếp, ngủ.'));
    fill(main, [page]);
    setTab('tab-home');
    return;
  }
  var names = [];
  for (var i = 0; i < props.length; i++) names.push(props[i].name);
  var form = element('form', 'form');
  selectField(form, 'r-prop', 'Thuộc nhà', names, names[0]);
  field(form, 'r-name', 'Tên phòng', 'text', 'Phòng khách');
  var btn = element('button', 'btn', 'Lưu phòng');
  btn.type = 'submit';
  form.appendChild(btn);
  houseSubmit(form, function () {
    var prop = null;
    for (var p = 0; p < props.length; p++) if (props[p].name === $('r-prop').value) prop = props[p];
    putOwned('rooms', { name: $('r-name').value || 'Phòng', propertyId: prop ? prop.id : '' });
    toast('Đã thêm phòng');
    go('/home');
  });
  page.appendChild(form);
  fill(main, [page]);
  setTab('tab-home');
}
function renderHouseNewAsset() {
  var rooms = Graph.query('rooms');
  var props = Graph.query('properties');
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Thêm đồ', true, '#/home'));
  var form = element('form', 'form');
  field(form, 'a-name', 'Tên đồ', 'text', 'Điều hòa');
  selectField(form, 'a-cat', 'Nhóm', ['Điện tử', 'Điện lạnh', 'Gia dụng', 'Nội thất', 'Thiết bị', 'Khác'], 'Điện lạnh');
  field(form, 'a-brand', 'Hãng / model', 'text');
  var loc = ['Chưa xếp phòng'];
  for (var r = 0; r < rooms.length; r++) loc.push(rooms[r].name);
  selectField(form, 'a-room', 'Phòng', loc, loc[0]);
  field(form, 'a-price', 'Giá mua', 'number');
  field(form, 'a-warr', 'Hết bảo hành', 'date');
  selectField(form, 'a-status', 'Tình trạng', ['đang dùng', 'hỏng', 'đã bán'], 'đang dùng');
  var btn = element('button', 'btn', 'Lưu đồ');
  btn.type = 'submit';
  form.appendChild(btn);
  houseSubmit(form, function () {
    var room = null;
    for (var i = 0; i < rooms.length; i++) if (rooms[i].name === $('a-room').value) room = rooms[i];
    var asset = putOwned('assets', {
      name: $('a-name').value || 'Đồ',
      category: $('a-cat').value,
      brand: $('a-brand').value || '',
      roomId: room ? room.id : '',
      propertyId: room ? room.propertyId : (props[0] ? props[0].id : ''),
      purchasePrice: Number($('a-price').value) || 0,
      warrantyUntil: parseDate($('a-warr').value),
      status: $('a-status').value
    });
    var maint = Engine.attachMaint(asset);
    toast(maint ? ('Đã thêm đồ và lịch ' + maint.title.toLowerCase()) : 'Đã thêm đồ');
    go('/home');
  });
  page.appendChild(form);
  fill(main, [page]);
  setTab('tab-home');
}
function renderHouseNewBill() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Hoá đơn nhà', true, '#/home'));
  var form = element('form', 'form');
  selectField(form, 'b-type', 'Loại', ['Điện', 'Nước', 'Internet', 'Chung cư', 'Dịch vụ định kỳ'], 'Điện');
  field(form, 'b-period', 'Kỳ (tháng)', 'text', '09/2026');
  field(form, 'b-amount', 'Số tiền', 'number');
  field(form, 'b-due', 'Hạn trả', 'date');
  var btn = element('button', 'btn', 'Lưu hoá đơn');
  btn.type = 'submit';
  form.appendChild(btn);
  houseSubmit(form, function () {
    var title = $('b-type').value + ' · ' + ($('b-period').value || '');
    putOwned('obligations', {
      title: title,
      kind: 'utility',
      utilityType: $('b-type').value,
      billingPeriod: $('b-period').value || '',
      amount: Number($('b-amount').value) || 0,
      dueAt: parseDate($('b-due').value) || Date.now(),
      status: 'open'
    });
    toast('Đã lưu hoá đơn. Hôm nay sẽ nhắc hạn.');
    go('/home');
  });
  page.appendChild(form);
  fill(main, [page]);
  setTab('tab-home');
}
function renderHouseNewMaint() {
  var assets = Graph.query('assets');
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Lịch bảo trì', true, '#/home'));
  if (!assets.length) {
    page.appendChild(emptyBox('Chưa có đồ', 'Thêm điều hòa, máy lọc nước… rồi đặt lịch vệ sinh / thay lõi.'));
    fill(main, [page]);
    setTab('tab-home');
    return;
  }
  var names = [];
  for (var i = 0; i < assets.length; i++) names.push(assets[i].name);
  var form = element('form', 'form');
  selectField(form, 'mn-asset', 'Đồ', names, names[0]);
  field(form, 'mn-title', 'Việc', 'text', 'Vệ sinh');
  field(form, 'mn-months', 'Lặp lại (tháng)', 'number', '6');
  field(form, 'mn-next', 'Lần tới', 'date');
  var btn = element('button', 'btn', 'Lưu lịch');
  btn.type = 'submit';
  form.appendChild(btn);
  houseSubmit(form, function () {
    var asset = null;
    for (var a = 0; a < assets.length; a++) if (assets[a].name === $('mn-asset').value) asset = assets[a];
    var months = Number($('mn-months').value) || 6;
    putOwned('maintenance', {
      assetId: asset ? asset.id : '',
      title: $('mn-title').value || 'Bảo trì',
      everyMonths: months,
      nextAt: parseDate($('mn-next').value) || Engine.addMonths(Date.now(), months),
      status: 'open'
    });
    toast('Đã đặt lịch bảo trì');
    go('/home');
  });
  page.appendChild(form);
  fill(main, [page]);
  setTab('tab-home');
}
function renderHouse() {
  var sub = route.id;
  if (sub === 'them-nha') return renderHouseNewProp();
  if (sub === 'them-phong') return renderHouseNewRoom();
  if (sub === 'them-do') return renderHouseNewAsset();
  if (sub === 'hoa-don') return renderHouseNewBill();
  if (sub === 'bao-tri') return renderHouseNewMaint();

  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('9Home', true));
  page.appendChild(element('p', 'muted', 'Nhà → phòng → đồ. Hoá đơn. Bảo trì sắp tới.'));

  var props = Graph.query('properties');
  var rooms = Graph.query('rooms');
  var assets = Graph.query('assets');
  var bills = Graph.query('obligations', function (row) { return row.kind === 'utility'; });
  var mains = Graph.query('maintenance', function (row) { return row.status !== 'done'; });

  var chips = element('div', 'chip-row');
  var adds = [['Thêm nhà', '/home/them-nha'], ['Thêm phòng', '/home/them-phong'], ['Thêm đồ', '/home/them-do'], ['Hoá đơn', '/home/hoa-don'], ['Bảo trì', '/home/bao-tri']];
  for (var c = 0; c < adds.length; c++) {
    var chip = element('a', 'chip', adds[c][0]);
    chip.href = '#' + adds[c][1];
    chips.appendChild(chip);
  }
  page.appendChild(chips);

  if (!props.length) {
    page.appendChild(emptyBox('Chưa có nhà', 'Thêm căn hộ hoặc nhà. Rồi chia phòng khách, bếp, đồ đang dùng. Hoá đơn bảo hành ở 9Vault cũng tạo đồ giúp bạn.'));
    fill(main, [page]);
    setTab('tab-home');
    return;
  }

  var jobs = Engine.homeJobs();
  var jobBlock = element('section', 'block');
  jobBlock.appendChild(element('h2', '', 'Việc cần làm'));
  if (!jobs.length) jobBlock.appendChild(element('p', 'muted', 'Chưa có hạn bảo trì hay hoá đơn gấp.'));
  for (var j = 0; j < jobs.length; j++) {
    var jc = element('article', 'today-card ' + (jobs[j].level || ''));
    jc.appendChild(element('h3', '', jobs[j].title));
    jc.appendChild(element('p', '', jobs[j].body));
    jobBlock.appendChild(jc);
  }
  page.appendChild(jobBlock);

  for (var p = 0; p < props.length; p++) {
    (function (prop) {
      var block = element('section', 'block house-prop');
      block.appendChild(element('h2', '', prop.name));
      var meta = [prop.type, prop.ownership, prop.address].filter(function (x) { return x; }).join(' · ');
      if (meta) block.appendChild(element('p', 'muted', meta));
      var roomList = [];
      for (var r = 0; r < rooms.length; r++) if (rooms[r].propertyId === prop.id) roomList.push(rooms[r]);
      if (!roomList.length) {
        block.appendChild(element('p', 'muted', 'Chưa chia phòng. Thêm phòng khách, bếp, ngủ.'));
      }
      for (var ri = 0; ri < roomList.length; ri++) {
        (function (room) {
          var rb = element('div', 'room-block');
          rb.appendChild(element('h3', '', room.name));
          var inRoom = [];
          for (var a = 0; a < assets.length; a++) if (assets[a].roomId === room.id) inRoom.push(assets[a]);
          if (!inRoom.length) rb.appendChild(element('p', 'muted', 'Chưa có đồ trong phòng này.'));
          for (var ai = 0; ai < inRoom.length; ai++) {
            var as = inRoom[ai];
            var ac = element('article', 'item-card');
            ac.appendChild(element('h3', '', as.name));
            var line = [as.category, as.brand, as.status];
            if (as.warrantyUntil) line.push('BH ' + fmtDate(as.warrantyUntil));
            if (as.purchasePrice) line.push(money(as.purchasePrice));
            ac.appendChild(element('p', '', line.filter(function (x) { return x; }).join(' · ')));
            rb.appendChild(ac);
          }
          block.appendChild(rb);
        })(roomList[ri]);
      }
      var loose = [];
      for (var la = 0; la < assets.length; la++) {
        if (assets[la].propertyId === prop.id && !assets[la].roomId) loose.push(assets[la]);
      }
      if (loose.length) {
        var lb = element('div', 'room-block');
        lb.appendChild(element('h3', '', 'Chưa xếp phòng'));
        for (var li = 0; li < loose.length; li++) {
          var lc = element('article', 'item-card');
          lc.appendChild(element('h3', '', loose[li].name));
          lc.appendChild(element('p', '', loose[li].category || 'Đồ'));
          lb.appendChild(lc);
        }
        block.appendChild(lb);
      }
      page.appendChild(block);
    })(props[p]);
  }

  var billBlock = element('section', 'block');
  billBlock.appendChild(element('h2', '', 'Hoá đơn'));
  if (!bills.length) billBlock.appendChild(element('p', 'muted', 'Điện, nước, internet, phí chung cư — nhập tay, nhắc hạn, không cần kết nối nhà cung cấp.'));
  for (var b = 0; b < bills.length; b++) {
    (function (bill) {
      var bc = element('article', 'item-card');
      bc.appendChild(element('h3', '', bill.title));
      bc.appendChild(element('p', '', (bill.amount ? money(bill.amount) + ' · ' : '') + (bill.status === 'paid' ? 'Đã trả' : ('Hạn ' + fmtDate(bill.dueAt)))));
      if (bill.status !== 'paid') {
        var pay = element('button', '', 'Đã trả');
        pay.type = 'button';
        pay.addEventListener('click', function () { withLogin(function () { Engine.markPaid(bill.id); render(); }); });
        bc.appendChild(pay);
      }
      billBlock.appendChild(bc);
    })(bills[b]);
  }
  page.appendChild(billBlock);

  var mBlock = element('section', 'block');
  mBlock.appendChild(element('h2', '', 'Bảo trì sắp tới'));
  if (!mains.length) mBlock.appendChild(element('p', 'muted', 'Điều hòa 6 tháng vệ sinh, máy lọc nước thay lõi — tự đặt, không cứng theo hãng.'));
  for (var m = 0; m < mains.length; m++) {
    (function (mn) {
      var asset = mn.assetId ? Graph.get('assets', mn.assetId) : null;
      var mc = element('article', 'item-card');
      mc.appendChild(element('h3', '', mn.title));
      mc.appendChild(element('p', '', (asset ? asset.name + ' · ' : '') + 'Lần tới ' + fmtDate(mn.nextAt) + (mn.everyMonths ? (' · mỗi ' + mn.everyMonths + ' tháng') : '')));
      var done = element('button', '', 'Xong, hẹn lần sau');
      done.type = 'button';
      done.addEventListener('click', function () {
        withLogin(function () {
          mn.nextAt = Engine.addMonths(Date.now(), mn.everyMonths || 6);
          putOwned('maintenance', mn);
          toast('Đã hẹn lần sau ' + fmtDate(mn.nextAt));
          render();
        });
      });
      mc.appendChild(done);
      mBlock.appendChild(mc);
    })(mains[m]);
  }
  page.appendChild(mBlock);

  fill(main, [page]);
  setTab('tab-home');
}

function renderMove() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('9Move', true));
  var form = element('form', 'form');
  field(form, 'm-name', 'Tên xe', 'text');
  field(form, 'm-plate', 'Biển số', 'text');
  field(form, 'm-insp', 'Hạn đăng kiểm', 'date');
  field(form, 'm-ins', 'Hạn bảo hiểm', 'date');
  var btn = element('button', 'btn', 'Lưu xe');
  btn.type = 'submit';
  form.appendChild(btn);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      putOwned('vehicles', {
        name: $('m-name').value || 'Xe',
        plate: $('m-plate').value || '',
        inspectAt: parseDate($('m-insp').value),
        insuranceAt: parseDate($('m-ins').value)
      });
      toast('Đã lưu xe');
      render();
    });
  });
  page.appendChild(form);
  var list = Graph.query('vehicles');
  if (!list.length) page.appendChild(emptyBox('Chưa có xe', 'Thêm xe để nhắc đăng kiểm. Giấy đăng kiểm ở 9Vault cũng gắn vào đây.'));
  for (var i = 0; i < list.length; i++) {
    var v = list[i];
    var card = element('article', 'item-card');
    card.appendChild(element('h3', '', (v.plate || v.name || 'Xe')));
    card.appendChild(element('p', '', (v.inspectAt ? 'Đăng kiểm ' + fmtDate(v.inspectAt) : 'Chưa có hạn đăng kiểm')));
    page.appendChild(card);
  }
  fill(main, [page]);
  setTab('tab-home');
}

function renderCare() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('9Care', true));
  var pf = element('form', 'form');
  field(pf, 'p-name', 'Người thân', 'text');
  field(pf, 'p-rel', 'Quan hệ', 'text');
  var pb = element('button', 'btn', 'Thêm người');
  pb.type = 'submit';
  pf.appendChild(pb);
  pf.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      putOwned('people', { name: $('p-name').value || 'Người thân', relation: $('p-rel').value || '' });
      toast('Đã thêm người');
      render();
    });
  });
  page.appendChild(pf);

  var af = element('form', 'form');
  field(af, 'c-title', 'Lịch khám / hẹn', 'text');
  field(af, 'c-at', 'Ngày', 'date');
  var ab = element('button', 'btn', 'Thêm lịch');
  ab.type = 'submit';
  af.appendChild(ab);
  af.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      putOwned('appointments', { title: $('c-title').value || 'Lịch hẹn', at: parseDate($('c-at').value), status: 'open' });
      toast('Đã thêm lịch');
      render();
    });
  });
  page.appendChild(af);

  var mf = element('form', 'form');
  field(mf, 'med-name', 'Thuốc', 'text');
  field(mf, 'med-dose', 'Liều', 'text');
  var mb = element('button', 'btn', 'Thêm thuốc');
  mb.type = 'submit';
  mf.appendChild(mb);
  mf.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      putOwned('medications', { name: $('med-name').value || 'Thuốc', dose: $('med-dose').value || '', active: true });
      toast('Đã thêm thuốc');
      render();
    });
  });
  page.appendChild(mf);

  var people = Graph.query('people');
  var appts = Graph.query('appointments');
  var meds = Graph.query('medications');
  if (!people.length && !appts.length && !meds.length) page.appendChild(emptyBox('Chưa có lịch chăm sóc', 'Thêm người thân, lịch khám, thuốc để Hôm nay nhắc.'));
  for (var i = 0; i < people.length; i++) {
    var pc = element('article', 'item-card');
    pc.appendChild(element('h3', '', people[i].name));
    pc.appendChild(element('p', '', people[i].relation || 'Gia đình'));
    page.appendChild(pc);
  }
  for (var a = 0; a < appts.length; a++) {
    var ac = element('article', 'item-card');
    ac.appendChild(element('h3', '', appts[a].title));
    ac.appendChild(element('p', '', appts[a].at ? fmtDate(appts[a].at) : ''));
    page.appendChild(ac);
  }
  for (var m = 0; m < meds.length; m++) {
    var mc = element('article', 'item-card');
    mc.appendChild(element('h3', '', meds[m].name));
    mc.appendChild(element('p', '', meds[m].dose || 'Thuốc'));
    page.appendChild(mc);
  }
  fill(main, [page]);
  setTab('tab-home');
}

function renderLocal() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('9Local', true));
  var pf = element('form', 'form');
  field(pf, 'pr-name', 'Thợ / cửa hàng', 'text');
  field(pf, 'pr-job', 'Việc (điện, nước, điều hoà…)', 'text');
  var pb = element('button', 'btn', 'Lưu thợ');
  pb.type = 'submit';
  pf.appendChild(pb);
  pf.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      putOwned('providers', { name: $('pr-name').value || 'Thợ', job: $('pr-job').value || '' });
      toast('Đã lưu thợ');
      render();
    });
  });
  page.appendChild(pf);

  var rf = element('form', 'form');
  field(rf, 'rq-title', 'Việc cần làm', 'text');
  var rb = element('button', 'btn', 'Tạo việc');
  rb.type = 'submit';
  rf.appendChild(rb);
  rf.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      putOwned('requests', { title: $('rq-title').value || 'Việc nhà', status: 'open' });
      toast('Đã tạo việc');
      render();
    });
  });
  page.appendChild(rf);

  var providers = Graph.query('providers');
  var reqs = Graph.query('requests');
  if (!providers.length && !reqs.length) page.appendChild(emptyBox('Chưa có thợ hay việc nhà', 'Ghi số thợ điện/nước và việc cần làm quanh nhà.'));
  for (var i = 0; i < providers.length; i++) {
    var c = element('article', 'item-card');
    c.appendChild(element('h3', '', providers[i].name));
    c.appendChild(element('p', '', providers[i].job || 'Thợ'));
    page.appendChild(c);
  }
  for (var r = 0; r < reqs.length; r++) {
    var rc = element('article', 'item-card');
    rc.appendChild(element('h3', '', reqs[r].title));
    rc.appendChild(element('p', '', reqs[r].status === 'open' ? 'Đang mở' : 'Xong'));
    page.appendChild(rc);
  }
  fill(main, [page]);
  setTab('tab-home');
}

function renderFin() {
  var main = $('stage');
  var page = element('div', 'page');
  page.appendChild(moduleHead('Chi tiêu tại máy', true));
  var link = element('a', 'fin-link', 'Mở sổ 9Fin đầy đủ →');
  link.href = '9fin/';
  link.addEventListener('click', function () { recordOpen(Catalog.byId('fin')); });
  page.appendChild(link);
  var form = element('form', 'form');
  field(form, 'f-title', 'Khoản / hoá đơn', 'text');
  field(form, 'f-amount', 'Số tiền', 'number');
  field(form, 'f-due', 'Hạn trả', 'date');
  var rec = element('label', '', '');
  var chk = element('input');
  chk.type = 'checkbox';
  chk.id = 'f-rec';
  rec.appendChild(chk);
  rec.appendChild(document.createTextNode(' Định kỳ'));
  form.appendChild(rec);
  var btn = element('button', 'btn', 'Lưu khoản');
  btn.type = 'submit';
  form.appendChild(btn);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    withLogin(function () {
      putOwned('obligations', {
        title: $('f-title').value || 'Khoản',
        amount: Number($('f-amount').value) || 0,
        dueAt: parseDate($('f-due').value) || Date.now(),
        status: 'open'
      });
      if (chk.checked) {
        putOwned('transactions', {
          title: $('f-title').value || 'Định kỳ',
          amount: Number($('f-amount').value) || 0,
          dueAt: parseDate($('f-due').value) || Date.now(),
          recurring: true,
          status: 'open'
        });
      }
      toast('Đã lưu khoản. Sổ 9Fin gốc không bị ghi đè.');
      render();
    });
  });
  page.appendChild(form);
  var obs = Graph.query('obligations');
  if (!obs.length) page.appendChild(emptyBox('Chưa có khoản trên máy này', 'Thêm hạn trả để Hôm nay nhắc. Sổ chính vẫn ở 9Fin.'));
  for (var i = 0; i < obs.length; i++) {
    (function (o) {
      var card = element('article', 'item-card');
      card.appendChild(element('h3', '', o.title));
      card.appendChild(element('p', '', (o.amount ? money(o.amount) + ' · ' : '') + (o.status === 'paid' ? 'Đã trả' : ('Hạn ' + fmtDate(o.dueAt)))));
      if (o.status !== 'paid') {
        var pay = element('button', '', 'Đánh dấu đã trả');
        pay.type = 'button';
        pay.addEventListener('click', function () { Engine.markPaid(o.id); render(); });
        card.appendChild(pay);
      }
      page.appendChild(card);
    })(obs[i]);
  }
  fill(main, [page]);
  setTab('tab-home');
}

function renderQuick() {
  $('act-name').textContent = 'Thêm nhanh';
  fill($('act-body'), []);
  var grid = element('div', 'quick-grid');
  var items = [
    ['Giấy tờ', '/vault'],
    ['Nhà / đồ', '/home'],
    ['Xe', '/move'],
    ['Lịch khám', '/care'],
    ['Việc nhà', '/local'],
    ['Khoản phải trả', '/fin']
  ];
  for (var i = 0; i < items.length; i++) {
    (function (it) {
      var b = element('button', '', it[0]);
      b.type = 'button';
      b.addEventListener('click', function () { closeSheet(); go(it[1]); });
      grid.appendChild(b);
    })(items[i]);
  }
  $('act-body').appendChild(grid);
  setDialog(true);
}

function setDialog(open) {
  $('act').hidden = !open;
  $('act-backdrop').hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
}
function closeSheet() { setDialog(false); }

function setTab(id) {
  var tabs = ['tab-home', 'tab-lib', 'tab-bell', 'tab-user'];
  for (var i = 0; i < tabs.length; i++) {
    var el = $(tabs[i]);
    if (el) el.className = tabs[i] === id ? 'tab on' : 'tab';
  }
}

function bellDot() {
  var n = Engine.unreadCount();
  var dot = $('bell-dot');
  if (dot) dot.hidden = n === 0;
}

function render() {
  route = parseHash();
  var name = route.name;
  if (name === 'library') renderLibrary();
  else if (name === 'notify') renderNotify();
  else if (name === 'account') renderAccount();
  else if (name === 'vault') renderVault();
  else if (name === 'home' && location.hash.indexOf('#/home') === 0) renderHouse();
  else if (name === 'move') renderMove();
  else if (name === 'care') renderCare();
  else if (name === 'local') renderLocal();
  else if (name === 'fin') renderFin();
  else renderHome();
  bellDot();
}

function bind() {
  $('search').addEventListener('input', function () {
    if (parseHash().name !== 'home' || location.hash.indexOf('#/home') === 0) go('/');
    else render();
  });
  $('tab-home').addEventListener('click', function () { go('/'); });
  $('tab-lib').addEventListener('click', function () { go('/library'); });
  $('tab-bell').addEventListener('click', function () { go('/notify'); });
  $('tab-user').addEventListener('click', function () { go('/account'); });
  $('btn-bell').addEventListener('click', function () { go('/notify'); });
  $('btn-account').addEventListener('click', function () { go('/account'); });
  $('btn-add').addEventListener('click', renderQuick);
  $('act-cancel').addEventListener('click', closeSheet);
  $('act-backdrop').addEventListener('click', closeSheet);
  window.addEventListener('hashchange', render);
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });
  document.addEventListener('click', function (event) {
    var t = event.target;
    if (t && t.id === 'btn-discover') {
      go('/library');
    }
  });
}

Graph.open(function () {
  bind();
  try { render(); } catch (e) { toast('Không mở được trang. Tải lại thử.'); }
});
