# 9family

Lịch học của con, điều phối đưa đón có nhắc leo thang, ngày quan trọng (dương và âm lịch), việc chung và mua sắm cho cả nhà. Web app (PWA) dùng **tài khoản 9app dùng chung** (số điện thoại + mật khẩu, dịch vụ `9id`): đăng nhập một lần cho mọi app 9app; gia đình, thành viên, hồ sơ con và lời mời nằm ở 9id, 9family giữ lịch, đưa đón, việc chung... theo `family_id`/`child_id`/`user_id` của 9id.

Thiết kế tài khoản: `../docs/superpowers/specs/2026-10-05-9id-design.md`. Chuyển gia đình đang chạy thật sang 9id: `docs/CUTOVER-9ID.md`.

Thiết kế: `../docs/superpowers/specs/2026-10-04-9family-design.md`.

## Chạy cục bộ

Cần Node 20+. Không có `DATABASE_URL` thì các lệnh dưới tự dựng PostgreSQL nhúng.

```
npm install
npm run dev      # http://localhost:8096/9family/  (dữ liệu ở .data/)
npm test         # node:test trên PostgreSQL thật, 9id giả; cuối cùng test/integration/real.test.js chạy 9id THẬT (cần thư mục ../9id)
npm run e2e      # Chrome thật (puppeteer-core), nhiều phiên, ảnh chụp vào shots/
npm run e2e:id   # Chrome thật với 9id THẬT: đăng nhập, gia đình, lời mời, vai con, nhập gia đình cũ (390x844 và máy tính), ảnh vào shots/migration/
npm run e2e:menu # Thực đơn tuần, Đi chợ, nút giọng nói (SpeechRecognition giả), nhập thông báo trường (9id giả), ảnh vào shots/menu/
npm run e2e:hm   # Sức khỏe và Tiền gia đình (9id giả), ảnh vào shots/health/ và shots/money/
npm run e2e:journey  # HÀNH TRÌNH 3 vai với 9id THẬT: mẹ đăng ký bằng giao diện 9id, tạo gia đình, thêm con, mời bố; bố nhận ca, thêm sự kiện một câu, đi chợ gõ + giọng nói; thực đơn, tiền, thông báo trường, sức khỏe; con có tài khoản. Ảnh sáng/tối vào shots/final/
npm run e2e:cutover  # CUTOVER trọn vẹn với 9id THẬT: gia đình kiểu cũ (dữ liệu bịa) -> export-to-9id (dry-run rồi thật) -> chủ nhận mã -> giao diện đủ dữ liệu; thành viên cũ chưa nối -> gộp. Ảnh shots/final/cutover-*.png
npm run docker-sim   # không có docker: chép đúng các tệp Dockerfile COPY (đã áp .dockerignore) ra thư mục tạm, npm ci --omit=dev, chạy server, kiểm tệp tĩnh + dữ liệu WHO/TCMR/thực đơn
npm run vapid    # sinh cặp khóa VAPID cho Web Push
```

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8096` | cổng |
| `BASE_PATH` | `/9family` | đường dẫn gốc sau nginx |
| `DATABASE_URL` | `postgres://postgres:ship@localhost:5440/family` | PostgreSQL |
| `NODE_ENV` | | `production` bật kiểm tra cấu hình khi khởi động |
| `NINE_ID_URL` | `http://9id:8102/id` | địa chỉ 9id trong mạng docker |
| `NINE_ID_KEY_ID`, `NINE_ID_SECRET` | `family`, trống | khóa HMAC của app này ở 9id (trùng `family:<secret>` trong `INTERNAL_KEYS` của 9id; secret >= 32 ký tự). **Production bắt buộc.** App là app thường: KHÔNG được nằm trong `INTERNAL_DELEGATE_APPS` |
| `NINE_ID_PUBLIC_PATH` | `/id/` | đường dẫn giao diện 9id cùng nguồn gốc (nút Đăng nhập/Đăng ký/Lời mời) |
| `NINE_ID_CACHE_MS` | `60000` | đệm verify và đọc gia đình (tối đa 60 giây theo spec 9id) |
| `LEGACY_SESSIONS` | `0` | `1` chỉ trong lúc cutover: phiên ẩn danh cũ (`fsid`) được XEM (không ghi) gia đình chưa nhận về 9id |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | trống | Web Push; thiếu khóa thì tắt đẩy (thông báo trong app vẫn chạy). Sinh bằng `npm run vapid` |
| `FAMILY_AI_KEY` | trống | khóa Gemini để đọc ảnh thời khóa biểu và ảnh/văn bản khó của thông báo trường; trống thì ẩn phần AI (vẫn nhập tay và đọc thông báo bằng quy tắc) |
| `FAMILY_AI_MODEL`, `FAMILY_AI_BASE`, `FAMILY_AI_RETRY_MS` | `gemini-flash-latest`, `https://generativelanguage.googleapis.com`, `1500` | model, địa chỉ API, thời gian chờ thử lại khi 429 |
| `FAMILY_AI_GLOBAL_PER_DAY` | `300` | trần số lần gọi AI mỗi ngày của cả máy chủ (mỗi gia đình 20/ngày, mỗi IP 30/ngày: cố định trong mã) |
| `CONSOLE_API_KEY_ID`, `CONSOLE_API_SECRET` | trống | API cho 9app Console (trống thì 404) |
| `NINE_ID_TIMEOUT_MS`, `NINE_ID_BREAK_MS` | `5000`, `1500` | chờ tối đa mỗi lần gọi 9id; 9id vừa lỗi hạ tầng thì trả 503 ngay trong ngần này ms (không dồn yêu cầu) |
| `TRUSTED_PROXY_HOPS` | `1` | số proxy tin cậy phía trước (nginx = 1) |
| `RATE_LIMIT_PER_MIN`, `ROUTE_LIMIT_FACTOR`, `SESSION_LIMIT_PER_MIN` | `6000`, `1`, `180` | giới hạn tần suất (theo IP, theo tuyến, theo băm token 9id) |
| `MAX_FAMILIES_PER_IP_HOUR` | `10` | số gia đình tạo tối đa mỗi IP mỗi giờ |
| `SCHEDULER_EVERY_MS` | `20000` | chu kỳ bộ lập lịch |
| `FAMILY_PUSH_ALLOW_ANY` | `0` | CHỈ để thử: cho phép đẩy tới máy chủ đẩy lạ; không bật trên máy chủ thật |

