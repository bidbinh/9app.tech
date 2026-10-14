# Tích hợp 9id cho các app: khuôn mẫu chung và 9lunch (dự án 2a)

Ngày: 2026-10-14. Trạng thái: chủ sản phẩm chọn phạm vi "4 app có máy chủ + dịch vụ đồng bộ cho app chỉ lưu ở máy" (14/10/2026) và ủy quyền tự quyết định chi tiết; các quyết định tự đưa ra nằm ở mục 8. Tiếp nối `2026-10-14-9id-dang-nhap-chung-design.md` (mục 3 phân loại app, mục 4.5 khuôn mẫu).

## 1. Phạm vi và thứ tự

Dự án con, mỗi dự án có spec, kế hoạch, mã, review riêng:
1. **9lunch** (tài liệu này: khuôn mẫu chung + phần riêng 9lunch).
2. 9swap, 3. 9hire, 4. 9tutor: nhân khuôn mẫu, mỗi app một phụ lục/spec ngắn.
5. **Dịch vụ đồng bộ** cho app chỉ lưu ở máy (car, fit, gift, payday, 9interview): subsystem mới, spec riêng.

Ngoài phạm vi ở đây: 9Ship/9Sport (tài khoản riêng, nhập sang 9id là việc riêng), 9stay (phiên khác đang làm), triển khai lên máy chủ.

## 2. Hiện trạng 9lunch (đã đọc mã)

- Phiên ẩn danh: cookie `lsid`, máy chủ chỉ giữ băm; bảng `phien(token_hash, member_id)` nối phiên với `members` (một thành viên trên mỗi nhóm/`teams`).
- Mọi kiểm tra quyền đi qua `memberFor`/`requireMember` (`src/auth.js`); danh sách nhóm của người dùng (`GET /api/me`) và tạo/gia nhập nhóm (`src/routes/teams.js`) dùng `phien` trực tiếp.
- 9id (đã làm ở dự án 1) cấp cookie `nine_sid` (Path=/ trên 9app.tech) và có API nội bộ `POST /internal/v1/verify` ký HMAC; 9family đã có khuôn tích hợp (`verifyToken` có đệm 60 giây, cầu dao khi 9id lỗi).

## 3. Khuôn mẫu chung cho app có máy chủ (áp dụng cho cả 4 app)

**Nguyên tắc:** app vẫn dùng được ẩn danh như cũ; đăng nhập 9id chỉ thêm khả năng giữ dữ liệu qua máy khác. Không có gì bị đòi đăng nhập.

