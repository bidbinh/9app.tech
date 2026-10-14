# 9id đăng nhập chung (dự án 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chủ sản phẩm đã ủy quyền tự quyết định; thực thi inline). Steps dùng checkbox.

**Goal:** Phiên đăng nhập "mãi mãi", thông báo thiết bị mới, đổi số điện thoại có hoàn tác 7 ngày, thư viện trình duyệt `/id/nine.js`, và launcher thật hiển thị đăng nhập 9id.

**Architecture:** Sửa lõi `9id/` (Node, PostgreSQL, `node:test`), thêm `9id/public/nine.js`, thêm UI vào `9id/public/`, và sửa `launcher-ux2/` (JS cổ điển). Cookie chung `nine_sid` đã có.

**Tech Stack:** Node 20, PostgreSQL nhúng (`npm test` trong `9id/`), puppeteer-core cho e2e (cài ngoài repo, biến `PUPPETEER_CORE`).

**Spec:** `docs/superpowers/specs/2026-10-14-9id-dang-nhap-chung-design.md` (nguồn quyết định; plan này lập luận từ đó).

## Global Constraints

- Không deploy, không ghi lên máy chủ, không push (cần chủ sản phẩm). Không sửa Life OS cũ (`js/os.js`, `js/id.js`, `index.html` ở gốc), `js/apps.js`, `search.js`.
- Mọi thay đổi 9id có test đỏ trước, rồi xanh; `cd 9id && npm test` phải xanh toàn bộ ở cuối mỗi task.
- Không đưa số điện thoại, mật khẩu, mã OTP vào `audit`, `notices`, log. Số điện thoại lưu E.164 như hiện có; thông điệp lỗi "số đã dùng/giữ chỗ/mã sai" **giống nhau**: `Không thể dùng số này hoặc mã chưa đúng`.
- Giao diện tiếng Việt; chỉ dùng `textContent`/tạo nút bằng `N.h`; không `innerHTML` với dữ liệu người dùng.
- Mặc định mới: `SESSION_DAYS=365`, `MAX_SESSIONS=30`, `PHONE_CHANGE_DAYS=30`, giữ chỗ/hoàn tác 7 ngày (hằng số `PHONE_UNDO_DAYS=7`, đọc từ biến môi trường).
- Commit cuối mỗi task, tiếng Việt, kèm dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; git dùng `-c user.name="Claude (9ship build)" -c user.email=ttrongbinh@gmail.com`.

## Review Focus

1. Đẩy phiên khi vượt trần phải theo `last_used_at`; người đang dùng phiên chính không bị đăng xuất (Task 1).
2. Đổi số: hai yêu cầu đồng thời, vé của số khác, số bị giữ chỗ, đổi lần hai < 30 ngày, vé dùng lại (Task 3).
3. Hoàn tác: sau hoàn tác mật khẩu cũ của kẻ tấn công không đăng nhập được; không hoàn tác khi số đã đổi tiếp hoặc quá 7 ngày; không rò rỉ số điện thoại ở phản hồi/`audit` (Task 4).
4. `Nine.login(next)` không bao giờ chuyển tới nguồn gốc khác (`//evil`, `https:`, `\\evil`, `javascript:`) (Task 6).
5. Launcher vẫn dùng được khi `/id/api/me` lỗi mạng hoặc trả HTML/404 (9id chưa lên server) và không bị lỗi JS (Task 7).

---

### Task 1: Chính sách phiên (365 ngày, 30 thiết bị, đẩy theo ít dùng nhất)

**Files:** Modify `9id/src/config.js` (dòng ~103-104), `9id/src/auth.js` (`createSession`), `9id/test/auth.test.js` (kiểm thử `Max-Age=7776000`); Create `9id/test/session-policy.test.js`; Modify `9id/README.md` (bảng biến môi trường).

**Interfaces:** Produces `config.sessionDays`, `config.maxSessions` (đọc env `SESSION_DAYS`, `MAX_SESSIONS`); `createSession` đẩy phiên có `last_used_at` nhỏ nhất.

