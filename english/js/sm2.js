/* SM-2 (SuperMemo 2) cho thẻ từ vựng. Hàm thuần, không phụ thuộc DOM.
 * Ngày được tính theo "số ngày kể từ 1970 theo giờ địa phương" để không lệch múi giờ. */
(function (root) {
  'use strict';

  var MIN_EF = 1.3;
  var START_EF = 2.5;
  // Bốn nút chấm -> điểm chất lượng q của SM-2 (0..5)
  var GRADES = { again: 1, hard: 3, good: 4, easy: 5 };

  function dayNumber(d) {
    d = d || new Date();
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  }
  function dayToDate(n) { return new Date(n * 86400000); } // UTC midnight của ngày địa phương đó
  function dayToISO(n) { return dayToDate(n).toISOString().slice(0, 10); }

  function newCard(today) {
    return { ef: START_EF, interval: 0, reps: 0, lapses: 0, due: today == null ? dayNumber() : today, seen: 0 };
  }

  /* Trả về thẻ MỚI (không sửa thẻ cũ). grade: 'again'|'hard'|'good'|'easy' hoặc số 0..5. */
  function review(card, grade, today) {
    var q = typeof grade === 'number' ? grade : GRADES[grade];
    if (q == null || q < 0 || q > 5 || isNaN(q)) throw new Error('Điểm chấm không hợp lệ: ' + grade);
    today = today == null ? dayNumber() : today;
    var c = { ef: card.ef, interval: card.interval, reps: card.reps, lapses: card.lapses || 0, due: card.due, seen: (card.seen || 0) + 1 };
    // SM-2 gốc: chỉ cập nhật EF khi nhớ được (q >= 3); "Quên" chỉ đặt lại chuỗi, không trừ EF.
    if (q >= 3) {
      c.ef = Math.max(MIN_EF, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      c.ef = Math.round(c.ef * 1000) / 1000;
    }
    if (q < 3) {
      c.reps = 0;
      c.interval = 1;
      c.lapses += 1;
    } else {
      c.reps += 1;
      if (c.reps === 1) c.interval = q === 5 ? 4 : 1; // thẻ mới chấm "Dễ": hẹn 4 ngày (như Anki)
      else if (c.reps === 2) c.interval = 6;
      else {
        var prev = card.interval, f = q === 3 ? 1.2 : (q === 4 ? c.ef : c.ef * 1.3); // Khó: tăng chậm; Dễ: thưởng thêm
        c.interval = Math.max(prev + 1, Math.round(prev * f));
      }
    }
    c.due = today + c.interval;
    return c;
  }

  /* Khoảng hẹn dự kiến cho từng nút (hiển thị trên nút) */
  function preview(card, today) {
    var out = {};
    ['again', 'hard', 'good', 'easy'].forEach(function (g) { out[g] = review(card, g, today).interval; });
    return out;
  }

  function isDue(card, today) { return card.due <= (today == null ? dayNumber() : today); }
  /* "Đã thuộc": hẹn ôn từ 21 ngày trở lên */
  function isMature(card) { return card.interval >= 21; }

  function labelInterval(days) {
    if (days <= 1) return '1 ngày';
    if (days < 30) return days + ' ngày';
    if (days < 365) return Math.round(days / 30) + ' tháng';
    return (Math.round(days / 36.5) / 10) + ' năm';
  }

  var api = { MIN_EF: MIN_EF, START_EF: START_EF, GRADES: GRADES, dayNumber: dayNumber, dayToISO: dayToISO, newCard: newCard, review: review, preview: preview, isDue: isDue, isMature: isMature, labelInterval: labelInterval };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).sm2 = api;
})(typeof self !== 'undefined' ? self : globalThis);
