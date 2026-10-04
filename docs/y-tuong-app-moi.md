# Ý tưởng app mới cho 9app.tech

Ngày ghi: 04/10/2026. **Chỉ là ý tưởng, chưa làm.** Mục "Do chủ sản phẩm đề xuất" ghi theo lời chủ sản phẩm; mục "Gợi ý thêm" là đề xuất của Claude để chủ sản phẩm chọn. Thông tin về API ghi là "cần kiểm chứng" nghĩa là chưa tra tài liệu chính thức.

## Hạ tầng đã có, dùng lại được cho app mới
- Đăng nhập, ví và sổ cái (9Ship), mã QR VietQR và nhập giao dịch từ ảnh bằng AI (9Fin), báo giá nhiều nguồn (9Ship), kỳ phí và mã giảm giá (9Sport).
- 9app Console: màn quản trị chung, mỗi app chỉ cần mở API quản trị chuẩn (xem `9admin/docs/ADMIN-API.md`).
- Nút "‹ 9app" dùng chung (`js/homebar.js`) và bộ icon cùng phong cách (ô bo tròn nền gradient, hình trắng đơn giản).

## Do chủ sản phẩm đề xuất

### 9shop: mua sắm
Mục đích: nơi mua sắm.
Gợi ý hướng làm:
- Bước nhẹ nhất: **so sánh giá và gom link** (affiliate Shopee, Lazada, TikTok Shop qua mạng liên kết như Accesstrade; cần kiểm chứng), kết hợp mã từ 9voucher. Không giữ hàng, không giữ tiền khách.
- Bán hàng thật (có kho, thu tiền) là hướng nặng: cần đăng ký website thương mại điện tử với Bộ Công Thương, xử lý đổi trả, hóa đơn.
- Giao hàng nối với 9Ship khi có hãng thật.

### 9fit (tên đã chọn, trước đó gọi là 9gym; các tên khác từng cân nhắc: 9move, 9train)
Nội dung: bài tập gym, tập tăng cường cho từng môn thể thao, yoga, kế hoạch tập, khối lượng tập, lộ trình.
Gợi ý:
- Thư viện bài tập (tên, nhóm cơ, hình/video, cách tập). Dữ liệu mở như wger hoặc free-exercise-db (cần kiểm chứng giấy phép).
- Ghi buổi tập: bài, số hiệp, số lần, mức tạ; tự tính **khối lượng tập** (hiệp × lần × kg) theo tuần; biểu đồ tiến bộ.
- **Lộ trình theo môn** của 9Sport (cầu lông, pickleball, bóng đá): bài tập tăng cường chân, core, cổ tay; liên kết lịch buổi chơi (đã tập hôm nay thì nhắc nghỉ).
- AI gợi ý kế hoạch theo mục tiêu, thời gian, dụng cụ; người dùng chỉnh được.
- Yoga: chuỗi động tác theo thời lượng (10, 20, 30 phút), có hẹn giờ.

### 9voucher: chia sẻ voucher không dùng đến
Ý chính: thành viên chia sẻ voucher không dùng; chọn lọc voucher chất lượng; quy đổi phần được tặng ra **điểm chất lượng thành viên**; chia sẻ nhiều thì được ưu tiên thấy voucher. Loại voucher: Grab, Xanh SM, ăn uống, mua đồ.
Điểm cần quyết định khi làm:
- **Chống gian lận**: voucher giả, đã dùng, hết hạn. Cần nút báo "dùng được/không dùng được" và trừ điểm người đăng sai.
- **Điểm chất lượng**: cộng khi voucher được người khác dùng thành công, trừ khi bị báo hỏng; mức ưu tiên xem voucher theo điểm.
- **Pháp lý và điều khoản**: nhiều nhãn cấm mua bán lại voucher. Nên chỉ chia sẻ miễn phí, điểm **không quy đổi ra tiền thật** để không thành mua bán.
- Kiểm duyệt: hàng chờ duyệt trong 9app Console, phát hiện trùng mã.
- Hạn dùng: nhắc voucher sắp hết hạn, tự ẩn khi quá hạn.

### 9ticket: mua vé xe, máy bay, tàu
Gợi ý:
- Bước nhẹ nhất: **so sánh giá và chuyển tới nơi bán** (deeplink/affiliate). Không phải giữ tiền khách, không cần hợp đồng đại lý.
- Bước nặng: làm đại lý bán vé. Vé máy bay thường qua đối tác (Amadeus, Sabre, hoặc đại lý như Traveloka/ĐT tổng hợp), vé xe khách qua các nền tảng có API đối tác (ví dụ Vexere), tàu qua Đường sắt Việt Nam hoặc đại lý. Mọi điều trên **cần kiểm chứng và thường cần ký hợp đồng**.
- Theo dõi giá: báo khi giá vé tuyến đã chọn giảm.

### 9chung: mua chung phần mềm (chủ sản phẩm đề xuất thêm ngày 04/10/2026)
Ý tưởng: nhiều người cùng mua một bản quyền chính thức (ví dụ Microsoft Office/Excel) để chia tiền.
Đánh giá của Claude, cần kiểm chứng điều khoản trước khi làm:
- **Hướng hợp lệ 1, gói gia đình/nhóm chính thức**: Microsoft 365 Family (tối đa 6 người dùng), Google One, Spotify/YouTube Premium Family, Canva Teams... App giúp **ghép nhóm, chia tiền hằng tháng, nhắc đóng, QR, theo dõi ai đã đóng**; app **không giữ tài khoản hay mật khẩu** của ai. Điều khoản nhiều nhà cung cấp yêu cầu các thành viên cùng gia đình/địa chỉ, nên phải kiểm tra từng gói trước khi cho ghép người lạ.
- **Hướng hợp lệ 2, mua theo ghế cho nhóm nhỏ/doanh nghiệp**: Microsoft 365 Business tính theo người dùng, bán qua đối tác chính thức (CSP). 9app đóng vai trung gian tập hợp đơn của nhiều nhóm nhỏ rồi bán lại qua một đối tác chính thức, cần hợp đồng, hóa đơn VAT, hỗ trợ.
- **Hướng nên tránh**: bán lại khóa kích hoạt (key) giá rẻ không rõ nguồn, hoặc cho nhiều người dùng chung một tài khoản trả phí. Thường vi phạm điều khoản nhà cung cấp, key rẻ hay là key bị lạm dụng/vi phạm bản quyền, dễ bị thu hồi và có rủi ro pháp lý, mất uy tín cho cả hệ 9app.
- Nên làm như một chức năng của **9split** (chia tiền nhóm) hoặc 9quy trước, vì phần lớn giá trị là quản lý nhóm và thu tiền đều đặn.

## Gợi ý thêm (brainstorm theo nhu cầu đời sống)

Xếp theo mức dễ làm: nhu cầu cao, dùng được hạ tầng sẵn, ít phụ thuộc đối tác.

### Nên cân nhắc trước
1. **9bill: nhắc và theo dõi hóa đơn** (điện, nước, internet, học phí, bảo hiểm): đến hạn thì nhắc, kèm QR chuyển khoản; ghi sang 9Fin. Không cần API nhà cung cấp.
2. **9car (trước gọi là 9xe)**: quản lý xe của gia đình, nhắc lịch đăng kiểm/bảo dưỡng/mục định kỳ, mua bảo hiểm xe chiết khấu tốt, nhật ký chi phí. Chi tiết ở mục "Phân tích từng ý tưởng" bên dưới. Có sẵn 9speed (cảnh báo tốc độ, camera phạt nguội) để nối chung.
3. **9vault: két giấy tờ**: ảnh CCCD, bằng lái, hộ chiếu, bảo hiểm, bảo hành; nhắc **ngày hết hạn**; đọc thông tin từ ảnh bằng AI (đã có kỹ thuật ở 9Fin). Dữ liệu nhạy cảm, cần mã hóa và khóa bằng vân tay.
4. **9split: chia tiền nhóm** (đi ăn, du lịch, nhậu): nhập khoản chi, tự chia, ai nợ ai, tạo QR trả nợ. Nối 9Fin, 9quy, 9trip.
5. **9track: theo dõi vận đơn nhiều hãng** trong một màn hình (dán mã là thấy hành trình; cần kiểm chứng API như 17track hoặc API từng hãng). Bổ sung rất tốt cho 9Ship và 9shop.

### Đáng cân nhắc tiếp
6. **9trip: kế hoạch chuyến đi** (lịch trình, thời tiết, tỷ giá, ngân sách, chia tiền). Nối 9ticket, 9split. API dễ: bản đồ, thời tiết, tỷ giá (cần kiểm chứng).
7. **9price: săn giá và báo giảm** (vàng, ngoại tệ, xăng, sản phẩm, vé). Nối 9shop, 9ticket, 9Fin.
8. **9meal: thực đơn gia đình và đi chợ**: thực đơn tuần, danh sách đi chợ, calo; nối 9fit (mục tiêu ăn uống). Dữ liệu dinh dưỡng mở (cần kiểm chứng).
9. **9health: sổ sức khỏe gia đình**: lịch tiêm chủng cho con, nhắc uống thuốc, hồ sơ xét nghiệm, chỉ số cân nặng huyết áp. Dữ liệu rất nhạy cảm, cần cân nhắc bảo mật và pháp lý.
10. **9kid: việc học của con**: thời khóa biểu, bài tập, lịch học thêm, quỹ lớp (nối 9quy), nhắc họp phụ huynh.
11. **9event: sự kiện và họp lớp**: mời, xác nhận tham gia, góp quỹ (mở rộng từ 9quy).
12. **9home: quản lý nhà**: danh sách đồ đạc, bảo hành, thợ sửa tin cậy, lịch dọn dẹp thay lọc nước.
13. **9learn: học ngoại ngữ**: thẻ từ vựng, ôn tập ngắt quãng, AI chữa bài. Không phụ thuộc API ngoài.
14. **9pet: thú cưng**: sổ tiêm, lịch tẩy giun, chi phí.
15. **9rate: so sánh lãi suất gửi và vay ngân hàng** (dữ liệu công khai), nối 9Fin.

### Chưa nên làm sớm
- Gọi xe, giao đồ ăn: các hãng lớn không mở API cho cá nhân; chỉ làm được bằng deeplink.
- Tìm việc, hẹn hò, mạng xã hội: cần lượng người dùng lớn và kiểm duyệt nặng.

## Phân tích từng ý tưởng (thảo luận dần, từng cái một)

### 9car (đã chọn tên, trước gọi là 9xe)
Chủ sản phẩm muốn: mua bảo hiểm xe chiết khấu tốt; nhắc lịch đăng kiểm, bảo dưỡng và các mục định kỳ (kể cả cân bằng bánh xe).

**Ba phần của app**
1. *Hồ sơ xe + nhắc lịch (không cần đối tác, làm trước):* mỗi xe có biển số, hãng/đời, số km hiện tại, ngày mua. Các mục định kỳ theo **ngày hoặc km, cái nào đến trước**: đăng kiểm, bảo hiểm TNDS, bảo hiểm vật chất, thay nhớt, lọc gió/lọc nhớt, đảo lốp và **cân bằng động**, cân chỉnh độ chụm, má phanh, nước làm mát, ắc quy, bằng lái. Có mẫu lịch gợi ý theo loại xe, người dùng sửa được. Người dùng cập nhật số km, app đoán km theo thói quen để nhắc sớm.
2. *Bảo hiểm xe:* nhập thông tin xe (hoặc chụp đăng ký xe, AI đọc ảnh như 9Fin) → hiện báo giá vài công ty → chọn và thanh toán → nhận giấy chứng nhận điện tử; nhắc gia hạn trước hạn 30 ngày.
3. *Sổ chi phí xe:* xăng, rửa xe, gửi xe, phí cầu đường, sửa chữa; tính chi phí mỗi km và mỗi tháng; ghi sang 9Fin.

**Điểm cần kiểm chứng trước khi hứa với người dùng**
- Bảo hiểm TNDS bắt buộc có mức phí do nhà nước quy định, thường **không được chiết khấu**; chiết khấu thực tế nằm ở bảo hiểm vật chất (thân vỏ) tự nguyện, và ở quà tặng/khuyến mại. Hứa "chiết khấu" phải đúng luật.
- Bán bảo hiểm phải là **đại lý có hợp đồng với công ty bảo hiểm** hoặc môi giới có giấy phép; tiền phí đi thẳng về công ty bảo hiểm, 9app không giữ tiền. Cần chọn 2–3 công ty có kênh đại lý/API (cần kiểm chứng).
- Chu kỳ đăng kiểm phụ thuộc loại xe và tuổi xe: làm bảng chu kỳ sửa được, không gõ cứng; cần đối chiếu quy định hiện hành.
- Tra phạt nguội không có API chính thức (trang tra cứu có mã xác minh); nên dùng 9speed để cảnh báo trước, tra thủ công qua đường dẫn.
- Giấy tờ (ảnh bằng lái, đăng ký xe) nhạy cảm: dùng chung kỹ thuật mã hóa của 9vault.

**Liên kết trong hệ 9app:** 9speed (cùng người lái xe), 9Fin (chi phí), 9vault (giấy tờ), 9voucher (voucher xăng, rửa xe), 9shop (phụ tùng), 9split (chi phí xe dùng chung), 9ticket (đi xa).

**Doanh thu có thể có:** hoa hồng bảo hiểm (đại lý), hoa hồng đặt lịch bảo dưỡng ở garage đối tác, affiliate phụ tùng. Bản đầu (hồ sơ xe + nhắc lịch) miễn phí để kéo người dùng.

**Rủi ro/việc khó:** pháp lý bán bảo hiểm, đối tác garage khó gom, người dùng lười nhập km. Cách giảm: nhập một lần qua ảnh, nhắc theo thời gian khi không có km.

## Ưu tiên theo khả năng kết nối API (chủ sản phẩm yêu cầu ngày 04/10/2026)
Chủ sản phẩm muốn ưu tiên ý tưởng **kết nối API với dịch vụ có sẵn** như 9Ship với các hãng vận chuyển, 9car với hãng bảo hiểm, 9ticket với hãng bay/xe/tàu. Tên 9car giữ tạm (cả ô tô và xe máy). Tên tiếng Anh một từ cho đồng bộ.

