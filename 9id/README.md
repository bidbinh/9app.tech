# 9id

Tài khoản 9app dùng chung (số điện thoại + mật khẩu) và hồ sơ gia đình cho mọi app trên 9app.tech. Đăng ký được từ app bất kỳ (app chuyển người dùng sang `/id/?next=...`) hoặc trong launcher. Gia đình, thành viên, vai trò, hồ sơ con và lời mời nằm ở đây; dữ liệu nghiệp vụ (lịch, đưa đón, chi tiêu, sức khỏe) nằm ở từng app và chỉ tham chiếu `family_id`, `user_id`, `child_id` của 9id.

Thiết kế đầy đủ (mô hình dữ liệu, ma trận quyền, luồng nối tài khoản bằng số điện thoại, bảo mật, rủi ro, câu hỏi mở): `../docs/superpowers/specs/2026-10-05-9id-design.md`.

## Chạy cục bộ

Cần Node 20 trở lên. Không cần cài PostgreSQL: nếu không có `DATABASE_URL`, các lệnh dưới đây tự dựng PostgreSQL thật (gói `embedded-postgres`) ở cổng ngẫu nhiên.

```
npm install
npm run dev      # http://localhost:8102/id/  (OTP in ra cửa sổ lệnh, dữ liệu giữ ở .data/)
npm test         # dựng PostgreSQL tạm, chạy node:test (đơn vị + tích hợp), rồi dọn
npm run e2e      # kiểm tra giao diện bằng Chrome thật (puppeteer-core), ảnh chụp vào shots/
```

