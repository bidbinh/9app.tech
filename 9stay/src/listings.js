import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { todayVN, addDays } from './time.js';
import { getSetting } from './settings.js';
import { ensureRatePlans } from './pricing.js';
import { createContract } from './inventory.js';
import { AMENITY_CODES, CANCEL_POLICIES, LIMITS } from './listing-meta.js';

const MIN_PRICE = 50_000;
const MAX_PRICE = 100_000_000;
const ACTIVE_DAYS = LIMITS.ratesHorizonDays;

// ---- kiểm đầu vào ----
const clean = (v, label, { max, min = 0, multiline = false } = {}) => {
  if (v === undefined || v === null) {
    if (min > 0) throw new AppError('bad_input', `${label} không được để trống`);
    return '';
  }
  if (typeof v !== 'string') throw new AppError('bad_input', `${label} không hợp lệ`);
  const s = v.replace(/\r\n/g, '\n').trim();
  // chặn ký tự điều khiển (trừ xuống dòng khi cho phép nhiều dòng) và ký tự đảo chiều chữ
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/.test(s) || (!multiline && /\n/.test(s))) throw new AppError('bad_input', `${label} có ký tự không hợp lệ`);
  if (s.length > max) throw new AppError('bad_input', `${label} tối đa ${max} ký tự`);
  if (s.length < min) throw new AppError('bad_input', `${label} tối thiểu ${min} ký tự`);
  return s;
};
const intIn = (v, label, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new AppError('bad_input', `${label} phải là số nguyên từ ${min} đến ${max}`);
  return v;
};
const priceIn = (v, label) => intIn(v, label, MIN_PRICE, MAX_PRICE);

function fieldsOf(input, { partial }) {
  const out = {};
  const has = (k) => input[k] !== undefined;
  if (has('title')) out.title = clean(input.title, 'Tiêu đề', { max: 100 });
  if (has('description')) out.description = clean(input.description, 'Mô tả', { max: 4000, multiline: true });
  if (has('houseRules')) out.house_rules = clean(input.houseRules, 'Nội quy', { max: 1500, multiline: true });
  if (has('amenities')) {
    if (!Array.isArray(input.amenities) || input.amenities.length > 40 || !input.amenities.every((a) => AMENITY_CODES.has(a))) throw new AppError('bad_input', 'Tiện nghi không hợp lệ');
    out.amenities = [...new Set(input.amenities)];
  }
  if (has('cancelPolicy')) {
    if (!(input.cancelPolicy in CANCEL_POLICIES)) throw new AppError('bad_input', 'Chính sách hủy không hợp lệ');
    out.cancel_policy = input.cancelPolicy;
  }
  if (has('bedrooms')) out.bedrooms = intIn(input.bedrooms, 'Số phòng ngủ', 0, 20);
  if (has('beds')) out.beds = intIn(input.beds, 'Số giường', 1, 40);
  if (has('bathrooms')) out.bathrooms = intIn(input.bathrooms, 'Số phòng tắm', 0, 20);
  if (has('capacityStd')) out.capacity_std = intIn(input.capacityStd, 'Sức chứa chuẩn', 1, 30);
  if (has('capacityMax')) out.capacity_max = intIn(input.capacityMax, 'Sức chứa tối đa', 1, 30);
  if (has('proposedPrice')) out.proposed_price = input.proposedPrice === 0 ? 0 : priceIn(input.proposedPrice, 'Giá ngày thường');
  if (has('proposedWeekendPrice')) out.proposed_weekend_price = input.proposedWeekendPrice === 0 ? 0 : priceIn(input.proposedWeekendPrice, 'Giá cuối tuần');
  if (has('attest')) out.attest_building_allows = input.attest === true;
  if (!partial && !Object.keys(out).length) throw new AppError('bad_input', 'Không có thông tin nào để lưu');
  return out;
}

// actor = { role, memberId, ownerId }. Chủ chỉ đụng tin của chính mình; quản lý đụng mọi tin. Tin của chủ khác trả 404 (không lộ sự tồn tại).
async function loadListing(c, actor, orgId, listingId, { lock = false } = {}) {
  assertUuid(listingId, 'tin');
  const [l] = await c.query(`SELECT * FROM listings WHERE id = $1 AND org_id = $2${lock ? ' FOR UPDATE' : ''}`, [listingId, orgId]);
  if (!l || (actor.role !== 'quanly' && l.owner_id !== actor.ownerId)) throw new AppError('not_found', 'Không tìm thấy tin', 404);
  return l;
}

// ---- Tòa nhà ----
export async function listBuildingsFor(c, { orgId, actor }) {
  const rows = await c.query(
    `SELECT id, name, address, province, district, legal_type, status, multi_owner, reject_reason FROM buildings
      WHERE org_id = $1 AND ($2::boolean OR status = 'approved' OR created_by_member = $3::uuid) ORDER BY name`,
    [orgId, actor.role === 'quanly', actor.memberId]);
  return rows.map((b) => ({ id: b.id, name: b.name, address: b.address, province: b.province, district: b.district, legalType: b.legal_type, status: b.status, multiOwner: b.multi_owner, rejectReason: b.reject_reason }));
}