**Bài học từ Nhanh.vn:** tài liệu API nói một đằng, tài khoản thật chạy một nẻo (không có vận đơn thật dù API trả thành công). Với mọi đối tác: xin tài khoản sandbox và hợp đồng đối tác **trước khi** viết app; thử một giao dịch thật có chi phí nhỏ trước khi mở bán.

**Hạ tầng dùng lại:** lõi của 9Ship (hợp đồng adapter, sổ cái, giữ tiền rồi chốt hoặc nhả, hàng đợi gửi lại, webhook, màn quản trị trong 9app Console) làm được cho mọi app "báo giá, đặt, hủy, theo dõi". Nên tách thành **bộ khung đối tác dùng chung**, mỗi app chỉ viết adapter cho từng đối tác.

### Bậc 1: kết nối công khai hoặc affiliate, bắt đầu nhanh
- **9shop**: API/liên kết giới thiệu của các sàn (Shopee, Lazada, TikTok Shop) và mạng liên kết (Accesstrade, Ecomobi...). Hoa hồng theo đơn.
- **9trip, 9ticket giai đoạn đầu**: khách sạn (Agoda, Booking có chương trình affiliate), vé máy bay/xe qua mạng liên kết du lịch (như Travelpayouts); eSIM du lịch qua chương trình đối tác (như Airalo). Tất cả cần kiểm chứng phạm vi Việt Nam.
- **9voucher**: mua voucher số qua nhà phân phối quà tặng điện tử (như Urbox, Gotit, cần kiểm chứng), kết hợp voucher thành viên chia sẻ.
- **9rate / 9price**: dữ liệu công khai: tỷ giá, lãi suất, giá vàng, giá xăng.

### Bậc 2: cần ký đối tác nhưng mô hình tiền rõ
- **9car bảo hiểm**: công ty bảo hiểm có kênh đại lý/bán trực tuyến (PVI, Bảo Việt, MIC, PJICO, BIC, Liberty... cần kiểm chứng ai có API). Cần tư cách đại lý/môi giới hợp pháp; phí bảo hiểm bắt buộc không được chiết khấu.
- **9ticket đầy đủ**: đại lý vé máy bay (hãng bay hoặc nhà tổng hợp), vé xe khách qua nền tảng đối tác, vé tàu qua kênh đại lý.
- **9bill**: thanh toán hóa đơn điện nước internet qua đơn vị trung gian thanh toán (như Payoo, VNPAY, MoMo bill API; cần kiểm chứng) vì từng nhà cung cấp riêng thường không mở API.
- **Nạp tiền điện thoại, data, thẻ game**: qua nhà phân phối; biên lợi nhuận thấp nhưng ổn định.
- **9ship**: nhà vận chuyển trực tiếp (GHTK đã có adapter; GHN, Viettel Post, J&T cần tài khoản đối tác).

### Bậc 3: khó hoặc rủi ro pháp lý cao
- Sức khỏe (đặt khám, mua thuốc), vay và thẻ tín dụng (dẫn khách cho ngân hàng: sinh lời nhưng quản lý chặt), giao đồ ăn, gọi xe (các hãng lớn không mở API cho cá nhân).

### 9ticket (thảo luận sâu ngày 04/10/2026)
**Giá trị khác biệt (không đánh vào "vé rẻ nhất"):** (1) trợ lý hành trình *sau khi mua*: nhắc giờ, theo dõi chuyến trễ/hủy, check-in, vé lưu ngoại tuyến; (2) đặt hộ gia đình và nhóm (CLB đi giải, họp lớp, công ty), chia tiền; (3) so sánh liên phương thức theo tổng thời gian và chi phí từ cửa đến cửa; (4) liền mạch trong hệ 9app (ví, 9split, 9voucher, 9car, 9trip).

**Tính năng theo vòng đời:** tìm một ô cho xe/bay/tàu và kết hợp; lịch giá ngày lân cận; theo dõi giá và báo giảm; hồ sơ hành khách lưu sẵn (người thân, con, bố mẹ); đặt hộ và gửi vé qua Zalo/SMS; giữ chỗ, chọn ghế, hành lý, suất ăn, bảo hiểm chuyến đi; vé điện tử ngoại tuyến; thêm vào lịch; nhắc ra bến/sân bay theo kẹt xe; theo dõi chuyến bay; đổi/hoàn vé trong app, hoàn tiền vào ví; hóa đơn VAT; đánh giá nhà xe; doanh nghiệp (duyệt chi, hóa đơn gộp, báo cáo sang 9Fin); cộng tác viên bán vé (cẩn trọng pháp lý).

**Cách kết nối (từ tra cứu, cần xác nhận điều kiện thực tế):**
- Xe khách: Vexere nêu các hình thức hợp tác gồm tài khoản đặt trực tuyến cho đại lý, tích hợp API, White Label, Affiliate; nói không thu phí tích hợp và có tài liệu.
- Máy bay: (a) affiliate (Travelpayouts, Traveloka qua Involve Asia); (b) thuê API từ nhà tổng hợp trong nước (như Datacom, tích hợp Vietnam Airlines, Vietjet, Bamboo, Vietravel và GDS Amadeus/Sabre/Travelport, tính theo gói tìm kiếm/đặt chỗ); (c) hợp đồng đại lý trực tiếp với hãng.
- Tàu: Đường sắt Việt Nam bán qua dsvn.vn và vetau.com.vn, có các đại lý chính thức (như Vexere); đường API đi qua đại lý đã có hợp đồng hoặc ký đại lý với DSVN.

**Doanh thu:** affiliate bay khoảng 1,1 đến 1,5% giá trị đặt và khách sạn khoảng 4 đến 5% theo một nguồn tổng hợp (rất thấp, cần khối lượng); đại lý vé xe thường hoa hồng cao hơn (hỏi đối tác); phí dịch vụ và bán thêm (bảo hiểm, hành lý, đưa đón) thường sinh lời tốt hơn; gói thành viên theo dõi giá.

**Rủi ro chính:** xuất vé thất bại hoặc quá thời gian sau khi đã thu tiền (cần chống xuất trùng, tra lại theo mã giữ chỗ); giá đổi liên tục và thời gian giữ chỗ ngắn; hoàn/đổi theo chính sách hãng; hãng hủy chuyến; tên không khớp giấy tờ; mùa Tết quá tải; giữ tiền khách cần đúng pháp lý; dữ liệu CCCD/hộ chiếu nhạy cảm; hỗ trợ khách 24/7 khi lỡ chuyến.

**Lộ trình đề xuất:** 0) xin đối tác và sandbox; 1) "trợ lý chuyến đi" không giữ tiền (so sánh bằng liên kết/affiliate, nhập vé từ mã hoặc ảnh, nhắc giờ, theo dõi chuyến, chia tiền); 2) vé xe khách qua API/White Label; 3) vé bay qua nhà tổng hợp, vé tàu qua đại lý; 4) công ty, nhóm CLB, cộng tác viên, gói thành viên.

### 9bill (thảo luận sâu ngày 04/10/2026)
**Chỗ đứng:** thanh toán hóa đơn đã có sẵn ở MoMo, ZaloPay, VNPAY, app ngân hàng, miễn phí và có khuyến mãi, nên 9bill **không cạnh tranh ở khâu thanh toán**. Giá trị nằm ở *quản lý*: gom mọi hóa đơn của nhiều "hộ" (nhà mình, nhà bố mẹ, nhà trọ) và nhiều người; nhắc thông minh; cảnh báo bất thường; chia tiền; ghi sổ tự động sang 9Fin.

**Tính năng:** thêm hóa đơn bằng mã khách hàng, chụp ảnh (AI đọc) hoặc quét QR; tự tra kỳ hóa đơn qua đối tác thanh toán; nhắc trước hạn, nhắc người thân đóng hộ; thanh toán một chạm hoặc "đóng tất cả" qua đối tác; so sánh tháng trước, cảnh báo tiền điện nước tăng bất thường; chia hóa đơn cho nhà trọ/roommate/gia đình theo người hoặc chỉ số công tơ (nối 9split); hóa đơn tự tạo cho tiền nhà, phí chung cư, học phí (VietQR + nhắc + tự khớp biến động số dư); nạp điện thoại/data/ETC/thẻ tín dụng; gia hạn dịch vụ định kỳ; lưu chứng từ; báo cáo cuối năm.
**Ngách đáng chú ý:** chủ nhà trọ ghi chỉ số điện nước, app tính tiền từng phòng, gửi QR thu tiền, theo dõi ai nợ (có thể tách thành app riêng, ví dụ 9rent).

**Kết nối:** Payoo nêu kết nối trực tiếp nhiều nhà cung cấp hóa đơn (điện, nước, viễn thông, truyền hình, internet, tài chính, học phí, viện phí), có API REST/SOAP, cấp tài khoản sandbox khi đăng ký merchant (Business Username, ShopID, ChecksumKey). Các dịch vụ truy vấn và thanh toán hóa đơn cũng được cung cấp qua NAPAS, VNPAY, Payoo (qua ngân hàng đối tác). EVN không thấy mở API công khai cho bên thứ ba; thường đi qua đơn vị trung gian. Chuỗi API điển hình: tra cứu theo mã khách hàng, nhận danh sách hóa đơn (kỳ, số tiền), thanh toán, xác nhận, đối soát cuối ngày.

**Pháp lý:** theo Nghị định 52/2024/NĐ-CP (tra cứu), ví điện tử, hỗ trợ thu hộ chi hộ và cổng thanh toán điện tử cần giấy phép của Ngân hàng Nhà nước, vốn điều lệ thực góp tối thiểu 50 tỷ đồng. Vì vậy 9app **không tự thu hộ tiền hóa đơn**: khách thanh toán qua đối tác có phép. Cần luật sư xem xét: ví trả trước đang chứa tiền khách của 9Ship có nằm trong phạm vi quy định này không; luật bảo vệ dữ liệu cá nhân với mã khách hàng và địa chỉ; ủy quyền tự động trừ tiền.

**Doanh thu:** hoa hồng thu hộ từ đối tác (thường rất thấp, cần hỏi), bán chéo (bảo hiểm 9car, voucher 9voucher), gói thành viên cho nhà trọ hoặc nhiều hộ. Giá trị lớn nhất là **đều đặn mỗi tháng** (người dùng quay lại thường xuyên), kéo các app khác.

**Rủi ro:** dữ liệu hóa đơn cũ hoặc sai, nhà cung cấp đổi mã, thanh toán thành công nhưng báo lỗi (hoặc ngược) cần đối soát, khuyến mãi áp đảo của ví lớn, người dùng ngại giao tiền cho app mới, chi phí hỗ trợ khi bị cắt điện nước vì chưa ghi nhận.

**Lộ trình:** 1) sổ hóa đơn thông minh, không cần API (thêm tay/ảnh/QR, nhắc, phân tích, chia tiền, ghi sang 9Fin); 2) tra cứu tự động qua đối tác (chỉ đọc, đóng tiền bằng deeplink sang app của họ); 3) thanh toán trong app qua cổng của đối tác; 4) nhà trọ, chung cư, gói thành viên, tự động đóng.

### 9shop (thảo luận sâu ngày 04/10/2026)
**Chỗ đứng:** không bán hàng; là **trợ lý mua sắm** đứng trên Shopee, Lazada, TikTok Shop. Ai cũng đã có app sàn nên giá trị phải là thứ app sàn không làm: theo dõi giá đa sàn, lịch sử giá thật, tổng chi phí cuối cùng (giá + ship + voucher tốt nhất), mua theo ngữ cảnh trong hệ 9app, mua chung nhóm.

**Tính năng:** danh sách muốn mua (dán link hoặc chia sẻ từ app sàn sang 9app) và báo khi giá giảm; lịch sử giá 90 ngày để phân biệt giảm giá thật và giảm giá ảo; so sánh cùng sản phẩm giữa các sàn; "giá cuối" sau voucher (nối 9voucher); gợi ý đúng lúc theo 9Sport (vợt, dây vợt, giày, đồng phục CLB có in logo), 9car (phụ tùng, camera hành trình, nước rửa xe), 9fit (dụng cụ tập, thực phẩm bổ sung), 9kid (sách vở); mua chung để đủ freeship (CLB, hàng xóm, đồng nghiệp; chia tiền bằng 9split); danh sách quà tặng chia sẻ cho người thân; tóm tắt đánh giá bằng AI và cảnh báo đánh giá ảo; theo dõi đơn đã mua (nối 9track) và nhắc hạn đổi trả, bảo hành (nối 9vault).

**Kết nối (từ tra cứu):** Shopee Affiliate Open API ở Việt Nam (REST sản phẩm, GraphQL ưu đãi, tạo link, báo cáo đơn; cần tài khoản Shopee Affiliate, app_id và secret, ký HMAC-SHA256); Accesstrade có API tạo link theo dõi, nguồn dữ liệu sản phẩm, danh sách mã khuyến mại, chiến dịch TikTok Shop; Lazada Affiliate API riêng (tìm sản phẩm, tạo link, báo cáo); TikTok Shop có Affiliate Creator API. Không có cách chính thống lấy giá bất kỳ URL nào; theo dõi giá phải dựa trên dữ liệu sản phẩm của các API này, nên giới hạn ở sản phẩm có trong nguồn dữ liệu.

**Doanh thu:** hoa hồng khoảng 2 đến 10% giá trị đơn, Shopee có thể đến khoảng 11% (theo một nguồn); trả chậm (Lazada trả vào ngày 25 tháng sau, ngưỡng rút Accesstrade 200.000đ); mỗi đơn chỉ vài nghìn đồng nên cần lượng đơn lớn. Lợi thế là người dùng đang có ý định mua.

