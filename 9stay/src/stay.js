import { AppError } from './errors.js';
import { todayVN } from './time.js';
import { getSetting } from './settings.js';
import { postTransaction } from './ledger.js';
import { bookingBalance } from './payments.js';
import { lockBooking, addEvent } from './bookings.js';

// Nhận phòng: chỉ đơn đã cọc. Idempotent.
export async function checkIn(c, { orgId, bookingId }) {
  const b = await lockBooking(c, orgId, bookingId);
  if (b.status === 'da_nhan') return { id: b.id, status: 'da_nhan', changed: false };
  if (b.status !== 'da_coc') throw new AppError('cannot_check_in', 'Chỉ nhận phòng cho đơn đã cọc', 409);
  await c.query("UPDATE bookings SET status = 'da_nhan', version = version + 1 WHERE id = $1", [b.id]);
  await addEvent(c, b.id, 'checked_in', {});
  return { id: b.id, status: 'da_nhan', changed: true };
}

async function contractFor(c, unitId, night) {
  const [k] = await c.query(
    `SELECT kind, owner_share_pct, owner_net_floor, cleaning_payer FROM owner_contracts
      WHERE unit_id = $1 AND daterange(valid_from, valid_to) @> $2::date`,
    [unitId, night],
  );
  return k;
}

// Phần chủ của một đêm: theo tỉ lệ nhưng không dưới mức sàn net và không vượt tiền đêm; thuê lại cố định thì 0.
function ownerShareForNight(amount, contract) {
  if (contract.kind === 'master_lease') return 0;
  const share = Math.floor((amount * contract.owner_share_pct) / 100);
  return Math.min(amount, Math.max(share, Number(contract.owner_net_floor)));
}

// Trả phòng: chỉ khi đã nhận phòng và không còn nợ. Quyết toán chia tiền theo từng đêm và hợp đồng của đêm đó,
// ghi sổ và bảng settlements trong cùng giao dịch. Gọi lại là idempotent.
export async function checkOut(c, { orgId, bookingId }, { now = new Date() } = {}) {
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
  const lines = await c.query("SELECT night, amount FROM price_lines WHERE booking_id = $1 AND kind = 'night' ORDER BY night", [b.id]);
  if (!lines.length) throw new AppError('no_price', 'Đơn chưa có dòng giá, chưa quyết toán được', 409);
  const adjust = await c.query("SELECT 1 FROM price_lines WHERE booking_id = $1 AND kind = 'adjust' LIMIT 1", [b.id]);
  if (adjust.length) throw new AppError('unsupported_adjust', 'Quyết toán đơn có dòng điều chỉnh giá chưa được hỗ trợ', 409);
  const sameNights = lines.length === nightsRows.length && lines.every((l, i) => l.night === nightsRows[i].night);
  if (!sameNights) throw new AppError('price_mismatch', 'Các đêm của đơn không khớp dòng giá (đơn đã dời), cần điều chỉnh giá trước', 409);
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

  let commission = 0;
  if (b.agent_id) {
    const [a] = await c.query('SELECT commission_pct FROM agents WHERE id = $1 AND org_id = $2', [b.agent_id, orgId]);
    commission = Math.floor((room * a.commission_pct) / 100);
  }
  const checkoutDate = todayVN(now);
  const payer = lastContract.cleaning_payer;
  const cleaning = payer === 'guest' ? 0 : await getSetting(c, { orgId, key: 'ops.cleaningFee', unitId, asOf: checkoutDate });

  const entries = [{ account: 'guest_deposit_liability', amount: room + vat }];
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
  let txId = null;
  if (room + vat > 0) {
    const tx = await postTransaction(c, { orgId, kind: 'settlement', bookingId: b.id, ref: 'settle:' + b.id, entries });
    txId = tx.id;
  }
  const [s] = await c.query(
    `INSERT INTO settlements(org_id, booking_id, owner_id, unit_id, agent_id, checkout_date, room_revenue, vat, owner_amount, anstay_amount, commission, cleaning_fee, cleaning_payer, ledger_tx_id)
     VALUES($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [orgId, b.id, unit.owner_id, unitId, b.agent_id, checkoutDate, room, vat, owner, room - owner, commission, cleaning, payer, txId],
  );
  await c.query("UPDATE bookings SET status = 'da_tra', version = version + 1 WHERE id = $1", [b.id]);
  await addEvent(c, b.id, 'checked_out', { settlementId: s.id });
  return { id: b.id, status: 'da_tra', settlementId: s.id, created: true };
}
