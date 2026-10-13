import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { nightsBetween } from './time.js';

const MAX_RANGE = 62;

// "Nguyễn Văn Lan" -> "L***": chủ phòng và nhân viên không cần thấy cả tên khách trên lịch.
function maskName(name) {
  const last = String(name).trim().split(/\s+/).pop() || '';
  return (last[0] || '?').toLocaleUpperCase('vi') + '***';
}

// Lịch tổng nhiều căn trong [from, to), tối đa 62 đêm. ownerId lọc theo chủ; guest: 'masked' | 'full' | 'none'.
export async function orgCalendar(c, { orgId, from, to, ownerId = null, guest = 'masked' }) {
  assertUuid(orgId, 'org');
  if (ownerId !== null) assertUuid(ownerId, 'chủ phòng');
  if (!['masked', 'full', 'none'].includes(guest)) throw new AppError('bad_guest', 'Chế độ hiển thị khách không hợp lệ');
  const nights = nightsBetween(from, to);
  if (nights.length > MAX_RANGE) throw new AppError('range_too_large', `Chỉ xem được tối đa ${MAX_RANGE} đêm một lần`);

  const units = await c.query(
    `SELECT u.id, u.code, u.building_id, b.name AS building_name, u.room_type_id, rt.name AS room_type_name, u.owner_id
       FROM units u JOIN buildings b ON b.id = u.building_id JOIN room_types rt ON rt.id = u.room_type_id
      WHERE u.org_id = $1 AND u.status = 'active' AND ($2::uuid IS NULL OR u.owner_id = $2::uuid)
      ORDER BY b.name, u.code`,
    [orgId, ownerId],
  );
  const ids = units.map((u) => u.id);
  const rel = ids.length ? await c.query('SELECT unit_id, night, kind FROM owner_releases WHERE unit_id = ANY($1::uuid[]) AND night = ANY($2::date[])', [ids, nights]) : [];
  const rn = ids.length
    ? await c.query(
      `SELECT rn.unit_id, rn.night, b.id AS booking_id, b.code, b.status, b.hold_until, b.guest_name
         FROM room_nights rn JOIN bookings b ON b.id = rn.booking_id
        WHERE rn.unit_id = ANY($1::uuid[]) AND rn.active AND rn.night = ANY($2::date[])`,
      [ids, nights],
    )
    : [];
  const kinds = new Map(rel.map((r) => [r.unit_id + '|' + r.night, r.kind]));
  const booked = new Map(rn.map((r) => [r.unit_id + '|' + r.night, r]));

  return {
    nights,
    units: units.map((u) => ({
      unitId: u.id, code: u.code, buildingId: u.building_id, buildingName: u.building_name,
      roomTypeId: u.room_type_id, roomTypeName: u.room_type_name, ownerId: u.owner_id,
      cells: nights.map((night) => {
        const key = u.id + '|' + night;
        const r = booked.get(key);
        if (!r) return { night, state: kinds.get(key) || 'closed' };
        const cell = { night, state: r.status === 'giu' ? 'held' : 'booked', bookingId: r.booking_id, bookingCode: r.code };
        if (r.status === 'giu') cell.holdUntil = r.hold_until;
        if (guest === 'full') cell.guest = r.guest_name;
        else if (guest === 'masked') cell.guest = maskName(r.guest_name);
        return cell;
      }),
    })),
  };
}
