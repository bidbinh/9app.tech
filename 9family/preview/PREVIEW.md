# Bản xem thử giao diện mới của 9family

Bản này chạy HOÀN TOÀN trong trình duyệt, không cần backend, không gọi máy chủ nào, không đụng dữ liệu thật.
Dữ liệu mẫu là BỊA (gia đình "Nhà Cây Sồi", hai con Mía và Sóc, Anh Hùng, Bà Tư, Cô Hoa hàng xóm). Mọi thao tác (thêm sự kiện, nhận ca, tích việc...) chỉ lưu trong bộ nhớ của trang: tải lại là về như ban đầu.

Địa chỉ dự kiến: https://9app.tech/family-preview/

## Cách đưa lên (chỉ là tệp tĩnh)

nginx của 9app.tech phục vụ site tĩnh từ `root /var/www/certbot/9app;` và `location /` có `try_files $uri $uri/ /index.html`, nên chỉ cần chép thư mục này vào đó, không sửa cấu hình nginx:

```
# từ máy phát triển, trong thư mục 9family/
node scripts/build-preview.js            # dựng lại preview/ từ public/ (làm khi giao diện đổi)
scp -r preview/* <máy-chủ>:/var/www/certbot/9app/family-preview/
# bỏ PREVIEW.md nếu không muốn đưa lên: ssh <máy-chủ> rm /var/www/certbot/9app/family-preview/PREVIEW.md
```

Hoặc gói tar rồi giải nén trên máy chủ:

```
tar -C preview --exclude=PREVIEW.md -cf family-preview.tar .
# trên máy chủ:
mkdir -p /var/www/certbot/9app/family-preview && tar -C /var/www/certbot/9app/family-preview -xf family-preview.tar
```

Không cần khởi động lại nginx. Sau khi chép, mở `https://9app.tech/family-preview/` trên điện thoại.

## Gỡ bỏ
Xóa thư mục `/var/www/certbot/9app/family-preview/` là xong. Bản xem thử không để lại gì trên máy chủ hay trong trình duyệt (chỉ có tùy chọn "Chữ lớn" lưu trong localStorage của chính trang này).

## Xem thử những gì
- Hôm nay: dòng thời gian có mốc "Bây giờ"; ca đón sắp tới giờ mà chưa ai nhận hiện thành dải nhắc màu vàng với nút "Tôi nhận". Thử bấm "Tôi nhận" rồi "Đang đi" rồi "Đã đón".
- Lịch: chạm ngày trong dải tuần, vuốt ngang đổi tuần, chip lọc theo con, "Xem tháng", "Hiện cả ngày trống".
- Nút "+ Thêm": chọn Sự kiện rồi thử gõ "Piano thứ 7 9:30 Mía" và bấm "Điền sẵn".
- Đưa đón: theo ngày, lịch tuần, lịch sử; chạm một ca để Đổi người, Bỏ qua.
- Tiện ích: Việc chung, Đi chợ (nhóm theo khu quầy), các mục sắp ra mắt và Osin.
- Gia đình: bật "Chữ lớn", xem thành viên, hồ sơ con, các chỗ dành cho "Lời mời" và "Chuyển gia đình".

Không có trong bản xem thử: đăng nhập/mời/ghép thiết bị thật, thông báo đẩy, đọc ảnh thời khóa biểu bằng AI, tạo gia đình mới (các thao tác này báo "không có trong bản xem thử").
