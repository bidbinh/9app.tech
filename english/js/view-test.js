/* Bài kiểm tra trình độ 20 câu và lộ trình đề xuất. */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon, P = E.placement;

  function hashStr(s) { var x = 5; for (var i = 0; i < s.length; i++) x = (x * 37 + s.charCodeAt(i)) | 0; return x; }

  E.views.test = function (el) {
    var s = E.store.state(), qs = P.questions, i = 0, answers = {};
    var stage = h('div.stage');
    el.appendChild(h('a.back', { href: '#/' }, icon('back', 18), 'Hôm nay'));
    el.appendChild(h('h1', 'Kiểm tra trình độ'));
    var head = h('div.sess-head', h('small.muted', { id: 'tcount' }), h('div.pbar.thin', h('i')));
    el.appendChild(head); el.appendChild(stage);

    function intro() {
      E.ui.clear(stage);
      stage.appendChild(h('section.card',
        h('p', 'Bài gồm 20 câu: từ vựng, ngữ pháp và đọc hiểu, từ dễ đến khó. Làm trong khoảng 8 phút, không giới hạn thời gian từng câu.'),
        h('ul.plain', h('li', 'Không tra từ điển, không đoán bừa: chọn "Chưa chắc" nếu bạn không biết.'), h('li', 'Kết quả chỉ để gợi ý lộ trình, bạn có thể làm lại bất cứ lúc nào.')),
        h('button.btn.primary.wide', { type: 'button', id: 'start', onclick: show }, 'Bắt đầu')));
      head.hidden = true;
    }

    function show() {
      head.hidden = false;
      var q = qs[i];
      document.getElementById('tcount').textContent = 'Câu ' + (i + 1) + ' / ' + qs.length + ' - ' + q.type + ' - ' + q.level;
      head.querySelector('.pbar i').style.width = Math.round(100 * i / qs.length) + '%';
      E.ui.clear(stage);
      var order = E.shuffle.shuffle([0, 1, 2, 3], E.shuffle.mulberry32(hashStr(q.id)));
      var fs = h('fieldset.q', h('legend', q.q.split('\n').map(function (ln, k) { return h(k ? 'div.rd' : 'b', { text: ln }); })));
      order.forEach(function (oi, pos) {
        fs.appendChild(h('button.choice.opt-btn', { type: 'button', 'data-oi': String(oi), onclick: function () { answers[q.id] = oi; next(); } }, h('span.cs', { text: q.options[oi] })));
      });
      fs.appendChild(h('button.btn.sm.ghost', { type: 'button', onclick: function () { answers[q.id] = -1; next(); } }, 'Chưa chắc'));
      stage.appendChild(h('section.card', fs));
    }
    function next() { E.practice.ping(); i++; if (i >= qs.length) done(); else show(); }

    function done() {
      var r = P.estimate(answers, qs);
      s.placement = { level: r.level, total: r.total, date: E.store.today(), per: r.per };
      var plan = P.plans[r.level];
      E.store.save();
      E.ui.clear(stage); head.hidden = true;
      var bars = h('div.lvbars');
      P.order.forEach(function (l) {
        var p = r.per[l], row = h('div.lvrow', h('b', { text: l }), h('div.pbar', h('i')), h('span', { text: p.right + '/' + p.total }));
        row.querySelector('i').style.width = Math.round(100 * p.right / p.total) + '%';
        bars.appendChild(row);
      });
      var review = h('div.stack');
      qs.forEach(function (q) {
        if (answers[q.id] === q.a) return;
        review.appendChild(h('div.card.rv', h('b', { text: q.q.split('\n').slice(-1)[0] }), h('div.good', { text: 'Đáp án: ' + q.options[q.a] }), h('p.muted', { text: q.why })));
      });
      stage.appendChild(h('section.card.center',
        h('div.lvl-badge.xl', { text: r.level }),
        h('h2', { text: 'Trình độ ước lượng: ' + plan.title }),
        h('p.muted', { text: 'Đúng ' + r.total + '/' + qs.length + ' câu.' }),
        bars));
      stage.appendChild(h('section.card', h('h2', 'Lộ trình đề xuất'), h('p', { text: plan.text }),
        h('p.muted', { text: 'Mức từ vựng nên học: ' + plan.levels.join(', ') + '. Chủ đề nên bắt đầu: ' + plan.topics.map(function (id) { return E.topics.filter(function (t) { return t.id === id; })[0].name; }).join(', ') + '.' }),
        h('div.row',
          h('button.btn.primary', { type: 'button', id: 'apply', onclick: function () { s.settings.levels = plan.levels.slice(); E.store.save(); E.ui.toast('Đã áp dụng: chỉ học từ mức ' + plan.levels.join(', ') + '.'); E.app.go('#/learn'); } }, 'Áp dụng lộ trình'),
          h('a.btn', { href: '#/' }, 'Để sau'))));
      if (review.children.length) { stage.appendChild(h('h2.sec', 'Các câu cần xem lại')); stage.appendChild(review); }
    }

    intro();
  };
})(self);
