/* Theo dõi thời gian học trong ngày + nút luyện nói (mic) dùng chung. */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon;

  /* ---- Thời gian học: đếm giây khi tab hiện, có thao tác trong 60 giây gần nhất, và đang ở màn học ---- */
  var lastAct = 0, active = false, tick = null, busyUntil = 0;
  function ping() { lastAct = Date.now(); }
  function busy(ms) { busyUntil = Date.now() + ms; } // đang nghe/phát âm dài: coi như đang học
  ['pointerdown', 'keydown', 'scroll', 'input'].forEach(function (ev) { root.addEventListener(ev, ping, { passive: true, capture: true }); });
  function start() {
    if (tick) return;
    tick = setInterval(function () {
      if (!active || document.visibilityState !== 'visible') return;
      var now = Date.now();
      if (now - lastAct < 60000 || now < busyUntil) { E.store.addSeconds(1); if (E.onTick) E.onTick(); }
    }, 1000);
  }
  function setActive(v) { active = !!v; if (v) { ping(); start(); } }

  /* ---- Nút luyện nói ---- */
  function wordsView(result) {
    var box = h('div.words');
    result.words.forEach(function (w) {
      var cls = w.status === 'ok' ? 'ok' : (w.status === 'near' ? 'near' : 'miss');
      box.appendChild(h('span.w.' + cls, { title: w.heard ? 'Máy nghe: ' + w.heard : 'Chưa nghe thấy' }, w.ref));
    });
    return box;
  }

  /* ref: câu mẫu; opts: {lang, onScore(result), label} */
  function mic(ref, opts) {
    opts = opts || {};
    var out = h('div.mic-out', { 'aria-live': 'polite' });
    var btn = h('button.btn.mic', { type: 'button' }, icon('mic', 18), h('span', { text: opts.label || 'Nói thử' }));
    var wrap = h('div.mic-wrap', btn, out);
    var session = null;

    function setState(listening) {
      btn.classList.toggle('on', listening);
      btn.querySelector('span').textContent = listening ? 'Đang nghe... bấm để dừng' : (opts.label || 'Nói thử');
    }
    function fallback() {
      E.ui.clear(out);
      out.appendChild(h('div.note', icon('alert', 16), h('span', { text: 'Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy bấm "Nghe mẫu", đọc to theo, rồi tự đánh giá.' })));
      var row = h('div.row');
      [['Đọc tốt', 90, 'good'], ['Cần luyện thêm', 40, 'poor']].forEach(function (x) {
        row.appendChild(h('button.btn.sm', { type: 'button', onclick: function () {
          E.ui.clear(out);
          out.appendChild(h('div.result.' + (x[2] === 'good' ? 'tot' : 'chua'), x[0] === 'Đọc tốt' ? 'Đã ghi nhận: bạn tự đánh giá đọc tốt.' : 'Đã ghi nhận: hãy luyện thêm vài lần.'));
          if (opts.onScore) opts.onScore({ score: x[1], self: true, verdict: x[2] === 'good' ? 'tot' : 'chua', words: [], extra: [] });
        } }, x[0]));
      });
      out.appendChild(row);
    }

    btn.addEventListener('click', function () {
      ping();
      if (session) { session.stop(); return; }
      if (!E.speech.recSupported()) { fallback(); return; }
      E.ui.clear(out);
      var heardFinal = false;
      busy(20000);
      setState(true);
      session = E.speech.listen(E.store.state().settings.accent, {
        onstart: function () { out.appendChild(h('div.interim', { text: '...' })); },
        oninterim: function (t) { var el = out.querySelector('.interim'); if (el) el.textContent = t; },
        onfinal: function (alts) {
          heardFinal = true;
          var r = E.match.best(ref, alts);
          E.ui.clear(out);
          var label = r.verdict === 'tot' ? 'Rất tốt' : (r.verdict === 'kha' ? 'Khá tốt' : 'Cần luyện thêm');
          out.appendChild(h('div.result.' + r.verdict, h('b', { text: r.score + '/100' }), ' ', label));
          out.appendChild(wordsView(r));
          out.appendChild(h('div.heard', 'Máy nghe được: ', h('i', { text: r.heard || '(không có)' })));
          var hs = E.match.hints(r);
          if (hs.length) { var ul = h('ul.hints'); hs.slice(0, 4).forEach(function (x) { ul.appendChild(h('li', { text: x })); }); out.appendChild(ul); }
          if (opts.onScore) opts.onScore(r);
        },
        onerror: function (code, msg) {
          if (code === 'unsupported') { fallback(); return; }
          if (msg) { E.ui.clear(out); out.appendChild(h('div.note.warn', icon('alert', 16), h('span', { text: msg }))); }
        },
        onend: function () {
          session = null; setState(false);
          if (!heardFinal && !out.querySelector('.note, .result')) { E.ui.clear(out); out.appendChild(h('div.note', icon('alert', 16), h('span', { text: 'Chưa nghe thấy gì. Hãy thử lại và nói rõ hơn.' }))); }
        }
      });
    });
    wrap.stop = function () { if (session) session.stop(); };
    return wrap;
  }

  /* Nút nghe mẫu */
  function say(text, label, opts) {
    opts = opts || {};
    var st = E.store.state().settings;
    var b = h('button.btn.sm' + (opts.cls ? '.' + opts.cls : ''), { type: 'button', 'aria-label': 'Nghe: ' + text }, icon('volume', 16), h('span', { text: label || 'Nghe mẫu' }));
    b.addEventListener('click', function () {
      ping();
      if (!E.speech.ttsSupported()) { E.ui.toast('Trình duyệt này chưa hỗ trợ phát âm.', 'warn'); return; }
      busy(Math.min(30000, text.length * 120));
      b.classList.add('on');
      E.speech.speak(text, { lang: opts.lang || st.accent, rate: opts.rate || st.rate }).then(function (r) {
        b.classList.remove('on');
        if (!r.ok && r.reason !== 'cancelled' && r.reason !== 'interrupted' && r.reason !== 'canceled') E.ui.toast('Không phát được âm thanh. Hãy kiểm tra âm lượng hoặc giọng đọc của thiết bị.', 'warn');
      });
    });
    return b;
  }

  E.practice = { mic: mic, say: say, setActive: setActive, ping: ping, busy: busy, wordsView: wordsView };
})(self);
