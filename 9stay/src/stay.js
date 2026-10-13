import { AppError } from './errors.js';
import { todayVN } from './time.js';
import { getSetting } from './settings.js';
import { postTransaction } from './ledger.js';
import { bookingBalance } from './balance.js';
import { contractFor, ownerShareForNight } from './contracts.js';
import { lockBooking, addEvent } from './bookings.js';

// Nhận phòng: chỉ đơn đã cọc. Idempotent.
export async function checkIn(c, { orgId, bookingId, by = null }) {
  const b = await lockBooking(c, orgId, bookingId);
  if (b.status === 'da_nhan') return { id: b.id, status: 'da_nhan', changed: false };
  if (b.status !== 'da_coc') throw new AppError('cannot_check_in', 'Chỉ nhận phòng cho đơn đã cọc', 409);
  await c.query("UPDATE bookings SET status = 'da_nhan', version = version + 1 WHERE id = $1", [b.id]);
  await addEvent(c, b.id, 'checked_in', {}, by);
  return { id: b.id, status: 'da_nhan', changed: true };
}

// Trả phòng: chỉ khi đã nhận phòng và không còn nợ. Quyết toán chia tiền theo từng đêm và hợp đồng của đêm đó,
// ghi sổ và bảng settlements trong cùng giao dịch. Gọi lại là idempotent. Khách đi sớm vẫn trả đủ tiền theo đơn,
// nhưng các đêm từ ngày trả thực tế trở đi được nhả để bán lại.
export async function checkOut(c, { orgId, bookingId, by = null }, { now = new Date() } = {}) {
  const b = await lockBooking(c, orgId, bookingId);
  if (b.status === 'da_tra') {
    const [s] = await c.query('SELECT id FROM settlements WHERE booking_id = $1', [b.id]);
    return { id: b.id, status: 'da_tra', settlementId: s ? s.id : null, created: false };
  }
  if (b.status !== 'da_nhan') throw new AppError('cannot_check_out', 'Chỉ trả phòng cho đơn đã nhận phòng', 409);

  const bal = await bookingBalance(c, { orgId, bookingId });
  if (bal.due > 0) throw new AppError('balance_due', 'Khách còn nợ, chưa trả phòng được', 409, { due: bal.due });

  const nightsRows = await c.query('SELECT unit_id, night FROM room_nights WHERE booking_id = $1 AND active ORDER BY night', [b.id]);
  if (!nightsRows.length) throw new AppError('no_nights', 'Đơn không còn đêm nào', 409);
  const unitId = nightsRows[0].unit_id;
  if (nightsRows.some((r) => r.unit_id !== unitId)) throw new AppError('multi_unit', 'Đơn nhiều căn chưa được quyết toán tự động', 409);
  const activeNights = nightsRows.map((r) => r.night);

  const adjust = await c.query("SELECT 1 FROM price_lines WHERE booking_id = $1 AND kind = 'adjust' LIMIT 1", [b.id]);
  if (adjust.length) throw new AppError('unsupported_adjust', 'Quyết toán đơn có dòng điều chỉnh giá chưa được hỗ trợ', 409);
  // Cộng dòng giá theo đêm (dòng đảo khi dời đơn triệt tiêu dòng cũ). Đêm miễn phí (0 đồng) vẫn là đêm của đơn.
  const lines = await c.query(
    `SELECT night, SUM(amount)::bigint AS amount FROM price_lines WHERE booking_id = $1 AND kind = 'night' GROUP BY night
      HAVING SUM(amount) <> 0 OR night = ANY($2::date[]) ORDER BY night`,
    [b.id, activeNights],
  );
  if (!lines.length) throw new AppError('no_price', 'Đơn chưa có dòng giá, chưa quyết toán được', 409);
  const sameNights = lines.length === activeNights.length && lines.every((l, i) => l.night === activeNights[i] && l.amount >= 0);
  if (!sameNights) throw new AppError('price_mismatch', 'Các đêm của đơn không khớp dòng giá, cần điều chỉnh giá trước', 409);
  const [vatRow] = await c.query("SELECT COALESCE(SUM(amount), 0)::bigint AS vat FROM price_lines WHERE booking_id = $1 AND kind = 'vat'", [b.id]);
  const [unit] = await c.query('SELECT owner_id FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);

  let owner = 0;
  let room = 0;
  let lastContract = null;
  for (const l of lines) {
    const k = await contractFor(c, unitId, l.night);
    if (!k) throw new AppError('no_contract', `Không có hợp đồng chủ phủ đêm ${l.night}`, 409, { night: l.night });
    owner += ownerShareForNight(l.amount, k);
    room += l.amount;
    lastContract = k;
  }
  const vat = vatRow.vat;

  // Hoa hồng theo tỉ lệ chụp lúc đặt, tính trên tiền phòng (đã gồm phụ thu, đã trừ ưu đãi, trước VAT), làm tròn xuống.
  const commission = b.agent_id && b.commission_pct ? Math.floor((room * b.commission_pct) / 100) : 0;
  const checkoutDate = todayVN(now);
  const payer = lastContract.cleaning_payer;
  const cleaning = payer === 'guest' ? 0 : await getSetting(c, { orgId, key: 'ops.cleaningFee', unitId, asOf: checkoutDate });

  const entries = [];
  if (room + vat > 0) entries.push({ account: 'guest_deposit_liability', amount: room + vat });
  if (vat > 0) entries.push({ account: 'vat_payable', amount: -vat });
  if (owner > 0) entries.push({ account: 'held_for_owner', partyId: unit.owner_id, amount: -owner });
  if (room - owner > 0) entries.push({ account: 'anstay_revenue', amount: -(room - owner) });
  if (commission > 0) {
    entries.push({ account: 'commission_expense', amount: commission });
    entries.push({ account: 'agent_commission_payable', partyId: b.agent_id, amount: -commission });
  }
  if (cleaning > 0) {
    if (payer === 'owner') entries.push({ account: 'held_for_owner', partyId: unit.owner_id, amount: cleaning });
    else entries.push({ account: 'cleaning_expense', amount: cleaning });
    entries.push({ account: 'cleaning_payable', amount: -cleaning });
  }
  // Luôn ghi sổ khi có dòng nào (kể cả đơn 0 đồng còn phí dọn): bản kê chủ tính từ settlements phải khớp sổ.
  let txId = null;
  if (entries.length >= 2) {
    const tx = await postTransaction(c, { orgId, kind: 'settlement', bookingId: b.id, ref: 'settle:' + b.id, entries });
    txId = tx.id;
  }
  const [s] = await c.query(
    `INSERT INTO settlements(org_id, booking_id, owner_id, unit_id, agent_id, checkout_date, room_revenue, vat, owner_amount, anstay_amount, commission, cleaning_fee, cleaning_payer, ledger_tx_id)
     VALUES($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [orgId, b.id, unit.owner_id, unitId, b.agent_id, checkoutDate, room, vat, owner, room - owner, commission, cleaning, payer, txId],
  );
  // Đi sớm: nhả các đêm từ ngày trả thực tế (tiền vẫn tính đủ theo đơn).
  await c.query('UPDATE room_nights SET active = false WHERE booking_id = $1 AND active AND night >= $2::date', [b.id, checkoutDate]);
  await c.query("UPDATE bookings SET status = 'da_tra', version = version + 1 WHERE id = $1", [b.id]);
  await addEvent(c, b.id, 'checked_out', { settlementId: s.id }, by);
  return { id: b.id, status: 'da_tra', settlementId: s.id, created: true };
}
