# 9lunch

Chọn quán, gom món, chia tiền và thu tiền cho bữa chung của nhóm đồng nghiệp: cơm trưa, cà phê và đồ uống, bữa sáng, tiệc. Web app (PWA) mở bằng link, không cần đăng ký (phiên ẩn danh), **không giữ tiền của ai**: mỗi người nợ có một mã VietQR riêng trỏ thẳng về tài khoản của người ứng tiền.

Thiết kế: `../docs/superpowers/specs/2026-10-04-9lunch-design.md`.

## Chạy cục bộ

Cần Node 20 trở lên. Không cần cài PostgreSQL: nếu không có `DATABASE_URL`, các lệnh dưới đây tự dựng PostgreSQL thật (gói `embedded-postgres`) ở cổng ngẫu nhiên.

```
npm install
npm run dev      # http://localhost:8097/9lunch/  (dữ liệu giữ ở .data/, xóa thư mục này để làm lại từ đầu)
npm test         # dựng PostgreSQL tạm, chạy node:test, rồi dọn
npm run e2e      # kiểm tra giao diện bằng Chrome thật (puppeteer-core), ảnh chụp vào shots/
```

Dùng PostgreSQL có sẵn (ví dụ container `9ship-db-1`, tạo CSDL `lunch`):

```
DATABASE_URL=postgres://postgres:ship@localhost:5440/lunch npm start
```

`npm run e2e` cần Chrome (`CHROME_PATH`, mặc định `C:/Program Files/Google/Chrome/Application/chrome.exe`) và puppeteer-core (`PUPPETEER_CORE`, đường dẫn module ESM; mặc định theo máy phát triển).

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8097` | cổng lắng nghe |
| `BASE_PATH` | `/9lunch` | đường dẫn gốc sau nginx (để trống nếu chạy ở gốc) |
| `DATABASE_URL` | `postgres://postgres:ship@localhost:5440/lunch` | kết nối PostgreSQL |
| `NODE_ENV` | | `production` bật cờ `Secure` cho cookie `lsid` |
| `CONSOLE_API_KEY_ID`, `CONSOLE_API_SECRET` | trống | bật API quản trị cho 9app Console (trống thì các đường dẫn này trả 404) |
| `NINE_ID_SECRET`, `NINE_ID_KEY_ID`, `NINE_ID_URL`, `NINE_ID_PUBLIC_PATH` | trống, `lunch`, `http://9id:8102/id`, `/id/` | bật đăng nhập 9id (tài khoản 9app dùng chung): bí mật >= 32 ký tự trùng khóa `lunch` trong `INTERNAL_KEYS` của 9id. Trống thì tích hợp tắt hẳn, app chạy ẩn danh như trước |
| `NINE_ID_CACHE_MS`, `NINE_ID_TIMEOUT_MS`, `NINE_ID_BREAK_MS` | `60000`, `1500`, `10000` | đệm kết quả xác thực, hạn gọi 9id, thời gian cầu dao khi 9id lỗi (giữ `BREAK >= TIMEOUT`) |
| `RATE_LIMIT_PER_MIN` | `6000` | giới hạn yêu cầu mỗi IP mỗi phút (đồng nghiệp dùng chung IP công ty) |
| `SESSION_LIMIT_PER_MIN` | `120` | giới hạn thao tác ghi mỗi phiên mỗi phút |

Di cư CSDL chạy tự động khi khởi động (`db/*.sql`, bảng `schema_migrations`).

## API quản trị cho 9app Console (giao thức v1)

`/<BASE_PATH>/admin-api/v1/…`, ký HMAC-SHA256 như `9admin/docs/ADMIN-API.md`; chỉ mở cho mạng nội bộ (nginx phải chặn từ internet). Khai `manifest` (`id: lunch`, capability `users`, **không có `money`**), `health`, `summary` (số nhóm, bữa 7 ngày, người dùng, người hoạt động), `users` và `users/{id}` (tên hiển thị ẩn danh, không số điện thoại). Kiểm thử bằng `../9admin/src/contract.js`.

## Tài khoản 9id (tùy chọn)

Thiết kế: `../docs/superpowers/specs/2026-10-14-tich-hop-9id-khuon-mau-design.md`. App **vẫn dùng ẩn danh như cũ**; đăng nhập 9id chỉ thêm khả năng giữ nhóm qua máy khác.

