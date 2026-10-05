# Tìm chức năng cho launcher 9app.tech: triển khai và bảo trì

Thư mục này là bản sao của launcher trên máy chủ (`/home/tms/ops/certbot/www/9app/`, tải về ngày 2026-10-04) cộng phần tìm chức năng. Chưa ghi gì lên máy chủ.

## 1. Tệp thay đổi so với bản trên máy chủ

Đã so md5 từng tệp với máy chủ.

| Tệp | Trạng thái | Nội dung |
|---|---|---|
| `index.html` | sửa | Ô tìm có nút xóa, khối `#fn-wrap` (kết quả chức năng), vùng đọc cho trình đọc màn hình `#sr-status`, nạp `js/search.js`, tăng `?v=` |
| `js/launcher.js` | sửa | Nạp trễ chỉ mục, hiển thị kết quả, bàn phím, ghi nhớ lượt mở. `matchesSearch` và các khối cũ giữ nguyên |
| `js/apps.js` | sửa | Thêm trường `index` cho 12 app (Vạn Niên, 9unit, 9license, 9english, 9race, 9interview, 9hire, 9swap, 9lunch, 9Ship, 9scanner, 9speed) |
| `css/style.css` | sửa (thêm cuối tệp) | Kiểu ô tìm, nút xóa, danh sách kết quả, trạng thái `.searching` |
| `js/search.js` | mới | Bộ chấm điểm, xếp hạng, không dấu, gõ sai nhẹ. Không đụng DOM |
| `search/*.json` | mới, 11 tệp | Chỉ mục chức năng cho các app chưa có `search-index.json` riêng: unit, license, english, race, interview, hire, swap, lunch, ship, scanner, speed |

Không đổi: `js/homebar.js`, `js/gate.js`, `manifest.webmanifest`, `icons/`.

Không chép lên máy chủ: `tests/`, `tools/`, `shots/`, `package.json`, `DEPLOY.md`, và thư mục `icons/` cùng `manifest.webmanifest` (chỉ để chạy cục bộ).

