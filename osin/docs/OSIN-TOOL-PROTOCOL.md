# Giao thức công cụ của Osin (v1)

Dành cho người tích hợp một app vào Osin, trợ lý AI của hệ 9app. Thiết kế tổng thể: `docs/superpowers/specs/2026-10-05-osin-design.md`. Mã tham chiếu: `osin/sdk/osin-sdk.js` (đã có test), app mẫu dùng SDK: `osin/test/fake-app.js`.

## 1. Ý tưởng

Mỗi app tự khai báo một danh sách **công cụ** (việc Osin được phép nhờ app làm hộ người dùng). Osin gộp công cụ của mọi app, đưa cho mô hình ngôn ngữ, và khi mô hình chọn một công cụ thì Osin gọi app qua một API nội bộ có chữ ký. Ba nguyên tắc:

1. **App là nguồn quyền duy nhất.** Mỗi lời gọi mang `actingUserId` (người dùng 9app đang trò chuyện) và tùy chọn `familyId`. App kiểm quyền theo hai giá trị này ở **mọi** lần gọi, kể cả xem trước. Osin không bao giờ quyết định ai được làm gì.
2. **Ghi thì phải được người dùng xác nhận.** Công cụ ghi được gọi hai lần: `preview` (kiểm tra, mô tả, không ghi) rồi, chỉ khi người dùng bấm Xác nhận trên giao diện, `execute`.
3. **Kết quả là dữ liệu, không phải lệnh.** Osin bọc và làm sạch kết quả, nhưng app cũng nên tránh trả về văn bản do người khác nhập mà không cần thiết.

## 2. Đặt điểm cuối trong app (vài dòng)

```js
import http from 'node:http';
import { createOsinApi } from '../osin/sdk/osin-sdk.js';

const osin = createOsinApi({
  appId: 'family',                              // [a-z0-9]{2,20}, trùng id trong apps.json của Osin
  prefix: '/family/osin-api/v1',                // đường dẫn app nhìn thấy (đã gồm BASE_PATH)
  keys: { osin: process.env.OSIN_KEY_SECRET },  // keyId -> bí mật kênh (>= 32 ký tự), mỗi app một khóa riêng
  receipt: { secret: process.env.OSIN_RECEIPT_SECRET }, // khóa biên nhận xác nhận, KHÁC khóa kênh; hoặc { verify } (9id ký Ed25519), hoặc false (chỉ để thử)
  tools: [
    {
      name: 'lich_hom_nay',
      description: 'Lấy lịch học và đưa đón hôm nay của các con trong gia đình đang chọn.',
      readOnly: true,
      parameters: { type: 'object', properties: { ngay: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD, mặc định hôm nay' } } },
      async authorize(args, ctx) { await requireMember(ctx.userId, ctx.familyId); },   // ném lỗi có osinCode nếu không được
      async run(args, ctx) { return { su_kien: await db.eventsOf(ctx.familyId, ctx.userId, args.ngay) }; },
    },
    {
      name: 'them_vao_danh_sach',
      description: 'Thêm một mục vào danh sách đi chợ của gia đình.',
      readOnly: false, confirm: true,
      parameters: { type: 'object', properties: { muc: { type: 'string', maxLength: 80 } }, required: ['muc'] },
      summaryTemplate: 'Thêm "{muc}" vào danh sách đi chợ',
      async authorize(args, ctx) { await requireRole(ctx.userId, ctx.familyId, ['chu', 'quan_ly', 'thanh_vien']); },
      async run(args, ctx) { await db.addItem(ctx.familyId, args.muc, ctx.userId); return { message: `Đã thêm "${args.muc}" vào danh sách đi chợ.` }; },
    },
  ],
});

http.createServer((req, res) => {
  if (osin.matches(req.url)) return osin.handle(req, res);   // trước router hiện có của app
  router(req, res);
});
```

`authorize` ném lỗi dạng `Object.assign(new Error('Vai trò con không được sửa danh sách'), { osinCode: 'forbidden' })`. SDK chuẩn hóa lỗi, che mọi lỗi bất ngờ (không lộ nội dung).

SDK tự lo: kiểm chữ ký HMAC, thời gian, nonce chống phát lại, **biên nhận xác nhận cho công cụ ghi**, giới hạn tần suất theo `actingUserId` (mặc định 120 execute/phút, `userRate`), nhật ký kiểm toán cho mọi execute (`audit(e)`: người dùng, công cụ, băm tham số, requestId; không có giá trị tham số), từ chối yêu cầu ký trước lúc tiến trình khởi động (kho nonce trong bộ nhớ),  kiểm tham số theo schema (chặt, không nhận thuộc tính lạ), `preview` không chạy `run`, công cụ ghi chạy **đúng một lần** theo `requestId`, giới hạn kích thước, chuẩn hóa lỗi. Nếu app chạy nhiều bản hoặc cần bền qua khởi động lại: `createNonceStore({ initial, persist })` (nạp lại và lưu bền từng nonce) hoặc tự cài `nonceStore`/`resultStore` bằng CSDL (cùng giao diện `claim(key)` và `once(key, fingerprint, fn)`; SDK chưa kèm bản lưu bền của `resultStore`), và đặt `persistent: true`.

