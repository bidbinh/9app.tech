# 9app Console

Màn hình quản trị dùng chung cho các app của 9app.tech (dành cho máy tính): tổng quan, **dòng tiền chung**, **người dùng chung**, và trang quản trị riêng của từng app.
Console không đọc CSDL của app nào: mỗi app mở một API quản trị chuẩn (xem `docs/ADMIN-API.md`), ký HMAC.

## Chạy trên máy
    docker compose -f ../9ship/docker-compose.demo.yml up -d      # Postgres :5440
    # tạo CSDL: CREATE DATABASE console
    npm i && CONSOLE_ADMIN_PASSWORD=... npm run admin:create -- ten-dang-nhap   # in bí mật TOTP
    CONSOLE_APPS='[...]' npm start      # http://localhost:8199/admin/
    npm test

## Triển khai (máy chủ chung)
1. Trong container `9ship-db`: tạo vai trò `console` + CSDL `console`.
2. `.env` từ `.env.example`; `docker compose -f docker-compose.server.yml up -d --build`.
3. Tạo quản trị: `docker exec -e CONSOLE_ADMIN_PASSWORD=... 9admin node scripts/create-admin.js <tên>`.
4. nginx: `location /admin/ { proxy_pass http://9admin:8199; }` (chỉ HTTPS, không sub_filter), và **chặn** `/9ship/admin-api/` từ ngoài.

Thêm app mới: app triển khai API quản trị, đặt khóa/bí mật, rồi khai báo trong "Kết nối ứng dụng" (host phải nằm trong `CONSOLE_ALLOWED_HOSTS`).
