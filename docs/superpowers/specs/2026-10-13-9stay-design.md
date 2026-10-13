# 9stay: đặc tả thiết kế (v3, mô hình sàn nhiều chủ)

Ngày: 2026-10-13. Trạng thái: **v3 đã được chủ sản phẩm duyệt ngày 14/10/2026** (kể cả các đề xuất 17–21 và miễn phí 1 tháng); các câu hỏi mở dùng mặc định ở mục 16; đang lập kế hoạch lát 1. Bản phác giao diện: `docs/9stay-mockup.html` (một số màn vẫn theo v2, xem mục 12).

Lịch sử: v1 (PMS một cơ sở) → v2 (sau phản biện kỹ thuật, sản phẩm, pháp lý) → **v3 (Anstay thực chất là sàn phân phối phòng của nhiều chủ, qua nhiều sale/CTV)**. Nguồn: brainstorm với chủ sản phẩm và 8 vòng phản biện độc lập. Chưa đọc được giá trị ô của bảng tính Anstay (`Anstay_QuyPhong_BangGia_v5`, chỉ thấy cấu trúc tab), nên mọi con số ở đây là mặc định, không phải giá thật.

## 1. Mục tiêu

Phần mềm cho một đơn vị phân phối lưu trú (khách đầu tiên: Anstay, công ty) bán phòng của **nhiều chủ phòng**, trong **tòa nhà ở khu du lịch, chủ cho thuê lại, không phải để ở**, qua **nhiều sale nội bộ và CTV**. Thay Google Sheet bằng:

- lịch phòng theo căn, không thể đặt trùng, tôn trọng ngày chủ tự dùng;
- bảng giá và báo giá tự tính, có giá sàn của chủ và biên của Anstay;
- cổng CTV/sale có hoa hồng và đối soát;
- cổng chủ phòng (xem lịch, chặn ngày, xem bản kê);
- trang đặt phòng công khai thu cọc tự động qua VietQR;
- vận hành, dọn phòng, folio, hóa đơn, bản kê chủ, báo cáo;
- nhập lịch iCal của chủ để tránh trùng với kênh khác.

9app **chỉ bán công cụ**: Anstay là bên bán, chủ kiểm soát dữ liệu; 9app không giữ tiền và không đứng giữa dòng tiền. Webapp/PWA tiếng Việt, mobile-first, có màn hình máy tính cho quản trị, sáng/tối, nút `‹ 9app`, tài khoản 9id.

Thành công khi: Anstay vận hành một kỳ bản kê chủ trọn vẹn mà không cần Sheet; không đặt trùng với đơn nội bộ; mọi khoản tiền vào đối chiếu được với sao kê; bản kê chủ và hoa hồng không tranh chấp.

## 2. Ngoài phạm vi (bản đầu)

Osin; bán theo giờ; nhận tiền mặt; thu hộ của CTV; cổng thẻ/ví; lưu CCCD (khai báo lưu trú chỉ nhắc và đánh dấu); mã giảm giá và đặt sớm/phút chót; cộng dồn ưu đãi; chủ tự đăng tin hoặc tự định giá công khai; hoàn tiền tự động; SMS; xlsx; ngoại tuyến có ghi (trừ buồng phòng); đồng bộ iCal hai chiều và channel manager đầy đủ (chỉ nhập iCal một chiều).

## 3. Quyết định đã chốt

