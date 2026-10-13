/* Thẻ từ vựng lặp lại ngắt quãng (SM-2). */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon, sm2 = E.sm2;
  var LEVELS = ['A2', 'B1', 'B2', 'C1'];
  var POSVI = { n: 'danh từ', v: 'động từ', adj: 'tính từ', adv: 'trạng từ', prep: 'giới từ', conj: 'liên từ', phr: 'cụm từ', 'phr v': 'cụm động từ', idiom: 'thành ngữ' };

  function wordsOf(topic) {
    var s = E.store.state(), lv = s.settings.levels;
    return E.vocab.filter(function (w) { return (!topic || topic === 'all' || w.topic === topic) && (!lv.length || lv.indexOf(w.level) >= 0); });
  }
  function topicById(id) { return E.topics.filter(function (t) { return t.id === id; })[0]; }

  /* ---------- Danh sách chủ đề ---------- */
  function home(el) {
    var s = E.store.state(), dl = E.store.daily();
    var all = wordsOf('all'), c = E.store.counts(all);
    var newLeft = Math.max(0, Math.min(c.fresh, s.settings.newPerDay - dl.newCount));

    el.appendChild(h('h1', 'Từ vựng công sở'));
    el.appendChild(h('p.muted', { text: E.vocab.length + ' từ và cụm từ trong ' + E.topics.length + ' chủ đề, có phiên âm IPA, ví dụ và nghĩa tiếng Việt.' }));

    var chips = h('div.chips', { role: 'group', 'aria-label': 'Lọc theo mức độ' });
    var all0 = h('button.chip' + (s.settings.levels.length === 0 ? '.on' : ''), { type: 'button', 'aria-pressed': String(s.settings.levels.length === 0), onclick: function () { s.settings.levels = []; E.store.save(); E.app.refresh(); } }, 'Tất cả');
    chips.appendChild(all0);
    LEVELS.forEach(function (l) {
      var on = s.settings.levels.indexOf(l) >= 0;
      chips.appendChild(h('button.chip' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': String(on), onclick: function () {
        var i = s.settings.levels.indexOf(l);
        if (i >= 0) s.settings.levels.splice(i, 1); else s.settings.levels.push(l);
        E.store.save(); E.app.refresh();
      } }, l));
    });
    el.appendChild(chips);

    el.appendChild(h('section.card.todo',
      h('div', h('b.big', { text: c.due + newLeft }), h('small', { text: ' thẻ hôm nay' }), h('p.muted', { text: c.due + ' cần ôn, ' + newLeft + ' từ mới (tối đa ' + s.settings.newPerDay + ' từ mới mỗi ngày)' })),
      h('a.btn.primary', { href: '#/learn/s/all', 'aria-disabled': (c.due + newLeft) ? null : 'true' }, (c.due + newLeft) ? 'Bắt đầu học' : 'Xem thêm')));

    var list = h('div.topics');
    E.topics.forEach(function (t) {
      var ws = wordsOf(t.id), cc = E.store.counts(ws);
      var pct = ws.length ? Math.round(100 * cc.mature / ws.length) : 0;
      var seen = ws.length - cc.fresh;
      var bar = h('div.pbar', { role: 'img', 'aria-label': 'Đã thuộc ' + pct + ' phần trăm' }, h('i'));
      bar.firstChild.style.width = pct + '%';
      var sub = h('small.muted', { text: cc.fresh + ' mới - ' + cc.learning + ' đang học - ' + cc.mature + ' đã thuộc' });
      list.appendChild(h('div.card.topic',
        h('div.topic-head', h('span.ti', icon(t.icon, 22)), h('div', h('b', { text: t.name }), h('p.muted', { text: t.desc }))),
        bar, sub,
        h('div.row',
          h('a.btn.sm.primary', { href: '#/learn/s/' + t.id }, cc.due ? 'Học (' + cc.due + ' cần ôn)' : 'Học chủ đề này'),
          h('a.btn.sm', { href: '#/learn/list/' + t.id }, icon('list', 16), h('span', { text: 'Xem danh sách' })))));
    });
    el.appendChild(list);
  }

  /* ---------- Danh sách từ + tìm kiếm ---------- */
  function unknownTopic(el, topic) {
    el.appendChild(h('a.back', { href: '#/learn' }, icon('back', 18), 'Từ vựng'));
    el.appendChild(h('section.card.center', icon('alert', 32), h('h2', 'Không có chủ đề này'),
      h('p.muted', { text: 'Chủ đề "' + topic + '" không tồn tại. Hãy chọn một chủ đề trong danh sách.' }),
      h('a.btn.primary', { href: '#/learn' }, 'Về danh sách chủ đề')));
  }

  function listView(el, topic) {
    if (topic && !topicById(topic)) return unknownTopic(el, topic);
    var t = topicById(topic);
    var ws = E.vocab.filter(function (w) { return !t || w.topic === t.id; });
    el.appendChild(h('a.back', { href: '#/learn' }, icon('back', 18), 'Từ vựng'));
    el.appendChild(h('h1', t ? t.name : 'Tất cả từ'));
    var input = h('input.search', { type: 'search', placeholder: 'Tìm từ hoặc nghĩa...', 'aria-label': 'Tìm từ', autocomplete: 'off' });
    var box = h('div.wlist');
    el.appendChild(h('div.searchbox', icon('search', 18), input));
    el.appendChild(box);
    var st = E.store.state();
    function draw() {
      var q = input.value.trim().toLowerCase();
      E.ui.clear(box);
      var shown = ws.filter(function (w) { return !q || w.word.toLowerCase().indexOf(q) >= 0 || w.vi.toLowerCase().indexOf(q) >= 0; });
      if (!shown.length) box.appendChild(h('p.muted', 'Không tìm thấy từ phù hợp.'));
      shown.forEach(function (w) {
        var card = st.cards[w.id];
        box.appendChild(h('div.witem',
          h('div.wtop', h('b.word', { text: w.word }), h('span.badge', { text: w.level }), card ? h('span.badge.ok', { text: sm2.isMature(card) ? 'đã thuộc' : 'đang học' }) : null),
          h('div.ipa', { text: w.ipa }),
          h('div', { text: w.vi }),
          h('div.ex', { text: w.ex }),
          h('div.row', E.practice.say(w.word, 'Từ'), E.practice.say(w.ex, 'Câu ví dụ'))));
      });
    }
    input.addEventListener('input', draw);
    draw();
  }

  /* ---------- Phiên học ---------- */
  function session(el, topic) {
    if (topic !== 'all' && !topicById(topic)) return unknownTopic(el, topic);
    var s = E.store.state(), t = E.store.today(), dl = E.store.daily();
    var newLimit = Math.max(0, s.settings.newPerDay - dl.newCount);
    var built = E.shuffle.buildQueue(E.vocab, s.cards, { today: t, newLimit: newLimit, topic: topic === 'all' ? null : topic, levels: s.settings.levels });
    var queue = built.queue.slice();
    var stats = { done: 0, again: 0, good: 0, fresh: 0 };
    var relearn = {};

    el.appendChild(h('a.back', { href: '#/learn' }, icon('back', 18), 'Từ vựng'));
    var progress = h('div.pbar.thin', h('i'));
    var counter = h('small.muted');
    el.appendChild(h('div.sess-head', counter, progress));
    var stage = h('div.stage');
    el.appendChild(stage);
    var total = queue.length;

    if (!total) { empty(); return; }

    function empty() {
      E.ui.clear(stage);
      stage.appendChild(h('section.card.center',
        icon('trophy', 36),
        h('h2', 'Hôm nay không còn thẻ nào'),
        h('p.muted', { text: 'Bạn đã ôn hết thẻ đến hạn' + (newLimit === 0 ? ' và đạt giới hạn từ mới hôm nay.' : '.') }),
        h('div.row', h('button.btn.primary', { type: 'button', onclick: function () { moreNew(); } }, 'Học thêm 5 từ mới'), h('a.btn', { href: '#/learn' }, 'Chọn chủ đề khác'))));
    }
    function moreNew() {
      var b = E.shuffle.buildQueue(E.vocab, s.cards, { today: t, newLimit: 5, topic: topic === 'all' ? null : topic, levels: s.settings.levels });
      if (!b.queue.length) { E.ui.toast('Không còn từ mới trong phạm vi đã chọn.'); return; }
      queue = b.queue.slice(); total = queue.length; stats = { done: 0, again: 0, good: 0, fresh: 0 }; relearn = {};
      next();
    }

    function updateHead() {
      counter.textContent = Math.min(stats.done + 1, total) + ' / ' + total + (queue.length > total - stats.done ? ' (có thẻ làm lại)' : '');
      progress.firstChild.style.width = Math.round(100 * stats.done / Math.max(1, total)) + '%';
    }

    function next() {
      E.practice.ping();
      if (!queue.length) { finish(); return; }
      var w = queue[0];
      updateHead();
      showFront(w);
    }

    function finish() {
      E.ui.clear(stage); progress.firstChild.style.width = '100%'; counter.textContent = 'Hoàn thành';
      var dueTomorrow = E.vocab.filter(function (w) { var c = s.cards[w.id]; return c && c.due <= t + 1; }).length;
      stage.appendChild(h('section.card.center',
        icon('trophy', 40),
        h('h2', 'Xong phiên học!'),
        h('div.sumgrid',
          h('div', h('b.big', { text: String(stats.done) }), h('small', { text: 'lượt ôn' })),
          h('div', h('b.big', { text: String(stats.fresh) }), h('small', { text: 'từ mới' })),
          h('div', h('b.big', { text: stats.done ? Math.round(100 * stats.good / stats.done) + '%' : '-' }), h('small', { text: 'nhớ đúng' }))),
        h('p.muted', { text: 'Ngày mai bạn sẽ cần ôn khoảng ' + dueTomorrow + ' thẻ.' }),
        h('div.row', h('button.btn.primary', { type: 'button', onclick: moreNew }, 'Học thêm 5 từ mới'), h('a.btn', { href: '#/' }, 'Về trang chủ'))));
      dl.reviewedAll = true;
      E.store.save();
    }

    function front(w) {
      return h('div.cardface',
        h('div.meta', h('span.badge', { text: w.level }), h('span.badge.soft', { text: POSVI[w.pos] || w.pos })),
        h('div.bigword', { text: w.word }),
        h('div.ipa.lg', { text: w.ipa }),
        h('div.row.c', speakBtn(w.word, 'en-US', 'Mỹ'), speakBtn(w.word, 'en-GB', 'Anh')));
    }
    function speakBtn(text, lang, label) {
      var b = h('button.btn.sm', { type: 'button', 'aria-label': 'Nghe giọng ' + label }, icon('volume', 16), h('span', { text: label }));
      b.addEventListener('click', function () {
        E.practice.ping();
        if (!E.speech.ttsSupported()) { E.ui.toast('Trình duyệt này chưa hỗ trợ phát âm.', 'warn'); return; }
        E.practice.busy(4000);
        E.speech.speak(text, { lang: lang, rate: s.settings.rate });
      });
      return b;
    }

    function showFront(w) {
      E.ui.clear(stage);
      var isNew = !s.cards[w.id];
      var card = h('section.card.flash', front(w),
        isNew ? h('div.newtag', { text: 'Từ mới' }) : null,
        h('button.btn.primary.wide', { type: 'button', id: 'reveal', onclick: function () { showBack(w); } }, 'Hiện nghĩa'));
      stage.appendChild(card);
      // phát âm tự động lần đầu thấy từ mới (không bắt buộc)
      if (isNew && E.speech.ttsSupported() && s.settings.auto !== false) { E.practice.busy(3000); E.speech.speak(w.word, { lang: s.settings.accent, rate: s.settings.rate }); }
    }

    function showBack(w) {
      E.ui.clear(stage);
      var cur = s.cards[w.id] || sm2.newCard(t);
      var pv = sm2.preview(cur, t);
      var grades = [['again', 'Quên', 'g-again'], ['hard', 'Khó', 'g-hard'], ['good', 'Tốt', 'g-good'], ['easy', 'Dễ', 'g-easy']];
      var gr = h('div.grades', { role: 'group', 'aria-label': 'Chấm mức nhớ' });
      grades.forEach(function (g) {
        gr.appendChild(h('button.grade.' + g[2], { type: 'button', 'data-grade': g[0], onclick: function () { grade(w, g[0]); } },
          h('b', { text: g[1] }), h('small', { text: g[0] === 'again' ? 'học lại' : sm2.labelInterval(pv[g[0]]) })));
      });
      var mic = E.practice.mic(w.word, { label: 'Nói từ này' });
      stage.appendChild(h('section.card.flash',
        front(w),
        h('hr'),
        h('div.vi', { text: w.vi }),
        h('div.ex', { text: w.ex }),
        w.note ? h('div.tip', icon('bulb', 16), h('span', { text: w.note })) : null,
        h('div.row.c', E.practice.say(w.ex, 'Nghe câu ví dụ'), mic),
        gr));
    }

    function grade(w, g) {
      E.practice.ping();
      E.speech.stop();
      queue.shift();
      var isNew = !s.cards[w.id];
      var isRelearn = relearn[w.id];
      if (!isRelearn) {
        var base = s.cards[w.id] || sm2.newCard(t);
        s.cards[w.id] = sm2.review(base, g, t);
        if (isNew) { dl.newCount++; stats.fresh++; }
        dl.reviewed++;
        stats.done++;
        if (g !== 'again') stats.good++;
        if (g === 'again') stats.again++;
      }
      if (g === 'again') {
        relearn[w.id] = true;
        var pos = Math.min(queue.length, 4); // làm lại sau vài thẻ nữa
        queue.splice(pos, 0, w);
      } else if (isRelearn) {
        delete relearn[w.id];
        stats.done = stats.done; // lượt làm lại không tính vào số lượt ôn
      }
      E.store.save();
      next();
    }

    next();
    return function () { E.speech.stop(); };
  }

  E.views.learn = function (el, parts) {
    if (parts[0] === 's') return session(el, parts[1] || 'all');
    if (parts[0] === 'list') return listView(el, parts[1]);
    return home(el);
  };
})(self);
