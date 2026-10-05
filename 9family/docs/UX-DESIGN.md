# 9family: thiết kế lại giao diện và trải nghiệm (v2)

Phạm vi: chỉ phần trình bày trong `public/` (HTML, CSS, JS trình duyệt). API, logic máy chủ, xác thực và dữ liệu giữ nguyên. Ảnh chụp trước/sau nằm ở `shots/ux-before/` và `shots/ux-after/` (dữ liệu mẫu bịa, sinh bằng `scripts/ux-shots.js`).

## 1. Vấn đề của bản cũ (nhìn trên điện thoại thật, tab Lịch)

| Thấy gì | Vì sao dở |
|---|---|
| Mỗi ngày một thẻ lớn, kể cả ngày trống | Phải cuộn rất nhiều mới thấy vài sự kiện. Cả tuần tốn hơn hai màn hình. |
| Link "+ Thêm sự kiện" lặp trong MỖI thẻ ngày, rồi thêm nút lớn "+ Thêm sự kiện" ở cuối | 8 chỗ cùng một việc: ồn ào, và nhìn không ra đâu là nút chính. |
| Tiêu đề ngày to, nhiều khoảng trắng; cột giờ tách riêng | Mật độ thông tin thấp. |
| Thanh màu bên trái dòng sự kiện không giải thích | Không biết màu là của con nào; người mù màu không phân biệt được. |
| Không thấy ai phụ trách | Muốn biết "ai đưa con" phải mở từng ca. |
| Không có lọc theo con ngay tại chỗ; không có cái nhìn tháng/tuần gọn | Gia đình 2 con phải đọc hết để tìm đúng con. |
| Thanh dưới 5 tab chữ dài ("Việc chung", "Gia đình") chật; không có chỗ cho tính năng mới | Thêm Thực đơn, Sức khỏe, Tiền sẽ làm thanh dưới vỡ. |
| Màn Hôm nay: thẻ ca to, đỏ rực "Quá giờ 7 giờ 5 phút" cho ca đã qua từ sáng | Gây hoảng vô ích, che mất việc thật sự cần làm lúc này. |

## 2. Nguyên tắc

1. Một việc, một nút. Mỗi màn hình chính có đúng một nút nổi "+ Thêm"; không lặp "Thêm" ở nơi khác.
2. Mặc định gọn, mở rộng khi cần. Ngày trống ẩn (có nút "Hiện cả ngày trống"); thông tin phụ (nhắc trước, cần mang, ghi chú) nằm sau "Thêm chi tiết".
3. Hôm nay là nhà. Mở app thấy ngay: ngày dương/âm, việc sắp tới theo giờ có vạch "Bây giờ", ai đưa/đón ai, nút "Tôi nhận" một chạm.
4. Cảnh báo bình tĩnh. Chỉ ca SẮP tới giờ (60 phút trước, 90 phút sau) mà chưa ai nhận mới nổi bật, bằng dải vàng và một nút hành động, không dùng đỏ rực.
5. Không chỉ dựa vào màu. Mỗi con có avatar chữ cái + màu + tên; trạng thái có chữ và biểu tượng.
6. Mọi lứa tuổi. Chữ từ 14px (16px cho nội dung chính), vùng chạm từ 44px, tương phản AA, "Chữ lớn" nhớ lại lần sau, có hoàn tác.
7. Chừa chỗ cho tương lai nhưng không giả vờ có. Mục chưa ra mắt ghi rõ "Sắp ra mắt" (hiện chỉ còn Osin, trợ lý của nhà), không có dữ liệu giả và không có nút bấm vô nghĩa.

## 3. Kiến trúc thông tin

Thanh dưới có đúng 5 mục, nhãn tối đa 8 ký tự, biểu tượng cùng một bộ nét:

```
 ┌────────────────────────────────────────────────────────────────┐
 │ Hôm nay │  Lịch  │ Đưa đón │ Tiện ích │ Gia đình │
 │  (mặt trời) (lịch) (xe)     (lưới 2x2)  (người)               │
 └────────────────────────────────────────────────────────────────┘

 Hôm nay ── dòng thời gian (ca đưa đón + sự kiện) · cảnh báo ca chưa ai nhận · việc đang chờ · đi chợ · ngày mai
 Lịch ───── dải tuần / lưới tháng · lọc theo con · danh sách gọn theo ngày
 Đưa đón ── Theo ngày · Lịch tuần · Lịch sử
 Tiện ích ─ (cửa vào mọi thứ ngoài lịch và đưa đón)
              ├─ Osin, trợ lý của nhà ........ sắp ra mắt (khung trò chuyện đã dựng)
              ├─ Việc chung ................... có
              ├─ Thực đơn tuần ................ có (hồ sơ ăn uống, lập cả tuần, đổi món, công thức, tạo danh sách đi chợ)
              ├─ Đi chợ (nhóm theo khu quầy) .. có (gõ hoặc nói nhiều món, soát lại, "Nhà đã có", chế độ đi chợ, chia sẻ)
              ├─ Sức khỏe ..................... có (tăng trưởng WHO, tiêm chủng, thuốc, huyết áp/đường huyết, hồ sơ khám)
              ├─ Tiền gia đình ................ có (chi tiêu chung gõ một câu/giọng nói, khoản phải đóng, tiêu vặt của con)
              └─ Thông báo của trường ......... có (dán chữ hoặc chụp ảnh, soát lại rồi mới lưu thành sự kiện/việc)
              Tài khoản của con: chỉ thấy Việc chung (việc giao cho mình), Sức khỏe, Tiền (tiêu vặt của mình)
 Gia đình ─ gia đình · Chuyển gia đình · Lời mời   (chỗ dành cho tài khoản 9app/9id)
              ├─ Thành viên · Trẻ em (thẻ con, thời khóa biểu) · Người đón hộ
              ├─ Hiển thị (Chữ lớn) · Thông báo trên máy này
              ├─ Nâng cao: Thiết bị, lịch ICS, mốc nhắc leo thang
              └─ Tài khoản: về 9app, mã khôi phục, chuyển quyền, rời, xóa
 Thanh trên: ô gia đình (chạm để Chuyển gia đình) · tên màn · [Osin] · [chuông]
 Nút nổi:   "+ Thêm" (Hôm nay, Lịch) · "Thêm ca" (Đưa đón, chỉ quản lý)
```

Lý do chọn "Tiện ích" thay vì "Nhà": tên ngắn, quen với người dùng Việt (siêu ứng dụng cũng gọi vậy), không lẫn với "Gia đình" (hồ sơ, thành viên). Mục này hấp thụ Việc chung, Thực đơn, Đi chợ, Sức khỏe, Tiền, Thông báo của trường mà không đụng đến thanh dưới (đã đúng như dự tính ban đầu). Việc chung/Đi chợ vẫn mở được bằng một chạm từ Hôm nay.

## 4. Wireframe các màn chính (390px)

### 4.1 Hôm nay