1. **Cấu hình** (biến môi trường, đều tùy chọn): `NINE_ID_URL` (mặc định `http://9id:8102/id`), `NINE_ID_KEY_ID`, `NINE_ID_SECRET`, `NINE_ID_PUBLIC_PATH` (mặc định `/id/`), `NINE_ID_CACHE_MS` (60000), `NINE_ID_TIMEOUT_MS`, `NINE_ID_BREAK_MS`. **Không có `NINE_ID_SECRET` (hoặc < 32 ký tự) thì tích hợp tắt**: app chạy y như trước, `GET /api/account` trả `{enabled:false}`. Production không bắt buộc đặt.
2. **Xác thực người dùng:** `src/nine-session.js` (chép vào từng app, dựa trên `src/nine-id.js` của 9family): đọc cookie `nine_sid` (đúng định dạng 43 ký tự), gọi `verify` qua kênh ký HMAC, đệm 60 giây theo băm token, đệm âm 15 giây cho token sai (cookie giả không làm 9id bị gọi dồn), cầu dao: 9id vừa lỗi hạ tầng thì trong `NINE_ID_BREAK_MS` không gọi nữa. Kết quả đặt vào `ctx.userId` (UUID của 9id, luôn lấy từ máy chủ 9id, **không bao giờ từ body/header của client**), `ctx.userName`; nếu 9id không đạt được thì `ctx.userId = null` và `ctx.idDown = true` (**app vẫn chạy ẩn danh**, không coi là đăng xuất vĩnh viễn, không lỗi 5xx).
3. **Dữ liệu:** bảng thực thể ẩn danh thêm cột `user_id uuid` (không khóa ngoại: id của dịch vụ khác) và chỉ mục duy nhất từng phần để mỗi người dùng chỉ có một thực thể hoạt động ở mỗi phạm vi (ví dụ mỗi nhóm).
4. **Quyền:** có quyền nếu phiên ẩn danh nối tới thực thể **hoặc** `user_id` của thực thể bằng người dùng đã xác thực. Người ngoài vẫn nhận 404 như cũ (không lộ tồn tại).
5. **Thực thể mới khi đang đăng nhập** gắn `user_id` ngay lúc tạo; gia nhập lại phạm vi mà người dùng đã có thực thể thì dùng lại thực thể đó (không tạo trùng).
6. **Nhận dữ liệu ẩn danh vào tài khoản** (không tự động: máy dùng chung có thể chứa dữ liệu của người khác): `GET /api/account` liệt kê những thực thể gắn với **phiên ẩn danh của chính yêu cầu này**, chưa có `user_id`, còn hoạt động (`claimable`), và những cái không nhận được vì người dùng đã có thực thể ở cùng phạm vi (`conflicts`); `POST /api/account/claim` nhận chúng trong một giao dịch: bỏ qua cái xung đột, không bao giờ chiếm thực thể đã có `user_id` (kể cả của chính mình thì idempotent), trả `{claimed, skipped}`. Cần đăng nhập (401 kèm `login`); 9id lỗi thì 503; không đăng nhập thì không có gì thay đổi.
7. **Giao diện:** thẻ "Tài khoản" ở trang chủ app, chỉ hiện khi `enabled` và 9id trả lời được: chưa đăng nhập -> mời đăng nhập/đăng ký (chuyển tới `/id/?next=<trang hiện tại>#/dang-nhap|#/dang-ky`); đã đăng nhập -> tên, danh sách chờ nhận kèm nút xác nhận "Gắn vào tài khoản", liên kết Quản lý tài khoản, Đăng xuất (`POST /id/api/logout` có header `x-requested-with: 9id`). 9id lỗi/chưa lên -> thẻ ẩn, app như cũ.
8. **Triển khai:** thêm khóa app vào `INTERNAL_KEYS` của 9id (`<keyId>:<bí mật >= 32 ký tự>`) và đặt cùng bí mật cho app; thêm biến vào `docker-compose.server.yml`/`.env.example`/README. Kiểm bằng 9id giả ở bộ test của app và một lần với 9id thật trước khi bật ở production.

## 4. Phần riêng 9lunch

- **Migration `003_account.sql`:** `ALTER TABLE members ADD COLUMN user_id uuid;` và `CREATE UNIQUE INDEX members_team_user ON members(team_id, user_id) WHERE user_id IS NOT NULL AND left_at IS NULL;`.
- **`memberFor(q, who, teamId)`** (`who` = `{sid, userId}` hoặc chuỗi `sid` cũ): thành viên còn trong nhóm mà phiên nối tới (`phien`) **hoặc** `m.user_id = userId`. `requireMember` truyền `ctx`. `touch` cập nhật `last_seen_at` theo cả hai đường.
- **`GET /api/me` (danh sách nhóm):** gồm nhóm nối qua `phien` **hoặc** `user_id` (đăng nhập trên máy mới, chưa có cookie ẩn danh, vẫn thấy nhóm); không có phiên lẫn người dùng thì danh sách rỗng.
- **Tạo nhóm / gia nhập bằng mã** khi `ctx.userId`: thành viên mới có `user_id`; gia nhập nhóm mà người dùng đã là thành viên (qua `user_id` hoặc `phien`) thì trả thành viên cũ (`already: true`) và thêm hàng `phien` cho phiên hiện tại; xung đột chỉ mục duy nhất (đua) được coi là "đã là thành viên".
- **Rời nhóm** (`left_at`): thành viên không còn hoạt động nên mất quyền dù có `user_id`; gia nhập lại tạo thành viên mới như hiện tại. "Quên thiết bị này" (xóa `phien` của cookie) chỉ gỡ đường ẩn danh; người đã đăng nhập vẫn thấy nhóm qua tài khoản (rời nhóm mới là hành động thật).
- **Nhận dữ liệu:** `claimable` = thành viên hoạt động nối với `ctx.sid` qua `phien` và `user_id IS NULL` mà người dùng chưa có thành viên hoạt động ở nhóm đó; `conflicts` = các thành viên ẩn danh cùng tình trạng nhưng người dùng đã có thành viên hoạt động ở nhóm đó (không gộp được: hai danh tính trong một nhóm).
- **Giao diện:** thẻ ở trang chủ (`public/home.js`) theo mục 3.7; không phụ thuộc `nine.js`.
- **Không đổi:** quy tắc thanh toán, chia tiền, mã mời, giới hạn tốc độ.

