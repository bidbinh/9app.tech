// Nội dung hướng dẫn: STAR, checklist ngày phỏng vấn, câu hỏi nên hỏi lại, đàm phán lương, thư xin việc.
// Không có số liệu thị trường: mọi con số về lương phải do bạn tự tìm hiểu từ nguồn đáng tin cậy.

export const STAR = [
  { k: 'S', name: 'Situation, Tình huống', desc: 'Bối cảnh ngắn gọn: ở đâu, khi nào, chuyện gì đang xảy ra. Một đến hai câu.' },
  { k: 'T', name: 'Task, Nhiệm vụ', desc: 'Trách nhiệm hoặc mục tiêu của riêng bạn trong tình huống đó. Một câu.' },
  { k: 'A', name: 'Action, Hành động', desc: 'Những gì bạn đã làm, từng bước, dùng "tôi" thay vì "chúng tôi". Đây là phần dài nhất.' },
  { k: 'R', name: 'Result, Kết quả', desc: 'Điều đạt được, nên có con số thật nếu có, và điều bạn học được.' },
];

export const CHECKLIST = [
  { id: 'before', title: 'Trước ngày phỏng vấn', items: [
    'Đọc lại tin tuyển dụng, gạch chân 5 yêu cầu quan trọng nhất và chuẩn bị một ví dụ cho mỗi yêu cầu.',
    'Tìm hiểu công ty: sản phẩm hoặc dịch vụ, khách hàng, tin gần đây, người sẽ phỏng vấn bạn (nếu biết tên).',
    'Chuẩn bị bài giới thiệu bản thân 60 đến 90 giây và luyện nói to.',
    'Chọn 4 đến 5 câu chuyện STAR bao quát: làm việc nhóm, giải quyết vấn đề, sai sót, áp lực, chủ động.',
    'Chuẩn bị câu trả lời cho "điểm yếu", "vì sao rời công ty cũ", "mức lương mong muốn".',
    'Chuẩn bị 3 đến 5 câu hỏi để hỏi lại nhà tuyển dụng.',
    'Xác nhận lại thời gian, địa điểm hoặc đường dẫn phỏng vấn trực tuyến, người liên hệ và số điện thoại.',
    'In hoặc lưu sẵn CV bản mới nhất, bằng cấp, chứng chỉ, các sản phẩm mẫu nếu có.',
  ] },
  { id: 'eve', title: 'Tối hôm trước', items: [
    'Chọn trang phục gọn gàng, phù hợp văn hóa công ty; ủi và để sẵn.',
    'Tính thời gian di chuyển, dự phòng kẹt xe; đến sớm 10 đến 15 phút.',
    'Sạc đầy điện thoại, chuẩn bị sổ và bút.',
    'Nếu phỏng vấn trực tuyến: thử micro, camera, kết nối mạng, ánh sáng, phông nền gọn.',
    'Ngủ đủ giấc; tránh ôn nhồi nhét đến khuya.',
  ] },
  { id: 'day', title: 'Trong ngày', items: [
    'Ăn nhẹ trước khi đi; mang theo nước.',
    'Tắt chuông điện thoại.',
    'Chào hỏi lịch sự, giữ liên lạc mắt, mỉm cười, ngồi thẳng.',
    'Nghe hết câu hỏi, dừng một nhịp để suy nghĩ rồi mới trả lời; nếu chưa rõ thì hỏi lại.',
    'Trả lời trung thực, có ví dụ; không chê công ty hay sếp cũ.',
    'Cuối buổi: hỏi các bước tiếp theo và thời gian dự kiến có kết quả, cảm ơn người phỏng vấn.',
  ] },
  { id: 'after', title: 'Sau buổi phỏng vấn', items: [
    'Gửi thư cảm ơn ngắn trong vòng 24 giờ, nhắc một điểm cụ thể đã trao đổi.',
    'Ghi lại các câu hỏi đã được hỏi và điều bạn muốn trả lời tốt hơn.',
    'Nếu quá thời gian họ hẹn mà chưa có tin, lịch sự hỏi thăm một lần.',
    'Nếu nhận đề nghị: xin thời gian cân nhắc hợp lý và đề nghị gửi bằng văn bản trước khi quyết định.',
  ] },
];