export async function proposeBuilding(c, { orgId, actor, name, address, province, district, legalType }) {
  const lt = legalType ?? 'can_ho_du_lich';
  if (!['can_ho_du_lich', 'nha_o', 'khac'].includes(lt)) throw new AppError('bad_input', 'Loại hình không hợp lệ');
  const [n] = await c.query("SELECT count(*)::int AS n FROM buildings WHERE org_id = $1 AND status = 'pending' AND created_by_member = $2", [orgId, actor.memberId]);
  if (n.n >= LIMITS.maxPendingPerOwner) throw new AppError('too_many_pending', 'Bạn đang có quá nhiều tòa nhà chờ duyệt', 409);
  const [b] = await c.query(
    `INSERT INTO buildings(org_id, name, address, province, district, legal_type, status, created_by_member) VALUES($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING id`,
    [orgId, clean(name, 'Tên tòa nhà', { max: 120, min: 2 }), clean(address, 'Địa chỉ', { max: 200, min: 5 }), clean(province, 'Tỉnh/thành', { max: 60, min: 2 }), clean(district, 'Quận/huyện', { max: 60 }), lt, actor.memberId]);
  return { id: b.id };
}

export async function decideBuilding(c, { orgId, buildingId, by, approve, reason }) {
  assertUuid(buildingId, 'tòa nhà');
  const [b] = await c.query('SELECT id, status FROM buildings WHERE id = $1 AND org_id = $2 FOR UPDATE', [buildingId, orgId]);
  if (!b) throw new AppError('not_found', 'Không tìm thấy tòa nhà', 404);
  if (b.status !== 'pending') throw new AppError('not_pending', 'Tòa nhà này không ở trạng thái chờ duyệt', 409);
  const why = approve ? '' : clean(reason, 'Lý do từ chối', { max: 300, min: 5 });
  await c.query('UPDATE buildings SET status = $2, reject_reason = $3 WHERE id = $1', [buildingId, approve ? 'approved' : 'rejected', why]);
  return { id: buildingId, status: approve ? 'approved' : 'rejected' };
}

// ---- Tin đăng ----
export async function createListing(c, { orgId, actor, ownerId, buildingId, unitIds = [], ...input }) {
  const owner = actor.role === 'quanly' ? ownerId : actor.ownerId;
  assertUuid(owner, 'chủ phòng');
  assertUuid(buildingId, 'tòa nhà');
  const [o] = await c.query("SELECT id FROM owners WHERE id = $1 AND org_id = $2 AND status = 'active'", [owner, orgId]);
  if (!o) throw new AppError('not_found', 'Không tìm thấy chủ phòng', 404);
  const [b] = await c.query('SELECT id, status, created_by_member FROM buildings WHERE id = $1 AND org_id = $2', [buildingId, orgId]);
  if (!b || (b.status === 'rejected') || (b.status === 'pending' && actor.role !== 'quanly' && b.created_by_member !== actor.memberId) || (b.status !== 'approved' && b.status !== 'pending')) {
    throw new AppError('not_found', 'Không tìm thấy tòa nhà', 404);
  }
  const f = fieldsOf(input, { partial: true });
  const std = f.capacity_std ?? 2;
  const max = f.capacity_max ?? Math.max(std, 4);
  if (max < std) throw new AppError('bad_input', 'Sức chứa tối đa phải từ sức chứa chuẩn trở lên');
  const [open] = await c.query("SELECT count(*)::int AS n FROM listings WHERE owner_id = $1 AND status IN ('draft', 'rejected')", [owner]);
  if (open.n >= 30) throw new AppError('too_many_drafts', 'Bạn có quá nhiều tin nháp, hãy hoàn thiện hoặc xóa bớt', 409);
  const [rt] = await c.query('INSERT INTO room_types(org_id, name, capacity_std, capacity_max) VALUES($1, $2, $3, $4) RETURNING id', [orgId, `Tin: ${f.title || 'chưa đặt tên'}`.slice(0, 80), std, max]);
  const cols = { ...f, capacity_std: std, capacity_max: max };
  const keys = Object.keys(cols);
  const [l] = await c.query(
    `INSERT INTO listings(org_id, building_id, owner_id, room_type_id, created_by${keys.map((k) => ', ' + k).join('')})
     VALUES($1, $2, $3, $4, $5${keys.map((_, i) => ', $' + (i + 6)).join('')}) RETURNING id`,
    [orgId, buildingId, owner, rt.id, actor.memberId, ...keys.map((k) => cols[k])]);
  for (const uid of unitIds) await attachUnit(c, { orgId, listingId: l.id, ownerId: owner, buildingId, roomTypeId: rt.id, unitId: uid, std, max, force: actor.role === 'quanly' });
  return { id: l.id };
}