```
┌──────────────────────────────────────┐
│ [N] Hôm nay                  ✦    🔔3│  thanh trên: ô gia đình, tên màn, Osin, chuông
│     Nhà Cây Sồi                      │
│ Thứ hai, 05/10                       │  ngày lớn
│ 2026 · Âm lịch 25/8 · năm Bính Ngọ   │
│ 1 ca đưa đón còn lại · 2 sự kiện · 3 việc
│ ┌──────────────────────────────────┐ │
│ │ ⚠ Chưa ai nhận ca đón Mía [Tôi nhận]│ │  chỉ khi sắp tới giờ mà chưa ai nhận (vàng, không đỏ)
│ │   16:30 · còn 15 phút            │ │
│ └──────────────────────────────────┘ │
│ DÒNG THỜI GIAN HÔM NAY      Đưa đón >│
│ ┌──────────────────────────────────┐ │
│ │ Giỗ cụ nội                [Cả ngày]│ │
│ │ 07:00 (M) Đưa Mía               ✓│ │  đã xong: chữ nhạt + dấu tick
│ │       (A) Anh Hùng đã đưa lúc 07:03│
│ │ 11:00 (S) Đón Sóc               ✓│ │
│ │ ●━━ Bây giờ 14:05 ━━━━━━━━━━━━━━ │ │  vạch đồng hồ
│ │ 15:30 (S) Học bơi            (B) │ │  sự kiện: con · nơi · người phụ trách
│ │ 16:30 (M) Đón Mía    [Tôi nhận]  │ │  ca: một thao tác chính ngay trên dòng
│ └──────────────────────────────────┘ │
│ VIỆC ĐANG CHỜ                 Tất cả >│
│ ┌──────────────────────────────────┐ │
│ │ ○ Đóng tiền học phí  · Hạn mai   │ │  chạm ○ = xong (có Hoàn tác)
│ └──────────────────────────────────┘ │
│ [🛒 Cần mua 7 món: Sữa, trứng…     >] │
│ ⌄ Ngày mai, 06/10 · 4 ca, 1 sự kiện  │  gập sẵn
│                              (+ Thêm)│  nút nổi duy nhất
├──────────────────────────────────────┤
│ Hôm nay  Lịch  Đưa đón  Tiện ích  Gia đình
└──────────────────────────────────────┘
```

### 4.2 Lịch

```
┌──────────────────────────────────────┐
│ [N] Lịch              [Xem tháng] 🔔 │  chuyển tuần/tháng ngay trên thanh trên
│  ‹   05/10 – 11/10/2026  Tuần này   ›│
│  T2  T3  T4  T5  T6  T7  CN          │  dải tuần: chạm để chọn ngày
│ (5)   6   7   8   9  10  11          │  hôm nay = vòng đặc; chọn = viền
│  ●○   ●   ●   ●●  ●●  ●   ●          │  chấm = màu con có sự kiện (○ = chung)
│ [Tất cả] [(M) Mía] [(S) Sóc]         │  chip lọc có avatar
│ [Hôm nay] Thứ hai, 05/10      Âm 25/8│  chỉ ngày CÓ sự kiện (ngày trống ẩn)
│ ┌──────────────────────────────────┐ │
│ │ 15:30 (S) Học bơi            (B) │ │  giờ · con · tên · nơi · người phụ trách
│ │ 16:15  Sóc  📍 Bể bơi Thanh Xuân │ │
│ └──────────────────────────────────┘ │
│ Thứ ba, 06/10                Âm 26/8 │
│ ...                                  │
│ [⌄ Hiện cả ngày trống (2)]           │
│                              (+ Thêm)│
└──────────────────────────────────────┘
```
Vuốt ngang để sang tuần/tháng khác. Tháng: lưới 7x6 có chấm, chọn ngày hiện danh sách của ngày đó bên dưới.

### 4.3 Thêm nhanh (tờ dưới)

```
┌──────────────────────────────────────┐
│ ━━                                   │
│ Thêm sự kiện                       ✕ │
│ Gõ một câu                           │
│ [Piano thứ 7 9:30 Mía ] [Điền sẵn] │  bộ phân tích luật (public/quick.js)
│ Đã hiểu: Thứ bảy 10/10 · 09:30 · Hằng tuần · Mía
│ Mẫu nhanh (vuốt ngang)               │
│ [Học thêm][Khám bệnh][Họp phụ huynh][Thi][Sinh nhật][Giỗ][Khác]
│ Tên sự kiện  [Piano              ] │
│ Cho con nào  [(M) Mía] [(S) Sóc]     │  chọn bằng avatar
│ Ngày [10/10/2026]   Cả ngày hay theo giờ? [Cả ngày]
│ Giờ bắt đầu [09:30]  Giờ kết thúc [   ]
│ Lặp lại [Một lần][Hằng tuần][Hằng ngày][Hằng năm][Hằng năm (âm lịch)]
│ Lặp vào các thứ  T2 T3 T4 T5 T6 [T7] CN
│ Địa điểm · Người phụ trách (chip)    │
│ [            Lưu sự kiện            ]│
│     Thêm chi tiết: nhắc, cần mang… > │  mở biểu mẫu đầy đủ, mang theo dữ liệu đã nhập
└──────────────────────────────────────┘
```
Lưu xong có "Đã lưu sự kiện [Hoàn tác]" trong 7 giây.

