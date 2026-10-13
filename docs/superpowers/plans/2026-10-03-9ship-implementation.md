# 9Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native execution chosen: one session implements every task, then a final whole-branch review). Steps use checkbox syntax.

**Goal:** Dựng dịch vụ 9Ship chạy được từ đầu đến cuối với adapter mock (báo giá nhiều hãng, tạo đơn, ví, hủy/hoàn, hành trình, nạp ví, rút tiền, khiếu nại, quản trị, giao diện mobile), cùng khung adapter thật cắm khóa là chạy.

**Architecture:** Modular monolith Node 20 (ES modules, `node:http`, không framework) + PostgreSQL 16 (driver `pg`). Mỗi module một thư mục/tệp một trách nhiệm. Giao diện tĩnh JS thuần (không ES module) do chính dịch vụ phục vụ dưới `/9ship/`.

**Tech Stack:** Node 20, `pg`, `qrcode` (QR dạng SVG), `node:test`, Docker (Postgres), nginx (gate).

**Spec:** `docs/superpowers/specs/2026-10-03-9ship-design.md`

## Global Constraints

- Tiền: số nguyên đồng (BIGINT / `Number` an toàn), cấm số thực trong sổ cái và giá.
- Sổ cái ghi kép, chỉ ghi thêm; khóa idempotency ở `ledger_transactions (idem_scope, idem_key)`; tổng mỗi giao dịch bằng 0.
- Quy ước dấu: `amount > 0` là **nợ**, `amount < 0` là **có**. Số dư tài khoản nợ-tự-nhiên (`bank`, `aggregator_deposit`, `carrier_cost`, `adjustment_receivable`) = tổng; tài khoản có-tự-nhiên (`user_wallet`, `user_hold`, `hold_buffer`, `withdrawal_pending`, `revenue`, `carrier_payable`, `topup_pending`) = −tổng.
- Ví người dùng không âm, trừ giao dịch `adjustment` (có trần `WALLET_OVERDRAFT_CAP`).
- Khóa dòng `accounts` của ví (`SELECT … FOR UPDATE`) trước mọi giao dịch ảnh hưởng ví.
- Giao diện: mobile-first, JS thuần, không ES module, API gọi bằng đường dẫn tương đối `v1/...`; gate nginx không `sub_filter`; cookie `Path=/9ship/`.
- Không ghi OTP, khóa hãng, số điện thoại người nhận vào log.
- Mọi API đổi trạng thái: kiểm tra Origin và header `X-Requested-With: 9ship`.
- Phụ thuộc runtime tối thiểu: chỉ `pg` và `qrcode`.

## Review Focus

- Hai yêu cầu giữ tiền song song cùng ví, chỉ đủ tiền cho một → đúng một thành công (Task 3).
- Cùng `idem_key` khác nội dung → 409; cùng nội dung → cùng kết quả (Task 3, Task 8).
- Hãng tạo đơn xong nhưng phản hồi timeout → không mất tiền, không tạo đơn thứ hai (Task 8).
- Webhook trùng hoặc đảo thứ tự → không trừ hai lần, không lùi trạng thái (Task 11).
- Không có trần niêm yết đáng tin → offer không đặt được khi `require_cap` bật (Task 5).
- Trọng lượng 0, âm, quá lớn, kích thước thiếu → lỗi 400 rõ ràng, không NaN (Task 5).

---

## Phase 0 — Kiểm chứng và hồ sơ đăng ký

### Task 1: Hồ sơ cho người vận hành (việc tôi không thể tự làm)

**Files:**
- Create: `9ship/docs/SETUP-CHECKLIST.md`, `9ship/docs/ADAPTER-CONTRACT.md`

**Interfaces:**
- Produces: danh sách đăng ký (đơn vị tổng hợp, hãng, ngân hàng/VietQR, kênh OTP), các biến môi trường cần điền, quy trình pha 0 (một đơn thật), và hợp đồng adapter để người khác viết adapter mới.

- [ ] **Step 1:** Viết hai tài liệu từ spec mục 4, 6.3, 12.
- [ ] **Step 2: Commit.**

## Phase 1 — Khung, sổ cái, báo giá

### Task 2: Khung dự án và cơ sở dữ liệu

**Files:**
- Create: `9ship/package.json`, `9ship/src/config.js`, `9ship/src/db.js`, `9ship/db/001_init.sql`, `9ship/.env.example`, `9ship/.gitignore`
- Test: `9ship/test/db.test.js`

**Interfaces:**
- Produces: `config` (đối tượng env đã parse), `db.query(sql, params) → rows`, `db.tx(async (c) => result)` (c có `c.query`), `db.migrate()`, `db.close()`.