// Gắn căn có sẵn (admin đã tạo và gán cho chủ, thường ở tòa nhiều chủ). Chủ chỉ gắn được căn CHƯA TỪNG vận hành (chưa có hợp đồng, chưa có lịch đặt),
// nên không tự rút căn đang bán khỏi kho của admin. Lưu trạng thái cũ để gỡ thì khôi phục. Quản lý được gắn mọi căn (force).
async function attachUnit(c, { orgId, listingId, ownerId, buildingId, roomTypeId, unitId, std, max, force = false }, now = new Date()) {
  assertUuid(unitId, 'căn');
  const [u] = await c.query('SELECT id, building_id, owner_id, room_type_id, status, capacity_std, capacity_max FROM units WHERE id = $1 AND org_id = $2 FOR UPDATE', [unitId, orgId]);
  if (!u || u.owner_id !== ownerId || u.building_id !== buildingId) throw new AppError('not_found', 'Không tìm thấy căn của bạn trong tòa này', 404);
  const [used] = await c.query('SELECT 1 FROM listing_units WHERE unit_id = $1', [unitId]);
  if (used) throw new AppError('unit_in_listing', 'Căn này đã thuộc một tin khác', 409);
  const [busy] = await c.query('SELECT 1 FROM room_nights WHERE unit_id = $1 AND active AND night >= $2::date LIMIT 1', [unitId, todayVN(now)]);
  if (busy) throw new AppError('unit_busy', 'Căn đang có khách đặt, chưa thêm vào tin được', 409);
  if (!force) {
    const [ops] = await c.query('SELECT (EXISTS (SELECT 1 FROM owner_contracts WHERE unit_id = $1) OR EXISTS (SELECT 1 FROM room_nights WHERE unit_id = $1)) AS used', [unitId]);
    if (ops.used) throw new AppError('unit_in_operation', 'Căn này đã vận hành (có hợp đồng hoặc lịch đặt), hãy nhờ admin gắn vào tin', 409);
  }
  await c.query("UPDATE units SET room_type_id = $2, status = 'inactive', capacity_std = $3, capacity_max = $4 WHERE id = $1", [unitId, roomTypeId, std, max]);
  await c.query('INSERT INTO listing_units(listing_id, owner_id, unit_id, prev_room_type_id, prev_status, prev_capacity_std, prev_capacity_max) VALUES($1, $2, $3, $4, $5, $6, $7)',
    [listingId, ownerId, unitId, u.room_type_id, u.status, u.capacity_std, u.capacity_max]);
}

// Gỡ căn khỏi tin: căn do tin tạo ra thì xóa (nếu đã có dữ liệu thì giữ lại, không hoạt động); căn gắn từ ngoài thì khôi phục loại phòng/trạng thái cũ.
async function releaseUnit(c, row) {
  if (row.prev_room_type_id) {
    await c.query('UPDATE units SET room_type_id = $2, status = $3, capacity_std = $4, capacity_max = $5 WHERE id = $1', [row.unit_id, row.prev_room_type_id, row.prev_status, row.prev_capacity_std, row.prev_capacity_max]);
    return;
  }
  await c.query('SAVEPOINT release_unit');
  try { await c.query('DELETE FROM units WHERE id = $1', [row.unit_id]); await c.query('RELEASE SAVEPOINT release_unit'); } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT release_unit');
    if (!e || e.code !== '23503') throw e;
  }
}

export async function addListingUnits(c, { orgId, actor, listingId, codes = [], unitIds = [], floor }, { now = new Date() } = {}) {
  const l = await loadListing(c, actor, orgId, listingId, { lock: true });
  if (!['draft', 'rejected'].includes(l.status)) throw new AppError('not_editable', 'Chỉ thêm căn khi tin là nháp hoặc bị từ chối', 409);
  if (!Array.isArray(codes) || !Array.isArray(unitIds) || codes.length + unitIds.length < 1 || codes.length + unitIds.length > 50) throw new AppError('bad_input', 'Cần từ 1 đến 50 căn');
  const list = codes.map((x) => clean(x, 'Mã căn', { max: 30, min: 1 }));
  if (new Set(list.map((x) => x.toLowerCase())).size !== list.length) throw new AppError('bad_input', 'Có mã căn bị lặp');
  if (list.length && actor.role !== 'quanly') {
    // tòa nhiều chủ: căn do admin tạo và gán; chủ không tự đặt mã (tránh chiếm mã căn của người khác)
    const [b] = await c.query('SELECT multi_owner FROM buildings WHERE id = $1', [l.building_id]);
    if (b.multi_owner) throw new AppError('assigned_only', 'Tòa nhiều chủ: chỉ gắn các căn admin đã gán cho bạn', 403);
  }
  const fl = floor === undefined || floor === null || floor === '' ? null : intIn(floor, 'Tầng', -5, 200);
  const ids = [];
  for (const code of list) {
    await c.query('SAVEPOINT add_listing_unit');
    try {
      const [u] = await c.query(
        "INSERT INTO units(org_id, building_id, owner_id, room_type_id, code, floor, capacity_std, capacity_max, status) VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'inactive') RETURNING id",
        [orgId, l.building_id, l.owner_id, l.room_type_id, code, fl, l.capacity_std, l.capacity_max]);
      await c.query('INSERT INTO listing_units(listing_id, owner_id, unit_id) VALUES($1, $2, $3)', [l.id, l.owner_id, u.id]);
      await c.query('RELEASE SAVEPOINT add_listing_unit');
      ids.push(u.id);
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT add_listing_unit');
      // không nói rõ mã nào đã tồn tại với chủ (tránh dò mã căn của người khác); quản lý thì được biết
      if (e && e.code === '23505') throw new AppError('duplicate', actor.role === 'quanly' ? `Mã căn "${code}" đã có trong tòa này` : 'Không tạo được căn với mã này (mã đã được dùng), hãy đổi mã khác', 409);
      throw e;
    }
  }
  for (const uid of unitIds) { await attachUnit(c, { orgId, listingId: l.id, ownerId: l.owner_id, buildingId: l.building_id, roomTypeId: l.room_type_id, unitId: uid, std: l.capacity_std, max: l.capacity_max, force: actor.role === 'quanly' }, now); ids.push(uid); }
  await c.query('UPDATE listings SET updated_at = now(), version = version + 1 WHERE id = $1', [l.id]);
  return { ids };
}

