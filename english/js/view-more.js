/* Cài đặt, nhắc học (ICS), xuất dữ liệu. */
(function (root) {
  'use strict';
  var E = root.E9, h = E.ui.h, icon = E.ui.icon;

  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function seg(label, options, current, onpick) {
    var row = h('div.seg', { role: 'radiogroup', 'aria-label': label });
    options.forEach(function (o) {
      var on = String(o[0]) === String(current);
      row.appendChild(h('button.segb' + (on ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(on), onclick: function () { onpick(o[0]); } }, o[1]));
    });
    return h('div.setrow', h('span.lab', { text: label }), row);
  }

  E.views.more = function (el) {
    var s = E.store.state(), st = s.settings;
    function set(k, v) { st[k] = v; E.store.save(); if (k === 'theme') E.app.applyTheme(); E.app.refresh(); }

    el.appendChild(h('h1', 'Thêm'));
    el.appendChild(h('h2.sec', 'Học tập'));
    el.appendChild(h('section.card',
      seg('Mục tiêu mỗi ngày', [[5, '5 phút'], [10, '10 phút'], [15, '15 phút'], [20, '20 phút']], st.dailyMin, function (v) { set('dailyMin', v); }),
      seg('Từ mới mỗi ngày', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], st.newPerDay, function (v) { set('newPerDay', v); }),
      seg('Giọng đọc', [['en-US', 'Anh - Mỹ'], ['en-GB', 'Anh - Anh']], st.accent, function (v) { set('accent', v); }),
      seg('Tốc độ đọc', [[0.75, 'Chậm'], [0.95, 'Vừa'], [1.1, 'Nhanh']], st.rate, function (v) { set('rate', v); }),
      h('div.row', E.practice.say('Could you send me the report by Friday, please?', 'Thử giọng đọc'))));

    el.appendChild(h('h2.sec', 'Giao diện'));
    el.appendChild(h('section.card', seg('Chế độ màu', [['auto', 'Theo máy'], ['light', 'Sáng'], ['dark', 'Tối']], st.theme, function (v) { set('theme', v); })));

    // Nhắc học bằng ICS
    var timeIn = h('input', { type: 'time', value: st.remindTime, id: 'remind-time', 'aria-label': 'Giờ nhắc học' });
    timeIn.addEventListener('change', function () { if (timeIn.value) { st.remindTime = timeIn.value; E.store.save(); } });
    el.appendChild(h('h2.sec', 'Nhắc học mỗi ngày'));
    el.appendChild(h('section.card',
      h('p.muted', 'Trình duyệt web không tự nhắc khi đã đóng ứng dụng. Hãy tải tệp lịch (.ics) rồi mở bằng ứng dụng Lịch trên điện thoại hoặc máy tính, sự kiện lặp lại hằng ngày kèm thông báo.'),
      h('label.field', { 'for': 'remind-time' }, h('span', 'Giờ nhắc'), timeIn),
      h('button.btn.primary', { type: 'button', id: 'ics', onclick: function () {
        try {
          var ics = E.streak.buildIcs({ time: timeIn.value || st.remindTime, minutes: st.dailyMin, url: location.origin && location.origin !== 'null' ? location.href.split('#')[0] : 'https://9app.tech/english/' });
          download('9english-nhac-hoc.ics', 'text/calendar;charset=utf-8', ics);
          E.ui.toast('Đã tạo tệp nhắc lúc ' + (timeIn.value || st.remindTime) + '. Hãy mở tệp để thêm vào lịch.');
        } catch (e) { E.ui.toast('Giờ nhắc không hợp lệ.', 'warn'); }
      } }, icon('download', 18), h('span', { text: 'Tải tệp nhắc lịch (ICS)' }))));

    // Trạng thái trình duyệt
    var ok = function (v) { return v ? 'Có' : 'Không'; };
    el.appendChild(h('h2.sec', 'Thiết bị của bạn'));
    el.appendChild(h('section.card.sys',
      h('div.kv', h('span', 'Phát âm (đọc mẫu)'), h('b', { text: ok(E.speech.ttsSupported()) })),
      h('div.kv', h('span', 'Nhận giọng nói (luyện nói)'), h('b', { text: ok(E.speech.recSupported()) })),
      h('div.kv', h('span', 'Lưu tiến độ trên máy'), h('b', { text: E.store.isPersistent() ? 'Có' : 'Tạm thời (trình duyệt chặn lưu)' })),
      !E.speech.recSupported() ? h('p.muted', 'Nhận giọng nói cần Chrome, Edge hoặc Safari mới. Nếu không có, bạn vẫn luyện bằng cách nghe mẫu, đọc to và tự đánh giá.') : null));

    el.appendChild(h('h2.sec', 'Dữ liệu'));
    el.appendChild(h('section.card',
      h('p.muted', 'Tiến độ chỉ nằm trên thiết bị này. Hãy xuất bản sao lưu nếu bạn đổi máy.'),
      h('div.row',
        h('button.btn', { type: 'button', onclick: function () { download('9english-tien-do.json', 'application/json', E.store.exportJson()); } }, icon('download', 18), h('span', { text: 'Xuất tiến độ (JSON)' })),
        h('button.btn.danger', { type: 'button', id: 'reset', onclick: function () {
          if (root.confirm('Xóa toàn bộ tiến độ học trên thiết bị này? Việc này không hoàn tác được.')) { E.store.reset(); E.app.applyTheme(); E.ui.toast('Đã xóa tiến độ.'); E.app.render(); }
        } }, icon('refresh', 18), h('span', { text: 'Xóa tiến độ' })))));

    el.appendChild(h('p.muted.small.center', '9english - học tiếng Anh công sở, một phần của 9app.tech. Không cần tài khoản, mọi dữ liệu ở trên máy bạn.'));
  };
})(self);
