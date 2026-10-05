// Sinh các tệp chỉ mục chức năng search/<id>.json cho những app chưa tự có search-index.json.
// Định dạng giống vannien/search-index.json: [{ name, keywords[], path, blurb }].
// path luôn tính từ thư mục của app (vd "#/may-tinh" thành /unit/#/may-tinh). path rỗng = mở trang chủ app.
//
//   node tools/build-search-index.mjs           ghi lại search/*.json
//   node tools/build-search-index.mjs --check   chỉ kiểm tra tệp đang có có khớp không
//
// Khi một app tự xuất bản search-index.json riêng, đổi `index` của app trong js/apps.js sang
// đường dẫn đó và xóa mục tương ứng ở đây.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const f = (name, kw, path, blurb) => ({ name, keywords: kw.split(';').map((s) => s.trim()).filter(Boolean), path, blurb });

export const INDEXES = {
  unit: [
    f('Máy tính giọng nói', 'máy tính;calculator;nói để tính;cộng trừ nhân chia;căn bậc hai;bình phương;phần trăm', '#/may-tinh', 'Bàn phím số và nói tiếng Việt: "ba triệu cộng hai trăm nghìn".'),
    f('Đổi đơn vị', 'đổi đơn vị;quy đổi;chỉ vàng;cây vàng;lượng vàng;sào;công;héc-ta;độ C độ F;kg lb;dặm;gallon', '#/doi-don-vi', 'Chỉ, cây, lượng vàng; sào, công, héc-ta; độ C/F; kg/lb; dặm; gallon.'),
    f('Đổi đơn vị: Khối lượng và vàng', 'chỉ vàng;đổi chỉ vàng;cây vàng;lượng vàng;gram;kg;tấn;tạ;yến;pound;ounce;khối lượng', '#/doi-don-vi/khoiluong', '1 lượng (cây) = 10 chỉ = 37,5 g. Đổi chỉ, lượng, gam, kg, pound.'),
    f('Đổi đơn vị: Diện tích đất', 'diện tích;sào;sào bắc bộ;sào trung bộ;công đất;mẫu;héc-ta;ha;mét vuông;m2;acre;đất', '#/doi-don-vi/dientich', 'Đổi sào, công, mẫu, héc-ta, mét vuông, acre.'),
    f('Đổi đơn vị: Độ dài', 'độ dài;km;mét;dặm;mile;inch;feet;hải lý;cây số', '#/doi-don-vi/dodai', 'Đổi km, mét, dặm, inch, feet, hải lý.'),
    f('Đổi đơn vị: Nhiệt độ', 'nhiệt độ;độ C;độ F;kelvin;đổi độ C sang độ F', '#/doi-don-vi/nhietdo', 'Đổi độ C, độ F, kelvin.'),
    f('Đổi đơn vị: Thể tích', 'thể tích;lít;gallon;ml;mét khối', '#/doi-don-vi/thetich', 'Đổi lít, gallon, ml, mét khối.'),
    f('Đổi đơn vị: Tốc độ', 'tốc độ;km/h;m/s;mph;knot', '#/doi-don-vi/tocdo', 'Đổi km/h, m/s, mph, knot.'),
    f('Ngày tháng', 'ngày tháng;tính ngày;lịch;đổi ngày', '#/ngay-thang', 'Cộng trừ ngày, ngày làm việc, tuổi, tuần thai, đổi dương sang âm lịch.'),
    f('Ngày tháng: Cộng/trừ ngày', 'cộng ngày;trừ ngày;sau bao nhiêu ngày;100 ngày sau;cộng trừ ngày tháng', '#/ngay-thang/cong-ngay', 'Cộng hoặc trừ năm, tháng, tuần, ngày vào một ngày bất kỳ.'),
    f('Ngày tháng: Khoảng cách hai ngày', 'khoảng cách ngày;từ ngày đến ngày;bao nhiêu ngày;đếm ngày', '#/ngay-thang/khoang-cach', 'Hai ngày cách nhau bao nhiêu ngày, tuần, tháng.'),
    f('Ngày tháng: Ngày làm việc', 'ngày làm việc;trừ cuối tuần;trừ ngày lễ;ngày công', '#/ngay-thang/ngay-lam-viec', 'Đếm số ngày làm việc, bỏ thứ bảy chủ nhật và ngày lễ.'),
    f('Ngày tháng: Tính tuổi', 'tính tuổi;tuổi;sinh nhật;con giáp;can chi;bao nhiêu tuổi', '#/ngay-thang/tuoi', 'Tính tuổi chính xác từ ngày sinh.'),
    f('Ngày tháng: Tuần thai', 'tuần thai;ngày dự sinh;mang thai;bầu;thai kỳ', '#/ngay-thang/tuan-thai', 'Tính tuần thai và ngày dự sinh.'),
    f('Ngày tháng: Đổi âm dương', 'đổi âm dương;dương sang âm;âm sang dương;âm lịch;dương lịch;đổi ngày âm', '#/ngay-thang/am-duong', 'Đổi ngày dương lịch sang âm lịch và ngược lại.'),
    f('Vay, gửi, lãi', 'vay;lãi;lãi suất;tiết kiệm;trả góp', '#/vay-lai', 'Trả góp có bảng trả nợ, gửi tiết kiệm, lãi kép, so sánh hai khoản vay.'),
    f('Vay trả góp', 'vay trả góp;bảng trả nợ;tính lãi vay;vay ngân hàng;vay mua nhà;vay mua xe;niên kim;gốc đều', '#/vay-lai/tra-gop', 'Tính tiền trả mỗi tháng và bảng trả nợ theo gốc đều hoặc niên kim.'),
    f('Gửi tiết kiệm', 'gửi tiết kiệm;lãi suất tiết kiệm;sổ tiết kiệm;kỳ hạn', '#/vay-lai/tiet-kiem', 'Tính tiền lãi khi gửi tiết kiệm theo kỳ hạn.'),
    f('Lãi kép', 'lãi kép;đầu tư;góp hàng tháng', '#/vay-lai/lai-kep', 'Tiền tăng bao nhiêu khi lãi nhập vốn, có góp thêm mỗi tháng.'),
    f('So sánh hai khoản vay', 'so sánh vay;hai khoản vay;vay nào lợi hơn', '#/vay-lai/so-sanh', 'Đặt hai phương án vay cạnh nhau để so tổng lãi.'),
    f('Chia tiền, phần trăm', 'chia tiền;tính phần trăm;giảm giá;vat;tip', '#/chia-tien', 'Chia đều, chia theo món, tính phần trăm, giảm giá, VAT, tip.'),
    f('Chia tiền đều', 'chia tiền đều;chia hóa đơn;ăn nhau;mỗi người bao nhiêu', '#/chia-tien/chia-deu', 'Chia đều hóa đơn cho cả nhóm.'),
    f('Chia tiền theo món', 'chia theo món;mỗi người một phần;phí phục vụ', '#/chia-tien/chia-mon', 'Mỗi người trả theo món mình gọi, chia phí phục vụ.'),
    f('Tính phần trăm', 'phần trăm;tính phần trăm;%;tăng giảm bao nhiêu phần trăm', '#/chia-tien/phan-tram', 'A là bao nhiêu phần trăm của B, tăng giảm bao nhiêu phần trăm.'),
    f('Tính giảm giá', 'giảm giá;khuyến mãi;sale;tiết kiệm được bao nhiêu', '#/chia-tien/giam-gia', 'Giá sau giảm và số tiền tiết kiệm được.'),
    f('Tính VAT', 'vat;thuế giá trị gia tăng;thuế 8%;thuế 10%;hóa đơn đỏ', '#/chia-tien/vat', 'Tách hoặc cộng VAT 8%, 10% vào giá.'),
    f('Tính tiền tip', 'tip;bo tiền;tiền phục vụ', '#/chia-tien/tip', 'Tính tiền tip theo phần trăm hóa đơn.'),
    f('Đếm ngược ngày', 'đếm ngược;còn bao nhiêu ngày;kỷ niệm;hạn thẻ;hết hạn;visa;tết;nhắc ngày', '#/dem-nguoc', 'Còn bao nhiêu ngày tới kỷ niệm, hạn thẻ, Tết.'),
    f('Đọc số thành chữ', 'đọc số;số thành chữ;bằng chữ;viết số tiền bằng chữ;séc;hợp đồng', '#/doc-so/doc-so', 'Đổi số tiền sang chữ tiếng Việt cho séc, hợp đồng.'),
    f('Bỏ dấu tiếng Việt', 'bỏ dấu;không dấu;viết hoa;viết thường;slug;đếm chữ', '#/doc-so/bo-dau', 'Bỏ dấu tiếng Việt, đổi hoa thường, tạo slug, đếm chữ.'),
  ],

  license: [
    f('Trang chủ ôn thi bằng lái', 'ôn thi bằng lái;thi bằng lái;bằng lái xe;gplx;600 câu', '', 'Ôn thi bằng lái xe với bộ 600 câu chính thức.'),
    f('Học theo chương', 'học theo chương;các chương;lý thuyết lái xe;học lý thuyết;luyện tập;làm bài;luyện câu hỏi', '#/hoc', 'Sáu chương của bộ 600 câu: chọn chương để học và luyện tập.'),
    f('Chương 1: Quy tắc giao thông', 'quy tắc giao thông;luật giao thông;quy định chung;chương 1', '#/hoc/c/1', 'Quy định chung và quy tắc giao thông.'),
    f('Chương 2: Văn hóa, đạo đức lái xe', 'văn hóa giao thông;đạo đức người lái xe;phòng cháy chữa cháy;cứu hộ;chương 2', '#/hoc/c/2', 'Văn hóa giao thông, đạo đức, phòng cháy chữa cháy, cứu hộ.'),
    f('Chương 3: Kỹ thuật lái xe', 'kỹ thuật lái xe;tập lái;chương 3', '#/hoc/c/3', 'Kỹ thuật lái xe an toàn.'),
    f('Chương 4: Cấu tạo và sửa chữa', 'cấu tạo xe;sửa chữa;bảo dưỡng;chương 4', '#/hoc/c/4', 'Cấu tạo và sửa chữa xe.'),
    f('Chương 5: Biển báo', 'biển báo chương 5;báo hiệu đường bộ;chương 5', '#/hoc/c/5', 'Các câu hỏi về báo hiệu đường bộ.'),
    f('Chương 6: Sa hình', 'sa hình;giải sa hình;xử lý tình huống;tình huống giao thông;chương 6', '#/hoc/c/6', 'Giải thế sa hình và xử lý tình huống.'),
    f('Câu điểm liệt', 'điểm liệt;câu liệt;sai là trượt;câu hỏi điểm liệt', '#/hoc/diem-liet', 'Những câu sai một câu là trượt.'),
    f('Tra cứu biển báo', 'biển báo;tra biển báo;biển cấm;biển chỉ dẫn;biển hiệu lệnh', '#/hoc/bien-bao', 'Tìm biển báo theo từ khóa hoặc nhóm biển.'),
    f('Thi thử', 'thi thử;đề thi thử;thi sát hạch;đề thi;bài thi thử', '#/thi', 'Thi thử theo cấu trúc đề thật, có tính giờ.'),
    f('Ôn lại câu sai', 'ôn lại;câu sai;câu đến hạn;lặp lại ngắt quãng', '#/on', 'Ôn lại những câu hay sai và câu đến hạn.'),
    f('Tiến độ học', 'tiến độ;thống kê học;kết quả thi thử;chương yếu', '#/tien-do', 'Xem tiến độ, kết quả thi thử và chương yếu nhất.'),
    f('Cài đặt: hạng bằng, ngày thi', 'cài đặt;hạng bằng;hạng A1;hạng B;ngày thi;đặt ngày thi;chế độ tối;giao diện', '#/cai-dat', 'Chọn hạng bằng, đặt ngày thi, đổi giao diện, sao lưu.'),
    f('Về dữ liệu và nguồn', 'về dữ liệu;nguồn;thông tư 108;báo sai;miễn trừ', '#/du-lieu', 'Nguồn dữ liệu, quy định áp dụng, báo sai.'),
  ],

  english: [
    f('Hôm nay (kế hoạch học)', 'hôm nay;kế hoạch hôm nay;nhiệm vụ hằng ngày;học tiếng anh', '#/', 'Các việc học hôm nay và chuỗi ngày học.'),
    f('Từ vựng', 'từ vựng;học từ;thẻ từ;flashcard;ôn từ', '#/learn', 'Học thẻ từ có phiên âm, ví dụ và nghĩa tiếng Việt, ôn theo lịch.'),
    f('Học ngay các thẻ đến hạn', 'ôn thẻ;thẻ đến hạn;học từ mới;bắt đầu học', '#/learn/s/all', 'Ôn thẻ đến hạn và học thêm từ mới.'),
    f('Từ vựng: Email công sở', 'từ vựng email;email công sở;viết email', '#/learn/list/email', 'Danh sách từ về email công sở.'),
    f('Từ vựng: Tài chính cơ bản', 'từ vựng tài chính;tài chính cơ bản;kế toán;budget;revenue', '#/learn/list/finance', 'Danh sách từ về tài chính cơ bản.'),
    f('Từ vựng: Phỏng vấn và tuyển dụng', 'từ vựng phỏng vấn;tuyển dụng;interview;resume', '#/learn/list/interview', 'Danh sách từ về phỏng vấn và tuyển dụng.'),
    f('Từ vựng: Họp và thảo luận', 'từ vựng họp;họp và thảo luận;meeting;agenda;minutes', '#/learn/list/meeting', 'Danh sách từ về họp và thảo luận.'),
    f('Từ vựng: Báo cáo và số liệu', 'từ vựng báo cáo;số liệu;report;chart;data', '#/learn/list/report', 'Danh sách từ về báo cáo và số liệu.'),
    f('Từ vựng: Công nghệ nơi làm việc', 'từ vựng công nghệ;công nghệ;it;software;laptop', '#/learn/list/tech', 'Danh sách từ về công nghệ nơi làm việc.'),
    f('Từ vựng: Đi công tác', 'từ vựng đi công tác;công tác;du lịch công tác;sân bay;khách sạn;travel', '#/learn/list/travel', 'Danh sách từ về đi công tác.'),
    f('Giao tiếp công sở', 'giao tiếp;mẫu câu;nói tiếng anh;luyện nói;speaking', '#/talk', 'Mẫu câu theo tình huống, đóng vai và email mẫu.'),
    f('Mẫu câu: Viết email', 'mẫu câu email;câu viết email', '#/talk/c/email', 'Mẫu câu để viết email.'),
    f('Mẫu câu: Họp', 'mẫu câu họp;nói trong cuộc họp;phát biểu', '#/talk/c/meeting', 'Mẫu câu dùng khi họp.'),
    f('Mẫu câu: Nhờ giúp đỡ', 'nhờ giúp đỡ;nhờ vả lịch sự;can you help', '#/talk/c/help', 'Mẫu câu nhờ đồng nghiệp giúp.'),
    f('Mẫu câu: Từ chối lịch sự', 'từ chối lịch sự;nói không;decline', '#/talk/c/decline', 'Mẫu câu từ chối khéo.'),
    f('Mẫu câu: Gọi điện', 'gọi điện;nói chuyện điện thoại;phone call', '#/talk/c/phone', 'Mẫu câu khi gọi điện.'),
    f('Mẫu câu: Trò chuyện xã giao', 'xã giao;trò chuyện;small talk;làm quen', '#/talk/c/small', 'Mẫu câu trò chuyện xã giao.'),
    f('Đóng vai tình huống', 'đóng vai;hội thoại;role play;luyện nói tình huống', '#/talk/role', 'Hội thoại có nhánh, nhận phản hồi cho từng lựa chọn.'),
    f('Đóng vai: Xin lùi hạn nộp báo cáo', 'xin lùi hạn;lùi deadline;gia hạn báo cáo', '#/talk/role/extension', 'Luyện xin lùi hạn nộp báo cáo.'),
    f('Đóng vai: Từ chối lịch họp bị trùng', 'lịch họp trùng;từ chối họp', '#/talk/role/decline-meeting', 'Luyện từ chối lịch họp bị trùng.'),
    f('Đóng vai: Nhờ đồng nghiệp giúp', 'nhờ đồng nghiệp;xin giúp đỡ', '#/talk/role/ask-help', 'Luyện nhờ đồng nghiệp giúp.'),
    f('Đóng vai: Gặp đối tác lần đầu', 'gặp đối tác;làm quen đối tác;giới thiệu bản thân', '#/talk/role/meet-partner', 'Luyện gặp đối tác lần đầu.'),
    f('Đóng vai: Phỏng vấn xin việc', 'phỏng vấn tiếng anh;phỏng vấn xin việc;job interview', '#/talk/role/interview', 'Luyện trả lời phỏng vấn xin việc bằng tiếng Anh.'),
    f('Đóng vai: Khách hàng phàn nàn giao trễ', 'khách phàn nàn;giao hàng trễ;complaint', '#/talk/role/complaint', 'Luyện xử lý khách hàng phàn nàn giao trễ.'),
    f('Đóng vai: Nhận phòng khách sạn', 'nhận phòng;check in;khách sạn công tác', '#/talk/role/hotel', 'Luyện nhận phòng khách sạn khi đi công tác.'),
    f('Email mẫu', 'email mẫu;khung email;viết email tiếng anh;template email', '#/talk/email', 'Khung email có chỗ điền, xem bản hoàn chỉnh và sao chép.'),
    f('Email: Hẹn lịch họp', 'email hẹn họp;đặt lịch họp;meeting request', '#/talk/email/meeting-request', 'Email đề nghị một cuộc họp.'),
    f('Email: Nhắc việc, theo dõi', 'email nhắc việc;follow up;theo dõi', '#/talk/email/follow-up', 'Email nhắc việc lịch sự.'),
    f('Email: Từ chối lời mời', 'email từ chối;từ chối lời mời', '#/talk/email/decline-invite', 'Email từ chối lời mời.'),
    f('Email: Xin lỗi vì trả lời chậm', 'xin lỗi trả lời chậm;trễ phản hồi', '#/talk/email/late-reply', 'Email xin lỗi vì trả lời chậm.'),
    f('Email: Nhờ gửi tài liệu, số liệu', 'nhờ gửi tài liệu;xin số liệu', '#/talk/email/ask-help', 'Email nhờ gửi tài liệu hoặc số liệu.'),
    f('Email: Gửi báo cáo đính kèm', 'gửi báo cáo;đính kèm;attachment', '#/talk/email/send-report', 'Email gửi báo cáo đính kèm.'),
    f('Email: Xin nghỉ phép', 'xin nghỉ phép;nghỉ phép;leave request', '#/talk/email/leave-request', 'Email xin nghỉ phép.'),
    f('Email: Cảm ơn sau phỏng vấn', 'cảm ơn sau phỏng vấn;thank you email', '#/talk/email/thank-interview', 'Email cảm ơn sau buổi phỏng vấn.'),
    f('Email: Xin dời lịch', 'xin dời lịch;đổi lịch;reschedule', '#/talk/email/reschedule', 'Email xin dời lịch hẹn.'),
    f('Luyện nghe', 'luyện nghe;bài nghe;nghe tiếng anh;listening', '#/listen', 'Bài nghe ngắn có câu hỏi trắc nghiệm.'),
    f('Kiểm tra trình độ', 'kiểm tra trình độ;test trình độ;xếp lớp;placement;level', '#/test', 'Bài kiểm tra ngắn để biết mức từ vựng nên học.'),
    f('Cài đặt và nhắc học', 'cài đặt;nhắc học;mục tiêu mỗi ngày;sao lưu;xuất dữ liệu;chế độ tối', '#/more', 'Mục tiêu mỗi ngày, nhắc học, giao diện, xuất dữ liệu.'),
  ],

  race: [
    f('Lịch giải chạy', 'giải chạy;lịch giải chạy;chạy bộ;marathon;running;đăng ký giải', '', 'Lịch giải chạy bộ, trail, Ironman và link đăng ký.'),
    f('Giải chạy đường nhựa', 'giải chạy đường nhựa;road;marathon đường nhựa;chạy đường phố', '#/?type=road', 'Lọc các giải chạy trên đường nhựa.'),
    f('Giải chạy trail', 'giải trail;chạy trail;chạy núi;chạy địa hình;trail running', '#/?type=trail', 'Lọc các giải trail.'),
    f('Giải triathlon, Ironman', 'triathlon;ironman;70.3;ba môn phối hợp;bơi đạp chạy', '#/?type=tri', 'Lọc các giải triathlon và Ironman.'),
    f('Giải chạy 5K', '5k;5 km;chạy 5km;giải 5k', '#/?dist=5K', 'Các giải có cự ly 5K.'),
    f('Giải chạy 10K', '10k;10 km;chạy 10km;giải 10k', '#/?dist=10K', 'Các giải có cự ly 10K.'),
    f('Giải bán marathon 21K', '21k;half marathon;bán marathon;21 km;giải 21k', '#/?dist=21K', 'Các giải có cự ly 21K.'),
    f('Giải marathon 42K', '42k;marathon;full marathon;42 km;giải 42k', '#/?dist=42K', 'Các giải có cự ly 42K.'),
    f('Giải ultra từ 50K', 'ultra;ultramarathon;50k;100k;siêu marathon;giải ultra', '#/?dist=ultra', 'Các giải ultra từ 50 km trở lên.'),
    f('Giải miền Bắc', 'giải miền bắc;hà nội;sapa;sa pa;hạ long;ninh bình;mộc châu', '#/?region=vn-bac', 'Giải chạy ở miền Bắc.'),
    f('Giải miền Trung, Tây Nguyên', 'giải miền trung;đà nẵng;huế;đà lạt;tây nguyên;quy nhơn;nha trang', '#/?region=vn-trung', 'Giải chạy ở miền Trung và Tây Nguyên.'),
    f('Giải miền Nam', 'giải miền nam;sài gòn;tp hcm;hồ chí minh;vũng tàu;phú quốc;cần thơ', '#/?region=vn-nam', 'Giải chạy ở miền Nam.'),
    f('Giải ở Đông Nam Á', 'giải đông nam á;singapore;thái lan;malaysia;bangkok', '#/?region=sea', 'Giải chạy ở các nước Đông Nam Á.'),
    f('Giải ở Châu Á', 'giải châu á;nhật bản;tokyo;hàn quốc;seoul;đài loan', '#/?region=asia', 'Giải chạy ở Châu Á.'),
    f('Giải trên thế giới', 'giải thế giới;berlin;boston;new york;london;marathon thế giới', '#/?region=world', 'Giải chạy lớn trên thế giới.'),
    f('Giải đang mở đăng ký', 'đang mở đăng ký;mở đăng ký;đăng ký giải chạy;còn vé', '#/?reg=open', 'Giải đang nhận đăng ký.'),
    f('Giải sắp mở đăng ký', 'sắp mở đăng ký;sắp mở;sắp có vé', '#/?reg=soon', 'Giải sắp mở đăng ký.'),
    f('Giải đã qua', 'giải đã qua;giải cũ;kết quả giải;năm ngoái', '#/?past=1', 'Xem cả các giải đã diễn ra.'),
    f('Lịch giải theo tháng', 'lịch tháng;xem theo tháng;lịch giải theo tháng;lịch chạy tháng', '#/?view=month', 'Xem các giải trên lịch tháng.'),
    f('Giải của tôi', 'giải của tôi;giải đã lưu;giải quan tâm;nhắc giải;yêu thích', '#/mine', 'Các giải bạn đã lưu hoặc đăng ký, kèm nhắc lịch.'),
    f('Về dữ liệu giải chạy', 'về dữ liệu;nguồn dữ liệu;độ chính xác;báo sai giải', '#/about', 'Nguồn dữ liệu và cách kiểm chứng.'),
  ],

  interview: [
    f('Trang chủ luyện phỏng vấn', 'luyện phỏng vấn;phỏng vấn xin việc;chuẩn bị phỏng vấn', '', 'Luyện phỏng vấn, làm CV và thư xin việc.'),
    f('Ngân hàng câu hỏi phỏng vấn', 'câu hỏi phỏng vấn;ngân hàng câu hỏi;câu hỏi thường gặp;trả lời phỏng vấn;câu trả lời mẫu', '#/hoi', 'Câu hỏi thường gặp, ý đồ nhà tuyển dụng và ví dụ trả lời.'),
    f('Luyện nói phỏng vấn', 'luyện nói;luyện trả lời;mô phỏng phỏng vấn;ghi âm trả lời;ai chấm', '#/luyen', 'Luyện trả lời từng câu, có thể nhờ AI nhận xét.'),
    f('Tạo CV', 'tạo cv;làm cv;viết cv;mẫu cv;sơ yếu lý lịch;xuất pdf cv;resume', '#/cv', 'Điền thông tin, chọn mẫu và in hoặc lưu PDF.'),
    f('Thư xin việc', 'thư xin việc;cover letter;viết thư xin việc;đơn xin việc', '#/cv/thu', 'Soạn thư xin việc theo mẫu.'),
    f('Chuẩn bị phỏng vấn', 'chuẩn bị phỏng vấn;checklist phỏng vấn;đàm phán lương;hỏi lại nhà tuyển dụng;cách dùng star;câu hỏi nhạy cảm', '#/chuanbi', 'Checklist, câu hỏi nên hỏi lại, đàm phán lương, phương pháp STAR.'),
    f('Dữ liệu và quyền riêng tư', 'quyền riêng tư;xóa dữ liệu;sao lưu;cài đặt phỏng vấn', '#/caidat', 'Dữ liệu lưu trên máy bạn, sao lưu và xóa.'),
  ],

  hire: [
    f('Việc làm gần bạn', 'việc làm;việc làm thêm;tìm việc;tuyển nhanh;part time;việc gần nhà', '', 'Việc làm thêm và tuyển nhanh, có lọc tin lừa đảo.'),
    f('Tin đã lưu', 'tin đã lưu;việc đã lưu;lưu việc', '#/saved', 'Các việc làm bạn đã lưu.'),
    f('Hồ sơ và đơn của tôi', 'hồ sơ của tôi;hồ sơ ngắn;đơn ứng tuyển;việc tôi đã ứng tuyển', '#/me', 'Hồ sơ ngắn và các việc bạn đã ứng tuyển.'),
    f('Đăng tuyển (nhà tuyển dụng)', 'đăng tuyển;nhà tuyển dụng;tuyển nhân viên;đăng tin tuyển dụng', '#/employer', 'Dành cho nhà tuyển dụng: quản lý tin tuyển.'),
    f('Đăng tin tuyển mới', 'đăng tin tuyển;tạo tin tuyển dụng;tuyển người', '#/employer/new', 'Tạo một tin tuyển dụng mới.'),
    f('Nhận biết tin lừa đảo', 'tin lừa đảo;lừa đảo việc làm;an toàn khi tìm việc;việc làm giả;đa cấp', '#/safety', 'Dấu hiệu tin tuyển dụng lừa đảo và cách tự bảo vệ.'),
    f('Điều khoản sử dụng 9hire', 'điều khoản;điều khoản sử dụng', '#/terms', 'Điều khoản sử dụng.'),
    f('Chính sách riêng tư 9hire', 'chính sách riêng tư;bảo mật thông tin;dữ liệu cá nhân', '#/privacy', 'Cách 9hire xử lý dữ liệu cá nhân.'),
  ],

  swap: [
    f('Tặng và trao đổi đồ cũ', 'đồ cũ;tặng đồ;trao đổi đồ;đồ cũ chung cư;chợ đồ cũ;tòa nhà;công ty', '', 'Tặng và trao đổi đồ cũ trong công ty, tòa nhà.'),
    f('Quy tắc cộng đồng 9swap', 'quy tắc;luật chơi;đồ cấm;gặp mặt an toàn;cộng đồng', '#/rules', 'Quy tắc cộng đồng: không đăng đồ cấm, gặp mặt an toàn.'),
  ],

  lunch: [
    f('Đặt cơm trưa chung', 'đặt cơm;cơm trưa;đặt cơm văn phòng;gom món;chọn quán;cafe;trà sữa', '', 'Chọn quán, gom món, chia tiền và nhắc nợ cho cả nhóm.'),
  ],

  ship: [
    f('Gửi hàng, so giá cước', 'gửi hàng;so sánh cước;cước vận chuyển;ghtk;giao hàng nội địa;in bill', '', 'Gửi hàng nội địa: so sánh cước các hãng, in bill, theo dõi.'),
    f('Đơn hàng đã gửi', 'đơn hàng;theo dõi đơn;tra đơn;vận đơn;in lại bill', '#/orders', 'Danh sách đơn đã gửi và trạng thái.'),
    f('Sổ địa chỉ', 'sổ địa chỉ;địa chỉ nhận hàng;người nhận', '#/book', 'Lưu địa chỉ người gửi, người nhận.'),
    f('Tài khoản và ví 9Ship', 'tài khoản;ví;nạp tiền;số dư', '#/me', 'Ví, số dư và tài khoản 9Ship.'),
  ],

  scanner: [
    f('Quét tài liệu bằng camera', 'quét tài liệu;scan;chụp tài liệu;scanner;camera;chụp giấy tờ', '', 'Chụp giấy tờ, tự cắt góc và làm nét. Mở app rồi bấm Chụp.'),
    f('Xuất PDF', 'xuất pdf;lưu pdf;tạo pdf;ảnh sang pdf;gộp pdf;chia sẻ pdf', '', 'Gộp nhiều trang thành một tệp PDF. Mở một tài liệu rồi bấm Xuất.'),
    f('Đọc chữ trên ảnh (OCR)', 'ocr;đọc chữ;nhận dạng chữ;trích chữ từ ảnh;chữ tiếng việt', '', 'Đọc chữ tiếng Việt từ ảnh chụp. Mở tài liệu rồi bấm Đọc chữ (OCR).'),
    f('Chữ ký của tôi', 'chữ ký;ký tên;ký tài liệu;chèn chữ ký', '', 'Lưu chữ ký và chèn vào tài liệu. Bấm biểu tượng bút ở màn hình chính.'),
    f('Ảnh thẻ, giấy tờ', 'ảnh thẻ;ảnh căn cước;căn cước;cccd;chụp hai mặt;giấy tờ tùy thân', '', 'Chụp ảnh thẻ, căn cước hai mặt trên một trang. Bấm biểu tượng thẻ.'),
  ],

  speed: [
    f('Cảnh báo tốc độ', 'cảnh báo tốc độ;tốc độ;giới hạn tốc độ;chạy quá tốc độ;đo tốc độ;gps', '', 'Báo khi vượt tốc độ cho phép của đoạn đường đang đi.'),
    f('Camera phạt nguội', 'camera phạt nguội;camera giám sát;bắn tốc độ;phạt nguội;điểm camera', '', 'Cảnh báo điểm camera trên đường đi.'),
    f('Biển báo giao thông', 'biển báo;biển báo giới hạn;biển hạn chế tốc độ', '', 'Hiện biển giới hạn tốc độ của đoạn đường.'),
    f('Mô phỏng chuyến đi', 'mô phỏng;chạy thử;giả lập;simulator', '', 'Chạy thử cảnh báo mà không cần di chuyển. Bấm nút Mô phỏng.'),
  ],
};

export function render(id) { return JSON.stringify(INDEXES[id], null, 1) + '\n'; }

const check = process.argv.includes('--check');
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(ROOT, 'search'), { recursive: true });
  let bad = 0;
  for (const id of Object.keys(INDEXES)) {
    const file = join(ROOT, 'search', `${id}.json`);
    const next = render(id);
    if (check) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== next) { console.error('Lệch:', file); bad++; }
    } else {
      writeFileSync(file, next);
      console.log('ghi', file, INDEXES[id].length, 'mục');
    }
  }
  if (check && bad) process.exit(1);
}