`EDGE_SECRET` (`X-Edge-Secret`) là cấu hình của 9id và nginx; **9family không đọc biến này** (9family gọi 9id trực tiếp qua mạng docker bằng `NINE_ID_URL`). Giới hạn nghiệp vụ (tối đa 8 con, 30 thành viên, 800 sự kiện...) nằm trong `src/config.js`. Mẫu đầy đủ: `.env.example`.

Di cư CSDL tự chạy khi khởi động (`db/*.sql`). Bộ lập lịch chạy trong tiến trình, an toàn khi chạy hai bản.

## Tài khoản 9app (9id): cách hoạt động

- **Xác thực**: mỗi yêu cầu đọc cookie `nine_sid` (do 9id đặt, `Path=/`, cùng nguồn gốc 9app.tech), gọi 9id `POST /internal/v1/verify` (đệm tối đa 60 giây, theo băm token) -> `{userId, displayName}`. Chưa đăng nhập: API trả **401** `unauthenticated` (kèm `details.login`), giao diện chuyển tới `/id/?next=<trang hiện tại>#/dang-nhap`. 9id không với tới được: **503** (không coi là đăng xuất). Không còn cookie `fsid`, link mời, ghép thiết bị QR, mã khôi phục.
- **Gia đình**: `families.id`, `children.id` là uuid của 9id (gia đình cũ giữ nguyên uuid khi nhập). 9family đọc `members?as=` và `children?as=` **kèm token của chính người dùng** (`X-9ID-Token`) rồi ghi BẢN SAO tên/vai trò/năm sinh vào `members`/`children` để các truy vấn cũ vẫn chạy; nguồn đúng là 9id. Bản sao làm mới khi hết đệm hoặc khi giao diện gọi `POST /api/families/:fid/resync`. Phần của 9family: thiết lập leo thang, trường/lớp/màu/lưu ý đưa đón của con, quan hệ trong nhà (bố/mẹ/...), người đón hộ (không có tài khoản), toàn bộ lịch, ca đưa đón, việc, mua sắm...
- **Vai trò**: `chu`, `quan_ly`, `thanh_vien`, `con`. `me` trong `F.get/F.post(path, (ctx, me, fid) => ...)` có `{ id, userId, memberId, role, isExternal, childIds, ... }`. **Vai `con` mặc định bị từ chối ở mọi tuyến**; tuyến nào con được dùng phải khai `{ con: true }` và tự lọc dữ liệu theo `me.childIds` / `me.id` (xem `routes/events.js`, `routes/rides.js`, `routes/misc.js`). Con không nhận thông báo chung của cả nhà, không làm người đưa đón, không thấy người đón hộ, ghi chú sức khỏe, mua sắm. **Ma trận vai `con` theo mô-đun** (giao diện khớp máy chủ): Hôm nay/Lịch/Đưa đón (chỉ phần liên quan mình) và việc giao cho mình (đánh dấu xong được, không thêm/sửa) CÓ; Sức khỏe và Tiền (tiêu vặt của mình) CÓ theo ma trận quyền riêng; Thực đơn tuần, Đi chợ, Thông báo của trường KHÔNG (API 403, ô trong Tiện ích bị ẩn).
- **Việc làm ở 9id** (giao diện gọi API cùng nguồn gốc `/id/api/...`): tạo gia đình, thêm/sửa/lưu trữ hồ sơ con, nối tài khoản của con bằng số điện thoại, mời người lớn, duyệt lời mời, đổi tên gia đình, chuyển quyền, rời/xóa gia đình. Màn **Lời mời** và huy hiệu đọc `pendingInvitations`/`pendingApprovals` từ 9id và dẫn sang `/id/#/loi-moi`.
- **Hồ sơ con lưu trữ ở 9id**: ẩn ngay và ngừng sinh ca đưa đón; khuôn đưa đón và thời khóa biểu chỉ dọn sau 7 ngày (khôi phục trong 7 ngày thì còn nguyên).
- **Web Push**: `push_subs.user_id` = người dùng 9id, `sid` = băm phiên (thiết bị). 9family KHÔNG tự đẩy "bạn có lời mời gia đình": 9id yêu cầu token phiên cho mọi lần đọc nên nền không hỏi được; người dùng thấy huy hiệu khi mở app (xem câu hỏi mở trong báo cáo).
- **Console**: người dùng liệt kê theo `user_id` của 9id (một dòng cho mỗi người dù ở nhiều gia đình), không số điện thoại, không tên con.
- **ICS**: token theo thành viên (`members.ics_token`); tài khoản của con chỉ có sự kiện liên quan con; token chết khi rời gia đình.
- **Số điện thoại** không bao giờ vào 9family (trừ số của người đón hộ do người lớn tự nhập). 9family không xin `phoneLast4`.

