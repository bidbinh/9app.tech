/* Giao tiếp công sở: mẫu câu, email mẫu có điền, đóng vai hội thoại có nhánh. */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon;
  var REG = { f: 'Trang trọng', n: 'Thông thường', c: 'Thân mật' };

  function hub(el) {
    var s = E.store.state();
    el.appendChild(h('h1', 'Giao tiếp công sở'));
    el.appendChild(h('p.muted', 'Mẫu câu dùng ngay, email có khung điền sẵn và đóng vai hội thoại để luyện nói.'));

    el.appendChild(h('h2.sec', 'Mẫu câu theo tình huống'));
    var grid = h('div.grid2');
    E.phrasesData.cats.forEach(function (c) {
      var n = E.phrasesData.phrases.filter(function (p) { return p.cat === c.id; }).length;
      grid.appendChild(h('a.card.tile', { href: '#/talk/c/' + c.id }, h('span.ti', icon(c.icon, 22)), h('b', { text: c.name }), h('small.muted', { text: n + ' câu' })));
    });
    el.appendChild(grid);

    el.appendChild(h('h2.sec', 'Viết email'));
    el.appendChild(h('a.card.row-card', { href: '#/talk/email' }, h('span.ti', icon('mail', 22)), h('div', h('b', { text: E.templates.list.length + ' khung email mẫu' }), h('small.muted', { text: 'Điền thông tin của bạn, xem bản hoàn chỉnh và sao chép.' })), icon('next', 18)));

    el.appendChild(h('h2.sec', 'Đóng vai hội thoại'));
    var list = h('div.stack');
    E.dialogs.list.forEach(function (d) {
      var r = s.roles[d.id];
      list.appendChild(h('a.card.row-card', { href: '#/talk/role/' + d.id },
        h('span.ti', icon(d.icon, 22)),
        h('div', h('b', { text: d.title }), h('small.muted', { text: d.level + (r ? ' - kết quả tốt nhất: ' + ({ good: 'Tốt', ok: 'Ổn', bad: 'Cần cải thiện' })[r.best] : '') })),
        icon('next', 18)));
    });
    el.appendChild(list);
  }

  /* ---------- Mẫu câu ---------- */
  function phrases(el, catId) {
    var cat = E.phrasesData.cats.filter(function (c) { return c.id === catId; })[0];
    if (!cat) return hub(el);
    var s = E.store.state(), dl = E.store.daily();
    el.appendChild(h('a.back', { href: '#/talk' }, icon('back', 18), 'Giao tiếp'));
    el.appendChild(h('h1', cat.name));
    el.appendChild(h('p.muted', 'Bấm "Nghe mẫu" để nghe, rồi "Nói thử" để máy chấm độ khớp. Thẻ bên dưới hiện nghĩa tiếng Việt.'));
    var list = h('div.stack');
    E.phrasesData.phrases.filter(function (p) { return p.cat === catId; }).forEach(function (p) {
      var best = s.spoken[p.id];
      var micNode = E.practice.mic(p.en, { onScore: function (r) {
        if (r.score >= 60) dl.phrase = true;
        if (!best || r.score > best) { s.spoken[p.id] = r.score; }
        E.store.save();
      } });
      list.appendChild(h('div.card.phrase',
        h('div.ptop', h('span.badge.soft', { text: REG[p.reg] }), best != null ? h('span.badge.ok', { text: 'Nói tốt nhất ' + best }) : null),
        h('div.en', { text: p.en }),
        h('div.vi', { text: p.vi }),
        p.note ? h('div.tip', icon('bulb', 16), h('span', { text: p.note })) : null,
        h('div.row', E.practice.say(p.en, 'Nghe mẫu')),
        micNode));
    });
    el.appendChild(list);
  }

  /* ---------- Email mẫu ---------- */
  function emailList(el) {
    el.appendChild(h('a.back', { href: '#/talk' }, icon('back', 18), 'Giao tiếp'));
    el.appendChild(h('h1', 'Email mẫu'));
    var list = h('div.stack');
    E.templates.list.forEach(function (t) {
      list.appendChild(h('a.card.row-card', { href: '#/talk/email/' + t.id }, h('span.ti', icon('mail', 22)), h('div', h('b', { text: t.title }), h('small.muted', { text: t.vi })), icon('next', 18)));
    });
    el.appendChild(list);
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'offscreen';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
  }

  function emailEdit(el, id) {
    var t = E.templates.list.filter(function (x) { return x.id === id; })[0];
    if (!t) return emailList(el);
    el.appendChild(h('a.back', { href: '#/talk/email' }, icon('back', 18), 'Email mẫu'));
    el.appendChild(h('h1', t.title));
    el.appendChild(h('p.muted', { text: t.vi + ' Sửa các ô bên dưới, bản email bên dưới sẽ cập nhật ngay.' }));
    var values = {};
    var form = h('form.card.form', { onsubmit: function (e) { e.preventDefault(); } });
    var subj = h('div.mail-subj'), body = h('pre.mail-body');
    function draw() {
      var r = E.templates.render(t, values);
      subj.textContent = r.subject; body.textContent = r.body;
    }
    t.fields.forEach(function (f, i) {
      values[f.k] = f.def;
      var inp = h('input', { type: 'text', id: 'f-' + f.k, value: f.def, placeholder: f.ph, autocomplete: 'off', 'aria-label': f.label });
      inp.addEventListener('input', function () { values[f.k] = inp.value; draw(); E.practice.ping(); });
      form.appendChild(h('label.field', { 'for': 'f-' + f.k }, h('span', { text: f.label }), inp));
    });
    el.appendChild(form);
    draw();
    var out = h('section.card.mail', h('div.mail-label', 'Tiêu đề'), subj, h('div.mail-label', 'Nội dung'), body);
    el.appendChild(out);
    var msg = h('div.muted', { 'aria-live': 'polite' });
    el.appendChild(h('div.row',
      h('button.btn.primary', { type: 'button', onclick: function () {
        var r = E.templates.render(t, values);
        copyText('Subject: ' + r.subject + '\n\n' + r.body).then(function (ok) { E.ui.toast(ok ? 'Đã sao chép email.' : 'Không sao chép được, hãy bôi đen và copy thủ công.', ok ? '' : 'warn'); });
      } }, icon('copy', 18), h('span', { text: 'Sao chép email' })),
      h('button.btn', { type: 'button', onclick: function () {
        var r = E.templates.render(t, values);
        E.practice.busy(60000);
        E.speech.speak(r.body.replace(/\[(\w+)\]/g, '$1'), { lang: E.store.state().settings.accent, rate: E.store.state().settings.rate }).then(function (x) { if (!x.ok && x.reason === 'unsupported') E.ui.toast('Trình duyệt này chưa hỗ trợ phát âm.', 'warn'); });
      } }, icon('volume', 18), h('span', { text: 'Nghe cả email' })),
      h('button.btn', { type: 'button', onclick: function () { t.fields.forEach(function (f) { values[f.k] = f.def; document.getElementById('f-' + f.k).value = f.def; }); draw(); } }, icon('refresh', 18), h('span', { text: 'Đặt lại' }))));
    el.appendChild(msg);
    el.appendChild(h('p.muted.small', 'Mẹo: bạn có thể đọc to email này rồi dùng mục "Mẫu câu" để luyện từng câu.'));
    return function () { E.speech.stop(); };
  }

  /* ---------- Đóng vai ---------- */
  function roleList(el) {
    el.appendChild(h('a.back', { href: '#/talk' }, icon('back', 18), 'Giao tiếp'));
    el.appendChild(h('h1', 'Đóng vai hội thoại'));
    el.appendChild(h('p.muted', 'Chọn câu trả lời của bạn ở mỗi lượt, đọc to câu đó, rồi xem phản hồi. Mỗi lựa chọn dẫn đến một nhánh khác nhau.'));
    var s = E.store.state(), list = h('div.stack');
    E.dialogs.list.forEach(function (d) {
      var r = s.roles[d.id];
      list.appendChild(h('a.card.row-card', { href: '#/talk/role/' + d.id }, h('span.ti', icon(d.icon, 22)),
        h('div', h('b', { text: d.title }), h('small.muted', { text: d.level + ' - ' + d.setting })), icon('next', 18)));
    });
    el.appendChild(list);
  }

  function hashStr(s) { var x = 7; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x; }

  function role(el, id) {
    var d = E.dialogs.list.filter(function (x) { return x.id === id; })[0];
    if (!d) return roleList(el);
    var s = E.store.state(), st = s.settings, dl = E.store.daily();
    el.appendChild(h('a.back', { href: '#/talk/role' }, icon('back', 18), 'Đóng vai'));
    el.appendChild(h('h1', d.title));
    var stage = h('div.stage');
    var log = h('div.chatlog', { 'aria-live': 'polite' });
    el.appendChild(h('section.card.setting', icon('bulb', 18), h('span', { text: d.setting })));
    el.appendChild(log);
    el.appendChild(stage);
    var path = []; // lưu tone để tính kết quả

    function bubble(who, text, vi, me) {
      var b = h('div.bubble' + (me ? '.me' : ''), h('div.who', { text: who }), h('div.say', { text: text }), vi ? h('div.vi', { text: vi }) : null);
      log.appendChild(b); b.scrollIntoView && b.scrollIntoView({ block: 'nearest' });
      return b;
    }

    function showNode(nid) {
      var n = d.nodes[nid];
      E.ui.clear(stage);
      bubble(n.who, n.text, n.vi, false);
      var sayBtn = E.practice.say(n.text, 'Nghe lại');
      E.practice.busy(15000);
      E.speech.speak(n.text, { lang: st.accent, rate: st.rate, slot: 1, pitch: 0.95 });
      var order = n.choices.map(function (c, i) { return i; });
      order = E.shuffle.shuffle(order, E.shuffle.mulberry32(hashStr(d.id + nid)));
      var wrap = h('section.card.choices', h('div.row.between', h('b', { text: 'Bạn nói gì?' }), sayBtn));
      order.forEach(function (i) {
        var c = n.choices[i];
        wrap.appendChild(h('button.choice', { type: 'button', onclick: function () { choose(n, c); } },
          h('span.cs', { text: c.say }), h('small.muted', { text: c.vi })));
      });
      stage.appendChild(wrap);
    }

    function choose(n, c) {
      E.practice.ping(); E.speech.stop();
      path.push(c.tone);
      E.ui.clear(stage);
      bubble('Bạn', c.say, c.vi, true);
      var tone = { best: ['Rất phù hợp', 'tot'], ok: ['Chấp nhận được', 'kha'], poor: ['Chưa tốt', 'chua'] }[c.tone];
      var fb = h('section.card.fb.' + tone[1], h('div.fbt', h('b', { text: tone[0] })), h('p', { text: c.fb }));
      stage.appendChild(fb);
      stage.appendChild(h('div.card', h('b', { text: 'Luyện nói câu bạn vừa chọn' }), h('div.row', E.practice.say(c.say, 'Nghe mẫu')), E.practice.mic(c.say, {})));
      var go = h('button.btn.primary.wide', { type: 'button', onclick: function () { if (c.end) finish(c.end); else showNode(c.next); } }, c.end ? 'Xem kết quả' : 'Tiếp tục');
      stage.appendChild(go);
      go.scrollIntoView && go.scrollIntoView({ block: 'nearest' });
    }

    function finish(end) {
      E.ui.clear(stage);
      var result = E.dialogs.grade(path); // tính từ cả đường đi, không chỉ lựa chọn cuối
      var summary = result === end.result ? end.summary : E.dialogs.summary[result];
      var rec = s.roles[d.id] || { best: null, plays: 0 };
      var rank = { bad: 0, ok: 1, good: 2 };
      rec.plays++;
      if (rec.best == null || rank[result] > rank[rec.best]) rec.best = result;
      s.roles[d.id] = rec; dl.role = true; E.store.save();
      var title = { good: 'Rất tốt!', ok: 'Khá ổn', bad: 'Cần cải thiện' }[result];
      stage.appendChild(h('section.card.center.end.' + result,
        icon(result === 'good' ? 'trophy' : (result === 'ok' ? 'check' : 'refresh'), 36),
        h('h2', title), h('p', { text: summary }),
        h('div.muted', { text: 'Số lựa chọn tốt nhất: ' + path.filter(function (x) { return x === 'best'; }).length + '/' + path.length }),
        h('div.row', h('button.btn.primary', { type: 'button', onclick: function () { E.app.render(); } }, 'Thử nhánh khác'), h('a.btn', { href: '#/talk/role' }, 'Chọn tình huống khác'))));
    }

    showNode(d.start);
    return function () { E.speech.stop(); };
  }

  E.views.talk = function (el, parts) {
    if (parts[0] === 'c') return phrases(el, parts[1]);
    if (parts[0] === 'email') return parts[1] ? emailEdit(el, parts[1]) : emailList(el);
    if (parts[0] === 'role') return parts[1] ? role(el, parts[1]) : roleList(el);
    return hub(el);
  };
})(self);
