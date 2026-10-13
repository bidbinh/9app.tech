# 9stay Lát 1C: truy cập theo vai, tìm phòng trống, lịch và API HTTP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Đưa động cơ (lát 1A, 1B) ra qua HTTP có đăng nhập 9id và phân quyền theo vai, đúng ma trận quyền của đặc tả mục 11: CTV chỉ thấy đơn của mình và loại phòng (không thấy căn, chủ, giá chủ), chủ phòng chỉ thấy căn của mình, lễ tân không duyệt hoàn tiền, buồng phòng không thấy tên khách và giá.

**Architecture:** Lớp HTTP mỏng (không framework, theo mẫu `9lunch/src/http.js`) gọi thư viện hiện có trong `db.tx`. Danh tính từ cookie `nine_sid` qua `9id` (`verify`); quyền từ bảng `members` (một người một tổ chức) gắn vai. Mọi route kiểm quyền bằng `can(role, action)` và lọc dữ liệu theo vai ở máy chủ. Có tìm căn trống theo loại phòng và tự gán căn khi đặt theo loại.

**Tech Stack:** như 1A/1B; thêm `src/nine-id.js` (bản sao máy khách 9id, chỉ dùng `verify`).

**Spec:** `docs/superpowers/specs/2026-10-13-9stay-design.md` mục 7, 8, 11. Kế hoạch này ghi giao diện và danh sách test; mã đầy đủ nằm trong commit.

## Global Constraints

- Không bao giờ tin vai hay org do client gửi; luôn lấy từ `members` theo `userId` đã xác minh với 9id.
- Mọi route đổi dữ liệu cần header `X-Requested-With: 9stay` (CSRF) và nếu có `Origin` thì phải khớp host.
- CTV/sale: không thấy mã căn, tòa, chủ, giá sàn; đơn tự gán `agent_id` của họ, không đặt hộ người khác.
- Chủ phòng: chỉ căn có `owner_id` của họ; chặn/mở ngày chỉ trong căn của họ; khách chỉ hiện dạng ẩn một phần.
- Lỗi trả JSON `{ error: { code, message, detail? } }` với `AppError.status`; lỗi lạ trả 500 không lộ nội dung.
- Mã mời chỉ lưu băm; dùng một lần; hết hạn; thông báo lỗi không phân biệt "sai" với "hết hạn".

## Review Focus

1. Một CTV đoán id đơn của CTV khác / chủ khác / lễ tân: phải 404, không 403 (không lộ sự tồn tại).
2. Người dùng đã đăng nhập 9id nhưng chưa có `members`: mọi route nghiệp vụ trả 403.
3. Mã mời dùng hai lần đồng thời: đúng một người vào được.
4. Chủ phòng chặn ngày căn của chủ khác bằng cách đoán id căn.
5. Lễ tân hoàn tiền; buồng phòng gọi API đơn; CTV xem bản kê chủ: đều bị từ chối.

---

### Task 1: Thành viên, mã mời, ma trận quyền
**Files:** `9stay/db/006_access.sql`, `9stay/src/access.js`, `9stay/test/access.test.js`.
**Interfaces:** `bootstrapOrg(c, { name, userId, displayName }) -> { orgId, memberId }`; `createInvite(c, { orgId, role, ownerId = null, agentId = null, createdBy, ttlDays = 7 }, { now }) -> { id, code, expiresAt }`; `redeemInvite(c, { code, userId, displayName }, { now }) -> member`; `getMemberByUser(c, userId) -> member | null` (chỉ `active`); `setMemberStatus`; `can(role, action) -> boolean`; `ROLES`.
Tests: bootstrap; mã mời một lần dùng, hết hạn, sai mã, hai lần đồng thời; vai `chu` cần `ownerId` cùng org, `ctv/sale` cần `agentId` cùng org, vai khác không được kèm; một người một tổ chức; thành viên bị khóa không còn `getMemberByUser`; ma trận quyền từng vai; mã chỉ lưu băm.

### Task 2: Tìm căn trống, đặt theo loại phòng, lịch tổng
**Files:** `9stay/src/search.js`, `9stay/src/calendar.js`, `9stay/test/search.test.js`, `9stay/test/calendar.test.js`.
**Interfaces:** `freeUnits(c, { orgId, checkin, checkout, roomTypeId = null, adults = 1, children = 0 }, { now }) -> [{ unitId, code, roomTypeId, buildingId }]`; `roomTypeAvailability(...) -> [{ roomTypeId, name, free }]`; `createBookingForType(c, input, { now })` (thử lần lượt từng căn trống bằng SAVEPOINT, lỗi `no_availability` 409); `orgCalendar(c, { orgId, from, to, ownerId = null, guest = 'masked' }) -> { nights, units: [{ ..., cells }] }`.
Tests: căn trống tính đúng (đêm chưa mở, chủ chặn, đơn khác, đơn giữ chỗ quá hạn chưa thanh toán coi là trống, sức chứa); đặt theo loại gán căn đầu tiên trống, đầy thì `no_availability`, đặt đồng thời N khách cho M căn trống: đúng min(N, M) thành công, không trùng; lịch tổng đúng trạng thái; lọc theo chủ; khách ẩn một phần/không.

### Task 3: Lớp HTTP, xác thực 9id, route theo vai
**Files:** `9stay/src/nine-id.js`, `9stay/src/http.js`, `9stay/src/routes/*.js`, `9stay/src/server.js`, `9stay/test/helper-http.js`, `9stay/test/api-*.test.js`.
**Interfaces:** `createApp()` với `route(method, path, handler, opts)`, `listen`, `close`; `buildApp({ idClient })`; ngữ cảnh `ctx.member` (`{ orgId, role, ownerId, agentId, userId }`).
Route chính: `GET /healthz`, `GET /api/me`, `POST /api/invites`, `POST /api/invites/redeem`, `GET /api/calendar`, `GET /api/availability`, `POST /api/quotes`, `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/:id`, `POST /api/bookings/:id/{cancel,move,checkin,checkout,payments}`, `PUT /api/rates`, `POST /api/units/:id/release`, `GET /api/statements/owner`, `POST /api/statements/owner/freeze`, `POST /api/statements/owner/:id/payout`, `GET /api/statements/owner/:id/csv`, `GET /api/reports/custody`.
Tests: xác thực (không cookie 401, token hỏng 401, chưa là thành viên 403); CSRF; phân quyền từng vai theo Review Focus; rò rỉ dữ liệu (CTV không thấy căn/chủ); lỗi nghiệp vụ ánh xạ đúng mã HTTP; lỗi lạ trả 500 sạch; giới hạn kích thước body; `Origin` lạ bị từ chối.