`npm run dev` dùng cổng gửi OTP `console` (in mã ra log, chỉ dev). `npm run e2e` cần Chrome (`CHROME_PATH`) và puppeteer-core (`PUPPETEER_CORE`, đường dẫn module ESM); dùng cổng `mock`, chạy server ở cổng ngẫu nhiên, chụp 390x844, 360x740, 1280x800, sáng và tối.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8102` | cổng lắng nghe |
| `BASE_PATH` | `/id` | đường dẫn gốc sau nginx |
| `DATABASE_URL` | `postgres://postgres:ship@localhost:5440/id` | PostgreSQL. **Production bắt buộc đặt**, không được còn `MAT_KHAU` |
| `NODE_ENV` | | `production` bật cờ `Secure` cho cookie `nine_sid` và kiểm cấu hình khi khởi động |
| `PHONE_PEPPER` | (chỉ dev) | bí mật HMAC để băm số điện thoại và mã OTP. **Production bắt buộc**, tối thiểu 32 ký tự (khuyến nghị 64 ký tự hex), không lặp ký tự/mẫu, ít nhất 12 ký tự khác nhau. Xoay: xem mục "Xoay PHONE_PEPPER" |
| `PHONE_PEPPER_OLD` | trống | pepper cũ trong giai đoạn xoay (lời mời băm bằng pepper cũ vẫn khớp) |
| `EDGE_SECRET` | trống | **Production bắt buộc** (>= 32 ký tự). nginx đặt header `X-Edge-Secret` cùng giá trị; thiếu/sai thì 9id từ chối yêu cầu trình duyệt (403) và không tin `X-Forwarded-For`. `/healthz`, `/internal/`, `/admin-api/` không cần (có HMAC / cho Docker) |
| `OTP_PROVIDER` | `console` (dev), `esms` (production) | `esms` / `console` / `mock`. Production chỉ chấp nhận `esms` có cấu hình đủ |
| `ESMS_API_KEY`, `ESMS_SECRET` | trống | khóa eSMS (đọc từ môi trường, không nằm trong mã) |
| `ESMS_BRANDNAME` | trống | tên thương hiệu cho SMS (kênh `sms`) |
| `ESMS_ZALO_OA`, `ESMS_ZALO_TEMP` | trống | OA và mẫu ZNS đã duyệt (kênh `zalo`) |
| `ESMS_ZALO_DATA` | `{"otp":"{ma}","time":"{phut}"}` | ánh xạ tham số mẫu ZNS |
| `ESMS_SMS_TEMPLATE` | `{ma} la ma xac thuc 9app ...` | nội dung SMS (không dấu) |
| `ESMS_CHANNELS` | `zalo,sms` | thứ tự thử kênh; kênh chưa cấu hình bị bỏ qua |
| `ESMS_SANDBOX`, `ESMS_BASE`, `ESMS_TIMEOUT_MS` | | thử nghiệm với eSMS |
| `OTP_DAILY_PER_PHONE` / `OTP_DAILY_PER_IP` / `OTP_DAILY_GLOBAL` / `OTP_DAILY_RESERVED` | `5` / `30` / `2000` / `400` | hạn mức mã OTP mỗi 24 giờ: theo số (tính riêng cho đăng ký và đặt lại mật khẩu), theo IP (IPv6 gom /64; nới cho CGNAT), toàn hệ, và phần dành riêng cho đặt lại mật khẩu của tài khoản đã có. Cảnh báo ở 50% và 80% trần (log + Console summary) |
| `OTP_MAX_TRIES_TOTAL` / `OTP_DAILY_GUESSES` | `20` / `25` | khóa mã sau 5 lần sai CÙNG một IP, hoặc 20 lần sai tổng cộng, hoặc 25 lần dò mỗi ngày mỗi số |
| `POW_BITS` | `16` | độ khó proof-of-work (hashcash) trước khi gửi SMS; tự tăng tối đa +3 bit khi lượng xin OTP tăng bất thường |
| `OTP_RESEND_SEC` | `60` | khoảng cách tối thiểu giữa hai lần gửi cho một số |
| `VERIFY_PER_IP_HOUR` | `30` | số lần nhập mã OTP mỗi IP mỗi giờ |
| `LOGIN_PAIR_LIMIT` / `LOGIN_PHONE_LIMIT` / `LOGIN_IP_LIMIT` | `5` / `30` / `40` | số lần sai trước khi khóa tạm: theo (số, IP) có lùi dần; theo số (mọi IP); theo IP |
| `SSO_9SPORT_URL` | trống | địa chỉ nội bộ của 9Sport để nhập tài khoản cũ (trống = tắt) |
| `INTERNAL_KEYS` | trống | khóa API nội bộ cho các app: `family:SECRET,fin:SECRET` (secret >= 32 ký tự). Trống thì `/internal/` trả 404 |
| `INTERNAL_LAST4_APPS` | trống | các key id được xin `phoneLast4` qua `verify` |
| `INTERNAL_DELEGATE_APPS` | trống | app được dùng `as` không kèm token phiên (bị ghi nhật ký, giới hạn `INTERNAL_DELEGATE_LIMIT_PER_MIN`=1200). App khác phải kèm `X-9ID-Token`. **Osin phải có trong danh sách này** (không có cookie `nine_sid`; kiểm tích hợp: `osin/test/integration`) |
| `INTERNAL_IMPORT_APPS` | trống | app được nhập gia đình hiện có (mục "Nhập gia đình") |
| `OAUTH_CLIENTS` | trống | app ở tên miền con riêng đăng nhập bằng mã dùng một lần: `osin=https://osin.9app.tech/auth/callback;khac=...`. Khớp CHÍNH XÁC, https, không wildcard; mỗi client cần khóa cùng tên trong `INTERNAL_KEYS`. `OAUTH_REQUIRE_CONSENT=0` tắt màn "Cho phép" |
| `INTERNAL_LIMIT_PER_MIN` | `6000` | hạn mức yêu cầu mỗi key mỗi phút |
| `CONSOLE_API_KEY_ID`, `CONSOLE_API_SECRET` | trống | bật API cho 9app Console (trống thì `/admin-api/` trả 404) |
| `TRUSTED_PROXY_HOPS` | `1` | số proxy tin cậy; IP khách lấy từ phần tử thứ n tính từ CUỐI của `X-Forwarded-For`; production yêu cầu >= 1 |
| `RATE_LIMIT_PER_MIN`, `SESSION_LIMIT_PER_MIN` | `3000`, `180` | giới hạn yêu cầu mỗi IP, mỗi phiên |
| `INVITES_PER_USER_DAY` | `20` | số lời mời mỗi người gửi mỗi ngày |

Cập nhật lược đồ CSDL chạy tự động khi khởi động (`db/*.sql`, bảng `schema_migrations`, có khóa tư vấn nên hai bản khởi động đồng thời không đụng nhau). Dọn dữ liệu hết hạn chạy khi khởi động và mỗi 6 giờ.