## Ghi chú vận hành
- nginx phải đặt `X-Forwarded-For = $remote_addr`, `X-Forwarded-Host`, `X-Forwarded-Proto`.
- `sw.js` phục vụ ở `/9family/sw.js` (Service Worker chỉ nhận push).
- Nhật ký không ghi tên con, nội dung sự kiện, ghi chú; ảnh thời khóa biểu không lưu.

## Triển khai (máy chủ dùng chung)

0. **Cần 9id chạy trước** (container `9id`, cùng mạng docker; nginx có `location /id/`). Nếu đang chạy 9family với dữ liệu thật: làm theo `docs/CUTOVER-9ID.md` (sao lưu, thứ tự, hoàn tác), đừng triển khai thẳng.
1. Tạo vai trò + CSDL trên `9ship-db` (một lần): `CREATE ROLE family LOGIN PASSWORD '<mật khẩu mạnh>'; CREATE DATABASE family OWNER family;`
2. `cp .env.example .env`, điền `DATABASE_URL` (mật khẩu thật), `NINE_ID_SECRET` (cùng giá trị với `family:<secret>` trong `INTERNAL_KEYS` của 9id; thêm `family` vào `INTERNAL_IMPORT_APPS` của 9id nếu cần nhập gia đình cũ), sinh VAPID bằng `npm run vapid` rồi dán vào `.env`, đặt `FAMILY_AI_KEY` nếu dùng đọc ảnh, `CONSOLE_API_SECRET` nếu nối Console.
3. `docker compose -f docker-compose.server.yml up -d --build`. App từ chối khởi động nếu `DATABASE_URL` thiếu, trỏ localhost hoặc còn mật khẩu mẫu.
4. Chạy một bản duy nhất (một bộ lập lịch). Chạy nhiều bản vẫn không gửi trùng nhờ khóa CSDL.

nginx (`location /9family/`, và `location /id/` của 9id: xem `../9id/README.md`; **cùng một tên miền** để cookie `nine_sid` dùng chung):
- Chặn từ internet `location ^~ /id/internal/ { return 404; }` (9family gọi 9id qua mạng docker `http://9id:8102/id`).
- 9family không cần `X-Edge-Secret` (secret đó chỉ để 9id nhận yêu cầu trình duyệt); không đặt `Cookie` vào nhật ký truy cập của nginx.
- `proxy_set_header X-Forwarded-For $remote_addr;` (app lấy phần tử CUỐI, `TRUSTED_PROXY_HOPS=1`), thêm `X-Forwarded-Host` và `X-Forwarded-Proto`.
- Chặn đường quản trị từ ngoài: `location /9family/admin-api/ { deny all; }` (Console gọi trong mạng nội bộ).
- Cho phép `/9family/sw.js` và các yêu cầu Push; không `sub_filter`; chỉ HTTPS.
- Khuyến nghị `access_log off;` cho `location /9family/ics/` (token lịch nằm trong đường dẫn).

Lưu ý bảo mật: token phiên (cookie `nine_sid`) và token ICS không được ghi vào nhật ký; app không lưu token phiên (chỉ giữ băm 60 giây trong bộ nhớ làm khóa đệm); token ICS lưu dạng rõ trong CSDL để hiển thị lại (đổi được bất cứ lúc nào, tự đổi khi rời gia đình).

## Nhập gia đình đang chạy sang 9id

`docker exec -it 9family node scripts/export-to-9id.js` (thêm `--dry-run` để xem trước; `--family <uuid> --reissue` cấp lại mã). Với mỗi gia đình chưa có ai nối tài khoản, lệnh gọi `POST /id/internal/v1/import/families` (khóa HMAC của app `family`, phải nằm trong `INTERNAL_IMPORT_APPS` của 9id), giữ uuid gia đình và con, chỉ gửi tên gia đình, tên và năm sinh của con (KHÔNG gửi ghi chú, trường/lớp, thành viên, lịch, số điện thoại người đón hộ), rồi **in ra màn hình một lần** MÃ NHẬN của gia đình đó (không ghi vào nhật ký, tệp hay CSDL; 9id chỉ giữ băm). Chủ đăng ký tài khoản 9app, nhập mã ở `/id/` (Gia đình > Nhập mã nhận gia đình) thì thành chủ; lần đầu chủ mở 9family, thành viên `chu` cũ tự gắn `user_id` (giữ nguyên `memberId`, ca đưa đón, thông báo, đăng ký đẩy). Thành viên cũ khác chưa có tài khoản: mời bằng số điện thoại ở 9id rồi bấm tên họ ở tab Gia đình > **Gộp** để chuyển ca đưa đón, việc, thông báo sang tài khoản mới. Trước khi nhận, gia đình ở chế độ **chỉ đọc** (cần `LEGACY_SESSIONS=1`).

