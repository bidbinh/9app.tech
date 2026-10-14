import { AppError } from './errors.js';
import { assertUuid } from './ids.js';

// Tổng tiền đơn (cộng dòng giá), đã thu (thu trừ hoàn), còn phải thu.
export async function bookingBalance(c, { orgId, bookingId }) {
  assertUuid(orgId, 'org');
  assertUuid(bookingId, 'đơn');
  const [b] = await c.query('SELECT id, deposit_required FROM bookings WHERE id = $1 AND org_id = $2', [bookingId, orgId]);
  if (!b) throw new AppError('booking_not_found', 'Không tìm thấy đơn', 404);
  const [t] = await c.query('SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM price_lines WHERE booking_id = $1', [bookingId]);
  const [p] = await c.query(
    "SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0)::bigint AS paid FROM payments WHERE booking_id = $1",
    [bookingId],
  );
  return { total: t.total, paid: p.paid, due: t.total - p.paid, depositRequired: b.deposit_required };
}

// Số tiền đã thu nhưng chưa được ghi nhận thành doanh thu: tối đa được hoàn. Đơn đã quyết toán (trả phòng hoặc hủy giữ cọc)
// thì phần doanh thu và VAT đã chốt không hoàn được nữa.
export async function refundable(c, { bookingId, paid }) {
  const [s] = await c.query('SELECT room_revenue, vat FROM settlements WHERE booking_id = $1', [bookingId]);
  return paid - (s ? s.room_revenue + s.vat : 0);
}
