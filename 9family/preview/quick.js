/* 9family: bộ phân tích câu gõ nhanh ("Piano thứ 7 9:30 Mía") thành các trường của sự kiện.
   Thuần hàm, dựa trên luật (không AI, không mạng), chạy cả trong trình duyệt lẫn Node để kiểm thử (test/quick.test.js).
   Ghi chú: trợ lý Osin sau này sẽ dùng AI để hiểu câu phức tạp hơn; hàm này vẫn là phương án dự phòng chạy ngay trên máy. */
(function (root) {
  'use strict';
  var F9 = root.F9 = root.F9 || {};

  // Bỏ dấu nhưng GIỮ NGUYÊN độ dài chuỗi (mỗi ký tự thành đúng một ký tự) để cắt chuỗi gốc theo chỉ số của chuỗi đã bỏ dấu
  function fold(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === 'đ') out += 'd'; else if (c === 'Đ') out += 'D'; else out += c.normalize('NFD').charAt(0);
    }
    return out.toLowerCase();
  }
  var p2 = function (n) { return ('0' + n).slice(-2); };
  function addDays(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekday(day) { var w = new Date(day + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }
  function validDate(y, m, d) { var x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; }

  function blank(st, i, j) { // thay vùng [i, j) bằng khoảng trắng ở cả chuỗi gốc và chuỗi đã bỏ dấu
    var pad = new Array(j - i + 1).join(' ');
    st.raw = st.raw.slice(0, i) + pad + st.raw.slice(j);
    st.f = st.f.slice(0, i) + pad + st.f.slice(j);
  }
  function take(st, re) { var m = re.exec(st.f); if (!m) return null; blank(st, m.index, m.index + m[0].length); return m; }

  var CLASSY = /\b(hoc|toan|tieng anh|ielts|piano|violin|guitar|dan|ve|mua|boi|bong|vo|karate|taekwondo|co vua|nhay|yoga|lop|luyen|gia su|trung tam|robot|lap trinh|nang khieu|iq|tap)\b/;
  var KIND_RULES = [
    ['hop_phu_huynh', /\b(hop phu huynh|hop cha me|hop lop)\b/],
    ['ngay_quan_trong', /\b(sinh nhat|gio|ram|mung 1|dam gio|ky niem|tet)\b/],
    ['kham', /\b(kham|benh vien|nha khoa|tiem|vac xin|vaccine|tai kham|bac si|phong kham)\b/],
    ['thi', /\b(thi|kiem tra)\b/],
    ['nang_khieu', /\b(piano|violin|guitar|dan|ve|mua|boi|bong ro|bong da|bong|vo|karate|taekwondo|co vua|nhay|yoga|robot|hat)\b/],
    ['hoc_them', /\b(toan|tieng anh|ielts|gia su|hoc them|luyen|iq|lop|trung tam|lap trinh|van)\b/],
    ['gia_dinh', /\b(an toi|di choi|da ngoai|picnic|du lich|gia dinh)\b/],
  ];
  // một mốc giờ: "9:30", "9h30", "9h", "9 giờ", "9 giờ 30", "9 giờ rưỡi" (bắt buộc có dấu hiệu giờ để không nhầm với số khác)
  var TIME = /(\d{1,2})\s*(?:(:)\s*(\d{2})|h(?![a-z])\s*(\d{2})?|gio(?![a-z])\s*(\d{2})?)(\s*ruoi)?/;

  function minutesOf(m) { return m[3] ? +m[3] : m[4] ? +m[4] : m[5] ? +m[5] : m[6] ? 30 : 0; }
  function ampm(h, hint) { if (/chieu|toi|dem/.test(hint) && h >= 1 && h < 12) return h + 12; if (/sang/.test(hint) && h === 12) return 0; return h; }

  function parseTime(st) {
    var m = TIME.exec(st.f);
    if (!m) return null;
    var i = m.index, j = i + m[0].length;
    var h1 = +m[1], mi1 = minutesOf(m);
    if (h1 > 23 || mi1 > 59) return null;
    var res = { start: null, end: null };
    var rest = st.f.slice(j);
    var tail = /^\s*(sang|chieu|toi|dem)\b/.exec(rest);
    var head = /(sang|chieu|toi|dem)\s*$/.exec(st.f.slice(0, i));
    var hint = tail ? tail[1] : head ? head[1] : '';
    if (tail) j += tail[0].length;
    var from = head && !tail ? i - head[0].length : i;
    var rng = /^\s*(?:-|–|den)\s*/.exec(st.f.slice(j));
    var m2 = rng ? TIME.exec(st.f.slice(j + rng[0].length)) : null;
    if (m2 && m2.index === 0) {
      var h2 = +m2[1], mi2 = minutesOf(m2);
      if (h2 <= 23 && mi2 <= 59) { res.end = [h2, mi2]; j += rng[0].length + m2[0].length; var t2 = /^\s*(sang|chieu|toi|dem)\b/.exec(st.f.slice(j)); if (t2) { hint = hint || t2[1]; j += t2[0].length; } }
    }
    h1 = ampm(h1, hint);
    res.start = p2(h1) + ':' + p2(mi1);
    if (res.end) { var he = ampm(res.end[0], hint); var e = p2(he) + ':' + p2(res.end[1]); res.end = e > res.start ? e : null; }
    blank(st, from, j);
    return res;
  }

  F9.parseQuick = function (input, opts) {
    opts = opts || {};
    var today = opts.today || new Date().toISOString().slice(0, 10);
    var kids = opts.kids || [];
    var st = { raw: String(input || ''), f: '' };
    st.f = fold(st.raw);
    var out = { title: '', kidIds: [], day: null, start: null, end: null, allDay: false, recType: 'none', recDays: [], lunarDay: null, lunarMonth: null, kind: 'khac', location: '', found: [] };
    if (!st.raw.trim()) return out;
    var all = st.f;
    var m;

    // 0) ngày tương đối nhiều chữ (làm trước tên con để "ngày mai" không bị nhầm với con tên Mai)
    var relDay = null;
    if (take(st, /\bngay kia\b/)) relDay = addDays(today, 2); else if (take(st, /\bngay mai\b/)) relDay = addDays(today, 1); else if (take(st, /\b(?:hom nay|toi nay)\b/)) relDay = today;

    // 1) con (làm trước để tên con như "Mai", "Chiều" không bị hiểu nhầm là ngày giờ)
    kids.forEach(function (k) {
      var nm = fold(k.name).trim(); if (!nm) return;
      var re = new RegExp('(^|[^a-z0-9])(' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + ')(?![a-z0-9])');
      var mk = re.exec(st.f);
      if (mk) { var i = mk.index + mk[1].length; blank(st, i, i + mk[2].length); if (out.kidIds.indexOf(k.id) < 0) out.kidIds.push(k.id); }
    });
    if (take(st, /\b(ca hai (?:be|con)|hai (?:be|con)|2 (?:be|con)|tat ca (?:cac )?con)\b/) && !out.kidIds.length) out.kidIds = kids.map(function (k) { return k.id; });

    // 2) từ khóa lặp, âm lịch
    var recWord = null;
    if ((m = take(st, /\b(?:hang|moi)\s+(tuan|ngay|nam|thang)\b/))) recWord = m[1];
    if (take(st, /\bcac\s+(?=thu|t[2-7]\b)/)) recWord = recWord || 'tuan';
    if (take(st, /\bmoi\s+(?=thu|t[2-7]\b|chu nhat|cn\b)/)) recWord = 'tuan';
    var lunar = !!take(st, /\bam(?: lich)?\b/);

    // 3) giờ
    var tm = parseTime(st);
    if (tm) { out.start = tm.start; out.end = tm.end; }
    if (take(st, /\bca ngay\b/)) out.allDay = true;

    // 4) ngày
    var dayTok = null;
    if ((m = take(st, /\b(?:ngay\s+)?(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?\b/)) || (m = take(st, /\bngay\s+(\d{1,2})\s+thang\s+(\d{1,2})()\b/))) {
      var dd = +m[1], mm = +m[2], yy = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null;
      if (lunar) { if (dd >= 1 && dd <= 30 && mm >= 1 && mm <= 12) { out.lunarDay = dd; out.lunarMonth = mm; } }
      else {
        var cand = yy || +today.slice(0, 4);
        if (validDate(cand, mm, dd)) {
          dayTok = cand + '-' + p2(mm) + '-' + p2(dd);
          if (!yy && dayTok < today && validDate(cand + 1, mm, dd)) dayTok = (cand + 1) + '-' + p2(mm) + '-' + p2(dd);
        }
      }
    } else if (relDay) dayTok = relDay;
    else if (take(st, /\bmai\b/)) dayTok = addDays(today, 1);
    var wdays = [];
    var MAP = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6 }; // 1 = thứ hai ... 7 = chủ nhật
    while ((m = take(st, /\b(?:thu\s*([2-7]|hai|ba|tu|nam|sau|bay)|t([2-7])|chu\s*nhat|cn)\b/))) {
      var w = m[1] ? (/^\d$/.test(m[1]) ? +m[1] - 1 : MAP[m[1]]) : m[2] ? +m[2] - 1 : 7;
      if (wdays.indexOf(w) < 0) wdays.push(w);
    }
    wdays.sort();

    // 5) địa điểm: "ở / tại / @ ..." đến hết câu
    var loc = /(^|\s)(tai|o|@)\s+(\S.*)$/.exec(st.f);
    if (loc) {
      var s0 = loc.index + loc[1].length + loc[2].length;
      out.location = st.raw.slice(s0).replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,.;]+$/g, '');
      blank(st, loc.index + loc[1].length, st.raw.length);
    }

    // 6) loại, kiểu lặp, ngày bắt đầu
    for (var r = 0; r < KIND_RULES.length; r++) { if (KIND_RULES[r][1].test(all)) { out.kind = KIND_RULES[r][0]; break; } }
    var yearly = /\b(sinh nhat|hang nam|moi nam)\b/.test(all) || recWord === 'nam';
    if (lunar && out.lunarDay) { out.recType = 'yearly_lunar'; out.allDay = true; if (recWord === 'thang') { out.recType = 'monthly_lunar'; } }
    else if (recWord === 'ngay') out.recType = 'daily';
    else if (yearly && dayTok) { out.recType = 'yearly'; out.allDay = true; }
    else if (recWord === 'tuan' || (wdays.length && !dayTok && (CLASSY.test(all) || out.kind === 'hoc_them' || out.kind === 'nang_khieu'))) out.recType = 'weekly';
    if (out.recType === 'weekly') { if (!wdays.length && dayTok) wdays = [weekday(dayTok)]; out.recDays = wdays.length ? wdays : [weekday(today)]; }
    if (dayTok) out.day = dayTok;
    else if (wdays.length) {
      var best = null;
      wdays.forEach(function (x) { var d = addDays(today, (x - weekday(today) + 7) % 7); if (best === null || d < best) best = d; });
      out.day = best;
    }
    if (!out.day && out.recType === 'none' && out.start) out.day = today;
    if (out.allDay) { out.start = null; out.end = null; }

    // 7) tiêu đề = phần còn lại, bỏ từ nối thừa ở hai đầu
    var guard = 0;
    for (var again = true; again && guard < 8; guard++) {
      again = false;
      var a = /^\s*(?:luc|vao|cua|cho|voi|va|tu|den|vao luc)(?=\s|$)/.exec(st.f);
      if (a) { blank(st, 0, a[0].length); again = true; }
      var b = /\s(?:luc|vao|cua|cho|voi|va|tu|den)\s*$/.exec(st.f);
      if (b) { blank(st, b.index + 1, st.raw.length); again = true; }
    }
    var t = st.raw.replace(/\s+/g, ' ').replace(/^[\s,.;:\-–]+|[\s,.;:\-–]+$/g, '');
    out.title = t ? t.charAt(0).toUpperCase() + t.slice(1) : '';

    if (out.kidIds.length) out.found.push('con');
    if (out.day) out.found.push('ngày');
    if (out.start) out.found.push('giờ');
    if (out.recType !== 'none') out.found.push('lặp');
    if (out.location) out.found.push('nơi');
    return out;
  };

  // Phân khu quầy cho danh sách đi chợ (luật từ khóa, thuần hàm). Trợ lý Osin sẽ nhóm thông minh hơn sau này.
  var AISLES = [
    ['Gia dụng', /\b(nuoc giat|nuoc rua|giay|khan|bot giat|xa phong|dau goi|kem danh rang|ban chai|tui rac|bao|pin|bong den|nuoc xa)\b/],
    ['Rau củ quả', /\b(rau|cu|qua|ca chua|hanh|toi|gung|ot|chanh|cam|tao|chuoi|dua|xoai|nho|bi|bap cai|xa lach|khoai|nam|dau co ve|muop|cai)\b/],
    ['Sữa, trứng', /\b(sua|trung|pho mai|yaourt|sua chua|kem)\b/],
    ['Thịt cá', /\b(thit|ga|bo|heo|lon|ca(?! phe| chua)|tom|cua|muc|xuong|suon|ba chi|nac|cha|xuc xich)\b/],
    ['Bánh, đồ khô', /\b(banh|mi|gao|bun|mien|pho|nui|dau|do|me|lac|duong|muoi|dau an|nuoc mam|tuong|bot|ngu coc|yen mach|mi tom|tra|ca phe|keo)\b/],
  ];
  F9.aisleOf = function (text) {
    var f = fold(String(text || ''));
    for (var i = 0; i < AISLES.length; i++) if (AISLES[i][1].test(f)) return AISLES[i][0];
    return 'Khác';
  };
  F9.AISLE_ORDER = ['Rau củ quả', 'Thịt cá', 'Sữa, trứng', 'Bánh, đồ khô', 'Gia dụng', 'Khác'];
})(typeof window !== 'undefined' ? window : globalThis);
