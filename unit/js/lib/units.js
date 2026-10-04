// Quy đổi đơn vị kiểu Việt Nam. Thuần dữ liệu và hàm, không phụ thuộc trình duyệt.
// Mỗi đơn vị: he = số đơn vị cơ sở của nhóm trong 1 đơn vị này (khối lượng: gam; diện tích: m2; độ dài: m;
// thể tích: lít; tốc độ: km/h). Nhiệt độ dùng hàm riêng.
import { khoaTim } from './text.js';

export const NHOM = [
  { id: 'khoiluong', ten: 'Khối lượng và vàng', coSo: 'g' },
  { id: 'dientich', ten: 'Diện tích đất', coSo: 'm2' },
  { id: 'dodai', ten: 'Độ dài', coSo: 'm' },
  { id: 'nhietdo', ten: 'Nhiệt độ', coSo: 'c' },
  { id: 'thetich', ten: 'Thể tích', coSo: 'l' },
  { id: 'tocdo', ten: 'Tốc độ', coSo: 'kmh' },
];

const GHI_CHU_VANG = '1 lượng (cây) = 10 chỉ = 37,5 g; 1 chỉ = 3,75 g (quy ước thị trường vàng Việt Nam, vàng đo theo gam).';

export const DON_VI = [
  // ---- Khối lượng
  { id: 'mg', nhom: 'khoiluong', ten: 'miligam', kh: 'mg', he: 0.001, alias: ['mg', 'mi li gam', 'miligam'] },
  { id: 'g', nhom: 'khoiluong', ten: 'gam', kh: 'g', he: 1, alias: ['g', 'gam', 'gram', 'go ram'] },
  { id: 'kg', nhom: 'khoiluong', ten: 'ki-lô-gam (cân)', kh: 'kg', he: 1000, alias: ['kg', 'ki lo gam', 'kilogram', 'ky', 'ki', 'ky lo', 'ki lo', 'can', 'can thit'] },
  { id: 'yen', nhom: 'khoiluong', ten: 'yến', kh: 'yến', he: 10000, alias: ['yen'], ghiChu: '1 yến = 10 kg.' },
  { id: 'ta', nhom: 'khoiluong', ten: 'tạ', kh: 'tạ', he: 100000, alias: ['ta'], ghiChu: '1 tạ = 100 kg.' },
  { id: 'tan', nhom: 'khoiluong', ten: 'tấn', kh: 'tấn', he: 1000000, alias: ['tan'], ghiChu: '1 tấn = 1.000 kg.' },
  { id: 'chi', nhom: 'khoiluong', ten: 'chỉ vàng', kh: 'chỉ', he: 3.75, alias: ['chi vang', 'chi'], ghiChu: GHI_CHU_VANG },
  { id: 'luong', nhom: 'khoiluong', ten: 'lượng (cây) vàng', kh: 'lượng', he: 37.5, alias: ['luong vang', 'cay vang', 'luong', 'cay'], ghiChu: GHI_CHU_VANG },
  { id: 'phan', nhom: 'khoiluong', ten: 'phân vàng', kh: 'phân', he: 0.375, alias: ['phan vang'], ghiChu: '1 phân = 0,1 chỉ = 0,375 g.' },
  { id: 'ozt', nhom: 'khoiluong', ten: 'ounce vàng (troy)', kh: 'ozt', he: 31.1034768, alias: ['ounce vang', 'oz vang', 'troy ounce', 'ounce troy', 'ozt', 'aoxo vang'], ghiChu: '1 troy ounce = 31,1034768 g (chuẩn quốc tế dùng cho giá vàng thế giới). Khác ounce thường.' },
  { id: 'lb', nhom: 'khoiluong', ten: 'pound (lb)', kh: 'lb', he: 453.59237, alias: ['lb', 'lbs', 'pound', 'bang anh', 'pao'], ghiChu: '1 lb = 453,59237 g (định nghĩa quốc tế).' },
  { id: 'oz', nhom: 'khoiluong', ten: 'ounce thường (oz)', kh: 'oz', he: 28.349523125, alias: ['oz', 'ounce', 'aoxo', 'ao xo'], ghiChu: '1 oz = 28,349523125 g (ounce thường, không phải ounce vàng).' },

  // ---- Diện tích
  { id: 'cm2', nhom: 'dientich', ten: 'xăng-ti-mét vuông', kh: 'cm²', he: 0.0001, alias: ['cm2', 'cm vuong', 'xang ti met vuong'] },
  { id: 'm2', nhom: 'dientich', ten: 'mét vuông', kh: 'm²', he: 1, alias: ['m2', 'met vuong', 'm vuong'] },
  { id: 'ft2', nhom: 'dientich', ten: 'foot vuông', kh: 'ft²', he: 0.09290304, alias: ['ft2', 'foot vuong', 'feet vuong', 'fit vuong'], ghiChu: '1 ft² = 0,09290304 m² (định nghĩa quốc tế).' },
  { id: 'sao_bb', nhom: 'dientich', ten: 'sào Bắc Bộ', kh: 'sào BB', he: 360, alias: ['sao bac bo', 'sao bac'], ghiChu: 'Sào Bắc Bộ = 360 m² (15 thước x 24 thước).' },
  { id: 'sao_tb', nhom: 'dientich', ten: 'sào Trung Bộ', kh: 'sào TB', he: 500, alias: ['sao trung bo', 'sao trung'], ghiChu: 'Sào Trung Bộ = 500 m².' },
  { id: 'mau_bb', nhom: 'dientich', ten: 'mẫu Bắc Bộ', kh: 'mẫu BB', he: 3600, alias: ['mau bac bo', 'mau bac'], ghiChu: '1 mẫu Bắc Bộ = 10 sào Bắc Bộ = 3.600 m².' },
  { id: 'mau_tb', nhom: 'dientich', ten: 'mẫu Trung Bộ', kh: 'mẫu TB', he: 5000, alias: ['mau trung bo', 'mau trung'], ghiChu: '1 mẫu Trung Bộ = 10 sào Trung Bộ = 5.000 m².' },
  { id: 'cong', nhom: 'dientich', ten: 'công đất (1.000 m²)', kh: 'công', he: 1000, alias: ['cong dat', 'cong'], ghiChu: 'Công đất tính 1.000 m² (phổ biến ở Nam Bộ). Một số nơi ở miền Tây dùng công lớn 1.296 m², nên hỏi lại địa phương trước khi giao dịch.' },
  { id: 'ha', nhom: 'dientich', ten: 'héc-ta', kh: 'ha', he: 10000, alias: ['ha', 'hecta', 'hec ta'], ghiChu: '1 ha = 10.000 m².' },
  { id: 'km2', nhom: 'dientich', ten: 'ki-lô-mét vuông', kh: 'km²', he: 1000000, alias: ['km2', 'km vuong', 'ki lo met vuong'] },
  { id: 'acre', nhom: 'dientich', ten: 'mẫu Anh (acre)', kh: 'acre', he: 4046.8564224, alias: ['acre', 'mau anh', 'ec'], ghiChu: '1 acre = 4.046,8564224 m² (định nghĩa quốc tế).' },

  // ---- Độ dài
  { id: 'mm', nhom: 'dodai', ten: 'mi-li-mét', kh: 'mm', he: 0.001, alias: ['mm', 'mi li met', 'milimet'] },
  { id: 'cm', nhom: 'dodai', ten: 'xăng-ti-mét', kh: 'cm', he: 0.01, alias: ['cm', 'xang ti met', 'xang ti'] },
  { id: 'm', nhom: 'dodai', ten: 'mét', kh: 'm', he: 1, alias: ['m', 'met'] },
  { id: 'km', nhom: 'dodai', ten: 'ki-lô-mét', kh: 'km', he: 1000, alias: ['km', 'ki lo met', 'kilomet', 'cay so'], ghiChu: '"Cây số" là cách nói thông dụng của ki-lô-mét.' },
  { id: 'inch', nhom: 'dodai', ten: 'inch (insơ)', kh: 'in', he: 0.0254, alias: ['inch', 'in', 'inh', 'inso', 'in so'], ghiChu: '1 inch = 25,4 mm (định nghĩa quốc tế).' },
  { id: 'ft', nhom: 'dodai', ten: 'foot (feet)', kh: 'ft', he: 0.3048, alias: ['ft', 'foot', 'feet', 'fit'], ghiChu: '1 ft = 0,3048 m.' },
  { id: 'yard', nhom: 'dodai', ten: 'yard', kh: 'yd', he: 0.9144, alias: ['yd', 'yard', 'yat'], ghiChu: '1 yard = 0,9144 m.' },
  { id: 'dam', nhom: 'dodai', ten: 'dặm Anh (mile)', kh: 'dặm', he: 1609.344, alias: ['dam', 'mile', 'mai', 'dam anh'], ghiChu: '1 dặm Anh = 1.609,344 m.' },
  { id: 'hl', nhom: 'dodai', ten: 'hải lý', kh: 'hải lý', he: 1852, alias: ['hai ly', 'nmi'], ghiChu: '1 hải lý = 1.852 m.' },

  // ---- Nhiệt độ (không dùng he)
  { id: 'c', nhom: 'nhietdo', ten: 'độ C (Celsius)', kh: '°C', alias: ['do c', 'do xe', 'c', 'celsius', 'do celsius', 'do'] },
  { id: 'f', nhom: 'nhietdo', ten: 'độ F (Fahrenheit)', kh: '°F', alias: ['do f', 'do ep', 'f', 'fahrenheit', 'do fahrenheit'] },
  { id: 'k', nhom: 'nhietdo', ten: 'Kelvin', kh: 'K', alias: ['kelvin'] },

  // ---- Thể tích
  { id: 'ml', nhom: 'thetich', ten: 'mi-li-lít', kh: 'ml', he: 0.001, alias: ['ml', 'mi li lit', 'mililit', 'cc'] },
  { id: 'l', nhom: 'thetich', ten: 'lít', kh: 'l', he: 1, alias: ['l', 'lit'] },
  { id: 'm3', nhom: 'thetich', ten: 'mét khối', kh: 'm³', he: 1000, alias: ['m3', 'met khoi', 'm khoi'] },
  { id: 'gal', nhom: 'thetich', ten: 'gallon Mỹ', kh: 'gal', he: 3.785411784, alias: ['gal', 'gallon', 'galon', 'ga lon', 'gallon my'], ghiChu: '1 gallon Mỹ = 3,785411784 lít.' },
  { id: 'galuk', nhom: 'thetich', ten: 'gallon Anh', kh: 'gal Anh', he: 4.54609, alias: ['gallon anh', 'galon anh'], ghiChu: '1 gallon Anh = 4,54609 lít.' },
  { id: 'floz', nhom: 'thetich', ten: 'fluid ounce Mỹ', kh: 'fl oz', he: 0.0295735295625, alias: ['fl oz', 'floz', 'fluid ounce'], ghiChu: '1 fl oz Mỹ = 29,5735295625 ml.' },

  // ---- Tốc độ
  { id: 'kmh', nhom: 'tocdo', ten: 'km/h', kh: 'km/h', he: 1, alias: ['kmh', 'km h', 'ki lo met tren gio', 'km tren gio', 'cay so tren gio'] },
  { id: 'ms', nhom: 'tocdo', ten: 'm/s', kh: 'm/s', he: 3.6, alias: ['ms', 'm s', 'met tren giay'] },
  { id: 'mph', nhom: 'tocdo', ten: 'dặm/giờ (mph)', kh: 'mph', he: 1.609344, alias: ['mph', 'dam tren gio'] },
  { id: 'knot', nhom: 'tocdo', ten: 'hải lý/giờ (knot)', kh: 'kn', he: 1.852, alias: ['knot', 'nut', 'hai ly tren gio', 'kn'] },
];

