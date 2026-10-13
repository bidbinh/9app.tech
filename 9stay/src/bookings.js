import { AppError } from './errors.js';
import { nightsBetween, todayVN, addDays } from './time.js';
import { getSetting } from './settings.js';
import { assertUuid } from './ids.js';
import { postTransaction } from './ledger.js';
import { bookingBalance } from './balance.js';
import { contractFor } from './contracts.js';

const GUEST_NAME_MAX = 120;
const CANCEL_REASON_MAX = 500;
const SOURCE_MAX = 40;

function normalizePhone(p) {
  if (p === null || p === undefined || p === '') return null;
  const s = String(p).replace(/[\s.\-()]/g, '');
  if (!/^\+?\d{8,15}$/.test(s)) throw new AppError('bad_phone', 'Số điện thoại không hợp lệ');
  return s;
}

export function validateGuest({ guestName, adults, children, source }) {
  const name = typeof guestName === 'string' ? guestName.trim() : '';
  if (!name || name.length > GUEST_NAME_MAX) throw new AppError('bad_guest', 'Tên khách không hợp lệ');
  if (!Number.isInteger(adults) || adults < 1) throw new AppError('bad_guest', 'Cần ít nhất 1 người lớn');
  if (!Number.isInteger(children) || children < 0) throw new AppError('bad_guest', 'Số trẻ em không hợp lệ');
  if (typeof source !== 'string' || !source || source.length > SOURCE_MAX) throw new AppError('bad_guest', 'Nguồn đơn không hợp lệ');
  return name;
}

// Kiểm đầu vào của một kỳ ở: ngày, căn, giới hạn cài đặt, sức chứa. Trả { unit, nights }.
export async function validateStay(c, { orgId, unitId, checkin, checkout, adults, children }, now = new Date()) {
  assertUuid(orgId, 'org');
  assertUuid(unitId, 'căn');
  const nights = nightsBetween(checkin, checkout);
  const today = todayVN(now);
  if (checkin < today) throw new AppError('past_date', 'Ngày đến đã qua');
  const [unit] = await c.query('SELECT id, capacity_max, status, room_type_id FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!unit) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  if (unit.status !== 'active') throw new AppError('unit_inactive', 'Căn đang ngừng hoạt động', 409);
  const maxNights = await getSetting(c, { orgId, key: 'booking.maxNights', unitId, asOf: today });
  if (nights.length > maxNights) throw new AppError('too_long', `Tối đa ${maxNights} đêm`);
  const maxAdvance = await getSetting(c, { orgId, key: 'booking.maxAdvanceDays', unitId, asOf: today });
  if (checkin > addDays(today, maxAdvance)) throw new AppError('too_far', `Chỉ nhận đặt trước tối đa ${maxAdvance} ngày`);
  if (adults + children > unit.capacity_max) throw new AppError('over_capacity', `Căn chứa tối đa ${unit.capacity_max} người`);
  return { unit, nights };
}

// Nhả các đơn giu quá hạn: đơn thành het_han, các đêm được trả. SKIP LOCKED: không chờ đơn đang bị giao dịch khác khóa.
// Đơn đã nhận bất kỳ khoản tiền nào KHÔNG bị nhả tự động (khách đã chuyển tiền): nằm trong listOverdueHolds để nhân viên
// quyết định hủy (giữ hay hoàn) hoặc thu nốt.
export async function expireHolds(c, { orgId, now = new Date() }) {
  assertUuid(orgId, 'org');
  const rows = await c.query(
    `UPDATE bookings SET status = 'het_han', version = version + 1
      WHERE id IN (SELECT b.id FROM bookings b WHERE b.org_id = $1 AND b.status = 'giu' AND b.hold_until IS NOT NULL AND b.hold_until < $2::timestamptz
                      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id)
                   ORDER BY b.id FOR UPDATE OF b SKIP LOCKED)
      RETURNING id`,
    [orgId, now],
  );
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await c.query('UPDATE room_nights SET active = false WHERE booking_id = ANY($1::uuid[]) AND active', [ids]);
    for (const id of ids) await addEvent(c, id, 'expired', {});
  }
  return ids;
}

