# 9stay: chợ phòng kiểu Airbnb (đặc tả v1, 14/10/2026)

Trạng thái: **chờ chủ sản phẩm duyệt** trước khi lập kế hoạch và viết mã.

## 1. Mục tiêu

Biến 9stay từ công cụ quản lý nội bộ của Anstay thành một chợ phòng:

- **Khách** vào trang công khai, tìm phòng theo nơi, ngày, số người; xem danh sách có ảnh, giá, tiện nghi; mở trang chi tiết; đặt và thanh toán cọc.
- **CTV/sale** tìm trên cùng danh sách phòng đó và đặt hộ khách (đã có đường đặt, nâng lên cùng giao diện).
- **Chủ phòng** (vào bằng mã mời từ admin) tự đăng tòa nhà, căn, ảnh, mô tả, giá đề xuất; tự mở/đóng đêm khai thác.
- **Admin** duyệt tòa nhà và phòng trước khi hiện công khai, chốt giá và điều khoản chia doanh thu; tạo tòa nhiều chủ rồi gán căn cho từng chủ.

Quyết định đã chốt (14/10): chủ đề xuất giá, admin duyệt; ảnh lưu ổ đĩa của container 9stay; chủ vào bằng mã mời; làm cả chợ công khai, quy trình chủ đăng/duyệt và tòa nhiều chủ trong một đợt.

## 2. Ngoài phạm vi (đợt này)

Đánh giá/xếp hạng của khách; chat giữa khách và chủ; bản đồ và tìm theo bán kính; nhiều tổ chức (chỉ một tổ chức Anstay); chủ tự đăng ký công khai không mã mời; thanh toán tự động hoàn tiền; ứng dụng di động riêng (vẫn là PWA); thông báo đẩy/email khi duyệt (chủ xem trạng thái trong app).

## 3. Mô hình dữ liệu

**Giữ nguyên động cơ đặt phòng.** Loại phòng (`room_types`) vẫn là đơn vị định giá và tìm trống; căn (`units`) gán lúc đặt. Cái mới là lớp trình bày và duyệt phía trên:

- `listings` (một tin đăng): `building_id`, `owner_id`, `room_type_id` (mỗi tin có một loại phòng riêng, tự tạo khi gửi duyệt, nên giá/tìm trống không đổi), `title`, `description`, `amenities text[]` (danh sách cố định), `house_rules`, `bedrooms`, `beds`, `bathrooms`, `capacity_std/max`, `status` (`draft`, `pending`, `approved`, `rejected`, `suspended`), `reject_reason`, `submitted_at`, `approved_by/at`, `attest_building_allows boolean` (chủ cam kết tòa cho phép cho thuê ngắn ngày), `proposed_price` (đ/đêm trước VAT), `proposed_weekend_price`, `live_price`, `live_weekend_price`, `cancel_policy` (mã chính sách hiển thị: `linh_hoat`, `trung_binh`, `nghiem_ngat`, ánh xạ sang cài đặt hủy hiện có).
- `listing_units(listing_id, unit_id)`: một tin có 1 căn (nhà riêng) hoặc nhiều căn giống nhau (khách sạn mini).
- `listing_photos(id, listing_id, position, bytes, mime, created_at)`; tệp nằm ở `/data/photos/<listing>/<id>`, tối đa 12 ảnh mỗi tin.
- `buildings` thêm: `status` (`pending`, `approved`, `rejected`), `multi_owner boolean`, `province`, `district`, `created_by_member`, `reject_reason`.
- `units` thêm `listing_state` suy ra từ tin (căn của tin chưa duyệt luôn `inactive`).
- `price_changes(listing_id, proposed_price, proposed_weekend_price, status, decided_by, decided_at)`: đổi giá sau khi đã duyệt cũng phải duyệt; giá cũ vẫn chạy cho tới khi duyệt.

Duyệt tin (admin) trong một giao dịch: chốt `live_price`, tạo hợp đồng chủ cho các căn (chia %, sàn, phí dọn, kỳ chi trả lấy từ form duyệt, mặc định từ cài đặt), kích hoạt căn, ghi lịch giá (`rate_calendar`) cho 540 đêm tới theo giá ngày thường/cuối tuần, đặt tin `approved`. Chủ phòng sau đó tự mở đêm bằng chức năng sẵn có.

## 4. Quy trình

1. **Chủ**: nhận mã mời → đăng nhập 9id → "Phòng của tôi" → "Đăng phòng mới". Chọn tòa nhà đã duyệt (hoặc **đề xuất tòa mới**, vào hàng duyệt cùng tin), thêm các căn (mã căn, tầng), nhập tiêu đề, mô tả, tiện nghi, nội quy, chính sách hủy, tải ảnh, giá đề xuất; tick cam kết tòa cho phép; gửi duyệt.
2. **Admin**: tab "Duyệt" liệt kê tòa và tin chờ; xem ảnh và nội dung; **duyệt** (kèm giá chốt và điều khoản) hoặc **từ chối** (bắt buộc lý do); có thể **tạm ngưng** tin đã duyệt (ẩn khỏi công khai, không hủy đơn đã có).
3. **Chủ** thấy trạng thái và lý do từ chối; sửa và gửi lại. Sau khi được duyệt: mở/đóng đêm, đề xuất đổi giá.
4. **Tòa nhiều chủ**: admin tạo tòa (đánh dấu nhiều chủ), tạo căn và gán cho từng chủ (Danh mục có sẵn); mỗi chủ chỉ thấy và đăng tin cho căn được gán cho mình.
5. **Khách/CTV** chỉ thấy tin `approved` còn đêm mở.

