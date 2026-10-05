# 9tutor: thiết kế bản đầu (MVP)

Ngày: 04/10/2026. Bối cảnh, thị trường, pháp lý và rủi ro: `docs/y-tuong-app-moi.md` mục "9tutor". Tài liệu này chốt phạm vi bản đầu. Thư mục `D:\9app.tech\tutor\`, cổng 8100, `BASE_PATH=/tutor`.

## Định hướng
Hai sản phẩm trong một (công cụ cho gia sư, sàn kết nối). **Bản đầu chỉ làm công cụ cho gia sư và giáo viên dạy thêm nhỏ**, người dùng chính là gia sư. Có công cụ thì gia sư ở lại, sàn để sau. **Không xử lý thanh toán thật** (học phí chuyển thẳng cho gia sư bằng VietQR), **không môi giới**, không giữ tiền.

## Phạm vi bản đầu (làm)
1. **Tài khoản gia sư ẩn danh.** Không email, không mật khẩu. Tạo tài khoản = nhập tên hiển thị + tự khai tình trạng. Máy chủ cấp cookie phiên `tsid` (HttpOnly, SameSite=Lax, 90 ngày; CSDL chỉ lưu SHA-256). Khôi phục và dùng thiết bị khác:
   - **Mã khôi phục** 25 ký tự (125 bit, dạng `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`), hiện **một lần** khi tạo, đổi được (mã cũ vô hiệu). CSDL chỉ lưu băm. Nhập mã ở màn "Khôi phục" tạo phiên mới trên thiết bị đó.
   - **Liên kết ghép thiết bị**: thiết bị đã đăng nhập tạo mã dùng một lần sống 15 phút (12 ký tự, 60 bit, tối đa 3 mã còn hạn); mở link `…/tutor/#/ghep/<mã>` rồi bấm xác nhận (đổi mã lấy phiên bằng POST, không dùng GET để bộ xem trước link không "đốt" mã). Mã bị đốt sau lần dùng đầu.
   - Danh sách thiết bị, thu hồi từng thiết bị, "đăng xuất các thiết bị khác". Tối đa 8 phiên mỗi tài khoản (phiên cũ nhất bị loại).
   - Giới hạn: 5 tài khoản mới mỗi IP mỗi giờ, 10 lần thử khôi phục/ghép mỗi IP mỗi giờ.