| # | Quyết định | Ai chốt |
|---|---|---|
| 1 | Anstay là sàn phân phối phòng nhiều chủ, nhiều sale; phòng trong tòa nhà khu du lịch, cho thuê lại | Chủ SP |
| 2 | Xây cả 7 mục | Chủ SP |
| 3 | 9app chỉ bán công cụ; Anstay là bên bán | Chủ SP |
| 4 | Miễn phí 1 tháng đầu, chỉnh trong cài đặt (phản biện khuyên 2–3 tháng để qua ít nhất hai kỳ bản kê chủ) | Chủ SP |
| 5 | Khai báo lưu trú: chỉ nhắc và đánh dấu, theo từng căn | Chủ SP |
| 6 | Mọi con số nghiệp vụ là cài đặt, kể cả theo tòa nhà và theo chủ | Chủ SP |
| 7 | Ô lịch theo đêm; không bán theo giờ | Chủ SP |
| 8 | Căn cố định, hệ thống tự gán căn lúc đặt; lễ tân đổi tay được trước nhận phòng | Chủ SP |
| 9 | Khóa theo loại phòng N phút (mặc định 5) khi tới nút thanh toán; gán căn khi tiền về | Chủ SP |
| 10 | Giá khách thấy đã gồm VAT; cổng CTV/nội bộ hiện giá trước thuế | Chủ SP |
| 11 | Mỗi đơn tối đa một ưu đãi | Chủ SP |
| 12 | Tiền khách trả thẳng vào tài khoản công ty Anstay, VietQR + webhook, không tiền mặt, CTV không thu tiền | Chủ SP |
| 13 | Hoa hồng % hoặc giá net, cùng một sổ hoa hồng | Chủ SP |
| 14 | Hóa đơn điện tử tích hợp bên thứ ba; thời điểm lập theo cài đặt, mặc định lập khi thu tiền (chờ kế toán xác nhận) | Chủ SP |
| 15 | Có khách nước ngoài; tiếng Anh cho trang công khai và biên nhận | Chủ SP |
| 16 | Không lưu CCCD; ngoại tuyến chỉ đọc (ngoại lệ buồng phòng) | Chủ SP |
| 17 | Anstay là **bên bán chính** với mọi chủ (hợp tác kinh doanh hoặc thuê lại), không bán hộ: một bên xuất hóa đơn, tránh thành sàn | Chủ SP (duyệt 14/10) |
| 18 | Tồn kho tách khỏi tiền: `owner_releases` luôn có; `revenue_share` xây trước, `master_lease` là trường hợp con | Chủ SP (duyệt 14/10) |
| 19 | Tiền thuộc chủ sau trả phòng + N ngày (mặc định 3); kỳ bản kê tháng; tài khoản ngân hàng riêng cho tiền giữ hộ | Chủ SP (duyệt 14/10) |
| 20 | Hoa hồng sale/CTV theo kênh, đồng nhất giữa các chủ; sale không thấy giá chủ | Chủ SP (duyệt 14/10) |
| 21 | Nhập iCal của chủ (một chiều) vào lát 3, không để cuối | Chủ SP (duyệt 14/10) |

## 4. Mô hình dữ liệu

Mọi bảng có `org_id`/`property_id` thích hợp. Tiền là số nguyên VND. Đêm là `date`; hạn giữ, hạn báo giá là `timestamptz`; múi giờ `Asia/Ho_Chi_Minh`. Dữ liệu chỉ thêm, không sửa: dòng giá, sổ, nhật ký, bản kê đã đóng băng. Sự kiện và nhật ký chỉ chứa id, không chứa tên hay SĐT.

**Cơ cấu sở hữu**
- `orgs` (Anstay), `members(org_id, user_id, role)`; mời bằng mã mời, không bằng SĐT (9id không có tra cứu theo SĐT).
- `buildings(org_id, name, address, legal_type: can_ho_du_lich|nha_o|khac, rules_note, declared_by_default)`.
- `owners(org_id, kind: ca_nhan|to_chuc, user_id nullable, tax_id, bank_account_enc, status)`.
- `units(building_id, owner_id, room_type_id, code, floor, capacity_std, capacity_max, license_holder, status)`: thay cho `rooms`.
- `room_types`: nhóm giá và hiển thị, có thể xuyên tòa.
- `owner_contracts(owner_id, unit_id, kind: revenue_share|master_lease, valid_from, valid_to, owner_share_pct, owner_net_floor, fixed_rent, cleaning_payer: owner|anstay|guest, cancel_penalty_pct, statement_cycle, payout_delay_days, tax_withhold, version)`: có hiệu lực theo ngày, đổi không áp ngược.

**Tồn kho**
- `owner_releases(unit_id, night, kind: open|owner_use|blocked_by_owner|blocked_by_anstay, source: app|ical|manual)`, `UNIQUE(unit_id, night)`. Master lease sinh release toàn kỳ tự động. Chặn ngày của chủ nằm ở đây, không ở `stays`.
- `unit_ical_feeds(unit_id, url_enc, last_sync_at, last_ok)`: nhập một chiều.
- `holds`: giữ chỗ theo **loại phòng** (khóa thanh toán, giữ của CTV/lễ tân), có `hold_until`, không có căn. Sức chứa loại = số căn mở bán − stays hoạt động − holds hoạt động, kiểm trong giao dịch có `pg_advisory_xact_lock(room_type_id)`.
- `bookings` (khách, nguồn, `agent_id`, `created_by`, chính sách hủy chụp, `quote_id`, `version`), `stays`, và **`room_nights(booking_id, night, unit_id, rate_line_id)` với `UNIQUE(unit_id, night) WHERE active`** là nguồn chống trùng duy nhất; thêm kiểm `owner_releases.kind='open'` cho từng đêm trước khi chèn. Đổi chéo căn: xóa-chèn trong một giao dịch hoặc ràng buộc `DEFERRABLE`.
- `booking_events`, `audit_log` chỉ thêm.

