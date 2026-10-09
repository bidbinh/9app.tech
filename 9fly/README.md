# 9fly

Ứng dụng theo dõi chuyến, tìm vé và làm thủ tục trên cổng 9app. Vé và làm thủ tục dùng dữ liệu mẫu. Bảng chuyến của SGN, HAN, DAD, CXR và PQC có thể đọc nguồn thử nghiệm từ trang ACV.

## Nguồn ACV là thử nghiệm

`GET /9fly/api/board` gọi phía máy chủ tới `POST https://acv.vn/api/proxy` với đường dẫn cố định `/api/flights/search`. Đây là endpoint trên trang [acv.vn](https://acv.vn/vi/chuyen-bay), **không được ACV công bố tài liệu và không được cấp phép để dùng cho sản phẩm**. Đừng đưa nguồn này vào vận hành.

Máy chủ chỉ nhận `airport` thuộc SGN, HAN, DAD, CXR, PQC, tự lấy ngày theo giờ Việt Nam, và không chuyển tiếp URL hay nội dung tùy ý. Kết quả được nhớ ít nhất 60 giây. Mỗi chiều lấy tối đa hai trang, 20 chuyến mỗi trang. Trình duyệt làm mới bảng mỗi 2 phút.

Ứng dụng chỉ hiện các mục hành khách thấy trên bảng: số hiệu, đường bay, giờ đi (`gioKhoiHanh`), giờ đến (`gioHaCanh`), nhà ga, cửa, băng chuyền và chữ trạng thái ACV công bố. Giờ đó không phải giờ dự kiến hay giờ thực tế. Nếu ACV lỗi hoặc quá 8 giây, bảng chuyển sang **lịch mẫu** và giao diện ghi rõ đó là dữ liệu mẫu.

## Chạy bản demo có máy chủ

```bash
cd 9fly && npm install && npm run build
cd .. && npm start
```

Mở http://localhost:9090/9fly/

Cờ nhà cung cấp, đặt trước `npm start`:

| Biến | Ý nghĩa |
| --- | --- |
| `NINEFLY_BOARD_PROVIDER=acv` | Mặc định. Bảng ACV thử nghiệm; lỗi thì lịch mẫu. |
| `NINEFLY_BOARD_PROVIDER=sample` | Luôn lịch mẫu, không gọi mạng. |
| `NINEFLY_BOARD_PROVIDER=aerodatabox` | Lịch AeroDataBox nếu có `AERODATABOX_API_KEY` hoặc `RAPIDAPI_KEY`. Thiếu khóa hoặc lỗi thì lịch mẫu. |

`npm run dev` trong `9fly` chỉ phục vụ giao diện. Không có `/9fly/api/board` nên bảng hiển thị lịch mẫu.

## Bản công khai

Cùng mã nguồn này có `api/board.js`. Hàm đó gọi `resolveBoard` trong `lib/board.mjs`, giống `server.js`, nên bảng không rơi về lịch mẫu chỉ vì trang được host tĩnh.

Môi trường này chưa đăng nhập Vercel. Lệnh sau tạo một URL ẩn danh (hết hạn sau khoảng 60 phút):

```bash
npx vercel deploy --temporary --yes --project 9fly
```

Bản vừa tạo: https://temporary-racing-mauve-d00mz4e.vercel.app/9fly/

Để giữ một địa chỉ lâu dài:

```bash
npx vercel login
npx vercel deploy --prod --yes --project 9fly
```
