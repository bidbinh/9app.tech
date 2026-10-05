# Osin

Trợ lý AI trò chuyện của hệ 9app, chạy ở **tên miền riêng `https://osin.9app.tech`**. Gõ, nói (micro) hoặc nghe đọc lại; Osin tra cứu và làm giúp trong các app 9app qua một **giao thức công cụ** có chữ ký HMAC. Việc thêm/sửa/xóa luôn cần người dùng bấm **Xác nhận** (và app còn đòi biên nhận xác nhận). Đăng nhập bằng tài khoản 9app (luồng authorize của dịch vụ `9id`), Osin giữ phiên riêng.

- Thiết kế: `../docs/superpowers/specs/2026-10-05-osin-design.md` (kiến trúc, bảo mật, **mục 16: phản biện lần 2, trạng thái từng mục**, câu hỏi mở).
- Giao thức cho app tích hợp, danh sách kiểm bảo mật, công cụ dự kiến từng app: `docs/OSIN-TOOL-PROTOCOL.md`.
- SDK cho app Node: `sdk/osin-sdk.js` (không phụ thuộc, có test).
- nginx mẫu cho `osin.9app.tech`: `deploy/nginx-osin.9app.tech.conf`.

## Chạy cục bộ

Cần Node 20 trở lên. Không cần cài PostgreSQL: nếu không có `DATABASE_URL`, các lệnh dưới đây tự dựng PostgreSQL thật (`embedded-postgres`) ở cổng ngẫu nhiên.

```
npm install
npm run dev      # http://localhost:8103/  (danh tính giả, chỉ nghe loopback; vào thử: /dev-login?name=Lan&family=1)
npm test         # PostgreSQL tạm + node:test (SDK, biên nhận, công cụ, vòng gọi công cụ, xác nhận, bảo mật, phiên/đăng nhập, ngân sách, Gemini, 9id, Console)
npm run integration  # 9id THẬT + Osin THẬT + app giả (SDK) + Chrome: đăng ký, authorize, chat, xác nhận, đăng xuất/đổi mật khẩu thu hồi phiên, ca xấu; ảnh vào shots/integration/
npm run e2e      # Chrome thật (puppeteer-core): 390x844, 360x740, 1280x800, sáng/tối, micro giả lập; ảnh vào shots/
npm run sync-search   # làm mới data/search từ launcher-search/search và vannien/search-index.json
```

Không có `OSIN_AI_KEY` thì Osin chạy **chế độ không AI**: chỉ lệnh đơn giản ("đổi 3 chỉ vàng ra gram", "tính 12*(3+4)", "hôm nay âm lịch ngày mấy", "mở văn khấn"), không gửi gì ra ngoài. Có khóa thì dùng Gemini (người dùng phải đồng ý bản điều khoản hiện hành). `npm test` và `npm run e2e` dùng mô hình giả, không gọi Gemini thật.

