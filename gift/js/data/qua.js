// Danh mục gợi ý quà do 9gift tự biên soạn. Không có liên kết bán hàng, không nêu giá món.
// g: nhóm quan hệ (cha-me, nguoi-yeu, tre-em, anh-chi-em, ban-be, dong-nghiep, cap-tren, thay-co, hang-xom)
// d: dịp (xem dip.js). m: mức ngân sách phù hợp: 1 gọn nhẹ, 2 vừa phải, 3 trang trọng.
// Mức ngân sách chỉ là cách chia nhóm của app dựa trên số tiền bạn đặt, không phải giá niêm yết.

export const MUC = [
  { id: 1, ten: 'Gọn nhẹ', mota: 'dưới khoảng 300 nghìn' },
  { id: 2, ten: 'Vừa phải', mota: 'khoảng 300 nghìn đến 1 triệu' },
  { id: 3, ten: 'Trang trọng', mota: 'trên khoảng 1 triệu' },
];
/** Số tiền ngân sách -> mức. */
export const mucTuTien = (n) => (n > 0 && n < 300000 ? 1 : n >= 1000000 ? 3 : n >= 300000 ? 2 : 0);

export const QUA = [
  // Cha mẹ, ông bà, bậc trên
  { ten: 'Hộp trà ngon hoặc trà thảo mộc dễ uống', tip: 'Hỏi trước người lớn đang kiêng gì (đường, caffein). Chọn gói nhỏ, hạn dùng dài.', g: ['cha-me', 'cap-tren', 'thay-co'], d: ['tet', 'sinhNhat', 'tanGia', 'mungTho', 'thayCo', 'namMoi'], m: [1, 2] },
  { ten: 'Giỏ trái cây tươi theo mùa', tip: 'Chọn loại mềm, dễ ăn nếu người nhận răng yếu; tránh loại quá nặng mùi.', g: ['cha-me', 'hang-xom', 'cap-tren', 'ban-be'], d: ['thamBenh', 'tanGia', 'tet', 'mungTho'], m: [1, 2] },
  { ten: 'Máy massage cổ vai gáy hoặc gối massage', tip: 'Chọn loại có hẹn giờ tự tắt và hướng dẫn tiếng Việt. Người có bệnh tim hoặc đang đặt máy trợ tim nên hỏi bác sĩ trước.', g: ['cha-me'], d: ['sinhNhat', 'ngayMe', 'ngayCha', 'tet', 'mungTho'], m: [2, 3] },
  { ten: 'Bộ chăn ga gối chất liệu thoáng, màu nhã', tip: 'Đo trước kích thước giường. Màu nhẹ, ít họa tiết thường dễ hợp với người lớn tuổi.', g: ['cha-me', 'anh-chi-em'], d: ['tet', 'tanGia', 'cuoi', 'ngayMe', 'ngayCha'], m: [2, 3] },
  { ten: 'Gói khám sức khỏe tổng quát cho bố mẹ', tip: 'Quà đáng giá nhất cho người lớn tuổi. Hẹn ngày trước và đi cùng nếu có thể.', g: ['cha-me'], d: ['sinhNhat', 'ngayMe', 'ngayCha', 'vuLan', 'mungTho', 'tet'], m: [3] },
  { ten: 'Bộ ảnh gia đình in khung, chụp mới', tip: 'Chụp lúc cả nhà đủ mặt, in cỡ lớn để treo phòng khách.', g: ['cha-me', 'anh-chi-em'], d: ['tet', 'mungTho', 'ngayMe', 'ngayCha', 'vuLan'], m: [2, 3] },
  { ten: 'Một bữa cơm cả nhà ở quán bố mẹ thích', tip: 'Đặt bàn trước, dặn món kiêng. Thứ người lớn tuổi nhớ lâu là có con cháu ngồi cùng.', g: ['cha-me'], d: ['sinhNhat', 'ngayMe', 'ngayCha', 'vuLan', 'mungTho'], m: [1, 2, 3] },
  { ten: 'Áo ấm hoặc khăn choàng len mềm', tip: 'Chọn size rộng một chút. Mua trước đợt lạnh để kịp đổi nếu không vừa.', g: ['cha-me'], d: ['tet', 'sinhNhat', 'ngayMe', 'ngayCha'], m: [1, 2] },
  { ten: 'Hộp bánh Trung thu loại ít ngọt, ít mỡ', tip: 'Người lớn tuổi hay phải kiêng đường và mỡ, nên mua hộp nhỏ nhiều loại thay vì một hộp lớn.', g: ['cha-me', 'cap-tren', 'thay-co', 'hang-xom'], d: ['trungThu'], m: [1, 2, 3] },
  { ten: 'Bông hồng cài áo mùa Vu Lan hoặc một bó hoa nhỏ', tip: 'Nhiều nơi có tục cài hoa hồng đỏ lên áo khi còn mẹ và hoa hồng trắng khi mẹ đã mất; tục này tùy chùa và địa phương, hãy hỏi trước nếu không chắc. Ngày của Mẹ thì hồng hay đỏ nhạt đều hợp.', g: ['cha-me'], d: ['vuLan', 'ngayMe'], m: [1] },
  { ten: 'Điện thoại bàn phím lớn hoặc ốp chữ lớn cho điện thoại cũ', tip: 'Cài sẵn số người thân, bật cỡ chữ lớn rồi hướng dẫn tận tay một lần.', g: ['cha-me'], d: ['sinhNhat', 'tet', 'mungTho'], m: [2, 3] },
  { ten: 'Phong bì mừng tuổi cho ông bà, cha mẹ', tip: 'Nhiều gia đình thích phong bì mới, có kèm lời chúc viết tay.', g: ['cha-me'], d: ['tet'], m: [1, 2, 3] },
  // Người yêu, vợ chồng
  { ten: 'Một bữa tối ở nơi hai người từng hẹn hò', tip: 'Đặt bàn, mang theo một món nhỏ kỷ niệm (tấm vé, bức ảnh cũ).', g: ['nguoi-yeu'], d: ['tinhYeu', 'sinhNhat', 'phuNu', 'giangSinh'], m: [2, 3] },
  { ten: 'Hoa tươi loại người ấy thích', tip: 'Hỏi bạn bè người ấy thích loại nào. Chọn bó vừa tay thay vì bó thật to.', g: ['nguoi-yeu', 'ban-be', 'dong-nghiep', 'thay-co'], d: ['phuNu', 'tinhYeu', 'sinhNhat', 'thayCo', 'giangSinh'], m: [1, 2] },
  { ten: 'Quyển sổ tay và bút ký loại tốt, khắc tên', tip: 'Viết lời nhắn ở trang đầu. Hợp với người hay ghi chép.', g: ['nguoi-yeu', 'ban-be', 'dong-nghiep', 'thay-co'], d: ['sinhNhat', 'thangChuc', 'totNghiep', 'thayCo'], m: [1, 2] },
  { ten: 'Chuyến đi ngắn cuối tuần cho hai người', tip: 'Xin nghỉ trước, giữ bí mật điểm đến. Chọn nơi gần, đi về không mệt.', g: ['nguoi-yeu'], d: ['tinhYeu', 'sinhNhat', 'cuoi'], m: [3] },
  { ten: 'Bộ chăm sóc da hoặc tắm gội mùi nhẹ, dịu', tip: 'Nhớ người nhận có dị ứng gì không. Mùi quá nồng dễ bị nhiều người không thích.', g: ['nguoi-yeu', 'anh-chi-em', 'ban-be', 'dong-nghiep'], d: ['phuNu', 'sinhNhat', 'tinhYeu'], m: [1, 2] },
  { ten: 'Một món đồ tự làm: album ảnh, thư tay, video ghép', tip: 'Quà tự làm tốn thời gian mà lại dễ nhớ nhất. Bắt đầu sớm một tuần.', g: ['nguoi-yeu', 'cha-me', 'ban-be', 'thay-co'], d: ['sinhNhat', 'tinhYeu', 'ngayMe', 'ngayCha', 'thayCo', 'vuLan'], m: [1] },
  // Trẻ em
  { ten: 'Sách tranh hoặc truyện theo độ tuổi', tip: 'Kiểm tra độ tuổi in trên bìa. Sách có chữ lớn, hình rõ phù hợp trẻ mới biết đọc.', g: ['tre-em'], d: ['sinhNhat', 'treSoSinh', 'trungThu', 'totNghiep', 'tet', 'thieuNhi'], m: [1, 2] },
  { ten: 'Bộ xếp hình hoặc đồ chơi lắp ghép phù hợp tuổi', tip: 'Đọc cảnh báo chi tiết nhỏ cho trẻ dưới 3 tuổi. Tránh đồ chơi quá ồn nếu nhà nhỏ.', g: ['tre-em'], d: ['sinhNhat', 'trungThu', 'tet', 'thieuNhi'], m: [1, 2] },
  { ten: 'Quần áo cotton mềm cho trẻ sơ sinh, mua cỡ lớn hơn một size', tip: 'Trẻ lớn nhanh. Chọn màu trung tính, tránh quần áo nhiều cúc nhỏ.', g: ['tre-em', 'anh-chi-em', 'ban-be', 'dong-nghiep'], d: ['treSoSinh'], m: [1, 2] },
  { ten: 'Dây chuyền hoặc lắc bạc nhỏ, đơn giản', tip: 'Chỉ nên tặng khi gia đình có tục lệ này. Chọn loại bo tròn, không cạnh sắc.', g: ['tre-em', 'anh-chi-em', 'ban-be'], d: ['treSoSinh'], m: [2, 3] },
  { ten: 'Sổ tiết kiệm hoặc ống heo kèm một khoản nhỏ', tip: 'Dạy trẻ biết để dành. Viết tên và ngày tặng lên ống heo.', g: ['tre-em'], d: ['sinhNhat', 'tet', 'totNghiep', 'trungThu', 'thieuNhi'], m: [1, 2] },
  { ten: 'Lồng đèn hoặc đèn kéo quân, bánh nhỏ', tip: 'Trung thu tặng trẻ nên chọn đèn có pin hoặc đèn LED, an toàn hơn nến.', g: ['tre-em'], d: ['trungThu', 'thieuNhi'], m: [1] },
  { ten: 'Bộ dụng cụ học tập: balo, bút, hộp màu', tip: 'Cho trẻ tự chọn màu và nhân vật yêu thích để dùng thật.', g: ['tre-em'], d: ['totNghiep', 'sinhNhat'], m: [1, 2] },
  // Anh chị em, họ hàng ngang hàng
  { ten: 'Đồ gia dụng nhỏ: nồi chiên không dầu, máy xay, ấm siêu tốc', tip: 'Hỏi nhà đã có chưa để khỏi trùng. Chọn thương hiệu có bảo hành, giữ hóa đơn cho người nhận.', g: ['anh-chi-em', 'ban-be', 'cha-me'], d: ['tanGia', 'cuoi', 'tet'], m: [2, 3] },
  { ten: 'Bộ ly chén, bộ nồi chảo đẹp', tip: 'Bộ sáu hoặc bộ tám dễ dùng. Tránh đồ sứ mỏng dễ vỡ khi gửi xa.', g: ['anh-chi-em', 'ban-be', 'hang-xom', 'dong-nghiep'], d: ['tanGia', 'cuoi'], m: [1, 2] },
  { ten: 'Vé xem phim hoặc voucher ăn uống cho hai người', tip: 'Chọn hạn dùng còn dài, ghi rõ địa chỉ và cách đổi.', g: ['anh-chi-em', 'ban-be', 'dong-nghiep', 'nguoi-yeu'], d: ['sinhNhat', 'tanGia', 'thangChuc', 'cuoi'], m: [1, 2] },
  { ten: 'Chậu cây dễ chăm: lưỡi hổ, trầu bà, sen đá', tip: 'Cây lưỡi hổ, trầu bà chịu bóng, ít tưới. Dặn cách tưới trên mảnh giấy dán dưới chậu.', g: ['anh-chi-em', 'ban-be', 'dong-nghiep', 'hang-xom', 'cap-tren'], d: ['tanGia', 'khaiTruong', 'thangChuc'], m: [1, 2] },
  // Bạn bè
  { ten: 'Một cuốn sách hợp gu người nhận kèm lời đề tặng', tip: 'Nhớ lại lần người ấy nhắc đến chủ đề nào, đừng tặng sách bạn thích mà họ không thích.', g: ['ban-be', 'dong-nghiep', 'thay-co', 'cap-tren'], d: ['sinhNhat', 'totNghiep', 'thayCo', 'thangChuc', 'giangSinh'], m: [1, 2] },
  { ten: 'Bữa ăn do mình nấu mang đến, hoặc bánh tự nướng', tip: 'Mang theo hộp đựng đẹp. Hỏi trước người ăn có dị ứng gì không.', g: ['ban-be', 'hang-xom', 'anh-chi-em'], d: ['sinhNhat', 'tanGia', 'thamBenh'], m: [1] },
  { ten: 'Bình giữ nhiệt hoặc cốc đẹp', tip: 'Chọn loại có nắp kín, giữ nhiệt tốt, dễ rửa. Hợp với người hay đi làm.', g: ['ban-be', 'dong-nghiep', 'cap-tren', 'thay-co'], d: ['sinhNhat', 'thangChuc', 'thayCo', 'tet', 'giangSinh'], m: [1, 2] },
  { ten: 'Thẻ quà tặng quán cà phê hoặc nhà sách quen thuộc', tip: 'Chọn nơi người nhận hay đến. Gửi kèm một tấm thiệp ngắn. Thẻ quà tặng gần như tiền mặt, nên với thầy cô và cấp trên càng cần cân nhắc quy định.', g: ['ban-be', 'dong-nghiep', 'thay-co'], d: ['sinhNhat', 'thangChuc', 'totNghiep', 'thayCo'], m: [1, 2] },
  { ten: 'Khung ảnh có tấm hình chung của hai người', tip: 'Chọn tấm ảnh vui, không phải ảnh đẹp nhất của riêng bạn.', g: ['ban-be', 'nguoi-yeu', 'anh-chi-em'], d: ['sinhNhat', 'totNghiep', 'tanGia', 'giangSinh'], m: [1] },
  // Đồng nghiệp
  { ten: 'Hộp bánh hoặc trái cây gửi chung cả phòng', tip: 'Cả phòng góp chung một món sẽ gọn và đỡ phải nghĩ. Dặn ai ăn kiêng ra riêng.', g: ['dong-nghiep', 'cap-tren'], d: ['sinhNhat', 'thangChuc', 'tet', 'thamBenh'], m: [1, 2] },
  { ten: 'Thiệp viết tay do cả nhóm ký tên', tip: 'Một tấm thiệp có lời nhắn riêng từng người thường được giữ rất lâu.', g: ['dong-nghiep', 'cap-tren', 'thay-co'], d: ['sinhNhat', 'thangChuc', 'thayCo', 'totNghiep'], m: [1] },
  { ten: 'Đồ văn phòng chất lượng: bình nước, sổ, kệ để máy tính', tip: 'Chọn món dùng hằng ngày. Tránh tặng đồ hiệu có logo công ty khác.', g: ['dong-nghiep', 'cap-tren'], d: ['thangChuc', 'sinhNhat', 'khaiTruong'], m: [1, 2] },
  { ten: 'Phong bì mừng kèm tấm thiệp cho đám cưới đồng nghiệp', tip: 'Hỏi nhóm đồng nghiệp xem có góp chung không và mức chung nhận để không lệch nhau.', g: ['dong-nghiep'], d: ['cuoi', 'treSoSinh', 'tanGia'], m: [1, 2, 3] },
  // Cấp trên
  { ten: 'Hộp trà, cà phê hoặc rượu vang loại vừa phải, bao bì trang nhã', tip: 'Quà cho cấp trên nên tinh tế, không quá đắt để khỏi gây khó xử. Công ty có quy định không nhận quà thì làm theo quy định.', g: ['cap-tren'], d: ['tet', 'trungThu', 'sinhNhat', 'tanGia'], m: [2, 3] },
  { ten: 'Lời cảm ơn viết tay, nêu một việc cụ thể bạn học được', tip: 'Thứ ít tốn kém nhưng cấp trên nhớ lâu hơn nhiều món quà.', g: ['cap-tren', 'thay-co'], d: ['tet', 'sinhNhat', 'thayCo', 'namMoi'], m: [1] },
  // Thầy cô
  { ten: 'Bó hoa tươi nhỏ và thiệp viết tay của học trò', tip: 'Nhiều trường ngày 20/11 khuyến khích tặng hoa và thiệp. Hãy hỏi lớp có quy định gì không. Với thầy cô, nhiều trường và quy định đạo đức nhà giáo hạn chế hoặc không cho nhận quà; hãy hỏi trước, ưu tiên hoa, thiệp và lời cảm ơn.', g: ['thay-co'], d: ['thayCo'], m: [1, 2] },
  { ten: 'Hộp trà hoặc hộp bánh cho thầy cô thăm lại', tip: 'Khi thăm thầy cô cũ, gọi hẹn trước. Thứ thầy cô quý nhất là tin về công việc và cuộc sống của học trò. Với thầy cô, nhiều trường và quy định đạo đức nhà giáo hạn chế hoặc không cho nhận quà; hãy hỏi trước, ưu tiên hoa, thiệp và lời cảm ơn.', g: ['thay-co'], d: ['thayCo', 'tet'], m: [1, 2] },
  { ten: 'Cuốn sách hay hoặc bút ký loại tốt', tip: 'Nên chọn sách liên quan môn thầy cô dạy hoặc sở thích đã biết. Với thầy cô, nhiều trường và quy định đạo đức nhà giáo hạn chế hoặc không cho nhận quà; hãy hỏi trước, ưu tiên hoa, thiệp và lời cảm ơn.', g: ['thay-co'], d: ['thayCo', 'sinhNhat'], m: [1, 2] },
  // Hàng xóm, tân gia, khai trương
  { ten: 'Gạo, muối hoặc bộ lọc nước, cây giống nhỏ', tip: 'Tân gia có tục tặng vật dụng thiết thực và cây xanh. Hỏi nhà chủ cần gì để khỏi trùng.', g: ['hang-xom', 'ban-be', 'anh-chi-em'], d: ['tanGia'], m: [1, 2] },
  { ten: 'Tranh treo tường, đồng hồ treo hoặc đèn trang trí', tip: 'Hỏi chủ nhà gu trang trí. Một số gia đình có quan niệm riêng về đồng hồ nên tránh nếu không rõ.', g: ['anh-chi-em', 'ban-be', 'hang-xom'], d: ['tanGia', 'khaiTruong'], m: [2, 3] },
  { ten: 'Lẵng hoa chúc mừng, bảng chữ hoặc cây phát tài', tip: 'Gửi sớm để kịp bày vào sáng khai trương. Dán tên và lời chúc ở nơi thấy rõ.', g: ['ban-be', 'dong-nghiep', 'cap-tren', 'hang-xom', 'anh-chi-em'], d: ['khaiTruong'], m: [2, 3] },
  { ten: 'Một phần đồ ăn nhẹ hoặc trái cây mừng ngày đầu mở cửa', tip: 'Đến sớm ủng hộ mua hàng và giới thiệu thêm bạn bè sẽ có ích hơn quà vật chất.', g: ['ban-be', 'hang-xom'], d: ['khaiTruong'], m: [1] },
  // Thăm bệnh
  { ten: 'Sữa, cháo hoặc súp đóng hộp, dễ ăn', tip: 'Hỏi bác sĩ hoặc người nhà về chế độ ăn trước khi mang đồ ăn vào viện.', g: ['cha-me', 'ban-be', 'dong-nghiep', 'hang-xom', 'anh-chi-em'], d: ['thamBenh'], m: [1, 2] },
  { ten: 'Sách nhẹ nhàng, tai nghe hoặc sạc dự phòng', tip: 'Nằm viện lâu thường buồn chán. Tặng thứ giúp người bệnh giải khuây.', g: ['ban-be', 'dong-nghiep', 'anh-chi-em', 'nguoi-yeu'], d: ['thamBenh'], m: [1, 2] },
  { ten: 'Phong bì thăm hỏi kèm lời chúc mau khỏe', tip: 'Gửi vào lúc người nhà ở bên để họ không phải bận tâm khi nhận.', g: ['dong-nghiep', 'cap-tren', 'ban-be', 'hang-xom'], d: ['thamBenh'], m: [1, 2, 3] },
  // Tốt nghiệp, thăng chức
  { ten: 'Bó hoa nhỏ cùng tấm ảnh chụp ngày lễ', tip: 'Chụp ngay hôm lễ và gửi ảnh sau đó, người nhận thường rất vui.', g: ['ban-be', 'anh-chi-em', 'tre-em', 'nguoi-yeu'], d: ['totNghiep'], m: [1] },
  { ten: 'Đồng hồ thông minh, tai nghe hoặc balo laptop', tip: 'Chọn theo thói quen thật của người nhận. Hỏi người thân của họ để khỏi tặng món đã có.', g: ['anh-chi-em', 'nguoi-yeu', 'tre-em'], d: ['totNghiep', 'thangChuc', 'sinhNhat'], m: [3] },
  { ten: 'Hộp bút ký, kẹp tài liệu, ví da nhỏ', tip: 'Quà cho người mới lên chức: gọn, dùng được ngay, không phô trương.', g: ['dong-nghiep', 'ban-be', 'nguoi-yeu'], d: ['thangChuc'], m: [2] },
  // Mừng thọ
  { ten: 'Áo dài, áo ấm hoặc quần áo mới cho ông bà', tip: 'Hỏi con cháu trong nhà về màu và cỡ. Chọn màu tươi nhã, kiểu dễ mặc hằng ngày. Tránh bộ đồ may sẵn theo kiểu đồ tang hoặc đồ liệm nếu không chắc gia đình nghĩ gì.', g: ['cha-me'], d: ['mungTho'], m: [2, 3] },
  { ten: 'Bánh, trà, hộp yến hoặc lẵng quà bồi bổ', tip: 'Chọn đồ mềm, ít đường, đóng gói đẹp. Có thể góp chung với anh chị em để món quà xứng tầm.', g: ['cha-me'], d: ['mungTho'], m: [2, 3] },
  // Chia buồn
  { ten: 'Phong bì phúng viếng', tip: 'Mức phúng tùy quan hệ và hoàn cảnh, không có con số đúng. Bỏ phong bì kín, ghi tên vào mặt sau, đưa cho người nhận khoản phúng ở bàn tiếp khách.', g: ['cha-me', 'anh-chi-em', 'ban-be', 'dong-nghiep', 'cap-tren', 'thay-co', 'hang-xom', 'nguoi-yeu', 'tre-em'], d: ['tang'], m: [1, 2, 3] },
  { ten: 'Vòng hoa hoặc lẵng hoa viếng (hoa trắng, hoa cúc)', tip: 'Hoa viếng thường dùng màu trắng, vàng nhạt hoặc tím nhạt. Ghi tên người hoặc đơn vị gửi, theo mẫu dải băng của tiệm hoa.', g: ['dong-nghiep', 'cap-tren', 'ban-be', 'hang-xom', 'thay-co'], d: ['tang'], m: [2, 3] },
  { ten: 'Giúp việc cho gia đình có tang: nấu nước, tiếp khách, trông xe', tip: 'Thứ gia đình cần nhất những ngày đầu là sức người. Hỏi trước xem cần giúp việc gì thay vì tự quyết.', g: ['anh-chi-em', 'ban-be', 'hang-xom', 'dong-nghiep'], d: ['tang'], m: [1] },
  { ten: 'Hương, trái cây, nhang đèn thắp viếng', tip: 'Theo tục từng vùng và tôn giáo của gia đình. Không chắc thì hỏi người nhà hoặc người cùng đi.', g: ['cha-me', 'anh-chi-em', 'ban-be', 'hang-xom'], d: ['tang'], m: [1, 2] },
  // Tết chung
  { ten: 'Bông hồng trắng, nén hương hoặc lời thăm hỏi cho người đã mất cha hoặc mẹ', tip: 'Mùa Vu Lan có người buồn hơn thường ngày. Một tin nhắn hỏi thăm hoặc một bông hoa nhỏ thường quý hơn quà lớn. Không nhắc dồn về nỗi đau.', g: ['ban-be', 'dong-nghiep', 'anh-chi-em', 'cha-me', 'hang-xom'], d: ['vuLan'], m: [1] },
  { ten: 'Giỏ quà Tết tự chọn: hạt, mứt ít ngọt, trà, bánh', tip: 'Tự gói thường tiết kiệm và hợp khẩu vị hơn giỏ làm sẵn. Xem hạn sử dụng của từng món.', g: ['cha-me', 'cap-tren', 'thay-co', 'hang-xom', 'ban-be', 'dong-nghiep'], d: ['tet', 'namMoi'], m: [1, 2, 3] },
  { ten: 'Cành đào, cành mai hoặc chậu quất nhỏ', tip: 'Chọn cành nhiều nụ, mua vào cận Tết để hoa nở đúng dịp. Hỏi nhà nhỏ có chỗ đặt không.', g: ['cha-me', 'anh-chi-em', 'ban-be'], d: ['tet', 'tanGia'], m: [1, 2] },
  // Phụ nữ
  { ten: 'Khăn lụa, túi vải hoặc ví nhỏ gọn', tip: 'Chọn màu trung tính, dễ phối. Nhớ kèm tấm thiệp cảm ơn.', g: ['cha-me', 'nguoi-yeu', 'anh-chi-em', 'dong-nghiep', 'thay-co'], d: ['phuNu', 'ngayMe', 'sinhNhat'], m: [1, 2] },
  { ten: 'Dịch vụ chăm sóc: spa, làm tóc, massage', tip: 'Tặng phiếu kèm đặt lịch sẵn để người nhận khỏi phải sắp xếp. Hỏi trước nếu có dị ứng hoặc đang mang thai.', g: ['nguoi-yeu', 'cha-me', 'anh-chi-em'], d: ['phuNu', 'ngayMe', 'sinhNhat', 'tinhYeu'], m: [2, 3] },
  { ten: 'Chia việc nhà một ngày: bạn nấu cơm, bạn rửa chén', tip: 'Món quà không tốn tiền mà rất thật. Nói rõ ngày nào và làm cho trọn.', g: ['nguoi-yeu', 'cha-me'], d: ['phuNu', 'ngayMe', 'sinhNhat'], m: [1] },
  // Cưới
  { ten: 'Phong bì mừng cưới kèm thiệp viết tay', tip: 'Ghi tên đầy đủ ở mặt sau phong bì để gia đình dễ ghi sổ. Mặt trước ghi lời chúc ngắn.', g: ['ban-be', 'dong-nghiep', 'cap-tren', 'hang-xom', 'anh-chi-em', 'cha-me', 'thay-co'], d: ['cuoi'], m: [1, 2, 3] },
  { ten: 'Bộ khăn tắm, drap, gối đôi', tip: 'Chọn màu hợp tông phòng cưới, hỏi cô dâu chú rể cho chắc.', g: ['anh-chi-em', 'ban-be'], d: ['cuoi'], m: [2] },
  { ten: 'Album ảnh hoặc khung ảnh cho ngày cưới', tip: 'Tặng khung hoặc album lúc tân hôn để họ lưu ảnh của mình.', g: ['ban-be', 'anh-chi-em'], d: ['cuoi'], m: [1, 2] },
  // Sinh nhật
  { ten: 'Bánh kem nhỏ vị người ấy thích kèm nến', tip: 'Đặt trước một ngày, hỏi dị ứng. Mang đến sớm hơn giờ hẹn để bày biện.', g: ['ban-be', 'nguoi-yeu', 'dong-nghiep', 'anh-chi-em', 'cha-me', 'tre-em'], d: ['sinhNhat'], m: [1] },
  { ten: 'Một món người nhận từng nhắc là muốn mua', tip: 'Ghi nhanh vào danh sách ý tưởng quà ngay khi nghe được. App này lưu cho bạn.', g: ['ban-be', 'nguoi-yeu', 'anh-chi-em', 'dong-nghiep'], d: ['sinhNhat', 'thangChuc', 'totNghiep'], m: [1, 2, 3] },
];

