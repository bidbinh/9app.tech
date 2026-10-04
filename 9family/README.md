# 9family

Lịch học của con, điều phối đưa đón có nhắc leo thang, ngày quan trọng (dương và âm lịch), việc chung và mua sắm cho cả nhà. Web app (PWA) mở bằng link, không mật khẩu: danh tính là phiên trên thiết bị, mời người thân bằng link dùng một lần.

Thiết kế: `../docs/superpowers/specs/2026-10-04-9family-design.md`.

## Chạy cục bộ

Cần Node 20+. Không có `DATABASE_URL` thì các lệnh dưới tự dựng PostgreSQL nhúng.

```
npm install
npm run dev      # http://localhost:8096/9family/  (dữ liệu ở .data/)
npm test         # node:test trên PostgreSQL thật
npm run e2e      # Chrome thật (puppeteer-core), nhiều phiên, ảnh chụp vào shots/
npm run vapid    # sinh cặp khóa VAPID cho Web Push
```

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8096` | cổng |
| `BASE_PATH` | `/9family` | đường dẫn gốc sau nginx |
| `DATABASE_URL` | `postgres://postgres:ship@localhost:5440/family` | PostgreSQL |
| `NODE_ENV` | | `production` bật cờ Secure cho cookie `fsid` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | trống | Web Push; thiếu khóa thì tắt đẩy (thông báo trong app vẫn chạy). Sinh bằng `npm run vapid` |
| `FAMILY_AI_KEY` | trống | khóa Gemini để đọc ảnh thời khóa biểu; trống thì ẩn tính năng |
| `FAMILY_AI_MODEL` | `gemini-flash-latest` | model |
| `CONSOLE_API_KEY_ID`, `CONSOLE_API_SECRET` | trống | API cho 9app Console (trống thì 404) |

Khác: `RATE_LIMIT_PER_MIN`, `SESSION_LIMIT_PER_MIN`, `SCHEDULER_EVERY_MS` (20000). Di cư CSDL tự chạy khi khởi động (`db/*.sql`). Bộ lập lịch chạy trong tiến trình, an toàn khi chạy hai bản.

## Ghi chú vận hành
- nginx phải đặt `X-Forwarded-For = $remote_addr`, `X-Forwarded-Host`, `X-Forwarded-Proto`.
- `sw.js` phục vụ ở `/9family/sw.js` (Service Worker chỉ nhận push).
- Nhật ký không ghi tên con, nội dung sự kiện, ghi chú; ảnh thời khóa biểu không lưu.
