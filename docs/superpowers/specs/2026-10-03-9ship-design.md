# 9Ship — Thiết kế

Ngày: 2026-10-03 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Ứng dụng gửi chuyển phát nhanh nội địa cho **cá nhân gửi lẻ**. Người dùng khai điểm đi, điểm đến, trọng lượng. Hệ thống tạm tính cước nhiều hãng cùng lúc, gợi ý hãng theo giá, tốc độ và **quầy gần vị trí người gửi**, tạo đơn để lấy mã vận đơn, rồi người dùng đưa mã ra quầy hoặc tự in bill dán. Cước bán ra không cao hơn giá niêm yết của hãng.

Tiêu chí thành công v1:
- Một lần nhập, thấy giá của mọi hãng đang kết nối trong vòng 5 giây, kể cả khi một hãng lỗi.
- Tạo được đơn thật qua ít nhất một nguồn kết nối thật, có mã vận đơn và bill in được.
- Không bao giờ trừ tiền hai lần cho một đơn, và không mất tiền khi hãng báo lỗi.
- Mỗi báo giá hiển thị mức tiết kiệm so với giá niêm yết.

## 2. Phạm vi

**Trong v1:** đăng nhập OTP, tạm tính cước, tạo đơn, ví trả trước (nạp VietQR), bill PDF, tra cứu hành trình, hủy và hoàn tiền, tiếp nhận khiếu nại (6.6), tìm quầy gần nhất, trang quản trị đơn giản, ô 9Ship trong cổng 9app.tech.

**Ngoài v1 (thiết kế sẵn chỗ cắm):** xử lý khiếu nại và chi trả bồi thường tự động (v1 chỉ tiếp nhận và chuyển hồ sơ, xem 6.6), điểm nhận gửi riêng và trang quầy, API cho shop (API key), COD và đối soát, tạo đơn hàng loạt.

## 3. Quyết định đã chốt

| Mục | Chọn |
|---|---|
| Người dùng | Cá nhân gửi lẻ; quầy là yếu tố gợi ý |
| Kết nối hãng | Lai: ra mắt qua đơn vị tổng hợp, adapter chung để nối trực tiếp từng hãng sau |
| Nền tảng | Dịch vụ riêng, tách khỏi repo cổng: Node + PostgreSQL, chạy Docker; cổng chỉ thêm ô và proxy `/9ship/` |
| Kiến trúc | Modular monolith |
| Quầy | Bưu cục hãng trước (A), điểm nhận gửi riêng sau (B) |
| Thanh toán | Ví trả trước, nạp VietQR |

## 4. Kiến trúc

Một dịch vụ Node, một PostgreSQL. Các module chỉ gọi nhau qua giao diện của module.

