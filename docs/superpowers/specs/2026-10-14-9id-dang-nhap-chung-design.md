# 9id đăng nhập chung (dự án 1: lõi, thư viện trình duyệt, launcher)

Ngày: 2026-10-14. Trạng thái: **chờ chủ sản phẩm duyệt spec**. Bổ sung cho `2026-10-05-9id-design.md` (mục nào mâu thuẫn thì spec này thắng).

## 1. Nguyên tắc (chủ sản phẩm, 14/10/2026)

1. Một tài khoản (tên đăng nhập + mật khẩu) dùng chung cho **mọi app có yêu cầu mật khẩu**.
2. Vào từ launcher 9app hay từ từng app đều được; đăng nhập một lần dùng cho tất cả (cookie chung).
3. App không cần đăng nhập thì vẫn dùng được như cũ.
4. Đăng nhập được lưu "mãi mãi": không phải nhập lại mật khẩu sau mỗi vài tuần.

Đã chốt: tên đăng nhập là **số điện thoại**, đăng ký xác minh **OTP một lần** (eSMS) rồi chỉ cần mật khẩu, quên mật khẩu khôi phục bằng OTP; tích hợp bằng **cookie chung** `nine_sid` (Path=/ trên `9app.tech`), không dùng token lưu ở trình duyệt.

## 2. Hiện trạng đã kiểm (mã nguồn, 14/10/2026)

- Lõi 9id (`9id/`) đã có: đăng ký/đăng nhập/đặt lại mật khẩu, phiên trượt (gia hạn mỗi lần dùng, ghi tối đa mỗi giờ một lần), cookie `nine_sid` HttpOnly, SameSite=Lax, Secure ở production, Path=/; danh sách thiết bị, đăng xuất từng thiết bị và các thiết bị khác; `GET /api/me` trả `{user:null}` khi chưa đăng nhập; `?next=` được làm sạch (`safeNext`); luồng authorize cho app ở tên miền con (Osin); client Node `client/nine-id.js` (`verify`...).
- **Hạn phiên cố định trong mã**: `sessionDays: 90` (không đổi được bằng biến môi trường), `maxSessions: 10` (phiên cũ nhất bị đẩy ra khi tạo phiên mới).
- **Chỉ 9family và Osin dùng 9id thật.** Launcher dùng một tài khoản **giả cục bộ**: `js/id.js` lưu SĐT và băm mật khẩu bằng `sdbm` (yếu) trong `localStorage`, chỉ phục vụ phần Life OS (`js/os.js`: `withLogin`, `putOwned` gắn `userId = 'u-' + sdt`). Không nối với dịch vụ 9id.
- `car`, `fit`, `gift`, `payday` **không** dùng tài khoản; dữ liệu chỉ ở máy, đã để sẵn chỗ đồng bộ 9id sau này.
- 9lunch, 9swap, 9hire, 9interview: phiên ẩn danh riêng (`lsid`, `swsid`...); 9tutor: tài khoản ẩn danh + mã khôi phục; 9Ship: tài khoản riêng chung với 9Sport (nhập sang 9id là "bước sau" trong spec 05/10, chưa làm); 9log, Gia phả, 9Sport: giữ đăng nhập riêng (theo ghi chú trong `js/os.js`).
- 9id chưa lên server (BACKLOG A2).

## 3. Phân loại app (chủ sản phẩm chọn "3 nhóm như đề xuất")

| Nhóm | App | Hành vi |
|---|---|---|
| Không cần đăng nhập | 9unit, 9race, 9english, 9license, 9scanner, 9speed, Vạn Niên, 9ticket | Không đổi. |
| Đăng nhập tùy chọn | 9lunch, 9swap, 9hire, 9interview, 9tutor, car, fit, gift, payday | Dùng ngay ẩn danh; đăng nhập để giữ dữ liệu qua máy khác; dữ liệu ẩn danh được nhận vào tài khoản. |
| Bắt buộc | 9family, Osin, 9stay, 9Ship | Chưa đăng nhập thì chuyển tới `/id/?next=...` rồi quay lại đúng chỗ. |

Ngoài nhóm (giữ đăng nhập riêng, xử lý sau): 9log, Gia phả, 9Sport. Nhập tài khoản 9Ship/9Sport vào 9id: dự án riêng.

## 4. Phạm vi dự án 1

