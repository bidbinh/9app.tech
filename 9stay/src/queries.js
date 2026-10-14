import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { isDate } from './time.js';

const BASE = `
  SELECT b.id, b.code, b.status, b.guest_name, b.guest_phone, b.adults, b.children, b.hold_until, b.deposit_required, b.agent_id, b.source,
         b.checkin, b.checkout, b.version, b.cancel_reason,
         u.code AS unit_code, bu.name AS building_name, rt.name AS room_type_name, rt.id AS room_type_id,
         (SELECT COALESCE(SUM(amount), 0)::bigint FROM price_lines WHERE booking_id = b.id) AS total,
         (SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0)::bigint FROM payments WHERE booking_id = b.id) AS paid
    FROM bookings b
    LEFT JOIN units u ON u.id = b.unit_id
    LEFT JOIN buildings bu ON bu.id = u.building_id
    LEFT JOIN room_types rt ON rt.id = u.room_type_id`;

// Hình dạng trả về theo vai: nhân viên thấy căn và tòa; sale/CTV chỉ thấy loại phòng (không lộ căn, tòa, chủ).
export function shapeBooking(r, { staff }) {
  const out = {
    id: r.id, code: r.code, status: r.status, version: r.version, guestName: r.guest_name, guestPhone: r.guest_phone,
    adults: r.adults, children: r.children, checkin: r.checkin, checkout: r.checkout, holdUntil: r.hold_until,
    roomTypeName: r.room_type_name, total: r.total, paid: r.paid, due: r.total - r.paid, depositRequired: r.deposit_required,
  };
  if (staff) Object.assign(out, { unitCode: r.unit_code, buildingName: r.building_name, agentId: r.agent_id, source: r.source, cancelReason: r.cancel_reason });
  return out;
}

export async function listBookings(c, { orgId, agentId = null, from = null, to = null, status = null, code = null, limit = 200 }) {
  assertUuid(orgId, 'org');
  if (agentId !== null) assertUuid(agentId, 'sale/CTV');
  if ((from !== null && !isDate(from)) || (to !== null && !isDate(to))) throw new AppError('bad_dates', 'Ngày không hợp lệ');
  if (status !== null && !['giu', 'da_coc', 'da_nhan', 'da_tra', 'huy', 'khong_den', 'het_han'].includes(status)) throw new AppError('bad_status', 'Trạng thái không hợp lệ');
  const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 200, 1), 500);
  // đơn giao với [from, to): checkin < to và checkout > from
  return c.query(
    `${BASE}
      WHERE b.org_id = $1 AND ($2::uuid IS NULL OR b.agent_id = $2::uuid) AND ($3::date IS NULL OR b.checkout > $3::date)
        AND ($4::date IS NULL OR b.checkin < $4::date) AND ($5::text IS NULL OR b.status = $5)
        AND ($6::text IS NULL OR upper(b.code) = $6)
      ORDER BY b.checkin, b.code LIMIT ${lim}`,
    [orgId, agentId, from, to, status, typeof code === 'string' && code ? code.toUpperCase().slice(0, 20) : null],
  );
}

// Một đơn. agentId (nếu có) giới hạn đơn của sale/CTV đó: đơn người khác trả null (route sẽ trả 404, không lộ sự tồn tại).
export async function getBooking(c, { orgId, bookingId, agentId = null }) {
  assertUuid(orgId, 'org');
  assertUuid(bookingId, 'đơn');
  if (agentId !== null) assertUuid(agentId, 'sale/CTV');
  const [r] = await c.query(`${BASE} WHERE b.id = $1 AND b.org_id = $2 AND ($3::uuid IS NULL OR b.agent_id = $3::uuid)`, [bookingId, orgId, agentId]);
  return r || null;
}

export async function bookingDetail(c, { orgId, bookingId }) {
  const lines = await c.query('SELECT kind, night, label, amount, created_at FROM price_lines WHERE booking_id = $1 AND org_id = $2 ORDER BY id', [bookingId, orgId]);
  const payments = await c.query('SELECT id, kind, method, amount, received_on, note, created_at FROM payments WHERE booking_id = $1 AND org_id = $2 ORDER BY created_at, id', [bookingId, orgId]);
  return { lines, payments };
}
