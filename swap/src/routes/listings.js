import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireMember, forbidden, isOwner, notFound } from '../auth.js';
import { cleanText, cleanMultiline, intIn, oneOf, normKey, noLinks, noBanned, searchTokens, likeEscape, uuidParam } from '../util.js';
import {
  post, KINDS, CATEGORIES, CONDITIONS, LISTING_SELECT, listingView, loadListing, effStatus, live, notify, iso,
} from '../lib.js';

// Kiểm tra và làm sạch nội dung tin; base = giá trị cũ khi sửa (chỉ ghi đè trường được gửi)
function readFields(b, base = {}) {
  const v = { ...base };
  if (b.kind !== undefined || !base.kind) v.kind = oneOf(b.kind, Object.keys(KINDS), 'Kiểu tin');
  if (b.title !== undefined || !base.title) v.title = noLinks(cleanText(b.title, { max: 80, min: 3, field: 'Tiêu đề' }), 'Tiêu đề');
  if (b.description !== undefined) v.description = noLinks(cleanMultiline(b.description, { max: 1000, field: 'Mô tả' }), 'Mô tả');
  if (v.description === undefined) v.description = '';
  if (b.category !== undefined || !base.category) v.category = oneOf(b.category, Object.keys(CATEGORIES), 'Danh mục');
  if (b.condition !== undefined || !base.condition) v.condition = oneOf(b.condition, Object.keys(CONDITIONS), 'Tình trạng');
  if (b.swapWish !== undefined) v.swap_wish = noLinks(cleanText(b.swapWish, { max: 120, field: 'Muốn đổi lấy' }), 'Muốn đổi lấy');
  if (v.swap_wish === undefined) v.swap_wish = '';
  if (b.location !== undefined || !base.location) v.location = noLinks(cleanText(b.location, { max: 80, min: 2, field: 'Vị trí nhận' }), 'Vị trí nhận');
  if (b.pickupTime !== undefined) v.pickup_time = noLinks(cleanText(b.pickupTime, { max: 80, field: 'Giờ nhận' }), 'Giờ nhận');
  if (v.pickup_time === undefined) v.pickup_time = '';
  if (v.kind === 'ban') {
    if (b.price !== undefined || v.price === undefined || v.price === null) v.price = intIn(b.price, { min: 0, max: 1_000_000_000, field: 'Giá' });
  } else v.price = null;
  if (v.kind !== 'doi') v.swap_wish = '';
  if (v.category === 'thuc_pham' && v.kind !== 'tang') throw new ApiError(400, 'invalid_input', 'Đồ ăn chỉ được đăng để tặng', { field: 'Kiểu tin' });
  noBanned(v.title, v.description, v.swap_wish);
  v.search = normKey([v.title, v.description, CATEGORIES[v.category], v.location, v.swap_wish].join(' ')).slice(0, 2500);
  return v;
}