- **carriers** — adapter theo giao diện chung: `quote()`, `createShipment()`, `cancel()`, `track()`, `getLabel()`, `parseWebhook()`, `listPickupPoints()`, `findByReference()` (tùy năng lực). Hệ số quy đổi thể tích và bậc cân do adapter quyết định, không đặt cứng ở rating. Mọi số tiền là số nguyên đồng (BIGINT), cấm số thực. Mỗi adapter còn khai báo **năng lực**: `dropoff` (gửi tại bưu cục), `pickup` (lấy tận nơi), `findByReference` (tra đơn theo mã tham chiếu), `webhook`, `officeList`, `labelNative` (nhãn do hãng cấp). Có adapter `mock` mô phỏng thành công, lỗi, chậm, đổi giá giữa chừng. Mỗi adapter khai báo nguồn dữ liệu bưu cục của mình (có thể không có).
- **rating** — gọi adapter song song, timeout 4 giây mỗi hãng, bỏ hãng lỗi. Tính trọng lượng tính cước `max(thực tế, quy đổi)`, cộng phụ phí vùng xa và bảo hiểm, áp biên lợi nhuận, chặn trần theo giá niêm yết, xếp hạng.
- **places** — chuẩn hóa địa chỉ theo hai cấp hiện hành (tỉnh/thành, xã/phường) và giữ bảng ánh xạ sang mã địa danh của từng hãng, vì nhiều hãng vẫn dùng ba cấp cũ (tỉnh, quận/huyện, phường/xã). Tìm bưu cục gần nhất theo tọa độ.
- **orders** — ba chiều trạng thái độc lập: `shipping_status` (`draft → pending_carrier → created → picked_up → in_transit → delivered`; nhánh `create_failed`, `delivery_failed → redelivering | returning → returned`, `lost`), `cancel_status` (`none → requested → confirmed | rejected`) và `payment_status` (`unpaid → held → captured → partially_refunded | refunded`). Sự kiện từ hãng lưu `event_at` và `received_at`; `shipping_status` chỉ tiến theo thứ hạng đã định nghĩa nên sự kiện đến muộn không làm lùi trạng thái. Quyết định hoàn tiền dựa trên `cancel_status=confirmed` do hãng xác nhận cùng đối soát, không dựa trên trạng thái vận chuyển mới nhất. `create_failed` (tạo đơn thất bại) tách bạch với `delivery_failed` (giao thất bại). Hoàn hàng, giao lại, đổi địa chỉ, người nhận trả cước và bồi thường: v1 chỉ ghi nhận trạng thái, thu `return_fee` từ người gửi theo hãng, và chuyển `compensation` do hãng trả về ví người gửi bằng bút toán riêng; chỉ người gửi trả cước; đổi địa chỉ xử lý tay qua quản trị.
- **wallet** — sổ cái ghi kép, chỉ ghi thêm. Số dư là tổng bút toán.
- **topup** — sinh mã VietQR có nội dung riêng, nhận thông báo tiền vào và cộng ví.
- **auth** — OTP qua số điện thoại, phiên, giới hạn tốc độ, vai trò `user` và `admin` (admin có đăng nhập riêng, bắt buộc nhật ký thao tác).
- **labels** — sinh bill PDF (A6 và 100×150 mm) có mã vạch và QR.
- **admin** — bảng giá, biên lợi nhuận, cảnh báo biên âm, tình trạng hãng, công nợ với hãng.

## 5. Mô hình dữ liệu

- `users(id, phone, name, created_at)`; `addresses(user_id, label, contact, phone, street, ward, province, lat, lng)` và `carrier_area_map(carrier, our_code, carrier_codes)`
- `quotes(id, user_id, from, to, handover ('dropoff'|'pickup'), goods_type, weight_g, dims, declared_value, offers jsonb, expires_at)` — hạn mặc định 15 phút.
- `shipments(id, user_id, quote_id, carrier, service, contract, carrier_ref, carrier_code, tracking_code, shipping_status, cancel_status, payment_status, pickup_point_id, price_book_version, cost_price, sell_price, list_price, label_url, sender, receiver, created_at)` — `carrier_ref` là mã tham chiếu của ta, sinh một lần và giữ nguyên qua mọi lần thử.
- `tracking_events(shipment_id, status, note, at, raw jsonb)`
- `accounts(id, owner_type, owner_id, kind)` với `kind`: `user_wallet`, `user_hold`, `revenue`, `carrier_payable`, `aggregator_deposit` (tiền ký quỹ trả trước cho đơn vị tổng hợp, là tài sản), `topup_pending`, `adjustment_receivable`, `bank`, `carrier_cost`, `hold_buffer`, `withdrawal_pending`; `ledger_transactions(id, kind, idem_scope, idem_key, payload_hash, shipment_id, created_at)` giữ khóa idempotency, duy nhất `(idem_scope, idem_key)`; `ledger_entries(id, tx_id → ledger_transactions, account_id, amount BIGINT, created_at)`. Mọi dòng của một giao dịch được ghi trong một giao dịch DB, tổng phải bằng 0 trước khi chốt. `kind` của giao dịch: `topup`, `hold`, `release`, `capture`, `refund`, `adjustment`, `cancel_fee`, `return_fee`, `compensation`, `withdrawal`.
- `pickup_points(id, carrier, type, name, address, lat, lng, hours, source, synced_at)` — `type`: `carrier_office` hoặc `partner`.
- `pricing_rules(carrier, route, margin_pct, margin_min, surcharge, rounding, allow_loss)`
- `list_prices(carrier, service, route, weight_band, components jsonb, vat_included bool, source, verified_at, owner)` — giá niêm yết công bố, dùng làm trần khi adapter không trả `list_price`. Có chủ sở hữu và quy trình cập nhật định kỳ (người phụ trách, chu kỳ rà soát).
- `carrier_fee_versions(shipment_id, version, total, breakdown jsonb, source ('webhook'|'statement'), source_event_id, at)` — các phiên bản cước tổng do hãng báo; chênh lệch được tính từ đây. `adjustments(shipment_id, kind, amount, reason, at)` ghi phần chênh lệch đã hạch toán.
- `outbox(id, shipment_id, kind, payload, status, attempts, next_at)` — công việc gọi hãng, ghi cùng giao dịch DB với đơn và khoản giữ tiền.
- `withdrawals(id, user_id, amount, bank_account, status, payout_ref, created_at)`; `bank_inbox(bank_tx_id, raw, matched_topup_id, status)`.
- `claims(id, shipment_id, user_id, kind, status, deadline, evidence jsonb, partner_ref, created_at)`.