- [ ] Viết `session-policy.test.js` (đỏ trước): (1) cookie đăng ký có `Max-Age=31536000`; (2) phiên đặt `last_used_at = now()-364 ngày` (UPDATE trực tiếp) vẫn `GET /api/me` có user, `-366 ngày` thì `user: null`; (3) với `config.maxSessions` tạm bằng 3: tạo 3 phiên A (cũ nhất theo `created_at` nhưng vừa dùng), B, C, đặt `last_used_at` của B nhỏ nhất, đăng nhập thêm phiên D → B bị xóa, A giữ; (4) `config.sessionDays` và `config.maxSessions` đọc được từ env khi nạp lại cấu hình (kiểm bằng hàm thuần `readSessionPolicy(env)` xuất từ `config.js`).
- [ ] Chạy `npm test` trong `9id/`: thấy đỏ đúng chỗ.
- [ ] Sửa `config.js`: `sessionDays: int(env.SESSION_DAYS, 365)`, `maxSessions: int(env.MAX_SESSIONS, 30)`, xuất `readSessionPolicy`. Sửa `createSession`: `ORDER BY last_used_at DESC, created_at DESC LIMIT $2`; phiên vừa tạo luôn nằm trong nhóm giữ (`last_used_at` mặc định `now()`). Sửa `auth.test.js` dòng khẳng định `Max-Age=7776000` thành `31536000`.
- [ ] `npm test` xanh; commit.

### Task 2: Thông báo thiết bị mới

**Files:** Modify `9id/src/routes/auth.js` (`startSession`, hàm mới `noteNewDevice`); Create `9id/test/new-device.test.js`.

**Interfaces:** Consumes `knownDevice`, bảng `devices`, `sessions`, `notices`. Produces kind `new_device`.

- [ ] Test (đỏ): (1) đăng ký lần đầu không tạo `new_device`; (2) A đăng nhập trên máy 1 (đã có phiên), đăng nhập từ máy 2 (client mới không có `nine_dev`) → có đúng 1 `notices` `new_device` cho tài khoản; máy 1 gọi `/api/me` thấy thông báo, phản hồi đăng nhập của máy 2 không chứa `new_device` trong `notices`; (3) máy 2 đăng nhập lần nữa trong 1 giờ → vẫn 1 thông báo; (4) máy quen (đã có `nine_dev`) đăng nhập lại → không thêm; (5) tài khoản không còn phiên nào khác (đăng xuất hết) → không thông báo; (6) `notices.kind` không chứa số điện thoại.
- [ ] Cài đặt: trong `startSession` (chỉ đường đăng nhập thường, không đường đặt lại mật khẩu vì đã có `password_reset`, không đăng ký): trước `createSession` tính `known = await knownDevice(ctx, userRow.id)` và `others = số phiên hiệu lực`; sau khi tạo phiên, nếu `!known && others > 0` và chưa có `new_device` trong 1 giờ thì chèn thông báo; đánh dấu `seen_at = now()` ngay cho phiên mới bằng cách lọc `unseenNotices` theo thời điểm: phản hồi của chính đăng nhập này không liệt kê thông báo `new_device` vừa tạo (lọc theo id).
- [ ] `npm test` xanh; commit.

### Task 3: Đổi số điện thoại (backend)

**Files:** Create `9id/db/004_phone_change.sql`, `9id/src/routes/phone.js`, `9id/test/phone-change.test.js`; Modify `9id/src/otp.js` (PURPOSES), `9id/src/routes/auth.js` (xin OTP `phone_change` cần phiên; chặn đăng ký/nhập 9Sport vào số bị giữ chỗ), `9id/src/server.js` (đăng ký route, `maintenance`), `9id/src/config.js`, `9id/src/util.js` nếu cần hàm dùng chung.

**Interfaces:** `phone_changes(id bigserial PK, user_id uuid REFERENCES users ON DELETE CASCADE, old_phone text, new_phone_hash text NOT NULL, changed_at timestamptz DEFAULT now(), undone_at timestamptz)` với chỉ mục `(user_id, changed_at DESC)` và chỉ mục `(old_phone)` WHERE `undone_at IS NULL`. Hàm `isPhoneHeld(c, phone, exceptUserId)` trong `routes/phone.js`: true nếu có `phone_changes.old_phone = phone`, `undone_at IS NULL`, `changed_at > now() - PHONE_UNDO_DAYS` và `user_id <> exceptUserId`. Endpoint `POST /api/phone/change {ticket, phone, password}` → `{ok:true}`.

