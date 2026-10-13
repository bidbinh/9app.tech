/* 9swap: chi tiết tin, form đăng/sửa (kèm nén ảnh), trao đổi trong tin */
(function () {
  'use strict';
  var S9 = window.S9, h = S9.h;

  // ---------- báo cáo ----------
  S9.reportSheet = function (cid, type, id, what) {
    S9.sheet('Báo cáo ' + what, function (body, close) {
      var reasons = ['Đồ cấm hoặc không được phép', 'Lừa đảo, đòi chuyển tiền trước', 'Spam, quảng cáo', 'Nội dung phản cảm, xúc phạm', 'Lý do khác'];
      var sel = h('select', {}, reasons.map(function (r) { return h('option', { value: r, text: r }); }));
      var note = h('textarea', { maxlength: 120, placeholder: 'Mô tả thêm (không bắt buộc)' });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        S9.busy(form.querySelector('.btn.primary'), function () {
          var reason = sel.value + (note.value.trim() ? ': ' + note.value.trim() : '');
          return S9.post('api/c/' + cid + '/reports', { type: type, id: id, reason: reason }).then(function () {
            close(); S9.toast('Đã gửi báo cáo cho chủ cộng đồng. Cảm ơn bạn.');
          });
        });
      } }, [
        h('p', { class: 'muted', text: 'Chỉ chủ cộng đồng thấy báo cáo này. Người bị báo cáo không biết ai đã báo.' }),
        S9.field('Lý do', sel), S9.field('Ghi chú', note),
        h('div', { class: 'btn-row' }, [S9.btn('Gửi báo cáo', 'primary block', null, { type: 'submit' })]),
      ]);
      body.appendChild(form);
    });
  };

  var SAFETY = h('div');
  function safetyCard() {
    return h('div', { class: 'notice warn safety' }, [
      h('div', { class: 'notice-ico' }, [S9.ico('shield', 22)]),
      h('div', { class: 'notice-b' }, [
        h('div', { class: 'b', text: 'Gặp mặt an toàn' }),
        h('ul', {}, S9.RULES_SAFE.slice(0, 3).map(function (t) { return h('li', { text: t }); })),
        S9.link('#/rules', { class: 'linkbtn', text: 'Xem đủ quy tắc' }),
      ]),
    ]);
  }
  void SAFETY;

  function showPhoto(id) {
    S9.sheet('Ảnh', function (body) {
      body.appendChild(h('img', { class: 'bigimg', src: S9.photoUrl(id, false), alt: 'Ảnh món đồ' }));
    });
  }

  function interestSheet(l) {
    S9.sheet('Quan tâm "' + l.title + '"', function (body, close) {
      var msg = h('textarea', { maxlength: 500, 'aria-label': 'Tin nhắn' });
      msg.value = l.kind === 'doi' ? 'Chào bạn, mình quan tâm món này và có thể đổi bằng ... Bạn xem giúp mình nhé.' : 'Chào bạn, mình quan tâm món này. Còn không bạn?';
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        S9.busy(form.querySelector('.btn.primary'), function () {
          return S9.post('api/listings/' + l.id + '/threads', { body: msg.value }, { idem: 'thr' + l.id }).then(function (r) { close(); S9.go('#/t/' + r.threadId); });
        });
      } }, [
        h('p', { class: 'muted', text: 'Tin nhắn chỉ gửi riêng cho ' + l.authorName + '. Nên hẹn nhận đồ ở nơi công cộng.' }),
        msg,
        h('div', { class: 'btn-row' }, [S9.btn('Gửi', 'primary block', null, { type: 'submit' })]),
      ]);
      body.appendChild(form);
    });
  }

  // ---------- chi tiết tin ----------
  S9.listing = function (lid) {
    S9.frame({ title: 'Chi tiết', back: '#/' });
    S9.skeleton();
    var first = true;
    S9.live({
      fetch: function () { return S9.get('api/listings/' + lid); },
      render: function (d) { draw(d, lid); first = false; },
      every: 12000,
    }).catch(function (e) { if (first) S9.loadError(e, function () { S9.listing(lid); }); });
  };

  function kv(rows) {
    var dl = h('dl', { class: 'kv' });
    rows.forEach(function (r) { if (r[1] === null || r[1] === '' || r[1] === undefined) return; dl.appendChild(h('dt', { text: r[0] })); dl.appendChild(h('dd', {}, [r[1]])); });
    return dl;
  }

  function draw(d, lid) {
    var l = d.listing;
    var cid = l.communityId;
    S9.frame({ title: l.title, back: '#/c/' + cid });
    S9.pollStart(cid);
    var nodes = [];
    if (l.photos.length) {
      var gal = h('div', { class: 'gallery', 'aria-label': 'Ảnh món đồ' }, l.photos.map(function (id, i) {
        return h('button', { type: 'button', 'aria-label': 'Xem ảnh ' + (i + 1), onclick: function () { showPhoto(id); } }, [h('img', { src: S9.photoUrl(id, false), alt: 'Ảnh ' + (i + 1) + ' của ' + l.title, loading: i ? 'lazy' : 'eager' })]);
      }));
      nodes.push(gal);
      if (l.photos.length > 1) nodes.push(h('div', { class: 'gal-dots', text: 'Vuốt để xem ' + l.photos.length + ' ảnh' }));
    }
    var chips = [S9.chip(S9.meta.kinds[l.kind], S9.KIND_CLASS[l.kind]), S9.chip(S9.meta.conditions[l.condition] || '', ''), S9.chip(S9.meta.categories[l.category] || '', '')];
    nodes.push(h('div', {}, [h('h1', { class: 'meal-t', text: l.title }), h('div', { class: 'chips wrapchips' }, chips)]));

    // trạng thái
    var iAmRecipient = l.iAmRecipient;
    if (l.status === 'xong') nodes.push(h('div', { class: 'banner ok', text: S9.DONE_VERB[l.kind] + ' xong. Cảm ơn đã cho đồ có chỗ đi mới.' }));
    else if (l.status === 'giu') nodes.push(h('div', { class: 'banner warn', text: l.isMine ? 'Bạn đã giữ cho ' + (d.recipientName || 'một người') + '. Nhắn để hẹn giờ lấy, xong thì bấm hoàn tất.' : iAmRecipient ? 'Bạn được chọn nhận món này. Hãy nhắn để hẹn giờ lấy.' : 'Món này đã có người giữ.' }));
    else if (l.status === 'het_han') nodes.push(h('div', { class: 'banner bad', text: 'Tin đã hết hạn và đang bị ẩn với mọi người.' }));
    else if (l.status === 'huy') nodes.push(h('div', { class: 'banner bad', text: 'Tin đã được rút.' }));
    else if (l.status === 'go') nodes.push(h('div', { class: 'banner bad', text: 'Tin đã bị chủ cộng đồng gỡ' + (l.removedReason ? ': ' + l.removedReason : '.') }));

    var priceNode = null;
    if (l.kind === 'ban') priceNode = h('span', { class: 'price', text: l.price === 0 ? 'Giá thỏa thuận' : S9.vnd(l.price) });
    var left = S9.daysLeft(l.expiresAt);
    nodes.push(h('div', { class: 'card' }, [
      kv([
        ['Giá', priceNode], ['Muốn đổi lấy', l.swapWish || null], ['Nhận đồ tại', l.location], ['Giờ nhận', l.pickupTime || null],
        ['Đăng bởi', l.isMine ? 'Bạn' : l.authorName],
        ['Hết hạn', (l.status === 'mo' || l.status === 'giu') ? (left <= 0 ? 'Hôm nay' : 'Còn ' + left + ' ngày') : null],
      ]),
      l.isMine ? null : h('div', { class: 'mt' }, [S9.rep(l.stats), S9.repBadge(l.stats) ? S9.chip(S9.repBadge(l.stats), 'ok') : null]),
      l.description ? h('p', { class: 'pre mt', text: l.description }) : null,
      h('div', { class: 'muted small mt', text: 'Đăng ' + S9.ago(l.createdAt) }),
    ]));

    if (l.category === 'thuc_pham') nodes.push(S9.notice('warn', 'Đồ ăn', 'Kiểm tra hạn dùng và tình trạng trước khi nhận. Người đăng chịu trách nhiệm về thông tin hạn dùng đã ghi.'));

    var cta = null;
    if (l.isMine) {
      // danh sách người quan tâm
      var ts = d.threads || [];
      var tcard = h('div', { class: 'card' }, [h('h2', { text: 'Người quan tâm (' + ts.length + ')' })]);
      if (!ts.length) tcard.appendChild(h('div', { class: 'muted', text: l.status === 'mo' ? 'Chưa có ai nhắn. Khi có người quan tâm bạn sẽ nhận thông báo.' : 'Không có cuộc trao đổi nào.' }));
      ts.forEach(function (t) {
        tcard.appendChild(S9.link('#/t/' + t.id, { class: 'trow' }, [
          h('div', { class: 'avatar sm' }, [t.name.slice(0, 1).toUpperCase()]),
          h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: t.name + (t.gone ? ' (đã rời)' : '') }), h('div', { class: 'last', text: t.lastBody })]),
          t.isRecipient ? S9.chip('Đã chọn', 'ok') : null,
          t.unread ? h('span', { class: 'dotmark', 'aria-label': 'Tin nhắn mới' }) : null,
          S9.ico('chev', 18),
        ]));
      });
      nodes.push(tcard);
      var open = l.status === 'mo' || l.status === 'giu';
      var verb = { tang: 'tặng', doi: 'đổi', ban: 'bán' }[l.kind];
      var row = h('div', { class: 'btn-row' });
      if (open) {
        row.appendChild(S9.btn('Đã ' + verb + ' xong', 'primary', function (ev) { completeFlow(ev.currentTarget, l, d); }));
        if (l.status === 'giu') row.appendChild(S9.btn('Mở lại, chọn người khác', 'ghost', function (ev) { S9.busy(ev.currentTarget, function () { return S9.post('api/listings/' + l.id + '/release').then(function () { S9.toast('Đã mở lại tin'); return S9.refresh(); }); }); }));
        row.appendChild(S9.link('#/l/' + l.id + '/edit', { class: 'btn ghost' }, [S9.ico('edit', 18), 'Sửa tin']));
      }
      if ((l.status === 'het_han' || (open && left <= 7)) && l.canRenew) row.appendChild(S9.btn('Gia hạn thêm ' + S9.meta.limits.listingDays + ' ngày', 'ghost', function (ev) { S9.busy(ev.currentTarget, function () { return S9.post('api/listings/' + l.id + '/renew').then(function () { S9.toast('Đã gia hạn'); return S9.refresh(); }); }); }));
      if (open || l.status === 'het_han') row.appendChild(S9.btn('Rút tin', 'ghost', function (ev) {
        var btn = ev.currentTarget;
        S9.confirm({ title: 'Rút tin?', text: 'Tin sẽ bị ẩn và ảnh bị xóa. Bạn không hoàn tác được.', ok: 'Rút tin', danger: true }).then(function (yes) {
          if (yes) S9.busy(btn, function () { return S9.post('api/listings/' + l.id + '/cancel').then(function () { S9.toast('Đã rút tin'); S9.go('#/c/' + cid + '/mine'); }); });
        });
      }));
      nodes.push(row);
    } else {
      nodes.push(safetyCard());
      if (d.myThread) {
        cta = S9.link('#/t/' + d.myThread.id, { class: 'btn primary block' }, [S9.ico('msg', 20), 'Nhắn với ' + l.authorName, d.myThread.unread ? h('span', { class: 'dotmark' }) : null]);
      } else if (l.status === 'mo') {
        cta = S9.btn('Quan tâm món này', 'primary block', function () { interestSheet(l); });
      }
      if (iAmRecipient && l.status === 'giu') {
        nodes.push(h('div', { class: 'btn-row' }, [S9.btn('Mình không nhận nữa', 'ghost', function (ev) {
          var btn = ev.currentTarget;
          S9.confirm({ title: 'Không nhận nữa?', text: 'Tin sẽ mở lại cho người khác. Hãy nhắn cho ' + l.authorName + ' nếu cần giải thích.', ok: 'Không nhận nữa', danger: true }).then(function (yes) {
            if (yes) S9.busy(btn, function () { return S9.post('api/listings/' + l.id + '/decline').then(function () { S9.toast('Đã báo cho người đăng'); return S9.refresh(); }); });
          });
        })]));
      }
      var links = [S9.btn('Báo cáo tin này', 'linkbtn danger-t', function () { S9.reportSheet(cid, 'listing', l.id, 'tin'); })];
      if (d.canManage && l.status !== 'go') links.push(S9.btn('Gỡ tin (chủ cộng đồng)', 'linkbtn danger-t', function () { removeSheet(l); }));
      nodes.push(h('div', { class: 'center' }, links));
    }
    if (l.isMine && d.canManage === false) { /* người đăng không tự gỡ */ }
    if (!l.isMine && l.status !== 'go') { /* đã xử lý ở trên */ }
    S9.mount(nodes);
    S9.setCta(cta);
  }

  function completeFlow(btn, l, d) {
    var hasR = !!d.recipientName;
    var verb = { tang: 'tặng', doi: 'đổi', ban: 'bán' }[l.kind];
    S9.confirm({
      title: 'Đã ' + verb + ' xong?',
      text: hasR ? 'Xác nhận đã ' + verb + ' "' + l.title + '" cho ' + d.recipientName + '. Lần này sẽ được tính vào điểm uy tín của bạn.'
        : 'Bạn chưa chọn người nhận trong app nên lần này không được tính vào điểm uy tín. Vẫn đánh dấu xong?',
      ok: 'Đã ' + verb + ' xong',
    }).then(function (yes) {
      if (!yes) return;
      S9.busy(btn, function () {
        return S9.post('api/listings/' + l.id + '/complete').then(function (r) { S9.toast(r.credited ? 'Đã ghi nhận. Cảm ơn bạn!' : 'Đã đánh dấu xong'); return S9.refresh(); });
      });
    });
  }

  function removeSheet(l) {
    S9.sheet('Gỡ tin', function (body, close) {
      var reason = S9.text({ maxlength: 200, placeholder: 'Lý do (người đăng sẽ thấy)' });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        S9.busy(form.querySelector('.btn.danger'), function () {
          return S9.post('api/listings/' + l.id + '/remove', { reason: reason.value }).then(function () { close(); S9.toast('Đã gỡ tin'); S9.go('#/c/' + l.communityId); });
        });
      } }, [S9.field('Lý do', reason), h('div', { class: 'btn-row' }, [S9.btn('Gỡ tin', 'danger block', null, { type: 'submit' })])]);
      body.appendChild(form);
    });
  }

  // ---------- form đăng / sửa ----------
  S9.listingForm = function (cid, lid) {
    S9.pollStop();
    S9.frame({ title: lid ? 'Sửa tin' : 'Đăng tin', back: lid ? '#/l/' + lid : '#/c/' + cid });
    S9.skeleton();
    var load = lid ? S9.get('api/listings/' + lid).then(function (d) { return d.listing; }) : Promise.resolve(null);
    var infoP = lid ? Promise.resolve(null) : S9.get('api/c/' + cid);
    Promise.all([load, infoP]).then(function (r) {
      var l = r[0];
      if (r[1] && r[1].me.banned) { S9.go('#/c/' + cid); return; }
      var realCid = l ? l.communityId : cid;
      S9.pollStart(realCid);
      build(realCid, l);
    }, function (e) { S9.loadError(e, function () { S9.listingForm(cid, lid); }, '#/c/' + cid); });
  };

  function build(cid, l) {
    var editing = l ? l.id : null;
    var kind = l ? l.kind : 'tang';
    var maxPhotos = S9.meta.limits.photos;
    var title = S9.text({ maxlength: 80, placeholder: 'Ví dụ: Nồi chiên không dầu 5L', value: l ? l.title : '' });
    var cat = S9.select(S9.meta.categories, l ? l.category : 'gia_dung');
    var cond = S9.select(S9.meta.conditions, l ? l.condition : 'tot');
    var price = S9.text({ inputmode: 'decimal', maxlength: 14, placeholder: 'Ví dụ: 150.000 hoặc 150k', value: l && l.price !== null ? String(l.price) : '' });
    var wish = S9.text({ maxlength: 120, placeholder: 'Ví dụ: sách thiếu nhi, ghế xếp', value: l ? l.swapWish : '' });
    var desc = h('textarea', { maxlength: 1000, placeholder: 'Mô tả ngắn: kích cỡ, dùng bao lâu, lỗi nếu có...' });
    desc.value = l ? l.description : '';
    var loc = S9.text({ maxlength: 80, placeholder: 'Ví dụ: Tòa A, tầng 5, sảnh', value: l ? l.location : (S9.store('loc') || '') });
    var pick = S9.text({ maxlength: 80, placeholder: 'Ví dụ: sau 18h, cuối tuần', value: l ? l.pickupTime : (S9.store('pick') || '') });
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Kiểu tin' });
    var priceF = S9.field('Giá bán (VND)', price, 'App không xử lý thanh toán; hai bên tự thỏa thuận khi gặp.');
    var wishF = S9.field('Muốn đổi lấy', wish);
    var catHint = h('div', { class: 'hint' });
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var items = (l ? l.photos : []).map(function (id) { return { id: id }; }); // ảnh đã có
    var staged = []; // ảnh mới chờ tải: { pair, url, state }
    var photosBox = h('div', { class: 'photos' });
    var fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'filebtn', 'aria-label': 'Chọn ảnh' });
    var busyCompress = 0;

    function drawKind() {
      S9.clear(seg);
      [['tang', 'Tặng'], ['doi', 'Trao đổi'], ['ban', 'Bán']].forEach(function (k) {
        var food = cat.value === 'thuc_pham';
        seg.appendChild(h('button', { type: 'button', class: kind === k[0] ? 'on' : '', 'aria-pressed': kind === k[0] ? 'true' : 'false', disabled: food && k[0] !== 'tang', text: k[1], onclick: function () { kind = k[0]; drawKind(); } }));
      });
      priceF.classList.toggle('hidden', kind !== 'ban');
      wishF.classList.toggle('hidden', kind !== 'doi');
      catHint.textContent = cat.value === 'thuc_pham' ? 'Đồ ăn chỉ được tặng. Ghi rõ hạn dùng trong mô tả.' : '';
    }
    cat.addEventListener('change', function () { if (cat.value === 'thuc_pham') kind = 'tang'; drawKind(); });

    function total() { return items.length + staged.length; }
    function drawPhotos() {
      S9.clear(photosBox);
      items.forEach(function (it) {
        photosBox.appendChild(h('div', { class: 'photo' }, [
          h('img', { src: S9.photoUrl(it.id, true), alt: 'Ảnh đã đăng' }),
          h('button', { type: 'button', class: 'x', 'aria-label': 'Xóa ảnh này', onclick: function () {
            S9.confirm({ title: 'Xóa ảnh?', text: 'Ảnh sẽ bị xóa khỏi tin ngay.', ok: 'Xóa ảnh', danger: true }).then(function (yes) {
              if (!yes) return;
              S9.del('api/photos/' + it.id).then(function () { items = items.filter(function (x) { return x !== it; }); drawPhotos(); }, S9.fail);
            });
          } }, [S9.ico('close', 18)]),
        ]));
      });
      staged.forEach(function (it) {
        photosBox.appendChild(h('div', { class: 'photo' }, [
          h('img', { src: it.url, alt: 'Ảnh mới chọn' }),
          it.state === 'up' ? h('div', { class: 'busy', text: 'Đang tải...' }) : null,
          it.state === 'err' ? h('div', { class: 'busy', text: 'Lỗi, thử lại' }) : null,
          it.state === 'up' ? null : h('button', { type: 'button', class: 'x', 'aria-label': 'Bỏ ảnh này', onclick: function () { URL.revokeObjectURL(it.url); staged = staged.filter(function (x) { return x !== it; }); drawPhotos(); } }, [S9.ico('close', 18)]),
        ]));
      });
      if (busyCompress) photosBox.appendChild(h('div', { class: 'photo' }, [h('div', { class: 'busy', text: 'Đang xử lý ảnh...' })]));
      if (total() + busyCompress < maxPhotos) {
        photosBox.appendChild(h('button', { type: 'button', class: 'photo add', 'aria-label': 'Thêm ảnh', onclick: function () { fileIn.click(); } }, [S9.ico('camera', 26), h('span', { text: 'Thêm ảnh' })]));
      }
    }
    fileIn.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileIn.files || []);
      fileIn.value = '';
      var room = maxPhotos - total() - busyCompress;
      if (files.length > room) S9.toast('Mỗi tin tối đa ' + maxPhotos + ' ảnh', 'err');
      files.slice(0, Math.max(0, room)).forEach(function (f) {
        busyCompress++; drawPhotos();
        S9.compress(f).then(function (pair) {
          busyCompress--;
          staged.push({ pair: pair, url: URL.createObjectURL(pair.thumb), state: 'ready' });
          drawPhotos();
        }, function (e) { busyCompress--; drawPhotos(); S9.toast(e.message || 'Không đọc được ảnh này', 'err'); });
      });
    });

    function showErr(m) { err.textContent = m; err.classList.remove('hidden'); try { err.scrollIntoView({ block: 'center' }); } catch (e) { /* bỏ qua */ } }
    function submit(btn) {
      err.classList.add('hidden');
      var t = title.value.trim();
      if (t.length < 3) { showErr('Tiêu đề cần ít nhất 3 ký tự'); title.focus(); return; }
      if (!loc.value.trim() || loc.value.trim().length < 2) { showErr('Hãy ghi nơi nhận đồ, ví dụ "Tòa A, tầng 5"'); loc.focus(); return; }
      var body = { kind: kind, title: t, description: desc.value, category: cat.value, condition: cond.value, location: loc.value, pickupTime: pick.value };
      if (kind === 'ban') {
        var p = S9.parseMoney(price.value);
        if (isNaN(p) || p < 0 || p > 1000000000) { showErr('Giá chưa đúng. Nhập số tiền như 150000, 150.000 hoặc 150k (nhập 0 nếu thỏa thuận)'); price.focus(); return; }
        body.price = p;
      }
      if (kind === 'doi') body.swapWish = wish.value;
      S9.busy(btn, function () {
        var save = editing
          ? S9.post('api/listings/' + editing, body)
          : S9.post('api/c/' + cid + '/listings', body, { idem: 'mklisting' }).then(function (r) { editing = r.id; return r; });
        return save.then(function () {
          S9.store('loc', loc.value.trim()); S9.store('pick', pick.value.trim());
          var todo = staged.filter(function (s) { return s.state !== 'done'; });
          var failed = 0;
          return todo.reduce(function (p, s, i) {
            return p.then(function () {
              s.state = 'up'; drawPhotos(); btn.setAttribute('data-label', 'Tải ảnh ' + (i + 1) + '/' + todo.length);
              return S9.uploadPhoto(editing, s.pair).then(function () { s.state = 'done'; }, function (e) { s.state = 'err'; s.error = e.message; failed++; });
            });
          }, Promise.resolve()).then(function () {
            staged = staged.filter(function (s) { if (s.state === 'done') { URL.revokeObjectURL(s.url); return false; } return true; });
            drawPhotos();
            if (failed) { showErr('Tin đã lưu nhưng ' + failed + ' ảnh chưa tải được (' + (todo.filter(function (s) { return s.state === 'err'; })[0].error || 'lỗi mạng') + '). Bấm lưu lần nữa để thử lại ảnh.'); return; }
            S9.toast(l ? 'Đã lưu tin' : 'Đã đăng tin');
            S9.go('#/l/' + editing);
          });
        });
      });
    }

    var form = h('form', { novalidate: true, onsubmit: function (ev) { ev.preventDefault(); submit(form.querySelector('.btn.primary')); } }, [
      h('div', { class: 'card' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Bạn muốn' }), seg]),
        S9.field('Tên món đồ', title),
        S9.field('Danh mục', cat, null), catHint,
        S9.field('Tình trạng', cond),
        priceF, wishF,
        S9.field('Mô tả', desc),
      ]),
      h('div', { class: 'card' }, [
        h('h2', { text: 'Ảnh (tối đa ' + maxPhotos + ')' }),
        h('div', { class: 'hint', text: 'Ảnh được thu nhỏ ngay trên máy bạn trước khi gửi. Ảnh rõ thì dễ có người nhận.' }),
        photosBox, fileIn,
      ]),
      h('div', { class: 'card' }, [
        h('h2', { text: 'Nhận đồ ở đâu, khi nào' }),
        S9.field('Nơi nhận', loc), S9.field('Giờ nhận (không bắt buộc)', pick),
      ]),
      S9.notice('info', 'Không đăng đồ cấm', 'Thuốc kê đơn, vũ khí, động vật hoang dã, hàng giả... bị cấm. Tin tự ẩn sau ' + S9.meta.limits.listingDays + ' ngày.', S9.link('#/rules', { class: 'linkbtn', text: 'Xem quy tắc' })),
      err,
      h('div', { class: 'btn-row' }, [S9.btn(l ? 'Lưu thay đổi' : 'Đăng tin', 'primary block')]),
    ]);
    drawKind(); drawPhotos();
    S9.mount([form]);
  }

  // ---------- trao đổi trong tin ----------
  S9.thread = function (tid) {
    S9.frame({ title: 'Trao đổi', back: '#/' });
    S9.skeleton();
    S9.get('api/threads/' + tid).then(function (d) { drawThread(tid, d); }, function (e) { S9.loadError(e, function () { S9.thread(tid); }); });
  };

  function bubble(m, cid) {
    var wrap = h('div', { class: 'bubble-wrap' + (m.mine ? ' me' : ''), 'data-mid': String(m.id) }, [
      h('div', { class: 'bubble' + (m.mine ? ' me' : '') }, [m.body, h('span', { class: 't', text: S9.timeOf(m.createdAt) })]),
    ]);
    if (!m.mine) wrap.appendChild(h('button', { type: 'button', class: 'flag linkbtn', text: 'Báo cáo', onclick: function () { S9.reportSheet(cid, 'message', String(m.id), 'tin nhắn'); } }));
    return wrap;
  }

  function drawThread(tid, d) {
    var l = d.listing; var cid = l.communityId;
    S9.frame({ title: d.other.name, back: '#/l/' + l.id });
    S9.pollStart(cid);
    var msgsBox = h('div', { class: 'msgs', 'aria-live': 'polite' });
    var actions = h('div');
    var head = h('div', {});
    var last = 0;
    var sending = false;
    var state = d;

    function addMsgs(list) {
      var near = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 160;
      list.forEach(function (m) { if (m.id > last) { last = m.id; msgsBox.appendChild(bubble(m, cid)); } });
      if (list.length && near) setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 30);
    }
    function drawHead() {
      S9.clear(head); S9.clear(actions);
      var l2 = state.listing;
      var chips = [S9.chip(S9.meta.kinds[l2.kind], S9.KIND_CLASS[l2.kind]), S9.chip(S9.STATUS[l2.status] || '', l2.status === 'mo' ? 'info' : l2.status === 'giu' ? 'warn' : 'bad')];
      head.appendChild(S9.link('#/l/' + l2.id, { class: 'card row-card' }, [S9.thumb(l2.photo, 'sm'), h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: l2.title }), h('div', { class: 'chips', style: null }, chips)]), S9.ico('chev', 18)]));
      if (l2.isMine && (l2.status === 'mo' || l2.status === 'giu') && !state.other.gone) {
        if (l2.threadRecipient) {
          actions.appendChild(h('div', { class: 'banner ok', text: 'Bạn đã chọn ' + state.other.name + ' nhận món này.' }));
        } else {
          actions.appendChild(S9.btn('Chọn ' + state.other.name + ' nhận món này', 'primary block', function (ev) {
            var btn = ev.currentTarget;
            S9.confirm({ title: 'Chọn ' + state.other.name + '?', text: 'Món này sẽ được giữ cho ' + state.other.name + ' và người khác không quan tâm thêm được. Bạn đổi ý được bất cứ lúc nào.', ok: 'Chọn người này' }).then(function (yes) {
              if (yes) S9.busy(btn, function () { return S9.post('api/listings/' + l2.id + '/choose', { threadId: tid }).then(function () { S9.toast('Đã giữ món cho ' + state.other.name); return reload(); }); });
            });
          }));
        }
        if (!l2.threadRecipient) actions.appendChild(S9.btn('Đóng cuộc trao đổi này', 'linkbtn', function (ev) {
          var btn = ev.currentTarget;
          S9.confirm({ title: 'Đóng cuộc trao đổi?', text: state.other.name + ' sẽ không nhắn thêm được và không còn trong danh sách quan tâm của bạn.', ok: 'Đóng', danger: true }).then(function (yes) {
            if (yes) S9.busy(btn, function () { return S9.post('api/threads/' + tid + '/close').then(function () { S9.toast('Đã đóng'); S9.go('#/l/' + l2.id); }); });
          });
        }));
      } else if (!l2.isMine && l2.iAmRecipient && l2.status === 'giu') {
        actions.appendChild(h('div', { class: 'banner ok', text: 'Bạn được chọn nhận món này. Hãy hẹn giờ lấy với ' + state.other.name + '.' }));
      } else if (!state.canSend) {
        actions.appendChild(h('div', { class: 'banner', text: state.other.gone ? 'Người này không còn trong cộng đồng.' : 'Tin đã đóng nên không nhắn thêm được.' }));
      }
    }
    function reload() {
      return S9.get('api/threads/' + tid + '?after=' + last).then(function (nd) { state = nd; drawHead(); addMsgs(nd.messages); composerState(); });
    }

    var ta = h('textarea', { maxlength: 500, placeholder: 'Nhắn tin...', 'aria-label': 'Tin nhắn', rows: 1 });
    var sendBtn = h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Gửi' }, [S9.ico('send', 20)]);
    var composer = h('form', { class: 'composer', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var text = ta.value.trim();
      if (!text || sending) return;
      sending = true; sendBtn.disabled = true;
      S9.post('api/threads/' + tid + '/messages', { body: text }, { idem: 'msg' + tid + ':' + text.length + ':' + last }).then(function (r) {
        ta.value = ''; addMsgs([r.message]); setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 50);
      }, S9.fail).then(function () { sending = false; sendBtn.disabled = false; });
    } }, [ta, sendBtn]);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && window.matchMedia && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); composer.requestSubmit ? composer.requestSubmit() : sendBtn.click(); }
    });
    function composerState() { composer.classList.toggle('hidden', !state.canSend); }

    drawHead();
    addMsgs(d.messages);
    composerState();
    S9.mount([
      head, actions,
      h('div', { class: 'muted small center', text: 'Chỉ bạn và ' + d.other.name + ' thấy cuộc trao đổi này. Hẹn nhận đồ ở nơi công cộng, đừng chuyển tiền trước.' }),
      msgsBox, composer,
    ]);
    // thăm dò tin mới mỗi 5 giây (vẫn chạy khi đang gõ vì chỉ thêm tin vào cuối danh sách)
    var timer = setInterval(function () {
      if (document.hidden) return;
      S9.get('api/threads/' + tid + '?after=' + last).then(function (nd) {
        var changed = JSON.stringify([nd.listing, nd.canSend, nd.other]) !== JSON.stringify([state.listing, state.canSend, state.other]);
        state = nd;
        if (changed) { drawHead(); composerState(); }
        addMsgs(nd.messages);
      }).catch(function () { /* mạng chập chờn: lần sau thử lại */ });
    }, 5000);
    S9.onLeave(function () { clearInterval(timer); });
    setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 60);
  }
})();