## 6. Luồng chính

### 6.1 Tạm tính — `POST /v1/quotes`
1. Nhận điểm đi, điểm đến, trọng lượng, kích thước, giá trị khai báo và loại hàng.
2. rating gọi mọi adapter đang bật với **dữ liệu tối thiểu** (mã tỉnh và xã/phường, trọng lượng, kích thước, giá trị khai báo, loại hàng); không gửi tên, số điện thoại hay địa chỉ chi tiết ở bước báo giá. Thu các offer thành công.
3. Với mỗi offer: so sánh cùng cơ sở (cùng thành phần cước, phụ phí, bảo hiểm, phí lấy hàng và cùng cơ sở VAT với giá niêm yết). Giá bán = giá vốn + biên, rồi `min(giá bán, giá niêm yết − 1 bậc làm tròn)`; bậc làm tròn không được lớn hơn biên tối thiểu của tuyến. Nếu sau khi chặn trần mà biên thấp hơn `margin_min` của quy tắc thì **ẩn offer đó** (mặc định từ khi có bậc giá sỉ; trong giai đoạn đầu `margin_min` có thể bằng 0 để vẫn có giá hiển thị) và ghi cảnh báo cho quản trị; quản trị có thể bật cờ "bán lỗ có kiểm soát" theo hãng và tuyến.
Giá vốn là tổng đầu vào phải trả: cước hãng, phí dịch vụ của đơn vị tổng hợp, phụ phí và thuế trên các khoản đó. Adapter trả `breakdown` và đánh dấu khoản nào đã nằm trong tổng để không cộng hai lần. Cam kết "không cao hơn niêm yết" chỉ bán được khi có trần đáng tin, nên cờ `require_cap` (mặc định bật) quy định: thiếu `list_price` đáng tin hoặc `verified_at` quá hạn thì **không cho đặt đơn** với offer đó. Chỉ trong giai đoạn nội bộ (pha 2 và 3) mới được tắt cờ theo hãng; khi đó offer hiện nhãn "giá chưa kiểm chứng" và ẩn mức tiết kiệm. Đơn lưu `price_book_version` và cơ sở so sánh.
4. Chỉ trả offer có năng lực phù hợp với `handover` người dùng chọn (gửi tại bưu cục hay lấy tận nơi). Mỗi offer ghi rõ dịch vụ, hợp đồng (tài khoản) và phương thức bàn giao; nếu hãng yêu cầu thì kèm danh sách điểm nhận đủ điều kiện cho đúng tài khoản đó, và nhãn "Gần nhất" chỉ tính trên các điểm đủ điều kiện.
5. places gắn bưu cục gần nhất của hãng đó quanh người gửi, kèm khoảng cách và giờ mở cửa.
6. Trả danh sách, kèm nhãn Rẻ nhất, Nhanh nhất, Gần nhất và `saved = list_price − sell_price`.

