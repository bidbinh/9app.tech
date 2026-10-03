// Kiểm tra kết nối GHTK trước khi bật: gọi API tính phí thật với một tuyến mẫu (KHÔNG tạo đơn, không tốn tiền).
//   GHTK_TOKEN=... GHTK_PARTNER_CODE=... npm run ghtk:check
// Tùy chọn: GHTK_BASE (môi trường thử), GHTK_PROVINCE_ALIASES (JSON đổi tên tỉnh nếu GHTK dùng tên khác).
import { createGhtk } from '../src/carriers/ghtk.js';
import { wardsOf } from '../src/geo.js';

const a = createGhtk(process.env);
if (!a) { console.error('Thiếu GHTK_TOKEN'); process.exit(1); }
const routes = [
  ['tp-ho-chi-minh', 'ha-noi', 'liên miền'],
  ['ha-noi', 'ha-noi', 'nội tỉnh'],
  ['da-nang', 'tp-ho-chi-minh', 'liên miền (miền Trung → Nam)'],
];
let ok = 0;
for (const [from, to, label] of routes) {
  const req = { from: { province: from, ward: wardsOf(from)[0] }, to: { province: to, ward: wardsOf(to)[1] || wardsOf(to)[0] }, weightG: 1000, declaredValue: 500000, handover: 'dropoff' };
  try {
    const offers = await a.quote(req);
    if (!offers.length) console.log(`✗ ${label}: GHTK không trả dịch vụ nào (kiểm tra tên tỉnh/phường: dùng GHTK_PROVINCE_ALIASES)`);
    else { ok++; offers.forEach((o) => console.log(`✓ ${label}: ${o.serviceName} ${o.cost.total.toLocaleString('vi-VN')} đ (cước ${o.cost.breakdown.freight}, bảo hiểm ${o.cost.breakdown.insurance})`)); }
  } catch (e) {
    console.log(`✗ ${label}: ${e.message}`);
  }
}
try {
  const r = await a.findByReference('9S-KHONG-TON-TAI-' + Date.now());
  console.log(r === null ? '✓ tra theo mã tham chiếu: GHTK xác nhận chưa có đơn (đúng như mong đợi)' : '? tra theo mã tham chiếu trả về dữ liệu bất thường');
} catch (e) {
  console.log('✗ tra theo mã tham chiếu lỗi: ' + e.message + '\n  → xem lại định dạng partner_id trong URL trạng thái; đến khi sửa, adapter sẽ KHÔNG tự hoàn tiền khi timeout (an toàn).');
}
console.log(ok === routes.length ? '\nKết nối GHTK hoạt động.' : '\nCó vấn đề, xem các dòng ✗ ở trên.');
process.exit(ok === routes.length ? 0 : 2);
