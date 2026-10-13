# 9app Life OS — kế hoạch triển khai

## Kiến trúc hiện tại

- **Frontend:** HTML + CSS + JavaScript cổ điển (không ES module trên production). Lý do: WebView ô tô / Android cũ.
- **Backend hub:** không có. `server.js` chỉ static file + proxy `/9fin/` `/9pick/` `/9quy/` `/speed/`.
- **Hosting:** nginx static `/home/tms/ops/certbot/www/9app/`.
- **Auth:** không có trên hub. Cá nhân hóa `localStorage` khóa `9app.prefs`.
- **Database / ORM:** không có trên hub. 9Fin riêng (FastAPI + SQLite `9fin.db`). 9quy/9pick/9log là app độc lập.
- **AI/OCR:** chưa có trên hub.
- **App đang chạy (không được phá):** 9speed, 9Fin, 9pick, 9quy, Gia phả, 9log, Vạn Niên, homebar.

## Vấn đề hiện tại

Hub là catalog app, không có Life Graph, không có việc hôm nay, không có giấy tờ/tài sản/xe/chăm sóc dùng chung. Ba mục Gần đây / Gợi ý / Của tôi trùng app.

## Kiến trúc đích (chọn vì khớp codebase)

**Local-first Life OS** trên chính 9app.tech:

- Giữ vanilla JS + static nginx. Không dựng auth/server mới song song với 9Fin.
- Life Graph: IndexedDB, fallback `localStorage`. Query được theo store, không nhồi 1 blob nghiệp vụ.
- Identity mặc định: user `local`, household `hh-local` trên máy này (đúng “không cần đăng nhập”).
- 9Fin production giữ nguyên; Life Graph lưu recurring/transaction local để 9Today hoạt động khi chưa mở sổ 9Fin.
- Vertical app (9speed, 9pick, Gia phả…) chỉ vào catalog + usage.

Nâng cấp cloud sync / household đa thiết bị = phase sau, cần credential.

## Store / “migration”

Schema `Graph.SCHEMA` (số nguyên). Mở graph chạy `migrate(from → to)` additive.

Stores: `meta`, `people`, `properties`, `rooms`, `assets`, `vehicles`, `documents`, `transactions`, `obligations`, `appointments`, `medications`, `providers`, `requests`, `bookings`, `lifeEvents`, `notifications`, `appUsage`, `dismissals`, `audit`.

## Phase

0. Audit (file này)  
1. Catalog + usage + shell + library + quick-add  
2. Graph + LifeEvent + notification  
3. 9Today  
4–9. Vault, Home, Fin-local, Move, Care, Local  
10. Recommendation (loại app đã từng mở)  
11. Cross-app automation  
12. Test / a11y / empty states  
13. Production static deploy (không migration SQL)

## Sửa

`index.html`, `css/style.css`, `js/apps.js` → catalog, bỏ `launcher.js` khỏi trang chủ (giữ file cũ, không load).

## Tạo mới

`js/catalog.js` `js/graph.js` `js/engine.js` `js/os.js` `css/os.css` `tests/` `icons/{vault,house,care,move,local}.svg`