Làm: (a) lõi 9id: phiên "mãi mãi"; (b) thư viện trình duyệt dùng chung `nine.js`; (c) launcher đổi sang 9id thật, bỏ tài khoản giả. **Không làm**: tích hợp từng app (dự án 2 trở đi, mỗi app một spec và kế hoạch), nhập 9Ship/9Sport/9log/Gia phả, đồng bộ dữ liệu car/fit/gift/payday, deploy lên server (BACKLOG A2), cấu hình OTP/eSMS thật.

### 4.1 Phiên "mãi mãi" (lõi 9id)

- Thêm `SESSION_DAYS` (mặc định **365**) thay cho hằng 90, và `MAX_SESSIONS` (mặc định **30**) thay cho 10. Ý nghĩa: phiên **trượt, không có hạn cố định**; chỉ vô hiệu khi **365 ngày liền không dùng** hoặc bị thu hồi. Cookie `Max-Age` = `SESSION_DAYS * 86400` và được cấp lại khi gia hạn (cơ chế hiện có). Trình duyệt giới hạn cookie khoảng 400 ngày nên 365 là giá trị tối đa an toàn; không đặt "vô hạn".
- Nâng số thiết bị lên 30 vì phiên dài mà đẩy phiên cũ nhất ra thì người dùng bị đăng xuất bất ngờ.
- Giữ nguyên các biện pháp bù cho phiên dài: danh sách thiết bị có "dùng lần cuối", đăng xuất từng thiết bị/thiết bị khác, đổi hoặc đặt lại mật khẩu thu hồi mọi phiên khác, cookie HttpOnly + Secure + SameSite=Lax, hành động nhạy cảm (tiền, đổi mật khẩu, xóa tài khoản) vẫn nhập lại mật khẩu (`reauth.js`).
- "Lưu mật khẩu": **không** lưu mật khẩu ở `localStorage` hay nơi nào khác ở phía app. Dựa vào trình quản lý mật khẩu của trình duyệt (các ô đã có `autocomplete` đúng: `username`, `current-password`, `new-password`; kiểm lại ở màn đăng nhập/đăng ký) cộng với phiên dài.

### 4.2 Thư viện trình duyệt dùng chung `/id/nine.js`

Một tệp JS cổ điển (ES5, không module, chạy được trên WebView cũ), phục vụ từ chính 9id cùng nguồn gốc `9app.tech` nên lọt qua CSP `script-src 'self'` của mọi app cùng tên miền. API:

- `Nine.me() -> Promise<{id, displayName, ...} | null>`: gọi `GET /id/api/me` (cookie cùng nguồn), lưu kết quả trong bộ nhớ cho cuộc gọi sau; mạng lỗi thì ném lỗi (không coi là đăng xuất).
- `Nine.user()` đọc đồng bộ kết quả đã nạp (hoặc `null` nếu chưa nạp/chưa đăng nhập).
- `Nine.login(next)` / `Nine.register(next)`: chuyển tới `/id/?next=<đường dẫn hiện tại hoặc next>#/dang-nhap` (hoặc `#/dang-ky`); `next` luôn là đường dẫn cùng nguồn.
- `Nine.logout()`: `POST /id/api/logout` rồi xóa bộ nhớ.
- `Nine.require(ok)`: nếu đã đăng nhập gọi `ok()`; chưa thì `Nine.login()`.

Không lưu gì ở `localStorage`; không đọc cookie (HttpOnly). Chỉ dùng được cho app cùng nguồn gốc; app ở tên miền con (Osin) tiếp tục dùng luồng authorize hiện có.

### 4.3 Launcher đổi sang 9id thật

- Thay `js/id.js`: giữ nguyên tên giao diện `Id.session()`, `Id.require(fn)`, `Id.logout()`, `Id.hasUser()` để `js/os.js` ít phải sửa, nhưng nay dựa trên `Nine` (xem 4.2); bỏ `dangKy`/`dangNhap` cục bộ, `sdbm`, và `USER_KEY`/`SESS_KEY` (xóa dần, xem dưới). `showLoginSheet` thay bằng chuyển tới `/id/` với `next` về launcher.
- `putOwned`: `userId = 'u-' + <id người dùng 9id>` (không dùng số điện thoại; 9id không trả số đầy đủ).
- **Chuyển dữ liệu cục bộ cũ**: lần đầu đăng nhập 9id thật trên máy có tài khoản giả cũ (`9app.id.user`), gán lại các bản ghi của Graph có `userId = 'u-' + sdt cũ` sang `u-<id 9id>`, rồi xóa `9app.id.user` và `9app.id.sess` (bỏ băm `sdbm`). Nếu người dùng đăng nhập bằng số khác số cũ: **không** gán tự động, giữ nguyên bản ghi cũ (không mất dữ liệu), hiện thông báo.
- Dòng ghi chú trong màn đăng nhập ("9log, Gia phả, 9Sport giữ login riêng") giữ nguyên ở trang giới thiệu tài khoản.