**Production từ chối khởi động** khi: `DATABASE_URL` thiếu/mẫu, `PHONE_PEPPER` hoặc `EDGE_SECRET` thiếu/ngắn/mẫu/lặp ký tự, `ESMS_ZALO_DATA` không phải JSON, `OAUTH_CLIENTS` có redirect không https/wildcard hoặc thiếu khóa HMAC, `OTP_PROVIDER` khác `esms` hoặc `esms` chưa đủ cấu hình, khóa `INTERNAL_KEYS` hoặc `CONSOLE_API_SECRET` ngắn/mẫu, `TRUSTED_PROXY_HOPS` < 1.

## Triển khai (máy chủ dùng chung)

1. Tạo vai trò và CSDL riêng trong container PostgreSQL của 9Ship:
   ```
   docker exec -it 9ship-db psql -U postgres -c "CREATE ROLE id LOGIN PASSWORD '<mật khẩu mạnh>'" -c "CREATE DATABASE id OWNER id"
   ```
2. `cp .env.example .env`, điền `DATABASE_URL`, `PHONE_PEPPER`, các biến `ESMS_*` (lấy cùng bộ khóa với 9Ship/9Sport), `INTERNAL_KEYS` (mỗi app một khóa), `CONSOLE_API_SECRET`, `SSO_9SPORT_URL` nếu muốn nhập tài khoản 9Sport.
3. `docker compose -f docker-compose.server.yml up -d --build` (container `9id`, `mem_limit 160m`, mạng `9ship_internal` và `ops_tms-network`, cổng nội bộ 8102, không publish).
4. nginx (chỉ HTTPS). Mọi yêu cầu trình duyệt phải mang header bí mật `X-Edge-Secret` (giá trị `EDGE_SECRET`):
   ```
   location /id/ {
       proxy_pass http://9id:8102;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;      # 9id lấy IP từ phần tử CUỐI (TRUSTED_PROXY_HOPS=1)
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header X-Edge-Secret "<giá trị EDGE_SECRET>";   # khách gửi header này cũng bị nginx ghi đè
       client_max_body_size 128k;
   }
   # PHẢI chặn từ internet: API nội bộ cho app và API Console (kể cả trên host osin.9app.tech và mọi host khác)
   location ^~ /id/internal/  { return 404; }
   location ^~ /id/admin-api/ { allow <địa chỉ nội bộ của Console>; deny all; proxy_pass http://9id:8102; }
   ```
   Đường `/id/authorize` và `/id/api/oauth/*` đi qua `location /id/` ở host `9app.tech` (trình duyệt mở). Host `osin.9app.tech` **không** proxy `/id/`: Osin chỉ gọi `http://9id:8102/id/internal/v1/...` qua mạng docker, và nếu cùng nginx phục vụ `osin.9app.tech` thì thêm `location ^~ /id/ { return 404; }` để chắc chắn `/id/internal/` không lộ ra tên miền đó.
   Không dùng `sub_filter` trên `/id/`. 9id tự thêm HSTS khi production.
   **Cloudflare/CDN**: nếu đặt Cloudflare trước nginx, nginx phải khôi phục IP thật rồi truyền xuống (`set_real_ip_from` các dải Cloudflare + `real_ip_header CF-Connecting-IP`, rồi vẫn `X-Forwarded-For $remote_addr` và `TRUSTED_PROXY_HOPS=1`), hoặc để nguyên chuỗi `X-Forwarded-For` của Cloudflare và đặt `TRUSTED_PROXY_HOPS=2`. Sai số bước nhảy làm mọi người dùng chung một IP hoặc cho phép giả IP, nên luôn kiểm bằng cách gọi `/id/api/me` từ ngoài rồi xem `audit`/log.
   Cổng 8102 chỉ được gọi từ nginx và các app qua mạng docker. `EDGE_SECRET` chặn container khác trong `ops_tms-network` gọi thẳng và giả IP; nếu muốn chặt hơn, tạo mạng riêng `9id_internal`.