**nginx**: chặn `/<app>/osin-api/` từ internet (`location ^~ /family/osin-api/ { deny all; }` hoặc `allow` chỉ mạng docker). Osin gọi thẳng tên container trong mạng nội bộ.

## 3. Khai báo công cụ: `GET <prefix>/tools`

```json
{ "protocol": 1, "app": "family", "tools": [ {
  "name": "them_vao_danh_sach",
  "description": "Thêm một mục vào danh sách đi chợ của gia đình.",
  "parameters": { "type": "object", "properties": { "muc": { "type": "string", "maxLength": 80 } }, "required": ["muc"] },
  "readOnly": false, "confirm": true, "sensitive": false,
  "summaryTemplate": "Thêm \"{muc}\" vào danh sách đi chợ" } ] }
```

| Trường | Ý nghĩa |
|---|---|
| `name` | `[a-z][a-z0-9_]{1,40}`. Osin hiện cho mô hình thấy là `appId__name`. |
| `description` | Tiếng Việt, 10–500 ký tự, **viết cho mô hình**: khi nào dùng, trả về gì. |
| `parameters` | JSON Schema loại `object`, tập con: `type`, `properties`, `required`, `enum`, `items`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `nullable`, `description`. Tối đa 4 KB. **Không nhận thuộc tính ngoài khai báo.** |
| `readOnly` | `true` chỉ khi công cụ **không thay đổi gì** ở bất cứ đâu. Mọi giá trị khác `true` coi là công cụ ghi. **Osin chỉ chạy ngay công cụ readOnly mà vận hành đã duyệt** bằng cách liệt kê tên trong `readOnlyTools` của app đó trong `apps.json`; công cụ app tự khai readOnly nhưng chưa được duyệt vẫn đi qua thẻ xác nhận. |
| `confirm` | Công cụ ghi luôn cần xác nhận (SDK ép `true`). Công cụ đọc có `confirm:true` **cũng đi qua thẻ xác nhận rồi mới chạy** (đúng như viết ở đây; hiếm khi cần). |
| `sensitive` | `true` cho việc rất nhạy cảm (tiền, xóa dữ liệu hàng loạt, gửi tin cho người khác, mật khẩu, phân quyền). **Bản đầu Osin từ chối hẳn**, không đưa cho mô hình; người dùng được hướng dẫn mở app. |
| `summaryTemplate` | Câu tiếng Việt cho thẻ xác nhận, điền `{ten_tham_so}`. Hoặc app tự viết hàm `preview(args, ctx)` trả `{ summary }` (ưu tiên khi cần tóm tắt giàu hơn, ví dụ tên con thay vì id). |

Giới hạn Osin áp lên manifest: tối đa 40 công cụ/app; công cụ sai quy tắc bị bỏ qua; manifest đệm 60 giây.

## 4. Gọi công cụ: `POST <prefix>/call`

Thân (JSON):

```json
{ "tool": "them_vao_danh_sach", "args": { "muc": "sữa" }, "mode": "preview",
  "actingUserId": "b3c1d2e4-...", "familyId": "5f0a...", "requestId": "8a1c...",
  "ts": "1791200000", "nonce": "q9Lk3x0wJ2m1Zp8aVb7TcA" }
```

| Trường | Ý nghĩa |
|---|---|
| `mode` | `execute` (mặc định) hoặc `preview`. `preview` **không được ghi gì**. |
| `actingUserId` | `userId` 9id của người đang trò chuyện (`[A-Za-z0-9_-]{1,64}`). |
| `familyId` | Gia đình người dùng đang chọn trong Osin (đã kiểm với 9id), có thể vắng. App **vẫn phải kiểm** người dùng thuộc gia đình đó. |
| `receipt` | Chỉ có ở `execute` của công cụ ghi sau khi người dùng bấm Xác nhận: `base64url{userId, tool, argsHash, requestId, exp<=2 phút}.HMAC` ký bằng `receiptSecret` (khác khóa kênh). SDK kiểm khớp người dùng, công cụ, băm tham số, `requestId`, hạn; sai/thiếu thì `receipt_required`. Công cụ đọc không cần. |
| `requestId` | Với `execute` của công cụ ghi, bằng id hành động chờ. Cùng `requestId` chỉ chạy một lần. |
| `ts`, `nonce` | Phải trùng header `X-Osin-Ts`, `X-Osin-Nonce`. |

Phản hồi:

