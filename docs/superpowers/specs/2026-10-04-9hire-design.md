# 9hire: thiết kế bản đầu (MVP)

Ngày: 04/10/2026. Bối cảnh ở `docs/y-tuong-app-moi.md` (9hire đã được chủ sản phẩm đánh dấu "ok"; liên quan 9tip, 9cv, 9interview, 9shift, 9team). Thư mục `D:\9app.tech\hire\`, cổng 8101, đường dẫn gốc `/hire`, CSDL `hire`, vai trò `hire`.

## Mục tiêu
Thị trường việc làm **nhỏ và gọn**: việc làm thêm, bán thời gian, tuyển nhanh của quán, cửa hàng, xưởng nhỏ, hộ gia đình kinh doanh; thêm tin văn phòng do người dùng đăng tay. **Ngoài phạm vi:** giúp việc gia đình, gia sư (xem như nhóm khác, nhiều rủi ro riêng), cho vay, bán hàng đa cấp. Trọng tâm là **an toàn cho người tìm việc** (chống lừa đảo thu phí, đặt cọc, ép mua hàng, đa cấp) và **dễ dùng trên điện thoại** (mở link, không cần đăng ký).

## Hai phía
**Người tìm việc (không đăng ký).** Xem, tìm (không dấu), lọc tin. Hồ sơ ngắn (tên, số điện thoại/Zalo, khu vực, ca rảnh, "bắt đầu ngay", giới thiệu ngắn) **chỉ lưu trên thiết bị** (localStorage), tự điền khi gửi quan tâm. Lưu tin và bộ lọc báo tin mới cũng lưu trên thiết bị. Gửi quan tâm: tên + số điện thoại (Zalo) + lời nhắn ngắn, máy chủ chỉ lưu bản gửi cho nhà tuyển dụng của tin đó.
**Nhà tuyển dụng.** Cookie phiên ẩn danh `hsid` (HttpOnly, chỉ lưu băm SHA-256) + **mã khôi phục** 16 ký tự hiện đúng một lần (lưu băm SHA-256) để vào lại từ máy khác hoặc khi mất cookie; không email, không mật khẩu. Đăng tin, sửa, đóng, mở lại/gia hạn; hộp thư ứng viên theo từng tin; đánh dấu Mới / Đã liên hệ / Nhận / Loại.

## Mô hình tin
`vị trí`, `loại` (lam_them, ban_tg, toan_tg, thoi_vu, van_phong), `nhóm nghề` (phuc_vu, bep, ban_hang, kho, giao_hang, bao_ve_tap_vu, san_xuat, van_phong, khac), `mô tả`, `yêu cầu`, `lương` (hình thức gio/ngay/ca/thang/thoa_thuan, khoảng min-max đồng), `ca` (sáng, chiều, tối, đêm, linh hoạt) + ghi chú giờ, `thành phố` + `quận/huyện` (văn bản, có gợi ý), `địa chỉ cụ thể` (**chỉ hiện sau khi xác nhận cảnh báo**), `bắt đầu ngay`, `số lượng`, `hạn` (tối đa 30 ngày, mặc định 14), liên hệ (tên, số điện thoại/Zalo; **chỉ hiện sau xác nhận**). Trạng thái: `dang` (hiển thị tới hết hạn), `dong` (nhà tuyển dụng đóng), `an` (bị ẩn do báo cáo hoặc Console). Hết hạn là **suy ra từ `expires_at`** (không phụ thuộc tác vụ nền), quét dọn dữ liệu cũ chạy mỗi giờ.

## Chống lừa đảo (trọng tâm)
1. **Bộ lọc từ khóa chặn cứng** khi đăng và khi sửa (chuẩn hóa không dấu, bỏ ký tự phân cách, bắt cả viết liền/cách chữ): thu phí, đặt cọc, ký quỹ, nộp tiền, chuyển khoản trước, ép mua hàng/sản phẩm/gói, đa cấp/MLM, "tự bỏ vốn nhập hàng", nạp tiền/like-share/đánh giá sản phẩm kiếm tiền, vay/tín dụng đen, tiền ảo, cờ bạc. Có xử lý **phủ định** ("không thu phí", "miễn phí", "không cần đặt cọc" không bị chặn nhưng phần còn lại của câu vẫn quét). Số điện thoại, email, đường link, Telegram/Zalo trong mô tả bị chặn (liên hệ phải đi qua ô liên hệ để cổng cảnh báo có tác dụng).
2. **Dấu hiệu nghi ngờ (mềm):** yêu cầu gửi CCCD/giấy tờ/ảnh trước khi phỏng vấn, lương quá cao so với mặt bằng, "việc nhẹ lương cao", đòi ứng tiền: tin vẫn đăng nhưng gắn nhãn "Cần cẩn trọng" cho người xem.
3. **Cổng cảnh báo an toàn:** SĐT/Zalo/địa chỉ chỉ trả về khi `POST /api/jobs/:id/contact {ack:true}` (xác nhận đã đọc cảnh báo), có giới hạn theo phiên và IP chống cào dữ liệu.
4. **Báo cáo:** mỗi phiên một báo cáo mỗi tin, một IP một báo cáo mỗi tin; **tự ẩn khi có ≥ 3 báo cáo từ 3 IP khác nhau** (bỏ qua báo cáo từ chính nhà tuyển dụng và từ IP đã dùng để đăng tin). Tin bị ẩn không tự hiện lại; Console (panel) bỏ ẩn hoặc xóa.
5. **Giới hạn:** tối đa 3 tin mới mỗi phiên mỗi ngày (tài khoản dưới 24 giờ: 2), 8 tin mỗi IP mỗi ngày, 10 tin đang mở mỗi nhà tuyển dụng, chặn tin trùng nội dung 7 ngày, 5 tài khoản nhà tuyển dụng mới mỗi IP mỗi ngày; gửi quan tâm: 1 lần mỗi tin mỗi phiên, 1 lần mỗi tin mỗi số điện thoại, 20 mỗi phiên mỗi ngày, 60 mỗi IP mỗi ngày, 200 tin chưa xử lý tối đa mỗi tin; thử mã khôi phục tối đa 10 lần mỗi IP mỗi giờ (và trần toàn cục).
6. **Cảnh báo cho người tìm việc** trên trang chi tiết và khi xác nhận: không đóng tiền/cọc, không đưa bản gốc giấy tờ, gặp ở nơi công cộng/đúng địa chỉ trên tin, báo ngay khi bị đòi tiền.

## Phân quyền và quyền riêng tư
- Phần nhà tuyển dụng: mọi truy vấn ràng `employer_id` của phiên; tin/ứng viên của người khác trả 404 (không phân biệt "không tồn tại"). Hộp thư ứng viên chứa tên, SĐT, lời nhắn: chỉ nhà tuyển dụng sở hữu tin đọc được; không có API công khai trả dữ liệu ứng viên; không có API liệt kê nhà tuyển dụng.
- Công khai: không trả `employer_id`, `created_ip`, SĐT, địa chỉ cụ thể. Tin ẩn/đóng quá lâu trả 404.
- CSRF: `X-Requested-With: 9hire` cho mọi ghi; kiểm tra `Origin`; CSP chặt (không script/style nội tuyến); mọi dữ liệu người dùng hiển thị bằng `textContent`.
- Dữ liệu ứng viên tự xóa 60 ngày sau khi tin hết hạn/đóng; nhà tuyển dụng xóa tin thì xóa cả hộp thư.
- API Console (`/admin-api/v1`, HMAC): manifest (`users`, `panels`), health, summary, users (nhà tuyển dụng, ẩn danh, **không SĐT ứng viên**), panel "Tin cần xem xét" (hành động Ẩn/Bỏ ẩn/Xóa). Không giữ tiền nên không có `money`.

## Tìm kiếm
Cột `search_key` (không dấu, thường, chỉ chữ số/chữ cái) chứa vị trí, tên quán, nhóm nghề, quận/huyện, mô tả; mỗi từ khóa là một điều kiện `LIKE` (AND). Lọc: thành phố, quận/huyện, loại, nhóm nghề, hình thức + mức lương tối thiểu, ca, bắt đầu ngay. Phân trang theo con trỏ `seq` (mới nhất trước). Báo tin mới: máy khách lưu bộ lọc + `seq` đã xem, thăm dò `GET /api/jobs/new?since=&filters` mỗi 60 giây khi app mở.

## Ghi chú pháp lý (CẦN KIỂM CHỨNG với luật sư/cơ quan có thẩm quyền, chưa phải tư vấn pháp lý)
- Hoạt động giới thiệu việc làm / dịch vụ việc làm: Bộ luật Lao động 2019 và Nghị định 145/2020/NĐ-CP quy định điều kiện của tổ chức dịch vụ việc làm; cần xác định nền tảng đăng tin do người dùng tự đăng có thuộc diện này không (cấp phép, cấm thu phí người lao động ở mức nào).
- Dữ liệu cá nhân: Nghị định 13/2023/NĐ-CP (bảo vệ dữ liệu cá nhân) và luật Bảo vệ dữ liệu cá nhân có hiệu lực 2026 (cần kiểm tra văn bản hiện hành): căn cứ xử lý, đồng ý, thông báo, thời hạn lưu, quyền xóa, đánh giá tác động nếu có. App lưu tên + SĐT ứng viên cho nhà tuyển dụng: đã giảm thiểu (hồ sơ ở thiết bị, tự xóa 60 ngày).
- Trách nhiệm nền tảng trung gian với nội dung người dùng đăng (Nghị định 147/2024/NĐ-CP về dịch vụ mạng xã hội/nội dung số, quy định thương mại điện tử): cơ chế báo cáo, gỡ tin, lưu nhật ký.
- Đơn vị hành chính thay đổi (bỏ cấp huyện từ 07/2025 theo mô hình hai cấp): trường quận/huyện là văn bản gợi ý, không ràng buộc danh mục chính thức; cần cập nhật.
- Điều khoản và quyền riêng tư trong app chỉ là bản ngắn, phải được rà soát trước khi công bố rộng.

## Kiểm thử bắt buộc
Phân quyền nhà tuyển dụng, IDOR hộp thư ứng viên và đổi trạng thái, cổng cảnh báo SĐT, giới hạn tốc độ và giới hạn nghiệp vụ (kể cả song song), bộ lọc lừa đảo (chặn + phủ định + chống viết lách), hết hạn tin, báo cáo tự ẩn (và chống lạm dụng), nhập xấu/XSS/CSRF, mã khôi phục, tìm kiếm không dấu, Console API. E2E trình duyệt 390x844 và desktop, ảnh ở `hire/shots/`, không lỗi console.
