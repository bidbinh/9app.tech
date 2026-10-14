# Tích hợp 9id cho 9lunch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chủ sản phẩm đã ủy quyền tự quyết định; thực thi inline).

**Goal:** Người dùng 9lunch đăng nhập 9id thì thấy lại nhóm của mình trên máy khác và nhận được các nhóm ẩn danh đang có trên máy này; app vẫn dùng được ẩn danh như cũ khi chưa đăng nhập hoặc khi 9id lỗi.

**Architecture:** Giữ nguyên mô hình `phien` ẩn danh; thêm `members.user_id`, đọc cookie `nine_sid` qua `verify` của 9id (đệm, cầu dao), quyền xét theo phiên **hoặc** `user_id`, hai endpoint `GET /api/account` và `POST /api/account/claim`, thẻ "Tài khoản" ở trang chủ.

**Tech Stack:** Node 20, PostgreSQL nhúng, `node:test` (`cd 9lunch && npm test`), JS thuần ở giao diện, puppeteer-core cho e2e.

**Spec:** `docs/superpowers/specs/2026-10-14-tich-hop-9id-khuon-mau-design.md` (mục 3 khuôn mẫu, mục 4 phần riêng 9lunch).

## Global Constraints

- Làm trong worktree `D:\9app-wt-id` (nhánh `feat/9id-integration`). Chỉ sửa `9lunch/`, tài liệu và BACKLOG; không đụng 9id, 9stay, launcher.
- Không có `NINE_ID_SECRET` (hoặc < 32 ký tự) và không có máy khách giả được bơm vào thì tích hợp **tắt hẳn**: mọi hành vi và mọi test cũ giữ nguyên.
- `user_id` chỉ lấy từ kết quả `verify` của 9id; không bao giờ từ body/query/header do client gửi.
- 9id lỗi: app vẫn chạy ẩn danh, không 5xx ở các route cũ; chỉ `POST /api/account/claim` trả 503.
- Người ngoài/cookie giả nhận 404 như cũ (không lộ tồn tại). Không ghi số điện thoại/token vào log.
- Giao diện tiếng Việt, `textContent`/`L9.h` (không `innerHTML` với dữ liệu người dùng), CSP chặt như hiện tại.
- Mỗi task: test đỏ trước rồi xanh; `cd 9lunch && npm test` xanh toàn bộ ở cuối task; commit tiếng Việt kèm dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; git dùng `-c user.name="Claude (9ship build)" -c user.email=ttrongbinh@gmail.com`.

## Review Focus

1. Quyền theo `user_id`: người dùng khác, cookie `nine_sid` giả/hết hạn, thành viên đã rời nhóm, 9id lỗi (Task 2).
2. Nhận dữ liệu: chỉ của phiên ẩn danh hiện tại, không chiếm thực thể đã có `user_id`, xung đột cùng nhóm, đua hai yêu cầu, idempotent (Task 3).
3. Gia nhập nhóm khi đã là thành viên (qua `user_id`) và đua hai yêu cầu cùng lúc: không tạo trùng, không 500 (Task 2).
4. Tắt tích hợp: không bí mật = hành vi cũ, không gọi mạng ra ngoài (Task 1).
5. Giao diện: 9id lỗi hoặc chưa lên không làm hỏng trang chủ; tên hiển thị chứa HTML không chạy (Task 4).

---

### Task 1: Cấu hình, máy khách 9id, `nine-session`, migration

**Files:** Create `9lunch/src/nine-id.js` (chép từ `9family/src/nine-id.js`), `9lunch/src/nine-session.js`, `9lunch/db/003_account.sql`, `9lunch/test/nine-session.test.js`; Modify `9lunch/src/config.js`, `9lunch/src/auth.js` (`resolveSession`), `9lunch/test/helper.js` (Client giữ thêm cookie `nine_sid`, `setIdClient`).

**Interfaces:** `idEnabled() -> boolean`; `setIdClient(c|null)` (kiểm thử; `c.verify(token) -> {userId, displayName}|null`, có thể ném lỗi); `verifyToken(token) -> {userId, displayName}|null` (ném khi 9id không đạt được); `resolveUser(ctx)` đặt `ctx.userId`, `ctx.userName`, `ctx.idDown`; `flushCaches()`.

