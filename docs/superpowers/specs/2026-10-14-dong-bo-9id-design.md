# Dịch vụ đồng bộ qua tài khoản 9id (dự án 2b)

Ngày: 2026-10-14. Trạng thái: chủ sản phẩm yêu cầu làm phần còn lại của "tích hợp 9id" và dặn **chỉ app thật sự cần tài khoản mới có đăng nhập** (14/10/2026); ủy quyền tự quyết chi tiết. Các quyết định tự đưa ra ở mục 8.

## 1. Phạm vi

App chỉ lưu ở máy: `car`, `fit`, `gift`, `payday`, `interview`. Tiêu chí "cần tài khoản": dữ liệu cá nhân **tích lũy nhiều năm**, mất điện thoại là mất hết, và người dùng thường đổi máy hoặc dùng nhiều máy.

| App | Quyết định | Lý do |
|---|---|---|
| payday | **Có** | sổ chi tiêu, vay, mục tiêu: dữ liệu quý, nhiều năm |
| car | **Có** (không gồm ảnh) | hồ sơ xe, nhật ký chi phí, hạn đăng kiểm/bảo hiểm: cần nhắc ở cả điện thoại lẫn máy tính |
| fit | **Có** (không gồm sàng lọc sức khỏe) | nhật ký tập luyện nhiều tháng; sàng lọc PAR-Q là dữ liệu sức khỏe nên ở lại máy |
| gift | Không | danh sách quà ít, nhập lại nhanh, đã có xuất/nhập JSON |
| interview | Không | app đã có máy chủ, chỉ lưu cài đặt cục bộ; không có dữ liệu đáng giữ |

Thêm app sau này: một dòng trong `SYNC_APPS` + một bộ chuyển đổi dữ liệu trong app; máy chủ không đổi.

## 2. Nguyên tắc

- Mặc định **tắt**, app dùng ẩn danh/ngoại tuyến như cũ. Bật là hành động chủ động, có màn đồng ý nói rõ dữ liệu sẽ nằm trên máy chủ 9app (không mã hóa đầu cuối ở bản này).
- Một tài liệu JSON cho mỗi (người dùng, app), có số phiên bản; ghi có điều kiện (`baseVersion`) để hai máy không ghi đè lẫn nhau.
- Gộp **ở máy khách** bằng gộp ba chiều theo bản ghi (mục 4); máy chủ chỉ lưu và kiểm phiên bản.
- Ảnh và dữ liệu sức khỏe nhạy cảm không đồng bộ.

## 3. Máy chủ (trong 9id)

- Migration `006_sync.sql`: `sync_docs(user_id uuid FK users ON DELETE CASCADE, app text, version int, data jsonb, bytes int, updated_at, PRIMARY KEY (user_id, app))`.
- Cấu hình: `SYNC_APPS` (mặc định `car,fit,payday`), `SYNC_MAX_BYTES` (mặc định 512 KB mỗi tài liệu).
- API (cần phiên 9id, cùng nguồn gốc, header `X-Requested-With: 9id` cho ghi):
  - `GET /api/sync/:app` -> `{ version, data, updatedAt }` (chưa có: `version:0, data:null`). App ngoài danh sách: 404.
  - `PUT /api/sync/:app` `{ baseVersion, data }` -> `{ version }`. `baseVersion` khác phiên bản hiện tại: `409 conflict` kèm `details:{version,data}` để máy khách gộp lại ngay. `data` phải là object thuần; quá `SYNC_MAX_BYTES`: 413.
  - `DELETE /api/sync/:app` -> xóa bản trên máy chủ.
- Giới hạn tần suất theo IP; thân yêu cầu nâng trần lên `SYNC_MAX_BYTES` riêng cho đường dẫn này (mặc định chung vẫn 64 KB).
- Xóa tài khoản xóa luôn tài liệu (khóa ngoại). Không ghi nội dung vào nhật ký.

## 4. Gộp ba chiều (máy khách)

Mỗi máy lưu **ảnh chụp lần đồng bộ trước** (`base`). Gộp `merge3(base, local, remote)`:
- Đối tượng thuần: đệ quy theo khóa.
- Mảng bản ghi có `id` chuỗi: gộp theo `id`. Hai bên có: bằng nhau thì giữ; chỉ một bên khác `base` thì lấy bên đó; cả hai cùng sửa thì bản có dấu thời gian mới hơn (`capNhat`/`suaLuc`/`updatedAt`) thắng, không có thì giữ bản của máy đang đồng bộ. Một bên xóa (có trong `base`, mất ở bên đó): xóa, trừ khi bên kia đã sửa (sửa thắng xóa). Bản ghi mới thêm ở một bên: giữ.
- Giá trị khác (số, chuỗi, mảng không có `id`): như bản ghi nguyên khối theo quy tắc trên.
- Lần đồng bộ đầu (không có `base`): hợp của hai bên, không suy ra việc xóa.

