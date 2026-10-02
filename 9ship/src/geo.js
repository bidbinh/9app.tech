// 34 tỉnh/thành theo mô hình hai cấp (tỉnh/thành, xã/phường). Vùng chỉ dùng để chia tuyến
// (nội tỉnh / nội miền / liên miền) cho adapter mock; adapter thật dùng bảng của hãng.
// Cần đối chiếu với danh mục hành chính hiện hành và mã địa danh của từng hãng (xem SETUP-CHECKLIST).

const NORTH = ['Hà Nội', 'Lai Châu', 'Điện Biên', 'Sơn La', 'Lạng Sơn', 'Quảng Ninh', 'Cao Bằng', 'Tuyên Quang',
  'Lào Cai', 'Thái Nguyên', 'Phú Thọ', 'Bắc Ninh', 'Hưng Yên', 'Hải Phòng', 'Ninh Bình'];
const CENTRAL = ['Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Trị', 'Huế', 'Đà Nẵng', 'Quảng Ngãi', 'Gia Lai',
  'Khánh Hòa', 'Lâm Đồng', 'Đắk Lắk'];
const SOUTH = ['TP Hồ Chí Minh', 'Đồng Nai', 'Tây Ninh', 'Cần Thơ', 'Vĩnh Long', 'Đồng Tháp', 'Cà Mau', 'An Giang'];

export function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const REMOTE = new Set(['cao-bang', 'lai-chau', 'dien-bien', 'ca-mau']);

export const PROVINCES = [
  ...NORTH.map((name) => ({ code: slug(name), name, region: 'north' })),
  ...CENTRAL.map((name) => ({ code: slug(name), name, region: 'central' })),
  ...SOUTH.map((name) => ({ code: slug(name), name, region: 'south' })),
];

const BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));

// Nhận mã (slug) hoặc tên đầy đủ, trả về tỉnh hoặc null.
export function findProvince(input) {
  if (!input) return null;
  return BY_CODE.get(slug(input)) || null;
}

export function isRemote(code) {
  return REMOTE.has(code);
}

export function zoneOf(fromCode, toCode) {
  if (fromCode === toCode) return 'noi_tinh';
  const a = BY_CODE.get(fromCode);
  const b = BY_CODE.get(toCode);
  if (a && b && a.region === b.region) return 'noi_mien';
  return 'lien_mien';
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
