import { AppError } from './errors.js';
import { nightsBetween, todayVN, addDays } from './time.js';
import { getSetting } from './settings.js';

const GUEST_NAME_MAX = 120;
const SOURCE_MAX = 40;

function normalizePhone(p) {
  if (p === null || p === undefined || p === '') return null;
  const s = String(p).replace(/[\s.\-()]/g, '');
  if (!/^\+?\d{8,15}$/.test(s)) throw new AppError('bad_phone', 'Số điện thoại không hợp lệ');
  return s;
}

function validateGuest({ guestName, adults, children, source }) {
  const name = typeof guestName === 'string' ? guestName.trim() : '';
  if (!name || name.length > GUEST_NAME_MAX) throw new AppError('bad_guest', 'Tên khách không hợp lệ');
  if (!Number.isInteger(adults) || adults < 1) throw new AppError('bad_guest', 'Cần ít nhất 1 người lớn');
  if (!Number.isInteger(children) || children < 0) throw new AppError('bad_guest', 'Số trẻ em không hợp lệ');
  if (typeof source !== 'string' || !source || source.length > SOURCE_MAX) throw new AppError('bad_guest', 'Nguồn đơn không hợp lệ');
  return name;
}

// Kiểm đầu vào của một kỳ ở: ngày, căn, giới hạn cài đặt, sức chứa. Trả { unit, nights }.
export async function validateStay(c, { orgId, unitId, checkin, checkout, adults, children }, now = new Date()) {
  const nights = nightsBetween(checkin, checkout);
  const today = todayVN(now);
  if (checkin < today) throw new AppError('past_date', 'Ngày đến đã qua');
  const [unit] = await c.query('SELECT id, capacity_max, status FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!unit) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  if (unit.status !== 'active') throw new AppError('unit_inactive', 'Căn đang ngừng hoạt động', 409);
  const maxNights = await getSetting(c, { orgId, key: 'booking.maxNights', unitId, asOf: today });
  if (nights.length > maxNights) throw new AppError('too_long', `Tối đa ${maxNights} đêm`);
  const maxAdvance = await getSetting(c, { orgId, key: 'booking.maxAdvanceDays', unitId, asOf: today });
  if (checkin > addDays(today, maxAdvance)) throw new AppError('too_far', `Chỉ nhận đặt trước tối đa ${maxAdvance} ngày`);
  if (adults + children > unit.capacity_max) throw new AppError('over_capacity', `Căn chứa tối đa ${unit.capacity_max} người`);
  return { unit, nights };
}

// Giữ các đêm cho đơn: khóa dòng owner_releases (tuần tự hóa với đặt khác và với chủ chặn ngày), kiểm mở bán,
// rồi chèn room_nights. Chỉ mục duy nhất từng phần là hàng rào cuối.
export async function claimNights(c, { bookingId, unitId, nights }) {
  const rel = await c.query('SELECT night, kind FROM owner_releases WHERE unit_id = $1 AND night = ANY($2::date[]) ORDER BY night FOR UPDATE', [unitId, nights]);
  const byNight = new Map(rel.map((r) => [r.night, r.kind]));
  for (const night of nights) {
    const kind = byNight.get(night);
    if (kind === undefined) throw new AppError('not_released', `Đêm ${night} chưa mở bán`, 409, { night });
    if (kind !== 'open') throw new AppError('unit_blocked', `Đêm ${night} không bán được (${kind})`, 409, { night, kind });
  }
  try {
    await c.query('INSERT INTO room_nights(booking_id, unit_id, night) SELECT $1::uuid, $2::uuid, n FROM unnest($3::date[]) AS n', [bookingId, unitId, nights]);
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
  const { orgId, unitId, checkin, checkout, guestPhone = null, adults = 1, children = 0, source = 'direct', agentId = null, createdBy = null, status = 'giu' } = input;
  if (!['giu', 'da_coc'].includes(status)) throw new AppError('bad_status', 'Trạng thái đầu không hợp lệ');
  const name = validateGuest({ guestName: input.guestName, adults, children, source });
  const phone = normalizePhone(guestPhone);
  const { nights } = await validateStay(c, { orgId, unitId, checkin, checkout, adults, children }, now);
  const today = todayVN(now);

  let holdUntil = null;
  if (status === 'giu') {
    const minutes = await getSetting(c, { orgId, key: 'booking.holdMinutesStaff', unitId, asOf: today });
    holdUntil = new Date(now.getTime() + minutes * 60 * 1000);
  }
  const code = await nextBookingCode(c, orgId, today);
  const [row] = await c.query(
    `INSERT INTO bookings(org_id, code, guest_name, guest_phone, adults, children, source, agent_id, created_by, status, hold_until)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, version`,
    [orgId, code, name, phone, adults, children, source, agentId, createdBy, status, holdUntil],
  );
  await claimNights(c, { bookingId: row.id, unitId, nights });
  await addEvent(c, row.id, 'created', { unitId, checkin, checkout, status });
  return { id: row.id, code, status, version: row.version, holdUntil, checkin, checkout, nights };
}

// Tình trạng từng đêm của một căn trong [from, to).
export async function unitAvailability(c, { orgId, unitId, from, to }) {
  const nights = nightsBetween(from, to);
  const [unit] = await c.query('SELECT id FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!unit) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  const rel = await c.query('SELECT night, kind FROM owner_releases WHERE unit_id = $1 AND night = ANY($2::date[])', [unitId, nights]);
  const rn = await c.query('SELECT night, booking_id FROM room_nights WHERE unit_id = $1 AND active AND night = ANY($2::date[])', [unitId, nights]);
  const kinds = new Map(rel.map((r) => [r.night, r.kind]));
  const booked = new Map(rn.map((r) => [r.night, r.booking_id]));
  return nights.map((night) => {
    if (booked.has(night)) return { night, state: 'booked', bookingId: booked.get(night) };
    return { night, state: kinds.get(night) || 'closed' };
  });
}