**Giá**
- `rate_plans` (công khai, CTV), `rate_calendar(room_type, plan, night, price, min_stay, closed, source)` sửa được, kèm `rate_calendar_history`.
- `unit_floor_prices` (từ hợp đồng chủ): giá sàn/net chủ theo đêm; kiểm `giá bán ≥ giá sàn / (1 − %chia)` khi lưu.
- `rate_rules` (bộ sinh), `promotions`, `extras`, `quotes` (có hạn, chụp thẳng `price_lines`), `price_lines` bất biến.

**Tiền**: sổ kép bất biến theo mẫu `9ship/db/001_init.sql` (accounts, ledger_transactions, ledger_entries, trigger chỉ thêm). Tài khoản: `bank`, `guest_deposit_liability`, `held_for_owner[owner]`, `owner_receivable[owner]`, `anstay_fee_revenue`, `agent_commission_payable[agent]`, `cleaning_payable[vendor]`, `vat_payable`, `tax_withheld_for_owner[owner]`, `refund_payable`, `dispute_reserve`. Cùng `payments`, `bank_inbox`, `bank_statement_lines`, `folios` (nhiều căn một folio), `invoices(gốc|điều chỉnh|thay thế)`.

**Bán và chi**: `agents(kind: sale|ctv, commission_policy_id, status)`, `commission_policies(basis, pct, net_mode, applies_to: org|building|owner)`, `guest_refs`, `commission_entries(accrue|reverse|adjust|payout)`, `commission_statements` (đóng băng).

**Chủ phòng**: `owner_statements(owner_id, period, total_gross, total_owner, total_fees, tax_withheld, payable, status: draft|frozen|paid)`, `owner_statement_lines(statement_id, booking_id, ledger_tx_id, amount, kind)`.

**Vận hành**: `guests` (tên, SĐT, quốc tịch; không số giấy tờ; `lodging_declared_at, declared_by`), `business_days`, `cleaning_tasks(unit_id, booking_id, due_at, assignee_id, fee, payer, status)`, `room_status_events`, `settings` (có phiên bản, hiệu lực từ ngày, theo org/tòa/chủ/căn).

**Mã đơn**: tiền tố + số theo cơ sở, chuẩn hóa khi khách gõ ("an 2310" → `AN2310`).

## 5. Máy trạng thái

- **Đặt phòng**: `giu(hold_until)` → `da_coc` → `da_nhan` → `da_tra`; `giu` → `het_han`; `da_coc` → `huy` | `khong_den` | `huy_do_chu`; nhánh `da_tra_chua_xep` (tiền về khi hết căn) → `da_coc` | `hoan`.
- **Tiền vào (`bank_inbox`)**: `received` → `matched` | `needs_review` → `resolved(matched|credited|refunded)`.
- **Buồng phòng**: `dirty` → `cleaning` → `clean`; `out_of_order` ngang hàng; trả phòng tự chuyển `dirty`.
- **Hoa hồng**: `du_kien` → `du_dieu_kien` (sau trả phòng) → `da_chi`.
- **Bản kê chủ**: `draft` → `frozen` → `paid`; sai sót sau khi đóng băng chỉ bằng dòng điều chỉnh ở kỳ sau.

## 6. Giá và báo giá