export async function removeListingUnit(c, { orgId, actor, listingId, unitId }) {
  const l = await loadListing(c, actor, orgId, listingId, { lock: true });
  if (!['draft', 'rejected'].includes(l.status)) throw new AppError('not_editable', 'Chỉ bớt căn khi tin là nháp hoặc bị từ chối', 409);
  assertUuid(unitId, 'căn');
  const [row] = await c.query('DELETE FROM listing_units WHERE listing_id = $1 AND unit_id = $2 RETURNING *', [listingId, unitId]);
  if (!row) throw new AppError('not_found', 'Căn không thuộc tin này', 404);
  await releaseUnit(c, row);
}

// Sau khi tin ĐÃ DUYỆT: chủ không tự sửa nội dung/ảnh (chỉ đề xuất đổi giá, mở/đóng đêm); quản lý sửa được. Tin chờ duyệt thì ai cũng không sửa.
export function guardEdit(l, actor) {
  if (l.status === 'pending') throw new AppError('pending_review', 'Tin đang chờ duyệt, chưa sửa được', 409);
  if (['approved', 'suspended'].includes(l.status) && actor.role !== 'quanly') {
    throw new AppError('locked_after_approval', 'Tin đã được duyệt: nội dung do admin chỉnh. Bạn có thể đề xuất đổi giá hoặc nhờ admin sửa.', 409);
  }
}
export async function assertPhotoEditable(c, { orgId, actor, listingId }) {
  guardEdit(await loadListing(c, actor, orgId, listingId), actor);
}

export async function updateListing(c, { orgId, actor, listingId, ...input }) {
  const l = await loadListing(c, actor, orgId, listingId, { lock: true });
  guardEdit(l, actor);
  const f = fieldsOf(input, { partial: false });
  if (l.status === 'approved' || l.status === 'suspended') {
    // giá đã chạy chỉ đổi qua đề xuất được duyệt
    if (f.proposed_price !== undefined || f.proposed_weekend_price !== undefined) throw new AppError('use_price_change', 'Tin đã duyệt: đổi giá qua "Đề xuất đổi giá"', 409);
    if (f.attest_building_allows === false) throw new AppError('bad_input', 'Không thể rút cam kết sau khi đã duyệt');
  }
  const std = f.capacity_std ?? l.capacity_std;
  const max = f.capacity_max ?? l.capacity_max;
  if (max < std) throw new AppError('bad_input', 'Sức chứa tối đa phải từ sức chứa chuẩn trở lên');
  const keys = Object.keys(f);
  await c.query(`UPDATE listings SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = now(), version = version + 1 WHERE id = $1 AND org_id = $2`, [l.id, orgId, ...keys.map((k) => f[k])]);
  if (f.title !== undefined || f.capacity_std !== undefined || f.capacity_max !== undefined) {
    await c.query('UPDATE room_types SET name = $2, capacity_std = $3, capacity_max = $4 WHERE id = $1', [l.room_type_id, `Tin: ${(f.title ?? l.title) || 'chưa đặt tên'}`.slice(0, 80), std, max]);
    await c.query('UPDATE units SET capacity_std = $2, capacity_max = $3 WHERE id IN (SELECT unit_id FROM listing_units WHERE listing_id = $1)', [l.id, std, max]);
  }
  return { id: l.id };
}

// Trả removeFiles: route xóa thư mục ảnh SAU KHI giao dịch commit (giao dịch lỗi thì ảnh còn nguyên).
export async function deleteDraft(c, { orgId, actor, listingId }) {
  const l = await loadListing(c, actor, orgId, listingId, { lock: true });
  if (l.status !== 'draft') throw new AppError('not_editable', 'Chỉ xóa được tin nháp', 409);
  const rows = await c.query('SELECT * FROM listing_units WHERE listing_id = $1', [l.id]);
  await c.query('DELETE FROM listings WHERE id = $1', [l.id]); // listing_units và ảnh (CSDL) xóa theo
  for (const row of rows) await releaseUnit(c, row);
  await c.query('SAVEPOINT del_room_type');
  try { await c.query('DELETE FROM room_types WHERE id = $1', [l.room_type_id]); await c.query('RELEASE SAVEPOINT del_room_type'); } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT del_room_type'); // còn căn/dữ liệu trỏ vào thì giữ loại phòng
    if (!e || e.code !== '23503') throw e;
  }
  return { ok: true, removeFiles: l.id };
}