const THEO_ID = new Map(DON_VI.map((u) => [u.id, u]));
export const layDonVi = (id) => THEO_ID.get(id);
export const donViCuaNhom = (nhom) => DON_VI.filter((u) => u.nhom === nhom);

// Đơn vị đích mặc định khi người dùng chỉ nói "ba chỉ vàng bằng bao nhiêu"
export const MAC_DINH_DICH = {
  mg: 'g', g: 'oz', kg: 'lb', yen: 'kg', ta: 'kg', tan: 'kg', chi: 'g', luong: 'g', phan: 'g', ozt: 'g', lb: 'kg', oz: 'g',
  cm2: 'm2', m2: 'ft2', ft2: 'm2', sao_bb: 'm2', sao_tb: 'm2', mau_bb: 'm2', mau_tb: 'm2', cong: 'm2', ha: 'm2', km2: 'ha', acre: 'ha',
  mm: 'cm', cm: 'inch', m: 'ft', km: 'dam', inch: 'cm', ft: 'm', yard: 'm', dam: 'km', hl: 'km',
  c: 'f', f: 'c', k: 'c', ml: 'l', l: 'gal', m3: 'l', gal: 'l', galuk: 'l', floz: 'ml',
  kmh: 'mph', ms: 'kmh', mph: 'kmh', knot: 'kmh',
};