- Báo giá = SELECT trên `rate_calendar`; quy tắc thứ/mùa/lễ chỉ sinh ô, ô sửa tay không bị ghi đè trừ khi tick riêng.
- Ai đặt giá: **chủ đặt giá sàn/net theo đêm** (trong hợp đồng, đổi có hiệu lực từ ngày); **Anstay đặt giá bán**; sale/CTV không đặt giá, chỉ có ưu đãi trong hạn mức. Parity cứng: giá công khai = giá sale báo; CTV khác nhau ở hoa hồng, không ở giá khách trả.
- Biên Anstay = giá bán − phần chủ − hoa hồng − phí dọn; cảnh báo khi âm. Giá net CTV phải ≥ giá sàn chủ + hoa hồng tối thiểu.
- Đường tính cố định, từng đêm: giá nền → + phụ thu → − một ưu đãi → **làm tròn dòng đêm** (half-up tới nghìn) → cộng đêm → VAT trên tổng rồi làm tròn → tổng → cọc làm tròn riêng. Mỗi dòng lưu đã được làm tròn đúng một lần; tổng có thể lệch tổng "tính một lần cuối" tối đa vài lần bước làm tròn (đã chốt khi cài lát 1B: chấp nhận để mỗi dòng giá là số tròn, đối chiếu được với bản kê). Giá trong `rate_calendar` là **giá trước VAT**; khách thấy tổng đã gồm VAT.
- Hủy đơn đã thu tiền: bắt buộc chọn số giữ lại (`retainAmount`, 0 = hoàn hết). Phần giữ lại chia chủ/Anstay theo hợp đồng của đêm đầu và vào bản kê chủ (loại `cancel`); phần còn lại hoàn tay. Đơn `giu` đã nhận tiền không bị tự nhả khi quá hạn, mà vào danh sách "quá hạn còn tiền". Dời đơn đã có giá bắt buộc kèm báo giá mới (dòng giá cũ được đảo bằng dòng âm).
- Hoa hồng: tỉ lệ chụp vào đơn lúc đặt; sale/CTV phải đang hoạt động khi đặt. Bản kê chủ âm (chủ còn nợ phí dọn) được mang sang bản kê kế tiếp đúng một lần.
- Báo giá có hạn (mặc định 24 giờ); giữ chỗ gắn `quote_id`; khóa thanh toán chỉ khóa tình trạng.
- Dòng giá bất biến; sửa đơn bằng dòng điều chỉnh; chính sách hủy chụp vào đơn.
- Lớp kiểm tra cấu hình: đêm chưa có giá, giá bằng 0, giá bán dưới giá sàn, giá CTV cao hơn công khai, mùa chồng mùa, phụ thu vượt sức chứa.
- Hàm báo giá thuần nhận `clock` tiêm vào; golden cases ở mục 14.

## 7. Cổng CTV và sale

- PWA nhẹ `/stay/ctv`, cùng backend. Chủ/ops mời bằng mã mời; đăng nhập 9id.
- Màn: Tìm phòng (giá bán cho khách đã gồm VAT + hoa hồng dự kiến; không thấy chủ, căn cụ thể, giá sàn), Giữ chỗ theo loại + báo giá một chạm (tin Zalo, link thanh toán chứa token ngẫu nhiên), Đơn của tôi, Hoa hồng. Không có màn danh bạ khách.
- Giữ chỗ có hạn (mặc định 2 giờ), giới hạn đồng thời, thời gian chờ không cho giữ lại, theo dõi tỉ lệ giữ → cọc. Mở link thanh toán = làm mới tình trạng + khóa 5 phút.
- Nguồn đơn theo SĐT khách, bảo lưu mặc định 60 ngày; thứ tự: hold của CTV > `?ref=` > `guest_refs` còn hạn > trực tiếp; lệch nhau thì tạo tranh chấp, chủ phân xử có nhật ký.
- Hoa hồng tính từ dòng giá thực tế lúc trả phòng, trên tiền phòng + phụ thu − ưu đãi − giảm tay, trước VAT, không dịch vụ thêm. **Hoa hồng theo kênh, không theo chủ**, để sale không bị xung đột lợi ích; ưu tiên hiển thị căn do Anstay đặt, không dùng tiền.
- Kỳ = tháng theo ngày trả phòng; bản kê đóng băng; 7 ngày khiếu nại. Thuế TNCN hoa hồng: chừa cột "số đã khấu trừ", xuất CSV theo năm, chờ kế toán.

## 8. Cổng chủ phòng

Cần ngay nhưng tối giản (không có thì chủ gọi điện chặn ngày, nhân viên gõ tay, dễ trùng):
- Đăng nhập 9id bằng mã mời. Chủ chỉ thấy căn của mình.
- Xem lịch căn (khách ẩn danh một phần, không thấy hoa hồng sale), **chặn/mở ngày** (ghi vào `owner_releases`), xem bản kê và số dư giữ hộ.
- Bản kê gửi được PDF qua Zalo trước, màn hình sau.

## 9. Đặt phòng công khai và thanh toán

