// Các dịp lễ và danh mục quan hệ/dịp dùng chung cho gợi ý quà và lời chúc. Nội dung do 9gift tự biên soạn.

/** Quan hệ -> nhóm dùng cho gợi ý quà và lời chúc. */
export const QUAN_HE = [
  { id: 'ong-ba', ten: 'Ông bà', nhom: 'cha-me' },
  { id: 'cha-me', ten: 'Cha mẹ', nhom: 'cha-me' },
  { id: 'ho-hang-tren', ten: 'Cô dì chú bác (bậc trên)', nhom: 'cha-me' },
  { id: 'anh-chi-em', ten: 'Anh chị em ruột', nhom: 'anh-chi-em' },
  { id: 'ho-hang', ten: 'Họ hàng ngang hàng', nhom: 'anh-chi-em' },
  { id: 'vo-chong', ten: 'Vợ, chồng', nhom: 'nguoi-yeu' },
  { id: 'nguoi-yeu', ten: 'Người yêu', nhom: 'nguoi-yeu' },
  { id: 'con-chau', ten: 'Con, cháu nhỏ', nhom: 'tre-em' },
  { id: 'ban-be', ten: 'Bạn bè', nhom: 'ban-be' },
  { id: 'dong-nghiep', ten: 'Đồng nghiệp', nhom: 'dong-nghiep' },
  { id: 'cap-tren', ten: 'Sếp, cấp trên', nhom: 'cap-tren' },
  { id: 'thay-co', ten: 'Thầy cô', nhom: 'thay-co' },
  { id: 'hang-xom', ten: 'Hàng xóm, người quen', nhom: 'hang-xom' },
  { id: 'khac', ten: 'Khác', nhom: 'hang-xom' },
];
export const NHOM_QUAN_HE = [
  { id: 'cha-me', ten: 'Ông bà, cha mẹ, bậc trên' },
  { id: 'nguoi-yeu', ten: 'Vợ chồng, người yêu' },
  { id: 'tre-em', ten: 'Con cháu nhỏ' },
  { id: 'anh-chi-em', ten: 'Anh chị em, họ hàng ngang hàng' },
  { id: 'ban-be', ten: 'Bạn bè' },
  { id: 'dong-nghiep', ten: 'Đồng nghiệp' },
  { id: 'cap-tren', ten: 'Sếp, cấp trên' },
  { id: 'thay-co', ten: 'Thầy cô' },
  { id: 'hang-xom', ten: 'Hàng xóm, người quen' },
];
export const nhomCuaQuanHe = (id) => (QUAN_HE.find((q) => q.id === id) || { nhom: 'hang-xom' }).nhom;
export const tenQuanHe = (id) => (QUAN_HE.find((q) => q.id === id) || { ten: '' }).ten;

/** Dịp để gợi ý quà/lời chúc. giong: các giọng văn có lời chúc cho dịp này. */
export const DIP = [
  { id: 'sinhNhat', ten: 'Sinh nhật', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'cuoi', ten: 'Đám cưới, đám hỏi', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'tanGia', ten: 'Tân gia', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'treSoSinh', ten: 'Đầy tháng, thôi nôi', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'khaiTruong', ten: 'Khai trương', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'thangChuc', ten: 'Thăng chức', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'totNghiep', ten: 'Tốt nghiệp, đỗ đạt', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'mungTho', ten: 'Mừng thọ', giong: ['trangTrong', 'thanMat'] },
  { id: 'thamBenh', ten: 'Thăm người ốm', giong: ['trangTrong', 'thanMat'] },
  { id: 'phuNu', ten: '8/3 và 20/10', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'thayCo', ten: '20/11 (Nhà giáo)', giong: ['trangTrong', 'thanMat'] },
  { id: 'ngayMe', ten: 'Ngày của Mẹ', giong: ['trangTrong', 'thanMat'] },
  { id: 'ngayCha', ten: 'Ngày của Cha', giong: ['trangTrong', 'thanMat'] },
  { id: 'thieuNhi', ten: 'Quốc tế Thiếu nhi 1/6', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'giangSinh', ten: 'Giáng sinh (đêm 24/12, lễ 25/12)', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'namMoi', ten: 'Năm mới dương lịch', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'tet', ten: 'Tết Nguyên Đán', giong: ['trangTrong', 'thanMat', 'haiHuoc'] },
  { id: 'trungThu', ten: 'Trung thu', giong: ['thanMat', 'haiHuoc', 'trangTrong'] },
  { id: 'vuLan', ten: 'Vu Lan', giong: ['trangTrong', 'thanMat'] },
  { id: 'tinhYeu', ten: 'Valentine, kỷ niệm yêu', giong: ['thanMat', 'haiHuoc', 'trangTrong'] },
  { id: 'tang', ten: 'Tang lễ, chia buồn', giong: ['trangTrong', 'thanMat'] },
];
export const tenDip = (id) => (DIP.find((d) => d.id === id) || { ten: '' }).ten;

export const GIONG = [
  { id: 'trangTrong', ten: 'Trang trọng' },
  { id: 'thanMat', ten: 'Thân mật' },
  { id: 'haiHuoc', ten: 'Hài hước nhẹ' },
];

/** Sự kiện sổ lễ -> dịp gợi ý quà/lời chúc. */
export const DIP_THEO_SU_KIEN = Object.assign(Object.create(null), {
  cuoi: 'cuoi', hoi: 'cuoi', dayThang: 'treSoSinh', thoiNoi: 'treSoSinh', tanGia: 'tanGia', khaiTruong: 'khaiTruong', tang: 'tang', gio: 'tang',
  mungTho: 'mungTho', sinhNhat: 'sinhNhat', thangChuc: 'thangChuc', totNghiep: 'totNghiep', thamBenh: 'thamBenh', liXi: 'tet', leTet: 'tet',
});

