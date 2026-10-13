/* Màn hình "Hôm nay": mục tiêu 10 phút, chuỗi ngày, việc nên làm. */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon;

  function ring(frac, label, sub) {
    var NS = 'http://www.w3.org/2000/svg', R = 52, C = 2 * Math.PI * R;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('class', 'ring'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    var bg = document.createElementNS(NS, 'circle');
    ['cx', 'cy'].forEach(function (a) { bg.setAttribute(a, 60); }); bg.setAttribute('r', R); bg.setAttribute('class', 'ring-bg');
    var fg = document.createElementNS(NS, 'circle');
    ['cx', 'cy'].forEach(function (a) { fg.setAttribute(a, 60); }); fg.setAttribute('r', R); fg.setAttribute('class', 'ring-fg');
    fg.setAttribute('stroke-dasharray', C.toFixed(1)); fg.setAttribute('stroke-dashoffset', (C * (1 - Math.min(1, frac))).toFixed(1));
    fg.setAttribute('transform', 'rotate(-90 60 60)');
    svg.appendChild(bg); svg.appendChild(fg);
    return svg;
  }

  function fmtMin(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  function weekBars(s, goal) {
    var t = E.store.today(), box = h('div.week', { role: 'img', 'aria-label': 'Số phút học 7 ngày gần nhất' });
    var names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    for (var i = 6; i >= 0; i--) {
      var d = t - i, sec = s.secByDay[d] || 0, frac = Math.min(1, sec / goal);
      var dow = new Date(d * 86400000).getUTCDay();
      var bar = h('div.bar' + (sec >= goal ? '.done' : '') + (i === 0 ? '.today' : ''));
      var fill = h('div.fill'); fill.style.height = Math.max(sec > 0 ? 6 : 0, Math.round(frac * 100)) + '%';
      bar.appendChild(fill);
      box.appendChild(h('div.col', { title: Math.round(sec / 60) + ' phút' }, h('div.num', { text: sec ? String(Math.round(sec / 60)) : '' }), bar, h('div.lbl', { text: names[dow] })));
    }
    return box;
  }

  function phraseOfDay() {
    var all = E.phrasesData.phrases, d = E.store.today();
    return all[(d * 7) % all.length];
  }

  function task(ic, title, sub, hash, done, cta) {
    return h('a.task' + (done ? '.done' : ''), { href: hash },
      h('span.ti', icon(done ? 'check' : ic, 22)),
      h('span.tx', h('b', { text: title }), h('small', { text: sub })),
      h('span.go', icon('next', 18)));
  }

  E.views.home = function (el) {
    var s = E.store.state(), goal = s.settings.dailyMin * 60, t = E.store.today();
    var st = E.streak.streak(s.secByDay, goal, t);
    var dl = E.store.daily();
    var words = E.vocab, lv = s.settings.levels;
    var pool = lv.length ? words.filter(function (w) { return lv.indexOf(w.level) >= 0; }) : words;
    var c = E.store.counts(pool);
    var newLeft = Math.max(0, Math.min(c.fresh, s.settings.newPerDay - dl.newCount));

    var secToday = s.secByDay[t] || 0;
    var frac = secToday / goal;
    var minNode = h('b.big', { id: 'live-min', text: fmtMin(secToday) });
    var fillNode = ring(frac, 'Đã học ' + Math.floor(secToday / 60) + ' trên ' + s.settings.dailyMin + ' phút');
    var ringBox = h('div.ring-box', fillNode, h('div.ring-in', minNode, h('small', { text: '/ ' + s.settings.dailyMin + ':00 phút' })));
    E.views._live = function () {
      var sec = E.store.state().secByDay[E.store.today()] || 0;
      var n = document.getElementById('live-min'); if (n) n.textContent = fmtMin(sec);
      var fg = el.querySelector('.ring-fg');
      if (fg) { var C = 2 * Math.PI * 52; fg.setAttribute('stroke-dashoffset', (C * (1 - Math.min(1, sec / goal))).toFixed(1)); }
    };

    var hero = h('section.card.hero',
      ringBox,
      h('div.hero-side',
        h('div.streak-line', icon('flame', 22), h('b', { text: st.current + ' ngày' }), h('small', { text: 'chuỗi liên tiếp' })),
        h('div.muted', { text: st.todayDone ? 'Bạn đã đạt mục tiêu hôm nay. Giỏi lắm!' : 'Còn ' + Math.max(1, Math.ceil((goal - secToday) / 60)) + ' phút nữa để giữ chuỗi.' }),
        h('div.muted', { text: 'Kỷ lục: ' + st.best + ' ngày' })));

    var phrase = phraseOfDay();
    var tasks = h('div.tasks',
      task('cards', 'Ôn và học thẻ từ', c.due + ' thẻ đến hạn' + (newLeft ? ', ' + newLeft + ' từ mới hôm nay' : ''), '#/learn/s/all', c.due === 0 && newLeft === 0),
      task('mic', 'Nói câu của ngày', '"' + phrase.en + '"', '#/talk/c/' + phrase.cat, !!dl.phrase),
      task('headphones', 'Nghe một bài ngắn', E.listening.list.length + ' bài, có câu hỏi', '#/listen', !!dl.listen),
      task('chat', 'Đóng vai một tình huống', 'Hội thoại có nhánh, luyện nói', '#/talk/role', !!dl.role));

    var placement = s.placement
      ? h('section.card.lvl',
          h('div.lvl-badge', { text: s.placement.level }),
          h('div', h('b', { text: 'Trình độ ước lượng: ' + s.placement.level }), h('p.muted', { text: E.placement.plans[s.placement.level].title })),
          h('a.btn.sm', { href: '#/test' }, 'Làm lại'))
      : h('section.card.cta',
          h('div', h('b', { text: 'Bạn đang ở trình độ nào?' }), h('p.muted', { text: 'Bài kiểm tra 20 câu, khoảng 8 phút, gợi ý lộ trình học phù hợp.' })),
          h('a.btn.primary', { href: '#/test' }, 'Làm bài kiểm tra'));

    el.appendChild(h('h1.sr', 'Hôm nay'));
    el.appendChild(hero);
    el.appendChild(h('h2.sec', 'Việc nên làm hôm nay'));
    el.appendChild(tasks);
    el.appendChild(placement);
    el.appendChild(h('h2.sec', '7 ngày gần nhất'));
    el.appendChild(h('section.card', weekBars(s, goal)));
    el.appendChild(h('section.card.remind',
      icon('bell', 22),
      h('div', h('b', { text: 'Nhắc học mỗi ngày' }), h('p.muted', { text: 'Tạo tệp lịch (ICS) để điện thoại nhắc bạn học mỗi ngày.' })),
      h('a.btn.sm', { href: '#/more' }, 'Thiết lập')));

    return function () { E.views._live = null; };
  };
})(self);
