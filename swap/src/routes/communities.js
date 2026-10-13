import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { ensureSession, requireSession, requireMember, forbidden, touch, isOwner, memberFor } from '../auth.js';
import { cleanText, noLinks, normKey, randomCode, INVITE_RE, uuidParam, oneOf } from '../util.js';
import { post as postIdem, COMMUNITY_KINDS, CATEGORIES, CONDITIONS, KINDS, BOARD_KINDS, iso, notify } from '../lib.js';

// tạo/vào cộng đồng cấp cookie mới nên không dùng Idempotency-Key (phát lại sẽ không có Set-Cookie)
const post = (app, p, h, o = {}) => app.route('POST', p, h, o);
const uniqueViolation = (e) => e && e.code === '23505';

// Rút khỏi mọi thứ đang mở của một thành viên (rời hoặc bị khóa): tin đang mở bị gỡ/hủy, tin họ đang được giữ trả về "mở"
export async function retireMember(c, member, { listingStatus, reason }) {
  const mine = await c.query("SELECT id, title, recipient_id FROM listings WHERE author_id=$1 AND status IN ('mo','giu') FOR UPDATE", [member.id]);
  for (const m of mine) {
    if (m.recipient_id) await notify(c, m.recipient_id, { type: 'cancelled', text: `Tin "${m.title}" không còn nữa vì người đăng đã rời hoặc bị khóa`, listingId: m.id });
  }
  if (mine.length) {
    const ids = mine.map((r) => r.id);
    await c.query('DELETE FROM listing_photos WHERE listing_id = ANY($1::uuid[])', [ids]);
    await c.query('UPDATE listings SET status=$2, recipient_id=NULL, removed_reason=$3, closed_at=now(), updated_at=now() WHERE id = ANY($1::uuid[])', [ids, listingStatus, reason]);
  }
  const held = await c.query("SELECT id, author_id, title FROM listings WHERE recipient_id=$1 AND status='giu' FOR UPDATE", [member.id]);
  for (const h of held) {
    await c.query("UPDATE listings SET status='mo', recipient_id=NULL, updated_at=now() WHERE id=$1", [h.id]);
    await notify(c, h.author_id, { type: 'released', text: `Người nhận "${h.title}" không còn trong cộng đồng, tin được mở lại`, listingId: h.id });
  }
  await c.query("UPDATE board_posts SET status='go', removed_reason=$2 WHERE author_id=$1 AND status='mo'", [member.id, reason]);
}

// Tiếp quản cộng đồng mồ côi: chủ vắng quá ownerAbsentDays ngày thì thành viên vào sớm nhất (còn hoạt động, không bị khóa) nhận quyền chủ
async function claimEligible(q, cid, me) {
  const owner = (await q("SELECT id, (last_seen_at < now() - ($2 || ' days')::interval) AS absent FROM members WHERE community_id=$1 AND role='chu' AND left_at IS NULL", [cid, String(config.ownerAbsentDays)]))[0];
  if (owner && !owner.absent) return false;
  const first = (await q("SELECT id FROM members WHERE community_id=$1 AND role<>'chu' AND left_at IS NULL AND banned_at IS NULL ORDER BY joined_at, seq LIMIT 1", [cid]))[0];
  return !!first && first.id === me.id;
}

