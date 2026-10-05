# Thiết kế lại trang chủ launcher 9app.tech

Bản làm việc: `D:\9app.tech\launcher-ux\` (sao từ máy chủ ngày 2026-10-04, chưa ghi gì lên máy chủ). Bản gốc để so sánh: `orig/`. Ảnh: `shots/before/`, `shots/after/`.

## 1. Vấn đề (từ ảnh chụp 390 px của chủ sản phẩm)

1. Cùng một app lặp 2 đến 3 chỗ. Nguyên nhân: "Gần đây" lấy mọi app đã dùng (kể cả app đã ẩn), "Gợi ý" lấy mọi app không ở trang chủ (kể cả app người dùng chủ động ẩn), "Của tôi" lấy phần còn lại. Đo trên bản gốc với người dùng cũ: Gia phả, 9license, 9interview, 9hire đều lặp.
2. Nhóm 1 đến 4 app mà tiêu đề to, mỗi nhóm một khối riêng, nhiều khoảng trống bên phải.
3. Banner "Khám phá ngay" chiếm vị trí đẹp nhất với cả người đã quen.
4. Nút "+" nổi giữa thanh dưới và ô "+ Thêm ứng dụng" cùng làm một việc (mở Thư viện) mà không ghi rõ.
5. Không mở rộng được: 40 app là 8 đến 10 nhóm dọc, dài hàng chục màn.
6. "Sắp ra mắt" (10 ô) nằm lẫn trong luồng chính.
7. Mọi tiêu đề cùng cỡ to, không có thứ bậc.

Đo bản gốc (390x844, người dùng cũ): trang cao 1822 px (2,2 màn), app đầu tiên ở y=314, "Ứng dụng của tôi" ở y=576, 4 app lặp.

## 2. Nguyên tắc

- Mỗi app xuất hiện tối đa một lần ở trang chủ. Thứ tự ưu tiên của vùng: Dùng nhanh, rồi Gợi ý, rồi lưới Ứng dụng. App đã nằm ở vùng trên thì bị loại khỏi vùng dưới.
- Chạm một lần tới app hay dùng. Thứ bậc: tìm, rồi app hay dùng, rồi mọi app, rồi quản lý (Thư viện).
- Người mới thấy ít (lời chào + lưới), người cũ thấy ngay app của mình.
- Mở rộng được: lưới tự cuốn theo hàng, chip lọc theo nhóm, nút "Hiện thêm" khi quá 20 app, Thư viện có lọc và tìm.

## 3. Sơ đồ thông tin

```
Trang chủ
 ├─ Đầu trang: logo · ô tìm (app + chức năng, giữ nguyên) · avatar
 ├─ Lời chào (chỉ người mới, đóng được)
 ├─ Dùng nhanh      ghim + dùng gần đây, tối đa 8, một hàng cuộn ngang
 ├─ Gợi ý cho bạn   chỉ app chưa ở trang chủ, chưa từng dùng, chưa bị ẩn; ẩn được
 └─ Ứng dụng        chip nhóm + lưới 4 cột (A-Z), các app còn lại
