// 9Today + gợi ý + tự động hoá chéo app. Classic JS.

var Engine = (function () {
  var DAY = 24 * 60 * 60 * 1000;

  function fold(value) {
    var s = String(value || '');
    try { s = s.normalize('NFD'); } catch (e) {}
    return s.replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/Đ/g, 'd');
  }

  function daysUntil(ts) {
    if (!ts) return null;
    return Math.ceil((ts - Date.now()) / DAY);
  }

  function urgency(days) {
    if (days == null) return 'none';
    if (days < 0) return 'overdue';
    if (days <= 3) return 'soon';
    if (days <= 14) return 'week';
    if (days <= 45) return 'month';
    return 'later';
  }

  function extractDocument(text, filename) {
    var hay = fold(text + ' ' + filename);
    var out = { type: 'other', title: (filename || 'Giấy tờ').replace(/\.[a-z0-9]+$/i, ''), confidence: 0.4 };
    if (hay.indexOf('dang kiem') >= 0 || hay.indexOf('kiem dinh') >= 0) {
      out.type = 'inspection';
      out.title = 'Đăng kiểm xe';
      out.confidence = 0.86;
    } else if (hay.indexOf('bao hiem xe') >= 0 || hay.indexOf('bhds') >= 0 || hay.indexOf('tnds') >= 0) {
      out.type = 'vehicle-insurance';
      out.title = 'Bảo hiểm xe';
      out.confidence = 0.82;
    } else if (hay.indexOf('hoa don') >= 0 || hay.indexOf('invoice') >= 0) {
      out.type = 'invoice-appliance';
      out.title = 'Hoá đơn mua đồ';
      out.confidence = 0.78;
    } else if (hay.indexOf('bao hanh') >= 0 || hay.indexOf('warranty') >= 0) {
      out.type = 'warranty';
      out.title = 'Phiếu bảo hành';
      out.confidence = 0.8;
    } else if (hay.indexOf('cccd') >= 0 || hay.indexOf('can cuoc') >= 0 || hay.indexOf('cmnd') >= 0) {
      out.type = 'id';
      out.title = 'Căn cước';
      out.confidence = 0.84;
    } else if (hay.indexOf('bang lai') >= 0 || hay.indexOf('gplx') >= 0) {
      out.type = 'license';
      out.title = 'Bằng lái xe';
      out.confidence = 0.84;
    } else if (hay.indexOf('hoa don dien') >= 0 || hay.indexOf('tien dien') >= 0 || hay.indexOf('tien nuoc') >= 0) {
      out.type = 'bill';
      out.title = 'Hoá đơn tiện ích';
      out.confidence = 0.75;
    }
    return out;
  }

  function notify(item) {
    if (Graph.dismissed(item.id)) return null;
    var existing = Graph.get('notifications', item.id);
    if (existing && existing.read) return existing;
    return Graph.put('notifications', {
      id: item.id,
      title: item.title,
      body: item.body,
      href: item.href,
      level: item.level,
      source: item.source,
      read: false
    });
  }

  function card(item) {
    return {
      id: item.id,
      title: item.title,
      body: item.body,
      href: item.href,
      level: item.level,
      source: item.source,
      action: item.action || 'Xem',
      days: item.days
    };
  }

  function today() {
    var cards = [];
    var docs = Graph.query('documents');
    var i;
    for (i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (!d.expiresAt) continue;
      var days = daysUntil(d.expiresAt);
      var u = urgency(days);
      if (u === 'later' || u === 'none') continue;
      var item = {
        id: 'doc-' + d.id,
        title: d.title || 'Giấy tờ sắp hết hạn',
        body: days < 0 ? ('Đã quá hạn ' + Math.abs(days) + ' ngày') : ('Còn ' + days + ' ngày'),
        href: '#/vault/' + d.id,
        level: u === 'overdue' || u === 'soon' ? 'high' : 'mid',
        source: 'vault',
        days: days,
        action: 'Mở giấy tờ'
      };
      cards.push(card(item));
      notify(item);
    }

    var obs = Graph.query('obligations', function (row) { return row.status !== 'paid' && row.status !== 'done'; });
    for (i = 0; i < obs.length; i++) {
      var o = obs[i];
      var od = daysUntil(o.dueAt);
      if (od == null || urgency(od) === 'later') continue;
      var oi = {
        id: 'ob-' + o.id,
        title: o.title || 'Khoản cần trả',
        body: (o.amount ? (o.amount.toLocaleString('vi-VN') + 'đ · ') : '') + (od < 0 ? 'Quá hạn' : ('Còn ' + od + ' ngày')),
        href: '#/fin',
        level: od <= 3 ? 'high' : 'mid',
        source: 'fin',
        days: od,
        action: 'Xem khoản'
      };
      cards.push(card(oi));
      notify(oi);
    }

    var appts = Graph.query('appointments', function (row) { return row.status !== 'done' && row.status !== 'cancel'; });
    for (i = 0; i < appts.length; i++) {
      var a = appts[i];
      var ad = daysUntil(a.at);
      if (ad == null || ad > 14) continue;
      var ai = {
        id: 'ap-' + a.id,
        title: a.title || 'Lịch hẹn',
        body: ad < 0 ? 'Đã qua ngày hẹn' : (ad === 0 ? 'Hôm nay' : ('Còn ' + ad + ' ngày')),
        href: '#/care',
        level: ad <= 1 ? 'high' : 'mid',
        source: 'care',
        days: ad,
        action: 'Xem lịch'
      };
      cards.push(card(ai));
      notify(ai);
    }

    var meds = Graph.query('medications', function (row) { return row.active !== false; });
    for (i = 0; i < meds.length; i++) {
      var m = meds[i];
      var mi = {
        id: 'med-' + m.id,
        title: 'Uống ' + (m.name || 'thuốc'),
        body: m.dose || 'Theo chỉ định',
        href: '#/care',
        level: 'mid',
        source: 'care',
        days: 0,
        action: 'Đánh dấu đã uống'
      };
      cards.push(card(mi));
    }

    var vehicles = Graph.query('vehicles');
    for (i = 0; i < vehicles.length; i++) {
      var v = vehicles[i];
      if (!v.inspectAt) continue;
      var vd = daysUntil(v.inspectAt);
      if (urgency(vd) === 'later' || urgency(vd) === 'none') continue;
      var vi = {
        id: 'veh-' + v.id,
        title: 'Đăng kiểm ' + (v.plate || v.name || 'xe'),
        body: vd < 0 ? 'Đã quá hạn' : ('Còn ' + vd + ' ngày'),
        href: '#/move/' + v.id,
        level: vd <= 7 ? 'high' : 'mid',
        source: 'move',
        days: vd,
        action: 'Xem xe'
      };
      cards.push(card(vi));
      notify(vi);
    }

    var recs = Graph.query('transactions', function (row) { return row.recurring && row.status !== 'paid'; });
    for (i = 0; i < recs.length; i++) {
      var t = recs[i];
      var td = daysUntil(t.dueAt);
      if (td == null || urgency(td) === 'later') continue;
      var ti = {
        id: 'tx-' + t.id,
        title: t.title || 'Khoản định kỳ',
        body: (t.amount ? (t.amount.toLocaleString('vi-VN') + 'đ · ') : '') + (td < 0 ? 'Quá hạn' : ('Còn ' + td + ' ngày')),
        href: '#/fin',
        level: td <= 3 ? 'high' : 'mid',
        source: 'fin',
        days: td,
        action: 'Xem sổ'
      };
      cards.push(card(ti));
      notify(ti);
    }

    var mains = Graph.query('maintenance', function (row) { return row.status !== 'done'; });
    for (i = 0; i < mains.length; i++) {
      var mn = mains[i];
      var md = daysUntil(mn.nextAt);
      if (md == null || urgency(md) === 'later') continue;
      var asset = mn.assetId ? Graph.get('assets', mn.assetId) : null;
      var mi2 = {
        id: 'mn-' + mn.id,
        title: mn.title || 'Bảo trì',
        body: (asset && asset.name ? asset.name + ' · ' : '') + (md < 0 ? 'Đã quá hạn' : ('Còn ' + md + ' ngày')),
        href: '#/home',
        level: md <= 7 ? 'high' : 'mid',
        source: 'house',
        days: md,
        action: 'Xem nhà'
      };
      cards.push(card(mi2));
      notify(mi2);
    }

    var warr = Graph.query('assets', function (row) { return !!row.warrantyUntil; });
    for (i = 0; i < warr.length; i++) {
      var wa = warr[i];
      var wd = daysUntil(wa.warrantyUntil);
      if (wd == null || urgency(wd) === 'later' || urgency(wd) === 'none') continue;
      var wi = {
        id: 'warr-' + wa.id,
        title: 'Bảo hành ' + (wa.name || 'đồ'),
        body: wd < 0 ? 'Đã hết bảo hành' : ('Còn ' + wd + ' ngày'),
        href: '#/home',
        level: wd <= 7 ? 'high' : 'mid',
        source: 'house',
        days: wd,
        action: 'Xem đồ'
      };
      cards.push(card(wi));
      notify(wi);
    }

    cards.sort(function (a, b) {
      var rank = { high: 0, mid: 1, low: 2 };
      var ra = rank[a.level] != null ? rank[a.level] : 3;
      var rb = rank[b.level] != null ? rank[b.level] : 3;
      if (ra !== rb) return ra - rb;
      var da = a.days == null ? 99 : a.days;
      var db = b.days == null ? 99 : b.days;
      return da - db;
    });
    return cards;
  }

  function unreadCount() {
    return Graph.query('notifications', function (n) { return !n.read && !Graph.dismissed(n.id); }).length;
  }

  function recommend() {
    var out = [];
    var used = function (id) {
      var u = Graph.usageOf(id);
      return u && u.count > 0;
    };
    var push = function (appId, reason) {
      if (used(appId)) return;
      var app = Catalog.byId(appId);
      if (!app || !app.ready) return;
      for (var i = 0; i < out.length; i++) if (out[i].id === appId) return;
      out.push({ id: appId, app: app, reason: reason });
    };

    if (!Graph.query('documents').length) push('vault', 'Lưu giấy tờ để nhắc hạn');
    if (!Graph.query('properties').length && !Graph.query('assets').length) push('house', 'Thêm nhà và đồ đang dùng');
    if (!Graph.query('vehicles').length) push('move', 'Theo dõi đăng kiểm, bảo hiểm xe');
    if (!Graph.query('appointments').length && !Graph.query('medications').length) push('care', 'Nhắc lịch khám và thuốc');
    if (!Graph.query('providers').length && !Graph.query('requests').length) push('local', 'Ghi thợ và việc nhà quanh đây');
    if (!used('speed')) push('speed', 'Cảnh báo tốc độ khi đi đường');
    if (!used('vannien')) push('vannien', 'Xem ngày tốt trên lịch');
    if (!used('pick')) push('pick', 'Câu lạc bộ pickleball');
    if (!used('giapha')) push('giapha', 'Gia phả nhà mình');
    if (!used('quy')) push('quy', 'Hội phụ huynh');
    if (!used('log')) push('log', 'Việc vận tải');

    return out;
  }

  function addMonths(ts, months) {
    var d = new Date(ts || Date.now());
    d.setMonth(d.getMonth() + (months || 1));
    return d.getTime();
  }

  function suggestMaint(asset) {
    var hay = fold((asset && (asset.name + ' ' + asset.category)) || '');
    if (hay.indexOf('dieu hoa') >= 0 || hay.indexOf('may lanh') >= 0 || (asset && asset.category === 'Điện lạnh')) {
      return { title: 'Vệ sinh điều hòa', months: 6 };
    }
    if (hay.indexOf('loc nuoc') >= 0) return { title: 'Thay lõi máy lọc nước', months: 6 };
    if (hay.indexOf('robot') >= 0) return { title: 'Thay phụ kiện robot', months: 12 };
    if (hay.indexOf('tu lanh') >= 0) return { title: 'Vệ sinh tủ lạnh', months: 12 };
    return null;
  }

  function attachMaint(asset) {
    var tmpl = suggestMaint(asset);
    if (!tmpl) return null;
    var exists = Graph.query('maintenance', function (row) { return row.assetId === asset.id && row.title === tmpl.title; });
    if (exists.length) return exists[0];
    return Graph.put('maintenance', {
      assetId: asset.id,
      title: tmpl.title,
      everyMonths: tmpl.months,
      nextAt: addMonths(Date.now(), tmpl.months),
      status: 'open'
    });
  }

  function homeJobs() {
    var jobs = [];
    var seen = {};
    var cards = today();
    var i;
    for (i = 0; i < cards.length; i++) {
      if (cards[i].source === 'house') {
        jobs.push(cards[i]);
        seen[cards[i].id] = true;
      }
    }
    var utils = Graph.query('obligations', function (row) { return row.kind === 'utility' && row.status !== 'paid'; });
    for (i = 0; i < utils.length; i++) {
      var o = utils[i];
      var id = 'ob-' + o.id;
      if (seen[id]) continue;
      var od = daysUntil(o.dueAt);
      if (od == null || urgency(od) === 'later') continue;
      jobs.push({
        id: id,
        title: o.title,
        body: (o.amount ? (o.amount.toLocaleString('vi-VN') + 'đ · ') : '') + (od < 0 ? 'Quá hạn' : ('Còn ' + od + ' ngày')),
        href: '#/home',
        level: od <= 3 ? 'high' : 'mid',
        source: 'house',
        days: od
      });
    }
    return jobs;
  }

  function confirmDocument(doc) {
    var created = [];
    var type = doc.type || 'other';
    if (type === 'invoice-appliance' || type === 'warranty') {
      var asset = Graph.put('assets', {
        name: doc.assetName || doc.title || 'Đồ gia dụng',
        category: doc.category || 'Gia dụng',
        roomId: doc.roomId || '',
        propertyId: doc.propertyId || '',
        boughtAt: doc.boughtAt || Date.now(),
        purchasePrice: doc.amount || 0,
        warrantyUntil: doc.expiresAt || 0,
        status: 'đang dùng',
        documentId: doc.id
      });
      created.push({ store: 'assets', rec: asset });
      var maint = attachMaint(asset);
      if (maint) created.push({ store: 'maintenance', rec: maint });
      if (doc.amount) {
        var tx = Graph.put('transactions', {
          title: 'Mua ' + asset.name,
          amount: doc.amount,
          dueAt: doc.boughtAt || Date.now(),
          status: 'paid',
          source: 'vault',
          documentId: doc.id
        });
        created.push({ store: 'transactions', rec: tx });
      }
      Graph.event('asset-from-document', { documentId: doc.id, assetId: asset.id });
    }
    if (type === 'inspection' || type === 'vehicle-insurance') {
      var plate = doc.plate || '';
      var veh = null;
      var vehicles = Graph.query('vehicles');
      for (var i = 0; i < vehicles.length; i++) {
        if (plate && vehicles[i].plate === plate) { veh = vehicles[i]; break; }
      }
      if (!veh && vehicles.length === 1) veh = vehicles[0];
      if (!veh) {
        veh = Graph.put('vehicles', {
          name: doc.vehicleName || 'Xe của nhà',
          plate: plate,
          inspectAt: type === 'inspection' ? (doc.expiresAt || 0) : 0,
          insuranceAt: type === 'vehicle-insurance' ? (doc.expiresAt || 0) : 0
        });
        created.push({ store: 'vehicles', rec: veh });
      } else {
        if (type === 'inspection' && doc.expiresAt) veh.inspectAt = doc.expiresAt;
        if (type === 'vehicle-insurance' && doc.expiresAt) veh.insuranceAt = doc.expiresAt;
        veh.documentId = doc.id;
        veh = Graph.put('vehicles', veh);
      }
      Graph.event('vehicle-from-document', { documentId: doc.id, vehicleId: veh.id, type: type });
    }
    if (type === 'bill' && doc.amount) {
      var ob = Graph.put('obligations', {
        title: doc.title || 'Hoá đơn',
        amount: doc.amount,
        dueAt: doc.dueAt || doc.expiresAt || Date.now(),
        status: 'open',
        kind: 'utility',
        documentId: doc.id
      });
      created.push({ store: 'obligations', rec: ob });
      Graph.event('bill-from-document', { documentId: doc.id, obligationId: ob.id });
    }
    doc.confirmed = true;
    Graph.put('documents', doc);
    Graph.event('document-confirmed', { documentId: doc.id, type: type });
    return created;
  }

  function markPaid(id) {
    var rec = Graph.get('obligations', id) || Graph.get('transactions', id);
    if (!rec) return null;
    rec.status = 'paid';
    rec.paidAt = Date.now();
    var store = Graph.get('obligations', id) ? 'obligations' : 'transactions';
    Graph.put(store, rec);
    Graph.event('paid', { store: store, id: id });
    return rec;
  }

  return {
    fold: fold,
    daysUntil: daysUntil,
    urgency: urgency,
    extractDocument: extractDocument,
    today: today,
    unreadCount: unreadCount,
    recommend: recommend,
    suggestMaint: suggestMaint,
    attachMaint: attachMaint,
    homeJobs: homeJobs,
    addMonths: addMonths,
    confirmDocument: confirmDocument,
    markPaid: markPaid,
    notify: notify
  };
})();