### 6.2 Tạo đơn — `POST /v1/shipments`
1. Kiểm tra offer còn hạn và khớp quote. Nếu giá hãng đã đổi so với quote, **dừng trước khi giữ tiền**, tạo quote mới và yêu cầu người dùng xác nhận giá mới (kể cả khi giá giảm). Không bao giờ giữ tiền khi chưa có giá cuối.
2. **Giá chỉ là giá dự kiến trừ khi hãng cấp token giá.** Có token thì lưu và truyền sang `createShipment()`. Không có thì áp chính sách chênh lệch: 9Ship chịu phần chênh trong ngưỡng cấu hình (ví dụ 5% hoặc một số tiền cố định); vượt ngưỡng thì đơn dừng ở trạng thái cần xác nhận lại giá và không giữ thêm tiền. Giao diện không gọi báo giá là giá cuối được bảo đảm.
3. **Một giao dịch DB duy nhất** (transactional outbox): khóa dòng ví (`SELECT … FOR UPDATE`); tạo đơn ở `shipping_status=pending_carrier`; giữ tiền, trong đó cước dự kiến vào `user_hold` và phần **đệm** (mặc định bậc cân kế tiếp hoặc 120%, cấu hình được) vào `hold_buffer`, cả hai gắn với đơn; ghi công việc `create_shipment` vào `outbox`. `idem_key` do client sinh, có phạm vi theo người dùng, kèm hash nội dung: cùng key khác nội dung trả 409; cùng key cùng nội dung trả lại đúng `shipment_id` đã tạo, kể cả khi còn đang xử lý hoặc sau crash.
4. **Worker** lấy công việc từ outbox và gọi `createShipment()` với `carrier_ref`; tiến trình chết giữa chừng thì worker chạy lại với cùng mã tham chiếu. Nếu gọi bị timeout hoặc mất kết nối (không biết hãng đã tạo chưa), đơn **không** bị coi là thất bại: job đối soát tra lại theo mã tham chiếu và chỉ nhả tiền khi xác nhận hãng chưa có đơn. Với adapter không có `findByReference`, đơn sau N giờ chuyển vào hàng đợi quản trị có hạn chót và người phụ trách, **không tự nhả**. Mọi bước chốt hoặc nhả tiền có điều kiện trạng thái (ví dụ `UPDATE … WHERE payment_status='held'`) và khóa nghiệp vụ riêng, nên chạy lại không ghi hai lần.
5. **Thành công:** `capture` đúng cước hãng xác nhận lúc tạo (giá bán vào doanh thu, giá vốn ghi giảm ký quỹ đơn vị tổng hợp), lưu mã vận đơn và nhãn; phần đệm **vẫn giữ riêng**. Phần đệm được nhả khi có cước cuối đã xác nhận (6.3b), hoặc sau hạn `buffer_ttl` kể từ khi giao thành công nếu hãng không gửi dữ liệu cân; hết hạn thì tự nhả và 9Ship chịu rủi ro điều chỉnh muộn trong hạn mức cấu hình. **Thất bại hoặc quá hạn:** nhả toàn bộ tiền giữ và trả lỗi rõ ràng. Màn hình đơn hiện riêng giá dự kiến, tiền đang giữ, tiền đã thu và tiền đệm còn giữ.

### 6.3 Đưa ra quầy
- Bưu cục hãng: người dùng đưa mã vận đơn, nhân viên hãng quét và in bằng hệ thống của hãng. **Chưa kiểm chứng:** đơn tạo qua tài khoản của đơn vị tổng hợp thường mặc định lấy tận nơi, và quầy có thể từ chối tem không đúng mẫu hãng. Phải gửi thử đơn thật tại bưu cục của từng hãng trước khi chốt trải nghiệm.
- Tự in: ưu tiên nhãn do hãng cấp (`getLabel()`); bill PDF tự sinh chỉ là dự phòng khi hãng chấp nhận.
- Lấy tận nơi: một lựa chọn song song, cùng luồng tạo đơn.
- Điểm bàn giao đã chọn (`pickup_point_id`) được lưu vào đơn và truyền sang hãng khi hãng yêu cầu. Một tổ hợp (dịch vụ, hợp đồng, điểm nhận) chỉ được hiển thị khi đã kiểm chứng bằng đơn thật (pha 0).
- Điểm riêng: ngoài v1.

