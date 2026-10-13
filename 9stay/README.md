# 9stay

Phân phối phòng của nhiều chủ qua sale và cộng tác viên (khách đầu tiên: Anstay). Đặc tả: `docs/superpowers/specs/2026-10-13-9stay-design.md`. Bản phác giao diện: `docs/9stay-mockup.html`. Kế hoạch lát 1A: `docs/superpowers/plans/2026-10-14-9stay-lat1a-nen-dat-phong.md`.

## Trạng thái

Lát 1A (nền dữ liệu và động cơ đặt phòng chống trùng) xong. Chưa có HTTP, đăng nhập 9id, giao diện, tiền, báo giá. Các lát tiếp theo xem mục 14 của đặc tả.

## Chạy kiểm thử

```
npm install
npm test
```

`npm test` tự dựng PostgreSQL thật tạm thời (embedded-postgres) nếu không có `DATABASE_URL`.

## Cấu trúc

- `db/001_core.sql`: lược đồ. `room_nights` có chỉ mục duy nhất từng phần là nguồn chống trùng.
- `src/time.js`: đêm nửa mở `[checkin, checkout)`, "hôm nay" theo giờ Việt Nam.
- `src/settings.js`: cài đặt theo phạm vi căn > chủ > tòa > org, có hiệu lực theo ngày.
- `src/inventory.js`: tòa, căn, chủ, hợp đồng, mở/chặn đêm của chủ.
- `src/bookings.js`: đặt, hủy, dời, tình trạng căn.

## Quy ước

Mọi hàm nghiệp vụ nhận `c` (từ `db.tx`) và phải chạy trong giao dịch. Đồng hồ được tiêm qua tham số `now`. Sự kiện chỉ chứa id và ngày.

Chống trùng có hai lớp: khóa dòng `owner_releases` (`FOR UPDATE`) để tuần tự hóa đặt phòng với việc chủ chặn ngày, và chỉ mục duy nhất từng phần làm hàng rào cuối. Hai test "xác định" trong `test/race.test.js` giữ giao dịch mở để kiểm thứ tự khóa; bỏ `FOR UPDATE` khỏi `claimNights` thì hai test đó thất bại (đã kiểm bằng đột biến).