## 5. Công khai và CTV

- `GET /api/public/:slug/listings?from&to&guests&area&minPrice&maxPrice&sort`: thẻ phòng (ảnh bìa, tiêu đề, khu vực, sức chứa, giá một đêm đã gồm VAT, tổng cho kỳ ở nếu có ngày). Chỉ tin còn trống cả kỳ.
- `GET /api/public/:slug/listings/:id`: ảnh, mô tả, tiện nghi, nội quy, chính sách hủy, lịch đêm trống 90 ngày, bảng giá kỳ ở. **Không lộ số căn, tên chủ, địa chỉ chính xác** (chỉ quận/huyện); địa chỉ đầy đủ hiện trong biên nhận sau khi nhận cọc.
- Bấm "Đặt" đi vào luồng sẵn có (OTP qua 9id, giữ 5 phút, QR, tự ghi cọc), với `roomTypeId` của tin.
- CTV: cùng danh sách, giá gói CTV, hiện hoa hồng dự kiến; đặt hộ khách như hiện nay.
- Ảnh phục vụ qua `/stay/photos/<id>` (kiểm id, header `nosniff`, cache dài, CSP `img-src 'self'` giữ nguyên).

## 6. Ảnh

Trình duyệt tự thu nhỏ (cạnh dài tối đa 1600 px, JPEG 0,82) trước khi tải. Máy chủ kiểm lại: đúng JPEG/PNG/WebP theo byte đầu tệp, tối đa 1,5 MB mỗi ảnh, 12 ảnh mỗi tin, tổng 30 MB mỗi chủ; không giải mã ảnh ở máy chủ (tránh lỗ hổng thư viện ảnh). Volume `9stay-data` gắn vào `/data`; ảnh của tin bị xóa/từ chối được dọn định kỳ. Đĩa máy chủ đang 81%: có trần tổng và báo khi vượt.

## 7. Quyền và bảo mật

- Vai `chu`: tạo/sửa tin và ảnh của **căn được gán cho chính mình**, đề xuất tòa, đổi giá (chờ duyệt), mở/đóng đêm. Không thấy tin của chủ khác, không tự duyệt.
- Vai `quanly`: duyệt/từ chối/tạm ngưng, chốt giá và điều khoản, tạo tòa nhiều chủ, gán căn.
- Mọi ghi đều kiểm quyền theo hàng (id thuộc chủ), giới hạn tần suất, nhật ký thao tác duyệt.
- Văn bản tự do (tiêu đề, mô tả, nội quy) chỉ hiển thị bằng `textContent`; giới hạn độ dài; từ chối ký tự điều khiển.
- Chặn đua dữ liệu: duyệt khóa hàng tin (`FOR UPDATE`); gửi lại sau khi từ chối tạo phiên bản mới, không sửa đè giá đã duyệt.

## 8. Giao diện

- **Khách**: trang `/stay/book/<slug>` thành trang tìm phòng (ô ngày + số người + khu vực, lưới thẻ, trang chi tiết có thư viện ảnh vuốt, nút Đặt dính đáy trên điện thoại).
- **CTV**: tab "Tìm phòng" dùng lưới thẻ cùng dữ liệu, kèm hoa hồng.
- **Chủ**: tab "Phòng của tôi" (danh sách + trạng thái + trình đăng phòng từng bước), giữ lịch và bản kê hiện có.
- **Admin**: tab "Duyệt" (hàng chờ, xem trước đúng như khách thấy), Danh mục có thêm "tòa nhiều chủ".

## 9. Kiểm thử và triển khai

TDD theo từng lát: (6A) dữ liệu + đăng phòng của chủ + ảnh + duyệt; (6B) trang tìm công khai + CTV; (6C) tòa nhiều chủ và gán căn. Mỗi lát có test PostgreSQL thật (quyền theo hàng, đua duyệt, giới hạn ảnh, giá), e2e Chrome (390x844, 360x740, 1280x800, sáng/tối), review độc lập. Deploy: migration mới, volume ảnh, kiểm dung lượng đĩa; sao lưu CSDL `stay` trước.

## 10. Câu hỏi mở (có mặc định, đổi được)

1. Mặc định chia doanh thu khi duyệt: 70% chủ (cài đặt, sửa từng tin).
2. Giá cuối tuần: thứ Sáu và thứ Bảy.
3. Chính sách hủy hiển thị: ba mức ánh xạ sang số liệu hủy hiện có; cần Anstay chốt số liệu từng mức.
4. Tiện nghi: danh sách cố định ~25 mục (wifi, điều hòa, bếp, máy giặt, bãi đỗ xe, hồ bơi…); thêm mục nào bạn cho biết.
5. Pháp lý: cam kết của chủ về tòa nhà; khai báo lưu trú vẫn chỉ nhắc/đánh dấu, chưa kiểm chứng với luật hiện hành.