### 6.3b Điều chỉnh cước sau khi lấy hàng
Hãng thường cân hoặc đo lại và tính lại cước. Khi nhận chênh lệch (qua webhook hoặc đối soát), ghi `adjustment` và bút toán trừ thêm hoặc hoàn lại ví. Bất biến của sổ cái là "số dư không âm, **trừ** bút toán `kind=adjustment`". Ví âm có **trần** cấu hình; vượt trần hoặc còn âm thì chặn tạo đơn mới đến khi nạp đủ, và người dùng nhận thông báo kèm lý do. Hiển thị rõ ở màn hình đơn. Chênh lệch luôn tính từ **cước tổng mới** so với tổng đã ghi nhận (`carrier_fee_versions`), không cộng dồn theo sự kiện; nếu hãng chỉ gửi phần chênh thì ghép với bảng kê đối soát bằng khóa nghiệp vụ (đơn, kỳ) để hai nguồn cùng báo một điều chỉnh chỉ ghi một lần. Trần niêm yết áp dụng cho cước cuối: tổng thu của một đơn không vượt giá niêm yết của chính cân đã xác nhận theo bảng giá lưu trên đơn; phần hãng thu thêm vượt trần đó do 9Ship chịu.

### 6.4 Hành trình và hủy
Webhook nếu hãng hỗ trợ, ngược lại polling theo chu kỳ tăng dần. Hủy: đặt `cancel_status=requested`, gọi `cancel()`, và **chỉ hoàn tiền khi hãng xác nhận hủy**. Timeout hoặc kết quả không rõ thì giữ nguyên trạng thái và đối soát lại. Nếu hàng đã được lấy trong lúc hủy thì từ chối hủy; phí hủy khi shipper đã đến và phí hoàn là bút toán `cancel_fee` và `return_fee` riêng. Sự kiện webhook điều chỉnh cước idempotent theo `(carrier, event_id)`. Webhook đến sai thứ tự không làm lùi `shipping_status`; hàng đã `picked_up` trước khi hãng xác nhận hủy thì hủy bị từ chối và không hoàn tiền.

### 6.5 Nạp ví
Tạo yêu cầu nạp với mã nội dung duy nhất, hiện VietQR. Khi nhận thông báo tiền vào khớp mã và số tiền, ghi bút toán cộng ví; khớp lệch số tiền thì đưa vào hàng đợi quản trị xử lý tay. Nội dung chuyển khoản được chuẩn hóa trước khi so khớp (hoa-thường, bỏ dấu, tiền tố ngân hàng), yêu cầu nạp có hạn dùng, và idempotent theo `bank_tx_id`. Mọi giao dịch ngân hàng nhận được ghi vào `bank_inbox` trước khi ghép; tiền đến muộn, thiếu nội dung hoặc yêu cầu đã hết hạn nằm trong hàng đợi chưa ghép; đối soát định kỳ với sao kê. Số dư ký quỹ của đơn vị tổng hợp được theo dõi với ngưỡng cảnh báo, và offer của hãng đó tạm ẩn khi ký quỹ không đủ. Ví là ví đơn mục đích để thanh toán cước; rút tiền qua `POST /wallet/withdrawals`: **giữ tiền ngay khi nhận yêu cầu** (ví → hold), trạng thái `requested → approved → paying → paid` và nhánh `failed | unknown`; mỗi yêu cầu có mã tham chiếu chi duy nhất; kết quả không rõ thì đối soát với ngân hàng trước khi thử lại, chỉ nhả giữ khi chắc chắn chưa chi. Đổi tài khoản nhận tiền bắt buộc xác thực lại và có độ trễ an toàn.

### 6.6 Tiếp nhận khiếu nại (tối thiểu)
Vận đơn có thể đứng tên tài khoản của đơn vị tổng hợp, còn người trả tiền là khách của 9Ship, nên không thể chỉ đưa một đường dẫn hỗ trợ. V1 làm tối thiểu: nhận yêu cầu khiếu nại (mất, hư, chậm), lưu chứng cứ bàn giao (mã đơn, hành trình, ảnh, biên nhận), theo dõi hạn nộp hồ sơ theo quy định và theo hãng, chuyển hồ sơ cho đúng đối tác và báo tiến độ cho khách. Hợp đồng với đối tác phải chốt ai là người khiếu nại, ai nhận bồi thường, ai trả khách và trong bao lâu; `compensation` chỉ ghi khi tiền thực nhận. Luật Bưu chính có quy định về khiếu nại và các trường hợp miễn trách nhiệm; luật sư xác nhận nội dung này trước khi mở cho người dùng.

