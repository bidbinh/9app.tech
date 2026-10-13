# 9stay

Phân phối phòng của nhiều chủ qua sale và cộng tác viên (khách đầu tiên: Anstay). Đặc tả: `docs/superpowers/specs/2026-10-13-9stay-design.md`. Bản phác giao diện: `docs/9stay-mockup.html`. Kế hoạch lát 1A: `docs/superpowers/plans/2026-10-14-9stay-lat1a-nen-dat-phong.md`.

## Trạng thái

Lát 1A (nền dữ liệu, đặt phòng chống trùng), 1B (giá, sổ kép, quyết toán, bản kê), 1C (API HTTP, đăng nhập 9id, phân quyền theo vai) và 1D (giao diện web/PWA cho quản lý, lễ tân, CTV/sale, chủ phòng) đã xong, đều qua review độc lập và sửa. Lát 2 (VietQR + webhook ngân hàng, hàng chờ lệch thanh toán, QR trong đơn) cũng đã xong và qua review; tên trường/chữ ký của nhà cung cấp thật (SePay/Casso) chưa kiểm bằng sandbox. **Chưa deploy, chưa có hóa đơn điện tử, trang đặt phòng công khai cho khách** (các lát sau, xem mục 14 của đặc tả).

## Chạy kiểm thử

```
npm install
npm test
```

`npm test` tự dựng PostgreSQL thật tạm thời (embedded-postgres) nếu không có `DATABASE_URL`.

## Chạy giao diện kiểm thử trình duyệt

```
set PUPPETEER_CORE=<đường dẫn puppeteer-core/lib/esm/puppeteer/puppeteer-core.js>
npm run e2e
```

Cần Chrome (`CHROME_PATH`, mặc định `C:/Program Files/Google/Chrome/Application/chrome.exe`). Kịch bản chạy PostgreSQL tạm, máy chủ thật và 9id giả; đi qua các vai quản lý, lễ tân, CTV, chủ phòng ở 390x844, 360x740 và 1280x800, sáng và tối; bắt lỗi console và vi phạm CSP; ảnh chụp vào `shots/` (đã gitignore).

## Biến môi trường

Xem `.env.example`. Quan trọng: `DATABASE_URL`, `NINE_ID_URL/KEY/SECRET` (cặp khóa app `stay` trong `INTERNAL_KEYS` của 9id), `EDGE_SECRET` (nginx đặt header `X-Edge-Secret`), `TRUSTED_PROXY_HOPS` (nginx đặt `X-Forwarded-For = $remote_addr` thì để 1). Production từ chối khởi động nếu thiếu hoặc yếu các biến này.

## Yêu cầu nginx (khi deploy)

```
location /stay/ {
    proxy_pass http://9stay:8110;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;       # KHÔNG dùng $proxy_add_x_forwarded_for
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Edge-Secret "<giá trị EDGE_SECRET>";
    client_max_body_size 128k;
}
```

Cổng 8110 chỉ được gọi từ nginx qua mạng docker. Cookie `nine_sid` của 9id dùng chung tên miền `9app.tech`; 9stay xác minh mỗi yêu cầu với 9id (không cache), nên khóa người dùng ở 9id hoặc khóa thành viên ở 9stay có hiệu lực ngay.

## Cấu trúc

- `db/001_core.sql`: lược đồ. `room_nights` có chỉ mục duy nhất từng phần là nguồn chống trùng; khóa ngoại ghép `(org_id, id)` giữ mọi thực thể liên quan cùng một org.
- `src/time.js`: đêm nửa mở `[checkin, checkout)`, "hôm nay" theo giờ Việt Nam.
- `src/settings.js`: cài đặt theo phạm vi căn > chủ > tòa > org, có hiệu lực theo ngày.
- `src/inventory.js`: tòa, căn, chủ, hợp đồng, mở/chặn đêm của chủ.
- `src/bookings.js`: đặt, hủy, dời, tình trạng căn.
- `src/ids.js`: kiểm uuid sớm (`bad_id`) thay vì để PostgreSQL ném lỗi thô.
- `src/money.js`, `src/pricing.js`: làm tròn half-up; bảng giá theo đêm (`setRates`, có lịch sử), ưu đãi, báo giá có hạn (`computeQuote` là hàm thuần).
- `src/ledger.js`, `src/balance.js`, `src/payments.js`: sổ kép bất biến (cân bằng bằng ràng buộc hoãn ở CSDL, idempotent theo ref), ghi cọc/hoàn bằng tay, số dư đơn.
- `src/agents.js`, `src/contracts.js`, `src/stay.js`: sale/CTV, hợp đồng chủ theo đêm, nhận phòng, trả phòng và quyết toán chia chủ/Anstay/hoa hồng/phí dọn.
- `src/statements.js`: bản kê chủ phòng và hoa hồng đóng băng, chi trả, CSV, báo cáo tiền giữ hộ.
- `src/http.js`, `src/server.js`, `src/auth.js`, `src/routes/*.js`: HTTP, xác thực 9id, phân quyền theo vai (`src/access.js`), route; `src/search.js` (căn trống, đặt theo loại phòng), `src/calendar.js`, `src/queries.js`.
- `public/`: giao diện (JS thuần, không build; không script/style nội tuyến vì CSP chặt). `sw.js` chỉ lưu vỏ giao diện, không lưu API.
- `src/bank.js`, `src/vietqr.js`, `src/routes/bank.js`, `db/007_bank.sql`: tài khoản nhận tiền, bank_inbox idempotent, tự ghép theo mã đơn (chỉ khi đủ cọc, không trùng khoản ghi tay), ghép tay/bỏ qua, QR. Biến `BANK_WEBHOOK_SECRET` dùng chung mọi org (việc còn lại: bí mật riêng từng org). Chuyển dư hoặc một lần chuyển cho hai đơn hiện chỉ xử lý bằng bỏ qua + hoàn tay.
- `db/001..006`: lược đồ; mọi bảng tiền và bản kê chỉ thêm (trigger `forbid_change`).

