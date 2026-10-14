# 9hire
Việc làm thêm, bán thời gian, tuyển nhanh cho quán và cửa hàng nhỏ, có chống lừa đảo. Thiết kế: `docs/superpowers/specs/2026-10-04-9hire-design.md`.

## Chạy
`npm install`, `npm run dev` (PostgreSQL nhúng), `npm test` (44 test, PostgreSQL tạm), `npm run e2e` (Chrome headless, ảnh ở `shots/`).

## Biến môi trường
PORT=8101, BASE_PATH=/hire, DATABASE_URL (bắt buộc ở production), NODE_ENV=production, CONSOLE_API_KEY_ID / CONSOLE_API_SECRET (bật API Console), RATE_LIMIT_PER_MIN, SESSION_LIMIT_PER_MIN, JOBS_PER_SESSION_DAY (3), JOBS_PER_NEW_SESSION_DAY (2), JOBS_PER_IP_DAY (8), OPEN_JOBS_PER_EMPLOYER (10), EMPLOYERS_PER_IP_DAY (5), APPLY_PER_SESSION_DAY (20), APPLY_PER_IP_DAY (60), REVEAL_PER_SESSION_DAY, REVEAL_PER_IP_DAY, RECOVER_PER_IP_HOUR (10).

## Tài khoản 9id (tùy chọn)
Thiết kế: `../docs/superpowers/specs/2026-10-14-tich-hop-9id-khuon-mau-design.md`. App **vẫn dùng ẩn danh + mã khôi phục như cũ**; đăng nhập 9id chỉ thêm cách vào lại không cần mã.
- **Bật:** đặt `NINE_ID_SECRET` (>= 32 ký tự) và thêm cùng bí mật vào `INTERNAL_KEYS` của 9id dưới tên `hire`. Nginx phải phục vụ 9id cùng tên miền (`/id/`) để cookie `nine_sid` tới được 9hire. Không đặt thì tích hợp tắt (`GET /api/account` trả `enabled:false`).
- **Một tài khoản = một nhà tuyển dụng** (`employers.user_id`, chỉ mục duy nhất). Quyền xét theo phiên ẩn danh **hoặc** tài khoản; có cả hai thì ưu tiên nhà tuyển dụng của tài khoản. Tạo lúc đã đăng nhập thì gắn `user_id` và không giữ phiên ẩn danh trên máy (đăng xuất 9id là máy mất quyền).
- **Nhận:** thẻ "Tài khoản 9app" ở màn Đăng tuyển; người dùng bấm xác nhận (`POST /api/account/claim`). Tài khoản đã có nhà tuyển dụng thì nhà tuyển dụng ẩn danh của máy giữ riêng (`conflict`). Không bao giờ chiếm nhà tuyển dụng đã có `user_id`. Khôi phục bằng mã khi tài khoản đã có nhà tuyển dụng khác trả 409.
- **Ứng viên vẫn ẩn danh** (không đổi). Chủ tin không gửi được hồ sơ vào tin của chính mình, kể cả qua tài khoản.
- **9id lỗi:** app vẫn chạy ẩn danh, thẻ ẩn; đã đăng nhập mà 9id lỗi thì tạo/khôi phục trả 503 (không sinh danh tính ẩn danh thứ hai), `claim` trả 503.
- **Gỡ tích hợp:** nhà tuyển dụng tạo lúc đã đăng nhập không có phiên ẩn danh; bỏ `NINE_ID_SECRET` thì họ chỉ còn vào bằng mã khôi phục.
- **Thử:** `npm test` (9id giả), `npm run e2e:account` (Chrome thật, ảnh vào `shots/account/`). Trước khi bật ở production, thử một lần với 9id thật.

## Triển khai
Tạo vai trò + CSDL: `CREATE ROLE hire LOGIN PASSWORD '...'; CREATE DATABASE hire OWNER hire;` trên container 9ship-db. nginx: `location /hire/` proxy tới 8101, đặt `X-Forwarded-For $remote_addr` (app lấy phần tử CUỐI), chặn `/hire/admin-api/` từ internet.

## Địa chỉ khách, proxy và mạng (QUAN TRỌNG)
- Mọi hạn mức theo IP dùng địa chỉ lấy từ `X-Forwarded-For`, phần tử thứ `TRUSTED_PROXY_HOPS` tính từ cuối (mặc định 1 = chỉ nginx). IPv6 được gom về /64.
- nginx phải **ghi đè** `proxy_set_header X-Forwarded-For $remote_addr;` (không dùng `$proxy_add_x_forwarded_for` nếu nginx là lớp ngoài cùng).
- Có Cloudflare phía trước nginx: nginx dùng `$proxy_add_x_forwarded_for` hoặc module realip (`set_real_ip_from` dải Cloudflare, `real_ip_header CF-Connecting-IP`) rồi ghi `X-Forwarded-For $remote_addr`; nếu để nginx nối thêm thì đặt `TRUSTED_PROXY_HOPS=2`. Sai cấu hình này làm mọi khách trông như cùng một IP (hoặc cho phép giả IP).
- 9hire KHÔNG được lộ cổng 8101 trực tiếp ra internet (khách gửi header giả sẽ vượt hạn mức): compose chỉ nối `9ship_internal` và `ops_tms-network`, không có `ports:`. Chặn `/hire/admin-api/` từ internet.
- Production từ chối khởi động nếu `DATABASE_URL` chứa mật khẩu mẫu `MAT_KHAU` hoặc là chuỗi mặc định.
- PostgreSQL tối thiểu 13 (dùng `gen_random_uuid`, `make_interval`, `hashtextextended`). Test chỉ chạy trên CSDL có tên chứa test/e2e/embedded (từ chối xóa CSDL thật).
