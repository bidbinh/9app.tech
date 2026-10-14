# 9draw

Vẽ tay nhanh, lưu ảnh PNG, chia sẻ lên mạng xã hội. App tĩnh (PWA), không máy chủ, không cần đăng nhập; bản vẽ tự lưu trong trình duyệt.

- Công cụ: bút, bút dạ (mờ), tẩy; 11 màu + chọn màu tự do; cỡ nét riêng từng công cụ.
- Giấy: 4:5, vuông, 9:16, 16:9; nền trắng, giấy ngà, ô vuông, dòng kẻ, bảng đen. Đổi khổ không mất nét.
- Hoàn tác/làm lại không giới hạn (xóa hết cũng hoàn tác được). Phím: Ctrl+Z, Ctrl+Shift+Z, B/H/E, 0.
- Hai ngón (hoặc con lăn, chuột phải/giữa) để phóng to và di chuyển. Có bút cảm ứng thì ngón tay chỉ di chuyển (chống tì tay).
- Xuất: ảnh PNG rộng 1080 px, có nền đặc; Chia sẻ qua hộp chia sẻ của máy (Web Share, kèm tệp), nếu không có thì tải về; Sao chép ảnh.

Mã: `js/lib/engine.js` (nét vector, dựng lại, kiểm tra dữ liệu), `js/app.js` (giao diện, con trỏ, xuất).
Kiểm thử: `npm test`; `npm run e2e` (cần puppeteer-core, Chrome; đặt `PUPPETEER_CORE` nếu khác đường dẫn mặc định). Ảnh ở `shots/`.
