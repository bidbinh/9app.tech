# Backlog 9app.tech

Nguồn duy nhất cho việc cần làm. Cập nhật khi xong hoặc đổi quyết định. Chi tiết ý tưởng: `y-tuong-app-moi.md`. Quy trình: skill `.claude/skills/9app-orchestrator`.

Cập nhật: 2026-10-05. Trạng thái "đã lên server" lấy từ ghi chú 04/10, chưa kiểm lại trên server.

## Hiện trạng

- **Đã lên 9app.tech (tĩnh):** 9race, 9unit, 9english, 9license, 9scanner, Vạn Niên (văn khấn, mâm cúng), launcher có tìm kiếm chức năng.
- **Đã lên (Node + DB):** 9lunch, 9swap, 9hire, 9interview (AI tắt, chưa có khóa Gemini).
- **Có từ trước:** 9Ship (GHTK; Nhanh.vn tắt mặc định), 9app Console, 9speed, 9Fin, 9quy.
- **Đã code, đã vào `main`, chưa lên server:** 9family, 9tutor, 9id, Osin, 9ticket (giai đoạn 1).
- **Khung có sẵn, chưa rõ mức hoàn thiện:** `car`, `fit`, `gift`, `payday`.

## A. Đang dở, cần chốt (ưu tiên cao nhất)

- [x] **A1. Commit** xong 05/10/2026; đã push và merge vào `main` ngày 13/10/2026 qua PR #2 (a3ebd83). Ảnh chụp (`shots/`), `9app-site.tar`, bản sao lưu và `js/apps.js.local` được bỏ qua trong `.gitignore`.
- [x] **A2a. 9id đăng nhập chung, dự án 1 (14/10/2026)** — mã xong, đã kiểm: phiên 365 ngày/30 thiết bị, thông báo thiết bị mới, đổi số + hoàn tác 7 ngày, `/id/nine.js`, launcher (`launcher-ux2/`) hiện đăng nhập; chưa lên server. Spec/kế hoạch: `docs/superpowers/specs|plans/2026-10-14-9id-dang-nhap-chung-*`.
- [ ] **A2. 9id lên server:** role + DB trong `9ship-db`, nginx `/id/`, cổng OTP eSMS. Chốt câu hỏi mở mục 13 của spec (ngưỡng 2000 SMS/ngày, chi phí).
- [ ] **A3. 9family chuyển sang 9id** (có dữ liệu thật; sao lưu `/home/tms/backups-9app/family-20261004-1647.dump`). Làm theo `9family/docs/CUTOVER-9ID.md`: dry-run, thử trên bản sao, sao lưu trước. Bản xem thử công khai không dùng tên thật của con.
- [ ] **A4. Osin lên `osin.9app.tech`:** DNS + chứng chỉ, nginx, `apps.json` (`secret` + `receiptSecret`), `INTERNAL_KEYS` ở 9id, ô Osin ở launcher, gắn SDK vào từng app. Còn khóa Gemini, điều khoản dữ liệu, ý kiến luật sư.
- [ ] **A5. 9tutor:** phản biện độc lập, rồi mới lên server.
- [ ] **A6. Console đăng ký app mới** (qua giao diện hoặc `CONSOLE_APPS` + `CONSOLE_ALLOWED_HOSTS`).
- [ ] **A7. Khóa Gemini** cho 9interview và Osin.
- [ ] **A8. Tài nguyên server:** RAM trống ~1,5 GB, đĩa 88%. Kiểm trước mỗi lần deploy thêm; dọn đĩa.

## B. Đã duyệt, chưa làm

- [ ] 9family còn thiếu: nối 9Fin (tiền gia đình), Zalo OA (cần khóa), ghi thêm bằng Osin.
- [ ] Vạn Niên: mô-đun chọn ngày tốt (9luckyday); cần router theo đường dẫn từng mô-đun.
- [ ] 9car: gộp 9charge; bảo hiểm cần tư cách đại lý.
- [ ] Tiện ích: máy tính giọng nói trong 9unit; lịch sử tính toán, ghi vào 9Fin.
- [ ] 9Fin: chế độ gia đình, chế độ tài xế/shipper (gộp 9driver).
- [ ] Console: để app tự đăng ký chức năng vào launcher.
- [ ] Hạ tầng dùng chung: điểm thành viên + ví chung; bộ khung đối tác dùng chung (tách từ lõi 9Ship); bộ khung app mới; nhập tài khoản 9Ship vào 9id; chặn người mời ở 9id.

