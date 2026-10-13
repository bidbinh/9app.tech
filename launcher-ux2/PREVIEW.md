# Xem trước ở địa chỉ riêng (không ảnh hưởng trang chính)

Gói trong `preview/`, dùng tên tệp riêng (`home3`), nạp lại `js/apps.js`, `js/search.js`, `icons/`, `search/` đang chạy của production. Trang chính `index.html` không bị đụng. Dùng chung localStorage với trang chính nên thấy đúng ghim, ẩn, lượt dùng thật.

| Tệp | Chép tới (máy chủ) |
|---|---|
| `preview/home3.html` | `/home/tms/ops/certbot/www/9app/home3.html` |
| `preview/css/home3.css` | `.../css/home3.css` |
| `preview/js/home3.js` | `.../js/home3.js` |
| `preview/js/home3-config.js` | `.../js/home3-config.js` |
| `preview/icons/soon-osin.svg` | `.../icons/soon-osin.svg` (tệp mới, chưa có trên production) |

```
cd D:/9app.tech/launcher-ux2
node tools/make-preview.mjs        # sinh lại gói từ bản đang sửa
S=/home/tms/ops/certbot/www/9app ; K="-i ~/.ssh/9log_deploy"
scp $K preview/home3.html root@<MAY-CHU>:$S/home3.html
scp $K preview/css/home3.css root@<MAY-CHU>:$S/css/home3.css
scp $K preview/js/home3.js preview/js/home3-config.js root@<MAY-CHU>:$S/js/
scp $K preview/icons/soon-osin.svg root@<MAY-CHU>:$S/icons/soon-osin.svg
```
Xem: `https://9app.tech/home3.html` (có `noindex`). Gỡ:
```
ssh $K root@<MAY-CHU> "rm -f $S/home3.html $S/css/home3.css $S/js/home3.js $S/js/home3-config.js $S/icons/soon-osin.svg"
```
Chỉ thêm tệp mới, không ghi đè tệp sẵn có. Nếu nginx chặn tệp lạ ở gốc thì báo lại.

Xem cục bộ: `node -e "import('./tools/serve.mjs').then(m=>m.startServer(15432).then(()=>console.log('http://127.0.0.1:15432/index.html')))"` (bản gốc: `/orig/index.html`).
Kiểm tự động: `node tools/test.mjs` (cần puppeteer-core và Chrome). Ảnh: `node tools/shots.mjs`.
Lưu ý: `tools/serve.mjs` trả một chỉ mục Vạn Niên GIẢ (một mục "Văn khấn") để thử đường tìm kiếm; trên máy chủ dùng tệp thật.