**Pháp lý (tra cứu, cần luật sư xác nhận):** Luật Thương mại điện tử 2025 (122/2025/QH15), hiệu lực từ 01/07/2026, điều chỉnh trực tiếp tiếp thị liên kết, yêu cầu xác thực danh tính điện tử với người làm affiliate; không quảng bá trên nền tảng bị cơ quan nhà nước công bố vi phạm; nên ghi rõ có hoa hồng. Website bán hàng phải thông báo hoặc đăng ký với Bộ Công Thương; chưa rõ trường hợp chỉ giới thiệu liên kết. Bộ Công Thương đã cảnh báo ứng dụng **hoàn tiền mua sắm (cashback) có dấu hiệu đa cấp trái phép**: tránh hoàn tiền kiểu mạng lưới giới thiệu nhiều tầng; hoàn tiền nếu có phải minh bạch, một cấp. Điều tương tự cần cân nhắc cho điểm thành viên của 9voucher.

**Rủi ro:** sàn đổi chính sách hoa hồng, hoa hồng bị hủy khi đơn hoàn, mất theo dõi, người dùng quen mở thẳng app sàn, dữ liệu giá không phủ hết sản phẩm.

**Lộ trình:** 1) danh sách muốn mua và theo dõi giá, kèm link affiliate khi bấm mua; 2) so sánh đa sàn, tổng chi phí, voucher; 3) gợi ý theo ngữ cảnh 9Sport/9car/9fit; 4) mua chung nhóm và đồng phục CLB; 5) bán hàng thật chỉ khi có lý do rõ.

### 9voucher (thảo luận sâu ngày 04/10/2026)
**Phát hiện then chốt:** không phải voucher nào cũng chia sẻ được. Grab và Xanh SM nêu điều khoản e-voucher **không chuyển nhượng, không bán lại, không đổi tiền**, nhiều voucher gắn tài khoản. Phân loại: (1) mã khuyến mại công khai ai nhập cũng dùng (chia sẻ được); (2) voucher gắn tài khoản (không chuyển được, chỉ nên là thông tin ưu đãi, không chia sẻ mã); (3) phiếu quà tặng điện tử như UrBox, Got It, Co.opmart (chuyển được dưới dạng mã/đường dẫn nhưng giá trị gần như tiền). App phải phân loại và từ chối loại cấm.

**Cơ chế:** đăng voucher (mã, hạn, điều kiện, ảnh; AI đọc ảnh chụp để nhập nhanh); người nhận bấm "dùng được / không dùng được"; đăng sai bị trừ điểm; mã chỉ lộ khi nhận; giới hạn đăng trong ngày; xác minh số điện thoại; cấm đòi tiền ngoài app; kiểm duyệt bằng AI cộng người duyệt trong Console.

**Điểm chất lượng:** tăng khi voucher được người khác dùng thành công, theo giá trị voucher, hạn còn lại, độ khan hiếm; giảm khi bị báo hỏng; **không chuyển nhượng, không đổi ra tiền, hết hạn sau 12 tháng**; bậc thành viên quyết định thấy voucher sớm hơn và hạn mức nhận mỗi ngày. Cần cơ chế cho người mới (nhận thử vài voucher nhỏ mỗi tuần) để tránh bài toán khởi đầu lạnh.

**Nguồn voucher ngoài cộng đồng:** danh sách mã khuyến mại công khai qua API mạng liên kết (Accesstrade có API mã khuyến mại và deal, kèm link affiliate); voucher do thương hiệu tài trợ; mua e-voucher qua nhà phân phối (UrBox có tích hợp API/SMS/email, Got It có API/SDK/webview, nêu 98% thương hiệu tích hợp API) để làm quà đổi điểm.

**Tính năng:** ví voucher cá nhân và nhắc hạn (AI đọc ảnh chụp); gợi ý dùng voucher sắp hết hạn theo vị trí; tặng voucher chuyển được cho bạn bè qua Zalo; lọc theo nhu cầu (đi lại, ăn uống, mua sắm); nối 9shop (giá cuối sau voucher), 9car, 9ticket, 9Sport, 9bill; thống kê "đã tiết kiệm bao nhiêu".

**Pháp lý (tra cứu, cần luật sư xác nhận):** một nguồn cho rằng không có căn cứ pháp lý cho mua bán voucher không phải voucher khuyến mại, nên **không bán voucher, không quy đổi tiền**. Điểm thành viên phải không chuyển nhượng, không thưởng giới thiệu nhiều tầng (Bộ Công Thương đã cảnh báo mô hình hoàn tiền có dấu hiệu đa cấp). Voucher do chính 9app phát hành là khuyến mại: phải thông báo Sở Công Thương, giảm tối đa 50% (100% dịp lễ, tết). Ảnh voucher có thể chứa thông tin tài khoản: che hoặc xóa trước khi lưu.

**Doanh thu:** affiliate từ nguồn mã công khai; thương hiệu tài trợ voucher; chiết khấu khi bán e-voucher qua đối tác; gói thành viên (nhắc sớm, hạn mức), nhưng không bán "ưu tiên" voucher của người khác.

**Rủi ro:** voucher giả hoặc đã dùng làm mất lòng tin; thương hiệu khóa tài khoản người dùng vì chuyển nhượng; nhiều tài khoản để cày điểm; chi phí kiểm duyệt; chi phí thật khi đổi điểm lấy quà.

**Lộ trình:** 1) ví voucher cá nhân + nhắc hạn (có giá trị ngay, không cần cộng đồng, ít rủi ro); 2) nguồn mã công khai (affiliate) + gợi ý theo nhu cầu; 3) chia sẻ trong nhóm tin cậy (CLB 9Sport, gia đình) với điểm cơ bản; 4) cộng đồng mở có cấp bậc và kiểm duyệt; 5) đổi điểm lấy e-voucher qua UrBox hoặc Got It.

### 9fit (thảo luận sâu ngày 04/10/2026)
**Chỗ đứng:** thị trường app tập luyện rất đông (nhật ký tập, chạy bộ, dinh dưỡng, yoga). Khác biệt của 9fit: **tập bổ trợ cho môn bạn chơi** (cầu lông, pickleball, bóng đá), bằng tiếng Việt, gắn với lịch buổi chơi và CLB trong 9Sport. Không đi vào "gym tổng quát" đối đầu app lớn.

**Tính năng:**
- Thư viện bài tập tiếng Việt: nhóm cơ, dụng cụ, mức độ, hướng dẫn từng bước, lỗi thường gặp, biến thể dễ và khó, lọc theo "tại nhà không dụng cụ", gym, dây kháng lực, thời lượng.
- Chương trình theo mục tiêu (tăng cơ, giảm mỡ, sức bền, linh hoạt, phục hồi) và **theo môn** (cầu lông: bước chân, bật nhảy, cổ tay và vai, xoay thân; pickleball: mắt cá, chân, vai; bóng đá: nước rút, cơ chân, phòng chấn thương đầu gối), theo mùa giải (giảm tải trước giải).
- Ghi buổi tập nhanh: bài, hiệp, lần, mức tạ hoặc RPE, hẹn giờ nghỉ, kỷ lục cá nhân, gợi ý tăng tạ từ từ.
- **Khối lượng tập và tải tập tổng:** hiệp × lần × kg theo nhóm cơ mỗi tuần; cộng thêm tải từ buổi chơi 9Sport (số trận, thời lượng) để cảnh báo tuần quá tải. Đây là điểm khác biệt chính.
- Yoga, giãn cơ, khởi động theo môn trước trận và hồi phục sau trận (chuỗi 5 đến 30 phút, hẹn giờ, giọng đọc).
- Lộ trình và tiến bộ: mục tiêu, cân nặng, vòng đo, ảnh tiến độ riêng tư, bài kiểm tra thể lực định kỳ.
- AI huấn luyện: tạo chương trình theo mục tiêu, dụng cụ, thời gian, chấn thương; điều chỉnh khi bỏ buổi; kiểm tra tư thế bằng camera chạy trên máy (giai đoạn sau, độ chính xác hạn chế).
- Dinh dưỡng nhẹ (nối 9meal), cộng đồng và CLB (thử thách nhóm, bảng xếp hạng nội bộ, huấn luyện viên giao bài), nối 9shop (dụng cụ), 9voucher (phòng tập, yoga).

**Dữ liệu và API (từ tra cứu):** bài tập: wger (dữ liệu CC-BY-SA 3.0, khoảng 845 bài, phần mềm AGPL), free-exercise-db (Unlicense, khoảng 800 bài, nguồn gốc quyền của ảnh chưa rõ cho sản phẩm trả phí), ExerciseDB bản miễn phí chỉ phi thương mại (muốn thương mại phải mua), MuscleWiki và API Ninjas (cần đọc điều khoản). Lâu dài nên tự quay video tiếng Việt với huấn luyện viên CLB. Dinh dưỡng: Bảng thành phần thực phẩm Việt Nam của Viện Dinh dưỡng, chưa thấy API công khai. Thiết bị đeo: Strava API dùng được; Garmin tạm ngừng nhận đăng ký API mới; Fitbit Web API sắp ngừng; Google Health Connect và Apple HealthKit cần ứng dụng native, không đọc được từ web.

**Doanh thu:** freemium (gói Plus: AI không giới hạn, phân tích tải, video, kiểm tra tư thế), phí cho huấn luyện viên và CLB (giao bài, quản lý lớp), affiliate dụng cụ (qua 9shop), hoa hồng đặt chỗ phòng tập và yoga. App tập luyện có tỷ lệ bỏ cao sau 30 ngày; lợi thế của 9fit là gắn với buổi chơi thật hằng tuần.

**An toàn và pháp lý:** không phải tư vấn y tế; hỏi sàng lọc sức khỏe (như PAR-Q) khi bắt đầu; từ chối tạo chương trình cho nhóm rủi ro (thai kỳ, bệnh tim, trẻ em) mà khuyên gặp bác sĩ; dữ liệu sức khỏe là dữ liệu cá nhân nhạy cảm (cần mã hóa, đồng ý rõ ràng, cho xóa); quảng cáo thực phẩm chức năng bị quản lý chặt; kiểm duyệt lời khuyên của AI vì sai có thể gây chấn thương; kiểm tra bản quyền hình và video bài tập.

**Lộ trình:** 1) nhật ký tập, thư viện 100 đến 150 bài tiếng Việt, hẹn giờ nghỉ (chạy không cần mạng); 2) chương trình mẫu theo môn, khởi động và giãn cơ nối lịch 9Sport; 3) khối lượng và tải tập tổng, cảnh báo quá tải; 4) AI tạo và điều chỉnh chương trình; 5) cộng đồng, CLB, huấn luyện viên; 6) kiểm tra tư thế, đọc dữ liệu đồng hồ (bản native), thị trường huấn luyện viên.

## App cho người đi làm văn phòng trẻ, rành công nghệ (chủ sản phẩm yêu cầu ngày 04/10/2026)
Yêu cầu: nghĩ một app cho khối văn phòng người trẻ, nhóm hiểu về điện thoại và phần mềm hơn mức đại trà.

**Đặc điểm nhóm này:** quen nhiều app (ngân hàng, Notion, ChatGPT), thích tự động hóa, ghét quảng cáo và giao diện rườm rà, đòi số liệu minh bạch, lo lộ dữ liệu, thường xuyên cầm nhiều khoản cố định (nhà, điện, internet, đăng ký dịch vụ) và có tiền lương là sự kiện trung tâm mỗi tháng.

**Đề xuất chính: 9payday, trợ lý "đồng lương" của người đi làm.**
Lý do chọn: lương là sự kiện hằng tháng nên giữ chân tốt; luật thay đổi lớn nên có nhu cầu tính đúng (Luật Thuế TNCN sửa đổi hiệu lực 01/07/2026, giảm trừ gia cảnh bản thân 15,5 triệu và người phụ thuộc 6,2 triệu mỗi tháng từ kỳ tính thuế 2026, biểu thuế 5 bậc 5, 10, 20, 30, 35%, theo nguồn tra cứu, cần đối chiếu văn bản chính thức); dùng lại 9Fin, 9bill, 9vault; ít phụ thuộc đối tác.

**Mô-đun:**
1. Lương thực lĩnh chính xác (Gross sang Net theo luật mới, BHXH/BHYT/BHTN, phụ cấp miễn thuế, thưởng tháng 13, làm thêm giờ) và **so sánh hai offer** (tổng gói, phúc lợi, đi lại).
2. **Ngày lương:** khi lương về (nhận biến động số dư hoặc nhập tay) thì chia lương vào "hũ" (cố định, tiết kiệm, đầu tư, linh hoạt, gia đình), tạo QR chuyển sang tài khoản tiết kiệm của chính người dùng; app chỉ ghi nhận và nhắc, không giữ tiền.
3. Khoản cố định và **dự báo dòng tiền 30 ngày** (còn bao nhiêu đến kỳ lương sau), nối 9bill; quản lý đăng ký dịch vụ.
4. **Thuế và quyết toán:** theo dõi thu nhập chịu thuế tích lũy, thuế đã khấu trừ, người phụ thuộc, dự báo hoàn hay nợ thuế, nhắc hạn, lưu chứng từ (nối 9vault), hướng dẫn nộp thủ công trên cổng thuế vì không có API cá nhân.
5. BHXH: ước tính thai sản, thất nghiệp, lương hưu, nhắc tra cứu sổ.
6. Mục tiêu: quỹ khẩn cấp, mua xe hoặc nhà (khả năng vay), du lịch; mô phỏng lãi kép; so sánh lãi suất gửi (nối 9rate).
7. **Dành cho người rành công nghệ:** quy tắc "nếu thì" tự động, webhook và token API cá nhân, bot Zalo hoặc Telegram ("tháng này tiêu bao nhiêu"), xuất CSV hoặc JSON, lịch ICS (ngày lương, hạn hóa đơn), widget, chế độ riêng tư, không quảng cáo.
8. AI: chụp **bảng lương** để trích gross, net, khấu trừ rồi đối chiếu với tính theo luật để phát hiện sai; hỏi đáp luật có nguồn.
9. So sánh lương ẩn danh theo vị trí (cần đủ dữ liệu và xác thực, dữ liệu rất nhạy cảm).