/**
 * Các dịp lễ nhắc trong năm. kieu: 'duong' | 'am' | 'chuNhat' (Chủ nhật thứ `lan` của tháng).
 * truoc: nhắc trước mấy ngày để chuẩn bị. macDinh: bật sẵn hay không. dip: dịp gợi ý quà/lời chúc.
 */
export const DIP_LE = [
  { id: 'tet-nguyen-dan', ten: 'Tết Nguyên Đán (mùng 1 Tết)', kieu: 'am', ngay: 1, thang: 1, truoc: 10, macDinh: true, dip: 'tet', doiTuong: 'Biếu quà Tết ông bà, cha mẹ, thầy cô, sếp' },
  { id: 'tet-duong', ten: 'Tết Dương lịch', kieu: 'duong', ngay: 1, thang: 1, truoc: 2, macDinh: false, dip: 'namMoi', doiTuong: 'Gửi lời chúc năm mới' },
  { id: 'valentine', ten: 'Valentine 14/2', kieu: 'duong', ngay: 14, thang: 2, truoc: 5, macDinh: false, dip: 'tinhYeu', doiTuong: 'Vợ chồng, người yêu' },
  { id: 'quoc-te-phu-nu', ten: 'Quốc tế Phụ nữ 8/3', kieu: 'duong', ngay: 8, thang: 3, truoc: 4, macDinh: true, dip: 'phuNu', doiTuong: 'Mẹ, vợ, chị em, đồng nghiệp nữ, cô giáo' },
  { id: 'gio-to', ten: 'Giỗ Tổ Hùng Vương (10/3 âm)', kieu: 'am', ngay: 10, thang: 3, truoc: 0, macDinh: false, dip: null, doiTuong: 'Ngày nghỉ lễ, không cần quà', quaTang: false },
  { id: 'doan-ngo', ten: 'Tết Đoan Ngọ (5/5 âm)', kieu: 'am', ngay: 5, thang: 5, truoc: 2, macDinh: false, dip: null, doiTuong: 'Cúng và ăn mừng trong gia đình' },
  { id: 'ngay-cua-me', ten: 'Ngày của Mẹ (Chủ nhật thứ hai tháng 5)', kieu: 'chuNhat', thang: 5, lan: 2, truoc: 5, macDinh: true, dip: 'ngayMe', doiTuong: 'Mẹ, mẹ chồng, mẹ vợ, bà' },
  { id: 'thieu-nhi', ten: 'Quốc tế Thiếu nhi 1/6', kieu: 'duong', ngay: 1, thang: 6, truoc: 4, macDinh: false, dip: 'thieuNhi', doiTuong: 'Con, cháu nhỏ' },
  { id: 'ngay-cua-cha', ten: 'Ngày của Cha (Chủ nhật thứ ba tháng 6)', kieu: 'chuNhat', thang: 6, lan: 3, truoc: 5, macDinh: true, dip: 'ngayCha', doiTuong: 'Bố, bố chồng, bố vợ, ông' },
  { id: 'gia-dinh-vn', ten: 'Ngày Gia đình Việt Nam 28/6', kieu: 'duong', ngay: 28, thang: 6, truoc: 0, macDinh: false, dip: null, doiTuong: 'Bữa cơm cả nhà', quaTang: false },
  { id: 'vu-lan', ten: 'Vu Lan (rằm tháng 7 âm)', kieu: 'am', ngay: 15, thang: 7, truoc: 5, macDinh: true, dip: 'vuLan', doiTuong: 'Báo hiếu cha mẹ, cúng chùa, cúng gia tiên' },
  { id: 'quoc-khanh', ten: 'Quốc khánh 2/9', kieu: 'duong', ngay: 2, thang: 9, truoc: 0, macDinh: false, dip: null, doiTuong: 'Ngày nghỉ lễ, không cần quà', quaTang: false },
  { id: 'trung-thu', ten: 'Tết Trung thu (rằm tháng 8 âm)', kieu: 'am', ngay: 15, thang: 8, truoc: 7, macDinh: true, dip: 'trungThu', doiTuong: 'Con cháu nhỏ, biếu bánh ông bà, đối tác, sếp' },
  { id: 'phu-nu-vn', ten: 'Ngày Phụ nữ Việt Nam 20/10', kieu: 'duong', ngay: 20, thang: 10, truoc: 4, macDinh: true, dip: 'phuNu', doiTuong: 'Mẹ, vợ, chị em, đồng nghiệp nữ' },
  { id: 'nha-giao', ten: 'Ngày Nhà giáo Việt Nam 20/11', kieu: 'duong', ngay: 20, thang: 11, truoc: 5, macDinh: true, dip: 'thayCo', doiTuong: 'Thầy cô cũ và hiện tại của mình, của con' },
  { id: 'ong-tao', ten: 'Ông Công, Ông Táo (23 tháng Chạp)', kieu: 'am', ngay: 23, thang: 12, truoc: 2, macDinh: false, dip: null, doiTuong: 'Cúng trong nhà, chuẩn bị Tết', quaTang: false },
  { id: 'giang-sinh', ten: 'Giáng sinh (đêm 24/12, lễ 25/12)', kieu: 'duong', ngay: 24, thang: 12, truoc: 5, macDinh: false, dip: 'giangSinh', doiTuong: 'Bạn bè, người thân theo đạo Công giáo hoặc thích đón lễ' },
];
