// API nội bộ của mô-đun Tiền gia đình, để mô-đun khác (ví dụ "nhập thông báo trường") gọi trực tiếp trong tiến trình.
//
//   import { createDueItem } from '../money/api.js';
//   const r = await createDueItem(c /* c của tx() có c.query, hoặc hàm query của db.js */, {
//     familyId,   // bắt buộc: uuid gia đình
//     title,      // bắt buộc: "Học phí tháng 10" (tối đa 100 ký tự)
//     amount,     // bắt buộc: số nguyên đồng VND >= 0 (đã làm tròn, ví dụ 1500000)
//     dueDate,    // bắt buộc: 'YYYY-MM-DD'
//     childId,    // tùy chọn: uuid con (phải thuộc gia đình)
//     note,       // tùy chọn: ghi chú (tối đa 300 ký tự)
//     source,     // tùy chọn: 'truong' | 'thu_cong' | tên mô-đun (mặc định 'thu_cong')
//     extKey,     // tùy chọn: khóa chống trùng; gọi lại cùng extKey trong một gia đình KHÔNG tạo thêm
//     createdBy,  // tùy chọn: uuid thành viên tạo
//     withEvent,  // tùy chọn: tạo sự kiện lịch "Hạn đóng: ..." (mặc định true)
//   });
//   -> { id, created: boolean, eventId }
//
// Hàm KHÔNG kiểm quyền (nơi gọi tự kiểm quyền chủ/quản lý) nhưng kiểm dữ liệu và chỉ ghi vào gia đình `familyId`.
// Nhắc trước hạn do bộ lập lịch (src/money/reminders.js) lo, không cần gọi thêm gì.
import { ApiError } from '../errors.js';
import { cleanText, cleanNote, cleanDay, UUID_RE } from '../util.js';
import { MAX_VND } from './calc.js';

export async function createDueItem(c, o) {
  const q = typeof c === 'function' ? c : (sql, p) => c.query(sql, p);
  if (!o || !UUID_RE.test(String(o.familyId))) throw new ApiError(400, 'invalid_input', 'Thiếu gia đình');
  const familyId = String(o.familyId).toLowerCase();
  const title = cleanText(o.title, { max: 100, min: 1, field: 'Tên khoản' });
  const note = cleanNote(o.note, { max: 300 });
  const dueDate = cleanDay(o.dueDate, 'Hạn đóng');
  const amount = o.amount;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_VND) throw new ApiError(400, 'invalid_input', 'Số tiền không hợp lệ (số nguyên đồng, từ 0)', { field: 'Số tiền' });
  const source = o.source ? cleanText(o.source, { max: 20, field: 'Nguồn' }) : 'thu_cong';
  const extKey = o.extKey ? cleanText(String(o.extKey), { max: 120, field: 'Khóa nhập' }) : null;
  const createdBy = o.createdBy && UUID_RE.test(String(o.createdBy)) ? o.createdBy : null;
  let childId = null;
  if (o.childId) {
    if (!UUID_RE.test(String(o.childId))) throw new ApiError(400, 'invalid_input', 'Con không hợp lệ');
    const ok = await q('SELECT 1 FROM children WHERE id=$1 AND family_id=$2', [o.childId, familyId]);
    if (!ok.length) throw new ApiError(400, 'invalid_input', 'Con không thuộc gia đình này');
    childId = String(o.childId).toLowerCase();
  }
  if (extKey) {
    const dup = await q('SELECT id, event_id FROM money_dues WHERE family_id=$1 AND ext_key=$2', [familyId, extKey]);
    if (dup.length) return { id: dup[0].id, created: false, eventId: dup[0].event_id };
  }
  const n = (await q('SELECT count(*)::int n FROM money_dues WHERE family_id=$1', [familyId]))[0].n;
  if (n >= 1000) throw new ApiError(409, 'limit', 'Mỗi gia đình tối đa 1000 khoản phải đóng');
  let eventId = null;
  if (o.withEvent !== false) {
    eventId = (await q(
      `INSERT INTO events(family_id, title, kind, all_day, start_date, rec_type, notify_offsets, child_ids, source, created_by)
       VALUES($1,$2,'khac',true,$3,'none','{}',$4,'money',$5) RETURNING id`,
      [familyId, `Hạn đóng: ${title}`, dueDate, childId ? [childId] : [], createdBy]))[0].id;
  }
  const row = (await q(
    `INSERT INTO money_dues(family_id, child_id, title, amount, due_date, note, source, ext_key, event_id, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (family_id, ext_key) WHERE ext_key IS NOT NULL DO NOTHING RETURNING id`,
    [familyId, childId, title, amount, dueDate, note, source, extKey, eventId, createdBy]))[0];
  if (!row) { // đua nhau cùng extKey: bản kia thắng, bỏ sự kiện vừa tạo
    if (eventId) await q('DELETE FROM events WHERE id=$1', [eventId]);
    const d = (await q('SELECT id, event_id FROM money_dues WHERE family_id=$1 AND ext_key=$2', [familyId, extKey]))[0];
    return { id: d.id, created: false, eventId: d.event_id };
  }
  return { id: row.id, created: true, eventId };
}