```json
{ "ok": true,  "result": { "message": "Đã thêm \"sữa\" vào danh sách đi chợ." } }
{ "ok": true,  "preview": { "summary": "Thêm \"sữa\" vào danh sách đi chợ" } }
{ "ok": false, "error": { "code": "forbidden", "message": "Vai trò con không được sửa danh sách" } }
```

- HTTP 200 cho cả lỗi nghiệp vụ (`ok:false`); 401 cho lỗi chữ ký/replay/lệch giờ; 400/404/405/413 cho lỗi giao thức; 5xx hoặc không trả lời được thì Osin coi là app sập.
- Mã lỗi gợi ý: `forbidden`, `not_found`, `invalid_args`, `unknown_tool`, `conflict`, `limit_reached`, `internal`. `message` là tiếng Việt, tối đa 300 ký tự, **không chứa dữ liệu nhạy cảm**; mô hình và người dùng đều có thể đọc.
- `result` của công cụ ghi nên có `message` (câu thông báo kết quả hiển thị trên thẻ).
- `result` tối đa 100 KB (khuyến nghị dưới 8.000 ký tự: Osin cắt phần dư khi đưa cho mô hình). Trả gọn, chỉ trường cần thiết, không trả số điện thoại, mật khẩu, mã.
- Liên kết sâu: `result.links = [{ "label": "lịch 9family", "path": "/family/#/lich" }]`. Osin chỉ nhận đường dẫn bắt đầu bằng tiền tố của app (mặc định `/<id>/`, đổi bằng `linkPrefix` trong `apps.json`); mọi thứ khác bị bỏ. Osin hiển thị là nút "Mở <label>".

## 5. Chữ ký HMAC

Mỗi app có một cặp `keyId` + `secret` (≥ 32 ký tự ngẫu nhiên) cấp riêng, khai trong `apps.json` của Osin và `keys` của SDK. Header:

```
X-Osin-Key:   <keyId>
X-Osin-Ts:    <giây Unix>; lệch tối đa 120 giây
X-Osin-Nonce: <16..64 ký tự [A-Za-z0-9_-]>; dùng một lần
X-Osin-Sig:   hex( HMAC-SHA256( secret,
                "OSIN1\n" + keyId + "\n" + ts + "\n" + nonce + "\n" + METHOD + "\n" + đường dẫn+query + "\n" + sha256hex(thân) ) )
```

- `đường dẫn+query` là chuỗi app nhận (`req.url`), ví dụ `/family/osin-api/v1/call`. `thân` là chuỗi thô (rỗng với GET).
- Nonce lưu tối thiểu 300 giây; trùng thì 401 `replay`. Nonce chỉ được ghi **sau** khi chữ ký đúng. Kho đầy thì từ chối (503), không bỏ kiểm.
- So sánh chữ ký bằng `timingSafeEqual`.

Tự viết bộ kiểm (không dùng SDK) phải làm đủ: chữ ký, ts, nonce, so khớp `ts/nonce` trong thân với header, kiểm tham số, `requestId` một lần.

## 6. Luồng xác nhận (phía Osin, app chỉ cần làm đúng `preview`/`execute`)

1. Mô hình gọi công cụ ghi → Osin kiểm tham số theo schema → gọi app `mode:"preview"`.
2. App kiểm quyền (qua `authorize`) và hợp lệ, trả `preview.summary`.
3. Osin lưu hành động chờ (id ngẫu nhiên, tham số đã chốt, tóm tắt, hạn 10 phút, HMAC toàn vẹn) và hiện thẻ **Xác nhận / Hủy** cho người dùng. Mô hình không thấy id, không thể xác nhận.
4. Người dùng bấm Xác nhận → Osin chiếm hành động bằng một câu UPDATE có điều kiện → gọi app `mode:"execute"` với `requestId = id hành động`.
5. Kết quả `done` hoặc `failed` lưu lại. Mất kết nối giữa chừng: Osin báo "chưa chắc đã thực hiện" và **không tự thử lại**. Vì vậy `run` của công cụ ghi nên **idempotent** theo `requestId` (SDK đã chặn chạy hai lần trong cùng tiến trình/kho).

## 7. Danh sách kiểm bảo mật cho người tích hợp

