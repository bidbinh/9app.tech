# 9ticket

Trợ lý chuyến đi: gom vé máy bay, tàu, xe khách; nhắc giờ ra sân bay/ga/bến; vé chữ lớn dùng khi không có mạng; xuất .ics; chia tiền nhóm. Webapp tĩnh PWA, dữ liệu lưu trên máy, không đăng nhập, không bán vé.

Thiết kế: `../docs/superpowers/specs/2026-10-12-9ticket-design.md`. Kế hoạch: `../docs/superpowers/plans/2026-10-12-9ticket-implementation.md`.

## Chạy

```
npm test         # node:test: time, model, store, airport, split, ics, parse, status, vỏ trang
npm run serve    # http://127.0.0.1:8080/
npm run e2e      # Chrome thật (puppeteer-core), ảnh vào shots/
```

Cần Chrome (`CHROME_PATH`) và puppeteer-core (`PUPPETEER_CORE`, đường dẫn module ESM) cho e2e và `scripts/make-icons.mjs`. Repo không cài sẵn puppeteer-core.

## Nối nguồn dữ liệu thật

Trạng thái chuyến đi qua một điểm duy nhất: `js/status.js` (`setSource`). Hiện chỉ có dữ liệu mẫu cho chuyến `mau-*`; chuyến thật hiện "Chưa có thông tin". Nối Datacom Master API (vé bay) tại đây; xem `../docs/BACKLOG.md` mục 9ticket để biết điều chưa rõ cần hỏi Datacom.

## Chưa làm

Tìm và đặt vé, thanh toán, tài khoản 9id và đồng bộ, thông báo đẩy, chụp ảnh vé, sân bay đi/đến, hành khách gia đình, đăng ký launcher/Console, deploy.
