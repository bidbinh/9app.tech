# Kết nối Nhanh.vn (NhanhShip)

Adapter `src/carriers/nhanh.js` tạo mỗi hãng một adapter (`nhanh-spx`, `nhanh-ghn`, ...) qua POS Open API v3.0.

## Cách hoạt động
- Cước: `shipping/fee` type 1 (kết nối dùng chung của Nhanh.vn), địa chỉ 2 cấp (v2). Bảng đổi phường: `src/carriers/data/nhanh-locations.json` (dựng lại bằng `node scripts/fetch-nhanh-locations.mjs`).
- Tạo đơn: `order/add` với `autoSend: 1`, sản phẩm mẫu `NHANH_PRODUCT_ID`. `carrierCode` của 9Ship = ID đơn Nhanh.vn, `trackingCode` = mã vận đơn hãng.
- Hủy: `order/cancelcarrier`. Hành trình: webhook `/v1/webhooks/nhanh` (header Authorization = `NHANH_WEBHOOK_TOKEN`) và hỏi lại định kỳ.

## Giới hạn
- Điểm lấy hàng luôn là KHO trong Nhanh.vn; không đặt người gửi riêng cho từng đơn. Chỉ cho gửi tại bưu cục, người gửi thật nằm trong ghi chú đơn.
- Kho phải có địa chỉ (tỉnh/phường) thì mới tính cước và tạo đơn được.
- Mã truy cập sống 1 năm (hết hạn 03/10/2027), không gia hạn: cấp quyền lại qua `https://nhanh.vn/oauth?appId=<NHANH_APP_ID>&returnLink=https://9app.tech/9ship/nhanh/callback`.

## Bật
Đặt `NHANH_ENABLED=1` sau khi: kho có địa chỉ, đã thử một đơn thật và mang ra bưu cục, đã đặt giá niêm yết (`list_prices`) cho các hãng `nhanh-*`.
