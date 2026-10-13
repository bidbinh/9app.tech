# 9swap

Cho tặng, trao đổi, bán lại đồ cũ trong công ty, tòa nhà, khu phố, kèm bảng tin thất lạc / nhặt được / cần tìm. Web app (PWA), vào bằng tên hiển thị + mã mời, không tài khoản, không xử lý thanh toán.

Thiết kế: `../docs/superpowers/specs/2026-10-04-9swap-design.md`.

## Chạy cục bộ
```
npm install
npm run dev     # http://localhost:8099/swap/ (PostgreSQL nhúng, dữ liệu ở .data/)
npm test        # PostgreSQL tạm + node:test
npm run e2e     # Chrome thật (puppeteer-core), ảnh chụp vào shots/
```
`e2e` dùng `PUPPETEER_CORE` (đường dẫn module ESM) và `CHROME_PATH`; mặc định theo máy phát triển.

## Biến môi trường
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 8099 | cổng |
| `BASE_PATH` | `/swap` | đường dẫn gốc sau nginx |
| `DATABASE_URL` | localhost mặc định | **bắt buộc ở production** (thiếu thì thoát ngay) |
| `NODE_ENV` | | `production` bật cờ Secure cho cookie `swsid` |
| `CONSOLE_API_KEY_ID`, `CONSOLE_API_SECRET` | trống | bật API quản trị cho 9app Console |
| `RATE_LIMIT_PER_MIN` | 6000 | yêu cầu/IP/phút |
| `SESSION_LIMIT_PER_MIN` | 120 | thao tác ghi/phiên/phút |
| `COMMUNITIES_PER_IP_HOUR` | 3 | cộng đồng mới/IP/giờ |
| `LISTINGS_PER_DAY` | 10 | tin/người/ngày |
| `MESSAGES_PER_HOUR` | 60 | tin nhắn/người/giờ |
| `COMMUNITY_PHOTO_MB` | 120 | dung lượng ảnh tối đa mỗi cộng đồng |

## Triển khai
1. Trên PostgreSQL chung: `CREATE ROLE swap LOGIN PASSWORD '...'; CREATE DATABASE swap OWNER swap;`
2. `cp .env.example .env`, điền `DATABASE_URL` (và khóa Console), rồi `docker compose -f docker-compose.server.yml up -d --build` (cổng 8099, mem 160m). Migration chạy tự động khi khởi động (khóa tư vấn 9102).
3. nginx (container nginx nằm cùng mạng `ops_tms-network` với 9swap; compose không mở cổng ra máy chủ): `location /swap/ { proxy_pass http://9swap:8099; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Host $host; client_max_body_size 1m; }` (tên dịch vụ/container `9swap` trong mạng đó) và **chặn `/swap/admin-api/` từ internet**.
   - nginx **PHẢI** đặt `X-Forwarded-For = $remote_addr` (không dùng `$proxy_add_x_forwarded_for`): app lấy IP giới hạn tốc độ từ phần tử đầu của header này nên client giả header sẽ tự đổi IP nếu nginx nối thêm.
   - Không để container khác gọi trực tiếp cổng 8099 (họ có thể tự đặt X-Forwarded-For). Mạng `ops_tms-network` là mạng chung: nếu có thể, tạo mạng riêng chỉ gồm nginx và 9swap (và `9ship_internal` cho CSDL) thay vì nối vào mạng chung.
   - PostgreSQL tối thiểu 13 (dùng `gen_random_uuid()` có sẵn).
4. Thêm ô 9swap vào launcher (làm riêng).

## Ghi chú vận hành
- Ảnh lưu trong PostgreSQL (`bytea`), hạn mức 120MB/cộng đồng; ảnh của tin đã đóng được dọn sau 7 ngày. Theo dõi kích thước CSDL (Console có KPI "Dung lượng ảnh").
- Dọn định kỳ mỗi giờ trong tiến trình (tin hết hạn, ảnh, thông báo cũ).
- Web Push chưa có: thông báo trong app bằng thăm dò 15 giây.
