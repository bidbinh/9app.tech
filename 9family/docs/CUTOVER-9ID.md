# Chuyển 9family đang chạy thật sang tài khoản 9app (9id)

Áp dụng cho bản đang chạy trên máy chủ với dữ liệu thật (1 gia đình, 2 con, khoảng 8 sự kiện, đã có sao lưu). Mọi thay đổi lược đồ chỉ **cộng thêm** và chạy lại được: `db/010_nine_id.sql` (tài khoản 9app), `db/020_menu.sql` (thực đơn, cột mới cho mua sắm, đều có giá trị mặc định), `db/030_health_money.sql` (sức khỏe, tiền; thêm loại thông báo `health`, `money` vào các đăng ký đẩy sẵn có). Không xóa hay đổi dữ liệu có sẵn; mọi dòng cũ (kể cả mua sắm cũ chưa có khu quầy) vẫn hiện đúng. Tệp này là quy trình thao tác; thiết kế nằm ở `../../docs/superpowers/specs/2026-10-05-9id-design.md` (mục 14, 15).

Quy ước: lệnh chạy trên máy chủ, thư mục chứa `docker-compose.server.yml` của từng app. Tên người, mã, mật khẩu dưới đây chỉ là ví dụ.

## 0. Hiểu trước khi làm

- Sau khi triển khai bản mới, **cookie ẩn danh cũ (`fsid`) không còn là cách đăng nhập**. Để chủ vẫn XEM được lịch trong lúc chuyển, bật `LEGACY_SESSIONS=1`: phiên cũ chỉ đọc được các gia đình **chưa được nhận về 9id**, mọi thao tác ghi trả 423 "đang chuyển sang tài khoản 9app". Thông báo đẩy của các thiết bị cũ vẫn chạy.
- Chủ chỉ thành chủ ở 9id bằng **mã nhận** (100 bit, dùng một lần, hết hạn sau 30 ngày) do lệnh `export-to-9id.js` in ra **một lần**. Ai giữ mã trước khi chủ dùng thì nhập trước thành chủ: chỉ chuyển mã cho đúng chủ, bằng kênh riêng, rồi xóa cửa sổ lệnh.
- Chỉ gia đình, tên và năm sinh của con sang 9id. Ghi chú về con, trường/lớp, thành viên, lịch, ca đưa đón, thông báo, đăng ký đẩy **ở lại 9family**, giữ nguyên `family_id`, `child_id`, `member_id` nên mọi tham chiếu vẫn đúng.
- Thành viên người lớn khác (ngoài chủ) vào bản cũ bằng link, chưa có tài khoản: họ ở lại 9family dạng "chưa nối tài khoản" cho tới khi được mời bằng số điện thoại và chủ bấm **Gộp**.

## 1. Sao lưu (bắt buộc, trước mọi thứ)

```
docker exec 9ship-db pg_dump -U postgres -Fc family > family-$(date +%Y%m%d-%H%M).dump
docker tag 9family:latest 9family:pre-9id          # giữ ảnh container cũ để hoàn tác
```

Kiểm bản sao lưu đọc được: `pg_restore -l family-*.dump | head` (và nếu có thể, khôi phục thử vào CSDL tạm `family_check`, đếm `families`, `members`, `children`, `events`). Cất tệp `.dump` ngoài máy chủ.

## 2. Triển khai 9id

Theo `../../9id/README.md`: tạo vai trò và CSDL `id`, `.env` (có `INTERNAL_KEYS=family:<secret>` với secret >= 32 ký tự ngẫu nhiên, **`INTERNAL_IMPORT_APPS=family`**, KHÔNG đặt `family` vào `INTERNAL_DELEGATE_APPS`), OTP thật (eSMS), `EDGE_SECRET`, nginx `location /id/` + chặn `/id/internal/`. Kiểm:

- `https://9app.tech/id/` mở được; đăng ký thử bằng số của bạn nhận được OTP.
- `https://9app.tech/id/internal/v1/verify` từ internet trả 404.
- Từ container 9family (sau bước 4) gọi được `http://9id:8102/id`.

## 3. Chuẩn bị 9family

Sửa `.env` của 9family (giữ nguyên `DATABASE_URL`, VAPID, Console):

```
NINE_ID_URL=http://9id:8102/id
NINE_ID_KEY_ID=family
NINE_ID_SECRET=<đúng secret của family trong INTERNAL_KEYS của 9id>
NINE_ID_PUBLIC_PATH=/id/
LEGACY_SESSIONS=1        # chỉ trong lúc chuyển
```

## 4. Triển khai 9family mới ở chế độ tương thích