**Dữ liệu và API:** biến động số dư qua dịch vụ như SePay (đã dùng cho 9Fin); tỷ giá, vàng, lãi suất công khai; bảng luật (biểu thuế, mức đóng bảo hiểm, lương cơ sở, lương tối thiểu vùng) do mình bảo trì, **có phiên bản theo ngày hiệu lực** và kiểm thử bằng ví dụ chính thức; cổng thuế không mở API cho cá nhân.

**Doanh thu:** freemium (máy tính và hũ cơ bản miễn phí; gói Plus: hỗ trợ quyết toán, nhiều hồ sơ gia đình, dự báo, xuất dữ liệu); affiliate tiết kiệm, bảo hiểm, thẻ (công khai xung đột lợi ích); B2B2C: doanh nghiệp tặng nhân viên như phúc lợi tài chính; không bán dữ liệu.

**Tăng trưởng:** công cụ tính lương gross net miễn phí không cần đăng nhập (tìm kiếm, chia sẻ), mùa quyết toán thuế, kênh Zalo.

**Pháp lý và rủi ro:** không phải tư vấn thuế hay đầu tư có chứng chỉ (ghi rõ tham khảo, dẫn điều luật); lương và tài chính là dữ liệu cá nhân nhạy cảm (mã hóa, đồng ý rõ ràng, cho xóa); không giữ tiền để tránh quy định ví điện tử; affiliate tài chính cần cẩn trọng; luật đổi phải cập nhật nhanh; cạnh tranh với app ngân hàng, công cụ tính lương trên báo, chatbot miễn phí nên giá trị phải ở tích hợp, tự động hóa, dữ liệu cá nhân và nhịp hằng tháng.

**Phương án khác đã cân nhắc:** 9inbox (hộp thư đời sống: chuyển tiếp email, ảnh, tin nhắn rồi AI phân loại thành hóa đơn, vé, voucher, bảo hành; hợp người rành công nghệ, nên làm như lớp nền chung sau này); 9lunch (cơm trưa văn phòng, bình chọn và chia tiền; dùng hằng ngày nhưng doanh thu yếu); 9match (tìm kèo thể thao sau giờ làm, mở rộng 9Sport); 9career (sự nghiệp, hồ sơ, theo dõi ứng tuyển).

**Lộ trình:** 1) máy tính lương, thuế, so sánh offer (công cụ lan truyền); 2) ngày lương, hũ, dòng tiền, nhắc; 3) chụp bảng lương; 4) quyết toán thuế (trước mùa); 5) tự động hóa, bot, API cá nhân; 6) so sánh lương ẩn danh; 7) gói phúc lợi cho doanh nghiệp.

### 9lunch (thảo luận kỹ ngày 04/10/2026, chủ sản phẩm thích ý này)
**Đánh giá lại:** lúc đầu ghi "doanh thu yếu"; nghĩ lại thì giá trị chiến lược là **dùng hằng ngày** (5 lần mỗi tuần), kéo người dùng vào cả hệ 9app (9split, 9payday, 9fit, 9voucher), và có đường doanh thu B2B.

**Khoảng trống so với app có sẵn:** GrabFood và ShopeeFood đã có đặt đơn nhóm (mỗi người chọn món trên điện thoại, chia theo món hoặc chia đều). 9lunch không làm lại việc đó. 9lunch lo phần họ không làm: (1) **quyết định** ăn gì, ở đâu, ai đi; (2) đặt **ngoài sàn** (cơm văn phòng quán nhỏ, canteen, nhắn Zalo); (3) **thu tiền và nhắc nợ** khi một người ứng trước; (4) ngân sách, sức khỏe, lịch sử món.

**Tính năng:**
- Quyết định: bình chọn một chạm có giờ chốt, loại trừ theo ăn chay, dị ứng, ngân sách, món đã ăn 3 ngày qua; gợi ý theo thời tiết; kho quán của team (đánh giá nội bộ, giá, thời gian chờ, số Zalo quán); "rủ đi ăn" giờ 11:45 ở sảnh, kể cả người đi một mình.
- Đặt món: mỗi người chọn món và ghi chú, app gộp thành một phiếu gửi quán; menu hôm nay do quán đăng qua Zalo; mẫu đặt cả tuần, giờ chốt, "như thường lệ"; nếu đặt qua sàn thì mở sang app của họ.
- **Thu tiền và chia tiền (tính năng then chốt):** người ứng tiền tạo từng khoản (món + ship + phí chia theo người), mỗi người có QR VietQR riêng kèm mã; tự nhắc nhẹ nhàng ai chưa trả; khớp biến động số dư (SePay) hoặc xác nhận tay; sổ nợ nhóm và bù trừ cuối tuần hoặc tháng; **xoay vòng người ứng tiền** cho công bằng; chia mã giảm giá và freeship theo tỷ lệ.
- Ngân sách và sức khỏe: chi tiêu ăn trưa tháng này, so với mang cơm (một nguồn nêu khoảng 60.000đ/bữa ăn ngoài so với khoảng 25.000 đến 30.000đ mang cơm), calo ước tính từ ảnh hoặc tên món (nối 9fit), cảnh báo ăn lặp, theo dõi phụ cấp ăn trưa (nối 9payday).
- Xã hội văn phòng: trà chiều, sinh nhật đồng nghiệp (góp quỹ và đặt bánh), tiệc team, "ăn trưa đi bộ".
- Cho công ty (B2B): đặt cơm trưa cho nhân viên theo tuần, báo cáo chi phí, hóa đơn VAT theo tháng, phụ cấp ăn trưa, khảo sát hài lòng. Đã có đối thủ B2B (PITO Cloud Canteen).
- Cho người rành công nghệ: link đặt món mở trên web không cần cài app hay tài khoản, bot Zalo, Telegram, Slack, Teams ("/lunch"), webhook và API, xuất dữ liệu, lịch tuần.

**Kết nối:** quán và sàn giao hàng không có API công khai cho cá nhân (suy từ tra cứu, cần xác minh), nên điều phối ngoài sàn và chuyển sang app của họ bằng liên kết; thanh toán bằng VietQR và SePay (đã có); địa điểm quán chủ yếu do người dùng đóng góp (Google Places tính phí cao: bản Pro khoảng 32 USD mỗi 1.000 lần sau 5.000 lần miễn phí mỗi tháng, bản chỉ lấy ID miễn phí; nên lưu đệm); Zalo Mini App chạy trong Zalo, cần Zalo OA và xác minh doanh nghiệp, hỗ trợ ZaloPay và QR, thông báo ZNS; kênh phân phối tự nhiên vì nhóm công ty vốn chat trên Zalo.

**Thuế phụ cấp ăn trưa (nguồn tra cứu, cần đối chiếu):** từ 01/07/2026 mức miễn thuế khi chi tiền trực tiếp là 1.200.000đ mỗi người mỗi tháng thay cho 730.000đ; doanh nghiệp tự tổ chức bữa ăn hoặc cấp phiếu ăn thì không khống chế mức. Là điểm bán cho công ty và cho 9payday.

**Doanh thu:** SaaS theo đầu người cho công ty (nguồn chính, thật); quán nổi bật trong tòa nhà; giao tập trung theo tòa nhà (hoa hồng); affiliate và voucher ăn uống; gói cá nhân (thống kê, calo, nhiều nhóm). Giai đoạn đầu không thu phí quán nhỏ.

**Rủi ro:** nền tảng lớn đã có đặt nhóm nên không đối đầu; cần mật độ (một vài team trong cùng tòa nhà); quán nhỏ ngại công nghệ (nhận phiếu qua Zalo hoặc in ra); không giữ tiền (QR chuyển thẳng đến người ứng tiền, tránh quy định trung gian thanh toán); an toàn thực phẩm khi giao tập trung (yêu cầu quán cam kết giấy phép ATTP, chỉ giới thiệu quán có đánh giá); sở thích ăn uống và dị ứng là dữ liệu cá nhân nhạy cảm, để người dùng tự nguyện; tải dồn 11 đến 12 giờ.

**Lộ trình:** 1) nhóm ăn trưa bằng **link web, không cần cài**: bình chọn, gom món, chia tiền QR (dùng được với mọi quán và sàn); 2) sổ nợ nhóm, nhắc, khớp biến động, xoay vòng người ứng; 3) kho quán của team, lịch sử, AI gợi ý, ngân sách; 4) quán nhỏ có menu hằng ngày qua Zalo, giao tập trung theo tòa; 5) Zalo Mini App và bot Slack, Teams; 6) bản cho công ty; 7) đồ uống, sinh nhật, tiệc.

## Đợt ý tưởng bổ sung (04/10/2026, mỗi ý 1 đến 2 câu, chưa phân tích sâu)
**Công sở:** 9coffee (đặt đồ uống và trà chiều chung, mở rộng 9lunch); 9focus (giờ làm sâu kiểu Pomodoro, nhắc nghỉ mắt); 9desk (đặt phòng họp và chỗ ngồi cho văn phòng nhỏ, coworking); 9shift (xếp ca, chấm công QR, tính lương theo giờ cho cửa hàng nhỏ); 9leave (xin nghỉ phép, lịch nghỉ của team).
**Tiền bạc và nghề nghiệp:** 9invoice (freelancer lập hóa đơn, báo giá, thu tiền bằng QR, theo dõi khách nợ; nhà cung cấp hóa đơn điện tử có API); 9tax (kê khai thuế cho freelancer và hộ kinh doanh, cần kiểm tra quy định hiện hành); 9invest (theo dõi danh mục, so sánh quỹ và lãi suất, chỉ đọc); 9cv (soạn và chấm CV, theo dõi ứng tuyển); 9interview (luyện phỏng vấn với AI); 9english (tiếng Anh công sở: email mẫu, luyện nói).
**Đời sống và gia đình:** 9gift (sổ mừng cưới, hiếu hỉ để nhớ đáp lễ, nhắc sinh nhật, gợi ý quà, nối 9shop và 9voucher); 9elder (chăm bố mẹ ở xa: nhắc uống thuốc, lịch khám, đặt hộ đồ và xe); 9moving (chuyển nhà, biên bản bàn giao có ảnh, chỉ số điện nước vào và ra); 9swap (trao đổi đồ cũ trong tòa nhà hoặc công ty); 9habit (thói quen và mục tiêu, nối 9fit).
**Di chuyển:** 9commute (giờ xuất phát tối ưu, tuyến xe buýt và metro); 9carpool (ghép xe đi làm chia tiền xăng, cần xem quy định vận tải); 9parking (nhớ chỗ đỗ, nhắc hết giờ, phí gửi xe tháng); 9charge (trạm sạc xe điện, chi phí sạc, nối 9car).

## Đợt ý tưởng "Cuộc sống" (04/10/2026, 1 đến 2 câu mỗi ý)
- **9scam**: kiểm tra số điện thoại, tin nhắn, đường link, số tài khoản có dấu hiệu lừa đảo (nhu cầu lớn); dùng AI cùng danh sách tố giác công khai.
- **9thutuc**: thủ tục hành chính (gia hạn hộ chiếu, đổi bằng lái, làm CCCD): danh sách giấy tờ, nơi làm, lệ phí, nhắc hạn.
- **9chore**: chia việc nhà cho gia đình hoặc bạn ở chung, lịch xoay vòng, điểm thưởng cho con.
- **9fridge**: tủ lạnh và đi chợ: nhập hạn dùng thực phẩm, gợi ý món từ nguyên liệu đang có, giảm lãng phí.
- **9repair**: thợ sửa tin cậy (điện nước, điều hòa), đặt lịch, báo giá, bảo hành; nối 9home.
- **9neighbor**: cộng đồng chung cư. **Chủ sản phẩm nhận xét giống 9swap, nên gộp**: 9swap gồm cả trao đổi đồ cũ và cộng đồng tòa nhà (thông báo ban quản lý, mượn đồ, phản ánh sự cố).
- **9solo**: người sống một mình điểm danh mỗi ngày với người thân, báo động nếu im lặng lâu.
- **9baby**: theo dõi con nhỏ: bú, ngủ, tiêm chủng, cân nặng, mốc phát triển (dữ liệu nhạy cảm).
- **9wedding**: kế hoạch đám cưới: ngân sách, khách mời, nhà cung cấp; nối sổ mừng cưới 9gift.
- **9album**: album gia đình theo năm, chia sẻ riêng tư; nối Gia phả.
- **9plant**: chăm cây ban công và cây cảnh: nhắc tưới, nhận bệnh cây qua ảnh.
- **9sleep**: giấc ngủ: giờ đi ngủ, báo thức nhẹ, nhật ký giấc ngủ; nối 9fit.
- **9weatherlife**: thời tiết cho đời sống: mặc gì, phơi đồ được không, có nên rửa xe; nối 9car.
- **9diary**: nhật ký và tâm trạng riêng tư, nhắc biết ơn, tóm tắt tuần.
- **9read**: sách đang đọc, mục tiêu năm, ghi chú trích dẫn, cho mượn sách.
- **9bucket**: danh sách việc muốn làm trong đời, chia nhỏ thành mục tiêu năm.

## Chủ sản phẩm đã đánh dấu "ok" (04/10/2026)
- **9lunch**: đã duyệt, đang xây bản đầu (spec: `docs/superpowers/specs/2026-10-04-9lunch-design.md`). **9cafe được gộp vào 9lunch** như một loại bữa (cà phê, trà chiều) với tùy chọn đồ uống.
- Thích, chưa làm: **9english, 9interview, 9swap, 9charge**.
- Gợi ý gộp để khỏi nhiều app rời: 9english + 9interview + 9cv dùng chung nền AI luyện nói và hồ sơ nghề nghiệp, có thể là một app "sự nghiệp" (tên tiếng Anh một từ khi chốt). 9charge nên là một phần của 9car. 9swap độc lập, hợp nhất khi có tòa nhà hoặc công ty làm điểm bắt đầu.