- [ ] Khóa riêng cho từng app, ≥ 32 ký tự ngẫu nhiên, lấy từ biến môi trường/bí mật; không commit; xoay được (đổi ở cả hai phía). **Hai bí mật khác nhau**: khóa kênh (`keys`) và khóa biên nhận (`receipt.secret`).
- [ ] Công cụ ghi: `receipt` cấu hình (không đặt `false` ở production); `audit` ghi vào nơi bền; đọc nhật ký kiểm toán định kỳ.
- [ ] `preview.summary` đủ để người dùng hiểu việc sắp làm, **gồm tên con/người bị tác động** (Osin tự thêm mọi tham số còn lại dạng "Kèm: ten=giá trị" nhưng không biết tên con từ id).
- [ ] nginx **chặn** `/<app>/osin-api/` từ internet; chỉ mạng docker nội bộ gọi được.
- [ ] `authorize` kiểm quyền theo `ctx.userId` (và `ctx.familyId`) cho **mọi** công cụ, kể cả công cụ đọc. Không có đường nào suy ra quyền từ tham số do mô hình sinh.
- [ ] Mọi truy vấn lọc theo người dùng/gia đình; id của người khác trả `not_found`, không `forbidden` (không lộ sự tồn tại), trừ khi người dùng đã thuộc gia đình đó.
- [ ] Vai "con" (và vai chỉ xem) bị giới hạn **ở phía app**: công cụ ghi trả `forbidden`; công cụ đọc chỉ trả phần dữ liệu của chính con.
- [ ] Công cụ ghi: `readOnly:false`, `summaryTemplate` hoặc `preview` rõ ràng (người dùng đọc câu này trước khi bấm), tham số có `maxLength`/`enum`/`minimum`/`maximum`, `run` idempotent theo `requestId`.
- [ ] Việc về tiền, xóa hàng loạt, gửi tin cho người khác, mật khẩu, phân quyền: đặt `sensitive:true` (Osin sẽ không thực hiện).
- [ ] Kết quả gọn, không chứa số điện thoại/mật khẩu/mã/khóa; văn bản do **người dùng khác** nhập (tên sự kiện, ghi chú) chỉ trả khi thật cần.
- [ ] `message` lỗi và kết quả không lộ chi tiết nội bộ (đường dẫn, SQL, tên bảng).
- [ ] Giới hạn tốc độ riêng cho `/osin-api/` (ví dụ 600/phút/khóa) và log chỉ ghi tên công cụ, mã lỗi, độ trễ; **không** ghi tham số/kết quả.
- [ ] Nếu app chạy nhiều bản: `nonceStore`/`resultStore` bằng CSDL; nếu không, một bản.
- [ ] Có test: chữ ký sai, phát lại, tham số lạ, người dùng ngoài gia đình, vai con, `preview` không ghi, `execute` hai lần chỉ ghi một lần.

## 8. Công cụ dự kiến cho từng app (kế hoạch, chưa làm)

Phụ thuộc: các app cần danh tính 9app (`userId`) trước. Công cụ ghi đều `confirm:true`; mục "nhạy cảm" Osin không thực hiện.

| App | Công cụ đọc | Công cụ ghi (cần xác nhận) | Nhạy cảm (Osin từ chối) |
|---|---|---|---|
| **9family** (sau khi nối 9id) | `lich_hom_nay`, `lich_tuan` (lịch học, ngoại khóa của con), `don_don_hom_nay` (ai đón, giờ nào), `danh_sach_di_cho`, `viec_can_lam`, `thuc_don_tuan`, `suc_khoe_con` (số đo tăng trưởng đã ghi), `chi_so_nguoi_lon` (huyết áp, đường huyết, lịch uống thuốc đã ghi, chỉ đọc) | `them_vao_danh_sach`, `danh_dau_da_mua`, `them_viec`, `hoan_thanh_viec`, `them_lich_hoc`, `doi_nguoi_don` | xóa gia đình/thành viên, đổi vai trò, xóa hàng loạt |
| **9lunch** | `don_dang_mo`, `toi_no_ai`, `ai_no_toi`, `lich_su_don` | `them_mon_vao_don` | thanh toán/xác nhận đã trả |
| **9tutor** (sau khi có 9id) | `lich_day_hom_nay`, `hoc_sinh_con_no`, `bao_cao_thang` | `diem_danh_buoi_hoc`, `ghi_nhat_ky_buoi` | gửi tin nhắc học phí cho phụ huynh, thu tiền |
| **9license** | `tien_do_on_tap`, `cau_sai_nhieu`, `ngay_thi_con_lai` | `bat_dau_bai_on` | (không có) |
| **9race** | `tim_giai_chay` (theo vùng, cự ly, tháng; dữ liệu công khai, không cần `actingUserId`) | (không có) | (không có) |
| **9Fin / 9Ship / 9Sport** (khi đã dùng 9id) | `chi_tieu_thang`, `so_du`, `lich_su_giao_dich`, `lich_thi_dau` | `ghi_khoan_chi`, `dat_san` | **mọi thao tác chuyển tiền, thanh toán, rút** |
| **Vạn Niên / 9unit** | (đã có qua công cụ nội bộ: âm lịch, đổi đơn vị) | | |

Thứ tự đề xuất: 9race (đơn giản, công khai) → 9family (giá trị cao, cần 9id) → 9lunch → 9tutor → 9Fin.
