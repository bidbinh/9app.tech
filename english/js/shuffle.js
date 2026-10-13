/* Trộn bài + dựng hàng đợi học. Có hạt giống để kiểm thử lặp lại được. */
(function (root) {
  'use strict';
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* Fisher–Yates, trả mảng mới */
  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /* Dựng hàng đợi: thẻ đến hạn trước (trộn), rồi thẻ mới (giữ thứ tự dễ -> khó trong chủ đề, nhưng cắt theo giới hạn).
   * words: [{id, level}], cards: {id: card}, opts: {today, newLimit, reviewLimit, topic, levels, rnd} */
  function buildQueue(words, cards, opts) {
    opts = opts || {};
    var today = opts.today, rnd = opts.rnd || Math.random;
    var pool = words.filter(function (w) {
      if (opts.topic && w.topic !== opts.topic) return false;
      if (opts.levels && opts.levels.length && opts.levels.indexOf(w.level) < 0) return false;
      return true;
    });
    var due = [], fresh = [];
    pool.forEach(function (w) {
      var c = cards[w.id];
      if (!c) fresh.push(w);
      else if (c.due <= today) due.push(w);
    });
    due.sort(function (a, b) { return cards[a.id].due - cards[b.id].due; });
    due = shuffle(due.slice(0, opts.reviewLimit || 100), rnd);
    var levelRank = { A2: 0, B1: 1, B2: 2, C1: 3 };
    fresh = shuffle(fresh, rnd).sort(function (a, b) { return levelRank[a.level] - levelRank[b.level]; }); // dễ trước, trong cùng mức thì ngẫu nhiên
    fresh = fresh.slice(0, opts.newLimit == null ? 10 : opts.newLimit);
    return { due: due, fresh: fresh, queue: due.concat(shuffle(fresh, rnd)) };
  }
  var api = { mulberry32: mulberry32, shuffle: shuffle, buildQueue: buildQueue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).shuffle = api;
})(typeof self !== 'undefined' ? self : globalThis);
