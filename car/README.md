# 9car - Sổ tay xe ô tô và xe máy

Webapp tĩnh PWA thuần ES module, chạy tại `/car/`, hoạt động ngoại tuyến. **Dữ liệu chỉ nằm trên máy người dùng** (IndexedDB). Không máy chủ, không theo dõi, không bán bảo hiểm, không tư vấn pháp lý/bảo hiểm/tài chính.

## Tính năng
- Hồ sơ nhiều xe (ô tô, xe máy, xe điện): biển số, hãng/dòng, năm sản xuất, nhiên liệu, ngày đăng ký, số km, ảnh nén trên máy.
- Nhắc hạn xanh/vàng/đỏ (có hình và chữ, không chỉ màu): đăng kiểm / kiểm định khí thải xe máy (chu kỳ theo `docs/NGUON.md`), bảo hiểm TNDS và vật chất, phí đường bộ, GPLX, trả góp, bảo dưỡng theo ngày hoặc km (cái nào đến trước), mẫu bảo dưỡng theo loại xe chỉnh được. Xuất `.ics` có VALARM trước 30/7/1 ngày.
- Nhật ký đổ xăng/sạc/bảo dưỡng/sửa chữa/gửi xe/cầu đường/rửa xe; mức tiêu hao (lít hoặc kWh/100 km, phương pháp đổ đầy - đổ đầy), chi phí/km, biểu đồ SVG tự vẽ theo tháng và hạng mục, tổng chi phí sở hữu.
- Ghi nhanh bằng câu gõ hoặc giọng nói ("đổ xăng 300k 8 lít"), luôn có bước soát; **không lưu nguyên câu**.
- Sạc xe điện (9charge): buổi sạc, so chi phí/km với xăng bằng giá do người dùng nhập (có ghi ngày cập nhật, không có giá bịa sẵn), nút mở Google Maps tìm trạm sạc (không có bản đồ trạm).
- Tiện ích: chỉ dẫn tra phạt nguội (liên kết chính thức + 9speed, không cào dữ liệu), checklist đi xa, hướng dẫn sự cố/cứu hộ (113, 114, 115), lưu ý bảo hiểm, biên bản giao xe khi bán (in/PDF, không lưu thông tin hai bên).
- Dữ liệu của tôi: sao lưu/nhập JSON (kiểm tra và làm sạch khi nhập), xóa sạch, chữ lớn, sáng/tối.

## Cấu trúc
```
index.html  manifest.webmanifest  sw.js  search-index.json
css/style.css
js/app.js                 bộ định tuyến hash, thanh dưới 5 mục
js/lib/                   thuần hàm, kiểm thử bằng node: dates money rules fuel schedule ics parse | db data (IndexedDB)
js/ui/                    dom chart voice formnk common lich caidat
js/screens/               home xe hen nhatky chiphi sac tienich them
docs/NGUON.md             nguồn quy định, ngày tra cứu, mức xác minh
test/  scripts/e2e.js  scripts/make-icons.js
```
Hash route: `#/` Hôm nay, `#/xe`, `#/xe/<id>`, `#/nhat-ky`, `#/chi-phi`, `#/them`, `#/sac`, `#/phat-nguoi`, `#/checklist`, `#/tai-nan`, `#/bao-hiem`, `#/ban-xe`, `#/du-lieu`, `#/nguon`.

## Chạy, kiểm thử
```
node --test test/                 # 68 test đơn vị
node scripts/e2e.js               # Chrome thật (puppeteer-core), cổng ngẫu nhiên >= 23000, ảnh ở shots/
ONLY=xemay,giadinh SKIP_SWEEP=1 node scripts/e2e.js   # chạy riêng kịch bản
```
Phục vụ tĩnh bất kỳ (ví dụ `npx serve .`); service worker cần http(s).

## Bảo mật
CSP chặt: `default-src 'none'; script-src 'self'; style-src 'self'` (không `unsafe-inline`; style động gán qua CSSOM). Dữ liệu người dùng không bao giờ đi vào `innerHTML`. Nhập JSON được lọc từng trường.

## Chừa chỗ đồng bộ 9id
Dữ liệu là 3 tập (`xe`, `nhatKy`, `hen`) + `meta`, mỗi bản ghi có `id` chuỗi duy nhất và tệp xuất có `phienBan`. Khi có 9id: thêm trường `capNhat` (ISO) cho mỗi bản ghi, gộp theo `id` + bản mới hơn thắng, và thay `js/lib/db.js`/`data.js#nhap` bằng bộ đồng bộ; giao diện không phải đổi. Mã hóa đầu cuối nên làm trước khi đẩy lên (biển số và ảnh là dữ liệu nhạy cảm).

## Hạn chế đã biết
- Nhắc "trong app" chỉ hiện khi mở app (không có push). Nhắc đẩy qua tệp `.ics` của lịch điện thoại.
- Nhận giọng nói dùng dịch vụ của trình duyệt (Chrome cần mạng); không có thì gõ câu.
- Chu kỳ đăng kiểm xe tải/cải tạo chưa xác minh: xem `docs/NGUON.md`.
- Chưa thêm vào launcher và `js/apps.js` của 9app.tech (theo yêu cầu không sửa app khác).