## Giao diện (v2)
Thiết kế lại giao diện: xem `docs/UX-DESIGN.md` (vấn đề, sơ đồ thông tin, wireframe, quyết định). Thanh dưới có 5 mục: **Hôm nay, Lịch, Đưa đón, Tiện ích, Gia đình**; **Tiện ích** dẫn tới Việc chung, Thực đơn tuần, Đi chợ, Sức khỏe, Tiền gia đình, Thông báo của trường (và Osin, trợ lý của nhà: khung chờ, ghi "Sắp ra mắt"). Màn Đi chợ là `public/menu-shop.js` (gõ/nói nhiều món, tự tách tên/số lượng/khu quầy); `public/lists.js` chỉ còn Tiện ích và Việc chung. Mọi nút giọng nói (Đi chợ, Tiền) dùng `public/voice.js` với bốn trạng thái nghe / đang xử lý (vòng xoay, Hủy) / kết quả (luôn mở màn soát lại, không tự lưu) / lỗi (thân thiện, thử lại). Phiên ẩn danh cũ trong lúc cutover (`LEGACY_SESSIONS=1`) chỉ xem: có biểu ngữ "Đang chỉ xem", ẩn nút Thêm và nút trên thẻ đưa đón. Chỉ đổi phần trình bày trong `public/`; API và dữ liệu giữ nguyên, nên đưa lên chỉ cần dựng lại container (`docker compose -f docker-compose.server.yml up -d --build`), dữ liệu trong PostgreSQL không đổi.
- `npm run e2e` kiểm Chrome thật: 320/360/390/430 và máy tính, sáng/tối, "Chữ lớn", không tràn ngang, vùng chạm >= 44px, tương phản, chữ >= 14px, không lỗi console.
- `node scripts/ux-shots.js shots/ux-after --extra` chụp ảnh các màn với dữ liệu mẫu bịa.
- `node scripts/build-preview.js` dựng bản xem thử tĩnh `preview/` (xem `preview/PREVIEW.md`).

## Sức khỏe gia đình và Tiền gia đình

Hai mô-đun nằm trong **Tiện ích** (`#/f/<fid>/health`, `#/f/<fid>/money`). Migration `db/030_health_money.sql` chỉ CỘNG THÊM (bảng/chỉ mục mới `IF NOT EXISTS`, thêm loại thông báo `health`, `money` cho thiết bị đã đăng ký), chạy lại nhiều lần vẫn đúng (có test trên DB có dữ liệu). Dockerfile có thêm `COPY data ./data` (bảng WHO và lịch tiêm chủng).

### Sức khỏe: tính năng
- **Hồ sơ theo từng người**: mỗi con (hồ sơ con) và mỗi người lớn trong gia đình có một hồ sơ riêng (tạo khi mở màn Sức khỏe). Người đón hộ không có hồ sơ. Nhập giới tính và ngày sinh để dùng biểu đồ WHO và lịch tiêm.
- **Tăng trưởng của con**: cân nặng, chiều dài/chiều cao, vòng đầu (bé nhỏ), BMI (tính từ cân nặng + chiều cao cùng ngày hoặc cách nhau tối đa 30 ngày). Biểu đồ SVG tự vẽ (không thư viện, tuân CSP) đối chiếu 5 đường chuẩn WHO (3%, 15%, 50%, 85%, 97%) và hiện "khoảng phần trăm thứ N" kèm lời giải thích trung tính ("chỉ để tham khảo, không phải chẩn đoán; hãy hỏi bác sĩ nhi"). Mỗi ngày một số đo mỗi loại (đo lại thì thay số cũ). Độ tuổi không có chuẩn thì ẩn đường chuẩn và nói rõ (xem bảng nguồn dưới).
- **Tiêm chủng**: lập lịch các mũi TCMR theo ngày sinh (một chạm, chạy lại không tạo trùng), "Đã tiêm" một chạm có hoàn tác, ngày sớm nhất được tiêm mũi sau khi mũi trước tiêm muộn, mũi tự thêm (vắc xin dịch vụ do người dùng nhập; app KHÔNG nhập sẵn lịch dịch vụ). Nhắc trước 7 ngày và đúng ngày (08:00).
- **Thuốc**: tên, liều (người dùng ghi theo đơn, app không tính liều và không khuyên liều), giờ uống, thời gian dùng, số liều còn lại. Nhắc đúng giờ (trễ tối đa 30 phút), "Đã uống" một chạm (bấm lại không trừ hai lần, có hoàn tác), báo "sắp hết thuốc" một lần.
- **Người lớn/ông bà**: huyết áp (tâm thu/tâm trương/mạch), đường huyết (lúc đói/sau ăn 2 giờ/khác), cân nặng; biểu đồ xu hướng; tô màu "cao/thấp so với ngưỡng tham khảo" và gợi ý "nên trao đổi với bác sĩ"; số rất bất thường hiện chữ cố định "Nếu có triệu chứng nặng hãy đi cấp cứu hoặc gọi 115". Không chẩn đoán.
- **Hồ sơ khám**: ngày, nơi, bác sĩ, lý do, kết luận ngắn, đơn thuốc (ghi bằng chữ), ngày tái khám, tùy chọn tạo sự kiện lịch "Tái khám" (chỉ có tên con, KHÔNG có nội dung khám; mọi người trong nhà thấy sự kiện này nên mặc định bật cho con, tắt cho người lớn). **Lần này không lưu ảnh** (đơn thuốc, kết quả).
- **Xuất/xóa**: "In / lưu PDF tóm tắt" (CSS in, một trang gọn cho một người); "Xóa dữ liệu sức khỏe của <tên>" xóa số đo, tiêm, thuốc, khám, sự kiện tái khám đã tạo và khóa nhắc (giữ lại bản ghi hồ sơ rỗng).