Chỉ mục của Vạn Niên không nằm ở đây. Launcher đọc `vannien/search-index.json` do app Vạn Niên tự xuất bản (hiện đã có trên https://9app.tech/vannien/search-index.json, 49 mục).

## 2. Cách chép

Từ thư mục này (`D:\9app.tech\launcher-search`):

```
node --test tests/                       # 19 test, phải đạt hết
node tests/e2e.mjs                       # 27 kịch bản trình duyệt thật
node tools/build-search-index.mjs --check  # search/*.json khớp bộ sinh

S=/home/tms/ops/certbot/www/9app
ssh root@103.176.20.95 "cp -a $S/index.html $S/index.html.bak-timkiem; cp -a $S/js/apps.js $S/js/apps.js.bak-timkiem; cp -a $S/js/launcher.js $S/js/launcher.js.bak-timkiem; cp -a $S/css/style.css $S/css/style.css.bak-timkiem"
scp index.html root@103.176.20.95:$S/
scp js/apps.js js/launcher.js js/search.js root@103.176.20.95:$S/js/
scp css/style.css root@103.176.20.95:$S/css/
scp -r search root@103.176.20.95:$S/
```

Thứ tự an toàn: chép `search/` và `js/search.js` trước, rồi `css`, `js/apps.js`, `js/launcher.js`, cuối cùng `index.html`. Nếu `index.html` mới mà `js/search.js` chưa có, launcher vẫn chạy như cũ (mã kiểm `window.NineSearch`), chỉ không có tìm chức năng.

Hoàn tác: chép lại các tệp `.bak-timkiem`.

Sau khi chép, kiểm: mở https://9app.tech, gõ "van khan", phải ra "Vạn Niên › Văn khấn". Chạy thêm quét deep link trên bản thật (chỉ GET):

```
node tests/deeplinks.mjs --prod --only=vannien,unit,license,english,race,scanner,speed
```

Lưu ý nginx: một đường dẫn chưa có tệp (ví dụ `/search/unit.json` trước khi chép) trả `200` kèm trang HTML. Launcher bỏ qua vì không phải JSON, nên không hỏng. Không cần cấu hình thêm. Bộ nhớ đệm HTTP của `search/*.json` để mặc định; launcher tự giữ bản trong `localStorage` và hỏi lại sau 1 giờ.

## 3. Cách hoạt động ngắn gọn

1. Người dùng bấm vào ô tìm hoặc gõ ký tự đầu: `ensureIndexes()` nạp song song mọi `index` khai trong `js/apps.js`. Trước đó không tải gì. Mỗi tệp có thời hạn 8 giây, lỗi thì app đó chỉ mất phần chức năng, tìm kiếm còn lại vẫn chạy, 20 giây sau thử lại khi gõ tiếp.
2. Bản nạp được lưu `localStorage` (`9app.fidx.<id>`), dùng ngay, hỏi lại máy chủ nếu cũ hơn 1 giờ.
3. Mỗi mục chức năng thành một bản ghi tìm: tên, từ khóa, mô tả đều được bỏ dấu. Địa chỉ đích = địa chỉ app + `path`; chỉ nhận cùng nguồn gốc với app (chặn `javascript:` và trang lạ).
4. Xếp hạng (js/search.js): khớp tên > từ khóa > mô tả > tên/nhóm/mô tả app; khớp đầu từ > giữa từ; mục gốc ngắn trước mục con; nhớ lượt mở cộng thêm tối đa 12 điểm. Mọi từ gõ vào phải khớp. Từ chưa có trong kho từ thì thử sửa lỗi gõ (đảo chữ, thiếu, thừa, sai một hai chữ). Không ra thì gợi ý câu gần giống, hoặc hiện mục khớp một phần có nhãn "Gần giống".
5. Tên app khớp thì khối app đứng trước (như cũ), không thì khối chức năng đứng trước. Enter mở kết quả đầu tiên theo đúng thứ tự đang thấy.
6. Lượt mở lưu ở `9app.fnuse` và cũng tính vào "Gần đây" của app đó.
7. Khi đang tìm, banner và "Sắp ra mắt" tạm ẩn để kết quả lên đầu; xóa ô tìm thì hiện lại.

## 4. Thêm chức năng của một app mới

Có hai cách, chọn một hoặc dùng cả hai.

### Cách A (khuyên dùng): app tự xuất bản `search-index.json`

1. Trong app, xuất bản `/<app>/search-index.json`. Định dạng giống `vannien/docs/SEARCH-INDEX.md`:

   ```json
   [
     { "name": "Văn khấn", "keywords": ["van khan", "khấn", "cúng"], "path": "#/van-khan", "blurb": "Một câu mô tả ngắn." }
   ]
   ```

   - `name`: tên hiển thị, chức năng con viết dạng `Nhóm: Tên`.
   - `keywords`: từ khóa; launcher tự bỏ dấu nên không cần viết hai bản, nhưng thêm cũng không hại.
   - `path`: chuỗi tính từ địa chỉ app. Thường là `#/...`. Có thể có tham số trong hash như `#/?type=trail`. Để trống `""` nghĩa là mở trang chủ app (dùng khi app chưa có route cho chức năng đó).
   - `blurb`: một câu, tối đa khoảng 240 ký tự.
2. Chỉ khai báo đường dẫn mở đúng màn hình khi vào thẳng bằng địa chỉ. Đừng khai báo màn hình cần phiên làm việc trước đó. Ví dụ `9license` `#/luyen` và `#/thi/lam` tự chuyển về `#/hoc` khi chưa có phiên, nên không khai.
3. Trong `js/apps.js` thêm vào app: `index: '<thư mục app>/search-index.json',`.
4. Tăng `?v=` của `js/apps.js` trong `index.html`.

### Cách B: khai báo ngay trong `js/apps.js`

Dành cho app nhỏ, vài mục:

```js
{ id: 'abc', name: '9abc', ..., href: 'abc/',
  features: [{ name: 'Tính X', keywords: ['tinh x', 'x'], path: '#/tinh-x', blurb: 'Tính X nhanh.' }] }
```

Không cần tệp riêng, có ngay khi gõ ký tự đầu.

### Chỉ mục do launcher giữ (các app hiện tại)

`tools/build-search-index.mjs` chứa dữ liệu và sinh `search/<id>.json`:

```
node tools/build-search-index.mjs          # ghi lại
node tools/build-search-index.mjs --check  # kiểm
```

Khi một app (ví dụ 9unit) bắt đầu tự xuất bản `search-index.json`, đổi `index` trong `js/apps.js` sang tệp của app, rồi xóa mục `unit` trong bộ sinh và tệp `search/unit.json`.

### Kiểm sau khi thêm

```
node --test tests/                       # định dạng, path không trùng, path ghép đúng nguồn gốc
node tests/deeplinks.mjs --only=<id>     # mở từng deep link trong Chrome, báo cái nào bị chuyển hướng hoặc lỗi
```

`tests/serve.mjs` có bảng `APP_DIRS` ánh xạ `/<app>/` sang thư mục repo để chạy cục bộ; thêm app mới vào đó nếu muốn quét.

## 5. Giới hạn đã biết

- 9scanner và 9speed không có route trong hash, nên các chức năng của chúng mở trang chủ app (mô tả nói rõ nút cần bấm).
- 9hire, 9swap, 9lunch, 9Ship, 9interview chạy phía máy chủ có API và đăng nhập. Deep link của chúng chỉ mới kiểm ở mức tải trang tĩnh (giữ nguyên hash, không lỗi script). Chưa kiểm khi đã đăng nhập hoặc có dữ liệu.
- Các app ngoài (Gia phả, Hội phụ huynh, 9Fin, 9Sport, 9log) chưa khai chức năng. Chúng vẫn tìm ra như app.
- Kết quả không tô sáng từ khớp.
