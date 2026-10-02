# 9Ship — việc người vận hành phải làm (phần mềm không tự làm được)

Phần mềm đã chạy trọn luồng với hãng **mô phỏng**. Để nhận đơn và tiền thật, cần các việc dưới đây. Mỗi việc đều cần danh tính pháp lý, ký điều khoản hoặc xác minh KYC của bạn nên không thể làm thay.

Thứ tự khuyến nghị: **1 → 2 → pha 0 → 3 → 4 → 5**. Việc 6 làm song song, và phải xong trước khi mở cho người ngoài.

## 1. Đơn vị tổng hợp / hãng vận chuyển (bắt buộc)

1. Chọn **một đơn vị tổng hợp** có API: báo giá, tạo đơn, hủy, tra hành trình, webhook, nhãn. Hỏi rõ trước khi ký:
   - Có trả **giá niêm yết công bố của từng hãng** để làm trần không? (Nếu không, bạn phải tự nhập bảng giá ở Quản trị → Giá và ký quỹ.)
   - Đơn tạo qua tài khoản của họ có cho **gửi tại bưu cục** không, hay mặc định chỉ lấy tận nơi? Bưu cục có nhận **nhãn tự in** không?
   - Giá sỉ theo bậc sản lượng. Sản lượng ban đầu gần 0 nên giá vốn có thể gần bằng niêm yết; khi đó biên bằng 0 và sản phẩm không có lợi nhuận. Thương lượng bậc giá trước.
   - Họ có cho **bán lại** cho bên thứ ba (thỏa thuận đối tác) và có yêu cầu định danh người gửi không?
   - Họ có hỗ trợ tra đơn theo **mã tham chiếu của bạn** (`findByReference`) và chống tạo trùng theo mã đó không?
   - Cách họ gửi **webhook** (chữ ký, định dạng) và cách xử lý **cân/đo lại**.
2. Xin tài khoản **sandbox** và khóa API. Viết adapter theo `ADAPTER-CONTRACT.md`, chạy bộ kiểm thử hợp đồng với sandbox.
3. Đặt `CARRIER_MODULES` và `MOCK_CARRIERS=false`.

## 2. Pha 0 — kiểm chứng bằng một đơn thật (trước khi mở cho người dùng)

Với từng hãng sẽ bật, dùng đúng tài khoản dự kiến cho 9Ship, gửi **một đơn thật số tiền nhỏ** và kiểm tra:
- Báo giá của adapter khớp giá hãng thực thu.
- Mang mã vận đơn tới bưu cục: quầy có nhận không, có in được bill không, có chấp nhận nhãn của 9Ship không?
- Hãng cân lại thì webhook/bảng kê báo thế nào; cước cuối khớp sổ cái không?
- Hủy trước khi lấy hàng: tiền có hoàn đúng không?
Kết quả quyết định tổ hợp (dịch vụ, hợp đồng, điểm nhận) nào được hiển thị. Hãng nào không nhận nhãn tự in thì tắt `labelNative=false` và hướng dẫn khách đưa mã cho quầy.

## 3. Nhận tiền nạp (VietQR)

