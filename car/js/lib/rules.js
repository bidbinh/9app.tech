// Chu kỳ kiểm định theo quy định hiện hành (xem car/docs/NGUON.md: nguồn, ngày tra cứu, mức xác minh).
// chuKyDangKiem(xe, ctx) -> { thang, xacMinh, ghiChu, nguon } ; thang = null nghĩa là phải nhập tay.
import { addMonths, addDays, nam } from './dates.js';

export const NGUON = {
  tt47: 'Thông tư 47/2024/TT-BGTVT (hiệu lực 01/01/2025), phụ lục chu kỳ kiểm định',
  luat: 'Luật Trật tự, an toàn giao thông đường bộ 2024 (hiệu lực 01/01/2025)',
  qd13: 'Quyết định 13/2026/QĐ-TTg (ban hành 02/04/2026, hiệu lực 16/05/2026)',
};

/** Mốc bắt đầu kiểm định khí thải xe máy theo khu vực (Quyết định 13/2026/QĐ-TTg). */
export const MOC_KHI_THAI = {
  'hn-hcm': { ngay: '2027-07-01', ten: 'Hà Nội, TP. Hồ Chí Minh' },
  'tptw': { ngay: '2028-07-01', ten: 'các thành phố trực thuộc trung ương còn lại' },
  'tinh': { ngay: '2030-07-01', ten: 'các tỉnh còn lại' },
};

export const LOAI_XE = [
  { id: 'oto', ten: 'Ô tô chở người đến 8 chỗ' },
  { id: 'oto-khach', ten: 'Ô tô chở người trên 8 chỗ' },
  { id: 'oto-tai', ten: 'Ô tô tải, xe chuyên dùng' },
  { id: 'xemay', ten: 'Xe máy, xe mô tô' },
];

function tuoi(xe, ngay) {
  const nsx = Number(xe.namSX);
  if (!Number.isFinite(nsx) || nsx < 1950) return null;
  return nam(ngay) - nsx;
}

/**
 * Chu kỳ (tháng) của giấy chứng nhận kiểm định cấp vào `ngay`.
 * xe: {loai, namSX, kinhDoanh, caiTao}; ctx: {ngay: ISO ngày kiểm định, lanDau: bool}
 */
