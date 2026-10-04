# 9scanner

Webapp tĩnh PWA (không build). Mọi xử lý ảnh chạy trên máy người dùng.

## Chép lên server
Chỉ chép các mục trong `deploy-files.txt` (index.html, manifest.webmanifest, sw.js, css/, js/, icons/, vendor/).
Không chép `tests/`, `scripts/`, `shots/` (ảnh chụp e2e, có cả tệp camera giả nhiều MB), `package.json`.

## Cấu hình nginx
```
location ^~ /scanner/ {
    try_files $uri $uri/ =404;          # KHÔNG fallback về index.html: service worker sẽ cache nhầm HTML cho tệp .js/.css thiếu
    add_header Cache-Control "no-cache"; # luôn xác thực lại; sw.js cũng đặt fetch cache:'no-cache'
}
```
- `vendor/tesseract/vie.traineddata.gz` là tệp .gz thô: không thêm `Content-Encoding: gzip`.
- `*.wasm.js` phải có MIME javascript.
- CSP trong index.html có hash cho thẻ `<style>` mà `/js/homebar.js` tự chèn; đổi CSS đó thì phải cập nhật hash.

## Kiểm thử
`npm test` (node:test), `npm run e2e` (Chrome headless qua puppeteer-core, cổng ngẫu nhiên từ 9400).

## Ghi chú
- Giới hạn dung lượng: KB = 1024 byte, MB = 1024 x 1024 byte; mục tiêu nén 97% giới hạn.
- Lớp chữ OCR trong PDF dùng chuỗi hex nên ký tự `\`, `(`, `)` không cần escape.
- `vendor/tesseract/worker.min.js` có một chỉnh sửa nhỏ (xem `NGUON-GOC.txt`).