`npm run e2e` cần Chrome (`CHROME_PATH`, mặc định `C:/Program Files/Google/Chrome/Application/chrome.exe`) và puppeteer-core (`PUPPETEER_CORE`, đường dẫn module ESM; mặc định theo máy phát triển).

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8103` | cổng lắng nghe |
| `BASE_PATH` | rỗng | rỗng = chạy ở gốc tên miền riêng (khuyến nghị); `/osin` = chạy dưới đường dẫn (chế độ cũ, cookie không dùng được tiền tố `__Host-` nếu khác rỗng) |
| `OSIN_PUBLIC_ORIGIN` | | **Production bắt buộc**, `https://osin.9app.tech`: dùng làm `redirect_uri` của luồng đăng nhập (phát triển suy ra từ Host) |
| `OSIN_APPS_ORIGIN` | | **Production bắt buộc**, `https://9app.tech`: liên kết sâu tới app và nút "‹ 9app" là URL tuyệt đối |
| `DATABASE_URL` | `postgres://postgres:ship@localhost:5440/osin` | **Production bắt buộc đặt** (thiếu hoặc còn `MAT_KHAU` thì từ chối khởi động) |
| `NODE_ENV` | | `production` bật kiểm tra an toàn; giá trị khác {production, development, test} thì từ chối khởi động |
| `OSIN_SECRET` | | **Production bắt buộc** (>= 32 ký tự): HMAC toàn vẹn hành động chờ, băm khóa bộ đếm. Thiếu (khóa mặc định) thì chỉ nghe loopback |
| `OSIN_IDENTITY` | `9id` ở production, `mock` ngoài đó | **Production bắt buộc `9id`**; `mock` chỉ nghe loopback |
| `OSIN_ID_URL`, `OSIN_ID_KEY_ID`, `OSIN_ID_SECRET` | | địa chỉ nội bộ 9id (vd `http://9id:8102/id`), khóa `osin` trong `INTERNAL_KEYS` của 9id |
| `OSIN_ID_AUTHORIZE_URL` | `https://9app.tech/id/authorize` | nơi chuyển người chưa đăng nhập (`?client=osin&redirect_uri=...&state=...`) |
| `OSIN_AI_KEY` | trống | khóa Gemini; trống = chế độ không AI. **Chỉ đặt ở đây** |
| `OSIN_AI_NO_TRAIN_CONFIRMED` | trống | đặt `1` **chỉ khi** đã kiểm tra gói API không dùng dữ liệu để huấn luyện; nếu không giao diện ghi trung thực là chưa xác nhận |
| `OSIN_AI_PROVIDER`, `OSIN_AI_MODEL` | tự chọn, `gemini-flash-latest` | `gemini` / `offline` (`mock` chỉ cho test) |
| `OSIN_APPS` hoặc `OSIN_APPS_FILE` | trống | danh sách app (JSON, xem `apps.example.json`): `id`, `name`, `baseUrl`, `keyId`, `secret` (khóa kênh), `receiptSecret` (khóa biên nhận, **khác** `secret`, production bắt buộc), `linkPrefix`, `readOnlyTools` (tên công cụ được duyệt chạy ngay; **mặc định không có công cụ nào**, mọi công cụ cần xác nhận) |
| `OSIN_USER_TOKENS_PER_DAY` / `OSIN_GLOBAL_TOKENS_PER_DAY` | `120000` / `3000000` | trần token/ngày theo người (tối đa 4% trần toàn hệ; người mới < 24 giờ dùng 25%, đổi bằng `OSIN_NEW_USER_FACTOR`) và toàn hệ (log cảnh báo ở 50% và 80%) |
| `OSIN_USER_MSGS_PER_DAY`, `OSIN_CHAT_PER_MIN`, `OSIN_CONFIRM_PER_HOUR` | `150`, `12`, `20` | tin nhắn/ngày, lượt/phút, số hành động xác nhận/giờ theo người |
| `OSIN_MAX_MSG_CHARS`, `OSIN_MAX_TOOL_ROUNDS`, `OSIN_TURN_TIMEOUT_MS` | `2000`, `6`, `60000` | độ dài tin, số vòng công cụ, thời gian tối đa một lượt |
| `OSIN_TOOL_TIMEOUT_MS`, `OSIN_MANIFEST_TIMEOUT_MS`, `OSIN_CONFIRM_TIMEOUT_MS` | `8000`, `3000`, `20000` | thời hạn gọi app |
| `OSIN_HISTORY_DAYS`, `OSIN_HISTORY_MAX` | `30`, `200` | lưu giữ lịch sử |
| `OSIN_SESSION_CHECK_MS` | `300000` | chu kỳ kiểm phiên 9id (đăng xuất ở 9id có hiệu lực trong khoảng này) |
| `OSIN_ERASE_KEYS` | trống | `id:SECRET` cho 9id gọi xóa dữ liệu khi xóa tài khoản (ký giao thức OSIN1); trống = tắt |
| `OSIN_DEV_LOGIN` | trống | `1` bật `/dev-login` (chỉ với danh tính giả, ngoài production; `npm run dev` tự đặt) |
| `CONSOLE_API_KEY_ID`, `CONSOLE_API_SECRET` | trống | bật API quản trị cho 9app Console (trống thì các đường dẫn này trả 404) |
| `RATE_LIMIT_PER_MIN`, `SESSION_LIMIT_PER_MIN` | `3000`, `120` | giới hạn yêu cầu mỗi IP và thao tác ghi mỗi người |
| `TRUSTED_PROXY_HOPS` | `1` | số proxy tin cậy; IP khách lấy từ phần tử thứ n tính từ CUỐI của `X-Forwarded-For`; IPv6 gom /64. Production phải >= 1 |

