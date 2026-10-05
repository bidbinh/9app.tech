# 9tutor

Sổ dạy kèm cho gia sư và giáo viên dạy thêm: học sinh, lịch dạy tuần lặp lại (báo trùng giờ), điểm danh một chạm, nhật ký buổi học, học phí (theo buổi, tháng, gói) với mã VietQR và tin nhắc phụ huynh soạn sẵn, báo cáo thu nhập tháng, liên kết "Báo cáo cho phụ huynh" chỉ xem và thu hồi được, trang giới thiệu gia sư (tùy chọn). Web app (PWA) mở bằng link, **tài khoản ẩn danh** (không email, không mật khẩu; khôi phục bằng mã hoặc ghép thiết bị), **không giữ tiền, không môi giới**.

Thiết kế và phạm vi: `../docs/superpowers/specs/2026-10-04-9tutor-design.md`. Bối cảnh: `../docs/y-tuong-app-moi.md` mục 9tutor.

## Chạy cục bộ

Cần Node 20 trở lên. Không cần cài PostgreSQL: nếu không có `DATABASE_URL`, các lệnh dưới đây tự dựng PostgreSQL thật (gói `embedded-postgres`) ở cổng ngẫu nhiên.

```
npm install
npm run dev      # http://localhost:8100/tutor/  (dữ liệu giữ ở .data/, xóa thư mục này để làm lại)
npm test         # dựng PostgreSQL tạm, chạy node:test (đơn vị + tích hợp), rồi dọn
npm run e2e      # kiểm tra giao diện bằng Chrome thật (puppeteer-core), ảnh chụp vào shots/
```

`npm run e2e` cần Chrome (`CHROME_PATH`, mặc định `C:/Program Files/Google/Chrome/Application/chrome.exe`) và puppeteer-core (`PUPPETEER_CORE`, đường dẫn module ESM; mặc định theo máy phát triển). E2E chạy server ở cổng ngẫu nhiên, chụp 390x844, 360x740, 1280x800, sáng và tối, và xuất hai tệp PDF mẫu (báo cáo phụ huynh, báo cáo thu nhập).

Dùng PostgreSQL có sẵn: `DATABASE_URL=postgres://postgres:ship@localhost:5440/tutor npm start`.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8100` | cổng lắng nghe |
| `BASE_PATH` | `/tutor` | đường dẫn gốc sau nginx (để trống nếu chạy ở gốc) |
| `DATABASE_URL` | `postgres://postgres:ship@localhost:5440/tutor` | kết nối PostgreSQL. **Production bắt buộc đặt** (thiếu hoặc dùng chuỗi mặc định thì app từ chối khởi động) |
| `NODE_ENV` | | `production` bật cờ `Secure` cho cookie `tsid` |
| `CONSOLE_API_KEY_ID`, `CONSOLE_API_SECRET` | trống | bật API quản trị cho 9app Console (trống thì các đường dẫn này trả 404) |
| `RATE_LIMIT_PER_MIN` | `3000` | giới hạn yêu cầu mỗi IP mỗi phút |
| `SESSION_LIMIT_PER_MIN` | `180` | giới hạn thao tác ghi mỗi phiên mỗi phút |
| `TRUSTED_PROXY_HOPS` | `1` | số proxy tin cậy đứng trước app; IP khách lấy từ phần tử thứ n tính từ CUỐI của `X-Forwarded-For` (0 = dùng địa chỉ kết nối trực tiếp); IPv6 gom theo /64 |
| `TUTORS_PER_IP_HOUR` | `5` | số tài khoản mới tối đa mỗi IP mỗi giờ |
| `RECOVER_PER_IP_HOUR` | `30` | số lần thử mã khôi phục, mã ghép (bộ đếm riêng cho khôi phục, ghép, xem trước ghép) mỗi IP mỗi giờ; đủ rộng cho trung tâm dạy học dùng chung IP, mã vốn đã đủ entropy nên vẫn chống dò |

Cập nhật lược đồ CSDL chạy tự động khi khởi động (`db/*.sql`, bảng `schema_migrations`, có khóa tư vấn nên hai bản khởi động đồng thời không đụng nhau).

## Triển khai (máy chủ dùng chung)

1. Tạo vai trò và CSDL riêng trong container PostgreSQL của 9Ship (tên container theo máy chủ, ví dụ `9ship-db`):
   ```
   docker exec -it 9ship-db psql -U postgres -c "CREATE ROLE tutor LOGIN PASSWORD '<mật khẩu mạnh>'" -c "CREATE DATABASE tutor OWNER tutor"
   ```
