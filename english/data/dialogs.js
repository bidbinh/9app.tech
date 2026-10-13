/* Kịch bản đóng vai có nhánh (tĩnh, không AI).
 * Mỗi nút: who (người nói), text (câu họ nói), vi (nghĩa), choices [{say, vi, tone: best|ok|poor, fb, next}] hoặc end {result: good|ok|bad, summary}.
 * Với "poor"/"ok" luôn có giải thích (fb) để người học hiểu vì sao. */
(function (root) {
  var B = 'best', K = 'ok', P = 'poor';
  var list = [
    {
      id: 'extension', title: 'Xin lùi hạn nộp báo cáo', level: 'B1', icon: 'clock',
      setting: 'Bạn là Minh. Sếp Hana hỏi tiến độ báo cáo khách hàng, nhưng dữ liệu về muộn nên bạn cần thêm thời gian.',
      who: 'Ms. Hana (sếp)', start: 'n1',
      nodes: {
        n1: { who: 'Ms. Hana', text: 'Hi Minh. How is the client report coming along? It is due on Friday.', vi: 'Chào Minh. Báo cáo cho khách đến đâu rồi? Hạn là thứ Sáu nhé.', choices: [
          { say: 'It is going well, but I need two more days to finish the analysis. Would that be possible?', vi: 'Đang ổn, nhưng tôi cần thêm hai ngày để hoàn tất phần phân tích. Có được không ạ?', tone: B, fb: 'Báo sớm, nêu rõ cần gì và hỏi ý kiến: cách làm chuyên nghiệp.', next: 'n2a' },
          { say: 'I cannot finish it by Friday.', vi: 'Tôi không thể xong trước thứ Sáu.', tone: P, fb: 'Quá cụt: không giải thích, không đề xuất cách xử lý. Hãy nói lý do và đưa phương án.', next: 'n2b' },
          { say: 'It is coming along fine. I am just checking a few numbers.', vi: 'Đang ổn. Tôi chỉ đang kiểm tra lại vài con số.', tone: K, fb: 'Không sai, nhưng nếu bạn biết sẽ trễ thì nên nói luôn thay vì chờ.', next: 'n2c' }
        ] },
        n2a: { who: 'Ms. Hana', text: 'Hmm, two more days is tight. The client expects it on Friday. What is holding you up?', vi: 'Hai ngày nữa thì sát quá. Khách mong thứ Sáu. Điều gì đang làm chậm bạn?', choices: [
          { say: 'The sales data from the regional office arrived late, and I am still checking that the figures are accurate.', vi: 'Dữ liệu bán hàng từ chi nhánh về muộn, và tôi vẫn đang kiểm tra các số liệu có chính xác không.', tone: B, fb: 'Nêu nguyên nhân khách quan, ngắn gọn và không đổ lỗi.', next: 'n3' },
          { say: 'It is not my fault. Other people were late.', vi: 'Đây không phải lỗi của tôi. Người khác trễ.', tone: P, fb: 'Đổ lỗi làm cuộc trò chuyện căng thẳng. Hãy nói sự việc, không nói về lỗi của ai.', end: { result: 'bad', summary: 'Sếp có thể giữ ấn tượng xấu. Lần sau nêu nguyên nhân bằng sự việc cụ thể.' } }
        ] },
        n2b: { who: 'Ms. Hana', text: 'That is a problem. The client is waiting. Can you explain what is happening?', vi: 'Vậy là có vấn đề. Khách đang chờ. Bạn giải thích chuyện gì đang xảy ra được không?', choices: [
          { say: 'I am sorry for being so direct. The data came late, so I need two more days. I can send a draft on Friday.', vi: 'Xin lỗi vì tôi nói quá thẳng. Dữ liệu về muộn nên tôi cần thêm hai ngày. Tôi có thể gửi bản nháp vào thứ Sáu.', tone: B, fb: 'Xin lỗi, giải thích và đưa ra phương án: sửa được cuộc trò chuyện.', next: 'n3' },
          { say: 'I am just busy.', vi: 'Tôi chỉ là đang bận.', tone: P, fb: 'Câu này không giúp sếp quyết định gì. "Busy" không phải lý do thuyết phục.', end: { result: 'bad', summary: 'Sếp vẫn không biết tình hình thật và không có phương án. Hãy luôn nêu nguyên nhân và đề xuất.' } }
        ] },
        n2c: { who: 'Ms. Hana', text: 'Great. Is there anything you need from me?', vi: 'Tốt. Bạn có cần gì từ tôi không?', choices: [
          { say: 'Actually, there is one thing. Could I have until Monday? I want to double-check the figures.', vi: 'Thật ra có một việc. Tôi có thể xin đến thứ Hai không? Tôi muốn kiểm tra lại các số liệu.', tone: B, fb: 'Nhân cơ hội nói thật và xin thêm thời gian kèm lý do rõ ràng.', next: 'n3' },
          { say: 'No, thanks. Everything is fine.', vi: 'Không, cảm ơn. Mọi thứ ổn cả.', tone: K, fb: 'Bỏ lỡ cơ hội báo rủi ro. Nếu bạn lo trễ hạn thì nên nói ngay lúc này.', end: { result: 'ok', summary: 'Ổn cho hôm nay, nhưng nếu trễ hạn sếp sẽ bất ngờ. Báo rủi ro càng sớm càng tốt.' } }
        ] },
        n3: { who: 'Ms. Hana', text: 'OK. Can you send me a draft by Friday and the final version on Monday?', vi: 'Được. Bạn gửi bản nháp trước thứ Sáu và bản cuối vào thứ Hai nhé?', choices: [
          { say: 'Yes, that works. I will send you a draft on Friday and the final version on Monday morning.', vi: 'Vâng, được ạ. Tôi sẽ gửi bản nháp thứ Sáu và bản cuối sáng thứ Hai.', tone: B, fb: 'Nhắc lại cam kết bằng lời của mình để hai bên cùng hiểu.', end: { result: 'good', summary: 'Tốt. Bạn báo sớm, giải thích rõ và chốt được thỏa thuận cụ thể.' } },
          { say: 'Hmm, I would prefer to send everything on Monday.', vi: 'Hừm, tôi muốn gửi hết vào thứ Hai hơn.', tone: K, fb: 'Sếp vừa nhượng bộ, từ chối tiếp có thể khiến sếp mất lòng tin. Nếu thật sự không thể, hãy giải thích vì sao.', end: { result: 'ok', summary: 'Chấp nhận được, nhưng sếp đã nhượng bộ một lần. Hãy nhận phương án đó nếu khả thi.' } }
        ] }
      }
    },
    {
      id: 'decline-meeting', title: 'Từ chối lịch họp bị trùng', level: 'B1', icon: 'cal',
      setting: 'Anh Ben mời bạn họp rà soát dự án lúc 2 giờ chiều thứ Năm, nhưng bạn có cuộc gọi với khách hàng đúng giờ đó.',
      who: 'Ben (trưởng dự án)', start: 'n1',
      nodes: {
        n1: { who: 'Ben', text: 'Hi, we are planning a project review on Thursday at 2 p.m. Can you join us?', vi: 'Chào bạn, chúng tôi định họp rà soát dự án vào thứ Năm lúc 2 giờ chiều. Bạn tham gia được không?', choices: [
          { say: 'I am afraid I have a client call at that time. Could we move it to Thursday morning or Friday?', vi: 'Tôi e là giờ đó tôi có cuộc gọi với khách. Mình dời sang sáng thứ Năm hoặc thứ Sáu được không?', tone: B, fb: 'Từ chối nhẹ nhàng, nêu lý do ngắn gọn và đề xuất lựa chọn khác.', next: 'n2' },
          { say: 'No, I cannot.', vi: 'Không, tôi không đi được.', tone: P, fb: 'Từ chối cụt, không lý do, không phương án thay thế. Nghe thiếu tôn trọng.', next: 'n2b' },
          { say: 'Thanks for the invitation. Let me check my calendar and get back to you.', vi: 'Cảm ơn lời mời. Để tôi xem lịch rồi trả lời bạn.', tone: K, fb: 'Lịch sự và an toàn, nhưng bạn đã biết mình bận nên có thể nói ngay.', next: 'n2c' }
        ] },
        n2: { who: 'Ben', text: 'Friday morning could work. Would 10 a.m. be OK?', vi: 'Sáng thứ Sáu thì được. 10 giờ có ổn không?', choices: [
          { say: 'Friday at 10 sounds good. Thanks for being flexible.', vi: 'Thứ Sáu lúc 10 giờ nghe ổn. Cảm ơn bạn đã linh hoạt.', tone: B, fb: 'Chốt lại giờ và cảm ơn sự linh hoạt.', end: { result: 'good', summary: 'Tốt. Bạn từ chối lịch sự và vẫn giữ được buổi họp.' } },
          { say: 'Friday is also difficult. Let us just skip me.', vi: 'Thứ Sáu cũng khó. Cứ bỏ tôi ra nhé.', tone: P, fb: 'Bạn bỏ họp mà không đưa phương án khác, trong khi người ta đã nhượng bộ.', end: { result: 'bad', summary: 'Bỏ họp một cách cộc lốc làm đội khó chịu. Ít nhất hãy xin biên bản hoặc đề xuất lúc khác.' } }
        ] },
        n2b: { who: 'Ben', text: 'Oh. Is there a problem? This meeting is important.', vi: 'Ồ. Có vấn đề gì sao? Cuộc họp này quan trọng đấy.', choices: [
          { say: 'Sorry, that sounded rude. I have a client call at 2. Could we find another time, or could someone send me the notes?', vi: 'Xin lỗi, câu vừa rồi nghe khiếm nhã. Tôi có cuộc gọi với khách lúc 2 giờ. Mình tìm giờ khác, hoặc có ai gửi tôi biên bản được không?', tone: B, fb: 'Nhận lỗi, giải thích và đưa hai lựa chọn.', next: 'n2' },
          { say: 'I am just busy.', vi: 'Tôi chỉ là bận.', tone: P, fb: '"Bận" không phải lý do cụ thể và không đưa giải pháp.', end: { result: 'bad', summary: 'Ben sẽ nghĩ bạn không coi trọng cuộc họp. Hãy nêu lý do cụ thể.' } }
        ] },
        n2c: { who: 'Ben', text: 'Sure. Please let me know by tomorrow.', vi: 'Được. Bạn báo cho tôi trước ngày mai nhé.', choices: [
          { say: 'Will do. I will confirm by noon tomorrow.', vi: 'Vâng. Tôi sẽ xác nhận trước trưa mai.', tone: B, fb: 'Hứa một giờ cụ thể thì người kia yên tâm.', end: { result: 'good', summary: 'Tốt. Bạn cho thời hạn trả lời rõ ràng.' } },
          { say: 'OK.', vi: 'Được.', tone: K, fb: 'Quá ngắn; không rõ bạn sẽ làm gì. Nhắc lại cam kết sẽ rõ hơn.', end: { result: 'ok', summary: 'Chấp nhận được, nhưng nên nêu giờ cụ thể bạn sẽ trả lời.' } }
        ] }
      }
    },
    {
      id: 'ask-help', title: 'Nhờ đồng nghiệp giúp', level: 'A2', icon: 'hand',
      setting: 'Bảng tính của bạn có tổng không khớp. Sara là người giỏi Excel nhất phòng.',
      who: 'Sara (đồng nghiệp)', start: 'n1',
      nodes: {
        n1: { who: 'Sara', text: 'Hi, what is up?', vi: 'Chào, có chuyện gì thế?', choices: [
          { say: 'Hi Sara, do you have a minute? I am having trouble with a pivot table, and I was wondering if you could help.', vi: 'Chào Sara, bạn có rảnh chút không? Tôi đang gặp rắc rối với bảng pivot, không biết bạn giúp được không.', tone: B, fb: 'Hỏi xem họ có rảnh, nêu việc rõ và dùng "I was wondering if" cho lịch sự.', next: 'n2' },
          { say: 'Fix my Excel.', vi: 'Sửa Excel cho tôi.', tone: P, fb: 'Là mệnh lệnh, thiếu "please" và không giải thích. Nghe rất thô.', next: 'n2b' },
          { say: 'Sorry to bother you. Are you busy?', vi: 'Xin lỗi làm phiền. Bạn có bận không?', tone: K, fb: 'Lịch sự, nhưng chưa nói bạn cần gì nên người kia phải hỏi tiếp.', next: 'n2c' }
        ] },
        n2: { who: 'Sara', text: 'Sure. What exactly is the problem?', vi: 'Được thôi. Chính xác thì vấn đề là gì?', choices: [
          { say: 'The totals do not match the source data. Could you take a quick look at it with me?', vi: 'Tổng không khớp với dữ liệu gốc. Bạn xem nhanh cùng tôi được không?', tone: B, fb: 'Nêu vấn đề cụ thể và dùng "Could you" lịch sự.', next: 'n3' },
          { say: 'It is broken.', vi: 'Nó hỏng rồi.', tone: K, fb: 'Quá chung chung; người giúp không biết bắt đầu từ đâu.', next: 'n2d' }
        ] },
        n2b: { who: 'Sara', text: 'Excuse me? Please ask politely.', vi: 'Xin lỗi? Hãy nhờ cho lịch sự.', choices: [
          { say: 'Sorry! Could you please help me with my Excel file? I would really appreciate it.', vi: 'Xin lỗi! Bạn giúp tôi với tệp Excel được không? Tôi rất biết ơn.', tone: B, fb: 'Xin lỗi nhanh và hỏi lại bằng "Could you please" là cách sửa tốt.', next: 'n2' },
          { say: 'Never mind.', vi: 'Thôi bỏ đi.', tone: P, fb: 'Bỏ đi thay vì sửa lại làm mối quan hệ xấu đi.', end: { result: 'bad', summary: 'Bạn không được giúp và Sara khó chịu. Hãy xin lỗi và hỏi lại lịch sự.' } }
        ] },
        n2c: { who: 'Sara', text: 'Not really. What do you need?', vi: 'Không hẳn. Bạn cần gì?', choices: [
          { say: 'I am having trouble with a pivot table. Could you show me how to fix it?', vi: 'Tôi đang gặp rắc rối với bảng pivot. Bạn chỉ tôi cách sửa được không?', tone: B, fb: 'Nêu việc và nhờ chỉ cách (không nhờ làm hộ), người ta dễ nhận lời hơn.', next: 'n3' },
          { say: 'Nothing. Forget it.', vi: 'Không có gì. Quên đi.', tone: P, fb: 'Hỏi rồi bỏ lửng làm người ta khó hiểu.', end: { result: 'bad', summary: 'Bạn mất cơ hội được giúp. Hãy nói thẳng việc cần nhờ.' } }
        ] },
        n2d: { who: 'Sara', text: 'Can you be more specific? What did you expect to see?', vi: 'Bạn nói cụ thể hơn được không? Bạn mong thấy gì?', choices: [
          { say: 'I expected the total to be 1,200, but it shows 950.', vi: 'Tôi mong tổng là 1.200 nhưng nó hiện 950.', tone: B, fb: 'Con số cụ thể giúp tìm lỗi nhanh.', next: 'n3' },
          { say: 'I do not know.', vi: 'Tôi không biết.', tone: P, fb: 'Chuẩn bị trước cách mô tả vấn đề trước khi nhờ giúp.', end: { result: 'bad', summary: 'Sara chưa thể giúp vì thiếu thông tin. Hãy chuẩn bị mô tả cụ thể.' } }
        ] },
        n3: { who: 'Sara', text: 'Ah, I see. You need to refresh the data source. Click here. There, it is fixed.', vi: 'À, tôi hiểu rồi. Bạn cần làm mới nguồn dữ liệu. Bấm ở đây. Đó, xong rồi.', choices: [
          { say: 'That is perfect. Thank you so much. I owe you one!', vi: 'Hoàn hảo. Cảm ơn bạn rất nhiều. Tôi nợ bạn một lần nhé!', tone: B, fb: 'Cảm ơn thật lòng, giữ quan hệ tốt.', end: { result: 'good', summary: 'Tốt. Bạn nhờ lịch sự, nêu rõ vấn đề và cảm ơn chu đáo.' } },
          { say: 'OK.', vi: 'Được.', tone: K, fb: 'Thiếu lời cảm ơn. Người giúp bạn cần được ghi nhận.', end: { result: 'ok', summary: 'Vấn đề được giải quyết, nhưng nhớ nói lời cảm ơn.' } }
        ] }
      }
    },
    {
      id: 'meet-partner', title: 'Gặp đối tác lần đầu', level: 'B1', icon: 'hand-shake',
      setting: 'David là đối tác từ nước ngoài, đến Hà Nội lần đầu. Bạn là Linh, người phụ trách làm việc với anh ấy.',
      who: 'David (đối tác)', start: 'n1',
      nodes: {
        n1: { who: 'David', text: 'Good morning! You must be Linh from the Hanoi office. Nice to meet you.', vi: 'Chào buổi sáng! Chắc bạn là Linh ở văn phòng Hà Nội. Rất vui được gặp bạn.', choices: [
          { say: 'Nice to meet you too, David. Thank you for coming all the way to Hanoi.', vi: 'Tôi cũng rất vui được gặp anh, David. Cảm ơn anh đã đến tận Hà Nội.', tone: B, fb: 'Đáp lại lời chào và thêm một câu ấm áp.', next: 'n2' },
          { say: 'Yes.', vi: 'Vâng.', tone: P, fb: 'Quá cộc, không có lời chào. Gặp đối tác nên đáp lại nồng hậu hơn.', next: 'n2b' },
          { say: 'Hello. I am Linh. Nice to meet you.', vi: 'Xin chào. Tôi là Linh. Rất vui được gặp anh.', tone: K, fb: 'Đúng và lịch sự, nhưng hơi khô. Thêm một lời cảm ơn hoặc chào đón sẽ ấm áp hơn.', next: 'n2' }
        ] },
        n2: { who: 'David', text: 'My pleasure. It is my first time in Vietnam. How long have you worked for the company?', vi: 'Hân hạnh. Đây là lần đầu tôi đến Việt Nam. Bạn làm cho công ty bao lâu rồi?', choices: [
          { say: 'I have been here for three years. I started in sales, and now I manage the partner accounts.', vi: 'Tôi làm ở đây ba năm rồi. Tôi bắt đầu ở bộ phận bán hàng, và giờ tôi quản lý các tài khoản đối tác.', tone: B, fb: 'Dùng hiện tại hoàn thành (I have been here for three years) đúng để nói về khoảng thời gian đã làm việc, và thêm thông tin về vai trò.', next: 'n3' },
          { say: 'Three years.', vi: 'Ba năm.', tone: K, fb: 'Đủ ý nhưng mất cơ hội kết nối. Nói thêm một chi tiết sẽ tự nhiên hơn.', next: 'n3' }
        ] },
        n2b: { who: 'David', text: 'Er... right. Shall we sit down? Would you like some tea or coffee?', vi: 'Ờ... vâng. Mình ngồi nhé? Bạn dùng trà hay cà phê không?', choices: [
          { say: 'Sorry, I am a little nervous. Nice to meet you too! Welcome to Hanoi.', vi: 'Xin lỗi, tôi hơi hồi hộp. Tôi cũng rất vui được gặp anh! Chào mừng anh đến Hà Nội.', tone: B, fb: 'Thành thật và sửa lại ấn tượng đầu tiên rất hiệu quả.', next: 'n2' },
          { say: 'Let us start the meeting.', vi: 'Mình bắt đầu họp thôi.', tone: K, fb: 'Đi thẳng vào việc có thể nghe lạnh lùng ở lần gặp đầu.', next: 'n3' }
        ] },
        n3: { who: 'David', text: 'Great. I am looking forward to working with you. What are your goals for this partnership?', vi: 'Tốt quá. Tôi mong được làm việc với bạn. Mục tiêu của bạn cho sự hợp tác này là gì?', choices: [
          { say: 'We hope to expand together in Southeast Asia. Today I would like to hear your ideas and share our plan.', vi: 'Chúng tôi hy vọng cùng mở rộng ở Đông Nam Á. Hôm nay tôi muốn nghe ý tưởng của anh và chia sẻ kế hoạch của chúng tôi.', tone: B, fb: 'Trả lời rõ mục tiêu và mời đối tác cùng trao đổi.', end: { result: 'good', summary: 'Tốt. Bạn tạo ấn tượng chuyên nghiệp và cởi mở.' } },
          { say: 'I do not know. My boss decides.', vi: 'Tôi không biết. Sếp tôi quyết định.', tone: P, fb: 'Nghe như bạn không có chính kiến hay trách nhiệm.', end: { result: 'bad', summary: 'Đối tác sẽ nghi ngờ bạn có đủ thẩm quyền không. Hãy nói điều bạn biết.' } }
        ] }
      }
    },
    {
      id: 'interview', title: 'Phỏng vấn xin việc', level: 'B2', icon: 'user',
      setting: 'Bạn phỏng vấn vị trí chuyên viên marketing. Ms. Parker là người phỏng vấn.',
      who: 'Ms. Parker (nhà tuyển dụng)', start: 'n1',
      nodes: {
        n1: { who: 'Ms. Parker', text: 'Thanks for coming in. Could you tell me a little about yourself?', vi: 'Cảm ơn bạn đã đến. Bạn kể sơ về bản thân được không?', choices: [
          { say: 'Of course. I am a marketing specialist with four years of experience, mostly in e-commerce. I enjoy turning data into campaigns that bring in new customers.', vi: 'Vâng. Tôi là chuyên viên marketing có bốn năm kinh nghiệm, chủ yếu trong thương mại điện tử. Tôi thích biến dữ liệu thành các chiến dịch mang về khách mới.', tone: B, fb: 'Tập trung vào nghề nghiệp: vai trò, số năm kinh nghiệm và điểm mạnh.', next: 'n2' },
          { say: 'I was born in 1995 in Hue. I have two sisters. I like movies.', vi: 'Tôi sinh năm 1995 ở Huế. Tôi có hai chị gái. Tôi thích phim.', tone: P, fb: 'Thông tin cá nhân không liên quan đến công việc. Hãy kể về nghề nghiệp.', next: 'n2b' },
          { say: 'I work in marketing. I have four years of experience.', vi: 'Tôi làm marketing. Tôi có bốn năm kinh nghiệm.', tone: K, fb: 'Đúng nhưng ngắn. Thêm một điểm mạnh hoặc thành tích sẽ ấn tượng hơn.', next: 'n2' }
        ] },
        n2b: { who: 'Ms. Parker', text: 'I see. Let us focus on your career. What are you doing now?', vi: 'Tôi hiểu. Mình tập trung vào sự nghiệp của bạn nhé. Hiện bạn đang làm gì?', choices: [
          { say: 'I am a marketing specialist at an e-commerce company, and I run email and social media campaigns.', vi: 'Tôi là chuyên viên marketing ở một công ty thương mại điện tử, và tôi phụ trách các chiến dịch email và mạng xã hội.', tone: B, fb: 'Quay lại đúng trọng tâm: vị trí hiện tại và nhiệm vụ chính.', next: 'n2' },
          { say: 'Marketing.', vi: 'Marketing.', tone: K, fb: 'Chỉ một từ thì không đủ thông tin.', next: 'n2' }
        ] },
        n2: { who: 'Ms. Parker', text: 'What would you say is your greatest strength?', vi: 'Theo bạn điểm mạnh lớn nhất của bạn là gì?', choices: [
          { say: 'I am very organized, and I work well under pressure. For example, last year I delivered a campaign in just two weeks, and it increased sales by 20 percent.', vi: 'Tôi rất ngăn nắp và làm việc tốt dưới áp lực. Ví dụ, năm ngoái tôi hoàn thành một chiến dịch chỉ trong hai tuần và nó tăng doanh số 20 phần trăm.', tone: B, fb: 'Nêu điểm mạnh kèm ví dụ và số liệu: rất thuyết phục.', next: 'n3' },
          { say: 'I am perfect. I have no weaknesses.', vi: 'Tôi hoàn hảo. Tôi không có điểm yếu.', tone: P, fb: 'Nghe tự phụ và thiếu trung thực. Nhà tuyển dụng muốn thấy bạn tự nhận thức.', end: { result: 'bad', summary: 'Tự nhận hoàn hảo là lỗi phổ biến. Hãy nêu điểm mạnh kèm ví dụ cụ thể.' } },
          { say: 'I am hard-working and a team player.', vi: 'Tôi chăm chỉ và biết làm việc nhóm.', tone: K, fb: 'Đúng hướng, nhưng ai cũng nói vậy. Hãy thêm một ví dụ.', next: 'n3' }
        ] },
        n3: { who: 'Ms. Parker', text: 'Our budget for this role is flexible. What salary are you expecting?', vi: 'Ngân sách cho vị trí này linh hoạt. Bạn mong muốn mức lương bao nhiêu?', choices: [
          { say: 'Based on my experience and the market rate, I am looking for something between 25 and 30 million dong a month, but I am open to discussing the full package.', vi: 'Dựa trên kinh nghiệm và mặt bằng thị trường, tôi mong mức từ 25 đến 30 triệu đồng một tháng, nhưng tôi sẵn sàng bàn về toàn bộ gói đãi ngộ.', tone: B, fb: 'Đưa khoảng lương có căn cứ và để ngỏ thương lượng.', end: { result: 'good', summary: 'Rất tốt. Bạn trả lời tự tin, có căn cứ và để ngỏ thương lượng.' } },
          { say: 'As much as possible.', vi: 'Càng nhiều càng tốt.', tone: P, fb: 'Nghe thiếu chuẩn bị và thiếu nghiêm túc.', end: { result: 'bad', summary: 'Hãy tìm hiểu mức lương thị trường trước phỏng vấn để đưa ra một khoảng cụ thể.' } },
          { say: 'I would rather hear your offer first.', vi: 'Tôi muốn nghe đề nghị của bên bạn trước.', tone: K, fb: 'Tùy tình huống: nhiều người xem đây là cách đàm phán khôn ngoan, nhưng nhà tuyển dụng đã hỏi thẳng nên hãy có sẵn một khoảng lương phòng khi họ hỏi lại.', end: { result: 'ok', summary: 'Không sai, nhưng hãy chuẩn bị sẵn khoảng lương mong muốn.' } }
        ] }
      }
    },
    {
      id: 'complaint', title: 'Khách hàng phàn nàn giao trễ', level: 'B2', icon: 'phone',
      setting: 'Ông Carter gọi điện giận dữ vì 50 chiếc ghế đặt hai tuần trước vẫn chưa đến. Bạn là nhân viên chăm sóc khách hàng.',
      who: 'Mr. Carter (khách hàng)', start: 'n1',
      nodes: {
        n1: { who: 'Mr. Carter', text: 'Hello. I ordered fifty chairs two weeks ago, and they still have not arrived. This is unacceptable!', vi: 'Xin chào. Tôi đặt năm mươi chiếc ghế hai tuần trước mà vẫn chưa nhận được. Thật không thể chấp nhận!', choices: [
          { say: 'I am very sorry about the delay, Mr. Carter. Let me check your order right away. Could I have your order number, please?', vi: 'Tôi rất xin lỗi vì sự chậm trễ, thưa ông Carter. Để tôi kiểm tra đơn của ông ngay. Cho tôi xin mã đơn hàng được không?', tone: B, fb: 'Xin lỗi trước, rồi hành động ngay. Đúng trình tự xử lý khiếu nại.', next: 'n2' },
          { say: 'That is not our fault. The shipping company is slow.', vi: 'Đó không phải lỗi của chúng tôi. Bên vận chuyển chậm.', tone: P, fb: 'Đổ lỗi làm khách giận hơn. Khách muốn giải pháp, không muốn nghe bào chữa.', next: 'n2b' },
          { say: 'I understand. Can you give me the order number?', vi: 'Tôi hiểu. Ông cho tôi mã đơn hàng được không?', tone: K, fb: 'Đúng việc cần làm, nhưng thiếu lời xin lỗi nên khách chưa thấy được lắng nghe.', next: 'n2' }
        ] },
        n2b: { who: 'Mr. Carter', text: 'I do not care whose fault it is. I want my chairs.', vi: 'Tôi không quan tâm lỗi của ai. Tôi muốn nhận ghế của mình.', choices: [
          { say: 'You are right. I apologize. Let me check your order now. Could I have the order number?', vi: 'Ông nói đúng. Tôi xin lỗi. Để tôi kiểm tra đơn ngay. Cho tôi xin mã đơn hàng?', tone: B, fb: 'Nhận lỗi và chuyển sang giải pháp: cách cứu cuộc gọi.', next: 'n2' },
          { say: 'Please calm down.', vi: 'Xin ông bình tĩnh.', tone: P, fb: 'Câu này thường khiến khách giận hơn vì nghe như bạn coi cảm xúc của họ là vô lý.', end: { result: 'bad', summary: 'Khách có thể gác máy và khiếu nại lên cấp trên. Hãy đồng cảm trước, rồi giải quyết.' } }
        ] },
        n2: { who: 'Mr. Carter', text: 'It is 48213.', vi: 'Mã là 48213.', choices: [
          { say: 'Thank you. I can see that the shipment was delayed at customs. It should arrive on Thursday. I apologize for the inconvenience.', vi: 'Cảm ơn ông. Tôi thấy lô hàng bị giữ ở hải quan. Dự kiến thứ Năm sẽ đến. Tôi xin lỗi vì sự bất tiện.', tone: B, fb: 'Cho biết nguyên nhân, ngày cụ thể và xin lỗi.', next: 'n3' },
          { say: 'I see it is delayed. I do not know when it will arrive.', vi: 'Tôi thấy đơn bị chậm. Tôi không biết khi nào sẽ đến.', tone: P, fb: 'Nói thật nhưng không có hướng giải quyết, khách sẽ càng lo.', next: 'n3b' }
        ] },
        n3b: { who: 'Mr. Carter', text: 'That is not good enough. I need a date.', vi: 'Như vậy chưa đủ. Tôi cần một ngày cụ thể.', choices: [
          { say: 'You are right. Let me call the shipping company now, and I will call you back within one hour with a firm date.', vi: 'Ông nói đúng. Để tôi gọi bên vận chuyển ngay, và tôi sẽ gọi lại cho ông trong vòng một giờ với ngày chắc chắn.', tone: B, fb: 'Hứa một mốc thời gian có thể giữ được.', end: { result: 'good', summary: 'Tốt. Bạn lấy lại được niềm tin bằng cam kết cụ thể.' } },
          { say: 'I cannot promise anything.', vi: 'Tôi không thể hứa gì cả.', tone: P, fb: 'Dù thật, khách cần thấy bạn đang xử lý. Hãy hứa gọi lại thay vì từ chối.', end: { result: 'bad', summary: 'Khách mất kiên nhẫn. Hãy đưa mốc thời gian bạn sẽ gọi lại.' } }
        ] },
        n3: { who: 'Mr. Carter', text: 'Thursday? That is too late. I need them for an event on Wednesday.', vi: 'Thứ Năm? Trễ quá. Tôi cần ghế cho sự kiện vào thứ Tư.', choices: [
          { say: 'I understand. Let me ask my manager right away whether we can arrange express delivery so that the chairs arrive on Wednesday morning. Would that help?', vi: 'Tôi hiểu. Để tôi hỏi quản lý ngay xem có thể giao nhanh để ghế đến sáng thứ Tư không. Như vậy có giúp được ông không ạ?', tone: B, fb: 'Đưa giải pháp nhắm đúng nhu cầu của khách và không hứa vượt thẩm quyền: hỏi quản lý trước khi cam kết.', end: { result: 'good', summary: 'Rất tốt. Bạn nghe nhu cầu thật của khách và đưa ra giải pháp.' } },
          { say: 'Sorry, Thursday is the earliest.', vi: 'Xin lỗi, thứ Năm là sớm nhất.', tone: P, fb: 'Chỉ nói "không thể" mà không có hướng khác.', end: { result: 'bad', summary: 'Khách có thể hủy đơn. Luôn đưa ít nhất một phương án thay thế.' } },
          { say: 'I could offer a ten percent discount for the delay, and I will ask whether express delivery is possible.', vi: 'Tôi có thể giảm giá mười phần trăm vì sự chậm trễ, và tôi sẽ hỏi xem có giao nhanh được không.', tone: K, fb: 'Có thiện chí, nhưng giảm giá chưa giải quyết nhu cầu có ghế vào thứ Tư.', end: { result: 'ok', summary: 'Có thiện chí, nhưng chưa giải quyết đúng nhu cầu thời gian của khách.' } }
        ] }
      }
    },
    {
      id: 'hotel', title: 'Nhận phòng khách sạn khi đi công tác', level: 'A2', icon: 'bed',
      setting: 'Bạn là anh Nguyên, vừa bay mười tiếng tới khách sạn Grand Plaza và cần nhận phòng.',
      who: 'Lễ tân khách sạn', start: 'n1',
      nodes: {
        n1: { who: 'Receptionist', text: 'Good evening. Welcome to the Grand Plaza. Do you have a reservation?', vi: 'Chào buổi tối. Chào mừng đến Grand Plaza. Anh có đặt phòng trước không ạ?', choices: [
          { say: 'Yes, I have a reservation under Nguyen. I am here for three nights.', vi: 'Có, tôi đặt phòng dưới tên Nguyen. Tôi ở ba đêm.', tone: B, fb: 'Cho biết tên đặt phòng và số đêm: lễ tân có thể tra ngay.', next: 'n2' },
          { say: 'Yes. Nguyen.', vi: 'Có. Nguyen.', tone: K, fb: 'Đủ để tra cứu, nhưng nên nói câu đầy đủ cho lịch sự.', next: 'n2' },
          { say: 'I want a room.', vi: 'Tôi muốn một phòng.', tone: P, fb: 'Trực tiếp quá và không trả lời câu hỏi. "I would like..." lịch sự hơn "I want...".', next: 'n2b' }
        ] },
        n2b: { who: 'Receptionist', text: 'Certainly, sir. Do you have a reservation?', vi: 'Dạ được, thưa anh. Anh có đặt phòng trước không ạ?', choices: [
          { say: 'Sorry, yes. It is under Nguyen. I would like to check in, please.', vi: 'Xin lỗi, có. Tên đặt phòng là Nguyen. Tôi muốn làm thủ tục nhận phòng.', tone: B, fb: 'Dùng "I would like to" và trả lời đúng câu hỏi.', next: 'n2' }
        ] },
        n2: { who: 'Receptionist', text: 'Thank you, Mr. Nguyen. I am sorry, but your room is not ready yet. It will be ready in about thirty minutes.', vi: 'Cảm ơn anh Nguyen. Tôi xin lỗi, phòng của anh chưa sẵn sàng. Khoảng ba mươi phút nữa sẽ xong.', choices: [
          { say: 'I see. Could you store my luggage in the meantime? And is there a place where I can have a coffee?', vi: 'Tôi hiểu. Trong lúc đó bạn giữ giúp hành lý được không? Và có chỗ nào để tôi uống cà phê không?', tone: B, fb: 'Bình tĩnh, nhờ hai việc cụ thể.', next: 'n3' },
          { say: 'What? I have been traveling for ten hours! This is terrible!', vi: 'Gì cơ? Tôi đi mười tiếng rồi! Thật tệ!', tone: P, fb: 'Bực là dễ hiểu, nhưng lễ tân không có lỗi. Hãy nói điều bạn cần.', next: 'n3b' },
          { say: 'OK, I will wait.', vi: 'Được, tôi sẽ chờ.', tone: K, fb: 'Lịch sự nhưng bạn bỏ lỡ cơ hội nhờ gửi hành lý hoặc hỏi chỗ ngồi chờ.', next: 'n3' }
        ] },
        n3b: { who: 'Receptionist', text: 'I am very sorry, sir. May I offer you a complimentary drink while you wait?', vi: 'Tôi rất xin lỗi anh. Anh có muốn dùng một thức uống miễn phí trong lúc chờ không ạ?', choices: [
          { say: 'Thank you, that is kind. Sorry I was upset. I am just tired from the flight.', vi: 'Cảm ơn bạn, bạn thật tốt. Xin lỗi vì tôi đã nóng. Tôi chỉ mệt vì chuyến bay.', tone: B, fb: 'Xin lỗi và giải thích ngắn gọn: sửa lại tình huống rất tốt.', next: 'n3' },
          { say: 'Fine.', vi: 'Được.', tone: K, fb: 'Cộc lốc. Một lời cảm ơn sẽ tốt hơn.', next: 'n3' },
          { say: 'Just give me any room. I do not care.', vi: 'Cứ đưa tôi phòng nào cũng được. Tôi không quan tâm.', tone: P, fb: 'Thái độ cáu kỉnh với nhân viên lễ tân không giúp phòng nhanh sẵn sàng hơn.', end: { result: 'bad', summary: 'Lễ tân khó có thiện chí hỗ trợ thêm. Hãy giữ lịch sự dù đang mệt.' } }
        ] },
        n3: { who: 'Receptionist', text: 'Of course. The café is on your left. Would you like breakfast included in your stay?', vi: 'Dĩ nhiên. Quán cà phê ở bên trái. Anh có muốn kèm bữa sáng trong thời gian lưu trú không?', choices: [
          { say: 'Yes, please. And could you tell me what time breakfast is served? I will also need a receipt for my company.', vi: 'Vâng, làm ơn. Và bạn cho tôi biết bữa sáng phục vụ lúc mấy giờ? Tôi cũng cần biên lai cho công ty.', tone: B, fb: 'Hỏi thêm chi tiết và nhớ đến biên lai để thanh toán chi phí công tác.', end: { result: 'good', summary: 'Tốt. Bạn xử lý gọn việc nhận phòng và nhớ giấy tờ công tác.' } },
          { say: 'No.', vi: 'Không.', tone: K, fb: 'Trả lời "No" một mình nghe cộc. Thêm "thank you" hoặc "no, thanks".', end: { result: 'ok', summary: 'Ổn, nhưng nên nói "No, thank you" cho lịch sự.' } }
        ] }
      }
    }
  ];

  /* Kiểm tra cấu trúc kịch bản: mọi next trỏ tới nút có thật, mọi nút đều dẫn tới kết thúc. */
  function validate(d) {
    var errs = [];
    if (!d.nodes[d.start]) errs.push(d.id + ': thiếu nút bắt đầu');
    Object.keys(d.nodes).forEach(function (id) {
      var n = d.nodes[id];
      if (!n.choices || !n.choices.length) { errs.push(d.id + '/' + id + ': không có lựa chọn'); return; }
      n.choices.forEach(function (c, i) {
        if (!c.say || !c.vi || !c.fb || !c.tone) errs.push(d.id + '/' + id + '#' + i + ': thiếu trường');
        if (!c.next && !c.end) errs.push(d.id + '/' + id + '#' + i + ': không có next hoặc end');
        if (c.next && !d.nodes[c.next]) errs.push(d.id + '/' + id + '#' + i + ': next không tồn tại ' + c.next);
      });
    });
    return errs;
  }

  /* Kết quả tính từ cả đường đi (mảng tone), không chỉ lựa chọn cuối:
   * không có lựa chọn "poor" và ≥2/3 là "best" -> good; có đúng 1 "poor" thì tối đa ok (cần ≥1/2 best); từ 2 "poor" trở lên -> bad. */
  function grade(path) {
    var n = path.length, best = 0, poor = 0;
    path.forEach(function (t) { if (t === 'best') best++; else if (t === 'poor') poor++; });
    if (!n) return 'bad';
    if (poor >= 2) return 'bad';
    if (poor === 1) return best / n >= 0.5 ? 'ok' : 'bad';
    return best / n >= 2 / 3 ? 'good' : 'ok';
  }
  var SUMMARY = {
    good: 'Tốt. Phần lớn lựa chọn của bạn lịch sự, rõ ràng và đưa ra được hướng giải quyết.',
    ok: 'Khá ổn. Bạn đạt mục tiêu nhưng vẫn có lựa chọn chưa tối ưu, hãy xem lại phản hồi từng lượt.',
    bad: 'Cần cải thiện. Nhiều lựa chọn chưa phù hợp, hãy thử lại nhánh khác và đọc kỹ phần giải thích.'
  };

  var api = { list: list, validate: validate, grade: grade, summary: SUMMARY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).dialogs = api;
})(typeof self !== 'undefined' ? self : globalThis);
