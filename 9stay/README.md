# 9stay

Phân phối phòng của nhiều chủ qua sale và cộng tác viên (khách đầu tiên: Anstay). Đặc tả: `docs/superpowers/specs/2026-10-13-9stay-design.md`. Bản phác giao diện: `docs/9stay-mockup.html`. Kế hoạch lát 1A: `docs/superpowers/plans/2026-10-14-9stay-lat1a-nen-dat-phong.md`.

## Trạng thái

Lát 1A (nền dữ liệu, đặt phòng chống trùng) và lát 1B (bảng giá, báo giá, sổ kép, cọc ghi tay, nhận/trả phòng, quyết toán, bản kê chủ và hoa hồng, CSV) xong, đều đã qua review độc lập và sửa. Chưa có HTTP, đăng nhập 9id, giao diện. Các lát tiếp theo xem mục 14 của đặc tả.

## Chạy kiểm thử

```
npm install
npm test
```

`npm test` tự dựng PostgreSQL thật tạm thời (embedded-postgres) nếu không có `DATABASE_URL`.

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
- `db/001..005`: lược đồ; mọi bảng tiền và bản kê chỉ thêm (trigger `forbid_change`).

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
