---
name: 9app-orchestrator
description: Điều phối phát triển các app trong 9app.tech (D:\9app.tech): nhận yêu cầu app/tính năng mới, xem backlog, thiết kế, xây, kiểm thử, deploy lên máy chủ. Dùng khi chủ sản phẩm nói về một app 9xxx, backlog, deploy, 9id, Osin, Console, launcher.
---

# Điều phối 9app.tech

## Bắt đầu mọi phiên
1. Đọc `docs/BACKLOG.md` (nguồn duy nhất cho việc cần làm) và memory của dự án. Báo cáo ngắn trạng thái liên quan tới yêu cầu.
2. Nếu yêu cầu là app trong danh sách ý tưởng: đọc `docs/y-tuong-app-moi.md` mục của app đó. Gợi ý trong đó chưa phải đã duyệt: brainstorm và thiết kế lại với chủ sản phẩm.
3. Khi xong hoặc đổi quyết định: cập nhật `docs/BACKLOG.md` ngay (tick, ngày, ghi chú) và memory nếu có thông tin mới không suy ra được từ mã.

## Quy ước sản phẩm
- Ít app: ý tưởng cùng ngữ cảnh thì gộp thành mô-đun, không mở app mới.
- Tên app mới: một từ tiếng Anh sau số 9 (9lunch). Ngoại lệ đã duyệt: Osin.
- Mọi app là webapp/PWA, giao diện tiếng Việt, mobile-first, sáng/tối, có nút `‹ 9app`.
- Tài khoản: dùng 9id (SĐT + mật khẩu). App chỉ tham chiếu `user_id`, `family_id`, `child_id` của 9id. Đăng ký/đăng nhập chuyển sang `/id/?next=...`.
- Mỗi app có máy chủ phải mở API quản trị chuẩn ký HMAC (`9admin/docs/ADMIN-API.md`) để cắm vào Console.
- Muốn Osin dùng được app: theo `osin/docs/OSIN-TOOL-PROTOCOL.md` và SDK `osin/sdk/osin-sdk.js`. Hành động ghi phải có xác nhận; công cụ nhạy cảm (tiền, xóa hàng loạt) Osin từ chối.
- Đối tác bên ngoài (API): xin sandbox, thử một giao dịch thật chi phí nhỏ trước khi mở bán (bài học Nhanh.vn). Không bán lại key, không giữ tiền ngoài khuôn khổ đã duyệt.

## Quy trình một app/tính năng mới
1. **Brainstorm + spec**: `docs/superpowers/specs/<ngày>-<app>-design.md` (mục tiêu, ngoài phạm vi, dữ liệu, quyền, bảo mật, rủi ro, câu hỏi mở). Dùng skill superpowers:brainstorming trước.
2. **Phản biện độc lập** bằng agent riêng cho spec và cho mã (bảo mật, dữ liệu trẻ em/sức khỏe/tiền, quyền, đua dữ liệu); sửa rồi ghi trạng thái từng mục vào spec.
3. **Xây** trong thư mục `<app>/`: `npm test` (PostgreSQL nhúng, node:test) và `npm run e2e` (Chrome thật, ảnh 390x844, 360x740, 1280x800, sáng/tối) phải chạy sạch. Test trước khi viết (superpowers:test-driven-development).
4. **Kiểm chứng** trước khi báo xong (superpowers:verification-before-completion): chạy lệnh, đọc kết quả, không đoán.
5. **Commit** nhỏ theo app; không commit khóa, `.env`, dữ liệu thật.
6. **Deploy** theo checklist dưới, chỉ khi chủ sản phẩm cho phép và chắc chắn.

## Checklist deploy (máy chủ dùng chung, tài nguyên hạn chế)
Trước: kiểm RAM (~1,5 GB trống) và đĩa (88%); luôn tải bản server của launcher về trước khi sửa (repo gốc lệch server).

- **App tĩnh**: chép vào `/home/tms/ops/certbot/www/9app/<tên>/`; sao lưu `.bak-<tên>-<giờ>` trước khi ghi; kiểm sha256 từng tệp. Homebar.js trên server khác repo: CSP có hash thì thêm hash của bản server.
- **App Node + DB**: `/home/tms/9<tên>/`; tạo role + DB trong container `9ship-db`; `.env` sinh mật khẩu ngẫu nhiên ngay trên server (không in ra); `docker compose -f docker-compose.server.yml up -d --build`; khối nginx trong `/home/tms/ops/nginx/includes/9app.gates.inc` (`X-Forwarded-For=$remote_addr`, chặn `/<tên>/admin-api/`); `nginx -t` rồi reload.
- **Launcher**: thêm khối vào `js/apps.js` trên server (kèm `index` tìm kiếm), tăng `?v=` trong `index.html`, bỏ ô khỏi "Sắp ra mắt".
- **Console**: đăng ký app (giao diện hoặc `CONSOLE_APPS` + `CONSOLE_ALLOWED_HOSTS`).
- **Sau deploy**: thử trên URL thật (tạo dữ liệu thử rồi xóa), xem log container, cập nhật BACKLOG + memory.
- **Có dữ liệu thật** (hiện: 9family): sao lưu `pg_dump -Fc` trước; migration phải có kiểm chứng và thử trên bản sao trước.

## Không làm khi chưa được phép
Deploy, ghi lên máy chủ, gửi tin ra ngoài, xóa/ghi đè dữ liệu thật, đổi quyết định đã chốt (mục "Đã quyết" trong BACKLOG).