2. `cp .env.example .env`, điền `DATABASE_URL` (host `9ship-db`, CSDL `tutor`, vai trò `tutor`), `CONSOLE_API_SECRET` (trùng khai báo trong Console).
3. `docker compose -f docker-compose.server.yml up -d --build` (container `9tutor`, `mem_limit 160m`, mạng `9ship_internal` và `ops_tms-network`, cổng nội bộ 8100).
4. nginx (chỉ HTTPS):
   ```
   location /tutor/ {
       proxy_pass http://9tutor:8100;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;   # app lấy IP giới hạn tần suất từ phần tử đầu của header này
       proxy_set_header X-Forwarded-Proto $scheme;
       client_max_body_size 128k;
   }
   location /tutor/admin-api/ { allow <địa chỉ nội bộ của Console>; deny all; proxy_pass http://9tutor:8100; ... }
   ```
   **Phải chặn `/tutor/admin-api/` từ internet.** Không dùng `sub_filter` trên `/tutor/`. Mã báo cáo phụ huynh nằm trong đường dẫn nên phải tắt log truy cập cho cả trang và API:
   ```
   location ^~ /tutor/r/     { access_log off; proxy_pass http://9tutor:8100; <các proxy_set_header như trên> }
   location ^~ /tutor/api/r/ { access_log off; proxy_pass http://9tutor:8100; <các proxy_set_header như trên> }
   ```
   Cổng 8100 của container chỉ được gọi từ nginx (không publish ra máy chủ); `X-Forwarded-For` chỉ đáng tin khi mọi yêu cầu đi qua nginx. Mạng `ops_tms-network` dùng chung với nhiều dịch vụ khác nên container khác trong mạng có thể gọi thẳng và giả IP: nếu ngại, bỏ mạng này khỏi compose và chỉ giữ `9ship_internal` cho nginx và CSDL.
5. Launcher: thêm ô 9tutor (icon `public/icon.svg`, đường dẫn `/tutor/`) vào `js/apps.js` và sao chép icon sang `icons/tutor.svg` (việc này chưa làm, thuộc phần launcher).
6. Console: khai app `tutor`, địa chỉ `http://9tutor:8100/tutor/admin-api/v1`, key và secret như trên.

## Cấu trúc

```
db/001_init.sql          lược đồ (tutors, sessions, pair_codes, students, slots, lessons, charges, payments, share_links, profiles, idem)
src/server.js            khởi động, đăng ký đường dẫn
src/http.js              bộ định tuyến node:http, CSRF (X-Requested-With: 9tutor + Origin), giới hạn tần suất, cookie, tệp tĩnh + CSP, trang công khai /r/ và /g/
src/auth.js              phiên ẩn danh (cookie tsid, CSDL chỉ lưu SHA-256), nhãn thiết bị
src/schedule.js          sinh buổi từ lịch lặp, phát hiện trùng giờ
src/ledger.js            tính còn nợ / gói buổi do máy chủ
src/routes/account.js    tạo tài khoản, mã khôi phục, ghép thiết bị, thiết bị, xuất / xóa dữ liệu
src/routes/students.js   học sinh, lịch lặp, lưu trữ
src/routes/lessons.js    tuần, hôm nay, buổi lẻ / bù, dời, điểm danh, nhật ký
src/routes/money.js      khoản thu, đã thu, nhắc phụ huynh, QR VietQR, báo cáo tháng
src/routes/public.js     link báo cáo phụ huynh, trang giới thiệu gia sư
src/console-api.js       API quản trị cho 9app Console
src/transfer.js util.js banks.js idem.js errors.js db.js config.js
public/                  giao diện một trang (JS thuần, hash-route, sáng/tối bằng biến CSS) + trang công khai
scripts/                 test.js (npm test), dev.js, e2e.js, embedded-pg.js
test/                    node:test: unit, auth, access (IDOR), schedule, money, share, abuse, review, console
```

## Quy ước chính

- Mọi bảng dữ liệu có `tutor_id`; mọi truy vấn lọc theo gia sư của phiên; id của người khác trả 404 giống id bịa. Thao tác kiểm tra rồi ghi (trùng lịch, thu tiền, tạo kỳ học phí, link) chạy trong giao dịch và khóa hàng gia sư hoặc học sinh.
- Tiền là số nguyên đồng; máy chủ tự tính còn nợ, "thu đủ", số buổi còn lại của gói. Học phí một buổi được ghi lúc điểm danh và không đổi khi sau này sửa mức phí.
- Dữ liệu cũ: `created_ip` chỉ giữ 30 ngày; tài khoản không hoạt động 365 ngày mà chưa có học sinh (hoặc 730 ngày dù có) bị xóa cứng. Chính sách này cần chủ sản phẩm duyệt.
- Trang giới thiệu `/g/<mã>` cố ý `noindex` (không có danh sách tìm gia sư); mã tạo lại được trong Cài đặt nhưng không tự đổi.
- Link báo cáo: mã 128 bit lưu nguyên văn trong CSDL để gia sư gửi lại được (ai đọc được CSDL cũng đọc được dữ liệu mà link cho xem); mặc định không hiện học phí và tài khoản ngân hàng. Mã khôi phục và mã ghép chỉ lưu băm.
- Giao diện chỉ dùng `textContent`; CSP không cho script / style nội tuyến.

## Chưa làm / chưa kiểm chứng

- Pháp lý dạy thêm (Thông tư 29/2024/TT-BGDĐT: giáo viên không dạy thêm có thu tiền cho chính học sinh mình dạy chính khóa, không tự tổ chức dạy thêm; sinh viên, thuế) mới theo ghi chép tra cứu, **bắt buộc có luật sư duyệt trước khi ra mắt**. Phạm vi khóa thật trong app chỉ là trang giới thiệu công khai. Lời cảnh báo trong app là nhắc nhở chung, không phải tư vấn.
- Chưa có service worker (không dùng offline), chưa có Zalo OA / ZNS gửi tự động, chưa khớp biến động số dư tự động, chưa có sàn kết nối gia sư (cố ý để sau), chưa có lớp nhóm (9class) và nối 9family.