// Đơn giữ chỗ đã quá hạn nhưng đã nhận tiền (không tự nhả): cần nhân viên xử lý.
export async function listOverdueHolds(c, { orgId, now = new Date() }) {
  assertUuid(orgId, 'org');
  return c.query(
    `SELECT b.id, b.code, b.hold_until,
            COALESCE((SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END) FROM payments p WHERE p.booking_id = b.id), 0)::bigint AS paid
       FROM bookings b
      WHERE b.org_id = $1 AND b.status = 'giu' AND b.hold_until < $2::timestamptz AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id)
      ORDER BY b.hold_until`,
    [orgId, now],
  );
}

// Giữ các đêm cho đơn: khóa dòng owner_releases (tuần tự hóa với đặt khác và với chủ chặn ngày), kiểm mở bán,
// rồi chèn room_nights. Chỉ mục duy nhất từng phần là hàng rào cuối.
export async function claimNights(c, { orgId, bookingId, unitId, nights, now = new Date() }) {
  const rel = await c.query('SELECT night, kind FROM owner_releases WHERE unit_id = $1 AND night = ANY($2::date[]) ORDER BY night FOR UPDATE', [unitId, nights]);
  // Quét lười các đơn giữ chỗ quá hạn SAU khi đã giữ khóa release (thứ tự: release → bookings, không chờ đơn bị khóa).
  await expireHolds(c, { orgId, now });
  const byNight = new Map(rel.map((r) => [r.night, r.kind]));
  for (const night of nights) {
    const kind = byNight.get(night);
    if (kind === undefined) throw new AppError('not_released', `Đêm ${night} chưa mở bán`, 409, { night });
    if (kind !== 'open') throw new AppError('unit_blocked', `Đêm ${night} không bán được (${kind})`, 409, { night, kind });
  }
  try {
    await c.query('INSERT INTO room_nights(org_id, booking_id, unit_id, night) SELECT $1::uuid, $2::uuid, $3::uuid, n FROM unnest($4::date[]) AS n', [orgId, bookingId, unitId, nights]);
  } catch (e) {
    if (e.code === '23505' && e.constraint === 'room_nights_active_unit_night') throw new AppError('unit_taken', 'Căn đã có khách trong khoảng ngày này', 409);
    throw e;
  }
}

// Sự kiện chỉ chứa id và ngày, không chứa tên hay SĐT.
export async function addEvent(c, bookingId, kind, data = {}) {
  await c.query('INSERT INTO booking_events(booking_id, kind, data) VALUES($1, $2, $3::jsonb)', [bookingId, kind, JSON.stringify(data)]);
}

async function nextBookingCode(c, orgId, today) {
  const [row] = await c.query(
    `INSERT INTO org_counters(org_id, name, value) VALUES($1, 'booking', 1000)
     ON CONFLICT (org_id, name) DO UPDATE SET value = org_counters.value + 1 RETURNING value`,
    [orgId],
  );
  const prefix = await getSetting(c, { orgId, key: 'org.codePrefix', asOf: today });
  return `${prefix}${row.value}`;
}

