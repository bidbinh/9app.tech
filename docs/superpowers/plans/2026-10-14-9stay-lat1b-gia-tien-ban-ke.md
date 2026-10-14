# 9stay Lát 1B: nhả giữ chỗ, bảng giá và báo giá, sổ tiền, quyết toán và bản kê

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Thay phần "tiền" của Sheet QuyPhong: đơn giữ chỗ tự hết hạn, báo giá tính từ bảng giá, ghi cọc bằng tay vào sổ kép, quyết toán khi trả phòng (phần chủ / phần Anstay / hoa hồng / phí dọn), bản kê chủ phòng và hoa hồng xuất CSV.

**Architecture:** Tiếp nối lát 1A (thư viện thuần, hàm nhận `c` từ `db.tx`, đồng hồ tiêm qua `now`). Hàm tính giá là hàm thuần (`computeQuote`), phần CSDL chỉ nạp dữ liệu và lưu. Sổ kép chỉ thêm, mỗi giao dịch cân bằng bằng ràng buộc hoãn ở CSDL, idempotent theo `ref`. Quyết toán ghi bảng `settlements` bất biến cùng giao dịch sổ.

**Tech Stack:** như lát 1A (Node >= 20 ESM, `pg`, `node:test`, PostgreSQL thật qua embedded-postgres).

**Spec:** `docs/superpowers/specs/2026-10-13-9stay-design.md` mục 4, 6, 7, 10. Ghi chú: kế hoạch này ghi giao diện (tên hàm, tham số, quy tắc, danh sách test); mã đầy đủ nằm trong commit của từng task.

## Global Constraints

- Tiền là số nguyên VND. Làm tròn tới nghìn (setting `pricing.roundTo`, mặc định 1000) theo kiểu half-up, **một lần ở từng dòng lưu**, không làm tròn trung gian.
- Đường tính cố định theo từng đêm: giá nền → + phụ thu người/trẻ → − **một** ưu đãi → làm tròn dòng đêm → cộng các đêm → VAT trên tổng → làm tròn VAT → tổng. Giá khách thấy đã gồm VAT.
- Dòng giá (`price_lines`), sổ (`ledger_*`), `settlements`, bản kê đã đóng băng: **chỉ thêm**, có trigger chặn UPDATE/DELETE. Sửa bằng dòng điều chỉnh.
- Sự kiện chỉ chứa id và ngày, không PII. Mọi hàm nhận `orgId` và kiểm id bằng `assertUuid`.
- Mọi hàm đổi dữ liệu chạy trong `db.tx`; lỗi nghiệp vụ là `AppError`.
- Cùng thứ tự khóa như lát 1A: booking → release (căn, đêm) → room_nights; không thêm khóa mới chen giữa.
- Không đụng tệp ngoài `9stay/` và `docs/`.

## Review Focus

1. Ghi cọc hai lần cùng `ref` không nhân đôi tiền; hai người ghi đồng thời cùng một đơn.
2. Làm tròn: dòng đêm 645.500 → 646.000; VAT 202.500 → 203.000; tổng các dòng lệch tổng gốc không quá làm tròn một lần.
3. Quyết toán chạy hai lần không chia tiền hai lần; đơn không có hợp đồng chủ hoặc đêm nằm ngoài hạn hợp đồng bị từ chối rõ ràng.
4. Đơn nửa chừng hợp đồng đổi (đêm 1 theo hợp đồng A, đêm 2 theo hợp đồng B) chia theo từng đêm.
5. Tổng bản kê chủ = tổng `settlements` trong kỳ; một quyết toán không nằm trong hai bản kê.

---

### Task 1: Nhả đơn giữ chỗ quá hạn

**Files:** Modify `9stay/src/bookings.js`, `9stay/src/inventory.js`; Test `9stay/test/expire.test.js`; sửa kỳ vọng `9stay/test/bookings.test.js` (test `unitAvailability`).

