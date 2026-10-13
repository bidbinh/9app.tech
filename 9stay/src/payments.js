import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { isDate } from './time.js';
import { postTransaction } from './ledger.js';
import { lockBooking, addEvent } from './bookings.js';

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

// Ghi nhận một khoản thu hoặc hoàn bằng tay. ref bắt buộc và quyết định tính idempotent: gọi lại cùng ref không ghi thêm.
// Khóa đơn trước (cùng thứ tự với hủy/dời) nên các lần ghi đồng thời cho một đơn xếp hàng.
export async function recordPayment(c, { orgId, bookingId, kind, amount, receivedOn, method = 'manual_bank', note = '', by = null, ref }) {
  if (!['deposit', 'payment', 'refund'].includes(kind)) throw new AppError('bad_payment', 'Loại khoản tiền không hợp lệ');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AppError('bad_payment', 'Số tiền phải là số nguyên dương');
  if (!isDate(receivedOn)) throw new AppError('bad_dates', 'Ngày nhận tiền không hợp lệ');
  if (typeof ref !== 'string' || !ref) throw new AppError('bad_payment', 'Thiếu mã tham chiếu');
  if (!['manual_bank', 'vietqr_webhook'].includes(method)) throw new AppError('bad_payment', 'Phương thức không hợp lệ');

  const b = await lockBooking(c, orgId, bookingId);
  const before = await bookingBalance(c, { orgId, bookingId });

  // Idempotent trước mọi kiểm tra số dư: gọi lại cùng ref (thử lại sau lỗi mạng) trả kết quả cũ, không báo lỗi nhầm.
  const [dup] = await c.query(
    'SELECT p.id FROM ledger_transactions t JOIN payments p ON p.ledger_tx_id = t.id WHERE t.org_id = $1 AND t.ref = $2 AND t.booking_id = $3',
    [orgId, 'pay:' + ref, bookingId],
  );
  if (dup) return { paymentId: dup.id, bookingStatus: b.status, paid: before.paid, due: before.due, created: false };

  const isRefund = kind === 'refund';
  if (!isRefund && !['giu', 'da_coc', 'da_nhan'].includes(b.status)) throw new AppError('booking_closed', 'Đơn đã đóng, không nhận thêm tiền', 409);
  if (isRefund && amount > before.paid) throw new AppError('refund_too_large', 'Số hoàn lớn hơn số đã thu', 409);

  const entries = isRefund
    ? [{ account: 'guest_deposit_liability', amount }, { account: 'bank', amount: -amount }]
    : [{ account: 'bank', amount }, { account: 'guest_deposit_liability', amount: -amount }];
  const tx = await postTransaction(c, { orgId, kind: 'payment_' + kind, bookingId, ref: 'pay:' + ref, memo: note.slice(0, 200), entries });
  if (!tx.created) throw new AppError('ref_conflict', 'Mã tham chiếu này đã dùng cho một giao dịch khác', 409);
  const [pay] = await c.query(
    `INSERT INTO payments(org_id, booking_id, kind, method, amount, received_on, note, recorded_by, ledger_tx_id)
     VALUES($1, $2, $3, $4, $5, $6::date, $7, $8, $9) RETURNING id`,
    [orgId, bookingId, kind, method, amount, receivedOn, note.slice(0, 500), by, tx.id],
  );

  const paid = before.paid + (isRefund ? -amount : amount);
  let status = b.status;
  if (!isRefund && b.status === 'giu' && paid > 0 && paid >= before.depositRequired) {
    await c.query("UPDATE bookings SET status = 'da_coc', hold_until = NULL, version = version + 1 WHERE id = $1", [bookingId]);
    await addEvent(c, bookingId, 'deposit_received', { paymentId: pay.id });
    status = 'da_coc';
  }
  return { paymentId: pay.id, bookingStatus: status, paid, due: before.due - (isRefund ? -amount : amount), created: true };
}
