/* Khung email mẫu có chỗ điền. Trong subject/body, {khóa} được thay bằng giá trị người học nhập. */
(function (root) {
  var list = [
    {
      id: 'meeting-request', title: 'Hẹn lịch họp', vi: 'Đề nghị một cuộc họp với đồng nghiệp hoặc đối tác.',
      fields: [
        { k: 'to', label: 'Tên người nhận', ph: 'Ms. Lan', def: 'Ms. Lan' },
        { k: 'topic', label: 'Nội dung cần bàn', ph: 'the Q3 marketing plan', def: 'the Q3 marketing plan' },
        { k: 'day', label: 'Thời gian đề xuất', ph: 'Tuesday at 10 a.m.', def: 'Tuesday at 10 a.m.' },
        { k: 'duration', label: 'Thời lượng', ph: '30 minutes', def: '30 minutes' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Meeting request: {topic}',
      body: 'Dear {to},\n\nI hope this email finds you well.\n\nI would like to arrange a meeting to discuss {topic}. Would {day} work for you? I expect it to take about {duration}.\n\nIf that time is not convenient, please let me know your availability and I will do my best to adjust.\n\nI look forward to hearing from you.\n\nKind regards,\n{me}'
    },
    {
      id: 'follow-up', title: 'Nhắc việc, theo dõi', vi: 'Nhắc lại một email hoặc đề xuất chưa được trả lời.',
      fields: [
        { k: 'to', label: 'Tên người nhận', ph: 'Mr. Tan', def: 'Mr. Tan' },
        { k: 'about', label: 'Việc cần nhắc', ph: 'the proposal I sent on May 12', def: 'the proposal I sent on May 12' },
        { k: 'date', label: 'Hạn mong muốn', ph: 'Friday', def: 'Friday' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Following up: {about}',
      body: 'Dear {to},\n\nI am writing to follow up on {about}. I understand you are busy, but I would be grateful if you could let me know by {date} where things stand.\n\nPlease let me know if you need any additional information from my side.\n\nThank you for your time.\n\nBest regards,\n{me}'
    },
    {
      id: 'decline-invite', title: 'Từ chối lời mời', vi: 'Từ chối tham dự sự kiện hoặc cuộc họp một cách lịch sự.',
      fields: [
        { k: 'to', label: 'Tên người nhận', ph: 'Ms. Hoa', def: 'Ms. Hoa' },
        { k: 'what', label: 'Sự kiện được mời', ph: 'the product launch on June 5', def: 'the product launch on June 5' },
        { k: 'reason', label: 'Lý do (ngắn gọn)', ph: 'a client meeting that day', def: 'a client meeting that day' },
        { k: 'alt', label: 'Câu đề nghị thay thế', ph: 'Please keep me in mind for future events.', def: 'Please keep me in mind for future events.' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Re: Invitation to {what}',
      body: 'Dear {to},\n\nThank you very much for inviting me to {what}. Unfortunately, I will not be able to attend because of {reason}.\n\n{alt}\n\nI appreciate your understanding and wish you every success.\n\nBest regards,\n{me}'
    },
    {
      id: 'late-reply', title: 'Xin lỗi vì trả lời chậm', vi: 'Xin lỗi và trả lời câu hỏi đã tồn đọng.',
      fields: [
        { k: 'to', label: 'Tên người nhận', ph: 'Ms. Pham', def: 'Ms. Pham' },
        { k: 'about', label: 'Chuyện được hỏi', ph: 'your question about the invoice', def: 'your question about the invoice' },
        { k: 'reason', label: 'Lý do chậm', ph: 'traveling for work last week', def: 'traveling for work last week' },
        { k: 'answer', label: 'Câu trả lời', ph: 'the invoice will be paid by May 20', def: 'the invoice will be paid by May 20' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Re: {about}',
      body: 'Dear {to},\n\nI apologize for the delay in getting back to you about {about}. I was {reason}.\n\nTo answer your question: {answer}.\n\nPlease let me know if you need anything else.\n\nKind regards,\n{me}'
    },
    {
      id: 'ask-help', title: 'Nhờ gửi tài liệu, số liệu', vi: 'Nhờ đồng nghiệp gửi thông tin bạn cần.',
      fields: [
        { k: 'to', label: 'Tên người nhận', ph: 'Hung', def: 'Hung' },
        { k: 'need', label: 'Thứ bạn cần', ph: 'the latest sales figures for Q2', def: 'the latest sales figures for Q2' },
        { k: 'why', label: 'Dùng để làm gì', ph: 'the board report', def: 'the board report' },
        { k: 'by', label: 'Cần trước khi nào', ph: 'Thursday', def: 'Thursday' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Request: {need}',
      body: 'Hi {to},\n\nCould you please send me {need}? I need this for {why}.\n\nIf possible, I would be grateful to have it by {by}. Please let me know if that is a problem.\n\nThanks in advance for your help.\n\nBest,\n{me}'
    },
    {
      id: 'send-report', title: 'Gửi báo cáo đính kèm', vi: 'Gửi báo cáo kèm một ý chính.',
      fields: [
        { k: 'to', label: 'Tên người nhận', ph: 'Mr. Kim', def: 'Mr. Kim' },
        { k: 'report', label: 'Tên báo cáo', ph: 'the monthly sales report for June', def: 'the monthly sales report for June' },
        { k: 'key', label: 'Ý chính (một mệnh đề)', ph: 'sales rose by 8 percent compared with May', def: 'sales rose by 8 percent compared with May' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Report: {report}',
      body: 'Dear {to},\n\nPlease find attached {report}.\n\nThe main point is that {key}. The details are in the attached file, and I would be happy to go through them with you if that would help.\n\nKind regards,\n{me}'
    },
    {
      id: 'leave-request', title: 'Xin nghỉ phép', vi: 'Xin nghỉ phép năm với quản lý.',
      fields: [
        { k: 'to', label: 'Tên quản lý', ph: 'Ms. Hana', def: 'Ms. Hana' },
        { k: 'start', label: 'Ngày bắt đầu nghỉ', ph: 'August 12', def: 'August 12' },
        { k: 'end', label: 'Ngày kết thúc nghỉ', ph: 'August 16', def: 'August 16' },
        { k: 'cover', label: 'Ai thay bạn việc gấp', ph: 'Tuan has agreed to cover my urgent tasks', def: 'Tuan has agreed to cover my urgent tasks' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Annual leave request: {start} to {end}',
      body: 'Dear {to},\n\nI would like to request annual leave from {start} to {end}. I will make sure all urgent tasks are completed before I go, and {cover}.\n\nPlease let me know if you need any further information or if these dates are a problem.\n\nThank you for considering my request.\n\nKind regards,\n{me}'
    },
    {
      id: 'thank-interview', title: 'Cảm ơn sau phỏng vấn', vi: 'Gửi trong vòng 24 giờ sau buổi phỏng vấn.',
      fields: [
        { k: 'to', label: 'Tên người phỏng vấn', ph: 'Ms. Parker', def: 'Ms. Parker' },
        { k: 'when', label: 'Phỏng vấn khi nào', ph: 'yesterday', def: 'yesterday' },
        { k: 'position', label: 'Vị trí ứng tuyển', ph: 'marketing specialist', def: 'marketing specialist' },
        { k: 'point', label: 'Điều bạn thấy thú vị', ph: 'the new customer onboarding project', def: 'the new customer onboarding project' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Thank you: {position} interview',
      body: 'Dear {to},\n\nThank you for taking the time to meet with me {when} about the {position} position. I really enjoyed learning more about {point}.\n\nOur conversation confirmed my interest in the role, and I believe my experience would allow me to contribute to the team.\n\nPlease let me know if I can provide any further information. I look forward to hearing from you.\n\nBest regards,\n{me}'
    },
    {
      id: 'reschedule', title: 'Xin dời lịch', vi: 'Xin đổi lịch một cuộc hẹn đã có.',
      fields: [
        { k: 'to', label: 'Tên người nhận', ph: 'Mr. Long', def: 'Mr. Long' },
        { k: 'what', label: 'Việc cần dời', ph: 'our meeting on Wednesday', def: 'our meeting on Wednesday' },
        { k: 'newtime', label: 'Thời gian mới đề xuất', ph: 'Thursday at 2 p.m.', def: 'Thursday at 2 p.m.' },
        { k: 'me', label: 'Tên của bạn', ph: 'Minh', def: 'Minh' }
      ],
      subject: 'Request to reschedule: {what}',
      body: 'Dear {to},\n\nI am sorry, but I need to reschedule {what} because of an unexpected conflict. Would {newtime} be possible instead?\n\nI apologize for the inconvenience and appreciate your flexibility.\n\nBest regards,\n{me}'
    }
  ];

  /* Thay {khóa} bằng giá trị; ô trống giữ nguyên [khóa] để người học thấy chỗ cần điền. */
  function render(tpl, values) {
    var fill = function (s) {
      return s.replace(/\{(\w+)\}/g, function (m, k) {
        var v = values && values[k] != null ? String(values[k]).trim() : '';
        return v || '[' + k + ']';
      });
    };
    return { subject: fill(tpl.subject), body: fill(tpl.body) };
  }

  var api = { list: list, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).templates = api;
})(typeof self !== 'undefined' ? self : globalThis);
