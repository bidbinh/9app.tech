import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireMember, forbidden, notFound } from '../auth.js';
import { cleanMultiline, noLinks, uuidParam } from '../util.js';
import { post, LISTING_SELECT, canSee, effStatus, live, canChat, notify, iso } from '../lib.js';

const msgView = (m, meId) => ({ id: m.id, senderId: m.sender_id, mine: m.sender_id === meId, body: m.body, createdAt: iso(m.created_at) });

// Nạp luồng + tin; chỉ người đăng và người quan tâm của đúng luồng này được vào (người khác, kể cả chủ cộng đồng: 404)
async function loadThread(q, ctx, rawId, { lock = false } = {}) {
  const tid = uuidParam(rawId);
  const t = (await q('SELECT * FROM threads WHERE id=$1', [tid]))[0];
  if (!t) throw notFound();
  const l = (await q(`${LISTING_SELECT} WHERE l.id=$1 ${lock ? 'FOR UPDATE OF l' : ''}`, [t.listing_id]))[0];
  if (!l) throw notFound();
  const me = await requireMember(q, ctx, l.community_id);
  const isAuthor = l.author_id === me.id;
  if (!isAuthor && t.member_id !== me.id) throw notFound();
  if (!isAuthor && !canSee(l, me)) throw notFound();
  return { t, l, me, isAuthor };
}

