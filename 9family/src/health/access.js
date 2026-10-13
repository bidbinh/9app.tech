// Quyền xem/ghi hồ sơ sức khỏe. Dữ liệu NHẠY CẢM (trẻ em): mặc định chặt, người ngoài quyền nhận 404 như không tồn tại.
//
// Mức truy cập (từ cao xuống thấp):
//   manage  : xem + ghi + đổi người được chia sẻ + xóa dữ liệu của hồ sơ
//   write   : xem + ghi số đo/thuốc/tiêm/khám (không đổi chia sẻ, không xóa hồ sơ)
//   view    : chỉ xem tất cả
//   limited : chỉ xem tăng trưởng + lịch tiêm (không thuốc, không hồ sơ khám, không ghi chú)
//
// Ma trận:
//  Hồ sơ của CON:
//    chủ / quản lý ............ manage
//    thành viên được giao phụ trách (shared_with) ... write
//    thành viên khác .......... không thấy (404)
//    vai trò "con" (tài khoản đã nối vào đúng hồ sơ đó, me.childIds của 9id) ... limited; con khác: không thấy
//  Hồ sơ của NGƯỜI LỚN (mặc định riêng tư):
//    chính người đó ........... manage (tự quyết định chia sẻ cho ai)
//    người được họ chia sẻ .... view
//    chủ / quản lý ............ KHÔNG thấy, trừ khi được chia sẻ; NGOẠI LỆ: người lớn CHƯA có tài khoản (chưa tham gia, ví dụ ông bà do con cháu nhập hộ) thì chủ/quản lý quản lý hộ (manage)
//    thành viên khác .......... không thấy
//    vai trò "con" ............ không thấy
export const isManagerRole = (m) => m && (m.role === 'chu' || m.role === 'quan_ly');

// s: hàng health_subjects kèm thông tin ghép: { child_id, member_id, shared_with[], linked_user_id (của con), has_account (của người lớn) }
export function accessLevel(me, s) {
  if (!me || !s) return null;
  const shared = Array.isArray(s.shared_with) && s.shared_with.includes(me.id);
  if (s.child_id) {
    if (me.role === 'con') return (Array.isArray(me.childIds) && me.childIds.includes(s.child_id)) || (me.userId && s.linked_user_id && String(me.userId) === String(s.linked_user_id)) ? 'limited' : null;
    if (isManagerRole(me)) return 'manage';
    return shared ? 'write' : null;
  }
  if (me.role === 'con') return null;
  if (s.member_id === me.id) return 'manage';
  if (!s.has_account) return isManagerRole(me) ? 'manage' : (shared ? 'view' : null);
  return shared ? 'view' : null;
}

const RANK = { limited: 1, view: 2, write: 3, manage: 4 };
export const atLeast = (level, need) => !!level && RANK[level] >= RANK[need];
// Phần dữ liệu thấy được theo mức
export function sections(level) {
  return {
    growth: atLeast(level, 'limited'),
    vaccines: atLeast(level, 'limited'),
    vitals: atLeast(level, 'view'),
    meds: atLeast(level, 'view'),
    visits: atLeast(level, 'view'),
    notes: atLeast(level, 'view'),
    write: atLeast(level, 'write'),
    manage: atLeast(level, 'manage'),
  };
}
