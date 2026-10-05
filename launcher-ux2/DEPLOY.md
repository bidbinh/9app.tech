# Thay thế chính thức trang chủ launcher (làm sau khi đã xem home3.html và đồng ý)

Đổi 3 tệp, thêm 2 tệp. `js/apps.js`, `js/search.js`, `js/homebar.js`, `search/`, manifest giữ nguyên.

| Tệp (trong `launcher-ux2/`) | Máy chủ | Loại |
|---|---|---|
| `index.html` (css `?v=18`, launcher `?v=18`, thêm `home-config.js?v=1`) | `$S/index.html` | thay |
| `css/style.css` | `$S/css/style.css` | thay |
| `js/launcher.js` | `$S/js/launcher.js` | thay |
| `js/home-config.js` | `$S/js/home-config.js` | MỚI |
| `icons/soon-osin.svg` | `$S/icons/soon-osin.svg` | MỚI |

## 0. Kiểm trước khi chép: so md5 với bản đã sao (`orig/`)
```
cd D:/9app.tech/launcher-ux2
node tools/test.mjs      # phải in "TAT CA DAT"
S=/home/tms/ops/certbot/www/9app ; K="-i ~/.ssh/9log_deploy"
ssh $K root@103.176.20.95 "cd $S && md5sum index.html css/style.css js/launcher.js js/apps.js js/search.js"
md5sum orig/index.html orig/css/style.css orig/js/launcher.js orig/js/apps.js orig/js/search.js
```
Từng cặp phải khớp. Nếu lệch, máy chủ đã đổi sau khi sao: KHÔNG ghi đè, tải bản mới về `orig/` và gộp trước.

## 1. Sao lưu
```
ssh $K root@103.176.20.95 "cd $S && cp -a index.html index.html.bak-ux2 && cp -a css/style.css css/style.css.bak-ux2 && cp -a js/launcher.js js/launcher.js.bak-ux2"
```
## 2. Chép (tệp phụ trước, index.html sau cùng)
```
scp $K icons/soon-osin.svg root@103.176.20.95:$S/icons/
scp $K js/home-config.js js/launcher.js root@103.176.20.95:$S/js/
scp $K css/style.css root@103.176.20.95:$S/css/
scp $K index.html root@103.176.20.95:$S/
```
## 3. Kiểm sau
Mở `https://9app.tech/` bằng cửa sổ ẩn danh (người mới) và trình duyệt có dữ liệu cũ (người cũ): ghim/ẩn/lượt dùng còn nguyên; thử tìm "văn khấn" (phải ra Vạn Niên > Văn khấn; chỉ mục thật có ở máy chủ), "bằng lái"; chạm 4 lối tắt, 5 mục thanh dưới; vuốt hero. Index mới nạp `style.css?v=18`, `launcher.js?v=18` nên không lệch cặp với cache.
```
curl -sI "https://9app.tech/js/launcher.js?v=18" | head -1
curl -sI "https://9app.tech/js/home-config.js?v=1" | head -1
```
## 4. Hoàn tác
```
ssh $K root@103.176.20.95 "cd $S && cp -a index.html.bak-ux2 index.html && cp -a css/style.css.bak-ux2 css/style.css && cp -a js/launcher.js.bak-ux2 js/launcher.js"
```
Hai tệp mới nằm lại không hại gì (index cũ không nạp). Dữ liệu người dùng không đổi định dạng.

## Bảo trì
- Thêm app: chỉ sửa `js/apps.js` như trước. Nhóm tự suy ra từ `category`; muốn chỉ định thì thêm `group:'work'` hoặc một dòng trong `GROUP_OF` (`js/home-config.js`).
- Banner hero: mảng `BANNERS` và `ART` trong `js/home-config.js`. Mô tả ngắn: `SHORT`; câu quảng bá: `PROMO`; "Sắp ra mắt": `SOON`. Khi Osin ra mắt: bỏ `soon:true`, đặt `href`.
- Khi sửa `home-config.js` hoặc `launcher.js`, tăng `?v=` trong `index.html`.