## Việc dùng chung nên làm trước khi mở thêm nhiều app
- **Tài khoản 9app dùng chung** (một đăng nhập cho mọi app). Hiện 9Ship dùng chung một chiều với 9Sport; còn 9Fin, 9quy tách riêng. Nhiều app mới thì cần dịch vụ định danh trung tâm.
- **Điểm thành viên và ví chung** (cần cho 9voucher, 9shop, ưu đãi giữa các app).
- **Mỗi app mở API quản trị chuẩn** để cắm vào 9app Console ngay từ ngày đầu.
- **Một bộ khung app** (đăng nhập, nút ‹ 9app, icon, thanh điều hướng, triển khai Docker) để mỗi app mới chỉ làm phần nghiệp vụ.


## Giao diện launcher
Ngày 04/10/2026 launcher 9app.tech có mục "Sắp ra mắt" với icon cho 9lunch (đang xây), 9shop, 9ticket, 9voucher, 9bill, 9payday, 9car, 9fit, 9gift, 9english, 9swap. Bộ icon nằm ở `docs/icon-sap-ra-mat/` (kèm `gen.mjs` sinh icon, thêm cả 9charge). Muốn thêm app vào mục này: sửa `index.html` trên launcher (mục `#soon-wrap`) và thêm tệp `icons/soon-<tên>.svg`.

## Danh sách chờ bổ sung (04/10/2026)
- **9scanner** (yêu cầu của chủ sản phẩm, giống CamScanner): quét tài liệu bằng camera, tự cắt và nắn phẳng, lọc nền trắng, ghép nhiều trang thành PDF, đọc chữ (OCR tiếng Việt), ký, chia sẻ qua Zalo. Đưa vào danh sách chờ, chưa làm.
- **9repair**: giữ chỗ trong danh sách chờ.
- **9swap** nay gồm cả cộng đồng tòa nhà (thay cho 9neighbor).
- Launcher đã có thêm ô 9scanner và 9repair trong mục "Sắp ra mắt".

## Nghiên cứu từ ứng dụng phổ biến ở Việt Nam, góc nhìn gia đình 30 đến 50 tuổi (04/10/2026)
**Giới hạn:** không lấy được bảng xếp hạng sống của Google Play và App Store (bảng động, không có API công khai, trang Sensor Tower cần đăng nhập). Dưới đây là số liệu tổng hợp từ báo cáo và bài báo tra cứu được; chưa đối chiếu bản gốc.

**Số liệu chính:**
- Người Việt dùng smartphone trung bình 7,3 giờ mỗi ngày; nhắn tin chiếm khoảng 28% thời gian dùng ứng dụng; mạng xã hội khoảng 3,1 giờ mỗi ngày.
- Tỷ lệ dùng (một nguồn năm 2026): Zalo 98%, Facebook 91%, Messenger 88%, TikTok 82%, YouTube 71%; tiếp theo trong top 10 là Shopee, Google Maps, Grab, Instagram, MoMo.
- Việt Nam có khoảng 2,88 tỷ lượt tải năm 2025; game là danh mục nhiều lượt tải nhất (1,29 tỷ); ứng dụng AI và phim ngắn đang tăng nhanh (AI Hay do người Việt làm nằm trong top 5 ứng dụng AI theo lượt tải và người dùng).
- Ví điện tử: MoMo dẫn đầu (xâm nhập khoảng 64%), ZaloPay khoảng 43%, VNPAY đứng sau.
- Trẻ em Việt dùng nhiều nhất Zalo (khoảng 26%), YouTube (16%), TikTok (11%) theo một báo cáo Kaspersky.
- Phụ huynh có con đi học buộc phải dùng sổ liên lạc điện tử (VnEdu, SMAS, EnetViet) và nhóm Zalo lớp; ứng dụng trông trẻ, giúp việc (Nounou, Kiddicare, bTaskee) và kiểm soát của phụ huynh (Hakinet, Qustodio) cũng phổ biến.

**Nhận định:** gia đình điều phối mọi thứ qua Zalo, thanh toán bằng QR và ví, mua sắm Shopee, di chuyển bằng Grab và Maps, con học qua nhiều app của từng trường. Chỗ trống: một nơi gom việc nhà, việc con học và tiền bạc có cấu trúc thay cho các nhóm chat lộn xộn.

**Ý tưởng rút ra:** 9family (trung tâm gia đình: lịch chung đón con, họp phụ huynh, tiêm chủng, học phí; việc nhà; mua sắm; chia việc, liên kết Zalo); 9school (gom thông báo trường và nhóm Zalo lớp của nhiều con, nhắc học phí, lịch thi, họp; nhập bằng chụp ảnh tin nhắn vì không có API); 9pickup (phân công ai đón con hôm nay, nhắc giờ, báo đã đón); trợ lý AI tiếng Việt cho gia đình biết lịch và chi tiêu của nhà; 9Fin chế độ gia đình (vợ chồng chung sổ); 9scam và 9elder ưu tiên cao vì ông bà dùng Zalo và Facebook nhiều và hay bị lừa; cân nhắc 9learn kids (tiếng Anh cho bé có phần theo dõi cho phụ huynh).

### 9family (thảo luận kỹ ngày 04/10/2026, chủ sản phẩm chọn hướng "lịch học và đón con")
**Gộp một app:** 9family gồm các mô-đun Lịch, Đón con, Trường học (ý 9school), Việc nhà (ý 9chore), Bảng tin; không tách thành nhiều app rời.

**Nhu cầu cốt lõi:** cả nhà phải biết hôm nay con học gì, ai đưa, ai đón, cần mang gì, khi nào họp, khi nào đóng tiền. Hiện việc này nằm rải rác trong nhóm Zalo, sổ liên lạc điện tử của từng trường và trí nhớ của mẹ.

**Mô-đun:**
- Hồ sơ gia đình: các vai (bố, mẹ, ông, bà, người đón hộ, giúp việc), hồ sơ từng con (trường, lớp, năm học). Mời qua link Zalo. Con có chế độ xem đơn giản.
- Lịch học: thời khóa biểu trường, học thêm, năng khiếu, thi, họp phụ huynh, nghỉ lễ theo lịch năm học; nhập bằng **chụp ảnh thời khóa biểu hoặc thông báo rồi AI đọc** thành lịch lặp theo tuần; xuất lịch ICS cho Google hoặc Apple Calendar.
- Đón con và đưa con: lịch mặc định ai đưa ai đón theo thứ; đổi ca một chạm ("hôm nay mẹ họp, nhờ bố hoặc ông"); nhắc theo giờ và thời gian đường đi; nút "Đã đón" báo cho cả nhà; nếu chưa ai nhận thì nhắc leo thang từ người thứ nhất, người thứ hai rồi cả nhà; người đón hộ ngoài gia đình kèm thông tin xác nhận; nhắc đồ cần mang (thứ Hai giày thể dục, thứ Sáu đồng phục).
- Tiền liên quan con: học phí, khoản thu, quỹ lớp (nối 9quy), tự ghi sang 9Fin.
- Sự kiện gia đình: sinh nhật, giỗ chạp, rằm, mùng 1 theo **âm lịch** (dùng lại phần lịch của Vạn Niên), Tết, thăm ông bà.
- Bảng tin gia đình và việc nhà: ghi chú nhanh, "tối nay ai nấu cơm" (dùng lại bình chọn của 9lunch), chia việc nhà, danh sách đi chợ.
- **Sức khỏe gia đình** (giai đoạn sau, nhạy cảm): tiêm chủng, khám định kỳ, thuốc; **theo dõi tăng trưởng của con** (chiều cao, cân nặng theo chuẩn WHO, thực đơn ăn dặm; trước là ý 9growth); **huyết áp, đường huyết và nhắc thuốc cho ông bà, cha mẹ** kèm báo cáo gửi con cái hoặc bác sĩ (trước là ý 9blood).

**Điểm khác biệt:** bản địa (Zalo, âm lịch, năm học và thời khóa biểu Việt Nam, học thêm), AI đọc ảnh thay cho việc nhập tay, xử lý ca đón con có nhiều người, dùng lại thông báo Zalo ZNS đã có ở 9Ship và 9Sport để nhắc ông bà không cài app.

**Kết nối và dữ liệu:** ICS (Google/Apple Calendar), âm lịch (Vạn Niên), thời tiết (mưa thì nhắc áo mưa), thời gian di chuyển (Google Maps hoặc Goong), Zalo OA và ZNS; sổ liên lạc điện tử của trường không có API công khai nên chỉ nhận qua ảnh chụp.

**Doanh thu:** freemium (gia đình đông con, nhiều lịch, lưu trữ lâu); trường và trung tâm học thêm trả phí để đẩy lịch và thông báo thẳng vào app phụ huynh; affiliate đồ dùng học tập qua 9shop; dẫn khách bảo hiểm trẻ em (cẩn thận). Không quảng cáo.

**Rủi ro và pháp lý:** cần cả nhà dùng (ông bà ngại cài app nên dùng Zalo OA); an toàn trẻ: app chỉ điều phối, không thay trường xác nhận người đón; dữ liệu trẻ em và ảnh con là dữ liệu cá nhân nhạy cảm (cần đồng ý của cha mẹ, mã hóa, cho xóa; cần luật sư xem Nghị định 13/2023); lịch nghỉ lễ và năm học khác nhau theo tỉnh; nhắc sai có thể gây phiền nên phải rõ là hỗ trợ.

**Lộ trình:** 1) hồ sơ gia đình, con, lịch tuần (nhập tay hoặc ảnh), nhắc, ICS; 2) lịch đón và đưa, đổi ca, "đã đón", nhắc leo thang; 3) sự kiện: họp phụ huynh, thi, học phí, âm lịch, giỗ; 4) Zalo OA cho ông bà; 5) nhập thông báo trường qua ảnh; 6) việc nhà, bảng tin, mua sắm; 7) y tế; 8) bản cho trường và trung tâm học thêm.

### 9Fin chế độ gia đình (thảo luận ngày 04/10/2026)
- Một "gia đình" có hai vai chính (vợ chồng) cùng sổ chung, quyền xem riêng và chung: ví cá nhân, ví chung; khoản chi riêng tư có thể ẩn (quà bất ngờ).
- "Hũ" chung: tiền chợ, học phí, hiếu hỉ, biếu bố mẹ hai bên (khoản rất Việt Nam); ngân sách tháng chung, hóa đơn chung (nối 9bill), mục tiêu chung (mua nhà, xe, học phí con, quỹ khẩn cấp).
- Giao dịch gắn người chi; tự nhận biết chuyển tiền giữa hai vợ chồng để không tính là chi; nhập sao kê từ ảnh của cả hai (đã có sẵn); báo cáo gia đình mỗi tháng; tiền tiêu vặt và mục tiêu tiết kiệm của con.
- Kết nối: 9family (học phí sang chi phí), 9payday (lương hai người vào hũ), 9gift (mừng cưới, hiếu hỉ).
- **Việc lớn về kỹ thuật:** hiện 9Fin chỉ có một chủ sổ, đăng nhập bằng mật khẩu. Chế độ gia đình cần tài khoản riêng từng người, vai trò, sổ dùng chung và di chuyển dữ liệu cũ an toàn. Nên làm cùng lúc với dịch vụ tài khoản chung của hệ 9app (xem mục "Việc dùng chung").

## Đợt ý tưởng bổ sung 2 (04/10/2026, 1 đến 2 câu mỗi ý)
**Gia đình có con:** 9homework (chụp bài toán, AI giải thích từng bước theo sách giáo khoa Việt Nam để phụ huynh dạy con, không chép đáp án); 9summer (tìm lớp hè, học thêm, trại hè quanh nhà, so giá, đánh giá của phụ huynh); 9growth (đã gộp vào 9family, mục Sức khỏe gia đình); 9allowance (tiền tiêu vặt và nhiệm vụ của con).
**Người lớn tuổi và sức khỏe mạn tính:** 9blood (đã gộp vào 9family, mục Sức khỏe gia đình); 9clinic (đặt lịch khám, lấy số, nhắc lịch, lưu ảnh hồ sơ bệnh án); 9senior (CLB dưỡng sinh, đi bộ, cờ tướng cho người cao tuổi).
**Tiền và tài sản kiểu Việt Nam:** 9insure (quản lý mọi hợp đồng bảo hiểm của cả nhà, nhắc đóng phí, tổng quyền lợi, đọc hợp đồng từ ảnh); 9savings (các sổ tiết kiệm ở nhiều ngân hàng, ngày đáo hạn, nhắc tất toán hoặc tái tục, so lãi suất); 9gold (theo dõi vàng tích trữ, giá SJC, lãi lỗ); 9tet (mùa Tết: việc cần làm, ngân sách, mua sắm, sổ lì xì và quà biếu, lịch về quê, vé xe; chiến dịch theo mùa kéo người dùng vào các app khác).
**Cửa hàng nhỏ và dạy thêm (B2B nhẹ):** 9store (sổ bán hàng siêu nhẹ cho tạp hóa: ghi bán, nợ khách, tồn kho, QR thu tiền, nhắc nợ qua Zalo); 9booking (đặt lịch cho tiệm tóc, nail, spa, gara nhỏ; nhắc khách qua Zalo); 9tutor (giáo viên dạy kèm tại nhà: danh sách học sinh, điểm danh, thu học phí QR, gửi nhận xét cho phụ huynh, nối 9family); 9club (CLB, hội đồng hương, họp lớp: sự kiện, quỹ, thông báo; mở rộng từ 9quy và 9Sport).
**Học và thi:** 9exam (ôn thi THPT, IELTS: ngân hàng đề, chấm bài viết và nói bằng AI; có thể gộp vào app tiếng Anh).
**Nông thôn:** 9farm (nhật ký mùa vụ, nhắc bón phun, giá nông sản, thời tiết, bán qua Zalo).

### 9tutor: app gia sư (thảo luận kỹ ngày 04/10/2026)
**Hai sản phẩm trong một:** (A) công cụ quản lý cho gia sư và lớp học thêm nhỏ (lớp, điểm danh, thu học phí QR, nhận xét, báo cáo cho phụ huynh); (B) sàn tìm gia sư. **Đề xuất làm A trước, B sau**: có công cụ thì gia sư mới ở lại, rồi gia sư đã có trong hệ thống trở thành nguồn cho sàn; tránh bài toán gà và trứng, tránh giữ tiền.

