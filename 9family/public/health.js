/* 9family: Sức khỏe gia đình. Danh sách hồ sơ, hồ sơ từng người (tăng trưởng WHO, chỉ số người lớn, tiêm chủng, thuốc, khám), in tóm tắt.
   Dữ liệu nhạy cảm: chỉ vẽ bằng DOM API (textContent), không ghi vào localStorage, không đưa vào thông báo. Chỉ để tham khảo, không chẩn đoán. */
(function () {
  'use strict';
  var F9 = window.F9; var h = F9.h;
  var tabOf = {}; var kindOf = {}; var vkindOf = {};
  var KIND_NAME = { weight: 'Cân nặng', height: 'Chiều cao', head: 'Vòng đầu', bmi: 'BMI', bp: 'Huyết áp', glucose: 'Đường huyết' };
  var UNIT = { weight: 'kg', height: 'cm', head: 'cm', bmi: 'kg/m²', glucose: 'mmol/L', bp: 'mmHg' };
  var CHIP = { ok: 'ok', high_mild: 'warn', high: 'bad', low: 'info', severe_high: 'bad', severe_low: 'bad' };
  var EMERGENCY = 'Nếu có triệu chứng nặng hãy đi cấp cứu hoặc gọi 115.';
  var nf = function (v) { return String(Math.round(Number(v) * 100) / 100).replace('.', ','); };
  var fmtDate = function (d) { return d ? F9.dmy(d) : ''; };
  function reload() { F9.dropGate(); return F9.refresh(true); }
  function who(s) { return s.kind === 'child' ? { name: s.name, color: s.color || 'xanh' } : { name: s.name }; }

  // ---------- danh sách hồ sơ ----------
  F9.health = function (fid) {
    F9.frame({ title: 'Sức khỏe', back: '#/f/' + fid + '/more', tabs: { fid: fid, tab: 'more' }, right: [F9.bell(fid)] });
    F9.skeleton('list');
    F9.live({
      fetch: function () { return F9.gated(fid, 'health', function () { return F9.get(F9.fam(fid, '/health')); }); },
      render: function (x) { renderList(fid, x); }, retick: false, every: 20000,
    }).catch(function (e) { F9.loadError(e, function () { F9.health(fid); }); });
  };

  function summaryChips(s) {
    var c = [];
    if (s.last.weight) c.push(F9.chip(nf(s.last.weight.v1) + ' kg'));
    if (s.last.height) c.push(F9.chip(nf(s.last.height.v1) + ' cm'));
    if (s.last.bp) c.push(F9.chip('HA ' + nf(s.last.bp.v1) + '/' + nf(s.last.bp.v2)));
    if (s.last.glucose) c.push(F9.chip('Đường ' + nf(s.last.glucose.v1)));
    if (s.nextVaccine) c.push(F9.chip('Tiêm ' + F9.dm(s.nextVaccine.due), 'info'));
    if (s.meds && s.meds.slots) c.push(F9.chip('Thuốc hôm nay ' + s.meds.taken + '/' + s.meds.slots, s.meds.taken >= s.meds.slots ? 'ok' : 'brand'));
    return c;
  }
  function personRow(fid, s) {
    var lvl = s.level === 'limited' ? 'Xem hạn chế' : s.level === 'view' ? 'Chỉ xem' : '';
    return F9.link('#/f/' + fid + '/health/' + s.id, { class: 'list-row tap hrow' }, [
      F9.avatar(who(s), 'l'),
      h('div', { class: 'col' }, [h('div', { class: 'b', text: s.name }), h('div', { class: 'muted small', text: [s.age, s.kind === 'adult' && s.hasAccount === false ? 'chưa có tài khoản, do người quản lý ghi hộ' : ''].filter(Boolean).join(' · ') || (s.kind === 'child' ? 'Chưa nhập ngày sinh' : 'Hồ sơ của người lớn') }),
        h('div', { class: 'chips' }, summaryChips(s).concat(lvl ? [F9.chip(lvl, 'info')] : []))]),
      F9.ico('chev', 20),
    ]);
  }
  function renderList(fid, x) {
    F9.setFab(null);
    var kids = x.subjects.filter(function (s) { return s.kind === 'child'; });
    var adults = x.subjects.filter(function (s) { return s.kind === 'adult'; });
    var nodes = [h('div', {}, [h('h1', { class: 'h1', text: 'Sức khỏe gia đình' }), h('div', { class: 'sub', text: 'Tăng trưởng của con, tiêm chủng, thuốc, huyết áp và đường huyết.' })])];
    nodes.push(F9.notice('info', 'Chỉ để tham khảo', x.notes.disclaimer + ' Hồ sơ của người lớn là riêng tư: mỗi người tự chọn chia sẻ cho ai.'));
    if (!x.subjects.length) nodes.push(F9.empty('Chưa có hồ sơ', 'Thêm con ở tab Gia đình để bắt đầu theo dõi tăng trưởng.', null, 'heart'));
    if (kids.length) { nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Các con' })])); nodes.push(h('div', { class: 'list' }, kids.map(function (s) { return personRow(fid, s); }))); }
    if (adults.length) { nodes.push(h('div', { class: 'sec' }, [h('span', { text: 'Người lớn' })])); nodes.push(h('div', { class: 'list' }, adults.map(function (s) { return personRow(fid, s); }))); }
    F9.mount(nodes);
  }

  // ---------- hồ sơ một người ----------
  F9.healthPerson = function (fid, sid) {
    F9.frame({ title: 'Hồ sơ sức khỏe', back: '#/f/' + fid + '/health', tabs: { fid: fid, tab: 'more' }, right: [F9.bell(fid)] });
    F9.skeleton('list');
    F9.live({
      fetch: function () { return F9.get(F9.fam(fid, '/health/' + sid)); },
      render: function (d) { renderPerson(fid, sid, d); }, retick: false, every: 20000,
    }).catch(function (e) { F9.loadError(e, function () { F9.healthPerson(fid, sid); }); });
  };

  function tabsFor(d) {
    var s = d.sections; var t = [['tong', 'Tổng quan']];
    if (d.subject.kind === 'child' && s.growth) t.push(['tt', 'Tăng trưởng']);
    if (d.subject.kind === 'adult' && s.vitals) t.push(['chiso', 'Chỉ số']);
    if (d.subject.kind === 'child' && s.vaccines) t.push(['tiem', 'Tiêm chủng']);
    if (s.meds) t.push(['thuoc', 'Thuốc']);
    if (s.visits) t.push(['kham', 'Khám']);
    return t;
  }

  function renderPerson(fid, sid, d) {
    F9.setTitle(d.subject.name);
    var tabs = tabsFor(d); var cur = tabOf[sid];
    if (!tabs.some(function (t) { return t[0] === cur; })) cur = 'tong';
    var lvl = { manage: 'Bạn quản lý hồ sơ này', write: 'Bạn được ghi số liệu', view: 'Chỉ xem', limited: 'Xem ở mức hạn chế' }[d.subject.level];
    var nodes = [h('div', { class: 'row hhead' }, [F9.avatar(who(d.subject), 'l'), h('div', { class: 'col ml' }, [h('h1', { class: 'h1', text: d.subject.name }),
      h('div', { class: 'sub', text: [d.subject.age, d.subject.sex === 'nam' ? 'Bé trai' : d.subject.sex === 'nu' ? (d.subject.kind === 'child' ? 'Bé gái' : 'Nữ') : ''].filter(Boolean).join(' · ') }), h('div', { class: 'chips' }, [F9.chip(lvl, d.sections.write ? 'brand' : 'info')])])])];
    if (tabs.length > 1) nodes.push(h('div', { class: 'htabs' }, [F9.seg(tabs, cur, function (v) { tabOf[sid] = v; F9.rerender(); }, 'Mục hồ sơ')]));
    var fab = null;
    if (cur === 'tong') nodes = nodes.concat(viewOverview(fid, sid, d));
    else if (cur === 'tt') { nodes = nodes.concat(viewGrowth(fid, sid, d)); if (d.sections.write) fab = { label: 'Thêm số đo', onclick: function () { measureSheet(fid, sid, d); } }; }
    else if (cur === 'chiso') { nodes = nodes.concat(viewVitals(fid, sid, d)); if (d.sections.write) fab = { label: 'Thêm số đo', onclick: function () { measureSheet(fid, sid, d); } }; }
    else if (cur === 'tiem') nodes = nodes.concat(viewVaccines(fid, sid, d));
    else if (cur === 'thuoc') { nodes = nodes.concat(viewMeds(fid, sid, d)); if (d.sections.write) fab = { label: 'Thêm thuốc', onclick: function () { medSheet(fid, sid, d, null); } }; }
    else if (cur === 'kham') { nodes = nodes.concat(viewVisits(fid, sid, d)); if (d.sections.write) fab = { label: 'Thêm lần khám', onclick: function () { visitSheet(fid, sid, d, null); } }; }
    nodes.push(h('p', { class: 'muted small hfoot', text: d.notes.disclaimer }));
    F9.mount(nodes);
    F9.setFab(fab);
  }

  // ---------- tổng quan ----------
  function profileSheet(fid, sid, d) {
    F9.sheet('Thông tin cơ bản', function (body, close) {
      var sex = d.subject.sex ? [d.subject.sex] : [];
      var chips = F9.chips([['nam', d.subject.kind === 'child' ? 'Bé trai' : 'Nam'], ['nu', d.subject.kind === 'child' ? 'Bé gái' : 'Nữ']], sex, function (v) { sex = v; }, { single: true });
      var bd = h('input', { type: 'date', value: d.subject.birthDate || '', max: d.today, min: '1900-01-01', 'aria-label': 'Ngày sinh' });
      body.appendChild(F9.field('Giới tính', chips, 'Cần để đối chiếu chuẩn tăng trưởng WHO.'));
      body.appendChild(F9.field('Ngày sinh', bd, d.subject.kind === 'child' ? 'Cần để tính tuổi theo tháng, đối chiếu WHO và lập lịch tiêm chủng.' : 'Không bắt buộc.'));
      var go = F9.btn('Lưu', 'primary block', function () {
        return F9.busy(go, function () {
          return F9.post(F9.fam(fid, '/health/' + sid + '/profile'), { sex: sex[0] || null, birthDate: bd.value || null }, { idem: 'hprof' }).then(function () { close(); F9.toast('Đã lưu'); return reload(); });
        });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
    });
  }

  function viewOverview(fid, sid, d) {
    var n = [];
    var kid = d.subject.kind === 'child';
    if (kid && (!d.subject.sex || !d.subject.birthDate)) {
      n.push(F9.notice('warn', 'Cần giới tính và ngày sinh', 'Để vẽ biểu đồ đối chiếu chuẩn WHO và lập lịch tiêm chủng.', d.sections.manage ? F9.btn('Nhập thông tin', 'ghost xs', function () { profileSheet(fid, sid, d); }) : null));
    } else if (d.sections.manage) {
      n.push(h('div', { class: 'btn-row end' }, [F9.btn('Sửa giới tính, ngày sinh', 'ghost xs', function () { profileSheet(fid, sid, d); })]));
    }
    // thuốc hôm nay: một chạm
    if (d.meds) {
      var act = d.meds.filter(function (m) { return m.active && m.times.length; });
      if (act.length) {
        n.push(h('div', { class: 'sec' }, [h('span', { text: 'Thuốc hôm nay' })]));
        n.push(h('div', { class: 'list' }, act.map(function (m) { return medRow(fid, sid, d, m, true); })));
      }
    }
    var last = {};
    (d.measures || []).forEach(function (m) { last[m.kind] = m; });
    var ks = Object.keys(last);
    if (ks.length) {
      n.push(h('div', { class: 'sec' }, [h('span', { text: 'Số đo gần nhất' })]));
      n.push(h('div', { class: 'list' }, ks.map(function (k) {
        var m = last[k];
        return h('div', { class: 'list-row' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: KIND_NAME[k] + ': ' + (k === 'bp' ? nf(m.v1) + '/' + nf(m.v2) + (m.v3 ? ', mạch ' + nf(m.v3) : '') : nf(m.v1)) + ' ' + UNIT[k] }), h('div', { class: 'muted small', text: fmtDate(m.day) + (m.ctx === 'doi' ? ' · lúc đói' : m.ctx === 'sau_an' ? ' · sau ăn' : '') })]),
          m.check ? F9.chip(m.check.label.split(' so với')[0], CHIP[m.check.level] || '') : null]);
      })));
    }
    if (d.vaccines) {
      var soon = d.vaccines.filter(function (v) { return v.status === 'overdue' || v.status === 'soon'; }).slice(0, 3);
      if (soon.length) {
        n.push(h('div', { class: 'sec' }, [h('span', { text: 'Tiêm chủng cần xem' })]));
        n.push(h('div', { class: 'list' }, soon.map(function (v) { return vaccineRow(fid, sid, d, v); })));
      }
    }
    if (d.share) n.push(shareCard(fid, sid, d));
    n.push(h('div', { class: 'sec' }, [h('span', { text: 'Xuất và xóa' })]));
    n.push(h('div', { class: 'card flat' }, [
      h('p', { class: 'small muted', text: 'Tóm tắt một trang để mang đi khám hoặc lưu PDF. Lần này app chưa lưu ảnh (đơn thuốc, kết quả khám): hãy ghi ngắn gọn vào ô ghi chú.' }),
      h('div', { class: 'btn-row' }, [F9.btn('In / lưu PDF tóm tắt', 'ghost', function () { printSummary(d); })]),
      d.sections.manage ? h('div', { class: 'btn-row' }, [F9.btn('Xóa dữ liệu sức khỏe của ' + d.subject.name, 'ghost danger-t', function () { eraseSheet(fid, sid, d); })]) : null,
    ]));
    return n;
  }

  function shareCard(fid, sid, d) {
    var kid = d.subject.kind === 'child';
    var sel = d.share.sharedWith.slice();
    var chips = d.share.candidates.length ? F9.chips(d.share.candidates.map(function (m) { return [m.id, m.name]; }), sel, function (v) { sel = v; }) : h('div', { class: 'muted small', text: 'Chưa có người lớn nào khác trong gia đình.' });
    var save = F9.btn('Lưu', 'primary sm', function () {
      return F9.busy(save, function () { return F9.post(F9.fam(fid, '/health/' + sid + '/profile'), { sharedWith: sel }, { idem: 'hshare' }).then(function () { F9.toast('Đã lưu'); return reload(); }); });
    });
    return h('div', {}, [h('div', { class: 'sec' }, [h('span', { text: kid ? 'Người phụ trách' : 'Chia sẻ hồ sơ của bạn' })]),
      h('div', { class: 'card' }, [
        h('p', { class: 'small muted', text: kid ? 'Chủ và người quản lý luôn thấy hồ sơ của con. Người được chọn ở đây cũng xem được và ghi số đo, đánh dấu uống thuốc.' : 'Mặc định chỉ mình bạn thấy hồ sơ này. Người bạn chọn chỉ được xem, không sửa. Bỏ chọn là thu hồi ngay.' }),
        h('div', { class: 'mt' }, [chips]), d.share.candidates.length ? h('div', { class: 'btn-row' }, [save]) : null])]);
  }

  function eraseSheet(fid, sid, d) {
    F9.confirm({ title: 'Xóa dữ liệu sức khỏe', text: 'Xóa toàn bộ số đo, lịch tiêm, thuốc và hồ sơ khám của ' + d.subject.name + ', kèm lịch tái khám đã tạo. Không hoàn tác được.', ok: 'Xóa hết', cancel: 'Giữ lại', danger: true }).then(function (yes) {
      if (!yes) return;
      F9.post(F9.fam(fid, '/health/' + sid + '/erase'), { confirm: true }, { idem: 'herase' }).then(function () { F9.toast('Đã xóa dữ liệu sức khỏe'); tabOf[sid] = 'tong'; return reload(); }, F9.fail);
    });
  }

  // ---------- tăng trưởng ----------
  function growthChart(ind) {
    var curves = ind.curves; var pts = ind.points.filter(function (p) { return p.place || (curves && p.ageMonths <= (curves.p50.length ? curves.p50[curves.p50.length - 1][0] : 0)); });
    var all = pts.map(function (p) { return p.value; });
    var lo = Infinity; var hi = -Infinity;
    ['p3', 'p15', 'p50', 'p85', 'p97'].forEach(function (k) { (curves ? curves[k] : []).forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }); });
    all.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    var xs = (curves && curves.p50.length ? curves.p50.map(function (p) { return p[0]; }) : []).concat(pts.map(function (p) { return p.ageMonths; }));
    var x0 = Math.min.apply(null, xs); var x1 = Math.max.apply(null, xs);
    if (!isFinite(lo)) return null;
    var pad = (hi - lo) * 0.08 || 1;
    var lines = [];
    if (curves) [['p3', 'ch-p3'], ['p15', 'ch-p15'], ['p50', 'ch-p50'], ['p85', 'ch-p15'], ['p97', 'ch-p3']].forEach(function (k) { lines.push({ cls: k[1], points: curves[k[0]] }); });
    lines.push({ cls: 'ch-me', dots: true, points: ind.points.map(function (p) { return [p.ageMonths, p.value]; }) });
    return F9.chart.line({
      title: 'Biểu đồ ' + ind.label.toLowerCase() + ' theo tuổi', desc: curves ? 'Đường mờ là chuẩn WHO từ phần trăm thứ 3 đến 97, chấm là số đo của bé.' : 'Chưa có đường chuẩn WHO cho độ tuổi này.',
      xMin: x0, xMax: x1, yMin: Math.max(0, lo - pad), yMax: hi + pad, xTicks: F9.chart.ageTicks(x0, x1), lines: lines,
    });
  }

  function viewGrowth(fid, sid, d) {
    var g = d.growth; var n = [];
    if (g.needProfile || !g.ready && g.reason && /giới tính|ngày sinh/.test(g.reason)) {
      n.push(F9.notice('warn', 'Cần giới tính và ngày sinh', g.reason, d.sections.manage ? F9.btn('Nhập thông tin', 'ghost xs', function () { profileSheet(fid, sid, d); }) : null));
      return n;
    }
    if (!g.ready) { n.push(F9.empty('Chưa có số đo', 'Nhập cân nặng, chiều cao (và vòng đầu với bé nhỏ) để xem biểu đồ so với chuẩn WHO.', null, 'heart')); return n; }
    var kinds = Object.keys(g.indicators);
    var cur = kindOf[sid];
    if (kinds.indexOf(cur) < 0) cur = kinds.filter(function (k) { return g.indicators[k].last.place; })[0] || kinds[0];
    n.push(h('div', { class: 'optwrap' }, [F9.chips(kinds.map(function (k) { return [k, g.indicators[k].label]; }), [cur], function (v) { kindOf[sid] = v[0]; F9.rerender(); }, { single: true })]));
    var ind = g.indicators[cur];
    var svg = growthChart(ind);
    var card = [h('div', { class: 'b', text: ind.label + ' theo tuổi (' + ind.unit + ')' })];
    if (svg) card.push(h('div', { class: 'chartbox' }, [svg]));
    card.push(h('div', { class: 'legend small muted' }, [h('span', { class: 'lg lg-me', text: 'Số đo của bé' }), h('span', { class: 'lg lg-p50', text: 'Trung vị WHO' }), h('span', { class: 'lg lg-p15', text: '15% và 85%' }), h('span', { class: 'lg lg-p3', text: '3% và 97%' })]));
    var l = ind.last;
    card.push(h('div', { class: 'gres' }, [
      h('div', { class: 'b', text: nf(l.value) + ' ' + ind.unit + ' · ' + fmtDate(l.day) }),
      l.place ? F9.chip('Khoảng phần trăm thứ ' + (l.place.pct < 1 ? '<1' : l.place.pct > 99 ? '>99' : Math.round(l.place.pct)), l.place.band === 'giua' ? 'ok' : 'warn') : F9.chip('Chưa có đường chuẩn', 'info'),
      l.text ? h('p', { class: 'small', text: l.text }) : null,
      ind.note ? F9.notice('info', 'Lưu ý', ind.note) : null,
    ]));
    card.push(h('div', { class: 'muted small', text: 'Nguồn: ' + ind.source.replace(/^(WHO[^:]*): /, '$1 - ') }));
    n.push(h('div', { class: 'card' }, card));
    // bảng số đo (cũng là bản chữ của biểu đồ)
    var rows = (d.measures || []).filter(function (m) { return m.kind === (cur === 'bmi' ? 'weight' : cur); }).slice().reverse();
    n.push(h('div', { class: 'sec' }, [h('span', { text: cur === 'bmi' ? 'Cân nặng đã nhập' : 'Các lần đo' })]));
    n.push(rows.length ? h('div', { class: 'list' }, rows.map(function (m) { return measureRow(fid, sid, d, m); })) : F9.empty('Chưa có số đo', null, null, 'info'));
    return n;
  }

  function measureRow(fid, sid, d, m) {
    var txt = m.kind === 'bp' ? nf(m.v1) + '/' + nf(m.v2) + (m.v3 ? ' · mạch ' + nf(m.v3) : '') + ' mmHg' : nf(m.v1) + ' ' + UNIT[m.kind];
    return h('div', { class: 'list-row' }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: txt }), h('div', { class: 'muted small', text: fmtDate(m.day) + (m.ctx === 'doi' ? ' · lúc đói' : m.ctx === 'sau_an' ? ' · sau ăn 2 giờ' : '') }),
      m.check ? h('div', { class: 'chips' }, [F9.chip(m.check.label.split(' (')[0], CHIP[m.check.level] || '')]) : null]),
      d.sections.write ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Xóa số đo ' + fmtDate(m.day), onclick: function () {
        F9.confirm({ title: 'Xóa số đo', text: 'Xóa số đo ngày ' + fmtDate(m.day) + '?', ok: 'Xóa', danger: true }).then(function (yes) { if (yes) F9.del(F9.fam(fid, '/health/' + sid + '/measures/' + m.id)).then(function () { F9.toast('Đã xóa số đo'); return reload(); }, F9.fail); });
      } }, [F9.ico('trash', 20)]) : null]);
  }

  function measureSheet(fid, sid, d) {
    var kid = d.subject.kind === 'child';
    var kinds = kid ? [['weight', 'Cân nặng'], ['height', 'Chiều cao / dài'], ['head', 'Vòng đầu']] : [['bp', 'Huyết áp'], ['glucose', 'Đường huyết'], ['weight', 'Cân nặng']];
    var tab = tabOf[sid]; var start = kid ? (kindOf[sid] === 'height' || kindOf[sid] === 'head' ? kindOf[sid] : 'weight') : (vkindOf[sid] || 'bp');
    F9.sheet('Thêm số đo', function (body, close) {
      var kind = start; var ctxv = 'doi';
      var dayI = h('input', { type: 'date', value: d.today, max: d.today, 'aria-label': 'Ngày đo' });
      var a = F9.text({ inputmode: 'decimal', maxlength: 7, 'aria-label': 'Giá trị', autocomplete: 'off' });
      var b2 = F9.text({ inputmode: 'decimal', maxlength: 7, 'aria-label': 'Tâm trương' });
      var c3 = F9.text({ inputmode: 'decimal', maxlength: 7, 'aria-label': 'Mạch' });
      var fields = h('div'); var ctxBox = h('div');
      var kindChips = F9.chips(kinds, [kind], function (v) { kind = v[0]; paint(); }, { single: true });
      function paint() {
        F9.clear(fields); F9.clear(ctxBox);
        if (kind === 'bp') {
          fields.appendChild(h('div', { class: 'grid2' }, [F9.field('Tâm thu (số trên)', a, 'mmHg'), F9.field('Tâm trương (số dưới)', b2, 'mmHg')]));
          fields.appendChild(F9.field('Mạch (không bắt buộc)', c3, 'lần/phút'));
        } else if (kind === 'glucose') {
          fields.appendChild(F9.field('Đường huyết', a, 'mmol/L'));
          ctxBox.appendChild(F9.field('Thời điểm đo', F9.chips([['doi', 'Lúc đói'], ['sau_an', 'Sau ăn 2 giờ'], ['khac', 'Lúc khác']], [ctxv], function (v) { ctxv = v[0]; }, { single: true })));
        } else fields.appendChild(F9.field(KIND_NAME[kind], a, UNIT[kind]));
      }
      paint();
      body.appendChild(F9.field('Loại số đo', kindChips));
      body.appendChild(fields); body.appendChild(ctxBox);
      body.appendChild(F9.field('Ngày đo', dayI));
      var go = F9.btn('Lưu số đo', 'primary block', function () {
        var payload = { kind: kind, day: dayI.value, v1: a.value };
        if (kind === 'bp') { payload.v2 = b2.value; if (c3.value) payload.v3 = c3.value; }
        if (kind === 'glucose') payload.ctx = ctxv;
        return F9.busy(go, function () {
          return F9.post(F9.fam(fid, '/health/' + sid + '/measures'), payload, { idem: 'hmeas' }).then(function (r) {
            close(); if (kid) kindOf[sid] = kind === 'weight' || kind === 'height' || kind === 'head' ? kind : kindOf[sid]; else vkindOf[sid] = kind;
            return reload().then(function () {
              if (r.emergencyText) F9.sheet('Lưu ý quan trọng', function (bd, cl) {
                bd.appendChild(F9.notice('bad', r.check.label, r.emergencyText + ' ' + (r.consultText || '')));
                bd.appendChild(h('div', { class: 'btn-row' }, [F9.btn('Đã hiểu', 'primary', cl)]));
              });
              else if (r.check) F9.toast(r.check.label + '. ' + (r.consultText || ''), 'warn');
              else F9.toast('Đã lưu số đo', '', r.replaced ? undefined : { undo: function () { return F9.del(F9.fam(fid, '/health/' + sid + '/measures/' + r.id)).then(reload); } });
            });
          });
        });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
    });
  }

  // ---------- chỉ số người lớn ----------
  function viewVitals(fid, sid, d) {
    var n = [];
    var kinds = [['bp', 'Huyết áp'], ['glucose', 'Đường huyết'], ['weight', 'Cân nặng']];
    var cur = vkindOf[sid] || 'bp';
    n.push(h('div', { class: 'optwrap' }, [F9.chips(kinds, [cur], function (v) { vkindOf[sid] = v[0]; F9.rerender(); }, { single: true })]));
    var ms = (d.measures || []).filter(function (m) { return m.kind === cur; });
    if (!ms.length) { n.push(F9.empty('Chưa có số đo', 'Bấm "Thêm số đo" để ghi ' + KIND_NAME[cur].toLowerCase() + '.', null, 'heart')); return n; }
    var recent = ms.slice(-30);
    var t0 = Date.parse(recent[0].day + 'T00:00:00Z');
    var X = function (m) { return Math.round((Date.parse(m.day + 'T00:00:00Z') - t0) / 86400000); };
    var lastEmerg = recent[recent.length - 1].check && recent[recent.length - 1].check.emergency;
    if (lastEmerg) n.push(F9.notice('bad', 'Số đo gần nhất rất bất thường so với ngưỡng tham khảo', EMERGENCY));
    var days = recent.map(function (m) { return { v: X(m), label: F9.dm(m.day) }; });
    var xmax = Math.max(X(recent[recent.length - 1]), 1);
    var svg;
    if (cur === 'bp') {
      var vals = recent.map(function (m) { return m.v1; }).concat(recent.map(function (m) { return m.v2; }));
      svg = F9.chart.line({ title: 'Biểu đồ huyết áp', desc: 'Hai đường là số trên và số dưới; vạch đứt là ngưỡng tham khảo 140 và 90.', xMin: 0, xMax: xmax, yMin: Math.min(60, Math.min.apply(null, vals) - 5), yMax: Math.max(150, Math.max.apply(null, vals) + 5),
        xTicks: F9.chart.dayTicks(days, 4), refs: [{ y: 140, cls: 'ch-refhi' }, { y: 90, cls: 'ch-refhi' }],
        lines: [{ cls: 'ch-me', dots: true, points: recent.map(function (m) { return [X(m), m.v1, 'lv-' + (m.check ? m.check.level : 'ok')]; }) }, { cls: 'ch-me2', dots: true, points: recent.map(function (m) { return [X(m), m.v2]; }) }] });
    } else {
      var vv = recent.map(function (m) { return m.v1; });
      var refs = cur === 'glucose' ? [{ y: 7, cls: 'ch-refhi' }, { y: 3.9, cls: 'ch-reflo' }] : [];
      svg = F9.chart.line({ title: 'Biểu đồ ' + KIND_NAME[cur].toLowerCase(), desc: cur === 'glucose' ? 'Vạch đứt là ngưỡng tham khảo lúc đói 7,0 và 3,9 mmol/L.' : '', xMin: 0, xMax: xmax, yMin: Math.max(0, Math.min.apply(null, vv.concat(cur === 'glucose' ? [3.5] : [])) * 0.9 - 1), yMax: Math.max.apply(null, vv.concat(cur === 'glucose' ? [7.5] : [])) * 1.08 + 1,
        xTicks: F9.chart.dayTicks(days, 4), refs: refs, lines: [{ cls: 'ch-me', dots: true, points: recent.map(function (m) { return [X(m), m.v1, 'lv-' + (m.check ? m.check.level : 'ok')]; }) }] });
    }
    n.push(h('div', { class: 'card' }, [h('div', { class: 'b', text: KIND_NAME[cur] + ' theo thời gian (' + UNIT[cur] + ')' }), h('div', { class: 'chartbox' }, [svg]),
      cur === 'bp' ? h('div', { class: 'legend small muted' }, [h('span', { class: 'lg lg-me', text: 'Số trên (tâm thu)' }), h('span', { class: 'lg lg-me2', text: 'Số dưới (tâm trương)' })]) : null,
      cur !== 'weight' ? h('p', { class: 'small muted mt', text: d.notes.thresholds }) : null]));
    n.push(h('div', { class: 'sec' }, [h('span', { text: 'Các lần đo gần đây' })]));
    n.push(h('div', { class: 'list' }, ms.slice(-15).reverse().map(function (m) { return measureRow(fid, sid, d, m); })));
    if (cur !== 'weight') n.push(F9.notice('info', 'Ngưỡng tham khảo, không phải chẩn đoán', 'Màu chỉ để nhắc bạn: nếu số đo ở mức "cao" hoặc "thấp" so với ngưỡng, nên trao đổi với bác sĩ. ' + EMERGENCY));
    return n;
  }

  // ---------- tiêm chủng ----------
  var VCHIP = { done: ['Đã tiêm', 'ok'], overdue: ['Quá hạn, nên tiêm bù', 'warn'], soon: ['Sắp tới hạn', 'info'], later: ['Chưa tới hạn', ''] };
  function vaccineRow(fid, sid, d, v) {
    var st = VCHIP[v.status];
    var sub = v.status === 'done' ? 'Đã tiêm ngày ' + fmtDate(v.doneOn) : (v.dueDate ? 'Dự kiến ' + fmtDate(v.dueDate) : 'Chưa có ngày') + (v.earliest ? ' · sớm nhất từ ' + fmtDate(v.earliest) : '');
    return h('div', { class: 'list-row hvax' }, [
      h('button', { type: 'button', class: 'col', onclick: function () { vaccineSheet(fid, sid, d, v); } }, [h('div', { class: 'b', text: v.name + (v.dose > 1 || !v.custom ? ' · mũi ' + v.dose : '') }), h('div', { class: 'muted small', text: sub }), h('div', { class: 'chips' }, [F9.chip(st[0], st[1])])]),
      d.sections.write && v.status !== 'done' ? F9.btn('Đã tiêm', 'ghost xs', function () { setVaccineDone(fid, sid, v, d.today); }) : null,
    ]);
  }
  function setVaccineDone(fid, sid, v, day) {
    return F9.post(F9.fam(fid, '/health/' + sid + '/vaccines/' + v.id), { doneOn: day }).then(function () {
      return reload().then(function () { F9.toast('Đã ghi mũi tiêm', '', { undo: function () { return F9.post(F9.fam(fid, '/health/' + sid + '/vaccines/' + v.id), { doneOn: null }).then(reload); } }); });
    }, F9.fail);
  }
  function vaccineSheet(fid, sid, d, v) {
    F9.sheet(v.name, function (body, close) {
      body.appendChild(h('p', { class: 'muted', text: 'Mũi ' + v.dose + (v.dueDate ? ' · dự kiến ' + fmtDate(v.dueDate) : '') }));
      if (!d.sections.write) return;
      var done = h('input', { type: 'date', value: v.doneOn || '', max: d.today, 'aria-label': 'Ngày đã tiêm' });
      var due = h('input', { type: 'date', value: v.dueDate || '', 'aria-label': 'Ngày dự kiến' });
      body.appendChild(F9.field('Ngày đã tiêm', done, 'Để trống nếu chưa tiêm.'));
      body.appendChild(F9.field('Ngày dự kiến', due));
      var go = F9.btn('Lưu', 'primary block', function () {
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/health/' + sid + '/vaccines/' + v.id), { doneOn: done.value || null, dueDate: due.value || null }).then(function () { close(); F9.toast('Đã lưu'); return reload(); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
      if (v.custom) body.appendChild(h('div', { class: 'btn-row' }, [F9.btn('Xóa mũi này', 'ghost danger-t', function () {
        F9.del(F9.fam(fid, '/health/' + sid + '/vaccines/' + v.id)).then(function () { close(); F9.toast('Đã xóa'); return reload(); }, F9.fail);
      })]));
    });
  }
  function addVaccineSheet(fid, sid, d) {
    F9.sheet('Thêm mũi tiêm khác', function (body, close) {
      var name = F9.text({ maxlength: 80, placeholder: 'Ví dụ: Cúm mùa', 'aria-label': 'Tên vắc xin', list: 'vxs' });
      var dl = h('datalist', { id: 'vxs' }, (d.vaccineInfo.suggestions || []).map(function (s) { return h('option', { value: s }); }));
      var due = h('input', { type: 'date', 'aria-label': 'Ngày dự kiến' }); var done = h('input', { type: 'date', max: d.today, 'aria-label': 'Ngày đã tiêm' });
      body.appendChild(F9.field('Tên vắc xin', name, 'Vắc xin dịch vụ: hãy theo tư vấn của bác sĩ, app không tự đề xuất lịch.')); body.appendChild(dl);
      body.appendChild(h('div', { class: 'grid2' }, [F9.field('Dự kiến tiêm', due), F9.field('Đã tiêm ngày', done)]));
      var go = F9.btn('Lưu', 'primary block', function () {
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/health/' + sid + '/vaccines'), { name: name.value, dueDate: due.value || null, doneOn: done.value || null }, { idem: 'hvax' }).then(function () { close(); F9.toast('Đã thêm'); return reload(); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
    });
  }
  function viewVaccines(fid, sid, d) {
    var n = []; var v = d.vaccines || [];
    n.push(F9.notice('info', 'Lịch tiêm chủng mở rộng của Việt Nam', 'Theo ' + d.vaccineInfo.source + ' Chỉ để tham khảo; bé có bệnh nền hoặc đã tiêm bù hãy theo hướng dẫn của cơ sở tiêm chủng.'));
    if (!v.length) {
      var canGen = d.sections.write && d.subject.birthDate;
      n.push(F9.empty('Chưa có lịch tiêm', d.subject.birthDate ? 'Lập lịch các mũi tiêm chủng mở rộng theo ngày sinh của bé.' : 'Hãy nhập ngày sinh của bé trước.', canGen ? F9.btn('Lập lịch tiêm chủng', 'primary', function () {
        F9.post(F9.fam(fid, '/health/' + sid + '/vaccines/schedule'), {}, { idem: 'hsched' }).then(function (r) { F9.toast('Đã thêm ' + r.added + ' mũi vào lịch'); return reload(); }, F9.fail);
      }) : (d.sections.manage ? F9.btn('Nhập ngày sinh', 'ghost', function () { profileSheet(fid, sid, d); }) : null), 'heart'));
    }
    var groups = [['overdue', 'Quá hạn, nên tiêm bù'], ['soon', 'Sắp tới hạn'], ['later', 'Sau này'], ['done', 'Đã tiêm']];
    groups.forEach(function (g) {
      var items = v.filter(function (x) { return x.status === g[0]; });
      if (!items.length) return;
      n.push(h('div', { class: 'sec' }, [h('span', { text: g[1] + ' (' + items.length + ')' })]));
      n.push(h('div', { class: 'list' }, items.map(function (x) { return vaccineRow(fid, sid, d, x); })));
    });
    if (d.sections.write) n.push(h('div', { class: 'btn-row' }, [F9.btn('Thêm mũi tiêm khác', 'ghost', function () { addVaccineSheet(fid, sid, d); })]));
    n.push(h('details', { class: 'srcnote small muted' }, [h('summary', { text: 'Nguồn và mức kiểm chứng' }), h('p', { text: d.vaccineInfo.verification }), h('p', { text: d.vaccineInfo.note })]));
    return n;
  }

  // ---------- thuốc ----------
  function medRow(fid, sid, d, m, compact) {
    var todayTaken = {}; m.taken.forEach(function (t) { if (t.day === d.today) todayTaken[t.time] = true; });
    var slots = m.times.map(function (t) {
      var on = !!todayTaken[t];
      return h('button', { type: 'button', class: 'slot' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', disabled: !d.sections.write, onclick: function () { toggleTake(fid, sid, m, t, on, d.today); } }, [on ? F9.ico('check', 18, 3) : null, (on ? 'Đã uống ' : 'Uống ') + t]);
    });
    var kids = [h('button', { type: 'button', class: 'col medname', onclick: function () { if (d.sections.write && !compact) medSheet(fid, sid, d, m); else if (!compact) return; }, 'aria-label': m.name }, [h('div', { class: 'b', text: m.name }), h('div', { class: 'muted small', text: [m.dose, m.endDate ? 'đến ' + fmtDate(m.endDate) : ''].filter(Boolean).join(' · ') }),
      h('div', { class: 'chips' }, [m.stopped ? F9.chip('Đã dừng') : null, m.lowStock ? F9.chip('Sắp hết thuốc', 'warn') : null, m.stock !== null && !m.lowStock ? F9.chip('Còn ' + m.stock + ' liều') : null, !m.remind ? F9.chip('Không nhắc') : null])])];
    return h('div', { class: 'list-row hmed' }, [h('div', { class: 'col' }, [kids[0], slots.length ? h('div', { class: 'slots' }, slots) : null])]);
  }
  function toggleTake(fid, sid, m, time, on, day) {
    var p = F9.fam(fid, '/health/' + sid + '/meds/' + m.id + (on ? '/untake' : '/take'));
    F9.post(p, { time: time, day: day }).then(function () {
      return reload().then(function () {
        if (!on) F9.toast('Đã ghi: uống lúc ' + time, '', { undo: function () { return F9.post(F9.fam(fid, '/health/' + sid + '/meds/' + m.id + '/untake'), { time: time, day: day }).then(reload); } });
        else F9.toast('Đã bỏ dấu uống');
      });
    }, F9.fail);
  }
  function viewMeds(fid, sid, d) {
    var n = [F9.notice('info', 'App chỉ nhắc theo đơn của bác sĩ', 'App không tư vấn liều dùng. Tên thuốc và liều hãy ghi đúng theo đơn.')];
    var ms = d.meds || [];
    if (!ms.length) { n.push(F9.empty('Chưa có thuốc', d.sections.write ? 'Bấm "Thêm thuốc" để đặt giờ nhắc uống.' : 'Chưa có thuốc đang dùng.', null, 'heart')); return n; }
    var act = ms.filter(function (m) { return m.active; }); var rest = ms.filter(function (m) { return !m.active; });
    if (act.length) { n.push(h('div', { class: 'sec' }, [h('span', { text: 'Đang dùng' })])); n.push(h('div', { class: 'list' }, act.map(function (m) { return medRow(fid, sid, d, m); }))); }
    if (rest.length) { n.push(h('div', { class: 'sec' }, [h('span', { text: 'Đã dừng hoặc chưa tới ngày' })])); n.push(h('div', { class: 'list' }, rest.map(function (m) { return medRow(fid, sid, d, m); }))); }
    return n;
  }
  var PRESET_TIMES = ['06:00', '07:00', '08:00', '12:00', '18:00', '20:00', '22:00'];
  function medSheet(fid, sid, d, m) {
    F9.sheet(m ? 'Sửa thuốc' : 'Thêm thuốc', function (body, close) {
      var name = F9.text({ maxlength: 60, placeholder: 'Tên thuốc theo đơn', 'aria-label': 'Tên thuốc', value: m ? m.name : '' });
      var dose = F9.text({ maxlength: 60, placeholder: 'Ví dụ: 1 gói, 5 ml (ghi theo đơn)', 'aria-label': 'Liều', value: m ? m.dose : '' });
      var times = m ? m.times.slice() : ['08:00'];
      var timeBox = h('div');
      function paintTimes() {
        F9.clear(timeBox);
        timeBox.appendChild(F9.chips(PRESET_TIMES.concat(times.filter(function (t) { return PRESET_TIMES.indexOf(t) < 0; })).sort().map(function (t) { return [t, t]; }), times, function (v) { times = v; }));
        var custom = h('input', { type: 'time', 'aria-label': 'Giờ khác' });
        timeBox.appendChild(h('div', { class: 'row mt' }, [h('div', { class: 'col' }, [custom]), F9.btn('Thêm giờ', 'ghost xs', function () { if (custom.value && times.indexOf(custom.value) < 0 && times.length < 6) { times.push(custom.value); times.sort(); paintTimes(); } })]));
      }
      paintTimes();
      var start = h('input', { type: 'date', value: m ? m.startDate : d.today, 'aria-label': 'Ngày bắt đầu' });
      var end = h('input', { type: 'date', value: m && m.endDate ? m.endDate : '', 'aria-label': 'Ngày kết thúc' });
      var stock = F9.text({ inputmode: 'numeric', maxlength: 5, placeholder: 'Số liều còn lại (không bắt buộc)', 'aria-label': 'Số liều còn lại', value: m && m.stock !== null ? String(m.stock) : '' });
      var remind = m ? m.remind : true;
      body.appendChild(F9.field('Tên thuốc', name)); body.appendChild(F9.field('Liều (ghi theo đơn của bác sĩ)', dose));
      body.appendChild(F9.field('Giờ uống trong ngày', timeBox));
      body.appendChild(h('div', { class: 'grid2' }, [F9.field('Từ ngày', start), F9.field('Đến ngày (nếu có)', end)]));
      body.appendChild(F9.field('Thuốc còn lại', stock, 'Nhập để app báo khi sắp hết.'));
      body.appendChild(F9.switchRow('Nhắc uống thuốc', 'Thông báo chỉ ghi "Nhắc sức khỏe", không có tên thuốc.', remind, function (v) { remind = v; }));
      var go = F9.btn('Lưu', 'primary block', function () {
        var p = { name: name.value, dose: dose.value, times: times, startDate: start.value, endDate: end.value || null, stock: stock.value === '' ? null : stock.value, remind: remind };
        return F9.busy(go, function () { return F9.post(F9.fam(fid, '/health/' + sid + '/meds' + (m ? '/' + m.id : '')), p, { idem: 'hmed' }).then(function () { close(); F9.toast('Đã lưu'); return reload(); }); });
      });
      body.appendChild(h('div', { class: 'mt' }, [go]));
      if (m) body.appendChild(h('div', { class: 'btn-row' }, [
        F9.btn(m.stopped ? 'Dùng lại' : 'Dừng thuốc này', 'ghost', function () { F9.post(F9.fam(fid, '/health/' + sid + '/meds/' + m.id), { stop: !m.stopped }).then(function () { close(); F9.toast(m.stopped ? 'Đã bật lại' : 'Đã dừng'); return reload(); }, F9.fail); }),
        F9.btn('Xóa', 'ghost danger-t', function () { F9.confirm({ title: 'Xóa thuốc', text: 'Xóa "' + m.name + '" và lịch sử uống?', ok: 'Xóa', danger: true }).then(function (y) { if (y) F9.del(F9.fam(fid, '/health/' + sid + '/meds/' + m.id)).then(function () { close(); F9.toast('Đã xóa'); return reload(); }, F9.fail); }); }),
      ]));
    });
  }

  // ---------- hồ sơ khám ----------
  function viewVisits(fid, sid, d) {
    var n = [F9.notice('info', 'Ghi ngắn gọn, chưa lưu ảnh', 'Lần này app chưa lưu ảnh đơn thuốc hay kết quả khám. Hãy ghi kết luận và đơn thuốc bằng chữ.')];
    var vs = d.visits || [];
    if (!vs.length) { n.push(F9.empty('Chưa có lần khám', d.sections.write ? 'Bấm "Thêm lần khám" để ghi lại.' : null, null, 'heart')); return n; }
    n.push(h('div', { class: 'list' }, vs.map(function (v) {
      return h('button', { type: 'button', class: 'list-row tap', onclick: function () { visitSheet(fid, sid, d, v); } }, [h('div', { class: 'col' }, [h('div', { class: 'b', text: fmtDate(v.day) + (v.place ? ' · ' + v.place : '') }), h('div', { class: 'muted small', text: [v.reason, v.doctor].filter(Boolean).join(' · ') || 'Lần khám' }),
        v.conclusion ? h('div', { class: 'small', text: v.conclusion }) : null, h('div', { class: 'chips' }, [v.recheckDate ? F9.chip('Tái khám ' + F9.dm(v.recheckDate), 'info') : null, v.inCalendar ? F9.chip('Đã vào lịch') : null])]), F9.ico('chev', 20)]);
    })));
    return n;
  }
  function visitSheet(fid, sid, d, v) {
    F9.sheet(v ? 'Lần khám ' + fmtDate(v.day) : 'Thêm lần khám', function (body, close) {
      var ro = !d.sections.write;
      var day = h('input', { type: 'date', value: v ? v.day : d.today, max: d.today, 'aria-label': 'Ngày khám', disabled: ro });
      var place = F9.text({ maxlength: 100, 'aria-label': 'Nơi khám', value: v ? v.place : '', disabled: ro }); var doctor = F9.text({ maxlength: 60, 'aria-label': 'Bác sĩ', value: v ? v.doctor : '', disabled: ro });
      var reason = F9.text({ maxlength: 150, 'aria-label': 'Lý do khám', value: v ? v.reason : '', disabled: ro });
      var concl = h('textarea', { rows: 3, maxlength: 400, 'aria-label': 'Kết luận', disabled: ro }); concl.value = v ? v.conclusion : '';
      var presc = h('textarea', { rows: 3, maxlength: 400, 'aria-label': 'Đơn thuốc', disabled: ro }); presc.value = v ? v.prescription : '';
      var recheck = h('input', { type: 'date', value: v && v.recheckDate ? v.recheckDate : '', min: d.today, 'aria-label': 'Ngày tái khám', disabled: ro });
      var cal = v ? v.inCalendar : d.subject.kind === 'child';
      body.appendChild(F9.field('Ngày khám', day)); body.appendChild(F9.field('Nơi khám', place)); body.appendChild(F9.field('Bác sĩ', doctor)); body.appendChild(F9.field('Lý do khám', reason));
      body.appendChild(F9.field('Kết luận (ngắn)', concl)); body.appendChild(F9.field('Đơn thuốc (ghi bằng chữ, chưa lưu ảnh)', presc));
      body.appendChild(F9.field('Ngày tái khám (nếu có)', recheck));
      if (!ro) {
        body.appendChild(F9.switchRow('Thêm tái khám vào lịch gia đình', 'Lịch chỉ ghi "Tái khám" và tên con; mọi người trong nhà sẽ thấy sự kiện này.', cal, function (x) { cal = x; }));
        var go = F9.btn('Lưu', 'primary block', function () {
          var p = { day: day.value, place: place.value, doctor: doctor.value, reason: reason.value, conclusion: concl.value, prescription: presc.value, recheckDate: recheck.value || null, addToCalendar: cal };
          return F9.busy(go, function () { return F9.post(F9.fam(fid, '/health/' + sid + '/visits' + (v ? '/' + v.id : '')), p, { idem: 'hvis' }).then(function () { close(); F9.toast('Đã lưu'); return reload(); }); });
        });
        body.appendChild(h('div', { class: 'mt' }, [go]));
        if (v) body.appendChild(h('div', { class: 'btn-row' }, [F9.btn('Xóa lần khám', 'ghost danger-t', function () { F9.confirm({ title: 'Xóa lần khám', text: 'Xóa lần khám này (và lịch tái khám đã tạo)?', ok: 'Xóa', danger: true }).then(function (y) { if (y) F9.del(F9.fam(fid, '/health/' + sid + '/visits/' + v.id)).then(function () { close(); F9.toast('Đã xóa'); return reload(); }, F9.fail); }); })]));
      }
    });
  }

  // ---------- in tóm tắt (CSS in) ----------
  function printSummary(d) {
    var old = document.getElementById('printbox'); if (old) old.parentNode.removeChild(old);
    var box = h('div', { id: 'printbox', class: 'printbox' });
    var s = d.subject;
    box.appendChild(h('h1', { text: 'Tóm tắt sức khỏe: ' + s.name }));
    box.appendChild(h('p', { text: [s.age, s.sex === 'nam' ? 'Nam' : s.sex === 'nu' ? 'Nữ' : '', s.birthDate ? 'Sinh ' + fmtDate(s.birthDate) : '', 'In ngày ' + fmtDate(d.today)].filter(Boolean).join(' · ') }));
    function table(title, head, rows) {
      if (!rows.length) return;
      box.appendChild(h('h2', { text: title }));
      box.appendChild(h('table', {}, [h('thead', {}, [h('tr', {}, head.map(function (x) { return h('th', { text: x }); }))]), h('tbody', {}, rows.map(function (r) { return h('tr', {}, r.map(function (x) { return h('td', { text: x == null ? '' : String(x) }); })); }))]));
    }
    var ms = d.measures || [];
    ['weight', 'height', 'head'].forEach(function (k) { table(KIND_NAME[k], ['Ngày', 'Giá trị (' + UNIT[k] + ')'], ms.filter(function (m) { return m.kind === k; }).map(function (m) { return [fmtDate(m.day), nf(m.v1)]; })); });
    table('Huyết áp', ['Ngày', 'Tâm thu/Tâm trương', 'Mạch', 'So với ngưỡng tham khảo'], ms.filter(function (m) { return m.kind === 'bp'; }).map(function (m) { return [fmtDate(m.day), nf(m.v1) + '/' + nf(m.v2), m.v3 ? nf(m.v3) : '', m.check ? m.check.label : '']; }));
    table('Đường huyết (mmol/L)', ['Ngày', 'Giá trị', 'Thời điểm', 'So với ngưỡng tham khảo'], ms.filter(function (m) { return m.kind === 'glucose'; }).map(function (m) { return [fmtDate(m.day), nf(m.v1), m.ctx === 'doi' ? 'Lúc đói' : m.ctx === 'sau_an' ? 'Sau ăn 2 giờ' : 'Khác', m.check ? m.check.label : '']; }));
    if (d.growth && d.growth.ready) Object.keys(d.growth.indicators).forEach(function (k) { var i = d.growth.indicators[k]; if (i.last.place) table('Vị trí so với chuẩn WHO: ' + i.label, ['Ngày', 'Giá trị', 'Phần trăm (tham khảo)'], i.points.filter(function (p) { return p.place; }).map(function (p) { return [fmtDate(p.day), nf(p.value) + ' ' + i.unit, nf(p.place.pct)]; })); });
    if (d.vaccines) table('Tiêm chủng', ['Mũi', 'Dự kiến', 'Đã tiêm'], d.vaccines.map(function (v) { return [v.name + ' · mũi ' + v.dose, fmtDate(v.dueDate), v.doneOn ? fmtDate(v.doneOn) : '']; }));
    if (d.meds) table('Thuốc', ['Thuốc', 'Liều (theo đơn)', 'Giờ uống', 'Thời gian'], d.meds.filter(function (m) { return m.active; }).map(function (m) { return [m.name, m.dose, m.times.join(', '), fmtDate(m.startDate) + (m.endDate ? ' - ' + fmtDate(m.endDate) : '')]; }));
    if (d.visits) table('Hồ sơ khám', ['Ngày', 'Nơi, bác sĩ', 'Lý do', 'Kết luận', 'Đơn thuốc', 'Tái khám'], d.visits.map(function (v) { return [fmtDate(v.day), [v.place, v.doctor].filter(Boolean).join(', '), v.reason, v.conclusion, v.prescription, fmtDate(v.recheckDate)]; }));
    box.appendChild(h('p', { class: 'pdisc', text: d.notes.disclaimer + ' Ngưỡng và phần trăm chỉ để tham khảo, không phải chẩn đoán. ' + EMERGENCY }));
    document.body.appendChild(box);
    document.body.classList.add('printing');
    var done = function () { document.body.classList.remove('printing'); if (box.parentNode) box.parentNode.removeChild(box); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); }, 50);
  }
})();
