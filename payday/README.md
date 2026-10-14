# 9payday

Trợ lý lương và dòng tiền cho người đi làm. Webapp tĩnh PWA thuần ES module, chạy ngoại tuyến tại `/payday/`, dữ liệu chỉ nằm trên máy người dùng.

## Tính năng

- **Lương**: Gross sang Net và Net sang Gross; bảo hiểm (BHXH, BHYT, BHTN, trần theo lương cơ sở và lương tối thiểu vùng I-IV); giảm trừ gia cảnh và người phụ thuộc; thuế TNCN luật mới (Luật 109/2025/QH15, biểu 5 bậc) và quy định cũ để so sánh; thưởng, làm thêm giờ, phụ cấp ăn trưa; từng bước kèm điều luật và nhãn mức xác minh.
- **Tiền**: lương net, khoản cố định, hũ (50-30-20, 4 hũ, 6 hũ, tùy chỉnh), ghi nhanh chi tiêu bằng một câu hoặc giọng nói vi-VN ("cà phê 45k"), dự báo cuối kỳ theo tốc độ chi, ngày lương tự lặp.
- **Mục tiêu và vay**: mục tiêu tiết kiệm theo hạn, máy tính vay (niên kim, gốc đều, lãi phẳng), so sánh trả nợ sớm, lãi kép.
- **Quyết toán thuế cuối năm**: ước tính hoàn hay nộp thêm, hạn nộp (có nguồn), checklist chứng từ.
- **Lịch và nhắc**: nhắc trong app và tệp `.ics` có `VALARM`.
- **Dữ liệu của tôi**: xuất, nhập JSON, xóa sạch.

Không phải tư vấn thuế hay tài chính. Quy định và mức xác minh: `docs/NGUON.md` (sinh từ `js/lib/nguon.js` bằng `node scripts/gen-nguon.mjs`).

## Cấu trúc

```
index.html  manifest.webmanifest  sw.js  search-index.json
css/style.css
js/app.js                 vỏ ứng dụng, định tuyến hash (#/, #/luong, #/tien, #/muctieu, #/them/...)
js/lib/tax.js             tính lương, thuế, bảo hiểm, quyết toán (thuần hàm)
js/lib/spend.js           đọc số tiền, ghi nhanh, hũ, dự báo
js/lib/voice-so.js        đọc số tiền tiếng Việt, SAO CHÉP từ unit/js/lib/voice.js (9unit)
js/lib/vay.js             vay, lãi kép (sao chép từ unit/js/lib/loan.js) + mục tiêu, trả nợ sớm
js/lib/text.js            chữ tiếng Việt (sao chép từ 9unit)
js/lib/ics.js lich.js dates.js ky.js nguon.js store.js
js/ui/  js/screens/       giao diện
test/                     node --test
scripts/e2e.js            e2e Chrome thật (puppeteer-core)
scripts/persona.js        3 người dùng giả lập đi trọn luồng
scripts/serve.js          máy chủ tĩnh thử nghiệm, cổng ngẫu nhiên từ 22000
```

## Chạy và kiểm thử

```
node scripts/serve.js        # in địa chỉ http://127.0.0.1:<cổng>/payday/
node --test test/            # kiểm thử đơn vị: lương, giọng nói tiền, dự báo, vay, ics, lưu trữ
node scripts/e2e.js          # e2e trình duyệt thật, ảnh vào shots/
node scripts/persona.js      # tự trải nghiệm 3 người dùng
node scripts/gen-search-index.mjs   # sinh lại search-index.json
```

`scripts/make-icons.js` dựng PNG icon từ `icons/icon.svg` và `icons/icon-maskable.svg`.

## Riêng tư và an toàn

- Dữ liệu trong IndexedDB (`9payday` / `kv` / khóa `state`), bọc try/catch; nếu bị chặn thì giữ tạm trong bộ nhớ và báo người dùng.
- CSP chặt: `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'`. Không gọi mạng ngoài. Không có mã phía máy chủ.
- Ghi nhanh chỉ lưu số tiền, danh mục, ngày, không lưu nguyên câu.
- Nhận giọng nói do trình duyệt (Web Speech API) thực hiện; Chrome có thể gửi âm thanh tới máy chủ của hãng. App nói rõ điều này.

## Đồng bộ qua tài khoản 9app

Tùy chọn, mặc định tắt: thẻ "Đồng bộ qua tài khoản 9app" ở màn Dữ liệu của tôi (cần đăng nhập 9id, có màn đồng ý rõ ràng). Đồng bộ nguyên khối `du_lieu` (lương, khoản chi, cố định, mục tiêu, vay, nhắc, quyết toán). Không đồng bộ: không có (mọi thứ trừ ảnh, app không có ảnh).. Gộp ba chiều theo bản ghi (`id`) ở máy, máy chủ chỉ lưu một tài liệu JSON có số phiên bản (`/id/api/sync/payday` của 9id). Tự đồng bộ khi mở app và khi quay lại tab. Thư viện `js/lib/nine-sync.js`, `nine-sync-ui.js` chép từ `9id/public/` (đừng sửa tại chỗ). Spec: `docs/superpowers/specs/2026-10-14-dong-bo-9id-design.md`. Cần thêm `payday` vào `SYNC_APPS` của 9id (mặc định đã có) và nginx phục vụ 9id cùng tên miền (`/id/`). Khoản chi không có dấu thời gian nên hai máy cùng sửa một khoản thì máy đang đồng bộ thắng. Chưa mã hóa đầu cuối.

## Triển khai

Chưa triển khai. Khi lên máy chủ, đặt thư mục này tại `/payday/` và thêm mục vào launcher (xem docs/y-tuong-app-moi.md). Mỗi lần phát hành đổi `CACHE_VERSION` trong `sw.js`.