### 6.7 Bút toán chuẩn (đề xuất, kế toán duyệt)
Mô hình đại lý hay bán lại ảnh hưởng cách ghi doanh thu (thuần hay gộp), thuế và hóa đơn; bảng dưới giả định ghi doanh thu gộp và phải được kế toán chốt.

| Giao dịch | Nợ | Có |
|---|---|---|
| `topup` | `bank` | `user_wallet` |
| Nạp ký quỹ cho đơn vị tổng hợp | `aggregator_deposit` | `bank` |
| `hold` | `user_wallet` | `user_hold` (cước), `hold_buffer` (đệm) |
| `capture` | `user_hold` ; `carrier_cost` | `revenue` ; `aggregator_deposit` |
| `release` | `user_hold`, `hold_buffer` | `user_wallet` |
| `adjustment` tăng | `user_wallet` (hoặc `hold_buffer`) ; `carrier_cost` | `revenue` ; `aggregator_deposit` |
| `refund` khi hủy | `revenue` ; `aggregator_deposit` | `user_wallet` ; `carrier_cost` |
| `compensation` | `aggregator_deposit` | `user_wallet` |
| `withdrawal` yêu cầu | `user_wallet` | `withdrawal_pending` |
| `withdrawal` đã chi | `withdrawal_pending` | `bank` |

## 7. API công khai `/v1`

`POST /quotes`, `POST /shipments`, `GET /shipments/:id`, `POST /shipments/:id/cancel`, `GET /shipments/:id/label`, `GET /pickup-points?lat&lng&carrier`, `GET /wallet`, `POST /wallet/topups`, `POST /wallet/withdrawals`, `POST /claims`. Mã đơn công khai là id khó đoán; mọi truy vấn kiểm tra quyền sở hữu. Có phiên bản, lỗi theo một định dạng chung, OpenAPI. API key cho bên thứ ba thuộc phần ngoài v1 nhưng khóa xác thực dùng chung cơ chế `auth`.

## 8. Giao diện

Mobile-first, không dùng ES module (WebView cũ). Tên "9Ship", icon SVG cùng phong cách các ô hiện có.

1. Gửi hàng — điểm đi (mặc định vị trí hiện tại), điểm đến, trọng lượng, mở rộng kích thước và giá trị.
2. Kết quả giá — thẻ theo hãng, giá, thời gian giao, mức tiết kiệm, quầy gần nhất, lọc nhanh.
3. Bản đồ quầy — bưu cục của hãng đã chọn; không có định vị thì nhập quận hoặc phường.
4. Người gửi và người nhận, có sổ địa chỉ.
5. Thanh toán — trừ ví, thiếu thì nạp VietQR.
6. Phiếu gửi — mã QR hoặc mã vạch lớn, tải bill, chia sẻ.
7. Đơn của tôi — dòng thời gian, hủy, gửi lại tương tự.
8. Ví — số dư, lịch sử, nạp tiền.
9. Quản trị — bảng giá và biên, cảnh báo biên âm, tình trạng hãng, công nợ.

Gắn vào cổng: thêm mục `9ship` vào [js/catalog.js](../../../js/catalog.js) (nhóm "Đời sống") và khối `location ^~ /9ship/` trong [nginx/9app.gates.inc](../../../nginx/9app.gates.inc) proxy tới container; giao diện gọi API bằng đường dẫn tương đối (`v1/...`), backend đọc `X-Forwarded-Prefix` để sinh URL webhook, VietQR và nhãn. Gate của 9ship **không dùng `sub_filter`** (các gate hiện có viết lại cả JSON và sẽ làm hỏng chuỗi), cookie đặt `Path=/9ship/`.

## 8a. Bảo mật

