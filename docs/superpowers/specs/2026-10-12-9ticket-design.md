# 9ticket: thiết kế giai đoạn 1 (Chuyến của tôi)

Ngày: 2026-10-12. Trạng thái: chờ chủ sản phẩm duyệt spec. Bối cảnh và rủi ro đối tác: `../../y-tuong-app-moi.md` mục 9ticket.

## 1. Mục tiêu

Trợ lý chuyến đi cho vé bay, tàu, xe khách: gom mọi chuyến của một người vào một chỗ, nhắc giờ, giữ thông tin dùng được khi không có mạng, chia tiền nhóm. **Không bán vé, không giữ tiền, không cần đăng nhập.** Làm giao diện trước; nguồn dữ liệu thật (Datacom cho vé bay, các nguồn khác sau) nối ở đợt sau mà không phải sửa giao diện.

Chủ sản phẩm đã chọn: giao diện trước, API sau; chỉ màn "Chuyến của tôi" (không làm tìm vé, sân bay đi/đến, hành khách gia đình trong đợt này); webapp tĩnh lưu trên máy.

## 2. Ngoài phạm vi (đợt này)

Tìm và đặt vé, thanh toán, xuất vé; tài khoản 9id và đồng bộ nhiều máy; thông báo đẩy; chụp ảnh vé (OCR); trang sân bay đi/đến; hồ sơ hành khách gia đình; kết nối Datacom/Vexere/VNR; deploy lên server.

## 3. Kiến trúc

Webapp tĩnh PWA như 9race, thư mục `ticket/`: HTML, CSS, JS thuần (không export/ES module phức tạp cần bundler; dùng `type="module"` như 9race), CSP chặt (`default-src 'none'`, script/style `'self'`), service worker cho ngoại tuyến, sáng/tối theo hệ thống, mobile-first, nút `‹ 9app`.

```
ticket/
  index.html  manifest.webmanifest  sw.js  package.json
  css/style.css
  js/app.js        định tuyến hash, nạp dữ liệu, vẽ màn
  js/model.js      kiểu Chuyến, kiểm tra hợp lệ, sắp xếp
  js/store.js      lưu trên máy (localStorage, bọc try/catch), nhập/xuất JSON
  js/parse.js      đọc mã đặt chỗ / nội dung email-SMS vé thành Chuyến
  js/airport.js    tính mốc "nên ra bến lúc ..."
  js/split.js      chia tiền nhóm
  js/ics.js        xuất .ics
  js/status.js     NGUỒN TRẠNG THÁI CHUYẾN (giao diện cắm được): mẫu bây giờ, Datacom sau
  data/stations.json  sân bay, ga, bến xe phổ biến (tên, mã, tỉnh)
  data/sample.json    chuyến mẫu
  tests/ scripts/e2e.mjs
```

Ranh giới: `status.js` là điểm duy nhất sau này đổi sang API thật (`getStatus(trip) -> {state, delayMin, gate, terminal, updatedAt, source}`); phần còn lại không biết nguồn.

## 4. Dữ liệu

Chuyến (`trip`): `id`, `mode` (`bay`|`tau`|`xe`), `operator` (hãng/nhà xe), `code` (số hiệu: VN123, SE1), `from`/`to` (mã + tên), `departAt`/`arriveAt` (ISO có múi giờ), `pnr` (mã đặt chỗ, tùy chọn), `passengers[]` (tên, ghế, hành lý), `gate`, `terminal`, `note`, `payments[]` cho chia tiền (người trả, số tiền, người dùng chung). Mọi trường người dùng nhập chỉ hiển thị bằng `textContent`. Dữ liệu ở `localStorage`; hỏng hoặc thiếu thì app vẫn chạy với danh sách rỗng; có nút xuất/nhập JSON làm sao lưu.

Dữ liệu nhạy cảm (tên, mã đặt chỗ, số giấy tờ nếu có): chỉ nằm trên máy, không gửi đi đâu, không ghi log. Không thu số CCCD/hộ chiếu trong đợt này.

