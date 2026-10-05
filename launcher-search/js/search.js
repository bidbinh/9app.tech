/* 9app: bộ tìm chức năng (chấm điểm, xếp hạng, không dấu, chịu gõ sai nhẹ).
 * Hàm thuần, không đụng DOM; chạy được trong trình duyệt (window.NineSearch) và Node (require).
 * ES5 để WebView ô tô cũ vẫn chạy. */
(function (root) {
  'use strict';

  function fold(value) {
    var s = String(value == null ? '' : value);
    try { s = s.normalize('NFD'); } catch (e) { /* trình duyệt rất cũ */ }
    return s.replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
  }
  // Tách từ: chữ và số, giữ nguyên "9", "7"... ; "9Fin" thành "9fin".
  function tokens(value) {
    var m = fold(value).match(/[a-z0-9]+/g);
    return m || [];
  }
  function norm(value) { return tokens(value).join(' '); }

  // Khoảng cách sửa chuỗi (Damerau-Levenshtein bản giới hạn, có cắt sớm theo ngưỡng).
  function osa(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = [], cur = [], i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }

  // Kiểm tra và chuẩn hóa một mục chức năng do app khai báo. Trả null nếu hỏng.
  function normalizeFeature(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 120) return null;
    var path = typeof raw.path === 'string' ? raw.path.trim() : '';
    if (path.length > 300) return null;
    var kws = [];
    if (Array.isArray(raw.keywords)) {
      for (var i = 0; i < raw.keywords.length && kws.length < 80; i++) {
        if (typeof raw.keywords[i] === 'string' && raw.keywords[i].trim()) kws.push(raw.keywords[i].trim().slice(0, 80));
      }
    }
    var blurb = typeof raw.blurb === 'string' ? raw.blurb.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
    return { name: name, keywords: kws, path: path, blurb: blurb };
  }

  // Ghép đường dẫn của chức năng vào địa chỉ app; chỉ nhận cùng nguồn gốc (chặn javascript:, trang lạ).
  function resolveHref(appHref, path, baseUrl) {
    try {
      var base = new URL(appHref, baseUrl);
      if (!path) return base.href;
      var u = new URL(path, base);
      if (u.origin !== base.origin) return null;
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.href;
    } catch (e) {
      return null;
    }
  }

  function depthOf(path) {
    var hash = String(path || '').split('#')[1] || '';
    return hash.replace(/\?.*$/, '').split('/').filter(Boolean).length;
  }

  // Tên app thành các từ, thêm bản viết liền ("vannien") để gõ liền hay cách đều ra.
  function appNameTokens(name) {
    var t = tokens(name), joined = t.join('');
    if (t.length > 1) t.push(joined);
    return t;
  }

  // Dựng bản ghi tìm kiếm cho một chức năng.
  function makeDoc(app, feature, href, categoryLabel) {
    var kw = [], kwT = [];
    for (var i = 0; i < feature.keywords.length; i++) {
      var k = norm(feature.keywords[i]);
      if (k && kw.indexOf(k) < 0) { kw.push(k); kwT.push(k.split(' ')); }
    }
    var nameF = norm(feature.name);
    return {
      key: app.id + '|' + feature.path + '|' + nameF,
      appId: app.id,
      appName: app.name,
      appNameT: appNameTokens(app.name),
      appBlurbT: tokens(app.blurb || ''),
      appIcon: app.icon,
      category: categoryLabel || '',
      categoryT: tokens(categoryLabel || ''),
      name: feature.name,
      nameF: nameF,
      nameT: nameF.split(' '),
      kw: kw,
      kwT: kwT,
      blurb: feature.blurb,
      blurbF: norm(feature.blurb),
      blurbT: tokens(feature.blurb),
      href: href,
      depth: depthOf(feature.path)
    };
  }

  function tokenIndexStart(list, w) {
    for (var i = 0; i < list.length; i++) if (list[i].indexOf(w) === 0) return i;
    return -1;
  }
  function appNameHas(list, w) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].indexOf(w) === 0 || (w.length >= 2 && list[i].indexOf(w) > 0)) return true;
    }
    return false;
  }
  function hasToken(list, w) { return list.indexOf(w) >= 0; }

  // Điểm một từ gõ vào cho một chức năng (0 = không khớp). `alt` là bản sửa lỗi gõ.
  function wordScore(d, w, alt) {
    var best = 0, s, i;
    var short = w.length < 2; // một ký tự (số, chữ) chỉ khớp đầu từ
    // Tên chức năng
    if (hasToken(d.nameT, w)) s = 110;
    else if (tokenIndexStart(d.nameT, w) >= 0) s = 100;
    else if (!short && d.nameF.indexOf(w) >= 0) s = 55;
    else s = 0;
    if (alt) s = s ? s * 0.55 : s;
    if (s > best) best = s;
    // Từ khóa
    for (i = 0; i < d.kw.length && best < 95; i++) {
      var k = d.kw[i];
      if (k === w) s = 88;
      else if (hasToken(d.kwT[i], w)) s = 85;
      else if (tokenIndexStart(d.kwT[i], w) >= 0) s = 80;
      else if (!short && k.indexOf(w) >= 0) s = 45;
      else s = 0;
      if (alt) s = s * 0.55;
      if (s > best) best = s;
    }
    // Mô tả
    if (best < 30 && !alt) {
      if (hasToken(d.blurbT, w) || tokenIndexStart(d.blurbT, w) >= 0) s = 28;
      else if (w.length >= 3 && d.blurbF.indexOf(w) >= 0) s = 14;
      else s = 0;
      if (s > best) best = s;
    }
    // Tên app và nhóm: để gõ "vannien hoa" hay "bang lai" vẫn gom đúng app
    if (best < 24) {
      if (appNameHas(d.appNameT, w)) s = 24;
      else if (tokenIndexStart(d.categoryT, w) >= 0) s = 12;
      else if (!alt && tokenIndexStart(d.appBlurbT, w) >= 0) s = 10;
      else s = 0;
      if (alt) s = s * 0.55;
      if (s > best) best = s;
    }
    return best;
  }

  function Engine() {
    this.docsByApp = {};
    this.docs = [];
    this.vocab = [];
    this._dirty = false;
  }
  Engine.prototype.setDocs = function (appId, docs) {
    this.docsByApp[appId] = docs;
    this._dirty = true;
  };
  Engine.prototype._rebuild = function () {
    if (!this._dirty) return;
    var all = [], seen = {}, vocab = [], vseen = {}, id, i, j;
    for (id in this.docsByApp) {
      if (!Object.prototype.hasOwnProperty.call(this.docsByApp, id)) continue;
      var list = this.docsByApp[id];
      for (i = 0; i < list.length; i++) {
        if (seen[list[i].key]) continue;
        seen[list[i].key] = true;
        list[i].ord = all.length;
        all.push(list[i]);
        var parts = list[i].nameT.concat(list[i].appNameT);
        for (j = 0; j < list[i].kwT.length; j++) parts = parts.concat(list[i].kwT[j]);
        for (j = 0; j < parts.length; j++) {
          if (parts[j].length >= 3 && !vseen[parts[j]]) { vseen[parts[j]] = true; vocab.push(parts[j]); }
        }
      }
    }
    this.docs = all;
    this.vocab = vocab;
    this._dirty = false;
  };
  Engine.prototype.size = function () { this._rebuild(); return this.docs.length; };

  // Từ chưa có trong kho từ (không là đầu của từ nào) thì thử tìm từ gần giống.
  Engine.prototype._alts = function (w) {
    if (w.length < 3) return [];
    var v = this.vocab, i, found = [];
    for (i = 0; i < v.length; i++) if (v[i].indexOf(w) === 0) return [];
    var max = w.length >= 7 ? 2 : 1;
    for (i = 0; i < v.length; i++) {
      var t = v[i];
      if (w.length === 3 && (t.charAt(0) !== w.charAt(0) || t.length !== 3 || t.split('').sort().join('') !== w.split('').sort().join(''))) continue;
      var d = osa(w, t, max);
      if (d > max && t.length > w.length) { var dp = osa(w, t.slice(0, w.length), 1); if (dp <= 1) d = dp; } // đang gõ dở có lỗi
      if (d <= max) found.push({ t: t, d: d });
    }
    found.sort(function (a, b) { return a.d - b.d; });
    var out = [];
    for (i = 0; i < found.length && i < 6; i++) out.push(found[i].t);
    return out;
  };

  Engine.prototype.search = function (query, opts) {
    opts = opts || {};
    this._rebuild();
    var words = tokens(query);
    if (!words.length) return { items: [], near: false, words: words };
    var phrase = words.join(' ');
    var alts = [], i;
    for (i = 0; i < words.length; i++) alts.push(opts.noTypo ? [] : this._alts(words[i]));
    var boost = opts.boost || null;

    function run(requireAll) {
      var out = [];
      for (var n = 0; n < this.docs.length; n++) {
        var d = this.docs[n], total = 0, matched = 0, typo = false;
        for (var w = 0; w < words.length; w++) {
          var s = wordScore(d, words[w], false);
          if (!s && alts[w].length) {
            for (var a = 0; a < alts[w].length; a++) {
              var s2 = wordScore(d, alts[w][a], true);
              if (s2 > s) { s = s2; typo = true; }
            }
          }
          if (s && (requireAll || s >= 50)) { matched++; total += s; } else if (requireAll) { total = -1; break; }
        }
        if (total <= 0 || (requireAll && matched < words.length)) continue;
        if (!requireAll) total = total * (matched / words.length) * 0.5;
        if (requireAll) {
          if (d.nameF === phrase) total += 70;
          else if (words.length > 1 && (' ' + d.nameF + ' ').indexOf(' ' + phrase) >= 0) total += 45;
          else if (d.nameF.indexOf(phrase) >= 0) total += 25;
          var kwHit = 0;
          for (var k = 0; k < d.kw.length; k++) {
            if (d.kw[k] === phrase) { kwHit = 25; break; }
            if (words.length > 1 && d.kw[k].indexOf(phrase) >= 0 && kwHit < 12) kwHit = 12;
          }
          total += kwHit;
          // Cả cụm gõ nằm trong tên/mô tả của chính app này: chức năng của app đó lên trước app khác
          var ctx = 0;
          for (var c = 0; c < words.length; c++) {
            if (appNameHas(d.appNameT, words[c]) || tokenIndexStart(d.appBlurbT, words[c]) >= 0 || tokenIndexStart(d.categoryT, words[c]) >= 0) ctx++;
          }
          if (words.length > 1 && ctx === words.length) total += 30;
          // Tên ngắn, sát từ gõ thì lên trước (mục gốc trước mục con)
          var inName = true;
          for (var q = 0; q < words.length; q++) if (d.nameF.indexOf(words[q]) < 0) { inName = false; break; }
          if (inName) total += 20 * Math.min(1, phrase.length / Math.max(1, d.nameF.length)) + (d.nameF.indexOf(phrase) === 0 ? 15 : 0);
          total += Math.max(0, 6 - 2 * d.depth);
          if (typo) total -= 8;
        }
        if (boost) total += Math.min(12, boost(d.key) || 0);
        out.push({ doc: d, score: total, typo: typo });
      }
      out.sort(function (x, y) {
        if (y.score !== x.score) return y.score - x.score;
        return x.doc.ord - y.doc.ord;
      });
      return out;
    }

    var items = run.call(this, true);
    if (items.length || words.length < 2) return { items: items, near: false, words: words };
    // Không khớp đủ mọi từ: lấy mục khớp một phần, đánh dấu "gần giống"
    return { items: run.call(this, false).slice(0, 6), near: true, words: words };
  };

  // Gợi ý câu gõ gần giống khi không ra kết quả.
  Engine.prototype.suggest = function (query, max) {
    this._rebuild();
    max = max || 3;
    var words = tokens(query);
    var v = this.vocab, out = [], i, j;
    if (!words.length) return out;
    var options = [];
    for (i = 0; i < words.length; i++) {
      var w = words[i], cand = [w];
      if (w.length >= 3) {
        var lim = Math.max(1, Math.min(3, Math.ceil(w.length * 0.4)));
        var scored = [];
        var known = false;
        for (j = 0; j < v.length; j++) if (v[j].indexOf(w) === 0) { known = true; break; }
        if (!known) {
          for (j = 0; j < v.length; j++) {
            var d = osa(w, v[j], lim);
            if (d > lim && v[j].length > w.length) { var dp = osa(w, v[j].slice(0, w.length), 1); if (dp <= 1) d = dp; }
            if (d <= lim) scored.push({ t: v[j], d: d });
          }
          scored.sort(function (a, b) { return a.d - b.d; });
          cand = [];
          for (j = 0; j < scored.length && j < 3; j++) cand.push(scored[j].t);
          if (!cand.length) cand = [w];
        }
      }
      options.push(cand);
    }
    // Ghép tối đa vài tổ hợp, giữ tổ hợp có kết quả
    var combos = [[]];
    for (i = 0; i < options.length; i++) {
      var next = [];
      for (var c = 0; c < combos.length; c++) for (j = 0; j < options[i].length; j++) {
        if (next.length < 30) next.push(combos[c].concat([options[i][j]]));
      }
      combos = next;
    }
    for (i = 0; i < combos.length && out.length < max; i++) {
      var q = combos[i].join(' ');
      if (q === words.join(' ')) continue;
      var r = this.search(q);
      if (r.items.length && !r.near) out.push({ query: q, count: r.items.length });
    }
    return out;
  };

  var api = {
    fold: fold, tokens: tokens, norm: norm, osa: osa,
    normalizeFeature: normalizeFeature, resolveHref: resolveHref,
    makeDoc: makeDoc, wordScore: wordScore, Engine: Engine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NineSearch = api;
})(typeof self !== 'undefined' ? self : this);
