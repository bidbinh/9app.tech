# Thiết kế lại trang chủ 9app theo mẫu (launcher-ux2)

Bản làm việc: `D:\9app.tech\launcher-ux2\` (sao từ máy chủ ngày 2026-10-05, chỉ đọc, chưa ghi gì lên máy chủ). Bản gốc để so: `orig/`. Ảnh: `shots/before/`, `shots/after/`. Mẫu: `C:\Users\admin\.claude\uploads\68e078a8-...\28ffca3e-image.png`.

## 1. Ánh xạ mẫu thành thành phần thật

| Mẫu | Thực hiện | Khác mẫu và lý do |
|---|---|---|
| Đầu trang: logo 9app, ô tìm, chuông chấm đỏ, avatar TB | Logo `mark.svg` + chữ "app", ô tìm "Tìm app, dịch vụ…" (vẫn là tìm chức năng, `NineSearch`), chuông, avatar | Chuông KHÔNG có chấm đỏ vì chưa có hệ thống thông báo thật (móc `window.NINE_NOTICES`: có phần tử mới hiện chấm). Avatar là biểu tượng người, không phải chữ "TB" cứng (không có tài khoản). Dưới 420 px ẩn avatar để ô tìm đủ rộng (Tài khoản vẫn có ở thanh dưới). |
| Hero cuộn, chấm trang, nút "Gửi ngay →", hình bên phải | 5 banner theo cấu hình (`BANNERS`), vuốt ngang, tự chạy 5,5 s, tạm dừng khi chạm/rê chuột/focus/ẩn tab, không tự chạy khi `prefers-reduced-motion`. Hình SVG tự vẽ | Mẫu dùng logo VNPost, Viettel Post, GHN, J&T, SPX, GHTK: KHÔNG dùng (nhãn hiệu bên thứ ba). Thay bằng hộp hàng, thẻ "vị trí", "đã giao", "giá" tự vẽ. |
| 4 lối tắt: Quét QR, Ví & Thanh toán, Lịch sử, Tất cả dịch vụ | Quét tài liệu (mở 9scanner), Ví 9Ship (`9ship/#/me`), Lịch sử (Yêu thích > Gần đây), Tất cả dịch vụ (thư viện) | Chưa có chức năng quét QR thật nên KHÔNG làm nút giả. Thay bằng "Quét tài liệu" vì 9scanner quét bằng camera thật. "Ví & Thanh toán" thành "Ví 9Ship" vì chỉ 9Ship có ví (đường dẫn `#/me` có trong chỉ mục tìm kiếm). Nếu app đích bị gỡ khỏi `apps.js`, ô đó tự thành "Tìm chức năng" (focus ô tìm). |
| Nổi bật cho bạn: 3 thẻ pastel | 3 đến 6 thẻ, cuộn ngang, chọn theo hành vi: đã ghim, rồi dùng nhiều, rồi mặc định (9Ship, 9family, 9hire), rồi app chưa dùng | Thẻ bố cục dọc (icon trên, tên, mô tả 2 dòng) thay vì ngang: ở 390 px thẻ ngang không đủ chỗ cho mô tả. |
| Nhóm ứng dụng: lưới 2 cột, 3 icon, chevron mở rộng | 5 nhóm, mỗi app đúng một nhóm. Chevron mở rộng thẻ ra cả hàng, hiện mọi app của nhóm | Bỏ ô "Thêm" trống và bỏ lặp app giữa các nhóm (lỗi của mẫu). Nhóm chỉ có đến 3 app thì không có chevron (không có gì để mở). Thẻ nhóm chỉ hiện app trên trang chủ (app đã ẩn không hiện). |
| Gợi ý cho bạn: carousel banner ảnh | Carousel thẻ nhỏ, nền theo màu nhóm, icon app lớn nghiêng + vòng tròn trang trí (CSS) + tiêu đề + nhãn app. Chỉ app CHƯA dùng, chưa bị ẩn, không trùng "Nổi bật". Nút "Ẩn" và "Xem tất cả" | Mẫu dùng ảnh xe, kiện hàng thật (ảnh stock): không dùng. |
| Thanh dưới 5 mục, "Tất cả" tròn nổi giữa | Trang chủ, Khám phá, Tất cả (nút tròn nổi), Yêu thích, Tài khoản; mỗi mục là một màn có thật | Giữ chuông riêng ở đầu trang để mở Thông báo. |

## 2. Sơ đồ thông tin

