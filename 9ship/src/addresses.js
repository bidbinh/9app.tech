// Sổ địa chỉ: người gửi và người nhận dùng chung. Tự lưu sau mỗi đơn; người dùng sửa/xóa/đặt mặc định được.
import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import { cleanParty } from './party.js';

const MAX_ADDRESSES = 100;

export const view = (a) => ({
  id: a.id, label: a.label, contact: a.contact, phone: a.phone, street: a.street, ward: a.ward,
  province: a.province, provinceName: a.province_name, lat: a.lat, lng: a.lng,
  isDefaultSender: a.is_default_sender, useCount: a.use_count, lastUsedAt: a.last_used_at,
});

export async function list(userId) {
  const rows = await query(
    `SELECT * FROM addresses WHERE user_id=$1
      ORDER BY is_default_sender DESC, last_used_at DESC NULLS LAST, id DESC LIMIT $2`, [userId, MAX_ADDRESSES]);
  return rows.map(view);
}

function coords(b) {
  const lat = Number.isFinite(b.lat) ? b.lat : null;
  const lng = Number.isFinite(b.lng) ? b.lng : null;
  if ((lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) throw new ApiError(400, 'invalid_request', 'Tọa độ không hợp lệ');
  return [lat, lng];
}

const SAME = 'user_id=$1 AND phone=$2 AND province=$3 AND ward=$4 AND lower(street)=lower($5)';

// Thêm mới hoặc cập nhật bản đã có (cùng người, số điện thoại, tỉnh, phường, đường). c: kết nối giao dịch.
export async function upsert(c, userId, party, { label, lat = null, lng = null, touch = false, makeDefaultIfNone = false, makeDefault = false } = {}) {
  const found = await c.query(
    `SELECT * FROM addresses WHERE ${SAME} LIMIT 1`,
    [userId, party.phone, party.province, party.ward, party.street]);
  const inc = touch ? 1 : 0;
  let row;
  if (found.length) {
    row = (await c.query(
      `UPDATE addresses SET contact=$2, label=COALESCE($3,label), province_name=$4,
         lat=COALESCE($5,lat), lng=COALESCE($6,lng),
         use_count = use_count + $7::int, last_used_at = CASE WHEN $7::int > 0 THEN now() ELSE last_used_at END
       WHERE id=$1 RETURNING *`,
      [found[0].id, party.contact, label ?? null, party.provinceName, lat, lng, inc]))[0];
  } else {
    const n = (await c.query('SELECT count(*)::int n FROM addresses WHERE user_id=$1', [userId]))[0].n;
    if (n >= MAX_ADDRESSES) throw new ApiError(400, 'limit', `Sổ địa chỉ tối đa ${MAX_ADDRESSES} mục, hãy xóa bớt`);
    row = (await c.query(
      `INSERT INTO addresses(user_id, label, contact, phone, street, ward, province, province_name, lat, lng, use_count, last_used_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::int, CASE WHEN $11::int > 0 THEN now() END) RETURNING *`,
      [userId, label || '', party.contact, party.phone, party.street, party.ward, party.province, party.provinceName, lat, lng, inc]))[0];
  }
  if (makeDefault || makeDefaultIfNone) {
    const has = (await c.query('SELECT 1 FROM addresses WHERE user_id=$1 AND is_default_sender', [userId])).length > 0;
    if (makeDefault || !has) {
      await c.query('UPDATE addresses SET is_default_sender=false WHERE user_id=$1 AND is_default_sender', [userId]);
      row = (await c.query('UPDATE addresses SET is_default_sender=true WHERE id=$1 RETURNING *', [row.id]))[0];
    }
  }
  return row;
}

export async function save(userId, body) {
  const party = cleanParty(body, 'address');
  const [lat, lng] = coords(body || {});
  const label = body.label === undefined ? undefined : String(body.label).trim().slice(0, 40);
  return tx(async (c) => view(await upsert(c, userId, party, { label, lat, lng, makeDefault: Boolean(body.isDefaultSender) })));
}

export async function update(userId, id, body) {
  const cur = (await query('SELECT * FROM addresses WHERE id=$1 AND user_id=$2', [Number(id) || 0, userId]))[0];
  if (!cur) throw new ApiError(404, 'not_found', 'Không có địa chỉ này');
  const party = cleanParty({ ...view(cur), ...body }, 'address');
  const [lat, lng] = coords({ lat: body.lat === undefined ? cur.lat : body.lat, lng: body.lng === undefined ? cur.lng : body.lng });
  const label = body.label === undefined ? cur.label : String(body.label).trim().slice(0, 40);
  return tx(async (c) => {
    const dupe = await c.query(
      `SELECT id FROM addresses WHERE ${SAME} AND id <> $6`,
      [userId, party.phone, party.province, party.ward, party.street, cur.id]);
    if (dupe.length) throw new ApiError(409, 'duplicate', 'Đã có địa chỉ giống hệt trong sổ');
    let row = (await c.query(
      `UPDATE addresses SET contact=$2, phone=$3, street=$4, ward=$5, province=$6, province_name=$7, label=$8, lat=$9, lng=$10
        WHERE id=$1 RETURNING *`,
      [cur.id, party.contact, party.phone, party.street, party.ward, party.province, party.provinceName, label, lat, lng]))[0];
    if (body.isDefaultSender === true) {
      await c.query('UPDATE addresses SET is_default_sender=false WHERE user_id=$1 AND is_default_sender', [userId]);
      row = (await c.query('UPDATE addresses SET is_default_sender=true WHERE id=$1 RETURNING *', [cur.id]))[0];
    }
    return view(row);
  });
}

export async function remove(userId, id) {
  await query('DELETE FROM addresses WHERE id=$1 AND user_id=$2', [Number(id) || 0, userId]);
  return { ok: true };
}

export async function setDefault(userId, id) {
  return tx(async (c) => {
    const cur = (await c.query('SELECT id FROM addresses WHERE id=$1 AND user_id=$2 FOR UPDATE', [Number(id) || 0, userId]))[0];
    if (!cur) throw new ApiError(404, 'not_found', 'Không có địa chỉ này');
    await c.query('UPDATE addresses SET is_default_sender=false WHERE user_id=$1 AND is_default_sender', [userId]);
    return view((await c.query('UPDATE addresses SET is_default_sender=true WHERE id=$1 RETURNING *', [cur.id]))[0]);
  });
}