- [ ] **9ticket (duyệt 12/10/2026; giao diện giai đoạn 1 đã vào `main` 13/10).** Giai đoạn 1 là trợ lý chuyến đi, không giữ tiền, chưa cần đối tác. Vé bay qua Datacom Master API (đã gửi báo giá 12/10): gói 2.999.000 đ/tháng (240k tìm kiếm, 2.400 đặt giữ chỗ, 1.800 xuất vé) đến 79.999.000 đ/tháng; vượt gói: tìm 5 đ, giữ chỗ 500 đ, xuất vé 1.000 đ; dùng thử 45 ngày; trả ngay giảm 5%. Hãng: VNA, Vietjet, Bamboo, Vietravel + Amadeus/Sabre/Travelport. Trang công khai không nêu sandbox, URL, xác thực, webhook, thời gian giữ chỗ: phải hỏi Datacom. Tài liệu: https://datacom.vn/document/huong-dan-tich-hop-api
  - Giao diện giai đoạn 1 (Chuyến của tôi) đã xong trong `ticket/` (13/10/2026): chưa deploy, chưa đăng ký launcher/Console, trạng thái chuyến là dữ liệu mẫu. Nối Datacom ở `ticket/js/status.js` khi có sandbox.
  - [ ] 9ticket: tìm vé + đặt qua Datacom (cần sandbox, hợp đồng)
  - [ ] 9ticket: sân bay đi/đến, hành khách gia đình


- [ ] **9id dự án 2 trở đi: tích hợp từng app** theo nhóm đã duyệt (bắt buộc: 9family đã dùng, Osin đã dùng, 9stay, 9Ship; tùy chọn: 9lunch, 9swap, 9hire, 9interview, 9tutor, car, fit, gift, payday): mỗi app một spec + kế hoạch (nhóm tùy chọn cần điểm nhận dữ liệu ẩn danh `POST /<app>/api/account/claim`). Sau đó nhập tài khoản 9Ship/9Sport, và quyết định về 9log/Gia phả/9Sport (đang giữ đăng nhập riêng).
- [ ] **Quyết định: Life OS cũ ở thư mục gốc** (`index.html` cũ, `js/os.js`, `js/id.js` với băm `sdbm`, `localStorage`) chưa từng triển khai và không phải launcher đang chạy; xóa hay giữ?
- [ ] **Triển khai launcher v19 (đăng nhập 9id)** theo `launcher-ux2/DEPLOY.md`, sau khi 9id đã lên server.

## C. Đã thảo luận kỹ, chưa duyệt (phải brainstorm lại trước khi làm)

9bill, 9shop, 9voucher, 9fit, 9car, 9payday (đề xuất 04/10). Chưa thảo luận: 9chung.
Thứ tự theo API: bậc 1 affiliate (9shop, 9ticket giai đoạn đầu, 9voucher, 9rate); bậc 2 cần ký đối tác; bậc 3 rủi ro pháp lý cao. Mọi đối tác: xin sandbox và thử một giao dịch thật chi phí nhỏ trước khi mở bán.

## D. Kho ý tưởng

`y-tuong-app-moi.md` đợt 1 đến 15, mỗi ý 1 đến 2 câu, chưa phân tích. Nguyên tắc ít app: cùng ngữ cảnh thì gộp thành mô-đun. Đợt 15 gợi ý gom vào app Tiện ích.

## Đã quyết (không làm lại)

- Gộp: 9cafe→9lunch; 9growth, 9blood→9family; 9neighbor→9swap; 9charge→9car; 9vankhan, 9mamco, 9luckyday→Vạn Niên; 9driver→9Fin + 9car.
- Bỏ mô-đun phụ của 9family: 9pet, 9fridge, 9kid, 9recipe, 9remind.
- Tài khoản dùng chung qua 9id; trợ lý AI tên Osin (ngoại lệ tên không có số 9); tên app mới: một từ tiếng Anh sau số 9; mọi app là webapp/PWA.
