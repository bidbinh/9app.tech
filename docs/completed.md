# 9app Life OS — đã xong phần lõi (local-first)

Ngày: 2026-09-19

## Làm gì

Hub 9app.tech từ catalog app thành Life OS trên máy: Hôm nay, giấy tờ, nhà, xe, chăm sóc, thợ, khoản phải trả. Không dựng auth/server mới. 9Fin / 9speed / 9pick / 9quy / Gia phả / 9log / Vạn Niên không bị viết lại.

## File

- `docs/9app-life-os-plan.md`
- `js/catalog.js` `js/graph.js` `js/engine.js` `js/os.js`
- `css/os.css` `index.html`
- `icons/{vault,house,care,move,local}.svg`
- `tests/life-os.test.mjs` — `npm test` đạt

## Kiểm tra

- Graph lưu IndexedDB + fallback localStorage
- Xác nhận giấy đăng kiểm → tạo xe + việc Hôm nay
- Hoá đơn đồ → tài sản + giao dịch
- Gợi ý không hiện app đã mở
- 9log không mặc định trang chủ
- 9Today không phải ô launcher