export const KIENG_KY = [
  { dip: null, noi: 'Một số gia đình kiêng tặng đồng hồ cho người lớn tuổi (nghĩa "đếm ngược thời gian"), khăn tay (gợi nước mắt), giày dép cho người yêu (sợ "đi mất"), dao kéo (sợ "cắt đứt"). Đây là quan niệm dân gian, tùy từng nhà; nếu không chắc, chọn món khác.' },
  { dip: 'cuoi', noi: 'Hoa cúc, hoa trắng, đồ màu đen không hợp cho tiệc vui. Tránh tặng gương, hoặc đồ dễ vỡ nếu phải mang đi xa.' },
  { dip: 'tang', noi: 'Phong bì phúng viếng thường dùng màu trắng hoặc phong bì thường, không dùng phong bì đỏ hay hồng. Không nói lời chúc mừng, chúc vui.' },
  { dip: 'sinhNhat', noi: 'Không nhắc tuổi tác hoặc cân nặng của người nhận bằng lời đùa nếu họ không thích. Tuổi âm hay dương của người lớn tuổi nên hỏi trước.' },
  { dip: 'thamBenh', noi: 'Tránh hoa có mùi nồng và đồ ăn không hợp chế độ bệnh. Không hỏi dồn về bệnh tình.' },
];

/** Gợi ý quà: lọc theo nhóm quan hệ, dịp, mức ngân sách (0 = tất cả). Có thể loại những món đã tặng. */
export function goiYQua({ nhom = null, dip = null, muc = 0, daTang = [] } = {}) {
  const khoa = (s) => String(s).toLowerCase();
  const da = daTang.map(khoa);
  return QUA.filter((q) => (!nhom || q.g.includes(nhom)) && (!dip || q.d.includes(dip)) && (!muc || q.m.includes(muc)))
    .map((q) => ({ ...q, daTang: da.some((t) => khoa(q.ten).includes(t) || t.includes(khoa(q.ten))) }));
}
