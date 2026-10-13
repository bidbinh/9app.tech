import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireMember, forbidden, isOwner, notFound } from '../auth.js';
import { cleanText, cleanMultiline, noLinks, noBanned, normKey, oneOf, searchTokens, likeEscape, uuidParam } from '../util.js';
import { post, BOARD_KINDS, notify, iso } from '../lib.js';

const POST_SELECT = `SELECT b.id, b.community_id, b.author_id, b.kind, b.title, b.description, b.location, b.status, b.removed_reason, b.created_at, b.expires_at,
    (b.expires_at > now()) AS live, a.name AS author_name, a.banned_at AS author_banned, a.left_at AS author_left,
    (SELECT count(*)::int FROM board_replies r WHERE r.post_id = b.id AND r.deleted_at IS NULL) AS reply_count
  FROM board_posts b JOIN members a ON a.id = b.author_id`;

const effStatus = (b) => (b.status === 'mo' && !b.live ? 'het_han' : b.status);

function postView(b, me) {
  return {
    id: b.id, communityId: b.community_id, kind: b.kind, title: b.title, description: b.description, location: b.location, status: effStatus(b),
    authorId: b.author_id, authorName: b.author_name, isMine: b.author_id === me.id, replyCount: b.reply_count,
    createdAt: iso(b.created_at), expiresAt: iso(b.expires_at),
    removedReason: b.status === 'go' && (b.author_id === me.id || isOwner(me)) ? b.removed_reason : undefined,
  };
}

async function loadPost(q, ctx, rawId, { lock = false } = {}) {
  const id = uuidParam(rawId);
  const b = (await q(`${POST_SELECT} WHERE b.id=$1 ${lock ? 'FOR UPDATE OF b' : ''}`, [id]))[0];
  if (!b) throw notFound();
  const me = await requireMember(q, ctx, b.community_id);
  const mineOrOwner = b.author_id === me.id || isOwner(me);
  if (!mineOrOwner && (b.author_banned || b.author_left || !['mo', 'xong'].includes(effStatus(b)))) throw notFound();
  return { b, me };
}