- **Webhook hãng** và **thông báo tiền vào**: xác thực chữ ký hoặc danh sách IP, kiểm tra thời gian để chống phát lại, idempotent theo id sự kiện.
- **OTP:** hết hạn ngắn, giới hạn số lần thử và khóa tạm, giới hạn theo cả IP và số điện thoại, chống SMS pumping (chặn đầu số bất thường, hạn mức gửi theo ngày).
- **`/quotes`:** giới hạn tốc độ theo phiên và IP, cache ngắn theo toàn bộ đầu vào ảnh hưởng giá (tuyến, cân, kích thước, giá trị khai báo, loại hàng, phương thức bàn giao, dịch vụ, hợp đồng) và phiên bản chính sách giá, không chia sẻ token giá của hãng giữa người dùng, để bot không đốt hạn mức của đơn vị tổng hợp và làm mở circuit breaker.
- **Nhãn in:** phục vụ qua link ký có hạn của ta, không đưa link thẳng của hãng chứa tên và số điện thoại người nhận.
- **Phiên:** cookie `Secure`, `HttpOnly`, `SameSite`; kiểm tra Origin và CSRF cho mọi API đổi trạng thái; MFA bắt buộc cho admin; xác thực lại (OTP) khi rút tiền hoặc đổi tài khoản nhận.
- **Khóa hãng** nằm trong kho bí mật; **nhật ký admin** chống sửa (chỉ ghi thêm), lưu người thao tác, lý do, giá trị trước và sau cho mọi thay đổi bảng giá, cộng tiền tay và duyệt rút tiền.

## 8b. Hàng cấm và dữ liệu cá nhân

- Khi tạo đơn, người dùng chọn loại hàng và xác nhận không gửi hàng cấm (danh mục theo quy định và theo từng hãng, hãng nào không nhận loại hàng nào thì offer của hãng đó bị ẩn). Quản trị cập nhật danh mục được.
- Bước báo giá chỉ gửi dữ liệu tối thiểu (xem 6.1). Thông báo xử lý dữ liệu liệt kê các bên nhận theo từng bước: đơn vị tổng hợp, hãng, ngân hàng và VietQR, kênh gửi OTP.
- Tên, số điện thoại, địa chỉ người gửi và người nhận là dữ liệu cá nhân: chỉ gửi cho hãng đã chọn, không ghi vào nhật ký, cần thỏa thuận xử lý dữ liệu với đơn vị tổng hợp (căn cứ hiện hành cần luật sư xác nhận: Luật Bảo vệ dữ liệu cá nhân có hiệu lực từ 01/01/2026 và các văn bản hướng dẫn, Nghị định 13/2023 có thể đã bị thay thế một phần), và xóa hoặc ẩn danh theo thời hạn lưu trữ cấu hình được sau khi đơn kết thúc.

## 9. Xử lý lỗi

- Mọi lệnh gọi hãng có timeout, retry giới hạn và circuit breaker theo từng hãng.
- Webhook và lệnh tạo đơn đều idempotent theo khóa.
- Lỗi một hãng không làm hỏng báo giá; lỗi tạo đơn không làm mất tiền.
- Ghi nhật ký có `request_id`, không ghi dữ liệu nhạy cảm (OTP, khóa hãng).
- Khóa API của hãng nằm trong biến môi trường hoặc kho bí mật, không vào mã nguồn.

## 10. Kiểm thử

- **Sổ cái** (làm trước, kiểm thử theo tính chất): tổng bút toán mỗi giao dịch bằng 0; số dư không âm trừ bút toán điều chỉnh có trần; hai yêu cầu giữ tiền song song cho cùng ví không thể cùng thành công khi chỉ đủ một; cùng `idem_key` chỉ ghi một lần và khác nội dung trả 409; webhook phát lại không trừ hai lần; giữ tiền rồi nhả hoặc chốt luôn cân bằng.
- **rating:** trọng lượng quy đổi, phụ phí, chặn trần niêm yết, bỏ hãng lỗi hoặc chậm.
- **Hợp đồng adapter:** cùng một bộ kiểm thử chạy trên `mock` và mỗi adapter thật (với sandbox của hãng).
- **orders:** các chuyển trạng thái hợp lệ và không hợp lệ.
- **Đầu-cuối:** quote → tạo đơn → bill → hành trình → hủy với adapter mock.
- **Lỗi tại từng ranh giới:** chết tiến trình sau khi giữ tiền, sau khi hãng tạo đơn nhưng trước khi capture, và giữa hai bước của một giao dịch sổ cái; khôi phục bằng outbox không tạo đơn thứ hai. Rút tiền song song với tạo đơn; webhook đảo thứ tự hoặc trùng; webhook và bảng kê cùng báo một điều chỉnh; bank_inbox nhận cùng một giao dịch hai lần.
- **Thử thật bằng số tiền nhỏ** trước khi mở công khai: nạp → tạo đơn → bàn giao → đối soát, và một luồng hủy và hoàn. Kiểm chứng khôi phục DB từ bản sao lưu.