export const ASK_BACK = [
  { title: 'Về công việc', items: [
    'Một ngày làm việc điển hình ở vị trí này trông như thế nào?',
    'Trong ba tháng đầu, người làm tốt ở vị trí này cần đạt được điều gì?',
    'Thách thức lớn nhất của vị trí này hiện nay là gì?',
    'Vị trí này mở ra vì cần thêm người hay thay thế người cũ?',
  ] },
  { title: 'Về đội nhóm và quản lý', items: [
    'Nhóm hiện có bao nhiêu người, phối hợp với những bộ phận nào?',
    'Cách làm việc và giao tiếp trong nhóm thường diễn ra như thế nào?',
    'Anh chị mô tả phong cách quản lý của người sẽ làm việc trực tiếp với tôi?',
  ] },
  { title: 'Về phát triển và đánh giá', items: [
    'Công ty đánh giá hiệu quả công việc theo chu kỳ nào và dựa trên tiêu chí gì?',
    'Có cơ hội đào tạo hay phát triển nghề nghiệp nào cho vị trí này?',
    'Những người từng ở vị trí này thường đi tiếp theo hướng nào?',
  ] },
  { title: 'Về bước tiếp theo', items: [
    'Quy trình tuyển dụng còn những vòng nào và dự kiến bao lâu có kết quả?',
    'Có điều gì ở hồ sơ của tôi mà anh chị còn băn khoăn để tôi giải thích thêm không?',
  ] },
  { title: 'Nên tránh hỏi ở vòng đầu', items: [
    'Hỏi ngay về nghỉ phép, đi muộn, làm thêm giờ hay quy định nghỉ việc.',
    'Những thông tin có sẵn trên website công ty.',
    'Câu hỏi chỉ xoay quanh lương mà chưa quan tâm công việc (để dành cho lúc hợp lý, thường khi nhà tuyển dụng đề cập).',
  ] },
];

// Chỉ là ghi chú chung, không phải tư vấn pháp lý. Mọi dẫn chiếu pháp luật cần kiểm chứng văn bản hiện hành.
export const SENSITIVE = [
  { title: 'Câu hỏi nào là nhạy cảm?', items: [
    'Tuổi tác, tình trạng hôn nhân, kế hoạch sinh con, thai sản.',
    'Ngoại hình, cân nặng, chiều cao (khi không phải yêu cầu chuyên môn rõ ràng của vị trí).',
    'Gia cảnh, nghề nghiệp của bố mẹ, ai chăm con, tôn giáo, dân tộc, quan điểm chính trị.',
    'Nhà tuyển dụng không nên hỏi những điều này nếu không liên quan trực tiếp đến công việc, nhưng ở Việt Nam bạn vẫn có thể gặp. Quy định pháp luật có thể thay đổi, cần kiểm chứng văn bản hiện hành hoặc hỏi tư vấn pháp lý nếu bạn cần dựa vào.',
  ] },
  { title: 'Ba cách phản ứng khéo', items: [
    'Trả lời ngắn nếu bạn thấy thoải mái, rồi chuyển ngay sang năng lực và cam kết với công việc.',
    'Đoán điều họ thật sự lo (có gắn bó không? có đáp ứng lịch không?) và trả lời đúng mối lo đó thay vì chuyện riêng tư.',
    'Hỏi lại nhẹ nhàng: "Anh chị muốn biết điều này liên quan thế nào đến công việc ạ?" rồi tiếp tục bằng ví dụ về năng lực của bạn.',
  ] },
  { title: 'Khi nào nên dừng lại', items: [
    'Nếu câu hỏi lặp lại, ép buộc hoặc mang tính xúc phạm, bạn có quyền từ chối trả lời lịch sự và cân nhắc xem đây có phải nơi bạn muốn làm việc.',
    'Ghi lại câu hỏi và hoàn cảnh sau buổi phỏng vấn nếu bạn muốn tìm tư vấn.',
  ] },
];