**Interfaces:**
- Produces: `expireHolds(c, { orgId, now = new Date() }) -> Promise<string[]>` (id các đơn vừa hết hạn). `unitAvailability(c, { orgId, unitId, from, to })` trả thêm `state: 'held'` (đơn `giu`) kèm `holdUntil`; đơn `da_coc` trở lên vẫn `booked`. `blockNights` nhận thêm `now`. `moveBooking` ném `hold_expired` (409) với đơn `giu` quá hạn.
- Quy tắc: `UPDATE ... SKIP LOCKED` (không chờ đơn đang bị giao dịch khác khóa); quét "lười" ở đầu `createBooking` (sau `validateStay`), `moveBooking`, `blockNights`.

Tests: chỉ nhả đúng đơn `giu` quá hạn; đơn `da_coc` và `giu` còn hạn giữ nguyên; đêm được trả; sự kiện `expired` chỉ có id; đặt mới đè lên đơn quá hạn được và đơn cũ thành `het_han`; chủ chặn được đêm của đơn quá hạn nhưng không chặn được đêm của đơn còn hạn; dời đơn quá hạn bị `hold_expired`; không nhả đơn của org khác; `unitAvailability` trả `held` kèm `holdUntil`.

### Task 2: Bảng giá, báo giá, dòng giá

**Files:** Create `9stay/db/002_pricing.sql`, `9stay/src/pricing.js`, `9stay/src/money.js`; Modify `9stay/src/settings.js` (thêm mặc định), `9stay/src/bookings.js` (nhận `quoteId`); Test `9stay/test/money.test.js`, `9stay/test/quote.test.js`, `9stay/test/pricing.test.js`.

**Interfaces:**
- `money.js`: `roundTo(n, step = 1000) -> number` (half-up, n nguyên không âm).
- `pricing.js`:
  - `ensureRatePlans(c, { orgId })` tạo hai gói `public`, `ctv` (idempotent), trả `{ public: id, ctv: id }`.
  - `setRates(c, { orgId, roomTypeId, planId, from, to, price, minStay = 1, closed = false, source = 'manual', by = null })` ghi `rate_calendar` cho `[from, to)` và ghi `rate_calendar_history`.
  - `createPromotion(c, { orgId, name, kind: 'pct'|'amount_per_night', value, minNights = 1, stayFrom, stayTo, planId = null, roomTypeId = null })`.
  - `computeQuote({ nights, rates: Map<night, {price, minStay, closed}>, adults, childAges, capacityStd, settings, promotion }) -> { ok, warnings[], lines[], subtotal, vat, total, deposit }` (thuần, không đụng CSDL; thiếu giá / đêm đóng / vi phạm min-stay thành `warnings`, `ok=false`).
  - `createQuote(c, { orgId, roomTypeId, planId, checkin, checkout, adults, childAges = [], by = null }, { now }) -> { id, expiresAt, ...computeQuote }`; chọn đúng **một** ưu đãi có lợi nhất cho khách.
  - `createBooking(..., { quoteId })`: kiểm báo giá còn hạn (`quote_expired`), khớp ngày/số khách/loại phòng của căn (`quote_mismatch`), ghi `price_lines` (kind `night` mỗi đêm, kind `vat`), đặt `deposit_required`.
- Mặc định mới trong `DEFAULTS`: `pricing.vatPct` 10, `pricing.extraAdultFee` 100000, `pricing.childFee` 50000, `pricing.childFreeMaxAge` 5, `pricing.childAdultMinAge` 12, `pricing.depositPct` 30, `pricing.quoteHours` 24, `pricing.roundTo` 1000.
- Lược đồ: `rate_plans`, `rate_calendar` (khóa chính `(room_type_id, plan_id, night)`), `rate_calendar_history`, `promotions`, `quotes`, `price_lines` (trigger chỉ thêm), cột `bookings.deposit_required`, `bookings.quote_id`.