### Sức khỏe: ma trận quyền (`src/health/access.js`, có test)
Người không có quyền nhận **404** như hồ sơ không tồn tại (không lộ sự tồn tại); người có quyền xem nhưng thiếu quyền ghi nhận 403.

| Hồ sơ | chủ / quản lý | thành viên được giao phụ trách / được chia sẻ | thành viên khác | chính người đó | vai `con` |
|---|---|---|---|---|---|
| **Của con** | quản lý (xem, ghi, đổi người phụ trách, xóa dữ liệu) | được giao phụ trách: xem + ghi số đo, đánh dấu uống thuốc, ghi khám; không đổi cài đặt, không xóa | không thấy | (chưa có tài khoản riêng) | tài khoản đã nối vào đúng hồ sơ đó: **hạn chế** (tăng trưởng + lịch tiêm, không thuốc, không hồ sơ khám, không ghi chú, không ghi); con khác: không thấy |
| **Của người lớn có tài khoản** | **không thấy**, trừ khi được chia sẻ | được người đó chia sẻ: chỉ xem | không thấy | quản lý (tự chọn chia sẻ cho ai, thu hồi lúc nào cũng được) | không thấy |
| **Của người lớn chưa có tài khoản** (thành viên cũ chưa nối tài khoản, ví dụ ông bà do con cháu nhập hộ) | quản lý hộ | chỉ xem nếu được chia sẻ | không thấy | | không thấy |

Lưu ý quyết định: yêu cầu ban đầu ghi "chủ/quản lý xem tất cả" nhưng cũng "mặc định riêng tư cho người lớn"; bản này chọn **riêng tư cho người lớn có tài khoản** (chủ/quản lý không tự thấy), vì đây là dữ liệu sức khỏe nhạy cảm. Chủ/quản lý luôn thấy hồ sơ của các con. Cần chủ sản phẩm xác nhận.

### Sức khỏe: riêng tư
- Thông báo (trong app và đẩy) về sức khỏe luôn chỉ ghi **"Nhắc sức khỏe / Mở 9family để xem chi tiết."**, kể cả thiết bị tắt "ẩn chi tiết": không bao giờ có tên thuốc, bệnh, vắc xin, tên người. Sự kiện lịch tái khám chỉ ghi "Tái khám".
- Nhật ký máy chủ không ghi dữ liệu sức khỏe (có test bắt toàn bộ `console`); bảng `idem` chỉ lưu phản hồi tối thiểu; 9app Console API không đọc bảng `health_*` (có test kiểm mã nguồn). Không ghi vào `localStorage` hay bộ đệm trình duyệt.
- Dữ liệu trẻ em: Nghị định 13/2023/NĐ-CP (bảo vệ dữ liệu cá nhân) có quy định riêng cho trẻ dưới 16 tuổi. **Cần luật sư xác nhận** trước khi mở rộng (đồng ý của cha mẹ, đánh giá tác động, lưu trữ trong nước).
- Khi một người lớn rời gia đình, hồ sơ sức khỏe của họ không còn truy cập được nhưng CHƯA tự xóa (tránh mất dữ liệu nếu họ được thêm lại); xóa cả gia đình thì xóa hết (khóa ngoại CASCADE). Xem "Câu hỏi mở".

### Nguồn dữ liệu và mức kiểm chứng
| Dữ liệu | Nguồn | Tra cứu | Mức xác minh |
|---|---|---|---|
| Cân nặng, chiều dài/cao, vòng đầu, BMI theo tuổi, 0-5 tuổi (tháng 0-60) | WHO Child Growth Standards, bảng L, M, S theo tháng tuổi (tệp xlsx chính thức trên who.int) → `data/who-wfa.json`, `who-lhfa.json`, `who-hcfa.json`, `who-bfa.json` | 2026-10-05 | **Đã đối chiếu**: trung vị tại 12 tháng bé trai 9,6479 kg, bé gái 8,9481 kg, chiều dài 75,7488 cm / 74,015 cm; -2SD bé trai 12 tháng 7,7 kg (test `test/who.test.js`) |
| Chiều cao và BMI theo tuổi, 5-19 tuổi (tháng 61-228) | WHO Growth reference 2007, bảng L, M, S (xlsx chính thức) | 2026-10-05 | **Đã đối chiếu** trung vị BMI bé trai 61 tháng 15,2641. Tái tạo bảng: `node scripts/who-extract.mjs <thư mục xlsx>` |
| Cân nặng theo tuổi sau 5 tuổi | chưa nạp (WHO chỉ có đến 10 tuổi) | | **Ẩn** và ghi rõ trên màn hình, không bịa; vòng đầu sau 5 tuổi: WHO không có |
| Lịch tiêm chủng mở rộng | Thông tư 10/2024/TT-BYT (13/06/2024, hiệu lực 01/08/2024) Điều 1; `data/vn-tcmr.json` | 2026-10-05 | Đọc từ **bản đăng lại** trên trang văn bản pháp luật, đối chiếu mũi không đổi với Thông tư 38/2017 và mốc 2-3-4 tháng của DPT-VGB-Hib với tài liệu HCDC. **Chưa đối chiếu bản gốc Bộ Y tế/Công báo**: cần người có chuyên môn xác nhận |
| Ngưỡng huyết áp | tăng huyết áp từ 140/90 mmHg (khuyến cáo VNHA/VSH 2022) | 2026-10-05 | 140/90: đối chiếu qua tìm kiếm. Mức "hơi cao" 130-139/85-89, "thấp" dưới 90/60, "cấp cứu" từ 180/120: **từ kiến thức chung, chưa kiểm chứng nguồn chính thức** |
| Ngưỡng đường huyết (mmol/L) | lúc đói ≥ 7,0 và 6,1-6,9; sau ăn 2 giờ ≥ 11,1 và 7,8-11,0 (WHO); thấp < 3,9 (ADA); rất thấp < 3,0 (ADA mức 2) | 2026-10-05 | WHO/ADA: đối chiếu qua tìm kiếm. Ngưỡng cảnh báo cao ≥ 16,7: **ngưỡng của app, chưa kiểm chứng** |

