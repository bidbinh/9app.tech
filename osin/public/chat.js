/* Khung chat: bong bóng, thẻ xác nhận hành động, thẻ liên kết, chỉ báo "đang nghĩ", lỗi thân thiện. */
(function () {
  'use strict';
  var O = (window.Osin = window.Osin || {});
  var h = O.h;
  var listEl, state = { busy: false, tts: false, me: null };
  O.chatState = state;

  function scrollDown() { listEl.scrollTop = listEl.scrollHeight; }
  O.chatInit = function (list) { listEl = list; };

  function bubble(text, cls) {
    var b = h('div', { class: 'bubble' + (cls ? ' ' + cls : '') });
    b.appendChild(O.richText(text));
    return b;
  }

  /* ---------- thẻ hành động ---------- */
  var ACTION_HEAD = {
    pending: 'Chờ bạn xác nhận (chưa thực hiện)', done: 'Đã thực hiện', failed: 'Chưa thực hiện được',
    cancelled: 'Đã hủy', expired: 'Đã hết hạn', gone: 'Không còn trong lịch sử', running: 'Đang thực hiện',
  };
  function actionCard(initial) {
    var card = initial; var timer = null;
    var root = h('div', { class: 'card' });
    function paint() {
      O.clear(root);
      root.className = 'card ' + card.status;
      var head = h('div', { class: 'card-h' }, (ACTION_HEAD[card.status] || card.status) + (card.title ? ' · ' + card.title : ''));
      var body = h('div', { class: 'card-b' }, h('p', { text: card.summary || '' }));
      if (card.warning && card.status === 'pending') body.insertBefore(h('p', { class: 'card-warn', role: 'alert', text: card.warning }), body.firstChild);
      if (card.status === 'pending') body.appendChild(h('p', { class: 'card-note', 'data-left': '1', text: 'Còn ' + O.timeLeft(card.expiresAt) + ' để xác nhận. Osin chỉ làm khi bạn bấm Xác nhận.' }));
      if (card.status === 'done' && card.resultText) body.appendChild(h('p', { class: 'card-note', text: card.resultText }));
      if (card.status === 'failed' && card.errorText) body.appendChild(h('p', { class: 'card-note', text: card.errorText }));
      root.appendChild(head); root.appendChild(body);
      if (card.status === 'pending') {
        var ok = h('button', { class: 'btn primary', type: 'button', 'data-act': 'confirm', onclick: function () { run('confirm'); } }, 'Xác nhận');
        var no = h('button', { class: 'btn', type: 'button', 'data-act': 'cancel', onclick: function () { run('cancel'); } }, 'Hủy');
        root.appendChild(h('div', { class: 'card-btns' }, ok, no));
        clearInterval(timer);
        timer = setInterval(function () {
          if (!root.isConnected) { clearInterval(timer); return; }
          if (new Date(card.expiresAt).getTime() <= Date.now()) { card.status = 'expired'; clearInterval(timer); paint(); return; }
          var n = root.querySelector('[data-left]'); if (n) n.textContent = 'Còn ' + O.timeLeft(card.expiresAt) + ' để xác nhận. Osin chỉ làm khi bạn bấm Xác nhận.';
        }, 1000);
      } else clearInterval(timer);
    }
    function run(verb) {
      Array.prototype.forEach.call(root.querySelectorAll('button'), function (b) { b.disabled = true; });
      O.api('POST', 'actions/' + card.id + '/' + verb, {}).then(function (r) {
        card = Object.assign({}, card, r.action); paint();
      }, function (e) {
        if (e.status === 410) { card.status = 'expired'; paint(); return; }
        if (e.status === 409 || e.status === 404) { O.toast(e.message); refreshCard(); return; }
        O.toast(e.message);
        Array.prototype.forEach.call(root.querySelectorAll('button'), function (b) { b.disabled = false; });
      });
    }
    function refreshCard() {
      O.api('GET', 'history?limit=100').then(function (r) {
        r.messages.forEach(function (m) { (m.cards || []).forEach(function (c) { if (c.type === 'action' && c.id === card.id) { card = c; } }); });
        paint();
      }, function () { paint(); });
    }
    paint();
    return root;
  }

  function linksCard(items) {
    var row = h('div', { class: 'link-row' });
    (items || []).forEach(function (it) {
      var href = O.safeLink(it); if (!href) return;
      row.appendChild(h('a', { class: 'chip-link', href: href, rel: 'noopener' }, 'Mở ' + it.label));
    });
    return row.childNodes.length ? row : null;
  }
  function noticeCard(text) { return h('div', { class: 'card notice', role: 'note' }, h('div', { class: 'card-b' }, h('p', { text: text }))); }

  function cardsOf(cards) {
    var out = [];
    (cards || []).forEach(function (c) {
      if (c.type === 'action') out.push(actionCard(c));
      else if (c.type === 'links') { var l = linksCard(c.items); if (l) out.push(l); }
      else if (c.type === 'notice') out.push(noticeCard(c.text));
    });
    return out;
  }

  /* ---------- tin nhắn ---------- */
  O.renderMessage = function (m, opts) {
    opts = opts || {};
    var row = h('div', { class: 'row ' + (m.role === 'user' ? 'user' : 'bot'), 'data-role': m.role });
    row.appendChild(bubble(m.content, m.error ? 'err' : ''));
    if (m.role !== 'user') {
      cardsOf(m.cards).forEach(function (c) { row.appendChild(c); });
      if (O.voice.canSpeak && !m.error) {
        var speakBtn = h('button', { class: 'tiny', type: 'button', 'aria-label': 'Nghe câu trả lời này' }, 'Nghe');
        speakBtn.addEventListener('click', function () {
          if (O.voice.isSpeaking()) { O.voice.stopSpeaking(); speakBtn.textContent = 'Nghe'; return; }
          speakBtn.textContent = 'Dừng';
          O.voice.speak(O.plain(m.content), function () { speakBtn.textContent = 'Nghe'; });
        });
        row.appendChild(h('div', { class: 'meta' }, speakBtn));
      }
    }
    return row;
  };

  O.renderHistory = function (messages) {
    O.clear(listEl);
    messages.forEach(function (m) { listEl.appendChild(O.renderMessage(m)); });
    scrollDown();
  };

  function thinkingRow() {
    var dots = h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
    var label = h('span', { text: 'Osin đang nghĩ…' });
    var row = h('div', { class: 'row bot', id: 'thinking' }, h('div', { class: 'bubble think', role: 'status' }, dots, label));
    var t1 = setTimeout(function () { label.textContent = 'Osin đang hỏi các app, đợi chút nhé…'; }, 6000);
    var t2 = setTimeout(function () { label.textContent = 'Vẫn đang làm, câu hỏi này hơi lâu…'; }, 20000);
    row.stop = function () { clearTimeout(t1); clearTimeout(t2); };
    return row;
  }

  /* ---------- gửi ---------- */
  O.send = function (text, hooks, clientId) {
    hooks = hooks || {};
    // clientId giữ nguyên khi bấm Thử lại: nếu máy chủ đã xử lý xong lượt trước thì trả lại kết quả cũ, không tạo thẻ trùng
    clientId = clientId || (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(36).slice(2, 12));
    if (state.busy) return Promise.resolve();
    text = String(text || '').trim();
    if (!text) return Promise.resolve();
    state.busy = true; if (hooks.onstart) hooks.onstart();
    var empty = listEl.querySelector('.empty'); if (empty) empty.remove();
    listEl.appendChild(O.renderMessage({ role: 'user', content: text }));
    var th = thinkingRow(); listEl.appendChild(th); scrollDown();
    return O.api('POST', 'chat', { text: text, clientId: clientId }).then(function (r) {
      th.stop(); th.remove();
      var row = O.renderMessage(r.message);
      listEl.appendChild(row); scrollDown();
      if (state.tts && O.voice.canSpeak) { try { O.voice.speak(O.plain(r.message.content)); } catch (e) { /* đọc to là phần phụ */ } }
      if (hooks.onok) hooks.onok(r.message);
    }, function (e) {
      th.stop(); th.remove();
      if (e.code === 'need_consent' && hooks.onconsent) { hooks.onconsent(text); return; }
      var row = h('div', { class: 'row bot' }, bubble(e.message, 'err'));
      if (e.status !== 429 || e.code === 'busy' || e.code === 'rate_limited') {
        row.appendChild(h('div', { class: 'meta' }, h('button', { class: 'tiny', type: 'button', onclick: function () { row.remove(); O.send(text, hooks, clientId); } }, 'Thử lại')));
      }
      listEl.appendChild(row); scrollDown();
      if (e.status === 401 && hooks.onunauth) hooks.onunauth(e);
      if (hooks.onfail) hooks.onfail(e);
    }).then(function () { state.busy = false; if (hooks.onend) hooks.onend(); });
  };

  /* ---------- trạng thái trống ---------- */
  O.renderEmpty = function (me) {
    O.clear(listEl);
    var ext = me.ai && me.ai.external;
    listEl.appendChild(h('div', { class: 'empty' },
      h('img', { src: 'icon.svg', alt: '', width: 72, height: 72 }),
      h('h1', { text: 'Chào ' + me.user.displayName + ', mình là Osin' }),
      h('p', { text: 'Hỏi mình về lịch, danh sách, giờ giấc, tính toán hay tìm chức năng trong các app 9app. Bạn gõ, hoặc bấm micro để nói.' }),
      h('p', { class: 'privacy-note', text: ext ? 'Nội dung trò chuyện được gửi tới Google Gemini để xử lý' + (me.ai.noTrainConfirmed ? '' : ' (chưa xác nhận điều khoản huấn luyện của nhà cung cấp)') + ' và lưu ' + me.limits.historyDays + ' ngày cho riêng bạn. Bạn xóa được bất cứ lúc nào ở phần Cài đặt.' : 'Hiện chưa bật AI, Osin chỉ làm được vài lệnh đơn giản. Nội dung chỉ lưu cho riêng bạn.' })));
  };
})();