export function communityRoutes(app) {
  app.route('GET', '/api/meta', async () => ({
    communityKinds: COMMUNITY_KINDS, kinds: KINDS, categories: CATEGORIES, conditions: CONDITIONS, boardKinds: BOARD_KINDS,
    limits: { photos: config.maxPhotosPerListing, listingDays: config.listingDays },
  }));

  // ---------- phiên hiện tại: các cộng đồng của tôi ----------
  app.route('GET', '/api/me', async (ctx) => {
    if (!ctx.sid) return { communities: [] };
    await touch(ctx);
    const rows = await query(
      `SELECT c.id, c.name, c.kind, c.invite_code, m.id AS member_id, m.name AS my_name, m.role, m.banned_at,
              (SELECT count(*)::int FROM members x WHERE x.community_id = c.id AND x.left_at IS NULL AND x.banned_at IS NULL) AS member_count,
              (SELECT count(*)::int FROM notifications n WHERE n.member_id = m.id AND n.read_at IS NULL) AS unread
         FROM members m JOIN phien p ON p.member_id = m.id JOIN communities c ON c.id = m.community_id
        WHERE p.token_hash = $1 AND m.left_at IS NULL ORDER BY m.joined_at DESC`, [ctx.sid]);
    return {
      communities: rows.map((r) => ({
        id: r.id, name: r.name, kind: r.kind, inviteCode: r.banned_at ? undefined : r.invite_code, memberId: r.member_id, myName: r.my_name, role: r.role,
        banned: !!r.banned_at, memberCount: r.member_count, unread: r.unread,
      })),
    };
  });

  // ---------- tạo cộng đồng ----------
  post(app, '/api/communities', async (ctx) => {
    const b = ctx.body;
    const name = noLinks(cleanText(b.name, { max: config.maxNameLen, min: 2, field: 'Tên cộng đồng' }), 'Tên cộng đồng');
    const kind = oneOf(b.kind ?? 'toa_nha', Object.keys(COMMUNITY_KINDS), 'Loại cộng đồng');
    const myName = noLinks(cleanText(b.myName, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' }), 'Tên của bạn');
    if (b.agree !== true) throw new ApiError(400, 'rules_required', 'Hãy đồng ý với quy tắc cộng đồng để tiếp tục');
    const sid = ensureSession(ctx);
    const made = (await query("SELECT count(*)::int n FROM communities WHERE created_by_hash=$1 AND created_at > now() - interval '24 hours'", [sid]))[0].n;
    if (made >= config.maxCommunitiesPerDay) throw new ApiError(429, 'too_many', `Mỗi ngày chỉ tạo được ${config.maxCommunitiesPerDay} cộng đồng, mai bạn tạo tiếp nhé`);
    const fromIp = (await query("SELECT count(*)::int n FROM communities WHERE created_ip=$1 AND created_at > now() - interval '1 hour'", [ctx.ip]))[0].n;
    if (fromIp >= config.maxCommunitiesPerIpHour) throw new ApiError(429, 'too_many', 'Từ mạng này đã tạo nhiều cộng đồng trong một giờ qua, thử lại sau nhé');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await tx(async (c) => {
          const t = (await c.query('INSERT INTO communities(name, kind, invite_code, created_by_hash, created_ip) VALUES($1,$2,$3,$4,$5) RETURNING id, invite_code', [name, kind, randomCode(10), sid, ctx.ip]))[0];
          const m = (await c.query("INSERT INTO members(community_id, name, role) VALUES($1,$2,'chu') RETURNING id", [t.id, myName]))[0];
          await c.query('INSERT INTO phien(token_hash, member_id) VALUES($1,$2)', [sid, m.id]);
          return { community: { id: t.id, name, kind, inviteCode: t.invite_code }, memberId: m.id };
        });
      } catch (e) { if (!uniqueViolation(e)) throw e; }
    }
    throw new ApiError(500, 'internal', 'Không tạo được mã mời, thử lại');
  }, { limit: 20, limitKey: 'mkcomm' });

  // ---------- vào bằng mã mời ----------
  const codeOf = (ctx) => {
    const c = String(ctx.params.code || '').toUpperCase();
    if (!INVITE_RE.test(c)) throw new ApiError(404, 'bad_code', 'Mã mời không đúng. Kiểm tra lại link hoặc hỏi người tạo cộng đồng mã mới.');
    return c;
  };

  app.route('GET', '/api/join/:code', async (ctx) => {
    const code = codeOf(ctx);
    const t = (await query(
      `SELECT c.id, c.name, c.kind, (SELECT count(*)::int FROM members m WHERE m.community_id = c.id AND m.left_at IS NULL AND m.banned_at IS NULL) AS n FROM communities c WHERE c.invite_code = $1`, [code]))[0];
    if (!t) throw new ApiError(404, 'bad_code', 'Mã mời không đúng hoặc đã được đổi. Hỏi người tạo cộng đồng để lấy link mới.');
    const mine = ctx.sid ? await memberFor(query, ctx.sid, t.id) : null;
    return { name: t.name, kind: t.kind, memberCount: t.n, full: t.n >= config.maxMembers, alreadyMember: !!mine && !mine.banned_at, banned: !!(mine && mine.banned_at), communityId: mine ? t.id : undefined };
  }, { limit: 40, limitKey: 'joinget' });

  post(app, '/api/join/:code', async (ctx) => {
    const code = codeOf(ctx);
    const name = noLinks(cleanText(ctx.body.name, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' }), 'Tên của bạn');
    if (ctx.body.agree !== true) throw new ApiError(400, 'rules_required', 'Hãy đồng ý với quy tắc cộng đồng để tiếp tục');
    const sid = ensureSession(ctx);
    return tx(async (c) => {
      const t = (await c.query('SELECT id, name FROM communities WHERE invite_code=$1 FOR UPDATE', [code]))[0];
      if (!t) throw new ApiError(404, 'bad_code', 'Mã mời không đúng hoặc đã được đổi. Hỏi người tạo cộng đồng để lấy link mới.');
      const mine = (await c.query(
        'SELECT m.id, m.banned_at FROM members m JOIN phien p ON p.member_id=m.id WHERE p.token_hash=$1 AND m.community_id=$2 AND m.left_at IS NULL', [sid, t.id]))[0];
      if (mine && mine.banned_at) throw new ApiError(403, 'banned', 'Bạn đã bị chủ cộng đồng khóa');
      if (mine) return { community: { id: t.id, name: t.name }, memberId: mine.id, already: true };
      const all = await c.query('SELECT name, banned_at FROM members WHERE community_id=$1 AND left_at IS NULL', [t.id]);
      if (all.filter((x) => !x.banned_at).length >= config.maxMembers) throw new ApiError(409, 'full', `Cộng đồng đã đủ ${config.maxMembers} người`);
      if (all.some((x) => normKey(x.name) === normKey(name))) throw new ApiError(409, 'name_taken', 'Trong cộng đồng đã có người tên này. Thêm họ hoặc chữ đệm (ví dụ "Lan P1203") để mọi người phân biệt nhé.');
      const m = (await c.query("INSERT INTO members(community_id, name, role) VALUES($1,$2,'thanh_vien') RETURNING id", [t.id, name]))[0];
      await c.query('INSERT INTO phien(token_hash, member_id) VALUES($1,$2)', [sid, m.id]);
      return { community: { id: t.id, name: t.name }, memberId: m.id };
    });
  }, { limit: 20, limitKey: 'joinpost' });

  // ---------- trang cộng đồng ----------
  app.route('GET', '/api/c/:cid', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    requireSession(ctx);
    const me = await requireMember(query, ctx, id, { allowBanned: true });
    await touch(ctx);
    const t = (await query('SELECT id, name, kind, invite_code FROM communities WHERE id=$1', [id]))[0];
    const counts = (await query(
      `SELECT (SELECT count(*)::int FROM listings l JOIN members a ON a.id=l.author_id WHERE l.community_id=$1 AND l.status IN ('mo','giu') AND l.expires_at > now() AND a.banned_at IS NULL AND a.left_at IS NULL) AS listings,
              (SELECT count(*)::int FROM board_posts b WHERE b.community_id=$1 AND b.status='mo' AND b.expires_at > now()) AS board,
              (SELECT count(*)::int FROM members x WHERE x.community_id=$1 AND x.left_at IS NULL AND x.banned_at IS NULL) AS members,
              (SELECT count(*)::int FROM reports r WHERE r.community_id=$1 AND r.status='cho') AS reports,
              (SELECT count(*)::int FROM notifications n WHERE n.member_id=$2 AND n.read_at IS NULL) AS unread`, [id, me.id]))[0];
    const owner = isOwner(me);
    const canClaimOwner = !owner && !me.banned_at && await claimEligible(query, id, me);
    return {
      canClaimOwner,
      community: { id: t.id, name: t.name, kind: t.kind, inviteCode: me.banned_at ? undefined : t.invite_code },
      me: { id: me.id, name: me.name, role: me.role, banned: !!me.banned_at },
      counts: { listings: counts.listings, board: counts.board, members: counts.members, unread: counts.unread, ...(owner ? { reports: counts.reports } : {}) },
    };
  });

  // ---------- chỉnh cộng đồng (chủ) ----------
  post(app, '/api/c/:cid', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    return tx(async (c) => {
      await c.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (!isOwner(me)) throw forbidden('Chỉ chủ cộng đồng mới sửa được thông tin cộng đồng');
      const b = ctx.body;
      if (b.name !== undefined) await c.query('UPDATE communities SET name=$2 WHERE id=$1', [id, noLinks(cleanText(b.name, { max: config.maxNameLen, min: 2, field: 'Tên cộng đồng' }), 'Tên cộng đồng')]);
      if (b.kind !== undefined) await c.query('UPDATE communities SET kind=$2 WHERE id=$1', [id, oneOf(b.kind, Object.keys(COMMUNITY_KINDS), 'Loại cộng đồng')]);
      return { ok: true };
    });
  });

  postIdem(app, '/api/c/:cid/claim-owner', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    return tx(async (c) => {
      await c.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (!(await claimEligible(c.query, id, me))) throw forbidden('Chưa đủ điều kiện tiếp quản: chủ cộng đồng còn hoạt động, hoặc bạn không phải thành viên lâu năm nhất');
      const old = await c.query("SELECT id FROM members WHERE community_id=$1 AND role='chu' AND left_at IS NULL FOR UPDATE", [id]);
      await c.query("UPDATE members SET role='thanh_vien' WHERE community_id=$1 AND role='chu'", [id]);
      await c.query("UPDATE members SET role='chu' WHERE id=$1", [me.id]);
      for (const o of old) await notify(c, o.id, { type: 'owner', text: `${me.name} đã tiếp quản quyền chủ cộng đồng vì bạn vắng lâu` });
      return { ok: true };
    });
  });

  post(app, '/api/c/:cid/rotate-code', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, id);
    if (!isOwner(me)) throw forbidden('Chỉ chủ cộng đồng mới đổi được mã mời');
    for (let i = 0; i < 5; i++) {
      try {
        const r = await query('UPDATE communities SET invite_code=$2 WHERE id=$1 RETURNING invite_code', [id, randomCode(10)]);
        return { inviteCode: r[0].invite_code };
      } catch (e) { if (!uniqueViolation(e)) throw e; }
    }
    throw new ApiError(500, 'internal', 'Không đổi được mã mời, thử lại');
  });

  // ---------- đổi tên hiển thị của tôi ----------
  post(app, '/api/c/:cid/me', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    return tx(async (c) => {
      await c.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      const name = noLinks(cleanText(ctx.body.name, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' }), 'Tên của bạn');
      const others = await c.query('SELECT name FROM members WHERE community_id=$1 AND left_at IS NULL AND id<>$2', [id, me.id]);
      if (others.some((x) => normKey(x.name) === normKey(name))) throw new ApiError(409, 'name_taken', 'Trong cộng đồng đã có người tên này. Thêm họ hoặc chữ đệm nhé.');
      await c.query('UPDATE members SET name=$2 WHERE id=$1', [me.id, name]);
      return { ok: true };
    });
  });

  // ---------- thành viên ----------
  app.route('GET', '/api/c/:cid/members', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    const me = await requireMember(query, ctx, id);
    const owner = isOwner(me);
    const rows = await query(
      `SELECT m.id, m.name, m.role, m.banned_at, m.joined_at, m.last_seen_at,
              (SELECT count(*)::int FROM listings x WHERE x.author_id=m.id AND x.status='xong' AND x.recipient_id IS NOT NULL AND x.kind='tang') AS tang,
              (SELECT count(*)::int FROM listings x WHERE x.author_id=m.id AND x.status='xong' AND x.recipient_id IS NOT NULL AND x.kind<>'tang') AS other
         FROM members m WHERE m.community_id=$1 AND m.left_at IS NULL AND ($2 OR m.banned_at IS NULL) ORDER BY (m.role='chu') DESC, m.joined_at, m.seq`, [id, owner]);
    return {
      members: rows.map((m) => ({
        id: m.id, name: m.name, role: m.role, isMe: m.id === me.id, tang: m.tang, other: m.other,
        ...(owner ? { banned: !!m.banned_at, joinedAt: iso(m.joined_at), lastSeenAt: iso(m.last_seen_at) } : {}),
      })),
    };
  });

  async function ownerAction(ctx, fn) {
    const cid = uuidParam(ctx.params.cid);
    const mid = uuidParam(ctx.params.mid);
    return tx(async (c) => {
      await c.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [cid]);
      const me = await requireMember(c.query, ctx, cid);
      if (!isOwner(me)) throw forbidden('Chỉ chủ cộng đồng mới làm được việc này');
      const target = (await c.query('SELECT * FROM members WHERE id=$1 AND community_id=$2 AND left_at IS NULL FOR UPDATE', [mid, cid]))[0];
      if (!target) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên');
      if (target.id === me.id) throw new ApiError(409, 'self', 'Không áp dụng cho chính bạn');
      return fn(c, me, target, cid);
    });
  }

  post(app, '/api/c/:cid/members/:mid/ban', (ctx) => ownerAction(ctx, async (c, me, target) => {
    if (!target.banned_at) {
      await c.query('UPDATE members SET banned_at=now() WHERE id=$1', [target.id]);
      await retireMember(c, target, { listingStatus: 'go', reason: 'Thành viên đã bị chủ cộng đồng khóa' });
      await c.query("UPDATE reports SET status='da_xu_ly' WHERE target_member_id=$1 AND status='cho'", [target.id]);
    }
    return { ok: true };
  }));
  post(app, '/api/c/:cid/members/:mid/unban', (ctx) => ownerAction(ctx, async (c, me, target) => {
    await c.query('UPDATE members SET banned_at=NULL WHERE id=$1', [target.id]);
    return { ok: true };
  }));
  post(app, '/api/c/:cid/members/:mid/make-owner', (ctx) => ownerAction(ctx, async (c, me, target) => {
    if (target.banned_at) throw new ApiError(409, 'banned', 'Không chuyển quyền cho người đang bị khóa');
    await c.query("UPDATE members SET role='thanh_vien' WHERE id=$1", [me.id]);
    await c.query("UPDATE members SET role='chu' WHERE id=$1", [target.id]);
    await notify(c, target.id, { type: 'owner', text: `${me.name} đã chuyển quyền chủ cộng đồng cho bạn` });
    return { ok: true };
  }));

  // ---------- rời, xóa cộng đồng ----------
  post(app, '/api/c/:cid/leave', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    return tx(async (c) => {
      const me = await requireMember(c.query, ctx, id);
      await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE', [me.id]);
      if (isOwner(me)) throw new ApiError(409, 'owner_cannot_leave', 'Chủ cộng đồng cần chuyển quyền cho người khác (hoặc xóa cộng đồng) trước khi rời');
      await c.query('UPDATE members SET left_at=now() WHERE id=$1', [me.id]);
      await retireMember(c, me, { listingStatus: 'huy', reason: 'Người đăng đã rời cộng đồng' });
      return { ok: true };
    });
  });

  post(app, '/api/c/:cid/delete', async (ctx) => {
    const id = uuidParam(ctx.params.cid);
    return tx(async (c) => {
      await c.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (!isOwner(me)) throw forbidden('Chỉ chủ cộng đồng mới xóa được cộng đồng');
      if (ctx.body.confirm !== true) throw new ApiError(400, 'confirm_required', 'Cần xác nhận xóa');
      await c.query('DELETE FROM communities WHERE id=$1', [id]);
      return { ok: true };
    });
  });
}