export async function createBooking(c, input, { now = new Date() } = {}) {
  const { orgId, unitId, checkin, checkout, guestPhone = null, adults = 1, children = 0, source = 'direct', agentId = null, createdBy = null, status = 'giu', quoteId = null } = input;
  if (!['giu', 'da_coc'].includes(status)) throw new AppError('bad_status', 'Trạng thái đầu không hợp lệ');
  const name = validateGuest({ guestName: input.guestName, adults, children, source });
  const phone = normalizePhone(guestPhone);
  const { unit, nights } = await validateStay(c, { orgId, unitId, checkin, checkout, adults, children }, now);
  const today = todayVN(now);
  const quote = quoteId ? await loadUsableQuote(c, { orgId, quoteId, unit, checkin, checkout, adults, children, now }) : null;
  const commissionPct = agentId ? await agentCommissionPct(c, orgId, agentId) : null;

  let holdUntil = null;
  if (status === 'giu') {
    const minutes = await getSetting(c, { orgId, key: 'booking.holdMinutesStaff', unitId, asOf: today });
    holdUntil = new Date(now.getTime() + minutes * 60 * 1000);
  }
  const code = await nextBookingCode(c, orgId, today);
  let row;
  try {
    [row] = await c.query(
      `INSERT INTO bookings(org_id, code, guest_name, guest_phone, adults, children, source, agent_id, commission_pct, created_by, status, hold_until, deposit_required, quote_id, checkin, checkout, unit_id)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::date, $16::date, $17) RETURNING id, version`,
      [orgId, code, name, phone, adults, children, source, agentId, commissionPct, createdBy, status, holdUntil, quote ? quote.deposit : 0, quote ? quote.id : null, checkin, checkout, unitId],
    );
  } catch (e) {
    if (e.code === '23505' && e.constraint === 'bookings_quote_unique') throw new AppError('quote_used', 'Báo giá này đã được dùng cho một đơn khác', 409);
    throw e;
  }
  if (quote) await markQuoteUsed(c, quote.id, row.id);
  await claimNights(c, { orgId, bookingId: row.id, unitId, nights, now });
  if (quote) await writePriceLines(c, { orgId, bookingId: row.id, quote });
  await addEvent(c, row.id, 'created', { unitId, checkin, checkout, status });
  return { id: row.id, code, status, version: row.version, holdUntil, checkin, checkout, nights, total: quote ? quote.total : 0, depositRequired: quote ? quote.deposit : 0 };
}

// Sale/CTV phải thuộc org và đang hoạt động; tỉ lệ hoa hồng được chụp vào đơn lúc đặt.
async function agentCommissionPct(c, orgId, agentId) {
  assertUuid(agentId, 'sale/CTV');
  const [a] = await c.query('SELECT commission_pct, status FROM agents WHERE id = $1 AND org_id = $2', [agentId, orgId]);
  if (!a) throw new AppError('agent_not_found', 'Không tìm thấy sale/CTV', 404);
  if (a.status !== 'active') throw new AppError('agent_inactive', 'Sale/CTV này đang bị tạm dừng hoặc khóa', 409);
  return a.commission_pct;
}

// Mỗi báo giá chỉ được dùng một lần trong đời (đặt mới hoặc dời đơn).
async function markQuoteUsed(c, quoteId, bookingId) {
  try {
    await c.query('INSERT INTO quote_uses(quote_id, booking_id) VALUES($1, $2)', [quoteId, bookingId]);
  } catch (e) {
    if (e.code === '23505') throw new AppError('quote_used', 'Báo giá này đã được dùng cho một đơn khác', 409);
    throw e;
  }
}

// Đảo toàn bộ dòng giá hiện có (dòng âm, vì dòng giá bất biến) trước khi ghi giá mới khi dời đơn.
async function reversePriceLines(c, { orgId, bookingId }) {
  const nights = await c.query("SELECT night, SUM(amount)::bigint AS amount FROM price_lines WHERE booking_id = $1 AND kind = 'night' GROUP BY night HAVING SUM(amount) <> 0 ORDER BY night", [bookingId]);
  for (const l of nights) {
    await c.query("INSERT INTO price_lines(org_id, booking_id, kind, night, label, amount) VALUES($1, $2, 'night', $3::date, $4, $5)", [orgId, bookingId, l.night, `Hoàn đêm ${l.night} (dời đơn)`, -l.amount]);
  }
  const [v] = await c.query("SELECT COALESCE(SUM(amount), 0)::bigint AS vat FROM price_lines WHERE booking_id = $1 AND kind = 'vat'", [bookingId]);
  if (v.vat !== 0) await c.query("INSERT INTO price_lines(org_id, booking_id, kind, night, label, amount) VALUES($1, $2, 'vat', NULL, 'Hoàn VAT (dời đơn)', $3)", [orgId, bookingId, -v.vat]);
}

