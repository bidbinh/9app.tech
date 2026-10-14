# Tích hợp 9id cho 9swap (dự án 2b)

Ngày: 2026-10-14. Áp dụng **nguyên khuôn mẫu** của `2026-10-14-tich-hop-9id-khuon-mau-design.md` (mục 3) và các bài học review của 9lunch (mục 8 của tài liệu đó, đoạn "Sau review độc lập"). Tài liệu này chỉ nêu phần riêng của 9swap.

## Hiện trạng 9swap (đã đọc mã)

Giống 9lunch: cookie ẩn danh `swsid`, bảng `phien(token_hash, member_id)`, `members` thuộc một `communities` (cộng đồng), mọi kiểm tra quyền qua `memberFor`/`requireMember` (`src/auth.js`), danh sách cộng đồng ở `GET /api/me`, tạo cộng đồng và gia nhập bằng mã ở `src/routes/communities.js`. Khác 9lunch:
- Thành viên có thể **bị chủ cộng đồng khóa** (`members.banned_at`): vẫn là thành viên (`left_at IS NULL`) nhưng chỉ đọc được thông báo khóa; `join` trả 403 nếu người vào lại đang bị khóa.
- Cookie phiên trượt (`touch` cấp lại hạn và cập nhật `phien.seen_at`).
- Tạo cộng đồng/gia nhập cần `agree: true` (quy tắc cộng đồng).

## Phần riêng

- **Migration `003_account.sql`:** `members.user_id uuid` + chỉ mục duy nhất từng phần `(community_id, user_id) WHERE user_id IS NOT NULL AND left_at IS NULL` + chỉ mục `user_id`.
- **`memberFor(q, who, communityId)`** như 9lunch (`who = {sid, userId}` hoặc chuỗi sid cũ): thành viên còn trong cộng đồng (kể cả bị khóa) qua `phien` **hoặc** `user_id`; chọn xác định (ưu tiên khớp tài khoản, rồi vào trước). `requireMember` giữ nguyên hành vi khóa (403 `banned` trừ khi `allowBanned`).
- **Khóa theo người, không theo máy:** thành viên có `user_id` bị khóa thì bị khóa ở **mọi** máy đăng nhập tài khoản đó, và gia nhập lại bằng mã trên máy khác vẫn nhận 403 (cải thiện so với ẩn danh). Nhận thành viên ẩn danh đang bị khóa vào tài khoản **vẫn giữ nguyên trạng thái khóa**.
- **Danh sách** (`GET /api/me`): mỗi cộng đồng một dòng (DISTINCT ON), đã gồm `banned`, `unread`, `memberCount` như cũ.
- **Tạo/gia nhập khi đã đăng nhập:** thành viên mới có `user_id`, **không** nối `phien` (quyền đi qua tài khoản; đăng xuất là máy mất quyền); gia nhập khi đã là thành viên (qua `user_id` hoặc `phien`) trả thành viên cũ, không thêm `phien`.
- **`touch`:** cập nhật `last_seen_at` theo cả hai đường; phần cookie trượt chỉ theo `phien` như cũ.
- **Nhận dữ liệu:** `GET /api/account`, `POST /api/account/claim` theo mục 3.6 của khuôn mẫu (cộng đồng thay cho nhóm; `claimable`/`conflicts` theo `community_id`; thành viên bị khóa cũng nhận được nhưng giữ khóa; thành viên đã rời không nằm trong danh sách).
- **Giao diện:** thẻ "Tài khoản 9app" ở trang chủ (`public/home.js`, `S9`), vị trí như 9lunch (ngay dưới danh sách khi đã có cộng đồng, cuối trang khi chưa có), không phụ thuộc `nine.js`.
- **Không đổi:** quy tắc cộng đồng, tin đăng, ảnh, trao đổi, báo cáo/kiểm duyệt.

## Kiểm thử (thêm vào bộ của khuôn mẫu)

Như 9lunch cho: nine-session (copy), quyền theo `user_id` (máy mới, người khác 404, cookie giả, rời cộng đồng, 9id lỗi, tắt tích hợp), claim (của phiên này, idempotent, xung đột, không chiếm thực thể của người khác, 401/503, đồng thời), đăng xuất mất quyền trên máy dùng chung, chọn danh tính xác định + một dòng mỗi cộng đồng, gộp xác thực/trần đệm/chuẩn hóa đường dẫn. **Riêng 9swap:** thành viên bị khóa mất quyền trên máy mới đăng nhập cùng tài khoản; gia nhập lại bằng mã khi tài khoản đã bị khóa trả 403; nhận thành viên bị khóa giữ nguyên khóa; chủ cộng đồng khóa/mở khóa thành viên có `user_id` hoạt động đúng; toàn bộ test cũ (hồi quy ẩn danh); e2e Chrome thật với 9id giả.

## Quyết định (14/10/2026)

Làm sau 9lunch, nhân đúng khuôn mẫu và dùng lại mã đã qua review (nine-id, nine-session, account route, thẻ giao diện) để giảm rủi ro; các bài học review (không nối `phien` khi đã đăng nhập, chọn xác định, single-flight, trần đệm, cầu dao 10 giây) được áp dụng ngay từ đầu.
