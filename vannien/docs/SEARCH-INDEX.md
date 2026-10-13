# Chỉ mục tìm kiếm chức năng của Vạn Niên

Tệp công khai: `/vannien/search-index.json` (tức `vannien/search-index.json`). Launcher có thể tải tệp này để tìm theo chức năng của Vạn Niên, ví dụ gõ "văn khấn" ra "Vạn Niên › Văn khấn".

## Định dạng

Một mảng JSON, mỗi phần tử là một chức năng:

```json
{
  "name": "Văn khấn: Cúng giỗ người thân",
  "keywords": ["cúng giỗ người thân", "cung gio nguoi than", "giỗ", "gio", "ngày giỗ", "ngay gio"],
  "path": "#/van-khan/gio",
  "blurb": "Lễ cúng ngày mất hằng năm (kỵ nhật) cho ông bà, cha mẹ. Tự tính ngày giỗ theo âm lịch."
}
```

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `name` | chuỗi | Tên hiển thị. Chức năng con có dạng `Nhóm: Tên` (Văn khấn, Mâm cúng, Công thức). |
| `keywords` | mảng chuỗi | Từ khóa chữ thường. Mỗi từ khóa có dấu luôn kèm một bản không dấu (bỏ dấu, `đ` thành `d`). Không trùng nhau. |
| `path` | chuỗi | Đường dẫn hash bên trong Vạn Niên, luôn bắt đầu bằng `#/`, không có tham số truy vấn. |
| `blurb` | chuỗi | Một câu mô tả ngắn để hiển thị dưới tên. |

Chỉ có bốn trường này. Mọi `path` là duy nhất.

## Cách mở

Địa chỉ đầy đủ = địa chỉ ứng dụng + `path`, ví dụ `https://9app.tech/vannien/#/van-khan/gio`. Mở thẳng vào đúng màn hình, nút Back hoạt động.

Các đường dẫn hiện có:

| Đường dẫn | Màn hình |
|---|---|
| `#/hom-nay`, `#/lich`, `#/xem-ngay`, `#/phong-thuy` | Bốn tab cũ của Vạn Niên |
| `#/van-khan` | Danh sách văn khấn |
| `#/van-khan/<id>` | Một bài khấn, ví dụ `ram-mung-1`, `gio`, `tan-gia` |
| `#/mam-cung` | Danh sách mâm cúng, Mâm của tôi, công thức |
| `#/mam-cung/<id>` | Một mâm cúng, ví dụ `co-gio`, `cung-tet-bac` |
| `#/mam-cung/ngu-qua` | Mâm ngũ quả ba miền |
| `#/mam-cung/cong-thuc/<id>` | Một công thức, ví dụ `banh-chung` |
| `#/ve-noi-dung` | Minh bạch nội dung, nguồn tham khảo |

Tham số truy vấn tùy chọn mà trang hiểu (không cần đưa vào chỉ mục): `?d=YYYY-MM-DD` (ngày cúng), `?doc=1` (chế độ đọc chữ to), `?n=` và `?m=` (số người, số mâm), `?r=bac|trung|nam` (miền ngũ quả).

## Gợi ý khớp phía launcher

1. Chuẩn hóa chuỗi gõ vào: chữ thường, bỏ dấu (`đ` thành `d`), cắt khoảng trắng thừa.
2. Một chức năng khớp khi mọi từ của chuỗi gõ xuất hiện trong một từ khóa, hoặc trong `name` đã bỏ dấu.
3. Xếp trước: khớp đúng cả cụm từ khóa, rồi khớp đầu từ, rồi khớp phần giữa. Mục gốc (`Văn khấn`, `Mâm cúng`) nên đứng trước các mục con.
4. Hiển thị `Vạn Niên › name` và `blurb`.

Đoạn mẫu:

```js
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const words = fold(query).split(/\s+/).filter(Boolean)
const hits = index.filter((e) => words.every((w) => e.keywords.some((k) => k.includes(w)) || fold(e.name).includes(w)))
```

## Sinh lại và kiểm tra

Tệp được sinh từ dữ liệu, không sửa tay:

```
node scripts/build-search-index.mjs          # ghi lại search-index.json
node scripts/build-search-index.mjs --check  # chỉ kiểm tra có khớp dữ liệu không
node --test test/                            # kiểm tra id duy nhất, path có thật, đủ trường, khớp dữ liệu
```

Khi thêm bài khấn hoặc mâm cúng mới vào `mod/data/*.json`, chạy lại lệnh đầu. Từ khóa bổ sung cho từng bài nằm ở `KEYWORDS_VK`, `KEYWORDS_MC` trong `scripts/build-search-index.mjs`.
