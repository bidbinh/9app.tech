/* 9hire: trang chủ (tìm và lọc), thẻ việc, chi tiết tin, xem liên hệ, gửi quan tâm, báo cáo. */
(function () {
  'use strict';
  var H9 = window.H9, h = H9.h;

  // bộ lọc hiện tại (giữ khi chuyển trang trong phiên)
  var EMPTY = { q: '', city: '', district: '', kind: '', category: '', payType: '', minPay: '', shift: '', startNow: '' };
  var F = Object.assign({}, EMPTY);
  H9.filters = function () { return F; };
  H9.setFilters = function (f) { F = Object.assign({}, EMPTY, f || {}); };

  function qstring(f, extra) {
    var p = [];
    Object.keys(EMPTY).forEach(function (k) { if (f[k]) p.push(k + '=' + encodeURIComponent(f[k])); });
    Object.keys(extra || {}).forEach(function (k) { p.push(k + '=' + encodeURIComponent(extra[k])); });
    return p.length ? '?' + p.join('&') : '';
  }
  H9.filterQuery = qstring;
  function activeCount(f) { var n = 0; Object.keys(EMPTY).forEach(function (k) { if (k !== 'q' && f[k] && !(k === 'minPay' && !f.payType)) n++; }); return n; }
  H9.filterSummary = function (f) {
    var parts = [];
    if (f.q) parts.push('"' + f.q + '"');
    if (f.district) parts.push(f.district);
    else if (f.city) parts.push(H9.label('cities', f.city));
    if (f.kind) parts.push(H9.label('kinds', f.kind));
    if (f.category) parts.push(H9.label('categories', f.category));
    if (f.payType) parts.push(f.payType === 'thoa_thuan' ? 'Lương thỏa thuận' : (f.minPay ? 'Từ ' + H9.vnd(Number(f.minPay)) + '/' + H9.label('payTypes', f.payType) : 'Lương theo ' + H9.label('payTypes', f.payType)));
    if (f.shift) parts.push(H9.label('shifts', f.shift));
    if (f.startNow) parts.push('Bắt đầu ngay');
    return parts.length ? parts.join(', ') : 'Tất cả tin mới';
  };

  // ---------- thẻ việc ----------
  H9.jobCard = function (j, opts) {
    opts = opts || {};
    var saved = H9.my.isSaved(j.id);
    var chips = [];
    if (j.startNow && j.state === 'dang') chips.push(H9.chip('Cần ngay', 'hot', 'bolt'));
    chips.push(H9.chip(H9.label('kinds', j.kind), 'brand'));
    if (j.shifts && j.shifts.length) chips.push(H9.chip(j.shifts.map(function (s) { return H9.label('shifts', s).replace('Ca ', ''); }).join(', '), ''));
    if (j.risk) chips.push(H9.chip('Cần cẩn trọng', 'warn', 'warn'));
    if (j.state === 'het_han') chips.push(H9.chip('Hết hạn', 'bad'));
    if (j.state === 'dong') chips.push(H9.chip('Đã đóng', 'bad'));
    var main = H9.link('#/job/' + j.id, { class: 'main' }, [
      h('div', { class: 'top' }, [
        h('div', { class: 'cat-ico' }, [H9.ico(H9.CAT_ICON[j.category] || 'briefcase', 24)]),
        h('div', { class: 'col' }, [
          h('div', { class: 'title', text: j.title }),
          h('div', { class: 'co', text: j.company + ' · ' + j.district }),
        ]),
      ]),
      h('div', { class: 'pay' + (j.payType === 'thoa_thuan' ? ' neg' : ''), text: H9.payText(j) }),
      h('div', { class: 'chips' }, chips),
      h('div', { class: 'foot' }, [
        h('span', {}, [H9.ico('clock', 14), H9.ago(j.createdAt)]),
        j.state === 'dang' ? h('span', {}, [H9.ico('calendar', 14), H9.daysLeft(j.expiresAt)]) : null,
        j.slots > 1 ? h('span', {}, [H9.ico('users', 14), 'Cần ' + j.slots + ' người']) : null,
      ]),
    ]);
    var heart = h('button', { type: 'button', class: 'save-btn' + (saved ? ' on' : ''), 'aria-label': saved ? 'Bỏ lưu tin' : 'Lưu tin', 'aria-pressed': saved ? 'true' : 'false', onclick: function () {
      var now = H9.my.toggleSaved(j.id);
      heart.className = 'save-btn' + (now ? ' on' : '');
      heart.setAttribute('aria-pressed', now ? 'true' : 'false');
      heart.setAttribute('aria-label', now ? 'Bỏ lưu tin' : 'Lưu tin');
      H9.toast(now ? 'Đã lưu tin' : 'Đã bỏ lưu');
      if (opts.onUnsave && !now) opts.onUnsave(j);
    } }, [H9.ico('heart', 24)]);
    return h('article', { class: 'jobcard' + (j.state !== 'dang' ? ' dim' : '') }, [main, heart]);
  };

  // ---------- bộ lọc ----------
  var dlId = 0;
  function filterForm(onChange) {
    var meta = H9.meta;
    var timer = null;
    var fire = function (now) { clearTimeout(timer); timer = setTimeout(onChange, now ? 0 : 300); };
    var city = H9.select(meta.cities, F.city, 'Mọi nơi');
    var dl = h('datalist', { id: 'dl' + (++dlId) });
    var district = H9.text({ list: dl.id, placeholder: 'Ví dụ: Quận 1, Cầu Giấy', maxlength: 40, value: F.district });
    function drawDl() { H9.clear(dl); (H9.DISTRICTS[city.value] || [].concat.apply([], Object.keys(H9.DISTRICTS).map(function (k) { return H9.DISTRICTS[k]; }))).forEach(function (d) { dl.appendChild(h('option', { value: d })); }); }
    drawDl();
    var kind = H9.select(meta.kinds, F.kind, 'Mọi loại việc');
    var cat = H9.select(meta.categories, F.category, 'Mọi nhóm nghề');
    var payType = H9.select(meta.payTypes.map(function (p) { return [p[0], p[0] === 'thoa_thuan' ? 'Thỏa thuận' : 'Trả theo ' + p[1]]; }), F.payType, 'Mọi hình thức');
    var minPay = H9.text({ inputmode: 'decimal', placeholder: 'Ví dụ: 30k hoặc 8tr', maxlength: 14, value: F.minPay ? String(F.minPay) : '' });
    var minWrap = H9.field('Lương tối thiểu', minPay, 'Gõ 30k = 30.000đ, 8tr = 8.000.000đ');
    var shift = H9.select(meta.shifts, F.shift, 'Mọi ca');
    var now = H9.checkbox('Chỉ tin cần người bắt đầu ngay', !!F.startNow);
    function syncMin() { minWrap.classList.toggle('hidden', !payType.value || payType.value === 'thoa_thuan'); }
    syncMin();
    city.addEventListener('change', function () { F.city = city.value; drawDl(); fire(true); });
    district.addEventListener('input', function () { F.district = district.value.trim(); fire(); });
    kind.addEventListener('change', function () { F.kind = kind.value; fire(true); });
    cat.addEventListener('change', function () { F.category = cat.value; fire(true); });
    payType.addEventListener('change', function () { F.payType = payType.value; if (!payType.value || payType.value === 'thoa_thuan') { F.minPay = ''; minPay.value = ''; } syncMin(); fire(true); });
    minPay.addEventListener('input', function () { var v = H9.parseMoney(minPay.value); F.minPay = isNaN(v) ? '' : String(v); fire(); });
    shift.addEventListener('change', function () { F.shift = shift.value; fire(true); });
    now.input.addEventListener('change', function () { F.startNow = now.input.checked ? '1' : ''; fire(true); });
    var reset = H9.btn('Xóa bộ lọc', 'ghost sm', function () {
      var q = F.q; F = Object.assign({}, EMPTY, { q: q });
      city.value = ''; district.value = ''; kind.value = ''; cat.value = ''; payType.value = ''; minPay.value = ''; shift.value = ''; now.input.checked = false; syncMin(); drawDl(); fire(true);
    });
    return h('div', {}, [
      H9.field('Thành phố', city), H9.field('Quận, huyện', district), dl, H9.field('Loại việc', kind), H9.field('Nhóm nghề', cat),
      H9.field('Hình thức lương', payType), minWrap, H9.field('Ca làm', shift), now.node, h('div', { class: 'btn-row' }, [reset]),
    ]);
  }

  // ---------- trang chủ ----------
  H9.home = function () {
    H9.frame({ brand: true, tabs: 'home', right: [H9.bellButton()] });
    H9.skeleton();
    H9.loadMeta().then(buildHome, function (e) { H9.loadError(e, H9.home); });
  };

  function buildHome() {
    var token = 0; var items = []; var next = null; var head = 0; var loading = false;
    var list = h('div', { class: 'jobs' });
    var moreWrap = h('div', { class: 'more' });
    var title = h('div', { class: 'h2', text: 'Việc làm mới nhất' });
    var saveAlert = h('button', { type: 'button', class: 'linkbtn', onclick: function () { H9.promptAlert(F, head); } }, [H9.ico('bell', 16), ' Báo tin mới']);
    saveAlert.className = 'linkbtn hidden';
    var search = h('input', { type: 'search', placeholder: 'Tìm việc, tên quán, quận...', 'aria-label': 'Tìm việc', maxlength: 60, autocomplete: 'off', enterkeyhint: 'search', value: F.q });
    var composing = false;
    var filterBadge = h('span', { class: 'dot-badge hidden' });
    var fbtn = h('button', { type: 'button', class: 'filter-btn mobile-only', 'aria-label': 'Bộ lọc', onclick: openSheet }, [H9.ico('sliders', 22), filterBadge]);
    var quick = h('div', { class: 'quick', role: 'group', 'aria-label': 'Lọc nhanh' });

    function reload() { F.q = search.value.trim(); load(true); drawQuick(); drawBadge(); }
    var t = null;
    search.addEventListener('input', function () { if (composing) return; clearTimeout(t); t = setTimeout(reload, 350); });
    search.addEventListener('compositionstart', function () { composing = true; });
    search.addEventListener('compositionend', function () { composing = false; clearTimeout(t); t = setTimeout(reload, 350); });
    search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(t); reload(); search.blur(); } });

    var asideForm = null;
    var aside = h('aside', { class: 'filters', 'aria-label': 'Bộ lọc' });
    function mountAside() {
      H9.clear(aside);
      asideForm = filterForm(reload);
      aside.appendChild(h('div', { class: 'filters-box' }, [h('h2', { text: 'Bộ lọc' }), asideForm]));
    }
    mountAside();

    function openSheet() {
      H9.sheet('Bộ lọc', function (body, close) {
        body.appendChild(filterForm(reload));
        body.appendChild(h('div', { class: 'btn-row' }, [H9.btn('Xem kết quả', 'primary', function () { close(); })]));
      }).onclose = function () { mountAside(); };
    }

    var QUICK = [
      ['Tất cả', function () { return !activeCount(F) && !F.q; }, function () { var q = ''; F = Object.assign({}, EMPTY); search.value = q; }],
      ['Cần ngay', function () { return !!F.startNow; }, function () { F.startNow = F.startNow ? '' : '1'; }, 'bolt'],
      ['Ca sáng', function () { return F.shift === 'sang'; }, function () { F.shift = F.shift === 'sang' ? '' : 'sang'; }],
      ['Ca chiều', function () { return F.shift === 'chieu'; }, function () { F.shift = F.shift === 'chieu' ? '' : 'chieu'; }],
      ['Ca tối', function () { return F.shift === 'toi'; }, function () { F.shift = F.shift === 'toi' ? '' : 'toi'; }],
      ['Việc làm thêm', function () { return F.kind === 'lam_them'; }, function () { F.kind = F.kind === 'lam_them' ? '' : 'lam_them'; }],
      ['Bán thời gian', function () { return F.kind === 'ban_tg'; }, function () { F.kind = F.kind === 'ban_tg' ? '' : 'ban_tg'; }],
      ['Văn phòng', function () { return F.kind === 'van_phong'; }, function () { F.kind = F.kind === 'van_phong' ? '' : 'van_phong'; }],
    ];
    function drawQuick() {
      H9.clear(quick);
      QUICK.forEach(function (q) {
        var on = q[1]();
        quick.appendChild(h('button', { type: 'button', class: 'pill' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: function () { q[2](); mountAside(); reload(); } }, [q[3] ? H9.ico(q[3], 16) : null, q[0]]));
      });
    }
    function drawBadge() {
      var n = activeCount(F);
      filterBadge.textContent = String(n); filterBadge.classList.toggle('hidden', !n);
      saveAlert.classList.toggle('hidden', !(n || F.q));
      title.textContent = (n || F.q) ? 'Kết quả tìm kiếm' : 'Việc làm mới nhất';
    }

    function drawMore() {
      H9.clear(moreWrap);
      if (next) moreWrap.appendChild(H9.btn('Xem thêm tin', 'ghost', function (e) { return H9.busy(e.currentTarget, function () { return load(false); }); }));
    }
    function load(reset) {
      var my = ++token;
      if (reset) { items = []; next = null; }
      loading = true;
      return H9.get('api/jobs' + qstring(F, !reset && next ? { before: next } : {})).then(function (d) {
        if (my !== token) return;
        items = items.concat(d.items); next = d.next; head = d.head; loading = false;
        H9.clear(list);
        if (!items.length) {
          var filtered = activeCount(F) || F.q;
          list.appendChild(H9.empty(filtered ? 'Chưa có tin phù hợp' : 'Chưa có tin nào', filtered ? 'Thử bỏ bớt bộ lọc, hoặc bấm "Báo tin mới" để biết ngay khi có tin hợp với bạn.' : 'Hãy là người đầu tiên đăng tuyển ở đây.',
            h('div', { class: 'btn-row center' }, [filtered ? H9.btn('Xóa bộ lọc', 'primary', function () { F = Object.assign({}, EMPTY); search.value = ''; mountAside(); reload(); }) : H9.link('#/employer', { class: 'btn primary' }, ['Đăng tin tuyển'])])));
        } else items.forEach(function (j) { list.appendChild(H9.jobCard(j)); });
        drawMore();
      }, function (e) {
        if (my !== token) return;
        loading = false; H9.clear(list); list.appendChild(H9.empty(e.offline ? 'Chưa có mạng' : 'Chưa tải được', e.message, h('div', { class: 'btn-row center' }, [H9.btn('Thử lại', 'primary', function () { load(true); })])));
      });
    }

    var strip = h('div', { class: 'safe-strip' }, [H9.ico('shield', 20), h('div', {}, ['Nhà tuyển dụng đúng không thu tiền người xin việc: ', h('b', { text: 'không phí hồ sơ, không đặt cọc, không ép mua hàng' }), '. ', H9.link('#/safety', {}, ['Cách nhận biết lừa đảo'])])]);
    var main = h('div', { class: 'col' }, [
      h('div', { class: 'page' }, [
        h('div', { class: 'searchbar' }, [h('div', { class: 'searchbox' }, [H9.ico('search', 20), search]), fbtn]),
        quick, strip,
        h('div', { class: 'listhead' }, [title, saveAlert]),
        list, moreWrap,
      ]),
    ]);
    H9.clear(H9.$('view'));
    H9.$('view').appendChild(h('div', { class: 'home' }, [aside, main]));
    drawQuick(); drawBadge();
    H9.clear(list); list.appendChild(h('div', { class: 'skel' })); list.appendChild(h('div', { class: 'skel' }));
    load(true);
    H9.my.poll();
  }

  // ---------- chi tiết ----------
  var jobUrl = function (id) { return new URL('j/' + id, document.baseURI).href; };

  H9.jobDetail = function (id) {
    H9.frame({ title: 'Chi tiết việc làm', back: '#/', narrow: true });
    H9.skeleton();
    H9.loadMeta().then(function () { return H9.get('api/jobs/' + id); }).then(function (d) { drawDetail(d.job); }, function (e) { H9.loadError(e, function () { H9.jobDetail(id); }); });
  };

  function fact(k, v, cls) { return h('div', { class: 'fact ' + (cls || '') }, [h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v })]); }

  function drawDetail(j) {
    var open = j.state === 'dang';
    var share = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chia sẻ tin', onclick: function () {
      var url = jobUrl(j.id);
      if (navigator.share) navigator.share({ title: j.title + ' - ' + j.company, url: url }).catch(function () {}); else H9.copy(url, 'Đã sao chép link tin');
    } }, [H9.ico('share', 22)]);
    H9.frame({ title: 'Chi tiết việc làm', back: '#/', narrow: true, right: [share] });
    document.title = j.title + ' - 9hire';
    var chips = [H9.chip(H9.label('kinds', j.kind), 'brand'), H9.chip(H9.label('categories', j.category), '')];
    if (j.startNow && open) chips.unshift(H9.chip('Cần người ngay', 'hot', 'bolt'));
    var nodes = [];
    if (j.state === 'het_han') nodes.push(H9.notice('bad', 'Tin này đã hết hạn', 'Nhà tuyển dụng có thể đã tuyển đủ người. Bạn xem các tin còn hạn ở trang chủ.'));
    if (j.state === 'dong') nodes.push(H9.notice('bad', 'Tin này đã đóng', 'Nhà tuyển dụng đã ngừng nhận hồ sơ.'));
    if (j.risk) nodes.push(H9.notice('warn', 'Cần cẩn trọng với tin này', 'Tin có dấu hiệu bạn nên kiểm chứng kỹ trước khi đi phỏng vấn:', h('ul', {}, (j.riskNotes || []).map(function (n) { return h('li', { text: n }); }))));
    nodes.push(h('div', { class: 'card' }, [
      h('h1', { class: 'dtitle', text: j.title }),
      h('div', { class: 'dco' }, [H9.ico('briefcase', 18), h('span', { class: 'b', text: j.company }), j.employerSince ? h('span', { class: 'muted', text: '· Tham gia ' + H9.dateVN(j.employerSince) }) : null]),
      h('div', { class: 'chips' }, chips),
      h('div', { class: 'facts' }, [
        fact('Mức lương', H9.payText(j), 'wide pay-f'),
        fact('Địa điểm', j.district + ', ' + H9.label('cities', j.city)),
        fact('Cần tuyển', j.slots + ' người'),
        fact('Ca làm', (j.shifts && j.shifts.length ? j.shifts.map(function (s) { return H9.label('shifts', s); }).join(', ') : 'Theo thỏa thuận') + (j.shiftNote ? ' · ' + j.shiftNote : ''), 'wide'),
        fact('Hạn nhận hồ sơ', open ? H9.daysLeft(j.expiresAt) + ' (' + H9.dateVN(j.expiresAt) + ')' : 'Đã kết thúc'),
        fact('Đăng', H9.ago(j.createdAt)),
      ]),
      j.hasAddress ? h('p', { class: 'hint mt', text: 'Địa chỉ cụ thể và số liên hệ hiện sau khi bạn đọc cảnh báo an toàn.' }) : null,
    ]));
    nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Mô tả công việc' }), h('div', { class: 'block-t', text: j.description })]));
    if (j.requirements) nodes.push(h('div', { class: 'card' }, [h('h2', { text: 'Yêu cầu' }), h('div', { class: 'block-t', text: j.requirements })]));
    nodes.push(h('div', { class: 'safety' }, [
      h('h2', {}, [H9.ico('shield', 20), 'Giữ an toàn khi xin việc']),
      h('ul', {}, [
        h('li', { text: 'Không đóng bất kỳ khoản tiền nào để được nhận việc: phí hồ sơ, đặt cọc, đồng phục, "giữ chỗ".' }),
        h('li', { text: 'Không phải mua hàng hay "nhập hàng" để được làm, không kéo thêm người vào làm.' }),
        h('li', { text: 'Gặp ở đúng địa chỉ ghi trong tin hoặc nơi công cộng, báo cho người thân.' }),
        h('li', { text: 'Chưa gửi ảnh CCCD, mã OTP, thông tin ngân hàng khi chưa gặp trực tiếp.' }),
      ]),
    ]));
    var applied0 = j.applied || H9.my.isApplied(j.id);
    if (applied0) nodes.push(h('div', { class: 'reportline' }, [h('button', { type: 'button', class: 'linkbtn', onclick: function () {
      H9.confirm({ title: 'Rút hồ sơ', text: 'Xóa tên, số điện thoại và lời nhắn bạn đã gửi cho nhà tuyển dụng của tin này?', ok: 'Rút hồ sơ', danger: true }).then(function (yes) {
        if (!yes) return;
        H9.post('api/jobs/' + j.id + '/withdraw').then(function () { H9.my.unmarkApplied(j.id); H9.toast('Đã rút hồ sơ'); drawDetail(Object.assign({}, j, { applied: false })); }, H9.fail);
      });
    } }, ['Rút hồ sơ đã gửi'])]));
    nodes.push(h('div', { class: 'reportline' }, [h('button', { type: 'button', class: 'linkbtn danger-t', onclick: function () { reportSheet(j); } }, [H9.ico('flag', 16), ' Báo cáo tin này'])]));
    H9.mount([h('div', { class: 'detail' }, nodes.map(function (n, i) { return i ? h('div', { class: 'mt' }, [n]) : n; }))]);

    var saved = H9.my.isSaved(j.id);
    var applied = j.applied || H9.my.isApplied(j.id);
    var heart = h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Lưu tin', 'aria-pressed': saved ? 'true' : 'false', style: null, onclick: function () {
      var now = H9.my.toggleSaved(j.id);
      heart.setAttribute('aria-pressed', now ? 'true' : 'false');
      H9.clear(heart); heart.appendChild(H9.ico('heart', 22)); heart.appendChild(document.createTextNode(now ? 'Đã lưu' : 'Lưu'));
      heart.classList.toggle('on', now);
      H9.toast(now ? 'Đã lưu tin' : 'Đã bỏ lưu');
    } }, [H9.ico('heart', 22), saved ? 'Đã lưu' : 'Lưu']);
    var buttons = [heart];
    if (open) {
      buttons.push(applied ? h('button', { type: 'button', class: 'btn ghost', disabled: true }, [H9.ico('check', 20), 'Đã gửi quan tâm']) : H9.btn('Gửi quan tâm', 'ghost', function () { applySheet(j, function () { drawDetail(Object.assign({}, j, { applied: true })); }); }));
      buttons.push(H9.btn('Xem liên hệ', 'primary', function () { revealSheet(j); }, null, 'phone'));
    } else buttons.push(H9.link('#/', { class: 'btn primary' }, ['Xem tin còn hạn']));
    H9.setCta(h('div', { class: 'btn-row' }, buttons));
  }

  // cảnh báo + xác nhận trước khi hiện số điện thoại
  function revealSheet(j) {
    H9.sheet('Trước khi liên hệ', function (body, close) {
      body.appendChild(H9.notice('warn', 'Đọc kỹ, 20 giây thôi', null, h('ul', {}, [
        h('li', { text: 'Nhà tuyển dụng thật KHÔNG đòi tiền: phí hồ sơ, đặt cọc, mua đồng phục, mua hàng.' }),
        h('li', { text: 'Đừng gửi ảnh CCCD, mã OTP hay tài khoản ngân hàng khi chưa gặp trực tiếp.' }),
        h('li', { text: 'Hẹn gặp tại đúng địa chỉ trong tin hoặc nơi công cộng, và báo người thân.' }),
        h('li', { text: 'Bị đòi tiền hoặc thấy lạ: dừng lại và bấm "Báo cáo tin này".' }),
      ])));
      var ack = H9.checkbox('Tôi đã đọc và hiểu các cảnh báo trên', false);
      var go = H9.btn('Xem số liên hệ', 'primary block', function (e) {
        return H9.busy(e.currentTarget, function () {
          return H9.post('api/jobs/' + j.id + '/contact', { ack: true }).then(function (d) { showContact(body, d.contact, j, close); });
        });
      }, { disabled: true });
      ack.input.addEventListener('change', function () { go.disabled = !ack.input.checked; });
      body.appendChild(ack.node); body.appendChild(go);
    });
  }
  function showContact(body, c, j, close) {
    H9.clear(body);
    var zalo = h('a', { class: 'btn zalo', href: c.zaloUrl, target: '_blank', rel: 'noopener noreferrer' }, [H9.ico('chat', 20), 'Nhắn Zalo']);
    var tel = h('a', { class: 'btn primary', href: 'tel:' + c.phone }, [H9.ico('phone', 20), 'Gọi ngay']);
    body.appendChild(h('div', { class: 'contact-card' }, [
      h('div', { class: 'muted', text: 'Liên hệ: ' + c.name }),
      h('div', { class: 'contact-phone', text: c.phone.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3') }),
      h('div', { class: 'btn-row center' }, [tel, zalo]),
      h('div', { class: 'btn-row center' }, [H9.btn('Sao chép số', 'ghost sm', function () { H9.copy(c.phone, 'Đã sao chép số điện thoại'); }, null, 'copy')]),
      c.address ? h('dl', { class: 'kv' }, [h('dt', { text: 'Địa chỉ' }), h('dd', { text: c.address })]) : null,
    ]));
    body.appendChild(H9.notice('brand', 'Nhớ nhé', 'Chỉ đi phỏng vấn ở đúng địa chỉ trên. Nếu bị đòi tiền, hãy dừng lại và báo cáo tin.'));
    body.appendChild(h('div', { class: 'btn-row' }, [H9.btn('Đóng', 'ghost', function () { close(); })]));
  }

  function applySheet(j, done) {
    H9.sheet('Gửi quan tâm', function (body, close) {
      var p = H9.my.profile() || {};
      var name = H9.text({ value: p.name || '', maxlength: 50, autocomplete: 'name', placeholder: 'Họ tên của bạn' });
      var phone = H9.text({ value: p.phone || '', maxlength: 16, inputmode: 'tel', autocomplete: 'tel', placeholder: '0912 345 678' });
      var msg = h('textarea', { maxlength: 300, placeholder: 'Ví dụ: Em rảnh ca sáng, có thể đi làm từ thứ Hai.' });
      msg.value = p.intro || '';
      var now = H9.checkbox('Mình có thể bắt đầu ngay', p.startNow !== false);
      var keep = H9.checkbox('Lưu vào hồ sơ trên máy này cho lần sau', true);
      var err = h('div', { class: 'hint err hidden' });
      body.appendChild(h('form', { novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, [
        H9.notice('info', 'Chỉ nhà tuyển dụng của tin này thấy tên và số của bạn', 'Dữ liệu tự xóa sau ' + (H9.meta ? H9.meta.retainDays : 60) + ' ngày khi tin kết thúc.'),
        H9.field('Tên của bạn', name), H9.field('Số điện thoại / Zalo', phone), H9.field('Lời nhắn (không bắt buộc)', msg), now.node, keep.node, err,
        h('div', { class: 'btn-row' }, [H9.btn('Gửi quan tâm', 'primary block', function (e) {
          err.classList.add('hidden');
          if (name.value.trim().length < 2) { err.textContent = 'Hãy nhập tên của bạn'; err.classList.remove('hidden'); return; }
          if (!/^(\+?84|0)[\s.\-]?\d/.test(phone.value.trim())) { err.textContent = 'Số điện thoại chưa đúng, ví dụ 0912 345 678'; err.classList.remove('hidden'); return; }
          return H9.busy(e.currentTarget, function () {
            return H9.post('api/jobs/' + j.id + '/apply', { name: name.value.trim(), phone: phone.value.trim(), message: msg.value.trim(), startNow: now.input.checked }).then(function () {
              if (keep.input.checked) H9.my.setProfile(Object.assign({}, p, { name: name.value.trim(), phone: phone.value.trim(), startNow: now.input.checked }));
              H9.my.markApplied(j.id);
              close(); H9.toast('Đã gửi. Nhà tuyển dụng sẽ liên hệ nếu phù hợp.');
              if (done) done();
            }, function (er) { err.textContent = er.message; err.classList.remove('hidden'); if (er.status === 409 || er.status === 404) { if (er.code === 'already_applied') H9.my.markApplied(j.id); } throw er; });
          });
        })]),
      ]));
    });
  }

  function reportSheet(j) {
    H9.sheet('Báo cáo tin này', function (body, close) {
      var reason = '';
      var list = h('div', {});
      var note = h('textarea', { maxlength: 200, placeholder: 'Mô tả ngắn (không bắt buộc)' });
      var send = H9.btn('Gửi báo cáo', 'danger block', function (e) {
        return H9.busy(e.currentTarget, function () {
          return H9.post('api/jobs/' + j.id + '/report', { reason: reason, note: note.value.trim() }).then(function () { close(); H9.toast('Cảm ơn bạn. Chúng tôi sẽ xem xét tin này.'); });
        });
      }, { disabled: true });
      function draw() {
        H9.clear(list);
        H9.meta.reportReasons.forEach(function (r) {
          list.appendChild(h('button', { type: 'button', class: 'pick' + (reason === r[0] ? ' on' : ''), role: 'radio', 'aria-checked': reason === r[0] ? 'true' : 'false', onclick: function () { reason = r[0]; send.disabled = false; draw(); } }, [h('span', { class: 'rd' }), h('span', { text: r[1] })]));
        });
      }
      draw();
      body.appendChild(h('p', { class: 'muted', text: 'Báo cáo của bạn ẩn danh. Tin bị nhiều người báo cáo sẽ tự động ẩn để bảo vệ người tìm việc.' }));
      body.appendChild(h('div', { role: 'radiogroup', 'aria-label': 'Lý do' }, [list]));
      body.appendChild(note); body.appendChild(send);
    });
  }
})();