## Triển khai (khi tới lúc)

- Vai ứng dụng nên bị `REVOKE TRUNCATE` trên các bảng chỉ thêm (TRUNCATE không chạy trigger theo dòng).
- Migration chạy bằng cùng role chủ như các app khác; `CREATE EXTENSION btree_gist` cần quyền tạo extension (btree_gist là extension "trusted" từ PostgreSQL 13).
- Chưa có cơ chế gọi `expireHolds` định kỳ ngoài quét lười trong đặt/dời/chặn ngày: lớp HTTP nên thêm một job nhẹ mỗi vài phút.

## Khác biệt có chủ ý so với đặc tả, và việc còn lại cho lát sau

- **Giữ chỗ theo căn, không theo loại phòng.** Đặc tả (mục 4) giữ theo loại phòng bằng bảng `holds` rồi gán căn khi tiền về; lát 1A giữ thẳng một căn cho đặt phòng nội bộ. Lát 5 (trang công khai) thêm `holds` theo loại phòng, `room_nights` giữ nguyên.
- **Đơn `giu` quá hạn chưa tự nhả.** `hold_until` đã được ghi nhưng chưa có cơ chế nhả: đơn quá hạn vẫn chiếm đêm, chủ không chặn được đêm đó, và `moveBooking` vẫn dời được đơn quá hạn. Lát 1B phải thêm `expireHolds(now)` (giu → het_han, vô hiệu room_nights), gọi định kỳ và "lười" ở đầu `claimNights`/`blockNights`; `unitAvailability` nên trả `held` kèm `holdUntil`.
- **Trạng thái đơn rút gọn**: chưa có `huy_do_chu`, `da_tra_chua_xep`, `hoan` (đến lát 2 và 5).
- **SĐT** lưu như nhập sau khi bỏ dấu cách (`+84901…` và `0901…` là hai chuỗi khác nhau); phải chuẩn hóa về một dạng trước khi ghép nguồn đơn theo SĐT (lát 4).
- **`buildings.legal_type = 'nha_o'`** chưa có cờ "chủ cam kết chịu rủi ro tòa nhà cấm" (đặc tả mục 13).
- **`valid_to` của hợp đồng chủ là nửa mở** (không bao gồm ngày đó), như mọi khoảng đêm khác; hợp đồng cùng căn không được chồng ngày (ràng buộc EXCLUDE).
- **Khóa `org_counters`** tuần tự hóa mọi đặt phòng trong một org (đủ cho quy mô vài chục đơn mỗi ngày). Nếu thành nút thắt: chèn đơn với mã tạm, giữ đêm, rồi mới lấy số.
- **`db.tx` dịch deadlock (40P01) và lỗi tuần tự hóa (40001) thành `AppError('busy', 409)`**; lớp HTTP sau này nên thử lại một lần.

## Quy ước

Mọi hàm nghiệp vụ nhận `c` (từ `db.tx`) và phải chạy trong giao dịch. Đồng hồ được tiêm qua tham số `now`. Sự kiện chỉ chứa id và ngày.

Chống trùng có hai lớp: khóa dòng `owner_releases` (`FOR UPDATE`) để tuần tự hóa đặt phòng với việc chủ chặn ngày, và chỉ mục duy nhất từng phần làm hàng rào cuối. Khóa luôn lấy theo thứ tự (căn, đêm) trước khi đụng `room_nights`; `moveBooking` khóa cả đêm cũ lẫn đêm mới trước khi vô hiệu đêm cũ.

Các test "xác định" trong `test/race.test.js` giữ giao dịch mở và đợi tới khi PostgreSQL báo một phiên đang chờ khóa (không dùng sleep cố định). Đã kiểm bằng đột biến: bỏ `FOR UPDATE` trong `claimNights` thì 2 test thất bại; bỏ việc khóa trước trong `moveBooking` thì test dời-vs-đặt thất bại.
