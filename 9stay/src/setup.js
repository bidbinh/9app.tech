import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { isDate, nightsBetween } from './time.js';
import { createBuilding, createOwner, createRoomType, createUnit, createContract, openNights } from './inventory.js';

// Dữ liệu nền do quản lý nhập: tòa nhà, loại phòng, chủ phòng, căn, hợp đồng chủ, mở bán đêm.
// Mọi đầu vào do người dùng gõ nên kiểm ở đây và đổi lỗi CSDL thành thông báo dễ hiểu.
const text = (v, label, { min = 1, max = 120, optional = false } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (optional) return '';
    throw new AppError('bad_input', `${label} không được để trống`);
  }
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new AppError('bad_input', `${label} phải từ ${min} đến ${max} ký tự`);
  return s;
};
const int = (v, label, { min = 0, max = 1_000_000_000_000 } = {}) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new AppError('bad_input', `${label} phải là số nguyên từ ${min} đến ${max}`);
  return v;
};
const oneOf = (v, list, label) => {
  if (!list.includes(v)) throw new AppError('bad_input', `${label} không hợp lệ`);
  return v;
};

async function guard(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof AppError) throw e;
    if (e && e.code === '23505') throw new AppError('duplicate', 'Đã có mục trùng (ví dụ mã căn đã tồn tại trong tòa này)', 409);
    if (e && e.code === '23P01') throw new AppError('contract_overlap', 'Căn này đã có hợp đồng chủ trùng khoảng ngày', 409);
    if (e && (e.code === '23514' || e.code === '23503')) throw new AppError('bad_input', 'Dữ liệu không hợp lệ hoặc không khớp (kiểm tra chủ phòng và căn)', 400);
    throw e;
  }
}

async function requireIn(c, table, orgId, id, label) {
  assertUuid(id, label);
  const [r] = await c.query(`SELECT id FROM ${table} WHERE id = $1 AND org_id = $2`, [id, orgId]);
  if (!r) throw new AppError('not_found', `Không tìm thấy ${label}`, 404);
}

export async function getSetup(c, { orgId }) {
  const [buildings, roomTypes, owners, units, contracts] = await Promise.all([
    c.query('SELECT id, name, address, legal_type, rules_note, province, district, multi_owner, status FROM buildings WHERE org_id = $1 ORDER BY name', [orgId]),
    c.query('SELECT id, name, capacity_std, capacity_max FROM room_types WHERE org_id = $1 ORDER BY name', [orgId]),
    c.query('SELECT id, name, kind, tax_id, status FROM owners WHERE org_id = $1 ORDER BY name', [orgId]),
    c.query(
      `SELECT u.id, u.code, u.floor, u.status, u.capacity_std, u.capacity_max, u.building_id, u.owner_id, u.room_type_id,
              (SELECT count(*)::int FROM owner_releases r WHERE r.unit_id = u.id AND r.kind = 'open' AND r.night >= current_date) AS open_nights
         FROM units u WHERE u.org_id = $1 ORDER BY u.code`, [orgId]),
    c.query(
      `SELECT k.id, k.unit_id, k.owner_id, k.kind, k.valid_from, k.valid_to, k.owner_share_pct, k.owner_net_floor, k.fixed_rent, k.cleaning_payer
         FROM owner_contracts k WHERE k.org_id = $1 ORDER BY k.valid_from DESC`, [orgId]),
  ]);
  return {
    buildings: buildings.map((b) => ({ id: b.id, name: b.name, address: b.address, legalType: b.legal_type, rulesNote: b.rules_note, province: b.province, district: b.district, multiOwner: b.multi_owner, status: b.status })),
    roomTypes: roomTypes.map((r) => ({ id: r.id, name: r.name, capacityStd: r.capacity_std, capacityMax: r.capacity_max })),
    owners: owners.map((o) => ({ id: o.id, name: o.name, kind: o.kind, taxId: o.tax_id, status: o.status })),
    units: units.map((u) => ({ id: u.id, code: u.code, floor: u.floor, status: u.status, capacityStd: u.capacity_std, capacityMax: u.capacity_max, buildingId: u.building_id, ownerId: u.owner_id, roomTypeId: u.room_type_id, openNights: u.open_nights })),
    contracts: contracts.map((k) => ({ id: k.id, unitId: k.unit_id, ownerId: k.owner_id, kind: k.kind, validFrom: k.valid_from, validTo: k.valid_to, ownerSharePct: k.owner_share_pct, ownerNetFloor: k.owner_net_floor, fixedRent: k.fixed_rent, cleaningPayer: k.cleaning_payer })),
  };
}

