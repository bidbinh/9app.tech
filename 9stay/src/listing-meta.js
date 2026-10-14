// Danh sách cố định cho tin đăng (mã lưu CSDL, nhãn hiển thị tiếng Việt).
export const AMENITIES = [
  ['wifi', 'Wifi'], ['dieu_hoa', 'Điều hòa'], ['bep', 'Bếp'], ['tu_lanh', 'Tủ lạnh'], ['may_giat', 'Máy giặt'], ['tv', 'TV'],
  ['nuoc_nong', 'Bình nóng lạnh'], ['ban_cong', 'Ban công'], ['thang_may', 'Thang máy'], ['bai_do_xe', 'Bãi đỗ xe'], ['ho_boi', 'Hồ bơi'],
  ['gym', 'Phòng gym'], ['bbq', 'Khu BBQ'], ['view_bien', 'View biển'], ['view_thanh_pho', 'View thành phố'], ['thu_cung', 'Cho phép thú cưng'],
  ['an_sang', 'Bữa sáng'], ['khan_tam', 'Khăn tắm'], ['do_ve_sinh', 'Đồ dùng vệ sinh'], ['say_toc', 'Máy sấy tóc'], ['ban_lam_viec', 'Bàn làm việc'],
  ['bao_ve', 'Bảo vệ 24/7'], ['khoa_thong_minh', 'Khóa thông minh'], ['may_say', 'Máy sấy quần áo'], ['ban_an', 'Bàn ăn'],
];
export const AMENITY_CODES = new Set(AMENITIES.map(([c]) => c));

// Chính sách hủy hiển thị cho khách; penaltyPct là mức phạt ghi vào hợp đồng chủ khi duyệt tin.
export const CANCEL_POLICIES = {
  linh_hoat: { label: 'Linh hoạt', text: 'Hủy miễn phí trước ngày đến 3 ngày; sau đó giữ lại tối đa 10% tiền phòng.', penaltyPct: 10 },
  trung_binh: { label: 'Trung bình', text: 'Hủy miễn phí trước ngày đến 7 ngày; sau đó giữ lại tối đa 20% tiền phòng.', penaltyPct: 20 },
  nghiem_ngat: { label: 'Nghiêm ngặt', text: 'Hủy miễn phí trước ngày đến 14 ngày; sau đó giữ lại tối đa 50% tiền phòng.', penaltyPct: 50 },
};

export const LIMITS = { maxPhotos: 12, maxPhotoBytes: 1_500_000, maxOwnerPhotoBytes: 30_000_000, minPhotosToSubmit: 3, maxPendingPerOwner: 10, ratesHorizonDays: 540 };