// Alias mơ hồ theo vùng: dùng bản mặc định nhưng phải cảnh báo
const ALIAS_MO_HO = {
  sao: { id: 'sao_bb', msg: 'Nói "sào" mà không nói vùng, app hiểu là sào Bắc Bộ (360 m²). Nói "sào Trung Bộ" nếu là 500 m².' },
  mau: { id: 'mau_bb', msg: 'Nói "mẫu" mà không nói vùng, app hiểu là mẫu Bắc Bộ (3.600 m²). Nói "mẫu Trung Bộ" nếu là 5.000 m².' },
  cong: { id: 'cong', msg: 'Công đất tính 1.000 m² (Nam Bộ). Một số nơi dùng 1.296 m².' },
  'cong dat': { id: 'cong', msg: 'Công đất tính 1.000 m² (Nam Bộ). Một số nơi dùng 1.296 m².' },
};

// ---- Bảng tra alias -> đơn vị (khóa đã bỏ dấu, chữ thường)
const BANG_ALIAS = new Map();
for (const u of DON_VI) {
  for (const a of u.alias) {
    const k = khoaTim(a);
    if (!BANG_ALIAS.has(k)) BANG_ALIAS.set(k, u.id);
  }
  const kt = khoaTim(u.ten);
  if (!BANG_ALIAS.has(kt)) BANG_ALIAS.set(kt, u.id);
}
for (const [a, v] of Object.entries(ALIAS_MO_HO)) if (!BANG_ALIAS.has(a)) BANG_ALIAS.set(a, v.id);
const MAX_TU = Math.max(...[...BANG_ALIAS.keys()].map((k) => k.split(' ').length));