export const addBuilding = (c, { orgId, name, address, legalType, rulesNote, province, district, multiOwner }) => guard(async () => {
  const [b] = await c.query(
    "INSERT INTO buildings(org_id, name, address, legal_type, rules_note, province, district, multi_owner, status) VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'approved') RETURNING id",
    [orgId, text(name, 'Tên tòa nhà'), text(address, 'Địa chỉ', { optional: true, max: 200 }), oneOf(legalType ?? 'can_ho_du_lich', ['can_ho_du_lich', 'nha_o', 'khac'], 'Loại hình'),
      text(rulesNote, 'Nội quy', { optional: true, max: 1000 }), text(province, 'Tỉnh/thành', { optional: true, max: 60 }), text(district, 'Quận/huyện', { optional: true, max: 60 }), multiOwner === true]);
  return b;
});

// Đổi chủ của một căn (tòa nhiều chủ gán lại căn). Chỉ khi căn chưa có hợp đồng, lịch đêm, đơn và chưa thuộc tin nào.
export async function reassignUnitOwner(c, { orgId, unitId, ownerId }) {
  assertUuid(unitId, 'căn');
  assertUuid(ownerId, 'chủ phòng');
  const [u] = await c.query('SELECT id FROM units WHERE id = $1 AND org_id = $2 FOR UPDATE', [unitId, orgId]);
  if (!u) throw new AppError('not_found', 'Không tìm thấy căn', 404);
  const [o] = await c.query("SELECT id FROM owners WHERE id = $1 AND org_id = $2 AND status = 'active'", [ownerId, orgId]);
  if (!o) throw new AppError('not_found', 'Không tìm thấy chủ phòng', 404);
  const [used] = await c.query(
    `SELECT (EXISTS (SELECT 1 FROM owner_contracts WHERE unit_id = $1) OR EXISTS (SELECT 1 FROM room_nights WHERE unit_id = $1) OR EXISTS (SELECT 1 FROM listing_units WHERE unit_id = $1)) AS used`, [unitId]);
  if (used.used) throw new AppError('unit_in_use', 'Căn đã có hợp đồng, lịch đặt hoặc thuộc một tin đăng nên không đổi chủ được', 409);
  await c.query('UPDATE units SET owner_id = $2 WHERE id = $1', [unitId, ownerId]);
  await c.query('DELETE FROM owner_releases WHERE unit_id = $1', [unitId]);
  return { id: unitId };
}

export const addRoomType = (c, { orgId, name, capacityStd, capacityMax }) => guard(async () => {
  const std = int(capacityStd ?? 2, 'Sức chứa chuẩn', { min: 1, max: 30 });
  const max = int(capacityMax ?? std, 'Sức chứa tối đa', { min: std, max: 30 });
  return createRoomType(c, { orgId, name: text(name, 'Tên loại phòng', { max: 80 }), capacityStd: std, capacityMax: max });
});

export const addOwner = (c, { orgId, name, kind, taxId }) => guard(async () => createOwner(c, {
  orgId, name: text(name, 'Tên chủ phòng'), kind: oneOf(kind ?? 'ca_nhan', ['ca_nhan', 'to_chuc'], 'Loại chủ'), taxId: text(taxId, 'Mã số thuế', { optional: true, max: 20 }) || null,
}));

// codes: một hoặc nhiều mã căn (tạo hàng loạt cùng tòa/chủ/loại phòng). Tối đa 200 căn mỗi lần.
export async function addUnits(c, { orgId, buildingId, ownerId, roomTypeId, codes, floor, capacityStd, capacityMax }) {
  if (!Array.isArray(codes) || !codes.length || codes.length > 200) throw new AppError('bad_input', 'Cần từ 1 đến 200 mã căn');
  const list = codes.map((x) => text(x, 'Mã căn', { max: 30 }));
  if (new Set(list.map((x) => x.toLowerCase())).size !== list.length) throw new AppError('bad_input', 'Có mã căn bị lặp trong danh sách');
  await requireIn(c, 'buildings', orgId, buildingId, 'tòa nhà');
  await requireIn(c, 'owners', orgId, ownerId, 'chủ phòng');
  await requireIn(c, 'room_types', orgId, roomTypeId, 'loại phòng');
  const [rt] = await c.query('SELECT capacity_std, capacity_max FROM room_types WHERE id = $1', [roomTypeId]);
  const std = int(capacityStd ?? rt.capacity_std, 'Sức chứa chuẩn', { min: 1, max: 30 });
  const max = int(capacityMax ?? rt.capacity_max, 'Sức chứa tối đa', { min: std, max: 30 });
  const fl = floor === undefined || floor === null || floor === '' ? null : int(floor, 'Tầng', { min: -5, max: 200 });
  const ids = [];
  for (const code of list) {
    await c.query('SAVEPOINT add_unit');
    try {
      ids.push((await createUnit(c, { orgId, buildingId, ownerId, roomTypeId, code, floor: fl, capacityStd: std, capacityMax: max })).id);
      await c.query('RELEASE SAVEPOINT add_unit');
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT add_unit');
      if (e && e.code === '23505') throw new AppError('duplicate', `Mã căn "${code}" đã có trong tòa này`, 409);
      throw e;
    }
  }
  return { ids };
}

