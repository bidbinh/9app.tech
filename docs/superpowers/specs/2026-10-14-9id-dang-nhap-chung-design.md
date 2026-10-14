# 9id đăng nhập chung (dự án 1: lõi, thư viện trình duyệt, launcher)

Ngày: 2026-10-14. Trạng thái: chủ sản phẩm đã duyệt các giả định mục 6.1-6.3 (14/10/2026) và yêu cầu thêm **đổi số điện thoại** (mục 4.6, xác minh bằng mật khẩu + OTP số mới) và thông báo thiết bị mới (mục 4.7); **chờ xem lại 4.6 và 4.7**. Bổ sung cho `2026-10-05-9id-design.md` (mục nào mâu thuẫn thì spec này thắng).

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

Làm: (a) lõi 9id: phiên "mãi mãi"; (b) thư viện trình duyệt dùng chung `nine.js`; (c) launcher đổi sang 9id thật, bỏ tài khoản giả; (d) đổi số điện thoại (4.6); (e) thông báo thiết bị mới trong app (4.7). **Không làm**: tích hợp từng app (dự án 2 trở đi, mỗi app một spec và kế hoạch), nhập 9Ship/9Sport/9log/Gia phả, đồng bộ dữ liệu car/fit/gift/payday, deploy lên server (BACKLOG A2), cấu hình OTP/eSMS thật.

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

### 4.6 Đổi số điện thoại (chủ sản phẩm yêu cầu 14/10/2026; trước đây ngoài phạm vi)

Xác minh: **nhập lại mật khẩu + OTP gửi tới số MỚI** (chủ sản phẩm chọn; không đòi OTP số cũ vì lý do phổ biến nhất để đổi số là đã mất số cũ). Một SMS cho mỗi lần đổi.

- Luồng: đang đăng nhập, vào Tài khoản > Đổi số điện thoại. (1) Nhập số mới, xin OTP bằng `POST /api/otp/request` và xác minh bằng `POST /api/otp/verify` (tái dùng hạn mức, proof-of-work và vé hiện có; vé gắn với băm số mới, dùng một lần). (2) `POST /api/phone/change {ticket, password}`: `reauth` mật khẩu (cùng khóa tạm đăng nhập), kiểm vé khớp số mới.
- Trong **một giao dịch** có khóa hàng người dùng: kiểm số mới chưa thuộc tài khoản khác (chỉ mục UNIQUE trên `users.phone` là chốt cuối), khác số hiện tại, và lần đổi trước cách đây ≥ `PHONE_CHANGE_DAYS` (mặc định 30, biến môi trường); cập nhật `users.phone`, `phone_verified_at`; tiêu thụ vé; ghi `audit` (`phone_changed`, không chứa số); ghi `notices` kind `phone_changed`; **thu hồi mọi phiên khác**, giữ phiên hiện tại. Thành công thì phản hồi cũng nhắc người dùng dùng số mới để đăng nhập từ giờ.
- Phản hồi khi số mới đã có tài khoản khác hoặc mã sai: thông điệp **giống nhau** ("Không thể dùng số này hoặc mã chưa đúng"), không lộ số nào đã đăng ký.
- Hệ quả: lời mời gia đình đang chờ gửi tới **số mới** (theo băm số) tự hiện cho người này; lời mời gửi tới số cũ không còn hiện (số cũ được giải phóng ngay, người khác có thể đăng ký số cũ và nhận lời mời còn hiệu lực tới số đó, tối đa 14 ngày theo cơ chế hiện có — rủi ro chấp nhận, ghi ở mục 6). Quyền thành viên, vai trò, hồ sơ con gắn với `user_id` nên không đổi. Các app chỉ tham chiếu `user_id` nên không cần sửa; Console hiển thị số mới.
- Giao diện: một thẻ trong trang Tài khoản; sau khi xong hiện "Đã đổi số. Các thiết bị khác đã bị đăng xuất."; ô số dùng `autocomplete="tel"`, ô OTP `autocomplete="one-time-code"`.
- Không làm: đổi số cho tài khoản `source='9sport'` khác biệt (đối xử như mọi tài khoản); thông báo SMS tới số cũ.

### 4.7 Thông báo thiết bị mới (trong app, không SMS)

Khi có phiên **mới** được tạo (đăng nhập, đăng ký hoặc đặt lại mật khẩu từ thiết bị chưa có phiên), ghi `notices` kind `new_device` cho tài khoản (kèm nhãn thiết bị đã có ở `sessions.ua`, không kèm IP). Các thiết bị còn lại thấy thông báo ở lần mở 9id/launcher kế tiếp qua cơ chế `notices` hiện có (`unseenNotices`, đã dùng cho `password_reset`) cùng đường dẫn tới trang Thiết bị để thu hồi. Thiết bị chính vừa tạo phiên không nhận thông báo về chính nó. Tối đa một thông báo `new_device` mỗi giờ mỗi tài khoản để không làm phiền. Không gửi SMS hay đẩy ngoài app (chưa có kênh; xem mục 6.1).