## 11. Giai đoạn

0. Kiểm chứng đơn thật (làm song song với pha 1): một đơn từ báo giá → mã → quầy nhận → đối soát, dưới đúng tài khoản dự kiến dùng cho 9Ship; kết quả quyết định tổ hợp (dịch vụ, hợp đồng, điểm nhận) nào được hiển thị.
1. Khung backend, adapter mock, tạm tính cước, sổ cái và kiểm thử.
2. Tạo đơn, bill PDF, màn hình người dùng, ô 9Ship trong cổng. Nạp ví ở pha này do quản trị cộng tay (để chạy được trọn luồng trước khi có VietQR).
3. Adapter thật đầu tiên qua đơn vị tổng hợp, đồng bộ bưu cục, bản đồ quầy, **hủy và hoàn tiền, tra cứu hành trình và webhook**. Pha 2 và 3 chỉ dùng nội bộ đến khi các phần này xong; gửi thử đơn thật tại bưu cục để kiểm chứng luồng quầy.
4. Nạp VietQR, rút và hoàn về ngân hàng, trang quản trị đầy đủ, mở cho người dùng bên ngoài.

Sau v1: điểm nhận gửi riêng và trang quầy, API key cho shop, COD và đối soát, đơn hàng loạt, adapter trực tiếp từng hãng lớn.

## 12. Rủi ro và điều chưa biết

- **"Rẻ hơn gửi trực tiếp"** là cam kết kinh doanh. Phần mềm chỉ bảo đảm không bán vượt niêm yết và hiển thị mức tiết kiệm; mức giá sỉ thực tế phụ thuộc hợp đồng.
- **Đơn vị tổng hợp chưa chọn.** Cần chọn một đơn vị có API tạo đơn, hủy, tra cứu và webhook trước pha 3; adapter ẩn sự khác biệt này.
- **Dữ liệu bưu cục** không hãng nào cũng có API; có thể thiếu hoặc phải nhập tay.
- **Kênh nhận tiền nạp VietQR** cần tài khoản ngân hàng và dịch vụ báo biến động số dư; chưa chọn nhà cung cấp.
- **Giá niêm yết:** đơn vị tổng hợp có thể không trả giá công bố của từng hãng. Khi đó phải duy trì bảng `list_prices` bằng tay hoặc thu thập định kỳ; nếu không có trần đáng tin thì không thể bảo đảm "không vượt niêm yết".
- **Địa danh:** việc bỏ cấp quận/huyện đã áp dụng nhưng mã địa danh của các hãng có thể chưa đồng bộ; cần kiểm tra với từng hãng khi viết adapter.
- **OTP:** chưa chọn kênh gửi (SMS hay Zalo) và chi phí mỗi tin; cần chọn trước pha 2.
- **Giá sỉ lúc đầu:** sản lượng gần 0 nên giá vốn có thể gần bằng niêm yết, làm biên bằng 0 hoặc không có offer. Cần thương lượng bậc giá với đơn vị tổng hợp trước pha 3.
- **Điều khoản đơn vị tổng hợp:** dùng một tài khoản để bán lại cho bên thứ ba có thể cần thỏa thuận đối tác; hãng có thể yêu cầu định danh người gửi theo Luật Bưu chính.
- **Địa danh hai cấp sang ba cấp** không phải ánh xạ một-một: một xã/phường mới có thể gộp nhiều phường cũ thuộc vùng cước khác nhau; cần geocode đến tọa độ hoặc hỏi thêm địa chỉ cũ.
- **Hóa đơn VAT** cho cước: chưa định rõ ai xuất (hãng, đơn vị tổng hợp hay 9Ship).
- **Pháp lý và thuế** khi giữ tiền trả trước của người dùng: cần xác nhận với kế toán và luật sư (ví đơn mục đích hay phải qua trung gian thanh toán có phép) trước pha 4 và trước khi chạy tiền thật.
