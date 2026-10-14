# Tích hợp 9id cho 9swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chủ sản phẩm đã ủy quyền tự quyết định; thực thi inline).

**Goal:** Người dùng 9swap đăng nhập 9id thì thấy lại cộng đồng của mình trên máy khác và nhận được các cộng đồng ẩn danh trên máy này; app vẫn chạy ẩn danh như cũ khi chưa đăng nhập hoặc 9id lỗi.

**Architecture:** Nhân khuôn mẫu 9lunch (`docs/superpowers/plans/2026-10-14-tich-hop-9id-9lunch-implementation.md`) cho `swap/`: `members.user_id`, `nine-session`, quyền theo phiên hoặc `user_id`, `GET /api/account` + `POST /api/account/claim`, thẻ "Tài khoản 9app".

**Tech Stack:** Node 20, PostgreSQL nhúng, `node:test` (`cd swap && npm test`), puppeteer-core cho e2e.

**Spec:** `docs/superpowers/specs/2026-10-14-tich-hop-9id-9swap-design.md` (và khuôn mẫu chung).

## Global Constraints

Như 9lunch (xem kế hoạch 9lunch): làm trong worktree `D:\9app-wt-id`; chỉ sửa `swap/` và tài liệu; không có `NINE_ID_SECRET` thì tích hợp tắt hẳn; `user_id` chỉ từ `verify` của 9id; 9id lỗi thì app chạy ẩn danh (chỉ `claim` trả 503); người ngoài/cookie giả nhận 404 như cũ; thành viên bị khóa vẫn bị khóa (403) theo người; tạo/gia nhập khi đã đăng nhập **không** nối `phien`; giao diện chỉ `textContent`; test đỏ trước rồi xanh; commit tiếng Việt kèm `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Thành viên bị khóa: khóa theo người ở mọi máy, gia nhập lại vẫn 403, nhận vào tài khoản giữ khóa (Task 2, 3).
2. Quyền theo `user_id`: người khác, cookie giả, đã rời, 9id lỗi, máy dùng chung sau đăng xuất (Task 2).
3. Nhận dữ liệu: chỉ của phiên này, không chiếm `user_id` khác, xung đột, đua, idempotent (Task 3).
4. Chọn danh tính xác định, một dòng mỗi cộng đồng; `unread`/`banned` đúng theo thành viên được chọn (Task 2).
5. Giao diện: 9id lỗi không hỏng trang chủ; tên chứa HTML không chạy (Task 4).

### Task 1: Cấu hình, máy khách 9id, `nine-session`, migration

Files: `swap/src/nine-id.js`, `swap/src/nine-session.js` (chép từ `9lunch/src`, cookie `nine_sid`, khóa mặc định `swap`), `swap/db/003_account.sql`, `swap/src/config.js`, `swap/src/auth.js` (`resolveSession`), `swap/test/helper.js` (Client giữ `nine_sid`), `swap/test/nine-session.test.js` (copy test của 9lunch + trần đệm, gộp đồng thời, `normPublicPath`).

- [ ] Test đỏ (như 9lunch Task 1 cộng các bài học review), cài đặt, `npm test` xanh, commit.

### Task 2: Quyền theo `user_id`, danh sách, tạo/gia nhập, `touch`

Files: `swap/src/auth.js` (`memberFor`, `requireMember`, `touch`), `swap/src/routes/communities.js`, `swap/src/http.js` (khóa tốc độ theo `u:userId`), `swap/src/idem.js`, `swap/test/account-access.test.js`.

- [ ] Test đỏ: như 9lunch Task 2 (máy mới, người khác/cookie giả 404, rời cộng đồng, gia nhập đã là thành viên không tạo trùng và không thêm `phien`, đua gia nhập, 9id lỗi, tắt tích hợp, đăng xuất trên máy dùng chung mất quyền, chọn xác định + một dòng mỗi cộng đồng) **và riêng 9swap:** thành viên có `user_id` bị chủ khóa (`banned_at`) thì máy mới đăng nhập cùng tài khoản nhận 403 `banned` ở thao tác thường và vẫn đọc được thông báo khóa; gia nhập lại bằng mã (mọi máy) 403; mở khóa thì dùng lại được.
- [ ] Cài đặt, `npm test` xanh, commit.

### Task 3: Nhận dữ liệu ẩn danh

Files: `swap/src/routes/account.js`, `swap/src/server.js`, `swap/test/account-claim.test.js`.

- [ ] Test đỏ như 9lunch Task 3 (cộng đồng thay nhóm) **và riêng 9swap:** nhận thành viên đang bị khóa thì khóa giữ nguyên; thành viên đã rời không nằm trong danh sách.
- [ ] Cài đặt (advisory lock theo người dùng, savepoint từng mục), `npm test` xanh, commit.

### Task 4: Thẻ Tài khoản ở giao diện và e2e

Files: `swap/public/home.js`, `swap/scripts/e2e-account.js`, `swap/package.json`, `swap/test/public-ui.test.js`.

- [ ] Test cấu trúc đỏ, thẻ giao diện như 9lunch (đặt cuối trang khi chưa có cộng đồng), e2e với 9id giả (Chrome thật), chạy e2e cũ của 9swap để hồi quy, xem ảnh, commit.

### Task 5: Tài liệu và backlog

Files: `swap/README.md`, `swap/.env.example`, `docs/BACKLOG.md`.

- [ ] README "Tài khoản 9id" như 9lunch (khóa `swap` trong `INTERNAL_KEYS`), `.env.example`, BACKLOG tick 9swap; `npm test` xanh; commit.
