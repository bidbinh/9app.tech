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
ssh $K root@<MAY-CHU> "cd $S && md5sum index.html css/style.css js/launcher.js js/apps.js js/search.js"
md5sum orig/index.html orig/css/style.css orig/js/launcher.js orig/js/apps.js orig/js/search.js
```
Từng cặp phải khớp. Nếu lệch, máy chủ đã đổi sau khi sao: KHÔNG ghi đè, tải bản mới về `orig/` và gộp trước.

## 1. Sao lưu
```
ssh $K root@<MAY-CHU> "cd $S && cp -a index.html index.html.bak-ux2 && cp -a css/style.css css/style.css.bak-ux2 && cp -a js/launcher.js js/launcher.js.bak-ux2"
```
## 2. Chép (tệp phụ trước, index.html sau cùng)
```
scp $K icons/soon-osin.svg root@<MAY-CHU>:$S/icons/
scp $K js/home-config.js js/launcher.js root@<MAY-CHU>:$S/js/
scp $K css/style.css root@<MAY-CHU>:$S/css/
scp $K index.html root@<MAY-CHU>:$S/
```
## 3. Kiểm sau
Mở `https://9app.tech/` bằng cửa sổ ẩn danh (người mới) và trình duyệt có dữ liệu cũ (người cũ): ghim/ẩn/lượt dùng còn nguyên; thử tìm "văn khấn" (phải ra Vạn Niên > Văn khấn; chỉ mục thật có ở máy chủ), "bằng lái"; chạm 4 lối tắt, 5 mục thanh dưới; vuốt hero. Index mới nạp `style.css?v=18`, `launcher.js?v=18` nên không lệch cặp với cache.
```
curl -sI "https://9app.tech/js/launcher.js?v=18" | head -1
curl -sI "https://9app.tech/js/home-config.js?v=1" | head -1
```
## 4. Hoàn tác
```
ssh $K root@<MAY-CHU> "cd $S && cp -a index.html.bak-ux2 index.html && cp -a css/style.css.bak-ux2 css/style.css && cp -a js/launcher.js.bak-ux2 js/launcher.js"
```
Hai tệp mới nằm lại không hại gì (index cũ không nạp). Dữ liệu người dùng không đổi định dạng.

## Bảo trì
- Thêm app: chỉ sửa `js/apps.js` như trước. Nhóm tự suy ra từ `category`; muốn chỉ định thì thêm `group:'work'` hoặc một dòng trong `GROUP_OF` (`js/home-config.js`).
- Banner hero: mảng `BANNERS` và `ART` trong `js/home-config.js`. Mô tả ngắn: `SHORT`; câu quảng bá: `PROMO`; "Sắp ra mắt": `SOON`. Khi Osin ra mắt: bỏ `soon:true`, đặt `href`.
- Khi sửa `home-config.js` hoặc `launcher.js`, tăng `?v=` trong `index.html`.

---

# Bổ sung (14/10/2026): hiển thị đăng nhập 9id ở trang Tài khoản (launcher v20)

**Thứ tự bắt buộc: triển khai 9id trước (BACKLOG A2), rồi mới chép launcher này.** `nine.js` được launcher nạp bất đồng bộ (sau khi
trang chủ đã dựng) và chỉ chèn khi máy chủ trả đúng JavaScript: nếu `/id/nine.js` chưa có (404), bị nginx trả `index.html`
(`try_files`), hoặc 9id chậm/treo, launcher vẫn chạy bình thường (không hiện khối đăng nhập, không lỗi JS, không bị chặn); trình
duyệt chỉ ghi một dòng 404 trong console khi chưa có.

Đổi: `index.html` (không còn thẻ script nine.js (nạp động), `js/launcher.js?v=20`, khối `#acc-out`/`#acc-in`, chữ cái avatar, css `?v` +1), `css/style.css`
(khối "Tài khoản 9id" ở cuối tệp), `js/launcher.js` (khối "Tài khoản 9id", gọi `accountInit()`). Không đổi `apps.js`, `search.js`.
Kiểm trước khi chép (như mục 0 ở trên: so md5 với bản trên máy chủ, sao lưu `.bak-id`), rồi:

```
node tools/test.mjs           # 148 ca cũ, phải in "TAT CA DAT"
node tools/test-account.mjs   # ca tài khoản (cần PUPPETEER_CORE nếu puppeteer-core ở chỗ khác), phải in "TAT CA DAT"
```

nginx phải chuyển `/id/` tới 9id **cùng tên miền** (cookie `nine_sid` Path=/ trên 9app.tech) và phục vụ được `GET /id/nine.js`.
