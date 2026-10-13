# 9scanner

Webapp tĩnh PWA (không build). Mọi xử lý ảnh và tệp chạy trên máy người dùng, không gửi gì lên máy chủ.

## Tính năng
- Chụp / chọn ảnh, tự dò khung tài liệu (mặt nạ màu + dò cạnh Hough + tinh chỉnh từng cạnh), nắn phối cảnh, tự xoay đúng chiều chữ.
- Bộ lọc: Màu tự động, Ảnh rõ nét, Trắng đen tài liệu (ngưỡng cục bộ), Khử bóng, Gốc, Xám (+ Nền trắng, Đen trắng cũ).
- Camera: viền xanh nhận khung trực tiếp, "Tự chụp" khi giữ yên máy, "Chụp liên tục".
- Xuất: PDF (A4/giữ tỉ lệ, giới hạn dung lượng, lớp chữ OCR), ảnh JPG, **Word (.docx)**, **Excel (.xlsx)** (có màn sửa bảng), văn bản.
- **Công cụ chuyển đổi**: ảnh sang PDF, PDF sang ảnh JPG, PDF sang Word, PDF sang Excel, gộp PDF, sắp xếp/xóa/xoay/tách trang, nén PDF, đóng dấu chữ, đặt mật khẩu (AES-128).
- Chữ ký tay, ảnh thẻ 3x4 / 4x6.
- **Không hỗ trợ**: Word sang PDF (trình duyệt không có bộ dựng Word; giao diện ghi rõ).

## Mã nguồn chính (js/)
| Tệp | Việc |
|---|---|
| edges.js, lines.js | dò khung tài liệu (mặt nạ + Hough + tinh chỉnh cạnh) |
| filters.js | bộ lọc, ước lượng nền, làm nét, ngưỡng cục bộ |
| orient.js | dò chữ ngang/dọc; chiều trên/dưới do OCR so sánh (export.js `ocrCanvasSmart`, `autoOrientPage`) |
| ocrprep.js | xóa đường kẻ bảng trước OCR, trả vị trí đường kẻ |
| layout.js | từ OCR sang dòng, đoạn, tiêu đề, bảng (lưới theo đường kẻ hoặc theo khoảng trắng), cột chữ |
| docx.js, xlsx.js, zip.js | ghi Word, Excel, ZIP bằng OOXML tự viết |
| pdf.js | ghi PDF (ảnh + lớp chữ); pdftools.js + pdfcrypt.js: gộp/tách/nén/đóng dấu/mật khẩu (pdf-lib, MD5/RC4 tự viết) |
| pdfjs.js | cầu nối pdf.js: dựng trang, lấy chữ có tọa độ |
| tools.js | màn Công cụ chuyển đổi và quản lý trang PDF |
| stable.js, livecam.js | tự chụp: theo dõi độ ổn định khung, vẽ viền trên camera |

## Chép lên server
Chỉ chép các mục trong `deploy-files.txt` (index.html, manifest.webmanifest, sw.js, css/, js/, icons/, vendor/).
Không chép `tests/`, `scripts/`, `shots/` (ảnh chụp e2e, nhiều MB), `package.json`.

## Thư viện bên thứ ba (vendor/, ~12 MB; nạp lười)
- `vendor/tesseract` (Apache-2.0) — OCR tiếng Việt, ~9 MB, tải khi đọc chữ lần đầu.
- `vendor/pdfjs` (Apache-2.0) — pdf.js 5.6.205 bản legacy + wasm JBIG2/JPEG2000, ~2,3 MB, tải khi mở công cụ PDF/dựng PDF. Đổi đuôi `.mjs` thành `.js` nên không phụ thuộc cấu hình MIME `.mjs` của nginx.
- `vendor/pdflib` (MIT) — pdf-lib 1.17.1, ~0,5 MB, tải khi dùng gộp/tách/nén/đóng dấu/mật khẩu.
Mỗi thư mục có `NGUON-GOC.txt` và tệp giấy phép đầy đủ.

## Cấu hình nginx
```
location ^~ /scanner/ {
    try_files $uri $uri/ =404;          # KHÔNG fallback về index.html: service worker sẽ cache nhầm HTML cho tệp .js/.css thiếu
    add_header Cache-Control "no-cache"; # luôn xác thực lại; sw.js cũng đặt fetch cache:'no-cache'
}
```
- `vendor/tesseract/vie.traineddata.gz` là tệp .gz thô: không thêm `Content-Encoding: gzip`.
- `*.wasm.js` và `vendor/pdfjs/*.js` phải có MIME javascript; `vendor/pdfjs/wasm/*.wasm` kiểu `application/wasm`.
- CSP trong index.html: không script nội tuyến; có hash cho thẻ `<style>` mà `/js/homebar.js` tự chèn (đổi CSS đó thì phải cập nhật hash). pdf.js chạy worker module từ chính origin (`worker-src 'self' blob:`).

## Kiểm thử
- `npm test` (node:test): hình học, dò cạnh, bộ lọc, nén, PDF, ZIP/DOCX/XLSX (giải nén, kiểm cấu trúc, đọc lại nội dung), layout, gộp/tách/xoay/đóng dấu/mật khẩu PDF (mở lại bằng pdf.js), hướng chữ, tự chụp.
- `npm run e2e`: `scripts/e2e.js` (luồng quét, xuất, OCR, ngoại tuyến...) rồi `scripts/e2e-office.js` (Word/Excel, công cụ PDF, tự chụp, tự xoay, kiểm cỡ chữ ≥14px / vùng chạm ≥44px / không tràn ngang). Chrome headless qua puppeteer-core, cổng ngẫu nhiên từ 9400.
- `node scripts/lab.js [--ocr] [--scene=ten]`: phòng thí nghiệm chất lượng ảnh (ảnh chụp giả lập: bàn gỗ/trắng/tối, bóng tay, ngược, ngang...), đo sai số góc, độ đều nền, CER OCR; xuất contact sheet ở `shots/lab/`.

## Ghi chú
- Giới hạn dung lượng: KB = 1024 byte, MB = 1024 x 1024 byte; mục tiêu nén 97% giới hạn (áp dụng cho PDF và JPG).
- Lớp chữ OCR trong PDF dùng chuỗi hex nên ký tự `\`, `(`, `)` không cần escape.
- `vendor/tesseract/worker.min.js` có một chỉnh sửa nhỏ (xem `NGUON-GOC.txt`).
- Mật khẩu PDF chỉ nhận ASCII in được (tối đa 32 ký tự) để mọi trình đọc PDF mở được (đặc tả R4 dùng PDFDocEncoding).
- Excel: số kiểu Việt (1.234.567; 3,5) thành số; mã có số 0 đầu hoặc dài hơn 9 chữ số (điện thoại, CCCD) giữ nguyên chuỗi.
