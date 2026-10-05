/* Giọng nói: nhập bằng Web Speech API (vi-VN) và đọc trả lời bằng speechSynthesis. Có dự phòng khi trình duyệt không hỗ trợ. */
(function () {
  'use strict';
  var O = (window.Osin = window.Osin || {});
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  O.voice = {
    canListen: !!SR,
    canSpeak: !!(window.speechSynthesis && window.SpeechSynthesisUtterance),
  };

  // Nhập giọng nói: chữ nhận được điền vào ô nhập để người dùng sửa trước khi gửi (không tự gửi).
  var rec = null; var listening = false;
  O.voice.isListening = function () { return listening; };
  O.voice.stopListening = function () { if (rec && listening) { try { rec.stop(); } catch (e) { /* bỏ qua */ } } };
  O.voice.listen = function (handlers) {
    // handlers: { onstart, onresult(text, final), onend, onerror(message) }
    if (!SR) { handlers.onerror('Trình duyệt này chưa hỗ trợ nhập bằng giọng nói. Bạn dùng micro trên bàn phím nhé.'); return; }
    if (listening) { O.voice.stopListening(); return; }
    rec = new SR();
    rec.lang = 'vi-VN'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    var gotText = false;
    rec.onstart = function () { listening = true; handlers.onstart(); };
    rec.onresult = function (ev) {
      var text = ''; var fin = false;
      for (var i = 0; i < ev.results.length; i++) { text += ev.results[i][0].transcript; if (ev.results[i].isFinal) fin = true; }
      if (text) gotText = true;
      handlers.onresult(text, fin);
    };
    rec.onerror = function (ev) {
      var map = {
        'not-allowed': 'Bạn chưa cho phép dùng micro. Hãy cho phép micro trong cài đặt trình duyệt.',
        'service-not-allowed': 'Trình duyệt không cho dùng nhận dạng giọng nói ở đây.',
        'no-speech': 'Mình chưa nghe thấy gì, bạn thử nói lại nhé.',
        'audio-capture': 'Không tìm thấy micro trên thiết bị này.',
        'network': 'Nhận dạng giọng nói cần mạng, bạn kiểm tra kết nối nhé.',
        'language-not-supported': 'Thiết bị chưa hỗ trợ nhận dạng tiếng Việt.',
      };
      if (ev.error !== 'aborted') handlers.onerror(map[ev.error] || 'Không nhận dạng được giọng nói, bạn thử lại nhé.');
    };
    rec.onend = function () { listening = false; handlers.onend(gotText); };
    try { rec.start(); } catch (e) { listening = false; handlers.onerror('Chưa bật được micro, bạn thử lại nhé.'); }
  };

  // Đọc to
  var speaking = false;
  O.voice.isSpeaking = function () { return speaking; };
  O.voice.stopSpeaking = function () { if (O.voice.canSpeak) { window.speechSynthesis.cancel(); speaking = false; } };
  O.voice.speak = function (text, onend) {
    if (!O.voice.canSpeak) return;
    window.speechSynthesis.cancel();
    var u = new window.SpeechSynthesisUtterance(String(text).slice(0, 1500));
    u.lang = 'vi-VN';
    var voices = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < voices.length; i++) { if (/^vi/i.test(voices[i].lang)) { u.voice = voices[i]; break; } }
    u.onend = u.onerror = function () { speaking = false; if (onend) onend(); };
    speaking = true;
    window.speechSynthesis.speak(u);
  };
})();