```
docker compose -f docker-compose.server.yml up -d --build
docker logs 9family --tail 20        # thấy "9family chạy tại ..."; không có lỗi migration
```

Khi khởi động, các migration `010_nine_id.sql`, `020_menu.sql`, `030_health_money.sql` tự chạy theo thứ tự (010: cột `members.user_id`, `children.archived_at`, `children.linked_user_id`, `push_subs.user_id`, bảng `id_import`, vai trò `con`; 020: bảng thực đơn, cột mới của `shopping`; 030: bảng sức khỏe và tiền). App từ chối khởi động nếu `NINE_ID_SECRET` thiếu/ngắn/còn mẫu.

Kiểm ngay (các dòng dữ liệu phải y nguyên):

```
docker exec 9ship-db psql -U family -d family -c "select (select count(*) from families) f,(select count(*) from members) m,(select count(*) from children) c,(select count(*) from events) e"
```

- Mở 9family bằng điện thoại cũ của chủ: màn đầu có biểu ngữ "Gia đình đang chuyển sang tài khoản 9app" và gia đình ghi "Chỉ xem"; trong gia đình vẫn thấy lịch, ca đưa đón nhưng có biểu ngữ "Đang chỉ xem", không có nút Thêm, không có nút trên thẻ đưa đón (thử ghi qua API sẽ trả 423).
- Thông báo đẩy vẫn đến máy cũ.

## 5. Xuất gia đình sang 9id và phát mã nhận

```
docker exec -it 9family node scripts/export-to-9id.js --dry-run     # liệt kê, không gọi 9id
docker exec -it 9family node scripts/export-to-9id.js               # xuất thật, in MÃ NHẬN một lần
```

Chạy bằng `docker exec -it` để mã chỉ hiện trên cửa sổ lệnh của bạn (không vào `docker logs`). Ghi mã gửi cho chủ qua kênh riêng (gặp trực tiếp, hoặc tin nhắn riêng rồi xóa), rồi xóa cửa sổ lệnh. Mất mã hoặc quá 30 ngày: `node scripts/export-to-9id.js --family <uuid> --reissue` (mã cũ tự thu hồi). Chạy lại lệnh không tạo gì thêm.

## 6. Chủ nhận gia đình

1. Chủ mở `https://9app.tech/id/`, **Đăng ký** (số điện thoại, nhận OTP, đặt tên và mật khẩu từ 8 ký tự).
2. Vào Gia đình, **Nhập mã nhận gia đình**, dán mã. Thành công thì thành chủ ở 9id.
3. Mở `https://9app.tech/9family/` (đã đăng nhập). 9family tự nối thành viên `chu` cũ với tài khoản mới (giữ `member_id`, ca đưa đón, thông báo, đăng ký đẩy), xóa phiên ẩn danh cũ của chủ. Tên hiển thị lấy từ tài khoản 9app.
4. Nên bật lại thông báo đẩy trên máy (đăng ký cũ vẫn dùng được, nhưng bật lại cho chắc).

Kiểm:

```
docker exec 9ship-db psql -U family -d family -c "select name, role, user_id is not null as da_noi from members where left_at is null and not external"
```

Chủ thấy đủ 2 con, các sự kiện (kể cả ngoại lệ "bỏ qua/dời" của sự kiện lặp), ca đưa đón, việc, mua sắm (hiện ở Tiện ích > Đi chợ, tự xếp khu quầy ở máy), thiết lập mốc nhắc. Đối chiếu số dòng với bước 4. Thành viên cũ khác hiện nhãn "Chưa nối tài khoản".

Quy trình này đã được diễn tập trọn vẹn với 9id thật trên dữ liệu bịa giống thật (1 gia đình, 2 con, 8 sự kiện lặp có ngoại lệ, ca đưa đón, việc, mua sắm, thông báo): `npm run e2e:cutover` (ảnh ở `shots/final/cutover-*.png`), cộng `test/migration.test.js` (lược đồ cũ -> mới, so từng cột) và `test/integration/real.test.js`.

## 7. Mời người thân, gộp thành viên cũ

Ở tab Gia đình: **+ Mời** (nhập số điện thoại của người đó). Người được mời đăng ký 9app bằng đúng số, chấp nhận ở mục Lời mời, chủ duyệt. Khi họ đã vào: bấm tên thành viên cũ (nhãn "Chưa nối tài khoản") > **Gộp vào người này**. Ca đưa đón, việc, thông báo chuyển sang tài khoản mới; người dùng cũ xóa khỏi danh sách. Nếu người đó không cần nữa: **Xóa khỏi danh sách**.

