/* 9family: Đi chợ nâng cao. Gõ hoặc nói để thêm (tách tên, số lượng, đơn vị), soát lại trước khi thêm, tích đã mua cập nhật gần thời gian thực,
   nhóm theo khu quầy, "Nhà đã có", chế độ đi chợ toàn màn hình, chia sẻ qua Zalo/Web Share. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var UNITS = [['', 'đơn vị'], ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'lít'], ['qua', 'quả'], ['bo', 'bó'], ['cu', 'củ'], ['mieng', 'miếng'], ['hop', 'hộp'], ['goi', 'gói'], ['tui', 'túi'], ['chai', 'chai'], ['lon', 'lon'], ['thung', 'thùng'], ['con', 'con'], ['cay', 'cây'], ['cai', 'cái'], ['vien', 'viên'], ['cuon', 'cuộn'], ['lo', 'lọ'], ['tuyp', 'tuýp'], ['nai', 'nải'], ['o', 'ổ']];
  var GROUPS = [['rau_cu', 'Rau củ'], ['thit_ca', 'Thịt, cá'], ['hai_san', 'Hải sản'], ['trung_dau_phu', 'Trứng, đậu phụ'], ['trai_cay', 'Trái cây'], ['do_kho_gao_bun', 'Gạo, bún, đồ khô'], ['gia_vi', 'Gia vị'], ['sua_banh', 'Sữa, bánh'], ['do_uong', 'Đồ uống'], ['gia_dung', 'Đồ dùng'], ['khac', 'Khác']];
  var OLD2KEY = { 'Rau củ quả': 'rau_cu', 'Thịt cá': 'thit_ca', 'Sữa, trứng': 'sua_banh', 'Bánh, đồ khô': 'do_kho_gao_bun', 'Gia dụng': 'gia_dung', 'Khác': 'khac' };
  var draft = '';
  var open = { have: false, bought: false };

  function aisleKey(it) { if (it.aisle) return it.aisle; return OLD2KEY[F9.aisleOf ? F9.aisleOf(it.text) : 'Khác'] || 'khac'; }
  function titleOf(it) { return it.tidy ? it.tidy.text : it.text; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function api(fid, p) { return F9.fam(fid, '/shopping' + (p || '')); }
  function group(items) {
    var g = {};
    items.forEach(function (it) { var k = aisleKey(it); (g[k] = g[k] || []).push(it); });
    return GROUPS.filter(function (x) { return g[x[0]]; }).map(function (x) { return { key: x[0], label: x[1], items: g[x[0]] }; });
  }
  function split(items) {
    return {
      need: items.filter(function (i) { return !i.bought && !i.have; }),
      have: items.filter(function (i) { return !i.bought && i.have; }),
      bought: items.filter(function (i) { return i.bought; }),
    };
  }

  // ---------- chuẩn hóa dự phòng khi không gọi được máy chủ (thư viện chạy ngay trong trình duyệt) ----------
  var clientNorm = null;
  function loadClientNorm() {
    if (clientNorm) return clientNorm;
    clientNorm = Promise.all([import('./menu/normalize.js'), import('./menu/common.js'), fetch(new URL('menu/ingredients.json', document.baseURI).href).then(function (r) { return r.json(); })]).then(function (a) {
      a[1].setData({ dishes: { items: [] }, ingredients: a[2], seasonal: {} });
      return a[0];
    }).catch(function () { clientNorm = null; return null; });
    return clientNorm;
  }
  function localParse(text) {
    return loadClientNorm().then(function (n) {
      if (!n) return [{ text: text, name: cap(text), qty: null, unit: null, review: true }];
      return n.normalizeList(text).map(function (x) {
        var nm = x.confidence === 'exact' && x.canonicalName ? x.canonicalName : cap(x.name);
        return { text: nm, name: nm, qty: x.qty, unit: x.unit, review: x.confidence !== 'exact' };
      });
    });
  }
  F9.shopLocalParse = localParse;
  F9.shopParse = function (fid, text) {
    return F9.post(api(fid, '/parse'), { text: text }).then(function (r) { return r.items.map(function (i) { return { text: i.text, name: i.name, qty: i.qty, unit: i.unit, review: i.confidence !== 'exact' }; }); }, function () { return localParse(text); });
  };

  // ---------- thanh thêm món: gõ + micro ----------
  function addBar(fid) {
    var input = F9.text({ maxlength: 300, placeholder: 'Ví dụ: 2 bó rau', 'data-k': 'add-shop', 'aria-label': 'Món cần mua', enterkeyhint: 'done' });
    input.value = draft;
    input.addEventListener('input', function () { draft = input.value; });
    var btn = F9.btn('Thêm', 'primary', function () { return go(); });
    function go() {
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      return F9.busy(btn, function () {
        return F9.post(api(fid), { text: v, source: 'tay' }, { idem: 'mkshop' + F9.rid().slice(0, 4) }).then(function (r) {
          draft = ''; input.value = ''; F9.dropGate();
          var added = r.items.filter(function (i) { return i.id; });
          F9.toast(r.merged && r.merged === r.items.length ? 'Món này đã có trong danh sách' : 'Đã thêm ' + added.length + ' món', '', { undo: function () { return Promise.all(added.map(function (i) { return F9.del(api(fid, '/' + i.id)); })).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
          return F9.refresh(true);
        });
      });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    var v = F9.voiceButton({
      lang: 'vi-VN', label: 'Nói để thêm món', hint: 'Ví dụ: hai bó rau muống và nửa ký thịt ba chỉ',
      parse: function (text) { return F9.shopParse(fid, text); },
      onResult: function (text, items) { reviewSheet(fid, text, items); },
    });
    return h('div', { class: 'card' }, [
      h('div', { class: 'addbar' }, [h('div', { class: 'col' }, [input]), v.button, btn]),
      v.panel,
      h('div', { class: 'hint', text: 'Gõ hoặc nói nhiều món một lần. Tên, số lượng và khu quầy được tự tách.' }),
    ]);
  }

  // ---------- màn soát lại (sau khi nói) ----------
  function reviewSheet(fid, heard, items) {
    items = (items && items.length ? items : [{ text: heard, name: cap(heard), qty: null, unit: null, review: true }]).map(function (i) { return { name: i.name || i.text, qty: i.qty, unit: i.unit || '', review: !!i.review }; });
    F9.sheet('Soát lại trước khi thêm', function (body, close) {
      body.appendChild(h('div', { class: 'heard' }, [h('span', { class: 'muted small', text: 'Nghe được' }), h('div', { class: 'b', text: '“' + heard + '”' })]));
      body.appendChild(h('p', { class: 'muted small', text: 'Sửa tên, số lượng hoặc xóa dòng sai. Chưa có gì được thêm cho tới khi bạn bấm nút bên dưới.' }));
      var listEl = h('div', { class: 'rev-list' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      var addBtn = F9.btn('', 'primary block', function () { return submit(); });
      function paint() {
        F9.clear(listEl);
        items.forEach(function (it, idx) {
          var name = F9.text({ value: it.name, maxlength: 60, 'aria-label': 'Tên món ' + (idx + 1) });
          name.addEventListener('input', function () { it.name = name.value; });
          var qty = h('input', { type: 'text', inputmode: 'decimal', class: 'qty-in', value: it.qty == null ? '' : String(it.qty).replace('.', ','), placeholder: 'SL', 'aria-label': 'Số lượng món ' + (idx + 1) });
          qty.addEventListener('input', function () { var n = parseFloat(qty.value.replace(',', '.')); it.qty = isFinite(n) && n > 0 ? n : null; });
          var unit = F9.select(UNITS, it.unit, { 'aria-label': 'Đơn vị món ' + (idx + 1) });
          unit.addEventListener('change', function () { it.unit = unit.value; });
          var del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bỏ dòng ' + (idx + 1), onclick: function () { items.splice(idx, 1); paint(); } }, [F9.ico('trash', 20)]);
          listEl.appendChild(h('div', { class: 'rev-row' + (it.review ? ' chk' : '') }, [
            h('div', { class: 'rev-top' }, [name, del]),
            h('div', { class: 'rev-bot' }, [qty, unit, it.review ? h('span', { class: 'small warn-t', text: 'Kiểm tra lại tên nhé' }) : h('span', { class: 'small ok-t', text: 'Đã nhận ra' })]),
          ]));
        });
        addBtn.textContent = items.length ? 'Thêm ' + items.length + ' món vào danh sách' : 'Không có món nào';
        addBtn.disabled = !items.length;
      }
      function submit() {
        var send = items.filter(function (i) { return i.name.trim(); }).map(function (i) { return { text: i.name.trim(), qty: i.qty, unit: i.unit || null }; });
        if (!send.length) { err.textContent = 'Hãy nhập tên món'; err.className = 'hint err'; return; }
        return F9.busy(addBtn, function () {
          return F9.post(api(fid, '/batch'), { items: send, source: 'giong_noi' }, { idem: 'voice' + F9.rid().slice(0, 4) }).then(function (r) {
            close(); F9.dropGate(); draft = '';
            var made = r.items.filter(function (i) { return !i.merged; });
            F9.toast('Đã thêm ' + r.items.length + ' món', '', { undo: function () { return Promise.all(made.map(function (i) { return F9.del(api(fid, '/' + i.id)); })).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
            return F9.refresh(true);
          }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
        });
      }
      body.appendChild(listEl);
      body.appendChild(F9.btn('+ Thêm một dòng', 'ghost sm', function () { items.push({ name: '', qty: null, unit: '', review: false }); paint(); }));
      body.appendChild(err); body.appendChild(addBtn);
      paint();
    });
  }
  F9.shopReview = reviewSheet;

  // ---------- màn Đi chợ ----------
  F9.shopMain = function (fid) {
    F9.frame({ title: 'Đi chợ', back: '#/f/' + fid + '/more', tabs: { fid: fid, tab: 'more' } });
    F9.skeleton('list');
    F9.live({
      fetch: function () { return F9.loadView(fid, 'shop', function () { return F9.get(api(fid)); }); },
      render: function (x) { renderShop(fid, x); },
      retick: false, every: 4000,
    }).catch(function (e) { F9.loadError(e, function () { F9.shopMain(fid); }); });
  };

  function renderShop(fid, x) {
    var core = x.core; var d = x.d;
    F9.setFam(core.family.name); F9.setFab(null); F9.setCta(null);
    var ctx = { fid: fid, core: core, d: d };
    var sp = split(d.items);
    var nodes = [F9.seg([['tasks', 'Việc cần làm'], ['shop', 'Mua sắm']], 'shop', function (m) { F9.go('#/f/' + fid + '/' + (m === 'shop' ? 'shop' : 'tasks')); }, 'Danh sách')];
    nodes.push(addBar(fid));
    var stale = d.plans.filter(function (p) { return p.stale; })[0];
    if (stale) nodes.push(F9.notice('warn', 'Thực đơn tuần ' + F9.dm(stale.weekStart) + ' đã đổi', 'Danh sách đi chợ tạo từ thực đơn chưa cập nhật theo.', h('div', { class: 'btn-row' }, [F9.link('#/f/' + fid + '/menu/' + stale.weekStart, { class: 'btn ghost sm' }, ['Mở thực đơn để cập nhật'])])));
    if (sp.need.length || sp.bought.length || sp.have.length) {
      nodes.push(h('div', { class: 'btn-row shop-tools' }, [
        F9.link('#/f/' + fid + '/shop/go', { class: 'btn primary sm' }, [F9.ico('cart', 20), ' Chế độ đi chợ']),
        F9.btn('Chia sẻ', 'ghost sm', function () { shareList(core, d.items); }),
        F9.link('#/f/' + fid + '/menu', { class: 'btn ghost sm' }, ['Từ thực đơn']),
      ]));
    }
    if (!d.items.length) {
      nodes.push(F9.empty('Danh sách mua sắm trống', 'Gõ hoặc nói món cần mua ở trên, hoặc tạo danh sách từ thực đơn tuần.', h('div', { class: 'btn-row center' }, [F9.link('#/f/' + fid + '/menu', { class: 'btn ghost sm' }, ['Mở thực đơn tuần'])]), 'cart'));
    }
    if (sp.need.length) {
      nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Cần mua (' + sp.need.length + ')' })]));
      group(sp.need).forEach(function (g) {
        nodes.push(h('div', { class: 'shopgroup' }, [h('h3', { text: g.label + ' (' + g.items.length + ')' }), h('div', { class: 'list' }, g.items.map(function (it) { return shopRow(ctx, it); }))]));
      });
    } else if (d.items.length && !sp.need.length) {
      nodes.push(F9.notice('info', 'Đã mua đủ', 'Không còn món nào cần mua.'));
    }
    if (sp.have.length) {
      nodes.push(foldSection('have', 'Nhà đã có (' + sp.have.length + ')', h('div', { class: 'list' }, sp.have.map(function (it) { return shopRow(ctx, it); }))));
    }
    if (sp.bought.length) {
      nodes.push(foldSection('bought', 'Đã mua (' + sp.bought.length + ')', h('div', {}, [
        h('div', { class: 'list' }, sp.bought.map(function (it) { return shopRow(ctx, it); })),
        d.canEdit ? h('div', { class: 'btn-row' }, [F9.btn('Dọn các món đã mua', 'ghost sm', function () {
          F9.post(api(fid, '/clear-bought'), {}).then(function (r) { F9.toast('Đã dọn ' + r.removed + ' món'); F9.dropGate(); F9.refresh(true); }, F9.fail);
        })]) : null,
      ])));
    }
    F9.mount(nodes);
  }
  function foldSection(key, title, content) {
    var on = open[key];
    return h('div', {}, [h('button', { type: 'button', class: 'togl', 'aria-expanded': on ? 'true' : 'false', onclick: function () { open[key] = !open[key]; F9.rerender(); } }, [F9.ico(on ? 'chevu' : 'chevd', 20), title]), on ? content : null]);
  }

  function sub(it) {
    var p = [];
    if (it.fromDishes && it.fromDishes.length) p.push('Cho: ' + it.fromDishes.slice(0, 2).map(function (f) { return f.name; }).join(', ') + (it.fromDishes.length > 2 ? ' +' + (it.fromDishes.length - 2) : ''));
    if (it.note) p.push(it.note);
    if (it.bought && it.boughtBy) p.push(it.boughtBy + ' đã mua');
    else if (it.addedBy) p.push(it.addedBy + (it.source === 'thuc_don' ? ' tạo từ thực đơn' : it.source === 'giong_noi' ? ' nói thêm' : it.source === 'osin' ? ' nhờ Osin thêm' : ' thêm'));
    if (it.tidy) p.push('Câu gốc: “' + it.text + '”');
    return p.join(' · ');
  }

  function toggleBought(fid, it) {
    return F9.post(api(fid, '/' + it.id + '/bought'), { bought: !it.bought }).then(function () {
      F9.dropGate();
      F9.toast(it.bought ? 'Đã bỏ dấu mua' : 'Đã mua: ' + titleOf(it), '', { undo: function () { return F9.post(api(fid, '/' + it.id + '/bought'), { bought: it.bought }).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
      return F9.refresh(true);
    });
  }

  function shopRow(ctx, it) {
    var fid = ctx.fid;
    return h('div', { class: 'ev split task-row shop-row' + (it.have ? ' have' : '') }, [
      h('div', { class: 'ev-open task-open' }, [
        h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': it.bought ? 'true' : 'false', 'aria-label': (it.bought ? 'Chưa mua: ' : 'Đã mua: ') + titleOf(it), onclick: function (e) { F9.busy(e.currentTarget, function () { return toggleBought(fid, it); }); } }, [h('span', { class: 'step-no' }, [it.bought ? F9.ico('check', 16, 3) : null])]),
        h('button', { class: 'ev-main task-edit', type: 'button', 'aria-label': 'Sửa: ' + titleOf(it), onclick: function () { editSheet(ctx, it); } }, [
          h('div', { class: 'ev-t' + (it.bought ? ' done-s' : ''), text: titleOf(it) }), sub(it) ? h('div', { class: 'ev-sub', text: sub(it) }) : null,
        ]),
      ]),
      h('div', { class: 'ev-x' }, [it.have && !it.bought ? F9.chip('Nhà có', 'ok') : null]),
    ]);
  }

  function editSheet(ctx, it) {
    var fid = ctx.fid; var core = ctx.core;
    var canDel = F9.isMgr(core) || it.addedById === core.me.id;
    F9.sheet('Sửa món', function (body, close) {
      var base = it.tidy || it;
      var name = F9.text({ value: base.name || base.text, maxlength: 60 });
      var qty = h('input', { type: 'text', inputmode: 'decimal', class: 'qty-in', value: base.qty == null ? '' : String(base.qty).replace('.', ','), 'aria-label': 'Số lượng' });
      var unit = F9.select(UNITS, base.unit || '', { 'aria-label': 'Đơn vị' });
      var err = h('div', { class: 'hint err hidden', role: 'alert' });
      body.appendChild(F9.field('Tên món', name));
      body.appendChild(h('div', { class: 'field' }, [h('label', { text: 'Số lượng' }), h('div', { class: 'rev-bot' }, [qty, unit])]));
      if (it.tidy) body.appendChild(F9.notice('info', 'Đang hiện bản đã làm gọn', 'Câu đã lưu trước đây: “' + it.text + '”. Bấm Lưu để lưu tên gọn.'));
      if (canDel) {
        var save = F9.btn('Lưu', 'primary block', function () {
          return F9.busy(save, function () {
            var n = parseFloat(qty.value.replace(',', '.'));
            var body2 = { name: name.value.trim() || undefined, qty: isFinite(n) && n > 0 ? n : null, unit: unit.value || undefined };
            if (!isFinite(n) || n <= 0) { body2.qty = null; delete body2.unit; }
            if (it.tidy && body2.qty === (it.tidy.qty == null ? null : it.tidy.qty) && name.value.trim() === it.tidy.name) { body2 = { tidy: true }; }
            return F9.post(api(fid, '/' + it.id), body2).then(function () { close(); F9.dropGate(); return F9.refresh(true); }, function (e) { err.textContent = e.message; err.className = 'hint err'; throw e; });
          });
        });
        body.appendChild(err); body.appendChild(save);
      }
      if (!it.bought) body.appendChild(F9.btn(it.have ? 'Nhà chưa có, cần mua' : 'Nhà đã có, không cần mua', 'ghost block', function () {
        F9.post(api(fid, '/' + it.id + '/have'), { have: !it.have }).then(function () { close(); F9.dropGate(); return F9.refresh(true); }, F9.fail);
      }));
      if (canDel) body.appendChild(F9.btn('Xóa món này', 'ghost block danger-t', function () {
        F9.del(api(fid, '/' + it.id)).then(function () {
          close(); F9.dropGate();
          F9.toast('Đã xóa ' + titleOf(it), '', { undo: function () { return F9.post(api(fid, '/batch'), { items: [{ text: it.tidy ? it.tidy.name : it.name || it.text, qty: it.qty, unit: it.unit }], source: it.source === 'giong_noi' ? 'giong_noi' : 'tay' }).then(function () { F9.dropGate(); return F9.refresh(true); }); } });
          F9.refresh(true);
        }, F9.fail);
      }));
    });
  }

  // ---------- chia sẻ ----------
  function shareText(core, items) {
    var sp = split(items);
    var lines = ['Đi chợ - ' + core.family.name + ' (' + F9.dm(core.today) + ')', ''];
    group(sp.need).forEach(function (g) {
      lines.push(g.label.toUpperCase());
      g.items.forEach(function (i) { lines.push('- ' + titleOf(i)); });
      lines.push('');
    });
    return lines.join('\n').trim() + '\n';
  }
  function shareList(core, items) {
    var text = shareText(core, items);
    if (navigator.share) return navigator.share({ title: 'Danh sách đi chợ', text: text }).catch(function () { /* người dùng đóng */ });
    F9.copy(text, 'Đã sao chép danh sách, dán vào Zalo để gửi');
  }
  F9.shopShareText = shareText;

  // ---------- chế độ đi chợ: chữ to, ít chạm ----------
  var wl = null;
  function wakeOn() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wl = l; }, function () {}); } catch (e) { /* không hỗ trợ */ } }
  function wakeOff() { try { if (wl) { wl.release(); wl = null; } } catch (e) { /* bỏ qua */ } }
  window.addEventListener('hashchange', function () { if (!/\/shop\/go$/.test(location.hash)) wakeOff(); });

  F9.shopGo = function (fid) {
    F9.frame({ title: 'Đang đi chợ', back: '#/f/' + fid + '/shop', right: [] });
    F9.skeleton('list'); wakeOn();
    F9.live({
      fetch: function () { return F9.loadView(fid, 'shop', function () { return F9.get(api(fid)); }); },
      render: function (x) { renderGo(fid, x); },
      retick: false, every: 3000,
    }).catch(function (e) { F9.loadError(e, function () { F9.shopGo(fid); }); });
  };
  function renderGo(fid, x) {
    var core = x.core; var d = x.d;
    F9.setFam(core.family.name); F9.setFab(null); F9.setCta(null);
    document.body.classList.add('shopmode');
    var sp = split(d.items);
    var total = sp.need.length + sp.bought.length;
    var nodes = [];
    nodes.push(h('div', { class: 'go-head' }, [
      h('div', { class: 'go-prog', role: 'status', 'aria-live': 'polite' }, [h('b', { text: sp.bought.length + '/' + total }), ' đã mua']),
      h('div', { class: 'go-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(sp.bought.length) }, [h('i', { class: 'go-fill', 'data-w': String(total ? Math.round(sp.bought.length * 100 / total) : 0) })]),
    ]));
    if (!sp.need.length) nodes.push(F9.empty(total ? 'Đã mua đủ!' : 'Danh sách trống', total ? 'Không còn món nào cần mua.' : 'Thêm món ở màn Đi chợ.', h('div', { class: 'btn-row center' }, [F9.link('#/f/' + fid + '/shop', { class: 'btn primary' }, ['Quay lại danh sách'])]), 'check'));
    group(sp.need).forEach(function (g) {
      nodes.push(h('h3', { class: 'go-g', text: g.label }));
      nodes.push(h('div', { class: 'go-list' }, g.items.map(function (it) {
        return h('button', { type: 'button', class: 'go-row', 'aria-pressed': 'false', 'aria-label': 'Đã mua: ' + titleOf(it), onclick: function (e) {
          var b = e.currentTarget; b.classList.add('done'); b.setAttribute('aria-pressed', 'true');
          F9.post(api(fid, '/' + it.id + '/bought'), { bought: true }).then(function () { F9.dropGate(); return F9.refresh(true); }, function (er) { b.classList.remove('done'); b.setAttribute('aria-pressed', 'false'); F9.fail(er); });
        } }, [h('span', { class: 'go-box' }), h('span', { class: 'go-name', text: titleOf(it) }), it.addedBy ? h('span', { class: 'go-who', text: it.addedBy }) : null]);
      })));
    });
    if (sp.bought.length) {
      nodes.push(h('h3', { class: 'go-g', text: 'Đã mua' }));
      nodes.push(h('div', { class: 'go-list' }, sp.bought.map(function (it) {
        return h('button', { type: 'button', class: 'go-row done', 'aria-pressed': 'true', 'aria-label': 'Bỏ dấu mua: ' + titleOf(it), onclick: function () {
          F9.post(api(fid, '/' + it.id + '/bought'), { bought: false }).then(function () { F9.dropGate(); return F9.refresh(true); }, F9.fail);
        } }, [h('span', { class: 'go-box' }, [F9.ico('check', 20, 3)]), h('span', { class: 'go-name', text: titleOf(it) }), it.boughtBy ? h('span', { class: 'go-who', text: it.boughtBy }) : null]);
      })));
    }
    nodes.push(h('div', { class: 'btn-row' }, [F9.link('#/f/' + fid + '/shop', { class: 'btn primary' }, ['Xong']), F9.btn('Chia sẻ', 'ghost', function () { shareList(core, d.items); })]));
    F9.mount(nodes);
    // chiều rộng thanh tiến độ đặt bằng thuộc tính DOM (CSP không cho style nội tuyến trong HTML, nhưng CSSOM thì được)
    var fill = document.querySelector('.go-fill'); if (fill) fill.style.width = fill.getAttribute('data-w') + '%';
  }
  // rời chế độ đi chợ thì bỏ lớp toàn màn hình
  window.addEventListener('hashchange', function () { if (!/\/shop\/go$/.test(location.hash)) document.body.classList.remove('shopmode'); });
})();