Cập nhật lược đồ CSDL chạy tự động khi khởi động (`db/*.sql`, bảng `schema_migrations`, khóa tư vấn).

## Triển khai (máy chủ dùng chung, tên miền riêng)

1. **DNS và chứng chỉ** cho `osin.9app.tech` (bản ghi A/AAAA về máy chủ; chứng chỉ riêng hoặc wildcard).
2. Tạo vai trò và CSDL trong container PostgreSQL của 9Ship:
   ```
   docker exec -it 9ship-db psql -U postgres -c "CREATE ROLE osin LOGIN PASSWORD '<mật khẩu mạnh>'" -c "CREATE DATABASE osin OWNER osin"
   ```
3. `cp .env.example .env` và điền: `DATABASE_URL`, `OSIN_SECRET` (`openssl rand -hex 32`), `OSIN_ID_SECRET`, `OSIN_AI_KEY`, `CONSOLE_API_SECRET`, `OSIN_ERASE_KEYS`. Phía **9id**: thêm khóa `osin:<OSIN_ID_SECRET>` vào `INTERNAL_KEYS`, đặt `OAUTH_CLIENTS=osin=https://osin.9app.tech/auth/callback` và **`INTERNAL_DELEGATE_APPS=osin`** (Osin không có cookie `nine_sid` của người dùng nên không kèm `X-9ID-Token`; thiếu cờ này thì `families` trả 401 `token_required`, Osin vẫn chạy nhưng không thấy gia đình nào và ghi log `id_families_status`); 9id phải có `GET /id/authorize` (client `osin`, `redirect_uri` đã đăng ký là `https://osin.9app.tech/auth/callback`), `POST /id/internal/v1/exchange`, `POST /id/internal/v1/session-valid`; muốn xóa dữ liệu khi xóa tài khoản thì cho 9id gọi `DELETE /internal/v1/users/:uid` bằng khóa `OSIN_ERASE_KEYS`.
4. `cp apps.example.json apps.json`, điền từng app (mỗi app **hai** bí mật khác nhau >= 32 ký tự: `secret` cho kênh và `receiptSecret` cho biên nhận; đặt cùng giá trị ở `keys` và `receipt.secret` của SDK trong app; liệt kê `readOnlyTools` đã duyệt). `apps.json` không đưa vào git.
5. `docker compose -f docker-compose.server.yml up -d --build` (container `9osin`, `mem_limit 192m`, hệ tệp chỉ đọc, bỏ mọi quyền, mạng `9ship_internal` và `ops_tms-network`, cổng nội bộ 8103). **Chỉ chạy một bản.**
6. nginx: dùng `deploy/nginx-osin.9app.tech.conf` (HTTP chuyển sang HTTPS; `/internal/` và `/admin-api/` trả 404 từ internet; 9app Console và 9id gọi thẳng `http://9osin:8103/...` trong mạng docker). Mỗi app tích hợp cũng phải chặn `/<app>/osin-api/`. Không thêm CORS, không dùng `sub_filter`.
7. Launcher: đăng ký Osin với href **tuyệt đối** `https://osin.9app.tech/` (`js/catalog.js`, `icons/osin.svg` từ `public/icon.svg`) và nạp `https://osin.9app.tech/search-index.json` (việc này chưa làm, thuộc phần launcher).
8. Console: khai app `osin`, địa chỉ `http://9osin:8103/admin-api/v1`, key và secret như trên.

## Cấu trúc