export const SALARY = [
  { title: 'Chuẩn bị trước', items: [
    'Tự tìm hiểu mức tham khảo cho vị trí tương tự từ nhiều nguồn (tin tuyển dụng có ghi lương, khảo sát lương của các đơn vị uy tín, bạn bè trong nghề). Ghi lại nguồn và ngày. 9interview không đưa số liệu thị trường vì dễ lỗi thời hoặc sai.',
    'Xác định ba mốc của riêng bạn: mức mong muốn, mức chấp nhận được, và mức dưới đó bạn sẽ từ chối.',
    'Liệt kê giá trị bạn mang lại: kết quả đã đạt, kỹ năng hiếm, chứng chỉ, kinh nghiệm liên quan.',
    'Nhớ tính cả tổng thu nhập: lương cơ bản, phụ cấp, thưởng, bảo hiểm, phúc lợi, lịch làm việc, đào tạo.',
  ] },
  { title: 'Trong lúc đàm phán', items: [
    'Chờ nhà tuyển dụng nói ra mức trước nếu có thể, hoặc hỏi ngân sách của vị trí.',
    'Nêu một khoảng, với đầu dưới của khoảng là mức bạn chấp nhận được.',
    'Gắn mức mong muốn với giá trị và phạm vi công việc, không gắn với chi phí sinh hoạt cá nhân.',
    'Giữ giọng lịch sự, tích cực; thể hiện bạn muốn công việc này, chỉ đang tìm mức công bằng.',
    'Nếu chưa đồng ý ngay, xin thời gian cân nhắc một đến hai ngày.',
  ] },
  { title: 'Khi mức đề nghị thấp hơn mong muốn', items: [
    'Cảm ơn đề nghị, hỏi cách cơ cấu: lương cơ bản, thưởng, phụ cấp.',
    'Đề xuất lựa chọn khác: đánh giá lại lương sau thử việc, thưởng hiệu quả, ngân sách đào tạo, ngày nghỉ, làm việc linh hoạt.',
    'Nếu bạn không thể chấp nhận, từ chối lịch sự và để lại cánh cửa mở.',
    'Xin đề nghị bằng văn bản và đọc kỹ điều khoản thử việc, chấm dứt hợp đồng trước khi ký.',
  ] },
];

export const SALARY_SCRIPTS = [
  { title: 'Khi được hỏi mức mong muốn', text: 'Em muốn hiểu thêm về phạm vi công việc trước khi nêu con số cụ thể. Dựa trên tìm hiểu của em và kinh nghiệm hiện có, em mong muốn tổng thu nhập trong khoảng [đầu dưới] đến [đầu trên] một tháng. Anh chị cho em biết ngân sách của vị trí để mình xem có phù hợp không ạ?' },
  { title: 'Khi mức đề nghị thấp hơn', text: 'Em cảm ơn đề nghị của công ty và rất mong được làm việc ở đây. Mức này hơi thấp so với kỳ vọng của em, vì với [kinh nghiệm/kết quả cụ thể] em nghĩ mình có thể đóng góp ở mức cao hơn. Anh chị có thể xem lại gần mức [con số] không, hoặc cho em biết có phần nào khác như thưởng hay đánh giá lại sau thử việc có thể linh hoạt không ạ?' },
  { title: 'Khi xin thời gian cân nhắc', text: 'Em cảm ơn anh chị đã đưa đề nghị. Em xin phép cân nhắc đến [ngày] và sẽ phản hồi ngay sau đó. Anh chị có thể gửi đề nghị bằng văn bản giúp em được không ạ?' },
];

