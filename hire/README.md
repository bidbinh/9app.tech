# 9hire
Việc làm thêm, bán thời gian, tuyển nhanh cho quán và cửa hàng nhỏ, có chống lừa đảo. Thiết kế: `docs/superpowers/specs/2026-10-04-9hire-design.md`.

## Chạy
`npm install`, `npm run dev` (PostgreSQL nhúng), `npm test` (44 test, PostgreSQL tạm), `npm run e2e` (Chrome headless, ảnh ở `shots/`).

## Biến môi trường
PORT=8101, BASE_PATH=/hire, DATABASE_URL (bắt buộc ở production), NODE_ENV=production, CONSOLE_API_KEY_ID / CONSOLE_API_SECRET (bật API Console), RATE_LIMIT_PER_MIN, SESSION_LIMIT_PER_MIN, JOBS_PER_SESSION_DAY (3), JOBS_PER_NEW_SESSION_DAY (2), JOBS_PER_IP_DAY (8), OPEN_JOBS_PER_EMPLOYER (10), EMPLOYERS_PER_IP_DAY (5), APPLY_PER_SESSION_DAY (20), APPLY_PER_IP_DAY (60), REVEAL_PER_SESSION_DAY, REVEAL_PER_IP_DAY, RECOVER_PER_IP_HOUR (10).

## Triển khai
Tạo vai trò + CSDL: `CREATE ROLE hire LOGIN PASSWORD '...'; CREATE DATABASE hire OWNER hire;` trên container 9ship-db. nginx: `location /hire/` proxy tới 8101, đặt `X-Forwarded-For $remote_addr` (app lấy phần tử CUỐI), chặn `/hire/admin-api/` từ internet.

## Địa chỉ khách, proxy và mạng (QUAN TRỌNG)
- Mọi hạn mức theo IP dùng địa chỉ lấy từ `X-Forwarded-For`, phần tử thứ `TRUSTED_PROXY_HOPS` tính từ cuối (mặc định 1 = chỉ nginx). IPv6 được gom về /64.
- nginx phải **ghi đè** `proxy_set_header X-Forwarded-For $remote_addr;` (không dùng `$proxy_add_x_forwarded_for` nếu nginx là lớp ngoài cùng).
- Có Cloudflare phía trước nginx: nginx dùng `$proxy_add_x_forwarded_for` hoặc module realip (`set_real_ip_from` dải Cloudflare, `real_ip_header CF-Connecting-IP`) rồi ghi `X-Forwarded-For $remote_addr`; nếu để nginx nối thêm thì đặt `TRUSTED_PROXY_HOPS=2`. Sai cấu hình này làm mọi khách trông như cùng một IP (hoặc cho phép giả IP).
- 9hire KHÔNG được lộ cổng 8101 trực tiếp ra internet (khách gửi header giả sẽ vượt hạn mức): compose chỉ nối `9ship_internal` và `ops_tms-network`, không có `ports:`. Chặn `/hire/admin-api/` từ internet.
- Production từ chối khởi động nếu `DATABASE_URL` chứa mật khẩu mẫu `MAT_KHAU` hoặc là chuỗi mặc định.
- PostgreSQL tối thiểu 13 (dùng `gen_random_uuid`, `make_interval`, `hashtextextended`). Test chỉ chạy trên CSDL có tên chứa test/e2e/embedded (từ chối xóa CSDL thật).
