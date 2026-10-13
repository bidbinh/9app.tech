/* Bài nghe ngắn bằng TTS + câu hỏi. */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon;

  function hashStr(s) { var x = 11; for (var i = 0; i < s.length; i++) x = (x * 33 + s.charCodeAt(i)) | 0; return x; }

  function listView(el) {
    var s = E.store.state();
    el.appendChild(h('h1', 'Bài nghe'));
    el.appendChild(h('p.muted', 'Nghe đoạn hội thoại ngắn (giọng đọc của thiết bị), rồi trả lời 3 câu hỏi. Có thể chậm lại và xem lời thoại sau khi làm bài.'));
    if (!E.speech.ttsSupported()) el.appendChild(h('div.note.warn', icon('alert', 16), h('span', 'Trình duyệt này chưa hỗ trợ phát âm. Bạn vẫn có thể đọc lời thoại và làm bài.')));
    var list = h('div.stack');
    E.listening.list.forEach(function (l) {
      var best = s.listen[l.id];
      list.appendChild(h('a.card.row-card', { href: '#/listen/' + l.id },
        h('span.ti', icon('headphones', 22)),
        h('div', h('b', { text: l.title }), h('small.muted', { text: l.level + ' - ' + l.questions.length + ' câu hỏi' + (best != null ? ' - điểm tốt nhất ' + best + '/' + l.questions.length : '') })),
        icon('next', 18)));
    });
    el.appendChild(list);
  }

  function player(el, id) {
    var l = E.listening.list.filter(function (x) { return x.id === id; })[0];
    if (!l) return listView(el);
    var s = E.store.state(), st = s.settings, dl = E.store.daily();
    var speed = 1, playing = false, curLine = -1, showText = false, submitted = false;
    var speakers = {}, slot = 0;
    l.lines.forEach(function (ln) { if (!(ln.who in speakers)) speakers[ln.who] = slot++; });
    var PITCH = [1, 1.18, 0.88, 1.1];

    el.appendChild(h('a.back', { href: '#/listen' }, icon('back', 18), 'Bài nghe'));
    el.appendChild(h('h1', l.title));
    el.appendChild(h('p.muted', { text: l.level + ' - ' + l.intro }));

    var playBtn = h('button.btn.primary', { type: 'button', id: 'play' }, icon('play', 18), h('span', { text: 'Nghe' }));
    var slowBtn = h('button.chip', { type: 'button', 'aria-pressed': 'false' }, 'Chậm');
    var textBtn = h('button.chip', { type: 'button', 'aria-pressed': 'false' }, 'Hiện lời thoại');
    var tr = h('div.transcript', { hidden: true });
    l.lines.forEach(function (ln, i) { tr.appendChild(h('p.tl', { id: 'tl' + i }, l.lines.length > 1 ? h('b', { text: ln.who + ': ' }) : null, ln.text)); });
    var player = h('section.card.player', h('div.row', playBtn, slowBtn, textBtn), tr);
    el.appendChild(player);

    function mark(i) {
      curLine = i;
      Array.prototype.forEach.call(tr.children, function (p, k) { p.classList.toggle('now', k === i); });
    }
    function setPlay(v) {
      playing = v;
      E.ui.clear(playBtn); playBtn.appendChild(icon(v ? 'stop' : 'play', 18)); playBtn.appendChild(h('span', { text: v ? 'Dừng' : 'Nghe' }));
    }
    var runId = 0;
    function run() {
      var my = ++runId;
      setPlay(true); E.practice.busy(120000);
      var i = 0;
      (function nextLine() {
        if (my !== runId) return;
        if (i >= l.lines.length) { setPlay(false); mark(-1); return; }
        var ln = l.lines[i]; mark(i); i++;
        E.speech.speak(ln.text, { lang: st.accent, rate: st.rate * speed * 0.95, slot: speakers[ln.who], pitch: PITCH[speakers[ln.who] % 4] }).then(function (r) {
          if (my !== runId) return;
          if (!r.ok) { setPlay(false); mark(-1); if (r.reason === 'unsupported') E.ui.toast('Trình duyệt này chưa hỗ trợ phát âm. Hãy đọc lời thoại.', 'warn'); if (r.reason === 'unsupported') toggleText(true); return; }
          setTimeout(nextLine, 350);
        });
      })();
    }
    function stop() { runId++; E.speech.stop(); setPlay(false); mark(-1); }
    playBtn.addEventListener('click', function () { E.practice.ping(); if (playing) stop(); else run(); });
    slowBtn.addEventListener('click', function () { speed = speed === 1 ? 0.75 : 1; slowBtn.classList.toggle('on', speed < 1); slowBtn.setAttribute('aria-pressed', String(speed < 1)); });
    function toggleText(v) { showText = v == null ? !showText : v; tr.hidden = !showText; textBtn.classList.toggle('on', showText); textBtn.setAttribute('aria-pressed', String(showText)); }
    textBtn.addEventListener('click', function () { toggleText(); });

    // Câu hỏi
    var answers = {}, qWrap = h('section.card.quiz');
    l.questions.forEach(function (q, qi) {
      var order = E.shuffle.shuffle([0, 1, 2, 3], E.shuffle.mulberry32(hashStr(l.id + qi)));
      var fs = h('fieldset.q', h('legend', h('b', { text: (qi + 1) + '. ' + q.q }), h('small.muted', { text: q.vi })));
      order.forEach(function (oi, pos) {
        var rid = 'q' + qi + 'o' + pos;
        var inp = h('input', { type: 'radio', name: 'q' + qi, id: rid, value: String(oi) });
        inp.addEventListener('change', function () { answers[qi] = oi; E.practice.ping(); check.disabled = Object.keys(answers).length < l.questions.length; });
        fs.appendChild(h('label.opt', { 'for': rid, 'data-oi': String(oi) }, inp, h('span', { text: q.options[oi] })));
      });
      fs.appendChild(h('div.why', { hidden: true }));
      qWrap.appendChild(fs);
    });
    var check = h('button.btn.primary.wide', { type: 'button', disabled: true, id: 'check' }, 'Nộp bài');
    var result = h('div.result-box', { 'aria-live': 'polite' });
    check.addEventListener('click', function () {
      if (submitted) return;
      submitted = true; stop(); check.disabled = true;
      var right = 0;
      Array.prototype.forEach.call(qWrap.querySelectorAll('fieldset.q'), function (fs, qi) {
        var q = l.questions[qi], ok = answers[qi] === q.a;
        if (ok) right++;
        Array.prototype.forEach.call(fs.querySelectorAll('label.opt'), function (lab) {
          var oi = +lab.getAttribute('data-oi');
          lab.querySelector('input').disabled = true;
          if (oi === q.a) lab.classList.add('right'); else if (oi === answers[qi]) lab.classList.add('wrong');
        });
        var why = fs.querySelector('.why'); why.hidden = false;
        why.textContent = (ok ? 'Đúng. ' : 'Chưa đúng. ') + q.why;
        why.classList.add(ok ? 'good' : 'bad');
      });
      toggleText(true);
      var prev = s.listen[l.id]; if (prev == null || right > prev) s.listen[l.id] = right;
      dl.listen = true; E.store.save();
      result.appendChild(h('div.card.center', icon(right === 3 ? 'trophy' : 'check', 32), h('h2', { text: 'Bạn đúng ' + right + '/' + l.questions.length }),
        h('p.muted', right === 3 ? 'Xuất sắc! Hãy thử bài khó hơn.' : 'Nghe lại với chế độ "Chậm" và đối chiếu lời thoại để thấy chỗ mình nghe sót.'),
        h('div.row', h('button.btn', { type: 'button', onclick: function () { E.app.render(); } }, 'Làm lại'), h('a.btn.primary', { href: '#/listen' }, 'Bài khác'))));
      result.scrollIntoView && result.scrollIntoView({ block: 'nearest' });
    });
    el.appendChild(qWrap); el.appendChild(check); el.appendChild(result);
    return function () { runId++; E.speech.stop(); };
  }

  E.views.listen = function (el, parts) { return parts[0] ? player(el, parts[0]) : listView(el); };
})(self);