export async function setUnitStatus(c, { orgId, unitId, status }) {
  assertUuid(unitId, 'căn');
  oneOf(status, ['active', 'inactive'], 'Trạng thái');
  const r = await c.query('UPDATE units SET status = $3 WHERE id = $1 AND org_id = $2 RETURNING id', [unitId, orgId, status]);
  if (!r.length) throw new AppError('not_found', 'Không tìm thấy căn', 404);
}

// Cùng một điều khoản hợp đồng cho nhiều căn; chủ lấy theo căn (ràng buộc CSDL bảo đảm chủ khớp căn).
export async function addContracts(c, { orgId, unitIds, validFrom, validTo, kind, ownerSharePct, ownerNetFloor, fixedRent, cleaningPayer, cancelPenaltyPct, statementCycle, payoutDelayDays, taxWithhold }) {
  if (!Array.isArray(unitIds) || !unitIds.length || unitIds.length > 200) throw new AppError('bad_input', 'Cần chọn từ 1 đến 200 căn');
  if (!isDate(validFrom)) throw new AppError('bad_dates', 'Ngày bắt đầu hợp đồng không hợp lệ');
  if (validTo !== undefined && validTo !== null && validTo !== '' && (!isDate(validTo) || validTo <= validFrom)) throw new AppError('bad_dates', 'Ngày kết thúc phải sau ngày bắt đầu');
  const k = oneOf(kind ?? 'revenue_share', ['revenue_share', 'master_lease'], 'Loại hợp đồng');
  const params = {
    kind: k, validFrom, validTo: validTo || null,
    ownerSharePct: int(ownerSharePct ?? 70, 'Tỉ lệ chủ nhận (%)', { min: 0, max: 100 }),
    ownerNetFloor: int(ownerNetFloor ?? 0, 'Mức chủ nhận tối thiểu'), fixedRent: int(fixedRent ?? 0, 'Tiền thuê cố định'),
    cleaningPayer: oneOf(cleaningPayer ?? 'owner', ['owner', 'anstay', 'guest'], 'Bên trả phí dọn'),
    cancelPenaltyPct: int(cancelPenaltyPct ?? 20, 'Phạt hủy (%)', { min: 0, max: 100 }),
    statementCycle: oneOf(statementCycle ?? 'month', ['month', 'half'], 'Kỳ bản kê'),
    payoutDelayDays: int(payoutDelayDays ?? 3, 'Số ngày chi trả sau trả phòng', { min: 0, max: 365 }), taxWithhold: taxWithhold === true,
  };
  const ids = [];
  for (const unitId of unitIds) {
    assertUuid(unitId, 'căn');
    const [u] = await c.query('SELECT owner_id, code FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
    if (!u) throw new AppError('not_found', 'Không tìm thấy căn', 404);
    await c.query('SAVEPOINT add_contract');
    try {
      ids.push((await createContract(c, { orgId, ownerId: u.owner_id, unitId, ...params })).id);
      await c.query('RELEASE SAVEPOINT add_contract');
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT add_contract');
      if (e && e.code === '23P01') throw new AppError('contract_overlap', `Căn ${u.code} đã có hợp đồng trùng khoảng ngày`, 409);
      if (e && e.code === '23514') throw new AppError('bad_input', 'Điều khoản hợp đồng không hợp lệ', 400);
      throw e;
    }
  }
  return { ids };
}

// Mở bán các đêm [from, to) cho nhiều căn (quản lý được mở cả đêm Anstay đã khóa).
export async function openUnitNights(c, { orgId, unitIds, from, to, by }) {
  if (!Array.isArray(unitIds) || !unitIds.length || unitIds.length > 200) throw new AppError('bad_input', 'Cần chọn từ 1 đến 200 căn');
  const nights = nightsBetween(from, to).length;
  let total = 0;
  for (const unitId of unitIds) total += await openNights(c, { orgId, unitId, from, to, source: 'app', by, protectAnstay: false });
  return { units: unitIds.length, nightsPerUnit: nights, total };
}
