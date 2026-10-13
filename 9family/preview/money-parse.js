/* 9family: bộ phân tích câu ghi chi tiêu ("chợ 350k", "điện 1tr2", "ăn trưa năm mươi nghìn hôm qua") thành số tiền, danh mục, ngày, ghi chú.
   Thuần hàm, dựa trên luật (không AI, không mạng), chạy cả trong trình duyệt lẫn Node để kiểm thử (test/money.test.js).
   Tiền VND làm tròn về số nguyên đồng. Số trần không đơn vị dưới 1000 được hiểu là nghìn đồng ("chợ 350" = 350.000 đ) và đánh dấu assumed. */
(function (root) {
  'use strict';
  var F9 = root.F9 = root.F9 || {};

  function fold(s) { // bỏ dấu, GIỮ NGUYÊN độ dài (để cắt chuỗi gốc theo chỉ số)
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === 'đ') out += 'd'; else if (c === 'Đ') out += 'D'; else out += c.normalize('NFD').charAt(0);
    }
    return out.toLowerCase();
  }
  var p2 = function (n) { return ('0' + n).slice(-2); };
  function addDays(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function validDate(y, m, d) { var x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; }

  var SCALE = { k: 1e3, nghin: 1e3, ngan: 1e3, tr: 1e6, trieu: 1e6, cu: 1e6, ty: 1e9, ti: 1e9 };
  var NOT_MONEY = /^(kg|g|gam|lit|l|ml|qua|con|cai|chai|hop|bo|goi|thung|cuon|quyen|nguoi|bua|lan|tuoi|thang|ngay|tuan|gio|phut|tang|bao|vi|mieng|lon|mam|chiec|doi|cap|cay|ky)\b/;
  // phải khớp 'k' ở cuối từ: dùng \b sau đơn vị
  var UNIT_RE = '(?:k|nghin|ngan|trieu|tr|cu|ty|ti)';

  var DIGIT_W = { khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9 };
  var SCALE_W = { nghin: 1e3, ngan: 1e3, trieu: 1e6, cu: 1e6, ty: 1e9, ti: 1e9 };

  // Số bằng chữ tiếng Việt: "ba trăm năm mươi nghìn", "một triệu hai", "hai triệu rưỡi". Trả {value, end} hoặc null.
  function wordsNumber(tokens, i) {
    var total = 0, cur = 0, pend = null, lastScale = 0, used = 0, j = i, sawScale = false, trail = false;
    function flushGroup() { if (pend !== null) { cur += pend; pend = null; } }
    for (; j < tokens.length; j++) {
      var t = tokens[j];
      if (Object.prototype.hasOwnProperty.call(DIGIT_W, t)) {
        if (pend !== null) break; // hai số liền nhau không hợp lệ ("hai ba")
        pend = DIGIT_W[t]; used++; if (sawScale) trail = true; continue;
      }
      if (t === 'muoi') { // "mười" (đứng đầu) hoặc "mươi" (sau chữ số)
        if (pend === null) { cur += 10; used++; continue; }
        cur += pend * 10; pend = null; used++; continue;
      }
      if (t === 'tram') { if (pend === null) break; cur += pend * 100; pend = null; used++; continue; }
      if (t === 'linh' || t === 'le') { used++; continue; }
      if (Object.prototype.hasOwnProperty.call(SCALE_W, t)) {
        flushGroup();
        if (cur === 0 && used === 0) break;
        var sc = SCALE_W[t];
        total += (cur === 0 ? 1 : cur) * sc; lastScale = sc; sawScale = true; trail = false; cur = 0; used++; continue;
      }
      if (t === 'ruoi') {
        if (lastScale && pend === null && cur === 0) { total += lastScale / 2; used++; j++; lastScale = 0; }
        else if (!lastScale && (pend !== null || cur)) { flushGroup(); total += cur + 0.5; cur = 0; used++; j++; }
        break;
      }
      break;
    }
    if (pend !== null || cur) {
      var single = pend !== null && cur === 0;
      flushGroup();
      if (sawScale && lastScale >= 1000) total += single ? cur * lastScale / 10 : cur * (lastScale / 1000);
      else total += cur;
    }
    if (!used || total <= 0) return null;
    return { value: total, end: j };
  }

  // Phát hiện số tiền bằng chữ số. Trả {value, start, end, unit(bool)} cho mọi ứng viên.
  function digitCandidates(f) {
    var out = [];
    var re = new RegExp('(\\d+(?:[.,]\\d+)*)(?:\\s*(' + UNIT_RE + ')(?![a-z])(?:\\s*(ruoi)(?![a-z]))?(\\d+)?)?', 'g');
    var m;
    while ((m = re.exec(f))) {
      var raw = m[1]; var unit = m[2]; var half = !!m[3]; var tail = m[4];
      var start = m.index; var end = m.index + m[0].length;
      if (!unit) { // loại số đi với đơn vị đo (2 kg, 3 con) và ngày tháng (3/10)
        var after = f.slice(end).replace(/^\s+/, '');
        if (NOT_MONEY.test(after) || f.charAt(end) === '/') continue;
        if (start > 0 && f.charAt(start - 1) === '/') continue;
      }
      var grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
      var num = grouped ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'));
      if (!isFinite(num)) continue;
      var value = num;
      if (unit) {
        var sc = SCALE[unit];
        value = num * sc;
        if (half) value += sc / 2;
        else if (tail !== undefined && !grouped && raw.indexOf('.') < 0 && raw.indexOf(',') < 0) value += Number('0.' + tail) * sc; // 1tr2 = 1,2 triệu; 1tr250 = 1,25 triệu
      }
      out.push({ value: value, start: start, end: end, unit: !!unit, grouped: grouped });
    }
    return out;
  }

  var CATS = [
    ['y_te', /\b(thuoc|kham|benh vien|vien phi|tiem|vac xin|vaccine|bac si|nha khoa|rang|xet nghiem|phong kham|y te)\b/],
    ['hoc_hanh', /\b(hoc phi|hoc|sach|vo|but|lop|gia su|dong phuc|truong|hoc them|do dung hoc|cap sach)\b/],
    ['dien_nuoc', /\b(dien|nuoc|internet|wifi|gas|ga|rac|truyen hinh|cap quang|tien nha)\b/],
    ['an_uong', /\b(an|com|pho|bun|banh mi|cafe|ca phe|tra sua|nha hang|quan|bua|do uong|an sang|an trua|an toi|lau|nuong)\b/],
    ['di_cho', /\b(cho|sieu thi|rau|thit|ca|trai cay|hoa qua|thuc pham|tap hoa|trung|gao|sua|mua sam|bach hoa)\b/],
  ];
  function categoryOf(f) {
    if (/dien thoai|dien may|dien tu/.test(f) && !/\btien dien\b/.test(f)) f = f.replace(/dien thoai|dien may|dien tu/g, ' ');
    for (var i = 0; i < CATS.length; i++) if (CATS[i][1].test(f)) return CATS[i][0];
    return 'khac';
  }

  function cleanNote(s) {
    s = s.replace(/[,;:\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(mua|chi|tra|dong|het)\s+/i, function (m) { return m; });
    if (!s) return '';
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return Array.from(s).slice(0, 100).join('');
  }

  // parseMoney(text, { today: 'YYYY-MM-DD' }) -> { ok, amount, category, day, note, assumed }
  F9.parseMoney = function (text, opts) {
    opts = opts || {};
    var today = opts.today || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    var s = String(text == null ? '' : text).replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
    var f = fold(s);
    var cut = []; // [start, end) đã dùng
    var day = today;

    // ngày: hôm qua, hôm kia, d/m, d/m/yyyy
    var dm = /(^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?=\s|$)/.exec(f);
    if (dm) {
      var y = dm[4] ? Number(dm[4]) : Number(today.slice(0, 4));
      var mo = Number(dm[3]); var d = Number(dm[2]);
      if (validDate(y, mo, d)) {
        day = y + '-' + p2(mo) + '-' + p2(d);
        if (!dm[4] && day > today) day = (y - 1) + '-' + p2(mo) + '-' + p2(d);
        cut.push([dm.index + dm[1].length, dm.index + dm[0].length]);
      }
    } else {
      var hq = /(hom qua|hom kia|hom nay|bua qua)/.exec(f);
      if (hq) { day = hq[1] === 'hom kia' ? addDays(today, -2) : hq[1] === 'hom nay' ? today : addDays(today, -1); cut.push([hq.index, hq.index + hq[0].length]); }
    }

    // số tiền
    var amount = null; var assumed = false; var span = null;
    var cands = digitCandidates(f).filter(function (c) { return !cut.some(function (x) { return c.start >= x[0] && c.start < x[1]; }); });
    var withUnit = cands.filter(function (c) { return c.unit; });
    var pick = withUnit.length ? withUnit[withUnit.length - 1] : (cands.length ? cands[cands.length - 1] : null);
    // thử số bằng chữ nếu không có số có đơn vị
    if (!withUnit.length) {
      var toks = []; var re = /[a-z]+/g; var mm;
      while ((mm = re.exec(f))) toks.push({ t: mm[0], s: mm.index, e: mm.index + mm[0].length });
      var words = toks.map(function (x) { return x.t; });
      for (var i = 0; i < words.length; i++) {
        var r = wordsNumber(words, i);
        if (r && r.value >= 1000 && (!pick || toks[i].s >= pick.end || true)) {
          // chỉ nhận khi có từ chỉ thang (nghìn/triệu/...) để tránh "ba" "năm" là chữ thường
          var seg = words.slice(i, r.end);
          if (seg.some(function (w) { return SCALE_W[w]; })) { pick = { value: r.value, start: toks[i].s, end: toks[r.end - 1].e, unit: true, words: true }; break; }
        }
      }
    }
    if (!pick) {
      var hb = /(^|[^a-z0-9])(trieu|nghin|ngan|cu)\s*ruoi(?![a-z])/.exec(f);
      if (hb) pick = { value: SCALE_W[hb[2]] * 1.5, start: hb.index + hb[1].length, end: hb.index + hb[0].length, unit: true };
    }
    if (pick) {
      amount = pick.value; span = [pick.start, pick.end];
      if (!pick.unit && !pick.grouped && amount < 1000 && amount > 0) { amount = amount * 1000; assumed = true; }
      amount = Math.round(amount);
      if (!(amount > 0) || amount > 100000000000) amount = null;
    }
    if (span) cut.push(span);

    var category = categoryOf(f);
    cut.sort(function (a, b) { return a[0] - b[0]; });
    var note = ''; var pos = 0;
    cut.forEach(function (c) { if (c[0] >= pos) { note += s.slice(pos, c[0]) + ' '; pos = c[1]; } });
    note += s.slice(pos);
    note = cleanNote(note.replace(/(^|\s)(đ|đồng|vnđ|vnd)(?=\s|$)/gi, ' ').replace(/(\d)đ\b/g, '$1'));
    return { ok: amount !== null, amount: amount, category: category, day: day, note: note, assumed: assumed };
  };
})(typeof window !== 'undefined' ? window : globalThis);
