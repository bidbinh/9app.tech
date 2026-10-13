/* 9family: BẢN XEM THỬ chạy hoàn toàn trong trình duyệt.
   Lớp giả API (thay window.fetch) nạp dữ liệu mẫu BỊA (gia đình "Nhà Cây Sồi", hai con Mía và Sóc), mọi thay đổi chỉ lưu trong bộ nhớ trang:
   tải lại trang là về dữ liệu mẫu ban đầu. Không gọi máy chủ nào, không lưu gì lên mạng. Nguồn: scripts/preview-shim.js (build: scripts/build-preview.js). */
(function () {
  'use strict';
  var L = window.__lunar;
  var p2 = function (n) { return ('0' + n).slice(-2); };
  var DAY = 86400000;
  function vnNow() { return new Date(Date.now() + 7 * 3600000); }
  function todayVN() { return vnNow().toISOString().slice(0, 10); }
  function addDays(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekday(day) { var w = new Date(day + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }
  function atMs(day, hhmm) { var t = (hhmm || '00:00').split(':'); return Date.parse(day + 'T00:00:00Z') + (+t[0] - 7) * 3600000 + +t[1] * 60000; }
  function hex(n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; }
  function uid() { return hex(8) + '-' + hex(4) + '-4' + hex(3) + '-8' + hex(3) + '-' + hex(12); }
  var T = todayVN();
  var rev = 1;

  // ---------- dữ liệu mẫu bịa ----------
  var FID = uid();
  var M = { me: uid(), bo: uid(), ba: uid(), hoa: uid() };
  var K = { mia: uid(), soc: uid() };
  var members = [
    { id: M.me, name: 'Chị Lan Anh', relation: 'me', role: 'chu', external: false, phone: '', note: '', pending: false },
    { id: M.bo, name: 'Anh Hùng', relation: 'bo', role: 'thanh_vien', external: false, phone: '', note: '', pending: false },
    { id: M.ba, name: 'Bà Tư', relation: 'ba', role: 'thanh_vien', external: false, phone: '', note: '', pending: false },
    { id: M.hoa, name: 'Cô Hoa hàng xóm', relation: 'don_ho', role: 'thanh_vien', external: true, phone: '0900 000 123', note: 'Áo xanh, xe Vision', pending: false },
  ];
  var children = [
    { id: K.mia, name: 'Mía', birthYear: 2017, school: 'Tiểu học Cầu Vồng', grade: '4B', color: 'hong', note: 'Dị ứng tôm. Chờ ở cổng B.' },
    { id: K.soc, name: 'Sóc', birthYear: 2021, school: 'Mầm non Ánh Dương', grade: 'Lá 2', color: 'xanh', note: '' },
  ];
  var family = { id: FID, name: 'Nhà Cây Sồi', esc: { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 } };
  var events = [];
  var exceptions = {}; // eventId -> { day: {action, ...} }
  function ev(o) {
    var e = Object.assign({ id: uid(), title: '', kind: 'khac', location: '', note: '', allDay: false, start: null, end: null, startDate: T, untilDate: null, recType: 'none', recDays: [], lunarMonth: null, lunarDay: null, notifyOffsets: [30], checklist: [], childIds: [], memberIds: [], source: null, createdBy: M.me }, o);
    events.push(e); return e;
  }
  ev({ title: 'Toán tư duy', kind: 'hoc_them', childIds: [K.mia], memberIds: [M.me], start: '09:30', end: '11:30', recType: 'weekly', recDays: [6], location: 'Trung tâm Sao Mai', checklist: ['Sách bài tập', 'Bút chì'] });
  ev({ title: 'Tiếng Anh online', kind: 'hoc_them', childIds: [K.soc], start: '18:00', end: '18:45', recType: 'weekly', recDays: [2, 4], location: 'Ở nhà' });
  ev({ title: 'Piano', kind: 'nang_khieu', childIds: [K.mia], memberIds: [M.bo], start: '17:00', end: '17:45', recType: 'weekly', recDays: [3], location: 'Nhạc viện Hoa Mai' });
  ev({ title: 'Bóng rổ', kind: 'nang_khieu', childIds: [K.soc, K.mia], start: '08:00', end: '09:30', recType: 'weekly', recDays: [7], location: 'Sân Thể Công' });
  ev({ title: 'Học bơi', kind: 'nang_khieu', childIds: [K.soc], memberIds: [M.ba], start: '15:30', end: '16:15', recType: 'weekly', recDays: [1, 5], location: 'Bể bơi Thanh Xuân' });
  ev({ title: 'Khám răng', kind: 'kham', childIds: [K.mia], memberIds: [M.me], startDate: addDays(T, 3), start: '14:00', location: 'Nha khoa Nụ Cười' });
  ev({ title: 'Họp phụ huynh', kind: 'hop_phu_huynh', childIds: [K.mia], memberIds: [M.me, M.bo], startDate: addDays(T, 4), start: '19:30', end: '20:30', location: 'Trường Cầu Vồng, phòng 4B' });
  ev({ title: 'Sinh nhật Mía', kind: 'ngay_quan_trong', childIds: [K.mia], startDate: '2017-' + addDays(T, 9).slice(5), allDay: true, recType: 'yearly', notifyOffsets: [1440] });
  var lt = L.solarToLunar(addDays(T, 2));
  ev({ title: 'Giỗ cụ nội', kind: 'ngay_quan_trong', startDate: '2020-01-01', allDay: true, recType: 'yearly_lunar', lunarDay: lt.day, lunarMonth: lt.month, notifyOffsets: [1440] });

  var rides = []; // khuôn tuần
  function ride(childId, dir, wds, time, place, p0, p1, p2) { wds.forEach(function (wd) { rides.push({ id: uid(), childId: childId, dir: dir, weekday: wd, time: time, place: place, p0: p0 || null, p1: p1 || null, p2: p2 || null }); }); }
  var WK = [1, 2, 3, 4, 5];
  ride(K.mia, 'dua', WK, '07:00', 'Cổng trường', M.bo, M.me);
  ride(K.mia, 'don', WK, '16:30', 'Cổng B', M.me, M.bo, M.ba);
  ride(K.soc, 'dua', WK, '07:30', 'Cổng mầm non', M.me);
  ride(K.soc, 'don', WK, '11:00', 'Cổng mầm non', M.hoa);
  ride(K.soc, 'don', [6], '12:00', 'Lớp năng khiếu');
  var rideDays = {}; // `${rideId}|${day}` -> ca của một ngày

  var tasks = [
    { id: uid(), title: 'Đóng tiền học phí tháng này', assigneeId: M.me, due: addDays(T, 1), done: false, doneAt: null, doneBy: '', createdBy: M.me },
    { id: uid(), title: 'Mua quà sinh nhật cho Mía', assigneeId: null, due: addDays(T, 3), done: false, doneAt: null, doneBy: '', createdBy: M.me },
    { id: uid(), title: 'Ký sổ liên lạc của Sóc', assigneeId: null, due: null, done: false, doneAt: null, doneBy: '', createdBy: M.me },
  ];
  var shopping = ['Sữa tươi', 'Trứng gà', 'Bánh mì', 'Cà chua', 'Thịt bò', 'Rau muống', 'Nước giặt'].map(function (t) { return { id: uid(), text: t, bought: false, addedBy: 'Chị Lan Anh', boughtBy: '', addedById: M.me }; });
  var notifs = [
    { id: 3, type: 'ride', title: 'Sắp tới giờ đón Mía', body: '', link: '#/f/' + FID + '/rides', at: Date.now() - 20 * 60000, read: false },
    { id: 2, type: 'task', title: 'Anh Hùng giao việc cho bạn', body: 'Đóng tiền học phí tháng này', link: '#/f/' + FID + '/tasks', at: Date.now() - 3 * 3600000, read: false },
    { id: 1, type: 'event', title: 'Ngày mai: Tiếng Anh online', body: '', link: '#/f/' + FID + '/cal', at: Date.now() - 20 * 3600000, read: true },
  ];

  // ---------- lặp sự kiện (rút gọn từ src/recur.js) ----------
  var lcache = {};
  function lunarOf(day) { return lcache[day] || (lcache[day] = L.solarToLunar(day)); }
  function lunarHit(e, day, anyMonth) {
    var l = lunarOf(day);
    if (!anyMonth && (l.month !== e.lunarMonth || l.leap)) return false;
    if (l.day === e.lunarDay) return true;
    return e.lunarDay === 30 && l.day === 29 && lunarOf(addDays(day, 1)).day === 1;
  }
  function matches(e, day) {
    if (day < e.startDate) return false;
    if (e.untilDate && day > e.untilDate) return false;
    switch (e.recType) {
      case 'none': return day === e.startDate;
      case 'daily': return true;
      case 'weekly': return e.recDays.indexOf(weekday(day)) >= 0;
      case 'yearly': return day.slice(5) === e.startDate.slice(5);
      case 'yearly_lunar': return lunarHit(e, day, false);
      case 'monthly_lunar': return lunarHit(e, day, true);
      default: return false;
    }
  }
  function occurrences(from, to, childId) {
    var out = [];
    events.forEach(function (e) {
      if (childId && e.childIds.indexOf(childId) < 0) return;
      for (var d = from; d <= to; d = addDays(d, 1)) {
        if (!matches(e, d)) continue;
        var x = (exceptions[e.id] || {})[d];
        if (x && x.action === 'skip') continue;
        var o = { eventId: e.id, day: d, kind: e.kind, allDay: e.allDay, title: e.title, location: e.location, note: e.note, start: e.allDay ? null : e.start, end: e.allDay ? null : e.end, edited: false,
          childIds: e.childIds, memberIds: e.memberIds, checklist: e.checklist, recurring: e.recType !== 'none', recType: e.recType, notifyOffsets: e.notifyOffsets, source: null };
        if (x && x.action === 'edit') { o.edited = true; if (x.title != null) o.title = x.title; if (x.location != null) o.location = x.location; if (!e.allDay) { if (x.start != null) o.start = x.start; if (x.end != null) o.end = x.end || null; } }
        out.push(o);
      }
    });
    out.sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : (a.allDay ? '' : a.start || '') < (b.allDay ? '' : b.start || '') ? -1 : 1; });
    return out;
  }
  function lunarMap(from, to) { var m = {}; for (var d = from; d <= to; d = addDays(d, 1)) { var l = lunarOf(d); m[d] = [l.day, l.month, l.leap ? 1 : 0]; } return m; }

  // ---------- ca đưa đón ----------
  function mem(id) { return members.filter(function (m) { return m.id === id; })[0]; }
  function kid(id) { return children.filter(function (c) { return c.id === id; })[0]; }
  var nm = function (id) { var m = mem(id); return m ? m.name : ''; };
  function rideDay(t, day) {
    var key = t.id + '|' + day;
    var r = rideDays[key];
    if (!r) {
      r = rideDays[key] = { id: uid(), tplId: t.id, day: day, childId: t.childId, dir: t.dir, time: t.time, place: t.place, p0: t.p0, p1: t.p1, p2: t.p2, state: 'cho', claimedBy: null, claimedAt: null, doneBy: null, doneAt: null, skipBy: null, skipReason: '', overrideBy: null, overrideReason: '' };
      var at = atMs(day, t.time);
      if (at + 20 * 60000 < Date.now() && t.p0) { // ca đã qua: coi như người phụ trách đã làm xong
        r.state = 'xong'; r.claimedBy = t.p0; r.claimedAt = at - 10 * 60000; r.doneBy = t.p0; r.doneAt = at + 3 * 60000;
      }
    }
    return r;
  }
  function rideOut(r) {
    var k = kid(r.childId) || {}; var p0 = mem(r.p0);
    return { id: r.id, rideId: r.tplId, childId: r.childId, childName: k.name || '', childColor: k.color || 'xanh', dir: r.dir, day: r.day, time: r.time, atTs: atMs(r.day, r.time), place: r.place, state: r.state,
      p0: r.p0, p0Name: nm(r.p0), p0External: !!(p0 && p0.external), p0Phone: p0 && p0.external ? p0.phone : undefined, p0Note: p0 && p0.external ? p0.note : undefined,
      p1: r.p1, p1Name: nm(r.p1), p2: r.p2, p2Name: nm(r.p2), claimedBy: r.claimedBy, claimedName: nm(r.claimedBy), claimedAt: r.claimedAt,
      doneBy: r.doneBy, doneName: nm(r.doneBy), doneAt: r.doneAt, skipName: nm(r.skipBy), skipReason: r.skipReason, overrideName: nm(r.overrideBy), overrideReason: r.overrideReason };
  }
  function ridesOfDay(day) {
    var list = rides.filter(function (t) { return t.weekday === weekday(day); }).map(function (t) { return rideDay(t, day); });
    list.sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
    return list.map(rideOut);
  }
  function findRideDay(id) { for (var k in rideDays) if (rideDays[k].id === id) return rideDays[k]; return null; }

  // ---------- định tuyến ----------
  function err(status, message, code) { return { __status: status, error: { code: code || 'invalid_input', message: message } }; }
  function core() {
    var me = mem(M.me); var l = L.solarToLunar(todayVN());
    return { family: family, me: { id: me.id, name: me.name, role: me.role, relation: me.relation },
      members: members.map(function (m) { return Object.assign({}, m, { isMe: m.id === M.me }); }), children: children,
      caps: { ai: false, push: false, pushKey: '' }, limits: { children: 8 }, rev: rev, now: Date.now(), today: todayVN(), lunar: Object.assign({}, l, { canChi: L.canChiYear(l.year) }) };
  }
  function unread() { return notifs.filter(function (n) { return !n.read; }).length; }
  function taskOut(t) { return t; }
  var NOT_IN_PREVIEW = 'Tính năng này không có trong bản xem thử.';

  function route(method, path, query, body) {
    var m;
    if (method === 'GET' && path === 'api/me') return { families: [{ id: FID, name: family.name, myName: mem(M.me).name, unread: unread() }] };
    if (method === 'GET' && path === 'api/config') return { ai: false, push: { enabled: false } };
    m = /^api\/families\/([0-9a-f-]{36})(\/.*)?$/.exec(path);
    if (!m) return err(404, 'Không tìm thấy', 'not_found');
    if (m[1] !== FID) return err(404, 'Không tìm thấy gia đình này.', 'not_found');
    var sub = m[2] || '';
    var write = method !== 'GET';
    var res = fam(method, sub, query, body || {});
    if (write && res && !res.__status) rev++;
    return res;
  }

  function fam(method, sub, q, b) {
    var m; var today = todayVN();
    if (method === 'GET') {
      if (sub === '') return core();
      if (sub === '/pulse') return { rev: rev, unread: unread(), now: Date.now() };
      if (sub === '/today') {
        var tm = addDays(today, 1); var occ = occurrences(today, tm); var l = L.solarToLunar(today);
        var open = tasks.filter(function (t) { return !t.done && (t.assigneeId === M.me || !t.assigneeId || (t.due && t.due <= tm)); }).slice(0, 6);
        return { now: Date.now(), today: today, lunar: [l.day, l.month, l.leap ? 1 : 0], events: occ.filter(function (o) { return o.day === today; }), tomorrowEvents: occ.filter(function (o) { return o.day === tm; }),
          rides: ridesOfDay(today), tomorrowRides: ridesOfDay(tm), tasks: open.map(function (t) { return { id: t.id, title: t.title, due: t.due, assigneeId: t.assigneeId }; }), unread: unread() };
      }
      if (sub === '/calendar') return { from: q.from, to: q.to, today: today, events: occurrences(q.from, q.to, q.childId), lunar: lunarMap(q.from, q.to) };
      if ((m = /^\/events\/([0-9a-f-]{36})$/.exec(sub))) { var e = events.filter(function (x) { return x.id === m[1]; })[0]; return e ? { event: e, exceptions: [], canEdit: true } : err(404, 'Không tìm thấy sự kiện', 'not_found'); }
      if (sub === '/rides') return { rides: rides.map(function (t) { return { id: t.id, childId: t.childId, dir: t.dir, weekday: t.weekday, time: t.time, place: t.place, p0: t.p0, p1: t.p1, p2: t.p2 }; }) };
      if (sub === '/rides/board') { var day = q.day || today; return { day: day, today: today, now: Date.now(), rides: ridesOfDay(day) }; }
      if (sub === '/rides/history') {
        var out = [];
        for (var i = -30; i <= 0; i++) { var d = addDays(today, i); ridesOfDay(d).forEach(function (r) { if (r.state === 'xong' || r.state === 'bo_qua' || r.state === 'khong_ai' || d < today) out.push(r); }); }
        out.sort(function (a, c) { return c.atTs - a.atTs; });
        return { rides: out.slice(0, 120) };
      }
      if (sub === '/lists') return { tasks: tasks.map(taskOut), shopping: shopping, today: today };
      if (sub.indexOf('/notifications') === 0) return { items: notifs };
      if (sub === '/devices') return { devices: [{ id: uid(), label: 'Điện thoại của bạn (bản xem thử)', current: true, lastUsedAt: new Date().toISOString() }] };
      if (sub === '/ics') return { path: 'ics/ban-xem-thu.ics' };
      return err(404, 'Không có trong bản xem thử', 'not_found');
    }
    // ---- ghi ----
    if (sub === '/events/preview') {
      var e0 = { startDate: b.startDate || today, recType: b.recType || 'none', recDays: b.recDays || [], lunarDay: b.lunarDay, lunarMonth: b.lunarMonth, untilDate: b.untilDate || null, allDay: !!b.allDay };
      var from = e0.startDate > today ? e0.startDate : today; var found = [];
      for (var k = 0; k < 800 && found.length < 4; k++) { var dd = addDays(from, k); if (matches(e0, dd)) { var ll = lunarOf(dd); found.push({ day: dd, weekday: weekday(dd), lunar: [ll.day, ll.month, ll.leap ? 1 : 0] }); } }
      return { next: found };
    }
    if (sub === '/events') {
      if (!String(b.title || '').trim()) return err(400, 'Hãy nhập tên sự kiện');
      var ne = ev({ title: b.title.trim(), kind: b.kind || 'khac', location: b.location || '', note: b.note || '', allDay: !!b.allDay, start: b.allDay ? null : b.start || null, end: b.allDay ? null : b.end || null, startDate: b.startDate || today,
        untilDate: b.untilDate || null, recType: b.recType || 'none', recDays: b.recDays || [], lunarDay: b.lunarDay || null, lunarMonth: b.lunarMonth || null, notifyOffsets: b.notifyOffsets || [], checklist: b.checklist || [], childIds: b.childIds || [], memberIds: b.memberIds || [] });
      return { event: ne };
    }
    if ((m = /^\/events\/([0-9a-f-]{36})$/.exec(sub))) {
      var ex = events.filter(function (x) { return x.id === m[1]; })[0]; if (!ex) return err(404, 'Không tìm thấy sự kiện', 'not_found');
      if (b.__delete) { events.splice(events.indexOf(ex), 1); return { ok: true }; }
      Object.keys(b).forEach(function (kk) { if (kk in ex) ex[kk] = b[kk]; });
      if (b.allDay) { ex.start = null; ex.end = null; }
      return { event: ex };
    }
    if ((m = /^\/events\/([0-9a-f-]{36})\/exceptions$/.exec(sub))) { (exceptions[m[1]] = exceptions[m[1]] || {})[b.day] = { action: b.action, title: b.title, location: b.location, start: b.start, end: b.end }; return { ok: true }; }
    if ((m = /^\/events\/([0-9a-f-]{36})\/end-from$/.exec(sub))) { var ee = events.filter(function (x) { return x.id === m[1]; })[0]; if (ee) ee.untilDate = addDays(b.day, -1); return { ok: true }; }
    if (sub === '/rides') {
      var base = { place: b.place || '', p0: b.p0 || null, p1: b.p1 || null, p2: b.p2 || null };
      var ids = (b.weekdays || []).map(function (wd) { var t = Object.assign({ id: uid(), childId: b.childId, dir: b.dir, weekday: wd, time: b.time }, base); rides.push(t); return t.id; });
      return { ids: ids };
    }
    if ((m = /^\/rides\/([0-9a-f-]{36})$/.exec(sub))) {
      var t = rides.filter(function (x) { return x.id === m[1]; })[0]; if (!t) return err(404, 'Không tìm thấy ca', 'not_found');
      if (b.__delete) { rides.splice(rides.indexOf(t), 1); return { ok: true }; }
      ['time', 'place', 'p0', 'p1', 'p2'].forEach(function (kk) { if (kk in b) t[kk] = b[kk]; });
      Object.keys(rideDays).forEach(function (key) { var r = rideDays[key]; if (r.tplId === t.id && r.day >= today && r.state === 'cho') { r.time = t.time; r.place = t.place; r.p1 = t.p1; r.p2 = t.p2; if (!r.overrideBy) r.p0 = t.p0; } });
      return { ok: true };
    }
    if ((m = /^\/ride-days\/([0-9a-f-]{36})\/(claim|start|done|skip|unskip|assign)$/.exec(sub))) {
      var r = findRideDay(m[1]); if (!r) return err(404, 'Không tìm thấy ca', 'not_found');
      var who = b.forId || M.me; var act = m[2];
      if (act === 'claim') {
        if (r.state === 'da_nhan' || r.state === 'dang_di') { if (r.claimedBy === who) return { ride: rideOut(r), already: true }; return err(409, nm(r.claimedBy) + ' đã nhận ca này rồi', 'conflict'); }
        r.state = 'da_nhan'; r.claimedBy = who; r.claimedAt = Date.now();
      } else if (act === 'start') { r.state = 'dang_di'; }
      else if (act === 'done') { if (r.state === 'xong') return { ride: rideOut(r), already: true }; r.state = 'xong'; r.doneBy = who; r.doneAt = Date.now(); if (!r.claimedBy) r.claimedBy = who; }
      else if (act === 'skip') { r.state = 'bo_qua'; r.skipBy = M.me; r.skipReason = b.reason || ''; }
      else if (act === 'unskip') { r.state = 'cho'; r.skipBy = null; r.skipReason = ''; }
      else if (act === 'assign') { r.p0 = b.memberId; r.overrideBy = M.me; r.overrideReason = b.reason || ''; r.state = 'cho'; r.claimedBy = null; }
      return { ride: rideOut(r) };
    }
    if (sub === '/tasks') {
      if (!String(b.title || '').trim()) return err(400, 'Hãy nhập việc cần làm');
      var nt = { id: uid(), title: b.title.trim(), assigneeId: b.assigneeId || null, due: b.due || null, done: false, doneAt: null, doneBy: '', createdBy: M.me }; tasks.unshift(nt); return { task: nt };
    }
    if ((m = /^\/tasks\/([0-9a-f-]{36})(\/done)?$/.exec(sub))) {
      var tk = tasks.filter(function (x) { return x.id === m[1]; })[0]; if (!tk) return err(404, 'Không tìm thấy việc', 'not_found');
      if (b.__delete) { tasks.splice(tasks.indexOf(tk), 1); return { ok: true }; }
      if (m[2]) { var dn = b.done !== false; tk.done = dn; tk.doneAt = dn ? Date.now() : null; tk.doneBy = dn ? mem(M.me).name : ''; return { task: tk }; }
      if ('title' in b) tk.title = b.title; if ('assigneeId' in b) tk.assigneeId = b.assigneeId || null; if ('due' in b) tk.due = b.due || null;
      return { task: tk };
    }
    if (sub === '/shopping') {
      var items = String(b.text || '').split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!items.length) return err(400, 'Hãy nhập món cần mua');
      var added = items.map(function (x) { return { id: uid(), text: x, bought: false, addedBy: mem(M.me).name, boughtBy: '', addedById: M.me }; });
      shopping = shopping.concat(added); return { items: added };
    }
    if (sub === '/shopping/clear-bought') { var n0 = shopping.length; shopping = shopping.filter(function (s) { return !s.bought; }); return { removed: n0 - shopping.length }; }
    if ((m = /^\/shopping\/([0-9a-f-]{36})(\/bought)?$/.exec(sub))) {
      var sh = shopping.filter(function (x) { return x.id === m[1]; })[0]; if (!sh) return err(404, 'Không tìm thấy món', 'not_found');
      if (b.__delete) { shopping.splice(shopping.indexOf(sh), 1); return { ok: true }; }
      sh.bought = b.bought !== false; sh.boughtBy = sh.bought ? mem(M.me).name : ''; return { item: sh };
    }
    if (sub === '/notifications/read') { notifs.forEach(function (n) { n.read = true; }); return { ok: true }; }
    if (sub === '/settings') { if (b.name) family.name = b.name; if (b.esc) family.esc = b.esc; return { ok: true }; }
    if (sub === '/children') { var nc = { id: uid(), name: b.name, birthYear: b.birthYear || null, school: b.school || '', grade: b.grade || '', color: b.color || 'cam', note: b.note || '' }; children.push(nc); return { child: nc }; }
    if ((m = /^\/children\/([0-9a-f-]{36})$/.exec(sub))) {
      var c = kid(m[1]); if (!c) return err(404, 'Không tìm thấy con', 'not_found');
      if (b.__delete) { children.splice(children.indexOf(c), 1); return { ok: true }; }
      Object.keys(b).forEach(function (kk) { if (kk in c) c[kk] = b[kk]; }); return { child: c };
    }
    if (sub === '/members') {
      var nmm = { id: uid(), name: b.name, relation: b.relation || 'nguoi_than', role: b.role || 'thanh_vien', external: !!b.external, phone: b.phone || '', note: b.note || '', pending: !b.external };
      members.push(nmm);
      return b.external ? { member: nmm } : { member: nmm, invite: { path: 'm/xem-thu', expiresAt: new Date(Date.now() + 7 * DAY).toISOString() } };
    }
    if ((m = /^\/members\/([0-9a-f-]{36})$/.exec(sub))) {
      var mm = mem(m[1]); if (!mm) return err(404, 'Không tìm thấy', 'not_found');
      if (b.__delete) { members.splice(members.indexOf(mm), 1); return { ok: true }; }
      Object.keys(b).forEach(function (kk) { if (kk in mm) mm[kk] = b[kk]; }); return { member: mm };
    }
    return err(400, NOT_IN_PREVIEW);
  }

  // ---------- thay fetch ----------
  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    opts = opts || {};
    var u = new URL(typeof url === 'string' ? url : url.url, document.baseURI);
    var base = new URL('./', document.baseURI).pathname;
    var p = u.pathname.indexOf(base) === 0 ? u.pathname.slice(base.length) : u.pathname.replace(/^\//, '');
    if (p.indexOf('api/') !== 0) return realFetch(url, opts);
    var q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
    var method = (opts.method || 'GET').toUpperCase(); var body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    if (method === 'DELETE') body = { __delete: true };
    var out;
    try { out = route(method === 'DELETE' ? 'POST' : method, p, q, body); } catch (e) { out = err(500, 'Lỗi trong bản xem thử: ' + e.message, 'server'); }
    var status = out && out.__status ? out.__status : 200;
    if (out && out.__status) { delete out.__status; }
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(new Response(JSON.stringify(out), { status: status, headers: { 'content-type': 'application/json' } })); }, 60);
    });
  };

  // ---------- băng rôn "bản xem thử" ----------
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div'); b.className = 'pv-banner'; b.setAttribute('role', 'note');
    var t = document.createElement('span'); t.textContent = 'Bản xem thử với dữ liệu bịa. Thay đổi chỉ lưu trong trang này; tải lại là về như ban đầu.';
    var x = document.createElement('button'); x.type = 'button'; x.textContent = 'Đã hiểu'; x.addEventListener('click', function () { b.parentNode.removeChild(b); });
    b.appendChild(t); b.appendChild(x); document.body.insertBefore(b, document.body.firstChild);
  });
  window.__previewState = function () { return { rev: rev, events: events.length, tasks: tasks.length, shopping: shopping.length }; };
})();
