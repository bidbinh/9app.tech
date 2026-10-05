// Danh mục và bộ dựng bài tập. Mọi nội dung bài tập do 9app tự viết (không chép từ nguồn có bản quyền).
export const NHOM = {
  'nguc': 'Ngực', 'lung-tren': 'Lưng trên', 'lung-duoi': 'Lưng dưới', 'vai': 'Vai', 'tay-truoc': 'Tay trước', 'tay-sau': 'Tay sau',
  'cang-tay': 'Cẳng tay, cổ tay', 'core': 'Bụng, core', 'xien': 'Cơ xoay thân', 'mong': 'Mông', 'dui-truoc': 'Đùi trước',
  'dui-sau': 'Đùi sau', 'hong': 'Hông, háng', 'bap-chan': 'Bắp chân', 'co-chan': 'Cổ chân, bàn chân', 'co': 'Cổ', 'toan-than': 'Toàn thân',
};
export const DUNG_CU = {
  'khong': 'Không dụng cụ', 'ta-don': 'Tạ đơn', 'day': 'Dây kháng lực', 'ta-am': 'Tạ ấm', 'ghe': 'Ghế chắc',
  'tuong': 'Tường', 'bac': 'Bục, bậc thang chắc', 'con-lan': 'Con lăn xốp', 'day-nhay': 'Dây nhảy', 'moc': 'Mốc (nón, chai nước)',
};
export const TAI_NHA = ['khong', 'ghe', 'tuong', 'moc', 'bac'];
export const LOAI = {
  'suc-manh': 'Sức mạnh', 'bat-nhay': 'Bật nhảy', 'nhanh-nhen': 'Nhanh nhẹn', 'core': 'Core', 'linh-hoat': 'Linh hoạt, giãn cơ',
  'khoi-dong': 'Khởi động động', 'phuc-hoi': 'Phục hồi', 'thang-bang': 'Thăng bằng, cổ chân',
};
export const MUC = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' };
export const MON = { 'cau-long': 'Cầu lông', 'pickleball': 'Pickleball', 'bong-da': 'Bóng đá', 'chay-bo': 'Chạy bộ' };
const MON_RUT = { cl: 'cau-long', pb: 'pickleball', bd: 'bong-da', cb: 'chay-bo' };

const DEM_RE = /^([LT])(\d+)x(\d+)(?:-(\d+))?(b?)$/;

/** Đọc mã đếm: L3x8-12 (3 hiệp, 8 đến 12 lần), T3x30b (3 hiệp, 30 giây, mỗi bên). */
export function docDem(s) {
  const m = DEM_RE.exec(s);
  if (!m) return null;
  const a = Number(m[3]);
  const b = m[4] ? Number(m[4]) : a;
  return m[1] === 'L'
    ? { kieu: 'lan', hiep: Number(m[2]), lanMin: a, lanMax: b, moiBen: m[5] === 'b' }
    : { kieu: 'giay', hiep: Number(m[2]), giayMin: a, giayMax: b, moiBen: m[5] === 'b' };
}

/** Văn bản mô tả cách đếm cho người dùng. */
export function moTaDem(d) {
  const ben = d.moiBen ? ' mỗi bên' : '';
  if (d.kieu === 'lan') {
    const lan = d.lanMin === d.lanMax ? `${d.lanMin}` : `${d.lanMin} đến ${d.lanMax}`;
    return `${d.hiep} hiệp × ${lan} lần${ben}`;
  }
  const g = d.giayMin === d.giayMax ? `${d.giayMin}` : `${d.giayMin} đến ${d.giayMax}`;
  return `${d.hiep} hiệp × ${g} giây${ben}`;
}

const tach = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

/** x(id, tên, nhóm chính, nhóm phụ, dụng cụ, mức, loại, môn, đếm, bước|..., lỗi|..., dễ, khó, lưu ý, [dễId, khóId]) */
export function x(id, ten, chinh, phu, dungCu, muc, loai, mon, dem, buoc, loi, de, kho, luuY, ref = []) {
  return {
    id, ten, nhomChinh: tach(chinh), nhomPhu: tach(phu), dungCu: tach(dungCu), mucDo: muc, loai,
    mon: mon === 'all' ? Object.values(MON_RUT) : tach(mon).map((m) => MON_RUT[m] || m),
    dem: docDem(dem), demMa: dem, buoc: buoc.split('|'), loi: loi.split('|'), de, kho, luuY,
    deId: ref[0] || null, khoId: ref[1] || null,
  };
}