- `/stay/<tòa hoặc thương hiệu>?ref=<mã CTV>`: HTML dựng sẵn ở máy chủ, dưới 200 KB lần đầu, Open Graph, tiếng Việt và tiếng Anh. Ưu tiên tên miền của Anstay (CNAME). Hiện giờ nhận/trả, sức chứa, phụ thu, số đêm tối thiểu, nội quy tòa nhà, chính sách hủy; **giá đã gồm VAT**.
- Anstay là bên bán chính; chủ không tự đăng tin công khai.
- Khóa phòng cần OTP SĐT sau PoW. Mỗi SĐT một khóa hoạt động, 3 khóa mỗi ngày; khách vãng lai không khóa quá `max(1, floor(50%))` số căn còn lại của một loại. Chọn trước lát 5: thêm endpoint OTP vào 9id hoặc 9stay gọi eSMS trực tiếp.
- Thanh toán: VietQR động (nội dung ngắn dạng `STAY AN2318`) + ba nút sao chép + "Mở app ngân hàng" + "Tôi đã chuyển, chưa thấy xác nhận". Ô tick đồng ý chính sách (lưu phiên bản, thời điểm).
- Ghép tiền: mã đơn trong nội dung đã chuẩn hóa → số tiền lẻ duy nhất → `needs_review`. Webhook theo adapter từng nhà cung cấp, chống phát lại theo `bank_tx_id`, **cron 1–2 phút liệt kê giao dịch là nguồn sự thật**, webhook chỉ là đường nhanh. Route webhook phải mở ra internet riêng, tách khỏi `/admin-api/` và `/internal/`.
- Tiền về sau khi hết khóa: còn căn cùng loại thì xác nhận; hết thì `da_tra_chua_xep`, khách chọn đổi hoặc hoàn trong 3 ngày làm việc, Anstay chịu phí. Thiếu: QR phần thiếu; thừa/trùng: `credit`.
- Biên nhận mở bằng token; hủy cần xác thực SĐT. Khách nước ngoài: form "yêu cầu đặt" xác nhận bằng email hoặc lễ tân, không khóa tự động, không cọc trước.

## 10. Vận hành, folio, tiền chủ, hóa đơn

- Nhận phòng: kiểm tra giấy tờ bằng mắt, không lưu; đánh dấu đã khai báo lưu trú (**theo căn: ghi ai khai, bằng tài khoản nào**); thu nốt bằng QR. Nhắc lúc 22:00 danh sách khách chưa khai.
- Trả phòng chỉ khi số dư 0; ngoại lệ quản lý duyệt, ghi khoản phải thu.
- Dọn phòng: `cleaning_tasks` liên tòa, người dọn là nhân viên Anstay hoặc thuê ngoài, `cleaning_payer` theo hợp đồng chủ; checklist ảnh theo lần dọn làm bằng chứng khi tranh chấp.
- **Chốt ngày** 04:00 (cài đặt): tự ghi tiền phòng, không chặn; việc tồn thành checklist cho quản lý xác nhận sáng hôm sau.
- **Sổ chủ phòng.** Tiền về: `bank +X / guest_deposit_liability +X`, chưa chia. Khi trả phòng: `guest_deposit_liability −G` → `held_for_owner +O`, `anstay_fee_revenue +F`, `agent_commission_payable +C`, `cleaning_payable +K` (theo `cleaning_payer`); phần dư làm tròn dồn về Anstay. Hủy do khách: cọc giữ lại chia theo hợp đồng. Hủy do chủ: `refund_payable`, `owner_receivable +G + phạt`, bù trừ vào bản kê, âm thì mang sang kỳ sau. Tranh chấp: giữ `dispute_reserve` = phần chủ của đơn đó. Chi chủ chỉ từ dòng đã `matched`, theo bản kê đóng băng.
- Rủi ro giữ tiền hộ: tài khoản ngân hàng riêng cho tiền giữ hộ, báo cáo hằng ngày "số dư giữ hộ so với số dư ngân hàng" (phải khớp), chi từ tiền giữ hộ chỉ cho chủ, hợp đồng gọi đúng "thu hộ theo ủy quyền", không dùng chữ "ví".
- Hóa đơn: `invoice_timing = per_receipt|at_checkout` (mặc định lập khi thu tiền, chờ kế toán xác nhận) và `invoice_for_all` là hai cài đặt riêng. Sau hóa đơn gốc, dòng folio bị khóa, chỉ lập điều chỉnh/thay thế. Anstay xuất hóa đơn cho khách; chi phí đầu vào từ chủ cá nhân khai thay (cần kế toán).
- Giảm giá tay: mã lý do, hạn mức theo ca/ngày, quản lý duyệt vượt mức, cấm sau hóa đơn gốc.
- Nhắc khách: email + nút sao chép tin dán vào Zalo; Zalo ZNS khi có OA; bỏ SMS.
- Báo cáo (7): chốt ngày; doanh thu theo đêm ở; tiền thu theo ngày thu (không bao giờ trộn với báo cáo trước); công suất/ADR/RevPAR (công suất = đêm bán ÷ (số căn mở bán × số ngày); phòng khóa hiện riêng); công nợ và cọc; hủy/no-show/giảm giá; đối soát ngân hàng, CTV và chủ. Biên Anstay theo chủ/tòa. Xuất CSV.

