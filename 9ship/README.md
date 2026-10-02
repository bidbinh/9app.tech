# 9Ship

Gửi chuyển phát nhanh nội địa cho cá nhân: so giá nhiều hãng, gợi ý quầy gần bạn, tạo đơn lấy mã vận đơn, in nhãn, ví trả trước.
Thiết kế: `../docs/superpowers/specs/2026-10-03-9ship-design.md`. Kế hoạch: `../docs/superpowers/plans/2026-10-03-9ship-implementation.md`.

## Chạy thử trên máy (hãng mô phỏng)

```bash
cd 9ship
npm install
npm run db      # PostgreSQL trong Docker, cổng 5440
npm run demo    # http://localhost:8099/9ship/   (OTP hiện ngay trên màn hình)
```

- App: `http://localhost:8099/9ship/` — đăng nhập bằng số điện thoại bất kỳ, mã OTP hiển thị trong hộp xanh.
- Quản trị: `http://localhost:8099/9ship/admin.html` — mã quản trị `demo-admin`, mã TOTP lấy bằng
  `ADMIN_TOTP_SECRET=JBSWY3DPEHPK3PXP npm run totp`. Cộng tiền vào ví người dùng ở tab **Người dùng** để thử tạo đơn.
- Trong màn hình đơn có nút "Chế độ demo" để giả lập hãng lấy hàng / giao hàng.
- Qua cổng 9app: từ thư mục gốc `node server.js` rồi mở `http://localhost:9090/` và bấm ô **9Ship**.

## Kiểm thử

```bash
npm run db
npm test        # 130+ kiểm thử, cần PostgreSQL ở localhost:5440 (DATABASE_URL để đổi)
```

Kiểm thử xóa dữ liệu của CSDL `ship` — đừng trỏ vào CSDL thật.

## Cấu trúc

```
src/            ledger (sổ cái ghi kép) · rating (tính cước) · orders + worker (tạo đơn, outbox) · lifecycle (hành trình, điều chỉnh cước, hủy)
                topup · withdrawals · claims · admin · auth · labels · carriers/ (adapter) · routes/ (HTTP)
db/             lược đồ PostgreSQL theo thứ tự 001..006
public/         giao diện (JS cổ điển, không module) + trang quản trị
docs/           SETUP-CHECKLIST.md (việc người vận hành phải làm) · ADAPTER-CONTRACT.md
```

## Nguyên tắc không được phá

- Mọi thay đổi tiền đi qua `ledger.post` (ghi kép, tổng bằng 0, idempotent theo `(scope, key)`, khóa ví trước khi ghi).
- Không bao giờ nhả tiền khi chưa chắc hãng chưa tạo đơn (`findByReference` hoặc quản trị xác nhận).
- Offer không có trần niêm yết đáng tin thì không được bán (`require_cap`).
- Sổ cái và nhật ký quản trị chỉ ghi thêm (trigger chặn UPDATE/DELETE).
