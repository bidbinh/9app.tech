import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { nightsBetween, todayVN } from './time.js';
import { createBooking, validateGuest } from './bookings.js';

// Căn trống cho [checkin, checkout): căn đang hoạt động, đủ sức chứa, MỌI đêm chủ đã mở bán, không còn đêm nào có khách.
// Đơn giữ chỗ đã quá hạn và chưa nhận đồng nào coi như trống (sẽ được nhả khi có người đặt).
export async function freeUnits(c, { orgId, checkin, checkout, roomTypeId = null, adults = 1, children = 0 }, { now = new Date() } = {}) {
  assertUuid(orgId, 'org');
  if (roomTypeId !== null) assertUuid(roomTypeId, 'loại phòng');
  const nights = nightsBetween(checkin, checkout);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) throw new AppError('bad_guest', 'Số khách không hợp lệ');
  const rows = await c.query(
    `SELECT u.id, u.code, u.room_type_id, u.building_id
       FROM units u
      WHERE u.org_id = $1 AND u.status = 'active' AND u.capacity_max >= $2 AND ($3::uuid IS NULL OR u.room_type_id = $3::uuid)
        AND (SELECT count(*) FROM owner_releases r WHERE r.unit_id = u.id AND r.kind = 'open' AND r.night = ANY($4::date[])) = $5
        AND NOT EXISTS (
          SELECT 1 FROM room_nights rn JOIN bookings b ON b.id = rn.booking_id
           WHERE rn.unit_id = u.id AND rn.active AND rn.night = ANY($4::date[])
             AND NOT (b.status = 'giu' AND b.hold_until < $6::timestamptz AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id)))
      ORDER BY u.code`,
    [orgId, adults + children, roomTypeId, nights, nights.length, now],
  );
  return rows.map((r) => ({ unitId: r.id, code: r.code, roomTypeId: r.room_type_id, buildingId: r.building_id }));
}

// Số căn trống theo từng loại phòng (kể cả loại hết phòng, free = 0).
export async function roomTypeAvailability(c, { orgId, checkin, checkout, adults = 1, children = 0 }, { now = new Date() } = {}) {
  const free = await freeUnits(c, { orgId, checkin, checkout, adults, children }, { now });
  const types = await c.query('SELECT id, name FROM room_types WHERE org_id = $1 ORDER BY name', [orgId]);
  return types.map((t) => ({ roomTypeId: t.id, name: t.name, free: free.filter((f) => f.roomTypeId === t.id).length }));
}

const RETRY_CODES = ['unit_taken', 'not_released', 'unit_blocked', 'unit_inactive', 'over_capacity'];

// Đặt theo loại phòng: hệ thống tự gán căn trống đầu tiên (theo mã). Thử lần lượt từng căn, mỗi lần trong một SAVEPOINT
// nên căn bị người khác lấy mất giữa chừng chỉ làm thử căn kế tiếp, không hỏng cả giao dịch.
export async function createBookingForType(c, input, { now = new Date() } = {}) {
  const { roomTypeId, ...rest } = input;
  assertUuid(roomTypeId, 'loại phòng');
  // Kiểm đầu vào trước khi tìm căn, để lỗi thật (ngày đã qua, khách sai) không bị nuốt thành "hết phòng".
  validateGuest({ guestName: rest.guestName, adults: rest.adults ?? 1, children: rest.children ?? 0, source: rest.source ?? 'direct' });
  if (nightsBetween(rest.checkin, rest.checkout)[0] < todayVN(now)) throw new AppError('past_date', 'Ngày đến đã qua');
  const candidates = await freeUnits(c, { orgId: rest.orgId, checkin: rest.checkin, checkout: rest.checkout, roomTypeId, adults: rest.adults ?? 1, children: rest.children ?? 0 }, { now });
  for (const cand of candidates) {
    await c.query('SAVEPOINT assign_unit');
    try {
      const booking = await createBooking(c, { ...rest, unitId: cand.unitId }, { now });
      await c.query('RELEASE SAVEPOINT assign_unit');
      return { ...booking, unitId: cand.unitId, unitCode: cand.code };
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT assign_unit');
      if (e instanceof AppError && RETRY_CODES.includes(e.code)) continue;
      throw e;
    }
  }
  throw new AppError('no_availability', 'Hết phòng trống cho loại này trong khoảng ngày đã chọn', 409);
}