## 11. Vai và quyền

| Vai | Thấy / làm |
|---|---|
| Chủ SP của Anstay / quản lý | Tất cả; duyệt hoàn tiền và giảm vượt mức; mở lại ngày đã chốt; chốt bản kê |
| Điều phối (ops) | Lịch, đơn, dọn phòng, iCal; không thấy sổ tiền |
| Sale nội bộ | Như CTV, thêm tạo đơn thay khách; không thấy giá chủ |
| Lễ tân | Hôm nay, lịch, đặt phòng, khách, buồng phòng, thu tiền; không sửa giá, không hủy đơn đã có tiền, không duyệt hoàn |
| Buồng phòng / người dọn | Chỉ "Phòng của tôi"; không thấy tên khách, SĐT, giá |
| CTV | Chỉ đơn của mình; không thấy căn cụ thể, chủ, giá sàn, khách khác |
| Chủ phòng | Chỉ căn của mình; chặn/mở ngày; bản kê; khách ẩn một phần; không thấy hoa hồng sale |

Phân quyền ở máy chủ, không chỉ ẩn menu. `audit_log` chỉ thêm.

## 12. Giao diện

Chi tiết trong `docs/9stay-mockup.html` (còn theo v2, chưa có màn chủ phòng, tòa nhà, hợp đồng, bản kê chủ). Quy ước: trạng thái phân biệt bằng cả màu lẫn nét; token màu theo 9lunch; kéo thả luôn kèm Hoàn tác 10 giây và đường thay thế không cần kéo; vùng chạm tối thiểu 44px. Điện thoại: danh sách theo ngày + lưới 3 ngày; máy tính: timeline 14 ngày + ngăn chi tiết.

## 13. Pháp lý và đối tác

**Cần luật sư hoặc kế toán xác nhận bằng văn bản gốc; phản biện chỉ trích dẫn thứ cấp, chưa kiểm diễn biến đến 10/2026:**
- Cho thuê ngắn ngày căn hộ chung cư để ở: vùng xám đến rủi ro cao (Luật Nhà ở 2023; quy định địa phương như TP.HCM; có thông tin về xem xét thu hồi chứng nhận homestay trong chung cư ở Bà Rịa–Vũng Tàu). `buildings.legal_type` bắt buộc; `nha_o` phải có cờ "chủ cam kết chịu rủi ro tòa nhà cấm"; hợp đồng loại trừ trách nhiệm của 9app.
- Điều kiện kinh doanh lưu trú, ai là "cơ sở" (cột `license_holder` theo căn).
- Khai báo lưu trú theo từng căn (Luật Cư trú 2020; Luật Xuất nhập cảnh với khách nước ngoài).
- Thuế của chủ cá nhân cho thuê (GTGT, TNCN, ngưỡng 2026 chưa thống nhất) và ai khấu trừ/khai thay: bản kê chủ phải có cột thuế khấu trừ.
- Hóa đơn: thời điểm lập với tiền cọc lưu trú (NĐ 123/2020 sửa bởi NĐ 70/2025); bán hộ hay bán chính (ủy nhiệm lập hóa đơn khó áp dụng với chủ cá nhân).
- Thương mại điện tử: website bán hàng hay sàn; NĐ 117/2025 về nền tảng có chức năng thanh toán khấu trừ thay thuế; Luật TMĐT 122/2025. Tránh để chủ tự đăng/tự định giá công khai.
- Bảo vệ dữ liệu cá nhân (Luật 91/2025): hợp đồng xử lý dữ liệu, thông báo đồng ý, quy trình sự cố; thời hạn lưu gợi ý 24 tháng.
- Giữ tiền hộ chủ có thể bị xem là dịch vụ trung gian thanh toán nếu quảng bá "ví/giữ tiền" (NĐ 52/2024).
- Giá niêm yết gồm thuế với người tiêu dùng (Luật Giá 2023).