- [ ] Test đỏ: (1) không bí mật và không máy khách -> `idEnabled()` false, `resolveUser` không gọi gì, `ctx.userId` undefined/null; (2) token sai định dạng không gọi `verify`; (3) token hợp lệ -> `ctx.userId`, gọi `verify` một lần trong 60 giây (đệm); (4) `verify` trả `null` -> `ctx.userId = null`, lần sau trong 15 giây không gọi lại (đệm âm), sau đó gọi lại; (5) `verify` ném lỗi hạ tầng -> `ctx.idDown = true`, `ctx.userId = null`, không ném; sau đó trong `idBreakMs` không gọi lại (cầu dao) rồi thử lại; (6) `userId` trả về không phải UUID -> coi là 9id lỗi (`idDown`); (7) migration tạo cột `members.user_id` và chỉ mục duy nhất từng phần (chèn hai thành viên hoạt động cùng `(team_id, user_id)` bị từ chối; thành viên đã `left_at` không chặn).
- [ ] Cài đặt theo spec mục 3.1-3.3 và 4. `resolveSession` đọc `ctx.cookies.nine_sid` chỉ khi `idEnabled()`.
- [ ] `npm test` xanh; commit.

### Task 2: Quyền theo `user_id`, danh sách nhóm, tạo/gia nhập nhóm

**Files:** Modify `9lunch/src/auth.js` (`memberFor`, `requireMember`, `touch`), `9lunch/src/routes/teams.js` (danh sách, tạo, gia nhập); Create `9lunch/test/account-access.test.js`.

**Interfaces:** `memberFor(q, who, teamId)` với `who` là `{sid, userId}` hoặc chuỗi `sid`; trả hàng `members` hoặc null.

- [ ] Test đỏ (bơm máy khách 9id giả `tokens: {TA: userA, TB: userB}`): máy không có `lsid` nhưng có `nine_sid=TA` mở được nhóm mà userA là thành viên (xem nhóm, bình chọn/thao tác đúng vai chủ/thành viên); userB, cookie `nine_sid` giả và hết hạn nhận 404; thành viên đã rời nhóm (`left_at`) mất quyền dù còn `user_id`; `GET /api/teams` của máy mới có `nine_sid` trả đúng nhóm, máy không có cả hai trả rỗng; tạo nhóm khi đăng nhập -> thành viên có `user_id` và nhóm hiện trên máy khác; gia nhập bằng mã khi đã là thành viên qua `user_id` trả `already: true` và không tạo hàng mới, thêm `phien` cho phiên hiện tại; hai yêu cầu gia nhập đồng thời cùng người dùng chỉ ra một thành viên (không 500); khi 9id lỗi (máy khách giả ném) nhóm ẩn danh vẫn dùng bình thường; hồi quy: toàn bộ test cũ.
- [ ] Cài đặt. Truy vấn quyền: `EXISTS(phien ... token_hash = $sid) OR ($uid IS NOT NULL AND m.user_id = $uid)`.
- [ ] `npm test` xanh; commit.

### Task 3: Nhận dữ liệu ẩn danh vào tài khoản

**Files:** Create `9lunch/src/routes/account.js`, `9lunch/test/account-claim.test.js`; Modify `9lunch/src/server.js` (đăng ký route).

**Interfaces:** `GET /api/account -> {enabled, loggedIn, idDown, user: {displayName}|null, loginPath, claimable: [{teamId, teamName, myName}], conflicts: [{teamId, teamName}]}`; `POST /api/account/claim -> {claimed: [{teamId, teamName}], skipped: [{teamId, teamName, reason}]}`.

