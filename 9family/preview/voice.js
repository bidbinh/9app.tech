/* 9family: nút giọng nói dùng chung (F9.voiceButton). Máy trạng thái rõ ràng:
   rảnh (mic) -> ĐANG NGHE (nút đỏ, biểu tượng dừng, sóng âm, hiện chữ tạm thời, chạm lần nữa để dừng, tự dừng khi im lặng)
   -> ĐANG XỬ LÝ (khóa nút, vòng xoay, chữ "Đang xử lý…", có Hủy và thời gian chờ tối đa) -> KẾT QUẢ (gọi onResult, người dùng soát rồi mới lưu)
   -> lỗi thân thiện (không có quyền micro, không nghe thấy gì, không hỗ trợ, mất mạng). Có aria-live cho từng trạng thái.

   Dùng:
     var v = F9.voiceButton({
       lang: 'vi-VN',                       // mặc định vi-VN
       label: 'Nói để thêm món',            // nhãn đọc cho người dùng màn hình đọc
       hint: 'Ví dụ: hai bó rau muống',     // gợi ý hiện khi đang nghe (tùy chọn)
       parse: function (text) { return Promise|value },   // tùy chọn: phân tích lời nói (chạy ở bước ĐANG XỬ LÝ; có thể gọi máy chủ hoặc AI)
       onResult: function (text, parsed) {},              // KẾT QUẢ: lời nhận dạng + kết quả parse; KHÔNG tự lưu gì ở đây, hãy mở màn soát
       onState: function (state, info) {},                // 'idle' | 'listening' | 'processing' | 'error'
       silenceMs: 2500, maxListenMs: 20000, processMs: 15000
     });
     parent.appendChild(v.button); parent.appendChild(v.panel);   // nút và khung trạng thái (đặt ở nơi vừa mắt)
     v.supported; v.state(); v.cancel();
   Trình duyệt không có Web Speech API: nút vẫn hiện, chạm vào sẽ giải thích và gợi ý dùng micro của bàn phím. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var NS = 'http://www.w3.org/2000/svg';

  function svg(paths, size) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 24); s.setAttribute('height', size || 24); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    paths.forEach(function (d) {
      var p;
      if (d.charAt(0) === 'R') { p = document.createElementNS(NS, 'rect'); var a = d.slice(1).split(','); p.setAttribute('x', a[0]); p.setAttribute('y', a[1]); p.setAttribute('width', a[2]); p.setAttribute('height', a[3]); p.setAttribute('rx', a[4] || 2); p.setAttribute('fill', 'currentColor'); }
      else { p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); }
      s.appendChild(p);
    });
    return s;
  }
  var ICON = {
    mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
    stop: ['R7,7,10,10,2'],
  };

  var MSG = {
    'not-allowed': 'Chưa được phép dùng micro. Hãy cho phép micro cho trang này (biểu tượng ổ khóa cạnh địa chỉ), hoặc gõ vào ô.',
    'service-not-allowed': 'Chưa được phép dùng micro. Hãy cho phép micro cho trang này, hoặc gõ vào ô.',
    'audio-capture': 'Không tìm thấy micro trên máy này.',
    'no-speech': 'Không nghe thấy gì. Hãy bấm lại và nói gần micro hơn.',
    network: 'Cần có mạng để nhận dạng giọng nói. Bạn có thể gõ vào ô.',
    'language-not-supported': 'Máy này chưa nhận dạng được tiếng Việt bằng giọng nói. Hãy gõ vào ô.',
    unsupported: 'Trình duyệt này chưa hỗ trợ nhập bằng giọng nói. Bạn hãy gõ, hoặc bấm biểu tượng micro trên bàn phím điện thoại.',
    other: 'Chưa nghe rõ. Bạn thử lại hoặc gõ vào ô nhé.',
  };

  F9.voiceButton = function (opts) {
    opts = opts || {};
    var lang = opts.lang || 'vi-VN';
    var silenceMs = opts.silenceMs || 2500, maxListenMs = opts.maxListenMs || 20000, processMs = opts.processMs || 15000;
    var label = opts.label || 'Nói để nhập';
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var state = 'idle';
    var rec = null, finalText = '', interim = '', timers = [], token = 0;

    var icoWrap = h('span', { class: 'voice-ico' });
    var button = h('button', { type: 'button', class: 'voice-btn', 'aria-label': label, 'data-voice': 'idle' }, [icoWrap]);
    var statusText = h('div', { class: 'voice-msg', 'data-k-skip': '1' });
    var interimEl = h('div', { class: 'voice-interim hidden' });
    var cancelBtn = h('button', { type: 'button', class: 'btn ghost xs hidden', text: 'Hủy' });
    var retryBtn = h('button', { type: 'button', class: 'btn ghost xs hidden', text: 'Thử lại' });
    var wave = h('div', { class: 'voice-wave hidden', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i'), h('i')]);
    var spin = h('span', { class: 'voice-spin hidden', 'aria-hidden': 'true' });
    var panel = h('div', { class: 'voice-panel hidden', role: 'status', 'aria-live': 'polite' }, [
      h('div', { class: 'voice-row' }, [wave, spin, statusText]), interimEl, h('div', { class: 'voice-actions' }, [cancelBtn, retryBtn]),
    ]);

    var silenceTimer = null;
    function clearTimers() { timers.forEach(clearTimeout); timers = []; clearTimeout(silenceTimer); }
    function icon(name) { F9.clear(icoWrap); icoWrap.appendChild(svg(ICON[name], 24)); }
    icon('mic');

    function set(next, msg, info) {
      state = next;
      button.setAttribute('data-voice', next);
      button.className = 'voice-btn' + (next === 'listening' ? ' listening' : next === 'processing' ? ' busy' : next === 'error' ? ' err' : '');
      button.disabled = next === 'processing';
      button.setAttribute('aria-pressed', next === 'listening' ? 'true' : 'false');
      button.setAttribute('aria-label', next === 'listening' ? 'Dừng nghe' : next === 'processing' ? 'Đang xử lý' : label);
      icon(next === 'listening' ? 'stop' : 'mic');
      panel.classList.toggle('hidden', next === 'idle' || (next === 'error' && !msg));
      panel.className = 'voice-panel' + (next === 'idle' ? ' hidden' : '') + (next === 'error' ? ' err' : '');
      wave.classList.toggle('hidden', next !== 'listening');
      spin.classList.toggle('hidden', next !== 'processing');
      interimEl.classList.toggle('hidden', next !== 'listening' || !interim);
      cancelBtn.classList.toggle('hidden', next !== 'processing');
      retryBtn.classList.toggle('hidden', next !== 'error' || !SR);
      statusText.textContent = msg || '';
      if (opts.onState) { try { opts.onState(next, info || {}); } catch (e) { /* bỏ qua */ } }
    }

    function showInterim() {
      var t = (finalText + ' ' + interim).replace(/\s+/g, ' ').trim();
      interimEl.textContent = t ? '“' + t + '”' : '';
      interimEl.classList.toggle('hidden', !t);
    }

    function fail(code) { clearTimers(); abortRec(); set('error', MSG[code] || MSG.other, { code: code }); }
    function abortRec() { token++; if (rec) { try { rec.onresult = rec.onerror = rec.onend = null; rec.abort(); } catch (e) { /* đã dừng */ } rec = null; } }

    function finish(my) {
      if (my !== token) return;
      clearTimers();
      var text = (finalText + ' ' + interim).replace(/\s+/g, ' ').trim();
      rec = null;
      if (!text) { fail('no-speech'); return; }
      set('processing', 'Đang xử lý…', { text: text });
      var mine = ++token;
      var timeout = setTimeout(function () { if (mine === token) { token++; set('error', 'Xử lý lâu quá. Bạn thử lại, hoặc gõ vào ô nhé.', { code: 'timeout', text: text }); } }, processMs);
      timers.push(timeout);
      Promise.resolve().then(function () { return opts.parse ? opts.parse(text) : null; }).then(function (parsed) {
        if (mine !== token) return;
        clearTimeout(timeout); token++;
        set('idle', '', { text: text });
        if (opts.onResult) opts.onResult(text, parsed);
      }, function (e) {
        if (mine !== token) return;
        clearTimeout(timeout); token++;
        // phân tích lỗi: vẫn trả lời nói gốc để người dùng sửa tay, không mất lời vừa nói
        set('idle', '', { text: text });
        if (opts.onResult) opts.onResult(text, null, e);
      });
    }

    function start() {
      if (!SR) { set('error', MSG.unsupported, { code: 'unsupported' }); return; }
      finalText = ''; interim = '';
      var my = ++token;
      try {
        rec = new SR();
        rec.lang = lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
        rec.onresult = function (ev) {
          if (my !== token) return;
          interim = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var r = ev.results[i]; var t = r[0] ? r[0].transcript : '';
            if (r.isFinal) finalText += (finalText ? ' ' : '') + t; else interim += t;
          }
          showInterim();
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(function () { if (rec && my === token) { try { rec.stop(); } catch (e) { finish(my); } } }, silenceMs);
        };
        rec.onerror = function (ev) { if (my !== token) return; var c = ev && ev.error; if (c === 'aborted') return; fail(c || 'other'); };
        rec.onend = function () { if (my === token && state === 'listening') finish(my); };
        rec.start();
      } catch (e) { fail('other'); return; }
      set('listening', 'Đang nghe… hãy nói' + (opts.hint ? '. ' + opts.hint : ''), {});
      interimEl.textContent = ''; interimEl.classList.add('hidden');
      timers.push(setTimeout(function () { if (rec && my === token) { try { rec.stop(); } catch (e) { finish(my); } } }, maxListenMs));
    }

    button.addEventListener('click', function () {
      if (state === 'listening') { var my = token; try { rec.stop(); } catch (e) { finish(my); } return; }
      if (state === 'processing') return;
      start();
    });
    cancelBtn.addEventListener('click', function () { clearTimers(); token++; set('idle', ''); });
    retryBtn.addEventListener('click', start);

    return {
      button: button, panel: panel, supported: !!SR,
      state: function () { return state; },
      cancel: function () { clearTimers(); abortRec(); set('idle', ''); },
    };
  };
})();