Chu trình `chayDongBo()`: GET -> gộp -> nếu khác bản trên máy thì ghi về máy -> PUT với `baseVersion`; gặp 409 thì gộp lại với bản mới nhận (tối đa 3 lần) -> lưu `base` + `version` + giờ đồng bộ. Chạy khi mở app, khi quay lại tab, và khi bấm "Đồng bộ ngay".

## 5. Giao diện mỗi app

Thẻ "Đồng bộ qua tài khoản 9app" ở màn Dữ liệu của tôi:
- Chưa đăng nhập: giải thích + nút Đăng nhập (tới `/id/?next=...`).
- Đã đăng nhập, chưa bật: màn đồng ý rõ ràng + nút "Bật đồng bộ" (đồng bộ ngay lần đầu).
- Đã bật: giờ đồng bộ gần nhất, "Đồng bộ ngay", "Tắt đồng bộ" (giữ dữ liệu trên máy), "Xóa bản trên máy chủ".
- Lỗi mạng/9id: báo ngắn, dữ liệu trên máy không đổi.

CSP của app thêm `connect-src 'self'` (chỉ cùng nguồn gốc); service worker không chặn/ghi đệm đường dẫn `/id/`.

## 6. Kiểm thử

- 9id: test API (xác thực, phiên bản, 409, giới hạn kích thước, danh sách app, cách ly người dùng, xóa), test `merge3` (đơn vị, nhiều kịch bản), test thư viện với 9id giả.
- Mỗi app: test bộ chuyển đổi dữ liệu (lấy/ghi, loại ảnh/sàng lọc) và e2e Chrome với 9id thật dựng sẵn hoặc giả: hai "máy" đồng bộ qua nhau.

## 7. Ngoài phạm vi

Mã hóa đầu cuối; đồng bộ ảnh; đồng bộ thời gian thực; app có máy chủ (đã có khuôn mẫu riêng); triển khai lên máy chủ.

## 8. Quyết định tự đưa ra

1. Chọn 3 app (payday, car, fit); gift và interview không có đăng nhập (mục 1).
2. Một tài liệu cho mỗi app thay vì bảng theo bản ghi: dữ liệu mỗi app dưới vài trăm KB, gộp ở máy khách, máy chủ đơn giản.
3. Không mã hóa đầu cuối ở bản đầu (cần quản lý khóa/mật khẩu đồng bộ, rủi ro mất dữ liệu cao hơn lợi ích); thay bằng màn đồng ý nói rõ + loại ảnh/sức khỏe nhạy cảm. Ghi vào mục "việc sau".
4. Mặc định tắt, tắt xong dữ liệu máy chủ vẫn còn cho tới khi người dùng bấm xóa.
5. **Sửa theo đánh giá độc lập (14/10/2026):**
   - Lần đồng bộ đầu (chưa có ảnh chụp) hai bên cùng khác nhau ở giá trị đơn thì **ưu tiên bản trên máy chủ** (máy mới mang giá trị mặc định không ghi đè dữ liệu đã có); mảng không `id` cùng độ dài gộp theo vị trí.
   - `epoch` (uuid) của tài liệu đổi mỗi khi tạo lại sau khi xóa; ảnh chụp cũ có epoch khác bị bỏ. Máy từng đồng bộ mà thấy tài liệu biến mất thì **tự tắt đồng bộ** (không tạo lại bản trên máy chủ).
   - Lưu `user id` cùng ảnh chụp: đổi tài khoản 9id trên cùng trình duyệt thì tắt đồng bộ, không trộn dữ liệu hai người.
   - App chạy bằng bộ nhớ tạm (IndexedDB hỏng) không đồng bộ (`sanSang`); chốt an toàn: bản gộp mất hơn nửa số bản ghi (từ 5 bản ghi) thì dừng; "Xóa sạch dữ liệu" tắt đồng bộ trước khi xóa.
   - Giữ bản sửa của người dùng trong lúc đang đồng bộ (gộp lại trước khi ghi về máy); kiểm tra ghi được ảnh chụp vào localStorage.
   - Máy chủ: ghi có điều kiện nguyên tử trong một câu lệnh (INSERT ... DO NOTHING / UPDATE ... WHERE version), chỉ dùng kết nối của giao dịch (không cạn pool), `connectionTimeoutMillis` 8 giây, NUL -> 400.
   - Còn lại (đã biết, chưa làm): ảnh chụp là bản gộp chứ không phải dữ liệu máy đã chuẩn hóa nên máy chạy phiên bản app cũ hơn có thể coi bản ghi bị chuẩn hóa bỏ là đã xóa; bản ghi không có dấu thời gian thì máy đang đồng bộ thắng; fit kẹt nếu `kiemTraGoi` từ chối bản gộp; chưa mã hóa đầu cuối.