**Thị trường (tra cứu):** có TuTo (bản đồ), Edubox, GiasuHome, giasuonline, Daykemtainha, Việc làm 123, cùng các trung tâm gia sư thu phí giới thiệu và nhóm Facebook, Zalo miễn phí. Họ chủ yếu lo khâu *kết nối*; khâu *sau khi kết nối* (lịch, điểm danh, thu tiền, nhận xét, an toàn) còn bỏ ngỏ.

**Tính năng:**
- Phụ huynh: tìm theo môn, lớp, khu vực, lịch, giá; hồ sơ xác minh (căn cước, thẻ sinh viên hoặc bằng cấp, video giới thiệu ngắn); đánh giá thật chỉ từ phụ huynh đã học; học thử; lịch tự vào 9family; trả học phí theo buổi hoặc tháng bằng QR; nhận xét và ảnh bài sau mỗi buổi; báo cáo tiến bộ tháng do AI tóm tắt; an toàn: gia sư bấm "đã đến" và "đã về", lịch chia sẻ cả nhà.
- Gia sư: hồ sơ và lịch rảnh, quản lý nhiều học sinh, điểm danh một chạm, nhận xét nhanh, giao bài, thu học phí và nhắc phụ huynh, báo cáo thu nhập, kho tài liệu, link học online (Zoom hoặc Meet).
- Lớp nhóm nhỏ: thời khóa biểu, thu học phí tháng, thông báo qua Zalo.
- AI: ghép gia sư và học sinh theo mục tiêu, soạn nhận xét, kế hoạch ôn tập, chấm bài mẫu; trợ lý giải bài có giám sát (nối 9homework).
- Nối: 9family, 9Fin (học phí), 9exam, 9tax (gia sư tự do).

**Pháp lý (tra cứu, cần luật sư xác nhận):** Thông tư 29/2024/TT-BGDĐT (hiệu lực 14/02/2025) coi gia sư là hoạt động dạy thêm; tổ chức hay cá nhân dạy thêm có thu tiền ngoài nhà trường phải đăng ký kinh doanh theo quy định (có tranh luận về sinh viên làm gia sư). **Giáo viên trường công lập không được đăng ký kinh doanh dạy thêm hay quản lý trung tâm**, chỉ được dạy với tư cách người lao động của cơ sở hợp pháp và phải báo hiệu trưởng. Do đó app phải: cho gia sư tự khai tình trạng (sinh viên, giáo viên công, khác), cảnh báo trách nhiệm, không hỗ trợ giáo viên công đăng ký như đơn vị kinh doanh. Cần kiểm chứng thêm nghĩa vụ thuế của nền tảng với người cung cấp dịch vụ.

**An toàn trẻ em:** dạy tại nhà là rủi ro: xác minh danh tính, quy tắc ứng xử, nút báo cáo, khóa tài khoản vi phạm, khuyến nghị có người lớn ở nhà; ảnh và dữ liệu của trẻ là dữ liệu cá nhân nhạy cảm.

**Doanh thu:** thu phí **phần mềm** cho gia sư (gói Pro: nhiều học sinh, báo cáo, tài liệu) thay vì hoa hồng trên mỗi buổi (người dùng ghét phí giới thiệu một tháng lương của trung tâm, và hoa hồng dễ bị né); phụ huynh dùng miễn phí cơ bản, gói báo cáo AI; trung tâm nhỏ trả theo số học sinh. Không giữ tiền: học phí chuyển thẳng cho gia sư bằng QR.

**Rủi ro:** hai phía cần có người cùng lúc; hồ sơ giả; sự cố an toàn làm mất uy tín; gia sư và phụ huynh quay lại ngoài app (cách giữ: tiện ích sau kết nối); nhóm miễn phí trên Facebook và Zalo; chất lượng gia sư không đồng đều; luật dạy thêm có thể đổi.

**Lộ trình:** 1) công cụ cho gia sư (lớp, điểm danh, thu học phí QR, nhắc, nhận xét) và cổng xem cho phụ huynh; 2) link hồ sơ công khai để gia sư tự quảng bá qua Zalo và Facebook; 3) nối 9family; 4) tìm gia sư theo khu vực nhỏ có xác minh và đánh giá; 5) AI ghép và báo cáo tiến bộ; 6) lớp online và trung tâm nhỏ; 7) mở rộng khu vực.

## Quyết định gộp (04/10/2026)
Chủ sản phẩm quyết: **9growth và 9blood gộp vào 9family** làm mô-đun "Sức khỏe gia đình" (tăng trưởng của trẻ; huyết áp, đường huyết, nhắc thuốc cho người lớn tuổi). Không làm hai app riêng.

## Đợt ý tưởng bổ sung 3 (04/10/2026, 1 đến 2 câu mỗi ý)
- **9license**: ôn thi bằng lái xe (A1, B, C): bộ câu hỏi lý thuyết, mô phỏng tình huống, đếm ngược ngày thi, nhắc đổi bằng; nối 9car. Nhu cầu lớn và rõ.
- **9invite**: thiệp và trang sự kiện (cưới, sinh nhật, tân gia): bản đồ, xác nhận tham dự, QR mừng cưới; nối 9gift.
- **9build**: sửa nhà và xây nhà: tìm thợ, so báo giá nhà thầu, nhật ký thi công có ảnh, theo dõi chi phí và thanh toán theo đợt.
- **9court**: đặt sân thể thao (cầu lông, pickleball, bóng đá): xem sân trống, giá, đặt cọc; mở rộng 9Sport.
- **9run**: chạy bộ: kế hoạch 5K đến 21K, đăng ký giải chạy, lịch sử, nhóm chạy; nối 9fit.
- **9checklist**: kho danh sách việc cần làm theo dịp (du lịch, chuyển nhà, sinh em bé, mua nhà, đi nước ngoài); cộng đồng chia sẻ mẫu.
- **9camp**: dã ngoại và cắm trại gia đình: địa điểm, danh sách đồ, thời tiết, chia việc.
- **9voice**: ghi âm cuộc họp hoặc cuộc gọi, AI tóm tắt thành biên bản tiếng Việt và việc cần làm.
- **9memo**: ghi chú bằng giọng nói, tự phân loại thành việc, hóa đơn, ý tưởng, nhắc hẹn.
- **9sign**: ký tài liệu điện tử và đóng dấu ảnh chữ ký; đi cùng 9scanner.
- **9photo**: in ảnh và photobook, album năm; nối 9album.
- **9move**: chuyển nhà và vận chuyển nhỏ, báo giá theo khối lượng; nối 9Ship.
- **9loan**: tính khoản vay mua nhà hoặc xe, so sánh gói vay (dẫn khách cho ngân hàng, cần cân nhắc quy định).
- **9land**: tra cứu thông tin quy hoạch và giá đất công khai (nhu cầu lớn, rủi ro dữ liệu và pháp lý cao).

## Đợt ý tưởng bổ sung 4 (04/10/2026, 1 đến 2 câu mỗi ý)
Chủ sản phẩm đã đánh dấu "ok" cho **9license** (ôn thi bằng lái xe).
- **9khan** (chủ sản phẩm gọi là **9vankhan**, đã chọn "ok"; dùng tên 9vankhan như ngoại lệ có chủ ý cho tên tiếng Việt): văn khấn và lịch cúng theo dịp (rằm, mùng 1, giỗ, tân gia, khai trương), có âm lịch và chuẩn bị lễ; mở rộng tự nhiên từ Vạn Niên.
- **9name**: đặt tên cho con: ý nghĩa, hợp tuổi bố mẹ, không trùng quá nhiều, nghe thử cả tên đệm.
- **9perks**: nhập các thẻ ngân hàng đang có để biết ưu đãi và hoàn tiền phù hợp lúc mua (ăn uống, đi lại, mua sắm); nối 9voucher và 9shop.
- **9farewell**: lo việc hiếu: danh sách việc cần làm, phân công trong nhà, thông báo, sổ phúng viếng và nhận phúng điếu bằng QR. Cần giọng điệu rất cẩn trọng.
- **9energy**: theo dõi tiền điện (bậc thang), mẹo tiết kiệm, tính hoàn vốn điện mặt trời mái nhà.
- **9campus**: sinh viên: thời khóa biểu, deadline, nhóm học, tài liệu, quán rẻ quanh trường.
- **9automate**: dành cho người rành công nghệ: quy tắc "nếu thì" nối các app 9app với Zalo và webhook.
- **9clip**: lưu link và bài đọc để đọc sau, AI tóm tắt tiếng Việt, gom theo chủ đề.
- **9nurse**: đặt điều dưỡng hoặc người chăm sóc tại nhà cho người cao tuổi; nối 9elder.
- **9lost**: đồ thất lạc và thú cưng đi lạc trong khu vực; nối 9neighbor.
- **9green**: phân loại rác và điểm xanh, lịch thu gom chung cư.
- **9qr**: tạo và quản lý mã QR cá nhân (chuyển khoản, danh thiếp, Wi-Fi, menu), một chỗ dùng chung cho cả hệ.

## Đợt ý tưởng bổ sung 5 (04/10/2026, 1 đến 2 câu mỗi ý)
- **9form**: soạn đơn từ và văn bản bằng AI tiếng Việt (đơn xin nghỉ, hợp đồng thuê nhà, giấy ủy quyền, đơn khiếu nại) rồi xuất PDF; chỉ mẫu thông dụng, ghi rõ không thay luật sư.
- **9idphoto**: chụp ảnh thẻ chuẩn hồ sơ (3x4, 4x6, nền trắng hoặc xanh), tự cắt nền, đặt in tại tiệm gần nhà; đi cùng 9thutuc và 9scanner.
- **9charity**: quyên góp từ thiện cho nhóm nhỏ một cách minh bạch: QR, sổ công khai từng khoản thu và chi, biên nhận. Cần xem quy định về huy động tài trợ.
- **9luckyday**: xem ngày tốt cho việc lớn (cưới hỏi, nhập trạch, khai trương, mua xe) theo tuổi gia chủ; mở rộng từ Vạn Niên.
- **9sim**: quản lý các SIM và gói cước: nhắc gia hạn, theo dõi dung lượng, so sánh gói của Viettel, VinaPhone, MobiFone; nạp tiền qua 9bill.
- **9hire**: tuyển người nhanh cho quán và cửa hàng nhỏ: đăng tin, nhận hồ sơ qua Zalo, hẹn phỏng vấn.
- **9debt**: sổ cho vay mượn tiền và đồ giữa bạn bè, nhắc khéo, QR trả nợ; nối 9split.
- **9ask**: hỏi đáp tiếng Việt với AI và chuyên gia đã xác minh (luật, thuế, sức khỏe), trả phí theo câu; cần xem kỹ pháp lý.
- **9tools**: bộ máy tính đời sống một chỗ (lãi vay, lương Gross Net, BMI, đổi tiền, chia hóa đơn); dễ được tìm thấy qua tìm kiếm và dẫn người dùng vào hệ.
- **9pdf**: tiện ích tài liệu: ghép, tách, nén PDF, ảnh thành PDF; đi cùng 9scanner.
- **9mamco**: mâm cúng và mâm cỗ: danh sách đồ lễ, đi chợ, công thức, tính ngân sách; nối 9vankhan và 9tet.

## Đợt ý tưởng bổ sung 6 (04/10/2026, 1 đến 2 câu mỗi ý)
Chủ sản phẩm đã đánh dấu "ok" cho **9mamco** và **9hire**.
- **9driver**: sổ thu chi cho tài xế công nghệ và shipper: nhập thu nhập từng ngày, chi phí xăng và bảo dưỡng, tính lãi thật mỗi giờ, nhắc thuế và bảo hiểm; nhóm người dùng rất đông và ít app phục vụ riêng.
- **9enroll**: tuyển sinh đầu cấp (mầm non, lớp 1, lớp 6, lớp 10): tra cứu tuyến sinh, lịch nộp hồ sơ, giấy tờ cần, đánh giá trường của phụ huynh; nhu cầu rất mạnh theo mùa.
- **9guide**: hướng dẫn từng bước dùng điện thoại cho ông bà (cài VNeID, gọi video, chuyển khoản, nhận QR): con cháu gửi một "bài hướng dẫn" ngắn, ông bà làm theo; nối 9elder.
- **9mom**: mẹ bầu và sau sinh: theo dõi thai kỳ theo tuần, lịch khám thai, đếm cử động thai, đồ cần chuẩn bị, tiêm phòng; dữ liệu rất nhạy cảm, nối 9family.
- **9condo**: cư dân chung cư: đóng phí quản lý, đăng ký tiện ích (phòng gym, BBQ), đăng ký xe, thông báo ban quản lý, phản ánh sự cố; ban quản lý trả phí; gộp ý 9neighbor và 9swap.
- **9eat**: sổ quán ngon của bạn: lưu quán, món ngon, giá, chia sẻ với nhóm; dùng chung kho quán với 9lunch.
- **9bazaar**: đi chợ hộ trong khu phố: đặt rau thịt từ chợ truyền thống và tạp hóa gần nhà, giao trong tòa nhà.
- **9volunteer**: kết nối tình nguyện viên với sự kiện thiện nguyện, điểm danh, giờ đóng góp; đi cùng 9charity.
- **9scholar**: tìm học bổng và du học: hạn nộp hồ sơ, điều kiện, danh sách giấy tờ, nhắc việc.
- **9talk**: luyện nói tiếng Anh với AI theo tình huống đời thường và công việc; có thể gộp vào app tiếng Anh.

## Gộp bớt app: 9vankhan, 9mamco vào Vạn Niên + công cụ tìm kiếm (04/10/2026)

