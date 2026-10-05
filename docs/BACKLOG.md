# Backlog 9app.tech

Nguồn duy nhất cho việc cần làm. Cập nhật khi xong hoặc đổi quyết định. Chi tiết ý tưởng: `y-tuong-app-moi.md`. Quy trình: skill `.claude/skills/9app-orchestrator`.

Cập nhật: 2026-10-05. Trạng thái "đã lên server" lấy từ ghi chú 04/10, chưa kiểm lại trên server.

## Hiện trạng

- **Đã lên 9app.tech (tĩnh):** 9race, 9unit, 9english, 9license, 9scanner, Vạn Niên (văn khấn, mâm cúng), launcher có tìm kiếm chức năng.
- **Đã lên (Node + DB):** 9lunch, 9swap, 9hire, 9interview (AI tắt, chưa có khóa Gemini).
- **Có từ trước:** 9Ship (GHTK; Nhanh.vn tắt mặc định), 9app Console, 9speed, 9Fin, 9quy.
- **Đã code, chưa lên server:** 9family, 9tutor, 9id, Osin.
- **Khung có sẵn, chưa rõ mức hoàn thiện:** `car`, `fit`, `gift`, `payday`.

## A. Đang dở, cần chốt (ưu tiên cao nhất)

- [ ] **A1. Commit** ~220 thay đổi trên `feat/new-apps`, tách theo app (9family, tutor, 9id, osin, 9admin, license, speed, launcher...). Kiểm 9id, osin đã nằm trong git chưa.
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

## C. Đã thảo luận kỹ, chưa duyệt (phải brainstorm lại trước khi làm)

9ticket, 9bill, 9shop, 9voucher, 9fit, 9car, 9payday (đề xuất 04/10). Chưa thảo luận: 9chung.
Thứ tự theo API: bậc 1 affiliate (9shop, 9ticket giai đoạn đầu, 9voucher, 9rate); bậc 2 cần ký đối tác; bậc 3 rủi ro pháp lý cao. Mọi đối tác: xin sandbox và thử một giao dịch thật chi phí nhỏ trước khi mở bán.

## D. Kho ý tưởng

`y-tuong-app-moi.md` đợt 1 đến 15, mỗi ý 1 đến 2 câu, chưa phân tích. Nguyên tắc ít app: cùng ngữ cảnh thì gộp thành mô-đun. Đợt 15 gợi ý gom vào app Tiện ích.

## Đã quyết (không làm lại)

- Gộp: 9cafe→9lunch; 9growth, 9blood→9family; 9neighbor→9swap; 9charge→9car; 9vankhan, 9mamco, 9luckyday→Vạn Niên; 9driver→9Fin + 9car.
- Bỏ mô-đun phụ của 9family: 9pet, 9fridge, 9kid, 9recipe, 9remind.
- Tài khoản dùng chung qua 9id; trợ lý AI tên Osin (ngoại lệ tên không có số 9); tên app mới: một từ tiếng Anh sau số 9; mọi app là webapp/PWA.