- [ ] Test đỏ: tắt tích hợp -> `{enabled:false, loggedIn:false, claimable:[], conflicts:[]}`; chưa đăng nhập -> `enabled:true, loggedIn:false`, `claim` 401 kèm `login`; đã đăng nhập: `claimable` chỉ gồm thành viên của **phiên này** (phiên khác không lộ), chưa có `user_id`, còn hoạt động; `claim` gắn `user_id`, idempotent (lần hai `claimed: []`), nhóm hiện sau đó trên máy mới; xung đột (người dùng đã có thành viên hoạt động ở cùng nhóm) nằm ở `conflicts` và bị `skipped` với `reason: 'da_co_thanh_vien'`, thành viên ẩn danh giữ nguyên; thành viên đã có `user_id` khác không bao giờ bị chiếm; thành viên đã rời nhóm không nằm trong danh sách; hai yêu cầu `claim` đồng thời không lỗi và không trùng; 9id lỗi -> `GET` trả `idDown:true, loggedIn:false`, `claim` 503; tên hiển thị chứa HTML trả nguyên văn (giao diện dùng textContent).
- [ ] Cài đặt trong giao dịch (`FOR UPDATE` các thành viên ứng viên, kiểm chỉ mục duy nhất, bắt vi phạm như "bỏ qua").
- [ ] `npm test` xanh; commit.

### Task 4: Thẻ Tài khoản ở giao diện và e2e

**Files:** Modify `9lunch/public/home.js` (và `ui.js`/`style.css` nếu cần), `9lunch/public/index.html` (không thêm script ngoài); Create `9lunch/scripts/e2e-account.js`; Modify `9lunch/package.json` (script `e2e:account`); Test thêm trong `9lunch/test/` kiểm cấu trúc tĩnh nếu phù hợp.

- [ ] Viết `e2e-account.js` (đỏ trước): dựng PostgreSQL nhúng, 9id giả HTTP (`/id/internal/v1/verify`: token -> người dùng; token lạ -> 401 `invalid_session`; chế độ lỗi 500; `/id/api/logout`), app 9lunch thật với `NINE_ID_URL` trỏ giả và bí mật 40 ký tự; Chrome thật: tạo nhóm ẩn danh -> thẻ mời đăng nhập; bấm Đăng nhập chuyển tới `/id/?next=...#/dang-nhap` (chặn điều hướng); đặt cookie `nine_sid` -> thẻ liệt kê nhóm chưa gắn, bấm Gắn -> báo thành công; ngữ cảnh trình duyệt mới (không `lsid`) với cùng `nine_sid` thấy nhóm và mở được; người dùng khác không thấy; 9id lỗi -> không thẻ, danh sách nhóm ẩn danh vẫn dùng được; tên hiển thị `<img onerror>` không chạy; không lỗi console; ảnh 390x844, 360x740, 1280x800 sáng/tối vào `shots/account/`.
- [ ] Cài đặt thẻ theo spec mục 3.7 (`L9.get('api/account')`, liên kết đăng nhập tự dựng cùng nguồn gốc: `loginPath + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash) + '#/dang-nhap'`, đăng xuất bằng `fetch(loginPath + 'api/logout', {method:'POST', credentials:'same-origin', headers:{'x-requested-with':'9id'}})` rồi tải lại).
- [ ] Chạy `npm test`, `node scripts/e2e-account.js`, `node scripts/e2e.js` (hồi quy giao diện cũ); xem ảnh; commit.

### Task 5: Tài liệu, triển khai, backlog

**Files:** Modify `9lunch/README.md`, `9lunch/.env.example`, `9lunch/docker-compose.server.yml` (không cần đổi nếu dùng `env_file`; kiểm), `docs/BACKLOG.md`.

- [ ] README: mục "Tài khoản 9id" (biến môi trường, hành vi tắt/bật, cách thêm khóa `lunch` vào `INTERNAL_KEYS` của 9id, thử với 9id thật, API `account`); `.env.example` thêm biến (để trống bí mật); BACKLOG: tick 9lunch ở dự án 2, ghi các dự án còn lại (9swap, 9hire, 9tutor, dịch vụ đồng bộ) kèm khuôn mẫu.
- [ ] `npm test` xanh; commit.

---

## Self-review (với spec)

Phủ spec: mục 3.1-3.3 → Task 1; 3.4-3.5 và mục 4 (quyền, danh sách, tạo/gia nhập, rời nhóm) → Task 2; 3.6 → Task 3; 3.7 → Task 4; 3.8 → Task 5. Mục 5 kiểm thử → từng task. Mục 7 cố ý để sau.
