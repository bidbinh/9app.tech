/* 9swap: bảng tin thất lạc, nhặt được, cần tìm */
(function () {
  'use strict';
  var S9 = window.S9, h = S9.h;
  var BK_CLASS = { that_lac: 'bad', nhat_duoc: 'ok', can_tim: 'info' };
  var F = { kind: '', q: '' };

  S9.boardCard = function (p) {
    var chips = [S9.chip(S9.meta.boardKinds[p.kind], BK_CLASS[p.kind])];
    if (p.status === 'xong') chips.push(S9.chip('Đã xong', 'ok'));
    if (p.status === 'go') chips.push(S9.chip('Bị gỡ', 'bad'));
    if (p.status === 'het_han') chips.push(S9.chip('Hết hạn', 'bad'));
    if (p.replyCount) chips.push(S9.chip(p.replyCount + ' bình luận', ''));
    return S9.link('#/b/' + p.id, { class: 'lcard' + (p.status === 'xong' ? ' dim' : '') }, [
      h('div', { class: 'body' }, [
        h('div', { class: 'ttl', text: p.title }),
        p.location ? h('div', { class: 'meta' }, [S9.ico('pin', 13), ' ', p.location]) : null,
        h('div', { class: 'meta', text: (p.isMine ? 'Của bạn' : p.authorName) + ' · ' + S9.ago(p.createdAt) }),
        h('div', { class: 'chips' }, chips),
      ]),
    ]);
  };

  S9.board = function (cid) {
    S9.withCommunity(cid, { tab: 'board', title: 'Bảng tin' }, function () {
      var list = h('div', { class: 'list two' });
      var pills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Loại bài' });
      var q = h('input', { type: 'search', placeholder: 'Tìm: chìa khóa, thẻ xe, ví...', value: F.q, 'aria-label': 'Tìm kiếm', maxlength: 80, autocomplete: 'off', enterkeyhint: 'search' });
      var seq = 0; var timer = null;
      function drawPills() {
        S9.clear(pills);
        [['', 'Tất cả'], ['that_lac', 'Thất lạc'], ['nhat_duoc', 'Nhặt được'], ['can_tim', 'Cần tìm']].forEach(function (k) {
          pills.appendChild(h('button', { class: 'pill' + (F.kind === k[0] ? ' on' : ''), type: 'button', 'aria-pressed': F.kind === k[0] ? 'true' : 'false', text: k[1], onclick: function () { F.kind = k[0]; drawPills(); load(); } }));
        });
      }
      function load() {
        var my = ++seq;
        S9.clear(list); list.appendChild(h('div', { class: 'skel' }));
        var qs = [];
        if (F.kind) qs.push('kind=' + F.kind);
        if (F.q) qs.push('q=' + encodeURIComponent(F.q));
        S9.get('api/c/' + cid + '/board?' + qs.join('&')).then(function (d) {
          if (my !== seq) return;
          S9.clear(list);
          d.items.forEach(function (p) { list.appendChild(S9.boardCard(p)); });
          if (!d.items.length) list.appendChild(S9.empty(F.q || F.kind ? 'Không có bài nào khớp' : 'Bảng tin còn trống', 'Mất đồ, nhặt được đồ hay đang cần tìm món gì? Đăng lên để mọi người cùng giúp.',
            h('div', { class: 'btn-row center' }, [S9.link('#/c/' + cid + '/board/new', { class: 'btn primary' }, ['Đăng bài'])])));
        }, function (e) { if (my === seq) { S9.clear(list); list.appendChild(S9.empty('Chưa tải được', e.message, h('div', { class: 'btn-row center' }, [S9.btn('Thử lại', 'primary', load)]))); } });
      }
      q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { F.q = q.value.trim(); load(); }, 300); });
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); q.blur(); } });
      drawPills();
      S9.mount([
        h('div', { class: 'row sb' }, [h('div', { class: 'muted', text: 'Thất lạc, nhặt được, cần tìm trong cộng đồng' }), S9.link('#/c/' + cid + '/board/new', { class: 'btn primary sm' }, [S9.ico('plus', 18), 'Đăng bài'])]),
        h('div', { class: 'search mt' }, [S9.ico('search', 20), q]),
        pills, list,
      ]);
      load();
    });
  };

  S9.boardForm = function (cid) {
    S9.pollStop();
    S9.frame({ title: 'Đăng lên bảng tin', back: '#/c/' + cid + '/board' });
    S9.pollStart(cid);
    var kind = 'that_lac';
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Loại bài' });
    var title = S9.text({ maxlength: 80, placeholder: 'Ví dụ: Mất chìa khóa xe máy' });
    var desc = h('textarea', { maxlength: 600, placeholder: 'Mô tả đặc điểm, thời gian, nơi thấy lần cuối...' });
    var loc = S9.text({ maxlength: 80, placeholder: 'Ví dụ: hầm B1, sảnh tòa A' });
    var err = h('div', { class: 'hint err hidden', role: 'alert' });
    var hint = h('div', { class: 'hint' });
    var HINTS = { that_lac: 'Bạn bị mất đồ và muốn nhờ mọi người để ý.', nhat_duoc: 'Bạn nhặt được đồ của ai đó. Đừng mô tả quá chi tiết để chủ đồ chứng minh được.', can_tim: 'Bạn đang cần xin hoặc mượn một món đồ.' };
    function drawSeg() {
      S9.clear(seg);
      [['that_lac', 'Thất lạc'], ['nhat_duoc', 'Nhặt được'], ['can_tim', 'Cần tìm']].forEach(function (k) {
        seg.appendChild(h('button', { type: 'button', class: kind === k[0] ? 'on' : '', 'aria-pressed': kind === k[0] ? 'true' : 'false', text: k[1], onclick: function () { kind = k[0]; drawSeg(); } }));
      });
      hint.textContent = HINTS[kind];
    }
    drawSeg();
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      err.classList.add('hidden');
      if (title.value.trim().length < 3) { err.textContent = 'Tiêu đề cần ít nhất 3 ký tự'; err.classList.remove('hidden'); title.focus(); return; }
      S9.busy(form.querySelector('.btn.primary'), function () {
        return S9.post('api/c/' + cid + '/board', { kind: kind, title: title.value, description: desc.value, location: loc.value }, { idem: 'mkboard' }).then(function (r) { S9.toast('Đã đăng lên bảng tin'); S9.go('#/b/' + r.id); });
      });
    } }, [
      h('div', { class: 'card' }, [h('div', { class: 'field' }, [h('label', { text: 'Loại bài' }), seg, hint]), S9.field('Tiêu đề', title), S9.field('Mô tả', desc), S9.field('Nơi (không bắt buộc)', loc)]),
      err,
      h('div', { class: 'btn-row' }, [S9.btn('Đăng bài', 'primary block')]),
    ]);
    S9.mount([form]);
  };

  // chi tiết bài: cần cid để quay lại, lấy từ bài (máy chủ trả communityId)
  S9.boardPost = function (bid) {
    S9.frame({ title: 'Bảng tin', back: '#/' });
    S9.skeleton();
    var first = true;
    S9.live({
      fetch: function () { return S9.get('api/board/' + bid); },
      render: function (d) { first = false; drawPost(bid, d); },
      every: 10000,
    }).catch(function (e) { if (first) S9.loadError(e, function () { S9.boardPost(bid); }); });
  };

  function drawPost(bid, d) {
    var p = d.post; var cid = p.communityId;
    S9.frame({ title: S9.meta.boardKinds[p.kind], back: '#/c/' + cid + '/board' });
    S9.pollStart(cid);
    var nodes = [];
    var chips = [S9.chip(S9.meta.boardKinds[p.kind], BK_CLASS[p.kind])];
    if (p.status === 'xong') chips.push(S9.chip('Đã xong', 'ok'));
    nodes.push(h('div', { class: 'card' }, [
      h('h1', { class: 'meal-t', text: p.title }),
      h('div', { class: 'chips wrapchips' }, chips),
      p.description ? h('p', { class: 'pre mt', text: p.description }) : null,
      p.location ? h('div', { class: 'muted mt' }, [S9.ico('pin', 14), ' ', p.location]) : null,
      h('div', { class: 'muted small mt', text: (p.isMine ? 'Bạn' : p.authorName) + ' đăng ' + S9.ago(p.createdAt) }),
    ]));
    if (p.status === 'go') nodes.push(h('div', { class: 'banner bad', text: 'Bài đã bị gỡ' + (p.removedReason ? ': ' + p.removedReason : '.') }));
    if (p.status === 'het_han') nodes.push(h('div', { class: 'banner bad', text: 'Bài đã hết hạn.' }));
    if (p.kind === 'nhat_duoc' && !p.isMine && p.status === 'mo') nodes.push(S9.notice('info', 'Là đồ của bạn?', 'Hãy bình luận mô tả đặc điểm mà chỉ chủ đồ biết, người nhặt sẽ liên hệ lại.'));

    var rc = h('div', { class: 'card' }, [h('h2', { text: 'Bình luận (' + d.replies.length + ')' })]);
    if (!d.replies.length) rc.appendChild(h('div', { class: 'muted', text: 'Chưa có bình luận.' }));
    d.replies.forEach(function (r) {
      rc.appendChild(h('div', { class: 'who' }, [
        h('div', { class: 'row sb' }, [h('div', { class: 'b', text: r.mine ? 'Bạn' : r.authorName }), h('div', { class: 'muted small', text: S9.ago(r.createdAt) })]),
        h('div', { class: 'pre', text: r.body }),
        h('div', { class: 'row' }, [
          (r.mine || p.isMine || d.canManage) ? S9.btn('Xóa', 'linkbtn danger-t', function () {
            S9.confirm({ title: 'Xóa bình luận?', text: 'Bình luận sẽ biến mất với mọi người.', ok: 'Xóa', danger: true }).then(function (yes) { if (yes) S9.post('api/replies/' + r.id + '/delete').then(function () { return S9.refresh(); }, S9.fail); });
          }) : null,
          !r.mine ? S9.btn('Báo cáo', 'linkbtn', function () { S9.reportSheet(cid, 'reply', r.id, 'bình luận'); }) : null,
        ]),
      ]));
    });
    nodes.push(rc);

    if (p.status === 'mo') {
      var ta = h('textarea', { maxlength: 300, placeholder: p.kind === 'nhat_duoc' ? 'Mô tả đồ của bạn...' : 'Bạn thấy hoặc có thể giúp? Viết ở đây...', 'aria-label': 'Bình luận' });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        if (!ta.value.trim()) return;
        S9.busy(form.querySelector('.btn.primary'), function () {
          return S9.post('api/board/' + bid + '/replies', { body: ta.value }).then(function () { ta.value = ''; return S9.refresh(); });
        });
      } }, [ta, h('div', { class: 'btn-row end' }, [S9.btn('Gửi bình luận', 'primary')])]);
      nodes.push(h('div', { class: 'card' }, [form]));
    }

    var acts = [];
    if (p.isMine && p.status === 'mo') acts.push(S9.btn(p.kind === 'can_tim' ? 'Đã tìm được' : p.kind === 'nhat_duoc' ? 'Đã trả lại chủ' : 'Đã tìm thấy', 'primary', function (ev) {
      S9.busy(ev.currentTarget, function () { return S9.post('api/board/' + bid + '/close').then(function () { S9.toast('Đã đóng bài'); return S9.refresh(); }); });
    }));
    if ((p.isMine || d.canManage) && p.status !== 'go') acts.push(S9.btn(p.isMine ? 'Xóa bài' : 'Gỡ bài (chủ cộng đồng)', 'ghost', function () {
      S9.confirm({ title: p.isMine ? 'Xóa bài?' : 'Gỡ bài?', text: p.isMine ? 'Bài sẽ biến mất với mọi người.' : 'Người đăng sẽ được báo.', ok: p.isMine ? 'Xóa bài' : 'Gỡ bài', danger: true }).then(function (yes) {
        if (yes) S9.post('api/board/' + bid + '/remove', {}).then(function () { S9.toast('Đã gỡ bài'); S9.go('#/c/' + cid + '/board'); }, S9.fail);
      });
    }));
    if (acts.length) nodes.push(h('div', { class: 'btn-row' }, acts));
    if (!p.isMine) nodes.push(h('div', { class: 'center' }, [S9.btn('Báo cáo bài này', 'linkbtn danger-t', function () { S9.reportSheet(cid, 'board', p.id, 'bài'); })]));
    S9.mount(nodes);
  }
})();