### 4.4 Màn hình 9id

Giữ luồng hiện có (đăng ký 3 bước, đăng nhập, quên mật khẩu, thiết bị). Thêm câu giải thích ở màn đăng ký: "Đăng ký một lần, dùng cho mọi app 9app cần đăng nhập." và ghi "Giữ đăng nhập trên thiết bị này" mặc định bật (không cần ô chọn: phiên luôn dài, người dùng thu hồi ở trang thiết bị).

### 4.5 Khuôn mẫu cho dự án sau (không làm ở đây)

- **Nhóm bắt buộc**: server app đọc cookie `nine_sid` và gọi `verify` (đã có trong `client/nine-id.js`, đệm ≤ 60 giây); chưa đăng nhập thì giao diện gọi `Nine.require`.
- **Nhóm tùy chọn**: server app thêm điểm nhận dữ liệu `POST /<app>/api/account/claim` (cần `nine_sid` hợp lệ + phiên ẩn danh hiện tại của app) để gắn dữ liệu ẩn danh vào `user_id`; giao diện hiện lời mời "Đăng nhập để giữ dữ liệu" gọi `Nine.login`. Chi tiết từng app nằm trong spec của app đó.

## 5. Kiểm thử

- 9id (`npm test`, PostgreSQL nhúng): phiên còn hiệu lực ở 364 ngày không dùng và hết ở 366; cookie `Max-Age` = 365 ngày và được cấp lại khi gia hạn; tạo phiên thứ 31 đẩy phiên cũ nhất, phiên thứ 30 thì không; `SESSION_DAYS`/`MAX_SESSIONS` đọc từ biến môi trường; đổi mật khẩu vẫn thu hồi phiên khác (hồi quy).
- `nine.js` (node:test với `fetch` giả): `me()` trả người dùng/`null`, mạng lỗi thì ném lỗi, `login(next)` từ chối `next` ngoài nguồn gốc, `require` gọi `ok` đúng lúc, `logout` xóa bộ nhớ.
- Launcher (`npm test` gốc, `tests/`): `Id` dựa trên `Nine` giả; chuyển dữ liệu cục bộ cũ (cùng số: gán lại; khác số: giữ nguyên + thông báo; không còn `sdbm`/`USER_KEY` sau khi chuyển).
- E2E (Chrome thật, 9id thật): đăng ký bằng giao diện 9id, quay về launcher đã đăng nhập; đóng/mở lại trình duyệt vẫn đăng nhập; một trang giả cùng nguồn gốc nạp `nine.js` thấy cùng người dùng; đăng xuất ở trang giả thì launcher cũng đăng xuất; ảnh 390x844, 360x740, 1280x800, sáng/tối.

## 6. Rủi ro và điều cần chủ sản phẩm quyết

1. **Phiên dài hơn tăng thiệt hại khi mất máy hoặc lộ cookie**; đã bù bằng thu hồi từ xa và hỏi lại mật khẩu cho việc nhạy cảm. Có muốn thêm thông báo "đăng nhập từ thiết bị mới" (cần kênh gửi; hiện chưa có) không?
2. **Giả định chưa được duyệt riêng**: (a) hạn 365 ngày không dùng thay vì vô hạn; (b) tối đa 30 thiết bị; (c) tách thành nhiều dự án con (mục 4).
3. **Chi phí OTP**: mỗi lần đăng ký/đặt lại mật khẩu tốn một SMS (eSMS). Hạn mức mặc định trong spec 05/10 (5 mã/số/ngày, 2.000 SMS/ngày toàn hệ) cần bạn xác nhận.
4. **Tên đăng nhập là số điện thoại**: không đổi được số (ngoài phạm vi của spec 05/10); người đổi số phải tạo tài khoản mới.
5. App ở tên miền con (Osin) không dùng cookie chung và cần luồng authorize; 9stay, 9Ship ở cùng tên miền thì dùng cookie chung.
6. Chưa lên server: dự án này chỉ chuẩn bị mã; deploy thuộc BACKLOG A2.
