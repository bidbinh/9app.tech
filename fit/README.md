# 9fit

Tập bổ trợ cho môn bạn chơi (cầu lông, pickleball, bóng đá, chạy bộ) kèm nhật ký buổi tập. Webapp tĩnh PWA tại `/fit/`: HTML/CSS/JS thuần (ES module), không build, không backend, chạy ngoại tuyến. Dữ liệu người dùng chỉ nằm trên máy (IndexedDB), có xuất/nhập JSON và xóa sạch.

## Chạy
- `npm test`: kiểm thử phần thuần và dữ liệu (node --test).
- `npm run e2e`: kiểm thử trình duyệt thật (puppeteer-core, Chrome), ảnh vào `shots/`.
- `npm run index` sinh `search-index.json` (định dạng `vannien/docs/SEARCH-INDEX.md`); `npm run sw` sinh `sw.js` (đổi phiên bản: `node scripts/make-sw.js v2`); `npm run icons` dựng PNG từ SVG.

## Cấu trúc
- `js/data/`: 149 bài tập (`ex-*.js`), 9 chương trình (`programs.js`), chuỗi khởi động (`routines.js`), nguồn chỉ mục (`functions.js`).
- `js/lib/`: `calc.js` (khối lượng, sRPE/tải, gợi ý tăng tạ, PR, lịch chương trình, .ics), `parq.js`, `routine.js`, `db.js`, `store.js`.
- `js/screens/`, `js/ui/`: giao diện; sơ đồ cơ thể và biểu đồ là SVG tự vẽ.

## Nội dung và bản quyền
Toàn bộ bài tập, chương trình, sơ đồ do 9app tự viết, tự vẽ; không dùng ảnh/video bên ngoài. Có thể bổ sung video tự quay sau (thêm trường video vào bài, không cần đổi kiến trúc).

## Nguồn kiến thức tham khảo
ACSM Guidelines (ấn bản 11), NSCA Essentials, WHO Physical Activity Guidelines 2020, PAR-Q+, FIFA 11+ (Soligard 2008) và tổng quan Nordic hamstring, Foster 2001 (session-RPE), Gabbett 2016 (acute:chronic workload), Cooper 1968, CDC STEADI. Chưa tra cứu lại trực tiếp từng tài liệu và chưa có chuyên gia y học thể thao duyệt.

## An toàn
Không phải tư vấn y tế. Sàng lọc là PAR-Q rút gọn tự diễn đạt (không phải bản chính thức), 3 mức: được phép, nên hỏi bác sĩ (chỉ tập nhẹ, không bài khó/bật nhảy/kiểm tra tối đa), dừng lại (không chương trình, không mở màn ghi buổi, kế hoạch cũ bị khóa; vẫn xem thư viện). Không có lời khuyên ăn uống, thực phẩm chức năng, thuốc. Gợi ý tăng tạ (tối đa 10%) và cảnh báo tải chỉ là quy tắc đơn giản.

## Chừa chỗ cho sau này (chưa làm)
- **Đồng bộ qua tài khoản 9app** (đã làm, tùy chọn): Tùy chọn, mặc định tắt: thẻ "Đồng bộ qua tài khoản 9app" ở màn Dữ liệu của tôi (cần đăng nhập 9id, có màn đồng ý rõ ràng). Đồng bộ `buoi`, `choi`, `dodac`, `muctieu`, `test`. Không đồng bộ: sàng lọc sức khỏe (`sangloc`), chương trình đang theo (`kehoach`, phụ thuộc kết quả sàng lọc ở máy), `caidat`, `nhap`. Gộp ba chiều theo bản ghi (`id`) ở máy, máy chủ chỉ lưu một tài liệu JSON có số phiên bản (`/id/api/sync/fit` của 9id). Tự đồng bộ khi mở app và khi quay lại tab. Thư viện `js/lib/nine-sync.js`, `nine-sync-ui.js` chép từ `9id/public/` (đừng sửa tại chỗ). Spec: `docs/superpowers/specs/2026-10-14-dong-bo-9id-design.md`. Cần thêm `fit` vào `SYNC_APPS` của 9id (mặc định đã có) và nginx phục vụ 9id cùng tên miền (`/id/`).
- Nối 9Sport: `choi` (môn, phút, RPE) là chỗ nhận buổi chơi.
- AI tạo/điều chỉnh chương trình; video tự quay; ảnh tiến độ riêng tư.