### 4.4 Đưa đón

```
[Theo ngày][Lịch tuần][Lịch sử]
 ‹   Hôm nay, Thứ hai, 05/10   ›
 dải tuần (chấm theo khuôn tuần)  ·  [Tất cả][Mía][Sóc]
 4 ca · [1 ca chờ người nhận]
 ┌ 07:00 (M) Đưa Mía            ✓ ┐
 │       (A) Anh Hùng đã đưa lúc 07:03 · 📍 Cổng trường
 ├ 16:30 (M) Đón Mía    [Tôi nhận] ┤  chạm dòng = tờ chi tiết: người phụ trách, dự phòng,
 │       (C) Chị Lan Anh · 📍 Cổng B      Đã đón, Đổi người, Bỏ qua ca, gọi người đón hộ
 │       [Chờ người nhận] còn 2 giờ 25 phút
 └──────────────────────────────────────┘
```
Nút trên dòng đi theo vòng đời: Tôi nhận, Đang đi, Đã đón/Đã đưa. Lịch tuần: thẻ từng con, gom "T2–T6", nhấn để sửa (quản lý).

### 4.5 Tiện ích và Gia đình

```
Tiện ích                                Gia đình
┌ Osin, trợ lý của nhà [Sắp ra mắt] ┐  ┌ (N) Nhà Cây Sồi                 ✎ ┐
└───────────────────────────────────┘  │ Chuyển gia đình              >  │ chỗ cho 9id
DÙNG HẰNG NGÀY                         │ Lời mời  · 1 người chưa vào  >  │ chỗ cho 9id
[Việc chung 3] [Thực đơn tuần]         └────────────────────────────────┘
[Đi chợ 7] [Sức khỏe]                  THÀNH VIÊN · TRẺ EM (thẻ con có avatar màu)
[Tiền gia đình] [Thông báo trường]     NGƯỜI ĐÓN HỘ · HIỂN THỊ (Chữ lớn)
                                          THÔNG BÁO TRÊN MÁY NÀY · NÂNG CAO ⌄ · TÀI KHOẢN
```

## 5. Hệ thiết kế

Định nghĩa ở đầu `public/style.css` (token) và `public/ui.js` (thành phần).

- Màu: nền `--bg`, bề mặt `--surface`, chữ `--ink`/`--mute`, thương hiệu xanh ngọc `--brand` (giữ gam cũ, bỏ bớt sắc phụ). Sáng/tối tự theo hệ thống.
- 8 màu của con (`--c-xanh … --c-nau`): bản sáng đều >= 4,5:1 so với trắng (dùng làm nền avatar chữ trắng hoặc làm chữ trên nền trắng); bản tối dùng gam sáng với chữ tối.
- Khoảng cách lưới 4/8: `--s1..--s6` = 4, 8, 12, 16, 24, 32. Bo góc `--r-s..--r-xl`, bóng `--shadow-1..3`.
- Chữ (rem, nên "Chữ lớn" phóng đồng loạt): 14, 15, 16, 18, 20, 26px. Không có chữ dưới 14px.
- Thành phần: avatar (`F9.avatar`, con = nền màu + chữ cái, người lớn = nền nhạt), chip, chip lọc (`F9.fchips`), hàng sự kiện/ca (`F9.evRow`, `F9.rideRow`), thẻ/danh sách, tờ dưới có tay nắm (`F9.sheet`), nút (đặc, viền, nhỏ), thanh trên, thanh dưới, nút nổi (`F9.setFab`), trạng thái trống có biểu tượng và hướng dẫn (`F9.empty`), khung chờ đúng hình (`F9.skeleton`), thông báo có nút Hoàn tác (`F9.toast`), công tắc (`F9.switchRow`).