Tests (thuần): 1 đêm; 3 đêm vắt cuối tuần; người lớn thứ 3 (+100k/đêm); trẻ 7 tuổi (+50k), trẻ 3 tuổi miễn, trẻ 13 tuổi tính người lớn; ưu đãi % đủ/thiếu số đêm; ưu đãi không vượt giá đêm; làm tròn dòng 645.500 → 646.000 và VAT 202.500 → 203.000; cọc 30% làm tròn; thiếu giá một đêm; đêm đóng; vi phạm min-stay. Tests (CSDL): `setRates` ghi lịch sử; báo giá chọn một ưu đãi tốt nhất, bỏ qua ưu đãi ngoài cửa sổ/đúng gói khác; báo giá lưu đúng và có hạn; đặt từ báo giá ghi `price_lines`, tổng khớp báo giá; báo giá hết hạn/lệch ngày/lệch loại phòng bị từ chối; `price_lines` không UPDATE/DELETE được.

### Task 3: Sổ kép và ghi cọc bằng tay

**Files:** Create `9stay/db/003_ledger.sql`, `9stay/src/ledger.js`, `9stay/src/payments.js`; Test `9stay/test/ledger.test.js`, `9stay/test/payments.test.js`.

**Interfaces:**
- `ledger.js`: `postTransaction(c, { orgId, kind, bookingId = null, ref, memo = '', entries: [{ account, partyId = null, amount }] }) -> { id, created }` — tổng `amount` bằng 0 (ghi nợ dương, ghi có âm); `ref` duy nhất trong org (gọi lại cùng `ref` trả giao dịch cũ, `created=false`); `accountBalance(c, { orgId, account, partyId = null }) -> number`.
- Tài khoản: `bank`, `guest_deposit_liability`, `held_for_owner` (party = owner), `anstay_revenue`, `vat_payable`, `commission_expense`, `agent_commission_payable` (party = agent), `cleaning_payable`, `cleaning_expense`, `receivable`.
- `payments.js`: `recordPayment(c, { orgId, bookingId, kind: 'deposit'|'payment'|'refund', amount, receivedOn, method = 'manual_bank', note = '', by = null, ref }, { now }) -> { paymentId, bookingStatus, paid, due }`; `bookingBalance(c, { orgId, bookingId }) -> { total, paid, due, depositRequired }`.
- Quy tắc: thu tiền → nợ `bank`, có `guest_deposit_liability`; hoàn → ngược lại, không vượt số đã thu; khi tổng đã thu ≥ `deposit_required` (và > 0) thì đơn `giu` → `da_coc`, xóa `hold_until`; không ghi thu cho đơn `huy`/`het_han`/`khong_den`.
- Lược đồ: `ledger_transactions` (unique `(org_id, ref)`), `ledger_entries` với ràng buộc hoãn "tổng mỗi giao dịch bằng 0", trigger chặn UPDATE/DELETE; `payments`.

Tests: giao dịch cân bằng/lệch; `ref` lặp không nhân đôi; trigger chặn sửa/xóa; `accountBalance`; thu cọc đủ thì `da_coc` và bỏ hạn giữ; thu thiếu giữ `giu`; hai lần cùng `ref` không cộng hai lần; hai người ghi đồng thời; hoàn quá số đã thu bị từ chối; thu cho đơn đã hủy bị từ chối; số tiền không nguyên/âm/0 bị từ chối.

### Task 4: Sale/CTV, nhận phòng, trả phòng và quyết toán

**Files:** Create `9stay/db/004_settlement.sql`, `9stay/src/agents.js`, `9stay/src/stay.js`; Test `9stay/test/stay.test.js`, `9stay/test/settlement.test.js`.