export async function submitListing(c, { orgId, actor, listingId }, { now = new Date() } = {}) {
  const l = await loadListing(c, actor, orgId, listingId, { lock: true });
  if (!['draft', 'rejected'].includes(l.status)) throw new AppError('not_editable', 'Tin này không ở trạng thái gửi duyệt được', 409);
  const problems = [];
  if (l.title.length < 10) problems.push('Tiêu đề tối thiểu 10 ký tự');
  if (l.description.length < 50) problems.push('Mô tả tối thiểu 50 ký tự');
  const [u] = await c.query('SELECT count(*)::int AS n FROM listing_units WHERE listing_id = $1', [l.id]);
  if (u.n < 1) problems.push('Cần ít nhất một căn');
  const [p] = await c.query('SELECT count(*)::int AS n FROM listing_photos WHERE listing_id = $1', [l.id]);
  if (p.n < LIMITS.minPhotosToSubmit) problems.push(`Cần ít nhất ${LIMITS.minPhotosToSubmit} ảnh`);
  if (l.proposed_price < MIN_PRICE) problems.push('Cần nhập giá ngày thường');
  if (!l.attest_building_allows) problems.push('Cần xác nhận tòa nhà cho phép cho thuê ngắn ngày');
  const [b] = await c.query('SELECT status FROM buildings WHERE id = $1', [l.building_id]);
  if (b.status === 'rejected') problems.push('Tòa nhà đã bị từ chối');
  if (problems.length) throw new AppError('incomplete', 'Tin chưa đủ thông tin: ' + problems.join('; '), 422, { problems });
  const [pend] = await c.query("SELECT count(*)::int AS n FROM listings WHERE owner_id = $1 AND status = 'pending'", [l.owner_id]);
  if (pend.n >= LIMITS.maxPendingPerOwner) throw new AppError('too_many_pending', 'Bạn đang có quá nhiều tin chờ duyệt', 409);
  const weekend = l.proposed_weekend_price > 0 ? l.proposed_weekend_price : l.proposed_price;
  await c.query("UPDATE listings SET status = 'pending', reject_reason = '', proposed_weekend_price = $2, submitted_at = $3, updated_at = now(), version = version + 1 WHERE id = $1", [l.id, weekend, now]);
  return { id: l.id, status: 'pending' };
}

// ---- Giá lịch theo tin ----
// overwrite=true: ghi đè giá (kèm lịch sử); false: chỉ điền đêm còn thiếu (kéo dài chân trời). Giữ nguyên min_stay/closed đã đặt tay.
export async function writeListingRates(c, { orgId, roomTypeId, price, weekendPrice, from, to, by = null, overwrite }) {
  const plans = await ensureRatePlans(c, { orgId });
  for (const planId of [plans.public, plans.ctv]) {
    const nightsCte = `SELECT d::date AS n, CASE WHEN extract(isodow FROM d) IN (5, 6) THEN $5::bigint ELSE $4::bigint END AS p FROM generate_series($6::date, $7::date - 1, interval '1 day') d`;
    if (overwrite) {
      await c.query(
        `INSERT INTO rate_calendar_history(org_id, room_type_id, plan_id, night, old_price, new_price, old_closed, new_closed, source, changed_by)
         SELECT $1::uuid, $2::uuid, $3::uuid, np.n, o.price, np.p, o.closed, COALESCE(o.closed, false), 'listing', $8::uuid
           FROM (${nightsCte}) np LEFT JOIN rate_calendar o ON o.room_type_id = $2::uuid AND o.plan_id = $3::uuid AND o.night = np.n
          WHERE o.price IS DISTINCT FROM np.p AND (o.source IS NULL OR o.source = 'listing')`,
        [orgId, roomTypeId, planId, price, weekendPrice, from, to, by]);
    }
    await c.query(
      `INSERT INTO rate_calendar(org_id, room_type_id, plan_id, night, price, min_stay, closed, source, updated_by)
       SELECT $1::uuid, $2::uuid, $3::uuid, np.n, np.p, 1, false, 'listing', $8::uuid FROM (${nightsCte}) np
       ON CONFLICT (room_type_id, plan_id, night) ${overwrite ? "DO UPDATE SET price = EXCLUDED.price, source = 'listing', updated_by = EXCLUDED.updated_by, updated_at = now() WHERE rate_calendar.source = 'listing'" : 'DO NOTHING'}`,
      [orgId, roomTypeId, planId, price, weekendPrice, from, to, by]);
  }
}

// Kéo dài lịch giá của các tin đã duyệt tới hôm nay + 540 đêm (chạy định kỳ).
export async function extendListingRates(c, { now = new Date() } = {}) {
  const today = todayVN(now);
  const to = addDays(today, ACTIVE_DAYS);
  // chỉ tin còn thiếu đêm (đêm cuối đã có < hôm nay + 540); điền từ ngày sau đêm cuối, không quét lại cả 540 đêm
  const rows = await c.query(
    `SELECT l.org_id, l.room_type_id, l.live_price, l.live_weekend_price, (SELECT max(night) FROM rate_calendar r WHERE r.room_type_id = l.room_type_id) AS mx
       FROM listings l WHERE l.status = 'approved' AND l.live_price > 0`);
  let filled = 0;
  for (const l of rows) {
    const from = l.mx && l.mx >= today ? addDays(l.mx, 1) : today;
    if (from >= to) continue;
    await writeListingRates(c, { orgId: l.org_id, roomTypeId: l.room_type_id, price: l.live_price, weekendPrice: l.live_weekend_price, from, to, overwrite: false });
    filled += 1;
  }
  return { listings: rows.length, filled };
}

