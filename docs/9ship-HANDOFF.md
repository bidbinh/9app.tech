# 9Ship — bàn giao (2026-10-03)

Nhánh git: `feat/9ship` (tách từ `main`, các thay đổi chưa commit của bạn trên `main` không bị đụng tới).
Mã nguồn: `9ship/` · Thiết kế: `docs/superpowers/specs/2026-10-03-9ship-design.md` · Kế hoạch: `docs/superpowers/plans/2026-10-03-9ship-implementation.md`.

## Đã làm xong và đã kiểm chứng

- Backend Node 20 + PostgreSQL: báo giá nhiều hãng, tạo đơn (outbox/worker, đối soát khi hãng timeout), sổ cái ghi kép, ví, nạp VietQR (sinh mã chuẩn NAPAS), rút tiền (máy trạng thái, bắt buộc OTP lại), hủy/hoàn tiền, điều chỉnh cước khi hãng cân lại, nhả tiền đệm, khiếu nại, quản trị (giá, biên, giá niêm yết, ký quỹ, hàng đợi, nhật ký chỉ ghi thêm).
- Giao diện điện thoại (`/9ship/`) và trang quản trị (`/9ship/admin.html`); ô **9Ship** trong cổng 9app; khối nginx.
- **148 kiểm thử** chạy trên PostgreSQL thật, gồm đua tranh song song, crash giữa chừng, webhook trùng/đảo thứ tự, mã vạch đối chiếu thư viện tham chiếu.
- Chạy thử trọn luồng bằng **Chrome thật** ở cả hai đường (trực tiếp và qua cổng 9app): chọn hãng → đăng nhập OTP → nạp ví → tạo đơn → nhãn in → hành trình → hủy → hoàn tiền → nạp VietQR → webhook ngân hàng → trang quản trị. Không có lỗi JS nào.
- Hai vòng review độc lập bằng model mạnh nhất: vòng 1 trên bản thiết kế (22 điểm), vòng 2 trên mã nguồn (11 điểm). Tất cả đã sửa và có test riêng (`test/review-fixes.test.js`).
- Docker image build và chạy được; production từ chối khởi động nếu cấu hình không an toàn.

## Chạy ngay

```bash
cd 9ship
npm install        # lần đầu
npm run db         # PostgreSQL (Docker, cổng 5440)
npm run demo       # http://localhost:8099/9ship/
```
Qua cổng 9app: ở thư mục gốc `node server.js`, mở `http://localhost:9090/`, bấm ô **9Ship**.
Quản trị: `/9ship/admin.html`, mã `demo-admin`, mã TOTP: `ADMIN_TOTP_SECRET=JBSWY3DPEHPK3PXP npm run totp`.
Lúc bàn giao, hai tiến trình demo (8099 và 9090) đang chạy.

## Chưa làm — vì phần mềm không tự làm được (xem `9ship/docs/SETUP-CHECKLIST.md`)

1. **Đăng ký API đơn vị tổng hợp / hãng**: cần danh tính pháp lý, ký điều khoản, KYC. Hiện chỉ có 3 hãng **mô phỏng**. Adapter thật phải viết theo `9ship/docs/ADAPTER-CONTRACT.md` sau khi có sandbox, rồi bật qua `CARRIER_MODULES`. Tôi không viết sẵn adapter cho GHN/GHTK/… vì chưa có tài liệu API và sandbox để kiểm chứng; viết theo trí nhớ sẽ có nguy cơ tạo đơn sai tiền thật.
2. **Pha 0**: gửi một đơn thật nhỏ để xác nhận bưu cục có nhận mã/nhãn của 9Ship không (chưa ai kiểm chứng điều này).
3. **Giá sỉ**: sản lượng gần 0 thì giá vốn gần bằng niêm yết, biên gần bằng 0. Phải thương lượng bậc giá.
4. Tài khoản ngân hàng nhận tiền nạp + dịch vụ báo biến động số dư; kênh gửi OTP (SMS/Zalo).
5. **Pháp lý/kế toán**: ví trả trước có cần giấy phép không, mô hình đại lý hay bán lại, hóa đơn VAT, dữ liệu cá nhân, bồi thường. Bảng bút toán (spec 6.7) chưa có kế toán duyệt.

## Điểm cần bạn biết

- Sản phẩm **không thể cam kết "rẻ hơn gửi trực tiếp"** nếu không có giá sỉ thật. Phần mềm chỉ bảo đảm không bán vượt giá niêm yết đã kiểm chứng, và ẩn offer nào không có trần đáng tin.
- Những khác biệt có chủ đích so với thiết kế gốc nằm ở mục 13 của spec (nhãn là HTML in được thay vì PDF máy chủ; bản đồ quầy là danh sách + liên kết chỉ đường; địa chỉ chuẩn hóa đến tỉnh/thành).
- `js/catalog.js` trước đây là tệp chưa theo dõi của bạn; commit của tôi đã đưa nó vào nhánh `feat/9ship` (cùng mục 9Ship). Các tệp khác bạn đang sửa dở không bị đụng tới.
- Commit dùng danh tính tạm `Claude (9ship build) <ttrongbinh@gmail.com>` truyền qua tham số, **không** thay đổi cấu hình git của máy. Muốn đổi, rebase/`git commit --amend --reset-author` với tên của bạn.
- Việc tôi đã làm ngoài mã: tạo container Docker `9ship-db-1` (PostgreSQL, cổng 5440) và image `9ship:test`; không động tới container `9logtech-*` của bạn.
