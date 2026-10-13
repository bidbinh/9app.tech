/* 9tutor: trang công khai chỉ xem: báo cáo cho phụ huynh (/r/<mã>) và giới thiệu gia sư (/g/<mã>) */
(function () {
  'use strict';
  var T9 = window.T9; var h = T9.h;

  function gone(e, what) {
    T9.bare();
    T9.mount([h('div', { class: 'pubhead' }, [h('img', { src: 'icon.svg', alt: '', width: 40, height: 40 }), h('b', { text: '9tutor' })]),
      T9.empty(e && e.status === 404 ? 'Liên kết không còn hiệu lực' : 'Chưa tải được', e && e.status === 404 ? 'Liên kết ' + what + ' này đã bị thu hồi hoặc không tồn tại. Hãy hỏi lại gia sư để nhận liên kết mới.' : ((e && e.message) || 'Thử lại sau nhé'))]);
  }
  function head() {
    return h('div', { class: 'pubhead' }, [h('img', { src: 'icon.svg', alt: '', width: 40, height: 40 }), h('b', { text: '9tutor' })]);
  }
  var STARS = ['', 'Cần cố gắng thêm', 'Chưa tốt', 'Khá', 'Tốt', 'Rất tốt'];

  T9.pubReport = function (token) {
    T9.bare(); T9.skeleton();
    T9.api('GET', 'api/r/' + token).then(function (d) {
      document.title = 'Báo cáo học tập của ' + d.student.name;
      var thisMonth = d.today.slice(0, 7);
      var mth = d.months.filter(function (m) { return m.month === thisMonth; })[0] || { taught: 0, absent: 0, cancelled: 0 };
      var nodes = [head()];
      nodes.push(h('div', { class: 'card' }, [
        h('div', { class: 'muted small', text: 'Báo cáo học tập' }),
        h('h1', { class: 'h1', text: d.student.name }),
        h('div', { class: 'muted', text: [d.student.grade, d.student.subject].filter(Boolean).join(' · ') }),
        h('div', { class: 'muted', text: 'Gia sư: ' + d.tutor.name }),
        h('div', { class: 'chips' }, [T9.chip('Tháng này: ' + mth.taught + ' buổi đã học', 'ok'), mth.absent ? T9.chip(mth.absent + ' buổi nghỉ', 'warn') : null, mth.cancelled ? T9.chip(mth.cancelled + ' buổi gia sư hủy', '') : null]),
      ]));
      if (d.upcoming.length) {
        nodes.push(h('div', { class: 'sec', text: 'Lịch sắp tới' }));
        nodes.push(h('div', { class: 'card' }, [h('ul', { class: 'plain' }, d.upcoming.map(function (u) {
          return h('li', { class: 'row sb' }, [h('span', { class: 'b', text: T9.dayLabel(u.day, d.today) }), h('span', { text: T9.timeRange(u.startMin, u.durationMin) + (u.makeup ? ' (buổi bù)' : '') })]);
        }))]));
      }
      nodes.push(h('div', { class: 'sec', text: 'Các buổi học gần đây' }));
      if (d.recent.length) {
        nodes.push(h('div', { class: 'logs' }, d.recent.map(function (l) {
          var kind = { da_day: 'ok', hs_nghi: 'warn', gs_huy: '' }[l.status];
          var label = { da_day: 'Đã học', hs_nghi: 'Học sinh nghỉ', gs_huy: 'Gia sư hủy' }[l.status];
          return h('div', { class: 'card log' }, [
            h('div', { class: 'row sb' }, [h('div', { class: 'b', text: T9.DOW[T9.isoDow(l.day)] + ', ' + T9.dmy(l.day) }), T9.chip(label + (l.makeup ? ' · bù' : ''), kind)]),
            h('div', { class: 'muted small', text: T9.timeRange(l.startMin, l.durationMin) }),
            l.topic ? h('p', {}, [h('b', { text: 'Nội dung: ' }), h('span', { class: 'pre', text: l.topic })]) : null,
            l.homework ? h('p', {}, [h('b', { text: 'Bài tập: ' }), h('span', { class: 'pre', text: l.homework })]) : null,
            l.comment ? h('p', {}, [h('b', { text: 'Nhận xét: ' }), h('span', { class: 'pre', text: l.comment })]) : null,
            l.rating ? h('div', { class: 'rating', 'aria-label': 'Mức tiếp thu: ' + STARS[l.rating] }, [stars(l.rating), h('span', { class: 'small muted', text: ' ' + STARS[l.rating] })]) : null,
          ]);
        })));
      } else nodes.push(T9.empty('Chưa có buổi học nào được ghi', ''));
      if (d.months.length) {
        nodes.push(h('div', { class: 'sec', text: 'Chuyên cần theo tháng' }));
        nodes.push(h('div', { class: 'card' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Tháng' }), h('th', { scope: 'col', text: 'Đã học' }), h('th', { scope: 'col', text: 'Nghỉ' }), h('th', { scope: 'col', text: 'Gia sư hủy' })])]),
          h('tbody', {}, d.months.map(function (m) { return h('tr', {}, [h('th', { scope: 'row', text: m.month.slice(5) + '/' + m.month.slice(0, 4) }), h('td', { text: m.taught }), h('td', { text: m.absent }), h('td', { text: m.cancelled })]); })),
        ])]));
      }
      if (d.fee) nodes.push(feeCard(d, token));
      nodes.push(h('div', { class: 'btn-row center noprint' }, [T9.btn('In / Lưu PDF', 'ghost', function () { window.print(); })]));
      nodes.push(h('p', { class: 'muted small center', text: 'Báo cáo do gia sư lập trên 9tutor, chỉ để phụ huynh xem. Liên kết có thể bị gia sư thu hồi bất cứ lúc nào.' }));
      T9.mount(nodes);
    }, function (e) { gone(e, 'báo cáo'); });
  };
  function stars(n) {
    var w = h('span', { class: 'stars', 'aria-hidden': 'true' });
    for (var i = 1; i <= 5; i++) w.appendChild(h('span', { class: 'star' + (i <= n ? ' on' : '') }, [T9.ico('star', 18, 1.8)]));
    return w;
  }
  function feeCard(d, token) {
    var f = d.fee;
    var rows = [kv('Hình thức', f.model === 'buoi' ? T9.vnd(f.feeAmount) + ' mỗi buổi' : f.model === 'thang' ? T9.vnd(f.feeAmount) + ' mỗi tháng' : 'Gói: ' + T9.vnd(f.feeAmount)), kv('Tổng học phí đến nay', T9.vnd(f.total)), kv('Đã thanh toán', T9.vnd(f.paid)), kv(f.balance >= 0 ? 'Còn lại' : 'Đóng trước', T9.vnd(Math.abs(f.balance)), f.balance > 0 ? 'bad-t' : 'ok-t')];
    if (f.pkgLeft !== null && f.pkgLeft !== undefined) rows.push(kv('Gói còn lại', f.pkgLeft + ' buổi'));
    var parts = [h('h2', { text: 'Học phí' }), h('div', { class: 'kv' }, rows)];
    if (f.balance > 0 && f.bank) {
      parts.push(h('div', { class: 'qrcard' }, [
        f.qr ? h('img', { class: 'qr', src: 'api/r/' + token + '/qr.svg', alt: 'Mã QR chuyển khoản học phí', width: 240, height: 240 }) : null,
        h('dl', { class: 'bank' }, [
          h('dt', { text: 'Ngân hàng' }), h('dd', { text: f.bank.name }),
          h('dt', { text: 'Số tài khoản' }), h('dd', {}, [h('span', { class: 'mono', text: f.bank.account }), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Chép số tài khoản', onclick: function () { T9.copy(f.bank.account, 'Đã chép số tài khoản'); } }, [T9.ico('copy', 18)])]),
          h('dt', { text: 'Chủ tài khoản' }), h('dd', { text: f.bank.holder }),
          h('dt', { text: 'Nội dung' }), h('dd', {}, [h('span', { class: 'mono', text: f.content }), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Chép nội dung chuyển khoản', onclick: function () { T9.copy(f.content, 'Đã chép nội dung'); } }, [T9.ico('copy', 18)])]),
        ]),
        h('div', { class: 'hint', text: 'Quét mã bằng app ngân hàng. Kiểm tra đúng tên chủ tài khoản trước khi chuyển.' }),
      ]));
    }
    return h('div', { class: 'card' }, parts);
  }
  function kv(k, v, cls) { return h('div', { class: 'kvrow' }, [h('span', { class: 'muted', text: k }), h('span', { class: 'b ' + (cls || ''), text: v })]); }

  T9.pubProfile = function (code) {
    T9.bare(); T9.skeleton();
    T9.api('GET', 'api/g/' + code).then(function (p) {
      document.title = p.name + ' - gia sư ' + p.subjects;
      var modeTxt = { tai_nha: 'Dạy tại nhà', online: 'Dạy online', ca_hai: 'Tại nhà và online' }[p.mode];
      var price = p.priceFrom !== null && p.priceFrom !== undefined ? (p.priceTo !== null && p.priceTo !== undefined && p.priceTo !== p.priceFrom ? T9.vnd(p.priceFrom) + ' đến ' + T9.vnd(p.priceTo) : T9.vnd(p.priceFrom)) + ' mỗi buổi (tham khảo)' : (p.priceTo ? 'Đến ' + T9.vnd(p.priceTo) + ' mỗi buổi' : '');
      T9.mount([head(), h('div', { class: 'card' }, [
        h('div', { class: 'row' }, [h('div', { class: 'avatar lg' }, [T9.initial(p.name)]), h('div', { class: 'col' }, [h('h1', { class: 'h1', text: p.name }), h('div', { class: 'muted', text: p.headline })])]),
        h('div', { class: 'chips' }, [p.subjects ? T9.chip(p.subjects, 'brand') : null, p.levels ? T9.chip(p.levels, '') : null, T9.chip(modeTxt, 'info'), p.area ? T9.chip(p.area, '') : null]),
        price ? h('p', { class: 'b', text: price }) : null,
        p.bio ? h('p', { class: 'pre', text: p.bio }) : null,
        p.contact ? h('div', { class: 'contactbox' }, [h('div', { class: 'muted small', text: 'Liên hệ' }), h('div', { class: 'b', text: p.contact })]) : null,
      ]), h('p', { class: 'muted small center', text: 'Thông tin do gia sư tự khai, 9tutor không xác minh và không môi giới. Hãy trao đổi kỹ, nên có người lớn ở nhà khi học tại nhà và không chuyển tiền trước cho người chưa quen.' })]);
    }, function (e) { gone(e, 'giới thiệu'); });
  };
})();