// ---- Duyệt ----
export async function approveListing(c, { orgId, listingId, by, price, weekendPrice, ownerSharePct, ownerNetFloor, cleaningPayer, payoutDelayDays, kind }, { now = new Date() } = {}) {
  assertUuid(listingId, 'tin');
  const [l] = await c.query('SELECT * FROM listings WHERE id = $1 AND org_id = $2 FOR UPDATE', [listingId, orgId]);
  if (!l) throw new AppError('not_found', 'Không tìm thấy tin', 404);
  if (l.status !== 'pending') throw new AppError('not_pending', 'Tin này không ở trạng thái chờ duyệt', 409);
  const [b] = await c.query('SELECT status FROM buildings WHERE id = $1', [l.building_id]);
  if (b.status !== 'approved') throw new AppError('building_not_approved', 'Cần duyệt tòa nhà trước khi duyệt tin', 409);
  const p = priceIn(price ?? l.proposed_price, 'Giá ngày thường');
  const w = priceIn(weekendPrice ?? (l.proposed_weekend_price || p), 'Giá cuối tuần');
  const today = todayVN(now);
  const share = ownerSharePct ?? (await getSetting(c, { orgId, key: 'listing.defaultOwnerSharePct', asOf: today }));
  intIn(share, 'Tỉ lệ chủ nhận (%)', 0, 100);
  const payer = cleaningPayer ?? 'owner';
  if (!['owner', 'anstay', 'guest'].includes(payer)) throw new AppError('bad_input', 'Bên trả phí dọn không hợp lệ');
  const k = kind ?? 'revenue_share';
  if (!['revenue_share', 'master_lease'].includes(k)) throw new AppError('bad_input', 'Loại hợp đồng không hợp lệ');
  const delay = payoutDelayDays ?? 3;
  intIn(delay, 'Số ngày chi trả', 0, 365);
  const floor = ownerNetFloor ?? 0;
  intIn(floor, 'Sàn chủ nhận', 0, MAX_PRICE);
  const units = (await c.query('SELECT unit_id FROM listing_units WHERE listing_id = $1', [l.id])).map((r) => r.unit_id);
  if (!units.length) throw new AppError('no_units', 'Tin chưa có căn nào', 409);
  for (const unitId of units) {
    await c.query("UPDATE units SET status = 'active' WHERE id = $1", [unitId]);
    const [has] = await c.query('SELECT 1 FROM owner_contracts WHERE unit_id = $1 AND valid_from <= $2::date AND (valid_to IS NULL OR valid_to > $2::date)', [unitId, today]);
    if (!has) {
      await createContract(c, { orgId, ownerId: l.owner_id, unitId, validFrom: today, kind: k, ownerSharePct: share, ownerNetFloor: floor, cleaningPayer: payer, cancelPenaltyPct: CANCEL_POLICIES[l.cancel_policy].penaltyPct, payoutDelayDays: delay });
    }
  }
  await writeListingRates(c, { orgId, roomTypeId: l.room_type_id, price: p, weekendPrice: w, from: today, to: addDays(today, ACTIVE_DAYS), by, overwrite: true });
  await c.query("UPDATE listings SET status = 'approved', live_price = $2, live_weekend_price = $3, reject_reason = '', decided_by = $4, decided_at = $5, updated_at = now(), version = version + 1 WHERE id = $1", [l.id, p, w, by, now]);
  return { id: l.id, status: 'approved', units: units.length };
}

export async function rejectListing(c, { orgId, listingId, by, reason }, { now = new Date() } = {}) {
  assertUuid(listingId, 'tin');
  const why = clean(reason, 'Lý do từ chối', { max: 500, min: 5 });
  const [l] = await c.query('SELECT id, status FROM listings WHERE id = $1 AND org_id = $2 FOR UPDATE', [listingId, orgId]);
  if (!l) throw new AppError('not_found', 'Không tìm thấy tin', 404);
  if (l.status !== 'pending') throw new AppError('not_pending', 'Tin này không ở trạng thái chờ duyệt', 409);
  await c.query("UPDATE listings SET status = 'rejected', reject_reason = $2, decided_by = $3, decided_at = $4, updated_at = now(), version = version + 1 WHERE id = $1", [l.id, why, by, now]);
  return { id: l.id, status: 'rejected' };
}

