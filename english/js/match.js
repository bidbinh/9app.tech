/* Chấm gần đúng câu nói so với câu mẫu (kết quả của Web Speech API là văn bản).
 * Căn hàng từ bằng quy hoạch động; từ gần giống (phát âm chưa chuẩn) được tính một phần điểm. */
(function (root) {
  'use strict';

  var CONTR = {
    "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
    "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "there's": 'there is', "what's": 'what is',
    "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
    "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "he'll": 'he will', "she'll": 'she will', "it'll": 'it will',
    "i'd": 'i would', "you'd": 'you would', "we'd": 'we would', "they'd": 'they would',
    "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', "cannot": 'can not', "couldn't": 'could not',
    "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not', "isn't": 'is not', "aren't": 'are not',
    "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
    "let's": 'let us', "ok": 'okay'
  };

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = { 2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety' };
  function numWords(n) { // 0..99 -> "twenty five" (hai từ riêng, khớp cách nhận giọng hay trả về)
    if (n < 20) return ONES[n];
    return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  }
  function tokens(text) {
    var s = String(text == null ? '' : text).toLowerCase().replace(/[‘’ʼ`]/g, "'");
    s = s.replace(/\b([ap])\.\s?m\b\.?/g, '$1m').replace(/-/g, ' ');  // 3 p.m. = 3 pm; twenty-five = twenty five
    s = s.replace(/[^a-z0-9'\s]/g, ' ').replace(/(^|\s)'+|'+(?=\s|$)/g, ' ');
    var out = [];
    s.split(/\s+/).forEach(function (w) {
      if (!w) return;
      if (CONTR[w]) { out.push.apply(out, CONTR[w].split(' ')); return; }
      if (/^\d{1,2}$/.test(w)) { out.push.apply(out, numWords(+w).split(' ')); return; }
      out.push(w);
    });
    return out;
  }

  function lev(a, b) {
    var m = a.length, n = b.length, i, j;
    if (!m) return n;
    if (!n) return m;
    var prev = new Array(n + 1), cur = new Array(n + 1);
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }
  function similarity(a, b) {
    if (a === b) return 1;
    var L = Math.max(a.length, b.length);
    return L ? 1 - lev(a, b) / L : 1;
  }
  // "Gần": từ đủ dài và giống nhau từ 70% (vd. "schedule" ~ "shedule"; "colleague" ~ "college" thì không đạt)
  function isNear(a, b) { return Math.min(a.length, b.length) >= 3 && similarity(a, b) >= 0.7; }

  function compare(ref, heard) {
    var R = tokens(ref), H = tokens(heard);
    var n = R.length, m = H.length, i, j;
    if (!n) return { score: 0, verdict: 'chua', words: [], extra: H, heard: H.join(' ') };
    // thay thế hẳn từ khác tốn 1.5 (rẻ hơn bỏ + chèn = 2) để từ sai vẫn thẳng hàng với từ mẫu
    var cost = function (r, h) { return r === h ? 0 : (isNear(r, h) ? 0.4 : 1.5); };
    var D = [], B = [];
    for (i = 0; i <= n; i++) { D[i] = []; B[i] = []; }
    D[0][0] = 0;
    for (i = 1; i <= n; i++) { D[i][0] = i; B[i][0] = 'd'; }
    for (j = 1; j <= m; j++) { D[0][j] = j; B[0][j] = 'i'; }
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) {
      var s = D[i - 1][j - 1] + cost(R[i - 1], H[j - 1]), d = D[i - 1][j] + 1, ins = D[i][j - 1] + 1;
      if (s <= d && s <= ins) { D[i][j] = s; B[i][j] = 's'; }
      else if (d <= ins) { D[i][j] = d; B[i][j] = 'd'; }
      else { D[i][j] = ins; B[i][j] = 'i'; }
    }
    var words = new Array(n), extra = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      var b = B[i][j];
      if (b === 's') {
        var r = R[i - 1], h = H[j - 1];
        words[i - 1] = r === h ? { ref: r, heard: h, status: 'ok' } : (isNear(r, h) ? { ref: r, heard: h, status: 'near' } : { ref: r, heard: h, status: 'miss' });
        i--; j--;
      } else if (b === 'd') { words[i - 1] = { ref: R[i - 1], heard: null, status: 'miss' }; i--; }
      else { extra.unshift(H[j - 1]); j--; }
    }
    var pts = 0;
    words.forEach(function (w) { pts += w.status === 'ok' ? 1 : (w.status === 'near' ? 0.5 : 0); });
    var score = Math.round(100 * pts / n);
    if (extra.length) score = Math.max(0, score - Math.min(30, extra.length * 5)); // nói thừa: mỗi từ thừa trừ 5 điểm
    var miss = 0, near = 0;
    words.forEach(function (w) { if (w.status === 'miss') miss++; else if (w.status === 'near') near++; });
    // "Rất tốt" chỉ khi không sai/thiếu từ nào, nhiều nhất một từ gần đúng và không nói thừa quá nhiều
    var verdict = (score >= 90 && miss === 0 && near <= 1 && extra.length <= 1) ? 'tot' : (score >= 60 && miss <= Math.ceil(n / 4) ? 'kha' : 'chua');
    return { score: score, verdict: verdict, words: words, extra: extra, heard: H.join(' ') };
  }

  /* Nhận nhiều giả thuyết từ bộ nhận giọng, lấy kết quả tốt nhất */
  function best(ref, alternatives) {
    var top = null;
    (alternatives || []).forEach(function (a) { var r = compare(ref, a); if (!top || r.score > top.score) top = r; });
    return top || compare(ref, '');
  }

  function hints(result) {
    var out = [];
    result.words.forEach(function (w) {
      if (w.status === 'near') out.push('"' + w.ref + '": máy nghe thành "' + w.heard + '". Phát âm gần đúng, hãy nói rõ hơn âm cuối và trọng âm.');
      else if (w.status === 'miss' && w.heard) out.push('"' + w.ref + '": máy nghe thành "' + w.heard + '".');
      else if (w.status === 'miss') out.push('"' + w.ref + '": máy chưa nghe thấy từ này.');
    });
    return out;
  }

  var api = { tokens: tokens, similarity: similarity, lev: lev, isNear: isNear, compare: compare, best: best, hints: hints };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).match = api;
})(typeof self !== 'undefined' ? self : globalThis);
