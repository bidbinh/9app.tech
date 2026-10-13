/* Phát âm (speechSynthesis) và nhận giọng nói (Web Speech API), có dự phòng khi trình duyệt không hỗ trợ. */
(function (root) {
  'use strict';
  var synth = root.speechSynthesis || null;
  var Rec = root.SpeechRecognition || root.webkitSpeechRecognition || null;
  var ttsOK = !!(synth && root.SpeechSynthesisUtterance);
  var recOK = !!Rec;
  var voices = [];
  var keep = []; // giữ tham chiếu utterance để tránh bị thu gom khi đang đọc (lỗi của Chrome)
  var token = 0;

  function loadVoices() { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } }
  if (ttsOK) {
    loadVoices();
    try { synth.addEventListener('voiceschanged', loadVoices); } catch (e) { synth.onvoiceschanged = loadVoices; }
  }

  /* Chọn giọng: trùng ngôn ngữ (en-US/en-GB) trước, rồi giọng tiếng Anh bất kỳ. slot để chọn giọng khác nhau cho nhiều người nói. */
  function pickVoice(lang, slot) {
    if (!voices.length) loadVoices();
    var en = voices.filter(function (v) { return /^en[-_]/i.test(v.lang) || v.lang === 'en'; });
    var exact = en.filter(function (v) { return v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase(); });
    var pool = exact.length ? exact : en;
    if (!pool.length) return null;
    return pool[(slot || 0) % pool.length];
  }

  var ABBR = /(?:^|\s)(?:mr|mrs|ms|dr|prof|st|vs|no|etc|e\.g|i\.e|a\.m|p\.m|inc|ltd|co)\.$/i;
  /* Tách thành câu để đọc từng đoạn ngắn (Chrome cắt đoạn quá dài); không tách sau viết tắt như "Mr." hay "a.m.". */
  function sentences(text) {
    var raw = String(text).replace(/\s+/g, ' ').trim();
    if (!raw) return [];
    var pieces = [], start = 0, out = [], k; // tách sau [.!?] + dấu cách (không dùng lookbehind để chạy được trên Safari cũ)
    for (k = 1; k < raw.length; k++) {
      if (raw.charAt(k) === ' ' && /[.!?]/.test(raw.charAt(k - 1))) { pieces.push(raw.slice(start, k)); start = k + 1; }
    }
    pieces.push(raw.slice(start));
    pieces.forEach(function (p) {
      if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += ' ' + p; else out.push(p);
    });
    var res = [];
    out.forEach(function (p) {
      while (p.length > 220) { // đoạn quá dài: tách ở dấu phẩy gần giữa
        var cut = p.lastIndexOf(', ', 200);
        if (cut < 60) cut = p.indexOf(' ', 160);
        if (cut < 0) break;
        res.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim();
      }
      if (p) res.push(p);
    });
    return res;
  }

  /* Đọc một đoạn. opts: {lang, rate, pitch, slot}. Trả Promise (luôn resolve, kèm cờ ok). */
  function speak(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!ttsOK) { resolve({ ok: false, reason: 'unsupported' }); return; }
      var my = ++token;
      try { synth.cancel(); } catch (e) {}
      var parts = sentences(text), i = 0;
      function next() {
        if (my !== token) { resolve({ ok: false, reason: 'cancelled' }); return; }
        if (i >= parts.length) { resolve({ ok: true }); return; }
        var u = new root.SpeechSynthesisUtterance(parts[i++]);
        u.lang = opts.lang || 'en-US';
        var v = pickVoice(u.lang, opts.slot);
        if (v) u.voice = v;
        u.rate = opts.rate || 0.95;
        u.pitch = opts.pitch || 1;
        keep.push(u); if (keep.length > 8) keep.shift();
        var done = false;
        var finish = function () { if (done) return; done = true; clearTimeout(guard); next(); };
        u.onend = finish;
        u.onerror = function (e) { if (done) return; done = true; clearTimeout(guard); resolve({ ok: false, reason: (e && e.error) || 'error' }); };
        // Chrome đôi khi không bắn onend; dự phòng theo độ dài câu
        var guard = setTimeout(finish, Math.max(4000, parts[i - 1].length * 140 / (u.rate || 1)));
        try { synth.speak(u); } catch (e) { done = true; resolve({ ok: false, reason: 'error' }); }
      }
      next();
    });
  }
  function stopSpeaking() { token++; try { if (synth) synth.cancel(); } catch (e) {} }

  /* Nhận giọng một lượt. cb: {onstart, oninterim(text), onfinal(alternatives[]), onerror(code, message), onend()} */
  var ERR = {
    'not-allowed': 'Trình duyệt chưa được cấp quyền micro. Hãy cho phép micro trong cài đặt trang web rồi thử lại.',
    'service-not-allowed': 'Trình duyệt không cho dùng nhận giọng nói ở đây.',
    'no-speech': 'Chưa nghe thấy tiếng nói. Hãy nói gần micro hơn và thử lại.',
    'audio-capture': 'Không tìm thấy micro. Hãy kiểm tra thiết bị.',
    'network': 'Nhận giọng cần kết nối mạng ở trình duyệt này. Hãy kiểm tra mạng và thử lại.',
    'language-not-supported': 'Trình duyệt chưa hỗ trợ nhận giọng tiếng Anh này.',
    'aborted': ''
  };
  function listen(lang, cb) {
    cb = cb || {};
    if (!recOK) { if (cb.onerror) cb.onerror('unsupported', 'Trình duyệt này chưa hỗ trợ nhận giọng nói.'); return { stop: function () {} }; }
    stopSpeaking();
    var r = new Rec(), got = false, ended = false;
    r.lang = lang || 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 5;
    r.onstart = function () { if (cb.onstart) cb.onstart(); };
    r.onresult = function (e) {
      var res = e.results[e.results.length - 1];
      if (!res) return;
      if (res.isFinal) {
        got = true;
        var alts = [];
        for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
        if (cb.onfinal) cb.onfinal(alts);
      } else if (cb.oninterim) cb.oninterim(res[0].transcript);
    };
    r.onerror = function (e) { var c = e && e.error || 'error'; if (c !== 'aborted' && cb.onerror) cb.onerror(c, ERR[c] != null ? ERR[c] : 'Không nhận giọng được (' + c + ').'); };
    r.onend = function () { if (ended) return; ended = true; if (cb.onend) cb.onend(got); };
    try { r.start(); } catch (e) { if (cb.onerror) cb.onerror('error', 'Không bật được micro.'); }
    return { stop: function () { try { r.stop(); } catch (e) {} } };
  }

  var api = {
    ttsSupported: function () { return ttsOK; },
    recSupported: function () { return recOK; },
    hasVoice: function (lang) { return !!pickVoice(lang || 'en-US', 0); },
    voiceCount: function () { if (!voices.length) loadVoices(); return voices.length; },
    speak: speak, stop: stopSpeaking, listen: listen, sentences: sentences
  };
  (root.E9 = root.E9 || {}).speech = api;
})(self);