Giữa 60 và 61 tháng là chỗ nối giữa hai bộ số liệu (tiêu chuẩn 0-5 và tham chiếu 5-19): app lấy bộ gần hơn, không nội suy chéo bộ, nên đường chuẩn có thể nhảy nhẹ ở tuổi 5. Chiều dài (nằm) dưới 2 tuổi và chiều cao (đứng) từ 2 tuổi: app không hiệu chỉnh 0,7 cm giữa hai cách đo.

### Tiền gia đình: tính năng
Sổ ghi chép nhẹ, **không xử lý thanh toán thật**.
- **Chi tiêu chung**: ghi nhanh bằng gõ một câu ("chợ 350k", "điện 1tr2", "điện nước 1 triệu rưỡi", "cafe 35 hôm qua", "ba trăm năm mươi nghìn") hoặc **giọng nói** (nút dùng chung `public/voice.js`: nghe, xử lý, hiện chữ để soát/sửa, rồi mới bấm Ghi). Bộ phân tích (`public/money-parse.js`) TÁCH số tiền, danh mục, ngày và ghi chú; **không lưu nguyên câu nói**. Số trần dưới 1000 hiểu là nghìn đồng và báo rõ để sửa. Hoàn tác khi ghi/xóa. Tổng theo tháng và theo danh mục (biểu đồ SVG), lịch sử 6 tháng, ngân sách tháng tùy chọn với lời nhắc nhẹ ở 80% và khi vượt, xuất CSV (chặn công thức `=`, `+`, `-`, `@`).
- **Khoản phải đóng** (học phí...): tên, số tiền, hạn, con, đã đóng/chưa, người đóng; sự kiện lịch "Hạn đóng: ..."; nhắc chủ/quản lý trước 3 ngày, đúng hạn, và 1 ngày sau hạn (08:00, mỗi mốc một lần); "Đã đóng" một chạm (tùy chọn ghi vào chi tiêu chung).
- **Tiền tiêu vặt của con**: mức theo tuần/tháng, "Đã đưa tuần/tháng này" (mỗi kỳ chỉ ghi được một lần), con tiêu, thêm/điều chỉnh, số dư, mục tiêu tiết kiệm (chỉ sổ).

### Tiền: ma trận quyền (có test)
| | chủ / quản lý | thành viên thường | vai `con` |
|---|---|---|---|
| Tổng chi tháng và theo danh mục | xem + chi theo từng người | xem tổng và theo danh mục (không theo từng người) | không |
| Khoản chi chung | thấy và sửa/xóa tất cả, ghi hộ người khác | ghi khoản của mình; chỉ thấy, sửa, xóa khoản của mình (khoản người khác: 404) | không (403) |
| Khoản phải đóng | thêm, sửa, xóa, đánh dấu đã đóng | chỉ xem | chỉ khoản của chính con |
| Tiền tiêu vặt | xem + ghi | không thấy | chỉ xem của chính mình |
| Ngân sách, xuất CSV | đặt ngân sách; xuất tất cả | xuất khoản của mình | không |

### API nội bộ cho mô-đun "nhập thông báo trường": `createDueItem`
Tệp `src/money/api.js` (gọi trực tiếp trong tiến trình, không qua HTTP):

```js
import { createDueItem } from '../money/api.js';
const r = await createDueItem(c /* c của tx() hoặc hàm query của db.js */, {
  familyId,   // bắt buộc, uuid
  title,      // bắt buộc, tối đa 100 ký tự ("Học phí tháng 10")
  amount,     // bắt buộc, số nguyên đồng VND >= 0 (đã làm tròn)
  dueDate,    // bắt buộc, 'YYYY-MM-DD'
  childId,    // tùy chọn, phải thuộc gia đình
  note,       // tùy chọn, tối đa 300 ký tự
  source,     // tùy chọn: 'truong' | 'thu_cong' (mặc định)
  extKey,     // tùy chọn: khóa chống trùng; gọi lại cùng extKey trong một gia đình KHÔNG tạo thêm
  createdBy,  // tùy chọn, uuid thành viên
  withEvent,  // tùy chọn, mặc định true: tạo sự kiện lịch "Hạn đóng: ..."
});
// -> { id, created, eventId }
```
Hàm không kiểm quyền (nơi gọi tự kiểm chủ/quản lý), kiểm dữ liệu, lỗi dữ liệu ném `ApiError` 400. Nhắc trước hạn do bộ lập lịch lo, không cần gọi thêm. Nên đặt `source: 'truong'` và `extKey` ổn định (ví dụ băm nội dung thông báo) để nhập lại không trùng.