```
Trang chủ  (#/)           Hero, Lối tắt, Nổi bật, Nhóm ứng dụng, Gợi ý (ẩn được)
Khám phá   (#/kham-pha)   Bạn muốn làm gì? (8 gợi ý tìm chức năng thật), Mới trên 9app,
                          Chưa thử (lọc theo nhóm), Hỏi Osin (sắp ra mắt, chỉ xem trước)
Tất cả     (#/tat-ca)     ô lọc, [Theo nhóm | A-Z], chip: Tất cả, 5 nhóm, Đã ghim, Đã ẩn,
                          hàng app (Thêm / ...), Sắp ra mắt ở cuối
Yêu thích  (#/yeu-thich)  Đã ghim, Gần đây (10 app, thời gian, số lần mở)
Tài khoản  (#/tai-khoan)  ghi chú, Ứng dụng đã ẩn, Hiện lại gợi ý, Xóa lịch sử gần đây
Thông báo  (#/thong-bao)  trạng thái trống (chuông)
Tìm kiếm: gõ ở ô đầu trang, từ màn nào cũng về Trang chủ và hiện Chức năng + Ứng dụng
```
Điều hướng dùng hash nên nút Back của trình duyệt chạy đúng; liên kết app (`9ship/#/orders`...) không bị ảnh hưởng.

## 3. Wireframe 390 px

```
+--------------------------------+
| [9]app [Tim app, dich vu...] 🔔|
| +-- HERO ----------------------+|
| | [9Ship]                      ||
| | Gui hang sieu de   +-hinh-+  ||
| | Gia tot nhat       | hop  |  ||
| | So sanh cuoc...    +------+  ||
| | [Gui ngay ->]     ==  . . .  ||
| +------------------------------+|
| | (Quet) (Vi) (Lich su) (Tat ca)||
| Noi bat cho ban    Xem tat ca > |
| [9Ship >][9family >][9hire...-> |
| Nhom ung dung      Xem tat ca > |
| +-Di chuyen..--+ +-Gia dinh.. v+|
| | mo ta        | | mo ta       ||
| |[ic][ic][ic]  | |[ic][ic][ic] ||
| +--------------+ +-------------+|
| ... 3 hang the nhom ...         |
| Goi y cho ban   An  Xem tat ca >|
| [the banner][the banner] ->     |
| Trang chu Kham pha (O) Yeu thich Tai khoan |
+--------------------------------+
```

## 4. Nhóm và app (mỗi app đúng một nhóm)

| Nhóm | Màu | App |
|---|---|---|
| Di chuyển & Giao nhận | cam | 9Ship, 9speed, 9log (9log mặc định `home:false`, chỉ hiện sau khi thêm) |
| Gia đình & Đời sống | xanh lá | 9family, Hội phụ huynh, Vạn Niên, Gia phả, 9swap, 9lunch |
| Tài chính & Tiện ích | tím | 9Fin, 9unit |
| Công việc & Học tập | xanh dương | 9hire, 9interview, 9english, 9license, 9scanner (9tutor khi có) |
| Giải trí & Thể thao | hồng | 9Sport, 9race |
| Công cụ khác | vàng | app chưa được xếp (chỉ hiện khi có) |

Ánh xạ nằm ở `js/home-config.js`: `app.group` (nếu có) > `GROUP_OF[id]` > `CAT_TO_GROUP[category]` > nhóm `other`. `js/apps.js` KHÔNG phải sửa: app mới chỉ cần khai `category` như trước và rơi vào nhóm gần nhất; muốn nhóm khác thì thêm `group` hoặc một dòng ở `GROUP_OF`.

## 5. Quyết định chính

- Không lặp: "Nhóm ứng dụng" duyệt qua từng app một lần; Hero, Nổi bật, Gợi ý là chỗ quảng bá nên được trùng. "Gợi ý" loại thêm các app đã có ở "Nổi bật".
- Người mới: Nổi bật mặc định 9Ship, 9family, 9hire; Gợi ý theo `SUGGEST_PRIORITY`. Người cũ: Nổi bật = ghim + dùng nhiều; Gợi ý chỉ app chưa dùng.
- Khóa lưu giữ nguyên: `9app.prefs`, `9app.fnuse`, `9app.ui`. Không đổi định dạng.
- Tìm chức năng, `#fn-wrap`, menu giữ lâu/ghim/ẩn, deep link, cờ `ready`/`home`/`category` giữ nguyên hành vi. Gõ khi đang ở màn khác tự về Trang chủ.
- ES5: không `let/const`, mũi tên, template, module. SVG tự vẽ, không thư viện, không ảnh ngoài.
- Lỗi sẵn có tìm thấy khi kiểm và đã sửa: toast "Đã ghim..." che nút "Ẩn khỏi trang chủ" của menu giữ lâu (z-index); nay toast nằm dưới menu và không bắt chạm.
- Đánh đổi: trang dài hơn bản trước (1,0 thành 1,74 màn ở 390x844) vì thêm Hero và Nhóm theo đúng mẫu; Hero, lối tắt, Nổi bật vẫn nằm trong màn đầu.
