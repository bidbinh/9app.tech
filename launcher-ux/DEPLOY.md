# Thay thế chính thức trang chủ launcher

Làm sau khi đã xem `home2.html` (xem PREVIEW.md) và đồng ý. Chỉ 3 tệp đổi; `js/apps.js`, `js/search.js`, `js/homebar.js`, `search/`, `icons/`, manifest giữ nguyên.

| Tệp (trong `launcher-ux/`) | Máy chủ |
|---|---|
| `index.html` (đã tăng `?v=17`) | `$S/index.html` |
| `css/style.css` | `$S/css/style.css` |
| `js/launcher.js` | `$S/js/launcher.js` |

## 0. Kiểm trước khi chép
```
cd D:/9app.tech/launcher-ux
node tools/test.mjs      # phải in "TAT CA DAT"
S=/home/tms/ops/certbot/www/9app
ssh -i ~/.ssh/9log_deploy root@103.176.20.95 "cd $S && md5sum js/apps.js js/search.js index.html css/style.css js/launcher.js"
md5sum js/apps.js js/search.js orig/index.html orig/css/style.css orig/js/launcher.js
```
Các md5 phải khớp từng cặp. Nếu lệch, máy chủ đã có thay đổi mới sau khi sao: không ghi đè, lấy bản mới về và gộp trước. Bản mới không sửa `apps.js`.

## 1. Sao lưu
```
ssh -i ~/.ssh/9log_deploy root@103.176.20.95 "cd $S && cp -a index.html index.html.bak-ux && cp -a css/style.css css/style.css.bak-ux && cp -a js/launcher.js js/launcher.js.bak-ux"
```
## 2. Chép (css và js trước, index.html sau cùng)
```
scp -i ~/.ssh/9log_deploy css/style.css root@103.176.20.95:$S/css/
scp -i ~/.ssh/9log_deploy js/launcher.js root@103.176.20.95:$S/js/
scp -i ~/.ssh/9log_deploy index.html root@103.176.20.95:$S/
```
## 3. Kiểm sau
Mở `https://9app.tech/` bằng cửa sổ ẩn danh (người mới) và trình duyệt có dữ liệu cũ (người cũ): ghim, ẩn, lượt dùng còn nguyên; thử tìm "bằng lái", chip nhóm, tab Thư viện.
```
curl -sI "https://9app.tech/js/launcher.js?v=17" | head -1
```
## 4. Hoàn tác
```
ssh -i ~/.ssh/9log_deploy root@103.176.20.95 "cd $S && cp -a index.html.bak-ux index.html && cp -a css/style.css.bak-ux css/style.css && cp -a js/launcher.js.bak-ux js/launcher.js"
```
Dữ liệu người dùng không đổi định dạng (`9app.prefs`, `9app.fnuse`); khóa mới `9app.ui` bị bản cũ bỏ qua. Index cũ nạp lại `?v=16`, nên cặp tệp không lệch.

## Ghi chú bảo trì
- Thêm app: chỉ sửa `js/apps.js` như trước (`category`, `ready`, tùy chọn `home:false`).
- Danh sách "Sắp ra mắt": biến `SOON` trong `js/launcher.js`; tự bỏ mục trùng tên app thật.
- Thứ tự chip nhóm: biến `CHIP_ORDER` trong `js/launcher.js`.
