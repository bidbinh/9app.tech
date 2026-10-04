/* Chuỗi ngày học + tệp nhắc lịch ICS. Hàm thuần. */
(function (root) {
  'use strict';

  /* secByDay: { '<số ngày>': giây }. Một ngày "đạt" khi đủ goalSec.
   * Hôm nay chưa đạt thì chuỗi vẫn giữ nếu hôm qua đạt. */
  function streak(secByDay, goalSec, today) {
    var done = function (d) { return (secByDay[d] || 0) >= goalSec; };
    var cur = 0, d = done(today) ? today : today - 1;
    while (done(d)) { cur++; d--; }
    var days = Object.keys(secByDay).map(Number).filter(done).sort(function (a, b) { return a - b; });
    var best = 0, run = 0, prev = null;
    days.forEach(function (x) { run = prev !== null && x === prev + 1 ? run + 1 : 1; if (run > best) best = run; prev = x; });
    return { current: cur, best: Math.max(best, cur), todayDone: done(today) };
  }

  function utf8len(s) { return unescape(encodeURIComponent(s)).length; }
  function fold(line) { // gập dòng tối đa 75 byte, không cắt giữa ký tự
    if (utf8len(line) <= 75) return line;
    var out = [], cur = '';
    for (var ch of line) {
      if (utf8len(cur + ch) > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function esc(t) { return String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* time 'HH:MM' là giờ địa phương ("giờ nổi": lịch tự hiểu theo múi giờ máy). */
  function buildIcs(o) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(o.time || '');
    if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Giờ nhắc không hợp lệ');
    var sd = o.startDate || new Date();
    var ymd = sd.getFullYear() + pad(sd.getMonth() + 1) + pad(sd.getDate());
    var hm = pad(+m[1]) + m[2] + '00';
    var now = o.now || new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    var mins = o.minutes || 10;
    var title = o.title || 'Học tiếng Anh ' + mins + ' phút với 9english';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app.tech//9english//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:9english-daily-' + ymd + hm + '@9app.tech',
      'DTSTAMP:' + stamp,
      'DTSTART:' + ymd + 'T' + hm,
      'DURATION:PT' + mins + 'M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:' + esc(title),
      'DESCRIPTION:' + esc(o.desc || 'Mỗi ngày ' + mins + ' phút: ôn thẻ từ, luyện nói, nghe một bài ngắn.'),
      'URL:' + (o.url || 'https://9app.tech/english/'),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:PT0S', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  var api = { streak: streak, buildIcs: buildIcs, fold: fold };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).streak = api;
})(typeof self !== 'undefined' ? self : globalThis);
