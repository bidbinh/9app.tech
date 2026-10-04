/* Đọc dữ liệu từ vựng (các tệp data/vocab-*.js) thành danh sách từ có id ổn định. */
(function (root) {
  'use strict';
  var FIELDS = ['word', 'pos', 'ipa', 'vi', 'ex', 'level', 'note'];

  function slug(w) {
    return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function parseTopic(t) {
    var out = [];
    t.raw.split('\n').forEach(function (line, i) {
      line = line.trim();
      if (!line) return;
      var p = line.split('|');
      var o = {};
      FIELDS.forEach(function (f, k) { o[f] = (p[k] || '').trim(); });
      o.topic = t.id;
      o.id = t.id + '-' + slug(o.word);
      o._line = i;
      out.push(o);
    });
    return out;
  }

  function parse(topics) {
    var all = [];
    topics.forEach(function (t) { all = all.concat(parseTopic(t)); });
    return all;
  }

  var api = { parse: parse, parseTopic: parseTopic, slug: slug, FIELDS: FIELDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    var E = root.E9 = root.E9 || {};
    E.vocabLib = api;
    E.vocab = parse(E.topics || []);
  }
})(typeof self !== 'undefined' ? self : globalThis);