export function chuKyDangKiem(xe, ctx) {
  const { ngay, lanDau = false } = ctx;
  const t = tuoi(xe, ngay);
  const chuaRoNam = { thang: null, xacMinh: false, ghiChu: 'Chưa có năm sản xuất nên không tính được chu kỳ. Hãy nhập năm sản xuất hoặc nhập hạn theo tem, giấy kiểm định.', nguon: '' };
  if (xe.loai === 'xemay') {
    if (t === null) return chuaRoNam;
    const thang = t <= 5 ? 60 : t <= 12 ? 24 : 12;
    return {
      thang, xacMinh: true, khiThai: true, nguon: `${NGUON.luat}; ${NGUON.tt47}`,
      ghiChu: 'Xe máy chỉ kiểm định khí thải. Thời gian sản xuất đến 5 năm: 60 tháng (không phải mang xe đi kiểm), trên 5 đến 12 năm: 24 tháng, trên 12 năm: 12 tháng. Chưa đối chiếu nguyên văn điều khoản, chỉ qua các bài tổng hợp pháp luật.',
    };
  }
  if (xe.loai === 'oto-tai') {
    return { thang: null, xacMinh: false, nguon: '', ghiChu: 'Chu kỳ ô tô tải và xe chuyên dùng chưa xác minh được (các nguồn tổng hợp không thống nhất). Hãy nhập hạn theo tem, giấy kiểm định.' };
  }
  if (xe.loai !== 'oto' && xe.loai !== 'oto-khach') return { thang: null, xacMinh: false, nguon: '', ghiChu: 'Loại xe này chưa có quy tắc. Hãy nhập tay.' };
  if (t === null && !lanDau) return chuaRoNam;
  if (xe.caiTao) {
    return { thang: lanDau ? 12 : 6, xacMinh: false, nguon: NGUON.tt47, ghiChu: 'Xe có cải tạo: chu kỳ đầu 12 tháng, sau đó 6 tháng (chỉ gặp ở một nguồn tổng hợp, chưa đối chiếu nguyên văn).' };
  }
  const kd = xe.loai === 'oto-khach' || xe.kinhDoanh;
  if (xe.loai === 'oto-khach') {
    // Các nguồn tổng hợp mâu thuẫn (mốc 5 năm với 7 hoặc 15 năm): không khẳng định là đã xác minh.
    return {
      thang: lanDau ? 24 : t <= 5 ? 12 : 6, xacMinh: false, nguon: NGUON.tt47,
      ghiChu: 'Ô tô chở người trên 8 chỗ: nhiều nguồn ghi chu kỳ đầu 24 tháng, đến 5 năm 12 tháng, trên 5 năm 6 tháng, nhưng có nguồn ghi mốc 7 hoặc 15 năm khác. CHƯA XÁC MINH, hãy nhập hạn theo tem, giấy kiểm định.',
    };
  }
  if (kd) {
    if (lanDau) return { thang: 24, xacMinh: true, nguon: NGUON.tt47, ghiChu: 'Chu kỳ đầu của xe đến 8 chỗ kinh doanh vận tải: 24 tháng.' };
    return { thang: t <= 5 ? 12 : 6, xacMinh: true, nguon: NGUON.tt47, ghiChu: 'Xe đến 8 chỗ kinh doanh vận tải: đến 5 năm kể từ năm sản xuất 12 tháng, trên 5 năm 6 tháng.' };
  }
  if (lanDau) return { thang: 36, xacMinh: true, nguon: NGUON.tt47, ghiChu: 'Ô tô không kinh doanh vận tải (từ 8 chỗ trở xuống): chu kỳ đầu 36 tháng.' };
  return {
    thang: t <= 7 ? 24 : t <= 20 ? 12 : 6, xacMinh: true, nguon: NGUON.tt47,
    ghiChu: 'Ô tô không kinh doanh vận tải: đến 7 năm kể từ năm sản xuất 24 tháng, trên 7 đến 20 năm 12 tháng, trên 20 năm 6 tháng.',
  };
}

export const LUU_Y_HAN = 'Hạn gợi ý, hãy đối chiếu với tem/giấy kiểm định. Kiểm định sớm trước hạn, hoặc xe bị giới hạn bởi niên hạn sử dụng hay hạn đăng ký, có thể cho hạn khác (chưa xác minh cách tính). Bạn có thể sửa tay.';

/** Hạn của giấy chứng nhận: ngày cấp cộng chu kỳ rồi trừ 1 ngày (cấp 10/5/2025, 36 tháng thì hết hạn 9/5/2028). Chỉ là hạn gợi ý. */
export function hanKiemDinh(ngayCap, thang) {
  return addDays(addMonths(ngayCap, thang), -1);
}

/** Ước hạn đầu khi chỉ biết ngày đăng ký/xuất xưởng (gợi ý, nên đối chiếu tem). */
export function uocHanDau(xe, ngayGoc) {
  const r = chuKyDangKiem(xe, { ngay: ngayGoc, lanDau: true });
  return r.thang ? { ...r, han: hanKiemDinh(ngayGoc, r.thang), uoc: true } : { ...r, han: null };
}

/** Hạng GPLX -> thời hạn (năm) theo Luật TTATGTĐB 2024. nam = null: không thời hạn. */
export function thoiHanGPLX(hang) {
  const h = String(hang || '').toUpperCase().replace(/\s/g, '');
  if (['A1', 'A', 'B1'].includes(h)) return { nam: null, ghiChu: 'Hạng A1, A, B1: không thời hạn theo Luật 2024. Thẻ cấp trước đây vẫn dùng đến hết hạn ghi trên thẻ.' };
  if (['B', 'C1'].includes(h)) return { nam: 10, ghiChu: 'Hạng B, C1: 10 năm kể từ ngày cấp.' };
  if (['C', 'D1', 'D2', 'D', 'BE', 'C1E', 'CE', 'D1E', 'D2E', 'DE'].includes(h)) return { nam: 5, ghiChu: 'Hạng C, D1, D2, D và các hạng có rơ moóc: 5 năm kể từ ngày cấp.' };
  return null;
}
