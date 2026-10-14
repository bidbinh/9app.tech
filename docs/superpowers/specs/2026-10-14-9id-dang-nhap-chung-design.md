# 9id đăng nhập chung (dự án 1: lõi, thư viện trình duyệt, launcher)

Ngày: 2026-10-14. Trạng thái: **đã duyệt để làm** (chủ sản phẩm duyệt các giả định 14/10/2026, yêu cầu thêm đổi số điện thoại và ủy quyền "suy nghĩ sâu hơn và tự quyết định"; các quyết định tự đưa ra nằm trong mục 7 để chủ sản phẩm biết). Bổ sung cho `2026-10-05-9id-design.md` (mục nào mâu thuẫn thì spec này thắng).

## 1. Nguyên tắc (chủ sản phẩm, 14/10/2026)

1. Một tài khoản (tên đăng nhập + mật khẩu) dùng chung cho **mọi app có yêu cầu mật khẩu**.
2. Vào từ launcher 9app hay từ từng app đều được; đăng nhập một lần dùng cho tất cả (cookie chung).
3. App không cần đăng nhập thì vẫn dùng được như cũ.
4. Đăng nhập được lưu "mãi mãi": không phải nhập lại mật khẩu sau mỗi vài tuần.

Đã chốt: tên đăng nhập là **số điện thoại**, đăng ký xác minh **OTP một lần** (eSMS) rồi chỉ cần mật khẩu, quên mật khẩu khôi phục bằng OTP; tích hợp bằng **cookie chung** `nine_sid` (Path=/ trên `9app.tech`), không dùng token lưu ở trình duyệt; **có đổi số điện thoại** (mật khẩu + OTP số mới).

## 2. Hiện trạng đã kiểm (mã nguồn và site thật, 14/10/2026)

- Lõi 9id (`9id/`) đã có: đăng ký/đăng nhập/đặt lại mật khẩu; phiên trượt (gia hạn mỗi lần dùng, ghi tối đa mỗi giờ); cookie `nine_sid` HttpOnly, SameSite=Lax, Secure ở production, Path=/; **thiết bị quen** (cookie `nine_dev`, bảng `devices`, 365 ngày); danh sách thiết bị, đăng xuất từng thiết bị và các thiết bị khác; bảng `notices` (đã dùng cho `password_reset`) trả qua `/api/me` và các phản hồi đăng nhập; `GET /api/me` trả `{user:null}` khi chưa đăng nhập; `?next=` làm sạch bằng `safeNext`; luồng authorize cho app ở tên miền con (Osin); client Node `client/nine-id.js`; `maintenance()` đã xóa phiên không dùng quá `sessionDays`; tệp trong `9id/public/` được phục vụ tĩnh (nên `public/nine.js` thành `/id/nine.js`); mọi POST/DELETE cần header `x-requested-with: 9id`.
- **Hạn phiên cố định trong mã**: `sessionDays: 90` (không đổi được bằng biến môi trường), `maxSessions: 10`; khi vượt trần, `createSession` đẩy phiên **tạo sớm nhất** ra, kể cả phiên đang dùng hằng ngày.
- **Chỉ 9family và Osin dùng 9id thật.**
- **Launcher thật** (bản đang chạy trên 9app.tech: `index.html` + `apps.js?v=35` + `search.js` + `home-config.js` + `launcher.js?v=18`, nguồn làm việc `launcher-ux2/`) **không có đăng nhập**: trang "Tài khoản" ghi "9app lưu ứng dụng ghim và ứng dụng vừa dùng trên máy này, không cần đăng nhập", và không có CSP chặn script cùng nguồn.
- **Life OS cục bộ ở thư mục gốc repo** (`index.html` cũ, `js/os.js`, `js/id.js` với băm `sdbm`, `localStorage`) là bản thử **chưa từng được triển khai**; không phải launcher đang chạy. Dự án này **không sửa** nó (ghi chú ở mục 7).
- `car`, `fit`, `gift`, `payday` không dùng tài khoản; dữ liệu chỉ ở máy, đã để sẵn chỗ đồng bộ 9id sau này.
- 9lunch, 9swap, 9hire, 9interview: phiên ẩn danh riêng (`lsid`, `swsid`...); 9tutor: tài khoản ẩn danh + mã khôi phục; 9Ship: tài khoản riêng chung với 9Sport (nhập sang 9id là "bước sau" của spec 05/10); 9log, Gia phả, 9Sport: giữ đăng nhập riêng.
- 9id chưa lên server (BACKLOG A2).