// Báo giá phải còn hạn và khớp ngày, số khách, trẻ em, loại phòng của căn.
async function loadUsableQuote(c, { orgId, quoteId, unit, checkin, checkout, adults, children, now }) {
  assertUuid(quoteId, 'báo giá');
  const [q] = await c.query(
    'SELECT id, room_type_id, checkin, checkout, adults, child_ages, lines, vat, total, deposit, expires_at FROM quotes WHERE id = $1 AND org_id = $2',
    [quoteId, orgId],
  );
  if (!q) throw new AppError('quote_not_found', 'Không tìm thấy báo giá', 404);
  if (new Date(q.expires_at) < now) throw new AppError('quote_expired', 'Báo giá đã hết hạn, hãy báo giá lại', 409);
  const sameStay = q.checkin === checkin && q.checkout === checkout && q.adults === adults && q.child_ages.length === children && q.room_type_id === unit.room_type_id;
  if (!sameStay) throw new AppError('quote_mismatch', 'Báo giá không khớp với đơn (ngày, số khách hoặc loại phòng)', 409);
  return q;
}

// Dòng giá của đơn: bất biến, mỗi đêm một dòng và một dòng VAT.
async function writePriceLines(c, { orgId, bookingId, quote }) {
  for (const l of quote.lines) {
    await c.query('INSERT INTO price_lines(org_id, booking_id, kind, night, label, amount) VALUES($1, $2, $3, $4::date, $5, $6)', [orgId, bookingId, 'night', l.night, `Tiền phòng đêm ${l.night}`, l.amount]);
  }
  await c.query('INSERT INTO price_lines(org_id, booking_id, kind, night, label, amount) VALUES($1, $2, $3, NULL, $4, $5)', [orgId, bookingId, 'vat', 'VAT', quote.vat]);
}