- [ ] Test (đỏ): xin OTP `phone_change` không có phiên → 401; cùng số hiện tại → 400; đủ luồng thành công đổi `users.phone`, giữ phiên hiện tại, xóa phiên khác + `devices` + `app_sessions`, ghi `audit` (không chứa số) và `notices` `phone_changed`, có hàng `phone_changes`; sai mật khẩu → 403 và đếm khóa tạm; vé của số khác / hết hạn / đã dùng → 400 `ticket_invalid`; số đã thuộc tài khoản khác → thông điệp chung (cùng `message` với mã sai); đổi lần hai trong 30 ngày → 429/409 có thông điệp rõ; hai yêu cầu đồng thời đổi hai tài khoản sang cùng số chỉ một thắng; số cũ trong 7 ngày: `/api/register` và `/api/otp` → đăng ký vào số cũ bị chặn bằng thông điệp chung, tài khoản khác đổi sang số cũ bị chặn; chính chủ (user_id) không bị chặn; sau 7 ngày (UPDATE `changed_at`) người khác đăng ký được; lời mời tới số mới hiện cho người đổi (`pendingInvitations`).
- [ ] Cài đặt migration, `PURPOSES` thêm `'phone_change'`, kiểm phiên khi `purpose === 'phone_change'` trong route `/api/otp/request`, route `change`, `isPhoneHeld` gọi trong `/api/register`, `/api/register/9sport`, và `change`. `maintenance()`: `UPDATE phone_changes SET old_phone = NULL WHERE changed_at < now() - interval '8 days'` và xóa dòng > 90 ngày.
- [ ] `npm test` xanh; commit.

### Task 4: Hoàn tác đổi số

**Files:** Modify `9id/src/routes/phone.js`, `9id/src/otp.js` (`verifyOtp` thêm `phoneChangeUndoable`), `9id/test/phone-change.test.js` (hoặc `phone-undo.test.js`).

**Interfaces:** `POST /api/phone/undo {ticket, phone, password}` → phản hồi như đăng nhập (`startSession`). `verifyOtp` trả thêm `phoneChangeUndoable: boolean` (true khi `isPhoneHeld(null, phone)` trong cửa sổ).

- [ ] Test (đỏ): xác minh OTP số cũ trong 7 ngày → `phoneChangeUndoable: true`, số khác/quá hạn → false (hoặc vắng); `undo` thành công: `users.phone` về số cũ, mật khẩu mới đăng nhập được và **mật khẩu cũ của kẻ đổi không**, mọi phiên/thiết bị/`app_sessions` của tài khoản bị xóa, phiên mới mở, `undone_at` khác null, `audit` `phone_change_undone` + `notices` `phone_change_undone`; undo lần hai → lỗi; undo khi `users.phone` đã đổi tiếp sang số khác → lỗi; undo sau 7 ngày → lỗi; undo bằng vé của số khác → `ticket_invalid`; sau undo tài khoản đó không đổi số được trong 30 ngày kể từ lần đổi gốc; số của kẻ tấn công được thả (đăng ký lại được).
- [ ] Cài đặt `undo` trong một giao dịch (khóa hàng người dùng, `FOR UPDATE`).
- [ ] `npm test` xanh; commit.

### Task 5: Giao diện 9id (đổi số, hoàn tác, thông báo, câu chữ)

**Files:** Modify `9id/public/account.js`, `9id/public/auth.js`, `9id/public/ui.js` (nếu cần hằng số), `9id/public/style.css` (nếu cần), `9id/scripts/e2e.js` (thêm ca đổi số).

- [ ] Thêm thẻ "Đổi số điện thoại" vào trang Tài khoản: ô số mới (`autocomplete="tel"`), bước OTP (dùng lại thành phần OTP/PoW của đăng ký trong `public/auth.js`/`pow.js`, `autocomplete="one-time-code"`), ô mật khẩu hiện tại; sau thành công hiện "Đã đổi số. Các thiết bị khác đã bị đăng xuất." và làm mới `N.me`.
- [ ] Màn "Quên mật khẩu": sau `verify`, nếu `phoneChangeUndoable` hiện lựa chọn "Hoàn tác đổi số và đặt mật khẩu mới" gọi `POST /api/phone/undo`.
- [ ] Hiển thị các `notices` kind `new_device`, `phone_changed`, `phone_change_undone` (cùng chỗ hiện `password_reset`) kèm nút tới trang Thiết bị.
- [ ] Màn đăng ký thêm câu "Đăng ký một lần, dùng cho mọi app 9app cần đăng nhập."
- [ ] Mở rộng `npm run e2e` (nếu chạy được) hoặc kiểm bằng ảnh chụp trong Task 8; commit.

### Task 6: Thư viện `/id/nine.js`

**Files:** Create `9id/public/nine.js`, `9id/test/nine-client.test.js`.

**Interfaces:** Đối tượng toàn cục `Nine` với `me()`, `user()`, `login(next)`, `register(next)`, `logout()`, `require(ok)` như spec 4.2. Hàm thuần `Nine._safeNext(v)` để test.

