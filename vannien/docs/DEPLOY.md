# Triển khai và bảo trì mô-đun Văn khấn, Mâm cúng

## Chỉ chép lên server

- `index.html`
- `404.html`
- `search-index.json`
- `mod\` (cả `mod\data\*.json`)
- Các tệp của bản dựng Vạn Niên: `assets\`, `favicon.svg`, `manifest.webmanifest`, `.nojekyll`

KHÔNG chép: `shots\` (khoảng 17 MB ảnh chụp), `test\`, `scripts\`, `docs\`, `package.json`.

## Đóng gói lại Vạn Niên (tools\pack-vannien.mjs)

`npm run pack:vannien` build lại từ `D:\Lịch vạn niên`. Script chỉ xóa và thay các tệp của bản dựng (`assets`, `index.html`, `404.html`, `favicon.svg`, `manifest.webmanifest`, `.nojekyll`). Mọi thứ còn lại trong `vannien\` (mod, search-index.json, scripts, test, docs, shots, package.json) được giữ nguyên. Sau khi build, script chèn lại hai thẻ `<link>` và `<script>` của mô-đun vào `index.html` và `404.html` (chạy lại nhiều lần vẫn ra cùng kết quả), dùng số phiên bản đọc từ `mod\app.js`.

Xem trước, không build, không ghi gì: `node tools/pack-vannien.mjs --dry-run`.

## Chống bộ nhớ đệm

Sau MỖI lần sửa bất kỳ tệp trong `mod\` (kể cả JSON dữ liệu), chạy:

```
node scripts/bump-version.mjs
node scripts/build-search-index.mjs     # nếu đổi danh sách bài khấn, mâm cúng
node --test test/
```

`bump-version` ghi cùng một `?v=N` vào mọi câu import trong `mod\*.js`, hằng `VERSION` (dùng khi tải JSON) và hai thẻ trong `index.html`, `404.html`. Test kiểm tra các số này luôn khớp nhau.

## Kiểm thử

- `node --test test/` kiểm tra logic, dữ liệu, chỉ mục, pack.
- `node scripts/e2e.mjs` mở Chrome thật ở 390x844 và 1280x800, so với bản sao lưu `vannien.bak-*`, chụp ảnh vào `shots\`.