## 3. Phân loại app (chủ sản phẩm chọn "3 nhóm như đề xuất")

| Nhóm | App | Hành vi |
|---|---|---|
| Không cần đăng nhập | 9unit, 9race, 9english, 9license, 9scanner, 9speed, Vạn Niên, 9ticket | Không đổi. |
| Đăng nhập tùy chọn | 9lunch, 9swap, 9hire, 9interview, 9tutor, car, fit, gift, payday | Dùng ngay ẩn danh; đăng nhập để giữ dữ liệu qua máy khác; dữ liệu ẩn danh được nhận vào tài khoản. |
| Bắt buộc | 9family, Osin, 9stay, 9Ship | Chưa đăng nhập thì chuyển tới `/id/?next=...` rồi quay lại đúng chỗ. |

Ngoài nhóm (giữ đăng nhập riêng, xử lý sau): 9log, Gia phả, 9Sport. Nhập tài khoản 9Ship/9Sport vào 9id: dự án riêng.

## 4. Phạm vi dự án 1

Làm: (a) lõi 9id: phiên "mãi mãi"; (b) thư viện trình duyệt `nine.js`; (c) launcher thật hiển thị đăng nhập 9id; (d) đổi số điện thoại, kèm hoàn tác 7 ngày; (e) thông báo thiết bị mới trong app. **Không làm**: tích hợp từng app (dự án 2 trở đi, mỗi app một spec và kế hoạch), nhập 9Ship/9Sport/9log/Gia phả, đồng bộ dữ liệu car/fit/gift/payday, Life OS cũ, deploy lên server (BACKLOG A2), cấu hình OTP/eSMS thật.

### 4.1 Phiên "mãi mãi" (lõi 9id)

- `SESSION_DAYS` (mặc định **365**) thay hằng 90 và `MAX_SESSIONS` (mặc định **30**) thay 10, đều đọc từ biến môi trường. Phiên **trượt, không có hạn cố định**: chỉ vô hiệu khi 365 ngày liền không dùng hoặc bị thu hồi. Cookie `Max-Age` = `SESSION_DAYS * 86400`, được cấp lại khi gia hạn (cơ chế hiện có). Trình duyệt giới hạn cookie khoảng 400 ngày nên 365 là tối đa an toàn; không đặt "vô hạn". Phiên cũ đang có hiệu lực tự hưởng hạn mới.
- **Vượt trần thiết bị**: đẩy phiên **ít dùng gần đây nhất** (`last_used_at` nhỏ nhất), không phải phiên tạo sớm nhất, để phiên chính dùng hằng ngày không bị đăng xuất.
- Giữ các biện pháp bù: danh sách thiết bị có "dùng lần cuối", đăng xuất từng thiết bị/thiết bị khác, đổi/đặt lại mật khẩu thu hồi phiên, cookie HttpOnly + Secure + SameSite=Lax, hành động nhạy cảm vẫn nhập lại mật khẩu (`reauth`).
- "Lưu mật khẩu": **không** lưu mật khẩu ở phía app. Dựa vào trình quản lý mật khẩu của trình duyệt (ô đã có `autocomplete` đúng: `username`/`tel`, `current-password`, `new-password`; kiểm lại ở màn đăng nhập/đăng ký) cộng với phiên dài.

### 4.2 Thư viện trình duyệt `/id/nine.js`

Tệp JS cổ điển ES5 (không module, chạy được trên WebView cũ), đặt ở `9id/public/nine.js`, phục vụ cùng nguồn gốc nên lọt qua CSP `script-src 'self'` của mọi app cùng tên miền. API (đối tượng toàn cục `Nine`):