Con có tài khoản riêng: ở 9id (hoặc nút Sửa hồ sơ trong tab Gia đình) nhập số điện thoại của con (không bắt buộc). Con đăng ký 9app, **tự bấm chấp nhận**, chủ duyệt; con chỉ xem lịch, việc, đưa đón của mình.

## 8. Dọn chế độ tương thích

Khi mọi gia đình đã được nhận (Console hoặc `select count(*) from families f where not exists (select 1 from members m where m.family_id=f.id and m.user_id is not null and m.left_at is null)` trả 0):

1. Đặt `LEGACY_SESSIONS=0`, `docker compose -f docker-compose.server.yml up -d`.
2. (Tùy chọn, sau 30 ngày không có sự cố) dọn dữ liệu cũ không còn dùng: `delete from sessions; delete from invites;` và bỏ cột `members.recovery_hash` ở một migration riêng. Không bắt buộc, không ảnh hưởng chạy.

## 8b. Tệp cần đưa lên máy chủ cho lần cutover

Toàn bộ thư mục `9family/` trừ `node_modules`, `.data`, `shots`, `preview`, `test`, `scripts/*` (chỉ giữ `scripts/export-to-9id.js`, Dockerfile đã tự lọc bằng `.dockerignore`): `Dockerfile`, `.dockerignore`, `docker-compose.server.yml`, `package.json`, `package-lock.json`, `src/` (có `src/menu/lib/data`), `db/` (010, 020, 030), `data/` (bảng WHO, lịch tiêm chủng; Dockerfile `COPY data ./data`), `public/` (có `public/menu/`, `health.css`, `money.css`, `menu.css`, `voice.js`...), `scripts/export-to-9id.js`, `.env` (tạo từ `.env.example`, KHÔNG đưa `.env` thật vào git). Kiểm khi không có docker: `npm run docker-sim`.

## 9. Hoàn tác

| Thời điểm | Cách hoàn tác | Mất gì |
|---|---|---|
| Trước bước 5 (chưa xuất mã) | `docker tag 9family:pre-9id 9family:latest && docker compose -f docker-compose.server.yml up -d` | Không mất gì. CSDL tương thích ngược: mã cũ bỏ qua bảng/cột mới (cột mới của `shopping` có giá trị mặc định); ràng buộc vai trò mở rộng không làm mã cũ hỏng. Phiên `fsid` cũ vẫn là phiên hợp lệ. Đăng ký đẩy được thêm loại `health`, `money` (vô hại với mã cũ). |
| Đã xuất mã, chủ chưa nhập | như trên; thu hồi mã ở 9id nếu muốn (`import/claims/:id/revoke`) | Không mất gì (mã chưa dùng). |
| Chủ đã nhận, mới dùng ít | khôi phục `.dump` bước 1 vào CSDL `family` (`pg_restore --clean`), chạy ảnh `pre-9id`, đặt lại `LEGACY_SESSIONS` không cần | Thay đổi sau bước 1 (sự kiện, ca đưa đón mới), tài khoản 9app của chủ vẫn còn ở 9id nhưng không dùng. |
| Đã chạy lâu | không nên hoàn tác. Sửa tiến (thêm tính năng ở 9id). | |

Luôn giữ tệp `.dump` của bước 1 ít nhất 30 ngày.

## 10. Rủi ro đã biết

- Đệm 60 giây: đăng xuất hoặc đổi vai trò ở 9id có hiệu lực ở 9family sau tối đa 60 giây (giao diện gọi `resync` ngay sau khi đổi để người đổi thấy liền).
- 9id sập thì 9family trả 503 cho người đã đăng nhập (không coi là đăng xuất, không mất dữ liệu); thông báo đẩy theo lịch vẫn chạy vì chạy nền từ CSDL 9family.
- "Bạn có lời mời gia đình" **không** đẩy thông báo: 9id đòi token phiên của chính người dùng cho mọi lần đọc nên tiến trình nền không hỏi được. Người dùng thấy huy hiệu khi mở app. Muốn đẩy được cần 9id gọi sang 9family hoặc cấp cho 9family quyền ủy quyền (đổi mô hình tin cậy): câu hỏi mở cho chủ sản phẩm.
- Mã nhận lộ trong 30 ngày hiệu lực nghĩa là ai nhập trước thành chủ. Nếu nghi lộ: `--reissue` (mã cũ tự thu hồi) khi chủ chưa nhận.
- Chủ đăng ký nhầm tài khoản rồi đã nhập mã: chuyển quyền chủ sang tài khoản đúng ở 9id (chuyển quyền cần nhập lại mật khẩu); 9family đồng bộ vai trò theo 9id.