1. Mở tài khoản ngân hàng doanh nghiệp để nhận tiền nạp. Điền `BANK_BIN`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`.
2. Đăng ký một dịch vụ **báo biến động số dư** (ngân hàng hoặc bên thứ ba). Dịch vụ phải gọi webhook của bạn: `POST /9ship/v1/webhooks/bank` với header `x-signature` = HMAC-SHA256 (hex) của thân yêu cầu bằng `BANK_WEBHOOK_SECRET`, thân dạng:
   ```json
   { "transactions": [ { "id": "mã giao dịch duy nhất", "amount": 200000, "content": "nội dung chuyển khoản" } ] }
   ```
   Mỗi nhà cung cấp có định dạng riêng: cần một lớp chuyển đổi nhỏ (hàm serverless hoặc route riêng) đổi định dạng của họ sang dạng trên và tự ký.
3. Mã VietQR sinh theo chuẩn NAPAS 247 (EMVCo). Hãy quét thử bằng app ngân hàng thật với số tiền nhỏ trước khi mở.

## 4. Gửi OTP

`OTP_PROVIDER=webhook` gọi `OTP_WEBHOOK_URL` bằng `POST {"phone","message"}` kèm `Authorization: Bearer OTP_WEBHOOK_TOKEN`. Bạn cần một đầu SMS brandname hoặc Zalo ZNS và một relay nhỏ nhận lời gọi đó rồi gửi tin. Có thể viết kênh riêng bằng `registerOtpProvider` trong `src/auth.js`. Không dùng `console` ở production (mã bị ẩn khỏi log nên không ai đăng nhập được).

## 5. Triển khai

1. `cp .env.example .env`, điền mọi giá trị. Tạo `SIGN_SECRET` bằng `openssl rand -hex 32`. Tạo `ADMIN_TOTP_SECRET` (base32) và thêm vào ứng dụng xác thực.
2. `docker compose up -d --build` trong thư mục `9ship/` (CSDL tự khởi tạo).
3. Nginx của 9app.tech đã có khối `/9ship/` trong `nginx/9app.gates.inc`; container `9ship` phải cùng mạng Docker với nginx để `proxy_pass http://9ship:8099` phân giải được. **Không** thêm `sub_filter` cho khối này.
4. Kiểm tra: `/9ship/healthz`, đăng nhập quản trị `/9ship/admin.html`, bật sao lưu PostgreSQL định kỳ và **thử khôi phục** từ bản sao lưu.
5. Gửi thử theo luồng đầy đủ bằng tiền thật số nhỏ: nạp → tạo đơn → bàn giao → hủy/hoàn.

## 6. Pháp lý và kế toán (cần chuyên gia, không phải việc phần mềm)

- **Ví trả trước** giữ tiền của người dùng: xác nhận với luật sư xem đây là ví đơn mục đích hay thuộc hoạt động trung gian thanh toán cần giấy phép.
- **Mô hình bán lại hay đại lý** quyết định ghi doanh thu gộp hay thuần, thuế và hóa đơn. Bảng bút toán trong spec mục 6.7 giả định doanh thu gộp; kế toán phải duyệt.
- **Hóa đơn VAT** cho cước: ai xuất (hãng, đơn vị tổng hợp hay 9Ship).
- **Dữ liệu cá nhân** (tên, số điện thoại, địa chỉ): xác nhận căn cứ pháp lý hiện hành (Luật Bảo vệ dữ liệu cá nhân có hiệu lực từ 01/01/2026 và văn bản hướng dẫn), ký thỏa thuận xử lý dữ liệu với đơn vị tổng hợp, soạn thông báo xử lý dữ liệu và chính sách lưu trữ.
- **Khiếu nại/bồi thường**: chốt trong hợp đồng ai là người khiếu nại, ai nhận bồi thường, ai trả khách, thời hạn. Luật Bưu chính có quy định khiếu nại và miễn trách nhiệm.
- **Danh mục hàng cấm**: rà theo quy định và theo từng hãng.

## 7. Vận hành hằng ngày

- Quản trị → **Hàng đợi**: đơn không rõ kết quả, tiền về chưa ghép, rút tiền, khiếu nại. Xem hằng ngày.
- Quản trị → **Giá và ký quỹ**: cập nhật bảng giá niêm yết (giá cũ quá 72 giờ không còn tính là trần đáng tin nên offer sẽ bị ẩn nếu bật "bắt buộc có trần"); đặt ngưỡng ký quỹ tối thiểu; ghi nhận mỗi lần nạp ký quỹ cho đơn vị tổng hợp.
- Theo dõi mục **Cảnh báo giá** và **Ví đang âm**.
- Đối soát sổ cái định kỳ: tổng bút toán phải bằng 0 (`ledger.audit`).
