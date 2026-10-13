/* 9swap: trang cộng đồng: danh sách đồ, "của tôi", thông báo */
(function () {
  'use strict';
  var S9 = window.S9, h = S9.h;

  // Nạp thông tin cộng đồng (tên, vai trò, số đếm) rồi dựng khung; render(info) vẽ phần thân.
  S9.withCommunity = function (cid, opts, render) {
    S9.skeleton();
    return S9.get('api/c/' + cid).then(function (info) {
      S9.cur = info;
      if (info.me.banned) {
        S9.frame({ title: info.community.name, back: '#/' });
        S9.pollStop();
        S9.mount([S9.notice('bad', 'Bạn đã bị chủ cộng đồng khóa', 'Bạn không xem hay đăng được trong cộng đồng này nữa.'), h('div', { class: 'btn-row center' }, [S9.link('#/', { class: 'btn ghost' }, ['Về trang chủ'])])]);
        return null;
      }
      var right = [];
      if (opts.settings !== false) {
        right.push(S9.link('#/c/' + cid + '/settings', { class: 'icon-btn', 'aria-label': 'Cài đặt cộng đồng' }, [S9.ico('gear', 22)]));
      }
      S9.frame({ title: opts.title || info.community.name, back: opts.back || '#/', right: right, tabs: opts.tab ? { cid: cid, active: opts.tab, unread: info.counts.unread } : null });
      S9.pollStart(cid);
      render(info);
      return info;
    }, function (e) { S9.loadError(e, function () { S9.withCommunity(cid, opts, render); }); return null; });
  };

  S9.listingCard = function (it) {
    var status = it.status;
    var chips = [S9.chip(S9.meta.kinds[it.kind], S9.KIND_CLASS[it.kind])];
    if (it.kind === 'ban' && it.price !== null) chips.push(h('span', { class: 'chip price', text: it.price === 0 ? 'Giá thỏa thuận' : S9.vnd(it.price) }));
    chips.push(S9.chip(S9.meta.conditions[it.condition] || '', ''));
    if (status === 'giu') chips.push(S9.chip('Đã có người giữ', 'warn'));
    if (status === 'xong') chips.push(S9.chip(S9.DONE_VERB[it.kind], 'ok'));
    if (status === 'het_han' || status === 'huy' || status === 'go') chips.push(S9.chip(S9.STATUS[status], 'bad'));
    var thumb = S9.thumb(it.photos[0]);
    if (it.photos.length > 1) thumb.appendChild(h('span', { class: 'more', text: '+' + (it.photos.length - 1) }));
    return S9.link('#/l/' + it.id, { class: 'lcard' + (status === 'xong' ? ' dim' : '') }, [
      thumb,
      h('div', { class: 'body' }, [
        h('div', { class: 'ttl', text: it.title }),
        h('div', { class: 'meta' }, [S9.ico('pin', 13), ' ', it.location]),
        h('div', { class: 'meta', text: (it.isMine ? 'Của bạn' : it.authorName) + ' · ' + S9.ago(it.createdAt) }),
        h('div', { class: 'chips' }, chips.concat(it.unreadThreads ? [h('span', { class: 'chip bad', text: it.unreadThreads + ' tin mới' })] : [])),
      ]),
    ]);
  };

  var F = { q: '', kind: '', category: '', condition: '', view: 'open' };

  // ---------- danh sách đồ ----------
  S9.community = function (cid) {
    S9.withCommunity(cid, { tab: 'feed' }, function (info) {
      var list = h('div', { class: 'list two' });
      var moreRow = h('div', { class: 'more-row' });
      var q = h('input', { type: 'search', placeholder: 'Tìm đồ: nồi, sách, xe đạp...', value: F.q, 'aria-label': 'Tìm kiếm', maxlength: 80, autocomplete: 'off', enterkeyhint: 'search' });
      var cat = S9.select(S9.meta.categories, F.category, 'Mọi danh mục'); cat.setAttribute('aria-label', 'Danh mục');
      var cond = S9.select(S9.meta.conditions, F.condition, 'Mọi tình trạng'); cond.setAttribute('aria-label', 'Tình trạng');
      var pills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Kiểu tin' });
      var seq = 0; var timer = null;

      function qs(offset) {
        var p = [];
        ['q', 'kind', 'category', 'condition'].forEach(function (k) { if (F[k]) p.push(k + '=' + encodeURIComponent(F[k])); });
        if (F.view !== 'open') p.push('view=' + F.view);
        if (offset) p.push('offset=' + offset);
        return p.join('&');
      }
      function drawPills() {
        S9.clear(pills);
        [['', 'Tất cả'], ['tang', 'Tặng'], ['doi', 'Trao đổi'], ['ban', 'Bán']].forEach(function (k) {
          pills.appendChild(h('button', { class: 'pill' + (F.kind === k[0] ? ' on' : ''), type: 'button', 'aria-pressed': F.kind === k[0] ? 'true' : 'false', text: k[1], onclick: function () { F.kind = k[0]; drawPills(); load(0); } }));
        });
        pills.appendChild(h('button', { class: 'pill' + (F.view === 'done' ? ' on' : ''), type: 'button', 'aria-pressed': F.view === 'done' ? 'true' : 'false', text: 'Đã trao tay', onclick: function () { F.view = F.view === 'done' ? 'open' : 'done'; drawPills(); load(0); } }));
      }
      function load(offset) {
        var my = ++seq;
        if (!offset) { S9.clear(list); list.appendChild(h('div', { class: 'skel' })); }
        S9.clear(moreRow);
        S9.get('api/c/' + cid + '/listings?' + qs(offset)).then(function (d) {
          if (my !== seq) return;
          if (!offset) S9.clear(list); else if (list.lastChild && list.lastChild.className === 'skel') list.removeChild(list.lastChild);
          d.items.forEach(function (it) { list.appendChild(S9.listingCard(it)); });
          if (!list.children.length) {
            var filtered = F.q || F.kind || F.category || F.condition || F.view !== 'open';
            list.appendChild(S9.empty(filtered ? 'Không có tin nào khớp' : 'Chưa có tin nào',
              filtered ? 'Thử bỏ bớt bộ lọc hoặc tìm từ khác.' : 'Nhà bạn có món gì còn dùng được? Đăng tin đầu tiên để mở màn nhé.',
              filtered ? null : h('div', { class: 'btn-row center' }, [S9.link('#/c/' + cid + '/new', { class: 'btn primary' }, ['Đăng tin đầu tiên'])])));
          }
          if (d.hasMore) moreRow.appendChild(S9.btn('Xem thêm', 'ghost', function (ev) { S9.busy(ev.currentTarget, function () { load(d.next); }); }));
        }, function (e) {
          if (my !== seq) return;
          S9.clear(list); list.appendChild(S9.empty('Chưa tải được', e.message, h('div', { class: 'btn-row center' }, [S9.btn('Thử lại', 'primary', function () { load(0); })])));
        });
      }
      q.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { F.q = q.value.trim(); load(0); }, 300);
      });
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); q.blur(); } });
      cat.addEventListener('change', function () { F.category = cat.value; load(0); });
      cond.addEventListener('change', function () { F.condition = cond.value; load(0); });
      drawPills();
      S9.mount([
        h('div', { class: 'search' }, [S9.ico('search', 20), q]),
        h('div', { class: 'filters' }, [cat, cond]),
        pills,
        list, moreRow,
      ]);
      load(0);
    });
  };

  // ---------- của tôi ----------
  S9.mine = function (cid) {
    S9.withCommunity(cid, { tab: 'mine', title: 'Của tôi' }, function (info) {
      Promise.all([
        S9.get('api/c/' + cid + '/listings?view=mine'),
        S9.get('api/c/' + cid + '/interests'),
        S9.get('api/c/' + cid + '/board?view=mine'),
      ]).then(function (r) {
        var nodes = [];
        nodes.push(h('div', { class: 'card row-card' }, [
          h('div', { class: 'avatar' }, [info.me.name.slice(0, 1).toUpperCase()]),
          h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: info.me.name }), h('div', { class: 'muted small', text: info.me.role === 'chu' ? 'Chủ cộng đồng' : 'Thành viên' })]),
        ]));
        nodes.push(h('div', { class: 'sec', text: 'Tin tôi đăng' }));
        var mine = r[0].items;
        var listWrap = h('div', { class: 'list two' }, mine.map(S9.listingCard));
        nodes.push(mine.length ? listWrap : S9.empty('Bạn chưa đăng tin nào', 'Món đồ nào còn dùng được là có người cần.', h('div', { class: 'btn-row center' }, [S9.link('#/c/' + cid + '/new', { class: 'btn primary' }, ['Đăng tin'])])));
        nodes.push(h('div', { class: 'sec', text: 'Tin tôi quan tâm' }));
        var ints = r[1].items;
        if (!ints.length) nodes.push(h('div', { class: 'muted', text: 'Khi bạn bấm "Quan tâm" ở một tin, cuộc trao đổi sẽ hiện ở đây.' }));
        else nodes.push(h('div', { class: 'card' }, ints.map(function (it) {
          return S9.link('#/t/' + it.threadId, { class: 'trow' }, [
            S9.thumb(it.photo, 'sm'),
            h('div', { class: 'col' }, [h('div', { class: 'b trunc', text: it.title }), h('div', { class: 'last', text: it.authorName + ' · ' + (it.iAmRecipient && it.status === 'giu' ? 'Bạn được chọn nhận' : S9.STATUS[it.status]) })]),
            it.unread ? h('span', { class: 'dotmark', 'aria-label': 'Có tin nhắn mới' }) : null,
            S9.ico('chev', 18),
          ]);
        })));
        var posts = r[2].items;
        if (posts.length) {
          nodes.push(h('div', { class: 'sec', text: 'Bài tôi đăng trên bảng tin' }));
          nodes.push(h('div', { class: 'list two' }, posts.map(S9.boardCard)));
        }
        S9.mount(nodes);
      }, function (e) { S9.loadError(e, function () { S9.mine(cid); }); });
    });
  };

  // ---------- thông báo ----------
  S9.notifs = function (cid) {
    S9.withCommunity(cid, { tab: 'notifs', title: 'Thông báo' }, function () {
      S9.get('api/c/' + cid + '/poll').then(function (d) {
        var nodes = [];
        if (d.unread) nodes.push(h('div', { class: 'btn-row end' }, [S9.btn('Đánh dấu đã đọc hết', 'ghost sm', function (ev) {
          S9.busy(ev.currentTarget, function () { return S9.post('api/c/' + cid + '/notifications/read', {}).then(function () { S9.setUnread(0); S9.notifs(cid); }); });
        })]));
        if (!d.items.length) nodes.push(S9.empty('Chưa có thông báo', 'Khi có người quan tâm tin của bạn hoặc nhắn tin, bạn sẽ thấy ở đây.'));
        else nodes.push(h('div', { class: 'card' }, d.items.map(function (n) {
          var go = n.threadId ? '#/t/' + n.threadId : n.listingId ? '#/l/' + n.listingId : n.boardId ? '#/b/' + n.boardId : n.type === 'report' ? '#/c/' + cid + '/reports' : null;
          return h('button', { class: 'nrow ' + (n.read ? 'read' : 'unread'), type: 'button', onclick: function () {
            (n.read ? Promise.resolve() : S9.post('api/c/' + cid + '/notifications/read', { id: n.id })).then(function () { if (go) S9.go(go); else S9.notifs(cid); }, S9.fail);
          } }, [h('span', { class: 'ndot' }), h('span', { class: 'col' }, [h('span', { class: 'block ntxt', text: n.text }), h('span', { class: 'block ntime', text: S9.ago(n.createdAt) })])]);
        })));
        S9.mount(nodes);
      }, function (e) { S9.loadError(e, function () { S9.notifs(cid); }); });
    });
  };
})();
