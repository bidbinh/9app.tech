# 9swap: thiết kế bản đầu (MVP)

Ngày: 04/10/2026. Bối cảnh ở `docs/y-tuong-app-moi.md` (9swap, 9neighbor, 9wardrobe, 9lostfound; mục "Quyết định gộp"). 9swap nay gồm trao đổi/cho tặng đồ cũ **và** bảng tin tòa nhà (thất lạc, nhặt được, cần tìm). Thư mục `swap/`, cổng 8099, `BASE_PATH=/swap`, container `9swap`, CSDL `swap` / vai trò `swap` trên PostgreSQL dùng chung.

## Mục tiêu
Web app (PWA, mở bằng link) để một **cộng đồng** nhỏ (công ty, tòa nhà, khu phố) cho tặng, trao đổi, bán lại đồ cũ cho nhau, tin cậy vì cùng một nơi, nhận đồ tại chỗ. Không tài khoản: vào bằng **tên hiển thị + mã mời**. **Không xử lý thanh toán**, không vận chuyển, không chat riêng ngoài app.

## Phạm vi MVP (làm)
1. **Cộng đồng** (`communities`): tên, loại (công ty / tòa nhà / khu phố), mã mời 10 ký tự mật mã học, đường dẫn `/swap/c/<mã>`. Tham gia = tên hiển thị (không trùng không dấu trong cộng đồng) + tick đồng ý quy tắc. Phiên ẩn danh cookie HttpOnly (băm SHA-256 trong CSDL), như 9lunch. Chủ cộng đồng: đổi tên, đổi mã mời, gỡ tin, khóa/mở khóa thành viên, chuyển quyền, xóa cộng đồng.
2. **Tin đăng** (`listings`): tiêu đề, mô tả, danh mục (gia dụng, trẻ em, sách, thời trang, điện tử, nội thất, cây cảnh, thể thao, đồ ăn sắp hết hạn, khác), tình trạng (mới, như mới, tốt, dùng được, cần sửa), kiểu **Tặng / Trao đổi / Bán** (bán: giá VND, chỉ để hiển thị, không thanh toán; trao đổi: ghi "muốn đổi lấy"), vị trí nhận (tòa/tầng/điểm) và giờ nhận, tối đa 4 ảnh. Đồ ăn chỉ được **tặng**. Hết hạn sau 30 ngày (tự ẩn), người đăng gia hạn tối đa 3 lần. Tìm kiếm không dấu, lọc theo kiểu/danh mục/tình trạng, "tin của tôi".
3. **Ảnh**: nén phía trình duyệt (cạnh dài tối đa 1280px JPEG ~150KB + ảnh nhỏ 360px), gửi một yêu cầu nhị phân. **Lưu trong PostgreSQL (`bytea`)**, không dùng đĩa: có sẵn sao lưu cùng CSDL, xóa nguyên tử cùng tin, container không cần volume. Giới hạn: 4 ảnh/tin, ≤ 380KB/ảnh gốc và ≤ 60KB ảnh nhỏ, ≤ 120MB/cộng đồng; ảnh của tin đã xong/hủy/hết hạn bị xóa sau 7 ngày.
4. **Quan tâm và nhắn tin trong tin đăng**: người khác bấm "Quan tâm" mở một **luồng riêng** (`threads`) giữa họ và người đăng (ngoài hai người không ai đọc được, kể cả chủ cộng đồng; chỉ khi có người báo cáo tin nhắn thì ảnh chụp nội dung đó đến chủ cộng đồng). Người đăng **chọn người nhận** (phải là người đã quan tâm) → trạng thái "đã giữ"; người được chọn có thể từ chối; người đăng chọn lại hoặc mở lại; rồi **đánh dấu đã tặng / đã đổi / đã bán**.
5. **Điểm uy tín nhẹ**: số lần cho tặng/đổi/bán thành công (tin `xong` có người nhận khác chính mình), hiện cạnh tên, kèm huy hiệu theo mốc. Không có chấm sao hay đánh giá âm.
6. **Bảng tin** (`board_posts`): "thất lạc", "nhặt được", "cần tìm" (đồ cần xin/mượn). Bình luận công khai trong cộng đồng; người đăng đánh dấu "đã xong". Hết hạn 30 ngày.
7. **Báo cáo và kiểm duyệt**: ai cũng báo cáo tin, tin nhắn, bài bảng tin; chủ cộng đồng xem hàng chờ, gỡ tin (kèm lý do, người đăng được báo), khóa thành viên (tin đang mở bị gỡ).
8. **Quy tắc và an toàn**: trang quy tắc, danh sách đồ cấm (liệt kê, thuốc kê đơn, động vật hoang dã, hàng giả, vũ khí, chất cấm...), máy chủ chặn bằng danh sách từ khóa không dấu (lưới an toàn thô, chính là báo cáo), cảnh báo gặp mặt (nơi công cộng, ban ngày, kiểm tra đồ, không chuyển tiền trước).
9. **Thông báo trong app** bằng thăm dò (polling 15 giây): có quan tâm/tin nhắn mới, được chọn nhận, tin bị gỡ/hết hạn. Web Push để sau.
10. **API quản trị 9app Console** theo `9admin/src/contract.js`: manifest (`id: swap`, capability `users`, không `money`), health, summary, users, users/{id}.