export function threadRoutes(app) {
  // ---------- bấm "Quan tâm" (mở luồng riêng với người đăng) ----------
  post(app, '/api/listings/:id/threads', async (ctx) => {
    const lid = uuidParam(ctx.params.id);
    const first = ctx.body.body === undefined || ctx.body.body === '' ? null : noLinks(cleanMultiline(ctx.body.body, { max: 500, min: 1, field: 'Tin nhắn' }), 'Tin nhắn');
    return tx(async (c) => {
      const l = (await c.query(`${LISTING_SELECT} WHERE l.id=$1 FOR UPDATE OF l`, [lid]))[0];
      if (!l) throw notFound();
      const me = await requireMember(c.query, ctx, l.community_id);
      if (!canSee(l, me)) throw notFound();
      if (l.author_id === me.id) throw new ApiError(409, 'own_listing', 'Đây là tin của bạn');
      let t = (await c.query('SELECT * FROM threads WHERE listing_id=$1 AND member_id=$2', [l.id, me.id]))[0];
      if (t && t.closed_at) throw new ApiError(409, 'closed', 'Người đăng đã đóng cuộc trao đổi này');
      if (!t) {
        if (!live(l) || l.status !== 'mo') throw new ApiError(409, 'closed', 'Tin này đã có người nhận hoặc đã đóng');
        const n = (await c.query('SELECT count(*)::int n FROM threads WHERE listing_id=$1 AND closed_at IS NULL', [l.id]))[0].n;
        if (n >= config.maxThreadsPerListing) throw new ApiError(409, 'busy', 'Tin này đã có quá nhiều người quan tâm, hãy thử lại sau');
        t = (await c.query('INSERT INTO threads(listing_id, member_id, author_read_at) VALUES($1,$2,\'epoch\') RETURNING *', [l.id, me.id]))[0];
        await notify(c, l.author_id, { type: 'interest', text: `${me.name} quan tâm "${l.title}"`, listingId: l.id, threadId: t.id });
      }
      if (first) await insertMessage(c, { t, l, me, isAuthor: false, body: first });
      return { threadId: t.id };
    });
  }, { limit: 40, limitKey: 'mkthread' });

  // ---------- đọc luồng (đồng thời đánh dấu đã đọc) ----------
  app.route('GET', '/api/threads/:id', async (ctx) => {
    const { t, l, me, isAuthor } = await loadThread(query, ctx, ctx.params.id);
    const after = /^\d{1,15}$/.test(ctx.query.after || '') ? ctx.query.after : '0';
    const msgs = await query('SELECT * FROM messages WHERE thread_id=$1 AND id > $2 ORDER BY id LIMIT 200', [t.id, after]);
    await query(`UPDATE threads SET ${isAuthor ? 'author_read_at' : 'member_read_at'} = now() WHERE id=$1`, [t.id]);
    await query("UPDATE notifications SET read_at=now() WHERE member_id=$1 AND thread_id=$2 AND read_at IS NULL AND type IN ('message','interest','chosen')", [me.id, t.id]);
    const other = (await query('SELECT id, name, banned_at, left_at FROM members WHERE id=$1', [isAuthor ? t.member_id : l.author_id]))[0];
    return {
      thread: { id: t.id, listingId: l.id },
      listing: { id: l.id, communityId: l.community_id, title: l.title, kind: l.kind, status: effStatus(l), isMine: isAuthor, photo: (l.photo_ids || [])[0] || null, iAmRecipient: l.recipient_id === me.id, threadRecipient: l.recipient_id === t.member_id },
      other: { id: other.id, name: other.name, gone: !!(other.banned_at || other.left_at) },
      closed: !!t.closed_at,
      canSend: canChat(l) && !t.closed_at && !other.banned_at && !other.left_at && (isAuthor || !l.recipient_id || l.recipient_id === me.id),
      messages: msgs.map((m) => msgView(m, me.id)),
    };
  });

  async function insertMessage(c, { t, l, me, isAuthor, body }) {
    if (t.closed_at) throw new ApiError(409, 'closed', 'Cuộc trao đổi này đã đóng');
    if (!canChat(l)) throw new ApiError(409, 'closed', 'Tin đã đóng nên không nhắn thêm được');
    const other = (await c.query('SELECT id, banned_at, left_at FROM members WHERE id=$1', [isAuthor ? t.member_id : l.author_id]))[0];
    if (!other || other.banned_at || other.left_at) throw new ApiError(409, 'gone', 'Người này không còn trong cộng đồng');
    if (l.recipient_id && !isAuthor && l.recipient_id !== me.id) throw new ApiError(409, 'closed', 'Tin này đã có người nhận');
    await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE', [me.id]);
    const hour = (await c.query("SELECT count(*)::int n FROM messages WHERE sender_id=$1 AND created_at > now() - interval '1 hour'", [me.id]))[0].n;
    if (hour >= config.maxMessagesPerHour) throw new ApiError(429, 'too_many', 'Bạn nhắn khá nhiều trong một giờ qua, nghỉ một lát rồi nhắn tiếp nhé');
    const total = (await c.query('SELECT count(*)::int n FROM messages WHERE thread_id=$1', [t.id]))[0].n;
    if (total >= config.maxMessagesPerThread) throw new ApiError(409, 'thread_full', 'Cuộc trao đổi này đã quá dài, hãy hẹn gặp trực tiếp');
    const m = (await c.query('INSERT INTO messages(thread_id, sender_id, body) VALUES($1,$2,$3) RETURNING *', [t.id, me.id, body]))[0];
    await c.query(`UPDATE threads SET last_msg_at=now(), ${isAuthor ? 'author_read_at' : 'member_read_at'}=now() WHERE id=$1`, [t.id]);
    await notify(c, other.id, { type: 'message', text: `${me.name} nhắn về "${l.title}": ${body.replace(/\s+/g, ' ').slice(0, 80)}`, listingId: l.id, threadId: t.id });
    return m;
  }

  // người đăng đóng/ẩn luồng của một người quan tâm (không đóng được luồng của người đang được chọn nhận)
  post(app, '/api/threads/:id/close', async (ctx) => {
    return tx(async (c) => {
      const x = await loadThread(c.query, ctx, ctx.params.id, { lock: true });
      if (!x.isAuthor) throw forbidden('Chỉ người đăng mới đóng được cuộc trao đổi này');
      if (x.l.recipient_id === x.t.member_id && ['giu', 'het_han'].includes(x.l.status)) throw new ApiError(409, 'recipient', 'Đây là người đang được chọn nhận. Hãy mở lại tin trước khi đóng.');
      await c.query('UPDATE threads SET closed_at = COALESCE(closed_at, now()) WHERE id=$1', [x.t.id]);
      return { ok: true };
    });
  });

  post(app, '/api/threads/:id/messages', async (ctx) => {
    const body = noLinks(cleanMultiline(ctx.body.body, { max: 500, min: 1, field: 'Tin nhắn' }), 'Tin nhắn');
    return tx(async (c) => {
      const x = await loadThread(c.query, ctx, ctx.params.id, { lock: true });
      const m = await insertMessage(c, { ...x, body });
      return { message: msgView(m, x.me.id) };
    });
  }, { limit: 60, limitKey: 'msg' });
}