export function boardRoutes(app) {
  app.route('GET', '/api/c/:cid/board', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, cid);
    const where = ['b.community_id = $1', 'a.banned_at IS NULL', 'a.left_at IS NULL'];
    const params = [cid];
    const add = (sql, val) => { params.push(val); where.push(sql.replace('?', '$' + params.length)); };
    if (ctx.query.kind) add('b.kind = ?', oneOf(ctx.query.kind, Object.keys(BOARD_KINDS), 'Loại bài'));
    if (ctx.query.view === 'mine') add('b.author_id = ?', me.id);
    else if (ctx.query.view === 'done') where.push("b.status = 'xong'");
    else where.push("b.status = 'mo' AND b.expires_at > now()");
    const toks = searchTokens(ctx.query.q || '');
    if (String(ctx.query.q || '').trim() && !toks.length) where.push('false');
    for (const t of toks) add("b.search LIKE ? ESCAPE '\\'", '%' + likeEscape(t) + '%');
    const rows = await query(`${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC, b.id LIMIT 60`, params);
    return { items: rows.map((b) => postView(b, me)) };
  });

  post(app, '/api/c/:cid/board', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const b = ctx.body;
    const kind = oneOf(b.kind, Object.keys(BOARD_KINDS), 'Loại bài');
    const title = noLinks(cleanText(b.title, { max: 80, min: 3, field: 'Tiêu đề' }), 'Tiêu đề');
    const description = noLinks(cleanMultiline(b.description ?? '', { max: 600, field: 'Mô tả' }), 'Mô tả');
    const location = noLinks(cleanText(b.location ?? '', { max: 80, field: 'Nơi' }), 'Nơi');
    noBanned(title, description);
    const search = normKey([title, description, location].join(' ')).slice(0, 1500);
    return tx(async (c) => {
      const me = await requireMember(c.query, ctx, cid);
      await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE', [me.id]);
      const n = (await c.query("SELECT count(*)::int n FROM board_posts WHERE author_id=$1 AND created_at > now() - interval '24 hours'", [me.id]))[0].n;
      if (n >= config.maxPostsPerDay) throw new ApiError(429, 'too_many', `Mỗi ngày đăng tối đa ${config.maxPostsPerDay} bài lên bảng tin`);
      const r = (await c.query(
        'INSERT INTO board_posts(community_id, author_id, kind, title, description, location, search) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [cid, me.id, kind, title, description, location, search]))[0];
      return { id: r.id };
    });
  }, { limit: 30, limitKey: 'mkboard' });

  app.route('GET', '/api/board/:id', async (ctx) => {
    const { b, me } = await loadPost(query, ctx, ctx.params.id);
    const replies = await query(
      `SELECT r.id, r.author_id, r.body, r.created_at, a.name FROM board_replies r JOIN members a ON a.id=r.author_id
        WHERE r.post_id=$1 AND r.deleted_at IS NULL AND a.banned_at IS NULL ORDER BY r.created_at, r.id LIMIT 200`, [b.id]);
    await query("UPDATE notifications SET read_at=now() WHERE member_id=$1 AND board_id=$2 AND read_at IS NULL", [me.id, b.id]);
    return {
      post: postView(b, me), canManage: isOwner(me) && b.author_id !== me.id,
      replies: replies.map((r) => ({ id: r.id, authorId: r.author_id, authorName: r.name, mine: r.author_id === me.id, body: r.body, createdAt: iso(r.created_at) })),
    };
  });

  post(app, '/api/board/:id/replies', async (ctx) => {
    const body = noLinks(cleanMultiline(ctx.body.body, { max: 300, min: 1, field: 'Bình luận' }), 'Bình luận');
    return tx(async (c) => {
      const { b, me } = await loadPost(c.query, ctx, ctx.params.id, { lock: true });
      if (b.status !== 'mo' || !b.live) throw new ApiError(409, 'closed', 'Bài này đã đóng');
      await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE', [me.id]);
      const hour = (await c.query("SELECT count(*)::int n FROM board_replies WHERE author_id=$1 AND created_at > now() - interval '1 hour'", [me.id]))[0].n;
      if (hour >= config.maxRepliesPerHour) throw new ApiError(429, 'too_many', 'Bạn bình luận khá nhiều trong một giờ qua, nghỉ một lát nhé');
      const total = (await c.query('SELECT count(*)::int n FROM board_replies WHERE post_id=$1', [b.id]))[0].n;
      if (total >= config.maxRepliesPerPost) throw new ApiError(409, 'full', 'Bài này đã có quá nhiều bình luận');
      const r = (await c.query('INSERT INTO board_replies(post_id, author_id, body) VALUES($1,$2,$3) RETURNING id, created_at', [b.id, me.id, body]))[0];
      if (b.author_id !== me.id) await notify(c, b.author_id, { type: 'reply', text: `${me.name} bình luận về "${b.title}": ${body.slice(0, 80)}`, boardId: b.id });
      return { id: r.id };
    });
  }, { limit: 40, limitKey: 'reply' });

  post(app, '/api/replies/:rid/delete', async (ctx) => {
    const rid = uuidParam(ctx.params.rid);
    return tx(async (c) => {
      const r = (await c.query('SELECT id, post_id, author_id FROM board_replies WHERE id=$1', [rid]))[0];
      if (!r) throw notFound();
      const { b, me } = await loadPost(c.query, ctx, r.post_id);
      if (r.author_id !== me.id && b.author_id !== me.id && !isOwner(me)) throw forbidden('Bạn không xóa được bình luận này');
      await c.query('UPDATE board_replies SET deleted_at=now() WHERE id=$1', [rid]);
      await c.query("UPDATE reports SET status='da_xu_ly' WHERE target_type='reply' AND target_id=$1 AND status='cho'", [rid]);
      return { ok: true };
    });
  });

  post(app, '/api/board/:id/close', async (ctx) => {
    return tx(async (c) => {
      const { b, me } = await loadPost(c.query, ctx, ctx.params.id, { lock: true });
      if (b.author_id !== me.id) throw forbidden('Chỉ người đăng mới đóng được bài này');
      if (b.status !== 'mo') throw new ApiError(409, 'closed', 'Bài đã đóng');
      await c.query("UPDATE board_posts SET status='xong' WHERE id=$1", [b.id]);
      return { ok: true };
    });
  });

  // người đăng xóa bài của mình, hoặc chủ cộng đồng gỡ bài
  post(app, '/api/board/:id/remove', async (ctx) => {
    const reason = cleanText(ctx.body.reason ?? '', { max: 200, field: 'Lý do' });
    return tx(async (c) => {
      const { b, me } = await loadPost(c.query, ctx, ctx.params.id, { lock: true });
      const own = b.author_id === me.id;
      if (!own && !isOwner(me)) throw forbidden('Bạn không gỡ được bài này');
      if (b.status === 'go') return { ok: true };
      const why = own ? 'Người đăng đã xóa' : (reason || 'Vi phạm quy tắc cộng đồng');
      await c.query("UPDATE board_posts SET status='go', removed_reason=$2 WHERE id=$1", [b.id, why]);
      await c.query("UPDATE reports SET status='da_xu_ly' WHERE target_type='board' AND target_id=$1 AND status='cho'", [b.id]);
      if (!own) await notify(c, b.author_id, { type: 'removed', text: `Bài "${b.title}" đã bị chủ cộng đồng gỡ: ${why}`, boardId: b.id });
      return { ok: true };
    });
  });
}