```
db/                      001 lược đồ, 002 cảnh báo thẻ/client_id/phiên bản đồng ý, 003 phiên Osin
sdk/osin-sdk.js          SDK cho app: ký/kiểm HMAC, nonce, requestId, biên nhận, giới hạn theo người dùng, nhật ký kiểm toán, kiểm tham số
src/server.js            khởi động, buildApp({identity, llm, registry}) cho test
src/http.js              bộ định tuyến node:http, CSRF, giới hạn tần suất, CSP, cookie host-only
src/identity.js          IdentityVerifier: 9id (exchange, session-valid, families; 429 khác sập) và mock
src/auth.js              phiên Osin (băm token, trượt 7 ngày, kiểm lại 9id <= 5 phút)
src/llm/                 LlmProvider: gemini, offline, mock
src/apps.js              kết nối app: manifest (đệm, trần 48 KB), gọi công cụ có ký + biên nhận, ngắt mạch, readOnlyTools
src/chat.js              một lượt hội thoại: vòng công cụ, cảnh báo chỉ dẫn lạ, trần 20 KB khai báo, system prompt
src/pending.js           hành động chờ xác nhận (chiếm bằng UPDATE điều kiện, HMAC toàn vẹn, thay thẻ trùng)
src/usage.js             trần token/ngày (đặt trước trong giao dịch), người mới, 4%, cảnh báo 50/80%
src/store.js             lịch sử, cài đặt, xuất/xóa, dọn dữ liệu hết hạn
src/tools/               công cụ nội bộ: máy tính chính xác (BigInt), lịch âm, đổi đơn vị, tìm chức năng
src/routes/api.js        đăng nhập, API trình duyệt (Sec-Fetch, token giao diện), xóa dữ liệu theo yêu cầu 9id
src/console-api.js       API quản trị cho 9app Console (không lộ nội dung hội thoại)
public/                  giao diện một trang (JS thuần, sáng/tối, micro, đọc to)
deploy/                  nginx mẫu
scripts/                 test.js, dev.js, e2e.js, embedded-pg.js, sync-search.js, make-icon.js
test/integration/        kiểm tích hợp 9id thật + Osin thật (harness.js, run.js)
test/                    sdk, sdk2, unit, hardening-unit, chat, confirm, security, hardening, budget, gemini, identity, console
docs/OSIN-TOOL-PROTOCOL.md
```

## Quy ước chính

- Osin **không phải nguồn quyền**: `actingUserId` luôn là người đăng nhập thật; app tự kiểm quyền. Tham số lạ (kể cả `actingUserId` do mô hình sinh) bị từ chối. Công cụ ghi cần xác nhận của người dùng **và** biên nhận hợp lệ ở app.
- Chỉ công cụ `readOnly` **được vận hành duyệt trong `readOnlyTools`** và không `confirm`, không `sensitive` mới chạy ngay. Công cụ `sensitive` không bao giờ được đưa cho mô hình.
- Nội dung hội thoại **không bao giờ** vào log. Mọi chuỗi lỗi đi qua `redact()`; lỗi thư viện chỉ ghi tên/mã.
- Giao diện chỉ dùng `textContent`; CSP không cho script/style nội tuyến; CORS tắt.
- Một tiến trình: khóa "một lượt đồng thời mỗi người", đệm manifest, bộ đếm lượt/phút và token giao diện nằm trong bộ nhớ.

## Chưa làm / chưa kiểm chứng

- **Gemini thật chưa được gọi** (chưa có khóa): `src/llm/gemini.js` được kiểm bằng `fetch` giả theo tài liệu REST.
- **9id thật đã được kiểm với Osin thật** bằng `npm run integration` (`test/integration/`): chữ ký HMAC, tên endpoint, thân/đáp, mã lỗi, cookie, state, redirect_uri khớp nhau. Phản hồi 9id vẫn không được ký (câu hỏi mở). Chưa kiểm sau nginx thật/HTTPS (cookie `__Host-` và `Secure` chỉ kiểm ở mức cấu hình), chưa kiểm khi 9id xóa tài khoản gọi sang Osin (9id chưa có phần gọi `DELETE /internal/v1/users/:uid`).
- **Giọng nói thật** chưa kiểm trên thiết bị (e2e dùng lớp giả lập). Chưa chạy compose gia cố trong Docker thật. Chưa có app thật đăng ký công cụ (đã kiểm với app giả qua SDK).
- Chưa có SSE, nhiều cuộc trò chuyện, nhận ảnh, nhập lại mật khẩu cho việc nhạy cảm, Trusted Types, bản lưu bền của kho `requestId` trong SDK.
- Pháp lý (Nghị định 13/2023, gửi dữ liệu trẻ em tới nhà cung cấp AI ở nước ngoài, điều khoản huấn luyện của gói Gemini) cần luật sư xác nhận trước khi mở cho người dùng thật.