**Đối tác (quy trình 9app: sandbox + một giao dịch thật chi phí nhỏ):** dịch vụ nhận biến động ngân hàng (chưa chọn; ngân hàng của Anstay phải được hỗ trợ); nhà cung cấp hóa đơn điện tử (chưa chọn); eSMS qua 9id; Zalo OA (chưa có khóa).

**Hợp đồng SaaS:** Anstay là bên bán và kiểm soát dữ liệu; giới hạn trách nhiệm; cam kết sao lưu; quyền xuất dữ liệu; mọi lệnh hoàn tiền do Anstay thực hiện; cam kết "không đặt trùng" chỉ đúng với đơn đi qua 9stay (cộng với iCal nhập một chiều).

**Thu phí:** miễn phí giai đoạn đầu (cài đặt được); sau đó thuê bao theo số căn cộng phí theo số CTV hoạt động; tránh thu % đơn (rủi ro giống bên trung gian).

## 14. Kiểm thử và thứ tự xây

`npm test` (PostgreSQL nhúng, node:test) và `npm run e2e` (Chrome thật, 390x844, 360x740, 1280x800, sáng/tối) phải sạch; test trước khi viết; `clock` tiêm vào hàm thuần. Golden cases báo giá: 1 đêm thường; 3 đêm vắt thứ 6→CN; vắt mùa thấp→Tết; vi phạm min-stay; 3 người lớn + trẻ 7 tuổi + trẻ 3 tuổi; CTV net so với công khai; ưu đãi vượt 100%; thiếu giá một đêm; gia hạn sau khi bảng giá đổi; hủy trước 3 ngày với cọc 30%; giá bán dưới giá sàn. Thêm: hai khóa cùng loại phòng cùng lúc; tiền về sau hết hạn; webhook phát lại; chủ chặn ngày trùng đơn; chia tiền chủ có phần dư; hủy do chủ bù trừ bản kê.

Thứ tự (phản biện khuyên: sổ chủ phòng trước trang công khai, vì nó mới là thứ thay Sheet "QuyPhong" và vì cọc tự động khi chưa có sổ chủ đúng sẽ đẩy tiền giữ hộ vào hệ thống chưa biết chia):
- **Lát 1**: nền (lược đồ, `room_nights`, vai và quyền, cài đặt, nhật ký, sổ chỉ thêm) + tòa/căn/chủ/hợp đồng + lịch có chặn ngày chủ + bảng giá đơn giản có giá sàn + đặt phòng nội bộ + cọc ghi tay + **bản kê chủ CSV và hoa hồng CSV tính từ dòng giá**. Chạy song song Sheet; cần qua ít nhất hai kỳ bản kê.
- **Lát 2**: VietQR + webhook + cron đối soát + `needs_review`.
- **Lát 3**: cổng chủ phòng tối giản + nhập iCal một chiều.
- **Lát 4**: cổng CTV/sale + đối soát kỳ.
- **Lát 5**: trang công khai + OTP + khóa 5 phút; buồng phòng chỉ đọc.
- **Lát 6**: folio đầy đủ, chốt ngày, dọn phòng, hóa đơn điện tử, báo cáo, bản kê chủ có thuế.
- Nhập dữ liệu từ Sheet xuyên suốt, thử INSERT rồi ROLLBACK để lộ chỗ trùng cũ; bị chặn đến khi đọc được giá trị ô.
- **Song song từ đầu:** 9id lên server (BACKLOG A2); xin sandbox dịch vụ ngân hàng; hỏi kế toán/luật sư các câu ở mục 13; lấy dữ liệu thật của Anstay; chọn nhà cung cấp hóa đơn; chọn đích sao lưu ngoài máy chủ (`9ship/scripts/backup.sh` chỉ lưu cục bộ); dọn đĩa (88%) và kiểm RAM (~1,5 GB, chia cho 9id, Osin, 9stay).

## 15. Rủi ro