## Ngoài phạm vi (để sau)
Web Push; thanh toán/ký quỹ; đánh giá hai chiều; chat ảnh; mượn đồ, thông báo ban quản lý, phản ánh sự cố (9condo); tủ đồ số (9wardrobe); xác thực người dùng thật (số điện thoại); service worker/offline.

## Mô hình dữ liệu (tóm tắt, chi tiết ở `db/001_init.sql`)
- `communities(id, name, kind, invite_code UNIQUE, created_by_hash, created_ip, created_at)`
- `members(id, seq, community_id, name, role chu|thanh_vien, banned_at, left_at, joined_at, last_seen_at, rules_ack_at)`; `phien(token_hash, member_id)`
- `listings(id, community_id, author_id, kind tang|doi|ban, title, description, category, condition, price, swap_wish, location, pickup_time, status mo|giu|xong|huy|go|het_han, recipient_id, search, expires_at, renew_count, removed_reason, ...)`
- `listing_photos(id, listing_id, pos, mime, bytes, data bytea, thumb bytea)`
- `threads(id, listing_id, member_id, author_read_at, member_read_at, ...)` UNIQUE(listing_id, member_id); `messages(id, thread_id, sender_id, body)`
- `board_posts`, `board_replies`, `reports(target_type listing|message|board|reply, snapshot)`, `notifications`, `idem`

## Phân quyền
| Việc | Ai |
|---|---|
| Đọc cộng đồng, tin, ảnh, bảng tin | thành viên **đang hoạt động** của cộng đồng đó (người ngoài và cộng đồng không tồn tại đều 404 như nhau) |
| Đăng tin, quan tâm, bình luận, báo cáo | thành viên (không bị khóa) |
| Sửa/rút/gia hạn/chọn người nhận/hoàn tất tin | chỉ người đăng; tin đã xong/gỡ không sửa được |
| Đọc/nhắn trong luồng | người đăng và người quan tâm của đúng luồng đó |
| Từ chối nhận | người được chọn |
| Gỡ tin/bài, khóa thành viên, xem hàng chờ báo cáo, đổi mã, xóa cộng đồng | chủ cộng đồng (chủ không tự khóa mình, không rời khi chưa chuyển quyền) |

Mọi tài nguyên được nạp kèm `community_id` rồi kiểm tra tư cách thành viên của phiên **trong cộng đồng của tài nguyên đó** (chống IDOR theo id). Thao tác đổi trạng thái chạy trong giao dịch có `SELECT ... FOR UPDATE` trên hàng tin.

