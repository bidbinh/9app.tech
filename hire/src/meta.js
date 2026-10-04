// Danh mục dùng chung giữa máy chủ (kiểm tra đầu vào) và giao diện (GET /api/meta): một nguồn duy nhất.
export const KINDS = [
  ['lam_them', 'Việc làm thêm'], ['ban_tg', 'Bán thời gian'], ['toan_tg', 'Toàn thời gian'], ['thoi_vu', 'Thời vụ, ngắn ngày'], ['van_phong', 'Văn phòng'],
];
export const CATEGORIES = [
  ['phuc_vu', 'Phục vụ, pha chế'], ['bep', 'Bếp, phụ bếp'], ['ban_hang', 'Bán hàng, thu ngân'], ['kho', 'Kho, đóng gói'], ['giao_hang', 'Giao hàng, tài xế'],
  ['tap_vu', 'Bảo vệ, tạp vụ'], ['san_xuat', 'Xưởng, sản xuất'], ['van_phong', 'Văn phòng, hành chính'], ['khac', 'Khác'],
];
export const PAY_TYPES = [['gio', 'giờ'], ['ngay', 'ngày'], ['ca', 'ca'], ['thang', 'tháng'], ['thoa_thuan', 'Thỏa thuận']];
export const SHIFTS = [['sang', 'Ca sáng'], ['chieu', 'Ca chiều'], ['toi', 'Ca tối'], ['dem', 'Ca đêm'], ['linh_hoat', 'Linh hoạt']];
export const CITIES = [
  ['hcm', 'TP. Hồ Chí Minh'], ['hn', 'Hà Nội'], ['dn', 'Đà Nẵng'], ['hp', 'Hải Phòng'], ['ct', 'Cần Thơ'], ['khac', 'Tỉnh, thành khác'],
];
export const REPORT_REASONS = [
  ['thu_phi', 'Đòi tiền: phí, đặt cọc, ký quỹ'], ['ep_mua', 'Ép mua hàng, đa cấp'], ['lua_dao', 'Có dấu hiệu lừa đảo, giả mạo'], ['sai_su_that', 'Thông tin sai sự thật'], ['khac', 'Lý do khác'],
];
export const APP_STATUS = [['moi', 'Mới'], ['da_lien_he', 'Đã liên hệ'], ['nhan', 'Nhận'], ['loai', 'Loại']];

export const keys = (list) => list.map((x) => x[0]);
export const labelOf = (list, k) => (list.find((x) => x[0] === k) || [])[1] || '';

// Mức lương hợp lý theo hình thức (đồng): vượt trần là sai, vượt ngưỡng "warn" thì gắn nhãn cần cẩn trọng
export const PAY_BOUNDS = {
  gio: { max: 1_000_000, warn: 200_000 },
  ca: { max: 5_000_000, warn: 800_000 },
  ngay: { max: 10_000_000, warn: 1_500_000 },
  thang: { max: 500_000_000, warn: 60_000_000 },
};