export function listingRoutes(app) {
  // ---------- danh sách ----------
  app.route('GET', '/api/c/:cid/listings', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, cid);
    const q = ctx.query;
    const where = ['l.community_id = $1'];
    const params = [cid];
    const add = (sql, val) => { params.push(val); where.push(sql.replace('?', '$' + params.length)); };
    const view = q.view === 'done' ? 'done' : q.view === 'mine' ? 'mine' : 'open';
    if (view === 'mine') add('l.author_id = ?', me.id);
    else {
      where.push('a.banned_at IS NULL AND a.left_at IS NULL');
      if (view === 'done') where.push("l.status = 'xong'");
      else where.push("l.status IN ('mo','giu') AND l.expires_at > now()");
    }
    if (q.kind) add('l.kind = ?', oneOf(q.kind, Object.keys(KINDS), 'Kiểu tin'));
    if (q.category) add('l.category = ?', oneOf(q.category, Object.keys(CATEGORIES), 'Danh mục'));
    if (q.condition) add('l.condition = ?', oneOf(q.condition, Object.keys(CONDITIONS), 'Tình trạng'));
    const toks = searchTokens(q.q || '');
    if (String(q.q || '').trim() && !toks.length) where.push('false');
    for (const t of toks) add("l.search LIKE ? ESCAPE '\\'", '%' + likeEscape(t) + '%');
    const limit = 20;
    const offset = Math.min(2000, Math.max(0, Number.parseInt(q.offset, 10) || 0));
    const rows = await query(
      `${LISTING_SELECT} WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC, l.id LIMIT ${limit + 1} OFFSET ${offset}`, params);
    return { items: rows.slice(0, limit).map((r) => listingView(r, me)), hasMore: rows.length > limit, next: offset + limit };
  });

  // ---------- đăng tin ----------
  post(app, '/api/c/:cid/listings', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const f = readFields(ctx.body);
    return tx(async (c) => {
      const me = await requireMember(c.query, ctx, cid);
      // khóa hàng thành viên để hai yêu cầu đồng thời không vượt hạn mức
      await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE', [me.id]);
      const day = (await c.query("SELECT count(*)::int n FROM listings WHERE author_id=$1 AND created_at > now() - interval '24 hours'", [me.id]))[0].n;
      if (day >= config.maxListingsPerDay) throw new ApiError(429, 'too_many', `Mỗi ngày đăng tối đa ${config.maxListingsPerDay} tin, mai bạn đăng tiếp nhé`);
      const open = (await c.query("SELECT count(*)::int n FROM listings WHERE author_id=$1 AND status IN ('mo','giu')", [me.id]))[0].n;
      if (open >= config.maxOpenListingsPerMember) throw new ApiError(429, 'too_many', `Bạn đang có ${open} tin mở, hãy đóng bớt tin cũ trước khi đăng thêm`);
      const r = (await c.query(
        `INSERT INTO listings(community_id, author_id, kind, title, description, category, condition, price, swap_wish, location, pickup_time, search)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [cid, me.id, f.kind, f.title, f.description, f.category, f.condition, f.price, f.swap_wish, f.location, f.pickup_time, f.search]))[0];
      return { id: r.id };
    });
  }, { limit: 30, limitKey: 'mklisting' });

  // ---------- chi tiết ----------
  app.route('GET', '/api/listings/:id', async (ctx) => {
    const { l, me } = await loadListing(query, ctx, ctx.params.id);
    const out = { listing: listingView(l, me), canManage: isOwner(me) && l.author_id !== me.id };
    if (l.author_id === me.id) {
      out.threads = (await query(
        `SELECT t.id, t.member_id, m.name, t.last_msg_at, (t.last_msg_at > t.author_read_at) AS unread,
                (SELECT body FROM messages WHERE thread_id=t.id ORDER BY id DESC LIMIT 1) AS last_body, (m.banned_at IS NOT NULL OR m.left_at IS NOT NULL) AS gone
           FROM threads t JOIN members m ON m.id=t.member_id WHERE t.listing_id=$1 AND t.closed_at IS NULL ORDER BY t.last_msg_at DESC`, [l.id]))
        .map((t) => ({ id: t.id, memberId: t.member_id, name: t.name, lastMsgAt: iso(t.last_msg_at), unread: t.unread, lastBody: (t.last_body || '').slice(0, 80), gone: t.gone, isRecipient: t.member_id === l.recipient_id }));
      if (l.recipient_id) out.recipientName = (await query('SELECT name FROM members WHERE id=$1', [l.recipient_id]))[0]?.name || null;
    } else {
      const t = (await query('SELECT id, (last_msg_at > member_read_at) AS unread FROM threads WHERE listing_id=$1 AND member_id=$2', [l.id, me.id]))[0];
      if (t) out.myThread = { id: t.id, unread: t.unread };
    }
    return out;
  });

  // ---------- sửa (người đăng) ----------
  post(app, '/api/listings/:id', async (ctx) => {
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới sửa được tin này');
      if (!live(l)) throw new ApiError(409, 'closed', 'Tin đã đóng nên không sửa được');
      const f = readFields(ctx.body, {
        kind: l.kind, title: l.title, description: l.description, category: l.category, condition: l.condition,
        price: l.price === null ? null : Number(l.price), swap_wish: l.swap_wish, location: l.location, pickup_time: l.pickup_time,
      });
      await c.query(
        `UPDATE listings SET kind=$2, title=$3, description=$4, category=$5, condition=$6, price=$7, swap_wish=$8, location=$9, pickup_time=$10, search=$11, updated_at=now() WHERE id=$1`,
        [l.id, f.kind, f.title, f.description, f.category, f.condition, f.price, f.swap_wish, f.location, f.pickup_time, f.search]);
      return { ok: true };
    });
  });

  // ---------- rút tin (người đăng) ----------
  post(app, '/api/listings/:id/cancel', async (ctx) => {
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới rút được tin này');
      if (!['mo', 'giu', 'het_han'].includes(l.status)) throw new ApiError(409, 'closed', 'Tin đã đóng');
      await c.query("UPDATE listings SET status='huy', recipient_id=NULL, closed_at=now(), updated_at=now() WHERE id=$1", [l.id]);
      await c.query('DELETE FROM listing_photos WHERE listing_id=$1', [l.id]);
      if (l.status === 'giu' && l.recipient_id) await notify(c, l.recipient_id, { type: 'cancelled', text: `${me.name} đã rút tin "${l.title}"`, listingId: l.id });
      return { ok: true };
    });
  });

  // ---------- gia hạn (người đăng) ----------
  post(app, '/api/listings/:id/renew', async (ctx) => {
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới gia hạn được tin này');
      if (!['mo', 'giu', 'het_han'].includes(l.status)) throw new ApiError(409, 'closed', 'Tin đã đóng nên không gia hạn được');
      if (l.renew_count >= config.maxRenewals) throw new ApiError(409, 'max_renew', `Mỗi tin gia hạn tối đa ${config.maxRenewals} lần, hãy đăng lại tin mới`);
      const next = l.status === 'het_han' ? (l.recipient_id ? 'giu' : 'mo') : l.status;
      await c.query(`UPDATE listings SET status=$2, expires_at = now() + interval '${config.listingDays} days', renew_count = renew_count + 1, closed_at=NULL, updated_at=now() WHERE id=$1`, [l.id, next]);
      return { ok: true };
    });
  });

  // ---------- chọn người nhận / trả lại / từ chối / hoàn tất ----------
  post(app, '/api/listings/:id/choose', async (ctx) => {
    const tid = uuidParam(ctx.body.threadId);
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới chọn được người nhận');
      if (!live(l)) throw new ApiError(409, 'closed', 'Tin đã đóng hoặc hết hạn');
      const t = (await c.query(
        `SELECT t.id, t.member_id, t.closed_at, m.name, m.banned_at, m.left_at FROM threads t JOIN members m ON m.id=t.member_id WHERE t.id=$1 AND t.listing_id=$2`, [tid, l.id]))[0];
      if (!t) throw notFound();
      if (t.banned_at || t.left_at) throw new ApiError(409, 'gone', 'Người này không còn trong cộng đồng');
      if (t.closed_at) throw new ApiError(409, 'closed', 'Cuộc trao đổi này đã đóng');
      if (l.recipient_id === t.member_id) return { ok: true };
      // đã giữ cho ai thì tin được gia hạn thêm để hai bên kịp hẹn nhận đồ
      await c.query("UPDATE listings SET status='giu', recipient_id=$2, expires_at = GREATEST(expires_at, now() + ($3 || ' days')::interval), updated_at=now() WHERE id=$1", [l.id, t.member_id, String(config.grantDaysAfterChoose)]);
      if (l.recipient_id) await notify(c, l.recipient_id, { type: 'released', text: `${me.name} đã chọn người khác nhận "${l.title}"`, listingId: l.id });
      await notify(c, t.member_id, { type: 'chosen', text: `${me.name} đã chọn bạn nhận "${l.title}". Hãy nhắn để hẹn giờ lấy.`, listingId: l.id, threadId: t.id });
      return { ok: true, recipientName: t.name };
    });
  });

  post(app, '/api/listings/:id/release', async (ctx) => {
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới trả tin về trạng thái mở');
      if (l.status !== 'giu') throw new ApiError(409, 'bad_state', 'Tin chưa chọn người nhận');
      await c.query("UPDATE listings SET status='mo', recipient_id=NULL, updated_at=now() WHERE id=$1", [l.id]);
      if (l.recipient_id) await notify(c, l.recipient_id, { type: 'released', text: `${me.name} đã mở lại tin "${l.title}"`, listingId: l.id });
      return { ok: true };
    });
  });

  post(app, '/api/listings/:id/decline', async (ctx) => {
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.status !== 'giu' || l.recipient_id !== me.id) throw forbidden('Bạn không phải người đang được chọn nhận');
      await c.query("UPDATE listings SET status='mo', recipient_id=NULL, updated_at=now() WHERE id=$1", [l.id]);
      await notify(c, l.author_id, { type: 'declined', text: `${me.name} không nhận "${l.title}" nữa, tin được mở lại`, listingId: l.id });
      return { ok: true };
    });
  });

  post(app, '/api/listings/:id/complete', async (ctx) => {
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (l.author_id !== me.id) throw forbidden('Chỉ người đăng mới đánh dấu hoàn tất');
      if (!(['mo', 'giu'].includes(l.status) || (l.status === 'het_han' && l.recipient_id))) throw new ApiError(409, 'closed', 'Tin đã đóng');
      await c.query("UPDATE listings SET status='xong', closed_at=now(), updated_at=now() WHERE id=$1", [l.id]);
      if (l.recipient_id) {
        const verb = { tang: 'tặng', doi: 'trao đổi', ban: 'bán' }[l.kind];
        await notify(c, l.recipient_id, { type: 'done', text: `${me.name} đã đánh dấu ${verb} xong "${l.title}"`, listingId: l.id });
      }
      return { ok: true, credited: !!l.recipient_id };
    });
  });

  // ---------- chủ cộng đồng gỡ tin ----------
  post(app, '/api/listings/:id/remove', async (ctx) => {
    const reason = cleanText(ctx.body.reason ?? '', { max: 200, field: 'Lý do' }) || 'Vi phạm quy tắc cộng đồng';
    return tx(async (c) => {
      const { l, me } = await loadListing(c.query, ctx, ctx.params.id, { lock: true });
      if (!isOwner(me)) throw forbidden('Chỉ chủ cộng đồng mới gỡ được tin của người khác');
      if (['go', 'huy'].includes(l.status)) return { ok: true };
      await c.query("UPDATE listings SET status='go', recipient_id=NULL, removed_reason=$2, closed_at=now(), updated_at=now() WHERE id=$1", [l.id, reason]);
      await c.query('DELETE FROM listing_photos WHERE listing_id=$1', [l.id]);
      await c.query("UPDATE reports SET status='da_xu_ly' WHERE target_type='listing' AND target_id=$1 AND status='cho'", [l.id]);
      if (l.author_id !== me.id) await notify(c, l.author_id, { type: 'removed', text: `Tin "${l.title}" đã bị chủ cộng đồng gỡ: ${reason}`, listingId: l.id });
      if (l.recipient_id && l.recipient_id !== l.author_id) await notify(c, l.recipient_id, { type: 'cancelled', text: `Tin "${l.title}" đã bị gỡ`, listingId: l.id });
      return { ok: true };
    });
  });
}