// Tình trạng từng đêm của một căn trong [from, to).
export async function unitAvailability(c, { orgId, unitId, from, to }) {
  assertUuid(orgId, 'org');
  assertUuid(unitId, 'căn');
  const nights = nightsBetween(from, to);
  const [unit] = await c.query('SELECT id FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!unit) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  const rel = await c.query('SELECT night, kind FROM owner_releases WHERE unit_id = $1 AND night = ANY($2::date[])', [unitId, nights]);
  const rn = await c.query(
    `SELECT rn.night, rn.booking_id, b.status, b.hold_until FROM room_nights rn JOIN bookings b ON b.id = rn.booking_id
      WHERE rn.unit_id = $1 AND rn.active AND rn.night = ANY($2::date[])`,
    [unitId, nights],
  );
  const kinds = new Map(rel.map((r) => [r.night, r.kind]));
  const booked = new Map(rn.map((r) => [r.night, r]));
  return nights.map((night) => {
    const r = booked.get(night);
    if (r) return r.status === 'giu' ? { night, state: 'held', bookingId: r.booking_id, holdUntil: r.hold_until } : { night, state: 'booked', bookingId: r.booking_id };
    return { night, state: kinds.get(night) || 'closed' };
  });
}

export async function lockBooking(c, orgId, bookingId) {
  assertUuid(orgId, 'org');
  assertUuid(bookingId, 'đơn');
  const [b] = await c.query('SELECT id, status, version, hold_until, agent_id, commission_pct FROM bookings WHERE id = $1 AND org_id = $2 FOR UPDATE', [bookingId, orgId]);
  if (!b) throw new AppError('booking_not_found', 'Không tìm thấy đơn', 404);
  return b;
}

// Giữ lại một phần tiền khách đã thu khi hủy: chia chủ/Anstay theo hợp đồng của đêm đầu (không có hợp đồng hoặc thuê lại
// cố định thì toàn bộ về Anstay), ghi bảng settlements loại 'cancel' để vào bản kê chủ. Không có hoa hồng, không có VAT
// (cách xử lý thuế cho khoản giữ cọc chờ kế toán xác nhận). Phần còn lại của tiền đã thu được hoàn tay bằng recordPayment.
async function settleCancellation(c, { orgId, booking, retain, now }) {
  const [first] = await c.query('SELECT unit_id, night FROM room_nights WHERE booking_id = $1 AND active ORDER BY night LIMIT 1', [booking.id]);
  if (!first) throw new AppError('no_nights', 'Đơn không còn đêm nào', 409);
  const [unit] = await c.query('SELECT owner_id FROM units WHERE id = $1 AND org_id = $2', [first.unit_id, orgId]);
  const k = await contractFor(c, first.unit_id, first.night);
  const owner = k && k.kind === 'revenue_share' ? Math.floor((retain * k.owner_share_pct) / 100) : 0;
  const entries = [{ account: 'guest_deposit_liability', amount: retain }];
  if (owner > 0) entries.push({ account: 'held_for_owner', partyId: unit.owner_id, amount: -owner });
  if (retain - owner > 0) entries.push({ account: 'anstay_revenue', amount: -(retain - owner) });
  const tx = await postTransaction(c, { orgId, kind: 'cancel_retain', bookingId: booking.id, ref: 'cancel:' + booking.id, entries });
  await c.query(
    `INSERT INTO settlements(org_id, booking_id, kind, owner_id, unit_id, agent_id, checkout_date, room_revenue, vat, owner_amount, anstay_amount, commission, cleaning_fee, cleaning_payer, ledger_tx_id)
     VALUES($1, $2, 'cancel', $3, $4, NULL, $5::date, $6, 0, $7, $8, 0, 0, 'guest', $9)`,
    [orgId, booking.id, unit.owner_id, first.unit_id, todayVN(now), retain, owner, retain - owner, tx.id],
  );
}

// Hủy đơn. Đơn đã thu tiền phải nói rõ giữ lại bao nhiêu (retainAmount, 0 = hoàn hết) để tiền cọc không bị kẹt.
export async function cancelBooking(c, { orgId, bookingId, reason = null, retainAmount }, { now = new Date() } = {}) {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length > CANCEL_REASON_MAX) throw new AppError('bad_reason', `Lý do hủy tối đa ${CANCEL_REASON_MAX} ký tự`);
  if (retainAmount !== undefined && (!Number.isSafeInteger(retainAmount) || retainAmount < 0)) throw new AppError('bad_retain', 'Số tiền giữ lại không hợp lệ');
  const b = await lockBooking(c, orgId, bookingId);
  if (b.status === 'huy') return { id: b.id, status: 'huy' };
  if (['da_nhan', 'da_tra'].includes(b.status)) throw new AppError('cannot_cancel', 'Đơn đã nhận phòng, không hủy được', 409);
  if (['khong_den', 'het_han'].includes(b.status)) throw new AppError('booking_closed', 'Đơn đã đóng', 409);
  const bal = await bookingBalance(c, { orgId, bookingId });
  if (bal.paid > 0 && retainAmount === undefined) {
    throw new AppError('payments_exist', 'Đơn đã thu tiền: hãy chọn số tiền giữ lại (0 nếu hoàn hết)', 409, { paid: bal.paid });
  }
  const retain = retainAmount ?? 0;
  if (retain > bal.paid) throw new AppError('bad_retain', 'Số tiền giữ lại lớn hơn số đã thu', 409, { paid: bal.paid });
  if (retain > 0) await settleCancellation(c, { orgId, booking: b, retain, now });
  await c.query('UPDATE room_nights SET active = false WHERE booking_id = $1 AND active', [b.id]);
  await c.query("UPDATE bookings SET status = 'huy', version = version + 1, cancel_reason = $2 WHERE id = $1", [b.id, why || null]);
  await addEvent(c, b.id, 'cancelled', { reasonGiven: why !== '' });
  return { id: b.id, status: 'huy' };
}