5. Launcher: thêm ô 9id (icon `public/icon.svg`, đường dẫn `/id/`) vào `js/apps.js`, sao chép `public/search-index.json` hoặc để launcher tải `/id/search-index.json` (xem `vannien/docs/SEARCH-INDEX.md`). Việc này chưa làm, thuộc phần launcher.
6. Console: khai app `id`, địa chỉ `http://9id:8102/id/admin-api/v1`, key và secret như trên.
7. Kiểm tra sau triển khai: mở `https://9app.tech/id/`, đăng ký bằng số thật (kiểm OTP đến qua Zalo/SMS), và xác nhận `https://9app.tech/id/internal/v1/verify` trả 404 từ internet.

## Cho các app khác (API nội bộ)

Mỗi app một khóa (`INTERNAL_KEYS`). Dùng `client/nine-id.js` (Node 18+, không phụ thuộc gì) hoặc tự ký:

```
X-9ID-Key: family
X-9ID-Ts:  <giây Unix, lệch tối đa 120 giây>
X-9ID-Nonce: <16..64 ký tự [A-Za-z0-9_-], mỗi yêu cầu một nonce mới>
X-9ID-Sig: hex(HMAC-SHA256(secret, ts \n nonce \n METHOD \n đường-dẫn-và-query \n sha256(body)))
```

| Endpoint (gốc `http://9id:8102/id`) | Trả về |
|---|---|
| `POST /internal/v1/verify` `{token, fields?}` | `{userId, displayName, phoneLast4?}` hoặc 401 `invalid_session` |
| `GET /internal/v1/users/:uid/families` | `{families:[{id,name,role,memberCount,childCount}], pendingInvitations, pendingApprovals}` |
| `GET /internal/v1/families/:fid/members?as=:uid` | `{role, members:[{userId,displayName,role,joinedAt}]}` |
| `GET /internal/v1/families/:fid/children?as=:uid` | `{role, children:[{id,name,birthYear,linkedUserId,note?}], notesHidden}`; vai trò `con` chỉ thấy hồ sơ của mình, không có `note`; thành viên (không phải chủ) vừa vào dưới 24 giờ cũng không có `note` trừ khi chủ bật |
| `POST /internal/v1/exchange` `{code, client, redirect_uri}` | đổi mã đăng nhập (app tên miền con) lấy `{userId, displayName, sessionId9id}`, mã dùng một lần |
| `POST /internal/v1/session-valid` `{sessionId9id}` | `{valid, userId?, displayName?}`; app kiểm lại tối đa mỗi 5 phút. `POST /internal/v1/session-end` kết thúc phiên con |
| `POST /internal/v1/import/families`, `.../import/families/:fid/claim`, `.../import/claims/:id/revoke` | nhập gia đình hiện có + mã nhận (chỉ app trong `INTERNAL_IMPORT_APPS`) |

**Ràng buộc người dùng**: các endpoint `users/:uid/...` và `families/:fid/...?as=` phải kèm header `X-9ID-Token: <token cookie nine_sid của chính người đó>` (không nằm trong chữ ký). Token không khớp `uid`/`as` → 401 `token_mismatch`; thiếu → 401 `token_required`. Nhờ vậy app bị chiếm không đọc được gia đình của người chưa từng đăng nhập qua nó. App gắn cờ `INTERNAL_DELEGATE_APPS` được bỏ token (bị ghi nhật ký, giới hạn thấp hơn).

```js
import { createNineId } from './nine-id.js';
const id = createNineId({ baseUrl: 'http://9id:8102/id', keyId: 'family', secret: process.env.NINE_ID_SECRET });
const who = await id.verify(cookies.nine_sid);           // null nếu chưa đăng nhập
if (!who) return redirect('/id/?next=' + encodeURIComponent(req.url));   // next phải là đường dẫn cùng nguồn gốc
const token = cookies.nine_sid;
const { role } = await id.members(familyId, who.userId, token); // ném NineIdError 404 nếu không thuộc gia đình
```

Lưu ý: 9id lỗi/không với tới được thì `verify` ném lỗi (đừng hiểu thành "đã đăng xuất"). Không đệm kết quả `verify` quá 60 giây. App không bao giờ nhận số điện thoại đầy đủ.

## Cấu trúc

