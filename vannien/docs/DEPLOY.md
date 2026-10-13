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

## Giao diện (tông sáng 9app)

- Màu, chữ, thẻ của cả Vạn Niên và mô-đun nằm ở `D:\Lịch vạn niên\src\index.css` (biến `--bg`, `--card`, `--brand`, `--good-*`, `--bad-*`; chế độ tối theo hệ thống). `mod\mod.css` chỉ dùng lại các biến đó, nên sửa màu thì sửa ở `index.css`.
- Thanh điều hướng 5 mục: Hôm nay, Tháng, Xem ngày, Cúng lễ, Phong thủy. Mục Cúng lễ do bản dựng vẽ sẵn (liên kết `#/van-khan`); trong màn có hai thẻ con Văn khấn | Mâm cúng do `mod\app.js` dựng. Mọi đường dẫn hash cũ giữ nguyên nên `search-index.json` không đổi.
- Màn Hôm nay có thẻ Cúng lễ (lối tắt Văn khấn, Mâm cúng và Sắp tới) tính trong bản dựng (`src\lib\cungle.js`; id bài khấn và mâm phải khớp `mod\data`). Đổi id trong `mod\data` thì phải sửa `cungle.js`.
- `node scripts/ux-check.mjs`: tràn ngang, vùng chạm, cỡ chữ, tương phản, nhãn thanh dưới, deep link ở 320/360/390/430/1280, sáng và tối. `node scripts/ux-shots.mjs <tiền tố>`: chụp ảnh vào `shots\ux\`.
- `tools\pack-vannien.mjs` chạy `npm run build` qua shell trên Windows (Node mới không cho chạy `npm.cmd` trực tiếp).
- Tên tệp trong `assets\` có mã băm, đổi sau mỗi lần build: chép cả thư mục `assets\` mới và xóa tệp cũ trên server.