/**
 * Tìm đơn vị bắt đầu tại vị trí `bat` của mảng từ (đã bỏ dấu, chữ thường); lấy khớp dài nhất.
 * @returns {{id:string, soTu:number, khoa:string, canhBao?:string}|null}
 */
export function quetDonVi(tu, bat) {
  for (let n = Math.min(MAX_TU, tu.length - bat); n >= 1; n--) {
    const k = tu.slice(bat, bat + n).join(' ');
    if (BANG_ALIAS.has(k)) {
      const out = { id: BANG_ALIAS.get(k), soTu: n, khoa: k };
      if (ALIAS_MO_HO[k]) out.canhBao = ALIAS_MO_HO[k].msg;
      return out;
    }
  }
  return null;
}

// ---- Nhiệt độ
const sangC = { c: (x) => x, f: (x) => (x - 32) * 5 / 9, k: (x) => x - 273.15 };
const tuC = { c: (x) => x, f: (x) => x * 9 / 5 + 32, k: (x) => x + 273.15 };

/** Đổi `gt` từ đơn vị `tuId` sang `denId`. Phải cùng nhóm. */
export function doi(gt, tuId, denId) {
  const a = THEO_ID.get(tuId); const b = THEO_ID.get(denId);
  if (!a || !b) throw new Error('Đơn vị không tồn tại');
  if (a.nhom !== b.nhom) throw new Error('Hai đơn vị khác loại, không đổi được');
  if (a.nhom === 'nhietdo') return tuC[b.id](sangC[a.id](gt));
  return (gt * a.he) / b.he;
}

/** Ghi chú liên quan tới cặp đơn vị (hiển thị dưới kết quả). */
export function ghiChuCap(tuId, denId) {
  return [...new Set([layDonVi(tuId)?.ghiChu, layDonVi(denId)?.ghiChu].filter(Boolean))];
}
