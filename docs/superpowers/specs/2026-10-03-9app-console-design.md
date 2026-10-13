# 9app Console — cổng quản trị chung cho các app 9app.tech

Ngày: 2026-10-03 · Trạng thái: giai đoạn 1 (cổng + 9Ship) đang làm; các app khác chờ bạn đồng ý từng app.

## 1. Mục tiêu

Một màn hình quản trị trên máy tính cho cả hệ sinh thái: (1) phần quản trị riêng của từng app, (2) **một** màn hình dòng tiền gộp, (3) **một** màn hình người dùng gộp. Người vận hành duy nhất (siêu quản trị) đăng nhập mật khẩu + TOTP.

Quyết định đã chốt: mỗi app cung cấp API quản trị chuẩn (cổng không đọc CSDL của app); 9Fin chỉ cung cấp số liệu tổng hợp; một siêu quản trị (khung phân quyền theo app để mở rộng sau); dòng tiền tách tiền khách / doanh thu.

## 2. Kiến trúc

```
Trình duyệt (desktop) ─► 9app Console (Node + Postgres) ──HMAC──► /admin-api/v1 của từng app
                                   │                                  9Ship · 9Sport · 9Fin · 9quy …
                                   └─ kho chỉ-đọc đã đồng bộ: người dùng, dòng tiền
```

- Cổng là dịch vụ riêng `9admin/`, chạy tại `https://9app.tech/admin/`, CSDL riêng (một database trong container PostgreSQL có sẵn của 9Ship để tiết kiệm bộ nhớ máy chủ).
- App nào chưa nối thì hiện "chưa kết nối" trong menu; app thuần giao diện (không máy chủ) không có gì để quản trị nên không xuất hiện.
- Cổng đồng bộ định kỳ (5 phút) và theo yêu cầu, theo **con trỏ** (idempotent theo `(app, id)`), nên chạy lại không nhân đôi.

## 3. Giao thức kết nối v1 (mỗi app triển khai)

Xác thực: header `X-Console-Key` (mã khóa), `X-Console-Ts` (giây), `X-Console-Sig` = HMAC-SHA256(bí mật, `ts \n METHOD \n đường dẫn+query \n sha256(thân)`). Lệch giờ > 120 giây bị từ chối. Chỉ nhận qua mạng nội bộ/HTTPS.

| Đường dẫn | Nội dung |
|---|---|
| `GET /manifest` | `{ app:{id,name,version}, capabilities:['users','money','panels'], currency:'VND' }` |
| `GET /health` | `{ ok, details? }` |
| `GET /summary` | `{ kpis:[{id,label,value,format:'money'\|'int'\|'text',hint?,tone?}], alerts:[{level:'info'\|'warn'\|'bad',text,panel?}] }` |
| `GET /users?after=&limit=` | `{ items:[{id,phone,name,status,createdAt,lastSeenAt?,extra?}], next }` |
| `GET /users/{id}` | `{ title, fields:[{label,value,format?}] }` |
| `GET /cash?after=&limit=` | `{ items:[{id,at,kind,amount,category,description?,ref?,phone?}], next }` |
| `GET /balances` | `{ items:[{id,label,amount,kind:'cash'\|'customer_funds'\|'receivable'}] }` |
| `GET /panels` | danh sách khai báo bảng: `{id,title,description?,columns:[{key,label,format?}],rowActions:[{id,label,tone?,confirm?,inputs?}]}` |
| `GET /panels/{id}?page=&q=` | `{ rows:[{_id,…}], total, page, pageSize }` |
| `POST /actions/{id}` | `{ rowId?, inputs? }` → `{ ok, message }` |

`kind` của dòng tiền: `cash_in`, `cash_out` (tiền thật qua ngân hàng), `revenue`, `expense` (kết quả kinh doanh). Tiền khách nạp vào ví **không** là doanh thu: nó là tiền ngân hàng vào (`cash_in`) và làm tăng "tiền khách giữ hộ" trong `/balances`. `amount` là số nguyên đồng, luôn dương; chiều do `kind` quyết định. `format` hợp lệ: `text`, `int`, `money`, `date`, `datetime`, `status`, `phone`, `link`.

## 4. Màn hình (desktop)

1. **Tổng quan:** tình trạng từng app (thông / chậm / lỗi, thời điểm đồng bộ cuối), chỉ số tiền 30 ngày, người dùng mới, danh sách cảnh báo gộp (bấm đi tới đúng bảng cần xử lý).
2. **Dòng tiền:** bộ lọc (khoảng ngày, app, loại, tìm kiếm), thanh tổng (tiền vào, tiền ra, doanh thu, chi phí, lãi gộp, tiền khách giữ hộ theo app), biểu đồ theo ngày, bảng giao dịch có phân trang, xuất CSV.
3. **Người dùng:** gộp theo số điện thoại; mỗi dòng cho biết đang dùng app nào; mở chi tiết để xem từng app (lấy trực tiếp từ app) và tổng tiền đã giao dịch.
4. **Trang từng app:** KPI, cảnh báo, và các bảng/hành động do app khai báo (ví dụ 9Ship: đơn cần kiểm tra, tiền về chưa ghép, rút tiền, khiếu nại).
5. **Hệ thống:** khai báo app (địa chỉ, khóa, kiểm tra kết nối), nhật ký thao tác, đổi mật khẩu.

## 5. Bảo mật

- Quản trị viên: mật khẩu PBKDF2 + TOTP bắt buộc, khóa tạm khi nhập sai, cookie phiên `HttpOnly; Secure; SameSite=Strict`, kiểm tra header CSRF, hết phiên sau 8 giờ.
- Bí mật của app lưu mã hóa AES-256-GCM bằng `CONSOLE_KEY`; không bao giờ trả về giao diện.
- Địa chỉ app chỉ nhận máy chủ trong danh sách cho phép (chống SSRF); không theo chuyển hướng; giới hạn kích thước phản hồi; mọi hành động đi qua khai báo của app và được ghi nhật ký (chỉ ghi thêm).
- Giao diện hiển thị mọi dữ liệu bằng `textContent`; xuất CSV chống chèn công thức.
- 9Fin: chỉ `summary` tổng hợp, không có `users`/`cash` chi tiết.

## 6. Giai đoạn

1. Cổng + giao thức + kết nối 9Ship đầy đủ (bảng quản trị 9Ship chuyển sang khai báo), kiểm thử, chạy thử cục bộ.
2. Deploy cổng lên máy chủ (cần bạn đồng ý).
3. Từng app: 9Sport (gói, team, phí), 9quy (quỹ), 9Fin (số liệu tổng hợp). Mỗi app là một thay đổi nhỏ trong mã của app đó và một lần deploy riêng.