- `Nine.me() -> Promise<user|null>`: gọi `GET /id/api/me` (cookie cùng nguồn), nhớ kết quả; mạng lỗi thì reject (không coi là đăng xuất). `user` = `{id, displayName, phoneLast4}`.
- `Nine.user()`: kết quả đã nạp (hoặc `null`).
- `Nine.login(next)`, `Nine.register(next)`: chuyển tới `/id/?next=<next>#/dang-nhap` hoặc `#/dang-ky`; `next` mặc định là đường dẫn hiện tại; chỉ nhận đường dẫn cùng nguồn gốc bắt đầu bằng một dấu `/` (không `//`, không `\`, không lược đồ), ngược lại dùng `/`.
- `Nine.logout() -> Promise`: `POST /id/api/logout` (kèm `x-requested-with: 9id`), xóa bộ nhớ.
- `Nine.require(ok)`: đã đăng nhập thì gọi `ok(user)`, chưa thì `Nine.login()`.

Không lưu gì ở `localStorage`, không đọc cookie. Dùng cho app cùng nguồn gốc; app ở tên miền con (Osin) tiếp tục dùng luồng authorize.

### 4.3 Launcher thật (nguồn `launcher-ux2/`)

- Nạp `/id/nine.js`. Trang **Tài khoản**: chưa đăng nhập hiện hai nút "Đăng nhập" và "Đăng ký" (qua `Nine.login/register`, `next` = `/#/tai-khoan`) kèm câu "Một tài khoản cho mọi app 9app cần đăng nhập. Các app khác vẫn dùng được không cần tài khoản."; đã đăng nhập hiện tên, "Số điện thoại ***1234", liên kết "Quản lý tài khoản" (`/id/#/tai-khoan`) và nút "Đăng xuất". Nút tròn avatar ở thanh trên hiện chữ cái đầu của tên khi đã đăng nhập (giữ biểu tượng hiện tại khi chưa).
- Câu cũ "không cần đăng nhập" đổi thành "9app lưu ứng dụng ghim và ứng dụng vừa dùng trên máy này. Đăng nhập là tùy chọn."
- **`nine.js` được nạp bất đồng bộ sau khi launcher đã dựng xong** (không dùng thẻ script đồng bộ: 9id chậm/treo không được chặn trang chủ) và chỉ chèn khi máy chủ trả đúng JavaScript (nginx có thể trả `index.html` cho đường dẫn không có). Khi `nine.js` không nạp được hoặc `Nine.me` lỗi (9id chưa lên, ngoại tuyến, trả HTML) thì **ẩn hẳn khối đăng nhập** và giữ giao diện cũ, không báo lỗi (quyết định 7). Không thêm yêu cầu đăng nhập nào cho các ô app.
- Không sửa `js/apps.js`, `search.js`. Triển khai theo `launcher-ux2/DEPLOY.md` (so md5 với `orig/`, sao lưu, chép) khi chủ sản phẩm cho phép; **không** thuộc dự án này.

### 4.4 Màn hình 9id

Giữ luồng hiện có. Thêm câu ở màn đăng ký: "Đăng ký một lần, dùng cho mọi app 9app cần đăng nhập." Màn đăng nhập/đăng ký/đổi số kiểm lại `autocomplete`. Thêm thẻ "Đổi số điện thoại" ở trang Tài khoản (4.6) và hiện thông báo `new_device`/`phone_changed`/`phone_change_undone` bằng cơ chế `notices`.

### 4.5 Khuôn mẫu cho dự án sau (không làm ở đây)

- **Nhóm bắt buộc**: server app đọc cookie `nine_sid` và gọi `verify` (đã có, đệm ≤ 60 giây); chưa đăng nhập thì giao diện gọi `Nine.require`.
- **Nhóm tùy chọn**: server app thêm `POST /<app>/api/account/claim` (cần `nine_sid` hợp lệ + phiên ẩn danh hiện tại của app) để gắn dữ liệu ẩn danh vào `user_id`; giao diện hiện lời mời "Đăng nhập để giữ dữ liệu" gọi `Nine.login`.

### 4.6 Đổi số điện thoại (kèm hoàn tác 7 ngày)

Xác minh: **nhập lại mật khẩu + OTP gửi tới số MỚI** (chủ sản phẩm chọn; không đòi OTP số cũ vì lý do phổ biến nhất để đổi số là đã mất số cũ). Một SMS cho mỗi lần đổi.

**Luồng đổi** (cần đăng nhập):
1. Xin OTP số mới bằng `POST /api/otp/request` với `purpose: 'phone_change'` (thêm vào `PURPOSES`; **bắt buộc có phiên**, số mới khác số hiện tại; hạn mức riêng theo mục đích như `register`/`reset`; không dùng ngân sách "reserved"). **Không phân biệt số đã có chủ hay chưa ở bước này** (cùng hạn mức, cùng phản hồi, cùng việc gửi mã) để không liệt kê được tài khoản qua hạn mức/độ trễ; đổi lại số đã có chủ vẫn nhận một SMS, bị chặn ở bước đổi số. Xác minh bằng `POST /api/otp/verify` (vé gắn băm số mới, dùng một lần) như hiện có.
2. `POST /api/phone/change {ticket, phone, password}`: `reauth` mật khẩu (cùng khóa tạm), kiểm vé khớp số mới. Trong **một giao dịch** có khóa hàng người dùng: số mới không thuộc tài khoản khác (UNIQUE `users.phone` là chốt cuối) và **không bị giữ chỗ** bởi người khác (xem dưới); lần đổi trước cách đây ≥ `PHONE_CHANGE_DAYS` (mặc định 30); tiêu thụ vé; cập nhật `users.phone` và `phone_verified_at`; ghi bản ghi `phone_changes`; ghi `audit` (`phone_changed`, không chứa số) và `notices` kind `phone_changed`; **thu hồi mọi phiên khác, thiết bị quen và phiên con của app tên miền con**, giữ phiên hiện tại. Phản hồi: thông điệp thành công nhắc dùng số mới để đăng nhập.
3. Số mới đã có tài khoản khác, bị giữ chỗ, hoặc mã sai: thông điệp **giống nhau** ("Không thể dùng số này hoặc mã chưa đúng").

**Hoàn tác trong 7 ngày** (bù rủi ro kẻ có cả phiên lẫn mật khẩu đổi sang số của mình; không chặn người đã mất số cũ vì họ không cần hoàn tác):
- Bảng `phone_changes(id, user_id → users ON DELETE CASCADE, old_phone_hash, new_phone_hash, changed_at, undone_at, closed_at)`. **Chỉ lưu băm** (không lưu số rõ): hoàn tác luôn kèm số cũ đã xác minh OTP nên chỉ cần so băm (kể cả băm theo pepper cũ khi đang xoay), số khôi phục lấy từ yêu cầu. Dòng bị xóa sau 90 ngày (`maintenance()`).
- **Giữ chỗ số cũ 7 ngày**: trong 7 ngày kể từ lúc đổi (và chưa hoàn tác), không ai khác đăng ký hay đổi sang số cũ (kể cả qua nhập 9Sport): thông điệp chung "Không thể dùng số này...".
- Người giữ số cũ xác minh OTP số cũ (luồng **Quên mật khẩu** có sẵn, `purpose: 'reset'`): phản hồi `verify` thêm cờ `phoneChangeUndoable: true` khi số đó đang được giữ chỗ trong cửa sổ; giao diện hiện "Số này vừa được chuyển khỏi một tài khoản trong 7 ngày qua. Hoàn tác và đặt mật khẩu mới?".
- `POST /api/phone/undo {ticket, phone, password}` (`password` = mật khẩu mới, theo `pw.check`): trong một giao dịch khóa người dùng: bản ghi còn trong 7 ngày, chưa hoàn tác, `users.phone` vẫn là số đã đổi tới; đặt `users.phone` về số cũ; đặt mật khẩu mới; **xóa mọi phiên, thiết bị quen, phiên con**; đánh dấu `undone_at`; ghi `audit` (`phone_change_undone`) và `notices` kind `phone_change_undone`; mở phiên mới cho người vừa hoàn tác. Sau hoàn tác, chính tài khoản đó không được đổi số nữa trong `PHONE_CHANGE_DAYS` kể từ lần đổi gốc (ngăn kẻ lặp lại ngay).
- Số mới (của kẻ tấn công) được thả sau hoàn tác.
- **Khóa hoàn tác** (`POST /api/phone/undo-lock {password}`, cần phiên + mật khẩu): chủ tài khoản biết số cũ không còn do mình giữ (đã đưa hoặc trả SIM) thì đặt `closed_at`: hết giữ chỗ, không hoàn tác được nữa (số cũ có thể được người khác đăng ký). Trong thời gian hoàn tác `/api/me` trả `phoneUndo: {until}` và giao diện hiện thẻ "Bạn vừa đổi số điện thoại" kèm nút Khóa hoàn tác; màn đổi số nói rõ rủi ro này. Lý do: người cầm SIM cũ (đã đưa/trả) có thể lấy tài khoản qua hoàn tác; chủ thật phải có cách tắt.

**Hệ quả**: lời mời gia đình đang chờ gửi tới số mới (theo băm) tự hiện cho người này; lời mời gửi tới số cũ không còn hiện cho họ và, sau 7 ngày giữ chỗ, số cũ có thể được người khác đăng ký và nhận lời mời còn hiệu lực tới số đó (tối đa 14 ngày theo cơ chế hiện có, rủi ro chấp nhận). Quyền thành viên, vai trò, hồ sơ con gắn `user_id` nên không đổi; các app chỉ tham chiếu `user_id` nên không phải sửa; Console hiển thị số mới. Giao diện: thẻ "Đổi số điện thoại" ở Tài khoản (ô số `autocomplete="tel"`, ô OTP `autocomplete="one-time-code"`), sau khi xong hiện "Đã đổi số. Các thiết bị khác đã bị đăng xuất."

### 4.7 Thông báo thiết bị mới (trong app, không SMS)

Khi đăng nhập thành công (đăng nhập thường, đặt lại mật khẩu không tính vì đã có `password_reset`) từ **thiết bị không quen** (`nine_dev` không khớp bảng `devices`) trong khi tài khoản đã có ít nhất một phiên khác đang hiệu lực: ghi `notices` kind `new_device` cho tài khoản (không kèm số điện thoại/IP; chỉ nhãn thiết bị đã có ở `sessions.ua` được hiện ở trang Thiết bị). Tối đa một thông báo `new_device` mỗi giờ mỗi tài khoản. Thông báo ghi kèm phiên gây ra nó (`notices.except_session`) và **chỉ hiện, và chỉ đánh dấu "đã xem" được, ở các phiên tạo TRƯỚC thông báo** (so `sessions.created_at` với `notices.created_at`): thiết bị vừa đăng nhập không thấy thông báo về chính nó, và kẻ có mật khẩu đăng nhập sau (kể cả cùng máy đã quen) không thấy và không dập được thông báo của chủ tài khoản. Các thiết bị còn lại thấy ở lần mở 9id kế tiếp qua `/api/me` (`unseenNotices`), kèm nút tới trang Thiết bị để thu hồi. Không gửi SMS hay đẩy ngoài app (chưa có kênh).

## 5. Kiểm thử

- 9id (`npm test`, PostgreSQL nhúng): phiên còn hiệu lực ở 364 ngày không dùng và hết ở 366; cookie `Max-Age` = 365 ngày (sửa kiểm thử cũ đang khẳng định 90 ngày); gia hạn cấp lại cookie; phiên thứ 31 đẩy **phiên ít dùng gần đây nhất** chứ không phải phiên tạo sớm nhất; `SESSION_DAYS`/`MAX_SESSIONS` đọc từ biến môi trường; đổi mật khẩu vẫn thu hồi phiên khác (hồi quy).
- Đổi số: thành công đổi `users.phone`, giữ phiên hiện tại, thu hồi phiên/thiết bị quen/phiên con khác, ghi `audit`/`notices`/`phone_changes`; OTP `phone_change` bị từ chối khi không có phiên hoặc số trùng số hiện tại; sai mật khẩu bị khóa tạm theo `reauth`; vé sai số/hết hạn/đã dùng bị từ chối; số đã thuộc tài khoản khác, số đang bị giữ chỗ và mã sai trả cùng thông điệp; đổi lần hai trong 30 ngày bị từ chối; hai yêu cầu đồng thời đổi sang cùng số chỉ một thắng; số cũ bị giữ chỗ 7 ngày với đăng ký, đổi số và nhập 9Sport, rồi được giải phóng sau 7 ngày; lời mời tới số mới hiện đúng; số điện thoại không xuất hiện trong `audit`/log.
- Hoàn tác: `verify` của số cũ trong cửa sổ có `phoneChangeUndoable`, ngoài cửa sổ hoặc số khác thì không; hoàn tác đúng trả số cũ, đặt mật khẩu mới, xóa mọi phiên của kẻ đổi (mật khẩu cũ không còn đăng nhập được), mở phiên mới, đánh dấu `undone_at`; không hoàn tác lần hai; không hoàn tác khi `users.phone` đã đổi tiếp; `maintenance()` xóa `old_phone` sau 8 ngày.
- Thông báo thiết bị mới: đăng nhập từ thiết bị lạ khi đã có phiên khác ghi một `notices` `new_device`; thiết bị quen, đăng nhập đầu tiên, hoặc quá một lần/giờ thì không; thiết bị vừa đăng nhập không thấy, thiết bị khác thấy.
- `nine.js` (node:test với `fetch` giả): `me()` trả người dùng/`null`, mạng lỗi thì reject, `login(next)` từ chối `next` ngoài nguồn gốc (`//evil`, `https://evil`, `\\evil`, `javascript:`), `require`, `logout` (có header CSRF, xóa bộ nhớ).
- Launcher (`launcher-ux2/tools/test.mjs`, Chrome thật với `/id/api/me` chặn giả): chưa đăng nhập hiện hai nút; đã đăng nhập hiện tên, số che, nút Đăng xuất; `/id/api/me` lỗi mạng thì launcher vẫn dùng được và không hiện lỗi; không thêm lỗi tương phản/mục tiêu bấm nhỏ so với các kiểm tra sẵn có.
- E2E chung (Chrome thật, 9id thật, máy chủ đệm cùng nguồn gốc gộp launcher và `/id/`): đăng ký bằng giao diện 9id (cổng OTP `mock`), quay về launcher đã đăng nhập; đóng và mở lại trình duyệt vẫn đăng nhập; đăng xuất ở launcher thì 9id cũng đăng xuất; đổi số bằng giao diện; ảnh 390x844, 360x740, 1280x800, sáng/tối.

## 6. Rủi ro còn lại

1. Phiên dài hơn tăng thiệt hại khi mất máy hoặc lộ cookie; bù bằng thu hồi từ xa, hỏi lại mật khẩu cho việc nhạy cảm, thông báo thiết bị mới trong app. Chưa có thông báo ngoài app (cần kênh, tốn SMS).
2. Mọi app cùng nguồn gốc chia sẻ cookie phiên: một lỗ hổng XSS ở một app có thể thực hiện thao tác thay người dùng đang đăng nhập (HttpOnly chỉ chống đọc cookie). Mọi app mới phải giữ CSP chặt.
3. Chi phí OTP: mỗi lần đăng ký/đặt lại/đổi số tốn một SMS; hạn mức mặc định 5 mã/số/ngày, 2.000 SMS/ngày toàn hệ (đã duyệt).
4. Đổi số: kẻ có cả phiên lẫn mật khẩu của nạn nhân vẫn đổi được, nhưng nạn nhân giữ số cũ hoàn tác được trong 7 ngày; nếu nạn nhân vừa mất số vừa bị chiếm tài khoản thì không có đường khôi phục tự động (cần quản trị viên). Ngược lại, người cầm SIM cũ (đã đưa/trả) có thể hoàn tác để lấy tài khoản: chủ thật phải chủ động bấm Khóa hoàn tác (có nhắc ở màn đổi số và thẻ trong Tài khoản).
   - Bảo trì dùng mốc 90 ngày cố định để xóa `phone_changes`; đặt `PHONE_CHANGE_DAYS` > 90 sẽ làm thời gian chờ mất tác dụng, và đặt `PHONE_CHANGE_DAYS` < `PHONE_UNDO_DAYS` cho phép đổi dây chuyền (xem mục 8).
5. Sau 7 ngày giữ chỗ, số cũ có thể được người khác đăng ký và nhận lời mời gia đình còn hiệu lực gửi tới số đó (tối đa 14 ngày).
6. Chưa lên server: dự án này chỉ chuẩn bị mã; deploy thuộc BACKLOG A2 và launcher theo `DEPLOY.md`.

## 7. Quyết định tự đưa ra (14/10/2026, theo ủy quyền của chủ sản phẩm)

- **Launcher**: sửa launcher thật (`launcher-ux2/`) thay vì Life OS cũ ở thư mục gốc, vì spec trước dựa trên giả định sai (launcher đang chạy không có tài khoản). Life OS cũ (`js/os.js`, `js/id.js`) để nguyên; đề nghị chủ sản phẩm quyết định xóa hay giữ (BACKLOG).
- **Đẩy thiết bị**: theo `last_used_at` thay vì ngày tạo (lỗi có thật của mã hiện tại khi nâng trần lên 30).
- **Hoàn tác 7 ngày + giữ chỗ số cũ 7 ngày**: thêm vào đổi số để bù rủi ro chiếm tài khoản mà không đòi OTP số cũ.
- **Thông báo thiết bị mới**: dùng bảng `devices` và `notices` có sẵn; không SMS.
- **Không sửa kiểm thử cũ trừ khi mâu thuẫn trực tiếp với spec** (chỉ kiểm thử khẳng định 90 ngày/`Max-Age=7776000`).
- **Sau review độc lập (14/10/2026), sửa 5 mục Important:** (1) OTP `phone_change` không còn phân biệt số có chủ/chưa (hết lộ tài khoản); (2) `nine.js` nạp bất đồng bộ và chỉ chèn khi đúng JavaScript (launcher không bị chặn); (3) thông báo thiết bị mới chỉ hiện ở phiên tạo trước nó (hết dập được); (4) chỉ lưu băm số cũ (bỏ cột rõ `old_phone`); (5) thêm "Khóa hoàn tác" và cảnh báo rủi ro ở màn đổi số. Migration 004 được sửa tại chỗ vì chưa từng chạy ở môi trường nào ngoài kiểm thử.

## 8. Việc để sau (từ review, mức Minor)

Hạn mức OTP theo số tính riêng từng mục đích nên trần SMS tới một số tăng; kiểm thời gian chờ 30 ngày ngay lúc xin OTP đổi số (hiện kiểm sau khi đã gửi SMS); bảo trì dùng mốc 90 ngày cố định thay vì tính từ cấu hình (và nên kiểm ràng buộc `PHONE_CHANGE_DAYS` ≥ `PHONE_UNDO_DAYS` khi khởi động); `nine.js` chưa có ETag nên tải lại mỗi lần; cổng HTTP 80 của nginx (WebView ô tô) không phục vụ `/id/` và README 9id ghi "chỉ HTTPS"; `last_used_at` chỉ chính xác tới một giờ nên đẩy phiên theo "ít dùng nhất" cũng chỉ chính xác tới một giờ; bài kiểm thử riêng tư nên so cả `table.column` lẫn `column`; README thiếu hai biến `PHONE_CHANGE_DAYS`/`PHONE_UNDO_DAYS` trong bảng.