- **Bật:** đặt `NINE_ID_SECRET` (>= 32 ký tự) và thêm cùng bí mật vào `INTERNAL_KEYS` của 9id dưới tên `lunch` (ví dụ `INTERNAL_KEYS=...,lunch:<bí mật>`). Nginx phải phục vụ 9id cùng tên miền (`/id/`) để cookie `nine_sid` (Path=/) tới được 9lunch. Không đặt bí mật thì tích hợp tắt, `GET /api/account` trả `{enabled:false}`.
- **Hoạt động:** cookie `nine_sid` được xác thực qua 9id (`verify`, đệm 60 giây, đệm âm 15 giây cho cookie giả, cầu dao khi 9id lỗi). `members.user_id` gắn thành viên với người dùng; quyền xét theo phiên ẩn danh **hoặc** `user_id` nên đăng nhập ở máy mới vẫn thấy nhóm. Tạo/gia nhập nhóm khi đã đăng nhập gắn `user_id` ngay và **không** nối phiên ẩn danh của máy (đăng xuất 9id là máy mất quyền; khi 9id lỗi, thành viên chỉ có quyền qua tài khoản tạm thời không truy cập được).
- **Nhận nhóm ẩn danh:** `GET /api/account` liệt kê (`claimable`) các nhóm ẩn danh của **máy này** chưa gắn tài khoản; `POST /api/account/claim` gắn chúng (người dùng bấm xác nhận ở thẻ "Tài khoản 9app" ở trang chủ, không tự động). Nhóm mà người dùng đã là thành viên bằng tài khoản thì bỏ qua (`conflicts`). Không bao giờ chiếm thành viên đã có `user_id`.
- **9id lỗi:** app vẫn chạy ẩn danh (không 5xx), thẻ tài khoản ẩn, chỉ `claim` trả 503.
- **Thử:** `npm test` dùng 9id giả (máy khách bơm vào); `npm run e2e:account` chạy Chrome thật với 9id giả HTTP (ảnh vào `shots/account/`). Trước khi bật ở production, thử một lần với 9id thật.

## Triển khai (nginx)

- Phải **chặn `/9lunch/admin-api/` từ internet** (chỉ mạng nội bộ cho Console).
- Đặt `X-Forwarded-For = $remote_addr` (app lấy IP giới hạn tần suất từ phần tử đầu của header này).
- Production bắt buộc có `DATABASE_URL` (thiếu hoặc dùng chuỗi mặc định localhost thì app từ chối khởi động). Cookie phiên sống 90 ngày; có nút "Thoát khỏi thiết bị này" trong Cài đặt nhóm.
- Giới hạn: 3 nhóm mới mỗi IP mỗi giờ (`TEAMS_PER_IP_HOUR`), 5 nhóm mỗi phiên mỗi ngày, 30 bữa mỗi nhóm mỗi ngày, 200 bữa đang mở mỗi nhóm.

## Cấu trúc

```
db/001_init.sql          lược đồ
src/server.js            khởi động, đăng ký đường dẫn
src/http.js              bộ định tuyến node:http, CSRF (X-Requested-With: 9lunch), giới hạn tần suất, cookie, tệp tĩnh + CSP
src/auth.js              phiên ẩn danh (cookie lsid, CSDL chỉ lưu SHA-256), kiểm tra thành viên
src/idem.js              Idempotency-Key
src/routes/teams.js      nhóm, lời mời, hồ sơ và tài khoản nhận tiền của từng người, rời/xóa
src/routes/meals.js      bữa theo loại, bình chọn, gom món, chốt đơn, chia tiền, đổi người ứng tiền
src/routes/money.js      đánh dấu thanh toán, QR, sổ nợ, bù trừ, thống kê
src/console-api.js       API quản trị cho Console
src/split.js debts.js venues.js payee.js transfer.js slip.js machine.js util.js   phần thuần, có kiểm thử
public/                  giao diện một trang (JS thuần, hash-route, theme sáng/tối bằng biến CSS)
scripts/                 test.js (npm test), dev.js, e2e.js, embedded-pg.js
test/                    node:test: unit, access, payer, kinds, flow, console, nine-session, account-access, account-claim, public-ui
```

## Quy ước chính

- Tiền là số nguyên đồng; máy chủ tính mọi khoản từ món và phí đã lưu, không tin số từ trình duyệt. Phần dư làm tròn dồn cho người nhiều tiền món nhất; "chia đều" nghĩa là cả bữa chia đều cho những người có gọi món.
- Tài khoản ngân hàng là của từng thành viên; chỉ người nợ và người nhận của khoản đó thấy (kể cả QR).
- Mọi thao tác đổi trạng thái dùng giao dịch và khóa hàng bữa ăn.
- Giao diện chỉ dùng `textContent`; CSP không cho script/style nội tuyến.

## Việc để sau

Bot Zalo/Slack, Zalo Mini App, khớp biến động số dư tự động, OCR hóa đơn sàn, service worker/offline, menu do quán đăng.