## Chống lạm dụng và giới hạn
IP (đọc phần tử đầu `X-Forwarded-For`, nginx đặt `= $remote_addr`) và phiên; tạo cộng đồng ≤ 3/IP/giờ và 5/phiên/ngày; ≤ 300 thành viên; ≤ 10 tin/người/ngày và ≤ 30 tin đang mở; ≤ 60 tin nhắn/người/giờ; ≤ 200 tin nhắn/luồng; ≤ 40 luồng/tin; ≤ 20 bài bảng tin/người/ngày; chặn liên kết (http, www, tên miền) trong mọi nội dung; văn bản làm sạch ký tự điều khiển/bidi; Idempotency-Key cho tạo tin/tin nhắn; CSRF `X-Requested-With: 9swap` + kiểm Origin; CSP chặt; giao diện chỉ dùng `textContent`.

## Ảnh: kiểm tra phía máy chủ
Nhận byte thô (không multipart, không tin Content-Type, không lưu tên tệp): kiểm **magic bytes** (JPEG/PNG/WebP, không SVG/GIF), phân tích kích thước ảnh từ tiêu đề (cạnh ≤ 4096, ≤ 16 triệu điểm ảnh), giới hạn byte, mỗi ảnh trả lại với `Content-Type` do máy chủ suy ra, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, tên tệp cố định, chỉ cho thành viên cộng đồng.

## Rủi ro
- Người xấu tạo thành viên mới để quay lại sau khi bị khóa (phiên ẩn danh): chủ đổi mã mời; để sau: xác thực số điện thoại.
- Điểm uy tín có thể bị gian lận bằng tài khoản phụ: chỉ là chỉ báo nhẹ, giới hạn 10 tin/ngày.
- Bộ lọc từ khóa thô, dễ lách và có thể chặn nhầm: là lưới phụ, chính là báo cáo + chủ cộng đồng.
- Ảnh trong CSDL làm CSDL phình: có hạn mức theo cộng đồng và dọn định kỳ.
- Gặp mặt ngoài đời: cảnh báo, ưu tiên nhận tại tòa/điểm chung.

## Điều chỉnh sau phản biện độc lập (04/10/2026)
- **Cookie phiên trượt**: có hoạt động (mở `/api/me` hoặc trang cộng đồng) thì cấp lại cookie 90 ngày, tối đa mỗi ngày một lần (`phien.seen_at`). Người không vào app quá 90 ngày vẫn mất phiên (vào lại bằng mã mời).
- **Tiếp quản cộng đồng mồ côi**: chủ vắng quá `OWNER_ABSENT_DAYS` (60) ngày thì thành viên vào sớm nhất (còn hoạt động, không bị khóa) bấm "Nhận quyền chủ" (`POST /api/c/:cid/claim-owner`); chủ cũ thành thành viên thường và được thông báo. Chưa làm mã chuyển thiết bị.
- **Tin đã giữ không mất luồng**: chọn người nhận gia hạn tin ít nhất 14 ngày; tin hết hạn mà đã có người nhận vẫn cho người nhận xem và hai bên nhắn tin, tác giả vẫn bấm hoàn tất được; người nhận được báo khi hết hạn.
- **Đóng luồng quan tâm**: tác giả đóng được luồng (không đóng luồng của người đang được chọn); luồng không có tin nhắn quá 7 ngày tự đóng; luồng đóng không tính vào hạn mức 40 luồng/tin.
- **Hạn mức ảnh theo thành viên**: 20MB/người (`MEMBER_PHOTO_MB`) ngoài 120MB/cộng đồng.
- Bộ lọc liên kết bỏ các đuôi trùng từ tiếng Việt (co, me, ly, io, app, top...); danh sách đồ cấm bỏ "dao băm", "thuốc ngủ" và các cụm dễ chặn nhầm; tên hiển thị, tên cộng đồng cũng bị chặn liên kết.
- Tạo/vào cộng đồng không dùng Idempotency-Key (cần cấp cookie mới).
- Giới hạn đã biết: máy chủ chỉ đọc tiêu đề ảnh (không giải mã toàn bộ); ảnh luôn được phục vụ với CSP sandbox, nosniff, nên một tệp có tiêu đề hợp lệ nhưng thân hỏng chỉ khiến ảnh không hiện.
