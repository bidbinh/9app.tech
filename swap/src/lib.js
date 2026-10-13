// Phần dùng chung của các tuyến: danh mục, truy vấn tin, thông báo, quyền xem
import { query } from './db.js';
import { ApiError } from './errors.js';
import { requireMember, notFound } from './auth.js';
import { withIdem } from './idem.js';
import { uuidParam } from './util.js';

export const post = (app, p, h, o = {}) => app.route('POST', p, withIdem(h), o);

export const COMMUNITY_KINDS = { cong_ty: 'Công ty', toa_nha: 'Tòa nhà, chung cư', khu_pho: 'Khu phố, xóm' };
export const KINDS = { tang: 'Tặng', doi: 'Trao đổi', ban: 'Bán' };
export const CATEGORIES = {
  gia_dung: 'Đồ gia dụng', tre_em: 'Trẻ em', sach: 'Sách, văn phòng phẩm', thoi_trang: 'Thời trang', dien_tu: 'Điện tử',
  noi_that: 'Nội thất', cay_canh: 'Cây cảnh', the_thao: 'Thể thao, sức khỏe', thuc_pham: 'Đồ ăn sắp hết hạn tặng', khac: 'Khác',
};
export const CONDITIONS = { moi: 'Mới', nhu_moi: 'Như mới', tot: 'Còn tốt', dung_duoc: 'Dùng được', can_sua: 'Cần sửa' };
export const BOARD_KINDS = { that_lac: 'Thất lạc', nhat_duoc: 'Nhặt được', can_tim: 'Cần tìm' };

export const iso = (d) => (d ? new Date(d).toISOString() : null);

// ---------- thông báo ----------
// c: { query } (giao dịch) hoặc { query } thường. Tin nhắn dồn chung một thông báo chưa đọc cho mỗi luồng.
export async function notify(c, memberId, { type, text, listingId = null, threadId = null, boardId = null }) {
  if (!memberId) return;
  if (type === 'message' || type === 'reply') {
    const key = type === 'message' ? 'thread_id' : 'board_id';
    const ref = type === 'message' ? threadId : boardId;
    const upd = await c.query(
      `UPDATE notifications SET text=$3, created_at=now() WHERE id = (
         SELECT id FROM notifications WHERE member_id=$1 AND type=$2 AND ${key}=$4 AND read_at IS NULL ORDER BY id DESC LIMIT 1) RETURNING id`,
      [memberId, type, text, ref]);
    if (upd.length) return;
  }
  await c.query('INSERT INTO notifications(member_id, type, listing_id, thread_id, board_id, text) VALUES($1,$2,$3,$4,$5,$6)', [memberId, type, listingId, threadId, boardId, text.slice(0, 200)]);
}

// ---------- tin đăng ----------
const STATS = `LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE x.kind='tang')::int AS tang, count(*) FILTER (WHERE x.kind='doi')::int AS doi, count(*) FILTER (WHERE x.kind='ban')::int AS ban
      FROM listings x WHERE x.author_id = l.author_id AND x.status='xong' AND x.recipient_id IS NOT NULL) st ON true`;
export const LISTING_SELECT = `SELECT l.id, l.community_id, l.author_id, l.kind, l.title, l.description, l.category, l.condition, l.price, l.swap_wish,
    l.location, l.pickup_time, l.status, l.recipient_id, l.created_at, l.expires_at, l.renew_count, l.removed_reason, l.closed_at,
    (l.expires_at > now()) AS live, a.name AS author_name, a.banned_at AS author_banned, a.left_at AS author_left, st.tang, st.doi, st.ban,
    ARRAY(SELECT p.id::text FROM listing_photos p WHERE p.listing_id = l.id ORDER BY p.pos) AS photo_ids,
    (SELECT count(*)::int FROM threads t WHERE t.listing_id = l.id) AS thread_count,
    (SELECT count(*)::int FROM threads t WHERE t.listing_id = l.id AND t.last_msg_at > t.author_read_at) AS unread_threads
  FROM listings l JOIN members a ON a.id = l.author_id ${STATS}`;

export const effStatus = (l) => ((l.status === 'mo' || l.status === 'giu') && !l.live ? 'het_han' : l.status);

// Ai được thấy tin: người đăng và chủ cộng đồng thấy mọi trạng thái; người khác chỉ thấy tin đang mở, đã giữ và đã xong
export function canSee(l, me) {
  if (l.author_id === me.id || me.role === 'chu') return true;
  if (l.author_banned || l.author_left) return false;
  const s = effStatus(l);
  if (s === 'het_han' && l.recipient_id === me.id) return true; // người được chọn vẫn thấy tin để hẹn nhận đồ
  return s === 'mo' || s === 'giu' || s === 'xong';
}

export function listingView(l, me) {
  const mine = l.author_id === me.id;
  const out = {
    id: l.id, communityId: l.community_id, kind: l.kind, title: l.title, description: l.description, category: l.category, condition: l.condition,
    price: l.price === null ? null : Number(l.price), swapWish: l.swap_wish, location: l.location, pickupTime: l.pickup_time,
    status: effStatus(l), authorId: l.author_id, authorName: l.author_name, isMine: mine,
    stats: { tang: l.tang || 0, doi: l.doi || 0, ban: l.ban || 0 },
    createdAt: iso(l.created_at), expiresAt: iso(l.expires_at), photos: l.photo_ids || [],
    removedReason: l.status === 'go' && (mine || me.role === 'chu') ? l.removed_reason : undefined,
  };
  if (mine) {
    out.threadCount = l.thread_count; out.unreadThreads = l.unread_threads; out.renewCount = l.renew_count; out.canRenew = l.renew_count < 3;
    out.recipientId = l.recipient_id || null;
  } else {
    out.iAmRecipient = l.recipient_id === me.id;
  }
  return out;
}

// Nạp tin kèm kiểm tra thành viên TRONG cộng đồng của tin. lock: khóa hàng để đổi trạng thái an toàn.
export async function loadListing(q, ctx, rawId, { lock = false, anyStatus = false, allowBanned = false } = {}) {
  const id = uuidParam(rawId);
  const row = (await q(`${LISTING_SELECT} WHERE l.id = $1 ${lock ? 'FOR UPDATE OF l' : ''}`, [id]))[0];
  if (!row) throw notFound();
  const me = await requireMember(q, ctx, row.community_id, { allowBanned });
  if (!anyStatus && !canSee(row, me)) throw notFound();
  if (!anyStatus && me.banned_at) throw new ApiError(403, 'banned', 'Bạn đã bị khóa');
  return { l: row, me };
}

// Dọn ảnh của tin (khi rút, gỡ, khóa người đăng)
export async function dropPhotos(c, where, params) {
  await c.query(`DELETE FROM listing_photos WHERE listing_id IN (SELECT id FROM listings WHERE ${where})`, params);
}

export const live = (l) => (l.status === 'mo' || l.status === 'giu') && l.live;
// còn nhắn tin được: tin còn hạn, hoặc đã chọn người nhận (kể cả hết hạn, để hai bên hẹn giờ lấy)
export const canChat = (l) => live(l) || (!!l.recipient_id && (l.status === 'giu' || l.status === 'het_han'));