// Dời đơn. Đơn đã có dòng giá bắt buộc kèm báo giá mới (quoteId) cho kỳ ở mới: dòng giá cũ được đảo bằng dòng âm,
// dòng giá mới được ghi, cọc yêu cầu theo báo giá mới. Đơn chưa có dòng giá dời như trước.
export async function moveBooking(c, { orgId, bookingId, unitId, checkin, checkout, expectedVersion = null, quoteId = null }, { now = new Date() } = {}) {
  const b = await lockBooking(c, orgId, bookingId);
  if (!['giu', 'da_coc'].includes(b.status)) throw new AppError('cannot_move', 'Chỉ dời được đơn đang giữ chỗ hoặc đã cọc', 409);
  if (b.status === 'giu' && b.hold_until && new Date(b.hold_until) < now) throw new AppError('hold_expired', 'Đơn giữ chỗ đã hết hạn', 409);
  if (expectedVersion !== null && expectedVersion !== b.version) throw new AppError('stale', 'Đơn vừa được người khác sửa, hãy tải lại', 409);
  const [g] = await c.query('SELECT adults, children FROM bookings WHERE id = $1', [b.id]);
  const { unit, nights } = await validateStay(c, { orgId, unitId, checkin, checkout, adults: g.adults, children: g.children }, now);
  const [hasLines] = await c.query('SELECT 1 FROM price_lines WHERE booking_id = $1 LIMIT 1', [b.id]);
  if (hasLines && !quoteId) throw new AppError('quote_required', 'Đơn đã có giá: dời đơn cần báo giá mới cho kỳ ở mới', 409);
  const quote = quoteId ? await loadUsableQuote(c, { orgId, quoteId, unit, checkin, checkout, adults: g.adults, children: g.children, now }) : null;
  // Khóa TRƯỚC mọi dòng owner_releases liên quan (đêm cũ và đêm mới), theo thứ tự (căn, đêm), rồi mới đụng room_nights.
  // Nếu vô hiệu room_nights trước khi giữ khóa release, một đặt phòng khác đang giữ khóa release sẽ chờ dòng room_nights
  // của ta trong khi ta chờ khóa release của nó: deadlock.
  const old = await c.query('SELECT unit_id, night FROM room_nights WHERE booking_id = $1 AND active', [b.id]);
  const lockUnits = [...old.map((r) => r.unit_id), ...nights.map(() => unitId)];
  const lockNights = [...old.map((r) => r.night), ...nights];
  await c.query(
    `SELECT 1 FROM owner_releases
      WHERE (unit_id, night) IN (SELECT * FROM unnest($1::uuid[], $2::date[]))
      ORDER BY unit_id, night FOR UPDATE`,
    [lockUnits, lockNights],
  );
  const before = await c.query('SELECT unit_id, min(night) AS first, max(night) AS last FROM room_nights WHERE booking_id = $1 AND active GROUP BY unit_id', [b.id]);
  await c.query('UPDATE room_nights SET active = false WHERE booking_id = $1 AND active', [b.id]);
  await claimNights(c, { orgId, bookingId: b.id, unitId, nights, now });
  if (quote) {
    await markQuoteUsed(c, quote.id, b.id);
    await reversePriceLines(c, { orgId, bookingId: b.id });
    await writePriceLines(c, { orgId, bookingId: b.id, quote });
    await c.query('UPDATE bookings SET quote_id = $2, deposit_required = $3 WHERE id = $1', [b.id, quote.id, quote.deposit]);
  }
  const [row] = await c.query('UPDATE bookings SET version = version + 1, checkin = $2::date, checkout = $3::date, unit_id = $4 WHERE id = $1 RETURNING version', [b.id, checkin, checkout, unitId]);
  await addEvent(c, b.id, 'moved', { from: before[0] ? { unitId: before[0].unit_id, first: before[0].first, last: before[0].last } : null, to: { unitId, checkin, checkout }, quoteId: quote ? quote.id : null });
  return { id: b.id, version: row.version, nights };
}