### Hook nối 9Fin về sau (CHƯA nối)
`src/money/fin-export.js` định nghĩa hợp đồng dữ liệu `9family.shared-expense/1`: mỗi khoản chi chung xuất thành `{schema, externalId: '<familyId>:<expenseId>', familyId, date, amount (đồng), currency: 'VND', category, payerMemberId, payerUserId (user_id 9id), note, deleted, updatedAt}`. `externalId` ổn định để 9Fin upsert; khoản xóa mềm xuất `deleted: true` để 9Fin xóa theo. Chỉ chi tiêu CHUNG; không gồm tiền tiêu vặt của con. Khi 9Fin chuyển sang 9id: 9Fin kéo theo user 9id, chỉ thấy gia đình mà user là thành viên, người dùng bật đồng bộ (mặc định TẮT). Lần này không có route, không gọi mạng.

### Kiểm thử và ảnh chụp
- `npm test`: `test/who.test.js` (WHO, nội suy, lịch tiêm, ngưỡng, ma trận quyền), `test/money-unit.test.js` (bộ phân tích câu, VND, tổng hợp, CSV), `test/health.test.js`, `test/money.test.js` (tích hợp PostgreSQL thật: quyền theo vai, IDOR chéo gia đình và chéo người, nhắc không trùng, không rò qua nhật ký/đẩy/Console, migration chạy lại).
- `node scripts/e2e-hm.js`: Chrome thật, cổng và DB ngẫu nhiên, 9id giả; 390x844 và 1280x800, sáng/tối, Chữ lớn, vai chủ/thành viên/người lớn/con, giọng nói (Web Speech giả); ảnh vào `shots/health/` và `shots/money/`; kiểm tràn ngang, vùng chạm >= 44px, chữ >= 14px, lỗi console.

### Hạn chế y tế
App chỉ để tham khảo, không chẩn đoán, không khuyên liều, không thay bác sĩ. Phần trăm WHO là tham chiếu quần thể, không áp cho bé sinh non hay có bệnh nền. Lịch tiêm là lịch miễn phí của chương trình quốc gia, chưa xác nhận bởi cơ sở y tế. Ngưỡng huyết áp, đường huyết là ngưỡng chung. Nhắc thuốc và tiêm phụ thuộc điện thoại nhận thông báo; không thay cho việc tự kiểm tra.

## Thực đơn tuần, đi chợ nâng cao, thông báo của trường

Bản chi tiết cho người vận hành và cho trợ lý Osin. Dữ liệu món ăn (277 món miền Bắc) đến từ thư viện `../menu-data`.

### Đồng bộ thư viện món ăn
`node scripts/sync-menu-data.js` sao chép dữ liệu và mã (planner, shopping, normalize) vào `src/menu/lib/` (máy chủ) và `public/menu/` (trình duyệt: chuẩn hóa dự phòng khi không gọi được máy chủ), kèm `MANIFEST.json` (băm từng tệp và băm gộp). Docker chỉ cần `src/` và `public/`, không cần thư mục `menu-data`. `--check` kiểm tra bản sao khớp MANIFEST và khớp nguồn nếu có. Test `test/menu-sync.test.js` chạy cùng `npm test`. Sửa dữ liệu/mã ở `menu-data`, chạy test ở đó, rồi chạy lại lệnh đồng bộ.

### Dữ liệu (db/020_menu.sql, chỉ cộng thêm, chạy lại an toàn)
`menu_profiles` (hồ sơ ăn uống + món đã ẩn), `menu_plans` (thực đơn theo tuần, khóa món, trạng thái nháp/chốt), và các cột mới của `shopping` (tên đã tách, số lượng, đơn vị, khu quầy, nguồn, tuần thực đơn, món nguồn, "nhà đã có"). Mục mua sắm cũ giữ nguyên, không bị sửa.

### API (mọi đường dẫn nằm dưới `/api/families/:fid`)
| Đường dẫn | Quyền | Ý nghĩa |
|---|---|---|
| `GET /menu/profile`, `POST /menu/profile` | xem: mọi thành viên; sửa: chủ, quản lý | hồ sơ ăn uống |
| `GET /menu/week?start=`, `POST /menu/week/generate` | xem: mọi thành viên; lập: chủ, quản lý | thực đơn tuần (thứ hai), lập tuần kế tiếp không lặp món hai tuần trước |
| `POST /menu/week/swap`, `GET /menu/week/alternatives`, `POST /menu/week/lock` | thành viên người lớn trở lên | đổi món, 3-5 món thay thế, khóa món |
| `POST /menu/week/status`, `DELETE /menu/week` | chủ, quản lý | chốt / xóa |
| `POST /menu/hide` | ẩn: thành viên người lớn; bỏ ẩn: quản lý | "không thích món này" |
| `GET /menu/dishes?q=&role=`, `GET /menu/dishes/:id`, `GET /menu/today` | mọi thành viên | tìm món, công thức, dòng "hôm nay ăn gì" |
| `POST /menu/week/shopping` | thành viên người lớn trở lên | từ thực đơn sang danh sách đi chợ (`preview:true` chỉ xem) |
| `GET /shopping`, `POST /shopping`, `POST /shopping/batch`, `POST /shopping/parse` | thành viên (trừ vai trò `con`) | danh sách, thêm, thêm nhiều mục đã soát, xem trước cách tách |
| `POST /shopping/items` | như trên | **điểm vào cho Osin** |
| `POST /shopping/:id`, `/bought`, `/have`, `DELETE`, `POST /shopping/clear-bought` | như trên | sửa, tích đã mua, nhà đã có, xóa, dọn |
| `POST /school/extract` | thành viên người lớn trở lên | đọc thông báo trường (không lưu gì) |

