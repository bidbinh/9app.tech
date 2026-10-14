import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { isDate, todayVN } from './time.js';

// Việc dọn sinh tự động khi trả phòng (mỗi đơn một việc). Gọi trong giao dịch trả phòng.
export async function createCheckoutTask(c, { orgId, unitId, bookingId, dueDate }) {
  await c.query(
    `INSERT INTO housekeeping_tasks(org_id, unit_id, booking_id, kind, due_date) VALUES($1, $2, $3, 'checkout_clean', $4::date)
     ON CONFLICT (booking_id) WHERE kind = 'checkout_clean' DO NOTHING`,
    [orgId, unitId, bookingId, dueDate],
  );
}

export async function createManualTask(c, { orgId, unitId, dueDate, note = '' }) {
  assertUuid(unitId, 'căn');
  if (!isDate(dueDate)) throw new AppError('bad_dates', 'Ngày không hợp lệ');
  if (typeof note !== 'string' || note.length > 300) throw new AppError('bad_note', 'Ghi chú tối đa 300 ký tự');
  const [u] = await c.query('SELECT 1 FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!u) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  const [t] = await c.query("INSERT INTO housekeeping_tasks(org_id, unit_id, kind, due_date, note) VALUES($1, $2, 'manual', $3::date, $4) RETURNING id", [orgId, unitId, dueDate, note.trim()]);
  return { id: t.id };
}

// Danh sách cho buồng phòng: việc chưa xong + việc xong hôm nay. Chỉ có căn, tòa, hạn, ghi chú và ngày khách kế tiếp đến
// (để ưu tiên căn có khách đến sớm); KHÔNG có tên khách, số điện thoại hay tiền.
export async function listTasks(c, { orgId, now = new Date() }) {
  const today = todayVN(now);
  const rows = await c.query(
    `SELECT t.id, t.kind, t.status, t.due_date, t.note, u.code AS unit_code, b.name AS building_name,
            (SELECT min(rn.night) FROM room_nights rn JOIN bookings bk ON bk.id = rn.booking_id
              WHERE rn.unit_id = t.unit_id AND rn.active AND rn.night >= $2::date AND bk.status IN ('giu', 'da_coc')) AS next_arrival
       FROM housekeeping_tasks t JOIN units u ON u.id = t.unit_id JOIN buildings b ON b.id = u.building_id
      WHERE t.org_id = $1 AND (t.status <> 'done' OR t.done_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
      ORDER BY (t.status = 'done'), next_arrival NULLS LAST, b.name, u.code`,
    [orgId, today],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, dueDate: r.due_date, note: r.note, unitCode: r.unit_code, buildingName: r.building_name, nextArrival: r.next_arrival, urgent: r.next_arrival !== null && r.next_arrival <= today }));
}

const ORDER = { todo: 0, doing: 1, done: 2 };
export async function setTaskStatus(c, { orgId, taskId, status, by }, { now = new Date() } = {}) {
  assertUuid(taskId, 'việc');
  if (!(status in ORDER)) throw new AppError('bad_status', 'Trạng thái không hợp lệ');
  const [t] = await c.query('SELECT id, status FROM housekeeping_tasks WHERE id = $1 AND org_id = $2 FOR UPDATE', [taskId, orgId]);
  if (!t) throw new AppError('not_found', 'Không tìm thấy việc', 404);
  if (t.status === status) return { id: t.id, status };
  await c.query('UPDATE housekeeping_tasks SET status = $2, updated_by = $3, done_at = CASE WHEN $2 = \'done\' THEN $4::timestamptz ELSE NULL END WHERE id = $1', [taskId, status, by, now]);
  return { id: t.id, status };
}
