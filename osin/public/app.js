/* Khởi động Osin: đăng nhập, đồng ý, lịch sử, ô nhập (gõ và giọng nói), cài đặt, quyền riêng tư, định tuyến #/cai-dat và #/rieng-tu. */
(function () {
  'use strict';
  var O = window.Osin; var h = O.h;
  var $ = function (id) { return document.getElementById(id); };
  var me = null;
  var SUGGESTIONS = ['Hôm nay con đi học gì?', 'Thêm sữa vào danh sách đi chợ', 'Đổi 3 chỉ vàng ra gram', 'Hôm nay âm lịch ngày mấy?', 'Mở văn khấn'];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* trình duyệt chặn lưu trữ */ } }

  /* ---------- màn hình chưa đăng nhập ---------- */
  function showIntro() {
    $('composer').hidden = true; $('chips').hidden = true; $('foot').hidden = true; $('btn-menu').hidden = true;
    var list = $('list'); O.clear(list);
    list.appendChild(h('div', { class: 'intro' },
      h('img', { src: 'icon.svg', alt: '', width: 88, height: 88 }),
      h('h1', { text: 'Osin, trợ lý của 9app' }),
      h('p', { text: 'Hỏi lịch con đi học, thêm đồ vào danh sách đi chợ, đổi lịch âm dương, tính toán, tìm chức năng. Bạn gõ hoặc nói, Osin lo.' }),
      h('p', { text: 'Bạn cần đăng nhập tài khoản 9app để Osin xem đúng dữ liệu của bạn.' }),
      h('a', { class: 'btn primary', href: 'auth/login' }, 'Đăng nhập tài khoản 9app')));
  }

  /* ---------- đồng ý xử lý dữ liệu ---------- */
  function askConsent(after) {
    var sh = O.sheet(function (el, api) {
      el.appendChild(h('h2', { text: 'Trước khi bắt đầu' }));
      el.appendChild(h('p', { text: 'Để trả lời, Osin gửi nội dung bạn trò chuyện (và kết quả tra cứu từ các app) tới Google Gemini để xử lý.' }));
      el.appendChild(h('ul', null,
        h('li', { text: me.ai.noTrainConfirmed ? 'Osin không dùng nội dung của bạn để huấn luyện mô hình.' : 'Chúng tôi chưa xác nhận được điều khoản dùng dữ liệu của nhà cung cấp AI; nội dung có thể được họ xử lý theo điều khoản của họ.' }),
        h('li', { text: 'Nhập bằng giọng nói trên Chrome gửi âm thanh của bạn tới Google để nhận dạng.' }),
        h('li', { text: 'Dữ liệu trong các app (có thể gồm thông tin của trẻ em, sức khỏe) được gửi tới nhà cung cấp AI ở nước ngoài khi bạn nhờ Osin tra cứu. Chỉ dùng khi bạn và người trong gia đình đồng ý.' }),
        h('li', { text: 'Lịch sử trò chuyện chỉ lưu cho riêng bạn, ' + me.limits.historyDays + ' ngày, bạn xóa được bất cứ lúc nào.' }),
        h('li', { text: 'Đừng nhập mật khẩu, mã OTP hay số thẻ. Việc liên quan tới tiền Osin không làm thay bạn.' }),
        h('li', { text: 'Mọi việc thêm, sửa, xóa đều cần bạn bấm Xác nhận.' })));
      el.appendChild(h('div', { class: 'stack' },
        h('button', { class: 'btn primary', type: 'button', id: 'btn-consent', onclick: function () {
          O.api('POST', 'consent', {}).then(function () { me.needConsent = false; api.close(true); if (after) after(); }, function (e) { O.toast(e.message); });
        } }, 'Đồng ý và bắt đầu'),
        h('a', { class: 'btn', href: document.querySelector('.back').getAttribute('href') }, 'Để sau, về 9app')));
    }, { modal: true, label: 'Đồng ý xử lý dữ liệu', onclose: function () {} });
    sh.modal = true;
  }

  /* ---------- cài đặt và quyền riêng tư ---------- */
  function privacyBlock(el, withTitle) {
    var ext = me.ai && me.ai.external;
    if (withTitle) el.appendChild(h('h3', { text: 'Quyền riêng tư' }));
    el.appendChild(h('ul', null,
      h('li', { text: ext ? 'Nội dung trò chuyện được gửi tới Google Gemini để xử lý. ' + (me.ai.noTrainConfirmed ? 'Osin không dùng nội dung để huấn luyện.' : 'Chưa xác nhận được điều khoản huấn luyện của nhà cung cấp AI.') + ' Nhập bằng giọng nói trên Chrome gửi âm thanh tới Google.' : 'AI chưa bật; lệnh đơn giản chạy ngay trên máy chủ Osin, không gửi ra ngoài.' }),
      h('li', { text: 'Osin chỉ xem dữ liệu app của bạn khi trả lời, và chỉ phần quyền của bạn cho phép. Osin không lưu lại kết quả tra cứu.' }),
      h('li', { text: 'Lịch sử lưu ' + me.limits.historyDays + ' ngày, chỉ bạn thấy. Mật khẩu, mã OTP, số thẻ trong tin nhắn bị che trước khi lưu.' }),
      h('li', { text: 'Thêm, sửa, xóa luôn cần bạn bấm Xác nhận. Việc nhạy cảm (tiền, xóa hàng loạt, gửi tin cho người khác) Osin không làm.' })));
  }
  function confirmDanger(title, text, label, fn) {
    O.sheet(function (el, api) {
      el.appendChild(h('h2', { text: title }));
      el.appendChild(h('p', { text: text }));
      el.appendChild(h('div', { class: 'stack' },
        h('button', { class: 'btn danger', type: 'button', 'data-act': 'danger-ok', onclick: function () { fn(api); } }, label),
        h('button', { class: 'btn', type: 'button', onclick: function () { api.close(); } }, 'Không xóa')));
    }, { label: title });
  }
  function openSettings(focus) {
    if (!me) return;
    O.sheet(function (el, api) {
      el.appendChild(h('button', { class: 'tiny sheet-x', type: 'button', onclick: function () { api.close(); } }, 'Đóng'));
      el.appendChild(h('h2', { text: focus === 'privacy' ? 'Quyền riêng tư' : 'Cài đặt Osin' }));
      if (focus !== 'privacy') {
        var sw = h('button', { class: 'switch', type: 'button', role: 'switch', id: 'sw-tts', 'aria-checked': String(O.chatState.tts), 'aria-labelledby': 'lb-tts',
          onclick: function () { O.chatState.tts = !O.chatState.tts; lsSet('osin.tts', O.chatState.tts ? '1' : '0'); sw.setAttribute('aria-checked', String(O.chatState.tts)); if (!O.chatState.tts) O.voice.stopSpeaking(); } });
        if (O.voice.canSpeak) el.appendChild(h('div', { class: 'set-row' }, h('label', { id: 'lb-tts', text: 'Đọc to câu trả lời' }), sw));
        else el.appendChild(h('p', { class: 'muted', text: 'Trình duyệt này chưa hỗ trợ đọc to.' }));
        if (me.families && me.families.length > 1) {
          var sel = h('select', { id: 'sel-family', 'aria-labelledby': 'lb-fam' });
          sel.appendChild(h('option', { value: '', text: 'Không chọn' }));
          me.families.forEach(function (f) { var o = h('option', { value: f.id, text: f.name }); if (f.id === me.familyId) o.selected = true; sel.appendChild(o); });
          sel.addEventListener('change', function () {
            O.api('POST', 'prefs', { familyId: sel.value || null }).then(function (r) { me.familyId = r.familyId; O.toast('Đã đổi gia đình đang dùng'); }, function (e) { O.toast(e.message); });
          });
          el.appendChild(h('div', { class: 'set-row' }, h('label', { id: 'lb-fam', text: 'Gia đình đang dùng' }), sel));
        } else if (me.families && me.families.length === 1) el.appendChild(h('p', { class: 'muted', text: 'Gia đình đang dùng: ' + me.families[0].name }));
        el.appendChild(h('h3', { text: 'Các app đã kết nối' }));
        if (!me.apps.length) el.appendChild(h('p', { class: 'muted', text: 'Chưa có app nào kết nối. Osin vẫn dùng được các công cụ có sẵn: giờ giấc, âm lịch, tính toán, đổi đơn vị, tìm chức năng.' }));
        me.apps.forEach(function (a) { el.appendChild(h('div', { class: 'app-st' }, h('span', { class: 'dot' + (a.ok ? '' : ' off') }), a.name + (a.ok ? '' : ' (đang không phản hồi)'))); });
      }
      privacyBlock(el, focus !== 'privacy');
      el.appendChild(h('div', { class: 'stack' },
        h('a', { class: 'btn', href: 'api/export', download: 'osin-du-lieu-cua-toi.json' }, 'Tải dữ liệu của tôi'),
        h('button', { class: 'btn', type: 'button', id: 'btn-logout', onclick: function () {
          O.api('POST', 'logout', {}).then(function () { location.href = location.pathname; }, function (e) { O.toast(e.message); });
        } }, 'Đăng xuất'),
        h('button', { class: 'btn', type: 'button', id: 'btn-clear', onclick: function () {
          confirmDanger('Xóa lịch sử trò chuyện?', 'Toàn bộ tin nhắn và các việc đã xác nhận sẽ bị xóa thật, không khôi phục được.', 'Xóa lịch sử', function (a2) {
            O.api('DELETE', 'history').then(function () { a2.close(true); api.close(true); O.renderEmpty(me); showChips(); O.toast('Đã xóa lịch sử trò chuyện'); }, function (e) { O.toast(e.message); });
          });
        } }, 'Xóa lịch sử trò chuyện'),
        h('button', { class: 'btn', type: 'button', onclick: function () {
          confirmDanger('Xóa tất cả dữ liệu của tôi trên Osin?', 'Xóa lịch sử, cài đặt và việc đã đồng ý. Lần sau bạn sẽ được hỏi đồng ý lại.', 'Xóa tất cả', function (a2) {
            O.api('POST', 'account/erase', { confirm: true }).then(function () { a2.close(true); api.close(true); location.hash = '#/'; location.reload(); }, function (e) { O.toast(e.message); });
          });
        } }, 'Xóa tất cả dữ liệu của tôi')));
    }, { label: 'Cài đặt', onclose: function () { if (/^#\/(cai-dat|rieng-tu)$/.test(location.hash)) history.replaceState(null, '', '#/'); } });
  }
  function route() {
    if (!me) return;
    if (location.hash === '#/cai-dat') { O.closeSheets(); openSettings(); }
    else if (location.hash === '#/rieng-tu') { O.closeSheets(); openSettings('privacy'); }
  }

  /* ---------- gợi ý nhanh ---------- */
  function showChips() {
    var box = $('chips'); O.clear(box); box.hidden = false;
    SUGGESTIONS.forEach(function (s) {
      box.appendChild(h('button', { type: 'button', text: s, onclick: function () { submit(s); } }));
    });
  }

  /* ---------- gửi ---------- */
  function setSending(on) {
    $('btn-send').disabled = on; $('input').disabled = on;
  }
  function submit(text) {
    text = String(text == null ? $('input').value : text).trim();
    if (!text) return;
    if (O.voice.isListening()) O.voice.stopListening();
    $('chips').hidden = true; $('toast').hidden = true;
    $('input').value = ''; autosize();
    O.send(text, {
      onstart: function () { setSending(true); },
      onend: function () { setSending(false); if (!matchMedia('(pointer:coarse)').matches) $('input').focus(); },
      onconsent: function () { me.needConsent = true; askConsent(function () { submit(text); }); },
      onunauth: function () { showIntro(); },
    });
  }
  function autosize() {
    var t = $('input'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px';
    $('btn-send').disabled = O.chatState.busy;
  }

  /* ---------- micro ---------- */
  function setupMic() {
    var btn = $('btn-mic'); var input = $('input'); var base = '';
    if (!O.voice.canListen) { btn.classList.add('unsupported'); btn.setAttribute('title', 'Trình duyệt chưa hỗ trợ nhập bằng giọng nói'); }
    btn.addEventListener('click', function () {
      if (!O.voice.canListen) { O.toast('Trình duyệt này chưa hỗ trợ nhập bằng giọng nói. Bạn dùng micro trên bàn phím nhé.', 5000); return; }
      if (O.voice.isListening()) { O.voice.stopListening(); return; }
      base = input.value ? input.value.replace(/\s+$/, '') + ' ' : '';
      O.voice.listen({
        onstart: function () { btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); btn.setAttribute('aria-label', 'Dừng nghe'); input.placeholder = 'Đang nghe… bạn cứ nói'; },
        onresult: function (text) { input.value = base + text; autosize(); },
        onend: function (got) {
          btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Nhập bằng giọng nói');
          input.placeholder = 'Hỏi hoặc nhờ Osin…';
          if (got) { O.toast('Bạn kiểm tra lại chữ rồi bấm Gửi nhé'); }
          input.focus();
        },
        onerror: function (msg) { O.toast(msg, 5000); },
      });
    });
  }

  /* ---------- khởi động ---------- */
  function start() {
    O.chatInit($('list'));
    O.chatState.tts = lsGet('osin.tts') === '1' && O.voice.canSpeak;
    $('composer').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    $('input').addEventListener('input', autosize);
    $('input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); submit(); }
    });
    $('btn-menu').addEventListener('click', function () { location.hash = '#/cai-dat'; });
    window.addEventListener('hashchange', route);
    setupMic();

    var loi = /[?&]loi=/.test(location.search);
    if (loi) { history.replaceState(null, '', location.pathname + location.hash); }
    O.api('GET', 'me').then(function (m) {
      me = m;
      O.loadUiToken();
      if (loi) O.toast('Chưa đăng nhập được, bạn thử lại nhé.');
      $('sub').textContent = m.ai.enabled ? 'Trợ lý của 9app' : 'Chưa bật AI (chỉ lệnh đơn giản)';
      if (!m.ai.enabled) { var b = $('banner'); b.hidden = false; b.textContent = 'Osin chưa bật AI trên máy chủ này, nên chỉ làm được vài lệnh đơn giản: đổi đơn vị, tính toán, âm lịch, mở chức năng.'; }
      return O.api('GET', 'history?limit=60').then(function (hst) {
        if (hst.messages.length) O.renderHistory(hst.messages); else { O.renderEmpty(m); }
        if (!hst.messages.length) showChips();
        autosize();
        if (m.needConsent) askConsent(function () { $('input').focus(); });
        route();
      });
    }).catch(function (e) {
      if (e.status === 401) { showIntro(); return; }
      var list = $('list'); O.clear(list);
      list.appendChild(h('div', { class: 'intro' }, h('h1', { text: 'Chưa mở được Osin' }), h('p', { text: e.message }), h('button', { class: 'btn primary', type: 'button', onclick: function () { location.reload(); } }, 'Thử lại')));
    });
  }
  start();
})();