Điểm vào cho trợ lý Osin: `POST /shopping/items` với `{ "text": "nước mắm", "qty": 1, "unit": "chai", "source": "osin" }`. Chỉ `text` là bắt buộc; `qty` là số dương, `unit` một trong g, kg, ml, l, quả, bó, củ, miếng, hộp, gói, túi, chai, lon, thùng, con, cây, cái, viên, cuộn, lọ, tuýp, nải, ổ (không dấu cũng được); `note` tùy chọn (80 ký tự). Văn bản tự do như "mua một chai nước mắm" cũng được: bộ chuẩn hóa tách tên, số lượng, đơn vị, khu quầy. Trả về `{ item, merged }`; món trùng (cùng tên và đơn vị, chưa mua) được gộp, không nhân đôi, số lượng lớn hơn thì cập nhật. Đồng thời gọi được `POST /shopping/parse {text}` để xem trước.

### Chuẩn hóa tên hàng (gõ và giọng nói)
`menu-data/src/normalize.js`: bỏ từ đệm ("mua", "thêm cho tôi", "cần", "còn thiếu", "nữa", "nhé", "giúp"...), tách nhiều món ("và", "với", "rồi", "cộng", "thêm", dấu phẩy), số bằng chữ ("một", "hai", "nửa", "rưỡi", "chục", "vài"), đơn vị đời thường, gõ không dấu, sai một ký tự do nhận dạng giọng nói ("rau mống" gợi ý "rau muống", đánh dấu để soát). `'Mua một chai nước mắm'` thành "Nước mắm · 1 chai"; `'Giấy vệ sinh nữa'` thành "Giấy vệ sinh". Mục đã lưu nguyên câu trước đây: khi hiển thị, máy chủ trả thêm `tidy` (bản gọn) và giao diện hiện bản gọn kèm câu gốc; dữ liệu cũ chỉ đổi khi người dùng bấm Lưu ở tờ "Sửa món" (hoặc gọi `POST /shopping/:id {tidy:true}`). Không có thao tác nào sửa dữ liệu cũ âm thầm.

### Nút giọng nói dùng chung: `public/voice.js`
```js
var v = F9.voiceButton({
  lang: 'vi-VN',                      // mặc định vi-VN
  label: 'Nói để thêm món',           // nhãn cho người dùng màn hình đọc
  hint: 'Ví dụ: hai bó rau muống',    // gợi ý hiện khi đang nghe
  parse: function (text) { return Promise | value },  // chạy ở bước "Đang xử lý" (máy chủ, luật hoặc AI), có Hủy và thời gian chờ
  onResult: function (text, parsed, err) {},          // lời nhận dạng + kết quả parse (parsed = null nếu parse lỗi): mở màn SOÁT, không tự lưu
  onState: function (state, info) {},                 // 'idle' | 'listening' | 'processing' | 'error'
  silenceMs: 2500, maxListenMs: 20000, processMs: 15000
});
parent.appendChild(v.button); parent.appendChild(v.panel);   // nút + khung trạng thái (aria-live)
// v.supported, v.state(), v.cancel()
```
Trạng thái: rảnh (mic) -> đang nghe (nút đỏ, biểu tượng dừng, sóng âm, hiện lời nhận dạng tạm thời, chạm lần nữa để dừng, tự dừng khi im lặng) -> đang xử lý (nút khóa, vòng xoay, chữ "Đang xử lý…", nút Hủy) -> kết quả (`onResult`) hoặc lỗi thân thiện (không có quyền micro, không nghe thấy gì, không hỗ trợ, mất mạng). Tôn trọng `prefers-reduced-motion`, chế độ tối, Chữ lớn. CSS nằm trong `public/menu.css` (phần "nút giọng nói"). Dùng lại ở mô-đun Tiền (ví dụ `parse` gọi bộ tách "chợ 350k") và ô thêm nhanh sự kiện.

### Thông báo của trường
`POST /school/extract {text, mode: 'rules'|'ai', image?}`: bậc 1 là luật (ngày, giờ, họp phụ huynh, thi, nghỉ lễ, đồng phục, nộp, số tiền, hạn), luôn chạy. Bậc 2 là Gemini qua `FAMILY_AI_KEY` (văn bản phức tạp hoặc ảnh), chung hạn mức `ai_quota` với đọc thời khóa biểu (gia đình, IP, toàn hệ), đầu ra được kiểm nghiêm; không có khóa thì trả 404 `ai_disabled` và giao diện ẩn nút AI. Kết quả chỉ là bản nháp để xem lại; ảnh và văn bản không được lưu. Lưu thật đi qua `/events` và `/tasks` (khoản phải đóng thành việc có hạn, số tiền nằm trong tiêu đề).

### Kiểm thử
`npm test` gồm `menu-sync`, `menu` (hồ sơ, thực đơn, đổi/khóa/ẩn/chốt, đi chợ, tách tên, đua dữ liệu, IDOR, nhắc, thông báo trường qua Gemini giả) và `school` (trích thông báo nhiều mẫu). `node scripts/e2e-menu.js` chạy Chrome thật (390x844, 320, máy tính, tối, Chữ lớn, SpeechRecognition giả cho từng trạng thái), ảnh ở `shots/menu/`.