2. **Tự khai tình trạng và pháp lý** (xem mục riêng): sinh viên, giáo viên trường công lập, giáo viên/người dạy khác, khác. Chọn bắt buộc trước khi dùng.
3. **Học sinh**: tên, lớp, môn, phụ huynh (tên, SĐT, số Zalo nếu khác), ghi chú, mô hình học phí (theo buổi / theo tháng / gói N buổi) và mức phí, lưu trữ (ngừng dạy, giữ lịch sử). Tối đa 150 học sinh đang dạy.
4. **Lịch dạy tuần lặp lại** (`slots`): thứ, giờ bắt đầu, thời lượng, nơi dạy, hiệu lực từ ngày. Buổi cụ thể (`lessons`) sinh ra theo yêu cầu khi xem lịch (idempotent, khóa duy nhất `(slot_id, slot_day)`). Ngày hiệu lực có thể lùi tối đa 60 ngày để ghi bù buổi đã dạy; màn Hôm nay sinh bù khoảng trống tối đa 90 ngày về trước. Lưu trữ học sinh thì lịch lặp tạm dừng và chạy lại khi khôi phục. Một buổi không được kéo qua nửa đêm (giới hạn có chủ ý). Thêm buổi lẻ, dời buổi, buổi bù.
5. **Cảnh báo và chặn trùng lịch**: tạo lịch lặp, buổi lẻ, dời buổi đều kiểm tra chồng giờ với mọi buổi chưa hủy và lịch lặp của gia sư đó; trùng thì trả `409 schedule_conflict` kèm danh sách buổi trùng. Dạy nhóm có chủ ý thì gửi `allowOverlap: true` (giao diện hỏi "Vẫn xếp trùng?"). Kiểm tra chạy trong giao dịch khóa hàng gia sư nên hai yêu cầu đồng thời không lách được.
6. **Điểm danh một chạm**: "Đã dạy" (ghi học phí buổi lúc đó, không đổi khi sau này sửa mức phí), "Học sinh nghỉ" (chọn tính phí hay không), "Gia sư hủy" (không bao giờ tính phí). Không điểm danh "đã dạy" cho ngày chưa đến. **Buổi bù**: từ buổi bị hủy hoặc học sinh nghỉ, xếp một buổi bù (mỗi buổi gốc tối đa một buổi bù); theo buổi thì buổi bù tính phí khi dạy, buổi gốc không tính (nếu gia sư chọn không tính).
7. **Nhật ký buổi học**: nội dung, bài tập giao, nhận xét, mức tiếp thu 1 đến 5, ghi chú riêng (không bao giờ ra ngoài tài khoản gia sư).
8. **Học phí**: sổ cái theo học sinh. Còn nợ = Σ học phí các buổi tính phí + Σ khoản thu (`charges`: tháng, gói, khác) − Σ đã thu (`payments`). Âm = trả trước. Gói N buổi: số buổi còn lại = Σ buổi gói đã bán − số buổi gói đã dạy, cảnh báo khi còn ≤ 1. "Tạo học phí tháng" (một học sinh hoặc tất cả học sinh tính tháng, không tạo trùng kỳ). Ghi **đã thu** một chạm ("Thu đủ" do máy chủ tính số còn nợ, hoặc nhập số khác, thu một phần), xóa khoản nhập nhầm.
9. **Nhắc phụ huynh**: tin soạn sẵn lịch sự, sửa được, nút sao chép, mở Zalo (`zalo.me/<số>`), mở SMS (`sms:`), kèm **QR VietQR** (payload EMVCo + CRC16 như 9lunch/9ship, nội dung `9T` + mã học sinh 6 ký tự, không chứa tên) tải được dạng SVG/PNG. Cần gia sư lưu tài khoản nhận tiền.
10. **Báo cáo thu nhập tháng**: phát sinh, đã thu, còn nợ, số buổi và số giờ đã dạy, theo từng học sinh, xu hướng 6 tháng; in / lưu PDF bằng chức năng in của trình duyệt (CSS in).
11. **Liên kết "Báo cáo cho phụ huynh"** (`/tutor/r/<mã>`): trang chỉ xem công khai theo mã ngẫu nhiên 128 bit, không cần đăng nhập, `noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
    - **Chỉ lộ**: tên gia sư, tên + lớp + môn của đúng học sinh đó, lịch 14 ngày tới, các buổi 90 ngày qua (ngày, giờ, trạng thái; nội dung/bài tập/nhận xét/mức tiếp thu nếu bật "hiện nhận xét"), tổng hợp chuyên cần theo tháng. **Tùy chọn (mặc định TẮT)** "hiện học phí và QR": số còn nợ, mức phí, tài khoản nhận tiền và QR.
    - **Không bao giờ lộ**: SĐT phụ huynh, ghi chú riêng, ghi chú học sinh, học sinh khác, mã khôi phục, ID nội bộ.
    - Mỗi học sinh tối đa một link đang hiệu lực; tạo mới thì thu hồi link cũ; thu hồi được bất kỳ lúc nào (link cũ trả 404 ngay); sửa tùy chọn không đổi link. Gia sư thấy số lượt xem và lần xem gần nhất.
12. **Trang giới thiệu gia sư công khai (tùy chọn, mặc định tắt)** (`/tutor/g/<mã>`): tiêu đề ngắn, giới thiệu, môn, cấp lớp, khu vực, giá tham khảo (từ đến), hình thức (tại nhà, online, cả hai), cách liên hệ gia sư tự điền. Có thẻ Open Graph để chia sẻ qua Zalo/Facebook. Không có danh sách tìm kiếm, **không kết nối giáo viên với học sinh tự động**. Tắt = 404. **Bị khóa với tình trạng "giáo viên trường công lập".** Ghi rõ "thông tin do gia sư tự khai, 9tutor không xác minh và không môi giới".
13. **Quyền dữ liệu**: xuất toàn bộ dữ liệu (JSON), xóa tài khoản (xóa cứng mọi thứ, cần gõ xác nhận).
14. **Kết nối 9app Console** (giao thức v1, `9admin/src/contract.js`): `manifest` (id `tutor`, capability `users`, không `money`), `health`, `summary`, `users`, `users/:id`; không trả tên học sinh hay số điện thoại.
15. **Khung 9app**: icon cùng phong cách, nút "‹ 9app", PWA (manifest), sáng/tối, điện thoại là chính, màn rộng hiện tốt.

## Pháp lý dạy thêm: cách app xử lý (CẦN LUẬT SƯ XÁC NHẬN)
Theo ghi chép đã có (Thông tư 29/2024/TT-BGDĐT, hiệu lực 14/02/2025; chưa được kiểm chứng bởi luật sư): dạy thêm có thu tiền ngoài nhà trường là hoạt động kinh doanh phải đăng ký theo quy định (có tranh luận về sinh viên làm gia sư); **giáo viên trường công lập không được tự tổ chức dạy thêm có thu tiền hay đăng ký đơn vị kinh doanh dạy thêm, chỉ được dạy với tư cách người lao động của cơ sở hợp pháp và phải báo hiệu trưởng**. Vì vậy:
- Bắt buộc **tự khai tình trạng**; thay đổi được, có ghi thời điểm.
- **Cần luật sư duyệt câu chữ cảnh báo trước khi ra mắt.** Điều cốt lõi theo ghi chép: giáo viên không dạy thêm có thu tiền cho chính học sinh mình dạy chính khóa. Phạm vi khóa thật chỉ là trang giới thiệu công khai; các công cụ ghi sổ vẫn dùng được, cảnh báo không kiểm tra hộ.
- Giáo viên công lập: hiện **cảnh báo rõ** ở lần chọn và ở màn chính cài đặt; **khóa trang giới thiệu công khai** (máy chủ trả 403, tắt trang nếu đang bật khi đổi sang tình trạng này); app **không** có chức năng "đăng ký kinh doanh" hay hướng dẫn lách. Các công cụ ghi sổ khác vẫn dùng được (là sổ cá nhân), nhưng cảnh báo vẫn hiển thị.
- Sinh viên và người dạy khác: nhắc "kiểm tra quy định đăng ký kinh doanh và nghĩa vụ thuế tại địa phương"; app không tư vấn pháp lý và không tính thuế.
- Tên "học phí" chỉ là sổ ghi của gia sư; app không phải đơn vị cung cấp dịch vụ giáo dục.

## An toàn trẻ em và dữ liệu
Dữ liệu trẻ em là dữ liệu cá nhân nhạy cảm: không lưu ngày sinh, địa chỉ nhà, ảnh; chỉ tên, lớp, môn, ghi chú do gia sư nhập. Link phụ huynh theo nguyên tắc tối thiểu ở trên. Ghi chú riêng không ra ngoài. Quy tắc ứng xử, xác minh danh tính, báo cáo vi phạm thuộc giai đoạn sàn (chưa làm).

## Kiến trúc
- Node 20 ESM, `node:http` (bộ định tuyến sao chép từ 9lunch), PostgreSQL (`pg`), giao diện JS thuần. CSDL riêng `tutor`, vai trò `tutor`, container `9tutor`, `mem_limit 160m`, mạng `9ship_internal` và `ops_tms-network`.
- Mọi bảng dữ liệu có `tutor_id`; **mọi truy vấn lọc theo `tutor_id` của phiên**; id của người khác trả 404 (không phân biệt "không tồn tại" và "không phải của bạn"). Khóa hàng gia sư/học sinh (`FOR UPDATE`) cho thao tác kiểm tra-rồi-ghi (trùng lịch, thu tiền, tạo kỳ học phí, số còn nợ).
- Tiền là số nguyên đồng; máy chủ tính mọi con số (còn nợ, thu đủ, số buổi gói); số từ trình duyệt chỉ là lựa chọn của gia sư và được kiểm khoảng hợp lệ.
- CSRF: header `X-Requested-With: 9tutor` + kiểm `Origin`. CSP chặt (không script/style nội tuyến), chỉ dùng `textContent`.
- Idempotency-Key cho thao tác ghi tiền (thu, tạo khoản) và tạo tài khoản.
- Giới hạn: tần suất theo IP và theo phiên; học sinh ≤ 150 đang dạy / 400 tổng, lịch lặp ≤ 300, buổi ≤ 30.000, khoản thu và thanh toán ≤ 20.000 mỗi gia sư; độ dài chữ có trần; ngày hợp lệ được kiểm chặt (không nhận 31/02).

## Để sau (ghi lại, KHÔNG làm trong MVP)
- Sàn tìm gia sư: hồ sơ xác minh (căn cước, bằng cấp), đánh giá thật, học thử, báo cáo vi phạm, ghép theo khu vực. **Không kết nối giáo viên với học sinh tự động.**
- 9class (lớp nhóm: một lịch nhiều học sinh, học phí theo lớp), 9exam (ngân hàng đề), nối 9family (lịch học vào lịch gia đình, học phí vào 9Fin), AI soạn nhận xét/báo cáo tiến bộ, tài liệu/ảnh bài, link học online, thông báo đẩy, offline (service worker), Zalo OA/ZNS gửi tự động, khớp biến động số dư tự động, gói Pro thu phí phần mềm.

## Kiểm thử bắt buộc
Đơn vị (VietQR/CRC, lịch, tính học phí). Tích hợp PostgreSQL thật: phân quyền và IDOR (mọi tài nguyên), link công khai (chỉ lộ đúng dữ liệu, thu hồi, tùy chọn học phí), không trùng lịch kể cả yêu cầu đồng thời, tính học phí/gói/thu một phần/thu đủ, nhập xấu (độ dài, ký tự điều khiển, số âm/quá lớn, ngày sai), giới hạn tần suất, CSRF, khôi phục và ghép thiết bị, trang công khai gia sư, Console contract. E2E Chrome 390×844 và màn rộng, sáng/tối, không lỗi console, ảnh vào `tutor/shots/`.

## Lưu giữ dữ liệu
`created_ip` giữ 30 ngày; tài khoản không hoạt động 365 ngày và chưa có học sinh (hoặc 730 ngày) bị xóa cứng. Trang giới thiệu `/g/` cố ý noindex; mã tạo lại được. Mã báo cáo lưu nguyên văn trong CSDL (đổi sang băm sẽ không gửi lại link được).
