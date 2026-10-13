import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireMember, forbidden, isOwner, notFound } from '../auth.js';
import { cleanText, oneOf, uuidParam } from '../util.js';
import { post, notify, iso } from '../lib.js';
import { retireMember } from './communities.js';

const TYPES = ['listing', 'message', 'board', 'reply'];

export function moderationRoutes(app) {
  // ---------- báo cáo ----------
  post(app, '/api/c/:cid/reports', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const type = oneOf(ctx.body.type, TYPES, 'Loại nội dung');
    const reason = cleanText(ctx.body.reason, { max: 200, min: 3, field: 'Lý do' });
    const rawId = String(ctx.body.id ?? '');
    return tx(async (c) => {
      const me = await requireMember(c.query, ctx, cid);
      await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE', [me.id]);
      const n = (await c.query("SELECT count(*)::int n FROM reports WHERE reporter_id=$1 AND created_at > now() - interval '24 hours'", [me.id]))[0].n;
      if (n >= config.maxReportsPerDay) throw new ApiError(429, 'too_many', 'Hôm nay bạn đã gửi nhiều báo cáo, chủ cộng đồng sẽ xem xét');
      let targetId; let targetMember; let snapshot;
      if (type === 'listing') {
        targetId = uuidParam(rawId);
        const l = (await c.query('SELECT id, author_id, title, description FROM listings WHERE id=$1 AND community_id=$2', [targetId, cid]))[0];
        if (!l || l.author_id === me.id) throw notFound();
        targetMember = l.author_id; snapshot = `${l.title}\n${l.description}`;
      } else if (type === 'board') {
        targetId = uuidParam(rawId);
        const b = (await c.query('SELECT id, author_id, title, description FROM board_posts WHERE id=$1 AND community_id=$2', [targetId, cid]))[0];
        if (!b || b.author_id === me.id) throw notFound();
        targetMember = b.author_id; snapshot = `${b.title}\n${b.description}`;
      } else if (type === 'reply') {
        targetId = uuidParam(rawId);
        const r = (await c.query('SELECT r.id, r.author_id, r.body FROM board_replies r JOIN board_posts b ON b.id=r.post_id WHERE r.id=$1 AND b.community_id=$2 AND r.deleted_at IS NULL', [targetId, cid]))[0];
        if (!r || r.author_id === me.id) throw notFound();
        targetMember = r.author_id; snapshot = r.body;
      } else {
        if (!/^\d{1,15}$/.test(rawId)) throw notFound();
        targetId = rawId;
        // chỉ người trong cuộc (người đăng hoặc người quan tâm của luồng) mới thấy và báo cáo được tin nhắn
        const m = (await c.query(
          `SELECT m.id, m.sender_id, m.body, t.member_id, l.author_id FROM messages m JOIN threads t ON t.id=m.thread_id JOIN listings l ON l.id=t.listing_id
            WHERE m.id=$1 AND l.community_id=$2`, [targetId, cid]))[0];
        if (!m || m.sender_id === me.id || (m.member_id !== me.id && m.author_id !== me.id)) throw notFound();
        targetMember = m.sender_id; snapshot = m.body;
      }
      const ins = await c.query(
        `INSERT INTO reports(community_id, reporter_id, target_type, target_id, target_member_id, reason, snapshot)
         VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`, [cid, me.id, type, targetId, targetMember, reason, snapshot.slice(0, 1200)]);
      if (!ins.length) throw new ApiError(409, 'duplicate', 'Bạn đã báo cáo mục này rồi');
      const owners = await c.query("SELECT id FROM members WHERE community_id=$1 AND role='chu' AND left_at IS NULL", [cid]);
      for (const o of owners) {
        if (o.id !== me.id) await notify(c, o.id, { type: 'report', text: 'Có báo cáo mới cần chủ cộng đồng xem xét' });
      }
      return { ok: true };
    });
  }, { limit: 20, limitKey: 'report' });

  app.route('GET', '/api/c/:cid/reports', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, cid);
    if (!isOwner(me)) throw forbidden('Chỉ chủ cộng đồng xem được hàng chờ báo cáo');
    const rows = await query(
      `SELECT r.id, r.target_type, r.target_id, r.target_member_id, r.reason, r.snapshot, r.status, r.created_at, rp.name AS reporter_name, tm.name AS target_name, tm.banned_at AS target_banned,
              CASE r.target_type WHEN 'listing' THEN (SELECT l.status FROM listings l WHERE l.id::text=r.target_id)
                                 WHEN 'board' THEN (SELECT b.status FROM board_posts b WHERE b.id::text=r.target_id) END AS target_status
         FROM reports r JOIN members rp ON rp.id=r.reporter_id LEFT JOIN members tm ON tm.id=r.target_member_id
        WHERE r.community_id=$1 AND ($2 OR r.status='cho') ORDER BY (r.status='cho') DESC, r.created_at DESC LIMIT 100`, [cid, ctx.query.all === '1']);
    return {
      items: rows.map((r) => ({
        id: r.id, type: r.target_type, targetId: r.target_id, reason: r.reason, snapshot: r.snapshot, status: r.status, createdAt: iso(r.created_at),
        reporterName: r.reporter_name, targetMemberId: r.target_member_id, targetName: r.target_name, targetBanned: !!r.target_banned, targetStatus: r.target_status || null,
      })),
    };
  });

  // dismiss: bỏ qua; remove: gỡ nội dung bị báo; ban: khóa người bị báo
  post(app, '/api/reports/:rid/action', async (ctx) => {
    const rid = uuidParam(ctx.params.rid);
    const action = oneOf(ctx.body.action, ['dismiss', 'remove', 'ban'], 'Hành động');
    return tx(async (c) => {
      const rep = (await c.query('SELECT * FROM reports WHERE id=$1', [rid]))[0];
      if (!rep) throw notFound();
      const me = await requireMember(c.query, ctx, rep.community_id);
      if (!isOwner(me)) throw forbidden('Chỉ chủ cộng đồng xử lý được báo cáo');
      if (action === 'dismiss') {
        await c.query("UPDATE reports SET status='bo_qua' WHERE id=$1", [rid]);
        return { ok: true };
      }
      if (action === 'remove') {
        if (rep.target_type === 'listing') {
          const l = (await c.query('SELECT id, author_id, title, status, recipient_id FROM listings WHERE id=$1 FOR UPDATE', [rep.target_id]))[0];
          if (l && !['go', 'huy'].includes(l.status)) {
            await c.query("UPDATE listings SET status='go', recipient_id=NULL, removed_reason='Bị báo cáo và đã được chủ cộng đồng gỡ', closed_at=now(), updated_at=now() WHERE id=$1", [l.id]);
            await c.query('DELETE FROM listing_photos WHERE listing_id=$1', [l.id]);
            await notify(c, l.author_id, { type: 'removed', text: `Tin "${l.title}" đã bị chủ cộng đồng gỡ do bị báo cáo`, listingId: l.id });
            if (l.recipient_id) await notify(c, l.recipient_id, { type: 'cancelled', text: `Tin "${l.title}" đã bị gỡ`, listingId: l.id });
          }
        } else if (rep.target_type === 'board') {
          const b = (await c.query('SELECT id, author_id, title, status FROM board_posts WHERE id=$1 FOR UPDATE', [rep.target_id]))[0];
          if (b && b.status !== 'go') {
            await c.query("UPDATE board_posts SET status='go', removed_reason='Bị báo cáo và đã được chủ cộng đồng gỡ' WHERE id=$1", [b.id]);
            await notify(c, b.author_id, { type: 'removed', text: `Bài "${b.title}" đã bị chủ cộng đồng gỡ do bị báo cáo`, boardId: b.id });
          }
        } else if (rep.target_type === 'reply') {
          await c.query('UPDATE board_replies SET deleted_at=now() WHERE id=$1', [rep.target_id]);
        } else {
          await c.query("UPDATE messages SET body='[Tin nhắn đã bị chủ cộng đồng gỡ]' WHERE id=$1", [rep.target_id]);
        }
        await c.query("UPDATE reports SET status='da_xu_ly' WHERE community_id=$1 AND target_type=$2 AND target_id=$3 AND status='cho'", [rep.community_id, rep.target_type, rep.target_id]);
        return { ok: true };
      }
      // ban
      const target = rep.target_member_id ? (await c.query('SELECT * FROM members WHERE id=$1 AND community_id=$2 FOR UPDATE', [rep.target_member_id, rep.community_id]))[0] : null;
      if (!target) throw new ApiError(404, 'not_found', 'Người bị báo cáo không còn trong cộng đồng');
      if (target.id === me.id) throw new ApiError(409, 'self', 'Không thể khóa chính bạn');
      if (!target.banned_at) {
        await c.query('UPDATE members SET banned_at=now() WHERE id=$1', [target.id]);
        await retireMember(c, target, { listingStatus: 'go', reason: 'Thành viên đã bị chủ cộng đồng khóa' });
      }
      await c.query("UPDATE reports SET status='da_xu_ly' WHERE target_member_id=$1 AND status='cho'", [target.id]);
      return { ok: true };
    });
  });

  // ---------- thông báo trong app (thăm dò) ----------
  app.route('GET', '/api/c/:cid/poll', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, cid, { allowBanned: true });
    const rows = await query('SELECT id, type, text, listing_id, thread_id, board_id, created_at, read_at FROM notifications WHERE member_id=$1 ORDER BY id DESC LIMIT 40', [me.id]);
    const unread = (await query('SELECT count(*)::int n FROM notifications WHERE member_id=$1 AND read_at IS NULL', [me.id]))[0].n;
    return {
      unread,
      items: rows.map((n) => ({ id: n.id, type: n.type, text: n.text, listingId: n.listing_id, threadId: n.thread_id, boardId: n.board_id, createdAt: iso(n.created_at), read: !!n.read_at })),
    };
  });

  post(app, '/api/c/:cid/notifications/read', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, cid, { allowBanned: true });
    if (ctx.body.id !== undefined) {
      const id = Number.parseInt(ctx.body.id, 10);
      if (!Number.isSafeInteger(id)) throw new ApiError(400, 'invalid_input', 'Thông báo không hợp lệ');
      await query('UPDATE notifications SET read_at=now() WHERE id=$1 AND member_id=$2 AND read_at IS NULL', [id, me.id]);
    } else {
      await query('UPDATE notifications SET read_at=now() WHERE member_id=$1 AND read_at IS NULL', [me.id]);
    }
    return { ok: true };
  });

  // ---------- của tôi: tin tôi đăng và tin tôi quan tâm ----------
  app.route('GET', '/api/c/:cid/interests', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, cid);
    const rows = await query(
      `SELECT t.id AS thread_id, (t.last_msg_at > t.member_read_at) AS unread, l.id AS listing_id, l.title, l.kind, l.status, l.recipient_id, (l.expires_at > now()) AS live,
              a.name AS author_name, (SELECT p.id::text FROM listing_photos p WHERE p.listing_id=l.id ORDER BY p.pos LIMIT 1) AS photo
         FROM threads t JOIN listings l ON l.id=t.listing_id JOIN members a ON a.id=l.author_id
        WHERE t.member_id=$1 AND t.closed_at IS NULL AND l.community_id=$2 AND l.status IN ('mo','giu','xong') AND a.banned_at IS NULL AND a.left_at IS NULL ORDER BY t.last_msg_at DESC LIMIT 50`, [me.id, cid]);
    return {
      items: rows.map((r) => ({
        threadId: r.thread_id, unread: r.unread, listingId: r.listing_id, title: r.title, kind: r.kind,
        status: (r.status === 'mo' || r.status === 'giu') && !r.live ? 'het_han' : r.status, authorName: r.author_name, photo: r.photo, iAmRecipient: r.recipient_id === me.id,
      })),
    };
  });
}