## 6. Quyết định và lý do

| Quyết định | Lý do |
|---|---|
| Dải tuần ngang + danh sách chỉ hiện ngày có sự kiện | Nhìn cả tuần trong một màn; giảm một nửa chiều dài trang. |
| Chuyển Tuần/Tháng lên thanh trên bằng chữ "Xem tháng/Xem tuần" | Bỏ hàng nút chia đôi tốn 56px; chữ rõ hơn biểu tượng cho người lớn tuổi. |
| Một dòng sự kiện = giờ, avatar con, tiêu đề, nơi, người phụ trách | Đọc một lần là đủ; avatar có chữ cái nên không chỉ dựa vào màu. |
| Gộp ca đưa đón và sự kiện vào MỘT dòng thời gian ở Hôm nay, có vạch "Bây giờ" | Người dùng nghĩ theo thời gian trong ngày, không theo loại dữ liệu. |
| Thao tác chính nằm ngay trên dòng ca, thao tác phụ trong tờ chi tiết | "Tôi nhận" đúng một chạm; Đổi người/Bỏ qua ít dùng nên không chiếm chỗ. |
| Dải vàng chỉ khi sắp tới giờ mà chưa ai nhận | Nổi bật đúng lúc, không gây hoảng; ca quá giờ lâu chỉ nhạt đi. |
| Nút nổi "+ Thêm" có chữ (không chỉ dấu +) | Ông bà không phải đoán; vẫn chỉ một nút cho cả màn. |
| Thêm nhanh bằng tờ dưới + gõ một câu + mẫu | Phần lớn lần thêm là lịch học lặp: chọn mẫu hoặc gõ một câu thay vì 10 ô. Phân tích bằng luật, có test; Osin sẽ dùng AI sau, giữ luật làm dự phòng không cần mạng. |
| Biểu mẫu đầy đủ vẫn còn (đường "Thêm chi tiết") | Không mất chức năng: nhắc trước, cần mang, ghi chú, lặp âm lịch hằng tháng. |
| Hoàn tác thay cho hộp xác nhận ở thao tác nhẹ | Nhanh hơn, ít cắt ngang; hộp xác nhận chỉ giữ cho thao tác khó đảo ngược (xóa chuỗi, xóa gia đình). |
| "Chữ lớn" bằng rem + lớp `html.big`, nhớ ở localStorage, áp trong `<head>` | Không nhấp nháy bố cục; không phụ thuộc cài đặt hệ điều hành. |
| Mục "Nâng cao" gập (thiết bị, ICS, mốc nhắc) | Dùng hiếm nhưng không được mất; tab Gia đình ngắn đi một nửa. |

## 7. Những thứ bỏ đi

- Thẻ lớn cho từng ngày và mọi nút "+ Thêm sự kiện" lặp lại.
- Thanh màu dọc không giải thích (thay bằng avatar có chữ cái).
- Thẻ ca to có nhiều nút (thay bằng dòng + tờ chi tiết).
- Hàng Tuần/Tháng dạng thanh chia đôi trong tab Lịch.
- Đỏ rực cho ca chưa nhận ở mọi mức trễ (còn lại: dải vàng khi sắp tới giờ).
- Tab "Việc chung" riêng ở thanh dưới (vào qua Tiện ích hoặc Hôm nay).

## 8. Hiệu năng và bảo mật

- Không thêm thư viện, không phông chữ ngoài, không ảnh nặng; biểu tượng là SVG dựng bằng DOM API.
- CSP vẫn `style-src 'self'; script-src 'self'`: không style nội tuyến, không chèn HTML thô (`textContent`/DOM).
- Khung chờ đúng hình dạng nội dung; `F9.mount` giữ vị trí cuộn; bản nháp đang gõ không bị làm mới đè (cơ chế cũ giữ nguyên).
- Hiệu ứng (tờ dưới, thông báo, công tắc) tắt hẳn khi hệ thống bật "giảm chuyển động".