## 5. Kiểm thử

- Đơn vị `nine-session`: định dạng token, đệm, đệm âm, cầu dao, 9id lỗi -> `ctx.userId=null` + `idDown`, tắt khi không có bí mật.
- Tích hợp 9lunch (PostgreSQL thật, 9id giả bơm vào): quyền theo `user_id` (máy mới không có `lsid` vẫn mở được nhóm và thao tác đúng vai); người dùng khác và cookie `nine_sid` giả bị 404; tạo/gia nhập khi đăng nhập gắn `user_id`, gia nhập lại không tạo trùng, đua hai yêu cầu chỉ ra một thành viên; `claimable`/`claim` đúng (chỉ của phiên này, idempotent, bỏ qua xung đột, không chiếm thực thể của người khác, 401 khi chưa đăng nhập, 503 khi 9id lỗi, không đổi gì khi tắt tích hợp); rời nhóm thì mất quyền; chỉ mục duy nhất ngăn hai thành viên hoạt động cùng người dùng; toàn bộ test cũ vẫn đạt (hồi quy ẩn danh).
- E2E (Chrome thật, 9id giả HTTP): tạo nhóm ẩn danh, đăng nhập (đặt cookie), thẻ báo "chưa gắn", bấm gắn, máy mới (ngữ cảnh trình duyệt mới) thấy nhóm, người dùng khác không thấy, 9id lỗi thì app vẫn dùng được; ảnh 390x844, 360x740, 1280x800 sáng/tối.

## 6. Rủi ro

- Người dùng đăng nhập trên máy dùng chung có thể bấm nhận các thành viên ẩn danh của người khác trên máy đó: chỉ nhận khi bấm xác nhận và thấy tên nhóm; người cầm máy vốn đã có quyền truy cập các thành viên đó qua cookie.
- Hai danh tính ẩn danh của cùng một người trong cùng nhóm (mua máy mới, vào lại bằng mã mời) không tự gộp được: giữ một, bỏ qua một và báo (`conflicts`).
- `user_id` không có khóa ngoại: xóa tài khoản 9id để lại `user_id` treo (vô hại: không ai khớp được; dọn khi làm đồng bộ xóa).

## 7. Việc để sau

Thông báo cho nhóm khi thành viên đổi từ ẩn danh sang tài khoản; gộp hai thành viên cùng nhóm; chuyển thành viên giữa tài khoản; dịch vụ đồng bộ (dự án 5).

## 8. Quyết định tự đưa ra (14/10/2026)

- Làm 9lunch trước làm mẫu (đã đọc: chia tiền nhóm, cần cẩn thận nhất).
- Nhận dữ liệu bằng xác nhận thủ công, không tự động khi đăng nhập (an toàn cho máy dùng chung).
- Tích hợp tắt hẳn khi không có bí mật, để triển khai app trước 9id không gây hại.
- Giao diện app không phụ thuộc `nine.js` (tự dựng liên kết đăng nhập cùng nguồn gốc), để không thêm tệp ngoài và không có điểm hỏng.
- Làm việc trong worktree riêng `D:\9app-wt-id` (nhánh `feat/9id-integration`, dựa trên `feat/9id-login` gồm 16 commit 9id cherry-pick từ `feat/9stay`) vì thư mục chính đang dùng chung với phiên 9stay.
