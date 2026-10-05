# Xem trước ở địa chỉ riêng (không ảnh hưởng trang chính)

Bản xem thử dùng tên tệp riêng, nằm cạnh tệp production, và nạp lại `js/apps.js`, `js/search.js`, `icons/`, `search/` đang chạy của production. Trang chính `index.html` không bị đụng. Xem thử dùng chung localStorage với trang chính (cùng nguồn gốc 9app.tech), nên thấy đúng ghim, ẩn, lượt dùng thật; chỉ thêm khóa `9app.ui`.

## Tệp (sinh sẵn trong `preview/`)

| Tệp | Chép tới (máy chủ) |
|---|---|
| `preview/home2.html` | `/home/tms/ops/certbot/www/9app/home2.html` |
| `preview/css/home2.css` | `/home/tms/ops/certbot/www/9app/css/home2.css` |
| `preview/js/home2.js` | `/home/tms/ops/certbot/www/9app/js/home2.js` |

Địa chỉ xem: `https://9app.tech/home2.html` (có `noindex`).

## Lệnh

Sinh lại gói từ bản đang sửa (tùy chọn):
```
cd D:/9app.tech/launcher-ux
node tools/make-preview.mjs
```
Chép (chỉ thêm 3 tệp mới, không ghi đè tệp có sẵn):
```
S=/home/tms/ops/certbot/www/9app
scp -i ~/.ssh/9log_deploy preview/home2.html root@103.176.20.95:$S/home2.html
scp -i ~/.ssh/9log_deploy preview/css/home2.css root@103.176.20.95:$S/css/home2.css
scp -i ~/.ssh/9log_deploy preview/js/home2.js root@103.176.20.95:$S/js/home2.js
```
Gỡ bản xem thử:
```
ssh -i ~/.ssh/9log_deploy root@103.176.20.95 "rm -f $S/home2.html $S/css/home2.css $S/js/home2.js"
```
Kiểm `curl -I https://9app.tech/home2.html` trả 200 (nếu nginx chặn tệp lạ ở gốc thì báo lại). Khi sửa tiếp, chạy lại `make-preview.mjs`, chép lại, tải lại bằng "làm mới cứng" (hoặc tăng `?v=` trong `make-preview.mjs`).

## Xem cục bộ

```
cd D:/9app.tech/launcher-ux
node -e "import('./tools/serve.mjs').then(m=>m.startServer(12345).then(()=>console.log('http://127.0.0.1:12345/index.html')))"
```
Bản gốc để so: `http://127.0.0.1:12345/orig/index.html`.

## Kiểm thử tự động

```
node tools/test.mjs       # 5 cỡ màn x 3 kịch bản + thao tác (cần puppeteer-core, Chrome)
node tools/shots.mjs      # chụp ảnh vào shots/after/ (SCHEME=dark để chụp chế độ tối)
node tools/metrics.mjs    # đo chiều cao, vị trí app đầu
```