**Interfaces:**
- `agents.js`: `createAgent(c, { orgId, name, kind: 'sale'|'ctv', commissionPct }) -> { id }`.
- `stay.js`: `checkIn(c, { orgId, bookingId })` (chỉ từ `da_coc`); `checkOut(c, { orgId, bookingId, now })` (chỉ từ `da_nhan`, chỉ khi `due <= 0`; lỗi `balance_due` 409), ghi giao dịch sổ + `settlements` trong cùng giao dịch, `ref = 'settle:' + bookingId`.
- Quyết toán theo **từng đêm**: tìm hợp đồng của (căn, đêm) theo `daterange(valid_from, valid_to)`; không có thì `no_contract` (409). Phần chủ mỗi đêm = `min(tiền đêm, max(floor(tiền đêm × owner_share_pct / 100), owner_net_floor))`; `master_lease` thì phần chủ 0. Hoa hồng = `floor(tổng tiền đêm × commission_pct / 100)` nếu đơn có `agent_id`. Phí dọn = setting `ops.cleaningFee` (mặc định 150000) theo `cleaning_payer` của hợp đồng ở đêm cuối (`owner` trừ vào chủ, `anstay` là chi phí Anstay, `guest` bỏ qua).
- Bút toán (nợ +, có −): nợ `guest_deposit_liability` (doanh thu phòng + VAT); có `vat_payable` (VAT); có `held_for_owner[owner]` (phần chủ); có `anstay_revenue` (doanh thu phòng − phần chủ); nợ `commission_expense` / có `agent_commission_payable[agent]` (hoa hồng); phí dọn chủ trả: nợ `held_for_owner[owner]` / có `cleaning_payable`; phí dọn Anstay trả: nợ `cleaning_expense` / có `cleaning_payable`.
- `settlements` (bất biến, duy nhất theo `booking_id`): `owner_id, unit_id, agent_id, checkout_date, room_revenue, vat, owner_amount, anstay_amount, commission, cleaning_fee, cleaning_payer`.

Tests: nhận phòng từ `da_coc`, từ chối từ `giu`; trả phòng khi còn nợ bị `balance_due`; quyết toán chia đúng (có/không hoa hồng, `owner_net_floor`, `master_lease`, phí dọn ba loại); đêm theo hợp đồng khác nhau; không hợp đồng → `no_contract` và không để lại gì; gọi hai lần không chia hai lần; tổng bút toán bằng 0; số dư `held_for_owner` đúng.

### Task 5: Bản kê chủ phòng, bản kê hoa hồng, CSV

**Files:** Create `9stay/db/005_statements.sql`, `9stay/src/statements.js`; Test `9stay/test/statements.test.js`.

**Interfaces:**
- `ownerStatement(c, { orgId, ownerId, from, to }) -> { lines[], totals }` xem trước (chưa lưu): các quyết toán có `checkout_date` trong `[from, to)` chưa nằm trong bản kê đóng băng nào.
- `freezeOwnerStatement(c, { orgId, ownerId, from, to, by })` lưu `owner_statements` + `owner_statement_lines` (mỗi `settlement_id` chỉ một lần), `payable = Σ phần chủ − Σ phí dọn chủ trả`.
- `recordOwnerPayout(c, { orgId, statementId, paidOn, ref })` nợ `held_for_owner` / có `bank`, đánh dấu `paid`; không trả hai lần.
- `agentStatement`, `freezeAgentStatement`, `recordAgentPayout` tương tự với hoa hồng.
- `toCsv(rows, columns)` thuần: tiêu đề, dấu phân cách `,`, thoát dấu nháy kép và xuống dòng, chống chèn công thức (ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm `'`), BOM UTF-8 tùy chọn.
- `custodyReport(c, { orgId })` số dư `held_for_owner` theo từng chủ và tổng, so với số dư `bank` trong sổ.

Tests: xem trước khớp tổng; đóng băng loại đúng các quyết toán đã dùng; đóng băng lần hai không lặp dòng; kỳ không có quyết toán thì lỗi `empty_statement`; chi trả đúng bút toán và không trả hai lần; CSV thoát ký tự, chống công thức, tiếng Việt có dấu; `custodyReport` khớp sổ; tổng bản kê bằng tổng `settlements`.

### Task 6: Tài liệu và kiểm chứng cuối

Cập nhật `9stay/README.md`, `docs/BACKLOG.md`; chạy `npm test`, chạy lại các đột biến chính (bỏ `ON CONFLICT` của `postTransaction` thì test idempotent thất bại; bỏ trigger cân bằng thì test lệch thất bại); review độc lập toàn nhánh.