## 5. Màn hình

- **Chuyến** (`#/`): hai nhóm "Sắp tới" và "Đã đi". Thẻ: loại (bay/tàu/xe), tuyến, giờ đi-đến, đếm ngược, nhãn trạng thái (đúng giờ / trễ / hủy / chưa có thông tin), số hiệu. Trạng thái trống có hướng dẫn thêm chuyến đầu tiên và nút xem chuyến mẫu.
- **Chi tiết** (`#/trip/<id>`): thông tin đầy đủ, mốc "nên ra sân bay/ga/bến lúc ..." (bay: trước 2 giờ nội địa, 3 giờ quốc tế; tàu: 45 phút; xe: 30 phút; chỉnh được), nút thêm vào lịch (.ics), chế độ vé ngoại tuyến (chữ lớn, mã đặt chỗ, ghế), chia tiền nhóm, sửa, xóa (có xác nhận), dòng "Cập nhật lúc ..., nguồn: ...".
- **Thêm chuyến** (`#/add`): ba cách: nhập mã đặt chỗ + hãng + ngày; dán nội dung email/SMS vé (`parse.js` đọc hãng, số hiệu, tuyến, giờ, ghế, mã; hiện kết quả để soát lại trước khi lưu, không tự lưu); nhập tay.
- **Về app** (`#/about`): giai đoạn 1 không bán vé; nơi đặt vé chính thức (liên kết thẳng sang dsvn.vn, vetau.com.vn, Vexere, hãng bay; chưa dùng affiliate); xuất/nhập dữ liệu; nói rõ trạng thái chuyến hiện là dữ liệu mẫu.

## 6. Xử lý lỗi và an toàn

Giờ luôn lưu kèm múi giờ và hiển thị theo giờ địa phương của sân bay/ga. Mã dán vào không phân tích được thì báo rõ và chuyển sang nhập tay, không đoán. Không có nguồn trạng thái thì hiển thị "chưa có thông tin", không bịa "đúng giờ". Mọi nội dung người dùng nhập dùng `textContent`; CSP không cho script/style nội tuyến; không gọi mạng ngoài. `localStorage` lỗi/chặn thì dùng bộ nhớ tạm và báo "dữ liệu sẽ mất khi đóng".

## 7. Kiểm thử

`npm test` (node:test): `parse` (mẫu email/SMS các hãng, trường hợp xấu), `airport` (mốc, qua đêm, múi giờ), `split` (làm tròn đồng, tổng khớp), `ics` (định dạng, thoát ký tự), `store` (hỏng dữ liệu, nhập/xuất), `model` (kiểm tra hợp lệ). `npm run e2e` (Chrome thật, puppeteer-core): thêm chuyến ba cách, xem chi tiết, chia tiền, xóa, ngoại tuyến sau khi nạp service worker; ảnh 390x844, 360x740, 1280x800, sáng/tối.

## 8. Về sau (không làm lần này)

Datacom Master API cho vé bay (báo giá và phạm vi đã ghi trong BACKLOG; sandbox, xác thực, webhook, thời gian giữ chỗ chưa biết, phải hỏi Datacom) qua `status.js` rồi mô-đun tìm/đặt; vé xe qua Vexere; vé tàu qua đại lý VNR; đồng bộ qua 9id; chụp ảnh vé dùng OCR của 9scanner; sân bay đi/đến; hành khách gia đình; đăng ký trong launcher và Console khi lên server.

## 9. Câu hỏi mở

1. Mốc ra sân bay/ga/bến ở mục 5 là giá trị mặc định đề xuất, chưa kiểm chứng với quy định từng hãng.
2. Danh sách hãng và định dạng email/SMS vé cần mẫu thật để `parse.js` đọc đúng; bản đầu chỉ chạy tốt với mẫu tự dựng, cần bạn cung cấp vài vé thật (đã che thông tin cá nhân).