export async function setSuspended(c, { orgId, listingId, by, suspend, reason }, { now = new Date() } = {}) {
  assertUuid(listingId, 'tin');
  const [l] = await c.query('SELECT id, status FROM listings WHERE id = $1 AND org_id = $2 FOR UPDATE', [listingId, orgId]);
  if (!l) throw new AppError('not_found', 'Không tìm thấy tin', 404);
  if (suspend) {
    if (l.status !== 'approved') throw new AppError('bad_state', 'Chỉ tạm ngưng được tin đang hiển thị', 409);
    await c.query("UPDATE listings SET status = 'suspended', reject_reason = $2, decided_by = $3, decided_at = $4, updated_at = now() WHERE id = $1", [l.id, clean(reason, 'Lý do tạm ngưng', { max: 500, min: 5 }), by, now]);
  } else {
    if (l.status !== 'suspended') throw new AppError('bad_state', 'Tin này không đang bị tạm ngưng', 409);
    await c.query("UPDATE listings SET status = 'approved', reject_reason = '', decided_by = $2, decided_at = $3, updated_at = now() WHERE id = $1", [l.id, by, now]);
  }
  return { id: l.id };
}

// ---- Đổi giá sau duyệt ----
export async function proposePriceChange(c, { orgId, actor, listingId, price, weekendPrice }) {
  const l = await loadListing(c, actor, orgId, listingId, { lock: true });
  if (!['approved', 'suspended'].includes(l.status)) throw new AppError('bad_state', 'Chỉ đề xuất đổi giá cho tin đã duyệt', 409);
  const p = priceIn(price, 'Giá ngày thường');
  const w = priceIn(weekendPrice ?? price, 'Giá cuối tuần');
  try {
    const [r] = await c.query('INSERT INTO price_changes(org_id, listing_id, proposed_price, proposed_weekend_price, proposed_by) VALUES($1, $2, $3, $4, $5) RETURNING id', [orgId, l.id, p, w, actor.memberId]);
    return { id: r.id };
  } catch (e) {
    if (e && e.code === '23505') throw new AppError('pending_exists', 'Đã có một đề xuất đổi giá đang chờ duyệt', 409);
    throw e;
  }
}

export async function decidePriceChange(c, { orgId, changeId, by, approve, reason }, { now = new Date() } = {}) {
  assertUuid(changeId, 'đề xuất');
  const [peek] = await c.query('SELECT listing_id FROM price_changes WHERE id = $1 AND org_id = $2', [changeId, orgId]);
  if (!peek) throw new AppError('not_found', 'Không tìm thấy đề xuất', 404);
  await c.query('SELECT 1 FROM listings WHERE id = $1 FOR UPDATE', [peek.listing_id]); // cùng thứ tự khóa với proposePriceChange: tin trước, đề xuất sau
  const [pc] = await c.query('SELECT * FROM price_changes WHERE id = $1 AND org_id = $2 FOR UPDATE', [changeId, orgId]);
  if (pc.status !== 'pending') throw new AppError('not_pending', 'Đề xuất này đã được xử lý', 409);
  if (!approve) {
    await c.query("UPDATE price_changes SET status = 'rejected', reject_reason = $2, decided_by = $3, decided_at = $4 WHERE id = $1", [pc.id, clean(reason, 'Lý do từ chối', { max: 300, min: 5 }), by, now]);
    return { id: pc.id, status: 'rejected' };
  }
  const [l] = await c.query('SELECT id, room_type_id FROM listings WHERE id = $1 FOR UPDATE', [pc.listing_id]);
  const today = todayVN(now);
  await c.query('UPDATE listings SET live_price = $2, live_weekend_price = $3, updated_at = now(), version = version + 1 WHERE id = $1', [l.id, pc.proposed_price, pc.proposed_weekend_price]);
  // áp từ ngày mai: đơn đã đặt giữ nguyên giá (dòng giá chụp lúc đặt)
  await writeListingRates(c, { orgId, roomTypeId: l.room_type_id, price: pc.proposed_price, weekendPrice: pc.proposed_weekend_price, from: addDays(today, 1), to: addDays(today, ACTIVE_DAYS), by, overwrite: true });
  await c.query("UPDATE price_changes SET status = 'approved', decided_by = $2, decided_at = $3 WHERE id = $1", [pc.id, by, now]);
  return { id: pc.id, status: 'approved' };
}

// ---- Đọc ----
export async function listListings(c, { orgId, actor, status = null }) {
  if (status !== null && !['draft', 'pending', 'approved', 'rejected', 'suspended'].includes(status)) throw new AppError('bad_status', 'Trạng thái không hợp lệ');
  const rows = await c.query(
    `SELECT l.id, l.title, l.status, l.reject_reason, l.live_price, l.proposed_price, l.updated_at, b.name AS building_name, o.name AS owner_name,
            (SELECT count(*)::int FROM listing_units x WHERE x.listing_id = l.id) AS units,
            (SELECT count(*)::int FROM listing_photos x WHERE x.listing_id = l.id) AS photos,
            (SELECT id FROM listing_photos x WHERE x.listing_id = l.id ORDER BY position LIMIT 1) AS cover,
            (SELECT proposed_price FROM price_changes x WHERE x.listing_id = l.id AND x.status = 'pending') AS pending_price
       FROM listings l JOIN buildings b ON b.id = l.building_id JOIN owners o ON o.id = l.owner_id
      WHERE l.org_id = $1 AND ($2::boolean OR l.owner_id = $3::uuid) AND ($4::text IS NULL OR l.status = $4) ORDER BY l.updated_at DESC LIMIT 300`,
    [orgId, actor.role === 'quanly', actor.ownerId ?? null, status]);
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, rejectReason: r.reject_reason, livePrice: r.live_price, proposedPrice: r.proposed_price, pendingPrice: r.pending_price, buildingName: r.building_name, ownerName: r.owner_name, units: r.units, photos: r.photos, cover: r.cover, updatedAt: r.updated_at }));
}