```
db/001_init.sql          lược đồ (users, sessions, otps, tickets, throttle, families, memberships, child_profiles, invitations, internal_nonces, idem, audit)
src/server.js            khởi động, đăng ký đường dẫn, dọn dữ liệu hết hạn
src/http.js              bộ định tuyến node:http, CSRF (X-Requested-With: 9id + Origin), giới hạn tần suất, cookie nine_sid, tệp tĩnh + CSP
src/config.js            cấu hình và productionProblems
src/auth.js              phiên (cookie nine_sid, CSDL chỉ lưu SHA-256, trượt 90 ngày)
src/otp.js, otp-provider.js   OTP (băm, hạn mức, khóa hàng) và cổng gửi esms / console / mock
src/throttle.js          khóa tạm đăng nhập và hạn mức lưu trong CSDL
src/password.js          PBKDF2-SHA256 200.000 vòng (giống 9Sport/9Ship), giới hạn băm đồng thời
src/sso9sport.js         nhập tài khoản 9Sport
src/families.js          ma trận quyền, khóa gia đình, chuyển quyền chủ
src/routes/auth.js, account.js, families.js    API cho trình duyệt (/api/...)
src/internal.js          API nội bộ cho các app (HMAC + nonce)
src/console-api.js       API cho 9app Console
client/nine-id.js        máy khách cho các app
public/                  giao diện (SPA JS thuần), search-index.json, icon
test/                    node:test: unit, auth, families, internal, console, provider, review
scripts/                 dev, test, e2e
```

## Xoay PHONE_PEPPER

Đổi `PHONE_PEPPER` làm mọi `phone_hash` cũ không còn khớp. Vì 9id **không giữ số điện thoại trong lời mời** (chỉ băm) nên không tính lại được; thay vào đó chạy hai pepper song song trong 14 ngày (hạn lời mời):
1. Đặt `PHONE_PEPPER_OLD=<pepper hiện tại>` và `PHONE_PEPPER=<pepper mới>`, khởi động lại. Lời mời mới băm bằng pepper mới; tra cứu lời mời khớp cả hai.
2. Sau tối thiểu 14 ngày (mọi lời mời cũ đã hết hạn), xóa `PHONE_PEPPER_OLD`.
Mã OTP (5 phút), vé (15 phút) và bộ đếm khóa dùng pepper mới ngay; người đang giữa chừng một OTP có thể phải xin mã lại.

## Nhập gia đình hiện có (từ 9family)

Dùng để chuyển một gia đình ẩn danh có sẵn mà không mất dữ liệu (xem spec mục 15). App được cấp quyền (`INTERNAL_IMPORT_APPS`) gọi:
- `POST /internal/v1/import/families` `{family:{id,name}, children:[{id,name,birthYear,note}]}` giữ nguyên uuid cũ, tạo gia đình **chưa có chủ**, trả `{familyId, claimId, claimCode, expiresAt}`. `claimCode` (dạng `ABCDE-FGHJK-LMNPQ-RSTUV`, 100 bit, hết hạn `CLAIM_DAYS`=30) chỉ hiện đúng một lần; trong CSDL chỉ có băm.
- `POST /internal/v1/import/families/:fid/claim` cấp lại mã (mã cũ bị thu hồi) khi chưa có chủ; `POST /internal/v1/import/claims/:id/revoke` thu hồi.
- Chủ gia đình đăng ký/đăng nhập 9id rồi nhập mã ở màn Gia đình (nút "Nhập mã nhận gia đình") hoặc `POST /api/claims/redeem {code}`: trở thành chủ. Mã dùng một lần, giới hạn 10 lần thử/giờ/người và 30/giờ/IP.

## Đăng nhập cho app ở tên miền con (Osin)

Cookie `nine_sid` không gửi sang `osin.9app.tech`, nên dùng mã dùng một lần (xem spec mục 16): Osin chuyển trình duyệt tới `/id/authorize?client=osin&redirect_uri=<đã đăng ký>&state=<ngẫu nhiên>` → 9id đăng nhập/cho phép → 302 về `redirect_uri?code=&state=` → máy chủ Osin gọi `exchange` (HMAC), lưu `sessionId9id` và gọi `session-valid` tối đa mỗi 5 phút. `client/nine-id.js` có `exchange`, `sessionValid`, `sessionEnd`.