### 4.5 Khuôn mẫu cho dự án sau (không làm ở đây)

- **Nhóm bắt buộc**: server app đọc cookie `nine_sid` và gọi `verify` (đã có trong `client/nine-id.js`, đệm ≤ 60 giây); chưa đăng nhập thì giao diện gọi `Nine.require`.
- **Nhóm tùy chọn**: server app thêm điểm nhận dữ liệu `POST /<app>/api/account/claim` (cần `nine_sid` hợp lệ + phiên ẩn danh hiện tại của app) để gắn dữ liệu ẩn danh vào `user_id`; giao diện hiện lời mời "Đăng nhập để giữ dữ liệu" gọi `Nine.login`. Chi tiết từng app nằm trong spec của app đó.

## 5. Kiểm thử

- 9id (`npm test`, PostgreSQL nhúng): phiên còn hiệu lực ở 364 ngày không dùng và hết ở 366; cookie `Max-Age` = 365 ngày và được cấp lại khi gia hạn; tạo phiên thứ 31 đẩy phiên cũ nhất, phiên thứ 30 thì không; `SESSION_DAYS`/`MAX_SESSIONS` đọc từ biến môi trường; đổi mật khẩu vẫn thu hồi phiên khác (hồi quy).
- `nine.js` (node:test với `fetch` giả): `me()` trả người dùng/`null`, mạng lỗi thì ném lỗi, `login(next)` từ chối `next` ngoài nguồn gốc, `require` gọi `ok` đúng lúc, `logout` xóa bộ nhớ.
- Launcher (`npm test` gốc, `tests/`): `Id` dựa trên `Nine` giả; chuyển dữ liệu cục bộ cũ (cùng số: gán lại; khác số: giữ nguyên + thông báo; không còn `sdbm`/`USER_KEY` sau khi chuyển).
- Đổi số (9id): thành công đổi `users.phone`, giữ phiên hiện tại và thu hồi phiên khác, ghi `audit`/`notices`; sai mật khẩu bị khóa tạm theo `reauth`; vé sai số/hết hạn/đã dùng bị từ chối; số đã thuộc tài khoản khác trả cùng thông điệp với mã sai; đổi lần hai trong 30 ngày bị từ chối; hai yêu cầu đổi đồng thời sang cùng số chỉ một thắng; số cũ đăng ký lại được và lời mời tới số mới hiện đúng; số điện thoại không xuất hiện trong `audit`/log.
- Thông báo thiết bị mới (9id): đăng nhập từ thiết bị mới ghi một `notices` `new_device`, thiết bị vừa đăng nhập không thấy, thiết bị khác thấy; giới hạn một mỗi giờ.
- E2E (Chrome thật, 9id thật): đăng ký bằng giao diện 9id, quay về launcher đã đăng nhập; đóng/mở lại trình duyệt vẫn đăng nhập; một trang giả cùng nguồn gốc nạp `nine.js` thấy cùng người dùng; đăng xuất ở trang giả thì launcher cũng đăng xuất; ảnh 390x844, 360x740, 1280x800, sáng/tối.

## 6. Rủi ro và điều cần chủ sản phẩm quyết

1. **Phiên dài hơn tăng thiệt hại khi mất máy hoặc lộ cookie**; đã bù bằng thu hồi từ xa, hỏi lại mật khẩu cho việc nhạy cảm và thông báo thiết bị mới trong app (4.7). Chưa có thông báo ngoài app (SMS/đẩy) vì chưa có kênh; nếu cần, là việc riêng (tốn SMS).
2. **Đã duyệt (14/10/2026):** (a) hạn 365 ngày không dùng thay vì vô hạn; (b) tối đa 30 thiết bị; (c) tách thành nhiều dự án con (mục 4).
3. **Đã duyệt (14/10/2026): chi phí OTP**: mỗi lần đăng ký/đặt lại mật khẩu/đổi số tốn một SMS (eSMS); hạn mức mặc định 5 mã/số/ngày và 2.000 SMS/ngày toàn hệ.
4. **Đổi số điện thoại** (4.6) do chủ sản phẩm thêm; rủi ro còn lại: kẻ có cả phiên lẫn mật khẩu của nạn nhân đổi được sang số của mình (đòi cả OTP số cũ sẽ chặn được nhưng người mất số cũ không đổi được; chủ sản phẩm chọn không đòi); và số cũ được giải phóng ngay nên người khác có thể đăng ký số đó và nhận lời mời gia đình còn hiệu lực tới số cũ (tối đa 14 ngày).
5. App ở tên miền con (Osin) không dùng cookie chung và cần luồng authorize; 9stay, 9Ship ở cùng tên miền thì dùng cookie chung.
6. Chưa lên server: dự án này chỉ chuẩn bị mã; deploy thuộc BACKLOG A2.