Thư viện             lọc + tìm; theo nhóm; trạng thái Đã ghim / Đã ẩn / Chưa thêm; Sắp ra mắt ở cuối
Thông báo, Tài khoản giữ nguyên (Tài khoản thêm nút "Hiện lại lời chào và gợi ý")
Thanh dưới: Trang chủ · Thư viện · Thông báo · Tài khoản
```

## 4. Wireframe (390 px)

Người mới (chưa dùng app nào):
```
┌────────────────────────────────────┐
│ [9]app [ Tìm app, chức năng… ] (TB)│
├────────────────────────────────────┤
│ ┌ Chào mừng đến 9app          [x] ┐│
│ └ Mọi thứ của bạn, một chỗ…       ┘│
│ Tất cả ứng dụng          Thư viện >│
│ (Tất cả)(Gia đình)(Công việc)(Đời…→│
│  [ic]  [ic]  [ic]  [ic]            │
│  tên   tên   tên   tên             │
│  ... lưới 4 cột, A-Z ...           │
├────────────────────────────────────┤
│ Trang chủ  Thư viện  Thông báo  TK │
└────────────────────────────────────┘
```
Người dùng cũ:
```
│ Dùng nhanh                          │
│ [ic][ic][ic][ic][ic→ cuộn ngang     │  ghim (sao vàng) trước, rồi mới dùng gần nhất
│ Ứng dụng khác            Thư viện > │  (không lặp với hàng trên)
│ (Tất cả)(Gia đình)(Công việc)…      │
│  lưới 4 cột                         │
```
Thư viện:
```
│ Thư viện                            │
│ 17 ứng dụng. Chạm để mở…            │
│ ( Lọc ứng dụng…                  )  │
│ (Tất cả 17)(Đã ghim 0)(Đã ẩn 2)     │
│ Gia đình 3                          │
│ ┌[ic] 9Fin      mô tả 1 dòng     ⋯ ┐│
│ │[ic] Gia phả [Đã ẩn]         Thêm │││
│ Công việc 7 … Sắp ra mắt 9          │
```

## 5. Quyết định và lý do

| Quyết định | Lý do |
|---|---|
| Gộp Yêu thích + Gần đây thành "Dùng nhanh" (tối đa 8, một hàng cuộn ngang, ghim lên trước, có sao vàng) | Hai khái niệm cùng phục vụ "mở lại app quen"; một hàng ngay dưới ô tìm, chạm một lần. Cuộn ngang không tốn chiều dọc, ô thứ 5 ló ra để gợi ý cuộn. |
| Lưới "Ứng dụng" loại app đã ở Dùng nhanh; tiêu đề thành "Ứng dụng khác" khi có Dùng nhanh, "Tất cả ứng dụng" khi chưa có | Giữ đúng nguyên tắc một lần; tiêu đề nói thật nội dung. App ở Dùng nhanh vẫn tìm được qua ô tìm và Thư viện. |
| Lưới 4 cột, sắp A-Z cố định, tên 12 px tối đa 2 dòng | Vị trí ổn định giúp nhớ (không xáo theo lượt dùng, vì lượt dùng đã có ở Dùng nhanh). Màn rộng: 6 cột (>=600 px), 8 cột (>=1000 px). |
| Chip nhóm thay cho nhóm xếp dọc: Tất cả, Gia đình, Công việc, Đời sống, Lái xe, Sở thích | Nhóm 2 app không còn tốn một khối + tiêu đề lớn. Chip chỉ hiện khi lưới có từ 9 app và từ 2 nhóm; nhóm rỗng tự ẩn. Không gộp nhóm: chip không tốn chỗ theo số app nên ràng buộc "nhóm >= 3 app" không còn cần; gộp "Lái xe + Sở thích" tạo nhóm khó hiểu. |
| Quá 20 app trong lưới "Tất cả" thì hiện 16 app + nút "Hiện thêm N ứng dụng"; chọn một chip thì hiện đủ nhóm đó | Giới hạn chiều cao ở 40+ app (thử 40 app giả: 8 Dùng nhanh + 16 + 17 còn lại), nhưng tới mọi app bằng một chạm hoặc chip. |
| "Gợi ý cho bạn": một hàng viên thuốc nhỏ (biểu tượng 32 px + tên), chỉ app chưa ở trang chủ, chưa dùng, chưa bị ẩn; có "Ẩn gợi ý"; không hiện khi còn lời chào | Bản gốc gợi ý cả app người dùng đã chủ động ẩn, là nguồn gây lặp chính. Người mới đã đủ nội dung, gợi ý đến sau. |
| Banner thành lời chào thấp (~76 px), chỉ khi chưa dùng app nào, chưa ghim, chưa đóng; đóng được; nhớ ở khóa `9app.ui`; tự biến mất khi đã dùng một app | Người mới được chào, người cũ không bị chiếm chỗ. Nút "Khám phá ngay" bỏ vì lưới ngay bên dưới. |
| Bỏ nút "+" nổi giữa thanh dưới và ô "+ Thêm ứng dụng"; thanh dưới còn 4 mục bằng nhau | Hành động "thêm" có chỗ rõ nghĩa ở Thư viện: nút chữ "Thêm" ngay trên từng app chưa hiện. Không đổi thành nút "Tìm" vì ô tìm luôn ở đầu trang (sticky). |
| Bỏ chuông ở đầu trang | Đã có tab "Thông báo"; có thêm chỗ cho ô tìm (placeholder không bị cắt ở 360 px). Khi có huy hiệu số thông báo thì gắn vào tab. |
| Thư viện: hàng danh sách (biểu tượng 44, tên, mô tả 1 dòng, nhãn trạng thái, nút "Thêm" hoặc "⋯" mở menu cũ); theo nhóm, A-Z; lọc Tất cả / Đã ghim / Đã ẩn kèm số; ô lọc không dấu; "Sắp ra mắt" ở cuối | Quản lý (ghim, ẩn, thêm lại) tách khỏi trang chủ. Menu giữ lâu và menu "⋯" dùng cùng một bảng thao tác. "Sắp ra mắt" ở cuối Thư viện, ẩn khi đang lọc. |
| Trang chủ không còn "Sắp ra mắt" | Đưa xuống Thư viện theo yêu cầu; không để dòng nhắc ở trang chủ cho đỡ tốn chỗ (có thể thêm một dòng nếu muốn quảng bá). |

Thị giác: biểu tượng 56 px bo 16 px; khoảng cách thang 4/8 (lề 16, giữa các mục 24, trong mục 8); tiêu đề mục 15 px đậm, lời nhỏ 13 px, tên app 12 px; nút và liên kết cao, rộng ít nhất 44 px (nút chữ và nút tròn dùng viền trong suốt hoặc lề âm để vùng chạm 44 px mà không tăng chiều cao hàng); `:active` (thu nhẹ 0,95), `:focus-visible`; chuyển động ngắn, tắt hết khi `prefers-reduced-motion`; khung chờ 8 ô trong HTML tới khi vẽ xong; chế độ tối theo `prefers-color-scheme` bằng biến CSS, `theme-color` theo hệ thống; `env(safe-area-inset-*)`; màu nhấn `#2563eb`, nền `#f4f7fb`.

Hiệu năng: vẽ đồng bộ ở cuối `<body>` (không chờ mạng), không chặn tải; CSS 18 KB, JS 36 KB; lưới dùng CSS grid nên không đo độ rộng bằng JS (bỏ `cols()` và sự kiện resize); chỉ mục tìm vẫn nạp trễ như cũ.

## 6. Cái bỏ

Banner có CTA và chấm trang; "Gần đây" và "Ứng dụng của tôi" tách đôi, tiêu đề nhóm dọc, nút "…Xem thêm" từng nhóm; ô "+ Thêm ứng dụng"; nút "+" nổi; chuông ở đầu trang; "Sắp ra mắt" ở trang chủ; nhiều "Xem tất cả" (còn một liên kết "Thư viện").

## 7. Tương thích

Không sửa `js/apps.js`, `js/search.js`, `js/homebar.js`, `search/*.json`, `icons/`, manifest. Khóa `9app.prefs` (fav/hide/show/usage) và `9app.fnuse` đọc ghi y nguyên; thêm khóa `9app.ui` ({welcome, suggest}). Cờ `ready`, `home`, `category` dùng như cũ. Ý nghĩa: `fav` = ghim (ở Dùng nhanh trước), `hide` = Đã ẩn, `show` = thêm vào trang chủ dù mặc định ẩn (như 9log). ES5 thuần (không `let/const`, mũi tên, template, module).

## 8. Kết quả đo (390x844)

| | Trước (cũ) | Sau (cũ) | Trước (mới) | Sau (mới) |
|---|---|---|---|---|
| Chiều cao trang | 1822 px | 845 px (vừa một màn) | 1676 px | 845 px |
| App đầu tiên ở y | 314 | 113 | 324 | 259 |
| Vị trí lưới app đầy đủ | 576 ("Ứng dụng của tôi") | 309 | 430 | 259 |
| App lặp | 4 (Gia phả, 9license, 9interview, 9hire) | 0 | 0 | 0 |
| Số lần cuộn để thấy hết | 2 | 0 | 2 | 0 |