Chủ sản phẩm: "Không nên nhiều app quá." Quyết định:
- 9vankhan (văn khấn) và 9mamco (mâm cúng/mâm cỗ) **không làm app riêng**, thành 2 mô-đun của Vạn Niên. 9luckyday (chọn ngày tốt) cũng thuộc Vạn Niên. Tên 9vankhan không còn dùng.
- Nguyên tắc: ý tưởng cùng nhóm người dùng/ngữ cảnh thì gộp thành mô-đun (9cafe→9lunch, 9growth/9blood→9family, 9neighbor→9swap, 9charge→9car, 9vankhan/9mamco→Vạn Niên).
- **Tìm kiếm ở launcher theo chức năng**: gõ "văn khấn" ra kết quả "Vạn Niên › Văn khấn" và mở thẳng chức năng đó.

Thiết kế tìm kiếm (chưa làm):
- Mỗi app khai báo danh sách chức năng trong `js/apps.js`: `features: [{ name, keywords, path }]`, ví dụ Vạn Niên: Văn khấn (`#/van-khan`, từ khóa: cúng, khấn, giỗ, rằm, mùng 1, tân gia), Mâm cúng (`#/mam-cung`), Chọn ngày tốt, Lịch âm.
- `matchesSearch` hiện chỉ xét tên + mô tả + nhóm; mở rộng so khớp theo tên chức năng và từ khóa (bỏ dấu, đã có `fold`), chức năng khớp xếp trước, hiển thị dưới dạng dòng "Tên app › chức năng" kèm icon app.
- Mở bằng deep link: URL app + `path`. Mỗi app cần định tuyến hash (#/...) cho chức năng đó.
- Về sau app tự đăng ký chức năng qua Console để khỏi sửa tay launcher.
- Việc cần làm trước khi gộp: Vạn Niên phải có router theo đường dẫn cho từng mô-đun.

## 9family: thực đơn tuần + đi chợ một lần (04/10/2026, yêu cầu của chủ sản phẩm)

- Gợi ý món cho cả tuần (theo số người, ngân sách, món kỵ/dị ứng, mùa, món đã ăn tuần trước để không lặp).
- Chọn món → tự gộp nguyên liệu thành **danh sách đi chợ** (cộng dồn cùng loại, trừ đồ đã có trong nhà), nhóm theo khu quầy: thịt cá, rau củ, đồ khô, gia vị.
- Đi siêu thị/chợ: **tích từng món đã mua** để khỏi sót; chia sẻ danh sách cho vợ/chồng cùng tích theo thời gian thực; thêm món lẻ ngoài thực đơn.
- Liên kết: ước tính chi phí tuần → 9Fin chế độ gia đình; 9lunch/mâm cúng dùng chung kho nguyên liệu.
- Trạng thái: chưa nằm trong MVP đang xây, làm thành mô-đun tiếp theo của 9family.

## Đợt ý tưởng 7 (04/10/2026), ưu tiên làm mô-đun, hạn chế app mới

1. **9pet** (mô-đun của 9family): lịch tiêm, tẩy giun, cân nặng, thức ăn của thú cưng.
2. **9wardrobe** (có thể vào 9swap): tủ đồ số, gợi ý phối đồ, đồ lâu không mặc đem thanh lý.
3. **9fridge** (mô-đun 9family): đồ trong tủ lạnh, hạn dùng, nhắc dùng trước, gợi ý món từ đồ còn.
4. **9trip**: lịch trình chuyến đi gia đình/nhóm, chia chi phí, checklist đồ mang; nối 9ticket.
5. **9contract** (mô-đun 9license): hạn hợp đồng thuê nhà, bảo hành đồ điện, nhắc gia hạn.
6. **9habit**: thói quen hằng ngày/streak, hợp với 9fit; nhắc nhẹ, không spam.
7. **9wish**: danh sách quà/mong muốn chia sẻ cho sinh nhật, cưới hỏi; người khác bấm "đã mua" tránh trùng.
8. **9gift** (có thể gộp 9wish): nhắc sinh nhật, ngày giỗ, phong bì mừng cưới hiếu hỉ đã chi/nhận (sổ lễ).
9. **9book** (sách/đọc): giá sách, sách cho mượn, nhắc đòi; ghi chú trích dẫn.
10. **9drive** (mô-đun 9car): sổ chạy xe, chi phí xăng/gửi xe/phạt nguội cho cả nhà.

## Quyết định gộp 9driver (04/10/2026)
9driver không làm app riêng: thành chế độ "tài xế/shipper" của 9Fin cộng sổ chạy xe của 9car (trùng ý 9drive). Chưa làm.

## Đợt ý tưởng 8 (04/10/2026), ưu tiên mô-đun
1. **9deal** (mô-đun 9voucher): theo dõi giá sản phẩm bạn quan tâm trên Shopee/Tiki/siêu thị, báo khi giảm.
2. **9sub**: quản lý các gói đăng ký định kỳ (Netflix, Spotify, iCloud, gym, bảo hiểm): tổng chi mỗi tháng, nhắc trước kỳ gia hạn để hủy kịp. Nối 9Fin, 9chung.
3. **9kid** (mô-đun 9family): việc nhà và tiền tiêu vặt cho con, bé làm việc nhận điểm đổi thưởng, bố mẹ duyệt.
4. **9parking**: nhớ chỗ đỗ xe ở hầm chung cư/trung tâm thương mại (ảnh, tầng, ô), tính phí gửi. Mô-đun 9car.
5. **9queue** : lấy số và theo dõi hàng đợi phòng khám, hành chính; báo khi sắp đến lượt. Cần đối tác, để sau.
6. **9recipe** (mô-đun 9family): sổ công thức của nhà, lưu từ link/ảnh, tự quy ra nguyên liệu đi chợ; nối thực đơn tuần.
7. **9warranty** (mô-đun 9license): chụp hóa đơn đồ điện tử, tự nhắc hạn bảo hành và gợi ý trung tâm bảo hành.
8. **9event**: tổ chức họp lớp, tiệc cưới, sinh nhật: mời, RSVP, chia tiền, sơ đồ bàn, phong bì. Gộp 9gift.
9. **9senior-care** (mô-đun 9family/9elder): nhắc thuốc, báo tin khi cha mẹ lâu không mở app, nút gọi khẩn cấp.
10. **9sleep**: nhật ký giấc ngủ, nhắc đi ngủ, cà phê cuối cùng trong ngày. Mô-đun 9fit.
11. **9moving**: chuyển nhà/thuê nhà: checklist đổi địa chỉ (điện, nước, internet, giấy tờ), tìm đơn vị chuyển; nối 9neighbor.
12. **9hobby**: nhóm sở thích địa phương (chạy bộ, cầu lông, chụp ảnh): hẹn buổi chơi, chia sân; nối 9Sport.

## Đợt ý tưởng 9 (04/10/2026), góc làm việc, tiền, giấy tờ và sức khỏe tinh thần
1. **9freelance**: người làm tự do: báo giá, hợp đồng mẫu, hóa đơn, nhắc đòi tiền, theo dõi khách nợ; nối 9Fin và 9bill.
2. **9invoice** (mô-đun 9freelance/9shop): xuất hóa đơn, phiếu thu gọn cho tiểu thương và cửa hàng nhỏ, gửi qua Zalo kèm QR.
3. **9cv** (mô-đun 9hire/9interview): tạo CV từ thông tin có sẵn, nhiều mẫu, xuất PDF, chỉnh theo từng tin tuyển dụng.
4. **9note**: ghi chú giọng nói tiếng Việt, tự chép thành văn bản và tóm tắt; nối 9scanner cho ảnh/tài liệu.
5. **9docs** (mô-đun 9scanner): kho giấy tờ cá nhân và gia đình (CCCD, sổ đỏ, bảo hiểm, bằng lái): chụp, mã hóa, chia sẻ tạm cho người cần xem.
6. **9mind**: nhật ký tâm trạng, hít thở 3 phút, nhắc nghỉ; dữ liệu nhạy cảm, lưu cục bộ. Mô-đun 9fit.
7. **9quit**: bỏ thuốc lá/rượu bia: đếm ngày, tiền tiết kiệm được, lúc thèm bấm nút xem lý do. Mô-đun 9fit.
8. **9water** (mô-đun 9fit): nhắc uống nước, ghi nhanh một chạm.
9. **9split** (mô-đun 9chung/9bill): chia hóa đơn đi ăn nhóm bằng ảnh hóa đơn, mỗi người chọn món của mình, ra QR trả tiền cho từng người.
10. **9trust**: kiểm tra lừa đảo: dán số tài khoản/số điện thoại/link/tin nhắn, kiểm tra theo cơ sở báo cáo lừa đảo và AI nhận dạng kiểu lừa; rất hợp ông bà. Nối 9guide.
11. **9carbon**: tiết kiệm điện nước nhà: chụp số công tơ mỗi tháng, so với tháng trước và hàng xóm cùng loại nhà, báo bất thường. Nối 9bill.
12. **9alarm**: báo giờ cao điểm kẹt xe/mưa ngập theo tuyến đi làm quen thuộc, gợi ý giờ xuất phát. Nối 9speed.

## Đợt ý tưởng 10 (04/10/2026), góc cộng đồng, địa phương, học và sáng tạo
1. **9market**: chợ nhỏ địa phương: nông sản, đồ ăn nhà làm, đặt trước theo đợt, nhận ở điểm hẹn trong khu; nối 9swap, 9condo.
2. **9helper**: việc vặt trong nhà: dọn dẹp, sửa điện nước, giữ trẻ theo giờ; báo giá rõ, đánh giá hai chiều. Gộp 9repair.
3. **9flashcard** (mô-đun 9english): thẻ từ vựng lặp lại ngắt quãng, tự tạo từ câu bạn gặp ngoài đời qua ảnh chụp.
4. **9exam** (mô-đun 9family/9tutor): ôn thi vào lớp 10, THPT: ngân hàng đề, chấm điểm, phân tích điểm yếu, lịch ôn.
5. **9skill**: học kỹ năng ngắn 10 phút mỗi ngày (Excel, viết email, thuyết trình) cho dân văn phòng, có bài tập thật.
6. **9photo**: dọn ảnh trong điện thoại: tìm ảnh trùng/mờ, gom album theo sự kiện, in ảnh album gia đình. Nối 9family.
7. **9memory** (mô-đun 9family/Gia phả): kể chuyện đời ông bà bằng giọng nói, ghi âm kèm ảnh, lưu thành "cuốn hồi ký".
8. **9wedding**: chuẩn bị đám cưới: ngân sách, khách mời, nhà cung cấp, checklist theo mốc; nối 9event, Vạn Niên (chọn ngày).
9. **9newborn** (mô-đun 9mom/9family): sổ em bé sơ sinh: cữ bú, giấc ngủ, thay tã, nhật ký cho hai vợ chồng ghi chung.
10. **9plant**: chăm cây cảnh/vườn ban công: nhắc tưới, chụp bệnh cây nhờ AI chẩn đoán, lịch bón phân theo mùa.
11. **9pray**: lịch lễ đạo cho người theo đạo Phật, Công giáo, Hồi giáo...: ngày lễ, giờ kinh, rằm mùng một; chung nền với Vạn Niên.
12. **9tip**: công việc làm thêm cuối tuần và nhận việc ngắn cho sinh viên, đối tác là các cửa hàng gần đó; nối 9hire.

## Đợt 11: ý tưởng từ app dùng nhiều nhất VN (04/10/2026, cần kiểm chứng)
Nguồn: khảo sát Q&Me 03/2026 (tỷ lệ dùng: Zalo 98%, Facebook 91%, Messenger 88%, TikTok 82%, YouTube 71%, rồi Shopee, Google Maps, Grab, Instagram, MoMo); Adjust/Sensor Tower: VN ~2,9 tỷ lượt tải 2025, game lớn nhất, vi drama ngắn tăng 271% quý 4/2025, app tài chính +21% quý 1/2026 (chứng khoán +36%, crypto +28%), phiên dùng AI nửa đầu 2026 gấp đôi cùng kỳ (ChatGPT, Gemini, AI Hay).
Bài học: người Việt sống trong Zalo, mua sắm, di chuyển, ví, video ngắn, AI. App mới nên nằm trong Zalo/chia sẻ qua Zalo, thao tác ít, có AI.
1. **Mini app Zalo**: đưa 9lunch, 9family, 9bill thành Zalo Mini App hoặc gửi kết quả vào nhóm Zalo (chia tiền, lịch đón con, danh sách đi chợ). Kênh phân phối quan trọng nhất.
2. **9ask** (trợ lý AI tiếng Việt cho đời sống): hỏi thủ tục, thuế, luật giao thông, y tế cơ bản, trả lời kèm nguồn; chuyển thẳng sang chức năng đúng (ăn khớp với tìm kiếm chức năng của launcher). Người dùng AI tăng nhanh.
3. **9stock** (mô-đun 9Fin): sổ danh mục đầu tư cổ phiếu/vàng/gửi tiết kiệm, lãi thực, so lãi suất ngân hàng. Chỉ theo dõi, không môi giới (tránh giấy phép).
4. **9clip**: video ngắn dạy việc nhà, nấu ăn, sửa đồ (kiểu TikTok nhưng thực dụng), gắn với 9recipe và 9helper. Rủi ro: nội dung nặng, làm sau.
5. **9wallet-lite**: gom các QR/ví/ngân hàng thành một màn hình quét nhanh, nhớ tài khoản hay chuyển. Phụ thuộc quy định thanh toán nên chỉ làm phần lưu và tạo QR VietQR.
6. **9map-note** (mô-đun 9speed): ghim quán, chỗ đỗ, chỗ sửa xe trên bản đồ, chia sẻ cho gia đình; thay cho nhắn địa chỉ qua Zalo.
7. **9drama**: không làm, chỉ ghi nhận xu hướng (khó nội dung, bản quyền).

## Đợt ý tưởng 12 (04/10/2026), nỗi đau nhỏ hằng ngày
1. **9remind** (mô-đun 9family): nhắc việc theo ngữ cảnh gia đình: "mai nhớ mang áo mưa cho con", gửi vào Zalo cả hai vợ chồng, ai làm thì tích xong.
2. **9ride-share** (mô-đun 9lunch/9condo): đi chung xe đi làm cùng tòa nhà/công ty, chia xăng và phí gửi xe.
3. **9bill-split-home** (mô-đun 9bill): tiền nhà, điện, nước, wifi cho người ở ghép: ai nợ ai, nhắc đến hạn, QR trả từng người.
4. **9coupon-wallet** (mô-đun 9voucher): ví mã giảm giá từ Zalo, email, tin nhắn; nhắc dùng trước hạn khi đi mua.
5. **9tax** (mô-đun 9payday): quyết toán thuế TNCN: gom chứng từ, tính giảm trừ gia cảnh, nhắc hạn nộp; cần kiểm chứng luật.
6. **9noise**: ghi nhận và báo cáo ồn, rác, đỗ xe sai trong khu dân cư gửi ban quản lý, có ảnh/giờ. Mô-đun 9condo.
7. **9blood** đã vào 9family; **9donate**: quyên góp minh bạch cho nhóm lớp/công ty/khu phố: mục tiêu, sao kê, báo cáo chi.
8. **9lostfound**: thất lạc đồ, thú cưng, giấy tờ trong khu vực, đăng ảnh, khớp tự động bằng AI.
9. **9lend**: sổ cho mượn/vay nhỏ giữa bạn bè, người thân: ghi nợ, nhắc khéo, xác nhận hai bên. Nối 9Fin.
10. **9clinic** (mô-đun 9family): hồ sơ khám bệnh cả nhà: đơn thuốc, kết quả xét nghiệm chụp lại, lịch tái khám, bác sĩ quen.

## Đợt ý tưởng 13 (04/10/2026), người đi làm, nhà trọ, nông thôn, ngành nghề
1. **9shift**: lịch ca làm việc cho công nhân, nhân viên bán hàng, y tá: xem ca, đổi ca với đồng nghiệp, tính công và tăng ca. Rất đông người dùng, ít app đẹp.
2. **9salary** (mô-đun 9shift/9Fin): tính lương thực lĩnh từ công, tăng ca, bảo hiểm, thuế; đối chiếu bảng lương công ty, phát hiện lệch.
3. **9room**: chủ nhà trọ: danh sách phòng, ghi điện nước từng tháng bằng ảnh công tơ, tự tính tiền, gửi QR cho người thuê, nhắc nợ. Mô-đun 9bill ở phía chủ nhà.
4. **9farm**: nông dân: nhật ký vụ mùa, chi phí giống phân thuốc, giá nông sản hôm nay, thời tiết; lãi lỗ theo vụ.
5. **9shop-lite** (mô-đun 9invoice): sổ bán hàng cho tạp hóa: nhập hàng, tồn kho, ghi nợ khách quen, doanh thu ngày. Nhu cầu lớn với hộ kinh doanh, cần chú ý quy định hóa đơn điện tử.
6. **9tool** (mô-đun 9helper): thợ tự do (điện nước, sơn, lắp máy lạnh): lịch hẹn, báo giá, ảnh trước sau, nhận đánh giá.
7. **9class** (mô-đun 9tutor): lớp học thêm/năng khiếu nhỏ: điểm danh, học phí, nhắc phụ huynh, báo nghỉ qua Zalo.
8. **9clinic-pro**: phòng khám nhỏ/nha khoa: lịch hẹn, nhắc tái khám, hồ sơ; nối 9clinic của bệnh nhân.
9. **9team**: nhóm nhỏ 5 đến 20 người (quán, đội thi công, nhóm bán hàng online): giao việc, chấm công, chốt ca, tin nhắn nhóm gọn. Dùng chung nền 9shift.
10. **9sign**: ký hợp đồng và xác nhận bằng OTP/ảnh chụp cho giao dịch nhỏ (cho thuê nhà, mượn tiền, cọc). Lưu bằng chứng; chú ý giá trị pháp lý, cần kiểm chứng.
11. **9route**: lộ trình giao hàng nhiều điểm cho shipper và sale đi thị trường: sắp thứ tự điểm tối ưu, ghi chú từng điểm. Nối 9driver, 9Ship.
12. **9zalo-bot**: thay vì mở app, nhắn Zalo OA để ghi chi tiêu, thêm việc đi chợ, hỏi lịch đón con. Một lớp nhập liệu cho cả hệ 9app.

## Đợt ý tưởng 14 (04/10/2026): đời sống, dễ làm (không cần đối tác/giấy phép/API ngoài, dữ liệu lưu ở máy hoặc DB nhỏ)
Tiêu chí: một màn hình chính, nhập 1 đến 2 chạm, mỗi cái làm được trong vài ngày.
1. **9counter**: đếm và nhắc theo ngày: ngày kỷ niệm, ngày còn lại đến hạn (đáo hạn thẻ, hết hạn visa, ngày nghỉ phép).
2. **9expire**: hạn dùng đồ trong nhà (thuốc, gia vị, mỹ phẩm, giấy tờ): chụp nhãn, nhập ngày, nhắc trước.
3. **9meter**: ghi số điện nước hằng tháng bằng ảnh công tơ, vẽ biểu đồ, báo bất thường. Dùng OCR như 9Fin.
4. **9shoplist**: danh sách đi chợ chia sẻ vợ chồng, tích khi mua, nhớ món hay mua. (Nền cho thực đơn tuần của 9family.)
5. **9split-lite**: chia tiền nhóm bằng tay: nhập người, khoản, ra ai trả ai, QR VietQR. Lõi sẵn có ở 9lunch.
6. **9unit**: đổi đơn vị và quy đổi nấu ăn/xây dựng (chỉ vàng, cây vàng, lượng, mét vuông, hecta, độ C).
7. **9gold**: giá vàng/ngoại tệ hôm nay và máy tính lãi tiền gửi/vay; nguồn công khai, có thể cần bản quyền dữ liệu, kiểm chứng.
8. **9timer**: hẹn giờ nhiều bước: nấu cơm, luộc trứng, tập plank, học bài kiểu pomodoro; chạy nền, báo rung.
9. **9pack**: checklist đồ mang (đi chơi, về quê, sinh con, đi công tác), mẫu có sẵn, dùng lại lần sau.
10. **9wheel**: quay chọn: ăn gì, đi đâu, ai trả tiền, ai rửa chén; vui, dễ lan truyền qua Zalo.
11. **9holiday**: lịch nghỉ lễ năm, ngày cầu nối, gợi ý xin phép bao nhiêu ngày được nghỉ liền nhất; dùng lịch âm của Vạn Niên.
12. **9emergency**: thẻ khẩn cấp trên màn hình khóa: nhóm máu, dị ứng, người liên hệ, số bảo hiểm; chia sẻ QR cho người thân.
Nhận xét: 9counter, 9expire, 9pack, 9holiday, 9emergency, 9wheel có thể là mô-đun "Tiện ích" trong cùng một app để tránh thêm app; 9meter, 9shoplist, 9split-lite đưa về 9bill/9family/9lunch.

## 9race: lịch giải chạy bộ, trail, triathlon/Ironman (yêu cầu của chủ sản phẩm, 04/10/2026)
Yêu cầu: thống kê giải chạy bộ, trail, Ironman trong nước, giải lớn khu vực và thế giới, có link đăng ký bib các giải VN.
- Tên đề xuất **9race** (một từ tiếng Anh). Có thể là mô-đun của 9fit nếu muốn ít app; mình nghiêng làm riêng vì người chạy tìm giải theo lịch, mùa, vùng, khác với tập luyện.
- Dữ liệu mỗi giải: tên, ngày, địa điểm, cự ly (5K/10K/21K/42K, trail 25/50/100K, 70.3, full Ironman), độ cao tích lũy, điểm ITRA/UTMB, cut-off, mở/đóng đăng ký, giá, nhà tổ chức, link đăng ký chính thức, link kết quả, ảnh, huy chương.
- Màn hình: lịch tháng/danh sách, lọc theo cự ly, loại (đường nhựa/trail/tri), vùng (Bắc/Trung/Nam, Đông Nam Á, thế giới), giá, còn bib; bản đồ; "Giải của tôi" (đã đăng ký, nhắc ngày nhận BIB, ngày chạy, tập luyện).
- Nhắc: sắp mở đăng ký (quan trọng nhất vì giải hot hết bib trong vài giờ), hạn chuyển nhượng bib, ngày nhận BIB, thời tiết ngày chạy.
- Nút đăng ký: mở thẳng link nhà tổ chức/nền tảng (chỉ chuyển hướng, không bán hộ nên không vướng thanh toán; sau này có thể có link giới thiệu nếu đối tác đồng ý).
- Giá trị thêm: so sánh giải (độ khó, cut-off), kế hoạch tập 12 tuần tới ngày giải (nối 9fit), nhật ký giải đã chạy (PB, huy chương), chuyển nhượng bib giữa người chạy (rủi ro, ghi chú phía dưới).
- Nguồn dữ liệu: chưa có API công khai chung. Cách thực tế: nhập tay (admin trong Console) cho giải VN, tổng hợp từ trang nhà tổ chức/nền tảng đăng ký; cộng đồng gửi giải (duyệt trước khi hiện); giải quốc tế lấy từ lịch công khai như ITRA/UTMB/World Marathon Majors/Ironman, trích gọn và dẫn link. Cần kiểm tra điều khoản từng trang trước khi cào tự động; mặc định không cào, chỉ nhập và dẫn nguồn.
- Rủi ro: dữ liệu cũ (giải đổi ngày/hủy) nên mỗi giải có "cập nhật lần cuối" và nút báo sai; bản quyền ảnh/logo nhà tổ chức; chuyển nhượng bib thường bị cấm nên chỉ làm bảng tin, không làm sàn.
- MVP: 60 đến 100 giải VN và 30 giải quốc tế nhập tay, lọc, nhắc mở đăng ký, "Giải của tôi", admin nhập qua Console. Làm được nhanh vì không cần API ngoài.

## Chủ sản phẩm ok: 9unit + máy tính bằng giọng nói (04/10/2026)
- **9unit** đã ok. Cùng nhóm "Tiện ích" (xem đợt 14).
- Thêm **máy tính (calculator) điều khiển bằng giọng nói**, đặt trong cùng app Tiện ích với 9unit (không làm app riêng).
- Hướng làm: nói "ba triệu hai trăm nghìn cộng năm mươi nghìn", "mười phần trăm của hai triệu", "ba chỉ vàng bằng bao nhiêu gram", "chia đôi bốn trăm tám mươi nghìn".
- Kỹ thuật: nhận giọng nói bằng Web Speech API (vi-VN) trên trình duyệt; bộ phân tích tiếng Việt tự viết, đổi số chữ thành số (một, mười lăm, hai mươi mốt, trăm, nghìn/ngàn, triệu, tỷ, rưỡi, "hai lẻ năm"), phép toán (cộng, trừ, nhân, chia, phần trăm, bình phương, căn), thêm đổi đơn vị của 9unit. Chạy hoàn toàn trên máy, kết quả hiện cả dạng chữ và số để người dùng soát lại trước khi tin.
- Lưu ý: Web Speech chạy tốt trên Chrome Android; Safari iOS hỗ trợ không đầy đủ và cần mạng (âm thanh gửi cho nhà cung cấp trình duyệt), nên luôn có bàn phím số và ô gõ lời nói làm dự phòng. Dự phòng AI (Gemini) cho câu phức tạp là tùy chọn, tốn chi phí.
- Tách lịch sử tính toán, chia sẻ phép tính ra Zalo, và ghi vào 9Fin ("tiêu 3 triệu 2 ăn uống") là bước sau.

## Nền tảng (04/10/2026): mọi app là webapp/PWA trong 9app.tech
Tiện ích (9unit + máy tính giọng nói) cũng là webapp tại 9app.tech, cài được lên màn hình chính như PWA, không làm app native. Web Speech API vốn chạy trong trình duyệt nên không cản trở.

## Đợt ý tưởng 15 (04/10/2026): thêm công cụ webapp dễ làm, thiên về tiện ích hằng ngày
1. **9qr**: tạo/quét QR: Wi-Fi nhà, danh thiếp, VietQR nhận tiền, link Zalo; lưu thành thẻ để đưa khách.
2. **9text**: công cụ văn bản: đếm chữ, bỏ dấu tiếng Việt, đổi hoa/thường, đọc số thành chữ (cho séc, hợp đồng), mẫu tin nhắn hay gửi.
3. **9date**: tính ngày: cộng/trừ ngày, khoảng cách hai ngày, ngày làm việc, đổi dương/âm, tuổi, tuần thai; chung nền với Vạn Niên.
4. **9loan**: máy tính vay/gửi/trả góp/lãi kép, so sánh hai phương án, bảng trả nợ xuất PDF.
5. **9salary-calc**: lương gross/net theo luật thuế TNCN mới, bảo hiểm; (cần kiểm chứng luật) chung nền 9payday.
6. **9bmi** (mô-đun 9fit): BMI, calo ngày, nhu cầu nước, theo giới tính/tuổi.
7. **9scan-lite**: chụp giấy tờ thành PDF ngay trên trình duyệt (cắt, nắn, đen trắng); bản nhẹ của 9scanner.
8. **9compress**: nén ảnh/PDF để nộp hồ sơ (giới hạn dung lượng của cổng dịch vụ công); xử lý ngay trên máy.
9. **9passport-photo**: cắt ảnh thẻ 3x4, 4x6 theo chuẩn, ghép tờ in; chỉ trên máy.
10. **9read**: đọc to văn bản tiếng Việt, bật chế độ đọc dễ nhìn cho người lớn tuổi; dùng giọng đọc của trình duyệt.
11. **9sign-pdf**: ký tay lên PDF và điền form ngay trên điện thoại.
12. **9countdown-tet**: đếm ngược Tết, lễ; chung nền 9holiday (giúp có lượt truy cập theo mùa).
Gợi ý: tất cả gom vào app **Tiện ích** với tìm kiếm chức năng; xử lý trên máy nên không tốn server và không lo dữ liệu cá nhân (giấy tờ, ảnh).