// Thư xin việc: {{tên trường}} sẽ được thay bằng dữ liệu người dùng nhập.
export const LETTER_TEMPLATES = [
  { id: 'chuan', name: 'Chuẩn, cân bằng', desc: 'Dùng được cho hầu hết vị trí.',
    body: `Kính gửi {{nguoiNhan}},

Tôi viết thư này để ứng tuyển vị trí {{viTri}} tại {{congTy}}. Với {{kinhNghiem}}, tôi tin rằng kinh nghiệm và kỹ năng của mình phù hợp với yêu cầu của vị trí này.

Tại {{noiLamGanNhat}}, tôi đã {{thanhTich}}. Tôi cũng có thế mạnh về {{diemManh}}, điều tôi nhận thấy rất liên quan tới những gì {{congTy}} đang tìm kiếm.

Tôi đặc biệt quan tâm tới {{congTy}} vì {{lyDo}}. Tôi mong muốn được trao đổi thêm với anh chị về cách tôi có thể đóng góp cho đội ngũ.

Tôi xin cảm ơn anh chị đã dành thời gian xem xét hồ sơ. Rất mong sớm nhận được phản hồi.

Trân trọng,
{{hoTen}}
{{lienHe}}` },
  { id: 'ngan', name: 'Ngắn gọn (email)', desc: 'Dành cho thư nhắn qua email, vài dòng.',
    body: `Chào {{nguoiNhan}},

Tôi là {{hoTen}}, xin ứng tuyển vị trí {{viTri}} tại {{congTy}}. Tôi có {{kinhNghiem}}; gần nhất tại {{noiLamGanNhat}}, tôi đã {{thanhTich}}.

Hồ sơ CV của tôi được đính kèm. Rất mong có cơ hội trao đổi thêm với anh chị.

Trân trọng,
{{hoTen}}
{{lienHe}}` },
  { id: 'doinghe', name: 'Chuyển ngành', desc: 'Khi bạn chuyển sang lĩnh vực mới, nhấn mạnh kỹ năng chuyển đổi.',
    body: `Kính gửi {{nguoiNhan}},

Tôi xin ứng tuyển vị trí {{viTri}} tại {{congTy}}. Tuy xuất phát điểm của tôi từ {{noiLamGanNhat}}, những kỹ năng tôi đã xây dựng như {{diemManh}} có thể áp dụng trực tiếp vào vị trí này.

Cụ thể, tại {{noiLamGanNhat}}, tôi đã {{thanhTich}}. Ngoài ra, tôi chủ động học thêm để chuyển sang lĩnh vực mới: {{kinhNghiem}}.

Tôi chọn {{congTy}} vì {{lyDo}}. Tôi rất mong được gặp để trao đổi cách tôi có thể nhanh chóng đóng góp.

Trân trọng,
{{hoTen}}
{{lienHe}}` },
  { id: 'camon', name: 'Thư cảm ơn sau phỏng vấn', desc: 'Gửi trong 24 giờ sau buổi phỏng vấn.',
    body: `Kính gửi {{nguoiNhan}},

Cảm ơn anh chị đã dành thời gian trao đổi với tôi về vị trí {{viTri}} tại {{congTy}}. Tôi đặc biệt ấn tượng với {{lyDo}}, và buổi trao đổi càng củng cố mong muốn được làm việc cùng đội ngũ.

Tôi tin kinh nghiệm của mình ({{thanhTich}}) sẽ giúp ích cho các thách thức mà anh chị đã chia sẻ. Nếu cần thêm thông tin gì từ phía tôi, anh chị cứ cho tôi biết.

Trân trọng,
{{hoTen}}
{{lienHe}}` },
];

export const LETTER_FIELDS = [
  { k: 'hoTen', label: 'Họ tên của bạn' },
  { k: 'lienHe', label: 'Điện thoại và email', ph: '0901 234 567, ten@email.com' },
  { k: 'nguoiNhan', label: 'Người nhận', ph: 'Anh/chị phụ trách tuyển dụng' },
  { k: 'congTy', label: 'Tên công ty' },
  { k: 'viTri', label: 'Vị trí ứng tuyển' },
  { k: 'kinhNghiem', label: 'Kinh nghiệm tóm tắt', ph: '3 năm làm hành chính văn phòng', area: true },
  { k: 'noiLamGanNhat', label: 'Nơi làm gần nhất', ph: 'Công ty ABC' },
  { k: 'thanhTich', label: 'Thành tích nổi bật (động từ + kết quả thật)', ph: 'chuẩn hóa quy trình hồ sơ, giúp phòng tìm tài liệu nhanh hơn', area: true },
  { k: 'diemManh', label: 'Điểm mạnh', ph: 'làm việc nhóm, cẩn thận, kỹ năng bảng tính' },
  { k: 'lyDo', label: 'Lý do chọn công ty', ph: 'định hướng phát triển kênh bán trực tuyến của công ty', area: true },
];

export function fillLetter(body, data) {
  return body.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const v = data && typeof data[k] === 'string' ? data[k].trim() : '';
    if (v) return v;
    const f = LETTER_FIELDS.find((x) => x.k === k);
    return `[${f ? f.label.replace(/\s*\(.*\)$/, '').toLowerCase() : k}]`;
  });
}
