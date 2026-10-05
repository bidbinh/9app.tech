# 9gift - Sổ lễ

Webapp tĩnh PWA (ES module thuần, không bước build, không thư viện) của hệ 9app.tech, chạy tại `/gift/`.
Ghi mừng cưới, hiếu hỉ đã đi và đã nhận, tự tính sổ nợ lễ, nhắc sinh nhật, ngày giỗ theo âm lịch, gợi ý quà và lời chúc.

## Quyền riêng tư

- Dữ liệu (danh bạ người thân, số tiền phong bì, ghi chú, số điện thoại) **chỉ nằm trong IndexedDB của trình duyệt**. Không có máy chủ, không đăng nhập, không thống kê, không gửi đi đâu.
- CSP chặt: `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'`, không script hay style nội tuyến.
- Xuất/nhập JSON, xuất CSV, in/lưu PDF, xóa sạch ở `#/them/du-lieu`. Nhập JSON được làm sạch từng trường (kiểu, độ dài, ngày hợp lệ), bản ghi hỏng bị bỏ qua.
- Ghi nhanh bằng giọng nói dùng Web Speech API của trình duyệt (vi-VN): trình duyệt có thể gửi âm thanh tới dịch vụ của hãng. 9gift **không lưu câu nói**, chỉ chuyển kết quả phân tích sang biểu mẫu để người dùng soát rồi mới lưu.
- IndexedDB bị chặn (chế độ riêng tư) thì app vẫn chạy bằng bộ nhớ tạm và báo rõ trên đầu trang.

## Đồng bộ 9id (chừa chỗ, chưa làm)

Mỗi bản ghi (`people`, `entries`, `dates`, `gifts`) có `id` ổn định (UUID), `taoLuc`, `suaLuc` (ISO). Khi có 9id, đồng bộ là gộp theo `id` và `suaLuc` mới hơn thắng; hàm `nhap(obj, 'gop')` trong `js/lib/kho.js` đã làm đúng việc này cho tệp sao lưu. Dạng tệp sao lưu: `{app:'9gift', version:1, caiDat, people, entries, dates, gifts}`. Sẽ chỉ đồng bộ khi người dùng chủ động bật, mã hóa phía máy.

## Cấu trúc

```
index.html, manifest.webmanifest, sw.js, search-index.json
css/style.css            tông launcher: nền #f4f7fb, thẻ trắng bo 20px, nhấn #2563eb; tối xanh đen
js/boot.js               áp chữ lớn / sáng tối trước khi vẽ
js/app.js                bộ định tuyến hash, thanh dưới 5 mục
js/lib/lunar.js          sao chép từ unit/js/lib/lunar.js + bản sửa vòng lùi (ngày 0 ở 07/05/2054, 09/04/2062) từ vannien/mod/lunar.js; test quét 1950-2150
js/lib/text.js           SAO CHÉP từ unit/js/lib/text.js (bỏ dấu, đọc số thành chữ)
js/lib/ngay.js           ngày ISO, dương <-> âm, quy ước nhắc hằng năm
js/lib/nhac.js           lần kế tiếp của ngày dương/âm, dịp lễ, "sắp tới", tạo .ics
js/lib/le.js             loại sự kiện, sổ nợ lễ, thống kê, CSV
js/lib/cau.js            phân tích câu/giọng nói thành khoản lễ
js/lib/kho.js            IndexedDB + làm sạch dữ liệu nhập
js/data/                 dịp lễ, gợi ý quà, lời chúc (tự biên soạn)
js/screens/              saptoi, sole, danhba, quachuc, them
js/ui/                   dom, icons, nhapnhanh (mic), bieudo (SVG tự vẽ)
test/lib.test.js         node --test
scripts/e2e.js           kiểm thử trình duyệt thật (puppeteer-core), ảnh vào shots/
scripts/make-icons.js    PNG từ SVG;  scripts/make-search-index.mjs: sinh search-index.json
```

## Chạy và kiểm thử

```
node --test test/                 # đơn vị
node scripts/e2e.js               # trình duyệt thật, cổng ngẫu nhiên >= 24000, ảnh trong shots/
node scripts/make-search-index.mjs
```

