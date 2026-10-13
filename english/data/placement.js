/* Bài kiểm tra trình độ 20 câu (5 câu mỗi mức A2, B1, B2, C1) và cách ước lượng trình độ. */
(function (root) {
  var Q = [
    // A2
    { id: 'p1', level: 'A2', type: 'Từ vựng', q: 'Please ____ the document to your email before you send it.', options: ['attach', 'attached', 'attaching', 'attachment'], a: 0, why: 'Sau "Please" dùng động từ nguyên mẫu: attach.' },
    { id: 'p2', level: 'A2', type: 'Ngữ pháp', q: 'We have a meeting ____ Monday at 10 a.m.', options: ['at', 'in', 'on', 'to'], a: 2, why: 'Dùng "on" trước thứ trong tuần.' },
    { id: 'p3', level: 'A2', type: 'Ngữ pháp', q: 'She ____ to the office by bus every day.', options: ['go', 'goes', 'going', 'gone'], a: 1, why: 'Chủ ngữ ngôi thứ ba số ít ở thì hiện tại đơn: goes.' },
    { id: 'p4', level: 'A2', type: 'Từ vựng', q: 'What does "deadline" mean?', options: ['The last time to finish something', 'A long meeting', 'A type of email', 'A place to work'], a: 0, why: 'Deadline là hạn chót.' },
    { id: 'p5', level: 'A2', type: 'Ngữ pháp', q: 'Could you ____ me where the meeting room is?', options: ['say', 'tell', 'give', 'speak'], a: 1, why: 'Tell someone + mệnh đề: tell me where... (say me, give me where, speak me đều sai).' },
    // B1
    { id: 'p6', level: 'B1', type: 'Ngữ pháp', q: 'I ____ in this company for three years.', options: ['work', 'worked', 'have worked', 'am working'], a: 2, why: 'Hành động bắt đầu trong quá khứ và còn tiếp tục dùng hiện tại hoàn thành.' },
    { id: 'p7', level: 'B1', type: 'Ngữ pháp', q: 'If the client ____ the offer, we will start next week.', options: ['accept', 'accepts', 'accepted', 'will accept'], a: 1, why: 'Câu điều kiện loại 1: mệnh đề If dùng hiện tại đơn.' },
    { id: 'p8', level: 'B1', type: 'Từ vựng', q: 'To "postpone" a meeting means to ____.', options: ['cancel it forever', 'move it to a later time', 'start it earlier', 'make it shorter'], a: 1, why: 'Postpone là hoãn sang thời điểm muộn hơn.' },
    { id: 'p9', level: 'B1', type: 'Đọc hiểu', q: '"Hi team, the printer on the 2nd floor is broken. Please use the printer on the 3rd floor until Friday. IT will fix it on Thursday afternoon. Thanks, Ken."\nWhen will the printer be fixed?', options: ['Today', 'On Thursday afternoon', 'On Friday', 'On the 3rd floor'], a: 1, why: '"IT will fix it on Thursday afternoon".' },
    { id: 'p10', level: 'B1', type: 'Ngữ pháp', q: 'The report ____ by the finance team yesterday.', options: ['wrote', 'was written', 'has written', 'is writing'], a: 1, why: 'Câu bị động thì quá khứ đơn: was written.' },
    // B2
    { id: 'p11', level: 'B2', type: 'Ngữ pháp', q: 'I wish I ____ more time to prepare for the presentation.', options: ['have', 'had', 'would have', 'have had'], a: 1, why: 'Ước điều không có ở hiện tại: wish + quá khứ đơn.' },
    { id: 'p12', level: 'B2', type: 'Từ vựng', q: '"Sales fell short of the target" means that sales ____.', options: ['were higher than the target', 'were exactly on target', 'were lower than the target', 'stopped completely'], a: 2, why: 'Fall short of là không đạt tới.' },
    { id: 'p13', level: 'B2', type: 'Ngữ pháp', q: 'Not only ____ the deadline, but they also exceeded the budget.', options: ['they missed', 'did they miss', 'they did miss', 'missed they'], a: 1, why: 'Sau "Not only" đứng đầu câu phải đảo ngữ: did they miss.' },
    { id: 'p14', level: 'B2', type: 'Đọc hiểu', q: '"Although the new software promises to cut processing time by half, early users report that the interface is confusing, and many have returned to the old system."\nWhat can we conclude?', options: ['The new software is slower than the old one.', 'The new software has not been widely accepted yet.', 'Users love the new interface.', 'Processing time has already been cut by half.'], a: 1, why: 'Nhiều người đã quay lại hệ thống cũ, nên phần mềm chưa được chấp nhận rộng rãi.' },
    { id: 'p15', level: 'B2', type: 'Từ vựng', q: 'We need to ____ the issue before it gets worse.', options: ['address', 'afford', 'adopt', 'attach'], a: 0, why: 'Address an issue là giải quyết vấn đề.' },
    // C1
    { id: 'p16', level: 'C1', type: 'Ngữ pháp', q: 'Had I known about the problem earlier, I ____ it.', options: ['will fix', 'would fix', 'would have fixed', 'had fixed'], a: 2, why: 'Điều kiện loại 3 đảo ngữ: Had I known ... I would have fixed.' },
    { id: 'p17', level: 'C1', type: 'Từ vựng', q: 'The CEO\'s remarks were ____; nobody could tell whether she supported the merger.', options: ['explicit', 'ambiguous', 'emphatic', 'candid'], a: 1, why: 'Ambiguous là mơ hồ, có thể hiểu nhiều cách.' },
    { id: 'p18', level: 'C1', type: 'Từ vựng', q: 'The company\'s profits have been ____, rising in some months and falling in others.', options: ['steady', 'soaring', 'fluctuating', 'declining'], a: 2, why: 'Fluctuating là dao động lên xuống.' },
    { id: 'p19', level: 'C1', type: 'Từ vựng', q: 'To "mitigate" a risk means to ____.', options: ['ignore it', 'make it less serious', 'create it', 'measure it'], a: 1, why: 'Mitigate là giảm nhẹ.' },
    { id: 'p20', level: 'C1', type: 'Ngữ pháp', q: 'Hardly ____ the presentation when the projector failed.', options: ['she had started', 'had she started', 'did she start', 'she started'], a: 1, why: 'Sau Hardly đứng đầu câu phải đảo ngữ: had she started.' }
  ];

  var ORDER = ['A2', 'B1', 'B2', 'C1'];
  var PASS = 3; // đúng ít nhất 3/5 câu thì "đạt" mức đó

  /* answers: { id: chỉ số đáp án đã chọn }. Trả về trình độ ước lượng + chi tiết. */
  function estimate(answers, questions) {
    questions = questions || Q;
    var per = {};
    ORDER.forEach(function (l) { per[l] = { right: 0, total: 0 }; });
    var total = 0;
    questions.forEach(function (q) {
      per[q.level].total++;
      if (answers[q.id] === q.a) { per[q.level].right++; total++; }
    });
    var level = 'A1', i;
    for (i = 0; i < ORDER.length; i++) {
      var p = per[ORDER[i]];
      if (p.right >= Math.min(PASS, p.total)) level = ORDER[i]; else break;
    }
    return { level: level, per: per, total: total, outOf: questions.length };
  }

  /* Lộ trình đề xuất: mức từ vựng nên học + lời khuyên */
  var PLANS = {
    A1: { levels: ['A2'], title: 'Nền tảng (A1 - A2)', text: 'Bắt đầu từ từ vựng mức A2 trong chủ đề Email và Họp, mỗi ngày 5 từ mới. Nghe bài A2 và luyện các mẫu câu ngắn.', topics: ['email', 'meeting'] },
    A2: { levels: ['A2', 'B1'], title: 'Sơ cấp (A2)', text: 'Học từ mức A2 và B1, mỗi ngày 8 từ mới. Tập các mẫu câu Nhờ giúp đỡ, Từ chối lịch sự và đóng vai mức A2.', topics: ['email', 'meeting', 'travel'] },
    B1: { levels: ['B1', 'B2'], title: 'Trung cấp (B1)', text: 'Học từ B1 và B2 trong Họp, Báo cáo, Đi công tác. Luyện đóng vai Xin lùi hạn và Gặp đối tác; nghe bài B1.', topics: ['meeting', 'report', 'interview'] },
    B2: { levels: ['B2', 'C1'], title: 'Trung cao cấp (B2)', text: 'Học từ B2 và C1 về Báo cáo, Tài chính, Công nghệ. Đóng vai Phỏng vấn và Khách phàn nàn; nghe bài B2.', topics: ['report', 'finance', 'tech'] },
    C1: { levels: ['C1', 'B2'], title: 'Cao cấp (C1)', text: 'Ôn lại từ C1 và những từ B2 chưa vững, tập diễn đạt chính xác trong báo cáo và đàm phán. Tăng tốc độ nói và nghe.', topics: ['finance', 'tech', 'report'] }
  };

  var api = { questions: Q, estimate: estimate, plans: PLANS, order: ORDER, PASS: PASS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).placement = api;
})(typeof self !== 'undefined' ? self : globalThis);