export async function getListingFull(c, { orgId, actor, listingId }) {
  const l = await loadListing(c, actor, orgId, listingId);
  const [b] = await c.query('SELECT id, name, address, province, district, status FROM buildings WHERE id = $1', [l.building_id]);
  const [o] = await c.query('SELECT name FROM owners WHERE id = $1', [l.owner_id]);
  const units = await c.query('SELECT u.id, u.code, u.floor, u.status FROM listing_units x JOIN units u ON u.id = x.unit_id WHERE x.listing_id = $1 ORDER BY u.code', [l.id]);
  const photos = await c.query('SELECT id, position FROM listing_photos WHERE listing_id = $1 ORDER BY position', [l.id]);
  const [pc] = await c.query("SELECT id, proposed_price, proposed_weekend_price FROM price_changes WHERE listing_id = $1 AND status = 'pending'", [l.id]);
  return {
    id: l.id, status: l.status, rejectReason: l.reject_reason, title: l.title, description: l.description, amenities: l.amenities, houseRules: l.house_rules, cancelPolicy: l.cancel_policy,
    bedrooms: l.bedrooms, beds: l.beds, bathrooms: l.bathrooms, capacityStd: l.capacity_std, capacityMax: l.capacity_max, proposedPrice: l.proposed_price, proposedWeekendPrice: l.proposed_weekend_price,
    livePrice: l.live_price, liveWeekendPrice: l.live_weekend_price, attest: l.attest_building_allows, roomTypeId: l.room_type_id, version: l.version,
    building: { id: b.id, name: b.name, address: b.address, province: b.province, district: b.district, status: b.status }, owner: { id: l.owner_id, name: o.name },
    units: units.map((u) => ({ id: u.id, code: u.code, floor: u.floor, status: u.status })), photos: photos.map((p) => ({ id: p.id, position: p.position })),
    priceChange: pc ? { id: pc.id, price: pc.proposed_price, weekendPrice: pc.proposed_weekend_price } : null,
  };
}

// Căn được gán cho chủ nhưng chưa thuộc tin nào (tòa nhiều chủ: admin tạo căn rồi gán chủ).
export async function listUnassignedUnits(c, { orgId, actor }) {
  const rows = await c.query(
    `SELECT u.id, u.code, u.floor, b.id AS building_id, b.name AS building_name FROM units u JOIN buildings b ON b.id = u.building_id
      WHERE u.org_id = $1 AND u.owner_id = $2 AND b.status = 'approved' AND NOT EXISTS (SELECT 1 FROM listing_units x WHERE x.unit_id = u.id) ORDER BY b.name, u.code`,
    [orgId, actor.ownerId]);
  return rows.map((r) => ({ id: r.id, code: r.code, floor: r.floor, buildingId: r.building_id, buildingName: r.building_name }));
}

export async function reviewQueue(c, { orgId }) {
  const buildings = await c.query(
    `SELECT b.id, b.name, b.address, b.province, b.district, b.legal_type, m.display_name AS by_name FROM buildings b LEFT JOIN members m ON m.id = b.created_by_member
      WHERE b.org_id = $1 AND b.status = 'pending' ORDER BY b.name`, [orgId]);
  const listings = await c.query(
    `SELECT l.id, l.title, l.submitted_at, l.proposed_price, l.proposed_weekend_price, b.name AS building_name, b.status AS building_status, o.name AS owner_name,
            (SELECT count(*)::int FROM listing_units x WHERE x.listing_id = l.id) AS units, (SELECT count(*)::int FROM listing_photos x WHERE x.listing_id = l.id) AS photos
       FROM listings l JOIN buildings b ON b.id = l.building_id JOIN owners o ON o.id = l.owner_id WHERE l.org_id = $1 AND l.status = 'pending' ORDER BY l.submitted_at`, [orgId]);
  const changes = await c.query(
    `SELECT p.id, p.proposed_price, p.proposed_weekend_price, l.id AS listing_id, l.title, l.live_price, l.live_weekend_price FROM price_changes p JOIN listings l ON l.id = p.listing_id
      WHERE p.org_id = $1 AND p.status = 'pending' ORDER BY p.created_at`, [orgId]);
  return {
    buildings: buildings.map((b) => ({ id: b.id, name: b.name, address: b.address, province: b.province, district: b.district, legalType: b.legal_type, proposedBy: b.by_name })),
    listings: listings.map((l) => ({ id: l.id, title: l.title, submittedAt: l.submitted_at, proposedPrice: l.proposed_price, proposedWeekendPrice: l.proposed_weekend_price, buildingName: l.building_name, buildingApproved: l.building_status === 'approved', ownerName: l.owner_name, units: l.units, photos: l.photos })),
    priceChanges: changes.map((p) => ({ id: p.id, listingId: p.listing_id, title: p.title, price: p.proposed_price, weekendPrice: p.proposed_weekend_price, livePrice: p.live_price, liveWeekendPrice: p.live_weekend_price })),
  };
}

