# Hợp đồng adapter hãng / đơn vị tổng hợp

Mỗi hãng (hoặc đơn vị tổng hợp) là một adapter. Thêm hãng mới = thêm một tệp, không sửa lõi.

## Nạp adapter

```
CARRIER_MODULES=./carriers/donvi.js,/opt/9ship/extra/khac.js
MOCK_CARRIERS=false
```

Tệp xuất mặc định một hàm nhận `config` và trả về một adapter hoặc mảng adapter:

```js
export default function create(config) {
  return {
    id: 'donvi-ghn',            // duy nhất, ổn định (lưu vào đơn)
    name: 'Đơn vị X - GHN',
    capabilities: { dropoff: true, pickup: true, findByReference: true, idempotentCreate: true,
                    webhook: true, officeList: true, labelNative: false },
    async quote(req) { /* ... */ },
    async createShipment(req) { /* ... */ },
    async cancel(code) { /* ... */ },
    async track(code) { /* ... */ },
    async findByReference(ref) { /* ... */ },
    async listPickupPoints({ lat, lng, radiusKm }) { /* ... */ },
    parseWebhook(headers, rawBody) { /* ... */ },
  };
}
```

Lõi từ chối nạp adapter thiếu `id, name, capabilities, quote, createShipment, cancel, track, listPickupPoints`.

## Năng lực (`capabilities`)

| Khóa | Ý nghĩa | Hệ quả khi `false` |
|---|---|---|
| `dropoff` / `pickup` | gửi tại bưu cục / lấy tận nơi | offer bị lọc theo lựa chọn của khách |
| `findByReference` | tra đơn theo `ref` của 9Ship | timeout khi tạo đơn: **không tự nhả tiền**, vào hàng đợi quản trị sau `UNKNOWN_CREATE_HOURS` |
| `idempotentCreate` | gọi `createShipment` lại với cùng `ref` không tạo đơn thứ hai | đơn gặp sự cố giữa chừng vào hàng đợi quản trị thay vì tự thử lại |
| `webhook` | hãng gọi webhook | hãng được hỏi hành trình định kỳ (5 phút) |
| `officeList` | có danh sách bưu cục | không có "quầy gần nhất" cho hãng này |

**Cảnh báo `idempotentCreate`:** chỉ đặt `true` khi đã kiểm chứng với sandbox rằng gọi lại cùng `ref` không tạo trùng. Đặt sai có thể tạo hai đơn thật.

## Phương thức

### `quote(req) → Offer[]`
`req = { from:{province,ward,lat?,lng?}, to:{province,ward}, weightG, dims:{l,w,h}|null, declaredValue, goodsType, handover }`. `province` là mã slug của 9Ship (xem `src/geo.js`); adapter đổi sang mã của hãng. Trả mảng rỗng khi hãng không nhận (loại hàng, cân, tuyến). Ném `CarrierError` khi lỗi.

Mỗi `Offer`:
```js
{ service, serviceName, contract,           // contract: tài khoản/hợp đồng dùng để gửi
  handovers: ['dropoff','pickup'],
  etaDays: [min, max],
  chargeableWeightG,                         // adapter tự áp hệ số quy đổi của hãng
  cost: { total, breakdown: { freight, surcharge, insurance, serviceFee, vat } },  // số nguyên đồng; breakdown CỘNG ĐÚNG total
  listPrice, listPriceVerifiedAt,            // giá niêm yết công bố CÙNG CƠ SỞ (cùng thành phần, cùng VAT); null nếu không biết
  priceToken }                               // token giá hãng bảo đảm (null nếu không có)
```
`cost.total` là **tổng đầu vào 9Ship phải trả**, gồm cả phí dịch vụ của đơn vị tổng hợp và thuế trên đó. Không có `listPrice` đáng tin thì offer bị ẩn (trừ khi tắt `require_cap`) hoặc lấy trần từ bảng `list_prices`.

### `createShipment(req) → { carrierCode, trackingCode, fee, labelUrl? }`
`req.ref` là mã tham chiếu duy nhất của 9Ship, **giữ nguyên qua các lần thử**; truyền cho hãng để chống tạo trùng. `fee` là cước thực hãng tính (số nguyên đồng). Ném:
- `new CarrierError(msg)` — hãng từ chối rõ ràng (tiền được nhả).
- `new CarrierError(msg, { retryable: true })` — lỗi tạm thời (thử lại có backoff, tối đa 4 lần).
- `new CarrierError(msg, { unknown: true })` — không biết hãng đã nhận chưa (timeout, mất kết nối). Mọi lỗi khác không phải `CarrierError` cũng bị coi là "không rõ".

### `cancel(code) → { status: 'confirmed'|'rejected'|'pending', reason?, feeRetained? }`
`feeRetained`: phí hãng giữ lại khi hủy (đồng). `pending` = hãng chưa xác nhận; 9Ship sẽ kiểm tra lại định kỳ.

### `track(code) → [{ eventId, status, note, at, feeTotal? }]`
`eventId` duy nhất ổn định (sự kiện trùng bị bỏ qua). `status` thuộc: `created, picked_up, in_transit, delivery_failed, returning, delivered, returned, lost, cancelled`. Trạng thái chỉ tiến, sự kiện đến muộn không làm lùi. `feeTotal` = **cước tổng mới** khi hãng cân/đo lại (không phải phần chênh).

### `parseWebhook(headers, rawBody) → [{ eventId, code, status, at, note, feeTotal?, feeFinal?, listTotal? }]`
Phải **xác thực chữ ký** và ném `CarrierError` nếu sai. `feeFinal: true` khi cước đã chốt (nhả tiền đệm ngay). `listTotal` = giá niêm yết của chính cân đã xác nhận (để áp trần); nếu hãng chỉ cho biết cân (`weightG`), 9Ship tra bảng `list_prices`. Không có cả hai thì khách trả trọn phần cước tăng. Phần cước hãng thu vượt trần, hoặc không thu được của khách vì ví vượt hạn mức, do 9Ship chịu (đơn được gắn cờ `fee_unpaid` cho quản trị).

### `findByReference(ref) → { carrierCode, trackingCode, fee } | null`
`null` = hãng **xác nhận chưa có** đơn. Nếu không chắc (lỗi mạng) thì ném lỗi, đừng trả `null`.

### `listPickupPoints({lat,lng,radiusKm}) → [{ id, carrier, type, name, address, lat, lng, hours, source }]`
`id` duy nhất toàn cục (nên có tiền tố `id` của adapter).

## Kiểm thử

`test/carrier-contract.test.js` chạy trên mọi adapter đã đăng ký. Thêm adapter vào registry trong test (hoặc chạy với `CARRIER_MODULES` và sandbox) để chạy cùng bộ kiểm thử: kiểu dữ liệu, `breakdown` cộng đúng tổng, `createShipment` idempotent theo `ref`, `track`, `cancel`, `listPickupPoints`. Adapter thật chỉ được bật khi qua bộ này **và** pha 0 (xem `SETUP-CHECKLIST.md`).