- Pháp lý lưu trú trong chung cư và thuế chủ (mục 13); chưa kiểm chứng.
- "Không đặt trùng" chỉ đúng trong nội bộ nếu chủ tự bán trên Airbnb/Booking/Zalo; iCal nhập một chiều giảm nhưng không loại bỏ.
- Tiền giữ hộ chủ: lẫn tiền, chủ đòi trước khi khớp, tranh chấp tòa nhà.
- Kỷ luật nhập liệu của Anstay và sale: hệ thống chỉ đúng khi 100% đơn đi qua nó; nhiều ma sát thì quay lại Sheet.
- Dữ liệu Anstay chưa đọc được (bảng giá, hợp đồng chủ, quỹ phòng, chính sách, script CTV).
- Webhook phụ thuộc nhà cung cấp trung gian và chính sách ngân hàng.
- Hạ tầng chung: RAM ~1,5 GB, đĩa 88%, sao lưu ngoài máy chủ chưa có đích.
- Phụ thuộc một khách hàng.
- Khách nước ngoài chưa có kênh trả trước.

## 16. Câu hỏi mở và mặc định tạm

Chủ SP giao quyền chọn mặc định hợp lý để bắt đầu xây (14/10/2026). Mọi mặc định dưới đây là **cài đặt**, đổi được khi có dữ liệu thật của Anstay, không cần sửa mã:

- Hình thức hợp đồng chủ: mặc định chia doanh thu (`revenue_share`); thuê lại cố định = phần chủ 0 theo đơn, tiền thuê ghi tay hằng tháng. Phần chủ mặc định 70%, giá sàn 0 (chưa kiểm), chi sau trả phòng 3 ngày, kỳ bản kê tháng, phí dọn do chủ chịu, phạt khi chủ hủy 20%.
- Giá: Anstay đặt giá bán; chủ đặt giá sàn; không có giá thật nên bảng giá khởi tạo trống, chỉ có công cụ nhập.
- Nguồn đơn bảo lưu 60 ngày; hạn giữ chỗ lễ tân 24 giờ, CTV 2 giờ; khóa thanh toán 5 phút; cọc 30%; hạn báo giá 24 giờ.
- Hủy: miễn phí trước 3 ngày; 1–3 ngày giữ 50% cọc; trong 1 ngày giữ 100%.
- VAT 10% (giá khách thấy đã gồm VAT); thời điểm lập hóa đơn: khi thu tiền (chờ kế toán).
- Chốt ngày 04:00; thời hạn lưu dữ liệu khách 24 tháng; miễn phí 1 tháng đầu.
- Dịch vụ ngân hàng, nhà cung cấp hóa đơn: chưa chọn; lát 1 không cần.

Các câu hỏi gốc, vẫn cần hỏi Anstay để thay mặc định bằng số thật:

1. Anstay làm với chủ theo kiểu nào: thuê lại cố định, chia %, hay quỹ phòng theo ngày (hoặc kết hợp)? Xin một hợp đồng mẫu và tab "QuyPhong" thật.
2. Bao nhiêu chủ, căn, tòa; mỗi tòa có nội quy riêng, có bị cấm hoặc yêu cầu dừng chưa; pháp lý từng tòa là căn hộ du lịch hay nhà ở?
3. Chủ có tự bán trên Airbnb/Booking/Zalo không; hiện tránh trùng bằng cách nào?
4. Ai đặt giá (chủ, Anstay, thỏa thuận từng căn)? Biên Anstay mục tiêu?
5. Trả tiền chủ khi nào (trước hay sau trả phòng, bao lâu một lần)? Từng hoàn khách vì chủ hủy chưa, ai chịu?
6. Ai dọn phòng, ai chịu phí? Có người dọn thuê ngoài không?
7. Ai xuất hóa đơn cho khách hôm nay; chủ cá nhân có hộ kinh doanh, có khai thuế; Anstay có khai thay?
8. Anstay đồng ý là bên bán chính (quyết định 17)? Thời điểm lập hóa đơn với cọc (kế toán xác nhận)?
9. Hoa hồng hiện nay, thời điểm chi, đổi % giữa tháng áp từ đơn nào?
10. Giá thật: bảng giá, ưu đãi, combo, chính sách hủy.
11. Dịch vụ nhận biến động ngân hàng và ngân hàng của Anstay; tài khoản riêng cho tiền giữ hộ được không?
12. Thời gian miễn phí: 1 tháng hay 2–3 tháng để qua hai kỳ bản kê?
13. Thời hạn lưu dữ liệu khách; hạn bảo lưu nguồn đơn (60 ngày?).
