// Định dạng xuất khoản chi chung để đồng bộ sang 9Fin về sau (khi 9Fin chuyển sang tài khoản 9id). LẦN NÀY CHƯA NỐI: không route, không gọi mạng.
// Hợp đồng dữ liệu (phiên bản 1), mỗi khoản chi là một bản ghi:
//   {
//     schema: '9family.shared-expense/1',
//     externalId: '<familyId>:<expenseId>',     // khóa ổn định để 9Fin upsert, đồng bộ lại không tạo trùng
//     familyId, date: 'YYYY-MM-DD', amount: <số nguyên đồng VND, > 0>, currency: 'VND',
//     category: 'an_uong'|'di_cho'|'dien_nuoc'|'hoc_hanh'|'y_te'|'khac',
//     payerUserId: <user_id 9id của người chi hoặc null>, payerMemberId: <member id>,
//     note: <tối đa 100 ký tự>, deleted: boolean (xóa mềm => 9Fin xóa theo), updatedAt: ISO
//   }
// Quy tắc: chỉ chi tiêu CHUNG của gia đình; không gồm tiền tiêu vặt của con, không gồm khoản phải đóng chưa đóng. 9Fin phải nhận theo user 9id của người chi,
// và chỉ thấy khoản của gia đình mà user đó là thành viên. Người dùng bật/tắt đồng bộ ở 9Fin (mặc định TẮT).
export const FIN_SCHEMA = '9family.shared-expense/1';

export function toFinRecords(familyId, rows, membersById = new Map()) {
  return rows.map((r) => ({
    schema: FIN_SCHEMA,
    externalId: `${familyId}:${r.id}`,
    familyId,
    date: r.day,
    amount: Number(r.amount),
    currency: 'VND',
    category: r.category,
    payerMemberId: r.who || null,
    payerUserId: (r.who && membersById.get(r.who) && membersById.get(r.who).user_id) || null,
    note: r.note || '',
    deleted: !!r.deleted_at,
    updatedAt: new Date(r.deleted_at || r.created_at || Date.now()).toISOString(),
  }));
}
