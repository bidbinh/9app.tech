/* Mẫu câu giao tiếp công sở. Mỗi dòng: câu tiếng Anh | nghĩa tiếng Việt | mức trang trọng (f = trang trọng, n = thông thường, c = thân mật) | ghi chú (tùy chọn) */
(function (root) {
  var CATS = [
    { id: 'email', name: 'Viết email', icon: 'mail' },
    { id: 'meeting', name: 'Họp', icon: 'chat' },
    { id: 'help', name: 'Nhờ giúp đỡ', icon: 'hand' },
    { id: 'decline', name: 'Từ chối lịch sự', icon: 'shield' },
    { id: 'phone', name: 'Gọi điện', icon: 'phone' },
    { id: 'small', name: 'Trò chuyện xã giao', icon: 'smile' }
  ];
  var RAW = {
    email: `
I hope this email finds you well.|Hy vọng bạn vẫn khỏe (câu mở đầu quen thuộc của email).|f
I am writing to ask about your delivery schedule.|Tôi viết thư để hỏi về lịch giao hàng của bên bạn.|f|Mẫu: I am writing to + động từ nguyên mẫu.
Thank you for getting back to me.|Cảm ơn bạn đã phản hồi.|n
Thanks for your email.|Cảm ơn email của bạn.|n
Sorry for the late reply.|Xin lỗi vì trả lời muộn.|n
Please find attached the monthly report.|Xin xem báo cáo tháng đính kèm.|f
I have attached the file for your review.|Tôi đã đính kèm tệp để bạn xem xét.|n
Could you please send me the updated figures?|Bạn vui lòng gửi cho tôi số liệu mới nhất được không?|n
I would appreciate it if you could reply by Friday.|Tôi sẽ rất biết ơn nếu bạn trả lời trước thứ Sáu.|f|Cấu trúc: I would appreciate it if you could...
Just a quick reminder about tomorrow's deadline.|Chỉ nhắc nhanh về hạn chót ngày mai.|n
I am following up on my last email.|Tôi viết để nhắc lại email trước của tôi.|n
Please let me know if you have any questions.|Nếu có câu hỏi nào, xin hãy cho tôi biết.|n
Feel free to contact me if you need anything else.|Cứ liên hệ với tôi nếu bạn cần gì thêm.|n
Apologies for the confusion.|Xin lỗi vì sự nhầm lẫn.|n
Unfortunately, we are unable to offer a discount at this time.|Rất tiếc, hiện tại chúng tôi không thể giảm giá.|f
I look forward to hearing from you.|Tôi mong sớm nhận được hồi âm của bạn.|f|Sau "look forward to" dùng V-ing.
Best regards,|Trân trọng (lời kết email thông dụng).|n|Cũng dùng: Kind regards,
`,
    meeting: `
Shall we get started?|Chúng ta bắt đầu nhé?|n
Thank you all for joining us today.|Cảm ơn mọi người đã tham dự hôm nay.|n
The purpose of today's meeting is to review the project plan.|Mục đích của cuộc họp hôm nay là xem lại kế hoạch dự án.|f
Let's move on to the next item.|Chúng ta chuyển sang mục tiếp theo nhé.|n
Could you give us an update on the budget?|Bạn cập nhật cho chúng tôi về ngân sách được không?|n
Can everyone hear me?|Mọi người nghe tôi rõ không?|n
Sorry to interrupt, but I have a quick question.|Xin lỗi vì ngắt lời, nhưng tôi có một câu hỏi nhanh.|n
That's a good point.|Ý đó hay đấy.|n
I see what you mean, but I have a different view.|Tôi hiểu ý bạn, nhưng tôi có cách nhìn khác.|n|Cách bất đồng nhẹ nhàng: ghi nhận ý người kia trước.
I'm afraid I see it differently.|Tôi e là tôi nhìn vấn đề khác đi.|f
Could you clarify what you mean by "soon"?|Bạn có thể làm rõ "sớm" nghĩa là khi nào không?|n
How about starting with the biggest risk?|Hay là mình bắt đầu từ rủi ro lớn nhất nhé?|n
I think we should wait for the client's feedback first.|Tôi nghĩ chúng ta nên chờ phản hồi của khách hàng trước.|n
Let's take this offline.|Chúng ta bàn riêng việc này sau cuộc họp nhé.|n|"Offline" ở đây nghĩa là ngoài cuộc họp này.
We are running out of time, so let me summarize.|Sắp hết giờ rồi, để tôi tóm tắt.|n
Who is going to follow up on this?|Ai sẽ theo dõi việc này?|n
Does anyone have any questions?|Có ai có câu hỏi không?|n
Let's schedule a follow-up meeting next week.|Hẹn một buổi họp tiếp theo vào tuần sau nhé.|n
`,
    help: `
Do you have a minute?|Bạn có rảnh một chút không?|c
Could you give me a hand with this?|Bạn giúp tôi một tay việc này được không?|c
I was wondering if you could help me with the report.|Không biết bạn có thể giúp tôi phần báo cáo không.|n|Lịch sự hơn "Can you help me?".
Would you mind checking my draft?|Bạn có phiền xem giúp bản nháp của tôi không?|n|Trả lời "Not at all" nghĩa là đồng ý.
Could you take a quick look at this?|Bạn xem nhanh giúp tôi cái này được không?|n
Could you walk me through the process?|Bạn hướng dẫn tôi từng bước quy trình này được không?|n
I'm having trouble with the printer.|Tôi đang gặp rắc rối với máy in.|n
Could you show me how to use this system?|Bạn chỉ tôi cách dùng hệ thống này được không?|n
Would it be possible for you to review the contract today?|Hôm nay bạn có thể xem xét hợp đồng giúp tôi không?|f
Can I ask you a favor?|Tôi nhờ bạn một việc được không?|c
Sorry to bother you, but do you know who handles invoices?|Xin lỗi làm phiền, bạn có biết ai phụ trách hóa đơn không?|n
I'd really appreciate your help.|Tôi rất biết ơn nếu bạn giúp.|n
Thanks a lot. I owe you one.|Cảm ơn nhiều. Tôi nợ bạn một lần nhé.|c
Thank you for your time and help.|Cảm ơn bạn đã dành thời gian và giúp đỡ.|f
`,
    decline: `
I'm afraid I can't make it.|Tôi e là tôi không đến được.|n
Thank you for the invitation, but I won't be able to attend.|Cảm ơn lời mời, nhưng tôi sẽ không tham dự được.|f
Unfortunately, I have another commitment at that time.|Rất tiếc, giờ đó tôi đã có cam kết khác.|f
I'd love to, but I'm tied up this week.|Tôi rất muốn, nhưng tuần này tôi bận kín.|c
I'm sorry, but I can't take on any more work right now.|Xin lỗi, hiện tại tôi không thể nhận thêm việc.|n
I don't think that will work for me.|Tôi nghĩ giờ đó không phù hợp với tôi.|n
Could we do it another time?|Mình làm vào lúc khác được không?|n
Would it be OK if we pushed this to next week?|Dời việc này sang tuần sau có được không?|n
Let me check my schedule and get back to you.|Để tôi xem lịch rồi trả lời bạn.|n
That's not something I can commit to at the moment.|Hiện tại tôi chưa thể cam kết việc đó.|f
I appreciate the offer, but I have to decline.|Tôi cảm kích lời đề nghị, nhưng tôi buộc phải từ chối.|f
I'm afraid that's outside my area. You might want to ask Linh.|Tôi e việc đó ngoài phạm vi của tôi. Bạn có thể hỏi Linh.|n
Maybe next time.|Để lần sau nhé.|c
I'd rather not, if that's OK.|Nếu được thì tôi xin không làm.|c
`,
    phone: `
Hello, this is Linh from ABC Company.|Xin chào, tôi là Linh ở công ty ABC.|n
May I speak to Mr. Brown, please?|Cho tôi nói chuyện với ông Brown được không?|f
I'm calling about the order we placed last week.|Tôi gọi về đơn hàng chúng tôi đặt tuần trước.|n
Could you hold on for a moment?|Bạn vui lòng chờ máy một lát nhé?|n
Let me put you through to the sales department.|Để tôi chuyển máy cho bộ phận bán hàng.|n
Can I take a message?|Tôi ghi lại lời nhắn giúp bạn nhé?|n
Could you speak more slowly, please?|Bạn nói chậm hơn một chút được không?|n
Could you repeat that, please?|Bạn nhắc lại giúp tôi được không?|n
Sorry, the line is breaking up.|Xin lỗi, đường truyền đang bị chập chờn.|n
Can you hear me OK?|Bạn nghe tôi rõ không?|n
I'll call you back this afternoon.|Chiều nay tôi sẽ gọi lại cho bạn.|n
Thank you for calling.|Cảm ơn bạn đã gọi.|n
`,
    small: `
How was your weekend?|Cuối tuần của bạn thế nào?|c
How's everything going?|Mọi việc dạo này thế nào?|c
Nice to meet you.|Rất vui được gặp bạn.|n
Did you have a good trip?|Chuyến đi của bạn có tốt không?|n
How long have you been with the company?|Bạn làm ở công ty được bao lâu rồi?|n
What do you do at the company?|Bạn làm công việc gì ở công ty?|n
It's been a while!|Lâu rồi mới gặp!|c
Let's catch up soon.|Mình sớm gặp nhau trò chuyện nhé.|c
Congratulations on your promotion!|Chúc mừng bạn được thăng chức!|n
Have a great weekend!|Chúc cuối tuần vui vẻ!|c
`
  };

  function build() {
    var out = [];
    CATS.forEach(function (c) {
      var n = 0;
      RAW[c.id].split('\n').forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var p = line.split('|');
        n++;
        out.push({ id: c.id + '-' + n, cat: c.id, en: p[0].trim(), vi: (p[1] || '').trim(), reg: (p[2] || '').trim(), note: (p[3] || '').trim() });
      });
    });
    return out;
  }

  var api = { cats: CATS, phrases: build() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).phrasesData = api;
})(typeof self !== 'undefined' ? self : globalThis);