- [ ] Test (đỏ), tải `nine.js` vào `vm` với `window`/`fetch`/`location` giả: `me()` trả người dùng hoặc `null`, nhớ kết quả, mạng lỗi/HTML/404 reject (không coi là đăng xuất); `_safeNext` trả `/` cho `//evil`, `https://evil`, `\\evil`, `javascript:alert(1)`, chuỗi rỗng, không phải chuỗi, và giữ nguyên `/tai-khoan?x=1#a`; `login/register` đặt `location.href` bằng `/id/?next=<mã hóa>#/dang-nhap` hoặc `#/dang-ky`; `logout()` gửi `POST /id/api/logout` với header `x-requested-with: 9id` rồi xóa bộ nhớ; `require(ok)` gọi `ok(user)` khi đã đăng nhập, ngược lại gọi login; tệp không dùng `let/const`, mũi tên, `class`, `import` (kiểm bằng biểu thức chính quy trên mã nguồn).
- [ ] Cài đặt ES5; kiểm bằng `GET /id/nine.js` trong test tích hợp (200, `text/javascript`).
- [ ] `npm test` xanh; commit.

### Task 7: Launcher thật (`launcher-ux2/`)

**Files:** Modify `launcher-ux2/index.html` (trang Tài khoản, nạp `/id/nine.js` trước `launcher.js`, tăng `?v=` của `launcher.js` lên 19), `launcher-ux2/js/launcher.js` (khối tài khoản), `launcher-ux2/css/style.css` (nếu cần), `launcher-ux2/tools/test.mjs` (thêm ca); Modify `launcher-ux2/DEPLOY.md` (ghi tệp đổi).

**Interfaces:** Consumes `Nine.me()`, `Nine.login/register/logout`. Không sửa `apps.js`, `search.js`.

- [ ] Thêm ca vào `tools/test.mjs` (đỏ): chặn `GET /id/nine.js` phục vụ từ `9id/public/nine.js`; chặn `GET /id/api/me` giả: (a) `{user:null}` → trang Tài khoản có nút "Đăng nhập" và "Đăng ký"; (b) `{user:{displayName:'Lan',phoneLast4:'1234'}}` → có "Lan", "***1234", "Đăng xuất", "Quản lý tài khoản", avatar hiện "L"; (c) trả 404/HTML/ngắt mạng → như chưa đăng nhập, **không có** lỗi JS/console lỗi/`pageerror` mới; bấm "Đăng nhập" chuyển tới `/id/?next=%2F%23%2Ftai-khoan#/dang-nhap`; đăng xuất gọi `POST /id/api/logout` đúng một lần; các kiểm tra sẵn có (tương phản, mục tiêu bấm ≥ 44px) vẫn đạt.
- [ ] Cài đặt khối `account` trong `launcher.js` (ES5, `fold`/`$` như mã hiện có), nội dung HTML trong `index.html`; không thêm yêu cầu đăng nhập cho ô app.
- [ ] `node tools/test.mjs` in "TAT CA DAT"; commit.

### Task 8: E2E chung, README, BACKLOG

**Files:** Create `9id/scripts/e2e-shared.mjs`; Modify `9id/README.md`, `docs/BACKLOG.md`, `launcher-ux2/DEPLOY.md` (nếu chưa).

- [ ] `e2e-shared.mjs`: dựng 9id thật (PostgreSQL nhúng, OTP `mock`) và một máy chủ đệm cùng nguồn gốc: `/id/*` → 9id, còn lại → thư mục `launcher-ux2` (có `nine.js` do 9id phục vụ). Kịch bản bằng Chrome thật: mở launcher → Tài khoản → Đăng ký (qua giao diện 9id) → quay về launcher đã đăng nhập thấy tên; đóng và mở lại trình duyệt (cùng `userDataDir`) vẫn đăng nhập; đăng xuất ở launcher rồi mở `/id/` thấy đã đăng xuất; đổi số bằng giao diện 9id; ảnh 390x844, 360x740, 1280x800 sáng/tối vào `9id/shots/shared/`; in số ca đạt/lỗi.
- [ ] README: biến `SESSION_DAYS`, `MAX_SESSIONS`, `PHONE_CHANGE_DAYS`, `PHONE_UNDO_DAYS`; lệnh `npm run e2e:shared`. BACKLOG: tick dự án 1, thêm việc "dự án 2: tích hợp từng app" và "quyết định về Life OS cũ".
- [ ] Chạy `npm test` (9id), `node tools/test.mjs` (launcher-ux2), `npm run e2e:shared`; commit.

---

## Self-review (với spec)

Phủ spec: 4.1 → Task 1; 4.2 → Task 6; 4.3 → Task 7; 4.4 → Task 5; 4.6 → Task 3, 4, 5; 4.7 → Task 2, 5; mục 5 kiểm thử → từng task + Task 8. Mục 4.5 (khuôn mẫu) và dự án tích hợp từng app cố ý ngoài phạm vi.