- [ ] **Step 1:** Test: `migrate()` hai lần không lỗi; `tx` rollback khi throw.
- [ ] **Step 2:** Cài `pg`, viết `001_init.sql` đủ bảng spec mục 5 (users, addresses, carrier_area_map, quotes, shipments, tracking_events, accounts, ledger_transactions, ledger_entries, pickup_points, pricing_rules, list_prices, carrier_fee_versions, adjustments, outbox, withdrawals, bank_inbox, claims, sessions, otps, topups, admin_audit, settings).
- [ ] **Step 3:** Chạy test, commit.

### Task 3: Sổ cái

**Files:**
- Create: `9ship/src/ledger.js`
- Test: `9ship/test/ledger.test.js`

**Interfaces:**
- Produces:
  - `ledger.account(c, ownerType, ownerId, kind) → accountId` (tạo nếu chưa có)
  - `ledger.lockWallet(c, userId) → walletAccountId` (khóa dòng)
  - `ledger.post(c, { kind, idemScope, idemKey, payload, shipmentId, entries: [{ accountId, amount }] }) → { txId, replay }`; ném `ApiError(409)` nếu cùng khóa khác `payload`; ném lỗi nếu tổng ≠ 0 hoặc ví user âm quá phép.
  - `ledger.balance(c, accountId) → number`; `ledger.walletBalance(c, userId) → number`
- Consumes: `db.tx`.

- [ ] **Step 1:** Test: tổng khác 0 bị từ chối; `post` lặp cùng khóa trả `replay:true` và không ghi thêm; khác payload → 409; hai `tx` song song cùng ví chỉ đủ tiền cho một → đúng một thành công; ví không âm trừ `adjustment` trong trần.
- [ ] **Step 2:** Chạy thấy FAIL, viết `ledger.js`, chạy thấy PASS, commit.

### Task 4: Adapter hãng và adapter mock

**Files:**
- Create: `9ship/src/carriers/index.js`, `9ship/src/carriers/mock.js`, `9ship/src/errors.js`
- Test: `9ship/test/carrier-contract.test.js`

**Interfaces:**
- Produces: `registry.list() → adapters`, `registry.get(id)`; `CarrierError(message, { unknown, retryable })`; `ApiError(status, code, message)`.
- Adapter: `{ id, name, capabilities, quote(req), createShipment(req), cancel(code), track(code), findByReference(ref), listPickupPoints({lat,lng,radiusKm}), parseWebhook(headers, raw) }` đúng như `ADAPTER-CONTRACT.md`. `mock` nhận `req.mockBehavior` chỉ khi `NODE_ENV !== 'production'`.

- [ ] **Step 1:** Bộ test hợp đồng chạy trên mọi adapter đã đăng ký: kiểu dữ liệu của `quote`, `createShipment` idempotent theo `ref`, `cancel`, `track`.
- [ ] **Step 2:** Viết 3 hãng mock (giá, tốc độ, năng lực khác nhau), chạy PASS, commit.

### Task 5: Tính cước

**Files:**
- Create: `9ship/src/rating.js`, `9ship/src/pricing.js`
- Test: `9ship/test/rating.test.js`

**Interfaces:**
- Consumes: `registry`, `pricing_rules`, `list_prices`.
- Produces: `rating.quoteAll(req) → { offers: [Offer], skipped: [{carrier, reason}] }`; `Offer = { offerId, carrier, service, serviceName, contract, handover, etaDays, cost, sellPrice, listPrice|null, saved|null, capped, capVerified, labels:[], pickupPoint?:… }`; `pricing.chargeableWeight(weightG, dims, divisor)`, `pricing.applyMargin(cost, rule, listPrice, opts) → {sellPrice, hidden, reason}`.
- Quy tắc theo spec 6.1: so sánh cùng cơ sở, chặn trần `listPrice − 1 bậc làm tròn`, ẩn offer nếu biên < `margin_min`, `require_cap`.

- [ ] **Step 1:** Test: trọng lượng quy đổi lấy `max`; chặn trần; hủy offer khi biên thấp; hãng lỗi/chậm bị bỏ nhưng báo giá vẫn trả; `require_cap` chặn offer thiếu trần; đầu vào xấu (0, âm, NaN, quá lớn) → 400.
- [ ] **Step 2:** Viết, PASS, commit.

### Task 6: HTTP khung và API báo giá

**Files:**
- Create: `9ship/src/http.js`, `9ship/src/places.js`, `9ship/src/server.js`, `9ship/src/routes/quotes.js`
- Test: `9ship/test/quotes-api.test.js`

**Interfaces:**
- Produces: `http.createApp({ routes })`, `http.route(method, path, handler, opts)`; handler nhận `{ req, params, query, body, user, json(), cookies }`; giới hạn tốc độ theo IP; định dạng lỗi `{ error: { code, message } }`; `places.provinces()`, `places.nearestPoints(carrierId, lat, lng)`.
- `POST /v1/quotes`, `GET /v1/pickup-points`, `GET /v1/meta`.

