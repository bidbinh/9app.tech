# 9interview

Luyện phỏng vấn, tạo CV và thư xin việc. Frontend tĩnh PWA (`public/`) + máy chủ Node 20 nhỏ (`src/`) chỉ để gọi Gemini.

- Chạy: `node src/server.js` (mặc định cổng 8098, `BASE_PATH=/interview`). Không cần cài gói nào.
- Không có `INTERVIEW_AI_KEY` thì phần AI tắt gọn; mọi phần khác vẫn dùng.
- Test: `npm test`. E2E trình duyệt: `node scripts/e2e.js` (puppeteer-core có sẵn, Chrome, tùy chọn pdf.js qua `PDFJS`); ảnh ở `shots/`.
- Triển khai: `cp .env.example .env`, điền khóa, `docker compose -f docker-compose.server.yml up -d --build`.
- Máy chủ không lưu nội dung người dùng, nhật ký chỉ ghi phương thức, đường dẫn, mã trạng thái, thời gian.

## Chạy sau nginx (bắt buộc đọc)
Đặt `TRUST_PROXY=1` trong `.env`. Máy chủ lấy IP từ phần tử CUỐI của `X-Forwarded-For`, nên nginx phải ghi đè header này bằng IP thật, tuyệt đối không dùng `$proxy_add_x_forwarded_for` (header do client gửi sẽ lọt vào và giả mạo được IP để lách hạn mức).

```nginx
# Khối mẫu (không nằm trong nginx/ của repo)
location /interview/ {
    proxy_pass http://9interview:8098;           # tên container trong mạng ops_tms-network
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 64k;
    proxy_read_timeout 75s;
}
```

## Hạn mức AI
- Mỗi IP: 8 lượt/phút, 60 lượt/ngày; mỗi phiên: 6 lượt/phút; toàn hệ thống: 3000 lượt/ngày. Ngày tính theo giờ Việt Nam (đổi lúc 0 giờ UTC+7).
- Chỉ yêu cầu hợp lệ mới trừ hạn mức. Yêu cầu hỏng (JSON sai, thiếu dữ liệu) chỉ tính vào trần riêng `INTERVIEW_BAD_PER_MIN` (mặc định 20/phút/IP).
- Một yêu cầu tính 1 lượt, kể cả khi máy chủ phải thử lại Gemini (tối đa 3 lần, tổng thời gian tối đa `INTERVIEW_AI_TOTAL_MS` = 60 giây).