## 9. Kết quả đo (cùng dữ liệu mẫu bịa, 390x844)

Đo bằng `scripts/ux-shots.js`: chiều cao trang chia chiều cao màn hình (số màn hình phải cuộn qua để thấy hết nội dung).

| Màn | Trước | Sau |
|---|---|---|
| Lịch (cả tuần, 9 sự kiện) | 2,64 | 1,52 |
| Lịch ở 360x740 | 3,04 | 1,86 |
| Hôm nay | 3,09 | 1,67 (dữ liệu "sau" có thêm 3 ca buổi sáng đã xong, nên so sánh này chỉ mang tính tham khảo) |
| Đưa đón theo ngày | 1,79 | 1,11 |
| Gia đình | 3,71 | 2,45 |

Số chỗ "Thêm sự kiện" ở tab Lịch: trước 8 (7 thẻ ngày + 1 nút cuối), sau 1 (nút nổi "Thêm"); nút "Thêm" nhỏ chỉ xuất hiện ở ngày trống khi người dùng chủ động chọn "Hiện cả ngày trống".

Kiểm thử: `npm test` 108/108 (97 cũ + 11 mới cho bộ phân tích câu gõ nhanh); `npm run e2e` 56/56 bước, không có cảnh báo giao diện ở 320, 360, 390, 430, 1280 (sáng/tối, Chữ lớn): không tràn ngang, vùng chạm >= 44px, chữ >= 14px, tương phản AA, nhãn thanh dưới không bị cắt, không lỗi console.

### Cập nhật sau khi gộp các mô-đun (thực đơn, đi chợ, giọng nói, sức khỏe, tiền, 9id)

- `npm test` 214/214 (gồm test tích hợp với 9id thật). e2e: `e2e.js` 51/51 (9id thật), `e2e-id.js` 10/10, `e2e-menu.js` 94/94, `e2e-hm.js`, `e2e-journey.js` (3 vai, ảnh sáng/tối ở `shots/final/`), `e2e-cutover.js` (gia đình cũ -> 9id thật).
- Quyết định khi gộp: (1) một nút giọng nói duy nhất `F9.voiceButton` cho Đi chợ và Tiền, bốn trạng thái, kết quả luôn qua màn soát lại; (2) tài khoản `con` thấy đúng các ô Tiện ích mà máy chủ cho phép (không còn ô dẫn tới màn 403); (3) phiên ẩn danh cũ trong lúc cutover chỉ xem, có biểu ngữ và ẩn nút ghi; (4) cài đặt thông báo đẩy có thêm Sức khỏe và Tiền (trước đây lưu lại sẽ lặng lẽ tắt hai loại này); (5) "Tôi nhận" trên ca có người đón hộ ghi nhãn "người đón hộ" đúng người.
- Điểm vướng đã thấy khi tự trải nghiệm ở 390x844 và đã xử lý: ô gõ món đi chợ bị cắt gợi ý (rút gọn), lời nhắn tài khoản con ("Bấm Thêm") khi con không có nút Thêm, nhãn "(người đón hộ)" gắn nhầm người nhận ca.
- Còn lại (chủ ý): thanh tab hồ sơ sức khỏe có 5 mục nên "Tổng quan/Tăng trưởng/Tiêm chủng" xuống hai dòng ở 390px; nhập sự kiện bằng một câu cần bấm Enter hoặc "Điền sẵn" (có chip "Đã hiểu" để soát) chứ không tự điền khi đang gõ; chưa có nút giọng nói cho ghi nhanh sự kiện (chỉ Đi chợ và Tiền có).

Chưa kiểm chứng: điện thoại Android/iOS thật (mới thử bằng Chrome mô phỏng), bàn phím ảo thật, trình đọc màn hình (TalkBack/VoiceOver), vuốt ngang trên màn hình thật, nhập giọng nói (chỉ hiện nút khi trình duyệt hỗ trợ).