- [ ] **Step 1:** Test API qua `fetch` với server thật cổng ngẫu nhiên.
- [ ] **Step 2:** Viết, PASS, commit.

## Phase 2 — Đơn, ví, giao diện

### Task 7: Xác thực

**Files:**
- Create: `9ship/src/auth.js`, `9ship/src/routes/auth.js`
- Test: `9ship/test/auth.test.js`

**Interfaces:**
- Produces: `auth.requestOtp(phone, ip)`, `auth.verifyOtp(phone, code) → sessionToken`, `auth.userFromRequest(req)`; admin: `auth.adminLogin(token, totp)`; `totp(secret, t)`.
- OTP: hết hạn 5 phút, tối đa 5 lần thử, khóa tạm, hạn mức theo số/IP/ngày; kênh gửi cắm được (`OTP_PROVIDER=console` mặc định, `OTP_DEV=1` trả mã trong phản hồi chỉ khi không production).

- [ ] **Step 1:** Test: sai mã quá số lần thì khóa; mã hết hạn; vượt hạn mức; CSRF (thiếu header → 403).
- [ ] **Step 2:** Viết, PASS, commit.

### Task 8: Tạo đơn (outbox, worker, đối soát)

**Files:**
- Create: `9ship/src/orders.js`, `9ship/src/worker.js`, `9ship/src/routes/shipments.js`
- Test: `9ship/test/orders.test.js`

**Interfaces:**
- Consumes: `ledger`, `rating`, `registry`.
- Produces: `orders.create(userId, { quoteId, offerId, sender, receiver, pickupPointId, goodsType, declaredValue }, idemKey) → shipment`; `worker.runOnce(now) → {processed}`; `worker.start(intervalMs)`; `orders.get(userId, id)`, `orders.list(userId)`.
- Luồng spec 6.2: một giao dịch DB (khóa ví, đơn `pending_carrier`, giữ cước vào `user_hold` và đệm vào `hold_buffer`, ghi outbox); worker gọi hãng với `carrier_ref`; timeout → đối soát `findByReference`, không có thì hàng đợi quản trị; thành công → capture (doanh thu, `carrier_cost`/`aggregator_deposit`), đệm giữ lại; thất bại → nhả.

- [ ] **Step 1:** Test: số dư đủ/thiếu; cùng khóa trả cùng `shipment_id`; khác nội dung 409; hãng tạo xong nhưng timeout → đối soát nhận ra, không giữ/trừ hai lần; hãng lỗi → nhả hết; tiến trình "chết" giữa chừng (chạy lại worker) không tạo đơn thứ hai; giá hãng đổi quá ngưỡng → dừng xác nhận.
- [ ] **Step 2:** Viết, PASS, commit.

### Task 9: Nhãn in

**Files:**
- Create: `9ship/src/labels.js`, `9ship/src/routes/labels.js`
- Test: `9ship/test/labels.test.js`

**Interfaces:**
- Produces: `labels.render(shipment, { size: '100x150'|'a6' }) → html`, `labels.signUrl(shipmentId, ttl)`, `labels.verify(token)`; mã vạch Code128 tự sinh SVG, QR bằng `qrcode`; CSS `@page` đúng khổ; escape HTML mọi trường người dùng.

- [ ] **Step 1:** Test: có mã vận đơn, escape XSS (`<script>` trong tên), link ký hết hạn bị từ chối, người khác không xem được.
- [ ] **Step 2:** Viết, PASS, commit.

### Task 10: Ví và quản trị cộng tiền tay

**Files:**
- Create: `9ship/src/wallet.js`, `9ship/src/admin.js`, `9ship/src/routes/wallet.js`, `9ship/src/routes/admin.js`
- Test: `9ship/test/wallet-admin.test.js`

**Interfaces:**
- Produces: `wallet.get(userId) → { balance, held, buffer, entries }`; `admin.credit(adminId, userId, amount, reason, idemKey)` (ghi nhật ký `admin_audit`); admin API cần session admin có MFA.

- [ ] **Step 1:** Test, viết, PASS, commit.

### Task 11 (đặt ở Phase 3): xem bên dưới.

### Task 12: Giao diện và gắn vào cổng

**Files:**
- Create: `9ship/public/index.html`, `9ship/public/app.js`, `9ship/public/style.css`, `9ship/public/admin.html`, `9ship/public/admin.js`, `9ship/public/icon.svg`, `icons/ship.svg`
- Modify: `js/catalog.js` (thêm mục `ship`), `nginx/9app.gates.inc` (khối `/9ship/`), `server.js` (proxy dev), `js/gate.js` nếu cần
- Test: `9ship/test/ui-smoke.test.js` (phục vụ tĩnh, không `type="module"`, mọi `fetch` dùng đường dẫn tương đối)

