/* Lưu tiến độ trên máy (localStorage, có dự phòng bộ nhớ tạm). Mọi truy cập đều bọc try/catch. */
(function (root) {
  'use strict';
  var KEY = 'e9:state:v1';
  var sm2 = root.E9.sm2;

  function defaults() {
    return {
      v: 1,
      cards: {},            // id -> thẻ SM-2
      settings: { theme: 'auto', accent: 'en-US', rate: 0.95, dailyMin: 10, newPerDay: 10, levels: [], remindTime: '19:30' },
      secByDay: {},         // số ngày -> giây đã học
      daily: {},            // số ngày -> {newCount, reviewed}
      placement: null,      // {level, total, date}
      listen: {},           // id bài nghe -> điểm tốt nhất (0-3)
      roles: {},            // id kịch bản -> {best: 'good'|'ok'|'bad', plays}
      spoken: {},           // id mẫu câu -> điểm nói tốt nhất
      created: null
    };
  }

  var mem = null, persistent = true, timer = null;

  function read() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { persistent = false; }
    return null;
  }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  /* Trộn dữ liệu đã lưu vào mặc định; sai kiểu (null, mảng, chuỗi...) thì giữ mặc định. */
  function merge(base, saved) {
    if (!isObj(saved)) return base;
    Object.keys(base).forEach(function (k) {
      var v = saved[k];
      if (v === undefined || v === null) return;
      if (isObj(base[k])) {
        if (!isObj(v)) return;
        base[k] = Object.assign({}, base[k], v);
      } else if (base[k] === null) {
        if (isObj(v) || (k === 'created' && typeof v === 'number')) base[k] = v;
      } else if (typeof base[k] === typeof v && Array.isArray(base[k]) === Array.isArray(v)) base[k] = v;
    });
    // thẻ hỏng thì bỏ
    Object.keys(base.cards).forEach(function (id) {
      var c = base.cards[id];
      if (!isObj(c) || ['ef', 'interval', 'reps', 'due'].some(function (f) { return typeof c[f] !== 'number' || !isFinite(c[f]); })) delete base.cards[id];
    });
    var st = base.settings;
    if (!Array.isArray(st.levels)) st.levels = [];
    st.levels = st.levels.filter(function (l) { return ['A2', 'B1', 'B2', 'C1'].indexOf(l) >= 0; });
    if (!(st.dailyMin > 0)) st.dailyMin = 10;
    if (!(st.newPerDay >= 0)) st.newPerDay = 10;
    if (!(st.rate > 0 && st.rate <= 3)) st.rate = 0.95;
    if (['auto', 'light', 'dark'].indexOf(st.theme) < 0) st.theme = 'auto';
    if (['en-US', 'en-GB'].indexOf(st.accent) < 0) st.accent = 'en-US';
    if (!/^\d{1,2}:\d{2}$/.test(st.remindTime)) st.remindTime = '19:30';
    return base;
  }
  function load() {
    mem = merge(defaults(), read());
    if (!mem.created) mem.created = sm2.dayNumber();
    return mem;
  }
  function flush() {
    clearTimeout(timer); timer = null;
    try { root.localStorage.setItem(KEY, JSON.stringify(mem)); persistent = true; } catch (e) { persistent = false; }
  }
  function save() { if (timer) return; timer = setTimeout(flush, 300); }

  function state() { return mem || load(); }
  function today() { return sm2.dayNumber(); }
  function daily(day) {
    var s = state(); day = day == null ? today() : day;
    if (!s.daily[day]) s.daily[day] = { newCount: 0, reviewed: 0 };
    return s.daily[day];
  }
  function addSeconds(n) {
    var s = state(), d = today();
    s.secByDay[d] = (s.secByDay[d] || 0) + n;
    save();
  }
  function reset() {
    mem = defaults(); mem.created = today();
    try { root.localStorage.removeItem(KEY); } catch (e) {}
    flush();
    return mem;
  }
  function exportJson() { return JSON.stringify(state(), null, 2); }

  function counts(words) {
    var s = state(), t = today(), c = { total: words.length, fresh: 0, due: 0, learning: 0, mature: 0 };
    words.forEach(function (w) {
      var card = s.cards[w.id];
      if (!card) c.fresh++;
      else {
        if (card.due <= t) c.due++;
        if (sm2.isMature(card)) c.mature++; else c.learning++;
      }
    });
    return c;
  }

  var api = { defaults: defaults, merge: merge, state: state, load: load, save: save, flush: flush, today: today, daily: daily, addSeconds: addSeconds, reset: reset, exportJson: exportJson, counts: counts, isPersistent: function () { return persistent; }, KEY: KEY };
  root.E9.store = api;
  root.addEventListener('pagehide', flush);
  root.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
})(self);