Phục vụ tĩnh bằng bất kỳ máy chủ nào (`/gift/` là gốc). Đường dẫn trong app đều tương đối.

## Quy ước nhắc ngày (cần người am hiểu duyệt)

- Âm lịch: thuật toán Hồ Ngọc Đức, múi giờ UTC+7, hợp lệ 1900-2100.
- Sinh nhật/ngày giỗ ở **tháng nhuận** được nhắc theo **tháng thường cùng số** mỗi năm.
- **Ngày 30** âm gặp tháng thiếu (29 ngày) thì nhắc vào **ngày 29**.
- Dương 29/2 gặp năm không nhuận thì nhắc 28/2.
- Tuổi theo âm lịch = chênh lệch năm âm. "Giỗ đầu" là lần thứ 1 (một năm sau ngày mất); từ lần 2 gọi "giỗ lần thứ N". Cách đếm này có thể khác theo vùng.

## Nhắc ngày

Web app không tự báo khi đã đóng. Có ba lớp: thẻ **Sắp tới** khi mở app (kèm số đỏ trên mục Sắp tới và huy hiệu app nếu trình duyệt hỗ trợ), **tệp .ics** (`#/them/nhac`) với hai lời nhắc (VALARM) cho từng sự kiện để lịch điện thoại báo, và các nút đi tiếp (quà, lời chúc, văn khấn trên Vạn Niên).

## Mức đáp lễ

Chỉ là phép tính đơn giản (bằng số đã nhận, hoặc làm tròn lên 100.000 đ) và luôn ghi "tham khảo". Không có mức đúng. Sinh nhật, lì xì, lễ Tết mặc định không tính vào nợ lễ (đổi được ở từng khoản). Việc vui và tang lễ được ghép riêng. Nợ được ghép theo **số khoản, không theo số tiền** (một khoản đi đáp lại một khoản nhận của cùng người, cùng nhóm), và màn Nợ lễ ghi rõ điều này.

## Nội dung

Bộ gợi ý có 70 món quà (không link, không giá) và 175 lời chúc mẫu, 21 dịp, 3 giọng (trang trọng, thân mật, hài hước nhẹ). Dịp nhạy cảm (tang lễ, thăm bệnh, Vu Lan, Ngày của Mẹ/Cha, mừng thọ, 20/11) không có giọng đùa. "Kính chúc" chỉ dùng cho ông bà, cha mẹ, bậc trên và thầy cô; với sếp, đồng nghiệp, bạn bè, hoặc khi chưa chọn người nhận thì tự đổi thành "chúc". Các dịp không có lời phù hợp (Quốc khánh, Giỗ Tổ, Đoan Ngọ, Ông Công Ông Táo, Ngày Gia đình) không hiện nút Lời chúc/Quà.

## Cần người am hiểu duyệt

Những mục dưới đây được giữ nguyên như đang viết và cần người am hiểu văn hóa, tôn giáo, địa phương xem lại trước khi phát hành rộng:

- Quy ước nhắc: tháng nhuận nhắc theo tháng thường cùng số; ngày 30 gặp tháng thiếu nhắc ngày 29; dương 29/2 nhắc 28/2; "giỗ đầu" là lần 1, đếm năm theo năm âm.
- Lời chia buồn theo đạo Phật và Công giáo; chưa có bản cho Tin Lành, Cao Đài, Hòa Hảo và các tín ngưỡng khác.
- Tang lễ theo từng tôn giáo và vùng: màu phong bì phúng viếng, hoa viếng, cách đưa và ghi sổ phúng.
- Danh sách kiêng kỵ khi tặng quà (đồng hồ, khăn tay, giày dép, dao kéo, gương) là quan niệm dân gian, tùy gia đình.
- Cách nói "cài hoa hồng đỏ/trắng" mùa Vu Lan, lời Vu Lan cho người đã mất cha hoặc mẹ, câu "thọ như Nam Sơn, phúc như Đông Hải".
- Việc coi sinh nhật, lì xì, lễ Tết là không tính nợ lễ; số ngày nhắc trước và dịp lễ bật sẵn.
- Độ phù hợp của các lời chúc hài hước (cưới, em bé, Giáng sinh).
