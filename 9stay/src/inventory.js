import { AppError } from './errors.js';
import { isDate, nightsBetween } from './time.js';

const one = async (c, sql, params) => (await c.query(sql, params))[0];

export const createOrg = (c, { name }) =>
  one(c, 'INSERT INTO orgs(name) VALUES($1) RETURNING id', [name]);

export const createBuilding = (c, { orgId, name, address = '', legalType = 'can_ho_du_lich', rulesNote = '', declaredByDefault = 'anstay' }) =>
  one(c, 'INSERT INTO buildings(org_id, name, address, legal_type, rules_note, declared_by_default) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
    [orgId, name, address, legalType, rulesNote, declaredByDefault]);

export const createOwner = (c, { orgId, name, kind = 'ca_nhan', taxId = null }) =>
  one(c, 'INSERT INTO owners(org_id, kind, name, tax_id) VALUES($1, $2, $3, $4) RETURNING id', [orgId, kind, name, taxId]);

export const createRoomType = (c, { orgId, name, capacityStd = 2, capacityMax = 4 }) =>
  one(c, 'INSERT INTO room_types(org_id, name, capacity_std, capacity_max) VALUES($1, $2, $3, $4) RETURNING id', [orgId, name, capacityStd, capacityMax]);

export const createUnit = (c, { orgId, buildingId, ownerId, roomTypeId, code, floor = null, capacityStd = 2, capacityMax = 4 }) =>
  one(c, 'INSERT INTO units(org_id, building_id, owner_id, room_type_id, code, floor, capacity_std, capacity_max) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [orgId, buildingId, ownerId, roomTypeId, code, floor, capacityStd, capacityMax]);

export const createContract = (c, {
  orgId, ownerId, unitId, validFrom, validTo = null, kind = 'revenue_share', ownerSharePct = 70, ownerNetFloor = 0, fixedRent = 0,
  cleaningPayer = 'owner', cancelPenaltyPct = 20, statementCycle = 'month', payoutDelayDays = 3, taxWithhold = false,
}) =>
  one(c, `INSERT INTO owner_contracts(org_id, owner_id, unit_id, kind, valid_from, valid_to, owner_share_pct, owner_net_floor, fixed_rent,
            cleaning_payer, cancel_penalty_pct, statement_cycle, payout_delay_days, tax_withhold)
          VALUES($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
  [orgId, ownerId, unitId, kind, validFrom, validTo, ownerSharePct, ownerNetFloor, fixedRent, cleaningPayer, cancelPenaltyPct, statementCycle, payoutDelayDays, taxWithhold]);

// Mở bán các đêm trong [from, to). Nếu đêm đang bị chặn thì thành mở (chủ nhả ngày).
export async function openNights(c, { unitId, from, to, source = 'app', by = null }) {
  const nights = nightsBetween(from, to);
  await c.query(
    `INSERT INTO owner_releases(unit_id, night, kind, source, created_by)
     SELECT $1::uuid, n, 'open', $3::text, $4::uuid FROM unnest($2::date[]) AS n
     ON CONFLICT (unit_id, night) DO UPDATE SET kind = 'open', source = EXCLUDED.source, created_by = EXCLUDED.created_by, updated_at = now()`,
    [unitId, nights, source, by],
  );
  return nights.length;
}

const BLOCK_KINDS = ['owner_use', 'blocked_by_owner', 'blocked_by_anstay'];

// Chặn các đêm. Phải chạy trong db.tx: ghi dòng chặn trước (giữ khóa dòng) rồi mới kiểm đêm đã có khách,
// nên một đặt phòng chạy đồng thời hoặc thấy đêm đã bị chặn, hoặc bị chặn lại ở đây. Có khách thì ném lỗi để hoàn tác.
export async function blockNights(c, { unitId, nights, kind = 'blocked_by_owner', source = 'app', by = null }) {
  if (!BLOCK_KINDS.includes(kind)) throw new AppError('bad_kind', 'Loại chặn không hợp lệ');
  if (!Array.isArray(nights) || !nights.length || !nights.every(isDate)) throw new AppError('bad_dates', 'Danh sách đêm không hợp lệ');
  const list = [...new Set(nights)].sort();
  await c.query(
    `INSERT INTO owner_releases(unit_id, night, kind, source, created_by)
     SELECT $1::uuid, n, $3::text, $4::text, $5::uuid FROM unnest($2::date[]) AS n
     ON CONFLICT (unit_id, night) DO UPDATE SET kind = EXCLUDED.kind, source = EXCLUDED.source, created_by = EXCLUDED.created_by, updated_at = now()`,
    [unitId, list, kind, source, by],
  );
  const booked = await c.query('SELECT night FROM room_nights WHERE unit_id = $1 AND active AND night = ANY($2::date[]) ORDER BY night', [unitId, list]);
  if (booked.length) throw new AppError('night_booked', 'Đêm đã có khách, không chặn được', 409, { nights: booked.map((r) => r.night) });
}