- [ ] **Step 1:** Viết các màn hình spec mục 8; chạy thử bằng trình duyệt headless nếu có, ngược lại kiểm bằng smoke test và đọc lại.
- [ ] **Step 2:** Commit.

## Phase 3 — Hủy, hành trình, khiếu nại

### Task 11: Hành trình, webhook, điều chỉnh cước, hủy

**Files:**
- Create: `9ship/src/tracking.js`, `9ship/src/adjustments.js`, `9ship/src/routes/webhooks.js`
- Modify: `9ship/src/orders.js` (hủy), `9ship/src/worker.js` (polling, hết hạn đệm)
- Test: `9ship/test/tracking.test.js`, `9ship/test/cancel.test.js`

**Interfaces:**
- Produces: `tracking.ingest(carrierId, events)`; `orders.cancel(userId, id, idemKey)`; `adjustments.applyFee(shipmentId, newTotal, source, sourceEventId)`; `POST /v1/webhooks/:carrier` xác thực chữ ký bằng `adapter.parseWebhook`.
- Quy tắc: `shipping_status` chỉ tiến; chênh lệch tính từ cước tổng mới; hủy chỉ hoàn khi hãng xác nhận; hàng đã lấy → từ chối hủy; hết `buffer_ttl` thì nhả đệm.

- [ ] **Step 1:** Test: webhook trùng không trừ hai lần; webhook đảo thứ tự không lùi trạng thái; hai nguồn báo cùng một điều chỉnh chỉ ghi một lần; hủy đúng/sai/timeout; ví âm có trần chặn đơn mới.
- [ ] **Step 2:** Viết, PASS, commit.

### Task 13: Khiếu nại và đối soát hàng đợi

**Files:**
- Create: `9ship/src/claims.js`, `9ship/src/routes/claims.js`
- Test: `9ship/test/claims.test.js`

- [ ] **Step 1:** Test, viết, PASS, commit.

## Phase 4 — Nạp, rút, quản trị, đóng gói

### Task 14: Nạp ví VietQR

**Files:**
- Create: `9ship/src/topup.js`, `9ship/src/routes/topup.js`
- Test: `9ship/test/topup.test.js`

**Interfaces:**
- Produces: `topup.create(userId, amount) → { code, qrUrl, expiresAt }`, `topup.ingestBankTx({ bankTxId, amount, content, at })` (ghi `bank_inbox` trước rồi ghép; chuẩn hóa nội dung; lệch số tiền/hết hạn → hàng đợi); webhook ngân hàng xác thực bằng HMAC `BANK_WEBHOOK_SECRET`.

- [ ] **Step 1:** Test: ghép đúng; chuẩn hóa hoa/thường/bỏ dấu; trùng `bank_tx_id`; lệch tiền; hết hạn.
- [ ] **Step 2:** Viết, PASS, commit.

### Task 15: Rút tiền

**Files:**
- Create: `9ship/src/withdrawals.js`, `9ship/src/routes/withdrawals.js`
- Test: `9ship/test/withdrawals.test.js`

- [ ] **Step 1:** Test: giữ tiền ngay; tạo đơn song song không dùng được tiền đã giữ; `paying → unknown` không nhả cho tới khi đối soát; chi trùng bị chặn bởi mã tham chiếu; đổi tài khoản nhận cần OTP lại.
- [ ] **Step 2:** Viết, PASS, commit.

### Task 16: Quản trị đầy đủ và giám sát

**Files:**
- Modify: `9ship/src/admin.js`, `9ship/public/admin.*`
- Test: `9ship/test/admin.test.js`

**Interfaces:** bảng giá/biên/`require_cap`, cảnh báo biên âm, hàng đợi (tạo đơn không rõ, tiền chưa ghép, rút tiền), tình trạng hãng (circuit breaker), số dư ký quỹ + ngưỡng, nhật ký thao tác.

- [ ] **Step 1:** Test, viết, PASS, commit.

### Task 17: Đóng gói và chạy thử toàn bộ

**Files:**
- Create: `9ship/Dockerfile`, `9ship/docker-compose.yml`, `9ship/README.md`, `9ship/test/e2e.test.js`

- [ ] **Step 1:** E2E: đăng nhập OTP → báo giá → admin cộng ví → tạo đơn → nhãn → hành trình → hủy → hoàn tiền → rút tiền, kiểm tổng sổ cái bằng 0.
- [ ] **Step 2:** Chạy `npm test`, chạy server thật, gọi qua `curl`, mở bằng trình duyệt headless nếu có.
- [ ] **Step 3:** Review toàn nhánh, ghi `docs/9ship-HANDOFF.md`, commit.
